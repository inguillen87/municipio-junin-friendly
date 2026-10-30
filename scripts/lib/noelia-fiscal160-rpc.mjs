// Explicit Noelia fiscal160 QA transport. No execution or credential selection.
import assert from 'node:assert/strict';
const entry=(types,command=false)=>Object.freeze({types:Object.freeze(types),command});
export const NOELIA_FISCAL160_EMISSIONS=Object.freeze({
 'SELECT public.own_fiscal_facts_census_v1($1::jsonb,$2::text) AS result':entry(['jsonb','period']),
 'SELECT public.own_fiscal_facts_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result':entry(['jsonb','uuid','period']),
 'SELECT public.own_fiscal_facts_detail_v1($1::jsonb,$2::uuid) AS result':entry(['jsonb','uuid']),
 'SELECT public.own_fiscal_facts_attempt_v1($1::jsonb,$2::uuid) AS result':entry(['jsonb','uuid']),
 'SELECT public.own_fiscal_facts_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result':entry(['jsonb','jsonb','uuid'],true)
});
export const NOELIA_FISCAL_CHANGE_EMISSIONS=Object.freeze({
 'SELECT public.native_employment_change_bootstrap_v1($1::jsonb,$2::uuid) AS result':entry(['jsonb','uuid']),
 'SELECT public.native_employment_change_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result':entry(['jsonb','jsonb','uuid'],true),
 'SELECT public.native_employment_change_review_v1($1::jsonb,$2::jsonb,$3::uuid) AS result':entry(['jsonb','jsonb','uuid'],true)
});
const q=value=>"'"+value.replaceAll("'","''")+"'";
function statementFor(map,text,values,schema){
 if(typeof text!=='string'||!Object.hasOwn(map,text))return null;
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'NOELIA_FISCAL160_QA_SCHEMA');const {types}=map[text];
 assert.ok(Array.isArray(values)&&values.length===types.length&&Reflect.ownKeys(values).length===types.length+1&&types.every((_,i)=>Object.hasOwn(values,i)&&typeof values[i]==='string'),'NOELIA_FISCAL160_DENSE_STRING_VALUES');
 types.forEach((type,i)=>{const value=values[i];if(type==='jsonb'){let parsed;try{parsed=JSON.parse(value);}catch{assert.fail('NOELIA_FISCAL160_JSON_INVALID');}assert.ok(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),'NOELIA_FISCAL160_OBJECT_JSON_REQUIRED');}else if(type==='uuid')assert.match(value,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,'NOELIA_FISCAL160_UUID_INVALID');else assert.match(value,/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/,'NOELIA_FISCAL160_PERIOD_INVALID');});
 return text.replace('public.',schema+'.').replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1]));
}
export const noeliaFiscal160Statement=(text,values,schema)=>statementFor(NOELIA_FISCAL160_EMISSIONS,text,values,schema);
export const noeliaFiscalEmploymentChangeStatement=(text,values,schema)=>statementFor(NOELIA_FISCAL_CHANGE_EMISSIONS,text,values,schema);
export function createNoeliaFiscal160Sql(base,schema){
 assert.ok(base&&typeof base.query==='function'&&typeof base.run==='function','NOELIA_FISCAL160_RUNTIME_REQUIRED');
 return{query:async(text,values)=>{const statement=noeliaFiscal160Statement(text,values,schema)??noeliaFiscalEmploymentChangeStatement(text,values,schema);return statement===null?base.query(text,values):[{result:await base.run(statement,true)}];}};
}
// Four fiscal facades lock through native_salary_lock -> catalog_lock; attempt
// has no direct fiscal lock. All five conservatively use the same RC/RW path.
// run(statement,true) selects original runtime ROLE + RC/RW, never readOnly.
export const NOELIA_FISCAL160_RUNTIME=Object.freeze({isolation:'read committed',readOnly:false,runtimeRole:true});
