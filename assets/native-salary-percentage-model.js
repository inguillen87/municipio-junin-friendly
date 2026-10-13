import {SALARY_MAX_ITEMS,SalaryInputError,salaryDiff,salaryExact,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {salaryEffectiveDefinitionsPlan} from './native-salary-effective-model.js';
import {decimal,exactAdd,exactCompare,exactDivide,exactMultiply,exactSubtract,quantize} from './own-payroll-exact.js';
const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('EFFECTIVE_INPUT_INVALID',message);};
const month=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const description=row=>`Escala ${row.code} · convenio ${row.agreementCode} · desde ${row.validFrom}`;

function closedPeriodPlan(current,chosen,updates,validFrom,validUntil){
 requireInput(month(validUntil)&&validUntil>=validFrom,'Declarale un mes final válido al período nuevo. No se prolonga la vigencia de origen.');
 for(const row of chosen.values())requireInput(row.validUntil!==null&&row.validUntil<validFrom,`${description(row)} debe tener una vigencia finalizada antes del período nuevo. Se conserva su fecha final original.`);
 requireInput(current.length+chosen.size<=SALARY_MAX_ITEMS,`La versión completa tendría ${current.length+chosen.size} definiciones y el límite es ${SALARY_MAX_ITEMS}. No se recorta ni se divide la preparación.`);
 const started=[...chosen].map(([key,row])=>({...row,...updates.get(key),validFrom,validUntil}));
 // Every source definition is retained unchanged. Only selected scales get a new
 // interval; unrelated facts, values and dependencies never gain new validity.
 const items=salaryItems([...current,...started]),changes=salaryDiff(current,items);
 return {items,changes,selectedCount:chosen.size,unchangedSelectedCount:0,newDefinitionsCount:chosen.size,relatedDefinitionsCount:0,relinkedFutureDefinitionsCount:0,validFrom,previousUntil:null,validUntil,preparationMode:'closed_period'};
}

// An explicitly selected scale increase prepares definitions, never salaries.
// Exact arithmetic is shared with the published decimal primitives; rounding
// modes, formula evaluation and automatic approval are not offered here.
export function salaryEffectivePercentagePlan(raw,selections,change,validFrom){
 const current=salaryItems(raw),byKey=new Map(current.map(row=>[salaryRowKey(row),row])),chosen=new Map();
 const closedPeriod=change!==null&&typeof change==='object'&&Object.hasOwn(change,'validUntil');
 requireInput(salaryExact(change,['percentage','precision','ruleReference','sourceMonth',...(closedPeriod?['validUntil']:[])])&&month(change.sourceMonth)&&month(validFrom)&&change.sourceMonth<validFrom,'Declará el mes base y un mes posterior para la nueva vigencia.');
 requireInput(Number.isInteger(change.precision)&&change.precision>=0&&change.precision<=8,'Elegí explícitamente de 0 a 8 decimales para las nuevas escalas.');
 requireInput(typeof change.percentage==='string'&&/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,8})?$/.test(change.percentage),'Informá un porcentaje exacto positivo, sin separador de miles ni exponente.');
 const rate=decimal(change.percentage);
 requireInput(exactCompare(rate,decimal('0'))>0,'El porcentaje de aumento debe ser mayor que cero.');
 requireInput(Array.isArray(selections)&&selections.length>0&&selections.length<=SALARY_MAX_ITEMS,'Seleccioná las escalas que alcanza el aumento; no se recortan filas.');
 for(const selection of selections){
  requireInput(salaryExact(selection,['key','before'])&&typeof selection.key==='string'&&selection.before&&selection.key===salaryRowKey(selection.before),'No se pudo verificar una escala seleccionada. Volvé a seleccionarla.');
  requireInput(!chosen.has(selection.key),'Hay una escala seleccionada más de una vez.');
  const row=byKey.get(selection.key);
  requireInput(row&&salarySerialized(row)===salarySerialized(selection.before),'Cambió una escala seleccionada. Quitá la selección anterior y revisá la definición actual.');
  requireInput(row.active&&row.kind==='scale'&&row.unit==='money'&&row.value!==null,'Seleccioná únicamente escalas activas con importe explícito. Los auxiliares y conceptos no se aumentan automáticamente.');
  requireInput(row.validFrom<=change.sourceMonth&&(row.validUntil===null||row.validUntil>=change.sourceMonth),`${description(row)} no está vigente en el mes base ${change.sourceMonth}. Revisá la selección completa.`);
  chosen.set(selection.key,row);
 }
 const factor=exactAdd(decimal('1'),exactDivide(rate,decimal('100'))),updates=new Map();
 for(const [key,row] of chosen){
  let value;try{value=quantize(exactMultiply(decimal(row.value),factor),{precision:change.precision,mode:'exact'}).amount;}catch(error){if(error.code!=='ROUNDING_NEEDED')throw error;throw new SalaryInputError('PERCENTAGE_PRECISION_REQUIRED',`${description(row)} no puede expresarse con ${change.precision} decimales sin redondear. Revisá la precisión declarada; se conserva todo el conjunto.`);}
  requireInput(value.replace(/^-/, '').split('.')[0].length<=18,`${description(row)} supera la capacidad de 18 dígitos enteros. No se recorta el resultado.`);
  updates.set(key,{value,precision:change.precision,ruleReference:change.ruleReference});
 }
 const plan=closedPeriod?closedPeriodPlan(current,chosen,updates,validFrom,change.validUntil):salaryEffectiveDefinitionsPlan(current,chosen,key=>updates.get(key),validFrom);
 return {...plan,sourceMonth:change.sourceMonth,percentage:change.percentage,scaleComparisons:[...chosen].map(([key,row])=>{
  const after=updates.get(key).value,incrementPrecision=Math.max(row.precision,change.precision);
  const increment=quantize(exactSubtract(decimal(after),decimal(row.value)),{precision:incrementPrecision,mode:'exact'}).amount;
  return {key,before:row.value,beforePrecision:row.precision,increment,incrementPrecision,after,precision:change.precision};
 })};
}

