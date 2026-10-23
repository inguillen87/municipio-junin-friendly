// Compact exhaustive index plus individually downloaded, verified active details.
// A historical hash reference is never described as a verified full capture.
import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized} from './native-salary-catalog-model.js';
import {verifiedOwnLiquidationDetail,ownLiquidationReceipt,verifiedOwnLiquidationReceipt} from './own-payroll-liquidation-model.js';
import {ownAnnulCommand,verifiedOwnAnnulReceipt} from './own-payroll-annulment-model.js';
import {ownCloseSelection} from './own-payroll-close-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {decimal,exactAdd,quantize} from './own-payroll-exact.js';

export const OWN_ANNUL_REVIEW_VERSION='own-annul-review.v2';
const localRows=new WeakMap(),localSelections=new WeakMap();
const fail=(code='CONTRACT_INVALID')=>{throw Object.assign(Error('No se verificó el índice y todos los detalles requeridos para esta revisión de anulación.'),{code:'OWN_ANNUL_REVIEW_'+code});};
const need=(value,code)=>{if(!value)fail(code);};
const exact=(value,keys)=>need(salaryExact(value,keys));
const period=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const dense=value=>Array.isArray(value)&&Reflect.ownKeys(value).length===value.length+1;
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const sortedUnique=values=>same(values,[...new Set(values)].sort());
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value))))].map(value=>value.toString(16).padStart(2,'0')).join('');
const stateFields=['calculated','confirmed','annulled','cancelled'];

export function ownAnnulReviewIndex(value){
 exact(value,['version','period','liquidationType','scopeVersion','stateVersion','reviewSha256','index','closed','liquidationHistory','closeHistory','complete']);
 need(value.version===OWN_ANNUL_REVIEW_VERSION&&period(value.period)&&Object.hasOwn(OWN_RUN_TYPES,value.liquidationType)&&salaryHash(value.scopeVersion)&&salaryHash(value.stateVersion)&&salaryHash(value.reviewSha256)&&value.complete===true&&dense(value.index)&&value.index.length<=1000&&dense(value.closed)&&value.closed.length<=10000&&dense(value.liquidationHistory)&&dense(value.closeHistory));
 const runs=new Map(),confirmed=new Set();
 for(const row of value.index){
  exact(row,['id','stateVersion','bodySha256','payloadSha256','inputSha256','resultSha256','algorithmSha256','employeeCount','conceptRowCount','totalsPrecision','createdAt','liquidationDate','states','confirmedContractIds','reviewAccessRequired']);
  need(salaryUuid(row.id)&&!runs.has(row.id)&&[row.stateVersion,row.bodySha256,row.payloadSha256,row.inputSha256,row.resultSha256,row.algorithmSha256].every(salaryHash)&&Number.isSafeInteger(row.employeeCount)&&row.employeeCount>0&&row.employeeCount<=10000&&Number.isSafeInteger(row.conceptRowCount)&&row.conceptRowCount>0&&Number.isInteger(row.totalsPrecision)&&row.totalsPrecision>=0&&row.totalsPrecision<=8&&instant(row.createdAt)&&(row.liquidationDate===null||ownRunDate(row.liquidationDate))&&typeof row.reviewAccessRequired==='boolean');
  exact(row.states,stateFields);need(stateFields.every(key=>Number.isSafeInteger(row.states[key])&&row.states[key]>=0)&&stateFields.reduce((sum,key)=>sum+row.states[key],0)===row.employeeCount);
  need(dense(row.confirmedContractIds)&&row.confirmedContractIds.length===row.states.confirmed&&row.confirmedContractIds.every(salaryUuid)&&sortedUnique(row.confirmedContractIds));
  for(const id of row.confirmedContractIds){need(!confirmed.has(id),'DUPLICATE_CONFIRMED');confirmed.add(id);}runs.set(row.id,row);
 }
 need(confirmed.size<=10000&&sortedUnique(value.index.map(row=>row.id)));
 const closeIds=new Set();
 for(const item of value.closeHistory){exact(item,['id','bodySha256','snapshotSha256']);need(salaryUuid(item.id)&&!closeIds.has(item.id)&&salaryHash(item.bodySha256)&&salaryHash(item.snapshotSha256));closeIds.add(item.id);}
 need(sortedUnique(value.closeHistory.map(item=>item.id)));
 const closedContracts=new Set();
 for(const item of value.closed){exact(item,['runId','contractId','groupId']);const run=runs.get(item.runId);need(run&&salaryUuid(item.contractId)&&salaryUuid(item.groupId)&&closeIds.has(item.groupId)&&run.confirmedContractIds.includes(item.contractId)&&!closedContracts.has(item.contractId));closedContracts.add(item.contractId);}
 need(sortedUnique(value.closed.map(item=>item.contractId)));
 const eventIds=new Set();
 for(const item of value.liquidationHistory){exact(item,['id','runId','bodySha256']);need(salaryUuid(item.id)&&!eventIds.has(item.id)&&runs.has(item.runId)&&salaryHash(item.bodySha256));eventIds.add(item.id);}
 need(sortedUnique(value.liquidationHistory.map(item=>item.id)));return value;
}

