import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCatalogStorageCapacityInstallation,assertCatalogStorageCapacityDurability,CATALOG_PROVIDER_BUDGET_BYTES,CATALOG_STORAGE_CEILING_BYTES,CATALOG_STORAGE_BEFORE_SHA256,CATALOG_STORAGE_AFTER_SHA256} from '../scripts/lib/catalog-storage-capacity-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const options={read,sourceCommit:'e'.repeat(40),verifiedBudgetBytes:1073741824};
test('installation refuses an absent, smaller or unverified provider budget',()=>{
 for(const budget of[undefined,null,0,536870912,1073741825])assert.throws(()=>buildCatalogStorageCapacityInstallation({...options,verifiedBudgetBytes:budget}),/PROVIDER_BUDGET_REQUIRED/);
});
test('only the pinned private capacity function is adapted; writer reserve and margin remain',()=>{
 const p=buildCatalogStorageCapacityInstallation(options);
 assert.equal(p.beforePins.length,1);assert.equal(p.beforePins[0].runtime,false);assert.equal(p.beforePins[0].sha256,CATALOG_STORAGE_BEFORE_SHA256);assert.equal(p.afterPins[0].sha256,CATALOG_STORAGE_AFTER_SHA256);
 assert.equal(CATALOG_PROVIDER_BUDGET_BYTES-CATALOG_STORAGE_CEILING_BYTES,16777216);
 assert.match(p.proof,/perWriteReserveBytes',262144/);assert.match(p.mutations[0],/CATALOG_STORAGE_PROVIDER_BUDGET_REQUIRED/);
 assert.doesNotMatch(p.mutations[0],/CREATE TABLE|GRANT |DROP |TRUNCATE |INSERT INTO|DELETE FROM|UPDATE public\./i);
});
test('a modified migration is refused before any installation batch is returned',()=>{
 assert.throws(()=>buildCatalogStorageCapacityInstallation({...options,read:f=>read(f)+(f.endsWith('.sql')?'\n-- altered synthetic input':'')}),/SOURCE_CHANGED/);
});
test('the transaction verifies exact before and after metadata and all prior state',()=>{
 const p=buildCatalogStorageCapacityInstallation(options);
 assert.match(p.state,/repeatable read/);assert.match(p.state,/pg_advisory_xact_lock/);assert.match(p.beforeCheck,/prosrc/);assert.match(p.afterCheck,/prosrc/);
 assert.match(p.conservation,/PRIOR_STATE_CHANGED/);assert.equal(p.verification[0],'SET TRANSACTION READ ONLY');
 assert.equal(p.connects,false);assert.equal(p.executesSql,false);
});
test('durability rejects any change to the untouched state, budget or source',()=>{
 const p=buildCatalogStorageCapacityInstallation(options);
 const installed={version:'catalog-storage-capacity-installation.v1',sourceCommit:options.sourceCommit,sourceHashes:p.sourceHashes,mode:'install',providerBudgetBytes:1073741824,storageCeilingBytes:1056964608,safetyMarginBytes:16777216,perWriteReserveBytes:262144,adaptedFunctions:1,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,nominalRowsReturned:0,preservationSha256:'a'.repeat(64)};
 const durable={...installed,mode:'verify'};assertCatalogStorageCapacityDurability(installed,durable);
 for(const patch of[{preservationSha256:'b'.repeat(64)},{providerBudgetBytes:2147483648},{existingAclChanges:1},{businessWrites:1},{mode:'install'}])assert.throws(()=>assertCatalogStorageCapacityDurability(installed,{...durable,...patch}));
});
