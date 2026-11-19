import test from 'node:test';
import assert from 'node:assert/strict';
import {familySelectedIds,familySelectedQuery,familySelectedCommand,familySelectedBootstrap,familySelectedDraft,familySelectedConfiguration,familySelectedDetail,prepareFamilySelected,decideFamilySelected,familySelectedReceipt} from '../assets/own-contract-family-payroll-facts-selection.js';
import {syntheticFamilyBootstrap,syntheticFamilyItems,familyId,syntheticFamilyDefinition} from './fixtures/own-contract-family-payroll-facts-synthetic.js';
import {selectedIds,selectedBootstrap,selectedCommand,selectedDetail,selectedReceipt,familyReason} from './fixtures/own-contract-family-selected-synthetic.js';

test('two selected contracts do not materialize the other846 as empty declarations',()=>{
 const catalog=syntheticFamilyBootstrap(848),b=selectedBootstrap();assert.equal(catalog.source.subjects.length,848);
 const draft=familySelectedDraft(b);assert.deepEqual(draft.map(r=>r.contractId),selectedIds());assert.equal(draft.length,2);
 assert.ok(draft.every(r=>Object.values(r.definition.quantities).every(q=>q===null)));assert.ok(draft.every(r=>r.definition.asOfDate===''&&r.definition.documentReference===''));
 assert.throws(()=>prepareFamilySelected(b,draft,familyReason),/constancia/);
 for(const row of draft)Object.assign(row.definition,{asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA'});
 const body=prepareFamilySelected(b,draft,familyReason);assert.equal(body.items.length,2);assert.deepEqual(body.contractIds,selectedIds());assert.ok(body.items.every(r=>r.definition.quantities.children===null));
 draft[0].definition.quantities.children='99';assert.equal(body.items[0].definition.quantities.children,null);
});
for(const [label,make] of [
 ['empty',()=>[]],['duplicate',()=>[familyId(1),familyId(1)]],['unsorted',()=>selectedIds().reverse()],
 ['uppercase',()=>['AAAAAAAA-0000-4000-8000-000000000001']],['legacy legajo',()=>['QA-1']],['null',()=>null],
 ['hole',()=>Array(2)],['extra array field',()=>Object.assign(selectedIds(),{tenantId:familyId(9)})]
])test('selection rejects '+label,()=>assert.throws(()=>familySelectedIds(make())));
test('query and command reject supplied tenant, binding, actor or extra scope',()=>{
 for(const key of ['tenantId','sourceBindingId','actorPersonId','allContracts']){
  assert.throws(()=>familySelectedQuery({period:'2026-10',contractIds:selectedIds(),[key]:familyId(9)}));
  assert.throws(()=>familySelectedCommand({...selectedCommand(),[key]:familyId(9)}));
 }
});
test('selected declaration refuses omitted, foreign and reordered rows or source identities',()=>{
 const b=selectedBootstrap(),items=syntheticFamilyItems(2);
 for(const bad of[items.slice(0,1),[...items,{...items[0],contractId:familyId(3)}],items.toReversed(),items.map((r,i)=>i?{...r,identityToken:'a'.repeat(64)}:r)])assert.throws(()=>prepareFamilySelected(b,bad,familyReason));
 const other=structuredClone(b);other.source.subjects[1].contractId=familyId(3);assert.throws(()=>familySelectedBootstrap(other));
});
test('approved records retain per-contract provenance and cannot claim an outside contract',()=>{
 const items=syntheticFamilyItems(2),records=items.map((r,i)=>({...structuredClone(r),revision:i+1,approvalId:familyId(500+i)}));
 const c={version:'d'.repeat(64),items,records};assert.equal(familySelectedConfiguration(c,'2026-10',selectedIds()),c);
 assert.notEqual(c.records[0].approvalId,c.records[1].approvalId);
 for(const mutate of [v=>v.records[1].approvalId=null,v=>v.records[1].revision=0,v=>v.records[1].contractId=familyId(3),v=>v.items[0].definition.quantities.children='0']){const bad=structuredClone(c);mutate(bad);assert.throws(()=>familySelectedConfiguration(bad,'2026-10',selectedIds()));}
 const b=selectedBootstrap();b.configuration=c;assert.deepEqual(familySelectedDraft(b),items);assert.throws(()=>prepareFamilySelected(b,items,familyReason),/cambios/);
});
test('preparation still requires prepare capability and does not infer a document or a zero',()=>{
 const b=selectedBootstrap();b.permissions.canPropose=false;assert.throws(()=>prepareFamilySelected(b,syntheticFamilyItems(2),familyReason),e=>e.code==='FAMILY_PAYROLL_FACTS_FORBIDDEN');
 const d=syntheticFamilyDefinition();d.quantities.prenatal=null;assert.equal(d.quantities.prenatal,null);assert.notEqual(d.quantities.prenatal,'0');
});
test('a signed selected detail keeps preparer scope and the current reviewer scope distinct',async()=>{
 const d=await selectedDetail();await familySelectedDetail(d);const body=await decideFamilySelected(d,'approve',familyReason);
 assert.equal(body.scopeVersion,d.scopeVersion);assert.notEqual(body.scopeVersion,d.body.scopeVersion);assert.deepEqual(body.contractIds,d.body.contractIds);assert.equal(body.items,null);
 for(const change of[v=>v.body.items[1].definition.quantities.children='0',v=>v.contractIds[1]=familyId(3),v=>v.baseItems.push({...syntheticFamilyItems(1)[0],contractId:familyId(3)})]){
  const bad=structuredClone(d);change(bad);await assert.rejects(familySelectedDetail(bad));
 }
});
test('stale selected evidence can be rejected but cannot be approved',async()=>{
 const d=await selectedDetail();d.current=false;await assert.rejects(decideFamilySelected(d,'approve',familyReason),e=>e.code==='FAMILY_PAYROLL_FACTS_BASE_CHANGED');
 assert.equal((await decideFamilySelected(d,'reject',familyReason)).command,'reject');
 for(const mutate of[v=>v.permissions.canReview=false,v=>v.proposal.canReview=false,v=>{v.proposal.status='approved';v.proposal.decision={command:'approve',reason:familyReason,actorLabel:'QA',recordedAt:'2026-10-12T13:00:00Z',revision:1};v.proposal.canReview=false;}]){
  const bad=await selectedDetail();mutate(bad);await assert.rejects(decideFamilySelected(bad,'approve',familyReason));
 }
});
test('same-attempt recovery cannot substitute scope, quantities, key or payroll effect',async()=>{
 const r=await selectedReceipt();await familySelectedReceipt(r,{key:r.requestKey,body:r.body});
 for(const mutate of[v=>v.body.contractIds=[familyId(1)],v=>v.body.items[0].definition.quantities.children='0',v=>v.payrollPosted=true,v=>v.requestKey=familyId(999)]){
  const bad=structuredClone(r);mutate(bad);await assert.rejects(familySelectedReceipt(bad,{key:r.requestKey,body:r.body}));
 }
});
