import { civilDate } from './civil-date.js';

export const SCHOOLING_VERSION = 'family-schooling.v1';
export const MAX_SCHOOLING_ROWS = 5000;
export const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const fail = () => { throw Error('No se pudo verificar el reporte de certificados. Volvé a consultar.'); };
const text = (value, max = 300) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f]/.test(value);
const certificateKeys = ['id', 'filename', 'sha256', 'byteLength', 'presentedOn', 'expiresOn', 'recordedAt', 'recordKind',
  'institution', 'educationLevel', 'course', 'schoolYear', 'issuedOn', 'evidenceMode', 'paperReference', 'reason', 'supersedesId', 'recordedBy'];
const certificateFieldKeys = ['institution', 'educationLevel', 'course', 'schoolYear', 'issuedOn', 'presentedOn', 'expiresOn', 'evidenceMode', 'paperReference', 'reason'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const certificateText = (value, max, min = 1) => typeof value === 'string' && value === value.trim()
  && value.length >= min && value.length <= max && !/[<>\x00-\x1f\x7f]/.test(value);
const metadataText = (value, max, min = 1) => certificateText(value, max, min) && value === value.normalize('NFC');
const generatedUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function day(value, optional = false) {
  if (optional && value === null) return null;
  try { return civilDate(value); } catch { return fail(); }
}
function instant(value, optional = false) {
  if (optional && value === null) return null;
  if (!text(value, 40) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail();
  day(value.slice(0, 10)); return value;
}
export function familyReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'id,kind'
    || !(value.kind === 'grh' ? typeof value.id === 'string' && /^[0-9]{1,20}$/.test(value.id)
      : value.kind === 'own' && typeof value.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.id))) fail();
  return Object.freeze({ kind: value.kind, id: value.id });
}
export const familyReferenceKey = ref => ref.kind + ':' + ref.id;
function certificateDay(value, optional = false) {
  if (optional && value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  return day(value);
}
// A paper declaration, an attached PDF and an approval are different facts.
export function schoolingCertificate(value) {
  if (!exact(value, certificateKeys) || !generatedUuid(value.id)
    || !['legacy_pdf', 'schooling_record'].includes(value.recordKind) || !['pdf', 'paper_declared'].includes(value.evidenceMode)) fail();
  const legacy = value.recordKind === 'legacy_pdf';
  if (value.evidenceMode === 'pdf') {
    if (!certificateText(value.filename, 180, 5) || !/\.pdf$/i.test(value.filename) || /[\\/:*?"|]/.test(value.filename)
      || !hash.test(value.sha256) || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > MAX_CERTIFICATE_BYTES
      || value.paperReference !== null) fail();
  } else if (legacy || value.filename !== null || value.sha256 !== null || value.byteLength !== null || !certificateText(value.paperReference, 500, 5)) fail();
  for (const [key, limit] of [['institution', 180], ['educationLevel', 80], ['course', 100]]) {
    if (value[key] !== null && !metadataText(value[key], limit)) fail();
  }
  if (value.schoolYear !== null && (!Number.isInteger(value.schoolYear) || value.schoolYear < 1900 || value.schoolYear > 2100)) fail();
  if (legacy) {
    if (['institution', 'educationLevel', 'course', 'schoolYear', 'issuedOn', 'paperReference', 'reason', 'supersedesId', 'recordedBy'].some(key => value[key] !== null)) fail();
  } else if (!metadataText(value.reason, 500, 5) || !certificateText(value.recordedBy, 320)
    || !value.recordedBy.includes('@') || value.supersedesId !== null && (!generatedUuid(value.supersedesId) || value.supersedesId.toLowerCase() === value.id.toLowerCase())) fail();
  if (value.paperReference !== null && !metadataText(value.paperReference, 500, 5)) fail();
  return Object.freeze({ ...value, issuedOn: certificateDay(value.issuedOn, true), presentedOn: certificateDay(value.presentedOn),
    expiresOn: certificateDay(value.expiresOn, true), recordedAt: instant(value.recordedAt) });
}
export function certificateEvidenceLabel(certificate) {
  if (!certificate) return 'Sin registro en MuniControl';
  if (certificate.evidenceMode === 'paper_declared') return 'Presentación en papel declarada · sin PDF adjunto';
  if (certificate.recordKind === 'legacy_pdf') return 'PDF registrado · datos escolares anteriores no informados';
  return 'PDF adjunto';
}
export function certificateFields(fields) {
  if (!plain(fields) || Object.keys(fields).some(key => !certificateFieldKeys.includes(key))) throw Error('Revisá los campos del registro escolar.');
  const normalizeText = (key, label, limit, required = false, min = 1) => {
    const raw = fields[key];
    if (raw === undefined || raw === null || raw === '') {
      if (required) throw Error('Ingresá ' + label + '.');
      return null;
    }
    if (typeof raw !== 'string' || /[<>\x00-\x1f\x7f]/.test(raw)) throw Error('Revisá ' + label + ': debe ser texto de una sola línea.');
    const normalized = raw.normalize('NFC').trim();
    if (!normalized && !required) return null;
    if (!certificateText(normalized, limit, min)) throw Error('Revisá ' + label + ': entre ' + min + ' y ' + limit + ' caracteres.');
    return normalized;
  };
  if (!['pdf', 'paper_declared'].includes(fields.evidenceMode)) throw Error('Indicá si adjuntás un PDF o declarás una presentación en papel.');
  const normalized = {
    institution: normalizeText('institution', 'la institución', 180), educationLevel: normalizeText('educationLevel', 'el nivel', 80),
    course: normalizeText('course', 'el curso, grado o sala', 100), schoolYear: null,
  };
  const rawYear = typeof fields.schoolYear === 'string' ? fields.schoolYear.trim() : fields.schoolYear;
  if (rawYear !== null && rawYear !== undefined && rawYear !== '') {
    if (!(typeof rawYear === 'number' && Number.isInteger(rawYear) || typeof rawYear === 'string' && /^\d{4}$/.test(rawYear))
      || Number(rawYear) < 1900 || Number(rawYear) > 2100) throw Error('Ingresá el ciclo lectivo entre 1900 y 2100, o dejalo sin informar.');
    normalized.schoolYear = Number(rawYear);
  }
  for (const [key, label] of [['issuedOn', 'emisión'], ['presentedOn', 'presentación'], ['expiresOn', 'vencimiento']]) {
    const raw = fields[key] === '' || fields[key] === undefined ? null : fields[key];
    try { normalized[key] = certificateDay(raw, key !== 'presentedOn'); }
    catch { throw Error('Revisá la fecha de ' + label + (key === 'presentedOn' ? ': es obligatoria.' : ' o dejala sin informar.')); }
  }
  normalized.evidenceMode = fields.evidenceMode;
  normalized.paperReference = normalizeText('paperReference', 'la referencia de recepción en papel', 500, fields.evidenceMode === 'paper_declared', 5);
  if (fields.evidenceMode === 'pdf' && normalized.paperReference !== null) throw Error('La referencia en papel corresponde sólo a una presentación declarada sin PDF.');
  normalized.reason = normalizeText('reason', 'el motivo del registro o corrección', 500, true, 5);
  return Object.freeze(normalized);
}
export function schoolingHistoryData(payload, { contractId, familyRef, identityToken } = {}) {
  const d = payload?.data;
  const expectedRef = familyReference(familyRef);
  if (!uuid.test(contractId) || !hash.test(identityToken) || payload?.ok !== true
    || !exact(d, ['version', 'contractId', 'familyRef', 'identityToken', 'rows', 'total']) || d.version !== 'family-schooling-history.v3'
    || d.contractId !== contractId || d.identityToken !== identityToken || familyReferenceKey(familyReference(d.familyRef)) !== familyReferenceKey(expectedRef)
    || !Array.isArray(d.rows) || d.rows.length > MAX_SCHOOLING_ROWS || !Number.isSafeInteger(d.total) || d.total !== d.rows.length) fail();
  const rows = d.rows.map(schoolingCertificate), indexes = new Map(rows.map((row, i) => [row.id.toLowerCase(), i]));
  if (indexes.size !== rows.length) fail();
  // PostgreSQL keeps six fractional digits. Millisecond rounding can conceal a
  // reversed history and attach a correction to a record that did not yet exist.
  const micros = value => BigInt(Date.parse(value.replace(/\.\d+(?=Z|[+-])/, ''))) * 1000n
    + BigInt((value.match(/\.(\d+)(?=Z|[+-])/)?.[1] || '').padEnd(6, '0'));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) {
      const previous = rows[i - 1], previousTime = micros(previous.recordedAt), currentTime = micros(row.recordedAt);
      if (previousTime < currentTime || previousTime === currentTime && previous.id.toLowerCase() < row.id.toLowerCase()) fail();
    }
    if (row.supersedesId !== null && (!indexes.has(row.supersedesId.toLowerCase()) || indexes.get(row.supersedesId.toLowerCase()) <= i)) fail();
  }
  return Object.freeze({ version: d.version, contractId, familyRef: expectedRef, identityToken, rows: Object.freeze(rows), total: d.total });
}
export function schoolingRegistrationResult(payload) {
  const d = payload?.data;
  if (payload?.ok !== true || !exact(d, ['version', 'certificateId', 'duplicate']) || d.version !== 'family-schooling-register.v3'
    || !generatedUuid(d.certificateId) || typeof d.duplicate !== 'boolean') throw Error('No se pudo confirmar el registro. Reintentá con los mismos datos para verificarlo.');
  return Object.freeze({ ...d });
}
export function schoolingData(payload, { resource = 'report', contractId, version = 1 } = {}) {
  if (version === 5) {
    const d = payload?.data;
    if (payload?.ok !== true || d?.version !== 'family-schooling.v5' || !Array.isArray(d.rows) || d.rows.length > MAX_SCHOOLING_ROWS) fail();
    const origins = new Map(), contracts = new Map();
    const rows = d.rows.map(r => {
      if (!plain(r) || !['GRH', 'MUNICONTROL'].includes(r.employeeOrigin)) fail();
      const { employeeOrigin, nativeRegistrationId, nativeRegisteredAt, ...base } = r;
      const ref = familyReference(r.familyRef);
      if (employeeOrigin === 'MUNICONTROL') {
        if (!generatedUuid(nativeRegistrationId) || nativeRegisteredAt === null || ref.kind !== 'own'
          || r.sourceCutoff !== null || r.sourceSchooling !== null) fail();
        instant(nativeRegisteredAt);
      } else if (nativeRegistrationId !== null || nativeRegisteredAt !== null) fail();
      const identity = JSON.stringify([r.employeeOrigin, r.nativeRegistrationId, r.nativeRegisteredAt, r.legajo, r.employeeName, r.sourceCutoff, r.administrativeActive]);
      if (contracts.has(r.contractId) && contracts.get(r.contractId) !== identity) fail();
      contracts.set(r.contractId, identity);
      origins.set(r.contractId + ':' + ref.kind + ':' + ref.id, Object.freeze({ employeeOrigin, nativeRegistrationId, nativeRegisteredAt }));
      return base;
    });
    const verified = schoolingData({ ok: true, data: { ...d, version: 'family-schooling.v4', rows } }, { resource, contractId, version: 4 });
    return Object.freeze({ ...verified, version: d.version, rows: Object.freeze(verified.rows.map(row => Object.freeze({ ...row, ...origins.get(row.key) }))) });
  }
  const d = payload?.data;
  if (version === 4) {
    if (payload?.ok !== true || d?.version !== 'family-schooling.v4' || !Array.isArray(d.rows) || d.rows.length > MAX_SCHOOLING_ROWS) fail();
    const extensions = new Map();
    const rows = d.rows.map(r => {
      if (!plain(r) || !Object.hasOwn(r, 'sourceSchooling') || !Object.hasOwn(r, 'effectiveDates')) fail();
      const { sourceSchooling, effectiveDates, ...base } = r;
      const ref = familyReference(r.familyRef), source = sourceSchooling;
      if (source !== null) {
        if (ref.kind !== 'grh' || !exact(source, ['presentedOn', 'expiresOn', 'presentationState', 'expiryState', 'sourceSystem', 'sourceTable', 'sourceKey',
          'sourceSha256', 'sourceImportRunId', 'sourceBatchId', 'sourceCutoff', 'sourceDeclaredCutoff', 'loadedAt', 'reviewState', 'documentAvailable'])
          || source.sourceSystem !== 'GRH' || source.sourceTable !== 'familia' || source.sourceKey !== ref.id || !/^[1-9][0-9]{0,17}$/.test(source.sourceKey) || !hash.test(source.sourceSha256)
          || !Number.isSafeInteger(source.sourceImportRunId) || source.sourceImportRunId < 1 || !uuid.test(source.sourceBatchId)
          || source.reviewState !== 'historical_unreviewed' || source.documentAvailable !== false) fail();
        for (const [key, state] of [['presentedOn', 'presentationState'], ['expiresOn', 'expiryState']]) {
          if (!['valid', 'null', 'absent', 'invalid'].includes(source[state]) || (source[state] === 'valid') !== (source[key] !== null)) fail();
          certificateDay(source[key], true);
        }
        instant(source.sourceCutoff); instant(source.loadedAt);
        if (r.sourceCutoff === null || Date.parse(source.sourceCutoff) !== Date.parse(instant(r.sourceCutoff))) fail();
        if (typeof source.sourceDeclaredCutoff !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(source.sourceDeclaredCutoff)) fail();
        day(source.sourceDeclaredCutoff.slice(0, 10));
      }
      const expected = schoolingEffectiveDates({ certificate: r.certificate, sourceSchooling: source });
      if (!exact(effectiveDates, ['origin', 'presentedOn', 'expiresOn']) || Object.keys(expected).some(key => effectiveDates[key] !== expected[key])) fail();
      extensions.set(r.contractId + ':' + familyReferenceKey(ref), Object.freeze({ sourceSchooling: source === null ? null : Object.freeze({ ...source }), effectiveDates: Object.freeze({ ...effectiveDates }) }));
      return base;
    });
    // Reuse the complete v3 contract. Source dates never synthesize a manual certificate.
    const base = schoolingData({ ok: true, data: { ...d, version: 'family-schooling.v3', rows } }, { resource, contractId, version: 3 });
    return Object.freeze({ ...base, version: d.version, rows: Object.freeze(base.rows.map(row => Object.freeze({ ...row, ...extensions.get(row.key) }))) });
  }
  if (![1, 2, 3].includes(version) || payload?.ok !== true || d?.version !== `family-schooling.v${version}` || typeof d.canRegister !== 'boolean'
    || !Array.isArray(d.rows) || d.rows.length > MAX_SCHOOLING_ROWS
    || d.scope?.cohort !== (resource === 'report' ? 'administrative_active_with_children' : 'contract_children')
    || d.scope.currentCensusCertified !== false || d.scope.payrollEligibilityCertified !== false) fail();
  if (version === 3 && (!exact(d, ['version', 'canRegister', 'rows', 'scope', 'storage'])
    || !exact(d.scope, ['cohort', 'sourceCutoffFrom', 'sourceCutoffTo', 'currentCensusCertified', 'payrollEligibilityCertified', 'unresolvedFamilyRows']))) fail();
  const s = d.storage;
  if (!s || Object.keys(s).sort().join(',') !== 'capacityBytes,mode,remainingBytes,usedBytes' || s.mode !== 'database_pilot'
    || !Number.isSafeInteger(s.capacityBytes) || s.capacityBytes < 0 || s.capacityBytes > 8388608
    || !Number.isSafeInteger(s.usedBytes) || s.usedBytes < 0 || !Number.isSafeInteger(s.remainingBytes) || s.remainingBytes < 0
    || s.remainingBytes > Math.max(0, s.capacityBytes - s.usedBytes) || version < 3 && s.remainingBytes === 0 && d.canRegister !== false) fail();
  const storage = Object.freeze({ mode: s.mode, capacityBytes: s.capacityBytes, usedBytes: s.usedBytes, remainingBytes: s.remainingBytes });
  const scope = { cohort: d.scope.cohort, sourceCutoffFrom: instant(d.scope.sourceCutoffFrom, true),
    sourceCutoffTo: instant(d.scope.sourceCutoffTo, true), currentCensusCertified: false, payrollEligibilityCertified: false };
  if (version >= 2) {
    if (!Number.isSafeInteger(d.scope.unresolvedFamilyRows) || d.scope.unresolvedFamilyRows < 0) fail();
    scope.unresolvedFamilyRows = d.scope.unresolvedFamilyRows;
  }
  if (scope.sourceCutoffFrom && scope.sourceCutoffTo && Date.parse(scope.sourceCutoffFrom) > Date.parse(scope.sourceCutoffTo)) fail();
  const seen = new Set();
  const rows = d.rows.map(r => {
    if (version === 3 && !exact(r, ['contractId', 'legajo', 'employeeName', 'familyRef', 'familyName', 'birthDate', 'familyEndDate', 'identityToken',
      'sourceCutoff', 'administrativeActive', 'certificate', 'historyCount', 'validFrom', 'familyRecordedAt', 'declarationState', 'identityReviewRequired'])) fail();
    if (!r || !uuid.test(r.contractId) || !text(r.legajo, 64) || !r.legajo
      || r.employeeName !== null && !text(r.employeeName) || version === 1 && (typeof r.familyId !== 'string' || !/^[0-9]{1,20}$/.test(r.familyId)) || r.familyName !== null && !text(r.familyName)
      || !hash.test(r.identityToken) || typeof r.administrativeActive !== 'boolean'
      || !Number.isSafeInteger(r.historyCount) || r.historyCount < 0
      || resource === 'report' && !r.administrativeActive || contractId && r.contractId !== contractId) fail();
    const ref = version >= 2 ? familyReference(r.familyRef) : null;
    const key = r.contractId + ':' + (ref ? familyReferenceKey(ref) : r.familyId);
    let origin = {};
    if (ref) {
      if (typeof r.identityReviewRequired !== 'boolean' || (ref.kind === 'own' ? r.declarationState !== 'declared' || !text(r.familyName, 180) || !r.familyName
        : r.declarationState !== 'source' || r.familyRecordedAt !== null || r.validFrom !== null)) fail();
      origin = { familyRef: ref, declarationState: r.declarationState, identityReviewRequired: r.identityReviewRequired,
        familyRecordedAt: instant(r.familyRecordedAt, ref.kind === 'grh'), validFrom: day(r.validFrom, true) };
    }
    if (seen.has(key)) fail(); seen.add(key);
    let certificate = null;
    if (r.certificate === null && r.historyCount !== 0) fail();
    if (r.certificate !== null) {
      const c = r.certificate;
      if (version === 3) {
        if (r.historyCount < 1) fail();
        certificate = schoolingCertificate(c);
      } else {
        if (!c || !uuid.test(c.id) || !text(c.filename, 255) || !c.filename || /[/\\]/.test(c.filename)
        || !hash.test(c.sha256) || !Number.isSafeInteger(c.byteLength) || c.byteLength < 1 || c.byteLength > MAX_CERTIFICATE_BYTES
        || r.historyCount < 1) fail();
        certificate = { id: c.id, filename: c.filename, sha256: c.sha256, byteLength: c.byteLength,
          presentedOn: day(c.presentedOn), expiresOn: day(c.expiresOn, true), recordedAt: instant(c.recordedAt) };
      }
    }
    return Object.freeze({ key, contractId: r.contractId, legajo: r.legajo, employeeName: r.employeeName,
      ...(version === 1 ? { familyId: r.familyId } : origin), familyName: r.familyName, birthDate: day(r.birthDate, true), familyEndDate: day(r.familyEndDate, true),
      identityToken: r.identityToken, sourceCutoff: instant(r.sourceCutoff, true), administrativeActive: r.administrativeActive,
      certificate: certificate && Object.freeze(certificate), historyCount: r.historyCount });
  }).sort((a, b) => a.key.localeCompare(b.key));
  if (version >= 2 && scope.unresolvedFamilyRows !== rows.filter(r => r.identityReviewRequired).length) fail();
  return Object.freeze({ version: d.version, scope: Object.freeze(scope), canRegister: d.canRegister, storage, rows: Object.freeze(rows) });
}
export function currentCivilDay(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'America/Argentina/Mendoza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(v => [v.type, v.value]));
  return p.year + '-' + p.month + '-' + p.day;
}
export function schoolingDate(value, empty = 'Fecha no informada') {
  if (value === null) return empty;
  const date = value.includes('T') ? instant(value).slice(0, 10) : day(value);
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
}
export function certificateState(row, asOf = currentCivilDay()) {
  if (!row.certificate && row.sourceSchooling) {
    if (!row.sourceSchooling.expiresOn) return 'Sin vencimiento válido en la fuente GRH';
    return row.sourceSchooling.expiresOn < asOf ? 'Fecha histórica GRH superada · por revisar' : 'Con fecha histórica GRH · por revisar';
  }
  if (!row.certificate) return 'Sin registro en MuniControl';
  if (!row.certificate.expiresOn) return 'Sin vencimiento informado';
  return row.certificate.expiresOn < asOf ? 'Vencimiento informado superado' : 'Con vencimiento informado';
}
export function schoolingEffectiveDates(row) {
  if (row.certificate) return { origin: 'manual', presentedOn: row.certificate.presentedOn, expiresOn: row.certificate.expiresOn };
  if (row.sourceSchooling) return { origin: 'grh_source', presentedOn: row.sourceSchooling.presentedOn, expiresOn: row.sourceSchooling.expiresOn };
  return { origin: 'none', presentedOn: null, expiresOn: null };
}
export function schoolingDateOrigin(row) {
  return row.certificate ? 'Registro manual en MuniControl' : row.sourceSchooling ? 'Fecha histórica de GRH · por revisar' : 'Sin fechas registradas';
}
const folded = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function schoolingFilter(data, { search = '', status = 'all', asOf = currentCivilDay() } = {}) {
  if (!['all', 'registered', 'unregistered', 'expired', 'no_expiry'].includes(status) || !text(search, 100)) fail();
  day(asOf);
  const q = folded(search.trim());
  const rows = data.rows.filter(r => (!q || folded(r.legajo + ' ' + (r.employeeName || '') + ' ' + (r.familyName || '')).includes(q))
    && (status === 'all' || status === 'registered' && r.certificate || status === 'unregistered' && !r.certificate
      || status === 'expired' && schoolingEffectiveDates(r).expiresOn && schoolingEffectiveDates(r).expiresOn < asOf
      || status === 'no_expiry' && (r.certificate || r.sourceSchooling) && schoolingEffectiveDates(r).expiresOn === null))
    .sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || '', 'es') || a.legajo.localeCompare(b.legajo) || (a.familyName || '').localeCompare(b.familyName || '', 'es') || a.key.localeCompare(b.key));
  return { rows, filters: { search: search.trim(), status, asOf }, counts: {
    contracts: new Set(rows.map(r => r.contractId)).size, children: rows.filter(r => !r.identityReviewRequired).length,
    registered: rows.filter(r => r.certificate).length, unregistered: rows.filter(r => !r.certificate).length,
    ...(['family-schooling.v2', 'family-schooling.v3', 'family-schooling.v4', 'family-schooling.v5'].includes(data.version) ? { review: rows.filter(r => r.identityReviewRequired).length, records: rows.length } : {}),
  } };
}
// Capacity and registration permission do not change the report rows. The fresh
// API request still checks read access before each export.
export function schoolingRevision(data) { return JSON.stringify({ version: data.version, scope: data.scope, rows: data.rows }); }
export function certificateFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 1) throw Error('Elegí el certificado en PDF.');
  if (file.size > MAX_CERTIFICATE_BYTES) throw Error('El PDF supera 2 MiB. Elegí una copia más liviana.');
  if (!text(file.name, 180) || !/\.pdf$/i.test(file.name) || /[/\\]/.test(file.name) || file.type && file.type !== 'application/pdf') throw Error('El archivo debe ser un PDF.');
  return file;
}
export function certificateDates(presentedOn, expiresOn) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(presentedOn) || expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw Error();
    return { presentedOn: civilDate(presentedOn), expiresOn: expiresOn ? civilDate(expiresOn) : null };
  } catch { throw Error('Ingresá una fecha de presentación válida. El vencimiento es opcional.'); }
}

