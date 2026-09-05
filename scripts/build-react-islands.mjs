import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

// Incremental migration: this build has no ownership of the legacy application,
// authentication, API contracts or payroll state. Only declared roots are mounted.
export async function buildReactIslands(root, output) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: { 'install-share': 'src/islands/install-share-entry.jsx' },
    outdir: path.join(output, 'assets/islands'),
    entryNames: '[name]-[hash]',
    bundle: true, minify: true, jsx: 'automatic', format: 'iife',
    platform: 'browser', target: ['es2020'], sourcemap: false,
    legalComments: 'linked', metafile: true, logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const entry = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint)?.[0];
  assert.ok(entry, 'React island must emit its entry point');
  const absolute = path.resolve(root, entry);
  const bytes = await fs.readFile(absolute);
  const gzipBytes = gzipSync(bytes).length;
  assert.ok(gzipBytes < 90000, 'First React island must remain below 90 KB compressed');
  const href = `/${path.relative(output, absolute).split(path.sep).join('/')}`;
  const loginFile = path.join(output, 'login.html');
  const login = await fs.readFile(loginFile, 'utf8');
  assert.equal((login.match(/id="mc-install-share-root"/g) || []).length, 1);
  assert.equal((login.match(/<!-- MC_REACT_ISLANDS -->/g) || []).length, 1);
  await fs.writeFile(loginFile, login.replace('<!-- MC_REACT_ISLANDS -->', `<script defer src="${href}"></script>`));
  console.log(`React island: install/share ${gzipBytes} bytes gzip; login only.`);
}
