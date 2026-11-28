// Local model/JSON tests only. Synthetic actors, declarations and monthly amounts;
// existing tariff fixtures retain their pinned reference table, without municipal approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {salaryItems,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {prepareProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {reviewPreparedProgramDraft,applyPreparedProgramDraft} from '../assets/own-payroll-program-prepared-draft.js';
import {OWN_MONTHLY_FORCED_AMOUNT_VERSION,monthlyForcedExpectedExpression} from '../assets/own-payroll-monthly-forced-amounts.js';
import {prepareOwnPayrollProgrammeSource,prepareOwnPayrollProgrammeNonapplicationSource} from '../lib/own-payroll-programme-source-preparation.js';
import {createOwnPayrollJointPreview,verifyOwnPayrollJointPreview} from '../lib/own-payroll-joint-preview.js';
import {preparedProgramFixture} from './fixtures/own-payroll-program-prepared-synthetic.js';
import {emissionSources,emissionPreparerEvidence} from './fixtures/own-payroll-row-emission-synthetic.js';
import {familyTariffSources} from './fixtures/own-payroll-family-tariff-synthetic.js';
import {jointPreviewFixture,jointArgs} from './fixtures/own-payroll-joint-preview-synthetic.js';
import {nonapplicationFixture,sourceArgs} from './fixtures/own-payroll-nonapplication-synthetic.js';

const blank=()=>({rules:[],bindings:[],totalsPrecision:null});
const hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const is=code=>error=>error?.code===code;
const review=(raw,preparation)=>reviewPreparedProgramDraft(raw.salary,raw.programme,blank(),JSON.stringify(preparation));
function reseal(preparation){
 const copy=structuredClone(preparation);delete copy.pins.preparationSha256;
 copy.pins.preparationSha256=hash(copy);return copy;
}
function monthlySource(code='609'){
 const raw=preparedProgramFixture().input;
 raw.period='2026-10';raw.agreementCodes=['1'];
 const policy={agreementCode:'1',period:raw.period,liquidationType:'monthly',sourceContract:'own-payroll-novelty-batch.v1',sourceKind:'monthly_amount',sourceCode:code,amountInputKey:'amount'+code,presenceInputKey:'presence'+code,treatment:'declared_amount_passthrough',quantityPolicy:'explicit_zero',sourceSha256:'e'.repeat(64),ruleReference:'Synthetic explicit monthly policy; no source or business approval inferred'};
 const sourceNode=node=>{
  if(node===null||typeof node!=='object')return node;
  if(node.op==='input')return node.key===policy.presenceInputKey?{op:'source_presence',family:'monthly',code}:{op:'source',reference:'I['+code+']',unit:'money'};
  return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,sourceNode(value)]));
 };
 const d=raw.definitions[0];
 Object.assign(d,{agreementCode:'1',code,label:'Synthetic declared amount '+code,nature:'deduction',quantityUnit:'money',precision:2,validFrom:raw.period,validUntil:raw.period,rounding:{precision:2,mode:'half_up'},expression:sourceNode(monthlyForcedExpectedExpression(policy))});
 const {kind,agreementCode,label,active,nature,quantityUnit,precision,validFrom,validUntil,value,dependencies,ruleReference}=d;
 const items=salaryItems([{kind,agreementCode,categoryCode:null,code,label,active,nature,unit:quantityUnit,precision,validFrom,validUntil,value,dependencies,ruleReference}]);
 raw.salary.catalog.items=structuredClone(items);raw.programme.salaryCatalog.items=structuredClone(items);
 raw.bindings=[
  {agreementCode:'1',reference:'I['+code+']',sourceSha256:'e'.repeat(64),binding:{agreementCode:'1',key:policy.amountInputKey,unit:'money',sourceKind:'monthly_amount',sourceCode:code,combine:'single',onMissing:'zero',ruleReference:'Synthetic explicit monthly amount binding'}},
  {agreementCode:'1',reference:'P['+code+']',sourceSha256:'e'.repeat(64),binding:{agreementCode:'1',key:policy.presenceInputKey,unit:'coefficient',sourceKind:'monthly_presence',sourceCode:code,combine:'any',onMissing:'zero',ruleReference:'Synthetic explicit native monthly presence'}}
 ];
 raw.programmeOptions={...raw.programmeOptions,noveltyPresenceVersion:'own-payroll-novelty-presence.v1',monthlyForcedAmountsVersion:OWN_MONTHLY_FORCED_AMOUNT_VERSION,monthlyForcedAmountPolicies:[policy]};
 raw.totalsPrecision=2;return raw;
}

