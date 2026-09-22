import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNativeMonthlySubject,verifyMonthlyEmployee,verifyMonthlyBatch,verifyMonthlyBootstrap,buildNativeMonthlyDraft,monthlyWriteAttempt} from '../assets/payroll-native-monthly-model.js';

const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const subject=()=>({contractId:id(1),legajo:'1234',employeeName:'Persona sintética',identityToken:'a'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:id(2),registeredAt:'2026-09-22T12:13:14.123456Z'});
const input=()=>({rowOrdinal:1,legajo:'1234',conceptSourceId:'27',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:'1.250000',amountCents:null,movementType:null,legalInstrument:null,observation:null,forced:false});
const draft=()=>({sourceMode:'individual',periodMonth:'2026-09-01',payrollType:'monthly',rows:[input()]});
const batch=(mode='detail')=>({id:id(3),sourceMode:'individual',periodMonth:'2026-09-01',payrollType:'monthly',contractVersion:'payroll-novelty-batch.v2',status:'draft',version:1,rowCount:1,exportable:false,grhMutation:false,payrollCalculated:false,payrollPosted:false,...(['detail','bootstrap'].includes(mode)?{allowedCommands:['submit','cancel'],canExport:false}:{}),rows:[{...input(),employmentContractId:id(1),subject:subject(),issues:[],...(mode!=='receipt'?{identityCurrent:true}:{})}]});
const bootstrap=()=>({feature:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only'},limits:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only',maxRows:500,sourceModes:['individual','bulk'],payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other'],native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']},grhMutation:false,payrollCalculated:false,payrollPosted:false},principal:{tenantId:id(4),membershipId:id(5),certifiedBindingId:id(6),capabilities:['payroll.novelty.read','payroll.novelty.nominal.read']},batches:[batch('bootstrap')]});

