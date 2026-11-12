// Invented identities, approvals and amounts. No municipal facts are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {emissionSources} from './fixtures/own-payroll-row-emission-synthetic.js';
import {sealFamilySources} from './fixtures/own-payroll-family-consumer-synthetic.js';
import {row} from './fixtures/native-salary-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {rule,lit} from './fixtures/own-payroll-synthetic.js';
import {salaryItems,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {OWN_MONTHLY_FORCED_AMOUNT_VERSION,monthlyForcedExpectedExpression,normalizeMonthlyForcedProgram,monthlyForcedSourceResolver,monthlyForcedCaptureSourceRecords,monthlyForcedCaptureHashChecks} from '../assets/own-payroll-monthly-forced-amounts.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {prepareOwnPayrollRowEmissionSnapshot,projectOwnPayrollRowEmissionReceipt} from '../lib/own-payroll-row-emission-snapshot.js';
import {ownOfficialCapture,verifiedOwnOfficialCapture} from '../assets/own-payroll-official-snapshot-model.js';

const H='a'.repeat(64),sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const p=code=>({agreementCode:'1',period:'2026-10',liquidationType:'monthly',sourceContract:'own-payroll-novelty-batch.v1',sourceKind:'monthly_amount',sourceCode:code,amountInputKey:'amount'+code,presenceInputKey:'presence'+code,treatment:'declared_amount_passthrough',quantityPolicy:'explicit_zero',sourceSha256:H,ruleReference:'Synthetic explicit monthly source policy; not a municipal approval'});
function attachPolicy(s,{forced=true,amount='2000',quantity='0',code='609',enabled=true}={}){
 const policy=p(code),program=s.programState.program.definition;
 program.noveltyPresenceVersion='own-payroll-novelty-presence.v1';
 program.namespaceVersion='own-payroll-namespaces.v2';
 program.rules.push(rule(code,monthlyForcedExpectedExpression(policy),{nature:'deduction',validFrom:'2026-10',validUntil:'2026-10'}));
 program.bindings.push({agreementCode:'1',key:policy.amountInputKey,unit:'money',sourceKind:'monthly_amount',sourceCode:code,combine:'single',onMissing:'zero',ruleReference:'Synthetic unique monthly amount source'},{agreementCode:'1',key:policy.presenceInputKey,unit:'coefficient',sourceKind:'monthly_presence',sourceCode:code,combine:'any',onMissing:'zero',ruleReference:'Synthetic complete native monthly presence'});
 if(enabled){program.monthlyForcedAmountsVersion=OWN_MONTHLY_FORCED_AMOUNT_VERSION;program.monthlyForcedAmountPolicies=[policy];}
 s.programState.salaryCatalog.items=salaryItems([...s.programState.salaryCatalog.items,row({code,nature:'deduction',unit:'money',precision:2,validFrom:'2026-10',validUntil:'2026-10'})]);
 const e=s.population.employees[0],oldSubject=approvedSources(1).monthly.batches[0].rows[0].subject;
 const subject={...oldSubject,contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken};
 const values={rowOrdinal:1,legajo:e.employeeNumber,contractId:e.contractId,identityToken:e.identityToken,conceptSourceId:code,costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:quantity,amountCents:amount,movementType:null,legalInstrument:null,observation:'Synthetic monetary source. No legal instrument or approval inferred.',forced};
 const rows=[{values,subject,identityCurrent:true}],preparedBy={membershipId:uid(8101),personId:uid(8102)},first={membershipId:uid(8103),personId:uid(8104)},second={membershipId:uid(8106),personId:uid(8107)};
 const batch={version:'own-payroll-novelty-batch.v1',id:uid(8105),revision:forced?4:3,status:'approved',periodMonth:'2026-10-01',payrollType:'monthly',rows,rowCount:1,rowsSha256:sha(rows.map(({values,subject})=>({values,subject}))),preparedBy,decidedBy:forced?second:first,approvals:forced?[first,second]:[first],grhMutation:false,payrollCalculated:false,payrollPosted:false};
 s.monthly={complete:true,batches:[],nativeBatches:[batch]};
 return s;
}
function fixture(options={}){
 const s=approvedSources(1);
 s.programState.program.definition={totalsPrecision:2,rules:[rule('100',lit('1000','money'),{nature:'remuneration'})],bindings:[]};
 s.programState.salaryCatalog.items=salaryItems([row({code:'100',nature:'remuneration',unit:'money',precision:2})]);
 return attachPolicy(s,options);
}
const prepare=s=>{s.programState.program.definition=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);return prepareOwnPayrollInput(s);};
const batch=s=>s.monthly.nativeBatches[0];
const rehash=s=>{const b=batch(s);b.rowsSha256=sha(b.rows.map(({values,subject})=>({values,subject})));};
const is=code=>e=>e.code===code;

