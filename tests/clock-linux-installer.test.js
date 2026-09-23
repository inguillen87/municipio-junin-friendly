import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const installer = fs.readFileSync(new URL('../local-agents/clock-fleet/install-machine-linux.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
// Execute the actual preflight block, stopping before any installation action.
const block = installer.match(/# Reject any configured predecessor[\s\S]*?done <<< "\$units"/)?.[0];
assert.ok(block, 'the service preflight must remain an executable, isolated block');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shell = `set -euo pipefail
fail() { printf '%s\\n' "$1" >&2; exit 1; }
systemctl() {
 case "$1" in
  list-unit-files)
   # Reproduce Ubuntu: a glob matching no unit returns 1, with no output.
   for arg in "$@"; do [ "$arg" != 'municontrol*' ] || return 1; done
   [ "\${CASE:-}" != failure ] || return 1
   case "\${CASE:-}" in
    empty) ;;
    unrelated) printf '%s\\n' 'openvpn-client@municontrol.service masked enabled' 'sshd.service enabled enabled' ;;
    enabled|enabled-runtime|linked|linked-runtime|alias|generated|transient)
     printf '%s %s enabled\\n' municontrol-previous.service "$CASE" ;;
    *) printf '%s\\n' 'municontrol-previous.service disabled disabled' ;;
   esac ;;
  is-active)
   [ "$2" = municontrol-previous.service ] || { printf 'UNEXPECTED_UNIT\\n' >&2; return 2; }
   printf '%s\\n' "\${ACTIVE:-inactive}"
   case "\${ACTIVE:-inactive}" in active|activating|deactivating|reloading) return 0;; *) return 3;; esac ;;
  *) printf 'MUTATION_FORBIDDEN\\n' >&2; return 99 ;;
 esac
}
${block}
printf 'PREFLIGHT_OK\\n'
`;

function check(scenario, active = 'inactive') {
  return spawnSync(bash, ['--noprofile', '--norc', '-s'], {
    input: shell, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, CASE: scenario, ACTIVE: active }, timeout: 5000
  });
}

test('Linux installer accepts an empty inventory and ignores unrelated VPN units', () => {
  for (const scenario of ['empty', 'unrelated', 'disabled']) {
    const result = check(scenario);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.trim(), 'PREFLIGHT_OK');
  }
});

test('Linux installer fails closed when the full scheduler query fails', () => {
  const result = check('failure');
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GATEWAY_SCHEDULER_UNAVAILABLE/);
  assert.doesNotMatch(result.stdout, /PREFLIGHT_OK/);
});

test('Linux installer retains every configured or active predecessor rejection', () => {
  for (const state of ['enabled', 'enabled-runtime', 'linked', 'linked-runtime', 'alias', 'generated', 'transient']) {
    const result = check(state);
    assert.ifError(result.error);
    assert.equal(result.status, 1, state);
    assert.match(result.stderr, /GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST/);
  }
  for (const state of ['active', 'activating', 'deactivating', 'reloading']) {
    const result = check('disabled', state);
    assert.ifError(result.error);
    assert.equal(result.status, 1, state);
    assert.match(result.stderr, /GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST/);
  }
});
