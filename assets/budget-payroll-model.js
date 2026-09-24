import {verifyBudgetStructure} from './budget-structure-model.js';
import {civilDate} from './civil-date.js';
export const BUDGET_MATCH_STATES=Object.freeze({present:'En documento y corrida',document_only:'Sólo en documento',payroll_only:'Sólo en corrida',ambiguous:'Referencia repetida: revisar'});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const clean=(v,n)=>typeof v==='string'&&v.length<=n&&!/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const fail=()=>{throw Error('BUDGET_PAYROLL_CONTRACT_INVALID');};
export function verifyBudgetPayrollRoster(d){
 if(!exact(d,['version','tenantId','datasetId','date','type','total','sourceLabel','closureStatus','payloadHash','reportHash','official','rows'])||d.version!=='budget-payroll-roster.v1'||d.official!==false||!uuid(d.tenantId)||!uuid(d.datasetId)||!hash(d.payloadHash)||!hash(d.reportHash)||!clean(d.sourceLabel,300)||!/^[A-Z]$/.test(d.type)||!['closed','open','unknown'].includes(d.closureStatus)||!Number.isSafeInteger(d.total)||d.total<0||d.total>2000||!Array.isArray(d.rows)||d.rows.length!==d.total)fail();
 civilDate(d.date);const seen=new Set();for(const row of d.rows){if(!exact(row,['number'])||typeof row.number!=='string'||!/^\d{1,12}$/.test(row.number)||seen.has(row.number))fail();seen.add(row.number);}return d;
}
const verified=new WeakSet();
const fold=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const frozen=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;};
export function compareBudgetPopulation(document,raw,{keyMode='literal'}={}){
 const d=verifyBudgetStructure(document),p=verifyBudgetPayrollRoster(raw);if(!['literal','numeric'].includes(keyMode))fail();
 const key=n=>keyMode==='numeric'?n.replace(/^0+(?=\d)/,''):n;
 const docIndex=new Map(),payIndex=new Map();
 for(const g of d.groups)for(const m of g.members){const k=key(m.number);if(!docIndex.has(k))docIndex.set(k,[]);docIndex.get(k).push({group:g,member:m});}
 for(const row of p.rows){const k=key(row.number);if(!payIndex.has(k))payIndex.set(k,[]);payIndex.get(k).push(row);}
 const keys=new Set([...docIndex.keys(),...payIndex.keys()]),entries=[];
 for(const k of keys){const doc=docIndex.get(k)??[],pay=payIndex.get(k)??[];
  const state=doc.length>1||pay.length>1?'ambiguous':doc.length&&pay.length?'present':doc.length?'document_only':'payroll_only';
  entries.push({key:k,state,documentRows:doc.map(({group:g,member:m})=>({groupId:g.values[0],number:m.number,sourcePage:m.sourcePage})),payrollNumbers:pay.map(r=>r.number),formatChanged:state==='present'&&doc[0].member.number!==pay[0].number});
 }
 const entriesByKey=new Map(entries.map(e=>[e.key,e]));
 const groups=d.groups.map(g=>{const groupEntries=[...new Set(g.members.map(m=>key(m.number)))].map(k=>entriesByKey.get(k));return{id:g.values[0],label:g.values[7],classification:g.values[9],codes:g.values.slice(1,7),sourcePage:g.sourcePage,declaredQuantity:Number(g.values[8]),documentAssignments:g.members.length,present:groupEntries.filter(e=>e.state==='present').length,documentOnly:groupEntries.filter(e=>e.state==='document_only').length,ambiguous:groupEntries.filter(e=>e.state==='ambiguous').length};});
 const counts=Object.fromEntries(Object.keys(BUDGET_MATCH_STATES).map(s=>[s,entries.filter(e=>e.state===s).length]));
 const result=frozen({version:'budget-population-comparison.v1',keyMode,document:{sha256:d.sha256,issuedAt:d.issuedAt,pages:d.sourcePages,issuer:d.issuer,assignments:d.groups.reduce((s,g)=>s+g.members.length,0)},payroll:{tenantId:p.tenantId,datasetId:p.datasetId,date:p.date,type:p.type,total:p.total,payloadHash:p.payloadHash,reportHash:p.reportHash,closureStatus:p.closureStatus,sourceLabel:p.sourceLabel},counts,groups,entries,approvedQuota:null,positionAssignmentVerified:false,official:false});verified.add(result);return result;
}
export function budgetComparisonDocument(model){
 if(!verified.has(model))fail();const c=(label,type,width)=>({label,type,width});
 return{title:'Cotejo documental con nómina',columns:[c('ID','text',7),c('Estructura del PDF','text',38),c('Cant del PDF','integer',12),c('Detalle del PDF','integer',14),c('En ambas fuentes','integer',15),c('Sólo en PDF','integer',13),c('Referencias a revisar','integer',17)],rows:model.groups.map(g=>[g.id,g.label,g.declaredQuantity,g.documentAssignments,g.present,g.documentOnly,g.ambiguous]),totals:[],
 notes:['Cotejo de legajos, no validación del cargo liquidado ni del cupo presupuestario anual. Cant no es cupo aprobado.',
 'PDF emitido '+model.document.issuedAt+'; corrida '+model.payroll.date+' ('+model.payroll.type+'). No se infiere vigencia histórica, vacante, pago ni ausencia.',
 'Claves: '+(model.keyMode==='literal'?'texto exacto, conservando ceros.':'comparación numérica elegida; se conservan textos originales. Las colisiones no se resuelven automáticamente.'),
 'Referencias sólo en corrida: '+model.counts.payroll_only+'. Ambiguas: '+model.counts.ambiguous+'. Resumen de todas las estructuras, independiente del filtro de detalle.',
 'PDF SHA-256: '+model.document.sha256,'Conjunto SHA-256: '+model.payroll.payloadHash],
 metadata:[['Municipio',model.document.issuer],['Período',model.payroll.date],['Tipo',model.payroll.type],['Estado',model.payroll.closureStatus==='closed'?'Cierre informado por origen':model.payroll.closureStatus==='open'?'Corrida abierta':'Cierre no informado'],['Legajos de la corrida',model.payroll.total],['Filas del filtro',model.groups.length],['Conjunto',model.payroll.datasetId],['SHA-256',model.payroll.reportHash]],filename:'municontrol_cotejo_cargos_'+model.payroll.date+'_'+model.payroll.type.toLowerCase()};
}
