// Inert, source-derived conservation for the NEW atomic protocol only.
// C is structural catalogue (including roles and pg_sequence), never rows or
// sequence values. F reads user rows only inside one R/I transaction. Neither
// RR nor ROLLBACK is claimed to preserve last_value/is_called/cache state.
// No heavy verifier import, eval, connection, catalogue input or SQL execution.
// SQL208's pinned to_jsonb(pg_class) may stop on in-place VACUUM statistics.
// This inherited failure remains UNCERTAIN; this module neither changes208 nor
// declares NOT_COMMITTED. Disposition needs separately admitted observation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const NATIVE='scripts/lib/native-leave-installation.mjs';
const DOCUMENTARY='scripts/lib/adopted-documentary-installation.mjs';
const PERFORMANCE='scripts/verify-documentary-roster-performance.mjs';
const TAIL='scripts/lib/own-m7-public-annulment208209.mjs';
const SQL208='scripts/migrations/208-own-annulment-review-index.sql';
const SQL209='scripts/migrations/209-own-annulment-preparation-projection.sql';
const sha=value=>createHash('sha256').update(value).digest('hex');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const OWN_ANNULMENT_ATOMIC_PRESERVATION_SOURCE_PINS=freeze({
 [NATIVE]:{bytes:18492,sha256:'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef'},
 [DOCUMENTARY]:{bytes:15507,sha256:'9d420e046e9debbef0e584aa47f965f495214bdb4fa6db5de4564edb917d707b'},
 [PERFORMANCE]:{bytes:35137,sha256:'e058f3450118b23bf16ee1cf7e75b866624153246ce163aed3bf3c96d5f96124'},
 [TAIL]:{bytes:50460,sha256:'040bb2dfac141dce27d5a6822b613c0646487e34fb1a9ac5b1e36e47d9142d5b'},
 [SQL208]:{bytes:26873,sha256:'2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402'},
 [SQL209]:{bytes:39720,sha256:'eabc4f72cc0203a87af50287fcb6367a2ca81e6f957e73b5ee1c2b868aeb6dc4'}
});
const PREFIX='municontrol_annul_atomic.';
export const OWN_ANNULMENT_ATOMIC_PRESERVATION_SLOTS=freeze({
 catalog:{epoch:PREFIX+'catalog_epoch',rehearsalBefore:PREFIX+'catalog_rehearsal_before',rehearsalAfter:PREFIX+'catalog_rehearsal_after',rollbackObserver:PREFIX+'catalog_rollback_observer',installationBefore:PREFIX+'catalog_installation_before',installationAfter:PREFIX+'catalog_installation_after',durable:PREFIX+'catalog_durable'},
 rows:{rehearsal:{before:PREFIX+'rows_rehearsal_before',after:PREFIX+'rows_rehearsal_after'},installation:{before:PREFIX+'rows_installation_before',after:PREFIX+'rows_installation_after'}}
});
const SLOT=OWN_ANNULMENT_ATOMIC_PRESERVATION_SLOTS;
const ROW_EXECUTE=`EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(h, '''' ORDER BY h COLLATE "C"),''''),''sha256''),''hex'') FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') h FROM %I.%I r) hashed',c.nspname,c.relname) INTO n,h;`;
const SEQUENCE_EXECUTE=`EXECUTE format('SELECT encode(public.digest(jsonb_build_object(''last_value'',last_value,''is_called'',is_called)::text,''sha256''),''hex'') FROM %I.%I',c.nspname,c.relname) INTO h;`;

