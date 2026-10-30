// Pure source composition until installArt211Canonical190 is called by the
// existing host. No connection, process, filesystem reader or seed constructor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 buildOwnArtFullInstallation,assertOwnArtFullDurability,SQL211_SHA,
 ART_FULL_SOURCE_SHA,ART_FULL_PREDECESSOR
} from './own-art-full-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';

const SQL211='scripts/migrations/211-own-art-full-source.sql';
const hash=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>value.replace(/\r\n?/g,'\n');
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const body=definition=>{
 const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);
 assert.ok(match,'ART211_SOURCE_BODY_REQUIRED');return match[2];
};
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const once=(source,from,to)=>{
 assert.equal(source.split(from).length,2,'ART211_EXACT_LITERAL_REQUIRED');
 return source.replace(from,()=>to);
};
export const ART211_CANONICAL190_SOURCE_ENTRIES=Object.freeze([
 'scripts/lib/positions211212-same190-installation.mjs',
 'scripts/lib/own-art-full-installation.mjs',
 'tests/own-art-full-installation.test.js',
 'tests/positions211212-same190-source.test.js',
 SQL211,
 ...Object.keys(ART_FULL_SOURCE_SHA)
]);

// Replacement is simultaneous: one newly derived digest can never become the
// input key of a second replacement in the same pass.
function replaceDigests(text,map){
 if(map.size===0)return text;
 const keys=[...map.keys()];for(const key of keys)assert.match(key,/^[a-f0-9]{64}$/);
 return text.replace(new RegExp(keys.join('|'),'g'),value=>map.get(value));
}
const mapKey=map=>JSON.stringify([...map].sort(([a],[b])=>a.localeCompare(b)));

