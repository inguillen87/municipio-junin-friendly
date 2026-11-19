// This worker never parses XML, formulas, links, or JS contained in a workbook.
const ready=(async()=>{importScripts('./vendor/fflate-0.8.3.min.js');return import('./own-cajas-zip-core.js');})();
self.onmessage=async event=>{
  const {id,bytes}=event.data??{};
  try{
    const {inflateZip}=await ready;
    const archive=await inflateZip(new Uint8Array(bytes),globalThis.fflate.Inflate);
    self.postMessage({ok:true,id,archive},archive.parts.map(part=>part.data));
  }catch(error){const code=typeof error.code==='string'&&error.code.startsWith('CAJAS_')?error.code:'CAJAS_ZIP_INVALID';self.postMessage({ok:false,id,code,message:code});}
};
