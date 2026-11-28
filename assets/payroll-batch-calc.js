// Calcular un convenio completo en tandas, una corrida tras otra, con avance a la vista.
// No guarda nada en el navegador: el plan vive en memoria y cada corrida queda registrada en el servidor con su propia
// referencia de intento, igual que una corrida hecha desde «Calcular».
import { OWN_RUN_COMMAND_VERSION, ownRunCommand } from './own-payroll-run-model.js';
import { OWN_RUN_FULL_JSON } from './own-payroll-response.js';
import { batchCalcAgreements, batchCalcLegajos, batchCalcMoney, batchCalcPeople, batchCalcPlan, batchCalcSearch, batchCalcSum, batchCalcTotals, batchCalcType, batchCalcUndoRuns, batchCalcUndoScan, BATCH_CALC_TYPES } from './payroll-batch-calc-model.js';
import { ownLiquidationCommand, ownLiquidationStates } from './own-payroll-liquidation-model.js';
import { fetchOwnLiquidationDetail, OWN_LIQ_DETAIL_ENDPOINT } from './own-payroll-liquidation-read.js';
import { fetchOwnClose, OWN_CLOSE_ENDPOINT } from './own-payroll-close-read.js';
import { ownCloseCommand } from './own-payroll-close-model.js';

const RUN = '/api/internal-own-payroll-run', ROSTER = '/api/internal-data?resource=nativeroster&schema=2&status=all';
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
async function getJson(url) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  let value = null; try { value = await response.json(); } catch { /* respuesta sin cuerpo legible */ }
  if (!response.ok || value?.ok !== true) throw Object.assign(Error(response.status === 401 ? 'La sesión venció. Volvé a ingresar.' : response.status === 403 ? 'Tu cuenta no permite calcular.' : value?.error || 'No se pudo consultar. Probá de nuevo.'), { status: response.status });
  return value.data ?? value;
}
const rosterRows = data => (Array.isArray(data?.rows) ? data.rows : Object.values(data ?? {}).find(Array.isArray) ?? []);
// Una corrida: devuelve los totales de sus personas. Si la respuesta se pierde, consulta el mismo intento antes de
// permitir otro envío, para no calcular dos veces.
async function calculate(batch, plan, boot, key) {
  const body = ownRunCommand({ version: OWN_RUN_COMMAND_VERSION, liquidationDate: plan.liquidationDate, period: plan.period, liquidationType: plan.liquidationType, selection: { kind: 'contracts', values: batch.contractIds }, scopeVersion: boot.scopeVersion, programVersion: boot.programVersion, populationDomain: 'native_registered' });
  const read = async response => {
    let value = null; try { value = await response.json(); } catch { /* cuerpo incompleto */ }
    if (response.ok && value?.ok === true) {
      const result = (value.data?.saved ?? value.data)?.result;
      if (!result || !Array.isArray(result.employeeTotals)) throw Object.assign(Error('La corrida quedó registrada pero su resultado todavía no está disponible. Consultala en «Calcular».'), { uncertain: true });
      const saved = value.data?.saved ?? null, runId = value.data?.id ?? saved?.id ?? null, resultSha256 = saved?.resultSha256 ?? null;
      return { ...batchCalcTotals(result.employeeTotals), runId, resultSha256, selection: body.selection };
    }
    throw Object.assign(Error(response.status === 401 ? 'La sesión venció. Volvé a ingresar.' : response.status === 403 ? 'Tu cuenta no permite calcular.' : value?.error || 'No se confirmó la corrida.'), { status: response.status });
  };
  let response;
  try { response = await fetch(RUN, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: OWN_RUN_FULL_JSON, 'Idempotency-Key': key }, body: JSON.stringify({ operation: 'calculate', payload: body }) }); }
  catch { response = null; }
  if (response) return read(response);
  const recovered = await fetch(RUN + '?' + new URLSearchParams({ resource: 'attempt', key }), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: OWN_RUN_FULL_JSON } }).catch(() => null);
  if (recovered?.ok) return read(recovered);
  throw Object.assign(Error('Se cortó la conexión y no se pudo confirmar la corrida. Repetí esta tanda: usa la misma referencia y no se calcula dos veces.'), { uncertain: true });
}

