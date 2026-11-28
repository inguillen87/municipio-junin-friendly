import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownRunCapture} from '../assets/own-payroll-run-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunPeriodClassifications} from '../assets/own-payroll-period-classification.js';
import {ownRunEmploymentPrintFacts,ownReceiptEmploymentPrintProjection,verifyOwnReceiptEmploymentPrintFacts,OWN_EMPLOYMENT_PRINT_EVIDENCE_VERSION} from '../assets/own-payroll-employment-print-facts.js';
import {ownReceiptPrintFacts} from '../assets/own-payroll-receipt-print-facts.js';
import {employmentPrintFixture} from './fixtures/own-employment-print-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {employmentTitleTrimCodePoints,employmentTitleUnicodeCases} from './fixtures/own-employment-print-unicode-synthetic.js';

const refresh=f=>{f.capture.payloadSha256=ownRunHash(f.capture.payload);for(const record of f.records)record.payloadSha256=f.capture.payloadSha256;return f;};
function printedRecord(f,index=0){
 const record={...f.records[index],inputSha256:'a'.repeat(64),resultSha256:'b'.repeat(64),concepts:[],quantities:[]};
 const p=ownReceiptEmploymentPrintProjection(record,f.capture);
 record.printFacts={version:'own-receipt-print-facts.v1',frozenAt:'2026-11-15T12:00:00.000000Z',units:[],employmentStartDate:p.employmentStartDate,
  classification:{categoryCode:p.categoryCode,categoryLabel:null,jobTitle:p.jobTitle,positionStructure:null},paymentDestination:null,
  sources:{runId:record.runId,payloadSha256:record.payloadSha256,inputSha256:record.inputSha256,resultSha256:record.resultSha256,
   employmentEvidenceSha256:p.employmentEvidenceSha256,bankConfigurationVersion:null,bankApprovalId:null}};
 return record;
}

test('a complete mixed capture preserves the declared title, an undeclared null and a historical unknown null',()=>{
 const f=employmentPrintFixture(61),before=JSON.stringify(f),classes=ownRunPeriodClassifications(f.capture);
 ownRunCapture(f.capture);
 assert.equal(ownRunEmploymentPrintFacts(f.capture).rows.length,61);
 assert.equal(ownReceiptEmploymentPrintProjection(f.records[0],f.capture).jobTitle,'Técnico de sistemas sintético');
 assert.equal(ownReceiptEmploymentPrintProjection(f.records[1],f.capture).jobTitle,null);
 assert.equal(ownReceiptEmploymentPrintProjection(f.records[2],f.capture).jobTitle,null);
 assert.equal(Object.keys(classes.rows[0].definition).length,7);
 assert.equal(Object.hasOwn(classes.rows[2].definition,'jobTitle'),false);
 assert.equal(JSON.stringify(f),before);
});

test('the new employment hash binds both complete components, not classification alone',()=>{
 const f=employmentPrintFixture(),inventory=f.capture.payload.sourceInventory,p=ownReceiptEmploymentPrintProjection(f.records[0],f.capture);
 assert.equal(p.employmentEvidenceSha256,ownRunHash({version:OWN_EMPLOYMENT_PRINT_EVIDENCE_VERSION,periodClassifications:inventory.periodClassifications,employmentPrintFacts:inventory.employmentPrintFacts}));
 assert.notEqual(p.employmentEvidenceSha256,ownRunHash(inventory.periodClassifications));
 const printed=printedRecord(f);assert.equal(verifyOwnReceiptEmploymentPrintFacts(printed,f.capture),printed.printFacts);
 printed.printFacts.sources.employmentEvidenceSha256=ownRunHash(inventory.periodClassifications);
 // The standalone historical reader knows no source capture; the full-source
 // candidate check must reject a title bound only to the older economic hash.
 ownReceiptPrintFacts(printed);assert.throws(()=>verifyOwnReceiptEmploymentPrintFacts(printed,f.capture));
});

