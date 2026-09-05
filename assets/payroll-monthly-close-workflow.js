import {
  createPayrollMonthlyCloseApprovedPdf,
  downloadPayrollMonthlyCloseApprovedProof,
  isPayrollMonthlyCloseApprovedProofReady,
} from './payroll-monthly-close-approved-report.js';
import {
  createPayrollMonthlyCloseFolder,
  downloadPayrollMonthlyCloseFolder,
} from './payroll-monthly-close-folder.js';

export const PAYROLL_MONTHLY_CLOSE_API = '/api/internal-payroll-monthly-close';
export const PAYROLL_MONTHLY_CLOSE_CONTRACT = 'payroll-monthly-close-run.v1';
export const PAYROLL_MONTHLY_CLOSE_MAX_BYTES = 256 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MONTH = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const INTEGER = /^(?:0|-?[1-9][0-9]*)$/;
const REFERENCE = /^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOURCE_SPECS = Object.freeze({
  'grh-concept-statistics.v1': Object.freeze({
    sourceKind: 'grh_observed',
    label: 'Estadística de conceptos GRH',
  }),
  'bank-accreditation-summary.v1': Object.freeze({
    sourceKind: 'bank_control',
    label: 'Resumen de acreditación bancaria',
  }),
  'government-payroll-summary.v1': Object.freeze({
    sourceKind: 'government_control',
    label: 'Resumen agregado de control para Gobierno',
  }),
});

const GOVERNMENT_COMPARISON_LABELS = Object.freeze({
  earnings: 'Haberes informados',
  employer_contributions: 'Contribuciones patronales',
});

const STATUS_LABELS = Object.freeze({
  prepared: 'Preparada',
  submitted: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
});

const COMMAND_LABELS = Object.freeze({
  submit: 'Enviar a revisión',
  approve: 'Aprobar cierre',
  reject: 'Rechazar cierre',
  cancel: 'Cancelar corrida',
});

const COMMAND_REASONS = Object.freeze({
  submit: Object.freeze(['ready_for_review']),
  approve: Object.freeze(['approved_by_checker']),
  reject: Object.freeze(['source_mismatch', 'evidence_insufficient', 'period_not_ready']),
  cancel: Object.freeze(['cancelled_by_preparer']),
});

const MONTHLY_CAPABILITIES = new Set([
  'payroll.monthly_close.read',
  'payroll.monthly_close.prepare',
  'payroll.monthly_close.approve',
  'payroll.monthly_close.audit.read',
]);