export function composeArt211Canonical190(h){
 assert.ok(h&&typeof h==='object');
 assert.equal(h.qa?.operationalPairBaseline,'published107');
 assert.match(h.qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(typeof h.read,'function');
 assert.equal(typeof h.qa.normalized,'function');
 // Only the reviewed upgrade builder; never buildOwnArtInstallation.
 const {batch,rangeDefinition}=adaptArt211Batch(h);
 assert.equal(batch.predecessorVersion,ART_FULL_PREDECESSOR);
 assert.equal(batch.sourceHashes[SQL211],SQL211_SHA);
 assert.equal(batch.previousPins.length,12);
 assert.equal(batch.groupPins.length,3);
 assert.equal(batch.dependencies.length,12);
 assert.equal(batch.prerequisitePins.length,27);
 assert.equal(batch.ownPins.length,1);
 const sourceHashes=Object.freeze({...batch.sourceHashes}),texts=new Map();
 for(const [file,expected]of Object.entries(sourceHashes)){
  const source=lf(h.read(file));assert.equal(hash(source),expected,'ART211_REVIEWED_SOURCE_CHANGED:'+file);texts.set(file,source);
 }
 const pool=[SALARY_ADMINISTRATIVE_CONTEXT,rangeDefinition];
 for(const [file,source]of texts){
  if(file.endsWith('.sql'))pool.push(...splitPostgresStatements(source).map(clean).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?[a-z0-9_]+\s*\(/.test(s)));
 }
 const wanted=[...batch.prerequisitePins,...batch.ownPins];
 assert.equal(wanted.length,28);
 assert.equal(new Set(wanted.map(p=>p.signature)).size,28);
 const rows=wanted.map(pin=>{
  // Filter by required name before invoking the existing pin parser: other
  // source files may also declare unrelated RETURNS TABLE functions.
  const prefix=new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+pin.name+'\\s*\\(');
  const candidates=pool.filter(d=>prefix.test(d)).filter(d=>{
   const actual=ownInstallationFunctionPin(d);
   return actual.signature===pin.signature&&actual.sha256===pin.sha256;
  });
  assert.equal(candidates.length,1,'ART211_UNIQUE_EXACT_SOURCE:'+pin.signature);
  assert.equal(hash(body(candidates[0])),pin.sha256);
  return {pin,definition:candidates[0]};
 });
 let digests=new Map(),stable=false;
 for(let pass=0;pass<24;pass++){
  const next=new Map();
  for(const row of rows){
   const localized=h.qa.normalized(replaceDigests(row.definition,digests));
   const value=hash(body(localized));
   if(next.has(row.pin.sha256))assert.equal(next.get(row.pin.sha256),value,'ART211_SOURCE_DIGEST_COLLISION');
   next.set(row.pin.sha256,value);
  }
  if(mapKey(next)===mapKey(digests)){digests=next;stable=true;break;}
  digests=next;
 }
 assert.equal(stable,true,'ART211_LOCAL_DIGEST_GRAPH_NOT_STABLE');
 // Source-file identities remain the reviewed raw/LF identities. They cannot
 // accidentally be rewritten as body hashes in the returned proof JSON.
 for(const fileHash of Object.values(sourceHashes))assert.equal(digests.has(fileHash),false,'ART211_SOURCE_FILE_BODY_HASH_COLLISION');
 const normalized=value=>h.qa.normalized(replaceDigests(value,digests));
 const provenance=rows.map(({pin,definition})=>{
  const local=normalized(definition),localSha256=hash(body(local));
  assert.equal(localSha256,digests.get(pin.sha256),'ART211_LOCAL_PIN_NOT_STABLE');
  return Object.freeze({name:pin.name,signature:pin.signature,localSignature:normalized(pin.signature),sourceBodySha256:pin.sha256,localBodySha256:localSha256,runtime:pin.runtime});
 });
 // Explicitly cover the three201 readers: the host's original hash graph is
 // older and must not be treated as already knowing their new body digests.
 for(const pin of batch.groupPins){
  const row=provenance.find(p=>p.signature===pin.signature);
  assert.ok(row);assert.equal(row.sourceBodySha256,pin.sha256);
 }
 const localFull=normalized(batch.definition),localLegacy=normalized(batch.legacyDefinition),schema=h.qa.schema;
 const inverse=once(once(localFull,
  'CREATE FUNCTION '+schema+'.own_art_report_source_full_v1(',
  'CREATE FUNCTION '+schema+'.own_art_report_source_v1('),
  schema+'.own_close_group_full_v1(p,g.id)',schema+'.own_close_group_v1(p,g.id)');
 assert.equal(inverse,localLegacy,'ART211_LOCAL_TWO_LITERAL_INVERSE');
 assert.equal(batch.durableVerification[0],'SET TRANSACTION READ ONLY');
 const installation=batch.installation.map(normalized),durableVerification=batch.durableVerification.slice(1).map(normalized);
 assert.equal(installation.length,batch.installation.length);
 assert.equal(durableVerification.length,batch.durableVerification.length-1);
 assert.ok(installation.every(s=>!/^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/.test(s)));
 assert.ok(durableVerification.every(s=>!/^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(s)));
 const ownSignature=normalized(batch.ownPins[0].signature);
 const absence="SELECT jsonb_build_object('newFunctionAbsent',to_regprocedure("+q(ownSignature)+") IS NULL)";
 return Object.freeze({
  version:'own-art211-canonical190-source-plan.v1',foundation:h.qa,
  sourceCommit:h.sourceCommit,major:h.major,schema,sourceHashes,
  sourceEntries:Object.freeze([...Object.keys(sourceHashes)]),batch,
  installation:Object.freeze(installation),durableVerification:Object.freeze(durableVerification),absence,
  provenance:Object.freeze(provenance),
  derivation:Object.freeze({version:'own-art211-canonical190-source-derivation.v1',sourceSqlSha256:SQL211_SHA,functions:28,group201Functions:3,newFunctions:1,localFullDefinitionSha256:hash(localFull),localLegacyDefinitionSha256:hash(localLegacy),twoLiteralInverseVerified:true,observedMetadataUsed:false}),
  connects:false,executesSql:false
 });
}

