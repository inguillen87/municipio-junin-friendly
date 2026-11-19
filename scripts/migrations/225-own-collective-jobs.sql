-- Durable, resumable orchestration for the existing working-time and seniority commands.
-- This migration does not replace a canonical reader, writer, IAM guard or audit ledger.
-- The authenticated API owns user commands; step/pending are only for a secret-gated worker.
DO $prerequisites$
BEGIN
 IF to_regclass('public.own_collective_job') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,19)='own_collective_job_')
 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_OBJECT_CONFLICT'; END IF;
 IF to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL
 OR to_regprocedure('public.native_employee_roster_projection_batch_v1(jsonb)') IS NULL
 OR to_regprocedure('public.own_working_time_command_v1(jsonb,jsonb,uuid)') IS NULL
 OR to_regprocedure('public.own_seniority_command_v1(jsonb,jsonb,uuid)') IS NULL
 OR to_regprocedure('public.native_salary_serialized_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_PREREQUISITE'; END IF;
END $prerequisites$;

CREATE TABLE public.own_collective_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,
 actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL,
 actor_label text NOT NULL,
 original_context jsonb NOT NULL,
 execution_context jsonb NOT NULL,
 authorization_pin jsonb NOT NULL,
 family text NOT NULL CHECK(family IN ('working-time','seniority')),
 period text NOT NULL CHECK(period ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'),
 command text NOT NULL CHECK(command IN ('propose','approve','reject')),
 reason text NOT NULL,
 file jsonb NOT NULL CHECK(jsonb_typeof(file)='object' AND octet_length(file::text)<=4194304),
 file_hash text NOT NULL CHECK(file_hash ~ '^[a-f0-9]{64}$'),
 request_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 population_pin text NOT NULL CHECK(population_pin ~ '^[a-f0-9]{64}$'),
 total integer NOT NULL CHECK(total BETWEEN 1 AND 10000),
 phase text NOT NULL CHECK(phase IN ('preparing','prepared','running','paused','complete','cancelled')),
 resume_phase text CHECK(resume_phase IN ('preparing','running')),
 review_hash text CHECK(review_hash IS NULL OR review_hash ~ '^[a-f0-9]{64}$'),
 pause_code text CHECK(pause_code IS NULL OR pause_code ~ '^[A-Z0-9_]{1,100}$'),
 dispatch_generation bigint NOT NULL DEFAULT 1 CHECK(dispatch_generation>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 confirmed_at timestamptz,
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key)
);
CREATE UNIQUE INDEX own_collective_job_one_active_actor
 ON public.own_collective_job(tenant_id,source_binding_id,actor_membership_id,family,period)
 WHERE phase NOT IN ('complete','cancelled');
CREATE INDEX own_collective_job_dispatch ON public.own_collective_job(updated_at,id)
 WHERE phase IN ('preparing','running');

CREATE TABLE public.own_collective_job_item (
 job_id uuid NOT NULL REFERENCES public.own_collective_job(id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 9999),
 contract_id uuid NOT NULL,
 record jsonb NOT NULL,
 request_key uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','prepared','confirmed','unchanged')),
 body jsonb,
 before_value jsonb,
 after_value jsonb,
 receipt jsonb,
 PRIMARY KEY(job_id,ordinal), UNIQUE(job_id,contract_id), UNIQUE(request_key),
 CHECK((state='pending' AND body IS NULL AND before_value IS NULL AND after_value IS NULL AND receipt IS NULL)
 OR (state='prepared' AND before_value IS NOT NULL AND after_value IS NOT NULL AND receipt IS NULL)
 OR (state='unchanged' AND body IS NULL AND before_value IS NOT NULL AND after_value IS NOT NULL AND receipt IS NULL)
 OR (state='confirmed' AND body IS NOT NULL AND before_value IS NOT NULL AND after_value IS NOT NULL AND receipt IS NOT NULL))
);
ALTER TABLE public.own_collective_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.own_collective_job_item ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_collective_job,public.own_collective_job_item FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.own_collective_job_seal_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'COLLECTIVE_JOB_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='own_collective_job' THEN
  IF OLD.phase IN ('complete','cancelled') OR
   (to_jsonb(NEW)-ARRAY['phase','resume_phase','review_hash','pause_code','execution_context','authorization_pin','dispatch_generation','updated_at','confirmed_at'])
   IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['phase','resume_phase','review_hash','pause_code','execution_context','authorization_pin','dispatch_generation','updated_at','confirmed_at'])
   OR NEW.dispatch_generation<=OLD.dispatch_generation
   OR (OLD.review_hash IS NOT NULL AND NEW.review_hash IS DISTINCT FROM OLD.review_hash)
   OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
   THEN RAISE EXCEPTION 'COLLECTIVE_JOB_IMMUTABLE'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','body','before_value','after_value','receipt']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['state','body','before_value','after_value','receipt'])
   OR OLD.state IN ('confirmed','unchanged')
   OR (OLD.state='pending' AND NEW.state<>'prepared')
   OR (OLD.state='prepared' AND (NEW.state NOT IN ('confirmed','unchanged')
    OR NEW.body IS DISTINCT FROM OLD.body OR NEW.before_value IS DISTINCT FROM OLD.before_value OR NEW.after_value IS DISTINCT FROM OLD.after_value))
   THEN RAISE EXCEPTION 'COLLECTIVE_JOB_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER own_collective_job_seal BEFORE UPDATE OR DELETE ON public.own_collective_job FOR EACH ROW EXECUTE FUNCTION public.own_collective_job_seal_v1();
