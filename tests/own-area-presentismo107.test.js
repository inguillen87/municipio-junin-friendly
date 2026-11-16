import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAreaPresentismo107,OWN_AREA_PRESENTISMO107_RULE_VERSION,OWN_AREA_PRESENTISMO107_RESULT_VERSION} from '../lib/own-area-presentismo107.js';
import {area107Fixture,area107Reference,area107Uuid} from './fixtures/own-area-presentismo107-synthetic.js';

const errorCode = error => error.code === 'OWN_AREA_PRESENTISMO107_INPUT_INVALID';
const blocked = (result,code) => {
  assert.equal(result.status,'blocked'); assert.ok(result.blockers.includes(code),code);
  assert.equal(result.proposedQuantity,null); assert.equal(result.authorizedQuantity,null); assert.equal(result.presentismoLossPercent,null);
};

test('each declared whole day 101 adds exactly one unit to additional 107, capped at 3 with the confirmed scale',()=>{
  for (let incidence=0; incidence<=6; incidence++) for (let days=0; days<=31; days++) {
    const input=area107Fixture({incidences:String(incidence),absenceDays:String(days)});
    const result=evaluateAreaPresentismo107(input),quantity=String(Math.min(3,incidence+days));
    assert.equal(result.version,OWN_AREA_PRESENTISMO107_RESULT_VERSION);
    assert.equal(result.ruleVersion,OWN_AREA_PRESENTISMO107_RULE_VERSION);
    assert.equal(result.status,'proposed'); assert.deepEqual(result.blockers,[]);
    assert.equal(result.uncappedQuantity,String(incidence+days)); assert.equal(result.knownQuantity107,quantity);
    assert.equal(result.proposedQuantity,quantity); assert.equal(result.appliedCap,'3');
    assert.equal(result.presentismoLossPercent,{0:0,1:33,2:50,3:100}[quantity]);
    assert.deepEqual(result.components.incidences107,input.incidences107);
    assert.deepEqual(result.components.absence101Days,input.absence101Days);
  }
});

test('unclipped declared totals remain exact even beyond Number safe integer range',()=>{
  const result=evaluateAreaPresentismo107(area107Fixture({incidences:'999999999999999999',absenceDays:'31'}));
  assert.equal(result.uncappedQuantity,'1000000000000000030'); assert.equal(result.proposedQuantity,'3');
  assert.equal(result.components.incidences107.quantity,'999999999999999999');
  assert.equal(result.components.absence101Days.quantity,'31');
});

test('a zero is explicit and requires a complete monthly cut with explicitly zero unresolved tardiness',()=>{
  const input=area107Fixture(),result=evaluateAreaPresentismo107(input);
  assert.equal(result.proposedQuantity,'0'); assert.equal(result.knownQuantity107,'0'); assert.equal(result.presentismoLossPercent,0);
  for (const mutate of [value=>{value.cut.complete=false;},value=>{value.cut.to='2026-10-01';},
    value=>{value.tardiness.unconvertedCount=null;}]) {
    const altered=area107Fixture();mutate(altered);const out=evaluateAreaPresentismo107(altered);
    assert.equal(out.status,'blocked');assert.equal(out.knownQuantity107,null);assert.equal(out.proposedQuantity,null);
  }
});

test('the absence 101 effect applies to presentismo, not to salary-day discount or a 144 monetary calculation',()=>{
  const result=evaluateAreaPresentismo107(area107Fixture({absenceDays:'2'}));
  assert.equal(result.proposedQuantity,'2'); assert.equal(result.presentismoLossPercent,50);
  assert.equal(result.authorizedQuantity,null); assert.equal(result.baseSalaryDiscount,null);
  for (const flag of ['sourceAuthenticityVerified','policyAuthorizationVerified','coverageCertified','payrollEligible','payrollCalculated','payrollPosted','grhMutation']) assert.equal(result[flag],false,flag);
  for (const field of ['amount','amountCents','concept144Amount','baseSalaryDays','batch','authorizedPercent']) assert.equal(Object.hasOwn(result,field),false,field);
});

