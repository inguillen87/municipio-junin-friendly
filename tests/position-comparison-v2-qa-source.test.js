import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {comparisonV2LegacyClosure,comparisonV2LegacySourcePins,comparisonV2LegacyRpcSignatures,renderComparisonV2LegacyRpc} from '../scripts/lib/position-comparison-v2-qa-source.mjs';
import {program} from './fixtures/own-payroll-program-synthetic.js';

const read=name=>fs.readFileSync(new URL('../scripts/migrations/'+name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const participation=()=>read('157-own-period-participation.sql'),comparison=()=>read('198-own-position-comparison-v2.sql');
const schema='mc_qa_fixed_092_'+'a'.repeat(32),uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const context=()=>({actorEmail:'qa.public.o\'neil\\fixture@local.invalid',actorSessionId:uid(1),actorSessionVersion:2,membershipId:uid(2),releaseSha:'b'.repeat(40),tenantId:uid(3)});
const [annual,detail]=comparisonV2LegacyRpcSignatures();
const values=()=>[JSON.stringify(context()),2026,1,'2026-10','monthly'];

test('legacy157 closure copies only three original pure definitions and private revokes',()=>{
 const source=participation(),v2=comparison(),projected=comparisonV2LegacyClosure(source,v2),parts=splitPostgresStatements(projected.participationSql);
 const originals=splitPostgresStatements(source);
 assert.equal(parts.length,6);assert.equal(projected.helpers.length,3);
 for(const [index,name]of projected.helpers.entries()){
  assert.equal(parts[index],originals.find(s=>s.startsWith('CREATE FUNCTION public.'+name+'(')));
  assert.match(parts[index+3],new RegExp('^REVOKE ALL ON FUNCTION public\\.'+name+'\\('));
 }
 assert.equal(projected.comparisonSql,v2);assert.deepEqual(projected.sourceSha256,comparisonV2LegacySourcePins);
 assert.doesNotMatch(projected.participationSql,/CREATE (?:TABLE|TRIGGER)|GRANT EXECUTE|own_participation_policy_v1\(/);
});

test('changed157 or198 source stops before any projection',()=>{
 for(const [one,two]of [[participation()+'\n',comparison()],[participation(),comparison()+'\n']])assert.throws(()=>comparisonV2LegacyClosure(one,two),/SOURCE_CHANGED/);
});

test('the original legacy programme is retained without participation or new day sources',()=>{
 const original=program(),before=JSON.stringify(original);comparisonV2LegacyClosure(participation(),comparison());
 assert.equal(JSON.stringify(original),before);
 for(const key of ['periodParticipation','monthlyDaysVersion','monthlyDayDeclarationVersion','workingTimeVersion'])assert.equal(Object.hasOwn(original,key),false);
});

test('the V2 allowlist has only two exact public signatures and no private helpers',()=>{
 assert.deepEqual(comparisonV2LegacyRpcSignatures(),[
  'SELECT public.position_comparison_annual_v2($1::jsonb,$2::integer) AS result',
  'SELECT public.position_comparison_detail_v2($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result'
 ]);
 for(const unknown of [detail+';',detail.replace('_v2','_v3'),detail.replace('::integer','::text'),detail.replace('public.','other.'),'SELECT public.position_comparison_positions_v2($1::jsonb,$2::uuid) AS result','SELECT public.position_comparison_annual_value_v2($1::jsonb,$2::integer) AS result'])assert.equal(renderComparisonV2LegacyRpc(unknown,values(),schema),null);
});

test('opaque JSON argument bytes survive exact V2 rendering with SQL quote escaping only',()=>{
 const raw=JSON.stringify(context(),null,2),args=[raw,2026,1,'2026-10','monthly'],before=JSON.stringify(args),sql=renderComparisonV2LegacyRpc(detail,args,schema);
 assert.equal(JSON.stringify(args),before);assert.ok(sql.includes("'"+raw.replaceAll("'","''")+"'::jsonb"));
 assert.ok(sql.includes('qa.public.'));assert.ok(sql.includes('\\\\fixture'));
 assert.match(sql,/^SET LOCAL standard_conforming_strings=on; DO \$comparison_v2_strings\$/);
 assert.match(sql,/current_setting\('standard_conforming_strings'\) IS DISTINCT FROM 'on'/);
 assert.ok(sql.endsWith("2026'::integer,'1'::integer,'2026-10'::text,'monthly'::text) AS result"));
});

test('annual and detail admit integer years only and retain original synthetic session fields',()=>{
 assert.match(renderComparisonV2LegacyRpc(annual,values().slice(0,2),schema),/\.position_comparison_annual_v2\(/);
 for(const invalid of ['2026',null,1899,2100,2026.1]){const args=values();args[1]=invalid;assert.throws(()=>renderComparisonV2LegacyRpc(detail,args,schema),/YEAR_REQUIRED/);}
 for(const mutate of [v=>delete v.membershipId,v=>v.extra='public.value',v=>v.actorEmail='nominal@example.com',v=>v.actorSessionVersion=0,v=>v.releaseSha='a'.repeat(39)]){
  const ctx=context();mutate(ctx);const args=values();args[0]=JSON.stringify(ctx);assert.throws(()=>renderComparisonV2LegacyRpc(detail,args,schema));
 }
});

test('V2 malformed schema, arity, revisions, periods and types fail before a DB call',()=>{
 assert.throws(()=>renderComparisonV2LegacyRpc(detail,values(),'public'),/SCHEMA_REQUIRED/);
 assert.throws(()=>renderComparisonV2LegacyRpc(detail,values().slice(0,4),schema),/ARGUMENTS_REQUIRED/);
 for(const [index,value]of [[2,'1'],[2,0],[2,1001],[3,'2025-10'],[3,'2026-13'],[4,'all']]){const args=values();args[index]=value;assert.throws(()=>renderComparisonV2LegacyRpc(detail,args,schema));}
});
