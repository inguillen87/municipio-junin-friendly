// Pure rejection-layer regression only. No SQL, credentials, IAM grants or native run.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {assertMonthlyDaySelfApprovalRejected} from '../scripts/lib/monthly-day-declaration-native-only-qa.mjs';
import {MonthlyDayDeclarationError} from '../lib/internal-own-monthly-day-declaration.js';
const forbidden=()=>new MonthlyDayDeclarationError('FORBIDDEN',403,'La membresía no permite esta operación.');
test('194 prepare-only maker must be denied with exact canonical prefixed403 before any business RPC',async()=>{
 let calls=21;await assertMonthlyDaySelfApprovalRejected(async()=>{throw forbidden();},{layer:'http-forbidden',rpcCount:()=>calls});assert.equal(calls,21);
});
test('194 HTTP negative rejects a success, wrong code/status, missing counter or any reached business RPC',async()=>{
 for(const failure of[Object.assign(Error('unprefixed'),{code:'FORBIDDEN',status:403}),Object.assign(Error('wrong'),{code:'OTHER',status:403}),Object.assign(forbidden(),{status:401}),Object.assign(Error('independent'),{code:'MONTHLY_DAY_DECLARATION_INDEPENDENT_REQUIRED',status:409}),Error('generic')])await assert.rejects(()=>assertMonthlyDaySelfApprovalRejected(async()=>{throw failure;},{layer:'http-forbidden',rpcCount:()=>21}));
 await assert.rejects(()=>assertMonthlyDaySelfApprovalRejected(async()=>({approved:true}),{layer:'http-forbidden',rpcCount:()=>21}));
 await assert.rejects(()=>assertMonthlyDaySelfApprovalRejected(async()=>{throw forbidden();},{layer:'http-forbidden'}),/MONTHLY_DAY_SELF_APPROVAL_RPC_COUNT_REQUIRED/);
 let calls=21;await assert.rejects(()=>assertMonthlyDaySelfApprovalRejected(async()=>{calls++;throw forbidden();},{layer:'http-forbidden',rpcCount:()=>calls}),/MONTHLY_DAY_SELF_APPROVAL_MUST_STOP_BEFORE_RPC/);
 let invoked=false;await assert.rejects(()=>assertMonthlyDaySelfApprovalRejected(async()=>{invoked=true;throw forbidden();},{layer:'anything'}),/MONTHLY_DAY_SELF_APPROVAL_LAYER/);assert.equal(invoked,false);
});
test('the existing SQL independent-review predicate remains exact and is never relabelled as HTTP proof',async()=>{
 await assertMonthlyDaySelfApprovalRejected(async()=>{throw Object.assign(Error('independent'),{code:'MONTHLY_DAY_DECLARATION_INDEPENDENT_REQUIRED'});});
 await assert.rejects(()=>assertMonthlyDaySelfApprovalRejected(async()=>{throw forbidden();}));
});
test('194 selects the HTTP layer and actual recorded RPC counter in the source-bookended runner',()=>{
 const runner=fs.readFileSync(new URL('../scripts/verify-own-monthly-day-engine-source.mjs',import.meta.url),'utf8'),helper=fs.readFileSync(new URL('../scripts/lib/monthly-day-declaration-native-only-qa.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes("selfApproval:{layer:'http-forbidden',rpcCount:()=>rpc.length}"));assert.ok(runner.includes("'tests/own-monthly-day-engine-source-self-approval.test.js'"));assert.ok(helper.includes("await assertMonthlyDaySelfApprovalRejected(()=>monthly('command',maker"));
});
