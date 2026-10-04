-- Reviewed administrative correction of existing approved batches only.
-- No intake, identity assignment, new batch writer, salary calculation or posting.
-- Not executable until the full installation and synthetic QA package is complete.
DO $preflight$ DECLARE pin record; BEGIN
 FOR pin IN SELECT * FROM (VALUES
 ('public.payroll_novelty_batch_guard_v1()','c84068e1f00cf66dcb66c2715130992debde3537d1387a32d844457a2594d7c0'),
 ('public.payroll_novelty_event_guard_v1()','3417116ae720b4eee61cf40b1a997d442e328ce6447c0b05eb026ef05dc4407a'),
 ('public.payroll_novelty_row_guard_v1()','3ccc695b5e2df3420f8d24f63ffd2cfe0ad4731245b955f0be0ace7293e96769'),
 ('public.payroll_novelty_issue_guard_v1()','fbfc320c6a4a954267cc47ae69faba178c2fcb922075da5180afd31a7809da08'),
 ('public.payroll_novelty_snapshot_v1(uuid,uuid,boolean)','6469405c512f3c5b7e8319eeda443561dbabe7b789865f8d23709adca9bd70fd'),
 ('public.payroll_novelty_event_snapshot_v1(bigint,uuid,boolean)','3557d92e282e4d48a820c2e6f40043d7b7e554d5e4e81653b8618b49e7d239fc'),
 ('public.payroll_novelty_event_snapshot_v2(bigint,uuid,boolean)','4981da91247b56661fe50f2d785343bd709fa65432d6cb319f6beb4f05aa3c61'),
 ('public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)','ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613'),
 ('public.payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text)','1c0af0647c19b7cadcaded6239ec06e97c0463bd26ef5304cc768e9dd557aab8')
 ) p(signature,sha256) LOOP
  IF to_regprocedure(pin.signature) IS NULL OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=pin.signature::regprocedure) IS DISTINCT FROM pin.sha256
  THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_PREREQUISITE_DRIFT'; END IF;
 END LOOP;
 IF to_regprocedure('public.payroll_monthly_annul_context_v1(jsonb,text)') IS NULL OR to_regprocedure('public.payroll_novelty_native_subject_v2(jsonb,jsonb,date,boolean)') IS NULL
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_PREREQUISITE_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'payroll_monthly_correction_%')
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'payroll_monthly_correction_%')
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_ALREADY_PRESENT'; END IF;
END $preflight$;

