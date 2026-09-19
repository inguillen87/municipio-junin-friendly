import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCycle,planCycleRetention,planManagementYearPairs,planClosedPayrollMonthPairs,classifyHistoryRecord,evaluateMetricPair,METRIC_CONTRACTS} from '../scripts/lib/municipal-cycle-policy.mjs';
// Fictional dates: these fixtures are NOT an institutional calendar for Junin.
const previous={code:'synthetic-previous',start:'2019-12-10',endExclusive:'2023-12-10',reviewed:true,evidenceRefs:['fixture:synthetic-only']};
const current={code:'synthetic-current',start:'2023-12-10',endExclusive:'2027-12-10',reviewed:true,evidenceRefs:['fixture:synthetic-only']};
const cycle={previous,current,asOf:'2026-09-18'};
test('two-term retention preserves the whole first month, without a rolling cutoff',()=>{
  const p=planCycleRetention(cycle);
  assert.equal(p.retainFrom,'2019-12-01');assert.equal(p.analyticsFrom,'2019-12-10');
  assert.equal(p.cutoverAllowed,false);assert.equal(p.destructiveActionAllowed,false);
  assert.equal(planCycleRetention({...cycle,asOf:'2027-11-30'}).retainFrom,p.retainFrom);
});
test('two optional extra years extend the same cycle, not the current date',()=>{
  assert.equal(planCycleRetention({...cycle,extraYears:2}).retainFrom,'2017-12-01');
  for(const extraYears of [-1,1,3,'2',10]) assert.throws(()=>planCycleRetention({...cycle,extraYears}));
});
test('dates require institutional review and evidence, not inferred office-holder dates',()=>{
  for(const overrides of [{reviewed:false},{reviewed:undefined},{evidenceRefs:[]},{evidenceRefs:['']},{evidenceRefs:[2]}])
    assert.throws(()=>validateCycle({...cycle,current:{...current,...overrides}}));
});
test('reject gaps, overlaps, identical identifiers and implausible term duration',()=>{
  for(const changes of [{start:'2023-12-11'},{start:'2023-12-09'},{code:previous.code},{endExclusive:'2025-12-10'}])
    assert.throws(()=>validateCycle({...cycle,current:{...current,...changes}}));
});
test('strict dates reject impossible days, implicit timestamps, missing cycle and out-of-term reference',()=>{
  for(const asOf of ['2026-02-30','2026-9-18','2026-09-18T00:00:00Z','2023-12-09','2027-12-10',null])
    assert.throws(()=>validateCycle({...cycle,asOf}));
  assert.throws(()=>validateCycle());
});
test('four year pairs include two elapsed, one partial, and a genuinely unavailable fourth',()=>{
  const p=planManagementYearPairs(cycle);
  assert.deepEqual(p.years.map(x=>x.status),['elapsed','elapsed','partial','not_started']);
  assert.equal(p.years[3].currentValue,null);assert.equal(p.years[3].currentComparable,null);
  assert.equal(p.years[0].comparableDays,366);
  assert.equal(p.years[0].previousComparable.start,'2019-12-10');
  assert.equal(p.years[0].currentComparable.start,'2023-12-10');
  assert.equal(p.dataCoverageMustBeVerifiedSeparately,true);
});
test('every active pair has equal elapsed days including leap years',()=>{
  for(const asOf of ['2023-12-10','2024-02-29','2024-12-09','2025-12-10','2026-09-18','2027-12-09']) {
    for(const pair of planManagementYearPairs({...cycle,asOf}).years) {
      if(!pair.currentComparable) continue;
      const duration=x=>(new Date(x.endExclusive)-new Date(x.start))/86400000;
      assert.equal(duration(pair.currentComparable),duration(pair.previousComparable));
      assert.equal(duration(pair.currentComparable),pair.comparableDays);
    }
  }
});
test('shortened institutional transition is exposed rather than compared to a longer year',()=>{
  const p=planManagementYearPairs({previous:{...previous,endExclusive:'2023-12-09'},
    current:{...current,start:'2023-12-09',endExclusive:'2027-12-09'},asOf:'2027-12-08'});
  assert.equal(p.years[3].currentUnpairedDays,1);
});
test('Feb 29 anniversaries clamp to valid calendar dates',()=>{
  const p=planManagementYearPairs({previous:{...previous,start:'2016-02-29',endExclusive:'2020-02-29'},
    current:{...current,start:'2020-02-29',endExclusive:'2024-02-29'},asOf:'2023-06-01'});
  assert.equal(p.years[1].currentFull.start,'2021-02-28');
});
test('closed payroll comparison requires explicit closure months and excludes transition fragments',()=>{
  const p=planClosedPayrollMonthPairs({...cycle,previousClosedThroughMonth:'2023-11-01',currentClosedThroughMonth:'2026-08-01'});
  assert.equal(p.years[0].comparableMonths,11);
  assert.equal(p.years[2].pairs.at(-1).current,'2026-08-01');
  assert.equal(p.years[3].comparableMonths,0);assert.equal(p.transitionMonthProratingAllowed,false);
  assert.throws(()=>planClosedPayrollMonthPairs(cycle));
  assert.throws(()=>planClosedPayrollMonthPairs({...cycle,previousClosedThroughMonth:'2023-11-02',currentClosedThroughMonth:'2026-08-01'}));
});
const record={relation:'public.employment_movement',sourceSystem:'GRH',period:'2018-01-01',nativeOverlay:false,legalHold:false,dependencyStatus:'cleared',sourceBatchVerified:true};
test('only explicitly reviewed imported detail becomes an archive candidate; never a deletion order',()=>{
  const p=planCycleRetention(cycle), result=classifyHistoryRecord(record,p);
  assert.equal(result.destination,'archive_candidate');assert.equal(result.removalAuthorized,false);
  assert.equal(classifyHistoryRecord({...record,period:p.retainFrom},p).destination,'operational');
});
test('unknown dependencies, legal holds, native overlays, missing lineage and invalid dates stay operational',()=>{
  const p=planCycleRetention(cycle);
  for(const changed of [{nativeOverlay:true},{nativeOverlay:undefined},{legalHold:true},{legalHold:undefined},
    {dependencyStatus:'unknown'},{dependencyStatus:'required'},{sourceBatchVerified:false},{period:'0000-00-00'},
    {sourceSystem:'MUNICONTROL'},{sourceSystem:'OTHER'},{sourceSystem:undefined}])
    assert.equal(classifyHistoryRecord({...record,...changed},p).destination,'operational');
});
test('personnel, formulas, audit, clocks and unknown future tables are preserved by default',()=>{
  for(const relation of ['public.employment_contract','public.person_identity','public.legal_norm','public.time_catalog_entry',
    'public.payroll_formula','public.native_employee_registration','public.attendance_raw_event','public.future_module'])
    assert.equal(classifyHistoryRecord({...record,relation},planCycleRetention(cycle)).destination,'operational');
});
test('boundary month cannot be silently truncated',()=>{
  assert.throws(()=>classifyHistoryRecord(record,{...planCycleRetention(cycle),retainFrom:'2019-12-10'}));
});
function metricSide(changes={}) {return {value:'0',coverage:'complete',verified:true,sourceKind:'employment_state',sourceRef:'fixture:evidence',
  tenantId:'synthetic-tenant',scopeVersion:'all-staff-v1',definitionVersion:'v1',unit:'people',windowUnits:1,...changes};}
