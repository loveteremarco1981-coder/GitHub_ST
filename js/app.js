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
/* Evita [object Object] dove serve */
function asText(v){
  if (v === null || v === undefined) return "—";
  const t = typeof v;
  if (t === "string")  return v || "—";
  if (t === "number")  return Number.isFinite(v) ? String(v) : "—";
  if (t === "boolean") return v ? "On" : "Off";
  if (Array.isArray(v)) return v.map(asText).join(", ");
  if (t === "object"){
    const keys = ["label","name","title","value","id","text","code"];
    for (const k of keys){ if (k in v && v[k] != null) return asText(v[k]); }
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

/* ===================== GETTER ROBUSTI (STATO / FLAGS / METEO / ALBA-TRAMONTO) ===================== */
function toTitle(s){
  return String(s||"")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Stato: priorità a Config!B1 (STATO), poi state.id|code|state|mode|value, infine day_night */
function getStateFromModel(m){
  if (!m) return { code:"", label:"—", source:null };
  const cfg = m.config || m.Config || {};
  let code = cfg.STATO || cfg.stato || m.STATO || m.stato;
  if (code) return { code:String(code).toUpperCase(), label: toTitle(code), source:"config" };

  const s = m.state || {};
  code = s.id || s.code || s.state || s.mode || s.value;
  if (code) return { code:String(code).toUpperCase(), label: toTitle(code), source:"state" };

  code = s.day_night || m.day_night;
  if (code){
    const up = String(code).toUpperCase();
    const label = (up==="GIORNO" ? "Giorno" : (up==="NOTTE" ? "Notte" : toTitle(up)));
    return { code: up, label, source:"day_night" };
  }
  return { code:"", label:"—", source:null };
}

/** Flags override/vacanza: supporta backend diversi */
function boolish(v){
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ["true","1","on","yes","y","si","s"].includes(s);
}
function getFlags(m){
  const f = (m && (m.flags || m.flag || m.Flags)) || {};
  const cfg = m?.config || m?.Config || {};
  return {
    override: boolish( f.override ?? cfg.OVERRIDE ?? cfg.override ),
    vacanza:  boolish( f.vacanza  ?? cfg.VACANZA  ?? cfg.vacanza  ),
  };
}

/** Meteo fallback su Config (TEMPC/WINDKMH) */
function getWeather(m){
  const w = m?.weather || {};
  const cfg = m?.config || m?.Config || {};
  const tempC   = (w.tempC   != null) ? w.tempC   : (cfg.TEMPC   != null ? Number(cfg.TEMPC)   : null);
  const windKmh = (w.windKmh != null) ? w.windKmh : (cfg.WINDKMH != null ? Number(cfg.WINDKMH) : null);
  const iconEmoji = w.iconEmoji || "🌤";
  return { tempC, windKmh, iconEmoji };
}

/** Alba/Tramonto: state.sunrise/sunset o next.alba/tramonto */
function getSunTimes(m){
  const n  = m?.next || {};
  const st = m?.state || {};
  const alba     = n.alba     || st.sunrise || st.nextSunrise || null;
  const tramonto = n.tramonto || st.sunset  || st.nextSunset  || null;
  return { alba, tramonto };
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
// Delegation GLOBALE per sicurezza (anche se wire() non parte)
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest?.('.bottom-nav .nav-btn[data-tab], [data-tab].nav-btn');
  if (!btn) return;
  ev.preventDefault();
  const tab = btn.getAttribute("data-tab");
  if (tab) navTo(tab);
});

function setBadgeState(m){
  const el = $("#stateBadge"); if(!el) return;
  const st = getStateFromModel(m);
  el.className = "state-badge";
  if (!st.code){ el.textContent = "—"; return; }
  el.classList.add(st.code.startsWith("COMFY") ? "ok" : "alert");
  el.textContent = st.label;
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

  // Stato badge
  setBadgeState(m);

  // Meteo
  const weather = getWeather(m);
  const wp = $("#weatherPill");
  if (weather.tempC==null && weather.windKmh==null){
    wp?.classList?.add("is-hidden");
  }else{
    wp?.classList?.remove("is-hidden");
    $("#weatherIcon").textContent = weather.iconEmoji;
    $("#weatherTemp").textContent = (weather.tempC!=null ? Math.round(weather.tempC)+"°" : "--°");
    $("#weatherWind").textContent = (weather.windKmh!=null ? Math.round(weather.windKmh)+" km/h" : "-- km/h");
  }

  // Energy
  $("#energyValue").textContent = (m.energy?.kwh!=null ? `${m.energy.kwh} kWh` : "— kWh");

  // Flags override/vacanza (da qualsiasi fonte)
  const flags = getFlags(m);
  $("#lblOverride").textContent = flags.override ? "On" : "Off";
  $("#lblVacanza").textContent  = flags.vacanza  ? "On" : "Off";
  $("#btnOverride").classList.toggle("on", !!flags.override);
  $("#btnVacanza").classList.toggle("on", !!flags.vacanza);

  // Tapparelle: etichetta dipende dallo stato
  const st = getStateFromModel(m).code;
  $("#lblAlza").textContent = st==="COMFY_DAY" ? "Abbassa" : "Alza";

  // Persone summary (se non c'è nel MODEL provo a leggerle al volo)
  const ppl = Array.isArray(m.people) ? m.people : [];
  $("#peopleSummary").textContent = `${ppl.filter(p=>p.online).length} online / ${ppl.length} totali`;
  if (!ppl.length){
    // fallback async: aggiorna il pill appena arriva
    jsonpModel("?people=1").then(r=>{
      const arr = normalizePeopleArray(r);
      $("#peopleSummary").textContent = `${arr.filter(p=>p.online).length} online / ${arr.length} totali`;
    }).catch(()=>{});
  }
}
function camsText(m){
  const s = getStateFromModel(m).code;
  if (s.startsWith("SECURITY")) return "ON · ON";
  if (s==="COMFY_NIGHT")       return "OFF · ON";
  return "OFF · OFF";
}
function renderCruscotto(m){
  const el = $("#cruscottoGrid"); if (!el || !m) return;

  const { alba, tramonto } = getSunTimes(m);
  const weather = getWeather(m);

  const tiles = [
    {key:'state',    title:'Stato',      icon:'🟢', value: getStateFromModel(m).label},
    {key:'presence', title:'Presenza',   icon:(m.presenzaEffettiva?'🏠':'🚪'), value:(m.presenzaEffettiva?'IN CASA':'FUORI')},
    {key:'meteo',    title:'Meteo',      icon:(weather.iconEmoji||'🌤'), value:`${weather.tempC!=null?Math.round(weather.tempC):'--'}° · ${weather.windKmh!=null?Math.round(weather.windKmh):'--'} km/h`},
    {key:'cams',     title:'Telecamere', icon:'📷', value:camsText(m)},
    {key:'alba',     title:'Alba',       icon:'🌅', value:timeOnly(alba)},
    {key:'tramonto', title:'Tramonto',   icon:'🌇', value:timeOnly(tramonto)},
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

/** Energy page */
function renderEnergyPage(m){
  if (!m) return;
  $("#e2Current") && ($("#e2Current").textContent = (m.energy?.kwh!=null ? `${m.energy.kwh} kWh` : "-- kWh"));
  $("#e2Today")  && ($("#e2Today").textContent   = (m.energy?.kwh!=null ? (m.energy.kwh*0.6).toFixed(1) : "--"));
  $("#e2Week")   && ($("#e2Week").textContent    = (m.energy?.kwh!=null ? (m.energy.kwh*4).toFixed(1) : "--"));
  $("#e2Offline")&& ($("#e2Offline").textContent = (m.devicesOfflineCount!=null ? m.devicesOfflineCount : "--"));
}

/* ===================== PEOPLE / CAMS / LOG ===================== */
function normalizePeopleArray(r){
  const base =
    Array.isArray(r?.people)        ? r.people :
    Array.isArray(r?.list)          ? r.list   :
    Array.isArray(r?.rows)          ? r.rows   :
    Array.isArray(r?.items)         ? r.items  :
    Array.isArray(r?.people?.list)  ? r.people.list :
    [];
  // normalizza i campi (Nome/ONLINE ecc.)
  return base.map(p=>{
    const name = p.name || p.Nome || p.nome || p.N || "—";
    const lastEvent = p.lastEvent || p.last_event || p.lastEvento || p.event || "";
    // ONLINE può essere booleano o stringa "IN/OUT"
    const online = (typeof p.online === "boolean")
      ? p.online
      : (String(p.online||p.ONLINE||"").toUpperCase()==="IN");
    const ts = p.ts || p.tsText || p.last_life_raw || p.last_life_dt || null;
    return { name, lastEvent, online, ts };
  });
}

async function loadPeople(){
  try{
    const r = await jsonpModel("?people=1");
    const arr = normalizePeopleArray(r);
    const ul = $("#peopleList"); if (!ul) return;
    ul.innerHTML = "";
    for (const p of arr){
      const ts = p.ts ? fmtTs(p.ts) : "—";
      const li = document.createElement("li");
      li.innerHTML = `
        <div>${asText(p.name)}</div>
        <div class="sub">${asText(p.lastEvent)||"—"} • ${ts}</div>
        <div><span class="badge ${p.online?'ok':'err'}">${p.online?'Online':'Offline'}</span></div>`;
      ul.appendChild(li);
    }
  }catch(_){}
}

async function loadCams(){
  try{
    const r = await jsonpModel("?cams=1");
    const iOn = !!(r?.interne ?? r?.inside ?? r?.int);
    const eOn = !!(r?.esterne ?? r?.outside ?? r?.ext);
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

    let arr = (r?.logs || []).slice().sort((a,b)=> new Date(b.ts||0) - new Date(a.ts||0));
    arr = arr.filter(e => (String(e.code||'').includes("ERR") || String(e.code||'').includes("ERROR")));

    if (arr.length===0){
      const li = document.createElement("li"); li.textContent = "Nessun errore";
      ul.appendChild(li); return;
    }
    arr.forEach(e=>{
      const li = document.createElement("li");
      li.innerHTML = `<div>${asText(e.code)}</div><div class="sub">${asText(e.desc)||""} • ${fmtTs(e.ts)}</div>`;
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
        <div class="issue-id">${asText(it.id)}</div>
        <div class="sub">${it.desc ? asText(it.desc) : ''}</div>
      </div>
      <div class="issue-meta">
        <span class="issue-code">${asText(it.code)}</span>
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
      li.innerHTML = `<div class="issue-id">${asText(it.code)}</div>
        <div class="issue-meta"><span>${asText(it.code)}</span><span class="${sev}">${sev.includes("err")?"Errore":"Warn"}</span><span class="sub">${fmtTs(it.ts)}</span></div>`;
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
// compat onclick legacy
window.handleQuickDiag_ = (op)=> runQuick(op, {}, null, "diagStatus");
window.handleGetVersion_ = async ()=>{
  try{
    const v = await api.version();
    if (v?.ok && $("#backendVersion")) $("#backendVersion").textContent = v.version;
  }catch(e){ toast("Versione backend: errore"); }
};

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
    b.addEventListener("click", (ev) => { ev.preventDefault(); navTo(b.getAttribute("data-tab")); });
  });

  $("#peopleBar")?.addEventListener("click", () => navTo("people"));

  $("#btnOverride")?.addEventListener("click", async() =>{
    // leggi lo stato attuale da get_flags, coercisci e fai toggle
    const f1 = await apiFetch("get_flags");
    const cur = boolish(f1?.override ?? f1?.flags?.override);
    await apiFetch("set_override",{value:String(!cur).toUpperCase()});
    toast("Override: "+(!cur?"On":"Off"));
    await refreshNow(); // <== refresh certo
  });

  $("#btnVacanza")?.addEventListener("click", async() =>{
    const f1 = await apiFetch("get_flags");
    const cur = boolish(f1?.vacanza ?? f1?.flags?.vacanza);
    await apiFetch("set_vacanza",{value:String(!cur).toUpperCase()});
    toast("Vacanza: "+(!cur?"On":"Off"));
    await refreshNow();
  });

  // Piante
  $("#btnPiante")?.addEventListener("click", async()=>{
    const r=await apiFetch("piante");
    toast(r?.ok ? "Irrigazione: AVVIATA" : ("Irrigazione: ERRORE → "+(r?.error||"")));
    await refreshNow();
  });

  // Tapparelle
  $("#btnAlza")?.addEventListener("click", async()=>{
    const goDown = ($("#lblAlza")?.textContent)==="Abbassa";
    let res;
    if (goDown){
      res = await apiFetch("abbassa_tutto");
      toast(res?.ok ? "Tapparelle: GIÙ" : ("Tapparelle: ERRORE → "+(res?.error||"")));
    }else{
      res = await apiFetch("alza_tutto");
      toast(res?.ok ? "Tapparelle: SU" : ("Tapparelle: ERRORE → "+(res?.error||"")));
    }
    await refreshNow();
  });

  $("#btnOpenSettings")?.addEventListener("click", () => navTo("settings"));
  $("#btnOpenTests")?.addEventListener("click",     () => navTo("tests"));

  $("#btnBackToCrusc")?.addEventListener("click",   () => navTo("cruscotto"));
  $("#btnRefreshReport")?.addEventListener("click", () => refreshTestsPage(true));

  $("#btnRunFullTestTop")?.addEventListener("click", async()=>{
    try{ const r = await apiFetch("diag_full_test");
         const el= $("#testSuiteStatusTop"); if (el) el.textContent = (r?.ok?"OK ✓":"Errore"); }
    catch(e){ const el= $("#testSuiteStatusTop"); if (el) el.textContent = "Errore rete"; }
  });

  // Quick test buttons (se usi id invece dell'onclick legacy)
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
  try{ wire(); }catch(e){ console.error("wire() error", e); }
  try{ await refreshNow(); }catch(e){ console.error("refreshNow() error", e); }
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
      <div class="step-title">${asText(s.title)}</div>
      <div class="step-meta">${asText(s.ms)} ms</div>
      <div class="step-msg">${asText(s.msg)||''}</div>`;
    ul.appendChild(li);
  });

  // badge stato in alto
  const top = document.getElementById("testSuiteStatusTop");
  if (top){
    top.textContent = res.ok ? "OK ✓" : "ERR ×";
    top.style.color = res.ok ? "#7bd88f" : "#ff6b6b";
  }
}

/* ===================== FALLBACK API (minimo per far funzionare i bottoni) ===================== */
(function ensureApi(){
  if (typeof window.apiFetch !== "function"){
    window.apiFetch = async function apiFetch(op, params={}){
      const url = window.EXEC_URL || "";
      if (!url) { toast("EXEC_URL mancante"); return { ok:false, error:"EXEC_URL mancante" }; }
      const payload = { op, ...(params||{}) };
      try{
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          mode: "cors",
          credentials: "omit"
        });
        const ct = res.headers.get("content-type")||"";
        const data = ct.includes("application/json") ? await res.json() : { ok: res.ok, text: await res.text() };
        if (!res.ok) throw new Error(data?.error || res.statusText);
        return data;
      }catch(_e){
        // fallback GET
        const qs = new URLSearchParams();
        qs.set("op", op);
        Object.entries(params||{}).forEach(([k,v])=>{
          qs.set(k, (v && typeof v === "object") ? JSON.stringify(v) : String(v));
        });
        try{
          const r2 = await fetch(url + (url.includes("?")?"&":"?") + qs.toString(), { method:"GET" });
          try{ return await r2.json(); }catch(_){ return { ok:r2.ok, status:r2.status }; }
        }catch(e2){
          toast(`Rete: ${e2.message}`); return { ok:false, error:e2.message };
        }
      }
    };
  }

  window.api = window.api || {};
  if (typeof window.api.version !== "function"){
    window.api.version = async () => window.apiFetch("version");
  }
  if (typeof window.api.quick !== "function"){
    window.api.quick = async (op, params={}) => window.apiFetch(op, params);
  }
})();
