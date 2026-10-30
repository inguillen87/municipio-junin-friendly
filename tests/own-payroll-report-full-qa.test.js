import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {composeOwnReportFullQaSources,createOwnReportFullPsqlQa} from '../scripts/lib/own-payroll-report-full-qa.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),lf=s=>s.replace(/\r\n?/g,'\n');
const sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'b'.repeat(32);let cached;
const plan=()=>cached??=composeOwnReportFullQaSources({read,sourceCommit,schema});
const literal=phase=>/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(phase)[0];
const items=phase=>JSON.parse(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(phase)[1].replaceAll("''","'"));

test('the old six-person UI fixture gets the complete source201 epoch, with eleven exact source predecessors and whole inverse',()=>{
 const p=plan(),original=lf(read('scripts/migrations/201-own-full-payroll-decision-capacity.sql'));
 assert.equal(p.version,'own-report-six-person-full-fixture.v1');assert.equal(p.authorityFixture,'existing-synthetic-capabilities');assert.equal(p.institutionalAuthority200Proven,false);assert.equal(p.newSeedCount,0);assert.equal(p.newDatabaseCount,0);
 assert.equal(p.preLocal.length,11);assert.equal(p.postLocal.length,27);assert.equal(p.inheritedFullFunctions,16);assert.equal(p.prerequisites.length,19);
 const rawPre=original.slice(original.indexOf('DO $capacity_preflight$'),original.indexOf('END $capacity_preflight$;')+'END $capacity_preflight$;'.length),rawPost=original.slice(original.indexOf('DO $capacity_postflight$'));
 assert.deepEqual(items(rawPre).map(p=>p.name),p.preLocal.map(p=>p.name));
 // Fixed known source epochs: old125 snapshot and old125 detail are not accepted
 // merely because their names match, nor are the four146/census200 omitted.
 const expected={own_liquidation_detail_v1:'806b3743cfb193dbc96de8ea9924f348854f484cde1a255d1d195e41f7668ded',own_annul_detail_v1:'a0ac76f463360ad15daec6aa8b6f21e28c241bec48c5d45048140519eb1cabe0',own_annul_attempt_v1:'f09145af9a84cd88483b2c8cef3df711cc7328775798e2977a1d487f6d1e4a8d',own_annul_command_v1:'a8f41f70ef76c9266348721fa531b78e115c793921491b35ace436737b16c92f',own_close_detail_v1:'cf59ba377c978346872f88d3dfd144fac13d7c0615ec0ed289839451513b540f',own_close_attempt_v1:'4a0b209001ef38f926e6fc36109820298fd041150ee28b1ae5824225c7858e25',own_close_group_v1:'a3ce164f8ec9ebe298c76d4b9d88967f3add104457df7ca07f47d605faa75a86',own_close_command_v1:'eb3df3a03688835055b365ff58961f677210987e523ce973c9fa3441e5c30b94',own_close_snapshot_v1:'11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0',own_annul_selected_v1:'e191fd94787a93e809e79b97d751b1c9c9371833eb7275fe4d3c272eceeadd31',own_close_report_census_v1:'16b0b8faa8016cac5d70d8c34d5e303567ec84686af2f63fbc3cef51a1216f2c'};
 assert.deepEqual(Object.fromEntries(items(rawPre).map(p=>[p.name,p.bodySha256])),expected);
 // This is the real177 detail epoch, not jurisdiction144 or raw125. Its
 // native-only branch uses exact177 helpers and the complete source table.
 const unrelocate=s=>s.replaceAll(schema+'.','public.').replaceAll(`SET search_path=pg_catalog,${schema},public,pg_temp`,'SET search_path=pg_catalog,public,pg_temp');
 const prerequisites=p.prerequisites.map(unrelocate),source177=lf(read('scripts/migrations/177-own-period-classification.sql'));
 assert.deepEqual(p.nativePeriodReadClosure,['own_period_classification_configuration_v1','own_period_classification_current_v1','own_period_classification_resolve_v1','own_period_classification_close_match_v1']);
 for(const name of [...p.nativePeriodReadClosure,'own_period_classification_immutable_v1']){
  const found=prerequisites.filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(found.length,1);assert.ok(source177.includes(found[0]+';'),'exact source177 body/header must be emitted');
 }
 const detail=prerequisites.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_close_detail_v1('));
 assert.match(detail,/PERFORM public\.own_period_classification_close_match_v1\(ctx,c,/);
 assert.equal(p.periodClassificationWritersInstalled,0);
 assert.ok(prerequisites.some(s=>s.startsWith('CREATE TABLE public.own_period_classification_event(')&&source177.includes(s+';')));
 assert.ok(prerequisites.some(s=>s.includes('REPORT_FULL_QA_PERIOD_FIXTURE_NOT_EMPTY')));
 assert.ok(!prerequisites.some(s=>/^CREATE FUNCTION public\.own_period_classification_(?:command|bootstrap|detail|attempt)_v1\(/.test(s)));
 assert.ok(!prerequisites.some(s=>/^GRANT /.test(s)));

 const census=p.preLocal.find(p=>p.name==='own_close_report_census_v1');let restored=p.local201;
 restored=restored.replace(literal(p.beforeGuard),literal(rawPre)).replace(literal(p.afterGuard),literal(rawPost));
 assert.equal(restored.split(census.bodySha256).length,2);restored=restored.replace(census.bodySha256,expected.own_close_report_census_v1);
 restored=restored.replaceAll(schema+'.','public.').replaceAll(`SET search_path=pg_catalog,${schema},public,pg_temp`,'SET search_path=pg_catalog,public,pg_temp').replaceAll("'"+schema+"'::regnamespace","'public'::regnamespace");
 assert.equal(restored,original,'fixture must preserve the ENTIRE SQL201; metadata hashes derive only from relocated source');
 assert.equal(p.installation[1],p.local201);assert.match(p.installation[0],/rows_value.*functions.*defaultAcl/s);assert.match(p.installation[2],/rows_value.*functions.*defaultAcl/s);assert.match(p.installation[3],/M7_190_PRIOR_STATE_CHANGED/);
 assert.equal(p.prerequisites[0].replaceAll(schema+'.','public.').replaceAll(`SET search_path=pg_catalog,${schema},public,pg_temp`,'SET search_path=pg_catalog,public,pg_temp'),lf(read('scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql')));
 assert.equal(p.prerequisites.at(-1).replaceAll(schema+'.','public.').replaceAll(`SET search_path=pg_catalog,${schema},public,pg_temp`,'SET search_path=pg_catalog,public,pg_temp'),lf(read('scripts/migrations/200-own-payroll-report-census.sql')));
});

test('fixture source admission rejects a changed201 or changed private jurisdiction source before any composition',()=>{
 for(const file of['scripts/migrations/201-own-full-payroll-decision-capacity.sql','scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql','scripts/migrations/177-own-period-classification.sql','scripts/lib/own-period-classification-installation.mjs']){
  assert.throws(()=>composeOwnReportFullQaSources({read:p=>p===file?read(p)+'\n-- foreign change':read(p),sourceCommit,schema}),/REPORT_FULL_QA_SOURCE_CHANGED/);
 }
 assert.throws(()=>composeOwnReportFullQaSources({read,sourceCommit,schema:'public'}));
});

test('the synthetic driver sends each literal FULL reader to that same real function and preserves legacy routing',async()=>{
 const calls=[],legacy=[],sentinel={source:'real full SQL dispatch only; no SQL executed in this test'};
 const base={query:async(text,values)=>{if(/_full_v1|report_census/.test(text))throw Error('unknown-full');legacy.push({text,values});return[{result:'legacy'}];},run:async(statement,runtime)=>{calls.push({statement,runtime});return sentinel;}};
 const db=createOwnReportFullPsqlQa({schema},{createClose:()=>base});
 const exact=[['SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result',['{}','2026-10','monthly']],['SELECT public.own_close_group_full_v1($1::jsonb,$2::uuid) AS result',['{}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],['SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result',['{}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']]];
 for(const [text,values]of exact){assert.deepEqual(await db.query(text,values),[{result:sentinel}]);const observed=calls.at(-1);assert.equal(observed.runtime,true);assert.ok(observed.statement.includes(text.match(/public\.([a-z0-9_]+)/)[1]+'('));assert.ok(!/public\.own_|\$[123]/.test(observed.statement));}
 assert.equal(calls.length,3);assert.equal(legacy.length,0);
 await assert.rejects(db.query(exact[0][0],['{}','2026-10']));assert.equal(calls.length,3);
 await assert.rejects(db.query('SELECT public.own_close_group_full_v1($1::jsonb,$2::text) AS result',exact[1][1]),/unknown-full/);assert.equal(calls.length,3);
 const legacyText='SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result';assert.deepEqual(await db.query(legacyText,exact[1][1]),[{result:'legacy'}]);assert.equal(legacy[0].text,legacyText);assert.equal(calls.length,3);
});
