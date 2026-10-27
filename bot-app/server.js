/*
 * TradeLab — servidor de acceso seguro para bot-app
 * ------------------------------------------------------------------
 * Sirve la build de producción (dist/) PERO solamente a quien tenga una
 * sesión válida. Sin sesión, cualquier página redirige a /login.
 *
 *  - /login        → pantalla de inicio de sesión con código de 6 dígitos.
 *                    Si ya hay sesión válida, redirige a /home.html (nunca
 *                    vuelve a mostrarse).
 *  - /admin        → panel administrativo (protegido con ADMIN_PASSWORD):
 *                    crear cuentas, ver lista, copiar código, ver más info.
 *  - /api/...      → API usada por login.html, admin.html y home.html.
 *  - todo lo demás → archivos de dist/ (home.html, options.html, app React…)
 *                    únicamente con sesión válida.
 *
 * Cada código de 6 dígitos sirve UNA sola vez. Al usarse queda marcado
 * como "usado" y cualquier intento posterior es rechazado.
 *
 * Base de datos:
 *   - Con DATABASE_URL  → PostgreSQL (Render Postgres). Las cuentas quedan
 *                         guardadas de forma permanente. La tabla se crea sola.
 *   - Sin DATABASE_URL  → archivo local data/db.json (solo para pruebas en tu PC).
 *
 * Variables de entorno:
 *   PORT            Puerto (Render lo define solo). Por defecto 4003.
 *   DATABASE_URL    URL de PostgreSQL (en Render: "Internal Database URL").
 *   ADMIN_PASSWORD  Contraseña del panel /admin. OBLIGATORIA en Render.
 *   SESSION_SECRET  Clave para firmar las cookies de sesión. OBLIGATORIA en
 *                   Render (si cambia, todas las sesiones se cierran).
 *   DATA_DIR        Solo modo local: carpeta de db.json. Por defecto ./data.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env.server') });
} catch (_) {
    /* dotenv es opcional */
}

// ------------------------------------------------------------------ config
const PORT = Number(process.env.PORT) || 4003;
const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, 'dist');
const AUTH_DIR = path.join(ROOT, 'auth');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
const IS_RENDER = !!process.env.RENDER;
const IS_PROD = IS_RENDER || process.env.NODE_ENV === 'production';

const USER_COOKIE = 'tl_session';
const ADMIN_COOKIE = 'tl_admin';
const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 años: una sola vez y listo
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12; // 12 horas

if (!DATABASE_URL) fs.mkdirSync(DATA_DIR, { recursive: true });

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD && !IS_RENDER) {
    ADMIN_PASSWORD = 'admin123';
    console.warn('[auth] ADMIN_PASSWORD no definida → usando "admin123" (SOLO en local).');
}
if (!ADMIN_PASSWORD) {
    console.warn('[auth] ADMIN_PASSWORD no definida: el panel /admin queda bloqueado.');
}

const SESSION_SECRET = (() => {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (IS_RENDER) {
        // Sin SESSION_SECRET fijo, cada reinicio cerraría todas las sesiones y
        // (como el código es de un solo uso) nadie podría volver a entrar.
        console.error('[auth] Falta la variable SESSION_SECRET en Render. Agrégala en Environment.');
        process.exit(1);
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const secretFile = path.join(DATA_DIR, '.session-secret');
    try {
        return fs.readFileSync(secretFile, 'utf8').trim();
    } catch (_) {
        const s = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(secretFile, s, { mode: 0o600 });
        return s;
    }
})();

// ------------------------------------------------------------------ almacenamiento
// Ambas implementaciones exponen la misma interfaz asíncrona:
//   init(), list(), getById(id), create(data), redeem(code, info)
// redeem() marca el código como usado de forma ATÓMICA: si dos personas
// envían el mismo código a la vez, solo una entra.

function rowToAccount(r) {
    if (!r) return null;
    const iso = v => (v ? new Date(v).toISOString() : null);
    return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        initials: r.initials,
        code: r.code,
        createdAt: iso(r.created_at),
        usedAt: iso(r.used_at),
        usedFromIp: r.used_ip || null,
        usedUserAgent: r.used_user_agent || null,
    };
}

