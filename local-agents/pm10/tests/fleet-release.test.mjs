// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRelease} from '../../../scripts/verify-municipal-clock-release.mjs';
import {RELEASE_FILES} from '../../../scripts/build-municipal-clock-release.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'mc-release-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const names = ['app/clock-fleet/gateway.mjs','app/clock-fleet/sender.mjs','app/pm10/reader/lector-fichadas.mjs','verify-release.mjs'];
  const files = [];
  for (const name of names) {
    const bytes = Buffer.from('// Synthetic package fixture\n');
    await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});
    await fs.writeFile(path.join(root,name),bytes);
    files.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
  }
  const manifest = {schema:'municipal-clock-release.v1',sourceCommit:'a'.repeat(40),sourceDirty:false,contentSha256:sha(JSON.stringify(files)),files};
  const save = () => fs.writeFile(path.join(root,'release-manifest.json'),JSON.stringify(manifest));
  await save();
  return {root,manifest,save};
}
test('offline release check permits separate private host directories without reading them',async t => {
  const {root} = await fixture(t);
  await fs.mkdir(path.join(root,'secrets'));
  await fs.writeFile(path.join(root,'secrets','not-packaged.key'),'synthetic-private-material');
  const result = await verifyRelease(root);
  assert.equal(result.ok,true); assert.equal(result.files,4);
  assert.equal(result.networkRequests,0); assert.equal(result.serviceChanges,0);
});
test('altered source or injected executable stops integrity verification',async t => {
  const first = await fixture(t);
  await fs.appendFile(path.join(first.root,'app/clock-fleet/sender.mjs'),'// changed');
  await assert.rejects(verifyRelease(first.root),/RELEASE_CONTENT_MISMATCH/);
  const second = await fixture(t);
  await fs.writeFile(path.join(second.root,'app/clock-fleet/unexpected.mjs'),'// injected');
  await assert.rejects(verifyRelease(second.root),/RELEASE_UNEXPECTED_CONTENT/);
});
test('duplicate and traversing manifest entries fail before reading an external file',async t => {
  const {root,manifest,save} = await fixture(t);
  manifest.files.push({...manifest.files[0]}); await save();
  await assert.rejects(verifyRelease(root),/RELEASE_MANIFEST_INVALID/);
  manifest.files.pop(); manifest.files[0].path='app/clock-fleet/../../../outside.mjs'; await save();
  await assert.rejects(verifyRelease(root),/RELEASE_MANIFEST_INVALID/);
});
test('release cannot lose its coordinator or reader and remain complete',async t => {
  const {root,manifest,save} = await fixture(t);
  manifest.files = manifest.files.filter(file => !file.path.endsWith('gateway.mjs'));
  await save();
  await assert.rejects(verifyRelease(root),/RELEASE_INCOMPLETE/);
});
test('release manifest digest and source revision are verified',async t => {
  const {root,manifest,save} = await fixture(t);
  manifest.contentSha256='b'.repeat(64); await save();
  await assert.rejects(verifyRelease(root),/RELEASE_MANIFEST_MISMATCH/);
  manifest.sourceCommit='master'; await save();
  await assert.rejects(verifyRelease(root),/RELEASE_MANIFEST_INVALID/);
});
test('a self-consistent package still rejects a missing runtime dependency',async t => {
  const {root,manifest,save} = await fixture(t);
  const source = Buffer.from("import {missing} from './not-packaged.mjs';\n");
  const entry = manifest.files.find(file => file.path.endsWith('/gateway.mjs'));
  await fs.writeFile(path.join(root,entry.path),source);
  entry.bytes=source.length; entry.sha256=sha(source);
  manifest.contentSha256=sha(JSON.stringify(manifest.files)); await save();
  await assert.rejects(verifyRelease(root),/RELEASE_DEPENDENCY_MISSING/);
});
test('release allowlist includes municipal installation and excludes local credentials, queues and user startup installers',() => {
  assert.ok(RELEASE_FILES['clock-fleet'].includes('install-machine-windows.ps1'));
  assert.ok(RELEASE_FILES['clock-fleet'].includes('install-machine-linux.sh'));
  for (const name of Object.values(RELEASE_FILES).flat()) assert.doesNotMatch(name,/\.json$|\.key$|\.bin$|install-user|\.exe$/);
});
