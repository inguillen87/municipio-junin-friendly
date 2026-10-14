// An explicitly negotiated complete JSON response. The business payload,
// immutable request key and captured sources keep their existing versions.
export const OWN_RUN_FULL_JSON='application/vnd.municontrol.payroll-full.v1+json';
export const OWN_RUN_FULL_MAX_BYTES=32*1024*1024;

export async function readOwnPayrollResponse(response,{maxBytes,signal}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>OWN_RUN_FULL_MAX_BYTES)throw Error('Límite de lectura inválido.');
 const reader=response.body?.getReader();
 if(!reader)throw Error('No se pudo leer la respuesta completa. Consultá el mismo intento.');
 const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let bytes=0;
 try{
  while(true){
   if(signal?.aborted)throw Object.assign(Error('Se retiró la lectura.'),{name:'AbortError'});
   const item=await reader.read();if(item.done)break;
   bytes+=item.value.byteLength;
   if(bytes>maxBytes)throw Error('La respuesta completa supera la capacidad. No se mostraron filas parciales.');
   parts.push(decoder.decode(item.value,{stream:true}));
  }
  parts.push(decoder.decode());
  if(signal?.aborted)throw Object.assign(Error('Se retiró la lectura.'),{name:'AbortError'});
  const announced=response.headers?.get('x-municontrol-json-bytes');
  if(announced!==null&&announced!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(announced)||Number(announced)!==bytes))throw Error('La respuesta quedó incompleta. Consultá el mismo intento.');
  return JSON.parse(parts.join(''));
 }catch(error){parts.length=0;await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
}
