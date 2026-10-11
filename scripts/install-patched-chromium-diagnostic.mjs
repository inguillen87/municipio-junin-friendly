import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { patchedChromiumDiagnostic as manifest } from './lib/patched-chromium-diagnostic-manifest.mjs';
assert.equal(process.argv.length, 2);
const platform = manifest.platforms[process.platform]; assert.ok(platform, 'Unsupported diagnostic platform');
const root = path.resolve(import.meta.dirname, '..'), directory = path.join(root, 'verification', 'patched-chromium-' + manifest.version);
assert.equal(path.dirname(directory), path.join(root, 'verification')); fs.mkdirSync(directory);
const archive = path.join(directory, 'browser.zip'), hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--output', archive, platform.url], { windowsHide: true, timeout: 180000 });
assert.equal(hash(archive), platform.archiveSha256);
// Windows ships bsdtar with ZIP support; Ubuntu's GNU tar does not.
const archiveTool = process.platform === 'win32' ? 'tar' : 'unzip';
const entries = execFileSync(archiveTool, process.platform === 'win32' ? ['-tf', archive] : ['-Z', '-1', archive], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
assert.ok(entries.length > 0);
for (const entry of entries) assert.ok(entry.startsWith(platform.archivePrefix + '/') && !/(^|\/)\.\.(\/|$)|^[A-Za-z]:|\\/.test(entry), 'Archive entry outside the exact diagnostic directory');
execFileSync(archiveTool, process.platform === 'win32' ? ['-xf', archive, '-C', directory] : ['-q', archive, '-d', directory], { windowsHide: true });
assert.equal(hash(path.join(directory, platform.archivePrefix, platform.binary)), platform.binarySha256);
fs.writeFileSync(path.join(directory, 'installation.json'), JSON.stringify({ version: manifest.version, sourceRevision: manifest.sourceRevision,
  upstreamFix: manifest.upstreamFix, sdkVersion: manifest.sdkVersion, platform: process.platform, archiveSha256: platform.archiveSha256,
  binarySha256: platform.binarySha256, releaseGate: false, globalInstallation: false, checkedAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ version: manifest.version, platform: process.platform, diagnosticOnly: true, verifiedArchiveAndBinary: true }));
