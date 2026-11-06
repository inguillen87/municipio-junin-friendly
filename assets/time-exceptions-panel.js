// Excepciones horarias por legajo: Personal registra casos humanos documentados (cuidado familiar, salud,
// lactancia, estudio…) con días, horario y vigencia. El preparte de relojes no cuenta esas ventanas como
// tardanza. Sólo lectura sin permiso de revisión; nada se liquida desde acá.
import { EXCEPTION_KINDS, EXCEPTION_CATEGORIES } from './attendance-tardiness-model.js';

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
const dateLabel = value => value ? value.split('-').reverse().join('/') : 'sin fin';
const daysLabel = list => list.length === 5 && [1, 2, 3, 4, 5].every(d => list.includes(d)) ? 'Lunes a viernes' : list.map(d => DAYS[d - 1]).join(' · ');

export function validateExceptionForm(form) {
  const issues = [];
  if (!/^[1-9]\d{0,19}$/.test(form.legajo)) issues.push(['legajo', 'Indicá el legajo (sólo números, sin ceros adelante).']);
  if (!Object.hasOwn(EXCEPTION_KINDS, form.kind)) issues.push(['kind', 'Elegí el tipo de excepción.']);
  if (!form.weekdays.length) issues.push(['weekdays', 'Marcá al menos un día.']);
  if (form.kind !== 'exento') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.to) || form.from >= form.to) issues.push(['from', 'Indicá el horario: desde y hasta en HH:MM, desde antes que hasta.']);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.validFrom)) issues.push(['validFrom', 'Indicá desde qué fecha rige.']);
  if (form.validTo && (!/^\d{4}-\d{2}-\d{2}$/.test(form.validTo) || form.validTo < form.validFrom)) issues.push(['validTo', 'La fecha final no puede ser anterior a la inicial.']);
  if (!Object.hasOwn(EXCEPTION_CATEGORIES, form.category)) issues.push(['category', 'Elegí el motivo.']);
  if (form.note.length > 300) issues.push(['note', 'La nota admite hasta 300 caracteres.']);
  if (form.documentReference.trim().length < 3 || form.documentReference.length > 160) issues.push(['documentReference', 'Indicá la nota, resolución o expediente que la respalda.']);
  return issues;
}

