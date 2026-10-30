// SOURCE-ONLY future CI coverage. Not a locally admitted test closure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownProgramStructure,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';
import {inspectOwnMonetaryPolicySource} from '../assets/own-payroll-monetary-policy.js';
import {prepareOwnPayrollInput,prepareOwnPayrollInputComplete} from '../lib/own-payroll-approved-input.js';
import {ownRunOperation,verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {FIXED_CAPACITY_V2} from '../assets/payroll-fixed-capacity-model.js';
import {monthlyDayEngineSources} from './fixtures/own-monthly-day-engine-synthetic.js';
import {capture as oldCapture,runCommand} from './fixtures/own-payroll-run-synthetic.js';

const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value),'utf8').digest('hex');
const clone=value=>structuredClone(value);
const reference='Política exclusivamente sintética de integración; no regla municipal';
async function declaredSources({declaredDays=true,fixedV2=false}={}){
 const s=monthlyDayEngineSources(['16'],{typedOnly:true});
 if(!declaredDays){
  // An ordinary programme with no192/193/157 feature: do not leave dangling
  // day inputs or facts that could provide another reason for rejection.
  const definition=s.programState.program.definition;
  delete definition.monthlyDayDeclarationVersion;delete definition.periodParticipation;
  definition.bindings=[];definition.rules.find(rule=>rule.code==='900').expression={op:'literal',value:'300',unit:'money'};
  delete s.monthlyDayDeclarations;s.population.version=hash({employees:s.population.employees});
 }
 if(fixedV2)for(const [kind,version]of [['list','payroll-fixed-list.v2'],['export','payroll-fixed-export.v2']]){
  // The existing source fixture contains no retained fixed roots. Its complete
  // v2 envelope therefore truthfully declares all three counts as zero.
  const data=s.fixed[kind].data;
  assert.equal(data.rows.length,0);assert.equal(data.total,0);
  Object.assign(data,{version,capacity:clone(FIXED_CAPACITY_V2),complete:true,counts:{retainedRoots:0,listedRoots:0,approvedSources:0}});
 }
 return declareProgramme(s,s.programState.program.definition);
}
async function declareProgramme(s,rawProgram){
 const program=ownProgramStructure(rawProgram),sourceSha256=hash({fixture:'captured-monetary-input'});
 const source={version:'own-program-monetary-source.v1',complete:true,program,programSha256:hash(program),sourceReference:reference,sourceSha256};
 // Protocol hash mechanics have an independent oracle in the54 pure cases.
 // This integration fixture only authors valid declared data; it creates no approval.
 const inspected=await inspectOwnMonetaryPolicySource(source);
 const entries=inspected.inventory.filter(row=>row.unit==='money').map(({identity,unit,stage,rounding,ruleSha256,expressionSha256})=>({identity,unit,stage,rounding,ruleSha256,expressionSha256,sourceReference:reference,sourceSha256}));
 const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:hash(source),programSha256:hash(program),inventorySha256:inspected.inventorySha256,entries};
 s.programState.program.definition={...program,monetaryPolicyVersion:'own-program-monetary-manifest.v1',monetaryPolicy:{sourceReference:reference,sourceSha256,policy:{...unsigned,policySha256:hash(unsigned)}}};
 return s;
}
function capture(s){
 const c=oldCapture({body:runCommand({period:s.period,liquidationType:s.liquidationType,selection:clone(s.selection),scopeVersion:s.programState.scopeVersion,programVersion:s.programState.program.version})});c.bodySha256=hash(c.body);
 const sourceInventory={populationDomain:'native_registered',jurisdictions:{version:'own-run-jurisdictions.v1',complete:true,total:s.population.employees.length,rows:s.population.employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:'aaaaaaaa-0000-4000-8000-'+String(900+i).padStart(12,'0'),identityToken:e.identityToken,jurisdictionCode:'42'}))}};
 if(s.monthlyDayDeclarations)sourceInventory.monthlyDayDeclarations={version:s.monthlyDayDeclarations.version,total:s.monthlyDayDeclarations.records.length,complete:true,authority:'independently_approved_monthly_declaration'};
 if(s.fixed.list.data.version==='payroll-fixed-list.v2')Object.assign(sourceInventory,{fixedCapacityVersion:FIXED_CAPACITY_V2.version,fixedCounts:clone(s.fixed.list.data.counts),fixedListCount:s.fixed.list.data.total,fixedExportCount:s.fixed.export.data.total,fixedSnapshotToken:s.fixed.list.data.snapshotToken,fixedExportSha256:hash(s.fixed.export.data)});
 c.payload={...s,sourceInventory};
 c.payloadSha256=hash(c.payload);return c;
}
function stored(c){
 // This authors a genuinely calculated SYNTHETIC saved contract when the future
 // test is admitted. No snapshot, adapter or test was executed to prepare R2.
 const {sourceInventory:_inventory,...sources}=c.payload;
 const adapter=sources.fixed.list.data.version==='payroll-fixed-list.v2'?prepareOwnPayrollInputComplete:prepareOwnPayrollInput;
 const snapshot=createOwnPayrollSnapshot(adapter(sources));
 c.saved=clone({version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:'2026-10-05T10:01:00Z'});
 return c;
}
const invalidReceipt=error=>error.code==='OWN_RUN_CONTRACT_INVALID'&&error.status===503;
function assertReceiptHashes(c){
 assert.equal(c.bodySha256,hash(c.body));assert.equal(c.payloadSha256,hash(c.payload));
 if(c.saved){assert.equal(c.saved.inputSha256,hash(c.saved.input));assert.equal(c.saved.resultSha256,hash(c.saved.result));assert.equal(c.saved.input.sourceVersions.rules,hash({program:c.payload.programState.program,salary:c.payload.programState.salaryCatalog}));assert.deepEqual(c.saved.result.sourceVersions,c.saved.input.sourceVersions);}
}
const principal={user:{email:'monetary-recovery-synthetic@example.invalid'},tenant:{source:'membership',id:'a1000000-0000-4000-8000-000000000001',membershipId:'a1000000-0000-4000-8000-000000000002'}};
const session={email:principal.user.email,id:'a1000000-0000-4000-8000-000000000003',version:1,releaseSha:'d'.repeat(40)};
async function recoveredAttempt(c){
 let reads=0;
 const sql={query:async(q,values)=>{reads++;assert.match(q,/^SELECT public\.own_run_attempt_v1\(/);assert.equal(values[1],c.key);return[{result:clone(c)}];}};
 const recovered=await ownRunOperation(sql,principal,session,'attempt',{key:c.key},{fullJson:true,algorithmHash:()=>{throw Error('Recovery must not ask for a current algorithm');}});
 assert.equal(reads,1);return recovered;
}
test('captured manifest is verified without changing exact inputs or copying an override into the engine',async()=>{
 const s=await declaredSources(),before=clone(s),input=prepareOwnPayrollInput(s),{monetaryPolicyVersion,monetaryPolicy,...base}=s.programState.program.definition;
 const legacy=clone(s);legacy.programState.program.definition=base;const prior=prepareOwnPayrollInput(legacy);
 assert.deepEqual(s,before);assert.deepEqual(input.rules,prior.rules);assert.deepEqual(input.employees,prior.employees);assert.equal(input.totalsPrecision,prior.totalsPrecision);
 assert.equal(Object.hasOwn(input,'monetaryPolicy'),false);assert.notEqual(input.sourceVersions.rules,prior.sourceVersions.rules);
 assert.equal(input.sourceVersions.rules,hash({program:s.programState.program,salary:s.programState.salaryCatalog}));
});
test('legacy input without a manifest retains its shape and source version',()=>{
 const s=monthlyDayEngineSources(['16'],{typedOnly:true}),before=clone(s),input=prepareOwnPayrollInput(s);
 assert.deepEqual(s,before);assert.equal(Object.hasOwn(input,'monetaryPolicy'),false);assert.equal(input.sourceVersions.rules,hash({program:s.programState.program,salary:s.programState.salaryCatalog}));
});
for(const [label,mutate,expected]of [
 ['policy hash',d=>d.monetaryPolicy.policy.policySha256='0'.repeat(64),'OWN_MONETARY_INTEGRITY_CHANGED'],
 ['entry hash',d=>d.monetaryPolicy.policy.entries[0].ruleSha256='0'.repeat(64),'OWN_MONETARY_COVERAGE_REQUIRED'],
 ['source reference',d=>d.monetaryPolicy.sourceReference='Different declared source','OWN_MONETARY_SOURCE_CHANGED'],
])test('approved input rejects forged '+label+' before constructing any engine input',async()=>{
 const s=await declaredSources();mutate(s.programState.program.definition);const before=clone(s);
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code===expected);assert.deepEqual(s,before);
 // Both fixed-capacity adapters share the integrity check, before their list parser.
 assert.throws(()=>prepareOwnPayrollInputComplete(s),e=>e.code===expected);assert.deepEqual(s,before);
});
test('pending captured-program read verifies the full manifest without completing a calculation',async()=>{
 const c=capture(await declaredSources()),before=clone(c),checked=verifyOwnRunReceipt(c);
 assert.equal(checked.saved,null);assert.deepEqual(checked,before);assert.deepEqual(c,before);
});
test('a valid payload self-hash cannot hide a forged frozen-program policy hash',async()=>{
 const c=capture(await declaredSources());c.payload.programState.program.definition.monetaryPolicy.policy.policySha256='0'.repeat(64);c.payloadSha256=hash(c.payload);
 const before=clone(c);assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID'&&e.status===503);assert.deepEqual(c,before);assert.equal(c.saved,null);
});

