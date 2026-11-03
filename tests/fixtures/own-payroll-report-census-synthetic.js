// Censo cerrado/reabierto fabricado sólo desde los recibos de un fixture de reporte (nunca desde
// sus filas operativas), sellado con el mismo hash que la fachada SQL; envoltorio de detalle de
// liquidación para capturas originales; censo fiscal literal por identityToken; alteración válida de
// identidad para probar la invariancia del proof. Ningún dato nominal.
import {OWN_REPORT_CENSUS_VERSION} from '../../assets/own-payroll-report-census-model.js';
import {FISCAL_FACT_FIELDS,fiscalFactsHash} from '../../assets/own-fiscal-facts-model.js';
import {syntheticFiscalFactsDefinition} from './own-fiscal-facts-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {uid} from './own-payroll-program-synthetic.js';
const byId=(a,b)=>a.id<b.id?-1:1;
export function reportCensusFixture(fixture,{period=fixture.query.from,liquidationType=fixture.query.types[0],reopened=[]}={}){
 const receipts=fixture.receipts.filter(r=>r.snapshot.period===period&&r.snapshot.liquidationType===liquidationType),events=[],groups=[];
 for(const r of receipts){
  const reopen=reopened.find(x=>x.groupId===r.groupId)??null;
  events.push({id:r.groupId,groupId:r.groupId,command:'close',bodySha256:r.bodySha256,snapshotSha256:r.snapshotSha256,recordedAt:r.recordedAt});
  if(reopen)events.push({id:reopen.id,groupId:r.groupId,command:'reopen',bodySha256:reopen.bodySha256,snapshotSha256:r.snapshotSha256,recordedAt:reopen.recordedAt});
  groups.push({id:r.groupId,state:reopen?'reopened':'closed',snapshotSha256:r.snapshotSha256,employeeCount:r.snapshot.employeeCount,populationCount:r.snapshot.populationCount,populationComplete:r.snapshot.populationComplete,recordedAt:r.recordedAt,reopenedAt:reopen?reopen.recordedAt:null});
 }
 events.sort(byId);groups.sort(byId);
 const source={version:OWN_REPORT_CENSUS_VERSION,period,liquidationType,scopeVersion:fixture.details[0].scopeVersion,complete:true,eventCount:events.length,events,groups};
 return {...source,sourceVersion:ownRunHash(source)};
}
export function reopenEvent(groupId,number=777){return {groupId,id:uid(number),bodySha256:ownRunHash({command:'reopen',groupId,reason:'Reapertura exclusivamente sintética'}),recordedAt:'2026-10-06T10:00:00.000Z'};}
export function liquidationDetailFor(capture){
 return {version:'own-liquidation-detail.v1',id:capture.id,scopeVersion:'a'.repeat(64),stateVersion:'b'.repeat(64),reviewAccessRequired:true,capture,employees:capture.saved.result.employeeTotals.map(e=>({contractId:e.contractId,state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:['confirm'],events:[]})),effects:{paymentExecuted:false,accountingPosted:false,periodClosed:false}};
}
// Censo fiscal completo y vigente para cada contrato del snapshot, con el identityToken de la captura dada.
export async function fiscalCensusFor(receipt,captures,{period=receipt.snapshot.period}={}){
 const people=captures.flatMap(c=>c.payload.population.employees),rows=[];
 for(const [index,employee]of receipt.snapshot.employees.entries()){
  const person=people.find(p=>p.contractId===employee.contractId),definition=syntheticFiscalFactsDefinition();definition.fields=Object.fromEntries(FISCAL_FACT_FIELDS.map(n=>[n,n===3?'0002':'0']));
  const source={version:'d'.repeat(64),period,fullPeriod:true,subject:{contractId:employee.contractId,registrationId:uid(index+8000),legajo:'ACTUAL-'+index,employeeName:'Nombre actual exclusivamente sintético '+index,identityToken:person.identityToken,sourceCutoff:null,origin:'MUNICONTROL',registeredAt:'2026-09-01T12:00:00Z'}};
  rows.push({contractId:employee.contractId,configuration:{version:'a'.repeat(64),revision:1,definition,proposalId:uid(index+9000),approvalId:uid(index+10000),identityToken:person.identityToken,sourceVersion:'d'.repeat(64)},source,current:true});
 }
 rows.sort((a,b)=>a.contractId.localeCompare(b.contractId));
 return {version:'own-fiscal-census.v1',period,scopeVersion:'a'.repeat(64),stateVersion:await fiscalFactsHash(rows),rows,complete:true,payrollCalculated:false,payrollPosted:false};
}
// Cambia sólo el identityToken de un empleado de la población original y vuelve a sellar el payload.
// Válido por contrato cuando la captura no tiene periodContext ni inventario de jurisdicciones.
export function withIdentityToken(capture,contractId,token){
 const next=structuredClone(capture),person=next.payload.population.employees.find(p=>p.contractId===contractId);if(!person)throw Error('contrato ajeno a la captura');
 person.identityToken=token;next.payloadSha256=ownRunHash(next.payload);return next;
}
