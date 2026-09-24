// Identidad técnica del frontend; no certifica datos, permisos ni una migración.
export const RELEASE_VERSION = 'municontrol-release.v1';
const keys = ['version', 'commitSha', 'sourceState', 'adminUiSha256'];
export function verifyRelease(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
      || value.version !== RELEASE_VERSION
      || !['committed', 'modified', 'unknown'].includes(value.sourceState)
      || typeof value.adminUiSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.adminUiSha256)) {
    throw new Error('RELEASE_IDENTITY_INVALID');
  }
  if (value.sourceState === 'committed'
      ? typeof value.commitSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.commitSha)
      : value.commitSha !== null) throw new Error('RELEASE_IDENTITY_INVALID');
  return Object.freeze({ ...value });
}
export function compareRelease(loaded, published) {
  const before = verifyRelease(loaded), after = verifyRelease(published);
  if (before.sourceState !== 'committed' || after.sourceState !== 'committed') {
    return 'unverified';
  }
  if (before.commitSha !== after.commitSha) return 'different_commit';
  if (before.adminUiSha256 !== after.adminUiSha256) return 'different_artifact';
  return 'same';
}
export function releaseLabel(release) {
  return release?.sourceState === 'committed' ? release.commitSha.slice(0, 7)
    : release?.sourceState === 'modified' ? 'Copia con cambios sin confirmar' : 'Versión no identificada';
}
