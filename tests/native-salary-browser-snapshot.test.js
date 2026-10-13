import test from 'node:test';
import assert from 'node:assert/strict';
import {observedSalaryBootstrap} from '../scripts/lib/native-salary-browser-snapshot.mjs';
import {bootstrap} from './fixtures/native-salary-synthetic.js';
import {salaryStreamFixture} from './fixtures/native-salary-stream-synthetic.js';
import {fullSalaryCatalogFixture} from './fixtures/native-salary-full-catalog-synthetic.js';

function revoked(){const base=bootstrap(),{items,classification}=fullSalaryCatalogFixture();return bootstrap({permissions:{...base.permissions,canPropose:false},classification:{version:'c'.repeat(64),items:classification},catalog:{version:'b'.repeat(64),revision:1,items}});}
test('browser revocation assertion uses the complete observed refresh, not a prior response or separate read',async()=>{
 const prior=salaryStreamFixture(bootstrap()).frames,current=salaryStreamFixture(revoked()).frames;assert.ok(current.length>1);
 const observed=await observedSalaryBootstrap([...prior,...current],prior.length);assert.equal(observed.permissions.canPropose,false);assert.equal(observed.catalog.items.length,3204);
});
test('missing observed pages cannot pass a browser permission assertion',async()=>{
 const frames=salaryStreamFixture(revoked()).frames;await assert.rejects(observedSalaryBootstrap(frames.slice(0,1),0),/BROWSER_SALARY_BLOCK_MISSING/);
});
test('mixed or corrupt observed pages cannot stand in for the complete permission refresh',async()=>{
 const frames=salaryStreamFixture(revoked()).frames;
 await assert.rejects(observedSalaryBootstrap([frames[0],frames[2],...frames.slice(2)],0),/BROWSER_SALARY_BLOCK_ORDER/);
 const forged=frames.map(f=>({...f}));forged[1].hex='00'+forged[1].hex.slice(2);await assert.rejects(observedSalaryBootstrap(forged,0),e=>e.code==='CONTRACT_INVALID');
});