export function familyContextData(payload, contractId, { version = 1 } = {}) {
  const d = payload?.data, s = d?.subject;
  if (payload?.ok !== true || ![1, 2].includes(version) || d?.version !== 'employee-family-context.v' + version || typeof d.canDeclare !== 'boolean'
    || !s || s.contractId !== contractId || !uuid.test(s.contractId) || !hash.test(s.identityToken)
    || !text(s.legajo, 64) || !s.legajo || s.employeeName !== null && !text(s.employeeName)) fail();
  const keys = ['contractId', 'employeeName', 'identityToken', 'legajo', 'sourceCutoff'];
  if (version === 2 && !exact(d, ['version', 'subject', 'canDeclare'])) fail();
  if (version === 2 && s.origin === 'MUNICONTROL') {
    if (!exact(s, [...keys, 'origin', 'registrationId', 'registeredAt']) || s.sourceCutoff !== null
      || !generatedUuid(s.registrationId) || !/^(?:0|[1-9]\d{0,19})$/.test(s.legajo)) fail();
    instant(s.registeredAt);
  } else { if (!exact(s, keys)) fail(); instant(s.sourceCutoff); }
  return Object.freeze({ canDeclare: d.canDeclare, subject: Object.freeze({ ...s }) });
}
export function familyDeclarationFields(fields) {
  const familyName = String(fields.familyName ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!familyName || !/\p{L}/u.test(familyName) || Array.from(familyName).length > 180 || /[\x00-\x1f\x7f<>]/.test(familyName)) throw Error('Ingresá el nombre del hijo o hija, hasta 180 caracteres.');
  const dates = {};
  for (const key of ['birthDate', 'validFrom', 'validTo']) {
    const value = fields[key];
    try { dates[key] = value ? civilDate(value) : null; } catch { throw Error('Revisá las fechas del vínculo. Podés dejar sin informar las que no constan.'); }
  }
  if (dates.birthDate && dates.birthDate > currentCivilDay() || dates.validTo && dates.validFrom && dates.validTo < dates.validFrom
    || dates.birthDate && [dates.validFrom, dates.validTo].some(value => value && value < dates.birthDate)) throw Error('Revisá el nacimiento y el orden de las fechas de vigencia.');
  let dni = fields.dni?.trim() || null;
  if (dni !== null) {
    if (!/^[0-9. -]+$/.test(dni)) throw Error('Revisá el DNI o dejalo sin informar.');
    dni = dni.replace(/[. -]/g, '');
    if (!/^[0-9]{5,12}$/.test(dni) || /^0+$/.test(dni)) throw Error('El DNI debe tener entre 5 y 12 dígitos, o quedar sin informar.');
  }
  return { familyName, birthDate: dates.birthDate, dni, validFrom: dates.validFrom, validTo: dates.validTo };
}
export function familyDeclarationResult(payload, { version = 1, contractId, contractIdentityToken } = {}) {
  const d = payload?.data;
  if (payload?.ok !== true || !d || ![1, 2].includes(version) || d.version !== 'employee-family-declare.v' + version || d.state !== 'declared'
    || !hash.test(d.identityToken) || typeof d.duplicate !== 'boolean' || d.familyRef?.kind !== 'own') throw Error('No se pudo confirmar el alta. Reintentá con los mismos datos para verificarla.');
  if (version === 2 && (!exact(d, ['version', 'contractId', 'contractIdentityToken', 'familyRef', 'identityToken', 'state', 'recordedAt', 'duplicate'])
    || !uuid.test(d.contractId) || !hash.test(d.contractIdentityToken)
    || contractId !== undefined && d.contractId !== contractId || contractIdentityToken !== undefined && d.contractIdentityToken !== contractIdentityToken)) fail();
  return Object.freeze({ ...d, familyRef: familyReference(d.familyRef), recordedAt: instant(d.recordedAt) });
}
