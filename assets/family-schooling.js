import { schoolingData, schoolingFilter, schoolingRevision, schoolingDate, certificateState,
  certificateFile, certificateDates, MAX_CERTIFICATE_BYTES } from './family-schooling-model.js';
import { schoolingXlsx } from './family-schooling-export.js';

const ENDPOINT = '/api/internal-family-certificates';
const PAGE_SIZE = 50;
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (label, cls = '') => { const b = node('button', label, 'fs-button ' + cls); b.type = 'button'; return b; };
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
function message(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'La consulta demoró demasiado. Reintentá cuando tengas conexión.';
  if (error?.status === 401) return 'La sesión venció. Ingresá nuevamente para continuar.';
  if (error?.status === 403) return 'Tu perfil no tiene permiso vigente para esta operación.';
  if (error?.code === 'SCHOOL_CERTIFICATE_STORAGE_FULL') return 'El archivo de certificados no tiene espacio disponible para esta carga. Los certificados guardados siguen disponibles. Consultá el espacio antes de reintentar.';
  if (error?.code === 'SCHOOL_CERTIFICATE_SESSION_BUSY') return 'Hay otra operación en curso. Esperá un momento y reintentá el mismo envío.';
  if (error?.code === 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED') return 'Cambió el vínculo del hijo. Revisá el vínculo antes de guardar; no se asociará el PDF automáticamente.';
  if (error?.code === 'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE') return 'Este intento corresponde a otra carga. Revisá el vínculo y el archivo para iniciar un nuevo intento.';
  if (error?.status === 409) return 'Los datos cambiaron. Volvé a consultar antes de registrar o descargar.';
  if (error?.status === 413) return 'El PDF supera el tamaño permitido de 2 MiB. Elegí una copia más liviana.';
  const code = error?.code || '';
  if (code.endsWith('PDF_TOO_MANY_PAGES')) return 'El PDF supera las 30 páginas. Elegí el certificado correspondiente.';
  if (code.endsWith('PDF_ENCRYPTED')) return 'El PDF está protegido con contraseña. Elegí una copia sin protección.';
  if (code.endsWith('PDF_INVALID')) return 'No se pudo validar el PDF. Elegí una copia que se pueda abrir correctamente.';
  if (code.endsWith('SHA256_MISMATCH')) return 'El archivo no llegó íntegro. Reintentá el envío del mismo PDF.';
  if (error?.status) return 'No se pudo completar la operación. Reintentá; tus datos de carga se conservan.';
  return error instanceof TypeError ? 'No se pudo conectar. Reintentá; tus datos de carga se conservan.' : error?.message || 'No se pudo completar la operación.';
}
async function request(url, controller, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { Accept: 'application/json', ...options.headers }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
  if (!response.ok) {
    let code = ''; try { code = (await response.json()).code; } catch { /* Never display arbitrary server output. */ }
    throw Object.assign(Error('Request failed'), { status: response.status, code });
  }
  return response;
}
async function readSchooling(resource, controller, contractId) {
  const q = new URLSearchParams({ resource }); if (contractId) q.set('contractId', contractId);
  const response = await request(ENDPOINT + '?' + q, controller);
  return schoolingData(await response.json(), { resource, contractId });
}
function save(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = node('a'); link.href = url; link.download = filename; link.rel = 'noopener';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function downloadCertificate(certificate, controller, available) {
  const response = await request(ENDPOINT + '?resource=download&certificateId=' + encodeURIComponent(certificate.id), controller, { headers: { Accept: 'application/pdf' } });
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')
    || Number(response.headers.get('content-length')) > MAX_CERTIFICATE_BYTES) throw Error('El documento recibido no coincide con el certificado.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== certificate.byteLength || bytes.length > MAX_CERTIFICATE_BYTES || await digest(bytes) !== certificate.sha256) throw Error('El documento recibido no coincide con el certificado registrado.');
  if (available() && !controller.signal.aborted) save(bytes, certificate.filename, 'application/pdf');
}
function cutoff(scope) {
  const from = schoolingDate(scope.sourceCutoffFrom, 'no informado'), to = schoolingDate(scope.sourceCutoffTo, 'no informado');
  return 'Corte incorporado: ' + (from === to ? to : from + ' a ' + to) + '. Activo al corte no certifica altas o bajas posteriores.';
}
function storageText(storage) {
  const bytes = storage.remainingBytes, unit = bytes >= 1000000 ? 'MB' : bytes >= 1000 ? 'KB' : 'bytes';
  const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(bytes / (unit === 'MB' ? 1000000 : unit === 'KB' ? 1000 : 1));
  return 'Archivo de certificados: capacidad inicial limitada. ' + (bytes < 10
    ? 'Sin espacio disponible para nuevas cargas. Los PDF guardados, las consultas y el Excel siguen disponibles.'
    : 'Espacio disponible al consultar: ' + amount + ' ' + unit + ' aprox., compartidos entre los certificados. PDF individual: hasta 2 MiB y 30 páginas. Sólo carga inicial; la ampliación para uso masivo está pendiente.');
}

export function mountSchoolingReport(host) {
  if (!host || host.dataset.schoolingMounted) return;
  host.dataset.schoolingMounted = 'true'; host.classList.add('family-schooling');
  host.innerHTML = `<header class="fs-heading"><div><p class="fs-eyebrow">REGISTRO MUNICIPAL · CONTROL INTERNO</p><h2>Legajos activos con hijos</h2><p>Consultá los vínculos incorporados y los certificados registrados manualmente en MuniControl.</p></div><button type="button" class="fs-button primary" data-fs-consult>Consultar reporte</button></header>
    <p class="fs-status" role="status" aria-live="polite" data-fs-status>Consultá el padrón para ver los hijos y sus fechas registradas.</p>
    <a href="login.html?next=reportes-rrhh.html%23certificados-escolares" data-fs-login hidden>Ingresar al portal interno</a>
    <div data-fs-result hidden><p class="fs-source" data-fs-source></p><p class="fs-source" data-fs-storage></p>
    <div class="fs-counts"><div><span>Legajos del filtro</span><strong data-fs-contracts></strong></div><div><span>Hijos/as del filtro</span><strong data-fs-children></strong></div><div><span>Con certificado registrado</span><strong data-fs-registered></strong></div></div>
    <form class="fs-filters" data-fs-filters><label>Buscar agente, legajo o hijo/a<input type="search" maxlength="100" autocomplete="off" data-fs-search></label><label>Registro del certificado<select data-fs-filter><option value="all">Todos</option><option value="registered">Con certificado registrado</option><option value="unregistered">Sin registro en MuniControl</option><option value="expired">Vencimiento informado superado</option><option value="no_expiry">Sin vencimiento informado</option></select></label><button type="button" class="fs-button" data-fs-reset>Restablecer filtros</button></form>
    <div class="fs-actions"><button type="button" class="fs-button primary" data-fs-export>Descargar Excel del filtro</button><p data-fs-range></p></div>
    <p class="fs-note">Las fechas del certificado provienen de su carga manual. “Sin registro” o una fecha ausente no permiten afirmar que no se presentó. Este control no aprueba escolaridad ni habilita haberes.</p>
    <div class="fs-table-wrap" tabindex="0" role="region" aria-label="Detalle de hijos y certificados, desplazable"><table class="fs-table"><caption class="fs-sr">Legajos activos con hijos y último certificado registrado</caption><thead><tr><th scope="col">Agente / legajo</th><th scope="col">Hijo/a</th><th scope="col">Presentación registrada</th><th scope="col">Vencimiento registrado</th><th scope="col">Registro y documento</th><th scope="col">Ficha</th></tr></thead><tbody data-fs-rows></tbody></table></div>
    <nav class="fs-pagination" aria-label="Páginas del reporte de hijos"><button type="button" class="fs-button" data-fs-previous>Anterior</button><span data-fs-page></span><button type="button" class="fs-button" data-fs-next>Siguiente</button></nav></div>`;
  const $ = selector => host.querySelector(selector), status = $('[data-fs-status]'), result = $('[data-fs-result]');
  let data = null, queriedAt = null, page = 1, busy = false, generation = 0, controller = null, destroyed = false;
  const available = () => !destroyed && host.isConnected && !host.closest('[hidden]') && !document.hidden;
  const view = () => schoolingFilter(data, { search: $('[data-fs-search]').value, status: $('[data-fs-filter]').value });
  function controls() {
    host.setAttribute('aria-busy', String(busy));
    host.querySelectorAll('button,input,select').forEach(n => n.disabled = busy);
    if (!data) return;
    const count = view().rows.length;
    $('[data-fs-export]').disabled = busy || count === 0;
    $('[data-fs-previous]').disabled = busy || page <= 1;
    $('[data-fs-next]').disabled = busy || page * PAGE_SIZE >= count;
  }
  function clear() { data = null; queriedAt = null; result.hidden = true; $('[data-fs-rows]').replaceChildren(); }
  function start() { controller?.abort(); controller = new AbortController(); busy = true; controls(); return ++generation; }
  function render() {
    const selected = view(), all = selected.rows, pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    page = Math.min(page, pages);
    for (const name of ['contracts', 'children', 'registered']) $('[data-fs-' + name + ']').textContent = selected.counts[name].toLocaleString('es-AR');
    $('[data-fs-source]').textContent = cutoff(data.scope);
    $('[data-fs-storage]').textContent = storageText(data.storage);
    $('[data-fs-range]').textContent = all.length.toLocaleString('es-AR') + ' filas en el Excel · filtro completo';
    $('[data-fs-page]').textContent = all.length ? 'Página ' + page + ' de ' + pages + ' · hasta 50 filas por página' : 'Sin filas para este filtro';
    const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => {
      const tr = node('tr'), employee = node('td'), child = node('td'), presented = node('td'), expiry = node('td'), cert = node('td'), action = node('td');
      employee.append(node('strong', r.employeeName || 'Nombre no informado'), node('small', 'Legajo ' + r.legajo));
      child.append(node('strong', r.familyName || 'Nombre no informado'), node('small', 'Nacimiento: ' + schoolingDate(r.birthDate)));
      if (r.familyEndDate) child.append(node('small', 'Baja del vínculo: ' + schoolingDate(r.familyEndDate)));
      presented.textContent = schoolingDate(r.certificate?.presentedOn ?? null);
      expiry.textContent = schoolingDate(r.certificate?.expiresOn ?? null, 'Sin vencimiento informado');
      cert.append(node('span', certificateState(r, selected.filters.asOf), 'fs-pill' + (r.certificate ? '' : ' muted')));
      if (r.certificate) {
        cert.append(node('small', 'Cargado: ' + schoolingDate(r.certificate.recordedAt)));
        const download = button('Descargar PDF'); download.setAttribute('aria-label', 'Descargar certificado PDF de ' + (r.familyName || 'hijo/a sin nombre informado'));
        download.addEventListener('click', () => getDocument(r.certificate)); cert.append(download);
      }
      const link = node('a', 'Abrir ficha', 'fs-link'); link.href = 'internal-dashboard.html?contractId=' + encodeURIComponent(r.contractId) + '#legajos';
      link.referrerPolicy = 'no-referrer'; link.setAttribute('aria-label', 'Abrir ficha del legajo ' + r.legajo); action.append(link);
      tr.append(employee, child, presented, expiry, cert, action); return tr;
    });
    if (!rows.length) { const tr = node('tr'), td = node('td', 'No hay filas para este filtro. Podés cambiarlo o restablecer la búsqueda.'); td.colSpan = 6; tr.append(td); rows.push(tr); }
    $('[data-fs-rows]').replaceChildren(...rows); result.hidden = false; controls();
  }
  async function consult() {
    if (busy || !available()) return;
    const seq = start(); clear(); status.textContent = 'Consultando legajos activos con hijos…'; $('[data-fs-login]').hidden = true;
    try { const next = await readSchooling('report', controller); if (seq !== generation || !available()) return;
      data = next; queriedAt = new Date().toISOString(); page = 1; render(); status.textContent = 'Reporte consultado. Filtrá y descargá el mismo resultado. Los certificados se cargan desde la ficha.';
    } catch (e) { if (seq !== generation || !available()) return; clear(); status.textContent = message(e); $('[data-fs-login]').hidden = e.status !== 401; }
    finally { if (seq === generation && available()) { busy = false; controls(); } }
  }
  async function getDocument(certificate) {
    if (busy || !data) return;
    const seq = start(); status.textContent = 'Verificando acceso al PDF…';
    try { await downloadCertificate(certificate, controller, () => seq === generation && available()); if (seq === generation && available()) status.textContent = 'Certificado descargado para consulta interna.'; }
    catch (e) { if (seq === generation && available()) { if ([401, 403].includes(e.status)) clear(); status.textContent = message(e); $('[data-fs-login]').hidden = e.status !== 401; } }
    finally { if (seq === generation && available()) { busy = false; controls(); } }
  }
  $('[data-fs-consult]').addEventListener('click', consult);
  $('[data-fs-filters]').addEventListener('submit', e => { e.preventDefault(); if (data && !busy) { page = 1; render(); } });
  for (const selector of ['[data-fs-search]', '[data-fs-filter]']) $(selector).addEventListener('input', () => { if (data && !busy) { page = 1; render(); status.textContent = 'Filtro aplicado al reporte completo y al Excel.'; } });
  $('[data-fs-reset]').addEventListener('click', () => { $('[data-fs-search]').value = ''; $('[data-fs-filter]').value = 'all'; page = 1; render(); $('[data-fs-search]').focus(); });
  $('[data-fs-previous]').addEventListener('click', () => { page--; render(); });
  $('[data-fs-next]').addEventListener('click', () => { page++; render(); });
  $('[data-fs-export]').addEventListener('click', async () => {
    if (busy || !data) return;
    const original = data, selected = view(), queryTime = queriedAt, seq = start(); status.textContent = 'Verificando acceso y versión antes de descargar…';
    try {
      const fresh = await readSchooling('report', controller);
      if (seq !== generation || !available()) return;
      if (schoolingRevision(fresh) !== schoolingRevision(original)) throw Object.assign(Error('Changed'), { status: 409 });
      data = fresh; $('[data-fs-storage]').textContent = storageText(fresh.storage);
      save(schoolingXlsx(original, selected, queryTime), 'municontrol_hijos-certificados_' + selected.filters.asOf + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      status.textContent = 'Excel generado: ' + selected.rows.length + ' filas del filtro completo. Uso interno.';
    } catch (e) { if (seq === generation && available()) { clear(); status.textContent = message(e); $('[data-fs-login]').hidden = e.status !== 401; } }
    finally { if (seq === generation && available()) { busy = false; controls(); } }
  });
  function stop() { destroyed = true; generation++; controller?.abort(); clear(); }
  window.addEventListener('pagehide', stop, { once: true });
  function cancelHiddenRequest() {
    if (!busy || available() || destroyed) return;
    generation++; controller?.abort(); busy = false; clear(); controls();
    status.textContent = 'La consulta se canceló al salir del reporte. Consultá nuevamente para continuar.';
  }
  document.addEventListener('taskchange', cancelHiddenRequest);
  document.addEventListener('visibilitychange', cancelHiddenRequest);
  return { consult, stop };
}

export function mountFamilyCertificates(host, { contractId, canPropose = false } = {}) {
  if (!host?.isConnected || host.dataset.schoolingMounted) return;
  host.dataset.schoolingMounted = 'true'; host.classList.add('family-schooling', 'fs-family');
  host.innerHTML = `<div class="fs-heading"><div><p class="fs-eyebrow">CARGA MANUAL · CONTROL INTERNO</p><h3>Certificados escolares de los hijos</h3><p>El archivo y sus fechas quedan vinculados al hijo seleccionado. Los registros anteriores se conservan.</p></div><button type="button" class="fs-button" data-fs-family-refresh>Actualizar certificados</button></div>
    <p class="fs-status" role="status" aria-live="polite" data-fs-family-status>Consultando certificados…</p><p class="fs-source" data-fs-storage hidden></p><p class="fs-note">Una fecha ausente no significa que no se presentó. Registrar un PDF no aprueba escolaridad ni habilita haberes.</p><div class="fs-family-list" data-fs-family-list></div>`;
  const $ = selector => host.querySelector(selector), status = $('[data-fs-family-status]'), list = $('[data-fs-family-list]');
  let data = null, editor = null, controller = null, generation = 0, destroyed = false, busy = false;
  const available = () => !destroyed && host.isConnected && Boolean(host.closest('dialog')?.open);
  const mayRegister = () => available() && data?.canRegister === true && canPropose;
  function controls() {
    host.setAttribute('aria-busy', String(busy));
    $('[data-fs-family-refresh]').disabled = busy || Boolean(editor);
    host.querySelectorAll('[data-fs-register]').forEach(b => b.disabled = busy || Boolean(editor) || !mayRegister());
    host.querySelectorAll('[data-fs-document]').forEach(b => b.disabled = busy);
    if (editor) { editor.fieldset.disabled = busy; editor.submit.disabled = busy || !mayRegister() || editor.needsIdentityReview;
      editor.form.querySelector('[data-fs-recheck]').disabled = busy; editor.form.querySelector('[data-fs-cancel]').disabled = busy; }
  }
  function render() {
    $('[data-fs-storage]').hidden = false; $('[data-fs-storage]').textContent = storageText(data.storage);
    list.replaceChildren();
    for (const r of data.rows) {
      const card = node('article', undefined, 'fs-child'), top = node('div', undefined, 'fs-child-heading');
      top.append(node('h4', r.familyName || 'Hijo/a sin nombre informado'), node('span', r.administrativeActive ? 'Legajo activo al corte' : 'Legajo fuera del padrón activo', 'fs-pill muted'));
      card.append(top, node('p', 'Nacimiento: ' + schoolingDate(r.birthDate) + (r.familyEndDate ? ' · Baja del vínculo: ' + schoolingDate(r.familyEndDate) : ''), 'fs-note'));
      const dates = node('dl', undefined, 'fs-dates');
      for (const [label, value] of [['Presentación registrada', schoolingDate(r.certificate?.presentedOn ?? null)], ['Vencimiento registrado', schoolingDate(r.certificate?.expiresOn ?? null, 'Sin vencimiento informado')]]) {
        const field = node('div'); field.append(node('dt', label), node('dd', value)); dates.append(field);
      }
      card.append(dates, node('p', certificateState(r), 'fs-note'));
      const actions = node('div', undefined, 'fs-actions');
      if (r.certificate) {
        const download = button('Descargar PDF registrado'); download.dataset.fsDocument = ''; download.setAttribute('aria-label', 'Descargar certificado de ' + (r.familyName || 'hijo/a sin nombre informado'));
        download.addEventListener('click', () => getDocument(r.certificate)); actions.append(download);
        card.append(node('p', r.certificate.filename + ' · Cargado el ' + schoolingDate(r.certificate.recordedAt) + ' · ' + r.historyCount + ' registro(s) conservado(s); se muestra el último.', 'fs-note'));
      }
      if (mayRegister()) {
        const register = button(r.certificate ? 'Registrar otro certificado' : 'Registrar certificado', 'primary'); register.dataset.fsRegister = '';
        register.setAttribute('aria-label', 'Registrar certificado de ' + (r.familyName || 'hijo/a sin nombre informado')); register.addEventListener('click', () => openEditor(r, card)); actions.append(register);
      }
      card.append(actions); list.append(card);
    }
    if (!data.rows.length) list.append(node('p', 'La fuente no incluyó hijos para este legajo. No se infiere que la persona no tenga hijos.', 'fs-note'));
    if (!mayRegister() && data.rows.length && data.storage.remainingBytes >= 10) list.append(node('p', 'Tu perfil permite consultar los certificados. La carga requiere permiso para proponer documentación del legajo.', 'fs-note'));
    controls();
  }
  async function load(announcement) {
    if (busy || editor || !available()) return;
    controller?.abort(); controller = new AbortController(); const seq = ++generation; busy = true; controls(); status.textContent = 'Consultando certificados del legajo…';
    try { const fresh = await readSchooling('family', controller, contractId); if (seq !== generation || !available()) return;
      data = fresh; render(); status.textContent = announcement || 'Certificados consultados. Las fechas corresponden al registro manual en MuniControl.';
    } catch (e) { if (seq === generation && available()) { data = null; list.replaceChildren(); $('[data-fs-storage]').hidden = true; status.textContent = announcement
      ? announcement + ' No pudimos actualizar la vista. Usá Actualizar certificados para volver a consultarla.' : message(e); } }
    finally { if (seq === generation && available()) { busy = false; controls(); } }
  }
  async function getDocument(certificate) {
    if (busy || !available()) return;
    controller?.abort(); controller = new AbortController(); const seq = ++generation; busy = true; controls(); status.textContent = 'Verificando el PDF registrado…';
    try { await downloadCertificate(certificate, controller, () => seq === generation && available()); if (seq === generation && available()) status.textContent = 'PDF descargado para consulta interna.'; }
    catch (e) { if (seq === generation && available()) status.textContent = message(e); }
    finally { if (seq === generation && available()) { busy = false; controls(); } }
  }
  function openEditor(row, card) {
    if (!mayRegister() || busy || editor) return;
    const form = node('form', undefined, 'fs-editor'), title = node('h4', 'Registrar certificado de ' + (row.familyName || 'hijo/a sin nombre informado'));
    const suffix = crypto.randomUUID(); title.id = 'fs-editor-' + suffix; form.setAttribute('aria-labelledby', title.id);
    form.append(title);
    const fieldset = node('fieldset'), legend = node('legend', 'PDF y fechas del certificado', 'fs-sr'); fieldset.append(legend);
    const fileLabel = node('label', 'Certificado en PDF'), file = node('input'); file.type = 'file'; file.accept = '.pdf,application/pdf'; file.required = true; file.dataset.fsFile = '';
    const hint = node('small', 'Un PDF sin contraseña · hasta 2 MiB y 30 páginas'); hint.id = 'fs-file-hint-' + suffix; file.setAttribute('aria-describedby', hint.id); fileLabel.append(file, hint);
    const presentedLabel = node('label', 'Fecha de presentación'), presented = node('input'); presented.type = 'date'; presented.required = true; presented.min = '1900-01-01'; presented.max = '2100-12-31'; presented.dataset.fsPresented = ''; presentedLabel.append(presented);
    const expiryLabel = node('label', 'Fecha de vencimiento (si consta)'), expiry = node('input'); expiry.type = 'date'; expiry.min = '1900-01-01'; expiry.max = '2100-12-31'; expiry.dataset.fsExpires = ''; expiryLabel.append(expiry);
    fieldset.append(fileLabel, presentedLabel, expiryLabel);
    const note = node('p', 'Copiá las fechas informadas. El vencimiento puede quedar vacío o ser anterior a la presentación; no se calculan fechas automáticamente.', 'fs-note');
    const spaceHint = node('p', '', 'fs-note'); spaceHint.dataset.fsFileStorage = ''; spaceHint.setAttribute('role', 'status'); spaceHint.hidden = true;
    const actions = node('div', undefined, 'fs-actions'), submit = button('Guardar certificado', 'primary'), cancel = button('Cancelar carga'), recheck = button('Revisar vínculo y permisos'); submit.type = 'submit'; submit.dataset.fsSave = ''; cancel.dataset.fsCancel = ''; recheck.dataset.fsRecheck = ''; recheck.hidden = true; actions.append(submit, recheck, cancel);
    const feedback = node('p', '', 'fs-status'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.dataset.fsFormStatus = '';
    const review = node('div'); review.dataset.fsIdentityReview = ''; review.hidden = true;
    form.append(fieldset, spaceHint, note, actions, feedback, review); card.append(form);
    editor = { form, fieldset, submit, file, presented, expiry, row, idempotencyKey: null, needsIdentityReview: false }; controls(); file.focus();
    form.addEventListener('input', () => { if (editor) editor.idempotencyKey = null; feedback.textContent = ''; });
    function fileSpaceHint() {
      spaceHint.hidden = !file.files[0] || file.files[0].size <= data.storage.remainingBytes;
      spaceHint.textContent = 'Este PDF supera el espacio disponible informado. Podés intentar guardarlo: el sistema verificará el espacio y si ya existe una copia del mismo archivo. Tu selección y fechas se conservarán si no se puede guardar.';
    }
    file.addEventListener('change', fileSpaceHint);
    cancel.addEventListener('click', () => { if (busy) return; form.reset(); form.remove(); editor = null; render(); $('[data-fs-family-refresh]').focus(); });
    recheck.addEventListener('click', async () => {
      if (busy || !editor || !available()) return;
      const activeEditor = editor; controller?.abort(); controller = new AbortController(); const seq = ++generation; busy = true; controls();
      feedback.textContent = 'Consultando el vínculo y los permisos. El archivo y las fechas se conservan…';
      try {
        const fresh = await readSchooling('family', controller, contractId);
        if (seq !== generation || !available() || editor !== activeEditor) return;
        data = fresh; $('[data-fs-storage]').textContent = storageText(data.storage); fileSpaceHint();
        const current = fresh.rows.find(r => r.familyId === activeEditor.row.familyId);
        if (current?.identityToken === activeEditor.row.identityToken) {
          activeEditor.row = current; activeEditor.needsIdentityReview = false;
          if (activeEditor.lastError === 'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE') activeEditor.idempotencyKey = null;
          review.hidden = true; feedback.textContent = data.storage.remainingBytes < 10 ? 'El archivo de certificados sigue sin espacio disponible. Tu PDF y fechas se conservan; podés volver a consultar el espacio.'
            : mayRegister() ? 'Vínculo y permisos revisados. Conservás el PDF y las fechas; podés guardar.' : 'El vínculo se consultó, pero tu perfil no tiene permiso de carga. El archivo y las fechas se conservan.';
        } else {
          activeEditor.needsIdentityReview = true; review.replaceChildren(); review.hidden = false;
          review.append(node('p', 'El vínculo cambió. Revisá nombre y nacimiento antes de asociar el PDF que elegiste. No se confirmó esta carga para el vínculo actual.', 'fs-note'));
          const label = node('label', 'Hijo/a según la consulta actual'), select = node('select'); select.dataset.fsReviewedChild = '';
          for (const child of fresh.rows) { const option = node('option', (child.familyName || 'Nombre no informado') + ' · Nacimiento: ' + schoolingDate(child.birthDate)); option.value = child.key; select.append(option); }
          label.append(select); review.append(label);
          const confirm = button('Usar hijo/a revisado/a'); confirm.dataset.fsConfirmIdentity = ''; confirm.disabled = !fresh.rows.length || !mayRegister(); review.append(confirm);
          confirm.addEventListener('click', () => {
            if (busy || !mayRegister() || editor !== activeEditor) return;
            const selectedRow = data.rows.find(r => r.key === select.value); if (!selectedRow) return;
            activeEditor.row = selectedRow; activeEditor.needsIdentityReview = false; activeEditor.idempotencyKey = null;
            title.textContent = 'Registrar certificado de ' + (selectedRow.familyName || 'Nombre no informado');
            card.querySelector('.fs-child-heading h4').textContent = selectedRow.familyName || 'Nombre no informado';
            review.hidden = true; controls(); feedback.textContent = 'Elegiste el vínculo revisado. Verificá que el PDF y las fechas correspondan a este hijo antes de guardar.'; submit.focus();
          });
          feedback.textContent = fresh.rows.length ? 'Seleccioná y confirmá el vínculo revisado. Tu archivo y fechas siguen en esta carga.' : 'La fuente ya no incluye hijos en este legajo. El archivo y las fechas se conservan; la carga permanece bloqueada.';
        }
      } catch (e) { if (seq === generation && available()) feedback.textContent = message(e) + ' El archivo y las fechas permanecen en esta carga.'; }
      finally { if (seq === generation && available()) { busy = false; controls(); } }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !mayRegister() || !editor || editor.needsIdentityReview || !form.reportValidity()) return;
      let selected, dates;
      try { selected = certificateFile(file.files[0]); dates = certificateDates(presented.value, expiry.value); } catch (e) { feedback.textContent = message(e); return; }
      fileSpaceHint();
      const activeEditor = editor; activeEditor.idempotencyKey ||= crypto.randomUUID();
      controller?.abort(); controller = new AbortController(); const seq = ++generation; busy = true; controls(); feedback.textContent = 'Verificando y guardando el PDF…';
      let saved = false;
      try {
        const bytes = new Uint8Array(await selected.arrayBuffer());
        if (seq !== generation || !available()) return;
        const sha256 = await digest(bytes);
        let binary = ''; for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
        const body = { contractId, familyId: activeEditor.row.familyId, identityToken: activeEditor.row.identityToken, filename: selected.name, contentBase64: btoa(binary), sha256, ...dates };
        const response = await request(ENDPOINT, controller, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': activeEditor.idempotencyKey }, body: JSON.stringify(body) });
        const payload = await response.json();
        if (payload?.ok !== true || payload.data?.version !== 'family-schooling-register.v1' || typeof payload.data.duplicate !== 'boolean'
          || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.data.certificateId || '')) throw Error('No se pudo confirmar el registro. Reintentá el mismo envío para verificarlo.');
        if (seq !== generation || !available()) return;
        saved = true; form.reset(); form.remove(); editor = null;
      } catch (e) {
        if (seq === generation && available()) {
          activeEditor.lastError = e.code;
          if (e.code === 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED') activeEditor.needsIdentityReview = true;
          if (e.status === 409 && e.code !== 'SCHOOL_CERTIFICATE_SESSION_BUSY' || [401, 403].includes(e.status)) recheck.hidden = false;
          if (e.code === 'SCHOOL_CERTIFICATE_STORAGE_FULL') { recheck.hidden = false; recheck.textContent = 'Consultar espacio disponible'; }
          feedback.textContent = message(e) + ' El archivo y las fechas permanecen en esta carga.';
        }
      } finally {
        if (seq === generation && available()) { busy = false; controls(); }
      }
      if (saved && available()) { await load('Certificado guardado. El registro anterior se conserva; esta carga no aprueba escolaridad ni haberes.'); $('[data-fs-family-refresh]').focus(); }
    });
  }
  function stop() { destroyed = true; generation++; controller?.abort(); editor?.form.reset(); editor = null; data = null; list.replaceChildren();
    document.removeEventListener('mc:family-schooling-close', stop); window.removeEventListener('pagehide', stop); }
  $('[data-fs-family-refresh]').addEventListener('click', () => load());
  document.addEventListener('mc:family-schooling-close', stop); window.addEventListener('pagehide', stop);
  load(); return { stop };
}

// A restored page must re-enter the normal session and data checks; drafts are
// intentionally cleared when leaving the page, never replayed as a POST.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
