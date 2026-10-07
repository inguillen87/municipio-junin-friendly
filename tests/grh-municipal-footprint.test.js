import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {stableJson} from '../scripts/lib/canonical-import.mjs';
import {municipalFootprintQuery,planMunicipalFootprint,evaluateMunicipalFootprint,readMunicipalFootprint,compareMunicipalFootprints} from '../scripts/lib/grh-municipal-footprint.mjs';
import {municipalFootprintCatalog,municipalFootprintResults,municipalFootprintTarget as target} from './fixtures/municipal-footprint-synthetic.js';
const setup=()=>{const catalog=municipalFootprintCatalog();return {catalog,plan:planMunicipalFootprint(catalog,target),results:municipalFootprintResults(catalog)};};
const reseal=report=>{const {reportSha256,...payload}=report;return {...payload,reportSha256:createHash('sha256').update(stableJson(payload)).digest('hex')};};
test('direct salary and novelty queries always pair tenant and their reviewed binding',()=>{
 assert.match(municipalFootprintQuery('own_payroll_novelty_event'),/WHERE r\.tenant_id=\$1::uuid AND r\.source_binding_id=\$2::uuid$/);
 assert.match(municipalFootprintQuery('payroll_novelty_batch'),/WHERE r\.tenant_id=\$1::uuid AND r\.certified_binding_id=\$2::uuid$/);
});
test('capture results with no tenant inherit only the selected capture and its binding',()=>{
 const sql=municipalFootprintQuery('own_payroll_run_result');assert.match(sql,/JOIN public\.own_payroll_run_capture p ON r\.capture_id=p\.id/);
 assert.match(sql,/WHERE p\.tenant_id=\$1::uuid AND p\.source_binding_id=\$2::uuid$/);
});
test('time governance retains tenant, catalog and binding correspondence in the inherited join',()=>{
 const sql=municipalFootprintQuery('time_catalog_governance_event');assert.match(sql,/r\.tenant_id=p\.tenant_id/);assert.match(sql,/r\.catalog_certified_binding_id=p\.certified_binding_id/);
});
test('a fabricated table name or private record query cannot be compiled',()=>{
 for(const name of ['person_identity','future_event','own_payroll_run_result; DROP TABLE x','own_payroll_run_result\n'])assert.throws(()=>municipalFootprintQuery(name),{code:'MUNICIPAL_FOOTPRINT_TABLE_INVALID'});
});
test('all 82 domains are read once within an immutable read-only repeatable transaction',()=>{
 const {plan}=setup();assert.equal(plan.queries.length,88);assert.deepEqual(plan.options,{readOnly:true,isolationLevel:'RepeatableRead'});
 for(const query of plan.queries){assert.match(query.text,/^SELECT /);assert.doesNotMatch(query.text,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|DROP|COMMIT|ROLLBACK)\b/);assert.ok(Object.isFrozen(query.values));}
 assert.equal(plan.queries.filter(q=>q.values.length===2).length,82);assert.doesNotMatch(plan.queries.map(q=>q.text).join('\n'),/00000000-0000/);
});
test('a partial catalog fails before opening the injected transport',async()=>{
 const catalog=municipalFootprintCatalog();catalog.tables=catalog.tables.filter(t=>t.name!=='own_payroll_novelty_event');let calls=0;
 await assert.rejects(readMunicipalFootprint({catalog,target,transaction:()=>{calls++;}}),{code:'MUNICIPAL_FOOTPRINT_COVERAGE_INCOMPLETE'});assert.equal(calls,0);
});
test('complete results expose aggregates and do not authorize source promotion or claim semantic review',()=>{
 const {plan,results}=setup(),report=evaluateMunicipalFootprint(plan,results);assert.equal(Object.keys(report.entities).length,82);
 assert.equal(report.readOnly,true);assert.equal(report.writeStatements,0);assert.equal(report.containsPersonalRecords,false);assert.equal(report.semanticConflictsReviewed,false);
 assert.equal(report.attachmentBytesVerified,false);assert.equal(report.sourcePromotionAuthorized,false);assert.ok(Object.isFrozen(report.entities));
 assert.doesNotMatch(JSON.stringify(report),/source_payload|previousRecord|cipher_bytes|legal_instrument|PRIVATE_PERSON/);
});
for(const [label,mutate]of [
 ['writable transaction',r=>{r[0][0].observation.readOnly='off';}],
 ['different timestamp normalization',r=>{r[0][0].observation.timezone='America/Argentina/Mendoza';}],
 ['changed tenant',r=>{r[0][0].observation.tenantId='00000000-0000-0000-0000-000000000099';}],
 ['changed snapshot',r=>{r.at(-1)[0].observation.snapshot='20:30:';}],
 ['changed catalog',r=>{r[1].find(t=>t.name==='own_payroll_program_event').columns.push('new_column');}],
 ['incomplete domain',r=>{r[3]=[];}],
 ['wrong domain',r=>{r[3][0].observation.table='own_payroll_run_result';}],
 ['unsafe count',r=>{r[3][0].observation.rows=Number.MAX_SAFE_INTEGER+1;}],
 ['false empty fingerprint',r=>{r[3][0].observation.sha256='b'.repeat(64);}]
])test('no partial footprint is emitted after '+label,()=>{const {plan,results}=setup();mutate(results);assert.throws(()=>evaluateMunicipalFootprint(plan,results));});
test('a cloned plan cannot borrow another plan provenance',()=>{const {plan,results}=setup();assert.throws(()=>evaluateMunicipalFootprint({...plan},results),{code:'MUNICIPAL_FOOTPRINT_RESULT_INVALID'});});
test('cancellation before or during transport does not produce a receipt',async()=>{
 const {catalog,results}=setup(),early=new AbortController();early.abort();let calls=0;
 await assert.rejects(readMunicipalFootprint({catalog,target,signal:early.signal,transaction:()=>{calls++;}}));assert.equal(calls,0);
 const late=new AbortController();await assert.rejects(readMunicipalFootprint({catalog,target,signal:late.signal,transaction:async(queries,options)=>{assert.equal(queries.length,88);assert.equal(options.readOnly,true);late.abort();return results;}}));
});
test('a changed content hash is detected even when the row quantity is identical',()=>{
 const {plan,results}=setup();const resultRow=results.find(rows=>rows[0]?.observation?.table==='own_payroll_run_result')[0].observation;
 resultRow.rows=1;resultRow.sha256='a'.repeat(64);const before=evaluateMunicipalFootprint(plan,results);resultRow.sha256='b'.repeat(64);const after=evaluateMunicipalFootprint(plan,results);
 const comparison=compareMunicipalFootprints(before,after);assert.equal(comparison.preserved,false);assert.deepEqual(comparison.changes,[{table:'own_payroll_run_result',beforeRows:1,afterRows:1}]);assert.equal(comparison.sourcePromotionAuthorized,false);
});
test('source version context may change without pretending a new source was authorized',()=>{
 const {plan,results}=setup(),before=evaluateMunicipalFootprint(plan,results);const after=reseal({...structuredClone(before),target:{...target,coreVersionId:'00000000-0000-0000-0000-000000000008'},snapshot:'20:30:'});
 const comparison=compareMunicipalFootprints(before,after);assert.equal(comparison.preserved,true);assert.equal(comparison.sourceContextChanged,true);assert.equal(comparison.sourcePromotionAuthorized,false);
});
test('saved receipt tampering, missing domains, extra fields or a different municipality are rejected',()=>{
 const {plan,results}=setup(),before=evaluateMunicipalFootprint(plan,results);
 const altered=structuredClone(before);altered.entities.own_payroll_run_result.rows=1;assert.throws(()=>compareMunicipalFootprints(before,altered),{code:'MUNICIPAL_FOOTPRINT_RECEIPT_CHANGED'});
 const missing=structuredClone(before);delete missing.entities.own_payroll_run_result;assert.throws(()=>compareMunicipalFootprints(before,reseal(missing)),{code:'MUNICIPAL_FOOTPRINT_RECEIPT_INCOMPLETE'});
 assert.throws(()=>compareMunicipalFootprints(before,reseal({...structuredClone(before),extra:true})),{code:'MUNICIPAL_FOOTPRINT_RECEIPT_INVALID'});
 const other=reseal({...structuredClone(before),target:{...target,bindingId:'00000000-0000-0000-0000-000000000099'}});assert.throws(()=>compareMunicipalFootprints(before,other),{code:'MUNICIPAL_FOOTPRINT_SCOPE_CHANGED'});
});
