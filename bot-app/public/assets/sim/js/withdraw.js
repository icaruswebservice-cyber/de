/* ================================================================
 * withdraw.js — flujo "Retirar" (SIMULACIÓN, sin dinero ni códigos reales):
 *   Portfolio -> modal "Retirar" -> /dashboard/withdraw/verify (código de 6 dígitos)
 *   -> /dashboard/withdraw/currency/USD (cashier "Retirar USD").
 * Cualquier código de 6 dígitos se acepta: no se envía nada a ningún servicio.
 * ================================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // Ruta "bonita" de la escena en la barra de direcciones (solo el path del propio sitio).
  try {
    var scene = document.body.getAttribute('data-scene');
    if (scene && location.pathname !== scene && location.protocol !== 'file:') {
      history.replaceState(null, '', scene + location.search + location.hash);
    }
  } catch (_) {}

  function money(n) { return window.TradeLabSim ? TradeLabSim.formatMoney(n) : Number(n).toFixed(2); }
  // Como en el video, la primera vez la Billetera USD de la simulación ya tiene 10.00 para poder probar el retiro.
  function seedWallet() {
    try {
      if (localStorage.getItem('tradelab-sim-wd-seeded')) return;
      localStorage.setItem('tradelab-sim-wd-seeded', '1');
      if (TradeLabSim.loadWallet().USD <= 0 && !TradeLabSim.loadWithdrawals().length) TradeLabSim.depositWallet(10);
    } catch (_) {}
  }
  // Datos de retiro guardados en Datos personales (Nequi, beneficiario, cédula, cuenta)
  function wdInfo() {
    try {
      var i = JSON.parse(localStorage.getItem('tl_wd_info') || 'null');
      if (i && i.nequi && i.name && i.cc) return { nequi: i.nequi, name: i.name, cc: i.cc, account: i.account || i.nequi };
    } catch (_) {}
    return null;
  }
  function savedPhone() { try { return localStorage.getItem('tl_user_phone') || ''; } catch (_) { return ''; } }
  function maskAcct(n) { n = String(n || ''); return n.length > 6 ? n.slice(0, 2) + '*****' + n.slice(-4) : n; }
  function realBalance() { try { return TradeLabSim.loadWallet().USD; } catch (_) { return 0; } }

  /* ---------- Modal "Retirar" (se monta en cualquier página que tenga el botón Retirar) ---------- */
  function mountModal() {
    var trigger = Array.prototype.filter.call(document.querySelectorAll('.dd-action'), function (el) {
      return /^\s*Retirar\s*$/.test(el.textContent);
    })[0];
    if (!trigger) return;
    var ov = document.createElement('div');
    ov.className = 'wd-overlay'; ov.id = 'wdOverlay';
    ov.innerHTML =
      '<div class="wd-modal" role="dialog" aria-modal="true" aria-label="Retirar">' +
        '<div class="wd-mhead"><h2>Retirar</h2><button class="wd-mx" aria-label="Cerrar"><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m2.500 2.500 7 7M9.500 2.500l-7 7"/></svg></button></div>' +
        '<button class="wd-cur" data-go="usd"><img src="assets/sim/img/v/flag_us.png" alt=""><span class="tag">Sugerido</span><b>US Dollar</b></button>' +
        '<button class="wd-opt" data-go="usd"><i class="ic ic-pm_usd"></i><div><b>USD</b><span>Retiro a través de banco, tarjeta, billetera electrónica y criptografía.</span></div></button>' +
        '<button class="wd-opt" data-go="agent"><i class="ic ic-pm_agent"></i><div><b>Agente de pago</b><span>Deposita y retira en tu moneda local a través de un agente local verificado.</span></div></button>' +
      '</div>';
    document.body.appendChild(ov);
    function open() { ov.classList.add('open'); document.body.classList.add('wd-open'); }
    function close() { ov.classList.remove('open'); document.body.classList.remove('wd-open'); }
    trigger.addEventListener('click', function () { seedWallet(); open(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.wd-mx').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    ov.querySelectorAll('[data-go=usd]').forEach(function (b) {
      b.addEventListener('click', function () {
        // el código se envía al teléfono guardado en Datos personales
        window.location.href = savedPhone() ? 'withdraw-verify.html?currency=USD&from=portfolio&openWithdraw=1' : 'datos-personales.html?need=phone';
      });
    });
  }

  /* ---------- Aviso de "mensaje de texto enviado" (simulado: no se envía ningún SMS real) ---------- */
  function smsToast(phone) {
    var t = document.createElement('div');
    t.className = 'wd-sms';
    t.innerHTML = '<b>Mensaje de texto enviado</b><span>Enviamos el código de verificación al ' + phone.replace(/</g, '') + '.</span>';
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 50);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 5200);
  }

  /* ---------- Verificación por código ---------- */
  function initVerify() {
    var wrap = $('wdOtp'); if (!wrap) return;
    var inputs = Array.prototype.slice.call(wrap.querySelectorAll('input'));
    var phone = savedPhone();
    if (!phone) { window.location.replace('datos-personales.html?need=phone'); return; }
    $('wdPhone').textContent = phone;
    $('wdBack').addEventListener('click', function () { window.location.href = 'portfolio.html'; });
    var loader = $('wdLoader'), msg = $('wdMsg');

    function value() { return inputs.map(function (i) { return i.value; }).join(''); }
    function submit() {
      wrap.classList.add('busy'); $('wdEmail').disabled = true;
      setTimeout(function () {
        loader.classList.add('show');
        setTimeout(function () { window.location.href = 'withdraw-currency.html?from=portfolio'; }, 1500);
      }, 1100);
    }
    inputs.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/\D/g, '').slice(-1);
        if (inp.value && !counting) startCountdown();
        if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
        if (value().length === 6) submit();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && i > 0) { inputs[i - 1].focus(); inputs[i - 1].value = ''; }
        if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
        if (e.key === 'ArrowRight' && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener('paste', function (e) {
        var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!t) return; e.preventDefault();
        inputs.forEach(function (x, k) { x.value = t[k] || ''; });
        (inputs[Math.min(t.length, 5)]).focus();
        if (t.length === 6) submit();
      });
    });
    inputs[0].focus();

    // "reenvía el código" -> cuenta regresiva de 60 s
    var resend = $('wdResend'), timer = null, counting = false;
    function startCountdown() {
      var left = 60; counting = true;
      function paint() { resend.innerHTML = '¿No recibiste el código? Revisa tu SMS o reenvía el código (' + left + 's).'; }
      paint(); clearInterval(timer);
      timer = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(timer); counting = false;
          resend.innerHTML = '¿No recibiste el código? Revisa tu SMS o <button type="button" id="wdResendBtn">reenvía el código</button>.';
          $('wdResendBtn').addEventListener('click', startCountdown);
        } else paint();
      }, 1000);
    }
    $('wdResendBtn').addEventListener('click', startCountdown);
    $('wdEmail').addEventListener('click', function () {
      msg.textContent = 'Método alternativo no disponible en la simulación.'; msg.className = 'wd-msg';
      setTimeout(function () { msg.textContent = ''; }, 2600);
    });
  }

  /* ---------- Cashier "Retirar USD" ---------- */
  function initCashier() {
    var sc = $('wdScroll'); if (!sc) return;
    var T = window.TradeLabSim; seedWallet();
    var views = { list: $('wdList'), form: $('wdForm'), done: $('wdDone'), pend: $('wdPend2') };
    var info = wdInfo(), bankNum = info ? info.account : '';
    function fillInfo() {
      if (!info) return;
      $('fNameV').textContent = info.name; $('fCcV').textContent = info.cc;
      $('wdSelCur').textContent = 'NEQUI #' + info.nequi; $('fBankV').textContent = 'NEQUI'; $('fAccV').textContent = info.account; $('dName').textContent = 'Gracias ' + info.name + ',';
    }
    var spin = $('wdSpin'), up = $('wdUp'), loader = $('wdLoader');
    var amtInput = $('wdAmt'), amtWrap = $('wdAmtWrap');
    var amount = 0, method = null;
    var USER = '';
    try { USER = localStorage.getItem('tl_user_name_custom') || localStorage.getItem('tl_user_name') || USER; } catch (_) {}
    // ID de cuenta simulado (aleatorio, se guarda solo en este navegador)
    var acct = ''; try { acct = localStorage.getItem('tl_sim_acct') || ''; if (!acct) { acct = 'L' + Math.floor(1e6 + Math.random() * 9e6); localStorage.setItem('tl_sim_acct', acct); } } catch (_) { acct = 'L0000000'; }
    $('dAcct').textContent = acct;
    $('dName').textContent = USER ? 'Gracias ' + USER + ',' : 'Gracias,'; fillInfo();

    function show(name, delay) {
      spin.hidden = false; up.classList.remove('show');
      Object.keys(views).forEach(function (k) { views[k].hidden = true; });
      setTimeout(function () {
        spin.hidden = true; views[name].hidden = false; sc.scrollTop = 0;
        if (name === 'done') playCheck();
        if (name === 'pend') paintPending();
        if (name === 'form') flash(['fName', 'fBank']);
      }, delay || 1500);
    }
    function flash(ids) {
      ids.forEach(function (id) { var e = $(id); e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); });
    }

    /* --- saldos --- */
    function paintStats() {
      var avail = T.loadWallet().USD, pend = T.pendingTotal(), n = T.loadWithdrawals().filter(function (w) { return w.status === 'Procesando'; }).length;
      $('wdBal').textContent = '$ ' + money(avail + pend);
      $('wdAvail').textContent = '$ ' + money(avail);
      $('wdPend').textContent = '-$ ' + money(pend);
      $('wdPendLbl').textContent = n + ' Retiros Pendientes';
      $('wdAvailX').style.display = avail > 0 ? '' : 'none';
      $('wdAlertAmt').textContent = money(avail);
      $('wdAlert').classList.toggle('show', avail <= 0);
      amtWrap.classList.toggle('hide', avail <= 0);
      filter();
    }
    function parse(v) { var n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
    function allowed(m, a) {
      var avail = T.loadWallet().USD;
      return a > 0 && a <= avail + 1e-9 && a >= +m.dataset.min && a <= +m.dataset.max;
    }
    function filter() {
      var a = parse(amtInput.value), has = a > 0;
      Array.prototype.forEach.call(document.querySelectorAll('.wd-method'), function (m) { m.classList.toggle('off', has && !allowed(m, a)); });
    }
    amtInput.addEventListener('input', function () {
      var v = amtInput.value.replace(/[^0-9.]/g, ''); var i = v.indexOf('.');
      if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
      amtInput.value = v; filter();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.wd-method'), function (m) {
      m.addEventListener('click', function () {
        if (T.loadWallet().USD <= 0) return;
        var a = parse(amtInput.value);
        if (!allowed(m, a)) { amtInput.focus(); return; }
        if (!info) { window.location.href = 'datos-personales.html?need=wd'; return; }
        if (m.dataset.m !== 'pse') return; // solo PSE tiene formulario en la simulación
        amount = a; method = 'PSE';
        $('fAmt').textContent = '$ ' + money(a); $('fTot').textContent = '$ ' + money(a);
        show('form', 1800);
      });
    });

    /* --- formulario PSE --- */
    var BANKS = info ? [{ name: 'NEQUI', num: info.account, label: 'NEQUI #' + info.nequi }] : [];
    var BANK_SVG = '<svg viewBox="0 0 16 16"><path d="M8 1.500 1.500 5v1.200h13V5L8 1.500ZM3 7.200v4.800h1.700V7.200H3Zm3.300 0v4.800H8V7.200H6.300Zm3.300 0v4.800h1.700V7.200H9.600Zm3.300 0v4.800h.1V7.200h-.1ZM1.500 13v1.300h13V13h-13Z" fill="currentColor"/></svg>';
    var menu = $('wdSelMenu'), sel = $('wdSel');
    menu.innerHTML = BANKS.map(function (b, i) {
      return '<div data-i="' + i + '">' + BANK_SVG + '<span>' + b.name + ' <small>#' + (info ? info.nequi : b.num) + '</small></span></div>';
    }).join('') + '<div data-add="1"><span style="color:#2a9d3f;font-weight:700">+</span>' + BANK_SVG + '<span>[Agregar banco]</span></div>';
    menu.addEventListener('click', function (e) { if (e.target.closest('div[data-add]')) window.location.href = 'datos-personales.html?need=wd'; });
    function closeMenu() { menu.hidden = true; sel.classList.remove('open'); }
    $('wdSelBtn').addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; sel.classList.toggle('open', !menu.hidden); });
    $('wdSelCur').addEventListener('click', function (e) { e.stopPropagation(); $('wdSelBtn').click(); });
    document.addEventListener('click', closeMenu);
    menu.addEventListener('click', function (e) {
      var it = e.target.closest('div[data-i]'); if (!it) { closeMenu(); return; }
      var b = BANKS[+it.dataset.i]; bankNum = b.num;
      $('wdSelCur').textContent = b.label; $('fBankV').textContent = b.name; $('fAccV').textContent = b.num;
      closeMenu(); flash(['fName', 'fBank', 'fType', 'fAcc']);
    });
    $('wdFormBack').addEventListener('click', function () { show('list', 1500); });
    $('wdSend').addEventListener('click', function () {
      var r = T.requestWithdrawal(amount, method, maskAcct(bankNum));
      if (!r.ok) { show('list', 1500); paintStats(); return; }
      var d = new Date();
      $('dAmt').textContent = '$ ' + money(amount);
      $('dDate').textContent = ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + '/' + d.getFullYear();
      $('dId').textContent = r.record.id;
      show('done', 2000);
    });
    $('wdReview').addEventListener('click', function () { amtInput.value = ''; paintStats(); show('pend', 1500); });

    /* --- animación del círculo verde con chulo (medida fotograma a fotograma del video) --- */
    var raf = 0;
    function playCheck() {
      var ring = $('ckRing'), fill = $('ckFill'), tick = $('ckTick'), halo = $('ckHalo');
      var C = 2 * Math.PI * 38, TL = 50; // longitud del chulo
      cancelAnimationFrame(raf);
      halo.style.animation = 'none'; void halo.offsetWidth; halo.style.animation = '';
      var t0 = null, haloOn = false;
      function ease(x) { return 1 - Math.pow(1 - x, 2); }
      function seg(t, a, b) { return Math.min(1, Math.max(0, (t - a) / (b - a))); }
      function frame(now) {
        if (t0 === null) t0 = now; var t = (now - t0) / 1000;
        var arc = seg(t, 0.03, 0.43);                    // 1) el aro se dibuja desde las 3 en punto, en sentido horario
        ring.style.strokeDasharray = arc >= 1 ? 'none' : (C * arc) + ' ' + C;
        var f = ease(seg(t, 0.46, 0.76));                // 2) el aro se rellena hacia adentro
        var h = 35 * (1 - f);                            //    radio del hueco blanco
        fill.setAttribute('r', (38 + h) / 2); fill.setAttribute('stroke-width', 38 - h);
        fill.style.opacity = f > 0 ? 1 : 0;
        var k = seg(t, 0.80, 0.95);                      // 3) el chulo se traza
        tick.style.strokeDasharray = (TL * k) + ' ' + TL;
        tick.style.opacity = k > 0 ? 1 : 0;
        if (t >= 1.07 && !haloOn) haloOn = true, halo.style.animation = 'wdHalo 1.35s ease-out forwards';  // 4) pulso de brillo
        if (t < 2.5) raf = requestAnimationFrame(frame);
      }
      ring.style.strokeDasharray = '0 ' + C; fill.style.opacity = 0; tick.style.opacity = 0;
      raf = requestAnimationFrame(frame);
    }

    /* --- Solicitudes de retiro pendientes --- */
    function fmtDate(ts) {
      var d = new Date(ts);
      return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) + '<br>' + d.toLocaleTimeString('en-US');
    }
    function paintPending() {
      var list = T.loadWithdrawals().filter(function (w) { return w.status === 'Procesando'; });
      $('pdBody').innerHTML = list.length ? list.map(function (w) {
        return '<tr><td class="id">' + w.id + '<br><input type="checkbox" class="pdck" data-id="' + w.id + '"></td><td>Solicitado</td><td>' + money(w.amount) + ' <small>USD</small></td>' +
          '<td><span class="pdm"><img src="assets/sim/img/v/pse.png" alt="PSE"></span></td><td>' + (w.acct || '') + '</td><td>' + fmtDate(w.ts) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="none">No tienes solicitudes de retiro pendientes.</td></tr>';
      $('pdTotal').textContent = '$ ' + money(list.reduce(function (a, w) { return a + w.amount; }, 0));
    }
    $('pdBack').addEventListener('click', function () { paintStats(); show('list', 1500); });
    $('pdCancel').addEventListener('click', function () {
      var ids = Array.prototype.map.call(document.querySelectorAll('.pdck:checked'), function (c) { return c.dataset.id; });
      if (!ids.length) return;
      T.cancelWithdrawals(ids); paintPending(); paintStats();
    });

    sc.addEventListener('scroll', function () { up.classList.toggle('show', sc.scrollTop > 120); });
    up.addEventListener('click', function () { sc.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('wdClose').addEventListener('click', function () {
      loader.classList.add('show');
      setTimeout(function () { window.location.href = 'portfolio.html'; }, 1500);
    });
    paintStats();
    // carga inicial con el logo girando, como en el video
    setTimeout(function () { loader.classList.remove('show'); }, 1500);
  }

  mountModal(); initVerify(); initCashier();
})();
