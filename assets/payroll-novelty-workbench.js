import { mountNoveltyDirectory } from './payroll-novelty-directory.js';
import { mountNoveltySheet } from './payroll-novelty-sheet.js';
import { reviewSheetRows } from './payroll-novelty-sheet-model.js';
import { analyzeLegajoList, appendLegajoList, filterAgileRows } from './payroll-novelty-legajo-list.js';
import { reviewNoveltyCsv, NoveltyReviewError } from './payroll-novelty-review.js';
import { mountNoveltyReviewPanel, mountNoveltyIssues } from './payroll-novelty-review-panel.js';
import { amountEntryPolicy } from './payroll-novelty-amount-policy.js';
import { downloadPayrollNoveltyCsv } from './payroll-novelty-exporter.js';
import { downloadPayrollNoveltyXlsx } from './payroll-novelty-xlsx-exporter.js';

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
let reviewPanel = null;
let sheetEditor = null;
let directoryPicker = null;
let issuesPanel = null;
let pendingFileReader = null;
let fileReadVersion = 0;
let bootstrapState = null;
let preparedDraft = null;
let preparedDraftKey = null;
let preparedEntryMode = null;
let selectedBatchId = null;
let redirectIssued = false;
let agileDraftRows = [];
let agileTemplate = null;
const busyEntryFields = new Map();
let handoffRequiresPayrollTypeSelection = false;
const pendingTransitionAttempts = new Map();

const AGILE_TEMPLATE_FIELD_IDS = Object.freeze([
  'periodMonth', 'payrollType', 'conceptSourceId', 'costCenterSourceId',
  'adjustmentMonth', 'quantityDecimal', 'amountArs', 'manualAmountEnabled', 'movementType',
  'legalInstrument', 'observation', 'forced',
]);

