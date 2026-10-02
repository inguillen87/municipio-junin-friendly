import test from 'node:test';
import assert from 'node:assert/strict';
import {assignmentBulkPlan, restoreBulkAssignmentAttempt} from '../assets/time-catalog-bulk-assignment.js';
import {TimeCatalogReviewSession} from '../assets/time-catalog-review-model.js';
import {timeCatalogMatches} from '../assets/time-catalog-contract.js';
import {ID, payload, record, command, flags, scopeVersion} from './fixtures/time-catalog-synthetic.js';
const id=n=>`11111111-0000-4000-8000-${String(n).padStart(12,'0')}`;
const targets=n=>Array.from({length:n},(_,i)=>({contractId:id(i+1),legajo:String(900001+i),name:'Contrato sintético '+(i+1)}));
function fixtures(){
  const base={...payload('assignment'),reference:{title:'Asignación sintética documentada',code:'qa-asignacion',legalReference:'Documento sintético QA'}};
  const deps=Object.fromEntries([['shift','shift'],['calendar','calendar'],['ruleProfile','rule_profile']].map(([key,kind],i)=>{
    const r=record(command({kind,payload:payload(kind)}));r.id=id(1000+i);r.status='approved';r.version=3;base.spec[key+'EntryId']=r.id;return [key,r];
  }));return {base,deps};
}
const permissions={canPropose:true,canApprove:false,canAudit:false,canReadAssignments:true};
const bootstrap=(patch={})=>({version:'time-catalog.v1',scopeVersion,permissions,summary:{calendar:1,shift:1,ruleProfile:1,assignment:0,submitted:0},...flags,...patch});
const ready=()=>{const s=new TimeCatalogReviewSession();s.bootstrap(bootstrap());return s;};
test('full21 selection creates21 distinct stable assignment payloads, no names or legajos in codes',async()=>{
  const {base,deps}=fixtures(), chosen=targets(21), plan=await assignmentBulkPlan(base,chosen,deps);
  assert.equal(plan.total,21);assert.equal(new Set(plan.entries.map(row=>row.payload.logicalKeyHash)).size,21);
  assert.deepEqual(plan.entries.map(row=>row.payload.spec.employmentContractId),chosen.map(row=>row.contractId));
  for(const row of plan.entries){assert.deepEqual({...row.payload.spec,employmentContractId:base.spec.employmentContractId},base.spec);assert.equal(row.payload.reference.title,base.reference.title);assert.equal(row.payload.revision,base.revision);assert.equal(row.payload.effectiveTo,base.effectiveTo);assert.match(row.payload.reference.code,/^qa-asignacion\.[a-f0-9]{16}$/);assert.ok(Object.isFrozen(row.payload));}
  assert.deepEqual(await assignmentBulkPlan(base,chosen,deps),plan);
  base.reference.title='Alteración posterior';chosen[0].name='Alteración posterior';deps.shift.status='retired';assert.notEqual(plan.entries[0].payload.reference.title,base.reference.title);assert.notEqual(plan.entries[0].target.name,chosen[0].name);assert.equal(plan.dependencies.shift.status,'approved');
});
test('same legajo with two verified contracts remains two explicit destinations',async()=>{
  const {base,deps}=fixtures(),chosen=targets(2);chosen[1].legajo=chosen[0].legajo;const plan=await assignmentBulkPlan(base,chosen,deps);assert.equal(plan.total,2);assert.notEqual(plan.entries[0].payload.logicalKeyHash,plan.entries[1].payload.logicalKeyHash);
});
test('100 destinations are kept whole; 101 and empty reject without truncation',async()=>{
  const {base,deps}=fixtures();assert.equal((await assignmentBulkPlan(base,targets(100),deps)).total,100);
  for(const count of [0,101])await assert.rejects(assignmentBulkPlan(base,targets(count),deps),/1 y 100/);
});
for(const mutation of [rows=>rows.push({...rows[0],contractId:rows[0].contractId.toUpperCase()}),rows=>rows[0].legajo='-1',rows=>rows[0].contractId='missing',rows=>rows[0].name='PRIVATE\nNAME',rows=>rows[0].unknown=true])test('invalid or duplicated whole destination list rejects '+String(mutation),async()=>{const {base,deps}=fixtures(),chosen=targets(2);mutation(chosen);await assert.rejects(assignmentBulkPlan(base,chosen,deps));});
for(const key of ['shift','calendar','ruleProfile'])test('dependency '+key+' must be approved and cover the whole explicit interval',async()=>{
  for(const patch of [{status:'retired'},{effectiveFrom:'2026-10-02'},{effectiveTo:'2026-10-10'},{id:id(2222)}]){const {base,deps}=fixtures();Object.assign(deps[key],patch);await assert.rejects(assignmentBulkPlan(base,targets(1),deps));}
});
test('open end is preserved only if every approved dependency is open-ended',async()=>{
  const {base,deps}=fixtures();delete base.effectiveTo;await assert.rejects(assignmentBulkPlan(base,targets(1),deps));Object.values(deps).forEach(r=>delete r.effectiveTo);
  const plan=await assignmentBulkPlan(base,targets(1),deps);assert.equal(Object.hasOwn(plan.entries[0].payload,'effectiveTo'),false);
  const body=command({kind:'assignment',payload:plan.entries[0].payload}),r=JSON.parse(JSON.stringify(record(body)));assert.equal(timeCatalogMatches(r,body),r);
});
test('prefix max47 is not trimmed, max48 rejects; no copied source binding',async()=>{
  const {base,deps}=fixtures();base.reference.code='a'.repeat(47);assert.equal((await assignmentBulkPlan(base,targets(1),deps)).entries[0].payload.reference.code.length,64);base.reference.code='a'.repeat(48);await assert.rejects(assignmentBulkPlan(base,targets(1),deps));base.reference.code='qa-code';base.sourceContractId=ID;await assert.rejects(assignmentBulkPlan(base,targets(1),deps));
});
test('changed start date yields a distinct stable destination key while revision remains declared',async()=>{
  const {base,deps}=fixtures(),a=await assignmentBulkPlan(base,targets(1),deps);base.effectiveFrom='2026-10-02';const b=await assignmentBulkPlan(base,targets(1),deps);assert.notEqual(a.entries[0].payload.logicalKeyHash,b.entries[0].payload.logicalKeyHash);assert.equal(b.entries[0].payload.revision,base.revision);
});
test('a receipt with the generated code of another destination cannot certify creation',async()=>{
  const {base,deps}=fixtures(),plan=await assignmentBulkPlan(base,targets(2),deps),body=command({kind:'assignment',payload:plan.entries[0].payload}),r=record(body);
  r.reference.code=plan.entries[1].payload.reference.code;assert.throws(()=>timeCatalogMatches(r,body));
});
test('recover only already sent exact draft bytes and key after clearing the private view',async()=>{
  const {base,deps}=fixtures(),plan=await assignmentBulkPlan(base,targets(1),deps),s=ready();const attempt=s.prepareDraft('assignment',plan.entries[0].payload,'catalog_onboarding','Asignación sintética completa.',ID);
  s.invalidate();assert.equal(s.pending,null);s.bootstrap(bootstrap());const recovered=restoreBulkAssignmentAttempt(s,attempt);assert.equal(recovered.body,attempt.body);assert.equal(recovered.key,attempt.key);assert.equal(recovered.scope,attempt.scope);assert.equal(recovered.generation,s.generation);
  assert.throws(()=>restoreBulkAssignmentAttempt(s,attempt));const body=JSON.parse(recovered.body).payload;s.confirm({version:'time-catalog.v1',scopeVersion,data:record(body),replayed:true,historical:false,requestSha256:'a'.repeat(64),attemptKey:ID,...flags});assert.equal(s.pending,null);
});
for(const patch of [{scopeVersion:'c'.repeat(64)+'.'+'d'.repeat(64)},{permissions:{...permissions,canPropose:false}},{permissions:{...permissions,canReadAssignments:false}}])test('changed scope or revoked capability cannot restore a pending bulk draft '+JSON.stringify(patch),async()=>{
  const {base,deps}=fixtures(),plan=await assignmentBulkPlan(base,targets(1),deps),s=ready(),attempt=s.prepareDraft('assignment',plan.entries[0].payload,'catalog_onboarding','Asignación sintética completa.',ID);s.invalidate();s.bootstrap(bootstrap(patch));assert.throws(()=>restoreBulkAssignmentAttempt(s,attempt));assert.equal(s.pending,null);
});
test('restore rejects non-assignment, decision, forged operation and malformed original bytes',()=>{
  const original=ready().prepareDraft('rule_profile',payload(),'catalog_onboarding','Borrador sintético.',ID);
  for(const attempt of [original,{...original,body:'{'},{...original,unknown:true},{...original,body:JSON.stringify({operation:'other',payload:JSON.parse(original.body).payload})}])assert.throws(()=>restoreBulkAssignmentAttempt(ready(),attempt));
});
