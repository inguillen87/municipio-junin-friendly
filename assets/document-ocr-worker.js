// A single explicitly selected raster page. All code/language files are same-origin.
const children=new Set(),NativeWorker=self.Worker;
self.Worker=class extends NativeWorker{constructor(...args){super(...args);children.add(this);}terminate(){children.delete(this);super.terminate();}};
let busy=false,cancelled=false,engine=null;
const clean=()=>{cancelled=true;for(const child of children)child.terminate();children.clear();};
self.addEventListener('message',async event=>{
 if(event.data?.type==='cancel'){clean();self.postMessage({type:'cancelled'});return;}
 if(busy)return;busy=true;let image;
 try{
  const x=event.data;
  if(!x||Object.keys(x).sort().join()!=='buffer,page,sha256,type'||x.type!=='recognize'||!(x.buffer instanceof ArrayBuffer)||x.buffer.byteLength>8388608||!Number.isInteger(x.page)||x.page<1||x.page>30||!/^[a-f0-9]{64}$/.test(x.sha256))throw Error('INPUT');
  const data=new Uint8Array(x.buffer);
  if(![137,80,78,71,13,10,26,10].every((n,i)=>data[i]===n)||data.length<24)throw Error('IMAGE');
  const view=new DataView(x.buffer),w=view.getUint32(16),h=view.getUint32(20);if(!w||!h||w*h>4010000)throw Error('IMAGE');
  image=new Blob([data],{type:'image/png'});
  importScripts('/assets/vendor/ocr/tesseract.min.js');
  engine=await Tesseract.createWorker('spa',1,{workerPath:'/assets/vendor/ocr/worker.min.js',corePath:'/assets/vendor/ocr',langPath:'/assets/vendor/ocr/lang',cacheMethod:'none',workerBlobURL:false,logger:m=>{if(!cancelled&&m.status==='recognizing text')self.postMessage({type:'progress',value:Math.round(m.progress*100)});},errorHandler:()=>{}});
  if(cancelled)return;
  await engine.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',user_defined_dpi:'150'});
  const answer=await engine.recognize(image,{}, {text:true});
  const text=answer?.data?.text,confidence=answer?.data?.confidence;
  if(typeof text!=='string'||text.length>50000||!Number.isFinite(confidence)||confidence<0||confidence>100)throw Error('OUTPUT');
  await engine.terminate();engine=null;
  if(!cancelled)self.postMessage({type:'result',page:x.page,sha256:x.sha256,text,confidence});
 }catch{if(!cancelled)self.postMessage({type:'error',message:'No se pudo leer la página. Probá una imagen más clara y vertical.'});}
 finally{clean();image=null;}
});
