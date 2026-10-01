import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedComparison,fixedDetailEqual,fixedSubjectEqual} from '../assets/payroll-fixed-novelties-model.js';
import {fixedApprovedRecord,fixedValues,fixedNativeSubject,fixedFixture,fixedUuid} from './fixtures/payroll-fixed-novelties-synthetic.js';

test('complete comparison preserves all ten fields with no artificial changes',()=>{
 const row=fixedApprovedRecord(1),review=fixedComparison(row,'set',row.approved.values);
 assert.equal(review.fields.length,10);assert.equal(new Set(review.fields.map(f=>f.key)).size,10);assert.equal(review.fields.filter(f=>f.changed).length,0);
 assert.equal(review.fields.find(f=>f.key==='amountCents').before,'Sin importe informado');assert.equal(Object.isFrozen(review.fields[0]),true);
});

for(const [key,value] of Object.entries(fixedValues({conceptSourceId:'638',costCenterSourceId:'0',payrollType:'sac',quantityDecimal:'1.000001',amountCents:'0',forced:true,forcedReason:'Fundamento respaldado QA',legalInstrument:'Otro acto sintético QA',validFrom:'2026-10-01',validTo:null})))test('comparison exposes the declared change in '+key,()=>{
 const row=fixedApprovedRecord(1),next={...row.approved.values,[key]:value};if(key==='forced'||key==='forcedReason'){next.forced=true;next.amountCents='0';next.forcedReason='Fundamento respaldado QA';}
 const field=fixedComparison(row,'set',next).fields.find(f=>f.key===key);assert.equal(field.changed,true);assert.notEqual(field.before,field.after);assert.equal(row.approved.values[key],fixedValues()[key]);
});

test('annulment explicitly retires all approved values while preserving the source and history',()=>{
 const row=fixedApprovedRecord(2,{amountCents:'0'}),original=structuredClone(row),review=fixedComparison(row,'annul',null);
 assert.equal(review.beforePresent,true);assert.equal(review.afterPresent,false);assert.equal(review.fields.filter(f=>f.changed).length,10);assert.equal(review.fields.find(f=>f.key==='amountCents').before,'$ 0,00');assert.equal(review.fields.every(f=>f.after==='Sin versión aprobada'),true);assert.deepEqual(row,original);
});

test('an initial proposal distinguishes absence of an approved version from a declared null field',()=>{
 const review=fixedComparison(null,'set',fixedValues());assert.equal(review.beforePresent,false);assert.equal(review.afterPresent,true);assert.equal(review.fields.find(f=>f.key==='amountCents').before,'Sin versión aprobada');assert.equal(review.fields.find(f=>f.key==='amountCents').after,'Sin importe informado');
 assert.equal(review.fields.find(f=>f.key==='validTo').after,'2026-12-31');assert.equal(fixedComparison(null,'set',fixedValues({validTo:null})).fields.find(f=>f.key==='validTo').after,'Sin vencimiento informado');
});

test('comparison keeps exact declared decimals and large cents without converting to floating point',()=>{
 const review=fixedComparison(fixedApprovedRecord(1),'set',fixedValues({quantityDecimal:'1.000000',amountCents:'999999999999999999'}));
 assert.equal(review.fields.find(f=>f.key==='quantityDecimal').after,'1.000000');assert.equal(review.fields.find(f=>f.key==='quantityDecimal').changed,true);assert.equal(review.fields.find(f=>f.key==='amountCents').after,'$ 9.999.999.999.999.999,99');
});

test('invalid operation and invalid values cannot produce a review',()=>{
 assert.throws(()=>fixedComparison(null,'calculate',fixedValues()));assert.throws(()=>fixedComparison(null,'annul',fixedValues()));assert.throws(()=>fixedComparison(null,'set',{...fixedValues(),extra:1}));
});

test('full detail equality accepts equivalent property order and rejects a same-version amount change',()=>{
 const f=fixedFixture(),row=fixedApprovedRecord(1);f.state.records.push(row);const original=f.detail(row.id),ordered=JSON.parse(JSON.stringify(original,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v));
 assert.equal(fixedDetailEqual(original,ordered),true);const changed=structuredClone(original);for(const p of [changed.record.approved,changed.record.latest,...changed.history])p.values.amountCents='0';assert.equal(changed.record.version,original.record.version);assert.equal(fixedDetailEqual(original,changed),false);
});

test('fresh comparison covers an older historical proposal even with an unchanged current record',()=>{
 const f=fixedFixture(),subject=fixedNativeSubject();f.state.subjects.set(subject.contractId,subject);
 const body={recordId:null,expectedVersion:0,contractId:subject.contractId,legajo:subject.legajo,identityToken:subject.identityToken,operation:'set',values:fixedValues(),reason:'Propuesta sintética inicial'};
 let receipt=f.mutate('propose',body,fixedUuid(1)).data;
 for(let i=0;i<3;i++){
  f.state.role='reviewer';f.mutate('review',{recordId:receipt.recordId,proposalId:receipt.proposalId,expectedVersion:receipt.recordVersion,decision:i===2?'reject':'approve',reason:'Decisión sintética independiente'},fixedUuid(10+i));
  if(i<2){f.state.role='preparer';receipt=f.mutate('propose',{...body,recordId:receipt.recordId,expectedVersion:receipt.recordVersion+1,values:fixedValues({quantityDecimal:String(i+2)})},fixedUuid(20+i)).data;}
 }
 const original=f.detail(receipt.recordId),changed=structuredClone(original);changed.history.at(-1).reason='Otra evidencia histórica sintética';assert.deepEqual(changed.record,original.record);assert.equal(fixedDetailEqual(original,changed),false);
});

test('native identity equality checks source metadata without relying on JSON property order',()=>{
 const original=fixedNativeSubject(),ordered=Object.fromEntries(Object.entries(original).reverse());assert.equal(fixedSubjectEqual(original,ordered),true);
 for(const change of [{identityToken:'f'.repeat(64)},{registrationId:fixedUuid(600)},{employeeName:'OTRO AGENTE SINTÉTICO'}])assert.equal(fixedSubjectEqual(original,{...original,...change}),false);
 assert.throws(()=>fixedSubjectEqual(original,{...original,sourceCutoff:'2026-09-01T12:00:00Z'}));
});
