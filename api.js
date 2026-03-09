/** api.js — GoAppSync UI wrappers (v2.3.1) */
window.EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

async function apiFetch(event, params = {}) {
  const usp = new URLSearchParams({ admin: '1', event, ...params });
  const url = `${window.EXEC_URL}?${usp.toString()}`;
  try {
    const res = await fetch(url, { method:'GET', credentials:'omit', cache:'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const ct = (res.headers.get('content-type')||'').toLowerCase();
    const txt = await res.text();
    if (!ct.includes('application/json')) {
      try { return JSON.parse(txt); } catch(_){ throw new Error('Non-JSON'); }
    }
    return JSON.parse(txt);
  } catch (err) {
    // Fallback JSONP (utile su Pages + GAS)
    const cb = `cb_${event}_${Date.now()}`;
    return new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      const src = `${url}&callback=${encodeURIComponent(cb)}`;
      s.src = src;
      const timer = setTimeout(()=>{ cleanup(); reject(new Error('JSONP timeout')); }, 10000);
      function cleanup(){
        try{ delete window[cb]; }catch(_){}
        if (s.parentNode) s.parentNode.removeChild(s);
        clearTimeout(timer);
      }
      window[cb] = (data)=>{ cleanup(); resolve(data); };
      s.onerror = ()=>{ cleanup(); reject(new Error('JSONP load error')); };
      document.head.appendChild(s);
    });
  }
}

const api = {
  version:           ()=>apiFetch('version'),
  getStrict:         ()=>apiFetch('get_strict'),        setStrict:       v=>apiFetch('set_strict',{value:v}),
  getHold:           ()=>apiFetch('get_hold'),          setHold:         v=>apiFetch('set_hold',{value:v}),
  getKaAuto:         ()=>apiFetch('get_ka_auto'),       setKaAuto:       b=>apiFetch('set_ka_auto',{value:String(!!b).toUpperCase()}),
  getExitGuard:      ()=>apiFetch('get_exit_guard'),    setExitGuard:    v=>apiFetch('set_exit_guard',{value:v}),
  getExitConfirm:    ()=>apiFetch('get_exit_confirm'),  setExitConfirm:  v=>apiFetch('set_exit_confirm',{value:v}),
  getLogRetention:   ()=>apiFetch('get_log_retention'), setLogRetention: d=>apiFetch('set_log_retention',{value:d}),
  pruneLogs:         ()=>apiFetch('prune_logs'),
  getLifeTimeout:    ()=>apiFetch('get_life_timeout'),  setLifeTimeout:  v=>apiFetch('set_life_timeout',{value:v}),
  getDebounceIn:     ()=>apiFetch('get_debounce_in'),   setDebounceIn:   v=>apiFetch('set_debounce_in',{value:v}),
  getDebounceOut:    ()=>apiFetch('get_debounce_out'),  setDebounceOut:  v=>apiFetch('set_debounce_out',{value:v}),
  getEmptyGrace:     ()=>apiFetch('get_empty_grace'),   setEmptyGrace:   v=>apiFetch('set_empty_grace',{value:v}),
  getPianteMinInt:   ()=>apiFetch('get_piante_min_interval'),
  setPianteMinInt:   v => apiFetch('set_piante_min_interval',{value:v}),
  fullTest:          ()=>apiFetch('diag_full_test'),
  quick:             (op,params={})=>apiFetch('diag_quick',{op,...params}),
  keepaliveStatus:   name=>apiFetch('keepalive_status',{name}),
  keepaliveOn:       (name,minutes=30)=>apiFetch('keepalive_on',{name,minutes}),
  keepaliveOff:      name=>apiFetch('keepalive_off',{name})
};
