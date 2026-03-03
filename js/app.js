/* Automazione UI — OneConnect v2.3 (strict+hold + keepalive toggle) */

// === ENDPOINT della tua WebApp ===
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbwRpy4xgWj7cdcGi_1gI4YjxtoIVVJIzfeKNthKIBgtidFtfNQt-wKUy-SOznFwsPZY/exec';

let MODEL = null;
let isUpGuess = true;
let ACTIVE_TAB = 'home';

const $  = (s)=> document.querySelector(s);
const $$ = (s)=> Array.from(document.querySelectorAll(s));

function toast(m){
  const t=$('#toast'); t.textContent=m||'';
  t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1700);
}
function fmtTs(d){
  if(!d) return '—';
  const dt=(d instanceof Date)?d:new Date(d);
  return new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(dt);
}
function weatherEmoji(k){
  const map={sun:'☀️',few:'🌤️',part:'⛅',cloud:'☁️',fog:'🌫️',drizzle:'🌦️',rain:'🌧️',showers:'🌦️',storm:'⛈️',hail:'🌨️'};
  return map[k]||'☀️';
}
function nocache(u){ const sep=u.includes('?')?'&':'?'; return u+sep+'t='+Date.now(); }
function setBadgeState(state){
  const el=$('#stateBadge'); el.className='state-badge';
  if(!state){ el.textContent='—'; return; }
  const s=String(state).toUpperCase();
  if(s.startsWith('COMFY')) el.classList.add('ok');
  else if(s.startsWith('SECURITY')) el.classList.add('alert');
  el.textContent = s.replace('_',' ');
}
function navTo(tab){
  ACTIVE_TAB = tab;
  const map={ home:'#pageHome', people:'#pagePeople', devices:'#pageDevices', log:'#pageLog', cruscotto:'#pageCruscotto', energy:'#pageEnergy', settings:'#pageSettings' };
  $$('.page').forEach(p=>p.classList.remove('page-active'));
  $(map[tab]).classList.add('page-active');
  $$('.nav-btn').forEach(b=>b.classList.remove('nav-active'));
  $(`.nav-btn[data-tab="${tab}"]`)?.classList.add('nav-active');
  if(tab==='people')  loadPeople();
  if(tab==='devices') loadCams();
  if(tab==='log')     loadErrors();
  if(tab==='energy')  renderEnergyPage(MODEL);
}

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

// === KEEPALIVE helpers (UI <-> endpoint) ===================================
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

// === Persone / Cams / Log ==================================================
async function loadPeople(){
  try{
    const res = await jsonp('?people=1');
    const arr = (res && res.people) ? res.people : [];
    const ul  = $('#peopleList'); ul.innerHTML='';

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
      // stato iniziale (async)
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
    ci.textContent=iOn?'ON':'OFF'; ci.className='badge '+(iOn?'ok':'err');
    ce.textContent=eOn?'ON':'OFF'; ce.className='badge '+(eOn?'ok':'err');
  }).catch(()=>{});
}
function loadErrors(){
  jsonp('?logs=1').then(res=>{
    const ul=$('#logErrors'); ul.innerHTML='';
    const arr=(res&&res.logs)?res.logs:[];
    if(arr.length===0){ const li=document.createElement('li'); li.textContent='Nessun errore'; ul.appendChild(li); return; }
    arr.forEach(e=>{
      const li=document.createElement('li');
      li.innerHTML=`<div>${e.code||'ERR'}</div><div class="sub">${e.desc||''} • ${fmtTs(e.ts)}</div>`;
      ul.appendChild(li);
    });
  }).catch(()=>{});
}

