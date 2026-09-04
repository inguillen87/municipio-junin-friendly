import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_MANIFEST_PATH = 'contracts/certified-data-contract-files.v1.json';
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function fail(message) {
  throw new Error(message);
}

export function normalizeRepositoryPath(value, field = 'path') {
  const normalized = String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
  const segments = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)
      || normalized.endsWith('/') || CONTROL_CHARACTER.test(normalized)
      || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${field} debe ser una ruta relativa segura del repositorio`);
  }
  return normalized;
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} debe ser un objeto`);
  return value;
}

function requireNonEmptyText(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) fail(`${field} es obligatorio`);
  return normalized;
}

export function validateDataContractManifest(input, manifestPath = DEFAULT_MANIFEST_PATH) {
  const manifest = structuredClone(requireObject(input, 'manifest'));
  if (manifest.schemaVersion !== 1) fail('manifest.schemaVersion debe ser 1');
  if (!/^[a-z0-9][a-z0-9.-]+\.v1$/.test(requireNonEmptyText(manifest.manifestId, 'manifest.manifestId'))) {
    fail('manifest.manifestId debe ser estable, minúsculo y terminar en .v1');
  }
  if (!/^1\.\d+\.\d+$/.test(requireNonEmptyText(manifest.manifestVersion, 'manifest.manifestVersion'))) {
    fail('manifest.manifestVersion debe usar semver 1.x');
  }

  const identity = requireObject(manifest.identity, 'manifest.identity');
  if (identity.algorithm !== 'sha256' || identity.runtimeHexLength !== 40
      || identity.textNormalization !== 'utf8-lf' || identity.ordering !== 'repository-path') {
    fail('manifest.identity no coincide con el algoritmo estable admitido');
  }

  const members = requireObject(manifest.members, 'manifest.members');
  if (!Array.isArray(members.files) || members.files.length === 0) {
    fail('manifest.members.files debe contener al menos un archivo');
  }
  if (!Array.isArray(members.trees)) fail('manifest.members.trees debe ser una lista');

  const seen = new Set();
  members.files = members.files.map((entry, index) => {
    const item = requireObject(entry, `manifest.members.files[${index}]`);
    const repositoryPath = normalizeRepositoryPath(item.path, `manifest.members.files[${index}].path`);
    if (seen.has(repositoryPath)) fail(`ruta duplicada en manifest.members.files: ${repositoryPath}`);
    seen.add(repositoryPath);
    return {
      path: repositoryPath,
      category: requireNonEmptyText(item.category, `manifest.members.files[${index}].category`),
      reason: requireNonEmptyText(item.reason, `manifest.members.files[${index}].reason`),
    };
  });

  const normalizedManifestPath = normalizeRepositoryPath(manifestPath, 'manifestPath');
  if (!seen.has(normalizedManifestPath)) {
    fail(`el manifiesto debe incluirse a sí mismo: ${normalizedManifestPath}`);
  }

  members.trees = members.trees.map((entry, index) => {
    const item = requireObject(entry, `manifest.members.trees[${index}]`);
    const repositoryPath = normalizeRepositoryPath(item.path, `manifest.members.trees[${index}].path`);
    if (!Array.isArray(item.extensions) || item.extensions.length === 0) {
      fail(`manifest.members.trees[${index}].extensions debe contener extensiones`);
    }
    const extensions = [...new Set(item.extensions.map((extension) => {
      const normalized = String(extension || '').trim().toLowerCase();
      if (!/^\.[a-z0-9]+$/.test(normalized)) {
        fail(`manifest.members.trees[${index}].extensions contiene un valor inválido`);
      }
      return normalized;
    }))].sort();
    return {
      path: repositoryPath,
      extensions,
      category: requireNonEmptyText(item.category, `manifest.members.trees[${index}].category`),
      reason: requireNonEmptyText(item.reason, `manifest.members.trees[${index}].reason`),
    };
  });

  const policy = requireObject(manifest.releasePolicy, 'manifest.releasePolicy');
  manifest.releasePolicy = {
    ordinaryRelease: requireNonEmptyText(policy.ordinaryRelease, 'manifest.releasePolicy.ordinaryRelease'),
    dataContractChange: requireNonEmptyText(policy.dataContractChange, 'manifest.releasePolicy.dataContractChange'),
  };
  manifest.members = members;
  manifest.identity = identity;
  return manifest;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeText(bytes) {
  return bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function resolvedGitCommit(repositoryRoot, reference) {
  const output = execFileSync(
    'git', ['-C', repositoryRoot, 'rev-parse', '--verify', `${reference}^{commit}`],
    { encoding: 'utf8', windowsHide: true },
  ).trim().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(output)) fail(`referencia git inválida: ${reference}`);
  return output;
}

function gitObjectType(repositoryRoot, commit, repositoryPath) {
  try {
    return execFileSync(
      'git', ['-C', repositoryRoot, 'cat-file', '-t', `${commit}:${repositoryPath}`],
      { encoding: 'utf8', windowsHide: true },
    ).trim();
  } catch {
    return null;
  }
}

function readGitBlob(repositoryRoot, commit, repositoryPath) {
  if (gitObjectType(repositoryRoot, commit, repositoryPath) !== 'blob') {
    fail(`archivo de contrato ausente o inválido en ${commit.slice(0, 12)}: ${repositoryPath}`);
  }
  return execFileSync(
    'git', ['-C', repositoryRoot, 'cat-file', 'blob', `${commit}:${repositoryPath}`],
    { encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
  );
}

async function walkTree(repositoryRoot, tree) {
  const absoluteRoot = path.resolve(repositoryRoot, ...tree.path.split('/'));
  const rootRelative = tree.path;
  const entries = [];

  async function visit(absoluteDirectory, relativeDirectory) {
    const children = await readdir(absoluteDirectory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const child of children) {
      const absoluteChild = path.join(absoluteDirectory, child.name);
      const relativeChild = `${relativeDirectory}/${child.name}`.replaceAll('\\', '/');
      if (child.isSymbolicLink()) fail(`el contrato no admite enlaces simbólicos: ${relativeChild}`);
      if (child.isDirectory()) await visit(absoluteChild, relativeChild);
      else if (child.isFile() && tree.extensions.includes(path.extname(child.name).toLowerCase())) {
        entries.push(relativeChild);
      }
    }
  }

  const metadata = await lstat(absoluteRoot).catch(() => null);
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
    fail(`árbol de contrato ausente o inválido: ${rootRelative}`);
  }
  await visit(absoluteRoot, rootRelative);
  return entries;
}

function walkGitTree(repositoryRoot, commit, tree) {
  if (gitObjectType(repositoryRoot, commit, tree.path) !== 'tree') {
    fail(`árbol de contrato ausente o inválido en ${commit.slice(0, 12)}: ${tree.path}`);
  }
  const output = execFileSync(
    'git', ['-C', repositoryRoot, 'ls-tree', '-r', '-z', '--name-only', commit, '--', tree.path],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
  );
  return output.split('\0').filter(Boolean).map((repositoryPath) => (
    normalizeRepositoryPath(repositoryPath, `archivo de ${tree.path}`)
  )).filter((repositoryPath) => tree.extensions.includes(
    path.posix.extname(repositoryPath).toLowerCase(),
  )).sort();
}

export function dataContractMembership(manifest, repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath, 'repositoryPath');
  const direct = manifest.members.files.find((entry) => entry.path === normalized);
  if (direct) return { matched: true, category: direct.category, selector: direct.path };
  const tree = manifest.members.trees.find((entry) => (
    normalized.startsWith(`${entry.path}/`)
    && entry.extensions.includes(path.posix.extname(normalized).toLowerCase())
  ));
  if (tree) return { matched: true, category: tree.category, selector: `${tree.path}/**` };
  return { matched: false, category: null, selector: null };
}

