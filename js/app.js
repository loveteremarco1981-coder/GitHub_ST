/* Automazione UI — OneConnect v2.3 (strict+hold + keepalive toggle + log retention) */

/* === ENDPOINT della tua WebApp === */
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

let MODEL = null;
let isUpGuess = true;
let ACTIVE_TAB = 'home';

/* === Helpers DOM / UI ==================================================== */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function toast(m){
  const t = $('#toast'); if(!t) return;
  t.textContent = m || '';
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1700);
}
function fmtTs(d){
  if(!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  return new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(dt);
}
function weatherEmoji(k){
  const map={sun:'☀️',few:'🌤️',part:'⛅',cloud:'☁️',fog:'🌫️',drizzle:'🌦️',rain:'🌧️',showers:'🌦️',storm:'⛈️',hail:'🌨️'};
  return map[k]||'☀️';
}
function nocache(u){
  const sep = u.includes('?') ? '&' : '?';
  return u + sep + 't=' + Date.now();
}
function toHm(v){
  if(!v || v==='—') return '--:--';
  const d = new Date(v); if(isNaN(d)) return '--:--';
  return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
}
function setBadgeState(state){
  const el = $('#stateBadge'); if(!el) return;
  el.className = 'state-badge';
  if(!state){ el.textContent = '—'; return; }
  const s = String(state).toUpperCase();
  if(s.startsWith('COMFY')) el.classList.add('ok');
  else if(s.startsWith('SECURITY')) el.classList.add('alert');
  el.textContent = s.replace('_',' ');
}
function navTo(tab){
  ACTIVE_TAB = tab;
  const map = {
    home:'#pageHome', people:'#pagePeople', devices:'#pageDevices',
    log:'#pageLog', cruscotto:'#pageCruscotto', energy:'#pageEnergy',
    settings:'#pageSettings'
  };
  $$('.page').forEach(p=>p.classList.remove('page-active'));
  if(map[tab]) $(map[tab]).classList.add('page-active');
  $$('.nav-btn').forEach(b=>b.classList.remove('nav-active'));
  $(`.nav-btn[data-tab="${tab}"]`)?.classList.add('nav-active');
  if(tab==='people')  loadPeople();
  if(tab==='devices') loadCams();
  if(tab==='log')     loadErrors();
  if(tab==='energy')  renderEnergyPage(MODEL);
}

/* === JSONP helpers ======================================================= */
function callAdmin(evt, value){
  return new Promise((resolve,reject)=>{
    const cb='cb_admin_'+Math.random().toString(36).slice(2);
    const timer=setTimeout(()=>{ toast('Timeout: '+evt); reject(new Error('timeout')); },8000);
    window[cb]=(res)=>{ clearTimeout(timer); try{ delete window[cb]; }catch{}; resolve(res); };
    const v=(value===undefined)?'':'&value='+encodeURIComponent(String(value));
    const url=nocache(`${ENDPOINT_URL}?admin=1&event=${encodeURIComponent(evt)}&callback=${cb}${v}`);
    const s=document.createElement('script'); s.src=url; s.onerror=reject; document.body.appendChild(s);
    setTimeout(()=>{ try{s.remove();}catch{} },3000);
  });
}
function jsonp(path, cbname){
  return new Promise((resolve,reject)=>{
    const cb=cbname||('cb_'+Math.random().toString(36).slice(2));
    window[cb]=(res)=>{ try{ delete window[cb]; resolve(res); }catch{} };
    const url=nocache(`${ENDPOINT_URL}${path}${path.includes('?')?'&':'?'}callback=${cb}`);
    const s=document.createElement('script'); s.src=url; s.onerror=reject; document.body.appendChild(s);
    setTimeout(()=>{ try{s.remove();}catch{} },3000);
  });
}

/* === KEEPALIVE =========================================================== */
async function getKeepaliveStatus(name){
  try{
    const res = await jsonp(`?admin=1&event=keepalive_status&name=${encodeURIComponent(name)}`);
    if(res && res.ok) return { on: !!res.on, minutes: res.minutes||30 };
  }catch(_){}
  return { on:false, minutes:null };
}
async function toggleKeepalive(name, wantOn){
  try{
    if(wantOn){
      const res = await jsonp(`?admin=1&event=keepalive_on&name=${encodeURIComponent(name)}&minutes=30`);
      if(res && res.ok) return true;
    }else{
      const res = await jsonp(`?admin=1&event=keepalive_off&name=${encodeURIComponent(name)}`);
      if(res && res.ok) return false;
    }
  }catch(_){}
  return null;
}

/* === Persone / Cams / Log ================================================ */
async function loadPeople(){
  try{
    const res = await jsonp('?people=1');
    const arr = (res && res.people) ? res.people : [];
    const ul  = $('#peopleList'); if(!ul) return; ul.innerHTML='';

    for(const p of arr){
      const li   = document.createElement('li');
      const left = document.createElement('div');
      const tsDisplay=(p && p.ts) ? fmtTs(p.ts) : (p && p.tsText ? p.tsText : '—');
      left.innerHTML = `<div>${p.name}</div><div class="sub">${p.lastEvent||'—'} • ${tsDisplay}</div>`;

      const right = document.createElement('div');
      const badge = document.createElement('span');
      const isOn  = !!p.online;
      badge.className = 'badge '+(isOn?'ok':'err');
      badge.textContent = isOn ? 'Online' : 'Offline';
      right.appendChild(badge);

      // Pill Keepalive (KA)
      const pill = document.createElement('button');
      pill.className = 'ka-pill';
      pill.textContent = 'KA…';
      try{
        const st = await getKeepaliveStatus(p.name);
        pill.classList.toggle('on', !!st.on);
        pill.textContent = 'KA ' + (st.on ? ('ON '+(st.minutes||30)+'m') : 'OFF');
      }catch(_){}

      pill.addEventListener('click', async ()=>{
        const wantOn = !pill.classList.contains('on');
        const ok     = await toggleKeepalive(p.name, wantOn);
        if(ok===null){ toast('Errore keepalive'); return; }
        pill.classList.toggle('on', wantOn);
        pill.textContent = 'KA ' + (wantOn ? 'ON 30m' : 'OFF');
        toast(`Keepalive ${p.name}: `+(wantOn?'ON':'OFF'));
      });

      right.appendChild(pill);
      li.appendChild(left); li.appendChild(right);
      ul.appendChild(li);
    }
  }catch(e){ /* silenzio */ }
}
function loadCams(){
  jsonp('?cams=1').then(res=>{
    const ci=$('#camInterne'), ce=$('#camEsterne');
    const iOn=!!(res&&res.interne), eOn=!!(res&&res.esterne);
    if(ci){ ci.textContent=iOn?'ON':'OFF'; ci.className='badge '+(iOn?'ok':'err'); }
    if(ce){ ce.textContent=eOn?'ON':'OFF'; ce.className='badge '+(eOn?'ok':'err'); }
  }).catch(()=>{});
}
function loadErrors(){
  jsonp('?logs=1').then(res=>{
    const ul=$('#logErrors'); if(!ul) return; ul.innerHTML='';
    const arr=(res&&res.logs)?res.logs:[];
    if(arr.length===0){ const li=document.createElement('li'); li.textContent='Nessun errore'; ul.appendChild(li); return; }
    arr.forEach(e=>{
      const li=document.createElement('li');
      li.innerHTML=`<div>${e.code||'ERR'}</div><div class="sub">${e.desc||''} • ${fmtTs(e.ts)}</div>`;
      ul.appendChild(li);
    });
  }).catch(()=>{});
}

/* === Cruscotto / Energy =================================================== */
function camsText(m){
  const s=String(m.state||'').toUpperCase();
  if(s.startsWith('SECURITY')) return 'ON · ON';
  if(s==='COMFY_NIGHT') return 'OFF · ON';
  return 'OFF · OFF';
}
function formatTimeOrDash(v){
  if(!v||v==='—') return '—';
  const d=new Date(v); if(isNaN(d)) return v;
  return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
}
function renderCruscotto(m){
  const el=$('#cruscottoGrid'); if(!el || !m) return;
  const tiles=[
    {key:'state',    title:'Stato',      icon:'🟢', value:m.state||'--', cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'animate-pulse')},
    {key:'presence', title:'Presenza',   icon:(m.presenzaEffettiva?'🏠':'🚪'), value:(m.presenzaEffettiva?'IN CASA':'FUORI'), cls:(m.presenzaEffettiva?'animate-pulse':'')},
    {key:'meteo',    title:'Meteo',      icon:(m.weather && m.weather.iconEmoji || '☁️'), value:`${m.weather && m.weather.tempC != null ? Math.round(m.weather.tempC) : '--'}° · ${m.weather && m.weather.windKmh != null ? Math.round(m.weather.windKmh) : '--'} km/h`, cls:'animate-breath'},
    {key:'cams',     title:'Telecamere', icon:'📷', value:camsText(m), cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'')},
    {key:'alba',     title:'Alba',       icon:'🌅', value:formatTimeOrDash(m.next && m.next.pianteAlba), cls:''},
    {key:'tramonto', title:'Tramonto',   icon:'🌇', value:formatTimeOrDash(m.next && m.next.piantePostClose), cls:''},
    {key:'energy',   title:'Energy',     icon:'⚡', value:(m.energy && m.energy.kwh!=null?`${m.energy.kwh} kWh`:'--'), cls:'animate-pulse oc-energy'},
    {key:'online',   title:'Online',     icon:'👥', value:`${(m.people||[]).filter(p=>p.online).length} / ${(m.people||[]).length}`, cls:''}
  ];
  el.innerHTML = tiles.map(t=>`
    <div class="cr-tile" data-key="${t.key}">
      <div class="cr-icon ${t.cls}">${t.icon}</div>
      <div class="cr-title">${t.title}</div>
      <div class="cr-value">${t.value}</div>
    </div>`).join('');
  el.querySelectorAll('.cr-tile').forEach(tile=>{
    const key=tile.getAttribute('data-key');
    if(key==='energy'){ tile.style.cursor='pointer'; tile.addEventListener('click',()=> navTo('energy')); }
  });
}
function renderEnergyPage(m){
  if(!m) return;
  $('#e2Current') && ($('#e2Current').textContent = (m.energy && m.energy.kwh!=null?`${m.energy.kwh} kWh`:'-- kWh'));
  $('#e2Today')   && ($('#e2Today').textContent   = (m.energy && m.energy.kwh!=null?`${(m.energy.kwh*0.6).toFixed(1)} kWh`:'--'));
  $('#e2Week')    && ($('#e2Week').textContent    = (m.energy && m.energy.kwh!=null?`${(m.energy.kwh*4).toFixed(1)} kWh`:'--'));
  $('#e2Offline') && ($('#e2Offline').textContent = (m.devicesOfflineCount!=null? m.devicesOfflineCount : '--'));
}

