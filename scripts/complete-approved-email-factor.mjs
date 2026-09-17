// Production-only completion of one owner-approved, already-created account.
// Runs with server-side secrets. No secret export, new API, user creation or MFA bypass.
import {Client} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
import {identitySecrets,decryptEmailMfaDestination} from '../lib/internal-identity-crypto.js';
import {emailMfaFactorProvisionMaterial} from './provision-email-mfa-factor.mjs';
import {resolveCanonicalDatabaseTarget} from './lib/canonical-import.mjs';
const COMMAND='complete_approved_email_factor';
const requireState=(condition,code)=>{if(!condition)throw Object.assign(new Error(code),{safeCode:code});};
export function completionKey(value){const b=createHash('sha256').update('complete-approved-email-factor:v1:'+value).digest().subarray(0,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export async function completeApprovedEmailFactor({env=process.env,makeClient=url=>new Client({connectionString:url})}={}){
 const eventId=env.MC_EMAIL_FACTOR_PROVISION_EVENT;
 if(!eventId)return {skipped:true};
 requireState(/^[1-9][0-9]{0,14}$/.test(eventId),'INVALID_APPROVED_EVENT');
 requireState(env.VERCEL_ENV==='production','PRODUCTION_EXECUTION_REQUIRED');
 requireState(/^br-[a-z0-9-]+$/.test(env.MC_EMAIL_FACTOR_PROVISION_BRANCH||''),'CONFIRMED_BRANCH_REQUIRED');
 const target=resolveCanonicalDatabaseTarget(['node','provision','--confirm-production-branch='+env.MC_EMAIL_FACTOR_PROVISION_BRANCH],env);
 requireState(target.mode==='production','PRODUCTION_TARGET_REQUIRED');
 const secrets=identitySecrets(env);
 requireState(Boolean(secrets.emailMfaEncryptionKey&&secrets.emailMfaPepper),'EMAIL_MFA_SECRETS_REQUIRED');
 requireState(Boolean(env.RESEND_API_KEY&&(env.IDENTITY_MFA_FROM||env.IDENTITY_INVITATION_FROM)),'RESEND_CONFIG_REQUIRED');
 const client=makeClient(target.databaseUrl);let begun=false;
 const first=async(sql,values=[])=>{const r=await client.query(sql,values);return r.rows?.[0];};
 await client.connect();
 try{
  await client.query('BEGIN');begun=true;
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('approved-email-factor:'||$1::text,0))",[eventId]);
  const plan=await first(`SELECT e.id::text,e.actor_user_email,e.tenant_id,e.membership_id,e.idempotency_key,e.result,
   public.tenant_iam_is_platform_owner(e.actor_user_email) AS owner_authorized,
   (SELECT active FROM public.internal_users WHERE email=e.actor_user_email) AS owner_active,
   (SELECT p.proowner=current_user::regrole::oid FROM pg_proc p WHERE p.oid='public.tenant_identity_provision_email_factor_v1(text,text,text,text,uuid)'::regprocedure) AS database_owner
   FROM public.tenant_iam_event e WHERE e.id=$1::bigint AND e.command='prepare_municipal_account'`,[eventId]);
  requireState(plan?.owner_authorized===true&&plan.owner_active===true&&plan.database_owner===true,'AUTHORIZED_OWNER_REQUIRED');
  const input=plan.result;
  requireState(input?.executionChannel==='authorized_dba_maintenance'&&input.profile==='MUNICIPIO_ADMIN_OPERATIVO'&&input.accountActive===false&&input.mfaConfigured===false&&input.employmentLinked===false&&input.configuredRoleCapabilityCount===85,'APPROVED_PLAN_REQUIRED');
  requireState(typeof input.accountEmail==='string'&&/^[^\s@]+@[^\s@]+$/.test(input.accountEmail)&&typeof input.mfaDestinationRequested==='string'&&/^[^\s@]+@[^\s@]+$/.test(input.mfaDestinationRequested),'VALID_APPROVED_DESTINATION_REQUIRED');
  const key=completionKey(plan.idempotency_key);
  const material=emailMfaFactorProvisionMaterial({userEmail:input.accountEmail,destinationEmail:input.mfaDestinationRequested,
   reason:'Complete owner-approved account event '+eventId,suppliedIdempotencyKey:key},secrets);
  requireState(decryptEmailMfaDestination(material.destinationCiphertext,secrets.emailMfaEncryptionKey)===input.mfaDestinationRequested,'DESTINATION_ROUNDTRIP_FAILED');
  const state=await first(`SELECT u.active,u.auth_mode,u.identity_version,m.status,m.version,m.role_key,
   EXISTS(SELECT 1 FROM public.tenant_identity_password_credential p WHERE p.user_email=u.email) AS password_ready,
   EXISTS(SELECT 1 FROM public.platform_tenant t WHERE t.id=m.tenant_id AND t.status='active') AS tenant_active,
   (SELECT count(*)::int FROM public.iam_role_capability WHERE role_key=m.role_key) AS capabilities,
   (SELECT count(*)::int FROM public.platform_user_role WHERE user_email=u.email AND active) AS platform_roles,
   (SELECT count(*)::int FROM public.tenant_action_employment_link WHERE membership_id=m.id AND active) AS employment_links
   FROM public.internal_users u JOIN public.tenant_membership m ON m.user_email=u.email
   WHERE u.email=$1 AND m.id=$2::uuid AND m.tenant_id=$3::uuid FOR UPDATE OF u,m`,[input.accountEmail,plan.membership_id,plan.tenant_id]);
  requireState(state?.auth_mode==='managed'&&state.password_ready&&state.tenant_active&&state.role_key===input.profile&&state.capabilities===85&&state.platform_roles===0&&state.employment_links===0,'ACCOUNT_SCOPE_CHANGED');
  const prior=await first('SELECT id::text,result FROM public.tenant_iam_event WHERE actor_user_email=$1 AND idempotency_key=$2::uuid AND command=$3',[plan.actor_user_email,key,COMMAND]);
  const factors=(await client.query(`SELECT id,status,destination_ciphertext,destination_hash FROM public.tenant_identity_email_factor WHERE user_email=$1 AND status IN ('pending','verified') FOR UPDATE`,[input.accountEmail])).rows;
  if(prior){requireState(state.active===true&&state.status==='active'&&factors.length===1&&factors[0].destination_hash===material.destinationHash&&decryptEmailMfaDestination(factors[0].destination_ciphertext,secrets.emailMfaEncryptionKey)===input.mfaDestinationRequested,'REPLAY_STATE_CHANGED');await client.query('COMMIT');begun=false;return {ok:true,replayed:true,sourceEvent:eventId,auditId:prior.id,factorStatus:factors[0].status};}
  requireState(state.active===false&&state.status==='invited'&&state.version===1&&state.identity_version===1&&factors.length===0,'ACCOUNT_ALREADY_CHANGED');
  await client.query('UPDATE public.internal_users SET active=true,identity_version=identity_version+1,updated_at=now() WHERE email=$1',[input.accountEmail]);
  const factor=(await first('SELECT public.tenant_identity_provision_email_factor_v1($1,$2,$3,$4,$5::uuid) AS result',
   [material.userEmail,material.destinationCiphertext,material.destinationHash,material.reasonHash,key]))?.result;
  requireState(factor?.status==='pending'&&factor.version===1&&factor.replayed===false,'FACTOR_NOT_PROVISIONED');
  await client.query("UPDATE public.tenant_membership SET status='active',activated_at=now(),version=version+1,updated_at=now() WHERE id=$1::uuid",[plan.membership_id]);
  await client.query('SELECT public.tenant_iam_assert_no_sod_conflict($1::uuid)',[plan.membership_id]);
  await client.query('UPDATE public.tenant_action_authority SET version=version+1,updated_at=now() WHERE membership_id=$1::uuid',[plan.membership_id]);
  const verified=await first(`SELECT count(*)::int AS matching FROM public.tenant_identity_email_factor f
   JOIN public.internal_users u ON u.email=f.user_email JOIN public.tenant_membership m ON m.user_email=u.email
   WHERE f.id=$1::uuid AND f.destination_hash=$2 AND f.status='pending' AND f.verified_at IS NULL AND u.active AND m.id=$3::uuid AND m.status='active'`,[factor.id,material.destinationHash,plan.membership_id]);
  requireState(verified?.matching===1,'ACTIVATION_VERIFY_FAILED');
  const record={executionChannel:'owner_approved_production_provisioning',sourceApprovalEvent:eventId,
   buildCommit:env.VERCEL_GIT_COMMIT_SHA||null,accountActive:true,membershipStatus:'active',emailFactorStatus:'pending',
   mailboxPossessionVerified:false,configuredRoleCapabilityCount:85,roleChanged:false,employmentLinked:false,
   platformPrivilegesGranted:false,passwordChanged:false,otherAccountsChanged:false,secretsExported:false,otpSent:false};
  const audit=await first(`INSERT INTO public.tenant_iam_event(actor_user_email,tenant_id,membership_id,command,target_type,target_id,idempotency_key,command_hash,result)
   VALUES($1,$2::uuid,$3::uuid,$4,'tenant_membership',$3::text,$5::uuid,$6,$7::jsonb) RETURNING id::text`,
   [plan.actor_user_email,plan.tenant_id,plan.membership_id,COMMAND,key,createHash('sha256').update(eventId+':'+material.destinationHash).digest('hex'),JSON.stringify(record)]);
  await client.query('COMMIT');begun=false;
  return {ok:true,replayed:false,sourceEvent:eventId,auditId:audit.id,factorStatus:'pending',accountActive:true,otpSent:false};
 }catch(error){if(begun)await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{await client.end().catch(()=>{});}
}
export async function approvedEmailFactorBuildStep(){
 try{const result=await completeApprovedEmailFactor();if(!result.skipped)console.log(JSON.stringify({operation:COMMAND,...result}));}
 catch(error){console.error(JSON.stringify({operation:COMMAND,ok:false,code:error.safeCode||'PROVISIONING_FAILED',databaseCode:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:null}));throw new Error('Approved email factor provisioning did not complete; see sanitized status.');}
}
