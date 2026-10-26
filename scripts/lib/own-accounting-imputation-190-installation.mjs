// PRIVATE SOURCE CANDIDATE. Nothing is installed by importing this module.
// Future native CI only: reuse the already built SAME190 h, its h.json and201.
// No alternate fixture, schema, identity, effective capability or SQL transport.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnAccountingInstallation,assertOwnAccountingDurability} from './own-accounting-installation.mjs';
import {buildOwnImputationInstallation,assertOwnImputationDurability} from './own-imputation-installation.mjs';
import {buildOwnJournalInstallation,assertOwnJournalDurability} from './own-journal-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {deriveClosedReportAuthorizationSource,buildOwnReportCensusAuthorityPins} from './own-payroll-report-census-authority.mjs';
import {ownFullCapacity190Snapshot,composeOwnFullCapacity190Installation} from './own-payroll-full-capacity-190-installation.mjs';
import {composeOwnCloseSnapshot214Plan,projectOwnCloseSnapshot214Postflight} from './own-close-snapshot214-installation.mjs';
import {OWN_ACCOUNTING_IMPUTATION_190_SOURCE_PINS as SOURCE_PINS,OWN_ACCOUNTING_IMPUTATION_190_SOURCE_ENTRIES} from './own-accounting-imputation-190-source-pins.mjs';

export {OWN_ACCOUNTING_IMPUTATION_190_SOURCE_ENTRIES};
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const hash=v=>createHash('sha256').update(v).digest('hex');
const lf=v=>v.replace(/\r\n?/g,'\n');
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m,'ACCOUNTING190_SOURCE_BODY_REQUIRED');return m[2];};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ACCOUNTING190_SOURCE_ANCHOR:'+a);return s.replace(a,()=>b);};
const OLD_RUN_CONTEXT='86ab4abf6a5ee55f6e3432a301febe55967884eda4131b76430db79d9dfa0f33';
const CURRENT_RUN_CONTEXT='7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30';
const overlays=Object.freeze([
 [204,'scripts/migrations/204-own-accounting-administrative-actor.sql',5,0,[]],
 [205,'scripts/migrations/205-own-imputation-preparation-authorization.sql',5,0,[]],
 [207,'scripts/migrations/207-own-journal-preparation-authorization.sql',5,0,[]],
 [203,'scripts/migrations/203-own-imputation-full-capacity.sql',3,6,['own_payroll_imputation_event_allocation_check'],'own_payroll_imputation_event'],
 [206,'scripts/migrations/206-own-journal-full-capacity.sql',3,6,['own_payroll_journal_event_source_snapshot_check','own_payroll_journal_event_journal_snapshot_check'],'own_payroll_journal_event']
]);

// Closed extraction of the function source embedded in the pinned protocols.
// This is not another installer/parser or an observed pg_proc definition.
function definitions(source){
 return [...source.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\([\s\S]*?\bAS\s+(\$[\w]*\$)[\s\S]*?\2\s*;?/g)].map(m=>m[0]);
}
function metadataArrays(source){
 const found=[...source.matchAll(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g)];
 assert.equal(found.length,2,'ACCOUNTING190_TWO_SOURCE_EPOCHS_REQUIRED');
 return found.map(m=>JSON.parse(m[1].replaceAll("''","'")));
}
function asRecord(p){
 const expression=typeof p.defaults==='string'?p.defaults:p.defaultExpressions;
 assert.equal(typeof expression,'string','ACCOUNTING190_KNOWN_DEFAULT_EXPRESSION_REQUIRED');
 const defaults=expression?expression.split(', ').length:0;if(typeof p.defaults==='number')assert.equal(p.defaults,defaults,'ACCOUNTING190_SOURCE_DEFAULT_COUNT_MISMATCH');
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
 const value=registry.get(record.name+'|'+record.bodySha256);assert.ok(value,'ACCOUNTING190_KNOWN_SOURCE_MISSING:'+record.name);
 assert.equal(hash(body(value)),record.bodySha256,'ACCOUNTING190_SOURCE_DIGEST_CHANGED');return value;
}

