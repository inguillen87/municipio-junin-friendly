// PRIVATE SOURCE PLAN ONLY. Not imported, parsed, executed, installed or admitted.
// Canonical guarded196[/197] successor. No connection, CLI or business command.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildMonthlyDayFixedCompositionInstallation} from './own-monthly-day-fixed-composition-installation.mjs';
import {buildOwnNoveltySuccessionInstallation} from './own-novelty-succession-installation.mjs';
import {ownerProgramInstallationSnapshot} from './municipal-owner-program-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';

export const OWN_MONETARY_INSTALLATION_SOURCES=Object.freeze({
 verifier:{path:'scripts/sql/own-monetary-manifest.sql',sha256:'e5a011238fe0bf7b204a9ec527158a5fa5b48a48c4a6a513749e3ee2b24cc237'},
 definition:{path:'scripts/sql/own-monetary-program-definition.sql',sha256:'fcd076b5e2532371b7871ed0a5a2b7c1a14ccbc093abedf1eae1f8a8aff03529'},
 command:{path:'scripts/sql/own-monetary-program-command-core.sql',sha256:'c2090eacfdbe060d35a32d0b8dffb6e7d8ea688998974240751614115a34bc2f'},
 schema:{path:'assets/own-payroll-program-model.js',sha256:'f4b3101fb8cf050dbe8f11fb61b46065706c7a7e231a52cf126019f04d9701a8'},
 policy:{path:'assets/own-payroll-monetary-policy.js',sha256:'a4979613ccb5f21cfa5aff49cfe07fda593f657cb112587f1d0f712eca09c09c'},
 javascriptDriver:{path:'lib/own-payroll-monetary-verification.js',sha256:'0c0e1bf1dd7ed1047b35ef4d0218a6e030ac0172036d48b6f06c4946d85135d4'},
 javascriptManifest:{path:'assets/own-payroll-monetary-manifest.js',sha256:'70f67119f767586c050fe200303528d1f4a3f18e195326d2312e25d25b005b3b'},
 javascriptExact:{path:'assets/own-payroll-exact.js',sha256:'975d7192e2b407ba149bff185fae6bd60ed85f085ac48e788c432e97d1855666'},
 javascriptCatalogue:{path:'assets/native-salary-catalog-model.js',sha256:'0277d8e93a362e4bdfd3f2b698d84b6903ef2bb7f774d932423e2088dcfea908'},
});
const PUBLIC_PINS=Object.freeze({
 'scripts/lib/own-monthly-day-fixed-composition-installation.mjs':'cb5811ef8e7614c3dfc05ff4e9de16e05abb64a1c013a30000f3ec16405771de',
 'scripts/lib/own-novelty-succession-installation.mjs':'627ffea8e252311f31b87abe46346bd76578e583de34b606a74aa53eacb494d0',
 'scripts/lib/municipal-owner-program-installation.mjs':'177c245ad93288ce223e5f65eb71bfe4dd6cc9e8b8e83dcb2a1f63377c9bdd1e',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/lib/installation-prior-metadata.mjs':'b86d85a76a3c61bf963f61b9a991df65b1caec6056a74fe0c7396db4e808f8c9',
 'scripts/lib/sql-statements.mjs':'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2',
});
const VERSION='own-monetary-program-guarded-installation.v2',prefix='municontrol_monetary_install.';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const lf=v=>v.replace(/\r\n?/g,'\n'),clean=v=>v.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const normalized=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0,'MONETARY_INSTALL_FUNCTION_BODY_REQUIRED');return d.slice(0,at).replace(/SET search_path TO 'pg_catalog',\s*'public',\s*'pg_temp'/g,'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:(?:"TimeZone"|timezone) TO|timezone=)\s*'UTC'/g,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);};
const pin=d=>({...ownInstallationFunctionPin(normalized(d)),runtime:false});
const definitions=text=>splitPostgresStatements(text).flatMap(d=>{const at=d.search(/\bCREATE(?: OR REPLACE)? FUNCTION public\./);return at<0?[]:[d.slice(at)];});
const helperNames=Object.freeze(['fields','reference','json_guard','hash','rounding','nodes','verify'].map(s=>'own_monetary_manifest_'+s+'_v1'));
const targetNames=Object.freeze(['own_program_definition_v1','municipal_owner_program_command_core_v1']);
const ids=pins=>pins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
const once=(text,from,to)=>{assert.equal(text.split(from).length,2,'MONETARY_INSTALL_SNAPSHOT_ANCHOR_CHANGED:'+from.slice(0,80));return text.replace(from,()=>to);};

// Only complete source metadata rows can change, and only their prosrc digests.
// This projection is canonical-public SQL; it is NOT the still-missing QA schema projection.
function composePins(text,beforePins,afterPins){
 const counts=beforePins.map(()=>0);
 const value=text.replace(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g,(whole,literal)=>{
  let rows;try{rows=JSON.parse(literal.replaceAll("''","'"));}catch{return whole;}if(!Array.isArray(rows))return whole;
  let changed=false;const next=rows.map(row=>{const i=beforePins.findIndex(p=>p.signature===row?.signature);if(i<0)return row;assert.deepEqual(row,beforePins[i],'MONETARY_INSTALL_ANCESTOR_METADATA_CHANGED');counts[i]++;changed=true;return{...row,sha256:afterPins[i].sha256};});
  return changed?'jsonb_array_elements('+q(JSON.stringify(next))+'::jsonb)':whole;
 });return{value,counts};
}
// Every pre-existing row and security/metadata object is retained. Exclude ONLY
// the two reviewed changed bodies and seven genuinely new helper objects.
function snapshot(slot,beforePins,newPins){
 assert.ok(['before','after'].includes(slot));assert.equal(beforePins.length,2);assert.equal(newPins.length,7);
 let s=ownerProgramInstallationSnapshot(slot).replaceAll('municontrol_owner_program190.',prefix);
 const table='public.municipal_owner_program_provenance';
 s=once(s," AND relation.oid IS DISTINCT FROM to_regclass('"+table+"')",'');
 const relation="c.oid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_index ledger_index WHERE ledger_index.indexrelid=c.oid AND ledger_index.indrelid=to_regclass('"+table+"'))";
 assert.equal(s.split(relation).length,3);s=s.replaceAll(relation,'true');
 s=once(s,"t.tgrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT(t.tgisinternal AND EXISTS(SELECT 1 FROM pg_constraint ledger_fk WHERE ledger_fk.oid=t.tgconstraint AND ledger_fk.contype='f' AND ledger_fk.conrelid=to_regclass('"+table+"')))",'true');
 s=once(s," AND t.typrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_type ledger_type WHERE ledger_type.oid=t.typelem AND ledger_type.typrelid=to_regclass('"+table+"'))",'');
 s=once(s," AND c.oid IS DISTINCT FROM to_regclass('"+table+"')",'');
 s=once(s,"p.oid=to_regprocedure('public.own_program_command_v1(jsonb,jsonb,uuid)')",'p.oid IN('+ids(beforePins)+')');
 s=once(s,"NOT(ns.nspname='public' AND left(p.proname,24)='municipal_owner_program_')",newPins.map(p=>'p.oid IS DISTINCT FROM to_regprocedure('+q(p.signature)+')').join(' AND '));
 // Retain every extra catalogue family of the guarded197 predecessor. There is
 // no new index here:197's index and eight helpers are ALL prior objects. Only
 // outgoing rows owned by these seven new monetary helpers may be excluded;
 // an old object's incoming edge to a new helper must remain in conservation.
 const ownedNew=(alias,shared=false)=>'('+alias+".classid='pg_proc'::regclass AND "+alias+'.objid IN('+ids(newPins)+'))'+(shared?' AND '+alias+".dbid=(SELECT oid FROM pg_database WHERE datname=current_database())":'');
 const ownAnnotation=alias=>'('+alias+".classoid='pg_proc'::regclass AND "+alias+'.objoid IN('+ids(newPins)+'))';
 const extras=",\n 'dependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_depend d WHERE NOT coalesce("+ownedNew('d')+",false)),\n 'sharedDependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype) FROM pg_shdepend d WHERE NOT coalesce("+ownedNew('d',true)+",false)),\n 'descriptions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid) FROM pg_description d WHERE NOT coalesce("+ownAnnotation('d')+",false)),\n 'securityLabels',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid,d.provider) FROM pg_seclabel d WHERE NOT coalesce("+ownAnnotation('d')+",false)),\n 'rewrites',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_rewrite d),\n 'extensions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_extension d)";
 s=once(s,') INTO result;',extras+') INTO result;');
 assert.equal(s.includes("to_regclass('"+table+"')"),false,'MONETARY_INSTALL_OLD190_EXCLUSION_REMAINED');
 return s;
}
const familyCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,22)='own_monetary_manifest_')";
const family=n=>`DO $family$ BEGIN IF ${familyCount}<>${n} THEN RAISE EXCEPTION 'MONETARY_INSTALL_HELPER_FAMILY_CHANGED';END IF;END $family$`;
const matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
const noHistory=`DO $history$ BEGIN
 IF EXISTS(SELECT 1 FROM public.own_payroll_program_event WHERE body->'program' ? 'monetaryPolicyVersion' OR body->'program' ? 'monetaryPolicy' OR base_definition ? 'monetaryPolicyVersion' OR base_definition ? 'monetaryPolicy')
 OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture WHERE payload#>'{programState,program,definition}' ? 'monetaryPolicyVersion' OR payload#>'{programState,program,definition}' ? 'monetaryPolicy')
 OR EXISTS(SELECT 1 FROM public.own_payroll_run_result WHERE input ? 'monetaryPolicyVersion' OR input ? 'monetaryPolicy')
 THEN RAISE EXCEPTION 'MONETARY_INSTALL_ROLLBACK_HAS_HISTORY';END IF;END $history$`;

