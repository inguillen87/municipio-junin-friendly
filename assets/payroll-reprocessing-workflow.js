export const PAYROLL_REPROCESSING_API = '/api/internal-payroll-reprocessing';
export const PAYROLL_REPROCESSING_CONTRACT = 'payroll-reprocessing-case.v1';

const REQUEST_KIND_LABELS = Object.freeze({
  void: 'Anulación',
  reliquidate: 'Reliquidación',
});

const STATUS_LABELS = Object.freeze({
  draft: 'Borrador',
  submitted: 'En revisión',
  approved: 'Ejecución externa autorizada',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
});

const BUSINESS_REASON_LABELS = Object.freeze({
  duplicate_run: 'Corrida duplicada',
  incorrect_personnel: 'Personal incorrecto',
  incorrect_concept: 'Concepto incorrecto',
  incorrect_amount: 'Importe incorrecto',
  source_correction: 'Corrección de la fuente',
  legal_adjustment: 'Adecuación normativa',
  other_controlled: 'Otro motivo controlado',
});

const EVENT_REASON_LABELS = Object.freeze({
  ...BUSINESS_REASON_LABELS,
  ready_for_review: 'Enviado a revisión',
  approved_for_external_execution: 'Ejecución externa autorizada',
  insufficient_evidence: 'Evidencia insuficiente',
  run_not_eligible: 'Corrida no elegible',
  request_not_authorized: 'Solicitud no autorizada',
  cancelled_by_preparer: 'Cancelado por quien preparó',
});

const COMMAND_LABELS = Object.freeze({
  prepare: 'Expediente preparado',
  submit: 'Enviar a revisión',
  approve: 'Autorizar ejecución externa',
  reject: 'Rechazar',
  cancel: 'Cancelar expediente',
});

