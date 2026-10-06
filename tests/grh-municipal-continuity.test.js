import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {planMunicipalContinuity,planNativeContinuity,continuityHash} from '../scripts/lib/grh-successor-continuity.mjs';
import {summarizeNativeContinuity} from '../scripts/lib/grh-successor-native-summary.mjs';
import {parseNativeContinuityArgs,readNativeCatalogEvidence} from '../scripts/verify-grh-native-continuity.mjs';
import {nativeCatalogFixture} from './fixtures/native-continuity-catalog.js';
function currentFixture(){
 const catalog=nativeCatalogFixture();
 catalog.tables.push(
  {name:'native_salary_event',kind:'r',columns:['id','tenant_id','source_binding_id']},
  {name:'own_payroll_run_capture',kind:'r',columns:['id','tenant_id','source_binding_id']},
  {name:'own_payroll_run_result',kind:'r',columns:['capture_id','result']},
  {name:'own_payroll_program_event',kind:'r',columns:['id','tenant_id','source_binding_id']},
  {name:'own_payroll_close_event',kind:'r',columns:['id','tenant_id','source_binding_id']},
  {name:'annual_position_budget_event',kind:'r',columns:['id','tenant_id','source_binding_id']}
 );
 catalog.foreignKeys.push({child:'own_payroll_run_result',parent:'own_payroll_run_capture',name:'result_capture_fk',child_schema:'public',parent_schema:'public',validated:true,child_columns:['capture_id'],parent_columns:['id']});
 return catalog;
}
const report=catalog=>summarizeNativeContinuity(planMunicipalContinuity(catalog));
test('current scope discovers independent own payroll, salary and budget roots',()=>{
 const catalog=currentFixture(),old=planNativeContinuity(catalog),current=planMunicipalContinuity(catalog);
 for(const name of ['native_salary_event','own_payroll_run_capture','own_payroll_program_event','own_payroll_close_event','annual_position_budget_event']){
  assert.ok(current.roots.includes(name));assert.ok(!old.roots.includes(name));
 }
 const result=report(catalog);assert.equal(result.profileId,'municipal-sql131');assert.equal(result.version,'grh-native-dependency-coverage.v2');
 assert.equal(result.businessRowsReviewed,false);assert.equal(result.attachmentBytesVerified,false);assert.equal(result.nativeConflictsResolved,false);assert.equal(result.sourcePromotionAuthorized,false);
});
test('a result without its own tenant inherits only the reviewed capture foreign key',()=>{
 const result=report(currentFixture()),domain=result.domains.find(d=>d.table==='own_payroll_run_result');
 assert.equal(domain.bindingColumn,null);assert.equal(domain.scope,'declared_parent_scope');assert.deepEqual(domain.nativeParents,['own_payroll_run_capture']);
});
test('omitted current domains do not turn a partial synthetic catalog into complete municipal coverage',()=>{
 const result=report(currentFixture());assert.equal(result.coverageComplete,false);
 for(const name of ['native_leave_event','own_payroll_novelty_event','own_payroll_receipt_event','own_position_assignment_event','time_catalog_entry'])assert.ok(result.missingTables.includes(name));
 assert.deepEqual(result.unreviewedTables,[]);
});
test('an unlinked future operational root is exposed instead of silently ignored or approved',()=>{
 const catalog=currentFixture();catalog.tables.push({name:'future_municipal_event',kind:'r',columns:['id','tenant_id','source_binding_id']});
 const result=report(catalog);assert.ok(result.domains.some(d=>d.table==='future_municipal_event'&&d.root));
 assert.ok(result.unreviewedTables.includes('future_municipal_event'));assert.equal(result.coverageComplete,false);
});
for(const [label,change]of [
 ['missing tenant',c=>{c.tables.find(t=>t.name==='own_payroll_program_event').columns=['id','source_binding_id'];}],
 ['ambiguous binding',c=>c.tables.find(t=>t.name==='own_payroll_run_capture').columns.push('certified_binding_id')],
 ['unsupported relation',c=>{c.tables.find(t=>t.name==='own_payroll_program_event').kind='f';}],
 ['wrong parent key',c=>{c.foreignKeys.find(f=>f.child==='own_payroll_run_result').child_columns=['result'];}],
 ['unvalidated parent',c=>{c.foreignKeys.find(f=>f.child==='own_payroll_run_result').validated=false;}],
 ['external child',c=>{c.foreignKeys.find(f=>f.child==='own_payroll_run_result').child_schema='external';}]
])test('current catalog rejects '+label,()=>{const catalog=currentFixture();change(catalog);assert.throws(()=>planMunicipalContinuity(catalog));});
test('a tenant-bearing result must still preserve its declared tenant relation',()=>{
 const catalog=currentFixture();catalog.tables.push({name:'time_catalog_entry',kind:'r',columns:['id','tenant_id','catalog_kind','certified_binding_id']},
  {name:'time_shift_spec',kind:'r',columns:['catalog_entry_id','tenant_id','catalog_kind']});
 const edge={child:'time_shift_spec',parent:'time_catalog_entry',name:'shift_entry_fk',child_schema:'public',parent_schema:'public',validated:true,child_columns:['catalog_entry_id','tenant_id','catalog_kind'],parent_columns:['id','tenant_id','catalog_kind']};
 catalog.foreignKeys.push(edge);assert.ok(planMunicipalContinuity(catalog).tables.some(t=>t.name==='time_shift_spec'));
 edge.parent_columns=['id','catalog_kind','tenant_id'];assert.throws(()=>planMunicipalContinuity(catalog),{code:'SUCCESSOR_CONTINUITY_PARENT_SCOPE_REQUIRED'});
});
test('a known independent root cannot silently change its declared binding column',()=>{
 const catalog=currentFixture();catalog.tables.find(t=>t.name==='own_payroll_program_event').columns=['id','tenant_id','certified_binding_id'];
 assert.throws(()=>planMunicipalContinuity(catalog),{code:'SUCCESSOR_CONTINUITY_BINDING_DRIFT'});
});
test('adding an unpaired tenant to a capture result withdraws the reviewed inherited scope',()=>{
 const catalog=currentFixture();catalog.tables.find(t=>t.name==='own_payroll_run_result').columns.push('tenant_id');
 assert.throws(()=>planMunicipalContinuity(catalog),{code:'SUCCESSOR_CONTINUITY_PARENT_SCOPE_REQUIRED'});
});
test('source-version and identity infrastructure are named exclusions, never silently part of the business graph',()=>{
 const catalog=currentFixture();for(const name of ['grh_core_source_version','tenant_action_area_scope'])catalog.tables.push({name,kind:'r',columns:['id','tenant_id','source_binding_id']});
 const plan=planMunicipalContinuity(catalog),result=summarizeNativeContinuity(plan);
 for(const name of ['grh_core_source_version','tenant_action_area_scope']){assert.ok(!plan.roots.includes(name));assert.ok(result.excludedScopeTables.includes(name));}
});
test('a recomputed checksum cannot alter the reviewed profile or exclusions',()=>{
 for(const change of [p=>{p.profileId='latest';},p=>p.excludedScopeTables.push('own_payroll_run_capture')]){
  const plan=structuredClone(planMunicipalContinuity(currentFixture()));change(plan);const {planSha256,...payload}=plan;plan.planSha256=continuityHash(payload);
  assert.throws(()=>summarizeNativeContinuity(plan),{code:'NATIVE_CONTINUITY_PLAN_INVALID'});
 }
});
test('scope ordering is deterministic, immutable and does not mutate caller metadata',()=>{
 const catalog=currentFixture(),original=structuredClone(catalog),first=planMunicipalContinuity(catalog);assert.deepEqual(catalog,original);
 catalog.tables.reverse();catalog.foreignKeys.reverse();assert.equal(first.planSha256,planMunicipalContinuity(catalog).planSha256);
 assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.excludedScopeTables));
});
test('explicit current CLI selection retains legacy calls and rejects invented profile or write options',()=>{
 const args=['--catalog',path.resolve('synthetic-catalog.json'),'--expect-catalog','a'.repeat(64)];
 assert.equal(parseNativeContinuityArgs(args).profile,undefined);
 assert.equal(parseNativeContinuityArgs([...args,'--profile','municipal-sql131']).profile,'municipal-sql131');
 assert.throws(()=>parseNativeContinuityArgs([...args,'--profile','latest']));assert.throws(()=>parseNativeContinuityArgs([...args,'--apply']));
});
test('offline current report requires exact bytes and has no database operation or nominal records',async t=>{
 const root=path.resolve('verification');fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'municipal-continuity-synthetic-'));
 t.after(()=>{assert.equal(path.dirname(directory),root);fs.rmSync(directory,{recursive:true,force:true});});
 const file=path.join(directory,'catalog.json'),bytes=JSON.stringify(currentFixture());fs.writeFileSync(file,bytes);
 const hash=createHash('sha256').update(bytes).digest('hex');const result=await readNativeCatalogEvidence(file,hash,{profile:'municipal-sql131'});
 assert.equal(result.queryExecuted,false);assert.equal(result.writeStatements,0);assert.equal(result.businessRowsReviewed,false);
 assert.doesNotMatch(JSON.stringify(result),/previousRecord|source_payload|cipher_bytes|PRIVATE_SYNTHETIC/);
 fs.appendFileSync(file,' ');await assert.rejects(readNativeCatalogEvidence(file,hash,{profile:'municipal-sql131'}),/CATALOG_CHANGED/);
});
test('unknown direct profile is rejected before reading any file',async()=>{
 await assert.rejects(readNativeCatalogEvidence('missing.json','a'.repeat(64),{profile:'latest'}),/ARGUMENT_INVALID/);
});
