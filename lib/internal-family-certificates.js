import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

export const SCHOOL_CERTIFICATE_MAX_BYTES = 2 * 1024 * 1024;
export const SCHOOL_CERTIFICATE_MAX_BODY_BYTES = 3 * 1024 * 1024;
export const SCHOOL_CERTIFICATE_MAX_PAGES = 30;
export const SCHOOL_CERTIFICATE_STORAGE_CAPACITY_BYTES = 8 * 1024 * 1024;
export const SCHOOL_CERTIFICATE_READ_CAPABILITY = 'workforce.employee.read';
export const SCHOOL_CERTIFICATE_WRITE_CAPABILITY = 'employee.record.propose';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Imported contract IDs are PostgreSQL UUIDs derived from source hashes; their
// version and variant bits need not match newly generated session/document IDs.
const CONTRACT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/;
const FAMILY = /^[0-9]{1,20}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PAYLOAD_KEYS = ['contractId', 'familyId', 'identityToken', 'filename', 'contentBase64', 'sha256', 'presentedOn', 'expiresOn'];
const RECORD_KEYS = ['contractId', 'familyRef', 'identityToken', 'expectedCertificateId', 'institution', 'educationLevel', 'course', 'schoolYear', 'issuedOn', 'presentedOn', 'expiresOn', 'evidenceMode', 'paperReference', 'filename', 'contentBase64', 'sha256', 'reason'];
const RECORD_METADATA = ['recordKind', 'institution', 'educationLevel', 'course', 'schoolYear', 'issuedOn', 'evidenceMode', 'paperReference', 'reason', 'supersedesId', 'recordedBy'];
const ERRORS = Object.freeze({
  SESSION_INVALID: [401, 'La sesión ya no es válida. Volvé a ingresar.'],
  RELEASE_NOT_CERTIFIED: [503, 'La fuente municipal no está disponible para esta operación.'],
  SOURCE_BINDING_REQUIRED: [503, 'La fuente municipal no está disponible para esta operación.'],
  SOURCE_MAPPING_DRIFT: [503, 'La fuente de vínculos cambió. Hay que revisar su correspondencia antes de usar este reporte.'],
  SOURCE_IDENTITY_MISMATCH: [409, 'La identidad de la fuente cambió. Hay que revisar los datos históricos antes de recuperarlos.'],
  STORAGE_FULL: [503, 'El archivo privado alcanzó su capacidad disponible. La carga se conserva; hace falta ampliar el almacenamiento antes de reintentar.'],
  CAPABILITY_REQUIRED: [403, 'No tenés permiso para esta operación.'],
  TENANT_MEMBERSHIP_REQUIRED: [403, 'La operación requiere una membresía municipal activa.'],
  SESSION_BUSY: [409, 'El acceso se está actualizando. Reintentá en un momento.'],
  INVALID_PAYLOAD: [422, 'Revisá los datos del certificado.'],
  PDF_INVALID: [422, 'El archivo no es un PDF válido.'],
  PDF_ENCRYPTED: [422, 'El PDF está cifrado. Adjuntá una copia sin contraseña.'],
  PDF_TOO_MANY_PAGES: [422, 'El PDF debe tener entre 1 y 30 páginas.'],
  PDF_TOO_LARGE: [413, 'El PDF supera el límite de 2 MiB.'],
  TOO_LARGE: [413, 'El archivo supera el límite permitido.'],
  SHA256_MISMATCH: [422, 'El contenido del archivo cambió. Volvé a seleccionarlo.'],
  DATES_INVALID: [422, 'Revisá las fechas del certificado.'],
  IDENTITY_CHANGED: [409, 'La familia cambió desde la consulta. Actualizá la ficha antes de registrar.'],
  IDENTITY_REVIEW_REQUIRED: [409, 'Hay dos vínculos que requieren revisar su identidad antes de registrar.'],
  REVISION_CONFLICT: [409, 'Otra persona registró un cambio. Actualizá el historial antes de continuar.'],
  NOT_FOUND: [404, 'No se encontró el registro solicitado.'],
  IDEMPOTENCY_REUSE: [409, 'El intento ya se utilizó con otros datos. Iniciá un nuevo registro.'],
  ROW_LIMIT: [422, 'El reporte supera el límite de filas permitido.'],
  UNAVAILABLE: [503, 'No se pudo completar la operación. Reintentá en un momento.'],
  SERVICE_UNAVAILABLE: [503, 'No se pudo completar la operación. Reintentá en un momento.'],
  CONTRACT_DRIFT: [503, 'La respuesta no pudo validarse. Reintentá en un momento.'],
  PDF_TIMEOUT: [422, 'No se pudo verificar el PDF dentro del límite permitido.'],
  BODY_INVALID: [400, 'El cuerpo de la solicitud no es válido.'],
  BODY_TOO_LARGE: [413, 'La solicitud supera el límite permitido.'],
  QUERY_INVALID: [400, 'La consulta no es válida.'],
  ORIGIN_INVALID: [403, 'El origen de la solicitud no está permitido.'],
  ORIGIN_NOT_CONFIGURED: [503, 'La operación no está configurada.'],
  CONTENT_TYPE_REQUIRED: [415, 'La solicitud debe usar application/json.'],
  IDEMPOTENCY_KEY_REQUIRED: [428, 'El registro requiere una clave de intento.'],
  IDEMPOTENCY_KEY_INVALID: [400, 'La clave de intento no es válida.'],
  METHOD_NOT_ALLOWED: [405, 'Método no permitido.'],
});

