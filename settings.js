<script>
async function loadSettingsExtra(){
  try{
    const [lt, di, dox, eg, pm] = await Promise.all([
      api.getLifeTimeout(),   // {ok:true, life_timeout:60}
      api.getDebounceIn(),    // {ok:true, debounce_in:2}
      api.getDebounceOut(),   // {ok:true, debounce_out:0}
      api.getEmptyGrace(),    // {ok:true, empty_grace:8}
      api.getPianteMinInt(),  // {ok:true, min:60}
    ]);
    if(lt && lt.ok)  document.getElementById('inLifeTimeout').value = lt.life_timeout;
    if(di && di.ok)  document.getElementById('inDebounceIn').value  = di.debounce_in;
    if(dox&& dox.ok) document.getElementById('inDebounceOut').value = dox.debounce_out;
    if(eg && eg.ok)  document.getElementById('inEmptyGrace').value  = eg.empty_grace;
    if(pm && pm.ok)  document.getElementById('inPianteMin').value   = pm.min;
  }catch(e){
    console.error('loadSettingsExtra', e);
  }
}

function bindSettingsExtra(){
  document.getElementById('btnLifeTimeout').onclick = async ()=>{
    const v = +document.getElementById('inLifeTimeout').value;
    const res = await api.setLifeTimeout(v);
    toast(res.ok ? 'Salvato' : 'Errore');
  };
  document.getElementById('btnDebounceIn').onclick = async ()=>{
    const v = +document.getElementById('inDebounceIn').value;
    const res = await api.setDebounceIn(v);
    toast(res.ok ? 'Salvato' : 'Errore');
  };
  document.getElementById('btnDebounceOut').onclick = async ()=>{
    const v = +document.getElementById('inDebounceOut').value;
    const res = await api.setDebounceOut(v);
    toast(res.ok ? 'Salvato' : 'Errore');
  };
  document.getElementById('btnEmptyGrace').onclick = async ()=>{
    const v = +document.getElementById('inEmptyGrace').value;
    const res = await api.setEmptyGrace(v);
    toast(res.ok ? 'Salvato' : 'Errore');
  };
  document.getElementById('btnPianteMin').onclick = async ()=>{
    const v = +document.getElementById('inPianteMin').value;
    const res = await api.setPianteMinInterval(v);
    toast(res.ok ? 'Salvato' : 'Errore');
  };
}

// Chiamale insieme alle load/bind esistenti
document.addEventListener('DOMContentLoaded', async ()=>{
  bindSettingsExtra();
  await loadSettingsExtra();
});
</script>
