import {municipalAdoptionQueue,municipalAdoptionDetail,municipalAdoptionCommand,municipalAdoptionAttempt} from './municipal-adoption-operator-model.js';
import {REGISTRY_ADOPTION_INPUT_VERSION,originalRegistryFactsCounts} from './employment-adoption-original-facts.js';
import {adoptionReviewScope} from './employment-adoption-review-model.js';
import {appendAdoptionChanges} from './employment-adoption-changes-ui.js';
const API='/api/internal-municipal-adoption',issue=(message,status,code)=>Object.assign(Error(message),{status,code});
export function mountMunicipalAdoptionOperator(host,{isLive}={}){
 if(!host)return;
 host.innerHTML=`<button type="button" class="button" data-ao-open aria-expanded="false" aria-controls="municipal-adoption-review-body">Revisar propuestas de adopción</button><section id="municipal-adoption-review-body" data-ao-panel hidden>
 <h4>Decisión independiente sobre el padrón completo</h4><p>Otra persona revisa todos los contratos y su respaldo. Aprobar conserva identidades, números e historial y adopta el conjunto en MuniControl. Cuando se revisó un corte final, aplica también sus fechas y encuadre propuestos. No calcula sueldos, confirma liquidaciones ni ejecuta pagos.</p>
 <button type="button" class="button" data-ao-load>Consultar propuestas</button><p role="status" aria-live="polite" data-ao-status>Consulta voluntaria. Abrir este apartado no guarda decisiones.</p>
 <section data-ao-pending hidden><h4>Decisión sin confirmar</h4><p>Se conserva el mismo contenido y clave de intento en esta página. Consultá su resultado antes de decidir nuevamente.</p><button type="button" class="button" data-ao-recover>Consultar resultado del mismo intento</button><button type="button" class="button" data-ao-retry disabled>Reenviar la misma decisión</button></section>
 <ol data-ao-queue></ol><section data-ao-detail hidden><p data-ao-summary></p><p data-ao-original-status role="status" hidden></p><p data-ao-reference></p><p data-ao-reason></p>
 <label>Buscar en los contratos revisados<input type="search" autocomplete="off" maxlength="100" data-ao-search></label><p data-ao-counts></p>
 <div class="ar-pages" role="navigation" aria-label="Contratos de la propuesta"><button type="button" class="button" data-ao-prev>Anterior</button><span data-ao-page></span><button type="button" class="button" data-ao-next>Siguiente</button></div>
 <div class="ar-table-wrap"><table><caption>Antecedentes completos de la propuesta</caption><thead><tr><th>Fila</th><th>Legajo / agente</th><th>Situación y observaciones</th><th>Fechas y encuadre</th><th>Jurisdicción declarada</th></tr></thead><tbody data-ao-rows></tbody></table></div>
 <form data-ao-form><label>Decisión<select data-ao-decision required><option value="">Elegí luego de revisar</option><option value="approve">Aprobar y adoptar todos los contratos</option><option value="reject">Rechazar la propuesta completa</option></select></label>
 <label>Fundamento de la decisión<textarea data-ao-decision-reason required minlength="10" maxlength="1000" rows="3"></textarea></label>
 <label class="ap-confirm"><input type="checkbox" data-ao-confirm required>Revisé todos los contratos y el documento de respaldo; confirmo esta decisión completa</label><button type="submit" class="button primary" data-ao-send disabled>Guardar decisión completa</button></form></section></section>`;
 const $=key=>host.querySelector('[data-ao-'+key+']');let allowed=false,busy=false,epoch=0,controller=null,queue=null,detail=null,page=1,pending=null,retryReady=false,actor=null;
 const live=()=>allowed&&!document.hidden&&!$('panel').hidden&&host.isConnected&&isLive?.(),say=t=>{$('status').textContent=t;};
 const filtered=()=>detail?detail.review.rows.filter(r=>[r.name,r.legajo].some(v=>(v??'').toLocaleLowerCase('es').includes($('search').value.toLocaleLowerCase('es')))):[];
 function controls(){
  const enabled=live()&&!busy;$('open').disabled=!allowed||busy||document.hidden||!isLive?.();$('load').disabled=!enabled||!!pending;
  host.querySelectorAll('[data-ao-proposal]').forEach(b=>b.disabled=!enabled||!!pending||b.dataset.eligible!=='true');
  for(const e of $('form').querySelectorAll('select,textarea,input,button'))e.disabled=!enabled||!!pending||!detail||detail.proposal.status!=='pending';
  $('decision').querySelector('[value="approve"]').disabled=!detail?.current;
  $('send').disabled||=!$('confirm').checked||!detail?.current&&$('decision').value!=='reject';$('search').disabled=!enabled||!detail;$('prev').disabled=!enabled||!detail||page<=1;$('next').disabled=!enabled||!detail||page*25>=filtered().length;
  $('recover').disabled=!enabled||!pending;$('retry').disabled=!enabled||!pending||!retryReady;$('pending').hidden=!pending||!live();host.setAttribute('aria-busy',String(busy));
 }
 function withdraw(text='Consultá nuevamente las propuestas.'){
  ++epoch;controller?.abort();busy=false;queue=null;detail=null;actor=null;retryReady=false;page=1;$('queue').replaceChildren();$('rows').replaceChildren();$('detail').hidden=true;
  for(const k of ['search','decision','decision-reason'])$(k).value='';$('confirm').checked=false;for(const k of ['summary','reference','reason','counts','page'])$(k).textContent='';say(text);controls();
 }
 const start=t=>{controller?.abort();controller=new AbortController();const token=++epoch;busy=true;controls();say(t);return{token,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])};},current=t=>t===epoch&&live();
 async function authority(signal,expectedActor=null){
  const r=await fetch('/api/internal-auth',{credentials:'same-origin',cache:'no-store',signal}),v=await r.json(),caps=v.access?.tenantCapabilities;
  if(!r.ok||v.ok!==true||!v.authenticated||!['workforce.employee.read','employee.record.approve'].every(c=>Array.isArray(caps)&&caps.includes(c))||typeof v.user?.email!=='string')throw issue('Tu sesión o permiso cambió. Se retiraron los antecedentes.',r.status===401?401:403);
  const email=v.user.email.toLowerCase();if(expectedActor&&email!==expectedActor)throw issue('Cambió la cuenta. Recuperá el intento con su acceso original.',403);return email;
 }
 async function request(query,signal,init={}){
  const r=await fetch(API+query,{credentials:'same-origin',cache:'no-store',...init,headers:{Accept:'application/json',...init.headers},signal}),bytes=await r.text();if(new TextEncoder().encode(bytes).length>8500000)throw issue('La respuesta supera la capacidad completa. No se mostraron contratos parciales.');
  let v;try{v=JSON.parse(bytes);}catch{throw issue('No se pudo verificar la respuesta. Consultá el mismo intento.');}if(!r.ok||v.ok!==true)throw issue(typeof v.error==='string'?v.error:'No se confirmó la operación.',r.status,v.code);return v.data;
 }
 function paintRows(){
  const rows=filtered();$('rows').replaceChildren();for(const r of rows.slice((page-1)*25,page*25)){
   const tr=document.createElement('tr');for(const[label,text]of [['Fila',r.rowNumber],['Legajo / agente',(r.legajo??'Sin número')+' · '+(r.name??'Nombre pendiente')],['Situación y observaciones',({active:'Activo',inactive:'Inactivo',state_error:'Estado a revisar'})[r.status]+'. '+(r.observations.map(o=>o.status+': '+o.action).join(' ')||'Sin observaciones de datos.')],['Fechas y encuadre',`Ingreso: ${r.startDate??'pendiente'}; egreso: ${r.endDate??'sin fecha'}. Convenio ${r.agreementCode??'pendiente'}, categoría ${r.categoryCode??'pendiente'}, organización ${r.organizationId??'pendiente'}, repartición ${r.sectorCode??'pendiente'}.`],['Jurisdicción declarada',detail.body.rows[r.rowNumber-1].jurisdictionCode]]){const td=document.createElement('td');td.dataset.label=label;td.textContent=text===null?(r.status==='active'?'Pendiente · dato original':'Pendiente · antecedente inactivo'):String(text);if(label==='Fechas y encuadre')appendAdoptionChanges(td,r,detail.body.declarations?.find(d=>d.contractId===r.contractId));tr.append(td);}$('rows').append(tr);
  }
  $('counts').textContent=`${rows.length} coincidencias en pantalla. La decisión abarca los ${detail.proposal.total} contratos completos, incluidos los inactivos.`;$('page').textContent=`Página ${page} de ${Math.max(1,Math.ceil(rows.length/25))}`;controls();
 }
 function paintQueue(){
  $('queue').replaceChildren();for(const[r,index]of queue.rows.map((r,i)=>[r,i])){
   const li=document.createElement('li'),p=r.proposal;li.textContent=`Propuesta ${index+1}: ${p.total} contratos · ${({pending:'pendiente',approved:'aprobada',rejected:'rechazada'})[p.status]} · ${p.effects.contractsAdopted} adoptados. `;
   const b=document.createElement('button');b.type='button';b.className='button';b.dataset.aoProposal=p.proposalId;b.dataset.eligible=String(r.independent);b.textContent=r.independent?'Revisar antecedentes':'Requiere otro operador';b.addEventListener('click',()=>loadDetail(p.proposalId));li.append(b);$('queue').append(li);
  }
  if(!queue.total){const li=document.createElement('li');li.textContent='No hay propuestas registradas en este municipio.';$('queue').append(li);}controls();
 }
 function paintDetail(){
  $('detail').hidden=false;$('summary').textContent=`${detail.proposal.total} contratos · ${detail.review.counts.active} activos · ${detail.review.counts.inactive} inactivos · ${detail.review.counts.state_error} con estado a revisar. ${detail.proposal.status!=='pending'?'Decisión registrada; se conservan los antecedentes revisados.':detail.current?'Antecedentes vigentes.':'Los antecedentes cambiaron: sólo se puede rechazar esta versión.'}${detail.review.source.finalRevision?' Corte final: '+detail.review.source.finalRevision.cutoff.replace('T',' ')+'.':''}`;
  const original=detail.body.version===REGISTRY_ADOPTION_INPUT_VERSION;$('original-status').hidden=!original;
  if(original){const c=originalRegistryFactsCounts(detail.review.rows);$('original-status').textContent=`Incorporación con datos originales: ${c.total} activos, ${c.pending} con antecedentes pendientes (${c.startDate} fechas de ingreso, ${c.classification} encuadres y ${c.jurisdiction} jurisdicciones; las cantidades se superponen). Aprobar conserva esos faltantes. Los cálculos que los requieran seguirán bloqueados hasta su rectificación.`;}
  $('reference').textContent='Documento declarado: '+detail.body.legalReference;$('reason').textContent='Motivo de la propuesta: '+detail.body.reason;for(const k of ['decision','decision-reason'])$(k).value='';$('confirm').checked=false;$('form').hidden=detail.proposal.status!=='pending';paintRows();
 }
 function failure(e,token){if(!current(token))return;if([401,403].includes(e.status)){allowed=false;withdraw('Tu sesión, cuenta o permiso cambió. Recuperá cualquier intento con su acceso original.');return;}say(e instanceof TypeError||['AbortError','TimeoutError'].includes(e.name)?'La conexión se interrumpió. Consultá el mismo intento si quedó pendiente.':e.message||'No se confirmó la operación.');}
 async function load(){
  if(busy||!live()||pending)return;const{token,signal}=start('Consultando todas las propuestas…');
  try{const email=await authority(signal),value=municipalAdoptionQueue(await request('?resource=queue',signal));if(!current(token))return;actor=email;queue=value;detail=null;$('detail').hidden=true;paintQueue();say('Todas las propuestas consultadas. Tu propia propuesta requiere otro operador.');}catch(e){failure(e,token);}finally{if(token===epoch){busy=false;controls();}}
 }
 async function loadDetail(id){
  if(busy||!live()||pending||!queue)return;const{token,signal}=start('Verificando todos los antecedentes de la propuesta…');
  try{await authority(signal,actor);const value=await municipalAdoptionDetail(await request('?'+new URLSearchParams({resource:'review',id}),signal));if(!current(token))return;if(value.proposal.proposalId!==id||adoptionReviewScope(value.scope)!==adoptionReviewScope(queue.scope))throw issue('Cambió el ámbito de la consulta.',403);detail=value;page=1;$('search').value='';paintDetail();say(value.proposal.status!=='pending'?'Decisión registrada. Podés consultar los antecedentes y el resultado conservados.':value.current?'Revisá todos los contratos y su respaldo antes de elegir la decisión.':'La propuesta conserva sus antecedentes anteriores. Podés rechazarla; para aprobar necesitás otra propuesta vigente.');}catch(e){failure(e,token);}finally{if(token===epoch){busy=false;controls();}}
 }
 async function send(recover=false,retry=false){
  if(busy||!live()||!recover&&!retry&&(!detail||pending||!$('confirm').checked))return;const{token,signal}=start(recover?'Consultando la misma decisión…':'Verificando el acceso y la decisión completa…');
  try{
   const email=await authority(signal,pending?.actor??actor);if(!current(token))return;
   if(!recover&&!retry){const fresh=await municipalAdoptionDetail(await request('?'+new URLSearchParams({resource:'review',id:detail.proposal.proposalId}),signal));if(!current(token))return;
    if(!fresh.current&&$('decision').value!=='reject'||fresh.proposal.status!=='pending'||fresh.reviewVersion!==detail.reviewVersion||fresh.review.snapshot!==detail.review.snapshot||adoptionReviewScope(fresh.scope)!==adoptionReviewScope(detail.scope)){detail=fresh;$('confirm').checked=false;paintDetail();throw issue('Cambió la propuesta o sus antecedentes. Revisá nuevamente antes de decidir.');}
    const body=municipalAdoptionCommand({reviewVersion:detail.reviewVersion,review:{proposalId:detail.proposal.proposalId,proposalVersion:detail.proposal.proposalVersion,sourceContextVersion:detail.proposal.sourceContextVersion,catalogVersion:detail.proposal.catalogVersion,decision:$('decision').value,reason:$('decision-reason').value},reviewConfirmed:true});
    pending=Object.freeze({key:crypto.randomUUID(),body,bytes:JSON.stringify({operation:'command',payload:body}),scope:adoptionReviewScope(detail.scope),actor:email});retryReady=false;
   }
   if(!pending)return;const attempt=pending;
   const raw=await request(recover?'?'+new URLSearchParams({resource:'attempt',key:attempt.key}):'',signal,recover?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.bytes});
   const first=await municipalAdoptionAttempt(raw,{key:attempt.key,body:attempt.body});if(!current(token))return;
   await authority(signal,attempt.actor);const confirmed=await municipalAdoptionAttempt(await request('?'+new URLSearchParams({resource:'attempt',key:attempt.key}),signal),{key:attempt.key,body:attempt.body});if(!current(token))return;
   if(adoptionReviewScope(first.scope)!==attempt.scope||adoptionReviewScope(confirmed.scope)!==attempt.scope||first.receipt.proposalId!==confirmed.receipt.proposalId||first.bodySha256!==confirmed.bodySha256)throw issue('No se confirmó la decisión en el mismo ámbito.',403);
   pending=null;retryReady=false;detail=null;$('detail').hidden=true;$('rows').replaceChildren();$('queue').replaceChildren();queue=null;
   say(confirmed.receipt.status==='approved'?`Adopción confirmada: ${confirmed.receipt.total} contratos completos. Se conservaron identidades e historial; no se calcularon sueldos ni pagos.`:'Rechazo confirmado. No se adoptó ningún contrato.');document.dispatchEvent(new CustomEvent('mc:municipal-adoption-decided',{detail:{status:confirmed.receipt.status}}));
  }catch(e){if(current(token)){if(recover&&e.status===404)retryReady=true;if(!recover&&['SOURCE_CHANGED','CATALOG_CHANGED','SELECTION_CHANGED','INPUT_INVALID','ALREADY_DECIDED','UNSEALED'].some(c=>e.code==='EMPLOYMENT_ADOPTION_'+c))pending=null;failure(e,token);}}finally{if(token===epoch){busy=false;controls();}}
 }
 $('load').addEventListener('click',load);$('form').addEventListener('submit',e=>{e.preventDefault();send();});$('recover').addEventListener('click',()=>send(true));$('retry').addEventListener('click',()=>{if(pending&&retryReady)send(false,true);});
 $('confirm').addEventListener('change',controls);for(const k of ['decision','decision-reason'])$(k).addEventListener('input',()=>{$('confirm').checked=false;controls();});$('search').addEventListener('input',()=>{if(detail){page=1;paintRows();}});
 $('prev').addEventListener('click',()=>{if(detail&&page>1){--page;paintRows();}});$('next').addEventListener('click',()=>{if(detail&&page*25<filtered().length){++page;paintRows();}});
 $('open').addEventListener('click',()=>{$('panel').hidden=!$('panel').hidden;$('open').setAttribute('aria-expanded',String(!$('panel').hidden));if($('panel').hidden)withdraw();else controls();});
 const permissions=e=>{const c=e?.detail?.tenantCapabilities,has=k=>c instanceof Set?c.has(k):Array.isArray(c)&&c.includes(k);allowed=has('workforce.employee.read')&&has('employee.record.approve');if(!allowed)withdraw('Tu cuenta no tiene permiso para decidir adopciones.');else controls();};
 document.addEventListener('municontrol:capabilities-ready',permissions);window.MuniControlCapabilityGate?.ready?.then(v=>permissions({detail:v}));document.addEventListener('visibilitychange',()=>{if(document.hidden)withdraw('Datos retirados al ocultar la pantalla. Consultá el mismo intento si quedó pendiente.');else controls();});window.addEventListener('pagehide',()=>withdraw());
 document.getElementById('logoutButton')?.addEventListener('click',()=>{allowed=false;withdraw('Sesión cerrada.');});window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
 for(const event of ['mc:native-employee-created','mc:native-employment-changed','mc:native-employment-lifecycle-changed'])document.addEventListener(event,()=>withdraw('Cambió un contrato. Consultá sus antecedentes nuevamente.'));
 controls();return{invalidate:withdraw,refreshControls:controls};
}
