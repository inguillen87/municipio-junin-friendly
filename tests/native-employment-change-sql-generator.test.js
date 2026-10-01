import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeEmploymentChangeQa} from '../scripts/verify-native-employment-change-sql.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n');
const sql=read('scripts/migrations/104-native-employment-changes.sql');
for(const serverMajor of [17,18])test('native rectification real SQL rollback fixture PG'+serverMajor,()=>{
 const qa=buildNativeEmploymentChangeQa({serverMajor,requireConcurrency:true});
 assert.match(qa.sql,/current_database\(\)<>'native_employment_change_qa'/);assert.match(qa.sql,/neon\.project_id/);
 assert.match(qa.sql,new RegExp('server_version_num.*?<>'+serverMajor));assert.match(qa.sql,/ROLLBACK;\s*$/);
 assert.ok(qa.report.changeChecksPassed>=90);assert.equal(qa.report.changeConcurrentLockChecked,true);
 assert.equal(qa.report.migration104Sha256,createHash('sha256').update(sql).digest('hex'));
 assert.match(qa.sql,/all five framing fields update/);assert.match(qa.sql,/deferred constraint/);assert.match(qa.sql,/forged session GUC never/);
 assert.match(qa.sql,/real093\/101\/102 identity/);assert.match(qa.sql,/hire receipt, person, registration/);assert.match(qa.sql,/target identity drift preserves original receipts/);
 assert.match(qa.lockSql,/native-employment-change:v1:/);assert.match(qa.lockSql,/FIXED_NOVELTIES_QA_LOCK_READY/);assert.match(qa.lockSql,/pg_try_advisory_lock/);
 assert.doesNotMatch(qa.sql,/INSERT\s+INTO\s+public\./i);assert.match(qa.sql,/RESTORE_CHANGE_FIXTURES/);
});
test('104 replaces only the guarded contract trigger and exposes exactly five authenticated facades',()=>{
 const defs=splitPostgresStatements(sql).filter(s=>/CREATE OR REPLACE FUNCTION public\./.test(s));
 assert.equal(defs.length,22);assert.equal(defs.filter(s=>/CREATE OR REPLACE FUNCTION public\.native_employee_contract_guard_v1/.test(s)).length,1);
 assert.equal(defs.filter(s=>/CREATE OR REPLACE FUNCTION public\.native_employment_change_/.test(s)).length,21);
 const grant=/GRANT EXECUTE ON FUNCTION ([\s\S]+?) TO municontrol_actions_runtime_app;/.exec(sql)?.[1];assert.ok(grant);
 assert.deepEqual([...grant.matchAll(/public\.(native_employment_change_\w+)\(/g)].map(m=>m[1]).sort(),['attempt','bootstrap','proposal','propose','review'].map(n=>'native_employment_change_'+n+'_v1').sort());
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.native_employee_(create|receipt|catalog)_v1/);
 assert.doesNotMatch(sql,/INSERT INTO public\.iam_|UPDATE public\.iam_|DELETE FROM public\.iam_/);
 assert.match(sql,/applied_xid=pg_current_xact_id_if_assigned\(\)/);assert.match(sql,/r\.before_contract=to_jsonb\(before_row\)/);assert.match(sql,/r\.after_contract=to_jsonb\(after_row\)/);
 assert.match(sql,/CREATE CONSTRAINT TRIGGER native_employment_change_review_applied[\s\S]+?DEFERRABLE INITIALLY DEFERRED/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS native_employment_change_transaction[\s\S]+?\(contract_id,applied_xid\)/);
 assert.doesNotMatch(sql,/current_setting\([^)]*(?:allow|bypass|change)/i);
});
test('metadata pins are strict, portable, and require the installed103 baseline',()=>{
 assert.doesNotMatch(sql,/-- TABLE104_PINS|-- PREREQUISITE_GUARD|-- PATCH_NATIVE_GUARD|-- EXACT_ACL/);
 assert.match(sql,/to_regclass\('public\.native_employment_catalog_proposal'\) IS NULL/);
 assert.match(sql,/ORDER BY conname::text COLLATE "C"/);assert.match(sql,/NOT k\.convalidated/);
 assert.match(sql,/native_employment_change_review_applied'[\s\S]+?tgdeferrable AND tginitdeferred/);
 assert.match(sql,/p\.proargnames IS DISTINCT FROM ARRAY\['ctx','p_contract','hold_lock'\]/);
 assert.equal((sql.match(/SET timezone='UTC' AS \$\$/g)??[]).length,21);
 assert.match(sql,/ARRAY\['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'\]/);
 assert.match(buildNativeEmploymentChangeQa({serverMajor:17}).sql,/America\/Argentina\/Buenos_Aires/);
 const pins=[...sql.matchAll(/\('native_employment_change_(proposal|review)','((?:[^']|'')*)'::jsonb\)/g)];assert.equal(pins.length,2);
 for(const [,name,raw]of pins){const shape=JSON.parse(raw.replaceAll("''","'"));assert.deepEqual(shape.indexes,[...shape.indexes].sort(),name);assert.deepEqual(shape.constraints.map(c=>c.name),shape.constraints.map(c=>c.name).sort(),name);assert.ok(shape.columns.some(c=>c.name==='release_sha'&&c.notnull));}
 assert.throws(()=>buildNativeEmploymentChangeQa({serverMajor:16}),/17|18|major|version/i);
});

test('proposal status, review and eligibility share one SELECT snapshot under READ COMMITTED',()=>{
 const statements=splitPostgresStatements(sql),detail=statements.find(s=>s.includes('CREATE OR REPLACE FUNCTION public.native_employment_change_proposal_v1(')),summary=statements.find(s=>s.includes('CREATE OR REPLACE FUNCTION public.native_employment_change_summary_v1('));
 assert.match(summary,/LANGUAGE sql STABLE/);
 assert.match(detail,/SELECT public\.native_employment_change_summary_v1\(c,p\),\s*\(SELECT jsonb_build_object\([\s\S]*?FROM public\.native_employment_change_review r WHERE r\.proposal_id=p\.id\)\s*INTO summary_value,review_value;/);
 const result=detail.slice(detail.indexOf(' RETURN jsonb_build_object'));
 assert.match(result,/'proposal',summary_value\|\|jsonb_build_object/);
 assert.doesNotMatch(result,/native_employment_change_summary_v1|SELECT|FROM public\.native_employment_change_review/);
 const qa=buildNativeEmploymentChangeQa({serverMajor:17});assert.match(qa.sql,/coherent pending status/);assert.match(qa.sql,/coherent decided status/);
});
