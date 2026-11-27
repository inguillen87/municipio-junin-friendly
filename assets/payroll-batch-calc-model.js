// Cálculo de un convenio completo en tandas.
// Cada corrida guarda su resultado íntegro (unos 0,21 MB por persona) y la plataforma admite hasta 32 MB por corrida:
// unas 150 personas. Un convenio más grande se calcula en varias corridas de contratos, todas del mismo mes.
export const BATCH_CALC_SIZE = 90;
export const BATCH_CALC_MAX_PEOPLE = 5000;
const LEGAJO = /^\d{1,9}$/;

// Legajos escritos o pegados, separados por espacio, coma, punto y coma o renglón.
export function batchCalcLegajos(text) {
  const seen = new Set(), valid = [], invalid = [];
  for (const raw of String(text ?? '').split(/[\s,;]+/u)) {
    const item = raw.trim(); if (!item) continue;
    if (!LEGAJO.test(item)) { if (!invalid.includes(item)) invalid.push(item.slice(0, 20)); continue; }
    const legajo = String(Number(item)); if (!seen.has(legajo)) { seen.add(legajo); valid.push(legajo); }
  }
  return { valid, invalid };
}

const canon = value => { const text = String(value ?? '').trim(); return LEGAJO.test(text) ? String(Number(text)) : text; };
const lastDay = period => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const batchCalcPeriod = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const batchCalcLiquidationDate = period => (batchCalcPeriod(period) ? lastDay(period) : '');

// Convenios presentes en el padrón propio, con cuántos contratos activos tiene cada uno.
export function batchCalcAgreements(rows) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.status !== 'active' || !row.contractId || typeof row.agreement !== 'string' || !row.agreement) continue;
    counts.set(row.agreement, (counts.get(row.agreement) ?? 0) + 1);
  }
  return [...counts].map(([agreement, people]) => ({ agreement, people })).sort((a, b) => a.agreement.localeCompare(b.agreement, 'es'));
}

// Arma las tandas: contratos activos del convenio que ya habían ingresado al cierre del mes, sin los legajos que este
// mes no se liquidan. Las tandas quedan parejas (292 personas → 4 de 73, no 3 de 90 y una de 22).
export function batchCalcPlan(rows, { agreement, period, excluded = [], size = BATCH_CALC_SIZE } = {}) {
  if (!batchCalcPeriod(period)) throw Error('Elegí el mes a calcular.');
  if (typeof agreement !== 'string' || !agreement) throw Error('Elegí el convenio.');
  if (!Number.isSafeInteger(size) || size < 1 || size > 150) throw Error('El tamaño de tanda no es válido.');
  const closing = lastDay(period), out = new Set(excluded.map(canon)), found = new Set(), people = [], notStarted = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.agreement !== agreement || row.status !== 'active' || !row.contractId) continue;
    const legajo = canon(row.legajo);
    if (out.has(legajo)) { found.add(legajo); continue; }
    if (typeof row.startDate === 'string' && row.startDate > closing) { notStarted.push(legajo); continue; }
    people.push({ contractId: row.contractId, legajo });
  }
  if (people.length > BATCH_CALC_MAX_PEOPLE) throw Error('El convenio supera la cantidad de personas admitida para un cálculo por tandas.');
  people.sort((a, b) => (Number(a.legajo) - Number(b.legajo)) || a.legajo.localeCompare(b.legajo) || a.contractId.localeCompare(b.contractId));
  const count = Math.ceil(people.length / size), batches = [];
  for (let i = 0; i < count; i += 1) {
    const part = people.slice(Math.round((i * people.length) / count), Math.round(((i + 1) * people.length) / count));
    batches.push({ index: i + 1, people: part.length, firstLegajo: part[0].legajo, lastLegajo: part.at(-1).legajo, contractIds: part.map(p => p.contractId).sort() });
  }
  return {
    agreement, period, liquidationDate: closing, people: people.length, batches,
    excluded: [...found].sort((a, b) => Number(a) - Number(b)),
    excludedNotFound: [...out].filter(l => !found.has(l)).sort((a, b) => Number(a) - Number(b)),
    notStarted: notStarted.sort((a, b) => Number(a) - Number(b)),
  };
}

// Suma exacta en centavos de los totales por persona que devuelve cada corrida.
const cents = value => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''));
  if (!match) throw Error('La corrida devolvió un importe que no se pudo leer.');
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -amount : amount;
};
const money = value => { const sign = value < 0n ? '-' : '', abs = value < 0n ? -value : value; return sign + (abs / 100n).toString() + '.' + (abs % 100n).toString().padStart(2, '0'); };
export function batchCalcTotals(employeeTotals) {
  let gross = 0n, deduction = 0n, net = 0n;
  for (const total of Array.isArray(employeeTotals) ? employeeTotals : []) { gross += cents(total.gross); deduction += cents(total.deduction); net += cents(total.net); }
  return { people: Array.isArray(employeeTotals) ? employeeTotals.length : 0, gross: money(gross), deduction: money(deduction), net: money(net) };
}
export function batchCalcSum(parts) {
  let people = 0, gross = 0n, deduction = 0n, net = 0n;
  for (const part of parts) { people += part.people; gross += cents(part.gross); deduction += cents(part.deduction); net += cents(part.net); }
  return { people, gross: money(gross), deduction: money(deduction), net: money(net) };
}
export const batchCalcMoney = value => { const [whole, decimals] = String(value).split('.'); return '$\u00a0' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + (decimals ?? '00'); };
