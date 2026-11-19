import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forcedHash,forcedLegacyPolicy,forcedTemporalPolicy,forcedValiditySources,forcedValiditySnapshot,forcedValidityCapture} from './fixtures/own-monthly-forced-validity-synthetic.js';
import {normalizeMonthlyForcedProgram,monthlyForcedProgramHistory,monthlyForcedSourceResolver,monthlyForcedCaptureSourceRecords,monthlyForcedCaptureHashChecks,resolveMonthlyForcedPolicies,monthlyForcedPolicyId,OWN_MONTHLY_FORCED_AMOUNT_VERSION as V1,OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION as V2} from '../assets/own-payroll-monthly-forced-amounts.js';
import {normalizeQuantityOnlyProgram} from '../assets/own-payroll-quantity-only-inputs.js';
import {ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {verifiedOwnOfficialCapture} from '../assets/own-payroll-official-snapshot-model.js';
import {programWorkspaceChanges,describeProgramPolicy,prepareProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {rule,lit} from './fixtures/own-payroll-synthetic.js';

const clone=structuredClone,program=s=>s.programState.program.definition,batch=s=>s.monthly.nativeBatches[0],is=code=>e=>e.code===code;
const golden=JSON.parse(readFileSync(new URL('./fixtures/own-monthly-forced-v1-golden.synthetic.json',import.meta.url),'utf8'));
for(const c of golden.cases)test('V1 bytes match independent exact-135e export: '+c.name,async()=>{
 const s=forcedValiditySources(c.options),snapshot=forcedValiditySnapshot(s),checks=await monthlyForcedCaptureHashChecks(s,snapshot.input,snapshot.result,async v=>forcedHash(v));
 assert.equal(forcedHash(program(s)),c.programmeSha256);assert.equal(forcedHash(snapshot.input),c.inputSha256);assert.equal(forcedHash(snapshot.result),c.resultSha256);assert.equal(forcedHash(snapshot),c.snapshotSha256);
 assert.equal(forcedHash(monthlyForcedCaptureSourceRecords(s,snapshot.input,snapshot.result)),c.sourceRecordsSha256);assert.equal(forcedHash(checks),c.hashChecksSha256);
});
for(const month of ['2027-08','2027-09','2027-10','2027-11','2027-12','2028-01','2028-08','2028-12'])for(const code of ['609','649'])test(`${code} one policy preserves original amount and proof in ${month}`,async()=>{
 const s=forcedValiditySources({period:month,code}),snapshot=forcedValiditySnapshot(s),p=program(s).monthlyForcedAmountPolicies[0];
 assert.equal(snapshot.result.rows.find(r=>r.conceptCode===code).amount,'20.00');assert.equal(program(s).monthlyForcedAmountPolicies.length,1);assert.equal(p.validUntil,null);assert.equal(p.validFrom,'2027-08');
 const records=monthlyForcedCaptureSourceRecords(s,snapshot.input,snapshot.result);assert.equal(records.length,1);assert.deepEqual(records[0].forced,{version:V2,policy:p});
 for(const [value,hash]of await monthlyForcedCaptureHashChecks(s,snapshot.input,snapshot.result,async v=>forcedHash(v)))assert.equal(forcedHash(value),hash);
});
for(const cents of ['0','-100','123456789012345678'])test('exact cents remain original: '+cents,()=>{
 const s=forcedValiditySources({amount:cents}),snapshot=forcedValiditySnapshot(s),n=BigInt(cents),a=n<0n?-n:n;
 assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='609').amount,(n<0n?'-':'')+(a/100n)+'.'+(a%100n).toString().padStart(2,'0'));
});
test('finite end is inclusive and the next January has no implicit policy',()=>{
 const s=forcedValiditySources({validUntil:'2027-12'}),resolve=monthlyForcedSourceResolver(program(s)),row=batch(s).rows[0].values;
 const args={row,family:'monthly',agreementCode:'1',liquidationType:'monthly',sourceContract:batch(s).version};assert.ok(resolve({...args,period:'2027-12'}));assert.equal(resolve({...args,period:'2028-01'}),null);
 assert.throws(()=>forcedValiditySnapshot(forcedValiditySources({period:'2028-01',validUntil:'2027-12'})),is('FORCED_RULE_REQUIRED'));
});
test('continuous equivalent rules cover December then January without copying the policy',()=>{
 const s=forcedValiditySources(),r=program(s).rules.find(r=>r.code==='609');r.validUntil='2027-12';program(s).rules.push({...clone(r),validFrom:'2028-01',validUntil:null});
 assert.equal(normalizeMonthlyForcedProgram(program(s)).monthlyForcedAmountPolicies.length,1);
});
for(const [label,mutate,code]of[
 ['missing January',p=>{const r=p.rules.find(r=>r.code==='609');r.validUntil='2027-12';p.rules.push({...clone(r),validFrom:'2028-02',validUntil:null});},'MONTHLY_FORCED_RULE_REQUIRED'],
 ['different future expression',p=>{const r=p.rules.find(r=>r.code==='609');r.validUntil='2027-12';p.rules.push({...clone(r),validFrom:'2028-01',validUntil:null,expression:lit('1','money')});},'MONTHLY_FORCED_PASSTHROUGH_REQUIRED'],
 ['finite rule for open policy',p=>{p.rules.find(r=>r.code==='609').validUntil='2028-12';},'MONTHLY_FORCED_RULE_REQUIRED'],
 ['overlapping monetary rules',p=>p.rules.push({...clone(p.rules.find(r=>r.code==='609')),validFrom:'2028-01'}),'MONTHLY_FORCED_RULE_REQUIRED'],
 ['quantity added in future',p=>p.quantityPhases=[{...rule('609',lit('0','units')),validFrom:'2028-01',unit:'units'}],'MONTHLY_FORCED_QUANTITY_POLICY_REQUIRED'],
 ['future reference to its quantity',p=>p.rules.push(rule('9999',{op:'quantity_phase',code:'609',stage:'exact'},{validFrom:'2028-01',nature:'auxiliary'})),'MONTHLY_FORCED_QUANTITY_POLICY_REQUIRED'],
 ['fixed channel',p=>p.bindings.find(b=>b.key==='amount609').sourceKind='fixed_amount','MONTHLY_FORCED_BINDING_REQUIRED'],
 ['duplicate source binding',p=>p.bindings.push({...clone(p.bindings[0]),key:'secondAmount'}),'MONTHLY_FORCED_SOURCE_COLLISION'],
 ['missing explicit end',p=>delete p.monthlyForcedAmountPolicies[0].validUntil,'MONTHLY_FORCED_POLICY_INVALID'],
 ['period plus range',p=>p.monthlyForcedAmountPolicies[0].period='2027-08','MONTHLY_FORCED_POLICY_INVALID'],
 ['non-native contract',p=>p.monthlyForcedAmountPolicies[0].sourceContract='payroll-novelty-batch.v2','MONTHLY_FORCED_POLICY_INVALID'],
 ['undeclared version',p=>delete p.monthlyForcedAmountsVersion,'MONTHLY_FORCED_POLICY_INVALID'],
])test(label+' fails without weakening the original rule',()=>{const s=forcedValiditySources();mutate(program(s));assert.throws(()=>normalizeMonthlyForcedProgram(program(s)),is(code));});
test('legacy policy survives the explicit V2 upgrade and uses its original evidence version',async()=>{
 const old=forcedValiditySources({legacy:true,period:'2026-10'}),snapshot=forcedValiditySnapshot(old),before=clone(program(old)),next=forcedValiditySources({includeLegacy:true,validFrom:'2026-11',period:'2026-10'});forcedValiditySnapshot(next);
 assert.doesNotThrow(()=>ownProgramHistory(before,program(next)));assert.deepEqual(program(next).monthlyForcedAmountPolicies.find(p=>p.period),before.monthlyForcedAmountPolicies[0]);
 const resolve=monthlyForcedSourceResolver(program(next));assert.deepEqual(resolve({row:batch(old).rows[0].values,family:'monthly',agreementCode:'1',period:'2026-10',liquidationType:'monthly',sourceContract:batch(old).version}),{version:V1,policy:before.monthlyForcedAmountPolicies[0]});
 for(const [value,hash]of await monthlyForcedCaptureHashChecks(old,snapshot.input,snapshot.result,async v=>forcedHash(v)))assert.equal(forcedHash(value),hash);
 assert.equal(salarySerialized(program(old)),salarySerialized(before));
});
test('successor truncates only effective range and preserves old captured chain',()=>{
 const s=forcedValiditySources(),before=clone(program(s)),old=before.monthlyForcedAmountPolicies[0],next=clone(before),successor=forcedTemporalPolicy('609','2028-01',null,old);next.monthlyForcedAmountPolicies.push(successor);
 const previousBytes=salarySerialized(before);assert.doesNotThrow(()=>monthlyForcedProgramHistory(before,next));const entries=resolveMonthlyForcedPolicies(normalizeMonthlyForcedProgram(next).monthlyForcedAmountPolicies);
 assert.equal(entries.find(e=>e.policyId===old.policyId).validUntil,'2027-12');assert.equal(old.validUntil,null);assert.equal(salarySerialized(before),previousBytes);
 const args={row:batch(s).rows[0].values,family:'monthly',agreementCode:'1',period:'2028-01',liquidationType:'monthly',sourceContract:batch(s).version};
 assert.equal(monthlyForcedSourceResolver(before)(args).policy.policyId,old.policyId);assert.equal(monthlyForcedSourceResolver(next)(args).policy.policyId,successor.policyId);
});
for(const [label,mutate,code]of[
 ['orphan',p=>{p.monthlyForcedAmountPolicies[1].supersedes.policyId='missing';},'POLICY_PREDECESSOR_MISSING'],
 ['changed hash',p=>{p.monthlyForcedAmountPolicies[1].supersedes.policySha256='b'.repeat(64);},'POLICY_PREDECESSOR_CHANGED'],
 ['cross-scope successor',p=>{p.monthlyForcedAmountPolicies[1].agreementCode='2';},'POLICY_SUCCESSION_SCOPE_CHANGED'],
 ['unlinked overlap',p=>{p.monthlyForcedAmountPolicies[1].supersedes=null;},'POLICY_VALIDITY_OVERLAP'],
 ['branch',p=>{p.monthlyForcedAmountPolicies.push({...clone(p.monthlyForcedAmountPolicies[1]),policyId:'branch',validFrom:'2028-06'});},'POLICY_SUCCESSION_BRANCH'],
 ['cycle',p=>{p.monthlyForcedAmountPolicies[0].supersedes={policyId:p.monthlyForcedAmountPolicies[1].policyId,policySha256:'a'.repeat(64)};},'POLICY_SUCCESSION_CYCLE'],
])test('succession rejects '+label,()=>{const p=program(forcedValiditySources()),old=p.monthlyForcedAmountPolicies[0];p.monthlyForcedAmountPolicies.push(forcedTemporalPolicy('609','2028-01',null,old));mutate(p);assert.throws(()=>normalizeMonthlyForcedProgram(p),is(code));});
test('history cannot remove, rewrite or downgrade an approved V2 policy',()=>{
 const old=program(forcedValiditySources()),next=clone(old);next.monthlyForcedAmountPolicies[0].ruleReference='Rewritten historical evidence';assert.throws(()=>monthlyForcedProgramHistory(old,next),is('PROGRAM_HISTORY_REQUIRED'));
 const prior=forcedLegacyPolicy('609','2027-08'),downgrade=clone(old);downgrade.monthlyForcedAmountsVersion=V1;downgrade.monthlyForcedAmountPolicies=[prior];downgrade.rules.find(r=>r.code==='609').validUntil='2027-08';assert.throws(()=>monthlyForcedProgramHistory(old,downgrade),is('PROGRAM_HISTORY_REQUIRED'));
});
for(const quantity of [null,'1','0.0'])test('forced quantity must remain explicit canonical zero: '+quantity,()=>{assert.throws(()=>forcedValiditySnapshot(forcedValiditySources({quantity})),is(quantity==='0.0'?'OWN_NOVELTY_CONTRACT_INVALID':'MONTHLY_FORCED_QUANTITY_REQUIRED'));});
test('no reviewed row is not the same as a present row with unknown amount',()=>{
 const s=forcedValiditySources();s.monthly.nativeBatches=[];const snapshot=forcedValiditySnapshot(s);assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='609').amount,'0.00');assert.equal(snapshot.input.employees[0].inputs.find(x=>x.key==='presence609').value,'0');
 assert.throws(()=>forcedValiditySnapshot(forcedValiditySources({amount:null})));
});
test('one distinct reviewer is sufficient; historical two remain valid; same person is rejected',()=>{
 for(const reviews of [1,2])assert.equal(forcedValiditySnapshot(forcedValiditySources({reviews})).result.rows.find(r=>r.conceptCode==='609').amount,'20.00');
 const s=forcedValiditySources();batch(s).approvals[0].personId=batch(s).preparedBy.personId;assert.throws(()=>forcedValiditySnapshot(s),is('OWN_NOVELTY_CONTRACT_INVALID'));
});
test('V2 rejects the legacy source contract and duplicate approved native batches',()=>{
 const s=forcedValiditySources(),resolve=monthlyForcedSourceResolver(program(s));
 assert.throws(()=>resolve({row:batch(s).rows[0].values,family:'monthly',agreementCode:'1',period:s.period,liquidationType:s.liquidationType,sourceContract:'payroll-novelty-batch.v2'}),is('MONTHLY_FORCED_NATIVE_BATCH_REQUIRED'));
 const duplicate=clone(batch(s));duplicate.id='10000000-0000-4000-8000-000000008199';s.monthly.nativeBatches.push(duplicate);assert.throws(()=>forcedValiditySnapshot(s),is('SOURCE_AMBIGUOUS'));
});
test('V2 historical verifier rejects a fixed duplicate even when saved values are unchanged',()=>{
 const s=forcedValiditySources(),snapshot=forcedValiditySnapshot(s),r=batch(s).rows[0].values;
 s.fixed.export.data.rows.push({subject:{contractId:r.contractId},values:{conceptSourceId:r.conceptSourceId}});
 assert.throws(()=>monthlyForcedCaptureSourceRecords(s,snapshot.input,snapshot.result),is('MONTHLY_FORCED_SOURCE_COLLISION'));
});
test('historical V5 reader accepts 2028 capture and rejects changed provenance',async()=>{
 const c=forcedValidityCapture(forcedValiditySources({period:'2028-01',official:true})),before=salarySerialized(c);assert.deepEqual(await verifiedOwnOfficialCapture(c),c);assert.equal(salarySerialized(c),before);
 const forged=clone(c);forged.saved.input.employees[0].inputs.find(x=>x.key==='amount609').sourceReference='Novedades:'+'0'.repeat(64);forged.saved.inputSha256=forcedHash(forged.saved.input);await assert.rejects(()=>verifiedOwnOfficialCapture(forged));
});
test('proposal comparison exposes full validity, predecessor SHA and unchanged prior policy',()=>{
 const s=forcedValiditySources(),p=program(s);s.programState.program.definition=ownProgramDefinition(p,s.programState.salaryCatalog.items);const next=clone(program(s));next.monthlyForcedAmountPolicies.push(forcedTemporalPolicy('609','2028-01',null,next.monthlyForcedAmountPolicies[0]));
 const diff=programWorkspaceChanges(program(s),next);assert.equal(diff.changed,1);const text=describeProgramPolicy('monthlyForcedAmountPolicies',next.monthlyForcedAmountPolicies);for(const value of ['2027-08','2028-01','Hasta: Sin término',forcedHash(p.monthlyForcedAmountPolicies[0])])assert.ok(text.includes(value),value);
 assert.equal(prepareProgramWorkspace(s.programState,next,'Synthetic independent future proposal').command,'propose');
});
test('quantity-only interval collision sees temporal forced policies beyond their start month',()=>{
 const p=program(forcedValiditySources()),f=p.monthlyForcedAmountPolicies[0];p.quantityOnlyInputsVersion='own-quantity-only-inputs.v1';p.quantityOnlyInputPolicies=[{policyId:'quantity-future',supersedes:null,agreementCode:'1',validFrom:'2028-06',validUntil:'2028-07',liquidationType:'monthly',sourceCode:'609',quantityInputKey:'quantity609',quantityUnit:'units',sourceKind:'monthly_quantity',sourceContracts:['own-payroll-novelty-batch.v1','payroll-novelty-batch.v2'],amountPolicy:'absent_or_zero',forcedPolicy:'reject',otherChannelPolicy:'reject',adjustmentMonthPolicy:'absent_or_current_month',absencePolicy:'zero_only_after_existing_complete_capture',sourceSha256:'a'.repeat(64),ruleReference:'Synthetic quantity-only declaration'}];
 // Isolate the interval guard; the complete program also rejects these bindings
 // under the mutually exclusive monetary policy.
 p.bindings=[{agreementCode:'1',key:'quantity609',sourceKind:'monthly_quantity',sourceCode:'609',unit:'units',combine:'sum',onMissing:'zero',ruleReference:'Synthetic quantity'}];p.rules.find(r=>r.code==='609').expression={op:'input',key:'quantity609',unit:'units'};
 assert.throws(()=>normalizeQuantityOnlyProgram(p),is('QUANTITY_ONLY_POLICY_COLLISION'));f.validUntil='2028-05';assert.doesNotThrow(()=>normalizeQuantityOnlyProgram(p));
});
