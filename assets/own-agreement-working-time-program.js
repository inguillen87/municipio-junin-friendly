export const OWN_AGREEMENT_WORKING_TIME_VERSION = 'own-agreement-working-time.v1';
export const ownProgramAgreementWorkingTime = p => p !== null && typeof p === 'object' && Object.getOwnPropertyDescriptor(p, 'agreementWorkingTimeVersion')?.value === OWN_AGREEMENT_WORKING_TIME_VERSION;