/* === MODEL loader & home ================================================== */
function loadModel(){
  return new Promise((resolve,reject)=>{
    window.onModel=(m)=>{ try{ MODEL=m; renderHome(m); renderCruscotto(m); renderEnergyPage(m); resolve(m);}catch(e){reject(e);} };
    const s=document.createElement('script'); s.src=nocache(`${ENDPOINT_URL}?callback=onModel`); s.onerror=reject; document.body.appendChild(s);
    setTimeout(()=>{ try{s.remove();}catch{} },3000);
  });
}
function renderHome(m){
  setBadgeState(m && m.state);
  if(m && m.weather){
    $('#weatherIcon')  && ($('#weatherIcon').textContent  = weatherEmoji(m.weather.iconEmoji||''));
    $('#weatherTemp')  && ($('#weatherTemp').textContent  = (m.weather.tempC!=null?Math.round(m.weather.tempC)+'°':'--°'));
    $('#weatherWind')  && ($('#weatherWind').textContent  = (m.weather.windKmh!=null?Math.round(m.weather.windKmh)+' km/h':'-- km/h'));
    // Alba/Tramonto pill
    $('#lblAlbaSmall')     && ($('#lblAlbaSmall').textContent     = toHm(m.next && m.next.pianteAlba));
    $('#lblTramontoSmall') && ($('#lblTramontoSmall').textContent = toHm(m.next && m.next.piantePostClose));
  }
  const ev=(m && m.energy && m.energy.kwh!=null)?m.energy.kwh:null;
  $('#energyValue') && ($('#energyValue').textContent=(ev!=null?String(ev)+' kWh':'— kWh'));

  $('#lblOverride') && ($('#lblOverride').textContent=(m && m.override)?'On':'Off');
  $('#lblVacanza')  && ($('#lblVacanza').textContent =(m && m.vacanza)?'On':'Off');
  $('#btnOverride') && $('#btnOverride').classList.toggle('on', !!(m && m.override));
  $('#btnVacanza')  && $('#btnVacanza').classList.toggle('on',  !!(m && m.vacanza));

  const st=String(m && m.state || '').toUpperCase(); isUpGuess=(st==='COMFY_DAY');
  $('#lblAlza') && ($('#lblAlza').textContent=isUpGuess?'Abbassa':'Alza');

  const ppl=(m && m.people)?m.people:[]; const onCount=ppl.filter(p=>p.online).length;
  $('#peopleSummary') && ($('#peopleSummary').textContent=`${onCount} online / ${ppl.length} totali`);
}