function setBusy(value, label = '') {
  document.body.dataset.busy = value ? 'true' : 'false';
  if (value) directoryPicker?.close();
  if (value) {
    for (const field of byId('entrySection').querySelectorAll('input, select, textarea')) {
      if (!busyEntryFields.has(field)) busyEntryFields.set(field, field.disabled);
      field.disabled = true;
    }
  } else {
    for (const [field, disabled] of busyEntryFields) field.disabled = disabled;
    busyEntryFields.clear();
  }
  for (const button of document.querySelectorAll('button')) button.disabled = Boolean(value);
  if (!value) {
    byId('prepareButton').disabled = preparedDraft === null;
    renderAgileRows();
    reviewPanel?.render();
  }
  sheetEditor?.setDisabled(value);
  if (value && document.querySelector('[name="sourceMode"]:checked')?.value === 'sheet') {
    byId('periodMonth').disabled = true;
    byId('payrollType').disabled = true;
    document.querySelectorAll('[name="sourceMode"]').forEach(radio => { radio.disabled = true; });
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

function invalidatePreparedDraft(event) {
  if (event?.target?.closest?.('[data-review-only]')) return;
  if (event?.target?.id !== 'bulkFile') cancelFileRead();
  reviewPanel?.clear();
  issuesPanel?.clear();
  preparedDraft = null;
  preparedDraftKey = null;
  preparedEntryMode = null;
  byId('previewPanel').hidden = true;
  byId('prepareButton').disabled = true;
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
    amountEntryPolicy({manual:byId('manualAmountEnabled').checked,forced:byId('forced').checked,value:byId('amountArs').value}).rawValue,
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
  if (byId('agileLegajos').value.trim() || byId('legajo').value.trim()) {
    throw new Error('Hay legajos escritos que todavía no se agregaron al lote. Agregalos o limpiá esos campos antes de validar.');
  }
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
  // Exact CSV contract retained:
  // 'legajo', 'concepto', 'centro_costo', 'mes_ajuste', 'unidades', 'importe_ars'
  // 'movimiento', 'instrumento_legal', 'observacion', 'forzado'
  if (pendingFileReader) throw new Error('Esperá a que termine la lectura del archivo.');
  return reviewNoveltyCsv(byId('bulkSource').value, rowFromValues, periodMonth);
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
    : entryMode === 'sheet'
      ? reviewSheetRows(sheetEditor.values(), rowFromValues, periodMonth)
      : entryMode === 'agile'
        ? agileRows(periodMonth)
        : individualRows(periodMonth);
  if (rows.length > agileMaximum()) throw new Error(`Este ámbito admite hasta ${agileMaximum()} filas por lote.`);
  duplicateCheck(rows);
  const sourceMode = ['agile', 'sheet'].includes(entryMode) ? 'bulk' : entryMode;
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
  reviewPanel.setRows(draft.rows);
  byId('prepareButton').disabled = false;
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
    const limitsChanged = bootstrapState && JSON.stringify(bootstrapState.limits) !== JSON.stringify(payload.limits);
    if (principalChanged || !canPrepare || limitsChanged) {
      directoryPicker?.close();
      sheetEditor?.clear();
      agileDraftRows = [];
      agileTemplate = null;
      clearAgileInput();
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
    sheetEditor?.clear();
    invalidatePreparedDraft();
    byId('entrySection').hidden = true;
    byId('pageContent').hidden = false;
    byId('loadingState').hidden = true;
    directoryPicker?.close();
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
  directoryPicker?.close();
  byId('individualFields').hidden = !['individual', 'agile'].includes(mode);
  byId('bulkFields').hidden = mode !== 'bulk';
  byId('agilePanel').hidden = mode !== 'agile';
  byId('sheetFields').hidden = mode !== 'sheet';
  renderAgileRows();
  invalidatePreparedDraft();
}

function renderAgileRows() {
  const host = byId('agileRows');
  if (!host) return;
  host.replaceChildren();
  const visibleRows = filterAgileRows(agileDraftRows, byId('agileSearch').value);
  visibleRows.forEach(({ row, index }) => {
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
  if (agileDraftRows.length && !visibleRows.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Sin coincidencias. El lote conserva todos los legajos agregados.';
    tr.appendChild(td); host.appendChild(tr);
  }
  byId('agileVisibleCount').textContent = `${visibleRows.length} visibles de ${agileDraftRows.length} legajos en el lote. Buscar no cambia lo que se guardará.`;
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
  syncAmountEntry();
  byId('agileTemplateLock').hidden = !hasRows;
  byId('agileTemplateLock').textContent = hasRows
    ? `Plantilla bloqueada: ${agileTemplate?.periodMonth || '—'} · ${TYPE_LABELS[agileTemplate?.payrollType] || agileTemplate?.payrollType || '—'}. Vaciá la lista para cambiar período, tipo o datos comunes.`
    : '';
  renderAgileList();
  if (document.body.dataset.busy === 'true') {
    byId('entrySection').querySelectorAll('input, select, textarea, button').forEach(field => { field.disabled = true; });
  }
}

function agileMaximum() {
  const limit = bootstrapState?.limits?.maxRows;
  return Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_ROWS) : MAX_ROWS;
}

function clearAgileInput() {
  byId('agileLegajos').value = '';
  byId('agileSearch').value = '';
  byId('legajo').value = '';
  byId('agileListIssues').replaceChildren();
}

function renderAgileList() {
  const analysis = analyzeLegajoList(byId('agileLegajos').value, agileDraftRows.map(row => row.legajo), agileMaximum());
  const issues = byId('agileListIssues'); issues.replaceChildren();
  for (const issue of analysis.issues) {
    const li = document.createElement('li');
    li.textContent = (issue.position === null ? '' : `Posición ${issue.position}: `) + issue.message;
    issues.appendChild(li);
  }
  issues.hidden = !analysis.issues.length;
  byId('agileLegajos').setAttribute('aria-invalid', String(analysis.issues.length > 0));
  byId('agileListStatus').textContent = analysis.issues.length
    ? `${analysis.issues.length} incidencia(s). No se agregará ninguna parte de esta lista hasta corregirla.`
    : analysis.count ? `${analysis.count} legajos listos para agregar · ${analysis.remaining} lugares disponibles.`
      : `Hasta ${analysis.remaining} legajos más. El texto debe contener únicamente números de legajo.`;
  const busy = document.body.dataset.busy === 'true';
  byId('agileListAddButton').textContent = analysis.ready ? `Agregar ${analysis.count} legajo${analysis.count === 1 ? '' : 's'} al lote` : 'Agregar lista al lote';
  byId('agileListAddButton').disabled = !analysis.ready || busy || !hasCapability('payroll.novelty.prepare');
  byId('agileListResetButton').disabled = !byId('agileLegajos').value || busy;
  byId('agileLegajos').disabled = busy;
  const values = agileTemplate?.commonValues;
  const summary = byId('agileCommonSummary'); summary.replaceChildren();
  const rawAmount = values ? values[4] : (byId('manualAmountEnabled').checked || byId('forced').checked ? byId('amountArs').value : '');
  let amountLabel = 'No informado';
  if (rawAmount) {
    try { amountLabel = moneyFromCents(amountToCents(rawAmount)); }
    catch { amountLabel = 'Revisar importe'; }
  }
  const common = [
    ['Período', (agileTemplate?.periodMonth || byId('periodMonth').value).slice(0, 7) || 'Por completar'],
    ['Liquidación', TYPE_LABELS[agileTemplate?.payrollType || byId('payrollType').value] || 'Por completar'],
    ['Concepto', values ? values[0] : byId('conceptSourceId').value || 'Por completar'],
    ['Unidades', (values ? values[3] : byId('quantityDecimal').value) || 'No informadas'],
    ['Importe por legajo', amountLabel],
    ['Forzado', (values ? values[8] === 'SI' : byId('forced').checked) ? 'Sí · requiere fundamento' : 'No'],
  ];
  for (const [label, value] of common) {
    const cell = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; cell.append(dt, dd); summary.appendChild(cell);
  }
}

function assertAgilePreparation() {
  if (document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare')
      || document.querySelector('[name="sourceMode"]:checked')?.value !== 'agile') {
    throw new Error('La carga rápida no está habilitada para esta sesión.');
  }
}

function addAgileList() {
  clearMessage();
  try {
    assertAgilePreparation();
    if (byId('legajo').value.trim()) throw new Error('El campo Legajo de arriba tiene un número pendiente. Agregalo de a uno o limpiá ese campo antes de agregar la lista.');
    const periodMonth = agileTemplate?.periodMonth || exactMonth(byId('periodMonth').value, 'Período');
    const payrollType = agileTemplate?.payrollType || byId('payrollType').value;
    if (!bootstrapState.limits.payrollTypes.includes(payrollType)) throw new Error('El tipo de liquidación no está habilitado.');
    const commonValues = agileTemplate?.commonValues || currentEntryValues().slice(1);
    const nextRows = appendLegajoList({ raw: byId('agileLegajos').value, existingRows: agileDraftRows,
      commonValues, periodMonth, parseRow: rowFromValues, maximum: agileMaximum() });
    duplicateCheck(nextRows);
    const added = nextRows.length - agileDraftRows.length;
    agileDraftRows = nextRows;
    if (!agileTemplate) agileTemplate = { periodMonth, payrollType, commonValues: [...commonValues] };
    byId('agileLegajos').value = '';
    byId('agileSearch').value = '';
    invalidatePreparedDraft(); renderAgileRows();
    showMessage('success', `${added} legajos agregados al lote`, 'Se aplicó la misma novedad a todos. Revisá la lista y presioná Validar y previsualizar; todavía no se guardó nada.');
    byId('preflightButton').focus();
  } catch (error) {
    invalidatePreparedDraft(); renderAgileList();
    showMessage('error', 'No se agregó la lista', errorMessage(error));
  }
}

function addAgileRow() {
  clearMessage();
  try {
    assertAgilePreparation();
    if (byId('agileLegajos').value.trim()) throw new Error('Hay una lista pendiente. Agregá la lista o limpiá su texto antes de agregar un legajo de a uno.');
    if (agileDraftRows.length >= agileMaximum()) throw new Error(`La carga rápida admite hasta ${agileMaximum()} filas.`);
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
  clearAgileInput();
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

function preflight() {
  if (document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare')) return;
  clearMessage();
  try {
    preparedEntryMode = document.querySelector('[name="sourceMode"]:checked')?.value || null;
    preparedDraft = buildDraft();
    preparedDraftKey = crypto.randomUUID();
    renderPreflight(preparedDraft);
    showMessage('success', 'Validación previa superada', 'El servidor volverá a validar legajo, binding, duplicados y capacidades antes de crear el lote.');
  } catch (error) {
    invalidatePreparedDraft();
    if (error instanceof NoveltyReviewError) issuesPanel.show(error);
    showMessage('error', 'Revisá la carga', errorMessage(error));
  }
}

async function prepare() {
  if (!preparedDraft || document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare')) return;
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
    if (completedEntryMode === 'sheet') sheetEditor.clear();
    if (completedEntryMode === 'agile') {
      agileDraftRows = [];
      agileTemplate = null;
      clearAgileInput();
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

function cancelFileRead() {
  fileReadVersion++;
  const reader = pendingFileReader;
  pendingFileReader = null;
  if (reader?.readyState === 1) reader.abort();
}

function handleFile(event) {
  cancelFileRead();
  invalidatePreparedDraft(event);
  const file = event.target.files?.[0];
  if (!file) return;
  byId('bulkSource').value = '';
  if (file.size > 480 * 1024 || !/\.csv$/i.test(file.name)) {
    showMessage('error', 'Archivo no admitido', 'Usá un CSV UTF-8 de hasta 480 KiB y 500 filas. No se conservó una previsualización anterior.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader(), version = fileReadVersion;
  pendingFileReader = reader;
  showMessage('info', 'Leyendo el archivo…', 'Todavía no se validó ni guardó ninguna fila.');
  reader.addEventListener('load', () => {
    if (version !== fileReadVersion || pendingFileReader !== reader) return;
    pendingFileReader = null;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(reader.result);
      byId('bulkSource').value = text;
      invalidatePreparedDraft();
      showMessage('success', 'Archivo leído, sin guardar', 'Presioná Validar y previsualizar para revisar todas las filas.');
    } catch {
      byId('bulkSource').value = '';
      showMessage('error', 'Codificación no válida', 'Guardá el archivo como CSV UTF-8. No se reemplazaron caracteres ni importes.');
    }
  });
  reader.addEventListener('error', () => {
    if (version !== fileReadVersion) return;
    pendingFileReader = null;
    showMessage('error', 'No se pudo leer el archivo', 'Seleccioná nuevamente un CSV UTF-8 válido.');
  });
  reader.readAsArrayBuffer(file);
}

async function logout() {
  sheetEditor?.clear();
  invalidatePreparedDraft();
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

function syncAmountEntry() {
  const toggle=byId('manualAmountEnabled'),forced=byId('forced').checked,locked=agileDraftRows.length>0;
  if(forced)toggle.checked=true;
  toggle.disabled=forced||locked;
  const policy=amountEntryPolicy({manual:toggle.checked,forced,value:byId('amountArs').value});
  byId('manualAmountFields').hidden=!policy.enabled;
  byId('amountArs').disabled=!policy.enabled||locked;
  byId('amountArs').required=policy.required;
  if(!policy.enabled)byId('amountArs').value='';
  byId('amountPolicyHelp').textContent=forced?'Excepción forzada: exige importe, fundamento y segunda aprobación.':policy.enabled?'Importe informado manualmente. Se conserva su origen y revisión.':'Carga habitual por concepto y unidades. La valorización corresponde al motor de liquidación; no se presupone cero.';
}

function applyDirectoryPeople(people, mode, extra) {
  const currentMode = document.querySelector('[name="sourceMode"]:checked')?.value;
  if (document.body.dataset.busy === 'true' || currentMode !== mode || !hasCapability('payroll.novelty.prepare')) {
    throw Error('Cambió la modalidad o el permiso. Volvé a abrir el buscador.');
  }
  const ids = people.map(person => person.legajo);
  if (mode === 'individual') {
    if (ids.length !== 1) throw Error('Elegí una sola persona para la carga individual.');
    byId('legajo').value = ids[0];
  } else if (mode === 'sheet') {
    sheetEditor.addDirectoryPeople(ids, { ...extra, maximum: agileMaximum() });
  } else {
    assertAgilePreparation();
    if (byId('legajo').value.trim() || byId('agileLegajos').value.trim()) {
      throw Error('Hay legajos escritos sin agregar. Agregalos o limpiá esos campos antes de usar el padrón.');
    }
    const periodMonth = agileTemplate?.periodMonth || exactMonth(byId('periodMonth').value, 'Período');
    const payrollType = agileTemplate?.payrollType || byId('payrollType').value;
    if (!bootstrapState.limits.payrollTypes.includes(payrollType)) throw Error('Elegí un tipo de liquidación habilitado.');
    const commonValues = agileTemplate?.commonValues || currentEntryValues().slice(1);
    const next = appendLegajoList({raw:ids.join('\n'),existingRows:agileDraftRows,commonValues,periodMonth,parseRow:rowFromValues,maximum:agileMaximum()});
    duplicateCheck(next);
    agileDraftRows = next;
    if (!agileTemplate) agileTemplate = {periodMonth,payrollType,commonValues:[...commonValues]};
    renderAgileRows();
  }
  invalidatePreparedDraft();
  showMessage('success', `${ids.length} legajo${ids.length===1?'':'s'} seleccionado${ids.length===1?'':'s'} desde el padrón`, 'Revisá concepto y unidades. Todavía no se guardó ningún lote; el servidor valida cada legajo al preparar.');
}

function openDirectoryPicker() {
  try {
    if (document.body.dataset.busy === 'true' || !hasCapability('payroll.novelty.prepare')) return;
    const mode = document.querySelector('[name="sourceMode"]:checked')?.value;
    if (!['individual','agile','sheet'].includes(mode)) return;
    const existing = mode==='agile' ? agileDraftRows.map(row=>row.legajo)
      : mode==='sheet' ? sheetEditor.values().map(row=>row[0]) : [];
    directoryPicker.open({mode,existing,maximum:agileMaximum()});
  } catch(error) {
    showMessage('error','No se pudo abrir el padrón',errorMessage(error));
  }
}

function initialize() {
  sheetEditor = mountNoveltySheet(byId('sheetFields'), { onChange: invalidatePreparedDraft });
  directoryPicker = mountNoveltyDirectory({getBootstrap:()=>bootstrapState,onApply:applyDirectoryPeople,onAccessLost:()=>{
    sheetEditor.clear(); agileDraftRows=[]; agileTemplate=null; clearAgileInput();
    byId('legajo').value=''; invalidatePreparedDraft(); renderAgileRows();
    showMessage('error','El acceso al padrón cambió','Actualizá Novedades o ingresá nuevamente con tu cuenta municipal. Se descartó la selección.');
  }});
  byId('directoryChooseButton').addEventListener('click',openDirectoryPicker);
  byId('sheetDirectoryButton').addEventListener('click',openDirectoryPicker);
  reviewPanel = mountNoveltyReviewPanel(byId('previewPanel'));
  issuesPanel = mountNoveltyIssues(byId('noveltyIssuesPanel'));
  window.addEventListener('pagehide', () => {
    sheetEditor.clear();
    agileDraftRows = []; agileTemplate = null; clearAgileInput();
    invalidatePreparedDraft(); renderAgileRows();
  });
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
  byId('agileAddButton').addEventListener('click', addAgileRow);
  byId('agileClearButton').addEventListener('click', clearAgileRows);
  byId('agileListAddButton').addEventListener('click', addAgileList);
  byId('agileListResetButton').addEventListener('click', () => {
    byId('agileLegajos').value = ''; invalidatePreparedDraft(); renderAgileList(); byId('agileLegajos').focus();
  });
  byId('agileSearch').addEventListener('input', renderAgileRows);
  byId('agileSearchReset').addEventListener('click', () => { byId('agileSearch').value = ''; renderAgileRows(); });
  byId('entrySection').addEventListener('input', renderAgileList);
  byId('entrySection').addEventListener('change', renderAgileList);
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
  byId('manualAmountEnabled').addEventListener('change',syncAmountEntry);
  byId('forced').addEventListener('change',syncAmountEntry);
  syncAmountEntry();
  updateMode();
  consumePayrollNoveltyHandoff();
  loadBootstrap();
}

initialize();
