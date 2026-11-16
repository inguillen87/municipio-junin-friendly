import {
  validateExpectedDevicesQuery, validateExpectedDevicesResponse,
  expectedDevicesCommandCapability, expectedDevicesAreaKey,
  expectedDevicesReasonOptions, buildExpectedDevicesCommand,
} from './attendance-expected-devices-model.js';

const ENDPOINT = '/api/internal-attendance-expected-devices';
const READ = 'attendance.area.read';
const STATES = Object.freeze({ pending: 'En revisión', proposed: 'En revisión', approved: 'Aprobada', rejected: 'Rechazada', retired: 'Retirada' });
const ACTIONS = Object.freeze({ propose: 'Registrar propuesta', approve: 'Aprobar declaración', reject: 'Rechazar propuesta', retire: 'Retirar declaración' });
const ATOMIC_REJECTIONS = new Set([
  'INPUT_INVALID', 'QUERY_INVALID', 'FORBIDDEN', 'INDEPENDENT_REQUIRED', 'ACTOR_REQUIRED',
  'SCOPE_CHANGED', 'VERSION_CONFLICT', 'OVERLAP', 'SOURCE_BLOCKED', 'STATE_INVALID',
].map(code => 'ATTENDANCE_EXPECTED_DEVICES_' + code));
const individuallyUsable = value => !!value && value.contracts.length > 0 && value.devices.length > 0
  && (value.complete || value.blockerCodes.length === 1 && value.blockerCodes[0] === 'AREA_HISTORY_UNRESOLVED');
const node = (doc, tag, text, className) => {
  const value = doc.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
};
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const principalKey = principal => JSON.stringify([
  principal.tenantId, principal.membershipId, principal.actorPersonId,
  principal.sessionId, principal.sessionVersion, principal.sourceBindingId, principal.scopeVersion,
]);
const areaFromScope = scope => ({ organizationUnitSourceId: scope.organizationUnitSourceId, sectorSourceId: scope.sectorSourceId });

function errorText(error, pending) {
  if (error?.code === 'ATTENDANCE_EXPECTED_DEVICES_ACCESS_CHANGED') return 'Cambió la cuenta, la sesión o el alcance. Volvé a verificar el acceso; un envío pendiente conserva su identidad original.';
  if (error?.status === 401) return 'La sesión venció. Ingresá de nuevo para consultar el padrón.';
  if (error?.status === 403) return 'Tu cuenta no tiene permiso para esta operación o esta área. Se retiraron los datos de la pantalla.';
  if (pending) return 'No se confirmó el envío. Consultá el mismo intento antes de continuar; se conserva exactamente su contenido.';
  if (error?.code === 'ATTENDANCE_EXPECTED_DEVICES_RESPONSE_INVALID') return 'La respuesta no coincide con las fuentes o el alcance consultados. No se mostraron datos sin verificar.';
  if (error?.code === 'ATTENDANCE_EXPECTED_DEVICES_NOT_FOUND') return 'No se encontró la declaración dentro del área autorizada. Actualizá el listado.';
  if (error?.code === 'ATTENDANCE_EXPECTED_DEVICES_OVERLAP') return 'La vigencia se superpone con otra declaración aprobada. Revisá los tramos antes de preparar otra propuesta.';
  if (error?.code === 'ATTENDANCE_EXPECTED_DEVICES_SOURCE_BLOCKED') return 'Falta una fuente verificada de contrato, área, vigencia o dispositivos. Completá esa fuente antes de preparar otra propuesta.';
  if (error?.status === 503 || error?.status === 404 && !pending) return 'El padrón todavía no está disponible. Está pendiente de habilitación o recuperación del servicio. No se confirmó ningún cambio.';
  if (error?.status === 409) return 'Cambió la versión, la pertenencia al área o el catálogo. Actualizá las fuentes antes de preparar otra propuesta.';
  if (error?.status === 400 || error?.status === 422) return 'No se aceptó la declaración. Revisá el área, el contrato, las fechas y los dispositivos contra sus fuentes autorizadas.';
  return 'No se pudo verificar la respuesta completa. Actualizá el acceso para volver a consultar.';
}

