import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJson,
  changedPathsBetween,
  classifyChangedPaths,
  computeDataContractIdentity,
  dataContractMembership,
  parseGitNameStatus,
  validateDataContractManifest,
} from '../scripts/classify-data-contract-release.mjs';
import manifestJson from '../contracts/certified-data-contract-files.v1.json' with { type: 'json' };

const MANIFEST_PATH = 'contracts/certified-data-contract-files.v1.json';

test('el manifiesto versiona el límite real y separa UX de contrato de datos', () => {
  const manifest = validateDataContractManifest(manifestJson, MANIFEST_PATH);

  assert.equal(dataContractMembership(manifest, 'recibos-sueldo.html').matched, false);
  assert.equal(dataContractMembership(manifest, 'assets/municontrol-enterprise.css').matched, false);
  assert.equal(dataContractMembership(manifest, 'docs/CERTIFIED_RELEASE_SHA.md').matched, false);
  assert.deepEqual(dataContractMembership(manifest, 'scripts/migrations/038-governed-monthly-close-run.sql'), {
    matched: true,
    category: 'database_schema',
    selector: 'scripts/migrations/**',
  });
  assert.equal(dataContractMembership(manifest, 'lib/internal-certified-release.js').matched, true);
  assert.equal(dataContractMembership(manifest, 'contracts/grh-payroll-type-map.v1.json').matched, true);
  assert.equal(dataContractMembership(manifest, 'contracts/grh-payroll-type-map.v2.json').matched, true);
  assert.equal(dataContractMembership(manifest, 'api/internal-data.js').matched, true);
  for (const criticalPath of [
    'lib/internal-access-gateway.js',
    'lib/internal-resource-access.js',
    'lib/internal-rbac.js',
    'api/internal-actions.js',
    'api/internal-identity.js',
    'api/internal-admin.js',
  ]) assert.equal(dataContractMembership(manifest, criticalPath).matched, true, criticalPath);
});

test('clasifica un cambio visual como ordinary_release y conserva el SHA certificado', () => {
  const manifest = validateDataContractManifest(manifestJson, MANIFEST_PATH);
  const result = classifyChangedPaths(manifest, [
    'recibos-sueldo.html',
    'assets/municontrol-enterprise.css',
    'docs/Guía de publicación.md',
    'tests/receipt-history-ux.test.js',
  ]);

  assert.equal(result.classification, 'ordinary_release');
  assert.deepEqual(result.contractChangedFiles, []);
});

test('clasifica migración, binding y manifiesto como data_contract_change', () => {
  const manifest = validateDataContractManifest(manifestJson, MANIFEST_PATH);
  const result = classifyChangedPaths(manifest, [
    'assets/product-guidance.js',
    'api/internal-data.js',
    'contracts/grh-payroll-type-map.v2.json',
    'scripts/migrations/040-next-governed-contract.sql',
    'lib/internal-identity-access.js',
    MANIFEST_PATH,
  ]);

  assert.equal(result.classification, 'data_contract_change');
  assert.deepEqual(result.contractChangedFiles.map((entry) => entry.path), [
    'api/internal-data.js',
    MANIFEST_PATH,
    'contracts/grh-payroll-type-map.v2.json',
    'lib/internal-identity-access.js',
    'scripts/migrations/040-next-governed-contract.sql',
  ]);
});

test('el parser de git conserva ambos extremos de renombres para no omitir contrato', () => {
  assert.deepEqual(parseGitNameStatus(
    'M\0assets/app.js\0R100\0scripts/migrations/038-old.sql\0docs/038-old.md\0D\0contracts/old.json\0',
  ), [
    'assets/app.js',
    'scripts/migrations/038-old.sql',
    'docs/038-old.md',
    'contracts/old.json',
  ]);
});

test('la comparación contra una base incluye cambios versionados y archivos nuevos', async (t) => {
  const repository = await mkdtemp(path.join(os.tmpdir(), 'municontrol-release-diff-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', windowsHide: true,
  }).trim();

  git('-c', 'init.defaultBranch=main', 'init');
  git('config', 'user.email', 'release-test@municontrol.invalid');
  git('config', 'user.name', 'MuniControl Release Test');
  git('config', 'core.autocrlf', 'false');
  await mkdir(path.join(repository, 'assets'), { recursive: true });
  await mkdir(path.join(repository, 'scripts', 'migrations'), { recursive: true });
  await writeFile(path.join(repository, 'assets', 'app.js'), 'export const version = 1;\n', 'utf8');
  git('add', '.');
  git('commit', '-m', 'baseline');
  const base = git('rev-parse', 'HEAD');

  await writeFile(path.join(repository, 'assets', 'app.js'), 'export const version = 2;\n', 'utf8');
  await writeFile(path.join(repository, 'scripts', 'migrations', '040.sql'), 'SELECT 40;\n', 'utf8');
  assert.deepEqual(changedPathsBetween(repository, base, 'WORKTREE'), [
    'assets/app.js',
    'scripts/migrations/040.sql',
  ]);
});

