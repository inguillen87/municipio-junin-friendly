import {adoptionPreparationBootstrap,adoptionPreparationPayload,adoptionPreparationReceipt,adoptionInactiveJurisdictionPending,ADOPTION_PENDING_PREPARATION_VERSION,ADOPTION_FINAL_PREPARATION_VERSION} from './employment-adoption-preparation-model.js';
import {verifySourceDeclarations} from './employment-source-declarations.js';
import {originalRegistryFactsAllowed,originalRegistryFactsCounts} from './employment-adoption-original-facts.js';
import {adoptionReviewScope} from './employment-adoption-review-model.js';

const API='/api/internal-employment-adoption';
const issue=(message,status,code)=>Object.assign(Error(message),{status,code});
export function mountAdoptionPreparation(host,{isLive,onAuthorityLost}={}){
 if(!host)return;
 host.innerHTML=`<button type="button" class="button" data-ap-open aria-expanded="false" aria-controls="adoption-preparation-body">Preparar la adopción del padrón</button><section id="adoption-preparation-body" data-ap-panel hidden><h4>Guardar los antecedentes para su revisión</h4>
 <p>La propuesta conserva todos los contratos del alcance elegido: personal activo o fuente histórica completa. El alcance y sus cantidades se muestran antes de guardar. Guardarla no adopta contratos ni habilita liquidaciones. Otra persona debe revisarla y decidirla en Revisar propuestas de adopción.</p>
 <button type="button" class="button" data-ap-load>Consultar condiciones y propuestas</button><p role="status" aria-live="polite" data-ap-status>La consulta es voluntaria. No se guarda nada al abrir este apartado.</p>
 <section data-ap-pending hidden><h4>Envío sin confirmar</h4><p>Consultá el mismo intento antes de preparar otra propuesta. Se conserva su contenido y referencia en esta página.</p><button type="button" class="button" data-ap-recover>Consultar resultado del mismo intento</button><button type="button" class="button" data-ap-retry disabled>Reenviar el mismo intento</button></section>
 <form data-ap-form hidden><p data-ap-counts></p><label data-ap-policy-label hidden>Datos pendientes del padrón activo<select data-ap-policy><option value="complete">Completar con antecedentes municipales</option><option value="original">Incorporar conservando los datos originales</option></select></label><p data-ap-original-status role="status" aria-live="polite" hidden></p><label class="ap-confirm" data-ap-original-ack-label hidden><input type="checkbox" data-ap-original-ack>Confirmo que los datos pendientes se conservarán y deberán completarse antes de calcular los haberes que los requieran</label><section data-ap-facts hidden><h5>Completar los datos faltantes del personal activo</h5><p>Declaralos según el antecedente municipal. El respaldo original se conserva. Revisar estas declaraciones no guarda una propuesta ni adopta contratos.</p><div data-ap-facts-rows></div><button type="button" class="button" data-ap-preview>Revisar declaraciones sin guardar</button><p data-ap-facts-status role="status" aria-live="polite"></p></section>
 <label>Jurisdicción para los contratos que no la tienen declarada<select data-ap-jurisdiction required><option value="">Elegí según el respaldo municipal</option><option value="42">Jurisdicción 42</option><option value="55">Jurisdicción 55</option></select></label>
 <p data-ap-jurisdiction-help>La elección general se aplica a los contratos pendientes. Podés declarar excepciones por contrato en la misma propuesta. Las jurisdicciones ya declaradas se conservan; ninguna se deduce del legajo, sector o archivo.</p>
 <p data-ap-jurisdiction-counts role="status" aria-live="polite"></p>
 <button type="button" class="button" data-ap-jurisdiction-open aria-expanded="false" aria-controls="adoption-jurisdiction-body">Revisar jurisdicción por contrato</button>
 <section id="adoption-jurisdiction-body" data-ap-jurisdiction-panel hidden><h5>Declaraciones de esta revisión completa</h5>
 <label>Buscar contrato por nombre o legajo<input type="search" maxlength="100" autocomplete="off" data-ap-jurisdiction-search></label>
 <p>La búsqueda y las páginas no cambian la propuesta. Cada excepción se conserva hasta que cambie la revisión o se retiren los datos.</p>
 <div class="ar-pages" role="navigation" aria-label="Páginas de jurisdicciones"><button type="button" class="button" data-ap-jurisdiction-prev>Anterior</button><span data-ap-jurisdiction-page></span><button type="button" class="button" data-ap-jurisdiction-next>Siguiente</button></div>
 <div class="ar-table-wrap"><table><caption>Jurisdicción declarada por contrato</caption><thead><tr><th>Fila</th><th>Legajo / agente</th><th>Jurisdicción</th></tr></thead><tbody data-ap-jurisdiction-rows></tbody></table></div></section>
 <label>Resolución o documento de respaldo<input data-ap-reference required minlength="3" maxlength="180" autocomplete="off"></label>
 <label>Motivo de la propuesta<textarea data-ap-reason required minlength="10" maxlength="1000" rows="3"></textarea></label>
 <label class="ap-confirm"><input type="checkbox" data-ap-confirm required>Revisé el padrón completo, las declaraciones y su respaldo municipal</label>
 <button type="submit" class="button primary" data-ap-send>Guardar propuesta completa</button></form>
 <section data-ap-history hidden><h4>Mis propuestas preparadas</h4><p>Este registro conserva la preparación original y no muestra las decisiones posteriores. Consultá la bandeja de revisión para conocer su resultado.</p><ol data-ap-attempts></ol></section></section>`;
 const $=key=>host.querySelector('[data-ap-'+key+']'),panel=$('panel');
 let review=null,bootstrap=null,readAllowed=false,prepareAllowed=false,busy=false,epoch=0,controller=null,pending=null,retryReady=false;
 let jurisdictionPage=1;const jurisdictions=new Map(),facts=new Map();let prepared=null,previewInput=null,registryMode=false;
 const registryEligible=()=>Boolean(review?.source.finalRevision&&review?.source.operationalCohort&&!review.source.municipalDeclarations&&review.rows.every(originalRegistryFactsAllowed));
 const gapFields=r=>[["startDate","Fecha de ingreso","START_DATE_MISSING"],["agreementCode","Convenio","CLASSIFICATION_MISSING"],["categoryCode","Categoría","CLASSIFICATION_MISSING"],["jurisdictionCode","Jurisdicción","JURISDICTION_MISSING_ACTIVE"]].filter(([k,,issue])=>r[k]===null&&r.sourceIssues?.includes(issue));
 const gapRows=()=>review?.source.operationalCohort?review.rows.filter(r=>gapFields(r).length):[];
 const clearFacts=()=>{facts.clear();prepared=null;previewInput=null;$("facts-rows").replaceChildren();$("facts").hidden=true;$("facts-status").textContent="";};
 const supportsPending=()=>[ADOPTION_PENDING_PREPARATION_VERSION,ADOPTION_FINAL_PREPARATION_VERSION].includes(bootstrap?.version);
 const code=row=>registryMode?row.jurisdictionCode:row.jurisdictionCode??prepared?.review.rows[row.rowNumber-1]?.jurisdictionCode??jurisdictions.get(row.contractId)??(supportsPending()&&adoptionInactiveJurisdictionPending(row,review?.today)?null:$('jurisdiction').value);
 const jurisdictionRows=()=>review?review.rows.filter(r=>[r.name,r.legajo].some(v=>(v??'').toLocaleLowerCase('es').includes($('jurisdiction-search').value.toLocaleLowerCase('es')))):[];
 function jurisdictionCounts(){const counts={'42':0,'55':0,pending:0,inactivePending:0};for(const r of review?.rows??[]){const value=code(r);counts[['42','55'].includes(value)?value:supportsPending()&&value===null&&adoptionInactiveJurisdictionPending(r,review.today)?'inactivePending':'pending']++;}return counts;}
 function clearJurisdictions(){jurisdictions.clear();jurisdictionPage=1;$('jurisdiction-search').value='';$('jurisdiction-rows').replaceChildren();$('jurisdiction-panel').hidden=true;$('jurisdiction-open').setAttribute('aria-expanded','false');$('jurisdiction-counts').textContent='';$('jurisdiction-page').textContent='';}
 function paintJurisdictions(){
  if(!review)return;
  const counts=jurisdictionCounts(),rows=jurisdictionRows();
  $('jurisdiction-counts').textContent=`Propuesta completa: ${counts['42']} contratos en jurisdicción 42 · ${counts['55']} en jurisdicción 55 · ${counts.pending} sin declarar${supportsPending()?` · ${counts.inactivePending} inactivos conservados con jurisdicción pendiente, sin habilitación salarial`:''}. Se conservan los ${review.total} contratos.`;
  $('jurisdiction-page').textContent=`Página ${jurisdictionPage} de ${Math.max(1,Math.ceil(rows.length/25))} · ${rows.length} coincidencias`;
  $('jurisdiction-rows').replaceChildren();
  for(const r of rows.slice((jurisdictionPage-1)*25,jurisdictionPage*25)){
   const tr=document.createElement('tr');
   for(const [label,text]of [['Fila',String(r.sourceRowNumber??r.rowNumber)],['Legajo / agente',(r.legajo??'Sin número informado')+' · '+(r.name??'Nombre pendiente')]]){const td=document.createElement('td');td.dataset.label=label;td.textContent=text;tr.append(td);}
   const td=document.createElement('td');td.dataset.label='Jurisdicción';
   if(r.jurisdictionCode!==null)td.textContent=`${r.jurisdictionCode} · ya declarada`;
   else{
    const select=document.createElement('select');select.dataset.apJurisdictionRow=String(r.rowNumber);select.setAttribute('aria-label',`Jurisdicción de la fila ${r.rowNumber} · ${r.name??'nombre pendiente'}`);
    for(const [value,label]of [['',supportsPending()&&adoptionInactiveJurisdictionPending(r,review.today)?'Conservar pendiente · inactivo':`Usar declaración general (${$('jurisdiction').value||'pendiente'})`],['42','Jurisdicción 42'],['55','Jurisdicción 55']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
    select.value=jurisdictions.get(r.contractId)??'';
    select.addEventListener('change',()=>{if(!live()||busy||pending||!prepareAllowed||!bootstrap?.canPrepare)return;if(select.value)jurisdictions.set(r.contractId,select.value);else jurisdictions.delete(r.contractId);$('confirm').checked=false;paintJurisdictions();controls();host.querySelector(`[data-ap-jurisdiction-row="${r.rowNumber}"]`)?.focus();});td.append(select);
   }
   tr.append(td);$('jurisdiction-rows').append(tr);
  }
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.textContent='Sin coincidencias. La propuesta conserva el padrón completo.';tr.append(td);$('jurisdiction-rows').append(tr);}
 }
 const live=()=>readAllowed&&!document.hidden&&!panel.hidden&&host.isConnected&&isLive?.();
 const say=text=>{$('status').textContent=text;};
 function controls(){
  const enabled=live()&&!busy;
  $('open').disabled=busy||!readAllowed||document.hidden||!review||!isLive?.();
  $('load').disabled=!enabled||!review;
  for(const n of $('form').querySelectorAll('input,textarea,select,button'))n.disabled=!enabled||!prepareAllowed||!bootstrap?.canPrepare||!!pending;
  const counts=jurisdictionCounts();$('jurisdiction').required=!registryMode&&counts.pending>0;
  $('original-ack').required=registryMode;
  $('send').disabled||=!$('confirm').checked||registryMode&&!$('original-ack').checked||!registryMode&&(counts.pending>0||gapRows().length>0&&!prepared);
  $('policy').value=registryMode?'original':'complete';$('policy-label').hidden=!registryEligible();
  for(const k of ['jurisdiction','jurisdiction-help','jurisdiction-counts','jurisdiction-open']){const n=$(k);(k==='jurisdiction'?n.closest('label'):n).hidden=registryMode;}
  if(registryMode){
   $('jurisdiction-panel').hidden=true;$('jurisdiction').disabled=true;$('facts').hidden=true;
   for(const n of host.querySelectorAll('[data-ap-facts] input,[data-ap-facts] textarea,[data-ap-facts] select,[data-ap-facts] button,[data-ap-jurisdiction-panel] select'))n.disabled=true;
  }
  $('original-status').hidden=!registryMode;$('original-ack-label').hidden=!registryMode;
  $('jurisdiction-prev').disabled||=jurisdictionPage<=1;
  $('jurisdiction-next').disabled||=jurisdictionPage*25>=jurisdictionRows().length;
  $('pending').hidden=!pending||!live();$('recover').disabled=!enabled||!pending;
  $('retry').disabled=!enabled||!pending||!retryReady||!prepareAllowed||!bootstrap?.canPrepare;
  host.setAttribute('aria-busy',String(busy));
 }
 function withdraw(text='Consultá nuevamente las condiciones del padrón.'){
  epoch++;controller?.abort();bootstrap=null;busy=false;retryReady=false;registryMode=false;$('original-ack').checked=false;
  $('form').hidden=true;$('history').hidden=true;$('attempts').replaceChildren();$('counts').textContent='';
  for(const key of ['reference','reason','jurisdiction'])$(key).value='';clearJurisdictions();clearFacts();$('confirm').checked=false;say(text);controls();
 }
 function start(text){controller?.abort();controller=new AbortController();const token=++epoch;busy=true;controls();say(text);return{token,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])};}
 const current=token=>token===epoch&&live();
 async function request(url,signal,init={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...init,headers:{Accept:'application/json',...init.headers},signal});
  const bytes=await response.text();if(new TextEncoder().encode(bytes).length>7000000)throw issue('La respuesta supera la capacidad completa. Consultá el mismo intento.');
  let value;try{value=JSON.parse(bytes);}catch{throw issue('No se pudo verificar la respuesta. Consultá el mismo intento.');}
  if(!response.ok||value.ok!==true)throw issue(typeof value.error==='string'?value.error:'No se confirmó la operación. Consultá el mismo intento.',response.status,value.code);return value.data;
 }
 async function authority(signal){
  const response=await fetch('/api/internal-auth',{credentials:'same-origin',cache:'no-store',signal}),value=await response.json(),caps=value.access?.tenantCapabilities;
  if(!response.ok||value.ok!==true||!value.authenticated||!Array.isArray(caps)||!caps.includes('workforce.employee.read')||typeof value.user?.email!=='string')throw issue('Tu sesión o permiso cambió. Volvé a consultar con acceso autorizado.',response.status===401?401:403);
  return{actor:value.user.email.toLowerCase(),canPrepare:caps.includes('employee.record.propose')};
 }
 async function fresh(signal,historyOnly=false){
  const selected=!historyOnly&&review?.source.finalRevision;
  const query=selected?'?'+new URLSearchParams({resource:registryMode?'registry-bootstrap':review.source.operationalCohort?'final-active-bootstrap':'final-bootstrap',revisionId:selected.revisionId,packageSha256:selected.packageSha256}):'?resource=bootstrap';
  const access=await authority(signal),value=await adoptionPreparationBootstrap(await request(prepared&&!historyOnly?API:API+query,signal,prepared&&!historyOnly?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'preview-declarations',payload:previewInput})}:{}));
  return{...access,value,scope:adoptionReviewScope(value.review.scope)};
 }
 function sameScope(freshValue,attempt){
  if(!review||freshValue.scope!==adoptionReviewScope(review.scope)||attempt&&(freshValue.scope!==attempt.scope||freshValue.actor!==attempt.actor))throw issue('Cambió la cuenta o el municipio. Recuperá el intento con su acceso original.',403);
 }
 function paintFacts(){
  const opened=new Set([...$('facts-rows').querySelectorAll('details[open]')].map(n=>n.dataset.apFact));
  const rows=gapRows();$('facts').hidden=!rows.length;$('facts-rows').replaceChildren();
  for(const r of rows){
   const draft=facts.get(r.contractId)??{values:{},reference:'',reason:''};facts.set(r.contractId,draft);
   const details=document.createElement('details'),summary=document.createElement('summary');details.dataset.apFact=String(r.rowNumber);details.open=opened.has(String(r.rowNumber));summary.textContent=`Fila ${r.sourceRowNumber} · ${r.legajo??'Sin número'} · ${r.name??'Nombre pendiente'}`;details.append(summary);
   const change=()=>{if(!live()||busy||pending||!prepareAllowed)return;prepared=null;previewInput=null;$('confirm').checked=false;$('facts-status').textContent='Cambió una declaración. Revisá nuevamente antes de guardar.';paintJurisdictions();controls();};
   for(const [field,label]of gapFields(r)){
    const wrapper=document.createElement('label'),input=document.createElement(field==='jurisdictionCode'?'select':'input');wrapper.append(document.createTextNode(label));input.dataset.apFactField=field;input.setAttribute('aria-label',`${label} de la fila ${r.sourceRowNumber}`);input.required=true;
    if(field==='jurisdictionCode'){for(const [value,text]of [['','Elegí según el respaldo municipal'],['42','Jurisdicción 42'],['55','Jurisdicción 55']]){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}}
    else if(field==='startDate'){input.type='date';input.max=review.today;}
    else{input.type='text';input.inputMode='numeric';input.pattern='[0-9]{1,9}';input.maxLength=9;input.autocomplete='off';}
    input.value=draft.values[field]??'';input.addEventListener('input',()=>{if(!live()||busy||pending||!prepareAllowed)return;draft.values[field]=input.value;change();});wrapper.append(input);details.append(wrapper);
   }
   const note=document.createElement('p');note.textContent='Convenio y categoría se verifican juntos contra el catálogo vigente. Ningún código ni fecha se completa por defecto.';details.append(note);
   for(const [field,label,min,max]of [['reference','Documento que respalda estos datos',3,180],['reason','Fundamento de la declaración',10,1000]]){
    const wrapper=document.createElement('label'),input=document.createElement(field==='reason'?'textarea':'input');wrapper.append(document.createTextNode(label));input.dataset.apFactField=field;input.setAttribute('aria-label',`${label} de la fila ${r.sourceRowNumber}`);input.required=true;input.minLength=min;input.maxLength=max;input.value=draft[field];input.addEventListener('input',()=>{if(!live()||busy||pending||!prepareAllowed)return;draft[field]=input.value;change();});wrapper.append(input);details.append(wrapper);
   }
   $('facts-rows').append(details);
  }
  $('facts-status').textContent=prepared?`${rows.length} declaraciones verificadas para los ${review.total} activos. Revisar no guardó una propuesta; el respaldo original se conserva.`:`${rows.length} contratos requieren datos explícitos. Completá su respaldo y revisá el conjunto antes de guardar.`;
 }
 async function previewFacts(){
  if(busy||!live()||pending||!bootstrap?.canPrepare||!prepareAllowed)return;
  for(const input of $('facts').querySelectorAll('input,textarea,select'))if(!input.checkValidity()){input.closest('details').open=true;input.reportValidity();return;}
  const {token,signal}=start('Verificando declaraciones y el padrón activo completo, sin guardar…');
  try{
   const access=await authority(signal);if(!current(token))return;if(!access.canPrepare)throw issue('Tu permiso para preparar cambió.',403);
   const declarations=verifySourceDeclarations(review.rows,gapRows().map(r=>{const d=facts.get(r.contractId);return{contractId:r.contractId,values:{...d.values},reference:d.reference.normalize('NFC').trim(),reason:d.reason.normalize('NFC').trim()};}),review.today);
   const input={revisionId:review.source.finalRevision.revisionId,packageSha256:review.source.finalRevision.packageSha256,sourceContextVersion:review.sourceContextVersion,catalogVersion:bootstrap.catalogVersion,declarations};
   const value=await adoptionPreparationBootstrap(await request(API,signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'preview-declarations',payload:input})}));if(!current(token))return;
   sameScope({scope:adoptionReviewScope(value.review.scope),actor:access.actor});prepared=value;previewInput=Object.freeze(input);$('confirm').checked=false;paint({...access,value});
   say(value.review.rows.some(r=>r.sourceIssues.length)?'La revisión conserva otras incidencias. La propuesta completa sigue pendiente; no se omitió ningún activo.':'Declaraciones verificadas. Revisá el padrón completo y su respaldo antes de guardar la propuesta para otra persona.');
  }catch(e){failure(e,token);}finally{if(token===epoch){busy=false;controls();}}
 }
 function paint(value){
  bootstrap=value.value;prepareAllowed=value.canPrepare;
  $('form').hidden=!bootstrap.canPrepare||!prepareAllowed||!bootstrap.review.total||!!pending;
  const cohort=bootstrap.review.source.operationalCohort;
  $('counts').textContent=cohort?`Se prepararán los ${bootstrap.review.total} contratos activos del corte completo. ${cohort.archivedTotal} inactivos quedan como antecedentes y no se incorporan al circuito diario. La búsqueda no reduce la propuesta.`:`Se guardarán ${bootstrap.review.total} contratos de todas las páginas. ${bootstrap.review.counts.jurisdictionPending} tienen jurisdicción pendiente. La búsqueda no reduce la propuesta.`;
  if(registryMode){const c=originalRegistryFactsCounts(bootstrap.review.rows);$('original-status').textContent=`Se conservan los datos originales de los ${c.total} activos. ${c.pending} contratos tienen antecedentes pendientes: ${c.startDate} fechas de ingreso, ${c.classification} encuadres y ${c.jurisdiction} jurisdicciones. Las cantidades se superponen. Esta incorporación requiere revisión independiente y no autoriza calcular haberes con datos faltantes.`;}
  $('jurisdiction-help').textContent=supportsPending()?'La elección general se aplica a los contratos pendientes que requieren declaración. Los inactivos con fecha de finalización anterior a hoy pueden conservar su jurisdicción pendiente; esto no habilita su liquidación. Podés declarar excepciones por contrato. Las jurisdicciones ya declaradas se conservan; ninguna se deduce del legajo, sector o archivo.':'La elección general se aplica a los contratos pendientes. Podés declarar excepciones por contrato en la misma propuesta. Las jurisdicciones ya declaradas se conservan; ninguna se deduce del legajo, sector o archivo.';
  $('attempts').replaceChildren();for(const [index,a]of bootstrap.attempts.entries()){
   const li=document.createElement('li');li.textContent=`Propuesta ${index+1}: ${a.receipt.total} contratos · registrada para revisión · 0 contratos adoptados al prepararla.`;$('attempts').append(li);
  }
  $('history').hidden=false;if(!bootstrap.attempts.length){const li=document.createElement('li');li.textContent='No hay propuestas preparadas por tu cuenta en este municipio.';$('attempts').append(li);}paintFacts();paintJurisdictions();controls();
 }
 function failure(e,token){
  if(!current(token))return;
  if([401,403].includes(e.status)){readAllowed=false;withdraw('Tu sesión o permiso cambió. Los datos fueron retirados; el intento original se conserva.');onAuthorityLost?.();return;}
  say(e instanceof TypeError||['AbortError','TimeoutError'].includes(e.name)?'La consulta se interrumpió. Consultá el mismo intento antes de preparar otra propuesta.':e.message||'No se confirmó la operación. Consultá el mismo intento.');
 }
 async function load(){
  if(busy||!live()||!review)return;const {token,signal}=start('Consultando condiciones y propuestas del padrón completo…');
  try{const f=await fresh(signal);if(!current(token))return;sameScope(f,pending?.attempt);
   if(f.value.review.snapshot!==(prepared?.review??review).snapshot){bootstrap=null;$('form').hidden=true;say('El padrón cambió. Volvé a Revisar padrón completo antes de preparar una propuesta.');return;}
   paint(f);say(pending?'Hay un envío sin confirmar. Consultá el mismo intento.':!bootstrap.review.total?'No hay contratos históricos pendientes. No se generará una propuesta vacía.':bootstrap.canPrepare&&prepareAllowed?'Completá el documento, el motivo y la jurisdicción para guardar una propuesta completa.':'Tu cuenta puede consultar, pero no preparar esta propuesta.');
  }catch(e){failure(e,token);}finally{if(token===epoch){busy=false;controls();}}
 }
 async function send(recover=false,retry=false){
  if(busy||!live()||!review)return;const {token,signal}=start(recover?'Consultando el resultado del mismo intento…':'Verificando el padrón y el acceso antes del envío…');let started=false;
  try{
   const f=await fresh(signal,recover);if(!current(token))return;sameScope(f,pending?.attempt);
   if(recover||retry)paint(f);
   if(!recover&&(!f.value.canPrepare||!f.canPrepare)){prepareAllowed=false;bootstrap=null;$('form').hidden=true;throw issue('Tu cuenta ya no permite preparar propuestas. Podés consultar el resultado de un intento pendiente.');}
   if(!recover&&!retry){
    if(pending)return;
    if(f.value.review.snapshot!==(prepared?.review??review).snapshot||f.value.catalogVersion!==bootstrap?.catalogVersion||f.value.version!==bootstrap?.version){bootstrap=null;$('form').hidden=true;throw issue('Cambió el padrón, el catálogo o las condiciones de preparación. Volvé a revisar antes de guardar.');}
    const working=prepared?.review??review,declaration={snapshot:working.snapshot,rows:review.rows.map(r=>({contractId:r.contractId,jurisdictionCode:code(r)}))};
    if(registryMode&&!$('original-ack').checked)throw issue('Confirmá la conservación de los antecedentes pendientes antes de guardar.');
    const body=await adoptionPreparationPayload(working,bootstrap.catalogVersion,registryMode?null:declaration,$('reference').value,$('reason').value,{allowInactivePending:supportsPending(),preserveOriginalFacts:registryMode});
    if(!current(token))return;
    pending={attempt:Object.freeze({key:crypto.randomUUID(),body,bytes:JSON.stringify({operation:'propose',payload:body}),scope:f.scope,actor:f.actor})};retryReady=false;
   }
   if(!pending)return;const attempt=pending.attempt;started=!recover;
   const raw=await request(recover?API+'?'+new URLSearchParams({resource:'attempt',key:attempt.key}):API,signal,recover?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.bytes});
   const receipt=await adoptionPreparationReceipt(raw,{key:attempt.key,body:attempt.body});
   if(!current(token))return;
   // An acknowledgement alone is insufficient after a scope/authority change.
   // A completed adoption no longer has an imported cohort. Confirm the saved
   // attempt through the ordinary scoped history, without rebuilding that cut.
   const confirmed=await fresh(signal,true);if(!current(token))return;sameScope(confirmed,attempt);
   if(!confirmed.value.attempts.some(a=>a.requestKey===receipt.requestKey&&a.bodySha256===receipt.bodySha256&&a.receipt.proposalId===receipt.receipt.proposalId&&a.receipt.proposalVersion===receipt.receipt.proposalVersion))throw issue('El registro consultado no confirma el mismo intento. Consultá otra vez.');
   pending=null;retryReady=false;registryMode=false;$('original-ack').checked=false;clearFacts();clearJurisdictions();for(const key of ['reference','reason','jurisdiction'])$(key).value='';$('confirm').checked=false;paint(confirmed);
   if(confirmed.value.review.snapshot!==review.snapshot){bootstrap=null;$('form').hidden=true;}
   say(`Propuesta completa guardada: ${receipt.receipt.total} contratos, 0 adoptados al prepararla. Requiere una decisión independiente en la bandeja de revisión.`);
  }catch(e){
   if(!current(token))return;
   if(pending){retryReady=recover&&e.status===404;if(started&&['SOURCE_CHANGED','CATALOG_CHANGED','SELECTION_CHANGED','LIMIT','INPUT_INVALID'].some(code=>e.code==='EMPLOYMENT_ADOPTION_'+code))pending=null;}
   failure(e,token);
  }finally{if(token===epoch){busy=false;controls();}}
 }
 $('preview').addEventListener('click',previewFacts);
 $('policy').addEventListener('change',async()=>{
  if(busy||pending||!live()||!prepareAllowed||!registryEligible()){$('policy').value=registryMode?'original':'complete';return;}
  if(jurisdictions.size||$('jurisdiction').value||prepared||[...facts.values()].some(d=>d.reference||d.reason||Object.values(d.values).some(Boolean))){$('policy').value=registryMode?'original':'complete';say('Se conservan las declaraciones que ingresaste. Para cambiar el tratamiento, retiralas expresamente o iniciá otra revisión.');return;}
  registryMode=$('policy').value==='original';bootstrap=null;$('confirm').checked=false;$('original-ack').checked=false;await load();
 });
 $('original-ack').addEventListener('change',controls);
 $('load').addEventListener('click',load);$('form').addEventListener('submit',event=>{event.preventDefault();if($('confirm').checked&&!pending&&bootstrap?.canPrepare)send();});
 $('recover').addEventListener('click',()=>send(true));$('retry').addEventListener('click',()=>{if(retryReady&&pending)send(false,true);});
 $('confirm').addEventListener('change',controls);for(const key of ['jurisdiction','reference','reason'])$(key).addEventListener('input',()=>{$('confirm').checked=false;if(key==='jurisdiction')paintJurisdictions();controls();});
 $('jurisdiction-open').addEventListener('click',()=>{$('jurisdiction-panel').hidden=!$('jurisdiction-panel').hidden;$('jurisdiction-open').setAttribute('aria-expanded',String(!$('jurisdiction-panel').hidden));paintJurisdictions();controls();});
 $('jurisdiction-search').addEventListener('input',()=>{jurisdictionPage=1;paintJurisdictions();controls();});
 $('jurisdiction-prev').addEventListener('click',()=>{if(jurisdictionPage>1){jurisdictionPage--;paintJurisdictions();controls();}});
 $('jurisdiction-next').addEventListener('click',()=>{if(jurisdictionPage*25<jurisdictionRows().length){jurisdictionPage++;paintJurisdictions();controls();}});
 $('open').addEventListener('click',()=>{panel.hidden=!panel.hidden;$('open').setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden)withdraw();else controls();});
 const permissions=event=>{const caps=event?.detail?.tenantCapabilities;readAllowed=caps instanceof Set?caps.has('workforce.employee.read'):Array.isArray(caps)&&caps.includes('workforce.employee.read');prepareAllowed=caps instanceof Set?caps.has('employee.record.propose'):Array.isArray(caps)&&caps.includes('employee.record.propose');if(!readAllowed)withdraw('Tu permiso de consulta cambió. Los datos fueron retirados.');else if(!prepareAllowed)withdraw('Tu permiso para preparar cambió. Se retiraron las declaraciones; consultá el mismo intento si quedó pendiente.');else controls();};
 document.addEventListener('municontrol:capabilities-ready',permissions);window.MuniControlCapabilityGate?.ready?.then(result=>permissions({detail:result}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)withdraw('Datos retirados al ocultar la pantalla. Consultá el mismo intento si quedó pendiente.');});
 window.addEventListener('pagehide',()=>withdraw());document.getElementById('logoutButton')?.addEventListener('click',()=>{readAllowed=false;withdraw('Sesión cerrada. Recuperá cualquier intento con su acceso original.');});
 window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
 controls();return{setReview(value){const same=review&&value&&review.snapshot===value.snapshot&&adoptionReviewScope(review.scope)===adoptionReviewScope(value.scope);review=value;if(!same){bootstrap=null;registryMode=false;$('original-ack').checked=false;$('form').hidden=true;$('history').hidden=true;clearJurisdictions();$('jurisdiction').value='';clearFacts();$('confirm').checked=false;}controls();},invalidate(){review=null;withdraw();}};
}
