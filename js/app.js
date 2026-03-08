/* app.js — OneConnect UI (v2.3.1) */
'use strict';

let MODEL=null, ACTIVE_TAB='home', isUpGuess=true, REFRESH_TIMER=null;

const $  = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));
function toast(m){ try{ console.log(m); }catch(_){ } }
function setBadgeState(st){
  const el=$('#stateBadge'); if(!el) return;
  el.className='state-badge';
  if(!st){ el.textContent='—'; return; }
  const s=String(st).toUpperCase();
  if(s.startsWith('COMFY')) el.classList.add('ok');
  else if(s.startsWith('SECUR')) el.classList.add('alert');
  el.textContent=s.replace('_',' ');
}
function fmtTs(d){ if(!d) return '—'; const dt=(d instanceof Date)?d:new Date(d); return isNaN(dt)?'—':new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(dt); }
function timeOnly(v){
  if(!v||v==='—') return '—';
  if(v instanceof Date && !isNaN(v)) return v.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  const s=String(v).trim();
  // hh:mm o hh.mm
  let m=s.match(/^(\d{1,2})\d{2}$/); if(m) return m[1].padStart(2,'0')+':'+m[2];
  // prova Date standard
  const d=new Date(s); if(!isNaN(d)) return d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  // prova dd/mm/yyyy hh:mm
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\d{2}/); if(m) return m[4].padStart(2,'0')+':'+m[5];
  return '—';
}

/* NAV */
function navTo(tab){
  ACTIVE_TAB=tab;
  const map={home:'#pageHome',people:'#pagePeople',devices:'#pageDevices',log:'#pageLog',cruscotto:'#pageCruscotto',energy:'#pageEnergy',settings:'#pageSettings',tests:'#pageTests'};
  $$('.page').forEach(p=>p.classList.remove('page-active'));
  if(map[tab]) $(map[tab]).classList.add('page-active');
  $$('.nav-btn').forEach(b=>b.classList.remove('nav-active'));
  $(`.nav-btn[data-tab="${tab}"]`)?.classList.add('nav-active');
  if(tab==='people') loadPeople();
  if(tab==='devices') loadCams();
  if(tab==='log') loadErrors();
  if(tab==='energy') renderEnergyPage(MODEL);
  if(tab==='settings') loadSettingsPage();
  if(tab==='tests') refreshTestsPage(true);
}
window.navTo=navTo;

/* JSONP MODEL */
function jsonpModel(path=''){
  const base=window.EXEC_URL;
  return new Promise((resolve,reject)=>{
    try{
      const cb='cb_model_'+Math.random().toString(36).slice(2);
      window[cb]=(data)=>{ try{delete window[cb];}catch(_){ } resolve(data); };
      const s=document.createElement('script');
      s.src=`${base}${path}${path.includes('?')?'&':'?'}callback=${cb}&t=${Date.now()}`;
      s.onerror=(e)=>{ try{delete window[cb];}catch(_){ } reject(e); };
      document.body.appendChild(s);
      setTimeout(()=>{ try{s.remove();}catch(_){ } },8000);
    }catch(e){ reject(e); }
  });
}
async function fetchModelOnce(){
  const m=await jsonpModel();
  if(!m||typeof m!=='object') throw new Error('MODEL vuoto');
  MODEL=m; renderHome(m); renderCruscotto(m); renderEnergyPage(m); return m;
}
async function loadModelWithRetry(){
  const delays=[0,2000,5000];
  for(let i=0;i<delays.length;i++){
    try{ if(delays[i]) await new Promise(r=>setTimeout(r,delays[i])); await fetchModelOnce(); return true; }
    catch(e){ if(i===delays.length-1) console.error('MODEL failed',e); }
  } return false;
}

/* RENDER HOME */
function renderHome(m){
  setBadgeState(m&&m.state);
  if(m&&m.weather){
    $('#weatherIcon')&&($('#weatherIcon').textContent=(m.weather.iconEmoji||'☁️'));
    $('#weatherTemp')&&($('#weatherTemp').textContent=(m.weather.tempC!=null?Math.round(m.weather.tempC)+'°':'--°'));
    $('#weatherWind')&&($('#weatherWind').textContent=(m.weather.windKmh!=null?Math.round(m.weather.windKmh)+' km/h':'-- km/h'));
  }
  const ev=(m?.energy?.kwh!=null)?m.energy.kwh:null;
  $('#energyValue')&&($('#energyValue').textContent=(ev!=null?String(ev)+' kWh':'— kWh'));
  $('#lblOverride')&&($('#lblOverride').textContent=(m?.override?'On':'Off'));
  $('#lblVacanza')&&($('#lblVacanza').textContent=(m?.vacanza?'On':'Off'));
  $('#btnOverride')&&$('#btnOverride').classList.toggle('on',!!m?.override);
  $('#btnVacanza')&&$('#btnVacanza').classList.toggle('on',!!m?.vacanza);
  const st=String(m?.state||'').toUpperCase(); isUpGuess=(st==='COMFY_DAY');
  $('#lblAlza')&&($('#lblAlza').textContent=isUpGuess?'Abbassa':'Alza');
  const ppl=(m?.people)||[]; const on=ppl.filter(p=>p.online).length;
  $('#peopleSummary')&&($('#peopleSummary').textContent=`${on} online / ${ppl.length} totali`);
}

