export const PAYROLL_CONTROL_IMPORT_API = '/api/internal-payroll-control-import';
export const PAYROLL_CONTROL_IMPORT_CONTRACT = 'payroll-control-import.v1';
export const PAYROLL_CONTROL_IMPORT_DEFINITION = 'payroll-post-close-701-703.v1';
export const PAYROLL_CONTROL_IMPORT_MAX_BYTES = 16 * 1024;

const SOURCE_LABELS = Object.freeze({
  grh_observed: 'Reporte agregado observado en GRH',
  operator_control: 'Planilla agregada de control',
});

const STATUS_LABELS = Object.freeze({
  quarantined: 'Preparada · falta enviar',
  submitted: 'Pendiente de aprobación',
  validated: 'Fuente aprobada',
  rejected: 'Fuente rechazada',
  cancelled: 'Cancelada',
});

const COMMAND_LABELS = Object.freeze({
  submit: 'Enviar a validación',
  validate: 'Aprobar fuente',
  reject: 'Rechazar fuente',
  cancel: 'Cancelar corrida',
});

const ALLOWED_COMMANDS = new Set(Object.keys(COMMAND_LABELS));

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isAmountCents(value) {
  return typeof value === 'string' && /^-?\d+$/.test(value);
}

function validRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) return false;
  const concepts = rows.map((row) => String(row?.concept || '')).sort();
  return concepts.join(',') === '701,703'
    && rows.every((row) => isObject(row) && isAmountCents(row.amountCents));
}

export function validatePayrollControlBatch(batch) {
  if (!isObject(batch)) return false;
  if (!isUuid(batch.id) || !Object.hasOwn(SOURCE_LABELS, batch.sourceKind)) return false;
  if (!isMonth(batch.period) || !['42', '55'].includes(String(batch.jurisdiction))) return false;
  if (batch.contractVersion !== PAYROLL_CONTROL_IMPORT_CONTRACT
    || batch.definitionKey !== PAYROLL_CONTROL_IMPORT_DEFINITION) return false;
  if (!Object.hasOwn(STATUS_LABELS, batch.status) || !Number.isInteger(batch.version) || batch.version < 1) return false;
  if (!Number.isInteger(batch.byteLength) || batch.byteLength < 1 || batch.byteLength > PAYROLL_CONTROL_IMPORT_MAX_BYTES) return false;
  if (!validRows(batch.rows)) return false;
  if (!Array.isArray(batch.allowedCommands)
    || batch.allowedCommands.some((command) => !ALLOWED_COMMANDS.has(command))) return false;
  return true;
}

export function validatePayrollControlBootstrap(payload) {
  if (!isObject(payload) || payload.ok !== true || !isObject(payload.data)) return false;
  const { principal, batches, recentEvents, limits } = payload.data;
  if (!isObject(principal) || typeof principal.roleKey !== 'string'
    || !Array.isArray(principal.capabilities)) return false;
  if (!Array.isArray(batches) || batches.some((batch) => !validatePayrollControlBatch(batch))) return false;
  if (!Array.isArray(recentEvents) || !isObject(limits)) return false;
  if (limits.maxSourceBytes !== PAYROLL_CONTROL_IMPORT_MAX_BYTES
    || limits.contractVersion !== PAYROLL_CONTROL_IMPORT_CONTRACT
    || limits.definitionKey !== PAYROLL_CONTROL_IMPORT_DEFINITION) return false;
  return true;
}

export function formatPayrollAmountCents(value) {
  if (!isAmountCents(String(value))) return 'No disponible';
  const cents = BigInt(String(value));
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '- ' : ''}$ ${whole},${fraction}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function safeDate(value) {
  if (typeof value !== 'string' || !value) return 'No informado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return 'No informado';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Mendoza',
  }).format(parsed);
}

function reasonLabel(value) {
  return ({
    ready_for_validation: 'Enviada para validación',
    source_validated: 'Fuente validada',
    contract_invalid: 'Contrato de archivo inválido',
    amounts_inconsistent: 'Importes inconsistentes',
    source_unverifiable: 'No se pudo verificar la fuente',
    cancelled_by_preparer: 'Cancelada por quien la preparó',
  })[value] || 'Sin motivo informado';
}

function stateClass(status) {
  if (status === 'validated') return 'closed';
  if (status === 'rejected' || status === 'cancelled') return 'blocked';
  return 'warning';
}

