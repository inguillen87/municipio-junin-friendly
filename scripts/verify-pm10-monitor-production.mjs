// Public, read-only delivery check. A 401 is expected; no login is attempted.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const origin = 'https://municipio-junin-friendly.vercel.app';
const files = ['assets/pm10-reception.js', 'assets/pm10-reception.css'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expected = Object.fromEntries(files.map(file => [file, sha256(fs.readFileSync(file))]));
let result, lastError;
for (let attempt = 1; attempt <= 10; attempt++) {
  try {
    const actual = {};
    for (const file of files) {
      const response = await fetch(`${origin}/${file}?monitor-check=${Date.now()}`, {
        cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      assert.equal(response.status, 200, `${file}: HTTP ${response.status}`);
      actual[file] = sha256(Buffer.from(await response.arrayBuffer()));
      assert.equal(actual[file], expected[file], `${file}: release not yet served`);
    }
    const gate = await fetch(`${origin}/api/internal-attendance?resource=pm10-reception`, {
      cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    assert.equal(gate.status, 401, 'anonymous access must remain blocked');
    assert.match(gate.headers.get('cache-control') || '', /no-store/i);
    await gate.body?.cancel();
    result = { checkedAt: new Date().toISOString(), sourceSha: process.env.GITHUB_SHA || null,
      origin, assetHashes: actual, anonymousStatus: gate.status, noStore: true,
      authenticatedSessionTested: false, physicalClockTested: false, writes: false };
    break;
  } catch (error) {
    lastError = error; console.log(`Delivery check ${attempt}/10: ${error.message}`);
    if (attempt < 10) await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
assert.ok(result, `Production evidence unavailable: ${lastError?.message}`);
const out = path.resolve('verification/pm10-monitor'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'production.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
