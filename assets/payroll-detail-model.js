/** Exact, source-derived payroll detail. No salary formula or payment approval. */
export const GROUPS=Object.freeze({
 '993':{key:'subjectEarnings',label:'Haberes remunerativos'},
 '994':{key:'nonSubjectEarnings',label:'Haberes no remunerativos'},
 '995':{key:'familyAllowance',label:'Asignaciones familiares'},
 '996':{key:'employeeWithholdings',label:'Descuentos del empleado'},
 '990':{key:'employerContributions',label:'Contribuciones patronales'},
});
const INTEGER=/^(0|[1-9][0-9]*)$/;
export function cents(value){if(typeof value!=='string'||! /^-?(0|[1-9][0-9]{0,12})\.[0-9]{2}$/.test(value))throw new Error('Importe incompleto o inválido');return BigInt(value.replace('.',''))}
export function decimal(value){const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'-':'')+String(a/100n)+'.'+String(a%100n).padStart(2,'0')}
export function money(value){if(value===null||value===undefined)return 'No informado';const n=cents(value);return (n<0n?'− ':'')+'$ '+new Intl.NumberFormat('es-AR').format((n<0n?-n:n)/100n)+','+String((n<0n?-n:n)%100n).padStart(2,'0')}
function text(v,max=200){if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw new Error('Texto documental inválido');return v}
function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new Error('Fecha inválida');return v}
export function createPayrollDetailModel(data,employee){
 if(!data||data.version!=='payroll-detail.v1'||data.found!==true||data.available!==true||!Array.isArray(data.lines)||data.lines.length<1||data.lines.length>1000||data.officialReceipt!==false||data.signatureApplied!==false)throw new Error('Detalle de liquidación no disponible');
 const name=text(employee?.name||employee?.fullName||'Persona del legajo',150),legajo=text(String(employee?.legajo??''),12);
 if(!/^[0-9]{1,12}$/.test(legajo)||!['closed','open'].includes(data.closureStatus)||!/^\d+$/.test(String(data.sourcePeriod))||!Number.isInteger(data.sourceMonth)||data.sourceMonth<1||data.sourceMonth>12)throw new Error('Contexto de liquidación inválido');
 for(const k of ['statementHash','sourceHash'])if(!/^[a-f0-9]{64}$/.test(data[k]))throw new Error('Referencia de fuente inválida');
 if(!/^[a-f0-9-]{36}$/.test(data.statementId)||! /^[A-Z]$/.test(data.payrollType))throw new Error('Identificación de liquidación inválida');
 const seen=new Set(),totals={},groups=Object.fromEntries(Object.entries(GROUPS).map(([c,g])=>[c,{...g,code:c,rows:[],sum:0n,incomplete:false}]));
 const rows=data.lines.map((r,i)=>{
  const code=text(r.code,6);if(!INTEGER.test(code)||seen.has(code))throw new Error('Concepto inválido o repetido');seen.add(code);
  const description=r.description===null?null:text(r.description,200);if(description!==null&&!description.trim())throw new Error('Descripción vacía');
  const amount=r.amount===null?null:decimal(cents(r.amount));const quantity=r.quantity===null?null:decimal(cents(r.quantity));
  const technical=Number(code)>=990&&Number(code)<=999;const group=technical?'technical':GROUPS[String(r.totalGroup)]?String(r.totalGroup):'unclassified';
  const row={ordinal:i+1,code,description:description||'Descripción pendiente en la fuente',descriptionMissing:description===null,amount,quantity,group,agreement:r.agreement===null?null:text(r.agreement,8),unit:r.unit===null?null:text(r.unit,12)};
  if(technical)totals[code]=amount;else if(groups[group]){groups[group].rows.push(row);if(amount===null)groups[group].incomplete=true;else groups[group].sum+=cents(amount)}
  return row;
 });
 const checks=Object.values(groups).map(g=>({code:g.code,key:g.key,label:g.label,detail:g.incomplete?null:decimal(g.sum),reported:totals[g.code]??null,difference:g.incomplete||totals[g.code]===null||totals[g.code]===undefined?null:decimal(g.sum-cents(totals[g.code]))}));
 const hasAll=['993','994','995','996','999'].every(c=>typeof totals[c]==='string');
 const detailKnown=rows.every(r=>!r.descriptionMissing&&r.amount!==null&&r.group!=='unclassified');
 const netDifference=hasAll?decimal(cents(totals['993'])+cents(totals['994'])+cents(totals['995'])-cents(totals['996'])-cents(totals['999'])):null;
 const history=data.historyTotals&&typeof data.historyTotals==='object'?data.historyTotals:null;
 const comparison=history?checks.map(c=>{const h=history[c.key];return {key:c.key,label:c.label,history:typeof h==='string'?decimal(cents(h)):null,reported:c.reported,difference:typeof h==='string'&&c.reported!==null?decimal(cents(c.reported)-cents(h)):null}}):[];
 if(history){const h=history.netPayable;comparison.push({key:'netPayable',label:'Neto a pagar',history:typeof h==='string'?decimal(cents(h)):null,reported:totals['999']??null,difference:typeof h==='string'&&totals['999']!==undefined&&totals['999']!==null?decimal(cents(totals['999'])-cents(h)):null})}
 const groupsList=Object.values(groups).map(g=>({...g,sum:g.incomplete?null:decimal(g.sum)}));
 return Object.freeze({version:'payroll-detail-view.v1',name,legajo,date:date(data.payrollDate),period:String(data.sourcePeriod)+'-'+String(data.sourceMonth).padStart(2,'0'),payrollType:data.payrollType,closureStatus:data.closureStatus,sourceLabel:text(data.sourceLabel,240),sourceHash:data.sourceHash,statementHash:data.statementHash,statementId:data.statementId,rows,groups:groupsList,totals,checks,netDifference,historyComparison:comparison,historyCutoff:history?.sourceCutoff??null,historyChanged:comparison.some(c=>c.difference!==null&&c.difference!=='0.00'),hasCompleteDescriptions:rows.every(r=>!r.descriptionMissing),detailKnown,exactReconciliation:detailKnown&&checks.every(c=>c.difference==='0.00')&&netDifference==='0.00',officialReceipt:false,signatureApplied:false});
}
