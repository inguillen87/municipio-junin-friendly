import {SalaryInputError,salaryExact,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {salaryEffectiveDefinitionsPlan} from './native-salary-effective-model.js';
import {decimal,exactAdd,exactCompare,exactDivide,exactMultiply,quantize} from './own-payroll-exact.js';
const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('EFFECTIVE_INPUT_INVALID',message);};
const month=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const description=row=>`Escala ${row.code} · convenio ${row.agreementCode} · desde ${row.validFrom}`;

// An explicitly selected scale increase prepares definitions, never salaries.
// Exact arithmetic is shared with the published decimal primitives; rounding
// modes, formula evaluation and automatic approval are not offered here.
export function salaryEffectivePercentagePlan(raw,selections,change,validFrom){
 const current=salaryItems(raw),byKey=new Map(current.map(row=>[salaryRowKey(row),row])),chosen=new Map();
 requireInput(salaryExact(change,['percentage','precision','ruleReference','sourceMonth'])&&month(change.sourceMonth)&&month(validFrom)&&change.sourceMonth<validFrom,'Declará el mes base y un mes posterior para la nueva vigencia.');
 requireInput(Number.isInteger(change.precision)&&change.precision>=0&&change.precision<=8,'Elegí explícitamente de 0 a 8 decimales para las nuevas escalas.');
 requireInput(typeof change.percentage==='string'&&/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,8})?$/.test(change.percentage),'Informá un porcentaje exacto positivo, sin separador de miles ni exponente.');
 const rate=decimal(change.percentage);
 requireInput(exactCompare(rate,decimal('0'))>0,'El porcentaje de aumento debe ser mayor que cero.');
 requireInput(Array.isArray(selections)&&selections.length>0&&selections.length<=1000,'Seleccioná las escalas que alcanza el aumento; no se recortan filas.');
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
 const plan=salaryEffectiveDefinitionsPlan(current,chosen,key=>updates.get(key),validFrom);
 return {...plan,sourceMonth:change.sourceMonth,percentage:change.percentage,scaleComparisons:[...chosen].map(([key,row])=>({key,before:row.value,after:updates.get(key).value,precision:change.precision}))};
}
