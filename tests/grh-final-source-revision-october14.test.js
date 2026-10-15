import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget as target} from './fixtures/final-source-revision-synthetic.js';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {sealSuccessorPackage,SUCCESSOR_ENTITIES} from '../scripts/lib/grh-successor-package.mjs';
import {validateFinalSourceRevisionInput,FINAL_SOURCE_REVISION_PROFILES} from '../scripts/lib/grh-final-source-revision.mjs';
import {executeFinalSourceRevision,parseFinalSourceRevisionArgs} from '../scripts/prepare-grh-final-source-revision.mjs';

// Fictional rows, not the municipality's backup. Only the registered evidence
// identity changes; all ten domains and complete differences stay in the pack.
const previous=await finalRevisionPackage(),profile=getGrhSourceProfile('grh-junin-2026-10-14',{allowCandidateRead:true});
const pack=sealSuccessorPackage({baseline:previous.baseline,candidate:{...previous.candidate,
 profileId:profile.id,sourceSha256:profile.source.sha256.toLowerCase(),cutoff:profile.source.cutoff},
 results:SUCCESSOR_ENTITIES.map(entity=>({entity,...previous.entities[entity],rows:previous.changes.filter(c=>c.entity===entity)}))});
const args=['target','baseline-core','candidate-core','baseline-curated','candidate-curated']
 .map(key=>'--'+key+'='+path.resolve('verification/synthetic-'+key)).concat('--expect-package='+pack.payloadSha256,'--rehearse');
const lease=options=>{const client=finalRevisionClient(pack,options),releases=[];client.release=e=>releases.push(e);return{client,releases};};
const execute=(client,options={})=>executeFinalSourceRevision({connect:async()=>client,prepared:pack,target,
 expectedPackageSha256:pack.payloadSha256,installSchema:false,...options});

test('both explicitly reviewed source profiles remain immutable and exact',()=>{
 assert.deepEqual(FINAL_SOURCE_REVISION_PROFILES,['grh-junin-2026-10-01','grh-junin-2026-10-14']);assert.ok(Object.isFrozen(FINAL_SOURCE_REVISION_PROFILES));
 const original=structuredClone(pack),checked=validateFinalSourceRevisionInput(pack,target,pack.payloadSha256);
 assert.equal(checked.pack.candidate.profileId,profile.id);assert.equal(checked.pack.candidate.sourceSha256,profile.source.sha256.toLowerCase());
 assert.equal(checked.pack.candidate.cutoff,profile.source.cutoff);assert.deepEqual(pack,original);assert.equal(pack.changes.length,previous.changes.length);
 assert.equal(Object.keys(pack.entities).length,10);assert.notEqual(pack.payloadSha256,previous.payloadSha256);
 assert.equal(validateFinalSourceRevisionInput(previous,target,previous.payloadSha256).pack.candidate.profileId,'grh-junin-2026-10-01');
});
test('the CLI opts into October14 without changing its previous default or accepting an implicit latest',()=>{
 assert.equal(parseFinalSourceRevisionArgs(args)['candidate-profile'],undefined);
 for(const id of FINAL_SOURCE_REVISION_PROFILES)assert.equal(parseFinalSourceRevisionArgs([...args,'--candidate-profile='+id])['candidate-profile'],id);
 for(const id of['latest','grh-junin-2026-09-22','grh-junin-2026-10-14 ', 'GRH-JUNIN-2026-10-14',''])
  assert.throws(()=>parseFinalSourceRevisionArgs([...args,'--candidate-profile='+id]),{code:'GRH_FINAL_REVISION_ARGUMENT'});
});
test('a crossed hash, cutoff, or profile is refused before acquiring any connection',async()=>{
 for(const[field,value]of[['sourceSha256',previous.candidate.sourceSha256],['cutoff',previous.candidate.cutoff],['profileId','latest']]){
  const forged=structuredClone(pack);forged.candidate[field]=value;let opened=false;
  await assert.rejects(executeFinalSourceRevision({connect:async()=>{opened=true;throw Error('must not open');},prepared:forged,target,expectedPackageSha256:pack.payloadSha256}),{code:'SUCCESSOR_PACKAGE_INVALID'});
  assert.equal(opened,false);
 }
});
test('October14 preparation retains all differences and saves only a distinct immutable review',async()=>{
 const{client,releases}=lease({state:{installed:true}}),receipt=await execute(client,{commit:true});
 assert.equal(receipt.committed,true);assert.equal(receipt.deltaRows,410);assert.equal(receipt.entities,10);assert.equal(client.chunks,3);
 assert.equal(client.stored.source_profile,profile.id);assert.equal(client.stored.source_sha256,profile.source.sha256.toLowerCase());
 assert.equal(client.stored.source_cutoff,profile.source.cutoff);assert.equal(receipt.operationalSourceChanged,false);
 assert.equal(receipt.adoptionPerformed,false);assert.equal(receipt.payrollCalculated,false);assert.equal(receipt.municipalConservation.preserved,true);
 assert.ok(!client.calls.some(c=>/^(?:UPDATE|DELETE|TRUNCATE)\b/.test(c.text)));assert.deepEqual(releases,[undefined]);
 const offset=client.calls.length,replay=await execute(client,{commit:true});assert.equal(replay.replayed,true);assert.equal(replay.revisionId,receipt.revisionId);
 assert.ok(!client.calls.slice(offset).some(c=>/INSERT INTO public\./.test(c.text)));assert.equal(client.deltaRows,410);
});
test('October14 rehearsal and interrupted chunks never leave partial records',async()=>{
 const clean=lease({state:{installed:true}}),receipt=await execute(clean.client);assert.equal(receipt.rolledBack,true);assert.equal(clean.client.stored,null);assert.equal(clean.client.deltaRows,0);
 let chunks=0;const interrupted=lease({state:{installed:true},fail:sql=>sql.includes('final-revision:delta */')&&++chunks===2});
 await assert.rejects(execute(interrupted.client,{commit:true}),/synthetic interrupted query/);
 assert.equal(interrupted.client.stored,null);assert.equal(interrupted.client.deltaRows,0);assert.equal(interrupted.client.calls.at(-1).text,'ROLLBACK');
});
