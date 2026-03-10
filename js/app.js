/* app.js — GoAppSync UI (versione completa 2026) */
"use strict";

/* ==========================================================
 *  VARIABILI GLOBALI
 * ========================================================== */

let MODEL = null;
let ACTIVE_TAB = "home";
let REFRESH_TIMER = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* EXEC_URL: inserito dal tuo HTML */
if (!window.EXEC_URL) {
  console.error("EXEC_URL non definito!");
}

/* Toast */
function toast(msg) { try{ console.log(msg); }catch(_){} }

/* ==========================================================
 *  FORMATTING
 * ========================================================== */

function fmtTs(d) {
  if (!d) return "—";
  let dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(dt);
}

function timeOnly(v){
  if(!v || v==="—") return "—";
  if(v instanceof Date) {
    return v.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
  }
  let s=String(v).trim();

  let m=s.match(/^(\d{1,2}):(\d{2})$/);
  if(m) return m[1].padStart(2,'0')+":"+m[2];

  m=s.match(/^(\d{1,2})\.(\d{2})$/);
  if(m) return m[1].padStart(2,'0')+":"+m[2];

  const dd=new Date(s);
  if(!isNaN(dd)) return dd.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});

  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})[:.](\d{2})/);
  if(m) return m[4].padStart(2,'0')+":"+m[5];

  return "—";
}

/* ==========================================================
 *  NAVIGAZIONE
 * ========================================================== */

function navTo(tab){
  ACTIVE_TAB = tab;

  const map = {
    home: "#pageHome",
    people: "#pagePeople",
    devices: "#pageDevices",
    log: "#pageLog",
    cruscotto: "#pageCruscotto",
    energy: "#pageEnergy",
    settings: "#pageSettings",
    tests: "#pageTests"
  };

  $$(".page").forEach(p => p.classList.remove("page-active"));
  if(map[tab]) $(map[tab]).classList.add("page-active");

  $$(".nav-btn").forEach(b => b.classList.remove("nav-active"));
  const nb = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if(nb) nb.classList.add("nav-active");

  /* on enter page */
  if(tab==="people") loadPeople();
  if(tab==="devices") loadCams();
  if(tab==="log") loadErrors();
  if(tab==="tests") refreshTestsPage(true);
  if(tab==="cruscotto") renderIssuesMiniInDashboard();
  if(tab==="energy") renderEnergyPage(MODEL);
}
window.navTo = navTo;

/* ==========================================================
 *  JSONP MODEL
 * ========================================================== */

function jsonpModel(qs=""){
  const base = window.EXEC_URL;
  return new Promise((resolve,reject)=>{
    try {
      const cb = "cb_model_"+Math.random().toString(36).slice(2);
      window[cb] = data => { delete window[cb]; resolve(data); };

      const s = document.createElement("script");
      s.src = `${base}${qs}${qs.includes("?")?"&":"?"}callback=${cb}&t=${Date.now()}`;
      s.onerror = e => { delete window[cb]; reject(e); };

      document.body.appendChild(s);
      setTimeout(()=>{ try{s.remove();}catch(_){ } }, 7000);

    } catch(e){
      reject(e);
    }
  });
}

async function fetchModelOnce(){
  const m = await jsonpModel();
  MODEL = m;
  renderHome(m);
  renderCruscotto(m);
  renderEnergyPage(m);
  return m;
}

async function loadModelWithRetry(){
  const delays=[0,2000,5000];
  for(let d of delays){
    try{
      if(d) await new Promise(r=>setTimeout(r,d));
      await fetchModelOnce();
      return true;
    }catch(e){}
  }
  return false;
}

/* ==========================================================
 *  RENDER HOME
 * ========================================================== */

function setBadgeState(st){
  const el = $("#stateBadge");
  if(!el) return;
  el.className="state-badge";
  if(!st){ el.textContent="—"; return; }

  const s=String(st).toUpperCase();
  if(s.startsWith("COMFY")) el.classList.add("ok");
  else el.classList.add("alert");

  el.textContent = s.replace("_"," ");
}

