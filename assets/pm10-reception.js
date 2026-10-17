// Receipts are evidence of delivery, never a physical clock heartbeat.
export const PM10_RECENT_RECEIPT_MS = 15 * 60 * 1000;
const AUTO_REFRESH_MS = 60 * 1000;
const MAX_QUERY_AGE_MS = 90 * 1000;
const instant = value => typeof value === 'string' && value.length <= 64
  && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
const optionalInstant = value => value === null || instant(value);

export function validPm10Status(x) {
  return x?.ok === true && x.version === 'pm10-status.v1'
    && x.physicalClockVerified === false && x.payrollModified === false
    && instant(x.checkedAt) && optionalInstant(x.summary?.lastReceivedAt)
    && optionalInstant(x.summary?.lastCapturedAt)
    && ['active', 'suspended', 'retired', 'not_configured'].includes(x.connectorState)
    && Number.isSafeInteger(x.baselineRecords) && x.baselineRecords >= 0
    && typeof x.nominalReadAllowed === 'boolean' && Array.isArray(x.records) && x.records.length <= 50
    && ['receipts', 'newMarks', 'knownRecords', 'observations'].every(k => Number.isSafeInteger(x.summary?.[k]) && x.summary[k] >= 0)
    && x.records.every(r => r && typeof r.personLabel === 'string' && r.personLabel.length <= 500
      && optionalInstant(r.occurredAt) && instant(r.receivedAt)
      && ['observed', 'mapped', 'review'].includes(r.state)
      && (r.legajo === null || typeof r.legajo === 'string' && /^\d{1,12}$/.test(r.legajo))
      && (x.nominalReadAllowed || r.legajo === null && r.personLabel === 'Identidad reservada'));
}

export function pm10AgeLabel(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'Fecha por revisar';
  if (ageMs < 60000) return 'Hace menos de 1 min';
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return `Hace ${Math.floor(hours / 24)} d${hours % 24 ? ` ${hours % 24} h` : ''}`;
}

export function pm10ReceptionHealth(x, elapsedMs = 0, paused = false) {
  if (!validPm10Status(x) || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('PM10_STATUS_INVALID');
  }
  const checked = Date.parse(x.checkedAt);
  const age = value => value === null ? null : checked - Date.parse(value) + elapsedMs;
  const receivedAgeMs = age(x.summary.lastReceivedAt);
  const capturedAgeMs = age(x.summary.lastCapturedAt);
  const dateAnomaly = [x.summary.lastReceivedAt, x.summary.lastCapturedAt].some(v => v !== null && Date.parse(v) > checked);
  const inconsistent = x.summary.receipts === 0 && (x.summary.lastReceivedAt !== null || x.summary.lastCapturedAt !== null)
    || x.summary.receipts > 0 && x.summary.lastReceivedAt === null;
  const queryFresh = elapsedMs <= MAX_QUERY_AGE_MS && !paused;
  let state = 'no_receipts', label = 'Sin lotes confirmados';
  if (dateAnomaly || inconsistent) { state = 'review'; label = 'Fechas o acuses por revisar'; }
  else if (x.summary.receipts > 0) {
    state = receivedAgeMs <= PM10_RECENT_RECEIPT_MS ? 'recent' : 'older';
    label = state === 'recent' ? 'Acuse reciente' : 'Sin acuse reciente';
  }
  const confirmed = x.connectorState === 'active' && state === 'recent' && queryFresh;
  return {
    state, label, receivedAgeMs, capturedAgeMs, queryAgeMs: elapsedMs,
    receivedLabel: x.summary.lastReceivedAt === null ? 'Sin registro' : pm10AgeLabel(dateAnomaly && Date.parse(x.summary.lastReceivedAt) > checked ? -1 : receivedAgeMs),
    capturedLabel: x.summary.lastCapturedAt === null ? 'Sin registro' : pm10AgeLabel(dateAnomaly && Date.parse(x.summary.lastCapturedAt) > checked ? -1 : capturedAgeMs),
    queryLabel: paused ? 'Actualización pausada' : queryFresh ? 'Consulta vigente' : 'Consulta pendiente de renovar',
    confirmed, queryFresh,
    // These two summary maxima may belong to different batches. No transit latency is derived.
    physicalClockVerified: false, autonomyVerified: false, queueDepth: null, payrollModified: false,
  };
}