function createPgStore(url) {
    const { Pool } = require('pg');
    let host = '';
    try {
        host = new URL(url).hostname;
    } catch (_) {
        /* url inválida: pg mostrará el error */
    }
    // URL interna de Render (host sin puntos, ej. dpg-xxxx-a) → sin SSL.
    // URL externa (dpg-xxxx-a.oregon-postgres.render.com) → SSL obligatorio.
    const useSsl = process.env.PGSSL
        ? process.env.PGSSL !== 'false'
        : host.includes('.') && host !== '127.0.0.1' && host !== 'localhost';
    const pool = new Pool({
        connectionString: url,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        max: 5,
    });
    pool.on('error', err => console.error('[db] error en conexión inactiva:', err.message));

    return {
        kind: 'PostgreSQL',
        async init() {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS accounts (
                    id              UUID PRIMARY KEY,
                    name            TEXT NOT NULL,
                    phone           TEXT NOT NULL,
                    initials        TEXT NOT NULL,
                    code            CHAR(6) NOT NULL UNIQUE,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    used_at         TIMESTAMPTZ,
                    used_ip         TEXT,
                    used_user_agent TEXT
                )`);
        },
        async list() {
            const { rows } = await pool.query('SELECT * FROM accounts ORDER BY created_at DESC');
            return rows.map(rowToAccount);
        },
        async getById(id) {
            const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
            return rowToAccount(rows[0]);
        },
        async create({ name, phone, initials }) {
            for (let i = 0; i < 20; i++) {
                const code = randomCode();
                try {
                    const { rows } = await pool.query(
                        `INSERT INTO accounts (id, name, phone, initials, code)
                         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                        [crypto.randomUUID(), name, phone, initials, code]
                    );
                    return rowToAccount(rows[0]);
                } catch (err) {
                    if (err.code !== '23505') throw err; // 23505 = código repetido → reintenta
                }
            }
            throw new Error('No fue posible generar un código único');
        },
        async redeem(code, { ip, userAgent }) {
            const { rows } = await pool.query(
                `UPDATE accounts SET used_at = now(), used_ip = $2, used_user_agent = $3
                 WHERE code = $1 AND used_at IS NULL RETURNING *`,
                [code, ip, userAgent]
            );
            if (rows[0]) return { status: 'ok', account: rowToAccount(rows[0]) };
            const exists = await pool.query('SELECT 1 FROM accounts WHERE code = $1', [code]);
            return { status: exists.rowCount ? 'used' : 'not_found' };
        },
    };
}

function createFileStore(file) {
    let data = { accounts: [] };
    const save = () => {
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
        fs.renameSync(tmp, file);
    };
    return {
        kind: 'archivo local (' + file + ')',
        async init() {
            try {
                data = JSON.parse(fs.readFileSync(file, 'utf8'));
                if (!Array.isArray(data.accounts)) data.accounts = [];
            } catch (_) {
                data = { accounts: [] };
            }
        },
        async list() {
            return data.accounts.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        },
        async getById(id) {
            return data.accounts.find(a => a.id === id) || null;
        },
        async create({ name, phone, initials }) {
            const inUse = new Set(data.accounts.map(a => a.code));
            let code;
            do code = randomCode();
            while (inUse.has(code));
            const account = {
                id: crypto.randomUUID(),
                name,
                phone,
                initials,
                code,
                createdAt: new Date().toISOString(),
                usedAt: null,
            };
            data.accounts.push(account);
            save();
            return account;
        },
        async redeem(code, { ip, userAgent }) {
            const account = data.accounts.find(a => a.code === code);
            if (!account) return { status: 'not_found' };
            if (account.usedAt) return { status: 'used' };
            account.usedAt = new Date().toISOString();
            account.usedFromIp = ip;
            account.usedUserAgent = userAgent;
            save();
            return { status: 'ok', account };
        },
    };
}

function randomCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

const store = DATABASE_URL ? createPgStore(DATABASE_URL) : createFileStore(DB_FILE);

function makeInitials(name) {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function publicAccount(a) {
    return {
        id: a.id,
        name: a.name,
        phone: a.phone,
        initials: a.initials,
        code: a.code,
        createdAt: a.createdAt,
        used: !!a.usedAt,
        usedAt: a.usedAt || null,
    };
}

// ------------------------------------------------------------------ tokens firmados
const b64u = buf => Buffer.from(buf).toString('base64url');

function sign(payload) {
    const body = b64u(JSON.stringify(payload));
    const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    return body + '.' + mac;
}

function verify(token) {
    if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
    const [body, mac] = token.split('.');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    const a = Buffer.from(mac || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

function parseCookies(req) {
    const out = {};
    const header = req.headers.cookie || '';
    header.split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i < 0) return;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    });
    return out;
}

