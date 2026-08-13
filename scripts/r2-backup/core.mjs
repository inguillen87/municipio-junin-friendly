import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export const PLAN_SCHEMA_VERSION = 1;
export const MANIFEST_SCHEMA_VERSION = 1;
export const DEFAULT_PROJECT = 'municipio-junin-friendly';
export const KEY_PREFIX = 'backups/v1';

const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MANIFEST_NAME = /(?:^|[-_.])manifest(?:[-_.].*)?\.json$/i;
const DUMP_NAME = /\.sql\.gz$/i;
const CANONICAL_OUTPUT = /\.(?:json|ndjson|jsonl)(?:\.gz)?$|\.parquet$/i;
const FORBIDDEN_FILE_NAME = /(?:^\.env(?:\.|$)|credential|secret|password|passwd|private[-_.]?key|access[-_.]?key|api[-_.]?key|token|authorization)/i;
const FORBIDDEN_EXTENSION = /\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const FORBIDDEN_SEGMENTS = new Set(['.git', '.ssh', '.vercel', 'node_modules']);
const FORBIDDEN_SENSITIVE_SEGMENT = /^(?:\.env(?:\..*)?|\.neon|secrets?|credentials?|tokens?|private[-_.]?keys?)$/i;
const FORBIDDEN_JSON_KEYS = /^(?:password|passwd|secret|clientsecret|accesstoken|apitoken|apikey|privatekey|databaseurl|connectionstring|authorization|credentials?)$/i;
const ROLE_ORDER = new Map([
  ['database-dump', 0],
  ['manifest', 1],
  ['canonical-output', 2],
]);

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function normalizeProject(value = DEFAULT_PROJECT) {
  const project = requiredString(value, 'project').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(project)) {
    throw new Error('project must be 3-63 lowercase letters, numbers, or hyphens');
  }
  return project;
}

export function normalizeCutoff(value) {
  const raw = requiredString(value, 'cutoff');
  const expanded = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(expanded)) {
    throw new Error('cutoff must include an explicit timezone (Z or +/-HH:MM)');
  }
  const parsed = new Date(expanded);
  if (Number.isNaN(parsed.getTime())) throw new Error('cutoff is not a valid ISO-8601 date');
  return parsed.toISOString();
}

export function cutoffKeyPart(cutoff) {
  return normalizeCutoff(cutoff).replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(filePath) {
  const before = await stat(filePath);
  if (!before.isFile()) throw new Error('artifact is not a regular file');
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  const after = await stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error('artifact changed while it was being hashed');
  }
  return { bytes: before.size, sha256: hash.digest('hex') };
}

function pathParts(filePath) {
  return path.resolve(filePath).split(/[\\/]+/).filter(Boolean);
}

export function assertSafeArtifactPath(filePath) {
  const parts = pathParts(filePath);
  const basename = parts.at(-1) ?? '';
  if (parts.some((part) => FORBIDDEN_SEGMENTS.has(part.toLowerCase()) || FORBIDDEN_SENSITIVE_SEGMENT.test(part))) {
    throw new Error('artifact path is inside a forbidden secrets/tooling directory');
  }
  if (FORBIDDEN_FILE_NAME.test(basename) || FORBIDDEN_EXTENSION.test(basename)) {
    throw new Error('artifact filename matches the secrets exclusion policy');
  }
}

async function assertRegularNoSymlink(filePath) {
  const info = await lstat(filePath);
  if (info.isSymbolicLink()) throw new Error('symbolic links are not accepted as backup artifacts');
  if (!info.isFile()) throw new Error('artifact is not a regular file');
  return info;
}

async function walk(inputPath) {
  const inputInfo = await lstat(inputPath);
  if (inputInfo.isSymbolicLink()) throw new Error('symbolic-link inputs are not accepted');
  if (inputInfo.isFile()) return [path.resolve(inputPath)];
  if (!inputInfo.isDirectory()) throw new Error('input must be a file or directory');

  const files = [];
  async function visit(directory) {
    const dir = await opendir(directory);
    const entries = [];
    for await (const entry of dir) entries.push(entry);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (FORBIDDEN_SEGMENTS.has(entry.name.toLowerCase())) continue;
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(path.resolve(child));
    }
  }
  await visit(path.resolve(inputPath));
  return files;
}

function assertNoSensitiveJsonKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveJsonKeys(entry, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[-_.\s]/g, '');
    if (FORBIDDEN_JSON_KEYS.test(normalized)) {
      throw new Error(`manifest contains forbidden credential-like field at ${[...trail, key].join('.')}`);
    }
    assertNoSensitiveJsonKeys(nested, [...trail, key]);
  }
}

function outputDescriptors(manifest) {
  if (!manifest?.outputs || typeof manifest.outputs !== 'object' || Array.isArray(manifest.outputs)) return [];
  const descriptors = [];
  for (const value of Object.values(manifest.outputs)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const declaredPath = value.file ?? value.fileName;
    if (typeof declaredPath === 'string' && declaredPath.trim()) {
      descriptors.push({
        declaredPath: declaredPath.trim(),
        declaredBytes: value.bytes,
        declaredSha256: value.sha256,
      });
    }
  }
  return descriptors;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function readTrustedManifest(filePath) {
  const info = await assertRegularNoSymlink(filePath);
  if (info.size > MAX_MANIFEST_BYTES) throw new Error('manifest exceeds the 5 MiB safety limit');
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new Error('manifest is not valid JSON');
  }
  assertNoSensitiveJsonKeys(parsed);
  return parsed;
}

async function assertGzip(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const magic = Buffer.alloc(2);
    const { bytesRead } = await handle.read(magic, 0, 2, 0);
    if (bytesRead !== 2 || magic[0] !== 0x1f || magic[1] !== 0x8b) {
      throw new Error('gzip extension does not match file content');
    }
  } finally {
    await handle.close();
  }
}

function extensionFor(filePath) {
  const name = path.basename(filePath).toLowerCase();
  for (const extension of ['sql.gz', 'ndjson.gz', 'jsonl.gz', 'json.gz', 'ndjson', 'jsonl', 'json', 'parquet']) {
    if (name.endsWith(`.${extension}`)) return extension;
  }
  throw new Error('artifact extension is not supported');
}

function mediaFor(extension) {
  if (extension === 'sql.gz') return { mediaType: 'application/sql', contentEncoding: 'gzip' };
  if (extension === 'json' || extension === 'json.gz') {
    return { mediaType: 'application/json', ...(extension.endsWith('.gz') ? { contentEncoding: 'gzip' } : {}) };
  }
  if (extension.startsWith('ndjson') || extension.startsWith('jsonl')) {
    return {
      mediaType: 'application/x-ndjson',
      ...(extension.endsWith('.gz') ? { contentEncoding: 'gzip' } : {}),
    };
  }
  return { mediaType: 'application/vnd.apache.parquet' };
}

export function objectKey({ project, role, sha256, extension }) {
  const safeProject = normalizeProject(project);
  if (!ROLE_ORDER.has(role)) throw new Error('artifact role is not permitted');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('sha256 must be 64 lowercase hexadecimal characters');
  if (!/^[a-z0-9.]+$/.test(extension)) throw new Error('unsafe artifact extension');
  return `${KEY_PREFIX}/${safeProject}/objects/${role}/sha256/${sha256.slice(0, 2)}/${sha256}.${extension}`;
}

export function manifestKey({ project, cutoff, sha256 }) {
  const safeProject = normalizeProject(project);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('sha256 must be 64 lowercase hexadecimal characters');
  return `${KEY_PREFIX}/${safeProject}/manifests/${cutoffKeyPart(cutoff)}/${sha256}.json`;
}

