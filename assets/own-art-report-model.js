import {salaryExact,salaryUuid,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {OWN_CLOSE_NOMINAL,ownCloseReceipt,verifiedOwnCloseReceipt} from './own-payroll-close-model.js';
import {ownReportQuery} from './own-payroll-report-model.js';
import {ownClosedJurisdiction} from './own-payroll-jurisdiction-model.js';
import {decimal,quantize} from './own-payroll-exact.js';
import {artDaysConfiguration} from './own-art-days-model.js';
import {validCuil} from './native-employee-contract.js';
export const OWN_ART_READ=Object.freeze([...new Set([...OWN_CLOSE_NOMINAL,'payroll.parameter.read'])]);
export const OWN_ART_MAX_BYTES=32*1024*1024;
const trustedSources=new WeakSet(),trusted=new WeakSet(),need=(v,m)=>{if(!v)throw Error(m);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function ownArtParams(v){need(salaryExact(v,['period','types']),'Elegí período y tipos completos.');const q=ownReportQuery({from:v.period,to:v.period,types:v.types});return {period:q.from,types:q.types};}
export function ownArtSource(v){
 need(salaryExact(v,['version','scopeVersion','sourceVersion','content'])&&v.version==='own-art-preview.v1'&&[v.scopeVersion,v.sourceVersion].every(salaryHash),'No se verificó la consulta ART propia.');
 const c=v.content;need(salaryExact(c,['version','params','groups','people','sourceRecordCount','complete','origin'])&&c.version==='own-art-source.v1'&&c.complete===true&&c.origin==='MUNICONTROL','La fuente debe ser propia y completa.');ownArtParams(c.params);
 need(Array.isArray(c.groups)&&c.groups.length<=1000&&Array.isArray(c.people)&&c.people.length<=10000&&Number.isSafeInteger(c.sourceRecordCount)&&c.sourceRecordCount>=0&&c.sourceRecordCount<=20000,'El conjunto completo supera su capacidad; no se recortaron agentes.');
 const contracts=new Map(),ids=new Set(),destinations=new Set();let count=0;
 for(const p of c.people){need(salaryExact(p,['contractId','personId','registrationId','employeeNumber','name','dni','cuil','sex','identityToken','days','daysCurrent'])&&[p.contractId,p.personId,p.registrationId].every(salaryUuid)&&!contracts.has(p.contractId)&&salaryHash(p.identityToken)&&(p.daysCurrent===null||typeof p.daysCurrent==='boolean'),'Una identidad está repetida o incompleta.');artDaysConfiguration(p.days,c.params.period);contracts.set(p.contractId,p);}
 for(const g of c.groups){ownCloseReceipt(g);need(g.body.command==='close'&&g.groupId===g.id&&!ids.has(g.id)&&g.snapshot.period===c.params.period&&c.params.types.includes(g.snapshot.liquidationType),'Un cierre está repetido o pertenece a otro período o tipo.');ids.add(g.id);
  for(const e of g.snapshot.employees){const p=contracts.get(e.contractId),key=g.snapshot.liquidationType+':'+e.contractId;need(p&&p.employeeNumber===e.employeeNumber&&!destinations.has(key),'Falta la identidad propia o se repitió un contrato para el mismo tipo de liquidación.');destinations.add(key);count++;}
 }
 need(count===c.sourceRecordCount&&contracts.size===new Set(c.groups.flatMap(g=>g.snapshot.employees.map(e=>e.contractId))).size,'Faltan contratos del conjunto completo.');return v;
}
export async function verifiedOwnArtSource(v){ownArtSource(v);for(const g of v.content.groups)await verifiedOwnCloseReceipt(g);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v.content))))].map(b=>b.toString(16).padStart(2,'0')).join('');need(hash===v.sourceVersion,'Cambió la fuente conservada del reporte ART.');freeze(v);trustedSources.add(v);return v;}
const cents=amount=>{const s=quantize(decimal(amount),{precision:2,mode:'exact'}).amount;need(!s.startsWith('-'),'El sueldo ART requiere importes no negativos.');return BigInt(s.replace('.',''));};
export function prepareOwnArtReport(source){
 need(trustedSources.has(source),'Verificá la fuente completa y su huella antes de preparar ART.');const c=source.content,people=new Map(c.people.map(p=>[p.contractId,p])),agents=new Map();
 for(const g of c.groups)for(const e of g.snapshot.employees){const p=people.get(e.contractId);let row=agents.get(p.personId);if(!row){row={personId:p.personId,contracts:[],employeeNumber:p.employeeNumber,name:p.name,dni:p.dni,cuil:p.cuil,sex:p.sex,workedDays:null,concept993Cents:null,concept995Cents:null,salaryCents:null,financialCount:0,jurisdictions:[],sources:[],issues:[]};agents.set(p.personId,row);}
  const first=!row.contracts.includes(e.contractId);if(first){row.contracts.push(e.contractId);if(row.contracts.length>1)row.issues.push('Más de un contrato del mismo agente: revisar los días y el alcance antes de exportar.');
   if(!p.daysCurrent||p.days.revision===0)row.issues.push('Faltan días aprobados para la identidad y el período vigentes.');else if(p.days.definition.workedDays===null)row.issues.push('Días trabajados sin informar; no se supone 30.');else row.workedDays=p.days.definition.workedDays;
  }
  let jurisdiction;try{jurisdiction=ownClosedJurisdiction(e,g.snapshot.version).code;}catch{row.issues.push('Jurisdicción no documentada en el cierre original.');}if(jurisdiction&&!row.jurisdictions.includes(jurisdiction))row.jurisdictions.push(jurisdiction);
  row.sources.push({id:g.id,sha256:g.snapshotSha256,type:g.snapshot.liquidationType,runId:e.runId,liquidationVersion:e.liquidationVersion,contractId:e.contractId});
  for(const code of ['993','995']){const lines=g.snapshot.concepts.filter(r=>r.contractId===e.contractId&&r.conceptCode===code);if(lines.length!==1||lines[0].unit!=='money'){row.issues.push('Falta un valor monetario único de '+code+' en '+g.snapshot.liquidationType+'.');continue;}try{const value=cents(lines[0].amount),key='concept'+code+'Cents';row[key]=(BigInt(row[key]??'0')+value).toString();row.financialCount++;}catch{row.issues.push('El valor '+code+' no tiene centavos exactos no negativos. No se redondea.');}}
 }
 const rows=[...agents.values()];const cuils=new Set(),dnis=new Set();
 for(const row of rows){if(typeof row.dni!=='string'||!/^\d{5,12}$/.test(row.dni)||typeof row.cuil!=='string'||!validCuil(row.cuil)||row.cuil.slice(2,10)!==row.dni.padStart(8,'0'))row.issues.push('DNI o CUIL faltante, inválido o incompatible.');if(!['F','M','X'].includes(row.sex))row.issues.push('Sexo sin informar en la identidad propia.');if(cuils.has(row.cuil)||dnis.has(row.dni))row.issues.push('Identidad duplicada entre agentes: no se unifica automáticamente.');cuils.add(row.cuil);dnis.add(row.dni);if(row.jurisdictions.length!==1)row.issues.push('El agente no tiene una jurisdicción única documentada.');if(row.financialCount===row.sources.length*2&&row.concept993Cents!==null&&row.concept995Cents!==null)row.salaryCents=(BigInt(row.concept993Cents)+BigInt(row.concept995Cents)).toString();row.issues=[...new Set(row.issues)];}
 // A repeated nominal identity disables the whole file, including the first row.
 const result=freeze({version:'own-art-report.v1',period:c.params.period,types:[...c.params.types],scopeVersion:source.scopeVersion,sourceVersion:source.sourceVersion,sourceRecordCount:c.sourceRecordCount,total:rows.length,rows,issueCount:rows.reduce((n,r)=>n+r.issues.length,0),canExport:rows.length>0&&rows.every(r=>r.issues.length===0),salaryCents:rows.every(r=>r.salaryCents!==null)?rows.reduce((n,r)=>n+BigInt(r.salaryCents),0n).toString():null});trusted.add(result);return result;
}
export function trustedOwnArtReport(v){need(trusted.has(v),'Volvé a verificar la fuente completa antes de descargar.');return v;}
export function ownArtVisibleRows(v,search='',page=1){trustedOwnArtReport(v);need(Number.isSafeInteger(page)&&page>0,'Página inválida.');const term=String(search).toLocaleLowerCase('es').trim(),rows=v.rows.filter(r=>!term||[r.employeeNumber,r.name,...r.issues].some(s=>String(s).toLocaleLowerCase('es').includes(term))),pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);return {rows:rows.slice((current-1)*25,current*25),filtered:rows.length,total:v.total,page:current,pages};}
export const artCentsText=v=>{const s=String(v??'');return /^\d+$/.test(s)?s.padStart(3,'0').slice(0,-2)+'.'+s.padStart(3,'0').slice(-2):'Sin informar';};