const ALLOWED_COMMANDS = new Set(['submit', 'approve', 'reject', 'cancel']);
const EVENT_COMMANDS = new Set(['prepare', ...ALLOWED_COMMANDS]);
const REQUEST_KINDS = new Set(Object.keys(REQUEST_KIND_LABELS));
const BUSINESS_REASONS = new Set(Object.keys(BUSINESS_REASON_LABELS));
const TRANSITION_REASONS = Object.freeze({
  submit: new Set(['ready_for_review']),
  approve: new Set(['approved_for_external_execution']),
  reject: new Set(['insufficient_evidence', 'run_not_eligible', 'request_not_authorized']),
  cancel: new Set(['cancelled_by_preparer']),
});
const PREPARE_KEYS = new Set(['payrollRunId', 'requestKind', 'reasonCode', 'reasonReference']);
const TRANSITION_KEYS = new Set(['caseId', 'expectedVersion', 'reasonCode', 'reasonReference']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE = /^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_EFFECT = 'external_execution_authorization_only';
const PAGE_LIMIT = 10;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasSafeBoundary(value) {
  return isObject(value)
    && value.approvalEffect === SAFE_EFFECT
    && value.grhMutation === false
    && value.payrollVoided === false
    && value.payrollCalculated === false
    && value.payrollPosted === false;
}

function isSafeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function hasExactValues(values, allowed) {
  return Array.isArray(values)
    && values.length === allowed.size
    && new Set(values).size === values.length
    && values.every((value) => allowed.has(value));
}

function validTarget(target) {
  return isObject(target)
    && typeof target.payrollRunId === 'string'
    && UUID.test(target.payrollRunId)
    && typeof target.runSha256 === 'string'
    && SHA256.test(target.runSha256)
    && /^\d{4}-\d{2}-\d{2}/.test(String(target.payrollDate || ''))
    && target.sourceSystem === 'GRH'
    && target.closureStatus === 'closed';
}

export function validatePayrollReprocessingCase(value, options = {}) {
  if (!hasSafeBoundary(value) || !UUID.test(String(value.id || ''))
    || value.contractVersion !== PAYROLL_REPROCESSING_CONTRACT
    || !Object.hasOwn(REQUEST_KIND_LABELS, value.requestKind)
    || !Object.hasOwn(STATUS_LABELS, value.status)
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !BUSINESS_REASONS.has(value.businessReasonCode)
    || !REFERENCE.test(String(value.businessReasonReference || ''))
    || (value.decisionReasonReference != null
      && !REFERENCE.test(String(value.decisionReasonReference)))
    || typeof value.executionAuthorized !== 'boolean'
    || value.executionAuthorized !== (value.status === 'approved')
    || !validTarget(value.target)
    || !Array.isArray(value.timeline)) return false;
  if (options.detail === true) {
    if (!Array.isArray(value.allowedCommands)
      || value.allowedCommands.some((command) => !ALLOWED_COMMANDS.has(command))) return false;
  }
  return value.timeline.every((event) => isObject(event)
    && Number.isSafeInteger(event.resultingVersion)
    && event.resultingVersion >= 1
    && EVENT_COMMANDS.has(event.command)
    && (event.fromStatus == null || Object.hasOwn(STATUS_LABELS, event.fromStatus))
    && Object.hasOwn(STATUS_LABELS, event.toStatus)
    && typeof event.eventSha256 === 'string'
    && SHA256.test(event.eventSha256)
    && typeof event.occurredAt === 'string');
}

export function validatePayrollReprocessingBootstrap(payload) {
  if (!isObject(payload) || payload.ok !== true
    || payload.contractVersion !== PAYROLL_REPROCESSING_CONTRACT
    || payload.approvalEffect !== SAFE_EFFECT
    || !isObject(payload.feature) || !isObject(payload.counts)
    || !Array.isArray(payload.requestKinds) || !Array.isArray(payload.businessReasonCodes)) return false;
  if (typeof payload.feature.canPrepare !== 'boolean'
    || typeof payload.feature.canApprove !== 'boolean') return false;
  if (!hasSafeBoundary({ approvalEffect: payload.approvalEffect, ...payload.feature })) return false;
  if (!Object.keys(STATUS_LABELS).every((status) => isSafeCount(payload.counts[status]))) return false;
  if (!hasExactValues(payload.requestKinds, REQUEST_KINDS)
    || !hasExactValues(payload.businessReasonCodes, BUSINESS_REASONS)) return false;
  return true;
}

export function validatePayrollReprocessingList(payload) {
  return Boolean(isObject(payload) && payload.ok === true && hasSafeBoundary(payload)
    && isObject(payload.data) && Array.isArray(payload.data.items)
    && isSafeCount(payload.data.total)
    && Number.isSafeInteger(payload.data.page) && payload.data.page >= 1
    && Number.isSafeInteger(payload.data.limit) && payload.data.limit >= 1
    && payload.data.items.every((item) => validatePayrollReprocessingCase(item)));
}

export function validatePayrollReprocessingDetail(payload) {
  return Boolean(isObject(payload) && payload.ok === true && hasSafeBoundary(payload)
    && validatePayrollReprocessingCase(payload.data, { detail: true }));
}

export function buildPayrollReprocessingMutation(command, payload) {
  if (command === 'prepare') {
    if (!hasExactKeys(payload, PREPARE_KEYS) || !UUID.test(String(payload.payrollRunId || ''))
      || !Object.hasOwn(REQUEST_KIND_LABELS, payload.requestKind)
      || !Object.hasOwn(BUSINESS_REASON_LABELS, payload.reasonCode)
      || !REFERENCE.test(String(payload.reasonReference || ''))) return null;
  } else if (!ALLOWED_COMMANDS.has(command) || !hasExactKeys(payload, TRANSITION_KEYS)
    || !UUID.test(String(payload.caseId || ''))
    || !Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion < 1
    || !TRANSITION_REASONS[command].has(payload.reasonCode)
    || !REFERENCE.test(String(payload.reasonReference || ''))) return null;
  return { command, payload };
}

function localDate(value) {
  if (!value) return 'No informada';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'No informada';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Mendoza',
  }).format(date);
}

