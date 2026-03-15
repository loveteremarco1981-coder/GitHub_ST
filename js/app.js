"use strict";

/* ===================== GLOBALI ===================== */
let MODEL = null;
let ACTIVE_TAB = "home";
let REFRESH_TIMER = null;

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function toast(msg){ try{ console.log(msg); }catch(_){ alert(msg); } }
if (!window.EXEC_URL){
  console.error("EXEC_URL non definito: verifica che api.js sia incluso PRIMA di app.js");
}

/* ===================== FORMATTER ===================== */
function fmtTs(d){
  if (!d) return "—";
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return "—";
  return new Intl.DateTimeFormat("it-IT",{dateStyle:"short",timeStyle:"short"}).format(dt);
}
function timeOnly(v){
  if (!v || v==="—") return "—";
  if (v instanceof Date && !isNaN(v)) {
    return v.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);        if (m) return m[1].padStart(2,"0")+":"+m[2];
      m = s.match(/^(\d{1,2})\.(\d{2})$/);       if (m) return m[1].padStart(2,"0")+":"+m[2];
  const d = new Date(s);                         if (!isNaN(d)) return d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})[:.](\d{2})/);
  if (m) return m[4].padStart(2,"0")+":"+m[5];
  return "—";
}

/* ===================== MODEL (JSONP) ===================== */
function jsonpModel(qs=""){
  const base = window.EXEC_URL;
  return new Promise((resolve,reject)=>{
    try{
      const cb = "cb_model_"+Math.random().toString(36).slice(2);
      const cleanup = ()=>{ try{ delete window[cb]; }catch(_){ } };
      window[cb] = (data)=>{ cleanup(); resolve(data); };
      const s = document.createElement("script");
      s.src = `${base}${qs}${qs.includes("?")?"&":"?"}callback=${cb}&t=${Date.now()}`;
      s.onerror = (e)=>{ cleanup(); reject(e); };
      document.body.appendChild(s);
      setTimeout(()=>{ try{s.remove();}catch(_){ } }, 8000);
    }catch(e){ reject(e); }
  });
}
async function fetchModelOnce(){
  const m = await jsonpModel();
  MODEL = (m && typeof m==="object") ? m : null;
  window.__lastModel__ = MODEL;
  if (!MODEL) throw new Error("MODEL vuoto");
  renderHome(MODEL);
  renderCruscotto(MODEL);
  renderEnergyPage(MODEL);
  return true;
}
async function loadModelWithRetry(){
  const delays = [0, 2000, 5000];
  for (const d of delays){
    try{
      if (d) await new Promise(r=>setTimeout(r,d));
      return await fetchModelOnce();
    }catch(_){}
  }
  return false;
}

/* ===================== NAVIGAZIONE ===================== */
function setBadgeState(st){
  const el = $("#stateBadge"); if(!el) return;
  el.className = "state-badge";
  if (!st){ el.textContent = "—"; return; }
  const s = String(st).toUpperCase();
  el.classList.add(s.startsWith("COMFY") ? "ok" : "alert");
  el.textContent = s.replace("_"," ");
}
function navTo(tab){
  ACTIVE_TAB = tab;
  const map = {
    home:"#pageHome", people:"#pagePeople", devices:"#pageDevices",
    log:"#pageLog", cruscotto:"#pageCruscotto", energy:"#pageEnergy",
    settings:"#pageSettings", tests:"#pageTests"
  };
  $$(".page").forEach(p=>p.classList.remove("page-active"));
  if (map[tab]) $(map[tab]).classList.add("page-active");

  $$(".bottom-nav .nav-btn").forEach(b=>b.classList.remove("nav-active"));
  const nb = document.querySelector(`.bottom-nav .nav-btn[data-tab="${tab}"]`);
  if (nb) nb.classList.add("nav-active");

  if (tab==="people")    loadPeople();
  if (tab==="devices")   loadCams();
  if (tab==="log")       loadErrors();
  if (tab==="tests")     refreshTestsPage(true);
  if (tab==="cruscotto") renderIssuesMiniInDashboard();
  if (tab==="energy")    renderEnergyPage(MODEL);
}
window.navTo = navTo;