for(const [name,fixture]of [
 ['family tariff',()=>emissionPreparerEvidence(familyTariffSources())],
 ['row emission',()=>emissionPreparerEvidence(emissionSources())],
 ['tariff and emission',()=>emissionPreparerEvidence(familyTariffSources({emission:true}))],
 ['monthly declared amount609',()=>monthlySource('609')],
 ['monthly declared amount649',()=>monthlySource('649')]
])test(name+' complete source imports as a local proposal draft without approval',async()=>{
 const raw=fixture(),before=structuredClone(raw),prepared=prepareOwnPayrollProgrammeSource(raw);
 assert.deepEqual(prepared.incidents,[]);assert.equal(prepared.status,'proposal_draft');
 assert.deepEqual(prepared.presentable,{master:false,programme:true});
 for(const flag of ['approved','executable','payrollCalculated','payrollPosted'])assert.equal(prepared[flag],false);
 const plan=await review(raw,prepared),draft=await applyPreparedProgramDraft(raw.salary,raw.programme,blank(),plan);
 assert.deepEqual(draft,prepared.draft.programme);assert.notEqual(draft,prepared.draft.programme);
 const workspace=prepareProgramWorkspace(raw.programme,draft,'Synthetic proposal review, not municipal authorization');
 assert.equal(workspace.command,'propose');assert.equal(workspace.reviewConfirmed,false);
 assert.equal(raw.programme.program.revision,0);assert.equal(raw.programme.program.approvalId,null);
 assert.equal(Object.hasOwn(plan,'requestKey'),false);assert.equal(Object.hasOwn(plan,'command'),false);
 assert.deepEqual(raw,before);assert.ok(Object.isFrozen(prepared.draft.programme));
});

for(const [name,mutate,expected]of [
 ['incomplete source',raw=>raw.source.complete=false,'SOURCE_SET_INCOMPLETE'],
 ['missing definition',raw=>raw.source.expectedDefinitions++,'SOURCE_SET_INCOMPLETE'],
 ['unresolved expression',raw=>raw.definitions[0].expression={op:'unresolved',reference:'Synthetic missing monetary semantics',unit:'money'},'EXPRESSION_UNRESOLVED'],
 ['unapproved catalogue',raw=>{raw.salary.catalog.revision=0;raw.programme.salaryCatalog.revision=0;},'CATALOGUE_APPROVAL_REQUIRED'],
 ['revoked programme capability',raw=>raw.programme.permissions.canPropose=false,'PROGRAMME_PROPOSAL_NOT_PERMITTED'],
 ['revoked catalogue capability',raw=>raw.salary.permissions.canPropose=false,'MASTER_PROPOSAL_NOT_PERMITTED']
])test(name+' keeps its semantic incident and cannot be imported',async()=>{
 const raw=emissionPreparerEvidence(familyTariffSources({emission:true}));mutate(raw);
 const prepared=prepareOwnPayrollProgrammeSource(raw);
 assert.ok(prepared.incidents.some(i=>i.code===expected));
 await assert.rejects(review(raw,prepared));
 for(const flag of ['approved','executable','payrollCalculated','payrollPosted'])assert.equal(prepared[flag],false);
});

test('the two monthly options do not admit unknown options or malformed declared source hashes',()=>{
 let raw=monthlySource();raw.programmeOptions.ownerOverride=true;
 assert.throws(()=>prepareOwnPayrollProgrammeSource(raw),is('PREPARATION_CONTRACT_INVALID'));
 raw=monthlySource();raw.definitions[0].sourceSha256='unverified';
 assert.throws(()=>prepareOwnPayrollProgrammeSource(raw),is('PREPARATION_CONTRACT_INVALID'));
});

