import 'dotenv/config'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resend } from 'resend'

const app = express()
const port = 3001
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadDir = path.join(__dirname, 'comprobantes')
const dbDir = path.join(__dirname, 'db')
const usersDbPath = path.join(dbDir, 'users.json')
const ordersDbPath = path.join(dbDir, 'orders.json')
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim()

fs.mkdirSync(uploadDir, { recursive: true })
fs.mkdirSync(dbDir, { recursive: true })

const ensureJsonFile = (filePath, defaultValue) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8')
  }
}

const readJsonFile = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8')
    return fallback
  }
}

const writeJsonFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

ensureJsonFile(usersDbPath, { users: [] })
ensureJsonFile(ordersDbPath, { orders: [] })

const readUsersDb = () => readJsonFile(usersDbPath, { users: [] })
const writeUsersDb = (data) => writeJsonFile(usersDbPath, data)
const readOrdersDb = () => readJsonFile(ordersDbPath, { orders: [] })
const writeOrdersDb = (data) => writeJsonFile(ordersDbPath, data)

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex')

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDir)
  },
  filename: (req, file, callback) => {
    const timestamp = Date.now()
    const originalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const extension = path.extname(originalName)
    const baseName = path.basename(originalName, extension)
    callback(null, `${timestamp}-${baseName}${extension}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']

    if (allowed.includes(file.mimetype)) {
      callback(null, true)
      return
    }

    callback(new Error('Tipo de archivo no permitido. Usa PNG, JPG o PDF.'))
  },
})

const checkoutRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Se alcanzó el límite temporal de pedidos. Inténtalo más tarde.' },
})

app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API funcionando' })
})

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nombre, correo y clave son obligatorios.' })
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: 'La clave debe tener al menos 6 caracteres.' })
  }

  const db = readUsersDb()
  const normalizedEmail = String(email).trim().toLowerCase()

  if (db.users.some((user) => user.email === normalizedEmail)) {
    return res.status(409).json({ message: 'Ya existe una cuenta registrada con ese correo.' })
  }

  const newUser = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(String(password)),
    createdAt: new Date().toISOString(),
  }

  db.users.push(newUser)
  writeUsersDb(db)

  return res.status(201).json({
    success: true,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    },
  })
})

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Debes ingresar correo y clave.' })
  }

  const db = readUsersDb()
  const normalizedEmail = String(email).trim().toLowerCase()
  const user = db.users.find((item) => item.email === normalizedEmail)

  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas.' })
  }

  const providedHash = hashPassword(String(password))

  if (user.passwordHash !== providedHash) {
    return res.status(401).json({ message: 'Credenciales inválidas.' })
  }

  return res.status(200).json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  })
})

app.post('/api/checkout', checkoutRateLimit, (req, res, next) => {
  if (!resend || !resendFromEmail) {
    return res.status(503).json({
      message: 'El correo de pedidos no está configurado. Revisa RESEND_API_KEY y RESEND_FROM_EMAIL en .env.',
    })
  }

  next()
}, upload.single('comprobante'), async (req, res) => {
  const {
    paymentMethod,
    nombre,
    telefono,
    cedula,
    recipientEmail,
    acceptedTerms,
    acceptedDeliveryTerms,
    items,
  } = req.body

  if (!['pagomovil', 'binance'].includes(paymentMethod)) {
    return res.status(400).json({ message: 'Selecciona un método de pago válido.' })
  }

  const email = String(recipientEmail ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Ingresa un correo válido para recibir la confirmación.' })
  }

  if (acceptedTerms !== 'true' || acceptedDeliveryTerms !== 'true') {
    return res.status(400).json({ message: 'Debes aceptar los términos de compra y entrega.' })
  }

  const customerName = String(nombre ?? '').trim().slice(0, 120)
  const customerPhone = String(telefono ?? '').trim().slice(0, 40)
  const customerId = String(cedula ?? '').trim().slice(0, 40)

  if (!customerName || !customerPhone || (paymentMethod === 'pagomovil' && !customerId)) {
    return res.status(400).json({ message: 'Completa tus datos de contacto para continuar.' })
  }

  if (paymentMethod === 'pagomovil' && !req.file) {
    return res.status(400).json({ message: 'Debes subir el comprobante de PagoMóvil.' })
  }

  let parsedItems
  try {
    parsedItems = JSON.parse(items ?? '[]')
  } catch {
    return res.status(400).json({ message: 'No se pudo leer el contenido del carrito.' })
  }

  if (!Array.isArray(parsedItems) || parsedItems.length === 0 || parsedItems.length > 30) {
    return res.status(400).json({ message: 'El carrito está vacío o contiene demasiados productos.' })
  }

  const orderItems = []
  for (const item of parsedItems) {
    const itemName = typeof item?.name === 'string' ? item.name.trim().slice(0, 120) : ''
    const quantity = Number(item?.quantity)
    const price = Number(item?.price)

    if (!itemName || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !Number.isFinite(price) || price < 0 || price > 100000) {
      return res.status(400).json({ message: 'El carrito contiene un producto inválido.' })
    }

    orderItems.push({ name: itemName, quantity, price })
  }

  const comprobante = req.file
    ? path.relative(__dirname, req.file.path).replace(/\\/g, '/')
    : null
  const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const order = {
    reference: crypto.randomUUID().slice(0, 8).toUpperCase(),
    recipientEmail: email,
    nombre: customerName,
    telefono: customerPhone,
    cedula: paymentMethod === 'pagomovil' ? customerId : null,
    paymentMethod,
    items: orderItems,
    total,
    comprobante,
    acceptedTerms: true,
    acceptedDeliveryTerms: true,
    paymentStatus: 'pending_verification',
    emailStatus: 'pending',
    createdAt: new Date().toISOString(),
  }

  const ordersDb = readOrdersDb()
  ordersDb.orders.push(order)
  writeOrdersDb(ordersDb)

  const itemSummary = orderItems
    .map((item) => `- ${item.name} x${item.quantity}: $${(item.price * item.quantity).toFixed(2)}`)
    .join('\n')

  try {
    const { data, error } = await resend.emails.send({
      from: resendFromEmail,
      to: email,
      subject: `IgamesPG | Recibimos su pedido ${order.reference}`,
      text: [
        'IgamesPG.',
        '',
        'Recibimos su pedido, en breve confirmamos su pago para su entrega.',
        '',
        `Referencia: ${order.reference}`,
        `Método de pago: ${paymentMethod === 'pagomovil' ? 'PagoMóvil' : 'Binance Pay'}`,
        '',
        'Resumen del pedido:',
        itemSummary,
        `Total: $${total.toFixed(2)}`,
        '',
        'El pago será verificado antes de confirmar la entrega.',
        '',
        'IgamesPG',
      ].join('\n'),
    })

    if (error) throw error

    order.emailStatus = 'sent'
    order.resendEmailId = data?.id ?? null
  } catch (error) {
    order.emailStatus = 'failed'
    console.error(`No se pudo enviar el correo del pedido ${order.reference}:`, error.message)
  }

  writeOrdersDb(ordersDb)

  const emailSent = order.emailStatus === 'sent'
  const message = emailSent
    ? `IgamesPG: recibimos su pedido. En breve confirmamos su pago para la entrega. Enviamos el correo a ${email}. Referencia: ${order.reference}.`
    : `Recibimos el pedido ${order.reference}, pero no se pudo enviar el correo. Conserva esta referencia y comunícate con IgamesPG.`

  console.log(`Pedido ${order.reference} registrado; correo ${order.emailStatus}.`)

  return res.status(201).json({
    success: true,
    emailSent,
    recipientEmail: email,
    orderReference: order.reference,
    message,
  })
})

app.listen(port, () => {
  console.log(`Servidor de pagos en http://localhost:${port}`)
  console.log('Autenticación local activa: registro e inicio de sesión.')
})
