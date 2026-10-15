import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {DOCUMENTARY_BASELINE_PINS,DOCUMENTARY_OBSERVED_PINS,documentaryFunction,documentaryBaselineDefinitions,documentaryBaselineStatements,documentaryEffectiveBatchStatement,documentaryQaFoundation,assertDocumentaryQaProcess,relocateDocumentary178,documentaryQaOptions,verifyDocumentaryQaProcess} from '../scripts/lib/adopted-documentary-read-qa.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('documentary QA pins the real prior reader variants, including closure-state052 and independent-session105',()=>{
 const pins=documentaryBaselineDefinitions(read).map(ownInstallationFunctionPin);assert.equal(pins.length,3);for(const pin of pins)assert.equal(pin.sha256,DOCUMENTARY_BASELINE_PINS[pin.name]);assert.ok(documentaryBaselineStatements(read).every(s=>typeof s==='string'&&s.length));
});
test('documentary QA refuses changed baseline source before opening any database',()=>{
 const changed=p=>read(p).replace("outcome_value text:='not_found'","outcome_value text:='unreviewed'");assert.throws(()=>documentaryBaselineDefinitions(changed),/DOCUMENTARY_BASELINE_SOURCE_CHANGED/);
});
test('documentary QA refuses a missing or duplicate canonical function',()=>{
 assert.throws(()=>documentaryFunction('SELECT 1;','employee_payroll_detail_v1'),/DOCUMENTARY_CANONICAL_FUNCTION_MISSING/);
 const definition=documentaryBaselineDefinitions(read)[0];assert.throws(()=>documentaryFunction(definition+';\n'+definition,'employee_payroll_detail_v1'),/DOCUMENTARY_CANONICAL_FUNCTION_MISSING/);
});
test('effective publication fixture uses the actual097 certified-binding/completed-import view',()=>{
 const view=documentaryEffectiveBatchStatement(read);for(const marker of ['imported.status=\'completed\'','selected.import_run_id=imported.id','batch.validation_state=\'published\'','binding.verified IS TRUE'])assert.ok(view.includes(marker));
 assert.throws(()=>documentaryEffectiveBatchStatement(()=>''),/DOCUMENTARY_EFFECTIVE_VIEW_MISSING/);
});
test('only the two declared QA major versions can produce a foundation',()=>{
 for(const value of [16,19,0,'17',undefined])assert.throws(()=>documentaryQaFoundation(value));
});
test('process identity is rejected before reading a pid file if a listener is another process or host',()=>{
 const value={process:{ProcessId:5988},listener:{OwningProcess:5990,LocalAddress:'127.0.0.1',LocalPort:55417}};assert.throws(()=>assertDocumentaryQaProcess(root,17,value));
 value.listener.OwningProcess=5988;value.listener.LocalAddress='0.0.0.0';assert.throws(()=>assertDocumentaryQaProcess(root,17,value));
 value.process.ProcessId=34448;assert.throws(()=>assertDocumentaryQaProcess(root,17,value),/DOCUMENTARY_QA_PROCESS_CHANGED/);
});
test('178 QA relocation retains every canonical guard and exactly rehashes isolated qualified bodies',()=>{
 const qa=documentaryQaFoundation(17),relocated=relocateDocumentary178(read,qa);assert.equal(relocated.canonicalPins.length,3);assert.match(relocated.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(relocated.statement.includes('PAYROLL_DOCUMENT_HELPER_DRIFT'));assert.ok(relocated.statement.includes('PAYROLL_DOCUMENT_PARTIAL_INSTALLATION'));assert.ok(relocated.statement.includes('PAYROLL_DOCUMENT_IDENTITY_CHANGED'));assert.ok(relocated.statement.includes(qa.schema+'.payroll_document_subject_v1'));assert.ok(relocated.statement.includes('REVOKE ALL ON FUNCTION '+qa.schema+'.payroll_document_subject_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app'));
 for(const hash of Object.values(relocated.hashSubstitutions))assert.match(hash,/^[a-f0-9]{64}$/);
});
test('178 relocation fails if a declared anchor or after-body hash is changed',()=>{
 const qa=documentaryQaFoundation(18),bad=p=>p.endsWith('178-adopted-documentary-read.sql')?read(p).replace('3d8e45fac9b6b26fbc7a7f25c453e93f1c13b5eeb7320595a44cd1d6257b903d','f'.repeat(64)):read(p);assert.throws(()=>relocateDocumentary178(bad,qa));
});
test('both observed baselines derive exact pinned bodies without importing any private artifact',()=>{
 const publicRead=p=>{assert.ok(p.startsWith('scripts/migrations/'));return read(p);};
 for(const major of [17,18])for(const definition of documentaryBaselineDefinitions(publicRead,{major,baseline:'observed'})){const pin=ownInstallationFunctionPin(definition);assert.equal(pin.sha256,DOCUMENTARY_OBSERVED_PINS[major][pin.name]);}
});
test('observedPG18 keeps its original shared guard and does not install105',()=>{
 const statements=documentaryBaselineStatements(read,{major:18,baseline:'observed'});assert.ok(statements.length>10);assert.ok(!statements.some(s=>s.includes('CREATE OR REPLACE FUNCTION public.employee_payroll_assert_read_session_v1(')||s.includes('PAYROLL_READ_HELPER_BUILD_DRIFT')));
 const definitions=documentaryBaselineDefinitions(read,{major:18,baseline:'observed'});for(const definition of definitions.slice(0,2)){assert.ok(definition.includes('ctx:=action_center_assert_tenant_read_session_v2('));assert.ok(!definition.includes('employee_payroll_assert_read_session_v1('));}
});
test('explicit QA options allow only fixed local/CI transports and declared baselines',()=>{
 const args=['--major=18','--output=verification/qa-synthetic','--source-commit='+'a'.repeat(40)];assert.deepEqual(documentaryQaOptions([...args,'--transport=ci','--baseline=observed']),{major:18,output:'verification/qa-synthetic',sourceCommit:'a'.repeat(40),transport:'ci',baseline:'observed'});
 for(const bad of ['--host=example.com','--database=other','--url=postgresql://example.com','--transport=remote','--baseline=unknown','--major=17'])assert.throws(()=>documentaryQaOptions([...args,bad]));
});
test('CI destination validation refuses an unrecognized workspace/context before opening a SQL connection',async()=>{
 await assert.rejects(()=>verifyDocumentaryQaProcess(path.join(root,'nonexistent-documentary-qa-workspace'),17,{transport:'ci'}),/QA_CI_CONTEXT_REQUIRED|QA_CI_WORKSPACE_CHANGED|ENOENT/);
});
