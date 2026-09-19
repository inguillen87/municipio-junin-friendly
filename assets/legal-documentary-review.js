import {legalUuid,LEGAL_KINDS,LEGAL_ISSUERS,LegalInputError} from './legal-registry-model.js';
export const DOCUMENTARY_FILTERS=Object.freeze({all:'Todas las fichas',no_articles:'Sin artículos transcritos',no_issue_date:'Sin fecha de emisión',no_publication_date:'Sin fecha de publicación',no_effective_date:'Sin fecha de efectos declarada',no_topics:'Sin temas cargados',no_summary:'Sin resumen documental',projects:'Registradas como proyecto'});
const bad=()=>{throw new LegalInputError('No se pudo verificar la revisión documental.');};
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=5000;
export function documentaryInput(filter,page){
 if(typeof filter!=='string'||!Object.hasOwn(DOCUMENTARY_FILTERS,filter)||!Number.isSafeInteger(page)||page<1||page>200)bad();return{filter,page};
}
export function verifyDocumentaryReview(data){
 if(!data||data.version!=='legal-documentary-review.v1'||data.legalConclusion!==false||data.pageSize!==25)bad();
 documentaryInput(data.filter,data.page);
 if(typeof data.observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(data.observedAt)||!Number.isFinite(Date.parse(data.observedAt)))bad();
 if(!data.summary||Object.keys(data.summary).sort().join('|')!==Object.keys(DOCUMENTARY_FILTERS).sort().join('|'))bad();
 if(Object.values(data.summary).some(x=>!count(x)||x>data.summary.all)||!count(data.total)||data.total!==data.summary[data.filter])bad();
 if(!Array.isArray(data.rows)||data.rows.length!==Math.min(25,Math.max(0,data.total-(data.page-1)*25)))bad();
 const ids=new Set(),flags=Object.keys(DOCUMENTARY_FILTERS).filter(k=>k!=='all');
 for(const r of data.rows){
  if(!legalUuid(r.id)||ids.has(r.id)||!Object.hasOwn(LEGAL_KINDS,r.kind)||!Object.hasOwn(LEGAL_ISSUERS,r.issuer)||typeof r.number!=='string'||!/^[A-Z0-9][A-Z0-9./-]{0,29}$/.test(r.number)||!Number.isSafeInteger(r.year)||r.year<1700||r.year>2200||!Number.isSafeInteger(r.version)||r.version<1||r.version>1000||typeof r.title!=='string'||r.title.length<3||r.title.length>240)bad();
  if(!r.flags||Object.keys(r.flags).sort().join('|')!==flags.sort().join('|')||Object.values(r.flags).some(x=>typeof x!=='boolean')||data.filter!=='all'&&!r.flags[data.filter])bad();
  ids.add(r.id);
 }
 return data;
}
export function documentaryReference(row){if(!legalUuid(row?.id)||!Number.isSafeInteger(row?.version)||row.version<1||row.version>1000)bad();return `/juridica?norma=${row.id}&version=${row.version}`;}
