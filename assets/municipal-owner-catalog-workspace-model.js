import {OWNER_CATALOG_MAX_BYTES,ownerCatalogAuthority,ownerCatalogPreview,ownerCatalogCommand,ownerCatalogAttempt,ownerCatalogAttemptKey} from './municipal-owner-catalog-model.js';
import {adoptionReviewJson} from './employment-adoption-review-model.js';
import {catalogErrorGuidance} from './native-employment-catalog-model.js';
const same=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
const failure=(code,status,message)=>Object.assign(new Error(message),{code,status});
export async function readOwnerCatalogResponse(response){
 const declared=response.headers?.get('content-length');if(declared!==null&&declared!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>OWNER_CATALOG_MAX_BYTES)){await response.body?.cancel().catch(()=>{});throw failure('OWNER_CATALOG_UNAVAILABLE',503,'La respuesta completa supera el límite verificable.');}
 let bytes=0,parts=[];const reader=response.body?.getReader();if(!reader)throw failure('OWNER_CATALOG_UNAVAILABLE',503,'La respuesta no está completa.');
 try{for(;;){const{done,value}=await reader.read();if(done)break;if(!(value instanceof Uint8Array)||(bytes+=value.byteLength)>OWNER_CATALOG_MAX_BYTES)throw Error('LIMIT');parts.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw failure('OWNER_CATALOG_UNAVAILABLE',503,'No se pudo leer la confirmación completa.');}finally{reader.releaseLock();}
 const raw=new Uint8Array(bytes);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.byteLength;}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw failure('OWNER_CATALOG_UNAVAILABLE',503,'No se pudo verificar la respuesta completa.');}
 if(!response.ok||value?.ok!==true){const code=typeof value?.code==='string'?value.code:'OWNER_CATALOG_UNAVAILABLE';throw failure(code,response.status,catalogErrorGuidance({code,status:response.status}));}return value.data;
}
export function createOwnerCatalogWorkspace({fetchImpl=fetch,newKey=()=>crypto.randomUUID(),isLive=()=>true,onChange=()=>{}}={}){
 let context=null,preview=null,pending=null,result=null,busy=false,epoch=0,controller=null;
 const state=()=>({context,preview,pending:pending?{key:pending.key,body:pending.body,uncertain:pending.uncertain,retryReady:pending.retryReady}:null,result,busy});
 const changed=()=>onChange(state());
 const check=seq=>{if(seq!==epoch||!isLive())throw failure('OWNER_CATALOG_VIEW_CHANGED',409,'La vista cambió. El intento anterior conserva su referencia.');};
 async function request(resource,options={}){const response=await fetchImpl('/api/internal-municipal-owner-catalog'+resource,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});return readOwnerCatalogResponse(response);}
 async function authorize(seq){const current=ownerCatalogAuthority(await request('?resource=authority'));check(seq);return current;}
 async function load(id){if(busy||pending)throw failure('OWNER_CATALOG_PENDING',409,'Consultá primero el mismo intento.');const seq=++epoch;controller=new AbortController();busy=true;context=null;preview=null;result=null;changed();try{const before=await authorize(seq),value=await ownerCatalogPreview(await request('?resource=preview&id='+encodeURIComponent(id)),before);check(seq);const after=await authorize(seq);if(!same(before,after))throw failure('OWNER_CATALOG_SCOPE_CHANGED',409,'Cambió la autorización durante la revisión.');context=after;preview=value;return state();}finally{if(seq===epoch){busy=false;changed();}}}
 function prepare(reason,reviewConfirmed){if(busy||pending||!isLive())throw failure('OWNER_CATALOG_PENDING',409,'Consultá primero el mismo intento.');const body=ownerCatalogCommand(preview,{reason,reviewConfirmed}),key=newKey();if(!ownerCatalogAttemptKey(key))throw failure('OWNER_CATALOG_INPUT_INVALID',400,'No se pudo crear una referencia canónica.');pending={key,body,wire:JSON.stringify({operation:'approve_owner',payload:body}),context,uncertain:false,retryReady:false};result=null;changed();return state();}
 async function send(recovery=false){if(busy||!pending||!isLive())throw failure('OWNER_CATALOG_PENDING',409,'No hay un intento disponible en esta vista.');if(!recovery&&pending.uncertain&&!pending.retryReady)throw failure('OWNER_CATALOG_PENDING',409,'Consultá el intento antes de reenviar.');const seq=++epoch,attempt=pending;controller=new AbortController();busy=true;preview=null;changed();
  try{const current=await authorize(seq),old=attempt.context;if(!same(current.scope,old.scope)||current.authority.actor.personId!==old.authority.actor.personId||current.authority.actor.email!==old.authority.actor.email){pending=null;context=null;throw failure('OWNER_CATALOG_ACTOR_CHANGED',403,'Cambió la persona o el municipio. No se reenviará el intento anterior.');}context=current;
   if(!recovery){attempt.uncertain=true;attempt.retryReady=false;}
   const raw=await request(recovery?'?resource=attempt&key='+encodeURIComponent(attempt.key):'',recovery?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:attempt.wire});check(seq);
   const value=await ownerCatalogAttempt(raw,{key:attempt.key,command:attempt.body});check(seq);if(!same(value.authorization,context))throw failure('OWNER_CATALOG_SCOPE_CHANGED',409,'Cambió la autorización antes de recibir la confirmación.');result=value;pending=null;return state();
  }catch(error){if(pending===attempt){attempt.uncertain=true;if(recovery&&error.status===404&&error.code==='NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND')attempt.retryReady=true;}throw error;}finally{if(seq===epoch){busy=false;changed();}}
 }
 function invalidate({forget=false}={}){epoch++;controller?.abort();busy=false;context=null;preview=null;result=null;if(forget)pending=null;else if(pending){pending.uncertain=true;pending.retryReady=false;}changed();}
 return Object.freeze({state,load,prepare,send,invalidate});
}
