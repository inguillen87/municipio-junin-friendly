import assert from 'node:assert/strict';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function relocateRegistryOriginalFacts(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const n=qa.normalized;
 const replace=s=>batch.beforePins.slice(0,-1).reduce((v,p,i)=>v.replaceAll(p.sha256,batch.afterPins[i].sha256),s);
 assert.ok(previous.readyDefinition);const ready=replace(previous.readyDefinition).replace(' BEGIN ',()=> ' BEGIN EXECUTE '+q(n(pinsCheck(batch.newPins,'REGISTRY_NEW_METADATA')))+';');
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=previous.verification[1],after=replace(before).replaceAll(previous.readyPin.sha256,readyPin.sha256)+';'+n(pinsCheck(batch.newPins,'REGISTRY_NEW_METADATA'));
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_registry_original.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const defs=[...batch.newDefinitions.map(n),...batch.afterDefinitions.slice(0,-1).map(d=>n(d.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),...batch.migration.slice(-2).map(n)];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_registry_original.mode')='first' THEN ${defs.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return{...batch,readyPin,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