// === Cruscotto / Energy ====================================================
function renderCruscotto(m){
  const el=$('#cruscottoGrid'); if(!el) return;
  const tiles=[
    {key:'state',    title:'Stato',      icon:'🟢', value:m.state||'--', cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'animate-pulse')},
    {key:'presence', title:'Presenza',   icon:(m.presenzaEffettiva?'🏠':'🚪'), value:(m.presenzaEffettiva?'IN CASA':'FUORI'), cls:(m.presenzaEffettiva?'animate-pulse':'')},
    {key:'meteo',    title:'Meteo',      icon:(m.weather?.iconEmoji||'☁️'), value:`${m.weather?.tempC ?? '--'}° · ${m.weather?.windKmh ?? '--'} km/h`, cls:'animate-breath'},
    {key:'cams',     title:'Telecamere', icon:'📷', value:camsText(m), cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'')},
    {key:'alba',     title:'Alba',       icon:'🌅', value:formatTimeOrDash(m.next?.pianteAlba), cls:''},
    {key:'tramonto', title:'Tramonto',   icon:'🌇', value:formatTimeOrDash(m.next?.piantePostClose), cls:''},
    {key:'energy',   title:'Energy',     icon:'⚡', value:(m.energy?.kwh!=null?`${m.energy.kwh} kWh`:'--'), cls:'animate-pulse oc-energy'},
    {key:'online',   title:'Online',     icon:'👥', value:`${m.people.filter(p=>p.online).length} / ${m.people.length}`, cls:''}
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
function renderEnergyPage(m){
  if(!m) return;
  $('#e2Current').textContent = m.energy?.kwh!=null?`${m.energy.kwh} kWh`:'-- kWh';
  $('#e2Today').textContent   = m.energy?.kwh!=null?`${(m.energy.kwh*0.6).toFixed(1)} kWh`:'--';
  $('#e2Week').textContent    = m.energy?.kwh!=null?`${(m.energy.kwh*4).toFixed(1)} kWh`:'--';
  $('#e2Offline').textContent = (m.devicesOfflineCount??'--');
}

// === MODEL loader & home ===================================================
function loadModel(){
  return new Promise((resolve,reject)=>{
    window.onModel=(m)=>{ try{ MODEL=m; renderHome(m); renderCruscotto(m); renderEnergyPage(m); resolve(m);}catch(e){reject(e);} };
    const s=document.createElement('script'); s.src=nocache(`${ENDPOINT_URL}?callback=onModel`); s.onerror=reject; document.body.appendChild(s);
    setTimeout(()=>{ try{s.remove();}catch{} },3000);
  });
}
function renderHome(m){
  setBadgeState(m&&m.state);
  if(m&&m.weather){
    $('#weatherIcon').textContent = weatherEmoji(m.weather.iconEmoji||'');
    $('#weatherTemp').textContent = (m.weather.tempC!=null?Math.round(m.weather.tempC)+'°':'--°');
    $('#weatherWind').textContent = (m.weather.windKmh!=null?Math.round(m.weather.windKmh)+' km/h':'-- km/h');
  }
  const ev=(m&&m.energy&&m.energy.kwh!=null)?m.energy.kwh:null;
  $('#energyValue').textContent=(ev!=null?String(ev)+' kWh':'— kWh');
  $('#lblOverride').textContent=(m&&m.override)?'On':'Off';
  $('#lblVacanza').textContent =(m&&m.vacanza)?'On':'Off';
  $('#btnOverride').classList.toggle('on', !!(m&&m.override));
  $('#btnVacanza').classList.toggle('on',  !!(m&&m.vacanza));
  const st=String(m&&m.state||'').toUpperCase(); isUpGuess=(st==='COMFY_DAY');
  $('#lblAlza').textContent=isUpGuess?'Abbassa':'Alza';

  const ppl=(m&&m.people)?m.people:[]; const onCount=ppl.filter(p=>p.online).length;
  $('#peopleSummary').textContent=`${onCount} online / ${ppl.length} totali`;
}

// === Strict/Hold actions ===================================================
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

