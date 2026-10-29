import {ownReceiptBatch,ownReceiptVerifyHash} from './own-payroll-receipt-model.js';
import {verifiedOwnCloseReceipt,OWN_CLOSE_TOTAL_KEYS} from './own-payroll-close-model.js';
import {ownClosedJurisdiction} from './own-payroll-jurisdiction-model.js';
import {decimal,rational,exactAdd,quantize} from './own-payroll-exact.js';

const completeRecords=new WeakMap(),verified=new WeakSet(),need=(v,m)=>{if(!v)throw Error(m);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const numeric=(a,b)=>compare(BigInt(a),BigInt(b))||compare(a,b);
export function planillaJurisdiction(value){need(['all','42','55'].includes(value),'Elegí ambas jurisdicciones, J42 o J55.');return value;}
// Explicit selection over the complete, already verified emission only.
export function planillaDepartments(value){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).sort().join('|')==='kind|values'&&['all','selected'].includes(value.kind)&&Array.isArray(value.values)&&Reflect.ownKeys(value.values).length===value.values.length+1&&Reflect.ownKeys(value.values).every((key,index)=>key===(index===value.values.length?'length':String(index)))&&value.values.every(v=>typeof v==='string'&&/^\d{1,9}$/.test(v))&&new Set(value.values).size===value.values.length&&(value.kind==='all'?value.values.length===0:value.values.length>0&&value.values.length<=10000),'Elegí Todas las reparticiones o códigos distintos de la emisión completa.');
 return{kind:value.kind,values:[...value.values].sort(numeric)};
}
export function ownPlanillaDepartmentChoices(value,jurisdiction=value.jurisdiction){
 verifiedPlanilla(value);planillaJurisdiction(jurisdiction);return [...new Set(completeRecords.get(value).filter(r=>jurisdiction==='all'||r.jurisdiction===jurisdiction).map(r=>r.departmentCode))].sort(numeric);
}
export function ownPlanillaDepartmentLabel(value){verifiedPlanilla(value);return value.departmentSelection?.kind==='selected'?(value.departmentSelection.values.length<=3?'Reparticiones '+value.departmentSelection.values.join(', '):value.departmentSelection.values.length+' reparticiones seleccionadas'):'Todas las reparticiones';}
function totals(records){const precision=Math.max(0,...records.map(r=>r.precision));return Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.map(k=>[k,quantize(records.reduce((sum,r)=>exactAdd(sum,decimal(r.totals[k])),rational(0n)),{mode:'exact',precision}).amount]));}
export function verifiedPlanilla(value){need(verified.has(value),'Volvé a verificar la emisión completa antes de exportar.');return value;}
// Identity and labels belong to the reviewed emission; dimensions and amounts
// belong to its immutable close. Current employee/bank records are not sources.
export async function prepareOwnPlanilla(batchValue,closeValues,jurisdiction='all',departmentSelection=null){
 const scoped=departmentSelection!==null,departments=planillaDepartments(departmentSelection??{kind:'all',values:[]});planillaJurisdiction(jurisdiction);const batch=ownReceiptBatch(structuredClone(batchValue));closeValues=structuredClone(closeValues);await ownReceiptVerifyHash(batch.snapshot,batch.snapshotSha256);
 need(batch.state==='approved'&&batch.sourceCurrent&&batch.permissions.canDownload,'La emisión debe estar aprobada y disponible. No se descargó una preparación o emisión retirada.');
 const snapshot=batch.snapshot,sources=new Map(snapshot.sources.map(s=>[s.id.toLowerCase(),s]));
 need(Array.isArray(closeValues)&&closeValues.length===sources.size,'Consultá todos los cierres originales; no se omitió una parte.');
 const closes=new Map();
 for(const raw of closeValues){const close=await verifiedOwnCloseReceipt(raw),source=sources.get(close.groupId.toLowerCase());
  need(source&&!closes.has(close.groupId.toLowerCase())&&close.body.command==='close'&&close.snapshotSha256===source.snapshotSha256&&close.snapshot.period===source.period&&close.snapshot.liquidationType===source.type&&close.snapshot.employeeCount===source.employeeCount&&close.snapshot.populationCount===source.populationCount,'Un cierre original no coincide con la emisión aprobada.');
  const concepts=new Map();for(const c of close.snapshot.concepts){const key=c.contractId.toLowerCase(),list=concepts.get(key)??[];list.push(c);concepts.set(key,list);}
  closes.set(close.groupId.toLowerCase(),{close,employees:new Map(close.snapshot.employees.map(e=>[e.contractId.toLowerCase(),e])),concepts});
 }
 const records=snapshot.records.map(r=>{const source=closes.get(r.sourceGroupId.toLowerCase()),employee=source?.employees.get(r.contractId.toLowerCase()),original=source?.concepts.get(r.contractId.toLowerCase());
  need(employee&&['employeeNumber','runId','liquidationVersion','agreementCode','departmentCode','precision'].every(k=>employee[k]===r[k])&&OWN_CLOSE_TOTAL_KEYS.every(k=>employee.totals[k]===r.totals[k]),'Un recibo no coincide con su participación cerrada.');
  const conceptKey=(code,nature,unit,amount)=>JSON.stringify([code,nature,unit,amount]),keys=new Set((original??[]).map(o=>conceptKey(o.conceptCode,o.nature,o.unit,o.amount)));
  need((original??[]).length===r.concepts.length&&r.concepts.every(c=>keys.delete(conceptKey(c.code,c.nature,c.unit,c.amount)))&&keys.size===0,'El detalle de conceptos difiere del cierre original; no se sustituyó por un total.');
  const j=ownClosedJurisdiction(employee,source.close.snapshot.version);
  need(['captured_own_registration','captured_own_period_classification'].includes(j.basis)&&j.code!==null,'La emisión contiene una jurisdicción no conservada o sin informar. No se puede asegurar una planilla completa J42/J55; no se omitieron esas filas.');
  return {sourceGroupId:r.sourceGroupId,contractId:r.contractId,period:source.close.snapshot.period,type:source.close.snapshot.liquidationType,jurisdiction:j.code,employeeNumber:r.employeeNumber,dni:r.dni,name:r.name,agreementCode:r.agreementCode,departmentCode:r.departmentCode,liquidationVersion:r.liquidationVersion,precision:r.precision,totals:{...r.totals},concepts:r.concepts.map(c=>({...c}))};
 }).sort((a,b)=>compare(a.period,b.period)||compare(a.type,b.type)||compare(a.jurisdiction,b.jurisdiction)||numeric(a.agreementCode,b.agreementCode)||numeric(a.departmentCode,b.departmentCode)||numeric(a.dni,b.dni)||compare(a.employeeNumber,b.employeeNumber)||compare(a.contractId,b.contractId));
 const jurisdictionRecords=records.filter(r=>jurisdiction==='all'||r.jurisdiction===jurisdiction),departmentChoices=[...new Set(jurisdictionRecords.map(r=>r.departmentCode))].sort(numeric);
 need(departments.kind==='all'||departments.values.every(code=>departmentChoices.includes(code)),'Una repartición elegida no pertenece a esta emisión y jurisdicción. Consultá sus reparticiones de nuevo; no se omitió ese destino.');
 const selected=jurisdictionRecords.filter(r=>departments.kind==='all'||departments.values.includes(r.departmentCode)),groups=[];
 for(const r of selected){const key=JSON.stringify([r.period,r.type,r.jurisdiction,r.agreementCode,r.departmentCode]);let group=groups.at(-1);if(group?.key!==key){group={key,period:r.period,type:r.type,jurisdiction:r.jurisdiction,agreementCode:r.agreementCode,departmentCode:r.departmentCode,records:[]};groups.push(group);}group.records.push(r);}
 for(const group of groups)group.totals=totals(group.records);
 const value=freeze({version:scoped?'own-institutional-planilla.v2':'own-institutional-planilla.v1',...(scoped?{departmentSelection:departments,departmentChoices,excludedByJurisdiction:records.length-jurisdictionRecords.length,excludedByDepartment:jurisdictionRecords.length-selected.length,universe:{recordCount:records.length,totals:totals(records)},jurisdictionCoverage:{recordCount:jurisdictionRecords.length,totals:totals(jurisdictionRecords)}}:{}),batchId:batch.id,snapshotSha256:batch.snapshotSha256,reviewId:batch.review.id,jurisdiction,issuer:{...snapshot.params.issuer},legend:snapshot.params.legend,paymentDate:snapshot.params.paymentDate,total:records.length,selected:selected.length,excluded:records.length-selected.length,records:selected,groups,totals:totals(selected),sources:snapshot.sources.map(s=>({...s})),signatureState:'pending'});
 verified.add(value);completeRecords.set(value,freeze(records));return value;
}
export function sameOwnPlanilla(a,b){verifiedPlanilla(a);verifiedPlanilla(b);return JSON.stringify(a)===JSON.stringify(b);}
export function ownPlanillaPage(value,search='',page=1){verifiedPlanilla(value);const term=String(search).trim().toLocaleLowerCase('es'),rows=value.records.filter(r=>!term||[r.employeeNumber,r.dni,r.name,r.departmentCode].some(v=>v.toLocaleLowerCase('es').includes(term))),pages=Math.max(1,Math.ceil(rows.length/25)),p=Math.min(pages,Math.max(1,Number.isSafeInteger(page)?page:1));return {rows:rows.slice((p-1)*25,p*25),page:p,pages,total:value.selected,filtered:rows.length};}
