// Complete manufactured closed history for the canonical F931 UI runners.
// This is Node-only QA data, not municipal history, identity or acceptance.
import {variableReportFixture} from './own-payroll-report-variables-synthetic.js';
import {fiscalCoverageFixture} from './own-f931-fiscal-coverage-synthetic.js';
import {censusForReceipt,rehashCensus} from './own-payroll-report-census-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {normalizeOwnPayrollInput,calculateOwnPayroll} from '../../assets/own-payroll-engine.js';
import {fiscalFactsHash} from '../../assets/own-fiscal-facts-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';

export function historicalF931BrowserFixture({count=61,period='2026-09',type='monthly',ordinal=period==='2026-09'?0:80,jurisdictions=true,withoutIdentity=false,opaqueNumber=null}={}){
 if(!Number.isSafeInteger(count)||count<2||count>10000)throw Error('Historical browser fixture requires2..10000 invented employees');
 const f=variableReportFixture(count,{period:'2026-10',type,ordinal,opaqueNumber}),detail=f.details[0],receipt=f.receipts[0];
 detail.period=period;receipt.body.period=period;detail.version=jurisdictions?'own-close-detail.v2':'own-close-detail.v1';
 for(const capture of detail.captures){
  capture.body.period=period;capture.payload.period=period;
  const p=capture.payload.programState;for(const rule of p.program.definition.rules)rule.validFrom='2026-01';for(const item of p.salaryCatalog.items)item.validFrom='2026-01';
  // An explicitly manufactured old v1 source can preserve missing identity.
  // It is still a COMPLETE original capture. Nothing is borrowed from a live
  // directory, and this flag is never used for the jurisdiction-aware fixture.
  if(withoutIdentity){if(jurisdictions)throw Error('Missing-identity v1 fixture cannot claim captured jurisdictions');for(const e of capture.payload.population.employees)e.identityToken=null;}
  if(jurisdictions)capture.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:count,rows:capture.payload.population.employees.map((e,index)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:uid(4000+index),identityToken:e.identityToken,jurisdictionCode:index%2?'55':'42'}))};
  capture.saved.input.period=period;capture.saved.input.rules=structuredClone(p.program.definition.rules);
  capture.saved.input.sourceVersions.rules=ownRunHash({program:p.program,salary:p.salaryCatalog});
  capture.saved.input=normalizeOwnPayrollInput(capture.saved.input);capture.saved.result=calculateOwnPayroll(capture.saved.input);
  capture.bodySha256=ownRunHash(capture.body);capture.payloadSha256=ownRunHash(capture.payload);capture.saved.inputSha256=ownRunHash(capture.saved.input);capture.saved.resultSha256=ownRunHash(capture.saved.result);
 }
 for(const row of detail.rows)Object.assign(row,{state:'confirmed',groupId:null,canClose:true,resultSha256:detail.captures.find(c=>c.id===row.runId).saved.resultSha256});
 receipt.snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]});receipt.bodySha256=ownRunHash(receipt.body);receipt.snapshotSha256=ownRunHash(receipt.snapshot);
 f.query={from:period,to:period,types:[type]};f.captures=structuredClone(detail.captures);f.censuses=[censusForReceipt(receipt)];
 for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 return f;
}
export function historicalF931BrowserReopen(f){
 const census=f.censuses[0],group=census.groups[0],receipt=f.receipts.find(r=>r.groupId===group.id);
 if(group.state!=='closed')throw Error('Synthetic group was already reopened');
 const event={id:uid(19000),groupId:group.id,command:'reopen',bodySha256:ownRunHash({syntheticOnly:true,command:'reopen',groupId:group.id}),snapshotSha256:receipt.snapshotSha256,recordedAt:'2026-10-07T12:00:00.000Z'};
 census.events.push(event);census.events.sort((a,b)=>a.id.localeCompare(b.id));census.eventCount=census.events.length;group.state='reopened';group.reopenedAt=event.recordedAt;rehashCensus(census);
 return f;
}
export async function historicalF931FiscalCoverageBrowserFixture(count=61){
 const fixture=await fiscalCoverageFixture(count),period='2026-09';
 const monthly=historicalF931BrowserFixture({count,period,jurisdictions:false});
 const historical=historicalF931BrowserFixture({count:2,period,type:'supplementary',ordinal:40,jurisdictions:false,withoutIdentity:true,opaqueNumber:'HIST-001'});
 fixture.params={period,presentationDate:'2026-10-31',types:['monthly','supplementary']};
 fixture.report={query:{from:period,to:period,types:[...fixture.params.types]},details:[...monthly.details,...historical.details],receipts:[...monthly.receipts,...historical.receipts],captures:[...monthly.captures,...historical.captures],censuses:[...monthly.censuses,...historical.censuses]};
 fixture.census.period=period;for(const row of fixture.census.rows)row.source.period=period;fixture.census.stateVersion=await fiscalFactsHash(fixture.census.rows);
 return fixture;
}
export function historicalF931BrowserLiquidation(capture){
 if(!capture)throw Error('Missing complete synthetic original capture');
 const employees=capture.saved.result.employeeTotals.map(e=>({contractId:e.contractId,state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:[],events:[]}));
 return{version:'own-liquidation-detail.v1',id:capture.id,scopeVersion:capture.body.scopeVersion,stateVersion:ownRunHash({captureId:capture.id,employees}),capture:structuredClone(capture),employees,effects:{paymentExecuted:false,accountingPosted:false,periodClosed:false},reviewAccessRequired:true};
}
export function historicalF931BrowserFullResponse(data){
 if(!data)throw Error('Missing complete synthetic source');
 const body=JSON.stringify({ok:true,data});return{status:200,body,contentType:OWN_RUN_FULL_JSON,headers:{'x-municontrol-json-bytes':String(Buffer.byteLength(body,'utf8')),'cache-control':'no-store'}};
}
