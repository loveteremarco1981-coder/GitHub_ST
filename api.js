/** api.js – wrapper endpoint GoAppSync (fetch + fallback JSONP) */
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

async function apiFetch(event, params = {}) {
  const usp = new URLSearchParams({ admin: '1', event, ...params });
  const url = `${EXEC_URL}?${usp.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET', credentials: 'omit', cache:'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      const text = await res.text();
      try { return JSON.parse(text); } catch(_) { throw new Error('Bad content-type'); }
    }
    return await res.json();
  } catch (err) {
    // Fallback JSONP
    const cbName = `cb_${event}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      const urlJsonp = `${url}&callback=${cbName}`;
      const s = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 10000);
      function cleanup(){ try{ delete window[cbName]; }catch(_){} if (s.parentNode) s.parentNode.removeChild(s); clearTimeout(timer); }
      window[cbName] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
      s.src = urlJsonp;
      document.head.appendChild(s);
    });
  }
}

/* ----- API wrappers ----- */
const api = {
  version: () => apiFetch('version'),

  // Impostazioni core
  getStrict: () => apiFetch('get_strict'),
  setStrict: (value) => apiFetch('set_strict', { value }),
  getHold:   () => apiFetch('get_hold'),
  setHold:   (value) => apiFetch('set_hold', { value }),
  getKaAuto: () => apiFetch('get_ka_auto'),
  setKaAuto: (valueBool) => apiFetch('set_ka_auto', { value: String(!!valueBool).toUpperCase() }),
  getExitGuard: () => apiFetch('get_exit_guard'),
  setExitGuard: (value) => apiFetch('set_exit_guard', { value }),
  getExitConfirm: () => apiFetch('get_exit_confirm'),
  setExitConfirm: (value) => apiFetch('set_exit_confirm', { value }),
  getLogRetention: () => apiFetch('get_log_retention'),
  setLogRetention: (days) => apiFetch('set_log_retention', { value: days }),
  pruneLogs: () => apiFetch('prune_logs'),

  // Micro‑tuning
  getLifeTimeout:  () => apiFetch('get_life_timeout'),
  setLifeTimeout:  (value) => apiFetch('set_life_timeout',  { value }),
  getDebounceIn:   () => apiFetch('get_debounce_in'),
  setDebounceIn:   (value) => apiFetch('set_debounce_in',   { value }),
  getDebounceOut:  () => apiFetch('get_debounce_out'),
  setDebounceOut:  (value) => apiFetch('set_debounce_out',  { value }),
  getEmptyGrace:   () => apiFetch('get_empty_grace'),
  setEmptyGrace:   (value) => apiFetch('set_empty_grace',   { value }),
  getPianteMinInt: () => apiFetch('get_piante_min_interval'),
  setPianteMinInt: (value) => apiFetch('set_piante_min_interval', { value }),

  // Diagnostica
  fullTest: () => apiFetch('diag_full_test'),
  quick: (op, params={}) => apiFetch('diag_quick', { op, ...params }),
};

/* ----- UI helpers ----- */
function toast(msg){ try{ console.log(msg); }catch(_){ alert(msg); } }
function setStatus(id, text, ok=true){
  const el = document.getElementById(id); if(!el) return;
  el.textContent = text || '';
  el.style.color = ok ? '#7bd88f' : '#ff6b6b';
}

/* ----- Bind dopo che il DOM è pronto ----- */
window.addEventListener('DOMContentLoaded', ()=>{
  // “🧪 Test” — suite completa
  const runBtn = document.getElementById('btnRunFullTest');
  if (runBtn){
    runBtn.addEventListener('click', async ()=>{
      setStatus('testStatus','Esecuzione test…', true);
      runBtn.disabled = true;
      try{
        const res = await api.fullTest();
        if(res && res.ok){ setStatus('testStatus','OK: apri “Log” per i risultati ✓', true); }
        else { setStatus('testStatus','Errore test: '+(res && res.error ? res.error : 'unknown'), false); }
      }catch(e){
        setStatus('testStatus','Errore rete: '+e.message, false);
      }finally{
        runBtn.disabled = false;
        try{ window.dispatchEvent(new Event('refreshDashboard')); }catch(_){}
      }
    });
  }

  // Diagnostica Rapida (se presenti i pulsanti)
  const $ = (id)=>document.getElementById(id);
  if ($('btnDiagList'))      $('btnDiagList').onclick = async ()=>{ const r=await api.quick('list'); toast(r.ok?'Lista trigger → Log':'Err: '+r.error); };
  if ($('btnKaOnMarco'))     $('btnKaOnMarco').onclick = async ()=>{ const r=await api.quick('ka_on',{name:'marco',minutes:5}); toast(r.ok?'KA ON 5m Marco':'Err: '+r.error); };
  if ($('btnKaOffMarco'))    $('btnKaOffMarco').onclick = async ()=>{ const r=await api.quick('ka_off',{name:'marco'});       toast(r.ok?'KA OFF Marco':'Err: '+r.error); };
  if ($('btnAllOut'))        $('btnAllOut').onclick = async ()=>{ const r=await api.quick('all_out');    toast(r.ok?'Uscita pendente a tutti':'Err: '+r.error); };
  if ($('btnAllIn'))         $('btnAllIn').onclick  = async ()=>{ const r=await api.quick('all_in');     toast(r.ok?'poke_life a tutti':'Err: '+r.error); };
  if ($('btnVerifyGrace'))   $('btnVerifyGrace').onclick = async ()=>{ const r=await api.quick('verify_grace'); toast(r.ok?'Verifica grace eseguita':'Err: '+r.error); };
  if ($('btnSnap'))          $('btnSnap').onclick  = async ()=>{ const r=await api.quick('snap');        toast(r.ok?'Snapshot → Log':'Err: '+r.error); };
});
