import {legalUuid,LEGAL_KINDS,LEGAL_ISSUERS} from './legal-registry-model.js';

export const MATTER_STATES=Object.freeze({
 assigned:'Asignado',in_review:'En revisión',returned:'Devuelto con observaciones',
 responded:'Respondido con evidencia',reviewed:'Revisado',closed:'Cerrado',cancelled:'Cancelado',
});
export const MATTER_TYPES=Object.freeze({
 revision_normativa:'Revisión normativa',consulta:'Consulta',dictamen:'Preparación de dictamen',proyecto:'Proyecto normativo',
});
export const MATTER_COMMANDS=Object.freeze({
 start_review:'Iniciar revisión',return:'Devolver con observaciones',respond:'Responder con evidencia',
 mark_reviewed:'Marcar revisado',close:'Cerrar asunto',cancel:'Cancelar asunto',
 reopen:'Reabrir asunto',reassign:'Cambiar coordinación',
});
export class MatterInputError extends Error{constructor(message='Revisá los datos del asunto.',field=''){super(message);this.name='MatterInputError';this.field=field;}}
const fail=(message,field='')=>{throw new MatterInputError(message,field);};
const exact=(v,keys)=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail('El asunto contiene campos no admitidos.');};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clean=(v,min,max,field,multi=false)=>{if(typeof v!=='string'||v!==v.normalize('NFC').trim()||v.length<min||v.length>max||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)||!multi&&/[\r\n\t]/.test(v))fail('Revisá este campo.',field);return v;};
const day=(v,field)=>{if(v==='')return v;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('La fecha no es válida.',field);const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v||v<'1900-01-01'||v>'2100-12-31')fail('La fecha no es válida.',field);return v;};
const instant=v=>typeof v==='string'&&v.length<=60&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));

export function normalizeMatterCommand(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.command!=='string')fail('Elegí una acción válida.');
 if(v.command==='create'){
  exact(v,['command','sourceNormId','sourceNormVersion','matterType','title','owningArea','responsibleId','nextAction','targetDate','reason']);
  if(!legalUuid(v.sourceNormId)||!integer(v.sourceNormVersion,1,1000)||!Object.hasOwn(MATTER_TYPES,v.matterType)||!legalUuid(v.responsibleId))fail('La fuente o la persona responsable no son válidas.');
  return {command:'create',sourceNormId:v.sourceNormId,sourceNormVersion:v.sourceNormVersion,matterType:v.matterType,
   title:clean(v.title,3,180,'title'),owningArea:clean(v.owningArea,2,120,'owningArea'),responsibleId:v.responsibleId,
   nextAction:clean(v.nextAction,3,500,'nextAction'),targetDate:day(v.targetDate,'targetDate'),reason:clean(v.reason,5,500,'reason')};
 }
 if(!Object.hasOwn(MATTER_COMMANDS,v.command))fail('La transición no está habilitada.');
 exact(v,['command','id','expectedRevision','responsibleId','owningArea','nextAction','targetDate','observations','evidenceArticleLabel','evidenceNote','reason']);
 if(!legalUuid(v.id)||!integer(v.expectedRevision,1,100)||!legalUuid(v.responsibleId))fail('La revisión del asunto no es válida.');
 const observations=clean(v.observations,0,2000,'observations',true),evidenceNote=clean(v.evidenceNote,0,2000,'evidenceNote',true);
 const evidenceArticleLabel=clean(v.evidenceArticleLabel,0,60,'evidenceArticleLabel');
 const normalized={command:v.command,id:v.id,expectedRevision:v.expectedRevision,responsibleId:v.responsibleId,
  owningArea:clean(v.owningArea,2,120,'owningArea'),nextAction:clean(v.nextAction,0,500,'nextAction'),
  targetDate:day(v.targetDate,'targetDate'),observations,evidenceArticleLabel,evidenceNote,reason:clean(v.reason,5,500,'reason')};
 if(['close','cancel'].includes(v.command)){if(normalized.nextAction!=='')fail('Cerrar o cancelar no debe dejar una próxima actuación.','nextAction');}
 else if(normalized.nextAction.length<3)fail('Indicá la próxima actuación.','nextAction');
 if(v.command==='return'){if(observations.length<5||evidenceArticleLabel||evidenceNote)fail('La devolución necesita observaciones y no una respuesta de evidencia.','observations');}
 else if(v.command==='respond'){if(observations||evidenceNote.length<5)fail('La respuesta necesita evidencia y no nuevas observaciones.','evidenceNote');}
 else if(observations||evidenceArticleLabel||evidenceNote)fail('Las observaciones o evidencia corresponden a la transición específica.');
 return normalized;
}

