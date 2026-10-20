// Filesystem/source contracts only. SQL files are read as bytes, never imported/executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {imputationFullCapacityEpochProjection as p} from './fixtures/own-imputation-full-capacity-epoch-source-projection.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
function definition(source,name){const markers=['CREATE FUNCTION public.'+name+'(','CREATE OR REPLACE FUNCTION public.'+name+'('],hits=markers.map(marker=>source.indexOf(marker)).filter(n=>n>=0);assert.equal(hits.length,1,'one source definition '+name);const a=hits[0],b=source.indexOf('AS $$',a)+5,e=source.indexOf('$$;',b);assert.ok(b>a&&e>b);return {text:source.slice(a,e+3),body:source.slice(b,e),header:source.slice(a,b)};}
const pins=source=>source.split("jsonb_array_elements('").slice(1).map(part=>JSON.parse(part.slice(0,part.indexOf("'::jsonb)")).replaceAll("''","'")));

test('203 predecessor pins admit all five known205 successors and preserve its bootstrap/attempt definitions',()=>{
 const predecessor=read(p.predecessorPath);assert.equal(hash(predecessor),p.predecessorSha256);const [pre,post]=pins(read(p.sqlPath)),[,expected]=pins(predecessor);assert.equal(pre.length,23);assert.equal(post.length,29);
 for(const name of p.changedFiveNames){const actual=pre.find(v=>v.name===name),known=expected.find(v=>v.name===name);assert.deepEqual(actual,known,'post205 predecessor '+name);if(['own_imputation_bootstrap_v1','own_imputation_attempt_v1'].includes(name))assert.deepEqual(post.find(v=>v.name===name),known);}
});

test('three capacity cores reconstruct the entire205 definitions and keep the exact preparer context',()=>{
 const source=read(p.sqlPath),predecessor=read(p.predecessorPath);
 for(const item of p.coreRebuilds){const current=definition(source,item.coreName),before=definition(predecessor,item.legacyName);assert.equal(hash(before.text),item.predecessor205DefinitionSha256);assert.equal(current.header,item.coreHeader);let restored=current.body;for(const delta of [...item.bodyTextDeltas].reverse()){assert.equal(restored.split(delta.after).length,2);restored=restored.replace(delta.after,()=>delta.before);}assert.equal(item.predecessorHeader+restored+'$$;',before.text,'complete205 definition '+item.legacyName);assert.ok(current.body.includes('ctx:=public.own_run_context_v1(p,true,false);'));assert.ok(!current.body.includes('ctx:=public.own_close_context_v1(p,true);'));}
});

test('both epochs pin exact defaults false,false for run/close and empty for all zero-default functions',()=>{
 const source=read(p.sqlPath),arrays=pins(source);assert.equal(arrays.length,2);
 for(const list of arrays)for(const value of list){const context=['own_run_context_v1','own_close_context_v1'].includes(value.name);assert.equal(value.defaults,context?2:0,value.name);assert.equal(value.defaultExpressions,context?'false, false':'',value.name);}
 const guard="coalesce(pg_get_expr(actual.proargdefaults,0),'') IS DISTINCT FROM expected->>'defaultExpressions'";assert.equal(source.split(guard).length-1,2);
});

test('capacity/writer behavior remains exactR1 apart from205 context; four147 helpers retain their source',()=>{
 const source=read(p.sqlPath),old147=read('scripts/migrations/147-own-payroll-accounting-mappings.sql'),[pre,post]=pins(source);
 for(const item of p.coreRebuilds){const d=definition(source,item.coreName);assert.equal(d.body.split('ctx:=public.own_run_context_v1(p,true,false);').length,2);const r1=d.text.replace('ctx:=public.own_run_context_v1(p,true,false);','ctx:=public.own_close_context_v1(p,true);');assert.equal(hash(r1),item.r1CoreDefinitionSha256,'whole capacity behavior '+item.coreName);assert.ok(d.body.includes('maximum_bytes IS NULL OR maximum_bytes NOT IN(16777216,33554432)'));}
 for(const name of p.accountingHelpers147){const body=definition(old147,name).body;assert.equal(pre.find(v=>v.name===name).bodySha256,hash(body));assert.deepEqual(pre.find(v=>v.name===name),post.find(v=>v.name===name));}
 assert.equal((source.match(/INSERT INTO public\.own_payroll_imputation_event\(/g)??[]).length,1);assert.ok(source.includes("source_value:='null';allocation_value:='null';"));assert.ok(source.includes("IF maximum_bytes=33554432 AND cmd='propose' THEN"));assert.ok(source.includes('public.own_imputation_detail_capacity_core_v2(p,pid,maximum_bytes)'));assert.ok(source.includes('coalesce(actual.proacl,acldefault'));assert.ok(source.includes("(to_jsonb(actual)-'prosrc') IS DISTINCT FROM(prior-'prosrc')"));
});
