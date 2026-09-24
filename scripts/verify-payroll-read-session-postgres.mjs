// Reproduce the role conflict with real SQL guards in an empty, disposable loopback database.
// All fixtures are synthetic; the entire schema/data transaction rolls back.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {buildGrhEffectiveConsumersQa} from './verify-grh-effective-consumers-postgres.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replaceAll('\r\n','\n');
export function buildPayrollReadSessionQa({expectedMajor=17,variant='repository'}={}){
 if(!['repository','production'].includes(variant))throw Error('QA_VARIANT_INVALID');
 let sql=buildGrhEffectiveConsumersQa({expectedMajor});
 const cut=sql.indexOf(" SELECT jsonb_build_object('version','grh-effective-consumers-qa.v1'");
 if(cut<0)throw Error('QA_BASELINE_ANCHOR_MISSING');
 sql=sql.slice(0,cut).replaceAll("current_database()<>'effective_consumers_qa'","current_database()<>'payroll_read_qa'");
 const iam=read('scripts/migrations/004-tenant-iam-control-plane.sql');
 const start=iam.indexOf('CREATE OR REPLACE FUNCTION tenant_iam_assert_no_sod_conflict('),end=iam.indexOf('$$;',start);
 if(start<0||end<0)throw Error('REAL_SOD_GUARD_MISSING');
 const migration=read('scripts/migrations/105-payroll-independent-read-session.sql');
 if(variant==='production')sql+='\n'+read('scripts/fixtures/payroll-read-production-detail.sql.txt');
 sql+='\n'+iam.slice(start,end+3)+'\n'+read('scripts/fixtures/payroll-read-session-before.sql.txt');
 sql+='\n'+migration+'\n'+migration+'\n'+read('scripts/fixtures/payroll-read-session-after.sql.txt');
 sql+=`\nSELECT jsonb_build_object('version','payroll-read-session-qa.v1','variant','${variant}','passed',count(*),'major',current_setting('server_version_num')::integer/10000,'synthetic',true,'realSodGuard',true,'readOnlyHelper',true,'migrationReplayed',true,'rollback',true) AS qa_result FROM qa_checks;
 ROLLBACK;
 SELECT to_regclass('public.grh_effective_source_binding') IS NULL AND to_regprocedure('public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)') IS NULL AS rollback_confirmed;
`;
 return sql;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>!/^--(?:expected-major=(?:17|18)|variant=(?:repository|production)|write-sql=.+)$/.test(a)))throw Error('QA_ARGUMENT_INVALID');
 const major=Number(args.find(a=>a.startsWith('--expected-major='))?.split('=')[1]??17),out=args.find(a=>a.startsWith('--write-sql='))?.slice(12);
 if(!out)throw Error('QA_OUTPUT_REQUIRED');fs.writeFileSync(path.resolve(out),buildPayrollReadSessionQa({expectedMajor:major,variant:args.find(a=>a.startsWith('--variant='))?.slice(10)??'repository'}));console.log('Synthetic rollback-only payroll read SQL written');
}
