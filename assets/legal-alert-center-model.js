import {legalUuid,exactLegalObject} from './legal-registry-model.js';
export const LEGAL_ALERT_CATEGORIES=Object.freeze({all:'Todos',past:'Fecha pasada',today:'Hoy',next7:'Próximos 7 días',later:'Más adelante',undated:'Sin fecha',resolved:'Resueltos'});
export const LEGAL_ALERT_SOURCES=Object.freeze({all:'Todas las fuentes',followup:'Seguimientos normativos',contract_obligation:'Obligaciones contractuales'});
export class LegalAlertCenterError extends Error{constructor(message='El centro de alertas no pudo verificarse.'){super(message);this.name='LegalAlertCenterError';}}
const fail=()=>{throw new LegalAlertCenterError();},exact=(v,k)=>{try{exactLegalObject(v,k);}catch{fail();}},integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b,instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function verifyLegalAlertCenterResponse(d){
 exact(d,['version','today','timezone','limit','population','revision','rows']);
 if(d.version!=='legal-alert-center.v1'||!/^\d{4}-\d{2}-\d{2}$/.test(d.today)||d.timezone!=='America/Argentina/Mendoza'||d.limit!==1500||!integer(d.population,0,1500)||!/^[a-f0-9]{64}$/.test(d.revision||'')||!Array.isArray(d.rows)||d.rows.length!==d.population)fail();
 const ids=new Set();
 for(const r of d.rows){
  exact(r,['sourceType','itemId','itemVersion','title','dueDate','status','responsibleLabel','sourceId','sourceVersion','sourceKind','sourceNumber','sourceYear','sourceTitle','recordedAt']);
  if(!['followup','contract_obligation'].includes(r.sourceType)||!legalUuid(r.itemId)||!integer(r.itemVersion,1,100)||typeof r.title!=='string'||!(/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)||r.dueDate==='')||typeof r.status!=='string'||typeof r.responsibleLabel!=='string'||!legalUuid(r.sourceId)||!integer(r.sourceVersion,1,1000)||typeof r.sourceKind!=='string'||typeof r.sourceNumber!=='string'||!integer(r.sourceYear,1900,2100)||typeof r.sourceTitle!=='string'||!instant(r.recordedAt))fail();
  if(r.sourceType==='followup'&&!['open','done','cancelled'].includes(r.status))fail();
  if(r.sourceType==='contract_obligation'&&!['open','fulfilled_observed','breached_observed','waived','cancelled'].includes(r.status))fail();
  const key=r.sourceType+':'+r.itemId;if(ids.has(key))fail();ids.add(key);
 }
 return d;
}
export function legalAlertCategory(row,today){
 if(row.status!=='open')return'resolved';
 if(!row.dueDate)return'undated';
 if(row.dueDate<today)return'past';
 if(row.dueDate===today)return'today';
 const days=Math.round((new Date(row.dueDate+'T00:00:00Z')-new Date(today+'T00:00:00Z'))/86400000);
 return days<=7?'next7':'later';
}
export function legalAlertCounts(rows,today){const out={all:rows.length,past:0,today:0,next7:0,later:0,undated:0,resolved:0};for(const r of rows)out[legalAlertCategory(r,today)]++;return out;}
export function filterLegalAlerts(rows,today,{category='all',source='all',query=''}={}){
 const q=String(query||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
 return rows.filter(r=>(category==='all'||legalAlertCategory(r,today)===category)&&(source==='all'||r.sourceType===source)&&(!q||[r.title,r.responsibleLabel,r.sourceNumber,r.sourceYear,r.sourceTitle,r.sourceKind].join(' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)));
}
