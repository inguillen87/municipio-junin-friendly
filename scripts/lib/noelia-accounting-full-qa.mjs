// Explicit disposable Noelia source profile. No canonical190 foundation, executor or live catalogue authority.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildOwnAccountingInstallation} from './own-accounting-installation.mjs';import {buildOwnImputationInstallation} from './own-imputation-installation.mjs';import {buildOwnJournalInstallation} from './own-journal-installation.mjs';
import {buildSalaryAdministrativeIdentityInstallation,SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {deriveOwnPayrollAdministrativeOperator} from './own-payroll-administrative-operator-installation.mjs';
import {buildOwnRunDateInstallation,declaredDateCapture} from './own-payroll-run-date-installation.mjs';
import {noeliaCurrentFullQaPhaseStatements} from './noelia-current-full-qa.mjs';
import {CONSUMER_AFTER_PINS} from './adopted-consumers-installation-pins.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';import {splitPostgresStatements} from './sql-statements.mjs';
import {NOELIA_ACCOUNTING_SOURCE_PINS} from './noelia-accounting-full-source-pins.mjs';
export const NOELIA_ACCOUNTING_VERSION='noelia-accounting-full-source-profile.v1';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>{assert.equal(typeof v,'string');return v.replace(/\r\n?/g,'\n');};
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'NOELIA_ACCOUNTING_BODY');return m[2];};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'NOELIA_ACCOUNTING_ANCHOR');return s.replace(a,()=>b);};
const plans=new WeakMap(),installedPlans=new WeakMap();
function definitions(source){
 return [...source.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION (?:public\.)?([a-z0-9_]+)\([\s\S]*?\bAS\s+(\$[\w]*\$)[\s\S]*?\2\s*;?/g)].map(m=>m[0].replace(/^(CREATE(?: OR REPLACE)? FUNCTION )(?!public\.)/,'$1public.'));
}
function metadataArrays(source){
 const found=[...source.matchAll(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g)];
 assert.equal(found.length,2,'NOELIA_ACCOUNTING_TWO_SOURCE_EPOCHS_REQUIRED');
 return found.map(m=>JSON.parse(m[1].replaceAll("''","'")));
}
function asRecord(p){
 const expression=typeof p.defaults==='string'?p.defaults:p.defaultExpressions;
 assert.equal(typeof expression,'string','NOELIA_ACCOUNTING_KNOWN_DEFAULT_EXPRESSION_REQUIRED');
 const defaults=expression?expression.split(', ').length:0;if(typeof p.defaults==='number')assert.equal(p.defaults,defaults,'NOELIA_ACCOUNTING_SOURCE_DEFAULT_COUNT_MISMATCH');
 return {name:p.name,signature:p.signature,bodySha256:p.bodySha256??p.sha256,argNames:p.argNames?.length?p.argNames:null,result:p.result??p.resultType,
  language:p.language,defaults,defaultExpressions:expression,config:p.config?.length?p.config:null,
  runtime:p.runtime===true,volatility:p.volatility,definer:p.definer??true,strict:p.strict??false,returnsSet:p.returnsSet??false};
}
function sourceRegistry(all){
 const result=new Map();
 for(const d of all){const n=/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(/.exec(d);if(!n)continue;
  const key=n[1]+'|'+hash(body(d));if(!result.has(key))result.set(key,d);
 }
 return result;
}
function sourceDefinition(registry,record){
 const value=registry.get(record.name+'|'+record.bodySha256);assert.ok(value,'NOELIA_ACCOUNTING_KNOWN_SOURCE_MISSING:'+record.name);
 assert.equal(hash(body(value)),record.bodySha256,'NOELIA_ACCOUNTING_SOURCE_DIGEST_CHANGED');return value;
}

// The source-to-local digest fixed point is the same technique as canonical190.
// Every raw digest must have a complete known definition, including old epochs.
// Never reverse namespaces in observed prosrc and never infer an expected hash.
function metadataCheck(records,code){
 // All expressions/defaults/ACL flags are source-derived records. Catalog
 // observations below can only be compared with them, not replace them.
 return `DO $noelia_accounting_metadata$ DECLARE expected jsonb;actual pg_proc;runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION '${code}';END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(records))}::jsonb) LOOP
 SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected->>'signature');
 IF actual.oid IS NULL OR actual.proowner<>current_user::regrole OR actual.prokind<>'f'
 OR actual.prosecdef IS DISTINCT FROM(expected->>'definer')::boolean OR actual.proisstrict IS DISTINCT FROM(expected->>'strict')::boolean OR actual.proretset IS DISTINCT FROM(expected->>'returnsSet')::boolean
 OR actual.proleakproof OR actual.proparallel<>'u' OR actual.provolatile IS DISTINCT FROM(expected->>'volatility')::"char"
 OR actual.procost<>100 OR actual.prorows<>(CASE WHEN(expected->>'returnsSet')::boolean THEN 1000 ELSE 0 END) OR actual.prosupport<>0 OR actual.probin IS NOT NULL OR actual.proallargtypes IS NOT NULL OR actual.provariadic<>0 OR actual.prosqlbody IS NOT NULL
 OR actual.prorettype IS DISTINCT FROM to_regtype(expected->>'result') OR actual.prolang IS DISTINCT FROM(SELECT oid FROM pg_language WHERE lanname=expected->>'language')
 OR actual.pronargdefaults<>(expected->>'defaults')::integer OR coalesce(pg_get_expr(actual.proargdefaults,0),'') IS DISTINCT FROM expected->>'defaultExpressions' OR actual.proargmodes IS NOT NULL
 OR coalesce(to_jsonb(actual.proargnames),'null'::jsonb) IS DISTINCT FROM expected->'argNames' OR coalesce(to_jsonb(actual.proconfig),'null'::jsonb) IS DISTINCT FROM expected->'config'
 OR encode(public.digest(replace(actual.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') IS DISTINCT FROM expected->>'bodySha256'
 OR(SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=expected->>'name')<>1
 OR has_function_privilege('municontrol_actions_runtime_app',actual.oid,'EXECUTE') IS DISTINCT FROM(expected->>'runtime')::boolean
 THEN RAISE EXCEPTION '${code}';END IF;
 IF EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantor<>actual.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>actual.proowner AND NOT((expected->>'runtime')::boolean AND a.grantee=runtime_oid)))
 OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=actual.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR(expected->>'runtime')::boolean IS DISTINCT FROM EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=runtime_oid AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR(SELECT count(*) FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))))<>(CASE WHEN(expected->>'runtime')::boolean THEN 2 ELSE 1 END)
 THEN RAISE EXCEPTION '${code}';END IF;
 END LOOP;END $noelia_accounting_metadata$`;
}

function localRecords(records,registry,normalize){
 return records.map(record=>{
  sourceDefinition(registry,record);
  // Normalize the source-based JSON record and the whole source independently.
  const local=JSON.parse(normalize(JSON.stringify(record))),d=normalize(sourceDefinition(registry,record));
  assert.equal(local.bodySha256,hash(body(d)),'NOELIA_ACCOUNTING_METADATA_LOCAL_BODY_MISMATCH:'+record.name);return local;
 });
}
function identityProof(records,version,epoch,sourceCommit){
 const signatures=records.map(r=>q(r.signature)+'::regprocedure').join(',');
 return `SELECT jsonb_build_object('version',${q(version)},'epoch',${q(String(epoch))},'sourceCommit',${q(sourceCommit)},'knownFunctionCount',${records.length},'identitySha256',encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${signatures}))::text,'sha256'),'hex'))`;
}

// Same table/row/security preservation frame as201, with only the declared
// function prosrc/new functions and203 allocation CHECK projected out.
function conservation(context,epoch,{changed=[],added=[],checks=[],checkTable='own_payroll_imputation_event'}){
 const schema=context.schema,changedNames=changed.length?changed.map(q).join(','):"''",addedNames=added.length?added.map(q).join(','):"''",checkNames=checks.length?checks.map(q).join(','):"''";
 const snapshot=slot=>`DO $noelia_accounting_preserve$ DECLARE target_relation record;rows_value jsonb:='[]';row_count bigint;fingerprint text;BEGIN
 FOR target_relation IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
 EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${q(schema)},target_relation.relname) INTO row_count,fingerprint;
 rows_value:=rows_value||jsonb_build_array(jsonb_build_object('oid',target_relation.oid,'rows',row_count,'sha256',fingerprint));END LOOP;
 PERFORM set_config('municontrol_noelia_accounting_${epoch}.${slot}',jsonb_build_object('rows',rows_value,
 'tables',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace),
 'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'attributeDefaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_constraint c WHERE c.connamespace=${q(schema)}::regnamespace AND NOT(c.conname IN(${checkNames}) AND c.conrelid='${schema}.${checkTable}'::regclass)),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'functions',(SELECT coalesce(jsonb_agg(CASE WHEN p.proname IN(${changedNames}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname NOT IN(${addedNames})),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m),
 'defaultAcl',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d),'schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid=${q(schema)}::regnamespace))::text,true);END $noelia_accounting_preserve$`;
 const compare=`DO $noelia_accounting_conserve$ BEGIN IF current_setting('municontrol_noelia_accounting_${epoch}.before')::jsonb IS DISTINCT FROM current_setting('municontrol_noelia_accounting_${epoch}.after')::jsonb THEN RAISE EXCEPTION 'NOELIA_ACCOUNTING_PRIOR_STATE_CHANGED';END IF;END $noelia_accounting_conserve$`;
 const proof=`SELECT jsonb_build_object('version','own-noelia_accounting-source-evolution.v1','epoch',${q(String(epoch))},'sourceCommit',${q(context.sourceCommit)},'preserved',true,'businessWrites',0,'priorStateSha256',encode(public.digest(current_setting('municontrol_noelia_accounting_${epoch}.after')::jsonb::text,'sha256'),'hex'))`;
 return{before:snapshot('before'),after:snapshot('after'),compare,proof};
}

function finalImputationTableCheck(check,source203){
 // Keep every old table/ACL/index/FK/trigger/empty-ledger guard. Only the known
 // successor's allocation budget and exact family count are updated.
 let value=once(check,'octet_lengthallocation::text<=16777216','octet_lengthallocation::text<=33554432');
 value=once(value,"proname LIKE 'own_imputation_%')<>11","proname LIKE 'own_imputation_%')<>17");
 const marker=" SELECT * INTO checked_constraint FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_imputation_event_allocation_check';";
 const start=source203.lastIndexOf(marker),end=source203.indexOf(' SELECT to_jsonb(t) INTO table_after',start);
 assert.ok(start>=0&&end>start,'NOELIA_ACCOUNTING_KNOWN203_CHECK_BLOCK_REQUIRED');const block=source203.slice(start,end);
 assert.equal((block.match(/SELECT \* INTO checked_constraint/g)??[]).length,3,'NOELIA_ACCOUNTING_THREE203_NAMED_CHECKS');
 return [value,`DO $noelia_accounting_final_checks$ DECLARE target_relation regclass:=to_regclass('public.own_payroll_imputation_event');checked_constraint pg_constraint;BEGIN\n${block}END $noelia_accounting_final_checks$`];
}


function finalJournalTableCheck(check,source206){
 // Both known snapshot constraints evolve, but request8MiB and all original
 // columns/FKs/indexes/ACL/immutability/empty-ledger guards remain unchanged.
 let value=once(check,'octet_lengthsource_snapshot::text<=16777216','octet_lengthsource_snapshot::text<=33554432');
 value=once(value,'octet_lengthjournal_snapshot::text<=16777216','octet_lengthjournal_snapshot::text<=33554432');
 value=once(value,"proname LIKE 'own_journal_%')<>13","proname LIKE 'own_journal_%')<>19");
 const marker=" SELECT * INTO checked_constraint FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_journal_event_source_snapshot_check';";
 const start=source206.lastIndexOf(marker),end=source206.indexOf(' SELECT to_jsonb(t) INTO table_after',start);
 assert.ok(start>=0&&end>start,'NOELIA_ACCOUNTING_KNOWN206_CHECK_BLOCK_REQUIRED');const block=source206.slice(start,end);
 assert.equal((block.match(/SELECT \* INTO checked_constraint/g)??[]).length,3,'NOELIA_ACCOUNTING_THREE206_NAMED_CHECKS');
 return [value,`DO $noelia_accounting_final_journal_checks$ DECLARE target_relation regclass:=to_regclass('public.own_payroll_journal_event');checked_constraint pg_constraint;BEGIN\n${block}END $noelia_accounting_final_journal_checks$`];
}

function relocateSource(source,schema){
 return source.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
 .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
 .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp')
 .replaceAll('"search_path=pg_catalog, public, pg_temp"','"search_path=pg_catalog, '+schema+', public, pg_temp"')
 .replaceAll('"search_path=public, pg_temp"','"search_path=pg_catalog, '+schema+', public, pg_temp"')
 .replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
 .replaceAll("'search_path=public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'));
}
function sourceProjection(schema,registry){
 const hashes=new Map();let stable=false;
 for(let pass=0;pass<24;pass++){let changed=false;for(const d of registry.values()){
  let local=relocateSource(d,schema);for(const[from,to]of hashes)local=local.replaceAll(from,to);
  const from=hash(body(d)),to=hash(body(local));if(hashes.get(from)!==to){hashes.set(from,to);changed=true;}
 }if(!changed){stable=true;break;}}
 assert.ok(stable,'NOELIA_ACCOUNTING_HASH_GRAPH_UNRESOLVED');
 for(const[from,to]of hashes)assert.ok(from===to||!hashes.has(to),'NOELIA_ACCOUNTING_HASH_ALIAS');
 const normalize=source=>{let local=relocateSource(source,schema);for(const[from,to]of hashes)local=local.replaceAll(from,to);return local;};
 for(const d of registry.values())assert.equal(hashes.get(hash(body(d))),hash(body(normalize(d))),'NOELIA_ACCOUNTING_LOCAL_BODY_CHANGED');
 return{normalize,hashes};
}
const rawDefinition=(source,name)=>{const all=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\(').test(s));assert.equal(all.length,1,'NOELIA_ACCOUNTING_ONE_DEFINITION:'+name);return all[0];};
const runtimeNames=new Set(['own_accounting_bootstrap_v1','own_accounting_detail_v1','own_accounting_attempt_v1','own_accounting_command_v1','own_imputation_bootstrap_v1','own_imputation_source_v1','own_imputation_detail_v1','own_imputation_attempt_v1','own_imputation_command_v1','own_journal_bootstrap_v1','own_journal_source_v1','own_journal_detail_v1','own_journal_attempt_v1','own_journal_command_v1','own_run_capture_v1','own_run_bootstrap_v1']);
const overlays=[
 [204,'scripts/migrations/204-own-accounting-administrative-actor.sql',5,0,[]],
 [205,'scripts/migrations/205-own-imputation-preparation-authorization.sql',5,0,[]],
 [207,'scripts/migrations/207-own-journal-preparation-authorization.sql',5,0,[]],
 [203,'scripts/migrations/203-own-imputation-full-capacity.sql',3,6,['own_payroll_imputation_event_allocation_check'],'own_payroll_imputation_event'],
 [206,'scripts/migrations/206-own-journal-full-capacity.sql',3,6,['own_payroll_journal_event_source_snapshot_check','own_payroll_journal_event_journal_snapshot_check'],'own_payroll_journal_event']
];
function transactionGuard(major,readOnly){return `DO $noelia_accounting_transaction$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('standard_conforming_strings')<>'on' OR current_setting('server_version_num')::integer/10000<>${major} THEN RAISE EXCEPTION 'NOELIA_ACCOUNTING_TRANSACTION_REQUIRED';END IF;END $noelia_accounting_transaction$`;}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function composeNoeliaAccountingFullSources({qa,fullQa,ready,major,sourceCommit,read}){
 assert.ok(qa&&typeof qa.normalized==='function');assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 // These calls validate the REAL minted Noelia plan. No h190, foundation or pool is constructed.
 assert.equal(noeliaCurrentFullQaPhaseStatements(fullQa,'seed-empty').length,14);
 assert.equal(fullQa.schema,qa.schema);assert.equal(fullQa.sourceCommit,sourceCommit);assert.equal(fullQa.institutionalAuthority200Proven,false);assert.equal(fullQa.productionAuthority,false);
 const fullPhase=noeliaCurrentFullQaPhaseStatements(fullQa,'after-historical',ready),schema=qa.schema,context={schema,sourceCommit},texts=new Map(),sourceHashes={};
 const checkedRead=file=>{const expected=NOELIA_ACCOUNTING_SOURCE_PINS[file]??fullQa.sourceHashes[file];assert.match(expected??'',/^[a-f0-9]{64}$/,'NOELIA_ACCOUNTING_UNPINNED_SOURCE:'+file);const text=lf(read(file));assert.equal(hash(text),expected,'NOELIA_ACCOUNTING_SOURCE_CHANGED:'+file);if(texts.has(file))assert.equal(texts.get(file),text);texts.set(file,text);sourceHashes[file]=expected;return text;};
 for(const file of Object.keys(NOELIA_ACCOUNTING_SOURCE_PINS))checkedRead(file);
 for(const[file,expected]of Object.entries(fullQa.sourceHashes)){const actual=hash(checkedRead(file));assert.equal(actual,expected,'NOELIA_ACCOUNTING_FULL_SOURCE_CONFLICT');}
 const originals=[[147,buildOwnAccountingInstallation({read:checkedRead,sourceCommit})],[148,buildOwnImputationInstallation({read:checkedRead,sourceCommit})],[152,buildOwnJournalInstallation({read:checkedRead,sourceCommit})]],salary=buildSalaryAdministrativeIdentityInstallation({read:checkedRead,sourceCommit}),date=buildOwnRunDateInstallation({read:checkedRead,sourceCommit});
 const source123=checkedRead('scripts/migrations/123-own-payroll-runs.sql'),source130=checkedRead('scripts/migrations/130-own-bulk-novelties.sql'),oldContext=rawDefinition(source123,'own_run_context_v1');
 const derived=deriveOwnPayrollAdministrativeOperator([oldContext,rawDefinition(source123,'own_run_bootstrap_v1'),rawDefinition(source130,'own_novelty_sources_v1')]),newContext=derived[0],raw176=splitPostgresStatements(checkedRead('scripts/migrations/176-own-payroll-administrative-operator.sql')).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());assert.deepEqual(derived,raw176);
 const helper=lf(SALARY_ADMINISTRATIVE_CONTEXT);assert.equal(salary.mutations[0],helper);const helperRevoke=salary.mutations[1];assert.equal(helperRevoke,'REVOKE ALL ON FUNCTION public.native_salary_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app');
 const beforeContext={...ownInstallationFunctionPin(oldContext),runtime:false},afterContext={...ownInstallationFunctionPin(newContext),runtime:false};assert.equal(beforeContext.sha256,'86ab4abf6a5ee55f6e3432a301febe55967884eda4131b76430db79d9dfa0f33');assert.equal(afterContext.sha256,'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30');assert.deepEqual({...beforeContext,sha256:null},{...afterContext,sha256:null});
 const capture145=declaredDateCapture(date.beforeDefinitions[0]);assert.equal(ownInstallationFunctionPin(capture145).sha256,'6c0eacf0e518abdd97577447a046a355ae110b004e4c0f50936b675935e51fbe');
 const overlaySources=new Map(overlays.map(([id,file])=>[id,checkedRead(file)]));
 const baseFiles=['007-action-center-read-facades.sql','103-native-employment-catalog.sql','112-native-salary-definitions.sql','122-own-payroll-programs.sql','123-own-payroll-runs.sql','125-own-payroll-close.sql','147-own-payroll-accounting-mappings.sql','148-own-payroll-imputation.sql','152-own-payroll-journal.sql','176-own-payroll-administrative-operator.sql','200-own-payroll-report-census.sql','201-own-full-payroll-decision-capacity.sql'];
 const registry=sourceRegistry([...baseFiles.flatMap(f=>definitions(checkedRead('scripts/migrations/'+f))),...originals.flatMap(([,b])=>b.migration.flatMap(definitions)),salary.context,helper,capture145,...[...overlaySources.values()].flatMap(definitions)]),{normalize,hashes}=sourceProjection(schema,registry);
 const known=new Map(),put=pin=>{const p=asRecord(pin);sourceDefinition(registry,p);known.set(p.signature,p);};
 for(const[,batch]of originals)for(const p of [...batch.prerequisitePins,...batch.ownPins])put(p);
 // The SAME adopted-consumer137 AFTER pin is the real Noelia predecessor,
 // not an inferred equivalent of104. The installed function is checked in every
 // stage; a divergent catalog aborts before either support definition is applied.
 const helperPredecessor=CONSUMER_AFTER_PINS.find(p=>p.name==='native_employment_change_context_v1');
 assert.deepEqual(salary.prerequisitePin,helperPredecessor,'NOELIA_ACCOUNTING_HELPER_PREDECESSOR_NOT_CURRENT137');
 const source137=checkedRead('scripts/migrations/137-adopted-operator-context.sql');
 for(const text of ["old_call text:='ctx:=public.native_employee_context_v1(p);';","new_call text:='ctx:=public.native_employment_lifecycle_adopted_context_v2(p);';"])
  assert.equal(source137.split(text).length,2,'NOELIA_ACCOUNTING_HELPER137_TRANSFORMATION_CHANGED');
 put(salary.prerequisitePin);
 const current=()=>[...known.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
 const check=records=>{localRecords(records,registry,normalize);return normalize(metadataCheck(records,'NOELIA_ACCOUNTING_CURRENT_SOURCE_CHANGED'));};
 const readyDefinitions=fullPhase.installation.filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION '+schema+'.municipal_adoption_ready_v1('));assert.equal(readyDefinitions.length,1,'NOELIA_ACCOUNTING_SOURCE_READY_REQUIRED');const readyDefinition=readyDefinitions[0],readyPin={...ownInstallationFunctionPin(readyDefinition.replace('FUNCTION '+schema+'.','FUNCTION public.')),signature:schema+'.municipal_adoption_ready_v1()',sha256:hash(body(readyDefinition)),runtime:false};
 assert.equal((body(readyDefinition).match(/own_run_context_v1|native_salary_administrative_context_v1/g)??[]).length,0,'NOELIA_ACCOUNTING_READY_BRIDGE_UNRESOLVED');
 const protectedPins=[{...ownInstallationFunctionPin(capture145),runtime:true}],protectedChecks=[check(protectedPins.map(asRecord)),relocateSource(metadataCheck([asRecord(readyPin)],'NOELIA_ACCOUNTING_READY_CHANGED'),schema)];
 const authorityChecks=[...fullPhase.verification,...protectedChecks],rawTables=new Map(originals.map(([id,b])=>[id,b.tableCheck])),tables=()=>[...rawTables.values()].map(normalize),stages=[];
 const epoch=(id,changed,added,apply,checks=[],checkTable='own_payroll_imputation_event',preRecords=current(),beforeBehavior=[],afterBehavior=[])=>{
  const keep=conservation(context,id,{changed,added,checks,checkTable}),postRecords=current(),ownIdentity=normalize(identityProof(postRecords,'own-noelia-accounting-identity.v1',id,sourceCommit));
  const proof=keep.proof.replace("'preserved',true",()=>"'schema',"+q(schema)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'preserved',true");
  const verification=[transactionGuard(major,true),...authorityChecks,check(postRecords),...tables(),keep.after,proof];
  const stage=freeze({id,changed:[...changed],added:[...added],preRecords,postRecords,installation:[transactionGuard(major,false),...authorityChecks,check(preRecords),...beforeBehavior,keep.before,...apply,check(postRecords),...afterBehavior,...tables(),keep.after,keep.compare,proof],verification,identity:[transactionGuard(major,true),...authorityChecks,check(postRecords),ownIdentity],sourceSqlSha256:id==='support176'?hash(helper+'\n'+newContext):hash(overlaySources.get(id)),priorStateSetting:'municontrol_noelia_accounting_'+id+'.after'});stages.push(stage);return stage;
 };
 const beforeSupport=current(),helperPin={...salary.helperPin,runtime:false};put(helperPin);put(afterContext);
 const helperAbsent=`DO $noelia_accounting_helper_absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=${q(schema)}::regnamespace AND proname='native_salary_administrative_context_v1') THEN RAISE EXCEPTION 'NOELIA_ACCOUNTING_HELPER_ALREADY_PRESENT';END IF;END $noelia_accounting_helper_absent$`;
 // Disposable, employment-linked actors are the explicit behavior scope of this
 // profile. Their authenticated contexts are observed only for comparison, never
 // used to mint source authority. No administrative-without-employment claim.
 const actors=['maker','checker'].map(key=>{const p=qa.actors?.[key];assert.ok(p&&typeof p==='object'&&!Array.isArray(p),'NOELIA_ACCOUNTING_DECLARED_ACTOR_REQUIRED');return p;});
 const actorLiteral=q(JSON.stringify(actors))+'::jsonb';
 const beforeBehavior=normalize(`DO $noelia_accounting_support_before$ DECLARE actor jsonb;old_context jsonb;contexts jsonb:='[]';BEGIN
 FOR actor IN SELECT value FROM jsonb_array_elements(NOELIA_ACCOUNTING_ACTORS_JSON) LOOP
 old_context:=public.own_run_context_v1(actor,true,false);
 IF old_context->>'actorPersonId' IS NULL OR old_context->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'NOELIA_ACCOUNTING_EMPLOYMENT_BEHAVIOR_SCOPE_REQUIRED';END IF;
 contexts:=contexts||jsonb_build_array(old_context);
 END LOOP;
 PERFORM set_config('municontrol_noelia_accounting_support176.behavior_before',contexts::text,true);
 END $noelia_accounting_support_before$`).replace('NOELIA_ACCOUNTING_ACTORS_JSON',()=>actorLiteral);
 const afterBehavior=normalize(`DO $noelia_accounting_support_after$ DECLARE actor jsonb;old_context jsonb;new_context jsonb;predecessor_context jsonb;helper_context jsonb;i integer:=0;BEGIN
 FOR actor IN SELECT value FROM jsonb_array_elements(NOELIA_ACCOUNTING_ACTORS_JSON) LOOP
 old_context:=current_setting('municontrol_noelia_accounting_support176.behavior_before')::jsonb->i;
 new_context:=public.own_run_context_v1(actor,true,false);
 predecessor_context:=public.native_employment_change_context_v1(actor);
 helper_context:=public.native_salary_administrative_context_v1(actor);
 IF new_context IS DISTINCT FROM old_context||jsonb_build_object('parameterActorVerified',true)
 OR predecessor_context->>'actorPersonId' IS NULL OR predecessor_context->>'employmentContractId' IS NULL
 OR helper_context IS DISTINCT FROM predecessor_context||jsonb_build_object('parameterActorVerified',true)
 THEN RAISE EXCEPTION 'NOELIA_ACCOUNTING_EMPLOYMENT_BEHAVIOR_CHANGED';END IF;
 i:=i+1;
 END LOOP;IF i<>2 THEN RAISE EXCEPTION 'NOELIA_ACCOUNTING_ACTOR_SCOPE_CHANGED';END IF;
 END $noelia_accounting_support_after$`).replace('NOELIA_ACCOUNTING_ACTORS_JSON',()=>actorLiteral);
 epoch('support176',['own_run_context_v1'],['native_salary_administrative_context_v1'],[helperAbsent,normalize(helper),normalize(helperRevoke),normalize(newContext)],[],undefined,beforeSupport,[beforeBehavior],[afterBehavior]);
 for(const[id,file,changedCount,addedCount,checks,checkTable]of overlays){const source=overlaySources.get(id),[pre,post]=metadataArrays(source),before=current();
  for(const p of pre){const r=asRecord(p);assert.deepEqual(known.get(r.signature),r,'NOELIA_ACCOUNTING_ORDERED_SOURCE_EPOCH:'+id+':'+r.name);}
  const added=post.filter(p=>!known.has(p.signature)).map(p=>p.name),changed=post.filter(p=>known.has(p.signature)&&known.get(p.signature).bodySha256!==p.bodySha256).map(p=>p.name);assert.equal(added.length,addedCount);assert.equal(changed.length,changedCount);for(const p of post)put(p);
  if(id===203)rawTables.set(148,finalImputationTableCheck(rawTables.get(148),source).join(';\n'));if(id===206)rawTables.set(152,finalJournalTableCheck(rawTables.get(152),source).join(';\n'));
  epoch(id,changed,added,[normalize(source)],checks,checkTable,before);
 }
 const finalRecords=current(),identity=normalize(identityProof(finalRecords,'own-noelia-accounting-identity.v1','final',sourceCommit)),finalFunctionVerification=[transactionGuard(major,true),...authorityChecks,check(finalRecords),identity];
 const completeKeep=conservation(context,'rollback',{}),snapshot=[transactionGuard(major,true),completeKeep.after,"SELECT encode(public.digest(current_setting('municontrol_noelia_accounting_rollback.after')::jsonb::text,'sha256'),'hex')"];
 const plan=freeze({version:NOELIA_ACCOUNTING_VERSION,schema,major,sourceCommit,sourceHashes:{...sourceHashes},stages,finalVerification:[transactionGuard(major,true),...authorityChecks,check(finalRecords),...tables(),identity],finalFunctionVerification,snapshot,knownFunctionCount:finalRecords.length,bodyMappingCount:hashes.size,protectedReady:readyPin,protectedCapture:{signature:protectedPins[0].signature,sourceBodySha256:protectedPins[0].sha256},support:{version:'noelia-context123-to176-with-salary-helper.v1',behaviorScope:'two-declared-employment-linked-qa-actors',administrativeWithoutEmploymentVerified:false,helperPredecessor:{signature:helperPredecessor.signature,sourceBodySha256:helperPredecessor.sha256,source:'adopted-consumers137-after'},contextOnly:true,whole176Installed:false,salaryIdentityWholeInstalled:false,contextBeforeSha256:beforeContext.sha256,contextAfterSha256:afterContext.sha256,helperSha256:helperPin.sha256,helperNewFunctions:1,changedFunctions:1,other176DefinitionsInstalled:0},inheritedFull201:{sourceSha256:fullQa.source201Sha256,predecessors:11,postdecessors:27,guardStatements:fullPhase.verification.length},institutionalAuthority200Proven:false,productionAuthority:false,connects:false,executesSql:false});
 plans.set(plan,{read,qa,fullQa,ready});return plan;
}
function sourceBookend(plan){const saved=plans.get(plan);assert.ok(saved,'NOELIA_ACCOUNTING_ORIGINAL_PLAN_REQUIRED');for(const[file,expected]of Object.entries(plan.sourceHashes))assert.equal(hash(lf(saved.read(file))),expected,'NOELIA_ACCOUNTING_SOURCE_BOOKEND:'+file);return true;}
function assertProof(value,plan,stage){assert.equal(value?.version,'own-noelia_accounting-source-evolution.v1');assert.equal(value.epoch,String(stage.id));assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.schema,plan.schema);assert.deepEqual(value.sourceHashes,plan.sourceHashes);assert.equal(value.preserved,true);assert.equal(value.businessWrites,0);assert.match(value.priorStateSha256,/^[a-f0-9]{64}$/);return true;}
function assertIdentity(value,plan){assert.equal(value?.version,'own-noelia-accounting-identity.v1');assert.equal(value.epoch,'final');assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.knownFunctionCount,plan.knownFunctionCount);assert.match(value.identitySha256,/^[a-f0-9]{64}$/);return true;}
export async function installNoeliaAccountingFullQa({plan,executeStage,writeEvidence}){
 assert.ok(plans.has(plan),'NOELIA_ACCOUNTING_ORIGINAL_PLAN_REQUIRED');assert.equal(typeof executeStage,'function');assert.equal(typeof writeEvidence,'function');sourceBookend(plan);const epochs=[];
 const execute=async(statements,{readOnly=false,end='COMMIT'}={})=>executeStage({statements,end,readOnly});
 for(const stage of plan.stages){sourceBookend(plan);const before=await execute(plan.snapshot,{readOnly:true}),rehearsal=await execute(stage.installation,{end:'ROLLBACK'});assertProof(rehearsal,plan,stage);assert.deepEqual(await execute(plan.snapshot,{readOnly:true}),before,'NOELIA_ACCOUNTING_REHEARSAL_NOT_ROLLED_BACK');
  const installed=await execute(stage.installation);assertProof(installed,plan,stage);const durable=await execute(stage.verification,{readOnly:true});assertProof(durable,plan,stage);assert.deepEqual(durable,installed,'NOELIA_ACCOUNTING_NOT_DURABLE');
  const identity=await execute(stage.identity,{readOnly:true}),fresh=await execute(stage.identity,{readOnly:true});assert.deepEqual(fresh,identity,'NOELIA_ACCOUNTING_FRESH_IDENTITY_CHANGED');const record={id:stage.id,rehearsal,installed,durable,identity};await writeEvidence('native-accounting-current-'+stage.id+'-proof.json',record);epochs.push(record);
 }
 const final=await execute(plan.finalVerification,{readOnly:true});assertIdentity(final,plan);assert.deepEqual(await execute(plan.finalVerification,{readOnly:true}),final,'NOELIA_ACCOUNTING_FINAL_IDENTITY_CHANGED');sourceBookend(plan);
 const result=freeze({version:'noelia-accounting-full-installation.v1',sourceCommit:plan.sourceCommit,schema:plan.schema,epochs,final,sourceHashes:plan.sourceHashes,support:plan.support,actualSqlReceiptRequired:true,productionAuthority:false});installedPlans.set(result,{plan,executeStage});return result;
}
export async function assertNoeliaAccountingFullBookend({installation,executeStage}){
 const saved=installedPlans.get(installation);assert.ok(saved,'NOELIA_ACCOUNTING_ORIGINAL_INSTALLATION_REQUIRED');assert.equal(executeStage,saved.executeStage,'NOELIA_ACCOUNTING_SAME_EXECUTOR_REQUIRED');const{plan}=saved;sourceBookend(plan);
 const identity=await executeStage({statements:plan.finalFunctionVerification,end:'COMMIT',readOnly:true});assertIdentity(identity,plan);assert.deepEqual(identity,installation.final,'NOELIA_ACCOUNTING_POST_BUSINESS_IDENTITY_CHANGED');return{version:'noelia-accounting-full-function-bookend.v1',sourceCommit:plan.sourceCommit,schema:plan.schema,identitySha256:identity.identitySha256,knownFunctionCount:identity.knownFunctionCount,emptyLedgersRequired:false};
}