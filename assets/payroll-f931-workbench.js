import {
  PAYROLL_F931_MAX_SOURCE_BYTES,
  PAYROLL_F931_OBSERVED_PROFILE,
  PAYROLL_F931_PROFILE_ID,
  PayrollF931PrevalidationError,
  diagnosePayrollF931Profile,
  prevalidatePayrollF931Artifact,
} from './payroll-f931-prevalidator.js';

export const PAYROLL_F931_SCOPE_LABELS = Object.freeze({
  general: 'General',
  jurisdiction_42: 'Jurisdicción 42',
  jurisdiction_55: 'Jurisdicción 55',
});

export const PAYROLL_F931_REQUIREMENT_LABELS = Object.freeze({
  current_official_layout_and_effective_date: 'Diseño oficial vigente y fecha desde la que aplica.',
  field_boundaries_meanings_padding_and_alignment: 'Campos, posiciones, significado, relleno y alineación.',
  person_and_liquidation_business_keys: 'Claves de persona, liquidación y prevención de duplicados.',
  monthly_and_supplementary_inclusion_rules: 'Reglas para mensual y suplementarias del período.',
  three_output_population_semantics: 'Relación exacta entre General, Jurisdicción 42 y Jurisdicción 55.',
  jurisdiction_42_and_55_filter_contract: 'Filtros institucionales que determinan cada jurisdicción.',
  amount_fields_rounding_and_control_totals: 'Importes, redondeo y totales de conciliación.',
  approved_file_naming_and_transport: 'Nombres aprobados y canal de entrega.',
  accounting_owner_and_maker_checker_roles: 'Responsables de preparación y revisión separada.',
  human_submission_and_acknowledgement_procedure: 'Presentación humana y conservación del acuse.',
  retention_privacy_and_access_policy: 'Retención, privacidad y acceso a datos nominales.',
});

const ISSUE_LABELS = Object.freeze({
  F931_BOM_NOT_ALLOWED: 'El archivo incluye BOM y la muestra observada no lo admite.',
  F931_BARE_CR: 'Se encontró un retorno de carro sin salto de línea.',
  F931_BARE_LF: 'Se encontró un salto de línea que no usa CRLF.',
  F931_RECORD_WIDTH_MISMATCH: 'Al menos un registro no tiene 463 bytes.',
  F931_CRLF_REQUIRED: 'El último registro no termina con CRLF.',
  F931_WINDOWS_1252_UNDEFINED_BYTE: 'Se encontró un byte indefinido en Windows-1252.',
  F931_CONTROL_BYTE_NOT_ALLOWED: 'Se encontró un carácter de control no permitido.',
  F931_RECORD_COUNT_MISMATCH: 'La cantidad de registros no coincide con la expectativa declarada.',
  F931_SHA256_MISMATCH: 'La huella no coincide con la expectativa declarada.',
});

const SCOPE_MODES = new Set(['auto', 'declared']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code, message) {
  throw new PayrollF931PrevalidationError(code, message);
}

function formatBytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function issueLabel(issue) {
  const line = Number.isSafeInteger(issue?.line) ? `Registro ${issue.line}: ` : '';
  return `${line}${ISSUE_LABELS[issue?.code] || 'Incidencia estructural pendiente de revisión.'}`;
}

function errorMessage(error) {
  const labels = {
    F931_WORKBENCH_SOURCE_INVALID: 'Seleccioná un archivo TXT legible.',
    F931_SOURCE_EMPTY: 'El archivo está vacío.',
    F931_SOURCE_TOO_LARGE: 'El archivo supera el límite local de 8 MiB.',
    F931_SCOPE_MODE_INVALID: 'Elegí detección automática o ámbito declarado.',
    F931_SCOPE_UNKNOWN: 'El ámbito declarado no pertenece al paquete F.931 observado.',
    F931_CRYPTO_UNAVAILABLE: 'Este navegador no puede calcular la huella del archivo.',
    F931_CRYPTO_FAILED: 'No se pudo calcular la huella local del archivo.',
  };
  return error instanceof PayrollF931PrevalidationError
    ? labels[error.code] || error.message
    : 'No se pudo completar el precontrol local F.931.';
}

