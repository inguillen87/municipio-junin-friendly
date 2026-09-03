import {
  PAYROLL_BANK_MAX_FILE_BYTES,
  PAYROLL_BANK_OBSERVED_PROFILES,
  PayrollBankProfileError,
  reconcileBankControlTotals,
  validateObservedBankFile,
} from './payroll-bank-fixed-width-profiles.js';

export const PAYROLL_BANK_WORKBENCH_PROFILES = Object.freeze([
  Object.freeze({
    profileId: 'credicoop-accreditation-30.observed.v1',
    label: 'Credicoop · acreditación observada (30 bytes)',
  }),
  Object.freeze({
    profileId: 'credicoop-control-66.observed.v1',
    label: 'Credicoop · control observado (66 bytes)',
  }),
  Object.freeze({
    profileId: 'gt-pagos-200.observed.v1',
    label: 'GT_PAGOS · estructura observada (200 bytes)',
  }),
  Object.freeze({
    profileId: 'transferencias-varias-167.observed.v1',
    label: 'Transferencias varias · estructura observada (167 bytes)',
  }),
]);

export const PAYROLL_BANK_BLOCKED_NOTICE =
  'Generación y acreditación bloqueadas hasta homologar el layout campo por campo con cada entidad.';

const NON_NEGATIVE_CENTS = /^(?:0|[1-9][0-9]{0,18})$/;

function fail(code, message) {
  throw new PayrollBankProfileError(code, message);
}

function profileFor(profileId) {
  const profile = PAYROLL_BANK_OBSERVED_PROFILES[profileId];
  if (!profile) fail('BANK_PROFILE_UNKNOWN', 'Seleccioná un perfil bancario observado.');
  return profile;
}

function safeReconciliationInput(input, bankRecordCount) {
  if (!input) return null;
  const values = {
    payrollRecordCount: String(input.payrollRecordCount ?? '').trim(),
    approvedPayrollNetCents: String(input.approvedPayrollNetCents ?? '').trim(),
    declaredBankNetCents: String(input.declaredBankNetCents ?? '').trim(),
  };
  const populated = Object.values(values).filter(Boolean).length;
  if (populated === 0) return null;
  if (populated !== 3
      || !/^\d{1,5}$/.test(values.payrollRecordCount)
      || !NON_NEGATIVE_CENTS.test(values.approvedPayrollNetCents)
      || !NON_NEGATIVE_CENTS.test(values.declaredBankNetCents)) {
    fail(
      'BANK_RECONCILIATION_FIELDS_INCOMPLETE',
      'Completá cantidad de liquidación y ambos totales en centavos, sin puntos ni comas.',
    );
  }
  return {
    payrollRecordCount: Number(values.payrollRecordCount),
    bankRecordCount,
    approvedPayrollNetCents: values.approvedPayrollNetCents,
    declaredBankNetCents: values.declaredBankNetCents,
  };
}

/**
 * Builds a PII-free diagnostic. Source bytes are neither returned nor retained.
 * Structural validation does not imply bank acceptance or an approved payment.
 */
export async function buildPayrollBankDiagnostic(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('BANK_WORKBENCH_INPUT_INVALID', 'El diagnóstico bancario no cumple el contrato.');
  }
  const profile = profileFor(input.profileId);
  if (!profile.supportedScopes.includes(input.scope)) {
    fail('BANK_SCOPE_NOT_OBSERVED', 'Elegí un ámbito observado para este perfil.');
  }
  if (!(input.bytes instanceof Uint8Array)
      || input.bytes.byteLength < 1
      || input.bytes.byteLength > PAYROLL_BANK_MAX_FILE_BYTES) {
    fail('BANK_FILE_SIZE_INVALID', 'El archivo debe pesar entre 1 byte y 4 MiB.');
  }
  const validation = await validateObservedBankFile({
    profileId: input.profileId,
    scope: input.scope,
    bytes: input.bytes,
  }, { cryptoImpl: options.cryptoImpl || globalThis.crypto });
  const reconciliationInput = safeReconciliationInput(input.reconciliation, validation.recordCount);
  const reconciliation = reconciliationInput
    ? reconcileBankControlTotals(reconciliationInput)
    : null;

  return Object.freeze({
    profileId: validation.profileId,
    scope: validation.scope,
    status: validation.status,
    structureMatches: validation.structureMatches,
    byteLength: validation.byteLength,
    recordCount: validation.recordCount,
    sha256: validation.sha256,
    diagnostics: Object.freeze({
      issueCount: validation.diagnostics.issueCount,
      byCode: Object.freeze(validation.diagnostics.byCode.map(({ code, count }) => Object.freeze({ code, count }))),
      truncated: validation.diagnostics.truncated,
    }),
    reconciliation,
    generationAllowed: false,
    officialSubmissionAllowed: false,
    blockedReason: 'field_layout_not_homologated',
  });
}

