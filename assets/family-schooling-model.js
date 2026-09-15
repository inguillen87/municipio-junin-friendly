import { civilDate } from './civil-date.js';

export const SCHOOLING_VERSION = 'family-schooling.v1';
export const MAX_SCHOOLING_ROWS = 5000;
export const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const fail = () => { throw Error('No se pudo verificar el reporte de certificados. Volvé a consultar.'); };
const text = (value, max = 300) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f]/.test(value);
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
export function schoolingData(payload, { resource = 'report', contractId, version = 1 } = {}) {
  const d = payload?.data;
  if (![1, 2].includes(version) || payload?.ok !== true || d?.version !== `family-schooling.v${version}` || typeof d.canRegister !== 'boolean'
    || !Array.isArray(d.rows) || d.rows.length > MAX_SCHOOLING_ROWS
    || d.scope?.cohort !== (resource === 'report' ? 'administrative_active_with_children' : 'contract_children')
    || d.scope.currentCensusCertified !== false || d.scope.payrollEligibilityCertified !== false) fail();
  const s = d.storage;
  if (!s || Object.keys(s).sort().join(',') !== 'capacityBytes,mode,remainingBytes,usedBytes' || s.mode !== 'database_pilot'
    || !Number.isSafeInteger(s.capacityBytes) || s.capacityBytes < 0 || s.capacityBytes > 8388608
    || !Number.isSafeInteger(s.usedBytes) || s.usedBytes < 0 || !Number.isSafeInteger(s.remainingBytes) || s.remainingBytes < 0
    || s.remainingBytes > Math.max(0, s.capacityBytes - s.usedBytes) || s.remainingBytes === 0 && d.canRegister !== false) fail();
  const storage = Object.freeze({ mode: s.mode, capacityBytes: s.capacityBytes, usedBytes: s.usedBytes, remainingBytes: s.remainingBytes });
  const scope = { cohort: d.scope.cohort, sourceCutoffFrom: instant(d.scope.sourceCutoffFrom, true),
    sourceCutoffTo: instant(d.scope.sourceCutoffTo, true), currentCensusCertified: false, payrollEligibilityCertified: false };
  if (version === 2) {
    if (!Number.isSafeInteger(d.scope.unresolvedFamilyRows) || d.scope.unresolvedFamilyRows < 0) fail();
    scope.unresolvedFamilyRows = d.scope.unresolvedFamilyRows;
  }
  if (scope.sourceCutoffFrom && scope.sourceCutoffTo && Date.parse(scope.sourceCutoffFrom) > Date.parse(scope.sourceCutoffTo)) fail();
  const seen = new Set();
  const rows = d.rows.map(r => {
    if (!r || !uuid.test(r.contractId) || !text(r.legajo, 64) || !r.legajo
      || r.employeeName !== null && !text(r.employeeName) || version === 1 && (typeof r.familyId !== 'string' || !/^[0-9]{1,20}$/.test(r.familyId)) || r.familyName !== null && !text(r.familyName)
      || !hash.test(r.identityToken) || typeof r.administrativeActive !== 'boolean'
      || !Number.isSafeInteger(r.historyCount) || r.historyCount < 0
      || resource === 'report' && !r.administrativeActive || contractId && r.contractId !== contractId) fail();
    const ref = version === 2 ? familyReference(r.familyRef) : null;
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
      if (!c || !uuid.test(c.id) || !text(c.filename, 255) || !c.filename || /[/\\]/.test(c.filename)
        || !hash.test(c.sha256) || !Number.isSafeInteger(c.byteLength) || c.byteLength < 1 || c.byteLength > MAX_CERTIFICATE_BYTES
        || r.historyCount < 1) fail();
      certificate = { id: c.id, filename: c.filename, sha256: c.sha256, byteLength: c.byteLength,
        presentedOn: day(c.presentedOn), expiresOn: day(c.expiresOn, true), recordedAt: instant(c.recordedAt) };
    }
    return Object.freeze({ key, contractId: r.contractId, legajo: r.legajo, employeeName: r.employeeName,
      ...(version === 1 ? { familyId: r.familyId } : origin), familyName: r.familyName, birthDate: day(r.birthDate, true), familyEndDate: day(r.familyEndDate, true),
      identityToken: r.identityToken, sourceCutoff: instant(r.sourceCutoff, true), administrativeActive: r.administrativeActive,
      certificate: certificate && Object.freeze(certificate), historyCount: r.historyCount });
  }).sort((a, b) => a.key.localeCompare(b.key));
  if (version === 2 && scope.unresolvedFamilyRows !== rows.filter(r => r.identityReviewRequired).length) fail();
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
  if (!row.certificate) return 'Sin registro en MuniControl';
  if (!row.certificate.expiresOn) return 'Sin vencimiento informado';
  return row.certificate.expiresOn < asOf ? 'Vencimiento informado superado' : 'Con vencimiento informado';
}
const folded = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function schoolingFilter(data, { search = '', status = 'all', asOf = currentCivilDay() } = {}) {
  if (!['all', 'registered', 'unregistered', 'expired', 'no_expiry'].includes(status) || !text(search, 100)) fail();
  day(asOf);
  const q = folded(search.trim());
  const rows = data.rows.filter(r => (!q || folded(r.legajo + ' ' + (r.employeeName || '') + ' ' + (r.familyName || '')).includes(q))
    && (status === 'all' || status === 'registered' && r.certificate || status === 'unregistered' && !r.certificate
      || status === 'expired' && r.certificate?.expiresOn && r.certificate.expiresOn < asOf
      || status === 'no_expiry' && r.certificate && r.certificate.expiresOn === null))
    .sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || '', 'es') || a.legajo.localeCompare(b.legajo) || (a.familyName || '').localeCompare(b.familyName || '', 'es') || a.key.localeCompare(b.key));
  return { rows, filters: { search: search.trim(), status, asOf }, counts: {
    contracts: new Set(rows.map(r => r.contractId)).size, children: rows.filter(r => !r.identityReviewRequired).length,
    registered: rows.filter(r => r.certificate).length, unregistered: rows.filter(r => !r.certificate).length,
    ...(data.version === 'family-schooling.v2' ? { review: rows.filter(r => r.identityReviewRequired).length, records: rows.length } : {}),
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

export function familyContextData(payload, contractId) {
  const d = payload?.data, s = d?.subject;
  if (payload?.ok !== true || d?.version !== 'employee-family-context.v1' || typeof d.canDeclare !== 'boolean'
    || !s || s.contractId !== contractId || !uuid.test(s.contractId) || !hash.test(s.identityToken)
    || !text(s.legajo, 64) || !s.legajo || s.employeeName !== null && !text(s.employeeName)
    || Object.keys(s).sort().join(',') !== 'contractId,employeeName,identityToken,legajo,sourceCutoff') fail();
  return Object.freeze({ canDeclare: d.canDeclare, subject: Object.freeze({ ...s, sourceCutoff: instant(s.sourceCutoff) }) });
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
export function familyDeclarationResult(payload) {
  const d = payload?.data;
  if (payload?.ok !== true || !d || d.version !== 'employee-family-declare.v1' || d.state !== 'declared'
    || !hash.test(d.identityToken) || typeof d.duplicate !== 'boolean' || d.familyRef?.kind !== 'own') throw Error('No se pudo confirmar el alta. Reintentá con los mismos datos para verificarla.');
  return Object.freeze({ ...d, familyRef: familyReference(d.familyRef), recordedAt: instant(d.recordedAt) });
}