/* === Strict/Hold quick actions (legacy prompt) =========================== */
async function getStrictLifeMin(){ try{ const res=await jsonp('?admin=1&event=get_strict'); if(res&&res.ok) return Number(res.strict)||0; }catch(_){} return 10; }
async function setStrictLifeMin(){
  const cur=await getStrictLifeMin();
  const val=prompt('Minuti LIFE per presenza diurna (STRICT_LIFE_MIN):', String(cur));
  if(val===null) return;
  const n=Number(val); if(!isFinite(n)||n<0){ toast('Valore non valido'); return; }
  await callAdmin('set_strict', n); toast('STRICT_LIFE_MIN = '+n+' min');
  await loadModel(); if(ACTIVE_TAB==='people') loadPeople();
}
async function getMorningHold(){ try{ const res=await jsonp('?admin=1&event=get_hold'); if(res&&res.ok) return Number(res.hold)||0; }catch(_){} return 120; }
async function setMorningHold(){
  const cur=await getMorningHold();
  const val=prompt('Grace dopo ALBA (MORNING_HOLD_MIN, minuti):', String(cur));
  if(val===null) return;
  const n=Number(val); if(!isFinite(n)||n<0){ toast('Valore non valido'); return; }
  await callAdmin('set_hold', n); toast('MORNING_HOLD_MIN = '+n+' min');
  await loadModel();
}

