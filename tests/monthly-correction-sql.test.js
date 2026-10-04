import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonthlyCorrectionQa} from '../scripts/verify-monthly-approved-corrections-sql.mjs';
import {monthlyAnnulBatch,monthlyAnnulPlan} from '../assets/payroll-monthly-annul-model.js';
import {monthlyCorrectionPlan} from '../assets/payroll-monthly-correction-model.js';
import {approved,candidate,id,scope} from './fixtures/payroll-monthly-annul-synthetic.js';
test('correction SQL generator retains all 537 inherited controls in an unconditional rollback namespace',()=>{
 for(const serverMajor of [17,18]){
  const qa=buildMonthlyCorrectionQa({serverMajor,requireConcurrency:true});assert.equal(qa.report.checksPassed,680);assert.equal(qa.report.monthlyCorrectionChecksPassed,143);assert.equal(qa.report.monthlyAnnulChecksPassed,35);assert.equal(qa.report.monthlyCorrectionFunctions,18);assert.equal(qa.report.monthlyCorrectionFacades,5);
  assert.match(qa.sql,/ROLLBACK;\s*$/);assert.doesNotMatch(qa.sql,/INSERT\s+INTO\s+public\./i);assert.match(qa.sql,/SQL121_PREREQUISITE_METADATA/);assert.match(qa.sql,/SQL121_GUARD_METADATA/);assert.match(qa.sql,/SQL121_NEW_FUNCTION_METADATA/);
  for(const label of ['correction fingerprint matches every existing native and historical writer exactly','read preview neither proposes nor changes any original row','failure after the first corrected batch rolls back every update and review','old submission receipt preserves every field after correction','old approval receipt preserves every field after correction','first correction event keeps its own values after a later correction','existing SQL120 whole-set annulment accepts corrected approved batches'])assert.ok(qa.sql.includes(label),label);
  assert.match(qa.sql,/municontrol\.correction\.review/);assert.match(qa.sql,/monthly_correction_qa\.proposal_id/);assert.doesNotMatch(qa.sql,/proposal_id_value\(/);
 }
 for(const serverMajor of [undefined,16,19])assert.throws(()=>buildMonthlyCorrectionQa({serverMajor}));
});
test('corrected approved batches remain available for the existing annulment and a next independent correction',()=>{
 for(const native of [false,true]){
  const b=approved(2,2,native);Object.assign(b,{version:4,reasonCode:'corrected_after_review',reasonReference:'ref:'+id(7000)});monthlyAnnulBatch(b);
  const plan=monthlyAnnulPlan([candidate(b)],scope,'Revisar y anular la novedad corregida');assert.equal(plan.body.items[0].expectedVersion,4);
  const d={...candidate(b),version:'payroll-monthly-correction.v1',previewSha256:null,patch:null,items:[{snapshotSha256:'d'.repeat(64),batch:b,identityCurrent:true}]};
  const next=monthlyCorrectionPlan([d],scope,{observation:'Otra corrección de ensayo'},'Revisar toda la segunda corrección');assert.equal(next.body.items[0].expectedVersion,4);
 }
});
test('accepting a corrected approval does not accept missing audit reference, old version, annulled state or salary effects',()=>{
 const good={...approved(1,1),version:4,reasonCode:'corrected_after_review',reasonReference:'ref:'+id(7000)};
 for(const edit of [b=>b.version=3,b=>b.reasonReference=null,b=>b.reasonReference='ref:invented',b=>b.reasonReference='ref:00000000-0000-0000-0000-000000000000',b=>b.status='cancelled',b=>b.exportable=false,b=>b.reasonCode='annulled_after_review',b=>b.payrollCalculated=true,b=>b.blockingIssueCount=1]){const bad=structuredClone(good);edit(bad);assert.throws(()=>monthlyAnnulBatch(bad));}
});