/* ===================== HOME/CRUSCOTTO/ENERGY ===================== */
function renderHome(m){
  if (!m) return;
  setBadgeState(m.state);

  const wp = $("#weatherPill");
  if (!m.weather || (m.weather.tempC==null && m.weather.windKmh==null)){
    wp?.classList?.add("is-hidden");
  }else{
    wp?.classList?.remove("is-hidden");
    $("#weatherIcon").textContent = m.weather.iconEmoji || "🌤";
    $("#weatherTemp").textContent = (m.weather.tempC!=null ? Math.round(m.weather.tempC)+"°" : "--°");
    $("#weatherWind").textContent = (m.weather.windKmh!=null ? Math.round(m.weather.windKmh)+" km/h" : "-- km/h");
  }

  $("#energyValue").textContent = (m.energy?.kwh!=null ? `${m.energy.kwh} kWh` : "— kWh");

  $("#lblOverride").textContent = m.override ? "On" : "Off";
  $("#lblVacanza").textContent  = m.vacanza ? "On" : "Off";
  $("#btnOverride").classList.toggle("on", !!m.override);
  $("#btnVacanza").classList.toggle("on", !!m.vacanza);

  const st = String(m.state||"").toUpperCase();
  $("#lblAlza").textContent = st==="COMFY_DAY" ? "Abbassa" : "Alza";

  const ppl = m.people || [];
  $("#peopleSummary").textContent = `${ppl.filter(p=>p.online).length} online / ${ppl.length} totali`;
}
function camsText(m){
  const s = String(m?.state||"").toUpperCase();
  if (s.startsWith("SECURITY")) return "ON · ON";
  if (s==="COMFY_NIGHT")       return "OFF · ON";
  return "OFF · OFF";
}
function renderCruscotto(m){
  const el = $("#cruscottoGrid"); if (!el || !m) return;
  const tiles = [
    {key:'state',    title:'Stato',      icon:'🟢', value:(m.state||'—')},
    {key:'presence', title:'Presenza',   icon:(m.presenzaEffettiva?'🏠':'🚪'), value:(m.presenzaEffettiva?'IN CASA':'FUORI')},
    {key:'meteo',    title:'Meteo',      icon:(m.weather?.iconEmoji||'🌤'), value:`${m.weather?.tempC!=null?Math.round(m.weather.tempC):'--'}° · ${m.weather?.windKmh!=null?Math.round(m.weather.windKmh):'--'} km/h`},
    {key:'cams',     title:'Telecamere', icon:'📷', value:camsText(m)},
    {key:'alba',     title:'Alba',       icon:'🌅', value:timeOnly(m.next?.alba)},
    {key:'tramonto', title:'Tramonto',   icon:'🌇', value:timeOnly(m.next?.tramonto)},
    {key:'energy',   title:'Energy',     icon:'⚡',  value:(m.energy?.kwh!=null?`${m.energy.kwh} kWh`:'--')},
    {key:'online',   title:'Online',     icon:'👥', value:`${(m.people||[]).filter(p=>p.online).length} / ${(m.people||[]).length}`}
  ];
  el.innerHTML = tiles.map(t=>`
    <div class="cr-tile" data-key="${t.key}">
      <div class="cr-icon">${t.icon}</div>
      <div class="cr-title">${t.title}</div>
      <div class="cr-value">${t.value}</div>
    </div>`).join("");

  el.querySelectorAll('.cr-tile[data-key="energy"]').forEach(t=>{
    t.style.cursor = "pointer";
    t.addEventListener("click", ()=>navTo("energy"));
  });

  renderIssuesMiniInDashboard();
}
function renderEnergyPage(m){
  if (!m) return;
  $("#e2Current") && ($("#e2Current").textContent = (m.energy?.kwh!=null ? `${m.energy.kwh} kWh` : "-- kWh"));
  $("#e2Today")  && ($("#e2Today").textContent   = (m.energy?.kwh!=null ? (m.energy.kwh*0.6).toFixed(1) : "--"));
  $("#e2Week")   && ($("#e2Week").textContent    = (m.energy?.kwh!=null ? (m.energy.kwh*4).toFixed(1) : "--"));
  $("#e2Offline")&& ($("#e2Offline").textContent = (m.devicesOfflineCount!=null ? m.devicesOfflineCount : "--"));
}

