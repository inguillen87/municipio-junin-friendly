import {CONTINUOUS_WORKDAY_RULES, reconstructContinuousWorkdays} from './attendance-workdays.js';

export const CLOCK_WORKDAY_SOURCE_V3_VERSION = 'clock-workday-source.v3';
export const CLOCK_WORKDAYS_V3_VERSION = 'clock-workdays.v3';
const HASH = /^[a-f0-9]{64}$/;
const CONTRACT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const NIL_ID = '00000000-0000-0000-0000-000000000000';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireIdentity(ok) {
  if (!ok) throw Object.assign(new Error('ATTENDANCE_WORKDAY_IDENTITY_INVALID'), {code:'ATTENDANCE_WORKDAY_IDENTITY_INVALID'});
}

/** Validate every v3 identity before a reader removes the field for v2 validation. */
export function assertContinuousWorkdayIdentitiesV3(source) {
  requireIdentity(record(source) && source.version === CLOCK_WORKDAY_SOURCE_V3_VERSION &&
    source.sourceMode === 'continuous' && source.rulesVersion === CONTINUOUS_WORKDAY_RULES.version &&
    typeof source.nominalReadAllowed === 'boolean');
  requireIdentity(Array.isArray(source.events) && Array.isArray(source.observations) &&
    source.events.length + source.observations.length <= 25000);
  const contracts = new Map();
  for (const event of source.events) {
    requireIdentity(record(event) && own(event, 'contractId') &&
      typeof event.streamKey === 'string' && HASH.test(event.streamKey) &&
      ['mapped', 'unmapped', 'ambiguous'].includes(event.identityState));
    if (source.nominalReadAllowed && event.identityState === 'mapped') {
      // PostgreSQL UUIDs are opaque here; do not infer a UUID version or source.
      requireIdentity(typeof event.contractId === 'string' && CONTRACT_ID.test(event.contractId) && event.contractId !== NIL_ID);
    } else {
      requireIdentity(event.contractId === null);
    }
    requireIdentity(!contracts.has(event.streamKey) || contracts.get(event.streamKey) === event.contractId);
    contracts.set(event.streamKey, event.contractId);
  }
  // Unplaceable observations retain the v2 shape and cannot assert an identity.
  for (const observation of source.observations) {
    requireIdentity(record(observation) && !('contractId' in observation));
  }
  return source;
}

/**
 * Preserve the source's historical GRH contract identity without joining by
 * legajo, person or device. It is not an own-contract or assignment116 binding.
 * Full source metadata, authorization and revision checks belong to the reader.
 * The existing reconstructor still validates all events and declared intervals;
 * its rule version and unapproved/non-payroll flags remain unchanged.
 */
export function reconstructContinuousWorkdaysV3(source) {
  assertContinuousWorkdayIdentitiesV3(source);
  const contracts = new Map(source.events.map(event => [event.streamKey, event.contractId]));
  const events = source.events.map(({contractId, ...event}) => event);
  const result = reconstructContinuousWorkdays({events, observations:source.observations,
    from:source.filters?.from, to:source.filters?.to, timezone:source.timezone});
  const rows = result.rows.map(row => {
    // v2 keeps this private stream key until the reader hashes the public row key.
    const streamKey = row.key.slice(0, 64);
    requireIdentity(contracts.has(streamKey) && row.key === streamKey + ':' + row.day);
    return {...row, contractId:contracts.get(streamKey)};
  });
  return {...result, rows};
}
