import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TIME_SOURCE_BROWSER_VIEWPORTS,
  buildTimeSourceAuthFixture,
  buildTimeSourceBootstrapFixture,
  buildTimeSourceBrowserFailure,
  buildTimeSourceBrowserSummary,
  buildTimeSourceReadinessFixture,
  expectedTimeSourceCreateBody,
  expectedTimeSourceUpdateBody,
  loadTimeSourceBrowserConfig,
  validateTimeSourceCreateRequest,
  validateTimeSourceUpdateRequest,
} from '../scripts/verify-time-source-browser.mjs';

const source = readFileSync(new URL('../scripts/verify-time-source-browser.mjs', import.meta.url), 'utf8');

test('gate browser acepta únicamente HTTP loopback limpio', () => {
  assert.deepEqual(loadTimeSourceBrowserConfig({ BASE_URL: 'http://localhost:3100/' }), { baseUrl: 'http://localhost:3100' });
  assert.deepEqual(loadTimeSourceBrowserConfig({}), { baseUrl: 'http://127.0.0.1:3100' });
  for (const invalid of ['https://localhost:3100', 'http://example.com', 'http://user:secret@localhost:3100', 'http://localhost:3100/path', 'http://localhost:3100?token=x', 'http://localhost:3100/#x']) assert.throws(() => loadTimeSourceBrowserConfig({ BASE_URL: invalid }));
});

test('matriz contractual cubre Mendoza, UTC y Asia en desktop y móvil', () => {
  assert.deepEqual(TIME_SOURCE_BROWSER_VIEWPORTS, [
    { name: 'desktop-mendoza', width: 1440, height: 900, timezoneId: 'America/Argentina/Mendoza' },
    { name: 'desktop-utc', width: 1280, height: 800, timezoneId: 'UTC' },
    { name: 'mobile-asia', width: 390, height: 844, timezoneId: 'Asia/Tokyo' },
  ]);
});

test('auth fixture es tenant v2 MFA y no plataforma', () => {
  const auth = buildTimeSourceAuthFixture();
  assert.equal(auth.authenticated, true);
  assert.equal(auth.sessionVersion, 2);
  assert.equal(auth.access.context, 'tenant');
  assert.equal(auth.authentication.mfaVerified, true);
  assert.doesNotMatch(JSON.stringify(auth), /PLATFORM_OWNER|ADMIN_INTERNO/);
});

test('bootstrap expone cinco requisitos y flags fail-closed', () => {
  const bootstrap = buildTimeSourceBootstrapFixture();
  const readiness = buildTimeSourceReadinessFixture();
  assert.equal(readiness.requirements.length, 5);
  assert.equal(new Set(readiness.requirements.map((item) => item.key)).size, 5);
  assert.equal(readiness.catalogApproved, false);
  for (const flag of ['evaluationReady', 'attendanceReconciled', 'payrollCalculated', 'payrollPosted', 'grhMutation']) assert.equal(readiness[flag], false);
  assert.deepEqual(bootstrap.allowedCommands, ['create_draft']);
  assert.equal(bootstrap.feature.canPropose, true);
  assert.equal(bootstrap.feature.canApprove, false);
  assert.equal(bootstrap.readiness.length, 5);
});

test('create usa POST exacto, idempotency UUID y cero datos sensibles', () => {
  const body = expectedTimeSourceCreateBody();
  assert.equal(body.payload.schemaVersion, 'v2');
  assert.equal(Object.hasOwn(body.payload, 'ownerCode'), false);
  assert.equal(Object.hasOwn(body.payload, 'systemLocator'), false);
  assert.equal(body.payload.reasonCode, 'source_onboarding');
  assert.equal(body.payload.artifactSha256.length, 64);
  assert.doesNotMatch(JSON.stringify(body), /PII_SENTINEL|@|password|secret|token|https?:\/\//i);
  assert.equal(validateTimeSourceCreateRequest({ method: 'POST', pathname: '/api/internal-actions', search: '', headers: { accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': '70000000-0000-4000-8000-000000000007' }, body }), true);
  assert.throws(() => validateTimeSourceCreateRequest({ method: 'POST', pathname: '/api/internal-actions', search: '?email=x', headers: { accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': 'bad' }, body }));
});

test('update usa PATCH, target y expectedVersion fuera de metadata', () => {
  const body = expectedTimeSourceUpdateBody();
  assert.equal(body.contractId, 'a1000000-0000-4000-8000-000000000001');
  assert.equal(body.expectedVersion, 1);
  assert.equal(body.payload.reasonCode, 'metadata_correction');
  assert.equal(validateTimeSourceUpdateRequest({ method: 'PATCH', pathname: '/api/internal-actions', search: '', headers: { accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': '70000000-0000-4000-8000-000000000007' }, body }), true);
});

test('verificador intercepta toda API y nunca toca base', () => {
  assert.match(source, /page\.route\('\*\*\/api\/\*\*'/);
  assert.match(source, /databaseMutations:\s*false/);
  assert.match(source, /assertStorageEmpty/);
  assert.match(source, /assertNoHorizontalOverflow/);
  assert.match(source, /timezoneId:\s*viewport\.timezoneId/);
  assert.match(source, /TIME_SOURCE_BROWSER_CIVIL_DATE_DRIFT/);
  assert.match(source, /TIME_SOURCE_BROWSER_MENDOZA_INSTANT_DRIFT/);
  assert.doesNotMatch(source, /DATABASE_URL|NEON_DATABASE|new\s+(?:Client|Pool)\b|sql`|fetch\([^)]*https:/i);
});

test('resúmenes diferencian éxito y fallo sin evidencia sensible', () => {
  assert.deepEqual(buildTimeSourceBrowserSummary(), { ok: true, viewportsVerified: 3, apiFullyIntercepted: true, databaseMutations: false, createRequestsVerified: 3, updateRequestsVerified: 3, piiRendered: false, browserStorageEmpty: true, evaluationReady: false });
  assert.deepEqual(buildTimeSourceBrowserFailure(), { ok: false, code: 'TIME_SOURCE_BROWSER_VERIFICATION_FAILED' });
});