test('GRH full-payment or proportional precedents are comparison differences, not a replacement for the decided 101 rule',()=>{
  for (const days of [1,2,3,11,12,17,25,27]) {
    const result=evaluateAreaPresentismo107(area107Fixture({absenceDays:String(days)}));
    const loss=days===1?33:days===2?50:100;
    assert.equal(result.presentismoLossPercent,loss);
    assert.notEqual(100-result.presentismoLossPercent,100,'full legacy presentismo is not retained with declared absence days');
    assert.notEqual(100-result.presentismoLossPercent,100*(30-days)/30,'the old proration is not this new scale');
  }
});

test('unconverted tardiness blocks without default factor, including an already saturated known lower bound',()=>{
  for (const known of ['0','1','2','3','10']) for (const tardiness of ['1','2','30']) {
    const input=area107Fixture({incidences:known,unconvertedTardiness:tardiness}),result=evaluateAreaPresentismo107(input);
    blocked(result,'TARDINESS_CONVERSION_REQUIRED');
    assert.equal(result.knownQuantity107,known==='0'?null:String(Math.min(3,Number(known))));
    assert.equal(result.components.tardiness.unconvertedCount,tardiness);
    assert.equal(Object.hasOwn(result,'tardinessFactor'),false);
  }
  const forced=area107Fixture({unconvertedTardiness:'3'});forced.tardiness.factor='1';
  assert.throws(()=>evaluateAreaPresentismo107(forced),errorCode);
});

test('unknown counts are retained as null and never become zero',()=>{
  for (const [component,key,code] of [['incidences107','quantity','INCIDENCES107_COUNT_REQUIRED'],
    ['absence101Days','quantity','ABSENCE101_COUNT_REQUIRED'],['tardiness','unconvertedCount','TARDINESS_COUNT_REQUIRED']]) {
    const input=area107Fixture();input[component][key]=null;const result=evaluateAreaPresentismo107(input);
    blocked(result,code);assert.equal(result.components[component][key],null);assert.equal(result.knownQuantity107,null);
  }
});

test('101 fractions produced by a tardiness table are never rounded or treated as whole absence days',()=>{
  for (const value of ['0.25','0.5','0.75','1.5','1.0',1,0,-1,NaN,'01','+1',' 1','1 ','1e2',undefined]) {
    const input=area107Fixture();input.absence101Days.quantity=value;
    assert.throws(()=>evaluateAreaPresentismo107(input),errorCode,String(value));
  }
});

test('unknown component composition blocks rather than counting 101 twice or deduplicating silently',()=>{
  for (const component of ['incidences107','absence101Days']) {
    const input=area107Fixture({incidences:'2',absenceDays:'2'});input[component].origin='unresolved';
    const result=evaluateAreaPresentismo107(input);blocked(result,'COMPONENT_COMPOSITION_UNRESOLVED');
    assert.equal(result.uncappedQuantity,null);assert.equal(result.knownQuantity107,null);
    assert.deepEqual(result.components[component],input[component]);
  }
  const input=area107Fixture({incidences:'2',absenceDays:'2'});
  input.incidences107.origin='already_includes_101';assert.throws(()=>evaluateAreaPresentismo107(input),errorCode);
});

test('evidence shared by different components blocks, including one event already used in 107 and tardiness',()=>{
  for (const target of ['absence101Days','tardiness']) {
    const input=area107Fixture({incidences:'1',absenceDays:'1',unconvertedTardiness:'1'});
    input[target].evidenceRefs=[structuredClone(input.incidences107.evidenceRefs[0])];
    const before=structuredClone(input),result=evaluateAreaPresentismo107(input);
    blocked(result,'COMPONENT_EVIDENCE_OVERLAP');assert.equal(result.knownQuantity107,null);
    assert.deepEqual(input,before);assert.deepEqual(result.components[target],input[target]);
  }
});

test('positive components need original evidence; an incomplete cut is not evidence of zero',()=>{
  for (const [component,key,code] of [['incidences107','quantity','INCIDENCES107_EVIDENCE_REQUIRED'],
    ['absence101Days','quantity','ABSENCE101_EVIDENCE_REQUIRED'],['tardiness','unconvertedCount','TARDINESS_EVIDENCE_REQUIRED']]) {
    const input=area107Fixture();input[component][key]='1';input[component].evidenceRefs=[];
    const result=evaluateAreaPresentismo107(input);blocked(result,code);assert.equal(result.knownQuantity107,null);
  }
});

