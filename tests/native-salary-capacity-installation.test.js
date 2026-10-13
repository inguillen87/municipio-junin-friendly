import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildNativeSalaryCapacityInstallation} from '../scripts/lib/native-salary-capacity-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),options={read,sourceCommit:'9'.repeat(40)};
test('capacity batch changes three pinned functions and one bounded read facade without tables or associations',()=>{
 const b=buildNativeSalaryCapacityInstallation(options);
 assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.deepEqual(b.afterPins.map(p=>p.signature),['public.native_salary_items_v1(jsonb)','public.native_salary_command_v1(jsonb,jsonb,uuid)','public.native_salary_bootstrap_v1(jsonb)','public.native_salary_stream_v1(jsonb,integer,text)']);
 assert.deepEqual(b.afterPins.map(p=>p.runtime),[false,true,true,true]);
 assert.match(b.items,/jsonb_array_length\(items\)>10000/);assert.match(b.items,/octet_length\(items::text\)>4194304/);
 assert.match(b.items,/FROM \(SELECT public.native_salary_row_key_v1/);
 assert.match(b.command,/>134217728/);assert.match(b.command,/>67108864/);
 assert.equal(b.command.replace(')::text)>67108864',')::text)>8388608'),b.commandBefore);
 for(const guard of ['NATIVE_SALARY_IDEMPOTENCY_REUSE','NATIVE_SALARY_HISTORY_REQUIRED','NATIVE_SALARY_CLASSIFICATION_INVALID','NATIVE_SALARY_INDEPENDENT_REQUIRED','NATIVE_SALARY_BASE_CHANGED','NATIVE_SALARY_PROPOSAL_CHANGED'])assert.ok(b.command.includes(guard));
 assert.doesNotMatch(b.mutations.join('\n'),/CREATE TABLE|ALTER TABLE|DROP TABLE|UPDATE public\.employment|GRANT (SELECT|INSERT|UPDATE|DELETE)/);
 assert.match(b.stream,/value:=public.native_salary_bootstrap_v1\(p\)/);assert.match(b.stream,/NATIVE_SALARY_SNAPSHOT_CHANGED/);assert.match(b.stream,/SET timezone='UTC'/);
 assert.match(b.stream,/size>67108864/);assert.match(b.stream,/page>=256/);assert.match(b.stream,/262144/);
 assert.equal(b.bootstrap.replace('octet_length(c::text)>67108864','octet_length(c::text)>16777216'),b.bootstrapBefore);
});
test('installation includes all prior state, original permissions, repeatable-read and durable checks',()=>{
 const b=buildNativeSalaryCapacityInstallation(options);
 assert.match(b.statements[0],/repeatable read/);assert.match(b.before,/rowsSha256/);assert.match(b.before,/memberships/);assert.match(b.before,/defaultAcl/);
 assert.match(b.before,/native_salary_stream_v1/);assert.doesNotMatch(b.before,/p\.proname LIKE 'native_leave_%'/);
 assert.match(b.conservation,/before.*after/);assert.match(b.beforeCheck,/SALARY_CAPACITY_PREREQUISITE_CHANGED/);assert.match(b.afterCheck,/SALARY_CAPACITY_FUNCTION_CHANGED/);
 assert.doesNotMatch(b.verification.join('\n'),/CREATE FUNCTION|CREATE OR REPLACE FUNCTION|INSERT INTO|UPDATE public\./);
 assert.match(b.proof,/'newTables',0/);assert.match(b.proof,/'businessWrites',0/);
});
test('absent release or modified original source cannot generate an installation',()=>{
 assert.throws(()=>buildNativeSalaryCapacityInstallation({...options,sourceCommit:'working-tree'}));
 assert.throws(()=>buildNativeSalaryCapacityInstallation({...options,read:f=>read(f)+(f.endsWith('112-native-salary-definitions.sql')?'\nALTER TABLE malicious;':'')}));
});
