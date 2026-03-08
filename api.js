<script>
/** api.js – wrapper endpoint GoAppSync (fetch + fallback JSONP) */
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

async function apiFetch(event, params = {}) {
  const usp = new URLSearchParams({ admin: '1', event, ...params });
  const url = `${EXEC_URL}?${usp.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    // Fallback JSONP (Apps Script supporta "callback=cb")
    const cbName = `cb_${event}_${Date.now()}`;
    return new Promise((resolve, reject) => {
      const urlJsonp = `${url}&callback=${cbName}`;
      const s = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup(); reject(new Error('JSONP timeout'));
      }, 8000);
      function cleanup(){ try{ delete window[cbName]; }catch(_){} s.remove(); clearTimeout(timer); }
      window[cbName] = (data) => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
      s.src = urlJsonp;
      document.head.appendChild(s);
    });
  }
}

/* ----- GET wrappers ----- */
const api = {
  version: () => apiFetch('version'),
  // core già presenti in UI
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

  // ----- nuovi micro‑tuning -----
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

  // info presenza/keepalive (utility)
  keepaliveStatus: (name) => apiFetch('keepalive_status', { name }),
  keepaliveOn:     (name, minutes=30) => apiFetch('keepalive_on',  { name, minutes }),
  keepaliveOff:    (name) => apiFetch('keepalive_off', { name }),
};
</script>

// piccolo helper per messaggi
function toast(msg){ try{ console.log(msg); }catch(_){ alert(msg); } }

// Pulsante "🧪 Test"
document.getElementById('btnRunFullTest').onclick = async ()=>{
  try{
    const res = await apiFetch('diag_full_test'); // chiama l’endpoint
    if(res && res.ok){
      toast('Test suite lanciata: vedi Log per i risultati');
    }else{
      toast('Errore test: ' + (res && res.error ? res.error : 'unknown'));
    }
  }catch(e){
    toast('Errore rete: ' + e.message);
  }
};
