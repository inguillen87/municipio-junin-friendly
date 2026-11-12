// Lectura del detalle de una liquidación propia desde cualquier pantalla.
//
// Pide primero el JSON común (hasta 4 MiB). Si el servidor responde que el conjunto completo no entra en esa
// capacidad (OWN_LIQ_LIMIT), repite la misma consulta en modo completo (hasta 32 MiB) y exige el tipo de contenido
// y los bytes anunciados de esa lectura. Un resultado que hoy entra en 4 MiB se lee exactamente como antes.
// Nunca entrega una parte: o devuelve el sobre entero del servidor, o falla.
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse,readOwnPayrollText} from './own-payroll-response.js';
import {OWN_RUN_MAX_RESPONSE} from './own-payroll-run-model.js';

export const OWN_LIQ_DETAIL_ENDPOINT='/api/internal-own-payroll-liquidation';
export const OWN_LIQ_DETAIL_LIMIT='OWN_LIQ_LIMIT';
export const ownLiquidationDetailUrl=id=>OWN_LIQ_DETAIL_ENDPOINT+'?resource=detail&id='+encodeURIComponent(id);

const unverified=()=>Error('No se pudo verificar la respuesta completa. Volvé a consultar.');
async function plain(response,options){
 const read=await readOwnPayrollText(response,{maxBytes:OWN_RUN_MAX_RESPONSE,...options});
 try{return {payload:JSON.parse(read.text),bytes:read.bytes};}catch{throw unverified();}
}

// Devuelve {status, ok, payload, bytes, full}: `payload` es el sobre del servidor ({ok:true,data} o
// {ok:false,code,error}); `bytes`, todo lo leído (incluida la respuesta común rechazada, si la hubo); `full`, si
// el detalle llegó por la lectura completa. `remaining` es el presupuesto de bytes que le queda a quien llama.
// `full:true` saltea el JSON común: es para volver a leer un detalle que ya se sabe que no entra.
export async function fetchOwnLiquidationDetail(id,{signal,remaining,full=false,fetch:send=globalThis.fetch}={}){
 if(remaining!==undefined&&(!Number.isSafeInteger(remaining)||remaining<0))throw Error('Presupuesto de lectura inválido.');
 const url=ownLiquidationDetailUrl(id);let bytes=0;
 const budget=()=>remaining===undefined?{signal}:{signal,remaining:Math.max(0,remaining-bytes)};
 const request=accept=>send(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:accept},signal});
 if(full!==true){
  const common=await request('application/json'),first=await plain(common,budget());bytes+=first.bytes;
  if(common.ok||first.payload?.code!==OWN_LIQ_DETAIL_LIMIT)return {status:common.status,ok:common.ok,payload:first.payload,bytes,full:false};
 }
 const complete=await request(OWN_RUN_FULL_JSON);
 if(!complete.ok){const second=await plain(complete,budget());bytes+=second.bytes;return {status:complete.status,ok:false,payload:second.payload,bytes,full:true};}
 const announced=complete.headers?.get('x-municontrol-json-bytes');
 if(complete.headers?.get('content-type')?.split(';')[0].trim().toLowerCase()!==OWN_RUN_FULL_JSON||announced===null||announced===undefined||!/^(0|[1-9][0-9]*)$/.test(announced)){
  await complete.body?.cancel?.().catch(()=>{});throw unverified();
 }
 const payload=await readOwnPayrollResponse(complete,{maxBytes:OWN_RUN_FULL_MAX_BYTES,...budget()});bytes+=Number(announced);
 return {status:complete.status,ok:true,payload,bytes,full:true};
}
