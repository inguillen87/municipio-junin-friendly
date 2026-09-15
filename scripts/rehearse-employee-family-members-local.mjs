// Existing, explicitly authorized local restore only. No connection factory or commit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const identifier=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/);return '"'+value+'"';};
const VIEWS=['vw_nomina_totales','vw_liquidacion_mensual','vw_dotacion_cierre_mensual','vw_payroll_snapshot_actual','vw_movimientos_legajo'];
export async function employeeFamilyLocalSnapshot(client){
 const tables=(await client.query("SELECT tablename name FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.name);
 const result={tables:{},views:{},sequences:{},publicAcl:(await client.query("SELECT nspacl::text acl FROM pg_namespace WHERE nspname='public'")).rows[0].acl};
 for(const [group,names] of [['tables',tables],['views',VIEWS]])for(const name of names)
  result[group][name]=(await client.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) digest FROM public.${identifier(name)} r`)).rows[0];
 for(const {name} of (await client.query("SELECT sequencename name FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows)
  result.sequences[name]=(await client.query(`SELECT last_value::text value,is_called FROM public.${identifier(name)}`)).rows[0];
 result.functions=(await client.query("SELECT p.oid::regprocedure::text name,md5(pg_get_functiondef(p.oid)) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY name")).rows;
 result.relations=(await client.query("SELECT c.relname,c.relkind,c.relacl::text,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S') ORDER BY c.relname")).rows;
 result.columns=(await client.query("SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname")).rows;
 result.constraints=(await client.query("SELECT c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid,true) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY relation,c.conname")).rows;
 result.triggers=(await client.query("SELECT t.tgrelid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY relation,t.tgname")).rows;
 result.indexes=(await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
 return result;
}
export async function rehearseEmployeeFamilyMembers({client}){
 const report={version:'employee-family-members-rehearsal.v1',localOnly:true,productionWrites:false,committed:false,passed:[],rollbackConfirmed:false};
 let before,transaction=false;
 try{
  const target=(await client.query("SELECT current_database() database,inet_server_addr()::text host,inet_server_port() port,current_user role,current_setting('neon.branch_id',true) branch")).rows[0];
  assert.ok(target.database==='restore_monthly_20260914'&&/^127\.0\.0\.1(?:\/32)?$/.test(target.host)&&target.port===5432&&target.role==='restore_owner'&&!target.branch,'FAMILY_LOCAL_TARGET_REQUIRED');
  assert.equal((await client.query("SELECT to_regclass('public.employee_family_member') IS NULL absent")).rows[0].absent,true,'FAMILY_CLEAN_BASELINE_REQUIRED');
  before=await employeeFamilyLocalSnapshot(client);report.baselineTableCount=Object.keys(before.tables).length;
  await client.query("BEGIN; SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='3s'");transaction=true;
  const sql=readFileSync(new URL('./migrations/064-employee-family-members.sql',import.meta.url),'utf8');
  report.migrationSha256=createHash('sha256').update(sql).digest('hex');
  await client.query(sql);report.passed.push('migration');
  // This no-ACL restore grants only its owner schema usage. Recreate runtime
  // lookup permission inside the rehearsal transaction, then roll it back too.
  await client.query('GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app');
  await client.query(sql);report.passed.push('migration_replay');
  await client.query('DROP TRIGGER employee_family_member_no_truncate ON employee_family_member');
  await client.query(sql);
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='employee_family_member'::regclass AND tgname IN ('employee_family_member_immutable','employee_family_member_no_truncate')")).rows[0].n,2);
  report.passed.push('independent_trigger_recreation');
  const suite=readFileSync(new URL('./tests/064-employee-family-members.test.sql',import.meta.url),'utf8')
   .replace(/^\\set ON_ERROR_STOP on\r?\n/m,'').replace(/^BEGIN;\r?$/m,'SAVEPOINT family_suite;').replace(/^ROLLBACK;\r?$/m,'ROLLBACK TO SAVEPOINT family_suite;');
  await client.query(suite);report.passed.push('sql_declaration_certificate_permissions_refresh_duplicate_and_identity_suite');
  const functions=(await client.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('employee_family_declare_v1','employee_family_context_v1','school_certificate_read_v2','school_certificate_register_v2','school_certificate_download_v2') ORDER BY proname")).rows;
  assert.equal(functions.length,5);
  report.functionSha256=Object.fromEntries(functions.map(row=>[row.proname,createHash('sha256').update(row.definition).digest('hex')]));
  await client.query('ROLLBACK');transaction=false;
  assert.deepEqual(await employeeFamilyLocalSnapshot(client),before,'FAMILY_RESTORE_FINGERPRINT_DRIFT');report.rollbackConfirmed=true;
  report.completedAt=new Date().toISOString();return report;
 }catch(error){
  if(transaction){await client.query('ROLLBACK');transaction=false;}
  if(before){assert.deepEqual(await employeeFamilyLocalSnapshot(client),before,'FAMILY_FAILED_RUN_RESTORE_DRIFT');report.rollbackConfirmed=true;}
  error.familyReport=report;throw error;
 }
}