// Confirma una corrida completa: lee su estado vigente y registra la decisión sobre todo su alcance, igual que la
// pantalla «Calcular». Una corrida ya confirmada se da por hecha.
async function confirmRun(item, reason) {
  const read = await fetchOwnLiquidationDetail(item.totals.runId);
  if (!read.ok || read.payload?.ok !== true) throw Object.assign(Error(read.status === 401 ? 'La sesión venció. Volvé a ingresar.' : read.status === 403 ? 'Tu cuenta no permite confirmar liquidaciones.' : read.payload?.error || 'No se pudo leer la corrida para confirmarla.'), { status: read.status });
  const detail = read.payload.data, employees = Array.isArray(detail?.employees) ? detail.employees : [];
  if (employees.length && employees.every(e => e.state === 'confirmed')) return 'already';
  if (!employees.length || employees.some(e => !Array.isArray(e.allowedCommands) || !e.allowedCommands.includes('confirm'))) throw Error(employees.every(e => e.state === 'calculated' && e.blockedBy == null) ? 'La calculaste vos y la tiene que confirmar otra persona. Esa persona entra acá, elige el mismo mes y convenio y usa «Confirmar o anular lo ya calculado».' : 'Esta tanda tiene legajos que no admiten confirmación (otra liquidación activa o un estado distinto).');
  const payload = ownLiquidationCommand({ runId: item.totals.runId, resultSha256: item.totals.resultSha256, scopeVersion: detail.scopeVersion, stateVersion: detail.stateVersion, command: 'confirm', selection: item.totals.selection, reason, reviewConfirmed: true });
  const response = await fetch(OWN_LIQ_DETAIL_ENDPOINT, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': item.confirmKey }, body: JSON.stringify({ operation: 'command', payload }) });
  let value = null; try { value = await response.json(); } catch { /* cuerpo incompleto */ }
  if (!response.ok || value?.ok !== true) throw Object.assign(Error(response.status === 401 ? 'La sesión venció. Volvé a ingresar.' : response.status === 403 ? 'Tu cuenta no permite confirmar liquidaciones.' : value?.error || 'No se confirmó la tanda.'), { status: response.status });
  return 'confirmed';
}

// Lee el detalle vigente de una corrida (para decidir sobre ella).
async function readRun(runId) {
  const read = await fetchOwnLiquidationDetail(runId);
  if (!read.ok || read.payload?.ok !== true) throw Object.assign(Error(read.status === 401 ? 'La sesión venció. Volvé a ingresar.' : read.status === 403 ? 'Tu cuenta no permite consultar liquidaciones.' : read.payload?.error || 'No se pudo leer una corrida del mes.'), { status: read.status });
  return read.payload.data;
}
// Para buscar qué está calculado o confirmado alcanza con los estados por persona (265): pocos KB por corrida en vez de
// varios MB. Si el servidor todavía no tiene esa lectura, se usa el detalle completo, como antes.
let statesReady = true;
async function readRunStates(runId) {
  if (statesReady) {
    try {
      const response = await fetch(OWN_LIQ_DETAIL_ENDPOINT + '?resource=states&id=' + encodeURIComponent(runId), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 401) throw Object.assign(Error('La sesión venció. Volvé a ingresar.'), { status: 401 });
      if (response.ok) { const value = await response.json(); if (value?.ok === true) return ownLiquidationStates(value.data); }
      else if (response.status === 403) throw Object.assign(Error('Tu cuenta no permite consultar liquidaciones.'), { status: 403 });
      statesReady = false;
    } catch (e) { if (e.status === 401 || e.status === 403) throw e; statesReady = false; }
  }
  return readRun(runId);
}
// Lee varias corridas a la vez sin cambiar el orden en que se aplican: la más nueva decide por cada persona.
async function readRunsInOrder(runs, onEach, width = 4) {
  for (let start = 0; start < runs.length; start += width) {
    const slice = runs.slice(start, start + width), read = await Promise.all(slice.map(run => readRunStates(run.id)));
    for (const [offset, detail] of read.entries()) if ((await onEach(slice[offset], detail, start + offset)) === false) return;
  }
}
// Anula (confirmadas) o descarta (calculadas sin confirmar) a las personas indicadas de una corrida.
async function undoRun(run, command, contractIds, reason) {
  const detail = await readRunStates(run.id);
  const still = new Set((detail.employees ?? []).filter(e => Array.isArray(e.allowedCommands) && e.allowedCommands.includes(command)).map(e => e.contractId));
  const values = contractIds.filter(id => still.has(id)).sort(); if (!values.length) return 0;
  const payload = ownLiquidationCommand({ runId: run.id, resultSha256: run.resultSha256, scopeVersion: detail.scopeVersion, stateVersion: detail.stateVersion, command, selection: { kind: 'contracts', values }, reason, reviewConfirmed: true });
  const response = await fetch(OWN_LIQ_DETAIL_ENDPOINT, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ operation: 'command', payload }) });
  let value = null; try { value = await response.json(); } catch { /* cuerpo incompleto */ }
  if (!response.ok || value?.ok !== true) throw Object.assign(Error(response.status === 401 ? 'La sesión venció. Volvé a ingresar.' : response.status === 403 ? 'Tu cuenta no permite anular liquidaciones.' : value?.error || 'No se registró la anulación.'), { status: response.status });
  return values.length;
}

// Cierra lo confirmado vigente de UNA corrida (264): el detalle trae sólo sus personas, así un mes grande se cierra por
// partes. Devuelve cuántas personas quedaron cerradas; 0 si esa corrida ya estaba cerrada.
async function closeRun(run, period, liquidationType, reason) {
  const read = await fetchOwnClose({ resource: 'detail', period, liquidationType, runId: run.id });
  if (!read.ok) { if (read.payload?.code === 'OWN_CLOSE_SELECTION_INVALID') return 0; throw Object.assign(Error(read.status === 401 ? 'La sesión venció. Volvé a ingresar.' : read.status === 403 ? 'Tu cuenta no permite cerrar liquidaciones.' : read.payload?.error || 'No se pudo leer lo confirmado para cerrar.'), { status: read.status }); }
  const detail = read.payload.data, rows = Array.isArray(detail?.rows) ? detail.rows : [];
  if (!rows.length) return 0;
  if (rows.some(r => r.canClose !== true)) throw Error('Hay personas de esta corrida que tu cuenta no puede cerrar o que cambiaron. Actualizá y probá otra vez.');
  const body = ownCloseCommand({ period, liquidationType, scopeVersion: detail.scopeVersion, stateVersion: detail.stateVersion, selection: { kind: 'all', values: [] }, command: 'close', groupId: null, reason, reviewConfirmed: true });
  const response = await fetch(OWN_CLOSE_ENDPOINT + '?' + new URLSearchParams({ runId: run.id }), { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ operation: 'command', payload: body }) });
  let value = null; try { value = await response.json(); } catch { /* cuerpo incompleto */ }
  if (!response.ok || value?.ok !== true) throw Object.assign(Error(response.status === 401 ? 'La sesión venció. Volvé a ingresar.' : response.status === 403 ? 'Tu cuenta no permite cerrar liquidaciones.' : value?.error || 'No se registró el cierre.'), { status: response.status });
  return value.data?.snapshot?.employeeCount ?? rows.length;
}

