import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';
import {stableJson} from '../scripts/lib/canonical-import.mjs';
import {municipalContinuityProfile,FINAL_MUNICIPAL_CONTINUITY_PROFILE as profileId} from '../scripts/lib/grh-municipal-continuity-schema.mjs';
import {planMunicipalContinuity,CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL} from '../scripts/lib/grh-successor-continuity.mjs';
import {summarizeNativeContinuity} from '../scripts/lib/grh-successor-native-summary.mjs';
import {municipalFootprintQuery,planMunicipalFootprint,evaluateMunicipalFootprint,inspectMunicipalConservationWithinTransaction,compareMunicipalFootprints} from '../scripts/lib/grh-municipal-footprint.mjs';
import {municipalFootprintCatalog,municipalFootprintResults,municipalFootprintTarget as target} from './fixtures/municipal-footprint-synthetic.js';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget} from './fixtures/final-source-revision-synthetic.js';
import {prepareFinalSourceRevisionWithinTransaction} from '../scripts/lib/grh-final-source-revision.mjs';
import {parseNativeContinuityArgs,readNativeCatalogEvidence} from '../scripts/verify-grh-native-continuity.mjs';
const catalog=()=>municipalFootprintCatalog(profileId);
const seal=r=>{const {reportSha256,...value}=r;return {...value,reportSha256:createHash('sha256').update(stableJson(value)).digest('hex')};};
function client(change=()=>{}){
 const c=catalog(),results=municipalFootprintResults(c,target,profileId),calls=[];
 for(const index of [0,results.length-1])Object.assign(results[index][0].observation,{readOnly:'off',isolation:'serializable',owner:true});
 let queryIndex=-2;
 return {calls,async query(text,values){calls.push({text,values});queryIndex++;
  const rows=structuredClone(queryIndex===-1?c.tables:queryIndex===0?c.foreignKeys:results[queryIndex-1]);
  change(rows,queryIndex,text);return {rows};}};
}
test('SQL144 profile includes all 86 domains and both direct and inherited adoption histories',()=>{
 const plan=planMunicipalContinuity(catalog(),{profileId}),r=summarizeNativeContinuity(plan);
 assert.equal(r.coverageComplete,true);assert.equal(r.totalTables,86);assert.equal(r.rootTables,67);assert.equal(r.dependentTables,19);
 for(const table of ['employment_adoption_proposal','employment_adoption_decision','employment_adoption_seal','employment_adoption_application'])assert.ok(r.domains.some(d=>d.table===table));
 assert.equal(r.sourcePromotionAuthorized,false);assert.equal(r.nativeConflictsResolved,false);
 for(const table of ['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'])assert.ok(r.excludedScopeTables.includes(table));
 assert.equal(municipalContinuityProfile().tables.length,82);assert.ok(Object.isFrozen(municipalContinuityProfile(profileId).inheritance));
});
test('adoption applications and seals inherit scope only from their declared decision or proposal',()=>{
 for(const [table,parent,key]of [['employment_adoption_application','employment_adoption_decision','decision_id'],['employment_adoption_seal','employment_adoption_proposal','proposal_id']]){
  const sql=municipalFootprintQuery(table,{profileId});assert.match(sql,new RegExp(`JOIN public\\.${parent} p ON r\\.${key}=p\\.id`));
  assert.match(sql,/WHERE p\.tenant_id=\$1::uuid AND p\.source_binding_id=\$2::uuid/);
  const c=catalog();c.foreignKeys.find(f=>f.child===table).parent_columns=['tenant_id'];
  assert.throws(()=>planMunicipalContinuity(c,{profileId}),{code:'SUCCESSOR_CONTINUITY_PARENT_SCOPE_REQUIRED'});
 }
 assert.throws(()=>municipalFootprintQuery('employment_adoption_application'),{code:'MUNICIPAL_FOOTPRINT_TABLE_INVALID'});
});
test('metadata drift, missing adoption history and future domains cannot become complete coverage',()=>{
 for(const change of [c=>c.tables.splice(c.tables.findIndex(t=>t.name==='employment_adoption_seal'),1),
  c=>{c.foreignKeys.find(f=>f.child==='employment_adoption_application').validated=false;},
  c=>c.tables.find(t=>t.name==='employment_adoption_application').columns.push('tenant_id')]){
  const c=catalog();change(c);assert.throws(()=>planMunicipalFootprint(c,target,{profileId}));
 }
 const c=catalog();c.tables.push({name:'future_municipal_table',kind:'r',columns:['id','tenant_id','source_binding_id']});
 assert.throws(()=>planMunicipalFootprint(c,target,{profileId}),{code:'MUNICIPAL_FOOTPRINT_COVERAGE_INCOMPLETE'});
});
test('an inherited record cannot acquire a fictitious direct tenant/binding scope',()=>{
 for(const table of ['employment_adoption_seal','employment_adoption_application','own_payroll_run_result']){
  const c=catalog();c.tables.find(t=>t.name===table).columns.push('tenant_id','source_binding_id');
  assert.throws(()=>planMunicipalContinuity(c,{profileId}),{code:'SUCCESSOR_CONTINUITY_BINDING_DRIFT'});
 }
});
test('explicit new read-only profile yields complete evidence without nominal records or writes',()=>{
 const c=catalog(),plan=planMunicipalFootprint(c,target,{profileId}),r=evaluateMunicipalFootprint(plan,municipalFootprintResults(c,target,profileId));
 assert.equal(r.profileId,profileId);assert.equal(Object.keys(r.entities).length,86);assert.equal(r.readOnly,true);
 assert.equal(r.containsPersonalRecords,false);assert.equal(r.writeStatements,0);assert.equal(compareMunicipalFootprints(r,r).preserved,true);
 assert.throws(()=>municipalContinuityProfile('latest'));
});
test('offline CLI checks exact catalog bytes for the explicit 86-table profile',async t=>{
 const root=path.resolve('verification');fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'final-conservation-offline-'));
 t.after(()=>{assert.equal(path.dirname(directory),root);assert.ok(!fs.lstatSync(directory).isSymbolicLink());fs.rmSync(directory,{recursive:true,force:true});});
 const file=path.join(directory,'synthetic-catalog.json'),bytes=JSON.stringify(catalog());fs.writeFileSync(file,bytes);
 const expected=createHash('sha256').update(bytes).digest('hex');
 const args=parseNativeContinuityArgs(['--catalog',file,'--expect-catalog',expected,'--profile',profileId]);assert.equal(args.profile,profileId);
 const report=await readNativeCatalogEvidence(file,expected,{profile:args.profile});assert.equal(report.totalTables,86);assert.equal(report.coverageComplete,true);
 assert.equal(report.queryExecuted,false);assert.equal(report.writeStatements,0);assert.equal(report.businessRowsReviewed,false);
 fs.appendFileSync(file,' ');await assert.rejects(readNativeCatalogEvidence(file,expected,{profile:profileId}),/NATIVE_CONTINUITY_CATALOG_CHANGED/);
});
test('an old 82-table receipt cannot stand in for a new complete conservation receipt',()=>{
 const c=catalog(),final=evaluateMunicipalFootprint(planMunicipalFootprint(c,target,{profileId}),municipalFootprintResults(c,target,profileId));
 const oldCatalog=municipalFootprintCatalog(),old=evaluateMunicipalFootprint(planMunicipalFootprint(oldCatalog,target),municipalFootprintResults(oldCatalog,target));
 assert.throws(()=>compareMunicipalFootprints(old,final),{code:'MUNICIPAL_FOOTPRINT_PROFILE_CHANGED'});
 const forged=structuredClone(final);forged.profileId='municipal-sql131';assert.throws(()=>compareMunicipalFootprints(seal(forged),old),{code:'MUNICIPAL_FOOTPRINT_RECEIPT_INCOMPLETE'});
});
test('maintenance conservation reads every domain in the caller transaction and opens no transaction',async()=>{
 const db=client(),r=await inspectMunicipalConservationWithinTransaction({client:db,target});
 assert.equal(r.version,'grh-municipal-footprint.v2');assert.equal(r.readOnly,false);assert.equal(r.callerOwnedTransaction,true);assert.equal(r.writeStatements,0);
 assert.equal(Object.keys(r.entities).length,86);assert.equal(compareMunicipalFootprints(r,r).preserved,true);
 assert.equal(db.calls.length,94);assert.equal(db.calls[0].text,CONTINUITY_TABLES_SQL);assert.equal(db.calls[1].text,CONTINUITY_FOREIGN_KEYS_SQL);
 assert.ok(db.calls.every(q=>/^SELECT/.test(q.text)));assert.doesNotMatch(JSON.stringify(r),/PRIVATE|before_contract|source_payload/);
});
for(const [field,value]of [['readOnly','on'],['isolation','read committed'],['timezone','America/Argentina/Mendoza'],['owner',false]])test('maintenance refuses invalid transaction '+field,async()=>{
 await assert.rejects(inspectMunicipalConservationWithinTransaction({client:client((rows,i)=>{if(i===1)rows[0].observation[field]=value;}),target}),{code:'MUNICIPAL_FOOTPRINT_TRANSACTION_INVALID'});
});
test('scope, catalog and same-count adoption content changes are detected',async()=>{
 const before=await inspectMunicipalConservationWithinTransaction({client:client(),target});
 const after=structuredClone(before);after.entities.employment_adoption_application={rows:0,sha256:'a'.repeat(64)};
 assert.throws(()=>compareMunicipalFootprints(before,seal(after)),{code:'MUNICIPAL_FOOTPRINT_RECEIPT_INVALID'});
 for(const table of ['employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','employment_adoption_seal']){
  const a=structuredClone(before),b=structuredClone(before);a.entities[table]={rows:1,sha256:'a'.repeat(64)};b.entities[table]={rows:1,sha256:'b'.repeat(64)};
  const compared=compareMunicipalFootprints(seal(a),seal(b));assert.equal(compared.preserved,false);assert.deepEqual(compared.changes,[{table,beforeRows:1,afterRows:1}]);
 }
 await assert.rejects(inspectMunicipalConservationWithinTransaction({client:client((rows,i)=>{if(i===1)rows[0].observation.bindingId='00000000-0000-0000-0000-000000000099';}),target}),{code:'MUNICIPAL_FOOTPRINT_TARGET_CHANGED'});
});
test('cancellation ends inspection without returning conservation evidence',async()=>{
 const signal=AbortSignal.abort();const db=client();await assert.rejects(inspectMunicipalConservationWithinTransaction({client:db,target,signal}),{name:'AbortError'});assert.equal(db.calls.length,0);
});
for(const table of ['employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','employment_adoption_seal'])test('final preparer rolls back same-count changes in '+table,async()=>{
 const prepared=await finalRevisionPackage(),db=finalRevisionClient(prepared,{municipal(rows,i){
  if(rows[0]?.observation?.table===table)Object.assign(rows[0].observation,{rows:1,sha256:(i>88?'b':'a').repeat(64)});
 }});
 await assert.rejects(prepareFinalSourceRevisionWithinTransaction({client:db,prepared,target:finalRevisionTarget,
  expectedPackageSha256:prepared.payloadSha256,installSchema:true}),{code:'GRH_FINAL_REVISION_MUNICIPAL_PRESERVATION'});
 assert.equal(db.stored,null);assert.equal(db.deltaRows,0);assert.equal(db.state.installed,false);
 assert.ok(db.calls.at(-1).text.startsWith('ROLLBACK TO SAVEPOINT'));
});
