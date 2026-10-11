// Manufactured closures and literal fiscal facts only; not municipal codes or acceptance.
import {reportFixture,historicalReportFixture,rehashReportFixture} from './own-payroll-report-synthetic.js';
import {syntheticFiscalFactsDefinition} from './own-fiscal-facts-synthetic.js';
import {FISCAL_FACT_FIELDS,fiscalFactsHash} from '../../assets/own-fiscal-facts-model.js';
import {uid} from './own-payroll-program-synthetic.js';
export async function fiscalCoverageFixture(count=61){
 const report=reportFixture(count||2),period=report.query.from,params={period,presentationDate:period+'-28',types:report.query.types},rows=[];
 if(count===0){report.details[0].rows=[];report.details[0].groups=[];report.details[0].captures=[];report.receipts=[];}
 for(const [index,employee]of (report.receipts[0]?.snapshot.employees??[]).entries()){
  if(index%4===0)continue;
  const definition=syntheticFiscalFactsDefinition();if(index%4!==2)definition.fields=Object.fromEntries(FISCAL_FACT_FIELDS.map(n=>[n,n===3?'0002':'0']));
  const source={version:(index%4===1?'f':'d').repeat(64),period,fullPeriod:true,subject:{contractId:employee.contractId,registrationId:uid(index+8000),legajo:'ACTUAL-'+index,employeeName:'Nombre actual exclusivamente sintético '+index,identityToken:'e'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registeredAt:'2026-09-01T12:00:00Z'}};
  rows.push({contractId:employee.contractId,configuration:{version:'a'.repeat(64),revision:1,definition,proposalId:uid(index+9000),approvalId:uid(index+10000),identityToken:'e'.repeat(64),sourceVersion:'d'.repeat(64)},source,current:index%4!==1});
 }
 rows.sort((a,b)=>a.contractId.localeCompare(b.contractId));const census={version:'own-fiscal-census.v1',period,scopeVersion:'a'.repeat(64),stateVersion:await fiscalFactsHash(rows),rows,complete:true,payrollCalculated:false,payrollPosted:false};return {report,params,census};
}
export function addHistoricalFiscalType(value){
 const previous=historicalReportFixture(value.params.period,'supplementary',601),snapshot=previous.receipts[0].snapshot;const id=snapshot.employees[0].contractId;snapshot.employees[0].employeeNumber='HIST-001';for(const row of snapshot.concepts.filter(r=>r.contractId===id))row.employeeNumber='HIST-001';rehashReportFixture(previous);
 value.report.details.push(...previous.details);value.report.receipts.push(...previous.receipts);value.params.types.push('supplementary');value.report.query.types=[...value.params.types];return value;
}