CREATE TABLE public.payroll_monthly_correction_proposal (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,certified_binding_id uuid NOT NULL,
 proposer_membership_id uuid NOT NULL,proposer_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_context jsonb NOT NULL,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),patch jsonb NOT NULL CHECK(jsonb_typeof(patch)='object'),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
 preview_sha256 text NOT NULL CHECK(preview_sha256 ~ '^[a-f0-9]{64}$'),proposal_sha256 text NOT NULL CHECK(proposal_sha256 ~ '^[a-f0-9]{64}$'),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 5000),batch_count integer NOT NULL CHECK(batch_count BETWEEN 1 AND 100),
 period_months date[] NOT NULL CHECK(array_length(period_months,1) BETWEEN 1 AND 200 AND array_position(period_months,NULL) IS NULL),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(proposer_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.payroll_monthly_correction_review (
 id uuid PRIMARY KEY,proposal_id uuid NOT NULL UNIQUE REFERENCES public.payroll_monthly_correction_proposal(id),
 tenant_id uuid NOT NULL,certified_binding_id uuid NOT NULL,reviewer_membership_id uuid NOT NULL,
 reviewer_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_context jsonb NOT NULL,
 command text NOT NULL CHECK(command IN('approve','reject')),reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(reviewer_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.payroll_monthly_correction_attempt (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,certified_binding_id uuid NOT NULL,actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_context jsonb NOT NULL,
 idempotency_key uuid NOT NULL CHECK(idempotency_key::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 command text NOT NULL CHECK(command IN('propose','approve','reject')),request_body jsonb NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,certified_binding_id,actor_membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
ALTER TABLE public.payroll_monthly_correction_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_monthly_correction_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_monthly_correction_attempt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_monthly_correction_proposal,public.payroll_monthly_correction_review,public.payroll_monthly_correction_attempt FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER payroll_monthly_correction_proposal_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_monthly_correction_proposal FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();
CREATE TRIGGER payroll_monthly_correction_review_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_monthly_correction_review FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();
CREATE TRIGGER payroll_monthly_correction_attempt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_monthly_correction_attempt FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();

CREATE FUNCTION public.payroll_monthly_correction_patch_valid_v1(p_patch jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;v jsonb;t text;
BEGIN
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb
 OR (p_patch-ARRAY['periodMonth','payrollType','conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced'])<>'{}'::jsonb THEN RETURN false; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_patch) LOOP
  t:=v#>>'{}';
  IF k IN('periodMonth','adjustmentMonth') THEN
   IF k='adjustmentMonth' AND v='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(v)<>'string' OR t !~ '^20(0[8-9]|[1-9][0-9])-(0[1-9]|1[0-2])-01$' THEN RETURN false; END IF;
  ELSIF k='payrollType' THEN
   IF jsonb_typeof(v)<>'string' OR t NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RETURN false; END IF;
  ELSIF k IN('conceptSourceId','costCenterSourceId') THEN
   IF k='costCenterSourceId' AND v='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(v)<>'string' OR t !~ '^(0|[1-9][0-9]{0,19})$' THEN RETURN false; END IF;
  ELSIF k='quantityDecimal' THEN
   IF v='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(v)<>'string' OR t !~ '^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' OR t ~ '^-0(\.0+)?$' THEN RETURN false; END IF;
  ELSIF k='amountCents' THEN
   IF v='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(v)<>'string' OR t !~ '^-?(0|[1-9][0-9]{0,17})$' OR t='-0' THEN RETURN false; END IF;
  ELSIF k='forced' THEN
   IF jsonb_typeof(v)<>'boolean' THEN RETURN false; END IF;
  ELSIF k='movementType' THEN
   IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR t !~ '^[a-z0-9][a-z0-9._-]{0,31}$') THEN RETURN false; END IF;
  ELSE
   IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR char_length(t) NOT BETWEEN 1 AND CASE WHEN k='legalInstrument' THEN 160 ELSE 500 END OR t<>btrim(t) OR t ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION public.payroll_monthly_correction_content_v1(ctx jsonb,b jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('contractVersion',b->'contractVersion','tenantId',ctx->'tenantId','certifiedBindingId',ctx->'certifiedBindingId','periodMonth',b->'periodMonth','payrollType',b->'payrollType','rows',(
  SELECT jsonb_agg(payload ORDER BY business_key,payload::text) FROM (
   SELECT jsonb_build_object('legajo',r->'legajo','conceptSourceId',r->'conceptSourceId','costCenterSourceId',r->'costCenterSourceId','adjustmentMonth',r->'adjustmentMonth',
    'quantityDecimal',CASE WHEN r->'quantityDecimal'='null'::jsonb THEN 'null'::jsonb ELSE to_jsonb(trim_scale((r->>'quantityDecimal')::numeric(20,6))::text) END,
    'amountCents',r->'amountCents','movementType',r->'movementType','legalInstrument',r->'legalInstrument','observation',r->'observation','forced',r->'forced')
    || CASE WHEN b->>'contractVersion'='payroll-novelty-batch.v2' THEN jsonb_build_object('contractId',r->'employmentContractId','identityToken',r#>'{subject,identityToken}') ELSE '{}'::jsonb END AS payload,
    CASE WHEN b->>'contractVersion'='payroll-novelty-batch.v2' THEN r->>'employmentContractId' ELSE r->>'legajo' END ||chr(31)||(r->>'conceptSourceId')||chr(31)||coalesce(r->>'costCenterSourceId','')||chr(31)||coalesce(r->>'adjustmentMonth','')||chr(31)||coalesce(r->>'movementType','') AS business_key
   FROM jsonb_array_elements(b->'rows') r
  ) f
 ))::text,'UTF8')),'hex')
$$;

CREATE FUNCTION public.payroll_monthly_correction_snapshot_v1(ctx jsonb,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item jsonb;b public.payroll_novelty_batch%ROWTYPE;rows_guard jsonb;identity_current boolean:=true;
BEGIN
 item:=public.payroll_monthly_annul_snapshot_v1(ctx,p_id);
 SELECT * INTO STRICT b FROM public.payroll_novelty_batch WHERE id=p_id AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
 IF b.contract_version='payroll-novelty-batch.v2' THEN identity_current:=public.payroll_novelty_native_current_v2(ctx,p_id,false);
 ELSE
  identity_current:=NOT EXISTS(SELECT 1 FROM public.payroll_novelty_row r WHERE r.batch_id=b.id AND r.tenant_id=b.tenant_id
   AND NOT EXISTS(SELECT 1 FROM public.employment_contract c JOIN public.source_import_batch s ON s.id=c.source_batch_id
    WHERE c.id=r.employment_contract_id AND c.source_system='GRH' AND c.status='active' AND c.legacy_legajo=r.legajo_snapshot
    AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND s.source_system='GRH' AND s.source_database=ctx->>'sourceDatabase' AND s.validation_state='published' AND s.legacy_import_run_id IS NOT NULL));
 END IF;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.row_ordinal) INTO rows_guard FROM public.payroll_novelty_row r WHERE r.batch_id=b.id AND r.tenant_id=b.tenant_id;
 item:=(item-'snapshotSha256')||jsonb_build_object('guardRows',rows_guard,'identityCurrent',identity_current);
 RETURN item||jsonb_build_object('snapshotSha256',encode(sha256(convert_to(item::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.payroll_monthly_correction_values_v1(ctx jsonb,item jsonb,p_patch jsonb,hold_lock boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b jsonb:=item->'batch';after_value jsonb;old_row jsonb;new_row jsonb;new_rows jsonb:='[]'::jsonb;warnings jsonb;input jsonb;seen text[]:=ARRAY[]::text[];business_key text;changed boolean:=false;period_value date;type_value text;fresh jsonb;stored_subject jsonb;warning_count integer:=0;
BEGIN
 IF NOT public.payroll_monthly_correction_patch_valid_v1(p_patch) OR item->>'identityCurrent'<>'true' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
 after_value:=b||(p_patch-ARRAY['conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced']);
 period_value:=(after_value->>'periodMonth')::date;type_value:=after_value->>'payrollType';
 IF b->>'contractVersion'='payroll-novelty-batch.v2' AND type_value<>'monthly' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_NATIVE_TYPE_UNSUPPORTED'; END IF;
 FOR old_row IN SELECT value FROM jsonb_array_elements(b->'rows') ORDER BY (value->>'rowOrdinal')::integer LOOP
  new_row:=old_row||(p_patch-ARRAY['periodMonth','payrollType']);
  IF p_patch ? 'quantityDecimal' AND new_row->'quantityDecimal'<>'null'::jsonb THEN new_row:=jsonb_set(new_row,'{quantityDecimal}',to_jsonb(trim_scale((new_row->>'quantityDecimal')::numeric)::text)); END IF;
  IF (new_row->>'adjustmentMonth')::date>period_value OR new_row->'quantityDecimal'='null'::jsonb AND new_row->'amountCents'='null'::jsonb
  OR new_row->>'forced'='true' AND (new_row->'amountCents'='null'::jsonb OR char_length(coalesce(new_row->>'observation',''))<10)
  THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
  business_key:=jsonb_build_array(new_row->'employmentContractId',new_row->'conceptSourceId',new_row->'costCenterSourceId',new_row->'adjustmentMonth',new_row->'movementType')::text;
  IF business_key=ANY(seen) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_DUPLICATE_DESTINATION'; END IF;seen:=array_append(seen,business_key);
  IF b->>'contractVersion'='payroll-novelty-batch.v2' THEN
   stored_subject:=old_row->'subject';fresh:=public.payroll_novelty_native_subject_v2(ctx,jsonb_build_object('contractId',new_row->'employmentContractId','identityToken',stored_subject->'identityToken','legajo',new_row->'legajo','adjustmentMonth',new_row->'adjustmentMonth'),period_value,hold_lock);
   IF fresh IS DISTINCT FROM stored_subject THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_IDENTITY_CHANGED'; END IF;
  ELSE
   IF hold_lock THEN PERFORM 1 FROM public.employment_contract WHERE id=(new_row->>'employmentContractId')::uuid FOR SHARE NOWAIT; END IF;
  END IF;
  -- These are the existing administrative checks, with no salary-rule inference.
  IF EXISTS(SELECT 1 FROM public.grh_effective_employment_movement_v1 m JOIN public.source_import_batch s ON s.id=m.source_batch_id
   WHERE m.employment_contract_id=(new_row->>'employmentContractId')::uuid AND m.source_system='GRH' AND s.source_system='GRH' AND s.source_database=ctx->>'sourceDatabase' AND s.validation_state='published'
   AND m.movement_period=period_value AND m.concept_source_id=new_row->>'conceptSourceId' AND coalesce(m.cost_center_source_id,'')=coalesce(new_row->>'costCenterSourceId','')
   AND (public.payroll_type_canonical_v1(m.source_system,m.payroll_type)=type_value OR public.payroll_type_canonical_v1(m.source_system,m.payroll_type) IS NULL))
  THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_EXISTING_MOVEMENT_CONFLICT'; END IF;
  warnings:='[]'::jsonb;
  IF NOT EXISTS(SELECT 1 FROM public.grh_effective_employment_movement_v1 m JOIN public.source_import_batch s ON s.id=m.source_batch_id
   WHERE m.employment_contract_id=(new_row->>'employmentContractId')::uuid AND m.source_system='GRH' AND s.source_system='GRH' AND s.source_database=ctx->>'sourceDatabase' AND s.validation_state='published' AND m.concept_source_id=new_row->>'conceptSourceId')
  THEN warnings:=warnings||jsonb_build_array(jsonb_build_object('code','concept_not_observed','severity','warning','blocking',false,'field','conceptSourceId','details',jsonb_build_object('basis','published_grh_observation'))); END IF;
  IF new_row->'costCenterSourceId'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.grh_effective_employment_movement_v1 m JOIN public.source_import_batch s ON s.id=m.source_batch_id
   WHERE m.employment_contract_id=(new_row->>'employmentContractId')::uuid AND m.source_system='GRH' AND s.source_system='GRH' AND s.source_database=ctx->>'sourceDatabase' AND s.validation_state='published' AND m.cost_center_source_id=new_row->>'costCenterSourceId')
  THEN warnings:=warnings||jsonb_build_array(jsonb_build_object('code','cost_center_not_observed','severity','warning','blocking',false,'field','costCenterSourceId','details',jsonb_build_object('basis','published_grh_observation'))); END IF;
  IF new_row->'movementType'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.grh_effective_employment_movement_v1 m JOIN public.source_import_batch s ON s.id=m.source_batch_id
   WHERE m.employment_contract_id=(new_row->>'employmentContractId')::uuid AND m.source_system='GRH' AND s.source_system='GRH' AND s.source_database=ctx->>'sourceDatabase' AND s.validation_state='published' AND lower(m.movement_type)=new_row->>'movementType')
  THEN warnings:=warnings||jsonb_build_array(jsonb_build_object('code','movement_type_not_observed','severity','warning','blocking',false,'field','movementType','details',jsonb_build_object('basis','published_grh_observation'))); END IF;
  changed:=changed OR (new_row-'issues') IS DISTINCT FROM (old_row-'issues');warning_count:=warning_count+jsonb_array_length(warnings);
  new_rows:=new_rows||jsonb_build_array(new_row||jsonb_build_object('issues',warnings));
 END LOOP;
 changed:=changed OR after_value->'periodMonth' IS DISTINCT FROM b->'periodMonth' OR after_value->'payrollType' IS DISTINCT FROM b->'payrollType';
 IF NOT changed THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_NO_CHANGE'; END IF;
 RETURN after_value||jsonb_build_object('rows',new_rows,'warningIssueCount',warning_count,'blockingIssueCount',0);
END $$;

CREATE FUNCTION public.payroll_monthly_correction_preview_v1(p_context jsonb,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;item jsonb;source_item jsonb;all_items jsonb:='[]'::jsonb;public_items jsonb;row_count_value integer:=0;preview_hash text;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.prepare');
 IF p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR NOT(p_body ?& ARRAY['command','proposalId','proposalSha256','previewSha256','items','patch','reason']) OR (p_body-ARRAY['command','proposalId','proposalSha256','previewSha256','items','patch','reason'])<>'{}'::jsonb
 OR jsonb_typeof(p_body->'command') IS DISTINCT FROM 'string' OR p_body->>'command'<>'preview' OR p_body->'proposalId'<>'null'::jsonb OR p_body->'proposalSha256'<>'null'::jsonb OR p_body->'previewSha256'<>'null'::jsonb
 OR jsonb_typeof(p_body->'items')<>'array' OR jsonb_array_length(p_body->'items') NOT BETWEEN 1 AND 100 OR NOT public.payroll_monthly_correction_patch_valid_v1(p_body->'patch')
 OR jsonb_typeof(p_body->'reason')<>'string' OR char_length(p_body->>'reason') NOT BETWEEN 10 AND 1000 OR p_body->>'reason'<>btrim(p_body->>'reason') OR p_body->>'reason' IS DISTINCT FROM normalize(p_body->>'reason',NFC) OR p_body->>'reason' ~ '[<>\x00-\x1f\x7f]'
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
 IF (SELECT count(DISTINCT value->>'batchId') FROM jsonb_array_elements(p_body->'items'))<>jsonb_array_length(p_body->'items') THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_body->'items') ORDER BY value->>'batchId' LOOP
  IF jsonb_typeof(item)<>'object' OR NOT(item ?& ARRAY['batchId','expectedVersion','snapshotSha256']) OR (item-ARRAY['batchId','expectedVersion','snapshotSha256'])<>'{}'::jsonb
  OR jsonb_typeof(item->'batchId')<>'string' OR item->>'batchId' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(item->'expectedVersion')<>'number' OR item->>'expectedVersion' !~ '^[1-9][0-9]{0,9}$'
  OR (item->>'expectedVersion')::bigint>=2147483647 OR jsonb_typeof(item->'snapshotSha256')<>'string' OR item->>'snapshotSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
  source_item:=public.payroll_monthly_correction_snapshot_v1(ctx,(item->>'batchId')::uuid);
  IF source_item->>'identityCurrent'<>'true' OR source_item->>'snapshotSha256' IS DISTINCT FROM item->>'snapshotSha256' OR source_item#>'{batch,version}' IS DISTINCT FROM item->'expectedVersion' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_VERSION_CONFLICT'; END IF;
  row_count_value:=row_count_value+(source_item#>>'{batch,rowCount}')::integer;IF row_count_value>5000 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_REVIEW_LIMIT'; END IF;
  source_item:=source_item||jsonb_build_object('after',public.payroll_monthly_correction_values_v1(ctx,source_item,p_body->'patch',false));
  all_items:=all_items||jsonb_build_array(source_item||jsonb_build_object('afterContentSha256',public.payroll_monthly_correction_content_v1(ctx,source_item->'after')));
 END LOOP;
 preview_hash:=encode(sha256(convert_to(jsonb_build_object('items',all_items,'patch',p_body->'patch','reason',p_body->'reason','scopeKey',public.payroll_monthly_annul_scope_v1(ctx))::text,'UTF8')),'hex');
 SELECT jsonb_agg(value-ARRAY['guardBatch','guardRows','afterContentSha256'] ORDER BY value#>>'{batch,id}') INTO public_items FROM jsonb_array_elements(all_items);
 RETURN jsonb_build_object('version','payroll-monthly-correction.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),'proposalId',NULL,'proposalSha256',NULL,'previewSha256',preview_hash,
 'status','preview','reason',p_body->'reason','patch',p_body->'patch','canPropose',true,'canReview',false,'items',public_items,'decision',NULL,'effects',public.payroll_monthly_annul_effects_v1());
END $$;

CREATE FUNCTION public.payroll_monthly_correction_detail_json_v1(ctx jsonb,p public.payroll_monthly_correction_proposal) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.payroll_monthly_correction_review%ROWTYPE;public_items jsonb;allowed boolean;
BEGIN
 IF p.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid OR p.certified_binding_id IS DISTINCT FROM (ctx->>'certifiedBindingId')::uuid THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.payroll_monthly_correction_review WHERE proposal_id=p.id;
 SELECT jsonb_agg(value-ARRAY['guardBatch','guardRows','afterContentSha256'] ORDER BY value#>>'{batch,id}') INTO public_items FROM jsonb_array_elements(p.items);
 allowed:=r.id IS NULL AND ctx->'capabilities' ? 'payroll.novelty.approve' AND ctx->>'actorPersonId' IS NOT NULL AND p.proposer_membership_id<>(ctx->>'membershipId')::uuid AND p.proposer_person_id<>(ctx->>'actorPersonId')::uuid
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.items) i WHERE i#>>'{guardBatch,prepared_by_membership_id}'=ctx->>'membershipId' OR i#>>'{guardBatch,prepared_by_person_id}'=ctx->>'actorPersonId');
 RETURN jsonb_build_object('version','payroll-monthly-correction.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),'proposalId',p.id,'proposalSha256',p.proposal_sha256,'previewSha256',p.preview_sha256,
  'status',CASE WHEN r.id IS NULL THEN 'pending' WHEN r.command='approve' THEN 'approved' ELSE 'rejected' END,'reason',p.reason,'patch',p.patch,'canPropose',false,'canReview',coalesce(allowed,false),'items',public_items,
  'decision',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('command',r.command,'reason',r.reason,'recordedAt',r.created_at) END,'effects',public.payroll_monthly_annul_effects_v1());
END $$;

CREATE FUNCTION public.payroll_monthly_correction_detail_v1(p_context jsonb,p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;p public.payroll_monthly_correction_proposal%ROWTYPE;item jsonb;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.nominal.read');
 IF p_kind='proposal' THEN
  SELECT * INTO p FROM public.payroll_monthly_correction_proposal WHERE id=p_id AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_NOT_FOUND'; END IF;RETURN public.payroll_monthly_correction_detail_json_v1(ctx,p);
 ELSIF p_kind<>'candidate' OR p_kind IS NULL THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
 item:=public.payroll_monthly_correction_snapshot_v1(ctx,p_id);
 RETURN jsonb_build_object('version','payroll-monthly-correction.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),'proposalId',NULL,'proposalSha256',NULL,'previewSha256',NULL,
  'status','candidate','reason',NULL,'patch',NULL,'canPropose',ctx->'capabilities' ? 'payroll.novelty.prepare' AND ctx->>'actorPersonId' IS NOT NULL AND item->>'identityCurrent'='true','canReview',false,
  'items',jsonb_build_array(item-ARRAY['guardBatch','guardRows']),'decision',NULL,'effects',public.payroll_monthly_annul_effects_v1());
END $$;

CREATE FUNCTION public.payroll_monthly_correction_bootstrap_v1(p_context jsonb,p_period date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;candidates jsonb;proposals jsonb;can_propose boolean;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.nominal.read');
 IF p_period IS NOT NULL AND (extract(day FROM p_period)<>1 OR p_period NOT BETWEEN DATE '2008-01-01' AND DATE '2099-12-01') THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
 can_propose:=ctx->'capabilities' ? 'payroll.novelty.prepare' AND ctx->>'actorPersonId' IS NOT NULL;
 IF (SELECT count(*) FROM public.payroll_novelty_batch WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND status='approved' AND (p_period IS NULL OR period_month=p_period))>1000
 OR (SELECT count(*) FROM public.payroll_monthly_correction_proposal WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND (p_period IS NULL OR p_period=ANY(period_months)))>1000 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_READ_LIMIT'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('batchId',id,'expectedVersion',version,'periodMonth',to_char(period_month,'YYYY-MM-DD'),'payrollType',payroll_type,'rowCount',row_count,'canPropose',can_propose) ORDER BY period_month DESC,id),'[]'::jsonb) INTO candidates
 FROM public.payroll_novelty_batch WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND status='approved' AND (p_period IS NULL OR period_month=p_period);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',CASE WHEN r.id IS NULL THEN 'pending' WHEN r.command='approve' THEN 'approved' ELSE 'rejected' END,'reason',p.reason,'createdAt',p.created_at,'batchCount',p.batch_count,'rowCount',p.row_count,
  'canReview',coalesce(r.id IS NULL AND ctx->'capabilities' ? 'payroll.novelty.approve' AND ctx->>'actorPersonId' IS NOT NULL AND p.proposer_membership_id<>(ctx->>'membershipId')::uuid AND p.proposer_person_id<>(ctx->>'actorPersonId')::uuid
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.items) i WHERE i#>>'{guardBatch,prepared_by_membership_id}'=ctx->>'membershipId' OR i#>>'{guardBatch,prepared_by_person_id}'=ctx->>'actorPersonId'),false)) ORDER BY p.created_at DESC,p.id),'[]'::jsonb) INTO proposals
 FROM public.payroll_monthly_correction_proposal p LEFT JOIN public.payroll_monthly_correction_review r ON r.proposal_id=p.id
 WHERE p.tenant_id=(ctx->>'tenantId')::uuid AND p.certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND (p_period IS NULL OR p_period=ANY(p.period_months));
 RETURN jsonb_build_object('version','payroll-monthly-correction.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),'permissions',jsonb_build_object('canPropose',can_propose,'canReview',ctx->'capabilities' ? 'payroll.novelty.approve' AND ctx->>'actorPersonId' IS NOT NULL),
  'candidates',candidates,'proposals',proposals,'complete',true,'effects',public.payroll_monthly_annul_effects_v1());
END $$;

CREATE FUNCTION public.payroll_monthly_correction_attempt_v1(p_context jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;a public.payroll_monthly_correction_attempt%ROWTYPE;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.nominal.read');
 SELECT * INTO a FROM public.payroll_monthly_correction_attempt WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND idempotency_key=p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_NOT_FOUND'; END IF;
 IF a.actor_context IS DISTINCT FROM ctx THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_IDEMPOTENCY_REUSE'; END IF;
 PERFORM public.payroll_monthly_annul_context_v1(p_context,CASE WHEN a.command='propose' THEN 'payroll.novelty.prepare' ELSE 'payroll.novelty.approve' END);
 RETURN a.receipt||jsonb_build_object('replayed',true);
END $$;

-- Authority comes exclusively from an immutable review inserted in this same
-- transaction. Neither a session setting nor a client-provided identifier grants it.
CREATE FUNCTION public.payroll_monthly_correction_authorized_item_v1(p_batch_id uuid,p_tenant_id uuid,p_expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result_value jsonb;
BEGIN
 SELECT jsonb_build_object('item',i.value,'review',to_jsonb(r)) INTO STRICT result_value
 FROM public.payroll_monthly_correction_review r JOIN public.payroll_monthly_correction_proposal p ON p.id=r.proposal_id
 CROSS JOIN LATERAL jsonb_array_elements(p.items) i
 WHERE r.tenant_id=p_tenant_id AND p.tenant_id=r.tenant_id AND p.certified_binding_id=r.certified_binding_id AND r.command='approve' AND r.transaction_id=pg_current_xact_id()
 AND i.value#>>'{batch,id}'=p_batch_id::text AND (i.value#>>'{batch,version}')::integer=p_expected_version
 AND r.reviewer_membership_id<>p.proposer_membership_id AND r.reviewer_person_id<>p.proposer_person_id
 AND i.value#>>'{guardBatch,prepared_by_membership_id}'<>r.reviewer_membership_id::text
 AND (i.value#>>'{guardBatch,prepared_by_person_id}' IS NULL OR i.value#>>'{guardBatch,prepared_by_person_id}'<>r.reviewer_person_id::text);
 RETURN result_value;
EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED';
END $$;

CREATE FUNCTION public.payroll_monthly_correction_batch_guard_v1(old_batch public.payroll_novelty_batch,new_batch public.payroll_novelty_batch) RETURNS public.payroll_novelty_batch
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE authority jsonb;item jsonb;r public.payroll_monthly_correction_review%ROWTYPE;
BEGIN
 authority:=public.payroll_monthly_correction_authorized_item_v1(old_batch.id,old_batch.tenant_id,old_batch.version);item:=authority->'item';r:=jsonb_populate_record(NULL::public.payroll_monthly_correction_review,authority->'review');
 IF to_jsonb(old_batch) IS DISTINCT FROM item->'guardBatch' OR old_batch.status<>'approved' OR old_batch.exportable IS DISTINCT FROM true
 OR new_batch.status<>'approved' OR new_batch.version<>old_batch.version+1 OR new_batch.reason_code<>'corrected_after_review' OR new_batch.reason_reference IS DISTINCT FROM ('ref:'||r.id::text)
 OR new_batch.period_month IS DISTINCT FROM (item#>>'{after,periodMonth}')::date OR new_batch.payroll_type IS DISTINCT FROM item#>>'{after,payrollType}'
 OR btrim(new_batch.content_sha256) IS DISTINCT FROM item->>'afterContentSha256' OR new_batch.approved_by_membership_id IS DISTINCT FROM r.reviewer_membership_id OR new_batch.approved_by_person_id IS DISTINCT FROM r.reviewer_person_id
 OR new_batch.exportable IS DISTINCT FROM true OR new_batch.grh_mutation IS DISTINCT FROM false OR new_batch.payroll_calculated IS DISTINCT FROM false OR new_batch.payroll_posted IS DISTINCT FROM false
 OR (to_jsonb(new_batch)-ARRAY['period_month','payroll_type','content_sha256','version','reason_code','reason_reference','approved_by_membership_id','approved_by_person_id','updated_at','decided_at']) IS DISTINCT FROM (to_jsonb(old_batch)-ARRAY['period_month','payroll_type','content_sha256','version','reason_code','reason_reference','approved_by_membership_id','approved_by_person_id','updated_at','decided_at'])
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED'; END IF;
 IF (SELECT count(*) FROM public.payroll_novelty_row WHERE batch_id=old_batch.id AND tenant_id=old_batch.tenant_id)<>old_batch.row_count THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_CONTRACT_DRIFT'; END IF;
 new_batch.updated_at:=r.created_at;new_batch.decided_at:=r.created_at;RETURN new_batch;
END $$;

CREATE FUNCTION public.payroll_monthly_correction_row_guard_v1(old_row public.payroll_novelty_row,new_row public.payroll_novelty_row) RETURNS public.payroll_novelty_row
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.payroll_novelty_batch%ROWTYPE;authority jsonb;item jsonb;before_guard jsonb;after_row jsonb;
BEGIN
 SELECT * INTO STRICT b FROM public.payroll_novelty_batch WHERE id=old_row.batch_id AND tenant_id=old_row.tenant_id;
 authority:=public.payroll_monthly_correction_authorized_item_v1(b.id,b.tenant_id,b.version);item:=authority->'item';
 SELECT value INTO STRICT before_guard FROM jsonb_array_elements(item->'guardRows') WHERE value->>'id'=old_row.id::text;
 SELECT value INTO STRICT after_row FROM jsonb_array_elements(item#>'{after,rows}') WHERE (value->>'rowOrdinal')::integer=old_row.row_ordinal;
 IF b.status<>'approved' OR to_jsonb(old_row) IS DISTINCT FROM before_guard
 OR (to_jsonb(new_row)-ARRAY['concept_source_id','cost_center_source_id','adjustment_month','quantity','amount_cents','movement_type','legal_instrument','observation','forced']) IS DISTINCT FROM (to_jsonb(old_row)-ARRAY['concept_source_id','cost_center_source_id','adjustment_month','quantity','amount_cents','movement_type','legal_instrument','observation','forced'])
 OR new_row.concept_source_id IS DISTINCT FROM after_row->>'conceptSourceId' OR new_row.cost_center_source_id IS DISTINCT FROM after_row->>'costCenterSourceId'
 OR new_row.adjustment_month IS DISTINCT FROM (after_row->>'adjustmentMonth')::date OR new_row.quantity IS DISTINCT FROM (after_row->>'quantityDecimal')::numeric
 OR new_row.amount_cents IS DISTINCT FROM (after_row->>'amountCents')::bigint OR new_row.movement_type IS DISTINCT FROM after_row->>'movementType'
 OR new_row.legal_instrument IS DISTINCT FROM after_row->>'legalInstrument' OR new_row.observation IS DISTINCT FROM after_row->>'observation' OR new_row.forced IS DISTINCT FROM (after_row->>'forced')::boolean
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED'; END IF;
 RETURN new_row;
END $$;

ALTER TABLE public.payroll_novelty_issue ADD COLUMN correction_review_id uuid REFERENCES public.payroll_monthly_correction_review(id);
ALTER TABLE public.payroll_novelty_issue ADD COLUMN correction_version integer;
ALTER TABLE public.payroll_novelty_issue ADD CONSTRAINT payroll_novelty_issue_correction_pair_ck CHECK((correction_review_id IS NULL AND correction_version IS NULL) OR (correction_review_id IS NOT NULL AND correction_version IS NOT NULL AND correction_version>1));

CREATE FUNCTION public.payroll_monthly_correction_issue_guard_v1(new_issue public.payroll_novelty_issue) RETURNS public.payroll_novelty_issue
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.payroll_novelty_batch%ROWTYPE;authority jsonb;row_value jsonb;issue_value jsonb;
BEGIN
 SELECT * INTO STRICT b FROM public.payroll_novelty_batch WHERE id=new_issue.batch_id AND tenant_id=new_issue.tenant_id;
 authority:=public.payroll_monthly_correction_authorized_item_v1(b.id,b.tenant_id,b.version);
 IF b.status<>'approved' OR new_issue.correction_review_id::text IS DISTINCT FROM authority#>>'{review,id}' OR new_issue.correction_version IS DISTINCT FROM (b.version+1)
 OR NOT EXISTS(SELECT 1 FROM public.payroll_novelty_row WHERE id=new_issue.row_id AND batch_id=b.id AND tenant_id=b.tenant_id AND row_ordinal=new_issue.row_ordinal)
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED'; END IF;
 SELECT value INTO STRICT row_value FROM jsonb_array_elements(authority#>'{item,after,rows}') WHERE (value->>'rowOrdinal')::integer=new_issue.row_ordinal;
 issue_value:=jsonb_build_object('code',new_issue.issue_code,'severity',new_issue.severity,'blocking',new_issue.is_blocking,'field',new_issue.field_name,'details',new_issue.details);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(row_value->'issues') WHERE value=issue_value) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED'; END IF;
 new_issue.created_at:=(authority#>>'{review,created_at}')::timestamptz;RETURN new_issue;
END $$;

CREATE FUNCTION public.payroll_monthly_correction_issue_version_v1(p_batch_id uuid,p_tenant_id uuid,p_version integer) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(max((i.value#>>'{batch,version}')::integer+1),1) FROM public.payroll_monthly_correction_proposal p JOIN public.payroll_monthly_correction_review r ON r.proposal_id=p.id
 CROSS JOIN LATERAL jsonb_array_elements(p.items) i WHERE p.tenant_id=p_tenant_id AND r.command='approve' AND i.value#>>'{batch,id}'=p_batch_id::text AND (i.value#>>'{batch,version}')::integer+1<=p_version
$$;

CREATE FUNCTION public.payroll_monthly_correction_event_values_v1(snapshot jsonb,p_batch_id uuid,p_tenant_id uuid,p_version integer,p_nominal boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE data_value jsonb;
BEGIN
 SELECT i.value->'after' INTO data_value FROM public.payroll_monthly_correction_proposal p JOIN public.payroll_monthly_correction_review r ON r.proposal_id=p.id CROSS JOIN LATERAL jsonb_array_elements(p.items) i
 WHERE p.tenant_id=p_tenant_id AND r.command='approve' AND i.value#>>'{batch,id}'=p_batch_id::text AND (i.value#>>'{batch,version}')::integer+1<=p_version ORDER BY (i.value#>>'{batch,version}')::integer DESC LIMIT 1;
 IF data_value IS NULL THEN
  SELECT i.value->'batch' INTO data_value FROM public.payroll_monthly_correction_proposal p JOIN public.payroll_monthly_correction_review r ON r.proposal_id=p.id CROSS JOIN LATERAL jsonb_array_elements(p.items) i
  WHERE p.tenant_id=p_tenant_id AND r.command='approve' AND i.value#>>'{batch,id}'=p_batch_id::text ORDER BY (i.value#>>'{batch,version}')::integer LIMIT 1;
 END IF;
 IF data_value IS NULL THEN RETURN snapshot; END IF;
 RETURN snapshot||jsonb_build_object('periodMonth',data_value->'periodMonth','payrollType',data_value->'payrollType','blockingIssueCount',data_value->'blockingIssueCount','warningIssueCount',data_value->'warningIssueCount','rows',CASE WHEN p_nominal THEN data_value->'rows' ELSE '[]'::jsonb END);
END $$;

CREATE FUNCTION public.payroll_monthly_correction_event_authority_v1(e public.payroll_novelty_event) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.payroll_monthly_correction_review%ROWTYPE;authority jsonb;h text;expected_key uuid;
BEGIN
 authority:=public.payroll_monthly_correction_authorized_item_v1(e.batch_id,e.tenant_id,e.expected_version);r:=jsonb_populate_record(NULL::public.payroll_monthly_correction_review,authority->'review');
 h:=encode(sha256(convert_to(r.id::text||':'||e.batch_id::text,'UTF8')),'hex');expected_key:=(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid;
 IF e.reason_reference IS DISTINCT FROM ('ref:'||r.id::text) OR e.authority_capability_key IS DISTINCT FROM 'payroll.novelty.approve' OR e.certified_binding_id IS DISTINCT FROM r.certified_binding_id OR e.actor_membership_id IS DISTINCT FROM r.reviewer_membership_id OR e.actor_person_id IS DISTINCT FROM r.reviewer_person_id
 OR e.actor_session_id IS DISTINCT FROM r.actor_session_id OR e.actor_role_key IS DISTINCT FROM r.actor_context->>'roleKey' OR e.actor_session_version IS DISTINCT FROM (r.actor_context->>'actorSessionVersion')::integer
 OR btrim(e.release_sha) IS DISTINCT FROM r.actor_context->>'releaseSha' OR btrim(e.command_hash) IS DISTINCT FROM r.request_sha256
 OR e.from_status IS DISTINCT FROM 'approved' OR e.to_status IS DISTINCT FROM 'approved' OR e.resulting_version<>e.expected_version+1 OR e.reason_code<>'corrected_after_review' OR e.exportable IS DISTINCT FROM true
 OR e.idempotency_key IS DISTINCT FROM expected_key OR e.grh_mutation IS DISTINCT FROM false OR e.payroll_calculated IS DISTINCT FROM false OR e.payroll_posted IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED'; END IF;
END $$;

-- Only an existing prepare receipt uses this original source. No new writer,
-- identity resolver or replay authority is added; every old check still runs.
CREATE FUNCTION public.payroll_monthly_correction_prepare_history_v1(p_batch_id uuid,p_tenant_id uuid,p_binding_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE original_item jsonb;original_rows jsonb;
BEGIN
 SELECT i.value INTO original_item FROM public.payroll_monthly_correction_proposal p JOIN public.payroll_monthly_correction_review r ON r.proposal_id=p.id CROSS JOIN LATERAL jsonb_array_elements(p.items) i
 WHERE p.tenant_id=p_tenant_id AND p.certified_binding_id=p_binding_id AND r.command='approve' AND i.value#>>'{batch,id}'=p_batch_id::text ORDER BY (i.value#>>'{batch,version}')::integer LIMIT 1;
 IF original_item IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_agg(jsonb_build_object('rowOrdinal',(v->>'row_ordinal')::integer,'legajo',v->'legajo_snapshot','conceptSourceId',v->'concept_source_id','costCenterSourceId',v->'cost_center_source_id','adjustmentMonth',v->'adjustment_month',
  'quantityDecimal',CASE WHEN v->'quantity'='null'::jsonb THEN 'null'::jsonb ELSE to_jsonb(trim_scale((v->>'quantity')::numeric)::text) END,'amountCents',CASE WHEN v->'amount_cents'='null'::jsonb THEN 'null'::jsonb ELSE to_jsonb(v->>'amount_cents') END,
  'movementType',v->'movement_type','legalInstrument',v->'legal_instrument','observation',v->'observation','forced',v->'forced')
  ||CASE WHEN original_item#>>'{batch,contractVersion}'='payroll-novelty-batch.v2' THEN jsonb_build_object('contractId',v->'employment_contract_id','identityToken',v#>'{subject_snapshot,identityToken}') ELSE '{}'::jsonb END ORDER BY (v->>'row_ordinal')::integer)
 INTO original_rows FROM jsonb_array_elements(original_item->'guardRows') v;
 RETURN jsonb_build_object('batch',original_item->'guardBatch','rows',original_rows);
END $$;

CREATE FUNCTION public.payroll_monthly_correction_command_v1(p_context jsonb,p_body jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;cmd text;request_hash text;a public.payroll_monthly_correction_attempt%ROWTYPE;p public.payroll_monthly_correction_proposal%ROWTYPE;r public.payroll_monthly_correction_review%ROWTYPE;
 preview_value jsonb;source_item jsonb;public_item jsonb;all_items jsonb:='[]'::jsonb;item jsonb;new_row jsonb;issue_value jsonb;batch_uuid uuid;row_id_value public.payroll_novelty_row.id%TYPE;event_id uuid:=gen_random_uuid();receipt jsonb;result_status text;h text;event_key uuid;row_count_value integer:=0;
BEGIN
 IF p_key IS NULL OR p_key::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR NOT(p_body ?& ARRAY['command','proposalId','proposalSha256','previewSha256','items','patch','reason']) OR (p_body-ARRAY['command','proposalId','proposalSha256','previewSha256','items','patch','reason'])<>'{}'::jsonb
 OR jsonb_typeof(p_body->'command') IS DISTINCT FROM 'string' OR p_body->>'command' NOT IN('propose','approve','reject') OR jsonb_typeof(p_body->'reason')<>'string' OR char_length(p_body->>'reason') NOT BETWEEN 10 AND 1000 OR p_body->>'reason'<>btrim(p_body->>'reason') OR p_body->>'reason' IS DISTINCT FROM normalize(p_body->>'reason',NFC) OR p_body->>'reason' ~ '[<>\x00-\x1f\x7f]'
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
 cmd:=p_body->>'command';ctx:=public.payroll_monthly_annul_context_v1(p_context,CASE WHEN cmd='propose' THEN 'payroll.novelty.prepare' ELSE 'payroll.novelty.approve' END);
 PERFORM pg_advisory_xact_lock(hashtextextended('monthly-annul:'||(ctx->>'tenantId')||':'||(ctx->>'certifiedBindingId'),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('monthly-correction:'||(ctx->>'tenantId')||':'||(ctx->>'certifiedBindingId'),0));
 SELECT * INTO a FROM public.payroll_monthly_correction_attempt WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND idempotency_key=p_key;
 IF FOUND THEN IF a.actor_context IS DISTINCT FROM ctx OR a.request_body IS DISTINCT FROM p_body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_IDEMPOTENCY_REUSE'; END IF;RETURN a.receipt||jsonb_build_object('replayed',true); END IF;
 request_hash:=encode(sha256(convert_to(p_body::text,'UTF8')),'hex');
 IF cmd='propose' THEN
  IF jsonb_typeof(p_body->'items')<>'array' OR jsonb_array_length(p_body->'items') NOT BETWEEN 1 AND 100 OR p_body->'proposalId'<>'null'::jsonb OR p_body->'proposalSha256'<>'null'::jsonb OR jsonb_typeof(p_body->'previewSha256')<>'string' OR p_body->>'previewSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
  -- Lock every existing batch before taking the verified all-or-nothing preview.
  FOR item IN SELECT value FROM jsonb_array_elements(p_body->'items') ORDER BY value->>'batchId' LOOP
   IF item->>'batchId' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
   PERFORM 1 FROM public.payroll_novelty_batch WHERE id=(item->>'batchId')::uuid AND tenant_id=(ctx->>'tenantId')::uuid FOR UPDATE NOWAIT;
  END LOOP;
  preview_value:=public.payroll_monthly_correction_preview_v1(p_context,p_body||jsonb_build_object('command','preview','previewSha256',NULL));
  IF preview_value->>'previewSha256' IS DISTINCT FROM p_body->>'previewSha256' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_PREVIEW_CHANGED'; END IF;
  FOR public_item IN SELECT value FROM jsonb_array_elements(preview_value->'items') ORDER BY value#>>'{batch,id}' LOOP
   batch_uuid:=(public_item#>>'{batch,id}')::uuid;source_item:=public.payroll_monthly_correction_snapshot_v1(ctx,batch_uuid);
   IF source_item->>'snapshotSha256' IS DISTINCT FROM public_item->>'snapshotSha256' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_VERSION_CONFLICT'; END IF;
   IF EXISTS(SELECT 1 FROM public.payroll_monthly_correction_proposal other_p CROSS JOIN LATERAL jsonb_array_elements(other_p.items) other_i WHERE other_p.tenant_id=(ctx->>'tenantId')::uuid AND other_p.certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND other_i.value#>>'{batch,id}'=batch_uuid::text AND NOT EXISTS(SELECT 1 FROM public.payroll_monthly_correction_review WHERE proposal_id=other_p.id)) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_PENDING_EXISTS'; END IF;
   item:=source_item||jsonb_build_object('after',public.payroll_monthly_correction_values_v1(ctx,source_item,p_body->'patch',true));
   IF item->'after' IS DISTINCT FROM public_item->'after' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_PREVIEW_CHANGED'; END IF;
   all_items:=all_items||jsonb_build_array(item||jsonb_build_object('afterContentSha256',public.payroll_monthly_correction_content_v1(ctx,item->'after')));row_count_value:=row_count_value+(item#>>'{batch,rowCount}')::integer;
  END LOOP;
  IF row_count_value>5000 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_REVIEW_LIMIT'; END IF;
  IF pg_database_size(current_database())+2097152+pg_column_size(all_items)>520093696 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_CAPACITY_LIMIT'; END IF;
  INSERT INTO public.payroll_monthly_correction_proposal(id,tenant_id,certified_binding_id,proposer_membership_id,proposer_person_id,actor_session_id,actor_context,reason,patch,items,preview_sha256,proposal_sha256,row_count,batch_count,period_months)
  VALUES(event_id,(ctx->>'tenantId')::uuid,(ctx->>'certifiedBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,(ctx->>'actorSessionId')::uuid,ctx,p_body->>'reason',p_body->'patch',all_items,p_body->>'previewSha256',
   encode(sha256(convert_to(jsonb_build_object('items',all_items,'patch',p_body->'patch','reason',p_body->'reason','actorContext',ctx,'previewSha256',p_body->'previewSha256')::text,'UTF8')),'hex'),row_count_value,jsonb_array_length(all_items),
   ARRAY(SELECT DISTINCT period FROM (SELECT (i#>>'{batch,periodMonth}')::date AS period FROM jsonb_array_elements(all_items) i UNION ALL SELECT (i#>>'{after,periodMonth}')::date FROM jsonb_array_elements(all_items) i) periods ORDER BY period)) RETURNING * INTO p;
  result_status:='pending';
 ELSE
  IF p_body->'items'<>'null'::jsonb OR p_body->'patch'<>'null'::jsonb OR p_body->'previewSha256'<>'null'::jsonb OR jsonb_typeof(p_body->'proposalId')<>'string' OR p_body->>'proposalId' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(p_body->'proposalSha256')<>'string' OR p_body->>'proposalSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD'; END IF;
  SELECT * INTO p FROM public.payroll_monthly_correction_proposal WHERE id=(p_body->>'proposalId')::uuid AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_NOT_FOUND'; END IF;
  IF p.proposal_sha256<>p_body->>'proposalSha256' OR EXISTS(SELECT 1 FROM public.payroll_monthly_correction_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_VERSION_CONFLICT'; END IF;
  IF public.payroll_monthly_correction_detail_json_v1(ctx,p)->>'canReview'<>'true' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_MAKER_CHECKER_REQUIRED'; END IF;
  IF cmd='approve' THEN
   FOR item IN SELECT value FROM jsonb_array_elements(p.items) ORDER BY value#>>'{batch,id}' LOOP
    batch_uuid:=(item#>>'{batch,id}')::uuid;PERFORM 1 FROM public.payroll_novelty_batch WHERE id=batch_uuid AND tenant_id=p.tenant_id FOR UPDATE NOWAIT;
    source_item:=public.payroll_monthly_correction_snapshot_v1(ctx,batch_uuid);
    IF source_item IS DISTINCT FROM (item-ARRAY['after','afterContentSha256']) OR public.payroll_monthly_correction_values_v1(ctx,source_item,p.patch,true) IS DISTINCT FROM item->'after' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_VERSION_CONFLICT'; END IF;
   END LOOP;
   IF (SELECT count(DISTINCT value->>'afterContentSha256') FROM jsonb_array_elements(p.items))<>p.batch_count
   OR EXISTS(SELECT 1 FROM public.payroll_novelty_batch b CROSS JOIN LATERAL jsonb_array_elements(p.items) i WHERE b.tenant_id=p.tenant_id AND b.certified_binding_id=p.certified_binding_id AND b.status IN('draft','submitted','approved') AND btrim(b.content_sha256)=i.value->>'afterContentSha256' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.items) own_i WHERE own_i.value#>>'{batch,id}'=b.id::text)) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_DUPLICATE_DESTINATION'; END IF;
  END IF;
  IF pg_database_size(current_database())+2097152+pg_column_size(p.items)>520093696 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_CAPACITY_LIMIT'; END IF;
  INSERT INTO public.payroll_monthly_correction_review(id,proposal_id,tenant_id,certified_binding_id,reviewer_membership_id,reviewer_person_id,actor_session_id,actor_context,command,reason,request_sha256)
  VALUES(event_id,p.id,p.tenant_id,p.certified_binding_id,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,(ctx->>'actorSessionId')::uuid,ctx,cmd,p_body->>'reason',request_hash) RETURNING * INTO r;
  IF cmd='approve' THEN
   FOR item IN SELECT value FROM jsonb_array_elements(p.items) ORDER BY value#>>'{batch,id}' LOOP
    batch_uuid:=(item#>>'{batch,id}')::uuid;
    FOR new_row IN SELECT value FROM jsonb_array_elements(item#>'{after,rows}') ORDER BY (value->>'rowOrdinal')::integer LOOP
     UPDATE public.payroll_novelty_row SET concept_source_id=new_row->>'conceptSourceId',cost_center_source_id=new_row->>'costCenterSourceId',adjustment_month=(new_row->>'adjustmentMonth')::date,
      quantity=(new_row->>'quantityDecimal')::numeric,amount_cents=(new_row->>'amountCents')::bigint,movement_type=new_row->>'movementType',legal_instrument=new_row->>'legalInstrument',observation=new_row->>'observation',forced=(new_row->>'forced')::boolean
     WHERE batch_id=batch_uuid AND tenant_id=p.tenant_id AND row_ordinal=(new_row->>'rowOrdinal')::integer RETURNING id INTO STRICT row_id_value;
     FOR issue_value IN SELECT value FROM jsonb_array_elements(new_row->'issues') LOOP
      INSERT INTO public.payroll_novelty_issue(tenant_id,batch_id,row_id,row_ordinal,issue_code,severity,is_blocking,field_name,details,correction_review_id,correction_version)
      VALUES(p.tenant_id,batch_uuid,row_id_value,(new_row->>'rowOrdinal')::integer,issue_value->>'code',issue_value->>'severity',(issue_value->>'blocking')::boolean,issue_value->>'field',issue_value->'details',r.id,(item#>>'{batch,version}')::integer+1);
     END LOOP;
    END LOOP;
    UPDATE public.payroll_novelty_batch SET period_month=(item#>>'{after,periodMonth}')::date,payroll_type=item#>>'{after,payrollType}',content_sha256=item->>'afterContentSha256',version=version+1,reason_code='corrected_after_review',reason_reference='ref:'||r.id::text,approved_by_membership_id=r.reviewer_membership_id,approved_by_person_id=r.reviewer_person_id
    WHERE id=batch_uuid AND tenant_id=p.tenant_id;
    h:=encode(sha256(convert_to(r.id::text||':'||batch_uuid::text,'UTF8')),'hex');event_key:=(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid;
    INSERT INTO public.payroll_novelty_event(tenant_id,batch_id,certified_binding_id,actor_membership_id,actor_person_id,actor_role_key,authority_capability_key,actor_session_id,actor_session_version,release_sha,command,from_status,to_status,expected_version,resulting_version,reason_code,reason_reference,idempotency_key,command_hash,event_sha256,exportable,grh_mutation,payroll_calculated,payroll_posted)
    VALUES(p.tenant_id,batch_uuid,p.certified_binding_id,r.reviewer_membership_id,r.reviewer_person_id,ctx->>'roleKey','payroll.novelty.approve',r.actor_session_id,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha','correct','approved','approved',(item#>>'{batch,version}')::integer,(item#>>'{batch,version}')::integer+1,'corrected_after_review','ref:'||r.id::text,event_key,request_hash,repeat('0',64),true,false,false,false);
   END LOOP;
  END IF;
  result_status:=CASE WHEN cmd='approve' THEN 'approved' ELSE 'rejected' END;
 END IF;
 IF public.payroll_monthly_annul_context_v1(p_context,CASE WHEN cmd='propose' THEN 'payroll.novelty.prepare' ELSE 'payroll.novelty.approve' END) IS DISTINCT FROM ctx THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_SESSION_INVALID'; END IF;
 receipt:=jsonb_build_object('version','payroll-monthly-correction.v1','eventId',event_id,'proposalId',p.id,'key',p_key,'bodySha256',request_hash,'body',p_body,'replayed',false,'status',result_status,'recordedAt',now(),'effects',public.payroll_monthly_annul_effects_v1());
 INSERT INTO public.payroll_monthly_correction_attempt(id,tenant_id,certified_binding_id,actor_membership_id,actor_session_id,actor_context,idempotency_key,command,request_body,receipt)
 VALUES(event_id,p.tenant_id,p.certified_binding_id,(ctx->>'membershipId')::uuid,(ctx->>'actorSessionId')::uuid,ctx,p_key,cmd,p_body,receipt);RETURN receipt;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_SESSION_BUSY';
END $$;

-- Modify only the nine exact prerequisite bodies. Keep their OIDs, owner,
-- ACL, settings and triggers; every old insert/transition branch remains.
DO $guards$ DECLARE signature text;definition text;body text;changed text;BEGIN
 signature:='public.payroll_novelty_batch_guard_v1()';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'BEGIN\n  IF TG_OP',E'BEGIN\n  IF TG_OP = ''UPDATE'' AND OLD.status = ''approved'' AND NEW.status = ''approved'' AND NEW.reason_code = ''corrected_after_review'' THEN\n    RETURN public.payroll_monthly_correction_batch_guard_v1(OLD,NEW);\n  END IF;\n  IF TG_OP');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_row_guard_v1()';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'BEGIN\n  IF TG_OP',E'BEGIN\n  IF TG_OP = ''UPDATE'' THEN\n    RETURN public.payroll_monthly_correction_row_guard_v1(OLD,NEW);\n  END IF;\n  IF TG_OP');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_issue_guard_v1()';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'BEGIN\n  IF TG_OP',E'BEGIN\n  IF TG_OP = ''INSERT'' AND NEW.correction_review_id IS NOT NULL THEN\n    RETURN public.payroll_monthly_correction_issue_guard_v1(NEW);\n  END IF;\n  IF TG_OP');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_event_guard_v1()';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'BEGIN\n  IF NEW.command',E'BEGIN\n  IF NEW.command = ''correct'' THEN\n    PERFORM public.payroll_monthly_correction_event_authority_v1(NEW);\n  END IF;\n  IF NEW.command');
 changed:=replace(changed,E'    OR (NEW.command = ''annul''',E'    OR (NEW.command = ''correct'' AND NEW.from_status = ''approved''\n      AND NEW.to_status = ''approved'')\n    OR (NEW.command = ''annul''');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_snapshot_v1(uuid,uuid,boolean)';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,'AND issue.is_blocking IS TRUE','AND issue.is_blocking IS TRUE AND COALESCE(issue.correction_version,1)=public.payroll_monthly_correction_issue_version_v1(batch.id,batch.tenant_id,batch.version)');
 changed:=replace(changed,'AND issue.is_blocking IS FALSE','AND issue.is_blocking IS FALSE AND COALESCE(issue.correction_version,1)=public.payroll_monthly_correction_issue_version_v1(batch.id,batch.tenant_id,batch.version)');
 changed:=replace(changed,'AND issue.row_id = row_value.id','AND issue.row_id = row_value.id AND COALESCE(issue.correction_version,1)=public.payroll_monthly_correction_issue_version_v1(batch.id,batch.tenant_id,batch.version)');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_event_snapshot_v1(bigint,uuid,boolean)';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'  SELECT public.payroll_novelty_snapshot_v1(\n    event.batch_id, event.tenant_id, p_include_nominal\n  )',E'  SELECT public.payroll_monthly_correction_event_values_v1(public.payroll_novelty_snapshot_v1(\n    event.batch_id, event.tenant_id, p_include_nominal\n  ),event.batch_id,event.tenant_id,event.resulting_version,p_include_nominal)');
 changed:=replace(changed,'updatedAt'', event.occurred_at','updatedAt'', event.occurred_at, ''submittedAt'', (SELECT min(s.occurred_at) FROM public.payroll_novelty_event s WHERE s.batch_id=event.batch_id AND s.tenant_id=event.tenant_id AND s.command=''submit'' AND s.resulting_version<=event.resulting_version), ''decidedAt'', (SELECT max(d.occurred_at) FROM public.payroll_novelty_event d WHERE d.batch_id=event.batch_id AND d.tenant_id=event.tenant_id AND d.command IN(''approve'',''reject'',''cancel'',''annul'',''correct'') AND d.resulting_version<=event.resulting_version)');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_event_snapshot_v2(bigint,uuid,boolean)';SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,'''decidedAt'',(SELECT min(occurred_at)','''decidedAt'',(SELECT max(occurred_at)');
 changed:=replace(changed,'command IN (''approve'',''reject'',''cancel'')','command IN (''approve'',''reject'',''cancel'',''annul'',''correct'')');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 FOREACH signature IN ARRAY ARRAY['public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)','public.payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text)'] LOOP
  SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
  changed:=replace(body,E'    IF existing_event.command <> ''prepare''',E'    DECLARE original_source jsonb; BEGIN\n      original_source:=public.payroll_monthly_correction_prepare_history_v1(existing_batch.id,existing_batch.tenant_id,existing_batch.certified_binding_id);\n      IF original_source IS NOT NULL THEN\n        existing_batch:=jsonb_populate_record(NULL::public.payroll_novelty_batch,original_source->''batch'');\n        stored_rows:=original_source->''rows'';\n      END IF;\n    END;\n    IF existing_event.command <> ''prepare''');
  IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_CORRECTION_GUARD_BUILD_DRIFT';END IF;EXECUTE replace(definition,body,changed);
 END LOOP;
END $guards$;

ALTER TABLE public.payroll_novelty_batch DROP CONSTRAINT payroll_novelty_batch_reason_ck;
ALTER TABLE public.payroll_novelty_batch ADD CONSTRAINT payroll_novelty_batch_reason_ck CHECK(reason_code IN('draft_prepared','ready_for_review','validated_for_export','invalid_rows','unsupported_concept','duplicate_or_conflict','cancelled_by_preparer','annulled_after_review','corrected_after_review'));
ALTER TABLE public.payroll_novelty_event DROP CONSTRAINT payroll_novelty_event_command_ck;
ALTER TABLE public.payroll_novelty_event ADD CONSTRAINT payroll_novelty_event_command_ck CHECK(command IN('prepare','submit','approve','reject','cancel','annul','correct'));
ALTER TABLE public.payroll_novelty_event DROP CONSTRAINT payroll_novelty_event_decider_person_ck;
ALTER TABLE public.payroll_novelty_event ADD CONSTRAINT payroll_novelty_event_decider_person_ck CHECK(command NOT IN('approve','reject','annul','correct') OR actor_person_id IS NOT NULL);
ALTER TABLE public.payroll_novelty_event DROP CONSTRAINT payroll_novelty_event_authority_ck;
ALTER TABLE public.payroll_novelty_event ADD CONSTRAINT payroll_novelty_event_authority_ck CHECK((command IN('prepare','submit','cancel') AND authority_capability_key='payroll.novelty.prepare') OR(command IN('approve','reject','annul','correct') AND authority_capability_key='payroll.novelty.approve'));

DO $acl$ DECLARE signature text;name text;BEGIN
 FOR signature,name IN SELECT oid::regprocedure::text,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'payroll_monthly_correction_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',signature);
  IF name IN('payroll_monthly_correction_bootstrap_v1','payroll_monthly_correction_detail_v1','payroll_monthly_correction_preview_v1','payroll_monthly_correction_attempt_v1','payroll_monthly_correction_command_v1') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO municontrol_actions_runtime_app',signature); END IF;
 END LOOP;
END $acl$;
