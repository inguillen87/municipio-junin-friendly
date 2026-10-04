import test from 'node:test';
import assert from 'node:assert/strict';
import {batch,bootstrap,id} from './fixtures/novelty-saved-review-synthetic.js';
import {monthlyDecisionAccess,monthlyDecisionAllowed,sameMonthlyDecisionAccess,monthlyDecisionPlan,
  monthlyDecisionUnchanged,monthlyDecisionAttempt,assertMonthlyDecisionReceipt} from '../assets/payroll-monthly-decisions-model.js';
import {historicalMonthlyTransitionReceipt} from '../assets/payroll-native-monthly-model.js';
import {transitionPayrollNoveltyV2,transitionPayrollNovelty} from '../lib/internal-payroll-novelty.js';
const access=()=>monthlyDecisionAccess(bootstrap());
const batches=(n,rows=60)=>Array.from({length:n},(_,i)=>({...batch(rows),id:id(1000+i)}));
const native=()=>{const b=batch(1),r=b.rows[0];b.contractVersion='payroll-novelty-batch.v2';b.sourceMode='individual';
  r.subject={contractId:r.employmentContractId,legajo:r.legajo,employeeName:'Persona sintética',identityToken:'a'.repeat(64),sourceCutoff:null,
    origin:'MUNICONTROL',registrationId:id(500),registeredAt:'2026-09-22T12:30:00.123456Z'};r.identityCurrent=true;return b;};
