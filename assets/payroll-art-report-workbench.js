import {
  PAYROLL_ART_INPUT_CONTRACT_VERSION,
  PAYROLL_ART_NOELIA_INPUT_CONTRACT_VERSION,
  PAYROLL_ART_MAX_ROWS,
  PayrollArtReportError,
  buildPayrollArtNoeliaReport,
  buildPayrollArtReport,
  createPayrollArtCsvBundle,
  payrollArtValidationLabel,
} from './payroll-art-report.js';
import { reconcileNoeliaArtWorkbookMatrices } from './payroll-art-noelia-adapter.js';
import { createPayrollArtOfficePack } from './payroll-art-report-exporter.js';
import {
  PAYROLL_CONTROL_IMPORT_API,
  validatePayrollControlBootstrap,
  formatPayrollAmountCents,
} from './payroll-control-import-workflow.js';

export const PAYROLL_ART_CANONICAL_CSV_HEADER = Object.freeze([
  'liquidacion', 'jurisdiccion', 'legajo', 'dni', 'cuil', 'sexo',
  'dias_trabajados', 'concepto_993_ars', 'concepto_995_ars',
]);
export const PAYROLL_ART_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const PAYROLL_ART_MAX_XLSX_BYTES = 4 * 1024 * 1024;
export const PAYROLL_ART_REQUIRED_CAPABILITY = 'payroll.art_report.generate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SNAPSHOT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const MONEY = /^(?:0|[1-9][0-9]*),[0-9]{2}$/;

function fail(code, message) {
  throw new PayrollArtReportError(code, message);
}

function moneyToCents(value, rowNumber, column) {
  if (!MONEY.test(value)) {
    fail('ART_CSV_AMOUNT_INVALID', `Fila ${rowNumber}: ${column} debe usar pesos sin separador de miles y dos decimales con coma.`);
  }
  const [whole, fraction] = value.split(',');
  return (BigInt(whole) * 100n + BigInt(fraction)).toString();
}

export function parsePayrollArtCanonicalCsv(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > PAYROLL_ART_MAX_SOURCE_BYTES) {
    fail('ART_CSV_SIZE_INVALID', 'El CSV debe pesar entre 1 byte y 2 MiB.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    fail('ART_CSV_ENCODING_INVALID', 'El CSV debe estar codificado en UTF-8.');
  }
  if (text.includes('\u0000') || text.includes('\r') && !text.includes('\r\n')) {
    fail('ART_CSV_CONTENT_INVALID', 'El CSV contiene caracteres o saltos de línea no admitidos.');
  }
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < 2 || lines.length > PAYROLL_ART_MAX_ROWS + 1) {
    fail('ART_CSV_ROW_COUNT_INVALID', `El CSV debe contener entre 1 y ${PAYROLL_ART_MAX_ROWS} filas de datos.`);
  }
  if (lines[0] !== PAYROLL_ART_CANONICAL_CSV_HEADER.join(';')) {
    fail('ART_CSV_HEADER_INVALID', 'La cabecera no coincide con el formato ART canónico.');
  }
  return lines.slice(1).map((line, index) => {
    const rowNumber = index + 2;
    const values = line.split(';');
    if (values.length !== PAYROLL_ART_CANONICAL_CSV_HEADER.length || values.some((value) => value.trim() !== value)) {
      fail('ART_CSV_ROW_INVALID', `Fila ${rowNumber}: cantidad de columnas o espacios no admitidos.`);
    }
    const [
      liquidationId, jurisdiction, legajo, dni, cuil, sex, workedDays,
      concept993, concept995,
    ] = values;
    return {
      rowNumber,
      liquidationId,
      jurisdiction,
      legajo,
      dni,
      cuil,
      sex,
      workedDays,
      concept993Cents: moneyToCents(concept993, rowNumber, 'concepto_993_ars'),
      concept995Cents: moneyToCents(concept995, rowNumber, 'concepto_995_ars'),
    };
  });
}