/** A separate area-scoped reader: it never starts or queries the global clocks dashboard. */
export function mountAttendanceExpectedDevices(container, options = {}) {
  if (!container) return null;
  const doc = options.document || globalThis.document;
  const win = options.window || globalThis.window;
  const fetchImpl = options.fetch || globalThis.fetch;
  const createKey = options.createKey || (() => globalThis.crypto.randomUUID());
  const host = node(doc, 'div', undefined, 'aed');
  host.innerHTML = `<p data-aed-status class="aed-status" role="status" aria-live="polite">Verificando acceso al padrón…</p>
    <div class="aed-actions"><button type="button" data-aed-access>Verificar acceso y actualizar</button><a data-aed-login href="/acceso?next=%2Fasistencia-dispositivos" hidden>Ingresar de nuevo</a></div>
    <div data-aed-workspace class="aed-stack" hidden>
      <div class="aed-boundary"><strong>Declaración de dispositivos esperados</strong><p>La propuesta indica dónde debe marcar el contrato durante la vigencia elegida. Las marcaciones recibidas no completan esta declaración. La revisión corresponde a otra persona autorizada.</p></div>
      <p data-aed-identity class="aed-note" hidden>Falta el vínculo verificado de la persona que opera. La cuenta puede consultar sus áreas autorizadas; no puede preparar ni decidir declaraciones.</p>
      <fieldset data-aed-area-fields><legend>1. Elegir área</legend><label>Repartición y sector<select data-aed-area><option value="">Elegir área autorizada…</option></select></label><p data-aed-area-label class="aed-note">Elegí un área para consultar sus declaraciones.</p><div class="aed-actions"><button type="button" data-aed-load-area>Consultar área</button></div></fieldset>
      <div data-aed-content class="aed-stack" hidden>
        <section class="aed-card" aria-label="Declaraciones del área"><h2>Declaraciones registradas</h2><p class="aed-note">Incluye las vigencias conservadas del área seleccionada. Cada declaración muestra su propia repartición y sector.</p><form data-aed-list-filter class="aed-grid"><label>Estado<select data-aed-list-status><option value="all">Todos los estados</option><option value="proposed">En revisión</option><option value="approved">Aprobadas</option><option value="rejected">Rechazadas</option><option value="retired">Retiradas</option></select></label><div class="aed-actions"><button type="submit" data-aed-list-refresh>Actualizar listado</button></div></form><div data-aed-records></div><p data-aed-page class="aed-note"></p><div class="aed-actions"><button type="button" data-aed-previous>Anterior</button><button type="button" data-aed-next>Siguiente</button></div></section>
        <fieldset data-aed-proposal-fields><legend>2. Preparar una declaración</legend><div class="aed-grid"><label>Vigencia desde<input type="date" data-aed-valid-from required></label><label>Vigencia hasta, inclusive<input type="date" data-aed-valid-until required></label></div><div class="aed-actions"><button type="button" data-aed-choices>Consultar contratos y dispositivos</button></div><p data-aed-source class="aed-note">Elegí ambas fechas. Los contratos se consultan sólo dentro del área y la vigencia indicadas.</p><div data-aed-choices-content hidden><label>Contrato autorizado<select data-aed-contract><option value="">Elegir contrato…</option></select></label><fieldset data-aed-device-fields><legend>Dispositivos esperados</legend><div data-aed-devices></div></fieldset><label class="aed-check"><input type="checkbox" data-aed-complete>La selección contiene todos los dispositivos esperados para este contrato, área y vigencia, según la documentación autorizada.</label><label>Motivo<select data-aed-propose-reason-code></select></label><label>Fundamento de la propuesta<textarea data-aed-propose-reason rows="3" minlength="10" maxlength="500"></textarea></label><p class="aed-note">Indicá la referencia documental y el motivo, sin agregar datos personales. Entre 10 y 500 caracteres.</p><div class="aed-actions"><button type="button" data-aed-prepare>Revisar propuesta</button></div></div></fieldset>
        <section data-aed-detail class="aed-card" hidden aria-label="Detalle e historial"><h2>Detalle e historial</h2><div data-aed-detail-facts></div><h3>Historial de decisiones</h3><ol data-aed-history class="aed-timeline"></ol><p data-aed-review-note class="aed-note"></p><fieldset data-aed-decision-fields><legend>Revisión independiente</legend><label>Decisión<select data-aed-decision><option value="">Elegir decisión…</option></select></label><label data-aed-retire-date-field hidden>Retirar desde, inclusive<input type="date" data-aed-retire-date></label><label>Motivo<select data-aed-decision-reason-code></select></label><label>Fundamento de la decisión<textarea data-aed-decision-reason rows="3" minlength="10" maxlength="500"></textarea></label><div class="aed-actions"><button type="button" data-aed-prepare-decision>Revisar decisión</button></div></fieldset></section>
        <section data-aed-comparison class="aed-comparison" hidden aria-label="Revisión antes de registrar"><h3>Revisar antes de registrar</h3><div data-aed-comparison-facts></div><p data-aed-comparison-action></p><label class="aed-check"><input type="checkbox" data-aed-confirm>Revisé el contrato, la repartición y el sector, la vigencia, todos los dispositivos y el fundamento de esta operación.</label><div class="aed-actions"><button type="button" data-aed-send class="primary">Registrar propuesta</button><button type="button" data-aed-cancel>Volver a editar</button></div></section>
      </div>
    </div>
    <section data-aed-recovery class="aed-card" hidden><h2>Envío sin confirmación</h2><p>El envío puede haberse registrado. El contenido permanece bloqueado hasta consultar el comprobante del mismo intento.</p><div class="aed-actions"><button type="button" data-aed-recover>Consultar el mismo intento</button><button type="button" data-aed-retry hidden>Reintentar el mismo envío</button></div></section>
    <p data-aed-receipt role="status" hidden></p>`;
  container.replaceChildren(host);
  const $ = key => host.querySelector('[data-aed-' + key + ']');
  let boot = null, area = null, choices = null, listing = null, detail = null;
  let prepared = null, attempt = null, receipt = null, notFound = false, attemptUncertain = false;
  let busy = false, stopped = false, seq = 0, controller = null;
  const live = () => !stopped && !doc.hidden && host.isConnected;
  const can = capability => live() && boot?.principal.capabilities.includes(capability)
    && (!['attendance.area.devices.propose', 'attendance.area.devices.approve'].includes(capability) || boot.principal.actorPersonId !== null);
  const status = (text, state = 'ready') => { $('status').textContent = text; $('status').dataset.state = state; };
  const option = (label, value) => { const element = node(doc, 'option', label); element.value = value; return element; };
  const fillReasons = (target, command) => {
    target.replaceChildren(option('Elegir motivo…', ''));
    for (const reason of expectedDevicesReasonOptions(command)) target.append(option(reason.label, reason.value));
  };
  function controls() {
    const locked = busy || !!attempt || !!prepared || !boot;
    $('access').disabled = busy || !live();
    $('area-fields').disabled = locked;
    $('load-area').disabled = locked || !$('area').value;
    $('proposal-fields').disabled = locked || !area || !can('attendance.area.devices.propose');
    $('choices').disabled = locked || !area || !can('attendance.area.devices.propose');
    $('list-refresh').disabled = locked || !area;
    $('list-status').disabled = locked || !area;
    $('previous').disabled = locked || !listing || listing.offset === 0;
    $('next').disabled = locked || !listing || listing.offset + listing.limit >= listing.total;
    $('decision-fields').disabled = locked || !detail || !can('attendance.area.devices.approve');
    $('send').disabled = busy || !!attempt || !prepared || !$('confirm').checked || !can(expectedDevicesCommandCapability(prepared.command));
    $('cancel').disabled = busy || !!attempt;
    $('confirm').disabled = busy || !!attempt || !prepared;
    $('recover').disabled = busy || !attempt || !boot || principalKey(boot.principal) !== attempt.accessKey;
    $('retry').disabled = $('recover').disabled || !notFound;
    $('recovery').hidden = !attempt || !!receipt;
    $('retry').hidden = !notFound || !!receipt;
    $('prepare').disabled = locked || !individuallyUsable(choices);
    for (const button of $('records').querySelectorAll('[data-aed-open]')) button.disabled = locked || !area;
    host.setAttribute('aria-busy', String(busy));
  }
  function invalidatePreparation() {
    if (attempt) return;
    prepared = null;
    $('comparison').hidden = true;
    $('comparison-facts').replaceChildren();
    $('confirm').checked = false;
    controls();
  }
  function clearChoices() {
    choices = null;
    $('choices-content').hidden = true;
    $('contract').replaceChildren(option('Elegir contrato…', ''));
    $('devices').replaceChildren();
    $('complete').checked = false;
    $('source').textContent = 'Elegí ambas fechas. Los contratos se consultan sólo dentro del área y la vigencia indicadas.';
  }
  function clearDetail() {
    detail = null;
    $('detail').hidden = true;
    $('detail-facts').replaceChildren();
    $('history').replaceChildren();
    $('decision').replaceChildren(option('Elegir decisión…', ''));
    $('decision-reason').value = '';
    $('retire-date').value = '';
    $('retire-date-field').hidden = true;
    fillReasons($('decision-reason-code'), 'approve');
  }
  function clearViews() {
    boot = null; area = null; listing = null; prepared = null; receipt = null;
    $('workspace').hidden = true; $('content').hidden = true; $('comparison').hidden = true;
    $('comparison-facts').replaceChildren(); $('records').replaceChildren();
    $('receipt').hidden = true; $('receipt').textContent = '';
    $('area').replaceChildren(option('Elegir área autorizada…', ''));
    $('area-label').textContent = 'Elegí un área para consultar sus declaraciones.';
    $('valid-from').value = ''; $('valid-until').value = ''; $('propose-reason').value = '';
    $('confirm').checked = false; $('page').textContent = '';
    clearChoices(); clearDetail();
  }
  function suspend(message = 'Se retiraron los datos de la pantalla. Verificá el acceso para consultar de nuevo.') {
    if (attempt) attemptUncertain = true;
    seq++; controller?.abort(); controller = null; busy = false;
    clearViews(); status(message, 'blocked'); controls();
  }
  async function request(query, commandAttempt = null) {
    if (!live()) throw Object.assign(Error('not_visible'), { name: 'AbortError' });
    let url = ENDPOINT, requestOptions = { method: 'GET' };
    if (commandAttempt) requestOptions = {
      method: 'POST', body: commandAttempt.serialized,
      headers: { 'Content-Type': 'application/json', 'idempotency-key': commandAttempt.key },
    };
    else {
      const normalized = validateExpectedDevicesQuery(query);
      url += '?' + new URLSearchParams(Object.entries(normalized).filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]));
    }
    const response = await fetchImpl(url, {
      ...requestOptions, credentials: 'same-origin', cache: 'no-store', signal: controller?.signal,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store', ...requestOptions.headers },
    });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024) throw Error('response_too_large');
    let value;
    try { value = JSON.parse(raw); } catch { throw Object.assign(Error('invalid_response'), { status: response.status }); }
    if (!response.ok || value?.ok !== true) throw Object.assign(Error('request_failed'), {
      status: response.status, code: value?.code,
      // Once any transmission was uncertain, even a later atomic rejection may
      // refer to a replay while the first request committed. Keep its key/body.
      atomicRejection: !!commandAttempt && !attemptUncertain && value?.ok === false
        && [400, 403, 409, 422].includes(response.status) && ATOMIC_REJECTIONS.has(value.code),
    });
    const result = validateExpectedDevicesResponse(value.data, commandAttempt
      ? { resource: 'command', command: commandAttempt.body, attemptKey: commandAttempt.key }
      : { resource: query.resource, query, ...(query.resource === 'attempt' && attempt ? { command: attempt.body, attemptKey: attempt.key } : {}) });
    if (boot && principalKey(result.principal) !== principalKey(boot.principal) || attempt && principalKey(result.principal) !== attempt.accessKey) {
      throw Object.assign(Error('access_changed'), { status: 403, code: 'ATTENDANCE_EXPECTED_DEVICES_ACCESS_CHANGED' });
    }
    return result;
  }
  async function verifyAccess() {
    const next = await request({ resource: 'bootstrap' });
    const nextKey = principalKey(next.principal);
    if (!next.principal.capabilities.includes(READ)) throw Object.assign(Error('denied'), { status: 403 });
    if (boot && principalKey(boot.principal) !== nextKey || attempt && attempt.accessKey !== nextKey) {
      throw Object.assign(Error('access_changed'), { status: 403, code: 'ATTENDANCE_EXPECTED_DEVICES_ACCESS_CHANGED' });
    }
    boot = next;
    $('login').hidden = true;
  }
  async function perform(work) {
    if (!live() || busy) return;
    const generation = ++seq;
    busy = true; controller = new AbortController(); controls();
    const timer = setTimeout(() => controller?.abort(), 30000);
    try { await work(() => generation === seq && live()); }
    catch (error) {
      if (generation === seq && live()) {
        if (error.atomicRejection) {
          attempt = null; notFound = false; attemptUncertain = false;
          clearViews();
        } else if (attempt) attemptUncertain = true;
        invalidatePreparation();
        if ([401, 403].includes(error.status)) { clearViews(); $('login').hidden = error.status !== 401; }
        status(errorText(error, !!attempt) + (error.atomicRejection ? ' Verificá el acceso y releé el área antes de corregir el contenido.' : ''), error.status === 503 ? 'unavailable' : [401, 403].includes(error.status) ? 'denied' : attempt ? 'uncertain' : 'blocked');
      }
    } finally {
      clearTimeout(timer);
      if (generation === seq) { busy = false; controller = null; controls(); }
    }
  }
  function showBootstrap() {
    $('area').replaceChildren(option('Elegir área autorizada…', ''));
    for (const scope of boot.principal.areaScopes) $('area').append(option(scope.areaLabel, scope.scopeId));
    $('workspace').hidden = false;
    $('identity').hidden = boot.principal.actorPersonId !== null;
    status(boot.principal.areaScopes.length ? 'Acceso verificado. Elegí un área autorizada.' : 'No tenés áreas autorizadas disponibles. No se declaró completo ningún padrón.', boot.principal.areaScopes.length ? 'ready' : 'blocked');
  }
  function refresh() {
    return perform(async valid => {
      const originalAttempt = attempt;
      clearViews(); attempt = originalAttempt;
      await verifyAccess();
      if (!valid()) return;
      showBootstrap();
      if (attempt) status('Acceso verificado. Hay un envío pendiente: consultá el mismo intento.', 'uncertain');
    });
  }
  function selectedArea() {
    const scope = boot?.principal.areaScopes.find(item => item.scopeId === $('area').value);
    if (!scope) throw Object.assign(Error('invalid_area'), { status: 400 });
    return { ...areaFromScope(scope), label: scope.areaLabel, scopeId: scope.scopeId };
  }
  function facts(parent, record) {
    const dl = node(doc, 'dl', undefined, 'aed-facts');
    for (const [label, value] of [
      ['Contrato', record.contractLabel], ['Repartición y sector', record.areaLabel],
      ['Vigencia desde', record.validFrom], ['Vigencia hasta', record.validUntil ?? 'Sin fecha final declarada'],
      ['Estado', STATES[record.status] ?? record.status], ['Revisión', record.version],
    ]) if (value !== undefined) dl.append(node(doc, 'dt', label), node(doc, 'dd', String(value)));
    parent.append(dl);
    const devices = node(doc, 'ul', undefined, 'aed-list');
    for (const device of record.devices) devices.append(node(doc, 'li', device.label + ' · ' + device.siteLabel));
    parent.append(node(doc, 'h4', 'Dispositivos declarados'), devices);
    if (record.retiredEffectiveFrom) parent.append(node(doc, 'p', 'Retirada desde ' + record.retiredEffectiveFrom + ', inclusive.'));
  }
  function showList() {
    $('records').replaceChildren();
    const { records } = listing;
    if (!records.length) $('records').append(node(doc, 'p', 'No hay declaraciones registradas para este filtro. Esto no acredita que el padrón esté completo.', 'aed-note'));
    for (const record of records) {
      const card = node(doc, 'article', undefined, 'aed-card');
      card.append(node(doc, 'h3', record.contractLabel));
      facts(card, record);
      const open = node(doc, 'button', 'Consultar detalle e historial');
      open.type = 'button'; open.setAttribute('data-aed-open', record.id);
      open.addEventListener('click', () => openDetail(record.id));
      card.append(open); $('records').append(card);
    }
    $('page').textContent = listing.total === 0 ? '0 declaraciones registradas.'
      : 'Mostrando ' + (listing.offset + 1) + ' a ' + (listing.offset + records.length) + ' de ' + listing.total + ' declaraciones.';
    controls();
  }
  async function readList(offset, valid) {
    if (!area) return;
    const query = { resource: 'list', area: areaFromScope(area), status: $('list-status').value || 'all', limit: 20, offset };
    const response = await request(query);
    await verifyAccess();
    if (!valid()) return;
    listing = response; showList();
  }
  function loadArea() {
    return perform(async valid => {
      if (attempt || prepared) return;
      await verifyAccess(); if (!valid()) return;
      area = selectedArea(); clearChoices(); clearDetail(); listing = null;
      $('records').replaceChildren(); $('content').hidden = false;
      $('area-label').textContent = area.label;
      await readList(0, valid);
      if (valid()) status('Área consultada: ' + area.label + '. Elegí la vigencia para preparar una declaración.');
    });
  }
  function listPage(offset = 0) {
    return perform(async valid => {
      if (!area || attempt || prepared) return;
      await verifyAccess(); if (!valid()) return;
      clearDetail(); await readList(offset, valid);
      if (valid()) status('Listado actualizado para ' + area.label + '.');
    });
  }
  function loadChoices() {
    return perform(async valid => {
      if (!area || attempt || prepared) return;
      clearChoices();
      if (!$('valid-from').value || !$('valid-until').value || $('valid-from').value > $('valid-until').value) {
        status('Indicá una vigencia completa: desde y hasta, con la fecha final igual o posterior a la inicial.', 'blocked'); return;
      }
      if ((Date.parse($('valid-until').value) - Date.parse($('valid-from').value)) / 86400000 > 366) {
        status('El rango no puede superar 366 días entre ambas fechas. Consultá una vigencia más acotada.', 'blocked'); return;
      }
      await verifyAccess(); if (!valid()) return;
      const query = { resource: 'choices', area: areaFromScope(area), validFrom: $('valid-from').value, validUntil: $('valid-until').value };
      const response = await request(query); await verifyAccess();
      if (!valid()) return;
      if (!response.complete && !individuallyUsable(response)) {
        const technical = response.blockerCodes.includes('AREA_POPULATION_TECHNICAL_LIMIT');
        status(technical ? 'La población supera el límite técnico de esta consulta. No se recortó el padrón ni se habilitó una declaración.'
          : 'No hay contratos con pertenencia verificada y dispositivos disponibles para esta vigencia. No se puede preparar la declaración.', 'blocked');
        $('source').textContent = technical ? 'La consulta necesita una fuente acotada y completa antes de continuar.'
          : 'Fuentes incompletas o pendientes de aprobación. Elegí otro rango documentado o completá la fuente autorizada.'; return;
      }
      choices = response;
      for (const contract of choices.contracts) $('contract').append(option(contract.label + ' · ' + contract.areaLabel, contract.id));
      for (const device of choices.devices) {
        const label = node(doc, 'label', undefined, 'aed-check');
        const input = node(doc, 'input'); input.type = 'checkbox'; input.value = device.id;
        input.setAttribute('data-aed-device', device.id); input.addEventListener('change', invalidatePreparation);
        label.append(input, node(doc, 'span', device.label + ' · ' + device.siteLabel)); $('devices').append(label);
      }
      $('choices-content').hidden = false;
      $('source').textContent = choices.contracts.length + ' contratos autorizados y ' + choices.devices.length + ' dispositivos disponibles para ' + area.label + ', del ' + query.validFrom + ' al ' + query.validUntil + '.';
      if (!choices.complete) {
        const partial = 'La población del área está incompleta. Sólo se muestran contratos con pertenencia verificada; esto no habilita cálculo de ausencias.';
        $('source').textContent += ' ' + partial;
        status(partial, 'blocked');
      } else status(choices.contracts.length && choices.devices.length ? 'Fuentes verificadas. Seleccioná el contrato y todos sus dispositivos esperados.' : 'La consulta no ofrece contratos o dispositivos para declarar. No se deduce un padrón vacío completo.', choices.contracts.length && choices.devices.length ? 'ready' : 'blocked');
    });
  }
  function stage(command, record) {
    prepared = freeze(structuredClone(command));
    $('comparison-facts').replaceChildren(); facts($('comparison-facts'), record);
    $('comparison-facts').append(node(doc, 'p', 'Fundamento: ' + command.reason));
    if (command.command === 'retire') $('comparison-facts').append(node(doc, 'p', 'Retirar desde ' + command.payload.effectiveFrom + ', inclusive.'));
    $('comparison-action').textContent = command.command === 'propose'
      ? 'Se registrará una propuesta pendiente de revisión por otra persona.'
      : 'Se registrará la decisión sobre esta revisión exacta. Se conservará el historial.';
    $('comparison').hidden = false; $('confirm').checked = false;
    $('send').textContent = ACTIONS[command.command];
    controls();
  }
  function prepareProposal() {
    if (busy || attempt || prepared || !individuallyUsable(choices) || !area || !can('attendance.area.devices.propose')) return;
    const contract = choices.contracts.find(item => item.id === $('contract').value);
    const selected = [...$('devices').querySelectorAll('[data-aed-device]')].filter(item => item.checked).map(item => item.value);
    if (!contract || !selected.length || selected.length > 100 || new Set(selected).size !== selected.length
      || selected.some(id => !choices.devices.some(device => device.id === id)) || !$('complete').checked) {
      status('Elegí un contrato y entre 1 y 100 dispositivos autorizados. Confirmá que la declaración contiene el conjunto completo.', 'blocked'); return;
    }
    try {
      const command = buildExpectedDevicesCommand({
        command: 'propose', scopeVersion: boot.principal.scopeVersion, proposalId: null, expectedVersion: 0,
        payload: { contractId: contract.id, area: areaFromScope(area), validFrom: $('valid-from').value, validUntil: $('valid-until').value,
          deviceIds: selected, subjectVersion: contract.subjectVersion, deviceCatalogVersion: choices.deviceCatalogVersion, complete: true },
        reasonCode: $('propose-reason-code').value, reason: $('propose-reason').value,
      });
      stage(command, { contractLabel: contract.label, areaLabel: contract.areaLabel, validFrom: command.payload.validFrom, validUntil: command.payload.validUntil,
        devices: selected.map(id => choices.devices.find(device => device.id === id)) });
      status('Propuesta preparada para revisión. Todavía no se registró ningún cambio.');
    } catch { status('Revisá la vigencia, el contrato, los dispositivos y el fundamento de 10 a 500 caracteres. Elegí también un motivo.', 'blocked'); }
  }
  function renderDetail() {
    const record = detail.record;
    $('detail-facts').replaceChildren(); facts($('detail-facts'), record);
    $('history').replaceChildren();
    for (const event of detail.history) {
      const item = node(doc, 'li');
      item.append(node(doc, 'strong', ACTIONS[event.command] ?? event.command));
      item.append(node(doc, 'p', 'Revisión ' + event.resultingVersion + ' · ' + event.occurredAt));
      item.append(node(doc, 'p', expectedDevicesReasonOptions(event.command).find(reason => reason.value === event.reasonCode).label));
      $('history').append(item);
    }
    if (!detail.auditAvailable) $('history').append(node(doc, 'li', 'Tu cuenta no tiene acceso al historial de decisiones. Se muestra la declaración autorizada; el historial no se considera consultado.'));
    $('decision').replaceChildren(option('Elegir decisión…', ''));
    if (record.canReview && can('attendance.area.devices.approve')) {
      $('decision').append(option('Aprobar declaración', 'approve'), option('Rechazar propuesta', 'reject'));
    }
    if (record.canRetire && can('attendance.area.devices.approve')) $('decision').append(option('Retirar declaración', 'retire'));
    $('review-note').textContent = record.canReview || record.canRetire
      ? 'La decisión exige una persona autorizada distinta de quien preparó la propuesta.'
      : 'Esta revisión no admite una decisión desde tu cuenta. Quien prepara una propuesta no puede aprobarla.';
    $('detail').hidden = false; controls();
  }
  function openDetail(id) {
    return perform(async valid => {
      if (!area || attempt || prepared) return;
      clearDetail(); await verifyAccess(); if (!valid()) return;
      const response = await request({ resource: 'detail', id }); await verifyAccess();
      if (!valid()) return;
      if (response.record.id !== id || expectedDevicesAreaKey(response.record.area) !== expectedDevicesAreaKey(areaFromScope(area))) throw Error('detail_scope_changed');
      detail = response; renderDetail(); status('Detalle e historial consultados.');
    });
  }
  function prepareDecision() {
    if (busy || attempt || prepared || !detail || !area) return;
    const commandName = $('decision').value, record = detail.record;
    if (!['approve', 'reject', 'retire'].includes(commandName) || !can(expectedDevicesCommandCapability(commandName))
      || commandName === 'retire' && !record.canRetire || commandName !== 'retire' && !record.canReview) {
      status('Esta cuenta no puede registrar esa decisión sobre la revisión seleccionada.', 'blocked'); return;
    }
    try {
      const command = buildExpectedDevicesCommand({
        command: commandName, scopeVersion: boot.principal.scopeVersion, proposalId: record.id, expectedVersion: record.version,
        payload: commandName === 'retire' ? { effectiveFrom: $('retire-date').value } : null,
        reasonCode: $('decision-reason-code').value, reason: $('decision-reason').value,
      });
      stage(command, record); status('Decisión preparada. Revisá el detalle completo antes de confirmarla.');
    } catch { status('Elegí un motivo y completá el fundamento de 10 a 500 caracteres. Para retirar, indicá desde qué fecha.', 'blocked'); }
  }
  function acknowledge(response) {
    receipt = response;
    prepared = null; notFound = false;
    const record = response.record;
    $('workspace').hidden = true; $('comparison').hidden = true; $('receipt').hidden = false;
    $('receipt').textContent = (STATES[record.status] ?? record.status) + ' · ' + record.contractLabel + ' · ' + record.areaLabel + ' · revisión ' + record.version + '. Se conservó el historial. La declaración no certifica cobertura de marcaciones.';
    status(response.replayed ? 'Se recuperó el comprobante original.' : 'Operación confirmada.', 'success');
    attempt = null; attemptUncertain = false;
    controls();
  }
  function send() {
    return perform(async valid => {
      if (!attempt && (!prepared || !$('confirm').checked)) return;
      const body = attempt?.body ?? prepared;
      await verifyAccess(); if (!valid()) return;
      if (!can(expectedDevicesCommandCapability(body.command))) throw Object.assign(Error('denied'), { status: 403 });
      if (!attempt) {
        const key = createKey();
        attempt = freeze({ key, body: structuredClone(body), serialized: JSON.stringify({ operation: 'command', payload: body }), accessKey: principalKey(boot.principal) });
        attemptUncertain = false;
      } else if (!notFound) return;
      notFound = false;
      const response = await request(null, attempt); await verifyAccess();
      if (valid()) acknowledge(response);
    });
  }
  function recover() {
    return perform(async valid => {
      if (!attempt) return;
      await verifyAccess(); if (!valid()) return;
      const response = await request({ resource: 'attempt', key: attempt.key }); await verifyAccess();
      if (!valid()) return;
      if (response.found === false) { notFound = true; status('El servicio no registra este intento. Podés reintentar exactamente el mismo envío.', 'uncertain'); }
      else acknowledge(response);
    });
  }
  $('access').addEventListener('click', refresh);
  $('area').addEventListener('change', () => {
    if (attempt || busy || prepared) return;
    area = null; listing = null; clearChoices(); clearDetail();
    $('content').hidden = true; $('records').replaceChildren(); controls();
  });
  $('load-area').addEventListener('click', loadArea);
  $('list-filter').addEventListener('submit', event => { event.preventDefault(); return listPage(); });
  $('previous').addEventListener('click', () => listPage(Math.max(0, listing.offset - listing.limit)));
  $('next').addEventListener('click', () => listPage(listing.offset + listing.limit));
  $('choices').addEventListener('click', loadChoices);
  for (const key of ['valid-from', 'valid-until']) $(key).addEventListener('change', () => { if (!attempt) { clearChoices(); invalidatePreparation(); } });
  for (const key of ['contract', 'complete', 'propose-reason-code', 'propose-reason', 'decision-reason-code', 'decision-reason', 'retire-date']) {
    $(key).addEventListener('input', invalidatePreparation); $(key).addEventListener('change', invalidatePreparation);
  }
  $('decision').addEventListener('change', () => {
    invalidatePreparation();
    const command = $('decision').value;
    fillReasons($('decision-reason-code'), command || 'approve');
    $('retire-date-field').hidden = command !== 'retire'; $('retire-date').value = '';
  });
  $('prepare').addEventListener('click', prepareProposal);
  $('prepare-decision').addEventListener('click', prepareDecision);
  $('confirm').addEventListener('change', controls);
  $('cancel').addEventListener('click', invalidatePreparation);
  $('send').addEventListener('click', send); $('retry').addEventListener('click', send); $('recover').addEventListener('click', recover);
  const visibility = () => { if (doc.hidden) suspend(); };
  const capabilities = () => { if (boot && !busy) suspend('Cambió el acceso. Verificá el área y la sesión antes de continuar.'); };
  function destroy() {
    if (stopped) return;
    stopped = true; suspend('Página cerrada.'); attempt = null;
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('municontrol:capabilities-ready', capabilities);
    win?.removeEventListener('pagehide', destroy);
  }
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('municontrol:capabilities-ready', capabilities);
  win?.addEventListener('pagehide', destroy, { once: true });
  fillReasons($('propose-reason-code'), 'propose'); fillReasons($('decision-reason-code'), 'approve');
  controls();
  return { ready: refresh(), refresh, destroy };
}

if (typeof document !== 'undefined') {
  const start = () => { const container = document.getElementById('attendanceExpectedDevices'); if (container) mountAttendanceExpectedDevices(container); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
