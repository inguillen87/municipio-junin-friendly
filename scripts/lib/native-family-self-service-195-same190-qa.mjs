// ROOT ASSEMBLY CANDIDATE. Reuses composition proposal section2; no execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bindNativeFamily195Technical} from './native-family-195-same190-continuation.mjs';
import {
 buildNativeFamilyPrerequisites190Installation,
 familyRelocationHashes,familyNormalizer,assertNativeFamilyPrerequisitesDurability
} from './native-family-prerequisites-190-installation.mjs';
import {
 buildNativeFamilySelfService195Installation,assertNativeFamilySelfService195Durability
} from './native-family-self-service-195-installation.mjs';
import {
 prepareOwnMonthlyFullCapacity,continueOwnMonthlyFullCapacity
} from '../verify-own-monthly-payroll-full-capacity.mjs';

export const FAMILY195_QA_ENTRIES=Object.freeze([
 'scripts/verify-native-family195-same190.mjs',
 'scripts/lib/native-family-prerequisites-190-installation.mjs',
 'scripts/lib/native-family-self-service-195-installation.mjs',
 'scripts/lib/native-family-self-service-195-same190-qa.mjs',
 'scripts/lib/native-family-195-same190-continuation.mjs',
 'scripts/lib/native-family195-same190-actors.mjs',
 'scripts/lib/native-family-195-native-browser.mjs',
 'scripts/lib/native-family-195-rpc.mjs',
 'scripts/lib/friendly-shell-page.mjs',
 'scripts/apply-friendly-social-metadata.mjs',
 'tests/native-family-195-rpc.test.js',
 'tests/native-family-195-same190-continuation.test.js',
 'tests/native-family-prerequisites-190-installation.test.js',
 'tests/native-family-self-service-195-same190-qa.test.js',
 'tests/native-family195-same190-actors.test.js',
 'tests/friendly-shell-page.test.js',
 'tests/fixtures/family-schooling-synthetic.js',
 'scripts/internal-schema.sql',
 'scripts/migrations/004-tenant-iam-control-plane.sql',
 'scripts/migrations/005-tenant-identity-gateway.sql',
 'scripts/migrations/006-tenant-action-authority.sql',
 'scripts/migrations/007-action-center-read-facades.sql',
 'scripts/migrations/057-family-schooling-certificates.sql',
 'scripts/migrations/113-native-employee-self-access.sql',
 'scripts/migrations/195-native-family-self-service.sql',
 'scripts/lib/municipal-owner-program-qa.mjs',
 'scripts/lib/native-leave-installation.mjs',
 'lib/internal-native-employees.js',
 'lib/internal-family-certificates.js',
 'assets/native-family-request-model.js',
 'assets/native-family-request-client.js',
 'assets/native-family-request-panel.js',
 'assets/native-family-request.css',
 'assets/native-salary-catalog-model.js',
 'assets/app-routes.js',
 'assets/pwa/icon.svg',
 'assets/pwa/icon-180.png',
 'assets/pwa/icon-192.png',
 'assets/pwa/icon-512.png',
 'assets/pwa/icon-maskable-512.png'
]);
export const FAMILY195_ROOT_ENTRIES=Object.freeze([
 'centro-acciones.html','api/internal-native-family-requests.js'
]);
const hash=s=>createHash('sha256').update(s).digest('hex');
const body=d=>{
 const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);
 assert.ok(m,'FAMILY195_COMPOSITION_BODY');return m[2];
};
const localBatch=(batch,normalized)=>{
 const durable=[...batch.durableVerification];
 // h.json(readOnly:true) already sets READ ONLY in BEGIN, before its guard query.
 // Drop only the candidate's redundant first literal, never a general SET filter.
 if(durable[0]==='SET TRANSACTION READ ONLY')durable.shift();
 assert.ok(durable.every(s=>!/^SET TRANSACTION\b/.test(s)));
 return Object.freeze({
  rehearsal:Object.freeze(batch.rehearsal.map(normalized)),
  installation:Object.freeze(batch.installation.map(normalized)),
  late:Object.freeze(batch.rehearsalLateFailure.map(normalized)),
  durable:Object.freeze(durable.map(normalized))
 });
};

