import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNeonPlatform} from '../scripts/verify-neon-platform.mjs';
const target={projectId:'synthetic-project',branchId:'br-synthetic',major:18};
function fixture(changes={}) {
  const calls=[];
  const rows=[[],[{project_id:target.projectId,branch_id:target.branchId,version_num:'180006',version:'18.6',read_only:'on',public_tables:'0',...changes}],
    [{exact_sum:'0.30',positive_round:'1234.57',negative_round:'-1234.57',leap_anniversary:'2025-02-28',local_clock_date:'2026-09-30 23:30',json_exact_amount:'123456789012345.67'}]];
  return {calls,rows,query:(text,params)=>({text,params}),transaction:async(queries,options)=>{calls.push({queries,options});return rows;}};
}
test('database compatibility checks use bounded, repeatable read-only transactions',async()=>{
  const sql=fixture(),r=await verifyNeonPlatform(sql,target);
  assert.deepEqual(sql.calls[0].options,{readOnly:true,isolationLevel:'RepeatableRead'});
  assert.equal(r.checksPassed,6);assert.equal(r.databaseWrites,0);assert.equal(r.fullRestoreVerified,false);
  assert.equal(r.payrollCertified,false);
  for(const q of sql.calls[0].queries) assert.doesNotMatch(q.text,/\b(INSERT|DELETE|UPDATE|DROP|ALTER|TRUNCATE|CREATE)\b/);
  assert.deepEqual(sql.calls[0].queries[2].params,['0.10','0.20','123456789012345.67']);
});
test('invalid targets fail before opening a transaction',async()=>{
  for(const change of [{major:19},{projectId:''},{branchId:'main'},{projectId:'other;delete'}]) {
    const sql=fixture();await assert.rejects(verifyNeonPlatform(sql,{...target,...change}));assert.equal(sql.calls.length,0);
  }
});
test('wrong project, branch, major or writable transaction fail instead of certifying a target',async()=>{
  for(const change of [{project_id:'other'},{branch_id:'br-other'},{version_num:'170011'},{read_only:'off'}])
    await assert.rejects(verifyNeonPlatform(fixture(change),target));
});
test('numeric, calendar and serialization regressions cannot pass',async()=>{
  for(const key of ['exact_sum','positive_round','negative_round','leap_anniversary','local_clock_date','json_exact_amount']) {
    const sql=fixture();sql.rows[2][0][key]='incorrect';await assert.rejects(verifyNeonPlatform(sql,target));
  }
});
test('PostgreSQL 17 is read-tested only when explicitly selected as the source',async()=>{
  const sql=fixture({version_num:'170011',version:'17.11'});
  assert.equal((await verifyNeonPlatform(sql,{...target,major:17})).postgresVersion,'17.11');
});
