/*
 * TradeLab Sim — módulo compartido
 * ---------------------------------
 * Este proyecto es un SIMULADOR EDUCATIVO independiente. No es la
 * aplicación oficial de Deriv (ni de ningún otro bróker), no gestiona
 * dinero real y no está afiliado a Deriv Investments Ltd.
 *
 * Los "saldos" que administra este módulo son enteramente virtuales:
 * se guardan solo en este navegador (localStorage) y cualquier
 * ganancia o pérdida que se muestre en el simulador es ficticia.
 *
 * Se usa el mismo storage key en todas las páginas (home, options,
 * bot builder, chart) para que el saldo virtual se vea igual en
 * cualquier pantalla.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'tradelab-sim-balances';
  var DEFAULT_BALANCES = { demo: 10006.76, virtual: 0 };

  // bot-app (el gráfico / Deriv Bot) aplica cada ganancia o pérdida directamente sobre las claves
  // espejo `configuredBalance` (Demo) y `configuredRealBalance` (Real). saveBalances() las escribe
  // junto con el JSON, así que si difieren es porque bot-app movió el saldo después: ese valor es el
  // más reciente y es el que debe verse en home.
  var MIRROR_DEMO = 'configuredBalance';
  var MIRROR_REAL = 'configuredRealBalance';

  function readMirror(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === '') return null;
      var n = Number(raw);
      return isFinite(n) && n >= 0 ? n : null;
    } catch (err) {
      return null;
    }
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function loadBalances() {
    var data = Object.assign({}, DEFAULT_BALANCES);
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        data = {
          demo: typeof parsed.demo === 'number' ? parsed.demo : DEFAULT_BALANCES.demo,
          virtual: typeof parsed.virtual === 'number' ? parsed.virtual : DEFAULT_BALANCES.virtual,
        };
      }
    } catch (err) {
      console.warn('[TradeLab Sim] No se pudo leer el saldo guardado, usando valores por defecto.', err);
    }
    var md = readMirror(MIRROR_DEMO), mr = readMirror(MIRROR_REAL), changed = false;
    if (md !== null && round2(md) !== round2(data.demo)) { data.demo = round2(md); changed = true; }
    if (mr !== null && round2(mr) !== round2(data.virtual)) { data.virtual = round2(mr); changed = true; }
    if (changed) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (err) { /* solo en memoria */ }
    }
    return data;
  }

  function saveBalances(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      // Espejo del saldo "demo" bajo una clave simple, pensado para que
      // bot-app (u otro proyecto) pueda leerlo directamente cuando comparte
      // origen con este sitio. Cuando NO comparte origen (caso normal, dos
      // dominios distintos en Render), este valor no es alcanzable desde
      // fuera y el traspaso real ocurre por query param — ver goToBotApp()
      // en options.html y display-balance.ts en bot-app.
      if (typeof data.demo === 'number' && isFinite(data.demo) && data.demo >= 0) {
        localStorage.setItem('configuredBalance', String(data.demo));
      }
      // Mismo espejo, para la cuenta "Virtual" — bot-app la usa para su
      // cuenta simulada "Real" (CR0000001, ver mock-login.ts; no es una
      // cuenta real de Deriv con dinero real).
      if (typeof data.virtual === 'number' && isFinite(data.virtual) && data.virtual >= 0) {
        localStorage.setItem('configuredRealBalance', String(data.virtual));
      }
      // Avisa a otras pestañas/páginas abiertas del mismo simulador.
      window.dispatchEvent(new CustomEvent('tradelab-sim:balances-updated', { detail: data }));
      return true;
    } catch (err) {
      console.error('[TradeLab Sim] Error al guardar el saldo virtual.', err);
      return false;
    }
  }

  // ---- Porcentaje de ganancia (win rate del simulador) ----
  var WIN_PERCENT_KEY = 'configuredWinPercent';
  var DEFAULT_WIN_PERCENT = 51.8; // "Predeterminado de Deriv"

  function loadWinPercent() {
    try {
      var raw = localStorage.getItem(WIN_PERCENT_KEY);
      var n = raw !== null ? Number(raw) : NaN;
      if (isFinite(n) && n >= 0 && n <= 100) return n;
    } catch (err) {
      console.warn('[TradeLab Sim] No se pudo leer el % de ganancia, usando el valor por defecto.', err);
    }
    return DEFAULT_WIN_PERCENT;
  }

  function saveWinPercent(percent) {
    var n = Number(percent);
    if (!isFinite(n) || n < 0 || n > 100) return false;
    try {
      localStorage.setItem(WIN_PERCENT_KEY, String(n));
      window.dispatchEvent(new CustomEvent('tradelab-sim:win-percent-updated', { detail: n }));
      return true;
    } catch (err) {
      console.error('[TradeLab Sim] Error al guardar el % de ganancia.', err);
      return false;
    }
  }

  function formatMoney(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Suma, resta o fija el saldo de una cuenta virtual ('demo' | 'virtual'). */
  function applyAction(account, action, rawAmount) {
    var amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount < 0) return { ok: false, reason: 'invalid' };

    var data = loadBalances();
    if (!(account in data)) return { ok: false, reason: 'unknown-account' };

    if (action === 'sumar') {
      data[account] = data[account] + amount;
    } else if (action === 'restar') {
      if (amount > data[account]) return { ok: false, reason: 'insufficient' };
      data[account] = data[account] - amount;
    } else if (action === 'fijar') {
      data[account] = amount;
    } else {
      return { ok: false, reason: 'unknown-action' };
    }

    var before = loadBalances()[account];
    saveBalances(data);
    var delta = round2(data[account] - before);
    if (account === 'virtual' && delta !== 0) {
      addLedger(delta > 0 ? { type: 'deposit', amount: delta, to: 'options' } : { type: 'withdraw', amount: -delta, from: 'options' });
    }
    return { ok: true, data: data };
  }

  /** Inserta el aviso fijo de "esto es un simulador" al inicio del <body>. */
  function mountDisclaimerBanner() {
    if (document.getElementById('tlSimBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'tlSimBanner';
    banner.setAttribute('role', 'note');
    banner.style.cssText = [
      'position:relative',
      'z-index:5000',
      'background:#3d2f00',
      'color:#ffd23f',
      'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      'font-size:11.5px',
      'font-weight:600',
      'line-height:1.35',
      'text-align:center',
      'padding:6px 10px',
      'box-sizing:border-box',
    ].join(';');
    banner.textContent =
      '⚠ TradeLab Sim — simulador educativo con fondos virtuales. No es Deriv ni ninguna plataforma real, y no representa ganancias reales.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  window.addEventListener('storage', function (e) {
    if (e.key === MIRROR_DEMO || e.key === MIRROR_REAL) {
      window.dispatchEvent(new CustomEvent('tradelab-sim:balances-updated', { detail: loadBalances() }));
    }
  });

  // ---- Historial de transacciones (Depósito / Retiro / Transferir) ----
  var LEDGER_KEY = 'tradelab-sim-ledger';
  var WD_DONE_MS = 3 * 60 * 1000; // un retiro "Procesando" pasa a "Completado" a los 3 min
  function readLedger() {
    try { var l = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (err) { return []; }
  }
  function addLedger(entry) {
    var l = readLedger();
    l.unshift(Object.assign({ id: String(Date.now()) + Math.floor(Math.random() * 1000), ts: Date.now(), status: 'Completado' }, entry));
    try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l.slice(0, 500))); } catch (err) { /* sin espacio */ }
  }
  /** Todas las transacciones (depósitos, retiros y transferencias), más recientes primero. */
  function loadTransactions() {
    var out = readLedger().slice();
    loadWithdrawals().forEach(function (w) {
      out.push({ id: 'wd' + w.id, type: 'withdraw', amount: w.amount, ts: w.ts, status: w.status });
    });
    out.sort(function (a, b) { return b.ts - a.ts; });
    return out;
  }

  // ---- Billetera (wallet) USD del simulador ----
  var WALLET_KEY = 'tradelab-sim-wallet';
  function loadWallet() {
    try {
      var p = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null');
      if (p && typeof p.USD === 'number' && isFinite(p.USD) && p.USD >= 0) return { USD: round2(p.USD) };
    } catch (err) { /* usa el valor por defecto */ }
    return { USD: 0 };
  }
  function saveWallet(w) {
    try {
      localStorage.setItem(WALLET_KEY, JSON.stringify({ USD: round2(w.USD) }));
      window.dispatchEvent(new CustomEvent('tradelab-sim:balances-updated', { detail: loadBalances() }));
      return true;
    } catch (err) { return false; }
  }
  /** Mueve saldo entre 'options' (Cuenta Real del simulador / gráfico) y 'usd' (Billetera). */
  function transfer(from, to, amount) {
    var amt = round2(Number(amount));
    if (!isFinite(amt) || amt <= 0 || from === to) return { ok: false, reason: 'invalid' };
    var ids = { options: 1, usd: 1 };
    if (!ids[from] || !ids[to]) return { ok: false, reason: 'unsupported' };
    var b = loadBalances(), w = loadWallet();
    var src = from === 'options' ? b.virtual : w.USD;
    if (amt > src + 1e-9) return { ok: false, reason: 'insufficient' };
    if (from === 'options') { b.virtual = round2(b.virtual - amt); w.USD = round2(w.USD + amt); }
    else { w.USD = round2(w.USD - amt); b.virtual = round2(b.virtual + amt); }
    try { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); } catch (err) { return { ok: false, reason: 'storage' }; }
    saveBalances(b); // actualiza también la clave espejo que lee el gráfico (bot-app)
    addLedger({ type: 'transfer', from: from, to: to, amount: amt });
    return { ok: true, balances: b, wallet: w };
  }

  /** Cancela retiros pendientes: devuelve el dinero a la Billetera. */
  function cancelWithdrawals(ids) {
    var list = loadWithdrawals(), w = loadWallet(), n = 0;
    list.forEach(function (r) {
      if (ids.indexOf(r.id) >= 0 && r.status === 'Procesando') { r.status = 'Cancelado'; w.USD = round2(w.USD + r.amount); n++; }
    });
    if (!n) return 0;
    try { localStorage.setItem(WD_KEY, JSON.stringify(list)); } catch (err) { return 0; }
    saveWallet(w); return n;
  }
  /** Correos "enviados" (simulados): ya pasaron 3 minutos desde el retiro. */
  function sentMails() {
    var now = Date.now();
    return loadWithdrawals().filter(function (r) { return r.mail && r.mailAt && now >= r.mailAt; });
  }

  /** Depósito simulado en la Billetera USD (también queda en el historial). */
  function depositWallet(amount) {
    var amt = round2(Number(amount)); if (!isFinite(amt) || amt <= 0) return false;
    var w = loadWallet(); w.USD = round2(w.USD + amt);
    if (!saveWallet(w)) return false;
    addLedger({ type: 'deposit', amount: amt, to: 'usd' });
    return true;
  }

  // ---- Retiros pendientes (simulados) ----
  var WD_KEY = 'tradelab-sim-withdrawals';
  function loadWithdrawals() {
    try {
      var l = JSON.parse(localStorage.getItem(WD_KEY) || '[]');
      if (!Array.isArray(l)) return [];
      var now = Date.now();
      return l.map(function (w) {
        return (w.status === 'Procesando' && now - w.ts > WD_DONE_MS) ? Object.assign({}, w, { status: 'Completado' }) : w;
      });
    } catch (err) { return []; }
  }
  function pendingTotal() {
    return round2(loadWithdrawals().reduce(function (a, w) { return a + (w.status === 'Procesando' ? w.amount : 0); }, 0));
  }
  /** Solicita un retiro: descuenta de la Billetera y lo deja "Procesando". */
  var MAIL_DELAY_MS = 3 * 60 * 1000; // el correo de confirmación "sale" 3 min después del retiro
  function requestWithdrawal(amount, method, acct) {
    var amt = round2(Number(amount)), w = loadWallet();
    if (!isFinite(amt) || amt <= 0 || amt > w.USD + 1e-9) return { ok: false, reason: 'insufficient' };
    var mail = ''; try { mail = localStorage.getItem('tl_user_email_custom') || localStorage.getItem('tl_user_email') || ''; } catch (err) { /* sin correo */ }
    var rec = { id: String(Math.floor(1e7 + Math.random() * 9e7)), amount: amt, method: method || 'PSE', acct: acct || '', ts: Date.now(), status: 'Procesando', mail: mail, mailAt: Date.now() + MAIL_DELAY_MS };
    var list = loadWithdrawals(); list.unshift(rec);
    try { localStorage.setItem(WD_KEY, JSON.stringify(list)); } catch (err) { return { ok: false, reason: 'storage' }; }
    w.USD = round2(w.USD - amt); saveWallet(w);
    return { ok: true, record: rec };
  }

  global.TradeLabSim = {
    cancelWithdrawals: cancelWithdrawals,
    sentMails: sentMails,
    loadTransactions: loadTransactions,
    addLedger: addLedger,
    depositWallet: depositWallet,
    loadWithdrawals: loadWithdrawals,
    pendingTotal: pendingTotal,
    requestWithdrawal: requestWithdrawal,
    loadWallet: loadWallet,
    saveWallet: saveWallet,
    transfer: transfer,
    STORAGE_KEY: STORAGE_KEY,
    loadBalances: loadBalances,
    saveBalances: saveBalances,
    formatMoney: formatMoney,
    applyAction: applyAction,
    mountDisclaimerBanner: mountDisclaimerBanner,
    WIN_PERCENT_KEY: WIN_PERCENT_KEY,
    DEFAULT_WIN_PERCENT: DEFAULT_WIN_PERCENT,
    loadWinPercent: loadWinPercent,
    saveWinPercent: saveWinPercent,
  };
})(window);
