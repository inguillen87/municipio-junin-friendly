// Exact committed source to review material. Never connects or executes SQL.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {functionPin} from './lib/native-leave-installation.mjs';
import {buildNativeSalaryInstallation} from './lib/native-salary-installation.mjs';

export function readSalaryPrerequisites(read){
 const definitions=[['104-native-employment-changes.sql','native_employment_change_context_v1'],['103-native-employment-catalog.sql','native_employee_catalog_v1'],['103-native-employment-catalog.sql','native_employment_catalog_lock_v1'],['103-native-employment-catalog.sql','native_employment_catalog_capacity_v1']];
 const pins=definitions.map(([file,name])=>{const definition=splitPostgresStatements(read('scripts/migrations/'+file)).find(s=>new RegExp('^CREATE OR REPLACE FUNCTION (?:public\\.)?'+name+'\\s*\\(').test(s));assert.ok(definition,'Missing prerequisite '+name);return {...functionPin(definition),runtime:false};});
 const catalog=pins.find(p=>p.name==='native_employee_catalog_v1'),patch=read('scripts/migrations/110-native-employment-lifecycle.sql').match(/\('public\.native_employee_catalog_v1\(jsonb\)','([a-f0-9]{64})','([a-f0-9]{64})'\)/);
 assert.ok(patch,'Missing approved SQL110 consumer pin');assert.ok([patch[1],patch[2]].includes(catalog.sha256),'Catalog differs from both reviewed SQL110 versions');catalog.sha256=patch[2];
 return pins;
}
export function prepareNativeSalaryInstallation({read,sourceCommit}){
 const batch=buildNativeSalaryInstallation({source:read('scripts/migrations/112-native-salary-definitions.sql'),prerequisitePins:readSalaryPrerequisites(read),sourceCommit});
 const targets=[{label:'PG17',project_id:'noisy-poetry-54471701',branch_id:'br-plain-dust-acpjgebb',database_name:'neondb',major:17,guardOid:532699},{label:'PG18',project_id:'wild-cake-87689498',branch_id:'br-plain-dawn-ac8crb1h',database_name:'neondb',major:18,guardOid:24740}];
 const settings=['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','SET LOCAL search_path=public,pg_catalog,pg_temp',"SET LOCAL timezone='UTC'","SET LOCAL statement_timeout='45s'","SET LOCAL lock_timeout='5s'","SET LOCAL idle_in_transaction_session_timeout='60s'"];
 const identity=t=>`DO $destination$ BEGIN IF current_database()<>'neondb' OR current_user<>'neondb_owner' OR current_setting('server_version_num')::integer/10000<>${t.major} OR to_regprocedure('public.native_employee_contract_guard_v1()')::oid IS DISTINCT FROM ${t.guardOid}::oid OR (SELECT count(*) FROM public.platform_tenant t JOIN public.platform_tenant_source_binding b ON b.tenant_id=t.id WHERE t.slug='junin-mendoza' AND t.status='active' AND b.verified AND b.source_system='GRH' AND b.source_database='grh_junin' AND b.source_company_id=101)<>1 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls) OR has_schema_privilege('municontrol_actions_runtime_app','public','CREATE') OR EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') THEN RAISE EXCEPTION 'SQL112_DESTINATION_MISMATCH'; END IF; END $destination$`;
 return{...batch,connects:false,executesSql:false,targets:targets.map(t=>({...t,preflight:['SET TRANSACTION READ ONLY',...settings,identity(t),batch.preflight],installation:[...settings,identity(t),'SELECT public.native_employment_catalog_capacity_v1(2097152)',...batch.installation,'SELECT public.native_employment_catalog_capacity_v1(1048576)'],durableVerification:['SET TRANSACTION READ ONLY',...settings,identity(t),...batch.durableVerification]}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.resolve(process.argv[2].slice(9));
  assert.ok(output.startsWith(path.join(root,'verification')+path.sep),'Output must remain inside this worktree verification');assert.ok(!fs.existsSync(output),'Review already exists; preserve it');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
  const read=file=>{const committed=git('show',sourceCommit+':'+file)+'\n';assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n'),committed);return committed;};
  const batch=prepareNativeSalaryInstallation({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({sourceCommit,sqlSha256:batch.sqlSha256,statements:batch.migrationStatements,newTables:1,newFunctions:12,runtimeFacades:3,targets:batch.targets.map(t=>({label:t.label,atomicStatements:t.installation.length})),connects:false,executesSql:false}));
 }catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
}
