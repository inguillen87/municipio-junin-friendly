// Pure renderer regressions proposed for ROOT. No SQL or municipal proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyNativePositionRpc,monthlyNativePositionRpcSignatures} from '../scripts/lib/monthly-native-position-rpc.mjs';
const schema='mc_qa_fixed_092_'+'a'.repeat(32);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ctx={actorEmail:'position-maker@example.invalid',actorSessionId:id(1),actorSessionVersion:1,releaseSha:'b'.repeat(40),tenantId:id(2),membershipId:id(3)};
const json=JSON.stringify(ctx),quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const body=JSON.stringify({command:'propose',reason:"Documento sintético O'Connor; SELECT no es SQL ejecutable"});
const cases=[
 ['annual_budget_bootstrap_v1',['jsonb','integer'],[json,2026]],
 ['annual_budget_attempt_v1',['jsonb','uuid'],[json,id(4)]],
 ['annual_budget_command_v1',['jsonb','jsonb','uuid'],[json,body,id(4)]],
 ['position_assignment_bootstrap_v1',['jsonb','uuid','integer'],[json,id(5),2026]],
 ['position_assignment_attempt_v1',['jsonb','uuid'],[json,id(4)]],
 ['position_assignment_capture_v1',['jsonb','uuid'],[json,id(6)]],
 ['position_assignment_command_v1',['jsonb','jsonb','uuid'],[json,body,id(4)]],
 ['position_comparison_annual_v2',['jsonb','integer'],[json,2026]],
 ['position_comparison_detail_v2',['jsonb','integer','integer','text','text'],[json,2026,1,'2026-10','monthly']]
];
const statement=(name,types)=>'SELECT public.'+name+'('+types.map((type,index)=>'$'+(index+1)+'::'+type).join(',')+') AS result';
for(const[name,types,values]of cases)test('exact canonical M10 RPC '+name,()=>{
 const query=statement(name,types),before=structuredClone(values),expected='SELECT '+schema+'.'+name+'('+types.map((type,index)=>quote(values[index])+'::'+type).join(',')+') AS result';
 assert.equal(monthlyNativePositionRpc(query,values,schema,ctx),expected);assert.deepEqual(values,before);
});
test('the allowlist is finite, exact and isolated from returned array mutation',()=>{
 const expected=cases.map(([name,types])=>statement(name,types));assert.deepEqual(monthlyNativePositionRpcSignatures(),expected);const copy=monthlyNativePositionRpcSignatures();copy.push('SELECT arbitrary');assert.deepEqual(monthlyNativePositionRpcSignatures(),expected);
});
test('V1 comparison, private helper, changed casts and appended SQL are never rendered',()=>{
 for(const query of [statement('position_comparison_detail_v1',cases.at(-1)[1]),'SELECT public.position_comparison_positions_v2($1::jsonb,$2::uuid) AS result',statement('annual_budget_bootstrap_v1',['jsonb','text']),statement('annual_budget_bootstrap_v1',['jsonb','integer'])+'; SELECT 1','SELECT public.annual_budget_other_v1($1::jsonb) AS result'])assert.equal(monthlyNativePositionRpc(query,[json,2026],schema,ctx),null);
});
test('recognized RPC rejects another tenant, membership, session, release or email before rendering',()=>{
 const query=statement('annual_budget_bootstrap_v1',['jsonb','integer']);for(const change of [{tenantId:id(99)},{membershipId:id(99)},{actorSessionId:id(99)},{actorSessionVersion:2},{releaseSha:'c'.repeat(40)},{actorEmail:'other@example.invalid'}])assert.throws(()=>monthlyNativePositionRpc(query,[JSON.stringify({...ctx,...change}),2026],schema,ctx),/ACTOR_CONTEXT_CHANGED/);
});
test('malformed context, an extra caller scope and unsafe schema fail closed',()=>{
 const query=statement('annual_budget_bootstrap_v1',['jsonb','integer']);for(const value of ['null','[]',JSON.stringify({...ctx,sourceBindingId:id(99)}),JSON.stringify({...ctx,actorSessionVersion:'1'})])assert.throws(()=>monthlyNativePositionRpc(query,[value,2026],schema,ctx));
 for(const value of ['public',schema+';SELECT 1',schema.toUpperCase(),'mc_qa_fixed_092_short'])assert.throws(()=>monthlyNativePositionRpc(query,[json,2026],value,ctx),/SCHEMA_REQUIRED/);
});
test('native number arguments and exact argument count are not silently coerced',()=>{
 const query=statement('annual_budget_bootstrap_v1',['jsonb','integer']);for(const values of [[json,'2026'],[json,1899],[json,2100],[json,2026,1],[json]])assert.throws(()=>monthlyNativePositionRpc(query,values,schema,ctx));
 const detail=statement(...cases.at(-1).slice(0,2));for(const patch of [[json,2026,0,'2026-10','monthly'],[json,2026,1,'2025-10','monthly'],[json,2026,1,'2026-13','monthly'],[json,2026,1,'2026-10','invented']])assert.throws(()=>monthlyNativePositionRpc(detail,patch,schema,ctx));
});
test('body remains an opaque exact JSON string while the SQL literal is escaped once',()=>{
 const query=statement('annual_budget_command_v1',['jsonb','jsonb','uuid']),before=body,out=monthlyNativePositionRpc(query,[json,body,id(4)],schema,ctx);assert.equal(body,before);assert.ok(out.includes(quote(body)+'::jsonb'));assert.ok(out.includes("O''Connor"));for(const value of ['null','[]','1','invalid'])assert.throws(()=>monthlyNativePositionRpc(query,[json,value,id(4)],schema,ctx));
});
