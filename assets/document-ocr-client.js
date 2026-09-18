import {READER_LIMITS} from './document-reader-model.js';
export async function readRasterPage(canvas,{sha256,page,signal,onProgress=()=>{},workerFactory=url=>new Worker(url)}={}){
 if(!canvas||canvas.width*canvas.height>4010000||!Number.isInteger(page)||page<1||page>30||!/^[a-f0-9]{64}$/.test(sha256))throw Error('Página no verificable.');
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>READER_LIMITS.bytes)throw Error('La imagen de la página es demasiado grande.');
 const buffer=await blob.arrayBuffer();if(signal?.aborted)throw new DOMException('OCR cancelado','AbortError');
 return new Promise((resolve,reject)=>{
  const worker=workerFactory('/assets/document-ocr-worker.js');let finished=false,timer;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.onmessage=()=>{};try{worker.postMessage({type:'cancel'});}catch{}setTimeout(()=>worker.terminate(),150);error?reject(error):resolve(result);};
  const abort=()=>finish(new DOMException('OCR cancelado','AbortError'));
  worker.onmessage=e=>{const d=e.data;if(finished)return;if(d?.type==='progress'){if(Number.isInteger(d.value)&&d.value>=0&&d.value<=100)onProgress(d.value);return;}
   if(d?.type==='result'&&d.sha256===sha256&&d.page===page&&typeof d.text==='string'&&d.text.length<=50000&&Number.isFinite(d.confidence)&&d.confidence>=0&&d.confidence<=100)finish(null,{text:d.text,confidence:d.confidence});
   else finish(Error('No se pudo leer la página con suficiente control. El original se conserva.'));
  };
  worker.onerror=()=>finish(Error('No se pudo iniciar el OCR local. Revisá la conexión para cargar sus componentes.'));
  signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(Error('El OCR superó 90 segundos. Cancelado sin guardar cambios.')),READER_LIMITS.ocrMs);
  worker.postMessage({type:'recognize',sha256,page,buffer},[buffer]);
 });
}
