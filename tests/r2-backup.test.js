import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  buildBackupPlan,
  buildRestoreDryRun,
  canonicalJson,
  manifestUpload,
  objectKey,
  validateLocalArtifacts,
  validatePlanStructure,
  writeBackupPlan,
} from '../scripts/r2-backup/core.mjs';
import {
  canonicalObjectPath,
  credentialsFromEnvironment,
  redactSecrets,
  signS3Request,
} from '../scripts/r2-backup/s3.mjs';

const FIXED_NOW = new Date('2026-08-13T15:00:00.000Z');
const CREDENTIALS = {
  accountId: '0123456789abcdef0123456789abcdef',
  accessKeyId: 'TESTACCESSKEY',
  secretAccessKey: 'test-secret-never-log',
};

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r2-backup-test-'));
  const data = path.join(root, 'rrhh-data');
  await mkdir(data);
  const dumpBody = gzipSync(Buffer.from('-- PostgreSQL database dump\nCREATE TABLE safe_test(id int);\n'));
  const outputBody = Buffer.from('[{"canonicalId":"one"}]\n');
  const dump = path.join(data, 'municipal.sql.gz');
  const output = path.join(data, 'canonical-output.json');
  const manifest = path.join(data, 'canonical-manifest.json');
  await writeFile(dump, dumpBody);
  await writeFile(output, outputBody);
  await writeFile(
    manifest,
    JSON.stringify({
      schemaVersion: 1,
      outputs: {
        canonical: {
          file: path.basename(output),
          bytes: outputBody.length,
          sha256: sha(outputBody).toUpperCase(),
        },
      },
    }),
  );
  await writeFile(path.join(data, '.env'), 'DATABASE_URL=never-upload\n');
  await writeFile(path.join(data, 'unreferenced.json'), '[{"pii":true}]\n');
  return { root, data, dump, output, manifest };
}

test('inventory only selects gzip SQL, manifests, and manifest-declared canonical outputs', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({
    inputs: [files.data],
    cutoff: '2026-08-13T12:00:00-03:00',
    now: FIXED_NOW,
  });
  assert.deepEqual(plan.manifest.artifacts.map((entry) => entry.role), [
    'database-dump',
    'manifest',
    'canonical-output',
  ]);
  assert.equal(plan.manifest.cutoff, '2026-08-13T15:00:00.000Z');
  assert.equal(plan.manifest.privacy.publicAccessAllowed, false);
  assert.equal(canonicalJson(plan.manifest).includes(files.root), false);
  assert.equal(canonicalJson(plan.manifest).includes('municipal.sql.gz'), false);
  assert.equal(plan.manifest.artifacts.some((entry) => entry.key.includes('unreferenced')), false);
  validatePlanStructure(plan);
});

test('content-addressed keys are deterministic and contain no source filename', () => {
  const digest = 'a'.repeat(64);
  assert.equal(
    objectKey({ project: 'municipio-junin-friendly', role: 'database-dump', sha256: digest, extension: 'sql.gz' }),
    `backups/v1/municipio-junin-friendly/objects/database-dump/sha256/aa/${digest}.sql.gz`,
  );
});

test('manifest key uses a normalized cutoff without ambiguous milliseconds', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({ inputs: [files.data], cutoff: '2026-08-13T15:00:00.000Z', now: FIXED_NOW });
  assert.match(plan.manifestObject.key, /\/manifests\/20260813T150000Z\/[a-f0-9]{64}\.json$/);
});

test('inventory rejects a manifest output that escapes its directory', async () => {
  const files = await fixture();
  await writeFile(
    files.manifest,
    JSON.stringify({ outputs: { escaped: { file: '../outside.json' } } }),
  );
  await assert.rejects(
    buildBackupPlan({ inputs: [files.manifest], cutoff: '2026-08-13', now: FIXED_NOW }),
    /escapes its manifest directory/,
  );
});

test('inventory rejects credential-like fields in a manifest', async () => {
  const files = await fixture();
  await writeFile(files.manifest, JSON.stringify({ apiToken: 'must-not-pass', outputs: {} }));
  await assert.rejects(
    buildBackupPlan({ inputs: [files.manifest], cutoff: '2026-08-13', now: FIXED_NOW }),
    /forbidden credential-like field/,
  );
});

