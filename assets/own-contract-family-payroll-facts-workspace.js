// Trabajo de pantalla para los hechos familiares de liquidación (propuesta, todavía sin backend): borrador completo,
// búsqueda paginada, planilla CSV, preparación JSON y comparación. Mismo criterio que Condiciones salariales:
// una celda vacía es «sin informar» y nunca se convierte en cero; el conjunto no se recorta ni se completa solo.
import {familyPayrollFactsBootstrap,familyPayrollFactsItems,FAMILY_PAYROLL_FACT_QUANTITIES,FAMILY_PAYROLL_FACTS_MAX_BYTES,FAMILY_PAYROLL_FACTS_MAX_ROWS} from './own-contract-family-payroll-facts-model.js';
import {salarySerialized,SalaryInputError} from './native-salary-catalog-model.js';

// Cada cantidad con su nombre para la persona, su columna de planilla y la variable GRH que reemplaza.
export const FAMILY_FACT_FIELDS=Object.freeze([
 ['spouse','conyuge','Cónyuge','L60'],['children','hijos','Hijos','L61'],['childrenWithDisability','hijos_discapacidad','Hijos con discapacidad','L62'],
 ['prenatal','prenatal','Prenatal','L63'],['largeFamily','familia_numerosa','Familia numerosa','L64'],['preschool','preescolar','Preescolar','L65'],
 ['preschoolWithDisability','preescolar_discapacidad','Preescolar con discapacidad','L66'],['primary','primaria','Escolaridad primaria','L67'],
 ['primaryWithDisability','primaria_discapacidad','Primaria con discapacidad','L68'],['secondary','media_superior','Escolaridad media o superior','L69'],
 ['secondaryWithDisability','media_superior_discapacidad','Media o superior con discapacidad','L70'],['dependants','familiares_a_cargo','Familiares a cargo','L75'],
].map(([key,column,label,variable])=>Object.freeze({key,column,label,variable})));
export const FAMILY_FACTS_CSV_HEADER=Object.freeze(['contrato','identidad','legajo',...FAMILY_FACT_FIELDS.map(f=>f.column),'meses_ajuste_prenatal','region','promedio_semestral','fecha_constancia','constancia']);
const fail=message=>{throw new SalaryInputError('FAMILY_FACTS_FILE_INVALID',message);};
const cell=value=>'"'+(value===''?'':"'"+value).replaceAll('"','""')+'"';
const literal=value=>value.startsWith("'")?value.slice(1):value;
const blank=()=>({quantities:Object.fromEntries(FAMILY_PAYROLL_FACT_QUANTITIES.map(k=>[k,null])),prenatalAdjustmentMonths:null,tariffSelection:{region:null,semesterAverage:null},asOfDate:'',documentReference:''});
if(salarySerialized(FAMILY_FACT_FIELDS.map(f=>f.key))!==salarySerialized(FAMILY_PAYROLL_FACT_QUANTITIES))throw new Error('FAMILY_FACT_FIELDS_OUT_OF_SYNC');

