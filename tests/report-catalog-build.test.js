import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildReactIslands } from '../scripts/build-react-islands.mjs';

test('catalog build emits a reproducible local module and preserves the surrounding report controller', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-react-catalog-'));
  try {
    await fs.mkdir(path.join(output, 'assets'));
    const consumer = await fs.readFile(path.join(root, 'assets/report-centre.js'), 'utf8');
    await fs.writeFile(path.join(output, 'assets/report-centre.js'), consumer);
    const [first] = await buildReactIslands(root, output);
    const built = await fs.readFile(path.join(output, 'assets/report-centre.js'), 'utf8');
    assert.equal(built.replace(first.href, '__MC_REPORT_CATALOG_BUNDLE__'), consumer);
    assert.ok(first.gzipBytes > 1000 && first.gzipBytes < 90000);
    const bundlePath = path.join(output, first.href);
    assert.ok((await fs.readFile(bundlePath, 'utf8')).includes('mountReportCatalog'));
    assert.ok((await fs.readFile(bundlePath + '.LEGAL.txt', 'utf8')).includes('MIT'));
    assert.equal((await fs.readdir(path.dirname(bundlePath))).some(name => name.endsWith('.map')), false);
    await fs.writeFile(path.join(output, 'assets/report-centre.js'), consumer);
    const [second] = await buildReactIslands(root, output);
    assert.deepEqual(second, first);
  } finally {
    await fs.rm(output, { recursive: true, force: true });
  }
});
