import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceCapacity,readSourceCapacity,SOURCE_CAPACITY_QUERY} from '../scripts/lib/grh-source-capacity.mjs';
const budget={maximumDatabaseBytes:536870912,reserveBytes:16777216,maximumGrowthBytes:25165824};
test('source writer includes other databases and templates, not just the operational database',()=>{
 const r=sourceCapacity({database_bytes:'493903872',cluster_bytes:'516833280'},budget);
 assert.equal(r.afterReserveBytes,3260416);assert.equal(r.fits,false);assert.equal(r.scope,'all_databases_including_templates');
 assert.match(SOURCE_CAPACITY_QUERY,/sum\(pg_database_size\(oid\)\)/);assert.doesNotMatch(SOURCE_CAPACITY_QUERY,/datallowconn|WHERE/i);
});
test('exact boundary preserves reserve with no inferred disk savings',()=>{
 const at=budget.maximumDatabaseBytes-budget.reserveBytes-budget.maximumGrowthBytes;
 assert.equal(sourceCapacity({database_bytes:300000000,cluster_bytes:at},budget).fits,true);
 assert.equal(sourceCapacity({database_bytes:300000000,cluster_bytes:at+1},budget).fits,false);
 assert.equal(sourceCapacity({database_bytes:300000000,cluster_bytes:516833280},budget,0).fits,true);
});
for(const snapshot of [{database_bytes:'10'},{database_bytes:'20',cluster_bytes:'19'},{database_bytes:'1',cluster_bytes:'-1'},{database_bytes:'1',cluster_bytes:'1e8'},{database_bytes:'1',cluster_bytes:'9007199254740992'},{database_bytes:'0',cluster_bytes:'0'}])test('invalid capacity fails closed '+JSON.stringify(snapshot),()=>assert.throws(()=>sourceCapacity(snapshot,budget)));
test('capacity reader needs exactly one authoritative result',async()=>{
 let calls=0;const c={query:async sql=>{calls++;assert.equal(sql,SOURCE_CAPACITY_QUERY);return{rows:[{database_bytes:'300000000',cluster_bytes:'330000000'}]};}};
 assert.equal((await readSourceCapacity(c,budget)).fits,true);assert.equal(calls,1);
 await assert.rejects(readSourceCapacity({query:async()=>({rows:[]})},budget));
});
test('restore repair changes only search_path with exact prerequisite and postflight guards',()=>{
 const sql=fs.readFileSync('scripts/migrations/075-restore-safe-identity-functions.sql','utf8');
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|TRUNCATE|INSERT INTO|CREATE OR REPLACE FUNCTION)\b/i);
 assert.match(sql,/RESTORE_IDENTITY_PREREQUISITE_DRIFT/);assert.match(sql,/to_jsonb\(original\)-'proconfig'/);
 assert.match(sql,/ALTER FUNCTION public.is_valid_cuil\(text\) SET search_path TO pg_catalog,public,pg_temp/);
 assert.match(sql,/ALTER FUNCTION public.normalize_digits\(text\) SET search_path TO pg_catalog,public,pg_temp/);
});
