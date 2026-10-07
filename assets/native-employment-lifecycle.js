import {lifecycleUuid,lifecycleProposalInput,lifecycleReviewInput,lifecycleAfter,LIFECYCLE_MOVEMENTS,LIFECYCLE_STATUSES,validateLifecycleBootstrap,validateLifecycleProposal,validateLifecycleReceipt} from './native-employment-lifecycle-model.js';
import {reviewedLifecycleAttempt,assertLifecycleAttemptFresh,assertLifecycleAttemptReceipt} from './native-employment-lifecycle-review.js';

const API='/api/internal-employment-lifecycle',contexts=new Map(),active=new Set();
const statuses={pending:'Pendiente de revisión',approved:'Aprobado y registrado',rejected:'Rechazado'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const stamp=v=>v?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Historial laboral del alta';
const issue=(code,status)=>Object.assign(Error(),{code,status});
const errorText=e=>e.code==='NATIVE_EMPLOYMENT_LIFECYCLE_DATES_REQUIRED'?'Faltan fechas laborales comprobadas. Revisá el ingreso y la baja originales con su respaldo antes de preparar un movimiento.':e.code==='ACTOR_CHANGED'?'Cambió la cuenta o el ámbito del legajo. El intento original se conserva y sólo puede recuperarse con el acceso original.':[401,403].includes(e.status)?'Tu sesión o permiso cambió. Los datos fueron retirados. Volvé a consultar con una sesión autorizada.':e.status===409?'El historial laboral o la propuesta cambió. Conservamos tu borrador sin mezclar versiones; revisá el estado vigente.':e.status===404?'Todavía no hay confirmación. Podés consultar otra vez o reenviar exactamente el mismo intento.':'No se pudo verificar la respuesta. Conservamos el borrador y la referencia de cualquier envío sin confirmar.';

// These references live only in this page. Closing a sheet never silently retries a write.
if(typeof window!=='undefined'){
 window.addEventListener('beforeunload',event=>{if([...contexts.values()].some(c=>c.pending?.uncertain||c.pending?.sending)){event.preventDefault();event.returnValue='';}});
 window.addEventListener('pagehide',()=>{for(const close of [...active])close();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const close of [...active])close();});
 document.getElementById('logoutButton')?.addEventListener('click',()=>{for(const close of [...active])close();});
}

