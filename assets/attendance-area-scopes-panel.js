import {
  AREA_SCOPE_ADMIN_VERSION, AREA_SCOPE_CAPABILITIES, AREA_SCOPE_CAPABILITY_LABELS,
  validateAreaScopeQuery, validateAreaScopeReadResponse, validateAreaScopeCommandResponse,
  buildAreaScopeCommand, normalizeAreaScopeReference, areaScopeReferenceValid, areaScopeIdentity,
} from './attendance-area-scopes-model.js';

const ENDPOINT = '/api/internal-attendance-area-scopes';
const READ = 'attendance.area.read';
const NO_SECTOR = 'none';
export const AREA_SCOPES_CONTEXT_EVENT = 'municontrol:area-scopes-context';
// Refusals decided before anything was written: the same content cannot succeed by sending it again.
const ATOMIC_REJECTIONS = new Set([
  'INPUT_INVALID', 'QUERY_INVALID', 'KEY_REQUIRED', 'CONTENT_TYPE', 'FORBIDDEN', 'PLATFORM_CONTEXT_REQUIRED', 'SELF_ASSIGNMENT',
  'TENANT_NOT_READY', 'STALE', 'ATTEMPT_CONFLICT', 'MEMBERSHIP_NOT_FOUND', 'MEMBERSHIP_NOT_ACTIVE', 'AREA_NOT_IN_CATALOG',
  'CATALOG_UNAVAILABLE', 'NOT_FOUND', 'CONFLICT',
].map(code => 'ATTENDANCE_AREA_SCOPE_' + code));
const MESSAGES = Object.freeze({
  SELF_ASSIGNMENT: 'No podés conceder ni retirar áreas de tu propia cuenta. Tiene que hacerlo otra persona administradora.',
  TENANT_NOT_READY: 'El municipio todavía no tiene su fuente de datos certificada para esta versión. No se pueden administrar sus áreas.',
  STALE: 'Las áreas o el catálogo cambiaron desde tu última consulta. No se registró el cambio.',
  ATTEMPT_CONFLICT: 'Este envío ya se había usado para otra operación. No se registró un cambio nuevo.',
  MEMBERSHIP_NOT_FOUND: 'No se encontró esa cuenta dentro del municipio seleccionado.',
  MEMBERSHIP_NOT_ACTIVE: 'La cuenta no está activa. Sólo se le pueden retirar áreas.',
  AREA_NOT_IN_CATALOG: 'El área elegida no figura en el catálogo aprobado del municipio. No se registró el cambio.',
  CATALOG_UNAVAILABLE: 'El catálogo de reparticiones y sectores no está disponible. No se pueden administrar áreas hasta recuperarlo.',
  NOT_FOUND: 'Esa cuenta no tiene registrada esa área.',
  CONFLICT: 'Otra operación cambió esa área al mismo tiempo. No se registró el cambio.',
  BUSY: 'Hay otra operación en curso sobre las áreas o el catálogo. Probá de nuevo en unos segundos.',
  LIMIT: 'El municipio supera el límite técnico de esta pantalla. No se mostró una lista recortada.',
  RESPONSE_INVALID: 'La respuesta no coincide con el municipio o la operación consultados. No se mostraron datos sin verificar.',
});
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
// Presentation only: the value stays ISO; an instant reads in the municipality's zone.
const INSTANT = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Mendoza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const aasInstant = value => { const ms = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(ms) ? INSTANT.format(new Date(ms)).replace(',', '') + ' h' : String(value); };
const contextOf = value => ({
  tenantId: typeof value?.tenantId === 'string' ? value.tenantId : '',
  tenantLabel: typeof value?.tenantLabel === 'string' ? value.tenantLabel : '',
  canRead: value?.canRead === true || value?.canRead === 'true',
  canManage: value?.canManage === true || value?.canManage === 'true',
  visible: value?.visible === true || value?.visible === 'true',
});