function member(v,eligible=false){exact(v,eligible?['id','label','eligible']:['id','label']);if(!legalUuid(v.id)||typeof v.label!=='string'||v.label.length<1||v.label.length>254||eligible&&typeof v.eligible!=='boolean')fail('La persona recibida no pudo verificarse.');}
function source(v){exact(v,['kind','issuer','number','year','title','currentVersion']);if(!Object.hasOwn(LEGAL_KINDS,v.kind)||!Object.hasOwn(LEGAL_ISSUERS,v.issuer)||typeof v.number!=='string'||v.number.length<1||v.number.length>30||!integer(v.year,1700,2200)||typeof v.title!=='string'||v.title.length<3||v.title.length>240||!integer(v.currentVersion,1,1000))fail('La fuente normativa no pudo verificarse.');}
function historyItem(h,currentVersion){
 exact(h,['revision','state','responsibleId','responsibleLabel','nextAction','targetDate','observations','evidenceArticleLabel','evidenceNote','reason','recordedBy','recordedAt']);
 if(!integer(h.revision,1,100)||!Object.hasOwn(MATTER_STATES,h.state)||!legalUuid(h.responsibleId)||typeof h.responsibleLabel!=='string'||h.responsibleLabel.length<1||h.responsibleLabel.length>254||!instant(h.recordedAt))fail('El historial del asunto no pudo verificarse.');
 clean(h.nextAction,0,500,'nextAction');day(h.targetDate,'targetDate');clean(h.observations,0,2000,'observations',true);clean(h.evidenceArticleLabel,0,60,'evidenceArticleLabel');clean(h.evidenceNote,0,2000,'evidenceNote',true);clean(h.reason,5,500,'reason');clean(h.recordedBy,1,254,'recordedBy');
 if(h.revision>currentVersion||h.state==='returned'&&h.observations.length<5||h.state==='responded'&&h.evidenceNote.length<5)fail('El historial es incoherente.');
}
function listRow(r){
 exact(r,['id','revision','state','matterType','title','owningArea','responsibleLabel','nextAction','targetDate','normId','normVersion','source','recordedAt']);
 if(!legalUuid(r.id)||!integer(r.revision,1,100)||!Object.hasOwn(MATTER_STATES,r.state)||!Object.hasOwn(MATTER_TYPES,r.matterType)||!legalUuid(r.normId)||!integer(r.normVersion,1,1000)||!instant(r.recordedAt))fail('La bandeja de asuntos no pudo verificarse.');
 clean(r.title,3,180,'title');clean(r.owningArea,2,120,'owningArea');clean(r.responsibleLabel,1,254,'responsibleLabel');clean(r.nextAction,0,500,'nextAction');day(r.targetDate,'targetDate');source(r.source);
}

