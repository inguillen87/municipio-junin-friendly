import {nativeLeaveUuid,nativeLeaveCommand,nativeLeaveSame,validateNativeLeaveBootstrap,validateNativeLeaveReceipt} from './native-leave-contract.js';
import {nativeLeavePayload,nativeLeaveProfile,nativeLeaveAllocations,NATIVE_LEAVE_STATES,NATIVE_LEAVE_UNITS,NATIVE_LEAVE_POLICY_VERSION} from './native-leave-model.js';
import {getTitleViCatalog,reasonPolicyMapping} from './mendoza-title-vi.js';

const API='/api/internal-native-leave',contexts=new Map(),active=new Set();
const reasonCodes=['3','4','5','6','7','8','9','10','11','12','13','14','16','19','21','30','31','32','33','36'];
const provisions=getTitleViCatalog().provisions;
const reasonLabel=code=>code+' · '+(provisions.find(p=>p.id===reasonPolicyMapping(code).provisionId)?.label??'Motivo');
const policyText=code=>code==='19'?'El saldo adeudado necesita un registro aprobado y el documento que autorice su traslado. Los antecedentes por sí solos no acreditan saldo.':code==='13'?'Registrá días o minutos según el respaldo revisado. Una unidad no se convierte automáticamente en otra.':'Personal debe revisar el respaldo y la regla municipal vigente para este motivo. No incluyas información clínica en los campos administrativos.';
const statusLabel=v=>NATIVE_LEAVE_STATES[v]??({pending:'Saldo pendiente de revisión',approved:'Saldo aprobado',rejected:'Saldo rechazado'})[v];
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const issue=(code,status,message)=>Object.assign(Error(message??''),{code,status});
const serialized=v=>Array.isArray(v)?'['+v.map(serialized).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+serialized(v[k])).join(',')+'}':JSON.stringify(v);
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');
const civil=v=>v.split('-').reverse().join('/');
const at=v=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
if(typeof window!=='undefined'){
 window.addEventListener('pagehide',()=>{for(const close of [...active])close();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const close of [...active])close();});
 window.addEventListener('beforeunload',event=>{if([...contexts.values()].some(s=>s.pending)){event.preventDefault();event.returnValue='';}});
 document.getElementById('logoutButton')?.addEventListener('click',()=>{for(const close of [...active])close();});
}

