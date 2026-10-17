-- DRAFT: additive family submissions and independent administrative review.
-- No role assignment, capability grant, payroll eligibility, salary or payment.
-- Must run only in an admitted transaction after actual PG17/18 validation.
DO $prerequisites$
BEGIN
 IF to_regclass('public.native_family_storage_policy') IS NOT NULL OR to_regclass('public.native_family_request') IS NOT NULL OR to_regclass('public.native_family_request_event') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'native_family_%') THEN RAISE EXCEPTION 'NATIVE_FAMILY_ALREADY_INSTALLED'; END IF;
 IF to_regclass('public.school_certificate_blob') IS NULL OR to_regclass('public.employee_family_member') IS NULL
  OR to_regclass('public.school_certificate_record') IS NULL
  OR to_regprocedure('public.native_account_contract_v1(uuid,uuid,uuid,boolean)') IS NULL
  OR to_regprocedure('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)') IS NULL
  OR to_regprocedure('public.employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)') IS NULL
  OR to_regprocedure('public.school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)') IS NULL
  OR to_regprocedure('public.school_certificate_native_family_v5(jsonb,uuid)') IS NULL
  OR to_regprocedure('public.school_certificate_storage_reserve_v1(uuid,text,integer)') IS NULL
  OR to_regprocedure('public.school_certificate_date_v3(text,boolean)') IS NULL
  OR to_regprocedure('public.native_salary_serialized_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'NATIVE_FAMILY_PREREQUISITE'; END IF;
END $prerequisites$;

-- Exact source and security metadata for the existing authority, family and
-- shared-blob helpers. Any upstream change requires independent reconciliation.
DO $source_pins$
DECLARE signature text;fingerprint text;configuration text[];volatility "char";f pg_proc;
BEGIN
 FOR signature,fingerprint,configuration,volatility IN SELECT * FROM(VALUES
 ('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)','bf2c0d9114c1c3f66636ba8d89f49a96133c9f4addcb49cee32cd5d17cc0e0bc',ARRAY['search_path=public, pg_temp']::text[],'v'),
 ('public.action_center_context_has_capability(jsonb,text)','2c11f52b97664769613495b4929de39ac008181fbaa5ab701c028e92f9d82df8',ARRAY['search_path=public, pg_temp']::text[],'i'),
 ('public.native_account_contract_v1(uuid,uuid,uuid,boolean)','09afd04c00e7c6e2ac726cf18b277889e20b9019085b00080f4f3a169ffe79bc',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v'),
 ('public.school_certificate_storage_reserve_v1(uuid,text,integer)','f348f462206e4765c85f7fe6ea3cd4f6aa1dce5a7e5711c6f690ebf94e72e242',ARRAY['search_path=public, pg_temp']::text[],'v'),
 ('public.school_certificate_storage_capacity_v1()','c336af98a96d8e692a682a79a2a47b490a917837b54064db1b76847d73f8e375',ARRAY['search_path=public, pg_temp']::text[],'v'),
 ('public.employee_family_subject_v2(jsonb,uuid,boolean)','fa3be7c2b8d2d803a6a0ee389788a2a875c6537d22e6f02075e4f5de89bafa47',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v'),
 ('public.employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)','8e5636c0d63d41953995f3daf35955b03a1904502adad872060564d5214c9c71',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v'),
 ('public.school_certificate_family_v3(jsonb,uuid,text,text,text,boolean)','56de0f30959b733db61e1359c2d7a03755f2d870e10e1560acd2125ec7790802',ARRAY['search_path=public, pg_temp']::text[],'v'),
 ('public.school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)','e24b10789a8821914c9e93ede0c2ee63bb6f494ab6f3e661902f38724fb85387',ARRAY['search_path=public, pg_temp']::text[],'v'),
 ('public.school_certificate_native_family_v5(jsonb,uuid)','9204d4fd4350ce9f66f5544422a01453421286e7b278a349d344a22f9338e042',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v'),
 ('public.school_certificate_records_v3(jsonb,jsonb)','7e9a9a73620d39969442c245c8d8cd2f3698d1f213d1edb806875a3c95015929',ARRAY['search_path=public, pg_temp']::text[],'s'),
 ('public.school_certificate_date_v3(text,boolean)','2c24f93bf93796ba2b98388bc279c591fa6d6900c7d7f82e5db15bb8328cd9eb',ARRAY['search_path=public, pg_temp']::text[],'i'),
 ('public.native_salary_serialized_v1(jsonb)','44227bb4f1698c0b525bd4bbd1b529788ccbcb1518a1762bbe96b3d1490a3fff',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i')
 )pins(signature,sha,configuration,volatility) LOOP
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(signature);
  IF f.oid IS NULL OR f.proowner<>current_user::regrole OR NOT f.prosecdef OR f.proisstrict OR f.prokind<>'f' OR f.proparallel<>'u' OR f.proleakproof OR f.prosupport<>0 OR f.proconfig IS DISTINCT FROM configuration OR f.provolatile<>volatility
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee<>f.proowner AND NOT(signature IN('public.employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)','public.school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)') AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
   OR has_function_privilege('municontrol_actions_runtime_app',f.oid,'EXECUTE') IS DISTINCT FROM(signature IN('public.employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)','public.school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)'))
   OR encode(public.digest(replace(f.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>fingerprint THEN RAISE EXCEPTION 'NATIVE_FAMILY_PREREQUISITE_DRIFT' USING DETAIL=signature;END IF;
 END LOOP;
END $source_pins$;

-- Definitions only: no role, membership or override receives these keys.
DO $capability_absence$ BEGIN
 IF EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key IN('employee.family.self.read','employee.family.self.submit','employee.family.review')) THEN RAISE EXCEPTION 'NATIVE_FAMILY_CAPABILITY_ALREADY_DEFINED';END IF;
END $capability_absence$;
INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES
 ('employee.family.self.read','Consultar presentaciones familiares propias','Consulta solicitudes y documentos del contrato propio verificado.','tenant','standard'),
 ('employee.family.self.submit','Presentar datos familiares propios','Presenta y corrige datos del contrato propio para revisión de Personal.','tenant','privileged'),
 ('employee.family.review','Revisar presentaciones familiares','Consulta solicitudes del ámbito municipal y exige independencia para registrar decisiones.','tenant','restricted');

CREATE TABLE public.native_family_storage_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),ledger_budget_bytes bigint NOT NULL CHECK(ledger_budget_bytes=67108864),event_bound_bytes integer NOT NULL CHECK(event_bound_bytes=16384),request_bound_bytes integer NOT NULL CHECK(request_bound_bytes=16384)
);
INSERT INTO public.native_family_storage_policy(singleton,ledger_budget_bytes,event_bound_bytes,request_bound_bytes) VALUES(true,67108864,16384,16384);
ALTER TABLE public.native_family_storage_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_family_storage_policy FROM PUBLIC,municontrol_actions_runtime_app;

CREATE TABLE public.native_family_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),person_id uuid NOT NULL REFERENCES public.person_identity(id),
 native_registration_id uuid NOT NULL REFERENCES public.native_employee_registration(id),
 submitter_membership_id uuid NOT NULL,submitter_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 submitter_email text NOT NULL CHECK(submitter_email=lower(btrim(submitter_email)) AND position('@' IN submitter_email)>1),
 request_kind text NOT NULL CHECK(request_kind IN('child','schooling')),
 subject_version text NOT NULL CHECK(subject_version~'^[a-f0-9]{64}$'),subject_snapshot jsonb NOT NULL CHECK(jsonb_typeof(subject_snapshot)='object'),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(submitter_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK(person_id=submitter_person_id)
);
CREATE TABLE public.native_family_request_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 request_id uuid NOT NULL,request_version integer NOT NULL CHECK(request_version BETWEEN 1 AND 1000),
 actor_membership_id uuid NOT NULL,actor_person_id uuid REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email)) AND position('@' IN actor_email)>1),actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 160),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),request_key uuid NOT NULL,
 body_sha256 text NOT NULL CHECK(body_sha256~'^[a-f0-9]{64}$'),command text NOT NULL CHECK(command IN('submit','resubmit','request_correction','accept','reject')),
 state text NOT NULL CHECK(state IN('submitted','correction_requested','accepted','rejected')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500 AND reason=btrim(reason) AND reason!~'[[:cntrl:]<>]'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND NOT((payload#>'{document}')?'contentBase64')),
 blob_sha256 text,administrative_record jsonb,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,request_id,request_version),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,request_id) REFERENCES public.native_family_request(tenant_id,id),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,blob_sha256) REFERENCES public.school_certificate_blob(tenant_id,sha256),
 CHECK((command IN('submit','resubmit') AND state='submitted') OR(command='request_correction' AND state='correction_requested') OR(command='accept' AND state='accepted') OR(command='reject' AND state='rejected')),
 CHECK((command='accept')=(administrative_record IS NOT NULL)),
 CHECK((payload->'document'='null'::jsonb AND blob_sha256 IS NULL) OR(payload#>>'{document,sha256}'=blob_sha256 AND blob_sha256 IS NOT NULL))
);
CREATE INDEX native_family_request_queue_idx ON public.native_family_request(tenant_id,source_binding_id,received_at,id);
CREATE INDEX native_family_request_owner_idx ON public.native_family_request(tenant_id,source_binding_id,submitter_membership_id,contract_id,received_at,id);
CREATE INDEX native_family_request_history_idx ON public.native_family_request_event(tenant_id,request_id,request_version DESC);
ALTER TABLE public.native_family_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_family_request_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_family_request,public.native_family_request_event FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.native_family_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'NATIVE_FAMILY_IMMUTABLE';END $$;
CREATE TRIGGER native_family_storage_policy_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_family_storage_policy FOR EACH STATEMENT EXECUTE FUNCTION public.native_family_immutable_v1();
CREATE TRIGGER native_family_request_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_family_request FOR EACH STATEMENT EXECUTE FUNCTION public.native_family_immutable_v1();
CREATE TRIGGER native_family_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_family_request_event FOR EACH STATEMENT EXECUTE FUNCTION public.native_family_immutable_v1();

CREATE FUNCTION public.native_family_hash_v1(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(v),'sha256'),'hex')
$$;
CREATE FUNCTION public.native_family_context_v1(p jsonb,mode text,writing boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;resolved jsonb;source_value text;required text;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']::text[]
  OR mode IS NULL OR mode NOT IN('self','review') OR writing IS NULL THEN RAISE EXCEPTION 'NATIVE_FAMILY_SESSION_INVALID';END IF;
 ctx:=public.action_center_assert_tenant_read_session_v2(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid);
 IF NOT public.action_center_context_has_capability(ctx,'actions.read') THEN RAISE EXCEPTION 'NATIVE_FAMILY_FORBIDDEN';END IF;
 IF mode='self' THEN
  IF NOT public.action_center_context_has_capability(ctx,'employee.family.self.read') OR writing AND NOT public.action_center_context_has_capability(ctx,'employee.family.self.submit') THEN RAISE EXCEPTION 'NATIVE_FAMILY_FORBIDDEN';END IF;
 ELSE
  IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') OR NOT public.action_center_context_has_capability(ctx,'employee.family.review') OR writing AND NOT public.action_center_context_has_capability(ctx,'employee.record.propose') THEN RAISE EXCEPTION 'NATIVE_FAMILY_FORBIDDEN';END IF;
 END IF;
 IF length(lower(btrim(p->>'actorEmail'))) NOT BETWEEN 3 AND 320 THEN RAISE EXCEPTION 'NATIVE_FAMILY_SESSION_INVALID';END IF;
 ctx:=ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce((SELECT nullif(btrim(full_name),'') FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid),'Responsable municipal'),160),'selfState','unlinked','selfSubject',NULL);
 IF mode='self' AND ctx->>'employmentContractId' IS NOT NULL THEN
  SELECT source_system INTO source_value FROM public.employment_contract WHERE id=(ctx->>'employmentContractId')::uuid;
  IF source_value IS DISTINCT FROM 'MUNICONTROL' THEN RETURN ctx||jsonb_build_object('selfState','reference');END IF;
  resolved:=public.native_account_contract_v1((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'employmentContractId')::uuid,true);
  IF resolved->>'personId' IS DISTINCT FROM ctx->>'actorPersonId' THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDENTITY_CHANGED';END IF;
  ctx:=ctx||jsonb_build_object('selfState','native','selfSubject',resolved->'subject');
 END IF;
 RETURN ctx;