// The source-to-local digest fixed point is the same technique as canonical190.
// Every raw digest must have a complete known definition, including old epochs.
// Never reverse namespaces in observed prosrc and never infer an expected hash.
function sourceNormalizer(qa,registry){
 const hashes=new Map(Object.entries(qa.hashes));let stable=false;
 for(let pass=0;pass<24;pass++){let changed=false;
  for(const d of registry.values()){
   let local=qa.normalized(d);for(const [from,to] of hashes)local=local.replaceAll(from,to);
   const from=hash(body(d)),to=hash(body(local));
   if(hashes.get(from)!==to){hashes.set(from,to);changed=true;}
  }
  if(!changed){stable=true;break;}
 }
 assert.ok(stable,'ACCOUNTING190_SOURCE_DIGEST_GRAPH_UNRESOLVED');
 const normalize=source=>{let value=qa.normalized(source);for(const [from,to]of hashes)value=value.replaceAll(from,to);return value;};
 for(const d of registry.values())assert.equal(hashes.get(hash(body(d))),hash(body(normalize(d))),'ACCOUNTING190_WHOLE_LOCAL_SOURCE_DIGEST');
 return{normalize,hashes};
}

function metadataCheck(records,code){
 // All expressions/defaults/ACL flags are source-derived records. Catalog
 // observations below can only be compared with them, not replace them.
 return `DO $accounting190_metadata$ DECLARE expected jsonb;actual pg_proc;runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN
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
 END LOOP;END $accounting190_metadata$`;
}

function localRecords(records,registry,normalize){
 return records.map(record=>{
  sourceDefinition(registry,record);
  // Normalize the source-based JSON record and the whole source independently.
  const local=JSON.parse(normalize(JSON.stringify(record))),d=normalize(sourceDefinition(registry,record));
  assert.equal(local.bodySha256,hash(body(d)),'ACCOUNTING190_METADATA_LOCAL_BODY_MISMATCH:'+record.name);return local;
 });
}
function identityProof(records,version,epoch,sourceCommit){
 const signatures=records.map(r=>q(r.signature)+'::regprocedure').join(',');
 return `SELECT jsonb_build_object('version',${q(version)},'epoch',${q(String(epoch))},'sourceCommit',${q(sourceCommit)},'knownFunctionCount',${records.length},'identitySha256',encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${signatures}))::text,'sha256'),'hex'))`;
}

// Same table/row/security preservation frame as201, with only the declared
// function prosrc/new functions and203 allocation CHECK projected out.
function conservation(h,epoch,{changed=[],added=[],checks=[],checkTable='own_payroll_imputation_event'}){
 const schema=h.qa.schema,changedNames=changed.length?changed.map(q).join(','):"''",addedNames=added.length?added.map(q).join(','):"''",checkNames=checks.length?checks.map(q).join(','):"''";
 const snapshot=slot=>`DO $accounting190_preserve$ DECLARE target_relation record;rows_value jsonb:='[]';row_count bigint;fingerprint text;BEGIN
 FOR target_relation IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relkind IN('r','p','m') ORDER BY c.oid LOOP
 EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${q(schema)},target_relation.relname) INTO row_count,fingerprint;
 rows_value:=rows_value||jsonb_build_array(jsonb_build_object('oid',target_relation.oid,'rows',row_count,'sha256',fingerprint));END LOOP;
 PERFORM set_config('municontrol_accounting190_${epoch}.${slot}',jsonb_build_object('rows',rows_value,
 'tables',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace),
 'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'attributeDefaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_constraint c WHERE c.connamespace=${q(schema)}::regnamespace AND NOT(c.conname IN(${checkNames}) AND c.conrelid='${schema}.${checkTable}'::regclass)),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'functions',(SELECT coalesce(jsonb_agg(CASE WHEN p.proname IN(${changedNames}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname NOT IN(${addedNames})),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m),
 'defaultAcl',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d),'schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid=${q(schema)}::regnamespace))::text,true);END $accounting190_preserve$`;
 const compare=`DO $accounting190_conserve$ BEGIN IF current_setting('municontrol_accounting190_${epoch}.before')::jsonb IS DISTINCT FROM current_setting('municontrol_accounting190_${epoch}.after')::jsonb THEN RAISE EXCEPTION 'ACCOUNTING190_PRIOR_STATE_CHANGED';END IF;END $accounting190_conserve$`;
 const proof=`SELECT jsonb_build_object('version','own-accounting190-source-evolution.v1','epoch',${q(String(epoch))},'sourceCommit',${q(h.sourceCommit)},'preserved',true,'businessWrites',0,'priorStateSha256',encode(public.digest(current_setting('municontrol_accounting190_${epoch}.after')::jsonb::text,'sha256'),'hex'))`;
 return{before:snapshot('before'),after:snapshot('after'),compare,proof};
}

