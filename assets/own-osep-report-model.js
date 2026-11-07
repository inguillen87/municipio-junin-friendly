// Preparation adapter only: verified native closures -> the reviewed OSEP 206 writer.
// No API, database write, payroll evaluation, permission change or official submission.
import { salaryExact, salaryHash, salaryUuid, salarySerialized } from './native-salary-catalog-model.js';
import { OWN_ART_MAX_BYTES, ownArtParams, verifiedOwnArtSource } from './own-art-report-model.js';
import { ownClosedJurisdiction } from './own-payroll-jurisdiction-model.js';
import { decimal, quantize } from './own-payroll-exact.js';
import {
  PAYROLL_OSEP_206_FIELDS, PAYROLL_OSEP_206_BASE_PROFILE,
  PAYROLL_OSEP_206_TERMINAL_PROFILE, renderPayrollOsep206,
} from './payroll-osep-206-generator.js';

export const OWN_OSEP_MAPPING_VERSION = 'own-osep-closed-mapping.v1';
export const OWN_OSEP_REPORT_VERSION = 'own-osep-closed-review.v1';
export const OWN_OSEP_DECLARATIONS_VERSION = 'own-osep-identity-declarations.v1';
const trustedReports = new WeakSet();
const MAX_CENTS = 9999999999n;
const AMOUNT_FIELDS = Object.freeze([
  'employerContributionCents', 'subjectSalaryCents', 'netPayCents', 'quotaCents',
  'voluntaryPureCents', 'voluntaryStudentCents', 'catastrophicCents',
  'catastrophicIndirectCents', 'catastrophicVoluntaryCents', 'catastrophicStudentCents',
  'currentAccountCents', 'disabilityDirectCents',
]);
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const term = (code, nature) => ({ kind: 'concept', code, namespace: nature === 'auxiliary' ? 'auxiliary' : 'concept', nature });
const field = (fieldId, nature, ...codes) => ({ fieldId, terms: codes.map(code => term(code, nature)) });

// These are historical code aliases, not approved native salary rules or rates.
export const OWN_OSEP_GRH_MAPPING_DRAFT = freeze({
  version: OWN_OSEP_MAPPING_VERSION, id: 'junin-grh-osep-206-draft', revision: 1,
  activation: 'PREPARATION_ONLY', institutionalValidation: 'pending', officialSubmissionAllowed: false,
  profileId: PAYROLL_OSEP_206_BASE_PROFILE,
  populationPolicy: 'complete_closed_snapshots', jurisdictionPolicy: 'explicit_single_jurisdiction',
  participationPolicy: 'one_closed_participation_per_contract',
  documentTypePolicy: 'source_bound_explicit_declaration', bankruptDefault: false,
  amountPolicy: 'explicit_exact_cents_no_rounding',
  fields: [
    field('employerContributionCents', 'employer_contribution', '701'),
    field('subjectSalaryCents', 'auxiliary', '993', '994'),
    field('netPayCents', 'auxiliary', '998'),
    field('quotaCents', 'deduction', '601'),
    field('voluntaryPureCents', 'deduction', '602', '608'),
    field('voluntaryStudentCents', 'deduction', '603'),
    field('catastrophicCents', 'deduction', '604'),
    field('catastrophicIndirectCents', 'deduction', '682'),
    field('catastrophicVoluntaryCents', 'deduction', '683'),
    field('catastrophicStudentCents', 'deduction', '684'),
    field('currentAccountCents', 'deduction', '605'),
    field('disabilityDirectCents', 'deduction', '685'),
  ],
});

export class OwnOsepReportError extends Error {
  constructor(code, message) { super(message); this.name = 'OwnOsepReportError'; this.code = code; }
}
const need = (condition, code, message) => { if (!condition) throw new OwnOsepReportError(code, message); };
const dense = (value, max) => Array.isArray(value) && value.length <= max && Reflect.ownKeys(value).length === value.length + 1;
const issue = (code, message, fieldId = null) => ({ code, message, fieldId });
const text = (value, max = 180) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(value))))].map(b => b.toString(16).padStart(2, '0')).join('');

function copyJson(value, maxBytes) {
  let raw;
  try {
    raw = JSON.stringify(value, (_key, current) => {
      if (current === undefined || ['function', 'symbol', 'bigint'].includes(typeof current) || typeof current === 'number' && !Number.isFinite(current)) throw Error('not JSON');
      return current;
    });
  } catch { throw new OwnOsepReportError('OWN_OSEP_JSON_INVALID', 'Se requieren datos JSON completos.'); }
  need(typeof raw === 'string', 'OWN_OSEP_JSON_INVALID', 'Se requieren datos JSON completos.');
  need(new TextEncoder().encode(raw).length <= maxBytes, 'OWN_OSEP_LIMIT', 'El conjunto completo supera la capacidad; no se recortaron filas.');
  return JSON.parse(raw);
}

