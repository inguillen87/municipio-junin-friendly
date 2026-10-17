// Offline review batch. No connection, installation, capability assignment or
// municipal record is performed by this module.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {functionPin,pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
export const SQL195_SHA256='43d3ac2bfce0a466a89eab70350335be44582ad5fa187a9199579f2fa62bca9e';
const sha=s=>createHash('sha256').update(s).digest('hex'),lf=s=>s.replace(/\r\n?/g,'\n'),q=s=>"'"+String(s).replaceAll("'","''")+"'";
const tables=['native_family_storage_policy','native_family_request','native_family_request_event'];
const capabilityKeys=['employee.family.self.read','employee.family.self.submit','employee.family.review'];
const runtimeNames=['self','review'].flatMap(mode=>['bootstrap','detail','attempt','document','command'].map(op=>'native_family_'+mode+'_'+op+'_v1'));
const ownNames=['immutable','hash','context','independent','receipt','bootstrap','detail','attempt','document','owned','command_check','capacity','command'].map(n=>'native_family_'+n+'_v1').concat(runtimeNames);
function pin(definition){
 const textDefault=/state_filter text DEFAULT 'all'/.test(definition),parsed=functionPin(textDefault?definition.replace("state_filter text DEFAULT 'all'",'state_filter text'):definition);
 return{...parsed,defaults:textDefault?"'all'::text"+(parsed.defaults?', '+parsed.defaults:''):parsed.defaults,runtime:runtimeNames.includes(parsed.name)};
}
export function buildNativeFamilySelfInstallation({source,sourceCommit}){
 source=lf(source);assert.equal(sha(source),SQL195_SHA256,'Unreviewed SQL195 source');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const migration=splitPostgresStatements(source),functions=migration.filter(s=>/\bCREATE FUNCTION public\.native_family_/.test(s)).map(s=>s.slice(s.indexOf('CREATE FUNCTION'))),ownPins=functions.map(pin);
 assert.equal(functions.length,23);assert.deepEqual(ownPins.map(p=>p.name).sort(),ownNames.slice().sort());assert.equal(ownPins.filter(p=>p.runtime).length,10);
 assert.equal(migration.filter(s=>/^CREATE TABLE public\./.test(s)).length,3);assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK|CREATE OR REPLACE FUNCTION|GRANT .* ON TABLE)\b/i.test(s)));
 const missing=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 const ownOids=tables.map(t=>"coalesce(to_regclass('public."+t+"')::oid,0::oid)").join(',');
 const tableExclusion=" AND p.oid<>ALL(ARRAY["+ownOids+"]::oid[])";
 const newForeign=" AND NOT(t.tgisinternal AND EXISTS(SELECT 1 FROM pg_constraint k WHERE k.oid=t.tgconstraint AND k.contype='f' AND k.conrelid=ANY(ARRAY["+ownOids+"]::oid[])))";
 const capabilityFilter="capability_key NOT IN("+capabilityKeys.map(q).join(',')+")";
 const snapshot=slot=>preservationSnapshot(slot).replaceAll('municontrol_sql111.','municontrol_sql195.').replaceAll(missing,tableExclusion)
  .replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","NOT(s.nspname='public' AND p.proname LIKE 'native_family_%')")
  .replace("'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t", "'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t")
  .replace(tableExclusion+"),\n  'schemas'",tableExclusion+newForeign+"),\n  'schemas'");
 const filteredSnapshot=slot=>snapshot(slot).replace("FROM %I.%I r) hashed',c.nspname,c.relname)","FROM %I.%I r WHERE %s) hashed',c.nspname,c.relname,CASE WHEN c.oid=to_regclass('public.iam_capability') THEN "+q(capabilityFilter)+" ELSE 'true' END)");
 const before=filteredSnapshot('before'),after=filteredSnapshot('after');assert.ok(after.includes(newForeign),'Existing-table FK trigger exclusion must be exact');assert.ok(after.includes(capabilityFilter.replaceAll("'","''")),'Only three absent-before capability rows may differ');
 const locks=`DO $lock$ DECLARE r record;BEGIN FOR r IN SELECT p.relname,n.nspname FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.relkind IN('r','p') ORDER BY p.oid LOOP EXECUTE format('LOCK TABLE ONLY %I.%I IN SHARE MODE NOWAIT',r.nspname,r.relname);END LOOP;END $lock$`;
 const audit=`DO $audit$ BEGIN IF current_setting('municontrol_sql195.before')::jsonb IS DISTINCT FROM current_setting('municontrol_sql195.after')::jsonb THEN RAISE EXCEPTION 'SQL195_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const ownCheck=pinsCheck(ownPins,'SQL195_NEW_FUNCTION_METADATA');
 const ownAudit=`DO $shape$ DECLARE r record;BEGIN
 IF(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'native_family_%')<>23 THEN RAISE EXCEPTION 'SQL195_NEW_FUNCTION_COUNT';END IF;
 FOR r IN SELECT p.* FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname='public' AND p.relname IN('native_family_storage_policy','native_family_request','native_family_request_event') LOOP
  IF r.relkind<>'r' OR r.relowner<>current_user::regrole OR NOT r.relrowsecurity OR r.relforcerowsecurity OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r.oid)
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a WHERE a.grantee<>r.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(coalesce(a.attacl,'{}'::aclitem[])) acl WHERE a.attrelid=r.oid AND acl.grantee<>r.relowner)
   OR(SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=58 AND t.tgfoid='public.native_family_immutable_v1()'::regprocedure)<>1
  THEN RAISE EXCEPTION 'SQL195_NEW_TABLE_METADATA';END IF;
 END LOOP;
 IF(SELECT count(*) FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname='public' AND p.relname IN('native_family_storage_policy','native_family_request','native_family_request_event'))<>3 THEN RAISE EXCEPTION 'SQL195_NEW_TABLE_COUNT';END IF;
 IF(SELECT count(*) FROM public.native_family_storage_policy)<>1 OR NOT EXISTS(SELECT 1 FROM public.native_family_storage_policy WHERE singleton AND ledger_budget_bytes=67108864 AND event_bound_bytes=16384 AND request_bound_bytes=16384) THEN RAISE EXCEPTION 'SQL195_CAPACITY_POLICY_DRIFT';END IF;
 IF(SELECT count(*) FROM public.iam_capability WHERE capability_key IN('employee.family.self.read','employee.family.self.submit','employee.family.review'))<>3 OR EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key IN('employee.family.self.read','employee.family.self.submit','employee.family.review') AND(scope_kind<>'tenant' OR sensitivity<>CASE capability_key WHEN 'employee.family.self.read' THEN 'standard' WHEN 'employee.family.self.submit' THEN 'privileged' ELSE 'restricted' END)) THEN RAISE EXCEPTION 'SQL195_CAPABILITY_METADATA';END IF;
 IF(SELECT count(*) FROM public.native_family_request)<>0 OR(SELECT count(*) FROM public.native_family_request_event)<>0 THEN RAISE EXCEPTION 'SQL195_INSTALLATION_NOT_EMPTY';END IF;
 END $shape$`;
 const shapeReview=ownAudit.replace(" IF(SELECT count(*) FROM public.native_family_request)<>0 OR(SELECT count(*) FROM public.native_family_request_event)<>0 THEN RAISE EXCEPTION 'SQL195_INSTALLATION_NOT_EMPTY';END IF;",'');
 const newProof=`(SELECT encode(public.digest(jsonb_build_object('policy',(SELECT to_jsonb(r) FROM public.native_family_storage_policy r WHERE singleton),'capabilities',(SELECT jsonb_agg(to_jsonb(c) ORDER BY capability_key) FROM public.iam_capability c WHERE capability_key IN('employee.family.self.read','employee.family.self.submit','employee.family.review')),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'native_family_%'),'tables',(SELECT jsonb_agg(jsonb_build_object('class',jsonb_build_object('oid',p.oid,'owner',p.relowner,'acl',p.relacl,'kind',p.relkind,'rls',p.relrowsecurity,'forceRls',p.relforcerowsecurity,'options',p.reloptions),'attributes',(SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=p.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=p.oid),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=p.oid),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=p.oid)) ORDER BY p.oid) FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname='public' AND p.relname IN('native_family_storage_policy','native_family_request','native_family_request_event')))::text,'sha256'),'hex'))`;
 const proof=`SELECT jsonb_build_object('version','native-family-self-installation.v1','sourceCommit',${q(sourceCommit)},'sqlSha256',${q(SQL195_SHA256)},'database',current_database(),'owner',current_user,'serverMajor',current_setting('server_version_num')::integer/10000,'priorStateFingerprint',encode(public.digest(current_setting('municontrol_sql195.after'),'sha256'),'hex'),'newObjectFingerprint',${newProof},'newTables',3,'newFunctions',23,'runtimeFacades',10,'nominalRowsReturned',0,'checkedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS proof`;
 return{version:'native-family-self-installation-batch.v1',sourceCommit,sqlSha256:SQL195_SHA256,newTables:3,newFunctions:23,runtimeFacades:10,ownPins,migrationStatements:migration.length,before,after,locks,audit,ownCheck,ownAudit,shapeReview,proof,installation:[locks,before,...migration,after,ownCheck,ownAudit,audit,proof],durableVerification:[ownCheck,shapeReview,after,proof],limits:['Build only. No database connection or capability assignments.','Actual PG17/18, fresh independent durability read and family UI remain separate gates.']};
}
