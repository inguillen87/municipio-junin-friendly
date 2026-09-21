import {legalUuid,legalText,exactLegalObject} from './legal-registry-model.js';
export const OBLIGATION_TYPES=Object.freeze({delivery:'Entrega',payment:'Pago',milestone:'Hito',guarantee:'Garantía',documentation:'Documentación',service_level:'Nivel de servicio',other:'Otra'});
export const OBLIGATION_STATES=Object.freeze({open:'Abierta',fulfilled_observed:'Cumplimiento observado',breached_observed:'Incumplimiento observado',waived:'Dispensada',cancelled:'Cancelada'});
export class ObligationInputError extends Error{constructor(message='Revisá los datos de la obligación.',field=''){super(message);this.name='ObligationInputError';this.field=field;}}
const fail=(m,f='')=>{throw new ObligationInputError(m,f);},exact=(v,k)=>{try{exactLegalObject(v,k);}catch{fail('La obligación contiene campos no admitidos.');}},integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const date=v=>{if(v==='')return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('La fecha no es válida.','dueDate');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)fail('La fecha no es válida.','dueDate');return v;};
export function normalizeObligationCommand(v){
 if(!v||Array.isArray(v)||typeof v!=='object'||typeof v.command!=='string')fail();
 if(v.command==='create'){
  exact(v,['command','contractId','contractRevision','obligationType','title','description','clauseLocator','sourcePage','dueDate','dueBasis','currency','amountMinor','unit','responsibleId','evidenceDocumentId','evidenceNote','reason']);
  if(!legalUuid(v.contractId)||!integer(v.contractRevision,1,100)||!Object.hasOwn(OBLIGATION_TYPES,v.obligationType)||!legalUuid(v.responsibleId)||v.evidenceDocumentId!==null&&!legalUuid(v.evidenceDocumentId))fail('La referencia contractual no es válida.');
  if(v.sourcePage!==null&&!integer(v.sourcePage,1,9999))fail('La página fuente no es válida.','sourcePage');
  const currency=v.currency;if(!['NONE','ARS','USD','EUR'].includes(currency))fail('La moneda no es válida.');const amountMinor=currency==='NONE'?null:v.amountMinor;if(currency==='NONE'&&v.amountMinor!==null||currency!=='NONE'&&!integer(amountMinor,0,999999999999999))fail('El importe no es válido.');
  return{command:'create',contractId:v.contractId,contractRevision:v.contractRevision,obligationType:v.obligationType,title:legalText(v.title,3,240,'title'),description:legalText(v.description,5,3000,'description'),clauseLocator:legalText(v.clauseLocator,2,180,'clauseLocator'),sourcePage:v.sourcePage,dueDate:date(v.dueDate),dueBasis:legalText(v.dueBasis,0,500,'dueBasis'),currency,amountMinor,unit:legalText(v.unit,0,80,'unit'),responsibleId:v.responsibleId,evidenceDocumentId:v.evidenceDocumentId,evidenceNote:legalText(v.evidenceNote,0,2000,'evidenceNote'),reason:legalText(v.reason,5,500,'reason')};
 }
 if(v.command==='set_status'){
  exact(v,['command','id','expectedSequence','status','evidenceDocumentId','evidenceNote','decisionNote','reason']);
  if(!legalUuid(v.id)||!integer(v.expectedSequence,1,100)||!Object.hasOwn(OBLIGATION_STATES,v.status)||v.evidenceDocumentId!==null&&!legalUuid(v.evidenceDocumentId))fail('La revisión de obligación no es válida.');
  const decisionNote=legalText(v.decisionNote,v.status==='open'?0:5,2000,'decisionNote');if(v.status==='open'&&decisionNote!=='')fail('Reabrir no conserva una decisión anterior.','decisionNote');
  return{command:'set_status',id:v.id,expectedSequence:v.expectedSequence,status:v.status,evidenceDocumentId:v.evidenceDocumentId,evidenceNote:legalText(v.evidenceNote,0,2000,'evidenceNote'),decisionNote,reason:legalText(v.reason,5,500,'reason')};
 }
 fail('La operación de obligación no está habilitada.');
}
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const doc=v=>{if(v===null)return;exact(v,['id','title','version','filename','sha256']);if(!legalUuid(v.id)||typeof v.title!=='string'||!integer(v.version,1,100)||typeof v.filename!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256||''))fail();};
export function verifyObligationResponse(op,d){
 if(op==='list'){exact(d,['version','contract','canManage','candidates','documents','rows']);exact(d.contract,['id','number','year','revision','state','title','caseId']);if(d.version!=='legal-contract-obligation-list.v1'||!legalUuid(d.contract.id)||!integer(d.contract.year,1900,2100)||!integer(d.contract.revision,1,100)||d.contract.caseId!==null&&!legalUuid(d.contract.caseId)||typeof d.canManage!=='boolean'||!Array.isArray(d.candidates)||!Array.isArray(d.documents)||!Array.isArray(d.rows))fail();for(const c of d.candidates){exact(c,['id','label']);if(!legalUuid(c.id)||typeof c.label!=='string')fail();}for(const x of d.documents)doc(x);for(const r of d.rows){exact(r,['id','sequence','status','obligationType','title','clauseLocator','sourcePage','dueDate','dueBasis','currency','amountMinor','unit','responsibleLabel','evidenceDocumentId','evidenceNote','decisionNote','recordedAt']);if(!legalUuid(r.id)||!integer(r.sequence,1,100)||!Object.hasOwn(OBLIGATION_STATES,r.status)||!Object.hasOwn(OBLIGATION_TYPES,r.obligationType)||!instant(r.recordedAt))fail();}return d;}
 if(op==='detail'){exact(d,['version','history']);if(d.version!=='legal-contract-obligation-detail.v1'||!Array.isArray(d.history)||!d.history.length)fail();let seq=d.history[0].sequence;for(const h of d.history){if(h.sequence!==seq--)fail();}return d;}
 if(op==='save'||op==='attempt'){exact(d,['version','id','sequence','status','replayed']);if(d.version!=='legal-contract-obligation-receipt.v1'||!legalUuid(d.id)||!integer(d.sequence,1,100)||!Object.hasOwn(OBLIGATION_STATES,d.status)||typeof d.replayed!=='boolean')fail();return d;}fail();
}
