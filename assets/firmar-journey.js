// UI coordinator for enrolled FirmAR. Its host supplies authorized durable requests.
// No provider credentials, document uploads or signature decision in the browser.
export const FIRMAR_JOURNEY_COPY=Object.freeze({
 checking:'Consultando tu solicitud guardada',preparing:'Preparando tu documento',awaiting_authorization:'Autorizá la firma en la ventana oficial',
 awaiting_receipt:'Esperando el documento firmado',received_unverified:'Documento recibido. Falta verificar la firma',
 validation_pending:'Verificando el documento recibido',verified:'Firma verificada. La emisión sigue su circuito',
 rejected:'La verificación requiere revisión',cancelled:'Solicitud cancelada',expired:'El intento venció',
 outcome_unknown:'Confirmación pendiente. No vuelvas a enviar el documento todavía',
 paused:'Seguimiento pausado. Tu solicitud permanece guardada',session_lost:'La sesión cambió. Volvé a ingresar',
 failed:'No se pudo iniciar la firma. Tu documento permanece guardado'
});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const terminal=new Set(['verified','rejected','cancelled','expired']);
const responseStates=new Set(['awaiting_authorization','awaiting_receipt','received_unverified','validation_pending','verified','rejected','cancelled','expired','outcome_unknown']);
const stageRank={awaiting_authorization:1,outcome_unknown:1,awaiting_receipt:2,received_unverified:3,validation_pending:4,verified:5,rejected:5,cancelled:5,expired:5};
export function safeFirmarLaunchUrl(value){
 if(typeof value!=='string'||value.length>400||/[\x00-\x20\x7f\\%?#]/.test(value))throw Error('FIRMAR_URL_INVALID');
 let url;try{url=new URL(value);}catch{throw Error('FIRMAR_URL_INVALID');}
 if(!['https://firmar.gob.ar','https://tst.firmar.gob.ar'].includes(url.origin)||url.username||url.password||url.search||url.hash
 ||!/^\/(?:firmador\/)?api\/signatures\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/?$/i.test(url.pathname))throw Error('FIRMAR_URL_INVALID');
 return url.href;
}
export function verifyFirmarJourneyStatus(value,expected){
 if(!value||value.requestId!==expected.requestId||value.attemptId!==expected.attemptId
    ||!responseStates.has(value.state)||value.officialEmissionEnabled!==false)throw Error('FIRMAR_STATUS_INVALID');
 if(value.state==='verified'){
  const required=['signatureIntegrity','certificateTrust','signerMatches','sourceMatches','temporalPolicySatisfied','requiredSignaturesComplete'];
  if(!value.validation||required.some(k=>value.validation[k]!==true)||!/^[a-f0-9]{64}$/.test(value.documentSha256||''))throw Error('FIRMAR_VALIDATION_NOT_CONFIRMED');
 }
 return {requestId:value.requestId,attemptId:value.attemptId,state:value.state,
   documentSha256:value.state==='verified'?value.documentSha256:null,officialEmissionEnabled:false};
}
export function createFirmarJourney({begin,readStatus,recoverAttempt,onChange,openWindow,origin,
 timer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),now=()=>Date.now(),isVisible=()=>true,maxChecks=30}={}){
 if(typeof begin!=='function'||typeof readStatus!=='function'||typeof onChange!=='function'||typeof openWindow!=='function'
    ||!/^https:\/\//.test(origin||'')||!Number.isInteger(maxChecks)||maxChecks<1||maxChecks>60
    ||recoverAttempt!==undefined&&typeof recoverAttempt!=='function')throw Error('FIRMAR_JOURNEY_CONFIGURATION');
 let current=null,windowRef=null,controller=null,timerId=null,generation=0,checks=0,errors=0,polling=false,disposed=false,recovering=false;
 let launchUrl=null,lastState=null,finished=false;
 const clear=()=>{if(timerId!==null){clearTimer(timerId);timerId=null;}};
 function popupAlive(){try{return Boolean(windowRef&&!windowRef.closed);}catch{return false;}}
 function mayAuthorize(){return Boolean(current?.attemptId&&launchUrl&&!finished&&stageRank[lastState]===1&&Date.parse(current.expiresAt)>now());}
 const emit=(state,extra={})=>onChange({state,label:FIRMAR_JOURNEY_COPY[state],
   requestId:current?.requestId??null,attemptId:current?.attemptId??null,officialEmissionEnabled:false,
   sameTabUrl:mayAuthorize()&&!popupAlive()?launchUrl:null,authorizationOpen:mayAuthorize()&&popupAlive(),
   canRecover:Boolean(current&&!current.attemptId&&recoverAttempt),canRetry:!current,...extra});
 const shutPopup=()=>{try{if(windowRef&&!windowRef.closed)windowRef.close();}catch{}windowRef=null;};
 function pause(){clear();emit('paused');}
 function schedule(ms){clear();if(!disposed&&current&&!finished)timerId=timer(()=>{timerId=null;void poll();},ms);}
 function openPreparingWindow(){
  try{windowRef=openWindow();if(windowRef){windowRef.opener=null;windowRef.document.title='MuniControl · Preparando firma';
   const text=windowRef.document.createElement('p');text.textContent='Preparando el acceso al servicio oficial. Mantené MuniControl abierto.';
   windowRef.document.body.replaceChildren(text);}}catch{shutPopup();}
 }
 function acceptReply(reply,requestId,{allowExpired=false}={}){
  if(reply?.requestId!==requestId||!uuid(reply.attemptId)||reply.officialEmissionEnabled!==false||!Number.isFinite(Date.parse(reply.expiresAt))
     ||!allowExpired&&Date.parse(reply.expiresAt)<=now()||Date.parse(reply.expiresAt)>now()+30*60000)throw Error('FIRMAR_START_RESPONSE_INVALID');
  const normalized=verifyFirmarJourneyStatus(reply,{requestId,attemptId:reply.attemptId});
  const nextUrl=reply.authorizationUrl==null?null:safeFirmarLaunchUrl(reply.authorizationUrl);
  if(normalized.state==='awaiting_authorization'&&Date.parse(reply.expiresAt)>now()&&!nextUrl)throw Error('FIRMAR_START_RESPONSE_INVALID');
  if(normalized.state!=='awaiting_authorization'&&nextUrl)throw Error('FIRMAR_START_RESPONSE_INVALID');
  if(normalized.state==='awaiting_authorization'&&Date.parse(reply.expiresAt)<=now())throw Error('FIRMAR_START_RESPONSE_INVALID');
  return {normalized,nextUrl,context:{requestId,attemptId:reply.attemptId,expiresAt:reply.expiresAt}};
 }
 function acceptStatus(value){
  // Old responses may neither reopen authorization nor replace a completed state.
  if(finished||lastState&&stageRank[value.state]<stageRank[lastState])return false;
  lastState=value.state;finished=terminal.has(value.state);
  if(stageRank[value.state]>=2||finished)launchUrl=null;
  emit(value.state,{documentSha256:value.documentSha256});
  if(finished){clear();shutPopup();}return true;
 }
 async function poll({manual=false}={}){
  if(disposed||!current?.attemptId||polling||finished)return;
  if(!isVisible()){clear();return;}
  if(!manual&&(checks>=maxChecks||Date.parse(current.expiresAt)<=now())){pause();return;}
  const g=generation,expected=current;polling=true;checks++;
  try{
   const reply=await readStatus({requestId:expected.requestId,attemptId:expected.attemptId,signal:controller.signal});
   if(g!==generation||disposed)return;
   const value=verifyFirmarJourneyStatus(reply,expected);errors=0;acceptStatus(value);
   if(!finished)schedule(checks<6?5000:15000);
  }catch(error){
   if(g!==generation||disposed)return;
   if([401,403].includes(error?.status)){sessionLost();return;}
   errors++;if(errors>=3){pause();return;}schedule(15000);
  }finally{if(g===generation)polling=false;}
 }
 async function start({requestId,expectedVersion}){
  if(disposed||current||!uuid(requestId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw Error('FIRMAR_START_INVALID');
  const g=++generation;controller=new AbortController();current={requestId,attemptId:null,expiresAt:null};launchUrl=null;checks=0;errors=0;finished=false;lastState=null;
  openPreparingWindow();emit('preparing');
  try{
   const reply=await begin({requestId,expectedVersion,signal:controller.signal});
   if(g!==generation||disposed)return;
   // A concurrent tab, early callback or recovered reservation can be ahead of this UI.
   // Accept the saved state, not only a new launch URL; never regress it or submit again.
   const accepted=acceptReply(reply,requestId,{allowExpired:true});current=accepted.context;launchUrl=accepted.nextUrl;
   if(accepted.normalized.state==='awaiting_authorization'){
    try{if(popupAlive())windowRef.location.replace(launchUrl);}catch{shutPopup();}
   }else shutPopup();
   acceptStatus(accepted.normalized);if(!finished)schedule(5000);
  }catch(error){
   if(g!==generation||disposed)return;clear();shutPopup();
   if([401,403].includes(error?.status)){sessionLost();return;}
   // Only an explicit, authorized proof of no submission permits a new begin.
   if(error?.safeToRetry===true&&error?.code==='FIRMAR_NOT_SUBMITTED'){current=null;emit('failed');return;}
   const invalid=/FIRMAR_(START_RESPONSE|URL)_INVALID/.test(String(error?.message));
   emit(invalid?'failed':'outcome_unknown',{label:FIRMAR_JOURNEY_COPY.outcome_unknown,canRetry:false});
  }
 }
 async function recover(){
  if(disposed||!current||current.attemptId||recovering||!recoverAttempt)return;
  const g=generation,requestId=current.requestId;recovering=true;emit('checking',{canRecover:false});
  try{
   const reply=await recoverAttempt({requestId,signal:controller.signal});
   if(g!==generation||disposed)return;
   // A missing/ambiguous server result is not proof that upload never happened.
   const accepted=acceptReply(reply,requestId,{allowExpired:true});current=accepted.context;launchUrl=accepted.nextUrl;
   lastState=null;checks=0;errors=0;acceptStatus(accepted.normalized);
   if(!finished)schedule(5000);
  }catch(error){
   if(g!==generation||disposed)return;
   if([401,403].includes(error?.status)){sessionLost();return;}
   emit('outcome_unknown',{canRetry:false});
  }finally{if(g===generation)recovering=false;}
 }
 function refresh(){
  if(disposed||!current||finished)return;
  if(!current.attemptId){void recover();return;}if(polling)return;clear();void poll({manual:true});
 }
 function resume({requestId,attemptId,expiresAt,authorizationUrl=null}){
  if(disposed||current||!uuid(requestId)||!uuid(attemptId)||!Number.isFinite(Date.parse(expiresAt)))throw Error('FIRMAR_RESUME_INVALID');
  const checkedUrl=authorizationUrl?safeFirmarLaunchUrl(authorizationUrl):null;
  generation++;controller=new AbortController();current={requestId,attemptId,expiresAt};launchUrl=checkedUrl;checks=0;errors=0;finished=false;lastState=null;
  emit('checking');void poll({manual:true});
 }
 function focusAuthorization(){
  if(!mayAuthorize())return false;
  if(popupAlive()){try{windowRef.focus();return true;}catch{shutPopup();}}
  // Called only from a user gesture. Reopens the exact authorized attempt, never begin().
  openPreparingWindow();try{if(popupAlive()){windowRef.location.replace(launchUrl);emit('awaiting_authorization');return true;}}catch{shutPopup();}
  emit('awaiting_authorization');return false;
 }
 function notice(event){
  if(event?.origin!==origin||event?.data?.type!=='municontrol:firmar-return'||event.data.attemptId!==current?.attemptId)return;
  refresh();
 }
 function dispose(){disposed=true;generation++;clear();controller?.abort();shutPopup();current=null;launchUrl=null;polling=false;recovering=false;}
 function sessionLost(){generation++;clear();controller?.abort();shutPopup();current=null;launchUrl=null;polling=false;recovering=false;finished=false;lastState=null;emit('session_lost');}
 return Object.freeze({start,resume,refresh,notice,dispose,sessionLost,focusAuthorization,recover,get busy(){return Boolean(current);}});
}
export function firmarReturnNotice({attemptId}){
 if(!uuid(attemptId))throw Error('FIRMAR_RETURN_INVALID');
 return Object.freeze({type:'municontrol:firmar-return',attemptId});
}
