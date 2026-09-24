// Pruebas sintéticas: no se consulta ni modifica una base municipal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {continuousWorkdayFixture,workdayQuery} from './fixtures/continuous-workdays-synthetic.js';
import {getAttendancePreparte} from '../lib/internal-attendance-workdays.js';
import {PREPARTE_PRINCIPAL,PREPARTE_SESSION} from './fixtures/attendance-preparte-synthetic.js';
import {verifyPreparte,preparteNoveltyRows} from '../assets/attendance-preparte-model.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const options={site:'pm-10',period:'2026-09'};
async function source(){return continuousWorkdayFixture(workdayQuery({from:'2026-09-01',to:'2026-09-30'}),{rawOnly:true});}
async function read(raw,evidence){return {ok:true,...await getAttendancePreparte({query:async()=>[{result:raw}]},PREPARTE_PRINCIPAL,{...options,evidence},PREPARTE_SESSION)};}
function appendExtra(raw,{stream='another-contract',device,legajo}={}){
 const events=raw.events.filter(e=>e.legajo==='9001'&&[4,5].includes(e.code));
 for(const event of events){const next=structuredClone(event);next.eventRef=hash(stream+':'+event.eventRef);next.streamKey=hash(stream);
  next.deviceKey=device?hash(device):event.deviceKey;next.source.ordinal+=10000;next.localTimestamp=next.localTimestamp.replace('15:','19:').replace('17:','21:');next.occurredAt=next.occurredAt.replace('15:','19:').replace('17:','21:');
  if(legajo)next.legajo=legajo;raw.events.push(next);
 }
 raw.context.eventCount=raw.events.length;raw.context.recordCount=raw.events.length+raw.observations.length;
}
test('same person and legajo in two non-overlapping streams is not a single reviewable assignment',async()=>{
 const raw=await source();appendExtra(raw);const data=await read(raw),row=data.rows.find(r=>r.legajo==='9001');
 assert.equal(row.canPropose,false);assert.equal(row.extraSeconds,null);assert.match(row.issues.join(' '),/vínculo|equipo/);
 verifyPreparte(data,'2026-09','pm-10');assert.equal(data.payrollCalculated,false);assert.equal(data.payrollPosted,false);
});
test('same legajo on another device cannot silently increase recognized hours',async()=>{
 const raw=await source();appendExtra(raw,{device:'second-device'});const data=await read(raw),row=data.rows.find(r=>r.legajo==='9001');
 assert.equal(row.canPropose,false);assert.equal(row.extraSeconds,null);assert.equal(row.ordinarySeconds,null);
 const decisions=new Map([[row.key,{selected:true,hours:'04:00',cap:'3',percent:'3'}]]);
 assert.throws(()=>preparteNoveltyRows(data,decisions,{documentReference:'Listado de prueba',confirmed:true}),/incidencias/);
});
test('changing a single source stream invalidates its row evidence even with identical times',async()=>{
 const raw=await source(),before=await read(raw),row=before.rows.find(r=>r.legajo==='9001');
 for(const event of raw.events.filter(e=>e.legajo==='9001'))event.streamKey=hash('new-binding-same-time');
 const after=await read(raw),next=after.rows.find(r=>r.legajo==='9001');
 assert.equal(next.key,row.key);assert.equal(next.extraSeconds,row.extraSeconds);assert.equal(next.canPropose,true);
 assert.notEqual(next.evidenceHash,row.evidenceHash);
 await assert.rejects(read(raw,before.evidenceHash),{code:'ATTENDANCE_PREPARTE_CHANGED'});
});
test('equal names on different legajos remain separate, with unchanged valid sequence totals',async()=>{
 const raw=await source();appendExtra(raw,{legajo:'9901'});const data=await read(raw);
 const first=data.rows.find(r=>r.legajo==='9001'),second=data.rows.find(r=>r.legajo==='9901');
 assert.equal(first.name,second.name);assert.equal(first.canPropose,true);assert.equal(second.canPropose,true);
 assert.equal(first.extraSeconds,7200);assert.equal(second.extraSeconds,7200);assert.notEqual(first.key,second.key);
});
test('one stream keeps the established monthly result and exposes no private source identifiers',async()=>{
 const raw=await source(),data=await read(raw),row=data.rows.find(r=>r.legajo==='9001');
 assert.equal(row.canPropose,true);assert.equal(row.extraSeconds,7200);assert.equal(row.ordinarySeconds,20700);
 assert.ok(data.rows.every(r=>!('streamKey' in r)&&!('deviceKey' in r)&&!('personKey' in r)));
});
test('changing only the device invalidates both population and individual evidence',async()=>{
 const raw=await source(),before=await read(raw),first=before.rows.find(r=>r.legajo==='9001');
 for(const event of raw.events.filter(e=>e.legajo==='9001'))event.deviceKey=hash('replacement-device');
 const after=await read(raw),next=after.rows.find(r=>r.legajo==='9001');
 assert.equal(next.extraSeconds,first.extraSeconds);assert.notEqual(next.evidenceHash,first.evidenceHash);
 assert.notEqual(after.evidenceHash,before.evidenceHash);await assert.rejects(read(raw,before.evidenceHash),{code:'ATTENDANCE_PREPARTE_CHANGED'});
});
test('a clock receipt without identity changes retains prior source evidence',async()=>{
 const raw=await source(),before=await read(raw);
 raw.revision='dddddddd-dddd-5ddd-8ddd-ddddddddddde';raw.generatedAt='2026-09-30T23:00:00Z';
 const after=await read(raw,before.evidenceHash);assert.equal(after.evidenceHash,before.evidenceHash);
 assert.deepEqual(after.rows,before.rows);
});
test('source event order does not change the unique-stream result or the original records',async()=>{
 const raw=await source();appendExtra(raw,{device:'second-device'});const saved=structuredClone(raw),before=await read(raw);
 assert.deepEqual(raw,saved);const reversed=structuredClone(raw);reversed.events.reverse();
 const after=await read(reversed);assert.deepEqual(after.rows,before.rows);assert.equal(after.evidenceHash,before.evidenceHash);
});
test('blocked assignment keeps its underlying extra intervals without publishing them as recognized hours',async()=>{
 const raw=await source();appendExtra(raw);const data=await read(raw),blocked=data.rows.find(r=>r.legajo==='9001');
 assert.equal(blocked.extraIntervals,2);assert.equal(blocked.daysObserved,1);assert.equal(blocked.extraSeconds,null);
 assert.equal(blocked.canPropose,false);assert.ok(data.summary.withIncidents>0);
 assert.equal(raw.events.filter(e=>e.legajo==='9001'&&e.code===4).length,2);
});
