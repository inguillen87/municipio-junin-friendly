// Existing municipal destinations only. Credentials remain in process memory.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {neon} from '@neondatabase/serverless';
const execute=promisify(execFile);
export const OWN_RELEASE_TARGETS=Object.freeze([
 Object.freeze({major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech',endpointId:'ep-shiny-cherry-actlyudg'}),
 Object.freeze({major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',database:'neondb',role:'neondb_owner',guardOid:24740,host:'ep-falling-rain-aca27ph1.sa-east-1.aws.neon.tech',endpointId:'ep-falling-rain-aca27ph1'}),
]);
export function ownReleaseConnection(value,target){
 const url=new URL(value);assert.ok(['postgres:','postgresql:'].includes(url.protocol));
 assert.equal(decodeURIComponent(url.username),target.role);assert.equal(decodeURIComponent(url.pathname.slice(1)),target.database);
 assert.equal(url.hostname,target.host);assert.equal(url.port,'');assert.equal(url.hash,'');assert.equal(url.searchParams.get('sslmode'),'verify-full');assert.ok(url.password);
 return {host:url.hostname,endpointId:url.hostname.split('.')[0]};
}
export function ownReleaseIdentity(actual,target,connection){
 for(const [key,value]of Object.entries({major:target.major,projectId:target.projectId,branchId:target.branchId,database:target.database,role:target.role,endpointId:connection.endpointId}))assert.equal(actual[key],value,'OWN_RELEASE_DESTINATION_MISMATCH: '+key);
 return {...target,...connection,transport:'neon_https',postgresSsl:actual.ssl};
}
export async function ownReleaseClient(major){
 const target=OWN_RELEASE_TARGETS.find(t=>t.major===major);assert.ok(target,'OWN_RELEASE_TARGET_INVALID');
 const args=['connection-string',target.branchId,'--project-id',target.projectId,'--role-name',target.role,'--database-name',target.database,'--ssl','verify-full','--no-analytics'];
 const result=process.platform==='win32'?await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','& neon.cmd '+args.join(' ')],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:65536}):await execute('neon',args,{encoding:'utf8',timeout:20000,maxBuffer:65536});
 assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const value=result.stdout.trim(),connection=ownReleaseConnection(value,target),sql=neon(value);
 const actual=(await sql.query("SELECT current_setting('server_version_num')::int/10000 AS major,current_setting('neon.project_id',true) AS \"projectId\",current_setting('neon.branch_id',true) AS \"branchId\",current_setting('neon.endpoint_id',true) AS \"endpointId\",current_database() AS database,current_user AS role,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl"))[0];
 return {sql,target:ownReleaseIdentity(actual,target,connection)};
}
