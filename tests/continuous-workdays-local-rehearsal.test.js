import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearseContinuousWorkdays} from '../scripts/rehearse-continuous-workdays-local.mjs';
const target={database:'restore_monthly_20260914',host:'127.0.0.1',port:5432,role:'restore_owner',branch:null};
test('local workday rehearsal refuses every non-restored target before opening a transaction',async()=>{
 for(const patch of [{database:'neondb'},{host:'192.0.2.1'},{port:55439},{role:'neondb_owner'},{branch:'br-operational'}]){
  const calls=[],client={query:async sql=>{calls.push(sql);return {rows:[{...target,...patch}]}}};
  await assert.rejects(()=>rehearseContinuousWorkdays({client}),/CONTINUOUS_LOCAL_TARGET_REQUIRED/);
  assert.equal(calls.length,1);assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
 }
});
test('local workday rehearsal refuses an already-installed v2 without changing its definition',async()=>{
 const calls=[],client={query:async sql=>{calls.push(sql);return {rows:[calls.length===1?target:{absent:false}]}}};
 await assert.rejects(()=>rehearseContinuousWorkdays({client}),/CONTINUOUS_CLEAN_BASELINE_REQUIRED/);
 assert.equal(calls.length,2);assert.ok(calls.every(sql=>sql.startsWith('SELECT')));
});
