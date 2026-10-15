// Pure composition of the reviewed programme with the COMPLETE SQL177 capture.
// No connection, migration execution, historical parser or municipal values.
import assert from 'node:assert/strict';
import {createHash}from'node:crypto';
import {splitPostgresStatements}from'./sql-statements.mjs';
import {ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import {buildOwnPeriodClassificationInstallation}from'./own-period-classification-installation.mjs';
const lf=v=>v.replace(/\r\n?/g,'\n');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'AGREEMENT_WORKING_TIME_SOURCE_ANCHOR: '+a.slice(0,90));return s.replace(a,()=>b);};
const get=(source,name)=>{const rows=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.equal(rows.length,1,name);return rows[0];};
export const AGREEMENT_CAPTURE177_SHA256='7f4d7f97d8cea62e9e552812357e32281c716b05262e6a049e4f8c9b7f69eff4';
export const AGREEMENT_READY177_SHA256='bc309d4a161841511e2812f04e2e30a37a66e27581f11f8e052fbe53427b01ad';
export function deriveAgreementWorkingTimeConsumers({read,sourceCommit}){
 const prior=buildOwnPeriodClassificationInstallation({read,sourceCommit});
 const source=lf(read('scripts/migrations/172-own-salary-conditions-program-source.sql'));
 assert.equal(createHash('sha256').update(source).digest('hex'),'74ae429927824d6b9e209f1776ec4f7537e95182f2fd14b4f40b5862d0a633df');
 const beforeDefinition=get(source,'own_program_definition_v1'),beforeCommand=get(source,'own_program_command_v1');
 const beforeCapture=prior.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1('));
 const beforeReady=prior.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.municipal_adoption_ready_v1('));
 assert.equal(ownInstallationFunctionPin(beforeCapture).sha256,AGREEMENT_CAPTURE177_SHA256,'AGREEMENT_WORKING_TIME_CAPTURE177_CHANGED');
 assert.equal(ownInstallationFunctionPin(beforeReady).sha256,AGREEMENT_READY177_SHA256,'AGREEMENT_WORKING_TIME_READY177_CHANGED');
 let definition=once(beforeDefinition,'DECLARE conditions boolean:=',"DECLARE agreement_working boolean:=coalesce(p->>'agreementWorkingTimeVersion'='own-agreement-working-time.v1',false);conditions boolean:=");
 definition=once(definition,"||CASE WHEN working THEN ARRAY['workingTimeVersion'] ELSE ARRAY[]::text[] END","||CASE WHEN working THEN ARRAY['workingTimeVersion'] ELSE ARRAY[]::text[] END||CASE WHEN agreement_working THEN ARRAY['agreementWorkingTimeVersion'] ELSE ARRAY[]::text[] END");
 definition=once(definition,' IF working AND NOT ns THEN'," IF agreement_working AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;\n IF working AND NOT ns THEN");
 const facts="'employment_fact','period_fact','working_time_fact','salary_condition_fact','classification_fact'";
 assert.equal(definition.split(facts).length-1,5);definition=definition.replaceAll(facts,"'employment_fact','period_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact'");
 definition=once(definition,"(b->>'sourceKind'<>'working_time_fact' OR working)","(b->>'sourceKind'<>'working_time_fact' OR working) AND(b->>'sourceKind'<>'agreement_time_fact' OR agreement_working)");
 definition=once(definition,"  IF b->>'sourceKind'='working_time_fact' AND","  IF b->>'sourceKind'='agreement_time_fact' AND(b->>'sourceField'<>'monthlyHours' OR b->>'unit'<>'hours' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;\n  IF b->>'sourceKind'='working_time_fact' AND");
 definition=once(definition,"IF working THEN normalized:=normalized||jsonb_build_object('workingTimeVersion','own-contract-working-time.v1');END IF;","IF working THEN normalized:=normalized||jsonb_build_object('workingTimeVersion','own-contract-working-time.v1');END IF;IF agreement_working THEN normalized:=normalized||jsonb_build_object('agreementWorkingTimeVersion','own-agreement-working-time.v1');END IF;");
 const command=once(beforeCommand,"  IF current_program#>>'{definition,workingTimeVersion}'","  IF current_program#>>'{definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' AND definition->>'agreementWorkingTimeVersion' IS DISTINCT FROM 'own-agreement-working-time.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;\n  IF current_program#>>'{definition,workingTimeVersion}'");
 let capture=once(beforeCapture,'working_facts jsonb;','working_facts jsonb;agreement_facts jsonb;');
 const populationSources="jsonb_build_object('employees',employees,'agreementWorkingTime',agreement_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,periodParticipation,version}'='own-period-participation.v1' THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END";
 const extra=` IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN
  agreement_facts:=public.own_agreement_working_time_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(${populationSources})));
  inventory:=inventory||jsonb_build_object('agreementWorkingTime',jsonb_build_object('version',agreement_facts->>'version','total',jsonb_array_length(agreement_facts->'records'),'complete',true));
 END IF;
`;
 capture=once(capture," payload_value:=jsonb_build_object('programState'",extra+" payload_value:=jsonb_build_object('programState'");
 const attach=" IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN payload_value:=payload_value||jsonb_build_object('agreementWorkingTime',agreement_facts);END IF;\n";
 capture=once(capture,' IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304',attach+' IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304');
 // Reverse ONLY our three additions. Equality proves every byte introduced by
 // SQL177 (eligibility, grouping, snapshots and jurisdiction guards) survives.
 let recovered=once(capture,'working_facts jsonb;agreement_facts jsonb;','working_facts jsonb;');
 recovered=once(recovered,extra,'');recovered=once(recovered,attach,'');assert.equal(recovered,beforeCapture,'AGREEMENT_WORKING_TIME_LOST_CAPTURE177');
 const originals=[beforeDefinition,beforeCommand,beforeCapture,beforeReady],changed=[definition,command,capture];
 let ready=beforeReady;for(let i=0;i<changed.length;i++){const a=ownInstallationFunctionPin(originals[i]),b=ownInstallationFunctionPin(changed[i]);if(ready.includes(a.sha256))ready=ready.replaceAll(a.sha256,b.sha256);}
 assert.notEqual(ready,beforeReady,'AGREEMENT_WORKING_TIME_READY_CAPTURE_PIN_MISSING');changed.push(ready);
 const replacements=changed.map(s=>s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 return{prior,originals,changed:replacements,capture177Preserved:true,connects:false,executesSql:false};
}
