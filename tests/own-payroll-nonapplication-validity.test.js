import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnPayrollNonapplicationPolicyV2,ownPayrollNonapplicationPolicyContext,inspectOwnPayrollNonapplicationSource,captureOwnPayrollNonapplication,prepareOwnPayrollNonapplicationPlan,createOwnPayrollNonapplicationEffectiveBundle,nonapplicationHash} from '../lib/own-payroll-nonapplication.js';
import {prepareOwnPayrollProgrammeNonapplicationSource} from '../lib/own-payroll-programme-source-preparation.js';
import {createOwnPayrollNonapplicationPreview} from '../lib/own-payroll-nonapplication-preview.js';
import {temporalNonapplicationFixture,repinTemporalNonapplicationPolicy} from './fixtures/own-payroll-nonapplication-validity-synthetic.js';
import {nonapplicationFixture,args,planArgs,repinCapture,addMonthly,addFixed} from './fixtures/own-payroll-nonapplication-synthetic.js';

const clone=v=>structuredClone(v),fails=code=>e=>e?.code===code;
const declaration=f=>({policyId:f.policy.policyId,supersedes:null,scope:f.scope,sourceSha256:f.source.source.sha256,sourceReference:f.policy.source.reference,definitions:f.source.definitions,bindings:f.source.bindings,sourceRows:f.sourceRows,targetCodes:f.policy.targets.map(t=>t.code),additiveGroups:f.policy.aggregates.map(({code,removedCodes})=>({code,removedCodes}))});
const reviewArgs=f=>({policy:f.policy,source:f.source.source,definitions:f.source.definitions,bindings:f.source.bindings,priorProgram:f.source.programme.program.definition});
function presentMonthly(f,code,{native=false,forced=false}={}){
 addMonthly(f,code,{native,forced});const batch=(native?f.capture.monthly.nativeBatches:f.capture.monthly.batches).at(-1);batch.periodMonth=f.capture.period+'-01';
 if(native&&forced){batch.approvals=[batch.approvals[0]];batch.decidedBy=batch.approvals[0];}
 return repinCapture(f);
}
function presentFixed(f,code,{pending=false,forced=false}={}){
 addFixed(f,code,{pending,forced});const month=f.capture.period+'-01',last=new Date(Date.UTC(Number(f.capture.period.slice(0,4)),Number(f.capture.period.slice(5)),0)).getUTCDate(),end=f.capture.period+'-'+String(last);
 for(const k of ['list','export'])f.capture.fixed[k].data.periodMonth=month;
 for(const r of f.capture.fixed.list.data.rows)for(const proposal of [r.latest,r.approved,r.pending])if(proposal?.values){proposal.values.validFrom=month;proposal.values.validTo=end;}
 for(const r of f.capture.fixed.export.data.rows){r.values.validFrom=month;r.values.validTo=end;}
 return repinCapture(f);
}

