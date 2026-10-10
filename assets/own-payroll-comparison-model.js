import {salarySerialized} from './native-salary-catalog-model.js';
import {ownRunWorkspaceResult,verifiedWorkspaceCapture,OWN_RUN_TYPES,OWN_RUN_NATURES} from './own-payroll-run-workspace-model.js';
import {decimal,exactSubtract,quantize} from './own-payroll-exact.js';
import {ownLiquidationDetail,verifiedOwnLiquidationDetail} from './own-payroll-liquidation-model.js';

export const OWN_COMPARISON_MAX_ROWS=250000;
const need=(v,message)=>{if(!v)throw Error(message);};
const precision=v=>v.split('.')[1]?.length??0;
const difference=(a,b)=>quantize(exactSubtract(decimal(b),decimal(a)),{precision:Math.max(precision(a),precision(b)),mode:'exact'}).amount;
const order=(a,b)=>a<b?-1:a>b?1:0;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const sourceProof=c=>[c.id,c.key,c.bodySha256,c.algorithmSha256,c.payloadSha256,c.createdAt,c.saved.inputSha256,c.saved.resultSha256,c.saved.recordedAt];
const ruleFor=(input,row)=>input.rules.find(r=>r.code===row.conceptCode&&(input.version!=='own-payroll-input.v2'||(r.nature==='auxiliary')===(row.nature==='auxiliary'))&&r.agreementCode===row.agreementCode&&r.validFrom<=input.period&&(r.validUntil===null||r.validUntil>=input.period)&&r.liquidationTypes.includes(input.liquidationType));

function pair(before,after,basePerson,targetPerson,label,ruleBefore=null,ruleAfter=null){
 const present=!!before&&!!after,compatible=present&&before.nature===after.nature&&before.unit===after.unit,reasons=[];
 if(!before)reasons.push('Sólo en la comparada');else if(!after)reasons.push('Sólo en la base');
 else if(!compatible)reasons.push('Cambió naturaleza o unidad; diferencia no evaluable');
 if(basePerson&&targetPerson){
  if(basePerson.employeeNumber!==targetPerson.employeeNumber)reasons.push('Cambió el número de legajo');
  if(basePerson.agreementCode!==targetPerson.agreementCode||basePerson.departmentCode!==targetPerson.departmentCode)reasons.push('Cambió convenio o repartición');
 }
 if(ruleBefore&&ruleAfter&&salarySerialized(ruleBefore)!==salarySerialized(ruleAfter))reasons.push('Cambió la regla o su respaldo');
 const delta=compatible?difference(before.amount,after.amount):null;
 const changed=!compatible||decimal(before.amount).n*decimal(after.amount).d!==decimal(after.amount).n*decimal(before.amount).d;
 return {baseNumber:basePerson?.employeeNumber??null,targetNumber:targetPerson?.employeeNumber??null,label,before:before??null,after:after??null,delta,changed,review:reasons.length>0,reasons,status:reasons.length?reasons.join(' · '):changed?'Con variación':'Sin variación',ruleBefore,ruleAfter};
}