test('a supplied approval and matching version are required; the decision comment supplies no effective scope',()=>{
  const missing=area107Fixture();missing.policy=null;blocked(evaluateAreaPresentismo107(missing),'POLICY_REQUIRED');
  for (const status of ['draft','revoked']) {
    const input=area107Fixture();input.policy.status=status;blocked(evaluateAreaPresentismo107(input),'POLICY_APPROVAL_REQUIRED');
  }
  const unapproved=area107Fixture();unapproved.policy.approvalId=null;
  blocked(evaluateAreaPresentismo107(unapproved),'POLICY_APPROVAL_REQUIRED');
  const otherVersion=area107Fixture();otherVersion.policy.ruleVersion='own-area-presentismo107-rule.other';
  blocked(evaluateAreaPresentismo107(otherVersion),'POLICY_RULE_VERSION_MISMATCH');
});

test('tenant, binding, organization, sector and agreement must all be inside the explicit approved scope',()=>{
  const mutations=[scope=>{scope.tenantId=area107Uuid(200);},scope=>{scope.sourceBindingId=area107Uuid(201);},
    scope=>{scope.area.organizationUnitSourceId='other-area';},scope=>{scope.area.sectorSourceId='other-sector';},
    scope=>{scope.agreementCodes=['13'];},scope=>{scope.agreementCodes=[];}];
  for (const mutate of mutations) {
    const input=area107Fixture({absenceDays:'1'});mutate(input.policy.scope);
    blocked(evaluateAreaPresentismo107(input),'POLICY_SCOPE_MISMATCH');
  }
});

test('the approved validity must cover the entire month; no effective date comes from the 16 November decision',()=>{
  for (const [key,value,code] of [['validFrom',null,'POLICY_VALIDITY_REQUIRED'],['validFrom','2026-10-02','POLICY_PERIOD_NOT_COVERED'],
    ['validUntil','2026-10-30','POLICY_PERIOD_NOT_COVERED']]) {
    const input=area107Fixture();input.policy[key]=value;blocked(evaluateAreaPresentismo107(input),code);
  }
  const explicit=area107Fixture();explicit.policy.validFrom='2026-01-01';explicit.policy.validUntil=null;
  const result=evaluateAreaPresentismo107(explicit);
  assert.equal(result.status,'proposed');assert.equal(result.policy.validFrom,'2026-01-01');assert.equal(result.policy.validUntil,null);
  assert.equal(result.decisionEvidence,'https://github.com/inguillen87/municipio-junin-friendly/pull/270#issuecomment-6923480164');
});

test('a daily cut gives no monthly proposal; positive known components remain only a lower bound',()=>{
  const input=area107Fixture({absenceDays:'1'});input.cut.from='2026-10-05';input.cut.to='2026-10-05';
  const result=evaluateAreaPresentismo107(input);blocked(result,'MONTHLY_CUT_REQUIRED');assert.equal(result.knownQuantity107,'1');
  input.absence101Days.quantity='31';
  const impossible=evaluateAreaPresentismo107(input);blocked(impossible,'ABSENCE101_EXCEEDS_CUT_DAYS');
  assert.equal(impossible.components.absence101Days.quantity,'31');assert.equal(impossible.knownQuantity107,null);assert.equal(impossible.uncappedQuantity,null);
  input.absence101Days.quantity='1';
  input.cut.complete=false;blocked(evaluateAreaPresentismo107(input),'SOURCE_CUT_INCOMPLETE');
  input.cut.from='2026-09-30';input.cut.to='2026-10-31';
  const foreign=evaluateAreaPresentismo107(input);blocked(foreign,'MONTHLY_CUT_REQUIRED');assert.equal(foreign.knownQuantity107,null);
});

test('monthly bounds account for leap days instead of assuming 30 days',()=>{
  for (const [month,last] of [['2028-02-01','2028-02-29'],['2027-02-01','2027-02-28'],['2026-11-01','2026-11-30']]) {
    const input=area107Fixture();input.periodMonth=month;input.cut.from=month;input.cut.to=last;
    input.policy.validFrom=month;input.policy.validUntil=last;
    assert.equal(evaluateAreaPresentismo107(input).status,'proposed');
    input.cut.to=last.slice(0,8)+'01';blocked(evaluateAreaPresentismo107(input),'MONTHLY_CUT_REQUIRED');
  }
});