test('older captures retain absence, their original classification hash and all original bytes',()=>{
 for(const withClassification of [true,false]){
  const f=employmentPrintFixture();delete f.capture.payload.sourceInventory.employmentPrintFacts;
  if(!withClassification)delete f.capture.payload.sourceInventory.periodClassifications;
  refresh(f);const before=JSON.stringify(f),expected=withClassification?ownRunHash(f.capture.payload.sourceInventory.periodClassifications):null;
  assert.equal(ownRunEmploymentPrintFacts(f.capture),null);
  const projection=ownReceiptEmploymentPrintProjection(f.records[0],f.capture);
  assert.equal(projection.jobTitle,null);assert.equal(projection.employmentEvidenceSha256,expected);
  assert.equal(JSON.stringify(f),before);
 }
});

test('the additive evidence changes the new payload hash without changing this synthetic economic input/result',()=>{
 const f=employmentPrintFixture(),old=structuredClone(f.capture);
 delete old.payload.sourceInventory.employmentPrintFacts;old.payloadSha256=ownRunHash(old.payload);
 const prior=prepareOwnPayrollInput(old.payload),next=prepareOwnPayrollInput(f.capture.payload);
 assert.deepEqual(next,prior);assert.deepEqual(createOwnPayrollSnapshot(next),createOwnPayrollSnapshot(prior));
 assert.notEqual(f.capture.payloadSha256,old.payloadSha256);
 assert.equal(JSON.stringify(f.capture.saved),JSON.stringify(old.saved));
});

for(const [label,mutate]of[
 ['last row omitted',v=>v.rows.pop()],['duplicate last row',v=>v.rows[v.rows.length-1]=structuredClone(v.rows[0])],
 ['foreign registration',v=>v.rows[0].registrationId=uid(99999)],['foreign identity',v=>v.rows[0].identityToken='f'.repeat(64)],
 ['foreign classification row hash',v=>v.rows[0].classificationRowSha256='f'.repeat(64)],['foreign classification component hash',v=>v.classificationsSha256='f'.repeat(64)],
 ['wrong basis',v=>v.rows[0].basis='approved_own_period_classification'],['historical title inferred from today',v=>v.rows[2].jobTitle='Cargo actual indebidamente retroactivo'],
 ['wrong source field',v=>v.rows[0].provenance.sourceField='positionStructure'],['missing source hash',v=>v.rows[0].provenance.sourceVersion=null],
 ['foreign source registration',v=>v.rows[0].provenance.registration.registrationId=uid(99999)],['historical provenance changed',v=>v.rows[2].provenance={...v.rows[2].provenance,requestSha256:'f'.repeat(64)}],
 ['undeclared display structure',v=>v.rows[0].positionStructure='Otro dato'],['wrong period',v=>v.period='2026-11'],['incomplete evidence',v=>v.complete=false],
])test('the complete capture rejects '+label,()=>{
 const f=employmentPrintFixture(61);mutate(f.capture.payload.sourceInventory.employmentPrintFacts);refresh(f);
 assert.throws(()=>ownRunEmploymentPrintFacts(f.capture));assert.throws(()=>ownRunCapture(f.capture));
});

test('changed classification cannot be rebound by only replacing the component hash',()=>{
 const f=employmentPrintFixture(),inventory=f.capture.payload.sourceInventory;
 inventory.periodClassifications.rows[0].definition.startDate='2001-01-01';inventory.employmentPrintFacts.classificationsSha256=ownRunHash(inventory.periodClassifications);refresh(f);
 assert.throws(()=>ownRunEmploymentPrintFacts(f.capture),/misma fila/);
});

test('missing classification and uncommitted title changes fail closed',()=>{
 const f=employmentPrintFixture();delete f.capture.payload.sourceInventory.periodClassifications;refresh(f);
 assert.throws(()=>ownRunEmploymentPrintFacts(f.capture));
 const changed=employmentPrintFixture();changed.capture.payload.sourceInventory.employmentPrintFacts.rows[0].jobTitle='Otro cargo sintético';
 assert.throws(()=>ownRunEmploymentPrintFacts(changed.capture),/huella/);
});

for(const value of ['', ' Cargo', 'Cargo ', 'a'.repeat(121), 'x\nY', '<cargo>', 'e\u0301', 'Cargo\u202e', '\ud800'])test('new captured titles preserve the text contract: '+JSON.stringify(value),()=>{
 const f=employmentPrintFixture();f.capture.payload.sourceInventory.employmentPrintFacts.rows[0].jobTitle=value;
 // A lone surrogate cannot be represented by PostgreSQL jsonb; the pure
 // canonical verifier must reject it without silently substituting bytes.
 if(value==='\ud800')assert.throws(()=>ownRunEmploymentPrintFacts(f.capture));
 else{refresh(f);assert.throws(()=>ownRunEmploymentPrintFacts(f.capture));}
});

