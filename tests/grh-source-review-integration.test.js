import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {localGrhReviewBytes,backupReviewMessage} from '../assets/grh-backup-review.js';
import {backupReviewFixture} from './fixtures/grh-backup-review-synthetic.js';
import {coreReviewFixture} from './fixtures/grh-core-review-synthetic.js';
import {successorFixture,curatedFixture} from './fixtures/grh-successor-panel-synthetic.js';
const encode=value=>new TextEncoder().encode(JSON.stringify(value));
for(const [label,fixture]of [['seven-table',backupReviewFixture],['core comparison',coreReviewFixture],['successor',successorFixture]])test('existing local form dispatches '+label+' without schema substitution',()=>{
 const value=fixture(),parsed=localGrhReviewBytes(encode(value));assert.equal(parsed.version,value.version);
});
test('the integrated reader enforces the same byte ceiling and does not accept raw or nominal documents',()=>{
 const base=encode(successorFixture()),ceiling=new Uint8Array(256*1024);ceiling.fill(32);ceiling.set(base);assert.equal(localGrhReviewBytes(ceiling).version,'grh-successor-comparison.v1');
 for(const value of [new Uint8Array(256*1024+1),new Uint8Array([255]),new TextEncoder().encode('SELECT PRIVATE_SOURCE'),encode({...successorFixture(),personalRecords:[{name:'PRIVATE_SOURCE'}]})]){
  assert.throws(()=>localGrhReviewBytes(value),e=>!backupReviewMessage(e).includes('PRIVATE_SOURCE'));
 }
});
test('unimplemented curated report presentation is rejected rather than mislabeled as a complete successor import',()=>{
 assert.throws(()=>localGrhReviewBytes(encode(curatedFixture())));
 const unknown=successorFixture();unknown.version='grh-successor-comparison.v9';assert.throws(()=>localGrhReviewBytes(encode(unknown)));
});
test('public build copies both required runtime modules and the UI has no independent network or write path',()=>{
 const build=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');
 for(const file of ['grh-successor-review-model.js','grh-successor-review-ui.js'])assert.ok(build.includes("'assets/"+file+"'"));
 const ui=fs.readFileSync(new URL('../assets/grh-successor-review-ui.js',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/\bfetch\s*\(|\bXMLHttpRequest\b|sendBeacon|localStorage|sessionStorage|indexedDB|innerHTML\s*=/);
 assert.match(ui,/textContent/);assert.match(ui,/replaceChildren/);
});