const SAFE_FALSE_FLAGS = Object.freeze([
  'includesPersonalRecords',
  'rawContentStored',
  'grhMutation',
  'payrollCalculated',
  'payrollPosted',
  'bankArtifactGenerated',
  'governmentArtifactGenerated',
  'fiscalArtifactGenerated',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function isIntegerString(value) {
  return typeof value === 'string' && INTEGER.test(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function hasExactSourceDefinitions(value) {
  const keys = Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : item?.definitionKey))
    : isObject(value) ? Object.keys(value) : [];
  return keys.length === 3
    && new Set(keys).size === 3
    && keys.every((key) => Object.hasOwn(SOURCE_SPECS, key));
}

export function validateMonthlyCloseFlags(flags, status = null) {
  if (!isObject(flags) || SAFE_FALSE_FLAGS.some((key) => flags[key] !== false)
      || typeof flags.closeApproved !== 'boolean') return false;
  return status === null || flags.closeApproved === (status === 'approved');
}

function validateTotals(totals) {
  return isObject(totals)
    && isIntegerString(totals.reportedEarningsLessRetentionsCents)
    && isIntegerString(totals.reportedBankNetCents)
    && isIntegerString(totals.differenceCents);
}

function validateGovernmentComparisons(comparisons) {
  if (!Array.isArray(comparisons) || comparisons.length !== 2) return false;
  const keys = new Set();
  for (const comparison of comparisons) {
    if (!isObject(comparison)
        || !Object.hasOwn(GOVERNMENT_COMPARISON_LABELS, comparison.comparisonKey)
        || keys.has(comparison.comparisonKey)
        || !isIntegerString(comparison.reportedGrhCents)
        || (comparison.reportedGovernmentCents !== null
          && !isIntegerString(comparison.reportedGovernmentCents))
        || (comparison.differenceCents !== null
          && !isIntegerString(comparison.differenceCents))
        || typeof comparison.matches !== 'boolean') return false;
    keys.add(comparison.comparisonKey);
  }
  return keys.size === 2;
}

function validateCommands(commands) {
  return Array.isArray(commands)
    && new Set(commands).size === commands.length
    && commands.every((command) => Object.hasOwn(COMMAND_LABELS, command));
}

export function validatePayrollMonthlyCloseRun(run, detail = false) {
  if (!isObject(run) || !isUuid(run.id) || !Object.hasOwn(STATUS_LABELS, run.status)
      || !Number.isInteger(run.version) || run.version < 1
      || !MONTH.test(run.period) || !['42', '55'].includes(String(run.jurisdiction))
      || !SHA256.test(run.sourceSetSha256)
      || !validateTotals(run.totals)
      || run.sourceCount !== 3
      || !isNonNegativeInteger(run.mismatchCount)
      || !isNonNegativeInteger(run.blockingIssueCount)
      || run.closeApproved !== (run.status === 'approved')) return false;
  if (!detail) return true;
  return validatePayrollMonthlyCloseEvidenceRun(run)
    && validateCommands(run.allowedCommands);
}

function validatePayrollMonthlyCloseEvidenceRun(run) {
  return validatePayrollMonthlyCloseRun(run)
    && Array.isArray(run.sources) && run.sources.length === 3
    && Array.isArray(run.timeline)
    && isObject(run.reconciliation)
    && Array.isArray(run.reconciliation.comparisons)
    && validateGovernmentComparisons(run.reconciliation.governmentComparisons);
}

function validatePrincipal(principal) {
  return isObject(principal)
    && isUuid(principal.tenantId)
    && isUuid(principal.membershipId)
    && isUuid(principal.certifiedBindingId)
    && typeof principal.roleKey === 'string' && principal.roleKey.length > 0
    && typeof principal.employmentLinked === 'boolean'
    && Array.isArray(principal.capabilities)
    && principal.capabilities.includes('payroll.monthly_close.read')
    && new Set(principal.capabilities).size === principal.capabilities.length
    && principal.capabilities.every((capability) => MONTHLY_CAPABILITIES.has(capability));
}

function validateLimits(limits) {
  return isObject(limits)
    && limits.contractVersion === PAYROLL_MONTHLY_CLOSE_CONTRACT
    && limits.maxSourceBytes === PAYROLL_MONTHLY_CLOSE_MAX_BYTES
    && hasExactSourceDefinitions(limits.sourceContracts)
    && Array.isArray(limits.jurisdictions)
    && limits.jurisdictions.length === 2
    && limits.jurisdictions.includes('42')
    && limits.jurisdictions.includes('55');
}

export function validatePayrollMonthlyCloseBootstrap(payload) {
  if (!isObject(payload) || payload.ok !== true || !isObject(payload.data)) return false;
  const { principal, limits, runs, recentEvents, flags } = payload.data;
  return validatePrincipal(principal)
    && validateLimits(limits)
    && Array.isArray(runs) && runs.every((run) => validatePayrollMonthlyCloseRun(run))
    && Array.isArray(recentEvents)
    && validateMonthlyCloseFlags(flags);
}

export function validatePayrollMonthlyCloseList(payload) {
  if (!isObject(payload) || payload.ok !== true || !isObject(payload.data)) return false;
  const { runs, page, limit, total, flags } = payload.data;
  return Array.isArray(runs) && runs.every((run) => validatePayrollMonthlyCloseRun(run))
    && Number.isInteger(page) && page >= 1
    && Number.isInteger(limit) && limit >= 1
    && isNonNegativeInteger(total)
    && validateMonthlyCloseFlags(flags);
}

export function validatePayrollMonthlyCloseDetail(payload) {
  return isObject(payload) && payload.ok === true && isObject(payload.data)
    && validatePayrollMonthlyCloseRun(payload.data.run, true)
    && validateMonthlyCloseFlags(payload.data.flags, payload.data.run.status);
}

export function validatePayrollMonthlyCloseMutationEnvelope(payload, requireReplay = false) {
  if (!isObject(payload) || payload.ok !== true || typeof payload.replayed !== 'boolean'
      || !isObject(payload.data) || typeof payload.data.replayed !== 'boolean'
      || payload.replayed !== payload.data.replayed
      || (requireReplay && payload.replayed !== true)
      || !Number.isSafeInteger(payload.data.eventId) || payload.data.eventId < 1
      || !SHA256.test(String(payload.data.eventSha256 || ''))
      || !validatePayrollMonthlyCloseEvidenceRun(payload.data.run)
      || !validateMonthlyCloseFlags(payload.data.flags, payload.data.run.status)) return false;
  return payload.data.run.timeline.some((event) => (
    isObject(event)
    && event.id === payload.data.eventId
    && event.eventSha256 === payload.data.eventSha256
  ));
}

export function formatPayrollMonthlyCloseAmount(value) {
  if (!isIntegerString(String(value))) return 'No disponible';
  const cents = BigInt(String(value));
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '- ' : ''}$ ${whole},${fraction}`;
}

export function describePayrollMonthlyCloseReconciliation(run) {
  const amountsMatch = isObject(run)
    && run.totals?.differenceCents === '0'
    && run.mismatchCount === 0;
  if (amountsMatch && run.blockingIssueCount === 0) {
    return { label: 'Coincidencia exacta', state: 'matched' };
  }
  if (amountsMatch) {
    return { label: 'Montos coinciden; evidencia incompleta', state: 'blocked' };
  }
  return { label: 'Bloqueado por diferencias', state: 'blocked' };
}

function validPreparedSources(sources) {
  return Array.isArray(sources) && sources.length === 3
    && new Set(sources.map((source) => source?.definitionKey)).size === 3
    && sources.every((source) => {
      const spec = isObject(source) ? SOURCE_SPECS[source.definitionKey] : null;
      return spec && source.sourceKind === spec.sourceKind
        && typeof source.contentBase64 === 'string' && source.contentBase64.length > 0
        && Object.keys(source).length === 3;
    });
}

export function buildPayrollMonthlyCloseMutation(command, input) {
  if (!Object.hasOwn(COMMAND_REASONS, command) || !isObject(input)) return null;
  if (command === 'prepare') return null;
  const reasonCode = input.reasonCode;
  if (!isUuid(input.runId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1
      || !COMMAND_REASONS[command].includes(reasonCode)
      || !REFERENCE.test(input.reasonReference)
      || Object.keys(input).some((key) => !['runId', 'expectedVersion', 'reasonCode', 'reasonReference'].includes(key))) return null;
  return { command, payload: { ...input } };
}

export function buildPayrollMonthlyClosePrepareMutation(input) {
  if (!isObject(input) || !MONTH.test(input.period)
      || !['42', '55'].includes(String(input.jurisdiction))
      || !validPreparedSources(input.sources)
      || Object.keys(input).some((key) => !['period', 'jurisdiction', 'sources'].includes(key))) return null;
  return {
    command: 'prepare',
    payload: {
      period: input.period,
      jurisdiction: String(input.jurisdiction),
      sources: input.sources.map((source) => ({ ...source })),
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function attemptError(message, outcome = 'ambiguous') {
  const error = new Error(message);
  error.payrollMonthlyCloseOutcome = outcome;
  return error;
}

function pendingAttemptError() {
  const error = attemptError(
    'Hay una operación anterior sin confirmación definitiva. Reintentá esa misma operación antes de iniciar otra.',
    'pending',
  );
  error.code = 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_PENDING';
  return error;
}

/**
 * Mantiene en memoria una sola mutación hasta obtener una respuesta definitiva.
 * Nunca persiste archivos ni payloads en storage del navegador.
 */
export function createPayrollMonthlyCloseAttemptManager(options = {}) {
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  let pending = null;

  function snapshot() {
    return pending ? cloneJson(pending) : null;
  }

  function begin(mutation, metadata = {}) {
    if (!isObject(mutation) || typeof mutation.command !== 'string' || !isObject(mutation.payload)) {
      throw attemptError('La operación no cumple el contrato del cierre mensual.', 'definitive');
    }
    const signature = canonicalJson(mutation);
    const metadataSignature = canonicalJson(metadata);
    if (pending) {
      if (pending.signature !== signature || pending.metadataSignature !== metadataSignature) {
        throw pendingAttemptError();
      }
      return pending;
    }
    const idempotencyKey = cryptoImpl?.randomUUID?.();
    if (!isUuid(idempotencyKey) || idempotencyKey[14]?.toLowerCase() !== '4') {
      throw attemptError('No se pudo crear una clave segura para registrar la operación.', 'definitive');
    }
    pending = {
      mutation: cloneJson(mutation),
      metadata: cloneJson(metadata),
      signature,
      metadataSignature,
      idempotencyKey,
      phase: 'ready',
    };
    return pending;
  }

  async function execute({ mutation, metadata = {}, send, reconcile }) {
    if (typeof send !== 'function' || typeof reconcile !== 'function') {
      throw attemptError('No se pudo verificar la operación del cierre mensual.', 'definitive');
    }
    const attempt = begin(mutation, metadata);
    attempt.phase = 'sending';
    try {
      const result = await send(cloneJson(attempt.mutation), attempt.idempotencyKey);
      const idempotencyKey = attempt.idempotencyKey;
      pending = null;
      return { result, recovered: false, idempotencyKey };
    } catch (error) {
      if (error?.payrollMonthlyCloseOutcome === 'definitive') {
        pending = null;
        throw error;
      }
      attempt.phase = 'reconciling';
      let resolution;
      try {
        resolution = await reconcile(snapshot());
      } catch {
        attempt.phase = 'retry';
        throw attemptError(
          'No se recibió confirmación y todavía no fue posible verificar el estado. Reintentá: se conservarán exactamente la misma operación y la misma clave.',
        );
      }
      if (resolution?.outcome === 'committed' && resolution.result) {
        const idempotencyKey = attempt.idempotencyKey;
        pending = null;
        return { result: resolution.result, recovered: true, idempotencyKey };
      }
      if (resolution?.outcome === 'superseded') {
        pending = null;
        throw attemptError(
          resolution.message || 'El cierre cambió mientras se verificaba la operación. Revisá el estado vigente antes de continuar.',
          'definitive',
        );
      }
      attempt.phase = 'retry';
      throw attemptError(
        'No se recibió confirmación, pero el estado sigue sin cambios. Reintentá: se conservarán exactamente la misma operación y la misma clave.',
      );
    }
  }

  return { execute, getPending: snapshot };
}

export function buildPayrollMonthlyCloseTransitionAttempt({
  command,
  run,
  reasonCode,
  attemptManager,
  cryptoImpl = globalThis.crypto,
}) {
  if (!isObject(run) || typeof attemptManager?.getPending !== 'function') return null;
  const metadata = {
    kind: 'transition',
    command,
    runId: run.id,
    expectedVersion: run.version,
    fromStatus: run.status,
    reasonCode,
  };
  const pendingAttempt = attemptManager.getPending();
  if (pendingAttempt) {
    if (pendingAttempt.metadataSignature !== canonicalJson(metadata)) throw pendingAttemptError();
    return {
      mutation: pendingAttempt.mutation,
      metadata: pendingAttempt.metadata,
    };
  }
  const mutation = buildPayrollMonthlyCloseMutation(command, {
    runId: run.id,
    expectedVersion: run.version,
    reasonCode,
    reasonReference: `ref:${cryptoImpl?.randomUUID?.()}`,
  });
  return mutation ? { mutation, metadata } : null;
}

export function resolvePayrollMonthlyCloseAttemptLookup({ attempt, payload = null, errorCode = '' }) {
  if (errorCode === 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND') {
    return { outcome: 'unchanged' };
  }
  if ([
    'PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED',
    'PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED',
    'PAYROLL_MONTHLY_CLOSE_COMMAND_FORBIDDEN',
    'PAYROLL_MONTHLY_CLOSE_TENANT_MEMBERSHIP_REQUIRED',
  ].includes(errorCode)) {
    return {
      outcome: 'superseded',
      message: 'La autoridad o el contexto certificado cambió. Volvé a ingresar y revisá el cierre vigente.',
    };
  }
  if (!isObject(attempt) || !isObject(attempt.mutation)
      || !validatePayrollMonthlyCloseMutationEnvelope(payload, true)) {
    return { outcome: 'unresolved' };
  }
  const { mutation, metadata } = attempt;
  const run = payload.data.run;
  const event = run.timeline.find((item) => item?.id === payload.data.eventId);
  if (!event || event.command !== mutation.command) return { outcome: 'unresolved' };
  if (mutation.command === 'prepare') {
    if (event.fromStatus !== null || event.toStatus !== 'prepared'
        || event.expectedVersion !== 0 || event.resultingVersion !== 1
        || event.reasonCode !== 'sources_prepared' || event.reasonReference !== null
        || run.period !== mutation.payload.period
        || String(run.jurisdiction) !== String(mutation.payload.jurisdiction)) {
      return { outcome: 'unresolved' };
    }
  } else {
    const targetStatus = {
      submit: 'submitted', approve: 'approved', reject: 'rejected', cancel: 'cancelled',
    }[mutation.command];
    if (run.id !== mutation.payload.runId
        || event.fromStatus !== metadata?.fromStatus
        || event.toStatus !== targetStatus
        || event.expectedVersion !== mutation.payload.expectedVersion
        || event.resultingVersion !== mutation.payload.expectedVersion + 1
        || event.reasonCode !== mutation.payload.reasonCode
        || event.reasonReference !== mutation.payload.reasonReference) {
      return { outcome: 'unresolved' };
    }
  }
  return { outcome: 'committed', result: payload };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function readMonthlyCloseAggregateFile(file, FileReaderImpl = globalThis.FileReader) {
  return new Promise((resolve, reject) => {
    if (!file || !Number.isInteger(file.size) || file.size < 1
        || file.size > PAYROLL_MONTHLY_CLOSE_MAX_BYTES || typeof FileReaderImpl !== 'function') {
      reject(new Error('Cada fuente debe pesar entre 1 byte y 256 KiB.'));
      return;
    }
    const reader = new FileReaderImpl();
    reader.onerror = () => reject(new Error('No se pudo leer una de las fuentes agregadas.'));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('La fuente agregada no pudo convertirse al contrato requerido.'));
        return;
      }
      resolve(bytesToBase64(new Uint8Array(reader.result)));
    };
    reader.readAsArrayBuffer(file);
  });
}

function safeDate(value) {
  if (typeof value !== 'string') return 'No informado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return 'No informado';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Mendoza',
  }).format(parsed);
}

function stateClass(status) {
  if (status === 'approved') return 'closed';
  if (status === 'rejected' || status === 'cancelled') return 'blocked';
  return 'warning';
}

function eventReasonLabel(value) {
  return ({
    ready_for_review: 'Lista para revisión',
    approved_by_checker: 'Aprobada por control independiente',
    source_mismatch: 'Las fuentes no coinciden',
    evidence_insufficient: 'Evidencia insuficiente',
    period_not_ready: 'Período no disponible para cierre',
    cancelled_by_preparer: 'Cancelada por quien preparó',
  })[value] || 'Motivo controlado no informado';
}

export function createPayrollMonthlyCloseWorkflow(root, options = {}) {
  if (!root) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const locationImpl = options.locationImpl || globalThis.location;
  const FileReaderImpl = options.FileReaderImpl || globalThis.FileReader;
  const createApprovedPdf = options.createApprovedPdf || createPayrollMonthlyCloseApprovedPdf;
  const downloadApprovedProof = options.downloadApprovedProof || downloadPayrollMonthlyCloseApprovedProof;
  const createApprovedFolder = options.createApprovedFolder || createPayrollMonthlyCloseFolder;
  const saveApprovedFolder = options.downloadApprovedFolder || downloadPayrollMonthlyCloseFolder;
  const nodes = {
    status: root.querySelector('[data-monthly-workflow-status]'),
    role: root.querySelector('[data-monthly-workflow-role]'),
    scope: root.querySelector('[data-monthly-workflow-scope]'),
    preparePanel: root.querySelector('[data-monthly-workflow-prepare-panel]'),
    form: root.querySelector('[data-monthly-workflow-form]'),
    period: root.querySelector('[data-monthly-workflow-period]'),
    jurisdiction: root.querySelector('[data-monthly-workflow-jurisdiction]'),
    files: [...root.querySelectorAll('[data-monthly-workflow-file]')],
    fileStates: [...root.querySelectorAll('[data-monthly-workflow-file-state]')],
    refresh: root.querySelector('[data-monthly-workflow-refresh]'),
    runs: root.querySelector('[data-monthly-workflow-runs]'),
    empty: root.querySelector('[data-monthly-workflow-empty]'),
    detail: root.querySelector('[data-monthly-workflow-detail]'),
    detailTitle: root.querySelector('[data-monthly-workflow-detail-title]'),
    detailMeta: root.querySelector('[data-monthly-workflow-detail-meta]'),
    reconciliation: root.querySelector('[data-monthly-workflow-reconciliation]'),
    governmentReconciliation: root.querySelector('[data-monthly-workflow-government-reconciliation]'),
    totalConcepts: root.querySelector('[data-monthly-workflow-total-concepts]'),
    totalBank: root.querySelector('[data-monthly-workflow-total-bank]'),
    totalDifference: root.querySelector('[data-monthly-workflow-total-difference]'),
    totalState: root.querySelector('[data-monthly-workflow-total-state]'),
    sources: root.querySelector('[data-monthly-workflow-sources]'),
    events: root.querySelector('[data-monthly-workflow-events]'),
    rejectField: root.querySelector('[data-monthly-workflow-reject-field]'),
    rejectReason: root.querySelector('[data-monthly-workflow-reject-reason]'),
    actions: root.querySelector('[data-monthly-workflow-actions]'),
    actionStatus: root.querySelector('[data-monthly-workflow-action-status]'),
    approvedProof: root.querySelector('[data-monthly-workflow-approved-proof]'),
    approvedProofDownload: root.querySelector('[data-monthly-workflow-approved-proof-download]'),
    folderDownload: root.querySelector('[data-monthly-workflow-folder-download]'),
    approvedProofStatus: root.querySelector('[data-monthly-workflow-approved-proof-status]'),
  };
  const state = { bootstrap: null, selectedId: null, detail: null, busy: false };
  const attempts = createPayrollMonthlyCloseAttemptManager({ cryptoImpl });

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, input, select').forEach((node) => { node.disabled = value; });
    if (!value) {
      const ready = isPayrollMonthlyCloseApprovedProofReady(state.detail);
      if (nodes.approvedProofDownload) nodes.approvedProofDownload.disabled = !ready;
      if (nodes.folderDownload) nodes.folderDownload.disabled = !ready;
    }
  }

  function redirectToLogin() {
    const next = `${locationImpl.pathname.split('/').pop() || 'nomina-control.html'}${locationImpl.hash || ''}`;
    locationImpl.replace(`login.html?next=${encodeURIComponent(next)}`);
  }

  async function api(url, init, { preserveSession = false } = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        credentials: 'same-origin',
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers || {}) },
      });
    } catch {
      throw attemptError('No se recibió confirmación del servidor.');
    }
    if (response.status === 401) {
      if (!preserveSession) redirectToLogin();
      throw attemptError(preserveSession
        ? 'La sesión venció. Iniciá sesión en otra pestaña y reintentá; los datos de esta pantalla se conservaron.'
        : 'La sesión venció.', 'definitive');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isObject(payload) || payload.ok !== true) {
      const messages = {
        PAYROLL_MONTHLY_CLOSE_COMMAND_FORBIDDEN: 'Tu sesión no tiene permiso para esta operación.',
        PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED: 'Tu sesión no tiene permiso para esta operación.',
        PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED: 'Quien preparó el cierre no puede aprobarlo ni rechazarlo.',
        PAYROLL_MONTHLY_CLOSE_PREPARER_REQUIRED: 'Sólo quien preparó esta corrida puede enviarla o cancelarla.',
        PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT: 'La corrida cambió. Actualizá antes de decidir.',
        PAYROLL_MONTHLY_CLOSE_NOT_FOUND: 'La corrida ya no está disponible en este contexto.',
        PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL: 'Hay diferencias de uno o más centavos; la aprobación permanece bloqueada.',
        PAYROLL_MONTHLY_CLOSE_BLOCKING_ISSUES: 'El cierre conserva controles bloqueantes que deben resolverse.',
        PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID: 'Las tres fuentes no cumplen el contrato del cierre mensual.',
        PAYROLL_MONTHLY_CLOSE_DUPLICATE_RUN: 'Ya existe un cierre activo para ese período y jurisdicción.',
        MONTHLY_CLOSE_SOURCE_INVALID: 'Una fuente no cumple su contrato agregado.',
        MONTHLY_CLOSE_PRECHECK_SOURCE_MISSING: 'Debés aportar exactamente las tres fuentes agregadas.',
        MONTHLY_CLOSE_PRECHECK_CONTEXT_MISMATCH: 'Las fuentes no comparten período, jurisdicción y versión certificada.',
      };
      const mutationMayHaveCommitted = init?.method === 'POST'
        && (response.ok || response.status >= 500);
      const serverError = attemptError(
        messages[payload?.code] || 'No se pudo completar la operación en el servidor.',
        mutationMayHaveCommitted ? 'ambiguous' : 'definitive',
      );
      serverError.code = typeof payload?.code === 'string' ? payload.code : '';
      serverError.httpStatus = response.status;
      throw serverError;
    }
    return payload;
  }

  function resetFileStates() {
    nodes.fileStates.forEach((node) => {
      node.textContent = 'No seleccionado.';
      node.dataset.state = '';
    });
  }

  function renderMeta(run) {
    nodes.detailMeta.replaceChildren();
    [
      ['Estado', STATUS_LABELS[run.status]],
      ['Versión', String(run.version)],
      ['Período y jurisdicción', `${run.period} · J${run.jurisdiction}`],
      ['Fuentes agregadas', `${run.sourceCount} de 3`],
      ['Diferencias', String(run.mismatchCount)],
      ['Bloqueos', String(run.blockingIssueCount)],
      ['Huella del conjunto', `${run.sourceSetSha256.slice(0, 18)}…`],
      ['Cierre aprobado', run.closeApproved ? 'Sí, por una identidad revisora' : 'No'],
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      const span = document.createElement('span');
      strong.textContent = label;
      span.textContent = value;
      item.append(strong, span);
      nodes.detailMeta.append(item);
    });
  }

  function renderReconciliation(run) {
    nodes.reconciliation.replaceChildren();
    nodes.governmentReconciliation.replaceChildren();
    run.reconciliation.comparisons.forEach((comparison) => {
      const row = document.createElement('tr');
      const cells = [
        comparison.repartitionCode,
        formatPayrollMonthlyCloseAmount(comparison.reportedEarningsLessRetentionsCents),
        formatPayrollMonthlyCloseAmount(comparison.reportedBankNetCents),
        comparison.differenceCents === null ? 'No comparable' : formatPayrollMonthlyCloseAmount(comparison.differenceCents),
        comparison.matches ? 'Coincidencia exacta' : 'Revisar diferencia',
      ];
      cells.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if ([1, 2, 3].includes(index)) cell.className = 'numeric';
        if (index === 4) cell.dataset.state = comparison.matches ? 'matched' : 'blocked';
        row.append(cell);
      });
      nodes.reconciliation.append(row);
    });
    run.reconciliation.governmentComparisons.forEach((comparison) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      const span = document.createElement('span');
      const governmentValue = comparison.reportedGovernmentCents === null
        ? 'No informado'
        : formatPayrollMonthlyCloseAmount(comparison.reportedGovernmentCents);
      const differenceValue = comparison.differenceCents === null
        ? 'No comparable'
        : formatPayrollMonthlyCloseAmount(comparison.differenceCents);
      strong.textContent = GOVERNMENT_COMPARISON_LABELS[comparison.comparisonKey];
      span.textContent = `GRH ${formatPayrollMonthlyCloseAmount(comparison.reportedGrhCents)} · Gobierno ${governmentValue} · Diferencia ${differenceValue} · ${comparison.matches ? 'Coincidencia exacta' : 'Bloqueado'}`;
      item.dataset.state = comparison.matches ? 'matched' : 'blocked';
      item.append(strong, span);
      nodes.governmentReconciliation.append(item);
    });
    nodes.totalConcepts.textContent = formatPayrollMonthlyCloseAmount(run.totals.reportedEarningsLessRetentionsCents);
    nodes.totalBank.textContent = formatPayrollMonthlyCloseAmount(run.totals.reportedBankNetCents);
    nodes.totalDifference.textContent = formatPayrollMonthlyCloseAmount(run.totals.differenceCents);
    const overall = describePayrollMonthlyCloseReconciliation(run);
    nodes.totalState.textContent = overall.label;
    nodes.totalState.dataset.state = overall.state;
  }

  function renderSources(run) {
    nodes.sources.replaceChildren();
    run.sources.forEach((source) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      const span = document.createElement('span');
      strong.textContent = SOURCE_SPECS[source.definitionKey]?.label || 'Fuente agregada';
      const fingerprint = typeof source.contentHmacSha256 === 'string'
        ? `${source.contentHmacSha256.slice(0, 16)}…` : 'Huella no informada';
      span.textContent = `${source.recordCount ?? '—'} registros · ${source.byteLength ?? '—'} bytes · ${fingerprint}`;
      item.append(strong, span);
      nodes.sources.append(item);
    });
  }

  function renderEvents(run) {
    nodes.events.replaceChildren();
    if (!run.timeline.length) {
      const item = document.createElement('li');
      item.textContent = 'El historial ampliado no está habilitado para esta sesión.';
      nodes.events.append(item);
      return;
    }
    run.timeline.forEach((event) => {
      const item = document.createElement('li');
      const strong = document.createElement('strong');
      const span = document.createElement('span');
      strong.textContent = `${COMMAND_LABELS[event.command] || event.command || 'Evento'} · ${safeDate(event.occurredAt)}`;
      span.textContent = `${event.actorRoleKey || 'Rol no informado'} · v${event.resultingVersion || '—'} · ${eventReasonLabel(event.reasonCode)}`;
      item.append(strong, span);
      nodes.events.append(item);
    });
  }

  async function detailForReconciliation(id) {
    const payload = await api(`${PAYROLL_MONTHLY_CLOSE_API}?resource=detail&id=${encodeURIComponent(id)}`);
    if (!validatePayrollMonthlyCloseDetail(payload)) {
      throw attemptError('El estado consultado no cumple el contrato de cierre mensual.');
    }
    state.selectedId = id;
    renderDetail(payload.data.run);
    return payload;
  }

  async function refreshAfterUnconfirmedAttempt(attempt) {
    if (attempt?.metadata?.kind === 'transition' && isUuid(attempt.metadata.runId)) {
      const payload = await detailForReconciliation(attempt.metadata.runId);
      return payload.data.run;
    }
    const payload = await api(`${PAYROLL_MONTHLY_CLOSE_API}?resource=bootstrap`);
    if (!validatePayrollMonthlyCloseBootstrap(payload)) {
      throw attemptError('La bandeja consultada no cumple el contrato de cierre mensual.');
    }
    state.bootstrap = payload.data;
    renderScope(payload.data);
    renderRuns(payload.data.runs);
    return null;
  }

  async function reconcileAttemptByKey(attempt) {
    let payload = null;
    let lookupError = null;
    try {
      payload = await api(`${PAYROLL_MONTHLY_CLOSE_API}?resource=attempt`, {
        headers: {
          'Idempotency-Key': attempt.idempotencyKey,
          'X-MuniControl-Command': attempt.mutation.command,
        },
      });
    } catch (error) {
      lookupError = error;
    }
    const resolution = resolvePayrollMonthlyCloseAttemptLookup({
      attempt,
      payload,
      errorCode: lookupError?.code || '',
    });
    if (resolution.outcome === 'committed') return resolution;
    if (resolution.outcome === 'superseded') {
      try {
        await refreshAfterUnconfirmedAttempt(attempt);
      } catch {
        // El cambio de contexto ya es definitivo aunque el refresco visual no responda.
      }
      return resolution;
    }
    let refreshedRun = null;
    try {
      refreshedRun = await refreshAfterUnconfirmedAttempt(attempt);
    } catch (refreshError) {
      throw lookupError || refreshError;
    }
    if (resolution.outcome === 'unchanged'
        && attempt.metadata?.kind === 'transition'
        && refreshedRun
        && (refreshedRun.version !== attempt.metadata.expectedVersion
          || refreshedRun.status !== attempt.metadata.fromStatus)) {
      return {
        outcome: 'superseded',
        message: 'La decisión pendiente no fue registrada y otra operación cambió la corrida. Se mostró el estado vigente.',
      };
    }
    if (lookupError && resolution.outcome !== 'unchanged') throw lookupError;
    return resolution;
  }

  async function runCommand(command) {
    const run = state.detail;
    if (state.busy || !run || !run.allowedCommands.includes(command)) return;
    let transitionAttempt;
    try {
      transitionAttempt = buildPayrollMonthlyCloseTransitionAttempt({
        command,
        run,
        reasonCode: command === 'reject' ? nodes.rejectReason.value : COMMAND_REASONS[command][0],
        attemptManager: attempts,
        cryptoImpl,
      });
    } catch (error) {
      nodes.actionStatus.textContent = error instanceof Error ? error.message : 'No se pudo iniciar la decisión.';
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    if (!transitionAttempt) {
      nodes.actionStatus.textContent = 'La decisión no cumple el contrato vigente.';
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    setBusy(true);
    nodes.actionStatus.textContent = 'Registrando la decisión con control de versión…';
    nodes.actionStatus.dataset.state = 'warning';
    try {
      const execution = await attempts.execute({
        mutation: transitionAttempt.mutation,
        metadata: transitionAttempt.metadata,
        send: async (stableMutation, idempotencyKey) => {
          const payload = await api(PAYROLL_MONTHLY_CLOSE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(stableMutation),
          });
          if (!validatePayrollMonthlyCloseMutationEnvelope(payload)) {
            throw attemptError('La decisión no devolvió un cierre verificable.');
          }
          return payload;
        },
        reconcile: reconcileAttemptByKey,
      });
      const payload = execution.result;
      state.selectedId = payload.data.run.id;
      await load({
        selectedId: state.selectedId,
        announce: execution.recovered
          ? `${COMMAND_LABELS[command]} confirmada al reconciliar el estado del servidor.`
          : `${COMMAND_LABELS[command]} registrada con trazabilidad.`,
      });
    } catch (error) {
      nodes.actionStatus.textContent = error instanceof Error ? error.message : 'No se pudo registrar la decisión.';
      nodes.actionStatus.dataset.state = 'error';
    } finally {
      setBusy(false);
    }
  }

  function renderActions(run) {
    nodes.actions.replaceChildren();
    nodes.rejectField.hidden = !run.allowedCommands.includes('reject');
    run.allowedCommands.forEach((command) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button${command === 'submit' || command === 'approve' ? ' primary' : ''}${command === 'reject' ? ' danger' : ''}`;
      button.dataset.monthlyWorkflowCommand = command;
      button.textContent = COMMAND_LABELS[command];
      button.addEventListener('click', () => runCommand(command));
      nodes.actions.append(button);
    });
    nodes.actionStatus.textContent = run.allowedCommands.length
      ? 'El servidor habilitó únicamente las decisiones visibles para esta sesión.'
      : 'Esta identidad puede consultar el cierre, sin decisiones habilitadas.';
    nodes.actionStatus.dataset.state = run.allowedCommands.length ? 'ok' : 'warning';
  }

  function renderApprovedProof(run) {
    if (!nodes.approvedProof || !nodes.approvedProofDownload || !nodes.approvedProofStatus) return;
    const ready = isPayrollMonthlyCloseApprovedProofReady(run);
    nodes.approvedProof.hidden = !ready;
    nodes.approvedProofDownload.disabled = !ready;
    if (nodes.folderDownload) nodes.folderDownload.disabled = !ready;
    nodes.approvedProofStatus.textContent = ready
      ? 'Respaldo disponible. Antes de descargar se volverán a consultar el cierre y los permisos de esta sesión.'
      : 'El respaldo requiere un cierre aprobado y conciliado, con evidencia de aprobación disponible para esta sesión.';
    nodes.approvedProofStatus.dataset.state = ready ? 'ok' : 'warning';
  }

  async function downloadApprovedOutput(format) {
    if (state.busy || !state.detail || !nodes.approvedProofDownload || !nodes.approvedProofStatus) return;
    if (!isPayrollMonthlyCloseApprovedProofReady(state.detail)) return;
    const displayedRun = state.detail;
    setBusy(true);
    nodes.approvedProofStatus.textContent = 'Confirmando el cierre y los permisos antes de descargar…';
    nodes.approvedProofStatus.dataset.state = 'warning';
    try {
      const payload = await api(
        `${PAYROLL_MONTHLY_CLOSE_API}?resource=detail&id=${encodeURIComponent(displayedRun.id)}`,
        { cache: 'no-store' },
        { preserveSession: true },
      );
      if (!validatePayrollMonthlyCloseDetail(payload)) {
        throw new Error('No se pudo verificar el detalle vigente. Actualizá el cierre antes de descargar.');
      }
      const freshRun = payload.data.run;
      const sameReference = ['id', 'version', 'period', 'jurisdiction', 'sourceSetSha256']
        .every((key) => String(freshRun[key]) === String(displayedRun[key]));
      if (!sameReference || state.detail !== displayedRun) {
        throw new Error('El cierre cambió respecto de la vista abierta. Actualizá y revisá la corrida antes de descargar.');
      }
      if (!isPayrollMonthlyCloseApprovedProofReady(freshRun)) {
        throw new Error('El cierre vigente no tiene una aprobación conciliada y verificable para esta sesión. Actualizá para revisar su estado.');
      }
      const artifact = format === 'folder' ? createApprovedFolder(freshRun) : createApprovedPdf(freshRun);
      const fileName = format === 'folder' ? saveApprovedFolder(artifact) : downloadApprovedProof(artifact);
      state.detail = freshRun;
      nodes.approvedProofStatus.textContent = format === 'folder'
        ? `Descarga de la carpeta de respaldo iniciada: ${fileName}. No es la carpeta mensual completa ni una presentación.`
        : `Descarga de la copia local iniciada: ${fileName}`;
      nodes.approvedProofStatus.dataset.state = 'ok';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar la descarga.';
      nodes.approvedProofStatus.textContent = `${message} Conservamos los datos de esta pantalla. Revisá las descargas del navegador antes de reintentar.`;
      nodes.approvedProofStatus.dataset.state = 'error';
    } finally {
      setBusy(false);
    }
  }

  function downloadApprovedReport() { return downloadApprovedOutput('pdf'); }
  function downloadApprovedFolder() { return downloadApprovedOutput('folder'); }

  function renderDetail(run) {
    state.detail = run;
    nodes.detail.hidden = false;
    nodes.detailTitle.textContent = `Cierre ${run.period} · Jurisdicción ${run.jurisdiction}`;
    renderMeta(run);
    renderReconciliation(run);
    renderSources(run);
    renderEvents(run);
    renderActions(run);
    renderApprovedProof(run);
  }

  async function loadDetail(id, options = {}) {
    if (!isUuid(id)) return;
    if (!options.keepBusy) setBusy(true);
    nodes.actionStatus.textContent = 'Consultando detalle y permisos vigentes…';
    nodes.actionStatus.dataset.state = 'warning';
    try {
      const payload = await api(`${PAYROLL_MONTHLY_CLOSE_API}?resource=detail&id=${encodeURIComponent(id)}`);
      if (!validatePayrollMonthlyCloseDetail(payload)) throw new Error('El detalle no cumple el contrato de cierre mensual.');
      state.selectedId = id;
      renderDetail(payload.data.run);
    } catch (error) {
      state.detail = null;
      nodes.detail.hidden = true;
      setStatus(error instanceof Error ? error.message : 'No se pudo consultar el detalle.', 'error');
    } finally {
      if (!options.keepBusy) setBusy(false);
    }
  }

  function renderRuns(runs) {
    nodes.runs.replaceChildren();
    nodes.empty.hidden = runs.length > 0;
    runs.forEach((run) => {
      const row = document.createElement('tr');
      const period = document.createElement('td');
      const jurisdiction = document.createElement('td');
      const difference = document.createElement('td');
      const status = document.createElement('td');
      const action = document.createElement('td');
      period.textContent = run.period;
      jurisdiction.textContent = `J${run.jurisdiction}`;
      difference.className = 'numeric';
      difference.textContent = formatPayrollMonthlyCloseAmount(run.totals.differenceCents);
      const badge = document.createElement('span');
      badge.className = `state-badge ${stateClass(run.status)}`;
      badge.textContent = STATUS_LABELS[run.status];
      status.append(badge);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button';
      button.textContent = 'Abrir cierre';
      button.addEventListener('click', () => loadDetail(run.id));
      action.append(button);
      row.append(period, jurisdiction, difference, status, action);
      nodes.runs.append(row);
    });
  }

  function renderScope(data) {
    const canPrepare = data.principal.capabilities.includes('payroll.monthly_close.prepare');
    const canApprove = data.principal.capabilities.includes('payroll.monthly_close.approve');
    nodes.role.textContent = data.principal.roleKey;
    nodes.preparePanel.hidden = !canPrepare;
    nodes.scope.textContent = canPrepare
      ? 'Puede preparar y enviar cierres. El backend impide que la misma identidad los autoapruebe.'
      : canApprove
        ? 'Puede revisar la conciliación y decidir cierres preparados por otra identidad.'
        : 'Acceso de consulta: puede revisar cierres y evidencia agregada, sin modificar estados.';
  }

  function metadataForPrepare(mutation) {
    const requested = {
      kind: 'prepare',
      period: mutation.payload.period,
      jurisdiction: String(mutation.payload.jurisdiction),
    };
    const pendingAttempt = attempts.getPending();
    if (pendingAttempt) {
      if (pendingAttempt.metadata?.kind !== requested.kind
          || pendingAttempt.metadata.period !== requested.period
          || pendingAttempt.metadata.jurisdiction !== requested.jurisdiction) {
        throw pendingAttemptError();
      }
      return pendingAttempt.metadata;
    }
    return requested;
  }

  async function load(options = {}) {
    if (!options.keepBusy) setBusy(true);
    setStatus('Consultando corridas mensuales persistidas…', 'warning');
    try {
      const payload = await api(`${PAYROLL_MONTHLY_CLOSE_API}?resource=bootstrap`);
      if (!validatePayrollMonthlyCloseBootstrap(payload)) throw new Error('La bandeja no cumple el contrato de cierre mensual.');
      state.bootstrap = payload.data;
      renderScope(payload.data);
      renderRuns(payload.data.runs);
      const selectedId = options.selectedId || state.selectedId || payload.data.runs[0]?.id || null;
      if (selectedId) await loadDetail(selectedId, { keepBusy: true });
      else {
        state.selectedId = null;
        state.detail = null;
        nodes.detail.hidden = true;
      }
      setStatus(options.announce || `Se cargaron ${payload.data.runs.length} cierres del contexto certificado.`, 'ok');
    } catch (error) {
      state.bootstrap = null;
      state.detail = null;
      nodes.preparePanel.hidden = true;
      nodes.detail.hidden = true;
      setStatus(error instanceof Error ? error.message : 'No se pudo cargar la bandeja.', 'error');
    } finally {
      if (!options.keepBusy) setBusy(false);
    }
  }

  async function prepare(event) {
    event.preventDefault();
    if (state.busy) return;
    const errors = [];
    if (!MONTH.test(nodes.period.value)) errors.push('Elegí un período válido.');
    if (!['42', '55'].includes(nodes.jurisdiction.value)) errors.push('Elegí la jurisdicción 42 o 55.');
    const selected = nodes.files.map((input) => ({
      definitionKey: input.dataset.monthlyWorkflowFile,
      file: input.files?.[0],
    }));
    if (selected.some((item) => !item.file)) errors.push('Seleccioná las tres fuentes agregadas.');
    if (selected.some((item) => item.file && (item.file.size < 1 || item.file.size > PAYROLL_MONTHLY_CLOSE_MAX_BYTES))) {
      errors.push('Cada fuente debe pesar entre 1 byte y 256 KiB.');
    }
    if (errors.length) {
      nodes.actionStatus.textContent = errors.join(' ');
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    setBusy(true);
    setStatus('Leyendo los tres contratos agregados y preparando la corrida…', 'warning');
    try {
      const sources = await Promise.all(selected.map(async ({ definitionKey, file }) => ({
        definitionKey,
        sourceKind: SOURCE_SPECS[definitionKey].sourceKind,
        contentBase64: await readMonthlyCloseAggregateFile(file, FileReaderImpl),
      })));
      const mutation = buildPayrollMonthlyClosePrepareMutation({
        period: nodes.period.value,
        jurisdiction: nodes.jurisdiction.value,
        sources,
      });
      if (!mutation) throw new Error('Las fuentes no cumplen el contrato del cierre mensual.');
      const execution = await attempts.execute({
        mutation,
        metadata: metadataForPrepare(mutation),
        send: async (stableMutation, idempotencyKey) => {
          const payload = await api(PAYROLL_MONTHLY_CLOSE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(stableMutation),
          });
          if (!validatePayrollMonthlyCloseMutationEnvelope(payload)) {
            throw attemptError('El servidor no devolvió una corrida verificable.');
          }
          return payload;
        },
        reconcile: reconcileAttemptByKey,
      });
      const payload = execution.result;
      state.selectedId = payload.data.run.id;
      nodes.form.reset();
      resetFileStates();
      await load({
        selectedId: state.selectedId,
        keepBusy: true,
        announce: execution.recovered
          ? 'Corrida confirmada al reconciliar el estado del servidor. Revisá la conciliación antes de enviarla.'
          : 'Corrida preparada. Revisá la conciliación exacta antes de enviarla.',
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo preparar la corrida.', 'error');
    } finally {
      setBusy(false);
    }
  }

  nodes.files.forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      const indicator = nodes.fileStates.find((node) => (
        node.dataset.monthlyWorkflowFileState === input.dataset.monthlyWorkflowFile
      ));
      if (!indicator) return;
      indicator.textContent = file ? `${file.size} bytes listos; el nombre no se envía.` : 'No seleccionado.';
      indicator.dataset.state = file && file.size <= PAYROLL_MONTHLY_CLOSE_MAX_BYTES ? 'ready' : file ? 'error' : '';
    });
  });
  nodes.form?.addEventListener('submit', prepare);
  nodes.form?.addEventListener('reset', () => setTimeout(resetFileStates, 0));
  nodes.refresh?.addEventListener('click', () => load());
  nodes.approvedProofDownload?.addEventListener('click', downloadApprovedReport);
  nodes.folderDownload?.addEventListener('click', downloadApprovedFolder);
  load();
  return { load, loadDetail, prepare, downloadApprovedReport, downloadApprovedFolder, getState: () => ({ ...state }) };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-monthly-close-workflow]');
  if (root) createPayrollMonthlyCloseWorkflow(root);
}
