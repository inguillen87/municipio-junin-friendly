import test from 'node:test';
import assert from 'node:assert/strict';
import {readSalaryBootstrap,salaryStreamFrame,SALARY_STREAM_MAX_BYTES,SALARY_STREAM_PAGE_BYTES} from '../assets/native-salary-stream-model.js';
import {bootstrap,proposal,uid} from './fixtures/native-salary-synthetic.js';
import {fullSalaryCatalogFixture} from './fixtures/native-salary-full-catalog-synthetic.js';
import {salaryStreamFixture} from './fixtures/native-salary-stream-synthetic.js';
import {salaryItems,salarySerialized} from '../assets/native-salary-catalog-model.js';

function complete(){
 const {items,history,classification}=fullSalaryCatalogFixture(),all=salaryItems([...history,...items]);
 return bootstrap({classification:{version:'c'.repeat(64),items:classification},catalog:{version:'b'.repeat(64),revision:1,items:all},proposals:Array.from({length:3},(_,n)=>proposal(all,{id:uid(20+n),baseItems:all}))});
}
test('multi-page history larger than4.5MB is returned only as one fully verified unchanged bootstrap',async()=>{
 const value=complete(),before=salarySerialized(value),{bytes,frames,snapshotSha256}=salaryStreamFixture(value),calls=[];
 assert.ok(bytes.length>4.5*1024*1024);assert.ok(frames.length>1);
 const result=await readSalaryBootstrap(async(index,sha)=>{calls.push({index,sha});return frames[index];});
 assert.deepEqual(result,value);assert.equal(result.catalog.items.length,3279);assert.equal(result.proposals.length,3);
 assert.equal(calls.length,frames.length);assert.equal(calls[0].sha,null);assert.ok(calls.slice(1).every(c=>c.sha===snapshotSha256));
 assert.equal(salarySerialized(value),before);assert.ok(frames.every(f=>Buffer.byteLength(JSON.stringify({ok:true,data:f}))<600000));
});
for(const [label,patch]of [
 ['version',{version:'native-salary-stream.v0'}],['scope',{scopeVersion:'b'.repeat(64)}],['snapshot',{snapshotSha256:'f'.repeat(64)}],
 ['page index',{pageIndex:0}],['page count',{pageCount:1}],['size',{totalBytes:1}],['chunk size',{pageBytes:1}],
 ['extra fields',{employeeName:'must never be accepted'}],['empty chunk',{hex:''}],['invalid hex',{hex:'zz'}],
 ])test('rejects changed '+label+' before exposing a partial master',async()=>{
 const {frames}=salaryStreamFixture(complete());let calls=0;
 await assert.rejects(readSalaryBootstrap(async index=>{calls++;return index===1?{...frames[index],...patch}:frames[index];}),e=>e.code==='CONTRACT_INVALID');
 assert.equal(calls,2);
});
test('a truncated but valid hexadecimal payload still fails the complete SHA256',async()=>{
 const {frames}=salaryStreamFixture(bootstrap());frames[0].hex='00'+frames[0].hex.slice(2);
 await assert.rejects(readSalaryBootstrap(async()=>frames[0]),e=>e.code==='CONTRACT_INVALID');
});
test('a UTF8 character split between byte pages is decoded only after complete verification',async()=>{
 const value=bootstrap(),raw=Buffer.from(JSON.stringify(value)),accent=raw.indexOf(Buffer.from('é'));
 assert.ok(accent>0&&accent<SALARY_STREAM_PAGE_BYTES);
 const padded=Buffer.concat([Buffer.alloc(SALARY_STREAM_PAGE_BYTES-accent-1,32),raw]),{frames}=salaryStreamFixture(padded);
 assert.equal(frames[0].hex.slice(-2),'c3');assert.equal(frames[1].hex.slice(0,2),'a9');
 assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(frames[0].hex,'hex')));
 assert.deepEqual(await readSalaryBootstrap(async index=>frames[index]),value);
});
test('page count and byte budgets are global; no oversized snapshot allocation occurs',()=>{
 const {frames}=salaryStreamFixture(bootstrap());
 for(const patch of [{totalBytes:0},{totalBytes:SALARY_STREAM_MAX_BYTES+1},{totalBytes:1.5},{pageCount:0},{pageBytes:SALARY_STREAM_PAGE_BYTES-1}])assert.throws(()=>salaryStreamFrame({...frames[0],...patch},0));
});
test('revocation or pagehide between pages stops further requests and never returns the partial source',async()=>{
 const {frames}=salaryStreamFixture(complete());let calls=0,active=true;
 await assert.rejects(readSalaryBootstrap(async index=>{calls++;if(index===1)active=false;return frames[index];},{isCurrent:()=>active}),e=>e.name==='AbortError');
 assert.equal(calls,2);
});
test('scope changes, incomplete bootstrap and invalid UTF8 are rejected after the verified full hash',async()=>{
 for(const value of [bootstrap({scopeVersion:'b'.repeat(64)}),bootstrap({complete:false}),Buffer.from([0xff])]){
  const {frames}=salaryStreamFixture(value);frames.forEach(f=>f.scopeVersion='a'.repeat(64));
  await assert.rejects(readSalaryBootstrap(async index=>frames[index]));
 }
});
test('network failure preserves the original source without an automatic write or replacement attempt',async()=>{
 const value=complete(),before=salarySerialized(value),{frames}=salaryStreamFixture(value);let calls=0;
 await assert.rejects(readSalaryBootstrap(async index=>{calls++;if(index===1)throw Object.assign(Error('synthetic503'),{status:503});return frames[index];}),/synthetic503/);
 assert.equal(calls,2);assert.equal(salarySerialized(value),before);
});
