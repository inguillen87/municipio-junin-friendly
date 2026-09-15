import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync, strFromU8} from 'fflate';
import {schoolingData, schoolingFilter, schoolingRevision, familyReference, familyContextData, familyDeclarationFields, familyDeclarationResult} from '../assets/family-schooling-model.js';
import {schoolingXlsx} from '../assets/family-schooling-export.js';
import {schoolingFixtureV2, syntheticUuid} from './fixtures/family-schooling-synthetic.js';

function unified() {
  const p = schoolingFixtureV2(2);
  p.data.rows.push({...p.data.rows[0], familyRef:{kind:'own',id:syntheticUuid(30000)}, familyName:'Niña QA', birthDate:null,
    declarationState:'declared', familyRecordedAt:'2026-09-15T03:00:00.123456Z', validFrom:null});
  return p;
}
test('v2 requires explicit opt-in and keeps numeric GRH literals separate from own UUIDs', () => {
  const p = unified(); p.data.rows[0].familyRef.id = '00001';
  assert.throws(() => schoolingData(p));
  const d = schoolingData(p,{version:2});
  assert.equal(d.rows.find(r=>r.familyRef.kind==='grh' && r.familyRef.id==='00001').familyRef.id,'00001');
  assert.equal(d.rows.find(r=>r.familyRef.kind==='own').key, syntheticUuid(1)+':own:'+syntheticUuid(30000));
  for (const ref of [{kind:'grh',id:syntheticUuid(30000)},{kind:'own',id:'00001'},{kind:'own',id:syntheticUuid(30000),contractId:syntheticUuid(1)},{kind:'other',id:'1'}]) assert.throws(()=>familyReference(ref));
});
test('unified view never counts unresolved source/own matches as distinct confirmed children', () => {
  const p=unified(); p.data.rows[0].identityReviewRequired=true; p.data.rows[2].identityReviewRequired=true; p.data.scope.unresolvedFamilyRows=2;
  const d=schoolingData(p,{version:2}), view=schoolingFilter(d);
  assert.deepEqual(view.counts,{contracts:1,children:1,registered:1,unregistered:2,review:2,records:3});
  assert.equal(schoolingFilter(d,{search:'Niña'}).counts.review,1);
  p.data.scope.unresolvedFamilyRows=0; assert.throws(()=>schoolingData(p,{version:2}));
});
test('own rows require declared state and capture time, enforce exact contract scope, and reject duplicate references', () => {
  for (const change of [p=>p.data.rows[2].declarationState='approved',p=>p.data.rows[2].familyRecordedAt=null,
    p=>p.data.rows[2].familyName=null,p=>p.data.rows.push(p.data.rows[2]),p=>p.data.rows[0].familyRecordedAt='2026-09-15T03:00:00Z']) {
    const p=unified();change(p);assert.throws(()=>schoolingData(p,{version:2}));
  }
  const p=unified();p.data.scope.cohort='contract_children';
  assert.throws(()=>schoolingData(p,{version:2,resource:'family',contractId:syntheticUuid(2)}));
});
test('own capture time and review state change report revision independently of labor GRH cut', () => {
  const p=unified(), before=schoolingRevision(schoolingData(p,{version:2}));
  p.data.rows[2].familyRecordedAt='2026-09-15T03:00:00.123457Z';
  assert.notEqual(schoolingRevision(schoolingData(p,{version:2})),before);
  p.data.rows[2].familyRecordedAt='2026-09-15T03:00:00.123456Z';p.data.rows[2].identityReviewRequired=true;p.data.scope.unresolvedFamilyRows=1;
  assert.notEqual(schoolingRevision(schoolingData(p,{version:2})),before);
});
test('own export includes origin and declaration date independently, preserving names as text and excluding private identity', () => {
  const p=unified();p.data.rows[2].familyName='=HYPERLINK("https://example.invalid")';p.data.rows[2].identityReviewRequired=true;p.data.scope.unresolvedFamilyRows=1;
  const d=schoolingData(p,{version:2}), zip=unzipSync(schoolingXlsx(d,schoolingFilter(d),'2026-09-15T04:00:00Z'));
  const rows=strFromU8(zip['xl/worksheets/sheet1.xml']), control=strFromU8(zip['xl/worksheets/sheet2.xml']);
  assert.match(rows,/2026-09-15T03:00:00.123456Z/);assert.match(rows,/2026-08-06T18:15:21Z/);
  assert.match(rows,/Corte laboral GRH/);assert.match(rows,/Alta en MuniControl/);assert.match(rows,/Declarado; no implica aprobación/);
  assert.match(rows,/HYPERLINK/);assert.doesNotMatch(rows,/<f[ >]/);assert.doesNotMatch(rows,new RegExp(syntheticUuid(30000)));
  assert.doesNotMatch(rows,new RegExp(p.data.rows[2].identityToken));assert.match(control,/Filas con coincidencias por revisar/);
});
test('name-only form preserves unknown dates/documents; NFC and optional numeric document agree with the backend', () => {
  assert.deepEqual(familyDeclarationFields({familyName:'  Mari\u0301a   QA  '}),{familyName:'María QA',birthDate:null,dni:null,validFrom:null,validTo:null});
  assert.equal(familyDeclarationFields({familyName:'李',dni:'12.345-678'}).dni,'12345678');
  for(const fields of [{familyName:''},{familyName:'123'},{familyName:'<QA>'},{familyName:'QA',birthDate:'2025-02-30'},
    {familyName:'QA',birthDate:'2100-01-01'},{familyName:'QA',dni:'abc'},{familyName:'QA',dni:'00000'},
    {familyName:'QA',validFrom:'2026-09-01',validTo:'2026-08-01'},{familyName:'QA',birthDate:'2020-01-01',validFrom:'2010-01-01'}]) assert.throws(()=>familyDeclarationFields(fields));
});
test('context cannot reuse a different employee and declaration ACK only confirms an own declared reference', () => {
  const subject={contractId:syntheticUuid(1),identityToken:'a'.repeat(64),legajo:'000001',employeeName:null,sourceCutoff:'2026-08-06T18:15:21Z'};
  assert.equal(familyContextData({ok:true,data:{version:'employee-family-context.v1',canDeclare:true,subject}},syntheticUuid(1)).canDeclare,true);
  assert.throws(()=>familyContextData({ok:true,data:{version:'employee-family-context.v1',canDeclare:true,subject}},syntheticUuid(2)));
  const ack={ok:true,data:{version:'employee-family-declare.v1',familyRef:{kind:'own',id:syntheticUuid(30000)},identityToken:'b'.repeat(64),state:'declared',duplicate:true,recordedAt:'2026-09-15T03:00:00Z'}};
  assert.equal(familyDeclarationResult(ack).duplicate,true);
  ack.data.familyRef={kind:'grh',id:'1'};assert.throws(()=>familyDeclarationResult(ack));
});