function errorText(error, uncertain) {
  const code = typeof error?.code === 'string' ? error.code.replace('ATTENDANCE_AREA_SCOPE_', '') : '';
  if (error?.status === 401) return 'La sesión venció. Ingresá de nuevo para administrar las áreas.';
  if (Object.hasOwn(MESSAGES, code)) return MESSAGES[code];
  if (error?.status === 403) return 'Tu sesión no tiene permiso para administrar las áreas de asistencia. Se retiraron los datos de la pantalla.';
  if (uncertain) return 'No se confirmó el envío. Puede haberse registrado: reintentá exactamente el mismo envío o actualizá la lista para comprobarlo.';
  if (error?.status === 503 || error?.status === 404) return 'La administración de áreas de asistencia todavía no está habilitada o no responde. No se consultó ni cambió ningún dato.';
  if (error?.status === 400 || error?.status === 422) return 'No se aceptó la operación. Revisá la cuenta, el permiso, el área y la referencia de autorización.';
  return 'No se pudo verificar la respuesta completa. Actualizá la lista para volver a consultar.';
}

/** Areas of attendance per account, for the municipality chosen in the administration filter. */
export function mountAttendanceAreaScopes(container, options = {}) {
  if (!container) return null;
  const doc = options.document || globalThis.document;
  const win = options.window || globalThis.window;
  const fetchImpl = options.fetch || globalThis.fetch;
  const createKey = options.createKey || (() => globalThis.crypto.randomUUID());
  const host = node(doc, 'div', undefined, 'aas');
  host.innerHTML = `<p data-aas-status class="aas-status" role="status" aria-live="polite">Preparando la administración de áreas…</p>
    <div class="aas-actions"><button type="button" class="button" data-aas-refresh>Actualizar lista</button><a class="button" data-aas-login href="login.html?next=administracion-plataforma.html" hidden>Ingresar de nuevo</a></div>
    <div data-aas-workspace class="aas-stack" hidden>
      <div class="aas-boundary"><strong>Qué se define acá</strong><p>Cada fila habilita un permiso de asistencia de una cuenta en un área exacta: una repartición con un sector, o esa repartición sin sector. No hay áreas generales ni heredadas. Esta pantalla no asigna el permiso: eso se hace en Usuarios y roles. Nadie puede cambiar las áreas de su propia cuenta.</p></div>
      <fieldset data-aas-account-fields><legend>1. Elegir cuenta</legend><label>Cuenta del municipio<select class="select" data-aas-account><option value="">Elegir cuenta…</option></select></label><p data-aas-account-note class="aas-note">Elegí una cuenta para ver sus áreas de asistencia.</p></fieldset>
      <div data-aas-content class="aas-stack" hidden>
        <section class="aas-card" aria-label="Áreas de asistencia de la cuenta"><h3>Áreas de asistencia de la cuenta</h3><p data-aas-warning class="aas-warning" hidden></p><p data-aas-empty class="aas-note" hidden>Esta cuenta no tiene áreas de asistencia registradas. Sin un área, sus permisos de asistencia por área no muestran ningún dato.</p><div class="table-wrap aas-table" data-aas-table tabindex="0" role="region" aria-label="Áreas de asistencia de la cuenta" hidden><table><caption class="sr-only">Áreas de asistencia de la cuenta seleccionada</caption><thead><tr><th>Permiso</th><th>Repartición</th><th>Sector</th><th>Estado</th><th>Referencia de autorización</th><th>Última modificación</th><th>Acción</th></tr></thead><tbody data-aas-rows></tbody></table></div></section>
        <fieldset data-aas-grant-fields><legend>2. Conceder un área</legend><div class="aas-grid"><label>Permiso<select class="select" data-aas-capability><option value="">Elegir permiso…</option></select></label><label>Repartición<select class="select" data-aas-unit><option value="">Elegir repartición…</option></select></label><label>Sector<select class="select" data-aas-sector><option value="">Elegir sector…</option></select></label></div><label>Referencia de autorización<textarea class="textarea" data-aas-grant-reference rows="3" minlength="10" maxlength="500"></textarea></label><p class="aas-note">Indicá el expediente, la nota o la resolución que respalda la decisión, sin datos personales. Entre 10 y 500 caracteres.</p><p data-aas-grant-note class="aas-warning" hidden></p><div class="aas-actions"><button type="button" class="button" data-aas-prepare-grant>Revisar antes de conceder</button></div></fieldset>
        <fieldset data-aas-withdraw-fields hidden><legend>Retirar un área</legend><p data-aas-withdraw-target class="aas-note"></p><label>Referencia de autorización del retiro<textarea class="textarea" data-aas-withdraw-reference rows="3" minlength="10" maxlength="500"></textarea></label><p class="aas-note">La cuenta deja de ver esa área. La fila y su historial se conservan.</p><div class="aas-actions"><button type="button" class="button danger" data-aas-prepare-withdraw>Revisar antes de retirar</button><button type="button" class="button" data-aas-cancel-withdraw>No retirar</button></div></fieldset>
        <section data-aas-confirmation class="aas-confirmation" hidden aria-label="Confirmación del cambio"><h3 data-aas-confirm-title>Revisar antes de confirmar</h3><dl data-aas-confirm-facts class="aas-facts"></dl><p data-aas-confirm-note class="aas-note"></p><label class="aas-check"><input type="checkbox" data-aas-confirm>Revisé la cuenta, el permiso, el área y la referencia de autorización.</label><div class="aas-actions"><button type="button" class="button primary" data-aas-send>Confirmar</button><button type="button" class="button" data-aas-cancel>Volver a editar</button></div></section>
      </div>
    </div>
    <section data-aas-recovery class="aas-card" hidden aria-label="Envío sin confirmación"><h3>Envío sin confirmación</h3><p class="aas-note">El cambio puede haberse registrado. Reintentar envía exactamente lo mismo: si ya estaba registrado, no se duplica.</p><div class="aas-actions"><button type="button" class="button primary" data-aas-retry>Reintentar el mismo envío</button><button type="button" class="button" data-aas-discard>Descartar y actualizar la lista</button></div></section>
    <p data-aas-receipt class="aas-receipt" role="status" hidden></p>`;
  container.replaceChildren(host);
  const $ = key => host.querySelector('[data-aas-' + key + ']');
  let context = contextOf(options.context ?? container.dataset ?? {});
  let data = null, accountId = '', withdrawing = null, prepared = null, attempt = null;
  let busy = false, stopped = false, seq = 0, controller = null;
  const live = () => !stopped && !doc.hidden && host.isConnected && context.visible;
  const status = (text, state = 'ready') => { $('status').textContent = text; $('status').dataset.state = state; };
  const option = (label, value) => { const element = node(doc, 'option', label); element.value = value; return element; };
  const account = () => data?.memberships.find(member => member.membershipId === accountId) ?? null;
  const accountScopes = () => data ? data.scopes.filter(scope => scope.membershipId === accountId) : [];
  const unitLabel = scope => scope.organizationUnitLabel ?? 'Repartición ' + scope.organizationUnitSourceId + ' (ya no figura en el catálogo)';
  const sectorLabel = scope => scope.sectorSourceId === null ? 'Sin sector' : scope.sectorLabel ?? 'Sector ' + scope.sectorSourceId + ' (ya no figura en el catálogo)';
  const accountLabel = member => member.displayName + ' · ' + member.email;
  const changeable = () => live() && context.canManage && !!data && !!account() && !account().self;

  function controls() {
    const locked = busy || !!attempt || !!prepared || !data;
    const member = account();
    $('refresh').disabled = busy || stopped;
    $('account-fields').disabled = locked;
    $('grant-fields').disabled = locked || !changeable() || !member?.grantable || !!withdrawing;
    $('prepare-grant').disabled = $('grant-fields').disabled;
    $('withdraw-fields').disabled = locked || !changeable() || !withdrawing;
    $('withdraw-fields').hidden = !withdrawing || !!prepared;
    $('send').disabled = busy || !!attempt || !prepared || !$('confirm').checked || !changeable();
    $('cancel').disabled = busy || !!attempt;
    $('confirm').disabled = busy || !!attempt || !prepared;
    const recoverable = !!attempt && attempt.tenantId === context.tenantId && live() && context.canManage;
    $('recovery').hidden = !attempt;
    $('retry').disabled = busy || !recoverable;
    $('discard').disabled = busy || !attempt;
    for (const button of $('rows').querySelectorAll('[data-aas-withdraw]')) button.disabled = locked || !changeable() || !!withdrawing;
    host.setAttribute('aria-busy', String(busy));
  }
  function clearPreparation() {
    prepared = null;
    $('confirmation').hidden = true; $('confirm-facts').replaceChildren(); $('confirm-note').textContent = ''; $('confirm').checked = false;
  }
  function clearWithdraw() { withdrawing = null; $('withdraw-reference').value = ''; $('withdraw-target').textContent = ''; }
  function clearAccount() {
    $('content').hidden = true; $('rows').replaceChildren(); $('table').hidden = true; $('empty').hidden = true;
    $('warning').hidden = true; $('warning').textContent = ''; $('grant-note').hidden = true; $('grant-note').textContent = '';
    $('grant-reference').value = ''; clearWithdraw(); clearPreparation();
  }
  function clearViews() {
    data = null; accountId = '';
    $('workspace').hidden = true; clearAccount();
    $('account').replaceChildren(option('Elegir cuenta…', ''));
    $('account-note').textContent = 'Elegí una cuenta para ver sus áreas de asistencia.';
    $('capability').replaceChildren(option('Elegir permiso…', ''));
    $('unit').replaceChildren(option('Elegir repartición…', ''));
    $('sector').replaceChildren(option('Elegir sector…', ''));
  }
  /** Withdraws every name, e-mail and reference from the screen. A pending send keeps only its own content. */
  function suspend(message = 'Se retiraron los datos de la pantalla. Actualizá la lista para consultar de nuevo.') {
    seq++; controller?.abort(); controller = null; busy = false;
    clearViews(); $('receipt').hidden = true; $('receipt').textContent = '';
    status(message, 'blocked'); controls();
  }
  async function request(commandAttempt = null) {
    if (!live()) throw Object.assign(Error('not_visible'), { name: 'AbortError' });
    const tenantId = context.tenantId;
    let url = ENDPOINT, init = { method: 'GET' };
    if (commandAttempt) init = { method: 'POST', body: commandAttempt.serialized, headers: { 'Content-Type': 'application/json', 'idempotency-key': commandAttempt.key } };
    else url += '?' + new URLSearchParams(validateAreaScopeQuery({ resource: 'scopes', tenantId }));
    const response = await fetchImpl(url, {
      ...init, credentials: 'same-origin', cache: 'no-store', signal: controller?.signal,
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store', ...init.headers },
    });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 5 * 1024 * 1024) throw Error('response_too_large');
    let value;
    try { value = JSON.parse(raw); } catch { throw Object.assign(Error('invalid_response'), { status: response.status }); }
    if (!response.ok || value?.ok !== true) throw Object.assign(Error('request_failed'), {
      status: response.status, code: typeof value?.code === 'string' ? value.code : undefined,
      atomicRejection: !!commandAttempt && value?.ok === false && [400, 403, 404, 409, 415, 422, 428].includes(response.status) && ATOMIC_REJECTIONS.has(value.code),
    });
    return commandAttempt
      ? validateAreaScopeCommandResponse(value.data, { tenantId: commandAttempt.tenantId, command: commandAttempt.body })
      : validateAreaScopeReadResponse(value.data, { tenantId });
  }
  async function perform(work) {
    if (!live() || busy) return;
    const generation = ++seq;
    busy = true; controller = new AbortController(); controls();
    const timer = setTimeout(() => controller?.abort(), 30000);
    try { await work(() => generation === seq && live()); }
    catch (error) {
      if (generation === seq && live()) {
        const sending = !!attempt;
        if (error.atomicRejection) attempt = null;
        if ([401, 403].includes(error.status)) { attempt = null; clearViews(); $('login').hidden = error.status !== 401; }
        if (!attempt) clearPreparation();
        status(errorText(error, sending && !!attempt), error.status === 401 || error.status === 403 ? 'denied' : attempt ? 'uncertain' : error.status === 503 ? 'unavailable' : 'blocked');
        // A refusal means the list on screen is no longer the one the server decides with.
        if (error.atomicRejection && ![401, 403].includes(error.status)) {
          const explanation = $('status').textContent;
          try { await read(() => generation === seq && live()); if (generation === seq && live()) status(explanation + ' Se actualizó la lista: revisala antes de volver a intentar.', 'blocked'); }
          catch { if (generation === seq && live()) { clearViews(); status(explanation + ' No se pudo actualizar la lista.', 'blocked'); } }
        }
      }
    } finally {
      clearTimeout(timer);
      if (generation === seq) { busy = false; controller = null; controls(); }
    }
  }
  function showAccounts() {
    const previous = accountId;
    $('account').replaceChildren(option('Elegir cuenta…', ''));
    for (const member of data.memberships) {
      const suffix = member.self ? ' (tu cuenta)' : member.status === 'active' ? '' : ' (cuenta no activa)';
      $('account').append(option(accountLabel(member) + suffix, member.membershipId));
    }
    $('capability').replaceChildren(option('Elegir permiso…', ''));
    for (const key of AREA_SCOPE_CAPABILITIES) $('capability').append(option(AREA_SCOPE_CAPABILITY_LABELS[key], key));
    $('unit').replaceChildren(option('Elegir repartición…', ''));
    for (const unit of data.organizationUnits) $('unit').append(option(unit.label, unit.id));
    $('sector').replaceChildren(option('Elegir sector…', ''), option('Sin sector', NO_SECTOR));
    for (const sector of data.sectors) $('sector').append(option(sector.label, sector.id));
    $('workspace').hidden = false;
    accountId = data.memberships.some(member => member.membershipId === previous) ? previous : '';
    $('account').value = accountId;
    showAccount();
  }
  function grantNote() {
    const member = account(), capability = $('capability').value;
    const missing = member && capability && !member.areaCapabilities.includes(capability);
    $('grant-note').hidden = !missing;
    $('grant-note').textContent = missing ? 'La cuenta todavía no tiene el permiso «' + AREA_SCOPE_CAPABILITY_LABELS[capability] + '». Podés registrar el área, pero no va a funcionar hasta que se lo asignen en Usuarios y roles.' : '';
  }
  function showAccount() {
    clearAccount();
    const member = account();
    if (!member) { $('account-note').textContent = 'Elegí una cuenta para ver sus áreas de asistencia.'; controls(); return; }
    $('account-note').textContent = member.self ? 'Es tu propia cuenta: podés ver sus áreas, pero tiene que cambiarlas otra persona administradora.'
      : member.status !== 'active' ? 'La cuenta no está activa: sólo se le pueden retirar áreas.'
      : !context.canManage ? 'Tu sesión puede consultar las áreas, pero no concederlas ni retirarlas.'
      : 'Rol de la cuenta: ' + member.roleKey + '.';
    const scopes = accountScopes(), active = scopes.filter(scope => scope.active);
    const warnings = [];
    if (active.some(scope => !scope.capabilityHeld)) warnings.push('Hay áreas que todavía no funcionan porque la cuenta no tiene el permiso correspondiente. Asignalo en Usuarios y roles.');
    if (active.length && member.status === 'active' && !member.areaCapabilities.includes(READ)) warnings.push('A la cuenta le falta el permiso «' + AREA_SCOPE_CAPABILITY_LABELS[READ] + '». Sin él, ninguna de sus áreas funciona.');
    if (active.some(scope => !scope.areaInCatalog)) warnings.push('Hay un área que ya no figura en el catálogo aprobado. Mientras siga vigente, la cuenta no puede usar la asistencia por área: retirala.');
    $('warning').hidden = !warnings.length; $('warning').textContent = warnings.join(' ');
    $('empty').hidden = scopes.length > 0; $('table').hidden = scopes.length === 0;
    for (const scope of scopes) {
      const row = node(doc, 'tr'); row.setAttribute('data-list-row', ''); row.setAttribute('data-aas-scope', scope.scopeId);
      const cell = (label, text) => { const td = node(doc, 'td', text); td.setAttribute('data-label', label); row.append(td); return td; };
      cell('Permiso', AREA_SCOPE_CAPABILITY_LABELS[scope.capability]);
      cell('Repartición', unitLabel(scope));
      cell('Sector', sectorLabel(scope));
      const state = cell('Estado');
      state.append(node(doc, 'span', scope.active ? 'Vigente' : 'Retirada', 'state-pill' + (scope.active ? ' is-ok' : '')));
      if (scope.active && !scope.capabilityHeld) state.append(node(doc, 'span', 'Todavía no funciona: falta asignar el permiso.', 'aas-row-note'));
      if (scope.active && !scope.areaInCatalog) state.append(node(doc, 'span', 'El área ya no figura en el catálogo.', 'aas-row-note'));
      cell('Referencia de autorización', scope.authorizationReference);
      cell('Última modificación', scope.updatedByEmail + ' · ' + aasInstant(scope.updatedAt));
      const action = cell('Acción');
      if (scope.active) {
        const button = node(doc, 'button', 'Retirar', 'button danger');
        button.type = 'button'; button.setAttribute('data-aas-withdraw', scope.scopeId);
        button.setAttribute('aria-label', 'Retirar ' + AREA_SCOPE_CAPABILITY_LABELS[scope.capability] + ' en ' + unitLabel(scope) + ' / ' + sectorLabel(scope));
        button.addEventListener('click', () => startWithdraw(scope.scopeId));
        action.append(button);
      } else action.textContent = 'Para volver a concederla, usá el paso 2.';
      $('rows').append(row);
    }
    $('content').hidden = false; grantNote(); controls();
  }
  async function read(valid) {
    const response = await request();
    if (!valid()) return;
    data = response; $('login').hidden = true; showAccounts();
  }
  function refresh() {
    return perform(async valid => {
      clearViews(); $('receipt').hidden = true; $('receipt').textContent = '';
      if (!context.tenantId) { status('Elegí un municipio en el filtro de administración para ver las áreas de asistencia de sus cuentas.', 'blocked'); return; }
      if (!context.canRead) { status('Tu sesión no tiene permiso para administrar las áreas de asistencia.', 'denied'); return; }
      await read(valid);
      if (!valid()) return;
      status(attempt ? 'Lista actualizada. Hay un envío sin confirmación: reintentalo o descartalo.'
        : 'Lista actualizada' + (context.tenantLabel ? ' para ' + context.tenantLabel : '') + '. ' + (data.memberships.length ? 'Elegí una cuenta.' : 'El municipio no tiene cuentas activas.'), attempt ? 'uncertain' : 'ready');
    });
  }
  function facts(command, member) {
    const scope = { ...command.area, organizationUnitLabel: data.organizationUnits.find(unit => unit.id === command.area.organizationUnitSourceId)?.label ?? null,
      sectorLabel: command.area.sectorSourceId === null ? null : data.sectors.find(sector => sector.id === command.area.sectorSourceId)?.label ?? null };
    const entries = [['Cuenta', accountLabel(member)], ['Permiso', AREA_SCOPE_CAPABILITY_LABELS[command.capability]], ['Repartición', unitLabel(scope)],
      ['Sector', sectorLabel(scope)], ['Referencia de autorización', command.authorizationReference]];
    $('confirm-facts').replaceChildren();
    for (const [label, value] of entries) $('confirm-facts').append(node(doc, 'dt', label), node(doc, 'dd', value));
  }
  function stage(command, note) {
    const member = account();
    prepared = freeze(structuredClone(command));
    facts(prepared, member);
    $('confirm-title').textContent = command.operation === 'grant' ? 'Revisar antes de conceder el área' : 'Revisar antes de retirar el área';
    $('confirm-note').textContent = note;
    $('send').textContent = command.operation === 'grant' ? 'Conceder el área' : 'Retirar el área';
    $('send').className = command.operation === 'grant' ? 'button primary' : 'button danger';
    $('confirm').checked = false; $('confirmation').hidden = false; controls();
  }
  function build(operation, capability, area, reference) {
    const text = normalizeAreaScopeReference(reference);
    if (!areaScopeReferenceValid(text)) { status('Escribí la referencia de autorización: entre 10 y 500 caracteres, sin símbolos especiales como < o >.', 'blocked'); return null; }
    try { return buildAreaScopeCommand({ operation, membershipId: accountId, capability, area, authorizationReference: text, scopeSetVersion: data.scopeSetVersion }); }
    catch { status('Revisá la cuenta, el permiso, el área y la referencia de autorización.', 'blocked'); return null; }
  }
  function prepareGrant() {
    const member = account();
    if (busy || attempt || prepared || withdrawing || !changeable() || !member?.grantable) return;
    const capability = $('capability').value, unit = $('unit').value, sector = $('sector').value;
    if (!AREA_SCOPE_CAPABILITIES.includes(capability) || !data.organizationUnits.some(item => item.id === unit)
      || sector !== NO_SECTOR && !data.sectors.some(item => item.id === sector)) {
      status('Elegí el permiso, la repartición y el sector. Si el área no tiene sector, elegí «Sin sector».', 'blocked'); return;
    }
    const area = { organizationUnitSourceId: unit, sectorSourceId: sector === NO_SECTOR ? null : sector };
    if (accountScopes().some(scope => scope.active && areaScopeIdentity(scope) === areaScopeIdentity({ membershipId: accountId, capability, ...area }))) {
      status('La cuenta ya tiene concedida esa área para ese permiso. No hace falta registrarla de nuevo.', 'blocked'); return;
    }
    const command = build('grant', capability, area, $('grant-reference').value);
    if (!command) return;
    stage(command, member.areaCapabilities.includes(capability)
      ? 'Al confirmar, la cuenta podrá usar ese permiso en esa área exacta. El cambio queda registrado con tu usuario y la referencia.'
      : 'La cuenta todavía no tiene ese permiso: el área queda registrada, pero no va a funcionar hasta que se lo asignen en Usuarios y roles.');
    status('Revisá los datos y confirmá. Todavía no se registró ningún cambio.');
  }
  function startWithdraw(scopeId) {
    const scope = accountScopes().find(item => item.scopeId === scopeId);
    if (busy || attempt || prepared || withdrawing || !changeable() || !scope?.active) return;
    withdrawing = scope;
    $('withdraw-target').textContent = 'Vas a retirar: ' + AREA_SCOPE_CAPABILITY_LABELS[scope.capability] + ' · ' + unitLabel(scope) + ' / ' + sectorLabel(scope) + '.';
    $('withdraw-reference').value = '';
    status('Escribí la referencia que autoriza el retiro y revisá antes de confirmar. Todavía no se registró ningún cambio.');
    controls(); $('withdraw-reference').focus();
  }
  function prepareWithdraw() {
    if (busy || attempt || prepared || !withdrawing || !changeable()) return;
    const scope = withdrawing;
    const command = build('withdraw', scope.capability, { organizationUnitSourceId: scope.organizationUnitSourceId, sectorSourceId: scope.sectorSourceId }, $('withdraw-reference').value);
    if (!command) return;
    stage(command, 'Al confirmar, la cuenta deja de ver esa área. La fila queda como retirada y conserva su historial.');
    status('Revisá los datos y confirmá el retiro. Todavía no se registró ningún cambio.');
  }
  function cancelPreparation() {
    if (busy || attempt) return;
    clearPreparation(); status('No se registró ningún cambio. Podés corregir los datos.'); controls();
  }
  function acknowledge(response, sent) {
    const member = data?.memberships.find(item => item.membershipId === sent.membershipId);
    const what = AREA_SCOPE_CAPABILITY_LABELS[response.scope.capability] + (member ? ' · ' + accountLabel(member) : '');
    $('receipt').textContent = response.replayed ? 'Ese envío ya estaba registrado. La fila figura hoy como ' + (response.scope.active ? 'vigente' : 'retirada') + ' (revisión ' + response.scope.version + '): ' + what + '.'
      : !response.changed ? 'No hubo cambios: el área ya estaba ' + (response.scope.active ? 'concedida' : 'retirada') + ' (revisión ' + response.scope.version + '): ' + what + '.'
      : (response.scope.active ? 'Área concedida' : 'Área retirada') + ' (revisión ' + response.scope.version + '): ' + what + '.';
    $('receipt').hidden = false;
  }
  function send() {
    return perform(async valid => {
      if (!attempt && (!prepared || !$('confirm').checked || !changeable())) return;
      if (!attempt) attempt = freeze({ key: createKey(), tenantId: context.tenantId, body: structuredClone(prepared),
        serialized: JSON.stringify({ operation: 'command', tenantId: context.tenantId, payload: prepared }) });
      else if (attempt.tenantId !== context.tenantId || !context.canManage) return;
      const sent = attempt.body;
      const response = await request(attempt);
      if (!valid()) return;
      attempt = null; clearPreparation(); clearWithdraw();
      acknowledge(response, sent);
      const receipt = $('receipt').textContent;
      // The list is the record: it is read again after every confirmed change.
      await read(valid);
      if (!valid()) return;
      $('receipt').textContent = receipt; $('receipt').hidden = false;
      status(response.changed ? 'Cambio registrado. La lista está actualizada.' : 'No se registró un cambio nuevo. La lista está actualizada.', 'success');
    });
  }
  function discard() {
    if (busy || !attempt) return;
    attempt = null; clearPreparation(); clearWithdraw();
    return refresh();
  }
  function setContext(next) {
    const value = contextOf(next);
    const same = value.tenantId === context.tenantId && value.canRead === context.canRead && value.canManage === context.canManage && value.visible === context.visible;
    context = value;
    if (stopped) return undefined;
    // A send of another municipality or of a session that can no longer change areas is never replayed here.
    if (attempt && (attempt.tenantId !== context.tenantId || !context.canManage)) attempt = null;
    if (same && !context.visible) return undefined;
    // The municipality, the permissions or the administration data changed: nothing already read is kept.
    suspend(context.visible ? 'Actualizando la lista…' : 'Se retiraron los datos de la pantalla.');
    return context.visible ? refresh() : undefined;
  }
  $('refresh').addEventListener('click', refresh);
  $('account').addEventListener('change', () => {
    if (busy || attempt || prepared) return;
    accountId = $('account').value; showAccount();
    if (account()) status('Áreas de ' + accountLabel(account()) + '.');
  });
  for (const key of ['capability', 'unit', 'sector']) $(key).addEventListener('change', grantNote);
  $('prepare-grant').addEventListener('click', prepareGrant);
  $('prepare-withdraw').addEventListener('click', prepareWithdraw);
  $('cancel-withdraw').addEventListener('click', () => { if (busy || attempt || prepared) return; clearWithdraw(); status('No se retiró ningún área.'); controls(); });
  $('confirm').addEventListener('change', controls);
  $('cancel').addEventListener('click', cancelPreparation);
  $('send').addEventListener('click', send); $('retry').addEventListener('click', send); $('discard').addEventListener('click', discard);
  const visibility = () => { if (doc.hidden) suspend(); };
  const capabilities = () => { if (data && !busy) suspend('Cambió el acceso. Actualizá la lista antes de continuar.'); };
  const contextChanged = event => setContext(event?.detail);
  function destroy() {
    if (stopped) return;
    suspend('Página cerrada.'); stopped = true; attempt = null; controls();
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('municontrol:capabilities-ready', capabilities);
    doc.removeEventListener(AREA_SCOPES_CONTEXT_EVENT, contextChanged);
    win?.removeEventListener('pagehide', destroy);
  }
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('municontrol:capabilities-ready', capabilities);
  doc.addEventListener(AREA_SCOPES_CONTEXT_EVENT, contextChanged);
  win?.addEventListener('pagehide', destroy, { once: true });
  status(context.visible ? 'Preparando la administración de áreas…' : 'Abrí esta sección para consultar las áreas de asistencia.', 'blocked');
  controls();
  return { ready: context.visible ? refresh() : Promise.resolve(), refresh, setContext, destroy, version: AREA_SCOPE_ADMIN_VERSION };
}

if (typeof document !== 'undefined') {
  const start = () => { const container = document.getElementById('attendanceAreaScopes'); if (container) mountAttendanceAreaScopes(container); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
