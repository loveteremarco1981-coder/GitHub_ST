/* app.js – logica UI (versione con formatter sicuro) */
(function(){
  const state = {
    search: new URLSearchParams(location.search).get('q') || '',
    sort: new URLSearchParams(location.search).get('sort') || 'updatedAt:desc',
    page: Number(new URLSearchParams(location.search).get('page')||'1'),
    pageSize: api.cfg.pageSize,
    theme: localStorage.getItem('theme') || 'dark'
  };

  // DOM refs
  const $ = s => document.querySelector(s);
  const tbody = $('#table-body');
  const empty = $('#empty-state');
  const pagination = $('#pagination');
  const searchInput = $('#search-input');
  const sortSelect = $('#sort-select');
  const addBtn = $('#add-item');
  const seedBtn = $('#seed-data');
  const toast = $('#toast');
  const modeBadge = $('#mode-indicator');
  const toggleThemeBtn = $('#toggle-theme');
  const exportBtn = $('#export-json');

  // Modal
  const modal = document.getElementById('item-modal');
  const form = document.getElementById('item-form');
  const closeBtn = document.getElementById('modal-close');
  const fId = document.getElementById('f-id');
  const fName = document.getElementById('f-name');
  const fStatus = document.getElementById('f-status');
  const fPriority = document.getElementById('f-priority');
  const fTags = document.getElementById('f-tags');
  const fNotes = document.getElementById('f-notes');
  const modalTitle = document.getElementById('modal-title');

  // THEME
  function applyTheme(){
    if (state.theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
  }
  applyTheme();

  toggleThemeBtn?.addEventListener('click', ()=>{
    state.theme = state.theme==='light' ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    applyTheme();
  });

  // Helper: URL query
  function setQuery(){
    const q = new URLSearchParams();
    if (state.search) q.set('q', state.search);
    if (state.sort && state.sort!=='updatedAt:desc') q.set('sort', state.sort);
    if (state.page>1) q.set('page', String(state.page));
    const next = location.pathname + (q.toString()?`?${q.toString()}`:'');
    history.replaceState(null, '', next);
  }

  function fmtDate(iso){
    try {
      const d = new Date(iso);
      return d.toLocaleString('it-IT', { dateStyle:'medium', timeStyle:'short' });
    } catch { return iso; }
  }

  function showToast(msg, kind='info'){
    toast.textContent = msg;
    toast.hidden = false;
    toast.style.borderColor = kind==='error' ? 'var(--danger)' : 'var(--border)';
    toast.style.background = kind==='error' ? 'color-mix(in oklab, var(--danger) 20%, var(--card))' : 'var(--card)';
    setTimeout(()=>{ toast.hidden = true; }, 2200);
  }

  // =================== FORMATTER ANTI [object Object] ===================
  function fmtValue(v){
    if (v === null || v === undefined) return '—';
    const t = typeof v;
    if (t === 'string') return v || '—';
    if (t === 'number') return Number.isFinite(v) ? String(v) : '—';
    if (t === 'boolean') return v ? 'On' : 'Off';
    if (Array.isArray(v)) return v.map(fmtValue).join(', ');
    // Oggetto: prova campi “parlanti”, altrimenti JSON compatto
    const prefer = ['label','name','title','value','id'];
    for (const k of prefer) {
      if (v && typeof v === 'object' && k in v && v[k] != null) return fmtValue(v[k]);
    }
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  // =====================================================================

  // RENDER
  function renderRows(items){
    tbody.innerHTML = '';
    for (const it of items){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(fmtValue(it.name))}</strong><br><small class="muted">ID: ${it.id}</small></td>
        <td>${badgeStatus(it.status)}</td>
        <td>${priorityDots(it.priority)}</td>
        <td>${renderTags(it.tags)}</td>
        <td><small class="muted">${fmtDate(it.updatedAt)}</small></td>
        <td class="text-right">${actionsHtml(it.id)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function escapeHtml(s){
    return (s||'').replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  function badgeStatus(s){
    const map = { aperto:['Aperto','#0ea5e9'], in_corso:['In corso','#f59e0b'], chiuso:['Chiuso','#22c55e'] };
    const [label, color] = map[s] || [fmtValue(s),'#64748b'];
    return `<span class="badge" style="border-color:${color}33; color:${color}">${escapeHtml(label)}</span>`;
  }

  function priorityDots(n){
    n = Number(n)||0;
    let html = '<div aria-label="Priorità" title="'+n+'/5">';
    for (let i=1;i<=5;i++) html += `<span style="opacity:${i<=n?1:.25}">●</span>`;
    return html+'</div>';
  }

  function renderTags(tags){
    if (!Array.isArray(tags)||tags.length===0) return '<span class="muted">—</span>';
    return tags.map(t=>`<span class="badge">${escapeHtml(fmtValue(t))}</span>`).join(' ');
  }

  function actionsHtml(id){
    return `
      <div class="actions">
        <button class="btn btn-ghost" data-action="edit" data-id="${id}">✏️</button>
        <button class="btn btn-danger" data-action="del" data-id="${id}">🗑️</button>
      </div>
    `;
  }

  function renderPagination(total, page, pageSize){
    pagination.innerHTML = '';
    const pages = Math.max(1, Math.ceil(total/pageSize));
    const mk = (p, label=p) => {
      const btn = document.createElement('button');
      btn.className = 'page-btn';
      btn.textContent = String(label);
      btn.setAttribute('aria-label', `Vai a pagina ${p}`);
      if (p===page) btn.setAttribute('aria-current','page');
      btn.addEventListener('click', ()=>{ if (p!==page){ state.page=p; setQuery(); refresh(); } });
      return btn;
    };
    if (pages<=1) return;
    pagination.appendChild(mk(Math.max(1,page-1),'◀'));
    for (let p=1;p<=pages;p++){
      if (p===1 || p===pages || Math.abs(p-page)<=1){
        pagination.appendChild(mk(p));
      } else if (Math.abs(p-page)===2){
        const span = document.createElement('span'); span.textContent = '…'; span.style.color='var(--muted)'; span.style.padding='0 4px';
        pagination.appendChild(span);
      }
    }
    pagination.appendChild(mk(Math.min(pages,page+1),'▶'));
  }

  function setModeBadge(){
    modeBadge.textContent = `API: ${String(api.cfg.mode)}`;
    modeBadge.style.borderColor = api.cfg.mode==='mock' ? 'var(--border)' : 'var(--accent)';
    modeBadge.style.color = api.cfg.mode==='mock' ? 'var(--muted)' : 'var(--accent)';
  }

  // DATA FLOW
  async function refresh(){
    try {
      const {items, total, page, pageSize} = await api.list({
        search: state.search, sort: state.sort, page: state.page, pageSize: state.pageSize
      });
      renderRows(items);
      renderPagination(total, page, pageSize);
      empty.hidden = total>0;
    } catch (err){
      console.error(err);
      showToast(err.message||String(err), 'error');
    }
  }

  // HANDLERS
  searchInput.value = state.search;
  searchInput.addEventListener('input', debounce(e=>{ state.search = e.target.value.trim(); state.page=1; setQuery(); refresh(); }, 250));

  sortSelect.value = state.sort;
  sortSelect.addEventListener('change', e=>{ state.sort = e.target.value; state.page=1; setQuery(); refresh(); });

  addBtn.addEventListener('click', ()=> openModal());
  closeBtn.addEventListener('click', ()=> modal.close());

  // Delegate azioni riga
  tbody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action==='edit'){
      // carica item corrente per editing (mock: leggi via list + find)
      const {items} = await api.list({ search:'', sort:'updatedAt:desc', page:1, pageSize:10000 });
      const it = items.find(x=>x.id===id);
      if (!it) return showToast('Elemento non trovato', 'error');
      openModal(it);
    } else if (action==='del'){
      if (confirm('Eliminare questo elemento?')){
        await api.remove(id);
        showToast('Elemento eliminato');
        refresh();
      }
    }
  });

  // Seed data
  seedBtn?.addEventListener('click', async ()=>{
    const sample = [
      { name:'Cliente A', status:'aperto', priority:4, tags:['vendite','NW'], notes:'Primo contatto' },
      { name:'Cliente B', status:'in_corso', priority:5, tags:['follow-up','meeting'], notes:'Demo fissata' },
      { name:'Cliente C', status:'chiuso', priority:2, tags:['supporto'], notes:'Ticket risolto' },
    ];
    await api.bulkImport(sample);
    showToast('Dati di esempio aggiunti');
    refresh();
  });

  // Esporta JSON
  exportBtn?.addEventListener('click', async (e)=>{
    try {
      const {items} = await api.list({ page:1, pageSize:10000 });
      const blob = new Blob([JSON.stringify(items, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      exportBtn.href = url;
      setTimeout(()=> URL.revokeObjectURL(url), 2000);
    } catch (err){ showToast('Errore esportazione', 'error'); }
  });

  // Modal helpers
  function openModal(item){
    form.reset();
    if (item){
      fId.value = item.id;
      fName.value = fmtValue(item.name)||'';
      fStatus.value = fmtValue(item.status)||'aperto';
      fPriority.value = Number(item.priority)||3;
      fTags.value = Array.isArray(item.tags)? item.tags.join(', ') : fmtValue(item.tags)||'';
      fNotes.value = fmtValue(item.notes)||'';
      modalTitle.textContent = 'Modifica elemento';
    } else {
      fId.value = '';
      modalTitle.textContent = 'Nuovo elemento';
    }
    modal.showModal();
  }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = {
      name: fName.value.trim(),
      status: fStatus.value,
      priority: Number(fPriority.value)||3,
      tags: fTags.value,
      notes: fNotes.value.trim(),
    };
    try {
      if (!data.name) return showToast('Il nome è obbligatorio', 'error');
      if (fId.value){
        await api.update(fId.value, data);
        showToast('Elemento aggiornato');
      } else {
        await api.create(data);
        showToast('Elemento creato');
      }
      modal.close();
      refresh();
    } catch(err){ showToast(err.message||String(err), 'error'); }
  });

  // Debounce
  function debounce(fn, ms){
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
  }

  // INIT
  setModeBadge();
  refresh();
})();
