// Lectura y envío de cierres propios desde cualquier pantalla.
//
// Cada pedido va primero en JSON común (hasta 4 MiB). Si el servidor responde que el conjunto completo no entra en esa
// capacidad (OWN_CLOSE_LIMIT, 422), se repite el mismo pedido en modo completo (hasta 32 MiB) y se exige el tipo de
// contenido y los bytes anunciados de esa respuesta. Un cierre que hoy entra en 4 MiB se lee y se registra exactamente
// como antes. Nunca se entrega una parte: o llega el sobre entero del servidor, o falla.
//
// Una decisión (cerrar o reabrir) que no entra en la capacidad común se reenvía con la MISMA clave y el MISMO contenido:
// es el mismo intento por la fachada de capacidad ampliada, no otro. Si ya había quedado registrada, el servidor devuelve
// su comprobante original.
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse,readOwnPayrollText} from './own-payroll-response.js';
import {OWN_RUN_MAX_RESPONSE} from './own-payroll-run-model.js';

export const OWN_CLOSE_ENDPOINT='/api/internal-own-payroll-close';
export const OWN_CLOSE_LIMIT='OWN_CLOSE_LIMIT';
export const ownCloseUrl=params=>OWN_CLOSE_ENDPOINT+'?'+new URLSearchParams(params);

const unverified=()=>Error('No se pudo verificar la respuesta completa. Volvé a consultar.');
async function plain(response,options){
 const read=await readOwnPayrollText(response,{maxBytes:OWN_RUN_MAX_RESPONSE,...options});
 try{return {payload:JSON.parse(read.text),bytes:read.bytes};}catch{throw unverified();}
}
// `request(accept)` hace el pedido con ese Accept. Devuelve {status, ok, payload, bytes, full}: `payload` es el sobre del
// servidor ({ok:true,data} o {ok:false,code,error}); `bytes`, todo lo leído (incluida la respuesta común rechazada, si la
// hubo); `full`, si la respuesta llegó por el modo completo.
async function exchange(request,{signal,remaining,full}){
 if(remaining!==undefined&&(!Number.isSafeInteger(remaining)||remaining<0))throw Error('Presupuesto de lectura inválido.');
 let bytes=0;const budget=()=>remaining===undefined?{signal}:{signal,remaining:Math.max(0,remaining-bytes)};
 if(full!==true){
  const common=await request('application/json'),first=await plain(common,budget());bytes+=first.bytes;
  // 422 es el tope del conjunto completo; 413 (formulario demasiado grande) no se resuelve pidiendo más capacidad de respuesta.
  if(common.ok||common.status!==422||first.payload?.code!==OWN_CLOSE_LIMIT)return {status:common.status,ok:common.ok,payload:first.payload,bytes,full:false};
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

// Consulta de un recurso de cierre: {resource:'detail',period,liquidationType}, {resource:'group',id} o
// {resource:'attempt',key}. `remaining` es el presupuesto de bytes que le queda a quien llama. `full:true` saltea el JSON
// común: es para volver a leer algo que ya se sabe que no entra. `known` es un Set que la pantalla conserva: acá se anota
// cada consulta que necesitó el modo completo y, mientras siga en el Set, se pide directo así (una lectura en vez de dos).
export async function fetchOwnClose(params,{signal,remaining,full=false,known,fetch:send=globalThis.fetch}={}){
 const url=ownCloseUrl(params);
 const read=await exchange(accept=>send(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:accept},signal}),{signal,remaining,full:full===true||known?.has(url)===true});
 if(read.full&&read.ok)known?.add(url);
 return read;
}

// Envío de una decisión con su clave de intento. El contenido se serializa una sola vez: el reenvío en modo completo
// manda exactamente los mismos bytes con la misma clave.
export function sendOwnCloseCommand(key,body,{signal,full=false,fetch:send=globalThis.fetch}={}){
 const text=JSON.stringify({operation:'command',payload:body});
 return exchange(accept=>send(OWN_CLOSE_ENDPOINT,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:accept,'Content-Type':'application/json','Idempotency-Key':key},body:text,signal}),{signal,full});
}
