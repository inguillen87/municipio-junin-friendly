import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFinalIdentityProfileInstallation } from '../scripts/lib/final-identity-profile-installation.mjs';
import { FINAL_CONTRACT_TRANSITION_ROWS_SQL, FINAL_CONTRACT_TRANSITION_LEGACY_ROWS_SQL,
  FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL } from '../scripts/lib/grh-final-contract-transition.mjs';

const options = {read: p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'), sourceCommit: 'a'.repeat(40)};
test('only the installed final row comparator and its exact readiness pin change', () => {
  const b = buildFinalIdentityProfileInstallation(options);
  assert.deepEqual(b.beforePins.map(p => p.name), ['employment_adoption_final_rows_v1', 'municipal_adoption_ready_v1']);
  b.beforePins.forEach((p, n) => assert.deepEqual({...p, sha256: null}, {...b.afterPins[n], sha256: null}));
  assert.equal(b.beforeDefinitions[0].includes('expected.master_sex'), false);
  assert.ok(b.afterDefinitions[0].includes('expected.master_sex'));
  assert.equal(b.beforeDefinitions[1].replaceAll(b.beforePins[0].sha256, b.afterPins[0].sha256), b.afterDefinitions[1]);
  assert.ok(b.afterPins.every(p => p.runtime === false));
});
test('complete profile comparison retains source keys, every row and literal facts', () => {
  assert.ok(FINAL_CONTRACT_TRANSITION_ROWS_SQL.includes(FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL));
  for (const needle of ['source_record_json', 'previous_facts_json', 'candidate_facts_json', 'person_links=0', 'all_person_links>1', 'FROM facts ORDER BY row_key'])
    assert.ok(FINAL_CONTRACT_TRANSITION_ROWS_SQL.includes(needle));
  assert.ok(FINAL_CONTRACT_TRANSITION_LEGACY_ROWS_SQL.includes("record->'sexo' IS DISTINCT FROM before_person->'sex_code'"));
  assert.doesNotMatch(FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL, /UPDATE|INSERT|DELETE|LIMIT|OFFSET|regexp_replace/);
  assert.match(FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL, /public\.is_valid_cuil/);
  assert.match(FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL, /source_payload,personId/);
});
test('schema-only correction preserves all rows, metadata and pending body/key history', () => {
  const b = buildFinalIdentityProfileInstallation(options);
  assert.equal(b.migration.length, 2);
  assert.ok(b.migration.every(s => s.startsWith('CREATE OR REPLACE FUNCTION public.')));
  assert.doesNotMatch(b.migration.join('\n'), /GRANT|REVOKE|ALTER TABLE|ALTER ROLE|UPDATE public\.|INSERT INTO|DELETE FROM|DROP|DISABLE/);
  assert.match(b.before, /rowsSha256/);
  assert.match(b.audit, /IDENTITY_PROFILE_PRIOR_STATE_CHANGED/);
  assert.match(b.initial, /IDENTITY_PROFILE_BEFORE_METADATA/);
  assert.match(b.initial, /IDENTITY_PROFILE_AFTER_METADATA/);
  assert.match(b.state, /repeatable read/);
  assert.match(b.proof, /'newTables',0/);
  assert.match(b.proof, /'businessOperations',0/);
});