CREATE TRIGGER own_collective_job_no_truncate BEFORE TRUNCATE ON public.own_collective_job FOR EACH STATEMENT EXECUTE FUNCTION public.own_collective_job_seal_v1();
CREATE TRIGGER own_collective_job_item_seal BEFORE UPDATE OR DELETE ON public.own_collective_job_item FOR EACH ROW EXECUTE FUNCTION public.own_collective_job_seal_v1();
CREATE TRIGGER own_collective_job_item_no_truncate BEFORE TRUNCATE ON public.own_collective_job_item FOR EACH STATEMENT EXECUTE FUNCTION public.own_collective_job_seal_v1();

CREATE FUNCTION public.own_collective_job_hash_v1(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(value),'sha256'),'hex')
$$;

CREATE FUNCTION public.own_collective_job_authority_v1(p jsonb,command_value text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,'workforce.employee.read')
 OR NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read')
 OR command_value IS NOT NULL AND NOT public.action_center_context_has_capability(ctx,CASE command_value WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_identity_session s
  WHERE s.id=(p->>'actorSessionId')::uuid AND s.session_version=(p->>'actorSessionVersion')::integer
  AND s.status='active' AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour')
 THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID'; END IF;
 RETURN ctx;
END $$;

CREATE FUNCTION public.own_collective_job_auth_pin_v1(ctx jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('scope',public.native_salary_scope_v1(ctx),'capabilities',ctx->'capabilities',
  'areaScopes',ctx->'areaScopes','companyId',ctx->'sourceCompanyId','database',ctx->'sourceDatabase')
$$;

CREATE FUNCTION public.own_collective_job_assert_actor_v1(ctx jsonb,j public.own_collective_job) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF ctx->>'tenantId' IS DISTINCT FROM j.tenant_id::text OR ctx->>'sourceBindingId' IS DISTINCT FROM j.source_binding_id::text
 OR ctx->>'membershipId' IS DISTINCT FROM j.actor_membership_id::text OR ctx->>'actorPersonId' IS DISTINCT FROM j.actor_person_id::text
 OR ctx->>'actorEmail' IS DISTINCT FROM j.actor_email THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
END $$;

-- Set-based population identity. Uses the installed authenticated projection, not raw contract status.
CREATE FUNCTION public.own_collective_job_population_v1(p jsonb,f jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; population jsonb; active_count integer; mismatch boolean;
BEGIN
 ctx:=public.own_collective_job_authority_v1(p);
 WITH projected AS MATERIALIZED (
  SELECT c.id::text AS "contractId",r.id::text AS "registrationId",c.legacy_legajo AS legajo,
   c.person_id::text AS "personId",b.data
  FROM public.native_employee_roster_projection_batch_v1(p) b
  JOIN public.employment_contract c ON c.id=b.contract_id AND c.tenant_id=(ctx->>'tenantId')::uuid
   AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL
  JOIN public.native_employee_registration r ON r.contract_id=c.id AND r.person_id=c.person_id
   AND r.tenant_id=c.tenant_id AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
  WHERE b.data->>'status'='active'
 ), expected AS MATERIALIZED (SELECT value FROM jsonb_array_elements(f->'records'))
 SELECT count(*)::integer,
  coalesce(jsonb_agg(jsonb_build_object('contractId',a."contractId",'registrationId',a."registrationId",'legajo',a.legajo,
   'personId',a."personId",'status',a.data->'status','startDate',a.data->'startDate','endDate',a.data->'endDate',
   'recordKind',a.data->'recordKind','readVersion',a.data->'readVersion','identityReadVersion',a.data->'identityReadVersion') ORDER BY a."contractId"),'[]'::jsonb),
  EXISTS(SELECT 1 FROM projected x FULL JOIN expected e ON lower(e.value->>'contractId')=x."contractId"
   WHERE x."contractId" IS NULL OR e.value IS NULL OR lower(e.value->>'registrationId')<>x."registrationId" OR e.value->>'legajo' IS DISTINCT FROM x.legajo)
 INTO active_count,population,mismatch FROM projected a;
 IF active_count<>(f->>'total')::integer OR mismatch THEN RAISE EXCEPTION 'COLLECTIVE_JOB_POPULATION_CHANGED'; END IF;
 -- The canonical batch and roster.today use the Mendoza civil date. Pin it
 -- even when midnight does not change any row's active/inactive state.
 RETURN public.own_collective_job_hash_v1(jsonb_build_array(ctx->>'tenantId',ctx->>'sourceBindingId',
  (statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date,population));
END $$;

CREATE FUNCTION public.own_collective_job_snapshot_v1(j public.own_collective_job) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('version','own-collective-job.v1','id',j.id,'family',j.family,'period',j.period,'command',j.command,
  'reason',j.reason,'actorLabel',j.actor_label,'fileHash',j.file_hash,'phase',j.phase,'total',j.total,
  'prepared',count(*) FILTER(WHERE i.state<>'pending'),'confirmed',count(*) FILTER(WHERE i.state='confirmed'),
  'unchanged',count(*) FILTER(WHERE i.state<>'pending' AND i.body IS NULL),
  'completed',count(*) FILTER(WHERE i.state IN ('confirmed','unchanged')),
  'reviewHash',j.review_hash,'pauseCode',j.pause_code,'dispatchGeneration',j.dispatch_generation,
  'createdAt',j.created_at,'updatedAt',j.updated_at)
 FROM public.own_collective_job_item i WHERE i.job_id=j.id
$$;

CREATE FUNCTION public.own_collective_job_create_v1(p jsonb,family_value text,f jsonb,command_value text,reason_value text,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;j public.own_collective_job; r jsonb;h text;pin text;expected_version text;count_value integer;
BEGIN
 IF family_value IS NULL OR family_value NOT IN ('working-time','seniority') OR command_value IS NULL OR command_value NOT IN ('propose','approve','reject') OR key IS NULL
 OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR NOT public.own_program_text_v1(to_jsonb(reason_value),10,1000)
 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 expected_version:=CASE family_value WHEN 'working-time' THEN 'own-contract-working-time-collective.v1' ELSE 'own-salary-seniority-collective.v1' END;
 IF NOT public.own_program_exact_v1(f,ARRAY['version','period','scope','total','records']) OR f->>'version' IS DISTINCT FROM expected_version
 OR f->>'scope' IS DISTINCT FROM 'all_active' OR coalesce(f->>'period','')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 OR jsonb_typeof(f->'records') IS DISTINCT FROM 'array' OR jsonb_typeof(f->'total') IS DISTINCT FROM 'number'
 OR octet_length(f::text)>4194304 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 count_value:=jsonb_array_length(f->'records');
 IF count_value NOT BETWEEN 1 AND 10000 OR (f->>'total')::numeric<>count_value THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INCOMPLETE'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(f->'records') LOOP
  IF NOT public.own_program_exact_v1(r,ARRAY['contractId','registrationId','legajo','definition','proposalId'])
  OR coalesce(r->>'contractId','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR coalesce(r->>'registrationId','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR jsonb_typeof(r->'legajo') IS DISTINCT FROM 'string' OR length(r->>'legajo') NOT BETWEEN 1 AND 64 OR r->>'legajo' ~ '[[:cntrl:]]'
  OR (r->'proposalId'<>'null'::jsonb AND coalesce(r->>'proposalId','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
  THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
  IF family_value='working-time' THEN PERFORM public.own_working_time_definition_v1(r->'definition',f->>'period');
  ELSE PERFORM public.own_seniority_definition_v1(r->'definition',f->>'period'); END IF;
 END LOOP;
 IF (SELECT count(DISTINCT lower(value->>'contractId')) FROM jsonb_array_elements(f->'records'))<>count_value
 OR (SELECT count(DISTINCT lower(value->>'registrationId')) FROM jsonb_array_elements(f->'records'))<>count_value
 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_DUPLICATE'; END IF;
 ctx:=public.own_collective_job_authority_v1(p,command_value);
 h:=public.own_collective_job_hash_v1(jsonb_build_array(family_value,f,command_value,reason_value));
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-collective-create:'||(ctx->>'tenantId')||':'||(ctx->>'membershipId'),0)) THEN RAISE EXCEPTION 'COLLECTIVE_JOB_BUSY'; END IF;
 ctx:=public.own_collective_job_authority_v1(p,command_value);
 SELECT * INTO j FROM public.own_collective_job WHERE tenant_id=(ctx->>'tenantId')::uuid
  AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
  IF j.request_hash<>h THEN RAISE EXCEPTION 'COLLECTIVE_JOB_IDEMPOTENCY_REUSE'; END IF;
  RETURN public.own_collective_job_snapshot_v1(j);
 END IF;
 SELECT * INTO j FROM public.own_collective_job WHERE tenant_id=(ctx->>'tenantId')::uuid
  AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid
  AND family=family_value AND period=f->>'period' AND phase NOT IN ('complete','cancelled');
 IF FOUND THEN
  PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
  IF j.request_hash=h THEN RETURN public.own_collective_job_snapshot_v1(j); END IF;
  RAISE EXCEPTION 'COLLECTIVE_JOB_ACTIVE_JOB_EXISTS';
 END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 ctx:=public.own_collective_job_authority_v1(p,command_value);
 pin:=public.own_collective_job_population_v1(p,f);
 INSERT INTO public.own_collective_job(tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_label,
  original_context,execution_context,authorization_pin,family,period,command,reason,file,file_hash,request_key,request_hash,population_pin,total,phase)
 VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,
  ctx->>'actorEmail',ctx->>'actorLabel',p,p,public.own_collective_job_auth_pin_v1(ctx),family_value,f->>'period',command_value,reason_value,
  f,public.own_collective_job_hash_v1(f),key,h,pin,count_value,'preparing') RETURNING * INTO j;
 INSERT INTO public.own_collective_job_item(job_id,ordinal,contract_id,record)
 SELECT j.id,(ordinality-1)::integer,(value->>'contractId')::uuid,value FROM jsonb_array_elements(f->'records') WITH ORDINALITY;
 RETURN public.own_collective_job_snapshot_v1(j);
END $$;

CREATE FUNCTION public.own_collective_job_inspect_v1(p jsonb,target uuid,include_items boolean DEFAULT false,offset_value integer DEFAULT 0,limit_value integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;j public.own_collective_job;result jsonb;rows_value jsonb;
BEGIN
 IF offset_value IS NULL OR offset_value<0 OR limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 ctx:=public.own_collective_job_authority_v1(p);
 SELECT * INTO j FROM public.own_collective_job WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
 PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
 result:=public.own_collective_job_snapshot_v1(j);
 IF include_items THEN
  IF public.own_collective_job_auth_pin_v1(ctx) IS DISTINCT FROM j.authorization_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM public.own_collective_job_item WHERE job_id=j.id AND state='pending') THEN RAISE EXCEPTION 'COLLECTIVE_JOB_REVIEW_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',i.contract_id,'legajo',i.record->>'legajo',
   'before',i.before_value,'after',i.after_value,'action',CASE WHEN i.state='pending' THEN 'pending' WHEN i.body IS NULL THEN 'unchanged' ELSE j.command END,
   'confirmed',i.state='confirmed') ORDER BY i.ordinal),'[]'::jsonb) INTO rows_value
  FROM public.own_collective_job_item i WHERE i.job_id=j.id AND i.ordinal>=offset_value AND i.ordinal<offset_value+limit_value;
  result:=result||jsonb_build_object('comparisons',rows_value,'comparisonTotal',j.total,'nextOffset',CASE WHEN offset_value+limit_value<j.total THEN offset_value+limit_value ELSE NULL END);
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.own_collective_job_list_v1(p jsonb,family_value text,period_value text DEFAULT NULL,before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cursor_row public.own_collective_job;rows_value jsonb;more_value boolean;last_id uuid;
BEGIN
 IF family_value IS NULL OR family_value NOT IN ('working-time','seniority') OR period_value IS NOT NULL AND period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 ctx:=public.own_collective_job_authority_v1(p);
 IF before_id IS NOT NULL THEN
  SELECT * INTO cursor_row FROM public.own_collective_job WHERE id=before_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
  PERFORM public.own_collective_job_assert_actor_v1(ctx,cursor_row);
  IF cursor_row.family<>family_value OR period_value IS NOT NULL AND cursor_row.period<>period_value THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 END IF;
 WITH candidates AS MATERIALIZED (
  SELECT * FROM public.own_collective_job j WHERE j.tenant_id=(ctx->>'tenantId')::uuid
   AND j.source_binding_id=(ctx->>'sourceBindingId')::uuid AND j.actor_membership_id=(ctx->>'membershipId')::uuid
   AND j.actor_person_id=(ctx->>'actorPersonId')::uuid AND j.actor_email=ctx->>'actorEmail' AND j.family=family_value
   AND (period_value IS NULL OR j.period=period_value) AND (before_id IS NULL OR (j.created_at,j.id)<(cursor_row.created_at,cursor_row.id))
  ORDER BY j.created_at DESC,j.id DESC LIMIT 51
 ), shown AS (SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(public.own_collective_job_snapshot_v1(s::public.own_collective_job) ORDER BY s.created_at DESC,s.id DESC) FROM shown s),'[]'::jsonb),
  (SELECT count(*)>50 FROM candidates),(SELECT id FROM shown ORDER BY created_at,id LIMIT 1)
 INTO rows_value,more_value,last_id;
 RETURN jsonb_build_object('jobs',rows_value,'hasMore',more_value,'nextCursor',CASE WHEN more_value THEN last_id ELSE NULL END);
END $$;

-- One canonical comparison. The body construction is the same as prepare/decide in the existing models.
CREATE FUNCTION public.own_collective_job_entry_v1(j public.own_collective_job,r jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE boot jsonb;detail_value jsonb;pending jsonb;pid uuid;body_value jsonb;before_value jsonb;
BEGIN
 IF j.family='working-time' THEN boot:=public.own_working_time_bootstrap_v1(j.execution_context,(r->>'contractId')::uuid,j.period);
 ELSE boot:=public.own_seniority_bootstrap_v1(j.execution_context,(r->>'contractId')::uuid,j.period); END IF;
 IF boot->>'contractId' IS DISTINCT FROM lower(r->>'contractId') OR boot->>'period' IS DISTINCT FROM j.period
 OR boot#>>'{source,subject,registrationId}' IS DISTINCT FROM lower(r->>'registrationId')
 OR boot#>>'{source,subject,legajo}' IS DISTINCT FROM r->>'legajo' OR boot->'complete'<>'true'::jsonb
 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SOURCE_CHANGED'; END IF;
 SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO pending FROM jsonb_array_elements(boot->'proposals') WHERE value->>'status'='pending';
 IF j.command='propose' THEN
  IF r->'proposalId'<>'null'::jsonb OR jsonb_array_length(pending)<>0 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_PENDING'; END IF;
  before_value:=boot#>'{configuration,definition}';
  IF before_value=r->'definition' THEN RETURN jsonb_build_object('body',NULL,'before',before_value,'after',r->'definition'); END IF;
  IF boot#>'{permissions,canPropose}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'COLLECTIVE_JOB_FORBIDDEN'; END IF;
  body_value:=jsonb_build_object('command','propose','contractId',boot->>'contractId','period',j.period,'scopeVersion',boot->>'scopeVersion',
   'baseVersion',boot#>>'{configuration,version}','sourceVersion',boot#>>'{source,version}',
   'proposalId',NULL,'proposalSha256',NULL,'definition',r->'definition','reason',j.reason,'reviewConfirmed',false);
 ELSE
  IF jsonb_array_length(pending)>1 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_PENDING'; END IF;
  pid:=(r->>'proposalId')::uuid;
  IF pid IS NULL AND jsonb_array_length(pending)=1 THEN pid:=(pending->0->>'id')::uuid; END IF;
  IF pid IS NULL THEN
   IF boot#>'{configuration,definition}' IS DISTINCT FROM r->'definition' THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SOURCE_CHANGED'; END IF;
   RETURN jsonb_build_object('body',NULL,'before',boot#>'{configuration,definition}','after',r->'definition');
  END IF;
  IF j.family='working-time' THEN detail_value:=public.own_working_time_detail_v1(j.execution_context,pid);
  ELSE detail_value:=public.own_seniority_detail_v1(j.execution_context,pid); END IF;
  IF detail_value#>>'{proposal,id}' IS DISTINCT FROM pid::text OR detail_value#>>'{body,period}' IS DISTINCT FROM j.period
  OR detail_value#>>'{body,contractId}' IS DISTINCT FROM lower(r->>'contractId')
  OR detail_value->>'scopeVersion' IS DISTINCT FROM boot->>'scopeVersion'
  OR detail_value#>'{body,definition}' IS DISTINCT FROM r->'definition'
  OR detail_value#>>'{proposal,requestSha256}' IS DISTINCT FROM public.own_collective_job_hash_v1(detail_value->'body')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(pending) WHERE value->>'id'<>pid::text)
  THEN RAISE EXCEPTION 'COLLECTIVE_JOB_PROPOSAL_CHANGED'; END IF;
  IF boot#>'{permissions,canReview}' IS DISTINCT FROM 'true'::jsonb
  OR detail_value#>'{proposal,canReview}' IS DISTINCT FROM 'true'::jsonb OR detail_value#>>'{proposal,status}' IS DISTINCT FROM 'pending'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(boot->'proposals') WHERE value->>'id'=pid::text AND value->>'requestSha256'=detail_value#>>'{proposal,requestSha256}')
  THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INDEPENDENT_REQUIRED'; END IF;
  IF j.command='approve' AND (detail_value->'current' IS DISTINCT FROM 'true'::jsonb
   OR detail_value#>>'{proposal,baseVersion}' IS DISTINCT FROM boot#>>'{configuration,version}'
   OR detail_value#>>'{proposal,sourceVersion}' IS DISTINCT FROM boot#>>'{source,version}') THEN RAISE EXCEPTION 'COLLECTIVE_JOB_BASE_CHANGED'; END IF;
  before_value:=detail_value->'baseDefinition';
  body_value:=jsonb_build_object('command',j.command,'contractId',boot->>'contractId','period',j.period,'scopeVersion',boot->>'scopeVersion',
   'baseVersion',detail_value#>>'{proposal,baseVersion}','sourceVersion',detail_value#>>'{proposal,sourceVersion}',
   'proposalId',pid,'proposalSha256',detail_value#>>'{proposal,requestSha256}','definition',NULL,'reason',j.reason,'reviewConfirmed',true);
 END IF;
 RETURN jsonb_build_object('body',body_value,'before',before_value,'after',r->'definition');
END $$;

CREATE FUNCTION public.own_collective_job_confirm_v1(p jsonb,target uuid,review_hash_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;j public.own_collective_job;
BEGIN
 SELECT * INTO j FROM public.own_collective_job WHERE id=target FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
 ctx:=public.own_collective_job_authority_v1(p,j.command);PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
 IF p->>'releaseSha' IS DISTINCT FROM j.original_context->>'releaseSha' THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
 IF review_hash_value IS NULL OR review_hash_value IS DISTINCT FROM j.review_hash THEN RAISE EXCEPTION 'COLLECTIVE_JOB_REVIEW_REQUIRED'; END IF;
 IF j.phase IN ('running','complete') THEN RETURN public.own_collective_job_snapshot_v1(j); END IF;
 IF j.phase<>'prepared' THEN RAISE EXCEPTION 'COLLECTIVE_JOB_REVIEW_REQUIRED'; END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 ctx:=public.own_collective_job_authority_v1(p,j.command);PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
 IF public.own_collective_job_auth_pin_v1(ctx) IS DISTINCT FROM j.authorization_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
 IF public.own_collective_job_population_v1(p,j.file)<>j.population_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_POPULATION_CHANGED'; END IF;
 UPDATE public.own_collective_job SET phase='running',execution_context=p,authorization_pin=public.own_collective_job_auth_pin_v1(ctx),
  confirmed_at=clock_timestamp(),updated_at=clock_timestamp(),dispatch_generation=dispatch_generation+1 WHERE id=j.id RETURNING * INTO j;
 RETURN public.own_collective_job_snapshot_v1(j);
END $$;

CREATE FUNCTION public.own_collective_job_resume_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;j public.own_collective_job;
BEGIN
 SELECT * INTO j FROM public.own_collective_job WHERE id=target FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
 ctx:=public.own_collective_job_authority_v1(p,j.command);PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
 IF p->>'releaseSha' IS DISTINCT FROM j.original_context->>'releaseSha' THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
 IF j.phase IN ('complete','cancelled','prepared') THEN RETURN public.own_collective_job_snapshot_v1(j); END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 ctx:=public.own_collective_job_authority_v1(p,j.command);PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
 IF public.own_collective_job_auth_pin_v1(ctx) IS DISTINCT FROM j.authorization_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
 IF public.own_collective_job_population_v1(p,j.file)<>j.population_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_POPULATION_CHANGED'; END IF;
 UPDATE public.own_collective_job SET phase=CASE WHEN confirmed_at IS NULL THEN 'preparing' ELSE 'running' END,
  execution_context=p,authorization_pin=public.own_collective_job_auth_pin_v1(ctx),pause_code=NULL,resume_phase=NULL,
  updated_at=clock_timestamp(),dispatch_generation=dispatch_generation+1 WHERE id=j.id RETURNING * INTO j;
 RETURN public.own_collective_job_snapshot_v1(j);
END $$;

CREATE FUNCTION public.own_collective_job_cancel_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;j public.own_collective_job;
BEGIN
 SELECT * INTO j FROM public.own_collective_job WHERE id=target FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
 ctx:=public.own_collective_job_authority_v1(p);PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
 IF j.phase IN ('complete','cancelled') THEN RETURN public.own_collective_job_snapshot_v1(j); END IF;
 UPDATE public.own_collective_job SET phase='cancelled',resume_phase=NULL,pause_code=NULL,updated_at=clock_timestamp(),
  dispatch_generation=dispatch_generation+1 WHERE id=j.id RETURNING * INTO j;
 RETURN public.own_collective_job_snapshot_v1(j);
END $$;

-- Private worker entry. A generation is a fencing token: an old delivery cannot advance a resumed job.
CREATE FUNCTION public.own_collective_job_step_v1(target uuid,expected_generation bigint,limit_value integer DEFAULT 8) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE j public.own_collective_job;i public.own_collective_job_item;ctx jsonb;fresh jsonb;entry_value jsonb;receipt_value jsonb;
 failure text;review_value jsonb;started timestamptz:=clock_timestamp();processed integer:=0;prior_phase text;
BEGIN
 IF limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 16 OR expected_generation IS NULL OR expected_generation<1 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 SELECT * INTO j FROM public.own_collective_job WHERE id=target FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTIVE_JOB_NOT_FOUND'; END IF;
 IF j.dispatch_generation<>expected_generation OR j.phase NOT IN ('preparing','running') THEN RETURN public.own_collective_job_snapshot_v1(j); END IF;
 prior_phase:=j.phase;
 BEGIN
  ctx:=public.own_collective_job_authority_v1(j.execution_context,j.command);PERFORM public.own_collective_job_assert_actor_v1(ctx,j);
  IF public.own_collective_job_auth_pin_v1(ctx) IS DISTINCT FROM j.authorization_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
  IF j.family='working-time' THEN PERFORM public.own_working_time_lock_v1(ctx); ELSE PERFORM public.own_seniority_lock_v1(ctx); END IF;
  IF public.own_collective_job_population_v1(j.execution_context,j.file)<>j.population_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_POPULATION_CHANGED'; END IF;
  FOR i IN SELECT * FROM public.own_collective_job_item WHERE job_id=j.id AND state=CASE j.phase WHEN 'preparing' THEN 'pending' ELSE 'prepared' END ORDER BY ordinal LIMIT limit_value LOOP
   IF processed>0 AND clock_timestamp()-started>interval '3 seconds' THEN EXIT; END IF;
   IF j.phase='preparing' THEN
    entry_value:=public.own_collective_job_entry_v1(j,i.record);
    UPDATE public.own_collective_job_item SET state='prepared',body=nullif(entry_value->'body','null'::jsonb),
     before_value=entry_value->'before',after_value=entry_value->'after' WHERE job_id=j.id AND ordinal=i.ordinal;
   ELSIF i.body IS NULL THEN
    entry_value:=public.own_collective_job_entry_v1(j,i.record);
    IF entry_value->'body'<>'null'::jsonb OR entry_value->'before' IS DISTINCT FROM i.before_value OR entry_value->'after' IS DISTINCT FROM i.after_value THEN RAISE EXCEPTION 'COLLECTIVE_JOB_BASE_CHANGED'; END IF;
    UPDATE public.own_collective_job_item SET state='unchanged' WHERE job_id=j.id AND ordinal=i.ordinal;
   ELSE
    -- Canonical command owns source/base checks, independent identity and idempotency.
    -- No wrapper can synthesize a signature or replace a receipt with an aggregate counter.
    -- Keep the original collective no-pending-proposal guard under the family lock.
    -- A receipt already committed with our immutable key must still be replayable.
    IF j.command IN ('propose','approve','reject') THEN
     IF j.family='working-time' THEN
      IF NOT EXISTS(SELECT 1 FROM public.own_working_time_event e WHERE e.tenant_id=j.tenant_id AND e.source_binding_id=j.source_binding_id
        AND e.actor_membership_id=j.actor_membership_id AND e.request_key=i.request_key)
       AND EXISTS(SELECT 1 FROM public.own_working_time_event e WHERE e.tenant_id=j.tenant_id AND e.source_binding_id=j.source_binding_id
        AND e.contract_id=i.contract_id AND e.period_month=(j.period||'-01')::date AND e.command='propose'
        AND (j.command='propose' OR e.id<>(i.body->>'proposalId')::uuid)
        AND NOT EXISTS(SELECT 1 FROM public.own_working_time_event d WHERE d.proposal_id=e.id))
      THEN RAISE EXCEPTION 'COLLECTIVE_JOB_PENDING'; END IF;
     ELSE
      IF NOT EXISTS(SELECT 1 FROM public.own_seniority_event e WHERE e.tenant_id=j.tenant_id AND e.source_binding_id=j.source_binding_id
        AND e.actor_membership_id=j.actor_membership_id AND e.request_key=i.request_key)
       AND EXISTS(SELECT 1 FROM public.own_seniority_event e WHERE e.tenant_id=j.tenant_id AND e.source_binding_id=j.source_binding_id
        AND e.contract_id=i.contract_id AND e.period_month=(j.period||'-01')::date AND e.command='propose'
        AND (j.command='propose' OR e.id<>(i.body->>'proposalId')::uuid)
        AND NOT EXISTS(SELECT 1 FROM public.own_seniority_event d WHERE d.proposal_id=e.id))
      THEN RAISE EXCEPTION 'COLLECTIVE_JOB_PENDING'; END IF;
     END IF;
    END IF;
    IF j.family='working-time' THEN receipt_value:=public.own_working_time_command_v1(j.execution_context,i.body,i.request_key);
    ELSE receipt_value:=public.own_seniority_command_v1(j.execution_context,i.body,i.request_key); END IF;
    IF receipt_value->>'requestKey' IS DISTINCT FROM i.request_key::text OR receipt_value->'body' IS DISTINCT FROM i.body
    OR receipt_value->>'requestSha256' IS DISTINCT FROM public.own_collective_job_hash_v1(i.body)
    OR receipt_value->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb OR receipt_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
    THEN RAISE EXCEPTION 'COLLECTIVE_JOB_RECEIPT_INVALID'; END IF;
    UPDATE public.own_collective_job_item SET state='confirmed',receipt=receipt_value WHERE job_id=j.id AND ordinal=i.ordinal;
   END IF;
   processed:=processed+1;
  END LOOP;
  fresh:=public.own_collective_job_authority_v1(j.execution_context,j.command);PERFORM public.own_collective_job_assert_actor_v1(fresh,j);
  IF public.own_collective_job_auth_pin_v1(fresh) IS DISTINCT FROM j.authorization_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_SCOPE_CHANGED'; END IF;
  IF public.own_collective_job_population_v1(j.execution_context,j.file)<>j.population_pin THEN RAISE EXCEPTION 'COLLECTIVE_JOB_POPULATION_CHANGED'; END IF;
  IF j.phase='preparing' AND NOT EXISTS(SELECT 1 FROM public.own_collective_job_item WHERE job_id=j.id AND state='pending') THEN
   SELECT jsonb_agg(jsonb_build_object('ordinal',ordinal,'key',request_key,'body',body,'before',before_value,'after',after_value) ORDER BY ordinal)
    INTO review_value FROM public.own_collective_job_item WHERE job_id=j.id;
   j.review_hash:=public.own_collective_job_hash_v1(jsonb_build_object('version','own-collective-review.v1','fileHash',j.file_hash,
    'populationPin',j.population_pin,'actorScope',public.native_salary_scope_v1(ctx),'command',j.command,'reason',j.reason,'items',review_value));
   j.phase:='prepared';
  ELSIF j.phase='running' AND NOT EXISTS(SELECT 1 FROM public.own_collective_job_item WHERE job_id=j.id AND state IN ('pending','prepared')) THEN j.phase:='complete'; END IF;
 EXCEPTION WHEN OTHERS THEN
  -- This subtransaction rolls back ALL events and progress written in this block.
  -- Previous blocks remain committed; no keys or prepared bodies are replaced.
  GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
  -- Lock conflicts are transient: roll back and let the durable queue retry this generation.
  IF SQLSTATE IN ('55P03','40P01','40001') OR failure ~ '_BUSY$' THEN RAISE; END IF;
  failure:=CASE WHEN failure ~ '^[A-Z][A-Z0-9_]{0,99}$' THEN failure ELSE 'COLLECTIVE_JOB_UNAVAILABLE' END;
  SELECT * INTO j FROM public.own_collective_job WHERE id=target;
  j.phase:='paused';j.resume_phase:=prior_phase;j.pause_code:=failure;
 END;
 UPDATE public.own_collective_job SET phase=j.phase,resume_phase=j.resume_phase,pause_code=j.pause_code,review_hash=j.review_hash,
  updated_at=clock_timestamp(),dispatch_generation=dispatch_generation+1 WHERE id=j.id RETURNING * INTO j;
 RETURN public.own_collective_job_snapshot_v1(j);
END $$;

-- Outbox recovery: only identifiers; no file, actor receipt or HR information is returned.
CREATE FUNCTION public.own_collective_job_pending_v1(limit_value integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'COLLECTIVE_JOB_INPUT_INVALID'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'dispatchGeneration',dispatch_generation) ORDER BY updated_at,id),'[]'::jsonb)
 INTO result FROM (SELECT id,dispatch_generation,updated_at FROM public.own_collective_job WHERE phase IN ('preparing','running') ORDER BY updated_at,id LIMIT limit_value) j;
 RETURN result;
END $$;

DO $privileges$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p
  WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'own_collective_job_%_v1'
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',f.signature);
  IF f.proname IN ('own_collective_job_create_v1','own_collective_job_inspect_v1','own_collective_job_list_v1',
   'own_collective_job_confirm_v1','own_collective_job_resume_v1','own_collective_job_cancel_v1',
   'own_collective_job_step_v1','own_collective_job_pending_v1') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO municontrol_actions_runtime_app',f.signature);
  END IF;
 END LOOP;
END $privileges$;
