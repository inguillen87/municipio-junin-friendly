// Adoption-only administrative authority. Generates SQL; never connects or adopts.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildOperationalContractAdoptionInstallation} from './operational-contract-adoption-installation.mjs';
import {buildFinalContractAdoptionInstallation} from './final-contract-adoption-installation.mjs';
import {buildParticipationCommandGuardInstallation} from './own-participation-command-guard-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ADOPTION_ADMINISTRATIVE_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const prefix='municontrol_adoption_administrative.';
export const ADOPTION_ADMINISTRATIVE_CONTEXT=`CREATE FUNCTION public.employment_adoption_administrative_context_v1(p jsonb,required_capability text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;person_value uuid;actor_label text;linked uuid;proof jsonb;
BEGIN
 -- The six-field session context is verified by the existing guard. The caller
 -- supplies neither an audit person nor an employment contract identifier.
 ctx:=public.native_employee_context_v1(p);
 IF required_capability IS NOT NULL AND (required_capability NOT IN('employee.record.propose','employee.record.approve')
 OR NOT public.action_center_context_has_capability(ctx,required_capability)) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_FORBIDDEN';END IF;
 IF NOT (public.action_center_context_has_capability(ctx,'employee.record.propose') OR public.action_center_context_has_capability(ctx,'employee.record.approve')) THEN
  RETURN ctx||jsonb_build_object('actorPersonId',NULL,'adoptionActorVerified',false,'actorEmail',lower(btrim(p->>'actorEmail')));
 END IF;
 BEGIN
  SELECT i.id,i.full_name INTO STRICT person_value,actor_label
  FROM public.tenant_action_employment_link l
  JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='GRH' AND c.status IN('active','inactive') AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  JOIN public.source_import_batch b ON b.id=c.source_batch_id AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL
  JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
  WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
  FOR SHARE OF l,c,b,i NOWAIT;
 EXCEPTION WHEN NO_DATA_FOUND THEN NULL;WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDENTITY_CHANGED';END;
 IF person_value IS NULL THEN
  BEGIN
   SELECT c.id,i.id,i.full_name INTO STRICT linked,person_value,actor_label
   FROM public.tenant_action_employment_link l
   JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   JOIN public.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=l.tenant_id AND n.source_binding_id=l.source_binding_id AND n.id::text=c.source_payload#>>'{native,registrationId}'
   JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
   WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
   FOR SHARE OF l,c,n,i NOWAIT;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDENTITY_CHANGED';END;
  IF person_value IS NOT NULL THEN
   proof:=public.native_employee_read_projection_v1(p,linked);
   IF proof#>>'{contract,personId}' IS DISTINCT FROM person_value::text OR proof#>>'{contract,status}' NOT IN('active','inactive') OR proof#>>'{contract,status}' IS NULL THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDENTITY_CHANGED';END IF;
  END IF;
 END IF;
 IF required_capability IS NOT NULL AND person_value IS NULL THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_ACTOR_REQUIRED';END IF;
 -- Administrative identity is an audit fact, not an active employment. The
 -- general employee context, its identifiers and all employment guards remain.
 RETURN ctx||jsonb_build_object('actorPersonId',person_value,'adoptionActorVerified',person_value IS NOT NULL,'actorEmail',lower(btrim(p->>'actorEmail')),
 'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY';END $$`;

