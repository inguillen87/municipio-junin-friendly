import {createHash} from 'node:crypto';
import {SALARY_STREAM_PAGE_BYTES,SALARY_STREAM_VERSION} from '../../assets/native-salary-stream-model.js';
export function salaryStreamFixture(value){
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
 const snapshotSha256=createHash('sha256').update(bytes).digest('hex');
 const pageCount=Math.ceil(bytes.length/SALARY_STREAM_PAGE_BYTES);
 const frames=Array.from({length:pageCount},(_,pageIndex)=>({
  version:SALARY_STREAM_VERSION,scopeVersion:value.scopeVersion??'a'.repeat(64),snapshotSha256,
  totalBytes:bytes.length,pageBytes:SALARY_STREAM_PAGE_BYTES,pageCount,pageIndex,
  hex:bytes.subarray(pageIndex*SALARY_STREAM_PAGE_BYTES,(pageIndex+1)*SALARY_STREAM_PAGE_BYTES).toString('hex'),
 }));
 return{bytes,frames,snapshotSha256};
}
