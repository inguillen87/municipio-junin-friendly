// Pure finite statement renderer; no transport, constructor or database access.
import assert from 'node:assert/strict';

export const OWN_REPORT_CENSUS_QA_QUERY='SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result';
const descriptor=Object.freeze({
 native_employee_bootstrap_v1:['jsonb'],
 native_employee_attempt_v1:['jsonb','uuid'],
 native_employee_create_v1:['jsonb','jsonb','text','uuid'],
 own_program_bootstrap_v1:['jsonb'],
 own_program_command_v1:['jsonb','jsonb','uuid'],
 own_run_bootstrap_v1:['jsonb'],
 own_run_attempt_v1:['jsonb','uuid'],
 own_run_capture_v1:['jsonb','jsonb','uuid','text'],
 own_run_complete_v1:['jsonb','uuid','jsonb','jsonb','text'],
 own_liquidation_detail_v1:['jsonb','uuid'],
 own_liquidation_command_v1:['jsonb','jsonb','uuid'],
 own_close_detail_v1:['jsonb','text','text'],
 own_close_group_v1:['jsonb','uuid'],
 own_close_attempt_v1:['jsonb','uuid'],
 own_close_command_v1:['jsonb','jsonb','uuid'],
 own_close_report_census_v1:['jsonb','text','text'],
 own_period_classification_bootstrap_v1:['jsonb','uuid','text'],
 native_employment_change_bootstrap_v1:['jsonb','uuid'],
 native_employment_change_proposal_v1:['jsonb','uuid','uuid'],
 native_employment_change_attempt_v1:['jsonb','uuid','uuid'],
 native_employment_change_propose_v1:['jsonb','jsonb','uuid'],
 native_employment_change_review_v1:['jsonb','jsonb','uuid']
});
const statements=new Map(Object.entries(descriptor).map(([name,types])=>[
 'SELECT public.'+name+'('+types.map((type,index)=>'$'+(index+1)+'::'+type).join(',')+') AS result',{name,types}
]));
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const uuid=value=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function ownReportCensusQaStatements(){return [...statements.keys()];}
export function ownReportCensusQaRpc(query,values,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'CENSUS_QA_SCHEMA_REQUIRED');
 const entry=statements.get(query);assert.ok(entry,'CENSUS_QA_RPC_NOT_ALLOWED');
 assert.ok(Array.isArray(values)&&values.length===entry.types.length&&Reflect.ownKeys(values).length===values.length+1,'CENSUS_QA_ARITY_REQUIRED');
 assert.ok(entry.types.every((_,index)=>Object.hasOwn(values,index)),'CENSUS_QA_ARITY_REQUIRED');
 for(let index=0;index<entry.types.length;index++){
  const value=values[index];assert.equal(typeof value,'string','CENSUS_QA_STRING_REQUIRED');
  if(entry.types[index]==='uuid')assert.ok(uuid(value),'CENSUS_QA_UUID_REQUIRED');
  if(entry.types[index]==='jsonb'){
   let parsed;try{parsed=JSON.parse(value);}catch{assert.fail('CENSUS_QA_JSON_REQUIRED');}
   assert.ok(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),'CENSUS_QA_OBJECT_REQUIRED');
  }
 }
 if(query===OWN_REPORT_CENSUS_QA_QUERY){
  assert.match(values[1],/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/,'CENSUS_QA_PERIOD_REQUIRED');
  assert.ok(['monthly','first_fortnight','sac','vacation','supplementary','final','other'].includes(values[2]),'CENSUS_QA_TYPE_REQUIRED');
 }
 // Replace only the source function qualifier, before adding opaque literals.
 return query.replace('public.'+entry.name,schema+'.'+entry.name).replace(/\$(\d+)/g,(_,index)=>quote(values[Number(index)-1]));
}
export async function ownReportCensusQaResult(run,query,values,schema){
 assert.equal(typeof run,'function','CENSUS_QA_RUN_REQUIRED');
 const rendered=ownReportCensusQaRpc(query,values,schema);
 // One original runtime operation. Failure and cause are propagated untouched.
 return [{result:await run(rendered)}];
}
