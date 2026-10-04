-- Administrative monthly novelty annulments. No salary calculation or posting.
-- Execute only as the exact reviewed transaction, after synthetic PostgreSQL QA.
DO $preflight$ BEGIN
 IF to_regprocedure('public.payroll_novelty_augment_v2(jsonb,jsonb,boolean)') IS NULL
 OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.payroll_novelty_batch_guard_v1()'::regprocedure)
    IS DISTINCT FROM '62465ef6da1a2fc392854b9ca3c5ea7ba54ddea6869d667e5c6936e788dea044'
 OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.payroll_novelty_event_guard_v1()'::regprocedure)
    IS DISTINCT FROM 'bbbe85e85c58f017c6e55248a7b356bc1d2ff5fe85c9d8e946ba3b46308ed708'
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_PREREQUISITE_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'payroll_monthly_annul_%')
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'payroll_monthly_annul_%')
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_ALREADY_PRESENT'; END IF;
END $preflight$;

CREATE TABLE public.payroll_monthly_annul_proposal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, certified_binding_id uuid NOT NULL,
 proposer_membership_id uuid NOT NULL, proposer_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_context jsonb NOT NULL,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
 proposal_sha256 text NOT NULL CHECK(proposal_sha256 ~ '^[a-f0-9]{64}$'),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 5000), batch_count integer NOT NULL CHECK(batch_count BETWEEN 1 AND 100),
 period_months date[] NOT NULL CHECK(array_length(period_months,1) BETWEEN 1 AND 100 AND array_position(period_months,NULL) IS NULL),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(proposer_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.payroll_monthly_annul_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL UNIQUE REFERENCES public.payroll_monthly_annul_proposal(id),
 tenant_id uuid NOT NULL, certified_binding_id uuid NOT NULL, reviewer_membership_id uuid NOT NULL,
 reviewer_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_context jsonb NOT NULL, command text NOT NULL CHECK(command IN('approve','reject')),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000), request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(reviewer_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.payroll_monthly_annul_attempt (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, certified_binding_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_context jsonb NOT NULL,
 idempotency_key uuid NOT NULL CHECK(idempotency_key::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 command text NOT NULL CHECK(command IN('propose','approve','reject')), request_body jsonb NOT NULL,
 receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,certified_binding_id,actor_membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
ALTER TABLE public.payroll_monthly_annul_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_monthly_annul_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_monthly_annul_attempt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_monthly_annul_proposal,public.payroll_monthly_annul_review,public.payroll_monthly_annul_attempt FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER payroll_monthly_annul_proposal_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_monthly_annul_proposal
 FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();
CREATE TRIGGER payroll_monthly_annul_review_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_monthly_annul_review
 FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();
CREATE TRIGGER payroll_monthly_annul_attempt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_monthly_annul_attempt
 FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();

CREATE FUNCTION public.payroll_monthly_annul_context_v1(p_context jsonb,p_capability text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 IF p_capability NOT IN('payroll.novelty.nominal.read','payroll.novelty.prepare','payroll.novelty.approve') THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
 ctx:=public.payroll_novelty_assert_context_v1(p_context,p_capability);
 IF NOT (ctx->'capabilities' ?& ARRAY['payroll.novelty.read','payroll.novelty.nominal.read']) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_CAPABILITY_REQUIRED'; END IF;
 IF p_capability<>'payroll.novelty.nominal.read' AND ctx->>'actorPersonId' IS NULL THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_EMPLOYMENT_REQUIRED'; END IF;
 RETURN ctx;
END $$;
CREATE FUNCTION public.payroll_monthly_annul_scope_v1(ctx jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(sha256(convert_to(ctx::text,'UTF8')),'hex')
$$;
CREATE FUNCTION public.payroll_monthly_annul_effects_v1() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('grhMutation',false,'payrollCalculated',false,'payrollPosted',false)
$$;
CREATE FUNCTION public.payroll_monthly_annul_snapshot_v1(ctx jsonb,p_batch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.payroll_novelty_batch%ROWTYPE; s jsonb; value jsonb;
BEGIN
 SELECT * INTO b FROM public.payroll_novelty_batch WHERE id=p_batch_id AND tenant_id=(ctx->>'tenantId')::uuid
 AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_NOT_FOUND'; END IF;
 IF b.status<>'approved' OR b.exportable IS NOT TRUE OR b.version>=2147483647 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_VERSION_CONFLICT'; END IF;
 s:=public.payroll_novelty_augment_v2(ctx,public.payroll_novelty_snapshot_v1(b.id,b.tenant_id,true),false);
 IF jsonb_array_length(s->'rows')<>b.row_count OR b.row_count<1 OR b.grh_mutation OR b.payroll_calculated OR b.payroll_posted
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_CONTRACT_DRIFT'; END IF;
 value:=jsonb_build_object('batch',s,'guardBatch',to_jsonb(b));
 RETURN value||jsonb_build_object('snapshotSha256',encode(sha256(convert_to(value::text,'UTF8')),'hex'));
END $$;
CREATE FUNCTION public.payroll_monthly_annul_detail_json_v1(ctx jsonb,p public.payroll_monthly_annul_proposal) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.payroll_monthly_annul_review%ROWTYPE; public_items jsonb; allowed boolean;
BEGIN
 IF p.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid OR p.certified_binding_id IS DISTINCT FROM (ctx->>'certifiedBindingId')::uuid
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.payroll_monthly_annul_review WHERE proposal_id=p.id;
 SELECT jsonb_agg(value-'guardBatch' ORDER BY value#>>'{batch,id}') INTO public_items FROM jsonb_array_elements(p.items);
 allowed:=r.id IS NULL AND ctx->'capabilities' ? 'payroll.novelty.approve' AND ctx->>'actorPersonId' IS NOT NULL
 AND p.proposer_membership_id<>(ctx->>'membershipId')::uuid AND p.proposer_person_id<>(ctx->>'actorPersonId')::uuid;
 RETURN jsonb_build_object('version','payroll-monthly-annul.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),
 'proposalId',p.id,'proposalSha256',p.proposal_sha256,'status',CASE WHEN r.id IS NULL THEN 'pending' WHEN r.command='approve' THEN 'approved' ELSE 'rejected' END,
 'reason',p.reason,'canPropose',false,'canReview',COALESCE(allowed,false),'items',public_items,
 'decision',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('command',r.command,'reason',r.reason,'recordedAt',r.created_at) END,
 'effects',public.payroll_monthly_annul_effects_v1());
END $$;
CREATE FUNCTION public.payroll_monthly_annul_detail_v1(p_context jsonb,p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; p public.payroll_monthly_annul_proposal%ROWTYPE; item jsonb;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.nominal.read');
 IF p_kind='proposal' THEN
  SELECT * INTO p FROM public.payroll_monthly_annul_proposal WHERE id=p_id AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_NOT_FOUND'; END IF;
  RETURN public.payroll_monthly_annul_detail_json_v1(ctx,p);
 ELSIF p_kind='candidate' THEN
  item:=public.payroll_monthly_annul_snapshot_v1(ctx,p_id)-'guardBatch';
  RETURN jsonb_build_object('version','payroll-monthly-annul.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),
  'proposalId',NULL,'proposalSha256',NULL,'status','candidate','reason',NULL,'canPropose',ctx->'capabilities' ? 'payroll.novelty.prepare' AND ctx->>'actorPersonId' IS NOT NULL,
  'canReview',false,'items',jsonb_build_array(item),'decision',NULL,'effects',public.payroll_monthly_annul_effects_v1());
 END IF;
 RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD';
END $$;
CREATE FUNCTION public.payroll_monthly_annul_bootstrap_v1(p_context jsonb,p_period date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; candidates jsonb; proposals jsonb; can_propose boolean;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.nominal.read');
 IF p_period IS NOT NULL AND (p_period<>date_trunc('month',p_period)::date OR p_period<DATE '2008-01-01' OR p_period>=DATE '2100-01-01') THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
 can_propose:=ctx->'capabilities' ? 'payroll.novelty.prepare' AND ctx->>'actorPersonId' IS NOT NULL;
 IF (SELECT count(*) FROM public.payroll_novelty_batch WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
  AND status='approved' AND (p_period IS NULL OR period_month=p_period))>1000
 OR (SELECT count(*) FROM public.payroll_monthly_annul_proposal WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
  AND (p_period IS NULL OR p_period=ANY(period_months)))>1000
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_ROW_LIMIT'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('batchId',id,'expectedVersion',version,'periodMonth',to_char(period_month,'YYYY-MM-DD'),
  'payrollType',payroll_type,'rowCount',row_count,'canPropose',can_propose) ORDER BY period_month DESC,id),'[]'::jsonb) INTO candidates
 FROM public.payroll_novelty_batch WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
 AND status='approved' AND (p_period IS NULL OR period_month=p_period);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'status',CASE WHEN r.id IS NULL THEN 'pending' WHEN r.command='approve' THEN 'approved' ELSE 'rejected' END,'reason',p.reason,'createdAt',p.created_at,
 'batchCount',p.batch_count,'rowCount',p.row_count,'canReview',COALESCE(r.id IS NULL AND ctx->'capabilities' ? 'payroll.novelty.approve' AND ctx->>'actorPersonId' IS NOT NULL
 AND p.proposer_membership_id<>(ctx->>'membershipId')::uuid AND p.proposer_person_id<>(ctx->>'actorPersonId')::uuid,false)) ORDER BY p.created_at DESC,p.id),'[]'::jsonb) INTO proposals
 FROM public.payroll_monthly_annul_proposal p LEFT JOIN public.payroll_monthly_annul_review r ON r.proposal_id=p.id
 WHERE p.tenant_id=(ctx->>'tenantId')::uuid AND p.certified_binding_id=(ctx->>'certifiedBindingId')::uuid
 AND (p_period IS NULL OR p_period=ANY(p.period_months));
 RETURN jsonb_build_object('version','payroll-monthly-annul.v1','scopeKey',public.payroll_monthly_annul_scope_v1(ctx),
 'permissions',jsonb_build_object('canPropose',COALESCE(can_propose,false),'canReview',ctx->'capabilities' ? 'payroll.novelty.approve' AND ctx->>'actorPersonId' IS NOT NULL),
 'candidates',candidates,'proposals',proposals,'complete',true,'effects',public.payroll_monthly_annul_effects_v1());
END $$;

CREATE FUNCTION public.payroll_monthly_annul_batch_guard_v1(old_batch public.payroll_novelty_batch,new_batch public.payroll_novelty_batch)
RETURNS public.payroll_novelty_batch LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.payroll_monthly_annul_review%ROWTYPE; p public.payroll_monthly_annul_proposal%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.payroll_monthly_annul_review WHERE 'ref:'||id::text=new_batch.reason_reference;
 SELECT * INTO p FROM public.payroll_monthly_annul_proposal WHERE id=r.proposal_id;
 IF r.id IS NULL OR r.command<>'approve' OR r.transaction_id<>pg_current_xact_id() OR p.id IS NULL
 OR r.tenant_id<>old_batch.tenant_id OR r.certified_binding_id<>old_batch.certified_binding_id
 OR r.tenant_id<>p.tenant_id OR r.certified_binding_id<>p.certified_binding_id
 OR r.reviewer_membership_id=p.proposer_membership_id OR r.reviewer_person_id=p.proposer_person_id
 OR old_batch.status<>'approved' OR new_batch.status<>'cancelled' OR new_batch.version<>old_batch.version+1
 OR new_batch.reason_code<>'annulled_after_review' OR new_batch.exportable IS DISTINCT FROM false
 OR (to_jsonb(old_batch)-ARRAY['status','version','reason_code','reason_reference','exportable','decided_at','updated_at'])
    IS DISTINCT FROM (to_jsonb(new_batch)-ARRAY['status','version','reason_code','reason_reference','exportable','decided_at','updated_at'])
 OR old_batch.grh_mutation OR old_batch.payroll_calculated OR old_batch.payroll_posted
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.items) i WHERE i->'guardBatch'=to_jsonb(old_batch))
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_AUDIT_REQUIRED'; END IF;
 new_batch.decided_at:=now();new_batch.updated_at:=now();RETURN new_batch;
END $$;
CREATE FUNCTION public.payroll_monthly_annul_event_authority_v1(e public.payroll_novelty_event) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.payroll_monthly_annul_review%ROWTYPE; p public.payroll_monthly_annul_proposal%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.payroll_monthly_annul_review WHERE 'ref:'||id::text=e.reason_reference;
 SELECT * INTO p FROM public.payroll_monthly_annul_proposal WHERE id=r.proposal_id;
 IF r.id IS NULL OR p.id IS NULL OR r.command<>'approve' OR r.transaction_id<>pg_current_xact_id()
 OR e.tenant_id<>r.tenant_id OR e.certified_binding_id<>r.certified_binding_id
 OR e.actor_membership_id IS DISTINCT FROM r.reviewer_membership_id OR e.actor_person_id IS DISTINCT FROM r.reviewer_person_id
 OR e.authority_capability_key<>'payroll.novelty.approve' OR e.actor_role_key IS DISTINCT FROM r.actor_context->>'roleKey'
 OR e.actor_session_id IS DISTINCT FROM r.actor_session_id OR e.actor_session_version IS DISTINCT FROM (r.actor_context->>'actorSessionVersion')::integer
 OR btrim(e.release_sha) IS DISTINCT FROM r.actor_context->>'releaseSha' OR btrim(e.command_hash) IS DISTINCT FROM r.request_sha256
 OR e.reason_code<>'annulled_after_review' OR e.exportable IS DISTINCT FROM false
 OR e.grh_mutation IS DISTINCT FROM false OR e.payroll_calculated IS DISTINCT FROM false OR e.payroll_posted IS DISTINCT FROM false
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.items) i WHERE i#>>'{batch,id}'=e.batch_id::text AND (i#>>'{batch,version}')::integer=e.expected_version)
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_AUDIT_REQUIRED'; END IF;
END $$;

