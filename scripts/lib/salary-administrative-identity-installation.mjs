// Generates a reviewable, source-pinned technical batch; never connects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {buildExactProgramPrecisionInstallation} from './exact-program-precision-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'SALARY_IDENTITY_SOURCE_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const runtime=new Set(['native_salary_bootstrap_v1','native_salary_command_v1','native_salary_attempt_v1','own_program_bootstrap_v1','own_program_command_v1','own_program_attempt_v1']);
const pin=s=>({...ownInstallationFunctionPin(s),runtime:runtime.has(ownInstallationFunctionPin(s).name)});

export const SALARY_ADMINISTRATIVE_CONTEXT=`CREATE FUNCTION public.native_salary_administrative_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;person_value uuid;actor_label text;
BEGIN
 -- The normal authenticated facade validates session, tenant, authority,
 -- release, binding and capabilities. Caller-supplied identity is never used.
 ctx:=public.native_employment_change_context_v1(p);
 IF NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read') THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;
 IF ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL THEN
  RETURN ctx||jsonb_build_object('parameterActorVerified',true);
 END IF;
 BEGIN
  SELECT i.id,i.full_name INTO STRICT person_value,actor_label
  FROM public.tenant_action_employment_link l
  JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  JOIN public.source_import_batch b ON b.id=c.source_batch_id AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL
  JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
  WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
  FOR SHARE OF l,c,b,i;
 EXCEPTION WHEN NO_DATA_FOUND THEN NULL; WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'NATIVE_SALARY_IDENTITY_CHANGED'; END;
 IF person_value IS NULL THEN
  BEGIN
   SELECT i.id,i.full_name INTO STRICT person_value,actor_label
   FROM public.tenant_action_employment_link l
   JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   JOIN public.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=l.tenant_id AND n.source_binding_id=l.source_binding_id AND n.id::text=c.source_payload#>>'{native,registrationId}'
   JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
   WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
   FOR SHARE OF l,c,n,i;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL; WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'NATIVE_SALARY_IDENTITY_CHANGED'; END;
 END IF;
 -- Only the audit person is restored. An inactive contract stays inactive,
 -- and no employment identifier is supplied to downstream business guards.
 RETURN ctx||jsonb_build_object('actorPersonId',person_value,'parameterActorVerified',person_value IS NOT NULL,
  'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
END $$`;

export function buildSalaryAdministrativeIdentityInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const files=['scripts/migrations/112-native-salary-definitions.sql','scripts/migrations/122-own-payroll-programs.sql','scripts/migrations/104-native-employment-changes.sql'];
 const sources=files.map(f=>read(f).replace(/\r\n?/g,'\n'));
 assert.equal(hash(sources[0]),'da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3');
 assert.equal(hash(sources[1]),'edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785');
 const names=new Set(['native_salary_proposal_v1','native_salary_bootstrap_v1','native_salary_command_v1','native_salary_attempt_v1','own_program_proposal_v1','own_program_bootstrap_v1','own_program_command_v1','own_program_attempt_v1']);
 const precision=buildExactProgramPrecisionInstallation({read,sourceCommit});
 const originals=sources.slice(0,2).flatMap(s=>splitPostgresStatements(s)).filter(s=>/^CREATE FUNCTION public\.(\w+)\(/.test(s)&&names.has(/^CREATE FUNCTION public\.(\w+)\(/.exec(s)[1])).map(s=>s.startsWith('CREATE FUNCTION public.own_program_command_v1(')?precision.changed:s);
 assert.equal(originals.length,8);
 const positive="ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL";
 const negative="ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL";
 const changed=originals.map(s=>{
  if(!/^CREATE(?: OR REPLACE)? FUNCTION public\.(native_salary|own_program)_proposal_v1\(/.test(s))s=once(s,'ctx:=public.native_salary_context_v1(p);','ctx:=public.native_salary_administrative_context_v1(p);');
  if(!/^CREATE(?: OR REPLACE)? FUNCTION public\.(native_salary|own_program)_attempt_v1\(/.test(s)){assert.ok(s.includes(positive)||s.includes(negative),'SALARY_IDENTITY_GUARD_MISSING');s=s.replaceAll(positive,"ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'parameterActorVerified')::boolean,false)").replaceAll(negative,"ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)");}
  return s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ');
 });
 assert.ok(changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_program_command_v1(')).includes('OWN_PROGRAM_PRECISION_REQUIRED'));
 const originalContext=splitPostgresStatements(sources[2]).find(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\.native_employment_change_context_v1\(/.test(s));assert.ok(originalContext);
 const context=once(originalContext,'ctx:=public.native_employee_context_v1(p);','ctx:=public.native_employment_lifecycle_adopted_context_v2(p);');
 const prerequisitePin={...ownInstallationFunctionPin(context),runtime:false};
 const beforePins=originals.map(pin),helperPin=pin(SALARY_ADMINISTRATIVE_CONTEXT),afterPins=[...changed.map(pin),helperPin];
 const sharedContextPin=pin(splitPostgresStatements(sources[0]).find(s=>s.startsWith('CREATE FUNCTION public.native_salary_context_v1(')));
 const beforeCheck=pinsCheck([prerequisitePin,sharedContextPin,...beforePins],'SALARY_IDENTITY_PREREQUISITE_CHANGED'),afterCheck=pinsCheck([prerequisitePin,sharedContextPin,...afterPins],'SALARY_IDENTITY_FUNCTION_CHANGED');
 function snapshot(slot){
  let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","AND p.oid IS DISTINCT FROM to_regprocedure('public.native_salary_administrative_context_v1(jsonb)')");
  s=once(s,"public.digest(to_jsonb(p)::text,'sha256')",`public.digest((CASE WHEN p.oid IN(${beforePins.map(p=>q(p.signature)+'::regprocedure').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
  return s.replaceAll('municontrol_sql111.','municontrol_salary_identity.');
 }
 const before=snapshot('before'),after=snapshot('after');
 const mode="DO $mode$ BEGIN PERFORM set_config('municontrol_salary_identity.mode',CASE WHEN to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$";
 const choose=`DO $check$ BEGIN IF current_setting('municontrol_salary_identity.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $check$`;
 const mutations=[SALARY_ADMINISTRATIVE_CONTEXT,'REVOKE ALL ON FUNCTION public.native_salary_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app',...changed];
 const install=`DO $install$ BEGIN IF current_setting('municontrol_salary_identity.mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $install$`;
 const conservation="DO $conservation$ BEGIN IF current_setting('municontrol_salary_identity.before')::jsonb IS DISTINCT FROM current_setting('municontrol_salary_identity.after')::jsonb THEN RAISE EXCEPTION 'SALARY_IDENTITY_CONSERVATION_FAILED';END IF;END $conservation$";
 const proof=`SELECT jsonb_build_object('version','salary-administrative-identity-installation.v1','sourceCommit',${q(sourceCommit)},'mode',current_setting('municontrol_salary_identity.mode'),'newTables',0,'newFunctions',1,'adaptedFunctions',8,'associationWrites',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('municontrol_salary_identity.after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {version:'salary-administrative-identity-installation.v1',sourceCommit,sourceHashes:Object.fromEntries(files.map((f,i)=>[f,hash(sources[i])])),context,originals,changed,mutations,prerequisitePin,beforePins,afterPins,helperPin,beforeCheck,afterCheck,before,after,conservation,proof,statements:[mode,choose,before,install,afterCheck,after,conservation,proof],verification:[afterCheck,after,proof.replace("current_setting('municontrol_salary_identity.mode')","'verify'")],connects:false,executesSql:false};
}
