-- SQL118: additive atomic correction proposals, using existing092/093; no payroll calculation.
-- No employee resolution, payroll evaluation, approval, export or municipal data.
DO $$ BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)') IS NULL
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_GROUP_PREREQUISITE'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.payroll_fixed_correction_group (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL, certified_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 idempotency_key uuid NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 receipts jsonb NOT NULL CHECK(jsonb_typeof(receipts)='array' AND jsonb_array_length(receipts) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,certified_binding_id,actor_membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
ALTER TABLE public.payroll_fixed_correction_group ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_fixed_correction_group FROM PUBLIC,municontrol_actions_runtime_app;
DROP TRIGGER IF EXISTS payroll_fixed_correction_group_immutable ON public.payroll_fixed_correction_group;
CREATE TRIGGER payroll_fixed_correction_group_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_fixed_correction_group
 FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_fixed_registry_immutable_v1();

CREATE OR REPLACE FUNCTION public.payroll_fixed_correction_group_receipt_v1(ctx jsonb,g public.payroll_fixed_correction_group,replayed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; e public.payroll_fixed_novelty_event%ROWTYPE;
BEGIN
 IF g.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid OR g.certified_binding_id IS DISTINCT FROM (ctx->>'certifiedBindingId')::uuid
 OR g.actor_membership_id IS DISTINCT FROM (ctx->>'membershipId')::uuid THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(g.receipts) LOOP
  SELECT * INTO e FROM public.payroll_fixed_novelty_event WHERE id=(r->>'proposalId')::uuid AND record_id=(r->>'recordId')::uuid
   AND tenant_id=g.tenant_id AND certified_binding_id=g.certified_binding_id AND actor_membership_id=g.actor_membership_id
   AND command='propose' AND version=(r->>'recordVersion')::integer AND payload->>'operation'='set';
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_CONTRACT_DRIFT'; END IF;
  PERFORM public.payroll_fixed_registry_event_identity_v1(ctx,e);
 END LOOP;
 RETURN jsonb_build_object('version','payroll-fixed-correction-group.v1','groupId',g.id,'key',g.idempotency_key,
  'requestSha256',g.request_sha256,'total',jsonb_array_length(g.receipts),'rows',g.receipts,'duplicate',replayed,
  'effects',public.payroll_fixed_registry_effects_v1());
END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_correction_group_attempt_v1(p_context jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; g public.payroll_fixed_correction_group%ROWTYPE;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context,'payroll.fixed.prepare');
 PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 SELECT * INTO g FROM public.payroll_fixed_correction_group WHERE tenant_id=(ctx->>'tenantId')::uuid
  AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND idempotency_key=p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 RETURN public.payroll_fixed_correction_group_receipt_v1(ctx,g,true);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_correction_group_propose_v1(p_context jsonb,p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; g public.payroll_fixed_correction_group%ROWTYPE; item jsonb; request_hash text; rows_json jsonb:='[]';
 ordinal integer:=0; inner_hash text; inner_key uuid; item_receipt jsonb; used_bytes bigint; item_count integer; root_row public.payroll_fixed_novelty%ROWTYPE; view_json jsonb;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context,'payroll.fixed.prepare');
 PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 IF p_key IS NULL OR p_key::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR NOT p_payload ?& ARRAY['items','reason']
 OR p_payload-ARRAY['items','reason']<>'{}' OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
 OR NOT public.payroll_fixed_registry_text_v1(p_payload->>'reason',5,500) THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 item_count:=jsonb_array_length(p_payload->'items');
 IF item_count NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ROW_LIMIT'; END IF;
 IF (SELECT count(DISTINCT value->>'recordId') FROM jsonb_array_elements(p_payload->'items'))<>item_count
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  IF jsonb_typeof(item)<>'object' OR NOT item ?& ARRAY['recordId','expectedVersion','contractId','legajo','identityToken','values']
  OR item-ARRAY['recordId','expectedVersion','contractId','legajo','identityToken','values']<>'{}'
  OR jsonb_typeof(item->'recordId') IS DISTINCT FROM 'string' OR item->>'recordId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 END LOOP;
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO g FROM public.payroll_fixed_correction_group WHERE tenant_id=(ctx->>'tenantId')::uuid
  AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND idempotency_key=p_key;
 IF FOUND THEN
  IF g.request_sha256<>request_hash THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_REUSE'; END IF;
  RETURN public.payroll_fixed_correction_group_receipt_v1(ctx,g,true);
 END IF;
 -- Reserve the entire operation before its first insert; retain the existing capacity gate too.
 PERFORM public.payroll_fixed_registry_capacity_v1();
 SELECT sum(pg_database_size(oid)) INTO used_bytes FROM pg_database;
 IF used_bytes IS NULL OR used_bytes+item_count*16384+65536>520093696 THEN RAISE EXCEPTION 'PAYROLL_FIXED_CAPACITY_LIMIT'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  SELECT * INTO root_row FROM public.payroll_fixed_novelty WHERE id=(item->>'recordId')::uuid
   AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
  view_json:=public.payroll_fixed_registry_record_json_v1(ctx,root_row);
  IF jsonb_typeof(item->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(item->>'expectedVersion','') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
  IF (view_json->>'version')::integer<>(item->>'expectedVersion')::integer THEN RAISE EXCEPTION 'PAYROLL_FIXED_VERSION_CONFLICT'; END IF;
  IF view_json->'pending'<>'null'::jsonb THEN RAISE EXCEPTION 'PAYROLL_FIXED_PENDING_EXISTS'; END IF;
  IF view_json#>>'{approved,operation}' IS DISTINCT FROM 'set' OR view_json#>'{approved,values}'=item->'values' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
  ordinal:=ordinal+1;
  inner_hash:=encode(digest(convert_to('fixed-correction-group.v1:'||p_key::text||':'||ordinal::text,'UTF8'),'sha256'),'hex');
  inner_key:=(substr(inner_hash,1,8)||'-'||substr(inner_hash,9,4)||'-4'||substr(inner_hash,14,3)||'-8'||substr(inner_hash,18,3)||'-'||substr(inner_hash,21,12))::uuid;
  item_receipt:=public.payroll_fixed_registry_propose_v1(p_context,item||jsonb_build_object('operation','set','values',item->'values','reason',p_payload->>'reason'),inner_key);
  IF item_receipt->>'duplicate' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_REUSE'; END IF;
  rows_json:=rows_json||jsonb_build_array(item_receipt);
 END LOOP;
 INSERT INTO public.payroll_fixed_correction_group(tenant_id,certified_binding_id,actor_membership_id,actor_session_id,idempotency_key,request_sha256,receipts)
 VALUES((ctx->>'tenantId')::uuid,(ctx->>'certifiedBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorSessionId')::uuid,p_key,request_hash,rows_json) RETURNING * INTO g;
 RETURN public.payroll_fixed_correction_group_receipt_v1(ctx,g,false);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

REVOKE ALL ON FUNCTION public.payroll_fixed_correction_group_receipt_v1(jsonb,public.payroll_fixed_correction_group,boolean),
 public.payroll_fixed_correction_group_attempt_v1(jsonb,uuid),public.payroll_fixed_correction_group_propose_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_fixed_correction_group_attempt_v1(jsonb,uuid),public.payroll_fixed_correction_group_propose_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
