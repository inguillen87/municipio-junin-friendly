import {FAMILY_SELF_READ,FAMILY_SELF_SUBMIT,FAMILY_REVIEW_READ,FAMILY_REVIEW_WRITE,familyRequestUuid,familyRequestCommand,familyRequestList,familyRequestDetail,familyRequestReceipt,familyRequestSerialized} from './native-family-request-model.js';
const contexts=new Map(),API='/api/internal-native-family-requests';
const definiteRejections=new Set(['INPUT_INVALID','DOCUMENT_INVALID','STATE_CHANGED','VERSION_LIMIT','METADATA_TOO_LARGE','CAPACITY_FULL','REVISION_CONFLICT','DUPLICATE'].map(code=>'NATIVE_FAMILY_'+code));
const fail=(message,status=503,code='NATIVE_FAMILY_UNAVAILABLE')=>Object.assign(Error(message),{status,code});
export const familyCapabilities=(caps,required)=>required.every(k=>caps.includes(k));
export function familyWorkspaceAccess(auth){
 const tenant=auth?.access?.tenant,caps=auth?.access?.tenantCapabilities,email=auth?.user?.email;
 if(auth?.ok!==true||auth.authenticated!==true||auth.sessionVersion!==2||!familyRequestUuid(auth.user?.id)||typeof email!=='string'||!email.trim()||!familyRequestUuid(tenant?.id)||typeof tenant.roleKey!=='string'||!Array.isArray(caps)||caps.some(c=>typeof c!=='string')||!Number.isFinite(Date.parse(auth.expiresAt))||Date.parse(auth.expiresAt)<=Date.now())throw fail('La sesión cambió. Volvé a abrir el Centro de acciones.',401);
 return{key:familyRequestSerialized([auth.user.id,email.toLowerCase().trim(),tenant.id,tenant.roleKey]),tenantId:tenant.id,caps:[...caps]};
}
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function familyClientBodyHash(body){return digest(new TextEncoder().encode(familyRequestSerialized(body)));}

