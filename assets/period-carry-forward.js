// «Traer lo aprobado el mes anterior»: arma el borrador del período nuevo con las declaraciones aprobadas en el
// anterior, para confirmarlas o corregirlas. No registra nada: la persona compara y propone, y otra aprueba.
// Una fila sólo se trae si es el mismo sujeto con la misma identidad; el resto queda como estaba.
export function previousPeriod(period) {
  const match = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(period ?? '');
  if (!match) throw new TypeError('PERIOD_INVALID');
  const year = Number(match[1]), month = Number(match[2]);
  return month === 1 ? String(year - 1).padStart(4, '0') + '-12' : match[1] + '-' + String(month - 1).padStart(2, '0');
}
// Los períodos válidos empiezan en enero de 1900: desde ahí no hay mes anterior que traer.
export const carryAvailable = period => /^([0-9]{4})-(0[1-9]|1[0-2])$/.test(period ?? '') && previousPeriod(period) >= '1900-01';
export function periodName(period) {
  const match = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(period ?? '');
  if (!match) throw new TypeError('PERIOD_INVALID');
  return ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(match[2]) - 1] + ' de ' + match[1];
}
export function carryForward(draft, approved, {id, token}) {
  if (!Array.isArray(draft) || !Array.isArray(approved) || typeof id !== 'string' || typeof token !== 'string') throw new TypeError('CARRY_FORWARD_INVALID');
  const previous = new Map(approved.map(item => [item[id], item]));
  if (previous.size !== approved.length) throw new TypeError('CARRY_FORWARD_DUPLICATE');
  let copied = 0, absent = 0, changed = 0;
  const next = draft.map(row => {
    const old = previous.get(row[id]);
    if (!old) { absent++; return row; }
    if (old[token] !== row[token]) { changed++; return row; }
    copied++; return {...row, definition: structuredClone(old.definition)};
  });
  // gone: declaraciones del mes anterior cuyo sujeto ya no está en el período nuevo. No se traen a ningún lado.
  return {draft: next, copied, absent, changed, gone: approved.length - copied - changed};
}
export function carrySummary(result, total, from) {
  const kept = result.absent + result.changed;
  return 'Se trajeron ' + result.copied + ' de ' + total + ' filas de lo aprobado en ' + periodName(from) + ', con su fecha y su constancia.'
    + (kept ? ' ' + kept + (kept === 1 ? ' queda como estaba porque no figura' : ' quedan como estaban porque no figuran') + ' en ese mes o cambió su identidad.' : '')
    + ' Revisá, corregí lo que cambió y compará. Todavía no se registró nada.';
}
