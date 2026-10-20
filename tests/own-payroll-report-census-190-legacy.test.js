// Only pure public fixtures/models. The190 runner and200 construction are read
// as text in the wiring cases and are never imported or invoked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareOwnReportCensusLegacyFixtures,ownReportCensusLegacyFixtureSources} from './fixtures/own-payroll-report-census-legacy-synthetic.js';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const withoutPeriod=snapshot=>{const{period,...rest}=snapshot;return rest;};

test('legacy format fixtures retain valid v1/v2 envelopes in two distinct prior monthly cells',async()=>{
 const values=await prepareOwnReportCensusLegacyFixtures('2026-10');assert.equal(values.length,2);
 assert.deepEqual(values.map(value=>value.snapshot.version),['own-close-snapshot.v1','own-close-snapshot.v2']);assert.deepEqual(values.map(value=>value.snapshot.period),['2026-08','2026-09']);
 assert.equal(new Set(values.map(value=>value.id)).size,2);assert.equal(new Set(values.map(value=>value.key)).size,2);
 for(const value of values){assert.equal(value.groupId,value.id);assert.equal(value.body.groupId,null);assert.equal(value.body.command,'close');assert.equal(value.body.period,value.snapshot.period);assert.equal(value.snapshot.liquidationType,'monthly');assert.equal(value.snapshot.populationComplete,true);assert.equal(value.snapshot.employeeCount,2);assert.equal(value.snapshot.populationCount,2);assert.equal(value.replayed,false);assert.match(value.bodySha256,/^[a-f0-9]{64}$/);assert.match(value.snapshotSha256,/^[a-f0-9]{64}$/);}
 assert.ok(values[0].snapshot.employees.every(value=>!Object.hasOwn(value,'jurisdiction')&&!Object.hasOwn(value,'namespaceVersion')));
 assert.deepEqual(new Set(values[1].snapshot.employees.map(value=>value.jurisdiction.code)),new Set(['42','55']));assert.ok(values[1].snapshot.employees.every(value=>value.jurisdiction.basis==='captured_own_registration'&&/^[a-f0-9]{64}$/.test(value.jurisdiction.sourceSha256)&&!Object.hasOwn(value,'namespaceVersion')));
});

test('rekeying historical format preserves every salary value, concept, exact trace and captured jurisdiction',async()=>{
 const originals=ownReportCensusLegacyFixtureSources(),before=JSON.stringify(originals),prepared=await prepareOwnReportCensusLegacyFixtures('2026-10');
 for(let index=0;index<2;index++)assert.deepEqual(withoutPeriod(prepared[index].snapshot),withoutPeriod(originals[index].snapshot));
 assert.equal(JSON.stringify(originals),before);assert.notEqual(prepared[1].snapshotSha256,originals[1].snapshotSha256);assert.notEqual(prepared[1].bodySha256,originals[1].bodySha256);
 prepared[0].snapshot.employees.pop();assert.equal((await prepareOwnReportCensusLegacyFixtures('2026-10'))[0].snapshot.employees.length,2);
});

test('dated fixture rejects a silent month shift instead of inventing a new current programme',async()=>{
 for(const period of['2026-09','2026-11','2027-10',null,undefined])await assert.rejects(prepareOwnReportCensusLegacyFixtures(period),/CENSUS190_LEGACY_DATED_FIXTURE_REVIEW_REQUIRED/);
});

test('real190 wiring records actual current v2/v3 witnesses before the explicitly separate legacy seed',()=>{
 const source=read('scripts/lib/own-payroll-report-census-190-continuation.mjs');
 for(const witness of["assert.equal(calculated.saved.input.version,'own-payroll-input.v2')","assert.equal(calculated.saved.result.version,'own-payroll-result.v2')","assert.equal(closed.snapshot.version,'own-close-snapshot.v3')",'currentCalculationFormats:{input:calculated.saved.input.version,result:calculated.saved.result.version,closeSnapshot:closed.snapshot.version}'])assert.ok(source.includes(witness),witness);
 assert.ok(source.indexOf("h.check('M8 actual reopen changes full event fingerprint")<source.indexOf('const legacyFormats=await runOwnReportCensus190LegacyReaders('));
 assert.ok(source.includes('historicalFormatFixture:true,currentEngineProduced:false,seedRows:saved.length'));assert.ok(source.includes('formats:groups.map(value=>value.snapshot.version)'));
 for(const resource of['report-census','group'])assert.ok(source.includes("h.api('close',{query:{resource:'"+resource+"'"));
 assert.ok(source.includes("verifiedOwnReportBundle({from:'2026-08',to:'2026-09',types:['monthly']},censuses,groups)"));
});

test('source seed keeps UTC/canonical checker/FKs and exact +2 projection while every control stays installed',()=>{
 const source=read('scripts/lib/own-payroll-report-census-190-continuation.mjs'),seed=source.slice(source.indexOf(' const seed=`DO $legacy_format_seed$'),source.indexOf(' const readback=`SELECT coalesce(jsonb_agg(receipt'));
 assert.ok(seed.length>0);assert.ok(seed.includes('public.own_close_context_v1('+ '${j(qa.checker)}'+',true,true)'));
 assert.ok(source.includes('return["SET LOCAL TIME ZONE \'UTC\'",qa.normalized(seed),qa.normalized(readback)]'));
 for(const field of["'recordedAt',at_time",'snapshot_sha256,receipt,recorded_at','body_hash:=public.own_run_hash_v1(body_value)','snapshot_hash:=public.own_run_hash_v1(snapshot_value)'])assert.ok(seed.includes(field),field);
 assert.doesNotMatch(seed,/\b(?:CREATE|ALTER|DROP|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/);
 assert.ok(source.includes("assert.equal(ids.length,2);assert.equal(new Set(ids).size,2)"));assert.ok(source.includes('WHERE NOT(id=ANY(${wanted}))'));
 assert.ok(source.includes('assert.equal(afterSeed.ledgerTotal,before.ledgerTotal+2);assert.deepEqual(afterSeed.preserved,before.preserved)'));
 assert.ok(source.includes('assert.deepEqual(after.preserved,before.preserved)'));assert.ok(source.includes("tables[0].rows=observed.projectedRows;tables[0].rowsSha256=observed.projectedSha256"));
 assert.ok(source.includes('n(installation.batch.before)'));assert.ok(source.includes('readerFingerprint'));assert.ok(source.includes('assert.deepEqual(h.fixtureSnapshot(),baseline)'));
 const fixture=read('tests/fixtures/own-payroll-report-census-legacy-synthetic.js');assert.doesNotMatch(fixture,/^import[^\n]*scripts\//m);assert.doesNotMatch(fixture,/\b(?:buildOwnReportCensusInstallation|verifyMunicipalOwnerProgram|spawn|fetch)\s*\(/);
});
