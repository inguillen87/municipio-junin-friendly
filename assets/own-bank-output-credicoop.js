import {salaryExact, salarySerialized} from './native-salary-catalog-model.js';
import {bankAccountsHash} from './own-bank-accounts-model.js';
import {prepareBankControl, verifiedBankControl, BANK_OUTPUT_ISSUES} from './own-bank-output-model.js';
import {bankControlTables, bankLiteralWorkbook} from './own-bank-output-export.js';
import {isoDay} from './native-employee-contract.js';

export const CREDICOOP_PROFILE = 'credicoop-junin-30.202608.v1';
export const CREDICOOP_ISSUES = Object.freeze({...BANK_OUTPUT_ISSUES,
  ACCOUNT_DESTINATION_UNKNOWN:'Hay una cuenta faltante. No se puede determinar su destino bancario sin omitir un recibo.',
  ACCOUNT_TYPE_UNKNOWN:'Falta el tipo de cuenta Credicoop; no se puede asegurar la selección completa.',
  ACCOUNT_LAYOUT:'La cuenta Credicoop debe conservar sucursal-cuenta-verificador: SSS-NNNNNN-V. Revisá su constancia y aprobación.',
  CREDICOOP_AMOUNT_OVERFLOW:'El importe supera las quince posiciones del diseño Credicoop.',
  EMPTY_SELECTION:'No hay recibos para Credicoop, la jurisdicción y el tipo de cuenta elegidos.',
});
const need=(value,message)=>{if(!value)throw Error(message);};
const reviews=new WeakSet();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function credicoopProfile(value){
  need(salaryExact(value,['jurisdictionCode','accountType','currency','creditDate','profileConfirmed','allowRepeatedDestinations'])&&['42','55'].includes(value.jurisdictionCode)&&['all','CA','CC'].includes(value.accountType)&&['ARS','USD'].includes(value.currency)&&isoDay(value.creditDate)&&value.profileConfirmed===true&&typeof value.allowRepeatedDestinations==='boolean','Elegí jurisdicción, tipo, moneda y fecha; confirmá el diseño Credicoop admitido por el banco.');
  return {...value};
}
export async function prepareCredicoopOutput(batch,accounts,value,closes){
  const profile=credicoopProfile(value),source=await prepareBankControl(batch,accounts,{currency:profile.currency,creditDate:profile.creditDate},closes);
  const issues=[...source.issues];
  if(source.rows.some(r=>r.issues.includes('IDENTITY_CHANGED')))issues.push('IDENTITY_CHANGED');
  if(source.rows.some(r=>r.jurisdiction.code===null))issues.push('JURISDICTION_MISSING');
  if(source.rows.some(r=>!r.account))issues.push('ACCOUNT_DESTINATION_UNKNOWN');
  if(source.rows.some(r=>r.account?.paymentChannelVersion&&r.account.paymentChannel===null))issues.push('PAYMENT_CHANNEL_UNKNOWN');
  // Routing uses the approved CBU institution code, never a bank-label alias,
  // a presumed account type, or a digit extracted from a different bank design.
  if(source.rows.some(r=>r.account?.cbu.startsWith('191')&&!r.account.accountType))issues.push('ACCOUNT_TYPE_UNKNOWN');
  const rows=source.rows.map(r=>{
    const bank=r.account?.cbu.startsWith('191')??false,ownJurisdiction=r.jurisdiction.code===profile.jurisdictionCode;
    const selected=bank&&ownJurisdiction&&r.account.paymentChannel!=='credicoop_transfers'&&(profile.accountType==='all'||r.account.accountType===profile.accountType);
    const codes=r.issues.filter(c=>c!=='REPEATED_DESTINATION');
    const parts=bank?/^(\d{3})-(\d{6})-(\d)$/.exec(r.account.accountNumber??''):null;
    const accountParts=parts&&BigInt(parts[2])>0n?{branch:parts[1],number:parts[2],verifier:parts[3]}:null;
    if(bank&&!accountParts)codes.push('ACCOUNT_LAYOUT');
    if(selected&&r.cents!==null&&BigInt(r.cents)>999999999999999n)codes.push('CREDICOOP_AMOUNT_OVERFLOW');
    const selectionReason=selected?'Incluido':!r.account?'Destino no informado':r.account.paymentChannel==='credicoop_transfers'?'Otro canal declarado: Transferencias varias':!bank?'Otra entidad bancaria':!ownJurisdiction?'Otra jurisdicción':'Otro tipo de cuenta';
    return {...r,selected,selectionReason,accountParts,issues:codes};
  });
  const destinations=new Map();
  for(const r of rows.filter(r=>r.account?.cbu.startsWith('191'))){const list=destinations.get(r.account.cbu)??[];list.push(r);destinations.set(r.account.cbu,list);}
  // A type or jurisdiction selector does not make a shared destination unique.
  const repeated=[...destinations.values()].filter(v=>v.length>1&&v.some(r=>r.selected));
  if(!profile.allowRepeatedDestinations)for(const list of repeated)for(const r of list)r.issues.push('REPEATED_DESTINATION');
  const selected=rows.filter(r=>r.selected);
  if(!selected.length)issues.push('EMPTY_SELECTION');
  const ready=issues.length===0&&selected.every(r=>r.issues.length===0);
  const review={version:'own-credicoop-output.v1',layoutVersion:CREDICOOP_PROFILE,kind:'credicoop',source,receiptId:source.receiptId,receiptSha256:source.receiptSha256,receiptReviewId:source.receiptReviewId,receiptDecision:structuredClone({preparedAt:batch.preparedAt,preparedBy:batch.preparedBy,review:batch.review}),profile,rows,issues:[...new Set(issues)],period:source.period,types:source.types,selection:source.selection,recordCount:rows.length,selectedCount:selected.length,otherJurisdictionCount:rows.filter(r=>r.jurisdiction.code!==null&&r.jurisdiction.code!==profile.jurisdictionCode).length,otherBankCount:rows.filter(r=>r.account&&!r.account.cbu.startsWith('191')).length,otherChannelCount:rows.filter(r=>r.account?.paymentChannel==='credicoop_transfers').length,otherAccountTypeCount:rows.filter(r=>r.account?.cbu.startsWith('191')&&r.jurisdiction.code===profile.jurisdictionCode&&profile.accountType!=='all'&&r.account.accountType!==profile.accountType).length,repeatedDestinationCount:repeated.length,ready,totalCents:ready?selected.reduce((n,r)=>n+BigInt(r.cents),0n).toString():null,bankSubmitted:false,paymentExecuted:false};
  review.fingerprint=await bankAccountsHash(review);freeze(review);reviews.add(review);return review;
}
export const sameCredicoopOutput=(a,b)=>reviews.has(a)&&reviews.has(b)&&a.fingerprint===b.fingerprint&&salarySerialized(a.profile)===salarySerialized(b.profile);
export function credicoopPage(review,search='',page=1){
  need(reviews.has(review)&&Number.isSafeInteger(page)&&page>0,'Revisá la emisión completa para Credicoop.');
  const term=String(search).trim().toLocaleLowerCase('es'),rows=review.rows.filter(r=>!term||[r.employeeNumber,r.name,r.departmentCode,r.account?.bankLabel??'',r.selectionReason,...r.issues.map(c=>CREDICOOP_ISSUES[c])].some(v=>v.toLocaleLowerCase('es').includes(term)));
  const pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);
  return {rows:rows.slice((current-1)*25,current*25),page:current,pages,total:review.recordCount,filtered:rows.length};
}
export function createCredicoopTxt(review){
  need(reviews.has(review)&&review.ready,'No se generó un TXT Credicoop parcial. Corregí todas las observaciones y revisá nuevamente.');
  const lines=review.rows.filter(r=>r.selected).map(r=>(r.account.accountType==='CC'?'1':'2')+'191'+r.accountParts.branch+r.accountParts.number+r.accountParts.verifier.repeat(2)+r.cents.padStart(15,'0'));
  need(lines.length===review.selectedCount&&lines.every(l=>/^\d{30}$/.test(l)),'El archivo no cumple el diseño municipal Credicoop de 30 posiciones.');
  return {bytes:new TextEncoder().encode(lines.join('\r\n')+'\r\n'),filename:'haberes-propios-credicoop-'+review.period+'-j'+review.profile.jurisdictionCode+'-'+review.profile.accountType+'.txt',recordCount:review.selectedCount,totalCents:review.totalCents};
}
function tables(review){
  need(reviews.has(review),'Revisá el conjunto completo antes de descargar.');verifiedBankControl(review.source);
  const t=bankControlTables(review.source);
  t.detail[0].push('Incluido en TXT Credicoop','Motivo de selección','Sucursal declarada','Cuenta declarada','Verificador declarado','Observaciones Credicoop');
  for(const [i,r]of review.rows.entries())t.detail[i+1].push(r.selected?'Sí':'No',r.selectionReason,r.accountParts?.branch??'No informado',r.accountParts?.number??'No informado',r.accountParts?.verifier??'No informado',r.issues.map(c=>CREDICOOP_ISSUES[c]).join(' | ')||'Sin observaciones de fila');
  t.control.push(['Perfil Credicoop',review.layoutVersion],['Código bancario del TXT','191; perfil municipal contrastado, distinto del antiguo 344 de SIU/UNL.'],['Jurisdicción del TXT',review.profile.jurisdictionCode],['Tipo de cuenta elegido',({all:'Todas',CA:'Caja de ahorro',CC:'Cuenta corriente'})[review.profile.accountType]],['Filas del TXT elegido',String(review.selectedCount)],['Filas de otras entidades',String(review.otherBankCount)],['Filas de otra jurisdicción',String(review.otherJurisdictionCount)],['Filas de otro tipo en Credicoop/jurisdicción elegida',String(review.otherAccountTypeCount)],['Neto del TXT elegido en centavos',review.totalCents??'No evaluable; hay observaciones'],['Observaciones globales Credicoop',review.issues.map(c=>CREDICOOP_ISSUES[c]).join(' | ')||'Sin observaciones globales'],['Huella revisión Credicoop',review.fingerprint],['Moneda y fecha','Declaradas para revisar cuentas; no codificadas en el registro de 30 posiciones.'],['Admisión declarada del perfil','El operador confirmó diseño y moneda. La generación no demuestra aceptación bancaria.'],['Destinos repetidos',review.profile.allowRepeatedDestinations?'Decisión expresa: cada recibo seleccionado se mantiene separado.':'No permitidos sin revisión expresa.']);
  return t;
}
export function createCredicoopXlsx(review){return bankLiteralWorkbook(tables(review),'control-credicoop-propio-'+review.period+'-j'+review.profile.jurisdictionCode+'-'+review.profile.accountType+'.xlsx');}
export function createCredicoopCsv(review){
  const t=tables(review),literal=new Set([1,4,5,7,8,9,12,14,21,36,37,38]);
  const cell=v=>{let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return {bytes:new TextEncoder().encode('\uFEFF'+t.detail.map((row,i)=>row.map((v,j)=>cell(i&&literal.has(j)?"'"+v:v)).join(';')).join('\r\n')+'\r\n'),filename:'control-credicoop-propio-'+review.period+'-j'+review.profile.jurisdictionCode+'-'+review.profile.accountType+'.csv',recordCount:review.recordCount};
}
