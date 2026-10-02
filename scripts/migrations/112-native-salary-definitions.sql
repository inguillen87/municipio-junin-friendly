-- Own municipal definitions. This ledger never evaluates formulas or payroll.
-- Complete atomic installation only; no IAM, previous objects or data changed.
DO $prerequisite$
DECLARE p pg_proc;
BEGIN
 IF to_regclass('public.native_salary_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_salary_%') THEN RAISE EXCEPTION 'NATIVE_SALARY_ALREADY_INSTALLED'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.native_employment_change_context_v1(jsonb,text)');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.proretset OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']
  OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>'b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d'
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
  OR to_regprocedure('public.native_employee_catalog_v1(jsonb)') IS NULL OR to_regprocedure('public.native_employment_catalog_lock_v1(jsonb)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'NATIVE_SALARY_PREREQUISITE'; END IF;
END $prerequisite$;

CREATE TABLE public.native_salary_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid,command text NOT NULL CHECK(command IN('propose','approve','reject')),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),
 base_items jsonb NOT NULL CHECK(jsonb_typeof(base_items)='array'),revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 160),request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 UNIQUE(tenant_id,source_binding_id,id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id,proposal_id) REFERENCES public.native_salary_event(tenant_id,source_binding_id,id),
 CHECK((command='propose' AND proposal_id IS NULL) OR(command<>'propose' AND proposal_id IS NOT NULL)),CHECK(octet_length(body::text)+octet_length(base_items::text)<=4194304)
);
CREATE UNIQUE INDEX native_salary_decision ON public.native_salary_event(proposal_id) WHERE command<>'propose';
CREATE UNIQUE INDEX native_salary_revision ON public.native_salary_event(tenant_id,source_binding_id,revision) WHERE command='approve';
ALTER TABLE public.native_salary_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_salary_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.native_salary_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'NATIVE_SALARY_IMMUTABLE'; END $$;
CREATE TRIGGER native_salary_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_salary_event FOR EACH STATEMENT EXECUTE FUNCTION public.native_salary_immutable_v1();

