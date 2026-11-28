// Altas por archivo: lee una lista de legajos preparada fuera del navegador y la valida con el mismo contrato del alta individual.
import {employeeDraft,EMPLOYEE_FIELDS} from './native-employee-contract.js';
import {employeeRegistrationOptions} from './native-employee-confirmation-model.js';
export const EMPLOYEE_BULK_VERSION='native-employee-bulk.v1';
export const EMPLOYEE_BULK_MAX=50;
export const EMPLOYEE_BULK_MAX_BYTES=262144;
export class EmployeeBulkError extends Error{constructor(message){super(message);this.name='EmployeeBulkError';}}
const fail=message=>{throw new EmployeeBulkError(message);};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
// Devuelve una fila por legajo del archivo: {index,draft,labels,error}. Una fila con error no se envía.
export function employeeBulkRows(text,context){
 if(typeof text!=='string'||!text.trim()||text.length>EMPLOYEE_BULK_MAX_BYTES)fail('El archivo está vacío o supera el tamaño admitido.');
 let file;try{file=JSON.parse(text);}catch{fail('El archivo no es un JSON válido.');}
 if(!object(file)||Object.keys(file).sort().join('|')!=='employees|version'||file.version!==EMPLOYEE_BULK_VERSION||!Array.isArray(file.employees))fail('El archivo no tiene el formato de altas de MuniControl.');
 if(!file.employees.length||file.employees.length>EMPLOYEE_BULK_MAX)fail('El archivo debe traer entre 1 y '+EMPLOYEE_BULK_MAX+' legajos.');
 const items=context.catalog.items,option=(kind,code,agreement)=>employeeRegistrationOptions(items,kind).find(item=>item.code===code&&(kind!=='categories'||item.agreementCode===agreement));
 const seen={legajo:new Set(),dni:new Set(),cuil:new Set()};
 return file.employees.map((entry,index)=>{
  try{
   if(!object(entry))fail('La fila no es un legajo.');
   const draft=employeeDraft(Object.fromEntries(EMPLOYEE_FIELDS.map(key=>[key,entry[key]])),context.today,{requireJurisdiction:true});
   if(Object.keys(entry).length!==EMPLOYEE_FIELDS.length)fail('La fila trae campos no admitidos.');
   const labels={agreement:option('agreements',draft.agreementCode),category:option('categories',draft.categoryCode,draft.agreementCode),organization:option('organizations',draft.organizationId),sector:option('sectors',draft.sectorCode)};
   for(const [kind,found] of Object.entries(labels))if(!found)fail({agreement:'El convenio',category:'La categoría',organization:'El sector',sector:'La repartición'}[kind]+' no está habilitado para nuevas altas.');
   for(const key of ['legajo','dni','cuil']){if(draft[key]&&seen[key].has(draft[key]))fail('Repite '+key.toUpperCase()+' de otra fila del archivo.');if(draft[key])seen[key].add(draft[key]);}
   return {index,draft,labels:Object.fromEntries(Object.entries(labels).map(([kind,item])=>[kind,item.label])),error:null};
  }catch(error){return {index,draft:null,labels:null,name:object(entry)&&typeof entry.fullName==='string'?entry.fullName.slice(0,160):'',legajo:object(entry)&&typeof entry.legajo==='string'?entry.legajo.slice(0,9):'',error:error?.message||'Fila inválida.'};}
 });
}
