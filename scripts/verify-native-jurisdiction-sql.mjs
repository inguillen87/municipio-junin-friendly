// Generates rollback-only SQL in the existing disposable fixed_novelties_qa suite.
// Real 067/007 authorization, 092/093 and 095 execute; no native writer is stubbed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeFixedQa} from './verify-native-fixed-novelties-sql.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const j=x=>q(JSON.stringify(x))+'::jsonb';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function buildNativeJurisdictionQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeFixedQa({serverMajor,requireConcurrency});const {schema,ids}=base;
 const migration=fs.readFileSync(path.join(root,'scripts/migrations/095-native-employee-jurisdiction.sql'),'utf8');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const install=q(relocate(migration));
 // Reuse the exact legacy draft literal already consumed by the real 067 writer.
 const legacy=/native_receipt:=native_employee_create_v1\(maker,('(?:[^']|'')*'::jsonb),catalog_version,native_key\);/.exec(base.sql);
 assert.ok(legacy,'Original 13-field creation must precede 095');
 const statements=[];let checks=0;
 const exec=s=>statements.push(s);
 const ok=(s,label)=>{statements.push(`PERFORM qa_assert((${s}),${q(label)}); checks:=checks+1;`);checks++;};
 const rejects=(sql,error,label)=>ok(`qa_rejects(${sql},${q(error)})`,label);
 const createCall=(draft,key='key42',actor='maker')=>`format('SELECT native_employee_create_v1(%L::jsonb,%L::jsonb,%L,%L::uuid)',${actor},${draft},catalog_version,${key})`;
 const attemptCall=(key,actor='maker')=>`format('SELECT native_employee_attempt_v1(%L::jsonb,%L::uuid)',${actor},${key})`;
 const fault=(mutation,body)=>exec(`BEGIN ${mutation} ${body} RAISE EXCEPTION USING ERRCODE='P0952',MESSAGE='RESTORE_JURISDICTION_FAULT'; EXCEPTION WHEN SQLSTATE 'P0952' THEN NULL; END;`);
 const fingerprint=`(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname NOT IN('native_employee_create_v1','native_employee_receipt_v1'))`;
 exec(`legacy_draft:=${legacy[1]};before_other_functions:=${fingerprint};
 SELECT to_jsonb(r) INTO legacy_registration FROM native_employee_registration r WHERE r.contract_id=native_contract;
 EXECUTE ${install};`);
 ok(`${fingerprint}=before_other_functions`,'095 preserves every unrelated function, ACL and owner including 093');
 ok("(SELECT c.jurisdiction_code IS NULL FROM employment_contract c WHERE c.id=native_contract)",'pre-095 native hire remains not reported without invented jurisdiction');
 ok("(SELECT to_jsonb(r)=legacy_registration FROM native_employee_registration r WHERE r.contract_id=native_contract)",'095 preserves original registration JSON and original request hash');
 ok("(native_employee_create_v1(maker,legacy_draft,catalog_version,native_key)-'replayed')=(native_receipt-'replayed') AND native_employee_create_v1(maker,legacy_draft,catalog_version,native_key)->>'replayed'='true'",'exact 13-field pre-095 retry keeps its original receipt and UUID');
 ok("(native_employee_attempt_v1(maker,native_key)-'replayed')=(native_receipt-'replayed')",'lost acknowledgement recovery of a historical attempt preserves receipt shape');
 ok("payroll_fixed_registry_employee_by_contract_v1(maker,native_contract)->'subject'=native_subject",'095 leaves the existing native 093 subject and identity token unchanged');
 exec(`SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) INTO installed_functions FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace;
 EXECUTE ${install};`);
 ok(`installed_functions=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace)`,'095 reapplication preserves exact function bodies, ACL and owner');
 for(const name of ['create','receipt','context','contract_guard','person_guard']){
  const start=statements.length;rejects(install,'NATIVE_JURISDICTION_PREREQUISITE','095 rejects drift in '+name+' even when migration text is retained');
  const assertion=statements.splice(start).join('\n');
  fault(`SELECT pg_get_functiondef(p.oid) INTO altered_definition FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname=${q('native_employee_'+name+'_v1')}; EXECUTE replace(altered_definition,'AS $function$',E'AS $function$\n-- 095 unauthorized drift');`,assertion);
 }
 for(const [mutation,label]of [
  ['ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system;','disabled native immutability guard'],
  ["ALTER TABLE employment_contract ALTER COLUMN jurisdiction_code SET DEFAULT '42';",'invented default jurisdiction'],
  ['ALTER TABLE employment_contract DROP CONSTRAINT employment_contract_native_jurisdiction_ck; ALTER TABLE employment_contract ADD CONSTRAINT employment_contract_native_jurisdiction_ck CHECK(true);','altered jurisdiction constraint']]){
  const start=statements.length;rejects(install,'NATIVE_JURISDICTION_PREREQUISITE','095 refuses '+label);const assertion=statements.splice(start).join('\n');fault(mutation,assertion);
 }
 exec(`BEGIN
 draft42:=legacy_draft||${j({dni:'99000021',cuil:'20990000213',legajo:'19002',fullName:'Jurisdicción cuarenta y dos QA',jurisdictionCode:'42'})};
 draft55:=legacy_draft||${j({dni:'99000022',cuil:'20990000221',legajo:'19003',fullName:'Jurisdicción cincuenta y cinco QA',jurisdictionCode:'55'})};
 GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;
 SET LOCAL ROLE municontrol_actions_runtime_app;
 receipt42:=native_employee_create_v1(maker,draft42,catalog_version,key42);
 receipt55:=native_employee_create_v1(maker,draft55,catalog_version,key55);
 RESET ROLE;
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;`);
 ok("receipt42->>'jurisdictionCode'='42' AND receipt55->>'jurisdictionCode'='55' AND receipt42->>'contractId'<>receipt55->>'contractId'",'actual runtime role persists explicit 42 and 55 with distinct canonical contracts');
 ok(`(SELECT c.jurisdiction_code='42' AND c.source_system='MUNICONTROL' AND c.tenant_id=${q(ids.tenant)}::uuid AND c.source_batch_id IS NULL FROM employment_contract c WHERE c.id=(receipt42->>'contractId')::uuid) AND (SELECT c.jurisdiction_code='55' FROM employment_contract c WHERE c.id=(receipt55->>'contractId')::uuid)`,'stored jurisdiction is native and tenant-bound with no fabricated source batch');
 ok("(SELECT r.request_sha256=encode(public.digest(convert_to(jsonb_build_object('draft',draft42,'catalogVersion',catalog_version)::text,'UTF8'),'sha256'),'hex') FROM native_employee_registration r WHERE r.contract_id=(receipt42->>'contractId')::uuid)",'new full 14-field declaration participates in original request hash');
 ok("(native_employee_create_v1(maker,draft42,catalog_version,key42)-'replayed')=(receipt42-'replayed') AND native_employee_create_v1(maker,draft42,catalog_version,key42)->>'replayed'='true'",'14-field exact replay retains its declaration and receipt');
 ok("native_employee_attempt_v1(maker,key55)->>'jurisdictionCode'='55'",'attempt recovery returns explicit jurisdiction');
 rejects(createCall("draft42||'{\"jurisdictionCode\":\"55\"}'::jsonb"),'NATIVE_EMPLOYEE_ATTEMPT_CONFLICT','same attempt cannot replace 42 with 55');
 rejects(createCall("draft42-'jurisdictionCode'"),'NATIVE_EMPLOYEE_ATTEMPT_CONFLICT','new declared attempt cannot replay as a legacy omitted field');
 rejects(createCall("legacy_draft||'{\"jurisdictionCode\":\"42\"}'::jsonb",'native_key'),'NATIVE_EMPLOYEE_ATTEMPT_CONFLICT','legacy attempt cannot acquire an invented jurisdiction on retry');
 rejects(attemptCall('key42','outsider'),'NATIVE_EMPLOYEE_ATTEMPT_NOT_FOUND','another tenant cannot recover the declared native record');
 for(const value of [null,42,'','43','042',' 42 ',['42']])rejects(createCall(`draft42||jsonb_build_object('jurisdictionCode',${j(value)})`,'gen_random_uuid()'),'NATIVE_EMPLOYEE_INPUT_INVALID','reject noncanonical jurisdiction '+JSON.stringify(value));
 rejects(createCall("draft42||'{\"fiscalActivity\":\"invented\"}'::jsonb",'gen_random_uuid()'),'NATIVE_EMPLOYEE_INPUT_INVALID','no unrelated fiscal field can enter native registration');
 rejects(`format('UPDATE employment_contract SET jurisdiction_code=''55'' WHERE id=%L::uuid',receipt42->>'contractId')`,'NATIVE_EMPLOYEE_IMMUTABLE','native jurisdiction is immutable even for owner DML');
 rejects(`format('UPDATE employment_contract SET jurisdiction_code=NULL WHERE id=%L::uuid',receipt42->>'contractId')`,'NATIVE_EMPLOYEE_IMMUTABLE','native jurisdiction cannot be silently cleared');
 rejects(q(`UPDATE employment_contract SET jurisdiction_code='42' WHERE id=${q(ids.targetContract)}::uuid`),'new row for relation "employment_contract" violates check constraint "employment_contract_native_jurisdiction_ck"','GRH snapshot cannot acquire inferred native jurisdiction');
 const beforeRevoked=statements.length;rejects(createCall('draft42'),'ACTION_SESSION_INVALID','revoked session cannot replay an existing declared hire');const revokedAssertion=statements.splice(beforeRevoked).join('\n');
 fault(`UPDATE tenant_identity_session SET status='revoked' WHERE id=${q(ids.makerSession)}::uuid;`,revokedAssertion);
 const beforeCapability=statements.length;rejects(attemptCall('key42'),'NATIVE_EMPLOYEE_FORBIDDEN','revoked creation capability cannot recover a declared hire');const capAssertion=statements.splice(beforeCapability).join('\n');
 fault(`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='employee.record.create';`,capAssertion);
 ok(`NOT has_column_privilege('municontrol_actions_runtime_app',${q(schema+'.employment_contract')},'jurisdiction_code','SELECT') AND NOT has_table_privilege('municontrol_actions_runtime_app',${q(schema+'.employment_contract')},'INSERT,UPDATE,DELETE,TRUNCATE')`,'runtime has no direct access to the stored declaration');
 ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.native_employee_receipt_v1('+schema+'.native_employee_registration)')},'EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN('native_employee_create_v1','native_employee_receipt_v1') AND a.grantee=0 AND a.privilege_type='EXECUTE')`,'PUBLIC and runtime cannot call private receipt helper');
 exec("subject42:=payroll_fixed_registry_employee_by_contract_v1(maker,(receipt42->>'contractId')::uuid)->'subject';");
 ok("subject42->>'origin'='MUNICONTROL' AND (SELECT count(*)=8 FROM jsonb_object_keys(subject42)) AND NOT (subject42?'jurisdictionCode')",'declared hire remains compatible with the exact 093 eight-field subject');
 exec("declared_proposal:=payroll_fixed_registry_propose_v1(maker,grh_payload||jsonb_build_object('contractId',receipt42->>'contractId','legajo','19002','identityToken',subject42->>'identityToken'),gen_random_uuid()); declared_approval:=payroll_fixed_registry_review_v1(checker,jsonb_build_object('recordId',declared_proposal->>'recordId','proposalId',declared_proposal->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión de alta con jurisdicción'),gen_random_uuid());");
 ok("declared_approval->>'recordVersion'='2' AND payroll_fixed_registry_detail_v1(maker,(declared_proposal->>'recordId')::uuid)#>>'{record,subject,identityToken}'=subject42->>'identityToken'",'real 093 propose and distinct-person review accept the declared native hire');
 exec("new_legacy:=native_employee_create_v1(maker,legacy_draft||'{\"dni\":\"99000023\",\"cuil\":\"20990000239\",\"legajo\":\"19004\",\"fullName\":\"Compatibilidad previa QA\"}'::jsonb,catalog_version,gen_random_uuid());");
 ok("NOT (new_legacy?'jurisdictionCode') AND (SELECT c.jurisdiction_code IS NULL FROM employment_contract c WHERE c.id=(new_legacy->>'contractId')::uuid)",'legacy 13-field client can still create a not-reported declaration after 095');
 ok("(SELECT count(*) FROM source_import_batch)=batches_before AND receipt42->>'accountCreated'='false' AND receipt42->>'payrollCalculated'='false'",'jurisdiction declaration creates no account, payroll or imported batch');
 exec(`EXECUTE ${install};`);
 ok("native_employee_attempt_v1(maker,key42)->>'jurisdictionCode'='42' AND native_employee_attempt_v1(maker,key55)->>'jurisdictionCode'='55'",'095 can reapply with explicit native declarations without changing them');
 exec("RAISE EXCEPTION USING ERRCODE='P0951',MESSAGE='RESTORE_DECLARED_JURISDICTION_FIXTURES'; EXCEPTION WHEN SQLSTATE 'P0951' THEN NULL; END;");
 ok("(SELECT count(*)=1 FROM native_employee_registration) AND (SELECT c.jurisdiction_code IS NULL FROM employment_contract c WHERE c.id=native_contract)",'declared fixtures roll back before unchanged native and GRH regressions');
 const block=`
 DECLARE legacy_draft jsonb; legacy_registration jsonb; before_other_functions text; installed_functions text; altered_definition text;
 declared_proposal jsonb; declared_approval jsonb; new_legacy jsonb; draft42 jsonb; draft55 jsonb; receipt42 jsonb; receipt55 jsonb; subject42 jsonb; key42 uuid:=gen_random_uuid(); key55 uuid:=gen_random_uuid();
 BEGIN
 ${statements.join('\n')}
 END;
 `;
 const anchor="native_subject:=payroll_fixed_registry_employee_by_contract_v1(maker,native_contract)->'subject';";
 assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,jurisdictionChecksPassed:checks,checksPassed:base.report.checksPassed+checks,migration095Sha256:sha(migration),limitations:[...base.report.limitations,'095 executes against an actual pre-existing 13-field hire; dedicated jurisdiction fixtures roll back before full 093 and 092 regressions. This is synthetic local QA, not municipal or fiscal certification.']};
 const sql=base.sql.replace(anchor,()=>anchor+'\n'+block).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql),'Synthetic public writes prohibited');
 return{...base,sql,report};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){
  if(a==='--ci'){args.ci=true;continue;}if(a==='--require-concurrency'){args.requireConcurrency=true;continue;}
  const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown or incomplete argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];
 }
 assert.equal(args.ci,true,'Only disposable CI generation is supported');assert.ok(args['write-sql']);assert.ok(!args.requireConcurrency||args['write-lock-sql']);
 const test=buildNativeJurisdictionQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([k])=>args[k]).map(([k,data])=>({output:path.resolve(args[k]),data}));assert.equal(new Set(outputs.map(x=>x.output)).size,outputs.length);
 for(const {output}of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');
 for(const {output,data}of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:test.report.checksPassed,jurisdictionChecksPlanned:test.report.jurisdictionChecksPassed,migration095Sha256:test.report.migration095Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
