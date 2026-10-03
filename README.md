# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Confirmaciones de pedidos con Resend

1. Crea una API key en Resend y verifica el dominio que usarás como remitente.
2. Copia las variables `RESEND_API_KEY` y `RESEND_FROM_EMAIL` de `.env.example` a tu `.env` local. Usa una dirección del dominio verificado, por ejemplo `IgamesPG <pedidos@tudominio.com>`.
3. Reinicia `npm run dev` para que el servidor cargue las variables.

El checkout propone el correo de la cuenta y permite cambiarlo. Al recibir el pedido, el servidor lo registra en `db/orders.json` y envía una confirmación; el pago queda pendiente de verificación manual. Si Resend no está configurado, el checkout no acepta el pedido. Los comprobantes y el registro local de pedidos se excluyen de Git.
