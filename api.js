/** ======================================================================
 * api.js — Wrapper per GoAppSync WebApp (v2.3.1)
 * ====================================================================== */

/* 1) URL globale, visibile anche a app.js */
window.EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

/* 2) Fetch + JSONP fallback */
async function apiFetch(event, params = {}) {
  const usp = new URLSearchParams({ admin: '1', event, ...params });
  const url = `${window.EXEC_URL}?${usp.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET', credentials: 'omit', cache:'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const txt = await res.text();
    if (!ct.includes('application/json')) { try { return JSON.parse(txt); } catch(_) { throw new Error('Non-JSON'); } }
    return JSON.parse(txt);
  } catch (err) {
    // JSONP
    const cbName = `cb_${event}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      const urlJsonp = `${url}&callback=${cbName}`;
      const s = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 10000);
      function cleanup(){ try{ delete window[cbName]; }catch(_){} if (s.parentNode) s.parentNode.removeChild(s); clearTimeout(timer); }
      window[cbName] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('JSONP load error')); };
      s.src = urlJsonp;
      document.head.appendChild(s);
    });
  }
}

/* 3) API wrappers (usati da app.js) */
const api = {
  version: () => apiFetch('version'),

  getStrict: () => apiFetch('get_strict'),
  setStrict: (value) => apiFetch('set_strict', { value }),

  getHold: () => apiFetch('get_hold'),
  setHold: (value) => apiFetch('set_hold', { value }),

  getKaAuto: () => apiFetch('get_ka_auto'),
  setKaAuto: (valueBool) => apiFetch('set_ka_auto', { value: String(!!valueBool).toUpperCase() }),

  getExitGuard:   () => apiFetch('get_exit_guard'),
  setExitGuard:   (value) => apiFetch('set_exit_guard', { value }),
  getExitConfirm: () => apiFetch('get_exit_confirm'),
  setExitConfirm: (value) => apiFetch('set_exit_confirm', { value }),

  getLogRetention: () => apiFetch('get_log_retention'),
  setLogRetention: (days) => apiFetch('set_log_retention', { value: days }),
  pruneLogs: () => apiFetch('prune_logs'),

  // micro‑tuning
  getLifeTimeout: () => apiFetch('get_life_timeout'),
  setLifeTimeout: (value) => apiFetch('set_life_timeout', { value }),
  getDebounceIn:  () => apiFetch('get_debounce_in'),
  setDebounceIn:  (value) => apiFetch('set_debounce_in', { value }),
  getDebounceOut: () => apiFetch('get_debounce_out'),
  setDebounceOut: (value) => apiFetch('set_debounce_out', { value }),
  getEmptyGrace:  () => apiFetch('get_empty_grace'),
  setEmptyGrace:  (value) => apiFetch('set_empty_grace', { value }),
  getPianteMinInt:() => apiFetch('get_piante_min_interval'),
  setPianteMinInt:(value) => apiFetch('set_piante_min_interval', { value }),

  // diagnostica
  fullTest: () => apiFetch('diag_full_test'),
  quick: (op, params={}) => apiFetch('diag_quick', { op, ...params }),

  // KA
  keepaliveStatus: (name) => apiFetch('keepalive_status', { name }),
  keepaliveOn: (name, minutes=30) => apiFetch('keepalive_on', { name, minutes }),
  keepaliveOff: (name) => apiFetch('keepalive_off', { name }),
};

/* 4) Helpers UI minimo per Test + Diagnostica Rapida */
function setStatus(id, text, ok=true){
  const el = document.getElementById(id); if(!el) return;
  el.textContent = text || '';
  el.style.color = ok ? '#7bd88f' : '#ff6b6b';
}

window.addEventListener('DOMContentLoaded', ()=>{
  // Bottone "🧪 Test"
  const runBtn = document.getElementById('btnRunFullTest');
  if (runBtn){
    runBtn.addEventListener('click', async ()=>{
      setStatus('testStatus','Esecuzione test…', true);
      runBtn.disabled = true;
      try{
        const res = await api.fullTest();
        if(res && res.ok){ setStatus('testStatus','OK — apri Log ✓', true); window.dispatchEvent(new Event('refreshDashboard')); }
        else { setStatus('testStatus','Errore: '+(res?.error||'unknown'), false); }
      }catch(e){ setStatus('testStatus','Errore rete: '+e.message, false); }
      runBtn.disabled = false;
    });
  }

  // Diagnostica Rapida (se presenti i pulsanti)
  const $ = (id)=>document.getElementById(id);
  if ($('btnDiagList'))    $('btnDiagList').onclick    = async ()=>{ const r=await api.quick('list');          console.log(r); };
  if ($('btnKaOnMarco'))   $('btnKaOnMarco').onclick   = async ()=>{ const r=await api.quick('ka_on',{name:'marco',minutes:5}); console.log(r); };
  if ($('btnKaOffMarco'))  $('btnKaOffMarco').onclick  = async ()=>{ const r=await api.quick('ka_off',{name:'marco'}); console.log(r); };
  if ($('btnAllOut'))      $('btnAllOut').onclick      = async ()=>{ const r=await api.quick('all_out');       console.log(r); };
  if ($('btnAllIn'))       $('btnAllIn').onclick       = async ()=>{ const r=await api.quick('all_in');        console.log(r); };
  if ($('btnVerifyGrace')) $('btnVerifyGrace').onclick = async ()=>{ const r=await api.quick('verify_grace');  console.log(r); };
  if ($('btnSnap'))        $('btnSnap').onclick        = async ()=>{ const r=await api.quick('snap');          console.log(r); };
});
