// SPDX-License-Identifier: GPL-2.0-only
// Synthetic records only. Protocol fixtures listen on loopback, never a clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {decodeAttendance,collectConfigured} from '../reader/lector-fichadas.mjs';
import {ensureCapture} from '../service.mjs';
import {CaptureStore,hash} from '../store.mjs';
import {dataSet,packedTime,fakeKey,withClock} from './fixture.mjs';

const SERIAL='QA-COUNT-RACE';
const read=(port)=>collectConfigured({approved:true,host:'127.0.0.1',port,serial:SERIAL},{approved:true,commKey:fakeKey(),pacingMs:0,timeoutMs:500,totalMs:10000});

test('synthetic reported-volume race decodes the unique forty-byte layout and every timestamp',()=>{
 const raw=dataSet(12869),before=Buffer.from(raw),parsed=decodeAttendance(raw,12868,12870);
 assert.equal(raw.length,514764);assert.equal(raw.readUInt32LE(),514760);
 assert.equal(parsed.status,'DECODED_CANDIDATE');assert.equal(parsed.layout,'legacy-40-byte-candidate');
 assert.equal(parsed.recordCount,12869);assert.equal(parsed.records.length,12869);assert.equal(parsed.invalidTimestampCount,0);
 assert.deepEqual(parsed.countEvidence,{mode:'strict_monotonic_interval',before:12868,after:12870,recordCount:12869,completeCoverageAsserted:false});
 assert.ok(raw.equals(before));
 for(const [index,row]of parsed.records.entries()){assert.equal(row.rawRecordSha256,hash(raw.subarray(4+index*40,44+index*40)));assert.equal(row.timestampError,null);}
});

test('the first arriving record can lie strictly between zero and two without an invented row',()=>{
 const parsed=decodeAttendance(dataSet(1),0,2);assert.equal(parsed.layout,'legacy-40-byte-candidate');assert.equal(parsed.recordCount,1);assert.equal(parsed.records.length,1);
});

for(const [name,before,after,count]of [
 ['decreasing',11,9,10],['equal unrelated',9,9,10],['below before',11,13,10],['above after',7,9,10],
 ['missing before',undefined,11,10],['missing after',9,undefined,10],['string before','9',11,10],['string after',9,'11',10],
 ['fractional before',9.5,11,10],['fractional after',9,10.5,10],['negative before',-1,11,10],['infinite after',9,Infinity,10],
 ['unsafe after',9,Number.MAX_SAFE_INTEGER+1,10],['outside supported counter limit',99999,100001,100000]
])test('intermediate layout refuses '+name,()=>{const parsed=decodeAttendance(dataSet(count),before,after);assert.equal(parsed.status,'LAYOUT_UNRESOLVED');assert.equal(parsed.layout,null);assert.equal(parsed.records.length,0);});

for(const [before,after,count]of [[4,26,5],[4,20,6]])test('an interval with another plausible record size stays unresolved '+[before,after,count],()=>{
 const parsed=decodeAttendance(dataSet(count),before,after);assert.equal(parsed.status,'LAYOUT_UNRESOLVED');assert.equal(parsed.layout,null);
});

for(const [before,after]of [[9,11],[4,6]])test('the new interval rule does not authorize an eight or sixteen-byte layout '+before,()=>{
 const parsed=decodeAttendance(dataSet(2),before,after);assert.equal(parsed.status,'LAYOUT_UNRESOLVED');assert.equal(parsed.layout,null);
});

test('wrong length header and truncated payload still reject a numerically plausible interval',()=>{
 const header=dataSet(10);header.writeUInt32LE(header.readUInt32LE()+40);
 for(const raw of [header,dataSet(10).subarray(0,403),Buffer.alloc(3)])assert.equal(decodeAttendance(raw,9,11).status,'LAYOUT_UNRESOLVED');
});

for(const index of [0,12868])test('one invalid civil timestamp anywhere blocks the new interval layout at '+index,()=>{
 const raw=dataSet(12869);packedTime(2026,2,31).copy(raw,4+index*40+27);
 const parsed=decodeAttendance(raw,12868,12870);assert.equal(parsed.status,'LAYOUT_UNRESOLVED');assert.equal(parsed.layout,null);assert.equal(parsed.invalidTimestampCount,1);assert.equal(parsed.records.length,0);
});

test('valid leap-day records remain candidates without treating UID or direction as approved identity',()=>{
 const raw=dataSet(3);for(let i=0;i<3;i++){raw.fill(0,4+i*40+2,4+i*40+26);packedTime(2024,2,29).copy(raw,4+i*40+27);}
 const parsed=decodeAttendance(raw,2,4);assert.equal(parsed.recordCount,3);assert.equal(parsed.invalidTimestampCount,0);assert.equal(parsed.nonDniOrUidCount,3);
 assert.ok(parsed.records.every(row=>row.direction==='unknown'&&row.identityState==='DNI_REQUIRES_CANONICAL_MATCH'));
});

