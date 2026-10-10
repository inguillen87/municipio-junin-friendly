import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildSalaryAuxiliaryNamespaceInstallation} from '../scripts/lib/salary-auxiliary-namespace-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const build=()=>buildSalaryAuxiliaryNamespaceInstallation({read,sourceCommit:'c'.repeat(40)});

test('namespace installation pins seven current bodies and two inaccessible private helpers',()=>{
 const b=build();assert.equal(b.originals.length,7);assert.equal(b.changed.length,7);assert.equal(b.helpers.length,2);assert.equal(b.afterPins.length,9);
 assert.deepEqual(b.beforePins.map(p=>p.name),['native_salary_items_v1','own_program_definition_v1','own_program_command_v1','own_run_complete_v1','own_receipt_snapshot_v1','own_close_snapshot_v1','municipal_adoption_ready_v1']);
 assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.ok(b.mutations.every(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(s)||/^REVOKE ALL ON FUNCTION public\.own_program_(node|unit)_v2\(.+\) FROM PUBLIC,municontrol_actions_runtime_app$/.test(s)));
 assert.equal(b.afterPins.filter(p=>/own_program_(node|unit)_v2/.test(p.name)).every(p=>p.runtime===false),true);
 assert.match(b.before,/to_jsonb\(p\)-'prosrc'/);assert.match(b.before,/defaultAcl/);assert.match(b.before,/roles/);assert.match(b.conservation,/IS DISTINCT FROM/);
 assert.ok(b.mutations.every(s=>!/^(?:CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE|DELETE|TRUNCATE)\b/.test(s)));
});
test('legacy node functions remain prerequisites and legacy snapshot versions remain explicit',()=>{
 const b=build();assert.ok(b.prerequisitePins.some(p=>p.name==='own_program_node_v1'));assert.ok(b.prerequisitePins.some(p=>p.name==='own_program_unit_v1'));
 assert.ok(!b.changed.some(s=>/^CREATE OR REPLACE FUNCTION public\.own_program_(?:node|unit)_v1\(/.test(s)));
 const definition=b.changed.find(s=>s.includes('FUNCTION public.own_program_definition_v1('));
 assert.match(definition,/CASE WHEN ns THEN public\.own_program_node_v2/);assert.match(definition,/ELSE public\.own_program_node_v1/);
 const complete=b.changed.find(s=>s.includes('FUNCTION public.own_run_complete_v1('));assert.match(complete,/own-payroll-input.v2/);assert.match(complete,/own-payroll-input.v1/);
 const receipt=b.changed.find(s=>s.includes('FUNCTION public.own_receipt_snapshot_v1('));assert.match(receipt,/own-receipt-snapshot.v3/);assert.match(receipt,/own-receipt-snapshot.v1/);
});
test('readiness changes only its exact receipt pin and request history still guards recovery and downgrade',()=>{
 const b=build(),before=b.originals.at(-1),after=b.changed.at(-1),oldPin=b.beforePins.find(p=>p.name==='own_receipt_snapshot_v1'),nextPin=b.afterPins.find(p=>p.name==='own_receipt_snapshot_v1');
 assert.equal(after.replace(/^CREATE OR REPLACE FUNCTION /,'CREATE FUNCTION ').replaceAll(nextPin.sha256,oldPin.sha256),before);
 const s=b.changed.find(s=>s.includes('FUNCTION public.own_program_command_v1('));assert.match(s,/OWN_PROGRAM_HISTORY_REQUIRED/);assert.match(s,/OWN_PROGRAM_PRECISION_REQUIRED/);assert.match(s,/prior\.request_sha256<>fingerprint/);
 const original=b.originals.find(s=>s.includes('FUNCTION public.own_program_command_v1('));
 assert.ok(s.includes('_attempt_v1(p,key)')&&s.includes('parameterActorVerified'));
 assert.equal(s.indexOf('_attempt_v1(p,key)')<s.indexOf('parameterActorVerified'),original.indexOf('_attempt_v1(p,key)')<original.indexOf('parameterActorVerified'));
});
test('installation enforces repeatable read, exact repeat validation and fail-closed source drift',()=>{
 const b=build();assert.match(b.statements[0],/transaction_isolation/);assert.match(b.statements[0],/own_program_node_v2.*IS NULL AND.*own_program_unit_v2.*IS NULL/);
 assert.match(b.statements[1],/ELSE EXECUTE/);assert.match(b.afterCheck,/AUXILIARY_NAMESPACE_FUNCTION_CHANGED/);assert.match(b.proof,/'newTables',0/);assert.match(b.proof,/'businessWrites',0/);
 assert.throws(()=>buildSalaryAuxiliaryNamespaceInstallation({read:f=>read(f)+'\n-- drift',sourceCommit:'c'.repeat(40)}));
 assert.throws(()=>buildSalaryAuxiliaryNamespaceInstallation({read,sourceCommit:'not-a-commit'}));
});
