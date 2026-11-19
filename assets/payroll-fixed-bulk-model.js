import {fixedForm,fixedText} from './payroll-fixed-novelties-model.js';
import {fixedConceptCode} from './payroll-fixed-concepts.js';
import {costCenterCode} from './grh-cost-centers.js';

export const FIXED_BULK_MAX_ROWS=200;
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const headings=['legajo','concepto','unidades','importe','fecha de alta','vencimiento','instrumento'];
const date=value=>value.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$2-$1');

function separator(line){
  let quoted=false;const seen=new Set();
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){if(quoted&&line[i+1]==='"')i++;else quoted=!quoted;}
    else if(!quoted)seen.add(line[i]);
  }
  for(const delimiter of ['\t',';',',']){
    if(!seen.has(delimiter))continue;
    try{const width=cells(line,delimiter).length;if(width>=5&&width<=7)return delimiter;}catch{/* Se informa el error al leer la fila. */}
  }
  return seen.has('\t')?'\t':seen.has(';')?';':',';
}
function cells(line,delimiter){
  const result=[];let value='',quoted=false,closed=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(quoted){if(char==='"'){if(line[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=char;}
    else if(char===delimiter){result.push(value.trim());value='';closed=false;}
    else if(char==='"'&&!value.trim()&&!closed){value='';quoted=true;}
    else if(char==='"'||closed&&char.trim())throw Error('Revisá las comillas y los separadores de la planilla.');
    else value+=char;
  }
  if(quoted)throw Error('Cerrá las comillas en la misma fila.');
  result.push(value.trim());return result;
}

// No interpreta miles ni completa ceros: toda normalización termina en fixedForm.
export function fixedBulkDraft(text,{payrollType='monthly',legalInstrument='',reason=''}={}){
  if(typeof text!=='string')throw Error('Pegá las filas de la planilla.');
  const lines=text.replace(/^\ufeff/,'').split(/\r\n|\n|\r/).map((line,i)=>({line,number:i+1})).filter(r=>r.line.trim());
  if(!lines.length)throw Error('Pegá al menos una fila de la planilla.');
  const delimiter=separator(lines[0].line);
  try{const first=cells(lines[0].line,delimiter);if(first.length>=5&&first.length<=7&&first.every((cell,i)=>fold(cell)===headings[i]))lines.shift();}catch{/* La fila se informa como error abajo. */}
  if(!lines.length)throw Error('La planilla tiene encabezado pero no tiene novedades.');
  if(lines.length>FIXED_BULK_MAX_ROWS)throw Error('La carga admite hasta 200 filas. Dividí la planilla antes de verificar.');
  const rows=lines.map(({line,number})=>{
    let raw=[];
    try{
      raw=cells(line,delimiter);
      if(raw.length<5||raw.length>7)throw Error('Usá las siete columnas indicadas. En CSV con comas, encerrá los decimales con coma entre comillas.');
      const [legajo,concept,quantityDecimal,amountArs,from,to='',instrument='']=raw;
      const conceptSourceId=fixedConceptCode(concept);
      if(conceptSourceId===null)throw Error('Elegí el concepto de la lista o escribí su número.');
      const draft=fixedForm({legajo,conceptSourceId,costCenterSourceId:costCenterCode(''),payrollType,quantityDecimal,amountArs,
        validFrom:date(from),validTo:date(to),legalInstrument:instrument||legalInstrument,reason:fixedText(reason,'el motivo de la propuesta'),forced:false});
      return {number,raw,draft,error:null};
    }catch(error){return {number,raw,draft:null,error:'Fila '+number+': '+error.message};}
  });
  const keys=new Map();
  for(const row of rows){if(!row.draft)continue;const key=JSON.stringify([row.draft.legajo,row.draft.values.conceptSourceId,row.draft.values.payrollType]);
    const previous=keys.get(key);if(previous){row.error='Fila '+row.number+': el legajo, concepto y tipo se repiten en la fila '+previous.number+'.';previous.error='Fila '+previous.number+': el legajo, concepto y tipo se repiten en la fila '+row.number+'.';}else keys.set(key,row);
  }
  return rows;
}

export function fixedBulkExists(records,subject,values){
  return records.some(row=>row.subject.contractId===subject.contractId&&[row.approved,row.pending].some(proposal=>
    proposal?.operation==='set'&&proposal.values.conceptSourceId===values.conceptSourceId&&proposal.values.payrollType===values.payrollType));
}

export function fixedBulkPayload(draft,subject){
  if(draft.legajo!==subject.legajo)throw Error('El legajo cambió. Volvé a verificar la planilla.');
  return {recordId:null,expectedVersion:0,contractId:subject.contractId,legajo:subject.legajo,identityToken:subject.identityToken,
    operation:'set',values:draft.values,reason:draft.reason};
}
