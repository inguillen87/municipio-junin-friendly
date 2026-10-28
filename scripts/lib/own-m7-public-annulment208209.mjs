// Closed public208→209 continuation. Source expectations never come from DB.
// Native results below are admitted only after exact target/source/epoch checks.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {composeM10PublicSchemaPlan,M10_PUBLIC_STAGE_ORDER} from './own-m10-public-schema-plan.mjs';
import {composeOwnM7PublicSchemaBatch,OWN_M7_STAGE_IDS,ownM7SourcePhaseContract} from './own-m7-public-schema-batch.mjs';
import {composeOwnAnnulmentReview208PublicSource,assertOwnAnnulmentReview208PublicProof,assertOwnAnnulmentReview208PublicDurability} from './own-m7-public-annulment208-source.mjs';
import {composeOwnAnnul209PublicPredecessorRegistry,assertOwnAnnul209PublicPredecessorRegistry,bookendOwnAnnul209PublicPredecessorRegistry} from './own-annul209-public-predecessor-registry.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from '../prepare-own-payroll-installation.mjs';
import {ownReleasePgDependencySource,ownReleaseErrorObservation,ownReleaseReceiptObservation,OWN_RELEASE_ANNULMENT_TRANSPORT_VERSION,assertOwnReleaseTlsObservations} from './own-payroll-release-annulment-pg.mjs';
export const OWN_M7_ANNULMENT_TAIL_STAGE='annul208209';
export const OWN_M7_STAGES_WITH_ANNULMENT=Object.freeze([...OWN_M7_STAGE_IDS,OWN_M7_ANNULMENT_TAIL_STAGE,...M10_PUBLIC_STAGE_ORDER.map(id=>'m10-'+id)]);
const FILE='scripts/lib/own-m7-public-annulment208209.mjs',SQL209='scripts/migrations/209-own-annulment-preparation-projection.sql';
const SQL209_SHA='5b0a9896d762f90a25ff84b5d8417d0e178350dd3864b73e47eb5654b2eafd56';
const I209='scripts/lib/own-payroll-annulment-preparation-209-installation.mjs',I209_SHA='f334ee7ccd6cd80c8eca647bc15e658a91ae0c512e28e7ec01d1af4c6111ad5a';
const producerPins=Object.freeze({'scripts/lib/own-m7-public-annulment208-source.mjs':'10d66c7dfe282bcee4f47b8724e5918c090e190bb7745e96c280897d2646583d','scripts/lib/own-annul209-public-predecessor-registry.mjs':'75919bec83c38b838651259f4414db85ee5bd7e9448d2045015ecec193d31687'});
const SHA=/^[a-f0-9]{64}$/,hash=v=>createHash('sha256').update(v).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const names208=Object.freeze(['own_annul_review_core_v2','own_annul_selected_index_v2','own_annul_command_index_core_v2','own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2']);
const signatures209=Object.freeze([['own_annul_preparation_core_v1','jsonb,uuid,integer',false],['own_annul_preparation_v1','jsonb,uuid',true],['own_annul_preparation_full_v1','jsonb,uuid',true]]);
const names209=Object.freeze(signatures209.map(p=>p[0]));
const tails=new WeakMap(),stages=new WeakMap(),admissions208=new WeakMap();
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PUBLIC_ANNUL_FINITE_SOURCE_ANCHOR');return s.replace(a,()=>b);};
const lf=s=>{assert.equal(typeof s,'string');return s.replace(/\r\n?/g,'\n');};
const exact=(v,keys,code)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v),code);assert.deepEqual(Reflect.ownKeys(v).sort(),[...keys].sort(),code);};
const targetKeys=Object.freeze(['major','projectId','branchId','endpointId','database','role','host','guardOid']);
const targetOf=t=>Object.fromEntries(targetKeys.map(k=>[k,t[k]]));
const targetKey=t=>JSON.stringify(targetOf(t));
const nativeKey=n=>n.pid+':'+n.backendStart;
const backendStartPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const proofOf=rows=>{const proof=rows.at(-1)?.[0]?.proof;assert.ok(proof&&typeof proof==='object'&&!Array.isArray(proof),'PUBLIC_ANNUL_NATIVE_PROOF_REQUIRED');return proof;};
const epochOf=rows=>{const epoch=rows.at(-1)?.[0]?.epoch;assert.ok(epoch&&typeof epoch==='object','PUBLIC_ANNUL_NATIVE_EPOCH_REQUIRED');return epoch;};
function mergeHashes(...maps){const result={};for(const map of maps)for(const[p,h]of Object.entries(map)){assert.match(h,SHA);if(Object.hasOwn(result,p))assert.equal(result[p],h,'PUBLIC_ANNUL_SOURCE_CONFLICT:'+p);result[p]=h;}return result;}
const context=(major,readOnly)=>`DO $public_annul_context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('standard_conforming_strings')<>'on' OR current_setting('server_version_num')::integer/10000<>${major} THEN RAISE EXCEPTION 'PUBLIC_ANNUL_NATIVE_CONTEXT_REQUIRED';END IF;END $public_annul_context$`;
const prefix=(target,readOnly)=>[...(readOnly?['SET TRANSACTION READ ONLY']:[]),...ownInstallationSettings,ownInstallationDestination(target),context(target.major,readOnly)];
const bind=(name,digest)=>{assert.match(digest,SHA);return `SELECT set_config(${q(name)},${q(digest)},true)`;};
const baselineSlot='municontrol_public_annul.expectedBaseline',epoch208Slot='municontrol_public_annul.expected208';
const baselineCheck=slot=>`DO $public_annul_baseline$ BEGIN IF current_setting('${baselineSlot}',true) IS NULL OR encode(public.digest(current_setting('${slot}')::jsonb::text,'sha256'),'hex')<>current_setting('${baselineSlot}') THEN RAISE EXCEPTION 'PUBLIC_ANNUL_BASELINE_EPOCH_CHANGED';END IF;END $public_annul_baseline$`;
const absence=names=>`DO $public_annul_absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[${names.map(q).join(',')}])) THEN RAISE EXCEPTION 'PUBLIC_ANNUL_FUNCTION_ALREADY_PRESENT';END IF;END $public_annul_absent$`;
function preservation209(slot,excludeNames){
 assert.ok(['before','after','epoch208'].includes(slot));let source=performancePreservationSnapshot();
 const anchor="FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 source=once(source,anchor,anchor+` AND NOT(s.nspname='public' AND p.proname=ANY(ARRAY[${excludeNames.map(q).join(',')}]))`);
 const ownIds=excludeNames.map(name=>`SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${q(name)}`).join(' UNION ALL ');
 const owns=a=>`(${a}.classid='pg_proc'::regclass AND ${a}.objid IN(${ownIds}))`;
 const extras=` result:=result||jsonb_build_object(
 'dependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]') FROM pg_depend d WHERE NOT coalesce(${owns('d')},false)),
 'sharedDependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype),'[]') FROM pg_shdepend d WHERE NOT coalesce(${owns('d')} AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database()),false)),
 'descriptions',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid),'[]') FROM pg_description d WHERE NOT(d.classoid='pg_proc'::regclass AND d.objoid IN(${ownIds}))),
 'securityLabels',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid,d.provider),'[]') FROM pg_seclabel d WHERE NOT(d.classoid='pg_proc'::regclass AND d.objoid IN(${ownIds}))),
 'rewrites',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_rewrite d),
 'extensions',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_extension d));
 PERFORM set_config`;
 // Exact208 snapshot shape is mandatory for the208→209 fingerprint comparison.
 if(slot!=='epoch208')source=once(source,' PERFORM set_config',extras);
 return once(source,'municontrol_documentary_install.after','municontrol_annul_preparation209.'+slot);
}
function aclAndOverloads(pins){return `DO $public_annul_acl$ DECLARE x jsonb;p pg_proc;runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'PUBLIC_ANNUL_ACL_CHANGED';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR(SELECT count(*) FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname)<>1
 OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor=p.proowner AND a.grantee=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee=runtime_oid)))
 OR(SELECT count(*) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))))<>(CASE WHEN(x->>'runtime')::boolean THEN 2 ELSE 1 END)
 THEN RAISE EXCEPTION 'PUBLIC_ANNUL_ACL_CHANGED';END IF;END LOOP;END $public_annul_acl$`;}
