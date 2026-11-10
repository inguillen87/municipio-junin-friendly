// Casos de Root (IAM_ADMIN_R9_BACKEND/qa/rbac-admin.test.mjs) sobre lib/internal-rbac.js integrado; sobres sintéticos, sin sesión ni base.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tenantActionPrincipalFromFacade,publicPrincipal} from '../lib/internal-rbac.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const email='operator@example.invalid';
const base={email,tenantId:id(1),membershipId:id(2),sourceBindingId:id(3),sourceCompanyId:101,
 roleKey:'QA_ADMIN',capabilities:['actions.read','time.overtime.read','time.overtime.approve'],
 areaScopes:[],employmentContractId:null,actorPersonId:null};
const identity={user:{email},tenant:{id:id(1),membershipId:id(2),source:'membership'}};
const resolve=o=>publicPrincipal(tenantActionPrincipalFromFacade({...base,...o},identity));
test('administrative identity exposes only the existing grants and never fabricates employment',()=>{
 const out=resolve({overtimeActorAuthority:{schema:'overtime-actor-authority.v1',verified:true,kind:'administrative'}});
 assert.deepEqual(out.capabilities,[...base.capabilities].sort());assert.equal(out.hasEmployeeLink,false);
 assert.equal(out.overtimeActorKind,'administrative');assert.ok(!Object.hasOwn(out,'overtimeReadBlock'));
 assert.ok(!out.capabilities.includes('time.overtime.enter'));
 assert.ok(!JSON.stringify(out).includes(id(2)));assert.ok(!JSON.stringify(out).includes(id(3)));
});
test('verified employment remains distinct from an administrative actor',()=>{
 const out=resolve({employmentContractId:id(4),actorPersonId:id(5),
 overtimeActorAuthority:{schema:'overtime-actor-authority.v1',verified:true,kind:'employment'}});
 assert.equal(out.hasEmployeeLink,true);assert.equal(out.overtimeActorKind,'employment');
 assert.deepEqual(out.capabilities,[...base.capabilities].sort());
});
test('unknown or explicitly invalid authority fails closed even with old actor coordinates',()=>{
 for(const authority of [null,{},[],{schema:'future',verified:true,kind:'administrative'},
 {schema:'overtime-actor-authority.v1',verified:false,kind:'administrative'},
 {schema:'overtime-actor-authority.v1',verified:true,kind:'unknown'}]){
 const out=resolve({employmentContractId:id(4),actorPersonId:id(5),overtimeActorAuthority:authority});
 assert.deepEqual(out.capabilities,['actions.read']);assert.equal(out.overtimeReadBlock,'actor_identity_required');
 assert.ok(!Object.hasOwn(out,'overtimeActorKind'));
 }
});
test('authority does not grant missing read or permit entry',()=>{
 const out=resolve({capabilities:['actions.read','time.overtime.approve','time.overtime.enter'],
 overtimeActorAuthority:{schema:'overtime-actor-authority.v1',verified:true,kind:'administrative'}});
 assert.deepEqual(out.capabilities,['actions.read']);assert.ok(!Object.hasOwn(out,'overtimeReadBlock'));
});
test('legacy publication remains compatible and closed without both actor coordinates',()=>{
 for(const [employmentContractId,actorPersonId] of [[null,null],[id(4),null],[null,id(5)]]){
 const out=resolve({employmentContractId,actorPersonId});assert.deepEqual(out.capabilities,['actions.read']);
 assert.equal(out.overtimeReadBlock,'active_employment_required');}
 const out=resolve({employmentContractId:id(4),actorPersonId:id(5)});
 assert.deepEqual(out.capabilities,[...base.capabilities].sort());
});
test('administrative authority cannot cross a tenant or membership in the adapter',()=>{
 for(const changes of [{tenantId:id(9)},{membershipId:id(9)}]){
 assert.equal(tenantActionPrincipalFromFacade({...base,...changes,
 overtimeActorAuthority:{schema:'overtime-actor-authority.v1',verified:true,kind:'administrative'}},identity),null);}
});
