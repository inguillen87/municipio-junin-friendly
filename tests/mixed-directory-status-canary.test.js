// Root's Antecedentes candidate (ANTECEDENTES_MIXTO_C360_R1): the batched municipal status for the mixed directory
// stays off unless the server flag AND the exact tenant pin match the snapshot, the membership principal and its membership.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/internal-data.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function mixedStatusCanaryEnabled('), source.indexOf('function directoryBaseSql('));
const { mixedStatusCanaryEnabled: enabled } = await import('data:text/javascript;base64,' + Buffer.from('export ' + body).toString('base64'));

const tenant = '11111111-1111-4111-8111-111111111111', other = '11111111-1111-4111-8111-111111111112', membership = '33333333-3333-4333-8333-333333333333';
const env = patch => ({ MUNICONTROL_MIXED_DIRECTORY_STATUS_BATCH: '1', MUNICONTROL_MIXED_DIRECTORY_STATUS_TENANT_ID: tenant, ...patch });
const proof = (id = tenant, mem = membership) => ({ scope: { tenantId: id, membershipId: mem } });
const principal = (id = tenant, source = 'membership', mem = membership) => ({ tenant: { id, source, membershipId: mem } });

test('mixed directory status batch is off by default and on only for the pinned tenant of a membership session', () => {
  assert.equal(enabled(env(), proof(), principal()), true);
  assert.equal(enabled({}, proof(), principal()), false, 'no flag: deployed SQL');
  assert.equal(enabled(env({ MUNICONTROL_MIXED_DIRECTORY_STATUS_BATCH: '0' }), proof(), principal()), false);
  assert.equal(enabled(env({ MUNICONTROL_MIXED_DIRECTORY_STATUS_TENANT_ID: '' }), proof(), principal()), false, 'no tenant pin');
  assert.equal(enabled(env({ MUNICONTROL_MIXED_DIRECTORY_STATUS_TENANT_ID: '*' }), proof(), principal()), false, 'no wildcard');
  assert.equal(enabled(env(), proof(other), principal(other)), false, 'another municipality');
  assert.equal(enabled(env(), proof(other), principal()), false, 'snapshot from another tenant');
  assert.equal(enabled(env(), proof(), principal(other)), false, 'principal from another tenant');
  assert.equal(enabled(env(), proof(), principal(tenant, 'platform')), false, 'only membership sessions');
  assert.equal(enabled(env(), proof(tenant, '33333333-3333-4333-8333-333333333334'), principal()), false, 'membership must match the snapshot');
  assert.equal(enabled(env(), null, principal()), false, 'no snapshot');
});