// === SETTINGS: loader e salvataggi ======================================
async function loadSettingsPage(){
  try{
    // carica valori correnti
    const [rStrict, rHold, rKaAuto, rExitG, rExitC, rFlags] = await Promise.all([
      jsonp('?admin=1&event=get_strict'),
      jsonp('?admin=1&event=get_hold'),
      jsonp('?admin=1&event=get_ka_auto'),
      jsonp('?admin=1&event=get_exit_guard'),
      jsonp('?admin=1&event=get_exit_confirm'),
      jsonp('?admin=1&event=get_flags')
    ]);

    $('#inpStrict').value      = (rStrict && rStrict.ok) ? (rStrict.strict||0) : '';
    $('#inpHold').value        = (rHold   && rHold.ok)   ? (rHold.hold||0)     : '';
    $('#selKaAuto').value      = (rKaAuto && rKaAuto.ok) ? String(!!rKaAuto.ka_auto) : 'true';
    $('#inpExitGuard').value   = (rExitG  && rExitG.ok)  ? (rExitG.exit_guard||0)   : '';
    $('#inpExitConfirm').value = (rExitC  && rExitC.ok)  ? (rExitC.exit_confirm||0) : '';

    $('#lblOverrideState').textContent = (rFlags && rFlags.ok && rFlags.override)?'ON':'OFF';
    $('#lblVacanzaState').textContent  = (rFlags && rFlags.ok && rFlags.vacanza)?'ON':'OFF';
  }catch(_){
    toast('Errore lettura impostazioni');
  }
}

// salva singolo campo numerico
async function saveSettingNumber(evt, value){
  if(!isFinite(Number(value)) || Number(value)<0){ toast('Valore non valido'); return false; }
  const res = await callAdmin(evt, Number(value));
  return (res && res.ok);
}

// toggle boolean
async function saveSettingBool(evt, boolValue){
  const u = `?admin=1&event=${encodeURIComponent(evt)}&value=${boolValue?'true':'false'}`;
  const res = await jsonp(u);
  return (res && res.ok);
}

// === Wiring della pagina impostazioni ====================================
function wireSettings(){
  const goSettings = async ()=>{ navTo('settings'); await loadSettingsPage(); };

  // Gear in Cruscotto
  const btnGear = $('#btnOpenSettings');
  if(btnGear){ btnGear.addEventListener('click', goSettings); }

  // Salvataggi
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

  // override/vacanza toggle
  $('#btnToggleOverride')?.addEventListener('click', async ()=>{
    const flags = await jsonp('?admin=1&event=get_flags');
    const cur = !!(flags && flags.ok && flags.override);
    const ok = await saveSettingBool('set_override', !cur);
    if(ok){ $('#lblOverrideState').textContent = (!cur?'ON':'OFF'); toast('Override: '+(!cur?'ON':'OFF')); await loadModel(); }
  });
  $('#btnToggleVacanza')?.addEventListener('click', async ()=>{
    const flags = await jsonp('?admin=1&event=get_flags');
    const cur = !!(flags && flags.ok && flags.vacanza);
    const ok = await saveSettingBool('set_vacanza', !cur);
    if(ok){ $('#lblVacanzaState').textContent = (!cur?'ON':'OFF'); toast('Vacanza: '+(!cur?'ON':'OFF')); await loadModel(); }
  });
}

// === Wiring ================================================================
function wire(){
  $$('.nav-btn').forEach(b=> b.addEventListener('click', ()=> navTo(b.getAttribute('data-tab')) ));
  $('#peopleBar').addEventListener('click', ()=> navTo('people'));

  $('#btnOverride').addEventListener('click', async ()=>{
    const cur=!!(MODEL&&MODEL.override); await callAdmin('set_override', !cur);
    toast('Override: '+(!cur?'On':'Off')); await loadModel();
  });
  $('#btnVacanza').addEventListener('click', async ()=>{
    const cur=!!(MODEL&&MODEL.vacanza); await callAdmin('set_vacanza', !cur);
    toast('Vacanza: '+(!cur?'On':'Off')); await loadModel();
  });
  $('#btnPiante').addEventListener('click', async ()=>{ await callAdmin('piante'); toast('Piante avviato'); });
  $('#btnAlza').addEventListener('click', async ()=>{
    const doDown=( $('#lblAlza').textContent==='Abbassa' );
    if(doDown){ await callAdmin('abbassa_tutto'); toast('Abbassa tutto'); isUpGuess=false; $('#lblAlza').textContent='Alza'; }
    else      { await callAdmin('alza_tutto');    toast('Alza tutto');    isUpGuess=true;  $('#lblAlza').textContent='Abbassa'; }
  });

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
