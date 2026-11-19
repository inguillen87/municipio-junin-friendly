import { readOwnPayrollResponse } from './own-payroll-response.js';
import { COLLECTIVE_JOBS_ENDPOINT as endpoint, collectiveJobSnapshot, readCompleteCollectiveComparison, collectiveJobStatusText } from './own-collective-jobs-client.js';

const node = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
const phases = { preparing: 'En revisión', prepared: 'Lista para confirmar', running: 'En curso', paused: 'Pausada', complete: 'Completa', cancelled: 'Detenida' };
const operations = { propose: 'Preparar propuestas', approve: 'Aprobar propuestas por otra persona', reject: 'Rechazar propuestas por otra persona' };
const civil = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;

export function mountCollectiveJobs(container, options, config) {
 const { isVisible, otherBlocked = () => false, changed = () => {} } = options;
 const { family, prefix, className, title, validateFile, maxBytes, fields } = config;
 if (!container || typeof isVisible !== 'function') throw Error('Falta el ámbito del conjunto.');
 const host = node('details'); host.className = className; host.setAttribute('aria-label', title);
 const attr = key => `data-collective-${prefix}-${key}`;
 host.innerHTML = `<summary>${title} para varios legajos · carga y aprobación por lote</summary>
  <p>El conjunto se revisa y registra en el servidor. Podés cambiar de pantalla o cerrar el navegador: el avance queda guardado y se consulta desde aquí. Cada contrato conserva su comprobante individual.</p>
  <p role="status" aria-live="polite" ${attr('status')}>Elegí un archivo o recuperá un conjunto guardado.</p>
  <section aria-label="Conjuntos guardados"><div class="${className.replace('-collective', '')}-actions"><button type="button" ${attr('refresh-jobs')}>Consultar conjuntos guardados</button><button type="button" ${attr('more-jobs')} hidden>Ver anteriores</button></div><label>Conjunto guardado<select ${attr('jobs')}><option value="">Elegir conjunto…</option></select></label><button type="button" ${attr('open-job')}>Abrir conjunto</button></section>
  <fieldset ${attr('inputs')}><legend>1. Preparar o revisar el conjunto</legend>
   <label>Operación<select ${attr('mode')}><option value="propose">Preparar propuestas</option><option value="approve">Aprobar propuestas por otra persona</option><option value="reject">Rechazar propuestas por otra persona</option></select></label>
   <label>Archivo completo<input type="file" accept="application/json,.json" ${attr('file')}></label><p ${attr('file-label')}>Sin archivo.</p>
   <p>Para aprobar o rechazar sirve el archivo original. El servidor comprueba la propuesta pendiente de cada legajo y su contenido completo.</p>
   <label>Fundamento común<textarea minlength="10" maxlength="1000" rows="3" ${attr('reason')}></textarea></label>
   <button type="button" ${attr('prepare')}>Revisar conjunto completo</button>
  </fieldset>
  <section ${attr('progress-section')} hidden><h3>Avance guardado</h3><p ${attr('job-label')}></p><progress max="100" value="0" ${attr('progress-bar')}></progress><p ${attr('count')}></p>
   <button type="button" ${attr('refresh')}>Actualizar estado</button><button type="button" ${attr('resume')} hidden>Revisar acceso y reanudar</button><button type="button" ${attr('cancel')} hidden>Detener pendientes</button>
  </section>
  <section ${attr('comparison')} hidden><h3>2. Comparar todas las declaraciones</h3><p ${attr('review-reason')}></p>
   <label>Buscar legajo en la comparación<input type="search" ${attr('search')}></label><p>La búsqueda sólo modifica la vista. La confirmación corresponde al conjunto completo.</p>
   <div ${attr('rows')}></div><nav aria-label="Páginas de comparación"><button type="button" ${attr('previous')}>Anterior</button><span ${attr('page')}></span><button type="button" ${attr('next')}>Siguiente</button></nav>
   <label><input type="checkbox" ${attr('confirm')}>Revisé el conjunto completo, sus cambios, las declaraciones sin cambios y el fundamento.</label>
   <button type="button" ${attr('send')}>Registrar conjunto revisado</button>
  </section>
  <button type="button" ${attr('new')}>Iniciar otro conjunto</button>`;
 container.append(host); const $ = key => host.querySelector(`[${attr(key)}]`);
 let loaded = null, job = null, comparison = null, busy = false, sequence = 0, controller = null, pendingFile = false;
 let createKey = null, createUncertain = false, page = 1, jobs = new Map(), nextCursor = null;
 const live = () => isVisible() && !document.hidden && host.isConnected;
 const status = (message, kind = 'neutral') => { $('status').textContent = message; $('status').dataset.state = kind; };
 const visibleJob = () => live() && job !== null;
 function controls() {
  const unavailable = !live() || otherBlocked(), locked = busy || unavailable;
  $('inputs').disabled = locked || !!job;
  $('mode').disabled = createUncertain; $('reason').readOnly = createUncertain; $('file').disabled = createUncertain;
  $('prepare').disabled = locked || !!job || !loaded;
  for (const key of ['refresh-jobs', 'more-jobs', 'jobs', 'open-job', 'refresh']) $(key).disabled = locked;
  $('open-job').disabled ||= !$('jobs').value;
  $('confirm').disabled = locked || job?.phase !== 'prepared' || !comparison;
  $('send').disabled = locked || job?.phase !== 'prepared' || !comparison || !$('confirm').checked;
  $('send').textContent = job?.command === 'approve' ? 'Aprobar todas las propuestas revisadas' : job?.command === 'reject' ? 'Rechazar todas las propuestas revisadas' : 'Registrar todas las propuestas revisadas';
  $('resume').hidden = job?.phase !== 'paused'; $('resume').disabled = locked;
  $('cancel').hidden = !job || ['complete', 'cancelled'].includes(job.phase); $('cancel').disabled = locked;
  $('new').disabled = locked || createUncertain;
  host.setAttribute('aria-busy', String(busy));
 }
 async function request(query = null, body = null, key = null) {
  if (!live()) throw Object.assign(Error('Se retiró la vista. El trabajo guardado continúa en el servidor.'), { name: 'AbortError' });
  const url = endpoint + (query ? '?' + new URLSearchParams(query) : '');
  const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 45000);
  try {
   const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.any([timeout.signal, controller.signal]), headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
   const payload = await readOwnPayrollResponse(response, { maxBytes: 2 * 1024 * 1024, signal: controller.signal });
   if (!response.ok || payload?.ok !== true) throw Object.assign(Error(response.status === 401 ? 'La sesión venció. Volvé a ingresar con la misma cuenta para consultar el avance.' : response.status === 403 ? 'Tu cuenta no permite consultar este conjunto.' : payload?.error || 'No se confirmó la respuesta. Consultá los conjuntos guardados.'), { status: response.status, code: payload?.code });
   return payload;
  } finally { clearTimeout(timer); }
 }
 async function action(work) {
  if (busy || !live() || otherBlocked()) return;
  const epoch = ++sequence; busy = true; controller = new AbortController(); controls(); changed();
  const valid = () => epoch === sequence && live();
  try { await work(valid); }
  catch (error) { if (valid()) { if ([400, 413, 415, 422].includes(error.status)) createUncertain = false; if ([401, 403].includes(error.status)) { clearPrivate(); createUncertain = false; createKey = null; } status(error.name === 'AbortError' ? 'Se interrumpió la consulta. El avance guardado se conserva; consultá los conjuntos antes de iniciar otro.' : error.message, 'warning'); } }
  finally { if (epoch === sequence) { busy = false; controller = null; render(false); changed(); takePendingFile(); } }
 }
 function take(value) {
  const next = collectiveJobSnapshot(value, family, job?.id ?? null);
  if (!job || job.reviewHash !== next.reviewHash || next.phase !== 'prepared') $('confirm').checked = false;
  if (job?.reviewHash !== next.reviewHash || job?.confirmed !== next.confirmed || job?.phase !== next.phase) comparison = null;
  job = next; createUncertain = false; loaded = null; createKey = null; $('file').value = ''; $('file-label').textContent = 'Archivo conservado en el conjunto.';
  render();
 }
 async function loadComparison(valid) {
  if (!job?.reviewHash || job.prepared !== job.total || !['prepared', 'complete', 'paused', 'cancelled'].includes(job.phase) || comparison?.reviewHash === job.reviewHash) return;
  const id = job.id, pin = job;
  const result = await readCompleteCollectiveComparison(async (offset, limit) => {
   const response = await request({ resource: 'detail', id, offset: String(offset), limit: String(limit) });
   if (!valid()) throw Object.assign(Error('Se retiró la comparación.'), { name: 'AbortError' });
   return response.data;
  }, pin, family);
  if (valid() && job?.id === id && job.reviewHash === result.reviewHash) { comparison = result; page = 1; render(); }
 }
 async function refresh(valid) {
  if (!job) return; const id = job.id, payload = await request({ resource: 'status', id });
  if (!valid() || job?.id !== id) return; take(payload.data); await loadComparison(valid);
 }
 async function list(valid, more = false) {
  const payload = await request({ resource: 'list', family, ...(more && nextCursor ? { cursor: nextCursor } : {}) });
  if (!valid()) return;
  const data = payload.data;
  if (!Array.isArray(data?.jobs) || typeof data.hasMore !== 'boolean' || data.hasMore && typeof data.nextCursor !== 'string') throw Error('No se verificó la lista de conjuntos guardados.');
  if (!more) jobs = new Map();
  for (const item of data.jobs) { collectiveJobSnapshot(item, family); jobs.set(item.id, item); }
  nextCursor = data.hasMore ? data.nextCursor : null; const selected = job?.id ?? $('jobs').value;
  $('jobs').replaceChildren(new Option('Elegir conjunto…', ''));
  for (const item of jobs.values()) $('jobs').append(new Option(`${item.period} · ${operations[item.command]} · ${item.total} contratos · ${phases[item.phase]} · ${item.id.slice(0, 8)}`, item.id));
  if (jobs.has(selected)) $('jobs').value = selected;
  $('more-jobs').hidden = !nextCursor;
  status(jobs.size ? 'Conjuntos recuperados. Elegí uno para consultar su avance y comparación.' : 'No hay conjuntos guardados para esta cuenta y este módulo.'); controls();
 }
 function cell(definition, modified) {
  const td = node('td'); if (definition === null) { td.append(node('span', 'Sin declaración aprobada')); return td; }
  td.append(node('strong', fields.map(([key, label]) => `${definition[key] ?? 'Sin informar'} ${label}`).join(' · ')));
  td.append(node('small', `${civil(definition.asOfDate) ?? 'Sin fecha'} · ${definition.documentReference ?? 'Sin constancia'}`));
  if (modified) td.className = 'is-changed'; return td;
 }
 function rows() {
  $('rows').replaceChildren(); if (!visibleJob() || !comparison) return;
  const term = $('search').value.trim().toLocaleLowerCase('es-AR'), filtered = comparison.rows.filter(row => !term || row.legajo.toLocaleLowerCase('es-AR').includes(term));
  const pages = Math.max(1, Math.ceil(filtered.length / 25)); page = Math.min(Math.max(1, page), pages);
  const table = node('table'); table.className = 'collective-table'; const thead = node('thead'), head = node('tr'), tbody = node('tbody');
  for (const label of ['Legajo', 'Antes', 'Después', 'Estado']) head.append(node('th', label)); thead.append(head);
  for (const row of filtered.slice((page - 1) * 25, page * 25)) {
   const tr = node('tr'), before = cell(row.before, false), after = cell(row.after, JSON.stringify(row.before) !== JSON.stringify(row.after));
   const state = row.confirmed ? 'Confirmado' : row.action === 'unchanged' ? 'Sin cambios' : row.action === 'propose' ? 'A proponer' : row.action === 'approve' ? 'A aprobar' : 'A rechazar';
   before.dataset.label = 'Antes'; after.dataset.label = 'Después'; const stateCell = node('td', state); stateCell.dataset.label = 'Estado';
   tr.append(node('td', 'Legajo ' + row.legajo), before, after, stateCell); tbody.append(tr);
  }
  table.append(thead, tbody); $('rows').append(table); $('page').textContent = `Página ${page} de ${pages} · ${filtered.length} visibles de ${comparison.rows.length}`;
  $('previous').disabled = page <= 1; $('next').disabled = page >= pages;
 }
 function render(updateStatus = true) {
  $('inputs').hidden = !!job;
  $('progress-section').hidden = !visibleJob(); $('comparison').hidden = !visibleJob() || !comparison;
  if (visibleJob()) {
   $('job-label').textContent = `${title} · ${job.period} · ${operations[job.command]} · Referencia ${job.id}`;
   $('count').textContent = `${job.prepared} revisados · ${job.confirmed} comprobantes confirmados · ${job.unchanged} sin cambios · ${job.completed} terminados de ${job.total}.`;
   $('progress-bar').max = job.total; $('progress-bar').value = ['preparing', 'prepared'].includes(job.phase) ? job.prepared : job.completed;
   $('progress-bar').setAttribute('aria-label', job.phase === 'preparing' ? 'Contratos revisados' : 'Contratos terminados');
   if (comparison) $('review-reason').textContent = 'Fundamento del conjunto: ' + comparison.reason;
   if (updateStatus) status(collectiveJobStatusText(job), job.phase === 'complete' ? 'success' : job.phase === 'paused' ? 'warning' : 'neutral');
   rows();
  }
  controls();
 }
 function clearPrivate() {
  loaded = null; job = null; comparison = null; jobs.clear(); nextCursor = null; pendingFile = false;
  $('file').value = ''; $('file-label').textContent = 'Sin archivo.'; $('reason').value = ''; $('search').value = ''; $('rows').replaceChildren(); $('review-reason').textContent = ''; $('job-label').textContent = ''; $('count').textContent = '';
  $('confirm').checked = false; $('jobs').replaceChildren(new Option('Elegir conjunto…', '')); $('comparison').hidden = true; $('progress-section').hidden = true; $('more-jobs').hidden = true;
 }
 function suspend() {
  sequence++; controller?.abort(); controller = null; busy = false; clearPrivate(); createKey = null; createUncertain = false;
  status('La vista se cerró. Los conjuntos guardados siguen en el servidor; recuperalos al volver.'); controls();
 }
 function loadFile() { return action(async valid => {
  const file = $('file').files?.[0]; if (!file) return;
  if (file.size > maxBytes) throw Error('El archivo completo supera 4 MiB. No se recorta.');
  const data = validateFile(JSON.parse(await file.text())); if (!valid()) return;
  loaded = data; createKey = null; $('file-label').textContent = `${data.total} contratos · período ${data.period} · archivo listo para revisar.`;
  status('Archivo completo cargado. Indicá el fundamento y enviá el conjunto para revisión.');
 }); }
 // El archivo elegido mientras hay otra consulta en curso (la lista de conjuntos, o la revisión de sesión de la pantalla, que
 // corre sola cada pocos segundos) se lee apenas termina. Antes se descartaba sin aviso: quedaba elegido en el selector, la
 // pantalla seguía diciendo «Sin archivo.» y «Revisar conjunto completo» no se habilitaba hasta volver a elegirlo.
 function takePendingFile() {
  if (!pendingFile || busy || !live() || otherBlocked()) return;
  pendingFile = false; if ($('file').files?.[0] && !job) loadFile();
 }
 $('file').addEventListener('change', () => {
  if (live() && (busy || otherBlocked())) { pendingFile = !!$('file').files?.[0]; if (pendingFile) $('file-label').textContent = 'El archivo se lee apenas termine la consulta en curso.'; return; }
  pendingFile = false; loadFile();
 });
 for (const key of ['mode', 'reason']) $(key).addEventListener('input', () => { if (!createUncertain) createKey = null; });
 $('prepare').addEventListener('click', () => action(async valid => {
  if (!loaded) return; const reason = $('reason').value.trim().normalize('NFC');
  if (reason.length < 10 || reason.length > 1000) throw Error('El fundamento debe tener entre 10 y 1000 caracteres.');
  createKey ??= crypto.randomUUID(); createUncertain = true;
  const result = await request(null, { operation: 'create', payload: { family, file: loaded, command: $('mode').value, reason } }, createKey);
  if (!valid()) return; take(result.data); await loadComparison(valid);
 }));
 $('refresh-jobs').addEventListener('click', () => action(valid => list(valid)));
 $('more-jobs').addEventListener('click', () => action(valid => list(valid, true)));
 $('jobs').addEventListener('change', controls);
 $('open-job').addEventListener('click', () => action(async valid => {
  const id = $('jobs').value; if (!id || !jobs.has(id)) return; job = null; comparison = null; $('confirm').checked = false;
  const result = await request({ resource: 'status', id }); if (!valid()) return; take(result.data); await loadComparison(valid);
 }));
 $('refresh').addEventListener('click', () => action(refresh));
 $('confirm').addEventListener('change', controls);
 $('send').addEventListener('click', () => action(async valid => {
  if (!job || !comparison || !$('confirm').checked || job.phase !== 'prepared') return;
  const result = await request(null, { operation: 'confirm', payload: { id: job.id, reviewHash: comparison.reviewHash, confirmed: true } });
  if (valid()) take(result.data);
 }));
 for (const operation of ['resume', 'cancel']) $(operation).addEventListener('click', () => action(async valid => {
  if (!job) return; const result = await request(null, { operation, payload: { id: job.id } });
  if (valid()) { take(result.data); await loadComparison(valid); }
 }));
 $('new').addEventListener('click', () => { if (busy || createUncertain) return; clearPrivate(); createKey = null; status('Nuevo conjunto. Los trabajos anteriores conservan su avance en el servidor.'); render(false); changed(); });
 $('search').addEventListener('input', () => { page = 1; rows(); });
 $('previous').addEventListener('click', () => { page--; rows(); }); $('next').addEventListener('click', () => { page++; rows(); });
 host.addEventListener('toggle', () => { if (host.open && live() && !busy && !job && !loaded) action(valid => list(valid)); });
 const poll = setInterval(() => { if (host.open && live() && !busy && !otherBlocked() && job) action(refresh); }, 5000);
 window.addEventListener('pagehide', () => { clearInterval(poll); suspend(); }, { once: true });
 // The parent may always retire this view. Server work owns no browser lock.
 controls(); return { suspend, update: () => { controls(); takePendingFile(); }, blocking: () => busy, holding: () => false };
}
