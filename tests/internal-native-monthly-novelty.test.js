import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNativePayrollNoveltyDraft, normalizePayrollNoveltyDraft,
  getPayrollNoveltyBootstrapV2, getPayrollNoveltyEmployeeV2, readPayrollNoveltyV2,
  prepareNativePayrollNovelty, transitionPayrollNoveltyV2, exportPayrollNoveltyV2 }
  from '../lib/internal-payroll-novelty.js';

const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const principal={user:{email:'qa@example.test'},tenant:{id:uid(1),membershipId:uid(2),source:'membership'}};
const session={id:uid(3),email:'qa@example.test',version:2,releaseSha:'a'.repeat(40)};
const subject=()=>({contractId:uid(4),legajo:'19001',employeeName:'Alta de ensayo',identityToken:'b'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:uid(5),registeredAt:'2026-09-22T12:00:00.000000Z'});
const row=()=>({rowOrdinal:1,legajo:'19001',conceptSourceId:'80',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:'1.5',amountCents:null,movementType:'standard',legalInstrument:null,observation:'Solicitud sintética revisada',forced:false});
const draft=()=>({sourceMode:'individual',periodMonth:'2026-10-01',payrollType:'monthly',rows:[{...row(),contractId:uid(4),identityToken:'b'.repeat(64)}]});
function batch({mode='detail',status='draft',version=1,native=true}={}) {
  const r={...row(),employmentContractId:uid(4),issues:[],...(native?{subject:subject(),...(mode==='receipt'?{}:{identityCurrent:true})}:{})};
  return {id:uid(6),contractVersion:'payroll-novelty-batch.'+(native?'v2':'v1'),sourceMode:'individual',periodMonth:'2026-10-01',payrollType:'monthly',status,version,rowCount:1,exportable:status==='approved',grhMutation:false,payrollCalculated:false,payrollPosted:false,rows:[r],...(['detail','bootstrap'].includes(mode)?{allowedCommands:[],canExport:status==='approved'}:{})};
}
function connection(result) {
  const calls=[];return {calls,query:async(sql,values)=>{calls.push({sql,values});return [{result:structuredClone(result)}];}};
}
const read=(fn,result,...args)=>{const sql=connection(result);return {sql,result:fn(sql,principal,session,...args)};};
const errorCode=(code)=>e=>e.code===code;

test('native monthly draft binds the exact UUID/token and keeps absent amounts distinct from zero',()=>{
  const source=draft(),copy=structuredClone(source),normal=normalizeNativePayrollNoveltyDraft(source);
  assert.deepEqual(source,copy);assert.equal(normal.contractVersion,'payroll-novelty-batch.v2');
  assert.deepEqual(normal.rows,source.rows);assert.equal(normal.rows[0].amountCents,null);
  const zero=draft();zero.rows[0].amountCents='0';zero.rows[0].quantityDecimal=null;
  assert.equal(normalizeNativePayrollNoveltyDraft(zero).rows[0].amountCents,'0');
  const exact=draft();exact.rows[0].amountCents='9007199254740993';
  assert.equal(normalizeNativePayrollNoveltyDraft(exact).summary.totalAmountCents,'9007199254740993');
  assert.ok(Object.isFrozen(normal.rows[0]));assert.equal(normal.payrollCalculated,false);
});

test('native requests reject ambiguity, inferred identity, expanded modes and floating point values',()=>{
  const mutations=[d=>d.rows[0].contractId='19001',d=>d.rows[0].identityToken='b'.repeat(63),d=>delete d.rows[0].identityToken,
    d=>d.rows[0].tenantId=uid(99),d=>d.subject=subject(),d=>d.sourceMode='bulk',d=>d.payrollType='sac',
    d=>d.rows.push({...d.rows[0],rowOrdinal:2}),d=>d.rows[0].amountCents=0,d=>d.rows[0].quantityDecimal=1.5,
    d=>d.rows[0].adjustmentMonth='2026-11-01',d=>d.rows[0].legajo=19001];
  for(const mutate of mutations){const candidate=draft();mutate(candidate);assert.throws(()=>normalizeNativePayrollNoveltyDraft(candidate));}
  assert.throws(()=>normalizePayrollNoveltyDraft(draft()),errorCode('PAYROLL_NOVELTY_ROW_INVALID'));
});

