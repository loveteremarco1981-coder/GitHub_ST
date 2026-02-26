/* Automazione UI — SmartThings-like 2x2 (badge DAY/NIGHT + people ts + autorefresh) */
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbzgpinR2mH8Da9CHULvyY6Jk-kFCWuyv1fumqWcpdCi7AdElBc1Kt-CxMYa9pW-Yvqf/exec';

let MODEL = null;
let isUpGuess = true;
let ACTIVE_TAB = 'home';

const $  = (s)=> document.querySelector(s);
const $$ = (s)=> Array.from(document.querySelectorAll(s));

function toast(m){ const t=$('#toast'); t.textContent=m||''; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1700); }
function fmtTs(d){ if(!d) return '—'; const dt=(d instanceof Date)?d:new Date(d); return new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(dt); }
function weatherEmoji(k){ const map={sun:'☀️',few:'🌤️',part:'⛅',cloud:'☁️',fog:'🌫️',drizzle:'🌦️',rain:'🌧️',showers:'🌦️',storm:'⛈️',hail:'🌨️'}; return map[k]||'☀️'; }
function nocache(u){ const sep=u.includes('?')?'&':'?'; return u+sep+'t='+Date.now(); }

function setBadgeState(state){
  const el = $('#stateBadge');
  el.className = 'state-badge';
  if(!state){ el.textContent = '—'; return; }
  const s = String(state).toUpperCase();      // es. COMFY_DAY
  if(s.startsWith('COMFY'))    el.classList.add('ok');
  else if(s.startsWith('SECURITY')) el.classList.add('alert');
  el.textContent = s.replace('_',' ');        // -> "COMFY DAY"
}

function navTo(tab){
  ACTIVE_TAB = tab;
  const map = {home:'#pageHome', people:'#pagePeople', devices:'#pageDevices', log:'#pageLog', cruscotto:"#pageCruscotto"};
  $$('.page').forEach(p=>p.classList.remove('page-active'));
  $(map[tab]).classList.add('page-active');
  $$('.nav-btn').forEach(b=>b.classList.remove('nav-active'));
  $(`.nav-btn[data-tab="${tab}"]`).classList.add('nav-active');
  if(tab==='people')  loadPeople();
  if(tab==='devices') loadCams();
  if(tab==='log')     loadErrors();
}

/* Admin calls (JSONP) */
function callAdmin(evt, value){
  return new Promise((resolve,reject)=>{
    const cb = 'cb_admin_'+Math.random().toString(36).slice(2);
    const timer = setTimeout(()=>{ toast('Timeout comando: '+evt); reject(new Error('timeout')); }, 6000);
    window[cb] = (res)=>{ clearTimeout(timer); try{ delete window[cb]; }catch{}; resolve(res); };
    const v = (value===undefined)? '' : '&value='+encodeURIComponent(String(value));
    const url = nocache(`${ENDPOINT_URL}?admin=1&event=${encodeURIComponent(evt)}&callback=${cb}${v}`);
    const s = document.createElement('script'); s.src = url; s.onerror = reject;
    document.body.appendChild(s);
    setTimeout(()=>{ try{ s.remove(); }catch{} }, 2000);
  });
}

/* Helper JSONP generico */
function jsonp(path, cbname){
  return new Promise((resolve,reject)=>{
    const cb = cbname || ('cb_'+Math.random().toString(36).slice(2));
    window[cb] = (res)=>{ try{ delete window[cb]; resolve(res); }catch{} };
    const url = nocache(`${ENDPOINT_URL}${path}${path.includes('?')?'&':'?'}callback=${cb}`);
    const s = document.createElement('script'); s.src = url; s.onerror = reject;
    document.body.appendChild(s);
    setTimeout(()=>{ try{ s.remove(); }catch{} }, 3000);
  });
}