function renderHome(m){
  if(!m) return;
  setBadgeState(m.state);

  if(m.weather){
    $("#weatherIcon").textContent = m.weather.iconEmoji || "☁️";
    $("#weatherTemp").textContent = 
      (m.weather.tempC!=null ? Math.round(m.weather.tempC)+"°" : "--°");
    $("#weatherWind").textContent =
      (m.weather.windKmh!=null ? Math.round(m.weather.windKmh)+" km/h" : "-- km/h");
  }

  const ev = (m.energy?.kwh!=null) ? String(m.energy.kwh)+" kWh" : "— kWh";
  $("#energyValue").textContent = ev;

  $("#lblOverride").textContent = m.override ? "On" : "Off";
  $("#lblVacanza").textContent = m.vacanza ? "On" : "Off";

  $("#btnOverride").classList.toggle("on", !!m.override);
  $("#btnVacanza").classList.toggle("on", !!m.vacanza);

  const st=String(m.state||"").toUpperCase();
  const isUpGuess = (st === "COMFY_DAY");
  $("#lblAlza").textContent = isUpGuess ? "Abbassa" : "Alza";

  const ppl = m.people || [];
  const on = ppl.filter(p=>p.online).length;
  $("#peopleSummary").textContent = `${on} online / ${ppl.length} totali`;
}

/* ==========================================================
 *  RENDER CRUSCOTTO
 * ========================================================== */

function camsText(m){
  const st = String(m?.state||"").toUpperCase();
  if(st.startsWith("SECURITY")) return "ON • ON";
  if(st==="COMFY_NIGHT") return "OFF • ON";
  return "OFF • OFF";
}

function renderCruscotto(m){
  const el = $("#cruscottoGrid");
  if(!m || !el) return;

  const tiles = [
    {key:"state",title:"Stato",icon:"🟢",value:m.state||"--"},
    {key:"presence",title:"Presenza",icon:(m.presenzaEffettiva?"🏠":"🚪"),
     value:(m.presenzaEffettiva?"IN CASA":"FUORI")},
    {key:"meteo",title:"Meteo",icon:(m.weather?.iconEmoji||"🌤"),
     value:`${m.weather?.tempC!=null?Math.round(m.weather.tempC):"--"}° · ${m.weather?.windKmh!=null?Math.round(m.weather.windKmh):"--"} km/h`},
    {key:"cams",title:"Telecamere",icon:"📷",value:camsText(m)},
    {key:"alba",title:"Alba",icon:"🌅",value:timeOnly(m.next?.alba)},
    {key:"tramonto",title:"Tramonto",icon:"🌇",value:timeOnly(m.next?.tramonto)},
    {key:"energy",title:"Energy",icon:"⚡",
     value:(m.energy?.kwh!=null?`${m.energy.kwh} kWh`:"--")},
    {key:"online",title:"Online",icon:"👥",
     value:`${(m.people||[]).filter(p=>p.online).length} / ${(m.people||[]).length}`}
  ];

  el.innerHTML = tiles.map(t => `
    <div class="cr-tile">
      <div class="cr-icon">${t.icon}</div>
      <div class="cr-title">${t.title}</div>
      <div class="cr-value">${t.value}</div>
    </div>`).join("");

  renderIssuesMiniInDashboard();
}

/* ==========================================================
 *  ENERGY PAGE
 * ========================================================== */
function renderEnergyPage(m){
  if(!m) return;
  $("#e2Current").textContent = (m.energy?.kwh!=null ? `${m.energy.kwh} kWh` : "-- kWh");
  $("#e2Today").textContent   = (m.energy?.kwh!=null ? (m.energy.kwh*0.6).toFixed(1) : "--");
  $("#e2Week").textContent    = (m.energy?.kwh!=null ? (m.energy.kwh*4).toFixed(1) : "--");
  $("#e2Offline").textContent = (m.devicesOfflineCount!=null ? m.devicesOfflineCount : "--");
}

/* ==========================================================
 *  PEOPLE, DEVICES, LOG
 * ========================================================== */

