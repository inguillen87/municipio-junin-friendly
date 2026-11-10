import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guarda de la preparación del host de relojes (Root, R2 del 10/11/2026). En systemd 255 la consulta filtrada
// de unidades instaladas devuelve 1 cuando no hay coincidencias, y la R1 lo tomaba como un error de consulta.
// La R2 pide el inventario completo, conserva el rechazo de cualquier estado distinto de cero y recién después
// mira los nombres. Estas pruebas ejecutan SÓLO esa función con un systemctl simulado: no hay systemctl real,
// preparación completa, SSH, servicios ni VPN.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceR2 = readFileSync(path.join(repositoryRoot, 'scripts/stage-municipal-clock-host.sh'), 'utf8');
const originalSha256 = '11a38136e9594b50bb22df59717b3bab504b8a0f4ffcbd35367426233aad576e';
const candidateSha256 = 'ef31d7015c54a73d24f5c0da4c6b4ae26fc2684367c6bf0ffe1c66b75672e71b';
// La R1 no se guarda aparte: sale de la R2 con las dos sustituciones inversas, y su huella lo acredita.
const sourceR1 = sourceR2
  .replace('  local loaded installed unit_name unit_details\n', '  local loaded installed\n')
  .replace(
    '  installed="$(systemctl list-unit-files --no-legend --no-pager)" || fail STAGE_SERVICE_QUERY_FAILED_LIST_UNIT_FILES\n'
    + '  while read -r unit_name unit_details; do\n'
    + '    case "$unit_name" in\n'
    + '      municontrol*) fail STAGE_SERVICE_EXISTS_REVIEW_REQUIRED ;;\n'
    + '    esac\n'
    + '  done <<< "$installed"\n',
    '  installed="$(systemctl list-unit-files --no-legend --no-pager \'municontrol*\')" || fail STAGE_SERVICE_QUERY_FAILED_LIST_UNIT_FILES\n'
    + '  [[ ! "$installed" =~ [^[:space:]] ]] || fail STAGE_SERVICE_EXISTS_REVIEW_REQUIRED\n',
  );
const bashPath = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git/bin/bash.exe') : '/bin/bash';
const opening = 'collectors_absent() {\n';
const closing = '\n}\n\n# A failed NSS lookup does not authorize account creation.';

function extractGuard(source) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, 'Production function start must exist');
  assert.equal(source.indexOf(opening, start + opening.length), -1, 'Function start must be unique');
  const end = source.indexOf(closing, start);
  assert.ok(end > start, 'Production function end must exist');
  assert.equal(source.indexOf(closing, end + closing.length), -1, 'Function end must be unique');
  return source.slice(start, end + '\n}'.length);
}

const guardR1 = extractGuard(sourceR1);
const guardR2 = extractGuard(sourceR2);

const systemctlFixture = String.raw`
systemctl() {
  case "$1" in
    list-units)
      [ "$*" = 'list-units --all --no-legend --no-pager municontrol*' ] || return 97
      case "$QA_SYSTEMCTL_CASE" in
        loaded_error) return 75 ;;
        loaded_active) printf '%s\n' 'municontrol-fixture.service loaded active running' ;;
        loaded_inactive) printf '%s\n' 'municontrol-fixture.service loaded inactive dead' ;;
      esac
      return 0
      ;;
    list-unit-files)
      case "$*" in
        'list-unit-files --no-legend --no-pager'|'list-unit-files --no-legend --no-pager municontrol*') ;;
        *) return 97 ;;
      esac
      case "$QA_SYSTEMCTL_CASE" in
        empty_filtered_exit1)
          [ "$#" -eq 3 ] || return 1
          ;;
        unrelated)
          printf '%s\n' 'dbus.service static -' 'openvpn.service masked enabled' 'sshd.service enabled enabled'
          ;;
        metadata_mentions_municontrol)
          printf '%s\n' 'sshd.service enabled municontrol-fixture.service'
          ;;
        middle_name_mentions_municontrol)
          printf '%s\n' 'other-municontrol-clock.service enabled enabled'
          ;;
        enabled|disabled|masked|static)
          printf '%s\n' "municontrol-fixture.service $QA_SYSTEMCTL_CASE enabled"
          ;;
        template)
          printf '%s\n' 'municontrol-fixture@.service disabled enabled'
          ;;
        timer)
          printf '%s\n' 'municontrol-fixture.timer disabled enabled'
          ;;
        second_check_unit_appears)
          if [ "$QA_GUARD_ROUND" -eq 2 ]; then
            printf '%s\n' 'municontrol-fixture.service disabled enabled'
          else
            printf '%s\n' 'sshd.service enabled enabled'
          fi
          ;;
        files_error_1) return 1 ;;
        files_error_75) return 75 ;;
        files_error_1_with_output)
          printf '%s\n' 'sshd.service enabled enabled'
          return 1
          ;;
        empty|loaded_error|loaded_active|loaded_inactive) ;;
        *) return 96 ;;
      esac
      return 0
      ;;
    *) return 98 ;;
  esac
}
`;