// Attempts remain only in this module's memory. They never enter a URL,
// storage, another account's context, a new key or a newly collected form.
export function createNativeFamilyClient({auth,view='self',fetch:transport=globalThis.fetch}={}){
 const initial=familyWorkspaceAccess(auth),readCaps=view==='self'?FAMILY_SELF_READ:FAMILY_REVIEW_READ,writeCaps=view==='self'?FAMILY_SELF_SUBMIT:FAMILY_REVIEW_WRITE;
 if(!['self','review'].includes(view)||!familyCapabilities(initial.caps,readCaps))throw fail('Tu cuenta no permite esta consulta familiar.',403);
 const contextKey=initial.key+'|'+view;let state={scope:null,pending:null};
 let epoch=0,controller=new AbortController(),active=true,currentCaps=initial.caps,submitting=false;
 const check=version=>{if(!active||version!==epoch)throw new DOMException('Consulta retirada','AbortError');};
 const url=query=>API+'?'+new URLSearchParams({view,...query});
 async function raw(endpoint,options={},binary=false){
  const response=await transport(endpoint,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:binary?'application/pdf':'application/json',...options.headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
  if(binary&&response.ok)return response;
  let body;try{const text=await response.text();if(new TextEncoder().encode(text).length>32*1024*1024)throw Error();body=JSON.parse(text);}catch{throw fail('No se pudo verificar la respuesta. El envío original se conserva.');}
  if(!response.ok||body?.ok!==true)throw fail(typeof body?.error==='string'?body.error:'No se confirmó la operación.',response.status,typeof body?.code==='string'?body.code:'NATIVE_FAMILY_UNAVAILABLE');return body;
 }
 async function authority(version,writing=false){const access=familyWorkspaceAccess(await raw('/api/internal-auth'));check(version);if(access.key!==initial.key||!familyCapabilities(access.caps,writing?writeCaps:readCaps))throw fail('Cambió la cuenta, el ámbito o sus permisos. Se retiraron los datos.',403,'NATIVE_FAMILY_FORBIDDEN');currentCaps=access.caps;}
 function pinScope(value){const scope=value?.scope;if(!scope||scope.tenantId!==initial.tenantId||!familyRequestUuid(scope.membershipId)||state.scope&&familyRequestSerialized(scope)!==familyRequestSerialized(state.scope))throw fail('Cambió el ámbito de la cuenta. Conservamos el envío original.',409,'NATIVE_FAMILY_SCOPE_CHANGED');return state.scope??freeze(structuredClone(scope));}
 function bindScope(scope){const verified=pinScope({scope});if(state.scope)return;const scopedKey=contextKey+'|'+familyRequestSerialized(verified);state=contexts.get(scopedKey)??{scope:verified,pending:null};contexts.set(scopedKey,state);}
 async function bootstrap(version,cursor=null,filter='submitted'){
  await authority(version);const q=view==='self'?{resource:'bootstrap'}:{resource:'queue',state:filter};if(cursor)q.cursor=JSON.stringify(cursor);const value=(await raw(url(q))).data;check(version);const verifiedScope=pinScope(value),result=familyRequestList(value,{scope:verifiedScope,view,cursor});await authority(version);bindScope(verifiedScope);return result;
 }
 async function detail(version,id){await authority(version);const value=(await raw(url({resource:'detail',id}))).data;check(version);const verifiedScope=pinScope(value),result=familyRequestDetail(value,{scope:verifiedScope,view,id});await authority(version);bindScope(verifiedScope);return result;}
 async function finish(version,value,attempt){
  const result=familyRequestReceipt(value,{key:attempt.key,body:attempt.body,bodySha256:attempt.bodySha256,scope:attempt.scope});await authority(version);check(version);if(state.pending?.attempt!==attempt)throw fail('Cambió el envío pendiente. Conservá su comprobante.',409,'NATIVE_FAMILY_PENDING');state.pending=null;return result;
 }
 async function send(version,attempt){await bootstrap(version,null);await authority(version,true);if(state.pending?.attempt!==attempt)throw fail('Cambió el envío pendiente. Conservá su comprobante.',409,'NATIVE_FAMILY_PENDING');if(familyRequestSerialized(state.scope)!==familyRequestSerialized(attempt.scope)||attempt.actorKey!==initial.key||attempt.view!==view)throw fail('El envío pertenece al ámbito original. No se puede reasignar.',409,'NATIVE_FAMILY_SCOPE_CHANGED');state.pending.lastRejection=null;try{const value=(await raw(url({}),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key,'X-Native-Family-Membership':attempt.scope.membershipId},body:JSON.stringify(attempt.body)})).data;check(version);return await finish(version,value,attempt);}catch(error){if(state.pending?.attempt===attempt&&definiteRejections.has(error.code))state.pending.lastRejection=freeze({code:error.code,message:error.message});throw error;}}
 async function submit(body){
  const version=epoch;check(version);if(state.pending||submitting)throw fail('Hay un envío sin comprobante. Consultalo antes de preparar otro.',409,'NATIVE_FAMILY_PENDING');submitting=true;
  try{
  await authority(version,true);const current=await bootstrap(version,null);if(state.pending)throw fail('Hay un envío sin comprobante. Consultalo antes de preparar otro.',409,'NATIVE_FAMILY_PENDING');const command=familyRequestCommand(body);
  if(view==='self'&&(!current.canSubmit||current.state!=='native'||current.subject.subjectVersion!==command.subjectVersion))throw fail('Cambió el contrato de tu cuenta. Actualizá la consulta.',409,'NATIVE_FAMILY_IDENTITY_CHANGED');
  let subject=current.subject,kind=command.payload?.kind;if(view==='review'){const fresh=await detail(version,command.requestId);if(!fresh.canReview||fresh.requestVersion!==command.expectedVersion)throw fail('Cambió la solicitud o no admite tu revisión. Consultala nuevamente.',409,'NATIVE_FAMILY_STATE_CHANGED');subject=fresh.subject;kind=fresh.kind;}
  const attempt=freeze({key:crypto.randomUUID(),body:structuredClone(command),bodySha256:await familyClientBodyHash(command),scope:structuredClone(state.scope),actorKey:initial.key,view,subject:structuredClone(subject),kind});check(version);if(state.pending)throw fail('Hay un envío sin comprobante. Consultalo antes de preparar otro.',409,'NATIVE_FAMILY_PENDING');state.pending={attempt,retryReady:false};return await send(version,attempt);
  }finally{submitting=false;}
 }
 async function recover(){
  const version=epoch;check(version);const pending=state.pending;if(!pending)throw fail('No hay un envío pendiente en esta cuenta.',409);pending.retryReady=false;await bootstrap(version,null);
  try{const value=(await raw(url({resource:'attempt',key:pending.attempt.key}),{headers:{'X-Native-Family-Membership':pending.attempt.scope.membershipId}})).data;check(version);return await finish(version,value,pending.attempt);}catch(error){check(version);if(error.status===404&&error.code==='NATIVE_FAMILY_NOT_FOUND'){await authority(version);pending.retryReady=true;}throw error;}
 }
 async function retry(){const version=epoch;check(version);const pending=state.pending;if(!pending?.retryReady)throw fail('Consultá primero el comprobante de este mismo envío.',409);pending.retryReady=false;return send(version,pending.attempt);}
 async function reviseRejected(){
  const version=epoch;check(version);const pending=state.pending;if(!pending?.retryReady||!pending.lastRejection||!definiteRejections.has(pending.lastRejection.code))throw fail('La preparación no tiene un rechazo y una consulta de comprobante verificados.',409);
  pending.retryReady=false;await bootstrap(version,null);await authority(version,true);
  // This GET takes the same server attempt lock as the command. A previous
  // NOT_FOUND is not sufficient evidence to release a preparation later.
  let missing=false;try{const value=(await raw(url({resource:'attempt',key:pending.attempt.key}),{headers:{'X-Native-Family-Membership':pending.attempt.scope.membershipId}})).data;check(version);const receipt=await finish(version,value,pending.attempt);throw Object.assign(fail('Se recuperó el comprobante del envío original. No se preparó otro.',409,'NATIVE_FAMILY_ALREADY_RECORDED'),{receipt});}catch(error){check(version);if(error.status===404&&error.code==='NATIVE_FAMILY_NOT_FOUND')missing=true;else throw error;}
  if(!missing)throw fail('No se verificó la ausencia del comprobante. Se conserva el envío original.');await authority(version,true);check(version);if(state.pending!==pending)throw fail('Cambió el envío pendiente. Conservá su comprobante.',409);
  state.previousAttempt=freeze({key:pending.attempt.key,bodySha256:pending.attempt.bodySha256,scope:structuredClone(pending.attempt.scope),command:pending.attempt.body.command,rejection:structuredClone(pending.lastRejection)});state.pending=null;return structuredClone(pending.attempt.body);
 }
 async function documentBytes(id,event){
  const version=epoch;check(version);if(!event?.document)throw fail('Esta versión no tiene un PDF adjunto.',404);
  const before=await bootstrap(version,null),first=await detail(version,id),expected=first.events.find(e=>e.requestVersion===event.requestVersion);
  if(!expected?.document||familyRequestSerialized(expected.document)!==familyRequestSerialized(event.document))throw fail('El documento no coincide con la revisión. Volvé a consultar.',409);
  let bytes;try{
   const response=await raw(url({resource:'document',id,requestVersion:String(event.requestVersion)}),{},true);check(version);
   if(!/^application\/pdf(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||response.headers.get('content-disposition')!=='attachment; filename="solicitud-familiar-'+id+'-v'+event.requestVersion+'.pdf"')throw fail('No se verificó el PDF solicitado.');
   bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==expected.document.byteLength||await digest(bytes)!==expected.document.sha256)throw fail('Los bytes del archivo no coinciden con esta versión.');
   const after=await bootstrap(version,null),last=await detail(version,id);check(version);
   if(after.page.contextVersion!==before.page.contextVersion||familyRequestSerialized(last.events.find(e=>e.requestVersion===event.requestVersion)?.document)!==familyRequestSerialized(expected.document))throw fail('Cambió el acceso o el documento durante la descarga.',409);
   return{bytes,filename:'solicitud-familiar-'+id+'-v'+event.requestVersion+'.pdf',originalFilename:event.document.filename};
  }catch(error){bytes?.fill(0);throw error;}
 }
 return{
  view,access:initial,get caps(){return [...currentCaps];},get pending(){return state.pending;},get previousAttempt(){return state.previousAttempt??null;},get scope(){return state.scope;},get ownOnly(){return view==='self'&&!initial.caps.includes('workforce.employee.read');},
  bootstrap:(cursor=null,filter='submitted')=>bootstrap(epoch,cursor,filter),detail:id=>detail(epoch,id),submit,recover,retry,reviseRejected,documentBytes,
  withdraw(){active=false;epoch++;controller.abort();},resume(){controller.abort();controller=new AbortController();active=true;epoch++;},
 };
}
