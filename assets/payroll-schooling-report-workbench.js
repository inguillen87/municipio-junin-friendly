import {
  PAYROLL_SCHOOLING_MAX_SOURCE_BYTES,
  PAYROLL_SCHOOLING_PROFILE_ID,
  PayrollSchoolingReportError,
  diagnosePayrollSchoolingProfile,
  inspectPayrollSchoolingWorkbook,
} from './payroll-schooling-report.js';

export const PAYROLL_SCHOOLING_REQUIREMENT_LABELS = Object.freeze({
  source_population_and_cutoff: 'Población de origen y fecha de corte',
  column_order_names_and_types: 'Orden, nombre y tipo de cada columna',
  schooling_event_or_concept_mapping: 'Relación con conceptos o eventos de escolaridad',
  inclusion_and_exclusion_rules: 'Reglas de inclusión y exclusión',
  jurisdiction_and_department_scope: 'Ámbito de jurisdicción y repartición',
  amount_source_and_rounding: 'Origen de importes y regla de redondeo',
  duplicate_business_key: 'Clave de control para detectar duplicados',
  control_totals: 'Totales de control esperados',
  approved_filename_and_sheet_names: 'Nombre aprobado del archivo y de sus hojas',
  privacy_minimization_and_retention: 'Minimización y conservación de datos personales',
});

