import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNativeEmploymentCatalogQa} from '../scripts/verify-native-employment-catalog-sql.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replaceAll('\r\n','\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const serverMajor of [17,18])test('real catalog SQL targets disposable PG'+serverMajor+' with independent lock and rollback',()=>{
 const qa=buildNativeEmploymentCatalogQa({serverMajor,requireConcurrency:true});
 assert.ok(qa.report.catalogChecksPassed>=75);assert.equal(qa.report.catalogConcurrentLockChecked,true);
 assert.match(qa.sql,/current_database\(\)<>'native_employment_catalog_qa'/);assert.match(qa.sql,/neon\.project_id/);
 assert.match(qa.sql,new RegExp('server_version_num.*?<>'+serverMajor));assert.match(qa.sql,/ROLLBACK_NATIVE|RESTORE_CATALOG_FIXTURES/);assert.match(qa.sql,/ROLLBACK;\s*$/);
 assert.match(qa.sql,/native creation shares the publication lock/);assert.match(qa.sql,/historical hire receipts/);assert.match(qa.sql,/same canonical person cannot approve/);
 assert.match(qa.lockSql,/FIXED_NOVELTIES_QA_LOCK_READY/);assert.match(qa.lockSql,/native-employment-catalog:v1:/);assert.match(qa.lockSql,/pg_try_advisory_lock/);assert.doesNotMatch(qa.sql,/INSERT\s+INTO\s+public\./i);
 assert.equal(qa.report.migration103Sha256,hash(read('scripts/migrations/103-native-employment-catalog.sql')));
});
test('catalog fallback is the exact reviewed effective099 body, not reconstructed original067',()=>{
 const fixture=JSON.parse(read('tests/fixtures/native-employee-catalog-installed-099.json'));
 assert.equal(hash(fixture.beforeBody),'3171c85ce0be1067feebb34aa081c19de15714e986b2ca82233811ef86efb5d6');
 assert.equal(hash(fixture.body),'bfa55ea106272fadf4655997d5a29fc57cee47cff079b1ac2672732aa579826d');
 const sql=read('scripts/migrations/103-native-employment-catalog.sql'),definition=splitPostgresStatements(sql).find(s=>s.includes('CREATE OR REPLACE FUNCTION public.native_employment_catalog_grh_v1('));
 const open=definition.indexOf('$$')+2,end=definition.lastIndexOf('$$');assert.equal(definition.slice(open,end),fixture.body);
});
test('runtime allowlist is exactly five authenticated facades and generator rejects unsupported PG',()=>{
 const migration=read('scripts/migrations/103-native-employment-catalog.sql');const grant=/GRANT EXECUTE ON FUNCTION ([\s\S]+?) TO municontrol_actions_runtime_app;/.exec(migration)?.[1];assert.ok(grant);
 const names=[...grant.matchAll(/public\.(native_employment_catalog_\w+)\(/g)].map(x=>x[1]).sort();
 assert.deepEqual(names,['attempt','bootstrap','proposal','propose','review'].map(x=>'native_employment_catalog_'+x+'_v1').sort());
 assert.doesNotMatch(migration,/CATALOG_INSTALLED_SHA|CREATE_INSTALLED_SHA|-- GRH_FALLBACK_DEFINITION/);
 assert.throws(()=>buildNativeEmploymentCatalogQa({serverMajor:16}),/17|18|version|major/i);
});