export async function inventoryArtifacts(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('at least one explicit input is required');
  const candidates = new Map();
  const manifests = [];
  let examined = 0;

  for (const rawInput of inputs) {
    const input = path.resolve(requiredString(rawInput, 'input'));
    assertSafeArtifactPath(input);
    const files = await walk(input);
    for (const filePath of files) {
      examined += 1;
      const name = path.basename(filePath);
      try {
        assertSafeArtifactPath(filePath);
      } catch {
        continue;
      }
      if (DUMP_NAME.test(name)) candidates.set(filePath, { filePath, role: 'database-dump' });
      else if (MANIFEST_NAME.test(name)) {
        candidates.set(filePath, { filePath, role: 'manifest' });
        manifests.push(filePath);
      }
    }
  }

  for (const manifestPath of [...new Set(manifests)].sort()) {
    const parsed = await readTrustedManifest(manifestPath);
    const directory = path.dirname(manifestPath);
    for (const descriptor of outputDescriptors(parsed)) {
      if (path.isAbsolute(descriptor.declaredPath)) throw new Error('manifest output path must be relative');
      const outputPath = path.resolve(directory, descriptor.declaredPath);
      if (!isWithin(directory, outputPath)) throw new Error('manifest output escapes its manifest directory');
      if (!CANONICAL_OUTPUT.test(outputPath)) throw new Error('manifest output extension is not permitted');
      assertSafeArtifactPath(outputPath);
      await assertRegularNoSymlink(outputPath);
      if (!candidates.has(outputPath)) {
        candidates.set(outputPath, {
          filePath: outputPath,
          role: 'canonical-output',
          declaredBytes: descriptor.declaredBytes,
          declaredSha256: descriptor.declaredSha256,
        });
      }
    }
  }

  const selected = [...candidates.values()];
  if (selected.length === 0) {
    throw new Error('no permitted artifacts found (expected .sql.gz, manifests, or manifest-declared canonical outputs)');
  }

  const artifacts = [];
  for (const candidate of selected) {
    await assertRegularNoSymlink(candidate.filePath);
    const extension = extensionFor(candidate.filePath);
    if (extension.endsWith('.gz')) await assertGzip(candidate.filePath);
    const measured = await sha256File(candidate.filePath);
    if (candidate.declaredBytes !== undefined && Number(candidate.declaredBytes) !== measured.bytes) {
      throw new Error('canonical output size does not match its source manifest');
    }
    if (
      candidate.declaredSha256 !== undefined
      && String(candidate.declaredSha256).toLowerCase() !== measured.sha256
    ) {
      throw new Error('canonical output SHA-256 does not match its source manifest');
    }
    artifacts.push({
      ...candidate,
      ...measured,
      extension,
      ...mediaFor(extension),
    });
  }

  artifacts.sort((a, b) => {
    const role = (ROLE_ORDER.get(a.role) ?? 99) - (ROLE_ORDER.get(b.role) ?? 99);
    return role || a.sha256.localeCompare(b.sha256);
  });
  const uniqueArtifacts = [];
  const contentIdentities = new Set();
  for (const artifact of artifacts) {
    const identity = `${artifact.role}:${artifact.sha256}:${artifact.extension}`;
    if (contentIdentities.has(identity)) continue;
    contentIdentities.add(identity);
    uniqueArtifacts.push(artifact);
  }
  return { artifacts: uniqueArtifacts, examined };
}

export async function buildBackupPlan({
  inputs,
  cutoff,
  project = DEFAULT_PROJECT,
  now = new Date(),
} = {}) {
  const normalizedProject = normalizeProject(project);
  const normalizedCutoff = normalizeCutoff(cutoff);
  const createdAt = new Date(now).toISOString();
  if (createdAt === 'Invalid Date') throw new Error('now is invalid');
  const { artifacts: localArtifacts, examined } = await inventoryArtifacts(inputs);
  const roleCounters = new Map();

  const artifacts = localArtifacts.map((artifact) => {
    const next = (roleCounters.get(artifact.role) ?? 0) + 1;
    roleCounters.set(artifact.role, next);
    const id = `${artifact.role}-${String(next).padStart(3, '0')}`;
    return {
      id,
      role: artifact.role,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      key: objectKey({
        project: normalizedProject,
        role: artifact.role,
        sha256: artifact.sha256,
        extension: artifact.extension,
      }),
      mediaType: artifact.mediaType,
      ...(artifact.contentEncoding ? { contentEncoding: artifact.contentEncoding } : {}),
      sensitivity: 'restricted',
    };
  });

  const manifest = {
    kind: 'r2-backup-manifest',
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    project: normalizedProject,
    cutoff: normalizedCutoff,
    createdAt,
    keyScheme: `${KEY_PREFIX}/{project}/objects/{role}/sha256/{sha-prefix}/{sha256}.{extension}`,
    privacy: {
      bucketAccess: 'private',
      publicAccessAllowed: false,
      containsPotentialPersonalData: true,
    },
    integrity: { algorithm: 'sha256', immutableKeys: true, overwriteAllowed: false },
    artifacts,
    totals: {
      artifacts: artifacts.length,
      bytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    },
  };
  const manifestBody = canonicalJson(manifest);
  const manifestSha256 = sha256Buffer(manifestBody);
  const manifestBytes = Buffer.byteLength(manifestBody);

  return {
    kind: 'r2-backup-local-plan',
    schemaVersion: PLAN_SCHEMA_VERSION,
    createdAt,
    selection: {
      examinedFiles: examined,
      selectedArtifacts: artifacts.length,
      policy: 'sql-gzip-and-manifest-declared-canonical-v1',
    },
    manifest,
    manifestObject: {
      key: manifestKey({ project: normalizedProject, cutoff: normalizedCutoff, sha256: manifestSha256 }),
      bytes: manifestBytes,
      sha256: manifestSha256,
      mediaType: 'application/json',
    },
    localArtifacts: localArtifacts.map((artifact, index) => ({
      id: artifacts[index].id,
      path: path.resolve(artifact.filePath),
    })),
  };
}

