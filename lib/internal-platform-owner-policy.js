const PLATFORM_OWNER_ROLE = 'PLATFORM_OWNER';
const CAPABILITY_PATTERN = /^[a-z][a-z0-9._-]{2,119}$/;

function normalizedValues(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))]
    : [];
}

/**
 * The platform owner is an effective backend authority, never an email or a
 * display-name convention. Callers still decide whether platform or tenant
 * context is appropriate for the operation they protect.
 */
export function hasEffectivePlatformOwnerAuthority(principal, requiredCapabilities = []) {
  if (principal?.authorized !== true) return false;
  const platform = principal?.platform;
  const roles = normalizedValues(platform?.roles);
  const capabilities = new Set(normalizedValues(platform?.capabilities));
  const required = normalizedValues(requiredCapabilities);
  if (!roles.includes(PLATFORM_OWNER_ROLE)) return false;
  if (required.some((capability) => !CAPABILITY_PATTERN.test(capability))) return false;
  return required.every((capability) => capabilities.has(capability));
}

export function hasEffectivePlatformOwnerContext(principal, requiredCapabilities = []) {
  return principal?.tenant === null
    && hasEffectivePlatformOwnerAuthority(principal, requiredCapabilities);
}

export { PLATFORM_OWNER_ROLE };