test('local integrity validation fails closed after artifact tampering', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({ inputs: [files.data], cutoff: '2026-08-13', now: FIXED_NOW });
  await writeFile(files.output, '[{"canonicalId":"tampered"}]\n');
  await assert.rejects(validateLocalArtifacts(plan), /no longer matches the immutable plan/);
});

test('manifest descriptor covers canonical bytes and restore dry-run writes nothing', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({ inputs: [files.data], cutoff: '2026-08-13', now: FIXED_NOW });
  const manifest = manifestUpload(plan);
  assert.equal(manifest.body.length, manifest.artifact.bytes);
  assert.equal(sha(manifest.body), manifest.artifact.sha256);
  const destination = path.join(files.root, 'restore');
  const dryRun = await buildRestoreDryRun(plan, destination);
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.writesPerformed, 0);
  assert.equal(dryRun.operations.length, 3);
  await assert.rejects(stat(destination), { code: 'ENOENT' });
});

test('restore dry-run refuses to plan an overwrite', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({ inputs: [files.data], cutoff: '2026-08-13', now: FIXED_NOW });
  const destination = path.join(files.root, 'restore');
  await mkdir(destination);
  const first = plan.manifest.artifacts[0];
  const extension = first.key.slice(first.key.indexOf(`${first.sha256}.`) + first.sha256.length + 1);
  await writeFile(path.join(destination, `${first.id}.${extension}`), 'existing');
  await assert.rejects(buildRestoreDryRun(plan, destination), /restore target already exists/);
});

test('S3 signer uses safe path encoding, signed payload SHA and no secret in headers', () => {
  const digest = sha('payload');
  const signed = signS3Request({
    method: 'PUT',
    bucket: 'private-backups',
    key: 'backups/v1/object with space.json',
    headers: { 'content-length': '7', 'if-none-match': '*' },
    payloadSha256: digest,
    credentials: CREDENTIALS,
    now: new Date('2026-08-13T15:00:00.000Z'),
  });
  assert.equal(signed.path, '/private-backups/backups/v1/object%20with%20space.json');
  assert.match(signed.headers.authorization, /^AWS4-HMAC-SHA256 Credential=TESTACCESSKEY\/20260813\/auto\/s3\/aws4_request/);
  assert.equal(JSON.stringify(signed.headers).includes(CREDENTIALS.secretAccessKey), false);
  assert.equal(signed.headers['x-amz-content-sha256'], digest);
  assert.match(signed.canonicalRequest, /if-none-match:\*/);
  assert.throws(() => canonicalObjectPath('private-backups', '../escape'), /object key is unsafe/);
});

test('credential parsing is strict and error redaction removes secret values', () => {
  const environment = {
    R2_ACCOUNT_ID: CREDENTIALS.accountId,
    R2_ACCESS_KEY_ID: CREDENTIALS.accessKeyId,
    R2_SECRET_ACCESS_KEY: CREDENTIALS.secretAccessKey,
  };
  assert.deepEqual(credentialsFromEnvironment(environment), {
    ...CREDENTIALS,
    sessionToken: undefined,
    jurisdiction: undefined,
  });
  const redacted = redactSecrets(`failure ${CREDENTIALS.accessKeyId} ${CREDENTIALS.secretAccessKey}`, environment);
  assert.equal(redacted.includes(CREDENTIALS.accessKeyId), false);
  assert.equal(redacted.includes(CREDENTIALS.secretAccessKey), false);
  assert.match(redacted, /\[REDACTED\]/);
});

test('plan JSON never embeds credential environment values', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({ inputs: [files.data], cutoff: '2026-08-13', now: FIXED_NOW });
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes(CREDENTIALS.accessKeyId), false);
  assert.equal(serialized.includes(CREDENTIALS.secretAccessKey), false);
  assert.equal((await readFile(files.manifest, 'utf8')).includes(CREDENTIALS.secretAccessKey), false);
});

test('plan writer refuses to overwrite an existing local review artifact', async () => {
  const files = await fixture();
  const plan = await buildBackupPlan({ inputs: [files.data], cutoff: '2026-08-13', now: FIXED_NOW });
  const target = path.join(files.root, 'backup-plan.json');
  await writeFile(target, 'operator-reviewed\n');
  await assert.rejects(writeBackupPlan(plan, target), { code: 'EEXIST' });
  assert.equal(await readFile(target, 'utf8'), 'operator-reviewed\n');
});
