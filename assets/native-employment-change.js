import {changeUuid,changeProposalInput,changeReviewInput,changeDiff,validateChangeBootstrap,validateChangeProposal,validateChangeReceipt} from './native-employment-change-model.js';

const API='/api/internal-employment-changes',contexts=new Map(),active=new Set();
const fields=[['agreementCode','Convenio','agreements','agreementName'],['categoryCode','Categoría','categories','categoryName'],['organizationId','Sector','organizations','organizationName'],['sectorCode','Repartición','sectors','sectorName'],['jobTitle','Cargo o función',null,null]];
const statuses={pending:'Pendiente de revisión',approved:'Aprobada y aplicada',rejected:'Rechazada'},natural=new Intl.Collator('es',{numeric:true});
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const stamp=v=>v?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Encuadre del alta';
const issue=(code,status)=>Object.assign(Error(),{code,status});
const errorText=e=>e.code==='ACTOR_CHANGED'?'Cambió la cuenta o el ámbito del legajo. Descartamos el borrador y ningún intento anterior se reenviará con esta identidad.':[401,403].includes(e.status)?'Tu sesión o permiso cambió. Los datos fueron retirados. Volvé a consultar con una sesión autorizada.':e.status===409?'El encuadre, las opciones o la propuesta cambió. Conservamos tu borrador sin mezclar versiones; revisá el estado vigente.':e.status===404?'Todavía no hay confirmación. Podés consultar otra vez o reenviar exactamente el mismo intento.':'No se pudo verificar la respuesta. Conservamos el borrador y la referencia de cualquier envío sin confirmar.';

// These references live only in this page. Closing a sheet never silently retries a write.
if(typeof window!=='undefined'){
 window.addEventListener('beforeunload',event=>{if([...contexts.values()].some(c=>c.pending?.uncertain||c.pending?.sending)){event.preventDefault();event.returnValue='';}});
 window.addEventListener('pagehide',()=>{for(const close of [...active])close();contexts.clear();});
 document.getElementById('logoutButton')?.addEventListener('click',()=>{for(const close of [...active])close();contexts.clear();});
}

