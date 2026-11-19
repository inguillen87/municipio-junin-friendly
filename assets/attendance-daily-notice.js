// Pure presentation of an already scoped, minimized daily observation. This
// contract does not authenticate a recipient or certify the underlying sources.
export const ATTENDANCE_DAILY_NOTICE_SOURCE_VERSION = 'attendance-daily-notice-source.v2';
export const ATTENDANCE_DAILY_CONVERSION_BLOCKER_CODES = Object.freeze(['TARDINESS_CONVERSION_UNCONFIRMED', 'EXTRA_CONVERSION_UNCONFIRMED']);
export const ATTENDANCE_DAILY_BLOCKER_CODES = Object.freeze([
  'SOURCE_NOMINAL_REQUIRED', 'JOINT_CUT_UNCONFIRMED', 'POPULATION_INCOMPLETE',
  'DAY_NOT_CLOSED', 'COVERAGE_UNCONFIRMED', 'CATALOG_UNAPPROVED',
  'CATALOG_OUT_OF_VALIDITY', 'ASSIGNMENT_MISSING', 'ASSIGNMENT_AMBIGUOUS',
  'IDENTITY_BINDING_UNCONFIRMED', 'CALENDAR_DAY_MISSING', 'SPECIAL_DAY_UNRESOLVED',
  'SCHEDULE_UNSUPPORTED', 'WORKDAY_REVIEW_REQUIRED', 'MULTIPLE_STREAMS_UNRESOLVED',
  'OUT_OF_SCOPE_EVENTS', 'TARDINESS_CONVERSION_UNCONFIRMED',
  'EXTRA_CONVERSION_UNCONFIRMED', 'OBSERVATION_POLICY_UNCONFIRMED',
  'JUSTIFICATIONS_UNCONFIRMED',
]);
export const ATTENDANCE_DAILY_BLOCKER_LABELS = Object.freeze({
  SOURCE_NOMINAL_REQUIRED: 'Falta la fuente autorizada para vincular las jornadas.',
  JOINT_CUT_UNCONFIRMED: 'Corte conjunto de las fuentes: A confirmar.',
  POPULATION_INCOMPLETE: 'Población completa: A confirmar.',
  DAY_NOT_CLOSED: 'Cierre del día: A confirmar.',
  COVERAGE_UNCONFIRMED: 'Cobertura del día: A confirmar.',
  CATALOG_UNAPPROVED: 'Hay configuración del catálogo sin aprobación.',
  CATALOG_OUT_OF_VALIDITY: 'Hay configuración fuera de vigencia.',
  ASSIGNMENT_MISSING: 'Falta una asignación vigente.',
  ASSIGNMENT_AMBIGUOUS: 'Hay asignaciones superpuestas o ambiguas.',
  IDENTITY_BINDING_UNCONFIRMED: 'Vinculación de las jornadas: A confirmar.',
  CALENDAR_DAY_MISSING: 'El calendario no declara este día.',
  SPECIAL_DAY_UNRESOLVED: 'Tratamiento del día especial: A confirmar.',
  SCHEDULE_UNSUPPORTED: 'El horario requiere una revisión adicional.',
  WORKDAY_REVIEW_REQUIRED: 'Hay jornadas que requieren revisión.',
  MULTIPLE_STREAMS_UNRESOLVED: 'La combinación de fuentes requiere revisión.',
  OUT_OF_SCOPE_EVENTS: 'Hay eventos fuera del ámbito del resumen.',
  TARDINESS_CONVERSION_UNCONFIRMED: 'Conversión de tardanzas a unidades: A confirmar.',
  EXTRA_CONVERSION_UNCONFIRMED: 'Tratamiento del tiempo extra: A confirmar.',
  OBSERVATION_POLICY_UNCONFIRMED: 'Criterios de observación: A confirmar.',
  JUSTIFICATIONS_UNCONFIRMED: 'Justificaciones: A confirmar.',
});
export const ATTENDANCE_DAILY_COUNT_LABELS = Object.freeze({
  population: 'Población',
  observedContracts: 'Contratos observados',
  expectedContracts: 'Contratos esperados',
  lateArrivals: 'Llegadas tardías observadas',
  missingMarks: 'Marcaciones faltantes',
  missingMarksToReview: 'Sin marcas para revisar',
  justifiedMissingMarks: 'Con justificación aprobada',
  incompleteWorkdays: 'Jornadas incompletas',
  extraTimeObservedContracts: 'Contratos con tiempo extra observado',
  blockedContracts: 'Contratos bloqueados',
});
const fields = ['version', 'key', 'scopeKey', 'day', 'dayClosed', 'status', 'counts', 'blockerCodes', 'coverageCertified', 'approvalStatus', 'payrollEligible'];
const nullableCounts = new Set(['population', 'expectedContracts', 'lateArrivals', 'missingMarks', 'missingMarksToReview', 'justifiedMissingMarks']);
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const day = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)
  && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const fail = () => { throw new TypeError('ATTENDANCE_DAILY_NOTICE_INVALID'); };

