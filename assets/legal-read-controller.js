/** Single-flight, bounded private reads. No persistence, retries, writes or inferred permissions. */
export function createLegalReadController({read,canRead,onChange,timeoutMs=25000}) {
 if(typeof read!=='function'||typeof canRead!=='function'||typeof onChange!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('LEGAL_READ_CONFIGURATION_INVALID');
 let closed=false,revision=0,pending=null;
 const allowed=()=>{try{return !closed&&canRead()===true}catch{return false}};
 const emit=(phase,data=null,reason=null)=>onChange(Object.freeze({phase,data,reason}));
 const stop=(phase,reason)=>{if(closed)return;closed=true;revision++;pending?.controller.abort();emit(phase,null,reason)};
 function revoke(){stop('blocked','denied')}
 function dispose(){stop('disposed',null)}
 function load(){
  if(!allowed()){if(!closed)revoke();return Promise.resolve()}
  if(pending)return pending.promise;
  const current=++revision,controller=new AbortController(),job={controller,promise:null};
  pending=job;emit('loading');
  job.promise=(async()=>{
   let timer,abort;
   const cancelled=new Promise((_,reject)=>{abort=()=>reject(Object.assign(Error('cancelled'),{reason:'cancelled'}));controller.signal.addEventListener('abort',abort,{once:true});});
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Object.assign(Error('timeout'),{reason:'timeout'}));controller.abort()},timeoutMs)});
   try{
    const data=await Promise.race([Promise.resolve().then(()=>read(controller.signal)),deadline,cancelled]);
    if(current!==revision||closed)return;
    if(!allowed()){revoke();return}
    emit('ready',data);
   }catch(error){
    if(current!==revision||closed)return;
    if(!allowed()||error?.status===401||error?.status===403){revoke();return}
    emit('error',null,error?.reason==='timeout'?'timeout':'unavailable');
   }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);if(pending===job)pending=null;}
  })();
  return job.promise;
 }
 return Object.freeze({load,revoke,dispose});
}