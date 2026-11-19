// Presence is derived only from the complete, approved frozen novelty set.
// It is independent of the numeric amount/quantity, including an explicit zero.
export const OWN_PAYROLL_NOVELTY_PRESENCE_VERSION='own-payroll-novelty-presence.v1';
export const ownProgramNoveltyPresence=p=>p?.noveltyPresenceVersion===OWN_PAYROLL_NOVELTY_PRESENCE_VERSION;
export const ownNoveltyPresenceKind=kind=>['monthly_presence','fixed_presence'].includes(kind);
