import {legalUuid,exactLegalObject} from './legal-registry-model.js';
export const LEGAL_ALERT_CATEGORIES=Object.freeze({all:'Todos',past:'Fecha pasada',today:'Hoy',next7:'Próximos 7 días',later:'Más adelante',undated:'Sin fecha',resolved:'Cerrados o cancelados'});
export const LEGAL_ALERT_SOURCES=Object.freeze({all:'Todas las fuentes',matter:'Asuntos jurídicos',followup:'Seguimientos normativos',contract_obligation:'Obligaciones contractuales'});
export class LegalAlertCenterError extends Error{constructor(message='El centro de alertas no pudo verificarse.'){super(message);this.name='LegalAlertCenterError';}}
const fail=()=>{throw new LegalAlertCenterError();},exact=(v,k)=>{try{exactLegalObject(v,k);}catch{fail();}},integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b,instant=v=>typeof v==='string'&&v.length<=60&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text=(v,max)=>typeof v==='string'&&v.length<=max;
const MATTER_STATES=Object.freeze({assigned:'Asignado',in_review:'En revisión',returned:'Devuelto con observaciones',responded:'Respondido con evidencia',reviewed:'Revisado',closed:'Cerrado',cancelled:'Cancelado'});
export function legalAlertStatusLabel(row){return (row.sourceType==='matter'?MATTER_STATES:row.sourceType==='followup'?{open:'Abierto',done:'Cerrado',cancelled:'Cancelado'}:{open:'Abierta',fulfilled_observed:'Cumplimiento observado',breached_observed:'Incumplimiento observado',waived:'Dispensada',cancelled:'Cancelada'})[row.status];}
const ROW_KEYS=['sourceType','itemId','itemVersion','title','dueDate','status','responsibleLabel','sourceId','sourceVersion','sourceKind','sourceNumber','sourceYear','sourceTitle','recordedAt'];
const COORDINATION_KEYS=['responsibleId','responsibleEligible','nextAction','coordinationRevision','coordinationFollowupVersion','owningArea'];
export function verifyLegalAlertCenterResponse(d){return verify(d,1);}
export function verifyLegalAlertCenterResponseV2(d){return verify(d,2);}
function verify(d,version){
 exact(d,['version','today','timezone','limit','population','revision','rows']);
 if(d.version!=='legal-alert-center.v'+version||!date(d.today)||d.timezone!=='America/Argentina/Mendoza'||d.limit!==1500||!integer(d.population,0,1500)||!/^[a-f0-9]{64}$/.test(d.revision||'')||!Array.isArray(d.rows)||d.rows.length!==d.population)fail();
 const ids=new Set();
 for(const r of d.rows){
  exact(r,version===2?[...ROW_KEYS,...COORDINATION_KEYS]:ROW_KEYS);
  const norm=r.sourceType==='followup'||r.sourceType==='matter';
  if(!(version===2?['followup','contract_obligation','matter']:['followup','contract_obligation']).includes(r.sourceType)||!legalUuid(r.itemId)||!integer(r.itemVersion,1,100)||!text(r.title,240)||!r.title||!(date(r.dueDate)||r.dueDate==='')||typeof r.status!=='string'||!text(r.responsibleLabel,254)||!legalUuid(r.sourceId)||!integer(r.sourceVersion,1,norm?1000:100)||!text(r.sourceKind,60)||!text(r.sourceNumber,40)||!integer(r.sourceYear,norm?1700:1900,norm?2200:2100)||!text(r.sourceTitle,240)||!instant(r.recordedAt))fail();
  if(r.sourceType==='followup'&&!['open','done','cancelled'].includes(r.status))fail();
  if(r.sourceType==='contract_obligation'&&!['open','fulfilled_observed','breached_observed','waived','cancelled'].includes(r.status))fail();
  if(r.sourceType==='matter'&&!Object.hasOwn(MATTER_STATES,r.status))fail();
  if(version===2)verifyCoordination(r);
  const key=r.sourceType+':'+r.itemId;if(ids.has(key))fail();ids.add(key);
 }
 return d;
}
function verifyCoordination(r){
 if(!(r.responsibleId===null? r.responsibleEligible===null:legalUuid(r.responsibleId)&&typeof r.responsibleEligible==='boolean')||!text(r.nextAction,500)||!text(r.owningArea,120)||!integer(r.coordinationRevision,0,100)||!integer(r.coordinationFollowupVersion,0,r.itemVersion))fail();
 if(r.sourceType==='contract_obligation'){
  if(r.responsibleId!==null||r.nextAction!==''||r.owningArea!==''||r.coordinationRevision!==0||r.coordinationFollowupVersion!==0)fail();
 }else if(r.sourceType==='matter'){
  if(r.responsibleId===null||!r.responsibleLabel||r.owningArea.length<2||r.coordinationRevision!==0||r.coordinationFollowupVersion!==0)fail();
  if(['closed','cancelled'].includes(r.status)?r.nextAction!=='':r.nextAction.length<3)fail();
 }else{
  if(r.owningArea!==''||(r.responsibleId===null?r.responsibleLabel!=='':!r.responsibleLabel))fail();
  if(r.coordinationRevision===0){if(r.coordinationFollowupVersion!==0||r.responsibleId!==null||r.nextAction!=='')fail();}
  else if(r.coordinationFollowupVersion===0)fail();
 }
}
export function legalAlertCoordinationNeedsReview(row){return row.sourceType==='followup'&&row.coordinationRevision>0&&row.coordinationFollowupVersion!==row.itemVersion;}
export function legalAlertCategory(row,today){
 if(row.sourceType==='matter'?['closed','cancelled'].includes(row.status):row.status!=='open')return'resolved';
 if(!row.dueDate)return'undated';
 if(row.dueDate<today)return'past';
 if(row.dueDate===today)return'today';
 const days=Math.round((new Date(row.dueDate+'T00:00:00Z')-new Date(today+'T00:00:00Z'))/86400000);
 return days<=7?'next7':'later';
}
export function legalAlertCounts(rows,today){const out={all:rows.length,past:0,today:0,next7:0,later:0,undated:0,resolved:0};for(const r of rows)out[legalAlertCategory(r,today)]++;return out;}
export function filterLegalAlerts(rows,today,{category='all',source='all',query=''}={}){
 const q=String(query||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
 return rows.filter(r=>(category==='all'||legalAlertCategory(r,today)===category)&&(source==='all'||r.sourceType===source)&&(!q||[r.title,r.responsibleLabel,r.sourceNumber,r.sourceYear,r.sourceTitle,r.sourceKind,r.owningArea,r.nextAction,legalAlertStatusLabel(r)].join(' ').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)));
}
