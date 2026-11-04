import test from 'node:test';
import assert from 'node:assert/strict';
import {validPm10Status, pm10ReceptionHealth, pm10AgeLabel, pm10TechnicalDiagnostic, PM10_RECENT_RECEIPT_MS} from '../assets/pm10-reception.js';
function source() {
  return {ok:true, version:'pm10-status.v1', checkedAt:'2026-09-15T12:00:00.000Z', connectorState:'active',
    baselineRecords:100, summary:{receipts:2,newMarks:3,knownRecords:100,observations:1,
      lastReceivedAt:'2026-09-15T11:59:00Z',lastCapturedAt:'2026-09-14T09:00:00Z'},
    nominalReadAllowed:true, physicalClockVerified:false, payrollModified:false,
    records:[{personLabel:'PERSONA PRIVADA QA',legajo:'00123',occurredAt:'2026-09-14T09:00:00Z',receivedAt:'2026-09-15T11:59:00Z',state:'mapped'}]};
}
test('frontend status accepts the existing v1 contract without touching the DOM',()=>assert.equal(validPm10Status(source()),true));
test('recent receipt is not physical connectivity, autonomy, or empty queue',()=>{
  const h=pm10ReceptionHealth(source());assert.equal(h.confirmed,true);assert.equal(h.physicalClockVerified,false);
  assert.equal(h.autonomyVerified,false);assert.equal(h.queueDepth,null);assert.equal(h.payrollModified,false);
  assert.equal(h.receivedAgeMs,60000);assert.equal(h.capturedAgeMs,27*3600000);
});
test('old receipt never keeps the active connector green',()=>{
  const s=source();s.summary.lastReceivedAt='2026-09-14T12:00:00Z';const h=pm10ReceptionHealth(s);
  assert.equal(h.state,'older');assert.equal(h.confirmed,false);assert.equal(h.label,'Sin acuse reciente');
});
test('fifteen minute threshold follows the server cut',()=>{
  const s=source();s.summary.lastReceivedAt='2026-09-15T11:45:00Z';
  assert.equal(pm10ReceptionHealth(s).state,'recent');assert.equal(pm10ReceptionHealth(s,1).state,'older');
  assert.equal(PM10_RECENT_RECEIPT_MS,900000);
});
test('elapsed time ages the same server observation without trusting Date.now',()=>{
  const saved=Date.now;Date.now=()=>0;
  try{assert.equal(pm10ReceptionHealth(source(),45000).receivedAgeMs,105000);}finally{Date.now=saved;}
});
test('a stale query loses green even if the last receipt was recent',()=>{
  assert.equal(pm10ReceptionHealth(source(),90000).queryFresh,true);
  const h=pm10ReceptionHealth(source(),90001);assert.equal(h.queryFresh,false);assert.equal(h.confirmed,false);
});
test('pausing describes the observation as paused, not as a current poll',()=>{
  const h=pm10ReceptionHealth(source(),0,true);assert.equal(h.queryLabel,'Actualización pausada');assert.equal(h.confirmed,false);
});
for (const state of ['suspended','retired','not_configured']) test('connector '+state+' is never green',()=>{
  assert.equal(pm10ReceptionHealth({...source(),connectorState:state}).confirmed,false);
});
test('no receipt has no fabricated age',()=>{
  const s=source();s.summary={receipts:0,newMarks:0,knownRecords:0,observations:0,lastReceivedAt:null,lastCapturedAt:null};s.records=[];
  const h=pm10ReceptionHealth(s);assert.equal(h.state,'no_receipts');assert.equal(h.receivedAgeMs,null);assert.equal(h.receivedLabel,'Sin registro');
});
for(const key of ['lastCapturedAt','lastReceivedAt'])test('future '+key+' needs review instead of a recent green flag',()=>{
  const s=source();s.summary[key]='2026-09-15T12:01:00Z';const h=pm10ReceptionHealth(s);
  assert.equal(h.state,'review');assert.equal(h.confirmed,false);
});
test('inconsistent receipt counters require review',()=>{
  const s=source();s.summary.receipts=0;assert.equal(pm10ReceptionHealth(s).state,'review');
  s.summary.receipts=1;s.summary.lastReceivedAt=null;assert.equal(pm10ReceptionHealth(s).state,'review');
});
test('independent summary maxima never yield fabricated transit latency',()=>{
  const s=source();s.summary.lastCapturedAt='2026-09-15T11:59:30Z';
  assert.equal(pm10ReceptionHealth(s).state,'recent');assert.ok(!('latencyMs' in pm10TechnicalDiagnostic(s)));
});
for (const age of [-1,NaN,Infinity])test('invalid elapsed time fails closed '+age,()=>assert.throws(()=>pm10ReceptionHealth(source(),age),/PM10_STATUS_INVALID/));
for (const change of [{checkedAt:20260915},{checkedAt:'2026-09-15'}, {checkedAt:'nonsense'}, {physicalClockVerified:true},{payrollModified:true},{connectorState:'online'},{records:[{personLabel:'x'}]}])test('malformed status '+JSON.stringify(change),()=>assert.equal(validPm10Status({...source(),...change}),false));
test('nominal permission cannot be bypassed with a source label or a numeric legajo',()=>{
  const s=source();s.nominalReadAllowed=false;assert.equal(validPm10Status(s),false);
  s.records[0].personLabel='Identidad reservada';s.records[0].legajo=null;assert.equal(validPm10Status(s),true);
  s.nominalReadAllowed=true;s.records[0].legajo=123;assert.equal(validPm10Status(s),false);
});
test('JSON diagnosis is a strict allowlist, never copies records or extra source keys',()=>{
  const s=source();s.credentials='PRIVATE';s.summary.extra='PRIVATE';const d=pm10TechnicalDiagnostic(s,40000,true);
  const serialized=JSON.stringify(d);assert.doesNotMatch(serialized,/PERSONA PRIVADA|00123|credentials|PRIVATE/);
  assert.equal(d.schema,'pm10-reception-diagnostic.v1');assert.equal(d.summary.newMarks,3);
  assert.equal(d.reception.queryAgeMs,40000);assert.equal(d.reception.refreshPaused,true);
  assert.equal(d.sourceCheckedAt,s.checkedAt);assert.equal(d.queueDepth,null);
});
for(const [ms,label] of [[0,'Hace menos de 1 min'],[60000,'Hace 1 min'],[3600000,'Hace 1 h'],[3660000,'Hace 1 h 1 min'],[86400000,'Hace 1 d'],[90000000,'Hace 1 d 1 h'],[null,'Fecha por revisar'],[-1,'Fecha por revisar']])test('age label '+ms,()=>assert.equal(pm10AgeLabel(ms),label));