function exactOptions(options){
 assert.ok(options&&typeof options==='object'&&!Array.isArray(options),'ATOMIC_PRESERVATION_OPTIONS');
 assert.deepEqual(Reflect.ownKeys(options).sort(),['ownFunctionNames','readRaw','sourceCommit'],'ATOMIC_PRESERVATION_EXACT_SOURCE_INPUTS');
 assert.equal(typeof options.readRaw,'function','ATOMIC_PRESERVATION_RAW_READER');assert.match(options.sourceCommit??'',/^[a-f0-9]{40}$/,'ATOMIC_PRESERVATION_COMMIT');
 const names=options.ownFunctionNames;assert.ok(Array.isArray(names),'ATOMIC_PRESERVATION_NAMES_ARRAY');
 assert.deepEqual(Reflect.ownKeys(names),[...Array.from({length:10},(_,i)=>String(i)),'length'],'ATOMIC_PRESERVATION_DENSE_TEN_NAMES');
}
function loadSources(readRaw){
 const texts={},sourceHashes={};for(const[file,pin]of Object.entries(OWN_ANNULMENT_ATOMIC_PRESERVATION_SOURCE_PINS)){
  const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'ATOMIC_PRESERVATION_RAW_BUFFER:'+file);
  assert.equal(raw.length,pin.bytes,'ATOMIC_PRESERVATION_SOURCE_BYTES:'+file);assert.equal(sha(raw),pin.sha256,'ATOMIC_PRESERVATION_SOURCE_SHA:'+file);
  const text=raw.toString('utf8');assert.deepEqual(Buffer.from(text,'utf8'),raw,'ATOMIC_PRESERVATION_UTF8');assert.ok(!text.includes('\r'),'ATOMIC_PRESERVATION_LF');texts[file]=text;sourceHashes[file]=pin.sha256;
 }return{texts,sourceHashes};
}
function sourceTemplate(source,marker){
 assert.equal(source.split(marker).length,2,'ATOMIC_PRESERVATION_TEMPLATE_ANCHOR');const start=source.indexOf(marker)+marker.length,end=source.indexOf('`',start);assert.ok(end>start,'ATOMIC_PRESERVATION_TEMPLATE_END');
 const text=source.slice(start,end);assert.ok(!text.includes('\\'),'ATOMIC_PRESERVATION_TEMPLATE_ESCAPE_UNSUPPORTED');return text;
}
function expand(template,values){
 return template.replace(/\$\{([^}]*)\}/g,(_,key)=>{assert.ok(Object.hasOwn(values,key),'ATOMIC_PRESERVATION_CLOSED_INTERPOLATION:'+key);return values[key];});
}
function finite(source,from,to,label,count=1){
 assert.ok(from.length>0);assert.equal(source.split(from).length,count+1,'ATOMIC_PRESERVATION_FINITE_ANCHOR:'+label);
 const inverse=[];let after=source,offset=0;
 for(let i=0;i<count;i++){
  const at=after.indexOf(from,offset);assert.ok(at>=0);after=after.slice(0,at)+to+after.slice(at+from.length);inverse.push({at,from,to});offset=at+to.length;
 }
 let restored=after;for(const op of [...inverse].reverse()){assert.equal(restored.slice(op.at,op.at+op.to.length),op.to,'ATOMIC_PRESERVATION_INVERSE_SPAN');restored=restored.slice(0,op.at)+op.from+restored.slice(op.at+op.to.length);}
 assert.equal(restored,source,'ATOMIC_PRESERVATION_WHOLE_INVERSE:'+label);
 return{after,inverse,record:{label,occurrences:count,fromBytes:Buffer.byteLength(from),toBytes:Buffer.byteLength(to),fromSha256:sha(from),toSha256:sha(to),beforeSha256:sha(source),afterSha256:sha(after),wholeInverseVerified:true}};
}
function chain(source){
 const original=source,ops=[],records=[];let current=source;
 return{
  edit(from,to,label,count=1){const value=finite(current,from,to,label,count);current=value.after;ops.push(value.inverse);records.push(value.record);return current;},
  value:()=>current,
  finish(){let restored=current;for(const group of [...ops].reverse())for(const op of [...group].reverse()){assert.equal(restored.slice(op.at,op.at+op.to.length),op.to);restored=restored.slice(0,op.at)+op.from+restored.slice(op.at+op.to.length);}assert.equal(restored,original,'ATOMIC_PRESERVATION_COMPLETE_CHAIN_INVERSE');return{sql:current,records,originalSha256:sha(original),afterSha256:sha(current),wholeInverseVerified:true};}
 };
}
function performanceSnapshot(texts){
 const native=texts[NATIVE],documentary=texts[DOCUMENTARY],performance=texts[PERFORMANCE];
 const base=expand(sourceTemplate(native,'return `DO $snapshot$'),{slot:'after'});
 const original='DO $snapshot$'+base,c=chain(original);
 const helper=/^const helperSignature='([^']+)';$/m.exec(documentary)?.[1],namespace=/^const namespace="([^"\n]+)";$/m.exec(documentary)?.[1],prefix=/^const prefix='([^']+)';$/m.exec(documentary)?.[1];
 assert.ok(helper&&namespace&&prefix,'ATOMIC_PRESERVATION_DOCUMENTARY_CONSTANTS');
 const signatureBlock=/const signatures=Object\.freeze\(\[([^]*?)\]\);/.exec(documentary)?.[1];assert.ok(signatureBlock);
 const signatures=[...signatureBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.equal(signatures.length,3);
 const ids=signatures.map(s=>'to_regprocedure('+q(s)+')').join(',');
 c.edit(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'','documentary:remove-two-leave-table-exclusions',2);
 c.edit("p.relkind IN ('r','p')","p.relkind IN ('r','p','m')",'documentary:materialized-rows');
 const helperExclusion='AND p.oid IS DISTINCT FROM to_regprocedure('+q(helper)+')';
 c.edit("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",helperExclusion,'documentary:one-helper-exclusion');
 const protectedBodies=`(CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`;
 c.edit('to_jsonb(p)::text',protectedBodies,'documentary:three-facade-metadata');
 c.edit('p.oid,p.relname,s.nspname FROM pg_class p','p.*,s.nspname FROM pg_class p','documentary:sequence-class-fields');
 const sequenceMetadata=sourceTemplate(documentary,'sql=once(sql,"jsonb_build_object(\'oid\',c.oid,\'hash\',h)",`');
 c.edit("jsonb_build_object('oid',c.oid,'hash',h)",expand(sequenceMetadata,{}),'documentary:pg_sequence-definition-and-ownership');
 const foreign=expand(sourceTemplate(documentary,'sql=once(sql," BEGIN\\n FOR c",`'),{namespace});
 c.edit(' BEGIN\n FOR c',foreign,'documentary:foreign-table-guard');
 const extras=expand(sourceTemplate(documentary,"sql=once(sql,' PERFORM set_config',`"),{namespace});
 c.edit(' PERFORM set_config',extras,'documentary:structural-types-relations-attributes-indexes-events');
 c.edit('municontrol_sql111.',prefix+'.','documentary:local-slot-prefix');
 assert.ok(performance.includes("let sql=documentaryInstallationSnapshot('after')")&&performance.includes('sql=once(sql,"AND p.oid IS DISTINCT FROM to_regprocedure(\'public.payroll_document_subject_v1(jsonb,uuid)\')",\'\')'),'ATOMIC_PRESERVATION_PERFORMANCE_SOURCE_OPERATOR');
 c.edit(helperExclusion,'','performance:restore-complete-helper-metadata');
 assert.ok(performance.includes('"(CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-\'prosrc\' ELSE to_jsonb(p) END)::text",\'to_jsonb(p)::text\''),'ATOMIC_PRESERVATION_PERFORMANCE_BODY_OPERATOR');
 c.edit(protectedBodies,'to_jsonb(p)::text','performance:restore-all-facade-bodies');
 assert.ok(!c.value().includes('native_leave_')&&!c.value().includes("to_jsonb(p)-'prosrc'"),'ATOMIC_PRESERVATION_OLD_EXCLUSION_LEFT');
 return c.finish();
}
function maskStringsAndComments(source){
 let out='',single=false,line=false,block=0;
 for(let i=0;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(line){out+=' ';if(c==='\n'){line=false;out+='\n';}continue;}
  if(block){out+=' ';if(c==='/'&&n==='*'){block++;i++;out+=' ';}else if(c==='*'&&n==='/'){block--;i++;out+=' ';}continue;}
  if(single){out+=' ';if(c==="'"&&n==="'"){i++;out+=' ';}else if(c==="'")single=false;continue;}
  if(c==='-'&&n==='-'){line=true;i++;out+='  ';continue;}
  if(c==='/'&&n==='*'){block=1;i++;out+='  ';continue;}
  if(c==="'"){single=true;out+=' ';continue;}out+=c;
 }
 assert.ok(!single&&!block,'ATOMIC_PRESERVATION_AUDIT_UNCLOSED');return out;
}
function ddlAudit(texts){
 const functions=[],stages=[];
 for(const[file,stage,count,runtime]of[[SQL208,208,7,4],[SQL209,209,3,2]]){
  const source=texts[file],pattern=new RegExp('EXECUTE \\$definition_'+stage+'\\$(CREATE FUNCTION public\\.([a-z0-9_]+)\\([^]*?)\\$definition_'+stage+'\\$;','g');
  const definitions=[...source.matchAll(pattern)];assert.equal(definitions.length,count,'ATOMIC_PRESERVATION_STORED_DEFINITIONS');
  const c=chain(source);for(const definition of definitions){const name=definition[2];functions.push(name);c.edit(definition[0],'NULL;','ddl:'+stage+':store-only:'+name);}
  const outside=c.finish();
  const acls=[...outside.sql.matchAll(/^\s*(REVOKE ALL|GRANT EXECUTE) ON FUNCTION public\.([a-z0-9_]+)\([^;]*?\) (FROM PUBLIC,municontrol_actions_runtime_app|TO municontrol_actions_runtime_app);$/gm)];
  assert.equal(acls.filter(m=>m[1]==='REVOKE ALL').length,count);assert.equal(acls.filter(m=>m[1]==='GRANT EXECUTE').length,runtime);
  for(const acl of acls)assert.ok(definitions.some(d=>d[2]===acl[2]),'ATOMIC_PRESERVATION_ACL_ONLY_NEW_FUNCTIONS');
  let auditedOutside=outside.sql;for(const acl of acls){assert.equal(auditedOutside.split(acl[0]).length,2);auditedOutside=auditedOutside.replace(acl[0],'NULL;');}
  const tokens=maskStringsAndComments(auditedOutside);
  assert.ok(!/\b(?:nextval|setval|currval|lastval|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|COPY|CALL|EXECUTE|GRANT|REVOKE)\b/i.test(tokens),'ATOMIC_PRESERVATION_DDL_HAS_OUTER_SIDE_EFFECT');
  assert.ok(!/\b(?:FROM|JOIN)\s+public\.|\bPERFORM\s+public\./i.test(tokens),'ATOMIC_PRESERVATION_DDL_CALLS_BUSINESS');
  stages.push({file,stage,functions:count,runtimeFacades:runtime,privateHelpers:count-runtime,sourceSha256:sha(source),storedDefinitionSpans:definitions.map(m=>({name:m[2],startByte:Buffer.byteLength(source.slice(0,m.index)),bytes:Buffer.byteLength(m[0]),sha256:sha(m[0])})),storedBodyRemovalWholeInverseVerified:outside.wholeInverseVerified,outsideSha256:outside.afterSha256,noOuterSequenceCalls:true,noOuterBusinessDdlOrDml:true,invokesStoredBodies:false});
 }
 assert.equal(new Set(functions).size,10,'ATOMIC_PRESERVATION_TEN_UNIQUE_FUNCTIONS');return{functions,stages};
}
function catalogueBase(performance,texts,names){
 const c=chain(performance.sql),functionAnchor="FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 c.edit(functionAnchor,functionAnchor+` AND NOT(s.nspname='public' AND p.proname=ANY(ARRAY[${names.map(q).join(',')}]))`,'atomic:exclude-only-ten-function-catalogue-records');
 const ids=names.map(name=>`SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${q(name)}`).join(' UNION ALL ');
 const owns=`(d.classid='pg_proc'::regclass AND d.objid IN(${ids}))`;
 const extras=expand(sourceTemplate(texts[TAIL],'const extras=`'),{"owns('d')":owns,ownIds:ids});
 c.edit(' PERFORM set_config',extras,'atomic:source209-dependencies-descriptions-labels-rewrites-extensions');
 c.edit(ROW_EXECUTE,'n:=NULL;h:=NULL;/*atomic-catalog:row-values-excluded*/','atomic:catalogue-excludes-row-values');
 c.edit(SEQUENCE_EXECUTE,'h:=NULL;/*atomic-catalog:sequence-values-excluded*/','atomic:catalogue-excludes-sequence-values');
 assert.ok(!c.value().includes('FROM %I.%I'),'ATOMIC_PRESERVATION_CATALOG_DATA_READ_LEFT');
 return c.finish();
}
const CONTEXT=`IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('search_path')<>'pg_catalog, public, pg_temp' OR current_setting('standard_conforming_strings')<>'on' OR current_setting('server_version_num')::integer/10000 NOT IN(17,18) OR current_setting('check_function_bodies')<>'on' OR current_setting('session_replication_role')<>'origin' OR current_setting('row_security')<>'off' THEN RAISE EXCEPTION 'ANNUL_ATOMIC_PRESERVATION_CONTEXT';END IF;`;
const ROW_CONTEXT=CONTEXT+`\n IF current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'ANNUL_ATOMIC_ROWS_REQUIRE_RW_PHASE';END IF;`;
const EVENTS=`IF EXISTS(SELECT 1 FROM pg_event_trigger WHERE evtenabled<>'D') THEN RAISE EXCEPTION 'ANNUL_ATOMIC_ENABLED_EVENT_TRIGGER';END IF;`;
const FOREIGN=`IF EXISTS(SELECT 1 FROM pg_class atomic_foreign_relation JOIN pg_namespace s ON s.oid=atomic_foreign_relation.relnamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND atomic_foreign_relation.relkind='f') THEN RAISE EXCEPTION 'ANNUL_ATOMIC_FOREIGN_TABLE';END IF;`;
// The same complete r/p/m domain as F, before its first dynamic SELECT. off
// never disables RLS: it makes accidental policy evaluation fail with ERROR.
const NO_POLICY_EVALUATION=`IF EXISTS(SELECT 1 FROM pg_class atomic_policy_relation JOIN pg_namespace s ON s.oid=atomic_policy_relation.relnamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND atomic_policy_relation.relkind IN('r','p','m') AND atomic_policy_relation.relrowsecurity AND(atomic_policy_relation.relforcerowsecurity OR atomic_policy_relation.relowner<>current_user::regrole)) THEN RAISE EXCEPTION 'ANNUL_ATOMIC_ROW_POLICY_EVALUATION';END IF;`;
// Primary-source policy reviewed by root, never learned from a target catalogue:
// https://raw.githubusercontent.com/postgres/postgres/REL_17_11/contrib/pgcrypto/pgcrypto--1.3.sql
// https://raw.githubusercontent.com/postgres/postgres/REL_17_11/contrib/pgcrypto/pgcrypto.control
// https://raw.githubusercontent.com/postgres/postgres/REL_18_0/contrib/pgcrypto/pgcrypto.control
// https://raw.githubusercontent.com/postgres/postgres/REL_18_0/contrib/pgcrypto/pgcrypto--1.3--1.4.sql
// https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/backend/commands/extension.c
// PG18 may retain1.3 after a database upgrade;1.4 adds fips_mode, not a digest
// replacement. Trusted-extension C functions may belong to bootstrap SU rather
// than the extension owner. Do not demand an observed owner/ACL, grant rights,
// call digest, or upgrade the extension to satisfy this catalogue-only guard.
const DIGEST_SOURCE_GUARD=`DECLARE digest_extension pg_catalog.pg_extension;digest_function pg_catalog.pg_proc;digest_signature text;digest_first_type oid;digest_runtime oid:=pg_catalog.to_regrole('municontrol_actions_runtime_app');digest_bootstrap_owner oid;digest_major integer:=pg_catalog.current_setting('server_version_num')::integer/10000;BEGIN
 SELECT * INTO digest_extension FROM pg_catalog.pg_extension WHERE extname='pgcrypto';
 SELECT proowner INTO digest_bootstrap_owner FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('pg_catalog.clock_timestamp()');
 IF digest_runtime IS NULL OR digest_bootstrap_owner IS NULL OR digest_bootstrap_owner=digest_runtime OR digest_extension.oid IS NULL
 OR digest_extension.extnamespace IS DISTINCT FROM 'public'::regnamespace OR digest_extension.extowner=digest_runtime
 OR NOT((digest_major=17 AND digest_extension.extversion='1.3') OR(digest_major=18 AND digest_extension.extversion IN('1.3','1.4')))
 OR(SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace AND proname='digest')<>2
 THEN RAISE EXCEPTION 'ANNUL_ATOMIC_DIGEST_EXTENSION_SOURCE';END IF;
 FOREACH digest_signature IN ARRAY ARRAY['public.digest(text,text)','public.digest(bytea,text)'] LOOP
 SELECT * INTO digest_function FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(digest_signature);
 digest_first_type:=CASE digest_signature WHEN 'public.digest(text,text)' THEN 'pg_catalog.text'::regtype::oid ELSE 'pg_catalog.bytea'::regtype::oid END;
 IF digest_function.oid IS NULL OR digest_function.pronamespace IS DISTINCT FROM 'public'::regnamespace OR digest_function.proname<>'digest'
 OR digest_function.pronargs<>2 OR digest_function.proargtypes[0] IS DISTINCT FROM digest_first_type OR digest_function.proargtypes[1] IS DISTINCT FROM 'pg_catalog.text'::regtype::oid
 OR digest_function.prorettype IS DISTINCT FROM 'pg_catalog.bytea'::regtype OR digest_function.prokind<>'f' OR digest_function.proretset OR NOT digest_function.proisstrict OR digest_function.prosecdef
 OR(SELECT lanname FROM pg_catalog.pg_language WHERE oid=digest_function.prolang) IS DISTINCT FROM 'c'
 OR digest_function.prosrc IS DISTINCT FROM 'pg_digest' OR digest_function.probin IS DISTINCT FROM '$libdir/pgcrypto' OR digest_function.provolatile<>'i' OR digest_function.proparallel<>'s'
 OR digest_function.pronargdefaults<>0 OR digest_function.proargdefaults IS NOT NULL OR digest_function.proargnames IS NOT NULL OR digest_function.proargmodes IS NOT NULL OR digest_function.proallargtypes IS NOT NULL OR digest_function.proconfig IS NOT NULL OR digest_function.prosqlbody IS NOT NULL
 OR digest_function.proowner=digest_runtime OR digest_function.proowner NOT IN(digest_bootstrap_owner,digest_extension.extowner)
 OR NOT pg_catalog.has_function_privilege(current_user,digest_function.oid,'EXECUTE')
 OR(SELECT count(*) FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=digest_function.oid AND d.deptype='e')<>1
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=digest_function.oid AND d.objsubid=0 AND d.refclassid='pg_catalog.pg_extension'::regclass AND d.refobjid=digest_extension.oid AND d.refobjsubid=0 AND d.deptype='e')
 THEN RAISE EXCEPTION 'ANNUL_ATOMIC_DIGEST_FUNCTION_SOURCE' USING DETAIL=digest_signature;END IF;
 END LOOP;END;`;
const DIGEST_AUTHORITY=freeze({versionsByMajor:{17:['1.3'],18:['1.3','1.4']},schema:'public',signatures:['public.digest(text,text)','public.digest(bytea,text)'],returns:'bytea',language:'c',prosrc:'pg_digest',probin:'$libdir/pgcrypto',volatility:'i',parallel:'s',strict:true,securityDefiner:false,returnsSet:false,ownerPolicy:'pg_catalog.clock_timestamp owner or extension owner; neither may be runtime',aclPolicy:'no fixed observed ACL; current_user EXECUTE required and C preserves ACLs',expectedFromObservedMetadata:false,primarySourceReferences:[
 'https://raw.githubusercontent.com/postgres/postgres/REL_17_11/contrib/pgcrypto/pgcrypto--1.3.sql',
 'https://raw.githubusercontent.com/postgres/postgres/REL_17_11/contrib/pgcrypto/pgcrypto.control',
 'https://raw.githubusercontent.com/postgres/postgres/REL_18_0/contrib/pgcrypto/pgcrypto.control',
 'https://raw.githubusercontent.com/postgres/postgres/REL_18_0/contrib/pgcrypto/pgcrypto--1.3--1.4.sql',
 'https://raw.githubusercontent.com/postgres/postgres/REL_17_11/src/backend/commands/extension.c'
]});
function rowStatement(performance,slot){
 const loop=/\n (FOR c IN SELECT [^\n]*p\.relkind IN \('r','p','m'\)[^\n]* LOOP)\n/.exec(performance.sql)?.[1];assert.ok(loop,'ATOMIC_PRESERVATION_ROW_LOOP_SOURCE');assert.equal(performance.sql.split(ROW_EXECUTE).length,2,'ATOMIC_PRESERVATION_ROW_EXECUTE_SOURCE');
 return `DO $annul_atomic_rows$ DECLARE c record;n bigint;h text;tables jsonb:='[]';BEGIN
 ${ROW_CONTEXT}\n ${EVENTS}\n ${FOREIGN}\n ${NO_POLICY_EVALUATION}\n ${DIGEST_SOURCE_GUARD}
 ${loop}
 ${ROW_EXECUTE}
 tables:=tables||jsonb_build_array(jsonb_build_object('oid',c.oid,'schema',c.nspname,'name',c.relname,'rows',n,'rowsSha256',h));END LOOP;
 PERFORM set_config(${q(slot)},jsonb_build_object('tables',tables,'backendPid',pg_backend_pid(),'transactionStartedAt',transaction_timestamp())::text,true);
 END $annul_atomic_rows$`;
}
function rowComparison(slots){return `DO $annul_atomic_rows_compare$ DECLARE before_value text:=current_setting(${q(slots.before)},true);after_value text:=current_setting(${q(slots.after)},true);BEGIN
 ${ROW_CONTEXT}
 IF before_value IS NULL OR before_value='' OR after_value IS NULL OR after_value='' THEN RAISE EXCEPTION 'ANNUL_ATOMIC_ROWS_SAME_TRANSACTION_REQUIRED';END IF;
 IF(before_value::jsonb->>'backendPid')::integer IS DISTINCT FROM pg_backend_pid() OR(after_value::jsonb->>'backendPid')::integer IS DISTINCT FROM pg_backend_pid()
 OR(before_value::jsonb->>'transactionStartedAt') IS DISTINCT FROM(to_jsonb(transaction_timestamp())#>>'{}') OR(after_value::jsonb->>'transactionStartedAt') IS DISTINCT FROM(to_jsonb(transaction_timestamp())#>>'{}')
 OR before_value::jsonb IS DISTINCT FROM after_value::jsonb THEN RAISE EXCEPTION 'ANNUL_ATOMIC_ROWS_CHANGED_WITHIN_TRANSACTION';END IF;
 END $annul_atomic_rows_compare$`;}

export function buildOwnAnnulmentAtomicPreservation(options){
 exactOptions(options);const{readRaw,sourceCommit,ownFunctionNames}=options,{texts,sourceHashes}=loadSources(readRaw),audit=ddlAudit(texts);
 assert.deepEqual(ownFunctionNames,audit.functions,'ATOMIC_PRESERVATION_EXACT_SOURCE_FUNCTION_NAMES');
 const performance=performanceSnapshot(texts),catalogue=catalogueBase(performance,texts,audit.functions),catalog={},catalogHashes={};
 const slotRecords=[];
 for(const[key,slot]of Object.entries(SLOT.catalog)){
  const c=chain(catalogue.sql);c.edit('municontrol_documentary_install.after',slot,'atomic:closed-catalogue-slot:'+key);c.edit(' BEGIN\n',' BEGIN\n '+CONTEXT+'\n '+EVENTS+'\n '+NO_POLICY_EVALUATION+'\n '+DIGEST_SOURCE_GUARD+'\n','atomic:catalogue-context-event-policy-and-digest-source-guards');
  const result=c.finish();catalog[key]=result.sql;catalogHashes[key]=sha(result.sql);slotRecords.push({key,slot,records:result.records,wholeInverseVerified:result.wholeInverseVerified});
 }
 const rows={},rowHashes={};for(const[phase,slots]of Object.entries(SLOT.rows)){
  rows[phase]={before:rowStatement(performance,slots.before),after:rowStatement(performance,slots.after),compare:rowComparison(slots)};
  rowHashes[phase]=Object.fromEntries(Object.entries(rows[phase]).map(([key,statement])=>[key,sha(statement)]));
 }
 const preconditionGuard=`DO $annul_atomic_preservation_precondition$ BEGIN\n ${CONTEXT}\n ${EVENTS}\n ${FOREIGN}\n ${NO_POLICY_EVALUATION}\n ${DIGEST_SOURCE_GUARD}\n END $annul_atomic_preservation_precondition$`;
 return freeze({version:'own-annulment-atomic-preservation.v1',sourceCommit,sourceHashes,ownFunctionNames:[...audit.functions],slots:SLOT,preconditionGuard,catalog,rows,
  statementHashes:{preconditionGuard:sha(preconditionGuard),catalog:catalogHashes,rows:rowHashes},
  derivation:{performance:{nativeSnapshotSha256:performance.originalSha256,derivedSnapshotSha256:performance.afterSha256,records:performance.records,wholeInverseVerified:performance.wholeInverseVerified},catalogue:{records:catalogue.records,wholeInverseVerified:catalogue.wholeInverseVerified},slots:slotRecords,ddl:audit.stages},
  digestAuthority:DIGEST_AUTHORITY,
  scope:{catalogue:'structural-with-roles-memberships-and-pg_sequence-definitions',rowComparison:'same-backend-same-RR-transaction-only',rowPhases:['rehearsal','installation'],rowsComparedAcrossTransactions:false,sequenceValuesObserved:false,sequenceValuesConserved:false,sequenceDefinitionsPreserved:true,storedBodiesInvoked:false,requiresNoEnabledEventTriggers:true,requiresNoForeignTables:true,requiresNoRowPolicyEvaluation:true,requiresCheckFunctionBodiesOn:true,requiresOriginReplicationRole:true,requiresRowSecurityOff:true,digestSourceAuthorityGuardIncluded:true,excludedFunctions:10},
  limitations:{inheritedSql208PhysicalCatalogStop:{source:SQL208,token:'OWN_ANNUL_REVIEW_EXISTING_RELATION_CHANGED',cause:'pinned full pg_class snapshot may see in-place VACUUM/ANALYZE statistics',disposition:'UNCERTAIN',separateReadOnlyObservationRequired:true},digestIdentityExpectedFromObservedMetadata:false},
  sourceBookend:()=>{const current=loadSources(readRaw);assert.deepEqual(current.sourceHashes,sourceHashes,'ATOMIC_PRESERVATION_SOURCE_BOOKEND');return{sourceCommit,sourceHashes:{...sourceHashes},sourceOnly:true};},
  connects:false,executesSql:false,observedCatalogUsed:false,nominalRowsReturned:0,businessWrites:0,executionAdmitted:false});
}
