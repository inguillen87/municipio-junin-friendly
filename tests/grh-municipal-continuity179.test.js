import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {stableJson} from '../scripts/lib/canonical-import.mjs';
import {municipalContinuityProfile} from '../scripts/lib/grh-municipal-continuity-schema.mjs';
import {planMunicipalContinuity,CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL} from '../scripts/lib/grh-successor-continuity.mjs';
import {summarizeNativeContinuity} from '../scripts/lib/grh-successor-native-summary.mjs';
import {municipalFootprintQuery,planMunicipalFootprint,evaluateMunicipalFootprint,inspectMunicipalConservationWithinTransaction,compareMunicipalFootprints} from '../scripts/lib/grh-municipal-footprint.mjs';
import {municipalFootprintCatalog,municipalFootprintResults,municipalFootprintTarget as target} from './fixtures/municipal-footprint-synthetic.js';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget} from './fixtures/final-source-revision-synthetic.js';
import {prepareFinalSourceRevisionWithinTransaction} from '../scripts/lib/grh-final-source-revision.mjs';
import {parseFinalSourceRevisionArgs,executeFinalSourceRevision} from '../scripts/prepare-grh-final-source-revision.mjs';
import path from 'node:path';
const profileId='municipal-sql179',legacyId='municipal-sql144';
const hash=value=>createHash('sha256').update(stableJson(value)).digest('hex');
const seal=report=>{const {reportSha256,...value}=report;return {...value,reportSha256:hash(value)};};
const additions=[
 [146,'own_payroll_annul_event'],[147,'own_payroll_accounting_event'],[148,'own_payroll_imputation_event'],[149,'own_bank_account_event'],
 [152,'own_payroll_journal_event'],[153,'own_payroll_reconciliation_event'],[156,'own_seniority_event'],[157,'own_participation_event'],
 [158,'own_art_days_event'],[160,'own_fiscal_facts_event'],[163,'own_working_time_event'],[171,'own_salary_conditions_event'],
 [177,'own_period_classification_event'],[179,'own_agreement_working_time_event']
];
function client(id=profileId,change=()=>{},scope=target){
 const catalog=municipalFootprintCatalog(id),results=municipalFootprintResults(catalog,scope,id),calls=[];
 for(const i of[0,results.length-1])Object.assign(results[i][0].observation,{readOnly:'off',isolation:'serializable',owner:true});
 return {calls,async query(text,values){const index=calls.length%(results.length+2);calls.push({text,values});
  const rows=structuredClone(index===0?catalog.tables:index===1?catalog.foreignKeys:results[index-2]);change(rows,calls.length,text);return {rows};}};
}
function currentRevisionClient(prepared,change){
 const base=finalRevisionClient(prepared),current=client(profileId,change,finalRevisionTarget),originalQuery=base.query.bind(base);
 return Object.assign(base,{async query(text,values){
  if([CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL].includes(text)||text.startsWith("SELECT jsonb_build_object('projectId'")||text.startsWith("SELECT jsonb_build_object('table'"))return current.query(text,values);
  return originalQuery(text,values);
 },currentCalls:current.calls});
}

test('the exact reviewed131 and144 profile values and default remain unchanged',()=>{
 assert.equal(municipalContinuityProfile().id,'municipal-sql131');
 assert.equal(hash(municipalContinuityProfile('municipal-sql131')),'a1227a076039fb7f3a5b2e749d2006f10e68e36f06fcd218a58bb0da2b515aa0');
 assert.equal(hash(municipalContinuityProfile(legacyId)),'33a3f9c2a7595d68e1852c1b8cb38f85b71948aa353259c94525bff6fb44d3b7');
 assert.deepEqual(municipalContinuityProfile(profileId).inheritance,municipalContinuityProfile(legacyId).inheritance);
 assert.deepEqual(municipalContinuityProfile(profileId).exclusions,municipalContinuityProfile(legacyId).exclusions);
});

