import fs from 'node:fs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAF', 'base64')
const form = new FormData()
form.append('paymentMethod', 'pagomovil')
form.append('nombre', 'Usuario')
form.append('telefono', '04227180870')
form.append('cedula', '33335146')
form.append('items', JSON.stringify([{ id: 'demo', name: 'Demo', quantity: 1, price: 10 }]))
form.append('comprobante', new Blob([png], { type: 'image/png' }), 'comprobante.png')

const res = await fetch('http://localhost:3001/api/checkout', {
  method: 'POST',
  body: form,
})

const text = await res.text()
console.log('STATUS', res.status)
console.log(text)
console.log('FILES', fs.readdirSync('comprobantes'))
