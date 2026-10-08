// All records and actors are invented. Relocation targets one fresh QA schema.
import assert from 'node:assert/strict';
import {buildNoeliaCircuitQa} from './noelia-payroll-circuit-qa.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';

export function buildInactiveJurisdictionQa(major){
 const qa=buildNoeliaCircuitQa(major,{jurisdictions:true});
 const anchor='CREATE TRIGGER grh_effective_baseline_rows';
 assert.equal(qa.sql.split(anchor).length,2);
 const seed=`
 UPDATE employment_contract SET status='inactive',start_date='2000-01-01',end_date='2020-01-01',jurisdiction_code=NULL WHERE id=${q(qa.ids.targetContract)}::uuid;
 FOR fixture_n IN 1..54 LOOP
  INSERT INTO person_identity SELECT (jsonb_populate_record(NULL::person_identity,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'full_name','Antecedente exclusivamente sintético QA '||fixture_n,'dni',(99110000+fixture_n)::text,'cuil','20'||(99110000+fixture_n)::text||'0'))).* FROM person_identity p WHERE id=${q(qa.ids.targetPerson)}::uuid RETURNING id INTO fixture_person;
  INSERT INTO employment_contract SELECT (jsonb_populate_record(NULL::employment_contract,to_jsonb(c)||jsonb_build_object('id',gen_random_uuid(),'person_id',fixture_person,'legacy_legajo','H/QA-'||fixture_n))).* FROM employment_contract c WHERE id=${q(qa.ids.targetContract)}::uuid;
 END LOOP;
 `;
 qa.sql=qa.sql.replace('DECLARE ',()=> 'DECLARE fixture_n integer;fixture_person uuid;').replace(anchor,()=>seed+'\n'+anchor);
 return qa;
}

export function relocateInactiveJurisdictionInstallation(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const n=qa.normalized;
 const readySource=batch.afterDefinitions.at(-1);
 const ready=n(readySource.slice(0,readySource.indexOf(' BEGIN ')))+' BEGIN '+batch.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=n(pinsCheck(batch.beforePins.slice(0,5),'INACTIVE_JURISDICTION_BEFORE_METADATA'))+';'+pinsCheck([previous.readyPin],'INACTIVE_JURISDICTION_BEFORE_METADATA');
 const after=n(pinsCheck(batch.afterPins.slice(0,5),'INACTIVE_JURISDICTION_AFTER_METADATA'))+';'+pinsCheck([readyPin],'INACTIVE_JURISDICTION_AFTER_METADATA');
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_inactive_jurisdiction.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const definitions=[...batch.afterDefinitions.slice(0,5).map(n),ready];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_inactive_jurisdiction.mode')='first' THEN ${definitions.map(s=>'EXECUTE '+q(s.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))+';').join('\n')} END IF;END $apply$`;
 let state=n(batch.state).replaceAll(batch.beforePins.at(-1).sha256,previous.readyPin.sha256).replaceAll(batch.afterPins.at(-1).sha256,readyPin.sha256).replace("current_setting('search_path')<>'pg_catalog, public, pg_temp'",`current_setting('search_path')<>'pg_catalog, ${qa.schema}, public, pg_temp'`);
 state=state.replace("public.digest(p.prosrc,'sha256')",`public.digest(CASE WHEN p.proname='municipal_adoption_ready_v1' THEN p.prosrc ELSE replace(p.prosrc,${q(qa.schema+'.')},'public.') END,'sha256')`);
 return {...batch,readyPin,installation:batch.installation.map((s,i)=>i===0?state:i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
