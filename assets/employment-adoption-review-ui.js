import {verifiedAdoptionReview,adoptionReviewCsv,adoptionReviewScope,ADOPTION_REVIEW_MAX_BYTES} from './employment-adoption-review-model.js';
import {mountAdoptionPreparation} from './employment-adoption-preparation-ui.js';
import {mountMunicipalAdoptionOperator} from './municipal-adoption-operator-ui.js';
import {adoptionFinalSources,adoptionPreparationBootstrap} from './employment-adoption-preparation-model.js';
import {appendAdoptionChanges} from './employment-adoption-changes-ui.js';
export function mountAdoptionReview(root){
 if(!root||root.dataset.mounted)return;root.dataset.mounted='true';
 root.innerHTML=`<summary><strong>Revisar el padrón antes de su adopción</strong><span>Antecedentes pendientes para trabajar con el circuito propio</span></summary><div class="ar-body">
 <p>Revisá el personal activo del respaldo final preparado para trabajar con el padrón diario. Los inactivos se conservan en los antecedentes históricos. La consulta de la fuente instalada también sigue disponible. Revisar no adopta contratos ni habilita liquidaciones.</p>
 <button type="button" class="button primary" data-ar-consult>Revisar padrón completo</button><details data-ar-cuts-panel><summary>Revisar un respaldo final preparado</summary><p>Consultar su disponibilidad no lo incorpora al padrón. Elegí el corte expresamente para comparar sus antecedentes completos antes de proponer una adopción.</p><button type="button" class="button" data-ar-cuts>Consultar respaldos finales disponibles</button><div data-ar-cut-options></div></details><p role="status" aria-live="polite" data-ar-status>La revisión es voluntaria. Abrir este panel no consulta datos personales.</p><div data-ar-operator></div>
 <section data-ar-result hidden><p data-ar-counts></p><p data-ar-source></p><button type="button" class="button" data-ar-download>Descargar observaciones sin datos personales</button>
 <p>El CSV contiene fila de esta revisión, estado y acción sugerida. Incluye todas las observaciones, aunque haya búsqueda o cambio de página. No contiene nombres, legajos, documentos, identificadores o importes. La fila corresponde al padrón revisado, no a un TXT.</p>
 <label>Buscar en esta revisión por nombre o legajo<input type="search" maxlength="100" autocomplete="off" data-ar-search></label><p data-ar-visible></p>
 <div class="ar-pages" role="navigation" aria-label="Páginas de revisión · inicio"><button type="button" class="button" data-ar-prev>Anterior</button><span data-ar-page></span><button type="button" class="button" data-ar-next>Siguiente</button></div>
 <div class="ar-table-wrap"><table><caption data-ar-caption>Contratos pendientes de adopción municipal</caption><thead><tr><th>Fila</th><th>Legajo / agente</th><th>Situación</th><th>Observaciones</th><th>Ficha</th></tr></thead><tbody data-ar-rows></tbody></table></div>
 <div data-ar-preparation></div></section></div>`;
 const $=key=>root.querySelector('[data-ar-'+key+']'),pages=root.querySelector('.ar-pages').cloneNode(true);pages.setAttribute('aria-label','Páginas de revisión · final');$('result').append(pages);
 let snapshot=null,selectedSource=null,page=1,allowed=false,busy=false,generation=0,controller=null;
 const message=text=>{$('status').textContent=text;},live=()=>allowed&&!document.hidden&&root.open&&root.isConnected;
 const preparation=mountAdoptionPreparation($('preparation'),{isLive:live,onAuthorityLost:()=>invalidate('Cambió el acceso o el ámbito. Consultá nuevamente el padrón completo.')});
 const operator=mountMunicipalAdoptionOperator($('operator'),{isLive:live});
 const filtered=()=>snapshot?snapshot.rows.filter(r=>[r.name,r.legajo].some(v=>(v??'').toLocaleLowerCase('es').includes($('search').value.toLocaleLowerCase('es')))):[];
 function controls(){
  $('consult').disabled=busy||!allowed||document.hidden;$('download').disabled=busy||!snapshot||!live();$('search').disabled=busy||!snapshot||!live();
  $('cuts').disabled=busy||!live();$('cut-options').querySelectorAll('button').forEach(n=>n.disabled=busy||!live());
  const total=filtered().length;root.querySelectorAll('[data-ar-prev]').forEach(n=>n.disabled=busy||!live()||!snapshot||page<=1);root.querySelectorAll('[data-ar-next]').forEach(n=>n.disabled=busy||!live()||!snapshot||page*25>=total);root.setAttribute('aria-busy',String(busy));
 }
 function invalidate(text='Revisión retirada. Consultá nuevamente el padrón completo.',withdrawOperator=true){
  preparation.invalidate();
  if(withdrawOperator)operator.invalidate();
  generation++;controller?.abort();snapshot=null;selectedSource=null;busy=false;page=1;$('cut-options').replaceChildren();$('search').value='';$('result').hidden=true;$('rows').replaceChildren();$('counts').textContent='';$('source').textContent='';$('visible').textContent='';root.querySelectorAll('[data-ar-page]').forEach(n=>n.textContent='');message(text);controls();
 }
 function paint(){
  preparation.setReview(snapshot);
  const d=snapshot,rows=filtered(),cohort=d.source.operationalCohort;$('result').hidden=false;$('counts').textContent=cohort?`${d.total} contratos activos del padrón diario · ${cohort.archivedTotal} inactivos conservados como antecedentes · ${cohort.sourceTotal} contratos en la fuente completa. ${d.counts.dataReview} activos requieren revisar datos; ${d.counts.jurisdictionPending} tienen jurisdicción por declarar.`:`${d.total} contratos revisados · ${d.counts.active} activos · ${d.counts.inactive} inactivos · ${d.counts.state_error} con estado a revisar. ${d.counts.dataReview} requieren revisar datos; ${d.counts.jurisdictionPending} tienen jurisdicción por declarar.`;
  $('source').textContent=d.source.finalRevision?`Respaldo final revisado: ${d.source.finalRevision.cutoff.replace('T',' ')}. Antecedentes instalados: ${d.source.cutoff.replace('T',' ')}. Compará antes y propuesto. Consultar no aplica cambios ni habilita liquidaciones.`:`Corte de la fuente instalada: ${d.source.cutoff.replace('T',' ')}. Un respaldo posterior no se incorpora por esta consulta. Varios contratos de una persona no implican identidad duplicada.`;
  $('visible').textContent=`${rows.length} contratos coinciden en pantalla; la descarga conserva las ${d.counts.observations} observaciones del padrón completo.`;$('rows').replaceChildren();
  for(const r of rows.slice((page-1)*25,page*25)){
   const tr=document.createElement('tr');for(const [label,text]of [['Fila',String(r.sourceRowNumber??r.rowNumber)],['Legajo / agente',(r.legajo??'Sin número informado')+' · '+(r.name??'Nombre pendiente')],['Situación',({active:'Activo',inactive:'Inactivo',state_error:'Estado a revisar'})[r.status]],['Observaciones',r.observations.map(o=>o.status+': '+o.action).join(' ')||'Sin observaciones de datos. La adopción requiere una decisión explícita.']]){const td=document.createElement('td');td.dataset.label=label;td.textContent=text;if(label==='Observaciones')appendAdoptionChanges(td,r);tr.append(td);}
   const td=document.createElement('td'),a=document.createElement('a');a.className='button';a.href='/personal?contractId='+encodeURIComponent(r.contractId)+'#legajos';a.textContent='Abrir ficha';a.setAttribute('aria-label',`Abrir ficha de la fila ${r.sourceRowNumber??r.rowNumber} · ${r.name??'nombre pendiente'}`);td.append(a);tr.append(td);$('rows').append(tr);
  }
  $('caption').textContent=cohort?'Personal activo del respaldo final · filas de la fuente completa':'Contratos históricos pendientes de adopción municipal';
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent=d.total?'No hay coincidencias para esta búsqueda. El reporte conserva toda la revisión.':cohort?'El respaldo completo no contiene contratos activos. No se inventaron observaciones.':'No hay contratos históricos pendientes en la fuente instalada. No se inventaron observaciones.';tr.append(td);$('rows').append(tr);}
  root.querySelectorAll('[data-ar-page]').forEach(n=>n.textContent=`Página ${page} de ${Math.max(1,Math.ceil(rows.length/25))}`);controls();
 }
 async function authority(signal){
  const response=await fetch('/api/internal-auth',{credentials:'same-origin',cache:'no-store',signal}),value=await response.json();
  if(!response.ok||value.ok!==true||value.authenticated!==true||!value.access?.tenantCapabilities?.includes('workforce.employee.read'))throw Object.assign(Error('Tu acceso ya no permite revisar el padrón. Se retiraron los datos.'),{status:response.status===401?401:403});
 }
 async function read(signal,selected=null){
  if(selected){await authority(signal);const active=selected.cohort==='active-contracts.v1',value=await adoptionPreparationBootstrap(await adoptionRequest('?'+new URLSearchParams({resource:active?'final-active-bootstrap':'final-bootstrap',revisionId:selected.revisionId,packageSha256:selected.packageSha256}),signal));if(value.review.source.finalRevision?.revisionId!==selected.revisionId||value.review.source.finalRevision?.packageSha256!==selected.packageSha256||active!==Boolean(value.review.source.operationalCohort))throw Error('No se obtuvo el mismo respaldo y alcance. Consultá nuevamente.');return value.review;}
  await authority(signal);const response=await fetch('/api/internal-data?resource=employmentadoptionreview',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal}),bytes=await response.text();
  if(new TextEncoder().encode(bytes).length>ADOPTION_REVIEW_MAX_BYTES+1024)throw Error('La respuesta completa supera la capacidad de revisión. No se descargaron filas parciales.');
  let value;try{value=JSON.parse(bytes);}catch{throw Error('No se pudo verificar la revisión completa. Consultá nuevamente.');}
  if(!response.ok||value.ok!==true)throw Object.assign(Error(value.error??'No se obtuvo el padrón completo.'),{status:response.status});return verifiedAdoptionReview(value.data);
 }
 async function run(download=false,selected=null){
  if(busy||!live())return;const old=snapshot,source=download?selectedSource:selected,token=++generation;controller?.abort();controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]);busy=true;controls();message(download?'Verificando el padrón completo y el acceso antes de descargar…':source?'Comparando todos los contratos del respaldo final…':'Revisando todos los contratos de la fuente instalada…');
  try{
   let fresh=await read(signal,source);if(token!==generation||!live())return;
   if(download){
    if(!old||adoptionReviewScope(old.scope)!==adoptionReviewScope(fresh.scope)){invalidate('Cambió el municipio o la membresía. Consultá nuevamente con el acceso vigente.');return;}
    if(old.snapshot!==fresh.snapshot){snapshot=fresh;page=1;paint();message('El padrón cambió. Revisá la información actualizada y volvé a descargar.');return;}
    fresh=await read(signal,source);if(token!==generation||!live())return;
    if(old.snapshot!==fresh.snapshot||adoptionReviewScope(old.scope)!==adoptionReviewScope(fresh.scope)){invalidate('Cambió el padrón o el ámbito durante la descarga. Consultá nuevamente.');return;}
    const csv=adoptionReviewCsv(fresh),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='municontrol-observaciones-padron-'+fresh.today+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`Descargadas ${fresh.counts.observations} observaciones de ${fresh.total} contratos. La búsqueda no recortó el reporte.`);
   }else{snapshot=fresh;selectedSource=source;page=1;paint();message(fresh.total?'Revisión completa disponible. Abrí las fichas para contrastar sus antecedentes.':fresh.source.operationalCohort?'El respaldo verificado no contiene contratos activos. No se preparó una propuesta.':'Revisión completa sin contratos históricos pendientes.');}
  }catch(e){if(token===generation){if([401,403].includes(e.status))allowed=false;invalidate(['AbortError','TimeoutError'].includes(e.name)?'La revisión se interrumpió. Consultá nuevamente.':e instanceof TypeError?'No se pudo consultar el padrón. Revisá la conexión y volvé a consultar.':e.message);}}
  finally{if(token===generation){busy=false;controls();}}
 }
 async function adoptionRequest(query,signal){
  const response=await fetch('/api/internal-employment-adoption'+query,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal}),bytes=await response.text();
  if(new TextEncoder().encode(bytes).length>7000000)throw Error('La respuesta completa supera la capacidad. No se mostraron filas parciales.');
  let value;try{value=JSON.parse(bytes);}catch{throw Error('No se verificó la respuesta completa. Consultá nuevamente.');}
  if(!response.ok||value.ok!==true)throw Object.assign(Error(value.error??'No se obtuvo el respaldo preparado.'),{status:response.status});return value.data;
 }
 async function cuts(){
  if(busy||!live())return;const token=++generation;controller?.abort();controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]);busy=true;controls();message('Consultando referencias de respaldos preparados…');
  try{await authority(signal);const value=adoptionFinalSources(await adoptionRequest('?resource=final-sources',signal));if(token!==generation||!live())return;
   if(snapshot&&adoptionReviewScope(value.scope)!==adoptionReviewScope(snapshot.scope)){invalidate('Cambió el ámbito. Consultá nuevamente el padrón.');return;}
   $('cut-options').replaceChildren();for(const row of value.rows){const button=document.createElement('button');button.type='button';button.className='button primary';button.textContent='Revisar personal activo · '+row.cutoff.replace('T',' ');button.addEventListener('click',()=>run(false,{...row,cohort:'active-contracts.v1'}));$('cut-options').append(button);const history=document.createElement('details'),summary=document.createElement('summary'),legacy=document.createElement('button');summary.textContent='Consultar antecedentes históricos';legacy.type='button';legacy.className='button';legacy.textContent='Revisar fuente histórica completa';legacy.addEventListener('click',()=>run(false,row));history.append(summary,legacy);$('cut-options').append(history);}
   message(value.total?'Elegí el corte para revisar todos sus activos. Los inactivos se conservan como antecedentes. No se aplicaron cambios.':'No hay respaldos finales preparados en este ámbito. La consulta del padrón instalado sigue disponible.');
  }catch(e){if(token===generation){if([401,403].includes(e.status)){allowed=false;invalidate(e.message);}else message(e.message||'No se pudo consultar la disponibilidad.');}}
  finally{if(token===generation){busy=false;controls();}}
 }
 $('cuts').addEventListener('click',cuts);
 $('consult').addEventListener('click',()=>run());$('download').addEventListener('click',()=>run(true));$('search').addEventListener('input',()=>{if(snapshot){page=1;paint();}});
 root.querySelectorAll('[data-ar-prev]').forEach(n=>n.addEventListener('click',()=>{if(snapshot&&page>1){page--;paint();}}));root.querySelectorAll('[data-ar-next]').forEach(n=>n.addEventListener('click',()=>{if(snapshot&&page*25<filtered().length){page++;paint();}}));
 root.addEventListener('toggle',()=>{if(!root.open)invalidate();else{controls();operator.refreshControls();}});document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidate('Datos retirados al ocultar la pantalla. Consultá nuevamente.');else{controls();operator.refreshControls();}});window.addEventListener('pagehide',()=>invalidate());document.getElementById('logoutButton')?.addEventListener('click',()=>{allowed=false;invalidate('Sesión cerrada.');});
 const permissions=event=>{const caps=event?.detail?.tenantCapabilities;allowed=caps instanceof Set&&caps.has('workforce.employee.read');if(!allowed)invalidate('Tu acceso no permite revisar el padrón.');else{controls();operator.refreshControls();}};
 document.addEventListener('municontrol:capabilities-ready',permissions);window.MuniControlCapabilityGate?.ready?.then(result=>permissions({detail:result}));
 for(const event of ['mc:native-employee-created','mc:native-employment-changed','mc:native-employment-lifecycle-changed'])document.addEventListener(event,()=>invalidate('Cambió un legajo o su situación. Consultá nuevamente la revisión completa.'));controls();
 document.addEventListener('mc:municipal-adoption-decided',event=>{if(event.detail?.status==='approved')invalidate('Se adoptó el padrón. Consultá nuevamente el padrón propio para continuar.',false);});
}
if(typeof document!=='undefined')mountAdoptionReview(document.querySelector('[data-adoption-review]'));