test('employee verification transmits only server session context and the exact UUID',async()=>{
  for(const candidate of [subject(),{contractId:uid(4),legajo:'19001',employeeName:'Histórico sintético',identityToken:'c'.repeat(64),sourceCutoff:'2026-09-10T15:17:30Z'}]){
    const {sql,result}=read(getPayrollNoveltyEmployeeV2,{version:'payroll-novelty-employee.v2',subject:candidate},uid(4));
    assert.deepEqual((await result).subject,candidate);assert.match(sql.calls[0].sql,/payroll_novelty_employee_v2/);
    assert.equal(sql.calls[0].values[1],uid(4));
    assert.deepEqual(Object.keys(JSON.parse(sql.calls[0].values[0])).sort(),['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']);
  }
  const invalid=read(getPayrollNoveltyEmployeeV2,{},'19001');
  await assert.rejects(invalid.result,errorCode('PAYROLL_NOVELTY_CONTRACT_ID_INVALID'));assert.equal(invalid.sql.calls.length,0);
  await assert.rejects(read(getPayrollNoveltyEmployeeV2,{version:'payroll-novelty-employee.v2',subject:{...subject(),contractId:uid(99)}},uid(4)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
});

test('source-derived PostgreSQL contract UUIDs retain their full identity without RFC version inference',async()=>{
  const contractId='2c72f8a9-176a-f015-08d8-3a826bad9867';
  const grh={contractId,legajo:'19001',employeeName:'Histórico sintético',identityToken:'c'.repeat(64),sourceCutoff:'2026-09-10T15:17:30Z'};
  const {sql,result}=read(getPayrollNoveltyEmployeeV2,{version:'payroll-novelty-employee.v2',subject:grh},contractId);
  assert.deepEqual((await result).subject,grh);assert.equal(sql.calls[0].values[1],contractId);
  const native=draft();native.rows[0].contractId=contractId;
  assert.equal(normalizeNativePayrollNoveltyDraft(native).rows[0].contractId,contractId);
  await assert.rejects(read(getPayrollNoveltyEmployeeV2,{},'00000000-0000-0000-0000-000000000000').result,errorCode('PAYROLL_NOVELTY_CONTRACT_ID_INVALID'));
});

test('mixed bootstrap preserves the v1/v2 discriminant and fails on downgrade or expanded effects',async()=>{
  const limits={contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only',maxRows:500,sourceModes:['individual','bulk'],payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other'],grhMutation:false,payrollCalculated:false,payrollPosted:false,native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']}};
  const response={principal:{tenantId:uid(1),membershipId:uid(2),certifiedBindingId:uid(8),capabilities:['payroll.novelty.read']},feature:{contractVersion:limits.contractVersion,approvalEffect:'export_only'},limits,batches:[batch({mode:'bootstrap',native:false}),batch({mode:'bootstrap'})]};
  assert.equal((await read(getPayrollNoveltyBootstrapV2,response).result).batches.length,2);
  for(const mutate of [r=>r.limits.contractVersion='payroll-novelty-batch.v1',r=>r.limits.payrollCalculated=true,r=>r.limits.native.maxRows=500,r=>r.batches[1].rows[0].subject.origin='GRH']){
    const candidate=structuredClone(response);mutate(candidate);
    await assert.rejects(read(getPayrollNoveltyBootstrapV2,candidate).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
  }
});

test('native prepare uses one explicit facade with stable exact payload/key/hash and immutable receipt',async()=>{
  const sql=connection({replayed:false,data:batch({mode:'receipt'})});
  const first=await prepareNativePayrollNovelty(sql,principal,session,draft(),uid(7));
  await prepareNativePayrollNovelty(sql,principal,session,draft(),uid(7));
  assert.deepEqual(sql.calls[0],sql.calls[1]);assert.match(sql.calls[0].sql,/payroll_novelty_prepare_v2/);
  assert.deepEqual(JSON.parse(sql.calls[0].values[4]),draft().rows);assert.equal(sql.calls[0].values[5],uid(7));
  assert.match(sql.calls[0].values[6],/^[a-f0-9]{64}$/);assert.ok(!Object.hasOwn(first.data.rows[0],'identityCurrent'));
  const drift={replayed:true,data:batch({mode:'receipt'})};drift.data.rows[0].subject.identityToken='c'.repeat(64);
  await assert.rejects(read(prepareNativePayrollNovelty,drift,draft(),uid(7)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
  const downgrade={replayed:false,data:batch({mode:'receipt',native:false})};
  await assert.rejects(read(prepareNativePayrollNovelty,downgrade,draft(),uid(7)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
});

test('read distinguishes a stale identity without claiming a current mutation receipt',async()=>{
  const stale=batch();stale.rows[0].identityCurrent=false;
  assert.equal((await read(readPayrollNoveltyV2,{data:stale},uid(6)).result).data.rows[0].identityCurrent,false);
  stale.allowedCommands=['approve'];
  await assert.rejects(read(readPayrollNoveltyV2,{data:stale},uid(6)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
  await assert.rejects(read(readPayrollNoveltyV2,{data:batch()},uid(99)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
});

test('transitions preserve the event receipt version and reject a wrong batch or decision',async()=>{
  const change={batchId:uid(6),expectedVersion:1,reasonCode:'ready_for_review',reasonReference:null};
  const receipt={replayed:true,data:batch({mode:'receipt',status:'submitted',version:2})};
  assert.equal((await read(transitionPayrollNoveltyV2,receipt,'submit',change,uid(7)).result).replayed,true);
  for(const patch of [{id:uid(99)},{version:3},{status:'approved'}]){
    await assert.rejects(read(transitionPayrollNoveltyV2,{...receipt,data:{...receipt.data,...patch}},'submit',change,uid(7)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
  }
});

test('native export requires approval, current exact identity and the matching export version',async()=>{
  const approved=batch({mode:'export',status:'approved',version:3});
  const response={contractVersion:'payroll-novelty-export.v2',approvalEffect:'export_only',data:approved};
  assert.equal((await read(exportPayrollNoveltyV2,response,uid(6)).result).data.rows[0].identityCurrent,true);
  for(const mutate of [r=>r.data.rows[0].identityCurrent=false,r=>delete r.data.rows[0].identityCurrent,r=>r.contractVersion='payroll-novelty-export.v1',r=>r.approvalEffect='payroll',r=>r.data.payrollPosted=true]){
    const candidate=structuredClone(response);mutate(candidate);
    await assert.rejects(read(exportPayrollNoveltyV2,candidate,uid(6)).result,errorCode('PAYROLL_NOVELTY_CONTRACT_DRIFT'));
  }
  const legacy={contractVersion:'payroll-novelty-export.v1',approvalEffect:'export_only',data:batch({native:false,mode:'export',status:'approved',version:3})};
  assert.equal((await read(exportPayrollNoveltyV2,legacy,uid(6)).result).contractVersion,'payroll-novelty-export.v1');
});

test('SQL identity failures expose safe messages and never retry a v1 facade',async()=>{
  const calls=[];const sql={query:async text=>{calls.push(text);throw Error('PAYROLL_NOVELTY_IDENTITY_CHANGED private-diagnostic-123');}};
  await assert.rejects(()=>prepareNativePayrollNovelty(sql,principal,session,draft(),uid(7)),e=>e.code==='PAYROLL_NOVELTY_IDENTITY_CHANGED'&&e.status===409&&!e.message.includes('private-diagnostic'));
  assert.equal(calls.length,1);assert.match(calls[0],/payroll_novelty_prepare_v2/);
});
