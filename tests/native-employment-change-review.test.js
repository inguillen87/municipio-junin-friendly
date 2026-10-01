import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANGE_VERSION} from '../assets/native-employment-change-model.js';
import {reviewedChangeAttempt,assertChangeAttemptFresh,assertChangeAttemptReceipt} from '../assets/native-employment-change-review.js';
import {ID,CONTRACT,TENANT,catalog} from './fixtures/native-employee-synthetic.js';

const hash=letter=>letter.repeat(64),values={agreementCode:'1',categoryCode:'6',organizationId:'7',sectorCode:'2',jobTitle:'Cargo original QA'};
const items=catalog.items.map((r,i)=>({...r,key:'synthetic-'+i,agreementCode:r.agreementCode??null}));
const labels=v=>Object.fromEntries([['agreementCode','agreements','agreementName'],['categoryCode','categories','categoryName'],['organizationId','organizations','organizationName'],['sectorCode','sectors','sectorName']].map(([field,kind,name])=>[name,items.find(i=>i.kind===kind&&i.code===v[field]&&(kind!=='categories'||i.agreementCode===v.agreementCode)).label]));
function fixture(operation='propose',decision='approve'){
 const subject={contractId:CONTRACT,legajo:'5001',employeeName:'PERSONA SINTÉTICA QA',identityToken:hash('e'),sourceCutoff:null,origin:'MUNICONTROL',registrationId:TENANT,registeredAt:'2026-09-23T12:00:00Z'};
 const bootstrap={version:CHANGE_VERSION,scopeVersion:hash('d'),subject,employment:{values:structuredClone(values),labels:labels(values),version:hash('a'),revision:0,appliedAt:null},catalog:{items:structuredClone(items),version:hash('c'),origin:'MUNICONTROL',revision:1,publishedAt:'2026-09-23T12:00:00Z'},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false};
 const after={...values,organizationId:'10',jobTitle:'Cargo rectificado QA'};
 const proposal={id:ID,contractId:CONTRACT,subject:structuredClone(subject),status:'pending',reason:'Corrección administrativa sintética QA',legalReference:'Resolución sintética QA',createdAt:'2026-09-23T13:00:00Z',authorLabel:'preparador@example.invalid',baseVersion:hash('a'),catalogVersion:hash('c'),canReview:true,before:{values:structuredClone(values),labels:labels(values)},after:{values:after,labels:labels(after)},review:null};
 const body={operation,payload:operation==='propose'?{contractId:CONTRACT,identityToken:hash('e'),scopeVersion:hash('d'),baseVersion:hash('a'),catalogVersion:hash('c'),values:structuredClone(after),legalReference:proposal.legalReference,reason:proposal.reason}:{contractId:CONTRACT,proposalId:ID,scopeVersion:hash('d'),decision,reason:'Decisión independiente sintética QA'}};
 const attempt=reviewedChangeAttempt(body,bootstrap,operation==='review'?proposal:null,ID);
 const saved=structuredClone(proposal),current=structuredClone(bootstrap),receipt={version:CHANGE_VERSION,operation,contractId:CONTRACT,proposalId:ID,status:operation==='propose'?'pending':decision==='approve'?'approved':'rejected',employmentVersion:hash('a'),revision:0,replayed:false,payrollModified:false};
 if(operation==='review'){
  saved.status=receipt.status;saved.canReview=false;saved.review={decision,reason:body.payload.reason,reviewedAt:'2026-09-23T14:00:00Z',reviewerLabel:'revisor@example.invalid'};
  if(decision==='approve'){receipt.employmentVersion=hash('f');receipt.revision=1;current.employment={...structuredClone(saved.after),version:hash('f'),revision:1,appliedAt:saved.review.reviewedAt};}
 }
 return {body,bootstrap,proposal,attempt,saved,current,receipt,envelope:{version:CHANGE_VERSION,proposal:saved}};
}
test('reviewed attempts are detached, deeply frozen and cannot be forged by cloning',()=>{
 const f=fixture();f.body.payload.values.jobTitle='Edición posterior QA';f.bootstrap.catalog.items[0].label='Edición posterior QA';
 assert.equal(f.attempt.body.payload.values.jobTitle,'Cargo rectificado QA');assert.equal(f.attempt.bytes,JSON.stringify(f.attempt.body));
 assert.throws(()=>{f.attempt.bootstrap.employment.values.organizationId='2';},TypeError);
 assert.throws(()=>assertChangeAttemptReceipt(f.receipt,structuredClone(f.attempt),f.envelope,f.current),{code:'RESPONSE_INVALID'});
});
test('complete unchanged proposal and approval/rejection receipts are accepted',()=>{
 for(const [operation,decision]of [['propose','approve'],['review','approve'],['review','reject']]){const f=fixture(operation,decision);assert.equal(assertChangeAttemptFresh(f.attempt,f.bootstrap,operation==='review'?f.proposal:null),f.attempt);assert.equal(assertChangeAttemptReceipt(f.receipt,f.attempt,f.envelope,f.current),f.receipt);}
});
for(const [label,mutate]of [
 ['non-first employment value',f=>f.bootstrap.employment.values.sectorCode='14'],
 ['unchanged-field employment label',f=>f.bootstrap.employment.labels.categoryName='Etiqueta nueva QA'],
 ['catalog item beyond first',f=>f.bootstrap.catalog.items.at(-1).label='Etiqueta nueva QA'],
 ['native identity',f=>f.bootstrap.subject.employeeName='OTRA PERSONA SINTÉTICA QA'],
 ['opaque membership scope',f=>f.bootstrap.scopeVersion=hash('b')],
 ['write permission',f=>f.bootstrap.permissions.canPropose=false],
])test('fresh proposal blocks '+label+' drift before sending',()=>{const f=fixture();mutate(f);assert.throws(()=>assertChangeAttemptFresh(f.attempt,f.bootstrap,null),{code:'REVIEW_CHANGED',status:409});});
for(const [label,mutate]of [
 ['legal reference',p=>p.legalReference='Otra resolución QA'],['reason',p=>p.reason='Otro motivo administrativo QA'],
 ['non-first value',p=>p.after.values.sectorCode='14'],['label',p=>p.after.labels.organizationName='Otra etiqueta QA'],
 ['author',p=>p.authorLabel='otro@example.invalid'],['review authority',p=>p.canReview=false],
])test('fresh reviewer blocks changed '+label+' before deciding',()=>{const f=fixture('review');mutate(f.proposal);assert.throws(()=>assertChangeAttemptFresh(f.attempt,f.bootstrap,f.proposal),{code:'REVIEW_CHANGED'});});
for(const [label,mutate]of [
 ['non-first value',f=>f.saved.after.values.organizationId='2'],['unchanged value',f=>f.saved.after.values.categoryCode='13'],
 ['label',f=>f.saved.after.labels.sectorName='Otra repartición QA'],['original snapshot',f=>f.saved.before.values.jobTitle='Otro origen QA'],
 ['document',f=>f.saved.legalReference='Otra resolución QA'],['reason',f=>f.saved.reason='Otro motivo administrativo QA'],
 ['catalog version',f=>f.saved.catalogVersion=hash('b')],['subject',f=>f.saved.subject.registrationId=ID],
 ['receipt base',f=>f.receipt.employmentVersion=hash('b')],['receipt revision',f=>f.receipt.revision=1],
])test('proposal receipt rejects valid-shaped '+label+' mismatch',()=>{const f=fixture();mutate(f);assert.throws(()=>assertChangeAttemptReceipt(f.receipt,f.attempt,f.envelope,f.current),{code:'RESPONSE_INVALID'});});
for(const [label,mutate]of [
 ['non-first approved value',f=>f.current.employment.values.sectorCode='14'],
 ['approved label',f=>f.current.employment.labels.categoryName='Etiqueta distinta QA'],
 ['receipt version',f=>f.receipt.employmentVersion=hash('b')],['receipt revision',f=>f.receipt.revision=2],
 ['saved document',f=>f.saved.legalReference='Otra resolución QA'],['decision reason',f=>f.saved.review.reason='Otra decisión independiente QA'],
])test('approval receipt rejects '+label+' mismatch without reporting application',()=>{const f=fixture('review');mutate(f);assert.throws(()=>assertChangeAttemptReceipt(f.receipt,f.attempt,f.envelope,f.current),{code:'RESPONSE_INVALID'});});
test('read permission alone can recover an original proposal receipt',()=>{const f=fixture();f.current.permissions={canPropose:false,canReview:false};assertChangeAttemptReceipt({...f.receipt,replayed:true},f.attempt,f.envelope,f.current);});
test('an independently decided proposal still proves its original creation receipt',()=>{const f=fixture();f.saved.status='rejected';f.saved.canReview=false;f.saved.review={decision:'reject',reason:'Rechazo posterior independiente QA',reviewedAt:'2026-09-23T14:00:00Z',reviewerLabel:'revisor@example.invalid'};assertChangeAttemptReceipt(f.receipt,f.attempt,f.envelope,f.current);});
test('later employment revision preserves historical approval proof without attributing it as current',()=>{const f=fixture('review');f.current.employment={...f.current.employment,values:{...values,jobTitle:'Rectificación posterior QA'},labels:labels(values),revision:2,version:hash('b')};assertChangeAttemptReceipt({...f.receipt,replayed:true},f.attempt,f.envelope,f.current);});
test('stale proposal may be rejected, while approval requires its original complete base',()=>{
 const f=fixture('review','reject');f.bootstrap.employment.version=hash('b');assertChangeAttemptFresh(f.attempt,f.bootstrap,f.proposal);
 assert.throws(()=>reviewedChangeAttempt({...f.body,payload:{...f.body.payload,decision:'approve'}},f.bootstrap,f.proposal,ID),{code:'RESPONSE_INVALID'});
});