export function mountNativeEmploymentChange(host,{contractId,onApplied}={}){
 if(!host||host.dataset.necMounted||!changeUuid(contractId))return;
 contractId=contractId.toLowerCase();host.dataset.necMounted='true';host.classList.add('nec-panel');
 const state=contexts.get(contractId)||{actor:null,scope:null,draft:null,pending:null};contexts.set(contractId,state);
 let bootstrap=null,detail=null,detailScope=null,busy=false,epoch=0,controller=null,closed=false;
 host.innerHTML=`<p class="nec-note">Rectificá el convenio, la categoría, el sector, la repartición o el cargo de este legajo. Otra persona debe revisar el cambio antes de aplicarlo. No cambia haberes, identidad, jurisdicción ni fechas.</p>
 <p role="status" aria-live="polite" class="nec-status" data-nec-status></p>
 <div class="nec-actions"><button type="button" data-nec-refresh>Actualizar consulta</button><button type="button" class="nec-primary" data-nec-create hidden>Preparar rectificación</button></div>
 <section class="nec-pending" data-nec-pending hidden><h4>Envío sin confirmar</h4><p>Se conserva el mismo contenido y su referencia. Consultá el resultado antes de preparar otro cambio.</p><p data-nec-attempt></p><div class="nec-actions"><button type="button" data-nec-recover>Consultar confirmación</button><button type="button" data-nec-retry disabled>Reenviar el mismo intento</button></div></section>
 <div data-nec-content hidden><p data-nec-source class="nec-note"></p><dl class="nec-values" data-nec-current></dl></div>
 <form data-nec-form hidden><h4>Propuesta de rectificación</h4><p class="nec-note" data-nec-draft-note></p><div class="nec-fields" data-nec-fields></div><label>Resolución o documento<input data-nec-reference required minlength="3" maxlength="180"></label><label>Motivo<textarea data-nec-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><div data-nec-diff></div><div class="nec-actions"><button type="submit" class="nec-primary" data-nec-send>Enviar a revisión</button><button type="button" data-nec-discard>Descartar borrador</button></div></form>
 <section data-nec-history hidden><h4>Historial de rectificaciones</h4><p data-nec-history-note></p><div class="nec-proposals" data-nec-proposals></div></section>
 <section data-nec-detail hidden><div class="nec-section-head"><h4>Comparación de la propuesta</h4><button type="button" data-nec-detail-close>Cerrar comparación</button></div><p data-nec-proposal-info></p><p data-nec-proposal-reference></p><p data-nec-proposal-reason></p><div data-nec-comparison></div><p data-nec-review-status class="nec-note"></p><form data-nec-review-form hidden><label>Motivo de la decisión<textarea data-nec-review-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><p class="nec-note">La aprobación aplica el encuadre ahora. No modifica liquidaciones ni genera efectos retroactivos o futuros.</p><div class="nec-actions"><button type="submit" class="nec-primary" data-nec-decision="approve">Aprobar y aplicar</button><button type="submit" data-nec-decision="reject">Rechazar</button></div></form></section>`;
 const $=selector=>host.querySelector(selector),say=(text,error=false)=>{$('[data-nec-status]').textContent=text;$('[data-nec-status]').dataset.error=String(error);};
 const valid=seq=>!closed&&host.isConnected&&seq===epoch;
 function clearVisible(){bootstrap=null;detail=null;detailScope=null;for(const s of ['content','form','history','detail','pending','create'])$('[data-nec-'+s+']').hidden=true;for(const s of ['current','fields','diff','proposals','comparison','proposal-info','proposal-reference','proposal-reason','review-status','source','history-note','attempt','draft-note'])$('[data-nec-'+s+']').replaceChildren();for(const s of ['reason','reference','review-reason'])$('[data-nec-'+s+']').value='';}
 function changedActor(){state.actor=null;state.scope=null;state.pending=null;state.draft=null;clearVisible();throw issue('ACTOR_CHANGED');}
 function controls(){
  host.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=busy||closed);
  const pending=state.pending,draft=state.draft,stale=draft&&bootstrap&&(draft.baseVersion!==bootstrap.employment.version||draft.catalogVersion!==bootstrap.catalog.version);
  $('[data-nec-create]').hidden=!bootstrap?.permissions.canPropose||!!draft||!!pending;
  $('[data-nec-pending]').hidden=!pending||!bootstrap;if(pending)$('[data-nec-attempt]').textContent='Referencia: '+pending.key;
  $('[data-nec-retry]').disabled=busy||!pending?.retryReady;
  for(const n of host.querySelectorAll('[data-nec-form] input,[data-nec-form] select,[data-nec-form] textarea,[data-nec-form] button,[data-nec-review-form] textarea,[data-nec-decision]'))n.disabled=busy||!!pending;
  $('[data-nec-send]').disabled=busy||!!pending||!!stale||!bootstrap?.permissions.canPropose;
  $('[data-nec-discard]').disabled=busy||!!pending;
  $('[data-nec-review-form]').hidden=!!pending||!bootstrap?.permissions.canReview||detail?.status!=='pending'||detail?.canReview!==true;
  const approvalStale=detail&&bootstrap&&(detail.baseVersion!==bootstrap.employment.version||detail.catalogVersion!==bootstrap.catalog.version);
  $('[data-nec-decision="approve"]').disabled=busy||!!pending||!!approvalStale;
  if(detail&&approvalStale&&detail.status==='pending')$('[data-nec-review-status]').textContent='La versión de origen cambió. Esta propuesta no puede aprobarse; una persona habilitada puede rechazarla con motivo.';
 }
 async function request(url,options={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
  let d;try{d=await r.json();}catch{throw issue('RESPONSE_INVALID',503);}if(!r.ok||d?.ok!==true)throw issue(typeof d?.code==='string'?d.code:'UNAVAILABLE',r.status);return d;
 }
 async function authority(seq){
  const value=await request('/api/internal-auth');if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  const email=value.user?.email,caps=value.access?.tenantCapabilities;if(value.authenticated!==true||typeof email!=='string'||!email.trim()||!Array.isArray(caps))throw issue('SESSION_INVALID',401);
  const actor=JSON.stringify([email.trim().toLowerCase(),value.access.tenant?.id??null,value.access.tenant?.roleKey??value.user.role??null]);if(state.actor&&state.actor!==actor)changedActor();state.actor=actor;if(!caps.includes('workforce.employee.read'))throw issue('FORBIDDEN',403);
 }
 async function fresh(seq){
  const d=validateChangeBootstrap((await request(API+'?'+new URLSearchParams({resource:'bootstrap',contractId}))).data,contractId);if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  if(state.scope&&state.scope!==d.scopeVersion)changedActor();state.scope=d.scopeVersion;bootstrap=d;return d;
 }
 function fail(error){if([401,403].includes(error.status)){clearVisible();}else if(error.code==='CONTRACT_INVALID'){clearVisible();}say(errorText(error),true);}
 function viewValue(values,labels,field){const definition=fields.find(f=>f[0]===field);return definition[3]?(values[field]+' · '+labels[definition[3]]):values[field]||'Sin cargo informado';}
 function comparison(target,before,after,all=false){target.replaceChildren();const diffs=changeDiff(before.values,after.values);if(!diffs.length)target.append(el('p','Todavía no hay diferencias.','nec-note'));const grid=el('div',undefined,'nec-comparison');for(const [field,label]of fields){if(!all&&!diffs.some(d=>d.field===field))continue;const card=el('div',undefined,'nec-change');card.append(el('h5',label),el('p','Vigente al proponer: '+viewValue(before.values,before.labels,field)),el('p','Propuesto: '+viewValue(after.values,after.labels,field)));grid.append(card);}target.append(grid);}
 function draftLabels(draft){const result={};for(const [field,,kind,label]of fields){if(!kind)continue;result[label]=draft.catalogItems.find(i=>i.kind===kind&&i.code===draft.values[field]&&(kind!=='categories'||i.agreementCode===draft.values.agreementCode))?.label||'Opción no disponible';}return result;}
 function draftDiff(){if(!state.draft)return;try{comparison($('[data-nec-diff]'),state.draft.before,{values:state.draft.values,labels:draftLabels(state.draft)});}catch{$('[data-nec-diff]').replaceChildren(el('p','Completá las opciones para revisar las diferencias.','nec-note'));}}
 function drawFields(){
  const d=state.draft;$('[data-nec-fields]').replaceChildren();if(!d)return;
  for(const [field,label,kind]of fields){const wrapper=el('label',label),input=el(kind?'select':'input');input.name=field;input.dataset.necField=field;
   if(kind){input.required=true;input.add(new Option('Elegí una opción',''));for(const item of d.catalogItems.filter(i=>i.kind===kind&&(kind!=='categories'||i.agreementCode===d.values.agreementCode)).sort((a,b)=>natural.compare(a.code,b.code)||a.code.localeCompare(b.code)))input.add(new Option(item.code+' · '+item.label,item.code));if(d.values[field]&&!Array.from(input.options).some(o=>o.value===d.values[field]))input.add(new Option(d.values[field]+' · no disponible en el catálogo',d.values[field]));}else input.maxLength=120;
   input.value=d.values[field];input.addEventListener(kind?'change':'input',()=>{if(busy||state.pending)return;d.values[field]=input.value;if(field==='agreementCode'){d.values.categoryCode='';drawFields();}draftDiff();});wrapper.append(input);$('[data-nec-fields]').append(wrapper);
  }
 }
 function render(){
  if(!bootstrap)return;const d=state.draft,e=bootstrap.employment;$('[data-nec-content]').hidden=false;$('[data-nec-history]').hidden=false;
  $('[data-nec-source]').textContent='Legajo '+bootstrap.subject.legajo+' · '+bootstrap.subject.employeeName+' · Alta propia de MuniControl. '+(e.revision?'Rectificación '+e.revision+' aplicada '+stamp(e.appliedAt):'Se conserva el encuadre del alta.')+' Opciones: '+(bootstrap.catalog.origin==='GRH'?'catálogo incorporado de GRH.':'catálogo propio de MuniControl.');
  $('[data-nec-current]').replaceChildren();for(const [field,label]of fields){const group=el('div');group.append(el('dt',label),el('dd',viewValue(e.values,e.labels,field)));$('[data-nec-current]').append(group);}
  $('[data-nec-history-note]').textContent=bootstrap.historyTruncated?'Se muestran las 20 propuestas más recientes. Hay antecedentes anteriores fuera de esta lista.':bootstrap.proposals.length+' propuestas registradas.';
  $('[data-nec-proposals]').replaceChildren();for(const p of bootstrap.proposals){const b=el('button',statuses[p.status]+' · '+p.authorLabel+' · '+stamp(p.createdAt));b.type='button';b.dataset.necProposal=p.id;b.addEventListener('click',()=>loadProposal(p.id));$('[data-nec-proposals]').append(b);}
  $('[data-nec-form]').hidden=!d;if(d){drawFields();$('[data-nec-reference]').value=d.legalReference;$('[data-nec-reason]').value=d.reason;$('[data-nec-draft-note]').textContent=d.baseVersion!==e.version||d.catalogVersion!==bootstrap.catalog.version?'El encuadre o las opciones cambiaron. Conservamos tu borrador de origen; no se enviará sobre otra versión. Descartalo sólo cuando hayas revisado sus diferencias.':'Editás una copia de la versión consultada. Todavía no se guardó ningún cambio.';draftDiff();}controls();
 }
 async function load(){
  if(busy||closed)return;const seq=++epoch;controller?.abort();controller=new AbortController();busy=true;controls();say('Consultando encuadre y permisos…');
  try{await authority(seq);await fresh(seq);if(!valid(seq))return;render();say(state.pending?'Hay un envío sin confirmar. Consultá su resultado antes de continuar.':state.draft?'Consulta actualizada. El borrador conserva su versión de origen.':'Encuadre consultado. Aplicarlo requiere revisión de otra persona.');}
  catch(e){if(valid(seq))fail(e);}finally{if(valid(seq)){busy=false;controls();}}
 }
 async function loadProposal(id){
  if(busy||state.pending||closed)return;const seq=epoch;busy=true;controls();say('Consultando comparación…');
  try{await authority(seq);await fresh(seq);const d=validateChangeProposal((await request(API+'?'+new URLSearchParams({resource:'proposal',contractId,id}))).data,contractId,id);if(!valid(seq))return;if(d.proposal.subject.identityToken!==bootstrap.subject.identityToken)throw issue('CONTRACT_INVALID');detail=d.proposal;detailScope=state.scope;render();
   $('[data-nec-proposal-info]').textContent=statuses[detail.status]+' · '+detail.authorLabel+' · '+stamp(detail.createdAt);$('[data-nec-proposal-reference]').textContent='Resolución o documento: '+detail.legalReference;$('[data-nec-proposal-reason]').textContent='Motivo: '+detail.reason;comparison($('[data-nec-comparison]'),detail.before,detail.after,true);
   $('[data-nec-review-status]').textContent=detail.review?statuses[detail.status]+' por '+detail.review.reviewerLabel+' · '+stamp(detail.review.reviewedAt)+' · '+detail.review.reason:detail.canReview?'Revisá todos los campos antes de decidir.':'La revisión requiere otra persona habilitada. La persona autora no puede aprobar su propuesta.';
   $('[data-nec-review-reason]').value='';$('[data-nec-detail]').hidden=false;say('Comparación consultada. Ningún cambio se aplica hasta su aprobación.');$('[data-nec-detail]').scrollIntoView({block:'start'});
  }catch(e){if(valid(seq))fail(e);}finally{if(valid(seq)){busy=false;controls();}}
 }
 function prepare(){if(busy||state.pending||!bootstrap?.permissions.canPropose)return;state.draft={scopeVersion:state.scope,identityToken:bootstrap.subject.identityToken,baseVersion:bootstrap.employment.version,catalogVersion:bootstrap.catalog.version,catalogItems:structuredClone(bootstrap.catalog.items),before:structuredClone({values:bootstrap.employment.values,labels:bootstrap.employment.labels}),values:structuredClone(bootstrap.employment.values),reason:'',legalReference:''};detail=null;$('[data-nec-detail]').hidden=true;render();say('Borrador preparado. Completá el documento y el motivo para enviarlo a revisión.');$('[data-nec-form]').scrollIntoView({block:'start'});$('[data-nec-fields] select')?.focus({preventScroll:true});}
 function accept(raw,attempt){let r;try{r=validateChangeReceipt(raw,contractId);}catch{throw issue('RESPONSE_INVALID',503);}const b=attempt.body;if(r.operation!==b.operation||r.status!==(b.operation==='propose'?'pending':b.payload.decision==='approve'?'approved':'rejected')||b.operation==='propose'&&r.employmentVersion!==b.payload.baseVersion||b.operation==='review'&&r.proposalId!==b.payload.proposalId)throw issue('RESPONSE_INVALID',503);state.pending=null;state.draft=null;detail=null;$('[data-nec-detail]').hidden=true;return r;}
 async function send(recover=false){
  if(busy||!state.pending||closed)return;const attempt=state.pending,seq=epoch;busy=true;controls();say(recover?'Consultando confirmación del mismo intento…':'Enviando la operación…');let saved=null,started=false;
  try{await authority(seq);if(attempt.actor!==state.actor)changedActor();const b=await fresh(seq);if(b.scopeVersion!==attempt.body.payload.scopeVersion)changedActor();if(!(attempt.body.operation==='propose'?b.permissions.canPropose:b.permissions.canReview))throw issue('FORBIDDEN',403);
   if(!recover&&!attempt.uncertain&&attempt.body.operation==='propose'&&(attempt.body.payload.baseVersion!==b.employment.version||attempt.body.payload.catalogVersion!==b.catalog.version))throw issue('BASE_CHANGED',409);
   attempt.sending=!recover;started=!recover;const raw=(await request(recover?API+'?'+new URLSearchParams({resource:'attempt',contractId,key:attempt.key}):API,recover?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.bytes})).data;if(!valid(seq))return;saved=accept(raw,attempt);
  }catch(e){if(!valid(seq))return;if(state.pending===attempt){if(recover||attempt.uncertain||started&&(!e.status||e.status>=500||[401,403].includes(e.status))){attempt.uncertain=true;attempt.retryReady=recover&&e.status===404;}else state.pending=null;}fail(e);if(bootstrap)render();}
  finally{attempt.sending=false;if(valid(seq)){busy=false;controls();}}
  if(saved&&valid(seq)){if(saved.status==='approved'){say('Rectificación aprobada y aplicada. Los datos personales y los haberes se conservaron.');if(typeof onApplied==='function'){onApplied({contractId,receipt:saved});return;}}const text=saved.status==='rejected'?'Propuesta rechazada. El encuadre vigente se conserva.':'Propuesta enviada a revisión. El encuadre vigente se conserva.';await load();if(!closed&&bootstrap)say(text);}
 }
 function begin(body){if(busy||state.pending)return;state.pending={actor:state.actor,key:crypto.randomUUID(),body:structuredClone(body),bytes:JSON.stringify(body),uncertain:false,retryReady:false,sending:false};send();}
 $('[data-nec-refresh]').addEventListener('click',load);$('[data-nec-create]').addEventListener('click',prepare);
 $('[data-nec-reference]').addEventListener('input',()=>{if(state.draft&&!state.pending)state.draft.legalReference=$('[data-nec-reference]').value;});$('[data-nec-reason]').addEventListener('input',()=>{if(state.draft&&!state.pending)state.draft.reason=$('[data-nec-reason]').value;});
 $('[data-nec-discard]').addEventListener('click',()=>{if(busy||state.pending)return;state.draft=null;render();say('Borrador descartado. No se guardaron cambios.');});
 $('[data-nec-form]').addEventListener('submit',event=>{event.preventDefault();const d=state.draft;if(busy||state.pending||!d||!bootstrap?.permissions.canPropose)return;try{const payload=changeProposalInput({contractId,identityToken:d.identityToken,scopeVersion:d.scopeVersion,baseVersion:d.baseVersion,catalogVersion:d.catalogVersion,values:d.values,legalReference:d.legalReference,reason:d.reason});if(!changeDiff(d.before.values,payload.values).length){say('Modificá al menos un campo para proponer una rectificación.',true);return;}for(const [field,,kind]of fields)if(kind&&!d.catalogItems.some(i=>i.kind===kind&&i.code===payload.values[field]&&(kind!=='categories'||i.agreementCode===payload.values.agreementCode)))throw Error('Elegí opciones disponibles en el catálogo consultado.');begin({operation:'propose',payload});}catch(e){say(e.message||'Revisá los datos de la propuesta.',true);}});
 $('[data-nec-review-form]').addEventListener('submit',event=>{event.preventDefault();if(busy||state.pending||!detail?.canReview||detail.status!=='pending'||!bootstrap?.permissions.canReview)return;try{begin({operation:'review',payload:changeReviewInput({contractId,proposalId:detail.id,scopeVersion:detailScope,decision:event.submitter?.dataset.necDecision,reason:$('[data-nec-review-reason]').value})});}catch(e){say(e.message||'Revisá el motivo.',true);}});
 $('[data-nec-recover]').addEventListener('click',()=>send(true));$('[data-nec-retry]').addEventListener('click',()=>{if(state.pending?.retryReady)send();});$('[data-nec-detail-close]').addEventListener('click',()=>{detail=null;$('[data-nec-detail]').hidden=true;controls();});
 function revoked(event){const caps=event.detail?.tenantCapabilities;if(!Array.isArray(caps))return;if(!caps.includes('workforce.employee.read')){epoch++;controller?.abort();busy=false;if(state.pending)state.pending.uncertain=true;clearVisible();say('Tu permiso de consulta cambió. Los datos fueron retirados.',true);}else if(bootstrap){if(!caps.includes('employee.record.propose'))bootstrap.permissions.canPropose=false;if(!caps.includes('employee.record.approve'))bootstrap.permissions.canReview=false;}controls();}
 function close(){if(closed)return;closed=true;epoch++;controller?.abort();if(state.pending){state.pending.uncertain=true;state.pending.retryReady=false;state.pending.sending=false;}clearVisible();active.delete(close);document.removeEventListener('mc:native-employment-change-close',close);document.removeEventListener('municontrol:capabilities-ready',revoked);}
 active.add(close);document.addEventListener('mc:native-employment-change-close',close);document.addEventListener('municontrol:capabilities-ready',revoked);load();return {close};
}
