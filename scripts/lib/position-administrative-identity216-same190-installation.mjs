// Private source proposal. No import, construction, test or SQL by its author.
// This is an optional successor of the exact existing positions210 plan.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPositionAdministrativeIdentity216Source,projectPositionAdministrativeIdentity216Pins,POSITION_ADMIN216_SQL_PATH,POSITION_ADMIN216_SQL_SHA256} from './position-administrative-identity216-source.mjs';
import {assertPositions210SourcePlan} from './positions210-same190-installation.mjs';
import {documentaryInstallationSnapshot} from './adopted-documentary-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';

const VERSION='position-administrative216-same190.v1';
const EPOCH='127-128-129/adopted-positions-v2/210/216';
const PREFIX='municontrol_position_admin216';
const PLANS=new WeakMap(),INSTALLATIONS=new WeakMap(),ATTEMPTS=new WeakSet();
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const lf=value=>String(value).replace(/\r\n?/g,'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const SHA=/^[a-f0-9]{64}$/;
const body=definition=>{const match=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(match,'POSITION_ADMIN216_BODY_REQUIRED');return match[2];};
const once=(value,before,after)=>{assert.equal(value.split(before).length,2,'POSITION_ADMIN216_SNAPSHOT_ANCHOR_CHANGED');return value.replace(before,()=>after);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const SOURCE_PINS=Object.freeze({
 'scripts/lib/position-administrative-identity216-source.mjs':'209033f6b504bffabe8ef089ee56b828287e5dd14e27e5726d2c259ac769b082',
 'scripts/lib/adopted-documentary-installation.mjs':'9d420e046e9debbef0e584aa47f965f495214bdb4fa6db5de4564edb917d707b',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/lib/positions210-same190-installation.mjs':'147ac6aed6c3f07d5ac5e045b8f608f36c1fd0e11a721e2d98662a1ae6373e86',
 [POSITION_ADMIN216_SQL_PATH]:POSITION_ADMIN216_SQL_SHA256
});
export const POSITION_ADMIN216_SAME190_ENTRIES=Object.freeze([
 'scripts/lib/position-administrative-identity216-same190-installation.mjs',
 'scripts/lib/position-administrative-identity216-source.mjs',POSITION_ADMIN216_SQL_PATH,
 'scripts/lib/adopted-documentary-installation.mjs','scripts/lib/native-leave-installation.mjs',
 'scripts/lib/positions210-same190-installation.mjs',
 'tests/position-administrative-identity216-same190.test.js'
]);

// Reuse the approved, exhaustive documentary audit but remove ALL documentary
// exceptions. Its three unrelated reader bodies are fully audited again.
// Only the seven named216 bodies are masked; every other pg_proc field of those
// seven, including OID, owner, ACL, config and signature, remains in the audit.
function snapshot(slot,source){
 let value=documentaryInstallationSnapshot(slot);
 const oldHelper='public.payroll_document_subject_v1(jsonb,uuid)';
 const oldSignatures=[
  'public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)',
  'public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid)'
 ];
 const ids=source.beforePins.map(pin=>'to_regprocedure('+q(pin.signature)+')').join(',');
 const oldIds=oldSignatures.map(signature=>'to_regprocedure('+q(signature)+')').join(',');
 value=once(value,'AND p.oid IS DISTINCT FROM to_regprocedure('+q(oldHelper)+')',
  'AND p.oid IS DISTINCT FROM to_regprocedure('+q(source.helperPin.signature)+')');
 value=once(value,`(CASE WHEN p.oid IN(${oldIds}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`,
  `(CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
 value=value.replaceAll('municontrol_documentary_install.',PREFIX+'.');
 assert.ok(!value.includes(oldHelper));
 for(const signature of oldSignatures)assert.ok(!value.includes(q(signature)),'POSITION_ADMIN216_OLD_BODY_EXCEPTION');
 assert.ok(!value.includes("proname LIKE 'native_leave_%'"));
 assert.ok(!value.includes("IS DISTINCT FROM to_regclass('public.native_leave_event')"));
 assert.equal(value.split("to_jsonb(p)-'prosrc'").length,2);
 return value;
}

function localNormalizer(predecessor,source){
 const records=[...source.afterDefinitions,source.helperDefinition];assert.equal(records.length,8);
 const extra=new Map();let stable=false;
 const replace=value=>extra.size?value.replace(new RegExp([...extra.keys()].join('|'),'g'),found=>extra.get(found)):value;
 const normalized=value=>predecessor.normalized(replace(value));
 for(let pass=0;pass<16;pass++){
  let changed=false;
  for(const definition of records){
   const from=hash(body(definition)),to=hash(body(normalized(definition)));
   if(extra.get(from)!==to){extra.set(from,to);changed=true;}
  }
  if(!changed){stable=true;break;}
 }
 assert.ok(stable,'POSITION_ADMIN216_LOCAL_HASHES_UNSTABLE');assert.equal(extra.size,8,'POSITION_ADMIN216_LOCAL_HASH_COUNT');
 const ledger=records.map((definition,index)=>({signature:index===7?source.helperPin.signature:source.afterPins[index].signature,
  publicSha256:hash(body(definition)),localSha256:hash(body(normalized(definition))),stage:index===7?'216-private-helper':'216-successor'}));
 for(const row of ledger)assert.equal(extra.get(row.publicSha256),row.localSha256,'POSITION_ADMIN216_LOCAL_LEDGER_CHANGED');
 assert.equal(new Set(ledger.map(row=>row.signature)).size,8);
 return {normalized,ledger};
}

function familyCheck(source,helperCount){
 assert.ok(helperCount===0||helperCount===1);
 return `DO $family216$ BEGIN
 ${source.beforePins.map(pin=>`IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${q(pin.name)})<>1 THEN RAISE EXCEPTION 'POSITION_ADMIN216_EXISTING_FUNCTION_FAMILY_CHANGED';END IF;`).join('\n ')}
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${q(source.helperPin.name)})<>${helperCount} THEN RAISE EXCEPTION 'POSITION_ADMIN216_HELPER_FAMILY_CHANGED';END IF;
 END $family216$`;
}

export function composePositionAdministrative216Same190({qa,major,sourceCommit,read,positions210Plan}){
 assert.ok(qa&&typeof read==='function');assert.ok(major===17||major===18);assert.equal(qa.major,major);assert.equal(qa.sourceCommit,sourceCommit);
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const p=positions210Plan;assert.equal(p?.version,'positions210-same190-source-plan.v1');
 assert.strictEqual(p.foundation,qa);assert.equal(p.schema,qa.schema);assert.equal(p.major,major);assert.equal(p.sourceCommit,sourceCommit);
 // The existing brand check occurs without any host transport call.
 assert.strictEqual(assertPositions210SourcePlan({qa,major,sourceCommit,sourceCustody:{sourceCommit},prepared:{positions210:p}},p),p);
 assert.deepEqual(p.stages.map(stage=>stage.id),['127','128','129','adopted-v2','210']);assert.equal(p.ledger.length,33);
 const beforeHashes=structuredClone(qa.hashes),sourceHashes={};
 for(const [file,expected]of Object.entries(SOURCE_PINS)){const actual=hash(lf(read(file)));assert.equal(actual,expected,'POSITION_ADMIN216_INPUT_SOURCE_CHANGED:'+file);sourceHashes[file]=actual;}
 const source=buildPositionAdministrativeIdentity216Source({read,sourceCommit});
 assert.equal(source.predecessorEpoch,'127-128-129/adopted-positions-v2/210');assert.equal(source.beforePins.length,7);assert.equal(source.afterPins.length,7);
 Object.assign(sourceHashes,source.sourceHashes);
 for(const file of POSITION_ADMIN216_SAME190_ENTRIES)sourceHashes[file]=hash(lf(read(file)));
 const finalStage=p.stages.at(-1);assert.equal(finalStage.id,'210');
 // These are PUBLIC source-minted pins, not p.finalMetadata (already localized)
 // and not a pg_proc observation used as an expected definition.
 const beforeFinalPins=[...finalStage.batch.prerequisitePins,...finalStage.batch.ownPins];assert.equal(beforeFinalPins.length,34);
 const afterFinalPins=projectPositionAdministrativeIdentity216Pins(source,beforeFinalPins,'210-final');
 assert.equal(afterFinalPins.filter((pin,index)=>pin.sha256!==beforeFinalPins[index].sha256).length,7);
 const {normalized,ledger}=localNormalizer(p,source);
 const finalMetadata=[normalized(pinsCheck(afterFinalPins,'POSITION_ADMIN216_FINAL34_CHANGED')),
  normalized(pinsCheck([source.helperPin],'POSITION_ADMIN216_PRIVATE_HELPER_CHANGED'))];
 const beforeCheck=pinsCheck(beforeFinalPins,'POSITION_ADMIN216_BEFORE34_CHANGED');
 const afterCheck=pinsCheck([...afterFinalPins,source.helperPin],'POSITION_ADMIN216_AFTER35_CHANGED');
 const environment=readOnly=>`DO $environment216$ BEGIN
 IF current_setting('server_version_num')::integer/10000<>${major} OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} THEN RAISE EXCEPTION 'POSITION_ADMIN216_TRANSACTION_DESTINATION_CHANGED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=${q(qa.schema)} AND nspowner=current_user::regrole) THEN RAISE EXCEPTION 'POSITION_ADMIN216_SCHEMA_OWNER_CHANGED';END IF;
 IF NOT pg_try_advisory_xact_lock(216) THEN RAISE EXCEPTION 'POSITION_ADMIN216_BUSY';END IF;
 END $environment216$`;
 const before=snapshot('before',source),after=snapshot('after',source);
 const audit=`DO $audit216$ BEGIN IF current_setting('${PREFIX}.before')::jsonb IS DISTINCT FROM current_setting('${PREFIX}.after')::jsonb THEN RAISE EXCEPTION 'POSITION_ADMIN216_PRIOR_STATE_CHANGED';END IF;END $audit216$`;
 const apply=`DO $apply216$ BEGIN\n${source.migration.map(statement=>' EXECUTE '+q(statement)+';').join('\n')}\nEND $apply216$`;
 const ids=source.beforePins.map(pin=>'to_regprocedure('+q(pin.signature)+')').join(',');
 const oldMetadataFingerprint=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids}))`;
 const objectsFingerprint=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids},to_regprocedure(${q(source.helperPin.signature)})))`;
 const fingerprint=slot=>`encode(public.digest(current_setting('${PREFIX}.${slot}')::jsonb::text,'sha256'),'hex')`;
 const proofContract=Object.freeze({version:VERSION,sourceCommit,schema:qa.schema,major,epoch:EPOCH,
  newTables:0,newFunctions:1,adaptedFunctions:7,newRuntimeFacades:0,existingAclChanges:0,roleAssignmentsAdded:0,associationWrites:0,businessOperations:0,nominalRowsReturned:0,finalMetadataPins:34,helperRuntime:false,sourceSqlSha256:POSITION_ADMIN216_SQL_SHA256});
 const proof=(mode,includeBefore)=>`SELECT ${q(JSON.stringify(proofContract))}::jsonb||jsonb_build_object('mode',${q(mode)},'readOnly',current_setting('transaction_read_only')='on','beforeFingerprint',${fingerprint(includeBefore?'before':'after')},'priorFingerprint',${fingerprint('after')},'objectsFingerprint',${objectsFingerprint},'oldSevenMetadataFingerprint',${oldMetadataFingerprint}) AS proof`;
 const installation=[environment(false),beforeCheck,familyCheck(source,0),before,apply,afterCheck,familyCheck(source,1),after,audit,proof('install',true)].map(normalized);
 // Verify repetition has no CREATE, REPLACE, GRANT, REVOKE or business write.
 const repetition=[environment(false),afterCheck,familyCheck(source,1),before,after,audit,proof('repeat',true)].map(normalized);
 const durableVerification=[environment(true),afterCheck,familyCheck(source,1),after,proof('durable',false)].map(normalized);
 assert.deepEqual(qa.hashes,beforeHashes,'POSITION_ADMIN216_FOUNDATION_HASHES_MUTATED');
 const sourceEntries=[...new Set([...p.sourceEntries,...Object.keys(sourceHashes),...POSITION_ADMIN216_SAME190_ENTRIES])];
 const plan=Object.freeze({version:VERSION,foundation:qa,schema:qa.schema,major,sourceCommit,epoch:EPOCH,source,
  predecessor:p,beforeFinalPins:freeze(beforeFinalPins.map(pin=>structuredClone(pin))),afterFinalPins,
  ledger:freeze(ledger),sourceHashes:Object.freeze(sourceHashes),sourceEntries:Object.freeze(sourceEntries),normalized,
  installation:Object.freeze(installation),repetition:Object.freeze(repetition),durableVerification:Object.freeze(durableVerification),
  finalMetadata:Object.freeze(finalMetadata),proofContract,connects:false,executesSql:false,production:false});
 PLANS.set(plan,{qa,read,positions210Plan:p,sourceHashes:plan.sourceHashes});return plan;
}

export function assertPositionAdministrative216Same190Plan(h,plan=h.prepared?.positionAdministrative216){
 const record=PLANS.get(plan);assert.ok(record,'POSITION_ADMIN216_UNMINTED_PLAN');
 assert.strictEqual(h.prepared?.positionAdministrative216,plan,'POSITION_ADMIN216_HOST_PLAN_CHANGED');
 assert.strictEqual(h.qa,record.qa);assert.equal(h.major,plan.major);assert.equal(h.sourceCommit,plan.sourceCommit);
 assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit,'POSITION_ADMIN216_HOST_CUSTODY_REQUIRED');
 assert.strictEqual(assertPositions210SourcePlan(h,record.positions210Plan),record.positions210Plan);
 for(const [file,expected]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),expected,'POSITION_ADMIN216_SOURCE_BOOKEND:'+file);
 return plan;
}

export function assertPositionAdministrative216Proof(value,plan,mode){
 assert.ok(PLANS.has(plan),'POSITION_ADMIN216_UNMINTED_PLAN');assert.ok(['install','durable','repeat'].includes(mode));
 const fixed=plan.proofContract,extra=['mode','readOnly','beforeFingerprint','priorFingerprint','objectsFingerprint','oldSevenMetadataFingerprint'];
 assert.deepEqual(Object.keys(value).sort(),[...Object.keys(fixed),...extra].sort(),'POSITION_ADMIN216_PROOF_FIELDS');
 for(const [key,expected]of Object.entries(fixed))assert.deepEqual(value[key],expected,'POSITION_ADMIN216_PROOF:'+key);
 assert.equal(value.mode,mode);assert.equal(value.readOnly,mode==='durable');
 for(const key of extra.filter(key=>key.endsWith('Fingerprint')))assert.match(value[key],SHA,'POSITION_ADMIN216_PROOF:'+key);
 assert.equal(value.beforeFingerprint,value.priorFingerprint,'POSITION_ADMIN216_PRESERVATION_PROOF');return value;
}

export function assertPositionAdministrative216Durability({plan,installed,durable,repeated}){
 assertPositionAdministrative216Proof(installed,plan,'install');assertPositionAdministrative216Proof(durable,plan,'durable');assertPositionAdministrative216Proof(repeated,plan,'repeat');
 for(const key of ['priorFingerprint','objectsFingerprint','oldSevenMetadataFingerprint']){
  assert.equal(installed[key],durable[key],'POSITION_ADMIN216_DURABILITY:'+key);
  assert.equal(installed[key],repeated[key],'POSITION_ADMIN216_REPETITION:'+key);
 }
 return Object.freeze({passed:true,oldSevenOidOwnerAclMetadataPreserved:true,allOtherStatePreserved:true,newHelperPrivate:true,independentDurabilityVerified:true,repeatHasDdl:false,nominalRowsReturned:0});
}

export function installPositionAdministrative216Same190(h,{positions210Installation}={}){
 const plan=assertPositionAdministrative216Same190Plan(h);
 assert.equal(positions210Installation?.version,'positions210-same190-installation.v1');assert.equal(positions210Installation.passed,true);
 assert.equal(positions210Installation.sourceCommit,h.sourceCommit);assert.equal(positions210Installation.schema,h.qa.schema);
 assert.equal(positions210Installation.finalMetadata?.version,'positions210-final-metadata.v1');assert.equal(positions210Installation.finalMetadata.metadataPins,34);
 assert.deepEqual(positions210Installation.sourceHashes,plan.predecessor.sourceHashes);
 assert.ok(!ATTEMPTS.has(plan),'POSITION_ADMIN216_ALREADY_EXECUTED_FRESH_REVIEW_REQUIRED');
 for(const name of ['json','readFullSnapshot','setPhase','check'])assert.equal(typeof h[name],'function');
 ATTEMPTS.add(plan);
 // No retry, catch cleanup, or alternative transport. The real host latches an
 // uncertain native outcome. Every later call is unreachable after an error.
 const baseline=h.readFullSnapshot();h.setPhase('position-administrative216-rehearsal');
 const rehearsal=h.json(plan.installation,{end:'ROLLBACK',fullJson:true});assertPositionAdministrative216Proof(rehearsal,plan,'install');
 assert.deepEqual(h.readFullSnapshot(),baseline,'POSITION_ADMIN216_REHEARSAL_CHANGED_STATE');
 h.setPhase('position-administrative216-installation');const installed=h.json(plan.installation,{fullJson:true});assertPositionAdministrative216Proof(installed,plan,'install');
 h.setPhase('position-administrative216-durable-readonly');const durable=h.json(plan.durableVerification,{readOnly:true,fullJson:true});assertPositionAdministrative216Proof(durable,plan,'durable');
 for(const key of ['priorFingerprint','objectsFingerprint','oldSevenMetadataFingerprint'])assert.equal(installed[key],durable[key],'POSITION_ADMIN216_IMMEDIATE_DURABILITY:'+key);
 const afterInstall=h.readFullSnapshot();h.setPhase('position-administrative216-exact-verification-repeat');
 const repeated=h.json(plan.repetition,{fullJson:true});assert.deepEqual(h.readFullSnapshot(),afterInstall,'POSITION_ADMIN216_REPEAT_CHANGED_STATE');
 const durability=assertPositionAdministrative216Durability({plan,installed,durable,repeated});
 h.check('same190 administrative216 preserves the seven function identities and ACLs, every other row/security object, and exact34 successor metadata; private helper only');
 const admission=Object.freeze({version:VERSION,passed:true,sourceCommit:h.sourceCommit,schema:h.qa.schema,epoch:EPOCH,rehearsal,installed,durable,repeated,durability,
  newTables:0,newFunctions:1,adaptedFunctions:7,newRuntimeFacades:0,roleAssignmentsAdded:0,businessOperations:0,administrativeNoEmploymentBrowserProven:false,synthetic:true,productionWrites:0,municipalAcceptance:false});
 INSTALLATIONS.set(plan,{h,admission});return admission;
}

// Later code must never reuse the historical210 finalMetadata array after216.
// It consumes this branded successor and also checks the helper's private ACL.
export function verifyPositionAdministrative216Epoch(h,admission){
 const plan=assertPositionAdministrative216Same190Plan(h),record=INSTALLATIONS.get(plan);
 assert.ok(record&&record.h===h&&record.admission===admission,'POSITION_ADMIN216_INSTALLATION_ADMISSION_REQUIRED');
 h.setPhase('position-administrative216-successor-metadata-readonly');
 const proof=h.json(plan.durableVerification,{readOnly:true,fullJson:true});assertPositionAdministrative216Proof(proof,plan,'durable');
 assert.equal(proof.objectsFingerprint,admission.durable.objectsFingerprint,'POSITION_ADMIN216_OBJECT_EPOCH_CHANGED');
 // Business rows may legitimately have changed since installation; this is a
 // function/security epoch check, not equality against an obsolete data epoch.
 return Object.freeze({version:'position-administrative216-epoch.v1',passed:true,epoch:EPOCH,metadataPins:34,helperPrivate:true,objectsFingerprint:proof.objectsFingerprint});
}
