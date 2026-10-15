import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnPayrollReadinessSql,installOwnPayrollReadinessUiQa} from '../scripts/lib/own-payroll-readiness-ui-qa.mjs';
import {NATIVE_ROSTER_V2_SQL} from '../lib/internal-native-roster.js';
import {MAX_NATIVE_ROSTER_ROWS} from '../assets/native-roster-model.js';
const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),pins:"current_database()<>'own_payroll_run_qa';current_setting('neon.project_id',true)"};
test('readiness adapter accepts only exact canonical reads and preserves SQL-bound text',async()=>{
 const calls=[],returned=[{result:{fromSyntheticDatabase:true}}],db={run:async(sql,runtime)=>{calls.push({sql,runtime});return returned;}},sql=createOwnPayrollReadinessSql(db,qa);
 assert.equal(await sql.query(NATIVE_ROSTER_V2_SQL,['{}','all','','',"O'Hara $&",'','',MAX_NATIVE_ROSTER_ROWS+1]),returned);
 assert.match(calls[0].sql,/SELECT coalesce\(jsonb_agg\(to_jsonb\(qa_read\)\)/);assert.ok(calls[0].sql.includes("'O''Hara $&'"));assert.ok(calls[0].sql.includes(qa.schema+'.native_employee_read_projection_v1'));
 await sql.query('SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result',['{}']);await sql.query('SELECT public.own_program_bootstrap_v1($1::jsonb) AS result',['{}']);assert.equal(calls.length,3);assert.equal(calls[1].runtime,true);assert.equal(calls[2].runtime,true);
 for(const statement of [NATIVE_ROSTER_V2_SQL+';SELECT 1','SELECT public.own_program_command_v1($1::jsonb) AS result','DELETE FROM employment_contract'])await assert.rejects(sql.query(statement,['{}']));
 await assert.rejects(sql.query(NATIVE_ROSTER_V2_SQL,['{}','all','','','','','',1]));assert.equal(calls.length,3);
});
test('invalid destination or partial reader setup fails before a schema mutation',async()=>{
 let calls=0;assert.throws(()=>createOwnPayrollReadinessSql({run:()=>{calls++;}},{...qa,schema:'public'}));assert.equal(calls,0);
 await assert.rejects(installOwnPayrollReadinessUiQa({run:async()=>{calls++;return {count:1};}},qa),/PARTIAL_READER/);assert.equal(calls,1);
});
test('existing canonical readers are verified with full metadata and execute ACL pins, never replaced',async()=>{
 const calls=[],db={run:async sql=>{calls.push(sql);return calls.length===1?{count:2}:{};}};
 const result=await installOwnPayrollReadinessUiQa(db,qa);assert.equal(result.installed,false);assert.equal(result.canonicalReadersVerified,true);assert.equal(calls.length,2);
 assert.match(calls[1],/QA_READINESS_EXISTING_READER_CHANGED/);assert.match(calls[1],/native_employee_read_projection_v1/);assert.match(calls[1],/native_employee_directory_snapshot_v1/);assert.match(calls[1],/has_function_privilege/);assert.doesNotMatch(calls[1],/CREATE (?:OR REPLACE )?FUNCTION/);
});
test('older fixture installs only empty canonical row types and read135, preserving existing sources',async()=>{
 const preserved={functions:'unchanged',contracts:'unchanged',identities:'unchanged',registrations:'unchanged',capabilities:'unchanged'},counts=Object.fromEntries(['proposal','seal','decision','application'].map(k=>['employment_adoption_'+k,0])),answers=[{count:0},preserved,{count:0},{},preserved,counts],calls=[];
 const result=await installOwnPayrollReadinessUiQa({run:async sql=>{calls.push(sql);assert.ok(answers.length);return answers.shift();}},qa);
 assert.equal(answers.length,0);assert.equal(result.installed,true);assert.equal(result.existingSourcesPreserved,true);assert.equal(calls.length,6);
 const install=calls[3];assert.equal((install.match(/CREATE TABLE /g)??[]).length,4);assert.equal((install.match(/CREATE FUNCTION /g)??[]).length,2);assert.match(install,/ENABLE ROW LEVEL SECURITY/);assert.match(install,/REVOKE ALL ON/);assert.match(install,/QA_READINESS_READER_CHANGED/);
 assert.doesNotMatch(install,/CREATE (?:OR REPLACE )?FUNCTION \w+\.employment_adoption_|INSERT INTO|UPDATE employment_contract|CREATE OR REPLACE|grh_effective_baseline_guard_v1/);
});
