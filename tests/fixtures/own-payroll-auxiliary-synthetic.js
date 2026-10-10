// Invented values only. No municipal formula, employee or bank details.
import { row } from './native-salary-synthetic.js';
import { rule, fact, ref, binary, policy } from './own-payroll-synthetic.js';
import { approvedSources } from './own-payroll-approved-synthetic.js';
import { capture, saved } from './own-payroll-run-synthetic.js';
import { ownRunHash } from '../../lib/internal-own-payroll-run.js';
import { salaryItems } from '../../assets/native-salary-catalog-model.js';
import { ownProgramDefinition } from '../../assets/own-payroll-program-model.js';
import { closeDetail,closeCommand,closeReceipt } from './own-payroll-close-synthetic.js';
import { ownCloseSnapshot } from '../../assets/own-payroll-close-model.js';
import { receiptSnapshot,receiptBatch } from './own-payroll-receipt-synthetic.js';
import { uid } from './own-payroll-program-synthetic.js';
export const auxiliaryReference = (code, stage = 'exact') => ({ op: 'auxiliary', code, stage });
export const auxiliaryDefinitions = () => salaryItems([
  row({ kind: 'auxiliary', code: '88', label: 'Valor auxiliar exclusivamente sintético', nature: 'auxiliary', unit: 'money', value: '100.11' }),
  row({ code: '88', label: 'Haber exclusivamente sintético', unit: 'money', value: '7.29' }),
  row({ code: '95', label: 'Suma exclusivamente sintética', unit: 'money' }),
]);
export const auxiliaryProgram = () => ownProgramDefinition({ namespaceVersion: 'own-payroll-namespaces.v2', totalsPrecision: 2,
  rules: [
    rule('88', fact('auxiliaryValue'), { nature: 'auxiliary', rounding: policy('exact') }),
    rule('88', fact('conceptValue'), { rounding: policy('exact') }),
    rule('95', binary('add', auxiliaryReference('88'), ref('88', 'exact')), { rounding: policy('exact') }),
  ],
  bindings: [
    { agreementCode: '1', key: 'auxiliaryValue', unit: 'money', sourceKind: 'auxiliary_parameter', sourceCode: '88', onMissing: 'error', combine: 'single', ruleReference: 'Parámetro auxiliar ficticio QA' },
    { agreementCode: '1', key: 'conceptValue', unit: 'money', sourceKind: 'parameter', sourceCode: '88', onMissing: 'error', combine: 'single', ruleReference: 'Valor de concepto ficticio QA' },
  ],
}, auxiliaryDefinitions());
export function auxiliarySources(count = 1) {
  const source = approvedSources(count);
  source.monthly.batches = [];
  source.programState.salaryCatalog.items = auxiliaryDefinitions();
  source.programState.program.definition = auxiliaryProgram();
  return source;
}
export function auxiliaryCapture(count = 1, patch = {}) {
  const value = capture(patch); value.payload = { ...auxiliarySources(count), sourceInventory: value.payload.sourceInventory };
  value.payloadSha256 = ownRunHash(value.payload); value.saved = saved(value); return value;
}
export function auxiliaryDocuments(count=37){
  const c=auxiliaryCapture(count),employees=c.payload.population.employees;
  c.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:count,rows:employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:uid(30000+i),identityToken:e.identityToken,jurisdictionCode:i%2?'55':'42'}))};
  c.payloadSha256=ownRunHash(c.payload);
  const detail={...closeDetail(count),version:'own-close-detail.v2',period:c.body.period,liquidationType:c.body.liquidationType,captures:[c],rows:c.saved.input.employees.map(e=>({...Object.fromEntries(['contractId','employeeNumber','agreementCode','departmentCode'].map(k=>[k,e[k]])),state:'confirmed',runId:c.id,resultSha256:c.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true}))};
  const body=closeCommand({period:detail.period,liquidationType:detail.liquidationType}),closed=closeReceipt({body,bodySha256:ownRunHash(body),snapshot:ownCloseSnapshot(detail,body.selection)});closed.snapshotSha256=ownRunHash(closed.snapshot);
  const s=receiptSnapshot(count);s.version='own-receipt-snapshot.v3';s.identityBasis='owned_registration_verified_at_capture';s.params.period=detail.period;s.sources=[{id:closed.groupId,snapshotSha256:closed.snapshotSha256,period:detail.period,type:detail.liquidationType,employeeCount:count,populationCount:count,selectedCount:count}];
  s.records=closed.snapshot.employees.map((e,i)=>({...s.records[i],...Object.fromEntries(['contractId','employeeNumber','agreementCode','departmentCode','runId','liquidationVersion','precision','namespaceVersion'].map(k=>[k,e[k]])),totals:Object.fromEntries(Object.entries(e.totals).filter(([k])=>k!=='contractId')),concepts:closed.snapshot.concepts.filter(r=>r.contractId===e.contractId).map(r=>({code:r.conceptCode,label:auxiliaryDefinitions().find(d=>d.code===r.conceptCode&&(d.kind==='auxiliary')===(r.nature==='auxiliary')).label,nature:r.nature,unit:r.unit,amount:r.amount,labelSourceSha256:c.payloadSha256}))}));s.conceptCount=s.records.reduce((n,r)=>n+r.concepts.length,0);
  const batch={...receiptBatch(count),snapshot:s,snapshotSha256:ownRunHash(s),state:'approved',review:{id:uid(810),decision:'approved',at:'2026-10-10T20:00:00Z',by:'Revisor independiente sintético',reason:'Revisión exclusivamente sintética completa'},permissions:{canApprove:false,canWithdraw:true,canDownload:true}};
  return {capture:c,detail,closed,batch};
}