test('all fourteen new direct scopes and composite references derive from their actual SQL DDL',()=>{
 const profile=municipalContinuityProfile(profileId),legacy=municipalContinuityProfile(legacyId);
 assert.deepEqual(profile.tables.filter(t=>!legacy.tables.includes(t)).sort(),additions.map(([,table])=>table).sort());
 assert.deepEqual([...profile.bindingReferences].sort(),additions.map(([,table])=>table).sort());
 for(const [number,table]of additions){
  const file=fs.readdirSync(new URL('../scripts/migrations/',import.meta.url)).find(name=>name.startsWith(number+'-'));
  const text=fs.readFileSync(new URL('../scripts/migrations/'+file,import.meta.url),'utf8');
  const body=text.match(new RegExp('CREATE TABLE public\\.'+table+'\\s*\\(([\\s\\S]*?)\\n\\);'))?.[1];assert.ok(body,table);
  assert.match(body,/\btenant_id uuid NOT NULL/);assert.match(body,/\bsource_binding_id uuid NOT NULL/);
  assert.match(body,/FOREIGN KEY\s*\(tenant_id,\s*source_binding_id\)\s*REFERENCES public\.platform_tenant_source_binding\s*\(tenant_id,\s*id\)/);
  assert.equal(profile.bindings[table],'source_binding_id');assert.ok(!profile.inheritance.some(p=>p.child===table));
 }
 assert.ok(Object.isFrozen(profile.bindingReferences));
});

test('the previous144 profile still refuses the complete current catalog rather than omitting fourteen histories',()=>{
 const catalog=municipalFootprintCatalog(profileId),summary=summarizeNativeContinuity(planMunicipalContinuity(catalog,{profileId:legacyId}));
 assert.equal(summary.totalTables,100);assert.equal(summary.coverageComplete,false);
 assert.throws(()=>planMunicipalFootprint(catalog,target,{profileId:legacyId}),{code:'MUNICIPAL_FOOTPRINT_COVERAGE_INCOMPLETE'});
 for(const[,table]of additions)assert.throws(()=>municipalFootprintQuery(table,{profileId:legacyId}),{code:'MUNICIPAL_FOOTPRINT_TABLE_INVALID'});
});

test('current179 covers exactly100 histories,81 direct and19 inherited, without changing the scope ceiling',()=>{
 const summary=summarizeNativeContinuity(planMunicipalContinuity(municipalFootprintCatalog(profileId),{profileId}));
 assert.equal(summary.coverageComplete,true);assert.equal(summary.totalTables,100);assert.equal(summary.rootTables,81);assert.equal(summary.dependentTables,19);
 assert.equal(summary.sourcePromotionAuthorized,false);assert.equal(summary.businessRowsReviewed,false);
 for(const[,table]of additions){const sql=municipalFootprintQuery(table,{profileId});assert.match(sql,/WHERE r\.tenant_id=\$1::uuid AND r\.source_binding_id=\$2::uuid$/);assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|INSERT)\b/);}
 for(const path of municipalContinuityProfile(legacyId).inheritance)assert.equal(municipalFootprintQuery(path.child,{profileId}),municipalFootprintQuery(path.child,{profileId:legacyId}));
 const catalog=municipalFootprintCatalog(profileId);catalog.tables.push({name:'future_municipal_event',kind:'r',columns:['id','tenant_id','source_binding_id']});
 assert.throws(()=>planMunicipalFootprint(catalog,target,{profileId}),{code:'SUCCESSOR_CONTINUITY_SCOPE_LIMIT'});
});

for(const[,table]of additions)test('a missing current history cannot yield a receipt: '+table,()=>{
 const catalog=municipalFootprintCatalog(profileId);catalog.tables=catalog.tables.filter(t=>t.name!==table);catalog.foreignKeys=catalog.foreignKeys.filter(f=>f.child!==table);
 assert.throws(()=>planMunicipalFootprint(catalog,target,{profileId}));
});

