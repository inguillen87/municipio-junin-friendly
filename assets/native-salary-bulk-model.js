import {SALARY_UNITS,SalaryInputError,salaryDiff,salaryExact,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';

const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('BULK_INPUT_INVALID',message);};

// A local draft transformation only. The existing complete-version command
// remains the sole write; precision, units, dates and dependencies are preserved.
export function salaryBulkSelection(raw,selections,change){
 const current=salaryItems(raw),byKey=new Map(current.map(row=>[salaryRowKey(row),row]));
 requireInput(Array.isArray(selections)&&selections.length>0&&selections.length<=1000,'Seleccioná las definiciones que querés actualizar; no se recortan filas.');
 requireInput(salaryExact(change,['unit','precision','value','ruleReference'])&&Object.hasOwn(SALARY_UNITS,change.unit)&&Number.isInteger(change.precision)&&change.precision>=0&&change.precision<=8,'Elegí la unidad y la precisión declaradas en las filas.');
 requireInput(change.value===null||typeof change.value==='string','Declarar un valor requiere una cadena decimal exacta; no se convierte a número.');
 const chosen=new Map();
 for(const selection of selections){
  requireInput(salaryExact(selection,['key','before'])&&typeof selection.key==='string'&&selection.before&&selection.key===salaryRowKey(selection.before),'No se pudo verificar una fila seleccionada. Volvé a seleccionarla.');
  requireInput(!chosen.has(selection.key),'Hay una definición seleccionada más de una vez.');
  const row=byKey.get(selection.key);
  requireInput(row&&salarySerialized(row)===salarySerialized(selection.before),'Cambió una fila seleccionada. Quitá la selección anterior y revisá la definición actual.');
  requireInput(row.active,'Una definición desactivada conserva sus antecedentes. Revisala individualmente.');
  requireInput(row.unit===change.unit&&row.precision===change.precision,'Todas las filas seleccionadas deben tener la unidad y precisión indicadas. No se convierten horas, porcentajes o importes.');
  requireInput(row.kind!=='scale'||change.value!==null,'Una escala requiere un valor explícito. No puede quedar como no informado.');
  chosen.set(selection.key,row);
 }
 return {current,chosen};
}
export function salaryBulkPlan(raw,selections,change){
 const {current,chosen}=salaryBulkSelection(raw,selections,change);
 const items=salaryItems(current.map(row=>chosen.has(salaryRowKey(row))?{...row,value:change.value,ruleReference:change.ruleReference}:row));
 const changes=salaryDiff(current,items);
 requireInput(changes.length>0,'La selección y los datos declarados no producen cambios.');
 return {items,changes,selectedCount:chosen.size,unchangedSelectedCount:chosen.size-changes.length};
}
