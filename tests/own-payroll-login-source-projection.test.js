// RAW custody regression only; no SQL, browser, constructors or providers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {OWN_PAYROLL_LOGIN_SOURCE_PINS,OWN_PAYROLL_LOGIN_READER_SOURCE_PINS,projectOwnPayrollLoginRawSourceToParent} from './fixtures/own-payroll-login-source-projection.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const raw=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
for(const [file,pin]of Object.entries({...OWN_PAYROLL_LOGIN_SOURCE_PINS,...OWN_PAYROLL_LOGIN_READER_SOURCE_PINS}))test('login RAW custody restores the complete reviewed parent and rejects drift: '+file,()=>{
 const current=raw(file),saved=Buffer.from(current),parent=projectOwnPayrollLoginRawSourceToParent(file,current);
 assert.deepEqual(current,saved,'projection never mutates source bytes');
 assert.equal(parent.length,pin.beforeBytes);assert.equal(hash(parent),pin.beforeSha256);
 const changed=Buffer.from(current);changed[0]^=1;
 assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(file,changed),/OWN_LOGIN_CURRENT_SHA/);
 assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(file,Buffer.concat([current,Buffer.from('\n')])) ,/OWN_LOGIN_CURRENT_BYTES/);
 assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(file,parent),/OWN_LOGIN_CURRENT_/);
 if(file.startsWith('assets/')){
  assert.match(current.toString('utf8'),/\/acceso\?next=/);assert.doesNotMatch(current.toString('utf8'),/returnTo=/);
  assert.match(parent.toString('utf8'),/returnTo=/);assert.doesNotMatch(parent.toString('utf8'),/\/acceso\?next=/);
 }else{
  assert.match(current.toString('utf8'),/import \{projectOwnPayrollLoginRawSourceToParent\}/);
  assert.doesNotMatch(parent.toString('utf8'),/projectOwnPayrollLoginRawSourceToParent/);
 }
});
test('only three assets and their three pinned historical readers have custody successors',()=>{
 assert.deepEqual(Object.keys(OWN_PAYROLL_LOGIN_SOURCE_PINS),['assets/own-payroll-close-panel.js','assets/own-payroll-liquidation-panel.js','assets/own-payroll-report-panel.js']);
 assert.equal(Object.keys(OWN_PAYROLL_LOGIN_READER_SOURCE_PINS).length,3);
 const unchanged=Buffer.from('unrelated complete RAW source');assert.strictEqual(projectOwnPayrollLoginRawSourceToParent('scripts/unrelated.mjs',unchanged),unchanged);assert.strictEqual(projectOwnPayrollLoginRawSourceToParent('constructor',unchanged),unchanged);
 assert.throws(()=>projectOwnPayrollLoginRawSourceToParent('assets/own-payroll-close-panel.js','source'),/OWN_LOGIN_RAW_SOURCE_REQUIRED/);
 assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(null,unchanged),/OWN_LOGIN_SOURCE_PATH_REQUIRED/);
 for(const pin of Object.values(OWN_PAYROLL_LOGIN_SOURCE_PINS))assert.ok(Object.isFrozen(pin)&&Object.isFrozen(pin.inverse)&&Object.isFrozen(pin.inverse[0]));
});