export function composeNativeFamily195Same190({qa,read,major,sourceCommit}){
 assert.ok([17,18].includes(major));assert.equal(qa.major,major);
 assert.equal(qa.sourceCommit,sourceCommit);
 assert.equal(qa.operationalPairBaseline,'published107');
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(typeof qa.normalized,'function');assert.ok(qa.hashes);
 const beforeHashes=JSON.stringify(qa.hashes),hashReference=qa.hashes;
 const actor=qa.actor,checker=qa.checker,normalizer=qa.normalized,foundation=qa.foundation;
 const prerequisites=buildNativeFamilyPrerequisites190Installation({
  read,sourceCommit,closure:'native'
 });
 const self=buildNativeFamilySelfService195Installation({read,sourceCommit,prerequisites});
 const extra={...familyRelocationHashes(prerequisites,qa)};
 for(const d of [...self.definitions,...self.prerequisiteDefinitions,...self.extraDefinitions]){
  const from=hash(body(d)),to=hash(body(qa.normalized(d)));
  if(Object.hasOwn(qa.hashes,from))assert.equal(qa.hashes[from],to,'FAMILY195_FOUNDATION_DIGEST_CONFLICT');
  else if(Object.hasOwn(extra,from))assert.equal(extra[from],to,'FAMILY195_EXTRA_DIGEST_CONFLICT');
  else extra[from]=to;
 }
 const normalized=familyNormalizer(qa,Object.freeze(extra));
 assert.strictEqual(qa.hashes,hashReference);assert.equal(JSON.stringify(qa.hashes),beforeHashes);
 for(const [key,value]of Object.entries({actor,checker,normalized:normalizer,foundation}))
  assert.strictEqual(qa[key],value,'FAMILY195_FOUNDATION_REFERENCE_CHANGED:'+key);
 // All selected predecessor and new-function digests must relocate from source.
 for(const pin of [...prerequisites.pins,...prerequisites.prerequisitePins,
  ...self.ownPins,...self.prerequisitePins]){
  assert.ok(Object.hasOwn(qa.hashes,pin.sha256)||Object.hasOwn(extra,pin.sha256),
   'FAMILY195_UNMAPPED_BODY:'+pin.signature);
 }
 return Object.freeze({
  version:'native-family195-same190-composition.v1',
  schema:qa.schema,sourceCommit,major,foundation:qa,
  prerequisites,self,normalized,
  localPrerequisites:localBatch(prerequisites,normalized),
  localSelf:localBatch(self,normalized),
  sourceEntries:Object.freeze([...new Set([
   ...FAMILY195_QA_ENTRIES,...Object.keys(prerequisites.sourceHashes),
   ...Object.keys(self.sourceHashes)
  ])]),
  connects:false,executesSql:false,createsAnotherFoundation:false,
  createsActors:false,createsRoleAssignments:false
 });
}

export function prepareMonthlyWithFamily195(h){
 const monthly=prepareOwnMonthlyFullCapacity(h);
 assert.strictEqual(monthly.foundation,h.qa);
 const family195=composeNativeFamily195Same190({
  qa:h.qa,read:h.read,major:h.major,sourceCommit:h.sourceCommit
 });
 assert.strictEqual(family195.foundation,h.qa);
 return {
  foundation:h.qa,context:{...monthly.context,family195},
  sourceEntries:[...new Set([
   ...monthly.sourceEntries,...family195.sourceEntries
  ])]
 };
}

