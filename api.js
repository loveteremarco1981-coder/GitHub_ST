/** ======================================================================
 * api.js — Wrapper per GoAppSync WebApp (v2.3.1)
 * ====================================================================== */

/* URL globale (visibile anche a app.js) */
window.EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

/* Fetch + JSONP fallback */
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

/* API wrappers */
const api = {
  version: () => apiFetch('version'),

  // Base settings
  getStrict: () => apiFetch('get_strict'),
  setStrict: (value) => apiFetch('set_strict', { value }),
  getHold:   () => apiFetch('get_hold'),
  setHold:   (value) => apiFetch('set_hold', { value }),
  getKaAuto: () => apiFetch('get_ka_auto'),
  setKaAuto: (valueBool) => apiFetch('set_ka_auto', { value: String(!!valueBool).toUpperCase() }),
  getExitGuard:   () => apiFetch('get_exit_guard'),
  setExitGuard:   (value) => apiFetch('set_exit_guard', { value }),
  getExitConfirm: () => apiFetch('get_exit_confirm'),
  setExitConfirm: (value) => apiFetch('set_exit_confirm', { value }),
  getLogRetention: () => apiFetch('get_log_retention'),
  setLogRetention: (days) => apiFetch('set_log_retention', { value: days }),
  pruneLogs: () => apiFetch('prune_logs'),

  // Micro‑tuning
  getLifeTimeout:  () => apiFetch('get_life_timeout'),
  setLifeTimeout:  (value) => apiFetch('set_life_timeout', { value }),
  getDebounceIn:   () => apiFetch('get_debounce_in'),
  setDebounceIn:   (value) => apiFetch('set_debounce_in', { value }),
  getDebounceOut:  () => apiFetch('get_debounce_out'),
  setDebounceOut:  (value) => apiFetch('set_debounce_out', { value }),
  getEmptyGrace:   () => apiFetch('get_empty_grace'),
  setEmptyGrace:   (value) => apiFetch('set_empty_grace', { value }),
  getPianteMinInt: () => apiFetch('get_piante_min_interval'),
  setPianteMinInt: (value) => apiFetch('set_piante_min_interval', { value }),

  // Diagnostica
  fullTest: () => apiFetch('diag_full_test'),
  quick: (op, params={}) => apiFetch('diag_quick', { op, ...params }),

  // KeepAlive
  keepaliveStatus: (name) => apiFetch('keepalive_status', { name }),
  keepaliveOn:     (name, minutes=30) => apiFetch('keepalive_on', { name, minutes }),
  keepaliveOff:    (name) => apiFetch('keepalive_off', { name }),
};

/* Helpers UI */
function setStatus(id, text, ok=true){
  const el = document.getElementById(id); if(!el) return;
  el.textContent = text || '';
  el.style.color = ok ? '#7bd88f' : '#ff6b6b';
}
function toast(msg){ try{ console.log(msg); }catch(_){ } }

/* Runner Diagnostica Rapida con feedback (solo pagina Test) */
async function runQuick(op, params={}, btnId=null, statusId='diagStatus'){
  if (statusId) setStatus(statusId, `Esecuzione: ${op}…`, true);
  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) btn.disabled = true;

  try{
    const res = await api.quick(op, params);
    if(res && res.ok){
      if (statusId) setStatus(statusId, 'OK ✓', true);
      try{ window.dispatchEvent(new Event('refreshDashboard')); }catch(_){}
      try{ window.refreshTestsPage && window.refreshTestsPage(true); }catch(_){}
    }else{
      if (statusId) setStatus(statusId, 'Errore: '+(res?.error||'unknown'), false);
    }
  }catch(e){
    if (statusId) setStatus(statusId, 'Errore rete: '+e.message, false);
  }finally{
    if (btn) btn.disabled = false;
  }
}

/* Bind UI dopo DOM ready */
window.addEventListener('DOMContentLoaded', ()=>{
  // Cruscotto → apri sotto‑pagina Test
  const openTests = document.getElementById('btnOpenTests');
  if (openTests){
    openTests.addEventListener('click', ()=>{
      try{ window.navTo && window.navTo('tests'); }catch(_){}
      try{ window.refreshTestsPage && window.refreshTestsPage(); }catch(_){}
    });
  }

  // Test completo (pagina Test)
  const fullTop = document.getElementById('btnRunFullTestTop');
  if (fullTop){
    fullTop.addEventListener('click', async ()=>{
      setStatus('testSuiteStatusTop','Esecuzione test completo…', true);
      fullTop.disabled = true;
      try{
        const res = await api.fullTest();
        if(res && res.ok){
          setStatus('testSuiteStatusTop','OK — apri Log ✓', true);
          try{ window.dispatchEvent(new Event('refreshDashboard')); }catch(_){}
          try{ window.refreshTestsPage && window.refreshTestsPage(true); }catch(_){}
        }else{
          setStatus('testSuiteStatusTop','Errore test: '+(res?.error||'unknown'), false);
        }
      }catch(e){
        setStatus('testSuiteStatusTop','Errore rete: '+e.message, false);
      }finally{
        fullTop.disabled = false;
      }
    });
  }

  // Diagnostica rapida — SOLO pagina Test
  const $ = (id)=>document.getElementById(id);
  if ($('tQuickList'))   $('tQuickList').onclick   = ()=> runQuick('list', {}, 'tQuickList');
  if ($('tKaOn'))        $('tKaOn').onclick        = ()=> runQuick('ka_on',{name:'marco',minutes:5},'tKaOn');
  if ($('tKaOff'))       $('tKaOff').onclick       = ()=> runQuick('ka_off',{name:'marco'},'tKaOff');
  if ($('tAllIn'))       $('tAllIn').onclick       = ()=> runQuick('all_in',{},'tAllIn');
  if ($('tAllOut'))      $('tAllOut').onclick      = ()=> runQuick('all_out',{},'tAllOut');
  if ($('tVerifyGrace')) $('tVerifyGrace').onclick = ()=> runQuick('verify_grace',{},'tVerifyGrace');
  if ($('tSnap'))        $('tSnap').onclick        = ()=> runQuick('snap',{},'tSnap');

  // Back
  const back = document.getElementById('btnBackToCrusc');
  if (back){ back.onclick = ()=>{ try{ window.navTo && window.navTo('cruscotto'); }catch(_){} }; }

  // Aggiorna report
  const btnRef = document.getElementById('btnRefreshReport');
  if (btnRef){ btnRef.onclick = ()=>{ try{ window.refreshTestsPage && window.refreshTestsPage(true); }catch(_){} }; }
});