/* === Impostazioni: loader e salvataggi =================================== */
async function loadSettingsPage(){
  try{
    const [rStrict, rHold, rKaAuto, rExitG, rExitC, rFlags, rRet] = await Promise.all([
      jsonp('?admin=1&event=get_strict'),
      jsonp('?admin=1&event=get_hold'),
      jsonp('?admin=1&event=get_ka_auto'),
      jsonp('?admin=1&event=get_exit_guard'),
      jsonp('?admin=1&event=get_exit_confirm'),
      jsonp('?admin=1&event=get_flags'),
      jsonp('?admin=1&event=get_log_retention')
    ]);

    $('#inpStrict')      && ($('#inpStrict').value      = (rStrict && rStrict.ok) ? (rStrict.strict||0) : '');
    $('#inpHold')        && ($('#inpHold').value        = (rHold   && rHold.ok)   ? (rHold.hold||0)     : '');
    $('#selKaAuto')      && ($('#selKaAuto').value      = (rKaAuto && rKaAuto.ok) ? String(!!rKaAuto.ka_auto) : 'true');
    $('#inpExitGuard')   && ($('#inpExitGuard').value   = (rExitG  && rExitG.ok)  ? (rExitG.exit_guard||0)   : '');
    $('#inpExitConfirm') && ($('#inpExitConfirm').value = (rExitC  && rExitC.ok)  ? (rExitC.exit_confirm||0) : '');
    $('#inpLogRetention')&& ($('#inpLogRetention').value= (rRet    && rRet.ok)    ? (rRet.days||7)           : '7');

    const o = !!(rFlags && rFlags.ok && rFlags.override);
    const v = !!(rFlags && rFlags.ok && rFlags.vacanza);
    $('#lblOverrideState') && ($('#lblOverrideState').textContent = o?'ON':'OFF');
    $('#lblVacanzaState')  && ($('#lblVacanzaState').textContent  = v?'ON':'OFF');

    // skin "strong" sui bottoni toggle della pagina
    $('#btnToggleOverride')?.classList.add('btn-io');
    $('#btnToggleVacanza')?.classList.add('btn-io');
    $('#btnToggleOverride')?.classList.toggle('on', o);
    $('#btnToggleVacanza')?.classList.toggle('on', v);

    // aggiorna testo "prossime corse" irrigazione (se hai la label)
    if($('#lblIrrNext')){
      const a = MODEL && MODEL.next && MODEL.next.pianteAlba ? toHm(MODEL.next.pianteAlba) : '--:--';
      const p = MODEL && MODEL.next && MODEL.next.piantePostClose ? toHm(MODEL.next.piantePostClose) : '--:--';
      $('#lblIrrNext').textContent = `🌅 ${a} · 🌇 ${p}`;
    }
  }catch(_){
    toast('Errore lettura impostazioni');
  }
}

