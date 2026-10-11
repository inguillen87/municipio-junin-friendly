import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { patchedChromiumDiagnostic as manifest } from './patched-chromium-diagnostic-manifest.mjs';
assert.equal(JSON.parse(fs.readFileSync(new URL(import.meta.resolve('playwright/package.json')), 'utf8')).version, manifest.sdkVersion);
const platform = manifest.platforms[process.platform]; assert.ok(platform);
const directory = path.resolve(import.meta.dirname, '../../verification/patched-chromium-' + manifest.version);
const installation = JSON.parse(fs.readFileSync(path.join(directory, 'installation.json'), 'utf8'));
assert.equal(installation.version, manifest.version); assert.equal(installation.sourceRevision, manifest.sourceRevision);
assert.equal(installation.releaseGate, false); assert.equal(installation.globalInstallation, false);
const executablePath = path.join(directory, platform.archivePrefix, platform.binary);
assert.equal(createHash('sha256').update(fs.readFileSync(executablePath)).digest('hex'), platform.binarySha256);
const original = chromium.launch;
// Explicit diagnostic variant. Only the binary changes; original options,
// SDK, executor, requests, fixture data and assertions retain their semantics.
chromium.launch = function (options = {}) {
  assert.equal(options.channel, undefined); assert.equal(options.executablePath, undefined);
  return Reflect.apply(original, this, [{ ...options, executablePath }]);
};
