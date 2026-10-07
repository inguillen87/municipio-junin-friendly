import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ADOPTED_CONSUMERS_SOURCE_SHA,buildAdoptedConsumersInstallation,assertAdoptedConsumersDurability} from '../scripts/lib/adopted-consumers-installation.mjs';
import {prepareAdoptedConsumersInstallation} from '../scripts/prepare-adopted-consumers-installation.mjs';
import {ADOPTION_INSTALL_TABLES} from '../scripts/lib/employment-adoption-installation.mjs';
const read=f=>fs.readFileSync(f,'utf8'),sourceCommit='a'.repeat(40),build=()=>buildAdoptedConsumersInstallation({read,sourceCommit});
test('atomic first/upgrade/repeat batches keep adoption writer private and all 11 sources pinned',()=>{
 const b=build();assert.equal(Object.keys(b.sourceHashes).length,11);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.helperPins.length,5);assert.ok(b.helperPins.every(p=>p.runtime===false));assert.equal(b.beforePins.length,19);assert.equal(b.afterPins.length,19);
 for(let i=0;i<19;i++)assert.deepEqual({...b.beforePins[i],sha256:null},{...b.afterPins[i],sha256:null});
 assert.match(b.state,/pg_advisory_xact_lock\(132136\)/);assert.match(b.state,/pg_advisory_xact_lock\(132142\)/);for(const mode of ['first','upgrade','repeat'])assert.ok(b.state.includes("'"+mode+"'"));assert.match(b.first,/IN\('first','upgrade'\)/);assert.doesNotMatch(b.verification.join('\n'),/EXECUTE '(?:CREATE|ALTER|GRANT|INSERT)/);
 assert.ok(!b.migration.some(s=>/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));assert.equal(b.base.pins.find(p=>p.name==='employment_adoption_decide_v1').runtime,false);
});
test('conservation normalizes only reviewed bodies and monthly shape, never rows/keys/ACLs',()=>{
 const b=build(),sql=b.statements.join('\n');for(const token of ['rowsSha256','metaSha256','pg_roles','pg_auth_members','pg_default_acl','sequences','types','ADOPTED_CONSUMERS_PRIOR_STATE_CHANGED','ADOPTED_CONSUMERS_MONTHLY_SHAPE_CHANGED','ADOPTED_CONSUMERS_BEFORE_METADATA','ADOPTED_CONSUMERS_AFTER_METADATA'])assert.ok(sql.includes(token),token);
 assert.ok(b.before.includes("a.attname='legajo_snapshot'"));assert.ok(b.before.includes("k.conname='payroll_novelty_row_legajo_ck'"));assert.ok(b.before.includes("CASE WHEN p.oid IN(to_regprocedure('public.grh_effective_baseline_guard_v1()')"));
 assert.ok(b.before.includes("k.contype='n' AND k.conname='payroll_novelty_row_legajo_snapshot_not_null' THEN to_jsonb(k)-'oid'"));assert.ok(b.proof.includes('monthlyConstraints'));assert.ok(b.proof.includes('to_jsonb(k) ORDER BY k.conname'));
 assert.doesNotMatch(b.before,/to_jsonb\(r\).*\-'|WHERE.*request_key\s*=.*NULL/);assert.doesNotMatch(b.migration.join('\n'),/INSERT INTO public\.(?:iam_role|tenant_membership|person_identity|employment_contract)|ALTER ROLE/i);
});
test('drift in any consumer or base migration refuses generation',()=>{
 for(const file of Object.keys(ADOPTED_CONSUMERS_SOURCE_SHA))assert.throws(()=>buildAdoptedConsumersInstallation({read:f=>read(f)+(f.endsWith(file)?'\n-- drift':''),sourceCommit}),/Unreviewed/);
 assert.throws(()=>buildAdoptedConsumersInstallation({read,sourceCommit:'unknown'}));
});
test('target review retains existing PG17/PG18 destination, guard OID and read-only durability checks',()=>{
 const b=prepareAdoptedConsumersInstallation({read,sourceCommit});assert.equal(b.targets.length,2);for(const t of b.targets){const sql=t.installation.join('\n');for(const v of [t.projectId,t.branchId,t.endpointId,String(t.guardOid),'REPEATABLE READ','has_schema_privilege'])assert.ok(sql.includes(v));assert.equal(t.durableVerification[0],'SET TRANSACTION READ ONLY');}
});
test('durability requires exactly conserved fingerprints, counts, source commit and non-nominal proof',()=>{
 const proof={version:'adopted-consumers-installation.v1',sourceCommit,sourceHashes:ADOPTED_CONSUMERS_SOURCE_SHA,mode:'first',allChecksPassed:true,newTables:4,newFunctions:52,adaptedFunctions:20,runtimeFacades:13,adoptionWriterGranted:false,roleAssignmentsAdded:0,nominalRowsReturned:0,priorFingerprint:'b'.repeat(64),objectFingerprint:'c'.repeat(64),dataFingerprint:'d'.repeat(64),counts:Object.fromEntries(ADOPTION_INSTALL_TABLES.map(n=>[n,{count:3,hash:'e'.repeat(64)}]))};
 for(const mode of ['upgrade','repeat','verify'])assert.equal(assertAdoptedConsumersDurability({installed:proof,durable:{...proof,mode},sourceCommit}).passed,true);
 for(const patch of [{mode:'partial'},{sourceHashes:{}},{sourceCommit:'f'.repeat(40)},{nominalRowsReturned:1},{roleAssignmentsAdded:1},{adoptionWriterGranted:true},{newFunctions:51},{adaptedFunctions:19},{allChecksPassed:false},{priorFingerprint:'f'.repeat(64)},{objectFingerprint:'f'.repeat(64)},{dataFingerprint:'f'.repeat(64)},{counts:{}},{legajo:'synthetic'}])assert.throws(()=>assertAdoptedConsumersDurability({installed:proof,durable:{...proof,...patch},sourceCommit}));
});
