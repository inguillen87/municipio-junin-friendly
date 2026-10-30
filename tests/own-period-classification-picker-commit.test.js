// Proposed unit regressions only; not executed in this source-only task.
// This exercises the actual exported QA barrier, not a browser simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitOwnPeriodClassificationPickerCommit} from '../scripts/lib/own-period-classification-browser.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture(){const dialog=deferred(),subject=deferred(),events=[],state={text:'No hay un legajo seleccionado.'};return{dialog,subject,events,state,picker:{waitFor:async options=>{assert.deepEqual(options,{state:'hidden'});events.push('wait-dialog');await dialog.promise;events.push('dialog-hidden');}},label:{filter:options=>{assert.deepEqual(options,{hasText:'Legajo 177888 · '});return{waitFor:async options=>{assert.deepEqual(options,{state:'visible'});events.push('wait-subject');await subject.promise;events.push('subject-visible');}};},innerText:async()=>state.text}};}
test('period editing cannot proceed after click or dialog close until onUse has published the exact selected legajo',async()=>{
 const f=fixture();let completed=false;const pending=awaitOwnPeriodClassificationPickerCommit({picker:f.picker,subject:f.label,employeeNumber:'177888'}).then(()=>{completed=true;});await Promise.resolve();assert.equal(completed,false);assert.deepEqual(f.events,['wait-dialog']);f.dialog.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,false);assert.deepEqual(f.events,['wait-dialog','dialog-hidden','wait-subject']);f.state.text='Legajo 177888 · Agente exclusivamente nativo de navegador QA177';f.subject.resolve();await pending;assert.equal(completed,true);assert.deepEqual(f.events,['wait-dialog','dialog-hidden','wait-subject','subject-visible']);
});
test('closing the dialog through cancellation or authority loss never substitutes for the expected commit',async()=>{
 const f=fixture(),original=Error('Synthetic native locator timeout after cancellation'),pending=awaitOwnPeriodClassificationPickerCommit({picker:f.picker,subject:f.label,employeeNumber:'177888'});f.dialog.resolve();await new Promise(resolve=>setImmediate(resolve));f.subject.reject(original);await assert.rejects(pending,error=>error===original);
});
test('a different displayed legajo is rejected even if an observer wrongly releases its expected-text wait',async()=>{
 const f=fixture(),pending=awaitOwnPeriodClassificationPickerCommit({picker:f.picker,subject:f.label,employeeNumber:'177888'});f.state.text='Legajo 177889 · Otro agente sintético';f.dialog.resolve();f.subject.resolve();await assert.rejects(pending,/CLASSIFICATION_PICKER_COMMIT_REQUIRED/);
});
