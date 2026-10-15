import test from 'node:test';import assert from 'node:assert/strict';
import {assertOwnerAdoptionAccess,ownerAdoptionAuthorityFromDatabase} from '../lib/internal-municipal-owner-decision-authority.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),now=Date.parse('2026-10-15T12:00:00Z');
function fixture(){
 const session={id:id(1),email:'operador@example.invalid',version:3,releaseSha:'a'.repeat(40)};
 const access={mode:'managed',session:{id:session.id,email:session.email,version:3},principal:{authorized:true,user:{email:session.email,identityVersion:4},platform:{roles:['PLATFORM_OWNER'],capabilities:['platform.tenants.manage']},session:{id:session.id,version:3,mfa:true,authLevel:'mfa',expiresAt:'2026-10-15T13:00:00Z'},tenant:{id:id(2),membershipId:id(3),source:'membership',dataPlaneReady:true,certifiedReleaseSha:session.releaseSha,effectiveCapabilities:['workforce.employee.read','employee.record.propose'],sourceBindings:[{system:'GRH',database:'synthetic',companyId:101,verified:true}]}}};
 const policy={version:'tenant-owner-adoption-policy.v1',sha256:'b'.repeat(64)};
 const resolved={scope:{tenantId:id(2),membershipId:id(3),bindingId:id(4),companyId:101},authority:{version:'municipal-adoption-owner-authority.v1',policyVersion:policy.version,policySha256:policy.sha256,actor:{personId:id(5),email:session.email,identityVersion:4,sessionId:session.id,sessionVersion:3,releaseSha:session.releaseSha}}};
 return{access,session,policy,resolved};
}
test('owner authority preserves the real account version and resolved municipal person without creating an account UUID',()=>{
 const f=fixture(),before=structuredClone(f);const result=ownerAdoptionAuthorityFromDatabase(f.access,f.session,f.resolved,f.policy,{now});
 assert.deepEqual(result,f.resolved);assert.ok(Object.isFrozen(result.authority.actor));assert.deepEqual(f,before);assert.notEqual(result,f.resolved);assert.equal(Object.hasOwn(result.authority.actor,'accountId'),false);
});
test('verified current recovery MFA is also accepted, without changing the signed cookie',()=>{
 const f=fixture();f.access.principal.session.authLevel='recovery';assertOwnerAdoptionAccess(f.access,f.session,{now});assert.equal(Object.hasOwn(f.access.session,'mfa'),false);
});
const accessChanges={
 legacy:f=>f.access.mode='legacy',unauthorized:f=>f.access.principal.authorized=false,
 tenantRoleOnly:f=>f.access.principal.platform.roles=['PLATFORM_OWNER_OPERATIVO_INTEGRAL'],noGlobalCapability:f=>f.access.principal.platform.capabilities=[],
 globalContextOnly:f=>f.access.principal.tenant=null,legacyMembership:f=>f.access.principal.tenant.source='legacy_explicit',
 missingPrepare:f=>f.access.principal.tenant.effectiveCapabilities=['workforce.employee.read'],missingRead:f=>f.access.principal.tenant.effectiveCapabilities=['employee.record.propose'],
 unreadyPlane:f=>f.access.principal.tenant.dataPlaneReady=false,changedRelease:f=>f.session.releaseSha='c'.repeat(40),
 passwordOnly:f=>{f.access.principal.session.authLevel='password';f.access.principal.session.mfa=false;},cookieClaimOnly:f=>{f.access.session.mfa=true;f.access.session.authLevel='mfa';f.access.principal.session.mfa=false;},
 expired:f=>f.access.principal.session.expiresAt='2026-10-15T12:00:00Z',invalidExpiry:f=>f.access.principal.session.expiresAt='invalid',
 changedSession:f=>f.access.principal.session.id=id(9),changedVersion:f=>f.access.principal.session.version=4,
 changedEmail:f=>f.access.principal.user.email='otra@example.invalid',changedMutationSession:f=>f.session.id=id(10),
 noIdentityVersion:f=>delete f.access.principal.user.identityVersion,zeroIdentityVersion:f=>f.access.principal.user.identityVersion=0,
};
for(const [name,change]of Object.entries(accessChanges))test('authority refuses '+name+' before using any resolved write authority',()=>{const f=fixture();change(f);assert.throws(()=>ownerAdoptionAuthorityFromDatabase(f.access,f.session,f.resolved,f.policy,{now}),{code:'OWNER_ADOPTION_AUTHORITY_REQUIRED'});});
const resolvedChanges={
 tenant:f=>f.resolved.scope.tenantId=id(9),membership:f=>f.resolved.scope.membershipId=id(9),binding:f=>f.resolved.scope.bindingId='00000000-0000-0000-0000-000000000000',company:f=>f.resolved.scope.companyId=102,
 unverifiedSource:f=>f.access.principal.tenant.sourceBindings[0].verified=false,policyHash:f=>f.resolved.authority.policySha256='d'.repeat(64),policyVersion:f=>f.resolved.authority.policyVersion='other.v1',
 person:f=>f.resolved.authority.actor.personId='not-a-person',email:f=>f.resolved.authority.actor.email='otra@example.invalid',identityVersion:f=>f.resolved.authority.actor.identityVersion=5,
 session:f=>f.resolved.authority.actor.sessionId=id(8),sessionVersion:f=>f.resolved.authority.actor.sessionVersion=6,release:f=>f.resolved.authority.actor.releaseSha='e'.repeat(40),
 clientOwnerFlag:f=>f.resolved.isOwner=true,fakeAccount:f=>f.resolved.authority.actor.accountId=id(99),clientScopeFlag:f=>f.resolved.scope.authorized=true,
 extraPolicyFlag:f=>f.policy.authorized=true,
};
for(const[name,change]of Object.entries(resolvedChanges))test('resolved owner authority rejects '+name+' mismatch without promoting client claims',()=>{const f=fixture();change(f);assert.throws(()=>ownerAdoptionAuthorityFromDatabase(f.access,f.session,f.resolved,f.policy,{now}),{code:'OWNER_ADOPTION_AUTHORITY_REQUIRED'});});
