import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalAdoptionBrowserOptions as options} from '../scripts/lib/operational-adoption-browser-options.mjs';
const output = '--output=verification/operational-browser-qa', sha = 'a'.repeat(40);
const ci = {CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '1234', GITHUB_SHA: sha};

test('local synthetic browser retains installed Chrome, and Chromium uses the installed Playwright engine', () => {
  assert.deepEqual(options([output], {}).launchOptions, {headless: true, channel: 'chrome'});
  assert.deepEqual(options([output, '--browser=chromium'], {}).launchOptions, {headless: true});
  assert.equal(options([output, '--source-commit='+sha], {}).sourceCommit, sha);
});
test('CI binds the fixture browser to the GitHub source and downloaded Chromium', () => {
  const result = options([output, '--source-commit='+sha], ci);
  assert.equal(result.browser, 'chromium');
  assert.deepEqual(result.launchOptions, {headless: true});
  assert.throws(() => options([output, '--source-commit='+sha, '--browser=chrome'], ci), /QA_CI_CHROMIUM_REQUIRED/);
  for (const patch of [{GITHUB_ACTIONS:'false'}, {GITHUB_RUN_ID:''}, {GITHUB_SHA:'master'}])
    assert.throws(() => options([output, '--source-commit='+sha], {...ci, ...patch}));
  assert.throws(() => options([output], ci), /QA_SOURCE_COMMIT_CHANGED/);
  assert.throws(() => options([output, '--source-commit='+'b'.repeat(40)], ci), /QA_SOURCE_COMMIT_CHANGED/);
});
test('browser options reject external destinations, arbitrary executors and repeated arguments', () => {
  for (const args of [[output, '--url=https://municontrol.com'], [output, '--executable=/other'],
    [output, '--browser=firefox'], [output, output], ['--output=verification/../outside'],
    ['--output=C:/Users/guill/Downloads'], [output, '--source-commit=master']])
    assert.throws(() => options(args, {}));
});
