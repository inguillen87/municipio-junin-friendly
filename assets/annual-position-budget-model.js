// Annual normative positions, independent of historical GRH payroll snapshots.
import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized} from './native-salary-catalog-model.js';
import {JUNIN_BUDGET_2026} from './junin-budget-2026.js';
export const BUDGET_VERSION='annual-position-budget.v1',BUDGET_MAX_BYTES=4194304;
export const BUDGET_READ=Object.freeze(['workforce.employee.read','workforce.structure.read']);
export const BUDGET_UNITS=Object.freeze({position:'Cargos',teaching_hour:'Horas cátedra',contracted_staff:'Personal contratado'});
export const BUDGET_ROW_KEYS=Object.freeze(['code','jurisdiction','regime','group','section','subsection','position','label','unit','quantity','reference']);
export class AnnualBudgetError extends Error{constructor(code,message){super(message);Object.assign(this,{name:'AnnualBudgetError',code});}}
const check=(value,message,code='INPUT_INVALID')=>{if(!value)throw new AnnualBudgetError(code,message);};
const text=(v,min,max)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&[...v].length>=min&&[...v].length<=max&&!/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const code=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(v);
export const budgetYear=v=>Number.isInteger(v)&&v>=1900&&v<=2099;
export function annualBudgetDefinition(v){
 check(salaryExact(v,['source','rows'])&&salaryExact(v.source,['instrument','documentSha256','coverage','reference']),'Identificá la fuente normativa completa.');
 check(text(v.source.instrument,3,180)&&salaryHash(v.source.documentSha256)&&['article_summary','annex_detail'].includes(v.source.coverage)&&text(v.source.reference,3,180),'Indicá norma, huella del documento, alcance y referencia.');
 check(Array.isArray(v.rows)&&v.rows.length>0&&v.rows.length<=1000,'El conjunto admite entre 1 y 1000 filas completas. No se recorta.');
 const ids=new Set(),rows=v.rows.map(r=>{
  check(salaryExact(r,BUDGET_ROW_KEYS)&&code(r.code)&&code(r.jurisdiction),'Revisá el identificador y la jurisdicción de cada fila.');
  for(const k of ['regime','group','section','subsection','position'])check(r[k]===null||code(r[k]),'Un código ausente se conserva vacío; no se deduce de otro campo.');
  check(text(r.label,1,180)&&text(r.reference,3,180)&&Object.hasOwn(BUDGET_UNITS,r.unit),'Cada fila requiere descripción, unidad y referencia normativa.');
  check(typeof r.quantity==='string'&&/^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$/.test(r.quantity)&&(r.unit==='teaching_hour'||!r.quantity.includes('.')),'Conservá la cantidad exacta. Cargos y personal contratado requieren unidades enteras.');
  check(!ids.has(r.code),'Hay un identificador de fila repetido.');ids.add(r.code);return {...r};
 }).sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
 return {source:{...v.source},rows};
}
export function annualBudgetOfficialJuninDraft(year){
 check(year===2026,'La fuente publicada corresponde exclusivamente al ejercicio 2026 de Junín.');
 const b=JUNIN_BUDGET_2026;return annualBudgetDefinition({source:{instrument:'Junín · Ordenanza '+b.source.instrumentNumber,documentSha256:b.source.file.sha256,coverage:'article_summary',reference:'Artículo 7 · PDF oficial de 9 páginas; sin planillas anexas'},rows:[...b.staffingEstablishment.departmentExecutive.map(r=>[r,'01']),...b.staffingEstablishment.deliberativeCouncil.map(r=>[r,'02'])].map(([r,jurisdiction])=>({code:r.article,jurisdiction,regime:null,group:null,section:null,subsection:null,position:null,label:r.label,unit:r.unit,quantity:String(r.quantity),reference:'Artículo '+r.article+(r.declaredTeachingHoursPerPosition?' · '+r.declaredTeachingHoursPerPosition+' horas cátedra declaradas por cargo':'')}))});
}
export function annualBudgetCommand(v){
 check(salaryExact(v,['command','year','scopeVersion','baseVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed'])&&['propose','approve','reject'].includes(v.command)&&budgetYear(v.year)&&salaryHash(v.scopeVersion)&&salaryHash(v.baseVersion)&&text(v.reason,10,1000)&&typeof v.reviewConfirmed==='boolean','Revisá ejercicio, operación, versión y fundamento.');
 if(v.command==='propose'){check(v.proposalId===null&&v.proposalSha256===null&&v.reviewConfirmed===false,'Una propuesta requiere revisión posterior.');return {...v,definition:annualBudgetDefinition(v.definition)};}
 check(salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256)&&v.definition===null&&v.reviewConfirmed===true,'Confirmá la revisión de la propuesta completa.');return {...v};
}
export async function budgetHash(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function annualBudgetReceipt(v,attempt){
 check(salaryExact(v,['version','eventId','proposalId','requestKey','requestSha256','body','status','revision','catalogVersion','replayed'])&&v.version===BUDGET_VERSION&&salaryUuid(v.eventId)&&salaryUuid(v.proposalId)&&salaryKey(v.requestKey)&&salaryHash(v.requestSha256)&&salaryHash(v.catalogVersion)&&Number.isInteger(v.revision)&&v.revision>=0&&v.revision<=1000&&typeof v.replayed==='boolean','No se verificó el recibo del intento.','CONTRACT_INVALID');
 annualBudgetCommand(v.body);check(v.status===({propose:'pending',approve:'approved',reject:'rejected'}[v.body.command])&&(v.body.command!=='propose'||v.eventId===v.proposalId)&&(v.body.command==='propose'||v.body.proposalId===v.proposalId),'El intento no corresponde a su propuesta.','CONTRACT_INVALID');
 if(attempt)check(attempt.key===v.requestKey&&salarySerialized(attempt.body)===salarySerialized(v.body),'El recibo no corresponde al contenido enviado.','CONTRACT_INVALID');return v;
}
export async function verifiedAnnualBudgetReceipt(v,attempt){annualBudgetReceipt(v,attempt);check(await budgetHash(v.body)===v.requestSha256,'La huella del envío no coincide.','CONTRACT_INVALID');return v;}
export function annualBudgetBootstrap(v,year){
 check(salaryExact(v,['version','year','scopeVersion','catalog','proposals','proposalCount','complete','permissions'])&&v.version===BUDGET_VERSION&&budgetYear(v.year)&&(year===undefined||v.year===year)&&salaryHash(v.scopeVersion)&&v.complete===true&&Array.isArray(v.proposals)&&v.proposals.length===v.proposalCount&&v.proposalCount<=1000,'No se verificó el registro anual completo.','CONTRACT_INVALID');
 const c=v.catalog;check(salaryExact(c,['version','revision','definition','definitionSha256','proposalId','approvalId'])&&salaryHash(c.version)&&Number.isInteger(c.revision)&&c.revision>=0&&c.revision<=1000&&salaryExact(v.permissions,['canPropose','canReview'])&&Object.values(v.permissions).every(x=>typeof x==='boolean'),'El registro no informó versiones o permisos verificables.','CONTRACT_INVALID');
 check(c.revision===0?c.definition===null&&c.definitionSha256===null&&c.proposalId===null&&c.approvalId===null:salaryUuid(c.proposalId)&&salaryUuid(c.approvalId)&&salaryHash(c.definitionSha256),'La versión aprobada está incompleta.','CONTRACT_INVALID');if(c.definition!==null)annualBudgetDefinition(c.definition);
 const ids=new Set();for(const p of v.proposals){
  check(salaryExact(p,['id','body','requestSha256','createdAt','authorLabel','canReview','status','decision'])&&salaryUuid(p.id)&&salaryHash(p.requestSha256)&&text(p.authorLabel,1,160)&&Number.isFinite(Date.parse(p.createdAt))&&typeof p.canReview==='boolean'&&!ids.has(p.id),'Hay una propuesta incompleta o repetida.','CONTRACT_INVALID');ids.add(p.id);annualBudgetCommand(p.body);check(p.body.command==='propose'&&p.body.year===v.year,'La propuesta corresponde a otro ejercicio.','CONTRACT_INVALID');
  check(p.decision===null?p.status==='pending':salaryExact(p.decision,['id','command','reason','actorLabel','recordedAt','revision'])&&salaryUuid(p.decision.id)&&['approve','reject'].includes(p.decision.command)&&p.status===(p.decision.command==='approve'?'approved':'rejected')&&text(p.decision.reason,10,1000)&&text(p.decision.actorLabel,1,160)&&Number.isFinite(Date.parse(p.decision.recordedAt))&&Number.isInteger(p.decision.revision)&&p.decision.revision>=0,'La decisión está incompleta.','CONTRACT_INVALID');check(!p.canReview||p.status==='pending','La propuesta decidida no puede revisarse.','CONTRACT_INVALID');
 }
 const approvals=v.proposals.filter(p=>p.status==='approved');check(approvals.length===c.revision&&new Set(approvals.map(p=>p.decision.revision)).size===c.revision&&approvals.every(p=>p.decision.revision>=1&&p.decision.revision<=c.revision),'El historial no contiene todas las versiones aprobadas.','CONTRACT_INVALID');
 if(c.revision){const p=v.proposals.find(p=>p.id===c.proposalId);check(p?.decision?.id===c.approvalId&&p.decision.revision===c.revision&&salarySerialized(p.body.definition)===salarySerialized(c.definition),'La versión actual no corresponde a una aprobación conservada.','CONTRACT_INVALID');}
 return v;
}
export async function verifiedAnnualBudgetBootstrap(v,year){annualBudgetBootstrap(v,year);for(const p of v.proposals)check(await budgetHash(p.body)===p.requestSha256,'La huella de una propuesta no coincide.','CONTRACT_INVALID');if(v.catalog.definition)check(await budgetHash(v.catalog.definition)===v.catalog.definitionSha256,'La huella de la versión aprobada no coincide.','CONTRACT_INVALID');return v;}
export function annualBudgetVisible(definition,search='',page=1){const d=annualBudgetDefinition(definition);check(typeof search==='string'&&search.length<=120&&Number.isInteger(page)&&page>0,'Revisá la búsqueda.');const needle=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const rows=d.rows.filter(r=>Object.values(r).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle));const pages=Math.max(1,Math.ceil(rows.length/25));page=Math.min(page,pages);return {rows:rows.slice((page-1)*25,page*25),total:d.rows.length,filtered:rows.length,page,pages};}
export function annualBudgetCsv(boot){annualBudgetBootstrap(boot);check(boot.catalog.definition!==null,'Elegí una versión aprobada.');const safe=x=>'"'+String(x??'').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"';const meta=['ejercicio','revision','norma','sha256_documento','alcance_fuente','referencia_fuente'];const d=boot.catalog.definition;return '\ufeff'+[meta.concat(BUDGET_ROW_KEYS).map(safe).join(';'),...d.rows.map(r=>[boot.year,boot.catalog.revision,d.source.instrument,d.source.documentSha256,d.source.coverage,d.source.reference,...BUDGET_ROW_KEYS.map(k=>r[k])].map(safe).join(';'))].join('\r\n')+'\r\n';}
