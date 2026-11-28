import { publicBuildResolution } from './lib/public-build-resolution.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

// Apache ECharts (tree-shaken) with the MuniControl theme, emitted at a stable path so screens load it on demand:
// import('/assets/mc-charts.js'). Pages without charts never download it.
export async function buildCharts(root, output) {
  const outfile = path.join(output, 'assets/mc-charts.js');
  await build({ ...publicBuildResolution,
    absWorkingDir: root,
    entryPoints: ['src/charts/mc-charts-entry.js'],
    outfile,
    bundle: true, minify: true, format: 'esm', platform: 'browser', target: ['es2020'],
    sourcemap: false, legalComments: 'linked', logLevel: 'warning',
  });
  const gzipBytes = gzipSync(await fs.readFile(outfile)).length;
  assert.ok(gzipBytes < 240000, `Charts bundle must stay below 240 KB compressed (now ${gzipBytes})`);
  return { outfile, gzipBytes };
}
