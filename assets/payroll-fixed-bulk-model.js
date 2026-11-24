import {fixedForm,fixedText} from './payroll-fixed-novelties-model.js';
import {fixedConceptCode} from './payroll-fixed-concepts.js';
import {costCenterCode} from './grh-cost-centers.js';
import {buildXlsxWorkbook,splitDelimitedCells,parseDelimitedText} from './spreadsheet-table-intake.js';

export const FIXED_BULK_MAX_ROWS=2000;
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.:_()-]/g,' ').replace(/\s+/g,' ').trim();
const canonNum=value=>typeof value==='string'&&/^[0-9]+$/.test(value)?value.replace(/^0+/,'')||'0':null;
const ownLegajoValid=value=>typeof value==='string'&&[...value].length>=1&&[...value].length<=64&&!/[\x00-\x1f\x7f-\x9f]/.test(value);
const headings=['legajo','concepto','unidades','importe','fecha de alta','vencimiento','instrumento'];
const positionalColumns=['legajo','conceptSourceId','quantityDecimal','amountArs','validFrom','validTo','legalInstrument'];
const HEADER_ALIASES=new Map([
 ['legajo','legajo'],['nro legajo','legajo'],['nro de legajo','legajo'],['numero legajo','legajo'],['numero de legajo','legajo'],['legajo agente','legajo'],
 ['concepto','conceptSourceId'],['cod','conceptSourceId'],['codigo','conceptSourceId'],['cod concepto','conceptSourceId'],['codigo concepto','conceptSourceId'],['concepto declarado','conceptSourceId'],['codigo del concepto','conceptSourceId'],
 ['unidades','quantityDecimal'],['cantidad','quantityDecimal'],['cant','quantityDecimal'],['unidades declaradas','quantityDecimal'],
 ['importe','amountArs'],['monto','amountArs'],['importe ars','amountArs'],['monto ars','amountArs'],['importe en pesos','amountArs'],['pesos','amountArs'],
 ['fecha de alta','validFrom'],['alta','validFrom'],['desde','validFrom'],['fecha alta','validFrom'],['vigencia desde','validFrom'],['fecha desde','validFrom'],
 ['vencimiento','validTo'],['hasta','validTo'],['fecha de baja','validTo'],['fecha baja','validTo'],['fecha de vencimiento','validTo'],['fecha vencimiento','validTo'],['vigencia hasta','validTo'],['fecha hasta','validTo'],
 ['instrumento','legalInstrument'],['acto','legalInstrument'],['acto administrativo','legalInstrument'],['decreto','legalInstrument'],['resolucion','legalInstrument'],['expediente','legalInstrument'],['respaldo','legalInstrument'],['instrumento legal','legalInstrument'],
 ['centro de costo','costCenterSourceId'],['centro costo','costCenterSourceId'],['c costo','costCenterSourceId'],['codigo centro de costo','costCenterSourceId'],
 ['tipo','payrollType'],['tipo de liquidacion','payrollType'],['tipo liquidacion','payrollType'],['liquidacion','payrollType'],
]);
const PAYROLL_TYPE_ALIASES=new Map([
 ['monthly','monthly'],['mensual','monthly'],
 ['first_fortnight','first_fortnight'],['first fortnight','first_fortnight'],['primera quincena','first_fortnight'],['1ra quincena','first_fortnight'],['quincena','first_fortnight'],
 ['sac','sac'],['aguinaldo','sac'],['sueldo anual complementario','sac'],
 ['vacation','vacation'],['vacaciones','vacation'],
 ['supplementary','supplementary'],['complementaria','supplementary'],
 ['final','final'],['liquidacion final','final'],
 ['other','other'],['otra','other'],['otro','other'],
]);
const date=value=>String(value??'').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$2-$1');

function resolvePayrollTypeCell(raw,fallback){
 if(!raw||!String(raw).trim())return fallback;
 const key=fold(raw);
 if(PAYROLL_TYPE_ALIASES.has(key))return PAYROLL_TYPE_ALIASES.get(key);
 throw Error('Revisá el tipo de liquidación: usá mensual, primera quincena, SAC, vacaciones, complementaria, liquidación final u otra.');
}

