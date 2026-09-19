import {bankReportData,bankReportFilter,bankHasIssues,bankNames,bankReportRevision} from './payroll-bank-generator-model.js';
export const BANK_REVIEW_VERSION='payroll-bank-control-review.v1';
export const BANK_REVIEW_LABELS=Object.freeze({SHARED_CBU:'CBU informado en más de un legajo',ZERO_NET:'Neto informado igual a cero',NEGATIVE_NET:'Neto informado negativo'});
const fail=()=>{throw Error('No se pudo conciliar el control bancario con su fuente.');};
const cents=value=>BigInt(value.replace('.',''));
function money(value){const negative=value<0n,raw=(negative?-value:value).toString().padStart(3,'0');return (negative?'-':'')+raw.slice(0,-2)+'.'+raw.slice(-2);}
function aggregate(rows){let sum=0n,missing=0;for(const r of rows){if(r.netAmount===null)missing++;else sum+=cents(r.netAmount);}return{rows:rows.length,observed:rows.filter(bankHasIssues).length,missingAmounts:missing,knownTotal:money(sum),total:missing?null:money(sum)};}
export function bankReportReconciliation(data){
 bankReportData({ok:true,data},{resource:'report',datasetId:data?.dataset?.datasetId});
 const cbus=new Map();for(const r of data.rows)if(typeof r.cbu==='string'&&/^\d{22}$/.test(r.cbu)){const group=cbus.get(r.cbu)||[];group.push(r.legajo);cbus.set(r.cbu,group);}
 const shared=[...cbus.values()].filter(group=>group.length>1),sharedIds=new Set(shared.flat()),rowChecks={};
 for(const r of data.rows){const codes=[];if(sharedIds.has(r.legajo))codes.push('SHARED_CBU');if(r.netAmount==='0.00')codes.push('ZERO_NET');if(r.netAmount!==null&&cents(r.netAmount)<0n)codes.push('NEGATIVE_NET');Object.defineProperty(rowChecks,r.legajo,{value:Object.freeze(codes),enumerable:true});}
 const groupBy=key=>{const groups=new Map();for(const r of data.rows){const id=r[key];if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}return [...groups].sort(([a],[b])=>String(a??'').localeCompare(String(b??''),'es-AR')).map(([key,rows])=>({key,...aggregate(rows)}));};
 const banks=groupBy('bankKey').map(g=>({...g,label:g.key===null?'Banco sin identificar':bankNames[g.key]})),jurisdictions=groupBy('jurisdiction').map(g=>({...g,label:g.key===null?'Jurisdicción no informada':'Jurisdicción '+g.key}));
 const total=aggregate(data.rows);for(const grouped of [banks,jurisdictions]){if(grouped.reduce((n,g)=>n+g.rows,0)!==total.rows||money(grouped.reduce((n,g)=>n+cents(g.knownTotal),0n))!==total.knownTotal||grouped.reduce((n,g)=>n+g.missingAmounts,0)!==total.missingAmounts)fail();}
 return Object.freeze({version:BANK_REVIEW_VERSION,scope:'complete_authorized_report',...total,banks,jurisdictions,sharedCbuGroups:shared.length,sharedCbuRows:sharedIds.size,zeroNetRows:data.rows.filter(r=>r.netAmount==='0.00').length,negativeNetRows:data.rows.filter(r=>r.netAmount!==null&&cents(r.netAmount)<0n).length,rowChecks:Object.freeze(rowChecks),paymentApproved:false});
}
export function bankControlNotes(review,row){return (review.rowChecks[row.legajo]||[]).map(code=>BANK_REVIEW_LABELS[code]).join(' · ');}
export function assertBankReportUnchanged(original,fresh){
 bankReportData({ok:true, data:original},{resource:'report',datasetId:original?.dataset?.datasetId});bankReportData({ok:true,data:fresh},{resource:'report',datasetId:original.dataset.datasetId});
 if(bankReportRevision(original)!==bankReportRevision(fresh)||JSON.stringify(original.rows)!==JSON.stringify(fresh.rows)||JSON.stringify(original.scope)!==JSON.stringify(fresh.scope))throw Object.assign(Error('La fuente cambió. Volvé a generar la planilla antes de descargar.'),{code:'SOURCE_CHANGED'});
 return fresh;
}
export function bankControlSelection(data,view){const checked=bankReportFilter(data,view?.filters);if(checked.rows.length!==view?.rows?.length||checked.rows.some((r,i)=>r!==view.rows[i])||['total','knownTotal','missingAmounts','observed'].some(k=>checked[k]!==view[k]))fail();return checked;}
