import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ADOPTION_INSTALL_SHA,ADOPTION_INSTALL_FILES,ADOPTION_INSTALL_TABLES,ADOPTION_TABLE_PINS,buildEmploymentAdoptionInstallation,assertEmploymentAdoptionDurability} from '../scripts/lib/employment-adoption-installation.mjs';
import {prepareEmploymentAdoptionInstallation} from '../scripts/prepare-employment-adoption-installation.mjs';
import {adoptionInstallationQaFoundation} from '../scripts/verify-employment-adoption-installation.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(f,'utf8'),build=()=>buildEmploymentAdoptionInstallation({read,sourceCommit});
test('review batch pins all five sources and all installed metadata; writer remains private',()=>{
 const b=build();assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.pins.length,47);assert.equal(b.priorPins.length,28);assert.equal(b.pins.filter(p=>p.runtime).length,13);assert.equal(b.pins.find(p=>p.name==='employment_adoption_decide_v1').runtime,false);
 assert.equal(Object.keys(ADOPTION_TABLE_PINS).length,4);assert.notEqual(b.guardBefore.sha256,b.guardAfter.sha256);
 const sql=b.statements.join('\n');for(const value of ['rowsSha256','metaSha256','pg_auth_members','pg_default_acl','pg_roles','pg_policy','pg_get_viewdef','sequences','types','pg_advisory_xact_lock(132136)','ADOPTION_INSTALL_PARTIAL_STATE','ADOPTION_INSTALL_PRIOR_STATE_CHANGED','ADOPTION_INSTALL_TABLE_METADATA','ADOPTION_INSTALL_PREREQUISITE_METADATA','ADOPTION_INSTALL_BASELINE_AFTER'])assert.ok(sql.includes(value),value);
 assert.ok(!b.migration.some(s=>/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));assert.match(b.first,/mode'\)='first'/);assert.doesNotMatch(sql,/INSERT INTO public\.(?:iam_role|tenant_membership|internal_users|employment_contract|person_identity)|ALTER ROLE/i);
 assert.equal(b.pins.find(p=>p.name==='native_employee_read_projection_v1').sha256,'c9ecbb8303550a20ce5487f92e03c943e60be835997049a31d06bda24c61fb25');
});
test('source drift in any migration and invalid commit refuse batch generation',()=>{
 for(const file of ADOPTION_INSTALL_FILES)assert.throws(()=>buildEmploymentAdoptionInstallation({read:f=>read(f)+(f.endsWith(file)?'\n-- drift':''),sourceCommit}),/Unreviewed adoption migration/);
 assert.throws(()=>buildEmploymentAdoptionInstallation({read,sourceCommit:'unknown'}));
});
test('review targets keep existing destination/OID and UTC/isolation/security guards',()=>{
 const b=prepareEmploymentAdoptionInstallation({read,sourceCommit});assert.equal(b.targets.length,2);
 for(const t of b.targets){const sql=t.installation.join('\n');for(const v of [t.projectId,t.branchId,t.endpointId,String(t.guardOid),'REPEATABLE READ','transaction_isolation','has_schema_privilege'])assert.ok(sql.includes(v),v);assert.equal(t.durableVerification[0],'SET TRANSACTION READ ONLY');assert.ok(!t.installation.some(s=>/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));}
});
test('durability accepts retained history and rejects changed metadata, rows, receipts, counts and nominal extras',()=>{
 const counts=Object.fromEntries(ADOPTION_INSTALL_TABLES.map(name=>[name,{count:3,hash:'d'.repeat(64)}]));
 const proof={version:'employment-adoption-installation.v1',sourceCommit,sourceHashes:ADOPTION_INSTALL_SHA,allChecksPassed:true,mode:'repeat',newTables:4,newFunctions:47,runtimeFacades:13,adoptionWriterGranted:false,nominalRowsReturned:0,priorFingerprint:'b'.repeat(64),objectFingerprint:'c'.repeat(64),dataFingerprint:'d'.repeat(64),counts};
 assert.equal(assertEmploymentAdoptionDurability({installed:proof,durable:{...proof,mode:'verify'},sourceCommit}).passed,true);
 for(const change of [{allChecksPassed:false},{sourceCommit:'e'.repeat(40)},{sourceHashes:{}},{newTables:3},{newFunctions:46},{runtimeFacades:14},{adoptionWriterGranted:true},{nominalRowsReturned:1},{priorFingerprint:'f'.repeat(64)},{objectFingerprint:'f'.repeat(64)},{dataFingerprint:'f'.repeat(64)},{counts:{}},{counts:{...counts,employment_adoption_proposal:{count:4,hash:'d'.repeat(64)}}},{dni:'synthetic'},{mode:'installed'}])assert.throws(()=>assertEmploymentAdoptionDurability({installed:proof,durable:{...proof,...change},sourceCommit}));
});
test('QA uses existing loopback databases and actual sources; never creates a database or changes shared public objects',()=>{
 for(const major of [17,18]){const f=adoptionInstallationQaFoundation(major);assert.ok(f.seed.includes("current_database()<>'"+(major===17?'fixed_novelties_qa':'own_payroll_run_qa')+"'"));assert.ok(f.seed.includes("current_setting('neon.project_id',true)"));assert.ok(f.seed.endsWith('COMMIT;'));assert.match(f.cleanup,/DROP SCHEMA mc_qa_fixed_092_/);assert.doesNotMatch(f.seed,/CREATE DATABASE|CREATE ROLE|INSERT INTO public\./i);assert.ok(f.history.includes('employment_adoption_decide_v1'));assert.ok(f.transaction([], {readOnly:true}).includes('REPEATABLE READ READ ONLY'));}
 assert.throws(()=>adoptionInstallationQaFoundation(19));
});