function stateProjection(value){
 // Exact legacy201 state fingerprint. Per-run stateVersion remains the real
 // authoritative value, including197 succession; never rebuild it from counts.
 return{scopeVersion:value.scopeVersion,period:value.period,liquidationType:value.liquidationType,runs:value.index.map(row=>({id:row.id,stateVersion:row.stateVersion,bodySha256:row.bodySha256,resultSha256:row.resultSha256})),closed:value.closed,closeHistory:value.closeHistory};
}
export async function verifiedOwnAnnulReviewIndex(value){
 ownAnnulReviewIndex(value);need(await digest(stateProjection(value))===value.stateVersion,'STATE_CHANGED');
 const {reviewSha256,...administrative}=value;need(await digest(administrative)===reviewSha256,'REVIEW_CHANGED');return value;
}

async function checkedDetail(index,reference,loadDetail){
 const detail=await loadDetail(reference.id);
 await verifiedOwnLiquidationDetail(detail);
 const capture=detail.capture,saved=capture.saved;
 need(detail.id===reference.id&&detail.scopeVersion===index.scopeVersion&&detail.stateVersion===reference.stateVersion&&detail.reviewAccessRequired===reference.reviewAccessRequired&&capture.id===reference.id&&capture.body.period===index.period&&capture.body.liquidationType===index.liquidationType&&capture.bodySha256===reference.bodySha256&&capture.payloadSha256===reference.payloadSha256&&capture.algorithmSha256===reference.algorithmSha256&&saved.inputSha256===reference.inputSha256&&saved.resultSha256===reference.resultSha256&&saved.input.totalsPrecision===reference.totalsPrecision&&saved.result.employeeCount===reference.employeeCount&&saved.result.rowCount===reference.conceptRowCount&&capture.createdAt===reference.createdAt&&(capture.body.liquidationDate??null)===reference.liquidationDate,'CAPTURE_CHANGED');
 const states=Object.fromEntries(stateFields.map(state=>[state,detail.employees.filter(row=>row.state===state).length]));
 need(same(states,reference.states)&&same(detail.employees.filter(row=>row.state==='confirmed').map(row=>row.contractId).sort(),reference.confirmedContractIds),'STATE_CHANGED');
 return detail;
}
function projectedRow(index,detail,employee){
 const saved=detail.capture.saved,person=saved.input.employees.find(row=>row.contractId===employee.contractId),totals=saved.result.employeeTotals.find(row=>row.contractId===employee.contractId),closed=index.closed.find(row=>row.runId===detail.id&&row.contractId===employee.contractId);
 need(person&&totals);
 // Explicit primitives only: no person.inputs, concepts, source payload or event
 // objects escape this projection, so each full detail can be released in turn.
 return{contractId:employee.contractId,employeeNumber:person.employeeNumber,agreementCode:person.agreementCode,departmentCode:person.departmentCode,runId:detail.id,resultSha256:saved.resultSha256,liquidationDate:detail.capture.body.liquidationDate??null,version:employee.version,liquidationVersion:employee.liquidationVersion,groupId:closed?.groupId??null,allowed:employee.allowedCommands.includes('annul')&&!closed,totals:{gross:totals.gross,deduction:totals.deduction,net:totals.net},precision:saved.input.totalsPrecision};
}
export async function loadOwnAnnulReview(value,loadDetail){
 need(typeof loadDetail==='function');const index=freeze(structuredClone(await verifiedOwnAnnulReviewIndex(value))),rows=[];
 for(const reference of index.index){
  if(reference.states.confirmed===0)continue;
  const detail=await checkedDetail(index,reference,loadDetail);
  for(const employee of detail.employees)if(employee.state==='confirmed')rows.push(projectedRow(index,detail,employee));
 }
 rows.sort((a,b)=>a.contractId<b.contractId?-1:a.contractId>b.contractId?1:0);
 need(rows.length===index.index.reduce((sum,row)=>sum+row.states.confirmed,0),'INCOMPLETE');
 const result=freeze({version:'own-annul-local-review.v2',period:index.period,liquidationType:index.liquidationType,scopeVersion:index.scopeVersion,stateVersion:index.stateVersion,reviewSha256:index.reviewSha256,index:index.index,complete:true});
 localRows.set(result,freeze(rows));return result;
}
export function ownAnnulReviewRows(review){need(localRows.has(review),'REVIEW_REQUIRED');return localRows.get(review);}
export function ownAnnulReviewSelection(review,selection){
 const all=ownAnnulReviewRows(review),chosen=ownCloseSelection(selection),field={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[chosen.kind];
 const rows=all.filter(row=>chosen.kind==='all'||chosen.values.includes(row[field]));need(rows.length>0&&chosen.values.every(value=>rows.some(row=>row[field]===value)),'SELECTION_INVALID');
 const precision=Math.max(...rows.map(row=>row.precision)),totals=Object.fromEntries(['gross','deduction','net'].map(key=>[key,quantize(rows.reduce((sum,row)=>exactAdd(sum,decimal(row.totals[key])),decimal('0')),{precision,mode:'exact'}).amount]));
 const result=freeze({selection:chosen,rows,count:rows.length,runCount:new Set(rows.map(row=>row.runId)).size,allowed:rows.every(row=>row.allowed),totals,complete:true});localSelections.set(result,review);return result;
}
// This local request is an intent reference, never a receipt or authority.
// accessKey is held only in memory; this request is never serialized in a URL.
export function ownAnnulSingleReviewReference(value){
 const fields=['period','liquidationType','runId','resultSha256','contractId','version','liquidationVersion','accessKey'];
 exact(value,fields);need(Reflect.ownKeys(value).length===fields.length&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'REFERENCE_INVALID');
 need(period(value.period)&&Object.hasOwn(OWN_RUN_TYPES,value.liquidationType)&&salaryUuid(value.runId)&&salaryHash(value.resultSha256)&&salaryUuid(value.contractId)&&Number.isSafeInteger(value.version)&&value.version>0&&Number.isSafeInteger(value.liquidationVersion)&&value.liquidationVersion>0&&typeof value.accessKey==='string'&&value.accessKey.length>0,'REFERENCE_INVALID');
 return Object.freeze(Object.fromEntries(fields.map(key=>[key,value[key]])));
}
export function ownAnnulSingleReviewSelection(review,value){
 const reference=ownAnnulSingleReviewReference(value),rows=ownAnnulReviewRows(review).filter(row=>row.contractId===reference.contractId);
 need(review.period===reference.period&&review.liquidationType===reference.liquidationType&&rows.length===1,'REFERENCE_CHANGED');const row=rows[0];
 need(row.runId===reference.runId&&row.resultSha256===reference.resultSha256&&row.version===reference.version&&row.liquidationVersion===reference.liquidationVersion&&row.groupId===null&&row.allowed===true,'REFERENCE_CHANGED');
 return ownAnnulReviewSelection(review,{kind:'contracts',values:[reference.contractId]});
}
export function ownAnnulReviewCommand(value){
 exact(value,['version','period','liquidationType','scopeVersion','stateVersion','reviewSha256','selection','reason','reviewConfirmed']);
 need(value.version==='own-annul-command.v2'&&salaryHash(value.reviewSha256));
 // Reuse only the legacy field validators, not its protocol or fingerprint.
 const {version,reviewSha256,...legacyFields}=value,checked=ownAnnulCommand(legacyFields);
 return{version,...checked,reviewSha256};
}
export function ownAnnulReviewAttempt(key,body,accessKey,selection){
 const review=localSelections.get(selection);need(review,'REVIEW_REQUIRED');const checked=ownAnnulReviewCommand(body);
 need(salaryKey(key)&&typeof accessKey==='string'&&accessKey.length>0&&selection.allowed&&selection.complete===true);
 need(checked.period===review.period&&checked.liquidationType===review.liquidationType&&checked.scopeVersion===review.scopeVersion&&checked.stateVersion===review.stateVersion&&checked.reviewSha256===review.reviewSha256&&same(checked.selection,selection.selection),'STATE_CHANGED');
 return freeze({key,body:structuredClone(checked),accessKey,expected:selection.rows.map(row=>({runId:row.runId,resultSha256:row.resultSha256,contractId:row.contractId,liquidationDate:row.liquidationDate,version:row.version+1,liquidationVersion:row.liquidationVersion}))});
}
export function ownAnnulReviewReceipt(value,attempt=null){
 exact(value,['version','id','key','body','bodySha256','affected','receipts','recordedAt','replayed']);const body=ownAnnulReviewCommand(value.body);
 need(value.version==='own-annul-receipt.v2'&&salaryUuid(value.id)&&salaryKey(value.key)&&salaryHash(value.bodySha256)&&instant(value.recordedAt)&&typeof value.replayed==='boolean'&&dense(value.affected)&&value.affected.length>0&&value.affected.length<=10000&&dense(value.receipts)&&value.receipts.length>0&&value.receipts.length<=1000);
 const pairs=new Set(),ids=new Set(),runs=new Map(),eventIds=new Set(),eventKeys=new Set();
 for(const receipt of value.receipts){ownLiquidationReceipt(receipt);need(receipt.body.command==='annul'&&receipt.body.selection.kind==='contracts'&&receipt.body.reason===body.reason&&receipt.body.scopeVersion===body.scopeVersion&&!runs.has(receipt.runId)&&!eventIds.has(receipt.id)&&!eventKeys.has(receipt.key));runs.set(receipt.runId,receipt);eventIds.add(receipt.id);eventKeys.add(receipt.key);}
 for(const affected of value.affected){
  exact(affected,['runId','resultSha256','contractId','liquidationDate','version','liquidationVersion']);need(!ids.has(affected.contractId));ids.add(affected.contractId);need(affected.liquidationDate===null||ownRunDate(affected.liquidationDate));
  const receipt=runs.get(affected.runId),child=receipt?.affected.find(row=>row.contractId===affected.contractId);
  need(child&&receipt.resultSha256===affected.resultSha256&&child.version===affected.version&&child.liquidationVersion===affected.liquidationVersion);pairs.add(affected.runId+':'+affected.contractId);
 }
 need([...runs.values()].every(receipt=>receipt.affected.every(row=>pairs.has(receipt.runId+':'+row.contractId))));
 if(body.selection.kind==='contracts')need(same([...ids].sort(),body.selection.values));
 if(attempt)need(attempt.body?.version==='own-annul-command.v2'&&value.key===attempt.key&&same(body,attempt.body)&&same([...value.affected].sort((a,b)=>a.contractId.localeCompare(b.contractId)),[...attempt.expected].sort((a,b)=>a.contractId.localeCompare(b.contractId))));
 return value;
}
export async function verifiedOwnAnnulReviewReceipt(value,attempt=null){
 // Legacy events remain recoverable as their original protocol. A v1 response
 // can never fulfill an explicit v2 attempt, even if all affected IDs match.
 if(value?.version==='own-annul-receipt.v1'){need(attempt===null||attempt.body?.version!=='own-annul-command.v2');return verifiedOwnAnnulReceipt(value,attempt);}
 ownAnnulReviewReceipt(value,attempt);need(await digest(value.body)===value.bodySha256,'RECEIPT_CHANGED');
 for(const receipt of value.receipts)await verifiedOwnLiquidationReceipt(receipt);return value;
}

// Outcome of a registered annulment, rebuilt ONLY from the verified receipt and
// authenticated reads: the current index and the complete detail of every
// affected run. No local selection is retained, so the view survives hiding,
// task changes and recovery from a lost acknowledgement. The decision version
// (annul event) is reported apart from the liquidationVersion it annulled. A
// contract confirmed again in another run is reported, never hidden or failed:
// a historical annulment does not describe the current state.
export const OWN_ANNUL_OUTCOME_VERSION='own-annul-outcome.v1';
export async function loadOwnAnnulOutcome(value,receipt,loadDetail){
 need(typeof loadDetail==='function');
 const index=freeze(structuredClone(await verifiedOwnAnnulReviewIndex(value)));need(receipt?.version==='own-annul-receipt.v2');await verifiedOwnAnnulReviewReceipt(receipt);
 need(index.period===receipt.body.period&&index.liquidationType===receipt.body.liquidationType&&index.scopeVersion===receipt.body.scopeVersion,'STATE_CHANGED');
 const confirmedIn=new Map();for(const reference of index.index)for(const id of reference.confirmedContractIds)confirmedIn.set(id,reference.id);
 const runs=[...new Set(receipt.affected.map(row=>row.runId))].sort(),rows=[];
 for(const runId of runs){
  const reference=index.index.find(row=>row.id===runId);need(reference,'INCOMPLETE');
  const detail=await checkedDetail(index,reference,loadDetail);
  for(const affected of receipt.affected.filter(row=>row.runId===runId)){
   const state=detail.employees.find(row=>row.contractId===affected.contractId);
   need(reference.resultSha256===affected.resultSha256&&reference.liquidationDate===affected.liquidationDate&&state?.state==='annulled'&&state.version===affected.version&&state.liquidationVersion===affected.liquidationVersion,'STATE_CHANGED');
   const {version,groupId,allowed,...row}=projectedRow(index,detail,state);
   rows.push({...row,decisionVersion:state.version,confirmedAgainIn:confirmedIn.get(affected.contractId)??null});
  }
 }
 rows.sort((a,b)=>a.contractId<b.contractId?-1:a.contractId>b.contractId?1:0);
 need(rows.length===receipt.affected.length&&new Set(rows.map(row=>row.contractId)).size===rows.length,'INCOMPLETE');
 const precision=Math.max(...rows.map(row=>row.precision)),totals=Object.fromEntries(['gross','deduction','net'].map(key=>[key,quantize(rows.reduce((sum,row)=>exactAdd(sum,decimal(row.totals[key])),decimal('0')),{precision,mode:'exact'}).amount]));
 return freeze({version:OWN_ANNUL_OUTCOME_VERSION,annulled:true,receiptId:receipt.id,key:receipt.key,period:index.period,liquidationType:index.liquidationType,recordedAt:receipt.recordedAt,rows,count:rows.length,runCount:runs.length,totals,confirmedAgainCount:rows.filter(row=>row.confirmedAgainIn!==null).length,complete:true});
}

export async function loadOwnAnnulPreparation(value,receipt,date,loadDetail){
 need(typeof loadDetail==='function'&&(date===null||ownRunDate(date)));
 const index=freeze(structuredClone(await verifiedOwnAnnulReviewIndex(value)));await verifiedOwnAnnulReviewReceipt(receipt);
 need(index.period===receipt.body.period&&index.liquidationType===receipt.body.liquidationType&&index.scopeVersion===receipt.body.scopeVersion,'STATE_CHANGED');
 const affectedIds=new Set(receipt.affected.map(row=>row.contractId));
 need(!index.index.some(reference=>reference.confirmedContractIds.some(id=>affectedIds.has(id))),'CONFIRMED_AGAIN');
 const runs=[...new Set(receipt.affected.map(row=>row.runId))].sort(),people=new Map();
 for(const runId of runs){
  const reference=index.index.find(row=>row.id===runId);need(reference,'INCOMPLETE');
  const detail=await checkedDetail(index,reference,loadDetail);
  for(const affected of receipt.affected.filter(row=>row.runId===runId)){
   const state=detail.employees.find(row=>row.contractId===affected.contractId),person=detail.capture.saved.input.employees.find(row=>row.contractId===affected.contractId);
   need(reference.resultSha256===affected.resultSha256&&reference.liquidationDate===affected.liquidationDate&&state?.state==='annulled'&&state.version===affected.version&&state.liquidationVersion===affected.liquidationVersion&&person,'STATE_CHANGED');
   people.set(affected.contractId,{contractId:affected.contractId,employeeNumber:person.employeeNumber});
  }
 }
 need(people.size===receipt.affected.length,'INCOMPLETE');
 const selected=receipt.affected.filter(row=>row.liquidationDate===date).sort((a,b)=>a.contractId<b.contractId?-1:a.contractId>b.contractId?1:0);need(selected.length>0,'SELECTION_INVALID');
 return freeze({period:index.period,liquidationType:index.liquidationType,liquidationDate:date,selection:{kind:'contracts',values:selected.map(row=>row.contractId)},affected:selected.map(row=>people.get(row.contractId))});
}
