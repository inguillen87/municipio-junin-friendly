import { publicBuildResolution } from './lib/public-build-resolution.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { buildPayrollParameters } from './build-payroll-parameters.mjs';

// Adapted from the reviewed Civitas island build. Only this declared public
// catalog is compiled; the existing API, identity and payroll tools stay intact.
export async function buildReactIslands(root, output) {
  await buildPayrollParameters(root, output);
  const source = 'src/islands/report-catalog-entry.jsx';
  const result = await build({ ...publicBuildResolution,
    absWorkingDir: root,
    entryPoints: { 'report-catalog': source },
    outdir: path.join(output, 'assets/islands'),
    entryNames: '[name]-[hash]',
    bundle: true, minify: true, jsx: 'automatic', format: 'esm',
    platform: 'browser', target: ['es2020'], sourcemap: false,
    legalComments: 'linked', metafile: true, logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const entry = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint?.replaceAll('\\', '/') === source)?.[0];
  assert.ok(entry, 'Report catalog must emit its entry point');
  const absolute = path.resolve(root, entry);
  const gzipBytes = gzipSync(await fs.readFile(absolute)).length;
  assert.ok(gzipBytes < 90000, 'Report catalog must remain below 90 KB compressed');
  const href = `/${path.relative(output, absolute).split(path.sep).join('/')}`;
  const consumer = path.join(output, 'assets/report-centre.js');
  const code = await fs.readFile(consumer, 'utf8');
  const marker = '__MC_REPORT_CATALOG_BUNDLE__';
  assert.equal(code.split(marker).length - 1, 1, 'Catalog import marker must be unique');
  await fs.writeFile(consumer, code.replace(marker, href));
  console.log(`React catalog: ${gzipBytes} bytes gzip; reports only.`);
  return [{ name: 'report-catalog', href, gzipBytes }];
}

// Independent optional island: payroll calculation, leave requests and employee
// forms remain owned by the existing page/API. Compiled only on a release build.
export async function buildLeaveRulesIsland(root, output) {
  const source = 'src/islands/leave-rules-entry.jsx';
  const result = await build({ ...publicBuildResolution,
    absWorkingDir: root, entryPoints: { 'leave-rules': source },
    outdir: path.join(output, 'assets/islands'), entryNames: '[name]-[hash]',
    bundle: true, minify: true, jsx: 'automatic', format: 'esm',
    platform: 'browser', target: ['es2020'], sourcemap: false,
    legalComments: 'linked', metafile: true, logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const entry = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint?.replaceAll('\\', '/') === source)?.[0];
  assert.ok(entry, 'Leave rules must emit its entry point');
  const absolute = path.resolve(root, entry);
  const gzipBytes = gzipSync(await fs.readFile(absolute)).length;
  assert.ok(gzipBytes < 90000, 'Leave rules must stay below 90 KB gzip');
  const href = `/${path.relative(output, absolute).split(path.sep).join('/')}`;
  const consumer = path.join(output, 'licencias-control.html');
  const code = await fs.readFile(consumer, 'utf8');
  const marker = '__MC_LEAVE_RULES_BUNDLE__';
  assert.equal(code.split(marker).length - 1, 1, 'Leave import marker must be unique');
  await fs.writeFile(consumer, code.replace(marker, href));
  console.log(`React leave rules: ${gzipBytes} bytes gzip; no new API or data writes.`);
  return { name: 'leave-rules', href, gzipBytes };
}
