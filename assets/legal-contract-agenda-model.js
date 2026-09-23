import {legalUuid,exactLegalObject} from './legal-registry-model.js';
export const CONTRACT_AGENDA_CATEGORIES=Object.freeze({all:'Todos',past:'Fecha pasada',today:'Hoy',next7:'Próximos 7 días',later:'Más adelante',undated:'Sin fecha',resolved:'Resueltos'});
export class ContractAgendaError extends Error{constructor(message='La agenda contractual no pudo verificarse.'){super(message);this.name='ContractAgendaError';}}
const fail=()=>{throw new ContractAgendaError();},exact=(v,k)=>{try{exactLegalObject(v,k);}catch{fail();}},integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b,instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function verifyContractAgendaResponse(d){
 exact(d,['version','today','timezone','limit','population','revision','rows']);
 if(d.version!=='legal-contract-agenda.v1'||!date(d.today)||d.timezone!=='America/Argentina/Mendoza'||d.limit!==1000||!integer(d.population,0,1000)||!/^[a-f0-9]{64}$/.test(d.revision||'')||!Array.isArray(d.rows)||d.rows.length!==d.population)fail();
 const ids=new Set();
 for(const r of d.rows){
  exact(r,['id','sequence','status','obligationType','title','clauseLocator','sourcePage','dueDate','dueBasis','currency','amountMinor','unit','responsibleLabel','evidenceDocumentId','recordedAt','contractId','contractNumber','contractYear','contractType','contractRevision','contractState','contractTitle']);
  if(!legalUuid(r.id)||ids.has(r.id)||!integer(r.sequence,1,100)||!['open','fulfilled_observed','breached_observed','waived','cancelled'].includes(r.status)||!['delivery','payment','milestone','guarantee','documentation','service_level','other'].includes(r.obligationType)||typeof r.title!=='string'||typeof r.clauseLocator!=='string'||r.sourcePage!==null&&!integer(r.sourcePage,1,9999)||!(date(r.dueDate)||r.dueDate==='')||!['NONE','ARS','USD','EUR'].includes(r.currency)||r.amountMinor!==null&&!integer(r.amountMinor,0,999999999999999)||typeof r.responsibleLabel!=='string'||r.evidenceDocumentId!==null&&!legalUuid(r.evidenceDocumentId)||!instant(r.recordedAt)||!legalUuid(r.contractId)||typeof r.contractNumber!=='string'||!integer(r.contractYear,1900,2100)||!integer(r.contractRevision,1,100)||typeof r.contractTitle!=='string')fail();
  ids.add(r.id);
 }
 return d;
}
export function contractAgendaCategory(row,today){
 if(row.status!=='open')return'resolved';
 if(!row.dueDate)return'undated';
 if(row.dueDate<today)return'past';
 if(row.dueDate===today)return'today';
 const base=new Date(today+'T00:00:00Z'),d=new Date(row.dueDate+'T00:00:00Z'),days=Math.round((d-base)/86400000);
 return days<=7?'next7':'later';
}
export function contractAgendaCounts(rows,today){const out={all:rows.length,past:0,today:0,next7:0,later:0,undated:0,resolved:0};for(const r of rows)out[contractAgendaCategory(r,today)]++;return out;}
export function filterContractAgenda(rows,today,category='all',query=''){const q=String(query||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();return rows.filter(r=>(category==='all'||contractAgendaCategory(r,today)===category)&&(!q||[r.title,r.clauseLocator,r.responsibleLabel,r.contractNumber,r.contractYear,r.contractTitle].join(' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)));}