function fail(code, message) {
  throw new PayrollSchoolingReportError(code, message);
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} KB`;
  return `${(value / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 2 })} MB`;
}

function messageFor(error) {
  const messages = {
    SCHOOLING_WORKBENCH_SOURCE_INVALID: 'Seleccioná un archivo XLSX para analizar.',
    SCHOOLING_SOURCE_EMPTY: 'El archivo no contiene datos.',
    SCHOOLING_SOURCE_TOO_LARGE: 'El archivo supera el límite local de 8 MiB.',
    SCHOOLING_CRYPTO_UNAVAILABLE: 'Este navegador no puede calcular la huella del archivo.',
    SCHOOLING_CRYPTO_FAILED: 'No se pudo identificar el archivo seleccionado.',
  };
  return error instanceof PayrollSchoolingReportError
    ? messages[error.code] || error.message
    : 'No se pudo completar el diagnóstico local del XLSX.';
}

async function readSourceBytes(source) {
  if (source instanceof Uint8Array) return source;
  if (!source || typeof source.arrayBuffer !== 'function') {
    fail('SCHOOLING_WORKBENCH_SOURCE_INVALID', 'La fuente debe ser un archivo legible por el navegador');
  }
  if (Number.isFinite(source.size)
      && (source.size < 1 || source.size > PAYROLL_SCHOOLING_MAX_SOURCE_BYTES)) {
    fail(
      source.size < 1 ? 'SCHOOLING_SOURCE_EMPTY' : 'SCHOOLING_SOURCE_TOO_LARGE',
      'El archivo no cumple el límite de tamaño admitido',
    );
  }
  return new Uint8Array(await source.arrayBuffer());
}

/**
 * Retorna sólo metadatos estructurales. Los bytes y el nombre del archivo no se
 * incluyen en el resultado ni se conservan en estado del workbench.
 */
export async function analyzePayrollSchoolingWorkbookSource(
  source,
  { cryptoImpl = globalThis.crypto } = {},
) {
  const bytes = await readSourceBytes(source);
  const inspection = await inspectPayrollSchoolingWorkbook(
    { profileId: PAYROLL_SCHOOLING_PROFILE_ID, bytes },
    { cryptoImpl },
  );
  return Object.freeze({
    profileId: inspection.profileId,
    status: inspection.status,
    structureValid: inspection.structureValid,
    sourceByteLength: inspection.sourceByteLength,
    sourceSha256: inspection.sourceSha256,
    zipEntryCount: inspection.structure.zipEntryCount,
    worksheetPartCount: inspection.structure.worksheetPartCount,
    compressedPayloadBytes: inspection.structure.compressedPayloadBytes,
    declaredUncompressedBytes: inspection.structure.declaredUncompressedBytes,
    issueCount: inspection.diagnostics.issueCount,
    issues: Object.freeze([...inspection.diagnostics.issues]),
    issuesTruncated: inspection.diagnostics.issuesTruncated,
    semanticMappingComplete: false,
    generationAllowed: false,
    officialUseAllowed: false,
    sourceValuesIncluded: false,
    persistencePerformed: false,
  });
}

function appendText(documentImpl, parent, tagName, text) {
  const node = documentImpl.createElement(tagName);
  node.textContent = text;
  parent.append(node);
  return node;
}

export function createPayrollSchoolingReportWorkbench(root, options = {}) {
  if (!root) return null;
  const documentImpl = options.documentImpl || root.ownerDocument || globalThis.document;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const profile = diagnosePayrollSchoolingProfile();
  const nodes = {
    form: root.querySelector('[data-schooling-form]'),
    file: root.querySelector('[data-schooling-file]'),
    validate: root.querySelector('[data-schooling-validate]'),
    reset: root.querySelector('[data-schooling-reset]'),
    status: root.querySelector('[data-schooling-status]'),
    requirements: root.querySelector('[data-schooling-requirements]'),
    result: root.querySelector('[data-schooling-result]'),
    structure: root.querySelector('[data-schooling-structure]'),
    parts: root.querySelector('[data-schooling-parts]'),
    worksheets: root.querySelector('[data-schooling-worksheets]'),
    bytes: root.querySelector('[data-schooling-bytes]'),
    fingerprint: root.querySelector('[data-schooling-fingerprint]'),
    issues: root.querySelector('[data-schooling-issues]'),
    generation: root.querySelector('[data-schooling-generation]'),
    gate: root.querySelector('[data-schooling-gate]'),
  };
  if (!nodes.form || !nodes.file || !nodes.validate || !nodes.status || !nodes.result) return null;
  const state = { busy: false, diagnostic: null };

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    nodes.file.disabled = value;
    nodes.validate.disabled = value;
    if (nodes.reset) nodes.reset.disabled = value;
    if (nodes.generation) nodes.generation.disabled = true;
  }

  function clearResult() {
    state.diagnostic = null;
    nodes.result.hidden = true;
    nodes.issues?.replaceChildren();
  }

  function renderRequirements() {
    if (!nodes.requirements) return;
    nodes.requirements.replaceChildren();
    profile.missingRequirements.forEach((requirement) => {
      appendText(
        documentImpl,
        nodes.requirements,
        'li',
        PAYROLL_SCHOOLING_REQUIREMENT_LABELS[requirement] || 'Requisito pendiente de homologación',
      );
    });
  }

  function render(diagnostic) {
    nodes.result.hidden = false;
    if (nodes.structure) {
      nodes.structure.textContent = diagnostic.structureValid
        ? 'Contenedor XLSX válido'
        : 'Estructura XLSX inválida';
      nodes.structure.dataset.state = diagnostic.structureValid ? 'ok' : 'error';
    }
    if (nodes.parts) nodes.parts.textContent = String(diagnostic.zipEntryCount);
    if (nodes.worksheets) nodes.worksheets.textContent = String(diagnostic.worksheetPartCount);
    if (nodes.bytes) nodes.bytes.textContent = formatBytes(diagnostic.sourceByteLength);
    if (nodes.fingerprint) nodes.fingerprint.textContent = diagnostic.sourceSha256;
    if (nodes.issues) {
      nodes.issues.replaceChildren();
      if (diagnostic.issues.length === 0) {
        const item = appendText(documentImpl, nodes.issues, 'li', 'Sin incidencias estructurales');
        item.dataset.state = 'ok';
      } else {
        diagnostic.issues.forEach((code) => {
          const item = appendText(documentImpl, nodes.issues, 'li', code);
          item.dataset.state = 'error';
        });
      }
    }
    setStatus(
      diagnostic.structureValid
        ? 'Estructura XLSX validada. Las columnas, fórmulas y reglas todavía requieren homologación.'
        : 'El archivo no cumple la estructura mínima de un XLSX. No se habilitó ninguna salida.',
      diagnostic.structureValid ? 'ok' : 'error',
    );
  }

  async function analyze(overrides = {}) {
    const source = overrides.source || nodes.file.files?.[0];
    const diagnostic = await analyzePayrollSchoolingWorkbookSource(source, { cryptoImpl });
    state.diagnostic = diagnostic;
    render(diagnostic);
    return diagnostic;
  }

  async function submit(event) {
    event?.preventDefault?.();
    if (state.busy) return null;
    clearResult();
    setBusy(true);
    setStatus('Revisando el contenedor XLSX localmente…', 'warning');
    try {
      return await analyze();
    } catch (error) {
      setStatus(messageFor(error), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  renderRequirements();
  if (nodes.generation) nodes.generation.disabled = true;
  if (nodes.gate) {
    nodes.gate.textContent = 'Generación bloqueada hasta recibir una muestra inequívoca y homologar columnas, reglas y totales de control.';
  }
  nodes.form.addEventListener('submit', submit);
  nodes.file.addEventListener('change', () => {
    clearResult();
    const count = nodes.file.files?.length || 0;
    setStatus(
      count === 1
        ? '1 archivo seleccionado. Se analizará sólo en este navegador y no se guardará.'
        : 'Seleccioná un único archivo XLSX.',
      count === 1 ? 'ready' : '',
    );
  });
  nodes.reset?.addEventListener('click', () => {
    nodes.form.reset();
    clearResult();
    setStatus('Seleccioná un archivo XLSX para revisar su estructura.', '');
  });

  return Object.freeze({ analyze, submit, clear: clearResult, getState: () => ({ ...state }) });
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-schooling-report-workbench]');
  if (root) createPayrollSchoolingReportWorkbench(root);
}