END $$;

CREATE FUNCTION public.native_family_independent_v1(ctx jsonb,r jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT(r->>'submitter_membership_id')::uuid IS DISTINCT FROM(ctx->>'membershipId')::uuid
  AND r->>'submitter_email' IS DISTINCT FROM ctx->>'actorEmail'
  AND((ctx->>'actorPersonId') IS NULL OR(r->>'submitter_person_id')::uuid IS DISTINCT FROM(ctx->>'actorPersonId')::uuid)
$$;

CREATE FUNCTION public.native_family_receipt_v1(ctx jsonb,e public.native_family_request_event,replayed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE r public.native_family_request;
BEGIN
 SELECT * INTO r FROM public.native_family_request WHERE tenant_id=e.tenant_id AND id=e.request_id;
 IF NOT FOUND OR e.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid OR e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR e.tenant_id IS DISTINCT FROM(ctx->>'tenantId')::uuid OR e.source_binding_id IS DISTINCT FROM(ctx->>'sourceBindingId')::uuid THEN RAISE EXCEPTION 'NATIVE_FAMILY_NOT_FOUND';END IF;
 RETURN jsonb_build_object('version','native-family-request-receipt.v1','scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId'),
  'key',e.request_key,'requestId',r.id,'requestVersion',e.request_version,'requestKind',r.request_kind,'command',e.command,'state',e.state,'bodySha256',e.body_sha256,'recordedAt',e.recorded_at,'replayed',replayed,'administrativeRecord',e.administrative_record,'payrollModified',false,'benefitGranted',false);
END $$;

CREATE FUNCTION public.native_family_bootstrap_v1(p jsonb,mode text,state_filter text DEFAULT 'all',page_cursor jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;subject_value jsonb;rows_json jsonb;families_json jsonb:='[]'::jsonb;n bigint;family_count integer;returned_count integer;can_submit boolean:=false;
 context_version text;snapshot_version text;event_count bigint;offset_value integer:=0;after_time timestamptz;after_id uuid;last_time timestamptz;last_id uuid;next_cursor jsonb;page_value jsonb;
BEGIN
 ctx:=public.native_family_context_v1(p,mode,false);
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('native-family:ledger:v1',0)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';END IF;
 IF state_filter IS NULL OR state_filter NOT IN('all','submitted','correction_requested','accepted','rejected') OR mode='self' AND state_filter<>'all' THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 context_version:=public.native_family_hash_v1(jsonb_build_object('context',ctx,'principal',p,'view',mode,'filter',state_filter));
 SELECT count(*) INTO event_count FROM public.native_family_request r JOIN public.native_family_request_event x ON x.tenant_id=r.tenant_id AND x.request_id=r.id WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND(mode='review' OR(r.submitter_membership_id=(ctx->>'membershipId')::uuid AND r.submitter_email=ctx->>'actorEmail' AND r.submitter_person_id=(ctx->>'actorPersonId')::uuid AND r.contract_id=(ctx->>'employmentContractId')::uuid));
 snapshot_version:=public.native_family_hash_v1(jsonb_build_object('contextVersion',context_version,'events',event_count));
 IF page_cursor='null'::jsonb THEN page_cursor:=NULL;END IF;
 IF page_cursor IS NOT NULL THEN
  IF jsonb_typeof(page_cursor) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(page_cursor) k) IS DISTINCT FROM ARRAY['after','contextVersion','offset','snapshotVersion','version']::text[]
   OR page_cursor->>'version' IS DISTINCT FROM 'native-family-page-cursor.v1' OR page_cursor->>'contextVersion' IS DISTINCT FROM context_version OR page_cursor->>'snapshotVersion' IS DISTINCT FROM snapshot_version THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
  IF jsonb_typeof(page_cursor->'offset') IS DISTINCT FROM 'number' OR page_cursor->>'offset'!~'^[1-9][0-9]{0,8}$' OR jsonb_typeof(page_cursor->'after') IS DISTINCT FROM 'object'
   OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(page_cursor->'after')k) IS DISTINCT FROM ARRAY['id','receivedAt']::text[] OR page_cursor#>>'{after,id}' IS NULL OR page_cursor#>>'{after,id}'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   OR page_cursor#>>'{after,receivedAt}' IS NULL OR page_cursor#>>'{after,receivedAt}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
  offset_value:=(page_cursor->>'offset')::integer;after_id:=(page_cursor#>>'{after,id}')::uuid;
  BEGIN after_time:=(page_cursor#>>'{after,receivedAt}')::timestamptz;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END;
  IF NOT EXISTS(SELECT 1 FROM public.native_family_request r JOIN LATERAL(SELECT * FROM public.native_family_request_event x WHERE x.tenant_id=r.tenant_id AND x.request_id=r.id ORDER BY x.request_version DESC LIMIT 1)e ON true WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND(mode='review' OR(r.submitter_membership_id=(ctx->>'membershipId')::uuid AND r.submitter_email=ctx->>'actorEmail' AND r.submitter_person_id=(ctx->>'actorPersonId')::uuid AND r.contract_id=(ctx->>'employmentContractId')::uuid)) AND(state_filter='all' OR e.state=state_filter) AND r.id=after_id AND r.received_at=after_time)
   OR(SELECT count(*) FROM public.native_family_request r JOIN LATERAL(SELECT * FROM public.native_family_request_event x WHERE x.tenant_id=r.tenant_id AND x.request_id=r.id ORDER BY x.request_version DESC LIMIT 1)e ON true WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND(mode='review' OR(r.submitter_membership_id=(ctx->>'membershipId')::uuid AND r.submitter_email=ctx->>'actorEmail' AND r.submitter_person_id=(ctx->>'actorPersonId')::uuid AND r.contract_id=(ctx->>'employmentContractId')::uuid)) AND(state_filter='all' OR e.state=state_filter) AND(r.received_at,r.id)<=(after_time,after_id))<>offset_value THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
 END IF;
 IF mode='self' AND ctx->>'selfState'<>'native' THEN
  RETURN jsonb_build_object('version','native-family-requests.v1','view',mode,'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId'),'state',ctx->>'selfState','subject',NULL,'families','[]'::jsonb,'requests','[]'::jsonb,'total',0,'complete',true,'canSubmit',false,'page',jsonb_build_object('size',50,'offset',0,'returned',0,'nextCursor',NULL,'snapshotVersion',snapshot_version,'contextVersion',context_version));
 END IF;
 IF mode='self' THEN
  can_submit:=public.action_center_context_has_capability(ctx,'employee.family.self.submit');
  subject_value:=jsonb_build_object('legajo',ctx#>>'{selfSubject,legajo}','employeeName',ctx#>'{selfSubject,employeeName}','subjectVersion',ctx#>>'{selfSubject,identityToken}');
  WITH family AS MATERIALIZED(SELECT * FROM public.school_certificate_native_family_v5(ctx,(ctx->>'employmentContractId')::uuid) LIMIT 1001)
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('familyRef',jsonb_build_object('kind','own','id',f.family_id),'identityToken',f.identity_token,'familyName',f.family_name,'birthDate',to_char(f.birth_date,'YYYY-MM-DD'),'dni',f.identity_snapshot->>'dni','validFrom',to_char(f.valid_from,'YYYY-MM-DD'),'validTo',to_char(f.family_end_date,'YYYY-MM-DD'),'latestCertificateId',(SELECT h.id FROM public.school_certificate_records_v3(ctx,to_jsonb(f))h ORDER BY h.recorded_at DESC,h.id DESC LIMIT 1),'canPresent',can_submit AND NOT f.identity_review_required) ORDER BY f.family_name,f.family_id),'[]') INTO family_count,families_json FROM family f;
  IF family_count>1000 THEN RAISE EXCEPTION 'NATIVE_FAMILY_LIMIT';END IF;
 END IF;
 SELECT count(*) INTO n FROM public.native_family_request r JOIN LATERAL(SELECT * FROM public.native_family_request_event x WHERE x.tenant_id=r.tenant_id AND x.request_id=r.id ORDER BY x.request_version DESC LIMIT 1)e ON true WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND(mode='review' OR(r.submitter_membership_id=(ctx->>'membershipId')::uuid AND r.submitter_email=ctx->>'actorEmail' AND r.submitter_person_id=(ctx->>'actorPersonId')::uuid AND r.contract_id=(ctx->>'employmentContractId')::uuid)) AND(state_filter='all' OR e.state=state_filter);
 IF page_cursor IS NOT NULL AND offset_value>=n THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
 WITH page_rows AS MATERIALIZED(SELECT r.*,e.state,e.request_version,e.recorded_at AS updated_at,e.blob_sha256 FROM public.native_family_request r JOIN LATERAL(SELECT * FROM public.native_family_request_event x WHERE x.tenant_id=r.tenant_id AND x.request_id=r.id ORDER BY x.request_version DESC LIMIT 1)e ON true
 WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND(mode='review' OR(r.submitter_membership_id=(ctx->>'membershipId')::uuid AND r.submitter_email=ctx->>'actorEmail' AND r.submitter_person_id=(ctx->>'actorPersonId')::uuid AND r.contract_id=(ctx->>'employmentContractId')::uuid)) AND(state_filter='all' OR e.state=state_filter) AND(page_cursor IS NULL OR(r.received_at,r.id)>(after_time,after_id)) ORDER BY r.received_at,r.id LIMIT 50)
 SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.request_kind,'state',r.state,'requestVersion',r.request_version,'recordedAt',r.received_at,'updatedAt',r.updated_at,'legajo',r.subject_snapshot->>'legajo','employeeName',r.subject_snapshot->'employeeName','canResubmit',mode='self' AND r.state='correction_requested' AND r.request_version<999 AND can_submit AND r.subject_version=ctx#>>'{selfSubject,identityToken}','canReview',mode='review' AND r.state IN('submitted','correction_requested') AND r.request_version<1000 AND public.action_center_context_has_capability(ctx,'employee.record.propose') AND public.native_family_independent_v1(ctx,to_jsonb(r)),'documentAvailable',r.blob_sha256 IS NOT NULL) ORDER BY r.received_at,r.id),'[]'),(array_agg(r.received_at ORDER BY r.received_at DESC,r.id DESC))[1],(array_agg(r.id ORDER BY r.received_at DESC,r.id DESC))[1] INTO returned_count,rows_json,last_time,last_id FROM page_rows r;
 IF offset_value+returned_count<n THEN next_cursor:=jsonb_build_object('version','native-family-page-cursor.v1','contextVersion',context_version,'snapshotVersion',snapshot_version,'offset',offset_value+returned_count,'after',jsonb_build_object('receivedAt',last_time,'id',last_id));END IF;
 page_value:=jsonb_build_object('size',50,'offset',offset_value,'returned',returned_count,'nextCursor',next_cursor,'snapshotVersion',snapshot_version,'contextVersion',context_version);
 RETURN jsonb_build_object('version','native-family-requests.v1','view',mode,'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId'),'state',CASE WHEN mode='self' THEN 'native' ELSE 'ready' END,'subject',subject_value,'families',families_json,'requests',rows_json,'total',n,'complete',n=returned_count,'canSubmit',can_submit,'page',page_value);
