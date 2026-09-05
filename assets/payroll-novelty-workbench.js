import { downloadPayrollNoveltyCsv } from './payroll-novelty-exporter.js';
import { downloadPayrollNoveltyXlsx } from './payroll-novelty-xlsx-exporter.js';
import { parsePayrollNoveltyRetro } from './payroll-novelty-retro-import.js';
import { parseGuaranteeXlsx, GUARANTEE_XLSX_MAX_BYTES } from './payroll-guarantee-xlsx-import.js';

const API_URL = '/api/internal-payroll-novelties';
const LOGIN_URL = 'login.html?next=novedades-nomina.html';
const MAX_ROWS = 500;
const PAYROLL_NOVELTY_HANDOFF_KEY = 'municontrol.payroll-novelty-handoff.v1';
const PAYROLL_NOVELTY_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_COMMANDS = new Set(['submit', 'approve', 'reject', 'cancel']);
const STATE_LABELS = Object.freeze({
  draft: 'Borrador validado',
  submitted: 'Pendiente de aprobación',
  approved: 'Aprobado para exportar',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
});
const TYPE_LABELS = Object.freeze({
  monthly: 'Mensual',
  first_fortnight: 'Primera quincena',
  sac: 'SAC',
  vacation: 'Vacaciones',
  supplementary: 'Complementaria',
  final: 'Liquidación final',
  other: 'Otra',
});
const ISSUE_LABELS = Object.freeze({
  duplicate_business_key: 'Duplicada en el lote',
  concept_not_observed: 'Concepto aún no observado en GRH publicado',
  cost_center_not_observed: 'Centro de costo aún no observado',
  movement_type_not_observed: 'Tipo de movimiento aún no observado',
  already_observed: 'Novedad ya observada en el período',
  existing_movement_conflict: 'Conflicto con un movimiento existente',
  legacy_payroll_type_unclassified: 'Tipo GRH pendiente de homologación',
});

function issueLabel(issue) {
  const code = String(issue?.code || '');
  if (code !== 'legacy_payroll_type_unclassified') {
    return ISSUE_LABELS[code] || code || 'Validación';
  }
  const details = issue?.details && typeof issue.details === 'object'
    ? issue.details : {};
  if (details.basis === 'published_grh_same_period'
      && details.reason === 'versioned_payroll_type_mapping_required') {
    return 'Existe un movimiento GRH coincidente cuyo tipo aún no está homologado. Pedí clasificar ese código antes de enviar la novedad.';
  }
  return 'El tipo GRH necesita revisión y homologación antes de enviar la novedad.';
}

const byId = (id) => document.getElementById(id);
let bootstrapState = null;
let preparedDraft = null;
let preparedDraftKey = null;
let preparedEntryMode = null;
let selectedBatchId = null;
let redirectIssued = false;
let agileDraftRows = [];
let agileTemplate = null;
let handoffRequiresPayrollTypeSelection = false;
let fileReadVersion = 0;
let fileReadPending = false;
let fileReadError = null;
let guaranteeFileBytes = null;
let guaranteeReport = null;
let draftRevision = 0;
let preflightPending = false;
const pendingTransitionAttempts = new Map();

const AGILE_TEMPLATE_FIELD_IDS = Object.freeze([
  'periodMonth', 'payrollType', 'conceptSourceId', 'costCenterSourceId',
  'adjustmentMonth', 'quantityDecimal', 'amountArs', 'movementType',
  'legalInstrument', 'observation', 'forced',
]);

function setBusy(value, label = '') {
  document.body.dataset.busy = value ? 'true' : 'false';
  for (const button of document.querySelectorAll('button')) button.disabled = Boolean(value);
  if (!value) {
    byId('prepareButton').disabled = preparedDraft === null || fileReadPending || !hasCapability('payroll.novelty.prepare');
    byId('preflightButton').disabled = fileReadPending || !hasCapability('payroll.novelty.prepare');
    renderAgileRows();
  }
  byId('busyStatus').hidden = !value;
  byId('busyStatus').textContent = label || 'Procesando solicitud…';
}

function showMessage(kind, title, detail = '') {
  const host = byId('messageHost');
  host.hidden = false;
  host.dataset.kind = kind;
  host.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  host.appendChild(strong);
  if (detail) {
    const paragraph = document.createElement('p');
    paragraph.textContent = detail;
    host.appendChild(paragraph);
  }
}

function clearMessage() {
  byId('messageHost').hidden = true;
  byId('messageHost').replaceChildren();
}

function invalidatePreparedDraft() {
  draftRevision += 1;
  guaranteeReport = null;
  preparedDraft = null;
  preparedDraftKey = null;
  preparedEntryMode = null;
  byId('previewPanel').hidden = true;
  byId('prepareButton').disabled = true;
  byId('retroReport').hidden = true;
  byId('retroReport').replaceChildren();
  byId('guaranteeReport').hidden = true;
  byId('guaranteeReport').replaceChildren();
}

