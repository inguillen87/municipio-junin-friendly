import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildOwnContractWorkingTimeInstallation,assertOwnContractWorkingTimeDurability} from '../scripts/lib/own-contract-working-time-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);
test('source-fixed working-time install declares only one ledger, twelve functions and three existing consumers',()=>{
 const b=buildOwnContractWorkingTimeInstallation({read,sourceCommit});assert.equal(b.newPins.length,12);assert.equal(b.newPins.filter(p=>p.runtime).length,4);assert.equal(b.changed.length,3);assert.equal(b.beforePins.length,12);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.ok(b.changed.every(s=>!s.includes('ALTER TABLE')&&!s.includes('GRANT')));assert.match(b.before,/CASE WHEN p.oid IN/);assert.match(b.conservation,/IS DISTINCT FROM/);assert.match(b.apply,/mode'\)='install'/);assert.match(b.verification.at(-1),/'verify'/);
});
test('durable proof refuses another source, lost rows and changed roles instead of claiming preservation',()=>{
 const batch=buildOwnContractWorkingTimeInstallation({read,sourceCommit});
 const installed={version:'own-contract-working-time-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',newTables:1,newFunctions:12,runtimeFacades:4,adaptedFunctions:3,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,preservationSha256:'b'.repeat(64)};
 const durable={...installed,mode:'verify'};assert.doesNotThrow(()=>assertOwnContractWorkingTimeDurability({installed,durable,batch}));
 for(const mutation of[{sourceCommit:'c'.repeat(40)},{preservationSha256:'d'.repeat(64)},{eventRows:1},{roleAssignmentsAdded:1},{existingAclChanges:1},{businessWrites:1},{sourceHashes:{}},{mode:'install'}])assert.throws(()=>assertOwnContractWorkingTimeDurability({installed,durable:{...durable,...mutation},batch}));
});
test('modified SQL and invalid source cannot generate a reviewed installation',()=>{
 assert.throws(()=>buildOwnContractWorkingTimeInstallation({sourceCommit:'main',read}));
 for(const file of Object.keys(buildOwnContractWorkingTimeInstallation({read,sourceCommit}).sourceHashes))assert.throws(()=>buildOwnContractWorkingTimeInstallation({sourceCommit,read:f=>read(f)+(f===file?'\n-- unexpected alteration':'')}));
});
