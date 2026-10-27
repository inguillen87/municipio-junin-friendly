// Pure source-driver regression proposals. No executor, native SQL or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {positions210Rpc,createPositions210Sql} from '../scripts/lib/positions210-same190-native-continuation.mjs';
import {command as annualCommand,uid} from './fixtures/annual-position-budget-synthetic.js';
import {verifyOwnAnnulmentV2FullCapacity} from '../scripts/verify-own-payroll-annulment-v2-full-capacity.mjs';
import {continueOwnMonthlyFullCapacity} from '../scripts/verify-own-monthly-payroll-full-capacity.mjs';
import {runOwnFullCapacity190Continuation} from '../scripts/lib/own-payroll-full-capacity-190-continuation.mjs';
const schema='mc_qa_fixed_092_'+'6'.repeat(32),context={actorEmail:'maker.positions210@example.invalid',actorSessionId:uid(1),actorSessionVersion:1,membershipId:uid(2),releaseSha:'a'.repeat(40),tenantId:uid(3)};
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";

test('RPC rendering preserves the complete employeeContext, normalized body and idempotency key',()=>{
 const body=annualCommand({reason:"Norma exclusivamente QA: revisión 'otra persona'"}),values=[JSON.stringify(context),JSON.stringify(body),uid(4)];
 const text='SELECT public.annual_budget_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
 assert.equal(positions210Rpc(text,values,schema),'SELECT '+schema+'.annual_budget_command_v1('+literal(values[0])+'::jsonb,'+literal(values[1])+'::jsonb,'+literal(values[2])+'::uuid)');
 assert.deepEqual(JSON.parse(values[0]),context);assert.deepEqual(JSON.parse(values[1]),body);
});

test('the closed RPC renderer rejects missing context, extra context, wrong casts and arbitrary SQL',()=>{
 const text='SELECT public.annual_budget_bootstrap_v1($1::jsonb,$2::integer) AS result';
 const missing={...context};delete missing.membershipId;
 for(const ctx of [missing,{...context,actorPersonId:uid(5)},{...context,releaseSha:'changed'},{...context,actorSessionVersion:0}])assert.throws(()=>positions210Rpc(text,[JSON.stringify(ctx),2026],schema));
 assert.throws(()=>positions210Rpc(text.replace('$2::integer','$2::text'),[JSON.stringify(context),2026],schema));
 assert.throws(()=>positions210Rpc('SELECT public.annual_budget_bootstrap_v1($1::jsonb,$2::integer) AS result; SELECT 1',[JSON.stringify(context),2026],schema));
 assert.throws(()=>positions210Rpc('SELECT public.own_run_capture_v1($1::jsonb) AS result',[JSON.stringify(context)],schema));
 assert.throws(()=>positions210Rpc(text,[JSON.stringify(context),2026],'public'));
});

test('the driver delegates one exact runtime SELECT to the existing binding and preserves errors',async()=>{
 const calls=[],result={version:'unit-observation'},qa={schema},h={qa,prepared:{positions210:{schema}}};
 const db={async run(text,runtime){calls.push({text,runtime});return result;}},sql=createPositions210Sql({h,db});
 const text='SELECT public.native_employment_lifecycle_history_v2($1::jsonb,$2::uuid) AS result',values=[JSON.stringify(context),uid(5)];
 assert.deepEqual(await sql.query(text,values),[{result}]);assert.deepEqual(calls,[{text:positions210Rpc(text,values,schema),runtime:true}]);
 const failure=new Error('unit transport failure');db.run=async()=>{throw failure;};await assert.rejects(()=>sql.query(text,values),error=>error===failure);
});

test('all three live entry layers reject non-boolean or callback extensions before native execution',async()=>{
 await assert.rejects(()=>verifyOwnAnnulmentV2FullCapacity({}, {positions210:'true'}));
 await assert.rejects(()=>verifyOwnAnnulmentV2FullCapacity({}, {positions210:true,continuation:()=>{throw Error('must not execute');}}),/POSITIONS210_ENTRY_SETTINGS_CLOSED/);
 await assert.rejects(()=>continueOwnMonthlyFullCapacity({}, {positions210:true}),/POSITIONS210_REQUIRES_COMPLETE208_209/);
 await assert.rejects(()=>runOwnFullCapacity190Continuation({}, {positions210:true}),/POSITIONS210_REQUIRES_COMPLETE208_209/);
 await assert.rejects(()=>runOwnFullCapacity190Continuation({}, {positions210:()=>{}}));
});
