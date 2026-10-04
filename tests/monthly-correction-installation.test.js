import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {prepareMonthlyCorrectionInstallation} from '../scripts/prepare-monthly-correction-installation.mjs';
import {assertMonthlyCorrectionDurability,SQL121_SHA256} from '../scripts/lib/monthly-correction-installation.mjs';
const sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(f,'utf8'),build=()=>prepareMonthlyCorrectionInstallation({read,sourceCommit});

test('121 exact committed installation audits prior rows and all metadata, with nine pinned body adaptations only',()=>{
 const p=build();assert.equal(p.connects,false);assert.equal(p.executesSql,false);assert.equal(p.ownPins.length,18);assert.equal(p.ownPins.filter(p=>p.runtime).length,5);assert.equal(p.prerequisitePins.length,9);
 assert.deepEqual(p.targets.map(t=>t.major),[17,18]);for(const t of p.targets){assert.equal(t.database_name,'neondb');assert.match(t.installation.join('\n'),/SQL121_PRIOR_STATE_CHANGED/);assert.match(t.installation.join('\n'),/SQL121_OLD_CONSTRAINT_DRIFT/);assert.match(t.installation.join('\n'),/SQL121_DESTINATION_MISMATCH/);assert.ok(t.durableVerification.includes('SET TRANSACTION READ ONLY'));assert.ok(!t.installation.some(s=>/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\s/i.test(s)));}
 assert.match(p.before,/k\.oid/);assert.match(p.before,/to_jsonb\(p\)-'prosrc'/);assert.match(p.before,/rowsSha256/);assert.doesNotMatch(p.before,/native_leave_%|IS DISTINCT FROM to_regclass\('public\.native_leave_event'\)/);assert.match(p.before,/correction_review_id/);assert.match(p.before,/attname IN/);assert.match(p.ownCheck,/proowner<>current_user/);assert.match(p.newObjectAudit,/SQL121_NEW_FOREIGN_KEYS/);assert.match(p.issueAudit,/SQL121_ISSUE_PAIR_CHECK/);
});

test('121 refuses changed source and any nonconserving or incomplete durable proof',()=>{
 assert.throws(()=>prepareMonthlyCorrectionInstallation({read:f=>read(f)+(f.includes('121-')?'\n-- changed':''),sourceCommit}),/Unreviewed/);assert.throws(()=>prepareMonthlyCorrectionInstallation({read,sourceCommit:'unknown'}));
 const installed={sourceCommit,sqlSha256:SQL121_SHA256,allChecksPassed:true,functions121:18,runtimeFacades:5,newTables:3,eventRows:0,guardsChanged:9,constraintsChanged:4,issueColumnsAdded:2,nominalRowsReturned:0,priorTableCount:188,beforeFingerprint:'b'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)},durable={...installed};delete durable.beforeFingerprint;
 assert.equal(assertMonthlyCorrectionDurability({installed,durable,sourceCommit}).ok,true);
 for(const patch of [{afterFingerprint:'d'.repeat(64)},{newObjectFingerprint:'e'.repeat(64)},{eventRows:1},{guardsChanged:8},{constraintsChanged:5},{functions121:17},{issueColumnsAdded:1},{sourceCommit:'f'.repeat(40)},{nominalRowsReturned:1},{priorTableCount:0},{allChecksPassed:false}])assert.throws(()=>assertMonthlyCorrectionDurability({installed,durable:{...durable,...patch},sourceCommit}));
 assert.throws(()=>assertMonthlyCorrectionDurability({installed:{...installed,beforeFingerprint:'e'.repeat(64)},durable,sourceCommit}),/PRIOR_STATE_CHANGED/);
});

test('filtered deployment retains every source of the installation and forbids municipal private material',()=>{
 const rules=read('.vercelignore').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const negated=rule.startsWith('!'),pattern=negated?rule.slice(1):rule;const matches=pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||(!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern));if(matches)keep=negated;}return keep;};
 const p=prepareMonthlyCorrectionInstallation({read:file=>{assert.ok(included(file),'Required source excluded: '+file);return read(file);},sourceCommit});assert.equal(p.ownPins.length,18);assert.equal(p.sqlSha256,SQL121_SHA256);
 for(const file of ['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/review.json','data-rrhh/private.json','source.txt','source.sql.gz','grh_junin.backup_2026100115_plataforma.sql.gz'])assert.equal(included(file),false,'Private source included: '+file);
});