function record(r){
 exact(r,['id','normId','normVersion','revision','state','matterType','title','owningArea','responsible','nextAction','targetDate','observations','evidenceArticleLabel','evidenceNote','reason','recordedBy','recordedAt','source','history']);
 if(!legalUuid(r.id)||!legalUuid(r.normId)||!integer(r.normVersion,1,1000)||!integer(r.revision,1,100)||!Object.hasOwn(MATTER_STATES,r.state)||!Object.hasOwn(MATTER_TYPES,r.matterType)||!instant(r.recordedAt))fail('El asunto recibido no pudo verificarse.');
 clean(r.title,3,180,'title');clean(r.owningArea,2,120,'owningArea');member(r.responsible,true);clean(r.nextAction,0,500,'nextAction');day(r.targetDate,'targetDate');
 clean(r.observations,0,2000,'observations',true);clean(r.evidenceArticleLabel,0,60,'evidenceArticleLabel');clean(r.evidenceNote,0,2000,'evidenceNote',true);clean(r.reason,5,500,'reason');clean(r.recordedBy,1,254,'recordedBy');source(r.source);
 if(!Array.isArray(r.history)||r.history.length!==r.revision)fail('El historial del asunto está incompleto.');
 r.history.forEach((h,i)=>{historyItem(h,r.revision);if(h.revision!==r.revision-i)fail('El historial no es contiguo.');});
 if(r.history.length){const h=r.history[0];if(h.state!==r.state||h.responsibleId!==r.responsible.id||h.responsibleLabel!==r.responsible.label||h.nextAction!==r.nextAction||h.targetDate!==r.targetDate||h.observations!==r.observations||h.evidenceArticleLabel!==r.evidenceArticleLabel||h.evidenceNote!==r.evidenceNote||h.reason!==r.reason||h.recordedBy!==r.recordedBy||h.recordedAt!==r.recordedAt)fail('La revisión actual no coincide con el historial.');}
 return r;
}
export function verifyMatterResponse(op,d){
 if(op==='bootstrap'){
  exact(d,['version','today','canManage','total','candidates']);
  if(d.version!=='legal-matter-bootstrap.v1'||typeof d.canManage!=='boolean'||!integer(d.total,0,1000)||!Array.isArray(d.candidates)||d.candidates.length>1000)fail('El inicio de asuntos no pudo verificarse.');
  day(d.today,'today');if(!d.canManage&&d.candidates.length)fail('El acceso de asuntos es incoherente.');
  const ids=new Set();let previous='';for(const c of d.candidates){member(c);if(ids.has(c.id)||c.id<=previous)fail('La lista de responsables no es verificable.');ids.add(c.id);previous=c.id;}
  return d;
 }
 if(op==='save'||op==='attempt'){
  exact(d,['version','id','revision','state','replayed']);
  if(d.version!=='legal-matter-receipt.v1'||!legalUuid(d.id)||!integer(d.revision,1,100)||!Object.hasOwn(MATTER_STATES,d.state)||typeof d.replayed!=='boolean')fail('La confirmación del asunto no pudo verificarse.');
  return d;
 }
 if(op==='list'){
  exact(d,['version','today','canManage','total','page','pageSize','counts','rows']);
  if(d.version!=='legal-matter-list.v1'||typeof d.canManage!=='boolean'||!integer(d.total,0,5000)||!integer(d.page,1,200)||d.pageSize!==25||!Array.isArray(d.rows)||d.rows.length>25)fail('La bandeja de asuntos no pudo verificarse.');
  day(d.today,'today');exact(d.counts,['assigned','inReview','returned','responded','reviewed','closed','cancelled']);
  for(const n of Object.values(d.counts))if(!integer(n,0,5000))fail('Los conteos de asuntos no pudieron verificarse.');
  if(Object.values(d.counts).reduce((a,b)=>a+b,0)!==d.total)fail('Los conteos de asuntos no reconcilian.');
  const seen=new Set();for(const r of d.rows){listRow(r);if(seen.has(r.id))fail('Hay asuntos duplicados.');seen.add(r.id);}return d;
 }

 if(op==='detail'){
  exact(d,['version','today','canManage','record','candidates','sourceArticles']);
  if(d.version!=='legal-matter-detail.v1'||typeof d.canManage!=='boolean'||!Array.isArray(d.candidates)||d.candidates.length>1000||!Array.isArray(d.sourceArticles)||d.sourceArticles.length>150)fail('El detalle del asunto no pudo verificarse.');
  day(d.today,'today');record(d.record);
  if(!d.canManage&&d.candidates.length)fail('Los permisos del asunto son incoherentes.');
  const ids=new Set();let previous='';for(const c of d.candidates){member(c);if(ids.has(c.id)||c.id<=previous)fail('La lista de responsables no es verificable.');ids.add(c.id);previous=c.id;}
  const labels=new Set();for(const label of d.sourceArticles){clean(label,1,60,'articleLabel');if(labels.has(label.toLowerCase()))fail('Hay artículos fuente duplicados.');labels.add(label.toLowerCase());}
  if(d.record.evidenceArticleLabel&&!labels.has(d.record.evidenceArticleLabel.toLowerCase()))fail('La evidencia actual no existe en la versión fuente.');
  return d;
 }
 fail('La respuesta del asunto no pudo verificarse.');
}
export function commandForState(state){
 if(!Object.hasOwn(MATTER_STATES,state))fail('Estado no válido.');
 return Object.freeze({
  assigned:['start_review','reassign','cancel'],
  in_review:['return','mark_reviewed','reassign','cancel'],
  returned:['respond','reassign','cancel'],
  responded:['mark_reviewed','reassign','cancel'],
  reviewed:['return','close','reassign','cancel'],
  closed:['reopen'],
  cancelled:['reopen'],
 }[state]);
}
export function blankMatterFromNorm(record,responsibleId=''){
 if(!record||!legalUuid(record.id)||!integer(record.version,1,1000))fail('Abrí una versión normativa válida.');
 return {command:'create',sourceNormId:record.id,sourceNormVersion:record.version,matterType:'revision_normativa',title:record.metadata?.title||'',owningArea:'Jurídica',responsibleId,nextAction:'',targetDate:'',reason:''};
}

export const NEXT_STATE=Object.freeze({
 assigned:Object.freeze({start_review:'in_review',reassign:'assigned',cancel:'cancelled'}),
 in_review:Object.freeze({return:'returned',mark_reviewed:'reviewed',reassign:'in_review',cancel:'cancelled'}),
 returned:Object.freeze({respond:'responded',reassign:'returned',cancel:'cancelled'}),
 responded:Object.freeze({mark_reviewed:'reviewed',reassign:'responded',cancel:'cancelled'}),
 reviewed:Object.freeze({return:'returned',close:'closed',reassign:'reviewed',cancel:'cancelled'}),
 closed:Object.freeze({reopen:'assigned'}),cancelled:Object.freeze({reopen:'assigned'}),
});
export function targetState(state,command){if(!Object.hasOwn(NEXT_STATE,state)||!Object.hasOwn(NEXT_STATE[state],command))fail('La transición no corresponde al estado actual.');return NEXT_STATE[state][command];}
export function sameMatterDetail(a,b){verifyMatterResponse('detail',a);verifyMatterResponse('detail',b);return JSON.stringify(a)===JSON.stringify(b);}
