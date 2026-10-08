import {createHash} from 'node:crypto';
import {finalConsumerFixture} from './final-source-consumer-synthetic.js';
import {FINAL_CONTRACT_TRANSITION_COHORT_SQL,FINAL_CONTRACT_TRANSITION_ROWS_SQL} from '../../scripts/lib/grh-final-contract-transition.mjs';
const md5=v=>createHash('md5').update(v).digest('hex');
export function finalTransitionFixture({count=3,editContext,editRows,editCohort}={}){
 const f=finalConsumerFixture({editContext}),entity='curated/grh_employees';
 f.data[entity]=Array.from({length:count},(_,n)=>({row_key:(n+1).toString(16).padStart(64,'0'),
  record_json:'{"name": "PRIVATE_SYNTHETIC_PERSON", "person_id": 9007199254740993, "quantity": 9007199254740993.0000001, "ordinal": '+n+'}'}));
 f.context.fingerprints[entity]={rows:count,md5:md5(f.data[entity].map(r=>md5(r.row_key+r.record_json)).join(''))};
 const core='core/employmentReconciliation';f.data[core]=structuredClone(f.data[entity]);
 f.context.fingerprints[core]=structuredClone(f.context.fingerprints[entity]);
 const cohort={candidate_rows:count,core_rows:count,existing_rows:count,missing_core_keys:0,extra_core_keys:0,
  duplicate_candidate_keys:0,duplicate_core_keys:0,missing_existing_keys:0,foreign_company_rows:0};
 const rows=f.data[entity].map((r,n)=>({row_key:r.row_key,
  contract_id:(n+1).toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111',person_id:'22222222-2222-4222-8222-222222222222',
  source_record_json:r.record_json,previous_facts_json:'{"contract": {"id": "same canonical UUID"}, "person": {"full_name": "PRIVATE_SYNTHETIC_PERSON"}}',
  candidate_facts_json:'{"startDate": "2026-01-01", "sourcePayload": {"quantity": 9007199254740993.0000001, "missing": null, "zero": 0}}',issues:[]}));
 const originalQuery=f.client.query;
 f.client.query=async(text,values)=>{
  if(text===FINAL_CONTRACT_TRANSITION_COHORT_SQL){f.calls.push({text,values});const c=structuredClone(cohort);editCohort?.(c);return {rows:[c]};}
  if(text===FINAL_CONTRACT_TRANSITION_ROWS_SQL){f.calls.push({text,values});const copy=structuredClone(rows);editRows?.(copy);return {rows:copy};}
  return originalQuery(text,values);
 };
 return {...f,cohort,projectionRows:rows};
}
