// Pure source/data focals. Native old/new execution belongs to the reviewed214 rehearsal.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {closeDetail} from './fixtures/own-payroll-close-synthetic.js';
import {ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {ownCloseSnapshot214EquivalenceCases,composeOwnCloseSnapshot214Equivalence,OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES} from '../scripts/lib/own-close-snapshot214-equivalence.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n?/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex');
const schema='mc_qa_fixed_092_'+'a'.repeat(32),sourceCommit='b'.repeat(40),pins=()=>Object.fromEntries(OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES.map(file=>[file,hash(read(file))]));
const compose=(patch={})=>composeOwnCloseSnapshot214Equivalence({schema,sourceCommit,read,sourcePins:pins(),...patch});
const ids=['all-six-two-captures','contracts-two-captures','agreements-complete-group','departments-complete-group','reversed-detail-order','namespaces-two-captures-jurisdictions','jurisdictions-42-55-null','empty-detail','empty-contract-selection','unconfirmed-final-row','inconsistent-saved-total','missing-saved-total','precision-out-of-range','precision-scale-mismatch'];

test('closed suite keeps every positive and negative case, both captures and no filtered-page oracle',()=>{
 const cases=ownCloseSnapshot214EquivalenceCases();assert.deepEqual(cases.map(c=>c.id),ids);assert.equal(new Set(cases.map(c=>c.id)).size,14);
 assert.equal(cases.filter(c=>c.expected!==null).length,7);assert.equal(cases.filter(c=>c.expectedError!==null).length,7);
 for(const c of cases)assert.equal(new Set(c.detail.captures.map(x=>x.id)).size,2,c.id);
 assert.ok(Object.isFrozen(cases)&&Object.isFrozen(cases[0].detail.captures));
});

test('independent JS oracle preserves all six employees and36 original concept rows, or exactly two selected employees',()=>{
 const cases=ownCloseSnapshot214EquivalenceCases(),base=closeDetail(6);base.version='own-close-detail.v2';
 assert.equal(base.captures[0].saved.result.rows.length,36,'The existing six-rule fixture is the arithmetic source');
 for(const c of cases.filter(c=>c.expected)){
  assert.deepEqual(c.expected,ownCloseSnapshot(c.detail,c.selection),c.id);
  const wanted=c.id==='contracts-two-captures'?2:6;assert.equal(c.expected.employeeCount,wanted,c.id);assert.equal(c.expected.employees.length,wanted,c.id);assert.equal(c.expected.populationCount,6,c.id);
  assert.equal(c.expected.conceptCount,c.expected.concepts.length,c.id);assert.equal(new Set(c.expected.employees.map(e=>e.contractId)).size,wanted,c.id);
  assert.equal(new Set(c.expected.employees.map(e=>e.runId)).size,2,'Both original captures are used: '+c.id);
  assert.equal(c.expected.populationComplete,wanted===6,c.id);
 }
 const ordinary=cases.find(c=>c.id==='all-six-two-captures');assert.deepEqual(ordinary.expected,ownCloseSnapshot(base,{kind:'all',values:[]}));assert.equal(ordinary.expected.conceptCount,36);
 assert.equal(cases.find(c=>c.id==='contracts-two-captures').expected.conceptCount,12);
 for(const id of ['agreements-complete-group','departments-complete-group'])assert.equal(cases.find(c=>c.id===id).expected.employeeCount,6);
});

test('order and exact decimal strings are retained without converting saved values to JS numbers',()=>{
 const cases=ownCloseSnapshot214EquivalenceCases(),normal=cases.find(c=>c.id==='all-six-two-captures'),reordered=cases.find(c=>c.id==='reversed-detail-order');
 assert.deepEqual(reordered.expected,normal.expected);assert.equal(normal.expected.precision,2);
 for(const value of Object.values(normal.expected.totals))assert.match(value,/^-?\d+\.\d{2}$/);
 assert.ok(normal.expected.concepts.some(r=>r.nature==='auxiliary'&&/\.\d{8}$/.test(r.amount)),'The original fixture includes exact eight-place auxiliary amounts');
 assert.deepEqual(normal.expected.employees.map(e=>e.contractId),[...normal.expected.employees.map(e=>e.contractId)].sort());
});

test('existing auxiliary fixture preserves duplicate88 namespaces and captured42/55/null jurisdictions',()=>{
 const c=ownCloseSnapshot214EquivalenceCases().find(c=>c.id==='namespaces-two-captures-jurisdictions');assert.equal(c.expected.version,'own-close-snapshot.v3');assert.equal(c.expected.conceptCount,18);
 const id=c.expected.employees[0].contractId,twins=c.expected.concepts.filter(r=>r.contractId===id&&r.conceptCode==='88');assert.equal(twins.length,2);assert.deepEqual(new Set(twins.map(r=>r.nature)),new Set(['auxiliary','remuneration']));
 assert.ok(c.expected.employees.every(e=>e.namespaceVersion==='own-payroll-namespaces.v2'));
 for(const id of ['namespaces-two-captures-jurisdictions','jurisdictions-42-55-null']){
  const current=ownCloseSnapshot214EquivalenceCases().find(c=>c.id===id);assert.deepEqual(new Set(current.expected.employees.map(e=>e.jurisdiction.code)),new Set(['42','55',null]));
  assert.ok(current.expected.employees.every(e=>e.jurisdiction.basis==='captured_own_registration'&&/^[a-f0-9]{64}$/.test(e.jurisdiction.sourceSha256)));
 }
});

