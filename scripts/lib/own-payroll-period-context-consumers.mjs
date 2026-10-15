// Compose only the four reviewed180 consumers. No connection or SQL execution.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {buildOwnAgreementWorkingTimeInstallation} from './own-agreement-working-time-installation.mjs';
export const PERIOD_CONTEXT_PARENT_COMMIT='800dfcc3f4e68d16afba5805bb8fb56f6a253428';
export const PERIOD_CONTEXT_PARENT_SQL_SHA256='c3751f15900ff1bcb974c6fa774c6bb2485bb0e9042ca1db520ff0ea2506968c';
const hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PERIOD_CONTEXT_SOURCE_ANCHOR: '+a.slice(0,100));return s.replace(a,()=>b);};
export function derivePayrollPeriodContextConsumers({read,sourceCommit}){
 const prior=buildOwnAgreementWorkingTimeInstallation({read,sourceCommit}),source=read('scripts/migrations/180-own-agreement-working-time-program.sql').replace(/\r\n?/g,'\n');
 assert.equal(hash(source),PERIOD_CONTEXT_PARENT_SQL_SHA256,'PERIOD_CONTEXT_PARENT180_CHANGED');
 const names=['own_program_definition_v1','own_program_command_v1','own_run_capture_v1','municipal_adoption_ready_v1'];
 const originals=names.map(name=>{const rows=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.equal(rows.length,1,name);const pin=ownInstallationFunctionPin(rows[0]);assert.equal(pin.sha256,prior.afterConsumerPins.find(p=>p.name===name)?.sha256,'PERIOD_CONTEXT_PREDECESSOR_PIN_CHANGED');return rows[0];});
 let definition=once(originals[0],'DECLARE agreement_working boolean:=',"DECLARE period_context boolean:=coalesce(p->>'periodContextVersion'='own-payroll-period-context.v1',false);agreement_working boolean:=");
 definition=once(definition,"||CASE WHEN agreement_working THEN ARRAY['agreementWorkingTimeVersion'] ELSE ARRAY[]::text[] END","||CASE WHEN agreement_working THEN ARRAY['agreementWorkingTimeVersion'] ELSE ARRAY[]::text[] END||CASE WHEN period_context THEN ARRAY['periodContextVersion'] ELSE ARRAY[]::text[] END");
 definition=once(definition,' IF agreement_working AND NOT ns THEN'," IF period_context AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;\n IF agreement_working AND NOT ns THEN");
 const facts="'employment_fact','period_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact'";assert.equal(definition.split(facts).length-1,5);definition=definition.replaceAll(facts,"'employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact'");
 definition=once(definition,"(b->>'sourceKind'<>'agreement_time_fact' OR agreement_working)","(b->>'sourceKind'<>'agreement_time_fact' OR agreement_working) AND(b->>'sourceKind'<>'period_context_fact' OR period_context)");
 definition=once(definition,"  IF b->>'sourceKind'='agreement_time_fact' AND","  IF b->>'sourceKind'='period_context_fact' AND(b->>'sourceField'<>'monthNumber' OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;\n  IF b->>'sourceKind'='agreement_time_fact' AND");
 definition=once(definition,"IF agreement_working THEN normalized:=normalized||jsonb_build_object('agreementWorkingTimeVersion','own-agreement-working-time.v1');END IF;","IF agreement_working THEN normalized:=normalized||jsonb_build_object('agreementWorkingTimeVersion','own-agreement-working-time.v1');END IF;IF period_context THEN normalized:=normalized||jsonb_build_object('periodContextVersion','own-payroll-period-context.v1');END IF;");
 const command=once(originals[1],"  IF current_program#>>'{definition,agreementWorkingTimeVersion}'","  IF current_program#>>'{definition,periodContextVersion}'='own-payroll-period-context.v1' AND definition->>'periodContextVersion' IS DISTINCT FROM 'own-payroll-period-context.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;\n  IF current_program#>>'{definition,agreementWorkingTimeVersion}'");
 let capture=once(originals[2],'agreement_facts jsonb;','agreement_facts jsonb;period_context jsonb;');
 const sources="jsonb_build_object('employees',employees,'periodContext',period_context)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,periodParticipation,version}'='own-period-participation.v1' THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN jsonb_build_object('agreementWorkingTime',agreement_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END";
 const extra=` IF program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN
  IF jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR length(body->>'period')<>7 OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  period_context:=jsonb_build_object('version','own-payroll-period-context.v1','period',body->>'period','monthNumber',CASE WHEN substring(body->>'period',6,1)='0' THEN right(body->>'period',1) ELSE right(body->>'period',2) END);
  period_context:=period_context||jsonb_build_object('sha256',public.own_run_hash_v1(period_context));
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(${sources})));
  inventory:=inventory||jsonb_build_object('periodContext',jsonb_build_object('version',period_context->>'sha256','total',1,'complete',true));
 END IF;
`;
 capture=once(capture," payload_value:=jsonb_build_object('programState'",extra+" payload_value:=jsonb_build_object('programState'");
 const attach=" IF program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN payload_value:=payload_value||jsonb_build_object('periodContext',period_context);END IF;\n";
 capture=once(capture,' IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304',attach+' IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304');
 let reversed=once(capture,'agreement_facts jsonb;period_context jsonb;','agreement_facts jsonb;');reversed=once(reversed,extra,'');reversed=once(reversed,attach,'');assert.equal(reversed,originals[2],'PERIOD_CONTEXT_CAPTURE180_NOT_PRESERVED');
 const changed=[definition,command,capture];let ready=originals[3];for(let i=0;i<3;i++){const old=ownInstallationFunctionPin(originals[i]).sha256,next=ownInstallationFunctionPin(changed[i]).sha256;if(ready.includes(old))ready=ready.replaceAll(old,next);}assert.notEqual(ready,originals[3],'PERIOD_CONTEXT_READY_PIN_MISSING');changed.push(ready);
 return{prior,originals,changed,capture180Preserved:true,connects:false,executesSql:false};
}
