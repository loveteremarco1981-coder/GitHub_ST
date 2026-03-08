/** api.js — GoAppSync UI wrappers (v2.3.1) */
window.EXEC_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

async function apiFetch(event, params = {}) {
  const usp = new URLSearchParams({ admin:'1', event, ...params });
  const url = `${window.EXEC_URL}?${usp.toString()}`;
  try {
    const res = await fetch(url, { method:'GET', credentials:'omit', cache:'no-store' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const ct=(res.headers.get('content-type')||'').toLowerCase();
    const txt=await res.text();
    if(!ct.includes('application/json')){ try{ return JSON.parse(txt); }catch(_){ throw new Error('Non-JSON'); } }
    return JSON.parse(txt);
  } catch (err) {
    const cb=`cb_${event}_${Date.now()}`;
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=`${url}&callback=${cb}`;
      const timer=setTimeout(()=>{cleanup();reject(new Error('JSONP timeout'));},10000);
      function cleanup(){ try{delete window[cb];}catch(_){ } if(s.parentNode) s.parentNode.removeChild(s); clearTimeout(timer); }
      window[cb]=(data)=>{ cleanup(); resolve(data); };
      s.onerror=()=>{ cleanup(); reject(new Error('JSONP load error')); };
      document.head.appendChild(s);
    });
  }
}

const api = {
  version: ()=>apiFetch('version'),
  getStrict: ()=>apiFetch('get_strict'), setStrict: v=>apiFetch('set_strict',{value:v}),
  getHold: ()=>apiFetch('get_hold'), setHold: v=>apiFetch('set_hold',{value:v}),
  getKaAuto: ()=>apiFetch('get_ka_auto'), setKaAuto: b=>apiFetch('set_ka_auto',{value:String(!!b).toUpperCase()}),
  getExitGuard: ()=>apiFetch('get_exit_guard'), setExitGuard: v=>apiFetch('set_exit_guard',{value:v}),
  getExitConfirm: ()=>apiFetch('get_exit_confirm'), setExitConfirm: v=>apiFetch('set_exit_confirm',{value:v}),
  getLogRetention: ()=>apiFetch('get_log_retention'), setLogRetention: d=>apiFetch('set_log_retention',{value:d}),
  pruneLogs: ()=>apiFetch('prune_logs'),
  getLifeTimeout: ()=>apiFetch('get_life_timeout'), setLifeTimeout: v=>apiFetch('set_life_timeout',{value:v}),
  getDebounceIn: ()=>apiFetch('get_debounce_in'), setDebounceIn: v=>apiFetch('set_debounce_in',{value:v}),
  getDebounceOut: ()=>apiFetch('get_debounce_out'), setDebounceOut: v=>apiFetch('set_debounce_out',{value:v}),
  getEmptyGrace: ()=>apiFetch('get_empty_grace'), setEmptyGrace: v=>apiFetch('set_empty_grace',{value:v}),
  getPianteMinInt: ()=>apiFetch('get_piante_min_interval'), setPianteMinInt: v=>apiFetch('set_piante_min_interval',{value:v}),
  fullTest: ()=>apiFetch('diag_full_test'),
  quick: (op,params={})=>apiFetch('diag_quick',{op,...params}),
  keepaliveStatus: name=>apiFetch('keepalive_status',{name}),
  keepaliveOn: (name,minutes=30)=>apiFetch('keepalive_on',{name,minutes}),
  keepaliveOff: name=>apiFetch('keepalive_off',{name})
};

function setStatus(id,text,ok=true){ const el=document.getElementById(id); if(!el) return; el.textContent=text||''; el.style.color=ok?'#7bd88f':'#ff6b6b'; }
function toast(m){ try{ console.log(m); }catch(_){ } }

