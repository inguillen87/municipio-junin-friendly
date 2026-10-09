import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';

export const ACCOUNTING_VERSION = 'own-payroll-accounting.v1';
export const ACCOUNTING_MAX_BYTES = 8 * 1024 * 1024;
export const ACCOUNTING_LIMITS = Object.freeze({ mappings: 2000, assignments: 10000, proposals: 500, revisions: 1000 });
export const ACCOUNTING_NATURES = Object.freeze({ remuneration: 'Haber remunerativo', non_remuneration: 'Haber no remunerativo', deduction: 'Retención', employer_contribution: 'Contribución patronal' });
export const ACCOUNTING_MAPPING_FIELDS = Object.freeze(['fiscalYear', 'jurisdictionCode', 'agreementCode', 'departmentCode', 'conceptCode', 'nature', 'budgetItemReference', 'supplierReference', 'creditorReference', 'accountingAccountReference', 'bankAccountReference', 'bankReference', 'validFrom', 'validUntil', 'ruleReference']);
export const ACCOUNTING_BANK_DESTINATION_VERSION = 'own-accounting-bank-destination.v1';
export const ACCOUNTING_NET_CREDITORS = Object.freeze({ not_informed: 'No informado', none: 'Ninguno', reference: 'Acreedor declarado' });
export const ACCOUNTING_BANK_FIELDS = Object.freeze(['bankConceptReference', 'bankMovementReference', 'netCreditorKind', 'netCreditorReference', 'indicatesNet']);
const bankMappingFields = Object.freeze([...ACCOUNTING_MAPPING_FIELDS, 'bankDestinationVersion', ...ACCOUNTING_BANK_FIELDS]);
export const accountingMappingFields = r => Object.hasOwn(r, 'bankDestinationVersion') ? bankMappingFields : ACCOUNTING_MAPPING_FIELDS;
// A view of an older record is unknown, never an inferred bank instruction.
// Do not insert this projection into its conserved definition or request hash.
export function accountingBankDestination(r) {
  return r.bankDestinationVersion === ACCOUNTING_BANK_DESTINATION_VERSION ? Object.fromEntries(ACCOUNTING_BANK_FIELDS.map(k => [k, r[k]])) : { bankConceptReference: null, bankMovementReference: null, netCreditorKind: 'not_informed', netCreditorReference: null, indicatesNet: null };
}
export const ACCOUNTING_ASSIGNMENT_FIELDS = Object.freeze(['contractId', 'conceptCode', 'institutionalReference', 'functionReference', 'validFrom', 'validUntil', 'ruleReference']);
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const need = (v, message, code = 'INPUT_INVALID') => { if (!v) throw new SalaryInputError('ACCOUNTING_' + code, message); };
const ordered = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
export const accountingMappingKey = r => [r.fiscalYear, r.jurisdictionCode, r.agreementCode, r.departmentCode, r.conceptCode, r.validFrom].join(':');
export const accountingAssignmentKey = r => [r.contractId.toLowerCase(), r.conceptCode ?? '*', r.validFrom].join(':');
function dates(r) { need(civilDay(r.validFrom) && (r.validUntil === null || civilDay(r.validUntil) && r.validUntil >= r.validFrom), 'Informá fechas civiles válidas, con el inicio anterior o igual al fin.'); }
function noOverlap(rows, key) {
  const groups = new Map();
  for (const r of rows) {
    const id = key(r), prior = groups.get(id);
    need(!prior || prior.validUntil !== null && prior.validUntil < r.validFrom, 'Hay asociaciones superpuestas para el mismo alcance. Cerrá la vigencia anterior antes de crear otra.', 'OVERLAP');
    groups.set(id, r);
  }
}
export function accountingDefinition(value) {
  need(salaryExact(value, ['mappings', 'assignments']) && Array.isArray(value.mappings) && Array.isArray(value.assignments), 'Revisá ambas listas completas de asociaciones.');
  need(value.mappings.length <= ACCOUNTING_LIMITS.mappings && value.assignments.length <= ACCOUNTING_LIMITS.assignments, 'El conjunto supera su capacidad. No se recortaron asociaciones.', 'LIMIT');
  need(value.mappings.length + value.assignments.length > 0, 'Agregá al menos una asociación; una lista vacía no retira el historial.');
  const mappings = value.mappings.map(r => {
    need(r && salaryExact(r, accountingMappingFields(r)) && typeof r.fiscalYear === 'string' && /^(19|20)[0-9]{2}$/.test(r.fiscalYear) && ['42', '55'].includes(r.jurisdictionCode) && [r.agreementCode, r.departmentCode, r.conceptCode].every(code) && Object.hasOwn(ACCOUNTING_NATURES, r.nature), 'Revisá año, jurisdicción, convenio, repartición, concepto y naturaleza.');
    dates(r); need(r.validUntil !== null && r.validFrom.slice(0, 4) === r.fiscalYear && r.validUntil.slice(0, 4) === r.fiscalYear, 'La matriz anual necesita fechas explícitas dentro del año elegido.');
    need(text(r.budgetItemReference, 1, 80) && text(r.ruleReference, 3, 180), 'Informá la partida y el documento que respalda la asociación.');
    for (const field of ['supplierReference', 'creditorReference', 'accountingAccountReference', 'bankAccountReference', 'bankReference']) need(r[field] === null || text(r[field], 1, 80), 'Conservá cada referencia por separado; vacío significa no informado.');
    if (Object.hasOwn(r, 'bankDestinationVersion')) {
      need(r.bankDestinationVersion === ACCOUNTING_BANK_DESTINATION_VERSION && typeof r.netCreditorKind === 'string' && Object.hasOwn(ACCOUNTING_NET_CREDITORS, r.netCreditorKind) && (r.indicatesNet === null || typeof r.indicatesNet === 'boolean'), 'Revisá la declaración de acreedor de neto e Indica neto; no informado es distinto de ninguno y de No.');
      for (const field of ['bankConceptReference', 'bankMovementReference']) need(r[field] === null || text(r[field], 1, 80), 'Conservá el concepto y movimiento bancarios por separado de las cuentas.');
      need(r.netCreditorKind === 'reference' ? text(r.netCreditorReference, 1, 80) : r.netCreditorReference === null, 'Informá el acreedor de neto sólo cuando declarás una referencia.');
    }
    return { ...r };
  }).sort((a, b) => ordered(accountingMappingKey(a), accountingMappingKey(b)));
  noOverlap(mappings, r => accountingMappingKey(r).slice(0, -11));
  const assignments = value.assignments.map(r => {
    need(salaryExact(r, ACCOUNTING_ASSIGNMENT_FIELDS) && salaryUuid(r.contractId) && (r.conceptCode === null || code(r.conceptCode)) && text(r.institutionalReference, 1, 80) && text(r.functionReference, 1, 80) && text(r.ruleReference, 3, 180), 'Elegí un contrato propio, el concepto o todos, la institución, la función y su respaldo.');
    dates(r); return { ...r };
  }).sort((a, b) => ordered(accountingAssignmentKey(a), accountingAssignmentKey(b)));
  noOverlap(assignments, r => accountingAssignmentKey(r).slice(0, -11));
  // A generic assignment and a concept-specific assignment never silently override
  // one another. The complete source must contain a unique explicit destination.
  const byContract = new Map();
  for (const r of assignments) { const id = r.contractId.toLowerCase(), group = byContract.get(id) ?? []; group.push(r); byContract.set(id, group); }
  for (const rows of byContract.values()) {
    const generic = rows.filter(r => r.conceptCode === null);
    for (const r of rows.filter(r => r.conceptCode !== null)) {
      let low = 0, high = generic.length;
      while (low < high) { const middle = (low + high) >>> 1; if (generic[middle].validFrom <= (r.validUntil ?? '9999-12-31')) low = middle + 1; else high = middle; }
      need(!low || (generic[low - 1].validUntil ?? '9999-12-31') < r.validFrom, 'Una asociación para todos los conceptos se superpone con otra particular. Revisá ambas vigencias.', 'OVERLAP');
    }
  }
  return { mappings, assignments };
}
export function accountingHistory(before, after) {
  if (!before) return;
  const old = accountingDefinition(before), next = accountingDefinition(after);
  for (const [list, key] of [['mappings', accountingMappingKey], ['assignments', accountingAssignmentKey]]) {
    const indexed = new Map(next[list].map(r => [key(r), r]));
    for (const r of old[list]) {
      const n = indexed.get(key(r));
      need(n, 'Conservá cada asociación anterior. Para reemplazarla, cerrá su vigencia y agregá la nueva.', 'HISTORY_REQUIRED');
      const { validUntil: previousEnd, ...previous } = r, { validUntil: end, ...fresh } = n;
      need(salarySerialized(previous) === salarySerialized(fresh) && (previousEnd === end || end !== null && (previousEnd === null || end < previousEnd)), 'No sobrescribas destinos o fechas de inicio anteriores. Cerrá su vigencia y agregá la nueva asociación.', 'HISTORY_REQUIRED');
    }
  }
}
export function accountingSources(v) {
  need(salaryExact(v, ['version', 'classificationVersion', 'salaryVersion', 'agreements', 'departments', 'concepts', 'contracts']) && [v.version, v.classificationVersion, v.salaryVersion].every(salaryHash) && ['agreements', 'departments', 'concepts', 'contracts'].every(k => Array.isArray(v[k])), 'No se verificó la fuente completa de contratos y catálogos.', 'CONTRACT_INVALID');
  need(v.agreements.length <= 1000 && v.departments.length <= 1000 && v.concepts.length <= 1000 && v.contracts.length <= ACCOUNTING_LIMITS.assignments, 'La fuente supera su capacidad; no se muestra una población parcial.', 'LIMIT');
  for (const list of ['agreements', 'departments']) {
    const seen = new Set();
    for (const r of v[list]) { need(salaryExact(r, ['code', 'label']) && code(r.code) && text(r.label, 1, 160) && !seen.has(r.code), 'No se verificaron las referencias administrativas.', 'CONTRACT_INVALID'); seen.add(r.code); }
  }
  for (const r of v.concepts) need(salaryExact(r, ['agreementCode', 'code', 'nature', 'label', 'validFrom', 'validUntil']) && [r.agreementCode, r.code].every(code) && Object.hasOwn(ACCOUNTING_NATURES, r.nature) && text(r.label, 1, 160) && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(r.validFrom) && (r.validUntil === null || /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(r.validUntil) && r.validUntil >= r.validFrom), 'No se verificaron los conceptos aprobados.', 'CONTRACT_INVALID');
  const contracts = new Set();
  for (const r of v.contracts) { need(salaryExact(r, ['contractId', 'registrationId', 'employeeNumber', 'name']) && [r.contractId, r.registrationId].every(salaryUuid) && text(r.employeeNumber, 1, 40) && text(r.name, 1, 160) && !contracts.has(r.contractId.toLowerCase()), 'No se verificó la identidad de un contrato propio.', 'CONTRACT_INVALID'); contracts.add(r.contractId.toLowerCase()); }
  return v;
}
function monthAfter(v) { const [y, m] = v.split('-').map(Number); return String(m === 12 ? y + 1 : y) + '-' + String(m === 12 ? 1 : m + 1).padStart(2, '0'); }
export function accountingLinkedDefinition(value, sources, baseline = null) {
  const result = accountingDefinition(value), s = accountingSources(sources);
  accountingHistory(baseline, result);
  const oldMappings = new Set(baseline?.mappings.map(accountingMappingKey) ?? []), oldAssignments = new Set(baseline?.assignments.map(accountingAssignmentKey) ?? []);
  const agreements = new Set(s.agreements.map(r => r.code)), departments = new Set(s.departments.map(r => r.code)), contracts = new Set(s.contracts.map(r => r.contractId.toLowerCase()));
  for (const r of result.mappings) {
    if (oldMappings.has(accountingMappingKey(r))) continue;
    need(agreements.has(r.agreementCode) && departments.has(r.departmentCode), 'El convenio o la repartición no pertenecen al catálogo aprobado.', 'SOURCE_REQUIRED');
    let cursor = r.validFrom.slice(0, 7), covered = false;
    for (const c of s.concepts.filter(c => c.agreementCode === r.agreementCode && c.code === r.conceptCode && c.nature === r.nature).sort((a, b) => ordered(a.validFrom, b.validFrom))) {
      const end = c.validUntil ?? '9999-12'; if (end < cursor) continue; if (c.validFrom > cursor) break; if (end >= r.validUntil.slice(0, 7)) { covered = true; break; } cursor = monthAfter(end);
    }
    need(covered, 'El concepto y su naturaleza aprobados deben cubrir toda la vigencia de la asociación.', 'SOURCE_REQUIRED');
  }
  for (const r of result.assignments) if (!oldAssignments.has(accountingAssignmentKey(r))) need(contracts.has(r.contractId.toLowerCase()) && (r.conceptCode === null || s.concepts.some(c => c.code === r.conceptCode)), 'La asociación requiere un contrato propio y un concepto aprobado. No se vincula por nombre o documento.', 'SOURCE_REQUIRED');
  return result;
}
export function accountingCommand(v) {
  need(salaryExact(v, ['command', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'definition', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(v.command) && [v.scopeVersion, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá operación, fuentes, versión y motivo completos.');
  if (v.command === 'propose') { need(v.proposalId === null && v.proposalSha256 === null && v.definition !== null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para revisión independiente.'); return { ...v, definition: accountingDefinition(v.definition) }; }
  need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.definition === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá la revisión completa.'); return { ...v };
}
export function accountingReceipt(v, attempt = null) {
  need(salaryExact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'accountingPosted', 'paymentExecuted']) && v.version === ACCOUNTING_VERSION && [v.eventId, v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= ACCOUNTING_LIMITS.revisions && typeof v.replayed === 'boolean' && v.accountingPosted === false && v.paymentExecuted === false, 'No se verificó el comprobante de la asociación.', 'CONTRACT_INVALID');
  accountingCommand(v.body); need(v.status === ({ propose: 'pending', approve: 'approved', reject: 'rejected' })[v.body.command] && (v.body.command === 'propose' ? v.eventId.toLowerCase() === v.proposalId.toLowerCase() && v.configurationVersion === v.body.baseVersion : v.proposalId.toLowerCase() === v.body.proposalId.toLowerCase()), 'El comprobante no corresponde a la operación revisada.', 'CONTRACT_INVALID');
  if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el cuerpo o la clave originales.', 'CONTRACT_INVALID'); return v;
}
export async function accountingHash(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function verifiedAccountingReceipt(v, attempt = null) { accountingReceipt(v, attempt); need(v.requestSha256 === await accountingHash(v.body), 'No se verificó el contenido del comprobante.', 'CONTRACT_INVALID'); return v; }
export function accountingSummary(v) {
  need(salaryExact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'reason', 'createdAt', 'authorLabel', 'mappingCount', 'assignmentCount', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && text(v.authorLabel, 1, 160) && typeof v.createdAt === 'string' && !isNaN(Date.parse(v.createdAt)) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status) && Number.isInteger(v.mappingCount) && v.mappingCount >= 0 && v.mappingCount <= ACCOUNTING_LIMITS.mappings && Number.isInteger(v.assignmentCount) && v.assignmentCount >= 0 && v.assignmentCount <= ACCOUNTING_LIMITS.assignments, 'No se verificó la propuesta conservada.', 'CONTRACT_INVALID');
  need(v.status === 'pending' ? v.decision === null : salaryExact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && !isNaN(Date.parse(v.decision.recordedAt)) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0, 'La decisión no coincide con su propuesta.', 'CONTRACT_INVALID'); return v;
}
export function accountingBootstrap(v) {
  need(salaryExact(v, ['version', 'scopeVersion', 'sources', 'configuration', 'proposals', 'permissions', 'complete', 'accountingPosted', 'paymentExecuted']) && v.version === ACCOUNTING_VERSION && salaryHash(v.scopeVersion) && v.complete === true && v.accountingPosted === false && v.paymentExecuted === false && salaryExact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa de asociaciones.', 'CONTRACT_INVALID');
  accountingSources(v.sources); const c = v.configuration;
  need(salaryExact(c, ['version', 'revision', 'definition', 'proposalId', 'approvalId']) && salaryHash(c.version) && Number.isInteger(c.revision) && c.revision >= 0 && c.revision <= ACCOUNTING_LIMITS.revisions && (c.revision === 0 ? c.definition === null && c.proposalId === null && c.approvalId === null : c.definition !== null && [c.proposalId, c.approvalId].every(salaryUuid)), 'No se verificó la versión aprobada.', 'CONTRACT_INVALID');
  if (c.definition) accountingDefinition(c.definition);
  need(Array.isArray(v.proposals) && v.proposals.length <= ACCOUNTING_LIMITS.proposals, 'La cola supera su capacidad; no se muestra una consulta parcial.', 'LIMIT'); const ids = new Set();
  for (const p of v.proposals) { accountingSummary(p); need(!ids.has(p.id.toLowerCase()), 'Hay una propuesta repetida.', 'CONTRACT_INVALID'); ids.add(p.id.toLowerCase()); } return v;
}
export async function accountingDetail(v) {
  need(salaryExact(v, ['version', 'scopeVersion', 'proposal', 'body', 'baseDefinition', 'sources', 'current']) && v.version === ACCOUNTING_VERSION && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó la revisión completa.', 'CONTRACT_INVALID');
  const p = accountingSummary(v.proposal), body = accountingCommand(v.body); accountingSources(v.sources);
  need(body.command === 'propose' && p.requestSha256 === await accountingHash(body) && p.baseVersion === body.baseVersion && p.sourceVersion === body.sourceVersion && v.sources.version === body.sourceVersion && body.definition.mappings.length === p.mappingCount && body.definition.assignments.length === p.assignmentCount, 'La propuesta cambió o perdió asociaciones.', 'CONTRACT_INVALID');
  accountingLinkedDefinition(body.definition, v.sources, v.baseDefinition); return v;
}
export function accountingChanges(before, after) {
  const next = accountingDefinition(after), prior = before ? accountingDefinition(before) : { mappings: [], assignments: [] }, changes = [];
  for (const [kind, key] of [['mappings', accountingMappingKey], ['assignments', accountingAssignmentKey]]) {
    const old = new Map(prior[kind].map(r => [key(r), r]));
    for (const r of next[kind]) { const p = old.get(key(r)) ?? null; if (!p || salarySerialized(p) !== salarySerialized(r)) changes.push({ kind, key: key(r), before: p, after: r }); }
  } return changes;
}
export function accountingAttempt(key, body, accessKey) { need(salaryKey(key) && typeof accessKey === 'string' && accessKey, 'No se pudo identificar el intento.'); return freeze({ key, body: structuredClone(accountingCommand(body)), accessKey }); }
