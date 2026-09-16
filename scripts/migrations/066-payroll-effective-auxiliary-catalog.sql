-- Native effective auxiliary catalogue. Additive; never calculates or rewrites payroll.
-- Proposal approval and activation are separate explicit administrative acts.
CREATE TABLE public.payroll_auxiliary_release (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
  certified_binding_id uuid NOT NULL REFERENCES public.platform_tenant_source_binding(id),
  revision integer NOT NULL CHECK (revision > 0),
  proposal_id uuid NOT NULL REFERENCES public.payroll_parameter_proposal(id),
  proposal_version integer NOT NULL CHECK (proposal_version > 0),
  valid_from date NOT NULL CHECK (extract(day FROM valid_from) = 1),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  activated_by_membership_id uuid NOT NULL REFERENCES public.tenant_membership(id),
  activated_by_person_id uuid NOT NULL REFERENCES public.person_identity(id),
  actor_session_id uuid NOT NULL,
  actor_session_version integer NOT NULL CHECK (actor_session_version > 0),
  application_release_sha text NOT NULL CHECK (application_release_sha ~ '^[a-f0-9]{40}$'),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  expected_catalog_revision integer NOT NULL CHECK (expected_catalog_revision >= 0),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, certified_binding_id, revision),
  UNIQUE (tenant_id, certified_binding_id, proposal_id),
  UNIQUE (tenant_id, activated_by_membership_id, idempotency_key)
);
ALTER TABLE public.payroll_auxiliary_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_auxiliary_release FROM PUBLIC, municontrol_actions_runtime_app;
CREATE FUNCTION public.payroll_auxiliary_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'PAYROLL_CATALOG_IMMUTABLE' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER payroll_auxiliary_immutable BEFORE UPDATE OR DELETE ON public.payroll_auxiliary_release
FOR EACH ROW EXECUTE FUNCTION public.payroll_auxiliary_immutable_v1();
CREATE TRIGGER payroll_auxiliary_no_truncate BEFORE TRUNCATE ON public.payroll_auxiliary_release
FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_auxiliary_immutable_v1();