test('la identidad es estable por orden y saltos de línea, y cambia con contenido contractual', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'municontrol-contract-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await mkdir(path.join(temporaryRoot, 'contracts'), { recursive: true });
  await mkdir(path.join(temporaryRoot, 'scripts', 'migrations'), { recursive: true });

  const fixture = {
    schemaVersion: 1,
    manifestId: 'fixture-certified-data-contract.v1',
    manifestVersion: '1.0.0',
    identity: {
      algorithm: 'sha256', runtimeHexLength: 40, textNormalization: 'utf8-lf', ordering: 'repository-path',
    },
    members: {
      files: [{ path: MANIFEST_PATH, category: 'classification_boundary', reason: 'Límite de prueba.' }],
      trees: [{
        path: 'scripts/migrations', extensions: ['.sql'], category: 'database_schema', reason: 'SQL de prueba.',
      }],
    },
    releasePolicy: {
      ordinaryRelease: 'Preservar SHA.', dataContractChange: 'Detener publicación.',
    },
  };
  await writeFile(path.join(temporaryRoot, MANIFEST_PATH), JSON.stringify(fixture), 'utf8');
  await writeFile(path.join(temporaryRoot, 'scripts', 'migrations', '002.sql'), 'SELECT 2;\r\n', 'utf8');
  await writeFile(path.join(temporaryRoot, 'scripts', 'migrations', '001.sql'), 'SELECT 1;\r\n', 'utf8');

  const manifest = validateDataContractManifest(fixture, MANIFEST_PATH);
  const first = await computeDataContractIdentity(temporaryRoot, manifest, MANIFEST_PATH);
  assert.match(first.dataContractId, /^[a-f0-9]{40}$/);
  assert.match(first.fullDigestSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.files, [MANIFEST_PATH, 'scripts/migrations/001.sql', 'scripts/migrations/002.sql']);

  await writeFile(path.join(temporaryRoot, 'scripts', 'migrations', '001.sql'), 'SELECT 1;\n', 'utf8');
  const normalized = await computeDataContractIdentity(temporaryRoot, manifest, MANIFEST_PATH);
  assert.equal(normalized.dataContractId, first.dataContractId);

  await writeFile(path.join(temporaryRoot, 'scripts', 'migrations', '001.sql'), 'SELECT 10;\n', 'utf8');
  const changed = await computeDataContractIdentity(temporaryRoot, manifest, MANIFEST_PATH);
  assert.notEqual(changed.dataContractId, first.dataContractId);
  assert.notEqual(changed.fullDigestSha256, first.fullDigestSha256);
});

test('la serialización canónica no depende del orden de las claves', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
});

test('la identidad de un commit lee exclusivamente sus objetos Git y no el worktree', async (t) => {
  const repository = await mkdtemp(path.join(os.tmpdir(), 'municontrol-contract-ref-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', windowsHide: true,
  }).trim();

  git('-c', 'init.defaultBranch=main', 'init');
  git('config', 'user.email', 'release-test@municontrol.invalid');
  git('config', 'user.name', 'MuniControl Release Test');
  git('config', 'core.autocrlf', 'false');
  await mkdir(path.join(repository, 'contracts'), { recursive: true });
  await mkdir(path.join(repository, 'scripts', 'migrations'), { recursive: true });
  const fixture = {
    schemaVersion: 1,
    manifestId: 'fixture-ref-contract.v1',
    manifestVersion: '1.0.0',
    identity: {
      algorithm: 'sha256', runtimeHexLength: 40, textNormalization: 'utf8-lf', ordering: 'repository-path',
    },
    members: {
      files: [{ path: MANIFEST_PATH, category: 'classification_boundary', reason: 'Límite de prueba.' }],
      trees: [{
        path: 'scripts/migrations', extensions: ['.sql'], category: 'database_schema', reason: 'SQL de prueba.',
      }],
    },
    releasePolicy: { ordinaryRelease: 'Preservar SHA.', dataContractChange: 'Detener publicación.' },
  };
  await writeFile(path.join(repository, MANIFEST_PATH), JSON.stringify(fixture), 'utf8');
  await writeFile(path.join(repository, 'scripts', 'migrations', '001.sql'), 'SELECT 1;\n', 'utf8');
  git('add', '.');
  git('commit', '-m', 'contract baseline');
  const head = git('rev-parse', 'HEAD');
  const manifest = validateDataContractManifest(fixture, MANIFEST_PATH);
  const committed = await computeDataContractIdentity(
    repository, manifest, MANIFEST_PATH, { gitRef: head },
  );

  await writeFile(path.join(repository, 'scripts', 'migrations', '002.sql'), 'SELECT 2;\n', 'utf8');
  const committedAgain = await computeDataContractIdentity(
    repository, manifest, MANIFEST_PATH, { gitRef: head },
  );
  const worktree = await computeDataContractIdentity(repository, manifest, MANIFEST_PATH);

  assert.equal(committedAgain.dataContractId, committed.dataContractId);
  assert.deepEqual(committedAgain.files, [MANIFEST_PATH, 'scripts/migrations/001.sql']);
  assert.deepEqual(worktree.files, [
    MANIFEST_PATH, 'scripts/migrations/001.sql', 'scripts/migrations/002.sql',
  ]);
  assert.notEqual(worktree.dataContractId, committed.dataContractId);
});

test('el manifiesto falla cerrado ante eliminación y conserva ambos lados de un renombre', () => {
  const manifest = validateDataContractManifest(manifestJson, MANIFEST_PATH);
  const deleted = classifyChangedPaths(manifest, ['api/internal-data.js']);
  const renamed = classifyChangedPaths(manifest, [
    'lib/internal-rbac.js', 'lib/internal-rbac-renamed.js',
  ]);

  assert.equal(deleted.classification, 'data_contract_change');
  assert.equal(renamed.classification, 'data_contract_change');
  assert.deepEqual(renamed.contractChangedFiles.map((item) => item.path), [
    'lib/internal-rbac.js',
  ]);
});