async function sha256Bytes(bytes, cryptoImpl) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function loadXlsxReader(reader = globalThis.readXlsxFile) {
  if (typeof reader === 'function') return reader;
  try {
    await import('./vendor/read-excel-file.min.js');
  } catch {
    fail('ART_XLSX_READER_UNAVAILABLE', 'No se pudo iniciar el lector local de Excel.');
  }
  if (typeof globalThis.readXlsxFile !== 'function') {
    fail('ART_XLSX_READER_UNAVAILABLE', 'No se pudo iniciar el lector local de Excel.');
  }
  return globalThis.readXlsxFile;
}

async function readFirstXlsxMatrix(reader, file) {
  const result = await reader(file, {
    sheets: [1],
    parseNumber: (rawValue) => rawValue,
  });
  if (Array.isArray(result) && result.every((row) => Array.isArray(row))) return result;
  if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0]?.data)) {
    return result[0].data;
  }
  fail('ART_XLSX_MATRIX_INVALID', 'El Excel no contiene una primera hoja legible.');
}

function downloadArtifact(artifact, urlImpl = URL, documentImpl = document) {
  const payload = artifact.content ?? artifact.bytes;
  const blob = new Blob([payload], { type: artifact.mimeType });
  const url = urlImpl.createObjectURL(blob);
  const anchor = documentImpl.createElement('a');
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => urlImpl.revokeObjectURL(url), 0);
}

function artifactLabel(artifact) {
  if (artifact.fileName.endsWith('.xlsx')) return 'Descargar Excel';
  if (artifact.fileName.endsWith('.pdf')) return 'Descargar PDF';
  const labels = {
    detalle: 'Detalle',
    rechazados: 'Filas a corregir',
    resumen: 'Resumen',
    trazabilidad: 'Trazabilidad',
  };
  return labels[artifact.kind] || 'Archivo técnico';
}

function artifactAriaLabel(artifact) {
  if (artifact.fileName.endsWith('.xlsx')) return 'Descargar reporte ART en Excel';
  if (artifact.fileName.endsWith('.pdf')) return 'Descargar reporte ART en PDF';
  return `Descargar ${artifactLabel(artifact).toLocaleLowerCase('es-AR')} en CSV`;
}

function errorMessage(error) {
  if (!(error instanceof PayrollArtReportError)) {
    return error instanceof Error && error.message
      ? error.message : 'No se pudo generar el control ART.';
  }
  const known = {
    ART_INPUT_CONTRACT_INVALID: 'El archivo o el contexto no cumplen el contrato ART.',
    ART_TOTAL_OUT_OF_RANGE: 'Los totales superan el rango exacto permitido.',
    ART_CRYPTO_UNAVAILABLE: 'El navegador no dispone de identificación criptográfica.',
    ART_CRYPTO_FAILED: 'No se pudo calcular la huella del reporte.',
    ART_NOELIA_INPUT_CONTRACT_INVALID: 'Las dos planillas no pudieron cruzarse con el formato ART esperado.',
    ART_NOELIA_SOURCE_FILES_INVALID: 'No se pudieron identificar GALENO y SUSS como un par válido.',
    ART_XLSX_READER_UNAVAILABLE: 'No se pudo iniciar el lector local de Excel.',
    ART_XLSX_MATRIX_INVALID: 'El Excel no contiene una primera hoja legible.',
  };
  return known[error.code] || error.message;
}

