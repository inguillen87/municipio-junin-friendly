// Orchestration only: real authority and application remain in the owner API.
import {adoptionPreparationBootstrap,adoptionFinalSources,adoptionMixedSources} from './employment-adoption-preparation-model.js';
import {verifiedAdoptionReview,adoptionReviewJson,adoptionReviewScope} from './employment-adoption-review-model.js';
import {ownerDecisionExpectedSource,ownerDecisionPreview,ownerDecisionCommand,ownerDecisionAttempt} from './municipal-adoption-owner-decision-model.js';

const API='/api/internal-municipal-owner-adoption',PREPARATION='/api/internal-employment-adoption';
const equal=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
const error=(message,status=0,code='OWNER_WORKSPACE_INVALID')=>Object.assign(Error(message),{status,code});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const sha=(v,n=64)=>typeof v==='string'&&v.length===n&&/^[a-f0-9]+$/.test(v);
export const OWNER_SOURCE_MODES=Object.freeze([
 ['mixed-bootstrap','Activos conocidos; conservar los pendientes aparte'],
 ['operational-bootstrap','Personal activo con fecha de ingreso'],['registry-bootstrap','Personal activo con datos originales'],
 ['final-active-bootstrap','Personal activo completo'],['final-bootstrap','Fuente histórica completa'],
].map(Object.freeze));
export function ownerWorkspaceAuthority(value){
 const s=value?.scope,a=value?.authority,p=a?.actor;
 if(!exact(value,['scope','authority'])||!exact(s,['tenantId','membershipId','bindingId','companyId'])||![s.tenantId,s.membershipId,s.bindingId].every(uuid)||!Number.isSafeInteger(s.companyId)||s.companyId<1
  ||!exact(a,['version','policyVersion','policySha256','actor'])||a.version!=='municipal-adoption-owner-authority.v1'||a.policyVersion!=='tenant-owner-adoption-policy.v1'||!sha(a.policySha256)
  ||!exact(p,['personId','email','identityVersion','sessionId','sessionVersion','releaseSha'])||![p.personId,p.sessionId].every(uuid)||typeof p.email!=='string'||p.email!==p.email.trim().toLowerCase()||!/^[^\s@]+@[^\s@]+$/.test(p.email)
  ||![p.identityVersion,p.sessionVersion].every(v=>Number.isSafeInteger(v)&&v>0)||!sha(p.releaseSha,40))throw error('No se verificó la autorización del propietario.',403);
 return Object.freeze(structuredClone(value));
}
const samePrincipal=(a,b)=>equal(a.scope,b.scope)&&a.authority.actor.personId===b.authority.actor.personId&&a.authority.actor.email===b.authority.actor.email&&a.authority.policyVersion===b.authority.policyVersion&&a.authority.policySha256===b.authority.policySha256;
export async function ownerWorkspaceJson(response,maxBytes=8500000){
 const length=response.headers?.get('content-length');if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBytes))throw error('La respuesta completa supera la capacidad. No se mostraron datos parciales.');
 let text='';
 if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let total=0;try{for(;;){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes)throw error('La respuesta completa supera la capacidad. No se mostraron datos parciales.');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}
 else{text=await response.text();if(new TextEncoder().encode(text).length>maxBytes)throw error('La respuesta completa supera la capacidad. No se mostraron datos parciales.');}
 let value;try{value=JSON.parse(text);}catch{throw error('No se pudo verificar la respuesta completa. Consultá el mismo intento.');}
 if(!response.ok||value.ok!==true){const status=response.status,code=typeof value.code==='string'?value.code:'';throw error(status===401?'La sesión venció. Volvé a ingresar y consultá el mismo intento.':status===403?'Tu autorización vigente no permite aprobar como propietario.':status===404?'No se encontró la propuesta o el mismo intento en tu ámbito.':status===409?'Hay otra operación o cambió la propuesta. Conservá el mismo intento y volvé a consultar.':'No se confirmó la operación. Consultá el mismo intento antes de repetirla.',status,code);}
 return value.data;
}
export function createOwnerAdoptionWorkspace({request=globalThis.fetch,randomUUID=()=>crypto.randomUUID(),isLive=()=>true,onChange=()=>{}}={}){
 let state={busy:false,context:null,history:null,sources:null,proposal:null,review:null,preview:null,pending:null,retryReady:false,receipt:null,message:'Consultá tu autorización y tus propuestas. Abrir este apartado no aplica cambios.'},epoch=0,controller=null;
 const publish=patch=>{state={...state,...patch};onChange(Object.freeze({...state}));},current=token=>epoch===token&&isLive();
 const requireIdle=()=>{if(state.busy||!isLive())throw error('Volvé a abrir este apartado para continuar.');};
 const requireNoPending=()=>{if(state.pending)throw error('Consultá el mismo intento antes de abrir otra propuesta.');};
 async function read(url,signal,init={}){
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(30000)]);deadline.throwIfAborted();
  const value=await ownerWorkspaceJson(await request(url,{credentials:'same-origin',cache:'no-store',...init,headers:{Accept:'application/json',...init.headers},signal:deadline}));
  deadline.throwIfAborted();return value;
 }
 async function authority(signal,expected){const value=ownerWorkspaceAuthority(await read(API+'?resource=authority',signal));if(expected&&!samePrincipal(value,expected))throw error('Cambió la cuenta o el municipio. Recuperá el intento con su acceso original.',403);return value;}
 async function operation(message,fn){requireIdle();controller=new AbortController();const token=++epoch,signal=controller.signal;publish({busy:true,message});try{return await fn({signal,token,check:()=>{if(!current(token))throw error('Se retiró la consulta al cambiar de pantalla.');}});}catch(e){if(['AbortError','TimeoutError'].includes(e?.name))e=error(state.pending?'La confirmación se interrumpió. Conservamos el contenido y la clave; consultá el resultado del mismo intento antes de reenviar.':'La consulta se interrumpió. Volvé a consultar la autorización y la propuesta antes de confirmar; no se envió ninguna decisión.',0,'OWNER_WORKSPACE_INTERRUPTED');if(current(token))publish({preview:null,...([401,403].includes(e.status)?{context:null,history:null,review:null,proposal:null,sources:null}:{}),message:e.status===404&&state.retryReady?'El servidor no encontró el mismo intento. Podés reenviar su contenido y clave originales.':e.message});throw e;}finally{if(epoch===token)publish({busy:false});}}
 async function previewFor(signal,context,proposal,review){
  if(review.sourceContextVersion!==proposal.sourceContextVersion)throw error('El corte y el alcance elegidos no corresponden a esta propuesta. Elegí su respaldo original; no se reemplazó por el padrón actual.');
  const source=ownerDecisionExpectedSource(review.source.finalRevision),value=await ownerDecisionPreview(await read(API+'?'+new URLSearchParams({resource:'preview',id:proposal.proposalId,source:JSON.stringify(source)}),signal),{...context,source});
  if(value.proposal.proposalId!==proposal.proposalId||value.proposal.sourceContextVersion!==proposal.sourceContextVersion||value.proposal.catalogVersion!==proposal.catalogVersion||value.proposal.total!==proposal.total)throw error('Cambió la propuesta. Volvé a consultar sus antecedentes completos.');return value;
 }
 async function load(){requireNoPending();return operation('Consultando la autorización del servidor y las propuestas propias…',async({signal,check})=>{
  const context=await authority(signal);check();const history=await adoptionPreparationBootstrap(await read(PREPARATION+'?resource=bootstrap',signal));check();const after=await authority(signal,context);check();
  if(!equal(after,context)||adoptionReviewScope(history.review.scope)!==adoptionReviewScope(context.scope))throw error('Cambió el ámbito durante la consulta.',403);
  publish({context,history,sources:null,proposal:null,review:null,preview:null,receipt:null,retryReady:false,message:history.attempts.length?'Elegí una propuesta y su respaldo original para revisar la aprobación del propietario.':'No hay propuestas propias guardadas. Prepará una propuesta completa antes de aprobar.'});return state;
 });}
 function selectProposal(id){requireIdle();requireNoPending();const proposal=state.history?.attempts.find(a=>a.receipt.proposalId===id)?.receipt;if(!proposal)throw error('Esta propuesta no figura entre tus comprobantes propios.');publish({proposal,review:null,preview:null,receipt:null,message:'Elegí expresamente el corte y el alcance originales, o usá la revisión completa visible si coincide.'});}
 async function loadSources(mode){requireNoPending();return operation('Consultando los cortes disponibles para el alcance elegido…',async({signal,check})=>{if(!state.proposal||!state.context||!['mixed','legacy'].includes(mode))throw error('Elegí una propuesta y un alcance explícito.');const context=await authority(signal,state.context);check();const value=(mode==='mixed'?adoptionMixedSources:adoptionFinalSources)(await read(PREPARATION+'?resource='+(mode==='mixed'?'mixed-sources':'final-sources'),signal));check();const after=await authority(signal,context);check();if(!equal(after,context)||adoptionReviewScope(value.scope)!==adoptionReviewScope(context.scope))throw error('Cambió la autorización o el ámbito de los cortes disponibles.',403);publish({context,sources:value,preview:null,review:null,message:value.total?'Elegí el corte original entre los disponibles para este alcance. No se eligió uno automáticamente.':'No hay cortes disponibles para este alcance. No se sustituyó el respaldo de la propuesta.'});return value;});}
 async function useReview(input){requireNoPending();return operation('Verificando la misma propuesta y su respaldo completo…',async({signal,check})=>{if(!state.proposal||!state.context)throw error('Consultá tu autorización y elegí una propuesta propia.');const context=await authority(signal,state.context);check();const review=await verifiedAdoptionReview(input);check();const preview=await previewFor(signal,context,state.proposal,review);check();publish({context,review,preview,message:'Antecedentes completos verificados. Esta decisión es del propietario y no constituye una revisión independiente.'});return preview;});}
 async function chooseSource(source,mode){requireNoPending();return operation('Consultando el corte y el alcance elegidos…',async({signal,check})=>{if(!state.proposal||!state.context||!OWNER_SOURCE_MODES.some(([m])=>m===mode)||!state.sources?.rows.some(r=>equal(r,source))||(mode==='mixed-bootstrap')!==(state.sources.version==='employment-adoption-final-sources.v2'))throw error('Elegí un respaldo disponible y un alcance explícito.');const context=await authority(signal,state.context);check();const value=await adoptionPreparationBootstrap(await read(PREPARATION+'?'+new URLSearchParams({resource:mode,revisionId:source.revisionId,packageSha256:source.packageSha256}),signal));check();const preview=await previewFor(signal,context,state.proposal,value.review);check();publish({context,review:value.review,preview,message:'Propuesta y respaldo originales verificados. Revisá todos los contratos antes de confirmar como propietario.'});return preview;});}
 async function validateStored(raw,pending){
  if(!exact(raw,['version','preview','command','attempt'])||raw.version!=='municipal-adoption-owner-stored.v1')throw error('No se verificó el comprobante completo. Consultá el mismo intento.');
  const preview=await ownerDecisionPreview(raw.preview,{scope:pending.context.scope,authority:pending.preview.authority,source:pending.preview.review.source.finalRevision});
  if(!equal(raw.command,pending.command)||preview.previewSha256!==pending.preview.previewSha256)throw error('El comprobante no corresponde al mismo contenido. Conservá el intento.');
  return ownerDecisionAttempt(raw.attempt,{preview,command:pending.command,key:pending.key});
 }
 async function send({reason,reviewConfirmed}={}){requireNoPending();return operation('Revalidando la autorización y la propuesta antes de aplicar…',async({signal,check})=>{
  if(!state.preview||!state.context||reviewConfirmed!==true)throw error('Revisá la propuesta completa y confirmá expresamente la decisión del propietario.');
  const context=await authority(signal,state.context);check();const preview=await previewFor(signal,context,state.proposal,state.review);check();if(!equal(context,state.context)||preview.previewSha256!==state.preview.previewSha256)throw error('Cambió la autorización o la propuesta. Revisá la previa nuevamente.');
  const command=ownerDecisionCommand({version:'municipal-adoption-owner-command.v1',operation:'approve_owner',...Object.fromEntries(['proposalId','proposalVersion','sourceContextVersion','catalogVersion'].map(k=>[k,preview.proposal[k]])),reviewVersion:preview.reviewVersion,previewSha256:preview.previewSha256,reason,reviewConfirmed:true},{preview});
  const key=randomUUID();if(typeof key!=='string'||key.length!==36||!(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/).test(key))throw error('No se pudo crear una referencia válida para el intento.');
  const pending=Object.freeze({key,command,bytes:JSON.stringify({operation:'approve_owner',payload:command}),context,preview});publish({pending,retryReady:false});return transmit(pending,signal,check,false);
 });}
 async function transmit(pending,signal,check,recover){
  const raw=await read(API+(recover?'?'+new URLSearchParams({resource:'attempt',key:pending.key}):''),signal,recover?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:pending.bytes});
  const first=await validateStored(raw,pending);check();await authority(signal,pending.context);check();const confirmed=await validateStored(await read(API+'?'+new URLSearchParams({resource:'attempt',key:pending.key}),signal),pending);check();
  if(first.bodySha256!==confirmed.bodySha256||first.receipt.decisionId!==confirmed.receipt.decisionId)throw error('No se confirmó el mismo resultado. Conservá el intento.');
  publish({pending:null,retryReady:false,preview:null,review:null,proposal:null,history:null,sources:null,receipt:confirmed.receipt,message:`Adopción confirmada por el propietario: ${confirmed.receipt.total} contratos. Se conservaron identidades e historial; no se calcularon sueldos ni pagos.`});return confirmed.receipt;
 }
 async function recover(){if(!state.pending)throw error('No hay un intento pendiente en esta página.');return operation('Consultando el resultado del mismo intento…',async({signal,check})=>{const pending=state.pending;await authority(signal,pending.context);check();try{return await transmit(pending,signal,check,true);}catch(e){if(e.status===404){check();publish({retryReady:true,message:'El servidor no encontró el mismo intento. Podés reenviar su contenido y clave originales.'});}throw e;}});}
 async function retry(){if(!state.pending||!state.retryReady)throw error('Consultá primero el resultado del mismo intento.');return operation('Reenviando exactamente la misma decisión…',async({signal,check})=>{const pending=state.pending;await authority(signal,pending.context);check();publish({retryReady:false});return transmit(pending,signal,check,false);});}
 function invalidate(message='Datos retirados. Consultá nuevamente; cualquier intento conserva su contenido y clave.'){++epoch;controller?.abort();publish({busy:false,context:null,history:null,sources:null,proposal:null,review:null,preview:null,retryReady:false,receipt:null,message});}
 function resetPreview(){requireIdle();requireNoPending();publish({review:null,preview:null,message:'Cambió la elección del respaldo. Volvé a verificar la propuesta completa antes de confirmar.'});}
 return{load,selectProposal,loadSources,useReview,chooseSource,send,recover,retry,invalidate,resetPreview,getState:()=>Object.freeze({...state})};
}
