// Canvas/text only; no annotations, script actions, embedded files or provider requests.
import {FIRMAR_PAGE_LIMIT,FIRMAR_PDF_LIMIT} from './firmar-workspace-model.js';
export async function loadFirmarSourcePdf(bytes,{signal,pdfjsImporter=()=>import('/assets/vendor/pdf.min.mjs')}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length<10||bytes.length>FIRMAR_PDF_LIMIT)throw Error('PDF fuera de límite');
 const library=await pdfjsImporter();if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
 library.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.min.mjs';
 const task=library.getDocument({data:bytes.slice(),isEvalSupported:false,disableFontFace:false,useSystemFonts:true,useWasm:false,stopAtErrors:true,disableAutoFetch:true,disableStream:true,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,maxImageSize:12000000,canvasMaxAreaInBytes:48000000});
 // Never prompt for PDF passwords or store them in the application.
 task.onPassword=()=>{void task.destroy().catch(()=>{});};
 const abort=()=>{void task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{const doc=await task.promise;if(signal?.aborted)throw new DOMException('Cancelado','AbortError');if(!Number.isInteger(doc.numPages)||doc.numPages<1||doc.numPages>FIRMAR_PAGE_LIMIT)throw Error('El PDF supera las 30 páginas del piloto');const present=v=>v instanceof Map?v.size>0:!!v&&Object.keys(v).length>0;
   if(present(await doc.getFieldObjects())||present(await doc.getAttachments())||present(await doc.getJSActions())||doc.isPureXfa)throw Error('PDF interactivo no admitido en este piloto');
   for(let n=1;n<=doc.numPages;n++){if(signal?.aborted)throw new DOMException('Cancelado','AbortError');const page=await doc.getPage(n);if((await page.getAnnotations({intent:'any'})).length||present(await page.getJSActions()))throw Error('PDF con anotaciones no admitido en este piloto');}
   let destroyed=false;
  return{pages:doc.numPages,async page(index){if(destroyed||!Number.isInteger(index)||index<1||index>doc.numPages)throw Error('Página no disponible');return doc.getPage(index);},async destroy(){if(destroyed)return;destroyed=true;signal?.removeEventListener('abort',abort);await task.destroy();}};
 }catch(e){signal?.removeEventListener('abort',abort);await task.destroy().catch(()=>{});throw e;}
}