test('employee authority binds exact UUID, not a repeated legajo',()=>{
  const value=subject();assert.equal(assertNativeMonthlySubject(value),value);
  assert.equal(verifyMonthlyEmployee({version:'payroll-novelty-employee.v2',subject:value},id(1)),value);
  assert.throws(()=>verifyMonthlyEmployee({ok:true,version:'payroll-novelty-employee.v2',subject:value},id(7)));
  assert.throws(()=>verifyMonthlyEmployee({ok:true,version:'payroll-novelty-employee.v2',subject:value,privateRecord:{}},id(1)));
  assert.throws(()=>verifyMonthlyEmployee({ok:false,version:'payroll-novelty-employee.v2',subject:value},id(1)));
});
test('native provenance cannot masquerade as GRH or infer a cutoff',()=>{
  for(const changes of [{sourceCutoff:'2026-09-10T00:00:00Z'},{origin:'GRH'},{registrationId:null},{identityToken:'x'.repeat(64)},{extra:'not-public'}])assert.throws(()=>assertNativeMonthlySubject({...subject(),...changes}));
  const grh={contractId:id(1),legajo:'1234',employeeName:null,identityToken:'b'.repeat(64),sourceCutoff:'2026-09-10T12:00:00-03:00'};
  assert.equal(verifyMonthlyEmployee({version:'payroll-novelty-employee.v2',subject:grh},id(1)),grh);
  assert.throws(()=>buildNativeMonthlyDraft(draft(),grh));
  const md5Contract={...grh,contractId:'b7c91a4e-d1f0-fe13-1123-0123456789ab'};
  assert.equal(verifyMonthlyEmployee({version:'payroll-novelty-employee.v2',subject:md5Contract},md5Contract.contractId),md5Contract);
  assert.throws(()=>verifyMonthlyEmployee({version:'payroll-novelty-employee.v2',subject:md5Contract},'00000000-0000-0000-0000-000000000000'));
});
test('timestamps preserve microseconds and reject invalid civil dates or offsets',()=>{
  for(const registeredAt of ['2026-02-30T12:00:00Z','2026-09-22T12:00:00+14:30','2026-09-22T25:00:00Z','2026-09-22'])assert.throws(()=>assertNativeMonthlySubject({...subject(),registeredAt}));
  assert.equal(assertNativeMonthlySubject(subject()).registeredAt,'2026-09-22T12:13:14.123456Z');
});
test('native draft is exactly single individual monthly and never changes legajo authority',()=>{
  const value=buildNativeMonthlyDraft(draft(),subject());
  assert.equal(Object.keys(value.rows[0]).length,13);assert.equal(value.rows[0].contractId,id(1));assert.equal(value.rows[0].identityToken,'a'.repeat(64));
  assert.ok(Object.isFrozen(value.rows[0]));assert.equal(value.rows[0].amountCents,null);
  for(const changes of [{sourceMode:'bulk'},{payrollType:'sac'},{rows:[input(),input()]},{rows:[{...input(),legajo:'9999'}]},{rows:[{...input(),contractId:id(7)}]}])assert.throws(()=>buildNativeMonthlyDraft({...draft(),...changes},subject()));
});
test('explicit zero remains zero while absent quantity/amount are not guessed',()=>{
  for(const changes of [{quantityDecimal:null,amountCents:'0'},{quantityDecimal:'0',amountCents:null},{quantityDecimal:'-1.123456',amountCents:'999999999999999999'}]){
    const value=buildNativeMonthlyDraft({...draft(),rows:[{...input(),...changes}]},subject());
    assert.equal(value.rows[0].quantityDecimal,changes.quantityDecimal);assert.equal(value.rows[0].amountCents,changes.amountCents);
  }
  for(const changes of [{quantityDecimal:null,amountCents:null},{quantityDecimal:'-0'},{amountCents:'1.5'},{quantityDecimal:'1e4'},{amountCents:'01'},{amountCents:'1000000000000000000'}])assert.throws(()=>buildNativeMonthlyDraft({...draft(),rows:[{...input(),...changes}]},subject()));
});
test('source-neutral movement and multiline foundation retain the legacy input grammar',()=>{
  const value=buildNativeMonthlyDraft({...draft(),rows:[{...input(),movementType:'a.b_1',legalInstrument:'Resolución\nApartado 2',observation:'Fundamento\tcompleto'}]},subject());
  assert.equal(value.rows[0].movementType,'a.b_1');
  assert.throws(()=>buildNativeMonthlyDraft({...draft(),rows:[{...input(),observation:'bad\u0000text'}]},subject()));
});
test('forced entry requires an explicit amount and foundation, including an intentional zero',()=>{
  assert.throws(()=>buildNativeMonthlyDraft({...draft(),rows:[{...input(),forced:true}]},subject()));
  const value=buildNativeMonthlyDraft({...draft(),rows:[{...input(),forced:true,amountCents:'0',observation:'Fundamento sintético'}]},subject());assert.equal(value.rows[0].amountCents,'0');
});
test('immutable receipts and current reads cannot be substituted for one another',()=>{
  const receipt=batch('receipt');assert.equal(verifyMonthlyBatch(receipt,{mode:'receipt'}),receipt);
  assert.throws(()=>verifyMonthlyBatch(receipt,{mode:'detail'}));
  assert.throws(()=>verifyMonthlyBatch(batch(),{mode:'receipt'}));
  const read=batch();delete read.rows[0].identityCurrent;assert.throws(()=>verifyMonthlyBatch(read,{mode:'detail'}));
});
test('drift preserves historical subject but disables submit approve and export',()=>{
  const stale=batch();stale.rows[0].identityCurrent=false;stale.allowedCommands=['cancel'];assert.equal(verifyMonthlyBatch(stale),stale);
  for(const command of ['submit','approve'])assert.throws(()=>verifyMonthlyBatch({...stale,allowedCommands:[command]}));
  const approved={...stale,status:'approved',exportable:true};assert.throws(()=>verifyMonthlyBatch(approved,{mode:'export'}));
  approved.rows[0].identityCurrent=true;assert.equal(verifyMonthlyBatch(approved,{mode:'export'}),approved);
});
test('row ownership and all payroll effect flags fail closed',()=>{
  for(const key of ['grhMutation','payrollCalculated','payrollPosted'])assert.throws(()=>verifyMonthlyBatch({...batch(),[key]:true}));
  for(const changes of [{employmentContractId:id(8)},{legajo:'9999'},{contractId:id(1)}]){const b=batch();Object.assign(b.rows[0],changes);assert.throws(()=>verifyMonthlyBatch(b));}
});
test('bootstrap mixes versions while withholding nominal rows explicitly',()=>{
  const b=bootstrap();b.batches[0].rows=[];b.batches[0].allowedCommands=[];assert.equal(verifyMonthlyBootstrap(b),b);
  b.batches.push({...batch(),contractVersion:'payroll-novelty-batch.v1',rows:[]});assert.equal(verifyMonthlyBootstrap(b),b);
  delete b.batches[0].rows;assert.throws(()=>verifyMonthlyBootstrap(b));
  for(const change of [{maxRows:2},{sourceModes:['individual','bulk']},{payrollTypes:['monthly','sac']}]){const bad=bootstrap();Object.assign(bad.limits.native,change);assert.throws(()=>verifyMonthlyBootstrap(bad));}
});
test('v1 redacted receipts remain supported without treating them as native identities',()=>{
  const receipt={...batch('receipt'),contractVersion:'payroll-novelty-batch.v1',rows:[]};assert.equal(verifyMonthlyBatch(receipt,{mode:'receipt'}),receipt);
  assert.throws(()=>verifyMonthlyBatch({...receipt,contractVersion:'payroll-novelty-batch.v2'},{mode:'receipt'}));
});
test('retry input preserves identical serialized body and key after draft mutation',()=>{
  const payload=draft();const attempt=monthlyWriteAttempt({url:'/api/internal-payroll-novelties?version=2',command:'prepare',payload,key:id(9),scopeKey:'tenant|membership|binding'});
  const before=attempt.body;payload.rows[0].legajo='9999';payload.periodMonth='2026-10-01';
  assert.equal(attempt.body,before);assert.equal(JSON.parse(attempt.body).payload.rows[0].legajo,'1234');assert.ok(Object.isFrozen(attempt));
  assert.equal(attempt.key,id(9));assert.throws(()=>monthlyWriteAttempt({...attempt,payload,url:'https://elsewhere.test/api'}));
});
