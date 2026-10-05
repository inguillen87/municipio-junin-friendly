// Local/CI PG17/18 only. Exact installer, COMMIT and independent durability.
// The foundation uses synthetic identities and IAM fixtures, never municipal data.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildOwnPayrollDurableQa} from './lib/own-payroll-durable-qa.mjs';
import {buildOwnPayrollInstallation,assertOwnPayrollDurability} from './lib/own-payroll-installation.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {ownInstallationSettings} from './prepare-own-payroll-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
export function ownInstallationQaFoundation(major,read,sourceCommit){
 assert.ok([17,18].includes(major));const qa=buildOwnPayrollDurableQa(major,{seedProgram:false,installOwnPayroll:false});
 let seed=qa.sql;assert.equal(seed.split('CREATE SCHEMA '+qa.schema+';').length,2);
 seed=seed.replace('CREATE SCHEMA '+qa.schema+';','').replaceAll(qa.schema,'public').replaceAll('own_payroll_run_qa','own_payroll_installation_qa');
 seed=seed.replace("to_regnamespace('public') IS NOT NULL","to_regclass('public.platform_tenant') IS NOT NULL");
 const batch=buildOwnPayrollInstallation({read,sourceCommit});
 // The source fixture relocates search_path; restore the original prerequisite
 // definitions before testing an unchanged public installation. The published
 // export keeps its already applied093/110 body; only its QA path is restored.
 const files=['092-payroll-fixed-novelties.sql','093-native-fixed-novelties.sql','101-native-monthly-novelties.sql','110-native-employment-lifecycle.sql','112-native-salary-definitions.sql'];
 const statements=files.flatMap(f=>splitPostgresStatements(read('scripts/migrations/'+f).replace(/\r\n?/g,'\n')));
 const restore=batch.prerequisitePins.map(p=>{
  if(p.name==='payroll_fixed_registry_export_v1')return 'ALTER FUNCTION '+p.signature+' SET search_path=pg_catalog,public,pg_temp';
  const original=statements.find(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+p.name+'\\(').test(s));assert.ok(original,p.name);return original.replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION');
 });
 return {seed,batch,restore};
}
export async function verifyOwnPayrollInstallation({major,executable,output,sourceCommit}){
 assert.ok([17,18].includes(major));assert.ok(!fs.existsSync(output),'Preserve existing evidence');const database='own_payroll_installation_qa';
 const read=f=>fs.readFileSync(f,'utf8'),qa=ownInstallationQaFoundation(major,read,sourceCommit),connections=[];
 const args=['-X','-q','-t','-A','-h','127.0.0.1','-p',String(55400+major),'-U','postgres','-v','ON_ERROR_STOP=1'];
 const execute=(dbname,sql)=>new Promise((resolve,reject)=>{const child=execFile(executable,[...args,'-d',dbname,'-f','-'],{encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024,windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}},(error,stdout,stderr)=>{if(error)reject(Error(stderr.split(/\r?\n/).find(s=>s.includes('ERROR:'))??'QA_PSQL_FAILED'));else resolve(stdout);});child.stdin.on('error',()=>{});child.stdin.end(sql,'utf8');});
 const pin=`DO $local$ BEGIN IF nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL OR current_database()<>${q(database)} OR current_setting('server_version_num')::int/10000<>${major} OR current_user<>'postgres' THEN RAISE EXCEPTION 'OWN_INSTALL_QA_LOCAL_REQUIRED';END IF;END $local$`;
 const run=async(statements,readOnly=false)=>{const stdout=await execute(database,`BEGIN ISOLATION LEVEL REPEATABLE READ ${readOnly?'READ ONLY':''};${ownInstallationSettings.join(';')};${pin};SELECT jsonb_build_object('qaPid',pg_backend_pid());${statements.join(';')};COMMIT;`);const lines=stdout.trim().split(/\r?\n/).filter(s=>s.startsWith('{'));assert.ok(lines.length);connections.push(JSON.parse(lines[0]).qaPid);return lines.length>1?JSON.parse(lines.at(-1)):null;};
 let created=false,checks=0,report;
 try{
  const control=await execute('postgres',`SELECT jsonb_build_object('major',current_setting('server_version_num')::int/10000,'local',nullif(current_setting('neon.project_id',true),'') IS NULL,'absent',NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=${q(database)}));`);const c=JSON.parse(control.trim());assert.equal(c.major,major);assert.equal(c.local,true);assert.equal(c.absent,true);
  await execute('postgres','CREATE DATABASE '+database);created=true;
  await execute(database,`CREATE EXTENSION pgcrypto;DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN CREATE ROLE municontrol_actions_runtime_app NOSUPERUSER NOBYPASSRLS;END IF;END $$;`);
  await execute(database,qa.seed);await run(qa.restore);checks++;
  await run(qa.batch.preflight,true);checks++;
  const installed=await run(qa.batch.installation),durable=await run(qa.batch.durableVerification,true);
  const proof=assertOwnPayrollDurability({installed,durable,sourceCommit});checks++;
  const faults=[
   ["ALTER TABLE public.own_payroll_run_capture DISABLE ROW LEVEL SECURITY",qa.batch.objectsCheck,'OWN_INSTALL_TABLE_SHAPE_SECURITY'],
   ["ALTER TABLE public.own_payroll_run_result ADD COLUMN wrong text",qa.batch.objectsCheck,'OWN_INSTALL_TABLE_SHAPE_SECURITY'],
   ["DROP INDEX public.own_payroll_program_approval_revision",qa.batch.objectsCheck,'OWN_INSTALL_TABLE_CONSTRAINTS'],
   ["ALTER FUNCTION public.own_run_bootstrap_v1(jsonb) SET search_path=public",qa.batch.ownCheck,'OWN_INSTALL_NEW_FUNCTION_METADATA'],
   ["GRANT SELECT ON public.own_payroll_run_result TO municontrol_actions_runtime_app",qa.batch.objectsCheck,'OWN_INSTALL_TABLE_SHAPE_SECURITY'],
   ["UPDATE public.iam_capability SET sensitivity='standard' WHERE capability_key='payroll.calculation.prepare'",qa.batch.objectsCheck,'OWN_INSTALL_CAPABILITY_DEFINITION'],
   ["DELETE FROM public.iam_role_capability",qa.batch.priorAudit,'OWN_INSTALL_PRIOR_STATE_CHANGED'],
  ];
  for(const [mutation,check,wanted]of faults){const body=`DO $fault$ DECLARE rejected boolean:=false;BEGIN BEGIN ${mutation};${qa.batch.after};${check};RAISE EXCEPTION 'QA_FAULT_NOT_DETECTED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>${q(wanted)} THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'QA_FAULT_NOT_REJECTED';END IF;END $fault$`;await run([qa.batch.before,body]);checks++;}
  await assert.rejects(run(['TRUNCATE public.own_payroll_run_capture']),/referenced in a foreign key constraint/);checks++;
  for(const table of ['own_payroll_program_event','own_payroll_run_capture,public.own_payroll_run_result','own_payroll_run_result']){await assert.rejects(run(['TRUNCATE public.'+table]),/OWN_(PROGRAM|RUN)_IMMUTABLE/);checks++;}
  await assert.rejects(run(qa.batch.preflight,true),/OWN_INSTALL_OBJECT_CONFLICT/);checks++;
  assertOwnPayrollDurability({installed,durable:await run(qa.batch.durableVerification,true),sourceCommit});checks++;
  assert.equal(new Set(connections).size,connections.length);checks++;
  report={passed:true,serverMajor:major,checks,synthetic:true,actualInstaller:true,committed:true,independentConnections:connections.length,...proof,installed,durable,authenticationAndIamFixtures:true,municipalBusinessOperations:0,productionInstallation:false};
 }catch(e){report={passed:false,serverMajor:major,checks,message:e.message,synthetic:true,productionInstallation:false};process.exitCode=1;}
 finally{if(created){try{await execute('postgres','DROP DATABASE '+database);report.syntheticDatabaseRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci')continue;const m=/^--(major|psql|output|source-commit)=(.+)$/.exec(a);assert.ok(m,'Unknown argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 assert.ok([17,18].includes(Number(args.major)));assert.match(args['source-commit'],/^[a-f0-9]{40}$/);const output=path.resolve(args.output);assert.ok(output.startsWith(path.resolve('verification')+path.sep));await verifyOwnPayrollInstallation({major:Number(args.major),executable:args.psql??'psql',output,sourceCommit:args['source-commit']});
}