function detectColumns(firstRow){
 const isPositionalExact=firstRow.length>=5&&firstRow.length<=7&&firstRow.every((cell,i)=>fold(cell)===headings[i]);
 if(isPositionalExact)return {isHeader:true,columns:positionalColumns.slice(0,firstRow.length)};
 const mapped=firstRow.map(cell=>HEADER_ALIASES.get(fold(cell))||null);
 const seen=new Set();
 let validCount=0;
 for(const key of mapped){
  if(!key)continue;
  if(seen.has(key))throw Error('Hay columnas repetidas en el encabezado de la planilla.');
  seen.add(key);validCount++;
 }
 if(seen.has('legajo')&&(seen.has('conceptSourceId')||seen.has('validFrom')||seen.has('quantityDecimal')||seen.has('amountArs'))&&validCount>=3){
  const missing=[];
  if(!seen.has('conceptSourceId'))missing.push('Concepto');
  if(!seen.has('validFrom'))missing.push('Fecha de alta');
  if(!seen.has('quantityDecimal')&&!seen.has('amountArs'))missing.push('Unidades o Importe');
  if(missing.length)throw Error('Faltan columnas obligatorias en el encabezado: '+missing.join(', ')+'.');
  return {isHeader:true,columns:mapped};
 }
 return {isHeader:false,columns:null};
}

function normalizeEntries(input){
 if(typeof input==='string'){
  const parsed=parseDelimitedText(input,{maxRows:FIXED_BULK_MAX_ROWS,minColumns:5});
  return parsed.lines.map(entry=>({number:entry.number,line:entry.line,delimiter:parsed.delimiter,cells:null}));
 }
 if(input&&typeof input==='object'&&Array.isArray(input.rows)){
  const lineNumbers=Array.isArray(input.lineNumbers)?input.lineNumbers:[];
  if(!input.rows.length)throw Error('La planilla está vacía.');
  if(input.rows.length>FIXED_BULK_MAX_ROWS+1)throw Error(`La carga admite hasta ${FIXED_BULK_MAX_ROWS} filas. Dividila antes de verificar.`);
  return input.rows.map((cells,i)=>({number:lineNumbers[i]??i+1,line:null,delimiter:null,cells:cells.map(c=>String(c??'').trim())}));
 }
 throw Error('Pegá o seleccioná un archivo de planilla.');
}

// No interpreta miles ni completa ceros: toda normalización termina en fixedForm.
export function fixedBulkDraft(input,{payrollType='monthly',legalInstrument='',reason='',allowNativeLegajo=null}={}){
 const entries=normalizeEntries(input);
 let columnMap=null;
 try{
  const firstCells=entries[0].cells??splitDelimitedCells(entries[0].line,entries[0].delimiter);
  const detected=detectColumns(firstCells);
  if(detected.isHeader){columnMap=detected.columns;entries.shift();}
 }catch(error){
  if(/columnas|encabezado/i.test(error?.message||''))throw error;
  /* Si falla la lectura de fila, el error se informa fila por fila abajo. */
 }
 if(!entries.length)throw Error('La planilla tiene encabezado pero no tiene novedades.');
 if(entries.length>FIXED_BULK_MAX_ROWS)throw Error(`La carga admite hasta ${FIXED_BULK_MAX_ROWS} filas. Dividí la planilla antes de verificar.`);
 const rows=entries.map(entry=>{
  const number=entry.number;
  let raw=entry.cells||[];
  try{
   if(!entry.cells)raw=splitDelimitedCells(entry.line,entry.delimiter);
   let fieldsObj;
   if(columnMap){
    fieldsObj={legajo:'',conceptSourceId:'',quantityDecimal:'',amountArs:'',validFrom:'',validTo:'',legalInstrument:'',costCenterSourceId:'',payrollType:''};
    columnMap.forEach((fieldKey,idx)=>{if(fieldKey&&idx<raw.length)fieldsObj[fieldKey]=String(raw[idx]??'').trim();});
   }else{
    if(raw.length<5||raw.length>7)throw Error('Usá las siete columnas indicadas. En CSV con comas, encerrá los decimales con coma entre comillas.');
    const [legajo,concept,quantityDecimal,amountArs,from,to='',instrument='']=raw;
    fieldsObj={legajo,conceptSourceId:concept,quantityDecimal,amountArs,validFrom:from,validTo:to,legalInstrument:instrument,costCenterSourceId:'',payrollType:''};
   }
   const conceptSourceId=fixedConceptCode(fieldsObj.conceptSourceId);
   if(conceptSourceId===null)throw Error('Elegí el concepto de la lista o escribí su número.');
   const rowPayrollType=resolvePayrollTypeCell(fieldsObj.payrollType,payrollType);
   const rawCostCenter=String(fieldsObj.costCenterSourceId||'').trim();
   const costCenterSourceId=rawCostCenter?costCenterCode(rawCostCenter)||rawCostCenter:costCenterCode('');
   const rawLegajo=String(fieldsObj.legajo??'').trim();
   const allowNative=typeof allowNativeLegajo==='function'&&allowNativeLegajo(rawLegajo);
   if(allowNative){
    if(!ownLegajoValid(rawLegajo))throw Error('Ingresá un legajo válido de hasta 64 caracteres.');
    const validated=fixedForm({legajo:'1',conceptSourceId,costCenterSourceId,payrollType:rowPayrollType,
     quantityDecimal:fieldsObj.quantityDecimal,amountArs:fieldsObj.amountArs,
     validFrom:date(fieldsObj.validFrom),validTo:date(fieldsObj.validTo),
     legalInstrument:fieldsObj.legalInstrument||legalInstrument,reason:fixedText(reason,'el motivo de la propuesta'),forced:false});
    return {number,raw,draft:Object.freeze({legajo:rawLegajo,values:validated.values,reason:validated.reason}),error:null};
   }
   const draft=fixedForm({legajo:rawLegajo,conceptSourceId,costCenterSourceId,payrollType:rowPayrollType,
    quantityDecimal:fieldsObj.quantityDecimal,amountArs:fieldsObj.amountArs,
    validFrom:date(fieldsObj.validFrom),validTo:date(fieldsObj.validTo),
    legalInstrument:fieldsObj.legalInstrument||legalInstrument,reason:fixedText(reason,'el motivo de la propuesta'),forced:false});
   return {number,raw,draft,error:null};
  }catch(error){return {number,raw,draft:null,error:'Fila '+number+': '+error.message};}
 });
 const keys=new Map();
 for(const row of rows){
  if(!row.draft)continue;
  const key=JSON.stringify([canonNum(row.draft.legajo)??row.draft.legajo,row.draft.values.conceptSourceId,row.draft.values.payrollType]);
  const previous=keys.get(key);
  if(previous){
   row.error='Fila '+row.number+': el legajo, concepto y tipo se repiten en la fila '+previous.number+'.';
   previous.error='Fila '+previous.number+': el legajo, concepto y tipo se repiten en la fila '+row.number+'.';
  }else keys.set(key,row);
 }
 return rows;
}