-- Add one ledger-authorized branch to each exact existing guard; retain its ACL,
-- owner, trigger, deferred audit, original transitions and original event hashing.
DO $guards$ DECLARE signature text; definition text; body text; changed text; BEGIN
 signature:='public.payroll_novelty_batch_guard_v1()';
 SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'BEGIN\n  IF NEW.grh_mutation',E'BEGIN\n  IF TG_OP = ''UPDATE'' AND OLD.status = ''approved'' AND NEW.status = ''cancelled'' THEN\n    RETURN public.payroll_monthly_annul_batch_guard_v1(OLD,NEW);\n  END IF;\n  IF NEW.grh_mutation');
 IF changed=body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_GUARD_BUILD_DRIFT'; END IF;
 EXECUTE replace(definition,body,changed);
 signature:='public.payroll_novelty_event_guard_v1()';
 SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid=signature::regprocedure;
 changed:=replace(body,E'BEGIN\n  SELECT * INTO batch_row',E'BEGIN\n  IF NEW.command = ''annul'' THEN\n    PERFORM public.payroll_monthly_annul_event_authority_v1(NEW);\n  END IF;\n  SELECT * INTO batch_row');
 changed:=replace(changed,E'    OR (NEW.command = ''cancel''',E'    OR (NEW.command = ''annul'' AND NEW.from_status = ''approved''\n      AND NEW.to_status = ''cancelled'')\n    OR (NEW.command = ''cancel''');
 IF changed=body OR position('payroll_monthly_annul_event_authority_v1' IN changed)=0 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_GUARD_BUILD_DRIFT'; END IF;
 EXECUTE replace(definition,body,changed);
