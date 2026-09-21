import {legalUuid,legalText,exactLegalObject} from './legal-registry-model.js';
export const CONTRACT_TYPES=Object.freeze({obra:'Obra',servicio:'Servicio',suministro:'Suministro',locacion:'Locación',consultoria:'Consultoría',convenio:'Convenio',otro:'Otro'});
export const CONTRACT_STATES=Object.freeze({registered:'Registrado',under_review:'En revisión',active:'Activo administrativo',closed:'Finalizado administrativo',cancelled:'Cancelado administrativo'});
export const PARTY_ROLES=Object.freeze({provider:'Proveedor',contractor:'Contratista',consultant:'Consultor',lessee:'Locatario',lessor:'Locador',other:'Otra contraparte'});
export const CONTRACT_TRANSITIONS=Object.freeze({
 registered:Object.freeze(['under_review','cancelled']),
 under_review:Object.freeze(['registered','active','cancelled']),
 active:Object.freeze(['under_review','closed','cancelled']),
 closed:Object.freeze(['active']),
 cancelled:Object.freeze(['registered'])
});
export class ContractInputError extends Error{constructor(message='Revisá los datos del contrato.',field=''){super(message);this.name='ContractInputError';this.field=field;}}
const fail=(m,f='')=>{throw new ContractInputError(m,f);},exact=(v,k)=>{try{exactLegalObject(v,k);}catch{fail('El contrato contiene campos no admitidos.');}},integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const date=v=>{if(v==='')return v;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('La fecha no es válida.');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)fail('La fecha no es válida.');return v;};
function parties(v){if(!Array.isArray(v)||v.length<1||v.length>20)fail('Indicá al menos una contraparte.','counterparties');return v.map((p,i)=>{exact(p,['name','role','taxId']);if(!Object.hasOwn(PARTY_ROLES,p.role))fail('El rol de contraparte no es válido.','counterparties');const name=legalText(p.name,2,180,'counterparties'),taxId=typeof p.taxId==='string'?p.taxId.trim():'';if(taxId&&!/^[0-9]{11}$/.test(taxId))fail('El CUIT debe tener 11 dígitos o quedar vacío.','counterparties');return{name,role:p.role,taxId};});}
function common(v){
 const currency=v.currency;if(!['NONE','ARS','USD','EUR'].includes(currency))fail('La moneda no es válida.','currency');
 const amountMinor=currency==='NONE'?null:v.amountMinor;if(currency==='NONE'&&v.amountMinor!==null)fail('Sin moneda no puede haber importe.','amountMinor');if(currency!=='NONE'&&!integer(amountMinor,0,999999999999999))fail('El importe no es válido.','amountMinor');
 const startDate=date(v.startDate),endDate=date(v.endDate);if(startDate&&endDate&&endDate<startDate)fail('La fecha final no puede ser anterior al inicio.','endDate');
 if(!legalUuid(v.matterId)||v.caseId!==null&&!legalUuid(v.caseId)||!legalUuid(v.responsibleId))fail('La referencia jurídica no es válida.');
 return{title:legalText(v.title,3,240,'title'),object:legalText(v.object,5,3000,'object'),counterparties:parties(v.counterparties),currency,amountMinor,startDate,endDate,approvalReference:legalText(v.approvalReference,0,500,'approvalReference'),responsibleId:v.responsibleId,matterId:v.matterId,caseId:v.caseId,reason:legalText(v.reason,5,500,'reason')};
}
export function normalizeContractCommand(v){
 if(!v||Array.isArray(v)||typeof v!=='object'||typeof v.command!=='string')fail();
 if(v.command==='create'){
  exact(v,['command','number','year','contractType','title','object','counterparties','currency','amountMinor','startDate','endDate','approvalReference','responsibleId','matterId','caseId','reason']);
  const number=typeof v.number==='string'?v.number.normalize('NFC').trim().toUpperCase():'';if(!/^[A-Z0-9][A-Z0-9./-]{0,39}$/.test(number)||!integer(v.year,1900,2100)||!Object.hasOwn(CONTRACT_TYPES,v.contractType))fail('La identificación contractual no es válida.');
  return{command:'create',number,year:v.year,contractType:v.contractType,...common(v)};
 }
 if(!['revise','set_state'].includes(v.command))fail('La operación contractual no está habilitada.');
 exact(v,['command','id','expectedRevision','state','title','object','counterparties','currency','amountMinor','startDate','endDate','approvalReference','responsibleId','matterId','caseId','reason']);
 if(!legalUuid(v.id)||!integer(v.expectedRevision,1,100)||!Object.hasOwn(CONTRACT_STATES,v.state))fail('La revisión contractual no es válida.');
 return{command:v.command,id:v.id,expectedRevision:v.expectedRevision,state:v.state,...common(v)};
}
const instant=v=>typeof v==='string'&&v.length<=60&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
function partyResponse(p){exact(p,['name','role','taxId']);if(typeof p.name!=='string'||!Object.hasOwn(PARTY_ROLES,p.role)||typeof p.taxId!=='string')fail();}
function record(r,historyRequired=false){
 exact(r,['id','number','year','contractType','revision','state','title','object','counterparties','currency','amountMinor','startDate','endDate','approvalReference','responsible','matterId','caseId','reason','recordedBy','recordedAt','history']);
 if(!legalUuid(r.id)||typeof r.number!=='string'||!integer(r.year,1900,2100)||!Object.hasOwn(CONTRACT_TYPES,r.contractType)||!integer(r.revision,1,100)||!Object.hasOwn(CONTRACT_STATES,r.state)||!Array.isArray(r.counterparties)||!r.counterparties.length||!['NONE','ARS','USD','EUR'].includes(r.currency)||!legalUuid(r.matterId)||r.caseId!==null&&!legalUuid(r.caseId)||!instant(r.recordedAt))fail('La ficha contractual no pudo verificarse.');
 r.counterparties.forEach(partyResponse);exact(r.responsible,['id','label','eligible']);if(!legalUuid(r.responsible.id)||typeof r.responsible.label!=='string'||typeof r.responsible.eligible!=='boolean')fail();
 if(historyRequired&&(!Array.isArray(r.history)||r.history.length!==r.revision))fail('El historial contractual está incompleto.');
 if(Array.isArray(r.history)){let n=r.revision;for(const h of r.history){exact(h,['revision','state','title','object','counterparties','currency','amountMinor','startDate','endDate','approvalReference','responsibleId','responsibleLabel','matterId','caseId','reason','recordedBy','recordedAt']);if(h.revision!==n--||!Object.hasOwn(CONTRACT_STATES,h.state)||!legalUuid(h.responsibleId)||!legalUuid(h.matterId)||h.caseId!==null&&!legalUuid(h.caseId)||!instant(h.recordedAt))fail();}}
 return r;
}
export function verifyContractResponse(op,d){
 if(op==='bootstrap'){exact(d,['version','canManage','matterId','candidates','cases']);if(d.version!=='legal-contract-bootstrap.v1'||typeof d.canManage!=='boolean'||!legalUuid(d.matterId)||!Array.isArray(d.candidates)||d.candidates.length>1000||!Array.isArray(d.cases)||d.cases.length>100)fail();for(const c of d.candidates){exact(c,['id','label']);if(!legalUuid(c.id)||typeof c.label!=='string')fail();}for(const c of d.cases){exact(c,['id','number','year','subject']);if(!legalUuid(c.id)||typeof c.number!=='string'||!integer(c.year,1900,2100)||typeof c.subject!=='string')fail();}return d;}
 if(op==='list'){exact(d,['version','canManage','total','page','pageSize','rows']);if(d.version!=='legal-contract-list.v1'||typeof d.canManage!=='boolean'||!integer(d.total,0,5000)||!integer(d.page,1,200)||d.pageSize!==25||!Array.isArray(d.rows)||d.rows.length>25)fail();for(const r of d.rows){exact(r,['id','number','year','contractType','revision','state','title','currency','amountMinor','responsibleLabel','startDate','endDate','recordedAt']);if(!legalUuid(r.id)||!Object.hasOwn(CONTRACT_TYPES,r.contractType)||!Object.hasOwn(CONTRACT_STATES,r.state)||!integer(r.revision,1,100)||!instant(r.recordedAt))fail();}return d;}
 if(op==='detail'){exact(d,['version','canManage','record']);if(d.version!=='legal-contract-detail.v1'||typeof d.canManage!=='boolean')fail();record(d.record,true);return d;}
 if(op==='save'||op==='attempt'){exact(d,['version','id','revision','state','replayed']);if(d.version!=='legal-contract-receipt.v1'||!legalUuid(d.id)||!integer(d.revision,1,100)||!Object.hasOwn(CONTRACT_STATES,d.state)||typeof d.replayed!=='boolean')fail();return d;}
 fail('La respuesta contractual no pudo verificarse.');
}
export const nextContractStates=state=>Object.freeze(CONTRACT_TRANSITIONS[state]||[]);
