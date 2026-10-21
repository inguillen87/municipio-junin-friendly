import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {monthlyNativeFullCycleFixture} from './fixtures/own-monthly-native-full-cycle-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {assertMonthlyNativeFullCycleCapture} from '../scripts/lib/monthly-native-full-circuit-connection-qa.mjs';

test('captured programme must equal the prepared193+fixed196 programme even when every amount and identity matches',()=>{
 const fixture=monthlyNativeFullCycleFixture(),id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),created={contractId:id(1),registrationId:id(2)};
 const prepared={contractId:created.contractId,programmeSha256:createHash('sha256').update(salarySerialized(fixture.definition)).digest('hex'),declarationProposalId:id(3),declarationApprovalId:id(4),fixedRecordId:id(5),fixedProposalId:id(6)};
 const fixed={recordId:prepared.fixedRecordId,proposalId:prepared.fixedProposalId,amountCents:fixture.expected.fixedAmountCents,sourceRowSha256:'a'.repeat(64)};
 const capture={body:{version:'own-payroll-run-command.v2',liquidationDate:fixture.liquidationDate},payload:{programState:{program:{definition:structuredClone(fixture.definition)}},monthlyDayDeclarations:{records:[{contractId:created.contractId,fullPeriod:true,configuration:{definition:structuredClone(fixture.declaration),proposalId:prepared.declarationProposalId,approvalId:prepared.declarationApprovalId}}]}},saved:{input:{employees:[{contractId:created.contractId,fixedForcedAmounts:[fixed]}]},result:{rowCount:6,rows:Object.entries(fixture.expected.byCode).map(([conceptCode,amount])=>({contractId:created.contractId,conceptCode,amount})),employeeTotals:[{contractId:created.contractId,...fixture.expected.totals}]}}};
 assert.equal(assertMonthlyNativeFullCycleCapture(capture,{created,fixture,prepared}).contractId,created.contractId);
 const changed=structuredClone(capture);changed.payload.programState.program.definition.rules[0].ruleReference+=' alterada';
 assert.throws(()=>assertMonthlyNativeFullCycleCapture(changed,{created,fixture,prepared}),/JOINT_CAPTURED_PROGRAMME_CHANGED/);
});
