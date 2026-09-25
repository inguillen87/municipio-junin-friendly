import { absenceWindowMode } from '../assets/absence-window-model.js';
// Fragmentos fijos. Los valores de fechas se enlazan como parámetros por el llamador.
export function absenceWindowSql(alias, mode = 'starts', from = '$1', to = '$2') {
  absenceWindowMode(mode);
  if (!['a', 'absence'].includes(alias) || !['$1', '$3'].includes(from)
      || !['$2', '$4'].includes(to) || Number(to.slice(1)) !== Number(from.slice(1)) + 1) {
    throw Error('ABSENCE_WINDOW_SQL_INVALID');
  }
  return mode === 'starts'
    ? `${alias}.fecha >= ${from}::date AND ${alias}.fecha <= ${to}::date`
    : `${alias}.fecha <= ${to}::date AND (${alias}.fecha >= ${from}::date OR (${alias}.fecha_hasta >= ${alias}.fecha AND ${alias}.fecha_hasta >= ${from}::date))`;
}
