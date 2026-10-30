// Fictional approved envelopes only. No municipal data, SQL, handlers or factories.
import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedSyntheticSources} from './fixtures/own-monthly-days-approved-synthetic.js';
import {programWorkspaceChanges,requireProgramWorkspaceForcedPreserved} from '../assets/own-payroll-program-workspace-model.js';
for(const variant of ['sql192','sql193'])test(variant+' workspace retains day fields and forced policy/lineage in the same review',()=>{
 const before=approvedSyntheticSources(variant,{forcedFixed:true}).programState.program.definition;
 const after=structuredClone(before);
 if(variant==='sql192')after.monthlyDaysPolicy.reference+='; revisión ficticia QA';
 const snapshot=JSON.stringify(before),diff=programWorkspaceChanges(before,after);
 assert.equal(diff.fixedForcedAmountsVersion.before,'own-fixed-forced-amount.v1');
 assert.equal(diff.fixedForcedAmountsVersion.after,'own-fixed-forced-amount.v1');
 assert.ok(diff.rows.some(r=>r.kind==='fixedForcedPolicy'));
 assert.ok(diff.rows.some(r=>r.kind==='fixedForcedLineage'));
 if(variant==='sql192')assert.notEqual(diff.monthlyDaysPolicy.before.reference,diff.monthlyDaysPolicy.after.reference);
 else assert.equal(diff.monthlyDayDeclarationVersion.after,'own-monthly-approved-days.v1');
 requireProgramWorkspaceForcedPreserved(before,after);
 const altered=structuredClone(after);altered.fixedForcedAmountsPolicy.quantityLineage.sourceSha256='f'.repeat(64);
 assert.throws(()=>requireProgramWorkspaceForcedPreserved(before,altered));
 assert.equal(JSON.stringify(before),snapshot);
});