test('all seven malformed fixtures also fail the JS contract, while native codes remain explicit SQL expectations',()=>{
 const cases=ownCloseSnapshot214EquivalenceCases().filter(c=>c.expectedError),codes={
  'empty-detail':'OWN_CLOSE_SELECTION_INVALID','empty-contract-selection':'OWN_CLOSE_SELECTION_INVALID','unconfirmed-final-row':'OWN_CLOSE_DECISION_INVALID',
  'inconsistent-saved-total':'OWN_CLOSE_CONTRACT_INVALID','missing-saved-total':'OWN_CLOSE_CONTRACT_INVALID','precision-out-of-range':'OWN_CLOSE_CONTRACT_INVALID','precision-scale-mismatch':'OWN_CLOSE_CONTRACT_INVALID'};
 assert.deepEqual(Object.fromEntries(cases.map(c=>[c.id,c.expectedError])),codes);
 for(const c of cases){assert.equal(c.expected,null);assert.throws(()=>ownCloseSnapshot(c.detail,c.selection),undefined,c.id);}
 const last=cases.find(c=>c.id==='unconfirmed-final-row');assert.equal(last.detail.rows.length,6);assert.ok(last.detail.rows.slice(0,5).every(r=>r.state==='confirmed'));assert.equal(last.detail.rows[5].state,'missing','The final row is not silently omitted');
});

test('source composition requires exactly the closed imported-source set and rejects drift before SQL text is returned',()=>{
 assert.equal(OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES.includes('scripts/lib/own-close-snapshot214-installation.mjs'),false,'No installer self-pin');
 assert.ok(OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES.includes('tests/fixtures/own-payroll-close-synthetic.js'));assert.ok(OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES.includes('assets/own-payroll-close-model.js'));
 const sourcePins=pins();delete sourcePins['tests/fixtures/own-payroll-close-synthetic.js'];assert.throws(()=>compose({sourcePins}),/CLOSE214_EQ_SOURCE_SET_CHANGED/);
 assert.throws(()=>compose({sourcePins:{...pins(),'unreviewed.js':'a'.repeat(64)}}),/CLOSE214_EQ_SOURCE_SET_CHANGED/);
 assert.throws(()=>compose({read:file=>read(file)+(file==='assets/own-payroll-close-model.js'?'\n-- changed':'')}),/CLOSE214_EQ_SOURCE_CHANGED/);
 assert.throws(()=>compose({schema:'public'}));assert.throws(()=>compose({sourceCommit:'not-a-sha'}));
});

test('SQL batches save full outcomes and metadata, compare full old/new records and propagate every non-P0001 failure',()=>{
 const p=compose();assert.equal(p.executesSql,false);assert.equal(p.cases.length,14);assert.equal(p.caseCount,14);assert.equal(p.positives,7);assert.equal(p.negatives,7);assert.deepEqual(p.caseIds,ids);assert.deepEqual(p.sourceEntries,OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES);
 for(const sql of [p.before,p.after]){
  assert.ok(sql.includes(schema+'.own_close_snapshot_v1('));assert.ok(sql.includes('EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS'));
  assert.equal(/WHEN\s+OTHERS/i.test(sql),false);for(const field of ["'json',actual","'text',actual::text","'textSha256'","'canonicalSha256'","'sqlstate',native_state","'message',native_message"])assert.ok(sql.includes(field),field);
  assert.ok(sql.includes("SELECT to_jsonb(p)-'prosrc' INTO STRICT metadata"));assert.ok(sql.includes('CLOSE214_EQ_OMITTED_CASE'));assert.ok(sql.includes('CLOSE214_EQ_JS_ORACLE_CHANGED'));
  assert.equal(/\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|CREATE\s+TABLE|CREATE\s+FUNCTION|GRANT\s|REVOKE\s)/i.test(sql),false);
 }
 assert.ok(p.before.includes('equivalence_before'));assert.ok(p.after.includes("stored->'metadata' IS DISTINCT FROM metadata OR stored->'results' IS DISTINCT FROM results"));
 assert.ok(p.proof.includes("'omitted',0"));assert.ok(p.proof.includes('CLOSE214_EQ_PROOF_MISSING'));
 for(const sql of [p.before,p.after,p.proof])assert.match(sql,/^DO \$close214_equivalence_(?:before|after|proof)\$/);
 assert.equal(/SELECT\s+jsonb_build_object/i.test(p.proof),false,'The guard emits no extra result row before the existing installer proof');
});
