import assert from 'node:assert/strict';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
// Rebuild only schema-qualified metadata checks; application bodies and business
// guards remain the reviewed composition. No municipal destination is admitted.
export function relocateOwnRunDateInstallation(batch,qa,beforeReady,previous){
 const n=qa.normalized;
 let ready=beforeReady;
 assert.ok(ready.includes(batch.beforePins[0].sha256));ready=ready.replaceAll(batch.beforePins[0].sha256,batch.afterPins[0].sha256);
 ready=ready.replace(' BEGIN ',()=> ' BEGIN EXECUTE '+q(n(pinsCheck([batch.afterPins[1],batch.newPin],'RUN_DATE_PROTOCOL_CHANGED')))+'; ');
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins[2].signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=n(pinsCheck([batch.beforePins[0],batch.beforePins[1],batch.bootstrapPin],'RUN_DATE_BEFORE_CHANGED'))+';'+pinsCheck([previous.readyPin],'RUN_DATE_BEFORE_CHANGED');
 const after=n(pinsCheck([batch.afterPins[0],batch.afterPins[1],batch.newPin,batch.bootstrapPin],'RUN_DATE_AFTER_CHANGED'))+';'+pinsCheck([readyPin],'RUN_DATE_AFTER_CHANGED');
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_run_date.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const migration=batch.migration.map((s,i)=>i===batch.migration.length-1?ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '):n(s));
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_run_date.mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,readyPin,readyDefinition:ready,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),durableVerification:batch.durableVerification.map((s,i)=>i===0?after:n(s))};
}
