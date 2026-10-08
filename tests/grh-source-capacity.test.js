import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceCapacity,readSourceCapacity,SOURCE_CAPACITY_QUERY} from '../scripts/lib/grh-source-capacity.mjs';
const budget={maximumDatabaseBytes:536870912,reserveBytes:16777216,maximumGrowthBytes:25165824};
const finalBudget={...budget,maximumDatabaseBytes:1073741824};

test('the live Neon limit admits the reviewed 1 GiB ceiling without dropping reserve or growth',()=>{
 const r=sourceCapacity({database_bytes:String(470*1024*1024),cluster_bytes:String(490*1024*1024),
  neon_project_id:'synthetic-project',enforced_limit_bytes:'1073741824'},finalBudget);
 assert.equal(r.maximumBytes,1073741824);assert.equal(r.reserveBytes,16777216);
 assert.equal(r.requiredGrowthBytes,25165824);assert.equal(r.fits,true);
 assert.match(SOURCE_CAPACITY_QUERY,/current_setting\('neon\.max_cluster_size'/);
 assert.match(SOURCE_CAPACITY_QUERY,/pg_size_bytes/);
});

test('a smaller provider limit narrows the budget and an increased provider limit cannot widen it',()=>{
 const snapshot={database_bytes:String(470*1024*1024),cluster_bytes:String(490*1024*1024),
  neon_project_id:'synthetic-project',enforced_limit_bytes:String(512*1024*1024)};
 assert.equal(sourceCapacity(snapshot,finalBudget).fits,false);
 assert.equal(sourceCapacity(snapshot,finalBudget).maximumBytes,536870912);
 assert.equal(sourceCapacity({...snapshot,enforced_limit_bytes:String(2*1024*1024*1024)},finalBudget).maximumBytes,1073741824);
 // Prior callers retain their explicitly narrower ceiling.
 assert.equal(sourceCapacity({...snapshot,enforced_limit_bytes:'1073741824'},budget).fits,false);
});

test('provider limit boundaries still count every database and retain the full reserve',()=>{
 const at=finalBudget.maximumDatabaseBytes-finalBudget.reserveBytes-finalBudget.maximumGrowthBytes;
 const snapshot={database_bytes:1000000,cluster_bytes:at,neon_project_id:'synthetic-project',enforced_limit_bytes:'1073741824'};
 assert.equal(sourceCapacity(snapshot,finalBudget).fits,true);
 assert.equal(sourceCapacity({...snapshot,cluster_bytes:at+1},finalBudget).fits,false);
 assert.equal(sourceCapacity({...snapshot,cluster_bytes:finalBudget.maximumDatabaseBytes-finalBudget.reserveBytes+1},finalBudget,0).fits,false);
});

for(const limit of [null,undefined,'0','-1','1GB','9007199254740992','not-a-limit'])test('missing or malformed Neon limit fails closed: '+String(limit),()=>{
 assert.throws(()=>sourceCapacity({database_bytes:'1000000',cluster_bytes:'4000000',
  neon_project_id:'synthetic-project',enforced_limit_bytes:limit},finalBudget),/GRH_VERSION_CAPACITY_INVALID/);
});

test('standalone PostgreSQL keeps the explicit application budget without a Neon setting',()=>{
 assert.equal(sourceCapacity({database_bytes:'1000000',cluster_bytes:'4000000',
  neon_project_id:null,enforced_limit_bytes:null},finalBudget).maximumBytes,1073741824);
});
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