export function createPayrollControlImportWorkflow(root, options = {}) {
  if (!root) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const locationImpl = options.locationImpl || globalThis.location;
  const nodes = {
    status: root.querySelector('[data-control-import-status]'),
    role: root.querySelector('[data-control-import-role]'),
    makerChecker: root.querySelector('[data-control-import-maker-checker]'),
    preparePanel: root.querySelector('[data-control-import-prepare-panel]'),
    form: root.querySelector('[data-control-import-form]'),
    sourceKind: root.querySelector('[data-control-import-source-kind]'),
    period: root.querySelector('[data-control-import-period]'),
    jurisdiction: root.querySelector('[data-control-import-jurisdiction]'),
    file: root.querySelector('[data-control-import-file]'),
    fileState: root.querySelector('[data-control-import-file-state]'),
    submit: root.querySelector('[data-control-import-prepare]'),
    refresh: root.querySelector('[data-control-import-refresh]'),
    tbody: root.querySelector('[data-control-import-batches]'),
    empty: root.querySelector('[data-control-import-empty]'),
    detail: root.querySelector('[data-control-import-detail]'),
    detailTitle: root.querySelector('[data-control-import-detail-title]'),
    detailMeta: root.querySelector('[data-control-import-detail-meta]'),
    detailRows: root.querySelector('[data-control-import-detail-rows]'),
    events: root.querySelector('[data-control-import-events]'),
    actions: root.querySelector('[data-control-import-actions]'),
    rejectReason: root.querySelector('[data-control-import-reject-reason]'),
    actionStatus: root.querySelector('[data-control-import-action-status]'),
  };
  const state = { bootstrap: null, selectedId: null, busy: false };

  function setStatus(message, kind = '') {
    if (!nodes.status) return;
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function setBusy(busy) {
    state.busy = busy;
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('button, input, select').forEach((element) => {
      element.disabled = busy;
    });
  }

  function redirectToLogin() {
    const next = `${locationImpl.pathname.split('/').pop() || 'nomina-control.html'}${locationImpl.hash || ''}`;
    locationImpl.replace(`login.html?next=${encodeURIComponent(next)}`);
  }

  async function api(url, init) {
    const response = await fetchImpl(url, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers || {}) },
    });
    if (response.status === 401) {
      redirectToLogin();
      throw new Error('La sesión venció.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isObject(payload) || payload.ok !== true) {
      const code = typeof payload?.code === 'string' ? payload.code : '';
      const messages = {
        PAYROLL_CONTROL_IMPORT_COMMAND_FORBIDDEN: 'Tu rol no tiene permiso para esta operación.',
        PAYROLL_CONTROL_IMPORT_VERSION_CONFLICT: 'La corrida cambió. Actualizá antes de decidir.',
        PAYROLL_CONTROL_IMPORT_NOT_FOUND: 'La corrida ya no está disponible en este contexto.',
        PAYROLL_CONTROL_IMPORT_SOURCE_INVALID: 'El archivo no cumple el contrato exacto de conceptos 701 y 703.',
      };
      throw new Error(messages[code] || 'No se pudo completar la operación en el servidor.');
    }
    return payload;
  }

  function batchById(id) {
    return state.bootstrap?.batches.find((batch) => batch.id === id) || null;
  }

  function renderEvents(batch) {
    nodes.events.replaceChildren();
    const events = state.bootstrap.recentEvents.filter((event) => event?.batchId === batch.id);
    if (!events.length) {
      const item = document.createElement('li');
      item.textContent = 'La sesión no dispone del historial ampliado para esta corrida.';
      nodes.events.append(item);
      return;
    }
    events.forEach((event) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = `${COMMAND_LABELS[event.command] || event.command} · ${safeDate(event.occurredAt)}`;
      const detail = document.createElement('span');
      detail.textContent = `${event.actorRoleKey || 'Rol no informado'} · v${event.resultingVersion || '—'} · ${reasonLabel(event.reasonCode)}`;
      item.append(title, detail);
      nodes.events.append(item);
    });
  }

  function actionPayload(command, batch) {
    const common = { batchId: batch.id, expectedVersion: batch.version };
    if (command === 'submit') return { ...common, reasonCode: 'ready_for_validation', reasonReference: null };
    if (command === 'validate') return { ...common, reasonCode: 'source_validated', reasonReference: null };
    if (command === 'cancel') {
      return { ...common, reasonCode: 'cancelled_by_preparer', reasonReference: `ref:${cryptoImpl.randomUUID()}` };
    }
    return {
      ...common,
      reasonCode: nodes.rejectReason.value,
      reasonReference: `ref:${cryptoImpl.randomUUID()}`,
    };
  }

  async function runCommand(command) {
    const batch = batchById(state.selectedId);
    if (!batch || !batch.allowedCommands.includes(command) || state.busy) return;
    if (command === 'reject' && !['contract_invalid', 'amounts_inconsistent', 'source_unverifiable'].includes(nodes.rejectReason.value)) {
      nodes.actionStatus.textContent = 'Elegí un motivo de rechazo.';
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    setBusy(true);
    nodes.actionStatus.textContent = 'Registrando la decisión…';
    nodes.actionStatus.dataset.state = 'warning';
    try {
      const apiCommand = command === 'validate' ? 'approve' : command;
      const result = await api(PAYROLL_CONTROL_IMPORT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': cryptoImpl.randomUUID(),
        },
        body: JSON.stringify({ command: apiCommand, payload: actionPayload(command, batch) }),
      });
      state.selectedId = result.data?.id || batch.id;
      await load({ announce: `${COMMAND_LABELS[command]} registrada en PostgreSQL con auditoría.` });
    } catch (error) {
      nodes.actionStatus.textContent = error instanceof Error ? error.message : 'No se pudo registrar la decisión.';
      nodes.actionStatus.dataset.state = 'error';
    } finally {
      setBusy(false);
    }
  }

  function renderDetail(batch) {
    nodes.detail.hidden = !batch;
    if (!batch) return;
    nodes.detailTitle.textContent = `${SOURCE_LABELS[batch.sourceKind]} · ${batch.period} · J${batch.jurisdiction}`;
    nodes.detailMeta.replaceChildren();
    [
      ['Estado', STATUS_LABELS[batch.status]],
      ['Versión', String(batch.version)],
      ['Contrato', batch.contractVersion],
      ['Fuente declarada', batch.provenanceState === 'operator_declared' ? 'Declarada por operador' : 'Observada en GRH'],
      ['Tamaño procesado', `${batch.byteLength} bytes`],
      ['Huella HMAC', `${String(batch.contentFingerprint || '').slice(0, 16)}…`],
      ['Creada', safeDate(batch.createdAt)],
      ['Último cambio', safeDate(batch.updatedAt)],
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = label;
      const span = document.createElement('span');
      span.textContent = value;
      item.append(strong, span);
      nodes.detailMeta.append(item);
    });
    nodes.detailRows.replaceChildren();
    batch.rows.forEach((row) => {
      const tr = document.createElement('tr');
      const concept = document.createElement('td');
      concept.textContent = row.concept;
      const amount = document.createElement('td');
      amount.className = 'numeric';
      amount.textContent = formatPayrollAmountCents(row.amountCents);
      tr.append(concept, amount);
      nodes.detailRows.append(tr);
    });
    renderEvents(batch);
    nodes.actions.replaceChildren();
    nodes.rejectReason.closest('[data-control-import-reject-field]').hidden = !batch.allowedCommands.includes('reject');
    batch.allowedCommands.forEach((command) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button${command === 'validate' || command === 'submit' ? ' primary' : ''}`;
      button.dataset.controlImportCommand = command;
      button.textContent = COMMAND_LABELS[command];
      button.addEventListener('click', () => runCommand(command));
      nodes.actions.append(button);
    });
    nodes.actionStatus.textContent = batch.allowedCommands.length
      ? 'La API habilitó las decisiones visibles para esta sesión.'
      : 'No hay decisiones habilitadas para este rol y estado.';
    nodes.actionStatus.dataset.state = batch.allowedCommands.length ? 'ok' : 'warning';
  }

  function renderList() {
    nodes.tbody.replaceChildren();
    const batches = state.bootstrap.batches;
    nodes.empty.hidden = batches.length > 0;
    batches.forEach((batch) => {
      const tr = document.createElement('tr');
      const source = document.createElement('td');
      source.textContent = SOURCE_LABELS[batch.sourceKind];
      const period = document.createElement('td');
      period.textContent = `${batch.period} · J${batch.jurisdiction}`;
      const amounts = document.createElement('td');
      amounts.textContent = batch.rows.map((row) => `${row.concept}: ${formatPayrollAmountCents(row.amountCents)}`).join(' · ');
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `state-badge ${stateClass(batch.status)}`;
      badge.textContent = STATUS_LABELS[batch.status];
      status.append(badge);
      const open = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button';
      button.textContent = 'Ver corrida';
      button.addEventListener('click', () => {
        state.selectedId = batch.id;
        renderDetail(batch);
        nodes.detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      open.append(button);
      tr.append(source, period, amounts, status, open);
      nodes.tbody.append(tr);
    });
    const selected = batchById(state.selectedId) || batches[0] || null;
    state.selectedId = selected?.id || null;
    renderDetail(selected);
  }

  function renderBootstrap(data, announce) {
    state.bootstrap = data;
    const canPrepare = data.principal.capabilities.includes('payroll.control_import.prepare');
    const canValidate = data.principal.capabilities.includes('payroll.control_import.validate');
    nodes.role.textContent = data.principal.roleKey;
    nodes.preparePanel.hidden = !canPrepare;
    nodes.makerChecker.textContent = canPrepare
      ? 'Tu sesión puede preparar y enviar fuentes. Otra identidad autorizada debe aprobarlas.'
      : canValidate
        ? 'Tu sesión puede aprobar o rechazar corridas enviadas por otra identidad.'
        : 'Tu sesión es de consulta: puede revisar corridas, sin modificarlas.';
    renderList();
    setStatus(announce || `Se cargaron ${data.batches.length} corridas del contexto certificado.`, 'ok');
  }

  async function load(options = {}) {
    if (!options.keepBusy) setBusy(true);
    setStatus('Consultando corridas persistidas…', 'warning');
    try {
      const payload = await api(`${PAYROLL_CONTROL_IMPORT_API}?resource=bootstrap`);
      if (!validatePayrollControlBootstrap(payload)) throw new Error('La API devolvió un contrato de corridas no reconocido.');
      renderBootstrap(payload.data, options.announce);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudieron consultar las corridas.', 'error');
      nodes.preparePanel.hidden = true;
      nodes.empty.hidden = false;
      nodes.detail.hidden = true;
    } finally {
      if (!options.keepBusy) setBusy(false);
    }
  }

  async function prepare(event) {
    event.preventDefault();
    if (state.busy) return;
    const file = nodes.file.files?.[0];
    const errors = [];
    if (!Object.hasOwn(SOURCE_LABELS, nodes.sourceKind.value)) errors.push('Elegí el origen declarado.');
    if (!isMonth(nodes.period.value)) errors.push('Elegí un período mensual válido.');
    if (!['42', '55'].includes(nodes.jurisdiction.value)) errors.push('Elegí la jurisdicción 42 o 55.');
    if (!file) errors.push('Elegí el CSV agregado de conceptos 701 y 703.');
    if (file && (file.size < 1 || file.size > PAYROLL_CONTROL_IMPORT_MAX_BYTES)) errors.push('El archivo debe pesar entre 1 byte y 16 KiB.');
    if (errors.length) {
      nodes.actionStatus.textContent = errors.join(' ');
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    setBusy(true);
    setStatus('Validando y preparando la corrida…', 'warning');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await api(PAYROLL_CONTROL_IMPORT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': cryptoImpl.randomUUID(),
        },
        body: JSON.stringify({
          command: 'prepare',
          payload: {
            sourceKind: nodes.sourceKind.value,
            period: nodes.period.value,
            jurisdiction: nodes.jurisdiction.value,
            definitionKey: PAYROLL_CONTROL_IMPORT_DEFINITION,
            contentBase64: bytesToBase64(bytes),
          },
        }),
      });
      state.selectedId = result.data?.id || null;
      nodes.form.reset();
      nodes.fileState.textContent = 'No hay un archivo seleccionado.';
      await load({ announce: 'Corrida preparada y guardada en cuarentena. Revisala y enviala a aprobación.' });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo preparar la corrida.', 'error');
    } finally {
      setBusy(false);
    }
  }

  nodes.file?.addEventListener('change', () => {
    const file = nodes.file.files?.[0];
    nodes.fileState.textContent = file ? `${file.size} bytes listos para validar; el nombre no se conserva.` : 'No hay un archivo seleccionado.';
    nodes.fileState.dataset.state = file && file.size <= PAYROLL_CONTROL_IMPORT_MAX_BYTES ? 'ready' : file ? 'error' : '';
  });
  nodes.form?.addEventListener('submit', prepare);
  nodes.refresh?.addEventListener('click', () => load());
  load();
  return { load, prepare, getState: () => ({ ...state }) };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-control-import-workflow]');
  if (root) createPayrollControlImportWorkflow(root);
}