for(const code of ['609','649'])for(const amount of ['2000','0','-100'])test(code+' preserves exact declared cents '+amount+' and original forced source',()=>{
 const s=fixture({code,amount}),before=structuredClone(s),input=prepare(s),result=createOwnPayrollSnapshot(input).result;
 assert.equal(result.rows.find(r=>r.conceptCode===code).amount,(BigInt(amount)/100n).toString()+'.00');
 assert.equal(input.employees[0].inputs.find(i=>i.key==='amount'+code).value,(BigInt(amount)/100n).toString()+'.00000000');
 assert.equal(batch(s).rows[0].values.quantityDecimal,'0');assert.equal(batch(s).rows[0].values.forced,true);
 assert.deepEqual(s.monthly,before.monthly);assert.deepEqual(s.programState.program.definition.rules,before.programState.program.definition.rules);
});
test('forced flag changes provenance but does not change the formula or amount',()=>{
 const no=prepare(fixture({forced:false})),yes=prepare(fixture());
 assert.equal(no.employees[0].inputs.find(i=>i.key==='amount609').value,yes.employees[0].inputs.find(i=>i.key==='amount609').value);
 assert.notEqual(no.employees[0].inputs.find(i=>i.key==='amount609').sourceReference,yes.employees[0].inputs.find(i=>i.key==='amount609').sourceReference);
 assert.notEqual(no.sourceVersions.novelties,yes.sourceVersions.novelties);
 assert.deepEqual(no.rules,yes.rules);
});
test('policy reference remains in the approved programme source hash',()=>{
 const a=fixture(),b=fixture();b.programState.program.definition.monthlyForcedAmountPolicies[0].ruleReference='Different synthetic reviewed reference';
 const ia=prepare(a),ib=prepare(b);assert.notEqual(ia.sourceVersions.rules,ib.sourceVersions.rules);assert.notEqual(ia.employees[0].inputs.find(i=>i.key==='amount609').sourceReference,ib.employees[0].inputs.find(i=>i.key==='amount609').sourceReference);
});
test('without opt-in the original monetary forced guard stays closed',()=>assert.throws(()=>prepare(fixture({enabled:false})),is('FORCED_RULE_REQUIRED')));
for(const quantity of [null,'1','-1'])test('quantity '+quantity+' cannot replace explicit zero',()=>assert.throws(()=>prepare(fixture({quantity})),is('MONTHLY_FORCED_QUANTITY_REQUIRED')));
test('missing amount is not inferred from explicit zero quantity',()=>assert.throws(()=>prepare(fixture({amount:null})),is('OWN_NOVELTY_INPUT_INVALID')));
test('source row hash tampering is rejected before policy use',()=>{const s=fixture();batch(s).rows[0].values.amountCents='3000';assert.throws(()=>prepare(s),is('SOURCE_SCOPE_INVALID'));});
test('native identity mismatch is rejected',()=>{const s=fixture();batch(s).rows[0].values.identityToken='b'.repeat(64);rehash(s);assert.throws(()=>prepare(s),is('OWN_NOVELTY_CONTRACT_INVALID'));});
test('first reviewer alone cannot approve a forced batch',()=>{const s=fixture();batch(s).approvals.pop();batch(s).decidedBy=batch(s).approvals[0];assert.throws(()=>prepare(s),is('OWN_NOVELTY_CONTRACT_INVALID'));});
test('preparer cannot be either reviewer',()=>{const s=fixture();batch(s).approvals[0]=batch(s).preparedBy;assert.throws(()=>prepare(s),is('OWN_NOVELTY_CONTRACT_INVALID'));});
test('same person with another membership cannot review twice',()=>{const s=fixture();batch(s).approvals[1].personId=batch(s).approvals[0].personId;assert.throws(()=>prepare(s),is('OWN_NOVELTY_CONTRACT_INVALID'));});
test('two source rows do not silently sum an overridden amount',()=>{
 const s=fixture(),b=batch(s),r=structuredClone(b.rows[0]);r.values.rowOrdinal=2;r.values.costCenterSourceId='2';b.rows.push(r);b.rowCount=2;rehash(s);
 assert.throws(()=>prepare(s),is('SOURCE_AMBIGUOUS'));
});
test('no native row means the original absence rule, zero',()=>{
 const s=fixture();s.monthly.nativeBatches=[];const r=createOwnPayrollSnapshot(prepare(s)).result;assert.equal(r.rows.find(r=>r.conceptCode==='609').amount,'0.00');
});
test('legacy monthly input is not silently admitted under the native policy',()=>{
 const s=fixture(),resolve=monthlyForcedSourceResolver(s.programState.program.definition);
 assert.throws(()=>resolve({row:batch(s).rows[0].values,family:'monthly',agreementCode:'1',period:'2026-10',liquidationType:'monthly',sourceContract:'payroll-novelty-batch.v2'}),is('MONTHLY_FORCED_NATIVE_BATCH_REQUIRED'));
 const legacy=approvedSources(1).monthly.batches[0];Object.assign(legacy.rows[0],{conceptSourceId:'609',forced:true,quantityDecimal:'0',amountCents:'2000'});s.monthly={complete:true,batches:[legacy],nativeBatches:[]};
 assert.throws(()=>prepare(s),/La respuesta de novedades no cumple el contrato seguro/);
});
for(const [name,mutate,code] of [
 ['computed target',p=>p.rules.find(r=>r.code==='609').expression=lit('99','money'),'MONTHLY_FORCED_PASSTHROUGH_REQUIRED'],
 ['open-ended policy target',p=>p.rules.find(r=>r.code==='609').validUntil=null,'MONTHLY_FORCED_PASSTHROUGH_REQUIRED'],
 ['summed amount',p=>p.bindings.find(b=>b.key==='amount609').combine='sum','MONTHLY_FORCED_BINDING_REQUIRED'],
 ['fixed source',p=>p.monthlyForcedAmountPolicies[0].sourceKind='fixed_amount','MONTHLY_FORCED_POLICY_INVALID'],
 ['unknown quantity policy',p=>p.monthlyForcedAmountPolicies[0].quantityPolicy='ignore','MONTHLY_FORCED_POLICY_INVALID'],
 ['duplicate policy',p=>p.monthlyForcedAmountPolicies.push({...p.monthlyForcedAmountPolicies[0]}),'MONTHLY_FORCED_POLICY_DUPLICATE'],
 ['undeclared field',p=>p.monthlyForcedAmountPolicies[0].ownerOverride=true,'MONTHLY_FORCED_POLICY_INVALID'],
 ['wrong scope',p=>p.monthlyForcedAmountPolicies[0].period='2026-11','MONTHLY_FORCED_RULE_REQUIRED'],
 ['unversioned feature',p=>delete p.monthlyForcedAmountsVersion,'MONTHLY_FORCED_POLICY_INVALID']
])test(name+' is rejected',()=>{const s=fixture();mutate(s.programState.program.definition);assert.throws(()=>normalizeMonthlyForcedProgram(s.programState.program.definition),is(code));});
test('history cannot drop an approved monthly policy',()=>{const s=fixture(),before=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items),after=structuredClone(before);delete after.monthlyForcedAmountsVersion;delete after.monthlyForcedAmountPolicies;assert.throws(()=>ownProgramHistory(before,after),is('PROGRAM_HISTORY_REQUIRED'));});
test('history cannot rewrite the source reference of an existing policy',()=>{const s=fixture(),before=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items),after=structuredClone(before);after.monthlyForcedAmountPolicies[0].ruleReference='Changed historical reference';assert.throws(()=>ownProgramHistory(before,after),is('PROGRAM_HISTORY_REQUIRED'));});
function officialFixture(options={}){
 const code=options.code??'609',s=attachPolicy(emissionSources(),{amount:'2000',...options}),p=s.programState.program.definition;
 for(const r of p.rules)r.validUntil='2026-10';
 for(const q of p.quantityPhases)q.validUntil='2026-10';
 p.officialTotalsPolicies[0].contributions['996']=[code];
 p.rules.find(r=>r.code==='800000996').expression={op:'concept',code,stage:'exact'};
 s.programState.program.definition=ownProgramDefinition(p,s.programState.salaryCatalog.items);sealFamilySources(s);
 const snapshot=prepareOwnPayrollRowEmissionSnapshot(s);
 return {s,snapshot};
}
test('V5 economic result and receipt projection keep the forced deduction',()=>{
 const {s,snapshot}=officialFixture();
 assert.equal(snapshot.input.version,'own-payroll-input.v5');assert.equal(snapshot.result.version,'own-payroll-result.v5');
 assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='609').amount,'20.00');
 assert.equal(snapshot.result.employeeTotals[0].deduction,'20.00');
 const receipt=projectOwnPayrollRowEmissionReceipt(snapshot,s.programState,snapshot.input.employees[0].contractId);
 assert.equal(receipt.concepts.find(r=>r.code==='609').amount,'20.00');assert.equal(receipt.approved,false);
 assert.equal(batch(s).rows[0].values.forced,true);assert.equal(batch(s).rows[0].values.quantityDecimal,'0');
});
function capturedOfficial(options={}){
 const {s,snapshot}=officialFixture(options),payload={...s,sourceInventory:{}},body={period:s.period,liquidationType:s.liquidationType,selection:s.selection,scopeVersion:s.programState.scopeVersion,programVersion:s.programState.program.version,populationDomain:'native_registered'};
 const id=uid(9001),algorithmSha256='e'.repeat(64),createdAt='2026-11-12T13:00:00.000Z';
 return{version:'own-payroll-run.v1',id,key:uid(9002),body,bodySha256:sha(body),algorithmSha256,payload,payloadSha256:sha(payload),createdAt,replayed:false,saved:{version:'own-payroll-saved.v1',id,algorithmSha256,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:createdAt}};
}
test('the real V5 historical reader accepts and verifies the exact original candidate capture',async()=>{
 const capture=capturedOfficial();assert.equal(ownOfficialCapture(capture).result.rows.find(r=>r.conceptCode==='609').amount,'20.00');
 assert.deepEqual(await verifiedOwnOfficialCapture(capture),capture);
});
test('the historical reader rejects rewritten provenance even with new enclosing hashes',async()=>{
 const capture=structuredClone(capturedOfficial());capture.saved.input.employees[0].inputs.find(i=>i.key==='amount609').sourceReference='Novedades:'+'0'.repeat(64);
 // Recompute the result with the original calculator. The immutable source,
 // policy and hash checks must still detect the substituted provenance.
 const {calculateOwnPayrollWithRowEmission}=await import('../assets/own-payroll-row-emission.js');
 capture.saved.result=calculateOwnPayrollWithRowEmission(capture.saved.input);capture.saved.inputSha256=sha(capture.saved.input);capture.saved.resultSha256=sha(capture.saved.result);
 await assert.rejects(()=>verifiedOwnOfficialCapture(capture),is('CLOSE_OFFICIAL_CONTRACT_INVALID'));
});
test('historical source verifier checks full native batch and original hashed provenance',async()=>{
 const s=fixture(),input=prepare(s),result=createOwnPayrollSnapshot(input).result;
 assert.equal(monthlyForcedCaptureSourceRecords(s,input,result).length,1);
 const checks=await monthlyForcedCaptureHashChecks(s,input,result,async v=>sha(v));
 assert.equal(checks.length,3);for(const [value,hash] of checks)assert.equal(sha(value),hash);
 const forged=structuredClone(input);forged.employees[0].inputs.find(i=>i.key==='amount609').sourceReference='Novedades:'+'0'.repeat(64);
 const forgedChecks=await monthlyForcedCaptureHashChecks(s,forged,result,async v=>sha(v));
 assert.ok(forgedChecks.some(([value,hash])=>sha(value)!==hash));
});
test('historical verifier rejects a changed source even if its input/result is recomputed',()=>{
 const s=fixture(),input=prepare(s),result=createOwnPayrollSnapshot(input).result;
 const wrong=structuredClone(input);wrong.employees[0].inputs.find(i=>i.key==='amount609').value='30.00000000';
 const recomputed=createOwnPayrollSnapshot(wrong).result;
 assert.throws(()=>monthlyForcedCaptureSourceRecords(s,wrong,recomputed),is('MONTHLY_FORCED_CAPTURE_CHANGED'));
});
test('non-forced rows keep their ordinary source representation under the new policy',async()=>{
 const s=fixture({forced:false,quantity:'2'}),input=prepare(s),result=createOwnPayrollSnapshot(input).result;
 const checks=await monthlyForcedCaptureHashChecks(s,input,result,async v=>sha(v));
 assert.equal(checks.length,3);for(const [value,hash] of checks)assert.equal(sha(value),hash);
});
test('rewriting the forced flag to false does not preserve the original provenance',async()=>{
 const s=fixture(),input=prepare(s),result=createOwnPayrollSnapshot(input).result;
 batch(s).rows[0].values.forced=false;batch(s).approvals.pop();batch(s).decidedBy=batch(s).approvals[0];rehash(s);
 const checks=await monthlyForcedCaptureHashChecks(s,input,result,async v=>sha(v));assert.ok(checks.some(([value,hash])=>sha(value)!==hash));
});
export {officialFixture,capturedOfficial};
