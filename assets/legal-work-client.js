import {workReceipt} from './legal-work-model.js';
export async function legalWorkRequest(query,{scope,body,key,signal,fetchImpl=fetch}={}){
 const headers={Accept:'application/json','X-MuniControl-Intent':'legal-work-v1'};
 if(scope)headers['X-Legal-Work-Scope']=scope;if(body){headers['Content-Type']='application/json';headers['Idempotency-Key']=key;}
 const deadline=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
 let response;try{response=await fetchImpl('/api/internal-legal-work'+(query?'?'+new URLSearchParams(query):''),{method:body?'POST':'GET',headers,credentials:'same-origin',cache:'no-store',redirect:'error',body:body?JSON.stringify(body):undefined,signal:combined});}
 catch(e){if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');throw Error('No recibimos la confirmación. Consultá el mismo intento antes de volver a crear.');}
 if(response.redirected||!response.body||! /\bno-store\b/.test(response.headers.get('cache-control')||''))throw Error('Respuesta no verificable. No se confirmó el guardado.');
 const reader=response.body.getReader(),parts=[];let total=0,complete=false;try{for(;;){const{done,value}=await reader.read();if(done){complete=true;break;}total+=value.byteLength;if(total>400000)throw Error('Respuesta demasiado extensa.');parts.push(value);}}finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(total);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('Respuesta no verificable; consultá el intento.');}
 if(combined.aborted)throw new DOMException('Consulta cancelada','AbortError');
 if(!response.ok||data?.ok!==true)throw Object.assign(Error(typeof data?.error==='string'?data.error:'No se pudo completar la operación.'),{status:response.status,code:data?.code});
 if(data.data?.version!=='legal-work.v1')throw Error('La respuesta no corresponde a este módulo.');
 if(body||query?.resource==='attempt')return workReceipt(data.data);return data.data;
}
