/* =======================================================================
 * Automazione UI — OneConnect v2.3 (ottimizzato + Tests subpage)
 * ======================================================================= */

'use strict';

let MODEL = null;
let ACTIVE_TAB = 'home';
let isUpGuess = true;
let REFRESH_TIMER = null;

/* -------------------- Helpers DOM/UI -------------------- */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function toast(msg){ try{ console.log(msg); }catch(_){ } }
function setBadgeState(state){
  const el = $('#stateBadge'); if(!el) return;
  el.className = 'state-badge';
  if(!state){ el.textContent = '—'; return; }
  const s = String(state).toUpperCase();
  if(s.startsWith('COMFY')) el.classList.add('ok');
  else if(s.startsWith('SECUR')) el.classList.add('alert');
  el.textContent = s.replace('_',' ');
}
function fmtTs(d){
  if(!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return '—';
  return new Intl.DateTimeFormat('it-IT',{dateStyle:'short', timeStyle:'short'}).format(dt);
}
function timeOnly(v){
  if(!v || v==='—') return '—';
  if (v instanceof Date && !isNaN(v)) return v.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  const d = new Date(String(v)); if(!isNaN(d)) return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  const m = String(v).match(/(\d{1,2})\D(\d{2})/); if(m) return m[1].padStart(2,'0')+':'+m[2];
  return '—';
}

/* -------------------- Navigazione ----------------------- */
function navTo(tab){
  ACTIVE_TAB = tab;
  const map = {
    home:'#pageHome', people:'#pagePeople', devices:'#pageDevices',
    log:'#pageLog', cruscotto:'#pageCruscotto', energy:'#pageEnergy',
    settings:'#pageSettings', tests:'#pageTests'
  };
  $$('.page').forEach(p=>p.classList.remove('page-active'));
  if(map[tab]) $(map[tab]).classList.add('page-active');
  $$('.nav-btn').forEach(b=>b.classList.remove('nav-active'));
  $(`.nav-btn[data-tab="${tab}"]`)?.classList.add('nav-active');

  if(tab==='people')  loadPeople();
  if(tab==='devices') loadCams();
  if(tab==='log')     loadErrors();
  if(tab==='energy')  renderEnergyPage(MODEL);
  if(tab==='settings') loadSettingsPage();
  if(tab==='tests')   refreshTestsPage(true);
}
window.navTo = navTo;

/* -------------------- JSONP MODEL (pubblico) ------------ */
function jsonpModel(path=''){
  const base = window.EXEC_URL;
  return new Promise((resolve,reject)=>{
    try{
      const cb   = 'cb_model_' + Math.random().toString(36).slice(2);
      window[cb] = (data)=>{ try{ delete window[cb]; }catch(_){ } resolve(data); };
      const url  = `${base}${path}${path.includes('?')?'&':'?'}callback=${cb}&t=${Date.now()}`;
      const s    = document.createElement('script');
      s.src = url;
      s.onerror = (e)=>{ try{ delete window[cb]; }catch(_){ } reject(e); };
      document.body.appendChild(s);
      setTimeout(()=>{ try{s.remove();}catch(_){ } }, 8000);
    }catch(e){ reject(e); }
  });
}

/* -------------------- MODEL loader ---------------------- */
async function fetchModelOnce(){
  const m = await jsonpModel();
  if(!m || typeof m!=='object') throw new Error('MODEL vuoto');
  MODEL = m;
  renderHome(MODEL);
  renderCruscotto(MODEL);
  renderEnergyPage(MODEL);
  return MODEL;
}
async function loadModelWithRetry(){
  const delays = [0, 2000, 5000];
  for (let i=0;i<delays.length;i++){
    try{
      if(delays[i]) await new Promise(r=>setTimeout(r, delays[i]));
      await fetchModelOnce(); return true;
    }catch(e){ if(i===delays.length-1) console.error('MODEL failed', e); }
  }
  return false;
}

/* -------------------- Rendering: HOME ------------------- */
function renderHome(m){
  setBadgeState(m && m.state);

  if(m && m.weather){
    $('#weatherIcon') && ($('#weatherIcon').textContent = (m.weather.iconEmoji||'☁️'));
    $('#weatherTemp') && ($('#weatherTemp').textContent = (m.weather.tempC!=null?Math.round(m.weather.tempC)+'°':'--°'));
    $('#weatherWind') && ($('#weatherWind').textContent = (m.weather.windKmh!=null?Math.round(m.weather.windKmh)+' km/h':'-- km/h'));
  }

  const ev = (m?.energy?.kwh!=null) ? m.energy.kwh : null;
  $('#energyValue') && ($('#energyValue').textContent=(ev!=null?String(ev)+' kWh':'— kWh'));

  $('#lblOverride') && ($('#lblOverride').textContent=(m?.override?'On':'Off'));
  $('#lblVacanza')  && ($('#lblVacanza').textContent =(m?.vacanza?'On':'Off'));
  $('#btnOverride') && $('#btnOverride').classList.toggle('on', !!m?.override);
  $('#btnVacanza')  && $('#btnVacanza').classList.toggle('on',  !!m?.vacanza);

  const st=String(m?.state || '').toUpperCase(); isUpGuess=(st==='COMFY_DAY');
  $('#lblAlza') && ($('#lblAlza').textContent = isUpGuess ? 'Abbassa' : 'Alza');

  const ppl = (m?.people) ? m.people : [];
  const onCount = ppl.filter(p=>p.online).length;
  $('#peopleSummary') && ($('#peopleSummary').textContent = `${onCount} online / ${ppl.length} totali`);
}

/* -------------------- Rendering: Cruscotto --------------- */
function camsText(m){
  const s=String(m?.state||'').toUpperCase();
  if(s.startsWith('SECURITY')) return 'ON · ON';
  if(s==='COMFY_NIGHT')        return 'OFF · ON';
  return 'OFF · OFF';
}
function renderCruscotto(m){
  const el=$('#cruscottoGrid'); if(!el || !m) return;
  const tiles=[
    {key:'state',    title:'Stato',      icon:'🟢', value:m.state||'--', cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'animate-pulse')},
    {key:'presence', title:'Presenza',   icon:(m.presenzaEffettiva?'🏠':'🚪'), value:(m.presenzaEffettiva?'IN CASA':'FUORI'), cls:(m.presenzaEffettiva?'animate-pulse':'')},
    {key:'meteo',    title:'Meteo',      icon:(m.weather?.iconEmoji || '☁️'), value:`${m.weather?.tempC != null ? Math.round(m.weather.tempC) : '--'}° · ${m.weather?.windKmh != null ? Math.round(m.weather.windKmh) : '--'} km/h`, cls:'animate-breath'},
    {key:'cams',     title:'Telecamere', icon:'📷', value:camsText(m), cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'')},
    {key:'alba',     title:'Alba',       icon:'🌅', value:timeOnly(m.next?.alba), cls:''},
    {key:'tramonto', title:'Tramonto',   icon:'🌇', value:timeOnly(m.next?.tramonto), cls:''},
    {key:'energy',   title:'Energy',     icon:'⚡', value:(m.energy?.kwh!=null?`${m.energy.kwh} kWh`:'--'), cls:'animate-pulse oc-energy'},
    {key:'online',   title:'Online',     icon:'👥', value:`${(m.people||[]).filter(p=>p.online).length} / ${(m.people||[]).length}`, cls:''}
  ];
  el.innerHTML = tiles.map(t=>`
    <div class="cr-tile" data-key="${t.key}">
      <div class="cr-icon ${t.cls}">${t.icon}</div>
      <div class="cr-title">${t.title}</div>
      <div class="cr-value">${t.value}</div>
    </div>`).join('');
  el.querySelectorAll('.cr-tile[data-key="energy"]').forEach(tile=>{
    tile.style.cursor='pointer';
    tile.addEventListener('click',() => navTo('energy'));
  });
}

