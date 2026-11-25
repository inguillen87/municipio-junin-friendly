// «Cálculo del mes» en Relojes: estado de cada reloj + cálculo por persona desde los relojes (simulación).
// Lee el preparte de cada punto en paralelo y el estado de la flota. No escribe nada: con el OK de Personal, las
// propuestas siguen el circuito de siempre (preparte → novedades → aprobación de otra persona).
import { verifyPreparte } from './attendance-preparte-model.js';
import { monthCalc, monthCalcCsv, staleClocks, weekdaysInMonth, MONTH_CALC_DEFAULTS } from './attendance-month-calc-model.js';
import { fractionLabel } from './attendance-tardiness-model.js';

const SITES = Object.freeze([
  { key: 'pm-14', label: 'Edificio Nuevo' }, { key: 'pm-10', label: 'Edificio Viejo' }, { key: 'pm-03', label: 'Galpón Municipal' },
  { key: 'pm-02', label: 'Compras y Suministros' }, { key: 'pm-05', label: 'Delegación La Colonia' }, { key: 'pm-06', label: 'Polideportivo La Colonia' },
]);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const nf = (v, d = 0) => v === null || v === undefined ? '—' : Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const monthNow = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const monthName = p => new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ago = h => h === null ? 'sin datos' : h < 1 ? 'hace minutos' : h < 48 ? 'hace ' + Math.round(h) + ' h' : 'hace ' + Math.round(h / 24) + ' días';