export function buildAdoptionAdministrativeIdentityInstallation(options){
 assert.equal(typeof options.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes={},read=p=>{const s=options.read(p).replace(/\r\n?/g,'\n');sourceHashes[p]=createHash('sha256').update(s).digest('hex');return s;};
 const opts={...options,read},operative=buildOperationalContractAdoptionInstallation(opts),final=buildFinalContractAdoptionInstallation(opts),commands=buildParticipationCommandGuardInstallation(opts);
 const find=(defs,name)=>{const rows=defs.filter(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.equal(rows.length,1,'ADOPTION_ADMINISTRATIVE_SOURCE_MISSING:'+name);return rows[0].replace('CREATE OR REPLACE FUNCTION ','CREATE FUNCTION ');};
 const source=p=>splitPostgresStatements(read('scripts/migrations/'+p)).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));
 const bootstrap=find(final.inactive.afterDefinitions,'employment_adoption_bootstrap_v1');
 const attempt=find(final.afterDefinitions,'employment_adoption_attempt_v1');
 const context=find(source('133-employment-adoption-application.sql'),'employment_adoption_context_v1');
 const propose=find(operative.afterDefinitions,'employment_adoption_propose_v1'),ready=operative.afterDefinitions.at(-1);
 const originals=[bootstrap,attempt,context,propose,ready];
 const changed=[
  once(once(bootstrap,'ctx:=public.native_employee_context_v1(p);','ctx:=public.employment_adoption_administrative_context_v1(p);'),"ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL","ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'adoptionActorVerified')::boolean,false)"),
  once(attempt,'ctx:=public.native_employment_lifecycle_adopted_context_v2(p);','ctx:=public.employment_adoption_administrative_context_v1(p);'),
  context.slice(0,context.indexOf('AS $$')+5)+"\nBEGIN RETURN public.employment_adoption_administrative_context_v1(p,'employee.record.approve');END $$",
  (()=>{const a="public.native_employment_change_context_v1(p,'employee.record.propose')";assert.equal(propose.split(a).length,3);return propose.replaceAll(a,"public.employment_adoption_administrative_context_v1(p,'employee.record.propose')");})()
 ];
 const runtime=new Set(['employment_adoption_bootstrap_v1','employment_adoption_attempt_v1','employment_adoption_propose_v1']);
 const pin=d=>({...ownInstallationFunctionPin(d),runtime:runtime.has(ownInstallationFunctionPin(d).name)}),beforePins=originals.map(pin),helperPin=pin(ADOPTION_ADMINISTRATIVE_CONTEXT);
 const changedPins=changed.map(pin),replace=s=>beforePins.slice(0,4).reduce((v,p,n)=>v.replaceAll(p.sha256,changedPins[n].sha256),s);
 for(const p of beforePins.slice(0,4))assert.ok(ready.includes(p.sha256),'ADOPTION_ADMINISTRATIVE_READY_PIN_MISSING:'+p.name);
 changed.push(once(replace(ready),' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck([helperPin],'ADOPTION_ADMINISTRATIVE_HELPER_METADATA'))+';'));
 const afterPins=changed.map(pin);beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 // These two command guards were separately installed after the operational lot.
 // Compose only their known canonical pins; none of their bodies are changed.
 let publishedCheck=operative.afterCheck;
 for(const p of commands.pairs)publishedCheck=publishedCheck.replaceAll(p.beforePin.sha256,p.afterPin.sha256);
 const unchangedCommands=pinsCheck(commands.pairs.map(p=>p.afterPin),'ADOPTION_ADMINISTRATIVE_COMMANDS_CHANGED');
 const beforeCheck=publishedCheck+';'+pinsCheck(beforePins,'ADOPTION_ADMINISTRATIVE_BEFORE_METADATA')+';'+unchangedCommands;
 const afterCheck=replace(publishedCheck).replaceAll(beforePins.at(-1).sha256,afterPins.at(-1).sha256)+';'+pinsCheck([...afterPins,helperPin],'ADOPTION_ADMINISTRATIVE_AFTER_METADATA')+';'+unchangedCommands;
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTION_ADMINISTRATIVE_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(163);PERFORM set_config('${prefix}mode',CASE WHEN to_regprocedure(${q(helperPin.signature)}) IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$`;
 const check=`DO $check$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $check$`;
 const mutations=[ADOPTION_ADMINISTRATIVE_CONTEXT,`REVOKE ALL ON FUNCTION ${helperPin.signature} FROM PUBLIC,municontrol_actions_runtime_app`,...changed.map(s=>s.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid IS DISTINCT FROM to_regprocedure('+q(helperPin.signature)+')');
  s=once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
  return s.replaceAll('municontrol_sql111.',prefix);
 };
 const before=snapshot('before'),after=snapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ADOPTION_ADMINISTRATIVE_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 read('scripts/lib/adoption-administrative-identity-installation.mjs');
 const runtimeCheck='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const proof=modeValue=>`SELECT jsonb_build_object('version','adoption-administrative-identity-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${modeValue},'newTables',0,'newFunctions',1,'adaptedFunctions',5,'associationWrites',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{operative,final,commands,sourceHashes,originals,changed,beforePins,afterPins,helperPin,beforeCheck,afterCheck,mode,check,mutations,apply,before,after,audit,runtimeCheck,statements:[mode,check,before,apply,afterCheck,runtimeCheck,after,audit,proof("current_setting('"+prefix+"mode')")],verification:[afterCheck,runtimeCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