async function readSourceBytes(source) {
  if (source instanceof Uint8Array) return source;
  if (!source || typeof source.arrayBuffer !== 'function') {
    fail('F931_WORKBENCH_SOURCE_INVALID', 'La fuente debe ser un archivo legible por el navegador');
  }
  if (Number.isFinite(source.size)
      && (source.size < 1 || source.size > PAYROLL_F931_MAX_SOURCE_BYTES)) {
    fail(
      source.size < 1 ? 'F931_SOURCE_EMPTY' : 'F931_SOURCE_TOO_LARGE',
      'El archivo no cumple el límite local admitido',
    );
  }
  return new Uint8Array(await source.arrayBuffer());
}

export function matchPayrollF931ObservedSamples(rawSha256) {
  const matches = Object.entries(PAYROLL_F931_OBSERVED_PROFILE.observedArtifacts).map(
    ([scope, evidence]) => ({
      scope,
      label: PAYROLL_F931_SCOPE_LABELS[scope],
      matches: rawSha256 === evidence.sha256,
      observedRecordCount: evidence.physicalRecordCount,
    }),
  );
  return deepFreeze(matches);
}

/**
 * El resultado contiene sólo conteos, códigos y huellas. Nunca conserva bytes,
 * nombre de archivo ni valores de los registros.
 */
export async function analyzePayrollF931Source(
  source,
  { scopeMode = 'auto', declaredScope = 'general', cryptoImpl = globalThis.crypto } = {},
) {
  if (!SCOPE_MODES.has(scopeMode)) {
    fail('F931_SCOPE_MODE_INVALID', 'El modo de ámbito no cumple el contrato');
  }
  const validationScope = scopeMode === 'declared' ? declaredScope : 'general';
  const bytes = await readSourceBytes(source);
  const validation = await prevalidatePayrollF931Artifact(
    { profileId: PAYROLL_F931_PROFILE_ID, scope: validationScope, bytes },
    { cryptoImpl },
  );
  const referenceMatches = matchPayrollF931ObservedSamples(validation.rawSha256);
  const matchedScopes = referenceMatches.filter((entry) => entry.matches).map((entry) => entry.scope);
  const resolvedScope = scopeMode === 'declared'
    ? declaredScope
    : matchedScopes.length === 1 ? matchedScopes[0] : null;
  const reviewCodes = [];
  if (scopeMode === 'auto' && resolvedScope === null) {
    reviewCodes.push('F931_SCOPE_NOT_IDENTIFIED_BY_REFERENCE_HASH');
  }
  if (scopeMode === 'declared' && matchedScopes.length === 1 && matchedScopes[0] !== declaredScope) {
    reviewCodes.push('F931_DECLARED_SCOPE_CONFLICTS_WITH_REFERENCE_HASH');
  }
  const structureValid = validation.status !== 'invalid_structure';

  return deepFreeze({
    profileId: PAYROLL_F931_PROFILE_ID,
    status: structureValid
      ? reviewCodes.length > 0 ? 'valid_structure_requires_scope_review' : 'valid_observed_structure_unmapped'
      : 'invalid_structure',
    structureValid,
    scopeMode,
    resolvedScope,
    scopeLabel: resolvedScope ? PAYROLL_F931_SCOPE_LABELS[resolvedScope] : 'No identificable por huella',
    byteLength: validation.byteLength,
    formattedByteLength: formatBytes(validation.byteLength),
    rawSha256: validation.rawSha256,
    physicalRecordCount: validation.physicalRecordCount,
    recordWidthBytes: validation.recordWidthBytes,
    lineEnding: validation.lineEnding,
    issueCount: validation.issueCount,
    issuesTruncated: validation.issuesTruncated,
    issues: validation.issues.map((issue) => ({ ...issue, label: issueLabel(issue) })),
    referenceMatches,
    reviewCodes,
    semanticMappingComplete: false,
    populationFilterVerified: false,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    homologated: false,
    sourceValuesIncluded: false,
    fileNameIncluded: false,
    persistencePerformed: false,
    networkPerformed: false,
  });
}

