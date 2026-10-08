// Only relocates into the freshly allocated synthetic QA schema.
import assert from 'node:assert/strict';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';

export function relocateActiveAdoption(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const n=qa.normalized,readySource=batch.afterDefinitions.at(-1);
 const ready=n(readySource.slice(0,readySource.indexOf(' BEGIN ')))+' BEGIN '+batch.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const prior=batch.final;
 const before=n(prior.sourcePrerequisite.check)+';'+n(pinsCheck([...prior.afterPins.slice(0,-1),...prior.newPins],'ACTIVE_ADOPTION_BEFORE_METADATA'))+';'+pinsCheck([previous.readyPin],'ACTIVE_ADOPTION_BEFORE_METADATA');
 const after=n(prior.sourcePrerequisite.check)+';'+n(pinsCheck([...batch.afterPins.slice(0,-1),...batch.newPins],'ACTIVE_ADOPTION_AFTER_METADATA'))+';'+pinsCheck([readyPin],'ACTIVE_ADOPTION_AFTER_METADATA');
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_active_adoption.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const definitions=[...batch.newDefinitions.map(n),...batch.afterDefinitions.slice(0,-1).map(d=>n(d.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_active_adoption.mode')='first' THEN ${[...definitions,...batch.migration.slice(-2).map(n)].map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,readyPin,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