export function classifyChangedPaths(manifest, changedPaths) {
  const uniquePaths = [...new Set(changedPaths.map((item) => normalizeRepositoryPath(item)))].sort();
  const inspected = uniquePaths.map((repositoryPath) => ({
    path: repositoryPath,
    ...dataContractMembership(manifest, repositoryPath),
  }));
  const contractChanges = inspected.filter((entry) => entry.matched);
  return {
    classification: contractChanges.length > 0 ? 'data_contract_change' : 'ordinary_release',
    changedFiles: inspected.map((entry) => entry.path),
    contractChangedFiles: contractChanges.map(({ path: entryPath, category, selector }) => ({
      path: entryPath, category, selector,
    })),
  };
}

export async function computeDataContractIdentity(
  repositoryRoot,
  manifest,
  manifestPath = DEFAULT_MANIFEST_PATH,
  options = {},
) {
  const normalizedManifestPath = normalizeRepositoryPath(manifestPath, 'manifestPath');
  const gitCommit = options.gitRef ? resolvedGitCommit(repositoryRoot, options.gitRef) : null;
  const files = new Set(manifest.members.files.map((entry) => entry.path));
  for (const tree of manifest.members.trees) {
    const treeFiles = gitCommit
      ? walkGitTree(repositoryRoot, gitCommit, tree)
      : await walkTree(repositoryRoot, tree);
    for (const repositoryPath of treeFiles) files.add(repositoryPath);
  }

  const orderedPaths = [...files].sort();
  const hash = createHash('sha256');
  hash.update('municontrol-certified-data-contract\0v1\0', 'utf8');
  hash.update(canonicalJson(manifest), 'utf8');
  hash.update('\0', 'utf8');

  for (const repositoryPath of orderedPaths) {
    if (repositoryPath === normalizedManifestPath) continue;
    let bytes;
    if (gitCommit) bytes = readGitBlob(repositoryRoot, gitCommit, repositoryPath);
    else {
      const absolutePath = path.resolve(repositoryRoot, ...repositoryPath.split('/'));
      const metadata = await lstat(absolutePath).catch(() => null);
      if (!metadata?.isFile() || metadata.isSymbolicLink()) {
        fail(`archivo de contrato ausente o inválido: ${repositoryPath}`);
      }
      bytes = await readFile(absolutePath);
    }
    const contents = normalizeText(bytes);
    hash.update(`${repositoryPath.length}:${repositoryPath}\0${Buffer.byteLength(contents, 'utf8')}:`, 'utf8');
    hash.update(contents, 'utf8');
    hash.update('\0', 'utf8');
  }

  const fullDigestSha256 = hash.digest('hex');
  const dataContractId = fullDigestSha256.slice(0, manifest.identity.runtimeHexLength);
  if (!SHA256.test(fullDigestSha256) || !SHA40.test(dataContractId)) fail('no se pudo calcular una identidad válida');
  return { dataContractId, fullDigestSha256, files: orderedPaths };
}

