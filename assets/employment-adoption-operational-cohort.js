// Explicit source scope, not a salary eligibility decision or a search filter.
export const OPERATIONAL_ADOPTION_INPUT_VERSION='employment-adoption-input.v7';
export const OPERATIONAL_ADOPTION_PREPARATION_VERSION='employment-adoption-preparation.v7';
export const OPERATIONAL_ADOPTION_COHORT='active-with-entry.v1';
export function operationalAdoptionCohort(value){return value?.version===OPERATIONAL_ADOPTION_COHORT;}
