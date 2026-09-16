import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
export async function buildPayrollParameters(root, output) {
  const source = 'src/islands/payroll-parameters-entry.jsx';
  const result = await build({ absWorkingDir: root, entryPoints: { 'payroll-parameters': source }, outdir: path.join(output, 'assets/islands'), entryNames: '[name]-[hash]', bundle: true, minify: true, jsx: 'automatic', format: 'esm', platform: 'browser', target: ['es2020'], sourcemap: false, legalComments: 'linked', metafile: true, logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"' } });
  const entry = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint?.replaceAll('\\', '/') === source)?.[0];
  assert.ok(entry, 'Parameter workspace entry must be emitted');
  const absolute = path.resolve(root, entry), compressed = gzipSync(await fs.readFile(absolute)).length;
  assert.ok(compressed < 110000, 'Parameter workspace must remain below 110 KB gzip');
  const href = '/' + path.relative(output, absolute).split(path.sep).join('/');
  const loader = 'assets/payroll-parameters-loader.js', code = await fs.readFile(path.join(root, loader), 'utf8'), marker = '__MC_PAYROLL_PARAMETERS_BUNDLE__';
  assert.equal(code.split(marker).length - 1, 1, 'One optional parameter import');
  await fs.writeFile(path.join(output, loader), code.replace(marker, href));
  console.log(`React parameter workspace: ${compressed} bytes gzip. Existing private API facades only.`);
}
