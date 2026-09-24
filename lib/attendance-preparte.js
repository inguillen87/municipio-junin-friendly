// Read-only monthly summary of recorded attendance, not payroll authorization.
import { createHash } from 'node:crypto';
import { AttendanceGatewayError } from './internal-attendance-gateway.js';
export function preparteMonth(period) {
  if (typeof period !== 'string' || !/^20(?:0[8-9]|[1-9]\d)-(0[1-9]|1[0-2])$/.test(period)) {
    throw new AttendanceGatewayError('ATTENDANCE_PREPARTE_PERIOD_INVALID', 400, 'Seleccioná un mes entre 2008 y 2099.');
  }
  const [year, month] = period.split('-').map(Number);
  return { from: period + '-01', to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}
function overlapping(intervals) {
  const sorted = [...intervals].sort((a, b) => a.startLocal.localeCompare(b.startLocal));
  let end = '';
  for (const interval of sorted) {
    if (interval.startLocal < end) return true;
    if (interval.endLocal > end) end = interval.endLocal;
  }
  return false;
}
export function summarizePreparte(raw, result, period) {
  if (!raw.nominalReadAllowed) throw new AttendanceGatewayError('ATTENDANCE_CAPABILITY_REQUIRED', 403, 'El preparte requiere permiso para consultar legajos.');
  const bounds = preparteMonth(period), groups = new Map();
  if (raw.filters.from !== bounds.from || raw.filters.to !== bounds.to) throw new AttendanceGatewayError('ATTENDANCE_PREPARTE_INVALID', 503, 'El corte no corresponde al mes solicitado.');
  const eventSources = new Map(raw.events.map(event => [event.eventRef, event]));
  for (const row of result.rows) {
    const id = row.legajo === null ? 'unlinked:' + row.personKey : 'legajo:' + row.legajo;
    if (!groups.has(id)) groups.set(id, { id, legajo: row.legajo, name: row.personLabel, keys: new Set(), streams: new Set(), days: new Set(), reviewDays: new Set(), proofs: [], intervals: [], extraSeconds: 0, ordinarySeconds: 0, issues: new Set() });
    const group = groups.get(id); group.keys.add(row.personKey); group.days.add(row.day);
    for (const event of row.events) {
      const source = eventSources.get(event.eventRef);
      if (!source) throw new AttendanceGatewayError('ATTENDANCE_PREPARTE_INVALID',503,'Una marca reconstruida no tiene referencia de origen.');
      group.streams.add(JSON.stringify([source.streamKey,source.deviceKey]));
    }
    if (row.status !== 'closed') { group.reviewDays.add(row.day); group.issues.add('Jornadas con incidencias'); }
    if (!row.legajo || row.identityState !== 'mapped') group.issues.add('Vínculo de identidad pendiente');
    group.proofs.push(JSON.stringify([row.day,row.status,row.identityState,row.intervals,row.events.map(e=>[e.eventRef,e.localTimestamp,e.code,e.issues])]));
    group.intervals.push(...row.intervals);
    group.extraSeconds += row.extraSeconds; group.ordinarySeconds += row.ordinarySeconds;
  }
  const rows = [...groups.values()].map(group => {
    const overlap = overlapping(group.intervals);
    if (overlap) group.issues.add('Tramos superpuestos: no se suman como tiempo utilizable');
    if (group.keys.size > 1) group.issues.add('Más de una identidad para el mismo legajo');
    if (group.streams.size > 1) group.issues.add('Más de un vínculo o equipo para el mismo legajo: revisar por separado');
    const distinctSource = group.keys.size <= 1 && group.streams.size === 1;
    if (raw.observations.length) group.issues.add('La fuente contiene marcas sin fecha o identidad utilizable');
    const extraIntervals = group.intervals.filter(item => item.kind === 'extra').length;
    if (!extraIntervals) group.issues.add('Sin tiempo extra reconstruido');
    return {
      key: createHash('sha256').update('preparte-v1:' + raw.site.key + ':' + period + ':' + group.id).digest('hex'),
      legajo: group.legajo === null ? null : String(group.legajo), name: group.name,
      daysObserved: group.days.size, daysToReview: group.reviewDays.size,
      ordinarySeconds: overlap || !distinctSource ? null : group.ordinarySeconds,
      extraSeconds: overlap || !distinctSource || !extraIntervals ? null : group.extraSeconds,
      evidenceHash: createHash('sha256').update(JSON.stringify([group.name,[...group.keys].sort(),[...group.streams].sort(),group.proofs.sort(),[...group.issues].sort()])).digest('hex'),
      extraIntervals, issues: [...group.issues], canPropose: group.issues.size === 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es') || (a.legajo || '').localeCompare(b.legajo || ''));
  if (rows.length > 2000) throw new AttendanceGatewayError('ATTENDANCE_PREPARTE_TOO_LARGE', 413, 'El punto supera 2.000 identidades; requiere un corte menor.');
  return {
    version: 'attendance-preparte.v1', period, site: raw.site, snapshotId: raw.revision,
    evidenceHash: createHash('sha256').update(JSON.stringify([period,raw.site,raw.timezone,result.rules,
      raw.events.map(e=>[e.eventRef,e.streamKey,e.deviceKey,e.localTimestamp,e.code,e.identityState,e.legajo,e.personLabel,e.issues]).sort((a,b)=>a[0].localeCompare(b[0])),
      raw.observations.map(e=>[e.eventRef,e.localTimestamp,e.issues]).sort((a,b)=>a[0].localeCompare(b[0]))])).digest('hex'),
    generatedAt: raw.generatedAt, timezone: raw.timezone, rulesVersion: result.rules.version,
    lastReceiptAt: raw.collection.lastReceiptAt, sourceComplete: true, coverageCertified: false,
    payrollCalculated: false, payrollPosted: false, nominalReadAllowed: true,
    observations: raw.observations.length, rows,
    summary: { people: rows.length, readyForReview: rows.filter(row => row.canPropose).length,
      withIncidents: rows.filter(row => !row.canPropose).length },
  };
}
