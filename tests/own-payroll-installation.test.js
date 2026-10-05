import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareOwnPayrollInstallation} from '../scripts/prepare-own-payroll-installation.mjs';
import {OWN_INSTALL_SHA,assertOwnPayrollDurability,ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {OWN_RELEASE_TARGETS,ownReleaseConnection,ownReleaseIdentity} from '../scripts/lib/own-payroll-release-target.mjs';
import {ownInstallationQaFoundation} from '../scripts/verify-own-payroll-installation.mjs';
import {executeOwnPayrollInstallation} from '../scripts/install-own-payroll.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(f,'utf8'),build=()=>prepareOwnPayrollInstallation({read,sourceCommit});
test('exact122/123 batch preserves all prior rows/security; defines capabilities without assigning roles',()=>{
 const b=build();assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.migrationStatements,49);assert.equal(b.ownPins.length,27);assert.equal(b.ownPins.filter(p=>p.runtime).length,7);assert.equal(b.prerequisitePins.length,13);
 assert.equal(b.prerequisitePins.find(p=>p.name==='payroll_fixed_registry_export_v1').sha256,'c3b008ba635cc4e6cb6c6ae5722c5caaebecdf7d95376e79c6375de0cea9febd');
 for(const t of b.targets){assert.ok(t.preflight.includes('SET TRANSACTION READ ONLY'));assert.ok(t.durableVerification.includes('SET TRANSACTION READ ONLY'));const sql=t.installation.join('\n');for(const pin of [t.projectId,t.branchId,t.endpointId,String(t.guardOid)])assert.ok(sql.includes(pin));assert.match(sql,/OWN_INSTALL_PRIOR_STATE_CHANGED/);assert.doesNotMatch(sql,/INSERT INTO public\.(?:iam_role|employment|person_identity)|ALTER ROLE|GRANT .* ON public\.(?:employment|person_identity)/i);assert.ok(!t.installation.some(s=>/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));}
 for(const needle of ['rowsSha256','metaSha256','pg_auth_members','pg_default_acl','pg_roles','pg_policy','pg_get_viewdef','sequences'])assert.ok(b.before.includes(needle));
 assert.match(b.priorAudit,/o.value->'oid'=n.value->'oid'/);assert.match(b.objectsCheck,/OWN_INSTALL_FOREIGN_KEYS_INDEX_PREDICATE/);assert.match(b.ownCheck,/has_function_privilege/);assert.doesNotMatch(b.preflight[1],/has_function_privilege/);
});
test('source drift and unsupported defaults are refused before a batch exists',()=>{
 for(const name of ['122-','123-'])assert.throws(()=>prepareOwnPayrollInstallation({read:f=>read(f)+(f.includes(name)?'\n-- drift':''),sourceCommit}),/Unreviewed migration/);
 assert.throws(()=>prepareOwnPayrollInstallation({read,sourceCommit:'unknown'}));
 const pin=ownInstallationFunctionPin("CREATE FUNCTION public.sample(v text[],n integer DEFAULT 0) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT '{}'::jsonb $$;");assert.equal(pin.signature,'public.sample(text[],integer)');assert.equal(pin.defaults,'0');
 assert.throws(()=>ownInstallationFunctionPin("CREATE FUNCTION public.sample(n integer DEFAULT 99) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;"),/Unsupported/);
});
test('independent durability refuses partial, nominal, altered, assigned or nonconserving proofs',()=>{
 const installed={sourceCommit,sql122Sha256:OWN_INSTALL_SHA[122],sql123Sha256:OWN_INSTALL_SHA[123],allChecksPassed:true,newTables:3,newFunctions:27,runtimeFacades:7,eventRows:0,captureRows:0,resultRows:0,capabilityDefinitionsAdded:3,roleAssignmentsAdded:0,nominalRowsReturned:0,priorTableCount:48,beforeFingerprint:'b'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)},durable={...installed};delete durable.beforeFingerprint;
 assert.equal(assertOwnPayrollDurability({installed,durable,sourceCommit}).passed,true);
 for(const change of [{allChecksPassed:false},{roleAssignmentsAdded:1},{nominalRowsReturned:1},{eventRows:1},{captureRows:1},{resultRows:1},{newTables:2},{newFunctions:26},{runtimeFacades:6},{priorTableCount:0},{capabilityDefinitionsAdded:2},{sourceCommit:'d'.repeat(40)},{sql122Sha256:'e'.repeat(64)},{sql123Sha256:'f'.repeat(64)},{afterFingerprint:'d'.repeat(64)},{newObjectFingerprint:'e'.repeat(64)}])assert.throws(()=>assertOwnPayrollDurability({installed,durable:{...durable,...change},sourceCommit}));
 assert.throws(()=>assertOwnPayrollDurability({installed:{...installed,beforeFingerprint:'c'.repeat(64)},durable,sourceCommit}),/PRIOR_DATA_CHANGED/);
});
test('existing destinations and TLS mode are exact; credentials never appear in returned metadata',()=>{
 for(const target of OWN_RELEASE_TARGETS){const url=`postgresql://${target.role}:synthetic-password@${target.host}/${target.database}?sslmode=verify-full`;const connection=ownReleaseConnection(url,target);assert.equal(connection.endpointId,target.endpointId);assert.ok(!JSON.stringify(connection).includes('synthetic-password'));
 const actual={...target,ssl:false};assert.equal(ownReleaseIdentity(actual,target,connection).transport,'neon_https');for(const field of ['major','projectId','branchId','endpointId','database','role'])assert.throws(()=>ownReleaseIdentity({...actual,[field]:'incorrect'},target,connection),/DESTINATION_MISMATCH/);
 for(const bad of [url.replace(target.host,target.host.replace('.','-pooler.')),url.replace(target.database,'wrong-db'),url.replace(target.role,'other-role'),url.replace('verify-full','require'),url.replace(target.host,target.host+':5432'),url+'#extra'])assert.throws(()=>ownReleaseConnection(bad,target));}
});
test('preinstall QA remains local, synthetic and independent of original rollback regressions',()=>{
 for(const major of [17,18]){const q=ownInstallationQaFoundation(major,read,sourceCommit);assert.ok(q.seed.includes("current_database()<>'own_payroll_installation_qa'"));assert.ok(q.seed.includes("current_setting('neon.project_id',true)"));assert.ok(q.seed.trim().endsWith('COMMIT;'));assert.ok(!q.seed.includes('CREATE TABLE public.own_payroll_'));assert.ok(!q.seed.includes('RESTORE_CATALOG_FIXTURES'));assert.ok(q.seed.includes('MUNICONTROL'));assert.equal(q.restore.length,13);}
 assert.throws(()=>ownInstallationQaFoundation(19,read,sourceCommit));
});
test('release transport never retries an uncertain commit and records installation before durability',async()=>{
 const batch=build(),target=batch.targets[1];let calls=0;const records=[];
 const client=async()=>({target,sql:{query:s=>s,transaction:async(_s,options)=>{calls++;if(calls===1){assert.equal(options.readOnly,true);return [[]];}assert.equal(options.readOnly,false);throw Error('COMMIT_ACK_UNCERTAIN');}}});
 await assert.rejects(executeOwnPayrollInstallation({batch,major:18,client,record:r=>records.push(structuredClone(r))}),/COMMIT_ACK_UNCERTAIN/);assert.equal(calls,2);assert.equal(records.length,0);
 calls=0;const proof={sourceCommit,sql122Sha256:OWN_INSTALL_SHA[122],sql123Sha256:OWN_INSTALL_SHA[123],allChecksPassed:true,newTables:3,newFunctions:27,runtimeFacades:7,eventRows:0,captureRows:0,resultRows:0,capabilityDefinitionsAdded:3,roleAssignmentsAdded:0,nominalRowsReturned:0,priorTableCount:48,beforeFingerprint:'b'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)};
 const good=async()=>({target,sql:{query:s=>s,transaction:async(_s,o)=>{calls++;assert.equal(o.readOnly,calls!==2);return calls===1?[[]]:[[{proof}]];}}});
 const result=await executeOwnPayrollInstallation({batch,major:18,client:good,record:r=>records.push(structuredClone(r))});assert.equal(calls,3);assert.equal(records[0].installed,true);assert.equal(records[0].durabilityVerified,false);assert.equal(records[1].durabilityVerified,true);assert.equal(result.validation.passed,true);
});