for(const[label,mutate,code]of[
 ['missing direct reference',c=>{c.foreignKeys=c.foreignKeys.filter(f=>f.child!=='own_participation_event');},'SUCCESSOR_CONTINUITY_BINDING_REFERENCE_REQUIRED'],
 ['reversed binding key',c=>{c.foreignKeys.find(f=>f.child==='own_participation_event').parent_columns.reverse();},'SUCCESSOR_CONTINUITY_BINDING_REFERENCE_REQUIRED'],
 ['wrong binding parent',c=>{c.foreignKeys.find(f=>f.child==='own_participation_event').parent='own_payroll_run_capture';},'SUCCESSOR_CONTINUITY_BINDING_REFERENCE_REQUIRED'],
 ['unvalidated reference',c=>{c.foreignKeys.find(f=>f.child==='own_participation_event').validated=false;},'SUCCESSOR_CONTINUITY_UNVERIFIED_FOREIGN_KEY'],
 ['foreign schema reference',c=>{c.foreignKeys.find(f=>f.child==='own_participation_event').parent_schema='foreign';},'SUCCESSOR_CONTINUITY_UNVERIFIED_FOREIGN_KEY'],
 ['wrong binding column',c=>{const t=c.tables.find(t=>t.name==='own_participation_event');t.columns[t.columns.indexOf('source_binding_id')]='certified_binding_id';},'SUCCESSOR_CONTINUITY_BINDING_DRIFT'],
 ['ambiguous binding',c=>{c.tables.find(t=>t.name==='own_participation_event').columns.push('certified_binding_id');},'SUCCESSOR_CONTINUITY_AMBIGUOUS_BINDING'],
 ['missing tenant',c=>{const t=c.tables.find(t=>t.name==='own_participation_event');t.columns=t.columns.filter(k=>k!=='tenant_id');},'SUCCESSOR_CONTINUITY_UNSUPPORTED_TABLE'],
 ['altered inherited decision join',c=>{c.foreignKeys.find(f=>f.child==='employment_adoption_application').parent_columns=['tenant_id'];},'SUCCESSOR_CONTINUITY_PARENT_SCOPE_REQUIRED']
])test('the new profile rejects '+label,()=>{const catalog=municipalFootprintCatalog(profileId);mutate(catalog);assert.throws(()=>planMunicipalFootprint(catalog,target,{profileId}),{code});});

test('SQL185 provenance is not hidden or given an invented direct scope',()=>{
 const catalog=municipalFootprintCatalog(profileId);catalog.tables.push({name:'municipal_owner_adoption_provenance',kind:'r',columns:['decision_id']});
 catalog.foreignKeys.push({child:'municipal_owner_adoption_provenance',parent:'employment_adoption_decision',name:'provenance_decision_fk',child_schema:'public',parent_schema:'public',validated:true,child_columns:['decision_id'],parent_columns:['id']});
 assert.throws(()=>planMunicipalFootprint(catalog,target,{profileId}),{code:'SUCCESSOR_CONTINUITY_SCOPE_LIMIT'});
});

test('explicit179 maintenance reads100 full-row hashes and preserves default144 receipt recovery',async()=>{
 const db=client(),current=await inspectMunicipalConservationWithinTransaction({client:db,target,profileId});
 assert.equal(current.profileId,profileId);assert.equal(Object.keys(current.entities).length,100);assert.equal(db.calls.length,108);assert.equal(current.writeStatements,0);
 assert.equal(db.calls[0].text,CONTINUITY_TABLES_SQL);assert.equal(db.calls[1].text,CONTINUITY_FOREIGN_KEYS_SQL);assert.ok(db.calls.every(q=>q.text.startsWith('SELECT')));
 assert.equal(compareMunicipalFootprints(current,current).preserved,true);
 const previous=await inspectMunicipalConservationWithinTransaction({client:client(legacyId),target});assert.equal(previous.profileId,legacyId);assert.equal(Object.keys(previous.entities).length,86);
 assert.equal(compareMunicipalFootprints(previous,previous).preserved,true);assert.throws(()=>compareMunicipalFootprints(previous,current),{code:'MUNICIPAL_FOOTPRINT_PROFILE_CHANGED'});
 for(const id of['latest','municipal-sql131']){const db=client();await assert.rejects(inspectMunicipalConservationWithinTransaction({client:db,target,profileId:id}));assert.equal(db.calls.length,0);}
});

test('same-count changed content in any new event breaks conservation',async()=>{
 const baseline=await inspectMunicipalConservationWithinTransaction({client:client(),target,profileId});
 for(const[,table]of additions){const before=structuredClone(baseline),after=structuredClone(baseline);before.entities[table]={rows:1,sha256:'a'.repeat(64)};after.entities[table]={rows:1,sha256:'b'.repeat(64)};
  const result=compareMunicipalFootprints(seal(before),seal(after));assert.equal(result.preserved,false);assert.deepEqual(result.changes,[{table,beforeRows:1,afterRows:1}]);}
 const missing=structuredClone(baseline);delete missing.entities.own_participation_event;assert.throws(()=>compareMunicipalFootprints(baseline,seal(missing)),{code:'MUNICIPAL_FOOTPRINT_RECEIPT_INCOMPLETE'});
});