async function runQuick(op, params={}, btnId=null, statusId='testStatus'){
  if(statusId) setStatus(statusId,`Esecuzione: ${op}…`,true);
  const btn = btnId?document.getElementById(btnId):null;
  if(btn) btn.disabled = true;
  try{
    const res = await api.quick(op, params);
    if(res && res.ok){
      const map={list:'Lista trigger → Log',ka_on:`KA ON ${params?.name||''} (${params?.minutes||''}m)`,ka_off:`KA OFF ${params?.name||''}`,all_out:'Tutti OUT',all_in:'Tutti IN',verify_grace:'Verifica grace',snap:'Snapshot'};
      if(statusId) setStatus(statusId, (map[op]||'OK')+' ✓', true);
      if(['all_out','all_in','verify_grace','snap'].includes(op)) try{ window.dispatchEvent(new Event('refreshDashboard')); }catch(_){}
    }else{
      if(statusId) setStatus(statusId,'Errore: '+(res?.error||'unknown'),false);
    }
  }catch(e){
    if(statusId) setStatus(statusId,'Errore rete: '+e.message,false);
  }finally{
    if(btn) btn.disabled=false;
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  const openTests=document.getElementById('btnOpenTests');
  if(openTests){ openTests.onclick=()=>{ try{ window.navTo('tests'); }catch(_){ } try{ window.refreshTestsPage(true); }catch(_){ } }; }

  const fullTop=document.getElementById('btnRunFullTestTop');
  if(fullTop){
    fullTop.onclick=async ()=>{
      setStatus('testSuiteStatusTop','Esecuzione test completo…',true);
      fullTop.disabled=true;
      try{
        const r=await api.fullTest();
        if(r?.ok){ setStatus('testSuiteStatusTop','OK — apri Log ✓',true); window.dispatchEvent(new Event('refreshDashboard')); window.refreshTestsPage?.(true); }
        else{ setStatus('testSuiteStatusTop','Errore test: '+(r?.error||'unknown'),false); }
      }catch(e){ setStatus('testSuiteStatusTop','Errore rete: '+e.message,false); }
      finally{ fullTop.disabled=false; }
    };
  }

  const $ = id=>document.getElementById(id);
  $('btnDiagList')   && ($('btnDiagList').onclick   = ()=>runQuick('list',{},'btnDiagList'));
  $('btnKaOnMarco')  && ($('btnKaOnMarco').onclick  = ()=>runQuick('ka_on',{name:'marco',minutes:5},'btnKaOnMarco'));
  $('btnKaOffMarco') && ($('btnKaOffMarco').onclick = ()=>runQuick('ka_off',{name:'marco'},'btnKaOffMarco'));
  $('btnAllOut')     && ($('btnAllOut').onclick     = ()=>runQuick('all_out',{},'btnAllOut'));
  $('btnAllIn')      && ($('btnAllIn').onclick      = ()=>runQuick('all_in',{},'btnAllIn'));
  $('btnVerifyGrace')&& ($('btnVerifyGrace').onclick= ()=>runQuick('verify_grace',{},'btnVerifyGrace'));
  $('btnSnap')       && ($('btnSnap').onclick       = ()=>runQuick('snap',{},'btnSnap'));

  // Replica handlers nella pagina Test
  const k=(id,fn)=>{ const el=document.getElementById(id); if(el) el.onclick=fn; };
  k('tQuickList',()=>runQuick('list',{},'tQuickList','diagStatus'));
  k('tKaOn',()=>runQuick('ka_on',{name:'marco',minutes:5},'tKaOn','diagStatus'));
  k('tKaOff',()=>runQuick('ka_off',{name:'marco'},'tKaOff','diagStatus'));
  k('tAllIn',()=>runQuick('all_in',{},'tAllIn','diagStatus'));
  k('tAllOut',()=>runQuick('all_out',{},'tAllOut','diagStatus'));
  k('tVerifyGrace',()=>runQuick('verify_grace',{},'tVerifyGrace','diagStatus'));
  k('tSnap',()=>runQuick('snap',{},'tSnap','diagStatus'));

  const back=document.getElementById('btnBackToCrusc');
  if(back) back.onclick=()=>{ try{ window.navTo('cruscotto'); }catch(_){ } };

  const ref=document.getElementById('btnRefreshReport');
  if(ref) ref.onclick=()=>{ try{ window.refreshTestsPage(true); }catch(_){ } };
});
