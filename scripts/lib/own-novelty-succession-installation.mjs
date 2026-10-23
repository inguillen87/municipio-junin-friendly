// Source-only technical plan. This module never opens a connection or executes SQL.
// Required predecessor: the exact guarded190/192/193/194/196 composition.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildMonthlyDayFixedCompositionInstallation} from './own-monthly-day-fixed-composition-installation.mjs';
import {buildOwnCloseSql} from './own-payroll-close-sql.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownerProgramInstallationSnapshot} from './municipal-owner-program-installation.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
import {ownNoveltySuccessionFunctionPin,composeOwnNoveltySuccessionPins,composeOwnNoveltySuccessionObjectCounts,composeOwnNoveltySuccessionReadiness} from './own-novelty-succession-metadata.mjs';

export const NOVELTY197_SQL='scripts/migrations/197-own-novelty-succession.sql';
export const NOVELTY197_SHA256='13ad516bfd653a03b5fae8987486abeef1c13a5d629264b0c680d57c5a5bb43c';
export const NOVELTY197_METADATA_SHA256='cb9b87bfd695a67f978dee540c3fef3bd3eb0256cfdfdac0adc998c97a56b845';
const VERSION='own-novelty-succession-installation.v1',prefix='municontrol_novelty197.',index='public.own_novelty_approved_successor_uk';
const hash=v=>createHash('sha256').update(v).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const oldNames=Object.freeze(['own_novelty_command_v1','own_novelty_conflict_v1','own_novelty_sources_v1','own_liquidation_rows_v1','own_liquidation_state_v1','own_liquidation_command_v1']);
const helperNames=Object.freeze(['own_novelty_active_v1','own_novelty_effective_v1','own_novelty_affected_state_v1','own_novelty_succession_validate_v1','own_novelty_content_v3','own_novelty_capture_source_state_v1','own_novelty_capture_current_v1','own_novelty_succession_context_v1']);
const supportNames=Object.freeze(['own_novelty_context_v1','own_novelty_current_v1','own_novelty_rows_v1','own_novelty_content_v1','own_novelty_view_v1','own_novelty_receipt_v1','own_novelty_lock_v1','own_novelty_destination_lock_v1','own_novelty_immutable_v1','own_novelty_legacy_row_v1','own_run_context_v1','own_run_lock_v1','own_run_hash_v1','own_close_active_v1','own_close_guard_v1','own_liquidation_current_v1']);
const runtimeNames=new Set(['own_novelty_command_v1','own_liquidation_command_v1','own_novelty_succession_context_v1']);
const canonicalSources=Object.freeze({
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/migrations/124-own-payroll-liquidation-decisions.sql':'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a',
 'scripts/migrations/125-own-payroll-close.sql':'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',
 'scripts/migrations/130-own-bulk-novelties.sql':'27bfed41ea1449b964fc8719c4d71a145ba9693b9c86086e2fa5db2fd14a9e4d',
 'scripts/migrations/176-own-payroll-administrative-operator.sql':'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732',
 'scripts/lib/own-payroll-close-sql.mjs':'b30aa8751521a4df39f43b76ecc521308a9a0f8f158757a7c4c7e84e30f833f7',
 'scripts/lib/own-novelty-succession-metadata.mjs':NOVELTY197_METADATA_SHA256
});
// Normalize only headers, preserving the exact AS-body source hash.
export function ownNoveltySuccessionHeader(definition){
 const at=definition.search(/\bAS\s+\$/);assert.ok(at>0,'NOVELTY197_BODY_REQUIRED');
 return definition.slice(0,at).replace(/SET search_path TO 'pg_catalog',\s*'public',\s*'pg_temp'/g,'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/gi,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+definition.slice(at);
}
const pin=(definition,runtime)=>{const p=ownNoveltySuccessionFunctionPin(ownNoveltySuccessionHeader(definition));return{...p,runtime:runtime??runtimeNames.has(p.name)};};
const functions=source=>splitPostgresStatements(source).map(clean).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(s));
const ids=pins=>pins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'NOVELTY197_SNAPSHOT_ANCHOR_CHANGED:'+from.slice(0,90));return source.replace(from,()=>to);};