function detailFault(proof,stage,sourceCommit){
 assert.ok(proof.startsWith('SELECT ')&&proof.endsWith(' AS proof'),'PUBLIC_ANNUL_EXACT_PROOF_SELECT_REQUIRED');
 const expression=proof.slice(7,-9),code='PUBLIC_ANNUL'+stage+'_REHEARSAL_ROLLBACK';
 const value=`DO $public_annul_rehearsal$ DECLARE native_proof jsonb;BEGIN SELECT ${expression} INTO native_proof;
 RAISE EXCEPTION '${code}' USING DETAIL=jsonb_build_object('version','public-annul-native-rehearsal-detail.v1','stage',${stage},'sourceCommit',${q(sourceCommit)},'proof',native_proof)::text;END $public_annul_rehearsal$`;
 // Finite whole inverse. No error message is treated as a returned SELECT.
 const restored='SELECT '+expression+' AS proof';assert.equal(restored,proof);
 return{code,sql:value,sourceProof:proof,sourceProofSha256:hash(proof),wholeInverse:true};
}
function epochSelect(stage,slot,names,sourceCommit,sourceHashes,predecessorPinsSha256){return `SELECT jsonb_build_object('version','public-annul-source-epoch.v1','stage',${stage},'sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'predecessorPinsSha256',${q(predecessorPinsSha256)},'priorStateSha256',encode(public.digest(current_setting('${slot}')::jsonb::text,'sha256'),'hex'),'newFunctions',(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[${names.map(q).join(',')}])), 'native',jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num'))) AS epoch`;}
function sourceStage208(plan,target){
 assert.equal(plan.major,target.major);assert.equal(plan.schema,'public');assert.equal(plan.statements.length,12);assert.equal(plan.verification.length,5);assert.equal(plan.postflight.length,4);
 for(const [index,tag]of[[0,'annul208_context'],[1,'annul208_mode'],[2,'annul208_defaults'],[4,'annul208_choose'],[6,'annul208_apply'],[10,'annul208_preserved']])assert.ok(plan.statements[index].startsWith('DO $'+tag+'$'),'PUBLIC208_STATEMENT_LAYOUT_CHANGED');
 const beforeSlot='municontrol_annul_review208.before',afterSlot='municontrol_annul_review208.after';
 assert.ok(plan.statements[5].includes(beforeSlot)&&plan.statements[9].includes(afterSlot));
 const baseline=once(plan.statements[5],beforeSlot,'municontrol_public_annul.baseline208');
 const preflight=[context(target.major,true),plan.statements[3],plan.statements[2],absence(names208),baseline,epochSelect(208,'municontrol_public_annul.baseline208',names208,plan.sourceCommit,plan.sourceHashes,plan.predecessorPinsSha256)];
 const statements=[...plan.statements.slice(0,6),baselineCheck(beforeSlot),...plan.statements.slice(6)];
 const fault=detailFault(statements.at(-1),208,plan.sourceCommit);
 const value={stage:208,target:targetOf(target),sourceCommit:plan.sourceCommit,sourceHashes:plan.sourceHashes,predecessorPinsSha256:plan.predecessorPinsSha256,
  preflight,statements,verification:plan.verification,postflight:plan.postflight,rehearsal:[...statements.slice(0,-1),fault.sql],rehearsalFault:fault,
  faults:[{name:'late',code:'ANNUL208_LATE_INSTALL_FAILURE',statements:[...statements,"DO $annul208_late$ BEGIN RAISE EXCEPTION 'ANNUL208_LATE_INSTALL_FAILURE';END $annul208_late$"]},{name:'defaults',code:'OWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED',statements:["ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO pg_monitor",...statements]}]};
 freeze(value);stages.set(value,{source208:plan});return value;
}
function sourceStage209(registry,target,read,extraHashes){
 assertOwnAnnul209PublicPredecessorRegistry(registry,{sourceCommit:registry.sourceCommit});
 assert.equal(registry.schema,'public');assert.equal(registry.closure.memberCount,50);assert.equal(registry.capacityEpoch.unchangedOtherRecords,26);assert.equal(registry.capacityEpoch.wholeGuardInverse,true);
 const source=lf(read(SQL209));assert.equal(hash(source),SQL209_SHA);assert.equal(hash(lf(read(I209))),I209_SHA);
 const definitions=[...source.matchAll(/EXECUTE \$definition_209\$(CREATE FUNCTION public\.[\s\S]*?)\$definition_209\$;/g)].map(m=>m[1]);assert.equal(definitions.length,3);
 const ownPins=definitions.map((d,n)=>{const pin=ownInstallationFunctionPin(d),[name,args,runtime]=signatures209[n];assert.equal(pin.name,name);assert.equal(pin.signature,'public.'+name+'('+args+')');assert.deepEqual(pin.argNames,n===0?['p','source_id','maximum_bytes']:['p','source_id']);assert.deepEqual(pin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);assert.equal(pin.resultType,'jsonb');const revoke='REVOKE ALL ON FUNCTION '+pin.signature+' FROM PUBLIC,municontrol_actions_runtime_app;',grant='GRANT EXECUTE ON FUNCTION '+pin.signature+' TO municontrol_actions_runtime_app;';assert.equal(source.split(revoke).length,2);assert.equal(source.split(grant).length,runtime?2:1);return{...pin,runtime};});
 const sourceHashes=mergeHashes(registry.sourceHashes,extraHashes,{[SQL209]:SQL209_SHA,[I209]:I209_SHA}),predecessorPinsSha256=hash(JSON.stringify(registry.entries.map(e=>e.pin)));
 const predecessorCheck=Object.values(registry.guards).join(';\n'),ownCheck=[pinsCheck(ownPins,'ANNUL209_NEW_FUNCTION_SOURCE_CHANGED'),aclAndOverloads(ownPins)].join(';\n');
 const p='municontrol_annul_preparation209.',before=preservation209('before',names209),after=preservation209('after',names209),epoch208=preservation209('epoch208',[...names208,...names209]);
 const epochCheck=`DO $annul209_epoch$ BEGIN IF current_setting('${epoch208Slot}',true) IS NULL OR encode(public.digest(current_setting('${p}epoch208')::jsonb::text,'sha256'),'hex')<>current_setting('${epoch208Slot}') THEN RAISE EXCEPTION 'ANNUL209_NOT_IMMEDIATE208_EPOCH';END IF;END $annul209_epoch$`;
 const mode=`DO $annul209_mode$ DECLARE n integer;BEGIN PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);PERFORM pg_advisory_xact_lock(209);SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[${names209.map(q).join(',')}]);IF n=0 THEN PERFORM set_config('${p}mode','install',true);ELSIF n=3 THEN PERFORM set_config('${p}mode','verify',true);ELSE RAISE EXCEPTION 'ANNUL209_PARTIAL_OR_FOREIGN_STATE';END IF;END $annul209_mode$`;
 const defaults=`DO $annul209_defaults$ DECLARE value aclitem[];runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN value:=coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=0),acldefault('f',current_user::regrole))||coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclnamespace='public'::regnamespace),'{}'::aclitem[]);IF runtime_oid IS NULL OR runtime_oid=current_user::regrole OR EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable) OR NOT EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'ANNUL209_DEFAULT_ACL_CHANGED';END IF;END $annul209_defaults$`;
 const choose=`DO $annul209_choose$ BEGIN IF current_setting('${p}mode')='verify' THEN EXECUTE ${q(ownCheck)};END IF;END $annul209_choose$`;
 const apply=`DO $annul209_apply$ BEGIN IF current_setting('${p}mode')='install' THEN EXECUTE ${q(source)};END IF;END $annul209_apply$`;
 const compare=`DO $annul209_preserved$ BEGIN IF current_setting('${p}before')::jsonb IS DISTINCT FROM current_setting('${p}after')::jsonb THEN RAISE EXCEPTION 'ANNUL209_FULL_PRIOR_STATE_CHANGED';END IF;END $annul209_preserved$`;
 const objectHash=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY(ARRAY[${names209.map(q).join(',')}]))`;
 const proof=initial=>`SELECT jsonb_build_object('version','own-annul-preparation209-installation-proof.v1','sourceCommit',${q(registry.sourceCommit)},'sourceSqlSha256',${q(SQL209_SHA)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'predecessorPinsSha256',${q(predecessorPinsSha256)},'mode',${initial?"current_setting('"+p+"mode')":"'verify'"},'newFunctions',3,'privateHelpers',1,'runtimeFacades',2,'newTables',0,'adaptedFunctions',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',${initial},'priorStateSha256',encode(public.digest(current_setting('${p}after')::jsonb::text,'sha256'),'hex'),'epoch208PriorStateSha256',encode(public.digest(current_setting('${p}epoch208')::jsonb::text,'sha256'),'hex'),'objectSha256',${objectHash},'native',jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num'))${initial?",'beforeStateSha256',encode(public.digest(current_setting('"+p+"before')::jsonb::text,'sha256'),'hex')":''}) AS proof`;
 const beforeApply=[context(target.major,false),mode,defaults,predecessorCheck,epoch208,epochCheck,choose,before,baselineCheck(p+'before')];
 const statements=[...beforeApply,apply,predecessorCheck,ownCheck,after,compare,proof(true)],fault=detailFault(statements.at(-1),209,registry.sourceCommit);
 const baseline=once(before,p+'before','municontrol_public_annul.baseline209');
 const value={stage:209,target:targetOf(target),sourceCommit:registry.sourceCommit,sourceHashes,predecessorPinsSha256,ownPins,
  preflight:[context(target.major,true),predecessorCheck,defaults,epoch208,epochCheck,absence(names209),baseline,epochSelect(209,'municontrol_public_annul.baseline209',names209,registry.sourceCommit,sourceHashes,predecessorPinsSha256)],
  statements,verification:[context(target.major,true),predecessorCheck,ownCheck,epoch208,epochCheck,after,proof(false)],postflight:[context(target.major,true),predecessorCheck,ownCheck],
  rehearsal:[...statements.slice(0,-1),fault.sql],rehearsalFault:fault,
  faults:[{name:'early',code:'ANNUL209_EARLY_INSTALL_FAILURE',statements:[...beforeApply,"DO $annul209_early$ BEGIN RAISE EXCEPTION 'ANNUL209_EARLY_INSTALL_FAILURE';END $annul209_early$"]},{name:'late',code:'ANNUL209_LATE_INSTALL_FAILURE',statements:[...statements,"DO $annul209_late$ BEGIN RAISE EXCEPTION 'ANNUL209_LATE_INSTALL_FAILURE';END $annul209_late$"]},{name:'defaults',code:'ANNUL209_DEFAULT_ACL_CHANGED',statements:["ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO pg_monitor",...statements]}]};
 freeze(value);stages.set(value,{registry});return value;
}
export function composeOwnM7PublicSchemaBatchWithAnnulment(options){
 exact(options,['read','sourceCommit','operationalPairBaseline'],'PUBLIC_ANNUL_OPTIONS_EXACT');assert.ok(['pre107','published107'].includes(options.operationalPairBaseline),'PUBLIC_ANNUL_BASELINE_REQUIRED');
 // The existing pre107 ten-stage review is preserved; the new208/209 tail is
 // intentionally available only in the already-reviewed published107 lineage.
 if(options.operationalPairBaseline==='pre107')return composeOwnM7PublicSchemaBatch(options);
 const {read,sourceCommit}=options,raws=new Map(),load=file=>{const raw=read(file);assert.equal(typeof raw,'string');if(raws.has(file))assert.equal(raws.get(file),raw,'PUBLIC_ANNUL_SOURCE_DRIFT');raws.set(file,raw);return raw;};
 for(const[file,pin]of Object.entries(producerPins))assert.equal(hash(lf(load(file))),pin,'PUBLIC_ANNUL_FROZEN_PRODUCER_CHANGED:'+file);
 const base=composeOwnM7PublicSchemaBatch({...options,read:load}),registry=composeOwnAnnul209PublicPredecessorRegistry({...options,read:load});
 const dependencySource=ownReleasePgDependencySource({packageJson:load('package.json'),packageLock:load('package-lock.json')});
 const extraHashes={...producerPins,[FILE]:hash(lf(load(FILE))),'scripts/lib/own-payroll-release-target.mjs':hash(lf(load('scripts/lib/own-payroll-release-target.mjs'))),'scripts/lib/own-payroll-release-annulment-pg.mjs':hash(lf(load('scripts/lib/own-payroll-release-annulment-pg.mjs')))},sourceHashes=mergeHashes(base.sourceHashes,registry.sourceHashes,extraHashes);
 const m10Plans=[];const targets=base.targets.map(original=>{
  const target=targetOf(original),source208=composeOwnAnnulmentReview208PublicSource({read:load,sourceCommit,major:target.major});
  assert.equal(source208.sourceSqlSha256,registry.required208.sourceSqlSha256,'PUBLIC_ANNUL_208_REGISTRY_SQL_EPOCH_CHANGED');
  assert.deepEqual(source208.ownPins,registry.required208.pins,'PUBLIC_ANNUL_208_REGISTRY_FUNCTION_METADATA_CHANGED');
  Object.assign(sourceHashes,mergeHashes(sourceHashes,source208.sourceHashes));
  const stage208=sourceStage208(source208,target),stage209=sourceStage209(registry,target,load,mergeHashes(extraHashes,source208.sourceHashes));
  const pair={version:'own-m7-public-annulment-tail.v1',sourceCommit,target,dependencySource,review208:stage208,preparation209:stage209,subStageOrder:[208,209],receipt208FileAccepted:false,executionAdmitted:false};
  freeze(pair);tails.set(pair,{source208,registry,raws,read:load});
  const m10=composeM10PublicSchemaPlan({read:load,sourceCommit,target:OWN_RELEASE_TARGETS.find(t=>t.major===target.major)});m10Plans.push(m10);Object.assign(sourceHashes,mergeHashes(sourceHashes,m10.sourceHashes));
  const m10Batches=Object.fromEntries(m10.stages.map(stage=>['m10-'+stage.id,stage]));
  return Object.freeze({...original,m10PublicPlan:m10,stageBatches:Object.freeze({...original.stageBatches,[OWN_M7_ANNULMENT_TAIL_STAGE]:pair,...m10Batches}),stages:Object.freeze([...original.stages,Object.freeze({id:OWN_M7_ANNULMENT_TAIL_STAGE,version:pair.version,subStages:[stage208,stage209],dedicatedPgRequired:true,requiresReal208Admission:true}),...m10.stages.map(stage=>Object.freeze({...stage,id:'m10-'+stage.id,nativeEquivalencePublicIncluded:false}))])});
 });
 const sourceBookend=()=>{for(const m10 of m10Plans)m10.sourceBookend();for(const[file,raw]of raws)assert.equal(read(file),raw,'PUBLIC_ANNUL_RAW_SOURCE_BOOKEND_CHANGED:'+file);bookendOwnAnnul209PublicPredecessorRegistry(registry);return{sourceCommit,sourceHashes};};sourceBookend();
 return Object.freeze({...base,version:'own-m7-public-schema-with-annulment-m10.v2',sourceHashes:Object.freeze(sourceHashes),targets:Object.freeze(targets),stageOrder:[...OWN_M7_STAGES_WITH_ANNULMENT],notComposed:Object.freeze(['195']),counts:Object.freeze({...base.counts,annul208209:{newFunctions:10,privateHelpers:4,runtimeFacades:6,newTables:0,adaptedFunctions:0,roleAssignmentsAdded:0}}),
  capabilityDefinitionsAdded:4,m10Scope:Object.freeze({stages:8,newTables:4,newFunctions:31,adaptedFunctions:12,capabilityDefinitionsAdded:4,roleAssignmentsAdded:0,businessOperations:0}),
  phaseContracts:Object.freeze({...base.phaseContracts,...Object.fromEntries(M10_PUBLIC_STAGE_ORDER.map(id=>['m10-'+id,ownM7SourcePhaseContract('m10-'+id,load)])),[OWN_M7_ANNULMENT_TAIL_STAGE]:{stageId:OWN_M7_ANNULMENT_TAIL_STAGE,source:FILE,sourceSha256:extraHashes[FILE],kind:'annulment-tail'}}),sourceBookend,sourceOnly:true});
}

function assertNative(value,bundle,slot,major){
 exact(value,['pid','backendStart','serverVersionNum'],'PUBLIC_ANNUL_NATIVE_FIELDS');
 assert.ok(value&&Number.isSafeInteger(value.pid)&&value.pid>0,'PUBLIC_ANNUL_NATIVE_PID_REQUIRED');
 assert.match(value.backendStart,backendStartPattern);assert.match(value.serverVersionNum,/^\d{6}$/);assert.equal(Math.trunc(Number(value.serverVersionNum)/10000),major);
 assert.deepEqual(value,bundle.identities[slot],'PUBLIC_ANNUL_NATIVE_SESSION_CHANGED');
}
function assertEpoch(epoch,stage,bundle){
 assert.ok(stages.has(stage),'PUBLIC_ANNUL_MINTED_STAGE_REQUIRED');
 exact(epoch,['version','stage','sourceCommit','sourceHashes','predecessorPinsSha256','priorStateSha256','newFunctions','native'],'PUBLIC_ANNUL_EPOCH_FIELDS');
 assert.equal(epoch.version,'public-annul-source-epoch.v1');assert.equal(epoch.stage,stage.stage);assert.equal(epoch.sourceCommit,stage.sourceCommit);
 assert.deepEqual(epoch.sourceHashes,stage.sourceHashes);assert.equal(epoch.predecessorPinsSha256,stage.predecessorPinsSha256);assert.equal(epoch.newFunctions,0);assert.match(epoch.priorStateSha256,SHA);
 assertNative(epoch.native,bundle,'epoch',stage.target.major);return epoch;
}
function assert209Proof(proof,stage,expected208){
 assert.equal(proof?.version,'own-annul-preparation209-installation-proof.v1');assert.equal(proof.sourceCommit,stage.sourceCommit);assert.equal(proof.sourceSqlSha256,SQL209_SHA);assert.deepEqual(proof.sourceHashes,stage.sourceHashes);assert.equal(proof.predecessorPinsSha256,stage.predecessorPinsSha256);
 for(const[k,n]of Object.entries({newFunctions:3,privateHelpers:1,runtimeFacades:2,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(proof[k],n,k);
 for(const k of['priorStateSha256','objectSha256','epoch208PriorStateSha256'])assert.match(proof[k],SHA);
 assert.equal(proof.epoch208PriorStateSha256,expected208);assert.ok(['install','verify'].includes(proof.mode));
 assert.equal(Math.trunc(Number(proof.native?.serverVersionNum)/10000),stage.target.major);assert.ok(Number.isSafeInteger(proof.native.pid));assert.equal(typeof proof.native.backendStart,'string');
}
function assertStageProof(proof,stage,mode,write,bundle,slot,expected208){
 const seal=stages.get(stage);assert.ok(seal,'PUBLIC_ANNUL_MINTED_STAGE_REQUIRED');
 const keys=['version','sourceCommit','sourceSqlSha256','sourceHashes','predecessorPinsSha256','mode',
  'newFunctions','privateHelpers','runtimeFacades','newTables','adaptedFunctions','existingAclChanges','roleAssignmentsAdded','businessWrites','nominalRowsReturned',
  'transactionDataPreserved','priorStateSha256','objectSha256','native',...(write?['beforeStateSha256']:[]),...(stage.stage===209?['epoch208PriorStateSha256']:[])];
 exact(proof,keys,'PUBLIC_ANNUL_PROOF_FIELDS');
 if(stage.stage===208)assertOwnAnnulmentReview208PublicProof({proof,batch:seal.source208});else assert209Proof(proof,stage,expected208);
 assert.equal(proof.mode,mode);assert.equal(proof.transactionDataPreserved,write);if(write)assert.equal(proof.beforeStateSha256,proof.priorStateSha256,'PUBLIC_ANNUL_NATIVE_CONSERVATION_CHANGED');
 assertNative(proof.native,bundle,slot,stage.target.major);return proof;
}
// Original Error/DETAIL remain only in memory. Persist fixed codes and exact
// byte lengths/hashes before classifying; never free-text message/stack/detail.
const errorObservation=ownReleaseErrorObservation;
function nativeValidation(original,check){
 try{return check();}catch(error){
  if(error instanceof Error&&error!==original&&!Object.hasOwn(error,'cause'))Object.defineProperty(error,'cause',{value:original,enumerable:false});
  throw error;
 }
}
function assertNativeRollback(error,code,bundle){
 assert.ok(error&&typeof error==='object','PUBLIC_ANNUL_NATIVE_ERROR_REQUIRED');assert.equal(error.code,'P0001','PUBLIC_ANNUL_ROLLBACK_SQLSTATE_REQUIRED');assert.equal(error.message,code,'PUBLIC_ANNUL_ROLLBACK_TOKEN_REQUIRED');
 assert.equal(error.ownDedicatedSession?.slot,'rehearsal');assert.equal(error.ownDedicatedSession?.sessionTerminated,true,'PUBLIC_ANNUL_REHEARSAL_SESSION_TERMINAL_REQUIRED');
 assert.deepEqual(error.ownDedicatedSession.native,bundle.identities.rehearsal,'PUBLIC_ANNUL_REHEARSAL_NATIVE_IDENTITY_CHANGED');
}
export function assertOwnM7AnnulmentRehearsalDetail({error,stage,bundle,expected208}){
 return nativeValidation(error,()=>{
 assert.ok(stages.has(stage),'PUBLIC_ANNUL_MINTED_STAGE_REQUIRED');assertNativeRollback(error,stage.rehearsalFault.code,bundle);
 assert.equal(typeof error.detail,'string','PUBLIC_ANNUL_NATIVE_DETAIL_REQUIRED');let detail;try{detail=JSON.parse(error.detail);}catch{throw Error('PUBLIC_ANNUL_NATIVE_DETAIL_INVALID');}
 exact(detail,['version','stage','sourceCommit','proof'],'PUBLIC_ANNUL_NATIVE_DETAIL_SHAPE');assert.equal(detail.version,'public-annul-native-rehearsal-detail.v1');assert.equal(detail.stage,stage.stage);assert.equal(detail.sourceCommit,stage.sourceCommit);
 return assertStageProof(detail.proof,stage,'install',true,bundle,'rehearsal',expected208);
 });
}
function assertBundle(bundle,target){
 assert.equal(bundle?.version,OWN_RELEASE_ANNULMENT_TRANSPORT_VERSION,'PUBLIC_ANNUL_DEDICATED_TRANSPORT_REQUIRED');
 exact(bundle.target,[...targetKeys,'transport'],'PUBLIC_ANNUL_TARGET_FIELDS');
 for(const k of targetKeys)assert.equal(bundle.target?.[k],target[k],'PUBLIC_ANNUL_DESTINATION_CHANGED:'+k);
 assert.equal(bundle.target.transport,'postgres_tls_dedicated');assert.equal(bundle.credentialsExposed,false);assert.equal(bundle.automaticRetry,false);
 assert.equal(typeof bundle.transaction,'function');assert.equal(typeof bundle.close,'function');
 assert.ok(Array.isArray(bundle.tlsObservations)&&bundle.tlsObservations.length===5,'PUBLIC_ANNUL_FIVE_TLS_OBSERVATIONS_REQUIRED');
 exact(bundle.identities,['epoch','rehearsal','installation','durable','repetition'],'PUBLIC_ANNUL_FIVE_DEDICATED_SLOTS_REQUIRED');
 for(const [slot,n]of Object.entries(bundle.identities))assertNative(n,bundle,slot,target.major);
 assertOwnReleaseTlsObservations({tlsObservations:bundle.tlsObservations,identities:bundle.identities,target});
 for(const row of bundle.tlsObservations)assertNative(row.native,bundle,row.slot,target.major);
 assert.equal(new Set(Object.values(bundle.identities).map(nativeKey)).size,5,'PUBLIC_ANNUL_FIVE_PHYSICAL_BACKENDS_REQUIRED');
}
function sourceBookend(pair){const seal=tails.get(pair);assert.ok(seal,'PUBLIC_ANNUL_MINTED_PAIR_REQUIRED');for(const[file,raw]of seal.raws)assert.equal(seal.read(file),raw,'PUBLIC_ANNUL_RAW_SOURCE_BOOKEND_CHANGED:'+file);seal.source208.sourceBookend();bookendOwnAnnul209PublicPredecessorRegistry(seal.registry);return{sourceCommit:pair.sourceCommit,sourceVerified:true};}
function expected208Admission(pair,admission){
 const value=admissions208.get(admission);assert.ok(value,'PUBLIC209_REAL208_ADMISSION_REQUIRED');assert.strictEqual(value.pair,pair);assert.equal(value.sourceCommit,pair.sourceCommit);assert.equal(value.targetKey,targetKey(pair.target));sourceBookend(pair);return value;
}
function runtimeStatements(stage,sql,baseline,expected208,readOnly){
 assert.ok(stages.has(stage));const values=[...prefix(stage.target,readOnly)];
 if(expected208!==undefined)values.push(bind(epoch208Slot,expected208));
 if(baseline!==undefined)values.push(bind(baselineSlot,baseline));
 return[...values,...sql];
}
async function epochRead(bundle,stage,expected208){
 return assertEpoch(epochOf(await bundle.transaction('epoch',runtimeStatements(stage,stage.preflight,undefined,expected208,true),{readOnly:true})),stage,bundle);
}
async function observe208FunctionBookend(bundle,pair,admission){
 const native=expected208Admission(pair,admission),source=tails.get(pair).source208;
 const observed=proofOf(await bundle.transaction('epoch',[...prefix(pair.target,true),...source.postflight],{readOnly:true}));
 exact(observed,['version','sourceCommit','sourceSqlSha256','predecessorPinsSha256','objectSha256'],'PUBLIC209_208_BOOKEND_FIELDS');
 assert.equal(observed.version,'own-annulment-review208-function-bookend.v1');assert.equal(observed.sourceCommit,pair.sourceCommit);assert.equal(observed.sourceSqlSha256,source.sourceSqlSha256);assert.equal(observed.predecessorPinsSha256,source.predecessorPinsSha256);assert.equal(observed.objectSha256,native.proofs.installed.objectSha256,'PUBLIC209_208_FUNCTION_BOOKEND_CHANGED');return observed;
}
async function controlledFault({pair,stage,fault,client,record,result,baseline,admission}){
 sourceBookend(pair);const expected208=stage.stage===209?expected208Admission(pair,admission).priorStateSha256:undefined;
 let bundle;try{
  result.phase=stage.stage+'-negative-'+fault.name+'-before-client';record(result);bundle=await client(pair.target.major,{dependencySource:pair.dependencySource});assertBundle(bundle,pair.target);result.transportObservations.push({stage:stage.stage,purpose:'negative-'+fault.name,target:bundle.target,identities:bundle.identities,tlsObservations:bundle.tlsObservations});record(result);
  if(stage.stage===209){result.phase='209-negative-'+fault.name+'-208-bookend';record(result);await observe208FunctionBookend(bundle,pair,admission);}
  result.phase=stage.stage+'-negative-'+fault.name+'-preflight';record(result);const before=await epochRead(bundle,stage,expected208);if(baseline)assert.equal(before.priorStateSha256,baseline.priorStateSha256,'PUBLIC_ANNUL_BETWEEN_FAULT_EPOCH_CHANGED');
  result.phase=stage.stage+'-negative-'+fault.name;record(result);let original=null;try{await bundle.transaction('rehearsal',runtimeStatements(stage,fault.statements,before.priorStateSha256,expected208,false),{readOnly:false});}catch(error){original=error;}
  result.negativeObservations.push({stage:stage.stage,name:fault.name,error:errorObservation(original)});record(result);
  // Nothing below this line runs for a transport/SQL/token/session ambiguity.
  nativeValidation(original,()=>assertNativeRollback(original,fault.code,bundle));
  result.phase=stage.stage+'-negative-'+fault.name+'-rollback-verification';record(result);const after=await epochRead(bundle,stage,expected208);assert.equal(after.priorStateSha256,before.priorStateSha256,'PUBLIC_ANNUL_NEGATIVE_NOT_ROLLED_BACK');
  result.negativeObservations.at(-1).rollbackEpoch=after;record(result);await bundle.close();bundle=null;return before;
 }finally{if(bundle)await bundle.close();}
}
async function runStage({pair,stage,client,record,result,admission}){
 const expected208=stage.stage===209?expected208Admission(pair,admission).priorStateSha256:undefined;let baseline;
 // Exact inherited early/late/default-ACL regressions are distinct intentional
 // rollback invocations. They are never retries after an uncertain outcome.
 for(const fault of stage.faults)baseline=await controlledFault({pair,stage,fault,client,record,result,baseline,admission});
 let bundle;try{
  sourceBookend(pair);result.phase=stage.stage+'-before-client';record(result);bundle=await client(pair.target.major,{dependencySource:pair.dependencySource});assertBundle(bundle,pair.target);result.transportObservations.push({stage:stage.stage,purpose:'four-proof-stage',target:bundle.target,identities:bundle.identities,tlsObservations:bundle.tlsObservations});record(result);
  if(stage.stage===209){result.phase='209-208-function-bookend';record(result);result.real208FunctionBookend=await observe208FunctionBookend(bundle,pair,admission);record(result);}
  result.phase=stage.stage+'-preflight';record(result);const before=await epochRead(bundle,stage,expected208);assert.equal(before.priorStateSha256,baseline.priorStateSha256,'PUBLIC_ANNUL_PREINSTALL_EPOCH_CHANGED');result.epochs[stage.stage]={before};record(result);
  result.phase=stage.stage+'-rehearsal';record(result);let original=null;try{await bundle.transaction('rehearsal',runtimeStatements(stage,stage.rehearsal,before.priorStateSha256,expected208,false),{readOnly:false});}catch(error){original=error;}
  result.rehearsalObservations[stage.stage]=errorObservation(original);record(result);
  const rehearsal=assertOwnM7AnnulmentRehearsalDetail({error:original,stage,bundle,expected208});
  result.rehearsalObservations[stage.stage]={...result.rehearsalObservations[stage.stage],validatedDetail:{version:'public-annul-validated-detail-reference.v1',stage:stage.stage,sourceCommit:stage.sourceCommit,
   detailBytes:result.rehearsalObservations[stage.stage].fields.detail.bytes,detailSha256:result.rehearsalObservations[stage.stage].fields.detail.sha256,proofSha256:hash(JSON.stringify(rehearsal))}};record(result);
  result.phase=stage.stage+'-rollback-verification';record(result);const rollback=await epochRead(bundle,stage,expected208);assert.equal(rollback.priorStateSha256,before.priorStateSha256,'PUBLIC_ANNUL_REHEARSAL_NOT_ROLLED_BACK');result.epochs[stage.stage].rollback=rollback;record(result);
  result.phase=stage.stage+'-installation';record(result);const installedRows=await bundle.transaction('installation',runtimeStatements(stage,stage.statements,before.priorStateSha256,expected208,false),{readOnly:false});result.phaseReceiptObservations[stage.stage]={installation:ownReleaseReceiptObservation(installedRows)};record(result);
  const installed=assertStageProof(proofOf(installedRows),stage,'install',true,bundle,'installation',expected208);result.installedStages.push(stage.stage);
  result.proofs[stage.stage]={rehearsal,installed};record(result);
  result.phase=stage.stage+'-durable';record(result);const durableRows=await bundle.transaction('durable',runtimeStatements(stage,stage.verification,undefined,expected208,true),{readOnly:true});result.phaseReceiptObservations[stage.stage].durable=ownReleaseReceiptObservation(durableRows);record(result);const durable=assertStageProof(proofOf(durableRows),stage,'verify',false,bundle,'durable',expected208);result.proofs[stage.stage].durable=durable;record(result);
  for(const key of ['priorStateSha256','objectSha256',...(stage.stage===209?['epoch208PriorStateSha256']:[])])assert.equal(installed[key],durable[key],'PUBLIC_ANNUL_IMMEDIATE_DURABILITY_CHANGED:'+key);
  result.phase=stage.stage+'-repetition';record(result);const repeatedRows=await bundle.transaction('repetition',runtimeStatements(stage,stage.statements,before.priorStateSha256,expected208,false),{readOnly:false});result.phaseReceiptObservations[stage.stage].repeated=ownReleaseReceiptObservation(repeatedRows);record(result);const repeated=assertStageProof(proofOf(repeatedRows),stage,'verify',true,bundle,'repetition',expected208);result.proofs[stage.stage].repeated=repeated;record(result);
  if(stage.stage===208)assertOwnAnnulmentReview208PublicDurability({batch:stages.get(stage).source208,rehearsal,installed,durable,repeated});
  else{
   for(const k of['priorStateSha256','epoch208PriorStateSha256','objectSha256']){assert.equal(installed[k],durable[k],'ANNUL209_NOT_DURABLE:'+k);assert.equal(installed[k],repeated[k],'ANNUL209_REPEAT_CHANGED:'+k);}
   assert.equal(new Set([rehearsal,installed,durable,repeated].map(p=>nativeKey(p.native))).size,4,'ANNUL209_INDEPENDENT_CONNECTIONS_REQUIRED');
  }
  assert.equal(installed.priorStateSha256,before.priorStateSha256,'PUBLIC_ANNUL_COMMIT_BASELINE_CHANGED');sourceBookend(pair);await bundle.close();bundle=null;return{rehearsal,installed,durable,repeated};
 }finally{if(bundle)await bundle.close();}
}
export async function executeOwnM7PublicAnnulmentTail({batch,major,client,record}){
 assert.equal(typeof client,'function');assert.equal(typeof record,'function');assert.ok([17,18].includes(major));
 const target=batch.targets.find(t=>t.major===major),pair=target?.stageBatches?.[OWN_M7_ANNULMENT_TAIL_STAGE];assert.ok(pair&&tails.has(pair),'PUBLIC_ANNUL_RECOMPOSED_PAIR_REQUIRED');assert.equal(pair.sourceCommit,batch.sourceCommit);assert.equal(targetKey(pair.target),targetKey(target));sourceBookend(pair);
 const result={stage:OWN_M7_ANNULMENT_TAIL_STAGE,version:pair.version,sourceCommit:pair.sourceCommit,target:pair.target,state:'PENDING',phase:'before-client',proofs:{},phaseReceiptObservations:{},epochs:{},rehearsalObservations:{},negativeObservations:[],transportObservations:[],installedStages:[],installed:false,repeated:false,durableObserved:false,automaticRetry:false,cleanupAttempted:false,businessOperations:0,nominalRowsReturned:0,durabilityVerified:false};
 let initialRecorded=false;
 try{
  record(result);initialRecorded=true;
  const proofs208=await runStage({pair,stage:pair.review208,client,record,result});
  const admission=Object.freeze({version:'public208-native-inprocess-admission.v1'});
  admissions208.set(admission,{pair,sourceCommit:pair.sourceCommit,targetKey:targetKey(pair.target),priorStateSha256:proofs208.installed.priorStateSha256,proofs:proofs208});
  result.review208DurabilityVerified=true;record(result);
  await runStage({pair,stage:pair.preparation209,client,record,result,admission});
  Object.assign(result,{state:'VALIDATED',phase:'complete',installed:true,repeated:true,durableObserved:true,durabilityVerified:true,preparation209DurabilityVerified:true,validatedNativeProofs:8,nativeRehearsalProofChannel:'PostgreSQL ERROR DETAIL; not a returned SELECT',independentRollbackEpochsVerified:2,real208AdmissionUsed:true,metadataSource:'public source only',nativeEquivalencePublicIncluded:false});record(result);return result;
 }catch(cause){
  const error=cause instanceof Error?cause:Error('PUBLIC_ANNUL_NON_ERROR_FAILURE');Object.assign(result,{state:'UNCERTAIN',noFurtherSql:true,noCleanup:true,automaticRetry:false,durabilityVerified:false,failure:errorObservation(error)});if(initialRecorded)try{record(result);}catch{}
  error.uncertain=true;error.noFurtherSql=true;throw error;
 }
}

// Readback of an ORIGINAL final tail record for the later M10 schema stages.
// This validates data only. It never creates an in-process208 admission, opens
// a session, queries the current epoch, or replays209 after M10 adds triggers.
export function assertOwnM7PublicAnnulmentTailRecord({batch,major,record}){
 const target=batch.targets.find(t=>t.major===major),pair=target?.stageBatches?.[OWN_M7_ANNULMENT_TAIL_STAGE],seal=tails.get(pair);assert.ok(seal,'PUBLIC_ANNUL_UNMINTED_READBACK_PLAN');sourceBookend(pair);
 const keys=['stage','version','sourceCommit','target','state','phase','proofs','phaseReceiptObservations','epochs','rehearsalObservations','negativeObservations','transportObservations','installedStages','installed','repeated','durableObserved','automaticRetry','cleanupAttempted','businessOperations','nominalRowsReturned','durabilityVerified','review208DurabilityVerified','preparation209DurabilityVerified','validatedNativeProofs','nativeRehearsalProofChannel','independentRollbackEpochsVerified','real208AdmissionUsed','metadataSource','nativeEquivalencePublicIncluded','real208FunctionBookend'];
 for(const key of ['novelty217Prior','capacity201Prior'])if(Object.hasOwn(record??{},key))keys.push(key);exact(record,keys,'PUBLIC_ANNUL_FINAL_RECORD_FIELDS');
 assert.equal(record.stage,OWN_M7_ANNULMENT_TAIL_STAGE);assert.equal(record.version,pair.version);assert.equal(record.sourceCommit,pair.sourceCommit);assert.deepEqual(record.target,pair.target);assert.equal(record.state,'VALIDATED');assert.equal(record.phase,'complete');
 for(const key of ['installed','repeated','durableObserved','durabilityVerified','review208DurabilityVerified','preparation209DurabilityVerified','real208AdmissionUsed'])assert.equal(record[key],true,'PUBLIC_ANNUL_REAL_FINAL_RECORD_REQUIRED:'+key);
 for(const key of ['automaticRetry','cleanupAttempted','nativeEquivalencePublicIncluded'])assert.equal(record[key],false);assert.equal(record.businessOperations,0);assert.equal(record.nominalRowsReturned,0);assert.equal(record.validatedNativeProofs,8);assert.equal(record.independentRollbackEpochsVerified,2);assert.equal(record.metadataSource,'public source only');assert.equal(record.nativeRehearsalProofChannel,'PostgreSQL ERROR DETAIL; not a returned SELECT');assert.deepEqual(record.installedStages,[208,209]);
 exact(record.proofs,['208','209'],'PUBLIC_ANNUL_REAL_PROOF_PAIR_REQUIRED');exact(record.epochs,['208','209'],'PUBLIC_ANNUL_REAL_EPOCH_PAIR_REQUIRED');exact(record.phaseReceiptObservations,['208','209'],'PUBLIC_ANNUL_REAL_RECEIPT_OBSERVATIONS_REQUIRED');exact(record.rehearsalObservations,['208','209'],'PUBLIC_ANNUL_REAL_REHEARSAL_OBSERVATIONS_REQUIRED');
 const expectations=[pair.review208,pair.preparation209];assert.equal(record.transportObservations.length,expectations.reduce((n,s)=>n+s.faults.length+1,0));assert.equal(record.negativeObservations.length,expectations.reduce((n,s)=>n+s.faults.length,0));
 const observedBundle=(stage,purpose)=>{
  const rows=record.transportObservations.filter(row=>row.stage===stage.stage&&row.purpose===purpose);assert.equal(rows.length,1,'PUBLIC_ANNUL_REAL_TRANSPORT_OBSERVATION_REQUIRED');const row=rows[0];exact(row,['stage','purpose','target','identities','tlsObservations'],'PUBLIC_ANNUL_TRANSPORT_OBSERVATION_FIELDS');
  exact(row.target,[...targetKeys,'transport'],'PUBLIC_ANNUL_TARGET_FIELDS');for(const key of targetKeys)assert.equal(row.target[key],pair.target[key]);assert.equal(row.target.transport,'postgres_tls_dedicated');exact(row.identities,['epoch','rehearsal','installation','durable','repetition'],'PUBLIC_ANNUL_FIVE_DEDICATED_SLOTS_REQUIRED');
  const observed={identities:row.identities};for(const[slot,native]of Object.entries(row.identities))assertNative(native,observed,slot,major);assert.equal(new Set(Object.values(row.identities).map(nativeKey)).size,5,'PUBLIC_ANNUL_FIVE_PHYSICAL_BACKENDS_REQUIRED');assert.equal(row.tlsObservations.length,5);
  assertOwnReleaseTlsObservations({tlsObservations:row.tlsObservations,identities:row.identities,target:pair.target});for(const tls of row.tlsObservations)assertNative(tls.native,observed,tls.slot,major);return observed;
 };
 const redactedRollback=(error,code,bundle)=>{
  assert.equal(error.version,'own-release-redacted-native-error.v1');assert.equal(error.code,'P0001');assert.equal(error.messageToken,code);assert.equal(error.fields?.message?.type,'string');assert.equal(error.fields.message.bytes,Buffer.byteLength(code));assert.equal(error.fields.message.sha256,hash(code));exact(error.ownedSession,['slot','native','sessionTerminated'],'PUBLIC_ANNUL_SAVED_OWNED_SESSION_FIELDS');assert.equal(error.ownedSession.slot,'rehearsal');assert.equal(error.ownedSession.sessionTerminated,true);assertNative(error.ownedSession.native,bundle,'rehearsal',major);assert.equal(Object.hasOwn(error,'transportFailure'),false,'PUBLIC_ANNUL_SAVED_TRANSPORT_AMBIGUITY');
 };
 for(const stage of expectations){
  const p=record.proofs[stage.stage],bundle=observedBundle(stage,'four-proof-stage'),expected208=stage.stage===209?record.proofs[208].installed.priorStateSha256:undefined;exact(p,['rehearsal','installed','durable','repeated'],'PUBLIC_ANNUL_REAL_FOUR_PROOFS_REQUIRED');
  for(const[key,mode,write,slot]of[['rehearsal','install',true,'rehearsal'],['installed','install',true,'installation'],['durable','verify',false,'durable'],['repeated','verify',true,'repetition']])assertStageProof(p[key],stage,mode,write,bundle,slot,expected208);
  if(stage.stage===208)assertOwnAnnulmentReview208PublicDurability({batch:seal.source208,...p});
  else for(const key of ['priorStateSha256','objectSha256','epoch208PriorStateSha256']){assert.equal(p.installed[key],p.durable[key]);assert.equal(p.installed[key],p.repeated[key]);}
  const epochs=record.epochs[stage.stage];exact(epochs,['before','rollback'],'PUBLIC_ANNUL_REAL_ROLLBACK_EPOCHS_REQUIRED');for(const epoch of Object.values(epochs)){assertEpoch(epoch,stage,bundle);assert.equal(epoch.priorStateSha256,p.installed.priorStateSha256,'PUBLIC_ANNUL_SAVED_EPOCH_CHANGED');}
  const error=record.rehearsalObservations[stage.stage];redactedRollback(error,stage.rehearsalFault.code,bundle);const ref=error.validatedDetail;exact(ref,['version','stage','sourceCommit','detailBytes','detailSha256','proofSha256'],'PUBLIC_ANNUL_SAVED_DETAIL_REFERENCE');assert.equal(ref.version,'public-annul-validated-detail-reference.v1');assert.equal(ref.stage,stage.stage);assert.equal(ref.sourceCommit,pair.sourceCommit);assert.equal(error.fields.detail.type,'string');assert.equal(ref.detailBytes,error.fields.detail.bytes);assert.equal(ref.detailSha256,error.fields.detail.sha256);assert.equal(ref.proofSha256,hash(JSON.stringify(p.rehearsal)));
  const observations=record.phaseReceiptObservations[stage.stage];exact(observations,['installation','durable','repeated'],'PUBLIC_ANNUL_SAVED_PHASE_BYTES_FIELDS');for(const item of Object.values(observations)){exact(item,['version','bytes','sha256'],'PUBLIC_ANNUL_SAVED_PHASE_BYTES');assert.equal(item.version,'own-release-receipt-bytes.v1');assert.ok(Number.isSafeInteger(item.bytes)&&item.bytes>0);assert.match(item.sha256,SHA);}
  for(const fault of stage.faults){const rows=record.negativeObservations.filter(row=>row.stage===stage.stage&&row.name===fault.name);assert.equal(rows.length,1,'PUBLIC_ANNUL_SAVED_NEGATIVE_REQUIRED');const n=rows[0];exact(n,['stage','name','error','rollbackEpoch'],'PUBLIC_ANNUL_SAVED_NEGATIVE_FIELDS');const prior=observedBundle(stage,'negative-'+fault.name);redactedRollback(n.error,fault.code,prior);assertEpoch(n.rollbackEpoch,stage,prior);assert.equal(n.rollbackEpoch.priorStateSha256,p.installed.priorStateSha256,'PUBLIC_ANNUL_SAVED_NEGATIVE_NOT_ROLLED_BACK');}
 }
 const source=seal.source208,bookend=record.real208FunctionBookend;exact(bookend,['version','sourceCommit','sourceSqlSha256','predecessorPinsSha256','objectSha256'],'PUBLIC209_208_BOOKEND_FIELDS');assert.equal(bookend.version,'own-annulment-review208-function-bookend.v1');assert.equal(bookend.sourceCommit,pair.sourceCommit);assert.equal(bookend.sourceSqlSha256,source.sourceSqlSha256);assert.equal(bookend.predecessorPinsSha256,source.predecessorPinsSha256);assert.equal(bookend.objectSha256,record.proofs[208].installed.objectSha256,'PUBLIC209_208_FUNCTION_BOOKEND_CHANGED');
 return {passed:true,validatedOriginalNativeProofs:8,sourceCommit:pair.sourceCommit,actualTarget:record.target,queriesExecuted:0,native208AdmissionMinted:false,current209EpochReplayed:false};
}