const response=(b,command='submit')=>({ok:true,replayed:false,data:{...structuredClone(b),version:b.version+1,status:{submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'}[command],
  exportable:command==='approve',rows:b.rows.map(({identityCurrent,...r})=>structuredClone(r))}});
test('complete decision review freezes 26 batches and 1560 rows independently of any view',()=>{
  const values=batches(26),p=monthlyDecisionPlan(values,'submit',null,access());assert.equal(p.rowCount,1560);assert.equal(p.batches.length,26);
  values[25].rows[59].amountCents='0';assert.equal(p.batches[25].rows[59].amountCents,'12345');assert.ok(Object.isFrozen(p.batches[25].rows[59]));
});
test('native and historical identities, null, explicit zero and exact extreme cents stay separate',()=>{
  const n=native(),h=batches(1,3)[0];h.rows[0].amountCents=null;h.rows[0].quantityDecimal='1';h.rows[1].amountCents='0';h.rows[2].amountCents='9223372036854775807';
  const p=monthlyDecisionPlan([n,h],'cancel',null,access());assert.equal(p.rowCount,4);assert.notEqual(p.batches[0].contractVersion,p.batches[1].contractVersion);
  assert.deepEqual(p.batches[1].rows.map(r=>r.amountCents),[null,'0','9223372036854775807']);
});
test('limits, duplicate IDs and one late forbidden command reject the whole review',()=>{
  assert.throws(()=>monthlyDecisionPlan(batches(11,500),'submit',null,access()),/5500/);
  assert.throws(()=>monthlyDecisionPlan(batches(101,1),'submit',null,access()),/100/);
  const v=batches(2);v[1].id=v[0].id;assert.throws(()=>monthlyDecisionPlan(v,'submit',null,access()),/repetido/);
  const many=batches(26);many[25].allowedCommands=['cancel'];assert.throws(()=>monthlyDecisionPlan(many,'submit',null,access()),/no admite/);
});
test('approval-only actor works without prepare; read and nominal or approval revocation fail closed',()=>{
  const a=access();const checker={...a,capabilities:a.capabilities.filter(c=>c!=='payroll.novelty.prepare')};
  assert.equal(monthlyDecisionAllowed(checker,'approve'),true);assert.equal(monthlyDecisionAllowed(checker,'submit'),false);
  for(const cap of ['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.approve'])assert.equal(monthlyDecisionAllowed({...checker,capabilities:checker.capabilities.filter(c=>c!==cap)},'approve'),false);
});
test('scope, identity and capability or limits drift require another review; cap order does not',()=>{
  const a=access();for(const change of [{scope:a.scope+'x'},{email:'other@example.invalid'},{role:'other'},{capabilities:[]},{limits:{...a.limits,maxRows:499}}])
    assert.equal(sameMonthlyDecisionAccess(a,{...a,...change}),false);
  assert.equal(sameMonthlyDecisionAccess(a,{...a,capabilities:[...a.capabilities].reverse()}),true);
});
test('same-version last-row changes and forbidden self-review do not pass send preflight',()=>{
  const p=monthlyDecisionPlan(batches(26),'submit',null,access()),v=structuredClone(p.batches);
  assert.equal(monthlyDecisionUnchanged(p,v),true);v[25].rows[59].observation='Cambio posterior';assert.equal(monthlyDecisionUnchanged(p,v),false);
  v[25]=structuredClone(p.batches[25]);v[25].allowedCommands=[];assert.equal(monthlyDecisionUnchanged(p,v),false);
});
test('uncertain attempt seals exact decision, body, reference and key',()=>{
  const p=monthlyDecisionPlan(batches(1),'cancel',null,access()),b=p.batches[0],key=id(700),attempt=monthlyDecisionAttempt(p,b,key);
  assert.ok(Object.isFrozen(attempt));assert.deepEqual(JSON.parse(attempt.body),{command:'cancel',payload:{batchId:b.id,expectedVersion:1,reasonCode:'cancelled_by_preparer',reasonReference:'ref:'+key}});
  assert.throws(()=>monthlyDecisionAttempt(p,structuredClone(b),key),/no pertenece/);
});
test('receipt pins scope, row count, identity and all rows; redacted historical receipt remains explicit',()=>{
  for(const b of [batches(1)[0],native()]){const p=monthlyDecisionPlan([b],'submit',null,access()),attempt=monthlyDecisionAttempt(p,p.batches[0],id(800)),r=response(b);
    assertMonthlyDecisionReceipt(b,attempt,r);
    for(const [key,value]of [['id',id(99)],['rowCount',2],['periodMonth','2026-10-01'],['payrollCalculated',true]]){const bad=structuredClone(r);bad.data[key]=value;assert.throws(()=>assertMonthlyDecisionReceipt(b,attempt,bad));}
    const bad=structuredClone(r);bad.data.rows[0].amountCents='0';assert.throws(()=>assertMonthlyDecisionReceipt(b,attempt,bad),/filas/);
    const redacted=structuredClone(r);redacted.data.rows=[];
    if(b.contractVersion.endsWith('v1'))assertMonthlyDecisionReceipt(b,attempt,redacted);else assert.throws(()=>assertMonthlyDecisionReceipt(b,attempt,redacted));
  }
});
test('reject requires original reason code and approved receipt cannot claim payroll or another version',()=>{
  const b=batches(1)[0];b.status='submitted';b.version=2;b.allowedCommands=['approve','reject'];
  assert.throws(()=>monthlyDecisionPlan([b],'reject','invented',access()),/motivo/);
  const p=monthlyDecisionPlan([b],'approve',null,access()),attempt=monthlyDecisionAttempt(p,p.batches[0],id(900)),r=response(b,'approve');assertMonthlyDecisionReceipt(b,attempt,r);
  r.data.version++;assert.throws(()=>assertMonthlyDecisionReceipt(b,attempt,r));
});
test('v2 historical transition restores dates from the immutable event while retaining every row and v1 source',()=>{
  const b=response(batches(1)[0]).data;b.updatedAt='2026-10-01T12:30:00.123456Z';b.submittedAt='2026-10-01T12:30:00.123456Z';b.decidedAt=null;
  const original=historicalMonthlyTransitionReceipt(b),raw={...structuredClone(b),decidedAt:'2026-10-02T14:00:00.000001Z'};
  assert.deepEqual(historicalMonthlyTransitionReceipt(raw),original);assert.equal(raw.decidedAt,'2026-10-02T14:00:00.000001Z');
  assert.equal(historicalMonthlyTransitionReceipt(raw).rows,raw.rows);
  const approved={...raw,status:'approved',version:3,exportable:true,updatedAt:'2026-10-02T14:00:00.000001Z'};
  assert.equal(historicalMonthlyTransitionReceipt(approved).decidedAt,approved.updatedAt);assert.equal(historicalMonthlyTransitionReceipt(approved).submittedAt,b.submittedAt);
  assert.throws(()=>historicalMonthlyTransitionReceipt({...raw,updatedAt:'fecha inventada'}));
  const n=response(native()).data;assert.equal(historicalMonthlyTransitionReceipt(n),n);
});
test('real v2 facade projects historical event dates without modifying command, key, scope, rows or legacy response',async()=>{
  const b=response(batches(1)[0]).data;b.updatedAt='2026-10-01T12:30:00.123456Z';b.submittedAt=b.updatedAt;b.decidedAt='2026-10-02T14:00:00.000001Z';
  const original=structuredClone(b),calls=[],sql={query:async(text,values)=>{calls.push({text,values});return [{result:{replayed:true,data:structuredClone(b)}}];}};
  const principal={user:{email:'qa@example.invalid'},tenant:{id:id(1),membershipId:id(2),source:'membership'}},session={id:id(3),email:'qa@example.invalid',version:2,releaseSha:'a'.repeat(40)};
  const payload={batchId:b.id,expectedVersion:1,reasonCode:'ready_for_review',reasonReference:null},key=id(801);
  const result=await transitionPayrollNoveltyV2(sql,principal,session,'submit',payload,key);
  assert.equal(result.data.decidedAt,null);assert.equal(result.data.submittedAt,b.updatedAt);assert.deepEqual(result.data.rows,original.rows);assert.deepEqual(b,original);
  assert.match(calls[0].text,/payroll_novelty_transition_v2/);assert.deepEqual(calls[0].values.slice(1,7),[b.id,'submit',1,'ready_for_review',null,key]);
  const legacy=await transitionPayrollNovelty(sql,principal,session,'submit',payload,key);
  assert.deepEqual(legacy.data,original);assert.match(calls[1].text,/payroll_novelty_transition_v1/);
});
