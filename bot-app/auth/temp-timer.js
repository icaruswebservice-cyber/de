/*
 * Cronómetro de sesión temporal.
 * El servidor lo inyecta en todas las páginas SOLO cuando la cuenta es temporal.
 * Muestra el tiempo restante abajo a la derecha y, al llegar a 0, recarga la
 * página: como la cookie ya venció, el servidor redirige a /login.
 */
(function () {
    'use strict';
    if (window.top !== window) return; // nunca dentro de iframes
    if (window.__tempTimerLoaded) return;
    window.__tempTimerLoaded = true;

    var expiresAt = 0;
    var offset = 0; // reloj del servidor - reloj local
    var badge = null;
    var done = false;

    function expire() {
        if (done) return;
        done = true;
        if (badge) badge.textContent = 'Sesión finalizada';
        window.location.reload();
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function mount() {
        badge = document.createElement('div');
        badge.id = 'temp-session-timer';
        badge.setAttribute('role', 'timer');
        badge.setAttribute('aria-live', 'off');
        var st = badge.style;
        st.position = 'fixed';
        st.right = '10px';
        st.bottom = '10px';
        st.zIndex = '2147483647';
        st.padding = '4px 9px';
        st.borderRadius = '999px';
        st.background = 'rgba(24,28,37,.88)';
        st.color = '#fff';
        st.font = '600 11px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
        st.letterSpacing = '.3px';
        st.boxShadow = '0 2px 8px rgba(0,0,0,.3)';
        st.pointerEvents = 'none';
        st.userSelect = 'none';
        st.fontVariantNumeric = 'tabular-nums';
        document.body.appendChild(badge);
        place();
        window.addEventListener('resize', place);
    }

    // En móvil, sube la etiqueta para no tapar la barra de navegación inferior.
    function place() {
        if (!badge) return;
        var nav = document.querySelector('.dd-bottom-nav');
        var h = 0;
        if (nav) {
            var cs = window.getComputedStyle(nav);
            if (cs.display !== 'none' && cs.position === 'fixed') h = nav.getBoundingClientRect().height;
        }
        badge.style.bottom = h ? 'calc(' + Math.round(h) + 'px + 8px)' : 'calc(env(safe-area-inset-bottom, 0px) + 10px)';
    }

    function tick() {
        if (done) return;
        var left = expiresAt - (Date.now() + offset);
        if (left <= 0) return expire();
        var s = Math.ceil(left / 1000);
        if (badge) {
            badge.textContent = 'Sesión temporal · ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
            badge.style.background = s <= 60 ? 'rgba(230,34,46,.95)' : 'rgba(24,28,37,.88)';
        }
    }

    function start(data) {
        expiresAt = data.expiresAt;
        offset = data.now ? data.now - Date.now() : 0;
        mount();
        tick();
        setInterval(tick, 500);
        // Al volver a la pestaña (celular dormido, pestaña en segundo plano) revisa al instante.
        document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    }

    function init() {
        fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) {
                if (r.status === 401) { expire(); return null; }
                return r.json();
            })
            .then(function (d) { if (d && d.temporary && d.expiresAt) start(d); })
            .catch(function () { /* sin red: no hace nada */ });
    }

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();