export function familyFactsDraft(value){
 const b=familyPayrollFactsBootstrap(value),existing=new Map(b.configuration.items.map(r=>[r.contractId,r]));
 return b.source.subjects.map(s=>{
  const old=existing.get(s.contractId);
  if(old&&old.identityToken!==s.identityToken)fail('Cambió la identidad de un contrato con declaración aprobada. Revisá el padrón antes de preparar.');
  return old?structuredClone(old):{contractId:s.contractId,identityToken:s.identityToken,definition:blank()};
 });
}
function matchDraft(b,items){
 if(!Array.isArray(items)||items.length!==b.source.subjects.length)fail('El archivo debe incluir el conjunto completo de contratos consultados. No se cargaron filas.');
 for(let i=0;i<items.length;i++)if(items[i].contractId!==b.source.subjects[i].contractId||items[i].identityToken!==b.source.subjects[i].identityToken)fail('Cambió, falta o se repite una identidad. Volvé a consultar la plantilla completa.');
}
export function familyFactsView(value,items,search='',page=1,pageSize=25){
 const b=familyPayrollFactsBootstrap(value);matchDraft(b,items);
 if(typeof search!=='string'||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)fail('La página de consulta no es válida.');
 const term=search.trim().toLocaleLowerCase('es-AR'),rows=b.source.subjects.map((subject,i)=>({subject,item:items[i],index:i})).filter(r=>[r.subject.legajo,r.subject.employeeName].some(v=>v.toLocaleLowerCase('es-AR').includes(term)));
 const pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.min(page,pages);
 return{rows:rows.slice((current-1)*pageSize,current*pageSize),page:current,pages,filtered:rows.length,total:items.length};
}
// Control de lectura para la revisión: por cada cantidad, cuántos contratos quedan sin informar, cuántos declaran cero
// y cuántos declaran una cantidad, con el total de unidades declaradas. Cuenta lo declarado; no decide derechos.
export function familyFactsTotals(items){
 if(!Array.isArray(items))fail('No hay un conjunto para resumir.');
 return FAMILY_FACT_FIELDS.map(f=>{
  let notReported=0,zero=0,declared=0,units=0;
  for(const r of items){const v=r.definition.quantities[f.key];if(v===null)notReported++;else if(v==='0')zero++;else{declared++;units+=Number(v);}}
  return{...f,notReported,zero,declared,units};
 });
}
export function familyFactsCsv(value,items){
 const b=familyPayrollFactsBootstrap(value);matchDraft(b,items);
 const rows=items.map((r,i)=>{const d=r.definition;return[r.contractId,r.identityToken,b.source.subjects[i].legajo,...FAMILY_FACT_FIELDS.map(f=>d.quantities[f.key]??''),d.prenatalAdjustmentMonths??'',d.tariffSelection.region??'',d.tariffSelection.semesterAverage??'',d.asOfDate,d.documentReference];});
 if(rows.some(r=>r.some(v=>typeof v!=='string')))fail('La plantilla contiene un valor sin verificar.');
 const text='﻿'+FAMILY_FACTS_CSV_HEADER.map(k=>'"'+k+'"').join(';')+'\r\n'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
 if(new TextEncoder().encode(text).length>FAMILY_PAYROLL_FACTS_MAX_BYTES)fail('El CSV completo supera 4 MiB. No se descargó un archivo recortado.');
 return text;
}
function csvRows(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>FAMILY_PAYROLL_FACTS_MAX_BYTES)fail('El CSV supera 4 MiB. No se cargó ninguna fila.');
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 const rows=[];let row=[],value='',quoted=false,closed=false,started=false;
 const field=()=>{row.push(value);if(row.length>FAMILY_FACTS_CSV_HEADER.length)fail('El CSV contiene columnas adicionales. Usá la plantilla completa.');value='';closed=false;started=false;};
 const record=()=>{field();rows.push(row);row=[];if(rows.length>FAMILY_PAYROLL_FACTS_MAX_ROWS+1)fail('El CSV supera 10.000 contratos. No se recortó ni se dividió el archivo.');};
 for(let n=0;n<text.length;n++){
  const c=text[n];if(quoted){if(c==='"'){if(text[n+1]==='"'){value+='"';n++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c===';'){field();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[n+1]==='\n')n++;record();continue;}
  if(closed)fail('Hay caracteres después de una celda entre comillas.');
  if(c==='"'){if(started)fail('Hay comillas fuera de una celda.');quoted=true;started=true;}else{value+=c;started=true;}
 }
 if(quoted)fail('El CSV tiene una celda sin cerrar.');if(row.length||started||closed||value)record();
 if(!rows.length||salarySerialized(rows[0])!==salarySerialized(FAMILY_FACTS_CSV_HEADER))fail('La cabecera no coincide con la plantilla completa de asignaciones familiares.');return rows.slice(1);
}
export function familyFactsFile(value,text){
 const b=familyPayrollFactsBootstrap(value),rows=csvRows(text),n=FAMILY_FACT_FIELDS.length;
 if(rows.length!==b.source.subjects.length)fail('El CSV no contiene el conjunto completo. No se cargaron filas.');
 const items=rows.map((row,i)=>{
  if(row.length!==FAMILY_FACTS_CSV_HEADER.length)fail('Fila '+(i+2)+': faltan columnas.');
  const cells=row.map(literal),[contractId,identityToken,legajo]=cells,s=b.source.subjects[i],quantities=cells.slice(3,3+n),[months,region,average,date,reference]=cells.slice(3+n);
  if(contractId!==s.contractId||identityToken!==s.identityToken||legajo!==s.legajo)fail('Fila '+(i+2)+': identidad distinta o filas desordenadas. No se cargaron filas.');
  return{contractId,identityToken,definition:{quantities:Object.fromEntries(FAMILY_FACT_FIELDS.map((f,k)=>[f.key,quantities[k]===''?null:quantities[k]])),prenatalAdjustmentMonths:months===''?null:months,tariffSelection:{region:region===''?null:region,semesterAverage:average===''?null:average},asOfDate:date,documentReference:reference}};
 });
 familyPayrollFactsItems(items,b.period,{empty:false});return items;
}
export function familyFactsComparison(before,after){
 const a=new Map(before.map(r=>[r.contractId,r])),b=new Map(after.map(r=>[r.contractId,r]));
 return[...new Set([...a.keys(),...b.keys()])].sort().map(contractId=>({contractId,before:a.get(contractId)??null,after:b.get(contractId)??null})).filter(r=>salarySerialized(r.before)!==salarySerialized(r.after));
}

