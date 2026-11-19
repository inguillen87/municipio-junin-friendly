// The prepare body of a verified preview comes from a frozen record taken when the preview was verified, never from the
// returned object, which stays mutable for the panel. Anything not verified by this module is validated in full. Synthetic
// corpus only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ownReceiptAttempt,ownReceiptPrepareBody,verifiedOwnReceiptPreview} from '../assets/own-payroll-receipt-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {OWN_RECEIPT_PRINT_FACTS_VERSION} from '../assets/own-payroll-receipt-print-facts.js';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/own-payroll-consumer-corpus.json',import.meta.url),'utf8')).cases;
const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const select=name=>structuredClone(corpus.find(one=>one.name===name));
const REASON='Emisión sintética de octubre.';
const KEYS=['command','scopeVersion','sourceVersion','params','batchId','batchSha256','reason','reviewConfirmed'];

function snapshot(one,{v6=true}={}){
 const record=structuredClone(one.receiptRecord),quantities=new Map(record.quantities.map(q=>[q.conceptCode,q]));
 if(v6)record.printFacts={version:OWN_RECEIPT_PRINT_FACTS_VERSION,frozenAt:'2026-11-11T15:00:00Z',units:record.concepts.map(c=>({rowKey:record.contractId+':concept:'+c.code,quantity:structuredClone(quantities.get(c.code)??null)})),
  employmentStartDate:null,classification:{categoryCode:null,categoryLabel:null,jobTitle:null,positionStructure:null},paymentDestination:null,
  sources:{runId:record.runId,payloadSha256:record.payloadSha256,inputSha256:record.inputSha256,resultSha256:record.resultSha256,employmentEvidenceSha256:null,bankConfigurationVersion:null,bankApprovalId:null}};
 const version=v6?'own-receipt-snapshot.v6':record.inputVersion==='own-payroll-input.v5'?'own-receipt-snapshot.v5':'own-receipt-snapshot.v4';
 return {version,params:{period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',agreementFrom:'',agreementTo:'',departmentFrom:'',departmentTo:''},issuer:{name:'SYNTHETIC QA MUNICIPALITY',taxId:'30990000001',address:'SYNTHETIC ADDRESS 123'},paymentDate:null,legend:'Synthetic QA only'},sourceVersion:'a'.repeat(64),
  sources:[{id:record.sourceGroupId,snapshotSha256:hash(one.close),period:'2026-10',type:'monthly',employeeCount:one.close.employeeCount,populationCount:one.close.populationCount,selectedCount:1}],records:[record],recordCount:1,conceptCount:record.concepts.length,
  economicConceptCount:record.economicConceptCount,omittedRowCount:record.omittedRowCount,identityBasis:'owned_registration_verified_at_capture',paymentDateBasis:'declared',signatureState:'pending',payrollPosted:false,paymentExecuted:false};
}
const raw=s=>({version:'own-receipt-preview.v1',scopeVersion:'b'.repeat(64),snapshot:s,snapshotSha256:hash(s),permissions:{canPrepare:true}});
const expected=p=>{const body={command:'prepare',scopeVersion:p.scopeVersion,sourceVersion:p.snapshot.sourceVersion,params:p.snapshot.params,batchId:null,batchSha256:null,reason:REASON,reviewConfirmed:false};
 return p.snapshot.version==='own-receipt-snapshot.v6'?{...body,previewSha256:p.snapshotSha256}:body;};

test('a verified preview gives exactly the body of the full path, with the same keys in the same order',async()=>{
 for(const one of corpus)for(const v6 of [false,true]){
  const source=raw(snapshot(one,{v6})),verified=await verifiedOwnReceiptPreview(source),body=ownReceiptPrepareBody(verified,REASON);
  assert.equal(salarySerialized(body),salarySerialized(expected(source)),one.name);
  assert.deepEqual(Object.keys(body),v6?[...KEYS,'previewSha256']:KEYS,one.name);
  assert.deepEqual(ownReceiptPrepareBody(structuredClone(verified),REASON),body,one.name+': full path agrees');
  assert.doesNotThrow(()=>ownReceiptAttempt(uid(5),body,'k'));
 }
});
test('the returned preview stays an ordinary object for the panel: nothing in it is frozen',async()=>{
 const verified=await verifiedOwnReceiptPreview(raw(snapshot(select('eligible_positive'))));
 assert.equal(Object.isFrozen(verified),false);assert.equal(Object.isFrozen(verified.snapshot),false);assert.equal(Object.isFrozen(verified.snapshot.params),false);
});
test('changing a verified v6 preview into v5 afterwards cannot drop the ninth key nor change the hash it carries',async()=>{
 const source=raw(snapshot(select('eligible_positive'))),verified=await verifiedOwnReceiptPreview(source);
 verified.snapshot.version='own-receipt-snapshot.v5';verified.snapshotSha256='f'.repeat(64);verified.scopeVersion='c'.repeat(64);verified.snapshot.sourceVersion='d'.repeat(64);
 const body=ownReceiptPrepareBody(verified,REASON);
 assert.deepEqual(Object.keys(body),[...KEYS,'previewSha256']);assert.equal(body.previewSha256,source.snapshotSha256);
 assert.equal(body.scopeVersion,source.scopeVersion);assert.equal(body.sourceVersion,source.snapshot.sourceVersion);
 // The same mutation on an object this module did not verify is rejected by the full walk (versions are never mixed).
 const copy=structuredClone(verified);copy.snapshotSha256=source.snapshotSha256;assert.throws(()=>ownReceiptPrepareBody(copy,REASON));
});
test('a nested change to the verified params afterwards does not reach the body',async()=>{
 for(const v6 of [false,true]){
  const source=raw(snapshot(select('days14_both_omitted'),{v6})),verified=await verifiedOwnReceiptPreview(source);
  verified.snapshot.params.filters.employeeFrom='1';verified.snapshot.params.types.push('sac');verified.snapshot.params.issuer.name='OTRO EMISOR';verified.snapshot.params.paymentDate='2026-11-30';
  const body=ownReceiptPrepareBody(verified,REASON);
  assert.deepEqual(body.params,source.snapshot.params,'the body carries the params as verified');
  verified.snapshot.params=null;assert.deepEqual(ownReceiptPrepareBody(verified,REASON).params,source.snapshot.params,'even if the params are replaced');
 }
});
test('a body never aliases the preview or a previous body: changing one changes nothing else',async()=>{
 const source=raw(snapshot(select('eligible_positive'))),verified=await verifiedOwnReceiptPreview(source);
 const first=ownReceiptPrepareBody(verified,REASON);
 assert.notEqual(first.params,verified.snapshot.params);assert.notEqual(first.params.filters,verified.snapshot.params.filters);
 first.params.filters.employeeFrom='9';first.params.types.length=0;first.previewSha256='0'.repeat(64);
 const second=ownReceiptPrepareBody(verified,REASON);
 assert.deepEqual(second,expected(source));assert.equal(verified.snapshot.params.filters.employeeFrom,'');
 // A full-path body does not alias its preview either.
 const unverified=structuredClone(source),third=ownReceiptPrepareBody(unverified,REASON);assert.notEqual(third.params,unverified.snapshot.params);
});
test('anything this module did not verify is validated in full, as before',async()=>{
 const source=raw(snapshot(select('eligible_positive')));
 for(const mutate of [p=>p.snapshot.signatureState='signed',p=>p.snapshot.recordCount=99,p=>delete p.snapshot.records[0].printFacts,p=>p.snapshot.version='own-receipt-snapshot.v5',p=>p.version='own-receipt-preview.v2',p=>p.scopeVersion='nope'])
  {const bad=structuredClone(source);mutate(bad);assert.throws(()=>ownReceiptPrepareBody(bad,REASON));}
 assert.throws(()=>ownReceiptPrepareBody(null,REASON));assert.throws(()=>ownReceiptPrepareBody({},REASON));
 // A preview whose hash does not verify is refused before any record exists.
 const forged=structuredClone(source);forged.snapshotSha256='e'.repeat(64);await assert.rejects(verifiedOwnReceiptPreview(forged));
});
