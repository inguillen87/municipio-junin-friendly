// Stable source references contain no actor, attempt key, source context or consent.
// Opening a reference only queues a purpose-limited GET under the reader's session.
import {salaryExact,salaryUuid} from './native-salary-catalog-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
const fail=()=>{throw Error('El enlace de preparación no identifica una única anulación válida. Abrilo nuevamente desde su comprobante.');};
export function ownAnnulPreparationLink(sourceId){if(!salaryUuid(sourceId))fail();return '/nomina?anulacion='+encodeURIComponent(sourceId)+'#calculo';}
// An INDIVIDUAL annul decision (own-liquidation-receipt.v1) is identified by its
// run and its decision event. The preparer rereads that run's current detail
// under her own authorised session; the reviewer's receipt and key never travel.
export function ownLiquidationDecisionLink(runId,decisionId){if(!salaryUuid(runId)||!salaryUuid(decisionId))fail();return '/nomina?corrida='+encodeURIComponent(runId)+'&decision='+encodeURIComponent(decisionId)+'#calculo';}
export function ownProjectedAnnulmentQueue(value){
 const fields=['kind','sourceId',...(Object.hasOwn(value??{},'liquidationDate')?['liquidationDate']:[])];
 if(!salaryExact(value,fields)||Reflect.ownKeys(value).length!==fields.length||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')||!d.enumerable)||value.kind!=='projected_annulment'||!salaryUuid(value.sourceId)||fields.includes('liquidationDate')&&value.liquidationDate!==null&&!ownRunDate(value.liquidationDate))fail();
 return Object.freeze({kind:'projected_annulment',sourceId:value.sourceId,...(fields.includes('liquidationDate')?{liquidationDate:value.liquidationDate}:{})});
}
export function ownProjectedDecisionQueue(value){
 const fields=['kind','runId','decisionId'];
 if(!salaryExact(value,fields)||Reflect.ownKeys(value).length!==fields.length||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')||!d.enumerable)||value.kind!=='projected_decision'||!salaryUuid(value.runId)||!salaryUuid(value.decisionId)||value.runId===value.decisionId)fail();
 return Object.freeze({kind:'projected_decision',runId:value.runId,decisionId:value.decisionId});
}
export function requestedOwnAnnulPreparation(search){
 if(typeof search!=='string')fail();const params=new URLSearchParams(search),ids=params.getAll('anulacion'),runs=params.getAll('corrida'),decisions=params.getAll('decision');
 if(!ids.length&&!runs.length&&!decisions.length)return null;
 if(search.length>2048)fail();
 if(ids.length){if(ids.length!==1||[...params].length!==1||!salaryUuid(ids[0]))fail();return ownProjectedAnnulmentQueue({kind:'projected_annulment',sourceId:ids[0]});}
 if(runs.length!==1||decisions.length!==1||[...params].length!==2||!salaryUuid(runs[0])||!salaryUuid(decisions[0]))fail();
 return ownProjectedDecisionQueue({kind:'projected_decision',runId:runs[0],decisionId:decisions[0]});
}
