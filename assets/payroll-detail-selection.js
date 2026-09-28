// Read-only identity checks. No signature, payment, permission or source changes.
import {civilDate} from './civil-date.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const captured=new WeakSet();
function fail(code,message){throw Object.assign(new Error(message),{code});}
function integer(value,min,max){
 if(!(typeof value==='number'&&Number.isSafeInteger(value)||typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)))return null;
 const n=Number(value);return n>=min&&n<=max?n:null;
}
export function capturePayrollDetailSelection(item){
 let date;try{date=civilDate(item?.payrollDate);}catch{fail('DETAIL_SELECTION_INVALID','La fecha seleccionada no es válida. Volvé a elegir la liquidación.');}
 const period=integer(item?.sourcePeriod,1900,2100),month=integer(item?.sourceMonth,1,12),type=item?.payrollType;
 if(period===null||month===null||typeof type!=='string'||!/^[A-Z]$/.test(type)||item.datasetId!==undefined&&!uuid(item.datasetId))
  fail('DETAIL_SELECTION_INVALID','La selección de período y tipo no es válida. Volvé a elegir la liquidación.');
 const value=Object.freeze({date,period,month,type,datasetId:item.datasetId??null});captured.add(value);return value;
}
export function verifyPayrollDetailSelection(data,selection){
 if(!captured.has(selection))fail('DETAIL_SELECTION_INVALID','La selección del documento no pudo verificarse.');
 if(!data||!uuid(data.datasetId))fail('DETAIL_SELECTION_CHANGED','No se pudo verificar la identificación de la liquidación. Actualizá la consulta.');
 if(selection.datasetId!==null&&data.datasetId!==selection.datasetId)
  fail('DETAIL_DATASET_CHANGED','Hay una versión distinta de esta liquidación. Actualizá la biblioteca antes de abrirla.');
 if(data.payrollDate!==selection.date||data.payrollType!==selection.type||integer(data.sourcePeriod,1900,2100)!==selection.period||integer(data.sourceMonth,1,12)!==selection.month)
  fail('DETAIL_SELECTION_CHANGED','El detalle no corresponde a la fecha, período o tipo seleccionados. Actualizá la consulta antes de continuar.');
 return data;
}