export function mountNativeEmploymentLifecycle(host,{contractId,onApplied}={}){
 if(!host||host.dataset.nlcMounted||!lifecycleUuid(contractId))return;
 contractId=contractId.toLowerCase();host.dataset.nlcMounted='true';host.classList.add('nlc-panel');
 const state=contexts.get(contractId)||{actor:null,scope:null,draft:null,pending:null};contexts.set(contractId,state);
 let bootstrap=null,detail=null,detailScope=null,busy=false,epoch=0,controller=null,closed=false;
 host.innerHTML=`<p class="nlc-note">Registrá una baja o un reingreso con respaldo y revisión de otra persona. Se conserva el mismo legajo, contrato y todos los períodos laborales. La baja indica el último día de vigencia, inclusive. No calcula haberes, antigüedad ni pagos.</p>
 <p role="status" aria-live="polite" class="nlc-status" data-nlc-status></p>
 <div class="nlc-actions"><button type="button" data-nlc-refresh>Actualizar consulta</button><button type="button" class="nlc-primary" data-nlc-create hidden>Preparar movimiento</button></div>
 <section class="nlc-pending" data-nlc-pending hidden><h4>Envío sin confirmar</h4><p>Se conserva el mismo contenido y su referencia. Consultá el resultado antes de preparar otro cambio.</p><p data-nlc-attempt></p><div class="nlc-actions"><button type="button" data-nlc-recover>Consultar confirmación</button><button type="button" data-nlc-retry disabled>Reenviar el mismo intento</button></div></section>
 <div data-nlc-content hidden><p data-nlc-source class="nlc-note"></p><div class="nlc-values" data-nlc-current></div></div>
 <form data-nlc-form hidden><h4>Propuesta de movimiento</h4><p class="nlc-note" data-nlc-draft-note></p><div class="nlc-fields" data-nlc-fields></div><label>Resolución o documento<input data-nlc-reference required minlength="3" maxlength="180"></label><label>Motivo<textarea data-nlc-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><div data-nlc-diff></div><label class="nlc-reviewed"><input type="checkbox" data-nlc-propose-checked>Revisé el movimiento y todos los períodos, el motivo y el documento de respaldo</label><div class="nlc-actions"><button type="submit" class="nlc-primary" data-nlc-send>Enviar a revisión</button><button type="button" data-nlc-discard>Descartar borrador</button></div></form>
 <section data-nlc-history hidden><h4>Historial de movimientos laborales</h4><p data-nlc-history-note></p><div class="nlc-proposals" data-nlc-proposals></div></section>
 <section data-nlc-detail hidden><div class="nlc-section-head"><h4>Comparación de la propuesta</h4><button type="button" data-nlc-detail-close>Cerrar comparación</button></div><p data-nlc-proposal-info></p><p data-nlc-proposal-reference></p><p data-nlc-proposal-reason></p><div data-nlc-comparison></div><p data-nlc-review-status class="nlc-note"></p><form data-nlc-review-form hidden><label>Motivo de la decisión<textarea data-nlc-review-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><p class="nlc-note">La aprobación registra las fechas declaradas. La vigencia se consulta para cada período. No anula liquidaciones ni aprueba licencias, beneficios o pagos.</p><label class="nlc-reviewed"><input type="checkbox" data-nlc-review-checked>Revisé el movimiento y todos los períodos y el respaldo antes de decidir</label><div class="nlc-actions"><button type="submit" class="nlc-primary" data-nlc-decision="approve">Aprobar y aplicar</button><button type="submit" data-nlc-decision="reject">Rechazar</button></div></form></section>`;
 const $=selector=>host.querySelector(selector),say=(text,error=false)=>{$('[data-nlc-status]').textContent=text;$('[data-nlc-status]').dataset.error=String(error);};
 const valid=seq=>!closed&&host.isConnected&&seq===epoch;
 function clearVisible(){bootstrap=null;detail=null;detailScope=null;for(const s of ['content','form','history','detail','pending','create'])$('[data-nlc-'+s+']').hidden=true;for(const s of ['current','fields','diff','proposals','comparison','proposal-info','proposal-reference','proposal-reason','review-status','source','history-note','attempt','draft-note'])$('[data-nlc-'+s+']').replaceChildren();for(const s of ['reason','reference','review-reason'])$('[data-nlc-'+s+']').value='';for(const s of ['propose-checked','review-checked'])$('[data-nlc-'+s+']').checked=false;}
 function changedActor(){if(!state.pending){state.actor=null;state.scope=null;}state.draft=null;clearVisible();throw issue('ACTOR_CHANGED');}
 function controls(){
  host.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=busy||closed);
  const pending=state.pending,draft=state.draft,stale=draft&&bootstrap&&(draft.baseVersion!==bootstrap.employment.version);
  $('[data-nlc-create]').hidden=!bootstrap?.permissions.canPropose||!!draft||!!pending;
  $('[data-nlc-pending]').hidden=!pending||!bootstrap;if(pending)$('[data-nlc-attempt]').textContent='Referencia: '+pending.key;
  $('[data-nlc-retry]').disabled=busy||!pending?.retryReady;
  for(const n of host.querySelectorAll('[data-nlc-form] input,[data-nlc-form] select,[data-nlc-form] textarea,[data-nlc-form] button,[data-nlc-review-form] textarea,[data-nlc-decision]'))n.disabled=busy||!!pending;
  $('[data-nlc-send]').disabled=busy||!!pending||!!stale||!bootstrap?.permissions.canPropose||!$('[data-nlc-propose-checked]').checked;
  $('[data-nlc-discard]').disabled=busy||!!pending;
  $('[data-nlc-review-form]').hidden=!!pending||!bootstrap?.permissions.canReview||detail?.status!=='pending'||detail?.canReview!==true;
  const approvalStale=detail&&bootstrap&&(detail.baseVersion!==bootstrap.employment.version);
  $('[data-nlc-decision="approve"]').disabled=busy||!!pending||!!approvalStale||!$('[data-nlc-review-checked]').checked;
  $('[data-nlc-decision="reject"]').disabled=busy||!!pending||!$('[data-nlc-review-checked]').checked;
  if(detail&&approvalStale&&detail.status==='pending')$('[data-nlc-review-status]').textContent='La versión de origen cambió. Esta propuesta no puede aprobarse; una persona habilitada puede rechazarla con motivo.';
 }
 async function request(url,options={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
  let d;try{d=await r.json();}catch{throw issue('RESPONSE_INVALID',503);}if(!r.ok||d?.ok!==true)throw issue(typeof d?.code==='string'?d.code.replace(/^NATIVE_EMPLOYMENT_LIFECYCLE_/,''):'UNAVAILABLE',r.status);return d;
 }
 async function authority(seq){
  const value=await request('/api/internal-auth');if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  const email=value.user?.email,caps=value.access?.tenantCapabilities;if(value.authenticated!==true||typeof email!=='string'||!email.trim()||!Array.isArray(caps))throw issue('SESSION_INVALID',401);
  const actor=JSON.stringify([email.trim().toLowerCase(),value.access.tenant?.id??null,value.access.tenant?.roleKey??value.user.role??null]);if(state.actor&&state.actor!==actor)changedActor();state.actor=actor;if(!caps.includes('workforce.employee.read'))throw issue('FORBIDDEN',403);
 }
 async function fresh(seq){
  const d=validateLifecycleBootstrap((await request(API+'?'+new URLSearchParams({resource:'bootstrap',contractId}))).data,contractId);if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  if(state.scope&&state.scope!==d.scopeVersion)changedActor();state.scope=d.scopeVersion;bootstrap=d;return d;
 }
 function fail(error){if([401,403].includes(error.status)){clearVisible();}else if(error.code==='CONTRACT_INVALID'){clearVisible();}else if(error.code==='REVIEW_CHANGED'){detail=null;detailScope=null;$('[data-nlc-detail]').hidden=true;$('[data-nlc-comparison]').replaceChildren();$('[data-nlc-review-checked]').checked=false;}say(errorText(error),true);}
 function civil(value){if(!value)return 'Sin baja';const [y,m,d]=value.split('-');return d+'/'+m+'/'+y;}
 function periods(target,rows){target.replaceChildren();const list=el('ol',undefined,'nlc-periods');for(const r of rows){const item=el('li');item.append(el('strong','Ingreso: '+civil(r.startDate)),el('span','Último día de vigencia: '+civil(r.endDate)));list.append(item);}target.append(list);}
 function comparison(target,before,after){target.replaceChildren();const grid=el('div',undefined,'nlc-comparison');for(const [title,rows]of [['Vigente al preparar',before.intervals],['Propuesto',after.intervals]]){const card=el('section',undefined,'nlc-change');card.append(el('h5',title));const content=el('div');periods(content,rows);card.append(content);grid.append(card);}target.append(grid);}
 function draftDiff(){if(!state.draft)return;$('[data-nlc-propose-checked]').checked=false;try{comparison($('[data-nlc-diff]'),state.draft.before,{intervals:lifecycleAfter(state.draft.before.intervals,state.draft.movement,state.draft.date,state.draft.version)});}catch(e){$('[data-nlc-diff]').replaceChildren(el('p',e.message,'nlc-note'));}controls();}
 function drawFields(){
  const d=state.draft;$('[data-nlc-fields]').replaceChildren();if(!d)return;
  const wrapper=el('label','Movimiento'),input=el('select');input.required=true;input.name='movement';input.dataset.nlcField='movement';for(const [value,label]of Object.entries(LIFECYCLE_MOVEMENTS))input.add(new Option(label,value));input.value=d.movement;input.addEventListener('change',()=>{if(busy||state.pending)return;d.movement=input.value;drawFields();draftDiff();});wrapper.append(input);
  const dateWrapper=el('label',d.movement==='terminate'?'Último día de vigencia de la baja (inclusive)':'Fecha de reingreso'),date=el('input');date.type='date';date.required=true;date.name='date';date.dataset.nlcField='date';date.min='1900-01-01';date.max='2099-12-31';date.value=d.date;date.addEventListener('input',()=>{if(busy||state.pending)return;d.date=date.value;draftDiff();});dateWrapper.append(date);$('[data-nlc-fields]').append(wrapper,dateWrapper);
 }
 function render(){
  if(!bootstrap)return;const d=state.draft,e=bootstrap.employment;$('[data-nlc-content]').hidden=false;$('[data-nlc-history]').hidden=false;
  $('[data-nlc-source]').textContent='Legajo '+bootstrap.subject.legajo+' · '+bootstrap.subject.employeeName+' · '+LIFECYCLE_STATUSES[e.status]+' al '+civil(e.today)+' · '+(e.revision?'Movimiento '+e.revision+' registrado '+stamp(e.appliedAt):'Períodos laborales de origen.');
  if(e.datesVerified===false)$('[data-nlc-current]').replaceChildren(el('p','Faltan fechas laborales comprobadas. Revisá el ingreso y la baja originales con su respaldo antes de preparar un movimiento. No se creó ningún período laboral.','nlc-note'));else periods($('[data-nlc-current]'),e.intervals);
  $('[data-nlc-history-note]').textContent=bootstrap.historyTruncated?'Se muestran las 20 propuestas más recientes. Hay antecedentes anteriores fuera de esta lista.':bootstrap.proposals.length+' propuestas registradas.';
  $('[data-nlc-proposals]').replaceChildren();for(const p of bootstrap.proposals){const b=el('button',LIFECYCLE_MOVEMENTS[p.movement]+' '+civil(p.date)+' · '+statuses[p.status]+' · '+p.authorLabel+' · '+stamp(p.createdAt));b.type='button';b.dataset.nlcProposal=p.id;b.addEventListener('click',()=>loadProposal(p.id));$('[data-nlc-proposals]').append(b);}
  $('[data-nlc-form]').hidden=!d;if(d){drawFields();$('[data-nlc-reference]').value=d.legalReference;$('[data-nlc-reason]').value=d.reason;$('[data-nlc-draft-note]').textContent=d.baseVersion!==e.version?'El historial laboral cambió. Conservamos tu borrador de origen; no se enviará sobre otra versión. Descartalo sólo cuando hayas revisado sus diferencias.':'Editás una copia de la versión consultada. Todavía no se guardó ningún cambio.';draftDiff();}controls();
 }
 async function load(){
  if(busy||closed)return;const seq=++epoch;controller?.abort();controller=new AbortController();busy=true;controls();say('Consultando historial laboral y permisos…');
  try{await authority(seq);await fresh(seq);if(!valid(seq))return;render();say(state.pending?'Hay un envío sin confirmar. Consultá su resultado antes de continuar.':state.draft?'Consulta actualizada. El borrador conserva su versión de origen.':'Historial laboral consultado. Aplicarlo requiere revisión de otra persona.');}
  catch(e){if(valid(seq))fail(e);}finally{if(valid(seq)){busy=false;controls();}}
 }
 async function loadProposal(id){
  if(busy||state.pending||closed)return;const seq=epoch;busy=true;controls();say('Consultando comparación…');
  try{await authority(seq);await fresh(seq);const d=validateLifecycleProposal((await request(API+'?'+new URLSearchParams({resource:'proposal',contractId,id}))).data,contractId,id);if(!valid(seq))return;if(d.proposal.subject.identityToken!==bootstrap.subject.identityToken)throw issue('CONTRACT_INVALID');detail=d.proposal;detailScope=state.scope;render();
   $('[data-nlc-proposal-info]').textContent=LIFECYCLE_MOVEMENTS[detail.movement]+' '+civil(detail.date)+' · '+statuses[detail.status]+' · '+detail.authorLabel+' · '+stamp(detail.createdAt);$('[data-nlc-proposal-reference]').textContent='Resolución o documento: '+detail.legalReference;$('[data-nlc-proposal-reason]').textContent='Motivo: '+detail.reason;comparison($('[data-nlc-comparison]'),detail.before,detail.after,true);
   $('[data-nlc-review-status]').textContent=detail.review?statuses[detail.status]+' por '+detail.review.reviewerLabel+' · '+stamp(detail.review.reviewedAt)+' · '+detail.review.reason:detail.canReview?'Revisá las fechas y todos los períodos antes de decidir.':'La revisión requiere otra persona habilitada. La persona autora no puede aprobar su propuesta.';
   $('[data-nlc-review-reason]').value='';$('[data-nlc-review-checked]').checked=false;$('[data-nlc-detail]').hidden=false;say('Comparación consultada. Ningún cambio se aplica hasta su aprobación.');$('[data-nlc-detail]').scrollIntoView({block:'start'});
  }catch(e){if(valid(seq))fail(e);}finally{if(valid(seq)){busy=false;controls();}}
 }
 function prepare(){if(busy||state.pending||!bootstrap?.permissions.canPropose)return;const intervals=bootstrap.employment.intervals;state.draft={version:bootstrap.version,scopeVersion:state.scope,identityToken:bootstrap.subject.identityToken,baseVersion:bootstrap.employment.version,before:{intervals:structuredClone(intervals)},movement:intervals.at(-1).endDate===null?'terminate':'reenter',date:'',reason:'',legalReference:''};detail=null;$('[data-nlc-detail]').hidden=true;render();say('Borrador preparado. Completá la fecha, el documento y el motivo.');$('[data-nlc-form]').scrollIntoView({block:'start'});$('[data-nlc-fields] select')?.focus({preventScroll:true});}
 async function accept(raw,attempt,seq){
  const r=validateLifecycleReceipt(raw,contractId);await authority(seq);const current=await fresh(seq);
  const saved=(await request(API+'?'+new URLSearchParams({resource:'proposal',contractId,id:r.proposalId}))).data;if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  assertLifecycleAttemptReceipt(r,attempt.reviewed,saved,current);state.pending=null;state.draft=null;detail=null;$('[data-nlc-detail]').hidden=true;return r;
 }
 async function send(recover=false){
  if(busy||!state.pending||closed)return;const attempt=state.pending,seq=epoch;busy=true;controls();say(recover?'Consultando confirmación del mismo intento…':'Enviando la operación…');let saved=null,started=false;
  try{await authority(seq);if(attempt.actor!==state.actor)changedActor();const b=await fresh(seq);if(b.scopeVersion!==attempt.body.payload.scopeVersion)changedActor();if(!recover&&!(attempt.body.operation==='propose'?b.permissions.canPropose:b.permissions.canReview))throw issue('FORBIDDEN',403);
   if(!recover&&!attempt.uncertain&&attempt.body.operation==='propose'&&(attempt.body.payload.baseVersion!==b.employment.version))throw issue('BASE_CHANGED',409);
   if(!recover&&!attempt.uncertain){let freshProposal=null;if(attempt.body.operation==='review')freshProposal=validateLifecycleProposal((await request(API+'?'+new URLSearchParams({resource:'proposal',contractId,id:attempt.body.payload.proposalId}))).data,contractId,attempt.body.payload.proposalId).proposal;if(!valid(seq))return;assertLifecycleAttemptFresh(attempt.reviewed,b,freshProposal);}
   attempt.sending=!recover;started=!recover;const raw=(await request(recover?API+'?'+new URLSearchParams({resource:'attempt',contractId,key:attempt.key}):API,recover?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.bytes})).data;if(!valid(seq))return;saved=await accept(raw,attempt,seq);
  }catch(e){if(!valid(seq))return;if(state.pending===attempt){if(e.code==='ACTOR_CHANGED'||recover||attempt.uncertain||started&&(!e.status||e.status>=500||[401,403].includes(e.status))){attempt.uncertain=true;attempt.retryReady=recover&&e.status===404;}else state.pending=null;}fail(e);if(bootstrap)render();}
  finally{attempt.sending=false;if(valid(seq)){busy=false;controls();}}
  if(saved&&valid(seq)){if(saved.status==='approved'){document.dispatchEvent(new CustomEvent('mc:native-employment-lifecycle-changed',{detail:{contractId}}));say('Movimiento aprobada y aplicada. Se conservó el mismo contrato y todos sus períodos laborales.');if(typeof onApplied==='function'){onApplied({contractId,receipt:saved});return;}}const text=saved.status==='rejected'?'Propuesta rechazada. El historial laboral vigente se conserva.':'Propuesta enviada a revisión. El historial laboral vigente se conserva.';await load();if(!closed&&bootstrap)say(text);}
 }
 function begin(body){if(busy||state.pending)return;const reviewed=reviewedLifecycleAttempt(body,bootstrap,detail,crypto.randomUUID());state.pending={actor:state.actor,key:reviewed.key,body:reviewed.body,bytes:reviewed.bytes,reviewed,uncertain:false,retryReady:false,sending:false};send();}
 $('[data-nlc-refresh]').addEventListener('click',load);$('[data-nlc-create]').addEventListener('click',prepare);
 $('[data-nlc-reference]').addEventListener('input',()=>{if(state.draft&&!state.pending){state.draft.legalReference=$('[data-nlc-reference]').value;$('[data-nlc-propose-checked]').checked=false;controls();}});$('[data-nlc-reason]').addEventListener('input',()=>{if(state.draft&&!state.pending){state.draft.reason=$('[data-nlc-reason]').value;$('[data-nlc-propose-checked]').checked=false;controls();}});
 for(const key of ['propose-checked','review-checked'])$('[data-nlc-'+key+']').addEventListener('change',controls);
 $('[data-nlc-review-reason]').addEventListener('input',()=>{$('[data-nlc-review-checked]').checked=false;controls();});
 $('[data-nlc-discard]').addEventListener('click',()=>{if(busy||state.pending)return;state.draft=null;render();say('Borrador descartado. No se guardaron cambios.');});
 $('[data-nlc-form]').addEventListener('submit',event=>{event.preventDefault();const d=state.draft;if(busy||state.pending||!d||!bootstrap?.permissions.canPropose||!$('[data-nlc-propose-checked]').checked)return;try{const payload=lifecycleProposalInput({contractId,identityToken:d.identityToken,scopeVersion:d.scopeVersion,baseVersion:d.baseVersion,movement:d.movement,date:d.date,legalReference:d.legalReference,reason:d.reason});lifecycleAfter(d.before.intervals,payload.movement,payload.date,d.version);begin({operation:'propose',payload});}catch(e){say(e.message||'Revisá el movimiento y sus fechas.',true);}});
  $('[data-nlc-review-form]').addEventListener('submit',event=>{event.preventDefault();if(busy||state.pending||!detail?.canReview||detail.status!=='pending'||!bootstrap?.permissions.canReview||!$('[data-nlc-review-checked]').checked)return;try{begin({operation:'review',payload:lifecycleReviewInput({contractId,proposalId:detail.id,scopeVersion:detailScope,decision:event.submitter?.dataset.nlcDecision,reason:$('[data-nlc-review-reason]').value})});}catch(e){say(e.message||'Revisá el motivo.',true);}});
 $('[data-nlc-recover]').addEventListener('click',()=>send(true));$('[data-nlc-retry]').addEventListener('click',()=>{if(state.pending?.retryReady)send();});$('[data-nlc-detail-close]').addEventListener('click',()=>{detail=null;$('[data-nlc-detail]').hidden=true;controls();});
 function revoked(event){const raw=event.detail?.tenantCapabilities,caps=raw instanceof Set?[...raw]:raw;if(!Array.isArray(caps))return;if(!caps.includes('workforce.employee.read')){epoch++;controller?.abort();busy=false;if(state.pending)state.pending.uncertain=true;clearVisible();say('Tu permiso de consulta cambió. Los datos fueron retirados.',true);}else if(bootstrap){if(!caps.includes('employee.record.propose'))bootstrap.permissions.canPropose=false;if(!caps.includes('employee.record.approve'))bootstrap.permissions.canReview=false;}controls();}
 function close(){if(closed)return;closed=true;epoch++;controller?.abort();if(state.pending){state.pending.uncertain=true;state.pending.retryReady=false;state.pending.sending=false;}clearVisible();controls();say('Se retiró la vista. Cerrá y volvé a abrir la ficha para comprobar el acceso y recuperar cualquier intento pendiente.');active.delete(close);document.removeEventListener('mc:native-employment-change-close',close);document.removeEventListener('municontrol:capabilities-ready',revoked);}
 active.add(close);document.addEventListener('mc:native-employment-change-close',close);document.addEventListener('municontrol:capabilities-ready',revoked);load();return {close};
}