/* -------------------- Persone / Cams / Log ---------------- */
async function loadPeople(){
  try{
    const res = await jsonpModel('?people=1');
    const arr = (res?.people) ? res.people : [];
    const ul  = $('#peopleList'); if(!ul) return; ul.innerHTML='';

    for(const p of arr){
      const li   = document.createElement('li');
      const left = document.createElement('div');
      const tsDisplay = p?.ts ? fmtTs(p.ts) : (p?.tsText || '—');
      left.innerHTML = `<div>${p.name}</div><div class="sub">${p.lastEvent||'—'} • ${tsDisplay}</div>`;

      const right = document.createElement('div');
      const badge = document.createElement('span');
      const isOn  = !!p.online;
      badge.className = 'badge '+(isOn?'ok':'err');
      badge.textContent = isOn ? 'Online' : 'Offline';
      right.appendChild(badge);

      right.appendChild(document.createElement('div')); // spazio riservato (niente pill in Cruscotto)
      li.appendChild(left); li.appendChild(right);
      ul.appendChild(li);
    }
  }catch(_){}
}
async function loadCams(){
  try{
    const res = await jsonpModel('?cams=1');
    const iOn = !!res?.interne;
    const eOn = !!res?.esterne;
    const ci=$('#camInterne'), ce=$('#camEsterne');
    if(ci){ ci.textContent=iOn?'ON':'OFF'; ci.className='badge '+(iOn?'ok':'err'); }
    if(ce){ ce.textContent=eOn?'ON':'OFF'; ce.className='badge '+(eOn?'ok':'err'); }
  }catch(_){}
}
async function loadErrors(){
  try{
    const res = await jsonpModel('?logs=1');
    const ul=$('#logErrors'); if(!ul) return; ul.innerHTML='';
    const arr=(res?.logs)||[];
    if(arr.length===0){ const li=document.createElement('li'); li.textContent='Nessun errore'; ul.appendChild(li); return; }
    arr.forEach(e=>{
      const li=document.createElement('li');
      li.innerHTML=`<div>${e.code||'ERR'}</div><div class="sub">${e.desc||''} • ${fmtTs(e.ts)}</div>`;
      ul.appendChild(li);
    });
  }catch(_){}
}