// A contract UUID, never a converted employee number, joins the two immutable
// results. Missing participation/concept is not an amount of zero.
export function ownComparison(base,target,details=null){
 const b=ownRunWorkspaceResult(base),t=ownRunWorkspaceResult(target);
 need(b&&t,'Elegí dos resultados calculados y completos. Una captura pendiente no se compara.');
 need(base.id!==target.id&&base.key!==target.key,'Elegí dos cálculos distintos.');
 need(b.input.liquidationType===t.input.liquidationType,'Las liquidaciones deben ser del mismo tipo.');
 if(details){need(Array.isArray(details)&&details.length===2,'Falta el ámbito autorizado de ambas liquidaciones.');for(const [i,d]of details.entries()){ownLiquidationDetail(d);need(salarySerialized(d.capture)===salarySerialized(i===0?base:target),'La consulta autorizada no corresponde a su cálculo.');}need(details[0].scopeVersion===details[1].scopeVersion,'Las corridas no corresponden al mismo ámbito autorizado.');}
 else need(base.body.scopeVersion===target.body.scopeVersion,'Las corridas no corresponden al mismo ámbito autorizado.');
 for(const [capture,value]of [[base,b],[target,t]])need(value.input.period===capture.body.period&&value.input.liquidationType===capture.body.liquidationType&&salarySerialized(value.input.selection)===salarySerialized(capture.body.selection),'El resultado no corresponde al período, tipo y alcance de su captura.');
 const namespaced=[b.input.version,t.input.version].includes('own-payroll-input.v2'),rowKey=r=>r.contractId+':'+(namespaced?(r.nature==='auxiliary'?'auxiliary:':'concept:'):'')+r.conceptCode;
 const people=new Set([...b.result.employeeTotals,...t.result.employeeTotals].map(e=>e.contractId)),before=new Map(b.result.rows.map(r=>[rowKey(r),r])),after=new Map(t.result.rows.map(r=>[rowKey(r),r])),keys=new Set([...before.keys(),...after.keys()]);
 need(keys.size<=OWN_COMPARISON_MAX_ROWS&&people.size*4<=OWN_COMPARISON_MAX_ROWS,'La comparación completa supera 250.000 filas. No se omitieron ni dividieron registros.');
 const baseTotals=new Map(b.result.employeeTotals.map(e=>[e.contractId,e])),targetTotals=new Map(t.result.employeeTotals.map(e=>[e.contractId,e])),totals=[];
 const rows=[...keys].map(key=>{const a=before.get(key),z=after.get(key),r=a??z;return {contractId:r.contractId,...pair(a,z,baseTotals.has(r.contractId)?b.people.get(r.contractId):null,targetTotals.has(r.contractId)?t.people.get(r.contractId):null,r.conceptCode,a?structuredClone(ruleFor(b.input,a)):null,z?structuredClone(ruleFor(t.input,z)):null)};});
 for(const id of people)for(const [metric,label]of [['gross','Bruto'],['deduction','Retenciones'],['net','Neto calculado'],['employer_contribution','Aportes patronales']]){
  const a=baseTotals.get(id),z=targetTotals.get(id);totals.push({contractId:id,...pair(a?{nature:metric,unit:'money',amount:a[metric]}:null,z?{nature:metric,unit:'money',amount:z[metric]}:null,a?b.people.get(id):null,z?t.people.get(id):null,label)});
 }
 const sort=(a,z)=>order(a.targetNumber??a.baseNumber,z.targetNumber??z.baseNumber)||order(a.contractId,z.contractId)||order(a.label,z.label);rows.sort(sort);totals.sort(sort);
 const warnings=['Compara resultados guardados. No acredita su confirmación, cierre, homologación municipal ni pago.'];
 if(salarySerialized(b.input.selection)!==salarySerialized(t.input.selection)||baseTotals.size!==targetTotals.size||[...baseTotals.keys()].some(id=>!targetTotals.has(id)))warnings.push('Las poblaciones o los alcances son distintos. Las ausencias se muestran sin convertirlas en cero.');
 if(base.body.period>target.body.period)warnings.push('La comparada es anterior a la base. Se conserva el orden elegido.');
 if(base.body.period===target.body.period)warnings.push('Dos versiones del mismo período. Se conservan las fuentes de cada cálculo.');
 if(base.algorithmSha256!==target.algorithmSha256)warnings.push('Cambió la versión del algoritmo. Revisá las fuentes antes de interpretar diferencias.');
 return freeze({base:structuredClone(base),target:structuredClone(target),details:details?structuredClone(details):null,rows,totals,warnings,employees:people.size,proof:salarySerialized([sourceProof(base),sourceProof(target),details?.map(d=>[d.scopeVersion,d.stateVersion])??null])});
}
export async function verifiedOwnComparison(base,target){await verifiedWorkspaceCapture(base);await verifiedWorkspaceCapture(target);return ownComparison(base,target);}
export async function verifiedOwnLiquidationComparison(base,target){await verifiedOwnLiquidationDetail(base);await verifiedOwnLiquidationDetail(target);return ownComparison(base.capture,target.capture,[base,target]);}