/* People / Cams / Errors */
function loadPeople(){
  jsonp('?people=1').then(res=>{
    const arr = (res && res.people) ? res.people : [];
    const ul = $('#peopleList'); ul.innerHTML = '';
    arr.forEach(p=>{
      const li = document.createElement('li');
      const left = document.createElement('div');
      const tsDisplay = (p && p.ts) ? fmtTs(p.ts) : (p && p.tsText ? p.tsText : '—');
      left.innerHTML = `<div>${p.name}</div><div class="sub">${p.lastEvent||'—'} • ${tsDisplay}</div>`;
      const right = document.createElement('div');
      right.innerHTML = `<span class="badge ${p.online?'ok':'err'}">${p.online?'Online':'Offline'}</span>`;
      li.appendChild(left); li.appendChild(right); ul.appendChild(li);
    });
  }).catch(()=>{ /* ignore */ });
}
function loadCams(){
  jsonp('?cams=1').then(res=>{
    const ci = $('#camInterne'), ce = $('#camEsterne');
    const iOn = !!(res && res.interne), eOn = !!(res && res.esterne);
    ci.textContent = iOn ? 'ON' : 'OFF'; ci.className = 'badge '+(iOn?'ok':'err');
    ce.textContent = eOn ? 'ON' : 'OFF'; ce.className = 'badge '+(eOn?'ok':'err');
  }).catch(()=>{ /* ignore */ });
}
function loadErrors(){
  jsonp('?errors=1').then(res=>{
    const ul = $('#logErrors'); ul.innerHTML='';
    const arr = (res && res.errors) ? res.errors : [];
    if(arr.length===0){ const li = document.createElement('li'); li.textContent='Nessun errore'; ul.appendChild(li); return; }
    arr.forEach(e=>{
      const li = document.createElement('li');
      li.innerHTML = `<div>${e.code||'ERR'}</div><div class="sub">${e.desc||''} • ${fmtTs(e.ts)}</div>`;
      ul.appendChild(li);
    });
  }).catch(()=>{ /* ignore */ });
}

function renderCruscotto(m) {
  const el = $("#cruscottoGrid");
  if (!el) return;

  const tiles = [
    {
      title: "Stato",
      icon: "🟢",
      value: m.state || "--"
    },
    {
      title: "Presenza",
      icon: m.presenzaEffettiva ? "🏠" : "🚪",
      value: m.presenzaEffettiva ? "IN CASA" : "FUORI"
    },
    {
      title: "Meteo",
      icon: m.weather?.iconEmoji || "☁️",
      value: `${m.weather?.tempC ?? "--"}° · ${m.weather?.windKmh ?? "--"} km/h`
    },
    {
      title: "Telecamere",
      icon: "📷",
      value: camsText(m)
    },
    {
      title: "Alba",
      icon: "🌅",
      value: formatTimeOrDash(m.next?.pianteAlba)
    },
    {
      title: "Tramonto",
      icon: "🌇",
      value: formatTimeOrDash(m.next?.piantePostClose)
    },
    {
      title: "Energy",
      icon: "⚡",
      value: m.energy?.kwh != null ? `${m.energy.kwh} kWh` : "--"
    },
    {
      title: "Online",
      icon: "👥",
      value: `${m.people.filter(p=>p.online).length} / ${m.people.length}`
    }
  ];

  el.innerHTML = tiles.map(t => `
    <div class="cr-tile">
      <div class="cr-icon">${t.icon}</div>
      <div class="cr-title">${t.title}</div>
      <div class="cr-value">${t.value}</div>
    </div>
  `).join("");
}

function camsText(m) {
  const s = String(m.state || '').toUpperCase();
  if (s.startsWith("SECURITY")) return "ON · ON";
  if (s === "COMFY_NIGHT") return "OFF · ON";
  return "OFF · OFF";
}

function formatTimeOrDash(v) {
  if (!v || v === "—") return "—";
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit"});
}

function camsText(m) {
  return m.state?.startsWith("SECURITY")
    ? "ON · ON"
    : m.state === "COMFY_NIGHT"
      ? "OFF · ON"
      : "OFF · OFF";
}