test('the Unicode laboratory matrix exercises the real JS reader without pretending to execute PostgreSQL',()=>{
 const baseline=employmentPrintFixture();
 for(const cp of employmentTitleTrimCodePoints)assert.equal(String.fromCodePoint(cp).trim(),'','ECMAScript trim '+cp);
 for(const {name,value,accepted} of employmentTitleUnicodeCases){
  const f=structuredClone(baseline);f.capture.payload.sourceInventory.employmentPrintFacts.rows[0].jobTitle=value;refresh(f);
  if(accepted){assert.doesNotThrow(()=>ownRunEmploymentPrintFacts(f.capture),name);assert.equal(ownRunEmploymentPrintFacts(f.capture).rows[0].jobTitle,value,name);assert.equal(ownReceiptEmploymentPrintProjection(f.records[0],f.capture).jobTitle,value,name);}
  else assert.throws(()=>ownRunEmploymentPrintFacts(f.capture),undefined,name);
 }
});

test('a source-linked title is never substituted for position structure or another registration',()=>{
 const f=employmentPrintFixture(),printed=printedRecord(f);verifyOwnReceiptEmploymentPrintFacts(printed,f.capture);
 printed.printFacts.classification.positionStructure=printed.printFacts.classification.jobTitle;
 assert.throws(()=>verifyOwnReceiptEmploymentPrintFacts(printed,f.capture));
 const wrong={...f.records[0],registrationId:f.records[1].registrationId};
 assert.throws(()=>ownReceiptEmploymentPrintProjection(wrong,f.capture));
 assert.throws(()=>ownReceiptEmploymentPrintProjection({...f.records[0],runId:uid(90000)},f.capture));
});

test('frozen current/adopted provenance uses its original seal and complete final reference',()=>{
 const f=employmentPrintFixture(),proof=f.capture.payload.sourceInventory.employmentPrintFacts.rows[0].provenance.registration;
 Object.assign(proof,{kind:'employment_adoption_final',adoptionProposalId:uid(70001),adoptionReviewId:uid(70002),sealSha256:'c'.repeat(64),
  finalRevision:{revisionId:uid(70003),packageSha256:'d'.repeat(64),sourceSha256:'e'.repeat(64),cutoff:'2026-09-30T23:59:59',coreManifestSha256:'a'.repeat(64),curatedManifestSha256:'b'.repeat(64),factsSha256:'c'.repeat(64)}});
 refresh(f);assert.equal(ownRunEmploymentPrintFacts(f.capture).rows[0].provenance.registration.kind,'employment_adoption_final');
 delete proof.finalRevision.factsSha256;refresh(f);assert.throws(()=>ownRunEmploymentPrintFacts(f.capture));
});

test('prospective SQL source blocks installation and keeps the receipt wrapper free of current data reads',()=>{
 const sql=readFileSync(new URL('../scripts/candidates/own-employment-print-facts-v1.source.sql.txt',import.meta.url),'utf8');
 assert.match(sql,/BEGIN;\s*DO \$source_only\$ BEGIN\s*RAISE EXCEPTION 'OWN_EMPLOYMENT_PRINT_SOURCE_REQUIRES_REVIEWED_COMPOSITION'/);
 assert.match(sql,/ROLLBACK;\s*$/);assert.doesNotMatch(sql,/CREATE OR REPLACE|\b(?:GRANT|REVOKE|INSERT INTO|UPDATE public|DELETE FROM)\b/);
 const wrapper=sql.slice(sql.indexOf('CREATE FUNCTION public.own_receipt_print_facts_job_title_candidate_v1'));
 assert.match(wrapper,/own_receipt_print_facts_v6_candidate_v1\(record_value,capture,bank_fact,frozen_at\)/);
 assert.doesNotMatch(wrapper,/employment_contract|native_employee_registration|own_employment_print_capture_candidate_v1\(/);
 assert.match(wrapper,/THEN RETURN original;END IF/);
});