export function ownComparisonView(model,{view='concepts',change='all',search='',page=1,pageSize=25}={}){
 need(['concepts','totals'].includes(view)&&['all','changed','review','unchanged'].includes(change)&&typeof search==='string'&&search.length<=100&&Number.isSafeInteger(page)&&page>0&&Number.isSafeInteger(pageSize)&&pageSize>0&&pageSize<=100,'Elegí una vista y filtros válidos.');
 const all=view==='concepts'?model.rows:model.totals,term=search.trim().toLowerCase(),filtered=all.filter(r=>(change==='all'||change==='changed'&&(r.changed||r.review)||change==='review'&&r.review||change==='unchanged'&&!r.changed&&!r.review)&&(!term||[r.baseNumber,r.targetNumber,r.label].some(v=>v?.toLowerCase().includes(term)))),pages=Math.max(1,Math.ceil(filtered.length/pageSize)),current=Math.min(page,pages);
 return {rows:filtered.slice((current-1)*pageSize,current*pageSize),filtered:filtered.length,total:all.length,page:current,pages,changed:all.filter(r=>r.changed).length,review:all.filter(r=>r.review).length};
}
const definition=r=>r?((OWN_RUN_NATURES[r.nature]??r.nature)+' / '+r.unit):'No figura';
export function ownComparisonDocument(model,view='concepts'){
 need(['concepts','totals'].includes(view),'Elegí conceptos o totales por legajo.');
 const m=ownComparison(model.base,model.target,model.details),rows=view==='concepts'?m.rows:m.totals;
 return {layout:'own-payroll-comparison.v1',title:view==='concepts'?'Comparación propia por legajo y concepto':'Comparación propia de totales por legajo',columns:['Legajo base','Legajo comparada',view==='concepts'?'Concepto':'Total calculado','Naturaleza / unidad: base a comparada','Base exacta','Comparada exacta','Diferencia exacta','Estado / revisión'].map(label=>({label,type:'text',width:26})),rows:rows.map(r=>[r.baseNumber??'No figura',r.targetNumber??'No figura',r.label,definition(r.before)+' a '+definition(r.after),r.before?.amount??'No figura',r.after?.amount??'No figura',r.delta??'No evaluable',r.status]),totals:[],metadata:[['Diferencia','Comparada menos base'],['Tipo',OWN_RUN_TYPES[m.base.body.liquidationType]],['Período base',m.base.body.period],['Período comparada',m.target.body.period],['Cálculo base',m.base.id],['Cálculo comparada',m.target.id],['Captura base SHA-256',m.base.payloadSha256],['Captura comparada SHA-256',m.target.payloadSha256],['Entrada base SHA-256',m.base.saved.inputSha256],['Entrada comparada SHA-256',m.target.saved.inputSha256],['Resultado base SHA-256',m.base.saved.resultSha256],['Resultado comparada SHA-256',m.target.saved.resultSha256],['Algoritmo base SHA-256',m.base.algorithmSha256],['Algoritmo comparada SHA-256',m.target.algorithmSha256],['Registros del alcance completo',rows.length],['Contratos distintos',m.employees]],notes:[...m.warnings,'Identidad enlazada por contrato propio. Los números de legajo se conservan exactamente, incluso letras, símbolos y ceros iniciales.','Una naturaleza o unidad diferente impide restar. Una regla o encuadre cambiado requiere revisión aunque el importe sea igual.','Las descargas contienen toda la comparación de la vista elegida; la búsqueda, el estado y la página no recortan filas.','Los totales provienen de cada resultado original. Los auxiliares no se suman como haberes ni se recalculan fórmulas.'],filename:'municontrol_comparacion_propia_'+view+'_'+m.base.body.period+'_'+m.target.body.period};
}