export function fixedBulkExists(records,subject,values){
 return records.some(row=>row.subject.contractId===subject.contractId&&[row.approved,row.pending].some(proposal=>
  proposal?.operation==='set'&&proposal.values.conceptSourceId===values.conceptSourceId&&proposal.values.payrollType===values.payrollType));
}

export function fixedBulkPayload(draft,subject){
 const matches=draft.legajo===subject.legajo||(subject.origin==='MUNICONTROL'&&canonNum(draft.legajo)!==null&&canonNum(draft.legajo)===canonNum(subject.legajo));
 if(!matches)throw Error('El legajo cambió. Volvé a verificar la planilla.');
 return {recordId:null,expectedVersion:0,contractId:subject.contractId,legajo:subject.legajo,identityToken:subject.identityToken,
  operation:'set',values:draft.values,reason:draft.reason};
}

export function fixedBulkTemplateXlsx({zip}={}){
 return buildXlsxWorkbook([
  {
   name:'Novedades fijas',
   widths:[14,34,14,16,16,16,32],
   autoFilter:true,
   rows:[
    ['Legajo','Concepto','Unidades','Importe','Fecha de alta','Vencimiento','Instrumento'],
    ['1001','Afiliación al Sindicato Municipal','1','','15/09/2026','','Resolución 123/2026'],
    ['1002','638','','15000,00','01/10/2026','31/12/2026',''],
   ],
  },
  {
   name:'Instrucciones',
   widths:[26,76],
   rows:[
    ['Campo','Cómo completarlo'],
    ['Legajo','Legajo exacto del agente (contrato activo propio/adoptado o GRH).'],
    ['Concepto','Código numérico o nombre exacto de la lista (ej. 638 o Afiliación al Sindicato Municipal).'],
    ['Unidades / Importe','Informá al menos uno. Vacío no equivale a cero; 0 explícito sí se respeta.'],
    ['Fecha de alta / Vencimiento','Formato dd/mm/aaaa o aaaa-mm-dd (o celda Fecha de Excel). Vencimiento es opcional.'],
    ['Instrumento','Opcional por fila si arriba completaste un instrumento común para el conjunto.'],
    ['Tope de carga','Hasta 2000 filas por archivo (.xlsx primera hoja, .csv o .txt).'],
   ],
  },
 ],zip?{zip}:undefined);
}
