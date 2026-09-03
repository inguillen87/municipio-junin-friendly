import {
  PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES,
  PAYROLL_HEALTH_FIXED_WIDTH_PROFILES,
  PayrollHealthFixedWidthError,
  reconcilePayrollHealthCents,
  validatePayrollHealthFixedWidth,
} from './payroll-health-fixed-width.js';

export const PAYROLL_HEALTH_WORKBENCH_AUTO_PROFILE = 'auto';
export const PAYROLL_HEALTH_WORKBENCH_MAX_FILES = 12;
export const PAYROLL_HEALTH_WORKBENCH_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

const PROFILE_IDS = Object.freeze(Object.keys(PAYROLL_HEALTH_FIXED_WIDTH_PROFILES));

function fail(code, message) {
  throw new PayrollHealthFixedWidthError(code, message);
}

async function readSourceBytes(source) {
  if (source instanceof Uint8Array) return source;
  if (!source || typeof source.arrayBuffer !== 'function') {
    fail('HEALTH_WORKBENCH_SOURCE_INVALID', 'Cada origen debe ser un TXT legible por el navegador');
  }
  if (Number.isFinite(source.size)
    && (source.size < 1 || source.size > PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES)) {
    fail('HEALTH_WORKBENCH_SOURCE_SIZE_INVALID', 'Un TXT supera el límite individual admitido');
  }
  return new Uint8Array(await source.arrayBuffer());
}

function normalizeOptionalRecordCount(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fail('HEALTH_WORKBENCH_RECORD_COUNT_INVALID', 'La cantidad esperada debe ser un entero positivo');
  }
  return parsed;
}

function normalizeProfileId(profileId) {
  const normalized = profileId || PAYROLL_HEALTH_WORKBENCH_AUTO_PROFILE;
  if (normalized !== PAYROLL_HEALTH_WORKBENCH_AUTO_PROFILE && !PROFILE_IDS.includes(normalized)) {
    fail('HEALTH_PROFILE_UNKNOWN', 'El perfil no pertenece al catálogo observado');
  }
  return normalized;
}

function summarizeIssueCodes(issues) {
  const counts = new Map();
  for (const issue of issues) {
    counts.set(issue.code, (counts.get(issue.code) || 0) + 1);
  }
  return Object.freeze([...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => Object.freeze({ code, count })));
}

function sanitizeValidation(validation, sourceIndex) {
  return Object.freeze({
    sourceIndex,
    profileId: validation.profileId,
    organization: validation.organization,
    status: validation.status,
    byteCount: validation.byteLength,
    detailRecordCount: validation.detailRecordCount,
    terminalRecordCount: validation.terminalRecordCount,
    issueCount: validation.issueCount,
    issuesTruncated: validation.issuesTruncated,
    issueCodes: summarizeIssueCodes(validation.issues),
    rawSha256: validation.rawSha256,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
    sourceValuesIncluded: false,
    persistencePerformed: false,
  });
}

export async function detectPayrollHealthProfile(
  source,
  { expectedRecordCount, cryptoImpl = globalThis.crypto } = {},
) {
  const bytes = await readSourceBytes(source);
  const expected = normalizeOptionalRecordCount(expectedRecordCount);
  const candidates = [];
  for (const profileId of PROFILE_IDS) {
    const validation = await validatePayrollHealthFixedWidth(bytes, {
      profileId,
      cryptoImpl,
    });
    if (validation.status === 'valid_structure') candidates.push(validation);
  }
  if (candidates.length === 0) {
    fail(
      'HEALTH_PROFILE_NOT_DETECTED',
      'El TXT no coincide exactamente con ningún perfil físico observado',
    );
  }
  if (candidates.length > 1) {
    fail(
      'HEALTH_PROFILE_AMBIGUOUS',
      'El TXT coincide con más de un perfil físico y requiere selección humana',
    );
  }
  if (expected === undefined) return candidates[0];
  return validatePayrollHealthFixedWidth(bytes, {
    profileId: candidates[0].profileId,
    expectedRecordCount: expected,
    cryptoImpl,
  });
}

