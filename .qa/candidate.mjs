// Internal release transport only. Never merge this branch into production.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const base = '2f97b8394841dbea8e8c17099fc8b3d177bd9673';
const meta = path.resolve('../meta/.qa');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), base, 'Only the reviewed production base is allowed');
const manifest = JSON.parse(fs.readFileSync(path.join(meta, 'manifest.json'), 'utf8'));
if (process.argv[2] === 'apply') {
  const patch = Buffer.concat(Array.from({ length: 3 }, (_, i) => fs.readFileSync(path.join(meta, `release-text-${i}.patch`))));
  assert.equal(patch.length, 45397);
  assert.equal(hash(patch), 'd77520701fa7bdcfc17dd126e52470696e24dca3e70ebee482720dcbf9504aa8', 'Transport must match the locally reviewed patch');
  const file = path.join(process.env.RUNNER_TEMP, 'licencias-reviewed.patch');
  fs.writeFileSync(file, patch);
  git('apply', '--unidiff-zero', '--check', file);
  git('apply', '--unidiff-zero', file);
  for (const [file, expected] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(file)), expected, file);
  console.log('Exact reviewed patch and all thirteen resulting files verified; no branch updated.');
} else {
  assert.equal(process.argv[2], 'candidate');
  for (const [file, expected] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(file)), expected, file);
  git('add', '--', ...Object.keys(manifest));
  assert.deepEqual(git('diff', '--cached', '--name-only').split('\n').sort(), Object.keys(manifest).sort());
  const repo = 'inguillen87/municipio-junin-friendly';
  async function api(resource, body) {
    const response = await fetch(`https://api.github.com/repos/${repo}/${resource}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    assert.ok(response.ok, `Git object operation failed: ${response.status}`);
    return response.json();
  }
  const current = await api('git/ref/heads/master');
  assert.equal(current.object.sha, base, 'Production advanced: reconcile rather than overwrite');
  const tree = await api('git/trees', { base_tree: git('rev-parse', 'HEAD^{tree}'), tree: Object.keys(manifest).map(file => ({ path: file, mode: '100644', type: 'blob', content: fs.readFileSync(file, 'utf8') })) });
  const commit = await api('git/commits', {
    message: 'feat(licencias): reglas consultables en React y navegación profesional\n\nDirectorio de reglas con búsqueda y filtros, clasificación local pendiente corregida, enlaces dinámicos canónicos. Conserva formularios, matriz de respaldo, permisos, datos y PM. Sin dependencias nuevas ni previews Vercel. Suite completa, build y navegador aprobados en el candidato antes de producción. Transporte SHA256 d77520701fa7bdcfc17dd126e52470696e24dca3e70ebee482720dcbf9504aa8.',
    tree: tree.sha, parents: [base],
  });
  console.log(`VALIDATED_CANDIDATE=${commit.sha}`);
  console.log(`VALIDATED_TREE=${tree.sha}`);
  console.log('No ref was updated. This commit excludes all QA transport files and keeps the original production Vercel configuration.');
}