function errorMessage(error) {
  if (error?.payload?.error) {
    const ordinal = Number(error.payload?.details?.rowOrdinal);
    return Number.isSafeInteger(ordinal)
      ? `${error.payload.error} Revisá la fila ${ordinal}.`
      : error.payload.error;
  }
  return error instanceof Error ? error.message : 'La operación no pudo completarse.';
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  if (response.status === 401) {
    if (!redirectIssued) {
      redirectIssued = true;
      location.replace(LOGIN_URL);
    }
    throw new Error('La sesión venció.');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok !== true) {
    const error = new Error(payload?.error || `La API respondió ${response.status}.`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function exactMonth(value, name, { nullable = false } = {}) {
  if (!value && nullable) return null;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value || '')) {
    throw new Error(`${name} debe tener un mes válido.`);
  }
  const month = `${value}-01`;
  if (month < '2008-01-01' || month > '2099-12-01') {
    throw new Error(`${name} debe estar entre enero de 2008 y diciembre de 2099.`);
  }
  return month;
}

function nullable(value) {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}

function canonicalDecimal(value, name) {
  const normalized = nullable(value);
  if (normalized === null) return null;
  const canonical = normalized.replace(',', '.');
  if (!/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(canonical)
      || canonical === '-0' || /^-0\.0+$/.test(canonical)) {
    throw new Error(`${name} debe ser un decimal exacto, sin separadores de miles.`);
  }
  return canonical;
}

function amountToCents(value) {
  const raw = nullable(value);
  if (raw === null) return null;
  const canonical = raw.replace(',', '.');
  const match = /^(-?)(0|[1-9]\d{0,15})(?:\.([0-9]{1,2}))?$/.exec(canonical);
  if (!match) throw new Error('El importe debe tener hasta dos decimales y no usar separadores de miles.');
  const cents = (BigInt(match[2]) * 100n) + BigInt((match[3] || '').padEnd(2, '0') || '0');
  if (match[1] && cents === 0n) throw new Error('El importe no admite cero negativo.');
  return (match[1] ? -cents : cents).toString();
}

function parseBoolean(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['si', 'sí', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0', ''].includes(normalized)) return false;
  throw new Error('Forzado debe indicar SI o NO.');
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ';' && !quoted) {
      cells.push(current);
      current = '';
    } else current += char;
  }
  if (quoted) throw new Error('Hay una comilla sin cerrar en el archivo.');
  cells.push(current);
  return cells;
}

function rowFromValues(values, ordinal, periodMonth) {
  const [
    legajoValue, conceptValue, costCenterValue, adjustmentValue, quantityValue,
    amountValue, movementValue, legalValue, observationValue, forcedValue,
  ] = values;
  const legajo = String(legajoValue || '').trim();
  const conceptSourceId = String(conceptValue || '').trim();
  const costCenterSourceId = nullable(costCenterValue);
  if (!/^(?:0|[1-9]\d{0,19})$/.test(legajo)) throw new Error(`Fila ${ordinal}: legajo inválido.`);
  if (!/^(?:0|[1-9]\d{0,19})$/.test(conceptSourceId)) throw new Error(`Fila ${ordinal}: concepto inválido.`);
  if (costCenterSourceId && !/^(?:0|[1-9]\d{0,19})$/.test(costCenterSourceId)) {
    throw new Error(`Fila ${ordinal}: centro de costo inválido.`);
  }
  const adjustmentMonth = exactMonth(String(adjustmentValue || '').trim(), 'Mes de ajuste', { nullable: true });
  if (adjustmentMonth && adjustmentMonth > periodMonth) {
    throw new Error(`Fila ${ordinal}: el mes de ajuste supera el período.`);
  }
  const quantityDecimal = canonicalDecimal(quantityValue, 'Unidades');
  const amountCents = amountToCents(amountValue);
  if (quantityDecimal === null && amountCents === null) {
    throw new Error(`Fila ${ordinal}: informá unidades o importe.`);
  }
  const movementType = nullable(movementValue);
  if (movementType && !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(movementType.toLowerCase())) {
    throw new Error(`Fila ${ordinal}: movimiento inválido.`);
  }
  const legalInstrument = nullable(legalValue);
  const observation = nullable(observationValue);
  if ((legalInstrument?.length || 0) > 160 || (observation?.length || 0) > 500
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(legalInstrument || '')
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(observation || '')) {
    throw new Error(`Fila ${ordinal}: instrumento u observación demasiado extensos.`);
  }
  const forced = parseBoolean(forcedValue);
  if (forced && (amountCents === null || !observation || observation.length < 10)) {
    throw new Error(`Fila ${ordinal}: una novedad forzada exige importe y justificación.`);
  }
  return {
    rowOrdinal: ordinal,
    legajo,
    conceptSourceId,
    costCenterSourceId,
    adjustmentMonth,
    quantityDecimal,
    amountCents,
    movementType: movementType ? movementType.toLowerCase() : null,
    legalInstrument,
    observation,
    forced,
  };
}

function currentEntryValues() {
  return [
    byId('legajo').value,
    byId('conceptSourceId').value,
    byId('costCenterSourceId').value,
    byId('adjustmentMonth').value,
    byId('quantityDecimal').value,
    byId('amountArs').value,
    byId('movementType').value,
    byId('legalInstrument').value,
    byId('observation').value,
    byId('forced').checked ? 'SI' : 'NO',
  ];
}

function individualRows(periodMonth) {
  return [rowFromValues(currentEntryValues(), 1, periodMonth)];
}

function agileRows(periodMonth) {
  if (!agileDraftRows.length) {
    throw new Error('Agregá al menos un legajo a la carga rápida antes de validar.');
  }
  const rows = agileDraftRows.map((row, index) => ({ ...row, rowOrdinal: index + 1 }));
  for (const row of rows) {
    if (row.adjustmentMonth && row.adjustmentMonth > periodMonth) {
      throw new Error(`Fila ${row.rowOrdinal}: el mes de ajuste supera el período actual.`);
    }
  }
  return rows;
}

