import {verifiedWorkspaceCapture} from './own-payroll-run-workspace-model.js';
import {ownProgramBootstrap,ownProgramDefinition} from './own-payroll-program-model.js';
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {ownPayrollEmployeeNumber} from './own-payroll-engine.js';
import {verifyMonthlyBatch,assertNativeMonthlySubject} from './payroll-native-monthly-model.js';
import {ownNoveltyBatch} from './own-payroll-novelties-model.js';
import {fixedList,fixedExportData,fixedCoverage} from './payroll-fixed-novelties-model.js';

const need=(v,message='No se verificaron todas las fuentes capturadas. No se mostró una revisión parcial.')=>{if(!v)throw Error(message);};
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const active=(r,p)=>r.validFrom<=p&&(r.validUntil===null||r.validUntil>=p);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v))))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const OWN_SOURCE_ISSUES=Object.freeze({
 unused:['Sin fuente en regla vigente','Revisar las entradas de las reglas del convenio, período y tipo para este concepto.'],
 amount_missing:['Importe requerido ausente','Revisar el importe de la novedad; no reemplazar un dato ausente por cero.'],
 quantity_missing:['Unidades requeridas ausentes','Revisar las unidades de la novedad y la unidad de la entrada aprobada.'],
 ambiguous:['La regla requiere una fuente única','Revisar las novedades repetidas y la combinación declarada en la regla.'],
 retroactive:['Ajuste de otro período','Se necesita una regla expresa de retroactividad para este ajuste.'],
 forced:['Novedad en modo forzado','Se necesita una regla expresa para aplicar esta novedad forzada.'],
 partial:['Vigencia parcial','Se necesita una política expresa de prorrateo para esta vigencia.'],
});
// Inspect declared input references only. No expression, conversion, rate or
// monetary result is evaluated; the existing calculation and its hash stay intact.
export async function ownRunSourceReview(capture,attempt=null){
 await verifiedWorkspaceCapture(capture,attempt);
 const p=capture.payload,{period,liquidationType}=p;ownProgramBootstrap(p.programState);
 const program=p.programState.program;
 need(program.revision>0&&program.salaryVersion===p.programState.salaryCatalog.version,'Falta verificar el programa aprobado contra el catálogo capturado.');
 const definition=ownProgramDefinition(program.definition,p.programState.salaryCatalog.items),population=p.population;
 need(salaryExact(population,['complete','version','employees'])&&population.complete===true&&salaryHash(population.version)&&Array.isArray(population.employees)&&population.employees.length>0&&population.employees.length<=10000);
 const people=new Map(),byAgreement=new Map();
 for(const e of population.employees){
  need(salaryExact(e,['contractId','employeeNumber','agreementCode','departmentCode','categoryCode','identityToken','origin'])&&salaryUuid(e.contractId)&&ownPayrollEmployeeNumber(e.employeeNumber)&&[e.agreementCode,e.departmentCode,e.categoryCode].every(code)&&salaryHash(e.identityToken)&&e.origin==='MUNICONTROL'&&!people.has(e.contractId));people.set(e.contractId,e);
  const s=capture.body.selection;need(s.kind==='all'||s.values.includes(s.kind==='contracts'?e.contractId:s.kind==='agreements'?e.agreementCode:e.departmentCode));
  if(!byAgreement.has(e.agreementCode)){
   const keys=new Set(),walk=n=>{if(n.op==='input')keys.add(n.key);for(const k of ['left','right','value','condition','then','else'])if(n[k]&&typeof n[k]==='object')walk(n[k]);};
   definition.rules.filter(r=>r.agreementCode===e.agreementCode&&active(r,period)&&r.liquidationTypes.includes(liquidationType)).forEach(r=>walk(r.expression));
   byAgreement.set(e.agreementCode,definition.bindings.filter(b=>b.agreementCode===e.agreementCode&&keys.has(b.key)));
  }
 }
 if(capture.body.selection.kind==='contracts')need(capture.body.selection.values.length===people.size&&capture.body.selection.values.every(id=>people.has(id)));
 const rows=[],batches=new Set();
 const add=(subject,values,origin,group,rowOrdinal,partial=false)=>{
  assertNativeMonthlySubject(subject);const e=people.get(subject.contractId);need(e&&e.employeeNumber===subject.legajo&&e.identityToken===subject.identityToken&&code(values.conceptSourceId));
  need(rows.length<50000,'La revisión completa supera la capacidad. No se omitieron registros ni se mostró una lista parcial.');
  rows.push({employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,conceptCode:values.conceptSourceId,origin,group,rowOrdinal,issues:[],contractId:e.contractId,quantity:values.quantityDecimal,amount:values.amountCents,adjustment:values.adjustmentMonth,forced:values.forced,partial});
 };
 const m=p.monthly;need((salaryExact(m,['complete','batches'])||salaryExact(m,['complete','batches','nativeBatches']))&&m.complete===true&&Array.isArray(m.batches)&&m.batches.length<=10000&&(!Object.hasOwn(m,'nativeBatches')||Array.isArray(m.nativeBatches)&&m.nativeBatches.length<=1000));
 let group=0;
 for(const batch of m.batches){
  verifyMonthlyBatch(batch,{mode:'export'});need(!batches.has(batch.id)&&batch.periodMonth===period+'-01'&&batch.payrollType===liquidationType&&batch.contractVersion==='payroll-novelty-batch.v2');batches.add(batch.id);group++;
  for(const r of batch.rows){need(r.identityCurrent===true&&r.issues.every(i=>salaryExact(i,['code','severity','blocking','field','details'])&&i.code==='concept_not_observed'&&i.severity==='warning'&&i.blocking===false&&i.field==='conceptSourceId'&&salaryExact(i.details,['basis'])&&i.details.basis==='published_grh_observation'));add(r.subject,r,'monthly',group,r.rowOrdinal);}
 }
 for(const batch of m.nativeBatches??[]){
  ownNoveltyBatch(batch);need(!batches.has(batch.id)&&batch.status==='approved'&&batch.periodMonth===period+'-01'&&batch.payrollType===liquidationType&&batch.rowsSha256===await hash(batch.rows.map(({values,subject})=>({values,subject}))));batches.add(batch.id);group++;let selected=0;
  for(const r of batch.rows)if(people.has(r.values.contractId)){need(r.identityCurrent===true);add(r.subject,r.values,'monthly',group,r.values.rowOrdinal);selected++;}need(selected>0);
 }
 const list=fixedList(p.fixed.list,period+'-01'),fixed=fixedExportData(p.fixed.export,list);
 for(const r of fixed.rows){need(r.values.payrollType===liquidationType);add(r.subject,r.values,'fixed',1,null,fixedCoverage(r.values,period+'-01').partial);}
 const matches=new Map();for(const r of rows){const key=[r.contractId,r.origin,r.conceptCode].join(':');if(!matches.has(key))matches.set(key,[]);matches.get(key).push(r);}
 for(const r of rows){
  const bindings=byAgreement.get(r.agreementCode).filter(b=>b.sourceKind.startsWith(r.origin+'_')&&b.sourceCode===r.conceptCode);
  if(!bindings.length)r.issues.push('unused');
  for(const b of bindings){const field=b.sourceKind.endsWith('_quantity')?'quantity':'amount';if(r[field]===null)r.issues.push(field+'_missing');if(b.combine==='single'&&matches.get([r.contractId,r.origin,r.conceptCode].join(':')).length>1)r.issues.push('ambiguous');}
  if(r.adjustment!==undefined&&r.adjustment!==null&&r.adjustment!==period+'-01')r.issues.push('retroactive');if(r.forced)r.issues.push('forced');if(r.partial)r.issues.push('partial');
  r.issues=[...new Set(r.issues)];
 }
 return freeze({version:'own-run-source-review.v1',total:rows.length,affected:rows.filter(r=>r.issues.length).length,rows:rows.map(({contractId,quantity,amount,adjustment,forced,partial,...r})=>r)});
}
export function ownSourceReviewRows(review,search='',page=1){
 need(review?.version==='own-run-source-review.v1'&&Number.isSafeInteger(page)&&page>0&&typeof search==='string'&&search.length<=100);
 const term=search.trim().toLowerCase(),rows=review.rows.filter(r=>r.issues.length&&(!term||[r.employeeNumber,r.conceptCode,r.agreementCode].some(v=>v.toLowerCase().includes(term)))),pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);
 return {rows:rows.slice((current-1)*25,current*25),filtered:rows.length,total:review.affected,page:current,pages};
}
export async function ownSourceReviewCsv(capture,attempt=null){
 const review=await ownRunSourceReview(capture,attempt),cell=v=>'"'+String(v).replaceAll('"','""')+'"';
 const rows=review.rows.filter(r=>r.issues.length).flatMap(r=>r.issues.map(issue=>[r.origin==='monthly'?'Novedad mensual':'Novedad fija',r.group,r.rowOrdinal??'Sin fila de archivo',r.conceptCode,...OWN_SOURCE_ISSUES[issue]]));
 return '\uFEFF'+[['Origen','Lote de la captura','Fila de lote','Concepto','Estado','Accion sugerida'],...rows].map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
