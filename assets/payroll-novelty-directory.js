import {directoryContext,directorySession,directoryQuery,directoryPage,addDirectorySelection} from './payroll-novelty-directory-model.js';
const e=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const statusName={active:'Activo',suspended:'Suspendido',leave_without_pay:'Licencia sin goce',pending_termination:'Baja pendiente'};
/** Native dialog; private selections only in memory. Every destination uses the existing preparation parser. */
export function mountNoveltyDirectory({getBootstrap,onApply,onAccessLost=()=>{}}) {
  const dialog=e('dialog',undefined,'novelty-directory');dialog.id='noveltyDirectory';dialog.setAttribute('aria-labelledby','noveltyDirectoryTitle');
  dialog.innerHTML=`<header class="nd-header"><div><p>PADRÓN MUNICIPAL · SELECCIÓN DIRECTA</p><h2 id="noveltyDirectoryTitle">Elegir personas para la novedad</h2><span>Buscá por nombre o legajo. Elegís personas, no archivos.</span></div><button type="button" class="button" id="ndClose" aria-label="Cerrar buscador de personas">Cerrar</button></header>
  <div class="nd-content"><p class="nd-note">Sólo legajos administrativamente activos en el corte disponible. Su presencia aquí no autoriza por sí sola el concepto ni acredita que deba liquidarse.</p>
  <form id="ndFilters" class="nd-filters"><label>Nombre o legajo<input id="ndSearch" type="search" maxlength="100" autocomplete="off" placeholder="Buscá una persona"></label><label>Sector<select id="ndSector"><option value="">Todos los sectores</option></select></label><label>Convenio<select id="ndAgreement"><option value="">Todos los convenios</option></select></label><button class="button primary" type="submit" id="ndConsult">Buscar</button><button type="button" class="button" id="ndReset">Limpiar filtros</button></form>
  <p id="ndStatus" role="status" aria-live="polite"></p><p id="ndError" role="alert" hidden></p>
  <div class="nd-layout"><section class="nd-results" aria-label="Resultados del padrón"><div class="nd-result-head"><strong id="ndRange">Consultá el padrón</strong><button class="button compact" type="button" id="ndSelectPage" disabled>Seleccionar esta página</button></div><p id="ndCutoff" class="nd-cutoff"></p><div class="nd-table-wrap"><table><thead><tr><th scope="col">Elegir</th><th scope="col">Persona / legajo</th><th scope="col">Sector</th><th scope="col">Convenio / estado</th></tr></thead><tbody id="ndRows"></tbody></table></div><p id="ndEmpty" hidden>No hay coincidencias entre los legajos activos. Cambiá los filtros.</p><nav class="nd-pager" aria-label="Páginas del padrón"><button type="button" class="button" id="ndPrevious" disabled>Anterior</button><span id="ndPage"></span><button type="button" class="button" id="ndNext" disabled>Siguiente</button></nav></section>
  <aside class="nd-basket"><h3>Tu selección <span id="ndCount">0</span></h3><p>Se conserva al buscar otra persona o cambiar de página. No equivale a seleccionar todo el padrón.</p><div id="ndSelected"></div><button type="button" class="button" id="ndClearSelection" disabled>Vaciar selección</button></aside></div>
  <div class="nd-sheet-fields" id="ndSheetFields" hidden><label>Concepto inicial<input id="ndConcept" inputmode="numeric" maxlength="20" placeholder="Código de concepto"></label><label>Unidades iniciales (opcional)<input id="ndQuantity" inputmode="decimal" maxlength="24" placeholder="Editable después en cada fila"></label><p>La planilla se agrega sin importe manual ni modo forzado. Podés editar cada fila.</p></div></div>
  <footer class="nd-footer"><p id="ndApplyNote">Seleccionar no guarda ni modifica una liquidación.</p><button type="button" class="button primary" id="ndApply" disabled>Agregar selección</button></footer>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let selected=[],result=null,options=null,contextKey=null,sessionKey=null,company=null,sourceKey=null,version=0,controller=null,busy=false,appliedFilters=null,selectionTime=0;
  const filters=()=>({search:$('ndSearch').value,sector:$('ndSector').value,agreement:$('ndAgreement').value});
  const currentFilters=()=>JSON.stringify(filters())===JSON.stringify(appliedFilters);
  function error(message){$('ndError').textContent=message;$('ndError').hidden=!message;}
  function resetRequest(){version++;controller?.abort();controller=null;busy=false;dialog.setAttribute('aria-busy','false');}
  function clearResult(){result=null;$('ndRows').replaceChildren();$('ndEmpty').hidden=true;$('ndRange').textContent='Resultados pendientes de consulta';$('ndPage').textContent='';$('ndCutoff').textContent='';}
  function setBusy(value,message=''){busy=value;dialog.setAttribute('aria-busy',String(value));if(message)$('ndStatus').textContent=message;renderControls();}
  function renderControls(){
    const available=Boolean(result&&currentFilters());
    $('ndApply').disabled=busy||!selected.length;
    $('ndApply').textContent=options?.mode==='individual'?'Usar este legajo':`Agregar ${selected.length||''} seleccionado${selected.length===1?'':'s'}`;
    $('ndSelectPage').hidden=options?.mode==='individual';
    $('ndSelectPage').disabled=busy||!available||!result.rows.some(r=>!selected.some(s=>s.legajo===r.legajo)&&!options.existing.includes(r.legajo));
    $('ndPrevious').disabled=busy||!available||result.pagination.page<=1;
    $('ndNext').disabled=busy||!available||result.pagination.page>=result.pagination.pages;
    $('ndClearSelection').disabled=busy||!selected.length;
    $('ndConsult').disabled=false; // A new query aborts the previous one instead of waiting behind it.
    dialog.querySelectorAll('#ndRows input,#ndSelected button').forEach(n=>n.disabled=busy||n.dataset.blocked==='true');
    $('ndConcept').disabled=$('ndQuantity').disabled=busy;
  }
  function renderBasket(){
    $('ndCount').textContent=String(selected.length);
    $('ndSelected').replaceChildren(...selected.map(row=>{const item=e('div',undefined,'nd-person'),body=e('div'),b=e('button','Quitar','button compact');body.append(e('strong',row.nombre),e('span','Legajo '+row.legajo));b.type='button';b.setAttribute('aria-label','Quitar selección '+row.nombre+' · '+row.legajo);b.addEventListener('click',()=>{if(busy)return;selected=selected.filter(r=>r.contractId!==row.contractId);error('');renderBasket();renderRows();});item.append(body,b);return item;}));
    if(!selected.length)$('ndSelected').append(e('p','Todavía no elegiste personas.','nd-empty-selection'));
    $('ndApplyNote').textContent=options?.mode==='individual'?'Se completará el campo Legajo. Revisá concepto y unidades antes de guardar.':`${selected.length} seleccionados · ${options?Math.max(0,options.maximum-options.existing.length-selected.length):0} lugares disponibles. Todavía sin guardar.`;
    renderControls();
  }
  function add(rows){
    try{if(busy)return;const next=options.mode==='individual'?addDirectorySelection([],rows,{maximum:1}):addDirectorySelection(selected,rows,options);selected=next;if(!selectionTime)selectionTime=Date.now();error('');renderBasket();renderRows();}
    catch(err){error(err.message);renderRows();}
  }
  function renderRows(){
    $('ndRows').replaceChildren();
    if(!result||!currentFilters()){renderControls();return;}
    for(const row of result.rows){
      const tr=e('tr'),cell=e('td'),check=e('input');check.type=options.mode==='individual'?'radio':'checkbox';check.name='ndPerson';check.value=row.contractId;check.checked=selected.some(r=>r.contractId===row.contractId);check.dataset.blocked=String(options.existing.includes(row.legajo));check.setAttribute('aria-label',`Elegir ${row.nombre} · legajo ${row.legajo}`);check.disabled=busy||check.dataset.blocked==='true';cell.append(check);
      const person=e('td'),label=e('label');label.append(e('strong',row.nombre),e('span','Legajo '+row.legajo));check.id='nd-row-'+row.contractId;label.htmlFor=check.id;person.append(label);
      if(check.dataset.blocked==='true')person.append(e('small','Ya está en la preparación','nd-existing'));
      const state=e('td');state.append(e('span',row.convenio),e('small',statusName[row.administrativeStatus]));
      tr.append(cell,person,e('td',row.sector),state);$('ndRows').append(tr);
      check.addEventListener('change',()=>{if(busy)return;if(check.checked)add([row]);else{selected=selected.filter(s=>s.contractId!==row.contractId);renderBasket();} });
    }
    renderControls();
  }
  async function read(url,signal){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal});
    if([401,403].includes(response.status)){const err=Error('La sesión venció o no tiene permiso para consultar el padrón.');err.accessLost=true;throw err;}
    if(!response.ok)throw Error('No se pudo consultar el padrón. Reintentá sin cambiar tu selección.');
    try{return await response.json();}catch{throw Error('La respuesta del servidor no pudo interpretarse. Reintentá.');}
  }
  function assertContext(){
    if(!dialog.open || directoryContext(getBootstrap())!==contextKey){const err=Error('Cambió el contexto de preparación. Actualizá Novedades.');err.accessLost=true;throw err;}
  }
  async function checkSession(signal){
    assertContext();const auth=await read('/api/internal-auth',signal);
    try{sessionKey=directorySession(auth,getBootstrap(),sessionKey);}catch(err){err.accessLost=true;throw err;}
    assertContext();
  }
  function fail(err,seq){
    if(seq!==version||!dialog.open)return;
    clearResult();error(err.name==='AbortError'||err.name==='TimeoutError'?'La consulta se interrumpió. Volvé a buscar.':err.message);
    if(err.accessLost){selected=[];renderBasket();onAccessLost();close();}
  }
  async function query(page=1){
    resetRequest();const seq=version;
    const f=filters();let qs;
    try{qs=directoryQuery({...f,page});assertContext();}catch(err){error(err.message);clearResult();renderControls();return;}
    controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]);
    clearResult();setBusy(true,'Consultando legajos activos…');error('');
    try{
      await checkSession(signal);const raw=await read('/api/internal-data?'+qs,signal);
      if(seq!==version||!dialog.open)return;
      assertContext();const data=directoryPage(raw,page);
      if(company&&data.companyId&&company!==data.companyId)throw Object.assign(Error('Cambió la empresa de origen del padrón.'),{accessLost:true});
      const cutoff=JSON.stringify([data.cutoffFrom,data.cutoffTo]);
      if(sourceKey&&sourceKey!==cutoff){selected=[];selectionTime=0;sourceKey=null;renderBasket();throw Error('Cambió el corte del padrón. Se descartó la selección; volvé a consultar.');}
      sourceKey=cutoff;company=data.companyId||company;result=data;appliedFilters=f;
      for(const [key,list,placeholder]of [['ndSector',data.sectors,'Todos los sectores'],['ndAgreement',data.agreements,'Todos los convenios']]){
        const sel=$(key),value=sel.value;sel.replaceChildren(e('option',placeholder));sel.firstChild.value='';
        for(const value of list){const op=e('option',value);op.value=value;sel.append(op);}
        if(value&&!list.includes(value))throw Error('Cambió el filtro del padrón. Elegí el sector o convenio nuevamente.');sel.value=value;
      }
      const p=data.pagination;$('ndRange').textContent=p.total?`${(p.page-1)*p.limit+1}–${Math.min(p.page*p.limit,p.total)} de ${p.total} legajos del filtro`:'Sin coincidencias';
      $('ndPage').textContent=`Página ${p.page} de ${p.pages}`;
      $('ndCutoff').textContent='Corte del padrón: '+(data.cutoffFrom?data.cutoffFrom.slice(0,10)+(data.cutoffTo&&data.cutoffTo!==data.cutoffFrom?' a '+data.cutoffTo.slice(0,10):''):'no informado')+'. No es un censo en tiempo real.';
      $('ndEmpty').hidden=data.rows.length>0;
      $('ndStatus').textContent='Seleccioná personas. Cambiar filtros no agrega ni quita tu selección.';renderRows();
    }catch(err){fail(err,seq);}finally{if(seq===version){controller=null;setBusy(false);}}
  }
  async function apply(){
    if(busy||!selected.length)return;
    const selection=[...selected],originalOptions={...options},extra={concepto:$('ndConcept').value,unidades:$('ndQuantity').value};
    resetRequest();const seq=version;controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]);
    setBusy(true,'Comprobando sesión y contexto antes de agregar…');error('');
    try{
      if(Date.now()-selectionTime>10*60*1000)throw Error('La selección tiene más de diez minutos. Cerrá y volvé a consultar el padrón antes de usarla.');
      await checkSession(signal);
      const fresh=await read('/api/internal-payroll-novelties?resource=bootstrap',signal);
      if(seq!==version||!dialog.open)return;
      if(directoryContext(fresh)!==contextKey)throw Object.assign(Error('Cambió el contexto o el límite de preparación. Actualizá Novedades.'),{accessLost:true});
      assertContext();
      // Caller rechecks current destination, common values, limits and business keys atomically.
      onApply(selection,originalOptions.mode,extra);close();
    }catch(err){if(seq===version&&dialog.open){error(err.message);if(err.accessLost){onAccessLost();close();}}}
    finally{if(seq===version){controller=null;setBusy(false);}}
  }
  function close(){resetRequest();if(dialog.open)dialog.close();selected=[];result=null;options=null;contextKey=sessionKey=company=sourceKey=null;appliedFilters=null;selectionTime=0;clearResult();$('ndSelected').replaceChildren();$('ndFilters').reset();$('ndConcept').value=$('ndQuantity').value='';$('ndError').textContent=$('ndStatus').textContent='';$('ndCount').textContent='0';}
  $('ndClose').addEventListener('click',close);dialog.addEventListener('cancel',ev=>{ev.preventDefault();close();});
  $('ndFilters').addEventListener('submit',ev=>{ev.preventDefault();query();});
  $('ndFilters').addEventListener('input',()=>{resetRequest();clearResult();renderControls();$('ndStatus').textContent='Filtros modificados. Presioná Buscar; tu selección no cambia.';});
  $('ndFilters').addEventListener('change',()=>{resetRequest();clearResult();renderControls();});
  $('ndReset').addEventListener('click',()=>{$('ndFilters').reset();query();});
  $('ndPrevious').addEventListener('click',()=>query(result.pagination.page-1));$('ndNext').addEventListener('click',()=>query(result.pagination.page+1));
  $('ndSelectPage').addEventListener('click',()=>{if(!result||!currentFilters()||busy)return;add(result.rows.filter(r=>!selected.some(s=>s.legajo===r.legajo)&&!options.existing.includes(r.legajo)));});
  $('ndClearSelection').addEventListener('click',()=>{selected=[];selectionTime=0;renderBasket();renderRows();error('');});$('ndApply').addEventListener('click',apply);
  window.addEventListener('pagehide',close);
  return {close,open(config){
    close();contextKey=directoryContext(getBootstrap());
    if(!['individual','agile','sheet'].includes(config.mode)||!Array.isArray(config.existing))throw Error('Elegí una modalidad de carga válida.');
    options={...config,maximum:config.mode==='individual'?1:Math.min(config.maximum,getBootstrap().limits.maxRows)};
    $('ndSheetFields').hidden=config.mode!=='sheet';$('ndConcept').value=config.concepto||'';$('ndQuantity').value=config.unidades||'';
    dialog.showModal();renderBasket();$('ndSearch').focus();query();
  }};
}