function finalImputationTableCheck(check,source203){
 // Keep every old table/ACL/index/FK/trigger/empty-ledger guard. Only the known
 // successor's allocation budget and exact family count are updated.
 let value=once(check,'octet_lengthallocation::text<=16777216','octet_lengthallocation::text<=33554432');
 value=once(value,"proname LIKE 'own_imputation_%')<>11","proname LIKE 'own_imputation_%')<>17");
 const marker=" SELECT * INTO checked_constraint FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_imputation_event_allocation_check';";
 const start=source203.lastIndexOf(marker),end=source203.indexOf(' SELECT to_jsonb(t) INTO table_after',start);
 assert.ok(start>=0&&end>start,'ACCOUNTING190_KNOWN203_CHECK_BLOCK_REQUIRED');const block=source203.slice(start,end);
 assert.equal((block.match(/SELECT \* INTO checked_constraint/g)??[]).length,3,'ACCOUNTING190_THREE203_NAMED_CHECKS');
 return [value,`DO $accounting190_final_checks$ DECLARE target_relation regclass:=to_regclass('public.own_payroll_imputation_event');checked_constraint pg_constraint;BEGIN\n${block}END $accounting190_final_checks$`];
}


function finalJournalTableCheck(check,source206){
 // Both known snapshot constraints evolve, but request8MiB and all original
 // columns/FKs/indexes/ACL/immutability/empty-ledger guards remain unchanged.
 let value=once(check,'octet_lengthsource_snapshot::text<=16777216','octet_lengthsource_snapshot::text<=33554432');
 value=once(value,'octet_lengthjournal_snapshot::text<=16777216','octet_lengthjournal_snapshot::text<=33554432');
 value=once(value,"proname LIKE 'own_journal_%')<>13","proname LIKE 'own_journal_%')<>19");
 const marker=" SELECT * INTO checked_constraint FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_journal_event_source_snapshot_check';";
 const start=source206.lastIndexOf(marker),end=source206.indexOf(' SELECT to_jsonb(t) INTO table_after',start);
 assert.ok(start>=0&&end>start,'ACCOUNTING190_KNOWN206_CHECK_BLOCK_REQUIRED');const block=source206.slice(start,end);
 assert.equal((block.match(/SELECT \* INTO checked_constraint/g)??[]).length,3,'ACCOUNTING190_THREE206_NAMED_CHECKS');
 return [value,`DO $accounting190_final_journal_checks$ DECLARE target_relation regclass:=to_regclass('public.own_payroll_journal_event');checked_constraint pg_constraint;BEGIN\n${block}END $accounting190_final_journal_checks$`];
}

