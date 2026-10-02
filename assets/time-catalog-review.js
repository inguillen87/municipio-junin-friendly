import {TimeCatalogReviewSession, catalogCivilDate, CATALOG_KIND_LABELS as kinds, CATALOG_STATUS_LABELS as statuses,
  CATALOG_COMMAND_LABELS as commands, CATALOG_REASON_LABELS as reasons} from './time-catalog-review-model.js';
import {TIME_CATALOG_REASONS, timeCatalogExact} from './time-catalog-contract.js';

const model = new TimeCatalogReviewSession(), byId = id => document.getElementById(id);
const nodes = Object.fromEntries(['refresh', 'message', 'workspace', 'countCalendar', 'countShift', 'countRules', 'countAssignments', 'countSubmitted',
  'showSubmitted', 'filters', 'kind', 'status', 'records', 'empty', 'pageCount', 'previous', 'next', 'detail', 'closeDetail', 'detailTitle', 'facts',
  'configuration', 'audit', 'timeline', 'auditLimit', 'detailMessage', 'decision', 'command', 'reasonCode', 'reason', 'approvalField', 'approval',
  'send', 'recovery', 'retry', 'consultAttempt', 'recoveryCopy'].map(id => [id, byId(id)]));
const active = new Set(), weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const dayKinds = {working: 'Laborable', non_working: 'No laborable', holiday: 'Feriado', special: 'Especial'};
const intervalKinds = {work: 'Trabajo', break: 'Pausa', on_call: 'Guardia'};
const valueKinds = {integer: 'Entero', decimal: 'Decimal', boolean: 'Sí / No', time: 'Horario', code: 'Código'};
let offset = 0, busy = false, focusBeforeDetail = null;
const make = (tag, value, className) => { const n = document.createElement(tag); if (value !== undefined) n.textContent = String(value); if (className) n.className = className; return n; };
function notice(text, error = false, detail = false) {
  const node = detail ? nodes.detailMessage : nodes.message; node.textContent = text; node.classList.toggle('error', error); node.hidden = !text;
}
function wipe(text) {
  model.invalidate(); active.forEach(c => c.abort()); active.clear(); busy = false;
  nodes.detail.close(); nodes.decision.reset(); nodes.command.replaceChildren(); nodes.reasonCode.replaceChildren();
  ['records', 'facts', 'configuration', 'timeline'].forEach(id => nodes[id].replaceChildren());
  nodes.workspace.hidden = true; nodes.decision.hidden = true; nodes.recovery.hidden = true;
  nodes.detailTitle.textContent = ''; notice('', false, true); nodes.refresh.disabled = false; nodes.refresh.textContent = 'Verificar acceso y actualizar';
  notice(text, true);
}
class StaleRead extends Error {}
async function request(query = null, attempt = null) {
  if (document.hidden) throw new StaleRead();
  const generation = model.generation, controller = new AbortController(); active.add(controller);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/internal-time-catalog' + (query ? '?' + new URLSearchParams(query) : ''), {
      method: attempt ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: {Accept: 'application/json', 'Cache-Control': 'no-store', ...(attempt ? {'Content-Type': 'application/json', 'Idempotency-Key': attempt.key} : {})},
      ...(attempt ? {body: attempt.body} : {}),
    });
    if (generation !== model.generation || document.hidden) throw new StaleRead();
    let payload; try { payload = await response.json(); } catch { throw new Error('La respuesta no pudo confirmarse.'); }
    if (generation !== model.generation || document.hidden) throw new StaleRead();
    if ([401, 403].includes(response.status) || payload?.code === 'TIME_CATALOG_SCOPE_CHANGED') {
      wipe('El acceso cambió o fue retirado. Se retiraron los datos. Volvé a verificar la sesión.'); throw new StaleRead();
    }
    if (!response.ok) {
      // Display only this endpoint's safe contract, never a proxy/HTML error.
      const text = typeof payload?.error === 'string' && /^TIME_CATALOG_[A-Z_]+$/.test(payload?.code || '')
        ? payload.error : 'No se confirmó la operación. Conservá el mismo envío antes de reintentar.';
      throw new Error(text);
    }
    if (!timeCatalogExact(payload, ['ok', 'data']) || payload.ok !== true) throw new Error('La respuesta no pudo verificarse.');
    return payload.data;
  } catch (e) {
    if (e instanceof StaleRead || generation !== model.generation || document.hidden) throw new StaleRead();
    if (['TypeError', 'AbortError'].includes(e.name)) throw new Error('No se confirmó la respuesta. Si enviaste una decisión, conservá el mismo intento.');
    throw e;
  } finally { clearTimeout(timer); active.delete(controller); }
}
function controls() {
  const pending = Boolean(model.pending), locked = busy || pending;
  nodes.refresh.disabled = busy; nodes.refresh.textContent = pending ? 'Retomar envío sin confirmación' : 'Verificar acceso y actualizar';
  nodes.filters.querySelectorAll('button,select').forEach(n => n.disabled = locked);
  nodes.showSubmitted.disabled = locked;
  nodes.previous.disabled = locked || offset === 0; nodes.next.disabled = locked || !model.page?.hasMore;
  nodes.records.querySelectorAll('button').forEach(n => n.disabled = locked);
  nodes.send.disabled = busy; nodes.retry.disabled = busy; nodes.consultAttempt.disabled = busy;
  nodes.decision.querySelectorAll('select,textarea,input').forEach(n => n.disabled = locked);
}
function renderSummary() {
  const s = model.summary;
  for (const [id, key] of [['countCalendar', 'calendar'], ['countShift', 'shift'], ['countRules', 'ruleProfile'], ['countAssignments', 'assignment'], ['countSubmitted', 'submitted']]) nodes[id].textContent = String(s[key]);
}
function range(r) { return catalogCivilDate(r.effectiveFrom) + ' → ' + catalogCivilDate(r.effectiveTo); }
function renderList() {
  nodes.records.replaceChildren(); nodes.empty.hidden = model.records.length !== 0;
  model.records.forEach(r => {
    const item = make('article', undefined, 'record'), title = make('div');
    title.append(make('strong', kinds[r.kind]), make('small', 'Revisión ' + r.revision + ' · Versión ' + r.version));
    const dates = make('div'); dates.append(make('small', 'Vigencia'), make('span', range(r)));
    const button = make('button', 'Ver configuración'); button.type = 'button';
    button.setAttribute('aria-label', `Ver ${kinds[r.kind].toLowerCase()}, revisión ${r.revision}, desde ${catalogCivilDate(r.effectiveFrom)}`);
    button.addEventListener('click', () => openDetail(r.id));
    item.append(title, dates, make('span', statuses[r.status], 'badge ' + r.status), button); nodes.records.append(item);
  });
  const p = model.page; nodes.pageCount.textContent = p.total === 0 ? '0 configuraciones' : `${p.offset + 1}–${p.offset + model.records.length} de ${p.total} configuraciones`;
  controls();
}
async function readList() {
  const input = {resource: 'list', kind: nodes.kind.value, status: nodes.status.value, limit: '25', offset: String(offset)};
  const data = await request(input); model.list(data, {kind: input.kind, status: input.status, limit: 25, offset}); renderList();
}
async function refresh() {
  if (model.pending) { nodes.detail.showModal(); controls(); return; }
  if (busy || document.hidden) return;
  const generation = model.generation;
  busy = true; controls(); notice('Verificando acceso y catálogo…');
  try {
    model.bootstrap(await request({resource: 'bootstrap'})); renderSummary(); await readList();
    nodes.workspace.hidden = false; notice('');
  } catch (e) { if (!(e instanceof StaleRead)) wipe(e.message || 'No se pudo consultar el catálogo.'); }
  finally { if (generation === model.generation) { busy = false; controls(); } }
}
function fact(label, value) { const n = make('div'); n.append(make('span', label), make('strong', value)); nodes.facts.append(n); }
function configurationRow(title, text) { const n = make('div', undefined, 'config-row'); n.append(make('strong', title), make('span', text)); nodes.configuration.append(n); }
function renderConfiguration(r) {
  const c = r.configuration; nodes.configuration.replaceChildren(); nodes.configuration.append(make('h3', 'Configuración completa'));
  if (r.kind === 'calendar') {
    nodes.configuration.append(make('p', `${c.days.length} días declarados. Los días ausentes no se consideran laborables ni feriados.`, 'hint'));
    c.days.forEach(d => configurationRow(`${catalogCivilDate(d.date)} · ${dayKinds[d.kind]}`, `Código: ${d.code} · ${d.evidencePresent ? 'Huella de evidencia registrada' : 'Sin huella de evidencia'}`));
  } else if (r.kind === 'shift') {
    configurationRow('Tolerancias declaradas', `Entrada: ${c.entryToleranceSeconds} segundos · Salida: ${c.exitToleranceSeconds} segundos`);
    c.intervals.forEach(i => configurationRow(`${weekdays[i.day - 1]} · Tramo ${i.sequence} · ${intervalKinds[i.kind]}`, `${i.start} → ${i.end}${i.crossesMidnight ? ' del día siguiente' : ''}`));
  } else if (r.kind === 'rule_profile') {
    nodes.configuration.append(make('p', 'Los valores y unidades son declaraciones pendientes de evaluación. No se transforman en horas ni importes.', 'hint'));
    c.parameters.forEach(p => {
      const value = p[({integer: 'integerValue', decimal: 'decimalValue', boolean: 'booleanValue', time: 'timeValue', code: 'codeValue'})[p.valueKind]];
      configurationRow(p.key, `${p.valueKind === 'boolean' ? (value ? 'Sí' : 'No') : value} · Unidad declarada: ${p.unitCode} · ${valueKinds[p.valueKind]}`);
    });
  } else {
    configurationRow('Revisiones vinculadas', `Turno: ${c.shiftRevision} · Calendario: ${c.calendarRevision} · Reglas: ${c.ruleProfileRevision}`);
    nodes.configuration.append(make('p', 'El catálogo no devuelve la identidad del contrato destinatario. Su revisión y aprobación desde esta pantalla quedan pendientes.', 'boundary'));
  }
}
function updateDecision() {
  const command = nodes.command.value; nodes.reasonCode.replaceChildren();
  (TIME_CATALOG_REASONS[command] || []).forEach(r => { const n = make('option', reasons[r]); n.value = r; nodes.reasonCode.append(n); });
  nodes.approval.checked = false; nodes.approval.required = command === 'approve'; nodes.approvalField.hidden = command !== 'approve';
  nodes.send.textContent = commands[command] || 'Registrar decisión';
}
function renderDetail() {
  const r = model.selected; nodes.detailTitle.textContent = `${kinds[r.kind]} · Revisión ${r.revision}`;
  nodes.facts.replaceChildren(); fact('Estado', statuses[r.status]); fact('Versión registrada', String(r.version)); fact('Vigencia', range(r));
  fact('Horario municipal', 'Mendoza (UTC−3)'); fact('Fuente de referencia', r.sourceLinked ? 'Referencia vinculada' : 'Sin referencia vinculada');
  renderConfiguration(r); nodes.audit.hidden = !model.auditAvailable; nodes.auditLimit.hidden = !model.timelineMayBeIncomplete;
  nodes.timeline.replaceChildren(); model.timeline.forEach(e => {
    const li = make('li', commands[e.command] || ({create_draft: 'Borrador creado', update_draft: 'Borrador corregido'})[e.command]);
    li.append(make('span', `${new Intl.DateTimeFormat('es-AR', {timeZone: 'America/Argentina/Mendoza', dateStyle: 'short', timeStyle: 'short'}).format(new Date(e.occurredAt))} · Versión ${e.resultingVersion}`)); nodes.timeline.append(li);
  });
  if (model.auditAvailable && !model.timeline.length) nodes.timeline.append(make('li', 'Sin eventos disponibles.'));
  nodes.decision.reset(); nodes.command.replaceChildren(); const allowed = model.commands();
  allowed.forEach(c => { const option = make('option', commands[c]); option.value = c; nodes.command.append(option); });
  nodes.decision.hidden = !allowed.length; nodes.recovery.hidden = !model.pending;
  nodes.recoveryCopy.textContent = 'El envío puede haberse registrado. El contenido quedó bloqueado para evitar otra decisión.';
  updateDecision(); notice('', false, true); controls();
}
async function openDetail(id) {
  if (busy || model.pending || document.hidden) return;
  const generation = model.generation;
  focusBeforeDetail = document.activeElement; busy = true; controls();
  try { model.detail(await request({resource: 'detail', id}), id); renderDetail(); nodes.detail.showModal(); nodes.closeDetail.focus(); }
  catch (e) { if (!(e instanceof StaleRead)) wipe(e.message); }
  finally { if (generation === model.generation) { busy = false; controls(); } }
}
async function sendPending() {
  if (busy || document.hidden) return;
  const generation = model.generation;
  busy = true; controls(); notice('Verificando el acceso antes del envío…', false, true);
  try {
    const attempt = model.attempt(); model.bootstrap(await request({resource: 'bootstrap'})); model.attempt();
    const outcome = model.confirm(await request(null, attempt)); renderDetail();
    notice('');
    notice(outcome.historical ? 'Se recuperó el acuse original. Consultá la versión actual antes de otra decisión.' : 'Decisión registrada. No genera cálculos ni liquidaciones.', false, true);
    // A historical replay can be older than current state. Do not enable a new
    // decision based on that receipt; obtain a fresh detail first.
    nodes.decision.hidden = true; renderSummary(); await readList();
  } catch (e) {
    if (!(e instanceof StaleRead)) {
      if (!model.scope) wipe(e.message);
      else if (model.pending) {
        nodes.decision.hidden = true; nodes.recovery.hidden = false; notice(e.message || 'No se confirmó el envío.', true, true);
        notice('Hay un envío sin confirmación. Retomalo para reintentar o consultar su versión.', true);
      } else notice('La decisión se confirmó; la lista no pudo actualizarse. Volvé a consultar.', true, true);
    }
  } finally { if (generation === model.generation) { busy = false; controls(); } }
}
nodes.refresh.addEventListener('click', refresh);
nodes.filters.addEventListener('submit', async e => {
  e.preventDefault(); if (busy || model.pending) return; offset = 0; await refresh();
});
nodes.showSubmitted.addEventListener('click', () => { if (busy || model.pending) return; nodes.status.value = 'submitted'; offset = 0; refresh(); });
nodes.previous.addEventListener('click', () => { if (busy || model.pending || !offset) return; offset -= 25; refresh(); });
nodes.next.addEventListener('click', () => { if (busy || model.pending || !model.page?.hasMore) return; offset += 25; refresh(); });
nodes.closeDetail.addEventListener('click', () => nodes.detail.close());
nodes.detail.addEventListener('close', () => { if (focusBeforeDetail?.isConnected) focusBeforeDetail.focus(); });
nodes.command.addEventListener('change', updateDecision);
nodes.decision.addEventListener('submit', e => {
  e.preventDefault(); if (busy || model.pending || document.hidden) return;
  try {
    if (/[\u0000-\u001f\u007f]/.test(nodes.reason.value)) throw new Error('Escribí el fundamento en una sola línea, sin saltos ni tabulaciones.');
    model.prepare(nodes.command.value, nodes.reasonCode.value, nodes.reason.value, nodes.command.value === 'approve' && nodes.approval.checked, crypto.randomUUID());
    sendPending();
  } catch (error) { notice(error.message, true, true); }
});
nodes.retry.addEventListener('click', sendPending);
nodes.consultAttempt.addEventListener('click', async () => {
  if (busy || !model.pending || document.hidden) return;
  const generation = model.generation;
  busy = true; controls();
  try {
    const attempt = model.attempt(), id = JSON.parse(attempt.body).payload.id;
    model.bootstrap(await request({resource: 'bootstrap'})); model.detail(await request({resource: 'detail', id}), id);
    const current = model.selected.version, expected = JSON.parse(attempt.body).payload.expectedVersion;
    if (current <= expected) { notice('La versión consultada todavía no confirma el envío. Conservá el mismo intento.', true, true); return; }
    // A newer state is not proof of which actor/attempt wrote it. Consultations
    // never discard or change the original pending request.
    nodes.recoveryCopy.textContent = `La versión registrada es ${current}. Esto no confirma por sí solo tu envío. Reintentá la misma clave para recuperar su acuse.`;
    renderConfiguration(model.selected); notice('Versión actual consultada. El envío original se conserva.', false, true);
  } catch (e) { if (!(e instanceof StaleRead)) { if (!model.scope) wipe(e.message); else notice(e.message, true, true); } }
  finally { if (generation === model.generation) { busy = false; controls(); } }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) wipe('Se retiraron los datos al ocultar la pantalla. Verificá el acceso para volver a consultar. Si había un envío en curso, consultá su estado.'); });
window.addEventListener('pagehide', () => wipe('La pantalla se cerró. Volvé a verificar el acceso.'));
// Read-only access checks also withdraw an idle open detail on revocation.
// An unavailable check closes the view; it never resends a command.
setInterval(async () => {
  if (busy || document.hidden || !model.scope) return;
  try { model.bootstrap(await request({resource: 'bootstrap'})); }
  catch (e) { if (!(e instanceof StaleRead)) wipe('No se pudo renovar la verificación del acceso. Se retiraron los datos; consultá nuevamente.'); }
}, 30000);
refresh();