function cookieString(name, value, maxAge, req) {
    const secure = IS_PROD || req.headers['x-forwarded-proto'] === 'https';
    return [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`,
        secure ? 'Secure' : '',
    ]
        .filter(Boolean)
        .join('; ');
}

function getUserSession(req) {
    const p = verify(parseCookies(req)[USER_COOKIE]);
    return p && p.t === 'user' ? p : null;
}

function getAdminSession(req) {
    const p = verify(parseCookies(req)[ADMIN_COOKIE]);
    return p && p.t === 'admin' ? p : null;
}

// ------------------------------------------------------------------ límite de intentos (anti fuerza bruta)
const attempts = new Map();
function tooManyAttempts(key, limit, windowMs) {
    const now = Date.now();
    const rec = attempts.get(key) || [];
    const recent = rec.filter(t => now - t < windowMs);
    attempts.set(key, recent);
    return recent.length >= limit;
}
function registerAttempt(key) {
    const rec = attempts.get(key) || [];
    rec.push(Date.now());
    attempts.set(key, rec);
}
function clientIp(req) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.socket.remoteAddress || 'unknown';
}

// ------------------------------------------------------------------ helpers http
const SECURITY_HEADERS = {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function sendJson(res, status, data, extraHeaders) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(extraHeaders || {}),
    });
    res.end(body);
}

function redirect(res, location) {
    res.writeHead(302, { ...SECURITY_HEADERS, Location: location, 'Cache-Control': 'no-store' });
    res.end();
}

function readJsonBody(req, limit = 10 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', c => {
            size += c.length;
            if (size > limit) {
                reject(new Error('too_large'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
            } catch (_) {
                reject(new Error('bad_json'));
            }
        });
        req.on('error', reject);
    });
}

// Bloquea peticiones POST de otros sitios (CSRF).
function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        return new URL(origin).host === req.headers.host;
    } catch (_) {
        return false;
    }
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.wasm': 'application/wasm',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.frag': 'text/plain; charset=utf-8',
    '.cur': 'image/x-icon',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|xml|wasm)|image\/svg\+xml)/;

function sendFile(req, res, filePath, extraHeaders) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const isHtml = ext === '.html';
        const headers = {
            ...SECURITY_HEADERS,
            'Content-Type': type,
            // Contenido protegido: nunca en cachés compartidas. El HTML nunca se
            // cachea (así la versión nueva llega siempre, también al celular).
            'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate' : 'private, max-age=3600',
            Vary: 'Cookie, Accept-Encoding',
            ...(extraHeaders || {}),
        };

        if (req.method === 'HEAD') {
            headers['Content-Length'] = stat.size;
            res.writeHead(200, headers);
            res.end();
            return;
        }

        // Rangos (necesario para los videos .mp4 en Safari/iOS)
        const range = req.headers.range;
        if (range && /^bytes=\d*-\d*$/.test(range) && !COMPRESSIBLE.test(type)) {
            const [s, e] = range.replace('bytes=', '').split('-');
            const start = s ? parseInt(s, 10) : Math.max(0, stat.size - parseInt(e, 10));
            const end = s && e ? Math.min(parseInt(e, 10), stat.size - 1) : stat.size - 1;
            if (start >= stat.size || start > end) {
                res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
                res.end();
                return;
            }
            res.writeHead(206, {
                ...headers,
                'Accept-Ranges': 'bytes',
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Content-Length': end - start + 1,
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }

        const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
        if (acceptsGzip && COMPRESSIBLE.test(type) && stat.size > 1024) {
            headers['Content-Encoding'] = 'gzip';
            res.writeHead(200, headers);
            fs.createReadStream(filePath).pipe(zlib.createGzip({ level: 6 })).pipe(res);
            return;
        }

        headers['Content-Length'] = stat.size;
        headers['Accept-Ranges'] = 'bytes';
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });
}

// Archivos que pueden verse SIN sesión (íconos para la pantalla de login, etc.)
const PUBLIC_FILES = new Set([
    '/favicon-16.png',
    '/favicon-32.png',
    '/favicon-48.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/logo.png',
    '/manifest.webmanifest',
    '/front-channel.html',
    '/robots.txt',
]);

function safeJoin(base, urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch (_) {
        return null;
    }
    if (decoded.includes('\0')) return null;
    const full = path.normalize(path.join(base, decoded));
    if (full !== base && !full.startsWith(base + path.sep)) return null;
    return full;
}

function wantsHtml(req, pathname) {
    const ext = path.extname(pathname);
    if (!ext || ext === '.html') return true;
    return /text\/html/.test(req.headers.accept || '');
}

// ------------------------------------------------------------------ API
async function handleApi(req, res, pathname) {
    const method = req.method;

    if ((method === 'POST' || method === 'DELETE') && !sameOrigin(req)) {
        return sendJson(res, 403, { error: 'Origen no permitido' });
    }

    // ---- Usuario: canjear código (UNA sola vez) ----
    if (pathname === '/api/auth/redeem' && method === 'POST') {
        if (getUserSession(req)) return sendJson(res, 200, { ok: true, redirect: '/home.html' });

        const ip = clientIp(req);
        const key = 'redeem:' + ip;
        if (tooManyAttempts(key, 8, 15 * 60 * 1000)) {
            return sendJson(res, 429, { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' });
        }

        let body;
        try {
            body = await readJsonBody(req);
        } catch (_) {
            return sendJson(res, 400, { error: 'Solicitud inválida' });
        }
        const code = String(body.code || '').replace(/\D/g, '');
        if (code.length !== 6) return sendJson(res, 400, { error: 'El código debe tener 6 dígitos.' });

        const result = await store.redeem(code, {
            ip,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        });
        if (result.status === 'not_found') {
            registerAttempt(key);
            return sendJson(res, 401, { error: 'Código incorrecto.' });
        }
        if (result.status === 'used') {
            registerAttempt(key);
            return sendJson(res, 403, { error: 'Este código ya fue utilizado. Solo permite un inicio de sesión.' });
        }
        const account = result.account;

        const token = sign({
            t: 'user',
            aid: account.id,
            n: account.name,
            i: account.initials,
            iat: Date.now(),
        });
        return sendJson(
            res,
            200,
            { ok: true, redirect: '/home.html' },
            { 'Set-Cookie': cookieString(USER_COOKIE, token, USER_SESSION_MAX_AGE, req) }
        );
    }

    // ---- Usuario: datos de la sesión (nombre + iniciales para el avatar) ----
    if (pathname === '/api/me' && method === 'GET') {
        const s = getUserSession(req);
        if (!s) return sendJson(res, 401, { error: 'No autenticado' });
        let acc = null;
        try {
            acc = await store.getById(s.aid);
        } catch (err) {
            console.error('[db]', err.message);
        }
        return sendJson(res, 200, {
            name: acc ? acc.name : s.n,
            initials: acc ? acc.initials : s.i,
        });
    }

    // ---- Admin: login / logout / estado ----
    if (pathname === '/api/admin/login' && method === 'POST') {
        const key = 'admin:' + clientIp(req);
        if (tooManyAttempts(key, 10, 15 * 60 * 1000)) {
            return sendJson(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
        }
        if (!ADMIN_PASSWORD) {
            return sendJson(res, 503, { error: 'Panel deshabilitado: falta configurar ADMIN_PASSWORD en el servidor.' });
        }
        let body;
        try {
            body = await readJsonBody(req);
        } catch (_) {
            return sendJson(res, 400, { error: 'Solicitud inválida' });
        }
        const given = crypto.createHash('sha256').update(String(body.password || '')).digest();
        const real = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
        if (!crypto.timingSafeEqual(given, real)) {
            registerAttempt(key);
            return sendJson(res, 401, { error: 'Contraseña incorrecta.' });
        }
        const token = sign({ t: 'admin', iat: Date.now(), exp: Date.now() + ADMIN_SESSION_MAX_AGE * 1000 });
        return sendJson(
            res,
            200,
            { ok: true },
            { 'Set-Cookie': cookieString(ADMIN_COOKIE, token, ADMIN_SESSION_MAX_AGE, req) }
        );
    }

    if (pathname === '/api/admin/logout' && method === 'POST') {
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieString(ADMIN_COOKIE, '', 0, req) });
    }

    if (pathname === '/api/admin/session' && method === 'GET') {
        return sendJson(res, 200, { admin: !!getAdminSession(req) });
    }

    // ---- Admin: cuentas (requiere sesión de admin) ----
    if (pathname.startsWith('/api/admin/')) {
        if (!getAdminSession(req)) return sendJson(res, 401, { error: 'No autorizado' });

        if (pathname === '/api/admin/accounts' && method === 'GET') {
            const list = (await store.list()).map(publicAccount);
            return sendJson(res, 200, { accounts: list });
        }

        if (pathname === '/api/admin/accounts' && method === 'POST') {
            let body;
            try {
                body = await readJsonBody(req);
            } catch (_) {
                return sendJson(res, 400, { error: 'Solicitud inválida' });
            }
            const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
            const phone = String(body.phone || '').trim().replace(/[^\d+\s()-]/g, '').slice(0, 25);
            let initials = String(body.initials || '')
                .trim()
                .toUpperCase()
                .replace(/[^A-ZÁÉÍÓÚÑÜ0-9]/g, '')
                .slice(0, 3);
            if (!name) return sendJson(res, 400, { error: 'El nombre es obligatorio.' });
            if (!phone || phone.replace(/\D/g, '').length < 7) {
                return sendJson(res, 400, { error: 'Ingresa un número de teléfono válido.' });
            }
            if (!initials) initials = makeInitials(name);

            const account = await store.create({ name, phone, initials });
            return sendJson(res, 201, { account: publicAccount(account) });
        }

        const m = pathname.match(/^\/api\/admin\/accounts\/([0-9a-f-]{36})$/i);
        if (m && method === 'GET') {
            const acc = await store.getById(m[1].toLowerCase());
            if (!acc) return sendJson(res, 404, { error: 'Cuenta no encontrada' });
            return sendJson(res, 200, {
                account: { ...publicAccount(acc), usedUserAgent: acc.usedUserAgent || null },
            });
        }
    }

    return sendJson(res, 404, { error: 'No encontrado' });
}

// ------------------------------------------------------------------ servidor
const server = http.createServer(async (req, res) => {
    let pathname;
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (_) {
        res.writeHead(400);
        return res.end();
    }

    try {
        if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, SECURITY_HEADERS);
            return res.end();
        }

        // Pantalla de login: solo se ve si NO hay sesión.
        if (pathname === '/login' || pathname === '/login.html') {
            if (getUserSession(req)) return redirect(res, '/home.html');
            return sendFile(req, res, path.join(AUTH_DIR, 'login.html'));
        }

        // Panel administrativo (la propia página pide la contraseña).
        if (pathname === '/admin' || pathname === '/admin.html') {
            return sendFile(req, res, path.join(AUTH_DIR, 'admin.html'), { 'X-Robots-Tag': 'noindex, nofollow' });
        }

        if (PUBLIC_FILES.has(pathname)) {
            return sendFile(req, res, path.join(DIST_DIR, pathname));
        }

        // ---- A partir de aquí todo es la carpeta segura (bot-app) ----
        if (!getUserSession(req)) {
            if (wantsHtml(req, pathname)) return redirect(res, '/login');
            res.writeHead(401, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('No autorizado');
        }

        // Rutas "bonitas" de cada escena (la barra de direcciones las muestra tras cargar la página).
        const SCENE_ROUTES = {
            '/dashboard': '/home.html',
            '/dashboard/home': '/home.html',
            '/dashboard/cfds': '/cfds.html',
            '/dashboard/crypto-exchange': '/exchange.html',
            '/dashboard/options': '/options.html',
            '/dashboard/portfolio': '/portfolio.html',
            '/dashboard/profile': '/profile.html',
            '/dashboard/profile/personal-details': '/datos-personales.html',
            '/dashboard/transfer': '/transfer.html',
            '/dashboard/portfolio/transactions': '/transactions.html',
            '/dashboard/withdraw/verify': '/withdraw-verify.html',
            '/dashboard/withdraw/currency/USD': '/withdraw-currency.html',
        };
        // Atajos: /usd (Billetera) -> Portafolio; cualquier /dashboard/... desconocido -> Home (en vez del 404 de React).
        if (pathname === '/usd' || pathname === '/dashboard/usd' || pathname === '/dashboard/wallet') return redirect(res, '/dashboard/portfolio');
        if (pathname.startsWith('/dashboard/') && !SCENE_ROUTES[pathname]) return redirect(res, '/dashboard/home');
        const target = safeJoin(DIST_DIR, SCENE_ROUTES[pathname] || (pathname === '/' ? '/index.html' : pathname));
        if (!target) {
            res.writeHead(400, SECURITY_HEADERS);
            return res.end();
        }

        fs.stat(target, (err, stat) => {
            if (!err && stat.isFile()) return sendFile(req, res, target);
            if (!err && stat.isDirectory()) {
                const idx = path.join(target, 'index.html');
                if (fs.existsSync(idx)) return sendFile(req, res, idx);
            }
            // Fallback SPA: las rutas internas de React caen en index.html
            if (!path.extname(pathname)) return sendFile(req, res, path.join(DIST_DIR, 'index.html'));
            res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404');
        });
    } catch (err) {
        console.error('[server]', err);
        if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' });
    }
});

store
    .init()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`[server] TradeLab protegido en http://localhost:${PORT}`);
            console.log(`[server] Login: /login   ·   Admin: /admin   ·   Base de datos: ${store.kind}`);
            if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
                console.warn('[server] No existe dist/index.html → ejecuta primero "npm run build".');
            }
        });
    })
    .catch(err => {
        console.error('[db] No se pudo conectar/inicializar la base de datos:', err.message);
        process.exit(1);
    });