export function mountBatchCalc(host) {
  if (!host || host.dataset.batchCalcMounted) return null; host.dataset.batchCalcMounted = '';
  const href = new URL('payroll-batch-calc.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === href)) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }
  host.className = 'mc-batch-calc';
  // Tres tareas, una por vez: elegís qué hacer y la tarjeta muestra sólo los pasos de esa tarea.
  host.innerHTML = '<header><h3>Liquidar un convenio</h3><p>Elegí qué querés hacer. Cada tarea muestra sólo sus pasos, en orden.</p></header>'
    + '<div class="mc-batch-modes" role="tablist" aria-label="Qué querés hacer">'
    + '<button type="button" role="tab" data-bc-mode="calc" aria-selected="true"><b>Calcular</b><small>Liquidar un convenio o a algunas personas</small></button>'
    + '<button type="button" role="tab" data-bc-mode="confirm" aria-selected="false"><b>Confirmar</b><small>Dar por buena una liquidación ya calculada</small></button>'
    + '<button type="button" role="tab" data-bc-mode="annul" aria-selected="false"><b>Anular</b><small>Deshacer una liquidación para corregirla</small></button>'
    + '<button type="button" role="tab" data-bc-mode="close" aria-selected="false"><b>Cerrar</b><small>Cerrar lo confirmado para emitir recibos y banco</small></button></div>'
    + '<ol class="mc-batch-steps">'
    + '<li><h4>Qué mes y qué convenio</h4><div class="mc-batch-form"><label>Mes <input type="month" data-bc-period></label>'
    + '<label>Tipo <select data-bc-type>' + BATCH_CALC_TYPES.map(t => '<option value="' + t.value + '">' + t.label + '</option>').join('') + '</select></label>'
    + '<label class="mc-batch-agreement">Convenio <select data-bc-agreement><option value="">Tocá acá para ver los convenios</option></select></label>'
    + '<div class="mc-batch-actions mc-batch-reload" style="margin:0"><button type="button" class="button secondary" data-bc-load>Volver a traer</button></div></div></li>'
    + '<li><h4 data-bc-who-title>Quiénes</h4><div class="mc-batch-form">'
    + '<div class="mc-batch-wide mc-batch-pick" data-bc-only-label role="group" aria-labelledby="mc-bc-only-title"><p class="mc-batch-pick-title" id="mc-bc-only-title">Solo estos legajos <small data-bc-only-help>Opcional. Vacío: todo el convenio.</small></p>'
    + '<ul class="mc-batch-chips" data-bc-only-chips aria-label="Solo estos legajos: elegidos"></ul>'
    + '<div class="mc-batch-search"><input type="search" data-bc-only-find role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="mc-bc-only-results" autocomplete="off" aria-label="Buscar persona para: Solo estos legajos"><ul class="mc-batch-results" role="listbox" id="mc-bc-only-results" data-bc-only-results hidden></ul></div>'
    + '<p class="mc-batch-pick-note" data-bc-only-note></p>'
    + '<details class="mc-batch-paste"><summary>Pegar una lista de legajos</summary><textarea data-bc-only rows="2" inputmode="numeric" aria-label="Solo estos legajos: lista de legajos" placeholder="Ejemplo: 1017, 1922, 2083"></textarea></details></div>'
    + '<div class="mc-batch-wide mc-batch-pick" data-bc-excluded-label role="group" aria-labelledby="mc-bc-excluded-title"><p class="mc-batch-pick-title" id="mc-bc-excluded-title">No liquidar este mes <small>Quedan afuera de todas las tandas.</small></p>'
    + '<ul class="mc-batch-chips" data-bc-excluded-chips aria-label="No liquidar este mes: elegidos"></ul>'
    + '<div class="mc-batch-search"><input type="search" data-bc-excluded-find role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="mc-bc-excluded-results" autocomplete="off" aria-label="Buscar persona para: No liquidar este mes"><ul class="mc-batch-results" role="listbox" id="mc-bc-excluded-results" data-bc-excluded-results hidden></ul></div>'
    + '<p class="mc-batch-pick-note" data-bc-excluded-note></p>'
    + '<details class="mc-batch-paste"><summary>Pegar una lista de legajos</summary><textarea data-bc-excluded rows="2" inputmode="numeric" aria-label="No liquidar este mes: lista de legajos" placeholder="Ejemplo: 1177, 1188, 1256"></textarea></details></div></div></li>'
    + '<li data-bc-calc-step><h4>Calcular</h4><div class="mc-batch-actions"><button type="button" class="button secondary" data-bc-plan disabled>Armar tandas</button><button type="button" class="button primary" data-bc-run hidden></button></div>'
    + '<p class="mc-batch-status" role="status" aria-live="polite" data-bc-status></p><ul class="mc-batch-notes" data-bc-notes></ul>'
    + '<div data-bc-progress hidden><div class="mc-batch-bar" data-bc-bar role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Avance del cálculo"><span></span></div><p class="mc-batch-count" data-bc-count></p></div>'
    + '<ol class="mc-batch-list" data-bc-list></ol><dl class="mc-batch-total" data-bc-total hidden></dl>'
    + '<div class="mc-batch-confirm" data-bc-confirm hidden><h4>Confirmar el convenio</h4><p>Confirma todas las tandas con un mismo motivo. Queda registrado quién confirmó y cuándo; se puede anular después.</p>'
    + '<label>Motivo de la confirmación <textarea data-bc-reason rows="2" maxlength="500"></textarea></label>'
    + '<label class="mc-batch-check"><input type="checkbox" data-bc-reviewed> Revisé las personas y los totales del convenio</label>'
    + '<div class="mc-batch-actions"><button type="button" class="button primary" data-bc-confirm-go disabled></button></div><p class="mc-batch-status" role="status" aria-live="polite" data-bc-confirm-status></p></div></li>'
    + '<li data-bc-undo hidden><h4 data-bc-undo-title>Buscar lo calculado</h4><p data-bc-undo-help></p>'
    + '<div class="mc-batch-actions"><button type="button" class="button primary" data-bc-undo-find>Buscar lo calculado</button></div><p class="mc-batch-status" role="status" aria-live="polite" data-bc-undo-status></p>'
    + '<div data-bc-undo-form hidden><label>Motivo <textarea data-bc-undo-reason rows="2" maxlength="500" placeholder="Se completa solo al buscar; podés agregar algo"></textarea></label>'
    + '<label class="mc-batch-check"><input type="checkbox" data-bc-undo-reviewed> Revisé a quiénes alcanza</label>'
    + '<div class="mc-batch-actions"><button type="button" class="button primary" data-bc-undo-confirm disabled></button><button type="button" class="button danger" data-bc-undo-go disabled></button><button type="button" class="button primary" data-bc-undo-close disabled></button></div></div></li>'
    + '</ol>';
  const $ = name => host.querySelector('[data-bc-' + name + ']');
  const now = new Date(); $('period').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let rows = null, plan = null, state = [], busy = false, boot = null, undo = null, mode = 'calc', pickers = [], restoreAgreement = null;
  const status = text => { $('status').textContent = text; };
  const controls = () => {
    $('load').disabled = busy; $('load').hidden = !rows; $('agreement').disabled = busy; $('period').disabled = busy; $('type').disabled = busy; $('excluded').disabled = busy; $('only').disabled = busy;
    $('undo').hidden = mode === 'calc'; $('calc-step').hidden = mode !== 'calc'; $('excluded-label').hidden = mode !== 'calc';
    $('undo-find').disabled = busy || !rows || !$('agreement').value;
    for (const tab of host.querySelectorAll('[data-bc-mode]')) { tab.setAttribute('aria-selected', String(tab.dataset.bcMode === mode)); tab.disabled = busy && tab.dataset.bcMode !== mode; }
    const count = kind => (undo ? undo.targets.filter(t => kind === 'confirm' ? t.command === 'confirm' : t.command !== 'confirm').reduce((n, t) => n + t.contractIds.length, 0) : 0), people = count('undo'), toConfirm = count('confirm'), ready = !busy && $('undo-reviewed').checked && $('undo-reason').value.trim().length >= 10;
    const toClose = undo ? undo.targets.filter(t => t.command === 'annul').reduce((n, t) => n + t.contractIds.length, 0) : 0;
    const shown = mode === 'annul' ? people : mode === 'close' ? toClose : toConfirm;
    $('undo-form').hidden = !shown; $('undo-go').hidden = mode !== 'annul' || !people; $('undo-confirm').hidden = mode !== 'confirm' || !toConfirm; $('undo-close').hidden = mode !== 'close' || !toClose;
    $('undo-close').textContent = 'Cerrar ' + toClose + (toClose === 1 ? ' persona' : ' personas'); $('undo-close').disabled = !ready || !toClose;
    $('undo-go').textContent = 'Anular ' + people + (people === 1 ? ' persona' : ' personas'); $('undo-confirm').textContent = 'Confirmar ' + toConfirm + (toConfirm === 1 ? ' persona' : ' personas');
    $('undo-go').disabled = !ready || !people; $('undo-confirm').disabled = !ready || !toConfirm; $('undo-reason').disabled = busy; $('undo-reviewed').disabled = busy;
    $('plan').disabled = busy || !rows || !$('agreement').value;
    const pending = state.filter(s => s.state !== 'done').length;
    $('run').hidden = !plan || !plan.batches.length || !pending;
    $('run').disabled = busy;
    $('run').textContent = state.some(s => s.state === 'done' || s.state === 'failed') ? 'Seguir con ' + pending + (pending === 1 ? ' tanda' : ' tandas') : 'Calcular ' + pending + (pending === 1 ? ' tanda' : ' tandas');
    for (const p of pickers) p.paint();
  };
  const forgetUndo = () => { undo = null; $('undo-status').textContent = ''; $('undo-reason').value = ''; $('undo-reviewed').checked = false; };
  const forget = () => { plan = null; state = []; forgetUndo(); $('list').replaceChildren(); $('notes').replaceChildren(); $('progress').hidden = true; $('total').hidden = true; $('confirm').hidden = true; $('reason').value = ''; delete $('reason').dataset.proposed; $('reviewed').checked = false; $('confirm-status').textContent = ''; controls(); };

  // Memoria del navegador: el formulario de esta pestaña (una recarga no lo borra) y, por convenio, los legajos que la
  // última vez no se liquidaron. Si el navegador no permite guardar, la tarjeta funciona igual, sin recordar.
  const MEM = 'mc-batch-calc:';
  const remember = (store, key, value) => { try { store.setItem(MEM + key, JSON.stringify(value)); } catch { /* sin memoria */ } };
  const recall = (store, key) => { try { return JSON.parse(store.getItem(MEM + key) ?? 'null'); } catch { return null; } };
  const saveForm = () => remember(sessionStorage, 'form', { period: $('period').value, type: $('type').value, agreement: $('agreement').value || restoreAgreement || '', excluded: $('excluded').value, only: $('only').value, mode });
  const monthName = period => { const [y, m] = String(period).split('-').map(Number); return y && m ? new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(period); };
  // Buscador de personas del convenio elegido: se escribe parte del apellido, del nombre o del legajo y se toca la
  // persona. Lo elegido queda a la vista con su nombre y se quita con la cruz. La lista de legajos sigue disponible
  // para pegar varios de una vez.
  function picker(name, label) {
    const area = $(name), find = $(name + '-find'), list = $(name + '-results'), chips = $(name + '-chips'), note = $(name + '-note');
    let found = [], active = -1;
    const people = () => (rows && $('agreement').value ? batchCalcPeople(rows, $('agreement').value) : []);
    const current = () => batchCalcLegajos(area.value).valid;
    const set = values => { area.value = values.join(', '); area.dispatchEvent(new Event('input', { bubbles: true })); };
    const close = () => { list.hidden = true; find.setAttribute('aria-expanded', 'false'); find.removeAttribute('aria-activedescendant'); active = -1; };
    const add = legajos => { const v = current(); set([...v, ...legajos.filter(l => !v.includes(l))]); find.value = ''; close(); find.focus(); };
    function highlight(next) {
      active = next; [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      if (active >= 0 && list.children[active]) { find.setAttribute('aria-activedescendant', list.children[active].id); list.children[active].scrollIntoView({ block: 'nearest' }); }
    }
    function show() {
      const query = find.value.trim(), typed = batchCalcLegajos(query).valid;
      if (!query) { close(); return; }
      found = batchCalcSearch(people(), query, { skip: current() });
      const several = typed.length > 1 && /[\s,;]/u.test(query);
      list.replaceChildren(...(several ? [Object.assign(node('li', 'Agregar ' + typed.length + ' legajos: ' + typed.join(', '), 'mc-batch-result-all'), { id: area.dataset.pickId + '-all' })] : found.map((p, i) => {
        const li = node('li', null, 'mc-batch-result'); li.id = area.dataset.pickId + '-' + i; li.setAttribute('role', 'option');
        li.append(node('b', p.legajo), node('span', p.name || 'Sin nombre en el padrón'));
        li.addEventListener('pointerdown', e => { e.preventDefault(); add([p.legajo]); });
        return li;
      })));
      if (several) { list.firstChild.setAttribute('role', 'option'); list.firstChild.addEventListener('pointerdown', e => { e.preventDefault(); add(typed); }); found = [{ all: typed }]; }
      if (!found.length) list.append(node('li', 'Nadie con «' + query + '» en este convenio.', 'mc-batch-result-none'));
      list.hidden = false; find.setAttribute('aria-expanded', 'true'); highlight(found.length ? 0 : -1);
    }
    find.addEventListener('input', show);
    find.addEventListener('focus', () => { if (find.value.trim()) show(); });
    find.addEventListener('blur', () => setTimeout(close, 120));
    find.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && found.length) { e.preventDefault(); if (list.hidden) show(); highlight(Math.min(found.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp' && found.length) { e.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); const pick = found[active]; if (pick) add(pick.all ?? [pick.legajo]); }
      else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); close(); } }
      else if (e.key === 'Backspace' && !find.value) { const v = current(); if (v.length) set(v.slice(0, -1)); }
    });
    function paint() {
      const names = new Map(people().map(p => [p.legajo, p.name])), chosen = current(), ready = !!rows && !!$('agreement').value;
      chips.replaceChildren(...chosen.map(legajo => {
        const li = node('li', null, 'mc-batch-chip'), known = names.has(legajo); li.dataset.known = String(known || !ready);
        li.append(node('b', legajo), node('span', known ? names.get(legajo) : ready ? 'No está activo en este convenio' : ''));
        const out = node('button', '×'); out.type = 'button'; out.disabled = busy; out.setAttribute('aria-label', 'Quitar el legajo ' + legajo + ' de «' + label + '»');
        out.addEventListener('click', () => { set(current().filter(l => l !== legajo)); find.focus(); });
        li.append(out); return li;
      }));
      find.disabled = busy || !ready; area.disabled = busy;
      find.placeholder = !ready ? 'Primero elegí el convenio' : 'Buscá por apellido, nombre o legajo';
    }
    area.dataset.pickId = 'mc-bc-' + name + '-' + Math.random().toString(36).slice(2, 8);
    area.addEventListener('input', () => { note.textContent = ''; paint(); });
    return { paint, note: text => { note.textContent = text; } };
  }
  pickers = [picker('only', 'Solo estos legajos'), picker('excluded', 'No liquidar este mes')];
  const [, excludedPicker] = pickers;
  // Al elegir el convenio, si «No liquidar» está vacío, se proponen los de la última vez para revisarlos.
  function offerExcluded() {
    const agreement = $('agreement').value; if (mode !== 'calc' || !agreement || $('excluded').value.trim()) return;
    const saved = recall(localStorage, 'excluded:' + agreement);
    if (!saved || !Array.isArray(saved.legajos) || !saved.legajos.length) return;
    $('excluded').value = saved.legajos.join(', '); controls();
    excludedPicker.note('Son los que no se liquidaron en ' + monthName(saved.period) + '. Quitá a quien este mes sí se liquida.');
  }
  function paint() {
    const done = state.filter(s => s.state === 'done'), people = done.reduce((n, s) => n + s.batch.people, 0), failed = state.some(s => s.state === 'failed');
    const share = plan?.people ? people / plan.people : 0;
    $('progress').hidden = !plan || !plan.batches.length;
    $('bar').style.setProperty('--mc-batch-progress', String(share)); $('bar').dataset.state = failed ? 'failed' : 'ok'; $('bar').setAttribute('aria-valuenow', String(Math.round(share * 100)));
    $('count').textContent = plan ? 'Tanda ' + Math.min(done.length + (busy ? 1 : 0), plan.batches.length) + ' de ' + plan.batches.length + ' · ' + people + ' de ' + plan.people + ' personas' : '';
    $('list').replaceChildren(...state.map(s => {
      const li = node('li', null, 'mc-batch-item'), text = node('p'); li.dataset.state = s.state;
      text.append(node('span', 'Tanda ' + s.batch.index + ' · ' + s.batch.people + ' personas · legajos ' + s.batch.firstLegajo + ' a ' + s.batch.lastLegajo));
      text.append(node('small', s.state === 'done' ? (s.confirmed ? 'Confirmada · neto ' : 'Lista en ' + s.seconds + ' s · neto ') + batchCalcMoney(s.totals.net) : s.state === 'running' ? 'Calculando…' : s.state === 'failed' ? s.error : 'En cola'));
      li.append(node('b', String(s.batch.index)), text);
      if (s.state === 'failed') { const again = node('button', 'Repetir esta tanda', 'button secondary'); again.type = 'button'; again.disabled = busy; again.addEventListener('click', () => run(s)); li.append(again); }
      return li;
    }));
    if (plan && done.length === plan.batches.length && done.length) {
      const sum = batchCalcSum(done.map(s => s.totals));
      $('total').replaceChildren(...[['Personas', String(sum.people)], ['Bruto', batchCalcMoney(sum.gross)], ['Descuentos', batchCalcMoney(sum.deduction)], ['Neto', batchCalcMoney(sum.net)]].map(([k, v]) => { const d = node('div'); d.append(node('dt', k), node('dd', v)); return d; }));
      $('total').hidden = false;
    } else $('total').hidden = true;
    const allDone = !!plan && done.length === plan.batches.length && done.length > 0, left = done.filter(s => !s.confirmed).length;
    const canConfirm = allDone && done.every(s => s.totals.runId && s.totals.resultSha256);
    $('confirm').hidden = !canConfirm;
    if (canConfirm) {
      if (!$('reason').dataset.proposed) { const sum = batchCalcSum(done.map(s => s.totals)); $('reason').value = batchCalcType(plan.liquidationType).reason + ' ' + plan.period + ' de ' + plan.agreement + ': ' + sum.people + ' personas, neto ' + batchCalcMoney(sum.net).replace('\u00a0', ' ') + '. Totales revisados.'; $('reason').dataset.proposed = '1'; }
      $('confirm-go').textContent = left ? 'Confirmar ' + left + (left === 1 ? ' tanda' : ' tandas') : 'Convenio confirmado';
      $('confirm-go').disabled = busy || !left || !$('reviewed').checked || $('reason').value.trim().length < 10;
      $('reason').disabled = busy || !left; $('reviewed').disabled = busy || !left;
    }
    controls();
  }
  async function confirmAll() {
    if (busy || !plan) return; const reason = $('reason').value.trim(); if (reason.length < 10 || !$('reviewed').checked) return;
    busy = true; paint();
    try {
      for (const item of state.filter(s => s.state === 'done' && !s.confirmed)) {
        $('confirm-status').textContent = 'Confirmando la tanda ' + item.batch.index + ' de ' + plan.batches.length + '…';
        try { await confirmRun(item, reason); item.confirmed = true; }
        catch (e) { item.confirmKey = crypto.randomUUID(); $('confirm-status').textContent = 'La tanda ' + item.batch.index + ' no se confirmó: ' + e.message + ' ' + (state.some(s => s.confirmed) ? 'Las anteriores quedaron confirmadas.' : ''); return; }
        paint();
      }
      $('confirm-status').textContent = 'Convenio confirmado: ' + plan.people + ' personas en ' + plan.batches.length + (plan.batches.length === 1 ? ' tanda.' : ' tandas.');
      document.dispatchEvent(new CustomEvent('mc:pending-refresh'));
    } finally { busy = false; paint(); }
  }
  async function load() {
    if (busy) return; busy = true; forget(); status('Trayendo el padrón propio…');
    try {
      rows = rosterRows(await getJson(ROSTER));
      const options = batchCalcAgreements(rows), select = $('agreement'), keep = select.value;
      select.replaceChildren(node('option', options.length ? 'Elegí un convenio' : 'No hay contratos activos'), ...options.map(o => { const option = node('option', o.agreement + ' · ' + o.people + (o.people === 1 ? ' persona' : ' personas')); option.value = o.agreement; return option; }));
      select.firstChild.value = ''; if (options.some(o => o.agreement === keep)) select.value = keep;
      const restored = !!restoreAgreement && options.some(o => o.agreement === restoreAgreement); if (restored) select.value = restoreAgreement;
      restoreAgreement = null;
      status(restored ? 'Se recuperó lo que estabas haciendo. Revisá y seguí.' : options.length ? 'Elegí el convenio.' : 'El padrón propio no tiene contratos activos.');
    } catch (e) { rows = null; status(e.message); } finally { busy = false; controls(); }
  }
  function arrange() {
    if (busy || !rows) return;
    try {
      const typed = batchCalcLegajos($('excluded').value);
      const just = batchCalcLegajos($('only').value);
      plan = batchCalcPlan(rows, { agreement: $('agreement').value, period: $('period').value, liquidationType: $('type').value, excluded: typed.valid, only: just.valid });
      if (!plan.only.length) remember(localStorage, 'excluded:' + plan.agreement, { legajos: plan.excluded, period: plan.period });
      state = plan.batches.map(batch => ({ batch, state: 'queued', key: crypto.randomUUID(), confirmKey: crypto.randomUUID(), confirmed: false, totals: null, seconds: 0, error: '' })); boot = null;
      const notes = [];
      if (plan.only.length) notes.push('Solo se calculan: ' + plan.only.join(', ') + '.');
      if (plan.onlyNotFound.length) notes.push('No están activos en este convenio (revisá el número): ' + plan.onlyNotFound.join(', ') + '.');
      if (just.invalid.length) notes.push('No son legajos y se ignoraron: ' + just.invalid.join(', ') + '.');
      if (plan.excluded.length) notes.push('No se liquidan este mes: ' + plan.excluded.join(', ') + '.');
      if (plan.excludedNotFound.length) notes.push('No están activos en este convenio (revisá el número): ' + plan.excludedNotFound.join(', ') + '.');
      if (typed.invalid.length) notes.push('No son legajos y se ignoraron: ' + typed.invalid.join(', ') + '.');
      if (plan.notStarted.length) notes.push('Ingresan después de este mes y no se calculan: ' + plan.notStarted.join(', ') + '.');
      $('notes').replaceChildren(...notes.map(n => node('li', n)));
      status(plan.batches.length ? plan.people + ' personas en ' + plan.batches.length + (plan.batches.length === 1 ? ' tanda' : ' tandas') + '. Revisá y tocá «Calcular».' : 'No quedó ninguna persona para calcular en ese convenio.');
      paint();
    } catch (e) { forget(); status(e.message); }
  }
  async function run(only = null) {
    if (busy || !plan) return; busy = true;
    const queue = only ? [only] : state.filter(s => s.state !== 'done');
    try {
      boot ??= await getJson(RUN + '?resource=bootstrap');
      for (const item of queue) {
        item.state = 'running'; item.error = ''; paint(); status('Calculando la tanda ' + item.batch.index + ' de ' + plan.batches.length + '. Podés seguir viendo esta pantalla; no la cierres.');
        const started = Date.now();
        try { item.totals = await calculate(item.batch, plan, boot, item.key); item.seconds = Math.round((Date.now() - started) / 1000); item.state = 'done'; }
        catch (e) { item.state = 'failed'; item.error = e.message; if (!e.uncertain) item.key = crypto.randomUUID(); if (e.status === 409 || e.status === 422) boot = null; paint(); status('La tanda ' + item.batch.index + ' no se calculó: ' + e.message); return; }
        paint();
      }
      const left = state.filter(s => s.state !== 'done').length;
      status(left ? 'Quedan ' + left + (left === 1 ? ' tanda' : ' tandas') + ' por calcular.' : 'Convenio calculado. Revisá los totales y confirmalo acá abajo, o tanda por tanda en «Calcular».');
      if (!left) document.dispatchEvent(new CustomEvent('mc:pending-refresh'));
    } catch (e) { status(e.message); } finally { busy = false; paint(); }
  }
  // Busca, de la corrida más nueva a la más vieja, el estado vigente de cada persona pedida.
  async function findUndo() {
    if (busy || !rows) return; busy = true; forgetUndo(); controls();
    try {
      const wantedPlan = batchCalcPlan(rows, { agreement: $('agreement').value, period: $('period').value, liquidationType: $('type').value, only: batchCalcLegajos($('only').value).valid });
      const wanted = new Set(wantedPlan.batches.flatMap(b => b.contractIds)), seen = new Set(), targets = []; let blocked = 0, confirmed = 0, calculated = 0, own = 0;
      if (!wanted.size) { $('undo-status').textContent = 'No hay personas de ese convenio para buscar.'; return; }
      // Quiénes están en cada corrida no cambia nunca: se recuerda en este navegador y sólo se leen las corridas que
      // tienen a alguien de este convenio (o que todavía no se conocen). La primera búsqueda lee todo; las demás, poco.
      const known = recall(localStorage, 'runs') ?? {};
      const runs = batchCalcUndoRuns((await getJson(OWN_LIQ_DETAIL_ENDPOINT + '?resource=bootstrap')).runs, wantedPlan.period, wantedPlan.liquidationType)
        .filter(run => !Array.isArray(known[run.id]) || known[run.id].some(id => wanted.has(id)));
      $('undo-status').textContent = 'Leyendo las corridas del mes: 0 de ' + runs.length + '…';
      await readRunsInOrder(runs, (run, detail, index) => {
        if (!Array.isArray(known[run.id])) { known[run.id] = detail.employees.map(e => e.contractId); const ids = Object.keys(known); for (const old of ids.slice(0, Math.max(0, ids.length - 400))) delete known[old]; remember(localStorage, 'runs', known); }
        if (seen.size === wanted.size) return false;
        const found = batchCalcUndoScan(detail.employees, wanted, seen);
        for (const command of ['confirm', 'annul', 'cancel']) if (found[command].length) targets.push({ run, command, contractIds: found[command] });
        blocked += found.blocked.length; confirmed += found.confirmed; calculated += found.calculated; own += found.cancel.filter(id => !found.confirm.includes(id)).length;
        $('undo-status').textContent = 'Leyendo las corridas del mes: ' + (index + 1) + ' de ' + runs.length + '. Encontradas ' + seen.size + ' de ' + wanted.size + ' personas…';
      });
      undo = { targets };
      // El motivo viene escrito: se toca sólo para agregar algo. Queda registrado con la decisión.
      const sum = command => targets.filter(t => command(t.command)).reduce((n, t) => n + t.contractIds.length, 0);
      const people = mode === 'confirm' ? sum(c => c === 'confirm') : mode === 'close' ? sum(c => c === 'annul') : sum(c => c !== 'confirm');
      if (people && !$('undo-reason').value.trim()) {
        const what = batchCalcType(wantedPlan.liquidationType).label.toLowerCase() + ' de ' + monthName(wantedPlan.period) + ' de ' + wantedPlan.agreement + ': ' + people + (people === 1 ? ' persona' : ' personas');
        $('undo-reason').value = (mode === 'confirm' ? 'Confirmación de la liquidación ' + what + ', revisada.' : mode === 'close' ? 'Cierre de la liquidación ' + what + ' confirmadas.' : 'Anulación de la liquidación ' + what + ', para corregir y volver a calcular.').slice(0, 500);
      }
      $('undo-status').textContent = (confirmed + calculated ? 'En ' + wantedPlan.period + ': ' + confirmed + ' confirmadas y ' + calculated + ' calculadas sin confirmar.' : 'No hay nada calculado vigente para esas personas en ' + wantedPlan.period + '.')
        + (own ? ' ' + own + ' las calculaste vos: las confirma otra persona, o las podés anular.' : '') + (blocked ? ' ' + blocked + ' no admiten cambios con tu cuenta o ya están cerradas.' : '');
    } catch (e) { undo = null; $('undo-status').textContent = e.message; } finally { busy = false; controls(); }
  }
  async function undoAll(kind) {
    if (busy || !undo) return; const mine = undo.targets.filter(t => kind === 'confirm' ? t.command === 'confirm' : t.command !== 'confirm'), verb = kind === 'confirm' ? ['Confirmando', 'confirmaron', 'confirmada', 'confirmadas'] : ['Anulando', 'anularon', 'anulada', 'anuladas']; const reason = $('undo-reason').value.trim(); if (reason.length < 10 || !$('undo-reviewed').checked) return;
    busy = true; controls(); let people = 0;
    try {
      for (const [index, target] of mine.entries()) {
        $('undo-status').textContent = verb[0] + ': corrida ' + (index + 1) + ' de ' + mine.length + '. No cierres ni cambies de pantalla.';
        try { people += await undoRun(target.run, target.command, target.contractIds, reason); }
        catch (e) { const done = new Set(mine.slice(0, index)); undo = { targets: undo.targets.filter(t => !done.has(t)) }; $('undo-status').textContent = 'Se ' + verb[1] + ' ' + people + ' personas y después falló: ' + e.message + ' Tocá el botón otra vez para seguir.'; return; }
      }
      undo = null; $('undo-reason').value = ''; $('undo-reviewed').checked = false;
      $('undo-status').textContent = 'Listo: ' + people + ' ' + (people === 1 ? 'persona ' + verb[2] : 'personas ' + verb[3]) + '.' + (kind === 'confirm' ? '' : ' Para corregirlas, volvé a «Calcular».');
      document.dispatchEvent(new CustomEvent('mc:pending-refresh'));
    } finally { busy = false; controls(); }
  }
  // Cerrar: corrida por corrida, sólo las que tienen personas confirmadas vigentes.
  async function closeAll() {
    if (busy || !undo) return; const reason = $('undo-reason').value.trim(); if (reason.length < 10 || !$('undo-reviewed').checked) return;
    const runs = [...new Map(undo.targets.filter(t => t.command === 'annul').map(t => [t.run.id, t.run])).values()];
    busy = true; controls(); let people = 0;
    try {
      for (const [index, run] of runs.entries()) {
        $('undo-status').textContent = 'Cerrando: corrida ' + (index + 1) + ' de ' + runs.length + '. No cierres ni cambies de pantalla.';
        try { people += await closeRun(run, $('period').value, $('type').value, reason); }
        catch (e) { const done = new Set(runs.slice(0, index).map(r => r.id)); undo = { targets: undo.targets.filter(t => !done.has(t.run.id)) }; $('undo-status').textContent = 'Se cerraron ' + people + ' personas y después falló: ' + e.message + ' Tocá «Cerrar» otra vez para seguir.'; return; }
      }
      undo = null; $('undo-reason').value = ''; $('undo-reviewed').checked = false;
      $('undo-status').textContent = 'Listo: ' + people + (people === 1 ? ' persona cerrada.' : ' personas cerradas.') + ' Ya se pueden emitir recibos, banco y reportes del mes.';
      document.dispatchEvent(new CustomEvent('mc:pending-refresh'));
    } finally { busy = false; controls(); }
  }
  $('undo-close').addEventListener('click', closeAll);
  $('undo-find').addEventListener('click', findUndo); $('undo-go').addEventListener('click', () => undoAll('undo')); $('undo-confirm').addEventListener('click', () => undoAll('confirm')); $('undo-reviewed').addEventListener('change', controls); $('undo-reason').addEventListener('input', controls);
  $('confirm-go').addEventListener('click', confirmAll); $('reviewed').addEventListener('change', paint); $('reason').addEventListener('input', paint);
  $('load').addEventListener('click', load); $('plan').addEventListener('click', arrange); $('run').addEventListener('click', () => run());
  for (const name of ['agreement', 'period', 'type', 'excluded', 'only']) $(name).addEventListener('input', () => { saveForm(); if (busy) return; if (undo) forgetUndo(); if (plan) { forget(); status('Cambió el pedido. Tocá «Armar tandas» de nuevo.'); } else controls(); });
  $('agreement').addEventListener('change', () => { offerExcluded(); saveForm(); });
  // Una decisión en curso no se corta por cerrar la pestaña sin querer.
  addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
  // El padrón se trae al primer toque sobre la lista de convenios: nada se lee al abrir la pantalla.
  const firstLoad = () => { if (!rows && !busy) load(); };
  $('agreement').addEventListener('pointerdown', firstLoad); $('agreement').addEventListener('focus', firstLoad);
  const HELP = {
    calc: ['Quiénes', 'Opcional. Vacío: todo el convenio.'],
    confirm: ['A quiénes confirmar', 'Opcional. Vacío: todo lo calculado del convenio en ese mes.'],
    annul: ['A quiénes anular', 'Opcional. Vacío: todo el convenio en ese mes. Para una sola persona, escribí su legajo.'],
    close: ['A quiénes cerrar', 'Opcional. Vacío: todo lo confirmado del convenio en ese mes.'],
  };
  function setMode(next) {
    if (busy || next === mode) return; mode = next; forgetUndo();
    $('who-title').textContent = HELP[mode][0]; $('only-help').textContent = HELP[mode][1];
    $('undo-title').textContent = { confirm: 'Buscar lo calculado y confirmarlo', annul: 'Buscar lo calculado y anularlo', close: 'Buscar lo confirmado y cerrarlo' }[mode] ?? '';
    $('undo-help').textContent = { confirm: 'Busca lo calculado sin confirmar, lo haya calculado quien sea. Después lo confirmás todo junto con un motivo.', annul: 'Busca lo confirmado o calculado del mes para esas personas. Después lo anulás todo junto con un motivo. No se borra nada: queda registrado quién anuló y por qué.', close: 'Busca lo confirmado del mes y lo cierra corrida por corrida. Después del cierre se emiten recibos, banco y reportes; para cambiar algo cerrado primero hay que reabrirlo.' }[mode] ?? '';
    status(''); controls(); saveForm();
  }
  for (const tab of host.querySelectorAll('[data-bc-mode]')) tab.addEventListener('click', () => setMode(tab.dataset.bcMode));
  status('Elegí el mes y el convenio.');
  // Después de una recarga, la tarjeta vuelve como estaba: mismo mes, tipo, convenio y legajos elegidos.
  const saved = recall(sessionStorage, 'form');
  if (saved && typeof saved === 'object') {
    if (typeof saved.period === 'string' && /^\d{4}-\d{2}$/.test(saved.period)) $('period').value = saved.period;
    if (BATCH_CALC_TYPES.some(t => t.value === saved.type)) $('type').value = saved.type;
    if (typeof saved.excluded === 'string') $('excluded').value = saved.excluded.slice(0, 5000);
    if (typeof saved.only === 'string') $('only').value = saved.only.slice(0, 5000);
    if (HELP[saved.mode]) setMode(saved.mode);
    if (typeof saved.agreement === 'string' && saved.agreement) { restoreAgreement = saved.agreement; load(); }
  }
  controls();
  return { load, arrange, run, setMode };
}
