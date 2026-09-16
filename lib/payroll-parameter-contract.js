// Shared by the administrative form and server. These are documented auxiliary
// definitions, not a catalogue of salary formulas or a declaration of validity.
export const PARAMETER_CONTRACT = 'payroll-parameter-proposal-governed.v1';
export const PARAMETER_SOURCE_SHA = 'fcb490b08bd83cdd1aa392a0c99a20f01637107ff0ef4bfdb67c083de1802169';
export const PARAMETER_RULES = Object.freeze([
  { id: 'aux88-class6d', label: 'Trabajo riesgoso · base clase 6-D', auxiliary: 88, baseClass: '6-D', agreements: [1, 4, 6], numerator: 1, denominator: 1, concept: 24 },
  { id: 'aux90-class3a', label: 'Sueldo de referencia · clase 3-A', auxiliary: 90, baseClass: '3-A', agreements: [1, 4, 6], numerator: 1, denominator: 1, concept: null },
  { id: 'aux88-class13i-150', label: 'Autoridades · clase 13-I × 1,50', auxiliary: 88, baseClass: '13-I', agreements: [2, 7, 11], numerator: 3, denominator: 2, concept: null },
].map(rule => Object.freeze({ ...rule, agreements: Object.freeze(rule.agreements) })));
export const AGREEMENT_LABELS = Object.freeze({ 1: 'Permanentes', 2: 'Funcionarios', 4: 'Temporarios', 6: 'Interinos', 7: 'Concejales', 11: 'Secretarios HCD' });
export const PARAMETER_STATUSES = Object.freeze({ prepared: 'Borrador guardado', submitted: 'En revisión', approved: 'Propuesta aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' });
export const PARAMETER_COMMANDS = Object.freeze({ submit: 'Enviar a revisión', approve: 'Aprobar propuesta', reject: 'Rechazar propuesta', cancel: 'Cancelar propuesta' });
export const PARAMETER_REASONS = Object.freeze({ submit: ['ready_for_review'], approve: ['approved_by_checker'], reject: ['source_mismatch', 'evidence_insufficient', 'period_not_ready'], cancel: ['cancelled_by_preparer'] });
export const PARAMETER_REASON_LABELS = Object.freeze({ source_mismatch: 'No coincide con la escala', evidence_insufficient: 'Falta documentación', period_not_ready: 'La vigencia no corresponde' });
const MAX = 99999999999n;
export class ParameterInputError extends Error {
  constructor(message) { super(message); this.name = 'ParameterInputError'; this.code = 'PAYROLL_PARAMETER_DRAFT_INVALID'; this.status = 422; }
}
function valid(check, message) { if (!check) throw new ParameterInputError(message); }
export function parameterRule(id) { return PARAMETER_RULES.find(rule => rule.id === id); }
export function parseParameterMoney(value) {
  let s = String(value ?? '').trim();
  // Argentine grouping is accepted; fractional input must have at most 2 digits.
  valid(/^(?:[0-9]+(?:[.,][0-9]{1,2})?|[1-9][0-9]{0,2}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?)$/.test(s), 'Ingresá un importe positivo con hasta dos decimales, por ejemplo 125000,50.');
  if (s.includes(',') || /^[1-9][0-9]{0,2}(?:\.[0-9]{3})+$/.test(s)) s = s.replaceAll('.', '').replace(',', '.');
  const [whole, fraction = ''] = s.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  valid(cents > 0n && cents <= MAX, 'El importe debe ser mayor a cero y no superar $ 999.999.999,99.');
  return cents.toString();
}
export function parameterMoney(value) {
  valid(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'Importe no disponible.');
  const n = BigInt(value), whole = (n / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$ ' + whole + ',' + (n % 100n).toString().padStart(2, '0');
}
export function validateParameterDraft(input) {
  const keys = ['agreementIds', 'baseAmountCents', 'rounding', 'ruleId', 'sourceReference', 'validFrom'];
  valid(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join('|') === keys.join('|'), 'El formulario contiene campos no admitidos.');
  const rule = parameterRule(input.ruleId);
  valid(Boolean(rule), 'Seleccioná una regla documentada.');
  valid(typeof input.baseAmountCents === 'string' && /^[1-9][0-9]{0,10}$/.test(input.baseAmountCents), 'El importe debe conservar centavos exactos.');
  valid(typeof input.validFrom === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(input.validFrom), 'Indicá el mes desde el que se propone aplicar el cambio.');
  valid(typeof input.sourceReference === 'string' && input.sourceReference.length >= 1 && input.sourceReference.length <= 180 && input.sourceReference === input.sourceReference.trim() && !/[<>\u0000-\u001f\u007f]/.test(input.sourceReference), 'Indicá la resolución o escala que respalda el importe (hasta 180 caracteres).');
  valid(['nearest_cent', 'truncate_cent'].includes(input.rounding), 'Elegí el criterio de redondeo.');
  const ids = input.agreementIds;
  valid(Array.isArray(ids) && ids.length >= 1 && ids.length <= 3 && ids.every((id, index) => Number.isInteger(id) && rule.agreements.includes(id) && (index === 0 || id > ids[index - 1])), 'Seleccioná los convenios admitidos, sin repetirlos.');
  const numerator = BigInt(input.baseAmountCents) * BigInt(rule.numerator), denominator = BigInt(rule.denominator);
  const result = numerator / denominator + (input.rounding === 'nearest_cent' && (numerator % denominator) * 2n >= denominator ? 1n : 0n);
  valid(result > 0n && result <= MAX, 'El valor resultante supera el límite admitido.');
  return Object.freeze({ ...input, agreementIds: Object.freeze([...ids]) });
}
export function parameterPreview(input) {
  const draft = validateParameterDraft(input), rule = parameterRule(draft.ruleId);
  const numerator = BigInt(draft.baseAmountCents) * BigInt(rule.numerator), denominator = BigInt(rule.denominator);
  const result = numerator / denominator + (draft.rounding === 'nearest_cent' && (numerator % denominator) * 2n >= denominator ? 1n : 0n);
  return draft.agreementIds.map(agreementId => ({ agreementId, auxiliaryId: rule.auxiliary, baseClass: rule.baseClass, newValueCents: result.toString(), referenceConceptId: rule.concept }));
}
export function verifiedParameterProposal(proposal) {
  valid(proposal && typeof proposal === 'object' && /^[0-9a-f-]{36}$/i.test(proposal.id) && proposal.contractVersion === PARAMETER_CONTRACT && Number.isSafeInteger(proposal.version) && proposal.version > 0 && Object.hasOwn(PARAMETER_STATUSES, proposal.status), 'La propuesta no coincide con el contrato de datos.');
  const d = proposal.draft;
  valid(d && d.sourceSha256 === PARAMETER_SOURCE_SHA && d.applied === false && d.currentCatalogVerified === false, 'La propuesta informó un alcance no reconocido.');
  const { rows, sourceSha256, applied, currentCatalogVerified, ...input } = d;
  const expected = parameterPreview(input);
  valid(Array.isArray(rows) && rows.length === expected.length && rows.every((row, i) => Object.keys(expected[i]).every(key => row[key] === expected[i][key])), 'Los valores guardados no coinciden con la regla documentada.');
  return proposal;
}
