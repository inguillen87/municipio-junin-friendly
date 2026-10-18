import{approvedSyntheticSources,hash,uid,syntheticSubject}from'./own-monthly-days-approved-synthetic.js';
import{prepareOwnPayrollInput,prepareOwnPayrollInputComplete}from'../../lib/own-payroll-approved-input.js';
import{createOwnPayrollSnapshot}from'../../lib/own-payroll-snapshot.js';
export const algorithmSha256='8ddcdff011c32ec2945f092afc347ddb093ddd6d4b46360b030e45864cb94bee'; // Synthetic receipt fixture, not runtime admission.
export function sealPayload(c){c.payloadSha256=hash(c.payload);return c;}
export function syntheticCapture(variant,{mode='legacy',days='30',forcedFixed=false,saved=false,algorithm=algorithmSha256}={}){
 const s=approvedSyntheticSources(variant,{mode,recognizedDays:days,forcedFixed}),e=s.population.employees[0],body={version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31',period:s.period,liquidationType:s.liquidationType,selection:structuredClone(s.selection),scopeVersion:s.programState.scopeVersion,programVersion:s.programState.program.version,populationDomain:'native_registered'};
 const list=s.fixed.list.data,out=s.fixed.export.data,sourceInventory={populationDomain:'native_registered',departmentSource:'sourceInventory.periodClassifications.rows[].definition.sectorCode',monthlyBatches:s.monthly.batches.length,ownNativeBatches:s.monthly.nativeBatches.length,fixedScope:'approved_selected_native',fixedSnapshotToken:list.snapshotToken,fixedListCount:list.total,fixedExportCount:out.total,fixedExportSha256:hash(out),jurisdictions:{version:'own-run-jurisdictions.v1',complete:true,total:1,rows:[{contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:syntheticSubject(e).registrationId,identityToken:e.identityToken,jurisdictionCode:'42'}]}};
 if(mode==='fixed-v2')Object.assign(sourceInventory,{fixedCapacityVersion:'payroll-fixed-capacity.v2',fixedCounts:structuredClone(list.counts)});
 for(const key of['workingTime','agreementWorkingTime','periodParticipation'])if(s[key])sourceInventory[key]={version:s[key].version,total:s[key].records.length,complete:true};
 if(s.monthlyDays)sourceInventory.monthlyDays={version:s.monthlyDays.version,total:s.monthlyDays.records.length,complete:true,authority:'approved_program_full_month',programApprovalId:s.programState.program.approvalId};
 if(s.monthlyDayDeclarations)sourceInventory.monthlyDayDeclarations={version:s.monthlyDayDeclarations.version,total:s.monthlyDayDeclarations.records.length,complete:true,authority:'independently_approved_monthly_declaration'};
 const c={version:'own-payroll-run.v2',id:uid(401),key:uid(402),body,bodySha256:hash(body),algorithmSha256:algorithm,payload:{...s,sourceInventory},payloadSha256:hash('pending'),createdAt:'2026-10-18T12:00:00Z',replayed:false,saved:null};
 if(saved){const snapshot=createOwnPayrollSnapshot((mode==='fixed-v2'?prepareOwnPayrollInputComplete:prepareOwnPayrollInput)(s));c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:algorithm,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:'2026-10-18T12:00:01Z'};}
 return sealPayload(c);
}
