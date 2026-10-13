import {catalogItems,catalogDeclareRegistration,catalogDiff,CatalogInputError} from './native-employment-catalog-model.js';
export const CATALOG_FILE_MAX_BYTES=2*1024*1024;
export const CATALOG_FILE_HEADER=Object.freeze(['tipo','codigo','descripcion','convenio','nuevas_altas']);
const kinds={convenio:'agreements',categoria:'categories',sector:'organizations',reparticion:'sectors'};
const fail=message=>{throw new CatalogInputError('FILE_INPUT_INVALID',message);};
const cell=value=>'"'+(value===''?'':"'"+value).replaceAll('"','""')+'"';
const literal=value=>value.startsWith("'")?value.slice(1):value;
function records(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>CATALOG_FILE_MAX_BYTES)fail('El CSV supera 2 MiB. No se cargó ninguna opción.');
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 const rows=[];let row=[],value='',quoted=false,closed=false,started=false;
 const field=()=>{row.push(value);if(row.length>5)fail('Hay columnas adicionales. Usá la plantilla completa de encuadres.');value='';closed=false;started=false;};
 const record=()=>{field();rows.push(row);row=[];if(rows.length>1501)fail('El CSV supera 1.500 opciones. No se recortó ni se dividió el conjunto.');};
 for(let n=0;n<text.length;n++){
  const c=text[n];
  if(quoted){if(c==='"'){if(text[n+1]==='"'){value+='"';n++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c===';'){field();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[n+1]==='\n')n++;record();continue;}
  if(closed)fail('Hay caracteres después de una celda cerrada. No se cargaron opciones.');
  if(c==='"'){if(started)fail('Hay comillas fuera de una celda.');quoted=true;started=true;}else{value+=c;started=true;}
 }
 if(quoted)fail('El CSV tiene una celda sin cerrar.');
 if(row.length||started||closed||value)record();
 if(!rows.length||JSON.stringify(rows[0])!==JSON.stringify(CATALOG_FILE_HEADER))fail('La cabecera no coincide. No se admiten columnas de empleados, importes o fórmulas.');
 return rows.slice(1);
}
export function catalogFileExport(raw=[]){
 const rows=raw.length?catalogDeclareRegistration(raw):[];
 const text='\ufeff'+CATALOG_FILE_HEADER.map(k=>'"'+k+'"').join(';')+'\r\n'+rows.map(r=>[
  Object.keys(kinds).find(k=>kinds[k]===r.kind),r.code,r.label,r.agreementCode??'',r.registrationAllowed?'si':'no'
 ].map(cell).join(';')+'\r\n').join('');
 if(new TextEncoder().encode(text).length>CATALOG_FILE_MAX_BYTES)fail('El archivo completo supera 2 MiB. No se descarga un CSV recortado.');
 return text;
}
export function catalogFilePlan(before,text){
 const base=catalogItems(before),rows=records(text);
 if(!rows.length)fail('La plantilla no contiene opciones. Completala antes de comparar.');
 const items=catalogItems(rows.map((r,n)=>{
  if(r.length!==5)fail('Fila '+(n+2)+': faltan columnas.');
  const[type,code,label,agreement,allowed]=r.map(literal);
  if(!Object.hasOwn(kinds,type)||!['si','no'].includes(allowed))fail('Fila '+(n+2)+': indicá un tipo de la plantilla y nuevas_altas como si o no.');
  return{kind:kinds[type],code,label,agreementCode:agreement===''?null:agreement,key:kinds[type]+':'+agreement+':'+code,registrationAllowed:allowed==='si'};
 }));
 return{beforeVersion:JSON.stringify(base),items,changes:catalogDiff(base,items),total:items.length};
}
