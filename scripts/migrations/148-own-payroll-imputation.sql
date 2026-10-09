-- Mechanical allocation of immutable closed salary amounts, separately reviewed.
-- No salary evaluation, bookkeeping entry, payment, adoption or role changes.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_imputation_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_imputation_%') THEN RAISE EXCEPTION 'IMPUTATION_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_close_context_v1(jsonb,boolean,boolean)') IS NULL OR to_regprocedure('public.own_accounting_current_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'IMPUTATION_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_payroll_imputation_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid REFERENCES public.own_payroll_imputation_event(id),group_id uuid NOT NULL REFERENCES public.own_payroll_close_event(id),fiscal_year text NOT NULL CHECK(fiscal_year~'^(19|20)[0-9]{2}$'),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=32768),source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot) IN('object','null') AND octet_length(source_snapshot::text)<=16777216),allocation jsonb NOT NULL CHECK(jsonb_typeof(allocation) IN('object','null') AND octet_length(allocation::text)<=16777216),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),CHECK((command='propose')=(jsonb_typeof(source_snapshot)='object' AND jsonb_typeof(allocation)='object')),
 UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_imputation_revision ON public.own_payroll_imputation_event(tenant_id,source_binding_id,group_id,fiscal_year,revision) WHERE command='approve';
ALTER TABLE public.own_payroll_imputation_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_imputation_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_imputation_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'IMPUTATION_IMMUTABLE';END $$;
CREATE TRIGGER own_imputation_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_imputation_event FOR EACH ROW EXECUTE FUNCTION public.own_imputation_immutable_v1();
CREATE TRIGGER own_imputation_no_truncate BEFORE TRUNCATE ON public.own_payroll_imputation_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_imputation_immutable_v1();
CREATE FUNCTION public.own_imputation_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM public.own_run_lock_v1(ctx);PERFORM public.own_accounting_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-imputation:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'IMPUTATION_BUSY';END IF;
END $$;
CREATE FUNCTION public.own_imputation_revision_v1(ctx jsonb,gid uuid,fy text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(max(revision),0) FROM public.own_payroll_imputation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND group_id=gid AND fiscal_year=fy AND command='approve'
$$;
CREATE FUNCTION public.own_imputation_source_value_v1(ctx jsonb,gid uuid,fy text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.own_payroll_close_event;c public.own_payroll_run_capture;r public.own_payroll_run_result;e jsonb;d jsonb:='[]';configuration jsonb;source_value jsonb;seen uuid[]:='{}';run_id uuid;
BEGIN
 IF coalesce(fy,'')!~'^(19|20)[0-9]{2}$' OR gid IS NULL THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;
 SELECT * INTO g FROM public.own_payroll_close_event WHERE id=gid AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='close';
 IF NOT FOUND THEN RAISE EXCEPTION 'IMPUTATION_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.own_payroll_close_event WHERE group_id=g.id AND command='reopen' AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id) THEN RAISE EXCEPTION 'IMPUTATION_REOPENED';END IF;
 IF g.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(g.body) OR g.snapshot_sha256 IS DISTINCT FROM public.own_run_hash_v1(g.snapshot) OR g.snapshot->>'populationDomain' IS DISTINCT FROM 'native_registered' OR g.snapshot->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR g.snapshot->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR g.snapshot->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb OR (g.snapshot->>'conceptCount')::integer<>jsonb_array_length(g.snapshot->'concepts') OR (g.snapshot->>'employeeCount')::integer<>jsonb_array_length(g.snapshot->'employees') THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
 IF jsonb_array_length(g.snapshot->'concepts')>250000 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(g.snapshot->'employees') ORDER BY value->>'runId' COLLATE "C",value->>'contractId' COLLATE "C" LOOP
  run_id:=(e->>'runId')::uuid;
  IF NOT run_id=ANY(seen) THEN
   SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=run_id AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id;SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=run_id;
   IF c.id IS NULL OR r.capture_id IS NULL OR c.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(c.body) OR c.body->>'period' IS DISTINCT FROM g.period OR c.body->>'liquidationType' IS DISTINCT FROM g.liquidation_type THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
   seen:=array_append(seen,run_id);d:=d||jsonb_build_array(jsonb_build_object('runId',run_id,'body',c.body,'bodySha256',c.body_sha256,'inputSha256',r.input_sha256));
  END IF;
  IF e->>'inputSha256' IS DISTINCT FROM r.input_sha256 OR e->>'resultSha256' IS DISTINCT FROM r.result_sha256 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.input->'employees') x WHERE lower(x->>'contractId')=lower(e->>'contractId') AND x->>'employeeNumber'=e->>'employeeNumber' AND x->>'agreementCode'=e->>'agreementCode' AND x->>'departmentCode'=e->>'departmentCode') THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
 END LOOP;
 IF cardinality(seen)>1000 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 configuration:=public.own_accounting_current_v1(ctx);
 source_value:=jsonb_build_object('version','own-payroll-imputation-source.v1','scopeVersion',public.native_salary_scope_v1(ctx),'fiscalYear',fy,'group',g.receipt||jsonb_build_object('replayed',true),'state','closed','configuration',configuration,'dateSources',d,'complete',true);
 source_value:=source_value||jsonb_build_object('sourceVersion',public.own_run_hash_v1(jsonb_build_object('version','own-payroll-imputation-source.v1','fiscalYear',fy,'groupId',g.id,'bodySha256',g.body_sha256,'snapshotSha256',g.snapshot_sha256,'configuration',configuration,'dateSources',d)));
 IF octet_length(source_value::text)>16777216 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;RETURN source_value;