test('the complete v2 adapter accepts a complete manifest without a monetary override',async()=>{
 const s=await declaredSources({fixedV2:true}),before=clone(s),input=prepareOwnPayrollInputComplete(s);
 const legacy=clone(s);delete legacy.programState.program.definition.monetaryPolicyVersion;delete legacy.programState.program.definition.monetaryPolicy;
 const prior=prepareOwnPayrollInputComplete(legacy);
 assert.deepEqual(s,before);assert.deepEqual(input.rules,prior.rules);assert.deepEqual(input.employees,prior.employees);assert.equal(input.totalsPrecision,prior.totalsPrecision);
 assert.deepEqual(s.fixed.list.data.counts,{retainedRoots:0,listedRoots:0,approvedSources:0});
 assert.equal(Object.hasOwn(input,'monetaryPolicy'),false);assert.notEqual(input.sourceVersions.rules,prior.sourceVersions.rules);
 assert.equal(input.sourceVersions.rules,hash({program:s.programState.program,salary:s.programState.salaryCatalog}));
 assert.equal(input.sourceVersions.novelties,hash({monthly:s.monthly,fixed:s.fixed.export.data}));
});
test('an ordinary monetary capture with no day feature verifies on the universal receipt path',async()=>{
 const c=capture(await declaredSources({declaredDays:false})),before=clone(c);
 for(const key of ['monthlyDays','monthlyDayDeclarations','periodParticipation'])assert.equal(Object.hasOwn(c.payload,key),false);
 for(const key of ['monthlyDays','monthlyDayDeclarations'])assert.equal(Object.hasOwn(c.payload.sourceInventory,key),false);
 assertReceiptHashes(c);assert.strictEqual(verifyOwnRunReceipt(c),c);assert.deepEqual(c,before);assert.equal(c.saved,null);
});
test('no193 pending capture still rejects a forged manifest after its payload is rehashed',async()=>{
 const c=capture(await declaredSources({declaredDays:false}));c.payload.programState.program.definition.monetaryPolicy.policy.policySha256='0'.repeat(64);c.payloadSha256=hash(c.payload);
 const before=clone(c);assertReceiptHashes(c);assert.throws(()=>verifyOwnRunReceipt(c),invalidReceipt);assert.deepEqual(c,before);
});
for(const fixedV2 of [false,true])test('193 monetary saved recovery keeps its stored result and algorithm with '+(fixedV2?'complete v2':'legacy v1')+' fixed sources',async()=>{
 const c=stored(capture(await declaredSources({fixedV2}))),before=clone(c);
 assertReceiptHashes(c);assert.equal(c.saved.result.rows.find(row=>row.conceptCode==='900').amount,'160.00000000');
 assert.equal(c.saved.result.payrollCalculated,true);assert.equal(c.saved.result.payrollPosted,false);assert.equal(c.saved.result.municipalApprovalVerified,false);assert.equal(c.saved.result.paymentExecuted,false);
 assert.strictEqual(verifyOwnRunReceipt(c,{fullJson:true}),c);assert.deepEqual(c,before);
 const recovered=await recoveredAttempt(c);assert.deepEqual(recovered,before);assert.deepEqual(c,before);assert.equal(recovered.saved.algorithmSha256,c.algorithmSha256);
});
test('ordinary monetary saved recovery does not need a day source or a current algorithm',async()=>{
 const c=stored(capture(await declaredSources({declaredDays:false}))),before=clone(c);
 assertReceiptHashes(c);assert.equal(Object.hasOwn(c.payload,'monthlyDayDeclarations'),false);assert.equal(c.saved.result.rows.find(row=>row.conceptCode==='900').amount,'300.00000000');
 assert.strictEqual(verifyOwnRunReceipt(c),c);assert.deepEqual(await recoveredAttempt(c),before);assert.deepEqual(c,before);
});
test('no193 saved recovery rejects a forged manifest even when every outer commitment is coherent',async()=>{
 const c=stored(capture(await declaredSources({declaredDays:false})));
 c.payload.programState.program.definition.monetaryPolicy.policy.policySha256='0'.repeat(64);c.payloadSha256=hash(c.payload);
 const rules=hash({program:c.payload.programState.program,salary:c.payload.programState.salaryCatalog});
 c.saved.input.sourceVersions.rules=rules;c.saved.result.sourceVersions.rules=rules;c.saved.inputSha256=hash(c.saved.input);c.saved.resultSha256=hash(c.saved.result);
 // Without the universal monetary verifier this ordinary, non-forced receipt
 // would satisfy the old outer checks: no193 adapter can mask this assertion.
 const before=clone(c);assertReceiptHashes(c);assert.throws(()=>verifyOwnRunReceipt(c),invalidReceipt);assert.deepEqual(c,before);
 await assert.rejects(recoveredAttempt(c),invalidReceipt);assert.deepEqual(c,before);
});

