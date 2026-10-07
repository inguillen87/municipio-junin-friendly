import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildAdoptionUuidDefaultRepair as build,assertAdoptionUuidRepairDurability as durable,UUID_REPAIR_TABLES} from '../scripts/lib/adoption-uuid-default-repair.mjs';
import {prepareAdoptionUuidDefaultRepair} from '../scripts/prepare-adoption-uuid-default-repair.mjs';
import {ownInstallationSettings} from '../scripts/prepare-own-payroll-installation.mjs';
const options={read:f=>fs.readFileSync(f,'utf8'),sourceCommit:'a'.repeat(40)};
test('installation uses the same trusted function resolution as runtime',()=>{
 assert.ok(ownInstallationSettings.includes('SET LOCAL search_path=pg_catalog,public,pg_temp'));
 assert.ok(!ownInstallationSettings.includes('SET LOCAL search_path=public,pg_catalog,pg_temp'));
});
test('repair changes only two reviewed empty-table defaults; runtime checks stay strict',()=>{
 const b=build(options);assert.equal(b.apply.length,2);assert.deepEqual(UUID_REPAIR_TABLES,['employment_adoption_proposal','employment_adoption_decision']);
 for(const [i,s]of b.apply.entries()){assert.ok(s.includes('ALTER TABLE public.'+UUID_REPAIR_TABLES[i]+' ALTER COLUMN id SET DEFAULT pg_catalog.gen_random_uuid()'));assert.ok(s.includes("expression='public.gen_random_uuid()'"));}
 assert.ok(b.initial.includes('ADOPTION_UUID_TABLE_NOT_EMPTY'));assert.ok(b.final.includes('ADOPTION_UUID_TABLE_NOT_EMPTY'));
 assert.ok(b.initial.includes('8c6b4fb849252ccdbf2c312f362a876d017246d0f5194b50eaee0dccd20fc776'));assert.ok(!b.final.includes("AND actual IS DISTINCT FROM (item->>'wrapper')"));
 assert.ok(b.prerequisite.includes(b.readyPin.sha256));assert.equal(b.runtime,'DO $uuid_runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $uuid_runtime$');
 assert.equal(b.installation[1],b.lock);assert.ok(b.installation.indexOf(b.before)<b.installation.indexOf(b.apply[0]));
 assert.doesNotMatch(b.installation.join('\n'),/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|GRANT |REVOKE |CREATE (?:TABLE|FUNCTION)|DROP |TRUNCATE )/);
 assert.ok(b.before.includes('rowsSha256'));assert.ok(b.before.includes('otherDefaults'));assert.ok(b.before.includes('pg_roles'));assert.ok(b.before.includes('pg_auth_members'));assert.ok(b.before.includes('pg_get_viewdef'));
 assert.ok(!b.before.includes("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')"));assert.ok(b.audit.includes('IS DISTINCT FROM'));
});
test('batch is review-only, committed-source pinned and constrained to existing destinations',()=>{
 assert.throws(()=>build({...options,sourceCommit:'unknown'}));assert.throws(()=>build({...options,read:f=>options.read(f)+(f.endsWith('133-employment-adoption-application.sql')?'-- changed':'')}));
 const b=prepareAdoptionUuidDefaultRepair(options);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.deepEqual(b.targets.map(t=>t.major),[17,18]);
 for(const t of b.targets){assert.equal(t.durableVerification[0],'SET TRANSACTION READ ONLY');assert.equal(t.durableVerification.at(-1),b.proof);assert.ok(t.installation.some(s=>[t.projectId,t.branchId,t.endpointId,String(t.guardOid)].every(v=>s.includes(v))));assert.ok(t.installation.includes("SET LOCAL statement_timeout='45s'"));assert.ok(t.installation.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/.test(s)));}
});
test('independent proof cannot accept mutation, broadened effects or missing readiness',()=>{
 const b=build(options),p={version:b.version,sourceCommit:b.sourceCommit,sourceHashes:b.sourceHashes,allChecksPassed:true,runtimeReadinessPassed:true,reviewedDefaults:2,newTables:0,newFunctions:0,permissionChanges:0,businessOperations:0,nominalRowsReturned:0,adoptionRows:0,priorFingerprint:'a'.repeat(64),tableFingerprint:'b'.repeat(64)};
 assert.ok(durable({installed:p,durable:p,batch:b}).passed);
 for(const changes of [{runtimeReadinessPassed:false},{permissionChanges:1},{businessOperations:1},{nominalRowsReturned:1},{adoptionRows:1},{extra:true},{sourceCommit:'b'.repeat(40)}])assert.throws(()=>durable({installed:{...p,...changes},durable:{...p,...changes},batch:b}));
 assert.throws(()=>durable({installed:p,durable:{...p,priorFingerprint:'c'.repeat(64)},batch:b}));
});
