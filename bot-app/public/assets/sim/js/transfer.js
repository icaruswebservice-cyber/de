/* ================================================================
 * transfer.js — pantalla "Transferir" (SIMULACIÓN con saldos virtuales).
 *   De: Options (tu Cuenta Real del simulador)  ⇄  a: Billetera (USD)
 * Al confirmar se mueve el saldo entre ambas y se refleja en Portfolio y en el gráfico.
 * ================================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var T = window.TradeLabSim;
  var IMG = 'assets/sim/img/v/';

  try {
    var scene = document.body.getAttribute('data-scene');
    if (scene && location.pathname !== scene && location.protocol !== 'file:') history.replaceState(null, '', scene + location.search + location.hash);
  } catch (_) {}

  // Cuentas disponibles: Options (saldo del gráfico) y Billetera USD son las únicas con saldo movible.
  var ACCOUNTS = [
    { id: 'options', sec: 'Comercio', name: 'Options', cur: 'USD', img: 'cx_options.png', sq: true },
    { id: 'usd', sec: 'Billetera', name: 'US Dollar', short: 'Billetera', cur: 'USD', img: 'cx_us.png' },
    { id: 'usdt_tron', sec: 'Billetera', name: 'USDT (Tron)', short: 'Billetera', cur: 'USDT', img: 'cx_usdt_tron.png', fixed: '0.00' },
    { id: 'usdt_eth', sec: 'Billetera', name: 'USDT (Ethereum)', short: 'Billetera', cur: 'USDT', img: 'cx_usdt_eth.png', fixed: '0.00' },
    { id: 'trx', sec: 'Billetera', name: 'TRX', short: 'Billetera', cur: 'TRX', img: 'cx_trx.png', fixed: '0.000000' },
    { id: 'ltc', sec: 'Billetera', name: 'Litecoin', short: 'Billetera', cur: 'LTC', img: 'cx_ltc.png', fixed: '0.00000000' },
    { id: 'btc', sec: 'Billetera', name: 'Bitcoin', short: 'Billetera', cur: 'BTC', img: 'cx_btc.png', fixed: '0.00000000' },
    { id: 'usdc', sec: 'Billetera', name: 'USDC (Ethereum)', short: 'Billetera', cur: 'USDC', img: 'cx_usdc.png', fixed: '0.00' },
    { id: 'bnb', sec: 'Billetera', name: 'BNB', short: 'Billetera', cur: 'BNB', img: 'cx_bnb.png', fixed: '0.00000000' }
  ];
  var byId = {}; ACCOUNTS.forEach(function (a) { byId[a.id] = a; });
  function balance(id) {
    if (id === 'options') return T.loadBalances().virtual;
    if (id === 'usd') return T.loadWallet().USD;
    return 0;
  }
  function bal(id) { var a = byId[id]; return a.fixed ? a.fixed : T.formatMoney(balance(id)); }
  function movable(id) { return id === 'options' || id === 'usd'; }

  var state = { from: 'options', to: null, amount: '' };
  var pickTarget = null;

  function card(el, label, id, placeholder) {
    var inner;
    if (id) {
      var a = byId[id];
      inner = '<span class="lbl">' + label + '</span><span class="row"><img class="' + (a.sq ? '' : 'round') + '" src="' + IMG + a.img + '" alt=""><span><b>' + (a.short || a.name) + '</b><small>' + bal(id) + ' ' + a.cur + '</small></span></span>';
    } else {
      inner = '<span class="lbl">' + label + '</span><span class="row"><span class="ph">' + placeholder + '</span></span>';
    }
    el.innerHTML = inner + '<i class="ic ic-ex_chev"></i>';
  }
  function render() {
    card($('tfFrom'), 'De', state.from);
    card($('tfTo'), 'a', state.to, 'Seleccionar');
    var amt = parseFloat(state.amount);
    var max = balance(state.from);
    var ok = isFinite(amt) && amt > 0 && state.to && movable(state.from) && movable(state.to) && amt <= max + 1e-9;
    $('tfGo').disabled = !ok;
    var has = !!state.to && movable(state.from) && max > 0;
    document.querySelectorAll('.tf-chip').forEach(function (c) { c.disabled = !has; });
    $('tfRecLbl').style.visibility = (isFinite(amt) && amt > 0) ? 'visible' : 'hidden';
    $('tfRec').innerHTML = (isFinite(amt) && amt > 0) ? T.formatMoney(amt) + ' USD' : (state.to && max > 0 ? '<span class="skel"></span>' : '');
    $('tfInputBox').classList.toggle('err', isFinite(amt) && amt > max + 1e-9);
    $('tfMsg').textContent = (isFinite(amt) && amt > max + 1e-9) ? 'El monto supera el saldo disponible (' + T.formatMoney(max) + ' USD).' : '';
  }

  /* ----- selector de cuentas ----- */
  function openPick(which) {
    pickTarget = which;
    $('tfPickTitle').textContent = which === 'from' ? 'De' : 'a';
    $('tfSearch').value = ''; drawList('');
    $('tfPickOv').classList.add('open');
  }
  function drawList(q) {
    q = q.trim().toLowerCase();
    var html = '', sec = '';
    ACCOUNTS.forEach(function (a) {
      if (q && (a.name + ' ' + a.cur).toLowerCase().indexOf(q) === -1) return;
      var other = pickTarget === 'from' ? state.to : state.from;
      if (a.id === other) return;
      if (a.sec !== sec) { sec = a.sec; html += '<div class="tf-sec">' + sec + '</div>'; }
      var cur = pickTarget === 'from' ? state.from : state.to;
      html += '<button class="tf-item' + (a.id === cur ? ' sel' : '') + '" data-id="' + a.id + '"><img class="' + (a.sq ? 'sq' : '') + '" src="' + IMG + a.img + '" alt=""><span><b>' + a.name + '</b><small>' + bal(a.id) + ' ' + a.cur + '</small></span></button>';
    });
    $('tfList').innerHTML = html || '<div class="tf-sec" style="color:#6b6b72;font-weight:400;padding:1rem 0">Sin resultados</div>';
  }
  $('tfList').addEventListener('click', function (e) {
    var b = e.target.closest('.tf-item'); if (!b) return;
    state[pickTarget] = b.dataset.id; state.amount = ''; $('tfAmount').value = '';
    $('tfPickOv').classList.remove('open'); render();
  });
  $('tfSearch').addEventListener('input', function () { drawList(this.value); });
  $('tfFrom').addEventListener('click', function () { openPick('from'); });
  $('tfTo').addEventListener('click', function () { openPick('to'); });
  $('tfPickX').addEventListener('click', function () { $('tfPickOv').classList.remove('open'); });
  $('tfPickOv').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });

  $('tfSwap').addEventListener('click', function () {
    if (!state.to) return;
    var t = state.from; state.from = state.to; state.to = t; state.amount = ''; $('tfAmount').value = ''; render();
  });

  /* ----- cantidad ----- */
  $('tfAmount').addEventListener('input', function () {
    var v = this.value.replace(/[^\d.]/g, ''); var p = v.split('.'); if (p.length > 2) v = p[0] + '.' + p.slice(1).join('');
    if (p[1] && p[1].length > 2) v = p[0] + '.' + p[1].slice(0, 2);
    this.value = v; state.amount = v;
    document.querySelectorAll('.tf-chip').forEach(function (c) { c.classList.remove('on'); });
    render();
  });
  $('tfChips').addEventListener('click', function (e) {
    var c = e.target.closest('.tf-chip'); if (!c || c.disabled) return;
    var v = Math.floor(balance(state.from) * parseInt(c.dataset.p, 10)) / 100;
    state.amount = (Math.round(v * 100) / 100).toFixed(2); $('tfAmount').value = state.amount;
    document.querySelectorAll('.tf-chip').forEach(function (x) { x.classList.toggle('on', x === c); });
    render();
  });
  $('tfDismiss').addEventListener('click', function () { $('tfInfo').style.display = 'none'; });
  $('tfSee').addEventListener('click', function () { /* sin destino en la referencia */ });
  $('tfBack').addEventListener('click', function () { window.location.href = 'portfolio.html'; });

  /* ----- revisar y confirmar ----- */
  function chip(id) { var a = byId[id]; return '<img class="' + (a.sq ? '' : 'round') + '" src="' + IMG + a.img + '" alt="">' + (a.short || a.name); }
  $('tfGo').addEventListener('click', function () {
    var amt = parseFloat(state.amount);
    $('cFrom').innerHTML = chip(state.from); $('cTo').innerHTML = chip(state.to);
    $('cAmt').textContent = T.formatMoney(amt) + ' USD'; $('cRec').textContent = T.formatMoney(amt) + ' USD';
    $('tfOk').classList.remove('busy'); $('tfOk').disabled = false; $('tfOkTxt').textContent = 'Confirmar';
    $('tfConfOv').classList.add('open');
  });
  $('tfConfX').addEventListener('click', function () { $('tfConfOv').classList.remove('open'); });
  $('tfConfOv').addEventListener('click', function (e) { if (e.target === this && !$('tfOk').disabled) this.classList.remove('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('tfOk').disabled) { $('tfConfOv').classList.remove('open'); $('tfPickOv').classList.remove('open'); } });

  $('tfOk').addEventListener('click', function () {
    var amt = Math.round(parseFloat(state.amount) * 100) / 100;
    $('tfOk').disabled = true; $('tfOk').classList.add('busy'); $('tfOkTxt').textContent = 'Procesando';
    setTimeout(function () {
      var r = T.transfer(state.from, state.to, amt);
      if (!r.ok) { $('tfConfOv').classList.remove('open'); $('tfMsg').textContent = 'No se pudo completar la transferencia.'; render(); return; }
      $('tfConfOv').classList.remove('open');
      $('tfDoneTxt').textContent = T.formatMoney(amt) + ' USD transferido a su saldo USD.';
      $('tfDone').classList.add('show');
      setTimeout(function () { $('tfIr').classList.add('show'); }, 1100);
    }, 1500);
  });
  $('tfIr').addEventListener('click', function () {
    this.classList.add('busy');
    setTimeout(function () { window.location.href = 'portfolio.html'; }, 1500);
  });

  render();
})();
