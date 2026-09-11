import {civilDate} from './civil-date.js';

/** Read-only summary contract. Missing source amounts are not zero. */
export const SUMMARY_FIELDS = Object.freeze({
  subjectEarnings: 'Haberes remunerativos',
  nonSubjectEarnings: 'Haberes no remunerativos',
  familyAllowance: 'Asignaciones familiares',
  employeeWithholdings: 'Retenciones del empleado',
  netPayable: 'Neto informado',
  employerContributions: 'Contribuciones patronales'
});
const labels = {monthly:'Mensual', first_fortnight:'Primera quincena', second_fortnight:'Segunda quincena', sac:'Sueldo anual complementario', vacation:'Vacaciones', supplementary:'Complementaria', final:'Liquidación final', other:'Otra liquidación'};
const arithmeticFields = Object.keys(SUMMARY_FIELDS).slice(0, 5);
const decimal = /^(-?)(0|[1-9][0-9]{0,23})\.([0-9]{2})$/;

export function money(value) {
  const match = typeof value === 'string' && decimal.exec(value);
  if (!match) throw Error('Importe no disponible o inválido');
  return '$ ' + match[1] + new Intl.NumberFormat('es-AR').format(BigInt(match[2])) + ',' + match[3];
}
function text(value, max, label) {
  if (typeof value !== 'string') throw Error('Falta ' + label + ' en la ficha. Volvé a consultar el legajo.');
  const cleaned = value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > max) throw Error('Revisá ' + label + ' en la ficha antes de descargar.');
  return cleaned;
}
function identity(employee) {
  if (!employee || typeof employee !== 'object') throw Error('Volvé a consultar la ficha del legajo.');
  // `nombre` is the actual employee API property. Other documented callers use English aliases.
  const rawName = [employee.nombre, employee.fullName, employee.name, employee.full_name]
    .find(v => typeof v === 'string' && v.trim());
  const name = text(rawName, 150, 'el nombre de la persona');
  const rawLegajo = employee.legajo ?? employee.legacyLegajo;
  const legajo = typeof rawLegajo === 'number' && Number.isSafeInteger(rawLegajo) && rawLegajo >= 0
    ? String(rawLegajo) : text(rawLegajo, 20, 'el número de legajo');
  if (!/^[0-9]{1,20}$/.test(legajo)) throw Error('Revisá el número de legajo antes de descargar.');
  return {name, legajo};
}
const cents = value => BigInt(value.replace('.', ''));
function formatCents(value) {
  const absolute = value < 0n ? -value : value;
  return money((value < 0n ? '-' : '') + absolute / 100n + '.' + String(absolute % 100n).padStart(2, '0'));
}
export function salarySummaryModel(employee, item) {
  const {name, legajo} = identity(employee);
  if (!item || typeof item !== 'object') throw Error('Consultá una liquidación antes de descargar.');
  const date = civilDate(item.payrollDate);
  const values = {}, missingFields = [];
  for (const [key, label] of Object.entries(SUMMARY_FIELDS)) {
    if (item[key] === null || item[key] === undefined) {
      values[key] = 'No informado';
      missingFields.push(key);
    } else {
      try { values[key] = money(item[key]); }
      catch { throw Error('El importe de ' + label.toLowerCase() + ' tiene un formato inválido. Volvé a consultar.'); }
    }
  }
  if (missingFields.length === Object.keys(SUMMARY_FIELDS).length) throw Error('Esta liquidación no tiene importes disponibles para el resumen.');
  const complete = arithmeticFields.every(key => !missingFields.includes(key));
  const differenceCents = complete
    ? cents(item.subjectEarnings) + cents(item.nonSubjectEarnings) + cents(item.familyAllowance) - cents(item.employeeWithholdings) - cents(item.netPayable)
    : null;
  const matches = complete ? differenceCents >= -1n && differenceCents <= 1n : null;
  return {
    name, legajo, date,
    type: labels[item.canonicalPayrollType] || 'Tipo no identificado',
    sourceType: typeof item.payrollType === 'string' ? item.payrollType : (item.canonicalPayrollType || 'unknown'),
    status: item.presentationStatus === 'open' ? 'PRELIQUIDACIÓN / CONSULTA'
      : item.closureStatus === 'closed' || String(item.presentationStatus).startsWith('closed')
        ? 'RESUMEN DE FUENTE CERRADA' : 'CONSULTA / ESTADO NO CERTIFICADO',
    values, missingFields,
    sourceCutoff: item.sourceCutoff === null || item.sourceCutoff === undefined || item.sourceCutoff === ''
      ? 'No informado' : text(item.sourceCutoff, 60, 'el corte de la fuente'),
    difference: complete ? formatCents(differenceCents) : null,
    matches,
    reconciliationStatus: !complete ? 'not_evaluable' : matches ? 'matched' : 'mismatch',
    concepts: Number.isSafeInteger(item.distinctConcepts) && item.distinctConcepts >= 0 ? String(item.distinctConcepts) : 'No informado'
  };
}

/** Verify the selected row against a fresh, authorized read of the original page. */
export function verifySalarySummarySnapshot(employee, original, payload) {
  const expected = salarySummaryModel(employee, original);
  if (payload?.ok !== true || !Array.isArray(payload?.data?.items)) throw Error('No se pudo verificar el período. Volvé a consultar el historial.');
  const rows = payload.data.items.filter(row => row && civilDate(row.payrollDate) === expected.date
    && (row.payrollType ?? row.canonicalPayrollType ?? 'unknown') === expected.sourceType);
  if (rows.length !== 1) throw Error('El período cambió o no es unívoco. Cerrá y volvé a abrir el historial.');
  if (JSON.stringify(salarySummaryModel(employee, rows[0])) !== JSON.stringify(expected)) {
    throw Error('Los datos del período cambiaron. Cerrá y volvé a abrir la ficha antes de descargar.');
  }
  return rows[0];
}
