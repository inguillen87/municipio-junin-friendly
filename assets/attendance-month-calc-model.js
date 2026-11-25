// Cálculo del mes desde los relojes (simulación). Puro: no consulta, no escribe y no liquida.
// Une el preparte de cada punto de marcación por legajo y aplica las reglas por defecto que Liquidación usa hoy:
// jornada base contractual (30 h semanales = 6 h por día hábil, Acta Paritaria 20), mayor dedicación al 5 % cada 6 h
// del excedente mensual, y tardanzas sumadas en el mes según la tabla de Junín (Ley 5.811 art. 65). El resultado es una
// propuesta para revisar: un día incompleto no se inventa y un día sin marca no se presume ausencia.
import { dedicationPercent } from './attendance-preparte-model.js';
import { referenceStart, monthlyTardiness } from './attendance-tardiness-model.js';

export const MONTH_CALC_DEFAULTS = Object.freeze({ baseHours: 6, minCompleteDays: 5 });

/** Días hábiles (lunes a viernes) del mes. Los feriados se descuentan a mano en la pantalla. */
export function weekdaysInMonth(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) throw Error('Período inválido.');
  const [y, m] = period.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

/**
 * sites: [{site:{key,label}, rows:[preparte rows]}]. Devuelve una fila por legajo vinculado (las identidades sin
 * legajo se cuentan aparte) con días, horas, excedente, mayor dedicación propuesta y tardanza.
 */
export function monthCalc(sites, { period, baseHours = MONTH_CALC_DEFAULTS.baseHours, workDays, minCompleteDays = MONTH_CALC_DEFAULTS.minCompleteDays } = {}) {
  if (!Number.isFinite(baseHours) || baseHours <= 0 || baseHours > 12) throw Error('La jornada base debe estar entre 1 y 12 horas.');
  const days = Number.isInteger(workDays) && workDays > 0 && workDays <= 31 ? workDays : weekdaysInMonth(period);
  const people = new Map(); let unlinked = 0;
  for (const { site, rows } of sites) {
    for (const r of rows || []) {
      if (!r.legajo) { unlinked++; continue; }
      if (!people.has(r.legajo)) people.set(r.legajo, { legajo: r.legajo, name: r.name, sites: [], daysObserved: 0, daysToReview: 0, ordinarySeconds: 0, ordinaryKnown: true, entries: [] });
      const p = people.get(r.legajo);
      p.sites.push(site.label || site.key); p.daysObserved += r.daysObserved; p.daysToReview += r.daysToReview;
      if (r.ordinarySeconds === null) p.ordinaryKnown = false; else p.ordinarySeconds += r.ordinarySeconds;
      p.entries.push(...(r.entries || []));
    }
  }
  const result = [...people.values()].map(p => {
    const closedDays = Math.max(0, p.daysObserved - p.daysToReview);
    const completeness = p.daysObserved ? closedDays / p.daysObserved : 0;
    const hoursPerDay = p.ordinaryKnown && closedDays ? p.ordinarySeconds / 3600 / closedDays : null;
    const enough = hoursPerDay !== null && closedDays >= minCompleteDays;
    // Excedente del mes: lo que pasa la jornada base en los días completos, proyectado a los días hábiles del mes.
    const excessPerDay = hoursPerDay === null ? null : Math.max(0, hoursPerDay - baseHours);
    const projectedExcessHours = enough ? excessPerDay * days : null;
    const dedication = enough ? dedicationPercent(Math.round(projectedExcessHours * 3600)) : null;
    // Tardanza: entrada de referencia estimada por sus marcas (Personal la confirma) y minutos sumados en el mes.
    const entries = [...new Set(p.entries)].sort();
    let tardiness = null;
    if (entries.length) {
      try { const start = referenceStart(entries); tardiness = { start, ...pick(monthlyTardiness({ period, entries, start, legajo: p.legajo })) }; } catch { tardiness = null; }
    }
    return {
      legajo: p.legajo, name: p.name, sites: [...new Set(p.sites)], daysObserved: p.daysObserved, closedDays,
      completeness, hoursPerDay, excessPerDay, projectedExcessHours, dedication, enough,
      daysWithoutMark: Math.max(0, days - p.daysObserved), tardiness,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const linked = result.length, totalObserved = result.reduce((s, r) => s + r.daysObserved, 0), totalClosed = result.reduce((s, r) => s + r.closedDays, 0);
  return {
    period, baseHours, workDays: days, rows: result, unlinked,
    summary: {
      people: linked,
      completeness: totalObserved ? totalClosed / totalObserved : 0,
      withDedication: result.filter(r => r.dedication > 0).length,
      projectedExcessHours: result.reduce((s, r) => s + (r.projectedExcessHours || 0), 0),
      withTardiness: result.filter(r => r.tardiness && r.tardiness.percent > 0).length,
      lowCompleteness: result.filter(r => r.daysObserved >= 3 && r.completeness < 0.5).length,
    },
  };
}
function pick(t) { return { totalLateMinutes: t.totalLateMinutes, lateDays: t.lateDays, percent: t.percent, units: t.units }; }

/** CSV para revisar fuera del sistema. Celdas protegidas contra fórmulas. */
export function monthCalcCsv(calc) {
  const cell = v => { let s = v === null || v === undefined ? '' : String(v); if (/^\s*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const head = ['Legajo', 'Persona', 'Puntos', 'Días con marca', 'Días completos', 'Completitud %', 'Horas por día completo', 'Excedente proyectado (h)', 'Mayor dedicación propuesta %', 'Entrada de referencia', 'Minutos tarde', 'Descuento tardanza %', 'Días hábiles sin marca'];
  const rows = calc.rows.map(r => [r.legajo, r.name, r.sites.join(' / '), r.daysObserved, r.closedDays, Math.round(r.completeness * 100),
    r.hoursPerDay === null ? '' : r.hoursPerDay.toFixed(2), r.projectedExcessHours === null ? '' : r.projectedExcessHours.toFixed(1),
    r.dedication ?? '', r.tardiness?.start ?? '', r.tardiness?.totalLateMinutes ?? '', r.tardiness?.percent ?? '', r.daysWithoutMark]);
  return [head, ...rows].map(line => line.map(cell).join(';')).join('\r\n');
}

/** Relojes sin capturas recientes (por defecto, más de 24 h). */
export function staleClocks(devices, now = Date.now(), maxHours = 24) {
  return (devices || []).map(d => {
    const at = Date.parse(d.lastCapturedAt || '');
    const hours = Number.isFinite(at) ? (now - at) / 3600000 : null;
    return { site: d.siteKey, label: d.label, model: d.model, lastCapturedAt: d.lastCapturedAt || null, hours, stale: hours === null || hours > maxHours };
  }).sort((a, b) => (b.hours ?? 1e9) - (a.hours ?? 1e9));
}