export class SchoolCertificateError extends Error {
  constructor(suffix) {
    const definition = ERRORS[suffix] ?? ERRORS.SERVICE_UNAVAILABLE;
    super(definition[1]);
    this.name = 'SchoolCertificateError';
    this.code = `SCHOOL_CERTIFICATE_${Object.hasOwn(ERRORS, suffix) ? suffix : 'SERVICE_UNAVAILABLE'}`;
    this.status = definition[0];
  }
}
export function schoolCertificateFail(suffix) { throw new SchoolCertificateError(suffix); }
export function schoolCertificateSafeError(error) {
  if (error instanceof SchoolCertificateError) return error;
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  for (const suffix of Object.keys(ERRORS)) {
    const expected = `SCHOOL_CERTIFICATE_${suffix}`;
    if (code === expected || message === expected) return new SchoolCertificateError(suffix);
  }
  const aliases = { ACTION_SESSION_INVALID: 'SESSION_INVALID', ACTION_SESSION_BUSY: 'SESSION_BUSY', ACTION_RELEASE_NOT_CERTIFIED: 'RELEASE_NOT_CERTIFIED', ACTION_SOURCE_BINDING_REQUIRED: 'SOURCE_BINDING_REQUIRED', ACTION_TENANT_AUTHORITY_REQUIRED: 'TENANT_MEMBERSHIP_REQUIRED' };
  return new SchoolCertificateError(aliases[code] ?? aliases[message] ?? 'SERVICE_UNAVAILABLE');
}
export function schoolCertificateUuid(value) { return typeof value === 'string' && UUID.test(value); }
export function schoolCertificateContractId(value) { return typeof value === 'string' && CONTRACT_ID.test(value); }
function exact(value, keys, error = 'CONTRACT_DRIFT') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) schoolCertificateFail(error);
}
function date(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const nullableDate = value => value === null || date(value);
const certificateDate = value => date(value) && value >= '1900-01-01' && value <= '2100-12-31';
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const timestampMicros = value => BigInt(Date.parse(value.replace(/\.\d+(?=Z|[+-])/, ''))) * 1000n
  + BigInt((value.match(/\.(\d+)(?=Z|[+-])/)?.[1] ?? '').padEnd(6, '0'));
const hashString = value => typeof value === 'string' && HEX.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const filename = value => text(value, 180) && value.length > 4 && /\.pdf$/i.test(value) && !/[\\/:*?"<>|]/.test(value) && value === value.trim();
const count = value => Number.isSafeInteger(value) && value >= 0;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function decodeSchoolCertificate(value, expectedSha, expectedLength) {
  if (typeof value !== 'string' || !value.length) schoolCertificateFail('PDF_INVALID');
  if (value.length > Math.ceil(SCHOOL_CERTIFICATE_MAX_BYTES / 3) * 4) schoolCertificateFail('PDF_TOO_LARGE');
  if (!BASE64.test(value) || value.length % 4) schoolCertificateFail('PDF_INVALID');
  const bytes = Buffer.from(value, 'base64');
  try {
    if (bytes.length > SCHOOL_CERTIFICATE_MAX_BYTES) schoolCertificateFail('PDF_TOO_LARGE');
    if (bytes.toString('base64') !== value || !/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(bytes.subarray(0, 10).toString('latin1'))) schoolCertificateFail('PDF_INVALID');
    if (!hashString(expectedSha) || sha256(bytes) !== expectedSha) schoolCertificateFail('SHA256_MISMATCH');
    if (expectedLength !== undefined && bytes.length !== expectedLength) schoolCertificateFail('CONTRACT_DRIFT');
    return bytes;
  } catch (error) { bytes.fill(0); throw error; }
}

// A separate Node worker can be terminated even when a corrupt PDF keeps the
// parser's event loop busy. No PDF bytes, parser output or metadata are logged.
export function validateSchoolCertificatePdf(bytes, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const copy = Uint8Array.from(bytes);
    const worker = new Worker(new URL('./internal-family-certificates.js', import.meta.url), {
      workerData: { kind: 'school-certificate-pdf.v1', bytes: copy }, transferList: [copy.buffer],
      execArgv: [], stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    worker.stdout.resume(); worker.stderr.resume();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      void worker.terminate().catch(() => {});
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new SchoolCertificateError('PDF_TIMEOUT')), timeoutMs);
    worker.once('message', result => {
      if (result?.ok === true && Number.isInteger(result.pages) && result.pages > 0 && result.pages <= SCHOOL_CERTIFICATE_MAX_PAGES) finish(null, { pages: result.pages });
      else finish(new SchoolCertificateError(['PDF_ENCRYPTED', 'PDF_TOO_MANY_PAGES'].includes(result?.error) ? result.error : 'PDF_INVALID'));
    });
    worker.once('error', () => finish(new SchoolCertificateError('PDF_INVALID')));
    worker.once('exit', () => finish(new SchoolCertificateError('PDF_INVALID')));
  });
}
async function parsePdfInWorker(bytes) {
  let task;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = getDocument({ data: bytes, verbosity: 0, stopAtErrors: true, isEvalSupported: false,
      enableXfa: false, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true,
      useWasm: false, isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
      disableAutoFetch: true, disableStream: true, disableRange: true, maxImageSize: 10000000 });
    const document = await task.promise;
    // Permission information is present for encrypted PDFs, including ones
    // whose user password is empty and would otherwise open without prompting.
    if (await document.getPermissions() !== null) schoolCertificateFail('PDF_ENCRYPTED');
    if (!Number.isInteger(document.numPages) || document.numPages < 1 || document.numPages > SCHOOL_CERTIFICATE_MAX_PAGES) schoolCertificateFail('PDF_TOO_MANY_PAGES');
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      await page.getOperatorList();
      page.cleanup();
    }
    return { ok: true, pages: document.numPages };
  } catch (error) {
    return { ok: false, error: error?.name === 'PasswordException' ? 'PDF_ENCRYPTED' : error instanceof SchoolCertificateError ? error.code.replace('SCHOOL_CERTIFICATE_', '') : 'PDF_INVALID' };
  } finally {
    await task?.destroy().catch(() => {});
    // PDF.js may transfer and detach this buffer while creating its worker.
    if (bytes.byteLength) bytes.fill(0);
  }
}
if (!isMainThread && workerData?.kind === 'school-certificate-pdf.v1') parentPort.postMessage(await parsePdfInWorker(workerData.bytes));

