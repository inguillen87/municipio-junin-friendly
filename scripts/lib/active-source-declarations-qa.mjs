import assert from 'node:assert/strict';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
export function declaredSourceFixture(qa){
 let s=qa.sourceFixture;const ordinal="CASE WHEN c.legacy_legajo~'^H/QA-[0-9]+$' THEN substring(c.legacy_legajo from 6)::integer END",gap=n=>`coalesce((${ordinal})<=${n},false)`;
 for(const[a,b]of [["'fecha_ingreso','2001-02-03'",`'fecha_ingreso',CASE WHEN ${gap(14)} THEN NULL ELSE '2001-02-03' END`],["'convenio_code','1','categoria_code','1'",`'convenio_code',CASE WHEN ${gap(2)} THEN NULL ELSE '1' END,'categoria_code',CASE WHEN ${gap(2)} THEN NULL ELSE '1' END`],["'iddepartamento',CASE WHEN",`'iddepartamento',CASE WHEN ${gap(1)} THEN NULL WHEN`],["'sourceReferences',CASE WHEN",`'sourceReferences',CASE WHEN ${gap(1)} THEN '{}'::jsonb WHEN`]]){assert.equal(s.split(a).length,2,a);s=s.replace(a,()=>b);}return s;
}
export function relocateActiveSourceDeclarations(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const n=qa.normalized;
 const replace=s=>batch.beforePins.slice(0,-1).reduce((v,p,i)=>v.replaceAll(p.sha256,batch.afterPins[i].sha256),s);
 const original=batch.afterDefinitions.at(-1),ready=n(original.slice(0,original.indexOf(' BEGIN ')))+' BEGIN '+[...batch.current.readyChecks.map(replace),pinsCheck(batch.newPins,'DECLARATIONS_NEW_METADATA')].map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=previous.verification[1],after=replace(before).replaceAll(previous.readyPin.sha256,readyPin.sha256)+';'+n(pinsCheck(batch.newPins,'DECLARATIONS_NEW_METADATA'));
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_source_declarations.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const defs=[...batch.newDefinitions.map(n),...batch.afterDefinitions.slice(0,-1).map(d=>n(d.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),...batch.migration.slice(-2).map(n)];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_source_declarations.mode')='first' THEN ${defs.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return{...batch,readyPin,readyDefinition:ready,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
