import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createInternalDataHandler} from '../api/internal-data.js';
import {internalPayrollRoster,verifiedDocumentaryDirectory} from '../lib/internal-payroll-roster.js';
import {internalPayrollDocumentBatch} from '../lib/internal-payroll-document-batch.js';
import {stableBatchValue} from '../assets/payroll-document-batch-model.js';
import {batchFixture,batchBinding,BATCH_TENANT,BATCH_DATASET,BATCH_BINDING,BATCH_SNAPSHOT,batchContract} from './fixtures/payroll-document-selection-synthetic.js';

const sha=v=>createHash('sha256').update(stableBatchValue(v)).digest('hex');
const principal={user:{email:'documentary-qa@example.invalid'},tenant:{source:'membership',id:BATCH_TENANT,membershipId:'55555555-5555-4555-8555-555555555555',effectiveCapabilities:['payroll.read','workforce.employee.read']}};
const session={email:principal.user.email,id:'66666666-6666-4666-8666-666666666666',version:1,releaseSha:'a'.repeat(40)};
const query={resource:'payrollexportroster',datasetId:BATCH_DATASET};
const expect=f=>({tenantId:BATCH_TENANT,datasetId:BATCH_DATASET,bindingId:BATCH_BINDING,database:batchBinding.database,companyId:batchBinding.companyId,cutoff:f.metadata.directoryCutoff,rows:f.roster.rows});
const seal=value=>{const {readVersion,...body}=value;return{...body,readVersion:sha(body)};};
async function fixture(){const f=batchFixture();const {documentaryDirectory}=await f.readRoster();return{f,directory:documentaryDirectory};}
function response(){return{headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.payload=value;return this;}};}

test('private authenticated assignments preserve full population and all ambiguous candidates',async()=>{
 const {f,directory}=await fixture();const copy=verifiedDocumentaryDirectory(directory,expect(f));
 assert.equal(copy.records.length,62);assert.equal(copy.records.find(r=>r.number==='0060').assignments.length,2);
 directory.records[0].assignments[0].name='Later synthetic change';assert.notEqual(copy.records[0].assignments[0].name,directory.records[0].assignments[0].name);
});

const invalid={
 absent:()=>undefined,
 unknownVersion:v=>({...v,version:'payroll-document-assignments.v2'}),
 extraEnvelopeKey:v=>({...v,before_person:{PRIVATE:true}}),
 wrongTenant:v=>({...v,scope:{...v.scope,tenantId:batchContract(999)}}),
 wrongDataset:v=>({...v,scope:{...v.scope,datasetId:batchContract(999)}}),
 wrongBinding:v=>({...v,scope:{...v.scope,bindingId:batchContract(999)}}),
 wrongCompany:v=>({...v,scope:{...v.scope,companyId:102}}),
 wrongDatabase:v=>({...v,scope:{...v.scope,database:'different-qa'}}),
 wrongCutoff:v=>({...v,cutoff:'2026-09-11T18:17:30Z'}),
 invalidDate:v=>({...v,cutoff:'2026-02-30T18:17:30Z'}),
 extraScopeKey:v=>({...v,scope:{...v.scope,currentSalary:'PRIVATE'}}),
 truncated:v=>({...v,records:v.records.slice(1)}),
 duplicateNumber:v=>({...v,records:[v.records[0],v.records[0],...v.records.slice(2)]}),
 foreignNumber:v=>({...v,records:[{...v.records[0],number:'90001'},...v.records.slice(1)]}),
 extraAssignmentKey:v=>({...v,records:[{...v.records[0],assignments:[{...v.records[0].assignments[0],dni:'PRIVATE'}]},...v.records.slice(1)]}),
 malformedContract:v=>({...v,records:[{...v.records[0],assignments:[{...v.records[0].assignments[0],contractId:'same-legajo'}]},...v.records.slice(1)]}),
 numericName:v=>({...v,records:[{...v.records[0],assignments:[{...v.records[0].assignments[0],name:1}]},...v.records.slice(1)]}),
 unsafeName:v=>({...v,records:[{...v.records[0],assignments:[{...v.records[0].assignments[0],name:'Hidden\u202eQA'}]},...v.records.slice(1)]}),
 tooManyAssignments:v=>({...v,records:[{...v.records[0],assignments:Array.from({length:101},()=>v.records[0].assignments[0])},...v.records.slice(1)]}),
};
for(const [name,change]of Object.entries(invalid))test('rejects '+name+' even with a newly computed content hash',async()=>{
 const {f,directory}=await fixture();const changed=change(directory);
 assert.throws(()=>verifiedDocumentaryDirectory(changed?seal(changed):changed,expect(f)),{code:'PAYROLL_BATCH_DIRECTORY_DRIFT'});
});

test('an unchanged claimed hash cannot hide changed directory contents',async()=>{
 const {f,directory}=await fixture();directory.records[0].assignments[0].sectorCode='10';
 assert.throws(()=>verifiedDocumentaryDirectory(directory,expect(f)),{code:'PAYROLL_BATCH_DIRECTORY_DRIFT'});
});

