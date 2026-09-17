import {PDF_TEXT_MAX_BYTES,PDF_TEXT_MAX_PAGES,PDF_TEXT_MAX_CHARS,pageTextFromItems} from './legal-pdf-text-model.js';
const nonempty=v=>v instanceof Map?v.size>0:Array.isArray(v)?v.length>0:!!v&&Object.keys(v).length>0;
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
self.addEventListener('message',async event=>{
 let task,bytes,parser,outcome;
 try{
  const input=event.data;
  if(!input||Object.keys(input).sort().join()!=='buffer,sha256,type'||input.type!=='extract'||!(input.buffer instanceof ArrayBuffer)||!/^[a-f0-9]{64}$/.test(input.sha256))throw Error('INPUT');
  bytes=new Uint8Array(input.buffer);const byteLength=bytes.byteLength;
  if(byteLength<5||byteLength>PDF_TEXT_MAX_BYTES||String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-'||await hash(bytes)!==input.sha256)throw Error('INPUT');
  const pdfjs=await import('./vendor/pdf.min.mjs');
  parser=new Worker(new URL('./vendor/pdf.worker.min.mjs',import.meta.url),{type:'module'});pdfjs.GlobalWorkerOptions.workerPort=parser;
  task=pdfjs.getDocument({data:bytes,disableAutoFetch:true,disableRange:true,disableStream:true,disableFontFace:true,isEvalSupported:false,useSystemFonts:false,enableXfa:false,stopAtErrors:true,maxImageSize:0,verbosity:0});
  const doc=await task.promise;
  if(!Number.isInteger(doc.numPages)||doc.numPages<1||doc.numPages>PDF_TEXT_MAX_PAGES)throw Error('PAGES');
  if(await doc.getPermissions()!==null||nonempty(await doc.getAttachments())||nonempty(await doc.getJSActions()))throw Error('PROTECTED');
  const pages=[];let total=0;
  for(let number=1;number<=doc.numPages;number++){
   const page=await doc.getPage(number);
   if(nonempty(await page.getJSActions()))throw Error('PROTECTED');
   const annotations=await page.getAnnotations({intent:'display'});
   if(!Array.isArray(annotations)||annotations.some(a=>a.subtype==='FileAttachment'||a.annotationType===pdfjs.AnnotationType.FILEATTACHMENT))throw Error('PROTECTED');
   const content=await page.getTextContent({disableNormalization:true}),text=pageTextFromItems(content.items);total+=text.length;
   if(total>PDF_TEXT_MAX_CHARS)throw Error('TEXT_LIMIT');pages.push({number,text});page.cleanup();
  }
  outcome={ok:true,result:{version:'legal-pdf-text.v1',sha256:input.sha256,byteLength,pageCount:doc.numPages,pages,method:'pdf-text',originalModified:false,legalReview:false}};
 }catch{outcome={ok:false,code:'PDF_TEXT_UNAVAILABLE'};}
 finally{try{await task?.destroy();}catch{}parser?.terminate();if(bytes?.byteLength)bytes.fill(0);}
 self.postMessage(outcome);
},{once:true});