for(const period of ['2027-08','2027-09','2027-10','2027-11','2027-12','2028-01','2028-02','2028-08','2028-09','2028-10','2028-11','2028-12','2032-02'])test('explicit scoped nonapplication captures complete own absence in '+period,()=>{
 const f=temporalNonapplicationFixture({period}),plan=prepareOwnPayrollNonapplicationPlan(planArgs(f));
 assert.equal(plan.version,'own-payroll-nonapplication-plan.v2');assert.equal(plan.evidence.version,'own-payroll-nonapplication-capture.v2');assert.equal(plan.evidence.decisions.length,4);assert.ok(plan.evidence.decisions.every(d=>d.agreementCode==='7'&&d.period===period&&['740','741'].includes(d.conceptCode)&&d.monthlyEventCount===0&&d.fixedEventCount===0));
 assert.equal(plan.approved,false);assert.equal(plan.registered,false);assert.equal(plan.payrollPosted,false);assert.equal(plan.evidence.sourceCertification,'requires_trusted_complete_native_read');assert.equal(plan.policy.scope.validUntil,null);
 const prepared=prepareOwnPayrollProgrammeNonapplicationSource({source:f.source,policy:f.policy});assert.equal(prepared.version,'own-payroll-programme-nonapplication-preparation.v2');assert.equal(prepared.draft.programme.nonApplicationVersion,'own-payroll-nonapplication.v2');assert.deepEqual(prepared.incidents.map(i=>i.code),['NONAPPLICATION_PREPARATION_ONLY']);assert.equal(prepared.presentable.programme,false);assert.equal(prepared.approved,false);assert.equal(prepared.executable,false);
});
test('absence capture must be reacquired for each month and cannot borrow the prior period',()=>{
 const a=temporalNonapplicationFixture({period:'2027-12'}),b=temporalNonapplicationFixture({period:'2028-01'});assert.equal(nonapplicationHash(a.policy),nonapplicationHash(b.policy));assert.notEqual(captureOwnPayrollNonapplication(a.capture,a.policy).captureSha256,captureOwnPayrollNonapplication(b.capture,b.policy).captureSha256);
 const old=clone(a.capture);old.period='2028-01';assert.throws(()=>captureOwnPayrollNonapplication(old,a.policy));
});
for(const period of ['2027-07','2028-01'])test('declared nonapplication finite window rejects '+period,()=>{
 const f=temporalNonapplicationFixture({period:'2027-08',validUntil:'2027-12'}),bad=clone(f.capture);bad.period=period;assert.throws(()=>captureOwnPayrollNonapplication(bad,f.policy),fails('NONAPPLICATION_CAPTURE_SCOPE_INVALID'));
});
for(const [channel,native,forced]of [['import zero',false,false],['import forced',false,true],['native zero',true,false],['native forced single reviewer',true,true]])test('present target is not absence: '+channel,()=>{
 const f=presentMonthly(temporalNonapplicationFixture({period:'2028-02'}),'740',{native,forced});assert.throws(()=>captureOwnPayrollNonapplication(f.capture,f.policy),fails('NONAPPLICATION_EVENT_PRESENT'));
});
for(const [name,options,code]of [['fixed zero',{},'NONAPPLICATION_EVENT_PRESENT'],['fixed forced',{forced:true},'NONAPPLICATION_EVENT_PRESENT'],['fixed pending',{pending:true},'NONAPPLICATION_FIXED_PENDING']])test('present target is not absence: '+name,()=>{
 const f=presentFixed(temporalNonapplicationFixture({period:'2028-02'}),'741',options);assert.throws(()=>captureOwnPayrollNonapplication(f.capture,f.policy),fails(code));
});
test('unrelated event remains captured and is never treated as a conditional target by numeric coincidence',()=>{
 const f=presentMonthly(temporalNonapplicationFixture(),'22',{native:true});const evidence=captureOwnPayrollNonapplication(f.capture,f.policy);assert.equal(evidence.observedOtherEventCount,1);assert.equal(evidence.decisions.length,4);assert.ok(evidence.decisions.every(d=>d.conceptCode!=='22'));
});
for(const [label,mutate,expected]of [
 ['missing native monthly channel',f=>{delete f.capture.monthly.nativeBatches;repinCapture(f);},'NONAPPLICATION_CONTRACT_INVALID'],
 ['false completeness',f=>f.capture.completeness.monthly=false,'NONAPPLICATION_SOURCE_INCOMPLETE'],
 ['changed fingerprint',f=>f.capture.sourceSha256.population='0'.repeat(64),'NONAPPLICATION_CAPTURE_CHANGED'],
 ['cross agreement',f=>{f.capture.population.employees[0].agreementCode='1';repinCapture(f);},'NONAPPLICATION_POPULATION_INVALID'],
 ['cross scope',f=>f.capture.scopeVersion='1'.repeat(64),'NONAPPLICATION_CAPTURE_SCOPE_INVALID'],
 ['invalid tenant',f=>f.capture.tenantId='not-a-tenant','NONAPPLICATION_CAPTURE_SCOPE_INVALID'],
 ['truncated population',f=>f.capture.contractIds.pop(),'NONAPPLICATION_POPULATION_INCOMPLETE'],
 ['old capture version',f=>f.capture.version='own-payroll-nonapplication-capture.v1','NONAPPLICATION_CAPTURE_SCOPE_INVALID']
])test('nonapplication native scope rejects '+label,()=>{const f=temporalNonapplicationFixture();mutate(f);assert.throws(()=>captureOwnPayrollNonapplication(f.capture,f.policy),fails(expected));});
test('native subject identity and adjustment period remain strict in future captures',()=>{
 const identity=presentMonthly(temporalNonapplicationFixture(),'22',{native:true}),identityBatch=identity.capture.monthly.nativeBatches[0];identityBatch.rows[0].subject.identityToken='1'.repeat(64);identityBatch.rows[0].values.identityToken='1'.repeat(64);identityBatch.rowsSha256=nonapplicationHash(identityBatch.rows.map(({values,subject})=>({values,subject})));repinCapture(identity);assert.throws(()=>captureOwnPayrollNonapplication(identity.capture,identity.policy),fails('NONAPPLICATION_IDENTITY_CHANGED'));
 const adjustment=presentMonthly(temporalNonapplicationFixture(),'22',{native:true}),batch=adjustment.capture.monthly.nativeBatches[0];batch.rows[0].values.adjustmentMonth='2027-07-01';batch.rowsSha256=nonapplicationHash(batch.rows.map(({values,subject})=>({values,subject})));repinCapture(adjustment);assert.throws(()=>captureOwnPayrollNonapplication(adjustment.capture,adjustment.policy),fails('NONAPPLICATION_SOURCE_SCOPE_INVALID'));
});
test('V2 target list and pure-additive membership are explicit and do not inherit fourteen or thirty legacy defaults',()=>{
 const f=temporalNonapplicationFixture(),review=inspectOwnPayrollNonapplicationSource(reviewArgs(f));assert.equal(review.excludedDefinitionIds.length,2);assert.equal(review.references.length,2);assert.equal(review.changes.length,1);assert.deepEqual(review.excludedDefinitionIds,['concept:7:740','concept:7:741']);assert.equal(review.removedBindings.length,2);
 const d=declaration(f);d.targetCodes=[];assert.throws(()=>createOwnPayrollNonapplicationPolicyV2(d));
});
for(const [label,mutate,expected]of [
 ['source not N',d=>d.sourceRows[0].ACTI_27='S','NONAPPLICATION_SOURCE_SEMANTICS_INVALID'],
 ['monetary formula present',d=>d.sourceRows[0].FOVM_27='123','NONAPPLICATION_SOURCE_SEMANTICS_INVALID'],
 ['wrong method',d=>d.sourceRows[0].CODI_36='1','NONAPPLICATION_SOURCE_SEMANTICS_INVALID'],
 ['wrong target validity',d=>d.definitions.find(x=>x.code==='740').validUntil='2027-12','NONAPPLICATION_SCOPE_UNSUPPORTED'],
 ['missing source row',d=>d.sourceRows.pop(),'NONAPPLICATION_CONTRACT_INVALID'],
 ['duplicate membership',d=>d.additiveGroups[0].removedCodes.push('740'),'NONAPPLICATION_MEMBERSHIP_CHANGED'],
 ['unknown membership',d=>d.additiveGroups[0].removedCodes.push('22'),'NONAPPLICATION_MEMBERSHIP_CHANGED']
])test('nonapplication declarations reject '+label,()=>{const d=clone(declaration(temporalNonapplicationFixture()));mutate(d);assert.throws(()=>createOwnPayrollNonapplicationPolicyV2(d),fails(expected));});
test('source review cannot rewrite an approved active rule or prune a non-additive formula',()=>{
 const f=temporalNonapplicationFixture(),args=reviewArgs(f);args.priorProgram={rules:[f.source.definitions.find(d=>d.code==='740')],quantityPhases:[]};assert.throws(()=>inspectOwnPayrollNonapplicationSource(args),fails('NONAPPLICATION_PRIOR_RULE_ACTIVE'));
 const direct=temporalNonapplicationFixture();direct.source.definitions.find(d=>d.code==='1').expression={op:'concept',code:'740',stage:'exact'};repinTemporalNonapplicationPolicy(direct);assert.throws(()=>inspectOwnPayrollNonapplicationSource(reviewArgs(direct)),fails('NONAPPLICATION_DIRECT_REFERENCE'));
 const nonadditive=temporalNonapplicationFixture(),aggregate=nonadditive.source.definitions.find(d=>d.kind==='auxiliary');aggregate.expression={op:'subtract',left:aggregate.expression.left,right:aggregate.expression.right};repinTemporalNonapplicationPolicy(nonadditive);assert.throws(()=>inspectOwnPayrollNonapplicationSource(reviewArgs(nonadditive)),fails('NONAPPLICATION_NONADDITIVE_REFERENCE'));
});
test('policy integrity and preparatory identity cannot be repurposed as an approval or isolated succession',()=>{
 const f=temporalNonapplicationFixture();for(const key of ['approved','registered']){const p=clone(f.policy);p[key]=true;assert.throws(()=>ownPayrollNonapplicationPolicyContext(p),fails('NONAPPLICATION_POLICY_CHANGED'));}
 const p=clone(f.policy);p.targets[0].sourceRow.CODI_27='22';assert.throws(()=>ownPayrollNonapplicationPolicyContext(p),fails('NONAPPLICATION_POLICY_CHANGED'));
 const d=clone(declaration(f));d.supersedes={policyId:'prior-declaration',policySha256:'a'.repeat(64)};assert.throws(()=>createOwnPayrollNonapplicationPolicyV2(d),fails('NONAPPLICATION_HISTORY_REQUIRED'));
});
test('effective preparation preserves every original source definition and all nonoperational gates',()=>{
 const f=temporalNonapplicationFixture(),bundle={...clone(f.source),approved:false,executable:false,presentable:false},effective=createOwnPayrollNonapplicationEffectiveBundle({bundle,policy:f.policy,source:f.source.source,priorProgram:null});
 assert.equal(effective.receipt.version,'own-payroll-nonapplication-effective-bundle.v2');assert.equal(effective.receipt.conditionalDefinitions,2);assert.equal(effective.receipt.prunedReferences,2);assert.equal(effective.bundle.nonApplication.sourceDefinitions.length,2);assert.equal(effective.receipt.sourceDefinitions,effective.receipt.effectiveDefinitions+effective.receipt.conditionalDefinitions);assert.equal(effective.receipt.approved,false);assert.equal(effective.receipt.nativeAbsenceEstablished,false);assert.equal(effective.receipt.municipalWrites,0);
});
test('legacy policy, plan, source preparation and preview retain independently captured exact141 hashes',()=>{
 const f=nonapplicationFixture();assert.equal(nonapplicationHash(prepareOwnPayrollNonapplicationPlan(planArgs(f))),'ab55204518397982da652bfdb786a7774f816cdbc1b4fdb6cf28b2ffc02c528f');assert.equal(nonapplicationHash(prepareOwnPayrollProgrammeNonapplicationSource({source:f.source,policy:f.policy})),'a0daa277af9bb4a6bc65033d2c179c6938e51921da365b25b854cbf38e96c6ae');assert.equal(nonapplicationHash(createOwnPayrollNonapplicationPreview(args(f))),'ed00a97f20da2d988cbc6056e52c63def72ac8bf7fbe90607a397721ed7d6e11');
});