function sourceBookend(h,plan){
 // Use THIS live host's closureReader, never a preparation-time FS reader.
 for(const [file,expected]of Object.entries(plan.sourceHashes))assert.equal(hash(lf(h.read(file))),expected,'ART211_SOURCE_BOOKEND_CHANGED:'+file);
 return {version:'own-art211-canonical190-source-bookend.v1',passed:true,sourceCommit:h.sourceCommit,sourceHashes:plan.sourceHashes,observedMetadataUsed:false};
}

function rehearsalProof(value,plan){
 assert.equal(value.version,'own-art-full-installation.v1');
 assert.equal(value.sourceCommit,plan.sourceCommit);
 assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 assert.equal(value.predecessorVersion,ART_FULL_PREDECESSOR);
 for(const [key,expected]of Object.entries({allChecksPassed:true,newTables:0,newFunctions:1,adaptedFunctions:0,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,artHistoryPreserved:true}))assert.equal(value[key],expected,key);
 for(const key of ['priorFingerprint','objectFingerprint'])assert.match(value[key],/^[a-f0-9]{64}$/);
}

export function installArt211Canonical190(h,plan){
 assert.equal(plan?.version,'own-art211-canonical190-source-plan.v1');
 assert.strictEqual(plan.foundation,h.qa,'ART211_FOUNDATION_CHANGED');
 assert.equal(plan.schema,h.qa.schema);assert.equal(plan.sourceCommit,h.sourceCommit);assert.equal(plan.major,h.major);
 for(const name of ['json','read','readFullSnapshot','setPhase','check'])assert.equal(typeof h[name],'function');
 const sourceBefore=sourceBookend(h,plan);
 h.setPhase('art211-canonical190-rehearsal');
 const before=h.readFullSnapshot();
 const absentBefore=h.json([plan.absence],{readOnly:true});assert.equal(absentBefore.newFunctionAbsent,true);
 // h.json defaults to REPEATABLE READ. Never command:true here.
 const rehearsal=h.json(plan.installation,{end:'ROLLBACK'});rehearsalProof(rehearsal,plan);
 assert.deepEqual(h.readFullSnapshot(),before,'ART211_REHEARSAL_NOT_ROLLED_BACK');
 assert.equal(h.json([plan.absence],{readOnly:true}).newFunctionAbsent,true);
 const lateToken='QA_ART211_SAME190_LATE_FAULT',late=[...plan.installation.slice(0,-1),`DO $art211_late_fault$ BEGIN RAISE EXCEPTION '${lateToken}';END $art211_late_fault$`,plan.installation.at(-1)];
 const rejected=h.expectRollback(late,lateToken);assert.equal(rejected.status,3);assert.match(rejected.stderr,/\bERROR:[^\r\n]*\bQA_ART211_SAME190_LATE_FAULT\b/);assert.deepEqual(h.readFullSnapshot(),before,'ART211_LATE_ROLLBACK_CHANGED_STATE');
 h.check('ART211 rehearsal on the same190 rolls back the single new function and preserves all prior rows/security');
 h.setPhase('art211-canonical190-installation');
 const installed=h.json(plan.installation);rehearsalProof(installed,plan);
 h.setPhase('art211-canonical190-durable');
 const durable=h.json(plan.durableVerification,{readOnly:true});
 const durability=assertOwnArtFullDurability({installed,durable,batch:plan.batch});
 assert.equal(durability.passed,true);
 assert.equal(rehearsal.priorFingerprint,installed.priorFingerprint,'ART211_PRIOR_STATE_CHANGED_AFTER_REHEARSAL');
 // Rehearsal creates an OID that is rolled back. Its objectFingerprint MUST
 // NOT be compared with the installed objectFingerprint of the later commit.
 const sourceAfter=sourceBookend(h,plan);
 h.check('ART211 single committed function has exact source-derived metadata/ACL and fresh durable verification; old ART history is preserved');
 return {
  version:'own-art211-canonical190-native-technical.v1',passed:true,
  sourceCommit:h.sourceCommit,major:h.major,sharedFoundation:true,after201:true,beforeFirstCapture:true,
  proofs:{rehearsal,installed,durable},durability,sourceBefore,sourceAfter,
  derivation:plan.derivation,predecessorPins:plan.provenance,
  actualSql:true,artBusinessCovered:false,artBrowserProven:false,
  legacyArtInstallerInvoked:false,secondSeed:false,secondDatabase:false,
  synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false
 };
}


