import test from 'node:test';
import assert from 'node:assert/strict';
import {grhPublicationIdentity,publishGrhSourceWithinTransaction} from '../scripts/lib/grh-source-publication.mjs';
const source = (date,sha) => ({expected:{sourceDatabase:'grh_junin',sourceSha256:sha.toUpperCase(),cutoff:date.replace('T',' '),
  qualityFlags:{profile:'grh-junin-'+date.slice(0,10),manifestSha256:'C'.repeat(64)}},projectTables:()=>({})});
function fixture() {
 const baseline=source('2026-08-06T15:15:21','a'.repeat(64)),candidate=source('2026-09-10T15:17:30','b'.repeat(64));
 const version={payloadSha256:'d'.repeat(64),baseline:{profileId:baseline.expected.qualityFlags.profile,sourceDatabase:'grh_junin',sourceSha256:'a'.repeat(64),cutoff:'2026-08-06T15:15:21'},
   candidate:{profileId:candidate.expected.qualityFlags.profile,sourceDatabase:'grh_junin',sourceSha256:'b'.repeat(64),cutoff:'2026-09-10T15:17:30'}};
 const schoolingPayload={version:'schooling-source-recovery.v1',sourceSystem:'GRH',sourceDatabase:'grh_junin',sourceSha256:'b'.repeat(64),sourceDeclaredCutoff:version.candidate.cutoff,
  rows:[{familyId:'1',companyId:101,legajo:'1',identitySha256:'e'.repeat(64),sourceFields:{PRES_14:null,VENC_14:'2026-12-31'}}]};
 const curatedVersion={baseline:structuredClone(baseline.expected),candidate:structuredClone(candidate.expected),payloadSha256:'f'.repeat(64)};
 return {tenantId:'11111111-1111-4111-8111-111111111111',sourceBindingId:'22222222-2222-4222-8222-222222222222',baselineBatchId:'33333333-3333-4333-8333-333333333333',baselineImportRunId:'3',baseline,candidate,version,curatedVersion,schoolingPayload};
}
test('reviewed publication identity binds tenant, source, schooling nulls and core payload',()=>{
 const a=fixture(),id=grhPublicationIdentity(a);
 assert.match(id,/^[a-f0-9]{64}$/);
 for(const mutate of [b=>b.tenantId='44444444-4444-4444-8444-444444444444',b=>b.baselineImportRunId='4',
  b=>b.version.payloadSha256='f'.repeat(64),b=>b.curatedVersion.payloadSha256='1'.repeat(64),b=>b.schoolingPayload.rows[0].sourceFields.PRES_14='',b=>b.schoolingPayload.rows[0].identitySha256='f'.repeat(64)]) {
  const b=fixture();mutate(b);assert.notEqual(grhPublicationIdentity(b),id);
 }
 // Generated DB version UUIDs do not alter the package identity across PG17/18.
 const b=fixture();b.version.versionId='55555555-5555-4555-8555-555555555555';assert.equal(grhPublicationIdentity(b),id);
});
test('schooling must be from the exact candidate, with no fallback to the previous recovery',()=>{
 for(const patch of [{sourceSha256:'a'.repeat(64)},{sourceDeclaredCutoff:'2026-08-06T15:15:21'},{sourceDatabase:'other'}]) {
  const a=fixture();Object.assign(a.schoolingPayload,patch);
  assert.throws(()=>grhPublicationIdentity(a),{code:'GRH_PUBLICATION_SCHOOLING_MISMATCH'});
 }
});
test('mismatched package is rejected before the connection is used',async()=>{
 const a=fixture();let called=false;
 await assert.rejects(publishGrhSourceWithinTransaction({...a,expectedPublicationSha256:'0'.repeat(64),client:{query:async()=>{called=true;}}}),{code:'GRH_PUBLICATION_IDENTITY_MISMATCH'});
 assert.equal(called,false);
});
test('autocommit and wrong isolation cannot start source writes or own transaction boundaries',async()=>{
 const a=fixture(),expectedPublicationSha256=grhPublicationIdentity(a),queries=[];
 await assert.rejects(publishGrhSourceWithinTransaction({...a,expectedPublicationSha256,client:{query:async q=>{queries.push(q);throw Object.assign(Error('no transaction'),{code:'25P01'});}}}),{code:'25P01'});
 assert.deepEqual(queries,['SAVEPOINT grh_coordinated_publication']);
 queries.length=0;
 await assert.rejects(publishGrhSourceWithinTransaction({...a,expectedPublicationSha256,client:{query:async q=>{queries.push(q);return{rows:[{transaction_isolation:'repeatable read'}]};}}}),{code:'GRH_PUBLICATION_ISOLATION_REQUIRED'});
 assert.equal(queries.length,2);assert.equal(queries.some(q=>/^(?:BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE|DELETE)/.test(q)),false);
});
