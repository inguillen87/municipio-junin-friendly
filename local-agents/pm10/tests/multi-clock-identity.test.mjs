import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {collect,collectConfigured} from '../reader/lector-fichadas.mjs';
import {CaptureStore} from '../store.mjs';
import {parseWindowsRoute,requireMunicipalPrefix} from '../route-guard.mjs';
import {fakeKey,withClock,dataSet} from './fixture.mjs';
for(const serial of ['TEST-K20-A','TEST-K20-B','TEST-K20-C','TEST-K20-D','TEST-SF300-E'])test('configured reader verifies '+serial,async()=>{await withClock({serial,count:3},async(port)=>{const out=await collectConfigured({approved:true,host:'127.0.0.1',port,serial},{commKey:fakeKey(),approved:true,pacingMs:0});assert.equal(out.report.authenticationAccepted,true);assert.equal(out.report.attendanceTransferComplete,true);assert.equal(out.report.expectedSerial,serial);assert.equal(out.report.metadata.serialNumber,serial);});});
test('wrong serial never requests attendance',async()=>{await withClock({serial:'ACTUAL',count:1},async(port,commands)=>{const out=await collectConfigured({approved:true,host:'127.0.0.1',port,serial:'OTHER'},{commKey:fakeKey(),approved:true,pacingMs:0});assert.equal(out.report.error.code,'SERIAL_MISMATCH');assert.equal(commands.some(c=>c.code===1503||c.code===1504),false);});});
test('legacy reader still rejects arbitrary targets',async()=>{await assert.rejects(()=>collect({commKey:fakeKey(),approved:true,host:'192.0.2.11'}),e=>e.code==='TARGET_NOT_ALLOWED');});
test('configured target rejects host substitution and clears key',async()=>{const key=fakeKey();await assert.rejects(()=>collectConfigured({approved:true,host:'127.0.0.1',port:1234,serial:'TEST'},{commKey:key,approved:true,host:'192.0.2.11'}),e=>e.code==='TARGET_NOT_ALLOWED');assert.equal(key.every(b=>b===0),true);});
test('configured target requires explicit approval',async()=>{const key=fakeKey();await assert.rejects(()=>collectConfigured({approved:false,host:'127.0.0.1',port:1234,serial:'TEST'},{commKey:key,approved:true}),e=>e.code==='TARGET_IDENTITY_INVALID');assert.equal(key.every(b=>b===0),true);});
test('queues are isolated, replay-safe and incompatible with the PM10 sender',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'clock-synthetic-'));try{const raw=dataSet(3),a=await new CaptureStore(path.join(root,'a'),{identity:{clockId:'clock-a',serial:'TEST-A'}}).init(),b=await new CaptureStore(path.join(root,'b'),{identity:{clockId:'clock-b',serial:'TEST-B'}}).init();const sa=await a.save(raw),sb=await b.save(raw);assert.notEqual(sa.batchId,sb.batchId);assert.equal(a.summary().uniqueLocalRecords,3);assert.equal(b.summary().uniqueLocalRecords,3);assert.equal((await a.save(raw)).newUniqueRecords,0);const restored=await new CaptureStore(path.join(root,'a'),{identity:{clockId:'clock-a',serial:'TEST-A'}}).init();assert.equal((await restored.save(raw)).newUniqueRecords,0);await assert.rejects(()=>new CaptureStore(path.join(root,'a'),{identity:{clockId:'clock-a',serial:'OTHER'}}).init(),e=>e.code==='QUEUE_CORRUPT');await assert.rejects(()=>new CaptureStore(path.join(root,'a')).init(),e=>e.code==='QUEUE_CORRUPT');const manifest=JSON.parse(await readFile(path.join(root,'a','pending',sa.batchId,'manifest.json')));assert.equal(manifest.version,'clock-local-batch.v1');assert.equal(manifest.serial,'TEST-A');}finally{await rm(root,{recursive:true,force:true});}});
test('a /32 route must correspond to the selected clock',()=>{assert.equal(requireMunicipalPrefix('172.100.126.241/32','172.100.126.241'),'172.100.126.241/32');assert.throws(()=>requireMunicipalPrefix('172.100.97.131/32','172.100.126.241'));});

test('configured large clocks get a bounded transfer budget without changing legacy PM10',async()=>{
 await withClock({serial:'TEST-LARGE',count:3},async port=>{
  const out=await collectConfigured({approved:true,host:'127.0.0.1',port,serial:'TEST-LARGE'},{commKey:fakeKey(),approved:true,pacingMs:0,totalMs:900000});
  assert.equal(out.report.attendanceTransferComplete,true);
 });
 await assert.rejects(()=>collect({commKey:fakeKey(),approved:true,totalMs:180001}),e=>e.code==='INVALID_LIMIT');
 await assert.rejects(()=>collectConfigured({approved:true,host:'127.0.0.1',port:1234,serial:'TEST-LARGE'},{commKey:fakeKey(),approved:true,totalMs:900001}),e=>e.code==='INVALID_LIMIT');
});
