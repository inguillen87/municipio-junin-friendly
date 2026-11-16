// Pure contract for the private historical-area reader. Supplied facts do not
// authenticate a reader or prove database authority. Only the server facade may
// obtain these facts, in its already authorized, population-limited snapshot.
export const ATTENDANCE_AREA_HISTORY_SOURCE_VERSION = 'attendance-area-history-source.v1';
export const ATTENDANCE_AREA_HISTORY_VERSION = 'attendance-area-history.v1';
export const ATTENDANCE_AREA_HISTORY_REASONS = Object.freeze([
  'AREA_HISTORY_SCOPE_MISMATCH', 'AREA_HISTORY_INCOMPLETE',
  'AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED', 'AREA_HISTORY_REGISTRATION_UNPROVEN',
  'AREA_HISTORY_WITHDRAWN', 'AREA_HISTORY_CHAIN_INVALID',
  'AREA_HISTORY_EFFECTIVITY_REQUIRED', 'AREA_HISTORY_LIFECYCLE_INVALID',
  'AREA_HISTORY_RANGE_NOT_ACTIVE',
]);

const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const uuid = value => matches(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, value) && value !== '00000000-0000-0000-0000-000000000000';
const hash = value => matches(/^[a-f0-9]{64}$/, value);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) && keys.length === Reflect.ownKeys(value).length &&
  keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && d.enumerable && Object.hasOwn(d, 'value'); });
const list = (value, max = 100) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= max &&
  Reflect.ownKeys(value).length === value.length + 1 && Array.from({length:value.length}, (_, index) => {
    const d = Object.getOwnPropertyDescriptor(value, index); return d && d.enumerable && Object.hasOwn(d, 'value');
  }).every(Boolean);