async function saveSettingNumber(evt, value){
  if(!isFinite(Number(value)) || Number(value)<0){ toast('Valore non valido'); return false; }
  const res = await callAdmin(evt, Number(value));
  return (res && res.ok);
}
async function saveSettingBool(evt, boolValue){
  const res = await jsonp(`?admin=1&event=${encodeURIComponent(evt)}&value=${boolValue?'true':'false'}`);
  return (res && res.ok);
}

/* === Wiring pagina impostazioni ========================================== */
function wireSettings(){
  const btnGear = $('#btnOpenSettings');
  if(btnGear){ btnGear.addEventListener('click', async ()=>{ navTo('settings'); await loadSettingsPage(); }); }

  // Salvataggi numerici
  $('#btnSaveStrict')?.addEventListener('click', async ()=>{
    const ok = await saveSettingNumber('set_strict', $('#inpStrict').value);
    toast(ok?'Salvato':'Errore salvataggio'); if(ok) await loadModel();
  });
  $('#btnSaveHold')?.addEventListener('click', async ()=>{
    const ok = await saveSettingNumber('set_hold', $('#inpHold').value);
    toast(ok?'Salvato':'Errore salvataggio'); if(ok) await loadModel();
  });
  $('#btnSaveKaAuto')?.addEventListener('click', async ()=>{
    const ok = await saveSettingBool('set_ka_auto', $('#selKaAuto').value==='true');
    toast(ok?'Salvato':'Errore salvataggio');
  });
  $('#btnSaveExitGuard')?.addEventListener('click', async ()=>{
    const ok = await saveSettingNumber('set_exit_guard', $('#inpExitGuard').value);
    toast(ok?'Salvato':'Errore');
  });
  $('#btnSaveExitConfirm')?.addEventListener('click', async ()=>{
    const ok = await saveSettingNumber('set_exit_confirm', $('#inpExitConfirm').value);
    toast(ok?'Salvato':'Errore');
  });

  // Log retention + purge
  $('#btnSaveLogRetention')?.addEventListener('click', async ()=>{
    const v = Number($('#inpLogRetention').value);
    if(!isFinite(v) || v<=0){ toast('Valore non valido'); return; }
    const res = await jsonp(`?admin=1&event=set_log_retention&value=${v}`);
    toast((res && res.ok)?'Salvato':'Errore');
  });
  $('#btnPruneLogs')?.addEventListener('click', async ()=>{
    const res = await jsonp(`?admin=1&event=prune_logs`);
    toast((res && res.ok)?'Log ripuliti':'Errore purge');
    if(ACTIVE_TAB==='log') loadErrors();
  });

  // Toggle override/vacanza (aggiornano anche la tile in Home)
  $('#btnToggleOverride')?.addEventListener('click', async ()=>{
    try{
      const flags1 = await jsonp('?admin=1&event=get_flags');
      const cur = !!(flags1 && flags1.ok && flags1.override);
      const ok  = await saveSettingBool('set_override', !cur);
      if(!ok){ toast('Errore override'); return; }
      const flags2 = await jsonp('?admin=1&event=get_flags');
      const nowOn  = !!(flags2 && flags2.ok && flags2.override);
      $('#lblOverrideState') && ($('#lblOverrideState').textContent = nowOn?'ON':'OFF');
      $('#lblOverride')      && ($('#lblOverride').textContent      = nowOn?'On':'Off');
      $('#btnOverride')      && $('#btnOverride').classList.toggle('on', nowOn);
      $('#btnToggleOverride')&& $('#btnToggleOverride').classList.toggle('on', nowOn);
      toast('Override: '+(nowOn?'ON':'OFF'));
      await loadModel();
    }catch(_){ toast('Errore override'); }
  });

  $('#btnToggleVacanza')?.addEventListener('click', async ()=>{
    try{
      const flags1 = await jsonp('?admin=1&event=get_flags');
      const cur = !!(flags1 && flags1.ok && flags1.vacanza);
      const ok  = await saveSettingBool('set_vacanza', !cur);
      if(!ok){ toast('Errore vacanza'); return; }
      const flags2 = await jsonp('?admin=1&event=get_flags');
      const nowOn  = !!(flags2 && flags2.ok && flags2.vacanza);
      $('#lblVacanzaState') && ($('#lblVacanzaState').textContent = nowOn?'ON':'OFF');
      $('#lblVacanza')      && ($('#lblVacanza').textContent      = nowOn?'On':'Off');
      $('#btnVacanza')      && $('#btnVacanza').classList.toggle('on', nowOn);
      $('#btnToggleVacanza')&& $('#btnToggleVacanza').classList.toggle('on', nowOn);
      toast('Vacanza: '+(nowOn?'ON':'OFF'));
      await loadModel();
    }catch(_){ toast('Errore vacanza'); }
  });
}