export function buildOwnMonetaryGuardedInstallation(options){
 assert.deepEqual(Object.keys(options??{}).sort(),['noveltySuccession','operationalPairBaseline','prerequisiteDefinitions','prerequisiteRuntime','read','sourceCommit']);
 assert.equal(typeof options.read,'function');assert.equal(typeof options.noveltySuccession,'boolean');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(['pre107','published107'].includes(options.operationalPairBaseline));
 const sourceHashes={},cache=new Map(),read=file=>{if(!cache.has(file)){const s=lf(options.read(file));sourceHashes[file]=hash(s);cache.set(file,s);}return cache.get(file);};
 for(const[file,expected]of Object.entries(PUBLIC_PINS))assert.equal(hash(read(file)),expected,'MONETARY_INSTALL_PUBLIC_SOURCE_CHANGED:'+file);
 for(const source of Object.values(OWN_MONETARY_INSTALLATION_SOURCES))assert.equal(hash(read(source.path)),source.sha256,'MONETARY_INSTALL_SELECTED_SOURCE_CHANGED:'+source.path);
 const priorOptions={read,sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline,prerequisiteDefinitions:options.prerequisiteDefinitions,prerequisiteRuntime:options.prerequisiteRuntime};
 const fixed=buildMonthlyDayFixedCompositionInstallation(priorOptions),previous=options.noveltySuccession?buildOwnNoveltySuccessionInstallation(priorOptions):fixed;
 assert.equal(previous.run7Included,false);assert.equal(fixed.run7Included,false);
 const originals=targetNames.map(name=>{const found=fixed.adapted.filter(d=>pin(d).name===name);assert.equal(found.length,1,'MONETARY_INSTALL_CANONICAL196_TARGET_REQUIRED');return found[0];});
 const beforePins=originals.map(pin);assert.ok(beforePins.every(p=>!p.runtime));
 const verifier=splitPostgresStatements(read(OWN_MONETARY_INSTALLATION_SOURCES.verifier.path)).map(clean),definition=splitPostgresStatements(read(OWN_MONETARY_INSTALLATION_SOURCES.definition.path)).map(clean),command=splitPostgresStatements(read(OWN_MONETARY_INSTALLATION_SOURCES.command.path)).map(clean);
 const newDefinitions=definitions(read(OWN_MONETARY_INSTALLATION_SOURCES.verifier.path)),adapted=[...definitions(read(OWN_MONETARY_INSTALLATION_SOURCES.definition.path)),...definitions(read(OWN_MONETARY_INSTALLATION_SOURCES.command.path))];
 assert.deepEqual(newDefinitions.map(d=>pin(d).name),helperNames);assert.ok(newDefinitions.every(d=>d.startsWith('CREATE FUNCTION ')));assert.deepEqual(adapted.map(d=>pin(d).name),targetNames);assert.ok(adapted.every(d=>d.startsWith('CREATE OR REPLACE FUNCTION ')));
 const newPins=newDefinitions.map(pin),afterPins=adapted.map(pin);for(let i=0;i<2;i++)assert.deepEqual({...beforePins[i],sha256:null},{...afterPins[i],sha256:null},'MONETARY_INSTALL_EXISTING_HEADER_CHANGED');
 const mutations=[...verifier,...definition,...command];assert.equal(mutations.length,11,'MONETARY_INSTALL_STATEMENT_SET_CHANGED');
 const acl=mutations.filter(s=>!definitions(s).length).map(s=>s.replace(/;\s*$/,'').trim());
 assert.deepEqual(acl,['REVOKE ALL ON FUNCTION '+newPins.map(p=>p.signature).join(',')+' FROM PUBLIC,municontrol_actions_runtime_app','REVOKE ALL ON FUNCTION public.own_program_definition_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app'],'MONETARY_INSTALL_ACL_SET_CHANGED');
 assert.ok(mutations.every(s=>/^(?:CREATE(?: OR REPLACE)? FUNCTION |REVOKE ALL ON FUNCTION )/.test(s)),'MONETARY_INSTALL_UNEXPECTED_DDL');
 const beforeCheck=previous.afterCheck+';'+pinsCheck(beforePins,'MONETARY_INSTALL_PRIOR_METADATA')+';'+family(0),projection=composePins(previous.afterCheck,beforePins,afterPins);
 for(const n of projection.counts)assert.ok(n>0,'MONETARY_INSTALL_ANCESTOR_PIN_MISSING');assert.equal(composePins(projection.value,afterPins,beforePins).value,previous.afterCheck,'MONETARY_INSTALL_ANCESTOR_INVERSE_CHANGED');
 const afterCheck=projection.value+';'+pinsCheck([...afterPins,...newPins],'MONETARY_INSTALL_AFTER_METADATA')+';'+family(7);
 for(const p of beforePins)assert.equal(afterCheck.includes(p.sha256),false,'MONETARY_INSTALL_STALE_PRIOR_PIN');
 const ready=options.noveltySuccession?previous.ready:fixed.days.adapted.find(d=>pin(d).name==='municipal_adoption_ready_v1');assert.ok(ready,'MONETARY_INSTALL_READY_SOURCE_REQUIRED');
 for(const p of beforePins)assert.equal(ready.includes(p.sha256),false,'MONETARY_INSTALL_READY_REPIN_REQUIRES_REVIEW');
 const before=snapshot('before',beforePins,newPins),after=snapshot('after',beforePins,newPins);
 // Preserve the selected predecessor's technical lock order, including197
 // before196 when enabled. Never append197 after holding196.
 const locks=options.noveltySuccession?[197,196,194,193,192,190]:[196,194,193,192];
 const transaction=readOnly=>`DO $transaction$ BEGIN IF current_setting('standard_conforming_strings')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'MONETARY_INSTALL_TRANSACTION_REQUIRED';END IF;${readOnly?'':locks.map(n=>'PERFORM pg_advisory_xact_lock('+n+');').join('')}END $transaction$`;
 const mode=`DO $mode$ BEGIN IF ${familyCount}=0 AND ${matches(beforePins)} THEN PERFORM set_config('${prefix}mode','install',true);ELSIF ${familyCount}=7 AND ${matches(afterPins)} THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'MONETARY_INSTALL_PARTIAL_OR_FOREIGN_BASELINE';END IF;END $mode$`;
 const expected=m=>`DO $phase$ BEGIN IF current_setting('${prefix}mode')<>${q(m)} THEN RAISE EXCEPTION 'MONETARY_INSTALL_PHASE_CHANGED';END IF;END $phase$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}END IF;END $apply$`;
 const readiness="DO $readiness$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $readiness$",conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'MONETARY_INSTALL_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objects=pins=>"encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+ids(pins)+"))::text,'sha256'),'hex')";
 const proof=(m,preserved,reversed=false)=>`SELECT jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'operationalPairBaseline',${q(options.operationalPairBaseline)},'noveltySuccession',${options.noveltySuccession},'mode',${m},'newTables',0,'newFunctions',${reversed?0:7},'adaptedFunctions',${reversed?0:2},'businessWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',${objects(reversed?beforePins:[...afterPins,...newPins])}) AS proof`;
 const phase=m=>[transaction(false),mode,expected(m),choose,before,apply,afterCheck,readiness,after,conservation,proof("current_setting('"+prefix+"mode')",true)];
 const rollback=[transaction(false),mode,expected('verify'),afterCheck,noHistory,before,...originals.toReversed().map(d=>d.replace(/^CREATE (?:OR REPLACE )?FUNCTION /,'CREATE OR REPLACE FUNCTION ')),...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),beforeCheck,readiness,after,conservation,proof("'rollback'",true,true)];
 return{version:VERSION,sourceCommit:options.sourceCommit,sourceHashes,operationalPairBaseline:options.operationalPairBaseline,noveltySuccession:options.noveltySuccession,previous,fixed,originals,beforePins,adapted,afterPins,newDefinitions,newPins,mutations,beforeCheck,afterCheck,projectionLedger:beforePins.map((p,i)=>({signature:p.signature,beforeSha256:p.sha256,afterSha256:afterPins[i].sha256,occurrences:projection.counts[i]})),before,after,mode,choose,apply,readiness,conservation,noHistory,rollback,rollbackVerification:[transaction(true),beforeCheck,readiness,after,proof("'rollback_verify'",false,true)],rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[transaction(true),afterCheck,readiness,after,proof("'verify'",false)],requiredBeforeRunnerLine:58,requiredAfterRunnerLine:77,qaProjectionImplemented:false,sourcePromotionAdmitted:false,executionAdmitted:false,connects:false,executesSql:false,complete:false,run7Included:false};
}

