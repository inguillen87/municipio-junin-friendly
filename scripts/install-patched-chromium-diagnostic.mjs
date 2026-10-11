import assert from 'node:assert/strict';
// The existing comparison retains its separate diagnostic installation.
// It cannot opt itself into the release runtime.
assert.equal(process.argv.length, 2);
await import('./install-project-chromium.mjs');
