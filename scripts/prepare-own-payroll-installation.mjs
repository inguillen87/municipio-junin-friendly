// Generate an exact, reviewable batch. No connections or SQL execution.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildOwnPayrollInstallation} from './lib/own-payroll-installation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
export function ownInstallationDestination(t){return `DO $destination$ BEGIN
 IF current_database()<>${q(t.database)} OR current_user<>${q(t.role)} OR current_setting('server_version_num')::int/10000<>${t.major}
 OR current_setting('neon.project_id',true) IS DISTINCT FROM ${q(t.projectId)} OR current_setting('neon.branch_id',true) IS DISTINCT FROM ${q(t.branchId)} OR current_setting('neon.endpoint_id',true) IS DISTINCT FROM ${q(t.endpointId)}
 OR to_regprocedure('public.native_employee_contract_guard_v1()')::oid IS DISTINCT FROM ${t.guardOid}::oid
 OR(SELECT count(*) FROM public.platform_tenant t JOIN public.platform_tenant_source_binding b ON b.tenant_id=t.id WHERE t.slug='junin-mendoza' AND t.status='active' AND b.verified AND b.source_system='GRH' AND b.source_database='grh_junin' AND b.source_company_id=101)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls)
 OR has_schema_privilege('municontrol_actions_runtime_app','public','CREATE') OR EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') THEN RAISE EXCEPTION 'OWN_INSTALL_DESTINATION_MISMATCH';END IF;END $destination$`;}
// Match SECURITY DEFINER runtime resolution; public pgcrypto also exposes a
// gen_random_uuid wrapper which must not shadow PostgreSQL's builtin default.
export const ownInstallationSettings=Object.freeze(['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','SET LOCAL search_path=pg_catalog,public,pg_temp',"SET LOCAL timezone='UTC'","SET LOCAL statement_timeout='45s'","SET LOCAL lock_timeout='2s'","SET LOCAL idle_in_transaction_session_timeout='60s'"]);
export function prepareOwnPayrollInstallation({read,sourceCommit}){
 const batch=buildOwnPayrollInstallation({read,sourceCommit});
 return {...batch,connects:false,executesSql:false,targets:OWN_RELEASE_TARGETS.map(t=>({...t,preflight:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...batch.preflight],installation:[...ownInstallationSettings,ownInstallationDestination(t),...batch.installation],durableVerification:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...batch.durableVerification]}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output),'Preserve previous review');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
 const read=file=>{const committed=git('show',sourceCommit+':'+file)+'\n';assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n'),committed);return committed;};
 const batch=prepareOwnPayrollInstallation({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceCommit,newTables:3,newFunctions:27,runtimeFacades:7,capabilityDefinitionsAdded:3,roleAssignmentsAdded:0,connects:false,executesSql:false}));
 }catch{console.error(JSON.stringify({ok:false,code:'OWN_INSTALL_PREPARATION_FAILED'}));process.exitCode=1;}
}
