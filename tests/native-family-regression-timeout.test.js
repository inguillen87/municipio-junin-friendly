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
