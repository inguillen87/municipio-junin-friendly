import {createHash} from 'node:crypto';
import {salaryExact,salaryUuid,salarySerialized} from '../assets/native-salary-catalog-model.js';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

// Initial institutional identification only. Administrative maintenance and
// declaration of current validity remain pending; this is not homologation.
// The selected source company is 101, bound exclusively to the Junín tenant.
export const INITIAL_MUNICIPAL_ISSUER_PROFILES=freeze({
 '4daa7815-0816-4506-b497-c7432cb1aa9f':{
  id:'junin-municipal-issuer-initial-101',revision:1,
  issuer:{name:'MUNICIPALIDAD DE JUNIN - MENDOZA',taxId:'30672055438',address:'HIPOLITO YRIGOYEN Y ROMAN CANO S/N, JUNIN - MENDOZA'},
  source:{kind:'municipal_official_backup',label:'Identificación institucional del respaldo oficial de Junín, empresa 101',cutoff:'2026-10-01T15:17:29',validityDeclared:false}
 }
});

const invalid=()=>{throw Error('OWN_RECEIPT_CONTRACT_INVALID');};
const text=(value,min,max)=>typeof value==='string'&&value.length>=min&&value.length<=max&&!/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
const normalized=value=>{if(typeof value!=='string')return value;if(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value))invalid();return value.trim().normalize('NFC');};

function profile(value){
 if(!salaryExact(value,['id','revision','issuer','source'])||!salaryExact(value.issuer,['name','taxId','address'])||!salaryExact(value.source,['kind','label','cutoff','validityDeclared']))invalid();
 const id=value.id,revision=value.revision,issuer={name:normalized(value.issuer.name),taxId:normalized(value.issuer.taxId),address:normalized(value.issuer.address)},source={kind:value.source.kind,label:normalized(value.source.label),cutoff:value.source.cutoff,validityDeclared:value.source.validityDeclared};
 if(typeof issuer.taxId==='string'&&/^\d{2}-\d{8}-\d$/.test(issuer.taxId))issuer.taxId=issuer.taxId.replaceAll('-','');
 if(!text(id,1,160)||!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)||!Number.isSafeInteger(revision)||revision<1||!text(issuer.name,3,160)||typeof issuer.taxId!=='string'||!/^\d{11}$/.test(issuer.taxId)||!text(issuer.address,3,240)||source.kind!=='municipal_official_backup'||!text(source.label,1,240)||source.validityDeclared!==false||typeof source.cutoff!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(source.cutoff))invalid();
 const date=new Date(source.cutoff+'Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==source.cutoff)invalid();
 const content={id,revision,issuer,source},version=createHash('sha256').update(salarySerialized(content)).digest('hex');
 return {id,revision,version,issuer,source};
}

/** Read trusted server configuration, never request parameters or legacy data. */
export function municipalDocumentIssuerProfile(context,profiles=INITIAL_MUNICIPAL_ISSUER_PROFILES){
 if(!salaryUuid(context?.tenantId))invalid();
 let selected;
 if(profiles instanceof Map)selected=profiles.get(context.tenantId);
 else if(profiles&&typeof profiles==='object'&&!Array.isArray(profiles)&&[Object.prototype,null].includes(Object.getPrototypeOf(profiles)))selected=Object.hasOwn(profiles,context.tenantId)?profiles[context.tenantId]:undefined;
 else invalid();
 return {version:'own-receipt-issuer.v1',scope:{tenantId:context.tenantId},state:selected===undefined?'missing':'configured',profile:selected===undefined?null:profile(selected)};
}
