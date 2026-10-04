import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMonthlyCorrectionGuardPins,MONTHLY_CORRECTION_CHANGED_CONSTRAINTS} from '../scripts/lib/monthly-correction-guards.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('nine exact adaptations preserve every previous function setting and authority branch',()=>{
 const review=buildMonthlyCorrectionGuardPins(read);assert.equal(review.beforePins.length,9);assert.equal(review.afterPins.length,9);assert.equal(MONTHLY_CORRECTION_CHANGED_CONSTRAINTS.length,4);
 for(let i=0;i<9;i++)assert.deepEqual({...review.beforePins[i],sha256:null},{...review.afterPins[i],sha256:null});
 assert.match(review.afterDefinitions[0],/payroll_monthly_annul_batch_guard_v1/);assert.match(review.afterDefinitions[1],/payroll_monthly_annul_event_authority_v1/);
 assert.match(review.afterDefinitions[5],/event\.resulting_version,p_include_nominal/);assert.match(review.afterDefinitions[6],/max\(occurred_at\)/);
 assert.match(review.afterDefinitions[2],/payroll_novelty_native_subject_v2/);
 for(const i of [7,8]){assert.equal(review.beforePins[i].runtime,true);assert.match(review.afterDefinitions[i],/stored_rows:=original_source->'rows'/);assert.match(review.afterDefinitions[i],/stored_rows IS DISTINCT FROM canonical_rows/);assert.match(review.afterDefinitions[i],/existing_event.actor_session_id/);}
});
test('changed inherited source or ambiguous adaptation is rejected before building executable SQL',()=>{
 for(const edit of [text=>text.replace('PAYROLL_NOVELTY_TRANSITION_INVALID','CHANGED_TRANSITION_GUARD'),text=>text.replace('BEGIN\n  IF NEW.grh_mutation','BEGIN\n  IF NEW.grh_mutation\n  IF NEW.grh_mutation'),text=>text.replace('AND issue.is_blocking IS TRUE','AND issue.is_blocking = true')]){
  assert.throws(()=>buildMonthlyCorrectionGuardPins(file=>file.endsWith('026-governed-payroll-novelties.sql')?edit(read(file)):read(file)));
 }
});
