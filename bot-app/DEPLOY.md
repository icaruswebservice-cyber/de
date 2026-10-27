# Desplegar en Render (con login por código + PostgreSQL)

El proyecto ya NO es un Static Site. Ahora son dos piezas en Render:

1. **PostgreSQL** (base de datos aparte) → guarda las cuentas y los códigos.
2. **Web Service de Node** (`bot-app/server.js`) → sirve el bot-app solo a
   quien inició sesión con su código de 6 dígitos.

Estructura del repo (tal cual se sube a GitHub):

```
/                      ← raíz del repo
  render.yaml          ← Blueprint opcional (crea BD + servicio de una vez)
  README.md
  bot-app/             ← Root Directory del servicio en Render
    server.js
    auth/login.html
    auth/admin.html
    public/ src/ package.json ...
```

## 1. Crear la base de datos PostgreSQL

Render → **New + → Postgres**

| Campo | Valor |
|---|---|
| Name | `tradelab-db` |
| Database | `tradelab` |
| User | `tradelab` |
| Region | la misma que usarás para el Web Service (ej. Oregon) |
| PostgreSQL Version | la que viene por defecto |
| Plan | Free (o uno de pago si quieres que no expire) |

**Create Database**. Cuando quede en *Available*, entra a la base de datos →
**Connections** → copia **Internal Database URL** (empieza por
`postgresql://` y el host NO tiene `.render.com`).

No necesitas crear tablas: `server.js` crea la tabla `accounts` solo al
arrancar.

## 2. Crear el Web Service

Render → **New + → Web Service** → conecta el repo de GitHub.

| Campo | Valor |
|---|---|
| Name | `tradelab-bot` (o el que quieras) |
| Language / Runtime | `Node` |
| Branch | `main` |
| Region | **la misma** de la base de datos |
| Root Directory | `bot-app` |
| Build Command | `npm install && npm run build` |
| Start Command | `node server.js` |
| Instance Type | Free |

### Environment Variables (en la misma pantalla o luego en *Environment*)

| Key | Value |
|---|---|
| `DATABASE_URL` | la **Internal Database URL** del paso 1 |
| `ADMIN_PASSWORD` | tu contraseña para entrar a `/admin` |
| `SESSION_SECRET` | botón **Generate** (o una cadena larga aleatoria). No la cambies después: si cambia, todos los usuarios quedan fuera y sus códigos ya están usados. |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_DERIV_APP_ID` | tu app_id de Deriv |
| `NEXT_PUBLIC_DERIV_APP_NAME` | `Dreiv Vot` |
| `NEXT_PUBLIC_DERIV_ENV` | `production` |
| `NEXT_PUBLIC_DERIV_REFERRAL_LINK` | tu link (o vacío) |
| `NEXT_PUBLIC_DERIV_OAUTH_SCOPES` | `trade` |

**Create Web Service**. En los *Logs* debes ver:

```
[server] Login: /login   ·   Admin: /admin   ·   Base de datos: PostgreSQL
```

No agregues reglas de *Redirects/Rewrites*: eso era del Static Site; ahora
`server.js` se encarga de todo.

## 3. Usarlo

- `https://TU-SERVICIO.onrender.com/admin` → panel: crear cuentas y copiar códigos.
- `https://TU-SERVICIO.onrender.com/` → la primera vez pide el código;
  después entra directo a Home.

## Alternativa: Blueprint

Render → **New + → Blueprint** → elige el repo. Lee `render.yaml` (raíz del
repo) y crea la base de datos y el servicio ya conectados; solo te pide
`ADMIN_PASSWORD`, `NEXT_PUBLIC_DERIV_APP_ID` y `NEXT_PUBLIC_DERIV_REFERRAL_LINK`.

## Importante: tu propio `app_id` de Deriv

En https://developers.deriv.com registra como **redirect URI** la URL que
Render le dé al servicio (ej. `https://tradelab-bot.onrender.com`). Si no
coincide exactamente, el login de Deriv dentro del bot falla en producción.

## Probar en tu PC

```bash
cd bot-app
npm install
npm run build
npm start
```

Sin `DATABASE_URL` usa un archivo local `bot-app/data/db.json` y la
contraseña de admin `admin123`. Para usar tu Postgres de Render desde tu PC,
crea `bot-app/.env.server` con la **External Database URL**:

```
DATABASE_URL=postgresql://...render.com/tradelab
ADMIN_PASSWORD=tu_clave
```

`npm run dev` sigue sirviendo para desarrollar la app, pero sin login.
