import test from 'node:test';import assert from 'node:assert/strict';
import {localReviewSession} from '../assets/local-review-session.js';
const now=Date.parse('2026-09-24T02:00:00Z');
const fixture=()=>({ok:true,authenticated:true,sessionVersion:2,expiresAt:'2026-09-24T02:10:00Z',user:{id:'synthetic-user'},access:{tenant:{id:'synthetic-tenant',membershipId:'synthetic-member',roleKey:'synthetic-reader'},tenantCapabilities:['lineage.read']}});
test('valid lineage session binds identity and institution without reading a document',()=>{
 const input=fixture(),before=structuredClone(input);const result=localReviewSession(input,{now});assert.deepEqual(input,before);
 assert.equal(result.expiresAt,now+600000);assert.equal(Object.isFrozen(result),true);
 assert.deepEqual(localReviewSession(input,{now,expectedContext:result.context}),result);
});
for(const [name,status,change]of [
 ['unauthenticated',401,v=>v.authenticated=false],['expired',401,v=>v.expiresAt='2026-09-24T01:59:00Z'],
 ['expiry boundary',401,v=>v.expiresAt='2026-09-24T02:00:00Z'],['invalid expiry',401,v=>v.expiresAt='PRIVATE_VALUE'],
 ['missing lineage permission',403,v=>v.access.tenantCapabilities=['quality.read']],['wrong capability shape',403,v=>v.access.tenantCapabilities='lineage.read'],
 ['wrong session version',401,v=>v.sessionVersion=1],['missing user',401,v=>delete v.user],
 ['empty tenant',401,v=>v.access.tenant.id=''],['invalid role',401,v=>v.access.tenant.roleKey={}],
 ['invalid membership',401,v=>v.access.tenant.membershipId=[]],['oversized user id',401,v=>v.user.id='x'.repeat(257)]
])test('session metadata rejects '+name,()=>{
 const v=fixture();change(v);assert.throws(()=>localReviewSession(v,{now}),e=>e.status===status&&e.message==='LOCAL_REVIEW_SESSION_REQUIRED');
});
for(const change of [v=>v.user.id='other-user',v=>v.access.tenant.id='other-tenant',v=>v.access.tenant.membershipId='other-member',v=>v.access.tenant.roleKey='other-role'])test('context switch is refused even with the same granted capability',()=>{
 const v=fixture(),context=localReviewSession(v,{now}).context;change(v);assert.throws(()=>localReviewSession(v,{now,expectedContext:context}),{status:403});
});
test('session renewal in the same context is accepted without reviving an expired record',()=>{
 const v=fixture(),context=localReviewSession(v,{now}).context;v.expiresAt='2026-09-24T02:20:00Z';assert.equal(localReviewSession(v,{now,expectedContext:context}).expiresAt,now+1200000);
 assert.throws(()=>localReviewSession(v,{now:now+1200001,expectedContext:context}),{status:401});
});
