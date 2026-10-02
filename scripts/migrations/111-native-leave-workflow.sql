-- Native leave requests and reviewed administrative balances. Source only.
-- Requires110. Never modifies a canonical employee, payroll, IAM or GRH row.
-- First installation must be atomic; productive installation needs its own review.
DO $prerequisite$
BEGIN
 IF to_regclass('public.native_leave_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_leave_%') THEN RAISE EXCEPTION 'NATIVE_LEAVE_ALREADY_INSTALLED'; END IF;
 IF to_regprocedure('public.native_employment_change_context_v1(jsonb,text)') IS NULL
  OR to_regprocedure('public.native_employment_lifecycle_state_v1(jsonb,uuid,jsonb)') IS NULL
  OR to_regprocedure('public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)') IS NULL
  OR to_regprocedure('public.action_center_valid_leave_payload(jsonb)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'NATIVE_LEAVE_PREREQUISITE'; END IF;
END $prerequisite$;

-- Exact reviewed authority and native identity/period prerequisites.
DO $authority_pins$
DECLARE x record; p pg_proc;
BEGIN
 FOR x IN SELECT * FROM(VALUES
 ('public.native_employment_change_context_v1(jsonb,text)','b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d'),
 ('public.native_employment_change_subject_v1(jsonb,uuid)','3a50695689cc90517b0ef9795ce1588cc8a4e49b5515f16832c6c2d4521459b0'),
 ('public.native_employment_lifecycle_lock_v1(jsonb,uuid)','a6e37d58fc7f6ccd35be9a103e05f5af9bccf2bc06a01df0d2841451a0bfeb37'),
 ('public.native_employment_lifecycle_subject_v1(jsonb,uuid)','4c5a4785240c5ebfb91c2445d265c2ebe6d3063710fe5d01ebc2b2bbfa591e95'),
 ('public.native_employment_lifecycle_state_v1(jsonb,uuid,jsonb)','dd5ea2251c5e7279df3bdab239381c80b2112aca3731464d3cb551e1fb45b380'),
 ('public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)','580b0c0d966fc71531885d515d1942c03a954753106c32a62fa1f7da1295154e'),
 ('public.action_center_valid_leave_payload(jsonb)','c332162645d64eb9f8bad45e69d44ae829caa9ed13c2b62787a0259c11a778fa')
 ) v(signature,body_sha) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x.signature);
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.proretset OR p.proleakproof
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x.body_sha
  THEN RAISE EXCEPTION 'NATIVE_LEAVE_PREREQUISITE'; END IF;
 END LOOP;
END $authority_pins$;


CREATE TABLE public.native_leave_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id), source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id), registration_id uuid NOT NULL REFERENCES public.native_employee_registration(id),
 identity_token text NOT NULL CHECK(identity_token~'^[a-f0-9]{64}$'), scope_version text NOT NULL CHECK(scope_version~'^[a-f0-9]{64}$'),
 employment_version text NOT NULL CHECK(employment_version~'^[a-f0-9]{64}$'),
 entity_id uuid NOT NULL, entity_kind text NOT NULL CHECK(entity_kind IN ('request','profile')),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100), command text NOT NULL,
 status text NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8192),
 profile_base_id uuid REFERENCES public.native_leave_event(id),
 reason text CHECK(length(reason) BETWEEN 10 AND 1000 AND reason!~'[<>[:cntrl:]]'),
 evidence_status text CHECK(evidence_status IN ('verified','not_required')), manual_validation_confirmed boolean NOT NULL,
 owner_membership_id uuid NOT NULL, owner_person_id uuid NOT NULL REFERENCES public.person_identity(id), owner_email text NOT NULL,
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 160), release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'), receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,contract_id,entity_id,revision), UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(owner_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((entity_kind='request' AND command IN ('create','update_draft','submit','approve','reject','cancel') AND status IN ('draft','submitted','approved','rejected','cancelled'))
  OR(entity_kind='profile' AND command IN ('profile_propose','profile_approve','profile_reject') AND status IN ('pending','approved','rejected'))),
 CHECK((command IN ('create','update_draft') AND reason IS NULL) OR(command NOT IN ('create','update_draft') AND reason IS NOT NULL)),
 CHECK((command='approve' AND evidence_status IS NOT NULL AND manual_validation_confirmed)
  OR(command='profile_approve' AND evidence_status IS NULL AND manual_validation_confirmed)
  OR(command NOT IN ('approve','profile_approve') AND evidence_status IS NULL AND NOT manual_validation_confirmed))
);
ALTER TABLE public.native_leave_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_leave_event FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.native_leave_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN RAISE EXCEPTION 'NATIVE_LEAVE_IMMUTABLE'; END $$;
CREATE TRIGGER native_leave_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_leave_event FOR EACH STATEMENT EXECUTE FUNCTION public.native_leave_immutable_v1();

