import {SalaryInputError,salaryBootstrap,salaryExact,salaryHash} from './native-salary-catalog-model.js';

export const SALARY_STREAM_VERSION='native-salary-stream.v1';
export const SALARY_STREAM_PAGE_BYTES=256*1024;
export const SALARY_STREAM_MAX_BYTES=64*1024*1024;
export const SALARY_STREAM_MAX_PAGES=SALARY_STREAM_MAX_BYTES/SALARY_STREAM_PAGE_BYTES;
const fields=['version','scopeVersion','snapshotSha256','totalBytes','pageBytes','pageCount','pageIndex','hex'];
const fail=()=>{throw new SalaryInputError('CONTRACT_INVALID','No se pudo verificar el maestro completo. Conservamos el borrador; volvé a consultar.');};

export function salaryStreamFrame(frame,index,manifest=null){
 if(!salaryExact(frame,fields)||frame.version!==SALARY_STREAM_VERSION||!salaryHash(frame.scopeVersion)||!salaryHash(frame.snapshotSha256)||!Number.isSafeInteger(frame.totalBytes)||frame.totalBytes<1||frame.totalBytes>SALARY_STREAM_MAX_BYTES||frame.pageBytes!==SALARY_STREAM_PAGE_BYTES||frame.pageCount!==Math.ceil(frame.totalBytes/SALARY_STREAM_PAGE_BYTES)||!Number.isSafeInteger(index)||index<0||index>=frame.pageCount||frame.pageIndex!==index)fail();
 if(manifest&&fields.filter(k=>!['pageIndex','hex'].includes(k)).some(k=>frame[k]!==manifest[k]))fail();
 const bytes=Math.min(SALARY_STREAM_PAGE_BYTES,frame.totalBytes-index*SALARY_STREAM_PAGE_BYTES);
 if(typeof frame.hex!=='string'||frame.hex.length!==bytes*2||!/^[a-f0-9]+$/.test(frame.hex))fail();
 return frame;
}

// Only a verified complete snapshot reaches the catalog model. Display filters
// never participate in transport. No mutation is split into business requests.
export async function readSalaryBootstrap(fetchPage,{isCurrent=()=>true,digest=bytes=>crypto.subtle.digest('SHA-256',bytes)}={}){
 const current=()=>{if(!isCurrent())throw new DOMException('Consulta descartada','AbortError');};
 current();const first=salaryStreamFrame(await fetchPage(0,null),0);current();
 const bytes=new Uint8Array(first.totalBytes);
 try{
  for(let index=0;index<first.pageCount;index++){
   current();const frame=index===0?first:salaryStreamFrame(await fetchPage(index,first.snapshotSha256),index,first);current();
   const offset=index*SALARY_STREAM_PAGE_BYTES;
   for(let position=0;position<frame.hex.length;position+=2)bytes[offset+position/2]=Number.parseInt(frame.hex.slice(position,position+2),16);
  }
  current();const actual=Array.from(new Uint8Array(await digest(bytes)),b=>b.toString(16).padStart(2,'0')).join('');current();
  if(actual!==first.snapshotSha256)fail();
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail();}
  if(value?.scopeVersion!==first.scopeVersion)fail();
  return salaryBootstrap(value);
 }finally{bytes.fill(0);}
}