export function schoolCertificateFamilyRef(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && Object.hasOwn(value, 'kind') && Object.hasOwn(value, 'id')
    && (value.kind === 'grh' ? typeof value.id === 'string' && FAMILY.test(value.id) : value.kind === 'own' && schoolCertificateUuid(value.id));
}
function certificateVersion(version) { if (![1, 2, 3].includes(version)) schoolCertificateFail('QUERY_INVALID'); }
const recordText = (value, max, min = 1) => text(value, max) && value.length >= min && value === value.trim() && value === value.normalize('NFC') && !/[<>]/.test(value);
function recordMetadata(value, error = 'INVALID_PAYLOAD') {
  for (const [key, max] of [['institution', 180], ['educationLevel', 80], ['course', 100]]) {
    if (value[key] !== null && !recordText(value[key], max)) schoolCertificateFail(error);
  }
  if (!(value.schoolYear === null || Number.isInteger(value.schoolYear) && value.schoolYear >= 1900 && value.schoolYear <= 2100)
    || !(value.issuedOn === null || certificateDate(value.issuedOn)) || !recordText(value.reason, 500, 5)
    || !['pdf', 'paper_declared'].includes(value.evidenceMode)
    || (value.evidenceMode === 'paper_declared' ? !recordText(value.paperReference, 500, 5) || value.filename !== null || value.sha256 !== null
      : value.paperReference !== null || !filename(value.filename) || !hashString(value.sha256))) schoolCertificateFail(error);
}
export async function prepareSchoolCertificate(input, { validatePdf = validateSchoolCertificatePdf, version = 1 } = {}) {
  certificateVersion(version);
  if (version === 3) {
    exact(input, RECORD_KEYS, 'INVALID_PAYLOAD');
    if (!schoolCertificateContractId(input.contractId) || !schoolCertificateFamilyRef(input.familyRef) || !hashString(input.identityToken)
      || !(input.expectedCertificateId === null || schoolCertificateUuid(input.expectedCertificateId))) schoolCertificateFail('INVALID_PAYLOAD');
    const normalized = { ...input };
    for (const field of ['institution', 'educationLevel', 'course', 'paperReference', 'reason']) if (typeof normalized[field] === 'string') normalized[field] = normalized[field].normalize('NFC').trim();
    recordMetadata(normalized);
    if (!certificateDate(input.presentedOn) || !(input.expiresOn === null || certificateDate(input.expiresOn))) schoolCertificateFail('DATES_INVALID');
    if (input.evidenceMode === 'paper_declared') {
      if (input.contentBase64 !== null) schoolCertificateFail('INVALID_PAYLOAD');
    } else {
      const bytes = decodeSchoolCertificate(input.contentBase64, input.sha256);
      try { await validatePdf(bytes); } finally { bytes.fill(0); }
    }
    return { ...normalized, contractId: input.contractId.toLowerCase(), expectedCertificateId: input.expectedCertificateId?.toLowerCase() ?? null,
      familyRef: { kind: input.familyRef.kind, id: input.familyRef.kind === 'own' ? input.familyRef.id.toLowerCase() : input.familyRef.id } };
  }
  exact(input, version === 2 ? PAYLOAD_KEYS.map(key => key === 'familyId' ? 'familyRef' : key) : PAYLOAD_KEYS, 'INVALID_PAYLOAD');
  if (!schoolCertificateContractId(input.contractId) || (version === 2 ? !schoolCertificateFamilyRef(input.familyRef) : typeof input.familyId !== 'string' || !FAMILY.test(input.familyId))
      || typeof input.identityToken !== 'string' || !HEX.test(input.identityToken) || !filename(input.filename)
      || typeof input.sha256 !== 'string' || !HEX.test(input.sha256)) schoolCertificateFail('INVALID_PAYLOAD');
  if (!certificateDate(input.presentedOn) || !(input.expiresOn === null || certificateDate(input.expiresOn))) schoolCertificateFail('DATES_INVALID');
  const bytes = decodeSchoolCertificate(input.contentBase64, input.sha256);
  try { await validatePdf(bytes); } finally { bytes.fill(0); }
  return { ...input, contractId: input.contractId.toLowerCase(), ...(version === 2 ? { familyRef: { kind: input.familyRef.kind, id: input.familyRef.kind === 'own' ? input.familyRef.id.toLowerCase() : input.familyRef.id } } : {}) };
}