async function loadPeople(){
  try{
    const res = await jsonpModel("?people=1");
    const arr = res?.people || [];
    const ul = $("#peopleList");
    ul.innerHTML = "";

    for(const p of arr){
      const li = document.createElement("li");
      const left = document.createElement("div");
      const ts = p.ts ? fmtTs(p.ts) : (p.tsText||"—");
      left.innerHTML = `
        <div>${p.name}</div>
        <div class="sub">${p.lastEvent||"—"} • ${ts}</div>`;

      const right = document.createElement("div");
      const badge = document.createElement("span");
      badge.className = "badge "+(p.online?"ok":"err");
      badge.textContent = p.online?"Online":"Offline";
      right.appendChild(badge);

      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);
    }

  }catch(_){}
}

async function loadCams(){
  try{
    const r = await jsonpModel("?cams=1");
    const iOn = !!r?.interne;
    const eOn = !!r?.esterne;

    $("#camInterne").textContent = iOn?"ON":"OFF";
    $("#camInterne").className   = "badge "+(iOn?"ok":"err");

    $("#camEsterne").textContent = eOn?"ON":"OFF";
    $("#camEsterne").className   = "badge "+(eOn?"ok":"err");
  }catch(_){}
}

async function loadErrors(){
  try{
    const r = await jsonpModel("?logs=1");
    const arr = (r?.logs||[])
      .filter(l => l.code.includes("ERR") || l.code.includes("ERROR"))
      .filter(l => !l.code.startsWith("ROUTER_"));

    const ul = $("#logErrors");
    ul.innerHTML = "";

    if(arr.length===0){
      const li=document.createElement("li");
      li.textContent="Nessun errore";
      ul.appendChild(li);
      return;
    }

    arr.forEach(e=>{
      const li=document.createElement("li");
      li.innerHTML = `
        <div>${e.code}</div>
        <div class="sub">${e.desc||""} • ${fmtTs(e.ts)}</div>`;
      ul.appendChild(li);
    });

  }catch(_){}
}

/* ==========================================================
 *  ISSUE CLASSIFICATION
 * ========================================================== */

function classifyLogCode(code){
  const c = String(code||"");
  if(c.startsWith("TEST_PASS")) return "PASS";
  if(c.startsWith("TEST_SKIP")) return "SKIP";
  if(c.startsWith("TEST_FAIL")) return "FAIL";
  if(c.includes("_ERR") || c.startsWith("ERROR_")) return "ERR";
  if(c.endsWith("_BLOCK") || c.endsWith("_IGNORED")) return "WARN";
  return "";
}

/* ==========================================================
 *  PAGE TESTS — FULL REPORT
 * ========================================================== */

function renderIssuesReport(logs){
  const issues = [];
  logs.forEach((r,idx)=>{
    const t = classifyLogCode(r.code);
    if(t==="FAIL" || t==="ERR"){
      issues.push({
        id: "ISSUE-"+(logs.length-idx),
        code:r.code,
        desc:r.desc,
        ts:r.ts
      });
    }
  });

  const donut = $("#issueDonut");
  const cnt = issues.length;

  donut.style.setProperty("--pct", cnt>0?"100%":"0%");
  donut.classList.toggle("bad",cnt>0);
  donut.querySelector(".num").textContent = cnt;

  $("#issueSummary").textContent = 
    (cnt===0 ? "Nessun problema recente" : `${cnt} problemi recenti`);

  const ul = $("#issuesList");
  ul.innerHTML = "";

  if(cnt===0){
    let li=document.createElement("li");
    li.className="issue-row";
    li.innerHTML=`<div class="issue-id">Tutto OK</div><span class="badge ok">OK</span>`;
    ul.appendChild(li);
    return;
  }

  issues.slice(0,12).forEach(it=>{
    let sev = (it.code.includes("_ERR") || it.code.startsWith("ERROR_"))
                ? "badge err"
                : "badge warn";
    let li=document.createElement("li");
    li.className="issue-row";
    li.innerHTML = `
      <div class="issue-id">${it.id}</div>
      <div class="issue-meta">
        <span>${it.code}</span>
        <span class="${sev}">${sev.includes("err")?"Errore":"Warn"}</span>
        <span class="sub">${fmtTs(it.ts)}</span>
      </div>`;
    ul.appendChild(li);
  });
}

/* ==========================================================
 *  MINI ISSUES IN CRUSCOTTO
 * ========================================================== */

