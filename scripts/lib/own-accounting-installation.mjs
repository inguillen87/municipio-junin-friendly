// Review-only installation builder. No connection or execution in this module.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { splitPostgresStatements } from './sql-statements.mjs';
import { ownInstallationFunctionPin } from './own-payroll-installation.mjs';
import { pinsCheck, preservationSnapshot } from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const table='own_payroll_accounting_event',facades=new Set(['own_accounting_bootstrap_v1','own_accounting_detail_v1','own_accounting_attempt_v1','own_accounting_command_v1']);
export const SQL147_SHA256='7ad5a7e143a2e03437b5e3077581c32220a730bc3f72f2a6711fb2bc70ab2360';
const columns=[['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['proposal_id','uuid',false],['command','text'],['body','jsonb'],['base_definition','jsonb'],['source_snapshot','jsonb'],['revision','integer'],['actor_membership_id','uuid'],['actor_person_id','uuid'],['actor_email','text'],['actor_session_id','uuid'],['actor_session_version','integer'],['release_sha','text'],['actor_label','text'],['request_key','uuid'],['request_sha256','text'],['receipt','jsonb'],['recorded_at','timestamp with time zone',true,'clock_timestamp()']].map(([n,t,required=true,value=null])=>[n,t,required,value]);
const foreigns=[[['tenant_id'],'public.platform_tenant',['id']],[['proposal_id'],'public.'+table,['id']],[['actor_person_id'],'public.person_identity',['id']],[['actor_session_id'],'public.tenant_identity_session',['id']],[['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],[['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']]];
const checks=[
 "CHECK (command = ANY (ARRAY['propose'::text, 'approve'::text, 'reject'::text]))",
 "CHECK ((jsonb_typeof(body) = 'object'::text) AND (octet_length(body::text) <= 8388608))",
 "CHECK (jsonb_typeof(base_definition) = ANY (ARRAY['null'::text, 'object'::text]))",
 "CHECK ((jsonb_typeof(source_snapshot) = 'object'::text) AND (octet_length(source_snapshot::text) <= 8388608))",
 'CHECK ((revision >= 0) AND (revision <= 1000))',
 'CHECK (actor_email = lower(actor_email))',
 'CHECK (actor_session_version > 0)',
 "CHECK (release_sha ~ '^[a-f0-9]{40}$'::text)",
 "CHECK (request_key::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'::text)",
 "CHECK (request_sha256 ~ '^[a-f0-9]{64}$'::text)",
 "CHECK ((command = 'propose'::text) = (proposal_id IS NULL))",
].map(v=>v.replace(/[\s()]/g,'')).sort();
export function accountingSnapshot(slot){
 return preservationSnapshot(slot).replaceAll('native_leave_event',table).replaceAll('native_leave_%','own_accounting_%').replaceAll('municontrol_sql111','municontrol_sql147').replace("p.oid IS DISTINCT FROM to_regclass('public."+table+"')),","p.oid IS DISTINCT FROM to_regclass('public."+table+"') AND NOT(t.tgisinternal AND t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid=to_regclass('public."+table+"') AND contype='f'))),");
}
export function buildOwnAccountingInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);const file='scripts/migrations/147-own-payroll-accounting-mappings.sql',source=lf(read(file)),statements=splitPostgresStatements(source);
 assert.equal(hash(source),SQL147_SHA256,'ACCOUNTING_REVIEWED_SOURCE_CHANGED');
 const ownPins=statements.filter(s=>/^CREATE FUNCTION public\.own_accounting_/.test(s)).map(s=>({...ownInstallationFunctionPin(s),runtime:facades.has(ownInstallationFunctionPin(s).name)}));assert.equal(ownPins.length,13);assert.ok(statements.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const prerequisiteFiles=['scripts/migrations/007-action-center-read-facades.sql','scripts/migrations/103-native-employment-catalog.sql','scripts/migrations/112-native-salary-definitions.sql','scripts/migrations/122-own-payroll-programs.sql'];
 const required=new Set(['action_center_context_has_capability','native_employee_catalog_v1','native_salary_context_v1','native_salary_scope_v1','native_salary_lock_v1','native_salary_catalog_v1','native_salary_serialized_v1','own_program_exact_v1','own_program_text_v1','own_program_coverage_v1']);
 const prerequisitePins=prerequisiteFiles.flatMap(f=>splitPostgresStatements(lf(read(f))).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)/.test(s)&&required.has(/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)/.exec(s)[1])).map(ownInstallationFunctionPin));assert.equal(prerequisitePins.length,10);
 const preflight=pinsCheck(prerequisitePins,'ACCOUNTING_PREREQUISITE_METADATA');
 const absenceCheck="DO $empty$ BEGIN IF to_regclass('public."+table+"') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_accounting_%') THEN RAISE EXCEPTION 'ACCOUNTING_OBJECT_CONFLICT';END IF;END $empty$";
 const ownCheck=pinsCheck(ownPins,'ACCOUNTING_FUNCTION_METADATA');
 const tableCheck=`DO $shape$ DECLARE actual jsonb;expected jsonb;x jsonb;t pg_class; BEGIN
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.${table}');
 IF t.oid IS NULL OR t.relkind<>'r' OR t.relowner<>current_user::regrole OR NOT t.relrowsecurity OR t.relforcerowsecurity OR t.relpersistence<>'p' OR t.reloptions IS NOT NULL OR t.relreplident<>'d' OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=t.oid) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner) OR has_table_privilege('municontrol_actions_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'ACCOUNTING_TABLE_SECURITY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]') INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped;
 IF actual<>${q(JSON.stringify(columns))}::jsonb OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND (attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL)) THEN RAISE EXCEPTION 'ACCOUNTING_TABLE_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') COLLATE "C"),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='c';
 IF actual<>${q(JSON.stringify(checks))}::jsonb OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND (NOT convalidated OR condeferrable OR condeferred)) THEN RAISE EXCEPTION 'ACCOUNTING_CONSTRAINT_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.conkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=key.v),(SELECT ns.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.oid=k.confrelid),(SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.confkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=key.v)) ORDER BY k.confrelid,k.conkey),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f';
 SELECT jsonb_agg(v ORDER BY (v->>1),v->0) INTO expected FROM jsonb_array_elements(${q(JSON.stringify(foreigns))}::jsonb) v;
 IF (SELECT jsonb_agg(v ORDER BY (v->>1),v->0) FROM jsonb_array_elements(actual) v)<>expected OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND contype='f' AND (confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')) THEN RAISE EXCEPTION 'ACCOUNTING_FOREIGN_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype<>'n')<>20 OR (SELECT coalesce(jsonb_agg(jsonb_build_array(k.contype,(SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.conkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=key.v)) ORDER BY k.contype,k.conkey),'[]') FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype IN('p','u'))<>'[["p",["id"]],["u",["tenant_id","source_binding_id","actor_membership_id","request_key"]],["u",["proposal_id"]]]'::jsonb THEN RAISE EXCEPTION 'ACCOUNTING_UNIQUE_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype='n')<>(CASE WHEN current_setting('server_version_num')::int/10000>=18 THEN 19 ELSE 0 END) OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='n' AND (cardinality(k.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=k.conkey[1] AND a.attnotnull))) THEN RAISE EXCEPTION 'ACCOUNTING_NOT_NULL_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_index WHERE indrelid=t.oid)<>4 OR NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=t.oid AND c.relname='own_accounting_approval_revision' AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND NOT i.indisprimary AND i.indexprs IS NULL AND regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')='command=''approve''::text' AND (SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(i.indkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.v)='["tenant_id","source_binding_id","revision"]'::jsonb) THEN RAISE EXCEPTION 'ACCOUNTING_INDEX_SHAPE';END IF;
 IF (SELECT coalesce(jsonb_agg(jsonb_build_array(g.tgname,g.tgtype,g.tgenabled,g.tgfoid::regprocedure::text) ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal)<>${q(JSON.stringify([['own_accounting_immutable',27,'O','own_accounting_immutable_v1()'],['own_accounting_no_truncate',34,'O','own_accounting_immutable_v1()']]))}::jsonb THEN RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE_GUARD';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f' AND (SELECT count(*)<>4 OR bool_or(g.tgenabled<>'O' OR NOT g.tgisinternal OR g.tgconstrrelid NOT IN(k.conrelid,k.confrelid)) FROM pg_trigger g WHERE g.tgconstraint=k.oid)) THEN RAISE EXCEPTION 'ACCOUNTING_FOREIGN_GUARD';END IF;
 END $shape$`;
 const before=accountingSnapshot('before'),after=accountingSnapshot('after');
 const conservation="DO $conservation$ DECLARE previous jsonb:=current_setting('municontrol_sql147.before')::jsonb;fresh jsonb:=current_setting('municontrol_sql147.after')::jsonb;BEGIN IF previous IS DISTINCT FROM fresh THEN RAISE EXCEPTION 'ACCOUNTING_PRIOR_STATE_CHANGED' USING DETAIL=(SELECT string_agg(k,',') FROM jsonb_object_keys(previous) k WHERE previous->k IS DISTINCT FROM fresh->k);END IF;END $conservation$";
 const proof=`SELECT jsonb_build_object('version','own-accounting-installation.v1','sourceCommit',${q(sourceCommit)},'migrationSha256',${q(hash(source))},'newTables',1,'newFunctions',13,'runtimeFacades',4,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public.${table}),'preservationSha256',encode(public.digest(current_setting('municontrol_sql147.after')::jsonb::text,'sha256'),'hex'),'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql147.before')::jsonb::text,'sha256'),'hex')) AS proof`;
 const durableProof=proof.replace(",'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql147.before')::jsonb::text,'sha256'),'hex')",'');
 return {version:'own-accounting-installation.v1',sourceCommit,sourceHashes:{[file]:hash(source)},migration:statements,prerequisitePins,ownPins,preflight,absenceCheck,ownCheck,tableCheck,before,after,conservation,proof,durableProof,installation:[preflight,absenceCheck,before,...statements,ownCheck,tableCheck,after,conservation,proof],durableVerification:[preflight,ownCheck,tableCheck,after,durableProof],connects:false,executesSql:false};
}
export function assertOwnAccountingDurability({installed,durable,sourceCommit}){
 for(const v of [installed,durable]){
  assert.equal(v.sourceCommit,sourceCommit);assert.equal(v.version,'own-accounting-installation.v1');assert.equal(v.migrationSha256,SQL147_SHA256);
  for(const [k,w]of Object.entries({newTables:1,newFunctions:13,runtimeFacades:4,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0,eventRows:0}))assert.equal(v[k],w,'ACCOUNTING_INSTALL_PROOF_INVALID: '+k);
  assert.match(v.preservationSha256,/^[a-f0-9]{64}$/);
 }
 assert.equal(installed.beforeFingerprint,installed.preservationSha256,'ACCOUNTING_PRIOR_STATE_CHANGED');
 const {beforeFingerprint,...after}=installed;assert.deepEqual(after,durable,'ACCOUNTING_NOT_DURABLE');
 return {passed:true,priorStatePreserved:true,metadataVerified:true,businessWrites:0,nominalRowsReturned:0};
}