export async function analyzePayrollHealthFiles(
  sources,
  {
    profileId = PAYROLL_HEALTH_WORKBENCH_AUTO_PROFILE,
    expectedRecordCount,
    expectedCents,
    artifactCents,
    cryptoImpl = globalThis.crypto,
  } = {},
) {
  if (!Array.isArray(sources) || sources.length < 1
    || sources.length > PAYROLL_HEALTH_WORKBENCH_MAX_FILES) {
    fail(
      'HEALTH_WORKBENCH_FILE_COUNT_INVALID',
      `Seleccioná entre 1 y ${PAYROLL_HEALTH_WORKBENCH_MAX_FILES} archivos TXT`,
    );
  }
  const selectedProfile = normalizeProfileId(profileId);
  const expected = normalizeOptionalRecordCount(expectedRecordCount);
  const hasExpectedCents = expectedCents !== undefined && expectedCents !== null && expectedCents !== '';
  const hasArtifactCents = artifactCents !== undefined && artifactCents !== null && artifactCents !== '';
  if (hasExpectedCents !== hasArtifactCents) {
    fail(
      'HEALTH_WORKBENCH_RECONCILIATION_INCOMPLETE',
      'Para conciliar importes deben informarse ambos totales agregados en centavos',
    );
  }

  const results = [];
  let totalBytes = 0;
  for (let index = 0; index < sources.length; index += 1) {
    const bytes = await readSourceBytes(sources[index]);
    totalBytes += bytes.byteLength;
    if (totalBytes > PAYROLL_HEALTH_WORKBENCH_MAX_TOTAL_BYTES) {
      fail('HEALTH_WORKBENCH_TOTAL_SIZE_EXCEEDED', 'La selección supera el límite total seguro');
    }
    const validation = selectedProfile === PAYROLL_HEALTH_WORKBENCH_AUTO_PROFILE
      ? await detectPayrollHealthProfile(bytes, { expectedRecordCount: expected, cryptoImpl })
      : await validatePayrollHealthFixedWidth(bytes, {
        profileId: selectedProfile,
        expectedRecordCount: expected,
        cryptoImpl,
      });
    results.push(sanitizeValidation(validation, index + 1));
  }

  const amountReconciliation = hasExpectedCents
    ? reconcilePayrollHealthCents({ expectedCents, artifactCents })
    : Object.freeze({ status: 'not_computed', reasonCode: 'HEALTH_AGGREGATE_CENTS_NOT_PROVIDED' });
  const summary = Object.freeze({
    fileCount: results.length,
    validFileCount: results.filter((result) => result.status === 'valid_structure').length,
    invalidFileCount: results.filter((result) => result.status !== 'valid_structure').length,
    totalByteCount: totalBytes,
    detailRecordCount: results.reduce((total, result) => total + result.detailRecordCount, 0),
    terminalRecordCount: results.reduce((total, result) => total + result.terminalRecordCount, 0),
    issueCount: results.reduce((total, result) => total + result.issueCount, 0),
  });

  return Object.freeze({
    status: summary.invalidFileCount === 0 ? 'valid_structure' : 'invalid_structure',
    summary,
    results: Object.freeze(results),
    amountReconciliation,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
    sourceValuesIncluded: false,
    persistencePerformed: false,
  });
}