// These are synthetic source/snapshot contracts, NOT SQL approvals. An actual
// propose/approve/annul/recalculate transaction still needs native PostgreSQL.
for(const change of ['literal','totalsPrecision'])test('a new explicit '+change+' programme revision permits a correction while recovery keeps the original capture',async()=>{
 const beforeSources=await declaredSources({declaredDays:false}),old=stored(capture(beforeSources)),oldSaved=clone(old);
 const afterSources=clone(beforeSources),{monetaryPolicyVersion,monetaryPolicy,...base}=clone(afterSources.programState.program.definition);
 if(change==='literal')base.rules.find(r=>r.code==='900').expression.value='301';
 else base.totalsPrecision=2;
 await declareProgramme(afterSources,base);
 const next=afterSources.programState.program;
 next.revision=beforeSources.programState.program.revision+1;
 next.proposalId='b2000000-0000-4000-8000-000000000001';next.approvalId='b2000000-0000-4000-8000-000000000002';
 next.version=hash({syntheticRevision:next.revision,definition:next.definition,proposalId:next.proposalId,approvalId:next.approvalId});
 const prior=beforeSources.programState.program.definition;
 assert.doesNotThrow(()=>ownProgramHistory(prior,next.definition));
 assert.doesNotThrow(()=>requireExactProgramChanges(prior,next.definition),'The existing exact-precision guard is still mandatory');
 const nextCapture=capture(afterSources);nextCapture.id='b2000000-0000-4000-8000-000000000003';nextCapture.key='b2000000-0000-4000-8000-000000000004';
 const fresh=stored(nextCapture);
 assert.notEqual(fresh.body.programVersion,old.body.programVersion);assert.notEqual(fresh.saved.input.sourceVersions.rules,old.saved.input.sourceVersions.rules);
 assert.equal(old.saved.result.rows.find(r=>r.conceptCode==='900').amount,'300.00000000');
 assert.equal(fresh.saved.result.rows.find(r=>r.conceptCode==='900').amount,change==='literal'?'301.00000000':'300.00000000');
 assert.equal(fresh.saved.input.totalsPrecision,change==='totalsPrecision'?2:8);
 // Both900 and903 are remuneration in this existing arithmetic fixture.
 assert.equal(old.saved.result.employeeTotals[0].net,'600.00000000');
 assert.equal(fresh.saved.result.employeeTotals[0].net,change==='totalsPrecision'?'600.00':'602.00000000');
 assertReceiptHashes(old);assertReceiptHashes(fresh);assert.strictEqual(verifyOwnRunReceipt(fresh),fresh);
 assert.deepEqual(await recoveredAttempt(old),oldSaved);assert.deepEqual(old,oldSaved);
});
