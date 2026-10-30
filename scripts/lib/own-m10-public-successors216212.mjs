// Public schema successors only. Proposed source, no connection/execution.
import assert from 'node:assert/strict';
import {buildPositionAdministrativeIdentity216Source,projectPositionAdministrativeIdentity216Pins,POSITION_ADMIN216_SQL_SHA256} from './position-administrative-identity216-source.mjs';
import {documentaryInstallationSnapshot} from './adopted-documentary-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';
import {assertM10PublicSourceFactors,q,hash,lf} from './own-m10-public-source-factors.mjs';
const SCHEMA='public',PREFIX='municontrol_position_admin216',EPOCH='127-128-129/adopted-positions-v2/210/216',SHA=/^[a-f0-9]{64}$/;
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'M10_PUBLIC_SINGLE_ANCHOR');return s.replace(a,()=>b);};
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const body=s=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m);return m[2];};
const minted=new WeakMap();
export function m10PublicTarget(target){const actual=OWN_RELEASE_TARGETS.find(t=>t.major===target?.major);assert.ok(actual,'M10_PUBLIC_TARGET_REQUIRED');assert.deepEqual(target,actual,'M10_PUBLIC_FOREIGN_TARGET');return actual;}
export function m10PublicWrap(target,statements,readOnly){target=m10PublicTarget(target);return Object.freeze([...(readOnly?['SET TRANSACTION READ ONLY']:[]),...ownInstallationSettings,ownInstallationDestination(target),...statements]);}
const namespaceControl="(n.nspowner=current_user::regrole OR(n.nspowner='pg_database_owner'::regrole AND (SELECT datdba FROM pg_database WHERE datname=current_database())=current_user::regrole))";
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

function familyCheck(source,helperCount){
 assert.ok(helperCount===0||helperCount===1);
 return `DO $family216$ BEGIN
 ${source.beforePins.map(pin=>`IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${q(pin.name)})<>1 THEN RAISE EXCEPTION 'POSITION_ADMIN216_EXISTING_FUNCTION_FAMILY_CHANGED';END IF;`).join('\n ')}
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${q(source.helperPin.name)})<>${helperCount} THEN RAISE EXCEPTION 'POSITION_ADMIN216_HELPER_FAMILY_CHANGED';END IF;
 END $family216$`;
}


