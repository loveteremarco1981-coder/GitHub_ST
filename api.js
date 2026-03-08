/** ======================================================================
 * api.js — Wrapper per GoAppSync WebApp (v2.3.1)
 * - Fetch + fallback JSONP
 * - Endpoint wrappers (get/set)
 * - Diagnostica (full test + quick test)
 * - Bind UI dopo DOM ready (btnRunFullTest, diagnostica rapida)
 * ====================================================================== */

- const EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';
+ window.EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';
/* =========================================================================
   FETCH + JSONP FALLBACK
   ========================================================================= */
async function apiFetch(event, params = {}) {
  const usp = new URLSearchParams({ admin: '1', event, ...params });
  const url = `${EXEC_URL}?${usp.toString()}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();

    // Se non è JSON, provo comunque a parsiarlo
    if (!ct.includes('application/json')) {
      try { return JSON.parse(text); }
      catch (_) { throw new Error('Response non-JSON'); }
    }

    return JSON.parse(text);

  } catch (err) {
    // --- Fallback JSONP ---
    const cbName = `cb_${event}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const urlJsonp = `${url}&callback=${cbName}`;
      const s = document.createElement('script');

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, 10000);

      function cleanup() {
        try { delete window[cbName]; } catch (_) {}
        if (s.parentNode) s.parentNode.removeChild(s);
        clearTimeout(timer);
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };

      s.onerror = () => { cleanup(); reject(new Error('JSONP load error')); };
      s.src = urlJsonp;
      document.head.appendChild(s);
    });
  }
}

/* =========================================================================
   API WRAPPERS
   ========================================================================= */
const api = {
  version: () => apiFetch('version'),

  // --- BASE SETTINGS ---
  getStrict: () => apiFetch('get_strict'),
  setStrict: (value) => apiFetch('set_strict', { value }),

  getHold: () => apiFetch('get_hold'),
  setHold: (value) => apiFetch('set_hold', { value }),

  getKaAuto: () => apiFetch('get_ka_auto'),
  setKaAuto: (valueBool) =>
    apiFetch('set_ka_auto', { value: String(!!valueBool).toUpperCase() }),

  getExitGuard: () => apiFetch('get_exit_guard'),
  setExitGuard: (value) => apiFetch('set_exit_guard', { value }),

  getExitConfirm: () => apiFetch('get_exit_confirm'),
  setExitConfirm: (value) => apiFetch('set_exit_confirm', { value }),

  getLogRetention: () => apiFetch('get_log_retention'),
  setLogRetention: (days) => apiFetch('set_log_retention', { value: days }),
  pruneLogs: () => apiFetch('prune_logs'),

  // --- MICRO TUNING ---
  getLifeTimeout: () => apiFetch('get_life_timeout'),
  setLifeTimeout: (value) => apiFetch('set_life_timeout', { value }),

  getDebounceIn: () => apiFetch('get_debounce_in'),
  setDebounceIn: (value) => apiFetch('set_debounce_in', { value }),

  getDebounceOut: () => apiFetch('get_debounce_out'),
  setDebounceOut: (value) => apiFetch('set_debounce_out', { value }),

  getEmptyGrace: () => apiFetch('get_empty_grace'),
  setEmptyGrace: (value) => apiFetch('set_empty_grace', { value }),

  getPianteMinInt: () => apiFetch('get_piante_min_interval'),
  setPianteMinInt: (value) => apiFetch('set_piante_min_interval', { value }),

  // --- DIAGNOSTICA ---
  fullTest: () => apiFetch('diag_full_test'),
  quick: (op, params = {}) =>
    apiFetch('diag_quick', { op, ...params }),

  // --- KEEPALIVE ---
  keepaliveStatus: (name) => apiFetch('keepalive_status', { name }),
  keepaliveOn: (name, minutes = 30) =>
    apiFetch('keepalive_on', { name, minutes }),
  keepaliveOff: (name) => apiFetch('keepalive_off', { name })
};

/* =========================================================================
   UI HELPERS
   ========================================================================= */
function toast(msg) {
  try { console.log(msg); } catch (_) { alert(msg); }
}

function setStatus(id, text, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? '#7bd88f' : '#ff6b6b';
}

/* =========================================================================
   DOM READY → BIND BUTTON HANDLERS
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {

  /* -------------------------------
     🧪 Test Suite Completa
     ------------------------------- */
  const btnTest = document.getElementById('btnRunFullTest');
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      setStatus('testStatus', 'Esecuzione test…', true);
      btnTest.disabled = true;

      try {
        const res = await api.fullTest();
        if (res && res.ok) {
          setStatus('testStatus', 'OK — apri Log per vedere i risultati ✓', true);
        } else {
          setStatus('testStatus', 'Errore: ' + (res?.error || 'unknown'), false);
        }
      } catch (e) {
        setStatus('testStatus', 'Errore rete: ' + e.message, false);
      }

      btnTest.disabled = false;
    });
  }

  /* -------------------------------
     ⚡ DIAGNOSTICA RAPIDA
     ------------------------------- */
  const $ = (id) => document.getElementById(id);

  if ($('btnDiagList'))
    $('btnDiagList').onclick = async () => {
      const r = await api.quick('list');
      toast(r.ok ? 'Lista trigger → Log' : r.error);
    };

  if ($('btnKaOnMarco'))
    $('btnKaOnMarco').onclick = async () => {
      const r = await api.quick('ka_on', { name: 'marco', minutes: 5 });
      toast(r.ok ? 'KA ON 5m (marco)' : r.error);
    };

  if ($('btnKaOffMarco'))
    $('btnKaOffMarco').onclick = async () => {
      const r = await api.quick('ka_off', { name: 'marco' });
      toast(r.ok ? 'KA OFF (marco)' : r.error);
    };

  if ($('btnAllOut'))
    $('btnAllOut').onclick = async () => {
      const r = await api.quick('all_out');
      toast(r.ok ? 'All OUT (pendenti)' : r.error);
    };

  if ($('btnAllIn'))
    $('btnAllIn').onclick = async () => {
      const r = await api.quick('all_in');
      toast(r.ok ? 'Tutti IN (poke_life)' : r.error);
    };

  if ($('btnVerifyGrace'))
    $('btnVerifyGrace').onclick = async () => {
      const r = await api.quick('verify_grace');
      toast(r.ok ? 'Grace verificata' : r.error);
    };

  if ($('btnSnap'))
    $('btnSnap').onclick = async () => {
      const r = await api.quick('snap');
      toast(r.ok ? 'Snapshot → Log' : r.error);
    };

});