// Must be called after the real runner77 protocol, never during source planning.
export function requireOwnMonetaryInstallationEpoch({technicalEpochs,batch}){
 assert.equal(batch?.version,VERSION,'MONETARY_INSTALL_BATCH_PROTOCOL_CHANGED');
 assert.equal(technicalEpochs?.passed,true,'MONETARY_INSTALL_TECHNICAL_EPOCHS_REQUIRED');const p=technicalEpochs.proofs;
 for(const[label,expected]of[['sql196DaysReinstalled',batch.fixed],...(batch.noveltySuccession?[['sql197Reinstalled',batch.previous]]:[])]){assert.equal(p?.[label]?.durability?.passed,true,'MONETARY_INSTALL_REINSTALL_DURABILITY_REQUIRED:'+label);assert.equal(p[label].installed.sourceCommit,batch.sourceCommit);assert.deepEqual(p[label].installed.sourceHashes,expected.sourceHashes);}
 assert.deepEqual(p.helperAcl,{days:false,ledger:false});return true;
}
function receipts(values,batch,reversed){
 assert.equal(batch?.version,VERSION,'MONETARY_INSTALL_BATCH_PROTOCOL_CHANGED');
 const counters={newTables:0,newFunctions:reversed?0:7,adaptedFunctions:reversed?0:2,businessWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0};
 const keys=['version','sourceCommit','sourceHashes','operationalPairBaseline','noveltySuccession','mode',...Object.keys(counters),'transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const[v,m,preserved]of values){assert.deepEqual(Object.keys(v??{}).sort(),keys);assert.equal(v.version,VERSION,'MONETARY_INSTALL_RECEIPT_PROTOCOL_CHANGED');assert.equal(v.sourceCommit,batch.sourceCommit);assert.deepEqual(v.sourceHashes,batch.sourceHashes);assert.equal(v.operationalPairBaseline,batch.operationalPairBaseline);assert.equal(v.noveltySuccession,batch.noveltySuccession);assert.equal(v.mode,m);assert.equal(v.transactionDataPreserved,preserved);for(const[k,n]of Object.entries(counters))assert.equal(v[k],n);for(const k of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(v[k],/^[a-f0-9]{64}$/);for(const k of['priorMetadataSha256','objectSha256'])assert.equal(v[k],values[0][0][k]);}
 return{passed:true,technicalWritesOnly:true,priorMetadataPreserved:true,objectsDurable:true,wholeDatabaseStaticAcrossConnections:false,businessWrites:0,monetaryProgrammeApproved:false};
}
export const assertOwnMonetaryInstallationDurability=({installed,durable,repeated,batch})=>receipts([[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]],batch,false);
export const assertOwnMonetaryInstallationRollback=({rolledBack,durable,batch})=>receipts([[rolledBack,'rollback',true],[durable,'rollback_verify',false]],batch,true);
