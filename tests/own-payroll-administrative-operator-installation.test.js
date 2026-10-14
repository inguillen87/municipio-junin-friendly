import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildOwnPayrollAdministrativeOperatorInstallation,assertOwnPayrollAdministrativeOperatorDurability,OWN_ADMIN_OPERATOR_MIGRATION} from '../scripts/lib/own-payroll-administrative-operator-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);

test('administrative operator batch replaces exactly three published bodies and preserves all existing metadata and data',()=>{
 const b=buildOwnPayrollAdministrativeOperatorInstallation({read,sourceCommit});assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.migration.length,3);
 assert.deepEqual(b.afterPins.map(p=>[p.name,p.runtime]),[['own_run_context_v1',false],['own_run_bootstrap_v1',true],['own_novelty_sources_v1',false]]);
 assert.ok(b.migration.every(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.')));assert.doesNotMatch(b.migration.join('\n'),/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|REVOKE)\b/i);
 for(let i=0;i<3;i++)assert.deepEqual({...b.afterPins[i],sha256:null},{...b.beforePins[i],sha256:null});
 assert.match(b.before,/CASE WHEN p\.oid IN/);assert.match(b.before,/to_jsonb\(p\)-'prosrc'/);assert.match(b.conservation,/IS DISTINCT FROM/);assert.match(b.mode,/repeatable read/);assert.match(b.mode,/PARTIAL_OR_DRIFTED/);assert.match(b.apply,/mode'\)='install'/);
 for(const name of['own_run_capture_v1','own_run_complete_v1','own_run_complete_full_v1','native_salary_administrative_context_v1','own_run_owned_v1','own_run_attempt_v1'])assert.ok(b.prerequisitePins.some(p=>p.name===name));
 assert.equal(b.prerequisitePins.find(p=>p.name==='own_run_owned_v1').runtime,false);assert.equal(b.prerequisitePins.find(p=>p.name==='own_run_attempt_v1').runtime,true);
 for(const name of['own_run_owned_v1','own_run_attempt_v1']){const p=b.prerequisitePins.find(p=>p.name===name);assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(b.beforeCheck.includes(p.sha256)&&b.afterCheck.includes(p.sha256));}
 assert.match(b.verification.at(-1),/'transactionDataPreserved',false/);assert.match(b.before,/pg_auth_members/);assert.match(b.before,/rowsSha256/);
});
test('body and source drift cannot become an approved batch; preserving a header is insufficient',()=>{
 assert.throws(()=>buildOwnPayrollAdministrativeOperatorInstallation({read,sourceCommit:'main'}));
 const b=buildOwnPayrollAdministrativeOperatorInstallation({read,sourceCommit});
 for(const file of Object.keys(b.sourceHashes).filter(f=>f!==OWN_ADMIN_OPERATOR_MIGRATION))assert.throws(()=>buildOwnPayrollAdministrativeOperatorInstallation({sourceCommit,read:f=>read(f)+(f===file?'\n-- source drift':'')}));
 for(const [from,to]of[["IF nominal OR write_access THEN","IF nominal OR write_access OR true THEN"],["ctx:=public.native_salary_administrative_context_v1(p);","ctx:=ctx||jsonb_build_object('actorPersonId',p->>'actorPersonId','parameterActorVerified',true);"],["SQLERRM NOT IN('OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_IDENTITY_CHANGED')","false"],["actor_ready AND nominal_ready AND","actor_ready OR nominal_ready OR"]])assert.throws(()=>buildOwnPayrollAdministrativeOperatorInstallation({sourceCommit,read:f=>f===OWN_ADMIN_OPERATOR_MIGRATION?read(f).replace(from,to):read(f)}));
});
test('independent durable verification tolerates legitimate later data but refuses metadata, ACL or data-writing installation claims',()=>{
 const batch=buildOwnPayrollAdministrativeOperatorInstallation({read,sourceCommit}),installed={version:'own-payroll-administrative-operator-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',newTables:0,newFunctions:0,adaptedFunctions:3,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0,transactionDataPreserved:true,preservationSha256:'b'.repeat(64),priorMetadataSha256:'c'.repeat(64),objectFingerprint:'d'.repeat(64)},durable={...installed,mode:'verify',transactionDataPreserved:false,preservationSha256:'e'.repeat(64)};
 assert.doesNotThrow(()=>assertOwnPayrollAdministrativeOperatorDurability({installed,durable,batch}));
 for(const change of[{roleAssignmentsAdded:1},{existingAclChanges:1},{associationWrites:1},{businessWrites:1},{nominalRowsReturned:1},{newFunctions:1},{adaptedFunctions:4},{sourceHashes:{}},{priorMetadataSha256:'f'.repeat(64)},{objectFingerprint:'f'.repeat(64)},{mode:'install'},{transactionDataPreserved:true}])assert.throws(()=>assertOwnPayrollAdministrativeOperatorDurability({installed,durable:{...durable,...change},batch}));
 assert.throws(()=>assertOwnPayrollAdministrativeOperatorDurability({installed:{...installed,transactionDataPreserved:false},durable,batch}));
});