-- Internal projection. Revision pins both the accepted history and its values.
CREATE FUNCTION public.payroll_auxiliary_snapshot_v1(p_tenant uuid, p_binding uuid, p_period text, p_revision integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 WITH chosen AS (
   SELECT DISTINCT ON ((item->>'agreementId')::integer, (item->>'auxiliaryId')::integer)
     item, r.id, r.revision, r.valid_from, r.proposal_id, r.proposal_version, r.activated_at, r.draft
   FROM public.payroll_auxiliary_release r
   CROSS JOIN LATERAL jsonb_array_elements(r.draft->'rows') item
   WHERE r.tenant_id=p_tenant AND r.certified_binding_id=p_binding
     AND r.revision<=p_revision AND r.valid_from<=(p_period||'-01')::date
   ORDER BY (item->>'agreementId')::integer, (item->>'auxiliaryId')::integer, r.valid_from DESC, r.revision DESC
 ) SELECT jsonb_build_object('period',p_period,'revision',p_revision,'rows',COALESCE(jsonb_agg(
   item||jsonb_build_object('activationId',id,'activationRevision',revision,
     'validFrom',to_char(valid_from,'YYYY-MM'),'proposalId',proposal_id,'proposalVersion',proposal_version,
     'sourceReference',draft->>'sourceReference','ruleId',draft->>'ruleId',
     'sourceSha256',draft->>'sourceSha256','activatedAt',activated_at)
   ORDER BY (item->>'agreementId')::integer,(item->>'auxiliaryId')::integer),'[]'::jsonb)) FROM chosen
$$;
CREATE FUNCTION public.payroll_auxiliary_release_result_v1(p_id uuid, p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT jsonb_build_object('contractVersion','payroll-auxiliary-catalog.v1','replayed',p_replayed,
   'activation',jsonb_build_object('id',r.id,'revision',r.revision,'proposalId',r.proposal_id,
     'proposalVersion',r.proposal_version,'validFrom',to_char(r.valid_from,'YYYY-MM'),
     'activatedAt',r.activated_at),
   'catalog',public.payroll_auxiliary_snapshot_v1(r.tenant_id,r.certified_binding_id,to_char(r.valid_from,'YYYY-MM'),r.revision),
   'payrollCalculated',false,'payrollPosted',false)
 FROM public.payroll_auxiliary_release r WHERE r.id=p_id
$$;
CREATE FUNCTION public.payroll_auxiliary_catalog_v1(p_context jsonb, p_period text, p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c jsonb; current_revision integer; selected_revision integer;
BEGIN
 c:=public.payroll_parameter_assert_context_v1(p_context,'payroll.parameter.read');
 IF p_period IS NULL OR p_period !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR p_revision<0 THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_INPUT_INVALID' USING ERRCODE='P0001'; END IF;
 SELECT COALESCE(max(revision),0) INTO current_revision FROM public.payroll_auxiliary_release
 WHERE tenant_id=(c->>'tenantId')::uuid AND certified_binding_id=(c->>'certifiedBindingId')::uuid;
 selected_revision:=COALESCE(p_revision,current_revision);
 IF selected_revision>current_revision THEN RAISE EXCEPTION 'PAYROLL_CATALOG_REVISION_INVALID' USING ERRCODE='P0001'; END IF;
 RETURN jsonb_build_object('contractVersion','payroll-auxiliary-catalog.v1','currentRevision',current_revision,
  'catalog',public.payroll_auxiliary_snapshot_v1((c->>'tenantId')::uuid,(c->>'certifiedBindingId')::uuid,p_period,selected_revision),
  'payrollCalculated',false,'payrollPosted',false);
END $$;
CREATE FUNCTION public.payroll_auxiliary_preview_v1(p_context jsonb, p_proposal uuid, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c jsonb; p public.payroll_parameter_proposal%ROWTYPE; current_revision integer;
 before_snapshot jsonb; changes jsonb; reason text; existing_id uuid;
BEGIN
 c:=public.payroll_parameter_assert_context_v1(p_context,'payroll.parameter.read');
 IF p_proposal IS NULL OR p_version IS NULL OR p_version<1 THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_INPUT_INVALID' USING ERRCODE='P0001'; END IF;
 SELECT * INTO p FROM public.payroll_parameter_proposal WHERE id=p_proposal
  AND tenant_id=(c->>'tenantId')::uuid AND certified_binding_id=(c->>'certifiedBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_CATALOG_NOT_FOUND' USING ERRCODE='P0001'; END IF;
 IF p.version<>p_version THEN RAISE EXCEPTION 'PAYROLL_CATALOG_PROPOSAL_CHANGED' USING ERRCODE='P0001'; END IF;
 IF p.status<>'approved' OR NOT p.proposal_approved THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_APPROVAL_REQUIRED' USING ERRCODE='P0001'; END IF;
 IF p.draft IS DISTINCT FROM public.payroll_parameter_build_draft_v1(p.draft - ARRAY['rows','sourceSha256','currentCatalogVerified','applied']) THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_SOURCE_INVALID' USING ERRCODE='P0001'; END IF;
 SELECT COALESCE(max(revision),0) INTO current_revision FROM public.payroll_auxiliary_release
  WHERE tenant_id=p.tenant_id AND certified_binding_id=p.certified_binding_id;
 SELECT id INTO existing_id FROM public.payroll_auxiliary_release WHERE tenant_id=p.tenant_id
  AND certified_binding_id=p.certified_binding_id AND proposal_id=p.id;
 before_snapshot:=public.payroll_auxiliary_snapshot_v1(p.tenant_id,p.certified_binding_id,p.draft->>'validFrom',current_revision);
 SELECT jsonb_agg(v||jsonb_build_object('previousValueCents',old->>'newValueCents',
   'previousValidFrom',old->>'validFrom','previousActivationRevision',old->'activationRevision') ORDER BY (v->>'agreementId')::integer)
 INTO changes FROM jsonb_array_elements(p.draft->'rows') v
 LEFT JOIN LATERAL (SELECT old FROM jsonb_array_elements(before_snapshot->'rows') old
  WHERE old->>'agreementId'=v->>'agreementId' AND old->>'auxiliaryId'=v->>'auxiliaryId') previous ON true;
 reason:=CASE WHEN existing_id IS NOT NULL THEN 'already_activated'
   WHEN NOT (c->'capabilities' ? 'payroll.parameter.approve') THEN 'reviewer_required'
   WHEN c->>'actorPersonId' IS NULL THEN 'employment_required'
   WHEN p.prepared_by_membership_id=(c->>'membershipId')::uuid OR p.prepared_by_person_id=(c->>'actorPersonId')::uuid THEN 'independent_reviewer_required'
   WHEN p.period_month<date_trunc('month',timezone('America/Argentina/Mendoza',CURRENT_TIMESTAMP))::date THEN 'past_period'
   ELSE NULL END;
 RETURN jsonb_build_object('contractVersion','payroll-auxiliary-catalog.v1','preview',jsonb_build_object(
   'proposalId',p.id,'proposalVersion',p.version,'catalogRevision',current_revision,'validFrom',p.draft->>'validFrom',
   'sourceReference',p.draft->>'sourceReference','changes',changes,'canActivate',reason IS NULL,
   'blockedReason',reason,'activationId',existing_id), 'payrollCalculated',false,'payrollPosted',false);
END $$;
CREATE FUNCTION public.payroll_auxiliary_activate_v1(p_context jsonb, p_proposal uuid, p_version integer,
 p_expected_revision integer, p_key uuid, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c jsonb; p public.payroll_parameter_proposal%ROWTYPE; prior public.payroll_auxiliary_release%ROWTYPE;
 current_revision integer; activation_id uuid;
BEGIN
 c:=public.payroll_parameter_assert_context_v1(p_context,'payroll.parameter.approve');
 IF p_proposal IS NULL OR p_version IS NULL OR p_version<1 OR p_expected_revision IS NULL OR p_expected_revision<0
  OR p_key IS NULL OR p_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_INPUT_INVALID' USING ERRCODE='P0001'; END IF;
 IF c->>'actorPersonId' IS NULL THEN RAISE EXCEPTION 'PAYROLL_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
 -- All activations for this tenant/binding serialize, including an empty catalogue.
 PERFORM pg_advisory_xact_lock(hashtextextended('native-auxiliary:'||(c->>'tenantId')||':'||(c->>'certifiedBindingId'),0));
 SELECT * INTO prior FROM public.payroll_auxiliary_release WHERE tenant_id=(c->>'tenantId')::uuid
  AND activated_by_membership_id=(c->>'membershipId')::uuid AND idempotency_key=p_key;
 IF FOUND THEN
  IF prior.certified_binding_id<>(c->>'certifiedBindingId')::uuid OR prior.actor_session_id<>(c->>'actorSessionId')::uuid
   OR prior.actor_session_version<>(c->>'actorSessionVersion')::integer OR prior.application_release_sha<>c->>'releaseSha'
   OR prior.activated_by_person_id<>(c->>'actorPersonId')::uuid OR prior.command_hash<>p_hash
   OR prior.proposal_id<>p_proposal OR prior.proposal_version<>p_version OR prior.expected_catalog_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'PAYROLL_CATALOG_ATTEMPT_CONFLICT' USING ERRCODE='P0001'; END IF;
  RETURN public.payroll_auxiliary_release_result_v1(prior.id,true);
 END IF;
 SELECT * INTO p FROM public.payroll_parameter_proposal WHERE id=p_proposal AND tenant_id=(c->>'tenantId')::uuid
  AND certified_binding_id=(c->>'certifiedBindingId')::uuid FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_CATALOG_NOT_FOUND' USING ERRCODE='P0001'; END IF;
 IF p.version<>p_version THEN RAISE EXCEPTION 'PAYROLL_CATALOG_PROPOSAL_CHANGED' USING ERRCODE='P0001'; END IF;
 IF p.status<>'approved' OR NOT p.proposal_approved THEN RAISE EXCEPTION 'PAYROLL_CATALOG_APPROVAL_REQUIRED' USING ERRCODE='P0001'; END IF;
 IF p.prepared_by_membership_id=(c->>'membershipId')::uuid OR p.prepared_by_person_id=(c->>'actorPersonId')::uuid THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_INDEPENDENT_REVIEWER_REQUIRED' USING ERRCODE='P0001'; END IF;
 IF p.period_month<date_trunc('month',timezone('America/Argentina/Mendoza',CURRENT_TIMESTAMP))::date THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_PAST_PERIOD' USING ERRCODE='P0001'; END IF;
 IF p.draft IS DISTINCT FROM public.payroll_parameter_build_draft_v1(p.draft - ARRAY['rows','sourceSha256','currentCatalogVerified','applied'])
   OR p.period_month<>((p.draft->>'validFrom')||'-01')::date THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_SOURCE_INVALID' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM public.payroll_auxiliary_release WHERE tenant_id=p.tenant_id AND certified_binding_id=p.certified_binding_id AND proposal_id=p.id) THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_ALREADY_ACTIVATED' USING ERRCODE='P0001'; END IF;
 SELECT COALESCE(max(revision),0) INTO current_revision FROM public.payroll_auxiliary_release
  WHERE tenant_id=p.tenant_id AND certified_binding_id=p.certified_binding_id;
 IF current_revision<>p_expected_revision THEN RAISE EXCEPTION 'PAYROLL_CATALOG_VERSION_CONFLICT' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.payroll_auxiliary_release(tenant_id,certified_binding_id,revision,proposal_id,proposal_version,valid_from,draft,
  activated_by_membership_id,activated_by_person_id,actor_session_id,actor_session_version,application_release_sha,idempotency_key,command_hash,expected_catalog_revision)
 VALUES(p.tenant_id,p.certified_binding_id,current_revision+1,p.id,p.version,p.period_month,p.draft,
  (c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,(c->>'actorSessionId')::uuid,(c->>'actorSessionVersion')::integer,
  c->>'releaseSha',p_key,p_hash,p_expected_revision) RETURNING id INTO activation_id;
 RETURN public.payroll_auxiliary_release_result_v1(activation_id,false);
END $$;
CREATE FUNCTION public.payroll_auxiliary_attempt_v1(p_context jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c jsonb; r public.payroll_auxiliary_release%ROWTYPE;
BEGIN
 c:=public.payroll_parameter_assert_context_v1(p_context,'payroll.parameter.approve');
 IF p_key IS NULL THEN RAISE EXCEPTION 'PAYROLL_CATALOG_INPUT_INVALID' USING ERRCODE='P0001'; END IF;
 SELECT * INTO r FROM public.payroll_auxiliary_release WHERE tenant_id=(c->>'tenantId')::uuid
  AND activated_by_membership_id=(c->>'membershipId')::uuid AND idempotency_key=p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_CATALOG_ATTEMPT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
 IF r.certified_binding_id<>(c->>'certifiedBindingId')::uuid OR r.actor_session_id<>(c->>'actorSessionId')::uuid
   OR r.actor_session_version<>(c->>'actorSessionVersion')::integer OR r.application_release_sha<>c->>'releaseSha'
   OR r.activated_by_person_id IS DISTINCT FROM (c->>'actorPersonId')::uuid THEN
  RAISE EXCEPTION 'PAYROLL_CATALOG_ATTEMPT_CONFLICT' USING ERRCODE='P0001'; END IF;
 RETURN public.payroll_auxiliary_release_result_v1(r.id,true);
END $$;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_immutable_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_snapshot_v1(uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_release_result_v1(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_catalog_v1(jsonb,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_preview_v1(jsonb,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_activate_v1(jsonb,uuid,integer,integer,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_auxiliary_attempt_v1(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_auxiliary_catalog_v1(jsonb,text,integer),
 public.payroll_auxiliary_preview_v1(jsonb,uuid,integer),
 public.payroll_auxiliary_activate_v1(jsonb,uuid,integer,integer,uuid,text),
 public.payroll_auxiliary_attempt_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
