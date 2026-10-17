import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const source = readFileSync(new URL('../local-agents/clock-fleet/install-machine-linux.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const shellPaths = process.platform === 'win32'
  ? [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe'), path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/usr/bin/bash.exe')]
  : ['/bin/bash', '/usr/bin/bash'];
const bash = shellPaths.find(existsSync);
if (!bash) throw Error('BASH_REQUIRED_FOR_ISOLATED_INSTALLER_PREFLIGHT');
const begin = '# Reject any configured predecessor that could start itself, or is still active.\n';
const end = 'for directory in "$base"';
assert.equal(source.split(begin).length, 2, 'one scheduler preflight');
assert.equal(source.split(end).length, 2, 'one boundary before filesystem preflight');
const inventoryBlock = source.slice(source.indexOf(begin), source.indexOf(end));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

// Execute the actual installer block. All commands are Bash builtins or this
// mock: an empty PATH prevents fallback to host services or mutation tools.
function preflight({inventory = '', inventoryStatus = 0, inventoryError = '', active = 'inactive', activeStatus = 3} = {}) {
  const input = `set -euo pipefail
PATH=''
exec 3>&2
fail() { printf '%s\\n' "$1" >&2; exit 1; }
inventory=${quote(inventory)}
inventory_error=${quote(inventoryError)}
active=${quote(active)}
systemctl() {
  printf 'QA_CALL' >&3
  printf ' <%s>' "$@" >&3
  printf '\\n' >&3
  case "$1" in
    list-unit-files)
      [ "$#" -eq 3 ] && [ "$2" = --no-legend ] && [ "$3" = --no-pager ] || { printf 'QA_INVALID_INVENTORY_ARGUMENTS\\n' >&2; return 91; }
      printf '%s' "$inventory"
      printf '%s' "$inventory_error" >&2
      return ${inventoryStatus} ;;
    is-active)
      [ "$#" -eq 2 ] || return 92
      printf '%s\\n' "$active"
      return ${activeStatus} ;;
    *) printf 'QA_MUTATION_OR_UNEXPECTED_COMMAND\\n' >&2; return 93 ;;
  esac
}
${inventoryBlock}
printf 'QA_INVENTORY_COMPLETE\\n'
`;
  const result = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
    input, encoding: 'utf8', windowsHide: true, timeout: 5000,
    env: {SYSTEMROOT: process.env.SYSTEMROOT || process.env.SystemRoot || '', BASH_ENV: '', ENV: '', LC_ALL: 'C', MSYS_NO_PATHCONV: '1'}
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.doesNotMatch(result.stderr, /QA_MUTATION_OR_UNEXPECTED_COMMAND|QA_INVALID_INVENTORY_ARGUMENTS|command not found/);
  const calls = result.stderr.split('\n').filter(line => line.startsWith('QA_CALL'));
  assert.equal(calls[0], 'QA_CALL <list-unit-files> <--no-legend> <--no-pager>');
  return {...result, calls};
}

function accepted(result, expectedCalls = 1) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'QA_INVENTORY_COMPLETE\n');
  assert.equal(result.calls.length, expectedCalls);
}

function rejected(result, code, expectedCalls = 1) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(code), result.stderr);
  assert.equal(result.calls.length, expectedCalls);
}

test('Linux installer has valid Bash syntax without executing its install path', () => {
  const result = spawnSync(bash, ['--noprofile', '--norc', '-n'], {input: source, encoding: 'utf8', windowsHide: true, timeout: 5000, env: {BASH_ENV: '', ENV: ''}});
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
});

test('empty successful inventory needs no existing municipal unit and reaches the next preflight', () => {
  accepted(preflight());
});

test('enabled foreign units are ignored without querying their activity', () => {
  accepted(preflight({inventory: 'ssh.service enabled enabled\ncron.service enabled-runtime enabled\nother-municontrol.service enabled enabled\n', active: 'active', activeStatus: 0}));
});

test('each enabled or self-starting municipal state rejects before checking activity', () => {
  for (const state of ['enabled', 'enabled-runtime', 'linked', 'linked-runtime', 'alias', 'generated', 'transient']) {
    rejected(preflight({inventory: `ssh.service enabled enabled\nmunicontrol-existing.service ${state} disabled\n`}), 'GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST');
  }
});

test('an active municipal unit rejects even if its unit file is disabled', () => {
  for (const active of ['active', 'activating', 'deactivating', 'reloading']) {
    rejected(preflight({inventory: 'municontrol-existing.service disabled disabled\n', active, activeStatus: 0}), 'GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST', 2);
  }
});

test('only municipal inactive units are queried when foreign units coexist', () => {
  const result = preflight({inventory: 'ssh.service enabled enabled\nmunicontrol-old.service disabled disabled\ncron.service enabled enabled\n', active: 'inactive', activeStatus: 3});
  accepted(result, 2);
  assert.equal(result.calls[1], 'QA_CALL <is-active> <municontrol-old.service>');
});

test('every failed full inventory rejects, including exit1 with empty output', () => {
  for (const inventoryStatus of [1, 4, 5]) {
    rejected(preflight({inventoryStatus}), 'GATEWAY_SCHEDULER_UNAVAILABLE');
  }
});

test('partial inventory or diagnostic text does not convert a failed command into success', () => {
  const result = preflight({inventory: 'municontrol-old.service disabled disabled\n', inventoryStatus: 1, inventoryError: 'synthetic inventory denied\n'});
  rejected(result, 'GATEWAY_SCHEDULER_UNAVAILABLE');
  assert.match(result.stderr, /synthetic inventory denied/);
});

test('municipal template and timer units remain subject to the same exclusion gates', () => {
  for (const unit of ['municontrol-reader@.service', 'municontrol-poll.timer']) {
    rejected(preflight({inventory: `${unit} enabled disabled\n`}), 'GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST');
  }
});