export function composeM10Public216({factors,target,read}){
 assertM10PublicSourceFactors(factors);target=m10PublicTarget(target);const {sourceCommit}=factors,major=target.major;
 const source=buildPositionAdministrativeIdentity216Source({read,sourceCommit}),beforeFinalPins=factors.final210Pins;assert.equal(beforeFinalPins.length,34);
 const afterFinalPins=projectPositionAdministrativeIdentity216Pins(source,beforeFinalPins,'210-final');assert.equal(afterFinalPins.filter((v,i)=>v.sha256!==beforeFinalPins[i].sha256).length,7);
 const beforeCheck=pinsCheck(beforeFinalPins,'POSITION_ADMIN216_BEFORE34_CHANGED'),afterCheck=pinsCheck([...afterFinalPins,source.helperPin],'POSITION_ADMIN216_AFTER35_CHANGED');
 const environment=readOnly=>`DO $environment216$ BEGIN IF current_setting('server_version_num')::integer/10000<>${major} OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} THEN RAISE EXCEPTION 'POSITION_ADMIN216_TRANSACTION_DESTINATION_CHANGED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND ${namespaceControl}) THEN RAISE EXCEPTION 'POSITION_ADMIN216_SCHEMA_OWNER_CHANGED';END IF;
 IF NOT pg_try_advisory_xact_lock(216) THEN RAISE EXCEPTION 'POSITION_ADMIN216_BUSY';END IF;END $environment216$`;
 const before=snapshot('before',source),after=snapshot('after',source);
 const audit=`DO $audit216$ BEGIN IF current_setting('${PREFIX}.before')::jsonb IS DISTINCT FROM current_setting('${PREFIX}.after')::jsonb THEN RAISE EXCEPTION 'POSITION_ADMIN216_PRIOR_STATE_CHANGED';END IF;END $audit216$`;
 const apply=`DO $apply216$ BEGIN\n${source.migration.map(statement=>' EXECUTE '+q(statement)+';').join('\n')}\nEND $apply216$`;
 const ids=source.beforePins.map(pin=>'to_regprocedure('+q(pin.signature)+')').join(',');
 const oldMetadataFingerprint=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids}))`;
 const objectsFingerprint=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids},to_regprocedure(${q(source.helperPin.signature)})))`;
 const fingerprint=slot=>`encode(public.digest(current_setting('${PREFIX}.${slot}')::jsonb::text,'sha256'),'hex')`;
 const sourceHashes={...factors.sourceHashes,...source.sourceHashes},proofContract={version:'position-administrative216-public-installation.v1',sourceCommit,schema:SCHEMA,major,epoch:EPOCH,sourceHashes,
  newTables:0,newFunctions:1,adaptedFunctions:7,newRuntimeFacades:0,existingAclChanges:0,roleAssignmentsAdded:0,associationWrites:0,businessOperations:0,nominalRowsReturned:0,finalMetadataPins:34,helperRuntime:false,sourceSqlSha256:POSITION_ADMIN216_SQL_SHA256};
 const proof=(mode,includeBefore)=>`SELECT ${q(JSON.stringify(proofContract))}::jsonb||jsonb_build_object('mode',${q(mode)},'readOnly',current_setting('transaction_read_only')='on','beforeFingerprint',${fingerprint(includeBefore?'before':'after')},'priorFingerprint',${fingerprint('after')},'objectsFingerprint',${objectsFingerprint},'oldSevenMetadataFingerprint',${oldMetadataFingerprint}) AS proof`;
 const core=[environment(false),beforeCheck,familyCheck(source,0),before,apply,afterCheck,familyCheck(source,1),after,audit,proof('install',true)];
 const verify=[environment(true),afterCheck,familyCheck(source,1),after,proof('durable',false)],repeat=[environment(false),afterCheck,familyCheck(source,1),before,after,audit,proof('repeat',true)];
 const fault="DO $m10_public216_abort$ BEGIN RAISE EXCEPTION 'M10_PUBLIC216_REHEARSAL_ROLLBACK_REQUIRED';END $m10_public216_abort$";
 const plan=Object.freeze({version:'m10-public216-source.v1',sourceCommit,target,source,sourceHashes,beforeFinalPins,afterFinalPins,proofContract,
  preflight:m10PublicWrap(target,[environment(true),beforeCheck,familyCheck(source,0)],true),installation:m10PublicWrap(target,core,false),rehearsal:m10PublicWrap(target,[...core,fault],false),rehearsalExpectedError:'M10_PUBLIC216_REHEARSAL_ROLLBACK_REQUIRED',durableVerification:m10PublicWrap(target,verify,true),repetition:m10PublicWrap(target,repeat,false),functionBookend:[afterCheck,familyCheck(source,1)],connects:false,executesSql:false});
 minted.set(plan,{factors});return plan;
}
export function assertM10Public216Proof({plan,value,mode}){
 assert.ok(minted.has(plan),'M10_PUBLIC216_UNMINTED_PLAN');assert.ok(['install','durable','repeat'].includes(mode));
 const extra=['mode','readOnly','beforeFingerprint','priorFingerprint','objectsFingerprint','oldSevenMetadataFingerprint'];assert.deepEqual(Object.keys(value).sort(),[...Object.keys(plan.proofContract),...extra].sort());
 for(const[k,v]of Object.entries(plan.proofContract))assert.deepEqual(value[k],v);assert.equal(value.mode,mode);assert.equal(value.readOnly,mode==='durable');
 for(const k of extra.filter(k=>k.endsWith('Fingerprint')))assert.match(value[k],SHA);assert.equal(value.beforeFingerprint,value.priorFingerprint,'M10_PUBLIC216_STATE_NOT_PRESERVED');return value;
}
export function assertM10Public216Durability({plan,installed,durable,repeated}){
 for(const[value,mode]of[[installed,'install'],[durable,'durable'],[repeated,'repeat']])assertM10Public216Proof({plan,value,mode});
 for(const k of ['priorFingerprint','objectsFingerprint','oldSevenMetadataFingerprint']){assert.equal(installed[k],durable[k]);assert.equal(installed[k],repeated[k]);}
 return {passed:true,sevenExistingMetadataPreserved:true,independentDurabilityVerified:true,sourceCommit:plan.sourceCommit,businessOperations:0};
}
const SQL212='scripts/migrations/212-native-employment-lifecycle-history.sql';
const LIFECYCLE212_SOURCE_PINS=Object.freeze({
 [SQL212]:'99a85e8c9175e8272cc520f5c443c5a1ffd8a52ed3e81746c2b7e57b2d95ad9d',
 'scripts/migrations/110-native-employment-lifecycle.sql':'e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219',
 'scripts/migrations/136-adopted-employment-lifecycle.sql':'577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a'
});
function lifecycle212({graph,major,sourceCommit,read}){
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

 const predecessors=wanted.map(([file,name,runtime])=>{const definition=get(texts[file],name),pin={...ownInstallationFunctionPin(definition),runtime};
  const emitted=graph.definitions.filter(value=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(clean(value)));assert.equal(emitted.length,1,'LIFECYCLE212_CANONICAL_DEFINITION:'+name);
  assert.deepEqual({...ownInstallationFunctionPin(emitted[0]),runtime},pin,'LIFECYCLE212_CANONICAL_PREDECESSOR_CHANGED:'+name);return {definition,pin};});
 assert.deepEqual(predecessors.map(row=>row.pin.signature),['public.native_employment_lifecycle_bootstrap_v2(jsonb,uuid)','public.native_employment_lifecycle_adopted_context_v2(jsonb,text)','public.native_employment_lifecycle_scope_v1(jsonb,jsonb)','public.native_employment_lifecycle_summary_v1(jsonb,public.native_employment_lifecycle_proposal)']);
 const definition=migration[1],ownPin={...ownInstallationFunctionPin(definition),runtime:true};assert.equal(ownPin.signature,'public.native_employment_lifecycle_history_v2(jsonb,uuid)');

 const prerequisitePins=predecessors.map(row=>row.pin),localOwn=ownPin,newSignature=ownPin.signature;
 const beforeCheck=pinsCheck(prerequisitePins,'LIFECYCLE212_PREREQUISITE_CHANGED'),ownCheck=pinsCheck([localOwn],'LIFECYCLE212_NEW_FUNCTION_CHANGED');
 const prefix='municontrol_lifecycle212.';
 const snapshot=slot=>{let value=preservationSnapshot(slot),anchor="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(value.split(anchor).length,3);value=value.replaceAll(anchor,'true');value=once(value,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","p.oid IS DISTINCT FROM to_regprocedure("+q(ownPin.signature)+")");return value.replaceAll('municontrol_sql111.',prefix);};
 const environment=readOnly=>`DO $lifecycle212_owner$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('server_version_num')::integer/10000<>${major} OR NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.oid='public'::regnamespace AND (n.nspowner=current_user::regrole OR(n.nspowner='pg_database_owner'::regrole AND (SELECT datdba FROM pg_database WHERE datname=current_database())=current_user::regrole))) THEN RAISE EXCEPTION 'LIFECYCLE212_OWNER_TRANSACTION_REQUIRED';END IF;END $lifecycle212_owner$`;
 const table=`DO $lifecycle212_table$ BEGIN IF to_regclass(${q('public.native_employment_lifecycle_proposal')}) IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_PREREQUISITE_MISSING';END IF;END $lifecycle212_table$`;
 const guard=migration[0],before=snapshot('before'),after=snapshot('after'),checkFamily=`DO $lifecycle212_exact_family$ BEGIN IF(SELECT count(*) FROM pg_proc p WHERE p.pronamespace=${q('public')}::regnamespace AND p.proname='native_employment_lifecycle_history_v2')<>1 THEN RAISE EXCEPTION 'LIFECYCLE212_NEW_FUNCTION_FAMILY_CHANGED';END IF;END $lifecycle212_exact_family$`;
 const compare=`DO $lifecycle212_conserved$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'LIFECYCLE212_PRIOR_STATE_CHANGED';END IF;END $lifecycle212_conserved$`;
 const proof=`SELECT jsonb_build_object('version','lifecycle212-public-installation.v1','sourceCommit',${q(sourceCommit)},'schema',${q('public')},'sourceHashes',${q(JSON.stringify(LIFECYCLE212_SOURCE_PINS))}::jsonb,'predecessorPins',4,'newFunctions',1,'newTables',0,'newCapabilities',0,'newRoles',0,'adaptedFunctions',0,'businessRowsAdded',0,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(newSignature)}))) AS proof`;
 return Object.freeze({version:'lifecycle212-public-source.v1',schema:'public',major,sourceCommit,sourceHashes:LIFECYCLE212_SOURCE_PINS,prerequisitePins,ownPin:localOwn,predecessors,
  installation:Object.freeze([environment(false),guard,beforeCheck,before,...migration.slice(1),beforeCheck,ownCheck,checkFamily,after,compare,proof]),
  verification:Object.freeze([environment(true),table,beforeCheck,ownCheck,checkFamily,after,proof]),
  absence:"SELECT jsonb_build_object('absent',to_regprocedure("+q(newSignature)+") IS NULL)",connects:false,executesSql:false});
}