function adaptArt211Batch(h){
 const original=buildOwnArtFullInstallation({read:h.read,sourceCommit:h.sourceCommit});
 const graph=h.qa.foundation.foundation.foundation.owner.graph,period=graph.prior.previous;
 const old=original.dependencies.filter(pin=>pin.name==='payroll_fixed_registry_range_v2'),after=period.afterConsumerPins.filter(pin=>pin.name==='payroll_fixed_registry_range_v2');
 assert.equal(old.length,1);assert.equal(after.length,1);assert.deepEqual({...old[0],sha256:null},{...after[0],sha256:null},'ART211_RANGE_METADATA_CHANGED');
 const definitions=period.changed.filter(definition=>/^CREATE(?: OR REPLACE)? FUNCTION public\.payroll_fixed_registry_range_v2\(/.test(clean(definition)));assert.equal(definitions.length,1);
 const rangeDefinition=definitions[0];assert.deepEqual({...ownInstallationFunctionPin(rangeDefinition),runtime:false},after[0]);
 const current=graph.definitions.filter(definition=>/^CREATE(?: OR REPLACE)? FUNCTION public\.payroll_fixed_registry_range_v2\(/.test(clean(definition)));assert.equal(current.length,1);assert.equal(hash(body(current[0])),after[0].sha256);
 const dependencies=original.dependencies.map(pin=>pin.signature===old[0].signature?after[0]:pin),prerequisitePins=[...original.previousPins,...original.groupPins,...dependencies];assert.equal(prerequisitePins.length,27);
 const before=pinsCheck(original.prerequisitePins,'OWN_ART_FULL_PREDECESSOR_CHANGED'),next=pinsCheck(prerequisitePins,'OWN_ART_FULL_PREDECESSOR_CHANGED');
 const sourceHashes={...original.sourceHashes,...period.sourceHashes};
 const helper='scripts/lib/own-period-classification-installation.mjs';sourceHashes[helper]=hash(lf(h.read(helper)));
 const proof=once(original.proof,q(JSON.stringify(original.sourceHashes))+'::jsonb',q(JSON.stringify(sourceHashes))+'::jsonb');
 const rewrite=(rows,count)=>{let seen=0;const result=rows.map(value=>{const n=value.split(before).length-1;assert.ok(n===0||n===1);seen+=n;return (n?value.replace(before,()=>next):value).replace(original.proof,()=>proof);});assert.equal(seen,count,'ART211_RANGE_GUARD_OCCURRENCES');return result;};
 return {rangeDefinition,batch:{...original,dependencies,prerequisitePins,sourceHashes,proof,beforeCheck:original.beforeCheck.replace(before,()=>next),afterCheck:original.afterCheck.replace(before,()=>next),installation:rewrite(original.installation,2),durableVerification:rewrite(original.durableVerification,1)}};
}

const SQL212='scripts/migrations/212-native-employment-lifecycle-history.sql';
const LIFECYCLE212_SOURCE_PINS=Object.freeze({
 [SQL212]:'99a85e8c9175e8272cc520f5c443c5a1ffd8a52ed3e81746c2b7e57b2d95ad9d',
 'scripts/migrations/110-native-employment-lifecycle.sql':'e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219',
 'scripts/migrations/136-adopted-employment-lifecycle.sql':'577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a'
});
const PAIR_PLANS=new WeakMap();

function composeLifecycle212({qa,major,sourceCommit,read}){
 const texts={};for(const [file,sha]of Object.entries(LIFECYCLE212_SOURCE_PINS)){texts[file]=lf(read(file));assert.equal(hash(texts[file]),sha,'LIFECYCLE212_SOURCE_CHANGED:'+file);}
 const source=texts[SQL212],migration=splitPostgresStatements(source).map(clean);assert.equal(migration.length,4);
 assert.match(migration[0],/^DO \$history_prerequisites\$/);assert.ok(migration[0].indexOf("to_regclass('public.native_employment_lifecycle_proposal')")<migration[0].indexOf('FOREACH required_signature'));
 assert.equal(migration.filter(value=>/^CREATE FUNCTION public\./.test(value)).length,1);
 assert.equal(migration[2],'REVOKE ALL ON FUNCTION public.native_employment_lifecycle_history_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app');
 assert.equal(migration[3],'GRANT EXECUTE ON FUNCTION public.native_employment_lifecycle_history_v2(jsonb,uuid) TO municontrol_actions_runtime_app');
 const wanted=[
  ['scripts/migrations/136-adopted-employment-lifecycle.sql','native_employment_lifecycle_bootstrap_v2',true],
  ['scripts/migrations/136-adopted-employment-lifecycle.sql','native_employment_lifecycle_adopted_context_v2',false],
  ['scripts/migrations/110-native-employment-lifecycle.sql','native_employment_lifecycle_scope_v1',false],
  ['scripts/migrations/110-native-employment-lifecycle.sql','native_employment_lifecycle_summary_v1',false]
 ];
 const get=(source,name)=>{const values=splitPostgresStatements(source).map(clean).filter(value=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(value));assert.equal(values.length,1,'LIFECYCLE212_SOURCE_DEFINITION:'+name);return values[0];};
 const graph=qa.foundation.foundation.foundation.owner.graph;
 const predecessors=wanted.map(([file,name,runtime])=>{const definition=get(texts[file],name),pin={...ownInstallationFunctionPin(definition),runtime};
  const emitted=graph.definitions.filter(value=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(clean(value)));assert.equal(emitted.length,1,'LIFECYCLE212_CANONICAL_DEFINITION:'+name);
  assert.deepEqual({...ownInstallationFunctionPin(emitted[0]),runtime},pin,'LIFECYCLE212_CANONICAL_PREDECESSOR_CHANGED:'+name);return {definition,pin};});
 assert.deepEqual(predecessors.map(row=>row.pin.signature),['public.native_employment_lifecycle_bootstrap_v2(jsonb,uuid)','public.native_employment_lifecycle_adopted_context_v2(jsonb,text)','public.native_employment_lifecycle_scope_v1(jsonb,jsonb)','public.native_employment_lifecycle_summary_v1(jsonb,public.native_employment_lifecycle_proposal)']);
 const definition=migration[1],ownPin={...ownInstallationFunctionPin(definition),runtime:true};assert.equal(ownPin.signature,'public.native_employment_lifecycle_history_v2(jsonb,uuid)');
 const localPin=(pin,definition)=>({...pin,signature:pin.signature.replaceAll('public.',qa.schema+'.'),config:pin.config.map(value=>value.replace('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp')),sha256:hash(body(qa.normalized(definition)))});
 const prerequisitePins=predecessors.map(row=>localPin(row.pin,row.definition)),localOwn=localPin(ownPin,definition),newSignature=localOwn.signature;
 const beforeCheck=pinsCheck(prerequisitePins,'LIFECYCLE212_PREREQUISITE_CHANGED'),ownCheck=pinsCheck([localOwn],'LIFECYCLE212_NEW_FUNCTION_CHANGED');
 const prefix='municontrol_lifecycle212.',normalize=value=>qa.normalized(value).replaceAll(ownPin.sha256,localOwn.sha256);
 const snapshot=slot=>{let value=preservationSnapshot(slot),anchor="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(value.split(anchor).length,3);value=value.replaceAll(anchor,'true');value=once(value,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","p.oid IS DISTINCT FROM to_regprocedure("+q(ownPin.signature)+")");return normalize(value.replaceAll('municontrol_sql111.',prefix));};
 const environment=readOnly=>`DO $lifecycle212_owner$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('server_version_num')::integer/10000<>${major} OR NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.oid=${q(qa.schema)}::regnamespace AND n.nspowner=current_user::regrole) THEN RAISE EXCEPTION 'LIFECYCLE212_OWNER_TRANSACTION_REQUIRED';END IF;END $lifecycle212_owner$`;
 const table=`DO $lifecycle212_table$ BEGIN IF to_regclass(${q(qa.schema+'.native_employment_lifecycle_proposal')}) IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_PREREQUISITE_MISSING';END IF;END $lifecycle212_table$`;
 const guard=normalize(migration[0]),before=snapshot('before'),after=snapshot('after'),checkFamily=`DO $lifecycle212_exact_family$ BEGIN IF(SELECT count(*) FROM pg_proc p WHERE p.pronamespace=${q(qa.schema)}::regnamespace AND p.proname='native_employment_lifecycle_history_v2')<>1 THEN RAISE EXCEPTION 'LIFECYCLE212_NEW_FUNCTION_FAMILY_CHANGED';END IF;END $lifecycle212_exact_family$`;
 const compare=`DO $lifecycle212_conserved$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'LIFECYCLE212_PRIOR_STATE_CHANGED';END IF;END $lifecycle212_conserved$`;
 const proof=`SELECT jsonb_build_object('version','lifecycle212-same190-installation.v1','sourceCommit',${q(sourceCommit)},'schema',${q(qa.schema)},'sourceHashes',${q(JSON.stringify(LIFECYCLE212_SOURCE_PINS))}::jsonb,'predecessorPins',4,'newFunctions',1,'newTables',0,'newCapabilities',0,'newRoles',0,'adaptedFunctions',0,'businessRowsAdded',0,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(newSignature)})))`;
 return Object.freeze({version:'lifecycle212-same190-plan.v1',foundation:qa,major,sourceCommit,sourceHashes:LIFECYCLE212_SOURCE_PINS,prerequisitePins,ownPin:localOwn,predecessors,
  installation:Object.freeze([environment(false),guard,beforeCheck,before,...migration.slice(1).map(normalize),beforeCheck,ownCheck,checkFamily,after,compare,proof]),
  verification:Object.freeze([environment(true),table,beforeCheck,ownCheck,checkFamily,after,proof]),
  absence:"SELECT jsonb_build_object('absent',to_regprocedure("+q(newSignature)+") IS NULL)",connects:false,executesSql:false});
}

function lifecycleProof(value,plan){
 assert.equal(value.version,'lifecycle212-same190-installation.v1');assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.schema,plan.foundation.schema);assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 for(const [key,expected]of Object.entries({predecessorPins:4,newFunctions:1,newTables:0,newCapabilities:0,newRoles:0,adaptedFunctions:0,businessRowsAdded:0,priorStatePreserved:true}))assert.equal(value[key],expected,key);
 for(const key of ['priorFingerprint','objectFingerprint'])assert.match(value[key],/^[a-f0-9]{64}$/);return value;
}

