// Source contracts only; this file never imports the SQL/browser verifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const file='scripts/verify-own-payroll-novelties-browser.mjs';

function assertCommittedApproval(source){
 for(const token of [
  'approvalRequest.postDataJSON()',
  "approvalRequest.headers()['idempotency-key']",
  "check(approvalResponse.status()===201",
  'ownNoveltyReceipt(approvalEnvelope.data,{key:requestKey,body:requestBody.payload})',
  'receipt.requestSha256,ownNoveltyHash(requestBody.payload)',
  'receipt.snapshot.rowsSha256,ownNoveltyHash(receipt.snapshot.rows.map(({values,subject})=>({values,subject})))',
  "receipt.snapshot.status,'approved'",
  'receipt.snapshot.revision,submitted.revision+1',
  'receipt.snapshot.rows.length,30',
  'receipt.snapshot.rows.map(row=>row.values),writes[0].body.rows',
  'receipt.snapshot.preparedBy.membershipId,receipt.snapshot.decidedBy.membershipId',
  'assert.deepEqual(committed,receipt.snapshot)',
  'assert.deepEqual(displayed,Array.from({length:30}',
  "['prepare','submit','approve']"
 ])assert.ok(source.includes(token),token);
 const pending=source.indexOf('const approvalResponsePending=reviewer.waitForResponse(');
 const send=source.indexOf("await r('send').click()",pending);
 const received=source.indexOf('await Promise.all([approvalResponsePending,successionResponsePending])',send);
 assert.ok(pending>0&&send>pending&&received>send,'capture the actual response before sending');
}

test('legacy browser proves actual approval request, hashes, independent actor, committed readback and every UI row',()=>{
 const source=read(file);assertCommittedApproval(source);
 const old=source.replace("check(approvalResponse.status()===201","check((await r('status').textContent()).includes('Aprobado confirmado')");
 assert.notEqual(old,source);
 assert.throws(()=>assertCommittedApproval(old),assert.AssertionError);
});

test('legacy130 unavailable succession is bounded to exactly one checker read of the same batch',()=>{
 const source=read(file);
 for(const token of [
  "query==='SELECT public.own_novelty_succession_context_v1($1::jsonb,$2::uuid) AS result'",
  'context.membershipId,qa.actors.checker.membershipId',
  'context.actorEmail,qa.actors.checker.actorEmail',
  'values[1],expectedLegacyBatchId',
  "expectedSuccessionUnavailable.length,0,'Exactly one expected legacy130 succession read'",
  "e.code!=='QA_LEGACY130_SUCCESSION_UNAVAILABLE')errors.push(e.message)",
  "successionResponse.status()===503&&unavailableEnvelope.ok===false&&unavailableEnvelope.code==='OWN_NOVELTY_UNAVAILABLE'",
  "assert.deepEqual(expectedSuccessionUnavailable,[{resource:'succession',actor:'checker',batchId,reason:'QA_LEGACY130_SUCCESSION_UNAVAILABLE'}])",
  "check(errors.length===0,'zero unexpected browser/SQL errors')"
 ])assert.ok(source.includes(token),token);
 const guard=source.indexOf('assert.match(query,');
 assert.ok(source.lastIndexOf('try{',guard)>source.indexOf('getSql:async()=>'),'unexpected query failures are inside the recorded error boundary');
 assert.ok(!source.includes('(bootstrap|detail|attempt|command|succession_context)'),'the general SQL matcher is not broadened');
});

test('legacy fixture declares submitted export and does not claim current197 effectiveness or a complete circuit',()=>{
 const source=read(file),exportAt=source.indexOf("page.waitForEvent('download')"),approvalAt=source.indexOf('const approvalResponsePending=');
 assert.ok(exportAt>0&&exportAt<approvalAt);
 for(const token of [
  "exportStage:'submitted'",
  'approvedBatchCsvVerified:false',
  'approvedBatchReopenVerified:false',
  'novelty197Installed:false',
  'currentEffectivenessVerified:false',
  'correctionWorkflowExecuted:false',
  'fullMunicipalCircuitVerified:false',
  "await reviewer.evaluate(()=>window.dispatchEvent(new Event('pagehide')))",
  'coverage,approvalEvidence,expectedSuccessionUnavailable'
 ])assert.ok(source.includes(token),token);
 assert.ok(!source.includes("scripts/migrations/197-"),'this repair does not paste197 over130');
});

test('calculation CI preserves the early novelty result and exact screenshots without exposing seed SQL',()=>{
 const workflow=read('.github/workflows/own-payroll-calculation.yml');
 const artifacts=workflow.slice(workflow.indexOf('          path: |'));
 for(const name of ['own-novelties-browser.json','own-novelties-browser-1440.png','own-novelties-browser-390.png','own-novelties-browser-320.png']){
  assert.equal(artifacts.split(/\r?\n/).filter(line=>line.trim()==='verification/'+name).length,1,name);
 }
 assert.ok(artifacts.includes('verification/own-run-ui.json'));
 assert.ok(artifacts.includes('if-no-files-found: error'));
 assert.ok(!artifacts.includes('seed.sql')&&!artifacts.includes('verification/**'));
 assert.ok(workflow.includes('if: always()'));
});
