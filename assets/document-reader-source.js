import {READER_LIMITS,validatePages} from './document-reader-model.js';
import {pageTextFromItems} from './legal-pdf-text-model.js';
const stopped=s=>{if(s?.aborted)throw new DOMException('Lectura cancelada','AbortError');};
const nonempty=v=>v instanceof Map?v.size>0:!!v&&Object.keys(v).length>0;
// La persona sólo lee tal cual los mensajes que escribe este lector (límites, PDF con formularios, imagen no compatible).
// Lo que rechazan el motor de PDF o el navegador llega en inglés y con nombres internos («Invalid PDF structure.», «Worker
// was destroyed», «this[#Yr].getOrInsertComputed is not a function»): eso nunca se muestra. Se reemplaza por qué pasó y
// qué puede hacer la persona; `code` le permite a cada pantalla agregar su propia salida (p. ej. la carga manual).
export const READING_FAILED='No se pudo leer este archivo: puede estar dañado o protegido con contraseña, o el navegador puede estar desactualizado. Probá con otra copia del archivo o con Chrome o Edge actualizados.';
export const READER_UNAVAILABLE='No se pudo abrir el lector de PDF en este navegador. Revisá la conexión y volvé a intentar; si sigue igual, actualizá Chrome o Edge.';
const written=new WeakSet(),own=message=>{const e=Error(message);written.add(e);return e;};
const failed=message=>Object.assign(own(message),{code:'READING_FAILED'});
const ours=check=>{try{return check();}catch(e){throw own(e.message);}};
const worded=(e,signal)=>signal?.aborted||e?.name==='AbortError'?new DOMException('Lectura cancelada','AbortError'):written.has(e)?e:failed(READING_FAILED);
const guarded=(signal,step)=>async(...input)=>{try{return await step(...input);}catch(e){throw worded(e,signal);}};
export function imageDimensions(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width,height,kind;
 if(bytes.length>24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)){
  width=v.getUint32(16);height=v.getUint32(20);kind='image/png';
 }else if(bytes[0]===255&&bytes[1]===216){
  let at=2;
  while(at+9<bytes.length&&at<131072){
   if(bytes[at++]!==255)throw own('Imagen JPEG inválida.');while(bytes[at]===255)at++;
   const code=bytes[at++];if(code===217||code===218)break;if(code===1||code>=208&&code<=215)continue;
   const n=v.getUint16(at);if(n<2||at+n>bytes.length)break;
   if([192,193,194].includes(code)){height=v.getUint16(at+3);width=v.getUint16(at+5);kind='image/jpeg';break;}at+=n;
  }
 }
 if(!kind||!width||!height||width>16000||height>16000||width*height>20000000)throw own('Imagen no compatible o demasiado grande. Usá PNG o JPG de hasta 20 megapíxeles.');
 return{width,height,kind};
}
export function openReadingSource(file,{signal,onProgress=()=>{},pdfjsImporter=()=>import('/assets/vendor/pdf.min.mjs')}={}){
 return guarded(signal,open)(file,{signal,onProgress,pdfjsImporter});
}
async function open(file,{signal,onProgress,pdfjsImporter}){
 if(!file||!Number.isInteger(file.size)||file.size<5||file.size>READER_LIMITS.bytes)throw own('Seleccioná un PDF, PNG o JPG de hasta 8 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer());stopped(signal);if(bytes.length!==file.size)throw own('El archivo cambió durante la lectura.');
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');stopped(signal);
 if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-'){
  const dimensions=imageDimensions(bytes),bitmap=await createImageBitmap(new Blob([bytes],{type:dimensions.kind}));
  if(signal?.aborted){bitmap.close();stopped(signal);}
  if(bitmap.width*bitmap.height>20000000){bitmap.close();throw own('Imagen fuera de límite.');}let dead=false;
  return{sha256,name:String(file.name).slice(0,180),kind:'image',pages:[{number:1,text:'',method:'empty',reviewed:false}],
   render:guarded(signal,async(number,width=1200)=>{
    if(dead||number!==1)throw own('Página no disponible.');
    const scale=Math.min(1,width/bitmap.width,Math.sqrt(READER_LIMITS.pixels/(bitmap.width*bitmap.height))),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
   }),destroy(){dead=true;bitmap.close();bytes.fill(0);}};
 }
 let pdfjs;try{pdfjs=await pdfjsImporter();}catch{throw failed(READER_UNAVAILABLE);}
 stopped(signal);pdfjs.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.min.mjs';
 const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWasm:false,disableAutoFetch:true,disableRange:true,disableStream:true,stopAtErrors:true,enableXfa:false,maxImageSize:20000000});
 task.onPassword=()=>{void task.destroy();};
 const abort=()=>{void task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  const doc=await task.promise;stopped(signal);
  if(doc.numPages<1||doc.numPages>READER_LIMITS.pages)throw own('El lector admite hasta 30 páginas por documento.');
  if(await doc.getPermissions()!==null||nonempty(await doc.getJSActions())||nonempty(await doc.getAttachments())||doc.isPureXfa||nonempty(await doc.getFieldObjects()))throw own('Este piloto admite PDF estáticos, sin formularios, adjuntos ni acciones.');
  const pages=[];let count=0,dead=false;
  for(let n=1;n<=doc.numPages;n++){
   stopped(signal);onProgress('Leyendo texto nativo · página '+n+' de '+doc.numPages);const page=await doc.getPage(n);
   if(nonempty(await page.getJSActions()))throw own('PDF con acciones no admitido.');
   const annotations=await page.getAnnotations({intent:'any'});
   if(annotations.some(a=>a.subtype==='FileAttachment'||a.subtype==='Widget'))throw own('PDF interactivo no admitido.');
   const items=(await page.getTextContent({disableNormalization:true})).items,text=ours(()=>pageTextFromItems(items));count+=text.length;
   if(count>READER_LIMITS.totalChars)throw own('Documento demasiado extenso para este lector.');
   pages.push({number:n,text,method:text.trim()?'native':'empty',reviewed:false});page.cleanup();
  }
  ours(()=>validatePages(pages));
  return {sha256,name:String(file.name).slice(0,180),kind:'pdf',pages,
   render:guarded(signal,async(n,width=1200)=>{
    stopped(signal);if(dead||!Number.isInteger(n)||!pages[n-1])throw own('Página no disponible.');
    const page=await doc.getPage(n),base=page.getViewport({scale:1});
    const scale=Math.min(2.5,width/base.width,Math.sqrt(READER_LIMITS.pixels/(base.width*base.height)));
    const viewport=page.getViewport({scale});if(!Number.isFinite(viewport.width*viewport.height)||viewport.width<1||viewport.height<1)throw own('Dimensiones no válidas.');
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const r=page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,annotationMode:0,background:'white'});
    const timer=setTimeout(()=>r.cancel(),20000);try{await r.promise;stopped(signal);return canvas;}finally{clearTimeout(timer);}
   }),async destroy(){dead=true;signal?.removeEventListener('abort',abort);await task.destroy();bytes.fill(0);}};
 }catch(e){signal?.removeEventListener('abort',abort);await task.destroy().catch(()=>{});bytes.fill(0);throw e;}
}
