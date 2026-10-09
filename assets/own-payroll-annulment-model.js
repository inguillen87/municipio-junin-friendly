import {salaryExact,salaryHash,salaryKey,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {OWN_LIQ_REVIEW,ownLiquidationDetail,ownLiquidationReceipt,verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from './own-payroll-liquidation-model.js';
import {ownCloseSelection} from './own-payroll-close-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {decimal,exactAdd,quantize} from './own-payroll-exact.js';
export const OWN_ANNUL_ACCESS=OWN_LIQ_REVIEW;
const fail=()=>{throw Error('No se pudo verificar la anulación completa del período y tipo elegidos.');};
const require=v=>{if(!v)fail();};
const exact=(v,k)=>require(salaryExact(v,k));
const period=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
export function ownAnnulCommand(v){
 exact(v,['period','liquidationType','scopeVersion','stateVersion','selection','reason','reviewConfirmed']);
 require(period(v.period)&&Object.hasOwn(OWN_RUN_TYPES,v.liquidationType)&&salaryHash(v.scopeVersion)&&salaryHash(v.stateVersion)&&v.reviewConfirmed===true&&typeof v.reason==='string'&&v.reason===v.reason.trim()&&v.reason.length>=10&&v.reason.length<=500&&!/[\u0000-\u001f\u007f]/u.test(v.reason));
 return {...v,selection:ownCloseSelection(v.selection)};
}
export function ownAnnulDetail(v){
 exact(v,['version','period','liquidationType','scopeVersion','stateVersion','runs','closed','complete']);
 require(v.version==='own-annul-detail.v1'&&period(v.period)&&Object.hasOwn(OWN_RUN_TYPES,v.liquidationType)&&salaryHash(v.scopeVersion)&&salaryHash(v.stateVersion)&&v.complete===true&&Array.isArray(v.runs)&&v.runs.length<=1000&&Array.isArray(v.closed)&&v.closed.length<=10000);
 const runs=new Map();for(const r of v.runs){ownLiquidationDetail(r);require(!runs.has(r.id)&&r.capture.body.period===v.period&&r.capture.body.liquidationType===v.liquidationType&&r.scopeVersion===v.scopeVersion);runs.set(r.id,r);}
 const closed=new Set();for(const c of v.closed){exact(c,['runId','contractId','groupId']);const r=runs.get(c.runId);require(r&&salaryUuid(c.groupId)&&r.employees.some(e=>e.contractId===c.contractId&&e.state==='confirmed')&&!closed.has(c.runId+':'+c.contractId));closed.add(c.runId+':'+c.contractId);}
 // A contract can have only one current confirmed liquidation of this type.
 const ids=new Set();for(const r of v.runs)for(const e of r.employees)if(e.state==='confirmed'){require(!ids.has(e.contractId));ids.add(e.contractId);}
 return v;
}
export function ownAnnulRows(detail){
 ownAnnulDetail(detail);const rows=[];
 for(const r of detail.runs)for(const e of r.employees)if(e.state==='confirmed'){
  const p=r.capture.saved.input.employees.find(p=>p.contractId===e.contractId),t=r.capture.saved.result.employeeTotals.find(t=>t.contractId===e.contractId),closed=detail.closed.find(c=>c.runId===r.id&&c.contractId===e.contractId);
  rows.push({...p,runId:r.id,resultSha256:r.capture.saved.resultSha256,liquidationDate:r.capture.body.liquidationDate??null,version:e.version,liquidationVersion:e.liquidationVersion,groupId:closed?.groupId??null,allowed:e.allowedCommands.includes('annul')&&!closed,totals:t,precision:r.capture.saved.input.totalsPrecision});
 }
 return rows.sort((a,b)=>a.contractId.localeCompare(b.contractId));
}
export function ownAnnulReview(detail,selection){
 const chosen=ownCloseSelection(selection),all=ownAnnulRows(detail),field={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[chosen.kind];
 const rows=all.filter(r=>chosen.kind==='all'||chosen.values.includes(r[field]));require(rows.length>0&&chosen.values.every(v=>rows.some(r=>r[field]===v)));
 const precision=Math.max(...rows.map(r=>r.precision)),totals=Object.fromEntries(['gross','deduction','net'].map(k=>[k,quantize(rows.reduce((s,r)=>exactAdd(s,decimal(r.totals[k])),decimal('0')),{precision,mode:'exact'}).amount]));
 return {selection:chosen,rows,count:rows.length,runCount:new Set(rows.map(r=>r.runId)).size,allowed:rows.every(r=>r.allowed),totals,complete:true};
}
export function ownAnnulAttempt(key,body,accessKey,review){
 require(salaryKey(key)&&typeof accessKey==='string'&&accessKey.length>0&&review?.allowed&&review.complete===true);
 const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
 return freeze({key,body:structuredClone(ownAnnulCommand(body)),accessKey,expected:review.rows.map(r=>({runId:r.runId,resultSha256:r.resultSha256,contractId:r.contractId,liquidationDate:r.liquidationDate,version:r.version+1,liquidationVersion:r.liquidationVersion}))});
}
export function ownAnnulReceipt(v,attempt=null){
 exact(v,['version','id','key','body','bodySha256','affected','receipts','recordedAt','replayed']);const body=ownAnnulCommand(v.body);
 require(v.version==='own-annul-receipt.v1'&&salaryUuid(v.id)&&salaryKey(v.key)&&salaryHash(v.bodySha256)&&typeof v.recordedAt==='string'&&Number.isFinite(Date.parse(v.recordedAt))&&typeof v.replayed==='boolean'&&Array.isArray(v.affected)&&v.affected.length>0&&v.affected.length<=10000&&Array.isArray(v.receipts)&&v.receipts.length>0&&v.receipts.length<=1000);
 const pairs=new Set(),ids=new Set(),runs=new Map(),eventIds=new Set(),eventKeys=new Set();for(const r of v.receipts){ownLiquidationReceipt(r);require(r.body.command==='annul'&&r.body.selection.kind==='contracts'&&r.body.reason===body.reason&&r.body.scopeVersion===body.scopeVersion&&!runs.has(r.runId)&&!eventIds.has(r.id)&&!eventKeys.has(r.key));runs.set(r.runId,r);eventIds.add(r.id);eventKeys.add(r.key);}
 for(const e of v.affected){exact(e,['runId','resultSha256','contractId','liquidationDate','version','liquidationVersion']);require(!ids.has(e.contractId));ids.add(e.contractId);require(e.liquidationDate===null||ownRunDate(e.liquidationDate));
  const r=runs.get(e.runId),a=r?.affected.find(a=>a.contractId===e.contractId);require(a&&r.resultSha256===e.resultSha256&&a.version===e.version&&a.liquidationVersion===e.liquidationVersion);pairs.add(e.runId+':'+e.contractId);
 }
 require([...runs.values()].every(r=>r.affected.every(a=>pairs.has(r.runId+':'+a.contractId))));
 if(body.selection.kind==='contracts')require(salarySerialized([...ids].sort())===salarySerialized(body.selection.values));
 if(attempt)require(v.key===attempt.key&&salarySerialized(body)===salarySerialized(attempt.body)&&salarySerialized([...v.affected].sort((a,b)=>a.contractId.localeCompare(b.contractId)))===salarySerialized([...attempt.expected].sort((a,b)=>a.contractId.localeCompare(b.contractId))));
 return v;
}
const digest=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v))))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function verifiedOwnAnnulDetail(v){ownAnnulDetail(v);for(const r of v.runs)await verifiedOwnLiquidationDetail(r);return v;}
export async function verifiedOwnAnnulReceipt(v,attempt=null){ownAnnulReceipt(v,attempt);require(await digest(v.body)===v.bodySha256);for(const r of v.receipts)await verifiedOwnLiquidationReceipt(r);return v;}
export function ownAnnulNextPreparation(detail,receipt,liquidationDate){
 ownAnnulDetail(detail);ownAnnulReceipt(receipt);require(detail.period===receipt.body.period&&detail.liquidationType===receipt.body.liquidationType&&(liquidationDate===null||ownRunDate(liquidationDate)));
 const affected=receipt.affected.filter(e=>e.liquidationDate===liquidationDate);require(affected.length>0);
 for(const e of receipt.affected){const r=detail.runs.find(r=>r.id===e.runId),d=r?.employees.find(d=>d.contractId===e.contractId);require(r&&r.capture.saved.resultSha256===e.resultSha256&&(r.capture.body.liquidationDate??null)===e.liquidationDate&&d?.state==='annulled'&&d.version===e.version&&d.liquidationVersion===e.liquidationVersion&&!detail.runs.some(other=>other.employees.some(d=>d.contractId===e.contractId&&d.state==='confirmed')));}
 return {period:detail.period,liquidationType:detail.liquidationType,liquidationDate,selection:{kind:'contracts',values:affected.map(e=>e.contractId).sort()},affected:affected.map(e=>({contractId:e.contractId,employeeNumber:detail.runs.find(r=>r.id===e.runId).capture.saved.input.employees.find(p=>p.contractId===e.contractId).employeeNumber}))};
}
