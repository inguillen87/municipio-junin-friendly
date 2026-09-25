-- 107: completar el par de catálogo del perfil operativo; no otorga capacidades nuevas.
-- El revisor del catálogo debe seguir siendo otra persona, cuenta y membresía.
DO $baseline$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('public.tenant_iam_reviewed_operational_pair_v1(text,text,text)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM '15541c633ec2a356dbab8931cf4f0ca60258ab823dc8930cafab40d7098732fa' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM '674d2ecc976149056f2fef31375a039c50ae48227e06a2937ad227953c0ebee6' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.school_certificate_context_v1(text,uuid,integer,text,uuid,uuid,boolean,text)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM 'f245940e0e51b0da48b3fc1b1eee28e734b6e318ea919fde6964b78310188752' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.tenant_iam_assert_no_sod_conflict(uuid)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM '60e5a0b4cd6dc1d70621b260ebaaa9077bd42fb36548c36bc69704ed844671e9' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM 'ef4351525061d3008799ac054bc18a3ce3a4da6f069f4f67a7f8a238efe60369' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.native_employment_catalog_review_v1(jsonb,jsonb,uuid)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM 'da652adf4be174ac1511875ea69caf3a5002f37f38079eae9f3adbeb9334e65c' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_parameter_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM '1d040954317cd5489f10b80376868ce59576b862736d3923c9f5fb8692b76125' THEN RAISE EXCEPTION 'OPERATIVE_PROFILE_BASELINE_CHANGED'; END IF;
END $baseline$;

CREATE OR REPLACE FUNCTION public.tenant_iam_reviewed_operational_pair_v1(p_role text, p_left text, p_right text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT COALESCE(p_role='MUNICIPIO_ADMIN_OPERATIVO' AND (p_left,p_right) IN (
('absence.enter','absence.validate'),
('employee.record.approve','employee.record.propose'),
('employee.catalog.approve','employee.catalog.propose'),
('leave.approve','leave.enter'),
('time.source.approve','time.source.propose'),
('time.catalog.approve','time.catalog.propose'),
('attendance.evaluation.approve','attendance.evaluation.prepare'),
('payroll.control_import.prepare','payroll.control_import.validate'),
('payroll.novelty.approve','payroll.novelty.prepare'),
('payroll.reprocessing.approve','payroll.reprocessing.prepare'),
('payroll.monthly_close.approve','payroll.monthly_close.prepare'),
('payroll.parameter.approve','payroll.parameter.prepare'),
('payroll.fixed.approve','payroll.fixed.prepare')
 ),false)
$function$;

CREATE OR REPLACE FUNCTION public.school_certificate_context_v1(p_email text, p_session uuid, p_version integer, p_release text, p_tenant uuid, p_membership uuid, p_write boolean DEFAULT false, p_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'workforce.employee.read')
  OR (p_write AND NOT action_center_context_has_capability(ctx,'employee.record.propose')) THEN
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED';
 END IF;
 IF p_write THEN
  -- Evidence preparation uses the read authority (including SoD), not payroll approval.
  -- Identity/session/policy/binding are locked by that assertion. Serialize retries
  -- by tenant, binding, membership and key without requiring the operator's legajo.
  PERFORM pg_advisory_xact_lock(hashtextextended('school-certificate:'||p_tenant::text||':'||
   (ctx->>'sourceBindingId')||':'||p_membership::text||':'||p_key,0));
 END IF;
 RETURN ctx;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
 CASE SQLERRM
  WHEN 'ACTION_RELEASE_NOT_CERTIFIED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_RELEASE_NOT_CERTIFIED';
  WHEN 'ACTION_SOURCE_BINDING_REQUIRED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_BINDING_REQUIRED';
  WHEN 'ACTION_SESSION_BUSY' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
  WHEN 'ACTION_TENANT_AUTHORITY_REQUIRED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED';
  WHEN 'ACTION_SESSION_INVALID' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_INVALID';
  WHEN 'TENANT_IAM_SOD_CONFLICT' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PROFILE_CONFLICT';
  ELSE RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SERVICE_UNAVAILABLE';
 END CASE;
END $function$;
