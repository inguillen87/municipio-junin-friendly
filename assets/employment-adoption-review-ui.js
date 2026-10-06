import {verifiedAdoptionReview,adoptionReviewCsv,adoptionReviewScope,ADOPTION_REVIEW_MAX_BYTES} from './employment-adoption-review-model.js';
export function mountAdoptionReview(root){
 if(!root||root.dataset.mounted)return;root.dataset.mounted='true';
 root.innerHTML=`<summary><strong>Revisar el padrón antes de su adopción</strong><span>Antecedentes pendientes para trabajar con el circuito propio</span></summary><div class="ar-body">
 <p>Revisá todos los contratos históricos de la fuente municipal instalada, incluidos inactivos y estados pendientes. Las fechas, encuadres y jurisdicciones necesitan respaldo; la revisión no adopta contratos ni habilita liquidaciones.</p>
 <button type="button" class="button primary" data-ar-consult>Revisar padrón completo</button><p role="status" aria-live="polite" data-ar-status>La revisión es voluntaria. Abrir este panel no consulta datos personales.</p>
 <section data-ar-result hidden><p data-ar-counts></p><p data-ar-source></p><button type="button" class="button" data-ar-download>Descargar observaciones sin datos personales</button>
 <p>El CSV contiene fila de esta revisión, estado y acción sugerida. Incluye todas las observaciones, aunque haya búsqueda o cambio de página. No contiene nombres, legajos, documentos, identificadores o importes. La fila corresponde al padrón revisado, no a un TXT.</p>
 <label>Buscar en esta revisión por nombre o legajo<input type="search" maxlength="100" autocomplete="off" data-ar-search></label><p data-ar-visible></p>
 <div class="ar-pages" role="navigation" aria-label="Páginas de revisión · inicio"><button type="button" class="button" data-ar-prev>Anterior</button><span data-ar-page></span><button type="button" class="button" data-ar-next>Siguiente</button></div>
 <div class="ar-table-wrap"><table><caption>Contratos históricos pendientes de adopción municipal</caption><thead><tr><th>Fila</th><th>Legajo / agente</th><th>Situación</th><th>Observaciones</th><th>Ficha</th></tr></thead><tbody data-ar-rows></tbody></table></div>
 </section></div>`;
 const $=key=>root.querySelector('[data-ar-'+key+']'),pages=root.querySelector('.ar-pages').cloneNode(true);pages.setAttribute('aria-label','Páginas de revisión · final');$('result').append(pages);
 let snapshot=null,page=1,allowed=false,busy=false,generation=0,controller=null;
 const message=text=>{$('status').textContent=text;},live=()=>allowed&&!document.hidden&&root.open&&root.isConnected;
 const filtered=()=>snapshot?snapshot.rows.filter(r=>[r.name,r.legajo].some(v=>(v??'').toLocaleLowerCase('es').includes($('search').value.toLocaleLowerCase('es')))):[];
 function controls(){
  $('consult').disabled=busy||!allowed||document.hidden;$('download').disabled=busy||!snapshot||!live();$('search').disabled=busy||!snapshot||!live();
  const total=filtered().length;root.querySelectorAll('[data-ar-prev]').forEach(n=>n.disabled=busy||!live()||!snapshot||page<=1);root.querySelectorAll('[data-ar-next]').forEach(n=>n.disabled=busy||!live()||!snapshot||page*25>=total);root.setAttribute('aria-busy',String(busy));
 }
 function invalidate(text='Revisión retirada. Consultá nuevamente el padrón completo.'){
  generation++;controller?.abort();snapshot=null;busy=false;page=1;$('search').value='';$('result').hidden=true;$('rows').replaceChildren();$('counts').textContent='';$('source').textContent='';$('visible').textContent='';root.querySelectorAll('[data-ar-page]').forEach(n=>n.textContent='');message(text);controls();
 }
 function paint(){
  const d=snapshot,rows=filtered();$('result').hidden=false;$('counts').textContent=`${d.total} contratos revisados · ${d.counts.active} activos · ${d.counts.inactive} inactivos · ${d.counts.state_error} con estado a revisar. ${d.counts.dataReview} requieren revisar datos; ${d.counts.jurisdictionPending} tienen jurisdicción por declarar.`;
  $('source').textContent=`Corte de la fuente instalada: ${d.source.cutoff.replace('T',' ')}. Un respaldo posterior no se incorpora por esta consulta. Varios contratos de una persona no implican identidad duplicada.`;
  $('visible').textContent=`${rows.length} contratos coinciden en pantalla; la descarga conserva las ${d.counts.observations} observaciones del padrón completo.`;$('rows').replaceChildren();
  for(const r of rows.slice((page-1)*25,page*25)){
   const tr=document.createElement('tr');for(const [label,text]of [['Fila',String(r.rowNumber)],['Legajo / agente',(r.legajo??'Sin número informado')+' · '+(r.name??'Nombre pendiente')],['Situación',({active:'Activo',inactive:'Inactivo',state_error:'Estado a revisar'})[r.status]],['Observaciones',r.observations.map(o=>o.status+': '+o.action).join(' ')||'Sin observaciones de datos. La adopción requiere una decisión explícita.']]){const td=document.createElement('td');td.dataset.label=label;td.textContent=text;tr.append(td);}
   const td=document.createElement('td'),a=document.createElement('a');a.className='button';a.href='/personal?contractId='+encodeURIComponent(r.contractId)+'#legajos';a.textContent='Abrir ficha';a.setAttribute('aria-label',`Abrir ficha de la fila ${r.rowNumber} · ${r.name??'nombre pendiente'}`);td.append(a);tr.append(td);$('rows').append(tr);
  }
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent=d.total?'No hay coincidencias para esta búsqueda. El reporte conserva toda la revisión.':'No hay contratos históricos pendientes en la fuente instalada. No se inventaron observaciones.';tr.append(td);$('rows').append(tr);}
  root.querySelectorAll('[data-ar-page]').forEach(n=>n.textContent=`Página ${page} de ${Math.max(1,Math.ceil(rows.length/25))}`);controls();
 }
 async function authority(signal){
  const response=await fetch('/api/internal-auth',{credentials:'same-origin',cache:'no-store',signal}),value=await response.json();
  if(!response.ok||value.ok!==true||value.authenticated!==true||!value.access?.tenantCapabilities?.includes('workforce.employee.read'))throw Object.assign(Error('Tu acceso ya no permite revisar el padrón. Se retiraron los datos.'),{status:response.status===401?401:403});
 }
 async function read(signal){
  await authority(signal);const response=await fetch('/api/internal-data?resource=employmentadoptionreview',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal}),bytes=await response.text();
  if(new TextEncoder().encode(bytes).length>ADOPTION_REVIEW_MAX_BYTES+1024)throw Error('La respuesta completa supera la capacidad de revisión. No se descargaron filas parciales.');
  let value;try{value=JSON.parse(bytes);}catch{throw Error('No se pudo verificar la revisión completa. Consultá nuevamente.');}
  if(!response.ok||value.ok!==true)throw Object.assign(Error(value.error??'No se obtuvo el padrón completo.'),{status:response.status});return verifiedAdoptionReview(value.data);
 }
 async function run(download=false){
  if(busy||!live())return;const old=snapshot,token=++generation;controller?.abort();controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]);busy=true;controls();message(download?'Verificando el padrón completo y el acceso antes de descargar…':'Revisando todos los contratos de la fuente instalada…');
  try{
   let fresh=await read(signal);if(token!==generation||!live())return;
   if(download){
    if(!old||adoptionReviewScope(old.scope)!==adoptionReviewScope(fresh.scope)){invalidate('Cambió el municipio o la membresía. Consultá nuevamente con el acceso vigente.');return;}
    if(old.snapshot!==fresh.snapshot){snapshot=fresh;page=1;paint();message('El padrón cambió. Revisá la información actualizada y volvé a descargar.');return;}
    fresh=await read(signal);if(token!==generation||!live())return;
    if(old.snapshot!==fresh.snapshot||adoptionReviewScope(old.scope)!==adoptionReviewScope(fresh.scope)){invalidate('Cambió el padrón o el ámbito durante la descarga. Consultá nuevamente.');return;}
    const csv=adoptionReviewCsv(fresh),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='municontrol-observaciones-padron-'+fresh.today+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`Descargadas ${fresh.counts.observations} observaciones de ${fresh.total} contratos. La búsqueda no recortó el reporte.`);
   }else{snapshot=fresh;page=1;paint();message(fresh.total?'Revisión completa disponible. Abrí las fichas para contrastar sus antecedentes.':'Revisión completa sin contratos históricos pendientes.');}
  }catch(e){if(token===generation){if([401,403].includes(e.status))allowed=false;invalidate(['AbortError','TimeoutError'].includes(e.name)?'La revisión se interrumpió. Consultá nuevamente.':e instanceof TypeError?'No se pudo consultar el padrón. Revisá la conexión y volvé a consultar.':e.message);}}
  finally{if(token===generation){busy=false;controls();}}
 }
 $('consult').addEventListener('click',()=>run());$('download').addEventListener('click',()=>run(true));$('search').addEventListener('input',()=>{if(snapshot){page=1;paint();}});
 root.querySelectorAll('[data-ar-prev]').forEach(n=>n.addEventListener('click',()=>{if(snapshot&&page>1){page--;paint();}}));root.querySelectorAll('[data-ar-next]').forEach(n=>n.addEventListener('click',()=>{if(snapshot&&page*25<filtered().length){page++;paint();}}));
 root.addEventListener('toggle',()=>{if(!root.open)invalidate();});document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidate('Datos retirados al ocultar la pantalla. Consultá nuevamente.');else controls();});window.addEventListener('pagehide',()=>invalidate());document.getElementById('logoutButton')?.addEventListener('click',()=>{allowed=false;invalidate('Sesión cerrada.');});
 const permissions=event=>{const caps=event?.detail?.tenantCapabilities;allowed=caps instanceof Set&&caps.has('workforce.employee.read');if(!allowed)invalidate('Tu acceso no permite revisar el padrón.');else controls();};
 document.addEventListener('municontrol:capabilities-ready',permissions);window.MuniControlCapabilityGate?.ready?.then(result=>permissions({detail:result}));
 for(const event of ['mc:native-employee-created','mc:native-employment-changed','mc:native-employment-lifecycle-changed'])document.addEventListener(event,()=>invalidate('Cambió un legajo o su situación. Consultá nuevamente la revisión completa.'));controls();
}
if(typeof document!=='undefined')mountAdoptionReview(document.querySelector('[data-adoption-review]'));