/* ===================== PEOPLE / CAMS / LOG ===================== */
async function loadPeople(){
  try{
    const r = await jsonpModel("?people=1");
    const arr = r?.people || [];
    const ul = $("#peopleList"); if (!ul) return;
    ul.innerHTML = "";
    for (const p of arr){
      const ts = p.ts ? fmtTs(p.ts) : (p.tsText || "—");
      const li = document.createElement("li");
      li.innerHTML = `
        <div>${p.name}</div>
        <div class="sub">${p.lastEvent||"—"} • ${ts}</div>
        <div><span class="badge ${p.online?'ok':'err'}">${p.online?'Online':'Offline'}</span></div>`;
      ul.appendChild(li);
    }
  }catch(_){}
}
async function loadCams(){
  try{
    const r = await jsonpModel("?cams=1");
    const iOn = !!r?.interne;
    const eOn = !!r?.esterne;
    const ci = $("#camInterne");
    const ce = $("#camEsterne");
    if (ci){ ci.textContent = iOn ? "ON" : "OFF"; ci.className = "badge "+(iOn?"ok":"err"); }
    if (ce){ ce.textContent = eOn ? "ON" : "OFF"; ce.className = "badge "+(eOn?"ok":"err"); }
  }catch(_){}
}
async function loadErrors(){
  try{
    const r = await jsonpModel("?logs=1");
    const ul = $("#logErrors"); if (!ul) return;
    ul.innerHTML = "";

    // newest first + solo errori
    let arr = (r?.logs || []).slice().sort((a,b)=> new Date(b.ts||0) - new Date(a.ts||0));
    arr = arr.filter(e => (String(e.code||'').includes("ERR") || String(e.code||'').includes("ERROR")));

    if (arr.length===0){
      const li = document.createElement("li"); li.textContent = "Nessun errore";
      ul.appendChild(li); return;
    }
    arr.forEach(e=>{
      const li = document.createElement("li");
      li.innerHTML = `<div>${e.code}</div><div class="sub">${e.desc||""} • ${fmtTs(e.ts)}</div>`;
      ul.appendChild(li);
    });
  }catch(_){}
}

/* ===================== ISSUES ===================== */
function classifyLogCode(code){
  const c = String(code||"");
  if (c.startsWith("TEST_PASS")) return "PASS";
  if (c.startsWith("TEST_SKIP")) return "SKIP";
  if (c.startsWith("TEST_FAIL")) return "FAIL";
  if (c.includes("_ERR") || c.startsWith("ERROR_")) return "ERR";
  if (c.endsWith("_BLOCK") || c.endsWith("_IGNORED")) return "WARN";
  return "";
}
function renderIssuesReport(logs){
  const issues = [];
  (logs || []).forEach((r,idx)=>{
    const t = classifyLogCode(r.code);
    if (t==="FAIL" || t==="ERR"){
      issues.push({ id:`ISSUE-${(logs.length-idx)}`, code:r.code, desc:r.desc, ts:r.ts });
    }
  });

  const donut = $("#issueDonut");
  const cnt   = issues.length;

  if (donut){
    donut.style.setProperty("--pct", cnt>0 ? "100%" : "0%");
    donut.classList.toggle("bad", cnt>0);
    const num = donut.querySelector(".num"); if (num) num.textContent = String(cnt);
  }
  const sum = $("#issueSummary");
  if (sum) sum.textContent = (cnt===0 ? "Nessun problema recente" : `${cnt} problemi recenti`);

  const ul = $("#issuesList"); if (!ul) return;
  ul.innerHTML = "";

  if (cnt===0){
    const li = document.createElement("li");
    li.className = "issue-row";
    li.innerHTML = `<div class="issue-id">Tutto OK</div>
                    <div class="issue-meta"><span class="badge ok">OK</span></div>`;
    ul.appendChild(li);
    return;
  }

  issues.slice(0,12).forEach(it=>{
    const isErr = (it.code.includes("_ERR") || it.code.startsWith("ERROR_") || it.code.startsWith("TEST_FAIL"));
    const sevCls = isErr ? "badge err" : "badge warn";

    const li  = document.createElement("li");
    li.className = "issue-row";
    li.innerHTML = `
      <div>
        <div class="issue-id">${it.id}</div>
        <div class="sub">${it.desc ? it.desc : ''}</div>
      </div>
      <div class="issue-meta">
        <span class="issue-code">${it.code}</span>
        <span class="${sevCls}">${isErr ? "Errore" : "Warn"}</span>
        <span class="sub">${fmtTs(it.ts)}</span>
      </div>`;
    ul.appendChild(li);
  });
}
async function renderIssuesMiniInDashboard(){
  try{
    const r    = await jsonpModel("?logs=1");
    const logs = r?.logs || [];
    const issues = logs
      .filter(l => { const t = classifyLogCode(l.code); return (t==="ERR" || t==="FAIL"); })
      .filter(l => !String(l.code).startsWith("ROUTER_"));

    const card  = $("#issuesSummaryCard");
    const badge = $("#issuesCountBadge");
    const ul    = $("#issuesMiniList");
    if (!card || !badge || !ul) return;

    badge.textContent = String(issues.length);
    ul.innerHTML = "";
    if (issues.length===0){ card.style.display="none"; return; }

    card.style.display = "";
    issues.slice(0,5).forEach(it=>{
      const sev = (it.code.includes("_ERR") ? "badge err" : "badge warn");
      const li  = document.createElement("li");
      li.className = "issue-row";
      li.innerHTML = `<div class="issue-id">${it.code}</div>
        <div class="issue-meta"><span>${it.code}</span><span class="${sev}">${sev.includes("err")?"Errore":"Warn"}</span><span class="sub">${fmtTs(it.ts)}</span></div>`;
      ul.appendChild(li);
    });
  }catch(_){}
}

