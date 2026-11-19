import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {policyBoundaryMonths,policyCanonicalText,policySha256} from '../assets/own-payroll-policy-validity.js';
import {OWN_PAYROLL_OFFICIAL_TOTALS_VERSION as V1,OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION as V2,normalizeOfficialTotalsPolicy,normalizeOfficialTotalsPolicies,normalizeOfficialTotalsCapture,normalizeOfficialTotalsEvidence,normalizeOwnPayrollOfficialInput,officialTotalsPolicyId,officialTotalsPolicySha256,officialTotalsPoliciesSha256,resolveOfficialTotalsPolicies} from '../assets/own-payroll-official-totals.js';
import {normalizeOfficialTotalsProgram,officialTotalsProgramHistory,selectOfficialTotalsPolicy,captureOfficialTotalsPolicy} from '../assets/own-payroll-official-program.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {ownOfficialCapture,verifiedOwnOfficialCapture,buildOwnOfficialCloseSnapshot,ownOfficialCloseSnapshot,verifiedOwnOfficialCloseSnapshot} from '../assets/own-payroll-official-snapshot-model.js';
import {ownReceiptRecord} from '../assets/own-payroll-receipt-model.js';
import {ownRunOperation,verifyOwnRunReceipt,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {temporalOfficialPolicy,temporalOfficialSources,officialValidityCapture} from './fixtures/own-payroll-official-validity-synthetic.js';
import {temporalPolicySources,policyFixtureHash as hash} from './fixtures/own-payroll-policy-validity-synthetic.js';
import {sealTemporalSources,temporalCloseDetail,temporalReceiptEvidence,temporalTestId} from './fixtures/own-payroll-temporal-capture-synthetic.js';
import {officialCapture} from './fixtures/own-payroll-official-close-synthetic.js';

const all={kind:'all',values:[]},clone=structuredClone,code=expected=>error=>error.code===expected;
const successor=(p,options={})=>temporalOfficialPolicy({validFrom:'2027-01',policyId:'qa-official-successor',supersedes:{policyId:officialTotalsPolicyId(p),policySha256:officialTotalsPolicySha256(p)},...options});
const withPolicies=(source,policies)=>{source.programState.program.definition.officialTotalsPolicies=policies;return sealTemporalSources(source);};
const close=c=>buildOwnOfficialCloseSnapshot(temporalCloseDetail(c),all);

test('one unchanged approved program and one open totals policy serve later months without a yearly rewrite',async()=>{
 const versions=new Set(),definitions=new Set();
 for(const period of ['2026-08','2026-09','2026-10','2026-11','2026-12','2027-08','2027-09','2027-10','2027-11','2027-12','2028-08','2028-09','2028-10','2028-11','2028-12','2035-11']){
  const source=temporalOfficialSources({period}),p=source.programState.program,c=officialValidityCapture(source);
  versions.add(p.version);definitions.add(hash(p.definition));
  assert.equal(p.definition.officialTotalsPolicies.length,1);assert.equal(p.definition.officialTotalsPolicies[0].validUntil,null);
  assert.equal(Object.hasOwn(c.saved.input.officialTotalsPolicy,'period'),false);
  assert.equal(c.saved.input.officialTotalsCapture.period,period);assert.equal(c.saved.input.officialTotalsCapture.policies.length,1);
  await verifiedOwnOfficialCapture(c);verifyOwnRunReceipt(c);
  const s=close(c);await verifiedOwnOfficialCloseSnapshot(s);assert.equal(s.period,period);assert.equal(s.totals.net,'214.01');
  const receipt=temporalReceiptEvidence(c,s);ownReceiptRecord(receipt.record);
  assert.deepEqual(s.sources[0].officialTotalsCapture,c.saved.input.officialTotalsCapture);
  assert.equal(s.paymentExecuted,false);assert.equal(c.saved.result.municipalApprovalVerified,false);
 }
 assert.equal(versions.size,1);assert.equal(definitions.size,1);
});

for(const emission of [false,true])test('V'+(emission?5:4)+' exact API boundary keeps the temporal policy and replays its original capture',async()=>{
 const c=officialValidityCapture(temporalOfficialSources({period:'2028-11',emission})),principal={user:{email:'synthetic@example.invalid'},tenant:{source:'membership',id:temporalTestId(1),membershipId:temporalTestId(2),effectiveCapabilities:RUN_CALCULATE}},session={email:'synthetic@example.invalid',id:temporalTestId(3),version:1,releaseSha:'d'.repeat(40)};
 const calls=[],database={query:async(q,v)=>{calls.push({q,v});return[{result:calls.length===1?{...c,saved:null}:c.saved}];}};
 const response=await ownRunOperation(database,principal,session,'calculate',{key:c.key,body:clone(c.body)},{algorithmHash:()=>c.algorithmSha256});
 assert.equal(calls.length,2);assert.match(calls[1].q,/own_run_complete_official_v1/);
 assert.deepEqual(JSON.parse(calls[1].v[2]),c.saved.input);assert.deepEqual(JSON.parse(calls[1].v[3]),c.saved.result);assert.deepEqual(response.saved,c.saved);
 let replayCalls=0;
 const replay=await ownRunOperation({query:async()=>{replayCalls++;return[{result:{...c,replayed:true}}];}},principal,session,'calculate',{key:c.key,body:clone(c.body)},{algorithmHash:()=>hash('another later engine')});
 assert.equal(replayCalls,1);assert.deepEqual(replay.saved,c.saved);assert.equal(c.saved.input.version,'own-payroll-input.v'+(emission?5:4));
});

test('successor ends the earlier effective interval without changing its policy or an older capture',async()=>{
 const originalSource=temporalOfficialSources({period:'2026-12'}),p=originalSource.programState.program.definition.officialTotalsPolicies[0],before=salarySerialized(p);
 const old=officialValidityCapture(originalSource),oldBytes=salarySerialized(old),oldClose=close(old),oldCloseBytes=salarySerialized(oldClose),q=successor(p);
 const later=withPolicies(temporalOfficialSources({period:'2027-08'}),[p,q]),newCapture=officialValidityCapture(later,2);
 officialTotalsProgramHistory(originalSource.programState.program.definition,later.programState.program.definition);
 assert.equal(newCapture.saved.input.officialTotalsPolicy.policyId,q.policyId);assert.equal(newCapture.saved.input.officialTotalsCapture.policies.length,2);
 const entries=resolveOfficialTotalsPolicies([p,q]);assert.equal(entries[0].validUntil,'2026-12');assert.equal(p.validUntil,null);assert.equal(salarySerialized(p),before);
 assert.equal(selectOfficialTotalsPolicy(later.programState.program.definition,'2026-12','monthly',later.population.employees).policyId,p.policyId);
 await verifiedOwnOfficialCapture(old);await verifiedOwnOfficialCloseSnapshot(oldClose);await verifiedOwnOfficialCapture(newCapture);await verifiedOwnOfficialCloseSnapshot(close(newCapture));
 assert.equal(salarySerialized(old),oldBytes);assert.equal(salarySerialized(oldClose),oldCloseBytes);
});

test('a finite predecessor is never extended across a declared gap',()=>{
 const p=temporalOfficialPolicy({validUntil:'2026-10'}),q=successor(p),entries=resolveOfficialTotalsPolicies([p,q]);
 assert.equal(entries[0].validUntil,'2026-10');
 const source=temporalOfficialSources();source.programState.program.definition.officialTotalsPolicies=[p,q];
 assert.throws(()=>selectOfficialTotalsPolicy(source.programState.program.definition,'2026-11','monthly',source.population.employees),code('OFFICIAL_TOTALS_POLICY_REQUIRED'));
});

for(const [label,mutate,expected] of [
 ['missing predecessor',(p,q)=>q.supersedes.policyId='missing','POLICY_PREDECESSOR_MISSING'],
 ['changed whole predecessor hash',(p,q)=>q.supersedes.policySha256='f'.repeat(64),'POLICY_PREDECESSOR_CHANGED'],
 ['crossed agreement',(p,q)=>q.agreementCode='2','POLICY_SUCCESSION_SCOPE_CHANGED'],
 ['same start',(p,q)=>q.validFrom=p.validFrom,'POLICY_SUCCESSION_DATE_INVALID'],
 ['cycle',(p,q)=>{p.supersedes={policyId:q.policyId,policySha256:hash(q)};},'POLICY_SUCCESSION_CYCLE'],
 ['branch',(p,q,list)=>list.push(successor(p,{validFrom:'2028-01',policyId:'third'})),'POLICY_SUCCESSION_BRANCH'],
 ['unlinked overlap',(p,q)=>q.supersedes=null,'POLICY_VALIDITY_OVERLAP'],
 ['duplicate ID',(p,q)=>q.policyId=p.policyId,'POLICY_ID_DUPLICATE'],
])test('totals succession rejects '+label,()=>{
 const p=temporalOfficialPolicy(),q=successor(p),list=[p,q];mutate(p,q,list);assert.throws(()=>resolveOfficialTotalsPolicies(list),code(expected));
});

test('new totals normalization keeps exact coverage and declaration fields',()=>{
 const p=temporalOfficialPolicy();assert.deepEqual(normalizeOfficialTotalsPolicies([p],V2),[p]);
 for(const mutate of [p=>delete p.validUntil,p=>delete p.supersedes,p=>p.period='2027-01',p=>p.liquidationType='sac',p=>p.nonPositiveNet='allow',p=>p.rounding.mode='half_even',p=>p.totalCodes['999']=p.totalCodes['998'],p=>p.contributions['995'].push('1'),p=>p.sourceSha256='bad']){
  const bad=clone(p);mutate(bad);assert.throws(()=>normalizeOfficialTotalsPolicy(bad));
 }
 assert.throws(()=>normalizeOfficialTotalsPolicies([p],V1),code('OFFICIAL_TOTALS_VERSION_INVALID'));
});

test('interval coverage checks rule starts and ends including gaps far beyond 2028',()=>{
 const p=temporalOfficialSources().programState.program.definition;
 assert.deepEqual(policyBoundaryMonths({validFrom:'2026-08',validUntil:null},[{validFrom:'2035-02',validUntil:'2044-11'}]),['2026-08','2035-02','2044-12']);
 const auxEnds=clone(p);auxEnds.rules.find(r=>r.code===p.officialTotalsPolicies[0].totalCodes['999']).validUntil='2035-12';
 assert.throws(()=>normalizeOfficialTotalsProgram(auxEnds),code('OFFICIAL_TOTAL_RULE_REQUIRED'));
 const newPayable=clone(p),extra=clone(newPayable.rules.find(r=>r.nature==='remuneration'));Object.assign(extra,{code:'777',validFrom:'2040-01'});newPayable.rules.push(extra);
 assert.throws(()=>normalizeOfficialTotalsProgram(newPayable),code('OFFICIAL_TOTAL_CLOSURE_REQUIRED'));
 const lost=clone(p);lost.rules.find(r=>r.code==='48'&&r.nature==='remuneration').validUntil='2037-07';
 assert.throws(()=>normalizeOfficialTotalsProgram(lost),code('OFFICIAL_TOTAL_CLOSURE_REQUIRED'));
});

test('a declared successor can change the complete contribution closure at a future rule boundary',()=>{
 const program=temporalOfficialSources({emission:false}).programState.program.definition,p=program.officialTotalsPolicies[0];
 const added=clone(program.rules.find(r=>r.nature==='remuneration'));Object.assign(added,{code:'777',validFrom:'2035-01'});program.rules.push(added);
 const q=successor(p,{validFrom:'2035-01',contributions:{...clone(p.contributions),'993':[...p.contributions['993'],'777']}});program.officialTotalsPolicies.push(q);
 assert.equal(normalizeOfficialTotalsProgram(program).officialTotalsPolicies.length,2);assert.equal(p.validUntil,null);
});

test('emission interval must remain covered by official totals and quantity phases',()=>{
 const source=temporalOfficialSources(),p=source.programState.program.definition,items=source.programState.salaryCatalog.items;
 const gap=clone(p);gap.officialTotalsPolicies[0].validUntil='2034-12';
 assert.throws(()=>ownProgramDefinition(gap,items),code('ROW_EMISSION_TOTAL_DESTINATION_REQUIRED'));
 const quantities=clone(p);quantities.quantityPhases.find(p=>p.code==='1').validUntil='2034-12';
 assert.throws(()=>ownProgramDefinition(quantities,items),code('ROW_EMISSION_QUANTITY_REQUIRED'));
});

test('capture selection is derived from lineage, period and scope before comparing its ID',()=>{
 const source=withPolicies(temporalOfficialSources(),(()=>{const p=temporalOfficialPolicy();return[p,successor(p)];})()),p=source.programState.program.definition;
 const evidence=captureOfficialTotalsPolicy(p,'2028-08','monthly',source.population.employees);
 assert.equal(normalizeOfficialTotalsEvidence(evidence).context.period,'2028-08');
 for(const mutate of [c=>c.selectedPolicyId=c.policies[0].policyId,c=>c.period='2026-07',c=>c.agreementCode='2',c=>c.policies.pop(),c=>c.policies[0].sourceReference+=' changed',c=>c.policiesSha256='f'.repeat(64)]){
  const bad=clone(evidence.officialTotalsCapture);mutate(bad);assert.throws(()=>normalizeOfficialTotalsCapture(bad));
 }
 assert.throws(()=>normalizeOfficialTotalsEvidence({officialTotalsPolicy:evidence.officialTotalsPolicy}),code('OFFICIAL_TOTALS_CAPTURE_REQUIRED'));
 const wrong=clone(evidence);wrong.officialTotalsPolicy=wrong.officialTotalsCapture.policies[0];assert.throws(()=>normalizeOfficialTotalsEvidence(wrong),code('OFFICIAL_STORED_POLICY_MISMATCH'));
});

test('capture cannot replace the full scoped lineage from its original approved program',()=>{
 const p=temporalOfficialPolicy(),q=successor(p),c=officialValidityCapture(withPolicies(temporalOfficialSources({period:'2026-12'}),[p,q]));
 const input=c.saved.input;input.officialTotalsCapture.policies=[p];input.officialTotalsCapture.policiesSha256=officialTotalsPoliciesSha256([p]);
 c.saved.inputSha256=hash(input);
 assert.throws(()=>ownOfficialCapture(c),code('CLOSE_OFFICIAL_CONTRACT_INVALID'));
});

for(const [label,mutate] of [
 ['missing proof',s=>delete s.sources[0].officialTotalsCapture],
 ['wrong period',s=>s.sources[0].officialTotalsCapture.period='2025-12'],
 ['wrong agreement',s=>s.sources[0].officialTotalsCapture.agreementCode='2'],
 ['wrong policy ID',s=>s.sources[0].officialTotalsCapture.selectedPolicyId='forged'],
 ['changed policy',s=>s.sources[0].officialTotalsCapture.policies[0].sourceSha256='f'.repeat(64)],
 ['unknown evidence',s=>s.sources[0].effectiveUntil='2099-12'],
 ['changed net',s=>s.employees[0].totals.net='1.00'],
])test('closed totals reject '+label,()=>{
 const s=close(officialValidityCapture());mutate(s);assert.throws(()=>ownOfficialCloseSnapshot(s));
});

test('legacy V1 policy and capture remain byte identical and can precede an explicit V2 policy',async()=>{
 const c=officialCapture('legacy_v4_unchanged'),before=salarySerialized(c);await verifiedOwnOfficialCapture(c);verifyOwnRunReceipt(c);assert.equal(salarySerialized(c),before);assert.equal(Object.hasOwn(c.saved.input,'officialTotalsCapture'),false);
 const legacy=clone(c.saved.input.officialTotalsPolicy),source=temporalOfficialSources({period:'2027-08'}),q=successor(legacy);
 source.programState.program.definition.officialTotalsPolicies=[legacy,q];const normalized=normalizeOfficialTotalsPolicies([legacy,q],V2);assert.deepEqual(normalized.find(p=>p.version===V1),legacy);
 assert.equal(resolveOfficialTotalsPolicies(normalized).find(e=>e.policyId===officialTotalsPolicyId(legacy)).validUntil,legacy.period);
 officialTotalsProgramHistory({officialTotalsVersion:V1,officialTotalsPolicies:[legacy]},source.programState.program.definition);
 assert.throws(()=>officialTotalsProgramHistory({officialTotalsVersion:V1,officialTotalsPolicies:[legacy]},{...source.programState.program.definition,officialTotalsPolicies:[q]}),code('PROGRAM_HISTORY_REQUIRED'));
});

test('legacy decomposed Unicode is hashed as stored; new policies require NFC',()=>{
 const legacy=clone(officialCapture('legacy_v4_unchanged').saved.input.officialTotalsPolicy);legacy.sourceReference='Poli\u0301tica histo\u0301rica anterior';
 assert.deepEqual(normalizeOfficialTotalsPolicy(legacy),legacy);
 const expected=createHash('sha256').update(salarySerialized(legacy)).digest('hex');assert.equal(officialTotalsPolicySha256(legacy),expected);
 assert.throws(()=>policyCanonicalText(legacy),code('POLICY_CANONICAL_INVALID'));
 const q=successor(legacy);assert.equal(resolveOfficialTotalsPolicies([legacy,q]).length,2);
 const array=normalizeOfficialTotalsPolicies([legacy,q],V2);assert.equal(officialTotalsPoliciesSha256(array),createHash('sha256').update(salarySerialized(array)).digest('hex'));
 assert.throws(()=>temporalOfficialPolicy({sourceReference:'Poli\u0301tica nueva'}),code('POLICY_CANONICAL_INVALID'));
 assert.equal(policySha256({sourceReference:'Política nueva'}),createHash('sha256').update(salarySerialized({sourceReference:'Política nueva'})).digest('hex'));
});

test('new proof cannot be added to an unrelated historical shape or omitted from the input',()=>{
 const c=officialValidityCapture(temporalOfficialSources({emission:false})),raw=clone(c.saved.input);delete raw.officialTotalsCapture;assert.throws(()=>normalizeOwnPayrollOfficialInput(raw),code('OFFICIAL_TOTALS_CAPTURE_REQUIRED'));
 const s=close(c);s.sources[0].inputVersion='own-payroll-input.v2';s.sources[0].resultVersion='own-payroll-result.v2';s.sources[0].officialTotalsPolicy=null;s.sources[0].quantityPhasesVersion=null;s.sources[0].quantityPhases=[];assert.throws(()=>ownOfficialCloseSnapshot(s));
});

test('async closed validation freezes the whole official lineage before awaiting hashes',async()=>{
 const original=close(officialValidityCapture()),before=clone(original),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),actual=globalThis.crypto;
 let entered,release;const reached=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let count=0;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(...args){if(++count===1){entered();await gate;}return actual.subtle.digest(...args);}}}});
 try{const pending=verifiedOwnOfficialCloseSnapshot(original);await reached;original.sources[0].officialTotalsCapture.policies[0].sourceReference='changed during await';release();assert.deepEqual(await pending,before);}finally{release();Object.defineProperty(globalThis,'crypto',descriptor);}
});