test('previous exact endpoint and empty results retain their legacy shape',()=>{
 for(const [before,after,count]of [[3,3,3],[3,4,3],[3,4,4]]){const p=decodeAttendance(dataSet(count),before,after);assert.equal(p.status,'DECODED_CANDIDATE');assert.equal(p.countEvidence,undefined);assert.equal(p.recordCount,count);}
 const empty=decodeAttendance(dataSet(0),0,0);assert.equal(empty.status,'DECODED_EMPTY');assert.equal(empty.layout,null);assert.equal(empty.recordCount,0);
 // Ambiguous exact endpoint evidence must not be rescued by an interval.
 assert.equal(decodeAttendance(dataSet(2),2,10).status,'LAYOUT_UNRESOLVED');
});

test('real loopback transfer, source queue and replay preserve exact intermediate snapshot bytes',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'clock-count-race-'));
 try{await withClock({serial:SERIAL,count:12868,afterCount:12870,raw:dataSet(12869),fragment:true},async(port,commands,raw)=>{
  const result=await read(port);assert.equal(result.report.status,'ATTENDANCE_DOWNLOADED_FOR_REVIEW');assert.equal(result.report.authenticationAccepted,true);
  assert.equal(result.report.metadata.serialNumber,SERIAL);assert.equal(result.report.metadata.countsBefore.counts.attendanceRecordsReported,12868);assert.equal(result.report.metadata.countsAfter.counts.attendanceRecordsReported,12870);
  assert.equal(result.report.attendanceTransferComplete,true);assert.equal(result.report.cleanup.bufferReleaseConfirmed,true);assert.equal(result.report.cleanup.exitConfirmed,true);
  assert.equal(result.report.transfer.confirmedChunkBytes,raw.length);assert.equal(result.report.transfer.rawSha256,hash(raw));assert.equal(ensureCapture(result,SERIAL),result.report);
  assert.match(result.report.observations.join(' '),/No se declaro cobertura completa/);
  assert.equal(commands.filter(c=>c.code===1102).length,1);assert.equal(commands.at(-1).code,1001);assert.ok(commands.every(c=>[1000,1102,11,50,201,1503,1504,1502,1001].includes(c.code)));
  const store=await new CaptureStore(dir,{identity:{clockId:'qa-count-race',serial:SERIAL},freeBytes:async()=>1e10}).init();
  const saved=await store.save(result.raw,{capturedAt:'2026-09-22T10:01:00.000Z'});assert.equal(saved.snapshotRecordCount,12869);assert.equal(saved.snapshotSha256,hash(raw));
  const manifest=JSON.parse(await readFile(path.join(dir,'pending',saved.batchId,'manifest.json'))),bytes=await readFile(path.join(dir,'pending',saved.batchId,'records.bin'));
  assert.equal(manifest.recordsSha256,hash(bytes));assert.equal(manifest.clockId,'qa-count-race');assert.equal(manifest.cloudConfirmed,false);
  const again=await new CaptureStore(dir,{identity:{clockId:'qa-count-race',serial:SERIAL},freeBytes:async()=>1e10}).init();assert.equal((await again.save(raw)).newUniqueRecords,0);
 });}finally{await rm(dir,{recursive:true,force:true});}
});

for(const [scenario,error]of [[{badChecksum:true},'CHECKSUM_MISMATCH'],[{omitAck:true},'RESPONSE_TIMEOUT'],[{ackSid:42},'SESSION_MISMATCH']])test('racing counters never rescue a failed wire transfer: '+error,async()=>{
 await withClock({serial:SERIAL,count:9,afterCount:11,raw:dataSet(10),...scenario},async port=>{const result=await read(port);assert.equal(result.report.error.code,error);assert.throws(()=>ensureCapture(result,SERIAL));});
});

test('complete authenticated transfer with an invalid last timestamp remains unqueueable',async()=>{
 const raw=dataSet(3);packedTime(2026,2,31).copy(raw,4+2*40+27);
 await withClock({serial:SERIAL,count:2,afterCount:4,raw},async port=>{const result=await read(port);assert.equal(result.report.attendanceTransferComplete,true);assert.equal(result.report.cleanup.exitConfirmed,true);assert.equal(result.report.status,'RAW_DOWNLOADED_LAYOUT_PENDING');assert.throws(()=>ensureCapture(result,SERIAL),{code:'LAYOUT_NOT_CONFIRMED'});});
});
