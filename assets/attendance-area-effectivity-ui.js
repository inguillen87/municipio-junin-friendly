import {
  areaEffectivityDay, areaEffectivityText, validateAreaEffectivityCommand, validateAreaEffectivityResponse,
} from './attendance-area-effectivity-model.js';

const ENDPOINT = '/api/internal-attendance-area-effectivity';
const day = value => areaEffectivityDay(value) ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : value;
const INSTANT = new Intl.DateTimeFormat('es-AR', {timeZone: 'America/Argentina/Mendoza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const instant = value => { const ms = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(ms) ? INSTANT.format(new Date(ms)).replace(',', '') + ' h' : ''; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const STATUS = Object.freeze({proposed: 'Esperando decisión', approved: 'Aprobada', rejected: 'Rechazada'});

function errorText(error, sending) {
  const code = String(error?.code ?? '').replace('ATTENDANCE_AREA_EFFECTIVITY_', '');
  if (error?.status === 401) return 'La sesión venció. Ingresá de nuevo para continuar.';
  if (code === 'INDEPENDENT_REQUIRED') return 'La aprobación tiene que hacerla otra persona, distinta de quien preparó la declaración.';
  if (code === 'ACTOR_REQUIRED') return 'Tu cuenta no está vinculada a tu relación laboral. Pedí ese vínculo en Administración antes de preparar o decidir.';
  if (error?.status === 403) return 'Tu cuenta no tiene permiso para esta operación.';
  if (code === 'PENDING_EXISTS') return 'Ya hay una declaración esperando decisión. Hay que aprobarla o rechazarla antes de preparar otra.';
  if (code === 'PREVIEW_CHANGED') return 'Los legajos cambiaron desde que abriste la vista previa. Se actualizaron los totales: revisalos de nuevo.';
  if (code === 'STALE') return 'Algún legajo cambió después de preparar la declaración. Rechazala y preparala de nuevo.';
  if (code === 'VERSION_CONFLICT') return 'La declaración cambió o ya fue decidida. Se actualizó su estado.';
  if (code === 'DATE_INVALID') return 'La fecha desde la que rige no puede ser futura.';
  if (code === 'NOTHING_TO_DECLARE') return 'No hay contratos adoptados en condiciones de ser declarados.';
  if (code === 'BUSY') return 'Hay otra operación en curso sobre los legajos. Esperá un momento y repetí.';
  if (code === 'RESPONSE_INVALID') return 'La respuesta no coincide con lo esperado. No se mostraron datos sin verificar.';
  if (error?.status === 503 || error?.status === 404) return 'La declaración de vigencia todavía no está habilitada en este municipio. No se cambió ningún dato.';
  if (error?.status === 422 || error?.status === 400) return error.message || 'Revisá la fecha, la referencia y el motivo.';
  if (sending) return 'No se pudo confirmar el envío. Actualizá el estado antes de repetir: si la operación llegó, vas a verla reflejada.';
  return 'No se pudo consultar el estado. Probá de nuevo en un momento.';
}

/** Panel de Personal: declara desde qué fecha cada contrato adoptado pertenece al área de su legajo. */
export function mountAreaEffectivity(root, options = {}) {
  if (!root || root.getAttribute('data-ae-mounted') === 'true') return null;
  root.setAttribute('data-ae-mounted', 'true');
  const doc = options.document || globalThis.document;
  const fetchImpl = options.fetch || globalThis.fetch.bind(globalThis);
  const createKey = options.createKey || (() => globalThis.crypto.randomUUID());
  const el = (tag, text, mark, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (mark) node.setAttribute('data-ae-' + mark, '');
    if (className) node.className = className;
    return node;
  };
  const summary = el('summary');
  summary.append(el('strong', 'Vigencia de área de los contratos adoptados'), el('span', 'Declarar desde qué fecha cada contrato pertenece al área de su legajo'));
  const body = el('div', undefined, 'body', 'ae-body');
  const intro = el('p', 'Los contratos adoptados desde el sistema anterior no tienen registrada la fecha desde la que pertenecen a su área. Sin esa fecha, la asistencia por área no puede asignarles marcaciones. Acá una persona prepara la declaración y otra distinta la aprueba. La declaración no cambia ningún legajo y no acredita días anteriores a la fecha que se declare.');
  const refresh = el('button', 'Actualizar estado', 'refresh', 'button');
  refresh.setAttribute('type', 'button');
  const status = el('p', 'Abrí este panel para consultar el estado.', 'status');
  status.setAttribute('role', 'status');
  const content = el('div', undefined, 'content');
  body.append(intro, refresh, status, content);
  root.replaceChildren(summary, body);

  let state = null, busy = false, generation = 0, attempt = null;
  const message = text => { status.textContent = text; };

  async function call(method, payload, key) {
    const init = {method, credentials: 'same-origin', cache: 'no-store', headers: {accept: 'application/json'}};
    if (method === 'POST') {
      init.headers['content-type'] = 'application/json'; init.headers['idempotency-key'] = key;
      init.body = JSON.stringify({operation: 'command', payload});
    }
    const response = await fetchImpl(ENDPOINT, init);
    let json = null;
    try { json = await response.json(); } catch { json = null; }
    if (!response.ok || !json || json.ok !== true) throw Object.assign(new Error(json?.error || ''), {status: response.status, code: json?.code});
    return json.data;
  }

  function areaTable(areas, caption) {
    const wrap = el('details', undefined, 'areas');
    wrap.append(el('summary', 'Ver ' + plural(areas.length, 'área', 'áreas') + ' y su cantidad de contratos'));
    const table = el('table'), head = el('thead'), headRow = el('tr'), rows = el('tbody');
    table.append(el('caption', caption));
    const th1 = el('th', 'Área (repartición / sector)'), th2 = el('th', 'Contratos');
    th1.setAttribute('scope', 'col'); th2.setAttribute('scope', 'col');
    headRow.append(th1, th2); head.append(headRow);
    for (const area of areas) {
      const row = el('tr', undefined, 'area-row');
      row.append(el('td', area.areaLabel), el('td', String(area.contracts)));
      rows.append(row);
    }
    table.append(head, rows);
    const scroller = el('div', undefined, undefined, 'ae-table');
    scroller.append(table); wrap.append(scroller);
    return wrap;
  }
  function exclusions(excluded) {
    const list = el('ul', undefined, 'excluded');
    const add = (n, text) => { if (n > 0) list.append(el('li', text)); };
    add(excluded.areaIncomplete, plural(excluded.areaIncomplete, 'contrato no tiene', 'contratos no tienen') + ' repartición y sector completos en el legajo. Completalos con una rectificación de legajo y declaralos después.');
    add(excluded.withdrawn, plural(excluded.withdrawn, 'alta anulada queda', 'altas anuladas quedan') + ' fuera: no corresponde declararles área.');
    add(excluded.notActive, plural(excluded.notActive, 'contrato inactivo queda', 'contratos inactivos quedan') + ' fuera.');
    add(excluded.unproven, plural(excluded.unproven, 'contrato tiene', 'contratos tienen') + ' un antecedente que no se pudo verificar. Avisá a soporte: no se declaran hasta revisarlos.');
    add(excluded.nativeRegistration, plural(excluded.nativeRegistration, 'contrato tiene', 'contratos tienen') + ' alta propia: su área ya rige desde el alta y no necesita declaración.');
    return list.children.length ? list : null;
  }
  function field(labelText, control, hint) {
    const label = el('label');
    label.append(el('span', labelText), control);
    if (hint) label.append(el('small', hint));
    return label;
  }

  function renderPending(pending, permissions) {
    const box = el('section', undefined, 'pending', 'ae-card');
    box.append(el('h4', 'Declaración esperando decisión'));
    const facts = el('dl');
    const fact = (term, value) => { facts.append(el('dt', term), el('dd', value)); };
    fact('Rige desde', day(pending.effectiveFrom));
    fact('Alcance', pending.scope === 'all' ? 'Todos los contratos en condiciones' : 'Contratos sin declaración vigente');
    fact('Referencia documental', pending.authorizationReference);
    fact('Contratos incluidos', String(pending.itemCount));
    fact('Preparada por', pending.proposedBy + ' · ' + instant(pending.proposedAt));
    box.append(facts, areaTable(pending.areas, 'Contratos incluidos por área'));
    const excludedList = exclusions(pending.excluded);
    if (excludedList) { box.append(el('p', 'Quedaron fuera de esta declaración:'), excludedList); }
    if (pending.stale) box.append(el('p', 'Algún legajo cambió después de prepararla: ya no se puede aprobar. Rechazala y preparala de nuevo.', 'stale', 'ae-warning'));
    const canApprove = permissions.canReview && !pending.ownProposal && !pending.stale;
    const canReject = permissions.canReview || pending.ownProposal;
    if (!canApprove && !canReject) { box.append(el('p', 'Tu cuenta no puede decidir esta declaración.', 'readonly')); return box; }
    if (pending.ownProposal) box.append(el('p', 'La preparaste vos: la aprobación tiene que hacerla otra persona. Podés retirarla rechazándola.', 'own'));
    const reason = el('textarea', undefined, 'reason');
    reason.setAttribute('rows', '3'); reason.setAttribute('maxlength', '1000');
    box.append(field('Motivo de la decisión', reason, 'Entre 10 y 1000 caracteres. Queda registrado junto a la decisión.'));
    const actions = el('div', undefined, undefined, 'ae-actions');
    const decide = decision => async () => {
      const text = String(reason.value ?? '').trim();
      if (!areaEffectivityText(text, 10, 1000)) { message('Escribí el motivo de la decisión (entre 10 y 1000 caracteres).'); reason.focus(); return; }
      await send({action: 'review', decision, proposalId: pending.id, proposalVersion: pending.version, reason: text},
        decision === 'approve' ? 'Declaración aprobada. La asistencia por área ya puede asignar estos contratos desde el ' + day(pending.effectiveFrom) + '.' : 'Declaración rechazada. Se puede preparar otra.');
    };
    if (canApprove) { const approve = el('button', 'Aprobar declaración', 'approve', 'button primary'); approve.setAttribute('type', 'button'); approve.addEventListener('click', decide('approve')); actions.append(approve); }
    if (canReject) { const reject = el('button', pending.ownProposal ? 'Retirar mi declaración' : 'Rechazar declaración', 'reject', 'button'); reject.setAttribute('type', 'button'); reject.addEventListener('click', decide('reject')); actions.append(reject); }
    box.append(actions);
    return box;
  }

  function renderPropose(current) {
    const box = el('section', undefined, 'propose', 'ae-card'), scopes = current.preview.scopes;
    box.append(el('h4', 'Preparar una declaración'));
    // Con declaraciones vigentes hay dos alcances: completar los que faltan o declarar de nuevo a todos.
    const choices = [
      ['missing', 'Sólo los que faltan (' + scopes.missing.eligible + ')'],
      ['all', 'Todos, con fecha nueva (' + scopes.all.eligible + ')'],
    ].filter(([name]) => scopes[name].eligible > 0 && (name === 'missing' || current.declaredContracts > 0));
    const scope = el('select', undefined, 'scope');
    for (const [name, label] of choices) { const option = el('option', label); option.value = name; option.setAttribute('value', name); scope.append(option); }
    const selected = () => choices.length > 1 ? String(scope.value || choices[0][0]) : choices[0][0];
    const summary = el('p', undefined, 'scope-summary'), tableHost = el('div', undefined, 'scope-areas');
    const draw = () => {
      const chosen = scopes[selected()];
      summary.textContent = 'Se incluyen ' + plural(chosen.eligible, 'contrato adoptado activo', 'contratos adoptados activos') + ', cada uno con el área que hoy figura en su legajo.'
        + (selected() === 'all' && current.declaredContracts > 0 ? ' Los que ya tenían una declaración pasan a regirse por esta: los días anteriores a la nueva fecha dejan de estar acreditados.' : '');
      tableHost.replaceChildren(areaTable(chosen.areas, 'Contratos a declarar por área'));
    };
    if (choices.length > 1) { box.append(field('Contratos a incluir', scope)); scope.addEventListener('change', draw); }
    draw();
    box.append(summary, tableHost);
    const date = el('input', undefined, 'date');
    date.setAttribute('type', 'date'); date.setAttribute('max', current.today); date.setAttribute('required', '');
    date.value = current.today;
    const reference = el('textarea', undefined, 'reference');
    reference.setAttribute('rows', '3'); reference.setAttribute('maxlength', '500');
    const confirm = el('input', undefined, 'confirm');
    confirm.setAttribute('type', 'checkbox');
    const confirmLabel = el('label', undefined, undefined, 'ae-confirm');
    confirmLabel.append(confirm, el('span', 'Revisé los totales por área y la fecha. Entiendo que los días anteriores a esa fecha no quedan acreditados.'));
    const submit = el('button', 'Preparar declaración', 'submit', 'button primary');
    submit.setAttribute('type', 'button');
    submit.addEventListener('click', async () => {
      const payload = {action: 'propose', authorizationReference: String(reference.value ?? '').trim(), effectiveFrom: String(date.value ?? ''),
        previewVersion: scopes[selected()].version, scope: selected()};
      if (!confirm.checked) { message('Marcá la confirmación antes de preparar la declaración.'); confirm.focus(); return; }
      try { validateAreaEffectivityCommand(payload, {today: current.today}); }
      catch (error) { message(error.message); (areaEffectivityDay(payload.effectiveFrom) && payload.effectiveFrom <= current.today ? reference : date).focus(); return; }
      await send(payload, 'Declaración preparada. Ahora otra persona con permiso de aprobación tiene que revisarla.');
    });
    box.append(
      field('Rige desde', date, 'Fecha desde la que el municipio declara que cada contrato pertenece a su área. No puede ser futura.'),
      field('Referencia documental', reference, 'Nota, resolución o expediente que respalda la declaración. Entre 10 y 500 caracteres.'),
      confirmLabel, submit);
    return box;
  }

  function renderHistory(history) {
    const box = el('section', undefined, 'history', 'ae-card');
    box.append(el('h4', 'Declaraciones decididas'));
    const list = el('ul');
    for (const item of history) {
      const text = STATUS[item.status] + ' · rige desde ' + day(item.effectiveFrom) + ' · ' + plural(item.itemCount, 'contrato', 'contratos')
        + (item.status === 'approved' ? ' · sigue rigiendo para ' + item.contractsInForce : '')
        + ' · preparó ' + item.proposedBy + ' · decidió ' + item.reviewedBy + ' el ' + instant(item.reviewedAt)
        + ' · referencia: ' + item.authorizationReference;
      list.append(el('li', text, 'history-item'));
    }
    box.append(list);
    return box;
  }

  function render() {
    content.replaceChildren();
    if (!state) return;
    const overview = el('section', undefined, 'overview', 'ae-card');
    overview.append(el('h4', 'Situación actual'));
    const total = state.preview.scopes.all.eligible, missing = state.preview.scopes.missing.eligible;
    overview.append(el('p', state.declaredContracts === 0
      ? 'Todavía no hay ninguna declaración aprobada: la asistencia por área no puede asignar a ningún contrato adoptado.'
      : plural(state.declaredContracts, 'contrato tiene', 'contratos tienen') + ' una declaración vigente, de ' + total + ' en condiciones de ser declarados.'
        + (missing > 0 ? ' Faltan ' + missing + '.' : ' No falta ninguno.'), 'summary'));
    const excludedList = exclusions(state.preview.excluded);
    if (excludedList) overview.append(excludedList);
    content.append(overview);
    if (state.pending) content.append(renderPending(state.pending, state.permissions));
    else if (state.permissions.canPropose && total > 0) content.append(renderPropose(state));
    else if (!state.permissions.canPropose) content.append(el('p', 'Tu cuenta puede revisar declaraciones, pero no prepararlas.', 'readonly'));
    if (state.history.length) content.append(renderHistory(state.history));
  }

  async function load(after) {
    if (busy) return;
    busy = true; refresh.disabled = true; const mine = ++generation;
    if (!after) message('Consultando…');
    try {
      const data = validateAreaEffectivityResponse(await call('GET'), {resource: 'state'});
      if (mine !== generation) return;
      state = data; render();
      message(after || 'Estado actualizado.');
    } catch (error) {
      if (mine !== generation) return;
      if (error?.status === 401 || error?.status === 403) { state = null; render(); }
      message((after ? after + ' ' : '') + errorText(error, false));
    } finally { busy = false; refresh.disabled = false; }
  }
  async function send(payload, done) {
    if (busy) return;
    const serialized = JSON.stringify(payload);
    if (!attempt || attempt.serialized !== serialized) attempt = {serialized, key: createKey()};
    busy = true; refresh.disabled = true; message('Enviando…');
    let outcome = null, failure = null;
    try { outcome = validateAreaEffectivityResponse(await call('POST', payload, attempt.key), {resource: 'receipt', command: payload}); }
    catch (error) { failure = error; }
    busy = false; refresh.disabled = false;
    if (outcome) {
      attempt = null;
      if (typeof doc.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function')
        doc.dispatchEvent(new globalThis.CustomEvent('mc:attendance-area-effectivity-changed', {detail: {status: outcome.declaration.status}}));
      await load(done);
      return;
    }
    // Un rechazo definitivo libera la clave; una falla de red la conserva para repetir el mismo envío.
    if (failure?.status && failure.status !== 503) attempt = null;
    const text = errorText(failure, true);
    if ([409, 404].includes(failure?.status)) await load(text); else message(text);
  }

  refresh.addEventListener('click', () => load());
  root.addEventListener('toggle', () => { if (root.open && !state && !busy) load(); });
  return {refresh: () => load(), get state() { return state; }};
}

if (typeof document !== 'undefined') mountAreaEffectivity(document.querySelector('[data-area-effectivity]'));
