// Source-only finite proposal. No top-level preparation, I/O or SQL execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {deriveOwnLiquidationBootstrap213,OWN_LIQUIDATION_BOOTSTRAP213_SQL,OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS} from './own-liquidation-bootstrap213-installation.mjs';
import {deriveOwnCloseSnapshot214,OWN_CLOSE_SNAPSHOT214_SQL,OWN_CLOSE_SNAPSHOT214_SOURCE_PINS} from './own-close-snapshot214-installation.mjs';
import {deriveOwnCloseSnapshot215,OWN_CLOSE_SNAPSHOT215_SQL,OWN_CLOSE_SNAPSHOT215_SOURCE_PINS} from './own-close-snapshot215-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';
export {assertOwnLiquidationBootstrap213Proof} from './own-liquidation-bootstrap213-installation.mjs';
export {assertOwnCloseSnapshot214Proof} from './own-close-snapshot214-installation.mjs';
export {assertOwnCloseSnapshot215Proof} from './own-close-snapshot215-installation.mjs';

// Existing Git66 files are unchanged. These are source pins, not live catalogue
// expectations. The new module itself is pinned by its future caller, not itself.
export const M7_PUBLIC213215_SUPPORT_SOURCE_PINS=Object.freeze({
 'scripts/lib/own-liquidation-bootstrap213-installation.mjs':'a4fbd75427be61efa24eaa1b78f10897d8706ad1619850cc7e9b496c4e45c9f5',
 'scripts/lib/own-close-snapshot214-installation.mjs':'7a5a4c91ebb66b2502b22a7364fee0b5b6e161695b3c2c64979fdefd504b6506',
 'scripts/lib/own-close-snapshot215-installation.mjs':'288ae8f754dc4b470af2b9751f78c5fbf4936d2e61d462e5957d8b1c0bdfbd9c',
 'scripts/prepare-own-payroll-installation.mjs':'8984ec722bf2928ec2e177e6e3bf4f21b4a95f182452bdaa5e29a6f1ea8854e7',
 'scripts/lib/own-payroll-release-target.mjs':'85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448'
});
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const lf=v=>{assert.equal(typeof v,'string');return v.replace(/\r\n?/g,'\n');};
const clean=v=>v.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PUBLIC213215_SOURCE_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const one=(s,name)=>{const rows=splitPostgresStatements(s).map(clean).filter(v=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(v));assert.equal(rows.length,1,'PUBLIC213215_UNIQUE_FUNCTION:'+name);return rows[0];};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const minted=new WeakMap();
function load(major,sourceCommit,read,pins){
 assert.ok([17,18].includes(major),'PUBLIC213215_MAJOR_REQUIRED');assert.match(sourceCommit??'',/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 const sourceHashes={...pins};for(const[f,h]of Object.entries(M7_PUBLIC213215_SUPPORT_SOURCE_PINS)){if(Object.hasOwn(sourceHashes,f))assert.equal(sourceHashes[f],h,'PUBLIC213215_SOURCE_PIN_CONFLICT:'+f);sourceHashes[f]=h;}
 const texts={};for(const[f,h]of Object.entries(sourceHashes)){texts[f]=lf(read(f));assert.equal(hash(texts[f]),h,'PUBLIC213215_SOURCE_CHANGED:'+f);}
 return{texts,sourceHashes,read};
}
function record(stage,major,sourceCommit,loaded,original,changed,prerequisites,runtime){
 const rawBefore={...ownInstallationFunctionPin(original),runtime},rawAfter={...ownInstallationFunctionPin(changed),runtime};
 assert.deepEqual({...rawBefore,sha256:null},{...rawAfter,sha256:null},'PUBLIC213215_FUNCTION_METADATA_CHANGED');
 const value=freeze({stage,major,sourceCommit,schema:'public',original,changed,rawBefore,rawAfter,prerequisites,sourceHashes:loaded.sourceHashes,connects:false,executesSql:false});
 minted.set(value,loaded);return value;
}
export function composeOwnLiquidationBootstrap213Raw({major,sourceCommit,read}){
 const loaded=load(major,sourceCommit,read,OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS),{texts}=loaded;
 const source124=texts['scripts/migrations/124-own-payroll-liquidation-decisions.sql'];
 const original=one(source124,'own_liquidation_bootstrap_v1'),changed=deriveOwnLiquidationBootstrap213(original);
 assert.deepEqual(splitPostgresStatements(texts[OWN_LIQUIDATION_BOOTSTRAP213_SQL]).map(clean),[changed],'LIQ_BOOT213_UNREVIEWED_FORWARD_DEFINITION');
 const prerequisites=[
  {...ownInstallationFunctionPin(one(source124,'own_liquidation_context_v1')),runtime:false},
  {...ownInstallationFunctionPin(one(texts['scripts/migrations/176-own-payroll-administrative-operator.sql'],'own_run_context_v1')),runtime:false},
  {...ownInstallationFunctionPin(SALARY_ADMINISTRATIVE_CONTEXT),runtime:false}
 ];
 assert.equal(prerequisites[2].sha256,'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
 return record(213,major,sourceCommit,loaded,original,changed,prerequisites,true);
}
export function composeOwnCloseSnapshot214Raw({major,sourceCommit,read}){
 const loaded=load(major,sourceCommit,read,OWN_CLOSE_SNAPSHOT214_SOURCE_PINS),{texts}=loaded;
 const namespace=buildSalaryAuxiliaryNamespaceSql({read:f=>{assert.ok(Object.hasOwn(texts,f),'CLOSE_SNAPSHOT214_UNPINNED_SOURCE:'+f);return texts[f];},sourceCommit});
 const originals=namespace.changed.filter(v=>v.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('));assert.equal(originals.length,1,'CLOSE_SNAPSHOT214_UNIQUE_PREDECESSOR');
 const original=originals[0],changed=deriveOwnCloseSnapshot214(original);
 assert.deepEqual(splitPostgresStatements(texts[OWN_CLOSE_SNAPSHOT214_SQL]).map(clean),[changed],'CLOSE_SNAPSHOT214_UNREVIEWED_FORWARD_DEFINITION');
 const core=one(texts['scripts/migrations/201-own-full-payroll-decision-capacity.sql'],'own_close_command_capacity_core_v2');
 return record(214,major,sourceCommit,loaded,original,changed,[{...ownInstallationFunctionPin(core),runtime:false}],false);
}
export function composeOwnCloseSnapshot215Raw({major,sourceCommit,read}){
 const loaded=load(major,sourceCommit,read,OWN_CLOSE_SNAPSHOT215_SOURCE_PINS),{texts}=loaded;
 const previous=composeOwnCloseSnapshot214Raw({major,sourceCommit,read:f=>{assert.ok(Object.hasOwn(texts,f),'CLOSE_SNAPSHOT215_UNPINNED_SOURCE:'+f);return texts[f];}});
 const original=previous.changed,changed=deriveOwnCloseSnapshot215(original);
 assert.deepEqual(splitPostgresStatements(texts[OWN_CLOSE_SNAPSHOT215_SQL]).map(clean),[changed],'CLOSE_SNAPSHOT215_UNREVIEWED_FORWARD_DEFINITION');
 const core=one(texts['scripts/migrations/201-own-full-payroll-decision-capacity.sql'],'own_close_command_capacity_core_v2');
 return record(215,major,sourceCommit,loaded,original,changed,[{...ownInstallationFunctionPin(core),runtime:false}],false);
}
function destination(target){
 const expected=OWN_RELEASE_TARGETS.find(v=>v.major===target?.major);assert.ok(expected,'PUBLIC213215_TARGET_REQUIRED');
 assert.deepEqual(target,expected,'PUBLIC213215_EXACT_EXISTING_TARGET_REQUIRED');return expected;
}
// Same transparent preservationSnapshot derivation as the three QA builders:
// restore SQL111's unrelated exclusions, then exclude ONLY the exact target prosrc.
function snapshot(slot,signature,prefix){
 let value=preservationSnapshot(slot);const excluded="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(value.split(excluded).length,3);value=value.replaceAll(excluded,'true');
 value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND true');
 value=once(value,"public.digest(to_jsonb(p)::text,'sha256')",`public.digest((CASE WHEN p.oid=to_regprocedure(${q(signature)}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
 return value.replaceAll('municontrol_sql111.',prefix);
}
// Finite renderer: only source-minted raw213/214/215 from the three factories.
// No arbitrary statement, normalizer, schema, target, actor or authority callback.
function publicPlan(raw,target){
 const source=minted.get(raw);assert.ok(source,'PUBLIC213215_UNMINTED_RAW');assert.equal(raw.major,target.major);
 const id=raw.stage;assert.ok([213,214,215].includes(id));
 const bootstrap=id===213,tag=bootstrap?'liq_boot213':'close_snapshot'+id;
 const code=bootstrap?'LIQ_BOOT213':'CLOSE_SNAPSHOT'+id,prefix=bootstrap?'municontrol_liq_bootstrap213.':'municontrol_close_snapshot'+id+'.';
 const version=bootstrap?'own-liquidation-bootstrap213-installation.v1':'own-close-snapshot'+id+'-installation.v1';
 const beforePin=raw.rawBefore,afterPin=raw.rawAfter,signature=afterPin.signature;
 const beforeCheck=pinsCheck([...raw.prerequisites,beforePin],code+'_PREREQUISITE_CHANGED'),afterCheck=pinsCheck([...raw.prerequisites,afterPin],code+'_FUNCTION_CHANGED');
 const environment=readOnly=>`DO $${tag}_environment$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')}
  OR current_setting('server_version_num')::integer/10000<>${raw.major}
 THEN RAISE EXCEPTION '${code}_OWNER_TRANSACTION_REQUIRED';END IF;
 END $${tag}_environment$`;
 const digest=`(SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)}))`;
 const mode=`DO $${tag}_mode$ BEGIN
 IF NOT pg_try_advisory_xact_lock(${id}) THEN RAISE EXCEPTION '${code}_BUSY';END IF;
 IF ${digest}=${q(beforePin.sha256)} THEN PERFORM set_config('${prefix}mode','install',true);
 ELSIF ${digest}=${q(afterPin.sha256)} THEN PERFORM set_config('${prefix}mode','verify',true);
 ELSE RAISE EXCEPTION '${code}_PARTIAL_OR_DRIFTED';END IF;
 END $${tag}_mode$`;
 const choose=`DO $${tag}_choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $${tag}_choose$`;
 const before=snapshot('before',signature,prefix),after=snapshot('after',signature,prefix);
 const apply=`DO $${tag}_apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(raw.changed)};END IF;END $${tag}_apply$`;
 const conservation=`DO $${tag}_conserved$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION '${code}_PRIOR_STATE_CHANGED';END IF;END $${tag}_conserved$`;
 const proof=modeValue=>`SELECT jsonb_build_object('version',${q(version)},'sourceCommit',${q(raw.sourceCommit)},'schema','public','mode',${modeValue},'sourceHashes',${q(JSON.stringify(raw.sourceHashes))}::jsonb,'newTables',0,'newFunctions',0,'adaptedFunctions',1,'newCapabilities',0,'roleAssignmentsAdded',0,'existingAclChanges',0,'associationWrites',0,'businessWrites',0,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)}))) AS proof`;
 const wrap=(statements,ro)=>[...(ro?['SET TRANSACTION READ ONLY']:[]),...ownInstallationSettings,ownInstallationDestination(target),...statements];
 const installation=wrap([environment(false),mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')")],false);
 const rehearsalFault=`DO $public${id}_rehearsal_abort$ BEGIN RAISE EXCEPTION 'M7_PUBLIC${id}_REHEARSAL_ROLLBACK_REQUIRED';END $public${id}_rehearsal_abort$`;
 const sourceBookend=()=>{for(const[f,h]of Object.entries(raw.sourceHashes))assert.equal(hash(lf(source.read(f))),h,'PUBLIC213215_SOURCE_BOOKEND_CHANGED:'+f);return{passed:true,sourceCommit:raw.sourceCommit,sourceHashes:raw.sourceHashes,observedCatalogueMetadataUsed:false};};
 return freeze({version,stage:id,schema:'public',major:raw.major,sourceCommit:raw.sourceCommit,target:{...target},sourceHashes:raw.sourceHashes,rawBefore:beforePin,rawAfter:afterPin,beforePin,afterPin,prerequisites:raw.prerequisites,original:raw.original,changed:raw.changed,
  preflight:wrap([environment(true),beforeCheck],true),installation,rehearsal:[...installation,rehearsalFault],rehearsalExpectedError:'M7_PUBLIC'+id+'_REHEARSAL_ROLLBACK_REQUIRED',verification:wrap([environment(true),afterCheck,after,proof("'verify'")],true),repetition:installation,sourceBookend,
  nativeEquivalence:{included:false,reason:'existing214/215 equivalence constructors accept QA schema only; their QA validation and synthetic cases are unchanged'},
  whole201AdmissionIncluded:false,businessWrites:0,connects:false,executesSql:false,executionAdmitted:false});
}
export function prepareOwnLiquidationBootstrap213Public({target,sourceCommit,read}){target=destination(target);return publicPlan(composeOwnLiquidationBootstrap213Raw({major:target.major,sourceCommit,read}),target);}
export function prepareOwnCloseSnapshot214Public({target,sourceCommit,read}){target=destination(target);return publicPlan(composeOwnCloseSnapshot214Raw({major:target.major,sourceCommit,read}),target);}
export function prepareOwnCloseSnapshot215Public({target,sourceCommit,read}){target=destination(target);return publicPlan(composeOwnCloseSnapshot215Raw({major:target.major,sourceCommit,read}),target);}

// Finite bridge admission: validates identity in this module's private registry
// and all original pinned sources; a cloned raw object is never admitted.
export function assertOwnM7PublicSuccessorRaw(raw,{sourceCommit,major}){
 const record=minted.get(raw);assert.ok(record,'PUBLIC213215_UNMINTED_RAW');
 assert.equal(raw.sourceCommit,sourceCommit,'PUBLIC213215_RAW_SOURCE_COMMIT_CHANGED');assert.equal(raw.major,major,'PUBLIC213215_RAW_MAJOR_CHANGED');
 assert.equal(raw.schema,'public');assert.ok([213,214,215].includes(raw.stage));
 for(const[file,expected]of Object.entries(raw.sourceHashes))assert.equal(hash(lf(record.read(file))),expected,'PUBLIC213215_RAW_SOURCE_CHANGED:'+file);
 return raw;
}
