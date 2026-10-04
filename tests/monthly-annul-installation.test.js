import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareMonthlyAnnulInstallation} from '../scripts/prepare-monthly-annul-installation.mjs';
import {assertMonthlyAnnulDurability,SQL120_SHA256} from '../scripts/lib/monthly-annul-installation.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(f,'utf8'),build=()=>prepareMonthlyAnnulInstallation({read,sourceCommit});
test('120 exact reviewed installation preserves every prior row and metadata except two pinned guard bodies and five explicit checks',()=>{
 const p=build();assert.equal(p.connects,false);assert.equal(p.executesSql,false);assert.equal(p.ownPins.length,11);assert.equal(p.ownPins.filter(p=>p.runtime).length,4);assert.equal(p.prerequisitePins.length,6);
 assert.equal(p.prerequisitePins[0].sha256,'62465ef6da1a2fc392854b9ca3c5ea7ba54ddea6869d667e5c6936e788dea044');assert.equal(p.prerequisitePins[1].sha256,'bbbe85e85c58f017c6e55248a7b356bc1d2ff5fe85c9d8e946ba3b46308ed708');
 assert.deepEqual(p.targets.map(t=>t.major),[17,18]);for(const t of p.targets){assert.equal(t.database_name,'neondb');assert.match(t.installation.join('\n'),/SQL120_PRIOR_STATE_CHANGED/);assert.match(t.installation.join('\n'),/SQL120_OLD_CONSTRAINT_DRIFT/);assert.match(t.installation.join('\n'),/SQL120_DESTINATION_MISMATCH/);assert.ok(t.durableVerification.includes('SET TRANSACTION READ ONLY'));assert.ok(!t.installation.some(s=>/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\s/i.test(s)));}
 assert.match(p.before,/k.oid=t.tgconstraint/);assert.match(p.before,/to_jsonb\(p\)-'prosrc'/);assert.match(p.before,/rowsSha256/);assert.match(p.ownCheck,/proowner<>current_user/);assert.match(p.newObjectAudit,/SQL120_NEW_FOREIGN_KEYS/);
});
test('120 refuses unreviewed source, unknown commits or changed installed metadata',()=>{
 assert.throws(()=>prepareMonthlyAnnulInstallation({read:f=>read(f)+(f.includes('120-')?'\n-- changed':''),sourceCommit}),/Unreviewed/);assert.throws(()=>prepareMonthlyAnnulInstallation({read,sourceCommit:'unknown'}));
 const installed={sourceCommit,sqlSha256:SQL120_SHA256,allChecksPassed:true,functions120:11,runtimeFacades:4,newTables:3,eventRows:0,guardsChanged:2,constraintsChanged:5,nominalRowsReturned:0,priorTableCount:188,beforeFingerprint:'b'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)},durable={...installed};delete durable.beforeFingerprint;
 assert.equal(assertMonthlyAnnulDurability({installed,durable,sourceCommit}).ok,true);
 for(const patch of [{afterFingerprint:'d'.repeat(64)},{newObjectFingerprint:'e'.repeat(64)},{eventRows:1},{guardsChanged:3},{constraintsChanged:4},{functions120:12},{sourceCommit:'f'.repeat(40)},{nominalRowsReturned:1}])assert.throws(()=>assertMonthlyAnnulDurability({installed,durable:{...durable,...patch},sourceCommit}));
 assert.throws(()=>assertMonthlyAnnulDurability({installed:{...installed,beforeFingerprint:'e'.repeat(64)},durable,sourceCommit}),/PRIOR_STATE_CHANGED/);
});