/* === Wiring globale ======================================================= */
function wire(){
  $$('.nav-btn').forEach(b=> b.addEventListener('click', ()=> navTo(b.getAttribute('data-tab')) ));
  $('#peopleBar')?.addEventListener('click', ()=> navTo('people'));

  $('#btnOverride')?.addEventListener('click', async ()=>{
    const cur=!!(MODEL&&MODEL.override); await callAdmin('set_override', !cur);
    toast('Override: '+(!cur?'On':'Off')); await loadModel();
  });
  $('#btnVacanza')?.addEventListener('click', async ()=>{
    const cur=!!(MODEL&&MODEL.vacanza); await callAdmin('set_vacanza', !cur);
    toast('Vacanza: '+(!cur?'On':'Off')); await loadModel();
  });

  // Irrigazione manuale (per ora semplice; poi mettiamo guardie server-side)
  $('#btnPiante')?.addEventListener('click', async ()=>{ await callAdmin('piante'); toast('Piante avviato'); });

  // Alza/Abbassa tutto
  $('#btnAlza')?.addEventListener('click', async ()=>{
    const doDown=( $('#lblAlza') && $('#lblAlza').textContent==='Abbassa' );
    if(doDown){ await callAdmin('abbassa_tutto'); toast('Abbassa tutto'); isUpGuess=false; $('#lblAlza') && ($('#lblAlza').textContent='Alza'); }
    else      { await callAdmin('alza_tutto');    toast('Alza tutto');    isUpGuess=true;  $('#lblAlza') && ($('#lblAlza').textContent='Abbassa'); }
  });

  // Shortcuts legacy
  const btnStrict=$('#btnStrictLife');  if(btnStrict) btnStrict.addEventListener('click', setStrictLifeMin);
  const btnHold  =$('#btnMorningHold'); if(btnHold)   btnHold.addEventListener('click', setMorningHold);
}

document.addEventListener('DOMContentLoaded', async ()=>{
  wire();
  wireSettings();
  try{ await loadModel(); }catch(e){ toast('Errore caricamento modello'); console.error(e); }
  // auto-refresh ogni 2 minuti
  setInterval(async ()=>{
    try{
      await loadModel();
      if(ACTIVE_TAB==='people')  loadPeople();
      if(ACTIVE_TAB==='devices') loadCams();
      if(ACTIVE_TAB==='log')     loadErrors();
    }catch(e){}
  }, 120000);
});