export function mountNativeLeave(host,{contractId}={}){
 if(!host||host.dataset.nleaveMounted||!nativeLeaveUuid(contractId))return;
 contractId=contractId.toLowerCase();host.dataset.nleaveMounted='true';host.classList.add('nleave-panel');
 const state=contexts.get(contractId)??{actor:null,scope:null,pending:null};contexts.set(contractId,state);
 let bootstrap=null,draft=null,decision=null,closed=false,busy=false,epoch=0,controller=null,authorityCaps=[];
 host.innerHTML=`<p class="nleave-note">Solicitudes y saldos del contrato propio. Las cantidades son días corridos o minutos solicitados; no son tiempo observado, haberes ni descuentos. Los derechos requieren respaldo municipal y revisión de otra persona.</p>
 <p data-nleave-status role="status" aria-live="polite"></p>
 <div class="nleave-actions"><button type="button" data-nleave-refresh>Actualizar licencias</button><button type="button" data-nleave-create hidden>Preparar solicitud</button><button type="button" data-nleave-profile hidden>Declarar saldo con respaldo</button></div>
 <section data-nleave-pending hidden><h4>Envío sin confirmar</h4><p>Conservamos el contenido y la referencia originales. Consultá el resultado antes de preparar otra operación.</p><p data-nleave-reference></p><div class="nleave-actions"><button type="button" data-nleave-recover>Consultar confirmación</button><button type="button" data-nleave-retry disabled>Reenviar el mismo intento</button></div></section>
 <section data-nleave-content hidden><p data-nleave-source></p><h4>Saldos administrativos</h4><p class="nleave-note">Aprobadas indica unidades autorizadas, sin afirmar que se hayan utilizado. Sin declaración conserva un saldo desconocido. No se deducen derechos del ingreso ni de las reglas históricas de GRH.</p><div data-nleave-balances class="nleave-cards"></div><h4>Solicitudes y revisión</h4><p data-nleave-count></p><div class="nleave-actions"><label>Buscar motivo o estado<input type="search" data-nleave-search></label><label>Estado<select data-nleave-filter><option value="">Todos</option></select></label></div><div data-nleave-requests class="nleave-cards"></div><div class="nleave-actions"><button type="button" data-nleave-prev>Página anterior</button><span data-nleave-page aria-live="polite"></span><button type="button" data-nleave-next>Página siguiente</button></div><h4>Declaraciones de saldo y decisiones</h4><div data-nleave-profiles class="nleave-cards"></div></section>
 <form data-nleave-form hidden><h4 data-nleave-form-title></h4><p data-nleave-policy class="nleave-note"></p><div class="nleave-fields" data-nleave-fields></div><p data-nleave-summary></p><label class="nleave-check"><input type="checkbox" data-nleave-checked>Revisé el motivo, las fechas o el año, la unidad, la cantidad y el respaldo</label><div class="nleave-actions"><button type="submit" data-nleave-save>Guardar para revisión</button><button type="button" data-nleave-discard>Descartar preparación</button></div></form>
 <form data-nleave-decision hidden><h4 data-nleave-decision-title></h4><div data-nleave-comparison></div><label>Fundamento administrativo, sin datos clínicos<textarea data-nleave-reason required minlength="10" maxlength="1000" rows="3"></textarea></label><label data-nleave-evidence-label hidden>Revisión de la evidencia<select data-nleave-evidence><option value="">Elegí una opción</option><option value="verified">Evidencia verificada</option><option value="not_required">No requiere evidencia, según regla municipal revisada</option></select></label><label class="nleave-check"><input type="checkbox" data-nleave-decision-checked>Revisé los datos y el respaldo antes de decidir</label><div class="nleave-actions"><button type="submit" data-nleave-decide>Confirmar decisión</button><button type="button" data-nleave-decision-close>Cerrar revisión</button></div></form>`;
 const $=s=>host.querySelector(s),say=(message,error=false)=>{$('[data-nleave-status]').textContent=message;$('[data-nleave-status]').dataset.error=String(error);};
 host.insertBefore($('[data-nleave-form]'),$('[data-nleave-content]'));host.insertBefore($('[data-nleave-decision]'),$('[data-nleave-content]'));
 let page=1;
 for(const[value,label]of Object.entries(NATIVE_LEAVE_STATES))$('[data-nleave-filter]').add(new Option(label,value));
 const valid=seq=>!closed&&host.isConnected&&seq===epoch;
 function clearVisible(){bootstrap=null;draft=null;decision=null;for(const name of ['content','form','decision','pending','create','profile'])$('[data-nleave-'+name+']').hidden=true;for(const name of ['source','balances','count','requests','profiles','fields','comparison','summary','reference','policy','page'])$('[data-nleave-'+name+']').replaceChildren();for(const name of ['reason','search'])$('[data-nleave-'+name+']').value='';$('[data-nleave-evidence]').value='';$('[data-nleave-filter]').value='';$('[data-nleave-checked]').checked=false;$('[data-nleave-decision-checked]').checked=false;}
 function controls(){
  host.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=busy||closed);
  const pending=state.pending;
  $('[data-nleave-create]').hidden=!bootstrap?.permissions.canCreate||!!draft||!!decision||!!pending;
  $('[data-nleave-profile]').hidden=!bootstrap?.permissions.canProposeProfile||!!draft||!!decision||!!pending;
  $('[data-nleave-pending]').hidden=!pending||!bootstrap;if(pending&&bootstrap)$('[data-nleave-reference]').textContent='Referencia: '+pending.key;
  $('[data-nleave-retry]').disabled=busy||closed||!pending?.retryReady;
  for(const n of host.querySelectorAll('[data-nleave-form] input,[data-nleave-form] select,[data-nleave-form] textarea,[data-nleave-form] button,[data-nleave-decision] input,[data-nleave-decision] select,[data-nleave-decision] textarea,[data-nleave-decision] button,[data-nleave-row-action]'))n.disabled=busy||closed||!!pending;
  $('[data-nleave-save]').disabled=busy||closed||!!pending||!draft||!$('[data-nleave-checked]').checked;
  $('[data-nleave-decide]').disabled=busy||closed||!!pending||!decision||!$('[data-nleave-decision-checked]').checked||(decision?.command==='approve'&&!$('[data-nleave-evidence]').value);
  if(draft?.kind==='request')for(const key of ['startsAtLocal','endsAtLocal']){const n=$('[data-nleave-field="'+key+'"]');if(n)n.disabled=busy||!!pending||draft.values.durationUnit!=='minute';}
  if(draft?.entity)for(const key of ['reasonCode','durationUnit']){const n=$('[data-nleave-field="'+key+'"]');if(n)n.disabled=true;}
  if(draft?.kind==='profile'){const n=$('[data-nleave-field="entitledUnits"]');if(n)n.disabled=busy||!!pending||draft.values.mode!=='confirmed';}
 }
 async function request(url,options={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});let d;try{d=await r.json();}catch{throw issue('CONTRACT_INVALID',503);}
  if(!r.ok||d?.ok!==true)throw issue(String(d?.code??'UNAVAILABLE').replace(/^NATIVE_LEAVE_/,''),r.status,typeof d?.error==='string'?d.error:null);return d.data??d;
 }
 async function authority(seq){
  const d=await request('/api/internal-auth');if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  const caps=d.access?.tenantCapabilities,email=d.user?.email;if(d.authenticated!==true||typeof email!=='string'||!Array.isArray(caps)||!['workforce.employee.read','actions.read'].every(k=>caps.includes(k)))throw issue('FORBIDDEN',403);
  const actor=JSON.stringify([email.toLowerCase().trim(),d.access.tenant?.id??null,d.access.tenant?.membershipId??null,d.access.tenant?.roleKey??d.user.role??null]);
  if(state.actor&&state.actor!==actor){if(!state.pending){state.actor=null;state.scope=null;}clearVisible();throw issue('ACTOR_CHANGED',409);}
  state.actor=actor;authorityCaps=caps;
 }
 async function fresh(seq){
  const b=validateNativeLeaveBootstrap(await request(API+'?'+new URLSearchParams({resource:'bootstrap',contractId})),contractId);if(!valid(seq))throw new DOMException('Consulta descartada','AbortError');
  if(state.scope&&state.scope!==b.scopeVersion){if(!state.pending){state.actor=null;state.scope=null;}clearVisible();throw issue('ACTOR_CHANGED',409);}
  state.scope=b.scopeVersion;bootstrap=b;return b;
 }
 function failure(error){
  if([401,403].includes(error.status)||['CONTRACT_INVALID','ACTOR_CHANGED'].includes(error.code))clearVisible();
  const message=error.code==='ACTOR_CHANGED'?'Cambió la cuenta o el ámbito. El intento original se conserva y requiere el acceso original.':error.code==='CONTRACT_INVALID'?'La respuesta no pudo verificarse. Conservamos la referencia del envío sin confirmar.':[401,403].includes(error.status)?'Tu acceso cambió. Se retiraron los datos. Cerrá y volvé a abrir la ficha con una cuenta autorizada.':error.message||'No se confirmó la operación. Consultá el mismo intento antes de continuar.';say(message,true);
 }
 function field(name,label,type='text',choices=null){
  const wrapper=el('label',label),n=el(choices?'select':type==='textarea'?'textarea':'input');n.dataset.nleaveField=name;n.name=name;
  if(choices)for(const[value,title]of choices)n.add(new Option(title,value));else if(type!=='textarea')n.type=type;
  if(type==='date'){n.min='2000-01-01';n.max='2100-12-31';}if(type==='number'){n.min=name==='year'?'2000':'0';n.max=name==='year'?'2100':'1000000';n.step='1';}
  if(type==='textarea'){n.rows=3;n.maxLength=1000;}if(name==='legalReference')n.maxLength=240;
  n.value=draft.values[name]??'';n.addEventListener(choices?'change':'input',()=>{
   if(busy||state.pending||!draft)return;draft.values[name]=n.value;$('[data-nleave-checked]').checked=false;
   if(['reasonCode','durationUnit','mode'].includes(name)){
    if(name==='reasonCode'&&draft.kind==='request'){const map=reasonPolicyMapping(n.value);draft.values.policyRuleId=map.provisionId;draft.values.confidentiality=n.value==='19'?'standard':'restricted';draft.values.employeeNote=null;}
    if(draft.kind==='request'&&(name==='durationUnit'||name==='reasonCode')){if(draft.values.reasonCode!=='13')draft.values.durationUnit='calendar_day';if(draft.values.durationUnit==='calendar_day'){draft.values.startsAtLocal=null;draft.values.endsAtLocal=null;}}
    drawFields();
   }
   summary();controls();
  });wrapper.append(n);$('[data-nleave-fields]').append(wrapper);return n;
 }
 function values(){
  if(draft.kind==='profile'){const v={...draft.values,year:Number(draft.values.year),entitledUnits:draft.values.mode==='not_applicable'?null:draft.values.entitledUnits===''?null:Number(draft.values.entitledUnits)};return nativeLeaveProfile(v);}
  return nativeLeavePayload({...draft.values,startsAtLocal:draft.values.durationUnit==='minute'?draft.values.startsAtLocal:null,endsAtLocal:draft.values.durationUnit==='minute'?draft.values.endsAtLocal:null,employeeNote:draft.values.confidentiality==='restricted'?null:draft.values.employeeNote||null});
 }
 function summary(){if(!draft)return;$('[data-nleave-policy]').textContent=policyText(draft.values.reasonCode);try{const v=values();$('[data-nleave-summary]').textContent=draft.kind==='profile'?reasonLabel(v.reasonCode)+' · '+v.year+' · '+(v.mode==='confirmed'?v.entitledUnits+' '+NATIVE_LEAVE_UNITS[v.durationUnit]:'No aplicable con respaldo')+' · '+v.legalReference:nativeLeaveAllocations(v).map(p=>p.year+': '+p.units+' '+NATIVE_LEAVE_UNITS[p.durationUnit]).join(' · ');}catch(error){$('[data-nleave-summary]').textContent=error.message;}}
 function drawFields(){
  $('[data-nleave-fields]').replaceChildren();if(!draft)return;
  field('reasonCode','Motivo','text',reasonCodes.map(c=>[c,reasonLabel(c)]));
  const units=Object.entries(NATIVE_LEAVE_UNITS).filter(([key])=>key!=='minute'||draft.values.reasonCode==='13');field('durationUnit','Unidad','text',units);
  if(draft.kind==='profile'){
   field('year','Año de la solicitud al que se aplicará la declaración','number');field('mode','Tratamiento del saldo','text',[['confirmed','Cantidad declarada con respaldo'],['not_applicable','No aplicable con respaldo municipal']]);field('entitledUnits','Cantidad total declarada, incluido cero','number');field('legalReference','Resolución o documento de respaldo');field('reason','Fundamento del saldo, sin datos clínicos','textarea');
  }else{
   field('startsOn','Fecha de inicio','date');field('endsOn','Fecha final, inclusive','date');if(draft.values.durationUnit==='minute'){field('startsAtLocal','Hora inicial','time');field('endsAtLocal','Hora final','time');}
   if(draft.values.confidentiality==='standard')field('employeeNote','Observación administrativa opcional','textarea');
   if(draft.entity){$('[data-nleave-field="reasonCode"]').disabled=true;$('[data-nleave-field="durationUnit"]').disabled=true;}
  }
  summary();controls();
 }
 function beginDraft(kind,entity=null){
  if(busy||closed||state.pending||!bootstrap)return;if(entity?!entity.canUpdate:kind==='profile'?!bootstrap.permissions.canProposeProfile:!bootstrap.permissions.canCreate)return;
  decision=null;$('[data-nleave-decision]').hidden=true;
  draft={kind,entity:entity?structuredClone(entity):null,source:structuredClone(bootstrap),values:kind==='profile'?{reasonCode:'19',year:Number(bootstrap.employment.today.slice(0,4)),durationUnit:'calendar_day',mode:'confirmed',entitledUnits:'',legalReference:'',reason:''}:entity?structuredClone(entity.payload):{reasonCode:'19',policyVersionId:NATIVE_LEAVE_POLICY_VERSION,policyRuleId:'annual-ordinary',startsOn:bootstrap.employment.today,endsOn:bootstrap.employment.today,durationUnit:'calendar_day',startsAtLocal:null,endsAtLocal:null,confidentiality:'standard',employeeNote:null}};
  $('[data-nleave-form]').hidden=false;$('[data-nleave-form-title]').textContent=kind==='profile'?'Proponer una declaración de saldo':entity?'Editar borrador':'Preparar solicitud';$('[data-nleave-checked]').checked=false;drawFields();$('[data-nleave-fields] select').focus();
 }
 function card(row,profile=false){
  const card=el('article'),title=el('h5',reasonLabel(row.payload.reasonCode)+' · '+(profile?({pending:'Pendiente de revisión',approved:'Saldo aprobado',rejected:'Rechazado'})[row.status]:statusLabel(row.status)));card.append(title,el('p',profile?row.payload.year+' · '+(row.payload.mode==='confirmed'?row.payload.entitledUnits+' '+NATIVE_LEAVE_UNITS[row.payload.durationUnit]:'No aplicable')+' · '+row.payload.legalReference:civil(row.payload.startsOn)+' al '+civil(row.payload.endsOn)+' · '+nativeLeaveAllocations(row.payload).map(p=>p.units+' '+NATIVE_LEAVE_UNITS[p.durationUnit]).join(' + ')),el('p','Preparó '+row.authorLabel+' · versión '+row.version));
  const history=el('details'),summary=el('summary','Ver historial y respaldo');history.append(summary);for(const e of row.history)history.append(el('p','Versión '+e.version+' · '+statusLabel(e.status)+' · '+e.actorLabel+' · '+at(e.recordedAt)+(e.reason?' · '+e.reason:'')));card.append(history);
  const actions=el('div');actions.className='nleave-actions';
  const add=(label,cmd)=>{const b=el('button',label);b.type='button';b.dataset.nleaveRowAction=cmd;b.addEventListener('click',()=>cmd==='update_draft'?beginDraft('request',row):beginDecision(row,cmd));actions.append(b);};
  if(row.canUpdate)add('Editar borrador','update_draft');if(row.canSubmit)add('Enviar a revisión','submit');if(row.canReview){add(profile?'Aprobar saldo':'Aprobar solicitud',profile?'profile_approve':'approve');add('Rechazar',profile?'profile_reject':'reject');}if(row.canCancel)add('Cancelar solicitud','cancel');card.append(actions);return card;
 }
 function drawRequests(){
  if(!bootstrap)return;const search=$('[data-nleave-search]').value.trim().toLocaleLowerCase('es'),filter=$('[data-nleave-filter]').value;
  const rows=bootstrap.requests.filter(r=>(!filter||r.status===filter)&&(!search||(reasonLabel(r.payload.reasonCode)+' '+statusLabel(r.status)).toLocaleLowerCase('es').includes(search)));const total=Math.max(1,Math.ceil(rows.length/20));page=Math.max(1,Math.min(total,page));$('[data-nleave-requests]').replaceChildren(...rows.slice((page-1)*20,page*20).map(r=>card(r)));if(!rows.length)$('[data-nleave-requests]').append(el('p','No hay solicitudes para esta vista.'));
  $('[data-nleave-count]').textContent=bootstrap.requests.length+' solicitudes consultadas completas · '+rows.length+' en esta vista. La búsqueda y la página no recortan los saldos.';$('[data-nleave-page]').textContent='Página '+page+' de '+total;$('[data-nleave-prev]').disabled=busy||page===1;$('[data-nleave-next]').disabled=busy||page===total;
 }
 function render(){
  if(!bootstrap)return;$('[data-nleave-content]').hidden=false;$('[data-nleave-source]').textContent='Legajo '+bootstrap.subject.legajo+' · '+bootstrap.subject.employeeName+' · consulta completa del contrato propio.';
  $('[data-nleave-balances]').replaceChildren(...bootstrap.balances.map(p=>{const c=el('article');c.append(el('h5',reasonLabel(p.reasonCode)+' · '+p.year),el('p',NATIVE_LEAVE_UNITS[p.durationUnit]+' · '+(p.mode==='unavailable'?'Sin declaración aprobada':p.mode==='not_applicable'?'Saldo no aplicable con respaldo':'Total: '+p.entitledUnits+' · Disponible: '+p.availableUnits)),el('p','Reservadas: '+p.reservedUnits+' · Aprobadas: '+p.approvedUnits));return c;}));if(!bootstrap.balances.length)$('[data-nleave-balances]').append(el('p','No hay declaraciones aprobadas ni solicitudes. El saldo no está informado.'));
  $('[data-nleave-profiles]').replaceChildren(...bootstrap.profileProposals.map(r=>card(r,true)));drawRequests();controls();
 }
 async function load(){
  if(busy||closed)return;const seq=++epoch;controller?.abort();controller=new AbortController();busy=true;controls();say('Consultando licencias, saldos y permisos…');
  try{await authority(seq);await fresh(seq);if(!valid(seq))return;render();say(state.pending?'Hay un envío sin confirmar. Consultá su resultado.':'Consulta completa. Los saldos no implican cálculo de haberes.');}catch(error){if(valid(seq))failure(error);}finally{if(valid(seq)){busy=false;controls();drawRequests();}}
 }
 function beginDecision(row,command){
  if(busy||closed||state.pending||!bootstrap)return;const permitted=command==='submit'?row.canSubmit:command==='cancel'?row.canCancel:row.canReview;if(!permitted)return;
  draft=null;$('[data-nleave-form]').hidden=true;decision={row:structuredClone(row),command,source:structuredClone(bootstrap)};$('[data-nleave-decision]').hidden=false;$('[data-nleave-decision-title]').textContent=({submit:'Enviar solicitud a revisión',approve:'Aprobar solicitud',reject:'Rechazar solicitud',cancel:'Cancelar solicitud',profile_approve:'Aprobar declaración de saldo',profile_reject:'Rechazar declaración de saldo'})[command];$('[data-nleave-comparison]').replaceChildren(card({...row,canUpdate:false,canSubmit:false,canReview:false,canCancel:false},command.startsWith('profile_')));$('[data-nleave-reason]').value='';$('[data-nleave-evidence]').value='';$('[data-nleave-evidence-label]').hidden=command!=='approve';$('[data-nleave-evidence] option[value="not_required"]').disabled=row.payload.confidentiality!=='standard';$('[data-nleave-decision-checked]').checked=false;controls();$('[data-nleave-reason]').focus();
 }
 function envelope(source,command,payload,entity=null,reason=null,evidenceStatus=null){return nativeLeaveCommand({contractId,identityToken:source.subject.identityToken,scopeVersion:source.scopeVersion,employmentVersion:source.employment.version,snapshotVersion:source.snapshotVersion,command,entityId:entity?.id??null,expectedVersion:entity?.version??0,payload,reason,evidenceStatus,manualValidationConfirmed:['approve','profile_approve'].includes(command)});}
 function freshMatches(attempt,b){
  const body=attempt.body.payload;if(body.scopeVersion!==b.scopeVersion||body.identityToken!==b.subject.identityToken||body.employmentVersion!==b.employment.version||body.snapshotVersion!==b.snapshotVersion)throw issue('REVIEW_CHANGED',409,'Cambió el historial laboral, las solicitudes o el saldo. Actualizá y revisá los valores antes de preparar otro envío.');
  if(body.entityId){const row=[...b.requests,...b.profileProposals].find(r=>r.id===body.entityId);const permitted=body.command==='update_draft'?row?.canUpdate:body.command==='submit'?row?.canSubmit:body.command==='cancel'?row?.canCancel:row?.canReview;if(!row||!permitted||!nativeLeaveSame(row.payload,attempt.entity.payload)||!nativeLeaveSame(row.history,attempt.entity.history))throw issue('FORBIDDEN',403);}
  else if(body.command==='create'?!b.permissions.canCreate:!b.permissions.canProposeProfile)throw issue('FORBIDDEN',403);
 }
 async function begin(body,entity=null){
  if(busy||closed||state.pending)return;const seq=epoch,bytes=JSON.stringify({operation:'command',payload:body});busy=true;controls();
  try{const fingerprint=await hash(body);if(!valid(seq)||state.pending)return;state.pending={actor:state.actor,scope:state.scope,key:crypto.randomUUID(),body:JSON.parse(bytes),bytes,fingerprint,entity:entity?structuredClone(entity):null,uncertain:false,retryReady:false};}
  catch(error){if(valid(seq))failure(error);}finally{if(valid(seq)){busy=false;controls();}}
  if(valid(seq)&&state.pending)await send();
 }
 async function send(recover=false){
  if(busy||closed||!state.pending)return;const seq=epoch,attempt=state.pending;busy=true;controls();say(recover?'Consultando la confirmación original…':'Guardando la operación revisada…');let started=false,confirmed=false;
  try{
   await authority(seq);if(attempt.actor!==state.actor||attempt.scope!==state.scope)throw issue('ACTOR_CHANGED',409);
   let receipt;
   if(recover){receipt=await request(API+'?'+new URLSearchParams({resource:'attempt',contractId,key:attempt.key}));}
   else{
    const b=await fresh(seq);if(!valid(seq))return;if(!attempt.uncertain)freshMatches(attempt,b);else if(b.scopeVersion!==attempt.body.payload.scopeVersion)throw issue('ACTOR_CHANGED',409);
    started=true;receipt=await request(API,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':attempt.key},body:attempt.bytes});
   }
   if(!valid(seq))return;validateNativeLeaveReceipt(receipt,contractId,attempt.body.payload);if(receipt.requestSha256!==attempt.fingerprint)throw issue('CONTRACT_INVALID',503);
   state.pending=null;draft=null;decision=null;$('[data-nleave-form]').hidden=true;$('[data-nleave-decision]').hidden=true;confirmed=true;
  }catch(error){if(!valid(seq))return;if(recover||attempt.uncertain||started&&(!error.status||error.status>=500||[401,403].includes(error.status))){attempt.uncertain=true;attempt.retryReady=recover&&error.status===404;}else state.pending=null;failure(error);if(bootstrap)render();}
  finally{if(valid(seq)){busy=false;controls();}}
  if(confirmed&&valid(seq)){await load();if(valid(epoch)&&bootstrap)say('Operación confirmada. Se conserva el historial. No se modificaron haberes ni pagos.');}
 }
 $('[data-nleave-refresh]').addEventListener('click',load);$('[data-nleave-create]').addEventListener('click',()=>beginDraft('request'));$('[data-nleave-profile]').addEventListener('click',()=>beginDraft('profile'));
 $('[data-nleave-form]').addEventListener('submit',event=>{event.preventDefault();if(busy||closed||state.pending||!draft||!$('[data-nleave-checked]').checked)return;try{const body=envelope(draft.source,draft.kind==='profile'?'profile_propose':draft.entity?'update_draft':'create',values(),draft.entity,draft.kind==='profile'?draft.values.reason:null);begin(body,draft.entity);}catch(error){say(error.message,true);}});
 $('[data-nleave-decision]').addEventListener('submit',event=>{event.preventDefault();if(busy||closed||state.pending||!decision||!$('[data-nleave-decision-checked]').checked)return;try{begin(envelope(decision.source,decision.command,null,decision.row,$('[data-nleave-reason]').value.normalize('NFC').trim(),decision.command==='approve'?$('[data-nleave-evidence]').value:null),decision.row);}catch(error){say(error.message,true);}});
 for(const name of ['checked','decision-checked'])$('[data-nleave-'+name+']').addEventListener('change',controls);
 for(const name of ['reason','evidence'])$('[data-nleave-'+name+']').addEventListener('input',()=>{$('[data-nleave-decision-checked]').checked=false;controls();});
 $('[data-nleave-discard]').addEventListener('click',()=>{if(busy||state.pending)return;draft=null;$('[data-nleave-form]').hidden=true;$('[data-nleave-fields]').replaceChildren();controls();});
 $('[data-nleave-decision-close]').addEventListener('click',()=>{if(busy||state.pending)return;decision=null;$('[data-nleave-decision]').hidden=true;$('[data-nleave-comparison]').replaceChildren();controls();});
 for(const name of ['search','filter'])$('[data-nleave-'+name+']').addEventListener(name==='search'?'input':'change',()=>{page=1;drawRequests();});
 $('[data-nleave-prev]').addEventListener('click',()=>{if(!busy&&page>1){page--;drawRequests();}});$('[data-nleave-next]').addEventListener('click',()=>{if(!busy){page++;drawRequests();}});
 $('[data-nleave-recover]').addEventListener('click',()=>send(true));$('[data-nleave-retry]').addEventListener('click',()=>{if(state.pending?.retryReady)send();});
 function revoked(event){const raw=event.detail?.tenantCapabilities,caps=raw instanceof Set?[...raw]:raw;if(Array.isArray(caps)&&authorityCaps.some(cap=>(cap==='workforce.employee.read'||cap==='actions.read'||cap.startsWith('leave.request.'))&&!caps.includes(cap)))close();}
 function close(){if(closed)return;closed=true;epoch++;controller?.abort();if(state.pending){state.pending.uncertain=true;state.pending.retryReady=false;}clearVisible();controls();say('Se retiraron los datos. Cerrá y volvé a abrir la ficha para comprobar acceso y recuperar un envío pendiente.');active.delete(close);document.removeEventListener('mc:native-employment-change-close',close);document.removeEventListener('municontrol:capabilities-ready',revoked);}
 active.add(close);document.addEventListener('mc:native-employment-change-close',close);document.addEventListener('municontrol:capabilities-ready',revoked);load();return{close};
}
