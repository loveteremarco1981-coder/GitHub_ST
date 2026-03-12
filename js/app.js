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
  let m = s.match(/^(\d{1,2}):(\d{2})$/); if (m) return m[1].padStart(2,"0")+":"+m[2];
      m = s.match(/^(\d{1,2})\.(\d{2})$/); if (m) return m[1].padStart(2,"0")+":"+m[2];
  const d = new Date(s); if (!isNaN(d)) return d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
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
      window[cb] = (data)=>{ delete window[cb]; resolve(data); };

      const s = document.createElement("script");
      s.src = `${base}${qs}${qs.includes("?")?"&":"?"}callback=${cb}&t=${Date.now()}`;
      s.onerror = (e)=>{ delete window[cb]; reject(e); };

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
    home:"#pageHome",
    people:"#pagePeople",
    devices:"#pageDevices",
    log:"#pageLog",
    cruscotto:"#pageCruscotto",
    energy:"#pageEnergy",
    settings:"#pageSettings",
    tests:"#pageTests"
  };

  $$(".page").forEach(p=>p.classList.remove("page-active"));
  if (map[tab]) $(map[tab]).classList.add("page-active");

  $$(".bottom-nav .nav-btn").forEach(b=>b.classList.remove("nav-active"));
  const nb = document.querySelector(`.bottom-nav .nav-btn[data-tab="${tab}"]`);
  if (nb) nb.classList.add("nav-active");

  if (tab==="people") loadPeople();
  if (tab==="devices") loadCams();
  if (tab==="log") loadErrors();
  if (tab==="tests") refreshTestsPage(true);
  if (tab==="cruscotto") renderIssuesMiniInDashboard();
  if (tab==="energy") renderEnergyPage(MODEL);
}

window.navTo = navTo;

