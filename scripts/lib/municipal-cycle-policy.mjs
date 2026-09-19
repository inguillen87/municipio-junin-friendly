/** Pure planning: this module never connects, deletes records or authorizes a cutover. */
const DAY = 86_400_000;
const iso = value => value.toISOString().slice(0, 10);
function date(value) {
  if (typeof value !== 'string' || !/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) throw Error('CYCLE_DATE_INVALID');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+parsed) || iso(parsed) !== value) throw Error('CYCLE_DATE_INVALID');
  return parsed;
}
function plusYears(value, years) {
  const d = date(value), day = d.getUTCDate(), month = d.getUTCMonth();
  d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate()));
  return iso(d);
}
const plusDays = (value, days) => iso(new Date(+date(value) + days * DAY));
const daysBetween = (start, end) => (+date(end) - +date(start)) / DAY;
const monthStart = value => `${value.slice(0, 7)}-01`;
function nextMonth(value) {
  const d = date(value); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d);
}
function reviewedTerm(input) {
  if (!input || typeof input.code !== 'string' || !/^[a-z0-9-]{1,60}$/.test(input.code)
      || input.reviewed !== true || !Array.isArray(input.evidenceRefs) || !input.evidenceRefs.length
      || input.evidenceRefs.length > 20 || input.evidenceRefs.some(x => typeof x !== 'string' || !x.trim() || x.length > 1000)) {
    throw Error('CYCLE_REVIEWED_TERM_REQUIRED');
  }
  date(input.start); date(input.endExclusive);
  const days = daysBetween(input.start, input.endExclusive);
  if (days < 1400 || days > 1500) throw Error('CYCLE_FOUR_YEAR_TERM_REQUIRED');
  return { code: input.code, start: input.start, endExclusive: input.endExclusive,
    reviewed: true, evidenceRefs: [...input.evidenceRefs] };
}
export function validateCycle({ previous, current, asOf } = {}) {
  previous = reviewedTerm(previous); current = reviewedTerm(current); date(asOf);
  if (previous.code === current.code || previous.endExclusive !== current.start) throw Error('CYCLE_CONTINUITY_REQUIRED');
  if (asOf < current.start || asOf >= current.endExclusive) throw Error('CYCLE_ASOF_OUTSIDE_CURRENT_TERM');
  return { previous, current, asOf };
}
export function planCycleRetention(input) {
  const cycle = validateCycle(input), extraYears = input.extraYears ?? 0;
  if (![0, 2].includes(extraYears)) throw Error('CYCLE_EXTRA_YEARS_INVALID');
  const retainFrom = monthStart(plusYears(cycle.previous.start, -extraYears));
  date(retainFrom); // Refuse a cutoff outside the explicitly supported date range.
  return { version: 'municipal-cycle-retention.v1', ...cycle, extraYears, retainFrom,
    basis: 'previous_term_and_current_term_not_rolling_age', analyticsFrom: cycle.previous.start,
    boundaryMonthPreserved: true, preserveNativeRecords: true, preserveCurrentDependencies: true,
    preserveAllSchemaObjects: true, archiveVerifiedRestoreRequired: true,
    destructiveActionAllowed: false, cutoverAllowed: false };
}
function annualTermWindow(term, year) {
  const start = plusYears(term.start, year - 1);
  const endExclusive = [plusYears(term.start, year), term.endExclusive].sort()[0];
  return { start, endExclusive };
}
export function planManagementYearPairs(input) {
  const cycle = validateCycle(input), observedEnd = plusDays(cycle.asOf, 1);
  const years = [];
  for (let year = 1; year <= 4; year++) {
    const previousFull = annualTermWindow(cycle.previous, year), currentFull = annualTermWindow(cycle.current, year);
    if (currentFull.start >= observedEnd) {
      years.push({ year, status: 'not_started', previousFull, currentFull,
        previousComparable: null, currentComparable: null, comparableDays: 0,
        currentValue: null, previousValue: null, coverageStatus: 'unverified' });
      continue;
    }
    const availableEnd = [observedEnd, currentFull.endExclusive].sort()[0];
    const currentDays = daysBetween(currentFull.start, availableEnd);
    const comparableDays = Math.min(currentDays, daysBetween(previousFull.start, previousFull.endExclusive));
    years.push({ year, status: availableEnd < currentFull.endExclusive ? 'partial' : 'elapsed',
      previousFull, currentFull, comparableDays,
      previousComparable: { start: previousFull.start, endExclusive: plusDays(previousFull.start, comparableDays) },
      currentComparable: { start: currentFull.start, endExclusive: plusDays(currentFull.start, comparableDays) },
      currentUnpairedDays: currentDays - comparableDays,
      previousUnpairedDays: daysBetween(previousFull.start, previousFull.endExclusive) - comparableDays,
      coverageStatus: 'unverified' });
  }
  return { version: 'municipal-management-year-pairs.v1', alignment: 'equal_elapsed_days', years,
    dataCoverageMustBeVerifiedSeparately: true, fiscalYearsMustRemainSeparate: true };
}
function completeMonths(window, closedThrough) {
  if (!window) return [];
  date(closedThrough);
  if (closedThrough !== monthStart(closedThrough)) throw Error('CYCLE_CLOSED_MONTH_INVALID');
  let month = window.start === monthStart(window.start) ? window.start : nextMonth(window.start);
  const months = [];
  while (nextMonth(month) <= window.endExclusive && month <= closedThrough) {
    months.push(month); month = nextMonth(month);
  }
  return months;
}
export function planClosedPayrollMonthPairs(input) {
  const plan = planManagementYearPairs(input);
  date(input.previousClosedThroughMonth); date(input.currentClosedThroughMonth);
  for (const value of [input.previousClosedThroughMonth, input.currentClosedThroughMonth]) {
    if (value !== monthStart(value)) throw Error('CYCLE_CLOSED_MONTH_INVALID');
  }
  return { version: 'municipal-closed-payroll-month-pairs.v1',
    basis: 'complete_months_with_explicit_source_closure', transitionMonthProratingAllowed: false,
    years: plan.years.map(row => {
      const previous = completeMonths(row.previousComparable, input.previousClosedThroughMonth);
      const current = completeMonths(row.currentComparable, input.currentClosedThroughMonth);
      const length = Math.min(previous.length, current.length);
      return { year: row.year, status: row.status, comparableMonths: length,
        pairs: current.slice(0, length).map((month, index) => ({ previous: previous[index], current: month })),
        previousUnpairedMonths: previous.slice(length), currentUnpairedMonths: current.slice(length),
        partialBoundaryMonthsExcluded: true, coverageStatus: 'unverified' };
    }) };
}
const ARCHIVABLE = new Set(['public.employment_movement', 'public.payroll_monthly_fact']);
export function classifyHistoryRecord(record, policy) {
  if (!record || !policy || policy.version !== 'municipal-cycle-retention.v1') throw Error('CYCLE_RECORD_INPUT_INVALID');
  date(policy.retainFrom);
  if (policy.retainFrom !== monthStart(policy.retainFrom)) throw Error('CYCLE_RETAIN_MONTH_INVALID');
  const keep = reason => ({ destination: 'operational', reason, removalAuthorized: false });
  if (!ARCHIVABLE.has(record.relation)) return keep('relation_not_explicitly_reviewed');
  if (record.sourceSystem !== 'GRH') return keep('native_or_other_source_preserved');
  if (record.nativeOverlay !== false) return keep('native_overlay_or_unknown');
  if (record.legalHold !== false) return keep('legal_hold_or_unknown');
  if (record.dependencyStatus !== 'cleared') return keep('current_dependency_or_unknown');
  if (record.sourceBatchVerified !== true) return keep('unverified_source_batch');
  try { date(record.period); } catch { return keep('invalid_period_requires_review'); }
  if (record.period >= policy.retainFrom) return keep('inside_operational_window');
  return { destination: 'archive_candidate', reason: 'older_imported_detail_with_dependencies_cleared', removalAuthorized: false };
}
export const METRIC_CONTRACTS = Object.freeze(Object.fromEntries(Object.entries({
  activePeople: { source: 'employment_state', unit: 'people', aggregation: 'distinct_at_date', meaning: 'Personas únicas a una fecha; no sumar meses.' },
  approvedOvertime: { source: 'overtime_authorizations', unit: 'hours', aggregation: 'sum', meaning: 'Horas autorizadas; no implica que se trabajaron o pagaron.' },
  workedHours: { source: 'validated_work_sessions', unit: 'hours', aggregation: 'sum', meaning: 'Horas validadas; exige cobertura de relojes y jornadas.' },
  liquidatedOvertime: { source: 'closed_payroll_items', unit: 'ARS', aggregation: 'sum', meaning: 'Importe liquidado; para acreditar pago requiere Tesorería.' },
  approvedBudget: { source: 'approved_budget', unit: 'ARS', aggregation: 'versioned_fiscal_year', meaning: 'Crédito aprobado, distinto de ejecución y pagos.' },
  accruedExpenditure: { source: 'accounting_accruals', unit: 'ARS', aggregation: 'sum', meaning: 'Gasto devengado; no se infiere del presupuesto.' },
  cashPayments: { source: 'treasury_payments', unit: 'ARS', aggregation: 'sum', meaning: 'Pagos registrados con fecha y comprobante.' },
  publicWorksProgress: { source: 'verified_work_certificates', unit: 'physical_units', aggregation: 'project_specific', meaning: 'Avance físico certificado, separado del gasto monetario.' },
}).map(([key, value]) => [key, Object.freeze(value)])));
export function evaluateMetricPair({ metric, previous, current } = {}) {
  if (!Object.hasOwn(METRIC_CONTRACTS, metric)) throw Error('CYCLE_UNKNOWN_METRIC');
  const sides = [previous, current], reasons = [];
  if (sides.some(x => !x || x.value === null || x.value === undefined || x.value === '')) reasons.push('data_missing');
  if (sides.some(x => x && x.value !== null && x.value !== undefined && x.value !== ''
      && !((typeof x.value === 'string' && x.value.length <= 80 && /^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(x.value))
        || (typeof x.value === 'number' && Number.isSafeInteger(x.value))))) reasons.push('value_invalid');
  if (METRIC_CONTRACTS[metric].unit === 'people' && sides.some(x => x && x.value != null && !/^(?:0|[1-9]\d*)$/.test(String(x.value)))) reasons.push('people_count_invalid');
  if (['hours','physical_units'].includes(METRIC_CONTRACTS[metric].unit) && sides.some(x => x && x.value != null && String(x.value).startsWith('-'))) reasons.push('negative_quantity');
  if (sides.some(x => !x || x.sourceKind !== METRIC_CONTRACTS[metric].source
      || typeof x.sourceRef !== 'string' || !x.sourceRef.trim())) reasons.push('source_not_verified');
  if (sides.some(x => !x || x.coverage !== 'complete' || x.verified !== true)) reasons.push('coverage_not_verified');
  if (sides.every(Boolean)) {
    if (typeof previous.tenantId !== 'string' || !previous.tenantId || previous.tenantId !== current.tenantId) reasons.push('tenant_mismatch');
    if (!previous.scopeVersion || previous.scopeVersion !== current.scopeVersion) reasons.push('scope_mismatch');
    if (previous.definitionVersion !== current.definitionVersion || !previous.definitionVersion) reasons.push('definition_mismatch');
    if (previous.unit !== METRIC_CONTRACTS[metric].unit || current.unit !== previous.unit) reasons.push('unit_mismatch');
    if (previous.windowUnits !== current.windowUnits || !Number.isSafeInteger(previous.windowUnits) || previous.windowUnits < 1) reasons.push('window_mismatch');
    if (METRIC_CONTRACTS[metric].unit === 'ARS' && (!previous.priceBasisId || previous.priceBasisId !== current.priceBasisId || previous.priceBasisId === 'nominal')) reasons.push('common_price_basis_required');
  }
  return { metric, comparable: reasons.length === 0, reasons, previous: previous?.value ?? null,
    current: current?.value ?? null, causalConclusionAllowed: false, politicalRankingAllowed: false };
}
