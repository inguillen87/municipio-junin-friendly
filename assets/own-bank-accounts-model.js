import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';

export const BANK_ACCOUNTS_VERSION = 'own-bank-accounts.v1';
export const BANK_ACCOUNTS_MAX_BYTES = 8 * 1024 * 1024;
export const BANK_ACCOUNTS_LIMITS = Object.freeze({ accounts: 10000, contracts: 10000, proposals: 500, revisions: 1000 });
export const BANK_ACCOUNT_FIELDS = Object.freeze(['id', 'contractId', 'bankLabel', 'cbu', 'accountType', 'accountNumber', 'currency', 'validFrom', 'validUntil', 'status', 'documentReference']);
export const BANK_PAYMENT_CHANNEL_VERSION = 'own-bank-payment-channel.v1';
export const BANK_PAYMENT_CHANNELS = Object.freeze({bank_payroll:'Acreditación bancaria de haberes',credicoop_transfers:'Transferencias varias · Credicoop'});
export const BANK_ACCOUNT_CHANNEL_FIELDS = Object.freeze([...BANK_ACCOUNT_FIELDS,'paymentChannelVersion','paymentChannel']);
const need = (v, message, code = 'INPUT_INVALID') => { if (!v) throw new SalaryInputError('BANK_ACCOUNTS_' + code, message); };
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const ordered = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