export function pm10TechnicalDiagnostic(x, elapsedMs = 0, paused = false) {
  const health = pm10ReceptionHealth(x, elapsedMs, paused);
  return {
    schema: 'pm10-reception-diagnostic.v1', sourceContract: x.version,
    sourceCheckedAt: x.checkedAt, connectorState: x.connectorState,
    baselineRecords: x.baselineRecords,
    summary: Object.fromEntries(['receipts', 'newMarks', 'knownRecords', 'observations', 'lastReceivedAt', 'lastCapturedAt'].map(k => [k, x.summary[k]])),
    reception: { state: health.state, receivedAgeMs: health.receivedAgeMs, capturedAgeMs: health.capturedAgeMs,
      queryAgeMs: health.queryAgeMs, queryFresh: health.queryFresh, refreshPaused: paused },
    recentReceiptWindowMs: PM10_RECENT_RECEIPT_MS,
    physicalClockVerified: false, autonomyVerified: false, queueDepth: null, payrollModified: false,
    notes: [
      'Las edades usan el corte del servidor y tiempo transcurrido en esta pestaña; no el reloj de Windows.',
      'Recepción y captura son máximos independientes de lotes. Su diferencia no mide latencia de entrega.',
      'Sin un acuse reciente no puede afirmarse que el reloj esté desconectado. Puede no haber datos nuevos.',
      'No contiene registros nominales, direcciones de red ni credenciales. No acredita autonomía ni cobertura completa.',
    ],
  };
}

