import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeLeaveQa} from '../scripts/verify-native-leave-sql.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const migration=fs.readFileSync(new URL('../scripts/migrations/111-native-leave-workflow.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
for(const serverMajor of [17,18])test('QA nativa PG'+serverMajor+' conserva los controles anteriores y sólo acepta base descartable',()=>{
 const qa=buildNativeLeaveQa({serverMajor,requireConcurrency:true});
 assert.match(qa.sql,/current_database\(\)<>'native_employment_lifecycle_qa'/);assert.match(qa.sql,/neon\.project_id/);assert.match(qa.sql,/ROLLBACK;\s*$/);assert.match(qa.sql,new RegExp('server_version_num.*?<>'+serverMajor));
 assert.equal(qa.report.lifecycleChecksPassed,49);assert.ok(qa.report.nativeLeaveChecksPassed>=37);assert.equal(qa.report.migration111Sha256,createHash('sha256').update(migration).digest('hex'));assert.match(qa.sql,/native-only employee starts with no invented/);assert.match(qa.sql,/same key never acknowledges different dates/);assert.match(qa.sql,/every original canonical employee column is preserved/);assert.match(qa.sql,/RESTORE_LEAVE_FIXTURES/);assert.match(qa.sql,/CREATE FUNCTION qa_leave_input\(actor jsonb,target uuid/);assert.doesNotMatch(qa.sql,/target_id_placeholder|undefined/);assert.doesNotMatch(qa.sql,/INSERT\s+INTO\s+public\./i);assert.match(qa.lockSql,/native-employment-lifecycle:v1:/);
});
test('111 sólo crea el libro propio y tres fachadas; no toca nómina, datos anteriores ni permisos IAM',()=>{
 const defs=splitPostgresStatements(migration).filter(s=>/^CREATE FUNCTION public\.native_leave_/.test(s));assert.equal(defs.length,16);assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION|UPDATE public\.|DELETE FROM public\.|INSERT INTO public\.(?!native_leave_event)/);assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/BEFORE UPDATE OR DELETE OR TRUNCATE/);assert.match(migration,/NATIVE_LEAVE_ALREADY_INSTALLED/);
 const grant=/GRANT EXECUTE ON FUNCTION ([\s\S]+?) TO municontrol_actions_runtime_app;/.exec(migration)[1];assert.deepEqual([...grant.matchAll(/public\.(native_leave_\w+)\(/g)].map(m=>m[1]).sort(),['native_leave_attempt_v1','native_leave_bootstrap_v1','native_leave_command_v1']);assert.match(migration,/action_center_tenant_actor_authorized\(/);assert.match(migration,/native_employment_lifecycle_state_v1/);assert.doesNotMatch(migration,/current_setting\([^)]*(allow|bypass)/i);
});
