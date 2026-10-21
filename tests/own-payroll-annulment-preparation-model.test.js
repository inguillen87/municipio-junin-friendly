import test from 'node:test';
import assert from 'node:assert/strict';
import {ownAnnulPreparationDto,verifiedOwnAnnulPreparation,ownAnnulPreparationDates,ownAnnulPreparationForDate,assertSameOwnAnnulPreparation} from '../assets/own-payroll-annulment-preparation-model.js';
import {syntheticAnnulPreparation,preparationExpected,sealPreparation,prepHash,prepUuid} from './fixtures/own-payroll-annulment-preparation-synthetic.js';
const error=code=>value=>value.code==='OWN_ANNUL_PREPARATION_'+code;
const verify=value=>verifiedOwnAnnulPreparation(value,preparationExpected(value));

for(const receiptVersion of ['own-annul-receipt.v1','own-annul-receipt.v2'])test('projected preparation preserves explicit source protocol '+receiptVersion,async()=>{
 const value=syntheticAnnulPreparation({receiptVersion}),before=JSON.stringify(value),checked=await verify(value);
 assert.equal(checked.source.receiptVersion,receiptVersion);assert.equal(checked.affected.length,6);assert.equal(checked.runs.length,3);
 assert.ok(checked.runs.every(run=>run.creatorScopeVersion!==checked.scopeVersion));assert.equal(new Set(checked.runs.map(run=>run.creatorScopeVersion)).size,3);
 assert.equal(JSON.stringify(value),before);assert.equal(Object.isFrozen(value),false);assert.ok(Object.isFrozen(checked)&&Object.isFrozen(checked.affected[5]));
 assert.equal(assertSameOwnAnnulPreparation(checked,await verify(structuredClone(value))).preparationSha256,checked.preparationSha256);
});

test('all dates verify before choosing a group, preserving null and an unchecked new consent',async()=>{
 const checked=await verify(syntheticAnnulPreparation());assert.deepEqual(ownAnnulPreparationDates(checked),[{liquidationDate:null,count:2},{liquidationDate:'2026-10-15',count:2},{liquidationDate:'2026-10-20',count:2}]);
 for(const date of [null,'2026-10-15','2026-10-20']){const prepared=ownAnnulPreparationForDate(checked,date),expected=checked.affected.filter(row=>row.liquidationDate===date);assert.equal(prepared.liquidationDate,date);assert.deepEqual(prepared.selection,{kind:'contracts',values:expected.map(row=>row.contractId)});assert.deepEqual(prepared.affected,expected);assert.equal(prepared.reviewConfirmed,false);assert.equal(prepared.sourceReference.receiptSha256,checked.source.receiptSha256);assert.equal(prepared.sourceReference.sourceStateSha256,checked.sourceStateSha256);}
 assert.throws(()=>ownAnnulPreparationForDate(checked,'2026-10-30'),error('DATE_REQUIRED'));
 assert.throws(()=>ownAnnulPreparationForDate(syntheticAnnulPreparation(),null),error('VERIFICATION_REQUIRED'));
});

test('current preparer scope and source reference are mandatory; historical creator is not borrowed',async()=>{
 const value=syntheticAnnulPreparation();await assert.rejects(()=>verifiedOwnAnnulPreparation(value,{scopeVersion:value.runs[0].creatorScopeVersion,sourceId:value.source.id}),error('SCOPE_CHANGED'));
 await assert.rejects(()=>verifiedOwnAnnulPreparation(value,{scopeVersion:value.scopeVersion,sourceId:prepUuid(901)}),error('SCOPE_CHANGED'));
 await assert.rejects(()=>verifiedOwnAnnulPreparation(value,{...preparationExpected(value),membershipVersion:1}),error('CONTRACT_INVALID'));
});

test('only source protocols1/2 and the purpose-limited custody policy are admitted',async()=>{
 for(const mutate of [value=>value.source.receiptVersion='own-annul-receipt.v3',value=>value.custodyPolicy='original_maker_only',value=>value.source.body={reason:'Private reviewer contents'},value=>value.source.key=prepUuid(999),value=>value.reason='Private reviewer reason']){const value=syntheticAnnulPreparation();mutate(value);sealPreparation(value);await assert.rejects(()=>verify(value),error('CONTRACT_INVALID'));}
});

test('last affected row in another date cannot bypass whole response validation',async()=>{
 for(const mutate of [value=>value.affected[5].resultSha256=prepHash('altered last result'),value=>value.affected[5].liquidationDate='2026-10-15',value=>value.affected[5].state='confirmed',value=>value.affected[5].version=0]){const value=syntheticAnnulPreparation();mutate(value);sealPreparation(value);await assert.rejects(()=>verify(value),error('AFFECTED_CHANGED'));}
});

test('one declared current confirmation in another date rejects the entire preparation',async()=>{
 const value=syntheticAnnulPreparation();value.confirmedAffectedContractIds=[value.affected[5].contractId];sealPreparation(value);await assert.rejects(()=>verify(value),error('CONFIRMED_AGAIN'));
});