END $guards$;
ALTER TABLE public.payroll_novelty_batch DROP CONSTRAINT payroll_novelty_batch_reason_ck;
ALTER TABLE public.payroll_novelty_batch ADD CONSTRAINT payroll_novelty_batch_reason_ck CHECK(reason_code IN('draft_prepared','ready_for_review','validated_for_export','invalid_rows','unsupported_concept','duplicate_or_conflict','cancelled_by_preparer','annulled_after_review'));
ALTER TABLE public.payroll_novelty_batch DROP CONSTRAINT payroll_novelty_batch_state_ck;
ALTER TABLE public.payroll_novelty_batch ADD CONSTRAINT payroll_novelty_batch_state_ck CHECK(
 (status='draft' AND submitted_at IS NULL AND decided_at IS NULL AND approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
 OR(status='submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL AND approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
 OR(status IN('approved','rejected') AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND approved_by_membership_id IS NOT NULL AND approved_by_person_id IS NOT NULL)
 OR(status='cancelled' AND decided_at IS NOT NULL AND ((reason_code='cancelled_by_preparer' AND approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
  OR(reason_code='annulled_after_review' AND submitted_at IS NOT NULL AND approved_by_membership_id IS NOT NULL AND approved_by_person_id IS NOT NULL))));
ALTER TABLE public.payroll_novelty_event DROP CONSTRAINT payroll_novelty_event_command_ck;
ALTER TABLE public.payroll_novelty_event ADD CONSTRAINT payroll_novelty_event_command_ck CHECK(command IN('prepare','submit','approve','reject','cancel','annul'));
ALTER TABLE public.payroll_novelty_event DROP CONSTRAINT payroll_novelty_event_decider_person_ck;
ALTER TABLE public.payroll_novelty_event ADD CONSTRAINT payroll_novelty_event_decider_person_ck CHECK(command NOT IN('approve','reject','annul') OR actor_person_id IS NOT NULL);
ALTER TABLE public.payroll_novelty_event DROP CONSTRAINT payroll_novelty_event_authority_ck;
ALTER TABLE public.payroll_novelty_event ADD CONSTRAINT payroll_novelty_event_authority_ck CHECK(
 (command IN('prepare','submit','cancel') AND authority_capability_key='payroll.novelty.prepare')
 OR(command IN('approve','reject','annul') AND authority_capability_key='payroll.novelty.approve'));

CREATE FUNCTION public.payroll_monthly_annul_attempt_v1(p_context jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; a public.payroll_monthly_annul_attempt%ROWTYPE;
BEGIN
 ctx:=public.payroll_monthly_annul_context_v1(p_context,'payroll.novelty.nominal.read');
 SELECT * INTO a FROM public.payroll_monthly_annul_attempt WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
 AND actor_membership_id=(ctx->>'membershipId')::uuid AND idempotency_key=p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_NOT_FOUND'; END IF;
 IF ctx IS DISTINCT FROM a.actor_context THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_SESSION_INVALID'; END IF;
 PERFORM public.payroll_monthly_annul_context_v1(p_context,CASE WHEN a.command='propose' THEN 'payroll.novelty.prepare' ELSE 'payroll.novelty.approve' END);
 RETURN a.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.payroll_monthly_annul_command_v1(p_context jsonb,p_body jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; cmd text; item jsonb; snapshot jsonb; all_items jsonb:='[]'::jsonb; request_hash text;
 p public.payroll_monthly_annul_proposal%ROWTYPE; r public.payroll_monthly_annul_review%ROWTYPE; a public.payroll_monthly_annul_attempt%ROWTYPE;
 event_id uuid:=gen_random_uuid(); receipt jsonb; total_rows integer:=0; result_status text; batch_uuid uuid; h text; event_key uuid;
BEGIN
 IF p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR NOT(p_body ?& ARRAY['command','proposalId','proposalSha256','items','reason'])
 OR (p_body-ARRAY['command','proposalId','proposalSha256','items','reason'])<>'{}'::jsonb
 OR jsonb_typeof(p_body->'command')<>'string' OR p_body->>'command' NOT IN('propose','approve','reject')
 OR jsonb_typeof(p_body->'reason')<>'string' OR char_length(p_body->>'reason') NOT BETWEEN 10 AND 1000
 OR p_body->>'reason'<>btrim(p_body->>'reason') OR p_body->>'reason'<>normalize(p_body->>'reason',NFC)
 OR p_body->>'reason' ~ '[[:cntrl:]<>]' OR p_key IS NULL OR p_key::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
 cmd:=p_body->>'command';ctx:=public.payroll_monthly_annul_context_v1(p_context,CASE WHEN cmd='propose' THEN 'payroll.novelty.prepare' ELSE 'payroll.novelty.approve' END);
 PERFORM pg_advisory_xact_lock(hashtextextended('monthly-annul:'||(ctx->>'tenantId')||':'||(ctx->>'certifiedBindingId'),0));
 SELECT * INTO a FROM public.payroll_monthly_annul_attempt WHERE tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
 AND actor_membership_id=(ctx->>'membershipId')::uuid AND idempotency_key=p_key;
 IF FOUND THEN
  IF a.actor_context IS DISTINCT FROM ctx OR a.request_body IS DISTINCT FROM p_body THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_IDEMPOTENCY_REUSE'; END IF;
  RETURN a.receipt||jsonb_build_object('replayed',true);
 END IF;
 request_hash:=encode(sha256(convert_to(p_body::text,'UTF8')),'hex');
 IF cmd='propose' THEN
  IF p_body->'proposalId'<>'null'::jsonb OR p_body->'proposalSha256'<>'null'::jsonb OR jsonb_typeof(p_body->'items')<>'array'
  OR jsonb_array_length(p_body->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
  IF (SELECT count(DISTINCT value->>'batchId') FROM jsonb_array_elements(p_body->'items'))<>jsonb_array_length(p_body->'items') THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_body->'items') ORDER BY value->>'batchId' LOOP
   IF jsonb_typeof(item)<>'object' OR NOT(item ?& ARRAY['batchId','expectedVersion','snapshotSha256'])
   OR(item-ARRAY['batchId','expectedVersion','snapshotSha256'])<>'{}'::jsonb OR jsonb_typeof(item->'batchId')<>'string'
   OR item->>'batchId' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   OR jsonb_typeof(item->'expectedVersion')<>'number' OR item->>'expectedVersion' !~ '^[1-9][0-9]{0,9}$'
   OR(item->>'expectedVersion')::bigint>=2147483647 OR jsonb_typeof(item->'snapshotSha256')<>'string' OR item->>'snapshotSha256' !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
   batch_uuid:=(item->>'batchId')::uuid;
   PERFORM 1 FROM public.payroll_novelty_batch WHERE id=batch_uuid AND tenant_id=(ctx->>'tenantId')::uuid FOR UPDATE NOWAIT;
   snapshot:=public.payroll_monthly_annul_snapshot_v1(ctx,batch_uuid);
   IF snapshot#>>'{batch,version}'<>item->>'expectedVersion' OR snapshot->>'snapshotSha256'<>item->>'snapshotSha256' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_VERSION_CONFLICT'; END IF;
   IF EXISTS(SELECT 1 FROM public.payroll_monthly_annul_proposal pp WHERE pp.tenant_id=(ctx->>'tenantId')::uuid
    AND pp.certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND NOT EXISTS(SELECT 1 FROM public.payroll_monthly_annul_review rr WHERE rr.proposal_id=pp.id)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(pp.items) pi WHERE pi#>>'{batch,id}'=batch_uuid::text)) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_PENDING_EXISTS'; END IF;
   total_rows:=total_rows+(snapshot#>>'{batch,rowCount}')::integer;all_items:=all_items||jsonb_build_array(snapshot);
  END LOOP;
  IF total_rows>5000 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_ROW_LIMIT'; END IF;
  IF pg_database_size(current_database())+octet_length(all_items::text)+2097152>520093696 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_CAPACITY_LIMIT'; END IF;
  INSERT INTO public.payroll_monthly_annul_proposal(id,tenant_id,certified_binding_id,proposer_membership_id,proposer_person_id,actor_session_id,actor_context,reason,items,proposal_sha256,row_count,batch_count,period_months)
  VALUES(event_id,(ctx->>'tenantId')::uuid,(ctx->>'certifiedBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,
   (ctx->>'actorSessionId')::uuid,ctx,p_body->>'reason',all_items,encode(sha256(convert_to(jsonb_build_object('id',event_id,'items',all_items,'reason',p_body->>'reason','actorContext',ctx)::text,'UTF8')),'hex'),total_rows,
   jsonb_array_length(all_items),ARRAY(SELECT DISTINCT (i#>>'{batch,periodMonth}')::date FROM jsonb_array_elements(all_items) i ORDER BY (i#>>'{batch,periodMonth}')::date))
  RETURNING * INTO p;result_status:='pending';
 ELSE
  IF p_body->'items'<>'null'::jsonb OR jsonb_typeof(p_body->'proposalId')<>'string' OR p_body->>'proposalId' !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_body->'proposalSha256')<>'string' OR p_body->>'proposalSha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_INVALID_PAYLOAD'; END IF;
  SELECT * INTO p FROM public.payroll_monthly_annul_proposal WHERE id=(p_body->>'proposalId')::uuid AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_NOT_FOUND'; END IF;
  IF p.proposal_sha256<>p_body->>'proposalSha256' OR EXISTS(SELECT 1 FROM public.payroll_monthly_annul_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_VERSION_CONFLICT'; END IF;
  IF p.proposer_membership_id=(ctx->>'membershipId')::uuid OR p.proposer_person_id=(ctx->>'actorPersonId')::uuid THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_MAKER_CHECKER_REQUIRED'; END IF;
  IF cmd='approve' THEN
   FOR item IN SELECT value FROM jsonb_array_elements(p.items) ORDER BY value#>>'{batch,id}' LOOP
    batch_uuid:=(item#>>'{batch,id}')::uuid;
    PERFORM 1 FROM public.payroll_novelty_batch WHERE id=batch_uuid AND tenant_id=p.tenant_id FOR UPDATE NOWAIT;
    IF public.payroll_monthly_annul_snapshot_v1(ctx,batch_uuid) IS DISTINCT FROM item THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_VERSION_CONFLICT'; END IF;
   END LOOP;
  END IF;
  IF pg_database_size(current_database())+2097152>520093696 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_CAPACITY_LIMIT'; END IF;
  INSERT INTO public.payroll_monthly_annul_review(id,proposal_id,tenant_id,certified_binding_id,reviewer_membership_id,reviewer_person_id,actor_session_id,actor_context,command,reason,request_sha256)
  VALUES(event_id,p.id,p.tenant_id,p.certified_binding_id,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,(ctx->>'actorSessionId')::uuid,ctx,cmd,p_body->>'reason',request_hash) RETURNING * INTO r;
  IF cmd='approve' THEN
   FOR item IN SELECT value FROM jsonb_array_elements(p.items) ORDER BY value#>>'{batch,id}' LOOP
    batch_uuid:=(item#>>'{batch,id}')::uuid;
    UPDATE public.payroll_novelty_batch SET status='cancelled',version=version+1,reason_code='annulled_after_review',reason_reference='ref:'||r.id::text,exportable=false
    WHERE id=batch_uuid AND tenant_id=p.tenant_id;
    h:=encode(sha256(convert_to(r.id::text||':'||batch_uuid::text,'UTF8')),'hex');
    event_key:=(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid;
    INSERT INTO public.payroll_novelty_event(tenant_id,batch_id,certified_binding_id,actor_membership_id,actor_person_id,actor_role_key,authority_capability_key,
     actor_session_id,actor_session_version,release_sha,command,from_status,to_status,expected_version,resulting_version,reason_code,reason_reference,idempotency_key,
     command_hash,event_sha256,exportable,grh_mutation,payroll_calculated,payroll_posted)
    VALUES(p.tenant_id,batch_uuid,p.certified_binding_id,r.reviewer_membership_id,r.reviewer_person_id,ctx->>'roleKey','payroll.novelty.approve',r.actor_session_id,
     (ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha','annul','approved','cancelled',(item#>>'{batch,version}')::integer,(item#>>'{batch,version}')::integer+1,
     'annulled_after_review','ref:'||r.id::text,event_key,request_hash,repeat('0',64),false,false,false,false);
   END LOOP;
  END IF;
  result_status:=CASE WHEN cmd='approve' THEN 'approved' ELSE 'rejected' END;
 END IF;
 IF public.payroll_monthly_annul_context_v1(p_context,CASE WHEN cmd='propose' THEN 'payroll.novelty.prepare' ELSE 'payroll.novelty.approve' END) IS DISTINCT FROM ctx
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_SESSION_INVALID'; END IF;
 receipt:=jsonb_build_object('version','payroll-monthly-annul.v1','eventId',event_id,'proposalId',p.id,'key',p_key,'bodySha256',request_hash,'body',p_body,
 'replayed',false,'status',result_status,'recordedAt',now(),'effects',public.payroll_monthly_annul_effects_v1());
 INSERT INTO public.payroll_monthly_annul_attempt(id,tenant_id,certified_binding_id,actor_membership_id,actor_session_id,actor_context,idempotency_key,command,request_body,receipt)
 VALUES(event_id,p.tenant_id,p.certified_binding_id,(ctx->>'membershipId')::uuid,(ctx->>'actorSessionId')::uuid,ctx,p_key,cmd,p_body,receipt);
 RETURN receipt;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ANNUL_SESSION_BUSY';
END $$;

DO $acl$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'payroll_monthly_annul_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, municontrol_actions_runtime_app',f.signature);
  IF f.proname IN('payroll_monthly_annul_bootstrap_v1','payroll_monthly_annul_detail_v1','payroll_monthly_annul_attempt_v1','payroll_monthly_annul_command_v1')
  THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO municontrol_actions_runtime_app',f.signature); END IF;
 END LOOP;
END $acl$;