/* -------------------- Report Test (Issue 48) -------------- */
function classifyLogCode(code){
  const c = String(code||'');
  if (c.startsWith('TEST_PASS')) return 'PASS';
  if (c.startsWith('TEST_SKIP')) return 'SKIP';
  if (c.startsWith('TEST_FAIL')) return 'FAIL';
  if (c.indexOf('_ERR')>=0 || c.startsWith('ERROR_')) return 'ERR';
  if (c.endsWith('_BLOCK') || c.endsWith('_IGNORED')) return 'WARN';
  return '';
}
/** Filtra i log a partire dall'ultimo test (DIAG_FULL_TEST o DIAG_QUICK).
 *  Se non presente, usa le ~200 righe già fornite dall'endpoint. */
function sliceLogsFromLastTest(all){
  if(!all || !all.length) return [];
  let fromIdx = -1;
  for (let i=0; i<all.length; i++){
    const c = String(all[i].code||'');
    if (c==='DIAG_FULL_TEST' || c==='DIAG_QUICK'){ fromIdx = i; break; }
  }
  return (fromIdx>=0) ? all.slice(0, fromIdx) : all; // i log sono dal più recente al più vecchio
}
function renderIssuesReport(logs){
  const rows = sliceLogsFromLastTest(logs||[]);
  const issues=[];
  rows.forEach((r,idx)=>{
    const typ=classifyLogCode(r.code);
    if(typ==='FAIL' || typ==='ERR'){
      issues.push({
        id: (r.code||'ISSUE')+'-'+(rows.length-idx),
        code:r.code||'',
        desc:r.desc||'',
        ts:r.ts
      });
    }
  });

  const donut = $('#issueDonut');
  const numEl = donut?.querySelector('.num');
  const lblEl = donut?.querySelector('.lbl');
  const cnt = issues.length;
  if(donut){
    donut.style.setProperty('--pct', cnt>0 ? '100%' : '0%');
    donut.classList.toggle('bad', cnt>0);
    if(numEl) numEl.textContent = String(cnt);
    if(lblEl) lblEl.textContent = 'issues';
  }
  const sum = $('#issueSummary');
  if(sum) sum.textContent = (cnt===0) ? 'Nessun problema nell’ultimo run' : `${cnt} problemi nell’ultimo run`;

  const ul = $('#issuesList'); if(!ul) return;
  ul.innerHTML='';
  if(cnt===0){
    const li=document.createElement('li');
    li.className='issue-row';
    li.innerHTML=`<div class="issue-id">Tutto OK</div><span class="badge ok">Passed</span>`;
    ul.appendChild(li);
    return;
  }
  issues.slice(0,12).forEach(it=>{
    const li=document.createElement('li');
    li.className='issue-row';
    const sevBadge = (it.code.startsWith('TEST_FAIL') ? '<span class="badge err">Failed</span>'
                      : it.code.indexOf('_ERR')>=0 || it.code.startsWith('ERROR_') ? '<span class="badge err">Error</span>'
                      : '<span class="badge warn">Warn</span>');
    li.innerHTML = `
      <div class="issue-id">${it.id}</div>
      <div class="issue-meta">
        <span>${it.code}</span>
        ${sevBadge}
        <span class="sub">${fmtTs(it.ts)}</span>
      </div>`;
    ul.appendChild(li);
  });
}
async function refreshTestsPage(force=false){
  try{
    const v = await api.version();
    if(v?.ok && $('#backendVersion')) $('#backendVersion').textContent = v.version || '—';
  }catch(_){}

  try{
    const res = await jsonpModel('?logs=1');
    const logs = (res?.logs)||[];
    renderIssuesReport(logs);
  }catch(e){ console.error(e); }
}
window.refreshTestsPage = refreshTestsPage;

