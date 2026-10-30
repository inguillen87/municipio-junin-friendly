import {nativeLeaveUuid} from './native-leave-contract.js';

// The managed auth response publishes the session UUID as user.id. It does
// not publish a membershipId; the server alone resolves that authority.
export function nativeLeaveWorkspaceAccess(auth){
 const tenant=auth?.access?.tenant,email=auth?.user?.email,caps=auth?.access?.tenantCapabilities;
 if(auth?.ok!==true||auth.authenticated!==true||auth.sessionVersion!==2||!nativeLeaveUuid(auth.user?.id)||typeof email!=='string'||!email.trim()||!nativeLeaveUuid(tenant?.id)||typeof tenant.roleKey!=='string'||!tenant.roleKey.trim()||!Array.isArray(caps)||caps.some(cap=>typeof cap!=='string')||!Number.isFinite(Date.parse(auth.expiresAt))||Date.parse(auth.expiresAt)<=Date.now())throw Object.assign(Error('La sesión cambió. Volvé a abrir la consulta con tu acceso vigente.'),{code:'ACTOR_CHANGED',status:401});
 // Session identity retires an old live view. The logical account only locates
 // an in-memory recovery candidate; the fresh SQL scope must still match it.
 const account=[auth.sessionVersion,email.toLowerCase().trim(),tenant.id.toLowerCase(),tenant.roleKey];
 return{actor:JSON.stringify([auth.sessionVersion,auth.user.id.toLowerCase(),...account.slice(1)]),contextActor:JSON.stringify(account),caps:[...caps]};
}
