import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {employee} from './fixtures/grh-employee-source-synthetic.js';
import {DEFER_MISSING_ENTRY_POLICY, prepareOfficialRosterOperationalPlan} from '../scripts/lib/official-roster-operational-plan.mjs';
import {prepareOperationalPlanFile} from '../scripts/prepare-official-roster-operational-plan.mjs';

const options = rows => ({rows, sourceSha256: 'a'.repeat(64), companyCode: '101', deferredPolicy: DEFER_MISSING_ENTRY_POLICY});
function source(total = 2452, active = 869, pending = 14) {
  return Array.from({length: total}, (_, n) => {
    const r = employee(n + 1);
    r.employment.activeProxy = n < active;
    r.employment.hireDate = r.sourceFields.FING_12 = n < pending ? null : '2018-04-01';
    r.employment.exitDate = r.sourceFields.FEGR_12 = n < active ? null : '2023-01-01';
    r.sourceFields.CODI_02 = '1'; r.sourceFields.CODI_10 = '2';
    if (n < 2) { r.sourceFields.CODI_02 = null; r.sourceFields.CODI_10 = null; }
    if (n === 0) { r.sourceFields.iddepartamento = null; r.sourceReferences = {}; }
    return r;
  });
}
test('complete source preserves 2452 rows, selects 855 candidates and keeps 14 pending and 1583 historical', () => {
  const rows = source(), original = JSON.stringify(rows), p = prepareOfficialRosterOperationalPlan(options(rows));
  assert.deepEqual(p.counts, {source:2452,active:869,candidates:855,deferred:14,historical:1583,candidateFactsPending:0,deferredMissingClassification:2,deferredMissingDepartment:1});
  assert.equal(p.rows.length,2452); assert.equal(p.rows[2451].sourceRowNumber,2452);
  assert.equal(JSON.stringify(rows), original); assert.deepEqual(p.effects,{sourceModified:false,contractsAdopted:0,payrollCalculated:false,businessWrites:0});
  assert.ok(Object.isFrozen(p.rows[0].observations));
  assert.doesNotMatch(JSON.stringify(p), /PRIVATE_SYNTHETIC|LEGA_12|fullName|documentNumber|SUEL_12|100\.100/);
});
test('scope and fingerprint include every page and are independent of nominal fields and NOLI values', () => {
  const rows = source(57,57,1), p = prepareOfficialRosterOperationalPlan(options(rows));
  rows[56].identity.fullName = '=PRIVATE_SYNTHETIC'; rows[56].sourceFields.NOLI_12 = '0';
  assert.equal(prepareOfficialRosterOperationalPlan(options(rows)).selectionSha256,p.selectionSha256);
  rows[56].employment.hireDate = rows[56].sourceFields.FING_12 = null;
  const changed = prepareOfficialRosterOperationalPlan(options(rows));
  assert.equal(changed.counts.deferred,2); assert.notEqual(changed.selectionSha256,p.selectionSha256);
});
test('other pending facts remain visible among candidates instead of silently deferring more employees', () => {
  const rows = source(3,3,0); const p = prepareOfficialRosterOperationalPlan(options(rows));
  assert.equal(p.counts.candidates,3); assert.equal(p.counts.deferred,0); assert.equal(p.counts.candidateFactsPending,2);
  assert.deepEqual(p.rows[0].observations,['CLASSIFICATION_PENDING','DEPARTMENT_PENDING']);
});
test('incompatible inactive dates are preserved without entering the operational candidates', () => {
  const rows = source(3,2,0); rows[2].sourceFields.FING_12 = rows[2].employment.hireDate = '2025-01-01';
  assert.equal(prepareOfficialRosterOperationalPlan(options(rows)).counts.historical,1);
});
for (const [label, change] of [
  ['unknown active state', r => delete r.employment.activeProxy],
  ['invented entry date', r => r.employment.hireDate = '2020-01-01'],
  ['missing original date field', r => delete r.sourceFields.FING_12],
  ['invalid calendar date', r => r.sourceFields.FING_12 = r.employment.hireDate = '2026-02-31'],
  ['blank is not original NULL', r => r.sourceFields.FING_12 = r.employment.hireDate = ''],
  ['active with exit', r => r.sourceFields.FEGR_12 = r.employment.exitDate = '2026-09-01'],
  ['different company', r => r.sourceKey.companyCode = r.sourceProvenance.primaryKey.CODI_01 = '102']
]) test('refuses '+label+' before creating a partial plan', () => { const rows=source(2,2,0);change(rows[1]);assert.throws(()=>prepareOfficialRosterOperationalPlan(options(rows))); });
test('refuses duplicate original keys and a missing explicit preservation criterion', () => {
  const rows=source(2,2,0);rows[1]=structuredClone(rows[0]);assert.throws(()=>prepareOfficialRosterOperationalPlan(options(rows)));
  const v=options(source(2,2,0));delete v.deferredPolicy;assert.throws(()=>prepareOfficialRosterOperationalPlan(v));
});
test('does not execute nested state accessors', () => {
  const rows=source(1,1,0);let calls=0;Object.defineProperty(rows[0].employment,'activeProxy',{get(){calls++;return true;}});
  assert.throws(()=>prepareOfficialRosterOperationalPlan(options(rows)));assert.equal(calls,0);
});
test('file preparation binds exact bytes, uses a new private output and never rewrites the input', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mc-operative-'));fs.mkdirSync(path.join(root,'.handoff'));
  try {
    const input=path.join(root,'synthetic.json'),output=path.join(root,'.handoff','plan.json'),bytes=JSON.stringify(source(3,3,1));fs.writeFileSync(input,bytes);
    const opts={...options([]),root,input,output,sourceSha256:createHash('sha256').update(bytes).digest('hex')};delete opts.rows;
    assert.throws(()=>prepareOperationalPlanFile({...opts,sourceSha256:'b'.repeat(64)}),/SOURCE_BYTES_CHANGED/);assert.equal(fs.existsSync(output),false);
    assert.throws(()=>prepareOperationalPlanFile({...opts,output:path.join(root,'public.json')}),/PRIVATE_NEW_OUTPUT_REQUIRED/);
    assert.equal(prepareOperationalPlanFile(opts).counts.candidates,2);assert.equal(fs.readFileSync(input,'utf8'),bytes);
    assert.throws(()=>prepareOperationalPlanFile(opts),/PRIVATE_NEW_OUTPUT_REQUIRED/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
