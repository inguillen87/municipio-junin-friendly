// PROPOSED by Claude (source only; not run by Claude). Target: tests/grh-final-source-revision-october28.test.js
// Fictional rows only (same synthetic fixture as Oct14); never the municipal backup. Portion E: the writer
// accepts exactly the audited Oct28 tuple over the September 10 package, with contract review disabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';import {readFileSync} from 'node:fs';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget as target} from './fixtures/final-source-revision-synthetic.js';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {sealSuccessorPackage,SUCCESSOR_ENTITIES} from '../scripts/lib/grh-successor-package.mjs';
import {validateFinalSourceRevisionInput,FINAL_SOURCE_REVISION_PROFILES,FINAL_SOURCE_REVISION_OCTOBER28} from '../scripts/lib/grh-final-source-revision.mjs';
import {executeFinalSourceRevision,parseFinalSourceRevisionArgs} from '../scripts/prepare-grh-final-source-revision.mjs';

const ID='grh-junin-2026-10-28',previous=await finalRevisionPackage(),profile=getGrhSourceProfile(ID,{allowCandidateRead:true});
const seal=candidate=>sealSuccessorPackage({baseline:previous.baseline,candidate:{...previous.candidate,...candidate},
 results:SUCCESSOR_ENTITIES.map(entity=>({entity,...previous.entities[entity],rows:previous.changes.filter(c=>c.entity===entity)}))});
const pack=seal({profileId:profile.id,sourceSha256:profile.source.sha256.toLowerCase(),cutoff:profile.source.cutoff});
const args=['target','baseline-core','candidate-core','baseline-curated','candidate-curated']
 .map(key=>'--'+key+'='+path.resolve('verification/synthetic-'+key)).concat('--expect-package='+pack.payloadSha256,'--rehearse');
