// Private callback payloads for F931 -> fiscal facts -> whole F931 review.
// Shape/copy checks only; each receiving panel must reauthorize before reading.
// No storage, global event, URL authority, fiscal approval or data transport.
import {salaryExact,salaryUuid} from './native-salary-catalog-model.js';
import {ownF931Params} from './own-f931-contract.js';
const need=(ok)=>{if(!ok)throw Error('Volvé a abrir la revisión fiscal desde su contrato y período.');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const review=value=>{need(typeof value.accessKey==='string'&&value.accessKey.length>0);return {params:ownF931Params(value.params),accessKey:value.accessKey};};
export function ownFiscalCorrectionTarget(value){
 need(salaryExact(value,['contractId','params','accessKey'])&&salaryUuid(value.contractId));
 return freeze({contractId:value.contractId.toLowerCase(),...review(value)});
}
export function ownFiscalCorrectionReview(value){
 need(salaryExact(value,['params','accessKey']));return freeze(review(value));
}