export function mountTimeExceptions(section) {
  if (!section || section.dataset.bound === 'true') return null;
  section.dataset.bound = 'true';
  section.innerHTML = `<header class="tx-head"><div><p class="tx-eyebrow">PERSONAL · ASISTENCIA</p><h2 id="txTitle">Excepciones horarias por legajo</h2>
  <p>Para casos humanos y documentados: una persona que sale a llevar a su hijo al colegio, lactancia, estudio, tratamientos. Indicá días, horario y vigencia; el preparte de relojes no cuenta esas ventanas como tardanza.</p></div>
  <span class="tx-badge">Historial completo · sin efecto salarial directo</span></header>
  <p class="tx-status" data-tx="status" role="status" aria-live="polite">Consultando excepciones…</p>
  <div class="tx-toolbar"><label>Buscar<input data-tx="search" type="search" maxlength="80" placeholder="Persona o legajo" autocomplete="off"></label>
  <label>Mostrar<select data-tx="filter"><option value="active">Vigentes</option><option value="all">Todas, con revocadas</option></select></label>
  <button type="button" class="button primary" data-tx="new" hidden>Nueva excepción</button></div>
  <form class="tx-form" data-tx="form" hidden novalidate><h3>Nueva excepción horaria</h3>
  <div class="tx-grid"><label>Legajo<input name="legajo" inputmode="numeric" maxlength="20" autocomplete="off" required></label>
  <label>Tipo<select name="kind">${Object.entries(EXCEPTION_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  <label data-tx="time">Desde<input name="from" type="time" step="60"></label><label data-tx="time">Hasta<input name="to" type="time" step="60"></label>
  <label>Rige desde<input name="validFrom" type="date" required></label><label>Hasta (opcional)<input name="validTo" type="date"></label>
  <label>Motivo<select name="category">${Object.entries(EXCEPTION_CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  <label>Respaldo<input name="documentReference" maxlength="160" placeholder="Nota, resolución o expediente" required></label></div>
  <fieldset class="tx-days"><legend>Días</legend>${DAYS.map((d, i) => `<label><input type="checkbox" name="weekday" value="${i + 1}"${i < 5 ? ' checked' : ''}>${d}</label>`).join('')}</fieldset>
  <label class="tx-note">Nota breve (opcional)<textarea name="note" maxlength="300" rows="2" placeholder="Ej.: traslado escolar de su hijo; vuelve a las 8:30."></textarea><small>No escribas diagnósticos ni datos de salud: alcanza con el motivo y el respaldo.</small></label>
  <ul class="tx-issues" data-tx="issues" hidden></ul>
  <div class="tx-toolbar"><button type="submit" class="button primary">Registrar excepción</button><button type="button" class="button" data-tx="cancel">Cancelar</button></div></form>
  <div class="tx-table" role="region" aria-label="Excepciones horarias" tabindex="0"><table><thead><tr><th>Persona / legajo</th><th>Tipo</th><th>Días y horario</th><th>Vigencia</th><th>Motivo y respaldo</th><th>Estado</th></tr></thead><tbody data-tx="rows"></tbody></table></div>`;
  const $ = key => section.querySelector(`[data-tx="${key}"]`);
  let items = [], canManage = false, busy = false, pending = null;
  const status = (text, error = false) => { $('status').textContent = text; $('status').dataset.error = String(error); };

  async function api(method, body) {
    const options = { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } };
    if (body) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const response = await fetch(method === 'GET' ? '/api/internal-attendance?resource=time-exceptions' : '/api/internal-attendance', options);
    let result = {}; try { result = await response.json(); } catch {}
    if (!response.ok || result.ok !== true) throw Object.assign(Error(result.error || 'La operación no se pudo completar.'), { status: response.status });
    return result;
  }
  function visible() {
    const query = $('search').value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), today = new Date().toISOString().slice(0, 10);
    return items.filter(item => ($('filter').value === 'all' || !item.revokedAt && (!item.validTo || item.validTo >= today))
      && ((item.name || '') + ' ' + item.legajo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(query));
  }
  function render() {
    const body = $('rows'); body.replaceChildren();
    for (const item of visible()) {
      const tr = node('tr'), td = label => { const c = node('td'); c.dataset.label = label; tr.append(c); return c; };
      td('Persona / legajo').append(node('strong', item.name || 'Legajo ' + item.legajo), node('small', 'Legajo ' + item.legajo));
      td('Tipo').append(node('span', EXCEPTION_KINDS[item.kind] || item.kind));
      td('Días y horario').append(node('span', daysLabel(item.weekdays)), node('small', item.kind === 'exento' ? 'Todo el día' : item.from + ' a ' + item.to));
      td('Vigencia').append(node('span', dateLabel(item.validFrom) + ' → ' + dateLabel(item.validTo)));
      td('Motivo y respaldo').append(node('span', EXCEPTION_CATEGORIES[item.category] || item.category), node('small', item.documentReference + (item.note ? ' · ' + item.note : '')));
      const state = td('Estado');
      if (item.revokedAt) state.append(node('span', 'Revocada', 'tx-off'), node('small', dateLabel(item.revokedAt.slice(0, 10)) + ' · ' + (item.revokeReason || '')));
      else {
        state.append(node('span', 'Vigente', 'tx-on'), node('small', 'Cargó ' + (item.registeredBy || '') + ' · ' + dateLabel(String(item.registeredAt).slice(0, 10))));
        if (canManage) {
          const box = node('div', undefined, 'tx-revoke'), reason = node('input'); reason.placeholder = 'Motivo de la revocación'; reason.maxLength = 160; reason.hidden = true;
          const button = node('button', 'Revocar', 'button compact'); button.type = 'button';
          button.addEventListener('click', async () => {
            if (reason.hidden) { reason.hidden = false; reason.focus(); button.textContent = 'Confirmar revocación'; return; }
            if (reason.value.trim().length < 3) { status('Indicá el motivo de la revocación.', true); reason.focus(); return; }
            await run(() => api('POST', { action: 'time-exception.revoke', requestKey: uuid(), id: item.id, reason: reason.value.trim() }), 'Excepción revocada. El historial la conserva.');
          });
          box.append(reason, button); state.append(box);
        }
      }
      body.append(tr);
    }
    if (!body.children.length) { const tr = node('tr'), c = node('td', items.length ? 'No hay excepciones en este filtro.' : 'Todavía no hay excepciones registradas.'); c.colSpan = 6; tr.append(c); body.append(tr); }
  }
  async function load() {
    try {
      const result = await api('GET');
      if (result.version !== 'attendance-time-exceptions.v1' || !Array.isArray(result.items)) throw Error('Respuesta fuera de contrato.');
      items = result.items; canManage = result.canManage === true; section.hidden = false;
      $('new').hidden = !canManage;
      status(items.length ? `${items.filter(i => !i.revokedAt).length} excepciones vigentes o futuras.` + (canManage ? '' : ' Tu perfil puede consultarlas; las carga Personal.') : 'Sin excepciones registradas.' + (canManage ? ' Usá «Nueva excepción» para el primer caso.' : ''));
      render();
    } catch (error) {
      if ([401, 403].includes(error.status)) { section.hidden = true; return; }
      section.hidden = false; status(error.status === 400 || error.status === 404 ? 'Las excepciones horarias estarán disponibles cuando se instale su tabla.' : error.message, true);
    }
  }
  async function run(action, done) {
    if (busy) return; busy = true; section.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { await action(); pending = null; status(done); await load(); }
    catch (error) { status(error.message + (pending ? ' Podés reintentar: se usa la misma clave y no se duplica.' : ''), true); }
    finally { busy = false; section.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  const form = $('form');
  const syncKind = () => section.querySelectorAll('[data-tx="time"]').forEach(label => { label.hidden = form.elements.kind.value === 'exento'; });
  form.elements.kind.addEventListener('change', syncKind);
  $('new').addEventListener('click', () => { form.hidden = false; if (!form.elements.validFrom.value) form.elements.validFrom.value = new Date().toISOString().slice(0, 10); syncKind(); form.elements.legajo.focus(); });
  $('cancel').addEventListener('click', () => { form.reset(); form.hidden = true; pending = null; $('issues').hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const f = form.elements, kind = f.kind.value;
    const value = { legajo: f.legajo.value.trim(), kind, weekdays: [...form.querySelectorAll('input[name="weekday"]:checked')].map(i => Number(i.value)),
      from: kind === 'exento' ? null : f.from.value, to: kind === 'exento' ? null : f.to.value, validFrom: f.validFrom.value, validTo: f.validTo.value || null,
      category: f.category.value, note: f.note.value.trim(), documentReference: f.documentReference.value.trim() };
    const issues = validateExceptionForm({ ...value, from: value.from || '', to: value.to || '', validTo: value.validTo || '' });
    const list = $('issues'); list.replaceChildren(...issues.map(([, message]) => node('li', message))); list.hidden = !issues.length;
    if (issues.length) { f[issues[0][0] === 'weekdays' ? 'weekday' : issues[0][0]]?.focus?.(); return; }
    // Same body and key on retry: an unconfirmed response never duplicates the exception.
    const signature = JSON.stringify(value);
    if (!pending || pending.signature !== signature) pending = { signature, key: uuid() };
    run(() => api('POST', { action: 'time-exception.register', requestKey: pending.key, ...value }), 'Excepción registrada. Desde ahora el preparte la descuenta de las tardanzas.')
      .then(() => { if (!pending) { form.reset(); form.hidden = true; } });
  });
  $('search').addEventListener('input', render); $('filter').addEventListener('change', render);
  load();
  return { reload: load };
}

if (typeof document !== 'undefined') {
  // Same signal as the other attendance modules: the session and its attendance access are ready.
  let controller = null;
  document.addEventListener('mc:attendance-ready', () => {
    const section = document.getElementById('timeExceptions');
    if (controller) controller.reload(); else controller = mountTimeExceptions(section);
  });
}