function bulkRows(periodMonth) {
  if (fileReadPending) throw new Error('Esperá a que termine la lectura del archivo antes de validar.');
  if (fileReadError) throw new Error(fileReadError);
  if (byId('bulkFormat').value === 'guarantee') {
    if (!guaranteeReport?.ok || guaranteeReport.source.period !== periodMonth.slice(0, 7)) {
      throw new Error('Cargá el Excel de garantía y volvé a validarlo para este período.');
    }
    return guaranteeReport.rows.map((row, index) => ({
      rowOrdinal: index + 1, legajo: row.legajo, conceptSourceId: row.conceptCode,
      amountCents: amountToCents(row.amountDecimal), quantityDecimal: null,
      costCenterSourceId: null, adjustmentMonth: null, movementType: null,
      legalInstrument: null, observation: null, forced: false,
    }));
  }
  if (byId('bulkFormat').value === 'retro') {
    const report = parsePayrollNoveltyRetro(byId('bulkSource').value, {
      conceptSourceId: byId('retroConceptSourceId').value,
    });
    renderRetroReport(report);
    if (!report.ok) {
      const error = new Error('Corregí las filas indicadas en el contenido o seleccioná el TXT RETRO correcto. Se conserva el archivo y no se preparará un subconjunto.');
      error.retroReport = report;
      throw error;
    }
    return report.rows;
  }
  const text = byId('bulkSource').value.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('Pegá o cargá un CSV antes de validar.');
  if (new TextEncoder().encode(text).byteLength > 480 * 1024) {
    throw new Error('El archivo supera el límite operativo de 480 KiB.');
  }
  const lines = text.split('\n');
  const expected = [
    'legajo', 'concepto', 'centro_costo', 'mes_ajuste', 'unidades', 'importe_ars',
    'movimiento', 'instrumento_legal', 'observacion', 'forzado',
  ];
  const header = parseCsvLine(lines.shift() || '').map((cell) => cell.trim().toLowerCase());
  if (JSON.stringify(header) !== JSON.stringify(expected)) {
    throw new Error(`El encabezado debe ser: ${expected.join(';')}`);
  }
  if (lines.length < 1 || lines.length > MAX_ROWS) {
    throw new Error(`El lote debe tener entre 1 y ${MAX_ROWS} filas.`);
  }
  const rows = lines.map((line, index) => {
    const cells = parseCsvLine(line);
    if (cells.length !== expected.length) throw new Error(`Fila ${index + 1}: cantidad de columnas inválida.`);
    return rowFromValues(cells, index + 1, periodMonth);
  });
  return rows;
}

function renderRetroReport(report) {
  const host = byId('retroReport');
  host.replaceChildren();
  host.hidden = false;
  host.dataset.kind = report.ok ? 'success' : 'error';
  const summary = document.createElement('strong');
  summary.textContent = `${report.acceptedCount} filas con formato válido · ${report.rejectedCount} filas rechazadas · ${report.totalRows} filas leídas.`;
  host.appendChild(summary);
  const note = document.createElement('p');
  note.textContent = report.ok
    ? 'Revisá concepto, período y tipo de liquidación antes de crear el lote. El servidor todavía debe validar legajos, conceptos y movimientos existentes.'
    : 'Todo el lote queda bloqueado hasta corregir las filas rechazadas. Las filas válidas no se enviarán por separado.';
  host.appendChild(note);
  if (report.errors.length) {
    const list = document.createElement('ul');
    for (const error of report.errors) {
      const item = document.createElement('li');
      item.textContent = `Fila ${error.rowOrdinal}: ${error.message}`;
      list.appendChild(item);
    }
    host.appendChild(list);
  }
}

function renderGuaranteeReport(report) {
  const host = byId('guaranteeReport');
  host.replaceChildren();
  host.hidden = false;
  host.dataset.kind = report.ok ? 'success' : 'error';
  const title = document.createElement('strong');
  title.textContent = report.ok
    ? `${report.summary.rowCount} legajos · concepto 195 · total ${moneyFromCents(report.summary.totalAmountCents)}`
    : 'Revisá el Excel: no se enviará ninguna fila hasta resolver los errores.';
  host.appendChild(title);
  const note = document.createElement('p');
  note.textContent = report.ok
    ? `${report.summary.roundingCount} importes con más de dos decimales se redondearon por persona al centavo más cercano (medio centavo hacia arriba). El total suma esos importes; puede diferir del total de Excel sin redondear. No se recalcularon las fórmulas.`
    : 'El archivo queda disponible en esta pestaña. Corregilo en Excel, guardalo y volvé a seleccionarlo.';
  host.appendChild(note);
  if (report.issues.length) {
    const list = document.createElement('ul');
    for (const issue of report.issues.slice(0, 25)) {
      const item = document.createElement('li');
      item.textContent = `Fila ${issue.rowNumber}${issue.column ? ` · columna ${issue.column}` : ''}: ${issue.message}`;
      list.appendChild(item);
    }
    host.appendChild(list);
  }
}

function duplicateCheck(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = [
      row.legajo, row.conceptSourceId, row.costCenterSourceId || '',
      row.adjustmentMonth || '', row.movementType || '',
    ].join('|');
    if (seen.has(key)) {
      throw new Error(`Fila ${row.rowOrdinal}: duplica la fila ${seen.get(key)}.`);
    }
    seen.set(key, row.rowOrdinal);
  }
}

function buildDraft() {
  const entryMode = document.querySelector('[name="sourceMode"]:checked')?.value;
  const periodMonth = entryMode === 'agile' && agileTemplate
    ? agileTemplate.periodMonth
    : exactMonth(byId('periodMonth').value, 'Período');
  const payrollType = entryMode === 'agile' && agileTemplate
    ? agileTemplate.payrollType
    : byId('payrollType').value;
  const allowedTypes = bootstrapState?.limits?.payrollTypes || [];
  if (!allowedTypes.includes(payrollType)) throw new Error('El tipo de liquidación no está habilitado.');
  const rows = entryMode === 'bulk'
    ? bulkRows(periodMonth)
    : entryMode === 'agile'
      ? agileRows(periodMonth)
      : individualRows(periodMonth);
  duplicateCheck(rows);
  const sourceMode = entryMode === 'agile' ? 'bulk' : entryMode;
  return { sourceMode, periodMonth, payrollType, rows };
}

function moneyFromCents(value) {
  if (value === null || value === undefined || value === '') return '—';
  const cents = BigInt(String(value));
  const sign = cents < 0n ? '-' : '';
  const unsigned = cents < 0n ? -cents : cents;
  return `${sign}$ ${(unsigned / 100n).toLocaleString('es-AR')},${String(unsigned % 100n).padStart(2, '0')}`;
}

