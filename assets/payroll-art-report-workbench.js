import {
  PAYROLL_ART_INPUT_CONTRACT_VERSION,
  PAYROLL_ART_MAX_ROWS,
  PayrollArtReportError,
  buildPayrollArtReport,
  createPayrollArtCsvBundle,
} from './payroll-art-report.js';
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
  return `Descargar ${artifact.kind} CSV`;
}

function errorMessage(error) {
  if (!(error instanceof PayrollArtReportError)) return 'No se pudo generar el control ART.';
  const known = {
    ART_INPUT_CONTRACT_INVALID: 'El archivo o el contexto no cumplen el contrato ART.',
    ART_TOTAL_OUT_OF_RANGE: 'Los totales superan el rango exacto permitido.',
    ART_CRYPTO_UNAVAILABLE: 'El navegador no dispone de identificación criptográfica.',
    ART_CRYPTO_FAILED: 'No se pudo calcular la huella del reporte.',
  };
  return known[error.code] || error.message;
}

export function createPayrollArtReportWorkbench(root, options = {}) {
  if (!root) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const locationImpl = options.locationImpl || globalThis.location;
  const nodes = {
    status: root.querySelector('[data-art-status]'),
    gate: root.querySelector('[data-art-gate]'),
    form: root.querySelector('[data-art-form]'),
    period: root.querySelector('[data-art-period]'),
    scope: root.querySelector('[data-art-scope]'),
    snapshot: root.querySelector('[data-art-snapshot]'),
    cutoff: root.querySelector('[data-art-cutoff]'),
    file: root.querySelector('[data-art-file]'),
    fileState: root.querySelector('[data-art-file-state]'),
    submit: root.querySelector('[data-art-submit]'),
    reset: root.querySelector('[data-art-reset]'),
    result: root.querySelector('[data-art-result]'),
    state: root.querySelector('[data-art-result-state]'),
    sourceRows: root.querySelector('[data-art-source-rows]'),
    accepted: root.querySelector('[data-art-accepted]'),
    rejected: root.querySelector('[data-art-rejected]'),
    salary: root.querySelector('[data-art-salary]'),
    fingerprint: root.querySelector('[data-art-fingerprint]'),
    rejectedList: root.querySelector('[data-art-rejected-list]'),
    downloads: root.querySelector('[data-art-downloads]'),
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
    const next = `${locationImpl.pathname.split('/').pop() || 'nomina-control.html'}${locationImpl.hash || ''}`;
    locationImpl.replace(`login.html?next=${encodeURIComponent(next)}`);
  }

  function clearResult() {
    state.report = null;
    state.bundle = null;
    nodes.result.hidden = true;
    nodes.downloads.replaceChildren();
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
      setStatus('Contexto validado. Elegí una fuente canónica para generar el control.', 'ok');
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
    nodes.state.textContent = report.readyForReview ? 'Listo para revisión autorizada' : 'Bloqueado por validaciones';
    nodes.state.className = `state-badge ${report.readyForReview ? 'closed' : 'blocked'}`;
    nodes.sourceRows.textContent = String(report.summary.sourceRows);
    nodes.accepted.textContent = String(report.summary.acceptedRows);
    nodes.rejected.textContent = String(report.summary.rejectedRows);
    nodes.salary.textContent = formatPayrollAmountCents(report.summary.salaryTotalCents);
    nodes.fingerprint.textContent = report.traceability.reportSha256;
    nodes.rejectedList.replaceChildren();
    if (!report.rejectedRows.length) {
      const item = document.createElement('li');
      item.dataset.state = 'ok';
      item.textContent = 'No se rechazaron filas.';
      nodes.rejectedList.append(item);
    } else {
      report.rejectedRows.forEach((row) => {
        const item = document.createElement('li');
        item.dataset.state = 'warning';
        item.textContent = `Fila ${row.rowNumber}: ${row.errorCodes.join(', ')}`;
        nodes.rejectedList.append(item);
      });
    }
    nodes.downloads.replaceChildren();
    bundle.files.forEach((artifact) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button';
      button.textContent = artifactLabel(artifact);
      button.addEventListener('click', () => downloadArtifact(artifact));
      nodes.downloads.append(button);
    });
    setStatus(
      report.readyForReview
        ? 'Control generado sin errores de fila. Disponible para revisión humana autorizada.'
        : `Control bloqueado: ${report.summary.rejectedRows} filas requieren corrección.`,
      report.readyForReview ? 'ok' : 'error',
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (state.busy || !state.principal) return;
    clearResult();
    const file = nodes.file.files?.[0];
    if (!PERIOD.test(nodes.period.value) || !['all', '42', '55'].includes(nodes.scope.value)
      || !SNAPSHOT_ID.test(nodes.snapshot.value) || !nodes.cutoff.value || !file) {
      setStatus('Completá período, ámbito, identificador de fuente, corte y archivo.', 'error');
      return;
    }
    if (file.size < 1 || file.size > PAYROLL_ART_MAX_SOURCE_BYTES) {
      setStatus('El CSV debe pesar entre 1 byte y 2 MiB.', 'error');
      return;
    }
    const cutoff = new Date(nodes.cutoff.value);
    if (Number.isNaN(cutoff.valueOf())) {
      setStatus('La fecha de corte no es válida.', 'error');
      return;
    }
    setBusy(true);
    setStatus('Validando filas y calculando 993 + 995…', 'warning');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rows = parsePayrollArtCanonicalCsv(bytes);
      const report = await buildPayrollArtReport({
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

  nodes.file?.addEventListener('change', () => {
    clearResult();
    const file = nodes.file.files?.[0];
    nodes.fileState.textContent = file
      ? `${file.size} bytes listos; el archivo se procesa sólo en este navegador.`
      : 'No hay un archivo seleccionado.';
    nodes.fileState.dataset.state = file && file.size <= PAYROLL_ART_MAX_SOURCE_BYTES ? 'ready' : file ? 'error' : '';
  });
  nodes.form?.addEventListener('submit', submit);
  nodes.reset?.addEventListener('click', () => {
    nodes.form.reset();
    nodes.fileState.textContent = 'No hay un archivo seleccionado.';
    nodes.fileState.dataset.state = '';
    clearResult();
    setStatus('Contexto validado. Elegí una fuente canónica para generar el control.', 'ok');
  });
  authorize();
  return { authorize, submit, getState: () => ({ ...state }) };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-art-report-workbench]');
  if (root) createPayrollArtReportWorkbench(root);
}