function runGuard(guard, fixtureCase, repeat = false) {
  const environment = { ...process.env, QA_SYSTEMCTL_CASE: fixtureCase };
  delete environment.BASH_ENV;
  delete environment.ENV;
  const secondCheck = repeat ? 'QA_GUARD_ROUND=2\ncollectors_absent\n' : '';
  const program = [
    'set -euo pipefail',
    "fail() { printf '%s\\n' \"$1\" >&2; exit 1; }",
    'unit=/dev/null/municontrol-test-unit.service',
    'QA_GUARD_ROUND=1',
    systemctlFixture,
    guard,
    'collectors_absent',
    secondCheck,
    "printf '%s\\n' GUARD_PASS",
  ].join('\n');
  const result = spawnSync(bashPath, ['--noprofile', '--norc', '-c', program], {
    encoding: 'utf8',
    env: environment,
    timeout: 10000,
    maxBuffer: 65536,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function expectPass(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'GUARD_PASS');
  assert.equal(result.stderr, '');
}

function expectFailure(result, code) {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '', 'A rejected guard must not emit success');
  assert.equal(result.stderr.trim(), code);
}

test('R2 source pin, and the two inverse replacements recover the original R1 bytes', () => {
  assert.equal(createHash('sha256').update(sourceR2, 'utf8').digest('hex'), candidateSha256);
  assert.equal(createHash('sha256').update(sourceR1, 'utf8').digest('hex'), originalSha256);
});

test('R1 reproduces systemd255 status1 when the filtered inventory has no matches', () => {
  expectFailure(runGuard(guardR1, 'empty_filtered_exit1'), 'STAGE_SERVICE_QUERY_FAILED_LIST_UNIT_FILES');
});

test('R2 obtains an unfiltered successful inventory in the same causal fixture', () => {
  expectPass(runGuard(guardR2, 'empty_filtered_exit1'));
});

for (const fixtureCase of ['empty', 'unrelated', 'metadata_mentions_municontrol', 'middle_name_mentions_municontrol']) {
  test(`R2 admits ${fixtureCase} inventory without a municipal unit name`, () => {
    expectPass(runGuard(guardR2, fixtureCase));
  });
}

for (const fixtureCase of ['enabled', 'disabled', 'masked', 'static', 'template', 'timer']) {
  test(`R2 rejects an installed municipal ${fixtureCase} unit`, () => {
    expectFailure(runGuard(guardR2, fixtureCase), 'STAGE_SERVICE_EXISTS_REVIEW_REQUIRED');
  });
}

for (const fixtureCase of ['files_error_1', 'files_error_75', 'files_error_1_with_output']) {
  test(`R2 retains rejection for genuine query failure ${fixtureCase}`, () => {
    expectFailure(runGuard(guardR2, fixtureCase), 'STAGE_SERVICE_QUERY_FAILED_LIST_UNIT_FILES');
  });
}

for (const fixtureCase of ['loaded_active', 'loaded_inactive']) {
  test(`R2 preserves rejection for ${fixtureCase}`, () => {
    expectFailure(runGuard(guardR2, fixtureCase), 'STAGE_STOP_PREVIOUS_COLLECTORS_FIRST');
  });
}

test('R2 preserves rejection when the loaded-unit query fails', () => {
  expectFailure(runGuard(guardR2, 'loaded_error'), 'STAGE_SERVICE_QUERY_FAILED_LIST_UNITS');
});

test('R2 rejects an installed unit appearing at the second production guard check', () => {
  expectFailure(runGuard(guardR2, 'second_check_unit_appears', true), 'STAGE_SERVICE_EXISTS_REVIEW_REQUIRED');
});
