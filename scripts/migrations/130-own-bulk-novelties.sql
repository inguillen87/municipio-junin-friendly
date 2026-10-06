-- Complete native batches. Closed093 selects explicit registered contracts.
-- No TXT, DNI resolver, GRH observation, salary formula, IAM grant or backfill.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_novelty_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_novelty_%') THEN RAISE EXCEPTION 'OWN_NOVELTY_ALREADY_INSTALLED';END IF;
 IF to_regprocedure('public.own_run_hash_v1(jsonb)') IS NULL OR to_regprocedure('public.payroll_novelty_native_subject_v2(jsonb,jsonb,date,boolean)') IS NULL THEN RAISE EXCEPTION 'OWN_NOVELTY_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_payroll_novelty_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 batch_id uuid NOT NULL,revision integer NOT NULL CHECK(revision BETWEEN 1 AND 10000),command text NOT NULL CHECK(command IN('prepare','submit','approve','reject','cancel')),
 status text NOT NULL CHECK(status IN('draft','submitted','approved','rejected','cancelled')),period_month date NOT NULL CHECK(extract(day FROM period_month)=1 AND period_month BETWEEN DATE '2008-01-01' AND DATE '2099-12-01'),
 payroll_type text NOT NULL CHECK(payroll_type IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')),content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=4194304),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=8388608 AND jsonb_array_length(snapshot->'rows') BETWEEN 1 AND 10000),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,batch_id,revision),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_novelty_one_prepare ON public.own_payroll_novelty_event(tenant_id,source_binding_id,batch_id) WHERE command='prepare';
ALTER TABLE public.own_payroll_novelty_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_novelty_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_novelty_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'OWN_NOVELTY_IMMUTABLE';END $$;
CREATE TRIGGER own_novelty_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_novelty_event FOR EACH ROW EXECUTE FUNCTION public.own_novelty_immutable_v1();
CREATE TRIGGER own_novelty_no_truncate BEFORE TRUNCATE ON public.own_payroll_novelty_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_novelty_immutable_v1();
CREATE FUNCTION public.own_novelty_context_v1(p jsonb,cap text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;k text;BEGIN ctx:=public.native_employment_change_context_v1(p);
 FOREACH k IN ARRAY ARRAY['payroll.novelty.read','payroll.novelty.nominal.read'] LOOP IF NOT public.action_center_context_has_capability(ctx,k) THEN RAISE EXCEPTION 'OWN_NOVELTY_FORBIDDEN';END IF;END LOOP;
 IF cap IS NOT NULL AND (cap NOT IN('payroll.novelty.prepare','payroll.novelty.approve','payroll.novelty.export') OR NOT public.action_center_context_has_capability(ctx,cap)) THEN RAISE EXCEPTION 'OWN_NOVELTY_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'OWN_NOVELTY_FORBIDDEN';END IF;
 RETURN ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId');END $$;
CREATE FUNCTION public.own_novelty_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF NOT pg_try_advisory_xact_lock(hashtextextended('own-novelty:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'OWN_NOVELTY_BUSY';END IF;END $$;
CREATE FUNCTION public.own_novelty_rows_v1(rows_value jsonb,period_value date) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;v jsonb;n integer:=0;seen text[]:='{}';key_value text;total numeric:=0;
BEGIN
 IF jsonb_typeof(rows_value) IS DISTINCT FROM 'array' OR jsonb_array_length(rows_value) NOT BETWEEN 1 AND 10000 OR period_value IS NULL OR extract(day FROM period_value)<>1 OR period_value NOT BETWEEN DATE '2008-01-01' AND DATE '2099-12-01' THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rows_value) LOOP n:=n+1;
  IF NOT public.own_program_exact_v1(r,ARRAY['rowOrdinal','legajo','contractId','identityToken','conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced']) OR r->'rowOrdinal' IS DISTINCT FROM to_jsonb(n) OR jsonb_typeof(r->'contractId') IS DISTINCT FROM 'string' OR coalesce(r->>'contractId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR r->>'contractId'='00000000-0000-0000-0000-000000000000' OR jsonb_typeof(r->'identityToken') IS DISTINCT FROM 'string' OR coalesce(r->>'identityToken','')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  v:=(r-'contractId'-'identityToken')||jsonb_build_object('rowOrdinal',1);
  IF NOT public.payroll_novelty_native_rows_valid_v2(jsonb_build_array(v||jsonb_build_object('contractId',r->>'contractId','identityToken',r->>'identityToken')),'individual') THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  IF r->>'adjustmentMonth' IS NOT NULL AND (r->>'adjustmentMonth')::date>period_value THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  IF r->>'quantityDecimal' IS NOT NULL AND r->>'quantityDecimal' IS DISTINCT FROM trim_scale((r->>'quantityDecimal')::numeric(20,6))::text OR r->>'amountCents' IS NOT NULL AND r->>'amountCents' IS DISTINCT FROM ((r->>'amountCents')::bigint)::text THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  total:=total+coalesce((r->>'amountCents')::bigint,0);
  key_value:=(r->>'contractId')||chr(31)||(r->>'conceptSourceId')||chr(31)||coalesce(r->>'costCenterSourceId','')||chr(31)||coalesce(r->>'adjustmentMonth','')||chr(31)||coalesce(r->>'movementType','');
  IF key_value=ANY(seen) THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;seen:=array_append(seen,key_value);
 END LOOP;
 IF total NOT BETWEEN -9223372036854775808 AND 9223372036854775807 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
END $$;
CREATE FUNCTION public.own_novelty_content_v1(ctx jsonb,period_value date,type_value text,rows_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(convert_to(jsonb_build_object('contractVersion','payroll-novelty-batch.v2','tenantId',ctx->>'tenantId','certifiedBindingId',ctx->>'certifiedBindingId','periodMonth',to_char(period_value,'YYYY-MM-DD'),'payrollType',type_value,'rows',jsonb_agg(r-'rowOrdinal' ORDER BY(r->>'contractId')||chr(31)||(r->>'conceptSourceId')||chr(31)||coalesce(r->>'costCenterSourceId','')||chr(31)||coalesce(r->>'adjustmentMonth','')||chr(31)||coalesce(r->>'movementType',''),(r-'rowOrdinal')::text))::text,'UTF8'),'sha256'),'hex') FROM jsonb_array_elements(rows_value) r
$$;
CREATE FUNCTION public.own_novelty_current_v1(ctx jsonb) RETURNS SETOF public.own_payroll_novelty_event LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT DISTINCT ON(e.batch_id) e.* FROM public.own_payroll_novelty_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid ORDER BY e.batch_id,e.revision DESC
$$;
CREATE FUNCTION public.own_novelty_view_v1(ctx jsonb,snapshot_value jsonb,selected uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;s jsonb;rows_value jsonb:='[]';current_value boolean;BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(snapshot_value->'rows') LOOP
  current_value:=false;
  IF selected IS NULL OR (r#>>'{values,contractId}')::uuid=ANY(selected) THEN
   BEGIN s:=public.payroll_novelty_native_subject_v2(ctx,r->'values',(snapshot_value->>'periodMonth')::date,false);current_value:=s=r->'subject';EXCEPTION WHEN SQLSTATE 'P0001' THEN current_value:=false;END;
  ELSE current_value:=false;END IF;
  rows_value:=rows_value||jsonb_build_array(r||jsonb_build_object('identityCurrent',current_value));
 END LOOP;
 RETURN snapshot_value||jsonb_build_object('rows',rows_value);END $$;
CREATE FUNCTION public.own_novelty_receipt_v1(e public.own_payroll_novelty_event,replayed boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('version','own-payroll-novelty-receipt.v1','requestKey',e.request_key,'requestSha256',e.request_sha256,'body',e.body,'snapshot',e.snapshot,'replayed',replayed)
$$;
CREATE FUNCTION public.own_novelty_detail_v1(p jsonb,batch uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;BEGIN ctx:=public.own_novelty_context_v1(p);SELECT * INTO e FROM public.own_novelty_current_v1(ctx) WHERE batch_id=batch;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;RETURN public.own_novelty_view_v1(ctx,e.snapshot);END $$;
CREATE FUNCTION public.own_novelty_attempt_v1(p jsonb,key_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;cap text;BEGIN ctx:=public.own_novelty_context_v1(p);
 SELECT * INTO e FROM public.own_payroll_novelty_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key_value;
 IF NOT FOUND OR e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;
 cap:=CASE WHEN e.command IN('approve','reject') THEN 'payroll.novelty.approve' ELSE 'payroll.novelty.prepare' END;PERFORM public.own_novelty_context_v1(p,cap);RETURN public.own_novelty_receipt_v1(e,true);END $$;
CREATE FUNCTION public.own_novelty_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;subjects jsonb:='[]';batches jsonb;reg record;s jsonb;BEGIN ctx:=public.own_novelty_context_v1(p);PERFORM public.own_novelty_lock_v1(ctx);
 FOR reg IN SELECT n.contract_id FROM public.native_employee_registration n JOIN public.employment_contract ec ON ec.id=n.contract_id WHERE n.tenant_id=(ctx->>'tenantId')::uuid AND n.source_binding_id=(ctx->>'sourceBindingId')::uuid AND ec.tenant_id=n.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL AND ec.status='active' ORDER BY ec.legacy_legajo,ec.id LOOP
  s:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,reg.contract_id,false)->'subject';subjects:=subjects||jsonb_build_array(s);IF jsonb_array_length(subjects)>10000 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.batch_id,'revision',e.revision,'status',e.status,'periodMonth',e.snapshot->>'periodMonth','payrollType',e.payroll_type,'rowCount',e.snapshot->'rowCount','preparedBy',e.snapshot->'preparedBy') ORDER BY e.recorded_at,e.batch_id),'[]') INTO batches FROM public.own_novelty_current_v1(ctx) e;
 IF jsonb_array_length(batches)>1000 OR octet_length(subjects::text)+octet_length(batches::text)>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-payroll-novelty-bootstrap.v1','complete',true,'subjects',subjects,'batches',batches,'permissions',jsonb_build_object('canPrepare',public.action_center_context_has_capability(ctx,'payroll.novelty.prepare'),'canApprove',public.action_center_context_has_capability(ctx,'payroll.novelty.approve')));END $$;
CREATE FUNCTION public.own_novelty_destination_lock_v1(ctx jsonb,period_value date,type_value text,r jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('own-novelty-destination:'||(ctx->>'tenantId')||':'||(ctx->>'certifiedBindingId')||':'||period_value::text||':'||type_value||':'||(r->>'contractId')||chr(31)||(r->>'conceptSourceId')||chr(31)||coalesce(r->>'costCenterSourceId','')||chr(31)||coalesce(r->>'adjustmentMonth','')||chr(31)||coalesce(r->>'movementType',''),0));END $$;
CREATE FUNCTION public.own_novelty_conflict_v1(ctx jsonb,period_value date,type_value text,r jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.own_novelty_current_v1(ctx) e CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'rows') old WHERE e.status IN('draft','submitted','approved') AND e.period_month=period_value AND e.payroll_type=type_value AND old#>>'{values,contractId}'=r->>'contractId' AND old#>>'{values,conceptSourceId}'=r->>'conceptSourceId' AND old#>>'{values,costCenterSourceId}' IS NOT DISTINCT FROM r->>'costCenterSourceId' AND old#>>'{values,adjustmentMonth}' IS NOT DISTINCT FROM r->>'adjustmentMonth' AND old#>>'{values,movementType}' IS NOT DISTINCT FROM r->>'movementType')
$$;
CREATE FUNCTION public.own_novelty_legacy_row_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.payroll_novelty_batch;ctx jsonb;r jsonb;BEGIN SELECT * INTO b FROM public.payroll_novelty_batch WHERE id=NEW.batch_id;
 IF b.contract_version='payroll-novelty-batch.v2' THEN
  ctx:=jsonb_build_object('tenantId',b.tenant_id,'sourceBindingId',b.certified_binding_id,'certifiedBindingId',b.certified_binding_id);
  r:=jsonb_build_object('contractId',NEW.employment_contract_id,'conceptSourceId',NEW.concept_source_id,'costCenterSourceId',NEW.cost_center_source_id,'adjustmentMonth',NEW.adjustment_month,'movementType',NEW.movement_type);
  PERFORM public.own_novelty_destination_lock_v1(ctx,b.period_month,b.payroll_type,r);IF public.own_novelty_conflict_v1(ctx,b.period_month,b.payroll_type,r) THEN RAISE EXCEPTION 'OWN_NOVELTY_CONFLICT';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER own_novelty_legacy_row BEFORE INSERT ON public.payroll_novelty_row FOR EACH ROW EXECUTE FUNCTION public.own_novelty_legacy_row_v1();
CREATE FUNCTION public.own_novelty_command_v1(p jsonb,body_value jsonb,key_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;prior public.own_payroll_novelty_event;batch uuid;revision_value integer;status_value text;period_value date;type_value text;command_value text:=body_value->>'command';content_value text;r jsonb;s jsonb;rows_value jsonb:='[]';snapshot_value jsonb;actor_value jsonb;ref text;
BEGIN
 IF command_value IS NULL OR command_value NOT IN('prepare','submit','approve','reject','cancel') OR body_value->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR key_value IS NULL OR key_value::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body_value::text)>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
 ctx:=public.own_novelty_context_v1(p,CASE WHEN command_value IN('approve','reject') THEN 'payroll.novelty.approve' ELSE 'payroll.novelty.prepare' END);PERFORM public.own_novelty_lock_v1(ctx);
 SELECT * INTO prior FROM public.own_payroll_novelty_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key_value;
 IF FOUND THEN IF prior.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR prior.actor_email<>ctx->>'actorEmail' OR prior.body<>body_value OR prior.request_sha256<>public.own_run_hash_v1(body_value) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDEMPOTENCY_REUSE';END IF;RETURN public.own_novelty_receipt_v1(prior,true);END IF;
 actor_value:=jsonb_build_object('membershipId',ctx->>'membershipId','personId',ctx->>'actorPersonId');
 IF command_value='prepare' THEN
  IF NOT public.own_program_exact_v1(body_value,ARRAY['command','periodMonth','payrollType','rows','reviewConfirmed']) OR jsonb_typeof(body_value->'periodMonth') IS DISTINCT FROM 'string' OR coalesce(body_value->>'periodMonth','')!~'^20(0[8-9]|[1-9][0-9])-(0[1-9]|1[0-2])-01$' OR jsonb_typeof(body_value->'payrollType') IS DISTINCT FROM 'string' OR body_value->>'payrollType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  period_value:=(body_value->>'periodMonth')::date;type_value:=body_value->>'payrollType';PERFORM public.own_novelty_rows_v1(body_value->'rows',period_value);
  content_value:=public.own_novelty_content_v1(ctx,period_value,type_value,body_value->'rows');PERFORM pg_advisory_xact_lock(hashtextextended('payroll-novelty-active:'||content_value,0));
  IF EXISTS(SELECT 1 FROM public.own_novelty_current_v1(ctx) x WHERE x.status IN('draft','submitted','approved') AND x.content_sha256=content_value) OR EXISTS(SELECT 1 FROM public.payroll_novelty_batch b WHERE b.tenant_id=(ctx->>'tenantId')::uuid AND b.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND b.status IN('draft','submitted','approved') AND btrim(b.content_sha256)=content_value) THEN RAISE EXCEPTION 'OWN_NOVELTY_DUPLICATE_BATCH';END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(body_value->'rows') ORDER BY value->>'contractId',value->>'conceptSourceId',value->>'costCenterSourceId',value->>'adjustmentMonth',value->>'movementType' LOOP
   PERFORM public.own_novelty_destination_lock_v1(ctx,period_value,type_value,r);
   IF public.own_novelty_conflict_v1(ctx,period_value,type_value,r) OR EXISTS(SELECT 1 FROM public.payroll_novelty_row nr JOIN public.payroll_novelty_batch nb ON nb.id=nr.batch_id WHERE nb.tenant_id=(ctx->>'tenantId')::uuid AND nb.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND nb.status IN('draft','submitted','approved') AND nb.period_month=period_value AND nb.payroll_type=type_value AND nr.employment_contract_id=(r->>'contractId')::uuid AND nr.concept_source_id=r->>'conceptSourceId' AND nr.cost_center_source_id IS NOT DISTINCT FROM r->>'costCenterSourceId' AND nr.adjustment_month IS NOT DISTINCT FROM (r->>'adjustmentMonth')::date AND nr.movement_type IS NOT DISTINCT FROM r->>'movementType') THEN RAISE EXCEPTION 'OWN_NOVELTY_CONFLICT';END IF;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(body_value->'rows') LOOP s:=public.payroll_novelty_native_subject_v2(ctx,r,period_value,true);rows_value:=rows_value||jsonb_build_array(jsonb_build_object('values',r,'subject',s,'identityCurrent',true));END LOOP;
  batch:=gen_random_uuid();revision_value:=1;status_value:='draft';
  snapshot_value:=jsonb_build_object('version','own-payroll-novelty-batch.v1','id',batch,'revision',1,'status','draft','periodMonth',to_char(period_value,'YYYY-MM-DD'),'payrollType',type_value,'rows',rows_value,'rowCount',jsonb_array_length(rows_value),'rowsSha256',public.own_run_hash_v1((SELECT jsonb_agg(x-'identityCurrent' ORDER BY ord) FROM jsonb_array_elements(rows_value) WITH ORDINALITY a(x,ord))),'preparedBy',actor_value,'decidedBy',NULL,'approvals','[]'::jsonb,'grhMutation',false,'payrollCalculated',false,'payrollPosted',false);
 ELSE
  IF NOT public.own_program_exact_v1(body_value,ARRAY['command','batchId','expectedRevision','reasonReference','reviewConfirmed']) OR jsonb_typeof(body_value->'batchId') IS DISTINCT FROM 'string' OR coalesce(body_value->>'batchId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body_value->'expectedRevision') IS DISTINCT FROM 'number' OR coalesce(body_value->>'expectedRevision','')!~'^[1-9][0-9]{0,4}$' THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  ref:=body_value->>'reasonReference';IF command_value IN('reject','cancel') THEN IF jsonb_typeof(body_value->'reasonReference') IS DISTINCT FROM 'string' OR coalesce(ref,'')!~'^ref:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;ELSIF body_value->'reasonReference' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  batch:=(body_value->>'batchId')::uuid;SELECT * INTO e FROM public.own_novelty_current_v1(ctx) WHERE batch_id=batch;IF NOT FOUND THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;
  IF e.revision<>(body_value->>'expectedRevision')::integer THEN RAISE EXCEPTION 'OWN_NOVELTY_VERSION_CHANGED';END IF;
  IF command_value IN('submit','cancel') AND(e.snapshot#>>'{preparedBy,personId}'<>ctx->>'actorPersonId' OR e.snapshot#>>'{preparedBy,membershipId}'<>ctx->>'membershipId') THEN RAISE EXCEPTION 'OWN_NOVELTY_FORBIDDEN';END IF;
  IF command_value IN('approve','reject') AND(e.snapshot#>>'{preparedBy,personId}'=ctx->>'actorPersonId' OR e.snapshot#>>'{preparedBy,membershipId}'=ctx->>'membershipId') THEN RAISE EXCEPTION 'OWN_NOVELTY_INDEPENDENT_REQUIRED';END IF;
  IF command_value='approve' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'approvals') reviewer WHERE reviewer->>'personId'=ctx->>'actorPersonId' OR reviewer->>'membershipId'=ctx->>'membershipId') THEN RAISE EXCEPTION 'OWN_NOVELTY_INDEPENDENT_REQUIRED';END IF;
  IF command_value='submit' AND e.status<>'draft' OR command_value IN('approve','reject') AND e.status<>'submitted' OR command_value='cancel' AND e.status NOT IN('draft','submitted','approved') THEN RAISE EXCEPTION 'OWN_NOVELTY_STATE_INVALID';END IF;
  IF command_value='cancel' THEN
   PERFORM public.own_run_lock_v1(ctx);LOCK TABLE public.own_payroll_run_capture IN SHARE MODE NOWAIT;
   IF EXISTS(SELECT 1 FROM public.own_payroll_run_capture c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload#>'{monthly,nativeBatches}','[]')) b WHERE c.tenant_id=e.tenant_id AND c.source_binding_id=e.source_binding_id AND b->>'id'=batch::text) THEN RAISE EXCEPTION 'OWN_NOVELTY_IN_USE';END IF;
  END IF;
  snapshot_value:=public.own_novelty_view_v1(ctx,e.snapshot);IF command_value IN('submit','approve') AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot_value->'rows') row_item WHERE row_item->'identityCurrent' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDENTITY_CHANGED';END IF;
  revision_value:=e.revision+1;status_value:=CASE command_value WHEN 'submit' THEN 'submitted' WHEN 'approve' THEN CASE WHEN jsonb_array_length(e.snapshot->'approvals')=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'rows') row_item WHERE row_item#>'{values,forced}'='true'::jsonb) THEN 'submitted' ELSE 'approved' END WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END;period_value:=e.period_month;type_value:=e.payroll_type;content_value:=e.content_sha256;
  snapshot_value:=e.snapshot||jsonb_build_object('revision',revision_value,'status',status_value,'approvals',CASE WHEN command_value='approve' THEN(e.snapshot->'approvals')||jsonb_build_array(actor_value) ELSE e.snapshot->'approvals' END,'decidedBy',CASE WHEN command_value='reject' OR command_value='approve' AND status_value='approved' THEN actor_value ELSE e.snapshot->'decidedBy' END);
 END IF;
 -- A committed command must have a recoverable complete receipt within the
 -- existing serverless response budget, including its original body.
 IF revision_value>10000 OR octet_length(snapshot_value::text)+octet_length(body_value::text)+8192>4194304 OR (SELECT count(*) FROM public.own_novelty_current_v1(ctx))>=1000 AND command_value='prepare' THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-novelty:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_NOVELTY_BUSY';END IF;
 IF (SELECT coalesce(sum(octet_length(snapshot::text)+octet_length(body::text)),0) FROM public.own_payroll_novelty_event)+octet_length(snapshot_value::text)+octet_length(body_value::text)>536870912 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 INSERT INTO public.own_payroll_novelty_event(tenant_id,source_binding_id,batch_id,revision,command,status,period_month,payroll_type,content_sha256,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,request_sha256,body,snapshot) VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,batch,revision_value,command_value,status_value,period_value,type_value,content_value,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key_value,public.own_run_hash_v1(body_value),body_value,snapshot_value) RETURNING * INTO e;
 RETURN public.own_novelty_receipt_v1(e,false);END $$;
CREATE FUNCTION public.own_novelty_sources_v1(p jsonb,period_value date,type_value text,selected uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;s jsonb;result_value jsonb:='[]';BEGIN ctx:=public.own_novelty_context_v1(p,'payroll.novelty.export');
 LOCK TABLE public.own_payroll_novelty_event IN SHARE MODE NOWAIT;
 FOR e IN SELECT x.* FROM public.own_novelty_current_v1(ctx) x WHERE x.status='approved' AND x.period_month=period_value AND x.payroll_type=type_value AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.snapshot->'rows') r WHERE (r#>>'{values,contractId}')::uuid=ANY(selected)) ORDER BY x.batch_id LOOP
  s:=public.own_novelty_view_v1(ctx,e.snapshot,selected);IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'rows') r WHERE (r#>>'{values,contractId}')::uuid=ANY(selected) AND r->'identityCurrent' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDENTITY_CHANGED';END IF;
  result_value:=result_value||jsonb_build_array(s);
 END LOOP;IF octet_length(result_value::text)>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;RETURN result_value;END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_novelty_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',f.signature);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.own_novelty_bootstrap_v1(jsonb),public.own_novelty_detail_v1(jsonb,uuid),public.own_novelty_attempt_v1(jsonb,uuid),public.own_novelty_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capture_v1(p jsonb,body jsonb,key uuid,algorithm text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;prior public.own_payroll_run_capture;c public.own_payroll_run_capture;reg record;s jsonb;program_state jsonb;employees jsonb:='[]';ids uuid[]:='{}';batches jsonb:='[]';native_batches jsonb:='[]';b record;batch_data jsonb;list_value jsonb;export_value jsonb;list_rows jsonb;export_rows jsonb;population jsonb;payload_value jsonb;inventory jsonb;first_date date;last_date date;kind text;v text;fingerprint text;field text;
BEGIN ctx:=public.own_run_context_v1(p,true,true);
 IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','selection','scopeVersion','programVersion','populationDomain']) OR NOT public.own_program_exact_v1(body->'selection',ARRAY['kind','values']) OR octet_length(body::text)>524288 THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['period','liquidationType','scopeVersion','programVersion','populationDomain'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;END LOOP;
 IF coalesce(body->>'period','')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR body->>'liquidationType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR body->>'populationDomain'<>'native_registered' OR coalesce(body->>'scopeVersion','')!~'^[a-f0-9]{64}$' OR coalesce(body->>'programVersion','')!~'^[a-f0-9]{64}$' OR coalesce(algorithm,'')!~'^[a-f0-9]{64}$' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 kind:=body#>>'{selection,kind}';IF jsonb_typeof(body#>'{selection,kind}') IS DISTINCT FROM 'string' OR kind NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(body#>'{selection,values}') IS DISTINCT FROM 'array' OR jsonb_array_length(body#>'{selection,values}')>10000 THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
 IF (kind='all')<>(jsonb_array_length(body#>'{selection,values}')=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(body#>'{selection,values}') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements_text(body#>'{selection,values}') x) OR body#>'{selection,values}' IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(body#>'{selection,values}') x) THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
 PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO prior FROM public.own_payroll_run_capture WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN PERFORM public.own_run_owned_v1(ctx,prior);IF prior.body<>body OR prior.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_RUN_IDEMPOTENCY_REUSE';END IF;RETURN public.own_run_receipt_v1(prior,true);END IF;
 IF body->>'scopeVersion'<>public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'OWN_RUN_SCOPE_CHANGED';END IF;
 -- SHARE locks prevent concurrent source changes during this read-committed
 -- transaction. Existing advisory locks remain effective. No source mutation.
 LOCK TABLE public.person_identity,public.employment_contract,public.native_employee_registration,public.native_employment_change_review,public.native_employment_lifecycle_review,public.native_salary_event,public.own_payroll_program_event,public.payroll_novelty_batch,public.payroll_novelty_row,public.payroll_novelty_issue,public.payroll_novelty_event,public.payroll_fixed_novelty,public.payroll_fixed_novelty_event IN SHARE MODE NOWAIT;
 program_state:=public.own_program_bootstrap_v1(p);
 IF body->>'programVersion'<>program_state#>>'{program,version}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_CHANGED';END IF;
 IF (program_state#>>'{program,revision}')::integer<1 OR program_state#>>'{program,salaryVersion}' IS DISTINCT FROM program_state#>>'{salaryCatalog,version}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
 first_date:=(body->>'period'||'-01')::date;last_date:=(first_date+interval '1 month - 1 day')::date;
 FOR reg IN SELECT n.*,n.contract_id AS employment_contract_id,ec.legacy_legajo,ec.agreement_code,ec.category_code,ec.sector_source_id FROM public.native_employee_registration n JOIN public.employment_contract ec ON ec.id=n.contract_id WHERE n.tenant_id=(ctx->>'tenantId')::uuid AND n.source_binding_id=(ctx->>'sourceBindingId')::uuid AND ec.tenant_id=n.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL AND(kind='all' OR kind='contracts' AND body#>'{selection,values}' ? ec.id::text OR kind='agreements' AND body#>'{selection,values}' ? ec.agreement_code OR kind='departments' AND body#>'{selection,values}' ? ec.sector_source_id) ORDER BY ec.id LOOP
  IF NOT public.native_employment_lifecycle_range_v1(ctx,reg.employment_contract_id,first_date,last_date,false) THEN IF kind='contracts' THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;CONTINUE;END IF;
  IF NOT public.native_employment_lifecycle_range_v1(ctx,reg.employment_contract_id,first_date,last_date,true) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;
  -- Current classification is not a historical reconstruction. Never apply
  -- a later registration/correction retroactively to an earlier payroll.
  IF (reg.created_at AT TIME ZONE 'America/Argentina/Mendoza')::date>last_date OR EXISTS(SELECT 1 FROM public.native_employment_change_review r WHERE r.contract_id=reg.employment_contract_id AND r.decision='approve' AND (r.reviewed_at AT TIME ZONE 'America/Argentina/Mendoza')::date>=first_date) THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;
  s:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,reg.employment_contract_id,true)->'subject';
  IF s->>'origin'<>'MUNICONTROL' OR s->>'contractId'<>reg.employment_contract_id::text OR s->>'legajo'<>reg.legacy_legajo OR coalesce(reg.agreement_code,'')!~'^[0-9]{1,9}$' OR coalesce(reg.category_code,'')!~'^[0-9]{1,9}$' OR coalesce(reg.sector_source_id,'')!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
  ids:=array_append(ids,reg.employment_contract_id);employees:=employees||jsonb_build_array(jsonb_build_object('contractId',reg.employment_contract_id,'employeeNumber',reg.legacy_legajo,'agreementCode',reg.agreement_code,'categoryCode',reg.category_code,'departmentCode',reg.sector_source_id,'identityToken',s->>'identityToken','origin','MUNICONTROL'));
  IF cardinality(ids)>10000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 END LOOP;
 IF cardinality(ids)=0 OR kind='contracts' AND cardinality(ids)<>jsonb_array_length(body#>'{selection,values}') OR kind IN('agreements','departments') AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(body#>'{selection,values}') chosen WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e WHERE e->>CASE kind WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END=chosen)) THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
 population:=jsonb_build_object('complete',true,'version',public.own_run_hash_v1(employees),'employees',employees);
 FOR b IN SELECT nb.id FROM public.payroll_novelty_batch nb WHERE nb.tenant_id=(ctx->>'tenantId')::uuid AND nb.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND nb.period_month=first_date AND nb.payroll_type=body->>'liquidationType' AND nb.status='approved' AND EXISTS(SELECT 1 FROM public.payroll_novelty_row nr WHERE nr.batch_id=nb.id AND nr.employment_contract_id=ANY(ids)) ORDER BY nb.id LOOP
  batch_data:=public.payroll_novelty_export_v2(p,b.id)->'data';
  IF batch_data IS NULL OR batch_data->>'contractVersion'<>'payroll-novelty-batch.v2' OR EXISTS(SELECT 1 FROM jsonb_array_elements(batch_data->'rows') r WHERE NOT((r->>'employmentContractId')::uuid=ANY(ids))) THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
  batches:=batches||jsonb_build_array(batch_data);IF jsonb_array_length(batches)>10000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 END LOOP;
 native_batches:=public.own_novelty_sources_v1(p,first_date,body->>'liquidationType',ids);
 s:=public.own_run_fixed_v1(p,first_date,ids,body->>'liquidationType');list_value:=s#>'{list,data}';export_value:=s#>'{export,data}';
 inventory:=jsonb_build_object('populationDomain','native_registered','departmentSource','employment_contract.sector_source_id','monthlyBatches',jsonb_array_length(batches),'ownNativeBatches',jsonb_array_length(native_batches),'fixedScope','approved_selected_native','fixedSnapshotToken',list_value->>'snapshotToken','fixedListCount',list_value->'total','fixedExportCount',export_value->'total','fixedExportSha256',public.own_run_hash_v1(export_value));
 payload_value:=jsonb_build_object('programState',program_state,'population',population,'monthly',CASE WHEN jsonb_array_length(native_batches)=0 THEN jsonb_build_object('complete',true,'batches',batches) ELSE jsonb_build_object('complete',true,'batches',batches,'nativeBatches',native_batches) END,'fixed',jsonb_build_object('list',jsonb_build_object('ok',true,'data',list_value),'export',jsonb_build_object('ok',true,'data',export_value)),'period',body->>'period','liquidationType',body->>'liquidationType','selection',body->'selection','sourceInventory',inventory);
 IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304 OR (SELECT count(*) FROM public.own_payroll_run_capture WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 PERFORM public.own_run_capacity_v1(octet_length(payload_value::text)+octet_length(body::text));
 INSERT INTO public.own_payroll_run_capture(tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,algorithm_sha256,payload,payload_sha256) VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,algorithm,payload_value,public.own_run_hash_v1(payload_value)) RETURNING * INTO c;
 RETURN public.own_run_receipt_v1(c,false);END $$;
