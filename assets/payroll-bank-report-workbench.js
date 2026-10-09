import {
  PAYROLL_BANK_MAX_FILE_BYTES,
  PAYROLL_BANK_OBSERVED_PROFILES,
  PayrollBankProfileError,
  reconcileBankControlTotals,
  validateObservedBankFile,
} from './payroll-bank-fixed-width-profiles.js';
import {reviewTransfersVarFile, transfersVarObservationsCsv, TRANSFERS_VAR_PROFILE, TRANSFERS_VAR_FIELDS} from './payroll-transfers-var-review.js';

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
  const fieldReview = input.profileId === TRANSFERS_VAR_PROFILE
    ? await reviewTransfersVarFile(input.bytes, {cryptoImpl: options.cryptoImpl || globalThis.crypto}) : null;
  if(fieldReview && fieldReview.sha256!==validation.sha256)fail('BANK_SOURCE_CHANGED','El archivo cambió durante la revisión. Elegilo y revisalo nuevamente.');
  const fieldReconciliation = fieldReview?.matchesObservedFields && reconciliationInput
    ? Object.freeze({
      fileMinusDeclaredCents: (BigInt(fieldReview.totalCents) - BigInt(reconciliationInput.declaredBankNetCents)).toString(),
      fileMinusApprovedPayrollCents: (BigInt(fieldReview.totalCents) - BigInt(reconciliationInput.approvedPayrollNetCents)).toString(),
      reconciled: reconciliation.reconciled
        && fieldReview.totalCents === reconciliationInput.declaredBankNetCents
        && fieldReview.totalCents === reconciliationInput.approvedPayrollNetCents,
    }) : null;

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
    fieldReview,
    fieldReconciliation,
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
    BANK_SOURCE_CHANGED: 'El archivo cambió durante la revisión. Elegilo y revisalo nuevamente.',
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
    fields: root.querySelector('[data-bank-diagnostic-fields]'),
    fieldSummary: root.querySelector('[data-bank-diagnostic-field-summary]'),
    fieldRows: root.querySelector('[data-bank-diagnostic-field-rows]'),
    fieldReconciliation: root.querySelector('[data-bank-diagnostic-field-reconciliation]'),
    exportObservations: root.querySelector('[data-bank-diagnostic-export-observations]'),
  };
  if (!nodes.form || !nodes.profile || !nodes.scope || !nodes.file || !nodes.status || !nodes.result) {
    return null;
  }
  const state = { busy: false, diagnostic: null, epoch: 0, revoked: false };

  function accessRetired() {
    return state.revoked || doc.visibilityState === 'hidden'
      || doc.documentElement?.getAttribute('data-mc-capability-state') === 'denied'
      || Boolean(root.closest?.('[data-mc-capability-denied="true"]'));
  }

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, input, select').forEach((node) => { node.disabled = value; });
    if(nodes.reset)nodes.reset.disabled=false;
    if(nodes.exportObservations)nodes.exportObservations.disabled=value||!state.diagnostic?.fieldReview;
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
    state.epoch++;
    state.diagnostic = null;
    nodes.result.hidden = true;
    nodes.issues?.replaceChildren();
    if (nodes.reconciliation) {
      nodes.reconciliation.textContent = 'No informada';
      delete nodes.reconciliation.dataset.state;
    }
    for (const node of [nodes.structure, nodes.bytes, nodes.records, nodes.fingerprint]) {
      if (node) node.textContent = '—';
    }
    if(nodes.fields)nodes.fields.hidden=true;
    if(nodes.fieldRows)nodes.fieldRows.replaceChildren();
    if(nodes.fieldSummary)nodes.fieldSummary.textContent='';
    if(nodes.fieldReconciliation)nodes.fieldReconciliation.textContent='';
    if(nodes.exportObservations)nodes.exportObservations.disabled=true;
    setBusy(false);
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
        ? 'Totales declarados conciliados: 0 centavos y 0 registros de diferencia'
        : `Diferencia: ${result.bankMinusPayrollCents} centavos y ${result.bankMinusPayrollRecords} registros`;
      nodes.reconciliation.dataset.state = result.reconciled ? 'ok' : 'warning';
    }
    if (nodes.blocked) nodes.blocked.textContent = PAYROLL_BANK_BLOCKED_NOTICE;
    const fieldReview=diagnostic.fieldReview;
    if(nodes.fields)nodes.fields.hidden=!fieldReview;
    if(fieldReview){
      if(nodes.fieldSummary)nodes.fieldSummary.textContent=fieldReview.matchesObservedFields
        ? `Campos observados completos, incluido VAR. Período ${fieldReview.period}; total leído exactamente: ${fieldReview.totalCents} centavos. No certifica titularidad, neto aprobado ni aceptación bancaria.`
        : `${fieldReview.observations.length} observaciones de la revisión completa. No se informa un total parcial. Descargá las filas y acciones para corregir el archivo.`;
      if(nodes.fieldRows){
        nodes.fieldRows.replaceChildren();
        for(const r of fieldReview.observations.slice(0,25)){
          const item=doc.createElement('li');item.textContent=`${r.rowNumber===null?'Global':'Fila '+r.rowNumber}: ${r.field}. ${r.action}`;nodes.fieldRows.append(item);
        }
        if(fieldReview.observations.length>25){const item=doc.createElement('li');item.textContent='Se muestran las primeras 25 observaciones. La descarga incluye todas.';nodes.fieldRows.append(item);}
        if(!fieldReview.observations.length){const item=doc.createElement('li');item.textContent='Revisión completa sin observaciones de campos.';nodes.fieldRows.append(item);}
      }
      if (nodes.fieldReconciliation) {
        const comparison = diagnostic.fieldReconciliation;
        nodes.fieldReconciliation.textContent = comparison
          ? comparison.reconciled
            ? 'El total leído del TXT coincide exactamente con ambos totales declarados. No verifica la aprobación de la liquidación.'
            : `El TXT difiere en ${comparison.fileMinusDeclaredCents} centavos del total bancario declarado y en ${comparison.fileMinusApprovedPayrollCents} centavos del neto de liquidación declarado.`
          : 'Sin conciliación contra el total leído: completá los tres controles declarados y corregí todas las observaciones del archivo.';
        nodes.fieldReconciliation.dataset.state = comparison ? comparison.reconciled ? 'ok' : 'error' : 'warning';
      }
      if(nodes.blocked)nodes.blocked.textContent='Diseño 167 contrastado con la muestra municipal y su definición guardada. La generación y presentación bancaria siguen bloqueadas hasta identificar y validar el servicio receptor.';
    }
    const complete=diagnostic.structureMatches&&(!fieldReview||fieldReview.matchesObservedFields);
    const reconciled = (!diagnostic.reconciliation || diagnostic.reconciliation.reconciled)
      && (!diagnostic.fieldReconciliation || diagnostic.fieldReconciliation.reconciled);
    setStatus(
      complete && reconciled
        ? 'Diagnóstico local finalizado. La coincidencia estructural no acredita aceptación bancaria.'
        : 'Diagnóstico local finalizado con diferencias de estructura, campos o conciliación.',
      complete && reconciled ? 'ok' : 'error',
    );
  }

  async function submit(event) {
    event?.preventDefault?.();
    if (accessRetired()) return;
    if (state.busy) return;
    clearResult();
    const epoch=state.epoch;
    const file = nodes.file.files?.[0];
    if (!file || file.size < 1 || file.size > PAYROLL_BANK_MAX_FILE_BYTES) {
      setStatus('Seleccioná un archivo de entre 1 byte y 4 MiB.', 'error');
      return;
    }
    setBusy(true);
    setStatus('Analizando estructura y calculando huella en este navegador…', 'warning');
    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      if(epoch!==state.epoch || accessRetired())return;
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
      if(epoch!==state.epoch || accessRetired())return;
      state.diagnostic = diagnostic;
      render(diagnostic);
    } catch (error) {
      if(epoch===state.epoch)setStatus(messageFor(error), 'error');
    } finally {
      bytes?.fill(0);
      if(epoch===state.epoch)setBusy(false);
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
    setStatus(file ? 'Archivo seleccionado. Presioná Validar archivo bancario para revisarlo.' : 'Elegí un archivo para iniciar la revisión.', '');
  });
  for (const node of [nodes.scope,nodes.payrollRows,nodes.payrollCents,nodes.bankCents]) node?.addEventListener('input', () => {
    clearResult();
    setStatus('Los controles cambiaron. Volvé a validar el archivo antes de descargar.', '');
  });
  nodes.exportObservations?.addEventListener('click',()=>{
    if(state.busy||!state.diagnostic?.fieldReview||accessRetired())return;
    const artifact=transfersVarObservationsCsv(state.diagnostic.fieldReview);
    if(options.download){options.download(artifact);return;}
    const url=URL.createObjectURL(new Blob([artifact.bytes],{type:'text/csv;charset=utf-8'})),link=doc.createElement('a');
    link.href=url;link.download=artifact.filename;link.click();URL.revokeObjectURL(url);
  });
  doc.addEventListener?.('visibilitychange',()=>{
    if(doc.visibilityState!=='hidden')return;
    clearResult();setBusy(false);nodes.file.value='';
    if(nodes.fileState)nodes.fileState.textContent='El archivo se retiró al ocultar la pantalla.';
    setStatus('La revisión se retiró al ocultar la pantalla. Elegí el archivo y revisalo nuevamente.','');
  });
  function retireAccess() {
    clearResult();
    nodes.file.value = '';
    if (nodes.fileState) nodes.fileState.textContent = 'Archivo y revisión retirados por cambio de acceso.';
    setStatus('El acceso cambió. Se retiraron el archivo y la revisión.', '');
  }
  doc.addEventListener?.('municontrol:capabilities-ready', (event) => {
    state.revoked = !event.detail?.tenantCapabilities?.has('payroll.read');
    retireAccess();
  });
  if (typeof MutationObserver !== 'undefined' && doc.documentElement) {
    new MutationObserver(() => {
      if (doc.documentElement.getAttribute('data-mc-capability-state') === 'denied') retireAccess();
    }).observe(doc.documentElement, {attributes: true, attributeFilter: ['data-mc-capability-state']});
  }
  nodes.form.addEventListener('submit', submit);
  nodes.reset?.addEventListener('click', () => {
    clearResult();setBusy(false);
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
  const layout=root.querySelector('[data-bank-diagnostic-layout]');
  if(layout)for(const field of TRANSFERS_VAR_FIELDS){const item=doc.createElement('li');item.textContent=`${field.label}: posiciones ${field.first}–${field.last}`;layout.append(item);}
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