CREATE FUNCTION public.native_salary_serialized_v1(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE jsonb_typeof(v) WHEN 'object' THEN '{'||coalesce((SELECT string_agg(to_jsonb(k)::text||':'||public.native_salary_serialized_v1(x),',' ORDER BY k COLLATE "C") FROM jsonb_each(v) e(k,x)),'')||'}'
 WHEN 'array' THEN '['||coalesce((SELECT string_agg(public.native_salary_serialized_v1(x),',' ORDER BY n) FROM jsonb_array_elements(v) WITH ORDINALITY e(x,n)),'')||']' ELSE v::text END
$$;
CREATE FUNCTION public.native_salary_row_key_v1(r jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT concat_ws(':',r->>'kind',r->>'agreementCode',coalesce(r->>'categoryCode',''),r->>'code',r->>'validFrom') $$;
CREATE FUNCTION public.native_salary_items_v1(items jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; value_text text; prec integer; remaining text[]; next_remaining text[];
BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)>1000 OR octet_length(items::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) IS DISTINCT FROM ARRAY['active','agreementCode','categoryCode','code','dependencies','kind','label','nature','precision','ruleReference','unit','validFrom','validUntil','value']::text[]
   OR r->>'kind' IS NULL OR r->>'kind' NOT IN('concept','scale') OR jsonb_typeof(r->'code') IS DISTINCT FROM 'string' OR r->>'code'!~'^[0-9]{1,9}$'
   OR jsonb_typeof(r->'agreementCode') IS DISTINCT FROM 'string' OR r->>'agreementCode'!~'^[0-9]{1,9}$'
   OR jsonb_typeof(r->'label') IS DISTINCT FROM 'string' OR length(r->>'label') NOT BETWEEN 1 AND 160 OR r->>'label'<>btrim(r->>'label') OR r->>'label'<>normalize(r->>'label',NFC) OR r->>'label'~'[<>[:cntrl:]]'
   OR jsonb_typeof(r->'ruleReference') IS DISTINCT FROM 'string' OR length(r->>'ruleReference') NOT BETWEEN 3 AND 180 OR r->>'ruleReference'<>btrim(r->>'ruleReference') OR r->>'ruleReference'<>normalize(r->>'ruleReference',NFC) OR r->>'ruleReference'~'[<>[:cntrl:]]'
   OR jsonb_typeof(r->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(r->'precision') IS DISTINCT FROM 'number' OR r->>'precision'!~'^[0-8]$'
   OR r->>'unit' IS NULL OR r->>'unit' NOT IN('money','hours','minutes','percent','units','coefficient')
   OR jsonb_typeof(r->'validFrom') IS DISTINCT FROM 'string' OR r->>'validFrom'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
   OR(r->'validUntil'<>'null'::jsonb AND(jsonb_typeof(r->'validUntil') IS DISTINCT FROM 'string' OR r->>'validUntil'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR r->>'validUntil'<r->>'validFrom'))
   OR jsonb_typeof(r->'dependencies') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'dependencies')>50
  THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  IF(r->>'kind'='concept' AND(r->'categoryCode'<>'null'::jsonb OR r->>'nature' IS NULL OR r->>'nature' NOT IN('remuneration','non_remuneration','deduction','employer_contribution','auxiliary')))
   OR(r->>'kind'='scale' AND(jsonb_typeof(r->'categoryCode') IS DISTINCT FROM 'string' OR r->>'categoryCode'!~'^[0-9]{1,9}$' OR r->'nature'<>'null'::jsonb OR r->>'unit'<>'money' OR r->'value'='null'::jsonb OR jsonb_array_length(r->'dependencies')<>0))
  THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  prec:=(r->>'precision')::integer;value_text:=r->>'value';
  IF r->'value'<>'null'::jsonb AND(jsonb_typeof(r->'value') IS DISTINCT FROM 'string' OR value_text!~'^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$' OR value_text~'^-0(\.0+)?$' OR length(coalesce(nullif(split_part(value_text,'.',2),''),''))<>prec)
  THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'dependencies') WITH ORDINALITY d(x,n) WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 120 OR x#>>'{}'~'[<>[:cntrl:]]'
    OR x#>>'{}'<>btrim(x#>>'{}') OR x#>>'{}'<>normalize(x#>>'{}',NFC) OR(n>1 AND (r->'dependencies'->>((n-2)::integer)) COLLATE "C">=(x#>>'{}') COLLATE "C")) THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) r GROUP BY public.native_salary_row_key_v1(r) HAVING count(*)>1) THEN RAISE EXCEPTION 'NATIVE_SALARY_DUPLICATE'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) a JOIN jsonb_array_elements(items) b ON public.native_salary_row_key_v1(a)<public.native_salary_row_key_v1(b)
  WHERE a->>'active'='true' AND b->>'active'='true' AND a->>'kind'=b->>'kind' AND a->>'agreementCode'=b->>'agreementCode' AND a->'categoryCode'=b->'categoryCode' AND a->>'code'=b->>'code'
   AND coalesce(a->>'validUntil','9999-12')>=b->>'validFrom' AND coalesce(b->>'validUntil','9999-12')>=a->>'validFrom') THEN RAISE EXCEPTION 'NATIVE_SALARY_OVERLAP'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) r CROSS JOIN LATERAL jsonb_array_elements_text(r->'dependencies') d(k) WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) x
  WHERE public.native_salary_row_key_v1(x)=d.k AND x->>'agreementCode'=r->>'agreementCode' AND(r->>'active'='false' OR x->>'active'='true' AND x->>'validFrom'<=r->>'validFrom' AND coalesce(x->>'validUntil','9999-12')>=coalesce(r->>'validUntil','9999-12')))) THEN RAISE EXCEPTION 'NATIVE_SALARY_DEPENDENCY'; END IF;
 -- Remove leaves instead of enumerating exponentially many dependency paths.
 SELECT coalesce(array_agg(public.native_salary_row_key_v1(r)),ARRAY[]::text[]) INTO remaining FROM jsonb_array_elements(items) r;
 WHILE cardinality(remaining)>0 LOOP
  SELECT coalesce(array_agg(k),ARRAY[]::text[]) INTO next_remaining FROM unnest(remaining) k WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(items) r CROSS JOIN LATERAL jsonb_array_elements_text(r->'dependencies') d(x) WHERE public.native_salary_row_key_v1(r)=k AND d.x=ANY(remaining));
  IF cardinality(next_remaining)=cardinality(remaining) THEN RAISE EXCEPTION 'NATIVE_SALARY_CYCLE'; END IF;remaining:=next_remaining;
 END LOOP;
 RETURN coalesce((SELECT jsonb_agg(r ORDER BY public.native_salary_row_key_v1(r) COLLATE "C") FROM jsonb_array_elements(items) r),'[]'::jsonb);
