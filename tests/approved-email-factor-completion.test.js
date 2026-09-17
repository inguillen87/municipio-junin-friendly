// Unit tests only. Database clients are mocks and never connect to a server.
import test from 'node:test';import assert from 'node:assert/strict';
import {completeApprovedEmailFactor,completionKey} from '../scripts/complete-approved-email-factor.mjs';
import {identitySecrets} from '../lib/internal-identity-crypto.js';
import {emailMfaFactorProvisionMaterial} from '../scripts/provision-email-mfa-factor.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const env=()=>({MC_EMAIL_FACTOR_PROVISION_EVENT:'10',MC_EMAIL_FACTOR_PROVISION_BRANCH:'br-test-fixture',
 VERCEL_ENV:'production',CANONICAL_PRODUCTION_BRANCH_ID:'br-test-fixture',CANONICAL_PRODUCTION_HOST:'ep-test.example.neon.tech',CANONICAL_PRODUCTION_DATABASE:'neondb',
 DATABASE_URL_UNPOOLED:'postgresql://ep-test.example.neon.tech/neondb',
 IDENTITY_TOKEN_PEPPER:'t'.repeat(40),INTERNAL_SESSION_SECRET:'s'.repeat(40),IDENTITY_MFA_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64url'),
 IDENTITY_EMAIL_MFA_PEPPER:'e'.repeat(40),IDENTITY_EMAIL_MFA_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64url'),RESEND_API_KEY:'synthetic-not-used',IDENTITY_MFA_FROM:'service@example.invalid'});
const plan=()=>({id:'10',actor_user_email:'owner@example.invalid',tenant_id:uid,membership_id:uid,idempotency_key:uid,
 owner_authorized:true,owner_active:true,database_owner:true,result:{executionChannel:'authorized_dba_maintenance',profile:'MUNICIPIO_ADMIN_OPERATIVO',
 accountEmail:'operator@example.invalid',mfaDestinationRequested:'review@example.invalid',accountActive:false,mfaConfigured:false,employmentLinked:false,configuredRoleCapabilityCount:85}});
