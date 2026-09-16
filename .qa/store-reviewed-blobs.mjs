// Stores checksum-verified application Git blobs only. No refs/commits/workflows.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const base = '2f97b8394841dbea8e8c17099fc8b3d177bd9673';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), base);
const manifest = JSON.parse(fs.readFileSync('../meta/.qa/manifest.json', 'utf8'));
const entries = Object.entries(manifest).filter(([file]) => !file.startsWith('.github/'));
for (const [file, expected] of entries) {
  const content = fs.readFileSync(file);
  assert.equal(createHash('sha256').update(content).digest('hex'), expected, file);
  const response = await fetch('https://api.github.com/repos/inguillen87/municipio-junin-friendly/git/blobs', {
    method: 'POST', headers: {Authorization:`Bearer ${process.env.GH_TOKEN}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json'},
    body: JSON.stringify({content:content.toString('utf8'), encoding:'utf-8'}), signal:AbortSignal.timeout(20000),
  });
  const body = await response.json();
  assert.ok(response.ok, `Application blob rejected: HTTP ${response.status}; ${String(body.message || '').slice(0,300)}`);
  const expectedGit = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  assert.equal(body.sha, expectedGit);
  console.log(JSON.stringify({path:file, sha:body.sha, sha256:expected}));
}
console.log('Only reviewed application blobs stored. No workflow file, tree, commit, ref, deployment or municipal data changed.');