export function composeM10Public212({factors,target,read}){
 assertM10PublicSourceFactors(factors);target=m10PublicTarget(target);const raw=lifecycle212({graph:factors.graph,major:target.major,sourceCommit:factors.sourceCommit,read});
 const fault="DO $m10_public212_abort$ BEGIN RAISE EXCEPTION 'M10_PUBLIC212_REHEARSAL_ROLLBACK_REQUIRED';END $m10_public212_abort$";
 const plan=Object.freeze({...raw,target,preflight:m10PublicWrap(target,[raw.verification[0],raw.installation[1],raw.installation[2]],true),installation:m10PublicWrap(target,raw.installation,false),rehearsal:m10PublicWrap(target,[...raw.installation,fault],false),rehearsalExpectedError:'M10_PUBLIC212_REHEARSAL_ROLLBACK_REQUIRED',durableVerification:m10PublicWrap(target,raw.verification,true),repetition:m10PublicWrap(target,raw.verification,true)});
 minted.set(plan,{factors});return plan;
}
export function assertM10Public212Durability({plan,installed,durable,repeated}){
 assert.ok(minted.has(plan),'M10_PUBLIC212_UNMINTED_PLAN');
 const keys=['version','sourceCommit','schema','sourceHashes','predecessorPins','newFunctions','newTables','newCapabilities','newRoles','adaptedFunctions','businessRowsAdded','priorStatePreserved','priorFingerprint','objectFingerprint'];
 for(const value of[installed,durable,repeated]){assert.deepEqual(Object.keys(value).sort(),keys.sort());assert.equal(value.version,'lifecycle212-public-installation.v1');assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.schema,'public');assert.deepEqual(value.sourceHashes,plan.sourceHashes);for(const[k,v]of Object.entries({predecessorPins:4,newFunctions:1,newTables:0,newCapabilities:0,newRoles:0,adaptedFunctions:0,businessRowsAdded:0,priorStatePreserved:true}))assert.equal(value[k],v);for(const k of ['priorFingerprint','objectFingerprint'])assert.match(value[k],SHA);}
 assert.deepEqual(installed,durable);assert.deepEqual(installed,repeated);return {passed:true,sourceCommit:plan.sourceCommit,businessOperations:0};
}