function renderPreflight(draft) {
  const body = byId('previewRows');
  body.replaceChildren();
  for (const row of draft.rows.slice(0, 25)) {
    const tr = document.createElement('tr');
    for (const value of [
      row.rowOrdinal,
      row.legajo,
      row.conceptSourceId,
      row.quantityDecimal ?? '—',
      moneyFromCents(row.amountCents),
      row.forced ? 'Sí' : 'No',
      row.observation || '—',
    ]) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  const modeLabel = preparedEntryMode === 'agile' ? 'Carga rápida: '
    : preparedEntryMode === 'bulk' && byId('bulkFormat').value === 'guarantee'
      ? `Excel de garantía · concepto 195 · ${draft.periodMonth.slice(0, 7)} · ${TYPE_LABELS[draft.payrollType]}: `
    : preparedEntryMode === 'bulk' && byId('bulkFormat').value === 'retro'
      ? `TXT RETRO · concepto ${draft.rows[0].conceptSourceId} · ${draft.periodMonth.slice(0, 7)} · ${TYPE_LABELS[draft.payrollType]}: ` : '';
  byId('previewCaption').textContent = draft.rows.length > 25
    ? `${modeLabel}se muestran 25 de ${draft.rows.length} filas válidas.`
    : `${modeLabel}${draft.rows.length} fila${draft.rows.length === 1 ? '' : 's'} válida${draft.rows.length === 1 ? '' : 's'}.`;
  byId('previewPanel').hidden = false;
  byId('prepareButton').disabled = !hasCapability('payroll.novelty.prepare') || fileReadPending;
}

function capabilitySet(principal = bootstrapState?.principal) {
  return new Set(Array.isArray(principal?.capabilities) ? principal.capabilities : []);
}

function hasCapability(capability, principal = bootstrapState?.principal) {
  return capabilitySet(principal).has(capability);
}

function capabilityText(principal) {
  const capabilities = capabilitySet(principal);
  const labels = [];
  if (capabilities.has('payroll.novelty.prepare')) labels.push('preparar lotes');
  if (capabilities.has('payroll.novelty.approve')) labels.push('aprobar o rechazar');
  if (capabilities.has('payroll.novelty.export')) labels.push('exportar aprobados');
  return labels.length ? labels.join(' · ') : 'consulta habilitada';
}

function principalKey(principal) {
  return [
    principal?.email ?? principal?.user?.email,
    principal?.membershipId ?? principal?.tenant?.membershipId,
    principal?.tenantId ?? principal?.tenant?.id,
  ].map((value) => String(value || '').trim().toLowerCase()).join('|');
}

function assertBatchContract(batch, { detail = false } = {}) {
  const commands = batch?.allowedCommands;
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)
      || !UUID.test(String(batch.id || ''))
      || batch.contractVersion !== 'payroll-novelty-batch.v1'
      || !Object.hasOwn(STATE_LABELS, batch.status)
      || !['individual', 'bulk'].includes(batch.sourceMode)
      || !Object.hasOwn(TYPE_LABELS, batch.payrollType)
      || !/^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])-01$/.test(String(batch.periodMonth || ''))
      || !Number.isSafeInteger(batch.version) || batch.version < 1
      || !Number.isSafeInteger(batch.rowCount)
      || batch.rowCount < 1 || batch.rowCount > MAX_ROWS
      || typeof batch.exportable !== 'boolean'
      || batch.grhMutation !== false
      || batch.payrollCalculated !== false
      || batch.payrollPosted !== false
      || !Array.isArray(commands)
      || new Set(commands).size !== commands.length
      || commands.some((command) => !KNOWN_COMMANDS.has(command))
      || typeof batch.canExport !== 'boolean'
      || (batch.canExport && (batch.status !== 'approved' || batch.exportable !== true))
      || (detail && (!Array.isArray(batch.rows)
        || batch.rows.length !== batch.rowCount))) {
    throw new Error('La API devolvió un lote fuera del contrato seguro.');
  }
  return batch;
}

function stateClass(status) {
  return ['approved', 'draft', 'submitted', 'rejected', 'cancelled'].includes(status)
    ? status : 'unknown';
}

