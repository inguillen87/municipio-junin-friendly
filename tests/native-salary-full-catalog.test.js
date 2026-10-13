import test from 'node:test';
import assert from 'node:assert/strict';
import { SALARY_MAX_INPUT_BYTES,salaryItems,salarySerialized,salaryRowKey,salaryCommand,salaryJsonbBytes } from '../assets/native-salary-catalog-model.js';
import { salaryFileExport, salaryFilePlan } from '../assets/native-salary-file-model.js';
import { fullSalaryCatalogFixture } from './fixtures/native-salary-full-catalog-synthetic.js';

test('complete 3,204-definition master keeps overlapping concept/auxiliary codes and every scale', () => {
  const { items } = fullSalaryCatalogFixture(), unchanged = salarySerialized(items);
  const complete = salaryItems(items);
  assert.equal(complete.length, 3204);
  assert.equal(complete.filter(r => r.kind === 'concept').length, 2033);
  assert.equal(complete.filter(r => r.kind === 'auxiliary').length, 547);
  assert.equal(complete.filter(r => r.kind === 'scale').length, 624);
  assert.equal(complete.filter(r => r.code === '1').length, 2);
  assert.equal(salarySerialized(items), unchanged);
});

test('long valid dependency history avoids call-stack overflow and still detects the whole cycle',()=>{
 const {items}=fullSalaryCatalogFixture(),root=items[0];
 const chain=Array.from({length:6000},(_,n)=>({...root,code:String(100000+n),dependencies:[]}));
 for(let n=0;n<chain.length-1;n++)chain[n].dependencies=[salaryRowKey(chain[n+1])];
 assert.equal(salaryItems(chain).length,6000);
 chain.at(-1).dependencies=[salaryRowKey(chain[0])];
 assert.throws(()=>salaryItems(chain),/ciclo/);
});

test('byte limits reject the whole UTF8 master and request before a new pending attempt exists',()=>{
 const {items}=fullSalaryCatalogFixture();
 const large=Array.from({length:10000},(_,n)=>({...items[0],code:String(n+1),label:'é'.repeat(160),ruleReference:'é'.repeat(180)}));
 assert.ok(salaryJsonbBytes(large)>SALARY_MAX_INPUT_BYTES);
 assert.throws(()=>salaryItems(large),/4 MiB/);
 const command={command:'propose',scopeVersion:'a'.repeat(64),baseVersion:'b'.repeat(64),classificationVersion:'c'.repeat(64),proposalId:null,proposalSha256:null,items:large,reason:'Intento exclusivamente ficticio para el límite de bytes',reviewConfirmed:false};
 assert.throws(()=>salaryCommand(command),/solicitud completa supera 4 MiB/);
 assert.equal(command.items.length,10000);
});

test('full CSV review preserves 75 antecedents and all 3,204 new definitions despite a display filter', () => {
  const { items, history, classification } = fullSalaryCatalogFixture();
  const original = structuredClone(history), complete = [...history, ...items];
  assert.equal(items.filter(r => r.kind === 'concept' && r.code === '1').length, 1);
  const csv = salaryFileExport(complete), review = salaryFilePlan(history, csv, classification);
  assert.equal(review.total, 3279);
  assert.equal(review.newCount, 3204);
  assert.equal(review.changedCount, 0);
  assert.equal(review.changes.length, 3204);
  assert.equal(review.unchangedCount, 75);
  assert.deepEqual(review.items, salaryItems(complete));
  assert.equal(csv.trimEnd().split('\n').length, 3280);
  assert.deepEqual(history, original);
  assert.equal(review.items.find(r => r.kind === 'concept' && r.code === '1').value, null);
  assert.equal(review.items.find(r => r.kind === 'concept' && r.code === '2').value, '0.000');
  assert.equal(review.items.find(r => r.kind === 'concept' && r.code === '3').value, '-12.345');
});