export function attendanceDailyNotice(source) {
  if (!exact(source, fields) || source.version !== ATTENDANCE_DAILY_NOTICE_SOURCE_VERSION
    || !matches(/^[a-f0-9]{64}$/, source.key) || !matches(/^[a-f0-9]{64}$/, source.scopeKey)
    || !day(source.day) || typeof source.dayClosed !== 'boolean' || !['blocked', 'observed'].includes(source.status)
    || source.coverageCertified !== false || source.approvalStatus !== 'not_approved' || source.payrollEligible !== false
    || !exact(source.counts, Object.keys(ATTENDANCE_DAILY_COUNT_LABELS))
    || !Object.keys(ATTENDANCE_DAILY_COUNT_LABELS).every(k => nullableCounts.has(k) && source.counts[k] === null || Number.isSafeInteger(source.counts[k]) && source.counts[k] >= 0 && !Object.is(source.counts[k], -0))
    || !Array.isArray(source.blockerCodes) || source.blockerCodes.length > ATTENDANCE_DAILY_BLOCKER_CODES.length
    || Reflect.ownKeys(source.blockerCodes).length !== source.blockerCodes.length + 1
    || new Set(source.blockerCodes).size !== source.blockerCodes.length
    || !Array.from(source.blockerCodes).every(c => ATTENDANCE_DAILY_BLOCKER_CODES.includes(c))) fail();
  const c = source.counts;
  if (source.dayClosed && source.blockerCodes.includes('DAY_NOT_CLOSED')) fail();
  if (source.status === 'observed'
    ? !source.dayClosed || source.blockerCodes.length !== 0 || [...nullableCounts].some(k => c[k] === null) || c.blockedContracts !== 0
    : source.blockerCodes.length === 0) fail();
  if (c.population !== null && (c.observedContracts > c.population || c.blockedContracts > c.population || c.expectedContracts !== null && c.expectedContracts > c.population)
    || c.extraTimeObservedContracts > c.observedContracts
    || c.lateArrivals !== null && (c.lateArrivals > c.observedContracts || c.expectedContracts !== null && c.lateArrivals > c.expectedContracts)
    || c.missingMarks !== null && c.expectedContracts !== null && c.missingMarks > c.expectedContracts
    || c.missingMarks !== null && (c.missingMarksToReview !== null && c.missingMarksToReview > c.missingMarks || c.justifiedMissingMarks !== null && c.justifiedMissingMarks > c.missingMarks)
    || [c.missingMarks, c.missingMarksToReview, c.justifiedMissingMarks].every(v => v !== null) && c.missingMarksToReview + c.justifiedMissingMarks !== c.missingMarks) fail();
  const observationStatus = source.blockerCodes.every(code => ATTENDANCE_DAILY_CONVERSION_BLOCKER_CODES.includes(code)) ? 'observed' : 'review_required';
  if (observationStatus === 'observed' && (!source.dayClosed || [...nullableCounts].some(k => c[k] === null))) fail();
  return {
    key: 'attendance-daily:' + source.key, kind: 'attendance_daily', title: 'Asistencia diaria', href: '/relojes',
    scopeKey: source.scopeKey, day: source.day, dayClosed: source.dayClosed, status: source.status, observationStatus,
    conversionPending: source.blockerCodes.some(code => ATTENDANCE_DAILY_CONVERSION_BLOCKER_CODES.includes(code)),
    counts: Object.fromEntries(Object.keys(ATTENDANCE_DAILY_COUNT_LABELS).map(k => [k, source.counts[k]])),
    blockerCodes: ATTENDANCE_DAILY_BLOCKER_CODES.filter(c => source.blockerCodes.includes(c)),
    coverageCertified: false, approvalStatus: 'not_approved', payrollEligible: false,
  };
}

export const attendanceDailyCountText = value => value === null ? 'A confirmar' : String(value);
