import {mountPayrollRoster} from './payroll-roster-panel.js';
import {payrollSourceReport} from './payroll-source-report-model.js';
import {saveReport} from './report-document.js';
import {sourceCatalogue,sourceTypeLabel,sourceClosureLabel,sourceDateLabel,sourceSelectionMatches,sourceReportUnchanged,selectedSourceDocument} from './payroll-source-picker.js';
const e=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

/** Catalogue and report state are private to this task. All exports reread the selected source. */
export function mountSourceReports(host) {
 host.classList.add('ps-workbench');
 host.innerHTML=`<header class="rc-panel-head"><p class="rc-eyebrow">Liquidaciones incorporadas</p><h2>Haberes y descuentos desde MuniControl</h2><p>Buscá el período, identificá la liquidación y descargá sus conceptos. El sistema usa los datos guardados; no requiere archivos de entrada.</p></header>
 <div class="rc-downloads"><button type="button" class="rc-button" data-catalog>Consultar liquidaciones disponibles</button><button type="button" class="rc-button secondary" data-source-cancel hidden>Cancelar consulta</button></div>
 <p role="status" aria-live="polite" data-state></p><a data-login class="rc-button secondary" hidden>Ingresar al portal interno</a>
 <section data-catalog-panel hidden aria-label="Buscar una liquidación">
  <div class="rc-filter ps-catalog-filters"><label>Año<select data-source-year><option value="">Todos</option></select></label><label>Mes<select data-source-month><option value="">Todos</option></select></label><label>Tipo<select data-source-type><option value="">Todos</option></select></label><label>Estado<select data-source-closure><option value="">Todos</option><option value="closed">Cierre informado</option><option value="open">Abierta / preliquidación</option><option value="unknown">Cierre no informado</option></select></label><label>Buscar fuente<input data-source-search type="search" maxlength="100" placeholder="Etiqueta o identificador"></label><button type="button" class="rc-button secondary" data-source-reset>Limpiar filtros</button></div>
  <p data-catalog-coverage class="ps-hint" role="status"></p>
  <form data-query class="rc-filter" hidden><label>Liquidación disponible<select data-dataset required></select></label><button class="rc-button" data-view-report type="submit">Ver reporte</button></form>
  <p data-source-empty class="rc-empty" hidden>No hay liquidaciones para estos filtros. No se seleccionó otra fuente automáticamente.</p>
  <details class="ps-selection" data-selection hidden><summary>Revisar fuente seleccionada</summary><dl data-selection-fields></dl></details>
 </section>
 <div data-result hidden><div class="rc-source" data-source></div>
  <div class="rc-filter"><label>Conceptos<select data-group><option value="all">Todos</option><option value="discounts">Descuentos</option><option value="contributions">Aportes 701 y 703</option><option value="totals">Totalizadores</option></select></label><label>Buscar por código o descripción<input type="search" maxlength="100" data-search></label></div>
  <div class="rc-kpis ps-kpis"><div><span>Legajos de la liquidación</span><strong data-source-count></strong></div><div><span>Conceptos del filtro</span><strong data-concept-count></strong></div><div><span>Conceptos con importe incompleto</span><strong data-missing-count></strong></div></div>
  <div class="rc-downloads"><button type="button" class="rc-button" data-format="pdf">Descargar PDF</button><button type="button" class="rc-button" data-format="xlsx">Descargar Excel</button><button type="button" class="rc-button secondary" data-format="csv">Descargar CSV</button></div>
  <p data-scope class="ps-hint"></p><div class="rc-table-wrap" tabindex="0" role="region" aria-label="Detalle de conceptos"><table class="rc-table"><thead data-source-head></thead><tbody data-source-rows></tbody></table></div>
 </div>`;
 const rosterHost=e('section');host.append(rosterHost);const roster=mountPayrollRoster(rosterHost);
 const $=s=>host.querySelector(s),status=$('[data-state]'),result=$('[data-result]'),selection=$('[data-dataset]');
 const formats=[...result.querySelectorAll('[data-format]')];
 const page=location.pathname.endsWith('nomina-control.html')?'nomina-control.html':'reportes-rrhh.html';
 $('[data-login]').href='login.html?next='+encodeURIComponent(page+(page==='nomina-control.html'?'#reportes':'#haberes'));
 const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 months.forEach((label,i)=>$('[data-source-month]').append(new Option(label,String(i+1).padStart(2,'0'))));
 let catalog=null,current=null,operation=null,sequence=0;
 const active=()=>host.isConnected&&!host.closest('[role="tabpanel"]')?.hidden&&document.visibilityState!=='hidden';
 const filters=()=>({group:$('[data-group]').value,search:$('[data-search]').value});
 const catalogueFilters=()=>({year:$('[data-source-year]').value,month:$('[data-source-month]').value,type:$('[data-source-type]').value,closure:$('[data-source-closure]').value,search:$('[data-source-search]').value});
 function controls(){const busy=operation!==null;host.setAttribute('aria-busy',String(busy));$('[data-source-cancel]').hidden=!busy;$('[data-catalog]').disabled=busy;$('[data-view-report]').disabled=busy||!selection.value;formats.forEach(b=>b.disabled=busy||!current);}
 function cancel(){sequence++;if(operation){clearTimeout(operation.timer);operation.controller.abort();operation=null;}controls();}
 function clear(){current=null;result.hidden=true;$('[data-source-rows]').replaceChildren();$('[data-source-head]').replaceChildren();$('[data-source]').textContent='';$('[data-scope]').textContent='';for(const name of ['source-count','concept-count','missing-count'])$('[data-'+name+']').textContent='';roster.setDataset(null);controls();}
 function clearCatalog(){catalog=null;selection.replaceChildren();$('[data-selection-fields]').replaceChildren();$('[data-selection]').hidden=true;$('[data-catalog-coverage]').textContent='';$('[data-catalog-panel]').hidden=true;$('[data-query]').hidden=true;controls();}
 function start(message){cancel();const op={id:sequence,controller:new AbortController(),timer:null};op.timer=setTimeout(()=>op.controller.abort(),30000);operation=op;status.textContent=message;controls();return op;}
 const owns=op=>operation===op&&op.id===sequence&&active();
 function finish(op){clearTimeout(op.timer);if(operation===op){operation=null;controls();}}
 async function request(dataset,op){
  const qs=new URLSearchParams({resource:'payrollsourcereport'});if(dataset)qs.set('datasetId',dataset);
  const r=await fetch('/api/internal-data?'+qs,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:op.controller.signal});
  if(r.status===401||r.status===403){const err=Error('Se requiere una sesión con permiso de consulta de nómina.');err.code='AUTH';throw err;}
  if(!r.ok)throw Error('No se pudo consultar el reporte. Reintentá.');
  let p;try{p=await r.json();}catch{throw Error('La fuente no respondió un reporte válido.');}
  if(p?.ok!==true)throw Error('No se pudo consultar el reporte. Reintentá.');
  const d=payrollSourceReport(p.data);
  if(!dataset&&d.mode!=='catalog'||dataset&&(d.mode!=='report'||!d.found||d.datasetId!==dataset))throw Error('La liquidación ya no está disponible. Consultá el catálogo nuevamente.');
  return d;
 }
 function failure(error,op){if(!owns(op))return;clear();if(error.code==='AUTH'){clearCatalog();$('[data-login]').hidden=false;}status.textContent=error.name==='AbortError'?'La consulta se interrumpió. Volvé a intentar.':error.message;}
 function selected(){return catalog?.items.find(item=>item.datasetId===selection.value);}
 function showSelection(){
  const item=selected();$('[data-selection]').hidden=!item;$('[data-selection-fields]').replaceChildren();if(!item)return;
  const fields=[['Fecha',sourceDateLabel(item.date)],['Tipo',sourceTypeLabel(item.type)],['Estado de origen',sourceClosureLabel(item.closureStatus)],['Fuente',item.sourceLabel||'Sin etiqueta'],['Legajos en la fuente',item.statementCount],['Identificador de conjunto',item.datasetId],['Huella del conjunto',item.payloadHash]];
  $('[data-selection-fields]').replaceChildren(...fields.flatMap(([label,value])=>[e('dt',label),e('dd',String(value))]));
 }
 function renderCatalog(){
  if(!catalog)return;const view=sourceCatalogue(catalog,catalogueFilters()),prior=selection.value;
  selection.replaceChildren(...view.items.map((item,index)=>new Option(`${index+1}. ${sourceDateLabel(item.date)} · ${sourceTypeLabel(item.type)} · ${sourceClosureLabel(item.closureStatus)} · ${item.sourceLabel.slice(0,70)} · ${item.datasetId.slice(0,8)}`,item.datasetId)));
  if(view.items.some(item=>item.datasetId===prior))selection.value=prior;
  $('[data-query]').hidden=false;$('[data-source-empty]').hidden=view.items.length!==0;selection.disabled=!view.items.length;
  $('[data-catalog-coverage]').textContent=`${view.items.length} liquidaciones del filtro · ${view.loaded} cargadas de ${view.total} informadas.`+(view.truncated?' Catálogo limitado a las más recientes; los filtros no consultan las fuentes anteriores que quedaron fuera.':' Cobertura completa del catálogo disponible para tu sesión.');
  showSelection();controls();
 }
 function render(){
  if(!current)return;const doc=selectedSourceDocument(current,filters());
  $('[data-source]').textContent=`${sourceDateLabel(current.date)} · ${sourceTypeLabel(current.type)} · ${sourceClosureLabel(current.closureStatus)} · ${current.sourceLabel}`;
  $('[data-source-count]').textContent=String(current.statementCount);$('[data-concept-count]').textContent=String(doc.rows.length);$('[data-missing-count]').textContent=String(doc.rows.filter(row=>row[4]===null).length);
  $('[data-scope]').textContent=doc.rows.length+' conceptos del filtro. Los legajos son los de esta liquidación, no el padrón activo. '+doc.notes[1];
  const head=e('tr');doc.columns.forEach(c=>{const th=e('th',c.label);th.scope='col';head.append(th);});$('[data-source-head]').replaceChildren(head);
  $('[data-source-rows]').replaceChildren(...doc.rows.map(row=>{const tr=e('tr');row.forEach((v,i)=>tr.append(e('td',v===null?'No informado':doc.columns[i].type==='money'?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)):String(v))));return tr;}));result.hidden=false;controls();
 }
 $('[data-catalog]').addEventListener('click',async()=>{
  if(operation||!active())return;clear();clearCatalog();$('[data-login]').hidden=true;const op=start('Consultando liquidaciones…');
  try{const d=await request(null,op);if(!owns(op))return;const view=sourceCatalogue(d);catalog=d;
   $('[data-source-year]').replaceChildren(new Option('Todos',''),...view.years.map(y=>new Option(y,y)));$('[data-source-type]').replaceChildren(new Option('Todos',''),...view.types.map(t=>new Option(sourceTypeLabel(t),t)));$('[data-source-month]').value='';$('[data-source-closure]').value='';$('[data-source-search]').value='';
   $('[data-catalog-panel]').hidden=false;renderCatalog();status.textContent=d.items.length?'Filtrá por período y tipo. Revisá la fuente seleccionada antes de consultar.':'Todavía no hay detalles de liquidación disponibles para tu ámbito.';
  }catch(error){failure(error,op);}finally{finish(op);}
 });
 const changeCatalogue=()=>{cancel();clear();renderCatalog();status.textContent='Filtros modificados. Consultá la liquidación seleccionada antes de exportar.';};
 for(const name of ['year','month','type','closure'])$('[data-source-'+name+']').addEventListener('change',changeCatalogue);
 $('[data-source-search]').addEventListener('input',changeCatalogue);
 $('[data-source-reset]').addEventListener('click',()=>{for(const name of ['year','month','type','closure','search'])$('[data-source-'+name+']').value='';changeCatalogue();});
 selection.addEventListener('change',()=>{cancel();clear();showSelection();status.textContent='Selección modificada. Presioná Ver reporte.';});
 $('[data-query]').addEventListener('submit',async event=>{
  event.preventDefault();if(operation||!active())return;const choice=selected();clear();if(!choice)return;const op=start('Consultando conceptos…');
  try{const d=await request(choice.datasetId,op);if(!owns(op))return;if(!sourceSelectionMatches(choice,d))throw Error('El catálogo cambió. Consultá las liquidaciones disponibles nuevamente.');current=d;render();roster.setDataset(d.datasetId);status.textContent='Reporte consultado. Filtrá y descargá el resultado.';}catch(error){failure(error,op);}finally{finish(op);}
 });
 const changeReport=()=>{cancel();try{render();status.textContent='Filtro actualizado. Las descargas usarán exactamente los conceptos visibles.';}catch(error){clear();status.textContent=error.message;}};
 $('[data-group]').addEventListener('change',changeReport);$('[data-search]').addEventListener('input',changeReport);
 formats.forEach(button=>button.addEventListener('click',async()=>{
  if(!current||operation||!active())return;const original=current,filter=filters();const op=start('Verificando acceso y versión antes de descargar…');
  try{const fresh=await request(original.datasetId,op);if(!owns(op))return;if(!sourceReportUnchanged(original,fresh))throw Error('La fuente cambió. Volvé a consultar antes de descargar.');const filename=saveReport(selectedSourceDocument(fresh,filter),button.dataset.format);status.textContent='Archivo generado: '+filename;}catch(error){failure(error,op);}finally{finish(op);}
 }));
 $('[data-source-cancel]').addEventListener('click',()=>{cancel();clear();status.textContent='Consulta cancelada. No se descargó ningún archivo.';});
 function leave(){if(active())return;cancel();clear();clearCatalog();status.textContent='Volvé a consultar las liquidaciones disponibles para continuar.';}
 document.addEventListener('taskchange',leave);document.addEventListener('visibilitychange',leave);window.addEventListener('pagehide',()=>{cancel();clear();clearCatalog();});controls();
}
