// Finite source RPC contract for the SAME canonical190 continuation.
// No connection, fixture installation or arbitrary-function fallback.
import assert from 'node:assert/strict';
const descriptors=Object.freeze({
 own_run_bootstrap_v1:['jsonb'],own_run_bootstrap_v2:['jsonb'],own_run_attempt_v1:['jsonb','uuid'],
 own_run_capture_v1:['jsonb','jsonb','uuid','text'],own_run_complete_v1:['jsonb','uuid','jsonb','jsonb','text'],own_run_complete_full_v1:['jsonb','uuid','jsonb','jsonb','text'],
 own_liquidation_bootstrap_v1:['jsonb'],own_liquidation_detail_v1:['jsonb','uuid'],own_liquidation_detail_full_v1:['jsonb','uuid'],own_liquidation_command_v1:['jsonb','jsonb','uuid'],own_liquidation_attempt_v1:['jsonb','uuid'],
 own_annul_detail_v1:['jsonb','text','text'],own_annul_detail_full_v1:['jsonb','text','text'],own_annul_command_v1:['jsonb','jsonb','uuid'],own_annul_command_full_v1:['jsonb','jsonb','uuid'],own_annul_attempt_v1:['jsonb','uuid'],own_annul_attempt_full_v1:['jsonb','uuid'],
 own_close_detail_v1:['jsonb','text','text'],own_close_detail_full_v1:['jsonb','text','text'],own_close_command_v1:['jsonb','jsonb','uuid'],own_close_command_full_v1:['jsonb','jsonb','uuid'],own_close_attempt_v1:['jsonb','uuid'],own_close_attempt_full_v1:['jsonb','uuid'],own_close_group_v1:['jsonb','uuid'],own_close_group_full_v1:['jsonb','uuid'],own_close_report_census_v1:['jsonb','text','text'],
 own_accounting_bootstrap_v1:['jsonb'],own_accounting_detail_v1:['jsonb','uuid'],own_accounting_attempt_v1:['jsonb','uuid'],own_accounting_command_v1:['jsonb','jsonb','uuid'],
 own_imputation_bootstrap_v1:['jsonb','text','text'],own_imputation_source_v1:['jsonb','uuid','text'],own_imputation_source_full_v1:['jsonb','uuid','text'],own_imputation_detail_v1:['jsonb','uuid'],own_imputation_detail_full_v1:['jsonb','uuid'],own_imputation_command_v1:['jsonb','jsonb','uuid'],own_imputation_command_full_v1:['jsonb','jsonb','uuid'],own_imputation_attempt_v1:['jsonb','uuid'],
 own_journal_bootstrap_v1:['jsonb','text','text'],own_journal_source_v1:['jsonb','text','uuid'],own_journal_source_full_v1:['jsonb','text','uuid'],own_journal_detail_v1:['jsonb','uuid'],own_journal_detail_full_v1:['jsonb','uuid'],own_journal_command_v1:['jsonb','jsonb','uuid'],own_journal_command_full_v1:['jsonb','jsonb','uuid'],own_journal_attempt_v1:['jsonb','uuid']
});
const statements=new Map(Object.entries(descriptors).map(([name,types])=>['SELECT public.'+name+'('+types.map((t,n)=>'$'+(n+1)+'::'+t).join(',')+') AS result',{name,types}]));
const q=v=>"'"+v.replaceAll("'","''")+"'";
export function ownFullCapacity190Rpc(text,values,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const entry=statements.get(text);assert.ok(entry,'M7_190_RPC_NOT_ALLOWED');
 assert.ok(Array.isArray(values)&&values.length===entry.types.length&&Reflect.ownKeys(values).length===values.length+1,'M7_190_RPC_ARITY');
 for(let n=0;n<entry.types.length;n++){assert.ok(Object.hasOwn(values,n));assert.equal(typeof values[n],'string');if(entry.types[n]==='uuid')assert.match(values[n],/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);if(entry.types[n]==='jsonb'){const value=JSON.parse(values[n]);assert.ok(value&&typeof value==='object'&&!Array.isArray(value));}}
 // Qualify source BEFORE adding opaque request JSON. Never rewrite captured data.
 return text.replace('public.'+entry.name,schema+'.'+entry.name).replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1]));
}
