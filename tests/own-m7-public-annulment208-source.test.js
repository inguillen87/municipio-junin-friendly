// Pure SOURCE/DTO regressions proposed for the public208 constructor; not native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {composeOwnAnnulmentReview208PublicSource,assertOwnAnnulmentReview208PublicProof,assertOwnAnnulmentReview208PublicDurability,OWN_PUBLIC_ANNUL208_VERSION} from '../scripts/lib/own-m7-public-annulment208-source.mjs';
import {composeOwnFullCapacity190PublicInstallation} from '../scripts/lib/own-full-capacity-190-public-installation.mjs';
import {composeOwnCloseSnapshot215Raw} from '../scripts/lib/own-m7-public-successors213215.mjs';
import {projectOwnFullCapacity190PublicPostflight} from '../scripts/lib/own-m7-public-successors201-bridge.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sourceCommit='9a044e069b7adcb9586ddf850a254fdeb7ff338f',major=17;
const hash=s=>createHash('sha256').update(s).digest('hex');
let cached;const batch=()=>cached??=composeOwnAnnulmentReview208PublicSource({read,sourceCommit,major});

test('public208 composes only legitimate public13/7 metadata and retains whole201 at the exact215 successor',()=>{
 const p=batch();assert.equal(p.version,OWN_PUBLIC_ANNUL208_VERSION);assert.equal(p.schema,'public');assert.equal(p.major,17);assert.equal(p.predecessorPins.length,13);assert.equal(p.ownPins.length,7);
 assert.equal(p.ownPins.filter(pin=>pin.runtime).length,4);assert.equal(p.predecessorPins.filter(pin=>pin.runtime).length,1);
 assert.equal(p.predecessorPins.find(pin=>pin.runtime).name,'own_liquidation_command_v1');
 for(const pin of [...p.predecessorPins,...p.ownPins])assert.ok(pin.signature.startsWith('public.'));
 assert.equal(p.qaPoolUsed,false);assert.equal(p.relocated,false);assert.equal(p.createsActors,false);assert.equal(p.roleAssignmentsAdded,0);assert.equal(p.executesSql,false);assert.equal(p.executionAdmitted,false);
 assert.ok(p.requiresReviewedPublicTransport);assert.ok(!p.statements.join('\n').includes('mc_qa_fixed_092_'));
 const capacity=composeOwnFullCapacity190PublicInstallation({read,sourceCommit}),raw=composeOwnCloseSnapshot215Raw({read,sourceCommit,major});
 const projected=projectOwnFullCapacity190PublicPostflight({read,sourceCommit,capacityPlan:capacity,raw,postflight:capacity.verification[0]});
 assert.equal(p.capacity215GuardSha256,hash(projected.afterPostflight));assert.equal(projected.unchangedOtherRecords,26);
 for(const group of [p.statements,p.verification,p.postflight])assert.ok(group.some(sql=>sql.includes(projected.afterPostflight)),'the complete source guard is preserved, not selected records');
 assert.equal(p.provenance.length,13);assert.ok(p.provenance.every(row=>row.aclPolicySource==='scripts/migrations/208-own-annulment-review-index.sql'));
 assert.ok(p.sourceBookend().sourceMetadataOnly);assert.equal(p.sourceBookend().observedMetadataUsed,false);
});

test('208 has no constructor transport/fixture admission surface and refuses malformed source identity before a read',()=>{
 let reads=0;const noRead=()=>{reads++;throw Error('must not read');};
 assert.throws(()=>composeOwnAnnulmentReview208PublicSource({read:noRead,sourceCommit:'not-source',major}));assert.equal(reads,0);
 assert.throws(()=>composeOwnAnnulmentReview208PublicSource({read:noRead,sourceCommit,major:16}));assert.equal(reads,0);
 assert.equal(Object.hasOwn(batch(),'foundation'),false);assert.equal(Object.hasOwn(batch(),'actor'),false);assert.equal(Object.hasOwn(batch(),'passed'),false);
 assert.ok(Object.isFrozen(batch()));assert.ok(Object.isFrozen(batch().statements));assert.ok(Object.isFrozen(batch().predecessorPins[0].config));
});

