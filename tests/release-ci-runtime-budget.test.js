// Pure filesystem/source custody only. Does not import an application, SQL or a provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CI_RUNTIME_BUDGET_SOURCE_PINS as pins,projectCiRuntimeBudgetSourceToParent as parent} from './fixtures/release-candidate-ci-runtime-budget.js';
import {RELEASE_CANDIDATE_SOURCE_PINS as releasePins,projectReleaseCandidateWorkflowToParent} from './fixtures/release-candidate-workflow-succession.js';
import {RELEASE_CONTRACT} from '../scripts/release-qualification-contract.mjs';
import {CANDIDATE_WORKFLOW_SHA256} from '../scripts/lib/release-candidate-admission.mjs';
import {projectNoeliaFiscalWorkflowToBudgetEpoch} from './fixtures/noelia-fiscal-workflow-source-projection.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
import {projectZeroDifferenceAllRawSourceToParent} from './fixtures/zero-difference-source-projection.js';
const read=file=>projectZeroDifferenceAllRawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url)));
const capacity='.github/workflows/own-payroll-full-capacity.yml';
for(const [file,pin]of Object.entries(pins))test('finite CI budget custody reconstructs the whole exact parent: '+file,()=>{
 const current=projectNoeliaFiscalWorkflowToBudgetEpoch(file,read(file)),prior=parent(file,current);assert.equal(current.length,pin.afterBytes);assert.equal(hash(current),pin.afterSha256);assert.equal(prior.length,pin.beforeBytes);assert.equal(hash(prior),pin.beforeSha256);
 assert.throws(()=>parent(file,prior));assert.throws(()=>parent(file,Buffer.concat([current,Buffer.from('\n')])));
 const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>parent(file,changed));
 for(const op of pin.inverse){const changed=Buffer.from(current);changed[op.offset]^=1;assert.throws(()=>parent(file,changed));}
 if(file.endsWith('.yml')){
  const source=current.toString('utf8'),old=prior.toString('utf8');assert.equal((source.match(/^    timeout-minutes: 180$/gm)||[]).length,1);assert.equal((old.match(/^    timeout-minutes: 45$/gm)||[]).length,1);
  let reconstructed=source.replace('    timeout-minutes: 180\n','    timeout-minutes: 45\n');
  if(file===capacity){assert.ok(source.includes('--health-interval 4h'));assert.ok(4*60>180);reconstructed=reconstructed.replace('--health-interval 4h','--health-interval 1h');assert.equal(pin.inverse.length,2);}else assert.equal(pin.inverse.length,1);
  assert.equal(reconstructed,old,'all commands, matrices, checkout, steps, artifacts, startup health and gates remain byte-identical');
  assert.throws(()=>parent(file,Buffer.from(source.replace('timeout-minutes: 180','timeout-minutes: 181'))));
 }
});
test('capacity keeps every older inverse before the exact finite budget successor',()=>{
 const pin=releasePins[capacity],raw=read(capacity),prior=projectReleaseCandidateWorkflowToParent(capacity,raw);assert.equal(hash(raw),pin.after);assert.equal(raw.length,pin.afterBytes);assert.equal(hash(prior),pin.before);assert.equal(prior.length,pin.beforeBytes);assert.equal(pin.inverse.length,9);
 assert.deepEqual(pin.inverse.slice(-2),pins[capacity].inverse.map(({multiplicity,...op})=>op));
 assert.throws(()=>projectReleaseCandidateWorkflowToParent(capacity,parent(capacity,raw)));
 const changed=Buffer.from(raw.toString('utf8').replace('--health-start-interval 1s','--health-start-interval 2s'));assert.throws(()=>projectReleaseCandidateWorkflowToParent(capacity,changed));
});
test('both independent admission contracts pin the whole new workflow bytes',()=>{
 for(const policy of RELEASE_CONTRACT.workflows)assert.equal(hash(read(policy.path)),policy.sha256);
 for(const [file,pin]of Object.entries(CANDIDATE_WORKFLOW_SHA256))assert.equal(hash(read(file)),pin);
 const unknown=Buffer.from('unrelated');assert.strictEqual(parent('tests/unrelated.test.js',unknown),unknown);
});

function assertRuntimeBudgetTriggerCoverage(source,files){
 for(const event of ['push','pull_request']){
  const marker='  '+event+':\n',start=source.indexOf(marker);assert.ok(start>=0,event+' trigger required');
  const tail=source.slice(start+marker.length),end=tail.search(/^(?:[^ \n]|  [a-z_]+:)/m),section=end<0?tail:tail.slice(0,end);
  const match=/^    paths: \[([^\n]+)\]$/m.exec(section);assert.ok(match,event+' path filter required');
  const patterns=[...match[1].matchAll(/'([^']+)'/g)].map(value=>value[1]);
  for(const file of files)assert.ok(patterns.some(pattern=>path.matchesGlob(file,pattern)),'CI_RUNTIME_BUDGET_TRIGGER_MISSING:'+event+':'+file);
 }
}
test('future custody-only edits match every required workflow existing path filter',()=>{
 const files=['tests/fixtures/release-candidate-ci-runtime-budget.js','tests/release-ci-runtime-budget.test.js'];
 for(const file of [...Object.keys(pins).filter(file=>file.endsWith('.yml')),'.github/workflows/own-payroll-calculation.yml'])assertRuntimeBudgetTriggerCoverage(read(file).toString('utf8'),files);
 const receipts=read('.github/workflows/own-payroll-receipts.yml').toString('utf8');
 assert.throws(()=>assertRuntimeBudgetTriggerCoverage(receipts,['tests/fixtures/ci-runtime-budget-source-succession.js']));
 assert.throws(()=>assertRuntimeBudgetTriggerCoverage(receipts,['tests/ci-runtime-budget-source.test.js']));
});

test('fiscal successor projects only the historical budget loop and retains the actual current release pin',()=>{
 const file='.github/workflows/noelia-payroll-circuit.yml',raw=read(file),prior=projectNoeliaFiscalWorkflowToBudgetEpoch(file,raw);
 assert.equal(hash(raw),RELEASE_CONTRACT.workflows.find(value=>value.path===file).sha256);assert.equal(hash(prior),pins[file].afterSha256);assert.equal(prior.length,pins[file].afterBytes);
 assert.ok(raw.toString('utf8').includes(' --fiscal=true'));assert.ok(!prior.toString('utf8').includes(' --fiscal=true'));
 assert.throws(()=>projectNoeliaFiscalWorkflowToBudgetEpoch(file,prior));assert.throws(()=>projectNoeliaFiscalWorkflowToBudgetEpoch(file,Buffer.concat([raw,Buffer.from('\n')])));
 const changed=Buffer.from(raw);changed[0]^=1;assert.throws(()=>projectNoeliaFiscalWorkflowToBudgetEpoch(file,changed));
 const unknown=Buffer.from('unrelated');assert.strictEqual(projectNoeliaFiscalWorkflowToBudgetEpoch('tests/unrelated.test.js',unknown),unknown);
});