function mock(options={}){
 const calls=[],p={...plan(),...options.plan},state={active:false,auth_mode:'managed',identity_version:1,status:'invited',version:1,
 role_key:'MUNICIPIO_ADMIN_OPERATIVO',password_ready:true,tenant_active:true,capabilities:85,platform_roles:0,employment_links:0,...options.state};
 const client={connect:async()=>calls.push('CONNECT'),end:async()=>calls.push('END'),query:async(sql,args=[])=>{
  calls.push({sql,args});if(sql===options.failAt)throw Error('synthetic failure');
  if(sql.includes('SELECT e.id::text'))return{rows:options.noPlan?[]:[p]};
  if(sql.includes('SELECT u.active'))return{rows:[state]};
  if(sql.startsWith('SELECT id::text,result'))return{rows:options.replay?[{id:'99',result:{}}]:[]};
  if(sql.startsWith('SELECT id,status,destination'))return{rows:options.factors||[]};
  if(sql.includes('AS result')&&sql.includes('tenant_identity_provision_email_factor_v1'))return{rows:[{result:{id:uid,status:'pending',version:1,replayed:false,...options.factor}}]};
  if(sql.includes('AS matching'))return{rows:[{matching:options.matching??1}]};
  if(sql.startsWith('INSERT INTO public.tenant_iam_event'))return{rows:[{id:'99'}]};
  return{rows:[],rowCount:1};}};
 return{calls,makeClient:()=>client};
}
const run=(m,e=env())=>completeApprovedEmailFactor({env:e,makeClient:m.makeClient});
const sqls=m=>m.calls.filter(x=>typeof x==='object').map(x=>x.sql);
test('ordinary builds skip without reading credentials or connecting',async()=>{const m=mock();assert.deepEqual(await run(m,{}),{skipped:true});assert.deepEqual(m.calls,[]);});
for(const patch of [{VERCEL_ENV:'preview'},{VERCEL_ENV:'development'},{MC_EMAIL_FACTOR_PROVISION_EVENT:'10 OR 1=1'},{MC_EMAIL_FACTOR_PROVISION_BRANCH:'br-wrong'},{IDENTITY_EMAIL_MFA_PEPPER:''}])test('invalid environment fails before database access '+Object.keys(patch),async()=>{const m=mock();await assert.rejects(run(m,{...env(),...patch}));assert.deepEqual(m.calls,[]);});
test('completion is transactional and never marks the mailbox verified',async()=>{const m=mock();const result=await run(m);assert.equal(result.ok,true);assert.equal(result.accountActive,true);assert.equal(result.factorStatus,'pending');assert.equal(result.otpSent,false);const commands=sqls(m);assert.ok(commands.includes('COMMIT'));assert.ok(!commands.includes('ROLLBACK'));assert.ok(commands.some(x=>x.includes('tenant_iam_assert_no_sod_conflict')));assert.ok(commands.every(x=>!x.includes('operator@example.invalid')));assert.ok(!commands.some(x=>/UPDATE.*password|SET status=.verified|INSERT INTO public.internal_users|INSERT INTO public.tenant_action_employment_link/.test(x)));const record=m.calls.find(x=>x.sql?.startsWith('INSERT INTO public.tenant_iam_event'));assert.equal(JSON.parse(record.args[6]).mailboxPossessionVerified,false);});
for(const patch of [{owner_authorized:false},{owner_active:false},{database_owner:false}])test('owner authority cannot be forged '+Object.keys(patch),async()=>{const m=mock({plan:patch});await assert.rejects(run(m));assert.ok(sqls(m).includes('ROLLBACK'));assert.ok(!sqls(m).some(x=>x.startsWith('UPDATE')));});
for(const patch of [{role_key:'PLATFORM_OWNER'},{platform_roles:1},{employment_links:1},{password_ready:false},{tenant_active:false},{capabilities:86},{version:2},{identity_version:2},{active:true},{status:'active'}])test('changed account stops without overwriting '+Object.keys(patch),async()=>{const m=mock({state:patch});await assert.rejects(run(m));assert.ok(sqls(m).includes('ROLLBACK'));assert.ok(!sqls(m).some(x=>x.startsWith('UPDATE')));});
test('existing factor is not revoked or replaced',async()=>{const m=mock({factors:[{id:uid,status:'pending'}]});await assert.rejects(run(m));assert.ok(!sqls(m).some(x=>x.startsWith('UPDATE')));});
test('unverified provision failure rolls back activation',async()=>{const m=mock({factor:{status:'verified'}});await assert.rejects(run(m));assert.ok(sqls(m).includes('ROLLBACK'));assert.ok(!sqls(m).includes('COMMIT'));});
test('postcondition mismatch rolls back every change',async()=>{const m=mock({matching:0});await assert.rejects(run(m));assert.ok(sqls(m).includes('ROLLBACK'));assert.ok(!sqls(m).includes('COMMIT'));});
test('replay preserves a verified factor and creates no new event',async()=>{const p=plan(),key=completionKey(p.idempotency_key),material=emailMfaFactorProvisionMaterial({userEmail:p.result.accountEmail,destinationEmail:p.result.mfaDestinationRequested,reason:'Complete owner-approved account event 10',suppliedIdempotencyKey:key},identitySecrets(env()));const m=mock({replay:true,state:{active:true,status:'active',version:2,identity_version:2},factors:[{id:uid,status:'verified',destination_hash:material.destinationHash,destination_ciphertext:material.destinationCiphertext}]});const result=await run(m);assert.equal(result.replayed,true);assert.equal(result.factorStatus,'verified');assert.ok(!sqls(m).some(x=>/^(UPDATE|INSERT)/.test(x)));});
test('completion key is deterministic and distinct from approval key',()=>{assert.equal(completionKey(uid),completionKey(uid));assert.notEqual(completionKey(uid),uid);assert.match(completionKey(uid),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab]/);});