test('verified zero stays zero and missing is never replaced by zero',()=>{
  assert.equal(evaluateMetricPair({metric:'activePeople',previous:metricSide(),current:metricSide({value:0})}).comparable,true);
  const m=evaluateMetricPair({metric:'activePeople',previous:metricSide(),current:metricSide({value:null})});
  assert.equal(m.comparable,false);assert.equal(m.current,null);assert.ok(m.reasons.includes('data_missing'));
});
test('coverage, tenant, source, scope, unit and temporal mismatch block comparison',()=>{
  for(const change of [{verified:false},{coverage:'partial'},{tenantId:'other'},{scopeVersion:'other'},
    {sourceKind:'approved_budget'},{sourceRef:''},{unit:'contracts'},{windowUnits:2},{definitionVersion:'v2'},
    {value:'NaN'},{value:Infinity},{value:0.123},{value:9007199254740992}])
    assert.equal(evaluateMetricPair({metric:'activePeople',previous:metricSide(),current:metricSide(change)}).comparable,false);
});
test('monetary inter-year comparisons require a common, non-nominal price basis',()=>{
  const side=metricSide({sourceKind:'approved_budget',unit:'ARS',value:'123456789012345.12',priceBasisId:'nominal'});
  assert.equal(evaluateMetricPair({metric:'approvedBudget',previous:side,current:side}).comparable,false);
  const real={...side,priceBasisId:'synthetic-index-fixed-base-v1'};
  assert.equal(evaluateMetricPair({metric:'approvedBudget',previous:real,current:real}).comparable,true);
});
test('payroll, treasury, worked hours and budgets are explicitly distinct domains',()=>{
  assert.notEqual(METRIC_CONTRACTS.approvedOvertime.source,METRIC_CONTRACTS.workedHours.source);
  assert.notEqual(METRIC_CONTRACTS.liquidatedOvertime.source,METRIC_CONTRACTS.cashPayments.source);
  assert.throws(()=>evaluateMetricPair({metric:'politicalPerformanceScore'}));
  const r=evaluateMetricPair({metric:'activePeople',previous:metricSide(),current:metricSide()});
  assert.equal(r.causalConclusionAllowed,false);assert.equal(r.politicalRankingAllowed,false);
});
test('people counts cannot be negative or fractional and metric contracts are immutable',()=>{
  for(const value of ['-1','1.5']) assert.equal(evaluateMetricPair({metric:'activePeople',previous:metricSide(),current:metricSide({value})}).comparable,false);
  assert.throws(()=>{METRIC_CONTRACTS.activePeople.unit='ARS';});
});