export async function writeBackupPlan(plan, outputPath) {
  validatePlanStructure(plan);
  const target = path.resolve(requiredString(outputPath, 'output'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return target;
}

export async function readBackupPlan(planPath) {
  const target = path.resolve(requiredString(planPath, 'plan'));
  assertSafeArtifactPath(target);
  let plan;
  try {
    plan = JSON.parse(await readFile(target, 'utf8'));
  } catch {
    throw new Error('backup plan is not valid JSON');
  }
  validatePlanStructure(plan);
  return plan;
}

export function validatePlanStructure(plan) {
  if (plan?.kind !== 'r2-backup-local-plan' || plan?.schemaVersion !== PLAN_SCHEMA_VERSION) {
    throw new Error('unsupported backup plan');
  }
  const manifest = plan.manifest;
  if (manifest?.kind !== 'r2-backup-manifest' || manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error('unsupported backup manifest');
  }
  normalizeProject(manifest.project);
  normalizeCutoff(manifest.cutoff);
  if (typeof plan.createdAt !== 'string' || Number.isNaN(Date.parse(plan.createdAt)) || plan.createdAt !== manifest.createdAt) {
    throw new Error('plan and manifest creation timestamps are invalid or inconsistent');
  }
  if (
    manifest.privacy?.bucketAccess !== 'private'
    || manifest.privacy?.publicAccessAllowed !== false
    || manifest.privacy?.containsPotentialPersonalData !== true
    || manifest.keyScheme !== `${KEY_PREFIX}/{project}/objects/{role}/sha256/{sha-prefix}/{sha256}.{extension}`
    || manifest.integrity?.algorithm !== 'sha256'
    || manifest.integrity?.immutableKeys !== true
    || manifest.integrity?.overwriteAllowed !== false
  ) {
    throw new Error('backup plan does not enforce private immutable storage');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error('backup manifest has no artifacts');
  }
  if (!Array.isArray(plan.localArtifacts) || plan.localArtifacts.length !== manifest.artifacts.length) {
    throw new Error('local artifact map does not match manifest');
  }

  const ids = new Set();
  const keys = new Set();
  for (const artifact of manifest.artifacts) {
    if (!/^[-a-z]+-\d{3}$/.test(artifact.id) || ids.has(artifact.id)) throw new Error('invalid or duplicate artifact id');
    ids.add(artifact.id);
    if (!ROLE_ORDER.has(artifact.role)) throw new Error('artifact role is not permitted');
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) throw new Error('artifact byte count is invalid');
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('artifact SHA-256 is invalid');
    if (artifact.sensitivity !== 'restricted') throw new Error('artifact sensitivity must be restricted');
    const suffix = artifact.key.slice(artifact.key.indexOf(`${artifact.sha256}.`) + artifact.sha256.length + 1);
    if (artifact.role === 'database-dump' && suffix !== 'sql.gz') throw new Error('database dumps must be .sql.gz');
    if (artifact.role === 'manifest' && suffix !== 'json') throw new Error('source manifests must be JSON');
    if (artifact.role === 'canonical-output' && !CANONICAL_OUTPUT.test(`artifact.${suffix}`)) {
      throw new Error('canonical output extension is not permitted');
    }
    const expectedMedia = mediaFor(suffix);
    if (
      artifact.mediaType !== expectedMedia.mediaType
      || artifact.contentEncoding !== expectedMedia.contentEncoding
    ) {
      throw new Error('artifact media metadata does not match its extension');
    }
    const expectedKey = objectKey({
      project: manifest.project,
      role: artifact.role,
      sha256: artifact.sha256,
      extension: suffix,
    });
    if (artifact.key !== expectedKey || keys.has(artifact.key)) throw new Error('invalid or duplicate content-addressed key');
    keys.add(artifact.key);
  }

  if (
    manifest.totals?.artifacts !== manifest.artifacts.length
    || manifest.totals?.bytes !== manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0)
  ) {
    throw new Error('manifest totals do not match its artifacts');
  }

  const localIds = new Set();
  for (const local of plan.localArtifacts) {
    if (!ids.has(local.id) || localIds.has(local.id)) throw new Error('invalid or duplicate local artifact mapping');
    requiredString(local.path, 'local artifact path');
    localIds.add(local.id);
  }

  const manifestBody = canonicalJson(manifest);
  const sha256 = sha256Buffer(manifestBody);
  const bytes = Buffer.byteLength(manifestBody);
  const expectedManifestKey = manifestKey({ project: manifest.project, cutoff: manifest.cutoff, sha256 });
  if (
    plan.manifestObject?.sha256 !== sha256
    || plan.manifestObject?.bytes !== bytes
    || plan.manifestObject?.key !== expectedManifestKey
    || plan.manifestObject?.mediaType !== 'application/json'
  ) {
    throw new Error('manifest object integrity descriptor is invalid');
  }
  return plan;
}

