import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertOwnReceiptRecoveryControls} from '../scripts/lib/own-receipt-recovery-browser.mjs';
import {selectNoeliaReceiptTypes} from '../scripts/lib/noelia-payroll-circuit-browser.mjs';
import {OWN_RUN_TYPES} from '../assets/own-payroll-run-workspace-model.js';

const types=Object.keys(OWN_RUN_TYPES),editable=['period',...types.map(type=>'type-'+type),'scope','departmentFrom','departmentTo','date','legend','all','consult','reason','confirm','contracts','prepare'];
function controlFixture(locked,{flip=null,typeCount=types.length,badType=null,badCode=null}={}){
 const visited=[],fieldsetProbes=[];
 const p=key=>{
  if(key==='fields')return {evaluate:async read=>read({tagName:'FIELDSET',disabled:locked}),getAttribute:async name=>name==='disabled'&&locked?'':null};
  if(key==='types')return {evaluate:async read=>read({tagName:'FIELDSET',disabled:false}),locator:selector=>{assert.equal(selector,'input[data-receipt-type]');return {count:async()=>typeCount};},isDisabled:async()=>{fieldsetProbes.push(key);return false;}};
  assert.ok(editable.includes(key),'unexpected recovery control '+key);
  const type=key.startsWith('type-')?key.slice(5):null;
  return {getAttribute:async name=>name==='type'?(type===badType?'text':'checkbox'):name==='data-receipt-type'?(type===badCode?'wrong-code':type):null,isDisabled:async()=>{visited.push(key);return key===flip?!locked:locked;}};
 };return {p,visited,fieldsetProbes};
}
function selectionFixture(){
 const selected=new Map(types.map(type=>[type,type!=='monthly'])),calls=[],state={open:false};
 const page={locator:selector=>{
  if(selector==='[data-receipt-types]')return {waitFor:async options=>{assert.deepEqual(options,{state:'visible'});calls.push('types-visible');}};
  if(selector==='[data-receipt-typeDetails]')return {evaluate:async read=>read(state),locator:part=>{assert.equal(part,'summary');return {click:async()=>{state.open=true;calls.push('open-types');}};}};
  const match=/^\[data-receipt-type-([a-z_]+)\]$/.exec(selector);assert.ok(match&&types.includes(match[1]),'only a canonical receipt checkbox may be edited');
  return {setChecked:async checked=>{assert.equal(typeof checked,'boolean');selected.set(match[1],checked);calls.push([match[1],checked]);}};
 }};return {page,selected,calls,state};
}

test('causal: locked receipt fieldsets verify all seven effective checkbox locks without probing FIELDSET isDisabled',async()=>{
 const fixture=controlFixture(true);await assertOwnReceiptRecoveryControls(fixture.p,true);
 assert.deepEqual(fixture.fieldsetProbes,[]);assert.deepEqual(fixture.visited,editable);
});

test('explicit correction verifies every checkbox and other editable control is unlocked',async()=>{
 const fixture=controlFixture(false);await assertOwnReceiptRecoveryControls(fixture.p,false);
 assert.deepEqual(fixture.fieldsetProbes,[]);assert.deepEqual(fixture.visited,editable);
});

test('each effective checkbox and existing business control remains independently enforced',async()=>{
 for(const locked of [true,false])for(const key of editable){
  const fixture=controlFixture(locked,{flip:key});
  await assert.rejects(()=>assertOwnReceiptRecoveryControls(fixture.p,locked),error=>error.message.includes('receipt effective control lock: '+key));
 }
});

test('a missing or additional checkbox cannot silently shrink the verified type set',async()=>{
 for(const typeCount of [types.length-1,types.length+1]){
  const fixture=controlFixture(true,{typeCount});await assert.rejects(()=>assertOwnReceiptRecoveryControls(fixture.p,true),/receipt type checkbox count/);
 }
});

test('the receipt type controls must remain real checkboxes with their exact canonical codes',async()=>{
 await assert.rejects(()=>assertOwnReceiptRecoveryControls(controlFixture(true,{badType:'sac'}).p,true),/receipt type checkbox kind: sac/);
 await assert.rejects(()=>assertOwnReceiptRecoveryControls(controlFixture(true,{badCode:'vacation'}).p,true),/receipt type checkbox code: vacation/);
});

test('the actual shared selection helper opens disclosure and replaces the exact monthly or nonmonthly subset',async()=>{
 const fixture=selectionFixture();await selectNoeliaReceiptTypes(fixture.page,['monthly']);
 assert.equal(fixture.state.open,true);assert.deepEqual([...fixture.selected].filter(([,checked])=>checked).map(([type])=>type),['monthly']);
 assert.equal(fixture.calls.filter(call=>call==='open-types').length,1);assert.equal(fixture.calls.filter(Array.isArray).length,types.length);
 await selectNoeliaReceiptTypes(fixture.page,['sac','vacation']);assert.deepEqual([...fixture.selected].filter(([,checked])=>checked).map(([type])=>type),['sac','vacation']);
 assert.equal(fixture.calls.filter(call=>call==='open-types').length,1);assert.equal(fixture.calls.filter(Array.isArray).length,types.length*2);
});

test('invalid type requests fail before any disclosure or checkbox mutation',async()=>{
 for(const invalid of [[],['monthly','monthly'],['monthly','unknown']]){
  const fixture=selectionFixture(),before=[...fixture.selected];await assert.rejects(()=>selectNoeliaReceiptTypes(fixture.page,invalid),/QA_RECEIPT_TYPES_INVALID/);
  assert.deepEqual([...fixture.selected],before);assert.deepEqual(fixture.calls,[]);assert.equal(fixture.state.open,false);
 }
});

test('recovery host uses the real checkbox helper and retains the original two-command recovery contract',()=>{
 const source=fs.readFileSync(new URL('../scripts/lib/own-receipt-recovery-browser.mjs',import.meta.url),'utf8');
 assert.match(source,/import \{selectNoeliaReceiptTypes\} from '\.\/noelia-payroll-circuit-browser\.mjs'/);
 assert.match(source,/await selectNoeliaReceiptTypes\(page,declared\.types\)/);assert.doesNotMatch(source,/p\('types'\)\.selectOption/);
 for(const original of ["assert.equal(commands.length,1)","assert.equal(original.status,409)","assert.equal(original.response.code,'OWN_RECEIPT_STATE_CHANGED')","assert.deepEqual({...original.submitted,sourceVersion:original.original.sourceVersion},original.original)","assert.deepEqual(original.original.params,declared)","assert.equal(absence.status,404)","assert.equal(commands.length,2)","assert.notEqual(next.key,original.key)","assert.deepEqual(next.original,original.original)","assert.deepEqual(next.submitted,next.original)","assert.deepEqual(commands[0],original)","assert.equal(await eventCount(),initialEvents+1)"])assert.ok(source.includes(original),original);
});
