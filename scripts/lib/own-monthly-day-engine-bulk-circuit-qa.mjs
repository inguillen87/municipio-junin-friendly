// Extends the same real nativeCI HTTP/SQL custody. No transport or fake responses.
import assert from 'node:assert/strict';
import {ownRunCommand} from '../../assets/own-payroll-run-model.js';
import {salaryKey,salaryUuid} from '../../assets/native-salary-catalog-model.js';
import {verifyMonthlyDayEngineCircuit} from './own-monthly-day-engine-circuit-qa.mjs';

const idsOf=rows=>rows.map(row=>row.contractId).sort();
export function monthly194BulkCircuitContext(h){
 assert.equal(h.synthetic,true);assert.equal(h.transport,'ci');
 const ids=[...h.contractIds].sort(),run=h.run;
 assert.equal(ids.length,601);assert.equal(new Set(ids).size,601);
 assert.ok(!ids.includes(h.previousContractId),'The prior one-contract scenario must remain outside the bulk population');
 assert.equal(salaryUuid(h.previousContractId),true);assert.equal(salaryKey(run.key),true);
 const body=ownRunCommand(run.body);assert.deepEqual(body,run.body);
 assert.equal(body.period,'2026-10');assert.equal(body.liquidationType,'monthly');
 assert.equal(body.selection.kind,'contracts');assert.deepEqual(body.selection.values,ids);
 assert.deepEqual(idsOf(run.saved.input.employees),ids);
 assert.deepEqual(idsOf(run.saved.result.employeeTotals),ids);
 assert.deepEqual(idsOf(run.payload.monthlyDayDeclarations.records),ids);
 return {...h,contractIds:ids,period:body.period,captureBody:structuredClone(body),captureKey:run.key,receiptScope:'closed_period'};
}
export function monthly194BulkCloseBaseline(detail,ids,previousContractId){
 assert.equal(detail.complete,true);assert.equal(detail.period,'2026-10');assert.equal(detail.liquidationType,'monthly');
 const selected=new Set(ids);assert.equal(selected.size,601);
 assert.deepEqual(idsOf(detail.rows.filter(row=>selected.has(row.contractId))),[...ids].sort());
 assert.ok(detail.rows.filter(row=>selected.has(row.contractId)).every(row=>row.state==='missing'&&row.groupId===null),'Fresh calculated601 must not already have any confirmation or close');
 const previous=detail.rows.find(row=>row.contractId===previousContractId);assert.ok(previous);assert.equal(previous.state,'confirmed');assert.equal(previous.groupId,null);
 assert.ok(detail.groups.some(group=>group.state==='reopened'&&group.employeeCount===1),'The first single-contract circuit must have reopened its own group');
 assert.equal(detail.groups.some(group=>group.state==='closed'),false,'A whole-period receipt cannot silently include any earlier closed group');
 return {outsideRows:structuredClone(detail.rows.filter(row=>!selected.has(row.contractId)).sort((a,b)=>a.contractId.localeCompare(b.contractId))),priorGroups:structuredClone(detail.groups),previousContractId};
}
export async function verifyMonthly194BulkCircuit(h){
 const context=monthly194BulkCircuitContext(h),{api,setActor,actors,contractIds,previousContractId,check}=context;
 setActor(actors.checker);
 const before=await api('close',{query:{resource:'detail',period:context.period,liquidationType:'monthly'}}),baseline=monthly194BulkCloseBaseline(before,contractIds,previousContractId);
 // This exact imported continuation issues all confirm/annul/recalculate/close/
 // PDF/receipt-review/reopen calls through the parent's real HTTP/SQL adapter.
 const result=await verifyMonthlyDayEngineCircuit(context);
 assert.equal(result.contractCount,601);assert.equal(result.pdfRecordCount,601);assert.ok(result.pdfPages>=601);assert.equal(result.receiptScope,'closed_period');
 setActor(actors.checker);
 const after=await api('close',{query:{resource:'detail',period:context.period,liquidationType:'monthly'}}),selected=new Set(contractIds);
 assert.equal(after.complete,true);assert.equal(after.groups.some(group=>group.state==='closed'),false);
 assert.deepEqual(idsOf(after.rows.filter(row=>selected.has(row.contractId))),contractIds);
 assert.ok(after.rows.filter(row=>selected.has(row.contractId)).every(row=>row.state==='confirmed'&&row.groupId===null),'Reopening preserves the complete601 confirmations');
 assert.deepEqual(after.rows.filter(row=>!selected.has(row.contractId)).sort((a,b)=>a.contractId.localeCompare(b.contractId)),baseline.outsideRows);
 for(const group of baseline.priorGroups)assert.deepEqual(after.groups.find(candidate=>candidate.id===group.id),group);
 const bulkGroup=after.groups.find(group=>group.id===result.closeGroupId);assert.ok(bulkGroup);assert.equal(bulkGroup.state,'reopened');assert.equal(bulkGroup.employeeCount,601);assert.ok(!baseline.priorGroups.some(group=>group.id===bulkGroup.id));
 check(true,'the same601 capacity contracts complete confirmation, annulment, recalculation, comparison, closure, whole-period601-PDF, independent receipt review and reopening; prior one-contract history and all excluded rows remain unchanged');
 return {...result,version:'own-monthly194-bulk-full-circuit-qa.v1',previousContractExcluded:true,previousGroupsConserved:true,outsideRowsConserved:baseline.outsideRows.length,closedPeriodContainsExactly601:true};
}
