// Stable source references contain no actor, attempt key, source context or consent.
// Opening a reference only queues a purpose-limited GET under the reader's session.
import {salaryExact,salaryUuid} from './native-salary-catalog-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
const fail=()=>{throw Error('El enlace de preparación no identifica una única anulación válida. Abrilo nuevamente desde su comprobante.');};
export function ownAnnulPreparationLink(sourceId){if(!salaryUuid(sourceId))fail();return '/nomina?anulacion='+encodeURIComponent(sourceId)+'#calculo';}
export function ownProjectedAnnulmentQueue(value){
 const fields=['kind','sourceId',...(Object.hasOwn(value??{},'liquidationDate')?['liquidationDate']:[])];
 if(!salaryExact(value,fields)||Reflect.ownKeys(value).length!==fields.length||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')||!d.enumerable)||value.kind!=='projected_annulment'||!salaryUuid(value.sourceId)||fields.includes('liquidationDate')&&value.liquidationDate!==null&&!ownRunDate(value.liquidationDate))fail();
 return Object.freeze({kind:'projected_annulment',sourceId:value.sourceId,...(fields.includes('liquidationDate')?{liquidationDate:value.liquidationDate}:{})});
}
export function requestedOwnAnnulPreparation(search){
 if(typeof search!=='string')fail();const params=new URLSearchParams(search),ids=params.getAll('anulacion');if(!ids.length)return null;
 if(search.length>2048||ids.length!==1||[...params].length!==1||!salaryUuid(ids[0]))fail();
 return ownProjectedAnnulmentQueue({kind:'projected_annulment',sourceId:ids[0]});
}
