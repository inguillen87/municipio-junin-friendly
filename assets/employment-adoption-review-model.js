import {sourceDeclarations,SOURCE_DECLARATIONS_VERSION,DECLARED_ADOPTION_REVIEW_VERSION} from './employment-source-declarations.js';
// Complete, read-only review of existing contracts. No identity resolution or decisions.
export const ADOPTION_REVIEW_VERSION='employment-adoption-review.v1';
export const ADOPTION_FINAL_REVIEW_VERSION='employment-adoption-review.v2';
export const ADOPTION_ACTIVE_REVIEW_VERSION='employment-adoption-review.v3';
export const ADOPTION_REVIEW_MAX_ROWS=10000;
export const ADOPTION_REVIEW_MAX_BYTES=6000000;
export class AdoptionReviewError extends Error {
 constructor(message='No se pudo verificar el padrón completo. Consultá nuevamente.',status=503,code='ADOPTION_REVIEW_INVALID'){super(message);Object.assign(this,{name:'AdoptionReviewError',status,code});}
}
const verified=new WeakSet(),fail=()=>{throw new AdoptionReviewError();};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const exact=(v,fields)=>obj(v)&&Reflect.ownKeys(v).length===fields.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&fields.includes(k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)&&!/^0+$/.test(v.replaceAll('-',''));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>v===null||typeof v==='string'&&v.length<=1000;
export const civilDay=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const stamp=v=>typeof v==='string'&&civilDay(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(v)&&Number.isFinite(Date.parse(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const canonical=v=>Array.isArray(v)?v.map(canonical):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const adoptionReviewJson=v=>JSON.stringify(canonical(v));
export async function adoptionReviewHash(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(adoptionReviewJson(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
const sourceFields=['coreVersionId','curatedVersionId','sourceBatchId','coreBaselineBatchId','curatedBaselineBatchId','sourceSha256','coreManifestSha256','curatedManifestSha256','publicationSha256','cutoff'];
const finalSourceFields=['revisionId','packageSha256','sourceSha256','cutoff','coreManifestSha256','curatedManifestSha256','factsSha256'];
const previousFields=['status','startDate','endDate','agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode'];
export const ADOPTION_FINAL_SOURCE_ISSUES=Object.freeze(['SOURCE_KEY_INVALID','CONTRACT_NOT_FOUND','CONTRACT_AMBIGUOUS','CONTRACT_SCOPE_CONFLICT','PERSON_LINK_MISSING','PERSON_LINK_AMBIGUOUS','CORE_RECORD_MISSING','CORE_RECORD_AMBIGUOUS','ACTIVE_STATE_CONFLICT','SOURCE_FACTS_MISSING','START_DATE_MISSING','DATE_INVALID','PERIOD_INVALID','STATUS_DATE_CONFLICT','CLASSIFICATION_MISSING','JURISDICTION_MISSING_ACTIVE','JURISDICTION_UNKNOWN','JURISDICTION_CONFLICT','PERSON_FACTS_CHANGED']);
export const ADOPTION_REVIEW_ROW_FIELDS=Object.freeze(['rowNumber','contractId','legajo','name','status','startDate','endDate','agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','activeContractsForPerson']);
export function adoptionReviewScope(s){if(!exact(s,['tenantId','membershipId','bindingId','companyId'])||![s.tenantId,s.membershipId,s.bindingId].every(uuid)||!Number.isSafeInteger(s.companyId)||s.companyId<1)fail();return adoptionReviewJson(s);}
const observations=Object.freeze({
 NAME_MISSING:['Nombre pendiente','Verificar la denominación en la ficha.'],NUMBER_REVIEW:['Numeración a revisar','Conservar el contrato y revisar la numeración; no renumerar automáticamente.'],
 START_MISSING:['Fecha de ingreso pendiente','Verificar la fecha de ingreso con su antecedente; no deducirla de haberes o movimientos.'],
 HISTORICAL_DATE:['Fecha histórica a revisar','Verificar el antecedente histórico; no reemplazar la fecha por un valor de ejemplo.'],
 PERIOD_INVALID:['Período laboral a revisar','Verificar fechas de ingreso y egreso.'],STATE_ERROR:['Estado laboral a revisar','Verificar la decisión y el período laboral antes de adoptar.'],
 ACTIVE_WITH_END:['Activo con egreso','Revisar la decisión laboral; no aplicar una baja automática.'],INACTIVE_WITHOUT_END:['Egreso pendiente','Verificar el egreso del contrato inactivo.'],
 AGREEMENT_MISSING:['Convenio pendiente','Verificar el convenio en el catálogo municipal.'],CATEGORY_MISSING:['Categoría pendiente','Verificar la categoría correspondiente al convenio.'],
 ORGANIZATION_MISSING:['Sector organizativo pendiente','Verificar el sector organizativo en la ficha.'],SECTOR_MISSING:['Repartición pendiente','Verificar la repartición utilizada en la liquidación.'],
 CLASSIFICATION_REVIEW:['Encuadre a revisar','Verificar los códigos contra el catálogo; no sustituir valores automáticamente.'],
 JURISDICTION_REQUIRED:['Jurisdicción por declarar','Declarar la jurisdicción de este contrato al preparar su adopción.'],
 MULTIPLE_ACTIVE:['Varios contratos activos','Revisar cada relación laboral; no equivale a una identidad duplicada.']
});
export function adoptionReviewObservations(r){
 const codes=[],missing=v=>v===null||v.trim()==='';
 if(missing(r.name))codes.push('NAME_MISSING');if(typeof r.legajo!=='string'||!/^[1-9]\d{0,8}$/.test(r.legajo))codes.push('NUMBER_REVIEW');
 if(r.startDate===null)codes.push('START_MISSING');else if(!/^(19|20)\d{2}-/.test(r.startDate))codes.push('HISTORICAL_DATE');
 if(r.startDate&&r.endDate&&r.endDate<r.startDate)codes.push('PERIOD_INVALID');if(r.status==='state_error')codes.push('STATE_ERROR');
 if(r.status==='active'&&r.endDate!==null)codes.push('ACTIVE_WITH_END');if(r.status==='inactive'&&r.endDate===null)codes.push('INACTIVE_WITHOUT_END');
 for(const [field,code]of [['agreementCode','AGREEMENT_MISSING'],['categoryCode','CATEGORY_MISSING'],['organizationId','ORGANIZATION_MISSING'],['sectorCode','SECTOR_MISSING']])if(missing(r[field]))codes.push(code);
 if(['agreementCode','categoryCode','organizationId','sectorCode'].some(k=>!missing(r[k])&&!/^\d{1,9}$/.test(r[k])))codes.push('CLASSIFICATION_REVIEW');
 if(r.jurisdictionCode===null)codes.push('JURISDICTION_REQUIRED');if(r.activeContractsForPerson>1)codes.push('MULTIPLE_ACTIVE');
 return [...codes.map(code=>({code,status:observations[code][0],action:observations[code][1]})),...(r.sourceIssues??[]).map(code=>({code:'FINAL_'+code,status:'Antecedente final a revisar',action:'Corregir o respaldar la incidencia del corte final antes de adoptar el conjunto completo.'}))];
}
function validateRaw(raw){
 if(!exact(raw,['scope','source','today','queriedAt','total','rows'])||!civilDay(raw.today)||!stamp(raw.queriedAt)||!Number.isSafeInteger(raw.total)||raw.total<0||!Array.isArray(raw.rows))fail();
 if(raw.total>ADOPTION_REVIEW_MAX_ROWS)throw new AdoptionReviewError('El padrón completo supera la capacidad de revisión. No se omitieron ni dividieron contratos.',422,'ADOPTION_REVIEW_LIMIT');
 if(raw.total!==raw.rows.length)fail();adoptionReviewScope(raw.scope);
 const s=raw.source,final=Object.hasOwn(s??{},'finalRevision'),active=Object.hasOwn(s??{},'operationalCohort'),declared=Object.hasOwn(s??{},'municipalDeclarations');if(!exact(s,[...sourceFields,...(final?['finalRevision']:[]),...(active?['operationalCohort']:[]),...(declared?['municipalDeclarations']:[])])||!sourceFields.slice(0,5).every(k=>uuid(s[k]))||!sourceFields.slice(5,9).every(k=>hash(s[k]))||!stamp(s.cutoff))fail();
 if(final){const f=s.finalRevision;if(!exact(f,finalSourceFields)||!uuid(f.revisionId)||!finalSourceFields.filter(k=>!['revisionId','cutoff'].includes(k)).every(k=>hash(f[k]))||!stamp(f.cutoff))fail();}
 if(active){const c=s.operationalCohort;if(!final||!exact(c,['version','sourceTotal','archivedTotal'])||c.version!=='active-contracts.v1'||!Number.isSafeInteger(c.sourceTotal)||c.sourceTotal<1||c.sourceTotal>ADOPTION_REVIEW_MAX_ROWS||!Number.isSafeInteger(c.archivedTotal)||c.archivedTotal<0||c.sourceTotal-c.archivedTotal!==raw.total)fail();}
 let lastSourceRow=0;
 const seen=new Set();for(const [index,r]of raw.rows.entries()){
  if(!exact(r,[...ADOPTION_REVIEW_ROW_FIELDS,...(final?['previous','sourceIssues']:[]),...(active?['sourceRowNumber']:[])])||r.rowNumber!==index+1||!uuid(r.contractId)||seen.has(r.contractId.toLowerCase())||!['active','inactive','state_error'].includes(r.status)
   ||!['legajo','name','agreementCode','categoryCode','organizationId','sectorCode'].every(k=>text(r[k]))||r.startDate!==null&&!civilDay(r.startDate)||r.endDate!==null&&!civilDay(r.endDate)
   ||!['42','55',null].includes(r.jurisdictionCode)||!Number.isSafeInteger(r.activeContractsForPerson)||r.activeContractsForPerson<0||r.activeContractsForPerson>raw.total)fail();
  if(final){const b=r.previous;if(!exact(b,previousFields)||!['active','inactive','state_error','unknown'].includes(b.status)||!previousFields.filter(k=>k!=='status').every(k=>text(b[k]))
   ||b.startDate!==null&&!civilDay(b.startDate)||b.endDate!==null&&!civilDay(b.endDate)||!['42','55',null].includes(b.jurisdictionCode)
   ||!Array.isArray(r.sourceIssues)||new Set(r.sourceIssues).size!==r.sourceIssues.length||r.sourceIssues.some(k=>!ADOPTION_FINAL_SOURCE_ISSUES.includes(k)))fail();}
  if(active){if(r.status!=='active'||!Number.isSafeInteger(r.sourceRowNumber)||r.sourceRowNumber<=lastSourceRow||r.sourceRowNumber>s.operationalCohort.sourceTotal)fail();lastSourceRow=r.sourceRowNumber;}
  seen.add(r.contractId.toLowerCase());
 }
 if(declared){if(!active||!exact(s.municipalDeclarations,['version','rows'])||s.municipalDeclarations.version!==SOURCE_DECLARATIONS_VERSION)fail();let ds;try{ds=sourceDeclarations(s.municipalDeclarations.rows);}catch{fail();}const byId=new Map(raw.rows.map(r=>[r.contractId.toLowerCase(),r]));for(const d of ds){const row=byId.get(d.contractId.toLowerCase());if(!row||Object.entries(d.values).some(([k,v])=>row[k]!==v))fail();}}
 if(new TextEncoder().encode(adoptionReviewJson(raw)).length>ADOPTION_REVIEW_MAX_BYTES)throw new AdoptionReviewError('El padrón completo supera la capacidad de consulta. No se omitieron contratos.',422,'ADOPTION_REVIEW_LIMIT');
}
export async function sealAdoptionReview(raw){
 validateRaw(raw);const sourceContextVersion=await adoptionReviewHash({scope:raw.scope,source:raw.source});
 const rows=await Promise.all(raw.rows.map(async r=>({...structuredClone(r),contractVersion:await adoptionReviewHash({sourceContextVersion,row:r}),observations:adoptionReviewObservations(r)})));
 const counts={active:0,inactive:0,state_error:0,dataReview:0,jurisdictionPending:0,multipleActive:0,observations:0};
 for(const r of rows){counts[r.status]++;counts.observations+=r.observations.length;if(r.observations.some(o=>!['JURISDICTION_REQUIRED','MULTIPLE_ACTIVE'].includes(o.code)))counts.dataReview++;if(r.jurisdictionCode===null)counts.jurisdictionPending++;if(r.activeContractsForPerson>1)counts.multipleActive++;}
 const data={version:raw.source.municipalDeclarations?DECLARED_ADOPTION_REVIEW_VERSION:raw.source.operationalCohort?ADOPTION_ACTIVE_REVIEW_VERSION:raw.source.finalRevision?ADOPTION_FINAL_REVIEW_VERSION:ADOPTION_REVIEW_VERSION,complete:true,...structuredClone(raw),sourceContextVersion,counts,rows};
 data.snapshot=await adoptionReviewHash({...data,queriedAt:null});
 if(new TextEncoder().encode(adoptionReviewJson(data)).length>ADOPTION_REVIEW_MAX_BYTES)throw new AdoptionReviewError('El padrón completo supera la capacidad de consulta. No se omitieron contratos.',422,'ADOPTION_REVIEW_LIMIT');
 return freeze(data);
}
export async function verifiedAdoptionReview(value){
 const declared=value?.version===DECLARED_ADOPTION_REVIEW_VERSION,active=declared||value?.version===ADOPTION_ACTIVE_REVIEW_VERSION,final=active||value?.version===ADOPTION_FINAL_REVIEW_VERSION,fields=[...ADOPTION_REVIEW_ROW_FIELDS,...(final?['previous','sourceIssues']:[]),...(active?['sourceRowNumber']:[])];
 if(!exact(value,['version','complete','scope','source','today','queriedAt','total','rows','sourceContextVersion','counts','snapshot'])||![ADOPTION_REVIEW_VERSION,ADOPTION_FINAL_REVIEW_VERSION,ADOPTION_ACTIVE_REVIEW_VERSION,DECLARED_ADOPTION_REVIEW_VERSION].includes(value.version)||value.complete!==true||!Array.isArray(value.rows)||final!==Boolean(value.source?.finalRevision)||active!==Boolean(value.source?.operationalCohort)||declared!==Boolean(value.source?.municipalDeclarations))fail();
 const raw={scope:value.scope,source:value.source,today:value.today,queriedAt:value.queriedAt,total:value.total,rows:value.rows.map(r=>{if(!exact(r,[...fields,'contractVersion','observations']))fail();return Object.fromEntries(fields.map(k=>[k,r[k]]));})};
 const sealed=await sealAdoptionReview(raw);if(adoptionReviewJson(sealed)!==adoptionReviewJson(value))fail();verified.add(sealed);return sealed;
}
export function adoptionReviewCsv(review){
 if(!verified.has(review))fail();const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
 const active=Boolean(review.source.operationalCohort),rows=[[active?'Fila de la fuente completa':'Fila de la revisión','Estado','Acción sugerida']];for(const r of review.rows)for(const o of r.observations)rows.push([active?r.sourceRowNumber:r.rowNumber,o.status,o.action]);
 return '\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\r\n')+'\r\n';
}
