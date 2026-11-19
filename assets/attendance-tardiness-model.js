// Monthly tardiness proposal from the clock preparte. Pure: no request, no payroll write, no sanction.
// Default rule until Personal/Liquidación say otherwise (owner decision, 05/11/2026): Ley 5.811 art. 65 (applies to
// municipalities by its art. 36) as Junín's Liquidación table applies it: the same thresholds (15 min, 1 h, 2 h 30),
// minutes accumulated over the calendar month, 5 minutes without discount and 3/4 of a day between 1 h and 2 h 30
// (a range the law leaves open). The proposal is concept 101 (the GRH clock module sent tardiness there,
// ctrlparam conceptoTardanza = 101) in fractions of a working day, and always goes through independent review.
import { JUNIN_TARDINESS_CANDIDATE, evaluateTardinessBand } from './junin-tardiness-policy.js';
import { verifyPreparte, reviewPreparteSelections } from './attendance-preparte-model.js';

export const TARDINESS_DEFAULT = Object.freeze({
  key: 'junin-monthly-tardiness-default-2026-11-05',
  status: 'default_until_confirmed',
  accumulation: 'calendar_month',
  concept: '101',
  unit: 'jornada',
  bands: JUNIN_TARDINESS_CANDIDATE.evaluationBands,
  law: 'Ley 5.811 art. 65 (art. 36: municipios): hasta 15 min ¼ de jornada; hasta 1 h ½; más de 2 h 30 la jornada completa',
  local: 'Tabla de tardanzas de Liquidación (agosto de 2026): mismos tramos sumados en el mes, 5 min sin descuento, ¾ entre 1 h y 2 h 30',
  exceptions: 'Las ventanas autorizadas por Personal (excepciones horarias) no cuentan como tardanza',
});

export const EXCEPTION_KINDS = Object.freeze({
  entrada_diferida: 'Entrada diferida', salida_transitoria: 'Salida transitoria',
  salida_anticipada: 'Salida anticipada', exento: 'Sin control horario',
});
export const EXCEPTION_CATEGORIES = Object.freeze({
  cuidado_familiar: 'Cuidado familiar', salud: 'Salud', lactancia: 'Lactancia', estudio: 'Estudio',
  gremial: 'Actividad gremial', traslado: 'Traslado', otro: 'Otro motivo',
});

const UNITS = Object.freeze({ 25: '0.25', 50: '0.5', 75: '0.75', 100: '1' });
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HHMMSS = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