export function ownOsepMapping(value) {
  const m = copyJson(value, 32768);
  need(salaryExact(m, Object.keys(OWN_OSEP_GRH_MAPPING_DRAFT)) && m.version === OWN_OSEP_MAPPING_VERSION && text(m.id, 80) && Number.isSafeInteger(m.revision) && m.revision > 0,
    'OWN_OSEP_MAPPING_INVALID', 'El contrato de mapeo no es válido.');
  for (const key of ['activation', 'institutionalValidation', 'officialSubmissionAllowed', 'populationPolicy', 'jurisdictionPolicy', 'participationPolicy', 'documentTypePolicy', 'bankruptDefault', 'amountPolicy']) {
    need(m[key] === OWN_OSEP_GRH_MAPPING_DRAFT[key], 'OWN_OSEP_MAPPING_POLICY', 'El borrador no puede habilitar presentación ni cambiar sus políticas de integridad.');
  }
  need([PAYROLL_OSEP_206_BASE_PROFILE, PAYROLL_OSEP_206_TERMINAL_PROFILE].includes(m.profileId), 'OWN_OSEP_PROFILE_INVALID', 'Elegí un perfil OSEP 206 documentado.');
  need(dense(m.fields, AMOUNT_FIELDS.length) && m.fields.length === AMOUNT_FIELDS.length && new Set(m.fields.map(f => f?.fieldId)).size === AMOUNT_FIELDS.length,
    'OWN_OSEP_MAPPING_FIELDS', 'El contrato debe declarar exactamente los doce importes.');
  for (const f of m.fields) {
    need(salaryExact(f, ['fieldId', 'terms']) && AMOUNT_FIELDS.includes(f.fieldId), 'OWN_OSEP_MAPPING_FIELDS', 'Hay campos de importe desconocidos.');
    // null means unresolved. An empty list must never silently become zero.
    if (f.terms === null) continue;
    need(dense(f.terms, 8) && f.terms.length > 0, 'OWN_OSEP_MAPPING_TERMS', 'Cada importe requiere fuentes explícitas o un mapeo pendiente.');
    const keys = new Set();
    for (const t of f.terms) {
      let key;
      if (t?.kind === 'closed_total') {
        need(salaryExact(t, ['kind', 'key']) && t.key === 'net' && f.fieldId === 'netPayCents' && f.terms.length === 1,
          'OWN_OSEP_MAPPING_TERM', 'Sólo el neto puede mapearse al total neto histórico del cierre.');
        key = 'closed_total:net';
      } else {
        need(salaryExact(t, ['kind', 'code', 'namespace', 'nature']) && t.kind === 'concept' && typeof t.code === 'string' && /^[1-9][0-9]{0,8}$/.test(t.code) && ['concept', 'auxiliary'].includes(t.namespace) && ['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'auxiliary'].includes(t.nature) && (t.namespace === 'auxiliary') === (t.nature === 'auxiliary'),
          'OWN_OSEP_MAPPING_TERM', 'Cada fuente requiere código, espacio de nombres y naturaleza explícitos.');
        key = t.namespace + ':' + t.code;
      }
      need(!keys.has(key), 'OWN_OSEP_MAPPING_DUPLICATE', 'Un importe no puede sumar dos veces la misma fuente.'); keys.add(key);
    }
  }
  return freeze(m);
}

function reviewedRenderer() {
  const fields = PAYROLL_OSEP_206_FIELDS;
  need(fields.length === 20 && AMOUNT_FIELDS.every(id => fields.some(f => f.fieldId === id && f.kind === 'cents')) && fields.some(f => f.fieldId === 'documentTypeCode' && f.start === 14 && f.end === 14) && fields.some(f => f.fieldId === 'legajo' && f.start === 23 && f.end === 34) && fields.some(f => f.fieldId === 'catastrophicVoluntaryCents' && f.start === 165 && f.end === 174) && fields.some(f => f.fieldId === 'catastrophicStudentCents' && f.start === 175 && f.end === 184),
    'OWN_OSEP_RENDERER_UNSUPPORTED', 'Se requiere el generador OSEP revisado con doce importes, tipo de documento y legajo completo.');
}

function declarations(value, source) {
  if (value === null) return new Map();
  need(salaryExact(value, ['version', 'scopeVersion', 'sourceVersion', 'period', 'rows']) && value.version === OWN_OSEP_DECLARATIONS_VERSION && [value.scopeVersion, value.sourceVersion].every(salaryHash) && value.scopeVersion === source.scopeVersion && value.sourceVersion === source.sourceVersion && value.period === source.content.params.period && dense(value.rows, 10000),
    'OWN_OSEP_DECLARATION_SCOPE', 'Las declaraciones documentales deben corresponder a esta fuente, ámbito y período.');
  const people = new Map(source.content.people.map(p => [p.contractId, p])), result = new Map();
  for (const row of value.rows) {
    const p = people.get(row?.contractId);
    need(salaryExact(row, ['contractId', 'personId', 'registrationId', 'identityToken', 'documentTypeCode', 'bankrupt', 'reference']) && p && [row.contractId, row.personId, row.registrationId].every(salaryUuid) && row.personId === p.personId && row.registrationId === p.registrationId && row.identityToken === p.identityToken && salaryHash(row.identityToken) && !result.has(row.contractId) && (row.documentTypeCode === null || typeof row.documentTypeCode === 'string' && /^[1-6]$/.test(row.documentTypeCode)) && (row.bankrupt === null || typeof row.bankrupt === 'boolean') && text(row.reference),
      'OWN_OSEP_DECLARATION_INVALID', 'Una declaración falta, se repite o no corresponde a la identidad verificada.');
    result.set(row.contractId, row);
  }
  return result;
}

function cents(amount) {
  need(typeof amount === 'string', 'OWN_OSEP_AMOUNT_INVALID', 'El importe debe venir como decimal textual de la fuente cerrada.');
  const result = quantize(decimal(amount), { precision: 2, mode: 'exact' }).amount;
  need(!result.startsWith('-'), 'OWN_OSEP_AMOUNT_NEGATIVE', 'OSEP 206 no admite un importe negativo en este campo.');
  const value = BigInt(result.replace('.', ''));
  need(value <= MAX_CENTS, 'OWN_OSEP_AMOUNT_OVERFLOW', 'El importe excede los diez dígitos del campo; no se trunca.');
  return value;
}

function amountFor(f, participation, issues) {
  if (f.terms === null) { issues.push(issue('MAPPING_UNRESOLVED', 'Falta definir el mapeo de este importe.', f.fieldId)); return null; }
  let sum = 0n, complete = true;
  for (const t of f.terms) {
    let amount;
    if (t.kind === 'closed_total') amount = participation.employee.totals.net;
    else {
      const rows = participation.concepts.filter(r => r.conceptCode === t.code && (r.nature === 'auxiliary' ? 'auxiliary' : 'concept') === t.namespace);
      if (rows.length !== 1) { issues.push(issue('AMOUNT_SOURCE_MISSING', 'Falta una fuente monetaria única para ' + t.namespace + ':' + t.code + '; no se supone cero.', f.fieldId)); complete = false; continue; }
      if (rows[0].nature !== t.nature || rows[0].unit !== 'money') { issues.push(issue('AMOUNT_SOURCE_KIND', 'La naturaleza o unidad de ' + t.namespace + ':' + t.code + ' no coincide con el contrato.', f.fieldId)); complete = false; continue; }
      amount = rows[0].amount;
    }
    try { sum += cents(amount); }
    catch { issues.push(issue('AMOUNT_NOT_EXACT_CENTS', 'La fuente requiere centavos exactos, no negativos y dentro del ancho; no se redondea.', f.fieldId)); complete = false; }
  }
  if (!complete) return null;
  if (sum > MAX_CENTS) { issues.push(issue('AMOUNT_FIELD_OVERFLOW', 'La suma excede el ancho del campo; no se trunca.', f.fieldId)); return null; }
  return sum.toString();
}

// This routine clones its inputs before the first await. A changed caller object
// cannot replace data while the asynchronous source/snapshot hashes are checked.
export async function prepareOwnOsepReport(rawSource, options) {
  reviewedRenderer();
  const source = copyJson(rawSource, OWN_ART_MAX_BYTES), opts = copyJson(options, 4 * 1024 * 1024);
  need(salaryExact(opts, ['scope', 'mapping', 'identityDeclarations']) && salaryExact(opts.scope, ['period', 'types', 'jurisdictionCode']) && [null, '42', '55'].includes(opts.scope.jurisdictionCode),
    'OWN_OSEP_SCOPE_INVALID', 'Elegí período, tipos y una jurisdicción documentada.');
  const query = ownArtParams({ period: opts.scope.period, types: opts.scope.types }), mapping = ownOsepMapping(opts.mapping);
  await verifiedOwnArtSource(source);
  need(salarySerialized(ownArtParams(source.content.params)) === salarySerialized(query), 'OWN_OSEP_SCOPE_MISMATCH', 'La fuente no corresponde al período y tipos solicitados.');
  const declared = declarations(opts.identityDeclarations, source), c = source.content, people = new Map(c.people.map(p => [p.contractId, p]));
  const globalIssues = [], participations = [];
  for (const group of c.groups) for (const employee of group.snapshot.employees) participations.push({
    group, employee, person: people.get(employee.contractId),
    jurisdiction: ownClosedJurisdiction(employee, group.snapshot.version),
    concepts: group.snapshot.concepts.filter(r => r.contractId === employee.contractId),
  });
  const classificationComplete = participations.every(p => p.jurisdiction.code !== null), allClosedPopulationsComplete = c.groups.every(g => g.snapshot.populationComplete === true);
  if (!classificationComplete) globalIssues.push(issue('JURISDICTION_UNRESOLVED', 'Hay jurisdicciones sin capturar; no se puede garantizar un archivo completo de 42 o 55.'));
  if (opts.scope.jurisdictionCode === null) globalIssues.push(issue('JURISDICTION_REQUIRED', 'Falta elegir explícitamente la jurisdicción del archivo.'));
  if (!allClosedPopulationsComplete) globalIssues.push(issue('CLOSED_POPULATION_INCOMPLETE', 'Hay cierres de población parcial. Este borrador requiere su conciliación completa antes de generar OSEP.'));
  const scopeResolved = classificationComplete && opts.scope.jurisdictionCode !== null;
  // Until classification is complete, keep the whole source visible and blocked.
  const selected = scopeResolved ? participations.filter(p => p.jurisdiction.code === opts.scope.jurisdictionCode) : participations;
  const grouped = new Map();
  for (const p of selected) { const prior = grouped.get(p.employee.contractId) ?? []; prior.push(p); grouped.set(p.employee.contractId, prior); }
  const rows = [];
  for (const parts of grouped.values()) {
    const p = parts[0].person, declaration = declared.get(p.contractId), issues = [];
    const values = { period: query.period.replace('-', ''), documentTypeCode: declaration?.documentTypeCode ?? null, dni: p.dni, legajo: p.employeeNumber, fullName: p.name, bankrupt: declaration?.bankrupt ?? mapping.bankruptDefault };
    if (values.documentTypeCode === null) issues.push(issue('DOCUMENT_TYPE_UNRESOLVED', 'La fuente no declara el tipo de documento OSEP. Completá su declaración vinculada a esta identidad.'));
    if (parts.length !== 1) issues.push(issue('MULTIPLE_PARTICIPATIONS_UNRESOLVED', 'Hay varias liquidaciones del mismo contrato. No se suman ni se elige una automáticamente.'));
    for (const f of mapping.fields) values[f.fieldId] = parts.length === 1 ? amountFor(f, parts[0], issues) : null;
    if (values.netPayCents !== null) {
      let matches = false; try { matches = values.netPayCents === cents(parts[0].employee.totals.net).toString(); } catch { /* unresolved canonical net */ }
      if (!matches) {
        issues.push(issue('NET_RECONCILIATION_MISMATCH', 'El neto mapeado no coincide con el neto histórico guardado en el cierre.', 'netPayCents'));
        values.netPayCents = null;
      }
    }
    if (values.documentTypeCode !== null && AMOUNT_FIELDS.every(id => values[id] !== null)) {
      try { renderPayrollOsep206([values], { profileId: PAYROLL_OSEP_206_BASE_PROFILE }); }
      catch (e) { issues.push(issue('RENDERER_ROW_INVALID', 'La identidad o el ancho físico de la fila no cumple OSEP 206: ' + (e.code ?? 'formato inválido') + '.')); }
    }
    rows.push({ contractId: p.contractId, personId: p.personId, registrationId: p.registrationId, identityToken: p.identityToken,
      values, bankruptBasis: declaration?.bankrupt == null ? 'mapping_default_no' : 'explicit_declaration',
      declarationReference: declaration?.reference ?? null,
      sources: parts.map(x => ({ closeId: x.group.id, snapshotSha256: x.group.snapshotSha256, type: x.group.snapshot.liquidationType, contractId: x.employee.contractId, runId: x.employee.runId, liquidationVersion: x.employee.liquidationVersion })).sort((a, b) => a.closeId.localeCompare(b.closeId)), issues });
  }
  // Collision checks flag every affected row; there is no automatic identity merge.
  for (const [key, code, message] of [
    [r => /^\d+$/.test(r.values.legajo) ? BigInt(r.values.legajo).toString() : null, 'LEGAJO_DUPLICATE', 'Más de un contrato usa el mismo legajo del archivo.'],
    [r => r.personId, 'PERSON_MULTIPLE_CONTRACTS', 'La misma persona tiene varios contratos. Hace falta una decisión explícita de población.'],
    [r => r.values.documentTypeCode !== null && typeof r.values.dni === 'string' && /^\d+$/.test(r.values.dni) ? r.values.documentTypeCode + ':' + BigInt(r.values.dni) : null, 'DOCUMENT_DUPLICATE', 'El mismo documento aparece en contratos distintos. No se unifican ni se omiten filas.'],
  ]) {
    const groups = new Map(); for (const row of rows) { const value = key(row); if (value === null) continue; const list = groups.get(value) ?? []; list.push(row); groups.set(value, list); }
    for (const list of groups.values()) if (list.length > 1) for (const row of list) row.issues.push(issue(code, message));
  }
  rows.sort((a, b) => {
    const numeric = value => typeof value === 'string' && /^\d+$/.test(value);
    if (numeric(a.values.legajo) && numeric(b.values.legajo)) {
      const left = BigInt(a.values.legajo), right = BigInt(b.values.legajo);
      if (left !== right) return left < right ? -1 : 1;
    }
    return a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0;
  });
  const totalsCents = Object.fromEntries(AMOUNT_FIELDS.map(id => [id, rows.every(r => r.values[id] !== null) ? rows.reduce((sum, r) => sum + BigInt(r.values[id]), 0n).toString() : null]));
  const issueCount = globalIssues.length + rows.reduce((sum, row) => sum + row.issues.length, 0);
  const report = freeze({ version: OWN_OSEP_REPORT_VERSION, activation: 'PREPARATION_ONLY', institutionalValidation: 'pending', officialSubmissionAllowed: false, canExport: false,
    scope: { ...query, jurisdictionCode: opts.scope.jurisdictionCode }, scopeVersion: source.scopeVersion, sourceVersion: source.sourceVersion,
    mappingId: mapping.id, mappingRevision: mapping.revision, mappingSha256: await hash(mapping), identityDeclarationsSha256: await hash(opts.identityDeclarations),
    profileId: mapping.profileId, sourceRecordCount: c.sourceRecordCount, sourceContractCount: c.people.length, sourceGroupCount: c.groups.length,
    scopeResolved, classificationComplete, allClosedPopulationsComplete,
    selectedParticipationCount: selected.length, excludedByDeclaredJurisdictionCount: scopeResolved ? participations.length - selected.length : null,
    total: rows.length, rows, globalIssues, issueCount, totalsCents,
    canRenderReview: rows.length > 0 && issueCount === 0,
    coverage: 'complete_current_closed_snapshots_only_not_certification_of_municipal_payroll',
  });
  trustedReports.add(report); return report;
}

export function renderOwnOsepReview(report) {
  need(trustedReports.has(report), 'OWN_OSEP_REPORT_UNTRUSTED', 'Volvé a verificar la fuente completa y el contrato de mapeo.');
  need(report.canRenderReview, 'OWN_OSEP_REVIEW_BLOCKED', 'Hay datos pendientes o ninguna fila del alcance; no se genera un archivo parcial.');
  const result = renderPayrollOsep206(report.rows.map(row => row.values), { profileId: report.profileId });
  need(salarySerialized(result.totalsCents) === salarySerialized(report.totalsCents), 'OWN_OSEP_TOTALS_MISMATCH', 'Los controles del archivo no coinciden con la previa completa.');
  return Object.freeze({ ...result, reviewVersion: OWN_OSEP_REPORT_VERSION,
    sourceVersion: report.sourceVersion, scopeVersion: report.scopeVersion, mappingSha256: report.mappingSha256,
    identityDeclarationsSha256: report.identityDeclarationsSha256, scope: report.scope,
    activation: 'PREPARATION_ONLY', officialSubmissionAllowed: false, canExport: false,
  });
}