const date = value => matches(/^(?:19|20)\d\d-\d\d-\d\d$/, value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const timestamp = value => matches(/^(?:19|20)\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/, value) &&
  date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const sourceId = value => matches(/^(?:0|[1-9]\d{0,18})$/, value);
const label = value => typeof value === 'string' && value === value.normalize('NFC').trim() && value.length >= 1 && value.length <= 160 &&
  !/[<>\p{Cc}\p{Cf}]/u.test(value);
const area = value => exact(value, ['organizationUnitSourceId', 'sectorSourceId', 'organizationName', 'sectorName']) &&
  sourceId(value.organizationUnitSourceId) && label(value.organizationName) &&
  (value.sectorSourceId === null ? value.sectorName === null : sourceId(value.sectorSourceId) && label(value.sectorName));
const sameArea = (a, b) => a !== null && b !== null &&
  ['organizationUnitSourceId', 'sectorSourceId', 'organizationName', 'sectorName'].every(key => a[key] === b[key]);
const interval = value => exact(value, ['startDate', 'endDate']) && date(value.startDate) &&
  (value.endDate === null || date(value.endDate) && value.endDate >= value.startDate);
const intervals = value => list(value, 51) && value.length > 0 && value.every(interval) &&
  value.every((item, i) => i === 0 || value[i - 1].endDate !== null && item.startDate > value[i - 1].endDate);
const sameIntervals = (a, b) => a.length === b.length && a.every((item, i) => item.startDate === b[i].startDate && item.endDate === b[i].endDate);
const scope = value => exact(value, ['tenantId', 'sourceBindingId', 'contractId']) && Object.values(value).every(uuid);
const unique = (values, key) => new Set(values.map(row => row[key])).size === values.length;
function requireValue(ok, kind) {
  if (!ok) throw Object.assign(new Error('ATTENDANCE_AREA_HISTORY_' + kind + '_INVALID'), {code:'ATTENDANCE_AREA_HISTORY_' + kind + '_INVALID'});
}

function validateSource(source) {
  const ok = value => requireValue(value, 'SOURCE');
  ok(exact(source, ['version', 'scope', 'provenance', 'registration', 'currentArea', 'changes', 'lifecycle', 'withdrawal']) &&
    source.version === ATTENDANCE_AREA_HISTORY_SOURCE_VERSION && scope(source.scope));
  const {provenance:p, registration:r, changes:c, lifecycle:l, withdrawal:w} = source;
  ok(exact(p, ['origin', 'sourceVersion', 'complete', 'registrationMatches', 'guardConfirmed']) &&
    ['native_registration', 'adopted_grh', 'grh', 'unconfirmed'].includes(p.origin) && hash(p.sourceVersion) &&
    [p.complete, p.registrationMatches, p.guardConfirmed].every(v => typeof v === 'boolean'));
  ok(r === null || exact(r, ['id', 'registeredAt', 'requestSha256', 'catalogSha256', 'startDate', 'endDate', 'area']) &&
    uuid(r.id) && timestamp(r.registeredAt) && hash(r.requestSha256) && hash(r.catalogSha256) &&
    date(r.startDate) && (r.endDate === null || date(r.endDate) && r.endDate >= r.startDate) && area(r.area));
  ok(source.currentArea === null || area(source.currentArea));
  ok(exact(c, ['complete', 'approved']) && typeof c.complete === 'boolean' && list(c.approved));
  for (const row of c.approved) ok(exact(row, ['proposalId', 'approvalId', 'revision', 'approvedAt', 'effectiveFrom',
    'beforeArea', 'afterArea', 'sourceMatches', 'makerChecker']) && uuid(row.proposalId) && uuid(row.approvalId) &&
    Number.isSafeInteger(row.revision) && row.revision >= 1 && row.revision <= 100 && timestamp(row.approvedAt) &&
    row.effectiveFrom === null && area(row.beforeArea) && area(row.afterArea) &&
    typeof row.sourceMatches === 'boolean' && typeof row.makerChecker === 'boolean');
  ok(exact(l, ['complete', 'approved']) && typeof l.complete === 'boolean' && list(l.approved));
  for (const row of l.approved) ok(exact(row, ['proposalId', 'approvalId', 'revision', 'approvedAt', 'movement', 'movementDate',
    'beforeIntervals', 'afterIntervals', 'sourceMatches', 'makerChecker']) && uuid(row.proposalId) && uuid(row.approvalId) &&
    Number.isSafeInteger(row.revision) && row.revision >= 1 && row.revision <= 100 && timestamp(row.approvedAt) &&
    ['terminate', 'reenter'].includes(row.movement) && date(row.movementDate) && intervals(row.beforeIntervals) &&
    intervals(row.afterIntervals) && typeof row.sourceMatches === 'boolean' && typeof row.makerChecker === 'boolean');
  ok(exact(w, ['complete', 'withdrawn', 'approvalId']) && typeof w.complete === 'boolean' && typeof w.withdrawn === 'boolean' &&
    (w.withdrawn ? uuid(w.approvalId) : w.approvalId === null));
  return source;
}

/**
 * Prove one unchanged registered area over an inclusive contract/date range.
 * Existing change104/224 records contain approval time, but no effective date.
 * Any changed area (including its declared label) therefore remains blocked.
 * Registration/lifecycle dates are explicit facts; recorded/approved timestamps
 * are preserved as provenance and are NEVER converted into effective dates.
 */
export function resolveAttendanceAreaHistory(source, query) {
  requireValue(exact(query, ['tenantId', 'sourceBindingId', 'contractId', 'validFrom', 'validUntil']) &&
    uuid(query.tenantId) && uuid(query.sourceBindingId) && uuid(query.contractId) && date(query.validFrom) &&
    (query.validUntil === null || date(query.validUntil) && query.validUntil >= query.validFrom), 'INPUT');
  validateSource(source);
  const result = {version:ATTENDANCE_AREA_HISTORY_VERSION, status:'blocked', contractId:query.contractId,
    validFrom:query.validFrom, validUntil:query.validUntil, area:null, evidence:null, reasons:[]};
  const block = code => { if (!result.reasons.includes(code)) result.reasons.push(code); };
  if (['tenantId', 'sourceBindingId', 'contractId'].some(key => query[key] !== source.scope[key])) {
    block('AREA_HISTORY_SCOPE_MISMATCH'); return result;
  }
  const {provenance:p, registration:r, changes:c, lifecycle:l, withdrawal:w} = source;
  if (![p.complete, c.complete, l.complete, w.complete].every(Boolean)) block('AREA_HISTORY_INCOMPLETE');
  if (p.origin !== 'native_registration') block('AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED');
  if (!p.registrationMatches || !p.guardConfirmed || r === null || source.currentArea === null) block('AREA_HISTORY_REGISTRATION_UNPROVEN');
  if (w.withdrawn) block('AREA_HISTORY_WITHDRAWN');
  if (result.reasons.length) return result;

  const changeRows = [...c.approved].sort((a, b) => a.revision - b.revision);
  if (!unique(changeRows, 'proposalId') || !unique(changeRows, 'approvalId')) block('AREA_HISTORY_CHAIN_INVALID');
  let expectedArea = r.area;
  for (const [index, row] of changeRows.entries()) {
    if (row.revision !== index + 1 || !row.sourceMatches || !row.makerChecker || !sameArea(expectedArea, row.beforeArea)) block('AREA_HISTORY_CHAIN_INVALID');
    if (!sameArea(row.beforeArea, row.afterArea)) block('AREA_HISTORY_EFFECTIVITY_REQUIRED');
    expectedArea = row.afterArea;
  }
  if (!sameArea(expectedArea, source.currentArea)) block('AREA_HISTORY_CHAIN_INVALID');

  let activeIntervals = [{startDate:r.startDate, endDate:r.endDate}];
  const lifeRows = [...l.approved].sort((a, b) => a.revision - b.revision);
  if (!unique(lifeRows, 'proposalId') || !unique(lifeRows, 'approvalId')) block('AREA_HISTORY_LIFECYCLE_INVALID');
  for (const [index, row] of lifeRows.entries()) {
    if (row.revision !== index + 1 || !row.sourceMatches || !row.makerChecker || !sameIntervals(activeIntervals, row.beforeIntervals)) {
      block('AREA_HISTORY_LIFECYCLE_INVALID'); break;
    }
    const expected = activeIntervals.map(item => ({...item}));
    const last = expected.at(-1);
    if (row.movement === 'terminate') {
      if (last.endDate !== null || row.movementDate < last.startDate) { block('AREA_HISTORY_LIFECYCLE_INVALID'); break; }
      last.endDate = row.movementDate;
    } else {
      if (last.endDate === null || row.movementDate <= last.endDate || expected.length >= 51) { block('AREA_HISTORY_LIFECYCLE_INVALID'); break; }
      expected.push({startDate:row.movementDate, endDate:null});
    }
    if (!sameIntervals(expected, row.afterIntervals)) { block('AREA_HISTORY_LIFECYCLE_INVALID'); break; }
    activeIntervals = expected;
  }
  if (!activeIntervals.some(item => item.startDate <= query.validFrom &&
    (item.endDate === null || query.validUntil !== null && item.endDate >= query.validUntil))) block('AREA_HISTORY_RANGE_NOT_ACTIVE');
  if (result.reasons.length) return result;
  result.status = 'resolved';
  result.area = {...r.area, areaLabel:r.area.organizationName + (r.area.sectorName === null ? '' : ' / ' + r.area.sectorName)};
  result.evidence = {sourceVersion:p.sourceVersion, registrationId:r.id, registrationRequestSha256:r.requestSha256,
    registrationCatalogSha256:r.catalogSha256, registeredAt:r.registeredAt,
    changeApprovalIds:changeRows.map(row => row.approvalId), lifecycleApprovalIds:lifeRows.map(row => row.approvalId)};
  return result;
}
