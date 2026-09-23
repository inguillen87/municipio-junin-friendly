import test from 'node:test';
import assert from 'node:assert/strict';
import {schoolingData, schoolingFilter, schoolingRevision, familyContextData, familyDeclarationResult} from '../assets/family-schooling-model.js';
import {nativeFamilyIds, nativeFamilySubject, nativeSchoolingFixture, syntheticUuid} from './fixtures/native-family-schooling-synthetic.js';
const context = subject => ({ok:true,data:{version:'employee-family-context.v2',subject,canDeclare:true}});
const receipt = () => ({ok:true,data:{version:'employee-family-declare.v2',contractId:nativeFamilyIds.contract,contractIdentityToken:'c'.repeat(64),familyRef:{kind:'own',id:nativeFamilyIds.child},identityToken:'e'.repeat(64),state:'declared',recordedAt:'2026-09-22T11:00:00.123456Z',duplicate:false}});

test('v5 preserves native provenance without fabricating a GRH batch or cutoff', () => {
  const data=schoolingData(nativeSchoolingFixture(),{version:5}), native=data.rows.filter(r=>r.employeeOrigin==='MUNICONTROL');
  assert.equal(native.length,2);assert.equal(schoolingFilter(data).counts.contracts,3);
  assert.equal(schoolingFilter(data).counts.records,4);
  for (const row of native) {assert.equal(row.sourceCutoff,null);assert.equal(row.sourceSchooling,null);assert.equal(row.familyRef.kind,'own');assert.ok(row.nativeRegistrationId);assert.ok(row.nativeRegisteredAt);}
  assert.equal(native[0].certificate.evidenceMode,'paper_declared');assert.equal(native[0].effectiveDates.expiresOn,null);
  assert.equal(native[1].certificate,null);assert.equal(native[1].historyCount,0);
});
test('same legajo does not merge two native contract UUIDs',()=>{
  const data=schoolingData(nativeSchoolingFixture({mixed:false}),{version:5});
  assert.equal(new Set(data.rows.map(r=>r.legajo)).size,1);assert.equal(schoolingFilter(data).counts.contracts,2);
  assert.notEqual(data.rows[0].key,data.rows[1].key);
});
test('v5 requires explicit selection and invalid provenance never falls back to v4',()=>{
  const p=nativeSchoolingFixture();assert.throws(()=>schoolingData(p));assert.throws(()=>schoolingData(p,{version:4}));
  p.data.rows[0].employeeOrigin='MUNICONTROL';assert.throws(()=>schoolingData(p,{version:5}));
});
for (const [name,mutate] of [
  ['missing origin',r=>delete r.employeeOrigin],['unknown origin',r=>r.employeeOrigin='native'],
  ['missing registration',r=>r.nativeRegistrationId=null],['invalid registration UUID',r=>r.nativeRegistrationId='not-a-uuid'],
  ['missing native instant',r=>r.nativeRegisteredAt=null],['invalid native date',r=>r.nativeRegisteredAt='2026-02-30T10:00:00Z'],
  ['GRH cutoff on native',r=>r.sourceCutoff='2026-09-10T10:00:00Z'],['GRH child on native',r=>r.familyRef={kind:'grh',id:'1'}],
  ['GRH date evidence on native',r=>r.sourceSchooling={}],['extra source batch',r=>r.sourceBatchId=syntheticUuid(19)],
  ['unknown row field',r=>r.payrollEligible=true],
]) test('v5 rejects '+name,()=>{const p=nativeSchoolingFixture({mixed:false});mutate(p.data.rows[0]);assert.throws(()=>schoolingData(p,{version:5}));});
test('one employee contract cannot claim conflicting provenance across children',()=>{
  for(const key of ['nativeRegistrationId','nativeRegisteredAt','legajo','employeeName','administrativeActive']){
    const p=nativeSchoolingFixture({mixed:false});p.data.rows=[p.data.rows[0],structuredClone(p.data.rows[0])];p.data.rows[1].familyRef.id=syntheticUuid(83000);
    const changes={nativeRegistrationId:syntheticUuid(84000),nativeRegisteredAt:'2026-09-22T10:01:00Z',legajo:'9999',employeeName:'Otra persona',administrativeActive:false};p.data.rows[1][key]=changes[key];
    p.data.scope.cohort='contract_children';assert.throws(()=>schoolingData(p,{version:5,resource:'family',contractId:nativeFamilyIds.contract}),key);
  }
});
test('native date provenance participates in fresh export revision',()=>{
  const p=nativeSchoolingFixture({mixed:false}),before=schoolingRevision(schoolingData(p,{version:5}));p.data.rows[0].nativeRegisteredAt='2026-09-22T10:00:00.123457Z';
  assert.notEqual(schoolingRevision(schoolingData(p,{version:5})),before);
});
test('context v2 accepts both closed subjects without payroll permissions',()=>{
  const subject=nativeFamilySubject();assert.deepEqual(familyContextData(context(subject),subject.contractId,{version:2}).subject,subject);
  const {origin,registrationId,registeredAt,...grh}=subject;grh.sourceCutoff='2026-09-10T18:00:00Z';
  assert.deepEqual(familyContextData(context(grh),grh.contractId,{version:2}).subject,grh);
  assert.throws(()=>familyContextData(context(subject),subject.contractId));
  assert.throws(()=>familyContextData(context(subject),nativeFamilyIds.otherContract,{version:2}));
});
for(const [name,mutate] of [
  ['source cutoff',s=>s.sourceCutoff='2026-09-10T10:00:00Z'],['extra batch',s=>s.sourceBatchId=syntheticUuid(10)],
  ['registration missing',s=>delete s.registrationId],['token missing',s=>delete s.identityToken],['GRH shape plus native metadata',s=>delete s.origin],
])test('context v2 refuses '+name,()=>{const s=nativeFamilySubject();mutate(s);assert.throws(()=>familyContextData(context(s),nativeFamilyIds.contract,{version:2}));});
test('receipt v2 is bound to the original contract and token even after current identity changes',()=>{
  const p=receipt(),opts={version:2,contractId:nativeFamilyIds.contract,contractIdentityToken:'c'.repeat(64)};
  assert.equal(familyDeclarationResult(p,opts).duplicate,false);p.data.duplicate=true;assert.equal(familyDeclarationResult(p,opts).duplicate,true);
  assert.throws(()=>familyDeclarationResult(p,{...opts,contractId:nativeFamilyIds.otherContract}));
  assert.throws(()=>familyDeclarationResult(p,{...opts,contractIdentityToken:'d'.repeat(64)}));
  p.data.currentIdentityToken='d'.repeat(64);assert.throws(()=>familyDeclarationResult(p,opts));
});
