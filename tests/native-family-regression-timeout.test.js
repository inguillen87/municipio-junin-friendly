// Synthetic text only; extract the actual pure adapter without importing any runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('the actual family195 timeout adapter handles the inherited180s header and rejects drift or duplication',()=>{
 const source=fs.readFileSync(new URL('../scripts/verify-native-family-self-sql.mjs',import.meta.url),'utf8');
 const match=/export function nativeFamilyRegressionTimeout\(sql\)\{\n[\s\S]*?\n\}/.exec(source);
 assert.ok(match,'real adapter source missing');
 const adapt=vm.runInNewContext(match[0].replace(/^export /,'')+';nativeFamilyRegressionTimeout',{assert});
 const inherited="BEGIN; SET LOCAL statement_timeout='180s'; SET LOCAL lock_timeout='2s'; DO $qa$ BEGIN RAISE NOTICE 'fictional710'; END $qa$; ROLLBACK;";
 const transformed=adapt(inherited);
 assert.equal(transformed,inherited.replace("statement_timeout='180s'","statement_timeout='300s'"));
 assert.equal(transformed.replace("statement_timeout='300s'","statement_timeout='180s'"),inherited,'all other guard/check/rollback bytes stay exact');
 for(const changed of [inherited.replace("'180s'","'90s'"),inherited.replace("'180s'","'179s'"),inherited+"SET LOCAL statement_timeout='180s';"])
  assert.throws(()=>adapt(changed),/FAMILY195_REGRESSION_TIMEOUT_DRIFT/);
});


test('family195 concurrency holder covers the full actual statement budget and preserves exact finish protocol',()=>{
 const source=fs.readFileSync(new URL('../scripts/verify-native-family-self-sql.mjs',import.meta.url),'utf8');
 const main=/export function nativeFamilyRegressionTimeout\(sql\)\{\n[\s\S]*?\n\}/.exec(source);assert.ok(main,'actual statement adapter');
 const helper=/export function nativeFamilyRegressionLockTimeout\(sql\)\{\n[\s\S]*?\n\}/.exec(source);
 const composition=source.split(/\r?\n/).filter(line=>line.startsWith(' const lockSql='));assert.equal(composition.length,1,'actual holder composition');
 const context={assert};
 const render=vm.runInNewContext((helper?helper[0].replace(/^export /,'')+';':'')+'(function(requireConcurrency,base,lock){'+composition[0]+'return lockSql;})',context);
 const adaptMain=vm.runInNewContext(main[0].replace(/^export /,'')+';nativeFamilyRegressionTimeout',context);
 const inherited=" BEGIN;\n DO $pins$ BEGIN IF false THEN RAISE EXCEPTION 'SYNTHETIC_DESTINATION_GUARD'; END IF; END $pins$;\n SELECT pg_advisory_xact_lock(hashtextextended('synthetic-catalog-target',0));\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY' AS readiness;\n DO $hold$ DECLARE deadline timestamptz:=clock_timestamp()+interval '210 seconds'; BEGIN LOOP IF NOT pg_try_advisory_lock(hashtextextended('synthetic-finish-key',0)) THEN EXIT; END IF; PERFORM pg_advisory_unlock(hashtextextended('synthetic-finish-key',0)); IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'CATALOG_QA_MAIN_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP; END $hold$;\n ROLLBACK;\n";
 const lock="hashtextextended('synthetic-family-key',0)",current=render(true,{lockSql:inherited},lock);
 const statementSeconds=Number(/statement_timeout='([0-9]+)s'/.exec(adaptMain("SET LOCAL statement_timeout='180s'"))[1]);
 const holderSeconds=Number(/interval '([0-9]+) seconds'/.exec(current)[1]);
 assert.equal(statementSeconds,300,'the complete710 statement keeps the established 300 s budget');
 assert.equal(holderSeconds,statementSeconds+30,'holder must retain the inherited 30 s completion margin for every accepted statement duration');
 assert.ok(236<holderSeconds,'observed 214 s / 236 s failure windows remain inside the holder budget');
 const originalWithFamilyLock=inherited.replace(" SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'"," SELECT pg_advisory_xact_lock("+lock+");\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'");
 assert.equal(current.replace("interval '330 seconds'","interval '210 seconds'"),originalWithFamilyLock,'every exact inherited guard, lock, finish key, polling interval and rollback byte is preserved');
 assert.equal(render(false,{lockSql:inherited},lock),inherited,'no concurrency branch remains byte exact');
 const catalog=fs.readFileSync(new URL('../scripts/verify-native-employment-catalog-sql.mjs',import.meta.url),'utf8');
 assert.equal(catalog.split("interval '210 seconds'").length,2,'shared catalogue holder budget is unchanged');
 assert.ok(helper,'explicit profile-only adapter required');
 const adapt=vm.runInNewContext(helper[0].replace(/^export /,'')+';nativeFamilyRegressionLockTimeout',context);
 for(const value of[inherited.replace("interval '210 seconds'","interval '209 seconds'"),inherited+" interval '210 seconds'",inherited.replace("interval '210 seconds'","interval '330 seconds'")])assert.throws(()=>adapt(value),/FAMILY195_REGRESSION_LOCK_TIMEOUT_DRIFT/);
 for(const value of[null,undefined,23,{}])assert.throws(()=>adapt(value),/FAMILY195_REGRESSION_LOCK_TIMEOUT_INPUT/);
});