function messageFor(error) {
  const messages = {
    BANK_FILE_SIZE_INVALID: 'El archivo debe pesar entre 1 byte y 4 MiB.',
    BANK_FILE_TOO_LARGE: 'El archivo supera el límite local de 4 MiB.',
    BANK_RECORD_LIMIT_EXCEEDED: 'El archivo supera el máximo de 10.000 registros.',
    BANK_SCOPE_NOT_OBSERVED: 'Elegí un ámbito observado para este perfil.',
    BANK_PROFILE_UNKNOWN: 'Seleccioná un perfil bancario observado.',
    BANK_RECONCILIATION_FIELDS_INCOMPLETE:
      'Completá cantidad de liquidación y ambos totales en centavos, sin puntos ni comas.',
    BANK_CRYPTO_UNAVAILABLE: 'El navegador no dispone de identificación criptográfica.',
    BANK_CRYPTO_FAILED: 'No se pudo calcular la huella del archivo.',
  };
  return error instanceof PayrollBankProfileError
    ? messages[error.code] || 'El archivo no cumple el perfil estructural seleccionado.'
    : 'No se pudo completar el diagnóstico local.';
}

export function createPayrollBankReportWorkbench(root, options = {}) {
  if (!root) return null;
  const doc = root.ownerDocument || globalThis.document;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const nodes = {
    form: root.querySelector('[data-bank-diagnostic-form]'),
    profile: root.querySelector('[data-bank-diagnostic-profile]'),
    scope: root.querySelector('[data-bank-diagnostic-scope]'),
    file: root.querySelector('[data-bank-diagnostic-file]'),
    fileState: root.querySelector('[data-bank-diagnostic-file-state]'),
    payrollRows: root.querySelector('[data-bank-diagnostic-payroll-rows]'),
    payrollCents: root.querySelector('[data-bank-diagnostic-payroll-cents]'),
    bankCents: root.querySelector('[data-bank-diagnostic-bank-cents]'),
    reset: root.querySelector('[data-bank-diagnostic-reset]'),
    status: root.querySelector('[data-bank-diagnostic-status]'),
    result: root.querySelector('[data-bank-diagnostic-result]'),
    structure: root.querySelector('[data-bank-diagnostic-structure]'),
    bytes: root.querySelector('[data-bank-diagnostic-bytes]'),
    records: root.querySelector('[data-bank-diagnostic-records]'),
    fingerprint: root.querySelector('[data-bank-diagnostic-fingerprint]'),
    issues: root.querySelector('[data-bank-diagnostic-issues]'),
    reconciliation: root.querySelector('[data-bank-diagnostic-reconciliation]'),
    blocked: root.querySelector('[data-bank-diagnostic-blocked]'),
  };
  if (!nodes.form || !nodes.profile || !nodes.scope || !nodes.file || !nodes.status || !nodes.result) {
    return null;
  }
  const state = { busy: false, diagnostic: null };

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, input, select').forEach((node) => { node.disabled = value; });
  }

  function addOption(select, value, label) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function populateProfiles() {
    const selected = nodes.profile.value;
    nodes.profile.replaceChildren();
    PAYROLL_BANK_WORKBENCH_PROFILES.forEach(({ profileId, label }) => addOption(nodes.profile, profileId, label));
    nodes.profile.value = PAYROLL_BANK_OBSERVED_PROFILES[selected]
      ? selected
      : PAYROLL_BANK_WORKBENCH_PROFILES[0].profileId;
  }

  function populateScopes() {
    const previous = nodes.scope.value;
    const profile = profileFor(nodes.profile.value);
    nodes.scope.replaceChildren();
    profile.supportedScopes.forEach((scope) => addOption(
      nodes.scope,
      scope,
      scope === 'unsegmented' ? 'Archivo sin jurisdicción segmentada' : `Jurisdicción ${scope}`,
    ));
    nodes.scope.value = profile.supportedScopes.includes(previous) ? previous : profile.supportedScopes[0];
  }

  function clearResult() {
    state.diagnostic = null;
    nodes.result.hidden = true;
    nodes.issues?.replaceChildren();
    if (nodes.reconciliation) nodes.reconciliation.textContent = 'No informada';
  }

  function render(diagnostic) {
    nodes.result.hidden = false;
    if (nodes.structure) {
      nodes.structure.textContent = diagnostic.structureMatches
        ? 'Coincide con la estructura observada'
        : 'Bloqueado por diferencias estructurales';
      nodes.structure.dataset.state = diagnostic.structureMatches ? 'ok' : 'error';
    }
    if (nodes.bytes) nodes.bytes.textContent = String(diagnostic.byteLength);
    if (nodes.records) nodes.records.textContent = String(diagnostic.recordCount);
    if (nodes.fingerprint) nodes.fingerprint.textContent = diagnostic.sha256;
    if (nodes.issues) {
      nodes.issues.replaceChildren();
      if (diagnostic.diagnostics.byCode.length === 0) {
        const item = doc.createElement('li');
        item.textContent = 'Sin incidencias estructurales';
        item.dataset.state = 'ok';
        nodes.issues.append(item);
      } else {
        diagnostic.diagnostics.byCode.forEach(({ code, count }) => {
          const item = doc.createElement('li');
          item.textContent = `${code}: ${count}`;
          item.dataset.state = 'error';
          nodes.issues.append(item);
        });
      }
    }
    if (nodes.reconciliation && diagnostic.reconciliation) {
      const result = diagnostic.reconciliation;
      nodes.reconciliation.textContent = result.reconciled
        ? 'Conciliado: 0 centavos y 0 registros de diferencia'
        : `Diferencia: ${result.bankMinusPayrollCents} centavos y ${result.bankMinusPayrollRecords} registros`;
      nodes.reconciliation.dataset.state = result.reconciled ? 'ok' : 'warning';
    }
    if (nodes.blocked) nodes.blocked.textContent = PAYROLL_BANK_BLOCKED_NOTICE;
    setStatus(
      diagnostic.structureMatches
        ? 'Diagnóstico local finalizado. La coincidencia estructural no acredita aceptación bancaria.'
        : 'Diagnóstico local finalizado con diferencias estructurales.',
      diagnostic.structureMatches ? 'ok' : 'error',
    );
  }

  async function submit(event) {
    event?.preventDefault?.();
    if (state.busy) return;
    clearResult();
    const file = nodes.file.files?.[0];
    if (!file || file.size < 1 || file.size > PAYROLL_BANK_MAX_FILE_BYTES) {
      setStatus('Seleccioná un archivo de entre 1 byte y 4 MiB.', 'error');
      return;
    }
    setBusy(true);
    setStatus('Analizando estructura y calculando huella en este navegador…', 'warning');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const diagnostic = await buildPayrollBankDiagnostic({
        profileId: nodes.profile.value,
        scope: nodes.scope.value,
        bytes,
        reconciliation: {
          payrollRecordCount: nodes.payrollRows?.value,
          approvedPayrollNetCents: nodes.payrollCents?.value,
          declaredBankNetCents: nodes.bankCents?.value,
        },
      }, { cryptoImpl });
      state.diagnostic = diagnostic;
      render(diagnostic);
    } catch (error) {
      setStatus(messageFor(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  nodes.profile.addEventListener('change', () => {
    clearResult();
    populateScopes();
    setStatus('Perfil actualizado. Seleccioná el archivo que corresponda.', '');
  });
  nodes.file.addEventListener('change', () => {
    clearResult();
    const file = nodes.file.files?.[0];
    if (nodes.fileState) {
      nodes.fileState.textContent = file
        ? `${file.size} bytes listos para análisis local.`
        : 'No hay un archivo seleccionado.';
      nodes.fileState.dataset.state = file && file.size <= PAYROLL_BANK_MAX_FILE_BYTES
        ? 'ready'
        : file ? 'error' : '';
    }
  });
  nodes.form.addEventListener('submit', submit);
  nodes.reset?.addEventListener('click', () => {
    nodes.form.reset();
    populateProfiles();
    populateScopes();
    clearResult();
    if (nodes.fileState) {
      nodes.fileState.textContent = 'No hay un archivo seleccionado.';
      nodes.fileState.dataset.state = '';
    }
    setStatus('Elegí un perfil y un archivo para iniciar el diagnóstico local.', '');
  });

  populateProfiles();
  populateScopes();
  if (nodes.blocked) nodes.blocked.textContent = PAYROLL_BANK_BLOCKED_NOTICE;
  setStatus('Elegí un perfil y un archivo para iniciar el diagnóstico local.', '');

  return Object.freeze({
    submit,
    clearResult,
    getState: () => Object.freeze({ busy: state.busy, diagnostic: state.diagnostic }),
  });
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-payroll-bank-report-workbench]')
    .forEach((root) => createPayrollBankReportWorkbench(root));
}
