import {salaryExact, salarySerialized} from './native-salary-catalog-model.js';
import {bankAccountsBootstrap, bankAccountCbu, bankAccountsHash} from './own-bank-accounts-model.js';
import {ownReceiptBatch, ownReceiptVerifyHash, OWN_RECEIPT_READ} from './own-payroll-receipt-model.js';
import {isoDay, validCuil} from './native-employee-contract.js';
import {verifiedOwnCloseReceipt} from './own-payroll-close-model.js';
import {ownClosedJurisdiction} from './own-payroll-jurisdiction-model.js';

export const BANK_OUTPUT_READ = Object.freeze([...new Set([...OWN_RECEIPT_READ, 'payroll.parameter.read'])]);
export const BNA_GT_GUIDE = 'https://www.bna.com.ar/Downloads/InstructivoDisenoDeArchivoPagosGT.pdf';
export const BANK_OUTPUT_ISSUES = Object.freeze({
  EMPTY: 'La emisión no tiene recibos.', UNAPPROVED: 'La emisión requiere aprobación independiente.',
  UNAVAILABLE: 'La emisión fue retirada, su cierre cambió o no permite descarga.',
  ACCOUNTS_UNAPPROVED: 'Falta una configuración bancaria aprobada.',
  MIXED_TYPES: 'La emisión contiene más de un tipo. Prepará una emisión completa para cada tipo.',
  ISSUER_INVALID: 'El CUIT conservado del emisor no es válido.',
  PAYMENT_DATE_CHANGED: 'La acreditación no coincide con la fecha declarada del recibo.',
  IDENTITY_CHANGED: 'El contrato no coincide con su registro propio. Revisá la identidad y la emisión.',
  ACCOUNT_MISSING: 'Falta una cuenta habilitada para la fecha de acreditación.',
  CURRENCY_CHANGED: 'La moneda de la cuenta no coincide con la declarada para esta emisión.',
  CUIL_INVALID: 'El CUIL conservado no es válido.',
  FRACTIONAL_CENTS: 'El neto no puede expresarse exactamente en centavos. No se redondea.',
  NON_POSITIVE: 'El neto no es positivo. No se omite el recibo.',
  AMOUNT_OVERFLOW: 'El neto supera las diez posiciones del importe BNA.',
  REPEATED_DESTINATION: 'Hay otro recibo con el mismo CBU. Revisá expresamente los pagos separados.',
  JURISDICTION_MISSING: 'El cierre no conserva una jurisdicción 42/55. No se puede asegurar un archivo completo separado.',
  EMPTY_JURISDICTION: 'La emisión no contiene recibos de la jurisdicción elegida.',
  ACCOUNT_DESTINATION_UNKNOWN: 'Hay una cuenta faltante. No se puede asegurar la selección Nación sin omitir un recibo.',
  ACCOUNT_TYPE_UNKNOWN: 'Falta el tipo aprobado de una cuenta Nación. No se deduce del CBU.',
  EMPTY_DESTINATION: 'No hay cajas de ahorro Nación en la jurisdicción elegida.',
});
export const BNA_DESTINATION_LABELS = Object.freeze({nacion_ca:'Caja de ahorro Banco Nación',all:'Todos los destinos del convenio GT'});
const need = (value, message) => { if (!value) throw Error(message); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const reviews = new WeakSet();

export function bankOutputProfile(v) {
  need(salaryExact(v, ['destinationScope','jurisdictionCode','payerCbu','currency','compensationDate','creditDate','agreementCode','sendNumber','information','loanIdentifier','calendarConfirmed','allowRepeatedDestinations']), 'Completá el perfil BNA declarado.');
  need(['nacion_ca','all'].includes(v.destinationScope), 'Elegí los destinos: caja de ahorro Nación o todos los destinos del convenio GT.');
  need(['42','55'].includes(v.jurisdictionCode), 'Elegí expresamente la jurisdicción 42 o 55 del archivo.');
  need(bankAccountCbu(v.payerCbu) && v.payerCbu.startsWith('011'), 'Informá el CBU completo y válido de la cuenta ordenante de Banco Nación.');
  need(['ARS','USD'].includes(v.currency), 'Elegí expresamente la moneda de esta emisión. No se convierte el neto.');
  need(isoDay(v.compensationDate) && isoDay(v.creditDate) && v.compensationDate < v.creditDate && v.calendarConfirmed === true, 'Confirmá con el banco el día hábil de compensación anterior a la acreditación. No se deducen feriados.');
  need(typeof v.agreementCode === 'string' && /^\d{1,8}$/.test(v.agreementCode) && BigInt(v.agreementCode) > 0n, 'Informá el convenio BNA asignado, hasta ocho dígitos, conservando sus ceros.');
  need(typeof v.sendNumber === 'string' && /^\d{1,6}$/.test(v.sendNumber) && BigInt(v.sendNumber) > 0n, 'Informá el número de envío del día, entre 1 y 999999. No se asigna automáticamente.');
  need(typeof v.information === 'string' && /^[A-Z0-9 ]{0,20}$/.test(v.information), 'La referencia del ordenante admite hasta 20 letras mayúsculas, números y espacios.');
  need(['0000','0003'].includes(v.loanIdentifier) && typeof v.allowRepeatedDestinations === 'boolean', 'Elegí haberes ordinarios o extraordinarios y revisá los destinos repetidos.');
  return {...v};
}

// Mechanical conversion of a saved literal. Never rounds or values a salary rule.
export function bankOutputCents(value) {
  need(typeof value === 'string' && /^-?(0|[1-9]\d*)(\.\d{1,8})?$/.test(value), 'No se verificó el neto original.');
  const negative = value.startsWith('-'), [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (/[^0]/.test(fraction.slice(2))) return null;
  const cents = BigInt(whole) * 100n + BigInt(fraction.slice(0,2).padEnd(2,'0'));
  return negative ? -cents : cents;
}
export function bankControlProfile(value) {
  need(salaryExact(value, ['currency','creditDate']) && ['ARS','USD'].includes(value.currency) && isoDay(value.creditDate), 'Elegí la moneda y la fecha de acreditación del control. No se deducen ni convierten.');
  return {...value};
}
const recordKey = r => r.sourceGroupId.toLowerCase() + ':' + r.contractId.toLowerCase();

export async function prepareBankOutput(batchValue, accountsValue, profileValue, closeValues) {
  return prepareSource(batchValue, accountsValue, bankOutputProfile(profileValue), closeValues, 'bna');
}
export async function prepareBankControl(batchValue, accountsValue, profileValue, closeValues) {
  return prepareSource(batchValue, accountsValue, bankControlProfile(profileValue), closeValues, 'control');
}
async function prepareSource(batchValue, accountsValue, profile, closeValues, kind) {
  const batch = ownReceiptBatch(batchValue), accounts = bankAccountsBootstrap(accountsValue), banking = kind === 'bna', nacionOnly = banking && profile.destinationScope === 'nacion_ca';
  await ownReceiptVerifyHash(batch.snapshot, batch.snapshotSha256);
  const snapshot = batch.snapshot, issues = [], add = code => issues.push(code);
  if (!snapshot.recordCount) add('EMPTY');
  if (batch.state !== 'approved') add('UNAPPROVED');
  if (!batch.sourceCurrent || !batch.permissions.canDownload || batch.state === 'withdrawn') add('UNAVAILABLE');
  if (!accounts.configuration.revision) add('ACCOUNTS_UNAPPROVED');
  if (banking && snapshot.params.types.length !== 1) add('MIXED_TYPES');
  if (!validCuil(snapshot.params.issuer.taxId)) add('ISSUER_INVALID');
  if (snapshot.params.paymentDate !== null && snapshot.params.paymentDate !== profile.creditDate) add('PAYMENT_DATE_CHANGED');
  const identities = new Map(accounts.sources.contracts.map(r => [r.contractId.toLowerCase(), r])), groups = new Map(snapshot.sources.map(g => [g.id.toLowerCase(),g]));
  need(Array.isArray(closeValues) && closeValues.length === groups.size, 'Consultá todos los cierres originales de la emisión.');
  const closed = new Map();
  for (const value of closeValues) {
    const c = await verifiedOwnCloseReceipt(value), source = groups.get(c.groupId.toLowerCase());
    need(source && !closed.has(c.groupId.toLowerCase()) && c.body.command === 'close' && c.snapshotSha256 === source.snapshotSha256 && c.snapshot.period === source.period && c.snapshot.liquidationType === source.type && c.snapshot.employeeCount === source.employeeCount && c.snapshot.populationCount === source.populationCount, 'Un cierre original no coincide con la emisión aprobada.');
    closed.set(c.groupId.toLowerCase(), {value:c, employees:new Map(c.snapshot.employees.map(e=>[e.contractId.toLowerCase(),e]))});
  }
  const destinations = new Map(), accountsByContract = new Map();
  for (const a of accounts.configuration.definition?.accounts ?? []) { const k=a.contractId.toLowerCase(), list=accountsByContract.get(k) ?? [];list.push(a);accountsByContract.set(k,list); }
  const rows = [...snapshot.records].sort((a,b) => recordKey(a) < recordKey(b) ? -1 : 1).map((r, index) => {
    const source=closed.get(r.sourceGroupId.toLowerCase()), employee=source?.employees.get(r.contractId.toLowerCase());
    need(employee && ['employeeNumber','runId','liquidationVersion','agreementCode','departmentCode','precision'].every(k=>employee[k]===r[k]) && ['remuneration','non_remuneration','deduction','employer_contribution','gross','net'].every(k=>employee.totals[k]===r.totals[k]), 'Un recibo no coincide con su participación original cerrada.');
    const jurisdiction=ownClosedJurisdiction(employee,source.value.snapshot.version);
    const codes = [], identity = identities.get(r.contractId.toLowerCase());
    if(jurisdiction.basis!=='captured_own_registration'||jurisdiction.code===null)codes.push('JURISDICTION_MISSING');
    if (!identity || identity.registrationId.toLowerCase() !== r.registrationId.toLowerCase() || identity.employeeNumber !== r.employeeNumber || identity.name !== r.name) codes.push('IDENTITY_CHANGED');
    const candidates = (accountsByContract.get(r.contractId.toLowerCase()) ?? []).filter(a => a.status === 'enabled' && a.validFrom <= profile.creditDate && (a.validUntil === null || a.validUntil >= profile.creditDate));
    need(candidates.length <= 1, 'La configuración aprobada contiene cuentas superpuestas. No se eligió una arbitrariamente.');
    const account = candidates[0] ?? null;
    if (!account) codes.push('ACCOUNT_MISSING');
    else { if (account.currency !== profile.currency) codes.push('CURRENCY_CHANGED'); const repeated = destinations.get(account.cbu) ?? []; repeated.push(index); destinations.set(account.cbu,repeated); }
    if (!validCuil(r.cuil)) codes.push('CUIL_INVALID');
    const cents = bankOutputCents(r.totals.net);
    if (cents === null) codes.push('FRACTIONAL_CENTS');
    else if (cents <= 0n) codes.push('NON_POSITIVE');
    else if (banking && cents > 9999999999n) codes.push('AMOUNT_OVERFLOW');
    const selected = !banking || jurisdiction.code === profile.jurisdictionCode && (!nacionOnly || account?.cbu.startsWith('011') && account.accountType === 'CA');
    const selectionReason = selected ? 'Incluido' : !account ? 'Destino no informado' : jurisdiction.code === null ? 'Jurisdicción no informada' : nacionOnly && !account.cbu.startsWith('011') ? 'Otra entidad bancaria' : jurisdiction.code !== profile.jurisdictionCode ? 'Otra jurisdicción' : !account.accountType ? 'Tipo de cuenta no informado' : 'Otro tipo de cuenta';
    if(nacionOnly && account?.cbu.startsWith('011') && !account.accountType)codes.push('ACCOUNT_TYPE_UNKNOWN');
    return {ordinal:index+1,jurisdiction,selected,selectionReason,contractId:r.contractId,registrationId:r.registrationId,sourceGroupId:r.sourceGroupId,closeSha256:groups.get(r.sourceGroupId.toLowerCase()).snapshotSha256,runId:r.runId,liquidationVersion:r.liquidationVersion,employeeNumber:r.employeeNumber,name:r.name,cuil:r.cuil,departmentCode:r.departmentCode,agreementCode:r.agreementCode,liquidationType:source.value.snapshot.liquidationType,net:r.totals.net,cents:cents === null ? null : cents.toString(),account:account ? {id:account.id,bankLabel:account.bankLabel,accountType:account.accountType,accountNumber:account.accountNumber,cbu:account.cbu,currency:account.currency,validFrom:account.validFrom,validUntil:account.validUntil} : null,issues:codes};
  });
  if (!profile.allowRepeatedDestinations) for (const indexes of destinations.values()) if (indexes.length > 1) for (const i of indexes) rows[i].issues.push('REPEATED_DESTINATION');
  const selected=rows.filter(r=>r.selected);
  if(banking && rows.some(r=>r.issues.includes('JURISDICTION_MISSING')))add('JURISDICTION_MISSING');
  if(nacionOnly && rows.some(r=>!r.account))add('ACCOUNT_DESTINATION_UNKNOWN');
  if(nacionOnly && rows.some(r=>r.issues.includes('ACCOUNT_TYPE_UNKNOWN')))add('ACCOUNT_TYPE_UNKNOWN');
  if(nacionOnly && rows.some(r=>r.issues.includes('IDENTITY_CHANGED')))add('IDENTITY_CHANGED');
  if(banking && !selected.length)add(nacionOnly?'EMPTY_DESTINATION':'EMPTY_JURISDICTION');
  const ready = issues.length === 0 && selected.every(r => r.issues.length === 0), sum = ready ? selected.reduce((n,r) => n+BigInt(r.cents),0n) : null;
  need(!banking || sum === null || sum <= 999999999999999n, 'El total supera las quince posiciones BNA. No se dividió el archivo.');
  const result = {version:'own-bank-output.v1',kind,period:snapshot.params.period,types:[...snapshot.params.types],selection:structuredClone(snapshot.params),issuer:structuredClone(snapshot.params.issuer),receiptId:batch.id,receiptSha256:batch.snapshotSha256,receiptReviewId:batch.review?.id ?? null,receiptDecision:structuredClone({preparedAt:batch.preparedAt,preparedBy:batch.preparedBy,review:batch.review}),accountsVersion:accounts.configuration.version,accountsApprovalId:accounts.configuration.approvalId,accountsSourceVersion:accounts.sources.version,scopeVersion:accounts.scopeVersion,profile,rows,recordCount:rows.length,selectedCount:selected.length,otherJurisdictionCount:banking?rows.filter(r=>r.jurisdiction.code!==null&&r.jurisdiction.code!==profile.jurisdictionCode).length:0,otherBankCount:nacionOnly?rows.filter(r=>r.account&&!r.account.cbu.startsWith('011')).length:0,otherAccountTypeCount:nacionOnly?rows.filter(r=>r.account?.cbu.startsWith('011')&&r.jurisdiction.code===profile.jurisdictionCode&&r.account.accountType!=='CA').length:0,issues,ready,totalCents:sum === null ? null : sum.toString(),repeatedDestinationCount:[...destinations.values()].filter(v => v.length>1&&(!nacionOnly||v.some(i=>rows[i].selected))).length,currencyBasis:'declared_at_export',bankSubmitted:false,paymentExecuted:false};
  result.fingerprint = await bankAccountsHash(result);
  freeze(result); reviews.add(result); return result;
}

export function bankOutputPage(review, search='', page=1) {
  need(reviews.has(review) && Number.isSafeInteger(page) && page>0, 'Revisá el conjunto completo.');
  const term = String(search).trim().toLocaleLowerCase('es'), rows = review.rows.filter(r => !term || [r.employeeNumber,r.name,r.departmentCode,r.account?.bankLabel??'',r.selectionReason,...r.issues.map(c => BANK_OUTPUT_ISSUES[c])].some(v => v.toLocaleLowerCase('es').includes(term)));
  const pages = Math.max(1,Math.ceil(rows.length/25)), current = Math.min(page,pages);
  return {rows:rows.slice((current-1)*25,current*25),page:current,pages,total:review.recordCount,filtered:rows.length};
}

// Public BNA GT design: three record types, exactly 200 ASCII/ANSI positions.
export function createBankOutputTxt(review) {
  need(reviews.has(review) && review.kind === 'bna' && review.ready, 'No se generó un TXT parcial. Corregí todas las observaciones y revisá nuevamente.');
  const p=review.profile, zero=(v,n)=>{const s=String(v);need(/^\d+$/.test(s)&&s.length<=n,'Un importe o referencia supera el diseño BNA.');return s.padStart(n,'0');}, spaces=n=>' '.repeat(n);
  const lines = ['1'+review.issuer.taxId+p.payerCbu.slice(3,7)+p.payerCbu.slice(8)+(p.currency==='ARS'?'0':'1')+p.compensationDate.replaceAll('-','')+p.information.padEnd(20,' ')+'SUE1'+zero(p.agreementCode,10)+zero(p.sendNumber,6)+spaces(121)];
  for (const r of review.rows.filter(r=>r.selected)) { const cbu=r.account.cbu; lines.push('2'+'0'+cbu.slice(0,3)+cbu.slice(3,7)+cbu[7]+cbu.slice(8)+zero(r.cents,10)+zero(p.sendNumber,6)+zero(r.ordinal,9)+r.cuil.padEnd(22,' ')+'102'+r.cuil+'00'+spaces(13)+p.loanIdentifier+spaces(96)); }
  lines.push('3'+zero(review.totalCents,15)+zero(review.selectedCount,7)+'0'.repeat(94)+spaces(83));
  need(lines.every(s=>s.length===200&&/^[A-Z0-9 ]{200}$/.test(s)), 'El TXT no cumple el diseño completo.');
  return {bytes:new TextEncoder().encode(lines.join('\r\n')+'\r\n'),filename:'haberes-propios-bna-'+review.period+'-j'+p.jurisdictionCode+'-'+(p.destinationScope==='nacion_ca'?'nacion-ca':'todos-destinos')+'-envio-'+p.sendNumber+'.txt',recordCount:review.selectedCount,totalCents:review.totalCents};
}
const csvCell = (v, literal=false) => {let s=String(v??'');if(literal||/^[\s\u0000-\u001f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function createBankOutputCsv(review) {
  need(reviews.has(review) && review.kind === 'bna', 'Revisá el conjunto completo antes de descargar.');
  const columns=['Fila de origen','Legajo','Nombre','CUIL','CBU','Neto original','Moneda declarada','Observaciones','Contrato propio','Registro propio','Cierre propio','Huella cierre','Corrida propia','Versión liquidación','Cuenta propia','Emisión aprobada','Huella emisión','Revisión emisión','Aprobación cuentas','Versión cuentas','Compensación declarada','Acreditación declarada','Convenio BNA','Envío BNA','Identificador préstamo','Huella revisión completa','Jurisdicción conservada','Procedencia jurisdicción','Huella captura jurisdicción','Jurisdicción del TXT','Incluido en el TXT elegido','Destinos elegidos','Entidad del CBU aprobado','Tipo de cuenta aprobado','Motivo de selección','Número de cuenta declarado','Banco declarado'];
  const lines=[columns.map(v=>csvCell(v)).join(';')];
  for(const r of review.rows)lines.push([r.ordinal,r.employeeNumber,r.name,r.cuil,r.account?.cbu,r.net,review.profile.currency,[...review.issues,...r.issues].map(c=>BANK_OUTPUT_ISSUES[c]).join(' | '),r.contractId,r.registrationId,r.sourceGroupId,r.closeSha256,r.runId,r.liquidationVersion,r.account?.id,review.receiptId,review.receiptSha256,review.receiptReviewId,review.accountsApprovalId,review.accountsVersion,review.profile.compensationDate,review.profile.creditDate,review.profile.agreementCode,review.profile.sendNumber,review.profile.loanIdentifier,review.fingerprint,r.jurisdiction.code,r.jurisdiction.basis,r.jurisdiction.sourceSha256,review.profile.jurisdictionCode,r.selected?'Sí':'No',BNA_DESTINATION_LABELS[review.profile.destinationScope],r.account?.cbu.slice(0,3),r.account?.accountType,r.selectionReason,r.account?.accountNumber,r.account?.bankLabel].map((v,i)=>csvCell(v,[1,3,4,22,23,24,32,35].includes(i))).join(';'));
  return {bytes:new TextEncoder().encode('\uFEFF'+lines.join('\r\n')+'\r\n'),filename:'control-bancario-propio-'+review.period+'.csv',recordCount:review.recordCount};
}
export const sameBankOutput = (a,b) => reviews.has(a) && reviews.has(b) && a.fingerprint === b.fingerprint && salarySerialized(a.profile) === salarySerialized(b.profile);

// Control exports may retain observations, but never an unapproved or stale source.
export function verifiedBankControl(review) {
  need(reviews.has(review) && review.kind === 'control' && review.issues.length === 0 && !review.rows.some(r=>r.issues.includes('IDENTITY_CHANGED')), 'No se verificó una emisión y cuentas aprobadas vigentes para descargar el control completo.');
  return review;
}
export function bankControlGroups(review) {
  verifiedBankControl(review);
  return groupedRows(review);
}
export function verifiedBankOutputControl(review) {
  need(reviews.has(review) && review.kind === 'bna' && !review.issues.some(c=>['EMPTY','UNAPPROVED','UNAVAILABLE','ACCOUNTS_UNAPPROVED','ISSUER_INVALID','PAYMENT_DATE_CHANGED'].includes(c)) && !review.rows.some(r=>r.issues.includes('IDENTITY_CHANGED')), 'No se verificó la emisión y cuentas propias aprobadas para descargar el control Nación completo.');
  return review;
}
export function bankOutputGroups(review) {
  verifiedBankOutputControl(review);
  return groupedRows(review);
}
function groupedRows(review) {
  const groups = new Map();
  for (const r of review.rows) {
    const dimensions = [r.departmentCode,r.account?.bankLabel??null,r.account?.accountType??null,r.jurisdiction.code,review.profile.currency,r.liquidationType], key = JSON.stringify(dimensions);
    if (!groups.has(key)) groups.set(key,{departmentCode:dimensions[0],bankLabel:dimensions[1],accountType:dimensions[2],jurisdictionCode:dimensions[3],currency:dimensions[4],liquidationType:dimensions[5],recordCount:0,observedCount:0,unresolvedNetCount:0,knownCents:0n});
    const g=groups.get(key);g.recordCount++;if(r.issues.length)g.observedCount++;if(r.cents===null)g.unresolvedNetCount++;else g.knownCents+=BigInt(r.cents);
  }
  return [...groups.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,g])=>({...g,knownCents:g.knownCents.toString(),totalCents:g.unresolvedNetCount?null:g.knownCents.toString()}));
}
