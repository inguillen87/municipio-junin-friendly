import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareFixedGroupsInstallation} from '../scripts/prepare-fixed-groups-installation.mjs';
import {assertFixedGroupsDurability,SQL117_SHA256} from '../scripts/lib/fixed-groups-installation.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(f,'utf8'),build=()=>prepareFixedGroupsInstallation({read,sourceCommit});
test('117 refuses altered source, targets only the two existing databases and preserves prior state',()=>{
 const p=build();assert.equal(p.connects,false);assert.equal(p.executesSql,false);assert.equal(p.ownPins.length,3);assert.equal(p.ownPins.filter(x=>x.runtime).length,2);assert.equal(p.prerequisitePins.length,8);
 assert.deepEqual(p.targets.map(x=>x.major),[17,18]);for(const t of p.targets){assert.equal(t.database_name,'neondb');assert.ok(t.installation.some(s=>s.includes('SQL117_DESTINATION_MISMATCH')));assert.ok(t.installation.some(s=>s.includes('SQL117_OBJECT_ALREADY_PRESENT')));assert.ok(t.installation.some(s=>s.includes('SQL117_PRIOR_STATE_CHANGED')));assert.ok(t.durableVerification.includes('SET TRANSACTION READ ONLY'));assert.ok(!t.installation.some(s=>/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\s/i.test(s)));}
 assert.throws(()=>prepareFixedGroupsInstallation({read:f=>read(f)+(f.includes('117-')?'\n-- changed':''),sourceCommit}),/Unreviewed/);
});
test('117 durable proof rejects changed prior data, changed installed metadata or nonempty receipts',()=>{
 const installed={sourceCommit,sqlSha256:SQL117_SHA256,allChecksPassed:true,functions117:3,runtimeFacades:2,eventRows:0,nominalRowsReturned:0,priorTableCount:20,beforeFingerprint:'b'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)},durable={...installed};delete durable.beforeFingerprint;
 assert.equal(assertFixedGroupsDurability({installed,durable,sourceCommit}).ok,true);
 for(const patch of [{afterFingerprint:'d'.repeat(64)},{newObjectFingerprint:'e'.repeat(64)},{eventRows:1},{functions117:4},{sourceCommit:'f'.repeat(40)},{nominalRowsReturned:1}])assert.throws(()=>assertFixedGroupsDurability({installed,durable:{...durable,...patch},sourceCommit}));
 assert.throws(()=>assertFixedGroupsDurability({installed:{...installed,beforeFingerprint:'e'.repeat(64)},durable,sourceCommit}),/PRIOR_STATE_CHANGED/);
});