function formatTimeOrDash(v) {
  if (!v || v === "—") return "—";
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit"});
}


/* Modello completo (Home) */
function loadModel(){
  return new Promise((resolve,reject)=>{
    window.onModel = (m)=>{ try{ MODEL=m; renderHome(m); resolve(m); renderCruscotto(m); }catch(e){reject(e);} };
    const s = document.createElement('script');
    s.src = nocache(`${ENDPOINT_URL}?callback=onModel`); s.onerror = reject;
    document.body.appendChild(s);
    setTimeout(()=>{ try{ s.remove(); }catch{} }, 3000);
  });
}

/* Render Home */
function renderHome(m){
  setBadgeState(m && m.state);

  if(m && m.weather){
    $('#weatherIcon').textContent = weatherEmoji(m.weather.iconEmoji || '');
    $('#weatherTemp').textContent = (m.weather.tempC!=null ? Math.round(m.weather.tempC)+'°' : '--°');
    $('#weatherWind').textContent = (m.weather.windKmh!=null ? Math.round(m.weather.windKmh)+' km/h' : '-- km/h');
  }
  const ev = (m && m.energy && m.energy.kwh!=null) ? m.energy.kwh : null;
  $('#energyValue').textContent = (ev!=null ? String(ev)+' kWh' : '— kWh');

  $('#lblOverride').textContent = (m && m.override) ? 'On' : 'Off';
  $('#lblVacanza').textContent  = (m && m.vacanza) ? 'On' : 'Off';
  $('#btnOverride').classList.toggle('on', !!(m && m.override));
  $('#btnVacanza').classList.toggle('on',  !!(m && m.vacanza));

  const st = String(m && m.state || '').toUpperCase();
  isUpGuess = (st==='COMFY_DAY');
  $('#lblAlza').textContent = isUpGuess ? 'Abbassa' : 'Alza';

  const ppl = (m && m.people) ? m.people : [];
  const onCount = ppl.filter(p=>p.online).length;
  $('#peopleSummary').textContent = `${onCount} online / ${ppl.length} totali`;
}

/* Event wiring */
function wire(){
  $$('.nav-btn').forEach(b=> b.addEventListener('click', ()=> navTo(b.getAttribute('data-tab')) ));
  $('#peopleBar').addEventListener('click', ()=> navTo('people'));

  $('#btnOverride').addEventListener('click', async ()=>{
    const cur = !!(MODEL && MODEL.override);
    await callAdmin('set_override', !cur);
    toast('Override: '+(!cur?'On':'Off'));
    await loadModel();
  });
  $('#btnVacanza').addEventListener('click', async ()=>{
    const cur = !!(MODEL && MODEL.vacanza);
    await callAdmin('set_vacanza', !cur);
    toast('Vacanza: '+(!cur?'On':'Off'));
    await loadModel();
  });
  $('#btnPiante').addEventListener('click', async ()=>{ await callAdmin('piante'); toast('Piante avviato'); });
  $('#btnAlza').addEventListener('click', async ()=>{
    const doDown = ( $('#lblAlza').textContent === 'Abbassa' );
    if(doDown){ await callAdmin('abbassa_tutto'); toast('Abbassa tutto'); isUpGuess=false; $('#lblAlza').textContent='Alza'; }
    else      { await callAdmin('alza_tutto');    toast('Alza tutto');    isUpGuess=true;  $('#lblAlza').textContent='Abbassa'; }
  });
}

/* Bootstrap + auto-refresh */
document.addEventListener('DOMContentLoaded', async ()=>{
  wire();
  try{ await loadModel(); }catch(e){ toast('Errore caricamento modello'); console.error(e); }
  // refresh ogni 2 minuti
  setInterval(async ()=>{
    try{
      await loadModel();
      if (ACTIVE_TAB==='people')  loadPeople();
      if (ACTIVE_TAB==='devices') loadCams();
      if (ACTIVE_TAB==='log')     loadErrors();
    }catch(e){ /* ignore */ }
  }, 120000);
});
