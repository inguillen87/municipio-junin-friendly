import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  GRH_PUBLICATION_CONSUMERS, auditGrhPublicationConsumers, assertGrhConsumerCoverage,
  assertGrhSourceSelection, assertGrhComparableSelections, findGrhConsumerReferences,
  readGrhConsumerSources,
} from '../scripts/lib/grh-publication-consumers.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const sources=await readGrhConsumerSources(root);
const expected={version:'grh-source-selection.v1',tenantId:'11111111-1111-4111-8111-111111111111',
  sourceBindingId:'22222222-2222-4222-8222-222222222222',sourceDatabase:'grh_junin',companyId:1,
  baselineBatchId:'33333333-3333-4333-8333-333333333333',sourceVersionId:'44444444-4444-4444-8444-444444444444',
  revision:'baseline',sourceSha256:'a'.repeat(64),sourceDeclaredCutoff:'2026-08-06T15:15:21',sourcePayrollDate:'2026-08-31'};
const candidate={...expected,revision:'candidate',sourceSha256:'b'.repeat(64),sourceDeclaredCutoff:'2026-09-10T15:17:30',sourcePayrollDate:'2026-09-30'};
const rejects=(operation,code)=>assert.throws(operation,error=>error.code===code);

test('repository direct consumers are covered; coverage does not certify publication',()=>{
  const result=assertGrhConsumerCoverage(auditGrhPublicationConsumers(sources));
  assert.equal(result.publicationReady,false); assert.equal(result.databaseChecked,false);
  assert.ok(result.consumers.length>0 && result.consumers.length<=GRH_PUBLICATION_CONSUMERS.length);
  assert.ok(result.consumers.some(item=>item.symbol==='payroll_novelty_prepare_v1'&&item.disposition==='movement_preflight'));
  assert.ok(result.consumers.some(item=>item.symbol==='payroll_reprocessing_prepare_v1'&&item.disposition==='preserve_real_run_identity'));
});
test('an unknown API, a new function and a repeated direct read fail coverage',()=>{
  for(const [file,suffix,code] of [
    ['api/new-source-reader.js','export function read(){ return `SELECT * FROM payroll_monthly_fact`; }','GRH_CONSUMER_UNCATALOGUED'],
    ['api/internal-data.js','\nexport function accidentalLatest(){ return `SELECT * FROM payroll_run`; }','GRH_CONSUMER_UNCATALOGUED'],
    ['scripts/migrations/002-canonical-integration.sql',null,'GRH_CONSUMER_NEW_DIRECT_REFERENCE'],
  ]){
    const changed={...sources};
    changed[file]=suffix===null ? sources[file].replace('FROM payroll_run r','FROM payroll_run r JOIN payroll_run second_run ON true') : (sources[file]||'')+suffix;
    const report=auditGrhPublicationConsumers(changed);
    assert.ok(report.findings.some(item=>item.code===code));
    rejects(()=>assertGrhConsumerCoverage(report),'GRH_CONSUMER_COVERAGE_INCOMPLETE');
  }
});
test('missing files fail rather than turning incomplete scans green',()=>{
  const changed={...sources};delete changed['api/internal-data.js'];
  assert.ok(auditGrhPublicationConsumers(changed).findings.some(item=>item.code==='GRH_CONSUMER_FILE_MISSING'));
});
test('removing direct references is compatible with coverage, not proof of installed SQL',()=>{
  const changed={...sources,'lib/workforce-operational-scope.js':sources['lib/workforce-operational-scope.js'].replaceAll('payroll_run','grh_selected_runs').replaceAll('payroll_monthly_fact','grh_selected_monthly')};
  const report=assertGrhConsumerCoverage(auditGrhPublicationConsumers(changed));
  assert.equal(report.publicationReady,false);
  assert.ok(report.limitations.includes('historical_migrations_not_installed_bodies'));
});
test('SQL quotes, schema qualification, ONLY and comments retain accurate references',()=>{
  const sql='-- FROM payroll_run\nCREATE FUNCTION public.check_me() RETURNS void AS $$\n/* FROM payroll_run /* JOIN employment_movement */ */\nSELECT * FROM ONLY "public"."payroll_monthly_fact" f JOIN public.payroll_run r ON true;\n$$ LANGUAGE sql;';
  const refs=findGrhConsumerReferences('scripts/migrations/example.sql',sql);
  assert.deepEqual(refs.map(({symbol,relation,line})=>({symbol,relation,line})),[
    {symbol:'check_me',relation:'payroll_monthly_fact',line:4},{symbol:'check_me',relation:'payroll_run',line:4},
  ]);
});
test('a similarly named relation is not mistaken for the watched table',()=>{
  assert.equal(findGrhConsumerReferences('lib/example.js','export function read(){ return `SELECT * FROM payroll_run_archive`; }').length,0);
});
test('selection is explicit, immutable and bound to separately obtained expected context',()=>{
  const selection=assertGrhSourceSelection({...candidate},candidate);
  assert.deepEqual(selection,candidate);assert.ok(Object.isFrozen(selection));
  assert.equal(selection.sourceDeclaredCutoff,'2026-09-10T15:17:30');
});
test('implicit latest, omitted values, timezone reinterpretation and malformed dates fail closed',()=>{
  for(const change of [{revision:'latest'},{revision:undefined},{sourceVersionId:null},{companyId:'1'},
    {sourceDeclaredCutoff:'2026-09-10T15:17:30Z'},{sourceDeclaredCutoff:'2026-02-30T15:17:30'},
    {sourcePayrollDate:'2026-09-31'},{sourceSha256:'B'.repeat(64)},{extra:true}]){
    rejects(()=>assertGrhSourceSelection({...candidate,...change},candidate),'GRH_SOURCE_SELECTION_INVALID');
  }
  const absent={...candidate};delete absent.baselineBatchId;
  rejects(()=>assertGrhSourceSelection(absent,candidate),'GRH_SOURCE_SELECTION_INVALID');
  rejects(()=>assertGrhSourceSelection(candidate,null),'GRH_SOURCE_SELECTION_INVALID');
});
test('tenant, binding, source, revision or version swaps cannot reuse a selection',()=>{
  for(const key of ['tenantId','sourceBindingId','baselineBatchId','sourceVersionId'])
    rejects(()=>assertGrhSourceSelection({...candidate,[key]:'55555555-5555-4555-8555-555555555555'},candidate),'GRH_SOURCE_SELECTION_MISMATCH');
  for(const change of [{companyId:2},{sourceDatabase:'other'},{sourceSha256:'c'.repeat(64)},
    {revision:'baseline'},{sourceDeclaredCutoff:'2026-09-11T15:17:30'},{sourcePayrollDate:'2026-10-31'}])
    rejects(()=>assertGrhSourceSelection({...candidate,...change},candidate),'GRH_SOURCE_SELECTION_MISMATCH');
});
test('comparison distinguishes source revision from payroll month and never certifies closure',()=>{
  assert.deepEqual(assertGrhComparableSelections(expected,candidate),{sourcePairComparable:true,equalPayrollPeriod:false,payrollClosedCertified:false});
  rejects(()=>assertGrhComparableSelections(candidate,expected),'GRH_SOURCE_COMPARISON_MISMATCH');
  rejects(()=>assertGrhComparableSelections(expected,{...candidate,sourceBindingId:'55555555-5555-4555-8555-555555555555'}),'GRH_SOURCE_COMPARISON_MISMATCH');
  rejects(()=>assertGrhComparableSelections(expected,{...candidate,sourceDeclaredCutoff:expected.sourceDeclaredCutoff}),'GRH_SOURCE_COMPARISON_MISMATCH');
});