const lease=options=>{const client=finalRevisionClient(pack,options),releases=[];client.release=e=>releases.push(e);return{client,releases};};
const execute=(client,options={})=>executeFinalSourceRevision({connect:async()=>client,prepared:pack,target,expectedPackageSha256:pack.payloadSha256,installSchema:false,...options});
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('lista exacta: Oct28 sólo se agrega; consumidores y su lista no se amplían',()=>{
 assert.deepEqual(FINAL_SOURCE_REVISION_PROFILES,['grh-junin-2026-10-01','grh-junin-2026-10-14',ID]);assert.ok(Object.isFrozen(FINAL_SOURCE_REVISION_PROFILES));
 assert.deepEqual(FINAL_SOURCE_REVISION_OCTOBER28,{profileId:ID,sourceSha256:'fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1',cutoff:'2026-10-28T15:16:35',
  baseline:{profileId:'grh-junin-2026-09-10',sourceSha256:'5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7',cutoff:'2026-09-10T15:17:30'},reviewContracts:false});
 assert.ok(Object.isFrozen(FINAL_SOURCE_REVISION_OCTOBER28.baseline));
 // The constants are the registry's audited tuple, not a database observation.
 assert.equal(profile.source.sha256.toLowerCase(),FINAL_SOURCE_REVISION_OCTOBER28.sourceSha256);assert.equal(profile.source.cutoff,FINAL_SOURCE_REVISION_OCTOBER28.cutoff);
 const sept10=getGrhSourceProfile('grh-junin-2026-09-10',{allowCandidateRead:true});
 assert.equal(sept10.source.sha256.toLowerCase(),FINAL_SOURCE_REVISION_OCTOBER28.baseline.sourceSha256);assert.equal(sept10.source.cutoff,FINAL_SOURCE_REVISION_OCTOBER28.baseline.cutoff);
 assert.ok(read('scripts/lib/grh-final-source-consumers.mjs').includes("const sourceProfileIds=Object.freeze(['grh-junin-2026-10-01','grh-junin-2026-10-14']);"),'consumers unchanged');
});
test('paquete Sept10→Oct28 exacto; cualquier tupla cruzada se rechaza antes de conectar',async()=>{
 const checked=validateFinalSourceRevisionInput(pack,target,pack.payloadSha256);
 assert.equal(checked.pack.candidate.profileId,ID);assert.equal(checked.pack.baseline.profileId,'grh-junin-2026-09-10');
 assert.equal(checked.pack.baseline.sourceSha256,FINAL_SOURCE_REVISION_OCTOBER28.baseline.sourceSha256);assert.equal(checked.pack.baseline.cutoff,FINAL_SOURCE_REVISION_OCTOBER28.baseline.cutoff);
 for(const[field,value]of[['sourceSha256','0'.repeat(64)],['sourceSha256',previous.candidate.sourceSha256],['cutoff','2026-10-28T15:16:36'],['cutoff',previous.candidate.cutoff]]){
  const forged=structuredClone(pack);forged.candidate[field]=value;let opened=false;
  await assert.rejects(executeFinalSourceRevision({connect:async()=>{opened=true;throw Error('must not open');},prepared:forged,target,expectedPackageSha256:pack.payloadSha256}),
   e=>['SUCCESSOR_PACKAGE_INVALID','GRH_FINAL_REVISION_PROFILE'].includes(e.code),field+'='+value);
  assert.equal(opened,false);
 }
});
test('CLI: Oct28 explícito, nunca implícito, y sin --review-contracts',()=>{
 assert.equal(parseFinalSourceRevisionArgs(args)['candidate-profile'],undefined,'default unchanged');
 assert.equal(parseFinalSourceRevisionArgs([...args,'--candidate-profile='+ID])['candidate-profile'],ID);
 assert.throws(()=>parseFinalSourceRevisionArgs([...args,'--candidate-profile='+ID,'--review-contracts']),{code:'GRH_FINAL_REVISION_ARGUMENT'});
 assert.equal(parseFinalSourceRevisionArgs([...args,'--candidate-profile=grh-junin-2026-10-14','--review-contracts'])['review-contracts'],true,'Oct14 behaviour unchanged');
 for(const id of['latest','grh-junin-2026-10-28 ','GRH-JUNIN-2026-10-28','grh-junin-2026-10-29',''])
  assert.throws(()=>parseFinalSourceRevisionArgs([...args,'--candidate-profile='+id]),{code:'GRH_FINAL_REVISION_ARGUMENT'});
});
test('ejecución: reviewContracts=true con Oct28 se rechaza sin abrir conexión',async()=>{
 let opened=false;
 await assert.rejects(executeFinalSourceRevision({connect:async()=>{opened=true;throw Error('must not open');},prepared:pack,target,expectedPackageSha256:pack.payloadSha256,reviewContracts:true}),{code:'GRH_FINAL_REVISION_ARGUMENT'});
 assert.equal(opened,false);
});
test('Oct28 guarda sólo una revisión inmutable distinta: sin selección, adopción ni cálculo; ensayo sin residuos',async()=>{
 const{client,releases}=lease({state:{installed:true}}),receipt=await execute(client,{commit:true});
 assert.equal(receipt.committed,true);assert.equal(receipt.entities,10);
 assert.equal(client.stored.source_profile,ID);assert.equal(client.stored.source_sha256,FINAL_SOURCE_REVISION_OCTOBER28.sourceSha256);assert.equal(client.stored.source_cutoff,FINAL_SOURCE_REVISION_OCTOBER28.cutoff);
 assert.equal(receipt.operationalSourceChanged,false);assert.equal(receipt.adoptionPerformed,false);assert.equal(receipt.payrollCalculated,false);
 assert.equal(receipt.contractTransition,undefined,'no contract review');assert.equal(receipt.municipalConservation.preserved,true);
 assert.ok(!client.calls.some(c=>/^(?:UPDATE|DELETE|TRUNCATE)\b/.test(c.text)));assert.deepEqual(releases,[undefined]);
 const clean=lease({state:{installed:true}}),rehearsal=await execute(clean.client);assert.equal(rehearsal.rolledBack,true);assert.equal(clean.client.stored,null);assert.equal(clean.client.deltaRows,0);
});
