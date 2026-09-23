import {STRUCTURE_LIMITS,parseBudgetStructure} from './budget-structure-model.js';
let running=false;
const nonempty=v=>v instanceof Map?v.size>0:!!v&&Object.keys(v).length>0;
self.onmessage=async({data})=>{
 if(running)return;running=true;let task,pdfWorker,parser;const bytes=data?.buffer instanceof ArrayBuffer?new Uint8Array(data.buffer):null;
 try{
  if(!bytes||bytes.length<5||bytes.length>STRUCTURE_LIMITS.bytes||String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw Error('STRUCTURE_FILE');
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const pdfjs=await import('./vendor/pdf.min.mjs');parser=new Worker('/assets/vendor/pdf.worker.min.mjs',{type:'module'});pdfWorker=new pdfjs.PDFWorker({port:parser});
  task=pdfjs.getDocument({data:bytes,worker:pdfWorker,isEvalSupported:false,useWasm:false,disableAutoFetch:true,disableRange:true,disableStream:true,disableFontFace:true,enableXfa:false,stopAtErrors:true,maxImageSize:0,verbosity:0});
  task.onPassword=()=>{void task.destroy()};const doc=await task.promise;
  if(doc.numPages<1||doc.numPages>STRUCTURE_LIMITS.pages||doc.isPureXfa||await doc.getPermissions()!==null||nonempty(await doc.getJSActions())||nonempty(await doc.getAttachments())||nonempty(await doc.getFieldObjects()))throw Error('STRUCTURE_UNSUPPORTED_PDF');
  const pages=[];let total=0;
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),viewport=page.getViewport({scale:1});
   if(nonempty(await page.getJSActions())||(await page.getAnnotations({intent:'any'})).some(a=>a.subtype==='FileAttachment'||a.subtype==='Widget'))throw Error('STRUCTURE_UNSUPPORTED_PDF');
   const content=await page.getTextContent({disableNormalization:true});total+=content.items.length;if(total>STRUCTURE_LIMITS.items)throw Error('STRUCTURE_LIMIT');
   const items=content.items.filter(t=>typeof t.str==='string'&&t.str.trim()).map(t=>{const pos=pdfjs.Util.transform(viewport.transform,t.transform);return{text:t.str,x:pos[4],y:pos[5]}});
   pages.push({number:n,width:viewport.width,height:viewport.height,items});page.cleanup();self.postMessage({type:'progress',page:n,total:doc.numPages});
  }
  const result=parseBudgetStructure(pages,{sha256});self.postMessage({type:'result',result});
 }catch{self.postMessage({type:'error',code:'STRUCTURE_NOT_VERIFIED'})}
 finally{try{await task?.destroy()}catch{}try{pdfWorker?.destroy()}catch{}parser?.terminate();try{bytes?.fill(0)}catch{}self.close()}
};
