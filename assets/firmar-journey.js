// UI coordinator for an enrolled FirmAR integration. No PIN/OTP fields, provider
// fetches, PDF upload, persistent browser storage or signature decision in this code.
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
export function createFirmarJourney({begin,readStatus,onChange,openWindow,origin,
 timer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),now=()=>Date.now(),isVisible=()=>true,maxChecks=30}={}){
 if(typeof begin!=='function'||typeof readStatus!=='function'||typeof onChange!=='function'||typeof openWindow!=='function'
    ||!/^https:\/\//.test(origin||'')||!Number.isInteger(maxChecks)||maxChecks<1||maxChecks>60)throw Error('FIRMAR_JOURNEY_CONFIGURATION');
 let current=null,windowRef=null,controller=null,timerId=null,generation=0,checks=0,errors=0,polling=false,disposed=false;
 let fallback=null;
 const clear=()=>{if(timerId!==null){clearTimer(timerId);timerId=null;}};
 const emit=(state,extra={})=>onChange({state,label:FIRMAR_JOURNEY_COPY[state],
   requestId:current?.requestId??null,attemptId:current?.attemptId??null,officialEmissionEnabled:false,...extra});
 const shutPopup=()=>{try{if(windowRef&&!windowRef.closed)windowRef.close();}catch{}windowRef=null;};
 function pause(){clear();emit('paused');}
 function schedule(ms){clear();if(!disposed&&current)timerId=timer(()=>{timerId=null;void poll();},ms);}
 async function poll({manual=false}={}){
  if(disposed||!current||polling)return;
  if(!isVisible()){clear();return;}
  if(!manual&&(checks>=maxChecks||Date.parse(current.expiresAt)<=now())){pause();return;}
  const g=generation,expected=current;polling=true;checks++;
  try{
   const reply=await readStatus({requestId:expected.requestId,attemptId:expected.attemptId,signal:controller.signal});
   if(g!==generation||disposed)return;
   const value=verifyFirmarJourneyStatus(reply,expected);errors=0;emit(value.state,{documentSha256:value.documentSha256});
   if(terminal.has(value.state)){clear();shutPopup();return;}
   schedule(checks<6?5000:15000);
  }catch(error){
   if(g!==generation||disposed)return;
   if([401,403].includes(error?.status)){clear();controller.abort();shutPopup();current=null;emit('session_lost');return;}
   errors++;if(errors>=3){pause();return;}schedule(15000);
  }finally{if(g===generation)polling=false;}
 }
 async function start({requestId,expectedVersion}){
  if(disposed||current||!uuid(requestId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw Error('FIRMAR_START_INVALID');
  const g=++generation;controller=new AbortController();current={requestId,attemptId:null,expiresAt:null};fallback=null;checks=0;errors=0;
  try{windowRef=openWindow();if(windowRef){windowRef.opener=null;windowRef.document.title='MuniControl · Preparando firma';
    const text=windowRef.document.createElement('p');text.textContent='Preparando el acceso al servicio oficial. Mantené MuniControl abierto.';
    windowRef.document.body.replaceChildren(text);}}catch{shutPopup();}
  emit('preparing');
  try{
   const reply=await begin({requestId,expectedVersion,signal:controller.signal});
   if(g!==generation||disposed)return;
   if(reply?.requestId!==requestId||!uuid(reply.attemptId)||reply.state!=='awaiting_authorization'
       ||reply.officialEmissionEnabled!==false||!Number.isFinite(Date.parse(reply.expiresAt))||Date.parse(reply.expiresAt)<=now()
       ||Date.parse(reply.expiresAt)>now()+30*60000)throw Error('FIRMAR_START_RESPONSE_INVALID');
   const url=safeFirmarLaunchUrl(reply.authorizationUrl);current={requestId,attemptId:reply.attemptId,expiresAt:reply.expiresAt};
   let popupOpen=false;try{popupOpen=Boolean(windowRef&&!windowRef.closed);if(popupOpen)windowRef.location.replace(url);}catch{popupOpen=false;shutPopup();}
   fallback=popupOpen?null:url;emit('awaiting_authorization',{sameTabUrl:fallback,externalService:true});schedule(5000);
  }catch(error){
   if(g!==generation||disposed)return;clear();shutPopup();
   if(error?.code==='FIRMAR_SUBMISSION_OUTCOME_UNKNOWN'){current={requestId,attemptId:null,expiresAt:null};emit('outcome_unknown');}
   else{current=null;emit([401,403].includes(error?.status)?'session_lost':'failed');}
  }
 }
 function refresh(){if(disposed||!current?.attemptId||polling)return;clear();void poll({manual:true});}
 function resume({requestId,attemptId,expiresAt}){
  if(disposed||current||!uuid(requestId)||!uuid(attemptId)||!Number.isFinite(Date.parse(expiresAt)))throw Error('FIRMAR_RESUME_INVALID');
  generation++;controller=new AbortController();current={requestId,attemptId,expiresAt};checks=0;errors=0;
  emit('checking');void poll({manual:true});
 }
 function focusAuthorization(){try{if(windowRef&&!windowRef.closed){windowRef.focus();return true;}}catch{}return false;}
 function notice(event){
  // Browser return/message is only a refresh hint; never use it as a proof of signing.
  if(event?.origin!==origin||event?.data?.type!=='municontrol:firmar-return'||event.data.attemptId!==current?.attemptId)return;
  refresh();
 }
 function dispose(){disposed=true;generation++;clear();controller?.abort();shutPopup();current=null;fallback=null;polling=false;}
 function sessionLost(){generation++;clear();controller?.abort();shutPopup();current=null;fallback=null;polling=false;emit('session_lost');}
 return Object.freeze({start,resume,refresh,notice,dispose,sessionLost,focusAuthorization,get busy(){return Boolean(current);}});
}
export function firmarReturnNotice({attemptId}){
 if(!uuid(attemptId))throw Error('FIRMAR_RETURN_INVALID');
 return Object.freeze({type:'municontrol:firmar-return',attemptId});
}