export function installNativeFamily195Same190(h){
 const family=h.prepared?.family195;
 assert.equal(family?.version,'native-family195-same190-composition.v1');
 assert.strictEqual(family.foundation,h.qa);assert.equal(family.schema,h.qa.schema);
 assert.equal(family.major,h.major);assert.equal(family.sourceCommit,h.sourceCommit);
 assert.ok(h.sourceCustody&&h.sourceCustody.sourceCommit===h.sourceCommit);
 const stages=[
  {id:'prerequisites',batch:family.prerequisites,local:family.localPrerequisites,
   lateCode:'FAMILY195_REHEARSAL_LATE_FAILURE',
   repeatCode:'FAMILY195_OBJECT_CONFLICT',
   durable:assertNativeFamilyPrerequisitesDurability},
  {id:'self195',batch:family.self,local:family.localSelf,
   lateCode:'FAMILY_SELF195_REHEARSAL_LATE_FAILURE',
   repeatCode:'NATIVE_FAMILY_ALREADY_INSTALLED',
   durable:assertNativeFamilySelfService195Durability}
 ];
 const proofs={};
 for(const stage of stages){
  h.setPhase('family195-'+stage.id+'-rehearsal');
  const prior=h.readFullSnapshot();
  const rehearsal=h.json(stage.local.rehearsal,{end:'ROLLBACK',fullJson:true});
  assert.equal(rehearsal.sourceCommit,h.sourceCommit);
  for(const [key,value]of Object.entries(stage.batch.fixed))assert.equal(rehearsal[key],value,key);
  assert.equal(rehearsal.beforeFingerprint,rehearsal.priorFingerprint);
  assert.deepEqual(h.readFullSnapshot(),prior);
  h.setPhase('family195-'+stage.id+'-late-negative');
  h.expectRollback(stage.local.late,stage.lateCode);
  assert.deepEqual(h.readFullSnapshot(),prior);
  h.setPhase('family195-'+stage.id+'-installation');
  const installed=h.json(stage.local.installation,{fullJson:true});
  // No other DDL, actor, role or business call may enter this window.
  h.setPhase('family195-'+stage.id+'-durable-readonly');
  const durable=h.json(stage.local.durable,{readOnly:true,fullJson:true});
  const durability=stage.durable({installed,durable,batch:stage.batch});
  assert.equal(durability.passed,true);
  h.setPhase('family195-'+stage.id+'-repeat-negative');
  const stable=h.readFullSnapshot();
  h.expectRollback(stage.local.installation,stage.repeatCode);
  assert.deepEqual(h.readFullSnapshot(),stable);
  proofs[stage.id]={rehearsal,installed,durable,durability,
   rehearsalSnapshotEqual:true,lateFailureSnapshotEqual:true,
   repetitionRejected:true,repeatCode:stage.repeatCode};
 }
 h.check('same QA190 installs source-pinned native family prerequisites and195; immediate durable reads preserve110, previous IAM and all prior rows/security');
 return {
  version:'native-family195-same190-technical-proof.v1',passed:true,
  schema:h.qa.schema,sourceCommit:h.sourceCommit,major:h.major,
  proofs,prerequisiteClosure:'native',nativeFamilyV5Source:'110',
  newTables:11,newFunctions:40,runtimeFacades:12,
  self195:{newTables:3,newFunctions:23,runtimeFacades:10,capabilityDefinitionsAdded:3},
  roleAssignmentsAdded:0,actorsCreated:0,businessOperations:0,
  actualSql:true,actualHttp:false,actualBrowser:false,
  businessCircuitValidated:false,productionWrites:0,municipalAcceptance:false
 };
}

export async function continueMonthlyWithFamily195(h,settings={}){
 assert.ok(settings&&typeof settings==='object'&&!Array.isArray(settings)&&(Object.getPrototypeOf(settings)===Object.prototype||Object.getPrototypeOf(settings)===null));
 assert.ok(Reflect.ownKeys(settings).every(key=>key==='positions210'),'FAMILY195_CONTINUE_SETTINGS_CLOSED');
 const positions210=Object.hasOwn(settings,'positions210')?settings.positions210:false;assert.equal(typeof positions210,'boolean');
 const family195Technical=installNativeFamily195Same190(h);
 bindNativeFamily195Technical(h,family195Technical);
 const monthly=await continueOwnMonthlyFullCapacity(h,{
  annulmentV2Browser:true,annulmentPreparation:true,family195Business:true,...(positions210?{positions210:true}:{})
 });
 assert.equal(monthly.passed,true);
 const family195Business=monthly.capacity?.family195Business;
 assert.equal(family195Business?.version,'native-family195-live190-business.v1');assert.equal(family195Business.passed,true);
 return {...monthly,family195Technical,family195Business};
}
