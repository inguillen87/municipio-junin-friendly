import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Two explicit synthetic destinations: the existing Windows QA and the
// ephemeral GitHub service. There is no URL, host or executable CLI override.
export const NOELIA_CI_PASSWORD = 'noelia-circuit-synthetic-qa';
export function noeliaCircuitRuntime({root, major, transport = 'local', browser = 'none'},
  {platform = process.platform, env = process.env, realpath = fs.realpathSync} = {}) {
  assert.ok([17, 18].includes(major), 'QA_MAJOR_UNSUPPORTED');
  assert.ok(['local', 'ci'].includes(transport), 'QA_TRANSPORT_UNSUPPORTED');
  assert.ok(['none', 'chrome', 'chromium'].includes(browser), 'QA_BROWSER_UNSUPPORTED');
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const environment = {...env};
  for(const key of Object.keys(environment)) if(/^PG/i.test(key)) delete environment[key];
  Object.assign(environment, {PGCLIENTENCODING:'UTF8', PGCONNECT_TIMEOUT:'5', PGAPPNAME:'municontrol-noelia-circuit-qa'});
  let executable;
  if(transport === 'ci') {
    assert.ok(platform === 'linux' && env.CI === 'true' && env.GITHUB_ACTIONS === 'true'
      && /^[0-9]+$/.test(env.GITHUB_RUN_ID ?? '') && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ''), 'QA_CI_CONTEXT_REQUIRED');
    assert.equal(realpath(root), realpath(env.GITHUB_WORKSPACE ?? ''), 'QA_CI_WORKSPACE_CHANGED');
    assert.notEqual(browser, 'chrome', 'QA_CI_CHROMIUM_REQUIRED');
    executable = '/usr/bin/psql';
    assert.ok(['/usr/share/postgresql-common/pg_wrapper', '/usr/lib/postgresql/17/bin/psql', '/usr/lib/postgresql/18/bin/psql'].includes(realpath(executable)), 'QA_CI_CLIENT_CHANGED');
    environment.PGPASSWORD = NOELIA_CI_PASSWORD;
  } else {
    assert.equal(platform, 'win32', 'QA_LOCAL_WINDOWS_REQUIRED');
    executable = paths.join(root, 'verification', 'postgresql-qa-20261004', 'pg'+major, 'pgsql', 'bin', 'psql.exe');
    realpath(executable); // Fail before creating evidence or starting a connection.
  }
  return Object.freeze({executable, environment:Object.freeze(environment), transport, browser});
}

export function noeliaCircuitOptions(argv) {
  const args = {};
  for(const arg of argv) {
    const match = /^--(major|output|source-commit|browser|positions|jurisdictions|transport)=(.+)$/.exec(arg);
    assert.ok(match && !Object.hasOwn(args, match[1]), 'QA_OPTION_INVALID');
    args[match[1]] = match[2];
  }
  assert.ok(['17', '18'].includes(args.major), 'QA_MAJOR_UNSUPPORTED');
  assert.ok(typeof args.output === 'string' && args.output.length > 0, 'QA_OUTPUT_REQUIRED');
  assert.match(args['source-commit'] ?? '', /^[a-f0-9]{40}$/, 'QA_SOURCE_COMMIT_REQUIRED');
  assert.ok(args.browser === undefined || ['chrome', 'chromium'].includes(args.browser), 'QA_BROWSER_UNSUPPORTED');
  assert.ok(args.transport === undefined || ['local', 'ci'].includes(args.transport), 'QA_TRANSPORT_UNSUPPORTED');
  for(const option of ['positions', 'jurisdictions']) assert.ok(args[option] === undefined || args[option] === 'true', 'QA_OPTION_INVALID');
  return {major:Number(args.major), output:args.output, sourceCommit:args['source-commit'], browser:args.browser ?? 'none',
    transport:args.transport ?? 'local', positions:args.positions === 'true', jurisdictions:args.jurisdictions === 'true'};
}
