import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

// Incremental migration: this build has no ownership of the legacy application,
// authentication, API contracts or payroll state. Only declared roots are mounted.
export async function buildReactIslands(root, output) {
  const islands = [
    { name: 'install-share', source: 'src/islands/install-share-entry.jsx', page: 'login.html', mount: 'mc-install-share-root', marker: 'MC_REACT_ISLANDS' },
    { name: 'report-workspace', source: 'src/islands/report-workspace-entry.jsx', page: 'reportes-rrhh.html', mount: 'mc-report-workspace-root', marker: 'MC_REPORT_WORKSPACE' },
  ];
  const result = await build({
    absWorkingDir: root,
    entryPoints: Object.fromEntries(islands.map(island => [island.name, island.source])),
    outdir: path.join(output, 'assets/islands'),
    entryNames: '[name]-[hash]',
    bundle: true, minify: true, jsx: 'automatic', format: 'iife',
    platform: 'browser', target: ['es2020'], sourcemap: false,
    legalComments: 'linked', metafile: true, logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const emitted = [];
  for (const island of islands) {
    const entry = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint?.replaceAll('\\', '/') === island.source)?.[0];
    assert.ok(entry, `${island.name} must emit its entry point`);
    const absolute = path.resolve(root, entry);
    const bytes = await fs.readFile(absolute);
    const gzipBytes = gzipSync(bytes).length;
    assert.ok(gzipBytes < 90000, `${island.name} must remain below 90 KB compressed`);
    const href = `/${path.relative(output, absolute).split(path.sep).join('/')}`;
    const file = path.join(output, island.page);
    const html = await fs.readFile(file, 'utf8');
    const marker = `<!-- ${island.marker} -->`;
    assert.equal(html.split(`id="${island.mount}"`).length - 1, 1);
    assert.equal(html.split(marker).length - 1, 1);
    await fs.writeFile(file, html.replace(marker, `<script defer src="${href}"></script>`));
    emitted.push({ name: island.name, page: island.page, href });
    console.log(`React island: ${island.name} ${gzipBytes} bytes gzip; ${island.page} only.`);
  }
  return emitted;
}