/* -------------------- Impostazioni ------------------------ */
async function loadSettingsPage(){
  try{
    const [rStrict, rHold, rKaAuto, rExitG, rExitC, rFlags, rRet,
           rLT, rDI, rDO, rEG, rPM] = await Promise.all([
      api.getStrict(), api.getHold(), api.getKaAuto(),
      api.getExitGuard(), api.getExitConfirm(), apiFetch('get_flags'),
      api.getLogRetention(),
      api.getLifeTimeout(), api.getDebounceIn(), api.getDebounceOut(),
      api.getEmptyGrace(), api.getPianteMinInt()
    ]);

    $('#inpStrict')      && ($('#inpStrict').value      = (rStrict?.ok ? (rStrict.strict||0) : ''));
    $('#inpHold')        && ($('#inpHold').value        = (rHold?.ok   ? (rHold.hold||0)   : ''));
    $('#selKaAuto')      && ($('#selKaAuto').value      = (rKaAuto?.ok ? String(!!rKaAuto.ka_auto) : 'true'));
    $('#inpExitGuard')   && ($('#inpExitGuard').value   = (rExitG?.ok  ? (rExitG.exit_guard||0)   : ''));
    $('#inpExitConfirm') && ($('#inpExitConfirm').value = (rExitC?.ok  ? (rExitC.exit_confirm||0) : ''));
    $('#inpLogRetention')&& ($('#inpLogRetention').value= (rRet?.ok    ? (rRet.days||7)           : '7'));

    const o = !!(rFlags?.ok && rFlags.override);
    const v = !!(rFlags?.ok && rFlags.vacanza);
    $('#lblOverrideState') && ($('#lblOverrideState').textContent = o?'ON':'OFF');
    $('#lblVacanzaState')  && ($('#lblVacanzaState').textContent  = v?'ON':'OFF');
    $('#btnToggleOverride')?.classList.toggle('on', o);
    $('#btnToggleVacanza') ?.classList.toggle('on', v);

    $('#inpLifeTimeout') && ($('#inpLifeTimeout').value = (rLT?.ok ? rLT.life_timeout : 60));
    $('#inpDebIn')       && ($('#inpDebIn').value       = (rDI?.ok ? rDI.debounce_in  : 2));
    $('#inpDebOut')      && ($('#inpDebOut').value      = (rDO?.ok ? rDO.debounce_out : 0));
    $('#inpEmptyGrace')  && ($('#inpEmptyGrace').value  = (rEG?.ok ? rEG.empty_grace  : 8));
    $('#inpPianteMin')   && ($('#inpPianteMin').value   = (rPM?.ok ? rPM.min          : 60));
  }catch(_){
    toast('Errore lettura impostazioni');
  }
}
async function saveNumber(evt, val){
  const n = Number(val);
  if(!isFinite(n) || n<0){ toast('Valore non valido'); return false; }
  const res = await apiFetch(evt.startsWith('set_') ? evt : ('set_'+evt), { value: n });
  return !!(res?.ok);
}
async function saveBool(evt, b){
  const res = await apiFetch(evt, { value: String(!!b).toUpperCase() });
  return !!(res?.ok);
}