// BCRA block checks establish syntax only. They never establish account ownership,
// currency, account type or permission to execute a transfer.
export function bankAccountCbu(v) {
  if (typeof v !== 'string' || !/^[0-9]{22}$/.test(v) || /^0+$/.test(v)) return false;
  const check = (digits, weights) => (10 - weights.reduce((sum, weight, i) => sum + Number(digits[i]) * weight, 0) % 10) % 10;
  return check(v.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) === Number(v[7]) && check(v.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === Number(v[21]);
}
export const bankAccountKey = r => r.id.toLowerCase();
// A declared payment channel is independent of the recipient bank, CBU and
// account type. Old revisions remain byte-identical and acquire no default.
export function bankAccountChannel(r) {
  const declared=Object.hasOwn(r,'paymentChannelVersion')||Object.hasOwn(r,'paymentChannel');
  if(!declared)return {};
  need(r.paymentChannelVersion===BANK_PAYMENT_CHANNEL_VERSION&&(r.paymentChannel===null||typeof r.paymentChannel==='string'&&Object.hasOwn(BANK_PAYMENT_CHANNELS,r.paymentChannel)), 'Elegí un canal de acreditación válido o dejalo sin declarar.');
  need(r.paymentChannel!=='credicoop_transfers'||r.accountType==='CA','Transferencias varias requiere caja de ahorro declarada; no se deduce del CBU.');
  return {paymentChannelVersion:r.paymentChannelVersion,paymentChannel:r.paymentChannel};
}
export function bankAccountsDefinition(v) {
  need(salaryExact(v, ['accounts']) && Array.isArray(v.accounts), 'Revisá el conjunto completo de cuentas.');
  need(v.accounts.length <= BANK_ACCOUNTS_LIMITS.accounts, 'El conjunto supera su capacidad; no se recortaron cuentas.', 'LIMIT');
  need(v.accounts.length > 0, 'Agregá una cuenta. Retirar una cuenta conserva su registro y las versiones anteriores.');
  const seen = new Set();
  const accounts = v.accounts.map(r => {
    need((salaryExact(r, BANK_ACCOUNT_FIELDS)||salaryExact(r,BANK_ACCOUNT_CHANNEL_FIELDS)) && [r.id, r.contractId].every(salaryUuid) && !seen.has(bankAccountKey(r)), 'Elegí un contrato propio y una referencia de cuenta única.');
    bankAccountChannel(r);
    seen.add(bankAccountKey(r));
    need(text(r.bankLabel, 1, 160) && bankAccountCbu(r.cbu) && (r.accountType === null || ['CA', 'CC'].includes(r.accountType)) && (r.accountNumber === null || text(r.accountNumber, 1, 40)) && ['ARS', 'USD'].includes(r.currency) && ['enabled', 'withdrawn'].includes(r.status) && text(r.documentReference, 3, 180), 'Revisá banco, CBU, moneda, estado y constancia. Un dato no informado queda vacío; no se deduce del CBU.');
    need(civilDay(r.validFrom) && (r.validUntil === null || civilDay(r.validUntil) && r.validUntil >= r.validFrom), 'Informá fechas civiles válidas; el fin no puede ser anterior al inicio.');
    return { ...r };
  }).sort((a, b) => ordered(bankAccountKey(a), bankAccountKey(b)));
  const intervals = accounts.filter(r => r.status === 'enabled').sort((a, b) => ordered(a.contractId.toLowerCase(), b.contractId.toLowerCase()) || ordered(a.validFrom, b.validFrom));
  let prior = null;
  for (const r of intervals) { need(!prior || prior.contractId.toLowerCase() !== r.contractId.toLowerCase() || prior.validUntil !== null && prior.validUntil < r.validFrom, 'Dos cuentas habilitadas se superponen para el mismo contrato. Cerrá la vigencia anterior o retirala expresamente.', 'OVERLAP'); prior = r; }
  return { accounts };
}
export function bankAccountsHistory(before, after) {
  if (!before) return;
  const old = bankAccountsDefinition(before), next = new Map(bankAccountsDefinition(after).accounts.map(r => [bankAccountKey(r), r]));
  for (const r of old.accounts) { const n = next.get(bankAccountKey(r)); need(n && n.contractId.toLowerCase() === r.contractId.toLowerCase(), 'Conservá cada referencia y su contrato. Para retirar una cuenta cambiá su estado; la corrección requiere una nueva revisión.', 'HISTORY_REQUIRED'); }
}
export function bankAccountsSources(v) {
  need(salaryExact(v, ['version', 'contracts']) && salaryHash(v.version) && Array.isArray(v.contracts), 'No se verificó la fuente completa de contratos propios.', 'CONTRACT_INVALID');
  need(v.contracts.length <= BANK_ACCOUNTS_LIMITS.contracts, 'La fuente supera su capacidad; no se muestra una población parcial.', 'LIMIT');
  const seen = new Set();
  for (const r of v.contracts) { need(salaryExact(r, ['contractId', 'registrationId', 'employeeNumber', 'name']) && [r.contractId, r.registrationId].every(salaryUuid) && text(r.employeeNumber, 1, 40) && text(r.name, 1, 160) && !seen.has(r.contractId.toLowerCase()), 'No se verificó la identidad de un contrato propio.', 'CONTRACT_INVALID'); seen.add(r.contractId.toLowerCase()); }
  return v;
}
export function bankAccountsLinkedDefinition(v, sources, baseline = null) {
  const d = bankAccountsDefinition(v), s = bankAccountsSources(sources); bankAccountsHistory(baseline, d);
  const contracts = new Set(s.contracts.map(r => r.contractId.toLowerCase())), old = new Map(baseline?.accounts.map(r => [bankAccountKey(r), r]) ?? []);
  for (const r of d.accounts) {
    // An archived identity may retain an unchanged account or explicitly withdraw
    // it, but cannot acquire corrected or newly enabled financial destinations.
    const p = old.get(bankAccountKey(r));
    need(contracts.has(r.contractId.toLowerCase()) || p && (salarySerialized(p) === salarySerialized(r) || r.status === 'withdrawn' && salarySerialized({ ...p, status: 'withdrawn' }) === salarySerialized(r)), 'La cuenta requiere un contrato incorporado al padrón propio. No se vincula por nombre, DNI o número de legajo.', 'SOURCE_REQUIRED');
  }
  return d;
}
export function bankAccountsCommand(v) {
  need(salaryExact(v, ['command', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'definition', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(v.command) && [v.scopeVersion, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá operación, fuente, versión y fundamento completos.');
  if (v.command === 'propose') { need(v.proposalId === null && v.proposalSha256 === null && v.definition !== null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para revisión independiente.'); return { ...v, definition: bankAccountsDefinition(v.definition) }; }
  need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.definition === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá la revisión completa.'); return { ...v };
}
export function bankAccountsReceipt(v, attempt = null) {
  need(salaryExact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'transferGenerated', 'paymentExecuted']) && v.version === BANK_ACCOUNTS_VERSION && [v.eventId, v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= BANK_ACCOUNTS_LIMITS.revisions && typeof v.replayed === 'boolean' && v.transferGenerated === false && v.paymentExecuted === false, 'No se verificó el comprobante bancario.', 'CONTRACT_INVALID');
  bankAccountsCommand(v.body); need(v.status === ({ propose: 'pending', approve: 'approved', reject: 'rejected' })[v.body.command] && (v.body.command === 'propose' ? v.eventId.toLowerCase() === v.proposalId.toLowerCase() && v.configurationVersion === v.body.baseVersion : v.proposalId.toLowerCase() === v.body.proposalId.toLowerCase()), 'El comprobante no corresponde a la operación revisada.', 'CONTRACT_INVALID');
  if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el contenido o la clave originales.', 'CONTRACT_INVALID'); return v;
}
export async function bankAccountsHash(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function verifiedBankAccountsReceipt(v, attempt = null) { bankAccountsReceipt(v, attempt); need(v.requestSha256 === await bankAccountsHash(v.body), 'No se verificó el contenido del comprobante.', 'CONTRACT_INVALID'); return v; }
export function bankAccountsSummary(v) {
  need(salaryExact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'reason', 'createdAt', 'authorLabel', 'accountCount', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && text(v.authorLabel, 1, 160) && typeof v.createdAt === 'string' && !isNaN(Date.parse(v.createdAt)) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status) && Number.isInteger(v.accountCount) && v.accountCount > 0 && v.accountCount <= BANK_ACCOUNTS_LIMITS.accounts, 'No se verificó la propuesta conservada.', 'CONTRACT_INVALID');
  need(v.status === 'pending' ? v.decision === null : salaryExact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && !isNaN(Date.parse(v.decision.recordedAt)) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0, 'La decisión no coincide con su propuesta.', 'CONTRACT_INVALID'); return v;
}
export function bankAccountsBootstrap(v) {
  need(salaryExact(v, ['version', 'scopeVersion', 'sources', 'configuration', 'proposals', 'permissions', 'complete', 'transferGenerated', 'paymentExecuted']) && v.version === BANK_ACCOUNTS_VERSION && salaryHash(v.scopeVersion) && v.complete === true && v.transferGenerated === false && v.paymentExecuted === false && salaryExact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa de cuentas.', 'CONTRACT_INVALID');
  bankAccountsSources(v.sources); const c = v.configuration;
  need(salaryExact(c, ['version', 'revision', 'definition', 'proposalId', 'approvalId']) && salaryHash(c.version) && Number.isInteger(c.revision) && c.revision >= 0 && c.revision <= BANK_ACCOUNTS_LIMITS.revisions && (c.revision === 0 ? c.definition === null && c.proposalId === null && c.approvalId === null : c.definition !== null && [c.proposalId, c.approvalId].every(salaryUuid)), 'No se verificó la versión aprobada.', 'CONTRACT_INVALID');
  if (c.definition) bankAccountsDefinition(c.definition);
  need(Array.isArray(v.proposals) && v.proposals.length <= BANK_ACCOUNTS_LIMITS.proposals, 'La cola supera su capacidad; no se muestra una consulta parcial.', 'LIMIT'); const ids = new Set();
  for (const p of v.proposals) { bankAccountsSummary(p); need(!ids.has(p.id.toLowerCase()), 'Hay una propuesta repetida.', 'CONTRACT_INVALID'); ids.add(p.id.toLowerCase()); } return v;
}
export async function bankAccountsDetail(v) {
  need(salaryExact(v, ['version', 'scopeVersion', 'proposal', 'body', 'baseDefinition', 'sources', 'current']) && v.version === BANK_ACCOUNTS_VERSION && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó la revisión completa.', 'CONTRACT_INVALID');
  const p = bankAccountsSummary(v.proposal), body = bankAccountsCommand(v.body); bankAccountsSources(v.sources);
  need(body.command === 'propose' && p.requestSha256 === await bankAccountsHash(body) && p.baseVersion === body.baseVersion && p.sourceVersion === body.sourceVersion && v.sources.version === body.sourceVersion && body.definition.accounts.length === p.accountCount, 'La propuesta cambió o perdió cuentas.', 'CONTRACT_INVALID');
  bankAccountsLinkedDefinition(body.definition, v.sources, v.baseDefinition); return v;
}
export function bankAccountsChanges(before, after) {
  const next = bankAccountsDefinition(after), prior = before ? bankAccountsDefinition(before) : { accounts: [] }, old = new Map(prior.accounts.map(r => [bankAccountKey(r), r]));
  return next.accounts.flatMap(r => { const p = old.get(bankAccountKey(r)) ?? null; return !p || salarySerialized(p) !== salarySerialized(r) ? [{ key: bankAccountKey(r), before: p, after: r }] : []; });
}
export function bankAccountsAttempt(key, body, accessKey) { need(salaryKey(key) && typeof accessKey === 'string' && accessKey, 'No se pudo identificar el intento.'); return freeze({ key, body: structuredClone(bankAccountsCommand(body)), accessKey }); }
