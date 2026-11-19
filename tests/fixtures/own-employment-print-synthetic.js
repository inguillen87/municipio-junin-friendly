import {jurisdictionFixture} from './own-payroll-jurisdiction-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {OWN_EMPLOYMENT_PRINT_CAPTURE_VERSION,OWN_EMPLOYMENT_JOB_TITLE_SOURCE} from '../../assets/own-payroll-employment-print-facts.js';

// New evidence is synthetic. The established economic input/result fixture is
// copied unchanged; no municipal identity, document or current source is read.
export function employmentPrintFixture(count=3){
 const capture=jurisdictionFixture(count).details[0].captures[0],period=capture.body.period;
 const first=period+'-01',last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
 const classes={version:'own-period-classification-capture.v1',complete:true,total:count,rows:capture.payload.population.employees.map((employee,i)=>{
  const definition={agreementCode:employee.agreementCode,categoryCode:employee.categoryCode,organizationId:'008',sectorCode:employee.departmentCode,
   jurisdictionCode:capture.payload.sourceInventory.jurisdictions.rows[i].jurisdictionCode,startDate:'2000-01-01',endDate:null};
  const registrationId=uid(4000+i),historical=i%3===2;
  return {contractId:employee.contractId,registrationId,identityToken:employee.identityToken,basis:historical?'approved_own_period_classification':'current_own_registration',
   classificationVersion:historical?'a'.repeat(64):null,approvalId:historical?uid(8000+i):null,
   definition:historical?{...definition,effectiveFrom:first,effectiveUntil:last,documentDate:'2026-10-14',documentReference:'Constancia retrospectiva sintética'}:definition,
   provenance:historical?{kind:'native_registration',registrationId,requestSha256:'b'.repeat(64)}:null};
 })};
 capture.payload.sourceInventory.periodClassifications=classes;
 capture.payload.sourceInventory.employmentPrintFacts={version:OWN_EMPLOYMENT_PRINT_CAPTURE_VERSION,period,complete:true,total:count,classificationsSha256:ownRunHash(classes),rows:classes.rows.map((row,i)=>({
  contractId:row.contractId,registrationId:row.registrationId,identityToken:row.identityToken,classificationRowSha256:ownRunHash(row),basis:row.basis,
  jobTitle:i%3===0?'Técnico de sistemas sintético':null,
  provenance:row.basis==='approved_own_period_classification'?row.provenance:{kind:'current_own_contract_at_capture',sourceField:OWN_EMPLOYMENT_JOB_TITLE_SOURCE,
   sourceVersion:ownRunHash({syntheticSource:i}),registration:{kind:'native_registration',registrationId:row.registrationId,requestSha256:ownRunHash({syntheticRegistration:i})}}
 }))};
 capture.payloadSha256=ownRunHash(capture.payload);
 const records=classes.rows.map(row=>({runId:capture.id,contractId:row.contractId,registrationId:row.registrationId,payloadSha256:capture.payloadSha256}));
 return {capture,records};
}