/* -------------------- Wiring Impostazioni ------------------ */
function wireSettings(){
  $('#btnOpenSettings')?.addEventListener('click', ()=>{ navTo('settings'); });

  $('#btnSaveStrict')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_strict', $('#inpStrict').value); toast(ok?'Salvato':'Errore'); if(ok) refreshNow();
  });
  $('#btnSaveHold')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_hold', $('#inpHold').value); toast(ok?'Salvato':'Errore'); if(ok) refreshNow();
  });
  $('#btnSaveKaAuto')?.addEventListener('click', async ()=>{
    const ok = await saveBool('set_ka_auto', $('#selKaAuto').value==='true'); toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveExitGuard')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_exit_guard', $('#inpExitGuard').value); toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveExitConfirm')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_exit_confirm', $('#inpExitConfirm').value); toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveLogRetention')?.addEventListener('click', async ()=>{
    const v = Number($('#inpLogRetention').value);
    if(!isFinite(v) || v<=0){ toast('Valore non valido'); return; }
    const res = await apiFetch('set_log_retention', { value:v }); toast(res?.ok?'Salvato':'Errore');
  });
  $('#btnPruneLogs')?.addEventListener('click', async ()=>{
    const res = await api.pruneLogs(); toast(res?.ok?'Log ripuliti':'Errore purge');
    if(ACTIVE_TAB==='log') loadErrors();
  });

  $('#btnSaveLifeTimeout')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_life_timeout', $('#inpLifeTimeout').value); toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveDebIn')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_debounce_in', $('#inpDebIn').value); toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveDebOut')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_debounce_out', $('#inpDebOut').value); toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveEmptyGrace')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_empty_grace', $('#inpEmptyGrace').value); toast(ok?'Salvato':'Errore');
  });
  $('#btnSavePianteMin')?.addEventListener('click', async ()=>{
    const ok = await saveNumber('set_piante_min_interval', $('#inpPianteMin').value); toast(ok?'Salvato':'Errore');
  });

  $('#btnToggleOverride')?.addEventListener('click', async ()=>{
    try{ const f1 = await apiFetch('get_flags'); const cur = !!(f1?.ok && f1.override);
         const ok = await saveBool('set_override', !cur); if(!ok){ toast('Errore override'); return; }
         refreshNow(); }catch(_){ toast('Errore override'); }
  });
  $('#btnToggleVacanza')?.addEventListener('click', async ()=>{
    try{ const f1 = await apiFetch('get_flags'); const cur = !!(f1?.ok && f1.vacanza);
         const ok = await saveBool('set_vacanza', !cur); if(!ok){ toast('Errore vacanza'); return; }
         refreshNow(); }catch(_){ toast('Errore vacanza'); }
  });
}

/* -------------------- Wiring globale ---------------------- */
function wire(){
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => navTo(b.getAttribute('data-tab')) ));
  $('#peopleBar')?.addEventListener('click', () => navTo('people'));

  $('#btnOverride')?.addEventListener('click', async ()=>{
    const f1 = await apiFetch('get_flags'); const cur = !!(f1?.ok && f1.override);
    await saveBool('set_override', !cur); toast('Override: '+(!cur?'On':'Off')); refreshNow();
  });
  $('#btnVacanza')?.addEventListener('click', async ()=>{
    const f1 = await apiFetch('get_flags'); const cur = !!(f1?.ok && f1.vacanza);
    await saveBool('set_vacanza', !cur); toast('Vacanza: '+(!cur?'On':'Off')); refreshNow();
  });
  $('#btnPiante')?.addEventListener('click', async ()=>{
    const res = await apiFetch('piante'); toast(res?.ok?'Piante avviato':'Piante bloccate');
  });
  $('#btnAlza')?.addEventListener('click', async ()=>{
    const goDown = ($('#lblAlza')?.textContent === 'Abbassa');
    if(goDown){ await apiFetch('abbassa_tutto'); toast('Abbassa tutto'); isUpGuess=false; $('#lblAlza') && ($('#lblAlza').textContent='Alza'); }
    else      { await apiFetch('alza_tutto');    toast('Alza tutto');    isUpGuess=true;  $('#lblAlza') && ($('#lblAlza').textContent='Abbassa'); }
  });
}

/* -------------------- Auto‑refresh ------------------------ */
async function refreshNow(){
  await loadModelWithRetry();
  if(ACTIVE_TAB==='people')  loadPeople();
  if(ACTIVE_TAB==='devices') loadCams();
  if(ACTIVE_TAB==='log')     loadErrors();
  if(ACTIVE_TAB==='energy')  renderEnergyPage(MODEL);
  if(ACTIVE_TAB==='tests')   refreshTestsPage();
}

/* -------------------- Avvio ------------------------------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  wire();
  wireSettings();

  await refreshNow();
  REFRESH_TIMER = setInterval(refreshNow, 60000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshNow(); });
  window.addEventListener('online', refreshNow);
  window.addEventListener('refreshDashboard', refreshNow);
});
