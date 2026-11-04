// Import and validator tests only. Never call verifyOwnMonthlyDayPolicy here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerAuthorityQaOptions} from '../scripts/verify-municipal-owner-adoption-authority.mjs';
import {monthlyDayPolicyQaOptions,monthlyDayQaNativeResult,MONTHLY_DAY_POLICY_QA_ENTRIES,verifyOwnMonthlyDayPolicy} from '../scripts/verify-own-monthly-day-policy.mjs';
const options={major:17,transport:'ci',sourceCommit:'a'.repeat(40),operationalPairBaseline:'pre107',output:'verification/monthly-day-policy-pg17-pre107'};
test('all four explicit CI variants pass the same pure gate; the verifier is inert on import',()=>{
 assert.equal(typeof verifyOwnMonthlyDayPolicy,'function');
 for(const major of [17,18])for(const operationalPairBaseline of ['pre107','published107']){
  const expected={...options,major,operationalPairBaseline,output:'verification/monthly-day-policy-pg'+major+'-'+operationalPairBaseline};
  const cli=['--major='+major,'--transport=ci','--source-commit='+options.sourceCommit,'--operational-pair-baseline='+operationalPairBaseline,'--output='+expected.output];
  assert.deepEqual(monthlyDayPolicyQaOptions(ownerAuthorityQaOptions(cli)),expected);
 }
});
test('missing baseline, inherited local default, unknown fields and unsafe outputs never reach the constructor',()=>{
 for(const key of Object.keys(options)){const value={...options};delete value[key];assert.throws(()=>monthlyDayPolicyQaOptions(value));}
 for(const value of [{...options,transport:'local'},{...options,transport:undefined},{...options,major:'17'},{...options,major:16},{...options,sourceCommit:'a'.repeat(39)},{...options,operationalPairBaseline:'auto'},{...options,output:'verification/../escape'},{...options,output:'/tmp/test'},{...options,browser:'none'}])assert.throws(()=>monthlyDayPolicyQaOptions(value));
 const noTransport=['--major=17','--source-commit='+options.sourceCommit,'--operational-pair-baseline=pre107','--output='+options.output];assert.throws(()=>monthlyDayPolicyQaOptions(ownerAuthorityQaOptions(noTransport)),/MONTHLY192_CI_ONLY/);
});
test('a native error or signal is never hidden by status0 and valid-looking JSON',()=>{
 const result={status:0,signal:null,error:null,stdout:'{"passed":true}\n',stderr:''};assert.deepEqual(monthlyDayQaNativeResult(result,{json:true}),{passed:true});
 for(const bad of [{...result,error:{code:'ETIMEDOUT'}},{...result,signal:'SIGTERM'},{...result,status:null},{...result,status:1}])assert.throws(()=>monthlyDayQaNativeResult(bad,{json:true}));
});
test('JSON observations require exactly one whole result row; zero, null process result and mixed output reject',()=>{
 const result={status:0,signal:null,error:null,stdout:'{}\n',stderr:''};
 for(const stdout of ['', '{}\n{}\n','notice\n{}','{broken','null','[]','true','1'])assert.throws(()=>monthlyDayQaNativeResult({...result,stdout},{json:true}));
 assert.throws(()=>monthlyDayQaNativeResult(null,{json:true}));assert.equal(monthlyDayQaNativeResult({...result,stdout:'auxiliary setup output'},{json:false}).status,0);
});
test('an expected SQL refusal still requires exact psql error status and the requested error label',()=>{
 const result={status:3,signal:null,error:null,stdout:'',stderr:'psql: ERROR: MONTHLY_DAY_ROLLBACK_HAS_HISTORY\n'};
 assert.deepEqual(monthlyDayQaNativeResult(result,{expectedCode:'MONTHLY_DAY_ROLLBACK_HAS_HISTORY'}),{rejected:true,code:'MONTHLY_DAY_ROLLBACK_HAS_HISTORY',status:3});
 for(const value of [{...result,status:0},{...result,status:1},{...result,error:{code:'ETIMEDOUT'}},{...result,signal:'SIGKILL'},{...result,stderr:'OTHER_FAILURE'},{...result,stderr:'XMONTHLY_DAY_ROLLBACK_HAS_HISTORYY'}])assert.throws(()=>monthlyDayQaNativeResult(value,{expectedCode:'MONTHLY_DAY_ROLLBACK_HAS_HISTORY'}));
 assert.throws(()=>monthlyDayQaNativeResult(result,{expectedCode:'HISTORY|OTHER'}));
});
test('the declared closure includes runner, workflow, meaningful fixtures and all existing opt-in validators',()=>{
 assert.equal(new Set(MONTHLY_DAY_POLICY_QA_ENTRIES).size,MONTHLY_DAY_POLICY_QA_ENTRIES.length);assert.equal(Object.isFrozen(MONTHLY_DAY_POLICY_QA_ENTRIES),true);
 for(const entry of ['.github/workflows/own-monthly-day-policy.yml','tests/own-monthly-day-policy-workflow.test.js','scripts/lib/own-monthly-day-policy-qa.mjs','tests/fixtures/own-monthly-day-policy-sql-synthetic.js','scripts/migrations/192-own-monthly-day-full-month-policy.sql','lib/own-monthly-day-policy-input.js','lib/internal-own-payroll-run.js'])assert.ok(MONTHLY_DAY_POLICY_QA_ENTRIES.includes(entry),entry);
});
