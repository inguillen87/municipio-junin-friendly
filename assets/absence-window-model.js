// Selección de eventos administrativos por fecha. No calcula jornadas, saldos ni haberes.
export const ABSENCE_WINDOW_MODES = Object.freeze(['starts', 'overlaps']);
export function absenceWindowMode(value = 'starts') {
  if (typeof value !== 'string' || !ABSENCE_WINDOW_MODES.includes(value)) throw Error('ABSENCE_WINDOW_INVALID');
  return value;
}
export const absenceSourceDate = value => typeof value === 'string' && value >= '0001-01-01' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
const day = absenceSourceDate;
export function absenceMatchesWindow(event, from, to, mode = 'starts') {
  absenceWindowMode(mode);
  if (!day(from) || !day(to) || from > to || !day(event?.date)
      || event.untilDate !== null && !day(event.untilDate)) throw Error('ABSENCE_WINDOW_INVALID');
  if (event.date > to) return false;
  if (event.date >= from) return true;
  return mode === 'overlaps' && event.untilDate !== null
    && event.untilDate >= event.date && event.untilDate >= from;
}
export function absenceWindowRelation(event, from, to) {
  if (!absenceMatchesWindow(event, from, to, 'overlaps')) throw Error('ABSENCE_WINDOW_OUTSIDE');
  return event.date < from ? 'began_before' : 'starts_inside';
}
export function absenceWindowDateIntegrity(from, to) {
  if (to === null) return 'until_date_not_reported';
  if (!day(from) || !day(to)) return 'invalid_source_date';
  if (to < from) return 'inverted_source_range';
  return (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1 > 366
    ? 'extended_source_range' : 'valid_source_range';
}
