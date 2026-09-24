import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {successorRecord,compareGrhSuccessorEntity} from '../scripts/lib/grh-successor-comparison.mjs';
const snapshot=(employee='007',type='M',id='1')=>({sourceKey:{companyCode:'101',employeeNumber:employee,id},payrollDate:'2026-09-30',period:2026,month:9,payrollType:type});
const monthly=value=>({sourceKey:{companyCode:'101',employeeNumber:'007',payrollDate:'2026-09-30',period:2026,month:9,payrollType:'M'},itemCount:1,distinctConcepts:1,quantitySum:'1',technicalSourceAmountSum:null,sourceTotals:{netPayable:value}});
test('rotating histolegajo source IDs does not invent dismissals and hires',async()=>{
 const r=await compareGrhSuccessorEntity('payrollSnapshot',[snapshot('007','M','1')],[snapshot('007','M','8001')]);
 assert.equal(r.added,0);assert.equal(r.removed,0);assert.equal(r.changed,0);assert.equal(r.unchanged,1);assert.equal(r.evidenceOnlyChanges,1);
 assert.equal(r.baselineProjectionSha256,r.candidateProjectionSha256);
});
test('the same employee in monthly and other concepts remains two assignments, one contract',async()=>{
 const r=await compareGrhSuccessorEntity('payrollSnapshot',[snapshot()],[snapshot('007','M','500'),snapshot('007','O','501')]);
 assert.equal(r.after,2);assert.equal(r.added,1);assert.equal(r.removed,0);assert.deepEqual(r.contracts,{before:1,after:1,beforeWithMultipleAssignments:0,afterWithMultipleAssignments:1});
});
test('duplicate semantic assignments are rejected regardless of distinct source IDs',async()=>{
 await assert.rejects(compareGrhSuccessorEntity('payrollSnapshot',[],[snapshot('007','M','1'),snapshot('007','M','2')]),{code:'GRH_SUCCESSOR_DUPLICATE_CANDIDATE_ASSIGNMENT'});
 await assert.rejects(compareGrhSuccessorEntity('payrollSnapshot',[snapshot(),snapshot()],[]),{code:'GRH_SUCCESSOR_DUPLICATE_BASELINE_ASSIGNMENT'});
});
test('source company and literal source period are both part of assignment identity',()=>{
 const a=snapshot(),b=structuredClone(a);b.sourceKey.companyCode='102';assert.notEqual(successorRecord('payrollSnapshot',a).key,successorRecord('payrollSnapshot',b).key);
 b.sourceKey.companyCode='101';b.period=26;assert.notEqual(successorRecord('payrollSnapshot',a).key,successorRecord('payrollSnapshot',b).key);
});
test('null is not a zero salary and exact decimal formatting does not invent changes',async()=>{
 const empty=await compareGrhSuccessorEntity('payrollMonthly',[monthly(null)],[monthly('0.00')]);assert.equal(empty.changed,1);assert.deepEqual(empty.changedFields,{net_payable:1});
 const equivalent=await compareGrhSuccessorEntity('payrollMonthly',[monthly('9007199254740994.3400')],[monthly('9007199254740994.34')]);assert.equal(equivalent.changed,0);assert.equal(equivalent.evidenceOnlyChanges,1);
 const cent=await compareGrhSuccessorEntity('payrollMonthly',[monthly('9007199254740994.34')],[monthly('9007199254740994.35')]);assert.equal(cent.changed,1);
});
test('fingerprints do not depend on input ordering and additions/removals stay explicit',async()=>{
 const a=snapshot('001'),b=snapshot('002'),c=snapshot('003');
 const ordered=await compareGrhSuccessorEntity('payrollSnapshot',[a,b],[b,c]);const reversed=await compareGrhSuccessorEntity('payrollSnapshot',[b,a],[c,b]);
 assert.deepEqual(ordered,reversed);assert.equal(ordered.added,1);assert.equal(ordered.removed,1);assert.equal(ordered.unchanged,1);
});
test('no personal data or salary value enters the report, including changed fields',async()=>{
 const before=monthly('987654321.12345'),after=monthly('987654321.22345');before.privateName='PRIVATE_PERSON';after.privateName='OTHER_PRIVATE_PERSON';
 const result=await compareGrhSuccessorEntity('payrollMonthly',[before],[after]);const serialized=JSON.stringify(result);
 assert.equal(serialized.includes('987654321'),false);assert.equal(serialized.includes('PRIVATE_PERSON'),false);assert.equal(serialized.includes('employeeNumber'),false);
});
test('a failed stream rejects the entire comparison; no partial report is returned',async()=>{
 async function* broken(){yield snapshot();throw Object.assign(new Error('GRH_CORE_STREAM_CONTENT_CHANGED'),{code:'GRH_CORE_STREAM_CONTENT_CHANGED'});}
 await assert.rejects(compareGrhSuccessorEntity('payrollSnapshot',[],broken()),{code:'GRH_CORE_STREAM_CONTENT_CHANGED'});
});
test('unknown entities and unsupported key types fail closed',async()=>{
 await assert.rejects(compareGrhSuccessorEntity('__proto__',[],[]),{code:'GRH_SUCCESSOR_ENTITY_INVALID'});
 assert.throws(()=>successorRecord('payrollSnapshot',{sourceKey:null}),/GRH_VERSION_ENTITY_INVALID/);
});
test('CLI has no apply option and leaves legacy candidate publication gates intact',()=>{
 const script=fs.readFileSync(new URL('../scripts/analyze-grh-successor.mjs',import.meta.url),'utf8');
 assert.match(script,/verifyMultirunCandidate/);assert.match(script,/preflightGrhCore/);assert.match(script,/sourcePromoted:false/);assert.match(script,/legacyImporterCompatible:false/);
 assert.doesNotMatch(script,/\bapply\s*:\s*\{|\.transaction\(|\.query\(|new Client\(/);
});