test('runs must cover the exact affected set without duplicates, unused runs or missing sources',async()=>{
 const duplicated=syntheticAnnulPreparation();duplicated.affected[5].contractId=duplicated.affected[0].contractId;sealPreparation(duplicated);await assert.rejects(()=>verify(duplicated),error('AFFECTED_CHANGED'));
 const missing=syntheticAnnulPreparation();missing.runs.pop();sealPreparation(missing);await assert.rejects(()=>verify(missing),error('AFFECTED_CHANGED'));
 const unused=syntheticAnnulPreparation();unused.affected=unused.affected.slice(0,4);unused.dateGroups.pop();sealPreparation(unused);await assert.rejects(()=>verify(unused),error('INCOMPLETE'));
});

test('date census, completeness and dense ordering cannot silently drop or regroup employees',async()=>{
 const count=syntheticAnnulPreparation();count.dateGroups[2].count=1;sealPreparation(count);await assert.rejects(()=>verify(count),error('DATE_GROUPS_CHANGED'));
 const reorder=syntheticAnnulPreparation();reorder.dateGroups.reverse();sealPreparation(reorder);await assert.rejects(()=>verify(reorder),error('DATE_GROUPS_CHANGED'));
 const incomplete=syntheticAnnulPreparation();incomplete.complete=false;sealPreparation(incomplete);await assert.rejects(()=>verify(incomplete),error('CONTRACT_INVALID'));
 const sparse=syntheticAnnulPreparation();delete sparse.affected[5];await assert.rejects(()=>verify(sparse),error('CONTRACT_INVALID'));
 const uncounted=syntheticAnnulPreparation();uncounted.affected.pop();sealPreparation(uncounted);await assert.rejects(()=>verify(uncounted),error('DATE_GROUPS_CHANGED'));
});

test('the response checksum catches content changes and freezes the copy before the await',async()=>{
 const value=syntheticAnnulPreparation();value.affected[5].employeeNumber='79999';await assert.rejects(()=>verify(value),error('CONTENT_CHANGED'));
 const original=syntheticAnnulPreparation(),expected=preparationExpected(original),pending=verifiedOwnAnnulPreparation(original,expected);original.affected[5].employeeNumber='79999';expected.scopeVersion=prepHash('changed caller expectation');const checked=await pending;assert.equal(checked.affected[5].employeeNumber,'70005');assert.equal(assertSameOwnAnnulPreparation(checked,await verify(syntheticAnnulPreparation())).preparationSha256,checked.preparationSha256);
});

test('a resealable client digest alone cannot authenticate server omissions; fresh equality detects the changed handoff',async()=>{
 const original=await verify(syntheticAnnulPreparation()),altered=structuredClone(original);altered.affected.pop();altered.dateGroups[2].count=1;sealPreparation(altered);
 // Structurally consistent/resealed input can pass client validation. The
 // native reader must discover omissions from the authoritative event/census.
 const resealed=await verify(altered);assert.equal(resealed.affected.length,5);assert.throws(()=>assertSameOwnAnnulPreparation(original,resealed),error('CHANGED'));
});

test('source protocol, stored receipt, census and current scope changes invalidate an earlier verified handoff',async()=>{
 const original=await verify(syntheticAnnulPreparation());
 for(const mutate of [value=>value.source.receiptVersion='own-annul-receipt.v1',value=>value.source.receiptSha256=prepHash('changed stored receipt'),value=>value.sourceStateSha256=prepHash('changed complete global census'),value=>value.runs[2].creatorScopeVersion=prepHash('changed historical provenance'),value=>value.scopeVersion=prepHash('another current membership')]){const value=structuredClone(original);mutate(value);sealPreparation(value);const changed=await verify(value);assert.throws(()=>assertSameOwnAnnulPreparation(original,changed),error('CHANGED'));}
});

test('the declared response limits stay1000runs and10000affected without slicing',()=>{
 const tooManyRuns=syntheticAnnulPreparation();tooManyRuns.runs=Array.from({length:1001},()=>tooManyRuns.runs[0]);assert.throws(()=>ownAnnulPreparationDto(tooManyRuns),error('CONTRACT_INVALID'));
 const tooManyAffected=syntheticAnnulPreparation();tooManyAffected.affected=Array.from({length:10001},()=>tooManyAffected.affected[0]);assert.throws(()=>ownAnnulPreparationDto(tooManyAffected),error('CONTRACT_INVALID'));
});


test('opaque own employee numbers retain the engine contract without numeric renumbering',async()=>{
 for(const employeeNumber of ['A-001','1234567890','\u{1f600}'.repeat(64)]){
  const value=syntheticAnnulPreparation();value.affected[5].employeeNumber=employeeNumber;sealPreparation(value);
  const checked=await verify(value);assert.equal(checked.affected[5].employeeNumber,employeeNumber);
  assert.equal(ownAnnulPreparationForDate(checked,'2026-10-20').affected[1].employeeNumber,employeeNumber);
 }
});

test('opaque own employee numbers still reject empty, excessive, control and non-string values',async()=>{
 for(const employeeNumber of ['', 'A'.repeat(65), 'A\u0000', 'A\u0085', null]){
  const value=syntheticAnnulPreparation();value.affected[5].employeeNumber=employeeNumber;sealPreparation(value);
  await assert.rejects(()=>verify(value),error('AFFECTED_CHANGED'));
 }
});
