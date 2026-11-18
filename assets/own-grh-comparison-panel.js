import {OWN_RUN_NOMINAL,OWN_RUN_TYPES,hasOwnRunAccess,ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';
import {ownLiquidationBootstrap,ownLiquidationDetail,OWN_LIQ_REVIEW} from './own-payroll-liquidation-model.js';
import {fetchOwnLiquidationDetail} from './own-payroll-liquidation-read.js';
import {verifiedHistoricalCapture} from './own-payroll-historical-result-model.js';
import {payrollSourceReport,sourceReportCatalog,sourceReportTypeLabel} from './payroll-source-report-model.js';
import {ownGrhComparison,grhStatementLinesExpand,ownGrhComparisonView,ownGrhComparisonDocument,OWN_GRH_JOIN,OWN_GRH_TYPES} from './own-grh-comparison-model.js';
import {reportCsv,reportXlsx,reportPdf,saveReportBytes,reportExactShown} from './report-document.js';
const node=(tag,value)=>{const element=document.createElement(tag);if(value!==undefined)element.textContent=value;return element;};
const option=(label,value)=>{const element=node('option',label);element.value=value;return element;};
const ownEndpoint='/api/internal-own-payroll-liquidation',grhEndpoint='/api/internal-data';
// Las mismas que exige la lectura GRH por legajo (incluye actions.read, que pide la guarda de sesión de la 007).
const grhCapabilities=['actions.read','payroll.read','workforce.employee.read'];

/**
 * Lector nominal exclusivamente de consulta. Usa los dos catálogos ya autorizados;
 * la 242 entrega el GRH por legajo. No crea capacidades, sesiones, cálculos ni SQL.
 */
export function mountOwnGrhComparisonPanel(host){
 const style=new URL('own-payroll-comparison-panel.css',import.meta.url).href;
 if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===style)){
  const link=node('link');link.rel='stylesheet';link.href=style;document.head.append(link);
 }
 host.className='own-comparison';
 host.innerHTML=`<header><p class="own-comparison-eyebrow">NÓMINA · CONCILIACIÓN CON GRH</p><h2>MuniControl contra GRH</h2>
 <p>Comparación de una corrida propia guardada con una liquidación incorporada del sistema anterior. La unión es declarada por número de legajo como texto exacto; no se presumen identidades, importes ni equivalencias.</p></header>
 <button class="button primary" data-ogc-catalog type="button">Consultar cálculos y liquidaciones GRH</button>
 <p data-ogc-state role="status" aria-live="polite">Elegí consultar las fuentes disponibles para tu sesión.</p>
 <a data-ogc-login hidden href="/acceso?next=%2Fnomina%23comparar">Volver a ingresar</a>
 <form data-ogc-form hidden><fieldset data-ogc-fields><legend>Elegir las fuentes del mismo período y tipo</legend>
 <div class="own-comparison-grid"><label>Cálculo guardado de MuniControl<select data-ogc-own required><option value="">Elegí un cálculo propio</option></select></label>
 <label>Liquidación GRH incorporada<select data-ogc-grh required><option value="">Elegí una liquidación GRH</option></select></label></div>
 <p data-ogc-catalog-note></p></fieldset><button class="button primary" data-ogc-compare type="submit" disabled>Comparar ambas fuentes completas</button></form>
 <section data-ogc-result hidden aria-labelledby="ownGrhComparisonTitle"><h3 id="ownGrhComparisonTitle" tabindex="-1">Comparación completa por legajo</h3>
 <p class="own-grh-sources" data-ogc-sources></p>
 <div class="own-grh-kpis" data-ogc-summary role="group" aria-label="Resumen de la vista elegida"></div>
 <ul data-ogc-warnings class="own-comparison-notice own-grh-rules" aria-label="Cómo leer la comparación"></ul>
 <div class="own-comparison-grid"><label>Detalle<select data-ogc-view><option value="concepts">Conceptos por legajo</option><option value="totals">Totales por legajo</option></select></label>
 <label>Mostrar sólo en pantalla<select data-ogc-filter><option value="all">Todos</option><option value="review">Para revisar</option><option value="rounding">Diferencias de redondeo</option><option value="equal">Sin diferencia</option></select></label>
 <label>Buscar sólo en pantalla<input data-ogc-search type="search" maxlength="100" autocomplete="off" placeholder="Legajo, código o concepto"></label></div>
 <p class="own-grh-hint">Redondeos y coincidencias se cuentan por separado. Las descargas incluyen todas las filas de la vista elegida, sin filtros ni paginación.</p>
 <div class="own-comparison-actions"><button class="button" type="button" data-ogc-pdf>Descargar PDF completo</button><button class="button" type="button" data-ogc-xlsx>Descargar Excel completo</button><button class="button" type="button" data-ogc-csv>Descargar CSV completo</button></div>
 <div class="own-comparison-scroll own-grh-table" tabindex="0" role="region" aria-label="Comparación MuniControl contra GRH; tabla desplazable"><table>
 <caption data-ogc-caption></caption><thead><tr><th scope="col">Legajo</th><th scope="col">Concepto / total</th><th scope="col" class="num">MuniControl</th><th scope="col" class="num">GRH</th><th scope="col" class="num">Diferencia</th><th scope="col">Estado</th></tr></thead><tbody data-ogc-rows></tbody></table></div>
 <p data-ogc-empty hidden>Sin filas para esta búsqueda. La descarga conserva el detalle completo.</p>
 <nav class="own-comparison-actions" aria-label="Páginas de la comparación"><button class="button" data-ogc-prev type="button">Anterior</button><span data-ogc-page></span><button class="button" data-ogc-next type="button">Siguiente</button></nav>
 <details><summary>Huellas y fuentes originales</summary><dl data-ogc-trace></dl></details></section>`;
 const $=key=>host.querySelector('[data-ogc-'+key+']');
 // reviewRequired: la corrida mostrada exige permiso de revisión; se vuelve a exigir en cada verificación de sesión, sondeo,
 // cambio de capacidades y exportación, no sólo al leer el detalle (revisión de Codex).
 let stopped=false,busy=false,sequence=0,operation=null,access=null,ownCatalog=null,grhCatalog=null,model=null,selection=null,page=1,reviewRequired=false;
 const available=()=>!stopped&&host.isConnected&&!document.hidden&&!host.closest('[hidden]');
 const status=message=>{$('state').textContent=message;};
 const selected=()=>({ownId:$('own').value,grhId:$('grh').value});
 const filter=()=>({view:$('view').value,status:$('filter').value,search:$('search').value,page});
 function controls(){
  host.setAttribute('aria-busy',String(busy));$('catalog').disabled=busy||!available();$('fields').disabled=busy||!available()||!ownCatalog||!grhCatalog;
  $('compare').disabled=busy||!available()||!selected().ownId||!selected().grhId;
  for(const key of ['csv','xlsx','pdf'])$(key).disabled=busy||!available()||!model;
  const v=model?ownGrhComparisonView(model,filter()):null;
  $('prev').disabled=busy||!v||page<=1;$('next').disabled=busy||!v||page>=v.pages;
 }
 function cancel(){sequence++;operation?.abort();operation=null;busy=false;}
 function clear(){
  model=null;selection=null;reviewRequired=false;page=1;$('result').hidden=true;$('rows').replaceChildren();$('trace').replaceChildren();
  for(const k of ['sources','warnings','summary','caption','page'])$(k).textContent='';
  $('search').value='';$('filter').value='all';$('view').value='concepts';controls();
 }
 function resetCatalogs(){
  ownCatalog=grhCatalog=null;$('form').hidden=true;
  $('own').replaceChildren(option('Elegí un cálculo propio',''));
  $('grh').replaceChildren(option('Elegí una liquidación GRH',''));
  $('catalog-note').textContent='';
 }
 function suspend(message){cancel();access=null;resetCatalogs();clear();status(message);}
 async function request(url,signal){
  if(!available())throw new DOMException('Consulta cancelada','AbortError');
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal});
  if(response.status===401||response.status===403)throw Object.assign(Error(response.status===401?'La sesión venció. Volvé a ingresar.':'Tu cuenta ya no tiene permisos para consultar ambas fuentes.'),{status:response.status});
  let payload;try{payload=await response.json();}catch{throw Error('La fuente no entregó un JSON completo. Volvé a consultar.');}
  if(!response.ok||payload?.ok!==true)throw Error(payload?.error??'La consulta completa no está disponible. No se aceptan resultados parciales.');
  return payload.data;
 }
 const required=review=>[...OWN_RUN_NOMINAL,...grhCapabilities,...(review?OWN_LIQ_REVIEW:[])];
 async function session(signal,{review=reviewRequired}={}){
  const current=ownRunWorkspaceAccess(await requestAuth(signal));
  if(!hasOwnRunAccess(current.caps,required(false)))throw Object.assign(Error('Faltan permisos nominales propios o lectura de nómina GRH por legajo.'),{status:403});
  if(review&&!hasOwnRunAccess(current.caps,OWN_LIQ_REVIEW))throw Object.assign(Error('Este cálculo necesita permiso de revisión.'),{status:403});
  if(access&&access.key!==current.key)throw Object.assign(Error('Cambió la sesión municipal: hay que consultar nuevamente.'),{status:403});
  access=current;$('login').hidden=true;
 }
 async function requestAuth(signal){
  if(!available())throw new DOMException('Consulta cancelada','AbortError');
  const response=await fetch('/api/internal-auth',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal});
  if(response.status===401||response.status===403)throw Object.assign(Error('La sesión municipal no está disponible.'),{status:response.status});
  const payload=await response.json();if(!response.ok)return {ok:false};
  return payload;
 }
 const ownLabel=r=>r.period+' · '+(OWN_RUN_TYPES[r.liquidationType]??r.liquidationType)+' · '+r.employeeCount+' legajos · ref. '+r.id.slice(0,8);
 const grhLabel=r=>r.date+' · '+sourceReportTypeLabel(r.type)+' · '+r.statementCount+' legajos · ref. '+r.datasetId.slice(0,8);
 function grhOptions(){
  const own=ownCatalog?.runs.find(r=>r.id===$('own').value),type=OWN_GRH_TYPES[own?.liquidationType];
  const previous=$('grh').value;
  const options=[option('Elegí una liquidación GRH','')];
  // La fecha del catálogo GRH es fecha de liquidación, no necesariamente su período salarial:
  // sólo filtramos el tipo; el cotejo real de período se hace con la respuesta de la 242.
  for(const item of grhCatalog?.items??[])if(item.type===type)options.push(option(grhLabel(item),item.datasetId));
  $('grh').replaceChildren(...options);
  if(options.some(o=>o.value===previous))$('grh').value=previous;
  $('catalog-note').textContent=own?'Se muestran fuentes GRH del mismo tipo. La fecha del catálogo no define el período: se verifica al consultar el detalle completo.':'Elegí primero una corrida propia.';
  controls();
 }
 async function perform(work){
  if(busy||!available())return;
  const number=++sequence,controller=new AbortController();operation=controller;busy=true;controls();
  const timeout=setTimeout(()=>controller.abort(),60000);
  const valid=()=>{if(number!==sequence||operation!==controller||controller.signal.aborted||!available())throw new DOMException('Consulta invalidada','AbortError');};
  try{await work(controller.signal,valid);}
  catch(error){if(number===sequence&&available()){
   clear();if([401,403].includes(error.status)){access=null;resetCatalogs();$('login').hidden=error.status!==401;}
   status(error.name==='AbortError'?'La consulta se interrumpió. Consultá nuevamente.':error.message);
  }}finally{clearTimeout(timeout);if(number===sequence){operation=null;busy=false;controls();}}
 }
 async function bootstrap(signal){return ownLiquidationBootstrap(await request(ownEndpoint+'?resource=bootstrap',signal));}
 async function listGrh(signal){return sourceReportCatalog(payrollSourceReport(await request(grhEndpoint+'?resource=payrollsourcereport',signal)));}
 async function readPair(pair,signal,valid){
  await session(signal);valid();
  const boot=await bootstrap(signal);valid();
  const item=boot.runs.find(r=>r.id===pair.ownId);
  if(!item||!item.canConsult)throw Error('Ese cálculo propio ya no está disponible para tu cuenta.');
  const detailResponse=await fetchOwnLiquidationDetail(pair.ownId,{signal});valid();
  if([401,403].includes(detailResponse.status))throw Object.assign(Error('Se retiró la lectura nominal de MuniControl.'),{status:detailResponse.status});
  if(!detailResponse.ok||detailResponse.payload?.ok!==true)throw Error('No llegó el cálculo propio completo.');
  const detail=ownLiquidationDetail(detailResponse.payload.data);
  if(detail.id!==item.id||detail.scopeVersion!==boot.scopeVersion||detail.capture.body.period!==item.period||
   detail.capture.body.liquidationType!==item.liquidationType||detail.capture.saved?.resultSha256!==item.resultSha256||
   detail.capture.saved?.result.employeeCount!==item.employeeCount)throw Error('Cambió el cálculo propio desde el catálogo. Consultá nuevamente.');
  if(detail.reviewAccessRequired&&!hasOwnRunAccess(access.caps,OWN_LIQ_REVIEW))throw Object.assign(Error('Este cálculo necesita permiso de revisión.'),{status:403});
  await verifiedHistoricalCapture(detail.capture);valid();
  // La 242 envía la forma compacta; se expande y valida completa antes de comparar.
  const grh=grhStatementLinesExpand(await request(grhEndpoint+'?resource=owngrhstatementlines&datasetId='+encodeURIComponent(pair.grhId),signal));valid();
  if(grh.datasetId!==pair.grhId)throw Error('La fuente GRH no corresponde a la selección.');
  const result=ownGrhComparison(detail.capture,grh,OWN_GRH_JOIN);valid();
  // Recaptura catálogo, autorización y SHA antes de entregar resultados, sin sustituirlos.
  const again=await bootstrap(signal);valid();const still=again.runs.find(r=>r.id===item.id);
  if(again.scopeVersion!==boot.scopeVersion||!still||!still.canConsult||still.resultSha256!==item.resultSha256)
   throw Error('El catálogo propio cambió durante la consulta.');
  await session(signal,{review:detail.reviewAccessRequired});valid();
  return {result,review:detail.reviewAccessRequired};
 }
 // Sólo presentación: tono del estado. Diferencia es alerta; ausencias e importes no evaluables, a revisar; el redondeo
 // se distingue de «Sin diferencia» también por color (nunca se iguala).
 const tone=r=>r.status==='equal'?'ok':r.status==='rounding'?'info':r.status==='difference'?'alert':'warn';
 const plural=(n,one,many)=>n+' '+(n===1?one:many);
 const cell=(tag,text,label,className)=>{const element=node(tag,text);element.dataset.label=label;if(className)element.className=className;return element;};
 function kpis(v){
  const card=(value,label,status,cardTone)=>{
   const element=node(status?'button':'div');element.className='own-grh-kpi';element.dataset.tone=cardTone;
   element.append(node('strong',String(value)),node('span',label));
   if(status){element.type='button';element.setAttribute('aria-pressed',String($('filter').value===status));
    element.addEventListener('click',()=>{$('filter').value=$('filter').value===status?'all':status;page=1;render();});}
   return element;
  };
  return [card(model.summary.legajos,model.summary.legajos===1?'Legajo unido':'Legajos unidos',null,'neutral'),
   card(v.review,'Para revisar','review',v.review?'alert':'ok'),
   card(v.rounding,v.rounding===1?'Diferencia de redondeo':'Diferencias de redondeo','rounding','info'),
   card(v.equal,'Sin diferencia','equal','ok')];
 }
 function render(){
  if(!model)return;
  const v=ownGrhComparisonView(model,filter()),concepts=$('view').value==='concepts';page=v.page;
  $('caption').textContent=plural(v.total,'registro completo','registros completos')+' por '+(concepts?'concepto':'total')+(v.filtered!==v.total?' · '+plural(v.filtered,'coincide','coinciden')+' con el filtro':'')+'.';
  $('summary').replaceChildren(...kpis(v));
  const counts={all:v.total,review:v.review,rounding:v.rounding,equal:v.equal};
  for(const item of $('filter').options??[])item.textContent=item.textContent.replace(/ \(\d+\)$/,'')+' ('+counts[item.value]+')';
  $('page').textContent='Página '+v.page+' de '+v.pages;
  $('empty').hidden=v.filtered!==0;
  $('rows').replaceChildren(...v.rows.map(r=>{
   const tr=node('tr');tr.dataset.ogrhLegajo=r.legajo;tr.dataset.ogrhStatus=r.status;tr.className=r.review?'is-review':r.status==='rounding'?'is-rounding':'';
   const employee=cell('th',r.legajo,'Legajo');employee.scope='row';
   const concept=cell('td',undefined,concepts?'Concepto':'Total','own-grh-concept');concept.append(node('span',concepts?r.code:r.label));
   // La descripción GRH es informativa: ayuda a leer el código, no participa de la unión.
   if(concepts&&r.grh?.description)concept.append(node('small',r.grh.description));
   tr.append(employee,concept);
   for(const [source,label] of [['own','MuniControl'],['grh','GRH']]){
    const missing=r[source]===null||r[source].amount===null;
    tr.append(cell('td',r[source]===null?'No figura':r[source].amount===null?'No informado':reportExactShown(r[source].amount),label,missing?'num muted':'num'));
   }
   tr.append(cell('td',r.delta===null?'No evaluable':reportExactShown(r.delta),'Diferencia',r.delta===null?'num muted':'num'));
   const state=cell('td',undefined,'Estado'),badge=node('span',r.state);badge.className='own-grh-badge';badge.dataset.tone=tone(r);state.append(badge);
   tr.append(state);
   return tr;
  }));
  controls();
 }
 $('catalog').addEventListener('click',()=>perform(async(signal,valid)=>{
  clear();resetCatalogs();status('Consultando ambos catálogos y permisos…');await session(signal);valid();
  const own=await bootstrap(signal);valid();const grh=await listGrh(signal);valid();
  ownCatalog=own;grhCatalog=grh;
  for(const item of own.runs)if(item.canConsult&&OWN_GRH_TYPES[item.liquidationType])$('own').append(option(ownLabel(item),item.id));
  $('form').hidden=false;
  status('Elegí un cálculo y una fuente GRH del mismo tipo. '+(grh.truncated?'El catálogo GRH sólo contiene los más recientes; no representa todos los históricos.':'No se construye ninguna liquidación.'));
  controls();
 }));
 $('own').addEventListener('change',()=>{cancel();clear();grhOptions();});
 $('grh').addEventListener('change',()=>{cancel();clear();});
 $('form').addEventListener('submit',event=>{event.preventDefault();const pair=selected();perform(async(signal,valid)=>{
  clear();status('Validando la corrida propia, la fuente GRH y la unión por legajo…');
  const fresh=await readPair(pair,signal,valid);valid();
  if(pair.ownId!==$('own').value||pair.grhId!==$('grh').value)throw Error('Cambió la selección.');
  model=fresh.result;reviewRequired=fresh.review;selection=pair;page=1;$('result').hidden=false;
  $('sources').textContent='MuniControl: '+ownLabel(ownCatalog.runs.find(r=>r.id===pair.ownId))+' · GRH: '+grhLabel(grhCatalog.items.find(r=>r.datasetId===pair.grhId));
  $('warnings').replaceChildren(...model.warnings.map(text=>node('li',text)));
  const traceDocument=ownGrhComparisonDocument(model,'concepts');
  $('trace').replaceChildren(...traceDocument.metadata.flatMap(([k,v])=>[node('dt',k),node('dd',String(v))]));
  render();$('result').querySelector('h3')?.focus();
  status('Comparación completa validada: los redondeos permanecen visibles y separados de las coincidencias.');
 });});
 for(const format of ['csv','xlsx','pdf'])$(format).addEventListener('click',()=>perform(async(signal,valid)=>{
  if(!model||!selection)return;
  const old=model,pair={...selection},view=$('view').value;
  status('Revalidando las dos fuentes y permisos antes de exportar…');
  const fresh=await readPair(pair,signal,valid);valid();
  if(model!==old||old.proof!==fresh.result.proof||view!==$('view').value)throw Error('Cambió la fuente o la vista. Volvé a comparar.');
  const doc=ownGrhComparisonDocument(fresh.result,view);
  const bytes=format==='csv'?reportCsv(doc):format==='xlsx'?reportXlsx(doc):reportPdf(doc);
  const filename=saveReportBytes(doc,format,bytes);
  status('Archivo completo verificado: '+filename+'. Ningún filtro ni página recortó registros.');
 }));
 for(const key of ['view','filter'])$(key).addEventListener('change',()=>{page=1;render();});
 $('search').addEventListener('input',()=>{page=1;render();});
 $('prev').addEventListener('click',()=>{page=Math.max(1,page-1);render();});
 $('next').addEventListener('click',()=>{page++;render();});
 const task=event=>{if(event.detail?.id!=='comparar')suspend('La comparación se retiró al cambiar de tarea.');else controls();};
 const visibility=()=>{if(document.hidden)suspend('La página se ocultó: se retiraron las fuentes nominales.');else controls();};
 // Un cambio de capacidades invalida lo que falte para la vista actual y, además, cualquier consulta en curso si retira el
 // permiso de revisión que la cuenta tenía: esa consulta pudo leer una corrida que lo exige y una autenticación vieja no
 // puede habilitar su resultado (Codex local, 18/11).
 const capabilities=event=>{
  const next=new Set(event.detail?.tenantCapabilities??[]);
  if(access&&!hasOwnRunAccess(next,required(reviewRequired)))return suspend('Cambió el acceso: consultá nuevamente.');
  if(busy&&access&&hasOwnRunAccess(access.caps,OWN_LIQ_REVIEW)&&!hasOwnRunAccess(next,OWN_LIQ_REVIEW))suspend('Cambió el permiso de revisión durante la consulta: consultá nuevamente.');
 };
 document.addEventListener('taskchange',task);
 document.addEventListener('visibilitychange',visibility);
 document.addEventListener('municontrol:capabilities-ready',capabilities);
 document.getElementById('logoutButton')?.addEventListener('click',()=>suspend('Sesión cerrada.'));
 const poll=setInterval(()=>{if(available()&&!busy&&access)perform(async signal=>{await session(signal);});},60000);
 // Al salir se retiran los datos nominales. Si el navegador guarda la página para «Atrás» (persisted), el panel queda
 // vivo y al volver se puede consultar de nuevo; si la página se descarta, se detiene del todo.
 const restore=event=>{if(event.persisted&&!stopped){status('Página restaurada: consultá nuevamente las fuentes.');controls();}};
 const unload=event=>{suspend('Página cerrada.');if(event.persisted)return;stopped=true;clearInterval(poll);
  document.removeEventListener('taskchange',task);document.removeEventListener('visibilitychange',visibility);
  document.removeEventListener('municontrol:capabilities-ready',capabilities);
  window.removeEventListener?.('pagehide',unload);window.removeEventListener?.('pageshow',restore);
 };
 window.addEventListener('pagehide',unload);window.addEventListener('pageshow',restore);
 controls();
 return {clear:()=>suspend('Comparación retirada.'),get hasComparison(){return Boolean(model);}};
}