END $$;
CREATE FUNCTION public.own_imputation_allocate_v1(source_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb:=source_value#>'{group,snapshot}';config jsonb:=source_value->'configuration';rev integer:=(config->>'revision')::integer;rows_value jsonb:='[]';issues jsonb:='[]';global_issues jsonb:='[]';g record;row_value jsonb;codes jsonb;destination jsonb;groups_value jsonb;money_count integer:=0;aux_count integer:=0;allocated integer:=0;ready boolean;totals jsonb:='{}';nature text;amount numeric;precision_value integer:=(s->>'precision')::integer;sum_precision integer;
BEGIN
 IF rev=0 THEN global_issues:='["configuration_required"]';END IF;
 FOR g IN
  WITH concepts AS MATERIALIZED(SELECT x.value r,x.ordinality n FROM jsonb_array_elements(s->'concepts') WITH ORDINALITY x),
  employees AS MATERIALIZED(SELECT value e FROM jsonb_array_elements(s->'employees')),
  dates AS MATERIALIZED(SELECT value d FROM jsonb_array_elements(source_value->'dateSources')),
  mappings AS MATERIALIZED(SELECT value m FROM jsonb_array_elements(coalesce(config#>'{definition,mappings}','[]'))),
  assignments AS MATERIALIZED(SELECT value a FROM jsonb_array_elements(coalesce(config#>'{definition,assignments}','[]')))
  SELECT c.*,e.e,d.d->'body' body,m.m,a.a FROM concepts c JOIN employees e ON lower(e.e->>'contractId')=lower(c.r->>'contractId') JOIN dates d ON lower(d.d->>'runId')=lower(e.e->>'runId')
  LEFT JOIN mappings m ON c.r->>'nature'<>'auxiliary' AND rev>0 AND m.m->>'fiscalYear'=source_value->>'fiscalYear' AND m.m->>'jurisdictionCode'=e.e#>>'{jurisdiction,code}' AND m.m->>'agreementCode'=c.r->>'agreementCode' AND m.m->>'departmentCode'=c.r->>'departmentCode' AND m.m->>'conceptCode'=c.r->>'conceptCode' AND m.m->>'validFrom'<=d.d#>>'{body,liquidationDate}' AND m.m->>'validUntil'>=d.d#>>'{body,liquidationDate}'
  LEFT JOIN assignments a ON c.r->>'nature'<>'auxiliary' AND rev>0 AND lower(a.a->>'contractId')=lower(c.r->>'contractId') AND (a.a->'conceptCode'='null' OR a.a->>'conceptCode'=c.r->>'conceptCode') AND a.a->>'validFrom'<=d.d#>>'{body,liquidationDate}' AND (a.a->'validUntil'='null' OR a.a->>'validUntil'>=d.d#>>'{body,liquidationDate}') ORDER BY c.n
 LOOP
  IF g.n<>jsonb_array_length(rows_value)+1 THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
  codes:='[]';destination:=NULL;
  IF g.r->>'nature'='auxiliary' THEN aux_count:=aux_count+1;
  ELSE
   money_count:=money_count+1;
   IF g.body->>'liquidationDate' IS NULL THEN codes:=codes||'"date_missing"'::jsonb;ELSIF NOT public.own_accounting_day_v1(g.body->'liquidationDate') THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
   IF coalesce(g.e#>>'{jurisdiction,code}','') NOT IN('42','55') THEN codes:=codes||'"jurisdiction_missing"'::jsonb;END IF;
   amount:=(g.r->>'amount')::numeric;IF amount*100<>trunc(amount*100) THEN codes:=codes||'"fractional_cent"'::jsonb;END IF;
   IF rev>0 AND g.body->>'liquidationDate' IS NOT NULL AND g.e#>>'{jurisdiction,code}' IN('42','55') THEN
    IF g.m IS NULL THEN codes:=codes||'"mapping_missing"'::jsonb;ELSIF g.m->>'nature'<>g.r->>'nature' THEN codes:=codes||'"nature_mismatch"'::jsonb;END IF;
   END IF;
   IF rev>0 AND g.body->>'liquidationDate' IS NOT NULL AND g.a IS NULL THEN codes:=codes||'"institution_missing"'::jsonb;END IF;
   IF rev>0 AND jsonb_array_length(codes)=0 THEN destination:=g.m||jsonb_build_object('institutionalReference',g.a->>'institutionalReference','functionReference',g.a->>'functionReference','institutionRuleReference',g.a->>'ruleReference');allocated:=allocated+1;END IF;
  END IF;
  row_value:=jsonb_build_object('ordinal',g.n,'contractId',g.e->>'contractId','employeeNumber',g.e->>'employeeNumber','agreementCode',g.e->>'agreementCode','departmentCode',g.e->>'departmentCode','conceptCode',g.r->>'conceptCode','nature',g.r->>'nature','unit',g.r->>'unit','amount',g.r->>'amount','liquidationDate',g.body->>'liquidationDate','jurisdictionCode',g.e#>>'{jurisdiction,code}','mappingKey',CASE WHEN g.m IS NULL THEN NULL ELSE public.own_accounting_key_v1(g.m,'mappings') END,'assignmentKey',CASE WHEN g.a IS NULL THEN NULL ELSE public.own_accounting_key_v1(g.a,'assignments') END,'destination',destination,'state',CASE WHEN g.r->>'nature'='auxiliary' THEN 'auxiliary' WHEN rev=0 THEN 'configuration_required' WHEN jsonb_array_length(codes)>0 THEN 'needs_review' ELSE 'allocated' END,'issues',codes);
  rows_value:=rows_value||jsonb_build_array(row_value);issues:=issues||coalesce((SELECT jsonb_agg(jsonb_build_object('ordinal',g.n,'code',x)) FROM jsonb_array_elements_text(codes) x),'[]');
 END LOOP;
 IF jsonb_array_length(rows_value)<>jsonb_array_length(s->'concepts') THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
 ready:=money_count>0 AND jsonb_array_length(global_issues)=0 AND jsonb_array_length(issues)=0;
 SELECT coalesce(jsonb_agg(jsonb_build_object('destination',grouped.destination,'ordinals',grouped.ordinals,'conceptCount',grouped.count_rows,'amount',grouped.total::text) ORDER BY grouped.serialized COLLATE "C"),'[]') INTO groups_value FROM(SELECT x->'destination' destination,public.native_salary_serialized_v1(x->'destination') serialized,jsonb_agg(x->'ordinal' ORDER BY (x->>'ordinal')::integer) ordinals,count(*) count_rows,sum((x->>'amount')::numeric) total FROM jsonb_array_elements(rows_value) x WHERE x->>'state'='allocated' GROUP BY x->'destination') grouped;
 FOREACH nature IN ARRAY ARRAY['remuneration','non_remuneration','deduction','employer_contribution'] LOOP
  SELECT coalesce(sum((x->>'amount')::numeric),0),coalesce(max(scale((x->>'amount')::numeric)),0) INTO amount,sum_precision FROM jsonb_array_elements(rows_value) x WHERE x->>'state'='allocated' AND x->>'nature'=nature;
  sum_precision:=CASE WHEN ready THEN precision_value ELSE greatest(precision_value,sum_precision) END;
  IF amount<>trunc(amount,sum_precision) OR ready AND amount<>(s#>>ARRAY['totals',nature])::numeric THEN RAISE EXCEPTION 'IMPUTATION_CONTRACT_INVALID';END IF;
  totals:=totals||jsonb_build_object(nature,trunc(amount,sum_precision)::text);
 END LOOP;
 RETURN jsonb_build_object('version','own-payroll-imputation-result.v1','groupId',source_value#>>'{group,groupId}','fiscalYear',source_value->>'fiscalYear','sourceVersion',source_value->>'sourceVersion','configurationVersion',config->>'version','configurationRevision',rev,'snapshotSha256',source_value#>>'{group,snapshotSha256}','employeeCount',s->'employeeCount','populationCount',s->'populationCount','populationComplete',s->'populationComplete','conceptCount',s->'conceptCount','moneyCount',money_count,'auxiliaryCount',aux_count,'allocatedCount',allocated,'ready',ready,'globalIssues',global_issues,'issues',issues,'rows',rows_value,'groups',groups_value,'sourceTotals',s->'totals','allocatedTotals',totals,'accountingPosted',false,'paymentExecuted',false);
END $$;
CREATE FUNCTION public.own_imputation_source_v1(p jsonb,gid uuid,fy text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;source_value jsonb;allocation_value jsonb;BEGIN ctx:=public.own_close_context_v1(p,true);PERFORM public.own_imputation_lock_v1(ctx);source_value:=public.own_imputation_source_value_v1(ctx,gid,fy);allocation_value:=public.own_imputation_allocate_v1(source_value);
 IF octet_length(source_value::text)+octet_length(allocation_value::text)+2048>16777216 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-payroll-imputation.v1','source',source_value,'allocation',allocation_value,'allocationSha256',public.own_run_hash_v1(allocation_value),'revision',public.own_imputation_revision_v1(ctx,gid,fy));END $$;
CREATE FUNCTION public.own_imputation_summary_v1(ctx jsonb,e public.own_payroll_imputation_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_payroll_imputation_event;independent boolean;BEGIN SELECT * INTO d FROM public.own_payroll_imputation_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'sourceVersion',e.body->>'sourceVersion','allocationSha256',e.body->>'allocationSha256','groupId',e.group_id,'fiscalYear',e.fiscal_year,'baseRevision',e.body->'baseRevision','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'employeeCount',e.allocation->'employeeCount','conceptCount',e.allocation->'conceptCount','canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);END $$;
CREATE FUNCTION public.own_imputation_bootstrap_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;groups_value jsonb;proposals jsonb;BEGIN ctx:=public.own_close_context_v1(p,true);PERFORM public.own_imputation_lock_v1(ctx);
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'state',CASE WHEN r.id IS NULL THEN 'closed' ELSE 'reopened' END,'snapshotSha256',g.snapshot_sha256,'employeeCount',g.snapshot->'employeeCount','populationCount',g.snapshot->'populationCount','populationComplete',g.snapshot->'populationComplete','recordedAt',g.recorded_at,'actorLabel',g.actor_label) ORDER BY g.recorded_at,g.id),'[]') INTO groups_value FROM public.own_payroll_close_event g LEFT JOIN public.own_payroll_close_event r ON r.group_id=g.id AND r.command='reopen' AND r.tenant_id=g.tenant_id AND r.source_binding_id=g.source_binding_id WHERE g.tenant_id=(ctx->>'tenantId')::uuid AND g.source_binding_id=(ctx->>'sourceBindingId')::uuid AND g.command='close' AND g.period=period_value AND g.liquidation_type=type_value;
 SELECT coalesce(jsonb_agg(public.own_imputation_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals FROM public.own_payroll_imputation_event e JOIN public.own_payroll_close_event g ON g.id=e.group_id WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND g.period=period_value AND g.liquidation_type=type_value;
 IF jsonb_array_length(groups_value)>1000 OR jsonb_array_length(proposals)>500 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-payroll-imputation.v1','scopeVersion',public.native_salary_scope_v1(ctx),'period',period_value,'liquidationType',type_value,'groups',groups_value,'proposals',proposals,'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'accountingPosted',false,'paymentExecuted',false);END $$;
CREATE FUNCTION public.own_imputation_detail_v1(p jsonb,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_imputation_event;source_value jsonb;current_value boolean:=false;summary jsonb;revision_value integer;BEGIN ctx:=public.own_close_context_v1(p,true);PERFORM public.own_imputation_lock_v1(ctx);
 SELECT * INTO e FROM public.own_payroll_imputation_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'IMPUTATION_NOT_FOUND';END IF;
 summary:=public.own_imputation_summary_v1(ctx,e);revision_value:=public.own_imputation_revision_v1(ctx,e.group_id,e.fiscal_year);
 BEGIN source_value:=public.own_imputation_source_value_v1(ctx,e.group_id,e.fiscal_year);current_value:=source_value->>'sourceVersion'=e.body->>'sourceVersion' AND revision_value=CASE WHEN summary->>'status'='approved' THEN (summary#>>'{decision,revision}')::integer ELSE (e.body->>'baseRevision')::integer END;EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'IMPUTATION_REOPENED' THEN RAISE;END IF;END;
 IF octet_length(e.source_snapshot::text)+octet_length(e.allocation::text)+8192>16777216 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-payroll-imputation.v1','scopeVersion',public.native_salary_scope_v1(ctx),'proposal',summary,'body',e.body,'source',e.source_snapshot,'allocation',e.allocation,'allocationSha256',e.body->>'allocationSha256','sourceCurrent',current_value);END $$;
CREATE FUNCTION public.own_imputation_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_imputation_event;BEGIN ctx:=public.own_close_context_v1(p,true);SELECT * INTO e FROM public.own_payroll_imputation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'IMPUTATION_NOT_FOUND';END IF;IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'IMPUTATION_FORBIDDEN';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END $$;
CREATE FUNCTION public.own_imputation_command_v1(p jsonb,body_value jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text:=body_value->>'command';field text;gid uuid;fy text;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;source_value jsonb;allocation_value jsonb;proposal public.own_payroll_imputation_event;prior public.own_payroll_imputation_event;receipt_value jsonb;added bigint;
BEGIN
 ctx:=public.own_close_context_v1(p,true);
 IF NOT public.own_program_exact_v1(body_value,ARRAY['version','command','groupId','fiscalYear','scopeVersion','sourceVersion','allocationSha256','baseRevision','proposalId','proposalSha256','reason','reviewConfirmed']) OR body_value->>'version' IS DISTINCT FROM 'own-payroll-imputation.v1' OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body_value->'reason',10,1000) OR body_value->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body_value::text)>32768 THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['scopeVersion','sourceVersion','allocationSha256'] LOOP IF jsonb_typeof(body_value->field) IS DISTINCT FROM 'string' OR body_value->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;END LOOP;
 IF jsonb_typeof(body_value->'groupId') IS DISTINCT FROM 'string' OR body_value->>'groupId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(body_value->'fiscalYear') IS DISTINCT FROM 'string' OR body_value->>'fiscalYear'!~'^(19|20)[0-9]{2}$' OR jsonb_typeof(body_value->'baseRevision') IS DISTINCT FROM 'number' OR body_value->>'baseRevision'!~'^(0|[1-9][0-9]{0,3})$' OR (body_value->>'baseRevision')::integer>1000 THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'IMPUTATION_FORBIDDEN';END IF;
 PERFORM public.own_imputation_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body_value);
 SELECT * INTO prior FROM public.own_payroll_imputation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body_value THEN RAISE EXCEPTION 'IMPUTATION_IDEMPOTENCY_REUSE';END IF;RETURN public.own_imputation_attempt_v1(p,key);END IF;
 IF body_value->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'IMPUTATION_SCOPE_CHANGED';END IF;
 gid:=(body_value->>'groupId')::uuid;fy:=body_value->>'fiscalYear';rev:=(body_value->>'baseRevision')::integer;
 IF cmd='propose' THEN
  IF body_value->'proposalId' IS DISTINCT FROM 'null'::jsonb OR body_value->'proposalSha256' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;
  pid:=eid;source_value:=public.own_imputation_source_value_v1(ctx,gid,fy);allocation_value:=public.own_imputation_allocate_v1(source_value);
  IF rev<>public.own_imputation_revision_v1(ctx,gid,fy) OR body_value->>'sourceVersion' IS DISTINCT FROM source_value->>'sourceVersion' OR body_value->>'allocationSha256' IS DISTINCT FROM public.own_run_hash_v1(allocation_value) THEN RAISE EXCEPTION 'IMPUTATION_SOURCE_CHANGED';END IF;
  IF allocation_value->'ready' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'IMPUTATION_REVIEW_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM public.own_payroll_imputation_event e LEFT JOIN public.own_payroll_imputation_event d ON d.proposal_id=e.id WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.group_id=gid AND e.fiscal_year=fy AND e.command='propose' AND e.body->>'sourceVersion'=body_value->>'sourceVersion' AND (d.id IS NULL OR d.command='approve')) THEN RAISE EXCEPTION 'IMPUTATION_DUPLICATE';END IF;
 ELSE
  IF jsonb_typeof(body_value->'proposalId') IS DISTINCT FROM 'string' OR body_value->>'proposalId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(body_value->'proposalSha256') IS DISTINCT FROM 'string' OR body_value->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'IMPUTATION_INPUT_INVALID';END IF;
  pid:=(body_value->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_payroll_imputation_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMPUTATION_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_payroll_imputation_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'IMPUTATION_DECIDED';END IF;
  IF NOT(public.own_imputation_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'IMPUTATION_INDEPENDENT_REQUIRED';END IF;
  FOREACH field IN ARRAY ARRAY['groupId','fiscalYear','sourceVersion','allocationSha256','baseRevision'] LOOP IF body_value->field IS DISTINCT FROM proposal.body->field THEN RAISE EXCEPTION 'IMPUTATION_PROPOSAL_CHANGED';END IF;END LOOP;
  IF body_value->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 THEN RAISE EXCEPTION 'IMPUTATION_PROPOSAL_CHANGED';END IF;
  IF cmd='approve' THEN
   source_value:=public.own_imputation_source_value_v1(ctx,gid,fy);
   IF rev<>public.own_imputation_revision_v1(ctx,gid,fy) OR body_value->>'sourceVersion' IS DISTINCT FROM source_value->>'sourceVersion' THEN RAISE EXCEPTION 'IMPUTATION_SOURCE_CHANGED';END IF;
   allocation_value:=public.own_imputation_allocate_v1(source_value);
   IF allocation_value IS DISTINCT FROM proposal.allocation OR public.own_run_hash_v1(allocation_value) IS DISTINCT FROM body_value->>'allocationSha256' OR allocation_value->'ready' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'IMPUTATION_SOURCE_CHANGED';END IF;rev:=rev+1;
  END IF;
  source_value:='null';allocation_value:='null';
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_payroll_imputation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=500 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-imputation:capacity:v1',0)) THEN RAISE EXCEPTION 'IMPUTATION_BUSY';END IF;
 added:=octet_length(source_value::text)+octet_length(allocation_value::text)+4*octet_length(body_value::text)+8192;
 IF(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.source_snapshot::text)+octet_length(e.allocation::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_imputation_event e)+added>536870912 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.source_snapshot::text)+octet_length(e.allocation::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_imputation_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added>268435456 THEN RAISE EXCEPTION 'IMPUTATION_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-payroll-imputation.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body_value,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'allocationSha256',body_value->>'allocationSha256','sourceVersion',body_value->>'sourceVersion','replayed',false,'accountingPosted',false,'paymentExecuted',false);
 INSERT INTO public.own_payroll_imputation_event(id,tenant_id,source_binding_id,proposal_id,group_id,fiscal_year,command,body,source_snapshot,allocation,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,gid,fy,cmd,body_value,source_value,allocation_value,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.own_imputation_immutable_v1(),public.own_imputation_lock_v1(jsonb),public.own_imputation_revision_v1(jsonb,uuid,text),public.own_imputation_source_value_v1(jsonb,uuid,text),public.own_imputation_allocate_v1(jsonb),public.own_imputation_source_v1(jsonb,uuid,text),public.own_imputation_summary_v1(jsonb,public.own_payroll_imputation_event),public.own_imputation_bootstrap_v1(jsonb,text,text),public.own_imputation_detail_v1(jsonb,uuid),public.own_imputation_attempt_v1(jsonb,uuid),public.own_imputation_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_imputation_source_v1(jsonb,uuid,text),public.own_imputation_bootstrap_v1(jsonb,text,text),public.own_imputation_detail_v1(jsonb,uuid),public.own_imputation_attempt_v1(jsonb,uuid),public.own_imputation_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
