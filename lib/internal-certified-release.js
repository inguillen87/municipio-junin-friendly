export const INTERNAL_CERTIFIED_RELEASE_SHA_ENV = 'INTERNAL_CERTIFIED_RELEASE_SHA';
export const VERCEL_GIT_COMMIT_SHA_ENV = 'VERCEL_GIT_COMMIT_SHA';

const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;

export class InternalCertifiedReleaseError extends Error {
  constructor(source, code = 'INTERNAL_CERTIFIED_RELEASE_SHA_INVALID') {
    super('El SHA del release certificado no está configurado correctamente');
    this.name = 'InternalCertifiedReleaseError';
    this.code = code;
    this.source = source;
  }
}

/**
 * Resolves the immutable release identity used by the DB certification gates.
 *
 * Manual deployments must set INTERNAL_CERTIFIED_RELEASE_SHA explicitly.
 * Git-backed Vercel deployments may fall back to VERCEL_GIT_COMMIT_SHA. When
 * the explicit variable exists it is authoritative: an invalid explicit value
 * fails closed and never falls back to potentially stale deployment metadata.
 */
export function resolveInternalCertifiedReleaseSha(env = process.env) {
  const values = env && typeof env === 'object' ? env : {};
  const explicit = Object.prototype.hasOwnProperty.call(values, INTERNAL_CERTIFIED_RELEASE_SHA_ENV);
  const source = explicit ? INTERNAL_CERTIFIED_RELEASE_SHA_ENV : VERCEL_GIT_COMMIT_SHA_ENV;
  const value = String(values[source] ?? '').trim().toLowerCase();
  if (!RELEASE_SHA_PATTERN.test(value)) throw new InternalCertifiedReleaseError(source);
  if (explicit) {
    const vercelValue = String(values[VERCEL_GIT_COMMIT_SHA_ENV] ?? '').trim().toLowerCase();
    if (vercelValue && !RELEASE_SHA_PATTERN.test(vercelValue)) {
      throw new InternalCertifiedReleaseError(VERCEL_GIT_COMMIT_SHA_ENV);
    }
    if (vercelValue && vercelValue !== value) {
      throw new InternalCertifiedReleaseError(
        `${INTERNAL_CERTIFIED_RELEASE_SHA_ENV}:${VERCEL_GIT_COMMIT_SHA_ENV}`,
        'INTERNAL_CERTIFIED_RELEASE_SHA_MISMATCH',
      );
    }
  }
  return value;
}
