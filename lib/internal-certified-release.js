export const INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV = 'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA';
export const INTERNAL_CERTIFIED_RELEASE_SHA_ENV = 'INTERNAL_CERTIFIED_RELEASE_SHA';
export const VERCEL_GIT_COMMIT_SHA_ENV = 'VERCEL_GIT_COMMIT_SHA';

const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;

export class InternalCertifiedDataContractError extends Error {
  constructor(source, code = 'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_INVALID') {
    super('La identidad del contrato de datos certificado no está configurada correctamente');
    this.name = 'InternalCertifiedDataContractError';
    this.code = code;
    this.source = source;
  }
}

// Alias de compatibilidad para consumidores externos durante la transición de nombre.
export const InternalCertifiedReleaseError = InternalCertifiedDataContractError;

/**
 * Resolves the stable data-contract identity used by the DB certification gates.
 *
 * The contract identity changes only when the governed data contract changes,
 * not for every application deployment. INTERNAL_CERTIFIED_RELEASE_SHA remains
 * an explicit transitional alias so the rollout can be completed without an
 * unsafe flag day. VERCEL_GIT_COMMIT_SHA is deliberately never consulted: a
 * source commit identifies an artifact, not the data contract it consumes.
 */
export function resolveInternalCertifiedDataContractSha(env = process.env) {
  const values = env && typeof env === 'object' ? env : {};
  const hasCanonical = Object.prototype.hasOwnProperty.call(
    values, INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV,
  );
  const hasLegacy = Object.prototype.hasOwnProperty.call(values, INTERNAL_CERTIFIED_RELEASE_SHA_ENV);

  if (!hasCanonical && !hasLegacy) {
    throw new InternalCertifiedDataContractError(
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV,
      'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISSING',
    );
  }

  const canonicalValue = hasCanonical
    ? String(values[INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV] ?? '').trim().toLowerCase()
    : '';
  const legacyValue = hasLegacy
    ? String(values[INTERNAL_CERTIFIED_RELEASE_SHA_ENV] ?? '').trim().toLowerCase()
    : '';

  if (hasCanonical && !RELEASE_SHA_PATTERN.test(canonicalValue)) {
    throw new InternalCertifiedDataContractError(INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV);
  }
  if (hasLegacy && !RELEASE_SHA_PATTERN.test(legacyValue)) {
    throw new InternalCertifiedDataContractError(INTERNAL_CERTIFIED_RELEASE_SHA_ENV);
  }
  if (hasCanonical && hasLegacy && canonicalValue !== legacyValue) {
    throw new InternalCertifiedDataContractError(
      `${INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_ENV}:${INTERNAL_CERTIFIED_RELEASE_SHA_ENV}`,
      'INTERNAL_CERTIFIED_DATA_CONTRACT_SHA_MISMATCH',
    );
  }

  return hasCanonical ? canonicalValue : legacyValue;
}

// Alias de API temporal. El valor retornado ya no representa al commit desplegado.
export const resolveInternalCertifiedReleaseSha = resolveInternalCertifiedDataContractSha;
