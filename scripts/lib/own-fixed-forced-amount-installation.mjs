// Pure technical plan. No connection, CLI, business command or authority decision.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {buildMunicipalOwnerProgramInstallation,ownerProgramInstallationSnapshot} from './municipal-owner-program-installation.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
export const FIXED_FORCED_INSTALL_SQL='scripts/migrations/196-own-fixed-forced-amount.sql';
export const FIXED_FORCED_INSTALL_SQL_SHA256='72a2582a5dd768b264f6b16bcfaaa1afc5ae119bf715674ab730c4133d083b3f';
const VERSION='own-fixed-forced-amount-installation.v1',prefix='municontrol_fixed_forced196.',family='own_fixed_forced_';
const hash=v=>createHash('sha256').update(v).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'FIXED_FORCED_INSTALL_ANCHOR_CHANGED:'+a.slice(0,90));return s.replace(a,()=>b);};
const functions=s=>splitPostgresStatements(s).flatMap(d=>{const m=/\bCREATE(?: OR REPLACE)? FUNCTION public\.\w+\(/.exec(d);return m?[d.slice(m.index)]:[];});
const normalized=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0);return d.slice(0,at).replace(/SET search_path TO 'pg_catalog',\s*'public',\s*'pg_temp'/,"SET search_path=pg_catalog,public,pg_temp").replace(/SET (?:(?:"TimeZone"|timezone) TO|timezone=)\s*'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);};
const pin=(d,runtime=false)=>({...ownInstallationFunctionPin(normalized(d)),runtime});
const SOURCE=Object.freeze([
 ['scripts/migrations/172-own-salary-conditions-program-source.sql','74ae429927824d6b9e209f1776ec4f7537e95182f2fd14b4f40b5862d0a633df',['own_program_node_v2','own_program_unit_v2','own_run_complete_v1']],
 ['scripts/migrations/173-own-full-payroll-response.sql','53edda88ffd719d2322cddc9caad477d63262023475c8084328d7f97e7ecd084',['own_run_complete_full_v1']],
 ['scripts/migrations/182-own-payroll-period-context.sql','80321aaa63a3b572127bfed926302a66acb4b3d479ebbfd3a876c9c665d88068',['own_program_definition_v1']],
 ['scripts/migrations/190-municipal-owner-program-decision.sql','8f8f3751bbdd95cc3c735913237179060a9b4537d9a65c799147c130188b74c9',['municipal_owner_program_command_core_v1']],
]);
const runtime=new Set(['own_run_complete_v1','own_run_complete_full_v1']);
const newNames=['own_fixed_forced_expression_set_v1','own_fixed_forced_policy_v1','own_fixed_forced_capture_v1'];
const ids=pins=>pins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
const familyCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,"+family.length+")="+q(family)+')';
const familyState=n=>`DO $family$ BEGIN IF ${familyCount}<>${n} THEN RAISE EXCEPTION 'FIXED_FORCED_INSTALL_FAMILY_CHANGED';END IF;END $family$`;

export function fixedForcedInstallationSnapshot(slot,changedPins,newPins){
 assert.ok(['before','after'].includes(slot));assert.equal(changedPins.length,6);assert.equal(newPins.length,3);
 let s=ownerProgramInstallationSnapshot(slot).replaceAll('municontrol_owner_program190.',prefix);
 const table='public.municipal_owner_program_provenance';
 // Everything installed by190 is now prior state, including its immutable rows.
 s=once(s," AND relation.oid IS DISTINCT FROM to_regclass('"+table+"')",'');
 const relation="c.oid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_index ledger_index WHERE ledger_index.indexrelid=c.oid AND ledger_index.indrelid=to_regclass('"+table+"'))";
 assert.equal(s.split(relation).length,3);s=s.replaceAll(relation,'true');
 const trigger="t.tgrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT(t.tgisinternal AND EXISTS(SELECT 1 FROM pg_constraint ledger_fk WHERE ledger_fk.oid=t.tgconstraint AND ledger_fk.contype='f' AND ledger_fk.conrelid=to_regclass('"+table+"')))";
 s=once(s,trigger,'true');
 s=once(s," AND t.typrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_type ledger_type WHERE ledger_type.oid=t.typelem AND ledger_type.typrelid=to_regclass('"+table+"'))",'');
 s=once(s," AND c.oid IS DISTINCT FROM to_regclass('"+table+"')",'');
 s=once(s,"p.oid=to_regprocedure('public.own_program_command_v1(jsonb,jsonb,uuid)')",'p.oid IN('+ids(changedPins)+')');
 // IS DISTINCT FROM is intentional: before installation these OIDs are NULL.
 // NOT IN(NULL,...) would silently omit all prior functions from conservation.
 s=once(s,"NOT(ns.nspname='public' AND left(p.proname,24)='municipal_owner_program_')",newPins.map(p=>'p.oid IS DISTINCT FROM to_regprocedure('+q(p.signature)+')').join(' AND '));
 return s;
}
const readonly=`DO $readonly$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'on' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'FIXED_FORCED_INSTALL_READONLY_REQUIRED';END IF;END $readonly$`;
const writable=`DO $transaction$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'FIXED_FORCED_INSTALL_TRANSACTION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132190);PERFORM pg_advisory_xact_lock(196);END $transaction$`;
const readiness="DO $readiness$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $readiness$";
const noHistory=`DO $history$ BEGIN
 IF EXISTS(SELECT 1 FROM public.own_payroll_program_event WHERE body->'program' ? 'fixedForcedAmountsVersion' OR body->'program' ? 'fixedForcedAmountsPolicy' OR base_definition ? 'fixedForcedAmountsVersion' OR base_definition ? 'fixedForcedAmountsPolicy')
 OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture WHERE payload#>'{programState,program,definition}' ? 'fixedForcedAmountsVersion' OR payload#>'{programState,program,definition}' ? 'fixedForcedAmountsPolicy')
 OR EXISTS(SELECT 1 FROM public.own_payroll_run_result WHERE input ? 'fixedForcedAmountsVersion' OR input ? 'fixedForcedAmountsPolicy' OR EXISTS(SELECT 1 FROM jsonb_array_elements(input->'employees') e WHERE e ? 'fixedForcedAmounts'))
 THEN RAISE EXCEPTION 'FIXED_FORCED_INSTALL_ROLLBACK_HAS_HISTORY';END IF;END $history$`;

