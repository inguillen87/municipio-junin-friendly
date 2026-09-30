// Stored UUID identities are opaque keys, not a declaration of a generator/version.
// This validator is for record references only: not sessions, capabilities or command keys.
export function isPayrollRecordIdentity(value){
 return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
  &&value!=='00000000-0000-0000-0000-000000000000';
}
