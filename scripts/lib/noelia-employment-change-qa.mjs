// Exact application104 statements only, relocated to the existing disposable QA.
// Rendering and envelope checks do not open a connection or manufacture a review.
import assert from 'node:assert/strict';
import {qaLiteral} from './own-payroll-durable-qa.mjs';

export const NOELIA_EMPLOYMENT_CHANGE_QA_QUERIES=Object.freeze({
 bootstrap:'SELECT public.native_employment_change_bootstrap_v1($1::jsonb,$2::uuid) AS result',
 proposal:'SELECT public.native_employment_change_proposal_v1($1::jsonb,$2::uuid,$3::uuid) AS result',
 attempt:'SELECT public.native_employment_change_attempt_v1($1::jsonb,$2::uuid,$3::uuid) AS result',
 propose:'SELECT public.native_employment_change_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',
 review:'SELECT public.native_employment_change_review_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',
});
const types=Object.freeze({bootstrap:['jsonb','uuid'],proposal:['jsonb','uuid','uuid'],attempt:['jsonb','uuid','uuid'],propose:['jsonb','jsonb','uuid'],review:['jsonb','jsonb','uuid']});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function noeliaEmploymentChangeQaSql(query,values,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'QA104_SCHEMA_INVALID');
 const operation=Object.keys(NOELIA_EMPLOYMENT_CHANGE_QA_QUERIES).find(key=>NOELIA_EMPLOYMENT_CHANGE_QA_QUERIES[key]===query);
 assert.ok(operation,'QA104_QUERY_NOT_ALLOWED');
 const signature=types[operation];
 assert.ok(Array.isArray(values)&&values.length===signature.length&&Reflect.ownKeys(values).length===values.length+1,'QA104_ARITY_INVALID');
 assert.ok(signature.every((_,index)=>Object.hasOwn(values,index)),'QA104_ARITY_INVALID');
 for(let i=0;i<signature.length;i++){
  assert.equal(typeof values[i],'string','QA104_PARAMETER_TYPE_INVALID');
  if(signature[i]==='uuid')assert.ok(uuid(values[i]),'QA104_UUID_INVALID');
  else{let parsed;try{parsed=JSON.parse(values[i]);}catch{assert.fail('QA104_JSON_INVALID');}assert.ok(object(parsed),'QA104_JSON_OBJECT_REQUIRED');}
 }
 // Only the function namespace is replaced, before quoting any parameter.
 return query.replace('public.native_employment_change_',schema+'.native_employment_change_').replace(/\$(\d+)/g,(_,n)=>qaLiteral(values[Number(n)-1]));
}
export async function noeliaEmploymentChangeQaResult(db,query,values,schema){
 const rendered=noeliaEmploymentChangeQaSql(query,values,schema);
 assert.equal(typeof db?.run,'function','QA104_RUN_REQUIRED');
 return [{result:await db.run(rendered,true)}];
}
// Application104 owns operation=propose/review. Never rewrite it as command.
export function noeliaEmploymentChangeQaEnvelope(value,previewParams=undefined){
 assert.equal(previewParams,undefined,'QA104_ENVELOPE_INVALID');
 assert.ok(object(value)&&Reflect.ownKeys(value).length===2&&Object.hasOwn(value,'operation')&&Object.hasOwn(value,'payload'),'QA104_ENVELOPE_INVALID');
 assert.ok(['propose','review'].includes(value.operation)&&object(value.payload),'QA104_ENVELOPE_INVALID');
 return value;
}
