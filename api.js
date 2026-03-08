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

/* Runner Diagnostica Rapida con feedback */
async function runQuick(op, params={}, btnId=null, statusId='testStatus'){
  if (statusId) setStatus(statusId, `Esecuzione: ${op}…`, true);
  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) btn.disabled = true;

  try{
    const res = await api.quick(op, params);
    if(res && res.ok){
      const msgMap = {
        list:          'Lista trigger → Log',
        'ka_on':       `KA ON ${params?.name||''} (${params?.minutes||''}m)`,
        'ka_off':      `KA OFF ${params?.name||''}`,
        'all_out':     'Tutti OUT (pendenti)',
        'all_in':      'Tutti IN (poke_life)',
        'verify_grace':'Verifica grace eseguita',
        snap:          'Snapshot → Log'
      };
      if (statusId) setStatus(statusId, (msgMap[op] || 'OK') + ' ✓', true);
      toast(msgMap[op] || 'OK');

      if (['all_out','all_in','verify_grace','snap'].includes(op)){
        try{ window.dispatchEvent(new Event('refreshDashboard')); }catch(_){}
      }
    }else{
      if (statusId) setStatus(statusId, 'Errore: '+(res && res.error ? res.error : 'unknown'), false);
      toast('Errore: '+(res && res.error ? res.error : 'unknown'));
    }
  }catch(e){
    if (statusId) setStatus(statusId, 'Errore rete: '+e.message, false);
    toast('Errore rete: '+e.message);
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

  // Test completo nella pagina Test
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
          try{ window.refreshTestsPage && window.refreshTestsPage(); }catch(_){}
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

  // Diagnostica Rapida (Cruscotto)
  const $ = (id)=>document.getElementById(id);
  if ($('btnDiagList'))      $('btnDiagList').onclick      = ()=> runQuick('list', {}, 'btnDiagList');
  if ($('btnKaOnMarco'))     $('btnKaOnMarco').onclick     = ()=> runQuick('ka_on',  { name:'marco', minutes:5 }, 'btnKaOnMarco');
  if ($('btnKaOffMarco'))    $('btnKaOffMarco').onclick    = ()=> runQuick('ka_off', { name:'marco' }, 'btnKaOffMarco');
  if ($('btnAllOut'))        $('btnAllOut').onclick        = ()=> runQuick('all_out', {}, 'btnAllOut');
  if ($('btnAllIn'))         $('btnAllIn').onclick         = ()=> runQuick('all_in',  {}, 'btnAllIn');
  if ($('btnVerifyGrace'))   $('btnVerifyGrace').onclick   = ()=> runQuick('verify_grace', {}, 'btnVerifyGrace');
  if ($('btnSnap'))          $('btnSnap').onclick          = ()=> runQuick('snap', {}, 'btnSnap');

  // Diagnostica Rapida (pagina Test)
  if (document.getElementById('tQuickList'))   document.getElementById('tQuickList').onclick   = ()=> runQuick('list', {}, 'tQuickList','diagStatus');
  if (document.getElementById('tKaOn'))        document.getElementById('tKaOn').onclick        = ()=> runQuick('ka_on',{name:'marco',minutes:5},'tKaOn','diagStatus');
  if (document.getElementById('tKaOff'))       document.getElementById('tKaOff').onclick       = ()=> runQuick('ka_off',{name:'marco'},'tKaOff','diagStatus');
  if (document.getElementById('tAllIn'))       document.getElementById('tAllIn').onclick       = ()=> runQuick('all_in',{},'tAllIn','diagStatus');
  if (document.getElementById('tAllOut'))      document.getElementById('tAllOut').onclick      = ()=> runQuick('all_out',{},'tAllOut','diagStatus');
  if (document.getElementById('tVerifyGrace')) document.getElementById('tVerifyGrace').onclick = ()=> runQuick('verify_grace',{},'tVerifyGrace','diagStatus');
  if (document.getElementById('tSnap'))        document.getElementById('tSnap').onclick        = ()=> runQuick('snap',{},'tSnap','diagStatus');

  // Torna al Cruscotto
  const back = document.getElementById('btnBackToCrusc');
  if (back){ back.onclick = ()=>{ try{ window.navTo && window.navTo('cruscotto'); }catch(_){} }; }

  // Aggiorna report
  const btnRef = document.getElementById('btnRefreshReport');
  if (btnRef){ btnRef.onclick = ()=>{ try{ window.refreshTestsPage && window.refreshTestsPage(true); }catch(_){} }; }
});