END $$;

CREATE FUNCTION public.native_salary_context_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;
BEGIN ctx:=public.native_employment_change_context_v1(p);IF NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read') THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;RETURN ctx; END $$;
CREATE FUNCTION public.native_salary_scope_v1(ctx jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(jsonb_build_array('native-salary-scope.v1',ctx->>'tenantId',ctx->>'sourceBindingId',ctx->>'membershipId',ctx->>'actorPersonId',ctx->>'actorEmail')::text,'sha256'),'hex')
$$;
CREATE FUNCTION public.native_salary_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM public.native_employment_catalog_lock_v1(ctx);IF NOT pg_try_advisory_xact_lock(hashtextextended('native-salary:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'NATIVE_SALARY_BUSY'; END IF;END $$;
CREATE FUNCTION public.native_salary_catalog_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.native_salary_event;items jsonb;rev integer;
BEGIN SELECT * INTO e FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='approve' ORDER BY revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NULL THEN items:='[]';ELSE SELECT body->'items' INTO items FROM public.native_salary_event WHERE id=e.proposal_id;END IF;
 RETURN jsonb_build_object('revision',rev,'items',items,'version',encode(public.digest(jsonb_build_array('native-salary-catalog.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,e.id,items)::text,'sha256'),'hex'));
END $$;
CREATE FUNCTION public.native_salary_proposal_v1(ctx jsonb,e public.native_salary_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE decision public.native_salary_event;independent boolean;
BEGIN SELECT * INTO decision FROM public.native_salary_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL
  AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'status',CASE decision.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'requestSha256',e.request_sha256,
 'baseVersion',e.body->>'baseVersion','classificationVersion',e.body->>'classificationVersion','baseItems',e.base_items,'items',e.body->'items','reason',e.body->>'reason',
 'createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',decision.id IS NULL AND independent,'decision',CASE WHEN decision.id IS NULL THEN NULL ELSE jsonb_build_object('command',decision.command,'reason',decision.body->>'reason','actorLabel',decision.actor_label,'recordedAt',decision.recorded_at,'revision',decision.revision) END);
END $$;
CREATE FUNCTION public.native_salary_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;c jsonb;proposals jsonb;
BEGIN ctx:=public.native_salary_context_v1(p);PERFORM public.native_salary_lock_v1(ctx);c:=public.native_salary_catalog_v1(ctx);
 IF(SELECT count(*) FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>1000 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT'; END IF;
 SELECT coalesce(jsonb_agg(public.native_salary_proposal_v1(ctx,e) ORDER BY recorded_at DESC,id),'[]') INTO proposals FROM public.native_salary_event e WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose';
 IF octet_length(proposals::text)+octet_length(c::text)>16777216 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT'; END IF;
 RETURN jsonb_build_object('version','native-salary-catalog.v1','scopeVersion',public.native_salary_scope_v1(ctx),'classification',public.native_employee_catalog_v1(ctx),'catalog',c,'proposals',proposals,'complete',true,'payrollCalculated',false,'payrollPosted',false,
 'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')));
END $$;
CREATE FUNCTION public.native_salary_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.native_salary_event;
BEGIN ctx:=public.native_salary_context_v1(p);SELECT * INTO e FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SALARY_NOT_FOUND'; END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.native_salary_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;prior public.native_salary_event;proposal public.native_salary_event;c jsonb;classification jsonb;items jsonb;fingerprint text;cmd text;eid uuid:=gen_random_uuid();pid uuid;rev integer;receipt_value jsonb;r jsonb;
BEGIN
 ctx:=public.native_salary_context_v1(p);cmd:=body->>'command';
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','classificationVersion','command','items','proposalId','proposalSha256','reason','reviewConfirmed','scopeVersion']::text[]
  OR cmd IS NULL OR cmd NOT IN('propose','approve','reject') OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 1000 OR body->>'reason'<>btrim(body->>'reason') OR body->>'reason'<>normalize(body->>'reason',NFC) OR body->>'reason'~'[<>[:cntrl:]]'
  OR jsonb_typeof(body->'baseVersion') IS DISTINCT FROM 'string' OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(body->'classificationVersion') IS DISTINCT FROM 'string' OR body->>'classificationVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(body->'scopeVersion') IS DISTINCT FROM 'string' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean'
 THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'NATIVE_SALARY_EMPLOYMENT_REQUIRED'; END IF;
 PERFORM public.native_salary_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'NATIVE_SALARY_IDEMPOTENCY_REUSE'; END IF;RETURN public.native_salary_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'NATIVE_SALARY_SCOPE_CHANGED'; END IF;
 c:=public.native_salary_catalog_v1(ctx);classification:=public.native_employee_catalog_v1(ctx);rev:=(c->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId'<>'null'::jsonb OR body->'proposalSha256'<>'null'::jsonb OR body->>'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  IF body->>'baseVersion' IS DISTINCT FROM c->>'version' OR body->>'classificationVersion' IS DISTINCT FROM classification->>'version' THEN RAISE EXCEPTION 'NATIVE_SALARY_BASE_CHANGED'; END IF;
  items:=public.native_salary_items_v1(body->'items');IF jsonb_array_length(items)=0 OR items IS DISTINCT FROM body->'items' OR items=c->'items' THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'items') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE public.native_salary_row_key_v1(x)=public.native_salary_row_key_v1(old))) THEN RAISE EXCEPTION 'NATIVE_SALARY_HISTORY_REQUIRED'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(classification->'items') x WHERE x->>'kind'='agreements' AND x->>'code'=r->>'agreementCode')
    OR(r->>'kind'='scale' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(classification->'items') x WHERE x->>'kind'='categories' AND x->>'code'=r->>'categoryCode' AND x->>'agreementCode'=r->>'agreementCode')) THEN RAISE EXCEPTION 'NATIVE_SALARY_CLASSIFICATION_INVALID'; END IF;
  END LOOP;pid:=eid;
 ELSE
  IF body->'items'<>'null'::jsonb OR body->>'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalSha256' IS NULL OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.native_salary_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SALARY_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.native_salary_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'NATIVE_SALARY_DECIDED'; END IF;
  IF NOT(public.native_salary_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'NATIVE_SALARY_INDEPENDENT_REQUIRED'; END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'classificationVersion' IS DISTINCT FROM proposal.body->>'classificationVersion' THEN RAISE EXCEPTION 'NATIVE_SALARY_PROPOSAL_CHANGED'; END IF;
  IF cmd='approve' THEN
   IF body->>'baseVersion' IS DISTINCT FROM c->>'version' OR body->>'classificationVersion' IS DISTINCT FROM classification->>'version' THEN RAISE EXCEPTION 'NATIVE_SALARY_BASE_CHANGED'; END IF;
   items:=public.native_salary_items_v1(proposal.body->'items');rev:=rev+1;
   c:=jsonb_build_object('revision',rev,'items',items,'version',encode(public.digest(jsonb_build_array('native-salary-catalog.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,items)::text,'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR(SELECT count(*) FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=1000 AND cmd='propose' THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT'; END IF;
 -- A global lock and explicit ceiling avoid cross-tenant silent over-allocation.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-salary:capacity:v1',0)) THEN RAISE EXCEPTION 'NATIVE_SALARY_BUSY'; END IF;
 IF(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.receipt::text)),0) FROM public.native_salary_event e)+3*octet_length(body::text)+octet_length((c->'items')::text)>134217728
  OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.receipt::text)),0) FROM public.native_salary_event e WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)+3*octet_length(body::text)+octet_length((c->'items')::text)>8388608 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT'; END IF;
 receipt_value:=jsonb_build_object('version','native-salary-catalog.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'catalogVersion',c->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.native_salary_event(id,tenant_id,source_binding_id,proposal_id,command,body,base_items,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,CASE WHEN cmd='propose' THEN c->'items' ELSE proposal.base_items END,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.native_salary_immutable_v1(),public.native_salary_serialized_v1(jsonb),public.native_salary_row_key_v1(jsonb),public.native_salary_items_v1(jsonb),public.native_salary_context_v1(jsonb),public.native_salary_scope_v1(jsonb),public.native_salary_lock_v1(jsonb),public.native_salary_catalog_v1(jsonb),public.native_salary_proposal_v1(jsonb,public.native_salary_event),public.native_salary_bootstrap_v1(jsonb),public.native_salary_attempt_v1(jsonb,uuid),public.native_salary_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_salary_bootstrap_v1(jsonb),public.native_salary_attempt_v1(jsonb,uuid),public.native_salary_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
