// Reuse one source-pinned QA190 object; never construct an injected foundation.
import assert from 'node:assert/strict';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
 (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const schemaPattern = /^mc_qa_fixed_092_[a-f0-9]{32}$/;
const sourceHashPattern = /^[a-f0-9]{64}$/;

export function resolveMonthlyDayQaFoundation(
 {major, sourceCommit, read, schema, operationalPairBaseline, foundation}, buildOwnerProgramQa
) {
 assert.equal(typeof buildOwnerProgramQa, 'function', 'MONTHLY192_FOUNDATION_FACTORY_REQUIRED');
 if (foundation === undefined) {
  // Preserve the standalone constructor call and its conditional schema option.
  return buildOwnerProgramQa({major, sourceCommit, read, ...(schema ? {schema} : {}), operationalPairBaseline});
 }

 assert.ok([17, 18].includes(major), 'MONTHLY192_FOUNDATION_MAJOR_REQUIRED');
 assert.match(sourceCommit ?? '', /^[a-f0-9]{40}$/, 'MONTHLY192_FOUNDATION_SOURCE_COMMIT_REQUIRED');
 assert.equal(typeof read, 'function', 'MONTHLY192_FOUNDATION_READER_REQUIRED');
 assert.ok(['pre107', 'published107'].includes(operationalPairBaseline), 'MONTHLY192_FOUNDATION_BASELINE_REQUIRED');
 assert.ok(record(foundation), 'MONTHLY192_FOUNDATION_OBJECT_REQUIRED');
 assert.equal(foundation.major, major, 'MONTHLY192_FOUNDATION_MAJOR_MISMATCH');
 assert.equal(foundation.sourceCommit, sourceCommit, 'MONTHLY192_FOUNDATION_SOURCE_COMMIT_MISMATCH');
 assert.equal(foundation.operationalPairBaseline, operationalPairBaseline, 'MONTHLY192_FOUNDATION_BASELINE_MISMATCH');
 assert.match(foundation.schema ?? '', schemaPattern, 'MONTHLY192_FOUNDATION_SCHEMA_REQUIRED');
 if (schema !== undefined) assert.equal(foundation.schema, schema, 'MONTHLY192_FOUNDATION_SCHEMA_MISMATCH');
 assert.equal(typeof foundation.normalized, 'function', 'MONTHLY192_FOUNDATION_NORMALIZER_REQUIRED');
 assert.ok(record(foundation.sourceHashes), 'MONTHLY192_FOUNDATION_SOURCE_HASHES_REQUIRED');
 const keys = Reflect.ownKeys(foundation.sourceHashes);
 assert.ok(keys.length > 0 && keys.every(key => typeof key === 'string' && key.length > 0 &&
  typeof foundation.sourceHashes[key] === 'string' && sourceHashPattern.test(foundation.sourceHashes[key])),
 'MONTHLY192_FOUNDATION_SOURCE_HASHES_INVALID');
 for (const key of ['actor', 'checker', 'ids']) {
  assert.ok(record(foundation[key]), 'MONTHLY192_FOUNDATION_' + key.toUpperCase() + '_REQUIRED');
 }
 assert.equal(foundation.connects, false, 'MONTHLY192_FOUNDATION_MUST_NOT_CONNECT');
 assert.equal(foundation.executesSql, false, 'MONTHLY192_FOUNDATION_MUST_NOT_EXECUTE_SQL');

 // QA190 does not retain its reader. Existing callers still verify source hashes.
 // Preserve live actor/checker MFA references; ids.session may be an older fixture ID.
 return foundation;
}