// Restore ALL old190 exclusions first. Only exact new object OIDs and the seven
// prosrc fields are then excluded; incoming dependencies from old objects stay.
export function ownNoveltySuccessionSnapshot(slot,beforePins,newPins){
 assert.ok(['before','after'].includes(slot));assert.equal(beforePins.length,7);assert.equal(newPins.length,8);
 const table='public.municipal_owner_program_provenance',newIndex='to_regclass('+q(index)+')';
 const newProcConditions=newPins.map(p=>'p.oid IS DISTINCT FROM to_regprocedure('+q(p.signature)+')').join(' AND ');
 let sql=ownerProgramInstallationSnapshot(slot).replaceAll('municontrol_owner_program190.',prefix);
 sql=once(sql," AND relation.oid IS DISTINCT FROM to_regclass('"+table+"')",'');
 const priorRelation="c.oid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_index ledger_index WHERE ledger_index.indexrelid=c.oid AND ledger_index.indrelid=to_regclass('"+table+"'))";
 assert.equal(sql.split(priorRelation).length,3);sql=sql.replaceAll(priorRelation,'c.oid IS DISTINCT FROM '+newIndex);
 const priorTrigger="t.tgrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT(t.tgisinternal AND EXISTS(SELECT 1 FROM pg_constraint ledger_fk WHERE ledger_fk.oid=t.tgconstraint AND ledger_fk.contype='f' AND ledger_fk.conrelid=to_regclass('"+table+"')))";
 sql=once(sql,priorTrigger,'true');
 sql=once(sql," AND t.typrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_type ledger_type WHERE ledger_type.oid=t.typelem AND ledger_type.typrelid=to_regclass('"+table+"'))",'');
 sql=once(sql," AND c.oid IS DISTINCT FROM to_regclass('"+table+"')",' AND i.indexrelid IS DISTINCT FROM '+newIndex);
 sql=once(sql,'FROM pg_index i WHERE i.indrelid=snapshot_relation.oid','FROM pg_index i WHERE i.indrelid=snapshot_relation.oid AND i.indexrelid IS DISTINCT FROM '+newIndex);
 sql=once(sql,"p.oid=to_regprocedure('public.own_program_command_v1(jsonb,jsonb,uuid)')",'p.oid IN('+ids(beforePins)+')');
 sql=once(sql,"NOT(ns.nspname='public' AND left(p.proname,24)='municipal_owner_program_')",'('+newProcConditions+')');
 const ownedNew=(alias,shared=false)=>'(('+alias+".classid='pg_proc'::regclass AND "+alias+'.objid IN('+ids(newPins)+')) OR('+alias+".classid='pg_class'::regclass AND "+alias+'.objid='+newIndex+'))'+(shared?' AND '+alias+".dbid=(SELECT oid FROM pg_database WHERE datname=current_database())":'');
 const extras=",\n 'dependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_depend d WHERE NOT coalesce("+ownedNew('d')+",false)),\n 'sharedDependencies',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype) FROM pg_shdepend d WHERE NOT coalesce("+ownedNew('d',true)+",false)),\n 'descriptions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid) FROM pg_description d WHERE NOT coalesce((d.classoid='pg_proc'::regclass AND d.objoid IN("+ids(newPins)+")) OR(d.classoid='pg_class'::regclass AND d.objoid="+newIndex+"),false)),\n 'securityLabels',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.classoid,d.objoid,d.objsubid,d.provider) FROM pg_seclabel d WHERE NOT coalesce((d.classoid='pg_proc'::regclass AND d.objoid IN("+ids(newPins)+")) OR(d.classoid='pg_class'::regclass AND d.objoid="+newIndex+"),false)),\n 'rewrites',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_rewrite d),\n 'extensions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_extension d)";
 sql=once(sql,') INTO result;',extras+') INTO result;');
 assert.equal(sql.includes("to_regclass('"+table+"')"),false,'NOVELTY197_OLD190_EXCLUSION_REMAINED');
 return sql;
}

