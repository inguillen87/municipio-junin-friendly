import {SalaryInputError,salaryDiff,salaryItems,salaryRowKey} from './native-salary-catalog-model.js';
import {salaryBulkSelection} from './native-salary-bulk-model.js';
const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('EFFECTIVE_INPUT_INVALID',message);};
const month=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const description=row=>`${row.kind==='scale'?'Escala':row.kind==='auxiliary'?'Auxiliar':'Concepto'} ${row.code} · convenio ${row.agreementCode} · desde ${row.validFrom}`;

// Split declared monthly intervals and relink definition metadata only.
// Values, units and rules of dependent definitions are copied unchanged;
// no formula is parsed, evaluated or assigned a result.
export function salaryEffectivePlan(raw,selections,change,validFrom){
 const {current,chosen}=salaryBulkSelection(raw,selections,change);
 requireInput(month(validFrom),'Elegí el mes desde el que regirán los nuevos valores.');
 const [year,number]=validFrom.split('-').map(Number);
 const previousUntil=number===1?`${year-1}-12`:`${year}-${String(number-1).padStart(2,'0')}`;
 const affected=new Map(chosen),future=new Map();
 function canSplit(row){requireInput(row.validFrom<validFrom&&(row.validUntil===null||row.validUntil>=validFrom),`${description(row)} no contiene un tramo anterior y otro desde ${validFrom}. Revisá el mes o la selección; no se reemplazan vigencias.`);}
 for(const row of chosen.values())canSplit(row);
 let added=true;
 while(added){added=false;for(const row of current){const key=salaryRowKey(row);if(!row.active||affected.has(key)||future.has(key)||(row.validUntil!==null&&row.validUntil<validFrom)||!row.dependencies.some(dependency=>affected.has(dependency)))continue;if(row.validFrom>=validFrom){future.set(key,row);continue;}canSplit(row);affected.set(key,row);added=true;}}
 requireInput(current.length+affected.size<=1000,`La versión completa tendría ${current.length+affected.size} definiciones y el límite es 1000. No se recorta ni se divide la actualización.`);
 const nextKeys=new Map([...affected].map(([key,row])=>[key,salaryRowKey({...row,validFrom})]));
 const relink=row=>row.dependencies.map(dependency=>nextKeys.get(dependency)??dependency).sort();
 const retained=current.map(row=>affected.has(salaryRowKey(row))?{...row,validUntil:previousUntil}:future.has(salaryRowKey(row))?{...row,dependencies:relink(row)}:row);
 const started=[...affected].map(([key,row])=>({...row,validFrom,dependencies:relink(row),...(chosen.has(key)?{value:change.value,ruleReference:change.ruleReference}:{})}));
 const items=salaryItems([...retained,...started]),changes=salaryDiff(current,items);
 return {items,changes,selectedCount:chosen.size,unchangedSelectedCount:0,newDefinitionsCount:affected.size,relatedDefinitionsCount:affected.size-chosen.size+future.size,relinkedFutureDefinitionsCount:future.size,validFrom,previousUntil};
}