export function parseGitNameStatus(raw) {
  const tokens = String(raw || '').split('\0');
  const paths = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) continue;
    const kind = status[0];
    if (kind === 'R' || kind === 'C') {
      const previousPath = tokens[index++];
      const nextPath = tokens[index++];
      if (!previousPath || !nextPath) fail(`salida git incompleta para ${status}`);
      paths.push(previousPath, nextPath);
      continue;
    }
    const repositoryPath = tokens[index++];
    if (!repositoryPath) fail(`salida git incompleta para ${status}`);
    paths.push(repositoryPath);
  }
  return [...new Set(paths.map((repositoryPath) => normalizeRepositoryPath(repositoryPath)))];
}

function git(repositoryRoot, args) {
  return execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8', windowsHide: true });
}

export function changedPathsBetween(repositoryRoot, base, head = 'WORKTREE') {
  const normalizedBase = requireNonEmptyText(base, 'base');
  const normalizedHead = requireNonEmptyText(head, 'head');
  git(repositoryRoot, ['rev-parse', '--verify', `${normalizedBase}^{commit}`]);

  const worktree = normalizedHead.toUpperCase() === 'WORKTREE';
  if (!worktree) git(repositoryRoot, ['rev-parse', '--verify', `${normalizedHead}^{commit}`]);
  const diffArgs = ['diff', '--name-status', '-z', '--find-renames', normalizedBase];
  if (!worktree) diffArgs.push(normalizedHead);
  diffArgs.push('--');
  const changed = parseGitNameStatus(git(repositoryRoot, diffArgs));
  if (worktree) {
    const untracked = git(repositoryRoot, ['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\0').filter(Boolean).map((repositoryPath) => normalizeRepositoryPath(repositoryPath));
    changed.push(...untracked);
  }
  return [...new Set(changed)].sort();
}

function parseArguments(argv) {
  const options = {
    root: SCRIPT_ROOT,
    manifest: DEFAULT_MANIFEST_PATH,
    base: process.env.RELEASE_BASE_SHA || 'HEAD^',
    head: process.env.RELEASE_HEAD_SHA || 'WORKTREE',
    json: false,
    failOnContractChange: false,
  };
  for (const argument of argv) {
    if (argument === '--json') options.json = true;
    else if (argument === '--fail-on-contract-change') options.failOnContractChange = true;
    else if (argument.startsWith('--root=')) options.root = path.resolve(argument.slice('--root='.length));
    else if (argument.startsWith('--manifest=')) options.manifest = normalizeRepositoryPath(argument.slice('--manifest='.length));
    else if (argument.startsWith('--base=')) options.base = requireNonEmptyText(argument.slice('--base='.length), 'base');
    else if (argument.startsWith('--head=')) options.head = requireNonEmptyText(argument.slice('--head='.length), 'head');
    else fail(`opción desconocida: ${argument}`);
  }
  return options;
}

async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const manifestAbsolute = path.resolve(options.root, ...options.manifest.split('/'));
  const worktree = options.head.toUpperCase() === 'WORKTREE';
  const headCommit = worktree ? null : resolvedGitCommit(options.root, options.head);
  const manifestSource = worktree
    ? await readFile(manifestAbsolute, 'utf8')
    : normalizeText(readGitBlob(options.root, headCommit, options.manifest));
  const manifest = validateDataContractManifest(
    JSON.parse(manifestSource),
    options.manifest,
  );
  const identity = await computeDataContractIdentity(
    options.root,
    manifest,
    options.manifest,
    headCommit ? { gitRef: headCommit } : {},
  );
  const changedPaths = changedPathsBetween(options.root, options.base, options.head);
  const result = {
    manifestId: manifest.manifestId,
    manifestVersion: manifest.manifestVersion,
    base: options.base,
    head: options.head,
    ...identity,
    ...classifyChangedPaths(manifest, changedPaths),
  };

  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    const ordinary = result.classification === 'ordinary_release';
    process.stdout.write([
      `Clasificación: ${ordinary ? 'RELEASE ORDINARIO' : 'CAMBIO DE CONTRATO DE DATOS'}`,
      `Contrato calculado: ${result.dataContractId}`,
      `Base: ${result.base}`,
      `Destino: ${result.head}`,
      `Archivos cambiados: ${result.changedFiles.length}`,
      `Archivos de contrato afectados: ${result.contractChangedFiles.length}`,
      ordinary
        ? 'Acción: conservar INTERNAL_CERTIFIED_DATA_CONTRACT_SHA; no ejecutar certify_data_plane.'
        : 'Acción: detener la publicación ordinaria y completar validación, rotación y certificación gobernadas.',
    ].join('\n') + '\n');
    for (const entry of result.contractChangedFiles) {
      process.stdout.write(`- ${entry.path} [${entry.category}]\n`);
    }
  }

  if (options.failOnContractChange && result.classification === 'data_contract_change') {
    process.exitCode = 2;
  }
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) {
  runCli().catch((error) => {
    process.stderr.write(`No se pudo clasificar la publicación: ${error.message}\n`);
    process.exitCode = 1;
  });
}
