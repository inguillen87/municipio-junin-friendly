import {salaryExact, salarySerialized} from './native-salary-catalog-model.js';
import {isoDay} from './native-employee-contract.js';
import {bankAccountsHash, BANK_PAYMENT_CHANNEL_VERSION} from './own-bank-accounts-model.js';
import {prepareBankControl, verifiedBankControl, BANK_OUTPUT_ISSUES} from './own-bank-output-model.js';
import {bankControlTables, bankLiteralWorkbook} from './own-bank-output-export.js';
import {TRANSFERS_VAR_LAYOUT, reviewTransfersVarFile} from './payroll-transfers-var-review.js';
import {PAYROLL_BANK_MAX_RECORDS, PAYROLL_BANK_MAX_FILE_BYTES} from './payroll-bank-fixed-width-profiles.js';

// Compatibility preparation only. The observed seven fields do not establish
// the receiving bank service, its admission or the unidentified historical type1.
export const OWN_TRANSFERS_VAR_LAYOUT='own-transfers-var-167.review.v1';
export const TRANSFERS_VAR_ISSUES=Object.freeze({...BANK_OUTPUT_ISSUES,
  CHANNEL_UNDECLARED:'Falta declarar y aprobar el canal de una cuenta. No se deduce del banco o del CBU.',
  EMPTY_SELECTION:'La emisión no contiene cuentas con el canal Transferencias varias declarado.',
  VAR_ACCOUNT_TYPE:'Transferencias varias requiere caja de ahorro declarada.',
  VAR_AMOUNT_OVERFLOW:'El neto supera las diez posiciones de centavos del diseño observado.',
  VAR_NAME_ENCODING:'El nombre no puede conservarse exactamente en Windows-1252 imprimible.',
  VAR_NAME_WIDTH:'El nombre supera las 40 posiciones del diseño. No se abrevia ni se recorta.',
  VAR_EMPLOYEE_LAYOUT:'El legajo no cabe en diez dígitos. No se reemplaza por otro identificador.',
  VAR_RECORD_LIMIT:'La selección supera 10.000 registros. No se divide ni se omiten recibos.',
});
const need=(v,message)=>{if(!v)throw Error(message);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const reviews=new WeakSet();
const extras=new Map([['€',128],['‚',130],['ƒ',131],['„',132],['…',133],['†',134],['‡',135],['ˆ',136],['‰',137],['Š',138],['‹',139],['Œ',140],['Ž',142],['‘',145],['’',146],['“',147],['”',148],['•',149],['–',150],['—',151],['˜',152],['™',153],['š',154],['›',155],['œ',156],['ž',158],['Ÿ',159]]);
function nameBytes(value){
  const result=[];
  for(const c of value){const code=c.codePointAt(0),byte=code>=32&&code<=126||code>=160&&code<=255?code:extras.get(c);if(byte===undefined)return null;result.push(byte);}
  return result;
}
export function transfersVarProfile(value){
  need(salaryExact(value,['currency','creditDate','reviewConfirmed','allowRepeatedDestinations'])&&['ARS','USD'].includes(value.currency)&&isoDay(value.creditDate)&&value.reviewConfirmed===true&&typeof value.allowRepeatedDestinations==='boolean','Elegí moneda y fecha, y confirmá la preparación del diseño observado para revisión.');
  return {...value};
}
export async function prepareTransfersVarOutput(batch,accounts,value,closes){
  const profile=transfersVarProfile(value),source=await prepareBankControl(batch,accounts,{currency:profile.currency,creditDate:profile.creditDate},closes),issues=[...source.issues];
  if(source.rows.some(r=>r.issues.includes('IDENTITY_CHANGED')))issues.push('IDENTITY_CHANGED');
  // Unknown accounts/channels anywhere can hide an intended destination. The
  // full approved emission remains the selection authority, never the search.
  if(source.rows.some(r=>!r.account))issues.push('ACCOUNT_DESTINATION_UNKNOWN');
  if(source.rows.some(r=>r.account&&(r.account.paymentChannelVersion!==BANK_PAYMENT_CHANNEL_VERSION||r.account.paymentChannel===null)))issues.push('CHANNEL_UNDECLARED');
  const rows=source.rows.map(r=>{
    const selected=r.account?.paymentChannelVersion===BANK_PAYMENT_CHANNEL_VERSION&&r.account.paymentChannel==='credicoop_transfers',codes=r.issues.filter(c=>c!=='REPEATED_DESTINATION');
    if(selected){
      if(r.account.accountType!=='CA')codes.push('VAR_ACCOUNT_TYPE');
      if(r.cents!==null&&BigInt(r.cents)>9999999999n)codes.push('VAR_AMOUNT_OVERFLOW');
      const encoded=nameBytes(r.name);if(encoded===null)codes.push('VAR_NAME_ENCODING');else if(encoded.length>40)codes.push('VAR_NAME_WIDTH');
      if(!/^\d{1,10}$/.test(r.employeeNumber))codes.push('VAR_EMPLOYEE_LAYOUT');
    }
    const selectionReason=selected?'Incluido en Transferencias varias':!r.account?'Cuenta no informada':r.account.paymentChannelVersion!==BANK_PAYMENT_CHANNEL_VERSION||r.account.paymentChannel===null?'Canal pendiente de declaración':'Otro canal aprobado: acreditación de haberes';
    return {...r,selected,selectionReason,issues:codes};
  });
  const destinations=new Map();for(const r of rows){if(!r.account)continue;const list=destinations.get(r.account.cbu)??[];list.push(r);destinations.set(r.account.cbu,list);}
  const repeated=[...destinations.values()].filter(list=>list.length>1&&list.some(r=>r.selected));
  if(!profile.allowRepeatedDestinations)for(const list of repeated)for(const r of list)r.issues.push('REPEATED_DESTINATION');
  const selected=rows.filter(r=>r.selected);if(!selected.length)issues.push('EMPTY_SELECTION');if(selected.length>PAYROLL_BANK_MAX_RECORDS)issues.push('VAR_RECORD_LIMIT');
  const ready=issues.length===0&&selected.every(r=>r.issues.length===0);
  const review={version:OWN_TRANSFERS_VAR_LAYOUT,layoutVersion:TRANSFERS_VAR_LAYOUT,kind:'transfers_var',source,profile,rows,period:source.period,types:source.types,selection:source.selection,receiptId:source.receiptId,receiptSha256:source.receiptSha256,receiptReviewId:source.receiptReviewId,recordCount:rows.length,selectedCount:selected.length,otherChannelCount:rows.length-selected.length,repeatedDestinationCount:repeated.length,issues:[...new Set(issues)],ready,totalCents:ready?selected.reduce((n,r)=>n+BigInt(r.cents),0n).toString():null,currencyBasis:'declared_at_review_not_encoded',officialGenerationAllowed:false,officialSubmissionAllowed:false,bankSubmitted:false,paymentExecuted:false};
  review.fingerprint=await bankAccountsHash(review);freeze(review);reviews.add(review);return review;
}
export const sameTransfersVarOutput=(a,b)=>reviews.has(a)&&reviews.has(b)&&a.fingerprint===b.fingerprint&&salarySerialized(a.profile)===salarySerialized(b.profile);
export function transfersVarPage(review,search='',page=1){
  need(reviews.has(review)&&Number.isSafeInteger(page)&&page>0,'Revisá la emisión completa.');
  const term=String(search).trim().toLocaleLowerCase('es'),rows=review.rows.filter(r=>!term||[r.employeeNumber,r.name,r.departmentCode,r.account?.bankLabel??'',r.selectionReason,...r.issues.map(c=>TRANSFERS_VAR_ISSUES[c])].some(v=>v.toLocaleLowerCase('es').includes(term)));
  const pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);return {rows:rows.slice((current-1)*25,current*25),page:current,pages,total:review.recordCount,filtered:rows.length};
}
export async function createTransfersVarReviewTxt(review){
  need(reviews.has(review)&&review.ready,'No se generó un TXT parcial. Corregí la emisión completa antes de descargar.');verifiedBankControl(review.source);
  const bytes=new Uint8Array(review.selectedCount*169);let offset=0;
  try{
    const reference=('HABERES '+String(Number(review.period.slice(5)))+'-'+review.period.slice(0,4)).padEnd(60,' ');
    for(const r of review.rows.filter(row=>row.selected)){
      const encodedName=nameBytes(r.name);need(encodedName&&encodedName.length<=40,'El nombre no conserva las 40 posiciones.');
      const ascii=r.account.cbu+r.cents.padStart(10,'0')+r.cuil.padEnd(22,' '),tail=r.employeeNumber.padStart(10,'0')+reference+'VAR';
      bytes.set(new TextEncoder().encode(ascii),offset);offset+=54;
      bytes.fill(32,offset,offset+40);bytes.set(encodedName,offset);offset+=40;
      bytes.set(new TextEncoder().encode(tail),offset);offset+=73;
      bytes.set([13,10],offset);offset+=2;
    }
    need(offset===bytes.length&&bytes.length<=PAYROLL_BANK_MAX_FILE_BYTES,'El diseño completo supera su capacidad. No se recortó.');
    const decoded=await reviewTransfersVarFile(bytes);
    need(decoded.matchesObservedFields&&decoded.recordCount===review.selectedCount&&decoded.period===review.period&&decoded.totalCents===review.totalCents,'La lectura independiente no concilia el archivo completo con los recibos seleccionados.');
    return {bytes,filename:'revision-transferencias-varias-propias-'+review.period+'.txt',recordCount:review.selectedCount,totalCents:review.totalCents,sha256:decoded.sha256,reviewFingerprint:review.fingerprint,officialGenerationAllowed:false,officialSubmissionAllowed:false,bankSubmitted:false,paymentExecuted:false};
  }catch(e){bytes.fill(0);throw e;}
}
function tables(review){
  need(reviews.has(review),'Revisá el conjunto completo antes de descargar.');verifiedBankControl(review.source);
  const t=bankControlTables(review.source);t.detail[0].push('Incluido en revisión TXT167','Motivo de selección','Observaciones Transferencias varias');
  for(const [i,r]of review.rows.entries())t.detail[i+1].push(r.selected?'Sí':'No',r.selectionReason,r.issues.map(c=>TRANSFERS_VAR_ISSUES[c]).join(' | ')||'Sin observaciones de fila');
  t.control.push(['Diseño de revisión',review.layoutVersion],['Canal seleccionado','Transferencias varias declarado y aprobado; no inferido del banco o del CBU'],['Alcance','Todos los recibos del canal dentro de la emisión aprobada; sin separación automática por jurisdicción'],['Filas seleccionadas',String(review.selectedCount)],['Filas de otro canal',String(review.otherChannelCount)],['Neto seleccionado en centavos',review.totalCents??'No evaluable; hay observaciones'],['Huella revisión Transferencias varias',review.fingerprint],['Observaciones globales',review.issues.map(c=>TRANSFERS_VAR_ISSUES[c]).join(' | ')||'Sin observaciones globales'],['Uso del TXT','Preparación para revisión del diseño observado. Receptor y admisión bancaria pendientes; no es una presentación ni acredita pagos.'],['Moneda y fecha','Declaradas para revisar las cuentas; no están codificadas en 167 posiciones. No se convierte ni redondea.'],['Texto','Nombre exacto Windows-1252; nunca abreviado, recortado o reemplazado.'],['Destinos repetidos',review.profile.allowRepeatedDestinations?'Decisión expresa: conservar cada recibo separado.':'No admitidos sin revisión expresa.']);return t;
}
export function createTransfersVarXlsx(review){return bankLiteralWorkbook(tables(review),'control-transferencias-varias-propias-'+review.period+'.xlsx');}
export function createTransfersVarCsv(review){
  const t=tables(review),literal=new Set([1,4,5,7,8,9,12,14,21]);
  const cell=v=>{let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return {bytes:new TextEncoder().encode('\uFEFF'+t.detail.map((row,i)=>row.map((v,j)=>cell(i&&literal.has(j)?"'"+v:v)).join(';')).join('\r\n')+'\r\n'),filename:'control-transferencias-varias-propias-'+review.period+'.csv',recordCount:review.recordCount};
}
