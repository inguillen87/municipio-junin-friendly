import { salaryItems, salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized } from './native-salary-catalog-model.js';
import { validateOwnPayrollRulePeriods, OWN_PAYROLL_NAMESPACE_VERSION, ownPayrollRuleIdentity } from './own-payroll-engine.js';
import { payrollRequire as require } from './own-payroll-exact.js';
export const OWN_PROGRAM_VERSION = 'own-payroll-program.v1';
export const OWN_PROGRAM_MAX_BYTES = 4 * 1024 * 1024;
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
export const ownProgramRuleKey = (r, namespaceVersion = null) => [r.agreementCode, ownPayrollRuleIdentity(r, namespaceVersion === OWN_PAYROLL_NAMESPACE_VERSION), r.validFrom, r.liquidationTypes.join(',')].join(':');
export const ownProgramNamespaced = p => p?.namespaceVersion === OWN_PAYROLL_NAMESPACE_VERSION;
export const ownProgramFields = p => [...(ownProgramNamespaced(p) ? ['namespaceVersion'] : []), 'rules', 'bindings', 'totalsPrecision'];
const bindingKey = b => b.agreementCode + ':' + b.key;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function inputNodes(n) { if (n.op === 'input') return [n]; return ['left', 'right', 'value', 'condition', 'then', 'else'].flatMap(k => n[k] && typeof n[k] === 'object' ? inputNodes(n[k]) : []); }
function coverage(rows, rule, predicate) {
  let cursor = rule.validFrom; const until = rule.validUntil ?? '9999-12';
  for (const row of rows.filter(predicate).sort((a, b) => a.validFrom.localeCompare(b.validFrom))) {
    const end = row.validUntil ?? '9999-12'; if (end < cursor) continue; if (row.validFrom > cursor) return false;
    if (end >= until) return true;
    const [y, m] = end.split('-').map(Number); cursor = String(m === 12 ? y + 1 : y) + '-' + String(m === 12 ? 1 : m + 1).padStart(2, '0');
  }
  return false;
}
export function ownProgramStructure(raw) {
  require(salaryExact(raw, ownProgramFields(raw)), 'PROGRAM_INVALID', 'El programa debe declarar reglas, entradas, precisión y, cuando corresponda, referencias separadas de auxiliares.');
  const namespaced = ownProgramNamespaced(raw), rules = validateOwnPayrollRulePeriods(raw.rules, { namespaced });
  require(Number.isInteger(raw.totalsPrecision) && raw.totalsPrecision >= 0 && raw.totalsPrecision <= 8 && Array.isArray(raw.bindings) && raw.bindings.length <= 1000, 'PROGRAM_INVALID', 'Revisá la precisión de totales y las entradas del programa.');
  const bindings = raw.bindings.map(b => {
    const fields = ['agreementCode', 'key', 'unit', 'sourceKind', 'sourceCode', 'onMissing', 'combine', 'ruleReference'];
    if (b?.sourceKind === 'scale_reference') fields.push('sourceAgreementCode', 'sourceCategoryCode');
    require(salaryExact(b, fields) && code(b.agreementCode) && typeof b.key === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(b.key) && ['money', 'hours', 'minutes', 'percent', 'units', 'coefficient'].includes(b.unit) && [...(namespaced ? ['auxiliary_parameter'] : []), 'parameter', 'scale', 'scale_reference', 'monthly_quantity', 'monthly_amount', 'fixed_quantity', 'fixed_amount'].includes(b.sourceKind) && code(b.sourceCode) && ['error', 'zero'].includes(b.onMissing) && ['single', 'sum'].includes(b.combine) && text(b.ruleReference, 3, 180) && (b.sourceKind !== 'scale_reference' || code(b.sourceAgreementCode) && code(b.sourceCategoryCode)), 'BINDING_INVALID', 'Cada entrada necesita origen, unidad, combinación, tratamiento de ausencia y respaldo explícitos. La escala de referencia necesita su convenio y clase.');
    require(!['parameter', 'auxiliary_parameter', 'scale', 'scale_reference'].includes(b.sourceKind) || b.combine === 'single' && b.onMissing === 'error', 'BINDING_INVALID', 'Un parámetro o escala debe ser único e informado; no se suma ni se supone cero.');
    require(!['scale', 'scale_reference', 'monthly_amount', 'fixed_amount'].includes(b.sourceKind) || b.unit === 'money', 'BINDING_INVALID', 'Los importes y escalas se expresan en dinero.'); return { ...b };
  }).sort((a, b) => order(a.agreementCode, b.agreementCode) || order(a.key, b.key));
  require(new Set(bindings.map(bindingKey)).size === bindings.length, 'BINDING_DUPLICATE', 'Hay entradas repetidas en un convenio.');
  return { ...(namespaced ? { namespaceVersion: OWN_PAYROLL_NAMESPACE_VERSION } : {}), rules, bindings, totalsPrecision: raw.totalsPrecision };
}
export function ownProgramDefinition(raw, catalogItems) {
  const program = ownProgramStructure(raw), { rules, bindings } = program, namespaced = ownProgramNamespaced(program), catalog = salaryItems(catalogItems);
  const byBinding = new Map(bindings.map(b => [bindingKey(b), b])), used = new Set();
  for (const r of rules) {
    require(coverage(catalog, r, d => d.active && d.kind === (namespaced && r.nature === 'auxiliary' ? 'auxiliary' : 'concept') && d.agreementCode === r.agreementCode && d.code === r.code && d.nature === r.nature && (r.nature !== 'auxiliary' || d.unit === r.unit)), 'DEFINITION_MISSING', 'Una regla no tiene definición aprobada compatible durante toda su vigencia. Conceptos y auxiliares nuevos se revisan por separado.');
    for (const n of inputNodes(r.expression)) {
      const id = r.agreementCode + ':' + n.key, b = byBinding.get(id); used.add(id);
      require(b && b.unit === n.unit, 'BINDING_MISSING', 'Falta una entrada con unidad compatible para la regla.');
      require(coverage(catalog, r, d => d.active && d.agreementCode === (b.sourceKind === 'scale_reference' ? b.sourceAgreementCode : b.agreementCode) && d.code === b.sourceCode && d.kind === (['scale', 'scale_reference'].includes(b.sourceKind) ? 'scale' : b.sourceKind === 'auxiliary_parameter' ? 'auxiliary' : 'concept') && (!namespaced || d.kind !== 'concept' || d.nature !== 'auxiliary') && (b.sourceKind !== 'scale_reference' || d.categoryCode === b.sourceCategoryCode) && (['monthly_amount', 'fixed_amount', 'scale', 'scale_reference'].includes(b.sourceKind) || d.unit === b.unit) && (!['parameter', 'auxiliary_parameter'].includes(b.sourceKind) || d.value !== null)), 'SOURCE_DEFINITION_MISSING', 'La fuente declarada no cubre toda la vigencia o tiene un valor ausente.');
    }
  }
  require(bindings.every(b => used.has(bindingKey(b))), 'BINDING_UNUSED', 'Hay una entrada sin uso que debe revisarse, no descartarse.');
  return program;
}
export function ownProgramHistory(before, after) {
  if (!before) return;
  require(!ownProgramNamespaced(before) || ownProgramNamespaced(after), 'PROGRAM_HISTORY_REQUIRED', 'Un programa con auxiliares separados no puede volver a referencias ambiguas.');
  const version = after.namespaceVersion, keys = new Set(after.rules.map(r => ownProgramRuleKey(r, version)));
  require(before.rules.every(r => keys.has(ownProgramRuleKey(r, version))), 'PROGRAM_HISTORY_REQUIRED', 'Conservá las reglas anteriores; cerrá su vigencia en lugar de retirarlas.');
}
export function ownProgramCommand(raw, catalogItems = null) {
  require(salaryExact(raw, ['command', 'scopeVersion', 'baseVersion', 'salaryVersion', 'proposalId', 'proposalSha256', 'program', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(raw.command) && [raw.scopeVersion, raw.baseVersion, raw.salaryVersion].every(salaryHash) && text(raw.reason, 10, 1000) && typeof raw.reviewConfirmed === 'boolean', 'PROGRAM_INVALID', 'Revisá operación, versiones y fundamento del programa.');
  if (raw.command === 'propose') {
    require(raw.proposalId === null && raw.proposalSha256 === null && raw.reviewConfirmed === false && raw.program !== null, 'PROGRAM_INVALID', 'Preparar no equivale a aprobar.');
    // Structural checks precede the authoritative catalog read. Linking happens
    // again against the exact approved catalog returned by the SQL facade.
    const program = catalogItems ? ownProgramDefinition(raw.program, catalogItems) : ownProgramStructure(raw.program);
    require(salaryExact(program, ownProgramFields(program)), 'PROGRAM_INVALID', 'El programa tiene campos omitidos o no admitidos.'); return { ...raw, program };
  }
  require(salaryUuid(raw.proposalId) && salaryHash(raw.proposalSha256) && raw.program === null && raw.reviewConfirmed === true, 'PROGRAM_INVALID', 'Revisá la propuesta completa y confirmá la decisión.'); return { ...raw };
}
export function ownProgramBootstrap(v) {
  require(salaryExact(v, ['version', 'scopeVersion', 'salaryCatalog', 'program', 'proposals', 'permissions', 'payrollCalculated', 'payrollPosted']) && v.version === OWN_PROGRAM_VERSION && salaryHash(v.scopeVersion) && v.payrollCalculated === false && v.payrollPosted === false && salaryHash(v.salaryCatalog?.version) && Number.isInteger(v.salaryCatalog?.revision) && v.salaryCatalog.revision >= 0 && Array.isArray(v.proposals) && v.proposals.length <= 1000 && typeof v.permissions?.canPropose === 'boolean' && typeof v.permissions?.canReview === 'boolean', 'PROGRAM_CONTRACT_INVALID', 'No se pudo verificar el programa y su ámbito.');
  require(salaryExact(v.salaryCatalog, ['version', 'revision', 'items']) && v.salaryCatalog.revision <= 1000 && salaryExact(v.permissions, ['canPropose', 'canReview']), 'PROGRAM_CONTRACT_INVALID', 'El catálogo o los permisos contienen campos no admitidos.');
  salaryItems(v.salaryCatalog.items, { allowEmpty: true });
  const p = v.program;
  require(salaryExact(p, ['version', 'revision', 'definition', 'salaryVersion', 'proposalId', 'approvalId']) && salaryHash(p.version) && Number.isInteger(p.revision) && p.revision >= 0 && p.revision <= 1000 && (p.revision === 0 ? p.definition === null && p.salaryVersion === null && p.proposalId === null && p.approvalId === null : salaryHash(p.salaryVersion) && salaryUuid(p.proposalId) && salaryUuid(p.approvalId) && p.definition !== null), 'PROGRAM_CONTRACT_INVALID', 'No se pudo verificar la aprobación del programa.');
  if (p.definition) ownProgramStructure(p.definition);
  for (const proposal of v.proposals) {
    require(salaryExact(proposal, ['id', 'requestSha256', 'baseVersion', 'salaryVersion', 'salaryItems', 'baseDefinition', 'definition', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && salaryUuid(proposal.id) && [proposal.requestSha256, proposal.baseVersion, proposal.salaryVersion].every(salaryHash) && text(proposal.reason, 10, 1000) && text(proposal.authorLabel, 1, 160) && typeof proposal.createdAt === 'string' && typeof proposal.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(proposal.status), 'PROGRAM_CONTRACT_INVALID', 'No se pudo verificar una propuesta.');
    ownProgramDefinition(proposal.definition, proposal.salaryItems); ownProgramHistory(proposal.baseDefinition, proposal.definition);
    require(proposal.status === 'pending' ? proposal.decision === null : salaryExact(proposal.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && proposal.decision.command === (proposal.status === 'approved' ? 'approve' : 'reject') && text(proposal.decision.reason, 10, 1000) && text(proposal.decision.actorLabel, 1, 160) && typeof proposal.decision.recordedAt === 'string' && Number.isInteger(proposal.decision.revision) && proposal.decision.revision >= 0, 'PROGRAM_CONTRACT_INVALID', 'La decisión no coincide con la propuesta.');
  }
  return v;
}
export function ownProgramReceipt(r, attempt = null) {
  require(salaryExact(r, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'programVersion', 'replayed', 'payrollCalculated', 'payrollPosted']) && r.version === OWN_PROGRAM_VERSION && [r.eventId, r.proposalId].every(salaryUuid) && salaryKey(r.requestKey) && [r.requestSha256, r.programVersion].every(salaryHash) && Number.isInteger(r.revision) && r.revision >= 0 && typeof r.replayed === 'boolean' && r.payrollCalculated === false && r.payrollPosted === false, 'PROGRAM_CONTRACT_INVALID', 'No se pudo verificar el comprobante del programa.');
  ownProgramCommand(r.body); require(r.status === ({ propose: 'pending', approve: 'approved', reject: 'rejected' })[r.body.command] && (r.body.command === 'propose' ? r.proposalId === r.eventId && r.programVersion === r.body.baseVersion : r.proposalId === r.body.proposalId && (r.body.command !== 'approve' || r.revision > 0 && r.programVersion !== r.body.baseVersion)), 'PROGRAM_CONTRACT_INVALID', 'El comprobante no corresponde a la operación.');
  if (attempt) require(r.requestKey === attempt.key && salarySerialized(r.body) === salarySerialized(attempt.body), 'PROGRAM_CONTRACT_INVALID', 'El comprobante cambió el cuerpo o la clave originales.'); return r;
}