/* ===================== HOME ===================== */
function renderHome(m){
  if (!m) return;

  setBadgeState(m.state);

  if (m.weather){
    $("#weatherIcon").textContent = m.weather.iconEmoji || "🌤";
    $("#weatherTemp").textContent = m.weather.tempC!=null ? Math.round(m.weather.tempC)+"°" : "--°";
    $("#weatherWind").textContent = m.weather.windKmh!=null ? Math.round(m.weather.windKmh)+" km/h" : "-- km/h";
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

/* ===================== CAMS ===================== */
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

    const arr = (r?.logs || [])
      .filter(e => (e.code.includes("ERR") || e.code.includes("ERROR")))
      .filter(e => !String(e.code).startsWith("ROUTER_"));

    if (arr.length===0){
      const li = document.createElement("li"); li.textContent = "Nessun errore"; ul.appendChild(li); return;
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

window.refreshTestsPage = refreshTestsPage;

/* ===================== SETTINGS PAGE ===================== */
async function loadSettingsPage(){
  try{
    const [
      strict, hold, kaa, exitG, exitC, logDays,
      lifeTo, debIn, debOut, grace, pMin, flags
    ] = await Promise.all([
      api.getStrict(), api.getHold(), api.getKaAuto(),
      api.getExitGuard(), api.getExitConfirm(), api.getLogRetention(),
      api.getLifeTimeout(), api.getDebounceIn(), api.getDebounceOut(),
      api.getEmptyGrace(), api.getPianteMinInt(), apiFetch('get_flags')
    ]);

    const setVal = (id,v)=>{ 
      const el=$("#"+id); 
      if(el) el.value = (v!=null ? v : ""); 
    };

    setVal("inpStrict", strict?.strict);
    setVal("inpHold",   hold?.hold);

    $("#selKaAuto").value = String(kaa?.ka_auto).toUpperCase() === "TRUE" ? "true" : "false";

    setVal("inpExitGuard",   exitG?.exit_guard);
    setVal("inpExitConfirm", exitC?.exit_confirm);
    setVal("inpLogRetention", logDays?.days);

    setVal("inpLifeTimeout", lifeTo?.life_timeout);
    setVal("inpDebIn",       debIn?.debounce_in);
    setVal("inpDebOut",      debOut?.debounce_out);
    setVal("inpEmptyGrace",  grace?.empty_grace);
    setVal("inpPianteMin",   pMin?.min);

    $("#lblOverrideState").textContent = flags?.override ? "ON" : "OFF";
    $("#lblVacanzaState").textContent  = flags?.vacanza  ? "ON" : "OFF";

  }catch(e){
    console.error("loadSettingsPage error:", e);
  }

  // Binding
  const bind = (id,fn)=>{ const b=$("#"+id); if(b && !b._wired){ b._wired=true; b.onclick=fn; } };

  bind("btnSaveStrict",      async()=>{ const v=+$("#inpStrict").value;       const r=await api.setStrict(v);        toast(r.ok?'Salvato':'Errore'); });
  bind("btnSaveHold",        async()=>{ const v=+$("#inpHold").value;         const r=await api.setHold(v);          toast(r.ok?'Salvato':'Errore'); });
  bind("btnSaveKaAuto",      async()=>{ const v=$("#selKaAuto").value;        const r=await api.setKaAuto(v==='true'); toast(r.ok?'Salvato':'Errore'); });

  bind("btnSaveExitGuard",   async()=>{ const v=+$("#inpExitGuard").value;    const r=await api.setExitGuard(v);     toast(r.ok?'Salvato':'Errore'); });
  bind("btnSaveExitConfirm", async()=>{ const v=+$("#inpExitConfirm").value;  const r=await api.setExitConfirm(v);   toast(r.ok?'Salvato':'Errore'); });

  bind("btnSaveLogRetention",async()=>{ const v=+$("#inpLogRetention").value; const r=await api.setLogRetention(v);  toast(r.ok?'Salvato':'Errore'); });
  bind("btnPruneLogs",       async()=>{ const r=await api.pruneLogs();         toast(r.ok?'Log ripulito':'Errore'); });

  bind("btnSaveLifeTimeout", async()=>{ const v=+$("#inpLifeTimeout").value;  const r=await api.setLifeTimeout(v);   toast(r.ok?'Salvato':'Errore'); });
  bind("btnSaveDebIn",       async()=>{ const v=+$("#inpDebIn").value;        const r=await api.setDebounceIn(v);    toast(r.ok?'Salvato':'Errore'); });
  bind("btnSaveDebOut",      async()=>{ const v=+$("#inpDebOut").value;       const r=await api.setDebounceOut(v);   toast(r.ok?'Salvato':'Errore'); });
  bind("btnSaveEmptyGrace",  async()=>{ const v=+$("#inpEmptyGrace").value;   const r=await api.setEmptyGrace(v);    toast(r.ok?'Salvato':'Errore'); });
  bind("btnSavePianteMin",   async()=>{ const v=+$("#inpPianteMin").value;    const r=await api.setPianteMinInt(v);  toast(r.ok?'Salvato':'Errore'); });

  bind("btnToggleOverride",  async()=>{ 
    const f=await apiFetch("get_flags"); 
    const cur=!!(f?.ok && f.override); 
    const r=await apiFetch("set_override",{value:String(!cur).toUpperCase()}); 
    toast(r.ok?'OK':'Errore'); 
    loadSettingsPage(); 
  });

  bind("btnToggleVacanza",   async()=>{ 
    const f=await apiFetch("get_flags"); 
    const cur=!!(f?.ok && f.vacanza);  
    const r=await apiFetch("set_vacanza",{value:String(!cur).toUpperCase()});  
    toast(r.ok?'OK':'Errore'); 
    loadSettingsPage(); 
  });
}

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
    const f1=await apiFetch("get_flags"); 
    const cur=!!(f1?.ok && f1.override);
    await apiFetch("set_override",{value:String(!cur).toUpperCase()});
    toast("Override: "+(!cur?"On":"Off")); 
    refreshNow();
  });

  $("#btnVacanza")?.addEventListener("click", async()=>{
    const f1=await apiFetch("get_flags"); 
    const cur=!!(f1?.ok && f1.vacanza);
    await apiFetch("set_vacanza",{value:String(!cur).toUpperCase()});
    toast("Vacanza: "+(!cur?"On":"Off")); 
    refreshNow();
  });

  $("#btnPiante")?.addEventListener("click", async()=>{
    const r=await apiFetch("piante"); 
    toast(r?.ok?"Piante avviato":"Piante bloccate");
  });

  $("#btnAlza")?.addEventListener("click", async()=>{
    const goDown = ($("#lblAlza")?.textContent)==="Abbassa";
    if (goDown){ await apiFetch("abbassa_tutto"); $("#lblAlza").textContent="Alza"; }
    else       { await apiFetch("alza_tutto");    $("#lblAlza").textContent="Abbassa"; }
  });

  $("#btnOpenSettings")?.addEventListener("click", ()=>navTo("settings"));
  $("#btnOpenTests")?.addEventListener("click",     ()=>navTo("tests"));

  $("#btnBackToCrusc")?.addEventListener("click",   ()=>navTo("cruscotto"));
  $("#btnRefreshReport")?.addEventListener("click", ()=>refreshTestsPage(true));

  $("#btnRunFullTestTop")?.addEventListener("click", async()=>{
    try{
      const r=await apiFetch("diag_full_test");
      $("#testSuiteStatusTop").textContent = r?.ok?"OK ✓":"Errore";
    }catch(e){
      $("#testSuiteStatusTop").textContent='Errore rete';
    }
  });

  const bind=(id,fn)=>{ const el=$("#"+id); if(el) el.onclick=fn; };
  bind("tQuickList",   ()=>runQuick("list",{}, "tQuickList","diagStatus"));
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
