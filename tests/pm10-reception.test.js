import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validatePm10Payload,assertPm10Receipt,pm10Hash,receivePm10} from '../lib/internal-pm10-reception.js';
import {assertPm10Status,getPm10Status} from '../lib/internal-pm10-status.js';
import {createPm10Receiver} from '../api/attendance-pm10.js';
const uuid='a1111111-1111-4111-8111-111111111111',sha='a'.repeat(40);
function payload(){const bytes=Buffer.alloc(40,1),rh=pm10Hash(bytes),sh='a'.repeat(64);return {version:'pm10-delivery.v1',serial:'CQTU225360168',batchId:pm10Hash(sh+':'+rh),snapshotSha256:sh,recordsSha256:rh,totalRecords:1,partStart:0,snapshotRecordCount:1,capturedAt:'2026-09-13T09:00:00.000Z',ordinals:[1],partSha256:rh,recordsBase64:bytes.toString('base64')};}
function receipt(p){return {version:'pm10-receipt.v1',receiptId:uuid,batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,count:1,newCanonical:1,duplicates:0,observed:0,receivedAt:'2026-09-13T09:10:00.000Z',persisted:true,payrollModified:false,replayed:false};}
test('part and receipt obey receiver contract',()=>{const p=payload(),r=receipt(p);assert.equal(validatePm10Payload(p),p);assert.equal(assertPm10Receipt(r,p),r);});
for(const change of [{tenantId:uuid},{serial:'wrong'},{capturedAt:'2026-02-30T09:00:00.000Z'},{capturedAt:'2026-09-13'},{totalRecords:2},{partStart:1},{recordsBase64:'YWJj'},{partSha256:'f'.repeat(64)},{ordinals:[0]},{ordinals:[1,2]},{ordinals:['1']},{snapshotRecordCount:0},{totalRecords:104858},{recordsSha256:'0'.repeat(64)}])test('receiver rejects mutated input '+Object.keys(change),()=>assert.throws(()=>validatePm10Payload({...payload(),...change})));
test('receiver SQL is parameterized and emits only verified counters',async()=>{const p=payload(),r=receipt(p);let called=0;const out=await receivePm10({query:async(sql,args)=>{called++;assert.match(sql,/attendance_pm10_receive_v1/);assert.equal(args[0],'qa-connector');assert.equal(args[1],'b'.repeat(64));assert.deepEqual(JSON.parse(args[2]),p);assert.equal(args[3],sha);return[{result:r}];}},'qa-connector','b'.repeat(64),p,sha);assert.deepEqual(out,r);assert.equal(called,1);});
for(const [message,status] of [['PM10_AUTH_DENIED',401],['PM10_BUSY',409],['PM10_PAYLOAD_INVALID',400],['PM10_IDEMPOTENCY_CONFLICT',409],['PM10_BINDING_REQUIRED',503],['unrecognized private error with DNI',503]])test('database failure does not leak payload '+message.split(' ')[0],async()=>{await assert.rejects(receivePm10({query:async()=>{throw Error(message);}},'qa-connector','b'.repeat(64),payload(),sha),e=>e.status===status&&!e.message.includes('DNI'));});
function status(){return{version:'pm10-status.v1',checkedAt:'2026-09-13T09:00:00.000Z',connectorState:'suspended',baselineRecords:111,summary:{receipts:0,newMarks:0,observations:0,knownRecords:0,lastReceivedAt:null,lastCapturedAt:null},records:[],nominalReadAllowed:false,physicalClockVerified:false,payrollModified:false};}
test('status keeps suspended setup distinct from physical verification',()=>assert.equal(assertPm10Status(status()).connectorState,'suspended'));
for(const change of [{physicalClockVerified:true},{payrollModified:true},{baselineRecords:-1},{connectorState:'online'},{records:[{personLabel:'Private identity'}]},{summary:{receipts:0}}])test('status rejects misleading or malformed output '+Object.keys(change),()=>assert.throws(()=>assertPm10Status({...status(),...change})));
test('no nominal permission means no name or legajo in output',()=>{const x=status();x.records=[{occurredAt:null,receivedAt:x.checkedAt,personLabel:'A real name',legajo:'1',state:'observed',issueCodes:['timestamp_invalid'],punchCode:0,verificationCode:1}];assert.throws(()=>assertPm10Status(x));x.records[0].personLabel='Identidad reservada';x.records[0].legajo=null;assert.equal(assertPm10Status(x),x);});
test('reader rejects invalid principal without touching SQL',async()=>{let calls=0;await assert.rejects(getPm10Status({query:async()=>calls++},{},{}));assert.equal(calls,0);});
test('migration never activates a connector or grants raw table reads',()=>{const s=fs.readFileSync('scripts/migrations/055-pm10-continuous-reception.sql','utf8');assert.doesNotMatch(s,/SET status\s*=\s*'active'/i);assert.match(s,/REVOKE ALL ON attendance_pm10_receipt,attendance_pm10_record FROM PUBLIC,municontrol_actions_runtime_app/);assert.match(s,/'clock-v1:'/);assert.match(s,/'zk40-v1:'/);assert.match(s,/attendance_clock_snapshot_row/);assert.match(s,/clock-owner-import:/);assert.doesNotMatch(s,/CREATE TABLE[^;]*(?:dni|fingerprint_template)/i);});

