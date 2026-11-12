import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {salarySerialized,salaryItems} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {policyValidity,policyAppliesTo,policyCanonicalText,policySha256} from '../assets/own-payroll-policy-validity.js';
import {OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION as T3,normalizeFamilyTariffPolicy,proposeFamilyTariffPolicyV3,selectFamilyTariffPolicies,resolveFamilyTariffPolicies,familyTariffPolicyId,familyTariffProgramHistory,normalizeFamilyTariffCapture} from '../assets/own-payroll-family-tariffs.js';
import {OWN_PAYROLL_ROW_EMISSION_V2_VERSION as E2,normalizeRowEmissionPolicies,selectRowEmissionPolicies,resolveRowEmissionPolicies,rowEmissionPolicyId,calculateOwnPayrollWithRowEmission,verifyOwnPayrollRowEmissionResult,rowEmissionBaseInput,rowEmissionBaseResult} from '../assets/own-payroll-row-emission.js';
import {calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {prepareOwnPayrollFamilyTariffApprovedInput} from '../lib/own-payroll-approved-input.js';
import {prepareOwnPayrollFamilyTariffSnapshot,createOwnPayrollFamilyTariffSnapshot,verifyOwnPayrollFamilyTariffSnapshot} from '../lib/own-payroll-family-tariff-snapshot.js';
import {familyTariffSources,tariffPolicy} from './fixtures/own-payroll-family-tariff-synthetic.js';
import {temporalPolicySources,temporalTariffPolicy,temporalEmissionPolicies} from './fixtures/own-payroll-policy-validity-synthetic.js';
import {sealFamilySources} from './fixtures/own-payroll-family-consumer-synthetic.js';

const clone=v=>structuredClone(v),hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex'),fails=code=>e=>e?.code===code;
const tariffProgram=policies=>({familyTariffsVersion:T3,familyTariffPolicies:policies});
const emissionProgram=policies=>({rowEmissionVersion:E2,rowEmissionPolicies:policies});
const tariffSuccessor=(prior,options={})=>temporalTariffPolicy({validFrom:'2027-01',validUntil:null,rate:'9.00',supersedes:{policyId:familyTariffPolicyId(prior),policySha256:hash(prior)},...options});
const emissionSuccessors=(prior,{validFrom='2028-01',validUntil=null}={})=>temporalEmissionPolicies({validFrom,validUntil}).map(p=>({...p,supersedes:{policyId:rowEmissionPolicyId(prior.find(q=>q.conceptCode===p.conceptCode)),policySha256:hash(prior.find(q=>q.conceptCode===p.conceptCode))}}));
const resultAmount=(snapshot,code)=>snapshot.result.rows.find(r=>r.nature!=='auxiliary'&&r.conceptCode===code).amount;
function emissionInput(options={}){
 // Explicit typed calculation fixture. Production approved-input wiring is
 // exercised separately by the temporal integration candidate.
 const sources=temporalPolicySources({...options,emission:false}),base=prepareOwnPayrollFamilyTariffApprovedInput(sources);
 return{...base,version:'own-payroll-input.v5',rowEmissionVersion:E2,rowEmissionPolicies:temporalEmissionPolicies({validFrom:options.validFrom??base.period,validUntil:Object.hasOwn(options,'validUntil')?options.validUntil:base.period})};
}

test('canonical SHA256 matches independent Node and WebCrypto at block boundaries and Unicode NFC',async()=>{
 const values=[null,'',{z:null,a:['café','acción','工場','😀','123.45000000'],n:-7,b:true},... [55,56,63,64,65,119,120,127,128,129,1024,4096].map(n=>'x'.repeat(n-2)),temporalTariffPolicy({validUntil:null})];
 for(const value of values){const text=salarySerialized(value);assert.equal(policyCanonicalText(value),text);assert.equal(policySha256(value),hash(value));assert.equal(policySha256(value),Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).toString('hex'));}
 assert.notEqual(policySha256({x:null}),policySha256({}));assert.notEqual(policySha256(['1','2']),policySha256(['2','1']));assert.notEqual(policySha256('1.00'),policySha256('1.0'));
});
for(const [label,value]of [['decomposed Unicode','cafe\u0301'],['NUL','\u0000'],['lone surrogate','\ud800'],['fractional number',1.5],['negative numeric zero',-0],['non-ASCII key',{'á':'text'}],['sparse array',Array(1)]])test('canonical rejection: '+label,()=>assert.throws(()=>policySha256(value),fails('POLICY_CANONICAL_INVALID')));
test('canonical metadata and policy constructors reject accessors without invoking them',()=>{
 let calls=0;const value={};Object.defineProperty(value,'x',{enumerable:true,get(){calls++;return'bad';}});assert.throws(()=>policySha256(value),fails('POLICY_CANONICAL_INVALID'));
 const {version,...raw}=temporalTariffPolicy();Object.defineProperty(raw,'sourceReference',{enumerable:true,get(){calls++;return'bad';}});assert.throws(()=>proposeFamilyTariffPolicyV3(raw));assert.equal(calls,0);
});
for(const period of ['2026-08','2026-09','2026-10','2026-11','2026-12','2027-08','2027-09','2027-10','2027-11','2027-12','2028-01','2028-08','2028-09','2028-10','2028-11','2028-12','2031-03'])test('declared open tariff calculates '+period+' without annual code changes',()=>{
 const snapshot=prepareOwnPayrollFamilyTariffSnapshot(temporalPolicySources({period,validFrom:'2026-08',validUntil:null,rate:'7.00',emission:false}));
 assert.equal(snapshot.input.familyTariffCapture.version,'own-payroll-family-tariff-capture.v2');assert.equal(snapshot.input.familyTariffCapture.period,period);assert.equal(resultAmount(snapshot,'302'),'7.00');assert.equal(resultAmount(snapshot,'306'),'7.00');assert.equal(snapshot.input.familyTariffCapture.policies[0].validUntil,null);assert.deepEqual(verifyOwnPayrollFamilyTariffSnapshot(snapshot),snapshot);
});
test('finite validity is inclusive and never carries a table into an undeclared month/type/agreement',()=>{
 const policy=temporalTariffPolicy({validFrom:'2027-08',validUntil:'2027-12'}),program=tariffProgram([policy]);
 for(const period of ['2027-08','2027-12'])assert.deepEqual(selectFamilyTariffPolicies(program,period,'monthly',['1']),[policy]);
 for(const [period,type,agreement]of [['2027-07','monthly','1'],['2028-01','monthly','1'],['2027-08','sac','1'],['2027-08','monthly','2']])assert.throws(()=>selectFamilyTariffPolicies(program,period,type,[agreement]),fails('FAMILY_TARIFF_POLICY_REQUIRED'));
});
for(const mutate of [p=>delete p.validUntil,p=>p.validUntil='2027-07',p=>p.validFrom='2027-13',p=>p.validUntil=undefined])test('invalid or omitted validity fails explicitly '+mutate.toString(),()=>{const p=temporalTariffPolicy();mutate(p);assert.throws(()=>normalizeFamilyTariffPolicy(p));});
test('open tariff successor changes selection at its declared month and leaves original source bytes intact',()=>{
 const prior=temporalTariffPolicy({validFrom:'2026-08',validUntil:null}),before=salarySerialized(prior),next=tariffSuccessor(prior),program=tariffProgram([next,prior]);
 assert.deepEqual(selectFamilyTariffPolicies(program,'2026-12','monthly',['1']),[prior]);assert.deepEqual(selectFamilyTariffPolicies(program,'2027-01','monthly',['1']),[next]);assert.deepEqual(selectFamilyTariffPolicies(program,'2028-12','monthly',['1']),[next]);
 assert.equal(resolveFamilyTariffPolicies([prior,next])[0].validUntil,'2026-12');assert.equal(salarySerialized(prior),before);assert.equal(prior.validUntil,null);
});
test('successor cannot extend a declared finite predecessor or fill a gap implicitly',()=>{
 const prior=temporalTariffPolicy({validFrom:'2026-08',validUntil:'2026-10'}),next=tariffSuccessor(prior);
 assert.equal(resolveFamilyTariffPolicies([prior,next])[0].validUntil,'2026-10');assert.throws(()=>selectFamilyTariffPolicies(tariffProgram([prior,next]),'2026-11','monthly',['1']),fails('FAMILY_TARIFF_POLICY_REQUIRED'));
});
for(const [name,alter,expected]of [
 ['missing predecessor',(a,b)=>[b],'POLICY_PREDECESSOR_MISSING'],
 ['altered predecessor hash',(a,b)=>[a,{...b,supersedes:{...b.supersedes,policySha256:'f'.repeat(64)}}],'POLICY_PREDECESSOR_CHANGED'],
 ['different scope',(a,b)=>[a,{...b,agreementCode:'2'}],'POLICY_SUCCESSION_SCOPE_CHANGED'],
 ['non-increasing date',(a,b)=>[a,{...b,validFrom:a.validFrom}],'POLICY_SUCCESSION_DATE_INVALID'],
 ['ambiguous branch',(a,b)=>[a,b,{...b,policyId:'another-successor',validFrom:'2028-01'}],'POLICY_SUCCESSION_BRANCH'],
 ['unlinked overlap',(a,b)=>[a,{...b,supersedes:null}],'POLICY_VALIDITY_OVERLAP'],
 ['duplicate identity',(a,b)=>[a,{...b,policyId:a.policyId}],'POLICY_ID_DUPLICATE'],
 ['cycle',(a,b)=>[{...a,supersedes:{policyId:b.policyId,policySha256:hash(b)}},b],'POLICY_SUCCESSION_CYCLE']
])test('tariff succession rejects '+name,()=>{const a=temporalTariffPolicy({validFrom:'2026-08',validUntil:null}),b=tariffSuccessor(a);assert.throws(()=>selectFamilyTariffPolicies(tariffProgram(alter(a,b)),'2028-01','monthly',['1']),fails(expected));});
test('legacy IDs and full hashes can be referenced without rewriting historical policy bodies',()=>{
 const legacy=tariffPolicy(),original=salarySerialized(legacy),next=tariffSuccessor(legacy),before={familyTariffsVersion:legacy.version,familyTariffPolicies:[legacy]},after=tariffProgram([legacy,next]);
 familyTariffProgramHistory(before,after);assert.equal(familyTariffPolicyId(legacy),'legacy:family-tariff:1:2026-10:monthly');assert.deepEqual(selectFamilyTariffPolicies(after,'2026-10','monthly',['1']),[legacy]);assert.deepEqual(selectFamilyTariffPolicies(after,'2027-01','monthly',['1']),[next]);assert.equal(salarySerialized(legacy),original);
 const changed=clone(after);changed.familyTariffPolicies[0].sourceSha256='f'.repeat(64);assert.throws(()=>familyTariffProgramHistory(before,changed),fails('PROGRAM_HISTORY_REQUIRED'));
});
test('captured earlier open tariff replays byte-identically after a successor is added to another revision',()=>{
 const old=prepareOwnPayrollFamilyTariffSnapshot(temporalPolicySources({period:'2026-12',validFrom:'2026-08',validUntil:null,emission:false})),oldHash=hash(old);
 const source=temporalPolicySources({period:'2028-10',validFrom:'2026-08',validUntil:null,emission:false}),prior=source.programState.program.definition.familyTariffPolicies[0];source.programState.program.definition.familyTariffPolicies.push(tariffSuccessor(prior));
 const latest=prepareOwnPayrollFamilyTariffSnapshot(source);assert.equal(resultAmount(old,'302'),'7.00');assert.equal(resultAmount(latest,'302'),'9.00');assert.equal(latest.input.familyTariffCapture.policies.length,2);assert.equal(hash(verifyOwnPayrollFamilyTariffSnapshot(old)),oldHash);assert.equal(old.input.familyTariffCapture.policies.length,1);assert.equal(old.input.familyTariffCapture.policies[0].validUntil,null);
 const input=clone(latest.input);input.familyTariffCapture.policies.shift();input.familyTariffCapture.policySha256=hash(input.familyTariffCapture.policies);assert.throws(()=>createOwnPayrollFamilyTariffSnapshot(input),fails('POLICY_PREDECESSOR_MISSING'));
});
test('multi-agreement programs capture only the population agreement while preserving its full lineage',()=>{
 const source=temporalPolicySources({period:'2028-08',validFrom:'2027-01',validUntil:null,emission:false}),p=source.programState.program.definition;
 for(const field of ['rules','bindings','quantityPhases','officialTotalsPolicies'])p[field].push(...p[field].map(x=>({...clone(x),agreementCode:'2'})));
 p.familyTariffPolicies.push(temporalTariffPolicy({validFrom:'2027-01',validUntil:null,agreementCode:'2',rate:'900.00'}));
 source.programState.salaryCatalog.items=salaryItems([...source.programState.salaryCatalog.items,...source.programState.salaryCatalog.items.map(x=>({...clone(x),agreementCode:'2'}))]);
 source.programState.program.definition=ownProgramDefinition(p,source.programState.salaryCatalog.items);sealFamilySources(source);
 const input=prepareOwnPayrollFamilyTariffApprovedInput(source);assert.ok(input.familyTariffCapture.policies.every(p=>p.agreementCode==='1'));assert.ok(input.familyTariffCapture.bindings.every(b=>b.agreementCode==='1'));assert.equal(resultAmount(createOwnPayrollFamilyTariffSnapshot(input),'302'),'7.00');
 const bad=clone(input.familyTariffCapture);bad.policies.push(p.familyTariffPolicies.find(p=>p.agreementCode==='2'));assert.throws(()=>normalizeFamilyTariffCapture(bad,input.employees,input.period,input.liquidationType),fails('FAMILY_TARIFF_CAPTURE_SCOPE_CHANGED'));
});
test('tariff source mappings bind the declared monetary concept and table hash, not positional offsets',()=>{
 const source=temporalPolicySources({period:'2028-01',validUntil:null,emission:false});source.programState.program.definition.familyTariffPolicies[0].mappings[0].conceptCode='999';assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(source),fails('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));
 const bad=temporalPolicySources({period:'2028-01',emission:false});bad.programState.program.definition.familyTariffPolicies[0].rows[0].amount='800.00';assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(bad),fails('FAMILY_TARIFF_ROWS_CHANGED'));
});
test('unread temporal tariff branches preserve null family facts and never invent missing values',()=>{
 const source=temporalPolicySources({period:'2028-01',validUntil:null,days:'14',emission:false});source.familyPayrollFacts.records[0].definition.tariffSelection={region:null,semesterAverage:null};sealFamilySources(source);
 assert.ok(prepareOwnPayrollFamilyTariffSnapshot(source).result.familyTariffDecisions.every(d=>d.status==='not_requested'&&d.value===null));
 const requested=temporalPolicySources({period:'2028-01',emission:false});requested.familyPayrollFacts.records[0].definition.tariffSelection.region=null;sealFamilySources(requested);assert.throws(()=>prepareOwnPayrollFamilyTariffSnapshot(requested),fails('FAMILY_TARIFF_FACT_MISSING'));
});
for(const period of ['2027-08','2027-12','2028-01','2028-10','2031-03'])test('explicit future emission leaves exact economic rows/totals unchanged '+period,()=>{
 const input=emissionInput({period,validFrom:'2027-01',validUntil:null,days:'14'}),result=calculateOwnPayrollWithRowEmission(input),base=calculateOwnPayrollWithOfficialTotals(rowEmissionBaseInput(input));
 assert.deepEqual(rowEmissionBaseResult(result),base);assert.equal(result.rowEmissions.filter(d=>d.decision==='omit').length,2);assert.equal(result.rowCount,12);assert.deepEqual(verifyOwnPayrollRowEmissionResult(input,result),result);
});
test('emission succession retains complete source chains and selects only effective decisions',()=>{
 const input=emissionInput({period:'2028-08',validFrom:'2027-01',validUntil:null}),prior=input.rowEmissionPolicies,next=emissionSuccessors(prior);input.rowEmissionPolicies=normalizeRowEmissionPolicies([...prior,...next],E2);
 const result=calculateOwnPayrollWithRowEmission(input);assert.equal(result.rowEmissionPolicies.length,4);assert.equal(result.rowEmissions.length,2);assert.ok(result.rowEmissions.every(d=>d.policyKey.includes('2028-01')));assert.ok(prior.every(p=>p.validUntil===null));assert.equal(resolveRowEmissionPolicies(input.rowEmissionPolicies).filter(e=>e.validUntil==='2027-12').length,2);
 assert.deepEqual(selectRowEmissionPolicies(emissionProgram(input.rowEmissionPolicies),'2027-12','monthly','1'),prior);
 const bad=clone(input);bad.rowEmissionPolicies=next;assert.throws(()=>calculateOwnPayrollWithRowEmission(bad),fails('POLICY_PREDECESSOR_MISSING'));
});
test('emission preserves the explicitly declared quantity stage, comparison and numeric domain',()=>{
 const input=emissionInput({period:'2028-10',days:'14.4'}),q=input.quantityPhases.find(q=>q.code==='1');q.stage='rounded';q.rounding={precision:0,mode:'half_up'};
 for(const p of input.rowEmissionPolicies)Object.assign(p.conditions[0],{stage:'rounded',operator:'ge',value:'14'});
 const result=calculateOwnPayrollWithRowEmission(input);assert.ok(result.rowEmissions.every(d=>d.decision==='emit'));assert.deepEqual(result.rowEmissions[0].conditions[0].observed,{numerator:'14',denominator:'1'});
 const bad=clone(input);bad.rowEmissionPolicies[0].conditions[0].stage='exact';assert.throws(()=>calculateOwnPayrollWithRowEmission(bad),fails('ROW_EMISSION_QUANTITY_REQUIRED'));
});
test('false temporal emission cannot hide a nonzero exact fraction that rounds to zero',()=>{
 const input=emissionInput({period:'2028-01',days:'14'});input.rules.find(r=>r.code==='302').expression={op:'literal',unit:'money',value:'0.001'};assert.throws(()=>calculateOwnPayrollWithRowEmission(input),fails('ROW_EMISSION_NONZERO_CONTRIBUTION'));
});
test('nonnegative integer quantity domain rejects an invented fractional entitlement',()=>{
 const input=emissionInput({period:'2028-01',children:'0'});input.quantityPhases.find(q=>q.code==='302').expression={op:'literal',unit:'units',value:'0.5'};assert.throws(()=>calculateOwnPayrollWithRowEmission(input),fails('ROW_EMISSION_QUANTITY_INVALID'));
});
test('new policies do not silently broaden liquidation types or manufacture missing official monthly policies',()=>{
 const p=temporalEmissionPolicies();p[0].liquidationType='sac';assert.throws(()=>normalizeRowEmissionPolicies(p,E2),fails('ROW_EMISSION_SCOPE_UNSUPPORTED'));
 const source=temporalPolicySources({period:'2027-08',validFrom:'2027-08',validUntil:null,emission:false});source.period='2027-09';for(const k of ['list','export'])source.fixed[k].data.periodMonth='2027-09-01';assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(source));
});
test('legacy October snapshot SHA and explicit single-month policy stay unchanged',()=>{
 assert.equal(hash(prepareOwnPayrollFamilyTariffSnapshot(familyTariffSources({quantity:'2'}))),'49205d7e696c971c88a147e121f93ff9ebd34fd0ed6771bd196dd4058d354bc3');const p=tariffPolicy();assert.deepEqual(policyValidity(p),{validFrom:'2026-10',validUntil:'2026-10'});assert.equal(policyAppliesTo(p,{period:'2027-10',liquidationType:'monthly',agreementCode:'1'}),false);
});
