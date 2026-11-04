import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFamilyDurableBrowserExpectedLedger, nativeFamilyDurableBrowserHtml } from '../scripts/lib/native-family-self-durable-browser.mjs';

test('the browser circuit accounts for all committed writes without hiding inherited requests or PDFs', () => {
  const before = { requests: 1003, events: 3010, children: 501, certificates: 702, blobs: 901 };
  assert.deepEqual(nativeFamilyDurableBrowserExpectedLedger(before), { requests: 1005, events: 3018, children: 502, certificates: 703, blobs: 902 });
  assert.deepEqual(before, { requests: 1003, events: 3010, children: 501, certificates: 702, blobs: 901 });
});

test('a missing or invalid count cannot be treated as zero in the persistence evidence', () => {
  const baseline = { requests: 3, events: 10, children: 1, certificates: 1, blobs: 2 };
  for (const invalid of [null, undefined, -1, 1.5, '3', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => nativeFamilyDurableBrowserExpectedLedger({ ...baseline, requests: invalid }));
  }
  const incomplete = { ...baseline }; delete incomplete.blobs;
  assert.throws(() => nativeFamilyDurableBrowserExpectedLedger(incomplete));
  assert.throws(() => nativeFamilyDurableBrowserExpectedLedger({ ...baseline, ignoredRows: 0 }));
});

test('the synthetic page mounts the product panel with server-side auth, never a client-selected account', () => {
  for (const view of ['self', 'review']) {
    const html = nativeFamilyDurableBrowserHtml(view);
    assert.match(html, /fetch\('\/api\/internal-auth'\)/);
    assert.match(html, /from'\/assets\/native-family-request-panel\.js'/);
    assert.ok(html.includes("{auth,view:'" + view + "'}"));
    assert.doesNotMatch(html, /membershipId|actorEmail|actorSessionId|contractId|requestId|localStorage|sessionStorage/);
  }
  for (const view of ['', 'admin', '</script>', null]) assert.throws(() => nativeFamilyDurableBrowserHtml(view));
});
