import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {schoolingData,schoolingFilter,schoolingRevision,schoolingEffectiveDates,certificateState} from '../assets/family-schooling-model.js';
import {schoolingXlsx} from '../assets/family-schooling-export.js';
import {schoolingFixtureV4,syntheticUuid} from './fixtures/family-schooling-synthetic.js';
const read=p=>schoolingData(p,{version:4});
function refresh(r){const dates=r.certificate??r.sourceSchooling;r.effectiveDates={origin:r.certificate?'manual':r.sourceSchooling?'grh_source':'none',presentedOn:dates?.presentedOn??null,expiresOn:dates?.expiresOn??null};}
test('historical source is separate from manual certificate and does not fabricate a document or history',()=>{
 const p=schoolingFixtureV4(3),d=read(p),r=d.rows[0];assert.equal(r.certificate,null);assert.equal(r.historyCount,0);assert.equal(r.sourceSchooling.documentAvailable,false);assert.deepEqual(r.effectiveDates,{origin:'grh_source',presentedOn:'2026-03-11',expiresOn:'2027-03-31'});assert.ok(Object.isFrozen(r.sourceSchooling));assert.ok(Object.isFrozen(r.effectiveDates));assert.equal(p.data.rows[0].certificate,null);
});
test('manual presentation owns both dates, including missing expiry, while source remains consultable',()=>{
 const r=read(schoolingFixtureV4(2)).rows[1];assert.equal(r.sourceSchooling.expiresOn,'2025-12-31');assert.deepEqual(r.effectiveDates,{origin:'manual',presentedOn:'2026-04-04',expiresOn:null});assert.equal(schoolingEffectiveDates(r).expiresOn,null);assert.equal(certificateState(r),'Sin vencimiento informado');
});
test('invalid or missing source dates never become zero, expiry or eligibility',()=>{
 for(const state of ['null','absent','invalid']){const p=schoolingFixtureV4(1),r=p.data.rows[0];r.sourceSchooling.presentationState=state;r.sourceSchooling.expiryState=state;r.sourceSchooling.presentedOn=null;r.sourceSchooling.expiresOn=null;refresh(r);const d=read(p);assert.equal(schoolingFilter(d,{status:'expired'}).rows.length,0);assert.equal(d.scope.payrollEligibilityCertified,false);assert.equal(d.rows[0].effectiveDates.presentedOn,null);}
});
test('source expiry participates in date filter with explicit historical state and never manual count',()=>{
 const p=schoolingFixtureV4(2),r=p.data.rows[0];r.sourceSchooling.expiresOn='2025-12-31';refresh(r);const d=read(p),view=schoolingFilter(d,{status:'expired',asOf:'2026-09-21'});assert.equal(view.rows.length,1);assert.match(certificateState(view.rows[0],'2026-09-21'),/histórica GRH superada/);assert.equal(view.counts.registered,0);assert.equal(schoolingFilter(d,{status:'registered'}).rows.length,1);
});
test('own family can carry a manual certificate but cannot carry GRH source dates',()=>{
 const p=schoolingFixtureV4(1),r=p.data.rows[0];Object.assign(r,{familyRef:{kind:'own',id:syntheticUuid(800)},declarationState:'declared',familyRecordedAt:'2026-09-21T13:00:00Z',validFrom:null});assert.throws(()=>read(p));r.sourceSchooling=null;refresh(r);assert.equal(read(p).rows[0].effectiveDates.origin,'none');
});
for(const [name,change]of [
 ['missing extension',r=>delete r.sourceSchooling],['unknown field',r=>r.sourceSchooling.approved=true],['wrong origin',r=>r.sourceSchooling.sourceSystem='OWN'],['wrong table',r=>r.sourceSchooling.sourceTable='personas'],['wrong family',r=>r.sourceSchooling.sourceKey='2'],['leading zero',r=>{r.familyRef.id='01';r.sourceSchooling.sourceKey='01';}],
 ['invalid hash',r=>r.sourceSchooling.sourceSha256='x'.repeat(64)],['wrong batch',r=>r.sourceSchooling.sourceBatchId='bad'],['wrong run',r=>r.sourceSchooling.sourceImportRunId=0],['false document',r=>r.sourceSchooling.documentAvailable=true],['false review',r=>r.sourceSchooling.reviewState='approved'],
 ['invalid date',r=>r.sourceSchooling.presentedOn='2026-02-30'],['state mismatch',r=>r.sourceSchooling.presentationState='invalid'],['missing state date',r=>r.sourceSchooling.presentedOn=null],['unknown state',r=>r.sourceSchooling.expiryState='unknown'],['cutoff mismatch',r=>r.sourceSchooling.sourceCutoff='2026-08-07T18:15:21Z'],['invalid load',r=>r.sourceSchooling.loadedAt='yesterday'],['invented timezone',r=>r.sourceSchooling.sourceDeclaredCutoff+='Z'],
 ['false effective manual',r=>r.effectiveDates.origin='manual'],['effective date mismatch',r=>r.effectiveDates.expiresOn='2050-12-31'],['extra effective field',r=>r.effectiveDates.approved=true],
])test('v4 rejects source/effective drift: '+name,()=>{const p=schoolingFixtureV4(1);change(p.data.rows[0]);assert.throws(()=>read(p));});
test('same instant cutoff allows equivalent offset but declared source time is preserved verbatim',()=>{const p=schoolingFixtureV4(1);p.data.rows[0].sourceSchooling.sourceCutoff='2026-08-06T15:15:21-03:00';const r=read(p).rows[0];assert.equal(r.sourceSchooling.sourceDeclaredCutoff,'2026-08-06T15:15:21');});
test('manual blank expiry cannot be replaced with historical source expiry in response',()=>{const p=schoolingFixtureV4(2);p.data.rows[1].effectiveDates.expiresOn=p.data.rows[1].sourceSchooling.expiresOn;assert.throws(()=>read(p));});
test('export uses effective dates, keeps manual blank expiry and includes historical origin and both cutoffs',()=>{
 const d=read(schoolingFixtureV4(2)),view=schoolingFilter(d),files=unzipSync(schoolingXlsx(d,view,'2026-09-21T12:00:00Z')),sheet=strFromU8(files['xl/worksheets/sheet1.xml']),control=strFromU8(files['xl/worksheets/sheet2.xml']);
 assert.match(sheet,/<autoFilter ref="A1:AH3"/);assert.match(sheet,/Origen de las fechas mostradas/);assert.match(sheet,/2026-03-11/);assert.match(sheet,/2026-08-06T15:15:21/);assert.match(sheet,/Histórica; por revisar; sin documento adjunto/);assert.match(sheet,/<c r="H3"[^]*?<t xml:space="preserve">Sin vencimiento informado<\/t>/);assert.match(control,/prevalece para ambas fechas/);assert.doesNotMatch(sheet,/<f>|identityToken|sourceSha256|70000000-/);
});
test('source provenance and effective dates are part of fresh export revision',()=>{const p=schoolingFixtureV4(1),before=schoolingRevision(read(p));p.data.rows[0].sourceSchooling.sourceSha256='b'.repeat(64);assert.notEqual(schoolingRevision(read(p)),before);});
