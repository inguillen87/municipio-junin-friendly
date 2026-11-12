// Vista simple del maestro salarial: los valores de un convenio en un mes, escritos como se leen.
// Sólo elige, ordena y da formato a las definiciones ya registradas. No calcula haberes, no completa valores que
// faltan y no cambia ninguno: un valor no informado se muestra como no informado, nunca como cero.
import {SALARY_NATURES} from './native-salary-catalog-model.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const isMonth = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const natural = (a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b), 'es');
const plain = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const salaryMonthLabel = m => isMonth(m) ? MONTHS[Number(m.slice(5)) - 1] + ' de ' + m.slice(0, 4) : '';
export const salaryMonthTitle = m => { const label = salaryMonthLabel(m); return label ? label[0].toUpperCase() + label.slice(1) : ''; };
export const salaryPreviousMonth = m => { const y = Number(m.slice(0, 4)), n = Number(m.slice(5)); return n === 1 ? (y - 1) + '-12' : y + '-' + String(n - 1).padStart(2, '0'); };
const nextMonth = m => { const y = Number(m.slice(0, 4)), n = Number(m.slice(5)); return n === 12 ? (y + 1) + '-01' : y + '-' + String(n + 1).padStart(2, '0'); };

/** Un número exacto con punto de miles y coma decimal, sin pasar por coma flotante. Quita los ceros finales que no dicen
 *  nada («382692.71000» → «382.692,71») y conserva los que sí («962359.6050» → «962.359,605»). */
export function salaryExactText(value, minDecimals = 0) {
  const m = /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(typeof value === 'string' ? value : '');
  if (!m) return null;
  const decimals = (m[3] ?? '').replace(/0+$/, '').padEnd(minDecimals, '0');
  return m[1] + m[2].replace(/^0+(?=[0-9])/, '').replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.') + (decimals ? ',' + decimals : '');
}

const UNIT_WORDS = {hours: ['hora', 'horas'], minutes: ['minuto', 'minutos'], days: ['día', 'días'], units: ['unidad', 'unidades']};
/** El valor de una definición como lo lee una persona: «$ 382.692,71», «10 %», «30 días», «1,5 (coeficiente)».
 *  Devuelve null cuando el valor no está informado. */
export function salaryValueText(item) {
  if (!item || item.value === null || item.value === undefined) return null;
  const exact = salaryExactText(item.value, item.unit === 'money' ? 2 : 0);
  if (exact === null) return null;
  if (item.unit === 'money') return '$ ' + exact;
  if (item.unit === 'percent') return exact + ' %';
  if (item.unit === 'coefficient') return exact + ' (coeficiente)';
  const words = UNIT_WORDS[item.unit];
  return words ? exact + ' ' + (exact === '1' ? words[0] : words[1]) : exact;
}

const applies = (item, month) => item.active === true && item.validFrom <= month && (item.validUntil === null || item.validUntil >= month);
const identity = item => [item.kind, item.agreementCode, item.categoryCode ?? '', item.code].join(':');

/** Qué se puede elegir: los convenios con definiciones habilitadas y los meses que esas definiciones cubren.
 *  El mes propuesto es el último mes cerrado si está cubierto; si no, el más reciente. */
export function salaryMonthChoices(items, {agreementLabels = [], today = new Date()} = {}) {
  const active = (Array.isArray(items) ? items : []).filter(i => i && i.active === true && isMonth(i.validFrom));
  const labels = new Map(agreementLabels.map(a => [a.code, a.label]));
  const agreements = [...new Set(active.map(i => i.agreementCode))].sort(natural).map(code => ({code, label: labels.get(code) ?? ''}));
  if (!active.length) return {agreements, months: [], agreement: '', month: ''};
  const starts = active.map(i => i.validFrom).sort(), first = starts[0];
  const last = active.reduce((max, i) => { const end = i.validUntil ?? i.validFrom; return end > max ? end : max; }, starts[starts.length - 1]);
  const months = []; for (let m = first; m <= last && months.length < 240; m = nextMonth(m)) months.push(m);
  const recent = months.slice(-36).reverse();
  const t = today.getMonth(), closed = t ? today.getFullYear() + '-' + String(t).padStart(2, '0') : (today.getFullYear() - 1) + '-12';
  return {agreements, months: recent, agreement: agreements.some(a => a.code === '1') ? '1' : agreements[0].code, month: recent.includes(closed) ? closed : recent[0]};
}

function row(item, previous, month) {
  const value = salaryValueText(item), before = previous ? salaryValueText(previous) : null;
  const only = item.validUntil !== null && item.validUntil === item.validFrom;
  return {
    key: [identity(item), item.validFrom].join(':'),
    code: item.kind === 'scale' ? (/^Escala\s+(.+)$/i.exec(item.label)?.[1] ?? item.categoryCode) : item.code,
    // La misma clase puede figurar en más de una tabla de escala (0 y 1): se dice cuál es.
    name: item.kind === 'scale' ? 'Escala ' + item.code : item.label,
    value,
    nature: item.kind === 'concept' ? SALARY_NATURES[item.nature] ?? '' : '',
    validity: only ? 'Vale sólo para ' + salaryMonthLabel(item.validFrom) + '.' : 'Vale desde ' + salaryMonthLabel(item.validFrom) + (item.validUntil === null ? ', sin fecha de fin.' : ' hasta ' + salaryMonthLabel(item.validUntil) + '.'),
    previous: previous ? (before === null ? 'En ' + salaryMonthLabel(salaryPreviousMonth(month)) + ' no tenía valor informado.' : before === value ? 'Igual que en ' + salaryMonthLabel(salaryPreviousMonth(month)) + '.' : 'En ' + salaryMonthLabel(salaryPreviousMonth(month)) + ' era ' + before + '.') : 'No estaba definido en ' + salaryMonthLabel(salaryPreviousMonth(month)) + '.',
    reference: item.ruleReference,
    dependencies: item.dependencies.length,
  };
}

/** Las definiciones habilitadas de un convenio que valen en un mes, en tres listas: escala, conceptos y auxiliares. */
export function salaryMonthView(items, {agreement, month, query = ''} = {}) {
  const empty = {scale: [], concepts: [], auxiliaries: [], total: 0};
  if (!Array.isArray(items) || !isMonth(month) || typeof agreement !== 'string' || !agreement) return empty;
  const mine = items.filter(i => i && i.agreementCode === agreement), before = salaryPreviousMonth(month);
  const earlier = new Map(mine.filter(i => applies(i, before)).map(i => [identity(i), i]));
  const needle = plain(query).trim();
  const pick = kind => mine.filter(i => i.kind === kind && applies(i, month))
    .sort((a, b) => (kind === 'scale' ? natural(a.categoryCode, b.categoryCode) : 0) || natural(a.code, b.code) || a.validFrom.localeCompare(b.validFrom))
    .map(i => row(i, earlier.get(identity(i)) ?? null, month))
    .filter(r => !needle || plain(r.code).includes(needle) || plain(r.name).includes(needle));
  const scale = pick('scale'), concepts = pick('concept'), auxiliaries = pick('auxiliary');
  return {scale, concepts, auxiliaries, total: scale.length + concepts.length + auxiliaries.length};
}
