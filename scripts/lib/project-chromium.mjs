import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { patchedChromiumDiagnostic as manifest } from './patched-chromium-diagnostic-manifest.mjs';

// Explicit project QA runtime, admitted after the original Ubuntu comparison.
// No browser/profile on the operator's machine is installed or modified.
assert.equal(JSON.parse(fs.readFileSync(new URL(import.meta.resolve('playwright/package.json')), 'utf8')).version, manifest.sdkVersion);
const platform = manifest.platforms[process.platform]; assert.ok(platform);
const directory = path.resolve(import.meta.dirname, '../../verification/release-chromium-' + manifest.version);
const installation = JSON.parse(fs.readFileSync(path.join(directory, 'installation.json'), 'utf8'));
for (const key of ['version', 'sourceRevision', 'upstreamFix', 'sdkVersion']) assert.equal(installation[key], manifest[key]);
assert.equal(installation.platform, process.platform); assert.equal(installation.releaseGate, true); assert.equal(installation.globalInstallation, false);
assert.equal(installation.archiveSha256, platform.archiveSha256); assert.equal(installation.binarySha256, platform.binarySha256);
const executablePath = path.join(directory, platform.archivePrefix, platform.binary);
assert.equal(createHash('sha256').update(fs.readFileSync(executablePath)).digest('hex'), platform.binarySha256);
const original = chromium.launch;
chromium.launch = function (options = {}) {
  assert.equal(options.channel, undefined); assert.equal(options.executablePath, undefined);
  return Reflect.apply(original, this, [{ ...options, executablePath }]);
};
