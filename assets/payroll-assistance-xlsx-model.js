import {rational,exactAdd,exactSubtract,exactCompare,exactEvidence} from './own-payroll-exact.js';
import {verifiedWorkspaceCapture,ownRunWorkspaceResult} from './own-payroll-run-workspace-model.js';
import {ownJurisdictionMapForCapture} from './own-payroll-jurisdiction-model.js';
export const ASSISTANCE_VERSION='own-assistance-xlsx-preview.v1';
export const ASSISTANCE_MAX_BYTES=2*1024*1024;
const need=(condition,message)=>{if(!condition)throw Error(message);};
const references=new WeakMap();
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};
export function assistanceDecimal(raw){
 need(typeof raw==='string'&&raw.length>0&&raw.length<=600,'La celda no conserva un decimal OOXML admitido.');
 const m=/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(raw);
 need(m,'El valor no es un decimal OOXML exacto.');
 const digits=(m[2]??'0')+(m[3]??m[4]??''),fraction=(m[3]??m[4]??'').length,exponent=BigInt(m[5]??'0');
 need(digits.length<=256&&exponent>=-256n&&exponent<=256n,'El decimal supera la capacidad exacta; no se recortó.');
 const scale=BigInt(fraction)-exponent;need(scale>=-256n&&scale<=256n,'La escala supera la capacidad exacta; no se redondeó.');
 const coefficient=BigInt(digits)*(m[1]==='-'?-1n:1n);
 return scale>=0n?rational(coefficient,10n**scale):rational(coefficient*10n**(-scale));
}
export function assistanceExactText(value){
 let n=value.n,d=value.d;need(typeof n==='bigint'&&typeof d==='bigint'&&d>0n,'Falta el valor exacto.');
 const negative=n<0n;n=negative?-n:n;const whole=n/d;let remainder=n%d,fraction='';
 while(remainder!==0n){need(fraction.length<512,'La diferencia no tiene expansión decimal finita admitida.');remainder*=10n;fraction+=String(remainder/d);remainder%=d;}
 return(negative?'-':'')+String(whole)+(fraction?'.'+fraction:'');
}
export const assistanceHeader=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const months=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
export function assistancePeriod(title){const s=assistanceHeader(title),m=/^([A-Z]+) ((?:19|20)\d{2}|[12]\.\d{3})$/.exec(s),month=m?months.indexOf(m[1]):-1;need(month>=0,'No se verificó el período declarado en la cabecera A2.');const year=m[2].replace('.','');need(/^(19|20)\d{2}$/.test(year),'El año de la planilla no está admitido.');return year+'-'+String(month+1).padStart(2,'0');}
const profileContracts=[
 {id:'general42and55',jurisdiction:'42_and_55',last:'L',headers:{D3:'LIQUIDACION',I3:'CHEQUES',L3:'RETENIDO EN LA COOPARTICIPACION',D4:'JUR. 42',E4:'SUPLEMENTARIAS- BONO',G4:'JUR. 55',H4:'TOTAL',E5:'JUR. 42',F5:'JUR. 55',I5:'IMPORTE A RETENER POR EL PROCESAM.',J5:'TOTAL A DEPOSITAR',K5:'BANCO'},moneyColumns:['D','E','F','G','H','I','J','L'],labels:{D:'Liquidación · JUR. 42',E:'Suplementarias-Bono · JUR. 42',F:'Suplementarias-Bono · JUR. 55',G:'Liquidación · JUR. 55',H:'Total de liquidación · JUR. 42 y55',I:'Importe a retener por el procesamiento',J:'Total a depositar',L:'Retenido en la cooparticipación'}},
 {id:'jurisdiction42',jurisdiction:'42',last:'K',headers:{D3:'LIQUIDACION',G3:'CHEQUES',K3:'RETENIDO EN LA COOPARTICIPACION',D4:'JUR. 42',E4:'SUPLEMENTARIAS- BONO',F4:'TOTAL',E5:'JUR. 42',G5:'IMPORTE A RETENER POR EL PROCESAM.',H5:'A DEVOLVER',I5:'TOTAL A DEPOSITAR',J5:'BANCO'},moneyColumns:['D','E','F','G','H','I','K'],labels:{D:'Liquidación · JUR. 42',E:'Suplementarias-Bono · JUR. 42',F:'Total de liquidación · JUR. 42',G:'Importe a retener por el procesamiento',H:'A devolver',I:'Total a depositar',K:'Retenido en la cooparticipación'}},
 {id:'jurisdiction55',jurisdiction:'55',last:'I',headers:{I3:'RETENIDO EN LA COOPARTICIPACION',D4:'JUR. 55',E4:'SUPLEMENTARIAS',F4:'SALDOA FAVOR',G4:'TOTAL A DEPOSITAR',E5:'JUR. 55',H5:'BANCO'},moneyColumns:['D','E','F','G','I'],labels:{D:'JUR. 55',E:'Suplementarias · JUR. 55',F:'Saldo a favor',G:'Total a depositar',I:'Retenido en la cooparticipación'}}
];
export function assistanceProfile(cells){
 const h=ref=>assistanceHeader(cells.get(ref)?.raw),common={A3:'CUENTA CONTABLE',B3:'CODIGOS',C3:'CONCEPTO'};
 need(h('A1')==='CAJAS ASISTENCIALES'&&Object.entries(common).every(([ref,value])=>h(ref)===value),'No coincide la cabecera de cajas asistenciales.');
 const period=assistancePeriod(cells.get('A2')?.raw),matches=profileContracts.filter(contract=>{const expected={...common,...contract.headers};for(let column=65;column<=contract.last.charCodeAt(0);column++)for(let row=3;row<=5;row++){const ref=String.fromCharCode(column)+row;if(h(ref)!==(expected[ref]??''))return false;}for(const[ref,cell]of cells){const m=/^([A-Z]{1,3})([345])$/.exec(ref);if(m&&(m[1].length>1||m[1]>contract.last)&&assistanceHeader(cell.raw)!=='')return false;}return true;});
 need(matches.length===1,'Las columnas no coinciden con todas las cabeceras del perfil observado. No se inventó un mapeo.');const contract=matches[0],{id,jurisdiction,moneyColumns}=contract;
 const columnJurisdictions=Object.fromEntries(moneyColumns.map(column=>[column,id==='general42and55'?(['D','E'].includes(column)?'42':['F','G'].includes(column)?'55':'all'):jurisdiction]));
 return{id,period,jurisdiction,moneyColumns:[...moneyColumns],labels:{...contract.labels},columnJurisdictions};
}
export function validateAssistancePreview(value){
 need(value?.version===ASSISTANCE_VERSION&&value.complete===true&&value.formulasExecuted===false&&value.externalLinksFollowed===false&&value.dimensionTrusted===false&&/^[a-f0-9]{64}$/.test(value.sha256)&&Number.isSafeInteger(value.byteLength)&&value.byteLength>0&&value.byteLength<=ASSISTANCE_MAX_BYTES&&Array.isArray(value.sheets)&&value.sheets.length>=1&&value.sheets.length<=3,'No se verificó la previa completa del Excel.');
 const ids=new Set();for(const sheet of value.sheets){need(typeof sheet.name==='string'&&sheet.name.length<=80&&!ids.has(sheet.id)&&Array.isArray(sheet.rows)&&sheet.rows.length<=20000&&sheet.rowCount===sheet.rows.length,'La previa contiene hojas o cobertura inválidas.');ids.add(sheet.id);const cells=new Map();let prev=0;for(const row of sheet.rows){need(Number.isSafeInteger(row.number)&&row.number>prev&&Array.isArray(row.cells),'La previa contiene filas repetidas o incompletas.');prev=row.number;for(const cell of row.cells){need(typeof cell.ref==='string'&&new RegExp('^[A-Z]{1,3}'+row.number+'$').test(cell.ref)&&!cells.has(cell.ref)&&['number','text','blank','error'].includes(cell.kind)&&typeof cell.raw==='string'&&cell.raw.length<=2000,'Una celda de la previa es inválida.');cells.set(cell.ref,cell);if(cell.kind==='number'&&cell.raw!=='')assistanceDecimal(cell.raw);}}
  const profile=assistanceProfile(cells);need(sheet.cellCount===cells.size&&JSON.stringify(profile)===JSON.stringify(sheet.profile),'El perfil no coincide con la cabecera original.');
 }
 return frozen(value);
}
export async function createAssistanceReference(capture){
 const copy=structuredClone(capture);await verifiedWorkspaceCapture(copy);const checked=ownRunWorkspaceResult(copy);need(checked&&copy.saved,'Consultá una captura propia completa y guardada.');
 const {input,result}=checked,jurisdictions=ownJurisdictionMapForCapture(copy),money=result.rows.filter(row=>row.unit==='money'&&row.nature!=='auxiliary'),codes=[...new Set(money.map(row=>row.conceptCode))].sort();
 const metadata=Object.freeze({version:'own-assistance-reference.v1',captureId:copy.id,key:copy.key,inputSha256:copy.saved.inputSha256,resultSha256:copy.saved.resultSha256,payloadSha256:copy.payloadSha256,period:result.period,liquidationType:result.liquidationType,selection:frozen(structuredClone(input.selection)),employeeCount:result.employeeCount,rowCount:result.rowCount,moneyRowCount:money.length,codes:Object.freeze(codes),jurisdictionCaptured:jurisdictions!==null&&[...jurisdictions.values()].every(j=>j.code==='42'||j.code==='55')});
 references.set(metadata,{rows:money.map(r=>({...r})),jurisdictions,allEmployeeIds:new Set(result.employeeTotals.map(e=>e.contractId))});return metadata;
}
export function compareAssistanceSelection({preview,sheetId,cellReference,reference,codes,jurisdiction,scopeConfirmed=false}){
 validateAssistancePreview(preview);const saved=references.get(reference);need(saved,'La referencia no es una captura propia verificada.');
 const sheet=preview.sheets.find(s=>s.id===sheetId);need(sheet,'Elegí una hoja del archivo completo.');
 need(scopeConfirmed===true,'Confirmá expresamente período, tipo, jurisdicción y alcance de la celda contra la captura.');
 need(sheet.profile.period===reference.period,'El período de la planilla difiere del de la captura elegida.');
 need(['42','55','all'].includes(jurisdiction)&&reference.jurisdictionCaptured,'La captura no conserva jurisdicción completa para comparar 42/55.');
 need(sheet.profile.jurisdiction==='42_and_55'||sheet.profile.jurisdiction===jurisdiction,'La hoja y la jurisdicción elegida no coinciden.');
 need(Array.isArray(codes)&&codes.length>0&&codes.length<=1000&&Reflect.ownKeys(codes).length===codes.length+1&&Array.from({length:codes.length},(_,i)=>Object.hasOwn(codes,i)&&Object.hasOwn(Object.getOwnPropertyDescriptor(codes,String(i)),'value')).every(Boolean)&&new Set(codes).size===codes.length&&codes.every(c=>reference.codes.includes(c)),'Elegí un conjunto exacto de conceptos monetarios disponibles, sin equivalencias automáticas.');
 const match=/^([A-Z]{1,3})([1-9][0-9]*)$/.exec(cellReference??'');need(match&&sheet.profile.moneyColumns.includes(match[1])&&BigInt(match[2])>5n,'Elegí una celda monetaria de la planilla, después de su cabecera.');
 need(sheet.profile.columnJurisdictions[match[1]]===jurisdiction,'La columna elegida y la jurisdicción de referencia no coinciden; revisá la cabecera.');
 const cell=sheet.rows.flatMap(r=>r.cells).find(c=>c.ref===cellReference);need(cell?.kind==='number'&&cell.raw!=='','La celda está ausente, vacía o no conserva un importe numérico. No se tomó como cero.');
 const selectedPopulation=[...saved.allEmployeeIds].filter(id=>jurisdiction==='all'||saved.jurisdictions.get(id)?.code===jurisdiction),ids=new Set(selectedPopulation),rows=saved.rows.filter(r=>ids.has(r.contractId)&&codes.includes(r.conceptCode));
 const coverage=codes.map(code=>({code,rows:rows.filter(r=>r.conceptCode===code).length,employees:new Set(rows.filter(r=>r.conceptCode===code).map(r=>r.contractId)).size}));need(coverage.every(c=>c.rows>0),'Falta cobertura de alguno de los conceptos elegidos en esta jurisdicción. No se sustituyó por cero.');
 const total=rows.reduce((sum,r)=>exactAdd(sum,assistanceDecimal(r.amount)),rational(0n)),source=assistanceDecimal(cell.raw),difference=exactSubtract(source,total);
 return Object.freeze({version:'own-assistance-cell-comparison.v1',state:exactCompare(source,total)===0?'equal':'different',source:{sha256:preview.sha256,sheetId:sheet.id,sheetName:sheet.name,profile:sheet.profile.id,cellReference,rawLexeme:cell.raw,formulaCache:cell.formula,externalFormula:cell.externalFormula},reference:{captureId:reference.captureId,key:reference.key,inputSha256:reference.inputSha256,resultSha256:reference.resultSha256,payloadSha256:reference.payloadSha256,period:reference.period,liquidationType:reference.liquidationType,selection:reference.selection,jurisdiction,codes:[...codes]},coverage:{completeCaptureRows:reference.rowCount,completeCaptureEmployees:reference.employeeCount,selectedPopulation:selectedPopulation.length,selectedMoneyRows:rows.length,perCode:coverage},sourceExact:assistanceExactText(source),referenceExact:assistanceExactText(total),differenceExact:assistanceExactText(difference),difference:exactEvidence(difference),scopeConfirmed:true,wholeWorkbookReconciled:false,amountsChanged:false});
}
