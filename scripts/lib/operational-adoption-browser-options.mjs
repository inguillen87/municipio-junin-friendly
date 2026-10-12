import assert from 'node:assert/strict';

// Fixture browser only: no URL, user profile or executable override.
export function operationalAdoptionBrowserOptions(argv, env = process.env) {
  const options = {};
  for (const arg of argv) {
    const match = /^--(output|browser|source-commit)=(.+)$/.exec(arg);
    assert.ok(match && !Object.hasOwn(options, match[1]), 'QA_BROWSER_OPTION_INVALID');
    options[match[1]] = match[2];
  }
  assert.match(options.output ?? '', /^verification\/[a-z0-9-]+$/, 'QA_BROWSER_OUTPUT_INVALID');
  const ci = env.CI === 'true';
  const browser = options.browser ?? (ci ? 'chromium' : 'chrome');
  assert.ok(['chrome', 'chromium'].includes(browser), 'QA_BROWSER_UNSUPPORTED');
  const sourceCommit = options['source-commit'] ?? null;
  if (sourceCommit !== null) assert.match(sourceCommit, /^[a-f0-9]{40}$/, 'QA_SOURCE_COMMIT_REQUIRED');
  if (ci) {
    assert.ok(env.GITHUB_ACTIONS === 'true' && /^[0-9]+$/.test(env.GITHUB_RUN_ID ?? ''), 'QA_CI_CONTEXT_REQUIRED');
    assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/, 'QA_CI_CONTEXT_REQUIRED');
    assert.equal(sourceCommit, env.GITHUB_SHA, 'QA_SOURCE_COMMIT_CHANGED');
    assert.equal(browser, 'chromium', 'QA_CI_CHROMIUM_REQUIRED');
  }
  return Object.freeze({output: options.output, browser, sourceCommit,
    launchOptions: Object.freeze(browser === 'chrome' ? {headless: true, channel: 'chrome'} : {headless: true})});
}