/* RENDER CRUSCOTTO */
function camsText(m){ const s=String(m?.state||'').toUpperCase(); if(s.startsWith('SECURITY'))return 'ON · ON'; if(s==='COMFY_NIGHT')return 'OFF · ON'; return 'OFF · OFF'; }
function renderCruscotto(m){
  const el=$('#cruscottoGrid'); if(!el||!m) return;
  const tiles=[
    {key:'state',title:'Stato',icon:'🟢',value:m.state||'--',cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'animate-pulse')},
    {key:'presence',title:'Presenza',icon:(m.presenzaEffettiva?'🏠':'🚪'),value:(m.presenzaEffettiva?'IN CASA':'FUORI'),cls:(m.presenzaEffettiva?'animate-pulse':'')},
    {key:'meteo',title:'Meteo',icon:(m.weather?.iconEmoji||'☁️'),value:`${m.weather?.tempC!=null?Math.round(m.weather.tempC):'--'}° · ${m.weather?.windKmh!=null?Math.round(m.weather.windKmh):'--'} km/h`,cls:'animate-breath'},
    {key:'cams',title:'Telecamere',icon:'📷',value:camsText(m),cls:(String(m.state||'').startsWith('SECURITY')?'animate-breath':'')},
    {key:'alba',title:'Alba',icon:'🌅',value:timeOnly(m.next?.alba),cls:''},
    {key:'tramonto',title:'Tramonto',icon:'🌇',value:timeOnly(m.next?.tramonto),cls:''},
    {key:'energy',title:'Energy',icon:'⚡',value:(m.energy?.kwh!=null?`${m.energy.kwh} kWh`:'--'),cls:'animate-pulse oc-energy'},
    {key:'online',title:'Online',icon:'👥',value:`${(m.people||[]).filter(p=>p.online).length} / ${(m.people||[]).length}`,cls:''}
  ];
  el.innerHTML=tiles.map(t=>`
    <div class="cr-tile" data-key="${t.key}">
      <div class="cr-icon ${t.cls}">${t.icon}</div>
      <div class="cr-title">${t.title}</div>
      <div class="cr-value">${t.value}</div>
    </div>`).join('');
  el.querySelectorAll('.cr-tile[data-key="energy"]').forEach(t=>{ t.style.cursor='pointer'; t.addEventListener('click',()=>navTo('energy')); });
}

/* RENDER ENERGY */
function renderEnergyPage(m){
  if(!m) return;
  $('#e2Current')&&($('#e2Current').textContent=(m.energy?.kwh!=null?`${m.energy.kwh} kWh`:'-- kWh'));
  $('#e2Today')&&($('#e2Today').textContent=(m.energy?.kwh!=null?`${(m.energy.kwh*0.6).toFixed(1)} kWh`:'--'));
  $('#e2Week')&&($('#e2Week').textContent=(m.energy?.kwh!=null?`${(m.energy.kwh*4).toFixed(1)} kWh`:'--'));
  $('#e2Offline')&&($('#e2Offline').textContent=(m.devicesOfflineCount!=null?m.devicesOfflineCount:'--'));
}

/* PEOPLE / CAMS / LOG */
async function loadPeople(){
  try{
    const res=await jsonpModel('?people=1');
    const arr=(res?.people)||[];
    const ul=$('#peopleList'); if(!ul) return; ul.innerHTML='';
    for(const p of arr){
      const li=document.createElement('li');
      const left=document.createElement('div');
      const ts=(p?.ts?fmtTs(p.ts):(p?.tsText||'—'));
      left.innerHTML=`<div>${p.name}</div><div class="sub">${p.lastEvent||'—'} • ${ts}</div>`;
      const right=document.createElement('div');
      const badge=document.createElement('span'); const on=!!p.online;
      badge.className='badge '+(on?'ok':'err'); badge.textContent=on?'Online':'Offline'; right.appendChild(badge);
      li.appendChild(left); li.appendChild(right); ul.appendChild(li);
    }
  }catch(_){}
}
async function loadCams(){
  try{
    const r=await jsonpModel('?cams=1'); const iOn=!!r?.interne, eOn=!!r?.esterne;
    const ci=$('#camInterne'), ce=$('#camEsterne');
    if(ci){ ci.textContent=iOn?'ON':'OFF'; ci.className='badge '+(iOn?'ok':'err'); }
    if(ce){ ce.textContent=eOn?'ON':'OFF'; ce.className='badge '+(eOn?'ok':'err'); }
  }catch(_){}
}
async function loadErrors(){
  try{
    const r=await jsonpModel('?logs=1'); const ul=$('#logErrors'); if(!ul) return; ul.innerHTML='';
    const arr=(r?.logs)||[]; if(arr.length===0){ const li=document.createElement('li'); li.textContent='Nessun errore'; ul.appendChild(li); return; }
    arr.forEach(e=>{ const li=document.createElement('li'); li.innerHTML=`<div>${e.code||'ERR'}</div><div class="sub">${e.desc||''} • ${fmtTs(e.ts)}</div>`; ul.appendChild(li); });
  }catch(_){}
}