// A predecessor's afterCheck is not its complete readiness body. Inventory
// exact metadata rows first; absent rows retain their explicit197 guards below.
export function composeOwnNoveltySuccessionAncestor({source,beforePins,afterPins,readinessSignature}){
 assert.equal(beforePins.length,7);assert.equal(afterPins.length,7);
 for(let n=0;n<7;n++)assert.deepEqual({...beforePins[n],sha256:null},{...afterPins[n],sha256:null},'NOVELTY197_EXISTING_METADATA_CHANGED');
 const inventory=composeOwnNoveltySuccessionPins(source,beforePins,beforePins);assert.equal(inventory.value,source,'NOVELTY197_ANCESTOR_INVENTORY_CHANGED');
 assert.ok(inventory.counts[readinessSignature]>0,'NOVELTY197_ANCESTOR_READY_MISSING');
 const rows=beforePins.map((old,n)=>({signature:old.signature,beforeSha256:old.sha256,afterSha256:afterPins[n].sha256,occurrences:inventory.counts[old.signature],present:inventory.counts[old.signature]>0}));
 const presentBefore=beforePins.filter(p=>inventory.counts[p.signature]>0),presentAfter=afterPins.filter(p=>inventory.counts[p.signature]>0);
 const projected=composeOwnNoveltySuccessionPins(source,presentBefore,presentAfter);
 for(const p of presentBefore)assert.equal(projected.counts[p.signature],inventory.counts[p.signature],'NOVELTY197_ANCESTOR_OCCURRENCES_CHANGED');
 assert.equal(composeOwnNoveltySuccessionPins(projected.value,presentAfter,presentBefore).value,source,'NOVELTY197_ANCESTOR_INVERSE_CHANGED');
 //130's DO may be nested in readiness rather than present in afterCheck.
 // Its absence is recorded; a malformed/present130 guard still fails closed.
 const objectStarts=[...projected.value.matchAll(/DO \$objects\$/g)],objectBlocks=[...projected.value.matchAll(/DO \$objects\$[\s\S]*?END \$objects\$/g)];
 assert.equal(objectStarts.length,objectBlocks.length,'NOVELTY197_ANCESTOR_OBJECT_SCOPE_INCOMPLETE');
 const targetBlocks=objectBlocks.filter(block=>block[0].includes('own_payroll_novelty_event'));
 const objectCounts=targetBlocks.length?composeOwnNoveltySuccessionObjectCounts(projected.value):{value:projected.value,blocks:0,priorUniqueIndexes:null,newUniqueIndexes:null,priorFunctionFamilyCount:null,newFunctionFamilyCount:null,scopeAbsent:true};
 if(targetBlocks.length)assert.equal(objectCounts.blocks,targetBlocks.length,'NOVELTY197_ANCESTOR_OBJECT_SCOPE_CHANGED');
 for(const row of rows.filter(row=>row.present&&row.beforeSha256!==row.afterSha256))assert.equal(objectCounts.value.includes(row.beforeSha256),false,'NOVELTY197_STALE_ANCESTOR_PIN:'+row.signature);
 return{value:objectCounts.value,counts:inventory.counts,objectCounts,ledger:{version:'own-novelty-succession-ancestor-source-ledger.v1',sourceSha256:hash(source),projectedSha256:hash(objectCounts.value),readinessSignature,readinessRequired:true,pins:rows,present:rows.filter(row=>row.present).map(row=>row.signature),absent:rows.filter(row=>!row.present).map(row=>row.signature),objectScope:{kind:targetBlocks.length?'present':'absent',starts:objectStarts.length,closedBlocks:objectBlocks.length,targetBlocks:targetBlocks.length},objectGuardBlocks:objectCounts.blocks,metadataInverseExact:true,sourceDerived:true,explicitSixBeforeAfterChecksPreserved:true,observedMetadataUsed:false}};
}

