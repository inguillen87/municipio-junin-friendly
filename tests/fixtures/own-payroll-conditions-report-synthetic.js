import {variableReportFixture} from './own-payroll-report-variables-synthetic.js';
import {conditionSources,sealConditionSources} from './own-payroll-conditions-synthetic.js';
import {prepareOwnPayrollInput} from '../../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../../lib/own-payroll-snapshot.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {reportGroup} from './own-payroll-report-synthetic.js';
export function conditionReportFixture(count=37){
 const f=variableReportFixture(count);
 for(const detail of f.details){
  for(const c of detail.captures){
   const s=conditionSources(c.payload.population.employees.length);s.population.employees=structuredClone(c.payload.population.employees);s.programState.program.version=c.body.programVersion;
   s.salaryConditions.records=s.population.employees.map((e,i)=>({...s.salaryConditions.records[i],contractId:e.contractId,identityToken:e.identityToken}));sealConditionSources(s);
   c.payload={...s,sourceInventory:c.payload.sourceInventory};const snap=createOwnPayrollSnapshot(prepareOwnPayrollInput(s));Object.assign(c.saved,{input:snap.input,result:snap.result,inputSha256:snap.inputSha256,resultSha256:snap.resultSha256});c.payloadSha256=ownRunHash(c.payload);
   for(const r of detail.rows)if(r.runId===c.id)r.resultSha256=c.saved.resultSha256;
  }
  for(const r of detail.rows)Object.assign(r,{state:'confirmed',groupId:null,canClose:true});
  const receipt=f.receipts.find(r=>r.body.period===detail.period&&r.body.liquidationType===detail.liquidationType);receipt.snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]});receipt.snapshotSha256=ownRunHash(receipt.snapshot);detail.groups=[reportGroup(receipt)];for(const r of detail.rows)Object.assign(r,{state:'closed',groupId:receipt.groupId,canClose:false});
 }
 f.captures=structuredClone(f.details.flatMap(d=>d.captures));return f;
}
