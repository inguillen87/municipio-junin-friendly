import {salaryConditionsBootstrap,salaryConditionsItems,SALARY_CONDITIONS_MAX_BYTES,SALARY_CONDITIONS_MAX_ROWS} from './own-contract-salary-conditions-model.js';
import {salarySerialized,SalaryInputError} from './native-salary-catalog-model.js';
export const CONDITIONS_CSV_HEADER=Object.freeze(['contrato','identidad','legajo','antiguedad_parcial','titulo','codigo_titulo','porcentaje_titulo','insalubridad','fecha_constancia','constancia']);
const fail=message=>{throw new SalaryInputError('CONDITIONS_FILE_INVALID',message);};
const cell=value=>'"'+(value===''?'':"'"+value).replaceAll('"','""')+'"';
const literal=value=>value.startsWith("'")?value.slice(1):value;
export function conditionsDraft(value){
 const b=salaryConditionsBootstrap(value),existing=new Map(b.configuration.items.map(r=>[r.contractId,r]));
 return b.source.subjects.map(s=>{
  const old=existing.get(s.contractId);
  if(old&&old.identityToken!==s.identityToken)fail('Cambió la identidad de un contrato con declaración aprobada. Revisá el padrón antes de preparar.');
  return old?structuredClone(old):{contractId:s.contractId,identityToken:s.identityToken,definition:{partialSeniorityYears:null,title:{status:'not_reported',code:null,percentage:null},unhealthyWork:null,asOfDate:'',documentReference:''}};
 });
}
function matchDraft(b,items){
 if(!Array.isArray(items)||items.length!==b.source.subjects.length)fail('El archivo debe incluir el conjunto completo de contratos consultados. No se cargaron filas.');
 for(let i=0;i<items.length;i++)if(items[i].contractId!==b.source.subjects[i].contractId||items[i].identityToken!==b.source.subjects[i].identityToken)fail('Cambió, falta o se repite una identidad. Volvé a consultar la plantilla completa.');
}
export function conditionsView(value,items,search='',page=1,pageSize=25){
 const b=salaryConditionsBootstrap(value);matchDraft(b,items);
 if(typeof search!=='string'||!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)fail('La página de consulta no es válida.');
 const term=search.trim().toLocaleLowerCase('es-AR'),rows=b.source.subjects.map((subject,i)=>({subject,item:items[i],index:i})).filter(r=>[r.subject.legajo,r.subject.employeeName].some(v=>v.toLocaleLowerCase('es-AR').includes(term)));
 const pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.min(page,pages);
 return{rows:rows.slice((current-1)*pageSize,current*pageSize),page:current,pages,filtered:rows.length,total:items.length};
}
export function conditionsCsv(value,items){
 const b=salaryConditionsBootstrap(value);matchDraft(b,items);
 const rows=items.map((r,i)=>{const d=r.definition;return[r.contractId,r.identityToken,b.source.subjects[i].legajo,d.partialSeniorityYears??'',({not_reported:'sin_informar',none:'no_corresponde',declared:'declarado'})[d.title.status],d.title.code??'',d.title.percentage??'',d.unhealthyWork===null?'':d.unhealthyWork?'si':'no',d.asOfDate,d.documentReference];});
 if(rows.some(r=>r.some(v=>typeof v!=='string')))fail('La plantilla contiene un valor sin verificar.');
 const text='\uFEFF'+CONDITIONS_CSV_HEADER.map(k=>'"'+k+'"').join(';')+'\r\n'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
 if(new TextEncoder().encode(text).length>SALARY_CONDITIONS_MAX_BYTES)fail('El CSV completo supera 4 MiB. No se descargó un archivo recortado.');
 return text;
}
function csvRows(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>SALARY_CONDITIONS_MAX_BYTES)fail('El CSV supera 4 MiB. No se cargó ninguna fila.');
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 const rows=[];let row=[],value='',quoted=false,closed=false,started=false;
 const field=()=>{row.push(value);if(row.length>CONDITIONS_CSV_HEADER.length)fail('El CSV contiene columnas adicionales. Usá la plantilla completa.');value='';closed=false;started=false;};
 const record=()=>{field();rows.push(row);row=[];if(rows.length>SALARY_CONDITIONS_MAX_ROWS+1)fail('El CSV supera 10.000 contratos. No se recortó ni se dividió el archivo.');};
 for(let n=0;n<text.length;n++){
  const c=text[n];if(quoted){if(c==='"'){if(text[n+1]==='"'){value+='"';n++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c===';'){field();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[n+1]==='\n')n++;record();continue;}
  if(closed)fail('Hay caracteres después de una celda entre comillas.');
  if(c==='"'){if(started)fail('Hay comillas fuera de una celda.');quoted=true;started=true;}else{value+=c;started=true;}
 }
 if(quoted)fail('El CSV tiene una celda sin cerrar.');if(row.length||started||closed||value)record();
 if(!rows.length||salarySerialized(rows[0])!==salarySerialized(CONDITIONS_CSV_HEADER))fail('La cabecera no coincide con la plantilla completa de condiciones salariales.');return rows.slice(1);
}
export function conditionsFile(value,text){
 const b=salaryConditionsBootstrap(value),rows=csvRows(text);
 if(rows.length!==b.source.subjects.length)fail('El CSV no contiene el conjunto completo. No se cargaron filas.');
 const items=rows.map((row,i)=>{
  if(row.length!==CONDITIONS_CSV_HEADER.length)fail('Fila '+(i+2)+': faltan columnas.');
  const [contractId,identityToken,legajo,years,title,code,percentage,unhealthy,date,reference]=row.map(literal),s=b.source.subjects[i];
  if(contractId!==s.contractId||identityToken!==s.identityToken||legajo!==s.legajo)fail('Fila '+(i+2)+': identidad distinta o filas desordenadas. No se cargaron filas.');
  if(!['sin_informar','no_corresponde','declarado'].includes(title)||!['','si','no'].includes(unhealthy))fail('Fila '+(i+2)+': declarales título e insalubridad sin equivalencias numéricas.');
  return{contractId,identityToken,definition:{partialSeniorityYears:years===''?null:years,title:{status:({sin_informar:'not_reported',no_corresponde:'none',declarado:'declared'})[title],code:code===''?null:code,percentage:percentage===''?null:percentage},unhealthyWork:unhealthy===''?null:unhealthy==='si',asOfDate:date,documentReference:reference}};
 });
 salaryConditionsItems(items,b.period,{empty:false});return items;
}
export function conditionsComparison(before,after){
 const a=new Map(before.map(r=>[r.contractId,r])),b=new Map(after.map(r=>[r.contractId,r]));
 return[...new Set([...a.keys(),...b.keys()])].sort().map(contractId=>({contractId,before:a.get(contractId)??null,after:b.get(contractId)??null})).filter(r=>salarySerialized(r.before)!==salarySerialized(r.after));
}
