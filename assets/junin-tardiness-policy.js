const MAX_DAILY_LATE_MINUTES = 1440;
const MAX_MONTHLY_LATE_MINUTES = 31 * MAX_DAILY_LATE_MINUTES;

const CANDIDATE_TOLERANCE = Object.freeze({
  bandKey: 'within_tolerance',
  minExclusive: null,
  maxInclusive: 5,
  candidateJornadaDiscountPercent: 0,
  documentedInSource: false,
  evidenceClass: 'inferred_uncovered_range_before_first_documented_band',
  label: 'Dentro de la tolerancia candidata inferida',
});

const DOCUMENTED_DISCOUNT_BANDS = Object.freeze([
  Object.freeze({
    bandKey: 'over_5_through_15',
    minExclusive: 5,
    maxInclusive: 15,
    candidateJornadaDiscountPercent: 25,
    documentedInSource: true,
    label: 'Más de 5 y hasta 15 minutos',
  }),
  Object.freeze({
    bandKey: 'over_15_through_60',
    minExclusive: 15,
    maxInclusive: 60,
    candidateJornadaDiscountPercent: 50,
    documentedInSource: true,
    label: 'Más de 15 y hasta 60 minutos',
  }),
  Object.freeze({
    bandKey: 'over_60_through_150',
    minExclusive: 60,
    maxInclusive: 150,
    candidateJornadaDiscountPercent: 75,
    documentedInSource: true,
    label: 'Más de 60 y hasta 150 minutos',
  }),
  Object.freeze({
    bandKey: 'over_150',
    minExclusive: 150,
    maxInclusive: null,
    candidateJornadaDiscountPercent: 100,
    documentedInSource: true,
    label: 'Más de 150 minutos',
  }),
]);

const EVALUATION_BANDS = Object.freeze([
  CANDIDATE_TOLERANCE,
  ...DOCUMENTED_DISCOUNT_BANDS,
]);

export const JUNIN_TARDINESS_CANDIDATE = Object.freeze({
  policyKey: 'junin_monthly_tardiness_candidate_2026_09_02',
  version: '0.1.0',
  status: 'draft_not_homologated',
  publishedAt: '2026-08-21',
  revisedAt: '2026-09-02',
  authoritative: false,
  active: false,
  approved: false,
  sourceKey: 'accounting_tolerance_reference_image_2026_09_02',
  accumulationPeriod: 'calendar_month',
  inputUnit: 'whole_minutes',
  candidateTolerance: CANDIDATE_TOLERANCE,
  documentedDiscountBands: DOCUMENTED_DISCOUNT_BANDS,
  evaluationBands: EVALUATION_BANDS,
  effects: Object.freeze({
    simulationOnly: true,
    automaticSanction: false,
    payrollCalculation: false,
    payrollPosting: false,
    grhWrite: false,
  }),
});

function ensureInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} debe ser un número entero.`);
  }
  if (value < minimum || value > maximum) {
    throw new RangeError(`${label} debe estar entre ${minimum} y ${maximum}.`);
  }
  return value;
}

function normalizeMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    throw new TypeError('El mes debe tener formato AAAA-MM.');
  }
  const [year, month] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError('El mes informado no es válido.');
  }
  return value;
}

function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Cada fecha debe tener formato AAAA-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900
    || year > 9999
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`La fecha ${value} no es válida.`);
  }
  return value;
}

function daysInMonth(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeEntry(entry, index, selectedMonth) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`La tardanza ${index + 1} debe ser un objeto.`);
  }
  const keys = Object.keys(entry).sort();
  if (keys.length !== 2 || keys[0] !== 'date' || keys[1] !== 'lateMinutes') {
    throw new TypeError(`La tardanza ${index + 1} sólo admite date y lateMinutes.`);
  }
  const date = normalizeDate(entry.date);
  if (!date.startsWith(`${selectedMonth}-`)) {
    throw new RangeError(`La fecha ${date} no pertenece al mes ${selectedMonth}.`);
  }
  const lateMinutes = ensureInteger(
    entry.lateMinutes,
    `Los minutos de ${date}`,
    0,
    MAX_DAILY_LATE_MINUTES,
  );
  return Object.freeze({ date, lateMinutes });
}

export function parseTardinessEntries(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Las tardanzas deben informarse como texto.');
  }
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return Object.freeze(lines.map((line, index) => {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length !== 2 || !fields[0] || !fields[1]) {
      throw new TypeError(`Línea ${index + 1}: usá el formato AAAA-MM-DD, minutos.`);
    }
    if (!/^\d+$/.test(fields[1])) {
      throw new TypeError(`Línea ${index + 1}: los minutos deben ser enteros no negativos.`);
    }
    return Object.freeze({ date: fields[0], lateMinutes: Number(fields[1]) });
  }));
}

export function evaluateTardinessBand(totalLateMinutes) {
  const total = ensureInteger(
    totalLateMinutes,
    'Los minutos acumulados',
    0,
    MAX_MONTHLY_LATE_MINUTES,
  );
  const band = EVALUATION_BANDS.find((candidate) => (
    (candidate.minExclusive === null || total > candidate.minExclusive)
    && (candidate.maxInclusive === null || total <= candidate.maxInclusive)
  ));
  if (!band) throw new RangeError('No existe una banda candidata para el total informado.');
  return band;
}

export function accumulateMonthlyTardiness(entries, month) {
  const selectedMonth = normalizeMonth(month);
  if (!Array.isArray(entries)) {
    throw new TypeError('Las tardanzas mensuales deben ser una lista.');
  }
  if (entries.length > daysInMonth(selectedMonth)) {
    throw new RangeError(`El mes ${selectedMonth} no admite más de una tardanza diaria.`);
  }

  const dates = new Set();
  const normalizedEntries = entries.map((entry, index) => {
    const normalized = normalizeEntry(entry, index, selectedMonth);
    if (dates.has(normalized.date)) {
      throw new RangeError(`La fecha ${normalized.date} está repetida.`);
    }
    dates.add(normalized.date);
    return normalized;
  });
  const totalLateMinutes = normalizedEntries.reduce((total, entry) => total + entry.lateMinutes, 0);
  ensureInteger(totalLateMinutes, 'Los minutos acumulados', 0, MAX_MONTHLY_LATE_MINUTES);

  return Object.freeze({
    month: selectedMonth,
    entryCount: normalizedEntries.length,
    totalLateMinutes,
    entries: Object.freeze(normalizedEntries),
  });
}

export function evaluateMonthlyTardiness({ month, entries } = {}) {
  const accumulation = accumulateMonthlyTardiness(entries, month);
  const matchedBand = evaluateTardinessBand(accumulation.totalLateMinutes);
  return Object.freeze({
    policyKey: JUNIN_TARDINESS_CANDIDATE.policyKey,
    policyVersion: JUNIN_TARDINESS_CANDIDATE.version,
    policyStatus: JUNIN_TARDINESS_CANDIDATE.status,
    sourceKey: JUNIN_TARDINESS_CANDIDATE.sourceKey,
    authoritative: false,
    operationalEffect: 'none',
    month: accumulation.month,
    entryCount: accumulation.entryCount,
    totalLateMinutes: accumulation.totalLateMinutes,
    matchedBand,
    candidateJornadaDiscountPercent: matchedBand.candidateJornadaDiscountPercent,
    payrollImpact: Object.freeze({
      calculated: false,
      posted: false,
      amount: null,
    }),
    automaticSanction: false,
    grhWritten: false,
  });
}

function currentMonth() {
  const date = new Date();
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
}

export function mountTardinessSimulator(root = globalThis.document) {
  if (!root || typeof root.querySelector !== 'function') return false;
  const form = root.querySelector('#tardiness-simulator-form');
  if (!form || form.dataset.bound === 'true') return Boolean(form);

  const monthInput = root.querySelector('#tardiness-month');
  const entriesInput = root.querySelector('#tardiness-entries');
  const error = root.querySelector('#tardiness-error');
  const result = root.querySelector('#tardiness-result');
  const clear = root.querySelector('#tardiness-clear');
  if (!monthInput || !entriesInput || !error || !result || !clear) return false;

  form.dataset.bound = 'true';
  if (!monthInput.value) monthInput.value = currentMonth();

  function resetResult() {
    error.hidden = true;
    error.textContent = '';
    result.hidden = true;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    resetResult();
    try {
      const evaluation = evaluateMonthlyTardiness({
        month: monthInput.value,
        entries: parseTardinessEntries(entriesInput.value),
      });
      setText(result, '[data-result="month"]', evaluation.month);
      setText(result, '[data-result="entries"]', evaluation.entryCount);
      setText(result, '[data-result="minutes"]', evaluation.totalLateMinutes);
      setText(result, '[data-result="band"]', evaluation.matchedBand.label);
      setText(result, '[data-result="percent"]', `${evaluation.candidateJornadaDiscountPercent} %`);
      result.hidden = false;
      result.focus();
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : 'No se pudo simular la banda.';
      error.hidden = false;
      error.focus();
    }
  });

  clear.addEventListener('click', () => {
    form.reset();
    monthInput.value = currentMonth();
    resetResult();
    entriesInput.focus();
  });
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountTardinessSimulator(document), { once: true });
  } else {
    mountTardinessSimulator(document);
  }
}
