import {PDF_TEXT_MAX_BYTES,verifyPdfText} from './legal-pdf-text-model.js';
export function readLegalPdfText(document,{signal,workerFactory=url=>new Worker(url,{type:'module'}),timeoutMs=20000}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,done=false;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(Object.assign(Error('Lectura cancelada.'),{name:'AbortError'}));
  try{
   if(signal?.aborted){abort();return;}
   if(!document||typeof document.contentBase64!=='string'||document.contentBase64.length>4*Math.ceil(PDF_TEXT_MAX_BYTES/3)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw Error('PDF inválido o demasiado grande.');
   const raw=atob(document.contentBase64);if(raw.length<5||raw.length>PDF_TEXT_MAX_BYTES||btoa(raw)!==document.contentBase64)throw Error('Archivo PDF no verificable.');
   const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),byteLength=bytes.byteLength;
   worker=workerFactory('/assets/legal-pdf-text-worker.js');
   worker.onmessage=event=>{try{
    if(!event.data||event.data.ok!==true||Object.keys(event.data).sort().join()!=='ok,result')throw Error('No se pudo extraer el texto. El PDF puede estar protegido, dañado o fuera de los límites.');
    const result=verifyPdfText(event.data.result,document);if(result.byteLength!==byteLength)throw Error('El tamaño no coincide con el PDF seleccionado.');finish(null,result);
   }catch(error){finish(error);}};
   worker.onerror=()=>finish(Error('El lector de PDF no está disponible. Podés continuar con la transcripción manual.'));
   timer=setTimeout(()=>finish(Error('La lectura superó el tiempo disponible. El archivo original y el borrador se conservan.')),timeoutMs);
   signal?.addEventListener('abort',abort,{once:true});
   worker.postMessage({type:'extract',sha256:document.sha256,buffer:bytes.buffer},[bytes.buffer]);
  }catch(error){finish(error);}
 });
}
