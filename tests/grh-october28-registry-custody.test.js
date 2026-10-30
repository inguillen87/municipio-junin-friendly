// Proposed pure source tests. No SQL execution, native sessions or admission.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{throw Error('REGISTRY_CUSTODY_TEST_IO_FORBIDDEN');};
for(const[module,names]of[[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['get','request','createServer']],[https,['get','request','createServer']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const name of names)module[name]=denied;
globalThis.fetch=denied;syncBuiltinESMExports();
const {projectFinalReviewTestSourceParent}=await import('./fixtures/final-review-test-target-source-succession.js');
const {buildFinalGrhSourceReviewAdmissionInstallation,FINAL_REVIEW_ADMISSION_FILE,FINAL_REVIEW_ADMISSION_SQL_SHA256,FINAL_REVIEW_ADMISSION_PROFILES,FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256}=await import('../scripts/lib/final-grh-source-review-admission-installation.mjs');
const {projectOctober28RegistryParent,OCTOBER28_REGISTRY_PARENT_SHA256,OCTOBER28_REGISTRY_CANDIDATE_SHA256}=await import('../scripts/lib/grh-october28-candidate-registry-source.mjs');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const sourceCommit='a'.repeat(40),REGISTRY='scripts/lib/grh-source-profiles.json',HELPER='scripts/lib/grh-october28-candidate-registry-source.mjs';

test('finite RAW inverses retain the complete module and both predecessor tests',()=>{
 const fixture=JSON.parse(read('tests/fixtures/grh-october28-registry-custody-inverses.json'));
 assert.equal(fixture.version,'grh-october28-registry-custody-finite-inverses.v1');assert.equal(fixture.files.length,3);
 for(const file of fixture.files){
  let source=projectFinalReviewTestSourceParent(file.path,Buffer.from(read(file.path),'utf8')).toString('utf8');assert.equal(hash(source),file.afterSha256,file.path);
  for(const operation of file.operations){assert.ok(operation.after.length>0);assert.equal(source.split(operation.after).length,2,file.path);source=source.replace(operation.after,()=>operation.before);}
  assert.equal(hash(source),file.beforeSha256,file.path+' whole parent');
 }
 assert.equal(fixture.files[0].beforeSha256,'5046da75f482b0a63d1acfdcfc0b63502276351549248a2196f1e63ef4c859f2');
});

test('metadata records the actual registry and helper, while retaining RAW parent authority separately',()=>{
 const parent=projectOctober28RegistryParent(read(REGISTRY));
 for(const major of[17,18]){
  const batch=buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major});
  assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
  assert.equal(batch.sourceHashes[REGISTRY],hash(read(REGISTRY)));
  assert.equal(batch.sourceHashes[REGISTRY],OCTOBER28_REGISTRY_CANDIDATE_SHA256);
  assert.notEqual(batch.sourceHashes[REGISTRY],OCTOBER28_REGISTRY_PARENT_SHA256);
  assert.equal(batch.sourceHashes[HELPER],hash(read(HELPER)));
  assert.equal(FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256,OCTOBER28_REGISTRY_PARENT_SHA256);
  assert.deepEqual(batch.registryCustody,{version:parent.version,currentRegistrySha256:OCTOBER28_REGISTRY_CANDIDATE_SHA256,
   parentRegistrySha256:OCTOBER28_REGISTRY_PARENT_SHA256,wholeInverseVerified:true,sqlValidityGranted:false});
  assert.equal(Object.isFrozen(batch.registryCustody),true);
 }
});

test('historical144 and183 SQL and its two admitted tuples remain unchanged; no Oct28 SQL tuple appears',()=>{
 assert.equal(hash(read('scripts/migrations/144-final-grh-source-revision.sql')),'818e53c560da8ec3cad55073071d0a56669c6581f51c20d910600ea58b9697d5');
 assert.equal(hash(read(FINAL_REVIEW_ADMISSION_FILE)),'a85c01c1bf2ae620b1af32a2e1564c52544562f39235557ee5e5549717f47e94');
 assert.equal(FINAL_REVIEW_ADMISSION_SQL_SHA256,hash(read(FINAL_REVIEW_ADMISSION_FILE)));
 assert.deepEqual(FINAL_REVIEW_ADMISSION_PROFILES.map(p=>p.profile),['grh-junin-2026-10-01','grh-junin-2026-10-14']);
 const batch=buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major:17});
 const sql=[...batch.migration,...batch.preflight,...batch.installation,...batch.repetition,...batch.durableVerification,
  ...batch.settings,batch.destination,batch.before,batch.after,batch.initial,batch.final,batch.audit,batch.sourcePrerequisite.check,
  ...Object.values(batch.transactions).flatMap(value=>value.statements),...batch.guardedRollback.statements];
 assert.ok(sql.every(value=>typeof value==='string'));
 for(const statement of sql)assert.equal(statement.includes('grh-junin-2026-10-28'),false);
 assert.equal(batch.sourceHashes[FINAL_REVIEW_ADMISSION_FILE],FINAL_REVIEW_ADMISSION_SQL_SHA256);
});

test('current RAW drift, helper drift and a parent substituted for the current registry fail closed',()=>{
 for(const file of[REGISTRY,HELPER])assert.throws(()=>buildFinalGrhSourceReviewAdmissionInstallation({sourceCommit,major:17,
  read:path=>read(path)+(path===file?'\n':'')}));
 const parent=projectOctober28RegistryParent(read(REGISTRY));
 assert.throws(()=>buildFinalGrhSourceReviewAdmissionInstallation({sourceCommit,major:17,
  read:path=>path===REGISTRY?parent.parentRegistryRaw:read(path)}),/FINAL_REVIEW_PREREQUISITE_SOURCE_CHANGED/);
 assert.throws(()=>projectOctober28RegistryParent(JSON.stringify({...JSON.parse(read(REGISTRY)),passed:true})),/REGISTRY_CANDIDATE_RAW_CHANGED/);
});