function appendText(documentImpl, parent, tagName, text) {
  const node = documentImpl.createElement(tagName);
  node.textContent = text;
  parent.append(node);
  return node;
}

export function createPayrollF931Workbench(root, options = {}) {
  if (!root) return null;
  const documentImpl = options.documentImpl || root.ownerDocument || globalThis.document;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const diagnosis = diagnosePayrollF931Profile();
  const nodes = {
    form: root.querySelector('[data-f931-form]'),
    mode: root.querySelector('[data-f931-scope-mode]'),
    scope: root.querySelector('[data-f931-scope]'),
    scopeField: root.querySelector('[data-f931-scope-field]'),
    file: root.querySelector('[data-f931-file]'),
    validate: root.querySelector('[data-f931-validate]'),
    reset: root.querySelector('[data-f931-reset]'),
    status: root.querySelector('[data-f931-status]'),
    requirements: root.querySelector('[data-f931-requirements]'),
    result: root.querySelector('[data-f931-result]'),
    structure: root.querySelector('[data-f931-structure]'),
    resolvedScope: root.querySelector('[data-f931-resolved-scope]'),
    records: root.querySelector('[data-f931-records]'),
    bytes: root.querySelector('[data-f931-bytes]'),
    fingerprint: root.querySelector('[data-f931-fingerprint]'),
    matches: root.querySelector('[data-f931-matches]'),
    issues: root.querySelector('[data-f931-issues]'),
    gate: root.querySelector('[data-f931-gate]'),
    generate: root.querySelector('[data-f931-generate]'),
    submit: root.querySelector('[data-f931-submit]'),
  };
  if (!nodes.form || !nodes.mode || !nodes.scope || !nodes.file
      || !nodes.validate || !nodes.status || !nodes.result) return null;
  const state = { busy: false, diagnostic: null };

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    nodes.mode.disabled = value;
    nodes.scope.disabled = value || nodes.mode.value !== 'declared';
    nodes.file.disabled = value;
    nodes.validate.disabled = value;
    if (nodes.reset) nodes.reset.disabled = value;
    if (nodes.generate) nodes.generate.disabled = true;
    if (nodes.submit) nodes.submit.disabled = true;
  }

  function clearResult() {
    state.diagnostic = null;
    nodes.result.hidden = true;
    nodes.matches?.replaceChildren();
    nodes.issues?.replaceChildren();
  }

  function updateScopeMode() {
    const declared = nodes.mode.value === 'declared';
    nodes.scope.disabled = state.busy || !declared;
    if (nodes.scopeField) nodes.scopeField.dataset.state = declared ? 'enabled' : 'disabled';
    clearResult();
    setStatus(
      declared
        ? 'Seleccioná el ámbito informado por el área responsable y luego el TXT.'
        : 'La detección automática sólo identifica las tres muestras por su huella exacta.',
      '',
    );
  }

  function renderRequirements() {
    if (!nodes.requirements) return;
    nodes.requirements.replaceChildren();
    diagnosis.missingEvidence.forEach((requirement) => {
      appendText(
        documentImpl,
        nodes.requirements,
        'li',
        PAYROLL_F931_REQUIREMENT_LABELS[requirement] || 'Requisito pendiente de homologación.',
      );
    });
  }

  function renderMatches(diagnostic) {
    if (!nodes.matches) return;
    nodes.matches.replaceChildren();
    diagnostic.referenceMatches.forEach((reference) => {
      const item = appendText(
        documentImpl,
        nodes.matches,
        'li',
        `${reference.label}: ${reference.matches ? 'coincide con la muestra observada' : 'no coincide'}`,
      );
      item.dataset.state = reference.matches ? 'ok' : 'neutral';
    });
  }

  function renderIssues(diagnostic) {
    if (!nodes.issues) return;
    nodes.issues.replaceChildren();
    if (diagnostic.issues.length === 0 && diagnostic.reviewCodes.length === 0) {
      const item = appendText(documentImpl, nodes.issues, 'li', 'Sin incidencias de estructura física.');
      item.dataset.state = 'ok';
      return;
    }
    diagnostic.issues.forEach((issue) => {
      const item = appendText(documentImpl, nodes.issues, 'li', issue.label);
      item.dataset.state = 'error';
    });
    diagnostic.reviewCodes.forEach((code) => {
      const text = code === 'F931_DECLARED_SCOPE_CONFLICTS_WITH_REFERENCE_HASH'
        ? 'El ámbito declarado contradice la huella de una muestra observada.'
        : 'La huella no identifica una de las tres muestras; declaralo manualmente para clasificar este precontrol.';
      const item = appendText(documentImpl, nodes.issues, 'li', text);
      item.dataset.state = 'warning';
    });
  }

  function render(diagnostic) {
    nodes.result.hidden = false;
    if (nodes.structure) {
      nodes.structure.textContent = diagnostic.structureValid
        ? 'Estructura física válida'
        : 'Estructura física inválida';
      nodes.structure.dataset.state = diagnostic.structureValid ? 'ok' : 'error';
    }
    if (nodes.resolvedScope) nodes.resolvedScope.textContent = diagnostic.scopeLabel;
    if (nodes.records) nodes.records.textContent = String(diagnostic.physicalRecordCount);
    if (nodes.bytes) nodes.bytes.textContent = diagnostic.formattedByteLength;
    if (nodes.fingerprint) nodes.fingerprint.textContent = diagnostic.rawSha256;
    renderMatches(diagnostic);
    renderIssues(diagnostic);

    if (!diagnostic.structureValid) {
      setStatus('El TXT no cumple el formato físico observado. No se habilitó ninguna salida.', 'error');
    } else if (diagnostic.reviewCodes.length > 0) {
      setStatus('La estructura física es válida, pero el ámbito necesita revisión. La semántica sigue sin homologar.', 'warning');
    } else {
      setStatus('Precontrol estructural completo. No valida campos, importes, población ni presentación oficial.', 'ok');
    }
  }

  async function analyze(overrides = {}) {
    const source = overrides.source || nodes.file.files?.[0];
    const diagnostic = await analyzePayrollF931Source(source, {
      scopeMode: overrides.scopeMode || nodes.mode.value,
      declaredScope: overrides.declaredScope || nodes.scope.value,
      cryptoImpl,
    });
    state.diagnostic = diagnostic;
    render(diagnostic);
    return diagnostic;
  }

  async function submit(event) {
    event?.preventDefault?.();
    if (state.busy) return null;
    clearResult();
    setBusy(true);
    setStatus('Revisando el TXT localmente…', 'warning');
    try {
      return await analyze();
    } catch (error) {
      setStatus(errorMessage(error), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  renderRequirements();
  if (nodes.generate) nodes.generate.disabled = true;
  if (nodes.submit) nodes.submit.disabled = true;
  if (nodes.gate) {
    nodes.gate.textContent = 'Generación y presentación bloqueadas: faltan layout vigente, campos, filtros, conciliación y aprobación contable.';
  }
  nodes.form.addEventListener('submit', submit);
  nodes.mode.addEventListener('change', updateScopeMode);
  nodes.file.addEventListener('change', () => {
    clearResult();
    const count = nodes.file.files?.length || 0;
    setStatus(
      count === 1
        ? '1 archivo seleccionado. Se analizará sólo en este navegador y no se conservará.'
        : 'Seleccioná un único archivo TXT.',
      count === 1 ? 'ready' : '',
    );
  });
  nodes.reset?.addEventListener('click', () => {
    nodes.form.reset();
    clearResult();
    updateScopeMode();
  });
  updateScopeMode();

  return Object.freeze({ analyze, submit, clear: clearResult, getState: () => ({ ...state }) });
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-f931-workbench]');
  if (root) createPayrollF931Workbench(root);
}
