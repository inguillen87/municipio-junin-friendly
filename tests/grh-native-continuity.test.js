import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {planNativeContinuity,CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL} from '../scripts/lib/grh-successor-continuity.mjs';
import {summarizeNativeContinuity} from '../scripts/lib/grh-successor-native-summary.mjs';
import {parseNativeContinuityArgs,readNativeCatalogEvidence} from '../scripts/verify-grh-native-continuity.mjs';
import {nativeCatalogFixture} from './fixtures/native-continuity-catalog.js';
const report=catalog=>summarizeNativeContinuity(planNativeContinuity(catalog));
test('all 13 roots and 14 declared dependent tables are covered without reading records',()=>{
 const r=report(nativeCatalogFixture());assert.equal(r.rootTables,13);assert.equal(r.dependentTables,14);assert.equal(r.totalTables,27);
 assert.equal(r.directScopeTables,25);assert.equal(r.inheritedScopeTables,2);assert.equal(r.coverageComplete,true);
 assert.equal(r.businessRowsReviewed,false);assert.equal(r.nativeConflictsResolved,false);assert.equal(r.sourcePromotionAuthorized,false);assert.equal(r.attachmentBytesVerified,false);
});
test('composite constraints preserve source and destination column correspondence',()=>{
 const p=planNativeContinuity(nativeCatalogFixture()),f=p.links.find(f=>f.child==='payroll_novelty_issue'&&f.parent==='payroll_novelty_row');
 assert.deepEqual(f.child_columns,['row_id','tenant_id','batch_id']);assert.deepEqual(f.parent_columns,['id','tenant_id','batch_id']);assert.ok(Object.isFrozen(f.child_columns));
});
test('self-references and two-table cycles terminate and remain in the manifest',()=>{
 const r=report(nativeCatalogFixture());assert.equal(r.selfReferences,1);assert.ok(r.internalForeignKeys>20);
 assert.ok(r.domains.find(d=>d.table==='payroll_fixed_assignment').nativeParents.includes('payroll_fixed_change'));
 assert.ok(r.domains.find(d=>d.table==='payroll_fixed_change').nativeParents.includes('payroll_fixed_assignment'));
});
test('sorting catalog rows does not change the graph evidence',()=>{
 const c=nativeCatalogFixture(),before=planNativeContinuity(c).planSha256;c.tables.reverse();c.foreignKeys.reverse();assert.equal(planNativeContinuity(c).planSha256,before);
});
test('planning does not freeze or mutate the input catalog',()=>{
 const c=nativeCatalogFixture(),copy=structuredClone(c);planNativeContinuity(c);assert.deepEqual(c,copy);assert.equal(Object.isFrozen(c.tables[0].columns),false);
});
const invalid={
 missingRoot:c=>c.tables.splice(c.tables.findIndex(t=>t.name==='action_case'),1),
 duplicateTable:c=>c.tables.push({...c.tables[0]}),
 duplicateColumn:c=>c.tables[0].columns.push('tenant_id'),
 missingTenant:c=>{c.tables.find(t=>t.name==='action_case_event').columns=c.tables.find(t=>t.name==='action_case_event').columns.filter(n=>n!=='tenant_id');},
 wrongKind:c=>c.tables.find(t=>t.name==='action_case').kind='p',
 invalidForeignKey:c=>c.foreignKeys[0].validated=false,
 missingParent:c=>c.foreignKeys[0].parent='unknown_parent',
 missingColumn:c=>c.foreignKeys[0].child_columns=['unknown_column'],
 brokenPair:c=>c.foreignKeys[0].parent_columns=['id','tenant_id'],
 duplicateForeignKey:c=>c.foreignKeys.push({...c.foreignKeys[0]}),
 ambiguousBinding:c=>c.tables.find(t=>t.name==='action_case_event').columns.push('certified_binding_id'),
 unknownBindingInheritance:c=>{const t=c.tables.find(t=>t.name==='action_case_event');t.columns=t.columns.filter(n=>n!=='source_binding_id');},
 crossSchema:c=>c.foreignKeys[0].child_schema='external',
 crossSchemaSameName:c=>c.foreignKeys.push({...c.foreignKeys[0],child_schema:'external'}),
 unpairedTenant:c=>c.foreignKeys.find(f=>f.child==='payroll_novelty_row'&&f.parent==='payroll_novelty_batch').parent_columns=['tenant_id','id']
};
for(const [label,change]of Object.entries(invalid))test('catalog refuses '+label,()=>{const c=nativeCatalogFixture();change(c);assert.throws(()=>planNativeContinuity(c));});
test('an additional dependent table is surfaced, never silently certified',()=>{
 const c=nativeCatalogFixture();c.tables.push({name:'future_action_attachment',kind:'r',columns:['id','tenant_id','source_binding_id','case_id']});
 c.foreignKeys.push({...c.foreignKeys[0],child:'future_action_attachment',name:'future_attachment_fk'});
 const r=report(c);assert.equal(r.coverageComplete,false);assert.deepEqual(r.unreviewedTables,['future_action_attachment']);assert.equal(r.sourcePromotionAuthorized,false);
});
test('a missing previously covered leaf withdraws complete coverage',()=>{
 const c=nativeCatalogFixture();c.tables=c.tables.filter(t=>t.name!=='school_certificate_event');c.foreignKeys=c.foreignKeys.filter(f=>f.child!=='school_certificate_event');
 const r=report(c);assert.equal(r.coverageComplete,false);assert.deepEqual(r.missingTables,['school_certificate_event']);
});
test('tampered or extended plan cannot be presented as verified coverage',()=>{
 const p=planNativeContinuity(nativeCatalogFixture());assert.throws(()=>summarizeNativeContinuity({...p,extra:true}));
 const altered=structuredClone(p);altered.tables.pop();assert.throws(()=>summarizeNativeContinuity(altered));
});
for(const column of ['bad name','bad-name','X'.repeat(64),'invalid;column'])test('invalid catalog identifier is rejected: '+column,()=>{
 const c=nativeCatalogFixture();c.tables[0].columns.push(column);assert.throws(()=>planNativeContinuity(c));
});
test('catalog queries read PostgreSQL metadata only',()=>{
 for(const query of [CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL]){assert.match(query,/^SELECT /);assert.doesNotMatch(query,/FROM public\.|to_jsonb\(r\)|\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/);}
});
test('CLI has no default source path, default checksum or implicit remote connection',()=>{
 for(const args of [[],['--catalog','relative.json','--expect-catalog','a'.repeat(64)],['--catalog',path.resolve('x.json')],['--catalog',path.resolve('x.json'),'--expect-catalog','bad']])assert.throws(()=>parseNativeContinuityArgs(args));
 const good=parseNativeContinuityArgs(['--catalog',path.resolve('x.json'),'--expect-catalog','a'.repeat(64)]);assert.equal(good['expect-catalog'],'a'.repeat(64));
});
test('exact file bytes are required before producing an offline report',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-native-catalog-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'catalog.json');
 const bytes=JSON.stringify(nativeCatalogFixture());fs.writeFileSync(file,bytes);const hash=createHash('sha256').update(bytes).digest('hex');
 const value=await readNativeCatalogEvidence(file,hash);assert.equal(value.coverageComplete,true);assert.equal(value.queryExecuted,false);assert.equal(value.writeStatements,0);
 fs.appendFileSync(file,' ');await assert.rejects(readNativeCatalogEvidence(file,hash),/CATALOG_CHANGED/);
});
test('input limit is enforced before parsing or emitting a report',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-catalog-limit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'large.json');
 fs.writeFileSync(file,'x'.repeat(1024*1024+1));await assert.rejects(readNativeCatalogEvidence(file,'a'.repeat(64)),/FILE_INVALID/);
});