/* TEST PAGE (Issue 48) */
function classifyLogCode(code){
  const c=String(code||'');
  if(c.startsWith('TEST_PASS'))return'PASS';
  if(c.startsWith('TEST_SKIP'))return'SKIP';
  if(c.startsWith('TEST_FAIL'))return'FAIL';
  if(c.indexOf('_ERR')>=0||c.startsWith('ERROR_'))return'ERR';
  if(c.endsWith('_BLOCK')||c.endsWith('_IGNORED'))return'WARN';
  return'';
}
function renderIssuesReport(logs){
  const issues=[]; (logs||[]).forEach((r,idx)=>{ const t=classifyLogCode(r.code); if(t==='FAIL'||t==='ERR'){ issues.push({id:(r.code||'ISSUE')+'-'+(logs.length-idx),code:r.code||'',desc:r.desc||'',ts:r.ts}); }});
  const donut=$('#issueDonut'); const cnt=issues.length;
  if(donut){ donut.style.setProperty('--pct', cnt>0?'100%':'0%'); donut.classList.toggle('bad',cnt>0); donut.querySelector('.num').textContent=String(cnt); }
  const sum=$('#issueSummary'); if(sum){ sum.textContent=(cnt===0?'Nessun problema rilevato negli ultimi log':`${cnt} problemi trovati negli ultimi log`); }
  const ul=$('#issuesList'); if(!ul) return; ul.innerHTML='';
  if(cnt===0){ const li=document.createElement('li'); li.className='issue-row'; li.innerHTML=`<div class="issue-id">Tutto OK</div><span class="badge ok">Passed</span>`; ul.appendChild(li); return; }
  issues.slice(0,12).forEach(it=>{
    const li=document.createElement('li'); li.className='issue-row';
    const sev=(it.code.startsWith('TEST_FAIL')||it.code.indexOf('_ERR')>=0||it.code.startsWith('ERROR_'))?'<span class="badge err">Errore</span>':'<span class="badge warn">Warn</span>';
    li.innerHTML=`<div class="issue-id">${it.id}</div><div class="issue-meta"><span>${it.code}</span>${sev}<span class="sub">${fmtTs(it.ts)}</span></div>`;
    ul.appendChild(li);
  });
}
async function refreshTestsPage(force=false){
  try{ const v=await api.version(); if(v?.ok && $('#backendVersion')) $('#backendVersion').textContent=v.version||'—'; }catch(_){}
  try{ const r=await jsonpModel('?logs=1'); renderIssuesReport((r?.logs)||[]); }catch(_){}
}
window.refreshTestsPage=refreshTestsPage;

/* SETTINGS: loader/saver (come da versione precedente, puoi riusare i tuoi) */
async function loadSettingsPage(){ /* opzionale: se già lo hai, mantieni il tuo */ }

/* WIRING */
function wire(){
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>navTo(b.getAttribute('data-tab'))));
  $('#peopleBar')?.addEventListener('click',()=>navTo('people'));
  $('#btnOverride')?.addEventListener('click',async()=>{ const f1=await apiFetch('get_flags'); const cur=!!(f1?.ok&&f1.override); await apiFetch('set_override',{value:String(!cur).toUpperCase()}); toast('Override: '+(!cur?'On':'Off')); refreshNow(); });
  $('#btnVacanza')?.addEventListener('click',async()=>{ const f1=await apiFetch('get_flags'); const cur=!!(f1?.ok&&f1.vacanza); await apiFetch('set_vacanza',{value:String(!cur).toUpperCase()}); toast('Vacanza: '+(!cur?'On':'Off')); refreshNow(); });
  $('#btnPiante')?.addEventListener('click',async()=>{ const r=await apiFetch('piante'); toast(r?.ok?'Piante avviato':'Piante bloccate'); });
  $('#btnAlza')?.addEventListener('click',async()=>{ const goDown=(($('#lblAlza')?.textContent)||'')==='Abbassa'; if(goDown){ await apiFetch('abbassa_tutto'); $('#lblAlza').textContent='Alza'; } else { await apiFetch('alza_tutto'); $('#lblAlza').textContent='Abbassa'; } });
  $('#btnOpenSettings')?.addEventListener('click',()=>navTo('settings'));
}

async function refreshNow(){
  await loadModelWithRetry();
  if(ACTIVE_TAB==='people') loadPeople();
  if(ACTIVE_TAB==='devices') loadCams();
  if(ACTIVE_TAB==='log') loadErrors();
  if(ACTIVE_TAB==='energy') renderEnergyPage(MODEL);
  if(ACTIVE_TAB==='tests') refreshTestsPage();
}

document.addEventListener('DOMContentLoaded', async ()=>{
  wire();
  await refreshNow();
  REFRESH_TIMER=setInterval(refreshNow,60000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshNow(); });
  window.addEventListener('online',refreshNow);
  window.addEventListener('refreshDashboard',refreshNow);
});
