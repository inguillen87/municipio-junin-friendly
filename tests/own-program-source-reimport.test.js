import test from 'node:test';
import assert from 'node:assert/strict';
import {emissionSources,emissionPreparerEvidence} from './fixtures/own-payroll-row-emission-synthetic.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';
import {reviewPreparedProgramDraft,applyPreparedProgramDraft} from '../assets/own-payroll-program-prepared-draft.js';
import {prepareProgramWorkspace,programWorkspaceChanges} from '../assets/own-payroll-program-workspace-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';

function fixture(){
 const sources=emissionSources({optIn:false}),evidence=emissionPreparerEvidence(sources),first=prepareOwnPayrollProgrammeSource(evidence);
 assert.equal(first.status,'proposal_draft');
 evidence.programme=structuredClone(sources.programState);evidence.programme.program.definition=structuredClone(first.draft.programme);evidence.programme.permissions.canPropose=true;
 return evidence;
}
test('reimporting the full unchanged source preserves one copy of every approved quantity',()=>{
 const evidence=fixture(),before=salarySerialized(evidence.programme.program.definition),result=prepareOwnPayrollProgrammeSource(evidence);
 assert.equal(result.status,'proposal_draft');assert.deepEqual(result.incidents,[]);assert.equal(salarySerialized(result.draft.programme),before);assert.equal(result.draft.programme.quantityPhases.length,evidence.programme.program.definition.quantityPhases.length);assert.equal(salarySerialized(evidence.programme.program.definition),before);
});
test('policy-only update traverses real file review, application and proposal without duplicating quantities',async()=>{
 const evidence=fixture(),before=structuredClone(evidence.programme.program.definition);
 evidence.programmeOptions.officialTotalsPolicies.push({...structuredClone(evidence.programmeOptions.officialTotalsPolicies[0]),period:'2026-11',sourceReference:'Nuevo respaldo ficticio de totales para noviembre'});
 const result=prepareOwnPayrollProgrammeSource(evidence);assert.equal(result.status,'proposal_draft');assert.deepEqual(result.incidents,[]);
 const review=await reviewPreparedProgramDraft(evidence.salary,evidence.programme,before,JSON.stringify(result)),draft=await applyPreparedProgramDraft(evidence.salary,evidence.programme,before,review),command=prepareProgramWorkspace(evidence.programme,draft,'Preparación exclusivamente sintética de política nueva');
 assert.equal(programWorkspaceChanges(before,draft).changed,1);assert.equal(command.program.officialTotalsPolicies.length,2);assert.deepEqual(command.program.quantityPhases,before.quantityPhases);assert.deepEqual(command.program.rules,before.rules);assert.deepEqual(command.program.bindings,before.bindings);assert.equal(command.reviewConfirmed,false);
});
for(const [label,change]of [['quantity expression',q=>q.expression={op:'literal',unit:q.unit,value:'2'}],['source evidence',q=>q.sourceReference='Otra referencia sintética para la misma cantidad histórica']])test('conflicting '+label+' is rejected without replacing approved history',()=>{
 const evidence=fixture(),before=salarySerialized(evidence.programme.program.definition),row=evidence.definitions.find(d=>d.quantity);change(row.quantity);
 const result=prepareOwnPayrollProgrammeSource(evidence);assert.equal(result.status,'not_presentable');assert.ok(result.incidents.some(i=>i.code==='PROGRAMME_EXISTING_QUANTITY_CONFLICT'));assert.equal(result.draft.programme,null);assert.equal(salarySerialized(evidence.programme.program.definition),before);
});