test('whole absence days cannot exceed civil days in the month; inconsistent originals are preserved without a proposal',()=>{
  for (const [month,last,days] of [['2027-02-01','2027-02-28',28],['2028-02-01','2028-02-29',29],['2026-11-01','2026-11-30',30]]) {
    const input=area107Fixture({absenceDays:String(days)});
    input.periodMonth=month;input.cut.from=month;input.cut.to=last;
    input.policy.validFrom=month;input.policy.validUntil=last;
    assert.equal(evaluateAreaPresentismo107(input).proposedQuantity,'3');
    input.absence101Days.quantity=String(days+1);
    const result=evaluateAreaPresentismo107(input);
    blocked(result,'ABSENCE101_EXCEEDS_MONTH_DAYS');
    assert.equal(result.components.absence101Days.quantity,String(days+1));
    assert.equal(result.uncappedQuantity,null);assert.equal(result.knownQuantity107,null);
  }
});

test('input/output are separate immutable evidence without changing supplied quantities or references',()=>{
  const input=area107Fixture({incidences:'2',absenceDays:'4'}),before=structuredClone(input),result=evaluateAreaPresentismo107(input);
  assert.deepEqual(input,before);assert.equal(Object.isFrozen(input),false);
  for (const value of [result,result.subject,result.subject.area,result.policy,result.policy.scope,result.policy.scope.agreementCodes,
    result.cut,result.components,result.components.incidences107,result.components.incidences107.evidenceRefs,result.blockers]) assert.equal(Object.isFrozen(value),true);
  input.incidences107.quantity='1';input.incidences107.evidenceRefs[0].sha256='a'.repeat(64);
  assert.equal(result.components.incidences107.quantity,'2');assert.deepEqual(result.components.incidences107.evidenceRefs,before.incidences107.evidenceRefs);
  assert.throws(()=>{result.proposedQuantity='0';},TypeError);
});

test('malformed dates, identifiers, shapes, sparse arrays and accessors are rejected without reading getters',()=>{
  let reads=0;
  const accessor=area107Fixture();Object.defineProperty(accessor.incidences107,'quantity',{enumerable:true,get(){reads++;return '0';}});
  const cases=[null,{},accessor];
  for (const mutate of [input=>{delete input.absence101Days;},input=>{input.unknown=true;},
    input=>{input.periodMonth='2026-10';},input=>{input.periodMonth='2026-13-01';},input=>{input.cut.to='2026-02-30';},
    input=>{input.subject.contractId='00000000-0000-0000-0000-000000000000';},input=>{input.subject.identityToken='NOT_A_HASH';},
    input=>{input.policy.scope.agreementCodes=['1','1'];},input=>{input.incidences107.evidenceRefs=Array(1);},
    input=>{input.incidences107.evidenceRefs=[area107Reference(10),area107Reference(10)];},
    input=>{input.incidences107.evidenceRefs[Symbol('private')]='NO_ECHO';},
    input=>{input.incidences107.quantity='9999999999999999999';},input=>{input.subject.area.organizationUnitSourceId=' text';}]) {
    const input=area107Fixture();mutate(input);cases.push(input);
  }
  for (const input of cases) assert.throws(()=>evaluateAreaPresentismo107(input),error=>errorCode(error)&&!error.message.includes('NO_ECHO'));
  assert.equal(reads,0);
});

test('canonical string validators reject every trailing line terminator instead of matching before it',()=>{
  for (const terminator of ['\n','\r','\r\n','\u2028','\u2029']) {
    for (const [component,key] of [[null,'periodMonth'],['subject','identityToken'],['subject','tenantId'],
      ['subject','agreementCode'],['cut','sha256'],['cut','from'],['incidences107','quantity'],['tardiness','unconvertedCount']]) {
      const input=area107Fixture(),target=component===null?input:input[component];target[key]+=terminator;
      assert.throws(()=>evaluateAreaPresentismo107(input),errorCode);
    }
  }
});
