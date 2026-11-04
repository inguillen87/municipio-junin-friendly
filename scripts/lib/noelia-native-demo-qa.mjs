import assert from 'node:assert/strict';
import {employeeReceipt} from '../../assets/native-employee-confirmation-model.js';

// Existing canonical QA only. This separates one original synthetic seed block;
// it does not execute SQL, create a person or select any municipal source.
export function deferNoeliaNativeDemoSeed(sql){
 assert.equal(typeof sql,'string');
 const startMarker='    hire:=native_employee_create_v1(maker,';
 const endMarker="    PERFORM qa_assert((SELECT count(*)=2 FROM payroll_novelty_batch WHERE status='approved') AND (SELECT count(*)=0 FROM own_payroll_run_capture),'fixture seeds approved sources but never precomputes a capture/result');";
 assert.equal(sql.split(startMarker).length,2,'QA_NATIVE_DEMO_CREATE_ANCHOR_CHANGED');
 assert.equal(sql.split(endMarker).length,2,'QA_NATIVE_DEMO_END_ANCHOR_CHANGED');
 const offset=sql.indexOf(startMarker),end=sql.indexOf(endMarker,offset)+endMarker.length,lineEnd=sql.indexOf('\n',offset);
 assert.ok(end>offset&&lineEnd>offset&&lineEnd<end,'QA_NATIVE_DEMO_BLOCK_ORDER_CHANGED');
 const originalBlock=sql.slice(offset,end),createStatement=sql.slice(offset,lineEnd);
 const match=/^    hire:=native_employee_create_v1\(maker,('(?:[^']|'')*')::jsonb,native_employee_catalog_v1\(native_employee_context_v1\(maker\)\)->>'version',gen_random_uuid\(\)\);$/.exec(createStatement);
 assert.ok(match,'QA_NATIVE_DEMO_CREATE_CHANGED');
 const draft=JSON.parse(match[1].slice(1,-1).replaceAll("''","'"));
 assert.deepEqual(Object.keys(draft).sort(),['agreementCode','birthDate','categoryCode','cuil','dni','fullName','jobTitle','jurisdictionCode','legajo','legalReference','organizationId','sectorCode','sexCode','startDate'].sort(),'QA_NATIVE_DEMO_DRAFT_CHANGED');
 assert.equal(draft.legajo,'19041');assert.equal(draft.jurisdictionCode,'42');
 const afterCreate=sql.slice(lineEnd+1,end);
 assert.ok(afterCreate.includes("FOR cents IN SELECT unnest(ARRAY['2000','25']) LOOP"),'QA_NATIVE_DEMO_TWO_ORIGINAL_SOURCES_CHANGED');
 assert.ok(afterCreate.includes("NOT EXISTS(SELECT 1 FROM grh_employees WHERE legajo='19041')"),'QA_NATIVE_DEMO_NO_GRH_GUARD_CHANGED');
 assert.equal((afterCreate.match(/payroll_novelty_prepare_v2\(/g)||[]).length,1);
 assert.equal((afterCreate.match(/payroll_novelty_transition_v2\(/g)||[]).length,2);
 return Object.freeze({sql:sql.slice(0,offset)+sql.slice(end),draft:Object.freeze(draft),afterCreate,offset,originalBlock,createStatement});
}

// Cross-ledger continuity, independent from matching monetary totals.
// The normal API/models already validate each complete saved protocol object.
export function assertNoeliaNativeDemoCycle({created,original,confirmed,annulled,recalculated,reconfirmed,closed,printable}){
 employeeReceipt(created.receipt,created.body.draft);
 const contractId=created.receipt.contractId,registrationId=created.receipt.registrationId;
 assert.equal(created.receipt.legajo,'19041');
 assert.equal(created.receipt.origin,'MUNICONTROL');
 assert.equal(created.receipt.accountCreated,false);assert.equal(created.receipt.payrollCalculated,false);
 assert.ok(original.saved.input.employees.some(e=>e.contractId===contractId&&e.employeeNumber==='19041'),'QA_NATIVE_DEMO_ORIGINAL_CONTRACT_CHANGED');
 assert.equal(confirmed.runId,original.id);
 assert.ok(confirmed.affected.some(e=>e.contractId===contractId&&e.state==='confirmed'),'QA_NATIVE_DEMO_ORIGINAL_CONFIRMATION_CHANGED');
 assert.equal(annulled.runId,original.id);assert.equal(annulled.resultSha256,original.saved.resultSha256);
 assert.equal(annulled.affected.length,1);
 assert.equal(annulled.affected[0].contractId,contractId);assert.equal(annulled.affected[0].state,'annulled');
 assert.deepEqual(recalculated.body.selection,{kind:'contracts',values:[contractId]});
 assert.notEqual(recalculated.id,original.id);
 assert.equal(recalculated.saved.result.employeeCount,1);assert.equal(recalculated.saved.result.employeeTotals.length,1);
 assert.equal(recalculated.saved.result.employeeTotals[0].contractId,contractId);
 assert.equal(recalculated.saved.result.rows.length,6);
 assert.ok(recalculated.saved.result.rows.every(r=>r.contractId===contractId&&r.employeeNumber==='19041'),'QA_NATIVE_DEMO_RECALCULATED_CONTRACT_CHANGED');
 assert.equal(reconfirmed.runId,recalculated.id);assert.equal(reconfirmed.affected.length,1);
 assert.equal(reconfirmed.affected[0].contractId,contractId);assert.equal(reconfirmed.affected[0].state,'confirmed');
 assert.equal(closed.snapshot.employees.length,29);
 const employee=closed.snapshot.employees.find(e=>e.contractId===contractId);
 assert.ok(employee,'QA_NATIVE_DEMO_CLOSE_MISSING');
 assert.equal(employee.employeeNumber,'19041');assert.equal(employee.runId,recalculated.id);
 assert.equal(employee.inputSha256,recalculated.saved.inputSha256);assert.equal(employee.resultSha256,recalculated.saved.resultSha256);
 assert.equal(employee.liquidationVersion,reconfirmed.affected[0].liquidationVersion);assert.equal(employee.conceptCount,6);
 assert.equal(printable.state,'approved');assert.equal(printable.snapshot.recordCount,29);
 const records=printable.snapshot.records.filter(r=>r.contractId===contractId);assert.equal(records.length,1);
 const receipt=records[0];assert.equal(receipt.employeeNumber,'19041');assert.equal(receipt.registrationId,registrationId);
 assert.equal(receipt.runId,recalculated.id);assert.equal(receipt.sourceGroupId,closed.groupId);
 assert.equal(receipt.liquidationVersion,employee.liquidationVersion);assert.equal(receipt.concepts.length,6);
 for(const key of ['remuneration','non_remuneration','deduction','employer_contribution','gross','net'])assert.equal(receipt.totals[key],employee.totals[key]);
 return {passed:true,synthetic:true,componentUi:true,fullPersonalPage:false,allStepsSameContract:true,contractId,registrationId,creationKey:created.key,originalRunId:original.id,recalculatedRunId:recalculated.id,closeGroupId:closed.groupId,inputSha256:recalculated.saved.inputSha256,resultSha256:recalculated.saved.resultSha256,liquidationVersion:employee.liquidationVersion,population:29,concepts:6,signatureOrPayment:false};
}
