import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV,
  InternalCertifiedDataContractError,
  resolveInternalCertifiedDataContractSha,
} from '../lib/internal-certified-release.js';
import {
  DEFAULT_MANIFEST_PATH,
  computeDataContractIdentity,
  normalizeRepositoryPath,
  validateDataContractManifest,
} from './classify-data-contract-release.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_CONTRACT_ID_PATTERN = /^[a-f0-9]{40}$/;
const VERCEL_ENVIRONMENTS = new Set(['production', 'preview', 'development']);
const BUILD_ENVIRONMENTS = new Set([...VERCEL_ENVIRONMENTS, 'local']);

export class CertifiedDataContractBuildAssertionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CertifiedDataContractBuildAssertionError';
    this.code = code;
  }
}

function assertionError(code, message) {
  throw new CertifiedDataContractBuildAssertionError(code, message);
}

/**
 * Resolves only the deployment class. Vercel always publishes VERCEL=1 and a
 * VERCEL_ENV value, so an incomplete Vercel context is rejected instead of
 * being silently interpreted as a local build.
 */
export function resolveDataContractBuildEnvironment(env = process.env) {
  const values = env && typeof env === 'object' ? env : {};
  const vercel = String(values.VERCEL ?? '').trim();
  const rawEnvironment = String(values.VERCEL_ENV ?? '').trim().toLowerCase();

  if (vercel === '1' && !rawEnvironment) {
    assertionError(
      'VERCEL_ENV_MISSING',
      'Vercel informó un build sin VERCEL_ENV; no se puede clasificar de forma segura.',
    );
  }
  if (rawEnvironment && !VERCEL_ENVIRONMENTS.has(rawEnvironment)) {
    assertionError(
      'VERCEL_ENV_INVALID',
      'VERCEL_ENV no identifica un entorno admitido.',
    );
  }
  return rawEnvironment || 'local';
}

function resolveProductionCertifiedIdentity(env) {
  const values = env && typeof env === 'object' ? env : {};
  if (!Object.prototype.hasOwnProperty.call(
    values,
    INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV,
  )) {
    assertionError(
      'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISSING',
      'Falta la identidad canónica del contrato de datos para Vercel Producción.',
    );
  }

  try {
    return resolveInternalCertifiedDataContractSha(values);
  } catch (error) {
    if (error instanceof InternalCertifiedDataContractError) {
      assertionError(
        error.code || 'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_INVALID',
        'La identidad configurada del contrato de datos no es válida para Producción.',
      );
    }
    throw error;
  }
}

/**
 * Compares a previously calculated checkout identity against the canonical
 * Production pin. Non-production builds report `not_applicable`: this is not
 * certification evidence and deliberately does not claim a successful match.
 */
export function evaluateCertifiedDataContractIdentity({
  dataContractId,
  environment,
  env = process.env,
}) {
  const buildEnvironment = String(environment ?? '').trim().toLowerCase();
  if (!BUILD_ENVIRONMENTS.has(buildEnvironment)) {
    assertionError(
      'BUILD_ENVIRONMENT_INVALID',
      'El entorno del assert contractual no está clasificado.',
    );
  }
  const calculatedIdentity = String(dataContractId ?? '').trim().toLowerCase();
  if (!DATA_CONTRACT_ID_PATTERN.test(calculatedIdentity)) {
    assertionError(
      'CALCULATED_DATA_CONTRACT_ID_INVALID',
      'La identidad calculada del checkout no tiene el formato contractual.',
    );
  }

  if (buildEnvironment !== 'production') {
    return Object.freeze({
      environment: buildEnvironment,
      dataContractId: calculatedIdentity,
      comparisonPerformed: false,
      status: 'not_applicable',
    });
  }

  const certifiedIdentity = resolveProductionCertifiedIdentity(env);
  if (certifiedIdentity !== calculatedIdentity) {
    assertionError(
      'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISMATCH',
      'El contrato del checkout no coincide con la identidad certificada de Producción.',
    );
  }

  return Object.freeze({
    environment: buildEnvironment,
    dataContractId: calculatedIdentity,
    comparisonPerformed: true,
    status: 'verified',
  });
}

/**
 * Calculates the identity from the exact source files delivered to the build.
 * It intentionally does not depend on .git because Vercel source uploads may
 * omit Git metadata while still containing the immutable checkout contents.
 */
export async function assertCertifiedDataContract({
  repositoryRoot = SCRIPT_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
  env = process.env,
} = {}) {
  const environment = resolveDataContractBuildEnvironment(env);
  const normalizedManifestPath = normalizeRepositoryPath(manifestPath, 'manifestPath');
  const manifestAbsolute = path.resolve(
    repositoryRoot,
    ...normalizedManifestPath.split('/'),
  );
  const manifestSource = await readFile(manifestAbsolute, 'utf8');
  const manifest = validateDataContractManifest(
    JSON.parse(manifestSource),
    normalizedManifestPath,
  );
  const identity = await computeDataContractIdentity(
    repositoryRoot,
    manifest,
    normalizedManifestPath,
  );
  const assertion = evaluateCertifiedDataContractIdentity({
    dataContractId: identity.dataContractId,
    environment,
    env,
  });

  return Object.freeze({
    manifestId: manifest.manifestId,
    manifestVersion: manifest.manifestVersion,
    fullDigestSha256: identity.fullDigestSha256,
    files: identity.files,
    ...assertion,
  });
}

async function runCli() {
  const result = await assertCertifiedDataContract();
  if (result.status === 'verified') {
    process.stdout.write([
      'Identidad contractual: VERIFICADA PARA VERCEL PRODUCCIÓN',
      `Contrato calculado: ${result.dataContractId}`,
      `Archivos protegidos: ${result.files.length}`,
    ].join('\n') + '\n');
    return;
  }

  process.stdout.write([
    'Identidad contractual: COMPARACIÓN NO APLICABLE',
    `Entorno: ${result.environment}`,
    `Contrato calculado: ${result.dataContractId}`,
    `Archivos protegidos: ${result.files.length}`,
    'Este resultado calcula el checkout, pero no certifica ni verifica Producción.',
  ].join('\n') + '\n');
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) {
  runCli().catch((error) => {
    const code = error?.code ? ` [${error.code}]` : '';
    process.stderr.write(`No se pudo validar el contrato de publicación${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