END $$;

CREATE FUNCTION public.native_family_detail_v1(p jsonb,mode text,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;r public.native_family_request;e public.native_family_request_event;history jsonb;history_count integer;
BEGIN
 ctx:=public.native_family_context_v1(p,mode,false);
 SELECT * INTO r FROM public.native_family_request WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 PERFORM public.native_family_owned_v1(ctx,r,mode);
 SELECT * INTO e FROM public.native_family_request_event WHERE request_id=r.id AND tenant_id=r.tenant_id ORDER BY request_version DESC LIMIT 1;
 IF e.id IS NULL THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';END IF;
 SELECT count(*)::integer,jsonb_agg(jsonb_build_object('id',x.id,'requestVersion',x.request_version,'command',x.command,'state',x.state,'reason',x.reason,'actorLabel',x.actor_label,'recordedAt',x.recorded_at,'document',x.payload->'document') ORDER BY x.request_version) INTO history_count,history FROM public.native_family_request_event x WHERE x.tenant_id=r.tenant_id AND x.request_id=r.id;
 IF history_count<>e.request_version THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('version','native-family-request-detail.v1','view',mode,'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId'),'id',r.id,'kind',r.request_kind,'state',e.state,'requestVersion',e.request_version,'subject',jsonb_build_object('legajo',r.subject_snapshot->>'legajo','employeeName',r.subject_snapshot->'employeeName'),'subjectVersion',r.subject_version,'payload',e.payload,'events',history,
  'canResubmit',mode='self' AND e.state='correction_requested' AND e.request_version<999 AND public.action_center_context_has_capability(ctx,'employee.family.self.submit') AND r.subject_version=ctx#>>'{selfSubject,identityToken}',
  'canReview',mode='review' AND e.state IN('submitted','correction_requested') AND e.request_version<1000 AND public.action_center_context_has_capability(ctx,'employee.record.propose') AND public.native_family_independent_v1(ctx,to_jsonb(r)));
