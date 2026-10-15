// Backend boundary only. This does not authenticate a request, grant a role,
// resolve an identity, execute SQL, or authorize a write by itself.
import {hasEffectivePlatformOwnerAuthority} from './internal-platform-owner-policy.js';
import {employeeContext} from './internal-native-employees.js';
import {OWNER_DECISION_AUTHORITY_VERSION,OWNER_DECISION_POLICY_VERSION} from '../assets/municipal-adoption-owner-decision-model.js';

const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const hash=v=>typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const positive=v=>Number.isSafeInteger(v)&&v>0;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const fail=()=>{throw Object.assign(new Error('La decisión del propietario requiere autoridad municipal y sesión verificadas.'),{code:'OWNER_ADOPTION_AUTHORITY_REQUIRED',status:403});};
export const OWNER_ADOPTION_TENANT_CAPABILITIES=Object.freeze(['workforce.employee.read','employee.record.propose']);

/** access must come from the managed gateway; session from actionMutationSession.
 * The current database session, rather than claims added to a cookie, supplies MFA.
 * SQL must independently recheck all authority at its persistence boundary.
 */
export function assertOwnerAdoptionAccess(access,session,{now=Date.now()}={}){
 const principal=access?.principal,current=principal?.session,signed=access?.session,tenant=principal?.tenant;
 if(access?.mode!=='managed'||!hasEffectivePlatformOwnerAuthority(principal,['platform.tenants.manage'])
  ||tenant?.source!=='membership'||!uuid(tenant.id)||!uuid(tenant.membershipId)||tenant.dataPlaneReady!==true
  ||!Array.isArray(tenant.effectiveCapabilities)||!OWNER_ADOPTION_TENANT_CAPABILITIES.every(c=>tenant.effectiveCapabilities.includes(c))
  ||!positive(principal?.user?.identityVersion)||!Number.isFinite(now)
  ||!uuid(signed?.id)||!uuid(current?.id)||signed.id!==current.id||!positive(signed.version)||current.version!==signed.version
  ||current.mfa!==true||!['mfa','recovery'].includes(current.authLevel)||typeof current.expiresAt!=='string'
  ||!Number.isFinite(Date.parse(current.expiresAt))||Date.parse(current.expiresAt)<=now
  ||typeof signed.email!=='string'||typeof principal?.user?.email!=='string'
  ||signed.email.trim().toLowerCase()!==principal.user.email.trim().toLowerCase()
  ||session?.id!==signed.id||session?.version!==signed.version||session?.email!==signed.email.trim().toLowerCase()
  ||typeof session?.releaseSha!=='string'||session.releaseSha.length!==40||!/^[a-f0-9]{40}$/.test(session.releaseSha)
  ||session.releaseSha!==tenant.certifiedReleaseSha)fail();
 try{return freeze(employeeContext(principal,session));}catch{fail();}
}

/** Validate a read from the future SQL owner-authority resolver against both
 * the current gateway session and the policy pinned by trusted server code.
 * Never call this with a request body in place of resolved. A client flag is
 * not a substitute for that database resolver or its transaction-time checks.
 */
export function ownerAdoptionAuthorityFromDatabase(access,session,resolved,policy,options){
 const context=assertOwnerAdoptionAccess(access,session,options),principal=access.principal;
 if(!exact(policy,['version','sha256'])||policy.version!==OWNER_DECISION_POLICY_VERSION||!hash(policy.sha256)
  ||!exact(resolved,['scope','authority']))fail();
 const {scope,authority}=resolved;
 if(!exact(scope,['tenantId','membershipId','bindingId','companyId'])||scope.tenantId!==context.tenantId||scope.membershipId!==context.membershipId
  ||!uuid(scope.bindingId)||!positive(scope.companyId)
  ||!Array.isArray(principal.tenant.sourceBindings)||!principal.tenant.sourceBindings.some(b=>b.verified===true&&b.companyId===scope.companyId)
  ||!exact(authority,['version','policyVersion','policySha256','actor'])||authority.version!==OWNER_DECISION_AUTHORITY_VERSION
  ||authority.policyVersion!==policy.version||authority.policySha256!==policy.sha256)fail();
 const actor=authority.actor;
 if(!exact(actor,['personId','email','identityVersion','sessionId','sessionVersion','releaseSha'])||!uuid(actor.personId)
  ||actor.email!==context.actorEmail||actor.identityVersion!==principal.user.identityVersion
  ||actor.sessionId!==context.actorSessionId||actor.sessionVersion!==context.actorSessionVersion||actor.releaseSha!==context.releaseSha)fail();
 return freeze(structuredClone(resolved));
}
