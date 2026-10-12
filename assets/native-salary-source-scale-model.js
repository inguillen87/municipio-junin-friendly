import {SalaryInputError,salaryDiff,salaryExact,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {salaryFileExport} from './native-salary-file-model.js';

export const SCALE_REFERENCE_HEADER=Object.freeze(['empresa_fuente','convenio_fuente','clase_fuente','campo_original','valor_literal_original','decimales_del_tipo_sql','fecha_del_respaldo','sha256_del_respaldo','vigencia_municipal_homologada']);
export const SCALE_REFERENCE_FIELDS=Object.freeze(['CONV_10','SUEL_10','GARA_10','ADIC_10']);
export const SCALE_REFERENCE_LABELS=Object.freeze({CONV_10:'Asignación de clase',SUEL_10:'Adicional 1',GARA_10:'Adicional 2',ADIC_10:'Adicional 3'});
export const SCALE_REFERENCE_MAX_BYTES=2*1024*1024;
const fail=message=>{throw new SalaryInputError('SCALE_REFERENCE_INVALID',message);};
const code=value=>typeof value==='string'&&/^[0-9]{1,9}$/.test(value);
const month=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const literal=value=>value.startsWith("'")?value.slice(1):value;
function records(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>SCALE_REFERENCE_MAX_BYTES)fail('La referencia supera 2 MiB. No se leyó un archivo recortado.');
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 const rows=[];let row=[],value='',quoted=false,closed=false,started=false;
 function field(){row.push(value);if(row.length>9)fail('La referencia contiene columnas adicionales. Usá sólo la hoja de categorías, sin datos de empleados.');value='';closed=false;started=false;}
 function record(){field();rows.push(row);row=[];if(rows.length>1001)fail('La referencia supera 1.000 valores originales. No se dividió ni se omitieron filas.');}
 for(let n=0;n<text.length;n++){const c=text[n];if(quoted){if(c==='"'){if(text[n+1]==='"'){value+='"';n++;}else{quoted=false;closed=true;}}else value+=c;continue;}if(c===';'){field();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[n+1]==='\n')n++;record();continue;}if(closed)fail('Hay caracteres después de una celda cerrada. No se cargó ninguna escala.');if(c==='"'){if(started)fail('Hay comillas fuera de una celda.');quoted=true;started=true;}else{value+=c;started=true;}}
 if(quoted)fail('Hay una celda sin cerrar. No se cargó ninguna escala.');
 if(row.length||started||closed||value)record();
 if(!rows.length||salarySerialized(rows[0])!==salarySerialized(SCALE_REFERENCE_HEADER))fail('La cabecera no corresponde a la referencia de categorías. No se admiten datos nominales ni fórmulas.');
 return rows.slice(1);
}
function cutoff(value){
 if(typeof value!=='string'||!/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(value))return false;
 const [y,m,d]=value.slice(0,10).split('-').map(Number);return d<=new Date(Date.UTC(y,m,0)).getUTCDate();
}
export function salaryScaleReference(text){
 const rows=records(text);if(!rows.length)fail('La referencia no contiene categorías.');
 let source=null;const grouped=new Map();
 rows.forEach((record,n)=>{
  const at=`Fila ${n+2}: `;if(record.length!==9)fail(at+'faltan columnas de la referencia.');
  const [companyCode,agreementCode,categoryCode,field,value,precision,sourceCutoff,sha256,declaredValidFrom]=record.map(literal);
  if(!code(companyCode)||!code(agreementCode)||!code(categoryCode)||!SCALE_REFERENCE_FIELDS.includes(field))fail(at+'revisá entidad, convenio, clase y campo original.');
  if(precision!=='3'||! /^-?(?:0|[1-9][0-9]{0,15})\.[0-9]{3}$/.test(value)||value==='-0.000')fail(at+'conservá el valor literal decimal(19,3). Vacío no significa cero.');
  if(!cutoff(sourceCutoff)||!/^[a-f0-9]{64}$/.test(sha256)||declaredValidFrom!==''&&!month(declaredValidFrom))fail(at+'revisá fecha, huella y vigencia declarada del origen. La fecha del respaldo no es una vigencia salarial.');
  const metadata={companyCode,cutoff:sourceCutoff,sha256};if(source&&salarySerialized(source)!==salarySerialized(metadata))fail('El archivo mezcla entidades o respaldos. No se seleccionó una fuente por defecto.');source=metadata;
  const key=[companyCode,agreementCode,categoryCode].join(':');let category=grouped.get(key);
  if(!category){category={key,agreementCode,categoryCode,values:{},precision:3,declaredValidFrom:declaredValidFrom||null};grouped.set(key,category);}
  if(category.declaredValidFrom!==(declaredValidFrom||null))fail(at+'las cuatro referencias de la clase tienen vigencias distintas.');
  if(Object.hasOwn(category.values,field))fail(at+'el campo original está repetido para la misma clase.');category.values[field]=value;
 });
 const categories=[...grouped.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 if(categories.some(c=>SCALE_REFERENCE_FIELDS.some(f=>!Object.hasOwn(c.values,f))))fail('Falta uno de los cuatro campos de alguna categoría. Se conserva la referencia completa; no se omitieron filas.');
 return {source,categories,rows:rows.length};
}
export function salarySourceScalePlan(raw,text,selection,mappings,declaration,classification){
 const before=salaryItems(raw,{allowEmpty:true}),reference=salaryScaleReference(text);
 if(!Array.isArray(selection)||!selection.length||selection.some(k=>typeof k!=='string')||new Set(selection).size!==selection.length)fail('Elegí expresamente las categorías, sin repetirlas.');
 const selected=new Set(selection),categories=reference.categories.filter(c=>selected.has(c.key));if(categories.length!==selection.length)fail('Cambió la referencia: una categoría seleccionada ya no existe.');
 if(!Array.isArray(mappings)||!mappings.length||mappings.length>4||mappings.some(m=>!salaryExact(m,['field','code','label'])||!SCALE_REFERENCE_FIELDS.includes(m.field)||!code(m.code))||new Set(mappings.map(m=>m.field)).size!==mappings.length||new Set(mappings.map(m=>m.code)).size!==mappings.length)fail('Declarales código y descripción propios a los campos elegidos. No se deducen equivalencias entre campos y conceptos.');
 if(!salaryExact(declaration,['validFrom','validUntil','ruleReference','active','sourceConfirmed'])||!month(declaration.validFrom)||declaration.validUntil!==null&&(!month(declaration.validUntil)||declaration.validUntil<declaration.validFrom)||typeof declaration.active!=='boolean'||declaration.sourceConfirmed!==true||typeof declaration.ruleReference!=='string'||declaration.ruleReference!==declaration.ruleReference.trim()||declaration.ruleReference.length<3||declaration.ruleReference.length>70)fail('Declarales vigencia, estado y documento a las escalas y confirmá la entidad del respaldo. No se toma la fecha del archivo como vigencia.');
 if(!Array.isArray(classification))fail('Volvé a consultar los convenios y clases propios.');
 const ruleReference=`${declaration.ruleReference} · Respaldo ${reference.source.cutoff} · SHA256 ${reference.source.sha256}`;
 const old=new Map(before.map(r=>[salaryRowKey(r),r])),next=[...before];
 for(const category of categories){
  if(classification.filter(c=>c.kind==='agreements'&&c.code===category.agreementCode).length!==1||classification.filter(c=>c.kind==='categories'&&c.agreementCode===category.agreementCode&&c.code===category.categoryCode).length!==1)fail(`Convenio ${category.agreementCode}, clase ${category.categoryCode}: falta una correspondencia única en el catálogo consultado. Revisá la selección; la categoría no se omitió.`);
  if(category.declaredValidFrom&&category.declaredValidFrom!==declaration.validFrom)fail('La vigencia declarada en el origen difiere de la preparación. No se cambió por defecto.');
  for(const mapping of mappings){const row={kind:'scale',agreementCode:category.agreementCode,categoryCode:category.categoryCode,code:mapping.code,label:mapping.label,nature:null,unit:'money',precision:3,value:category.values[mapping.field],validFrom:declaration.validFrom,validUntil:declaration.validUntil,ruleReference,dependencies:[],active:declaration.active};salaryItems([row]);const key=salaryRowKey(row),prior=old.get(key);if(prior){if(salarySerialized(prior)!==salarySerialized(row))fail(`La escala ${category.agreementCode}/${category.categoryCode}/${mapping.code} ya tiene otro antecedente en ese mes. No se sobrescribió ni se cerró su vigencia.`);}else next.push(row);}
 }
 const items=salaryItems(next),changes=salaryDiff(before,items);
 return {beforeVersion:salarySerialized(before),referenceVersion:salarySerialized(reference),source:reference.source,sourceRows:reference.rows,sourceCategories:reference.categories.length,selectedCategories:categories.length,unselectedCategories:reference.categories.length-categories.length,selectedFields:mappings.length,preparedDefinitions:categories.length*mappings.length,newDefinitions:changes.length,unchangedDefinitions:categories.length*mappings.length-changes.length,items,changes};
}
export function salarySourceScaleCsv(raw,text,selection,mappings,declaration,classification,review){
 const plan=salarySourceScalePlan(raw,text,selection,mappings,declaration,classification);if(!review||salarySerialized(plan)!==salarySerialized(review))fail('Cambió la preparación completa. Volvé a comparar la referencia.');
 return {filename:`bases-de-escalas-${declaration.validFrom}.csv`,text:salaryFileExport(plan.items),rows:plan.items.length};
}