END $$;

CREATE FUNCTION public.native_family_attempt_v1(p jsonb,mode text,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;r public.native_family_request;e public.native_family_request_event;
BEGIN
 ctx:=public.native_family_context_v1(p,mode,false);
 IF key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-family:key:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId')||':'||(ctx->>'membershipId')||':'||key::text,0)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';END IF;
 SELECT * INTO e FROM public.native_family_request_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND OR(mode='self' AND e.command NOT IN('submit','resubmit')) OR(mode='review' AND e.command NOT IN('request_correction','accept','reject')) THEN RAISE EXCEPTION 'NATIVE_FAMILY_NOT_FOUND';END IF;
 SELECT * INTO r FROM public.native_family_request WHERE tenant_id=e.tenant_id AND id=e.request_id;PERFORM public.native_family_owned_v1(ctx,r,mode);
 RETURN public.native_family_receipt_v1(ctx,e,true);
END $$;

CREATE FUNCTION public.native_family_document_v1(p jsonb,mode text,target uuid,revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;r public.native_family_request;e public.native_family_request_event;b public.school_certificate_blob;subject_value jsonb;
BEGIN
 ctx:=public.native_family_context_v1(p,mode,false);
 IF revision IS NULL OR revision NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 SELECT * INTO r FROM public.native_family_request WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;PERFORM public.native_family_owned_v1(ctx,r,mode);
 -- A current binding/source must still resolve the original person before any
 -- historical document bytes leave PostgreSQL. Request ownership is not a URL.
 subject_value:=public.employee_family_subject_v2(ctx,r.contract_id,true);
 IF subject_value->>'personId' IS DISTINCT FROM r.person_id::text OR subject_value->>'identityToken' IS DISTINCT FROM r.subject_version THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDENTITY_CHANGED';END IF;
 SELECT * INTO e FROM public.native_family_request_event WHERE tenant_id=r.tenant_id AND request_id=r.id AND request_version=revision;
 IF e.id IS NULL OR e.blob_sha256 IS NULL THEN RAISE EXCEPTION 'NATIVE_FAMILY_NOT_FOUND';END IF;
 SELECT * INTO b FROM public.school_certificate_blob WHERE tenant_id=r.tenant_id AND sha256=e.blob_sha256;
 IF b.sha256 IS NULL OR b.sha256 IS DISTINCT FROM e.payload#>>'{document,sha256}' OR b.byte_length IS DISTINCT FROM(e.payload#>>'{document,byteLength}')::integer OR encode(public.digest(b.content,'sha256'),'hex')<>b.sha256 THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('version','native-family-request-document.v1','requestId',r.id,'requestVersion',revision,'filename',e.payload#>>'{document,filename}','sha256',b.sha256,'byteLength',b.byte_length,'contentBase64',replace(encode(b.content,'base64'),E'\n',''));
END $$;

CREATE FUNCTION public.native_family_owned_v1(ctx jsonb,r public.native_family_request,mode text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN
 IF r.id IS NULL OR r.tenant_id IS DISTINCT FROM(ctx->>'tenantId')::uuid OR r.source_binding_id IS DISTINCT FROM(ctx->>'sourceBindingId')::uuid THEN RAISE EXCEPTION 'NATIVE_FAMILY_NOT_FOUND';END IF;
 IF mode='self' AND(ctx->>'selfState' IS DISTINCT FROM 'native' OR r.submitter_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid OR r.submitter_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR r.submitter_email IS DISTINCT FROM ctx->>'actorEmail' OR r.contract_id IS DISTINCT FROM(ctx->>'employmentContractId')::uuid) THEN RAISE EXCEPTION 'NATIVE_FAMILY_NOT_FOUND';END IF;
END $$;

CREATE FUNCTION public.native_family_command_check_v1(body jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE proposal boolean;d jsonb;pdf jsonb;field_key text;value text;birth date;start_value date;end_value date;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['command','expectedVersion','payload','reason','requestId','reviewConfirmed','subjectVersion','version']::text[]
  OR body->>'version' IS DISTINCT FROM 'native-family-request-command.v1' OR body->>'command' IS NULL OR body->>'command' NOT IN('submit','resubmit','request_correction','accept','reject')
  OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 500 OR body->>'reason'<>btrim(body->>'reason') OR body->>'reason'~'[[:cntrl:]<>]' OR body->>'reason'<>normalize(body->>'reason',NFC)
  OR jsonb_typeof(body->'expectedVersion') IS DISTINCT FROM 'number' OR body->>'expectedVersion'!~'^(0|[1-9][0-9]{0,2})$' OR octet_length(body::text)>3145728 THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 IF body->>'command'='submit' THEN
  IF body->'requestId' IS DISTINCT FROM 'null'::jsonb OR body->'expectedVersion' IS DISTINCT FROM '0'::jsonb THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 ELSE
  IF jsonb_typeof(body->'requestId') IS DISTINCT FROM 'string' OR body->>'requestId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR(body->>'expectedVersion')::integer<1 THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 END IF;
 proposal:=body->>'command' IN('submit','resubmit');
 IF NOT proposal THEN IF body->'payload' IS DISTINCT FROM 'null'::jsonb OR body->'subjectVersion' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;RETURN;END IF;
 IF jsonb_typeof(body->'subjectVersion') IS DISTINCT FROM 'string' OR body->>'subjectVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(body->'payload') IS DISTINCT FROM 'object'
  OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body->'payload') k) IS DISTINCT FROM ARRAY['definition','document','kind']::text[] OR body#>>'{payload,kind}' IS NULL OR body#>>'{payload,kind}' NOT IN('child','schooling') OR jsonb_typeof(body#>'{payload,definition}') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 d:=body#>'{payload,definition}';pdf:=body#>'{payload,document}';
 IF body#>>'{payload,kind}'='child' THEN
  IF(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d) k) IS DISTINCT FROM ARRAY['birthDate','dni','familyName','validFrom','validTo']::text[] OR jsonb_typeof(d->'familyName') IS DISTINCT FROM 'string' OR length(d->>'familyName') NOT BETWEEN 1 AND 180 OR d->>'familyName'<>btrim(d->>'familyName') OR d->>'familyName'~'[[:cntrl:]<>]' OR d->>'familyName'<>normalize(d->>'familyName',NFC) OR d->>'familyName'!~'[^[:digit:][:space:][:punct:]]' COLLATE "C"
   OR EXISTS(SELECT 1 FROM jsonb_each(d) entry WHERE jsonb_typeof(entry.value) NOT IN('string','null')) OR NOT(d->'dni'='null'::jsonb OR d->>'dni'~'^[0-9]{5,12}$' AND d->>'dni'!~'^0+$') THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
  birth:=public.school_certificate_date_v3(d->>'birthDate');start_value:=public.school_certificate_date_v3(d->>'validFrom');end_value:=public.school_certificate_date_v3(d->>'validTo');
  IF birth>(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date OR end_value<start_value OR start_value<birth OR end_value<birth THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 ELSE
  IF(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d) k) IS DISTINCT FROM ARRAY['course','educationLevel','evidenceMode','expectedCertificateId','expiresOn','familyRef','identityToken','institution','issuedOn','paperReference','presentedOn','schoolYear']::text[]
   OR jsonb_typeof(d->'familyRef') IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d->'familyRef') k) IS DISTINCT FROM ARRAY['id','kind']::text[] OR d#>>'{familyRef,kind}' IS DISTINCT FROM 'own' OR d#>>'{familyRef,id}' IS NULL OR d#>>'{familyRef,id}'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'identityToken') IS DISTINCT FROM 'string' OR d->>'identityToken'!~'^[a-f0-9]{64}$' OR NOT(d->'expectedCertificateId'='null'::jsonb OR jsonb_typeof(d->'expectedCertificateId')='string' AND d->>'expectedCertificateId'~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
   OR EXISTS(SELECT 1 FROM jsonb_each(d-ARRAY['familyRef','schoolYear']) entry WHERE jsonb_typeof(entry.value) NOT IN('string','null')) OR NOT(d->'schoolYear'='null'::jsonb OR jsonb_typeof(d->'schoolYear')='number' AND(d->>'schoolYear'~'^(19|20)[0-9]{2}$' OR d->>'schoolYear'='2100')) THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
  FOREACH field_key IN ARRAY ARRAY['institution','educationLevel','course'] LOOP
   value:=d->>field_key;IF value IS NOT NULL AND(length(value) NOT BETWEEN 1 AND CASE field_key WHEN 'institution' THEN 180 WHEN 'educationLevel' THEN 80 ELSE 100 END OR value<>btrim(value) OR value~'[[:cntrl:]<>]' OR value<>normalize(value,NFC)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
  END LOOP;
  PERFORM public.school_certificate_date_v3(d->>'issuedOn');PERFORM public.school_certificate_date_v3(d->>'presentedOn',true);PERFORM public.school_certificate_date_v3(d->>'expiresOn');
  IF d->>'evidenceMode' IS NULL OR d->>'evidenceMode' NOT IN('pdf','paper_declared') OR(d->>'evidenceMode'='pdf' AND(d->'paperReference' IS DISTINCT FROM 'null'::jsonb OR pdf='null'::jsonb))
   OR(d->>'evidenceMode'='paper_declared' AND(pdf IS DISTINCT FROM 'null'::jsonb OR jsonb_typeof(d->'paperReference') IS DISTINCT FROM 'string' OR length(d->>'paperReference') NOT BETWEEN 5 AND 500 OR d->>'paperReference'<>btrim(d->>'paperReference') OR d->>'paperReference'~'[[:cntrl:]<>]')) THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 END IF;
 IF pdf IS DISTINCT FROM 'null'::jsonb THEN
  IF jsonb_typeof(pdf) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pdf) k) IS DISTINCT FROM ARRAY['contentBase64','filename','sha256']::text[] OR EXISTS(SELECT 1 FROM jsonb_each(pdf) entry WHERE jsonb_typeof(entry.value)<>'string') OR length(pdf->>'filename') NOT BETWEEN 5 AND 180 OR pdf->>'filename'<>btrim(pdf->>'filename') OR lower(right(pdf->>'filename',4))<>'.pdf' OR pdf->>'filename'~'[[:cntrl:]/\\:*?"<>|]' OR pdf->>'sha256'!~'^[a-f0-9]{64}$' OR length(pdf->>'contentBase64') NOT BETWEEN 16 AND 2796204 THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 END IF;
