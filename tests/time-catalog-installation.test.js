import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeCatalogInstallation,assertTimeCatalogDurability,SQL116_SHA256} from '../scripts/lib/time-catalog-installation.mjs';
const source=fs.readFileSync('scripts/migrations/116-native-time-catalog.sql','utf8'),sourceCommit='f'.repeat(40);
test('review contains the exact tested migration and auditable whole-state preservation',()=>{
 const p=buildTimeCatalogInstallation({source,sourceCommit});assert.equal(p.migrationStatements,19);assert.equal(p.installation.length,26);assert.equal(p.durableVerification.length,4);assert.equal(p.pins.length,15);assert.equal(p.pins.filter(p=>p.runtime).length,2);
 assert.doesNotMatch(p.before,/AND p\.oid IS DISTINCT FROM to_regclass\('public\.native_leave_event'\)/);
 assert.match(p.before,/to_jsonb\(r\)-ARRAY\[''reference_code'',''display_name'',''legal_reference''\]/);assert.match(p.before,/to_jsonb\(p\)-'prosrc'/);
 assert.match(p.before,/%L=''public\.time_catalog_entry''/);assert.doesNotMatch(p.before,/%L='public\.time_catalog_entry'/);
 for(const key of ['tables','functions','triggers','views','sequences','schemas','roles','memberships','defaultAcl'])assert.ok(p.before.includes("'"+key+"'"));
 assert.match(p.audit,/SQL116_PRIOR_STATE_CHANGED/);assert.match(p.metadata,/SQL116_PRIVATE_HELPER_GRANTED/);assert.match(p.columns,/SQL116_REFERENCE_COLUMNS/);assert.match(p.before,/SQL116_PROOF_LIMIT/);
});
test('unreviewed source and incomplete commit cannot generate an installation package',()=>{
 assert.throws(()=>buildTimeCatalogInstallation({source:source+'\n-- Changed',sourceCommit}),/Unreviewed/);assert.throws(()=>buildTimeCatalogInstallation({source,sourceCommit:'not-a-commit'}));
});
test('a missing receipt, changed prior state or changed objects cannot be called durable',()=>{
 const p={sourceCommit,sqlSha256:SQL116_SHA256,allChecksPassed:true,nominalRowsReturned:0,beforeFingerprint:'a'.repeat(64),afterFingerprint:'a'.repeat(64),objectFingerprint:'b'.repeat(64)};
 assert.equal(assertTimeCatalogDurability(p,p).ok,true);
 for(const change of [{afterFingerprint:'c'.repeat(64)},{objectFingerprint:'c'.repeat(64)},{sourceCommit:'e'.repeat(40)},{sqlSha256:'c'.repeat(64)},{nominalRowsReturned:1},{allChecksPassed:false}])assert.throws(()=>assertTimeCatalogDurability(p,{...p,...change}));
 assert.throws(()=>assertTimeCatalogDurability({...p,beforeFingerprint:'c'.repeat(64)},p));
});
