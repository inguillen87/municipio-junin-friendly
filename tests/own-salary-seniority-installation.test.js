import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildOwnSalarySeniorityInstallation, assertOwnSalarySeniorityDurability, SQL156_SHA256 } from '../scripts/lib/own-salary-seniority-installation.mjs';
import { ownInstallationFunctionPin } from '../scripts/lib/own-payroll-installation.mjs';
const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('deployment package contains every exact installation source and keeps private and blocked sources excluded',()=>{
 const rules=read('.vercelignore').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const negate=rule.startsWith('!'),pattern=negate?rule.slice(1):rule;if(pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern))keep=negate;}return keep;};
 const b=buildOwnSalarySeniorityInstallation({sourceCommit,read:file=>{assert.ok(included(file),'Excluded installation source: '+file);return read(file);}});
 assert.equal(b.sourceHashes['scripts/migrations/156-own-salary-seniority.sql'],SQL156_SHA256);
 for(const file of['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/source.json','backup.sql.gz','scripts/migrations/114-native-payroll-resolver.sql','scripts/migrations/115-native-payroll-evaluator.sql','scripts/migrations/111-budget-historical-positions.sql'])assert.equal(included(file),false,file);
 for(const file of['api/internal-own-salary-seniority.js','assets/own-salary-seniority-model.js','assets/own-salary-seniority-panel.js','assets/own-salary-seniority-panel.css'])assert.ok(included(file),file);
 for(const file of['assets/own-salary-seniority-model.js','assets/own-salary-seniority-panel.js','assets/own-salary-seniority-panel.css'])assert.ok(read('scripts/build-friendly.mjs').includes("'"+file+"'"),file);
});
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
