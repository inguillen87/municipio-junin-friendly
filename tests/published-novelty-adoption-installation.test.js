import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildPublishedNoveltyAdoptionInstallation as build,assertPublishedNoveltyAdoptionDurability as durable,publishedAdoptionCachedRows} from '../scripts/lib/published-novelty-adoption-installation.mjs';
import {preparePublishedNoveltyAdoptionInstallation} from '../scripts/prepare-published-novelty-adoption-installation.mjs';
const options={read:p=>fs.readFileSync(p,'utf8'),sourceCommit:'4ccde11e8c98bc8942f76dfb04e0a1f25ef2ec73'};
test('published SQL130 requires a separate atomic upgrade; old standalone pins remain strict',()=>{
 const b=build(options),original=b.bulk.operator.consumers;
 assert.notEqual(b.beforePins.find(p=>p.name==='own_run_capture_v1').sha256,original.beforePins.find(p=>p.name==='own_run_capture_v1').sha256);
 assert.equal(b.beforePins.find(p=>p.name==='own_run_capture_v1').sha256,b.bulk.novelty.consumerPin.sha256);
 assert.ok(original.initialChecks.includes(original.beforePins.find(p=>p.name==='own_run_capture_v1').sha256));
 assert.ok(!original.initialChecks.includes(b.bulk.novelty.consumerPin.sha256));
 const application=b.apply.join('\n');
 assert.deepEqual(b.installation.slice(3,3+b.apply.length),b.apply);
 assert.ok(application.includes('CREATE OR REPLACE FUNCTION public.own_novelty_bootstrap_v1'));
 assert.ok(application.includes('native_batches:=public.own_novelty_sources_v1'));
 assert.ok(!application.includes('CREATE TABLE public.own_payroll_novelty_event'));
 assert.ok(!application.includes('DROP TABLE'));
 // Existing immutable-table triggers explicitly forbid TRUNCATE. Check the
 // executed statements, rather than mistaking their guard declarations for DML.
 assert.ok(b.stages.every(s=>!/^\s*(?:DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i.test(s)));
});
test('existing novelty security, rows, OIDs and every non-body function field are preserved',()=>{
 const b=build(options);assert.equal(b.upgrades.length,3);
 assert.ok(b.before.includes("to_regprocedure('public.own_novelty_bootstrap_v1(jsonb)')"));
 assert.ok(b.before.includes("THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END"));
 assert.ok(!b.before.includes("p.proname LIKE 'own_novelty_%'"));
 assert.ok(b.before.includes('FROM %I.%I r) hashed'));assert.ok(b.audit.includes('old-\'triggers\' IS DISTINCT FROM new-\'triggers\''));
 assert.ok(b.initialChecks.join('\n').includes('SQL130_METADATA_CHANGED'));
 assert.ok(b.finalChecks.join('\n').includes('PUBLISHED_ADOPTION_AFTER_METADATA'));
 assert.ok(b.finalChecks.join('\n').includes('SQL130_TABLE_SECURITY'));
 assert.ok(!b.finalChecks.join('\n').includes('IF EXISTS(SELECT 1 FROM public.own_payroll_novelty_event) OR'));
 assert.equal(b.durableVerification[0],'SET TRANSACTION READ ONLY');
 assert.ok(b.state.includes('PUBLISHED_ADOPTION_PARTIAL_STATE'));assert.equal(b.connects,false);assert.equal(b.executesSql,false);
});
test('unknown source definitions and source commits cannot be prepared',()=>{
 assert.throws(()=>build({...options,sourceCommit:'unknown'}));
 for(const file of ['130-own-bulk-novelties.sql','140-adopted-own-payroll-capture.sql'])assert.throws(()=>build({...options,read:p=>options.read(p)+(p.endsWith(file)?'-- unreviewed\n':'')}));
});
test('review binds both existing databases and verifies durability read-only',()=>{
 const b=preparePublishedNoveltyAdoptionInstallation(options);
 assert.deepEqual(b.targets.map(t=>t.major),[17,18]);assert.equal(b.targets.length,2);
 for(const t of b.targets){assert.ok(t.installation.some(s=>[t.projectId,t.branchId,t.endpointId,t.database,t.role].every(v=>s.includes(v))));assert.equal(t.installation.at(-1),b.proof);assert.equal(t.durableVerification[0],'SET TRANSACTION READ ONLY');assert.equal(t.durableVerification.filter(s=>s==='SET TRANSACTION READ ONLY').length,1);}
 for(const s of b.apply){assert.ok(s.startsWith('DO $published_adoption$'));assert.ok(s.endsWith('$published_adoption$'));}
 assert.ok(b.apply.some(s=>s.includes('DO $conditional$')));
});

test('every preservation scan has a separate deadline while the full installation remains one transaction',()=>{
 const b=preparePublishedNoveltyAdoptionInstallation(options),c=b.consumers;
 // Keep both complete base snapshots and their conservation audit. Previously
 // they were nested together in baseFirst, itself inside a single outer DO.
 for(const s of c.base.statements.slice(0,-1))assert.ok(b.stages.some(v=>v.includes(publishedAdoptionCachedRows(s).replaceAll("'","''"))));
 for(const scan of [c.before,c.after,b.operator.before,b.operator.after])assert.ok(b.stages.includes(publishedAdoptionCachedRows(scan)));
 assert.ok(b.stages.includes(c.priorAudit));assert.ok(b.stages.includes(b.operator.audit));
 for(const s of b.apply)assert.ok((s.match(/DO \$snapshot\$/g)??[]).length<=1);
 for(const t of b.targets){assert.ok(t.installation.includes("SET LOCAL statement_timeout='45s'"));assert.ok(t.installation.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'));assert.ok(t.installation.every(s=>!/^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));}
});

test('only inner row scans are reused; whole-transaction snapshots and all stage metadata remain freshly read',()=>{
 const b=build(options),inner=publishedAdoptionCachedRows(b.consumers.before);
 assert.ok(!b.before.includes('IF NOT FOUND THEN'));assert.ok(!b.after.includes('IF NOT FOUND THEN'));
 assert.ok(b.before.includes('FROM %I.%I r) hashed'));assert.ok(b.after.includes('FROM %I.%I r) hashed'));
 assert.ok(inner.includes("WHERE (value->>'oid')::oid=c.oid"));assert.ok(inner.includes('IF NOT FOUND THEN'));
 assert.ok(inner.includes('FROM %I.%I r) hashed'));assert.equal(inner.slice(inner.indexOf('  SELECT jsonb_build_object')),b.consumers.before.slice(b.consumers.before.indexOf('  SELECT jsonb_build_object')));
 assert.ok(b.audit.includes("old-'triggers' IS DISTINCT FROM new-'triggers'"));
});
test('durability compares complete aggregate proof and rejects broadened effects',()=>{
 const b=build(options),counts=Object.fromEntries(['employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','employment_adoption_seal'].map(k=>[k,{count:0,hash:'a'.repeat(64)}]));
 const p={version:b.version,sourceCommit:b.sourceCommit,sourceHashes:b.sourceHashes,allChecksPassed:true,newTables:4,newFunctions:57,adaptedFunctions:21,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0,priorFingerprint:'a'.repeat(64),objectsFingerprint:'b'.repeat(64),dataFingerprint:'c'.repeat(64),counts};
 assert.ok(durable({installed:p,durable:p,batch:b}).passed);
 for(const mutate of [x=>x.sourceCommit='a'.repeat(40),x=>x.sourceHashes={},x=>x.roleAssignmentsAdded=1,x=>x.businessOperations=1,x=>x.nominalRowsReturned=1,x=>x.extra=true,x=>x.counts.employment_adoption_seal.count=-1]){const changed=structuredClone(p);mutate(changed);assert.throws(()=>durable({installed:changed,durable:changed,batch:b}));}
 assert.throws(()=>durable({installed:p,durable:{...p,objectsFingerprint:'d'.repeat(64)},batch:b}));
});