export function buildOwnFixedForcedAmountInstallation(options){
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(['pre107','published107'].includes(options.operationalPairBaseline),'FIXED_FORCED_INSTALL_BASELINE_REQUIRED');
 const sourceHashes={},cache=new Map(),read=p=>{if(!cache.has(p)){const s=options.read(p).replace(/\r\n?/g,'\n');sourceHashes[p]=hash(s);cache.set(p,s);}return cache.get(p);};
 const source=read(FIXED_FORCED_INSTALL_SQL);assert.equal(hash(source),FIXED_FORCED_INSTALL_SQL_SHA256,'FIXED_FORCED_INSTALL_SQL_CHANGED');
 const mutations=splitPostgresStatements(source),definitions=functions(source);assert.equal(definitions.length,9);
 assert.ok(mutations.every(s=>!/^\s*(?:INSERT|UPDATE|DELETE|GRANT|ALTER|DROP|CREATE\s+(?:TABLE|ROLE))\b/i.test(s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,''))),'FIXED_FORCED_INSTALL_UNEXPECTED_OPERATION');
 const originals=[];
 for(const[file,sha,names]of SOURCE){const s=read(file);assert.equal(hash(s),sha,'FIXED_FORCED_INSTALL_PRIOR_SOURCE_CHANGED:'+file);for(const name of names){const found=functions(s).filter(d=>pin(d).name===name);assert.equal(found.length,1);originals.push(found[0]);}}
 const beforePins=originals.map(d=>pin(d,runtime.has(pin(d).name))),oldNames=new Set(beforePins.map(p=>p.name));assert.equal(oldNames.size,6);
 const adapted=definitions.filter(d=>oldNames.has(pin(d).name)),newDefinitions=definitions.filter(d=>!oldNames.has(pin(d).name));
 assert.equal(adapted.length,6);assert.ok(adapted.every(d=>/^CREATE OR REPLACE FUNCTION /.test(d)),'FIXED_FORCED_INSTALL_REPLACE_REQUIRED');
 assert.deepEqual(newDefinitions.map(d=>pin(d).name).sort(),[...newNames].sort(),'FIXED_FORCED_INSTALL_NEW_SET_CHANGED');
 const newPins=newDefinitions.map(d=>pin(d,false)),afterPins=beforePins.map(old=>{const found=adapted.filter(d=>pin(d).name===old.name);assert.equal(found.length,1);const value=pin(found[0],old.runtime);assert.deepEqual({...old,sha256:null},{...value,sha256:null},'FIXED_FORCED_INSTALL_HEADER_CHANGED');return value;});
 const expectedRevokes=new Set(newPins.map(p=>'REVOKE ALL ON FUNCTION '+p.signature+' FROM PUBLIC,municontrol_actions_runtime_app'));
 const other=mutations.filter(s=>!functions(s).length).map(s=>s.replace(/;\s*$/,'').trim());assert.equal(other.length,newPins.length);assert.deepEqual(new Set(other),expectedRevokes,'FIXED_FORCED_INSTALL_ACL_CHANGED');
 for(const file of['scripts/lib/own-fixed-forced-amount-installation.mjs','scripts/lib/installation-prior-metadata.mjs','assets/own-payroll-engine.js','assets/own-payroll-program-model.js','assets/own-payroll-program-precision.js','lib/own-payroll-approved-input.js','lib/own-payroll-programme-source-preparation.js','lib/internal-own-payroll-run.js','lib/internal-own-payroll-program.js'])read(file);
 const previous=buildMunicipalOwnerProgramInstallation({read,sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline});
 let composed=previous.afterCheck;
 for(let n=0;n<beforePins.length;n++)composed=once(composed,beforePins[n].sha256,afterPins[n].sha256);
 // Readiness is preserved, not bypassed or repinned to a weaker body. Future
 // source changes that make it pin a changed target require separate review.
 for(const p of beforePins)assert.equal(previous.ready.includes(p.sha256),false,'FIXED_FORCED_INSTALL_READINESS_DEPENDENCY_CHANGED');
 const beforeCheck=previous.afterCheck+';'+pinsCheck(beforePins,'FIXED_FORCED_INSTALL_PRIOR_CHANGED')+';'+familyState(0);
 const afterCheck=composed+';'+pinsCheck([...afterPins,...newPins],'FIXED_FORCED_INSTALL_FUNCTION_CHANGED')+';'+familyState(newPins.length);
 const before=fixedForcedInstallationSnapshot('before',beforePins,newPins),after=fixedForcedInstallationSnapshot('after',beforePins,newPins);
 const matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
 const mode=`DO $mode$ BEGIN IF ${familyCount}=0 AND ${matches(beforePins)} THEN PERFORM set_config('${prefix}mode','install',true);ELSIF ${familyCount}=${newPins.length} AND ${matches(afterPins)} THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'FIXED_FORCED_INSTALL_PARTIAL_STATE';END IF;END $mode$`;
 const requireMode=expected=>`DO $phase$ BEGIN IF current_setting('${prefix}mode')<>${q(expected)} THEN RAISE EXCEPTION 'FIXED_FORCED_INSTALL_PHASE_CHANGED';END IF;END $phase$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}END IF;END $apply$`;
 const audit=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'FIXED_FORCED_INSTALL_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objectFingerprint=pins=>"encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+ids(pins)+"))::text,'sha256'),'hex')";
 const proof=(phase,preserved,rollback=false)=>`SELECT jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'operationalPairBaseline',${q(options.operationalPairBaseline)},'mode',${phase},'newTables',0,'newFunctions',${rollback?0:newPins.length},'adaptedFunctions',${rollback?0:afterPins.length},'businessWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',${objectFingerprint(rollback?beforePins:[...afterPins,...newPins])}) AS proof`;
 const phase=expected=>[writable,mode,requireMode(expected),choose,before,apply,afterCheck,readiness,after,audit,proof("current_setting('"+prefix+"mode')",true)];
 const restore=originals.toReversed().map(d=>d.replace(/^CREATE (?:OR REPLACE )?FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 const rollback=[writable,afterCheck,noHistory,before,...restore,...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),beforeCheck,readiness,after,audit,proof("'rollback'",true,true)];
 return{version:VERSION,sourceCommit:options.sourceCommit,sourceHashes,operationalPairBaseline:options.operationalPairBaseline,previous,originals,beforePins,afterPins,newDefinitions,newPins,adapted,mutations,beforeCheck,afterCheck,before,after,mode,choose,apply,audit,readiness,noHistory,rollback,rollbackVerification:[readonly,beforeCheck,readiness,after,proof("'rollback_verify'",false,true)],rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[readonly,afterCheck,readiness,after,proof("'verify'",false)],connects:false,executesSql:false};
}