async function getJson(url) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok || !j || j.ok === false) throw Object.assign(Error(j?.error || 'No se pudo consultar.'), { status: r.status });
  return j;
}
async function readSite(site, period) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return verifyPreparte(await getJson('/api/internal-attendance?' + new URLSearchParams({ resource: 'clock-preparte', site: site.key, period })), period, site.key); }
    catch (e) { last = e; if (e.status && e.status < 500) break; await new Promise(r => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
}

export function mountAttendanceMonthCalc(host) {
  if (!host || host.dataset.monthCalcMounted) return null; host.dataset.monthCalcMounted = '';
  host.className = 'amc';
  host.innerHTML = `
  <header class="amc-head">
    <div><p class="amc-kicker">Tiempo y asistencia · cálculo automático</p><h2>Cálculo del mes desde los relojes</h2>
    <p class="amc-lead">Horas, mayor dedicación y tardanzas de cada persona, calculadas con las reglas de Liquidación. Es una simulación: revisalo acá y enviá a novedades desde el preparte; nada cambia sueldos sin la aprobación de otra persona.</p></div>
    <span class="amc-badge">Simulación</span>
  </header>
  <section class="amc-fleet" data-amc="fleet" aria-label="Estado de los relojes"><p class="amc-muted">Consultando relojes…</p></section>
  <div class="amc-controls">
    <label>Mes<input type="month" data-amc="period"></label>
    <label>Jornada base<span class="amc-suffix"><input type="number" min="1" max="12" step="0.5" data-amc="base"> h por día</span></label>
    <label>Días hábiles<span class="amc-suffix"><input type="number" min="1" max="31" step="1" data-amc="days"> días</span></label>
    <button type="button" class="amc-go" data-amc="go">Calcular</button>
  </div>
  <p class="amc-status" role="status" aria-live="polite" data-amc="status"></p>
  <div class="amc-progress" data-amc="progress" hidden><span data-amc="bar"></span></div>
  <div data-amc="result" hidden>
    <div class="amc-kpis" data-amc="kpis"></div>
    <div class="amc-tools">
      <input type="search" placeholder="Buscar persona o legajo" maxlength="80" data-amc="search" aria-label="Buscar persona o legajo">
      <div class="amc-chips" role="group" aria-label="Filtrar" data-amc="chips">
        <button type="button" data-f="all" aria-pressed="true">Todos</button>
        <button type="button" data-f="ded" aria-pressed="false">Con mayor dedicación</button>
        <button type="button" data-f="late" aria-pressed="false">Con tardanza</button>
        <button type="button" data-f="low" aria-pressed="false">Muchos días incompletos</button>
      </div>
      <button type="button" class="amc-ghost" data-amc="csv">Descargar planilla</button>
    </div>
    <div class="amc-table" role="region" aria-label="Cálculo por persona" tabindex="0"><table>
      <thead><tr><th data-s="name">Persona</th><th data-s="closed">Días completos</th><th data-s="hpd">Horas por día</th><th data-s="excess">Horas extra del mes</th><th data-s="ded">Mayor dedicación</th><th data-s="late">Tardanza</th><th data-s="nomark">Días sin marca</th></tr></thead>
      <tbody data-amc="rows"></tbody></table></div>
    <p class="amc-foot" data-amc="foot"></p>
  </div>`;
  const $ = k => host.querySelector(`[data-amc="${k}"]`);
  const state = { calc: null, sites: [], filter: 'all', sort: 'name', dir: 1, busy: false };
  $('period').value = monthNow(); $('base').value = String(MONTH_CALC_DEFAULTS.baseHours); $('days').value = String(weekdaysInMonth($('period').value));
  $('period').addEventListener('change', () => { try { $('days').value = String(weekdaysInMonth($('period').value)); } catch {} });

  async function fleet() {
    const box = $('fleet');
    try {
      const j = await getJson('/api/internal-clock-fleet'), list = staleClocks(j.devices), down = list.filter(d => d.stale);
      box.replaceChildren();
      const title = el('div', 'amc-fleet-title');
      title.append(el('strong', null, down.length ? `${down.length} de ${list.length} relojes sin transmitir` : 'Todos los relojes transmiten'),
        el('span', 'amc-muted', down.length ? 'La asistencia de esos puntos no está entrando. Revisá alimentación, red y conector.' : 'Últimas capturas dentro de las 24 h.'));
      box.dataset.alert = String(down.length > 0);
      const grid = el('div', 'amc-fleet-grid');
      for (const d of list) {
        const c = el('div', 'amc-clock'); c.dataset.stale = String(d.stale);
        c.append(el('span', 'amc-dot'), el('strong', null, (d.site || '').toUpperCase() + ' · ' + (d.label || '')), el('small', null, d.stale ? 'Sin transmitir · última ' + ago(d.hours) : 'Transmitiendo · ' + ago(d.hours)));
        grid.append(c);
      }
      box.append(title, grid);
    } catch (e) { box.replaceChildren(el('p', 'amc-muted', 'No se pudo consultar el estado de los relojes: ' + e.message)); }
  }

  async function run() {
    if (state.busy) return; state.busy = true; $('go').disabled = true;
    const period = $('period').value, baseHours = Number($('base').value), workDays = Number($('days').value);
    $('progress').hidden = false; $('bar').style.width = '4%'; $('status').textContent = 'Leyendo los relojes de ' + monthName(period) + '…';
    let done = 0; const failed = [];
    const results = await Promise.all(SITES.map(site => readSite(site, period).then(r => ({ site: { key: site.key, label: site.label }, rows: r.rows }))
      .catch(e => { failed.push(site.label + ' (' + e.message + ')'); return null; })
      .finally(() => { done++; $('bar').style.width = Math.round(done / SITES.length * 100) + '%'; $('status').textContent = `Leídos ${done} de ${SITES.length} relojes…`; })));
    try {
      state.sites = results.filter(Boolean);
      state.calc = monthCalc(state.sites, { period, baseHours, workDays: Number.isInteger(workDays) ? workDays : undefined });
      render();
      $('status').textContent = failed.length ? 'Calculado con ' + state.sites.length + ' de ' + SITES.length + ' relojes. Sin datos: ' + failed.join(', ') + '.' : 'Calculado ' + monthName(period) + ' con los ' + SITES.length + ' relojes.';
    } catch (e) { $('status').textContent = e.message; }
    finally { state.busy = false; $('go').disabled = false; setTimeout(() => { $('progress').hidden = true; }, 500); }
  }

  function kpi(label, value, note, tone) { const k = el('div', 'amc-kpi'); if (tone) k.dataset.tone = tone; k.append(el('span', 'amc-kpi-label', label), el('strong', 'amc-kpi-value', value), el('small', null, note)); return k; }
  function visible() {
    const q = $('search').value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const f = state.filter;
    const rows = state.calc.rows.filter(r => (f === 'all' || f === 'ded' && r.dedication > 0 || f === 'late' && r.tardiness?.percent > 0 || f === 'low' && r.daysObserved >= 3 && r.completeness < 0.5)
      && (!q || (r.name + ' ' + r.legajo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)));
    const key = { name: r => r.name, closed: r => r.completeness, hpd: r => r.hoursPerDay ?? -1, excess: r => r.projectedExcessHours ?? -1, ded: r => r.dedication ?? -1, late: r => r.tardiness?.totalLateMinutes ?? -1, nomark: r => r.daysWithoutMark }[state.sort];
    return rows.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'string' ? x.localeCompare(y, 'es') : x - y) * state.dir; });
  }
  function render() {
    const c = state.calc, s = c.summary; $('result').hidden = false;
    $('kpis').replaceChildren(
      kpi('Personas con legajo', nf(s.people), c.unlinked ? c.unlinked + ' identidades sin vínculo aparte' : 'todas vinculadas'),
      kpi('Días completos', nf(s.completeness * 100) + ' %', 'con entrada y salida', s.completeness < 0.7 ? 'warn' : 'good'),
      kpi('Con mayor dedicación', nf(s.withDedication), 'propuesta desde las horas', 'accent'),
      kpi('Horas extra del mes', nf(s.projectedExcessHours), 'sobre ' + nf(c.baseHours, 1) + ' h diarias × ' + c.workDays + ' días'),
      kpi('Con descuento por tardanza', nf(s.withTardiness), 'tabla de Junín, sumado en el mes', s.withTardiness ? 'warn' : null),
      kpi('Para revisar', nf(s.lowCompleteness), 'menos de la mitad de días completos', s.lowCompleteness ? 'warn' : null));
    const body = $('rows'), list = visible(); body.replaceChildren();
    for (const r of list) {
      const tr = el('tr');
      const who = el('td'); who.append(el('strong', null, r.name), el('small', null, 'Legajo ' + r.legajo + ' · ' + r.sites.join(' / ')));
      const comp = el('td'); const bar = el('div', 'amc-meter'); const fill = el('span'); fill.style.width = Math.round(r.completeness * 100) + '%'; fill.dataset.tone = r.completeness >= 0.8 ? 'good' : r.completeness >= 0.5 ? 'mid' : 'low'; bar.append(fill);
      comp.append(el('span', 'amc-num', r.closedDays + ' de ' + r.daysObserved), bar);
      const hpd = el('td', 'amc-num', r.hoursPerDay === null ? '—' : nf(r.hoursPerDay, 1) + ' h');
      const ex = el('td', 'amc-num', r.projectedExcessHours === null ? (r.closedDays ? 'pocos días' : '—') : nf(r.projectedExcessHours) + ' h');
      const ded = el('td'); if (r.dedication > 0) ded.append(el('span', 'amc-pill', r.dedication + ' %')); else ded.append(el('span', 'amc-muted', r.enough ? 'no corresponde' : 'sin datos suficientes'));
      const late = el('td'); if (r.tardiness?.percent > 0) late.append(el('span', 'amc-pill warn', fractionLabel(r.tardiness.percent)), el('small', null, r.tardiness.totalLateMinutes + ' min · ref. ' + r.tardiness.start));
      else late.append(el('span', 'amc-muted', r.tardiness ? 'sin descuento' : '—'));
      const nm = el('td', 'amc-num', String(r.daysWithoutMark));
      tr.append(who, comp, hpd, ex, ded, late, nm); body.append(tr);
    }
    if (!list.length) { const tr = el('tr'), td = el('td', 'amc-muted', 'No hay personas con ese filtro.'); td.colSpan = 7; tr.append(td); body.append(tr); }
    for (const th of host.querySelectorAll('th[data-s]')) th.setAttribute('aria-sort', th.dataset.s === state.sort ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
    $('foot').textContent = `${list.length} de ${c.rows.length} personas. Reglas: jornada base ${nf(c.baseHours, 1)} h por día hábil; mayor dedicación 5 % cada 6 h de excedente mensual (Acta Paritaria 20), proyectado desde los días completos y solo con ${MONTH_CALC_DEFAULTS.minCompleteDays} días completos o más; tardanzas según la tabla de Junín (Ley 5.811 art. 65) con entrada de referencia estimada. Un día sin marca no se presume ausencia: Personal lo califica.`;
  }

  $('go').addEventListener('click', run);
  $('search').addEventListener('input', () => state.calc && render());
  $('chips').addEventListener('click', e => { const b = e.target.closest('button[data-f]'); if (!b) return; state.filter = b.dataset.f; for (const x of $('chips').children) x.setAttribute('aria-pressed', String(x === b)); state.calc && render(); });
  host.querySelector('thead').addEventListener('click', e => { const th = e.target.closest('th[data-s]'); if (!th || !state.calc) return; if (state.sort === th.dataset.s) state.dir *= -1; else { state.sort = th.dataset.s; state.dir = th.dataset.s === 'name' ? 1 : -1; } render(); });
  $('csv').addEventListener('click', () => { if (!state.calc) return; const blob = new Blob(['﻿' + monthCalcCsv(state.calc)], { type: 'text/csv;charset=utf-8' }); const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'calculo-relojes-' + state.calc.period + '.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 0); });
  fleet();
  return { run };
}

if (typeof document !== 'undefined') {
  const start = () => { const anchor = document.querySelector('.page-head'); if (!anchor) return; const host = document.createElement('section'); host.id = 'attendanceMonthCalc'; anchor.after(host); mountAttendanceMonthCalc(host); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