export const POSITIONS211212_ENTRIES=Object.freeze([
 'scripts/lib/positions211212-same190-installation.mjs','scripts/lib/positions211212-same190-fixture.mjs',
 'tests/positions211212-same190-source.test.js','tests/positions211212-same190-fixture.test.js',
 ...ART211_CANONICAL190_SOURCE_ENTRIES,...Object.keys(LIFECYCLE212_SOURCE_PINS),
 'lib/internal-employment-lifecycle.js','assets/native-employment-lifecycle-model.js',
 'api/internal-own-art-report.js','assets/own-art-report-model.js','assets/own-art-report-panel.js',
 'assets/own-art-report-export.js','lib/own-art-response.js'
]);

export function composePositions211212Same190({qa,major,sourceCommit,read}){
 assert.equal(qa.major,major);assert.equal(qa.sourceCommit,sourceCommit);assert.equal(qa.operationalPairBaseline,'published107');assert.ok([17,18].includes(major));
 const originalHashes={...qa.hashes},art211=composeArt211Canonical190({qa,major,sourceCommit,read}),lifecycle212=composeLifecycle212({qa,major,sourceCommit,read});
 assert.deepEqual(qa.hashes,originalHashes,'POSITIONS211212_FOUNDATION_MUTATED');
 const sourceHashes={...art211.sourceHashes,...lifecycle212.sourceHashes},sourceEntries=Object.freeze([...new Set([...POSITIONS211212_ENTRIES,...Object.keys(sourceHashes)])]);
 const plan=Object.freeze({version:'positions211212-same190-plan.v1',foundation:qa,major,sourceCommit,schema:qa.schema,art211,lifecycle212,sourceHashes:Object.freeze(sourceHashes),sourceEntries,connects:false,executesSql:false});PAIR_PLANS.set(plan,{read});return plan;
}