test('the finite copied public lineage is byte identical to the existing source contract',()=>{
 const self=read('scripts/lib/own-m7-public-annulment208-source.mjs'),parent=read('scripts/lib/own-m7-public-schema-batch.mjs');
 const from='// Public lineage of the eight193 prerequisites:',to='// Six finite source-contract extractions,';
 const inherited=parent.slice(parent.indexOf(from),parent.indexOf(to));
 assert.equal(self.slice(self.indexOf('// BEGIN_UNCHANGED_PUBLIC_PREREQUISITES\n')+'// BEGIN_UNCHANGED_PUBLIC_PREREQUISITES\n'.length,self.indexOf('\n// END_UNCHANGED_PUBLIC_PREREQUISITES')),inherited);
});

test('208 rejects changed source/ACL policy/proof producer before returning a public plan',()=>{
 for(const file of ['scripts/migrations/208-own-annulment-review-index.sql','scripts/lib/own-m7-public-schema-batch.mjs','scripts/lib/own-payroll-annulment-review-v2-installation.mjs']){
  assert.throws(()=>composeOwnAnnulmentReview208PublicSource({sourceCommit,major,read:path=>read(path)+(path===file?'\n-- unreviewed':'')}),/PUBLIC208_SOURCE_CHANGED/);
 }
});

test('a live source bookend rechecks the public source epoch without querying a database',()=>{
 let changed=false;const reader=file=>read(file)+(changed&&file==='scripts/migrations/208-own-annulment-review-index.sql'?'\n':'');
 const p=composeOwnAnnulmentReview208PublicSource({read:reader,sourceCommit,major});assert.equal(p.sourceBookend().sourceCommit,sourceCommit);changed=true;assert.throws(()=>p.sourceBookend(),/PUBLIC208_SOURCE_BOOKEND_CHANGED/);
});

// DTOs below test only the pure validator. They are not source admission or DB receipts.
function proof(p,mode,pid,write){return {version:'own-annulment-review208-installation-proof.v1',sourceCommit:p.sourceCommit,sourceSqlSha256:p.sourceSqlSha256,sourceHashes:{...p.sourceHashes},predecessorPinsSha256:p.predecessorPinsSha256,mode,newFunctions:7,privateHelpers:3,runtimeFacades:4,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,priorStateSha256:'1'.repeat(64),objectSha256:'2'.repeat(64),transactionDataPreserved:write,...(write?{beforeStateSha256:'1'.repeat(64)}:{}),native:{serverVersionNum:'170011',pid,backendStart:'2026-10-27T00:00:00.'+String(pid).padStart(6,'0')+'Z'}};}

test('proof checker requires the real source plan and rejects source/metadata/destination drift',()=>{
 const p=batch(),dto=proof(p,'install',11,true);assert.ok(assertOwnAnnulmentReview208PublicProof({batch:p,proof:dto}).phaseProofValidated);
 assert.throws(()=>assertOwnAnnulmentReview208PublicProof({batch:{...p},proof:dto}),/PUBLIC208_SOURCE_PLAN_REQUIRED/);
 for(const patch of [{sourceCommit:'b'.repeat(40)},{businessWrites:1},{runtimeFacades:5},{sourceSqlSha256:'f'.repeat(64)},{native:{...dto.native,serverVersionNum:'180001'}}])assert.throws(()=>assertOwnAnnulmentReview208PublicProof({batch:p,proof:{...dto,...patch}}));
});

test('durability demands four independent actual receipt shapes and preserves the original208 comparison',()=>{
 const p=batch(),input={batch:p,rehearsal:proof(p,'install',11,true),installed:proof(p,'install',12,true),durable:proof(p,'verify',13,false),repeated:proof(p,'verify',14,true)};
 // Rolled-back functions receive fresh OIDs on install; their object hash is not durable evidence.
 input.rehearsal.objectSha256='4'.repeat(64);
 assert.ok(assertOwnAnnulmentReview208PublicDurability(input).independentDurabilityVerified);
 assert.throws(()=>assertOwnAnnulmentReview208PublicDurability({...input,durable:{...input.durable,priorStateSha256:'3'.repeat(64)}}),/PUBLIC208_NOT_DURABLE/);
 assert.throws(()=>assertOwnAnnulmentReview208PublicDurability({...input,repeated:{...input.repeated,native:input.installed.native}}),/PUBLIC208_INDEPENDENT_CONNECTIONS_REQUIRED/);
 assert.throws(()=>assertOwnAnnulmentReview208PublicDurability({...input,rehearsal:undefined}));
});