export function schoolCertificatePrincipalValues(principal, session) {
  const tenant = principal?.tenant;
  if (tenant?.source !== 'membership' || !schoolCertificateUuid(tenant.id) || !schoolCertificateUuid(tenant.membershipId)) schoolCertificateFail('TENANT_MEMBERSHIP_REQUIRED');
  if (!schoolCertificateUuid(session?.id) || !Number.isSafeInteger(session.version) || session.version < 1
      || !text(session.email, 320) || !session.email || session.email !== principal?.user?.email?.trim().toLowerCase()
      || typeof session.releaseSha !== 'string' || !/^[0-9a-f]{40}$/.test(session.releaseSha)
      || session.releaseSha !== String(tenant.certifiedReleaseSha ?? '').trim().toLowerCase()) schoolCertificateFail('SESSION_INVALID');
  return [session.email, session.id, session.version, session.releaseSha, tenant.id, tenant.membershipId];
}
export async function schoolCertificateFacade(sql, statement, values) {
  try {
    const result = await sql.query(statement, values);
    const rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.result || typeof rows[0].result !== 'object') schoolCertificateFail('CONTRACT_DRIFT');
    return rows[0].result;
  } catch (error) { throw schoolCertificateSafeError(error); }
}
function certificate(value, version = 1) {
  exact(value, ['id', 'filename', 'sha256', 'byteLength', 'presentedOn', 'expiresOn', 'recordedAt', ...(version === 3 ? RECORD_METADATA : [])]);
  if (version === 3) {
    if (!['legacy_pdf', 'schooling_record'].includes(value.recordKind)) schoolCertificateFail('CONTRACT_DRIFT');
    if (value.recordKind === 'legacy_pdf') {
      if (value.evidenceMode !== 'pdf' || RECORD_METADATA.filter(key => !['recordKind', 'evidenceMode'].includes(key)).some(key => value[key] !== null)) schoolCertificateFail('CONTRACT_DRIFT');
    } else {
      recordMetadata(value, 'CONTRACT_DRIFT');
      if (!(value.supersedesId === null || schoolCertificateUuid(value.supersedesId) && value.supersedesId !== value.id)
        || !recordText(value.recordedBy, 320) || !value.recordedBy.includes('@')) schoolCertificateFail('CONTRACT_DRIFT');
    }
    if (value.evidenceMode === 'paper_declared') {
      if (!schoolCertificateUuid(value.id) || value.byteLength !== null || !certificateDate(value.presentedOn)
        || !(value.expiresOn === null || certificateDate(value.expiresOn)) || !timestamp(value.recordedAt)) schoolCertificateFail('CONTRACT_DRIFT');
      return;
    }
  }
  if (!schoolCertificateUuid(value.id) || !filename(value.filename) || !hashString(value.sha256)
      || !count(value.byteLength) || value.byteLength < 1 || value.byteLength > SCHOOL_CERTIFICATE_MAX_BYTES
      || !certificateDate(value.presentedOn) || !(value.expiresOn === null || certificateDate(value.expiresOn)) || !timestamp(value.recordedAt)) schoolCertificateFail('CONTRACT_DRIFT');
}
export function validateSchoolCertificateReport(data, contractId = null, version = 1) {
  if (version === 5) return validateNativeSchoolCertificateReport(data, contractId);
  if (version === 4) return validateSchoolCertificateSourceReport(data, contractId);
  certificateVersion(version);
  exact(data, ['version', 'rows', 'scope', 'canRegister', 'storage']);
  exact(data.scope, ['cohort', 'sourceCutoffFrom', 'sourceCutoffTo', 'currentCensusCertified', 'payrollEligibilityCertified', ...(version >= 2 ? ['unresolvedFamilyRows'] : [])]);
  exact(data.storage, ['mode', 'remainingBytes', 'usedBytes', 'capacityBytes']);
  const storage = data.storage;
  if (storage.mode !== 'database_pilot' || !count(storage.capacityBytes) || storage.capacityBytes > SCHOOL_CERTIFICATE_STORAGE_CAPACITY_BYTES
      || !count(storage.usedBytes)
      || !count(storage.remainingBytes) || storage.remainingBytes > Math.max(0, storage.capacityBytes - storage.usedBytes)
      || version < 3 && storage.remainingBytes === 0 && data.canRegister !== false) schoolCertificateFail('CONTRACT_DRIFT');
  if (data.version !== `family-schooling.v${version}` || typeof data.canRegister !== 'boolean' || !Array.isArray(data.rows) || data.rows.length > 5000
      || data.scope.cohort !== (contractId ? 'contract_children' : 'administrative_active_with_children')
      || data.scope.currentCensusCertified !== false || data.scope.payrollEligibilityCertified !== false
      || ![data.scope.sourceCutoffFrom, data.scope.sourceCutoffTo].every(v => v === null || timestamp(v))) schoolCertificateFail('CONTRACT_DRIFT');
  const seen = new Set();
  for (const row of data.rows) {
    exact(row, ['contractId', 'legajo', 'employeeName', version >= 2 ? 'familyRef' : 'familyId', 'familyName', 'birthDate', 'familyEndDate', 'identityToken', 'sourceCutoff', 'administrativeActive', 'certificate', 'historyCount',
      ...(version >= 2 ? ['validFrom', 'familyRecordedAt', 'declarationState', 'identityReviewRequired'] : [])]);
    if (version >= 2 && (!schoolCertificateFamilyRef(row.familyRef) || !nullableDate(row.validFrom)
      || typeof row.identityReviewRequired !== 'boolean'
      || (row.familyRef.kind === 'own' ? row.declarationState !== 'declared' || !timestamp(row.familyRecordedAt) || !text(row.familyName, 180) || !row.familyName
        : row.declarationState !== 'source' || row.familyRecordedAt !== null || row.validFrom !== null))) schoolCertificateFail('CONTRACT_DRIFT');
    const key = version >= 2 ? `${row.contractId}:${row.familyRef.kind}:${row.familyRef.id}` : `${row.contractId}:${row.familyId}`;
    if (!schoolCertificateContractId(row.contractId) || contractId && row.contractId !== contractId || !text(row.legajo, 64)
        || !(row.employeeName === null || text(row.employeeName, 300)) || !(row.familyName === null || text(row.familyName, 300)) || version === 1 && (typeof row.familyId !== 'string' || !FAMILY.test(row.familyId))
        || !hashString(row.identityToken) || !nullableDate(row.birthDate) || !nullableDate(row.familyEndDate)
        || !(row.sourceCutoff === null || timestamp(row.sourceCutoff)) || typeof row.administrativeActive !== 'boolean'
        || !contractId && !row.administrativeActive || !count(row.historyCount) || seen.has(key)) schoolCertificateFail('CONTRACT_DRIFT');
    seen.add(key);
    if (row.certificate !== null) certificate(row.certificate, version);
    if ((row.certificate === null) !== (row.historyCount === 0)) schoolCertificateFail('CONTRACT_DRIFT');
  }
  if (version >= 2 && (!count(data.scope.unresolvedFamilyRows) || data.scope.unresolvedFamilyRows !== data.rows.filter(row => row.identityReviewRequired).length)) schoolCertificateFail('CONTRACT_DRIFT');
  return data;
}
export function validateSchoolCertificateSourceReport(data, contractId = null) {
  if (!data || data.version !== 'family-schooling.v4' || !Array.isArray(data.rows)) schoolCertificateFail('CONTRACT_DRIFT');
  const projected = data.rows.map(row => {
    if (!row || !Object.hasOwn(row, 'sourceSchooling') || !Object.hasOwn(row, 'effectiveDates')) schoolCertificateFail('CONTRACT_DRIFT');
    const { sourceSchooling: source, effectiveDates: effective, ...base } = row;
    if (source !== null) {
      exact(source, ['presentedOn','expiresOn','presentationState','expiryState','sourceSystem','sourceTable','sourceKey','sourceSha256','sourceImportRunId','sourceBatchId','sourceCutoff','sourceDeclaredCutoff','loadedAt','reviewState','documentAvailable']);
      if (base.familyRef?.kind !== 'grh' || source.sourceKey !== base.familyRef.id || !/^[1-9][0-9]{0,17}$/.test(source.sourceKey)
        || source.sourceSystem !== 'GRH' || source.sourceTable !== 'familia' || !hashString(source.sourceSha256)
        || !Number.isSafeInteger(source.sourceImportRunId) || source.sourceImportRunId < 1 || !schoolCertificateContractId(source.sourceBatchId)
        || !timestamp(source.sourceCutoff) || Date.parse(source.sourceCutoff) !== Date.parse(base.sourceCutoff) || !timestamp(source.loadedAt)
        || typeof source.sourceDeclaredCutoff !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(source.sourceDeclaredCutoff)
        || !date(source.sourceDeclaredCutoff.slice(0,10)) || !Number.isFinite(Date.parse(source.sourceDeclaredCutoff+'Z'))
        || new Date(source.sourceDeclaredCutoff+'Z').toISOString().slice(0,19) !== source.sourceDeclaredCutoff
        || source.reviewState !== 'historical_unreviewed' || source.documentAvailable !== false) schoolCertificateFail('CONTRACT_DRIFT');
      for (const [stateKey, dateKey] of [['presentationState','presentedOn'], ['expiryState','expiresOn']]) {
        if (!['valid','null','absent','invalid'].includes(source[stateKey])
          || (source[stateKey] === 'valid' ? !certificateDate(source[dateKey]) : source[dateKey] !== null)) schoolCertificateFail('CONTRACT_DRIFT');
      }
    }
    exact(effective, ['origin','presentedOn','expiresOn']);
    const chosen = base.certificate ?? source;
    if (effective.origin !== (base.certificate ? 'manual' : source ? 'grh_source' : 'none')
      || effective.presentedOn !== (chosen?.presentedOn ?? null) || effective.expiresOn !== (chosen?.expiresOn ?? null)) schoolCertificateFail('CONTRACT_DRIFT');
    return base;
  });
  validateSchoolCertificateReport({ ...data, version:'family-schooling.v3', rows:projected }, contractId, 3);
  return data;
}
export function validateNativeSchoolCertificateReport(data, contractId = null) {
  if (!data || data.version !== 'family-schooling.v5' || !Array.isArray(data.rows)) schoolCertificateFail('CONTRACT_DRIFT');
  const projected = data.rows.map(row => {
    if (!row || !['employeeOrigin', 'nativeRegistrationId', 'nativeRegisteredAt'].every(key => Object.hasOwn(row, key))) schoolCertificateFail('CONTRACT_DRIFT');
    const { employeeOrigin, nativeRegistrationId, nativeRegisteredAt, ...base } = row;
    if (employeeOrigin === 'MUNICONTROL') {
      if (!schoolCertificateUuid(nativeRegistrationId) || !timestamp(nativeRegisteredAt) || base.familyRef?.kind !== 'own'
        || base.sourceCutoff !== null || base.sourceSchooling !== null) schoolCertificateFail('CONTRACT_DRIFT');
    } else if (employeeOrigin !== 'GRH' || nativeRegistrationId !== null || nativeRegisteredAt !== null || !timestamp(base.sourceCutoff)) schoolCertificateFail('CONTRACT_DRIFT');
    return base;
  });
  validateSchoolCertificateSourceReport({ ...data, version: 'family-schooling.v4', rows: projected }, contractId);
  return data;
}
export async function readSchoolCertificates(sql, principal, session, contractId = null, { version = 1 } = {}) {
  if (![4, 5].includes(version)) certificateVersion(version);
  if (contractId !== null && !schoolCertificateContractId(contractId)) schoolCertificateFail('QUERY_INVALID');
  const id = contractId?.toLowerCase() ?? null;
  return validateSchoolCertificateReport(await schoolCertificateFacade(sql,
    `SELECT public.school_certificate_read_v${version}($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::uuid) AS result`,
    [...schoolCertificatePrincipalValues(principal, session), id]), id, version);
}
export async function registerSchoolCertificate(sql, principal, session, payload, key, { version = 1 } = {}) {
  certificateVersion(version);
  if (!schoolCertificateUuid(key)) schoolCertificateFail('IDEMPOTENCY_KEY_INVALID');
  const data = await schoolCertificateFacade(sql,
    `SELECT public.school_certificate_register_v${version}($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::jsonb,$8::text) AS result`,
    [...schoolCertificatePrincipalValues(principal, session), JSON.stringify(payload), key.toLowerCase()]);
  exact(data, ['version', 'certificateId', 'duplicate']);
  if (data.version !== `family-schooling-register.v${version}` || !schoolCertificateUuid(data.certificateId) || typeof data.duplicate !== 'boolean') schoolCertificateFail('CONTRACT_DRIFT');
  return data;
}
export async function downloadSchoolCertificate(sql, principal, session, certificateId, { version = 1 } = {}) {
  certificateVersion(version);
  if (!schoolCertificateUuid(certificateId)) schoolCertificateFail('QUERY_INVALID');
  const data = await schoolCertificateFacade(sql,
    `SELECT public.school_certificate_download_v${version}($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::uuid) AS result`,
    [...schoolCertificatePrincipalValues(principal, session), certificateId.toLowerCase()]);
  exact(data, ['version', 'filename', 'contentBase64', 'sha256', 'byteLength']);
  if (data.version !== `family-schooling-download.v${version}` || !filename(data.filename) || !count(data.byteLength) || data.byteLength < 1) schoolCertificateFail('CONTRACT_DRIFT');
  try { return { bytes: decodeSchoolCertificate(data.contentBase64, data.sha256, data.byteLength), filename: `certificado-escolar-${certificateId.toLowerCase()}.pdf` }; }
  catch { schoolCertificateFail('CONTRACT_DRIFT'); }
}
export function validateSchoolCertificateHistory(data, { contractId, familyRef, identityToken }) {
  exact(data, ['version', 'contractId', 'familyRef', 'identityToken', 'rows', 'total']);
  if (data.version !== 'family-schooling-history.v3' || data.contractId !== contractId || !schoolCertificateFamilyRef(data.familyRef)
    || data.familyRef.kind !== familyRef.kind || data.familyRef.id !== familyRef.id || data.identityToken !== identityToken
    || !Array.isArray(data.rows) || data.rows.length > 5000 || data.total !== data.rows.length) schoolCertificateFail('CONTRACT_DRIFT');
  const ids = new Map();
  for (const [index, row] of data.rows.entries()) {
    certificate(row, 3);
    if (ids.has(row.id.toLowerCase()) || index && (timestampMicros(row.recordedAt) > timestampMicros(data.rows[index - 1].recordedAt)
      || timestampMicros(row.recordedAt) === timestampMicros(data.rows[index - 1].recordedAt) && row.id.toLowerCase() > data.rows[index - 1].id.toLowerCase())) schoolCertificateFail('CONTRACT_DRIFT');
    ids.set(row.id.toLowerCase(), index);
  }
  for (const [index, row] of data.rows.entries()) if (row.supersedesId !== null && !(ids.get(row.supersedesId.toLowerCase()) > index)) schoolCertificateFail('CONTRACT_DRIFT');
  return data;
}
export async function readSchoolCertificateHistory(sql, principal, session, scope) {
  if (!schoolCertificateContractId(scope.contractId) || !schoolCertificateFamilyRef(scope.familyRef) || !hashString(scope.identityToken)) schoolCertificateFail('QUERY_INVALID');
  const normalized = { ...scope, contractId: scope.contractId.toLowerCase(), familyRef: { ...scope.familyRef, id: scope.familyRef.kind === 'own' ? scope.familyRef.id.toLowerCase() : scope.familyRef.id } };
  return validateSchoolCertificateHistory(await schoolCertificateFacade(sql,
    'SELECT public.school_certificate_history_v3($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::text,$10::text) AS result',
    [...schoolCertificatePrincipalValues(principal, session), normalized.contractId, normalized.familyRef.kind, normalized.familyRef.id, normalized.identityToken]), normalized);
}
export async function readSchoolCertificateAttempt(sql, principal, session, key) {
  if (!schoolCertificateUuid(key)) schoolCertificateFail('QUERY_INVALID');
  const data = await schoolCertificateFacade(sql,
    'SELECT public.school_certificate_attempt_v3($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text) AS result',
    [...schoolCertificatePrincipalValues(principal, session), key.toLowerCase()]);
  exact(data, ['version', 'certificateId', 'duplicate']);
  if (data.version !== 'family-schooling-register.v3' || !schoolCertificateUuid(data.certificateId) || data.duplicate !== true) schoolCertificateFail('CONTRACT_DRIFT');
  return data;
}
