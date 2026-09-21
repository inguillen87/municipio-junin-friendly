import {legalUuid} from './legal-registry-model.js';

export const CASE_STATES=Object.freeze({open:'Abierto',closed:'Cerrado'});
export const CASE_COMMANDS=Object.freeze({revise:'Actualizar carátula',close:'Cerrar expediente',reopen:'Reabrir expediente'});
export class CaseInputError extends Error{constructor(message='Revisá los datos del expediente.',field=''){super(message);this.name='CaseInputError';this.field=field;}}
const fail=(m,f='')=>{throw new CaseInputError(m,f);};
const exact=(v,keys)=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail('El expediente contiene campos no admitidos.');};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,min,max,field)=>{if(typeof v!=='string'||v!==v.normalize('NFC').trim()||v.length<min||v.length>max||/[<>\u0000-\u001f\u007f]/.test(v))fail('Revisá este campo.',field);return v;};
const instant=v=>typeof v==='string'&&v.length<=60&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const member=(v,eligible=false)=>{exact(v,eligible?['id','label','eligible']:['id','label']);if(!legalUuid(v.id)||typeof v.label!=='string'||v.label.length<1||v.label.length>254||eligible&&typeof v.eligible!=='boolean')fail('La persona responsable no pudo verificarse.');};

export function normalizeCaseCommand(v){
 if(!v||Array.isArray(v)||typeof v!=='object'||typeof v.command!=='string')fail('Elegí una operación válida.');
 if(v.command==='create'){
  exact(v,['command','matterId','number','year','subject','originArea','responsibleId','reason']);
  if(typeof v.number!=='string')fail('La identificaci?n del expediente no es v?lida.','number');const number=v.number.normalize('NFC').trim().toUpperCase();if(number.length<1||number.length>40||!/^[A-Z0-9][A-Z0-9./-]*$/.test(number)||!integer(v.year,1900,2100)||!legalUuid(v.matterId)||!legalUuid(v.responsibleId))fail('La identificaci?n del expediente no es v?lida.');
  return{command:'create',matterId:v.matterId,number,year:v.year,subject:text(v.subject,3,240,'subject'),originArea:text(v.originArea,2,120,'originArea'),responsibleId:v.responsibleId,reason:text(v.reason,5,500,'reason')};
 }
 if(!Object.hasOwn(CASE_COMMANDS,v.command))fail('La operación no está habilitada.');
 exact(v,['command','id','expectedRevision','subject','originArea','responsibleId','reason']);
 if(!legalUuid(v.id)||!integer(v.expectedRevision,1,100)||!legalUuid(v.responsibleId))fail('La revisión del expediente no es válida.');
 return{command:v.command,id:v.id,expectedRevision:v.expectedRevision,subject:text(v.subject,3,240,'subject'),originArea:text(v.originArea,2,120,'originArea'),responsibleId:v.responsibleId,reason:text(v.reason,5,500,'reason')};
}
function row(r){exact(r,['id','number','year','revision','state','subject','originArea','responsibleLabel','recordedAt']);if(!legalUuid(r.id)||typeof r.number!=='string'||r.number.length<1||r.number.length>40||!integer(r.year,1900,2100)||!integer(r.revision,1,100)||!Object.hasOwn(CASE_STATES,r.state)||!instant(r.recordedAt)||typeof r.responsibleLabel!=='string')fail('La fila del expediente no pudo verificarse.');text(r.subject,3,240,'subject');text(r.originArea,2,120,'originArea');}
function record(r){exact(r,['id','number','year','revision','state','subject','originArea','responsible','reason','recordedBy','recordedAt','matters','history']);if(!legalUuid(r.id)||typeof r.number!=='string'||!integer(r.year,1900,2100)||!integer(r.revision,1,100)||!Object.hasOwn(CASE_STATES,r.state)||!instant(r.recordedAt))fail('El expediente no pudo verificarse.');text(r.subject,3,240,'subject');text(r.originArea,2,120,'originArea');member(r.responsible,true);text(r.reason,5,500,'reason');if(!Array.isArray(r.matters)||!r.matters.length||!(r.history===null||Array.isArray(r.history)))fail('El expediente no tiene trazabilidad suficiente.');if(Array.isArray(r.history)&&r.history.length!==r.revision)fail('El historial del expediente est? incompleto.');for(const m of r.matters){exact(m,['id','title','state','revision','normId','normVersion']);if(!legalUuid(m.id)||!legalUuid(m.normId)||!integer(m.revision,1,100)||!integer(m.normVersion,1,1000)||typeof m.title!=='string')fail('El vínculo al asunto no pudo verificarse.');}for(const [i,h] of (r.history||[]).entries()){exact(h,['revision','state','subject','originArea','responsibleId','responsibleLabel','reason','recordedBy','recordedAt']);if(h.revision!==r.revision-i||!Object.hasOwn(CASE_STATES,h.state)||!legalUuid(h.responsibleId)||!instant(h.recordedAt))fail('El historial del expediente no pudo verificarse.');}}
export function verifyCaseResponse(op,d){
 if(op==='bootstrap'){exact(d,['version','canManage','total','candidates']);if(d.version!=='legal-case-bootstrap.v1'||typeof d.canManage!=='boolean'||!integer(d.total,0,2000)||!Array.isArray(d.candidates)||d.candidates.length>1000)fail();if(!d.canManage&&d.candidates.length)fail();let prev='';for(const c of d.candidates){member(c);if(c.id<=prev)fail();prev=c.id;}return d;}
 if(op==='list'){exact(d,['version','canManage','total','page','pageSize','rows']);if(d.version!=='legal-case-list.v1'||typeof d.canManage!=='boolean'||!integer(d.total,0,2000)||!integer(d.page,1,200)||d.pageSize!==25||!Array.isArray(d.rows)||d.rows.length>25)fail();const ids=new Set();for(const r of d.rows){row(r);if(ids.has(r.id))fail();ids.add(r.id);}return d;}
 if(op==='for_matter'){exact(d,['version','matterId','canManage','rows']);if(d.version!=='legal-case-for-matter.v1'||!legalUuid(d.matterId)||typeof d.canManage!=='boolean'||!Array.isArray(d.rows)||d.rows.length>100)fail();for(const r of d.rows)record(r);return d;}
 if(op==='detail'){exact(d,['version','canManage','record','candidates']);if(d.version!=='legal-case-detail.v1'||typeof d.canManage!=='boolean'||!Array.isArray(d.candidates)||d.candidates.length>1000)fail();record(d.record);if(!Array.isArray(d.record.history))fail('El historial del expediente est? incompleto.');if(!d.canManage&&d.candidates.length)fail();for(const c of d.candidates)member(c);return d;}
 if(op==='save'||op==='attempt'){exact(d,['version','id','revision','state','replayed']);if(d.version!=='legal-case-receipt.v1'||!legalUuid(d.id)||!integer(d.revision,1,100)||!Object.hasOwn(CASE_STATES,d.state)||typeof d.replayed!=='boolean')fail('La confirmación del expediente no pudo verificarse.');return d;}
 fail();
}
