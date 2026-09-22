import test from 'node:test';
import assert from 'node:assert/strict';
import {grhPublicationIdentity,publishGrhSourceWithinTransaction} from '../scripts/lib/grh-source-publication.mjs';

const ids={tenant:'11111111-1111-4111-8111-111111111111',binding:'22222222-2222-4222-8222-222222222222',
 baseline:'33333333-3333-4333-8333-333333333333',core:'44444444-4444-4444-8444-444444444444',
 batch:'55555555-5555-4555-8555-555555555555',curated:'66666666-6666-4666-8666-666666666666'};
function fixture(){
 const source=(cutoff,sha)=>({expected:{sourceDatabase:'grh_junin',sourceSha256:sha.toUpperCase(),cutoff:cutoff.replace('T',' '),
  qualityFlags:{profile:'grh-junin-'+cutoff.slice(0,10),manifestSha256:'C'.repeat(64)}},projectTables:()=>({})});
 const baseline=source('2026-08-06T15:15:21','a'.repeat(64)),candidate=source('2026-09-10T15:17:30','b'.repeat(64));
 const version={payloadSha256:'d'.repeat(64),baseline:{profileId:baseline.expected.qualityFlags.profile,sourceDatabase:'grh_junin',
  sourceSha256:'a'.repeat(64),cutoff:'2026-08-06T15:15:21'},candidate:{profileId:candidate.expected.qualityFlags.profile,
  sourceDatabase:'grh_junin',sourceSha256:'b'.repeat(64),cutoff:'2026-09-10T15:17:30'}};
 const curatedVersion={baseline:structuredClone(baseline.expected),candidate:structuredClone(candidate.expected),payloadSha256:'f'.repeat(64)};
 const schoolingPayload={version:'schooling-source-recovery.v1',sourceSystem:'GRH',sourceDatabase:'grh_junin',sourceSha256:'b'.repeat(64),
  sourceDeclaredCutoff:'2026-09-10T15:17:30',rows:[{familyId:'1',companyId:101,legajo:'1',identitySha256:'e'.repeat(64),
   sourceFields:{PRES_14:null,VENC_14:'2026-12-31'}}]};
 const input={tenantId:ids.tenant,sourceBindingId:ids.binding,baselineBatchId:ids.baseline,baselineImportRunId:'3',
  baseline,candidate,version,curatedVersion,schoolingPayload};
 return {...input,expectedPublicationSha256:grhPublicationIdentity(input)};
}
function database(input,options={}){
 const calls=[];
 const client={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(/^(?:INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT|ROLLBACK)\b/.test(sql)) assert.fail('Replay may not write or own transaction boundaries');
  if(sql==='SHOW transaction_isolation')return{rows:[{transaction_isolation:'read committed'}]};
  if(sql.includes('pg_try_advisory_xact_lock'))return{rows:[{acquired:true}]};
  if(sql.includes('SELECT b.source_company_id::text company'))return{rows:[{company:'101'}]};
  if(sql.includes('SELECT p.source_version_id::text'))return{rows:[{version_id:ids.core,batch_id:ids.batch,import_run_id:'4',
   baseline_batch_id:ids.baseline,publication_sha256:input.expectedPublicationSha256,payload_sha256:input.version.payloadSha256}]};
  if(sql.includes('SELECT id::text FROM public.grh_curated_source_version'))return{rows:[{id:ids.curated}]};
  if(sql.includes('SELECT v.id FROM grh_curated_source_version v JOIN grh_core_source_version c')){
   return{rows:options.pairDrift?[]:[{id:ids.curated}]};
  }
  if(sql.includes('AS observed, entity_fingerprints')){
   if(options.missingProjection===params[1])return{rows:[]};
   const expected={rows:params[1]==='payrollRuns'?624:params[1]==='payrollSnapshot'?847:2452,md5:'a'.repeat(32)};
   return{rows:[{expected,observed:options.projectionDrift===params[1]?{...expected,md5:'b'.repeat(32)}:{...expected}}]};
  }
  if(sql.includes('SELECT public.school_certificate_source_import_v4')){
   assert.equal(params[5],false);
   return{rows:[{result:{version:'schooling-source-import.v1',applied:false,replayed:options.schoolingMissing!==true,
    rows:1,matched:1,sourceSha256:input.schoolingPayload.sourceSha256,rowsetSha256:'a'.repeat(64),
    originalRowsModified:0,manualRecordsCreated:0,payrollModified:false}}]};
  }
  if(sql.includes('source_version_assert_v1')){
   if(options.sealError)throw Object.assign(Error(options.sealError),{code:options.sealError});
   return{rows:[]};
  }
  if(sql.startsWith('SAVEPOINT ')||sql.startsWith('RELEASE SAVEPOINT '))return{rows:[]};
  assert.fail('Unexpected replay SQL: '+sql);
 }};
 return{client,calls};
}
test('published replay verifies current source pair, three physical projections and persisted schooling without writes',async()=>{
 const input=fixture(),db=database(input);
 const result=await publishGrhSourceWithinTransaction({...input,client:db.client});
 assert.equal(result.replayed,true);assert.equal(result.schooling.replayed,true);
 assert.equal(result.curatedVersionId,ids.curated);assert.equal(result.committed,false);assert.equal(result.callerOwnedTransaction,true);
 const pair=db.calls.find(c=>c.sql.includes('SELECT v.id FROM grh_curated_source_version v JOIN grh_core_source_version c'));
 assert.ok(pair);assert.deepEqual(pair.params,[ids.curated,ids.core,ids.tenant,ids.binding,input.curatedVersion.payloadSha256,input.version.payloadSha256]);
 assert.deepEqual(db.calls.filter(c=>c.sql.includes('AS observed, entity_fingerprints')).map(c=>c.params),[
  [ids.batch,'payrollRuns',ids.core],[ids.batch,'payrollSnapshot',ids.core],[ids.batch,'employmentReconciliation',ids.core]]);
 assert.equal(db.calls.filter(c=>c.sql.includes('source_version_assert_v1')).length,10);
});
test('a valid school dry run with no saved recovery cannot acknowledge published replay',async()=>{
 const input=fixture(),db=database(input,{schoolingMissing:true});
 await assert.rejects(()=>publishGrhSourceWithinTransaction({...input,client:db.client}),{code:'GRH_PUBLICATION_REPLAY_DRIFT'});
 assert.notEqual(db.calls.at(-1).sql,'RELEASE SAVEPOINT grh_coordinated_publication');
});
test('source pair drift rejects replay before school verification',async()=>{
 const input=fixture(),db=database(input,{pairDrift:true});
 await assert.rejects(()=>publishGrhSourceWithinTransaction({...input,client:db.client}),{code:'GRH_SOURCE_PAIR_CURRENT_CONTEXT_MISMATCH'});
 assert.equal(db.calls.some(c=>c.sql.includes('school_certificate_source_import_v4')),false);
});
for(const entity of ['payrollRuns','payrollSnapshot','employmentReconciliation']){
 test('changed persisted '+entity+' rejects replay before school verification',async()=>{
  const input=fixture(),db=database(input,{projectionDrift:entity});
  await assert.rejects(()=>publishGrhSourceWithinTransaction({...input,client:db.client}),{code:'GRH_PUBLICATION_REPLAY_DRIFT'});
  assert.equal(db.calls.some(c=>c.sql.includes('school_certificate_source_import_v4')),false);
 });
}
test('missing physical projection proof fails closed',async()=>{
 const input=fixture(),db=database(input,{missingProjection:'payrollSnapshot'});
 await assert.rejects(()=>publishGrhSourceWithinTransaction({...input,client:db.client}),{code:'GRH_PUBLICATION_REPLAY_DRIFT'});
});
test('sealed baseline drift cannot fall through to published replay',async()=>{
 const input=fixture(),db=database(input,{sealError:'GRH_VERSION_BASELINE_DRIFT'});
 await assert.rejects(()=>publishGrhSourceWithinTransaction({...input,client:db.client}),{code:'GRH_VERSION_BASELINE_DRIFT'});
 assert.equal(db.calls.some(c=>c.sql.includes('school_certificate_source_import_v4')),false);
});