export async function validateLocalArtifacts(plan) {
  validatePlanStructure(plan);
  const localById = new Map(plan.localArtifacts.map((entry) => [entry.id, entry.path]));
  const verified = [];
  for (const artifact of plan.manifest.artifacts) {
    const filePath = path.resolve(localById.get(artifact.id));
    assertSafeArtifactPath(filePath);
    await assertRegularNoSymlink(filePath);
    const measured = await sha256File(filePath);
    if (measured.bytes !== artifact.bytes || measured.sha256 !== artifact.sha256) {
      throw new Error(`local artifact ${artifact.id} no longer matches the immutable plan`);
    }
    verified.push({ artifact, filePath });
  }
  return verified;
}

function safeRestoreName(artifact) {
  const extension = artifact.key.slice(artifact.key.indexOf(`${artifact.sha256}.`) + artifact.sha256.length + 1);
  return `${artifact.id}.${extension}`;
}

export async function buildRestoreDryRun(plan, destination) {
  validatePlanStructure(plan);
  const root = path.resolve(requiredString(destination, 'destination'));
  const operations = [];
  for (const artifact of plan.manifest.artifacts) {
    const target = path.resolve(root, safeRestoreName(artifact));
    if (!isWithin(root, target)) throw new Error('restore target escapes destination');
    try {
      await lstat(target);
      throw new Error(`restore target already exists for ${artifact.id}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    operations.push({
      id: artifact.id,
      key: artifact.key,
      target,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    });
  }
  return {
    mode: 'dry-run',
    writesPerformed: 0,
    destination: root,
    cutoff: plan.manifest.cutoff,
    operations,
  };
}

export function manifestUpload(plan) {
  validatePlanStructure(plan);
  return {
    artifact: {
      id: 'manifest-000',
      role: 'manifest',
      key: plan.manifestObject.key,
      bytes: plan.manifestObject.bytes,
      sha256: plan.manifestObject.sha256,
      mediaType: 'application/json',
      sensitivity: 'restricted',
    },
    body: Buffer.from(canonicalJson(plan.manifest), 'utf8'),
  };
}