async function renderIssuesMiniInDashboard(){
  try{
    const r = await jsonpModel("?logs=1");
    const logs = r?.logs || [];

    const issues = logs.filter(l=>{
      const t = classifyLogCode(l.code);
      if(t==="ERR" || t==="FAIL") return true;
      return false;
    }).filter(l=>!l.code.startsWith("ROUTER_"));

    const card = $("#issuesSummaryCard");
    const badge = $("#issuesCountBadge");
    const ul = $("#issuesMiniList");

    if(issues.length===0){
      badge.textContent="0";
      card.style.display="none";
      return;
    }

    badge.textContent = String(issues.length);
    card.style.display="";
    ul.innerHTML="";

    issues.slice(0,5).forEach(it=>{
      let sev=(it.code.includes("_ERR")?"badge err":"badge warn");
      let li=document.createElement("li");
      li.className="issue-row";
      li.innerHTML = `
        <div class="issue-id">${it.code}</div>
        <div class="issue-meta">
          <span>${it.code}</span>
          <span class="${sev}">${sev.includes("err")?"Errore":"Warn"}</span>
          <span class="sub">${fmtTs(it.ts)}</span>
        </div>`;
      ul.appendChild(li);
    });

  }catch(_){}
}

/* ==========================================================
 *  PAGE TEST — UPDATE
 * ========================================================== */

async function refreshTestsPage(force=false){
  try{
    const v=await api.version();
    if(v?.ok) $("#backendVersion").textContent = v.version;
  }catch(_){}

  try{
    const r=await jsonpModel("?logs=1");
    renderIssuesReport(r?.logs||[]);
  }catch(_){}
}
window.refreshTestsPage = refreshTestsPage;

/* ==========================================================
 *  API HELPERS
 * ========================================================== */

const api = {
  async fetch(qs){
    try{
      const u = `${EXEC_URL}?admin=1&event=${qs}`;
      const r = await fetch(u);
      return r.json();
    }catch(e){ return {ok:false,error:String(e)}; }
  },
  async quick(op,params){
    let url = `${EXEC_URL}?admin=1&event=diag_quick&op=${op}`;
    for(let k in params){
      url += `&${k}=${encodeURIComponent(params[k])}`;
    }
    const r = await fetch(url);
    return r.json();
  },
  async version(){
    const r = await fetch(`${EXEC_URL}?admin=1&event=version`);
    return r.json();
  }
};

async function apiFetch(ev, params={}){
  let url=`${EXEC_URL}?admin=1&event=${ev}`;
  for(let k in params){
    url += `&${k}=${encodeURIComponent(params[k])}`;
  }
  const r = await fetch(url);
  return r.json();
}

/* ==========================================================
 *  TEST BUTTONS
 * ========================================================== */

function setStatus(id,text,ok=true){
  const el=$("#"+id);
  if(!el) return;
  el.textContent=text;
  el.style.color = ok? "#7bd88f" : "#ff6b6b";
}

async function runQuick(op,params={},btnId=null,statusId="diagStatus"){
  if(statusId) setStatus(statusId,`Esecuzione: ${op}…`,true);
  const btn = btnId ? $("#"+btnId) : null;
  if(btn) btn.disabled = true;

  try{
    const res = await api.quick(op,params);
    if(btn) btn.disabled=false;

    if(res && res.ok){
      const map={
        list:"Lista trigger → Log",
        ka_on:`KA ON ${params?.name||""} (${params?.minutes||""}m)`,
        ka_off:`KA OFF ${params?.name||""}`,
        all_out:"Tutti OUT",
        all_in:"Tutti IN",
        verify_grace:"Verifica grace",
        snap:"Snapshot"
      };
      if(statusId) setStatus(statusId,`${map[op]||"OK"} ✓`,true);
      if(["all_out","all_in","verify_grace","snap"].includes(op)){
        window.dispatchEvent(new Event("refreshDashboard"));
      }
    } else {
      if(statusId) setStatus(statusId,"Errore: "+(res?.error||"unknown"),false);
    }

  }catch(e){
    if(statusId) setStatus(statusId,"Errore rete: "+e.message,false);
    if(btn) btn.disabled=false;
  }
}

