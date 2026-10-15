import test from 'node:test';import assert from 'node:assert/strict';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownCloseSnapshot,verifiedOwnCloseReceipt} from '../assets/own-payroll-close-model.js';
import {ownRunPeriodClassifications} from '../assets/own-payroll-period-classification.js';
import {ownRunJurisdictions,ownJurisdictionForCapture,ownJurisdictionRecord,ownJurisdictionSelect} from '../assets/own-payroll-jurisdiction-model.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';

// Only artificial identities and amounts from the established synthetic fixture.
const sha=c=>c.repeat(64);
function classifiedFixture(count=4){
 const f=jurisdictionFixture(count),d=f.details[0];
 for(const c of d.captures){
  const period=c.body.period,first=period+'-01',last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
  const jurisdictions=c.payload.sourceInventory.jurisdictions.rows;
  c.payload.sourceInventory.periodClassifications={version:'own-period-classification-capture.v1',complete:true,total:count,rows:c.payload.population.employees.map((e,i)=>{
   const r=jurisdictions[i],definition={agreementCode:e.agreementCode,categoryCode:e.categoryCode,organizationId:'008',sectorCode:e.departmentCode,jurisdictionCode:r.jurisdictionCode,startDate:'2000-01-01',endDate:null};
   const historical=i%2===0;
   return {contractId:e.contractId,registrationId:r.registrationId,identityToken:e.identityToken,basis:historical?'approved_own_period_classification':'current_own_registration',classificationVersion:historical?sha('a'):null,approvalId:historical?uid(8000+i):null,definition:historical?{...definition,effectiveFrom:first,effectiveUntil:last,documentDate:'2026-10-14',documentReference:'Constancia retrospectiva exclusivamente sintética'}:definition,provenance:historical?{kind:'native_registration',registrationId:r.registrationId,requestSha256:sha('b')}:null};
  })};
  c.payloadSha256=ownRunHash(c.payload);
 }
 for(const row of d.rows)Object.assign(row,{state:'confirmed',groupId:null,canClose:true});
 const receipt=f.receipts[0];receipt.snapshot=ownCloseSnapshot(d,{kind:'all',values:[]});receipt.snapshotSha256=ownRunHash(receipt.snapshot);
 for(const row of d.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});d.groups[0].snapshotSha256=receipt.snapshotSha256;
 return f;
}
test('mixed current and approved historical classification retain exact distinct provenance through close and reports',async()=>{
 const f=classifiedFixture(61),before=JSON.stringify(f),c=f.details[0].captures[0];
 assert.equal(ownRunPeriodClassifications(c).rows.length,61);assert.equal(ownRunJurisdictions(c).rows.length,61);
 assert.equal(ownJurisdictionForCapture(c,c.payload.population.employees[0].contractId).basis,'captured_own_period_classification');
 assert.equal(ownJurisdictionForCapture(c,c.payload.population.employees[1].contractId).basis,'captured_own_registration');
 await verifiedOwnCloseReceipt(f.receipts[0]);
 const bundle=ownReportBundle(f.query,f.details,f.receipts),all=ownReportDocument(bundle,emptyOwnReportFilters(),'payroll','concept',[],'all'),a=ownReportDocument(bundle,emptyOwnReportFilters(),'payroll','concept',[],'42'),b=ownReportDocument(bundle,emptyOwnReportFilters(),'payroll','concept',[],'55');
 assert.equal(all.rows.length,61);assert.equal(a.rows.length,31);assert.equal(b.rows.length,30);assert.equal(JSON.stringify(f),before);
});
test('old captures never gain a period approval or reinterpreted jurisdiction',()=>{
 const f=jurisdictionFixture(3),before=JSON.stringify(f),c=f.details[0].captures[0];assert.equal(ownRunPeriodClassifications(c),null);
 for(const e of c.payload.population.employees)assert.equal(ownJurisdictionForCapture(c,e.contractId).basis,'captured_own_registration');assert.equal(JSON.stringify(f),before);
});
for(const [label,mutate]of[
 ['missing row',v=>v.rows.pop()],['duplicate contract',v=>v.rows[1]=structuredClone(v.rows[0])],['foreign identity',v=>v.rows[0].identityToken=sha('f')],['duplicate registration',v=>v.rows[1].registrationId=v.rows[0].registrationId],
 ['missing approval',v=>v.rows[0].approvalId=null],['missing version',v=>v.rows[0].classificationVersion=null],['foreign provenance',v=>v.rows[0].provenance.registrationId=uid(9900)],['incomplete jurisdiction',v=>v.rows[0].definition.jurisdictionCode=null],
 ['partial effective interval',v=>v.rows[0].definition.effectiveFrom=v.rows[0].definition.effectiveUntil],['partial employment interval',v=>v.rows[0].definition.startDate=v.rows[0].definition.effectiveUntil],['different department',v=>v.rows[0].definition.sectorCode='999'],['different agreement',v=>v.rows[0].definition.agreementCode='999'],
 ['different salary category',v=>v.rows[0].definition.categoryCode='999'],['nominal extra field',v=>v.rows[0].dni='12345678'],['fake current approval',v=>v.rows[1].approvalId=uid(9990)],['fake current effective date',v=>v.rows[1].definition.effectiveFrom='2000-01-01'],['incomplete collection',v=>v.complete=false],
])test('rejects entire classification evidence: '+label,()=>{const c=classifiedFixture(2).details[0].captures[0];mutate(c.payload.sourceInventory.periodClassifications);assert.throws(()=>ownRunPeriodClassifications(c));assert.throws(()=>ownRunJurisdictions(c));});
test('jurisdiction must match the approved period rather than a current employee value',()=>{
 const c=classifiedFixture(2).details[0].captures[0];c.payload.sourceInventory.jurisdictions.rows[0].jurisdictionCode='55';assert.throws(()=>ownRunJurisdictions(c),/encuadre/);
});
test('period classification without jurisdiction is incomplete and cannot become uncaptured',()=>{const c=classifiedFixture(2).details[0].captures[0];delete c.payload.sourceInventory.jurisdictions;assert.throws(()=>ownRunJurisdictions(c),/Falta la jurisdicción/);});
test('historical jurisdiction record retains exact capture hash and cannot have null code',()=>{
 const value={code:'42',basis:'captured_own_period_classification',sourceSha256:sha('a')};assert.deepEqual(ownJurisdictionRecord(value),value);
 for(const changed of[{...value,code:null},{...value,sourceSha256:null},{...value,basis:'inferred_backup_cutoff'}])assert.throws(()=>ownJurisdictionRecord(changed));
});
test('a current missing jurisdiction still blocks complete42/55 selection in a mixed group',()=>{
 const f=classifiedFixture(2);f.receipts[0].snapshot.employees[1].jurisdiction.code=null;
 const items=f.receipts[0].snapshot.employees.map(employee=>({employee,source:f.receipts[0]}));assert.throws(()=>ownJurisdictionSelect(items,'42'),/sin informar/);assert.equal(ownJurisdictionSelect(items,'not_reported').length,1);
});
