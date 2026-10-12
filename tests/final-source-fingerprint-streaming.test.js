import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publishedCoreProjection,streamedFinalFingerprintQuery,finalSourceStreamingFingerprintDefinition,STREAMED_FINAL_ENTITIES} from '../scripts/lib/final-source-fingerprint-streaming.mjs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('streaming uses the published projection, including exact decimals and NULLs',()=>{
 const monthly=publishedCoreProjection(read,'core/payrollMonthly'),moves=publishedCoreProjection(read,'core/movements');
 assert.match(monthly,/trim_scale\(f\.net_payable\)::text/);
 assert.match(monthly,/trim_scale\(f\.quantity_sum\)::text/);
 assert.match(moves,/trim_scale\(m\.quantity\)::text/);
 assert.ok(!/round\(|coalesce\([^)]*quantity/i.test(monthly+moves));
 assert.match(monthly,/JOIN public\.employment_contract c ON c\.id=f\.employment_contract_id/);
 assert.match(moves,/m\.source_system='GRH'/);
});
test('both delta layers retain removal, replacement and addition precedence',()=>{
 for(const entity of STREAMED_FINAL_ENTITIES){
  const sql=streamedFinalFingerprintQuery(read,entity);
  assert.equal((sql.match(/UNION ALL/g)||[]).length,2);
  assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.grh_core_source_delta/);
  assert.equal((sql.match(/NOT EXISTS\(SELECT 1 FROM public\.grh_final_source_delta/g)||[]).length,2);
  assert.equal((sql.match(/operation IN\('add','replace'\)/g)||[]).length,2);
  assert.match(sql,/string_agg\(md5\(r\.row_key\|\|r\.record::text\),'' ORDER BY r\.row_key\)/);
  assert.ok(!/LIMIT|OFFSET|BETWEEN|\bNOWAIT\b/.test(sql));
 }
});
test('unsupported entities use the original complete fingerprint and missing revisions remain rejected',()=>{
 const sql=finalSourceStreamingFingerprintDefinition(read);
 assert.match(sql,/SELECT \* INTO STRICT selected_revision/);
 assert.match(sql,/ELSE RETURN public\.grh_final_source_fingerprint_v1\(p_revision,p_entity,false\)/);
 assert.match(sql,/SECURITY DEFINER\s+SET search_path=pg_catalog,public,pg_temp/);
 assert.equal((sql.match(/INTO result/g)||[]).length,2);
 assert.ok(!sql.includes('$1'));
});
test('changed published projection and unsupported names stop generation',()=>{
 assert.throws(()=>publishedCoreProjection(read,'core/anything'),/STREAMED_ENTITY_INVALID/);
 assert.throws(()=>publishedCoreProjection(path=>read(path).replace("ELSIF p_entity='movements'","ELSIF p_entity='changed'"),'core/movements'),/STREAMED_PROJECTION_ANCHOR_CHANGED/);
});