/* ==========================================================
 *  REFRESH NOW
 * ========================================================== */

async function refreshNow(){
  await loadModelWithRetry();
  if(ACTIVE_TAB==="people") loadPeople();
  if(ACTIVE_TAB==="devices") loadCams();
  if(ACTIVE_TAB==="log") loadErrors();
  if(ACTIVE_TAB==="tests") refreshTestsPage();
  if(ACTIVE_TAB==="cruscotto") renderIssuesMiniInDashboard();
  if(ACTIVE_TAB==="energy") renderEnergyPage(MODEL);
}

/* ==========================================================
 *  WIRING
 * ========================================================== */

function wire(){

  /* Navbar */
  $$(".nav-btn").forEach(b=>{
    b.onclick=()=>navTo(b.getAttribute("data-tab"));
  });

  $("#peopleBar")?.addEventListener("click",()=>navTo("people"));

  $("#btnOverride")?.addEventListener("click", async()=>{
    const f1 = await apiFetch("get_flags");
    const cur = !!(f1?.ok && f1.override);
    await apiFetch("set_override",{value:String(!cur).toUpperCase()});
    toast("Override: "+(!cur?"On":"Off"));
    refreshNow();
  });

  $("#btnVacanza")?.addEventListener("click", async()=>{
    const f1 = await apiFetch("get_flags");
    const cur = !!(f1?.ok && f1.vacanza);
    await apiFetch("set_vacanza",{value:String(!cur).toUpperCase()});
    toast("Vacanza: "+(!cur?"On":"Off"));
    refreshNow();
  });

  $("#btnPiante")?.addEventListener("click", async()=>{
    const r = await apiFetch("piante");
    toast(r?.ok?"Piante avviato":"Piante bloccate");
  });

  $("#btnAlza")?.addEventListener("click", async()=>{
    const goDown = ($("#lblAlza")?.textContent)==="Abbassa";
    if(goDown){
      await apiFetch("abbassa_tutto");
      $("#lblAlza").textContent="Alza";
    } else {
      await apiFetch("alza_tutto");
      $("#lblAlza").textContent="Abbassa";
    }
  });

  $("#btnOpenSettings")?.addEventListener("click",()=>navTo("settings"));
  $("#btnOpenTests")?.addEventListener("click",()=>navTo("tests"));

  /* TEST page */

  $("#btnBackToCrusc")?.addEventListener("click",()=>navTo("cruscotto"));
  $("#btnRefreshReport")?.addEventListener("click",()=>refreshTestsPage(true));

  $("#btnRunFullTestTop")?.addEventListener("click", async()=>{
    const r = await apiFetch("diag_full_test");
    $("#testSuiteStatusTop").textContent = r.ok?"OK ✓":"Errore";
  });

  /* QUICK TEST BUTTONS */
  const bind = (id,fn)=>{ const el=$("#"+id); if(el) el.onclick=fn; };

  bind("tQuickList", ()=>runQuick("list",{}, "tQuickList","diagStatus"));
  bind("tKaOn", ()=>runQuick("ka_on",{name:"marco",minutes:5}, "tKaOn","diagStatus"));
  bind("tKaOff", ()=>runQuick("ka_off",{name:"marco"},"tKaOff","diagStatus"));
  bind("tAllIn", ()=>runQuick("all_in",{}, "tAllIn","diagStatus"));
  bind("tAllOut", ()=>runQuick("all_out",{}, "tAllOut","diagStatus"));
  bind("tVerifyGrace", ()=>runQuick("verify_grace",{}, "tVerifyGrace","diagStatus"));
  bind("tSnap", ()=>runQuick("snap",{}, "tSnap","diagStatus"));
}

/* ==========================================================
 *  DOM READY
 * ========================================================== */

document.addEventListener("DOMContentLoaded", async ()=>{
  wire();
  await refreshNow();

  try{ await refreshTestsPage(true); }catch(_){}
  REFRESH_TIMER = setInterval(refreshNow, 60000);

  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshNow(); });
  window.addEventListener("online",refreshNow);
  window.addEventListener("refreshDashboard",refreshNow);
});
