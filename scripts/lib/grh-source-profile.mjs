import { readFileSync } from 'node:fs';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const registry = freeze(JSON.parse(readFileSync(new URL('./grh-source-profiles.json', import.meta.url), 'utf8')));

// A known source profile identifies evidence; it does not authorize publication.
export function getGrhSourceProfile(profileId, { allowCandidateRead = false } = {}) {
  if (typeof profileId !== 'string' || !profileId) {
    throw Object.assign(new Error('GRH_SOURCE_PROFILE_UNSUPPORTED'), { code: 'GRH_SOURCE_PROFILE_UNSUPPORTED' });
  }
  const matches = registry.profiles.filter((profile) =>
    [profile.id, profile.curated.profileId, profile.core.profileId].includes(profileId));
  if (matches.length !== 1) {
    throw Object.assign(new Error('GRH_SOURCE_PROFILE_UNSUPPORTED'), { code: 'GRH_SOURCE_PROFILE_UNSUPPORTED' });
  }
  if (matches[0].publicationMode === 'candidate_only' && allowCandidateRead !== true) {
    throw Object.assign(new Error('GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ'), { code: 'GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ' });
  }
  return matches[0];
}

export function defaultGrhSourceProfile() {
  return getGrhSourceProfile(registry.defaultProfileId);
}