CREATE FUNCTION public.native_leave_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.native_employment_change_context_v1(p);
 IF NOT public.action_center_context_has_capability(ctx,'actions.read') THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 RETURN ctx;
END $$;

CREATE FUNCTION public.native_leave_authorized_v1(ctx jsonb,target uuid,command_name text,current_status text,confidentiality text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ec public.employment_contract;
BEGIN
 SELECT * INTO ec FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_system='MUNICONTROL';
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN public.action_center_tenant_actor_authorized(ctx->>'actorEmail',(ctx->>'tenantId')::uuid,(ctx->>'membershipId')::uuid,command_name,target,ec.legacy_company_id,ec.organization_unit_source_id,ec.sector_source_id,current_status,confidentiality);
END $$;

CREATE FUNCTION public.native_leave_scope_v1(ctx jsonb,subject jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT encode(public.digest(jsonb_build_object('version','native-leave-scope.v1','tenantId',ctx->>'tenantId','sourceBindingId',ctx->>'sourceBindingId','membershipId',ctx->>'membershipId','personId',ctx->>'actorPersonId','email',ctx->>'actorEmail','contractId',subject->>'contractId','registrationId',subject->>'registrationId','identityToken',subject->>'identityToken')::text,'sha256'),'hex')
$$;

CREATE FUNCTION public.native_leave_serialized_v1(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE answer text;
BEGIN
 IF jsonb_typeof(v)='object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(k)::text||':'||public.native_leave_serialized_v1(x),',' ORDER BY k COLLATE "C"),'')||'}' INTO answer FROM jsonb_each(v) e(k,x); RETURN answer;
 ELSIF jsonb_typeof(v)='array' THEN SELECT '['||coalesce(string_agg(public.native_leave_serialized_v1(x),',' ORDER BY n),'')||']' INTO answer FROM jsonb_array_elements(v) WITH ORDINALITY e(x,n); RETURN answer;
 ELSE RETURN v::text; END IF;
END $$;

CREATE FUNCTION public.native_leave_payload_v1(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE legacy jsonb; field text;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k) IS DISTINCT FROM ARRAY['confidentiality','durationUnit','employeeNote','endsAtLocal','endsOn','policyRuleId','policyVersionId','reasonCode','startsAtLocal','startsOn']::text[]
  OR v->>'policyVersionId' IS DISTINCT FROM 'mendoza-ley-5811-title-vi.v1'
  OR v->>'confidentiality' NOT IN ('standard','restricted') OR v->>'confidentiality' IS NULL
  OR (v->>'confidentiality'='standard' AND v->>'reasonCode'<>'19')
  OR (v->>'confidentiality'='restricted' AND v->'employeeNote' IS DISTINCT FROM 'null'::jsonb)
 THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 FOR field IN SELECT unnest(ARRAY['startsOn','endsOn']) LOOP
  IF jsonb_typeof(v->field) IS DISTINCT FROM 'string' OR v->>field !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((v->>field)::date,'YYYY-MM-DD') IS DISTINCT FROM v->>field THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 END LOOP;
 IF v->>'endsOn'>'2100-12-31' THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 IF v->'employeeNote'<>'null'::jsonb AND(jsonb_typeof(v->'employeeNote')<>'string' OR length(v->>'employeeNote') NOT BETWEEN 1 AND 500 OR v->>'employeeNote'~'[<>[:cntrl:]]' OR v->>'employeeNote'<>normalize(btrim(v->>'employeeNote'),NFC)) THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 legacy:=v-ARRAY['policyVersionId','confidentiality'];
 IF v->>'durationUnit'='calendar_day' THEN
  IF v->'startsAtLocal' IS DISTINCT FROM 'null'::jsonb OR v->'endsAtLocal' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
  legacy:=legacy-ARRAY['startsAtLocal','endsAtLocal'];
 ELSE
  IF v->>'startsAtLocal'!~'^(?:[01]\d|2[0-3]):[0-5]\d$' OR v->>'endsAtLocal'!~'^(?:[01]\d|2[0-3]):[0-5]\d$' THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 END IF;
 IF public.action_center_valid_leave_payload(legacy) IS DISTINCT FROM true THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 RETURN v;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID';
END $$;

CREATE FUNCTION public.native_leave_profile_v1(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE p jsonb; field text;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k) IS DISTINCT FROM ARRAY['durationUnit','entitledUnits','legalReference','mode','reason','reasonCode','year']::text[]
  OR jsonb_typeof(v->'year') IS DISTINCT FROM 'number' OR (v->>'year')!~'^\d{4}$' OR (v->>'year')::integer NOT BETWEEN 2000 AND 2100
  OR v->>'mode' NOT IN ('confirmed','not_applicable') OR v->>'mode' IS NULL
  OR (v->>'mode'='confirmed' AND(jsonb_typeof(v->'entitledUnits') IS DISTINCT FROM 'number' OR v->>'entitledUnits'!~'^\d+$' OR (v->>'entitledUnits')::numeric>1000000))
  OR (v->>'mode'='not_applicable' AND v->'entitledUnits' IS DISTINCT FROM 'null'::jsonb)
 THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 FOR field IN SELECT unnest(ARRAY['legalReference','reason']) LOOP
  IF jsonb_typeof(v->field) IS DISTINCT FROM 'string' OR length(v->>field) NOT BETWEEN (CASE field WHEN 'reason' THEN 10 ELSE 1 END) AND (CASE field WHEN 'reason' THEN 1000 ELSE 240 END) OR v->>field~'[<>[:cntrl:]]' OR v->>field<>normalize(btrim(v->>field),NFC) THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 END LOOP;
 p:=jsonb_build_object('reasonCode',v->>'reasonCode','policyVersionId','mendoza-ley-5811-title-vi.v1','policyRuleId',NULL,'startsOn','2000-01-01','endsOn','2000-01-01','durationUnit',v->>'durationUnit','startsAtLocal',CASE WHEN v->>'durationUnit'='minute' THEN '09:00' END,'endsAtLocal',CASE WHEN v->>'durationUnit'='minute' THEN '09:01' END,'confidentiality','restricted','employeeNote',NULL);
 PERFORM public.native_leave_payload_v1(p); RETURN v;
END $$;

CREATE FUNCTION public.native_leave_allocations_v1(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE p jsonb; result jsonb;
BEGIN
 p:=public.native_leave_payload_v1(v);
 IF p->>'durationUnit'='minute' THEN RETURN jsonb_build_array(jsonb_build_object('year',extract(year FROM (p->>'startsOn')::date)::integer,'reasonCode',p->>'reasonCode','durationUnit','minute','units',(extract(epoch FROM ((p->>'endsAtLocal')::time-(p->>'startsAtLocal')::time))/60)::integer)); END IF;
 SELECT jsonb_agg(jsonb_build_object('year',y,'reasonCode',p->>'reasonCode','durationUnit','calendar_day','units',n) ORDER BY y) INTO result FROM(SELECT extract(year FROM d)::integer y,count(*)::integer n FROM generate_series((p->>'startsOn')::date,(p->>'endsOn')::date,INTERVAL '1 day') d GROUP BY 1) years;
 RETURN result;
END $$;

CREATE FUNCTION public.native_leave_latest_v1(ctx jsonb,target uuid) RETURNS SETOF public.native_leave_event
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT DISTINCT ON(e.entity_id) e.* FROM public.native_leave_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target ORDER BY e.entity_id,e.revision DESC
$$;

CREATE FUNCTION public.native_leave_balances_v1(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE result jsonb;
BEGIN
 WITH latest AS(SELECT * FROM public.native_leave_latest_v1(ctx,target)),
 effective AS(SELECT DISTINCT ON(payload->>'reasonCode',payload->>'year',payload->>'durationUnit') payload AS p FROM latest WHERE entity_kind='profile' AND status='approved' ORDER BY payload->>'reasonCode',payload->>'year',payload->>'durationUnit',recorded_at DESC,id DESC),
 request_records AS MATERIALIZED(SELECT * FROM latest WHERE entity_kind='request'),
 requested AS(SELECT r.status,a FROM request_records r CROSS JOIN LATERAL jsonb_array_elements(public.native_leave_allocations_v1(r.payload)) a),
 pools AS(SELECT p->>'reasonCode' AS reason_code,(p->>'year')::integer AS balance_year,p->>'durationUnit' AS unit_name FROM effective
  UNION SELECT a->>'reasonCode',(a->>'year')::integer,a->>'durationUnit' FROM requested),
 amounts AS(SELECT pool.*,coalesce(sum((r.a->>'units')::integer) FILTER(WHERE r.status='submitted'),0)::integer reserved,coalesce(sum((r.a->>'units')::integer) FILTER(WHERE r.status='approved'),0)::integer approved FROM pools pool LEFT JOIN requested r ON r.a->>'reasonCode'=pool.reason_code AND (r.a->>'year')::integer=pool.balance_year AND r.a->>'durationUnit'=pool.unit_name GROUP BY pool.reason_code,pool.balance_year,pool.unit_name)
 SELECT coalesce(jsonb_agg(jsonb_build_object('year',a.balance_year,'reasonCode',a.reason_code,'durationUnit',a.unit_name,'mode',coalesce(p->>'mode','unavailable'),'entitledUnits',p->'entitledUnits','reservedUnits',a.reserved,'approvedUnits',a.approved,'availableUnits',CASE WHEN p->>'mode'='confirmed' THEN (p->>'entitledUnits')::integer-a.reserved-a.approved END) ORDER BY a.balance_year,a.reason_code,a.unit_name),'[]') INTO result FROM amounts a LEFT JOIN effective e ON e.p->>'reasonCode'=a.reason_code AND (e.p->>'year')::integer=a.balance_year AND e.p->>'durationUnit'=a.unit_name;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) b WHERE (b->>'availableUnits')::integer<0) THEN RAISE EXCEPTION 'NATIVE_LEAVE_BALANCE_CONFLICT'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.native_leave_snapshot_v1(ctx jsonb,target uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT encode(public.digest(coalesce(jsonb_agg(jsonb_build_array(e.id,e.entity_id,e.revision,e.status,e.payload) ORDER BY e.id)::text,'[]'),'sha256'),'hex') FROM public.native_leave_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target
$$;

CREATE FUNCTION public.native_leave_independent_v1(ctx jsonb,target uuid,entity uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.employment_contract ec WHERE ec.id=target AND ec.person_id=(ctx->>'actorPersonId')::uuid)
  AND NOT EXISTS(SELECT 1 FROM public.native_leave_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target AND e.entity_id=entity AND e.command IN ('create','update_draft','submit','profile_propose') AND(e.actor_person_id=(ctx->>'actorPersonId')::uuid OR e.actor_membership_id=(ctx->>'membershipId')::uuid OR e.actor_email=ctx->>'actorEmail'))
$$;

CREATE FUNCTION public.native_leave_entity_v1(ctx jsonb,e public.native_leave_event) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE history_value jsonb; first_event public.native_leave_event; restricted_value text; review_allowed boolean;
BEGIN
 restricted_value:=CASE WHEN e.entity_kind='profile' THEN CASE WHEN e.payload->>'reasonCode'='19' THEN 'standard' ELSE 'restricted' END ELSE e.payload->>'confidentiality' END;
 IF NOT public.native_leave_authorized_v1(ctx,e.contract_id,'read',CASE WHEN e.entity_kind='profile' THEN 'draft' ELSE e.status END,restricted_value) THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 SELECT * INTO first_event FROM public.native_leave_event WHERE entity_id=e.entity_id AND tenant_id=e.tenant_id AND source_binding_id=e.source_binding_id AND contract_id=e.contract_id AND revision=1;
 SELECT jsonb_agg(jsonb_build_object('version',x.revision,'command',x.command,'status',x.status,'payload',x.payload,'reason',x.reason,'evidenceStatus',x.evidence_status,'manualValidationConfirmed',x.manual_validation_confirmed,'recordedAt',x.recorded_at,'actorLabel',x.actor_label) ORDER BY x.revision) INTO history_value FROM public.native_leave_event x WHERE x.entity_id=e.entity_id AND x.tenant_id=e.tenant_id AND x.source_binding_id=e.source_binding_id AND x.contract_id=e.contract_id;
 IF e.entity_kind='profile' THEN review_allowed:=e.status='pending' AND public.action_center_context_has_capability(ctx,'leave.request.all.manage') AND public.native_leave_authorized_v1(ctx,e.contract_id,'approve','submitted',restricted_value) AND public.native_leave_independent_v1(ctx,e.contract_id,e.entity_id);
 ELSE review_allowed:=e.status='submitted' AND public.native_leave_authorized_v1(ctx,e.contract_id,'approve',e.status,restricted_value) AND public.native_leave_independent_v1(ctx,e.contract_id,e.entity_id); END IF;
 RETURN jsonb_build_object('id',e.entity_id,'version',e.revision,'status',e.status,'payload',e.payload,'createdAt',first_event.recorded_at,'authorLabel',first_event.actor_label,
 'canUpdate',e.entity_kind='request' AND e.revision<100 AND public.native_leave_authorized_v1(ctx,e.contract_id,'update_draft',e.status,restricted_value),
 'canSubmit',e.entity_kind='request' AND e.revision<100 AND public.native_leave_authorized_v1(ctx,e.contract_id,'submit',e.status,restricted_value),
 'canReview',e.revision<100 AND review_allowed,
 'canCancel',e.entity_kind='request' AND e.revision<100 AND public.native_leave_authorized_v1(ctx,e.contract_id,'cancel',e.status,restricted_value) AND(e.status<>'approved' OR public.native_leave_independent_v1(ctx,e.contract_id,e.entity_id)),
 'history',history_value);
END $$;

CREATE FUNCTION public.native_leave_bootstrap_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; subject jsonb; employment jsonb; requests jsonb; profiles jsonb; balances jsonb;
BEGIN
 ctx:=public.native_leave_context_v1(p); PERFORM public.native_employment_lifecycle_lock_v1(ctx,target); subject:=public.native_employment_lifecycle_subject_v1(ctx,target); employment:=public.native_employment_lifecycle_state_v1(ctx,target,subject);
 IF NOT public.native_leave_authorized_v1(ctx,target,'read','draft','standard') THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 IF(SELECT count(*) FROM public.native_leave_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target)>5000
  OR(SELECT count(*) FROM public.native_leave_latest_v1(ctx,target) WHERE entity_kind='request')>1000 OR(SELECT count(*) FROM public.native_leave_latest_v1(ctx,target) WHERE entity_kind='profile')>500 THEN RAISE EXCEPTION 'NATIVE_LEAVE_LIMIT'; END IF;
 -- Complete disclosure fails closed if one row falls outside current authority.
 -- It never describes a filtered or clipped ledger as a complete balance review.
 SELECT coalesce(jsonb_agg(public.native_leave_entity_v1(ctx,e) ORDER BY e.recorded_at DESC,e.entity_id),'[]') INTO requests FROM public.native_leave_latest_v1(ctx,target) e WHERE e.entity_kind='request';
 SELECT coalesce(jsonb_agg(public.native_leave_entity_v1(ctx,e) ORDER BY e.recorded_at DESC,e.entity_id),'[]') INTO profiles FROM public.native_leave_latest_v1(ctx,target) e WHERE e.entity_kind='profile';
 balances:=public.native_leave_balances_v1(ctx,target);
 IF jsonb_array_length(balances)>500 THEN RAISE EXCEPTION 'NATIVE_LEAVE_LIMIT'; END IF;
 RETURN jsonb_build_object('version','native-leave-workflow.v1','scopeVersion',public.native_leave_scope_v1(ctx,subject),'snapshotVersion',public.native_leave_snapshot_v1(ctx,target),'subject',subject,'employment',employment,
 'permissions',jsonb_build_object('canCreate',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.native_leave_authorized_v1(ctx,target,'create','draft','standard'),'canProposeProfile',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'leave.request.all.manage') AND public.native_leave_authorized_v1(ctx,target,'create','draft','standard')),
 'complete',true,'requests',requests,'profileProposals',profiles,'balances',balances);
END $$;

CREATE FUNCTION public.native_leave_attempt_v1(p jsonb,target uuid,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; subject jsonb; e public.native_leave_event; confidentiality text;
BEGIN
 ctx:=public.native_leave_context_v1(p); subject:=public.native_employment_lifecycle_subject_v1(ctx,target);
 SELECT * INTO e FROM public.native_leave_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key AND contract_id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_LEAVE_NOT_FOUND'; END IF;
 IF e.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR e.identity_token IS DISTINCT FROM subject->>'identityToken' OR e.registration_id IS DISTINCT FROM(subject->>'registrationId')::uuid THEN RAISE EXCEPTION 'NATIVE_LEAVE_SCOPE_CHANGED'; END IF;
 confidentiality:=CASE WHEN e.entity_kind='profile' THEN CASE WHEN e.payload->>'reasonCode'='19' THEN 'standard' ELSE 'restricted' END ELSE e.payload->>'confidentiality' END;
 IF NOT public.native_leave_authorized_v1(ctx,target,'read',CASE WHEN e.entity_kind='profile' THEN 'draft' ELSE e.status END,confidentiality) THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;

CREATE FUNCTION public.native_leave_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; subject jsonb; employment jsonb; current_event public.native_leave_event; prior public.native_leave_event; effective_profile public.native_leave_event;
 target uuid; entity uuid; kind text; command_name text; status_value text; payload_value jsonb; confidentiality text; fingerprint text; receipt_value jsonb;
 revision_value integer; owner_membership uuid; owner_person uuid; owner_email text; base_profile uuid; balance_value jsonb; allocation jsonb; pool jsonb; r public.native_leave_event; other jsonb;
BEGIN
 ctx:=public.native_leave_context_v1(p);
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['command','contractId','employmentVersion','entityId','evidenceStatus','expectedVersion','identityToken','manualValidationConfirmed','payload','reason','scopeVersion','snapshotVersion']::text[]
  OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR body->>'contractId' IS NULL OR body->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'expectedVersion') IS DISTINCT FROM 'number' OR body->>'expectedVersion'!~'^\d+$' OR(body->>'expectedVersion')::numeric>100
  OR jsonb_typeof(body->'manualValidationConfirmed') IS DISTINCT FROM 'boolean'
 THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 command_name:=body->>'command'; target:=(body->>'contractId')::uuid; kind:=CASE WHEN command_name LIKE 'profile_%' THEN 'profile' ELSE 'request' END;
 IF command_name IS NULL OR command_name NOT IN ('create','update_draft','submit','approve','reject','cancel','profile_propose','profile_approve','profile_reject') THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 -- Reject a read-only actor before inspecting the actor's employment link.
 -- This preliminary capability gate never replaces the exact scoped check below.
 IF NOT EXISTS(SELECT 1 FROM unnest(CASE command_name
  WHEN 'create' THEN ARRAY['leave.request.self.create','leave.request.area.create','leave.request.all.manage']
  WHEN 'update_draft' THEN ARRAY['leave.request.self.update','leave.request.area.update','leave.request.all.manage']
  WHEN 'submit' THEN ARRAY['leave.request.self.submit','leave.request.area.submit','leave.request.all.manage']
  WHEN 'approve' THEN ARRAY['leave.request.area.decide','leave.request.all.manage']
  WHEN 'reject' THEN ARRAY['leave.request.area.decide','leave.request.all.manage']
  WHEN 'cancel' THEN ARRAY['leave.request.self.cancel','leave.request.area.cancel_pending','leave.request.area.cancel_approved','leave.request.all.manage']
  ELSE ARRAY['leave.request.all.manage'] END) cap WHERE public.action_center_context_has_capability(ctx,cap)) THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'NATIVE_LEAVE_EMPLOYMENT_REQUIRED'; END IF;
 PERFORM public.native_employment_lifecycle_lock_v1(ctx,target); subject:=public.native_employment_lifecycle_subject_v1(ctx,target);
 fingerprint:=encode(public.digest(public.native_leave_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.native_leave_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM fingerprint OR prior.contract_id<>target THEN RAISE EXCEPTION 'NATIVE_LEAVE_IDEMPOTENCY_REUSE'; END IF;
  RETURN public.native_leave_attempt_v1(p,target,key);
 END IF;
 IF body->>'identityToken' IS DISTINCT FROM subject->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_LEAVE_IDENTITY_CHANGED'; END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_leave_scope_v1(ctx,subject) THEN RAISE EXCEPTION 'NATIVE_LEAVE_SCOPE_CHANGED'; END IF;
 employment:=public.native_employment_lifecycle_state_v1(ctx,target,subject);
 IF body->>'employmentVersion' IS DISTINCT FROM employment->>'version' THEN RAISE EXCEPTION 'NATIVE_LEAVE_EMPLOYMENT_CHANGED'; END IF;
 IF body->>'snapshotVersion' IS DISTINCT FROM public.native_leave_snapshot_v1(ctx,target) THEN RAISE EXCEPTION 'NATIVE_LEAVE_SNAPSHOT_CHANGED'; END IF;
 IF command_name IN ('create','profile_propose') THEN
  IF body->'entityId' IS DISTINCT FROM 'null'::jsonb OR body->>'expectedVersion'<>'0' THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
  entity:=gen_random_uuid(); revision_value:=1; owner_membership:=(ctx->>'membershipId')::uuid; owner_person:=(ctx->>'actorPersonId')::uuid; owner_email:=ctx->>'actorEmail';
  status_value:=CASE WHEN kind='profile' THEN 'pending' ELSE 'draft' END;
 ELSE
  IF jsonb_typeof(body->'entityId') IS DISTINCT FROM 'string' OR body->>'entityId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
  entity:=(body->>'entityId')::uuid;
  SELECT * INTO current_event FROM public.native_leave_latest_v1(ctx,target) e WHERE e.entity_id=entity AND e.entity_kind=kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_LEAVE_NOT_FOUND'; END IF;
  IF current_event.revision<>(body->>'expectedVersion')::integer THEN RAISE EXCEPTION 'NATIVE_LEAVE_VERSION_CHANGED'; END IF;
  IF current_event.revision>=100 THEN RAISE EXCEPTION 'NATIVE_LEAVE_LIMIT'; END IF;
  revision_value:=current_event.revision+1; owner_membership:=current_event.owner_membership_id; owner_person:=current_event.owner_person_id; owner_email:=current_event.owner_email; base_profile:=current_event.profile_base_id;
  payload_value:=current_event.payload;
 END IF;
 IF command_name IN ('create','update_draft') THEN payload_value:=public.native_leave_payload_v1(body->'payload');
 ELSIF command_name='profile_propose' THEN payload_value:=public.native_leave_profile_v1(body->'payload');
 ELSIF body->'payload' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 IF command_name IN ('create','update_draft') THEN
  IF body->'reason' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 ELSE
  IF jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 1000 OR body->>'reason'~'[<>[:cntrl:]]' OR body->>'reason'<>normalize(btrim(body->>'reason'),NFC) THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 END IF;
 confidentiality:=CASE WHEN kind='profile' THEN CASE WHEN payload_value->>'reasonCode'='19' THEN 'standard' ELSE 'restricted' END ELSE payload_value->>'confidentiality' END;
 IF kind='profile' THEN
  IF NOT public.action_center_context_has_capability(ctx,'leave.request.all.manage') OR NOT public.native_leave_authorized_v1(ctx,target,CASE WHEN command_name='profile_propose' THEN 'create' ELSE 'approve' END,CASE WHEN command_name='profile_propose' THEN 'draft' ELSE 'submitted' END,confidentiality) THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
  IF command_name<>'profile_propose' AND current_event.status<>'pending' THEN RAISE EXCEPTION 'NATIVE_LEAVE_STATE_INVALID'; END IF;
  IF command_name<>'profile_propose' AND NOT public.native_leave_independent_v1(ctx,target,entity) THEN RAISE EXCEPTION 'NATIVE_LEAVE_MAKER_CHECKER_REQUIRED'; END IF;
  SELECT * INTO effective_profile FROM public.native_leave_latest_v1(ctx,target) e WHERE e.entity_kind='profile' AND e.status='approved' AND e.payload->>'reasonCode'=payload_value->>'reasonCode' AND e.payload->>'year'=payload_value->>'year' AND e.payload->>'durationUnit'=payload_value->>'durationUnit' ORDER BY e.recorded_at DESC,e.id DESC LIMIT 1;
  IF command_name='profile_propose' THEN base_profile:=effective_profile.id;
  ELSIF command_name='profile_approve' AND effective_profile.id IS DISTINCT FROM base_profile THEN RAISE EXCEPTION 'NATIVE_LEAVE_PROFILE_CHANGED'; END IF;
  IF command_name='profile_approve' THEN status_value:='approved'; ELSIF command_name='profile_reject' THEN status_value:='rejected'; END IF;
 ELSE
  IF NOT public.native_leave_authorized_v1(ctx,target,command_name,CASE WHEN command_name='create' THEN 'draft' ELSE current_event.status END,confidentiality) THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
  IF command_name='update_draft' AND(payload_value->>'reasonCode' IS DISTINCT FROM current_event.payload->>'reasonCode' OR payload_value->>'durationUnit' IS DISTINCT FROM current_event.payload->>'durationUnit' OR payload_value->>'confidentiality' IS DISTINCT FROM current_event.payload->>'confidentiality') THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
  IF command_name IN ('approve','reject') OR command_name='cancel' AND current_event.status='approved' THEN
   IF NOT public.native_leave_independent_v1(ctx,target,entity) THEN RAISE EXCEPTION 'NATIVE_LEAVE_MAKER_CHECKER_REQUIRED'; END IF;
  END IF;
  status_value:=CASE command_name WHEN 'create' THEN 'draft' WHEN 'update_draft' THEN 'draft' WHEN 'submit' THEN 'submitted' WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' END;
 END IF;
 IF command_name='approve' THEN
  IF body->'manualValidationConfirmed' IS DISTINCT FROM 'true'::jsonb OR body->>'evidenceStatus' IS NULL OR body->>'evidenceStatus' NOT IN ('verified','not_required') OR confidentiality='restricted' AND body->>'evidenceStatus'<>'verified' THEN RAISE EXCEPTION 'NATIVE_LEAVE_EVIDENCE_REQUIRED'; END IF;
 ELSIF command_name='profile_approve' THEN
  IF body->'manualValidationConfirmed' IS DISTINCT FROM 'true'::jsonb OR body->'evidenceStatus' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_LEAVE_EVIDENCE_REQUIRED'; END IF;
 ELSIF body->'manualValidationConfirmed' IS DISTINCT FROM 'false'::jsonb OR body->'evidenceStatus' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_LEAVE_INPUT_INVALID'; END IF;
 IF kind='request' AND command_name IN ('create','update_draft','submit','approve') THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(employment->'intervals') i WHERE payload_value->>'startsOn'>=i->>'startDate' AND(i->'endDate'='null'::jsonb OR payload_value->>'endsOn'<=i->>'endDate')) THEN RAISE EXCEPTION 'NATIVE_LEAVE_PERIOD_OUTSIDE_EMPLOYMENT'; END IF;
 END IF;
 IF kind='request' AND command_name IN ('submit','approve') THEN
  FOR r IN SELECT * FROM public.native_leave_latest_v1(ctx,target) e WHERE e.entity_kind='request' AND e.status IN ('submitted','approved') AND e.entity_id<>entity LOOP
   other:=r.payload;
   IF payload_value->>'startsOn'<=other->>'endsOn' AND other->>'startsOn'<=payload_value->>'endsOn'
    AND NOT(payload_value->>'durationUnit'='minute' AND other->>'durationUnit'='minute' AND(payload_value->>'endsAtLocal'<=other->>'startsAtLocal' OR other->>'endsAtLocal'<=payload_value->>'startsAtLocal')) THEN RAISE EXCEPTION 'NATIVE_LEAVE_OVERLAP'; END IF;
  END LOOP;
  balance_value:=public.native_leave_balances_v1(ctx,target);
  FOR allocation IN SELECT a FROM jsonb_array_elements(public.native_leave_allocations_v1(payload_value)) a LOOP
   SELECT b INTO pool FROM jsonb_array_elements(balance_value) b WHERE b->>'year'=allocation->>'year' AND b->>'reasonCode'=allocation->>'reasonCode' AND b->>'durationUnit'=allocation->>'durationUnit';
   IF pool IS NULL OR pool->>'mode'='unavailable' THEN RAISE EXCEPTION 'NATIVE_LEAVE_BALANCE_UNAVAILABLE'; END IF;
   IF pool->>'mode'='confirmed' AND(pool->>'availableUnits')::integer+(CASE WHEN command_name='approve' THEN(allocation->>'units')::integer ELSE 0 END)<(allocation->>'units')::integer THEN RAISE EXCEPTION 'NATIVE_LEAVE_BALANCE_INSUFFICIENT'; END IF;
  END LOOP;
 END IF;
 IF(SELECT count(*) FROM public.native_leave_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target)>=5000
  OR command_name='create' AND(SELECT count(*) FROM public.native_leave_latest_v1(ctx,target) WHERE entity_kind='request')>=1000
  OR command_name='profile_propose' AND(SELECT count(*) FROM public.native_leave_latest_v1(ctx,target) WHERE entity_kind='profile')>=500 THEN RAISE EXCEPTION 'NATIVE_LEAVE_LIMIT'; END IF;
 PERFORM public.native_employment_catalog_capacity_v1(65536);
 receipt_value:=jsonb_build_object('version','native-leave-workflow.v1','command',command_name,'contractId',target,'entityId',entity,'entityVersion',revision_value,'status',status_value,'payload',payload_value,'requestSha256',fingerprint,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_leave_event(tenant_id,source_binding_id,contract_id,registration_id,identity_token,scope_version,employment_version,entity_id,entity_kind,revision,command,status,payload,profile_base_id,reason,evidence_status,manual_validation_confirmed,owner_membership_id,owner_person_id,owner_email,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,actor_label,release_sha,request_key,request_sha256,receipt)
 VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,target,(subject->>'registrationId')::uuid,subject->>'identityToken',body->>'scopeVersion',body->>'employmentVersion',entity,kind,revision_value,command_name,status_value,payload_value,base_profile,body->>'reason',body->>'evidenceStatus',(body->>'manualValidationConfirmed')::boolean,owner_membership,owner_person,owner_email,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,ctx->>'actorLabel',p->>'releaseSha',key,fingerprint,receipt_value);
 -- A lower replacement balance cannot overdraw existing approved/reserved units.
 IF jsonb_array_length(public.native_leave_balances_v1(ctx,target))>500 THEN RAISE EXCEPTION 'NATIVE_LEAVE_LIMIT'; END IF;
 RETURN receipt_value;
END $$;

REVOKE ALL ON FUNCTION public.native_leave_immutable_v1(),public.native_leave_context_v1(jsonb),public.native_leave_authorized_v1(jsonb,uuid,text,text,text),public.native_leave_scope_v1(jsonb,jsonb),public.native_leave_serialized_v1(jsonb),public.native_leave_payload_v1(jsonb),public.native_leave_profile_v1(jsonb),public.native_leave_allocations_v1(jsonb),public.native_leave_latest_v1(jsonb,uuid),public.native_leave_balances_v1(jsonb,uuid),public.native_leave_snapshot_v1(jsonb,uuid),public.native_leave_independent_v1(jsonb,uuid,uuid),public.native_leave_entity_v1(jsonb,public.native_leave_event),public.native_leave_bootstrap_v1(jsonb,uuid),public.native_leave_attempt_v1(jsonb,uuid,uuid),public.native_leave_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_leave_bootstrap_v1(jsonb,uuid),public.native_leave_attempt_v1(jsonb,uuid,uuid),public.native_leave_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