export function createPayrollArtReportWorkbench(root, options = {}) {
  if (!root) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const locationImpl = options.locationImpl || globalThis.location;
  const xlsxReader = options.xlsxReader;
  const nodes = {
    status: root.querySelector('[data-art-status]'),
    gate: root.querySelector('[data-art-gate]'),
    form: root.querySelector('[data-art-form]'),
    period: root.querySelector('[data-art-period]'),
    mode: root.querySelector('[data-art-mode]'),
    scope: root.querySelector('[data-art-scope]'),
    snapshot: root.querySelector('[data-art-snapshot]'),
    cutoff: root.querySelector('[data-art-cutoff]'),
    periodError: root.querySelector('[data-art-period-error]'),
    snapshotError: root.querySelector('[data-art-snapshot-error]'),
    cutoffError: root.querySelector('[data-art-cutoff-error]'),
    file: root.querySelector('[data-art-file]'),
    fileState: root.querySelector('[data-art-file-state]'),
    galenoFile: root.querySelector('[data-art-galeno-file]'),
    galenoFileState: root.querySelector('[data-art-galeno-file-state]'),
    sussFile: root.querySelector('[data-art-suss-file]'),
    sussFileState: root.querySelector('[data-art-suss-file-state]'),
    modePanels: [...root.querySelectorAll('[data-art-mode-panel]')],
    submit: root.querySelector('[data-art-submit]'),
    reset: root.querySelector('[data-art-reset]'),
    result: root.querySelector('[data-art-result]'),
    state: root.querySelector('[data-art-result-state]'),
    sourceRows: root.querySelector('[data-art-source-rows]'),
    accepted: root.querySelector('[data-art-accepted]'),
    rejected: root.querySelector('[data-art-rejected]'),
    compared: root.querySelector('[data-art-compared]'),
    mismatches: root.querySelector('[data-art-mismatches]'),
    salary: root.querySelector('[data-art-salary]'),
    fingerprint: root.querySelector('[data-art-fingerprint]'),
    rejectedDetails: root.querySelector('[data-art-rejected-details]'),
    rejectedSummary: root.querySelector('[data-art-rejected-summary]'),
    rejectedList: root.querySelector('[data-art-rejected-list]'),
    primaryDownloads: root.querySelector('[data-art-primary-downloads]'),
    downloads: root.querySelector('[data-art-downloads]'),
    downloadsDetails: root.querySelector('[data-art-downloads-details]'),
  };
  const state = { principal: null, report: null, bundle: null, busy: false };

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(value) {
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, input, select').forEach((node) => { node.disabled = value; });
  }

  function redirectToLogin() {
    const next = `${locationImpl.pathname.split('/').pop() || 'nomina-control'}${locationImpl.hash || ''}`;
    locationImpl.replace(`login?next=${encodeURIComponent(next)}`);
  }

  function clearResult() {
    state.report = null;
    state.bundle = null;
    nodes.result.hidden = true;
    nodes.primaryDownloads?.replaceChildren();
    nodes.downloads.replaceChildren();
    if (nodes.downloadsDetails) nodes.downloadsDetails.open = false;
  }

  function updateMode() {
    const mode = nodes.mode?.value === 'csv' ? 'csv' : 'noelia';
    nodes.modePanels.forEach((panel) => {
      panel.hidden = panel.dataset.artModePanel !== mode;
    });
    clearResult();
    setStatus(
      mode === 'noelia'
        ? 'Elegí las planillas GALENO ART y SUSS del mismo período.'
        : 'Modo técnico: elegí un CSV canónico con jurisdicción y legajo.',
      'ok',
    );
  }

  function setFieldError(field, errorNode, message = '') {
    if (!field) return;
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (!errorNode) return;
    errorNode.textContent = message;
    errorNode.hidden = !message;
  }

  function setFileError(input, stateNode, message) {
    if (input) input.setAttribute('aria-invalid', 'true');
    if (!stateNode) return;
    stateNode.textContent = message;
    stateNode.dataset.state = 'error';
  }

  function showFileState(input, stateNode, file, maximum, friendlyName = 'archivo') {
    if (!stateNode) return true;
    if (!file) {
      if (input) input.setAttribute('aria-invalid', 'false');
      stateNode.textContent = 'No hay un archivo seleccionado.';
      stateNode.dataset.state = '';
      return true;
    }
    if (file.size < 1) {
      setFileError(input, stateNode, `El ${friendlyName} está vacío. Elegí otro archivo.`);
      return false;
    }
    if (file.size > maximum) {
      const limit = maximum === PAYROLL_ART_MAX_XLSX_BYTES ? '4 MiB' : '2 MiB';
      setFileError(input, stateNode, `El ${friendlyName} supera el máximo de ${limit}. Elegí un archivo más liviano.`);
      return false;
    }
    if (input) input.setAttribute('aria-invalid', 'false');
    stateNode.textContent = `${file.size} bytes listos; se procesa sólo en este navegador.`;
    stateNode.dataset.state = 'ready';
    return true;
  }

  function focusFirstInvalid(invalidFields) {
    const first = invalidFields.find((field) => field && typeof field.focus === 'function');
    if (!first) return;
    const view = root.ownerDocument?.defaultView;
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    first.focus({ preventScroll: true });
    first.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  function focusResult() {
    if (!nodes.result || nodes.result.hidden) return;
    const view = root.ownerDocument?.defaultView;
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    nodes.result.focus({ preventScroll: true });
    nodes.result.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  async function authorize() {
    setBusy(true);
    try {
      const response = await fetchImpl(`${PAYROLL_CONTROL_IMPORT_API}?resource=bootstrap`, {
        credentials: 'same-origin', headers: { Accept: 'application/json' },
      });
      if (response.status === 401) {
        redirectToLogin();
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !validatePayrollControlBootstrap(payload)) {
        throw new Error('No se pudo validar el contexto autorizado.');
      }
      const principal = payload.data.principal;
      const authorized = principal.reportCapabilities.includes(PAYROLL_ART_REQUIRED_CAPABILITY)
        && UUID.test(String(principal.tenantId || ''))
        && UUID.test(String(principal.membershipId || ''));
      if (!authorized) {
        nodes.form.hidden = true;
        nodes.gate.hidden = false;
        setStatus('Tu rol no tiene habilitada la generación local del reporte ART.', 'warning');
        return;
      }
      state.principal = principal;
      nodes.form.hidden = false;
      nodes.gate.hidden = true;
      setStatus('Contexto validado. Podés cruzar directamente las dos planillas reales de ART.', 'ok');
    } catch (error) {
      nodes.form.hidden = true;
      nodes.gate.hidden = false;
      setStatus(error instanceof Error ? error.message : 'No se pudo validar el contexto.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function render(report, bundle) {
    nodes.result.hidden = false;
    const presentation = {
      ready_for_authorized_review: {
        label: 'Listo para revisión autorizada', badge: 'closed', kind: 'ok',
        message: 'Control generado sin errores ni diferencias. Disponible para revisión autorizada.',
      },
      ready_with_observations: {
        label: 'Listo con diferencias informativas', badge: 'warning', kind: 'warning',
        message: `Reporte listo. Las ${report.summary.comparisonMismatches} diferencias contra SUSS son informativas y no alteran el cálculo 993 + 995.`,
      },
      generated_with_exceptions: {
        label: `Reporte generado con ${report.summary.rejectedRows} filas a corregir`, badge: 'warning', kind: 'warning',
        message: `Se generó el reporte con ${report.summary.acceptedRows} filas válidas. Las ${report.summary.rejectedRows} filas restantes están separadas con su origen y motivo para corregirlas.`,
      },
      blocked_by_validation: {
        label: 'Sin filas válidas para generar', badge: 'blocked', kind: 'error',
        message: `No se pudo generar detalle válido: ${report.summary.rejectedRows} filas requieren corrección.`,
      },
    }[report.status] || {
      label: 'Estado no reconocido', badge: 'blocked', kind: 'error',
      message: 'El reporte devolvió un estado no reconocido. Actualizá la pantalla antes de continuar.',
    };
    nodes.state.textContent = presentation.label;
    nodes.state.className = `state-badge ${presentation.badge}`;
    nodes.sourceRows.textContent = String(report.summary.sourceRows);
    nodes.accepted.textContent = String(report.summary.acceptedRows);
    nodes.rejected.textContent = String(report.summary.rejectedRows);
    if (nodes.compared) nodes.compared.textContent = String(report.summary.comparisonRows ?? '—');
    if (nodes.mismatches) nodes.mismatches.textContent = String(report.summary.comparisonMismatches ?? '—');
    nodes.salary.textContent = formatPayrollAmountCents(report.summary.salaryTotalCents);
    nodes.fingerprint.textContent = report.traceability.reportSha256;
    nodes.rejectedList.replaceChildren();
    if (!report.rejectedRows.length) {
      if (nodes.rejectedSummary) nodes.rejectedSummary.textContent = 'Sin filas a corregir';
      const item = document.createElement('li');
      item.dataset.state = 'ok';
      item.textContent = 'No se rechazaron filas.';
      nodes.rejectedList.append(item);
    } else {
      if (nodes.rejectedSummary) {
        nodes.rejectedSummary.textContent = `Ver ${report.rejectedRows.length} filas a corregir`;
      }
      report.rejectedRows.forEach((row) => {
        const item = document.createElement('li');
        item.dataset.state = 'warning';
        const origins = report.scope === 'municipal'
          ? `GALENO ${row.galenoRowNumbers?.join('|') || '—'} · SUSS ${row.sussRowNumbers?.join('|') || '—'}`
          : `Fila ${row.rowNumber}`;
        item.textContent = `${origins}: ${row.errorCodes.map(payrollArtValidationLabel).join(' ')}`;
        nodes.rejectedList.append(item);
      });
    }
    if (nodes.rejectedDetails) nodes.rejectedDetails.open = false;
    nodes.primaryDownloads?.replaceChildren();
    nodes.downloads.replaceChildren();
    bundle.files.forEach((artifact) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button';
      button.textContent = artifactLabel(artifact);
      button.setAttribute('aria-label', artifactAriaLabel(artifact));
      button.addEventListener('click', () => downloadArtifact(artifact));
      const isPrimary = artifact.fileName.endsWith('.xlsx') || artifact.fileName.endsWith('.pdf');
      (isPrimary && nodes.primaryDownloads ? nodes.primaryDownloads : nodes.downloads).append(button);
    });
    if (nodes.downloadsDetails) nodes.downloadsDetails.open = false;
    setStatus(presentation.message, presentation.kind);
    focusResult();
  }

  async function submit(event) {
    event.preventDefault();
    if (state.busy || !state.principal) return;
    clearResult();
    const mode = nodes.mode?.value === 'csv' ? 'csv' : 'noelia';
    const file = nodes.file?.files?.[0];
    const galenoFile = nodes.galenoFile?.files?.[0];
    const sussFile = nodes.sussFile?.files?.[0];
    const invalidFields = [];
    const markInvalid = (field, errorNode, message) => {
      setFieldError(field, errorNode, message);
      invalidFields.push(field);
    };
    setFieldError(nodes.period, nodes.periodError);
    setFieldError(nodes.snapshot, nodes.snapshotError);
    setFieldError(nodes.cutoff, nodes.cutoffError);
    if (!PERIOD.test(nodes.period.value)) {
      markInvalid(nodes.period, nodes.periodError, 'Elegí el mes que corresponde a las planillas.');
    }
    if (!SNAPSHOT_ID.test(nodes.snapshot.value)) {
      markInvalid(nodes.snapshot, nodes.snapshotError, 'Escribí un nombre con letras, números, puntos o guiones, sin espacios.');
    }
    if (!nodes.cutoff.value) {
      markInvalid(nodes.cutoff, nodes.cutoffError, 'Indicá hasta qué fecha y hora estaban actualizados los datos.');
    }
    if (mode === 'csv') {
      if (!['all', '42', '55'].includes(nodes.scope.value)) invalidFields.push(nodes.scope);
      if (!file) {
        setFileError(nodes.file, nodes.fileState, 'Elegí el CSV ART que querés procesar.');
        invalidFields.push(nodes.file);
      } else if (!showFileState(nodes.file, nodes.fileState, file, PAYROLL_ART_MAX_SOURCE_BYTES, 'CSV')) {
        invalidFields.push(nodes.file);
      }
    } else {
      if (!galenoFile) {
        setFileError(nodes.galenoFile, nodes.galenoFileState, 'Elegí la planilla GALENO ART.');
        invalidFields.push(nodes.galenoFile);
      } else if (!showFileState(nodes.galenoFile, nodes.galenoFileState, galenoFile, PAYROLL_ART_MAX_XLSX_BYTES, 'Excel GALENO')) {
        invalidFields.push(nodes.galenoFile);
      }
      if (!sussFile) {
        setFileError(nodes.sussFile, nodes.sussFileState, 'Elegí la plantilla SUSS / ART.');
        invalidFields.push(nodes.sussFile);
      } else if (!showFileState(nodes.sussFile, nodes.sussFileState, sussFile, PAYROLL_ART_MAX_XLSX_BYTES, 'Excel SUSS')) {
        invalidFields.push(nodes.sussFile);
      }
    }
    if (invalidFields.length) {
      setStatus(
        mode === 'csv'
          ? 'Completá período, ámbito, identificación, corte y CSV.'
          : 'Completá período, identificación, corte y las dos planillas Excel.',
        'error',
      );
      focusFirstInvalid(invalidFields);
      return;
    }
    const cutoff = new Date(nodes.cutoff.value);
    if (Number.isNaN(cutoff.valueOf())) {
      setFieldError(nodes.cutoff, nodes.cutoffError, 'La fecha y hora ingresadas no son válidas.');
      setStatus('La fecha de corte no es válida.', 'error');
      focusFirstInvalid([nodes.cutoff]);
      return;
    }
    setBusy(true);
    setStatus(
      mode === 'noelia'
        ? 'Cruzando GALENO y SUSS por CUIL; calculando 993 + 995…'
        : 'Validando filas y calculando 993 + 995…',
      'warning',
    );
    try {
      let report;
      if (mode === 'noelia') {
        const reader = await loadXlsxReader(xlsxReader);
        const [galenoBytes, sussBytes, galenoRows, sussRows] = await Promise.all([
          galenoFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
          sussFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
          readFirstXlsxMatrix(reader, galenoFile),
          readFirstXlsxMatrix(reader, sussFile),
        ]);
        const [galenoSha256, sussSha256] = await Promise.all([
          sha256Bytes(galenoBytes, cryptoImpl),
          sha256Bytes(sussBytes, cryptoImpl),
        ]);
        const sourceSha256 = await sha256Bytes(
          new TextEncoder().encode(`${galenoSha256}\n${sussSha256}`), cryptoImpl,
        );
        const reconciled = reconcileNoeliaArtWorkbookMatrices({ galenoRows, sussRows });
        report = await buildPayrollArtNoeliaReport({
          contractVersion: PAYROLL_ART_NOELIA_INPUT_CONTRACT_VERSION,
          tenantId: state.principal.tenantId,
          actorId: state.principal.membershipId,
          requestedAt: new Date().toISOString(),
          period: nodes.period.value,
          source: {
            snapshotId: nodes.snapshot.value,
            sha256: sourceSha256,
            cutoffAt: cutoff.toISOString(),
            rowCount: reconciled.rows.length,
            includesPersonalRecords: true,
            sourceFiles: [
              {
                kind: 'galeno', sha256: galenoSha256,
                rowCount: reconciled.summary.galenoDataRows,
              },
              {
                kind: 'suss', sha256: sussSha256,
                rowCount: reconciled.summary.sussDataRows,
              },
            ],
          },
          rows: reconciled.rows,
        }, { cryptoImpl });
        galenoBytes.fill(0);
        sussBytes.fill(0);
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const rows = parsePayrollArtCanonicalCsv(bytes);
        report = await buildPayrollArtReport({
          contractVersion: PAYROLL_ART_INPUT_CONTRACT_VERSION,
          tenantId: state.principal.tenantId,
          actorId: state.principal.membershipId,
          requestedAt: new Date().toISOString(),
          period: nodes.period.value,
          scope: nodes.scope.value,
          source: {
            snapshotId: nodes.snapshot.value,
            sha256: await sha256Bytes(bytes, cryptoImpl),
            cutoffAt: cutoff.toISOString(),
            rowCount: rows.length,
            includesPersonalRecords: true,
          },
          rows,
        }, { cryptoImpl });
        bytes.fill(0);
      }
      const [csvBundle, officePack] = await Promise.all([
        createPayrollArtCsvBundle(report, { cryptoImpl }),
        createPayrollArtOfficePack(report, { cryptoImpl }),
      ]);
      const bundle = Object.freeze({
        files: Object.freeze([...csvBundle.files, ...officePack.files]),
        csvBundle,
        officePack,
      });
      state.report = report;
      state.bundle = bundle;
      render(report, bundle);
    } catch (error) {
      setStatus(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  nodes.period?.addEventListener('input', () => {
    if (PERIOD.test(nodes.period.value)) setFieldError(nodes.period, nodes.periodError);
  });
  nodes.snapshot?.addEventListener('input', () => {
    if (SNAPSHOT_ID.test(nodes.snapshot.value)) setFieldError(nodes.snapshot, nodes.snapshotError);
  });
  nodes.cutoff?.addEventListener('input', () => {
    if (nodes.cutoff.value) setFieldError(nodes.cutoff, nodes.cutoffError);
  });
  nodes.file?.addEventListener('change', () => {
    clearResult();
    const file = nodes.file.files?.[0];
    showFileState(nodes.file, nodes.fileState, file, PAYROLL_ART_MAX_SOURCE_BYTES, 'CSV');
  });
  nodes.galenoFile?.addEventListener('change', () => {
    clearResult();
    showFileState(nodes.galenoFile, nodes.galenoFileState, nodes.galenoFile.files?.[0], PAYROLL_ART_MAX_XLSX_BYTES, 'Excel GALENO');
  });
  nodes.sussFile?.addEventListener('change', () => {
    clearResult();
    showFileState(nodes.sussFile, nodes.sussFileState, nodes.sussFile.files?.[0], PAYROLL_ART_MAX_XLSX_BYTES, 'Excel SUSS');
  });
  nodes.mode?.addEventListener('change', updateMode);
  nodes.form?.addEventListener('submit', submit);
  nodes.reset?.addEventListener('click', () => {
    nodes.form.reset();
    setFieldError(nodes.period, nodes.periodError);
    setFieldError(nodes.snapshot, nodes.snapshotError);
    setFieldError(nodes.cutoff, nodes.cutoffError);
    showFileState(nodes.file, nodes.fileState, null, PAYROLL_ART_MAX_SOURCE_BYTES, 'CSV');
    showFileState(nodes.galenoFile, nodes.galenoFileState, null, PAYROLL_ART_MAX_XLSX_BYTES, 'Excel GALENO');
    showFileState(nodes.sussFile, nodes.sussFileState, null, PAYROLL_ART_MAX_XLSX_BYTES, 'Excel SUSS');
    clearResult();
    updateMode();
  });
  updateMode();
  authorize();
  return { authorize, submit, getState: () => ({ ...state }) };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-art-report-workbench]');
  if (root) createPayrollArtReportWorkbench(root);
}
