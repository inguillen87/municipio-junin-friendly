import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildOwnContractSalaryConditionsInstallation,assertOwnContractSalaryConditionsDurability} from '../scripts/lib/own-contract-salary-conditions-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);
test('conditions installation pins the whole source and retains legacy completion as a separate bounded facade',()=>{
 const b=buildOwnContractSalaryConditionsInstallation({read,sourceCommit});assert.equal(b.newPins.length,16);assert.equal(b.newPins.filter(p=>p.runtime).length,5);assert.equal(b.changed.length,6);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.ok(b.changed.every(s=>!s.includes('ALTER TABLE')&&!s.includes('GRANT')));assert.match(b.before,/CASE WHEN p.oid IN/);assert.match(b.before,/to_jsonb\(p\)-'prosrc'/);assert.match(b.conservation,/IS DISTINCT FROM/);assert.match(b.mode,/ISOLATION_REQUIRED/);assert.match(b.mode,/OBJECT_CONFLICT/);assert.match(b.apply,/mode'\)='install'/);assert.match(b.verification.at(-1),/'verify'/);
 const legacy=b.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_complete_v1(')),full=b.full[0];assert.match(legacy,/4194304/);assert.match(full,/33554432/);
});
test('conditions durable proof refuses different rows, object metadata, source and permissions',()=>{
 const batch=buildOwnContractSalaryConditionsInstallation({read,sourceCommit}),installed={version:'own-contract-salary-conditions-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',newTables:1,newFunctions:16,runtimeFacades:5,adaptedFunctions:6,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,preservationSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)},durable={...installed,mode:'verify'};
 assert.doesNotThrow(()=>assertOwnContractSalaryConditionsDurability({installed,durable,batch}));
 for(const change of[{eventRows:1},{eventRows:-1},{objectFingerprint:'d'.repeat(64)},{preservationSha256:'e'.repeat(64)},{sourceCommit:'f'.repeat(40)},{sourceHashes:{}},{existingAclChanges:1},{businessWrites:1},{roleAssignmentsAdded:1},{mode:'install'}])assert.throws(()=>assertOwnContractSalaryConditionsDurability({installed,durable:{...durable,...change},batch}));
});
test('changed SQL, prerequisite metadata or nonimmutable commit cannot become an installation batch',()=>{
 assert.throws(()=>buildOwnContractSalaryConditionsInstallation({read,sourceCommit:'master'}));
 for(const f of Object.keys(buildOwnContractSalaryConditionsInstallation({read,sourceCommit}).sourceHashes))assert.throws(()=>buildOwnContractSalaryConditionsInstallation({sourceCommit,read:p=>read(p)+(p===f?'\n-- unexpected alteration':'')}));
});