const root = typeof document === 'undefined' ? null : document.getElementById('pm10Reception');
if (root) {
  const $ = id => root.querySelector(`[data-pm10="${id}"]`);
  let active = false, paused = false, generation = 0, controller = null, timer = null;
  let snapshot = null, observedAt = 0, nextRefreshAt = 0, returning = false;
  const n = v => new Intl.NumberFormat('es-AR').format(v);
  const date = v => instant(v) ? new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Mendoza', dateStyle: 'short', timeStyle: 'medium', hour12: false,
  }).format(new Date(v)) : 'Sin registro';
  const make = (tag, cls, text) => {
    const element = document.createElement(tag); if (cls) element.className = cls;
    if (text) element.textContent = text; return element;
  };
  const monitor = make('section', 'pm10-monitor');
  monitor.setAttribute('aria-label', 'Actualidad de la recepción');
  const monitorCards = make('div', 'pm10-monitor-cards');
  const cards = {};
  for (const [key, title, hint] of [
    ['receipt', 'Último acuse de la base', 'Una entrega confirmada; no un latido del reloj.'],
    ['capture', 'Captura declarada en lotes', 'No acredita la última lectura física del equipo.'],
    ['query', 'Consulta de esta pantalla', 'El refresco consulta la base; no descarga el reloj.'],
  ]) {
    const card = make('div', 'pm10-monitor-card');
    const value = make('strong', null, 'Sin consulta'); value.dataset.pm10Monitor = key;
    cards[key] = value;
    card.append(make('span', null, title), value, make('small', null, hint)); monitorCards.append(card);
  }
  const controls = make('div', 'pm10-monitor-controls');
  const live = make('span', 'pm10-monitor-status', 'Esperando consulta autorizada');
  live.setAttribute('role', 'status'); live.dataset.pm10Monitor = 'status';
  const countdown = make('span', 'pm10-monitor-countdown'); countdown.dataset.pm10Monitor = 'countdown';
  // The countdown is intentionally not a live region: do not speak every second.
  const pause = make('button', null, 'Pausar actualización'); pause.type = 'button';
  pause.dataset.pm10Monitor = 'pause'; pause.setAttribute('aria-pressed', 'false');
  const diagnostic = make('button', null, 'Descargar diagnóstico'); diagnostic.type = 'button';
  diagnostic.dataset.pm10Monitor = 'export'; diagnostic.disabled = true;
  controls.append(live, countdown, pause, diagnostic);
  monitor.append(monitorCards, controls, make('p', 'pm10-monitor-note',
    'Sin acuse reciente no significa reloj desconectado: puede no haber fichadas nuevas. La autonomía y la cola pendiente requieren verificación del colector.'));
  root.querySelector('.pm10-times').after(monitor);

  const announce = text => { if (live.textContent !== text) live.textContent = text; };
  function updateMonitor() {
    pause.disabled = !active; pause.textContent = paused ? 'Reanudar actualización' : 'Pausar actualización';
    pause.setAttribute('aria-pressed', String(paused));
    diagnostic.disabled = !active || !snapshot || !!controller;
    if (!snapshot) {
      for (const value of Object.values(cards)) value.textContent = 'Sin consulta';
      announce('Sin confirmación actual'); monitor.dataset.tone = 'pending'; countdown.textContent = '';
      return;
    }
    const health = pm10ReceptionHealth(snapshot, Math.max(0, performance.now() - observedAt), paused);
    cards.receipt.textContent = health.receivedLabel; cards.capture.textContent = health.capturedLabel;
    cards.query.textContent = health.queryLabel; announce(health.label);
    monitor.dataset.tone = health.confirmed ? 'confirmed' : 'pending';
    $('state').dataset.tone = health.confirmed ? 'confirmed' : 'pending';
    countdown.textContent = paused ? 'Pausada por vos' : controller ? 'Consultando…'
      : `Próxima consulta en ${Math.max(0, Math.ceil((nextRefreshAt - performance.now()) / 1000))} s`;
  }
  function clear() {
    snapshot = null;
    for (const k of ['new', 'known', 'observed', 'parts', 'received', 'captured']) $(k).textContent = '—';
    $('rows').replaceChildren(); $('state').dataset.tone = 'pending';
    $('checked').textContent = 'Sin consulta actual verificada.';
    $('explanation').textContent = 'Actualizá la recepción para consultar lo confirmado por la base.';
    $('baseline').textContent = 'La captura histórica se consulta en el tablero de marcaciones.';
    updateMonitor();
  }
  function cell(tr, value) { const td = document.createElement('td'); td.textContent = value ?? '—'; tr.append(td); }
  function render(x) {
    snapshot = x; observedAt = performance.now();
    const labels = { active: 'Habilitado para recibir', suspended: 'Conector suspendido', retired: 'Conector retirado', not_configured: 'Sin conector configurado' };
    $('state').textContent = labels[x.connectorState];
    $('explanation').textContent = x.connectorState === 'suspended'
      ? 'El conector está suspendido. Se conservan los lotes confirmados; esta pantalla no verifica la instalación ni activa el equipo.'
      : x.summary.receipts === 0
        ? 'Todavía no se confirmó ningún lote del colector. Habilitar el conector no demuestra que el equipo esté instalado o conectado.'
        : 'Hay lotes confirmados por la base. La fecha de recepción no acredita una conexión permanente ni la cobertura completa del período.';
    for (const [key, value] of Object.entries({ new: x.summary.newMarks, known: x.summary.knownRecords, observed: x.summary.observations, parts: x.summary.receipts })) $(key).textContent = n(value);
    $('received').textContent = date(x.summary.lastReceivedAt); $('captured').textContent = date(x.summary.lastCapturedAt);
    $('baseline').textContent = n(x.baselineRecords) + ' registros de captura histórica conservados. No se vuelven a contar como fichadas nuevas al reenviarlos.';
    $('rows').replaceChildren();
    for (const r of x.records) {
      const tr = document.createElement('tr'); cell(tr, date(r.occurredAt)); cell(tr, r.personLabel); cell(tr, r.legajo);
      cell(tr, ({ mapped: 'Vinculada · revisión laboral pendiente', review: 'Vínculo laboral a revisar', observed: 'Registro observado' })[r.state]);
      cell(tr, date(r.receivedAt)); $('rows').append(tr);
    }
    if (!x.records.length) {
      const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5;
      td.textContent = 'Todavía no hay registros nuevos de recepción continua. La captura histórica sigue disponible debajo.';
      tr.append(td); $('rows').append(tr);
    }
    $('checked').textContent = 'Consulta a la base: ' + date(x.checkedAt) + '. Actualización cada 60 segundos con la página visible.';
    updateMonitor();
  }
  function cancelPending() {
    generation++; controller?.abort(); controller = null;
    root.setAttribute('aria-busy', 'false'); $('refresh').disabled = !active;
  }
  async function refresh() {
    if (!active || document.hidden || controller) return;
    const g = ++generation, current = new AbortController(); controller = current;
    root.setAttribute('aria-busy', 'true'); $('refresh').disabled = true; $('error').hidden = true; updateMonitor();
    try {
      const response = await fetch('/api/internal-attendance?resource=pm10-reception', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]),
      });
      if (g !== generation || !active) return;
      if (response.status === 401 || response.status === 403) {
        active = false; returning = false; clearInterval(timer);
        throw new Error('Acceso no disponible. Ingresá nuevamente con un perfil autorizado.');
      }
      const data = await response.json();
      if (g !== generation || !active) return;
      if (!response.ok || !validPm10Status(data)) throw new Error('PM10_STATUS_INVALID');
      render(data);
    } catch (e) {
      if (g !== generation || current.signal.aborted) return;
      clear(); $('state').textContent = 'Sin confirmación actual';
      $('error').textContent = e.message === 'Acceso no disponible. Ingresá nuevamente con un perfil autorizado.'
        ? e.message : 'No se pudo actualizar la recepción. Reintentá para consultar el estado actual.';
      $('error').hidden = false;
    } finally {
      if (g === generation) {
        controller = null; nextRefreshAt = performance.now() + AUTO_REFRESH_MS;
        root.setAttribute('aria-busy', 'false'); $('refresh').disabled = !active; updateMonitor();
      }
    }
  }
  function start() {
    if (active) return;
    active = true; root.hidden = false; nextRefreshAt = performance.now(); if (!paused) refresh();
    clearInterval(timer); timer = setInterval(() => {
      if (!active || document.hidden) return;
      updateMonitor();
      if (!paused && performance.now() >= nextRefreshAt) refresh();
    }, 1000);
  }
  function stop() {
    active = false; cancelPending(); clearInterval(timer); clear(); root.hidden = true;
  }
  pause.addEventListener('click', () => {
    if (!active) return;
    paused = !paused;
    if (paused) cancelPending(); else { clear(); refresh(); }
    updateMonitor();
  });
  diagnostic.addEventListener('click', () => {
    if (!active || !snapshot || controller) return;
    const report = pm10TechnicalDiagnostic(snapshot, Math.max(0, performance.now() - observedAt), paused);
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = 'PM10-diagnostico-' + snapshot.checkedAt.slice(0, 10) + '.json';
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('refresh').addEventListener('click', refresh);
  document.addEventListener('mc:attendance-ready', start);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelPending(); clear(); }
    else if (active && !paused) refresh();
  });
  document.getElementById('logoutButton')?.addEventListener('click', () => { returning = false; stop(); });
  window.addEventListener('pagehide', event => { returning = active && event.persisted === true; stop(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && returning) { returning = false; start(); }
  });
  if (document.getElementById('appShell')?.hidden === false) start();
}
