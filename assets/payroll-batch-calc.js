// Calcular un convenio completo en tandas, una corrida tras otra, con avance a la vista.
// No guarda nada en el navegador: el plan vive en memoria y cada corrida queda registrada en el servidor con su propia
// referencia de intento, igual que una corrida hecha desde «Calcular».
import { OWN_RUN_COMMAND_VERSION, ownRunCommand } from './own-payroll-run-model.js';
import { OWN_RUN_FULL_JSON } from './own-payroll-response.js';
import { batchCalcAgreements, batchCalcLegajos, batchCalcMoney, batchCalcPlan, batchCalcSum, batchCalcTotals } from './payroll-batch-calc-model.js';

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
  const body = ownRunCommand({ version: OWN_RUN_COMMAND_VERSION, liquidationDate: plan.liquidationDate, period: plan.period, liquidationType: 'monthly', selection: { kind: 'contracts', values: batch.contractIds }, scopeVersion: boot.scopeVersion, programVersion: boot.programVersion, populationDomain: 'native_registered' });
  const read = async response => {
    let value = null; try { value = await response.json(); } catch { /* cuerpo incompleto */ }
    if (response.ok && value?.ok === true) {
      const result = (value.data?.saved ?? value.data)?.result;
      if (!result || !Array.isArray(result.employeeTotals)) throw Object.assign(Error('La corrida quedó registrada pero su resultado todavía no está disponible. Consultala en «Calcular».'), { uncertain: true });
      return batchCalcTotals(result.employeeTotals);
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

export function mountBatchCalc(host) {
  if (!host || host.dataset.batchCalcMounted) return null; host.dataset.batchCalcMounted = '';
  const href = new URL('payroll-batch-calc.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === href)) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }
  host.className = 'mc-batch-calc';
  host.innerHTML = '<header><h3>Calcular un convenio completo</h3><p>Los convenios grandes se calculan en tandas, una detrás de otra. Elegí el mes y el convenio; las personas que este mes no se liquidan quedan afuera.</p></header>'
    + '<div class="mc-batch-form"><label>Mes <input type="month" data-bc-period></label>'
    + '<label>Convenio <select data-bc-agreement disabled><option value="">Tocá «Traer convenios»</option></select></label>'
    + '<div class="mc-batch-actions" style="margin:0"><button type="button" class="button secondary" data-bc-load>Traer convenios</button></div>'
    + '<label class="mc-batch-wide">No liquidar este mes <small>Legajos separados por coma o renglón. Quedan fuera de todas las tandas.</small><textarea data-bc-excluded rows="2" inputmode="numeric" placeholder="Ejemplo: 1177, 1188, 1256"></textarea></label></div>'
    + '<div class="mc-batch-actions"><button type="button" class="button secondary" data-bc-plan disabled>Armar tandas</button><button type="button" class="button primary" data-bc-run hidden></button></div>'
    + '<p class="mc-batch-status" role="status" aria-live="polite" data-bc-status></p><ul class="mc-batch-notes" data-bc-notes></ul>'
    + '<div data-bc-progress hidden><div class="mc-batch-bar" data-bc-bar role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Avance del cálculo"><span></span></div><p class="mc-batch-count" data-bc-count></p></div>'
    + '<ol class="mc-batch-list" data-bc-list></ol><dl class="mc-batch-total" data-bc-total hidden></dl>';
  const $ = name => host.querySelector('[data-bc-' + name + ']');
  const now = new Date(); $('period').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let rows = null, plan = null, state = [], busy = false, boot = null;
  const status = text => { $('status').textContent = text; };
  const controls = () => {
    $('load').disabled = busy; $('agreement').disabled = busy || !rows; $('period').disabled = busy; $('excluded').disabled = busy;
    $('plan').disabled = busy || !rows || !$('agreement').value;
    const pending = state.filter(s => s.state !== 'done').length;
    $('run').hidden = !plan || !plan.batches.length || !pending;
    $('run').disabled = busy;
    $('run').textContent = state.some(s => s.state === 'done' || s.state === 'failed') ? 'Seguir con ' + pending + (pending === 1 ? ' tanda' : ' tandas') : 'Calcular ' + pending + (pending === 1 ? ' tanda' : ' tandas');
  };
  const forget = () => { plan = null; state = []; $('list').replaceChildren(); $('notes').replaceChildren(); $('progress').hidden = true; $('total').hidden = true; controls(); };
  function paint() {
    const done = state.filter(s => s.state === 'done'), people = done.reduce((n, s) => n + s.batch.people, 0), failed = state.some(s => s.state === 'failed');
    const share = plan?.people ? people / plan.people : 0;
    $('progress').hidden = !plan || !plan.batches.length;
    $('bar').style.setProperty('--mc-batch-progress', String(share)); $('bar').dataset.state = failed ? 'failed' : 'ok'; $('bar').setAttribute('aria-valuenow', String(Math.round(share * 100)));
    $('count').textContent = plan ? 'Tanda ' + Math.min(done.length + (busy ? 1 : 0), plan.batches.length) + ' de ' + plan.batches.length + ' · ' + people + ' de ' + plan.people + ' personas' : '';
    $('list').replaceChildren(...state.map(s => {
      const li = node('li', null, 'mc-batch-item'), text = node('p'); li.dataset.state = s.state;
      text.append(node('span', 'Tanda ' + s.batch.index + ' · ' + s.batch.people + ' personas · legajos ' + s.batch.firstLegajo + ' a ' + s.batch.lastLegajo));
      text.append(node('small', s.state === 'done' ? 'Lista en ' + s.seconds + ' s · neto ' + batchCalcMoney(s.totals.net) : s.state === 'running' ? 'Calculando…' : s.state === 'failed' ? s.error : 'En cola'));
      li.append(node('b', String(s.batch.index)), text);
      if (s.state === 'failed') { const again = node('button', 'Repetir esta tanda', 'button secondary'); again.type = 'button'; again.disabled = busy; again.addEventListener('click', () => run(s)); li.append(again); }
      return li;
    }));
    if (plan && done.length === plan.batches.length && done.length) {
      const sum = batchCalcSum(done.map(s => s.totals));
      $('total').replaceChildren(...[['Personas', String(sum.people)], ['Bruto', batchCalcMoney(sum.gross)], ['Descuentos', batchCalcMoney(sum.deduction)], ['Neto', batchCalcMoney(sum.net)]].map(([k, v]) => { const d = node('div'); d.append(node('dt', k), node('dd', v)); return d; }));
      $('total').hidden = false;
    } else $('total').hidden = true;
    controls();
  }
  async function load() {
    if (busy) return; busy = true; forget(); status('Trayendo el padrón propio…');
    try {
      rows = rosterRows(await getJson(ROSTER));
      const options = batchCalcAgreements(rows), select = $('agreement'), keep = select.value;
      select.replaceChildren(node('option', options.length ? 'Elegí un convenio' : 'No hay contratos activos'), ...options.map(o => { const option = node('option', o.agreement + ' · ' + o.people + (o.people === 1 ? ' persona' : ' personas')); option.value = o.agreement; return option; }));
      select.firstChild.value = ''; if (options.some(o => o.agreement === keep)) select.value = keep;
      status(options.length ? 'Elegí el convenio y tocá «Armar tandas».' : 'El padrón propio no tiene contratos activos.');
    } catch (e) { rows = null; status(e.message); } finally { busy = false; controls(); }
  }
  function arrange() {
    if (busy || !rows) return;
    try {
      const typed = batchCalcLegajos($('excluded').value);
      plan = batchCalcPlan(rows, { agreement: $('agreement').value, period: $('period').value, excluded: typed.valid });
      state = plan.batches.map(batch => ({ batch, state: 'queued', key: crypto.randomUUID(), totals: null, seconds: 0, error: '' })); boot = null;
      const notes = [];
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
      status(left ? 'Quedan ' + left + (left === 1 ? ' tanda' : ' tandas') + ' por calcular.' : 'Convenio calculado. Cada tanda quedó guardada como una corrida: revisalas y confirmalas en «Calcular».');
      if (!left) document.dispatchEvent(new CustomEvent('mc:pending-refresh'));
    } catch (e) { status(e.message); } finally { busy = false; paint(); }
  }
  $('load').addEventListener('click', load); $('plan').addEventListener('click', arrange); $('run').addEventListener('click', () => run());
  for (const name of ['agreement', 'period', 'excluded']) $(name).addEventListener('input', () => { if (plan && !busy) { forget(); status('Cambió el pedido. Tocá «Armar tandas» de nuevo.'); } else controls(); });
  status('Tocá «Traer convenios» para empezar.'); controls();
  return { load, arrange, run };
}
