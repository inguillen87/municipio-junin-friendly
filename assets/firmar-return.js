// Browser return is navigation only. Only the host's authenticated server resolver
// may associate the one-use state with a stored request. This never receives a PDF.
import {firmarReturnNotice} from './firmar-journey.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function takeFirmarReturnState(location,history){
 const raw=String(location.hash||''),hadQuery=Boolean(location.search);
 // Remove state before callbacks, status messages, analytics or other navigation.
 history.replaceState(null,'',location.pathname);
 if(hadQuery||!/^#[A-Za-z0-9_-]{43}$/.test(raw)||/[\x00-\x20]/.test(raw))throw Error('FIRMAR_RETURN_INVALID');
 return raw.slice(1);
}
export function verifyFirmarReturnBinding(value){
 if(!value||!uuid(value.requestId)||!uuid(value.attemptId)||value.state!=='return_bound'||value.officialEmissionEnabled!==false)
  throw Error('FIRMAR_RETURN_BINDING_INVALID');
 // Ignore provider flags and URLs even when accidentally present in a response.
 return Object.freeze({requestId:value.requestId,attemptId:value.attemptId,state:'return_bound',officialEmissionEnabled:false});
}
export function createFirmarReturn({resolveReturn,notifyHost,onChange,location,history,consumeState,now=()=>Date.now()}={}){
 if(typeof resolveReturn!=='function'||typeof notifyHost!=='function'||typeof onChange!=='function'||!location||!history)throw Error('FIRMAR_RETURN_CONFIGURATION');
 let token=null,controller=null,disposed=false,finished=false,running=false,generation=0,tries=0,createdAt=now();
 const emit=(state,extra={})=>{if(!disposed)onChange({state,officialEmissionEnabled:false,...extra});};
 try{token=consumeState?consumeState():takeFirmarReturnState(location,history);if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw Error('FIRMAR_RETURN_INVALID');}catch{finished=true;emit('invalid_return');}
 async function resume(){
  if(disposed||finished||running||!token)return;
  if(tries>=3||now()-createdAt>5*60000){finished=true;token=null;emit('return_expired');return;}
  const g=++generation;running=true;tries++;controller=new AbortController();emit('resolving_return');
  try{
   const response=await resolveReturn({returnState:token,signal:controller.signal});
   if(disposed||g!==generation)return;
   const binding=verifyFirmarReturnBinding(response);token=null;finished=true;
   // A message asks the original tab to query its server; it cannot assert success.
   try{notifyHost(firmarReturnNotice(binding));}catch{/* Link back remains usable without a channel. */}
   emit('return_bound',{requestId:binding.requestId,attemptId:binding.attemptId});
  }catch(error){
   if(disposed||g!==generation)return;
   if([401,403].includes(error?.status)){finished=true;token=null;emit('session_lost');}
   else if([404,409,410].includes(error?.status)){finished=true;token=null;emit('invalid_return');}
   else emit('return_retry',{retryAvailable:tries<3});
  }finally{if(g===generation)running=false;}
 }
 function dispose(){disposed=true;generation++;controller?.abort();token=null;running=false;}
 function sessionLost(){generation++;controller?.abort();token=null;finished=true;running=false;emit('session_lost');}
 return Object.freeze({resume,dispose,sessionLost});
}
