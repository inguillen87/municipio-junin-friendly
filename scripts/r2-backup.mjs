#!/usr/bin/env node
import path from 'node:path';
import {
  buildBackupPlan,
  buildRestoreDryRun,
  manifestUpload,
  readBackupPlan,
  validateLocalArtifacts,
  validatePlanStructure,
  writeBackupPlan,
} from './r2-backup/core.mjs';
import {
  credentialsFromEnvironment,
  downloadAndHash,
  headObject,
  putBufferImmutable,
  putFileImmutable,
  redactSecrets,
  validateBucket,
} from './r2-backup/s3.mjs';

function usage() {
  return `R2 private immutable backup pipeline

Commands:
  inventory       --cutoff <ISO> --input <path>... --out <local-plan.json> [--project <slug>]
  upload          --plan <local-plan.json> --bucket <private-bucket> --confirm-private
  verify          --plan <local-plan.json> --bucket <private-bucket> --confirm-private [--head-only]
  restore-dry-run --plan <local-plan.json> --to <destination>

Network commands read R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
optional R2_SESSION_TOKEN/R2_JURISDICTION from the process environment. They never print them.`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    if (['--confirm-private', '--head-only'].includes(token)) {
      flags.add(token.slice(2));
      continue;
    }
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`${token} requires a value`);
    const name = token.slice(2);
    const entries = values.get(name) ?? [];
    entries.push(next);
    values.set(name, entries);
    index += 1;
  }
  const one = (name, required = false) => {
    const entries = values.get(name) ?? [];
    if (entries.length > 1) throw new Error(`--${name} may only be specified once`);
    if (required && entries.length === 0) throw new Error(`--${name} is required`);
    return entries[0];
  };
  return { command, values, flags, one };
}

function assertPrivateConfirmation(flags) {
  if (!flags.has('confirm-private')) {
    throw new Error('refusing network access without --confirm-private (r2.dev and custom-domain public access must be disabled)');
  }
}

function remoteInputs(parsed) {
  assertPrivateConfirmation(parsed.flags);
  const bucket = validateBucket(parsed.one('bucket', true));
  const credentials = credentialsFromEnvironment();
  return { bucket, credentials };
}

async function inventory(parsed) {
  const inputs = parsed.values.get('input') ?? [];
  if (inputs.length === 0) throw new Error('at least one --input is required');
  const plan = await buildBackupPlan({
    inputs,
    cutoff: parsed.one('cutoff', true),
    project: parsed.one('project'),
  });
  const output = await writeBackupPlan(plan, parsed.one('out', true));
  process.stdout.write(`${JSON.stringify({
    status: 'planned',
    plan: path.resolve(output),
    cutoff: plan.manifest.cutoff,
    artifacts: plan.manifest.totals.artifacts,
    bytes: plan.manifest.totals.bytes,
    manifestSha256: plan.manifestObject.sha256,
    manifestKey: plan.manifestObject.key,
    networkOperations: 0,
  })}\n`);
}

async function upload(parsed) {
  const plan = await readBackupPlan(parsed.one('plan', true));
  const { bucket, credentials } = remoteInputs(parsed);
  const verified = await validateLocalArtifacts(plan);
  for (const item of verified) {
    const result = await putFileImmutable({
      bucket,
      artifact: item.artifact,
      filePath: item.filePath,
      cutoff: plan.manifest.cutoff,
      credentials,
    });
    process.stdout.write(`${JSON.stringify({ id: item.artifact.id, key: item.artifact.key, status: result.status })}\n`);
  }
  const manifest = manifestUpload(plan);
  const result = await putBufferImmutable({
    bucket,
    artifact: manifest.artifact,
    buffer: manifest.body,
    cutoff: plan.manifest.cutoff,
    credentials,
  });
  process.stdout.write(`${JSON.stringify({ id: manifest.artifact.id, key: manifest.artifact.key, status: result.status })}\n`);
}

function remoteArtifacts(plan) {
  const manifest = manifestUpload(plan);
  return [...plan.manifest.artifacts, manifest.artifact];
}

async function verify(parsed) {
  const plan = await readBackupPlan(parsed.one('plan', true));
  validatePlanStructure(plan);
  const { bucket, credentials } = remoteInputs(parsed);
  const headOnly = parsed.flags.has('head-only');
  for (const artifact of remoteArtifacts(plan)) {
    await headObject({ bucket, artifact, cutoff: plan.manifest.cutoff, credentials });
    if (!headOnly) await downloadAndHash({ bucket, artifact, credentials });
    process.stdout.write(`${JSON.stringify({
      id: artifact.id,
      key: artifact.key,
      status: headOnly ? 'head-verified' : 'head-and-download-verified',
    })}\n`);
  }
}

async function restoreDryRun(parsed) {
  const plan = await readBackupPlan(parsed.one('plan', true));
  const dryRun = await buildRestoreDryRun(plan, parsed.one('to', true));
  process.stdout.write(`${JSON.stringify(dryRun, null, 2)}\n`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.command || ['help', '--help', '-h'].includes(parsed.command)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (parsed.command === 'inventory') await inventory(parsed);
  else if (parsed.command === 'upload') await upload(parsed);
  else if (parsed.command === 'verify') await verify(parsed);
  else if (parsed.command === 'restore-dry-run') await restoreDryRun(parsed);
  else throw new Error(`unknown command: ${parsed.command}`);
}

main().catch((error) => {
  process.stderr.write(`R2 backup failed: ${redactSecrets(error?.stack ?? error)}\n`);
  process.exitCode = 1;
});