const comparisonCell=value=>'"'+(value===''?'':"'"+String(value)).replaceAll('"','""')+'"';
const sameDefinition=(a,b)=>['kind','agreementCode','categoryCode','code'].every(key=>a[key]===b[key]);
// Recompute the complete reviewed transformation, including dependent metadata.
// No names, free text, employee identifiers or source-document bytes are exported.
export function salaryPercentageComparisonCsv(raw,selections,change,validFrom,review){
 const plan=salaryEffectivePercentagePlan(raw,selections,change,validFrom);
 requireInput(review&&salarySerialized(review)===salarySerialized(plan),'Cambió la comparación revisada. Volvé a comparar antes de descargar.');
 const current=new Map(salaryItems(raw).map(row=>[salaryRowKey(row),row])),scales=new Map(plan.scaleComparisons.map(row=>[row.key,row]));
 const closed=plan.changes.filter(row=>row.before&&row.before.validUntil!==row.after.validUntil);
 const preservedSources=plan.preparationMode==='closed_period'?selections.map(row=>current.get(row.key)):[];
 const header=['tipo','convenio','clase','codigo','cambio','mes_base','desde_base','hasta_base','desde_propuesto','hasta_propuesto','valor_base','decimales_base','aumento_porcentaje','incremento_exacto','decimales_incremento','valor_propuesto','decimales_propuestos','unidad','dependencias_propuestas'];
 const rows=plan.changes.map(row=>{
  const before=row.before??closed.find(prior=>sameDefinition(prior.before,row.after))?.before??preservedSources.find(prior=>sameDefinition(prior,row.after));
  requireInput(before,'No se pudo verificar el antecedente de una nueva vigencia. Volvé a comparar.');
  const increased=!row.before?scales.get(salaryRowKey(before)):null;
  requireInput(current.has(salaryRowKey(before)),'El antecedente no pertenece al conjunto completo revisado.');
  return [({scale:'escala',auxiliary:'auxiliar',concept:'concepto'})[row.after.kind],row.after.agreementCode,row.after.categoryCode??'',row.after.code,row.before?(row.before.validUntil!==row.after.validUntil?'cierre_vigencia':'referencia_futura'):'nueva_vigencia',plan.sourceMonth,before.validFrom,before.validUntil??'',row.after.validFrom,row.after.validUntil??'',before.value??'',before.precision,increased?plan.percentage:'',increased?.increment??'',increased?.incrementPrecision??'',row.after.value??'',row.after.precision,row.after.unit,row.after.dependencies.join('|')];
 });
 const text='\ufeff'+header.map(value=>'"'+value+'"').join(';')+'\r\n'+rows.map(row=>row.map(comparisonCell).join(';')).join('\r\n')+'\r\n';
 requireInput(new TextEncoder().encode(text).length<=2*1024*1024,'La comparación completa supera 2 MiB. No se recorta la descarga.');
 return {filename:`comparacion-escalas-${plan.sourceMonth}-${plan.validFrom}.csv`,text,rows:rows.length,selectedScales:plan.selectedCount};
}
