# TradeLab — estructura del proyecto

```
/ (raíz del repo)
  render.yaml           ← Blueprint de Render (PostgreSQL + Web Service)
  bot-app/              ← EL PROYECTO PRINCIPAL. npm install AQUÍ.
    server.js             (servidor con login por código de un solo uso)
    auth/login.html       (pantalla de inicio de sesión)
    auth/admin.html       (panel administrativo: crear cuentas / códigos)
    public/home.html      (Home — avatar con las iniciales del usuario)
    public/options.html   (Options → tarjeta "Bot Builder" a la app real)
    public/assets/sim/    (js + imágenes de home/options)
    src/...               (app real del bot)
    DEPLOY.md             ← guía paso a paso de Render + PostgreSQL
    LEEME.md              ← detalle del fix de nav
  README.md             ← este archivo
```

## Cómo funciona el acceso

1. En `/admin` (con `ADMIN_PASSWORD`) creas una cuenta: nombre, teléfono e
   iniciales. Se genera un código de 6 dígitos.
2. La persona abre el sitio, ve `/login`, escribe el código y entra a
   `home.html` con sus iniciales en el avatar.
3. El código queda marcado como usado: no sirve una segunda vez, y en ese
   dispositivo la pantalla de login ya no vuelve a salir.
4. Todo el bot-app (`home.html`, `options.html`, app React, assets) solo se
   sirve con sesión válida.

Las cuentas se guardan en PostgreSQL (`DATABASE_URL`). Sin esa variable
(pruebas locales) se usan en `bot-app/data/db.json`.

## Correr localmente

```bash
cd bot-app
npm install
npm run build
npm start        # http://localhost:4003  (admin local: admin123)
```

## Desplegar en Render

Ver `bot-app/DEPLOY.md`.