test('the final-source writer chooses179 on both bookends and rolls back changed current data',async()=>{
 const prepared=await finalRevisionPackage(),options={prepared,target:finalRevisionTarget,expectedPackageSha256:prepared.payloadSha256,installSchema:true,conservationProfileId:profileId};
 const db=currentRevisionClient(prepared),receipt=await prepareFinalSourceRevisionWithinTransaction({client:db,...options});
 assert.equal(receipt.municipalConservation.tables,100);assert.equal(receipt.municipalConservation.preserved,true);
 for(const[,table]of additions)assert.equal(db.currentCalls.filter(q=>q.text.startsWith("SELECT jsonb_build_object('table','"+table+"'")).length,2);
 const changed=currentRevisionClient(prepared,(rows,index)=>{if(rows[0]?.observation?.table==='own_participation_event')Object.assign(rows[0].observation,{rows:1,sha256:(index>108?'b':'a').repeat(64)});});
 await assert.rejects(prepareFinalSourceRevisionWithinTransaction({client:changed,...options}),{code:'GRH_FINAL_REVISION_MUNICIPAL_PRESERVATION'});
 assert.equal(changed.stored,null);assert.equal(changed.deltaRows,0);assert.ok(changed.calls.at(-1).text.startsWith('ROLLBACK TO SAVEPOINT'));
});

test('CLI conservation selection accepts only explicit144 or179 and preserves the prior default',()=>{
 const args=['--target',path.resolve('synthetic-target.json'),'--baseline-core',path.resolve('baseline-core'),'--candidate-core',path.resolve('candidate-core'),
  '--baseline-curated',path.resolve('baseline-curated'),'--candidate-curated',path.resolve('candidate-curated'),'--expect-package','a'.repeat(64),'--rehearse'];
 assert.equal(parseFinalSourceRevisionArgs(args)['conservation-profile'],undefined);
 for(const id of[legacyId,profileId])assert.equal(parseFinalSourceRevisionArgs([...args,'--conservation-profile='+id])['conservation-profile'],id);
 for(const id of['latest','municipal-sql131','municipal-sql185','municipal-sql179\n','municipal-sql179\r',''])assert.throws(()=>parseFinalSourceRevisionArgs([...args,'--conservation-profile='+id]),{code:'GRH_FINAL_REVISION_ARGUMENT'});
});

test('execution forwards explicit179 through both inspections and invalid selection opens no connection',async()=>{
 const prepared=await finalRevisionPackage(),options={prepared,target:finalRevisionTarget,expectedPackageSha256:prepared.payloadSha256,installSchema:true};
 const db=currentRevisionClient(prepared);let releases=0;db.release=()=>{releases++;};
 const receipt=await executeFinalSourceRevision({connect:async()=>db,...options,conservationProfileId:profileId});
 assert.equal(receipt.municipalConservation.tables,100);assert.equal(receipt.rolledBack,true);assert.equal(releases,1);
 assert.equal(db.currentCalls.filter(q=>q.text===CONTINUITY_TABLES_SQL).length,6);
 const legacy=finalRevisionClient(prepared);legacy.release=()=>{};const old=await executeFinalSourceRevision({connect:async()=>legacy,...options});assert.equal(old.municipalConservation.tables,86);
 let connections=0;for(const id of['latest','municipal-sql131',null,{},'municipal-sql179\n']){
  await assert.rejects(executeFinalSourceRevision({connect:async()=>{connections++;},...options,conservationProfileId:id}),{code:'GRH_FINAL_REVISION_ARGUMENT'});
  const db=finalRevisionClient(prepared);await assert.rejects(prepareFinalSourceRevisionWithinTransaction({client:db,...options,conservationProfileId:id}),{code:'GRH_FINAL_REVISION_ARGUMENT'});assert.equal(db.calls.length,0);
 }assert.equal(connections,0);
});