export function composeOwnAccountingImputation190(h){
 assert.ok(h&&h.qa&&typeof h.read==='function'&&typeof h.json==='function'&&typeof h.check==='function');const qa=h.qa;
 assert.equal(qa.sourceCommit,h.sourceCommit);assert.equal(qa.operationalPairBaseline,'published107');assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const graph=qa.foundation.foundation.foundation.owner.graph;assert.ok(graph.pool instanceof Map,'ACCOUNTING190_SAME_CANONICAL_POOL_REQUIRED');
 const sourceHashes={},read=file=>{const expected=SOURCE_PINS[file]??qa.sourceHashes[file];assert.match(expected??'',/^[a-f0-9]{64}$/,'ACCOUNTING190_UNPINNED_SOURCE:'+file);const source=lf(h.read(file));assert.equal(hash(source),expected,'ACCOUNTING190_SOURCE_CHANGED:'+file);sourceHashes[file]=expected;return source;};
 // This explicit check covers constructor source modules as well as SQL inputs.
 for(const file of Object.keys(SOURCE_PINS))read(file);
 const decision=composeOwnFullCapacity190Installation({...h,read});
 const snapshot214=composeOwnCloseSnapshot214Plan({foundation:qa,major:qa.major,sourceCommit:h.sourceCommit,read:h.read});
 Object.assign(sourceHashes,snapshot214.sourceHashes);
 const authority=deriveClosedReportAuthorizationSource({read,operationalPairBaseline:'published107'}),authorityProtocol=buildOwnReportCensusAuthorityPins({read});
 const original=[
  [147,buildOwnAccountingInstallation({read,sourceCommit:h.sourceCommit}),assertOwnAccountingDurability],
  [148,buildOwnImputationInstallation({read,sourceCommit:h.sourceCommit}),assertOwnImputationDurability],
  [152,buildOwnJournalInstallation({read,sourceCommit:h.sourceCommit}),assertOwnJournalDurability]
 ];
 const overlaySources=new Map(overlays.map(([id,file])=>[id,read(file)]));
 const registry=sourceRegistry([...graph.pool.values(),...authority.definitions,...original.flatMap(([,batch])=>batch.migration.flatMap(definitions)),...[...overlaySources.values()].flatMap(definitions)]);
 const {normalize,hashes}=sourceNormalizer(qa,registry),known=new Map(authority.pins.map(p=>[p.signature,asRecord(p)])),epochs=[],bridges=[];
 const put=p=>{const record=asRecord(p);sourceDefinition(registry,record);known.set(record.signature,record);};
 const current=()=>[...known.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
 const currentCheck=records=>{localRecords(records,registry,normalize);return normalize(metadataCheck(records,'ACCOUNTING190_CURRENT_SOURCE_CHANGED'));};
 // The201 postflight is already relocalized by its canonical composer. Do not normalize it twice.
 const authorityChecks=[projectOwnCloseSnapshot214Postflight(h,snapshot214,decision.postflight),...[pinsCheck(authorityProtocol.pins,'ACCOUNTING190_AUTHORITY_CHANGED'),...authorityProtocol.checks].map(normalize)];
 const rawTables=new Map(original.map(([id,batch])=>[id,batch.tableCheck]));
 const currentTables=()=>[rawTables.get(147),rawTables.get(148),rawTables.get(152)].filter(Boolean).map(normalize);
 for(const [id,batch,durability]of original){
  const prerequisitePins=batch.prerequisitePins.map(pin=>{
   if(pin.name!=='own_run_context_v1')return pin;
   assert.equal(pin.sha256,OLD_RUN_CONTEXT,'ACCOUNTING190_OLD123_CONTEXT_REQUIRED');
   const currentDefinition=registry.get('own_run_context_v1|'+CURRENT_RUN_CONTEXT);assert.ok(currentDefinition,'ACCOUNTING190_SOURCE176_REQUIRED');
   const corrected={...ownInstallationFunctionPin(currentDefinition),runtime:pin.runtime};assert.deepEqual({...corrected,sha256:pin.sha256},pin,'ACCOUNTING190_ONLY_KNOWN_CONTEXT_BODY_TRANSITION');
   bridges.push({epoch:id,signature:pin.signature,from:OLD_RUN_CONTEXT,to:CURRENT_RUN_CONTEXT,source:'scripts/migrations/176-own-payroll-administrative-operator.sql'});return corrected;
  });
  for(const p of prerequisitePins)put(p);
  const preflight=pinsCheck(prerequisitePins,'ACCOUNTING190_'+id+'_PREREQUISITE_CHANGED');
  const replacePre=sql=>normalize(sql===batch.preflight?preflight:sql);
  for(const p of batch.ownPins)put(p);
  const records=current(),identity=normalize(identityProof(records,'own-accounting190-identity.v1',id,h.sourceCommit));
  epochs.push({id,kind:'original',sourceSha256:Object.values(batch.sourceHashes)[0],installation:[...authorityChecks,...batch.installation.map(replacePre)],verification:[...authorityChecks,currentCheck(records),...batch.durableVerification.map(replacePre)],identity:[currentCheck(records),identity],durability,originalGuardCount:batch.installation.length});
 }
 for(const [id,file,changedCount,addedCount,checkNames,checkTable]of overlays){
  const source=overlaySources.get(id),[pre,post]=metadataArrays(source);
  for(const p of pre){const record=asRecord(p),expected=known.get(record.signature);assert.ok(expected,'ACCOUNTING190_SUCCESSOR_PREREQUISITE_MISSING:'+record.name);assert.deepEqual(record,expected,'ACCOUNTING190_EXACT_ORDERED_SOURCE_EPOCH:'+id+':'+record.name);}
  const newNames=post.filter(p=>!known.has(p.signature)).map(p=>p.name),changedNames=post.filter(p=>known.has(p.signature)&&known.get(p.signature).bodySha256!==p.bodySha256).map(p=>p.name);
  assert.equal(newNames.length,addedCount,'ACCOUNTING190_DECLARED_ADDITIONS');assert.equal(changedNames.length,changedCount,'ACCOUNTING190_DECLARED_BODY_EVOLUTION');
  for(const p of post)put(p);
  if(id===203)rawTables.set(148,finalImputationTableCheck(rawTables.get(148),source).join(';\n'));
  if(id===206)rawTables.set(152,finalJournalTableCheck(rawTables.get(152),source).join(';\n'));
  const records=current(),keep=conservation(h,id,{changed:changedNames,added:newNames,checks:checkNames,...(checkTable?{checkTable}:{})}),identity=normalize(identityProof(records,'own-accounting190-identity.v1',id,h.sourceCommit));
  epochs.push({id,kind:'successor',sourceSha256:hash(source),installation:[...authorityChecks,keep.before,normalize(source),keep.after,keep.compare,currentCheck(records),...currentTables(),keep.proof],verification:[...authorityChecks,currentCheck(records),...currentTables(),keep.after,keep.proof],identity:[currentCheck(records),identity]});
 }
 assert.deepEqual(epochs.map(p=>p.id),[147,148,152,204,205,207,203,206],'ACCOUNTING190_FIXED_EPOCH_ORDER');
 const records=current(),finalIdentity=normalize(identityProof(records,'own-accounting190-identity.v1','final',h.sourceCommit)),finalFunctionVerification=[...authorityChecks,currentCheck(records),finalIdentity],finalVerification=[...authorityChecks,currentCheck(records),...currentTables(),finalIdentity];
 // After203 this union has the current detail wrapper. Never reuse207's old
 // dependency pin to205 detail as a final verifier or broaden that old pin.
 assert.equal(known.get('public.own_imputation_detail_v1(jsonb,uuid)').bodySha256,asRecord(metadataArrays(overlaySources.get(203))[1].find(p=>p.name==='own_imputation_detail_v1')).bodySha256);
 assert.equal(known.get('public.own_journal_detail_v1(jsonb,uuid)').bodySha256,asRecord(metadataArrays(overlaySources.get(206))[1].find(p=>p.name==='own_journal_detail_v1')).bodySha256);
 return{version:'own-accounting-imputation-190-source-plan.v1',sourceCommit:h.sourceCommit,schema:qa.schema,epochs,finalVerification,finalFunctionVerification,knownFunctionCount:records.length,sourceHashes,bridges,bodyMappingCount:hashes.size,normalization:'same190 source-known whole definitions; materialization/native proof still requires explicit admission',connects:false,executesSql:false};
}

export function ownAccountingImputation190Snapshot(h){return ownFullCapacity190Snapshot(h);}

// This future caller uses only the h.json already provided by canonical190.
// It is source only until separately admitted; no call occurs at module scope.
export async function installOwnAccountingImputation190(h){
 const plan=composeOwnAccountingImputation190(h),receipts=[];
 for(const epoch of plan.epochs){
  const before=ownAccountingImputation190Snapshot(h),rehearsal=h.json(epoch.installation,{end:'ROLLBACK',fullJson:true});
  assert.deepEqual(ownAccountingImputation190Snapshot(h),before,'ACCOUNTING190_REHEARSAL_MUST_ROLL_BACK');
  const installed=h.json(epoch.installation,{fullJson:true}),durable=h.json(epoch.verification,{readOnly:true,fullJson:true});
  if(epoch.kind==='original')epoch.durability({installed,durable,sourceCommit:h.sourceCommit});else assert.deepEqual(durable,installed,'ACCOUNTING190_SUCCESSOR_NOT_DURABLE');
  const identity=h.json(epoch.identity,{readOnly:true,fullJson:true}),freshIdentity=h.json(epoch.identity,{readOnly:true,fullJson:true});
  assert.deepEqual(freshIdentity,identity,'ACCOUNTING190_FRESH_IDENTITY_CHANGED');
  receipts.push({id:epoch.id,rehearsal,installed,durable,identity});h.check('same190 source epoch'+epoch.id+' admitted independently before its successor');
 }
 const final=h.json(plan.finalVerification,{readOnly:true,fullJson:true}),fresh=h.json(plan.finalVerification,{readOnly:true,fullJson:true});assert.deepEqual(fresh,final,'ACCOUNTING190_FINAL_SOURCE_IDENTITY_CHANGED');
 return{version:'own-accounting-imputation-190-installation.v1',sourceCommit:h.sourceCommit,schema:plan.schema,epochs:receipts,final,normalization:{sourceHashes:plan.sourceHashes,bodyMappingCount:plan.bodyMappingCount,bridges:plan.bridges},synthetic:true,productionWrites:0,journalFullCapacity:receipts.some(epoch=>epoch.id===206),municipalAcceptance:false};
}

// Future read-only native bookend after every positive accounting/imputation/
// journal command. Installation's table checks require empty ledgers; those are
// intentionally NOT reused after business writes. Source/authority/ACL/defaults
// and whole pg_proc identity must still equal the admitted installation epoch.
export function assertOwnAccountingImputation190SourceBookend(h,installation){
 assert.equal(installation?.sourceCommit,h.sourceCommit,'ACCOUNTING190_BOOKEND_SOURCE_COMMIT');assert.equal(installation?.schema,h.qa.schema,'ACCOUNTING190_BOOKEND_SCHEMA');
 assert.ok(installation.final&&typeof installation.final==='object','ACCOUNTING190_BOOKEND_INSTALLATION_IDENTITY_REQUIRED');
 const plan=composeOwnAccountingImputation190(h);assert.equal(plan.sourceCommit,installation.sourceCommit);assert.equal(plan.schema,installation.schema);
 const identity=h.json(plan.finalFunctionVerification,{readOnly:true,fullJson:true});
 assert.deepEqual(identity,installation.final,'ACCOUNTING190_POST_COMMAND_FUNCTION_IDENTITY_CHANGED');
 assert.equal(identity.knownFunctionCount,plan.knownFunctionCount);assert.equal(identity.sourceCommit,h.sourceCommit);assert.match(identity.identitySha256,/^[a-f0-9]{64}$/);
 return{version:'own-accounting-imputation-190-function-bookend.v1',sourceCommit:h.sourceCommit,schema:plan.schema,knownFunctionCount:identity.knownFunctionCount,identitySha256:identity.identitySha256,passed:true,scope:'function-source-authority-and-identity',ledgerEmptinessRequired:false};
}