export function installPositions211212Same190(h){
 const plan=h.prepared?.positions211212,record=PAIR_PLANS.get(plan);assert.ok(record,'POSITIONS211212_UNMINTED_PLAN');assert.strictEqual(plan.foundation,h.qa);assert.equal(plan.sourceCommit,h.sourceCommit);assert.equal(plan.major,h.major);assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit);
 for(const [file,sha]of Object.entries(plan.sourceHashes))assert.equal(hash(lf(h.read(file))),sha,'POSITIONS211212_SOURCE_CHANGED:'+file);
 const art211=installArt211Canonical190(h,plan.art211),p=plan.lifecycle212,before=h.readFullSnapshot();h.setPhase('lifecycle212-rehearsal');
 assert.equal(h.json([p.absence],{readOnly:true}).absent,true);const rehearsal=h.json(p.installation,{end:'ROLLBACK',fullJson:true});lifecycleProof(rehearsal,p);assert.deepEqual(h.readFullSnapshot(),before);assert.equal(h.json([p.absence],{readOnly:true}).absent,true);
 h.setPhase('lifecycle212-late-rollback');const token='QA_LIFECYCLE212_SAME190_LATE_FAULT',rejected=h.expectRollback([...p.installation.slice(0,-1),`DO $lifecycle212_late_fault$ BEGIN RAISE EXCEPTION '${token}';END $lifecycle212_late_fault$`,p.installation.at(-1)],token);assert.equal(rejected.status,3);assert.match(rejected.stderr,/\bERROR:[^\r\n]*\bQA_LIFECYCLE212_SAME190_LATE_FAULT\b/);assert.deepEqual(h.readFullSnapshot(),before);
 h.setPhase('lifecycle212-installation');const installed=h.json(p.installation,{fullJson:true});lifecycleProof(installed,p);
 h.setPhase('lifecycle212-durable-readonly');const durable=h.json(p.verification,{readOnly:true,fullJson:true});lifecycleProof(durable,p);assert.deepEqual(durable,installed);const committed=h.readFullSnapshot();
 h.setPhase('lifecycle212-repeat-rejection');const repeated=h.expectRollback(p.installation,'NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_ALREADY_INSTALLED');assert.equal(repeated.status,3);assert.match(repeated.stderr,/\bERROR:[^\r\n]*\bNATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_ALREADY_INSTALLED\b/);assert.deepEqual(h.readFullSnapshot(),committed);
 h.check('same190 admits ART211 after exact201 and lifecycle212 after exact110/136; source-derived metadata/ACL and all prior rows remain preserved');
 return Object.freeze({version:'positions211212-same190-installation.v1',passed:true,sourceCommit:h.sourceCommit,art211,lifecycle212:{rehearsal,installed,durable,repetitionRejected:true},newFunctions:2,newTables:0,businessRowsAdded:0,sourceHashes:plan.sourceHashes,synthetic:true,productionWrites:0,municipalAcceptance:false});
}