function renderBatches() {
  const batches = Array.isArray(bootstrapState?.batches) ? bootstrapState.batches : [];
  const body = byId('batchRows');
  body.replaceChildren();
  byId('batchEmpty').hidden = batches.length > 0;
  byId('batchTable').hidden = batches.length === 0;
  for (const batchValue of batches) {
    const batch = assertBatchContract(batchValue);
    const tr = document.createElement('tr');
    tr.dataset.batchId = batch.id;
    const values = [
      String(batch.id || '').slice(0, 8).toUpperCase(),
      String(batch.periodMonth || '').slice(0, 7),
      TYPE_LABELS[batch.payrollType] || batch.payrollType || '—',
      Number(batch.rowCount || 0),
    ];
    values.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    });
    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status ${stateClass(batch.status)}`;
    badge.textContent = STATE_LABELS[batch.status] || batch.status || 'Sin estado';
    status.appendChild(badge);
    tr.appendChild(status);
    const actionCell = document.createElement('td');
    if (hasCapability('payroll.novelty.nominal.read')) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'button compact';
      view.textContent = 'Abrir';
      view.addEventListener('click', () => openBatch(batch.id));
      actionCell.appendChild(view);
    } else {
      const restricted = document.createElement('span');
      restricted.className = 'muted';
      restricted.textContent = 'Detalle restringido';
      actionCell.appendChild(restricted);
    }
    tr.appendChild(actionCell);
    body.appendChild(tr);
  }
}

function actionLabel(command) {
  return {
    submit: 'Enviar a aprobación',
    approve: 'Aprobar para exportar',
    reject: 'Rechazar',
    cancel: 'Cancelar lote',
  }[command] || command;
}

function createActionButton(batch, command) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = command === 'approve' || command === 'submit'
    ? 'button primary' : command === 'reject' || command === 'cancel'
      ? 'button danger' : 'button';
  button.textContent = actionLabel(command);
  button.addEventListener('click', () => applyTransition(batch, command));
  return button;
}

function renderBatchDetail(payload) {
  const batch = assertBatchContract(payload?.data, { detail: true });
  selectedBatchId = batch.id;
  byId('detailTitle').textContent = `Lote ${String(batch.id).slice(0, 8).toUpperCase()}`;
  byId('detailState').textContent = STATE_LABELS[batch.status] || batch.status;
  byId('detailPeriod').textContent = String(batch.periodMonth || '').slice(0, 7);
  byId('detailType').textContent = TYPE_LABELS[batch.payrollType] || batch.payrollType || '—';
  byId('detailCount').textContent = String(batch.rowCount || batch.rows?.length || 0);
  byId('detailIssues').textContent = `${Number(batch.blockingIssueCount || 0)} bloqueantes · ${Number(batch.warningIssueCount || 0)} avisos`;
  const body = byId('detailRows');
  body.replaceChildren();
  for (const row of Array.isArray(batch.rows) ? batch.rows : []) {
    const tr = document.createElement('tr');
    const issues = Array.isArray(row.issues) ? row.issues : [];
    const issueText = issues.length
      ? issues.map(issueLabel).join(' · ')
      : 'Validada';
    for (const value of [
      row.rowOrdinal,
      row.legajo || 'Restringido',
      row.conceptSourceId,
      row.quantityDecimal ?? '—',
      moneyFromCents(row.amountCents),
      issueText,
    ]) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  const actions = byId('detailActions');
  actions.replaceChildren();
  const commands = Array.isArray(batch.allowedCommands) ? batch.allowedCommands : [];
  byId('rejectReasonField').hidden = !commands.includes('reject');
  for (const command of commands) actions.appendChild(createActionButton(batch, command));
  if (batch.canExport === true) {
    const excelButton = document.createElement('button');
    excelButton.type = 'button';
    excelButton.className = 'button primary';
    excelButton.textContent = 'Descargar Excel de revisión';
    excelButton.addEventListener('click', () => exportBatch(batch.id, 'xlsx'));
    actions.appendChild(excelButton);
    const csvButton = document.createElement('button');
    csvButton.type = 'button';
    csvButton.className = 'button';
    csvButton.textContent = 'Descargar CSV técnico';
    csvButton.addEventListener('click', () => exportBatch(batch.id, 'csv'));
    actions.appendChild(csvButton);
  }
  if (!actions.childElementCount) {
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = 'No hay acciones habilitadas para esta sesión y estado.';
    actions.appendChild(note);
  }
  byId('detailPanel').hidden = false;
  byId('detailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadBootstrap({ quiet = false } = {}) {
  if (!quiet) setBusy(true, 'Consultando capacidades y lotes vigentes…');
  try {
    const payload = await api(`${API_URL}?resource=bootstrap`);
    if (payload?.limits?.contractVersion !== 'payroll-novelty-batch.v1'
        || payload?.limits?.approvalEffect !== 'export_only'
        || payload?.limits?.grhMutation !== false
        || payload?.limits?.payrollCalculated !== false
        || payload?.limits?.payrollPosted !== false) {
      throw new Error('La API de novedades no cumple el contrato seguro esperado.');
    }
    if (!Array.isArray(payload.batches)) {
      throw new Error('La API no devolvió una bandeja válida.');
    }
    for (const batch of payload.batches) assertBatchContract(batch);
    const priorPrincipalKey = principalKey(bootstrapState?.principal);
    const nextPrincipalKey = principalKey(payload.principal);
    const principalChanged = Boolean(priorPrincipalKey && priorPrincipalKey !== nextPrincipalKey);
    const canPrepare = hasCapability('payroll.novelty.prepare', payload.principal);
    if (principalChanged || !canPrepare) invalidatePreparedDraft();
    if (agileDraftRows.length && (principalChanged || !canPrepare)) {
      agileDraftRows = [];
      agileTemplate = null;
      invalidatePreparedDraft();
    }
    bootstrapState = payload;
    byId('sessionScope').textContent = capabilityText(payload.principal);
    byId('entrySection').hidden = !canPrepare;
    byId('readOnlySection').hidden = canPrepare;
    byId('maxRows').textContent = String(payload.limits.maxRows || MAX_ROWS);
    const select = byId('payrollType');
    const current = select.value;
    select.replaceChildren();
    if (handoffRequiresPayrollTypeSelection) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Elegí el tipo de liquidación';
      placeholder.disabled = true;
      select.appendChild(placeholder);
    }
    for (const type of payload.limits.payrollTypes || []) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = TYPE_LABELS[type] || type;
      select.appendChild(option);
    }
    if ([...select.options].some((option) => option.value === current)) select.value = current;
    if (handoffRequiresPayrollTypeSelection && !current) select.value = '';
    renderBatches();
    byId('pageContent').hidden = false;
    byId('loadingState').hidden = true;
    if (selectedBatchId && hasCapability('payroll.novelty.nominal.read')) {
      await openBatch(selectedBatchId, { quiet: true });
    }
  } catch (error) {
    byId('pageContent').hidden = false;
    byId('loadingState').hidden = true;
    showMessage('error', 'No pudimos cargar novedades de nómina', errorMessage(error));
  } finally {
    if (!quiet) setBusy(false);
  }
}

async function openBatch(id, { quiet = false } = {}) {
  if (!quiet) setBusy(true, 'Abriendo lote y auditoría…');
  try {
    const payload = await api(`${API_URL}?resource=detail&id=${encodeURIComponent(id)}`);
    renderBatchDetail(payload);
  } catch (error) {
    showMessage('error', 'No pudimos abrir el lote', errorMessage(error));
  } finally {
    if (!quiet) setBusy(false);
  }
}

function transitionInput(batch, command, reasonReference = null) {
  const reasonCode = {
    submit: 'ready_for_review',
    approve: 'validated_for_export',
    reject: byId('rejectReason').value,
    cancel: 'cancelled_by_preparer',
  }[command];
  return {
    batchId: batch.id,
    expectedVersion: Number(batch.version),
    reasonCode,
    reasonReference: ['reject', 'cancel'].includes(command) ? reasonReference : null,
  };
}

function transitionAttempt(batch, command) {
  const reasonCode = command === 'reject' ? byId('rejectReason').value : '';
  const fingerprint = [batch.id, batch.version, command, reasonCode].join('|');
  const existing = pendingTransitionAttempts.get(fingerprint);
  if (existing) return existing;
  const idempotencyKey = crypto.randomUUID();
  const attempt = Object.freeze({
    fingerprint,
    idempotencyKey,
    payload: transitionInput(batch, command, `ref:${idempotencyKey}`),
  });
  pendingTransitionAttempts.set(fingerprint, attempt);
  return attempt;
}

async function applyTransition(batch, command) {
  const prompts = {
    submit: 'El lote quedará pendiente de una segunda persona. ¿Continuar?',
    approve: 'La aprobación habilita únicamente la exportación. No calcula ni escribe GRH. ¿Continuar?',
    reject: 'El lote quedará rechazado con el motivo seleccionado. ¿Continuar?',
    cancel: 'El lote quedará cancelado y no podrá exportarse. ¿Continuar?',
  };
  if (!window.confirm(prompts[command])) return;
  const attempt = transitionAttempt(batch, command);
  setBusy(true, actionLabel(command));
  clearMessage();
  try {
    await api(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': attempt.idempotencyKey,
      },
      body: JSON.stringify({ command, payload: attempt.payload }),
    });
    pendingTransitionAttempts.delete(attempt.fingerprint);
    showMessage('success', `${actionLabel(command)}: operación registrada`, 'La auditoría conservó actor, versión, estado y binding certificado.');
    await loadBootstrap({ quiet: true });
  } catch (error) {
    const expectedStatus = {
      submit: 'submitted',
      approve: 'approved',
      reject: 'rejected',
      cancel: 'cancelled',
    }[command];
    try {
      const currentPayload = await api(
        `${API_URL}?resource=detail&id=${encodeURIComponent(batch.id)}`,
      );
      const currentBatch = assertBatchContract(currentPayload?.data, { detail: true });
      if (currentBatch.status === expectedStatus
          && Number(currentBatch.version) === Number(batch.version) + 1) {
        pendingTransitionAttempts.delete(attempt.fingerprint);
        renderBatchDetail(currentPayload);
        showMessage(
          'success',
          `${actionLabel(command)}: operación confirmada`,
          'La primera respuesta se interrumpió, pero el estado autoritativo y su auditoría quedaron registrados.',
        );
        await loadBootstrap({ quiet: true });
        return;
      }
    } catch {
      // Conservamos la misma clave de idempotencia para un reintento seguro.
    }
    showMessage('error', 'No se pudo cambiar el estado', errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function exportBatch(id, format) {
  setBusy(true, 'Preparando exportación aprobada…');
  try {
    const payload = await api(`${API_URL}?resource=export&id=${encodeURIComponent(id)}`);
    if (payload.contractVersion !== 'payroll-novelty-export.v1'
        || payload.approvalEffect !== 'export_only') {
      throw new Error('La exportación no declara su alcance seguro.');
    }
    const isExcel = format === 'xlsx';
    const fileName = isExcel
      ? downloadPayrollNoveltyXlsx(payload.data)
      : downloadPayrollNoveltyCsv(payload.data);
    showMessage(
      'success',
      `${isExcel ? 'Excel de revisión' : 'CSV técnico'} descargado`,
      `${fileName}. La salida no confirma importación en GRH ni cálculo de haberes.`,
    );
  } catch (error) {
    showMessage('error', 'No se pudo exportar el lote', errorMessage(error));
  } finally {
    setBusy(false);
  }
}

function updateMode() {
  const mode = document.querySelector('[name="sourceMode"]:checked')?.value;
  byId('individualFields').hidden = !['individual', 'agile'].includes(mode);
  byId('bulkFields').hidden = mode !== 'bulk';
  byId('agilePanel').hidden = mode !== 'agile';
  renderAgileRows();
  invalidatePreparedDraft();
}

function updateBulkFormat() {
  const isRetro = byId('bulkFormat').value === 'retro';
  const isGuarantee = byId('bulkFormat').value === 'guarantee';
  // A file read started under another format cannot populate this selection.
  fileReadVersion += 1;
  fileReadPending = false;
  byId('retroConceptField').hidden = !isRetro;
  byId('retroFormatHelp').hidden = !isRetro;
  byId('guaranteeFormatHelp').hidden = !isGuarantee;
  byId('bulkTextField').hidden = isGuarantee;
  byId('csvFormatHelp').hidden = isRetro || isGuarantee;
  byId('bulkFileLabel').textContent = isGuarantee ? 'Planilla de garantía provincial (.xlsx)'
    : isRetro ? 'Archivo TXT RETRO UTF-8' : 'Archivo CSV UTF-8';
  byId('bulkFile').accept = isGuarantee ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : isRetro ? '.txt,text/plain' : '.csv,text/csv,text/plain';
  byId('bulkSource').placeholder = isRetro
    ? 'Pegá el contenido RETRO sin encabezado: 8 dígitos de legajo y 7 dígitos de importe, punto y 2 decimales.'
    : 'Pegá aquí el CSV con el encabezado exacto.';
  invalidatePreparedDraft();
  byId('preflightButton').disabled = document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare');
}

function renderAgileRows() {
  const host = byId('agileRows');
  if (!host) return;
  host.replaceChildren();
  agileDraftRows.forEach((row, index) => {
    const tr = document.createElement('tr');
    for (const value of [
      index + 1,
      row.legajo,
      row.conceptSourceId,
      row.quantityDecimal ?? '—',
      moneyFromCents(row.amountCents),
      row.observation || '—',
    ]) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    const action = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button compact';
    remove.dataset.agileRemove = String(index);
    remove.textContent = 'Quitar';
    remove.setAttribute('aria-label', `Quitar fila ${index + 1}, legajo ${row.legajo}`);
    action.appendChild(remove);
    tr.appendChild(action);
    host.appendChild(tr);
  });
  byId('agileCount').textContent = `${agileDraftRows.length} fila${agileDraftRows.length === 1 ? '' : 's'} preparada${agileDraftRows.length === 1 ? '' : 's'}.`;
  byId('agileEmpty').hidden = agileDraftRows.length > 0;
  byId('agileTable').hidden = agileDraftRows.length === 0;
  byId('agileClearButton').disabled = agileDraftRows.length === 0 || document.body.dataset.busy === 'true';
  byId('agileAddButton').disabled = agileDraftRows.length >= MAX_ROWS || document.body.dataset.busy === 'true';
  const hasRows = agileDraftRows.length > 0;
  for (const fieldId of AGILE_TEMPLATE_FIELD_IDS) byId(fieldId).disabled = hasRows;
  for (const radio of document.querySelectorAll('[name="sourceMode"]')) {
    radio.disabled = hasRows && radio.value !== 'agile';
  }
  byId('agileTemplateLock').hidden = !hasRows;
  byId('agileTemplateLock').textContent = hasRows
    ? `Plantilla bloqueada: ${agileTemplate?.periodMonth || '—'} · ${TYPE_LABELS[agileTemplate?.payrollType] || agileTemplate?.payrollType || '—'}. Vaciá la lista para cambiar período, tipo o datos comunes.`
    : '';
}

function addAgileRow() {
  clearMessage();
  try {
    if (agileDraftRows.length >= MAX_ROWS) throw new Error(`La carga rápida admite hasta ${MAX_ROWS} filas.`);
    const periodMonth = exactMonth(byId('periodMonth').value, 'Período');
    const payrollType = byId('payrollType').value;
    const allowedTypes = bootstrapState?.limits?.payrollTypes || [];
    if (!allowedTypes.includes(payrollType)) throw new Error('El tipo de liquidación no está habilitado.');
    const enteredValues = currentEntryValues();
    const commonValues = agileTemplate?.commonValues || enteredValues.slice(1);
    const row = rowFromValues([enteredValues[0], ...commonValues], agileDraftRows.length + 1, periodMonth);
    const nextRows = [...agileDraftRows, row];
    duplicateCheck(nextRows);
    agileDraftRows = nextRows;
    if (!agileTemplate) {
      agileTemplate = { periodMonth, payrollType, commonValues: [...commonValues] };
    }
    byId('legajo').value = '';
    invalidatePreparedDraft();
    renderAgileRows();
    showMessage('success', 'Legajo agregado a la carga rápida', 'Los demás datos quedaron listos para reutilizar. La lista todavía no fue enviada al servidor.');
    byId('legajo').focus();
  } catch (error) {
    showMessage('error', 'No se pudo agregar el legajo', errorMessage(error));
  }
}

function clearAgileRows() {
  agileDraftRows = [];
  agileTemplate = null;
  invalidatePreparedDraft();
  renderAgileRows();
  showMessage('success', 'Carga rápida vaciada', 'No se creó ni modificó ningún lote en el servidor.');
}

function removeAgileRow(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= agileDraftRows.length) return;
  agileDraftRows = agileDraftRows.filter((_, rowIndex) => rowIndex !== index)
    .map((row, rowIndex) => ({ ...row, rowOrdinal: rowIndex + 1 }));
  if (!agileDraftRows.length) agileTemplate = null;
  invalidatePreparedDraft();
  renderAgileRows();
}

async function preflight() {
  if (preflightPending) return;
  clearMessage();
  invalidatePreparedDraft();
  const revision = draftRevision;
  const entryMode = document.querySelector('[name="sourceMode"]:checked')?.value || null;
  const isGuarantee = entryMode === 'bulk' && byId('bulkFormat').value === 'guarantee';
  try {
    if (!hasCapability('payroll.novelty.prepare')) throw new Error('Tu perfil no tiene permiso para preparar novedades. Podés consultar los lotes habilitados.');
    if (isGuarantee) {
      if (fileReadPending) throw new Error('Esperá a que termine la lectura del archivo.');
      if (fileReadError) throw new Error(fileReadError);
      if (!guaranteeFileBytes) throw new Error('Seleccioná la planilla .xlsx de garantía provincial. No hace falta convertirla a TXT.');
      const period = exactMonth(byId('periodMonth').value, 'Período').slice(0, 7);
      preflightPending = true;
      setBusy(true, 'Revisando el Excel en esta pestaña…');
      const report = await parseGuaranteeXlsx(guaranteeFileBytes, { period, conceptCode: '195' });
      if (revision !== draftRevision || !hasCapability('payroll.novelty.prepare')) return;
      guaranteeReport = report;
      if (!report.ok) {
        const error = new Error('Revisá las filas señaladas. No se preparará un lote incompleto.');
        error.guaranteeReport = report;
        throw error;
      }
      renderGuaranteeReport(report);
    }
    preparedEntryMode = entryMode;
    preparedDraft = buildDraft();
    preparedDraftKey = crypto.randomUUID();
    renderPreflight(preparedDraft);
    showMessage('success', 'Validación previa superada', 'El servidor volverá a validar legajo, binding, duplicados y capacidades antes de crear el lote.');
  } catch (error) {
    if (revision !== draftRevision) return;
    invalidatePreparedDraft();
    if (error.retroReport) renderRetroReport(error.retroReport);
    if (error.guaranteeReport) renderGuaranteeReport(error.guaranteeReport);
    showMessage('error', 'Revisá la carga', errorMessage(error));
  } finally {
    if (isGuarantee && preflightPending) {
      preflightPending = false;
      setBusy(false);
    }
  }
}

async function prepare() {
  if (!hasCapability('payroll.novelty.prepare')) {
    invalidatePreparedDraft();
    showMessage('error', 'Carga no habilitada', 'Tu perfil no tiene permiso para preparar novedades.');
    return;
  }
  if (preparedEntryMode === 'bulk' && (fileReadPending || fileReadError)) return;
  if (!preparedDraft) return;
  if (!preparedDraftKey) preparedDraftKey = crypto.randomUUID();
  const completedEntryMode = preparedEntryMode;
  setBusy(true, 'Validando y creando lote trazable…');
  clearMessage();
  try {
    const payload = await api(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': preparedDraftKey,
      },
      body: JSON.stringify({ command: 'prepare', payload: preparedDraft }),
    });
    selectedBatchId = hasCapability('payroll.novelty.nominal.read')
      ? payload.data?.id || null : null;
    if (completedEntryMode === 'agile') {
      agileDraftRows = [];
      agileTemplate = null;
      renderAgileRows();
    }
    invalidatePreparedDraft();
    showMessage('success', 'Lote creado y auditado', 'Quedó como borrador validado. No se calculó sueldo ni se escribió en GRH.');
    await loadBootstrap({ quiet: true });
  } catch (error) {
    showMessage('error', 'No se pudo preparar el lote', errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    fileReadVersion += 1;
    guaranteeFileBytes = null;
    fileReadPending = false;
    fileReadError = null;
    invalidatePreparedDraft();
    byId('bulkFileStatus').textContent = 'No hay un archivo seleccionado. Elegí la planilla que querés revisar.';
    byId('preflightButton').disabled = document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare');
    return;
  }
  const readVersion = ++fileReadVersion;
  const isGuarantee = byId('bulkFormat').value === 'guarantee';
  guaranteeFileBytes = null;
  invalidatePreparedDraft();
  fileReadError = null;
  fileReadPending = false;
  if (file.size > (isGuarantee ? GUARANTEE_XLSX_MAX_BYTES : 480 * 1024)) {
    fileReadError = isGuarantee ? 'La planilla supera 2 MiB. Elegí el Excel de garantía de hasta 500 legajos.'
      : 'El archivo supera el límite de lectura de 480 KiB. CSV admite 480 KiB; TXT RETRO, 256 KiB. Seleccioná un archivo más pequeño o corregí el contenido conservado.';
    byId('bulkFileStatus').textContent = fileReadError;
    byId('preflightButton').disabled = document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare');
    showMessage('error', 'Archivo demasiado grande', fileReadError);
    return;
  }
  fileReadPending = true;
  byId('preflightButton').disabled = true;
  byId('bulkFileStatus').textContent = 'Leyendo el archivo; esperá antes de validar.';
  try {
    const buffer = await file.arrayBuffer();
    if (readVersion !== fileReadVersion) return;
    if (isGuarantee) guaranteeFileBytes = new Uint8Array(buffer);
    else {
      guaranteeFileBytes = null;
      byId('bulkSource').value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    }
    byId('bulkFileStatus').textContent = `${file.name}: contenido leído en esta pestaña. Elegí el formato y validá para revisar todas las filas.`;
    invalidatePreparedDraft();
  } catch {
    if (readVersion !== fileReadVersion) return;
    fileReadError = isGuarantee ? 'No se pudo leer la planilla. Seleccioná nuevamente el Excel guardado; no se envió ningún dato.'
      : 'No se pudo leer como UTF-8. Conservamos el contenido anterior. Seleccioná el archivo correcto o pegá su contenido corregido antes de validar.';
    byId('bulkFileStatus').textContent = fileReadError;
    showMessage('error', 'No se pudo leer el archivo', fileReadError);
  } finally {
    if (readVersion === fileReadVersion) {
      fileReadPending = false;
      byId('preflightButton').disabled = document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare');
    }
  }
}

async function logout() {
  try {
    await fetch('/api/internal-auth', { method: 'DELETE', credentials: 'same-origin' });
  } finally {
    sessionStorage.removeItem('mjunin_user');
    location.replace('login.html');
  }
}

function consumePayrollNoveltyHandoff() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(PAYROLL_NOVELTY_HANDOFF_KEY);
    sessionStorage.removeItem(PAYROLL_NOVELTY_HANDOFF_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  let handoff;
  try {
    handoff = JSON.parse(raw);
  } catch {
    return false;
  }
  const createdAt = Number(handoff?.createdAt);
  const age = Date.now() - createdAt;
  const legajo = String(handoff?.legajo || '').trim();
  const periodMonth = String(handoff?.periodMonth || '').trim();
  const payrollType = String(handoff?.payrollType || '').trim();
  if (!Number.isSafeInteger(createdAt) || age < 0 || age > PAYROLL_NOVELTY_HANDOFF_MAX_AGE_MS
      || !/^(?:0|[1-9]\d{0,19})$/.test(legajo)
      || !/^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])$/.test(periodMonth)
      || (payrollType && !Object.hasOwn(TYPE_LABELS, payrollType))) {
    return false;
  }

  const individualMode = document.querySelector('[name="sourceMode"][value="individual"]');
  if (individualMode) individualMode.checked = true;
  byId('legajo').value = legajo;
  byId('periodMonth').value = periodMonth;
  handoffRequiresPayrollTypeSelection = !payrollType;
  byId('payrollType').value = payrollType;
  updateMode();
  invalidatePreparedDraft();
  showMessage(
    'success',
    'Legajo y período preparados',
    payrollType
      ? 'Completá concepto, unidades o importe y revisá la novedad. Nada fue enviado automáticamente.'
      : 'Elegí el tipo de liquidación, completá la novedad y revisala. El código de origen no se convirtió automáticamente.',
  );
  return true;
}

function initialize() {
  const current = new Date();
  byId('periodMonth').value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
  for (const radio of document.querySelectorAll('[name="sourceMode"]')) radio.addEventListener('change', updateMode);
  byId('entrySection').addEventListener('input', invalidatePreparedDraft);
  byId('entrySection').addEventListener('change', invalidatePreparedDraft);
  byId('payrollType').addEventListener('change', () => {
    if (byId('payrollType').value) handoffRequiresPayrollTypeSelection = false;
  });
  byId('preflightButton').addEventListener('click', preflight);
  byId('prepareButton').addEventListener('click', prepare);
  byId('bulkFile').addEventListener('change', handleFile);
  byId('bulkFormat').addEventListener('change', updateBulkFormat);
  byId('bulkSource').addEventListener('input', () => {
    fileReadVersion += 1;
    fileReadPending = false;
    fileReadError = null;
    byId('bulkFileStatus').textContent = 'Contenido editado en esta pestaña. El archivo seleccionado se conserva; volvé a validar para revisar los cambios.';
    byId('preflightButton').disabled = document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare');
  });
  byId('agileAddButton').addEventListener('click', addAgileRow);
  byId('agileClearButton').addEventListener('click', clearAgileRows);
  byId('agileRows').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-agile-remove]');
    if (button) removeAgileRow(Number(button.dataset.agileRemove));
  });
  byId('refreshButton').addEventListener('click', () => loadBootstrap());
  byId('logoutButton').addEventListener('click', logout);
  byId('closeDetail').addEventListener('click', () => {
    selectedBatchId = null;
    byId('detailPanel').hidden = true;
  });
  updateMode();
  updateBulkFormat();
  consumePayrollNoveltyHandoff();
  loadBootstrap();
}

initialize();