/* ===================== TESTS PAGE ===================== */
async function refreshTestsPage(force=false){
  try{
    const v = await api.version();
    if (v?.ok && $("#backendVersion")) $("#backendVersion").textContent = v.version;
  }catch(_){}
  try{
    const r = await jsonpModel("?logs=1");
    renderIssuesReport(r?.logs || []);
  }catch(_){}
}

/* ===== runQuick (feedback visibile) ===== */
async function runQuick(op, params={}, btnId=null, statusId="diagStatus"){
  const map = {
    list:       "Lista trigger → Log",
    ka_on:      `KA ON ${params?.name||""} (${params?.minutes||""}m)`,
    ka_off:     `KA OFF ${params?.name||""}`,
    all_in:     "Tutti IN",
    all_out:    "Tutti OUT",
    verify_grace:"Verifica grace",
    snap:       "Snapshot"
  };
  const label = map[op] || op.toUpperCase();
  const btn   = btnId ? document.getElementById(btnId) : null;

  const setStatus = (text, ok=true) => {
    const el = document.getElementById(statusId);
    if (el){ el.textContent = text; el.style.color = ok ? "#7bd88f" : "#ff6b6b"; }
    const top = document.getElementById("testSuiteStatusTop");
    if (top){ top.textContent = (ok ? "OK ✓ " : "ERR × ") + text; top.style.color = ok?"#7bd88f":"#ff6b6b"; }
  };

  try{
    if (btn) btn.disabled = true;
    setStatus(`Esecuzione: ${label}…`, true);
    const res = await api.quick(op, params);

    if (res && res.ok){
      setStatus(`${label} ✓`, true);
      toast(`${label}: OK`);
      if (op==="snap" && res.snapshot) console.log("SNAP:", res.snapshot);
    }else{
      const msg = res?.error || "unknown";
      setStatus(`${label} → ERRORE: ${msg}`, false);
      toast(`${label}: ERRORE`);
    }
  }catch(e){
    setStatus(`${label} → ERRORE RETE: ${e.message}`, false);
  }finally{
    if (btn) btn.disabled = false;
  }
}
window.refreshTestsPage = refreshTestsPage;

/* ===================== REFRESH CICLICO ===================== */
async function refreshNow(){
  await loadModelWithRetry();
  if (ACTIVE_TAB==="people")    loadPeople();
  if (ACTIVE_TAB==="devices")   loadCams();
  if (ACTIVE_TAB==="log")       loadErrors();
  if (ACTIVE_TAB==="tests")     refreshTestsPage();
  if (ACTIVE_TAB==="cruscotto") renderIssuesMiniInDashboard();
  if (ACTIVE_TAB==="energy")    renderEnergyPage(MODEL);
}