export function clockSeconds(value) {
  const match = typeof value === 'string' ? HHMMSS.exec(value) || HHMM.exec(value) : null;
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

const isoWeekday = date => { const day = new Date(date + 'T00:00:00Z').getUTCDay(); return day === 0 ? 7 : day; };

/** Reference start from the person's own arrivals: median arrival + 15 min, down to the whole hour. Reviewer edits it. */
export function referenceStart(entries) {
  const seconds = (Array.isArray(entries) ? entries : []).map(e => clockSeconds(String(e).slice(3))).filter(Number.isInteger).sort((a, b) => a - b);
  if (!seconds.length) return '';
  const median = seconds[Math.floor((seconds.length - 1) / 2)];
  const hour = Math.min(23, Math.floor((median + 15 * 60) / 3600));
  return String(hour).padStart(2, '0') + ':00';
}

/** Exceptions registered by Personal that apply to this legajo on this civil date. */
export function activeExceptions(exceptions, legajo, date) {
  if (!Array.isArray(exceptions) || !legajo) return [];
  const weekday = isoWeekday(date);
  return exceptions.filter(item => item && item.legajo === legajo && item.validFrom <= date && (!item.validTo || date <= item.validTo)
    && (!item.revokedAt || date < String(item.revokedAt).slice(0, 10)) && Array.isArray(item.weekdays) && item.weekdays.includes(weekday));
}

/** Whole minutes between the reference start and the arrival that no authorized window covers. */
export function dayLateMinutes({ arrival, start, exceptions = [] }) {
  const from = clockSeconds(start), to = clockSeconds(arrival);
  if (from === null || to === null) throw Error('Hora inválida.');
  if (exceptions.some(item => item.kind === 'exento')) return { lateMinutes: 0, excused: to > from };
  if (to <= from) return { lateMinutes: 0, excused: false };
  const windows = exceptions.map(item => [clockSeconds(item.from), clockSeconds(item.to)])
    .filter(([a, b]) => a !== null && b !== null && a < b).sort((a, b) => a[0] - b[0]);
  let covered = 0, cursor = from;
  for (const [a, b] of windows) {
    const left = Math.max(a, cursor), right = Math.min(b, to);
    if (right > left) { covered += right - left; cursor = right; }
  }
  const late = Math.floor((to - from - covered) / 60);
  return { lateMinutes: late, excused: covered > 0 };
}

/** Month for one person: arrivals 'DD HH:MM:SS' from the preparte, reference start 'HH:MM'. */
export function monthlyTardiness({ period, entries, start, legajo, exceptions = [] }) {
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw Error('Período inválido.');
  if (clockSeconds(start) === null || !HHMM.test(start)) throw Error('Usá la entrada de referencia en HH:MM. Ejemplo: 07:00.');
  const days = (Array.isArray(entries) ? entries : []).map(entry => {
    const date = period + '-' + String(entry).slice(0, 2), arrival = String(entry).slice(3);
    const applied = activeExceptions(exceptions, legajo, date);
    return { date, arrival, ...dayLateMinutes({ arrival, start, exceptions: applied }), exceptionIds: applied.map(item => item.id) };
  });
  const totalLateMinutes = days.reduce((sum, day) => sum + day.lateMinutes, 0);
  const band = evaluateTardinessBand(totalLateMinutes), percent = band.candidateJornadaDiscountPercent;
  return Object.freeze({
    period, start, days: Object.freeze(days.map(Object.freeze)), totalLateMinutes,
    lateDays: days.filter(day => day.lateMinutes > 0).length, excusedDays: days.filter(day => day.excused).length,
    band, percent, units: UNITS[percent] ?? null,
  });
}

export function fractionLabel(percent) {
  return { 0: 'Sin descuento', 25: '¼ de jornada', 50: '½ jornada', 75: '¾ de jornada', 100: 'Jornada completa' }[percent] ?? percent + ' %';
}

/** Reviewed tardiness selections → concept 101 sheet rows. Global document/acknowledgment checks are left to the caller. */
export function reviewTardinessSelections(data, decisions, { documentReference = '', exceptions = null } = {}) {
  const issues = [], rows = [];
  const issue = (key, field, message) => issues.push(Object.freeze({ key, field, message }));
  verifyPreparte(data, data?.period, data?.site?.key);
  if (!(decisions instanceof Map)) throw Error('Decisiones de tardanza inválidas.');
  const known = new Set(data.rows.map(row => row.key));
  if ([...decisions.keys()].some(key => !known.has(key))) issue(null, 'source', 'Una decisión de tardanza pertenece a otro corte. Volvé a consultar.');
  let selected = 0;
  for (const source of data.rows) {
    const value = decisions.get(source.key); if (!value?.selected) continue;
    selected++;
    const prefix = 'Legajo ' + (source.legajo || 'sin vínculo') + ' · tardanzas: ';
    if (value.selected !== true) { issue(source.key, 'td-selected', prefix + 'la selección no es válida.'); continue; }
    if (!source.entryReady || !source.legajo) { issue(source.key, 'td-selected', prefix + 'resolvé primero el vínculo de identidad o de equipo.'); continue; }
    if (!Array.isArray(exceptions)) { issue(source.key, 'td-selected', prefix + 'no se pudieron leer las excepciones horarias de Personal; no se propone descuento.'); continue; }
    let month;
    try { month = monthlyTardiness({ period: data.period, entries: source.entries, start: value.start, legajo: source.legajo, exceptions }); }
    catch (error) { issue(source.key, 'td-start', prefix + error.message); continue; }
    if (!month.units) { issue(source.key, 'td-selected', prefix + 'con ' + month.totalLateMinutes + ' min acumulados no corresponde descuento.'); continue; }
    const observation = `Preparte ${data.period}; punto ${data.site.key}; evidencia ${source.evidenceHash}; tardanzas ${month.lateDays} días, ${month.totalLateMinutes} min sobre entrada ${month.start}; excepciones aplicadas en ${month.excusedDays} días; Ley 5.811 art. 65 y tabla de Junín: ${fractionLabel(month.percent)}; pendiente de revisión independiente.`;
    rows.push(Object.freeze([source.legajo, TARDINESS_DEFAULT.concept, '', '', month.units, '', '', String(documentReference).trim(), observation, 'NO']));
  }
  return Object.freeze({ selected, issues: Object.freeze(issues), rows: Object.freeze(rows) });
}

/** Dedication and tardiness reviewed together: one document, one acknowledgment, one atomic transfer. */
export function reviewPreparteAll(data, dedication, tardiness, { documentReference, confirmed, exceptions } = {}) {
  const any = map => map instanceof Map && [...map.values()].some(value => value?.selected);
  const issues = [];
  let md = { selected: 0, issues: [], rows: [] };
  if (any(dedication) || !any(tardiness)) md = reviewPreparteSelections(data, dedication, { documentReference, confirmed });
  else {
    try { verifyPreparte(data, data?.period, data?.site?.key); }
    catch { return Object.freeze({ valid: false, selected: 0, issues: Object.freeze([Object.freeze({ key: null, field: 'source', message: 'Consultá nuevamente un preparte completo y vigente antes de revisar.' })]), rows: Object.freeze([]) }); }
    const reference = typeof documentReference === 'string' ? documentReference.trim() : '';
    if (reference.length < 5 || reference.length > 160 || /[<>\x00-\x1f\x7f]/.test(reference)) issues.push(Object.freeze({ key: null, field: 'reference', message: 'Indicá el documento que respalda horas, topes y porcentajes.' }));
    if (confirmed !== true) issues.push(Object.freeze({ key: null, field: 'reviewed', message: 'Confirmá la revisión de las filas seleccionadas contra la documentación de Personal.' }));
  }
  const td = any(tardiness) ? reviewTardinessSelections(data, tardiness, { documentReference, exceptions }) : { selected: 0, issues: [], rows: [] };
  const all = [...md.issues, ...issues, ...td.issues], selected = md.selected + td.selected;
  if (selected > 500) all.push(Object.freeze({ key: null, field: 'selected', message: 'Seleccioná hasta 500 filas en total.' }));
  const valid = all.length === 0;
  return Object.freeze({ valid, selected, issues: Object.freeze(all), rows: Object.freeze(valid ? [...md.rows, ...td.rows] : []) });
}