function payrollDate(value) {
  if (typeof value !== 'string' || !value) return 'Fecha no informada';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function stateClass(status) {
  if (status === 'approved') return 'closed';
  if (status === 'rejected' || status === 'cancelled') return 'blocked';
  return 'warning';
}

function reasonLabel(value) {
  return EVENT_REASON_LABELS[value] || 'Motivo controlado';
}

function shortHash(value) {
  const text = typeof value === 'string' ? value : '';
  return /^[a-f0-9]{64}$/i.test(text) ? `${text.slice(0, 12)}…${text.slice(-6)}` : 'No informada';
}

function shortRunId(value) {
  const text = typeof value === 'string' ? value : '';
  return UUID.test(text) ? text.slice(0, 8) : 'no informada';
}

function newReference(cryptoImpl) {
  if (!cryptoImpl || typeof cryptoImpl.randomUUID !== 'function') {
    throw new Error('El navegador no puede generar referencias seguras.');
  }
  const value = cryptoImpl.randomUUID().toLowerCase();
  if (!UUID_V4.test(value)) throw new Error('El navegador devolvió una referencia no válida.');
  return `ref:${value}`;
}

function appendMeta(host, label, value) {
  const item = document.createElement('div');
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  title.textContent = label;
  detail.textContent = value == null || value === '' ? 'No informado' : String(value);
  item.append(title, detail);
  host.append(item);
}

export function createPayrollReprocessingWorkflow(root, options = {}) {
  if (!root) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const locationImpl = options.locationImpl || globalThis.location;
  const clipboardImpl = options.clipboardImpl || globalThis.navigator?.clipboard;
  const nodes = {
    status: root.querySelector('[data-reprocessing-status]'),
    scope: root.querySelector('[data-reprocessing-scope]'),
    preparePanel: root.querySelector('[data-reprocessing-prepare-panel]'),
    prepareForm: root.querySelector('[data-reprocessing-prepare-form]'),
    run: root.querySelector('[data-reprocessing-run]'),
    kind: root.querySelector('[data-reprocessing-kind]'),
    businessReason: root.querySelector('[data-reprocessing-business-reason]'),
    prepareReference: root.querySelector('[data-reprocessing-prepare-reference]'),
    copyPrepareReference: root.querySelector('[data-reprocessing-copy-prepare-reference]'),
    newPrepareReference: root.querySelector('[data-reprocessing-new-prepare-reference]'),
    refresh: root.querySelector('[data-reprocessing-refresh]'),
    filter: root.querySelector('[data-reprocessing-filter]'),
    previous: root.querySelector('[data-reprocessing-previous]'),
    next: root.querySelector('[data-reprocessing-next]'),
    page: root.querySelector('[data-reprocessing-page]'),
    cases: root.querySelector('[data-reprocessing-cases]'),
    empty: root.querySelector('[data-reprocessing-empty]'),
    detail: root.querySelector('[data-reprocessing-detail]'),
    detailTitle: root.querySelector('[data-reprocessing-detail-title]'),
    detailMeta: root.querySelector('[data-reprocessing-detail-meta]'),
    timeline: root.querySelector('[data-reprocessing-timeline]'),
    rejectField: root.querySelector('[data-reprocessing-reject-field]'),
    rejectReason: root.querySelector('[data-reprocessing-reject-reason]'),
    actionReferenceField: root.querySelector('[data-reprocessing-action-reference-field]'),
    actionReference: root.querySelector('[data-reprocessing-action-reference]'),
    copyActionReference: root.querySelector('[data-reprocessing-copy-action-reference]'),
    newActionReference: root.querySelector('[data-reprocessing-new-action-reference]'),
    actions: root.querySelector('[data-reprocessing-actions]'),
    confirm: root.querySelector('[data-reprocessing-confirm]'),
    confirmSummary: root.querySelector('[data-reprocessing-confirm-summary]'),
    confirmCancel: root.querySelector('[data-reprocessing-confirm-cancel]'),
    confirmAction: root.querySelector('[data-reprocessing-confirm-action]'),
    actionStatus: root.querySelector('[data-reprocessing-action-status]'),
    idempotency: root.querySelector('[data-reprocessing-idempotency]'),
  };
  const state = {
    bootstrap: null,
    list: null,
    detail: null,
    selectedId: null,
    page: 1,
    filter: 'all',
    busy: false,
    attempts: new Map(),
    pendingTransition: null,
  };

  function setStatus(message, kind = '') {
    nodes.status.textContent = message;
    nodes.status.dataset.state = kind;
  }

  function syncPagination() {
    const total = state.list?.total || 0;
    const limit = state.list?.limit || PAGE_LIMIT;
    nodes.previous.disabled = state.busy || state.page <= 1;
    nodes.next.disabled = state.busy || state.page * limit >= total;
  }

  function setBusy(busy) {
    state.busy = busy;
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('button, input, select').forEach((element) => {
      element.disabled = busy;
    });
    if (!busy) syncPagination();
  }

  function redirectToLogin() {
    const next = `${locationImpl.pathname.split('/').pop() || 'nomina-control.html'}${locationImpl.hash || ''}`;
    locationImpl.replace(`login.html?next=${encodeURIComponent(next)}`);
  }

  async function api(url, init) {
    let response;
    try {
      response = await fetchImpl(url, {
        credentials: 'same-origin',
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers || {}) },
      });
    } catch {
      throw new Error('No se pudo confirmar la respuesta. Reintentá: se conservará la misma clave idempotente.');
    }
    if (response.status === 401) {
      redirectToLogin();
      throw new Error('La sesión venció.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isObject(payload) || payload.ok !== true) {
      const code = typeof payload?.code === 'string' ? payload.code : '';
      const messages = {
        PAYROLL_REPROCESSING_DUPLICATE_CASE: 'Ya existe un expediente activo para esa corrida y acción.',
        PAYROLL_REPROCESSING_VERSION_CONFLICT: 'Otra persona actualizó el expediente. Actualizá antes de decidir.',
        PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED: 'Quien preparó el expediente no puede decidirlo.',
        PAYROLL_REPROCESSING_RUN_NOT_ELIGIBLE: 'La corrida no está cerrada o no pertenece al origen GRH certificado.',
        PAYROLL_REPROCESSING_PREPARER_REQUIRED: 'Sólo quien preparó el expediente puede enviarlo o cancelarlo.',
        PAYROLL_REPROCESSING_CAPABILITY_REQUIRED: 'Tu sesión no tiene permiso para esta operación.',
        PAYROLL_REPROCESSING_EMPLOYMENT_REQUIRED: 'La decisión exige un vínculo laboral vigente.',
        PAYROLL_REPROCESSING_NOT_FOUND: 'El expediente ya no está disponible en este contexto.',
        PAYROLL_REPROCESSING_RELEASE_NOT_CERTIFIED: 'La versión desplegada debe certificarse antes de operar.',
        PAYROLL_REPROCESSING_BINDING_REQUIRED: 'No hay un vínculo GRH certificado disponible.',
      };
      throw new Error(messages[code] || payload?.error || 'No se pudo completar la operación.');
    }
    return payload;
  }

  function mutationSignature(command, payload) {
    return `${command}:${JSON.stringify(payload)}`;
  }

  async function mutate(command, payload) {
    const body = buildPayrollReprocessingMutation(command, payload);
    if (!body) throw new Error('La operación no cumple el contrato de anulación y reliquidación.');
    const signature = mutationSignature(command, payload);
    let idempotencyKey = state.attempts.get(signature);
    if (!idempotencyKey) {
      idempotencyKey = cryptoImpl.randomUUID().toLowerCase();
      if (!UUID_V4.test(idempotencyKey)) throw new Error('No se pudo crear una clave idempotente segura.');
      state.attempts.set(signature, idempotencyKey);
    }
    nodes.idempotency.textContent = `Intento ${idempotencyKey} · pendiente de confirmación; se reutilizará si la respuesta es incierta.`;
    try {
      const result = await api(PAYROLL_REPROCESSING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
      });
      if (!validatePayrollReprocessingCase(result.data)) {
        throw new Error('El servidor confirmó la solicitud con un comprobante incompatible; actualizá antes de continuar.');
      }
      state.attempts.delete(signature);
      nodes.idempotency.textContent = result.replayed === true
        ? `Intento ${idempotencyKey} · resultado idempotente recuperado sin duplicar la operación.`
        : `Intento ${idempotencyKey} · confirmado una sola vez por el servidor.`;
      return result;
    } catch (error) {
      nodes.idempotency.textContent = `Intento ${idempotencyKey} · no confirmado; el próximo reintento idéntico conservará esta clave.`;
      throw error;
    }
  }

  function setReference(node) {
    node.value = newReference(cryptoImpl);
  }

  async function copyReference(node, statusNode = nodes.status) {
    const value = String(node?.value || '');
    if (!REFERENCE.test(value)) {
      statusNode.textContent = 'No hay un identificador de correlación válido para copiar.';
      statusNode.dataset.state = 'error';
      return false;
    }
    try {
      if (!clipboardImpl || typeof clipboardImpl.writeText !== 'function') throw new Error('clipboard_unavailable');
      await clipboardImpl.writeText(value);
      statusNode.textContent = 'Identificador de correlación copiado. Registralo también en el expediente externo autorizado.';
      statusNode.dataset.state = 'ok';
      return true;
    } catch {
      node.focus();
      node.select();
      statusNode.textContent = 'No se pudo copiar automáticamente. El identificador quedó seleccionado para copiarlo manualmente.';
      statusNode.dataset.state = 'warning';
      return false;
    }
  }

  function clearConfirmation() {
    state.pendingTransition = null;
    if (nodes.confirm) nodes.confirm.hidden = true;
    if (nodes.confirmSummary) nodes.confirmSummary.textContent = 'Revisá la corrida, la acción y la versión antes de continuar.';
    if (nodes.confirmAction) {
      nodes.confirmAction.className = 'button';
      nodes.confirmAction.textContent = 'Confirmar decisión';
    }
  }

  function clearDetail(selectedId = null) {
    state.detail = null;
    state.selectedId = selectedId;
    clearConfirmation();
    nodes.detail.hidden = true;
    nodes.detailTitle.textContent = '';
    nodes.detailMeta.replaceChildren();
    nodes.timeline.replaceChildren();
    nodes.actions.replaceChildren();
    nodes.rejectField.hidden = true;
    nodes.actionReferenceField.hidden = true;
  }

  function renderCounts() {
    Object.keys(STATUS_LABELS).forEach((status) => {
      const node = root.querySelector(`[data-reprocessing-count="${status}"]`);
      if (node) node.textContent = String(state.bootstrap.counts[status]);
    });
  }

  function renderReasons() {
    const selected = nodes.businessReason.value;
    nodes.businessReason.replaceChildren();
    state.bootstrap.businessReasonCodes.forEach((reason) => {
      const option = document.createElement('option');
      option.value = reason;
      option.textContent = BUSINESS_REASON_LABELS[reason];
      nodes.businessReason.append(option);
    });
    if (state.bootstrap.businessReasonCodes.includes(selected)) nodes.businessReason.value = selected;
  }

  function renderBootstrap() {
    const feature = state.bootstrap.feature;
    nodes.preparePanel.hidden = feature.canPrepare !== true;
    if (feature.canPrepare === true && feature.canApprove === true) {
      nodes.scope.textContent = 'Preparación y decisión habilitadas: el servidor impide decidir expedientes propios y sólo ofrece acciones válidas para cada caso.';
    } else if (feature.canPrepare === true) {
      nodes.scope.textContent = 'Preparación habilitada: podés crear, enviar y cancelar tus expedientes; otra identidad debe decidir.';
    } else if (feature.canApprove === true) {
      nodes.scope.textContent = 'Decisión habilitada: podés autorizar o rechazar expedientes enviados por otra identidad.';
    } else {
      nodes.scope.textContent = 'Consulta habilitada: podés revisar expedientes, versiones y estados sin modificarlos.';
    }
    renderCounts();
    renderReasons();
  }

  function renderList() {
    nodes.cases.replaceChildren();
    const items = state.list.items;
    nodes.empty.hidden = items.length > 0;
    items.forEach((item) => {
      const row = document.createElement('tr');
      const run = document.createElement('td');
      run.textContent = `${payrollDate(item.target.payrollDate)}${item.target.payrollType ? ` · ${item.target.payrollType}` : ''} · corrida ${shortRunId(item.target.payrollRunId)} · huella ${shortHash(item.target.runSha256)}`;
      const kind = document.createElement('td');
      kind.textContent = REQUEST_KIND_LABELS[item.requestKind];
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `state-badge ${stateClass(item.status)}`;
      badge.textContent = STATUS_LABELS[item.status];
      status.append(badge);
      const version = document.createElement('td');
      version.textContent = `v${item.version}`;
      const action = document.createElement('td');
      const button = document.createElement('button');
      button.className = 'button';
      button.type = 'button';
      button.textContent = 'Abrir';
      button.addEventListener('click', () => loadDetail(item.id, { scroll: true }));
      action.append(button);
      row.append(run, kind, status, version, action);
      nodes.cases.append(row);
    });
    const first = (items.find((item) => item.id === state.selectedId) || items[0] || null);
    state.selectedId = first?.id || null;
    const firstItem = Math.min((state.page - 1) * state.list.limit + 1, state.list.total);
    const lastItem = Math.min(state.page * state.list.limit, state.list.total);
    nodes.page.textContent = state.list.total
      ? `Mostrando ${firstItem}–${lastItem} de ${state.list.total} expedientes.`
      : 'No hay expedientes para el estado seleccionado.';
    syncPagination();
  }

  function renderTimeline(detail) {
    nodes.timeline.replaceChildren();
    if (!detail.timeline.length) {
      const item = document.createElement('li');
      item.textContent = 'El historial ampliado no está habilitado para esta sesión.';
      nodes.timeline.append(item);
      return;
    }
    detail.timeline.forEach((event) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      const meta = document.createElement('span');
      const evidence = document.createElement('span');
      title.textContent = `${COMMAND_LABELS[event.command] || event.command} · ${localDate(event.occurredAt)}`;
      meta.textContent = `${event.fromStatus ? `${STATUS_LABELS[event.fromStatus] || event.fromStatus} → ` : ''}${STATUS_LABELS[event.toStatus] || event.toStatus} · v${event.resultingVersion} · ${reasonLabel(event.reasonCode)}`;
      evidence.textContent = `${event.actorRoleKey || 'Rol no informado'} · evidencia ${shortHash(event.eventSha256)}`;
      item.append(title, meta, evidence);
      nodes.timeline.append(item);
    });
  }

  function transitionReason(command) {
    if (command === 'submit') return 'ready_for_review';
    if (command === 'approve') return 'approved_for_external_execution';
    if (command === 'cancel') return 'cancelled_by_preparer';
    return nodes.rejectReason.value;
  }

  function renderActions(detail) {
    clearConfirmation();
    nodes.actions.replaceChildren();
    const allowed = detail.allowedCommands;
    nodes.rejectField.hidden = !allowed.includes('reject');
    nodes.actionReferenceField.hidden = allowed.length === 0;
    if (allowed.length && !REFERENCE.test(nodes.actionReference.value)) setReference(nodes.actionReference);
    allowed.forEach((command) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `button${command === 'approve' || command === 'submit' ? ' primary' : ''}${command === 'reject' || command === 'cancel' ? ' danger' : ''}`;
      button.textContent = COMMAND_LABELS[command];
      button.dataset.reprocessingCommand = command;
      if (command === 'approve') button.title = 'Autoriza una ejecución externa posterior; no modifica GRH.';
      button.addEventListener('click', () => requestTransition(command));
      nodes.actions.append(button);
    });
    nodes.actionStatus.textContent = allowed.length
      ? 'El servidor habilitó estas decisiones para la identidad, el estado y la versión actuales.'
      : 'No hay decisiones habilitadas para esta identidad y estado.';
    nodes.actionStatus.dataset.state = allowed.length ? 'ok' : 'warning';
  }

  function renderDetail(detail) {
    state.detail = detail;
    state.selectedId = detail.id;
    nodes.detail.hidden = false;
    nodes.detailTitle.textContent = `${REQUEST_KIND_LABELS[detail.requestKind]} · ${payrollDate(detail.target.payrollDate)} · ${STATUS_LABELS[detail.status]}`;
    nodes.detailMeta.replaceChildren();
    [
      ['Estado', STATUS_LABELS[detail.status]],
      ['Versión vigente', `v${detail.version}`],
      ['Motivo', reasonLabel(detail.businessReasonCode)],
      ['Identificador de correlación', detail.businessReasonReference],
      ['Corrida GRH', `${payrollDate(detail.target.payrollDate)} · ${detail.target.payrollType || 'tipo no informado'} · ID ${shortRunId(detail.target.payrollRunId)}`],
      ['Huella de la corrida', shortHash(detail.target.runSha256)],
      ['Preparado', localDate(detail.createdAt)],
      ['Último cambio', localDate(detail.updatedAt)],
      ['Ejecución externa', detail.executionAuthorized ? 'Autorizada; aún no ejecutada por esta pantalla' : 'No autorizada'],
      ['Efecto en GRH', 'Ninguno'],
    ].forEach(([label, value]) => appendMeta(nodes.detailMeta, label, value));
    renderTimeline(detail);
    renderActions(detail);
  }

  async function loadDetail(id, options = {}) {
    if (!UUID.test(String(id || ''))) return;
    clearDetail(id);
    if (options.manageBusy !== false) setBusy(true);
    setStatus('Consultando versión e historial vigentes del expediente…', 'warning');
    try {
      const payload = await api(`${PAYROLL_REPROCESSING_API}?resource=detail&id=${encodeURIComponent(id)}`);
      if (!validatePayrollReprocessingDetail(payload)) throw new Error('La API devolvió un detalle no reconocido o inseguro.');
      renderDetail(payload.data);
      if (options.scroll) nodes.detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (options.manageBusy !== false) setStatus('Expediente actualizado con la versión vigente del servidor.', 'ok');
      return true;
    } catch (error) {
      clearDetail();
      setStatus(error instanceof Error ? error.message : 'No se pudo consultar el expediente.', 'error');
      return false;
    } finally {
      if (options.manageBusy !== false) setBusy(false);
    }
  }

  async function load(options = {}) {
    if (state.busy && options.force !== true) return;
    setBusy(true);
    setStatus('Consultando expedientes y capacidades…', 'warning');
    try {
      const query = `resource=list&status=${encodeURIComponent(state.filter)}&page=${state.page}&limit=${PAGE_LIMIT}`;
      const [bootstrap, list] = await Promise.all([
        api(`${PAYROLL_REPROCESSING_API}?resource=bootstrap`),
        api(`${PAYROLL_REPROCESSING_API}?${query}`),
      ]);
      if (!validatePayrollReprocessingBootstrap(bootstrap)) throw new Error('La API devolvió capacidades no reconocidas o incompatibles.');
      if (!validatePayrollReprocessingList(list)) throw new Error('La API devolvió una lista no reconocida o insegura.');
      state.bootstrap = bootstrap;
      state.list = list.data;
      state.page = list.data.page;
      if (options.selectedId) state.selectedId = options.selectedId;
      renderBootstrap();
      renderList();
      const detailLoaded = state.selectedId
        ? await loadDetail(state.selectedId, { manageBusy: false })
        : true;
      if (!state.selectedId && detailLoaded) clearDetail();
      if (detailLoaded) setStatus(options.announce || `Se consultaron ${list.data.total} expedientes del contexto certificado.`, 'ok');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudieron consultar los expedientes.', 'error');
      nodes.preparePanel.hidden = true;
      nodes.empty.hidden = false;
      clearDetail();
    } finally {
      setBusy(false);
    }
  }

  async function prepare(event) {
    event.preventDefault();
    if (state.busy) return;
    const payload = {
      payrollRunId: nodes.run.value,
      requestKind: nodes.kind.value,
      reasonCode: nodes.businessReason.value,
      reasonReference: nodes.prepareReference.value,
    };
    if (!buildPayrollReprocessingMutation('prepare', payload)) {
      setStatus('Elegí una corrida cerrada, una acción, un motivo y una referencia válidos.', 'error');
      return;
    }
    setBusy(true);
    setStatus('Preparando el expediente con trazabilidad…', 'warning');
    try {
      const result = await mutate('prepare', payload);
      const selectedId = result.data?.id || null;
      nodes.prepareForm.reset();
      setReference(nodes.prepareReference);
      state.selectedId = selectedId;
      state.page = 1;
      await load({ force: true, selectedId, announce: result.replayed === true
        ? 'Se recuperó el expediente ya confirmado, sin duplicarlo.'
        : 'Expediente preparado y persistido como borrador. Revisalo antes de enviarlo.' });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo preparar el expediente.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function requestTransition(command) {
    const detail = state.detail;
    if (state.busy || !detail || !detail.allowedCommands.includes(command)) return;
    const payload = {
      caseId: detail.id,
      expectedVersion: detail.version,
      reasonCode: transitionReason(command),
      reasonReference: nodes.actionReference.value,
    };
    if (!buildPayrollReprocessingMutation(command, payload)) {
      nodes.actionStatus.textContent = 'La decisión no cumple el contrato vigente.';
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    state.pendingTransition = { command, payload: { ...payload } };
    nodes.confirmSummary.textContent = `${COMMAND_LABELS[command]} · ${REQUEST_KIND_LABELS[detail.requestKind]} · corrida ${shortRunId(detail.target.payrollRunId)} (${payrollDate(detail.target.payrollDate)}, ${detail.target.payrollType || 'tipo no informado'}) · expediente v${detail.version} · ${reasonLabel(payload.reasonCode)}.`;
    nodes.confirmAction.className = `button${command === 'approve' || command === 'submit' ? ' primary' : ' danger'}`;
    nodes.confirmAction.textContent = `Confirmar ${COMMAND_LABELS[command].toLowerCase()}`;
    nodes.confirm.hidden = false;
    nodes.confirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nodes.confirmAction.focus();
  }

  async function transition(command, confirmedPayload = null) {
    if (!confirmedPayload) {
      requestTransition(command);
      return;
    }
    const detail = state.detail;
    const pending = state.pendingTransition;
    if (state.busy || !detail || !pending || pending.command !== command
      || pending.payload.caseId !== detail.id || pending.payload.expectedVersion !== detail.version
      || !detail.allowedCommands.includes(command)) {
      clearConfirmation();
      nodes.actionStatus.textContent = 'El expediente o su versión cambiaron. Volvé a revisar la decisión.';
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    const payload = { ...confirmedPayload };
    if (payload.caseId !== pending.payload.caseId || payload.expectedVersion !== pending.payload.expectedVersion
      || payload.reasonCode !== pending.payload.reasonCode || payload.reasonReference !== pending.payload.reasonReference
      || !buildPayrollReprocessingMutation(command, payload)) {
      clearConfirmation();
      nodes.actionStatus.textContent = 'La confirmación ya no coincide con la decisión revisada.';
      nodes.actionStatus.dataset.state = 'error';
      return;
    }
    clearConfirmation();
    setBusy(true);
    nodes.actionStatus.textContent = `${COMMAND_LABELS[command]}…`;
    nodes.actionStatus.dataset.state = 'warning';
    try {
      const result = await mutate(command, payload);
      setReference(nodes.actionReference);
      await load({ force: true, selectedId: detail.id, announce: result.replayed === true
        ? 'Se recuperó la decisión ya confirmada, sin duplicarla.'
        : `${COMMAND_LABELS[command]} registrada con nueva versión y auditoría.` });
    } catch (error) {
      nodes.actionStatus.textContent = error instanceof Error ? error.message : 'No se pudo registrar la decisión.';
      nodes.actionStatus.dataset.state = 'error';
    } finally {
      setBusy(false);
    }
  }

  nodes.prepareForm?.addEventListener('submit', prepare);
  nodes.copyPrepareReference?.addEventListener('click', () => copyReference(nodes.prepareReference));
  nodes.copyActionReference?.addEventListener('click', () => copyReference(nodes.actionReference, nodes.actionStatus));
  nodes.newPrepareReference?.addEventListener('click', () => setReference(nodes.prepareReference));
  nodes.newActionReference?.addEventListener('click', () => {
    clearConfirmation();
    setReference(nodes.actionReference);
  });
  nodes.rejectReason?.addEventListener('change', clearConfirmation);
  nodes.confirmCancel?.addEventListener('click', () => {
    clearConfirmation();
    nodes.actionStatus.textContent = 'Decisión no enviada. Podés revisar los datos o elegir otra acción.';
    nodes.actionStatus.dataset.state = 'warning';
  });
  nodes.confirmAction?.addEventListener('click', () => {
    const pending = state.pendingTransition;
    if (pending) transition(pending.command, { ...pending.payload });
  });
  nodes.refresh?.addEventListener('click', () => load());
  nodes.filter?.addEventListener('change', () => {
    state.filter = nodes.filter.value;
    state.page = 1;
    state.selectedId = null;
    load();
  });
  nodes.previous?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      state.selectedId = null;
      load();
    }
  });
  nodes.next?.addEventListener('click', () => {
    if (state.list && state.page * state.list.limit < state.list.total) {
      state.page += 1;
      state.selectedId = null;
      load();
    }
  });

  try {
    setReference(nodes.prepareReference);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'No se pudo iniciar el circuito.', 'error');
    return null;
  }
  load();
  return { load, loadDetail, prepare, requestTransition, transition, getState: () => ({ ...state }) };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-payroll-reprocessing-workflow]');
  if (root) createPayrollReprocessingWorkflow(root);
}