function appendText(documentImpl, parent, tagName, text, className = '') {
  const node = documentImpl.createElement(tagName);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function reconciliationText(value) {
  if (value.status === 'not_computed') return 'Conciliación monetaria: no informada.';
  return value.reconciled
    ? `Conciliación monetaria: exacta; diferencia ${value.differenceCents} centavos.`
    : `Conciliación monetaria: diferencia ${value.differenceCents} centavos.`;
}

export function createPayrollHealthFixedWidthWorkbench(root, options = {}) {
  if (!root) return null;
  const documentImpl = options.documentImpl || globalThis.document;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const nodes = {
    form: root.querySelector('[data-health-form]'),
    files: root.querySelector('[data-health-files]'),
    profile: root.querySelector('[data-health-profile]'),
    expectedRecords: root.querySelector('[data-health-expected-records]'),
    expectedCents: root.querySelector('[data-health-expected-cents]'),
    artifactCents: root.querySelector('[data-health-artifact-cents]'),
    reset: root.querySelector('[data-health-reset]'),
    status: root.querySelector('[data-health-status]'),
    summary: root.querySelector('[data-health-summary]'),
    results: root.querySelector('[data-health-results]'),
    officialGate: root.querySelector('[data-health-official-gate]'),
  };
  const state = { busy: false, analysis: null };

  function setStatus(message, kind = '') {
    if (nodes.status) {
      nodes.status.textContent = message;
      nodes.status.dataset.state = kind;
    }
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, input, select').forEach((node) => { node.disabled = value; });
  }

  function clear() {
    state.analysis = null;
    nodes.summary?.replaceChildren();
    nodes.results?.replaceChildren();
  }

  function render(analysis) {
    if (nodes.summary) {
      nodes.summary.replaceChildren();
      appendText(
        documentImpl,
        nodes.summary,
        'p',
        `${analysis.summary.fileCount} archivos · ${analysis.summary.detailRecordCount} registros · ${analysis.summary.issueCount} incidencias`,
      );
      appendText(documentImpl, nodes.summary, 'p', reconciliationText(analysis.amountReconciliation));
    }
    if (nodes.results) {
      nodes.results.replaceChildren();
      analysis.results.forEach((result) => {
        const card = documentImpl.createElement('article');
        card.dataset.state = result.status;
        appendText(documentImpl, card, 'h4', `Archivo ${result.sourceIndex} · ${result.organization}`);
        appendText(documentImpl, card, 'p', `Perfil: ${result.profileId}`);
        appendText(
          documentImpl,
          card,
          'p',
          `Registros: ${result.detailRecordCount} · terminales: ${result.terminalRecordCount} · bytes: ${result.byteCount}`,
        );
        appendText(documentImpl, card, 'p', `SHA-256: ${result.rawSha256}`);
        appendText(documentImpl, card, 'p', `Incidencias: ${result.issueCount}`);
        const list = documentImpl.createElement('ul');
        result.issueCodes.forEach(({ code, count }) => appendText(documentImpl, list, 'li', `${code}: ${count}`));
        if (result.issueCodes.length === 0) appendText(documentImpl, list, 'li', 'HEALTH_STRUCTURE_VALID: 1');
        card.append(list);
        nodes.results.append(card);
      });
    }
    setStatus(
      analysis.status === 'valid_structure'
        ? 'Estructura física validada. La presentación oficial continúa bloqueada hasta homologación.'
        : 'Hay incidencias estructurales. La presentación oficial continúa bloqueada.',
      analysis.status === 'valid_structure' ? 'ok' : 'error',
    );
  }

  async function analyze(overrides = {}) {
    const sources = overrides.sources || Array.from(nodes.files?.files || []);
    const analysis = await analyzePayrollHealthFiles(sources, {
      profileId: overrides.profileId ?? nodes.profile?.value ?? PAYROLL_HEALTH_WORKBENCH_AUTO_PROFILE,
      expectedRecordCount: overrides.expectedRecordCount ?? nodes.expectedRecords?.value,
      expectedCents: overrides.expectedCents ?? nodes.expectedCents?.value,
      artifactCents: overrides.artifactCents ?? nodes.artifactCents?.value,
      cryptoImpl,
    });
    state.analysis = analysis;
    render(analysis);
    return analysis;
  }

  async function submit(event) {
    event?.preventDefault?.();
    if (state.busy) return null;
    clear();
    setBusy(true);
    setStatus('Validando estructura física localmente…', 'warning');
    try {
      return await analyze();
    } catch (error) {
      setStatus(
        error instanceof PayrollHealthFixedWidthError
          ? `${error.code}: ${error.message}`
          : 'HEALTH_WORKBENCH_UNEXPECTED: no se pudo completar el diagnóstico.',
        'error',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (nodes.officialGate) {
    nodes.officialGate.textContent = 'Generación y presentación oficial bloqueadas hasta homologación byte a byte.';
  }
  nodes.form?.addEventListener('submit', submit);
  nodes.files?.addEventListener('change', () => {
    clear();
    const count = nodes.files.files?.length || 0;
    setStatus(
      count ? `${count} archivo${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}; el contenido no se muestra ni se persiste.` : 'Seleccioná uno o varios TXT.',
      count ? 'ready' : '',
    );
  });
  nodes.reset?.addEventListener('click', () => {
    nodes.form?.reset();
    clear();
    setStatus('Seleccioná uno o varios TXT.', '');
  });

  return Object.freeze({ analyze, submit, clear, getState: () => ({ ...state }) });
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-health-fixed-width-workbench]');
  if (root) createPayrollHealthFixedWidthWorkbench(root);
}