/* ===================== WIRING ===================== */
function wire(){
  $$(".bottom-nav .nav-btn").forEach(b=>{
    b.addEventListener("click", ()=>navTo(b.getAttribute("data-tab")));
  });

  $("#peopleBar")?.addEventListener("click", ()=>navTo("people"));

  $("#btnOverride")?.addEventListener("click", async()=>{
    const f1=await apiFetch("get_flags"); const cur=!!(f1?.ok&&f1.override);
    await apiFetch("set_override",{value:String(!cur).toUpperCase()});
    toast("Override: "+(!cur?"On":"Off")); refreshNow();
  });

  $("#btnVacanza")?.addEventListener("click", async()=>{
    const f1=await apiFetch("get_flags"); const cur=!!(f1?.ok&&f1.vacanza);
    await apiFetch("set_vacanza",{value:String(!cur).toUpperCase()});
    toast("Vacanza: "+(!cur?"On":"Off")); refreshNow();
  });

  // Piante (feedback)
  $("#btnPiante")?.addEventListener("click", async()=>{
    const r=await apiFetch("piante");
    toast(r?.ok ? "Irrigazione: AVVIATA" : ("Irrigazione: ERRORE → "+(r?.error||"")));
  });

  // Tapparelle (feedback + toggle label)
  $("#btnAlza")?.addEventListener("click", async()=>{
    const goDown = ($("#lblAlza")?.textContent)==="Abbassa";
    if (goDown){
      const res = await apiFetch("abbassa_tutto");
      toast(res?.ok ? "Tapparelle: GIÙ" : ("Tapparelle: ERRORE → "+(res?.error||"")));
      if (res?.ok) $("#lblAlza").textContent="Alza";
    }else{
      const res = await apiFetch("alza_tutto");
      toast(res?.ok ? "Tapparelle: SU" : ("Tapparelle: ERRORE → "+(res?.error||"")));
      if (res?.ok) $("#lblAlza").textContent="Abbassa";
    }
  });

  $("#btnOpenSettings")?.addEventListener("click", ()=>navTo("settings"));
  $("#btnOpenTests")?.addEventListener("click",     ()=>navTo("tests"));

  $("#btnBackToCrusc")?.addEventListener("click",   ()=>navTo("cruscotto"));
  $("#btnRefreshReport")?.addEventListener("click", ()=>refreshTestsPage(true));

  $("#btnRunFullTestTop")?.addEventListener("click", async()=>{
    try{ const r = await apiFetch("diag_full_test");
         const el= $("#testSuiteStatusTop"); if (el) el.textContent = (r?.ok?"OK ✓":"Errore"); }
    catch(e){ const el= $("#testSuiteStatusTop"); if (el) el.textContent = "Errore rete"; }
  });

  // Quick test buttons
  const bind=(id,fn)=>{ const el=$("#"+id); if(el) el.onclick=fn; };
  bind("tQuickList",   ()=>runQuick("list",{},  "tQuickList","diagStatus"));
  bind("tKaOn",        ()=>runQuick("ka_on",{name:"marco",minutes:5}, "tKaOn","diagStatus"));
  bind("tKaOff",       ()=>runQuick("ka_off",{name:"marco"}, "tKaOff","diagStatus"));
  bind("tAllIn",       ()=>runQuick("all_in",{}, "tAllIn","diagStatus"));
  bind("tAllOut",      ()=>runQuick("all_out",{}, "tAllOut","diagStatus"));
  bind("tVerifyGrace", ()=>runQuick("verify_grace",{}, "tVerifyGrace","diagStatus"));
  bind("tSnap",        ()=>runQuick("snap",{}, "tSnap","diagStatus"));
}

/* ===================== DOM READY ===================== */
document.addEventListener("DOMContentLoaded", async ()=>{
  wire();
  await refreshNow();
  try{ await refreshTestsPage(true); }catch(_){}
  REFRESH_TIMER = setInterval(refreshNow, 60000);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) refreshNow(); });
  window.addEventListener("online", refreshNow);
  window.addEventListener("refreshDashboard", refreshNow);
});

async function runFullTestUI(name='marco'){
  const card = document.querySelector('#pageTests .tests-grid .card'); // prima card
  let host = document.getElementById('fullTestSteps');
  if (!host){
    host = document.createElement('div');
    host.id = 'fullTestSteps';
    host.innerHTML = `
      <div class="card-title" style="margin-top:10px">Dettaglio Test Suite</div>
      <ul class="step-list"></ul>`;
    card?.appendChild(host);
  }
  const ul = host.querySelector('.step-list'); if (!ul) return;
  ul.innerHTML = '<li class="step">Esecuzione…</li>';

  // avvia
  const res = await apiFetch('diag_full_test', { name });

  // render
  ul.innerHTML = '';
  if (!res || !res.steps){
    const li = document.createElement('li');
    li.className='step err';
    li.textContent = 'Errore: risposta backend non valida';
    ul.appendChild(li);
    return;
  }

  res.steps.forEach(s=>{
    const li = document.createElement('li');
    li.className = 'step ' + (s.skipped ? 'skip' : (s.ok ? 'ok' : 'err'));
    li.innerHTML = `
      <div class="step-title">${s.title}</div>
      <div class="step-meta">${s.ms} ms</div>
      <div class="step-msg">${s.msg||''}</div>`;
    ul.appendChild(li);
  });

  // badge stato in alto
  const top = document.getElementById("testSuiteStatusTop");
  if (top){
    top.textContent = res.ok ? "OK ✓" : "ERR ×";
    top.style.color = res.ok ? "#7bd88f" : "#ff6b6b";
  }
}
