import {readAssistanceXlsx} from './payroll-assistance-xlsx-reader.js';
self.addEventListener('message',async event=>{
 const input=event.data;let bytes;
 try{
  if(input?.type!=='preview'||!(input.arrayBuffer instanceof ArrayBuffer))throw Error('El lector no recibió un archivo local válido.');
  bytes=new Uint8Array(input.arrayBuffer);
  if(typeof globalThis.fflate?.unzipSync!=='function')await import('./vendor/fflate.min.js');
  if(typeof globalThis.fflate?.unzipSync!=='function')throw Error('No se pudo iniciar el lector ZIP local.');
  const preview=await readAssistanceXlsx(bytes,{unzipSync:globalThis.fflate.unzipSync});self.postMessage({ok:true,preview});
 }catch(error){self.postMessage({ok:false,message:typeof error?.message==='string'?error.message:'No se pudo leer la planilla de cajas.'});}
 finally{bytes?.fill(0);self.close();}
});
