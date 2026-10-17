// Local evidence only. No uploads, database writes, permissions or salary changes.
import {verifyBudgetPayrollRoster} from './budget-payroll-model.js';
export const BUDGET_HISTORY_MAX_BYTES=1500000;
const known=Object.freeze([Object.freeze({datasetId:'72363f49-e2ab-4f6d-a3a9-d4da3fb5a2e9',date:'2026-08-31',period:2026,month:8,type:'M',company:'101',sourceDatabase:'grh_junin',sourceFooter:'2026-08-19 15:17:09',closedFlag:null,total:854,sourceSha256:'bced0b174aab977b085fc977723f7edd8fb9e473adcfbe237070e8ecef982aa7',logicalSha256:'3475c581e36d62fca0cb341dd73d05b698215fe85c1825dd930a6c53723ab612',payloadHash:'f087bcaf62808a73b32051de6936422718fb0cbbe68b19250d97e142854cf400',packageSha256:'933d6b2f7f7ff32d6d517dcd9b2f68ae87f06eda8fe2f25e194bb92cbcbce63a'})]);
const verified=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function historyFail(code){throw Object.assign(Error(code),{code});}
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...k].sort().join('|');
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const clean=v=>v===null||typeof v==='string'&&v.length<=400&&!/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v);
export function knownBudgetHistory(roster){verifyBudgetPayrollRoster(roster);return known.find(d=>d.datasetId===roster.datasetId&&d.payloadHash===roster.payloadHash)??null;}
export async function readBudgetHistoricalEvidence(bytes,raw,descriptor=knownBudgetHistory(raw)){
 const roster=structuredClone(verifyBudgetPayrollRoster(raw));
 if(!descriptor)historyFail('HISTORY_NOT_REGISTERED');const d=structuredClone(descriptor);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>BUDGET_HISTORY_MAX_BYTES)historyFail('HISTORY_SIZE');
 if(!['sourceSha256','logicalSha256','payloadHash','packageSha256'].every(k=>sha(d[k])))historyFail('HISTORY_CONTRACT');
 if(![null,0,1].includes(d.closedFlag)||!Number.isInteger(d.period)||d.period<1900||d.period>2100||!Number.isInteger(d.month)||d.month<1||d.month>12||typeof d.company!=='string'||!/^\d{1,12}$/.test(d.company))historyFail('HISTORY_CONTRACT');
 bytes=Uint8Array.from(bytes);
 if(d.datasetId!==roster.datasetId||d.payloadHash!==roster.payloadHash||d.date!==roster.date||d.type!==roster.type||d.total!==roster.total||({0:'open',1:'closed'})[d.closedFlag]!==undefined&&({0:'open',1:'closed'})[d.closedFlag]!==roster.closureStatus||d.closedFlag===null&&roster.closureStatus!=='unknown')historyFail('HISTORY_CONTEXT');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==d.packageSha256)historyFail('HISTORY_HASH');let p;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{historyFail('HISTORY_CONTRACT');}
 if(!exact(p,['version','sourceSha256','logicalSha256','sourceDatabase','sourceFooter','sourceTable','company','date','period','month','type','closedFlag','rows'])||p.version!=='budget-position-source.v1'||p.sourceTable!=='histolegajo')historyFail('HISTORY_CONTRACT');
 for(const k of ['sourceSha256','logicalSha256','sourceDatabase','sourceFooter','company','date','period','month','type','closedFlag'])if(p[k]!==d[k])historyFail('HISTORY_CONTEXT');
 if(!Array.isArray(p.rows)||p.rows.length!==roster.total||p.rows.length>2000)historyFail('HISTORY_POPULATION');
 const seen=new Set(),ids=new Set(),expected=new Set(roster.rows.map(r=>r.number));
 for(const r of p.rows){if(!exact(r,['number','recordId','role','structure','detail'])||typeof r.number!=='string'||!/^\d{1,12}$/.test(r.number)||typeof r.recordId!=='string'||!/^\d{1,12}$/.test(r.recordId)||seen.has(r.number)||ids.has(r.recordId)||!expected.has(r.number)||!['role','structure','detail'].every(k=>clean(r[k])))historyFail('HISTORY_POPULATION');seen.add(r.number);ids.add(r.recordId);}
 if(seen.size!==expected.size)historyFail('HISTORY_POPULATION');
 const result=freeze({descriptor:d,tenantId:roster.tenantId,rosterHash:roster.reportHash,rows:p.rows});verified.add(result);return result;
}
export function verifiedBudgetHistory(value){if(!verified.has(value))historyFail('HISTORY_UNVERIFIED');return value;}