// Preparación completa emitida desde la fuente municipal (JSON, una fila por contrato). Las filas se emparejan con la
// consulta de esta sesión por contrato y legajo; las identidades salen siempre de la consulta.
export function familyFactsPreparationFile(value,text){
 const b=familyPayrollFactsBootstrap(value);let raw;
 if(typeof text!=='string'||new TextEncoder().encode(text).length>FAMILY_PAYROLL_FACTS_MAX_BYTES)fail('El archivo supera 4 MiB. No se cargó ninguna fila.');
 try{raw=JSON.parse(text.charCodeAt(0)===0xfeff?text.slice(1):text);}catch{fail('El archivo no es un JSON válido.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.nativeDefinitionVersion!=='own-contract-family-payroll-facts.v1'||typeof raw.version!=='string'||!/-preparation\.v1$/.test(raw.version)||raw.readyToPost!==false)fail('El archivo no es una preparación de asignaciones familiares admitida.');
 if(raw.period!==b.period)fail('La preparación es de '+raw.period+' y la consulta es de '+b.period+'. Elegí el mismo período.');
 if(!Array.isArray(raw.rows)||raw.rows.length!==b.source.subjects.length)fail('La preparación tiene '+(Array.isArray(raw.rows)?raw.rows.length:0)+' contratos y el padrón consultado '+b.source.subjects.length+'. Rehacé la preparación con el padrón vigente.');
 const byContract=new Map();
 for(const r of raw.rows){if(!r||typeof r!=='object'||typeof r.contractId!=='string'||typeof r.legajo!=='string'||!r.definition||typeof r.definition!=='object')fail('Hay una fila sin contrato, legajo o declaración.');if(byContract.has(r.contractId))fail('Hay contratos repetidos en la preparación.');byContract.set(r.contractId,r);}
 const items=b.source.subjects.map(s=>{const r=byContract.get(s.contractId);if(!r||r.legajo!==s.legajo)fail('El legajo '+s.legajo+' no coincide con la preparación. No se cargaron filas.');return{contractId:s.contractId,identityToken:s.identityToken,definition:structuredClone(r.definition)};});
 familyPayrollFactsItems(items,b.period,{empty:false});return items;
}
