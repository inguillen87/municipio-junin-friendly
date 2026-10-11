import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOwnSalarySeniorityInstallation, assertOwnSalarySeniorityDurability, SQL156_SHA256 } from '../scripts/lib/own-salary-seniority-installation.mjs';
import { ownInstallationFunctionPin } from '../scripts/lib/own-payroll-installation.mjs';
const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('batch pins the published current bodies and grants only four guarded new facades',()=>{
 const b=buildOwnSalarySeniorityInstallation({read,sourceCommit});
 assert.equal(b.sourceHashes['scripts/migrations/156-own-salary-seniority.sql'],SQL156_SHA256);
 assert.equal(b.newPins.length,12);assert.equal(b.newPins.filter(p=>p.runtime).length,4);
 assert.equal(b.beforeDefinitions.length,4);assert.equal(b.changed.length,4);
 for(let i=0;i<4;i++)assert.equal(ownInstallationFunctionPin(b.beforeDefinitions[i]).signature,ownInstallationFunctionPin(b.changed[i]).signature);
 assert.match(b.before,/CASE WHEN p.oid IN\(/);assert.match(b.conservation,/IS DISTINCT FROM/);
 assert.match(b.afterCheck,/SENIORITY_TABLE_SECURITY/);assert.match(b.afterCheck,/SENIORITY_IMMUTABLE_GUARD/);
 assert.ok(b.connects===false&&b.executesSql===false);
});
test('unreviewed migration, missing source anchor and ambiguous commit fail before a batch exists',()=>{
 assert.throws(()=>buildOwnSalarySeniorityInstallation({sourceCommit,read:f=>read(f)+(f.endsWith('156-own-salary-seniority.sql')?'\n-- changed':'')}),/REVIEWED_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnSalarySeniorityInstallation({sourceCommit:'main',read}));
 assert.throws(()=>buildOwnSalarySeniorityInstallation({sourceCommit,read:f=>f.endsWith('122-own-payroll-programs.sql')?read(f).replace('sourceCode','sourceUnrecognized'):read(f)}));
});
test('durability rejects wrong source, changed fingerprint, records or access assignments',()=>{
 const b=buildOwnSalarySeniorityInstallation({read,sourceCommit}),proof={version:'own-salary-seniority-installation.v1',sourceCommit,sourceHashes:b.sourceHashes,newTables:1,newFunctions:12,runtimeFacades:4,adaptedFunctions:4,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,preservationSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)};
 const installed={...proof,mode:'install'},durable={...proof,mode:'verify'};
 assert.equal(assertOwnSalarySeniorityDurability({installed,durable,batch:b}).passed,true);
 for(const patch of[{sourceCommit:'d'.repeat(40)},{eventRows:1},{roleAssignmentsAdded:1},{objectFingerprint:'e'.repeat(64)},{preservationSha256:'f'.repeat(64)},{sourceHashes:{...b.sourceHashes,'scripts/migrations/156-own-salary-seniority.sql':'0'.repeat(64)}}])assert.throws(()=>assertOwnSalarySeniorityDurability({installed,durable:{...durable,...patch},batch:b}));
});
