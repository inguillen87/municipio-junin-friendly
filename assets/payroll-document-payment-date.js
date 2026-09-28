// Optional document annotation, not bank evidence, a payroll mutation or an approved payment.
const declarations=new WeakSet();
export const PAYMENT_DATE_KINDS=Object.freeze({payment:'Pago',credit:'Acreditación'});
const fail=()=>{throw Object.assign(Error('Elegí pago o acreditación e ingresá una fecha válida. No se consultaron documentos.'),{code:'DOCUMENT_PAYMENT_DATE_INVALID'});};
export function declareDocumentPaymentDate(input={kind:'not_informed',date:''},selectionHash){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join('|')!=='date|kind'||typeof selectionHash!=='string'||!/^[a-f0-9]{64}$/.test(selectionHash))fail();
 const {kind,date}=input;if(typeof kind!=='string'||typeof date!=='string')fail();
 if(kind==='not_informed'){if(date!=='')fail();}
 else{
  if(!Object.hasOwn(PAYMENT_DATE_KINDS,kind)||! /^(19|20)\d{2}-\d{2}-\d{2}$/.test(date))fail();
  const parsed=new Date(date+'T12:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)fail();
 }
 const value=Object.freeze({version:'document-payment-date.v1',selectionHash,kind,date:date||null,origin:date?'operator_declared':'not_informed',paymentVerified:false});
 declarations.add(value);return value;
}
export function verifyDocumentPaymentDate(value,selectionHash){
 if(!declarations.has(value)||selectionHash!==undefined&&value.selectionHash!==selectionHash)throw Object.assign(Error('Cambió el alcance de la fecha declarada. Revisá la selección antes de descargar.'),{code:'DOCUMENT_PAYMENT_DATE_CONTEXT_CHANGED'});
 return value;
}
export function documentPaymentDateLines(value){
 const d=verifyDocumentPaymentDate(value);if(d.kind==='not_informed')return [];
 const [year,month,day]=d.date.split('-');return [
  'Fecha de '+(d.kind==='payment'?'pago':'acreditación')+' declarada: '+day+'/'+month+'/'+year,
  'Dato del operador para este PDF; no verificado contra banco ni fuente de nómina.',
 ];
}
export function documentPaymentDateSuffix(value){const d=verifyDocumentPaymentDate(value);return d.date?'_'+(d.kind==='payment'?'pago':'acreditacion')+'_declarado_'+d.date:'';}

export function documentPaymentDateLongLabel(value){
 const d=verifyDocumentPaymentDate(value);if(!d.date)return 'Sin fecha declarada';
 const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
 const [year,month,day]=d.date.split('-');return Number(day)+' de '+months[Number(month)-1]+' de '+year;
}