END $$;

-- Technical metadata budget is distinct from the PDF quota. Every open
-- request retains space for one maximum-size terminal decision; excess
-- corrections/new submissions can stop while acceptance/rejection can finish.
CREATE FUNCTION public.native_family_capacity_v1(new_request boolean,terminal boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE policy public.native_family_storage_policy;used_bytes bigint;open_count bigint;required_bytes bigint;physical_reserve bigint;capacity jsonb;
BEGIN
 IF new_request IS NULL OR terminal IS NULL OR new_request AND terminal THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-family:ledger:v1',0)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';END IF;
 SELECT * INTO policy FROM public.native_family_storage_policy WHERE singleton;
 IF policy.singleton IS DISTINCT FROM true THEN RAISE EXCEPTION 'NATIVE_FAMILY_CAPACITY_FULL';END IF;
 SELECT coalesce((SELECT sum(octet_length(to_jsonb(r)::text)) FROM public.native_family_request r),0)+coalesce((SELECT sum(octet_length(to_jsonb(e)::text)) FROM public.native_family_request_event e),0) INTO used_bytes;
 SELECT count(*) INTO open_count FROM public.native_family_request r JOIN LATERAL(SELECT x.state FROM public.native_family_request_event x WHERE x.tenant_id=r.tenant_id AND x.request_id=r.id ORDER BY x.request_version DESC LIMIT 1)e ON e.state IN('submitted','correction_requested');
 IF terminal AND open_count=0 THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
 required_bytes:=policy.event_bound_bytes+CASE WHEN new_request THEN policy.request_bound_bytes ELSE 0 END;
 IF used_bytes+required_bytes+(open_count+CASE WHEN new_request THEN 1 WHEN terminal THEN -1 ELSE 0 END)*policy.event_bound_bytes>policy.ledger_budget_bytes THEN RAISE EXCEPTION 'NATIVE_FAMILY_CAPACITY_FULL';END IF;
 -- Inspect real cluster capacity under its existing lock. Do not reserve a
 -- fake PDF, consume its quota, change policy057 or insert a second blob.
 PERFORM pg_advisory_xact_lock(hashtextextended('school-certificate:storage:v1',0));
 capacity:=public.school_certificate_storage_capacity_v1();
 physical_reserve:=65536+4*(required_bytes+(open_count+CASE WHEN new_request THEN 1 WHEN terminal THEN -1 ELSE 0 END)*policy.event_bound_bytes);
 IF capacity->>'available' IS DISTINCT FROM 'true' OR capacity->>'clusterBytes' IS NULL OR capacity->>'clusterLimitBytes' IS NULL OR capacity->>'clusterReserveBytes' IS NULL
  OR(capacity->>'clusterBytes')::bigint+physical_reserve>(capacity->>'clusterLimitBytes')::bigint-(capacity->>'clusterReserveBytes')::bigint THEN RAISE EXCEPTION 'NATIVE_FAMILY_CAPACITY_FULL';END IF;
END $$;

CREATE FUNCTION public.native_family_command_v1(p jsonb,mode text,body jsonb,key uuid,document_metadata jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;r public.native_family_request;e public.native_family_request_event;prior public.native_family_request_event;
 fingerprint text;command_name text;payload_value jsonb;pdf jsonb;content_value bytea;subject_value jsonb;family_value jsonb;
 new_request uuid;version_value integer;state_value text;canonical_payload jsonb;canonical_result jsonb;administrative_value jsonb;blob_value text;
BEGIN
 ctx:=public.native_family_context_v1(p,mode,true);
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'NATIVE_FAMILY_ISOLATION_UNSUPPORTED';END IF;
 IF key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'NATIVE_FAMILY_INPUT_INVALID';END IF;
 PERFORM public.native_family_command_check_v1(body);command_name:=body->>'command';
 IF(mode='self' AND command_name NOT IN('submit','resubmit')) OR(mode='review' AND command_name NOT IN('request_correction','accept','reject')) THEN RAISE EXCEPTION 'NATIVE_FAMILY_FORBIDDEN';END IF;
 IF mode='self' AND ctx->>'selfState' IS DISTINCT FROM 'native' THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNLINKED';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-family:key:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId')||':'||(ctx->>'membershipId')||':'||key::text,0)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';END IF;
 fingerprint:=public.native_family_hash_v1(body);
 SELECT * INTO prior FROM public.native_family_request_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  IF prior.body_sha256<>fingerprint OR(mode='self' AND prior.command NOT IN('submit','resubmit')) OR(mode='review' AND prior.command NOT IN('request_correction','accept','reject')) THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDEMPOTENCY_REUSE';END IF;
  SELECT * INTO r FROM public.native_family_request WHERE id=prior.request_id AND tenant_id=prior.tenant_id;PERFORM public.native_family_owned_v1(ctx,r,mode);
  RETURN public.native_family_receipt_v1(ctx,prior,true);
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-family:ledger:v1',0)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';END IF;
 IF command_name='submit' THEN
  new_request:=gen_random_uuid();
  subject_value:=ctx->'selfSubject';
  IF body->>'subjectVersion' IS DISTINCT FROM subject_value->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDENTITY_CHANGED';END IF;
  r.id:=new_request;r.tenant_id:=(ctx->>'tenantId')::uuid;r.source_binding_id:=(ctx->>'sourceBindingId')::uuid;r.contract_id:=(ctx->>'employmentContractId')::uuid;r.person_id:=(ctx->>'actorPersonId')::uuid;r.native_registration_id:=(subject_value->>'registrationId')::uuid;r.submitter_membership_id:=(ctx->>'membershipId')::uuid;r.submitter_person_id:=(ctx->>'actorPersonId')::uuid;r.submitter_email:=ctx->>'actorEmail';r.request_kind:=body#>>'{payload,kind}';r.subject_version:=body->>'subjectVersion';r.subject_snapshot:=subject_value;r.received_at:=clock_timestamp();
  IF octet_length(to_jsonb(r)::text)>16384 THEN RAISE EXCEPTION 'NATIVE_FAMILY_METADATA_TOO_LARGE';END IF;
  version_value:=1;
 ELSE
  IF NOT pg_try_advisory_xact_lock(hashtextextended('native-family:request:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId')||':'||(body->>'requestId'),0)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';END IF;
  SELECT * INTO r FROM public.native_family_request WHERE id=(body->>'requestId')::uuid AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  PERFORM public.native_family_owned_v1(ctx,r,mode);
  SELECT * INTO e FROM public.native_family_request_event WHERE tenant_id=r.tenant_id AND request_id=r.id ORDER BY request_version DESC LIMIT 1;
  IF e.id IS NULL OR e.request_version IS DISTINCT FROM(body->>'expectedVersion')::integer THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
  IF e.request_version>=1000 THEN RAISE EXCEPTION 'NATIVE_FAMILY_LIMIT';END IF;version_value:=e.request_version+1;
  IF command_name='resubmit' THEN
   IF e.state<>'correction_requested' OR body#>>'{payload,kind}'<>r.request_kind THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
   IF r.subject_version IS DISTINCT FROM body->>'subjectVersion' OR r.subject_version IS DISTINCT FROM ctx#>>'{selfSubject,identityToken}' THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDENTITY_CHANGED';END IF;
  ELSE
   IF e.state<>'submitted' AND NOT(command_name='reject' AND e.state='correction_requested') THEN RAISE EXCEPTION 'NATIVE_FAMILY_STATE_CHANGED';END IF;
   IF NOT public.native_family_independent_v1(ctx,to_jsonb(r)) THEN RAISE EXCEPTION 'NATIVE_FAMILY_INDEPENDENT_REVIEW_REQUIRED';END IF;
   subject_value:=public.employee_family_subject_v2(ctx,r.contract_id,true);
   IF subject_value->>'personId' IS DISTINCT FROM r.person_id::text OR subject_value->>'identityToken' IS DISTINCT FROM r.subject_version OR subject_value->>'registrationId' IS DISTINCT FROM r.native_registration_id::text THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDENTITY_CHANGED';END IF;
  END IF;
 END IF;
 IF command_name='request_correction' AND e.request_version>997 OR command_name='resubmit' AND e.request_version>998 THEN RAISE EXCEPTION 'NATIVE_FAMILY_VERSION_LIMIT';END IF;
 PERFORM public.native_family_capacity_v1(command_name='submit',command_name IN('accept','reject'));
 IF command_name IN('submit','resubmit') THEN
  payload_value:=body->'payload';pdf:=payload_value->'document';
  IF r.request_kind='schooling' THEN
   family_value:=public.school_certificate_family_v3(ctx,r.contract_id,'own',payload_value#>>'{definition,familyRef,id}',payload_value#>>'{definition,identityToken}',true);
   IF family_value->>'person_id' IS DISTINCT FROM r.person_id::text OR family_value->>'native_registration_id' IS DISTINCT FROM r.native_registration_id::text OR(family_value->>'identity_review_required')::boolean THEN RAISE EXCEPTION 'NATIVE_FAMILY_IDENTITY_CHANGED';END IF;
  END IF;
  IF pdf IS DISTINCT FROM 'null'::jsonb THEN
   IF jsonb_typeof(document_metadata) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(document_metadata) k) IS DISTINCT FROM ARRAY['byteLength','filename','pages','sha256']::text[]
    OR document_metadata->>'filename' IS DISTINCT FROM pdf->>'filename' OR document_metadata->>'sha256' IS DISTINCT FROM pdf->>'sha256'
    OR jsonb_typeof(document_metadata->'byteLength') IS DISTINCT FROM 'number' OR document_metadata->>'byteLength'!~'^[1-9][0-9]{0,6}$' OR(document_metadata->>'byteLength')::integer NOT BETWEEN 10 AND 2097152
    OR jsonb_typeof(document_metadata->'pages') IS DISTINCT FROM 'number' OR document_metadata->>'pages'!~'^[1-9][0-9]?$' OR(document_metadata->>'pages')::integer NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'NATIVE_FAMILY_DOCUMENT_INVALID';END IF;
   BEGIN content_value:=decode(pdf->>'contentBase64','base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'NATIVE_FAMILY_DOCUMENT_INVALID';END;
   IF octet_length(content_value) IS DISTINCT FROM(document_metadata->>'byteLength')::integer OR substring(content_value FROM 1 FOR 5)<>decode('255044462d','hex') OR replace(encode(content_value,'base64'),E'\n','') IS DISTINCT FROM pdf->>'contentBase64' OR encode(public.digest(content_value,'sha256'),'hex') IS DISTINCT FROM pdf->>'sha256' THEN RAISE EXCEPTION 'NATIVE_FAMILY_DOCUMENT_INVALID';END IF;
   -- Same quota, lock, generation and blob as the administrative writer057/102.
   -- No runtime access to the blob/helper, no second quota and no copy on accept.
   PERFORM public.school_certificate_storage_reserve_v1(r.tenant_id,pdf->>'sha256',octet_length(content_value));
   INSERT INTO public.school_certificate_blob(tenant_id,sha256,content,byte_length) VALUES(r.tenant_id,pdf->>'sha256',content_value,octet_length(content_value)) ON CONFLICT DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM public.school_certificate_blob b WHERE b.tenant_id=r.tenant_id AND b.sha256=pdf->>'sha256' AND b.byte_length=octet_length(content_value) AND b.content=content_value) THEN RAISE EXCEPTION 'NATIVE_FAMILY_DOCUMENT_INVALID';END IF;
   blob_value:=pdf->>'sha256';payload_value:=jsonb_set(payload_value,'{document}',document_metadata);
  ELSE IF document_metadata IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_FAMILY_DOCUMENT_INVALID';END IF;END IF;
  state_value:='submitted';
 ELSE
  IF document_metadata IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'NATIVE_FAMILY_DOCUMENT_INVALID';END IF;
  payload_value:=e.payload;blob_value:=e.blob_sha256;
  state_value:=CASE command_name WHEN 'request_correction' THEN 'correction_requested' WHEN 'accept' THEN 'accepted' WHEN 'reject' THEN 'rejected' END;
  IF command_name='accept' THEN
   IF r.request_kind='child' THEN
    canonical_payload:=payload_value->'definition'||jsonb_build_object('contractId',r.contract_id,'contractIdentityToken',r.subject_version);
    canonical_result:=public.employee_family_declare_v2(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid,canonical_payload,key::text);
    IF canonical_result->>'contractId' IS DISTINCT FROM r.contract_id::text OR canonical_result->>'contractIdentityToken' IS DISTINCT FROM r.subject_version OR canonical_result#>>'{familyRef,kind}' IS DISTINCT FROM 'own' THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';END IF;
    administrative_value:=jsonb_build_object('kind','child','familyRef',canonical_result->'familyRef','certificateId',NULL);
   ELSE
    canonical_payload:=payload_value->'definition'||jsonb_build_object('contractId',r.contract_id,'filename',payload_value#>>'{document,filename}','sha256',blob_value,'contentBase64',NULL,'reason',body->>'reason');
    IF blob_value IS NOT NULL THEN
     -- Rebuild only the transient canonical102 input from the same shared blob;
     -- no base64 is persisted in the ledger and no second bytea is inserted.
     canonical_payload:=jsonb_set(canonical_payload,'{contentBase64}',(SELECT to_jsonb(replace(encode(b.content,'base64'),E'\n','')) FROM public.school_certificate_blob b WHERE b.tenant_id=r.tenant_id AND b.sha256=blob_value));
     IF canonical_payload->'contentBase64' IS NULL THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';END IF;
    END IF;
    canonical_result:=public.school_certificate_register_v3(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid,canonical_payload,key::text);
    IF canonical_result->>'version' IS DISTINCT FROM 'family-schooling-register.v3' OR canonical_result->>'certificateId' IS NULL THEN RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';END IF;
    administrative_value:=jsonb_build_object('kind','schooling','familyRef',payload_value#>'{definition,familyRef}','certificateId',canonical_result->'certificateId');
   END IF;
  END IF;
 END IF;
 IF command_name='submit' THEN INSERT INTO public.native_family_request SELECT (r).*;END IF;
 e.id:=gen_random_uuid();e.tenant_id:=r.tenant_id;e.source_binding_id:=r.source_binding_id;e.request_id:=r.id;e.request_version:=version_value;e.actor_membership_id:=(ctx->>'membershipId')::uuid;e.actor_person_id:=(ctx->>'actorPersonId')::uuid;e.actor_email:=ctx->>'actorEmail';e.actor_label:=ctx->>'actorLabel';e.actor_session_id:=(p->>'actorSessionId')::uuid;e.request_key:=key;e.body_sha256:=fingerprint;e.command:=command_name;e.state:=state_value;e.reason:=body->>'reason';e.payload:=payload_value;e.blob_sha256:=blob_value;e.administrative_record:=administrative_value;e.recorded_at:=clock_timestamp();
 IF octet_length(to_jsonb(e)::text)>16384 THEN RAISE EXCEPTION 'NATIVE_FAMILY_METADATA_TOO_LARGE';END IF;
 INSERT INTO public.native_family_request_event SELECT (e).*;
 RETURN public.native_family_receipt_v1(ctx,e,false);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'NATIVE_FAMILY_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'NATIVE_FAMILY_%' OR SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' OR SQLERRM LIKE 'EMPLOYEE_FAMILY_%' THEN RAISE;END IF;RAISE EXCEPTION 'NATIVE_FAMILY_UNAVAILABLE';
END $$;

-- Public facades have fixed modes; an API/runtime caller cannot pass review to
-- the employee facade or choose a contract. Helpers receive no runtime grant.
CREATE FUNCTION public.native_family_self_bootstrap_v1(p jsonb,state_filter text DEFAULT 'all',page_cursor jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_bootstrap_v1(p,'self',state_filter,page_cursor) $$;
CREATE FUNCTION public.native_family_review_bootstrap_v1(p jsonb,state_filter text DEFAULT 'all',page_cursor jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_bootstrap_v1(p,'review',state_filter,page_cursor) $$;
CREATE FUNCTION public.native_family_self_detail_v1(p jsonb,target uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_detail_v1(p,'self',target) $$;
CREATE FUNCTION public.native_family_review_detail_v1(p jsonb,target uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_detail_v1(p,'review',target) $$;
CREATE FUNCTION public.native_family_self_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_attempt_v1(p,'self',key) $$;
CREATE FUNCTION public.native_family_review_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_attempt_v1(p,'review',key) $$;
CREATE FUNCTION public.native_family_self_document_v1(p jsonb,target uuid,revision integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_document_v1(p,'self',target,revision) $$;
CREATE FUNCTION public.native_family_review_document_v1(p jsonb,target uuid,revision integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_document_v1(p,'review',target,revision) $$;
CREATE FUNCTION public.native_family_self_command_v1(p jsonb,body jsonb,key uuid,document_metadata jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_command_v1(p,'self',body,key,document_metadata) $$;
CREATE FUNCTION public.native_family_review_command_v1(p jsonb,body jsonb,key uuid,document_metadata jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.native_family_command_v1(p,'review',body,key,document_metadata) $$;

-- Default function EXECUTE is removed explicitly. No capability definitions or
-- role/profile memberships are created here; their admission is a separate gate.
DO $acl$
DECLARE item record;signature text;
BEGIN
 FOR item IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'native_family_%' LOOP
  signature:=item.signature::text;EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',signature);
  IF item.proname IN('native_family_self_bootstrap_v1','native_family_review_bootstrap_v1','native_family_self_detail_v1','native_family_review_detail_v1','native_family_self_attempt_v1','native_family_review_attempt_v1','native_family_self_document_v1','native_family_review_document_v1','native_family_self_command_v1','native_family_review_command_v1') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO municontrol_actions_runtime_app',signature);END IF;
 END LOOP;
END $acl$;