test('monthly policy version, native source, explicit-zero quantity and passthrough semantics remain mandatory',async()=>{
 for(const mutate of [
  raw=>raw.programmeOptions.monthlyForcedAmountsVersion='own-payroll-monthly-forced-amounts.unknown',
  raw=>raw.programmeOptions.monthlyForcedAmountPolicies[0].sourceContract='legacy-import',
  raw=>raw.programmeOptions.monthlyForcedAmountPolicies[0].quantityPolicy='ignore',
  raw=>raw.definitions[0].expression={op:'literal',unit:'money',value:'999'}
 ]){
  const raw=monthlySource();mutate(raw);const prepared=prepareOwnPayrollProgrammeSource(raw);
  assert.equal(prepared.draft.programme,null);assert.equal(prepared.presentable.programme,false);
  assert.ok(prepared.incidents.some(i=>i.code==='PROGRAMME_CURRENT_CONTRACT_REJECTED'));
  await assert.rejects(review(raw,prepared));
 }
});

test('modified evidence is rejected by its complete file hash and rehashing cannot authorize invalid policy semantics',async()=>{
 const raw=monthlySource(),prepared=prepareOwnPayrollProgrammeSource(raw),changed=structuredClone(prepared);
 changed.pins.sourceSha256='0'.repeat(64);
 await assert.rejects(review(raw,changed),is('PROGRAM_PREPARED_HASH_CHANGED'));
 const semantic=structuredClone(prepared);semantic.draft.programme.monthlyForcedAmountPolicies[0].quantityPolicy='ignore';
 await assert.rejects(review(raw,reseal(semantic)),is('MONTHLY_FORCED_POLICY_INVALID'));
});

test('local import replay is deterministic and rechecks current base and permissions before applying',async()=>{
 const raw=monthlySource(),prepared=prepareOwnPayrollProgrammeSource(raw),plan=await review(raw,prepared);
 assert.deepEqual(await review(raw,prepared),plan);
 assert.deepEqual(await applyPreparedProgramDraft(raw.salary,raw.programme,blank(),plan),await applyPreparedProgramDraft(raw.salary,raw.programme,blank(),plan));
 const changed=structuredClone(raw.programme);changed.program.version='9'.repeat(64);
 await assert.rejects(applyPreparedProgramDraft(raw.salary,changed,blank(),plan),is('PROGRAM_PREPARED_BASE_CHANGED'));
 const revoked=structuredClone(raw.programme);revoked.permissions.canPropose=false;
 await assert.rejects(applyPreparedProgramDraft(raw.salary,revoked,blank(),plan),is('PROGRAM_PREPARED_NOT_PERMITTED'));
 assert.equal(raw.programme.program.approvalId,null);assert.equal(raw.programme.program.revision,0);
});

test('nonapplication remains preparation-only and outside normal JSON import',async()=>{
 const fixture=nonapplicationFixture(),prepared=prepareOwnPayrollProgrammeNonapplicationSource(sourceArgs(fixture));
 assert.equal(prepared.version,'own-payroll-programme-nonapplication-preparation.v1');
 assert.equal(prepared.status,'preparation_only');assert.deepEqual(prepared.presentable,{master:false,programme:false});
 assert.ok(prepared.incidents.some(i=>i.code==='NONAPPLICATION_PREPARATION_ONLY'));
 await assert.rejects(review(fixture.source,prepared),is('PROGRAM_PREPARED_INVALID'));
 assert.equal(prepared.approved,false);assert.equal(prepared.executable,false);
});

test('joint nonapplication retains all three explicit preparation gates and immutable preview replay',async()=>{
 const fixture=jointPreviewFixture(),prepared=prepareOwnPayrollProgrammeNonapplicationSource(sourceArgs(fixture));
 assert.deepEqual(prepared.incidents.map(i=>i.code).sort(),['NONAPPLICATION_PREPARATION_ONLY','PROGRAM_FAMILY_TARIFF_PREPARATION_ONLY','PROGRAM_ROW_EMISSION_PREPARATION_ONLY']);
 assert.equal(prepared.status,'preparation_only');assert.deepEqual(prepared.presentable,{master:false,programme:false});
 await assert.rejects(review(fixture.source,prepared),is('PROGRAM_PREPARED_INVALID'));
 const preview=createOwnPayrollJointPreview(jointArgs(fixture));
 assert.deepEqual(verifyOwnPayrollJointPreview(structuredClone(preview)),preview);
 assert.deepEqual(createOwnPayrollJointPreview(jointArgs(fixture)),preview);
 for(const flag of ['approved','registered','officialReceiptReady','payrollPosted','paymentExecuted'])assert.equal(preview[flag],false);
});