function receiverSql(){
 const migration=fs.readFileSync('scripts/migrations/055-pm10-continuous-reception.sql','utf8');
 return migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION attendance_pm10_receive_v1('),migration.indexOf('REVOKE ALL ON FUNCTION attendance_pm10_receive_v1(')).replace(/--[^\n]*/g,'');
}
test('SQL tenant lifecycle authority is locked before both replay and all writes',()=>{
 const sql=receiverSql();
 const gate=sql.match(/SELECT sb\.\* INTO b[\s\S]*?FOR SHARE OF ([^;]+);/);
 assert.ok(gate,'The receiver must retain the certified binding gate');
 assert.match(gate[0],/JOIN platform_tenant tenant ON tenant\.id=p\.tenant_id AND tenant\.status='active'/);
 assert.match(gate[1],/\btenant\b[\s\S]*\bNOWAIT\b/);
 assert.match(sql.slice(gate.index+gate[0].length),/^\s*IF NOT FOUND THEN RAISE EXCEPTION 'PM10_BINDING_REQUIRED'/);
 assert.ok(gate.index<sql.indexOf('SELECT * INTO old FROM attendance_pm10_receipt'),'A suspended tenant cannot replay an ACK');
 for(const match of sql.matchAll(/\b(?:INSERT INTO|UPDATE attendance_|DELETE FROM)\b/g))assert.ok(gate.index<match.index,'Lifecycle authority precedes each mutation');
});
test('SQL mapping locks match revoke and acquire rows without waiting before mapping or FK writes',()=>{
 const sql=receiverSql(),legacy=fs.readFileSync('scripts/migrations/022-attendance-device-gateway.sql','utf8');
 const guard=legacy.slice(legacy.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_identity_guard_v1()'),legacy.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_punch_guard_v1()'));
 const originalKey=guard.match(/pg_advisory_xact_lock\(hashtextextended\(([\s\S]*?),\s*0\s*\)\s*\)/)?.[1];
 assert.ok(originalKey,'Revocation must retain its identity advisory key');
 const lock=sql.match(/IF NOT pg_try_advisory_xact_lock\(hashtextextended\(([\s\S]*?),\s*0\s*\)\s*\)\s*THEN RAISE EXCEPTION 'PM10_BUSY';END IF;/g)?.find(x=>x.includes("'attendance-identity:'"));
 assert.ok(lock,'Identity lock contention must reject the entire part for retry');
 const currentKey=lock.match(/hashtextextended\(([\s\S]*?),\s*0\s*\)/)[1];
 const normalize=x=>x.replace(/\s+/g,'');
 assert.equal(normalize(currentKey),normalize(originalKey.replaceAll('NEW.tenant_id','c.tenant_id').replaceAll('NEW.device_id','d.id').replaceAll('NEW.identity_hmac_sha256','ih')));
 const rowLock=sql.match(/PERFORM 1 FROM attendance_identity_map m\s+WHERE m\.tenant_id=c\.tenant_id AND m\.device_id=d\.id AND m\.identity_hmac_sha256=ih\s+FOR SHARE OF m NOWAIT;/);
 assert.ok(rowLock,'Do not hold the advisory lock while waiting on a row held by revoke');
 const lockAt=sql.indexOf(lock),selection=sql.indexOf('SELECT count(*),min(m.id::text)::uuid');
 assert.ok(lockAt<rowLock.index&&rowLock.index<selection);
 assert.ok(selection<sql.indexOf('INSERT INTO attendance_canonical_punch'));
 assert.match(sql,/EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PM10_BUSY'/);
});
test('receiver lock contention returns explicit retryable conflict without a receipt',async()=>{
 const body=payload(),token='q'.repeat(43);let attempts=0;
 const receiver=createPm10Receiver({env:{INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:sha},getSql:async()=>({query:async()=>{attempts++;throw Object.assign(Error('PM10_BUSY'),{code:'P0001'});}})});
 const invoke=async(options)=>{
  const response={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
  await receiver({method:'POST',headers:options.headers,query:{},body:JSON.parse(options.body)},response);
  assert.equal(response.code,409);assert.equal(response.value.ok,false);assert.equal(response.value.code,'PM10_BUSY');assert.ok(!Object.hasOwn(response.value,'receipt'));
 };
 await invoke({headers:{authorization:'Bearer '+token,'content-type':'application/json','x-pm10-connector':'qa-pm10-connector'},body:JSON.stringify(body)});
 assert.equal(attempts,1);
});