export function buildOwnNoveltySuccessionInstallation(options){
 assert.deepEqual(Object.keys(options??{}).sort(),['operationalPairBaseline','prerequisiteDefinitions','prerequisiteRuntime','read','sourceCommit']);
 assert.equal(typeof options.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);assert.ok(['pre107','published107'].includes(options.operationalPairBaseline));
 const sourceHashes={},cache=new Map(),read=file=>{if(!cache.has(file)){const value=options.read(file).replace(/\r\n?/g,'\n');cache.set(file,value);sourceHashes[file]=hash(value);}return cache.get(file);};
 for(const[file,expected]of Object.entries(canonicalSources))assert.equal(hash(read(file)),expected,'NOVELTY197_CANONICAL_SOURCE_CHANGED:'+file);
 const source=read(NOVELTY197_SQL);assert.equal(hash(source),NOVELTY197_SHA256,'NOVELTY197_REVIEWED_SOURCE_CHANGED');
 const previous=buildMonthlyDayFixedCompositionInstallation({...options,read});assert.equal(previous.run7Included,false);
 const statements=splitPostgresStatements(source).map(clean);assert.equal(statements.length,24,'NOVELTY197_STATEMENT_SET_CHANGED');
 const getDo=label=>{const found=statements.filter(s=>s.startsWith('DO $'+label+'$'));assert.equal(found.length,1,'NOVELTY197_GUARD_REQUIRED:'+label);return found[0];};
 const relationChecks=statements.filter(s=>s.startsWith('DO $relation_security$'));assert.equal(relationChecks.length,2);assert.equal(relationChecks[0],relationChecks[1]);
 const newDefinitions=functions(source).filter(d=>d.startsWith('CREATE FUNCTION ')),adapted=functions(source).filter(d=>d.startsWith('CREATE OR REPLACE FUNCTION '));
 assert.deepEqual(newDefinitions.map(d=>pin(d).name),helperNames);assert.deepEqual(adapted.map(d=>pin(d).name),oldNames);
 const indexStatements=statements.filter(s=>s.startsWith('CREATE UNIQUE INDEX '));assert.equal(indexStatements.length,1);assert.ok(indexStatements[0].startsWith('CREATE UNIQUE INDEX own_novelty_approved_successor_uk ON public.own_payroll_novelty_event('));
 const newAcl=statements.filter(s=>/^(?:REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) /.test(s));assert.equal(newAcl.length,2);
 assert.match(newAcl[0],/ FROM PUBLIC,municontrol_actions_runtime_app$/);assert.equal(newAcl[1],'GRANT EXECUTE ON FUNCTION public.own_novelty_succession_context_v1(jsonb,uuid) TO municontrol_actions_runtime_app');
 const close=buildOwnCloseSql(read),canonicalDefinitions=new Map();
 for(const file of Object.keys(canonicalSources).filter(f=>f.endsWith('.sql')))for(const d of functions(read(file)))canonicalDefinitions.set(pin(d).name,d);
 for(const d of close.adapted)canonicalDefinitions.set(pin(d).name,d);
 const originals=oldNames.map(name=>{assert.ok(canonicalDefinitions.has(name),'NOVELTY197_PREDECESSOR_MISSING:'+name);return canonicalDefinitions.get(name);});
 const beforeCorePins=originals.map(d=>pin(d)),afterCorePins=adapted.map(d=>pin(d)),newPins=newDefinitions.map(d=>pin(d));
 for(let i=0;i<6;i++)assert.deepEqual({...beforeCorePins[i],sha256:null},{...afterCorePins[i],sha256:null},'NOVELTY197_EXISTING_METADATA_CHANGED');
 assert.deepEqual(newPins.filter(p=>p.runtime).map(p=>p.name),['own_novelty_succession_context_v1']);
 assert.equal(newPins.find(p=>p.name==='own_novelty_succession_validate_v1').resultType,'uuid[]');
 const supportDefinitions=supportNames.map(name=>{assert.ok(canonicalDefinitions.has(name),'NOVELTY197_SUPPORT_MISSING:'+name);return canonicalDefinitions.get(name);}),supportPins=supportDefinitions.map(d=>pin(d,false));
 //194's current readiness is the property preserved by guarded196, not an older
 // nested fixed.previous.ready. Preserve the exact schema/actors and capture.
 const oldReady=previous.days.adapted.find(d=>pin(d).name==='municipal_adoption_ready_v1');assert.ok(oldReady);
 const oldReadyPin=pin(oldReady,false);assert.deepEqual(oldReadyPin,previous.preservedReadinessPin);
 const indexCheck=getDo('index_security'),readyComposition=composeOwnNoveltySuccessionReadiness({definition:oldReady,beforePins:beforeCorePins,afterPins:afterCorePins,newPins,indexCheck});
 const ready=readyComposition.definition,newReadyPin=pin(ready,false),beforePins=[...beforeCorePins,oldReadyPin],afterPins=[...afterCorePins,newReadyPin];
 assert.deepEqual({...oldReadyPin,sha256:null},{...newReadyPin,sha256:null},'NOVELTY197_READY_METADATA_CHANGED');
 const ancestor=composeOwnNoveltySuccessionAncestor({source:previous.afterCheck,beforePins,afterPins,readinessSignature:oldReadyPin.signature}),ancestorCounts=ancestor.objectCounts;
 const security=relationChecks[0],beforeCheck=[previous.afterCheck,pinsCheck([...beforePins,...supportPins],'NOVELTY197_PRIOR_METADATA'),getDo('before_pins'),security,getDo('new_absence')].join(';\n');
 const afterCheck=[ancestorCounts.value,pinsCheck([...afterPins,...newPins,...supportPins],'NOVELTY197_AFTER_METADATA'),getDo('after_pins'),security,indexCheck].join(';\n');
 const mutations=[indexStatements[0],...newDefinitions,...adapted,ready,...newAcl];assert.equal(mutations.length,18);
 for(const file of ['scripts/lib/own-novelty-succession-installation.mjs','scripts/lib/municipal-owner-program-installation.mjs','scripts/lib/installation-prior-metadata.mjs','scripts/lib/native-leave-installation.mjs','scripts/lib/own-payroll-installation.mjs','scripts/lib/sql-statements.mjs'])read(file);
 const before=ownNoveltySuccessionSnapshot('before',beforePins,newPins),after=ownNoveltySuccessionSnapshot('after',beforePins,newPins);
 const transaction=readOnly=>`DO $transaction$ BEGIN IF current_setting('standard_conforming_strings')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'NOVELTY197_TRANSACTION_REQUIRED';END IF;${readOnly?'':'PERFORM pg_advisory_xact_lock(197);PERFORM pg_advisory_xact_lock(196);PERFORM pg_advisory_xact_lock(194);PERFORM pg_advisory_xact_lock(193);PERFORM pg_advisory_xact_lock(192);PERFORM pg_advisory_xact_lock(190);'}END $transaction$`;
 const familyCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_novelty_%')",helperCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY["+helperNames.map(q).join(',')+']))';
 const matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
 const mode=`DO $mode$ BEGIN IF ${familyCount}=16 AND ${helperCount}=0 AND to_regclass(${q(index)}) IS NULL AND ${matches(beforePins)} THEN PERFORM set_config('${prefix}mode','install',true);ELSIF ${familyCount}=24 AND ${helperCount}=8 AND to_regclass(${q(index)}) IS NOT NULL AND ${matches(afterPins)} THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'NOVELTY197_PARTIAL_OR_FOREIGN_BASELINE';END IF;END $mode$`;
 const expected=m=>`DO $phase$ BEGIN IF current_setting('${prefix}mode')<>${q(m)} THEN RAISE EXCEPTION 'NOVELTY197_PHASE_CHANGED';END IF;END $phase$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}END IF;END $apply$`;
 const readiness="DO $readiness$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $readiness$";
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'NOVELTY197_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const allIds=ids([...afterPins,...newPins]),objectFingerprint="encode(public.digest(jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+allIds+")),'index',(SELECT jsonb_build_object('class',to_jsonb(c)-'relpages'-'reltuples'-'relallvisible'-'relallfrozen','catalog',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid),'expression',pg_get_expr(i.indexprs,i.indrelid),'predicate',pg_get_expr(i.indpred,i.indrelid)) FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid WHERE c.oid=to_regclass("+q(index)+")))::text,'sha256'),'hex')";
 const counters={newTables:0,newFunctions:8,adaptedFunctions:7,newIndexes:1,newRuntimeFacades:1,existingAclChanges:0,roleAssignmentsAdded:0,iamWrites:0,businessWrites:0,nominalRowsReturned:0};
 const proof=(m,preserved)=>`SELECT jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'operationalPairBaseline',${q(options.operationalPairBaseline)},'mode',${m},${Object.entries(counters).map(([k,v])=>q(k)+','+v).join(',')},'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',${objectFingerprint}) AS proof`;
 const phase=m=>[transaction(false),mode,expected(m),choose,before,apply,afterCheck,readiness,after,conservation,proof("current_setting('"+prefix+"mode')",true)];
 const noHistory="DO $history$ BEGIN IF EXISTS(SELECT 1 FROM public.own_payroll_novelty_event WHERE snapshot->>'version'='own-payroll-novelty-batch.v3' OR body->>'version'='own-payroll-novelty-command.v3' OR snapshot?'supersedes') OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload#>'{monthly,nativeBatches}','[]'::jsonb)) b WHERE b->>'version'='own-payroll-novelty-batch.v3' OR b?'supersedes') THEN RAISE EXCEPTION 'NOVELTY197_REVERSAL_HAS_V3_HISTORY';END IF;END $history$";
 const restored=[...originals,oldReady].map(d=>d.replace(/^CREATE(?: OR REPLACE)? FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 const rollback=[transaction(false),mode,expected('verify'),afterCheck,noHistory,before,...restored,...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),'DROP INDEX '+index,beforeCheck,readiness,after,conservation];
 return{version:VERSION,sourceCommit:options.sourceCommit,sourceHashes,operationalPairBaseline:options.operationalPairBaseline,previous,source,originals,adapted,newDefinitions,supportDefinitions,supportPins,beforePins,afterPins,newPins,oldReady,ready,readyComposition,ancestorPins:ancestor.counts,ancestorMetadataLedger:ancestor.ledger,ancestorObjectCounts:ancestorCounts,mutations,indexCheck,beforeCheck,afterCheck,before,after,mode,choose,apply,readiness,conservation,noHistory,rollback,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[transaction(true),afterCheck,readiness,after,proof("'verify'",false)],rollbackVerification:[transaction(true),beforeCheck,readiness,after],preservedCapturePin:previous.preservedCapturePin,priorReadinessPin:oldReadyPin,readinessPin:newReadyPin,readinessOrigin:'previous.days.adapted / previous.preservedReadinessPin',prerequisiteDefinitionsProperty:'qa.qa193.foundation.base.definitions',counters,connects:false,executesSql:false,executionAdmitted:false,run7Included:false};
}

export function assertOwnNoveltySuccessionDurability({installed,durable,repeated,batch}){
 const keys=['version','sourceCommit','sourceHashes','operationalPairBaseline','mode',...Object.keys(batch.counters),'transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const[value,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.deepEqual(Object.keys(value??{}).sort(),keys);assert.equal(value.version,batch.version);assert.equal(value.sourceCommit,batch.sourceCommit);assert.deepEqual(value.sourceHashes,batch.sourceHashes);assert.equal(value.operationalPairBaseline,batch.operationalPairBaseline);assert.equal(value.mode,mode);assert.equal(value.transactionDataPreserved,preserved);
  for(const[k,n]of Object.entries(batch.counters))assert.equal(value[k],n);
  for(const k of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(value[k],/^[a-f0-9]{64}$/);
  for(const k of['priorMetadataSha256','objectSha256'])assert.equal(value[k],installed[k]);
 }
 return{passed:true,technicalWritesOnly:true,independentDurableRead:true,wholeDatabaseStaticAcrossConnections:false,run7Included:false};
}