function receipts(values,batch,rollback){
 const keys=['version','sourceCommit','sourceHashes','operationalPairBaseline','mode','newTables','newFunctions','adaptedFunctions','businessWrites','iamWrites','existingAclChanges','nominalRowsReturned','transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const[value,mode,preserved]of values){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Reflect.ownKeys(value).sort(),keys);assert.equal(value.version,batch.version);assert.equal(value.sourceCommit,batch.sourceCommit);assert.deepEqual(value.sourceHashes,batch.sourceHashes);assert.equal(value.operationalPairBaseline,batch.operationalPairBaseline);assert.equal(value.mode,mode);assert.equal(value.transactionDataPreserved,preserved);for(const[k,v]of Object.entries({newTables:0,newFunctions:rollback?0:batch.newPins.length,adaptedFunctions:rollback?0:batch.afterPins.length,businessWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0}))assert.equal(value[k],v);for(const k of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(value[k],/^[a-f0-9]{64}$/);for(const k of['priorMetadataSha256','objectSha256'])assert.equal(value[k],values[0][0][k]);}
 return{passed:true,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,priorMetadataPreserved:true,objectsDurable:true,wholeDatabaseStaticAcrossConnections:false,businessWrites:0};
}
export function assertOwnFixedForcedAmountDurability({installed,durable,repeated,batch}){return receipts([[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]],batch,false);}
export function assertOwnFixedForcedAmountRollback({rolledBack,durable,batch}){return receipts([[rolledBack,'rollback',true],[durable,'rollback_verify',false]],batch,true);}
