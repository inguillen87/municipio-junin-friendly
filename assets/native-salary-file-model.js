import {SalaryInputError,salaryDiff,salaryItems,salarySerialized} from './native-salary-catalog-model.js';

export const SALARY_FILE_MAX_BYTES=2*1024*1024;
export const SALARY_FILE_HEADER=Object.freeze(['tipo','convenio','clase','codigo','descripcion','naturaleza','unidad','decimales','valor','desde','hasta','respaldo','dependencias','activo']);
const kinds={concepto:'concept',auxiliar:'auxiliary',escala:'scale'},natures={remunerativo:'remuneration',no_remunerativo:'non_remuneration',retencion:'deduction',contribucion_patronal:'employer_contribution',auxiliar:'auxiliary'},units={pesos:'money',horas:'hours',minutos:'minutes',porcentaje:'percent',unidades:'units',coeficiente:'coefficient'};
const fail=message=>{throw new SalaryInputError('FILE_INPUT_INVALID',message);};
const reverse=(map,value)=>Object.keys(map).find(k=>map[k]===value);
// Nonempty cells are exported as literal text, including codes and exact decimals.
// One leading apostrophe is the documented text marker; a literal apostrophe is doubled.
const literal=value=>value.startsWith("'")?value.slice(1):value;
const cell=value=>'"'+(value===''?'':"'"+value).replaceAll('"','""')+'"';
function csvRows(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>SALARY_FILE_MAX_BYTES)fail('El CSV supera 2 MiB. No se cargó ninguna fila.');
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 const rows=[];let row=[],value='',quoted=false,closed=false,started=false;
 const field=()=>{row.push(value);if(row.length>SALARY_FILE_HEADER.length)fail('El CSV contiene columnas adicionales. Usá la plantilla completa del maestro.');value='';closed=false;started=false;};
 const record=()=>{field();rows.push(row);row=[];if(rows.length>1001)fail('El CSV supera 1.000 definiciones. No se recortó ni se dividió el archivo.');};
 for(let n=0;n<text.length;n++){
  const c=text[n];
  if(quoted){if(c==='"'){if(text[n+1]==='"'){value+='"';n++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c===';'){field();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[n+1]==='\n')n++;record();continue;}
  if(closed)fail('Hay caracteres después de una celda entre comillas. Revisá el CSV; no se cargaron filas.');
  if(c==='"'){if(started)fail('Hay comillas fuera de una celda. Revisá el CSV; no se cargaron filas.');quoted=true;started=true;}else{value+=c;started=true;}
 }
 if(quoted)fail('El CSV tiene una celda sin cerrar. No se cargó ninguna fila.');
 if(row.length||started||closed||value)record();
 if(!rows.length||salarySerialized(rows[0])!==salarySerialized(SALARY_FILE_HEADER))fail('La cabecera no coincide con la plantilla del maestro salarial. No se admiten columnas nominales ni fórmulas.');
 return rows.slice(1);
}
export function salaryFileExport(raw=[]){
 const rows=salaryItems(raw,{allowEmpty:true});
 const text='\ufeff'+SALARY_FILE_HEADER.map(k=>'"'+k+'"').join(';')+'\r\n'+rows.map(r=>[
  reverse(kinds,r.kind),r.agreementCode,r.categoryCode??'',r.code,r.label,r.nature?reverse(natures,r.nature):'',reverse(units,r.unit),String(r.precision),r.value??'',r.validFrom,r.validUntil??'',r.ruleReference,r.dependencies.join('|'),r.active?'si':'no'
 ].map(cell).join(';')+'\r\n').join('');
 if(new TextEncoder().encode(text).length>SALARY_FILE_MAX_BYTES)fail('El CSV completo supera 2 MiB. No se descargó un archivo recortado.');
 return text;
}
export function salaryFilePlan(raw,text,classification){
 const before=salaryItems(raw,{allowEmpty:true}),records=csvRows(text);
 if(!records.length)fail('La plantilla no contiene definiciones. Completala antes de comparar.');
 if(!Array.isArray(classification))fail('Volvé a consultar el catálogo de convenios y clases.');
 const rows=records.map((record,n)=>{
  const at='Fila '+(n+2)+': ';
  if(record.length!==SALARY_FILE_HEADER.length)fail(at+'faltan columnas de la plantilla. No se cargaron filas.');
  const [kind,agreementCode,categoryCode,code,label,nature,unit,precision,value,validFrom,validUntil,ruleReference,dependencies,active]=record.map(literal);
  if(!/^[0-8]$/.test(precision)||!['si','no'].includes(active))fail(at+'declarales decimales (0 a 8) y estado (si o no), sin fórmulas.');
  const r={kind:kinds[kind],agreementCode,categoryCode:categoryCode===''?null:categoryCode,code,label,nature:nature===''?null:natures[nature],unit:units[unit],precision:Number(precision),value:value===''?null:value,validFrom,validUntil:validUntil===''?null:validUntil,ruleReference,dependencies:dependencies===''?[]:dependencies.split('|'),active:active==='si'};
  try{salaryItems([{...r,dependencies:[]}]);}catch(e){fail(at+e.message);}
  if(classification.filter(c=>c.kind==='agreements'&&c.code===agreementCode).length!==1||r.kind==='scale'&&classification.filter(c=>c.kind==='categories'&&c.agreementCode===agreementCode&&c.code===categoryCode).length!==1)fail(at+'el convenio o la clase no coincide de forma única con el catálogo consultado.');
  return r;
 });
 // Complete validation catches cycles, overlaps, missing dependencies and history loss.
 // The file must retain every definition already in the local draft.
 const items=salaryItems(rows),changes=salaryDiff(before,items);
 return {beforeVersion:salarySerialized(before),items,changes,total:items.length,newCount:changes.filter(c=>c.before===null).length,changedCount:changes.filter(c=>c.before!==null).length,unchangedCount:items.length-changes.length};
}