test('private directory accepts the full existing public name/sector limits without truncating Unicode',async()=>{
 const {f,directory}=await fixture();const assignment=directory.records[0].assignments[0];
 assignment.name='Á'.repeat(239)+'Ñ';assignment.sectorLabel='É'.repeat(239)+'Ü';assignment.sectorCode='9'.repeat(40);
 const valid=verifiedDocumentaryDirectory(seal(directory),expect(f));
 assert.equal(valid.records[0].assignments[0].name,assignment.name);assert.equal(valid.records[0].assignments[0].sectorLabel,assignment.sectorLabel);
 assignment.name+='X';assert.throws(()=>verifiedDocumentaryDirectory(seal(directory),expect(f)),{code:'PAYROLL_BATCH_DIRECTORY_DRIFT'});
});

test('server roster retains the validated private projection outside its public payload',async()=>{
 const {f,directory}=await fixture();const raw={...f.roster,documentaryDirectory:directory};
 const result=await internalPayrollRoster({query:async()=>[{result:raw}]},{query},principal,session);
 assert.deepEqual(result.documentaryDirectory,directory);assert.equal(result.payload.data.documentaryDirectory,undefined);
 const publicBody=JSON.stringify(result.payload);assert.doesNotMatch(publicBody,/documentaryDirectory|payroll-document-assignments|bindingId|readVersion|assignments/);
 assert.equal(result.payload.data.rows.length,62);assert.equal(result.payload.data.official,false);
});

test('real HTTP router serializes only the public roster and sets no-store',async()=>{
 const {f,directory}=await fixture();let ownerReads=0;
 const handler=createInternalDataHandler({env:{NODE_ENV:'test'},requireCompatibleInternalAccess:async()=>({mode:'managed',principal,session}),actionMutationSession:()=>session,
  getActionCenterSql:async()=>({query:async()=>[{result:{...f.roster,documentaryDirectory:directory}}]}),getInternalSql:async()=>{ownerReads++;assert.fail('no owner SQL');}});
 const res=response();await handler({method:'GET',query},res);
 assert.equal(res.statusCode,200);assert.equal(ownerReads,0);assert.match(res.headers['Cache-Control'],/no-store/);
 assert.doesNotMatch(JSON.stringify(res.payload),/documentaryDirectory|payroll-document-assignments|bindingId|readVersion|assignments/);
 assert.deepEqual(res.payload.data.rows,f.roster.rows);
});

test('a malformed private projection returns no public nominal rows or private error data',async()=>{
 const {f,directory}=await fixture();directory.records[0].assignments[0].sourceSecret='PRIVATE_DIRECTORY_SECRET';const diagnostics=[];
 const handler=createInternalDataHandler({env:{NODE_ENV:'test'},requireCompatibleInternalAccess:async()=>({mode:'managed',principal,session}),actionMutationSession:()=>session,
  getActionCenterSql:async()=>({query:async()=>[{result:{...f.roster,documentaryDirectory:seal(directory)}}]}),reportReadFailure:d=>diagnostics.push(d)});
 const res=response();await handler({method:'GET',query},res);assert.equal(res.statusCode,503);assert.equal(res.payload.data,undefined);
 assert.doesNotMatch(JSON.stringify({response:res.payload,diagnostics}),/PRIVATE_DIRECTORY_SECRET|Agente QA|documentaryDirectory/);
});

test('batch refuses an old facade without a private verified directory, with no legacy lookup fallback',async()=>{
 const f=batchFixture();const r=await f.readRoster();delete r.documentaryDirectory;
 await assert.rejects(internalPayrollDocumentBatch(f.sql,{query:{datasetId:BATCH_DATASET}},batchBinding,BATCH_SNAPSHOT,{readRoster:async()=>r}),{code:'PAYROLL_BATCH_DIRECTORY_DRIFT'});
 assert.equal(f.calls.length,1);assert.match(f.calls[0].text,/payroll-batch:metadata/);
});

test('a changed final repartition with a valid new hash invalidates the entire batch',async()=>{
 const f=batchFixture();let n=0;
 const result=await internalPayrollDocumentBatch(f.sql,{query:{datasetId:BATCH_DATASET}},batchBinding,BATCH_SNAPSHOT,{readRoster:async()=>{
  const r=await f.readRoster();if(++n===2){r.documentaryDirectory.records[0].assignments[0].sectorCode='10';r.documentaryDirectory=seal(r.documentaryDirectory);}return r;
 }});
 assert.equal(result.status,409);assert.equal(result.payload.data,undefined);assert.equal(result.payload.code,'PAYROLL_BATCH_SELECTION_CHANGED');
});

for(const status of [401,403])test('final authorization '+status+' discloses none of the earlier directory',async()=>{
 const f=batchFixture();let n=0;const result=await internalPayrollDocumentBatch(f.sql,{query:{datasetId:BATCH_DATASET}},batchBinding,BATCH_SNAPSHOT,{readRoster:async()=>++n===2?{status,payload:{ok:false,code:'QA_REVOKED'}}:f.readRoster()});
 assert.equal(result.status,status);assert.equal(result.payload.data,undefined);assert.doesNotMatch(JSON.stringify(result.payload),/Agente QA|records|assignments/);
});
