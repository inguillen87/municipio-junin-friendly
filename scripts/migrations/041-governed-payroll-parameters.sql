-- MuniControl 041: persistent, reviewed auxiliary parameter proposals.
-- No GRH writes, formula evaluation, payroll calculation or current-catalog certification.
-- Role assignments and identity/source bindings are untouched. The pinned applier
-- audits capability additions and invalidates only affected municipal sessions.
INSERT INTO public.iam_capability (capability_key,label,description,scope_kind,sensitivity) VALUES
 ('payroll.parameter.read','Consultar parámetros','Consultar preparaciones municipales de auxiliares','tenant','standard'),
 ('payroll.parameter.prepare','Preparar parámetros','Preparar y enviar auxiliares documentados para revisión','tenant','privileged'),
 ('payroll.parameter.approve','Revisar parámetros','Aprobar o rechazar preparaciones de otra persona','tenant','restricted'),
 ('payroll.parameter.audit.read','Historial de parámetros','Consultar decisiones y versiones de preparaciones','tenant','restricted')
ON CONFLICT (capability_key) DO NOTHING;
INSERT INTO public.iam_capability_conflict (capability_key,conflicts_with_key,reason) VALUES
 ('payroll.parameter.approve','payroll.parameter.prepare','Una preparación requiere una persona revisora distinta')
ON CONFLICT (capability_key,conflicts_with_key) DO NOTHING;
INSERT INTO public.iam_role_capability (role_key,capability_key) VALUES
 ('NOMINA_GESTION_INTEGRAL','payroll.parameter.read'),
 ('NOMINA_GESTION_INTEGRAL','payroll.parameter.prepare'),
 ('NOMINA_GESTION_INTEGRAL','payroll.parameter.audit.read'),
 ('HUGO_APROBADOR_INTEGRAL','payroll.parameter.read'),
 ('HUGO_APROBADOR_INTEGRAL','payroll.parameter.approve'),
 ('HUGO_APROBADOR_INTEGRAL','payroll.parameter.audit.read'),
 ('PLATFORM_OWNER_OPERATIVO_INTEGRAL','payroll.parameter.read'),
 ('PLATFORM_OWNER_OPERATIVO_INTEGRAL','payroll.parameter.audit.read')
ON CONFLICT (role_key,capability_key) DO NOTHING;

CREATE TABLE public.payroll_parameter_proposal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 certified_binding_id uuid NOT NULL, release_sha char(40) NOT NULL CHECK(release_sha ~ '^[a-f0-9]{40}$'),
 contract_version text NOT NULL DEFAULT 'payroll-parameter-proposal-governed.v1'
   CHECK(contract_version = 'payroll-parameter-proposal-governed.v1'),
 draft jsonb NOT NULL CHECK(jsonb_typeof(draft) = 'object'), draft_sha256 char(64) NOT NULL CHECK(draft_sha256 ~ '^[a-f0-9]{64}$'),
 period_month date NOT NULL CHECK(period_month = date_trunc('month',period_month)::date),
 status varchar(16) NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','submitted','approved','rejected','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 reason_code varchar(64) NOT NULL DEFAULT 'parameters_prepared', reason_reference varchar(128),
 prepared_by_membership_id uuid NOT NULL, prepared_by_person_id uuid NOT NULL,
 decided_by_membership_id uuid, decided_by_person_id uuid,
 proposal_approved boolean NOT NULL DEFAULT false,
 grh_mutation boolean NOT NULL DEFAULT false CHECK(grh_mutation IS FALSE),
 payroll_calculated boolean NOT NULL DEFAULT false CHECK(payroll_calculated IS FALSE),
 payroll_posted boolean NOT NULL DEFAULT false CHECK(payroll_posted IS FALSE),
 current_catalog_verified boolean NOT NULL DEFAULT false CHECK(current_catalog_verified IS FALSE),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz, decided_at timestamptz,
 UNIQUE(id,tenant_id),
 FOREIGN KEY(tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(prepared_by_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY(decided_by_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY(prepared_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
 FOREIGN KEY(decided_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
 CONSTRAINT payroll_parameter_maker_checker_ck CHECK(decided_by_person_id IS NULL OR
   (decided_by_membership_id <> prepared_by_membership_id AND decided_by_person_id <> prepared_by_person_id)),
 CONSTRAINT payroll_parameter_reference_ck CHECK(reason_reference IS NULL OR reason_reference ~ '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 CONSTRAINT payroll_parameter_state_ck CHECK(
   (status='prepared' AND submitted_at IS NULL AND decided_at IS NULL AND reason_code='parameters_prepared'
     AND reason_reference IS NULL AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL AND proposal_approved IS FALSE)
   OR (status='submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL AND reason_code='ready_for_review'
     AND reason_reference IS NOT NULL AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL AND proposal_approved IS FALSE)
   OR (status='approved' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND reason_code='approved_by_checker'
     AND reason_reference IS NOT NULL AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL AND proposal_approved IS TRUE)
   OR (status='rejected' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND reason_code IN ('source_mismatch','evidence_insufficient','period_not_ready')
     AND reason_reference IS NOT NULL AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL AND proposal_approved IS FALSE)
   OR (status='cancelled' AND decided_at IS NOT NULL AND reason_code='cancelled_by_preparer'
     AND reason_reference IS NOT NULL AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL AND proposal_approved IS FALSE)
 )
);
CREATE INDEX payroll_parameter_proposal_tenant_status_idx ON public.payroll_parameter_proposal(tenant_id,certified_binding_id,status,created_at DESC,id);
CREATE UNIQUE INDEX payroll_parameter_proposal_active_draft_uk ON public.payroll_parameter_proposal(tenant_id,certified_binding_id,draft_sha256)
 WHERE status IN ('prepared','submitted','approved');
CREATE TABLE public.payroll_parameter_event (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_id uuid,
  actor_role_key varchar(64) NOT NULL,
  authority_capability_key varchar(96) NOT NULL,
  actor_session_id uuid NOT NULL,
  actor_session_version integer NOT NULL,
  release_sha char(40) NOT NULL,
  command varchar(16) NOT NULL,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  expected_version integer NOT NULL,
  resulting_version integer NOT NULL,
  reason_code varchar(64) NOT NULL,
  reason_reference varchar(128),
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  event_sha256 char(64) NOT NULL DEFAULT repeat('0', 64),
  proposal_approved boolean NOT NULL DEFAULT false,
  includes_personal_records boolean NOT NULL DEFAULT false,
  raw_content_stored boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  bank_artifact_generated boolean NOT NULL DEFAULT false,
  government_artifact_generated boolean NOT NULL DEFAULT false,
  fiscal_artifact_generated boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_parameter_event_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_parameter_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_run_fk
    FOREIGN KEY (proposal_id, tenant_id)
    REFERENCES public.payroll_parameter_proposal(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_person_fk
    FOREIGN KEY (actor_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_role_fk
    FOREIGN KEY (actor_role_key) REFERENCES public.iam_role(role_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_capability_fk
    FOREIGN KEY (authority_capability_key)
    REFERENCES public.iam_capability(capability_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_session_fk
    FOREIGN KEY (actor_session_id) REFERENCES public.tenant_identity_session(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_parameter_event_run_version_uk UNIQUE (proposal_id, resulting_version),
  CONSTRAINT payroll_parameter_event_actor_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT payroll_parameter_event_command_ck CHECK (
    command IN ('prepare','submit','approve','reject','cancel')
  ),
  CONSTRAINT payroll_parameter_event_authority_ck CHECK (
    (command IN ('prepare','submit','cancel')
      AND authority_capability_key = 'payroll.parameter.prepare')
    OR (command IN ('approve','reject')
      AND authority_capability_key = 'payroll.parameter.approve')
  ),
  CONSTRAINT payroll_parameter_event_decider_person_ck CHECK (
    command NOT IN ('approve','reject') OR actor_person_id IS NOT NULL
  ),
  CONSTRAINT payroll_parameter_event_status_ck CHECK (
    (from_status IS NULL OR from_status IN (
      'prepared','submitted','approved','rejected','cancelled'
    )) AND to_status IN ('prepared','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT payroll_parameter_event_version_ck CHECK (
    expected_version >= 0 AND resulting_version = expected_version + 1
  ),
  CONSTRAINT payroll_parameter_event_session_version_ck CHECK (actor_session_version > 0),
  CONSTRAINT payroll_parameter_event_release_ck CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_parameter_event_idempotency_v4_ck CHECK (
    idempotency_key::text ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_parameter_event_hash_ck CHECK (
    command_hash ~ '^[a-f0-9]{64}$' AND event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT payroll_parameter_event_reference_ck CHECK (
    (command = 'prepare' AND reason_reference IS NULL)
    OR (command <> 'prepare' AND reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ),
  CONSTRAINT payroll_parameter_event_approval_ck CHECK (
    proposal_approved = (to_status = 'approved')
  ),
  CONSTRAINT payroll_parameter_event_no_side_effect_ck CHECK (
    includes_personal_records IS FALSE AND raw_content_stored IS FALSE
    AND grh_mutation IS FALSE AND payroll_calculated IS FALSE
    AND payroll_posted IS FALSE AND bank_artifact_generated IS FALSE
    AND government_artifact_generated IS FALSE AND fiscal_artifact_generated IS FALSE
  )
);


CREATE INDEX payroll_parameter_event_timeline_idx ON public.payroll_parameter_event(tenant_id,proposal_id,id);
CREATE OR REPLACE FUNCTION public.payroll_parameter_flags_v1(p_proposal_approved boolean)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('proposalApproved',COALESCE(p_proposal_approved,false),'grhMutation',false,
   'payrollCalculated',false,'payrollPosted',false,'currentCatalogVerified',false)
$$;

CREATE OR REPLACE FUNCTION public.payroll_parameter_build_draft_v1(p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 rule_id text; base_value bigint; computed bigint; allowed integer[]; selected integer[];
 auxiliary integer; base_class text; reference_concept integer; row_value jsonb; rows_value jsonb;
BEGIN
 IF jsonb_typeof(p_draft) IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_draft) key) IS DISTINCT FROM
     ARRAY['agreementIds','baseAmountCents','rounding','ruleId','sourceReference','validFrom']::text[]
   OR jsonb_typeof(p_draft->'ruleId') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_draft->'baseAmountCents') IS DISTINCT FROM 'string'
   OR COALESCE(p_draft->>'baseAmountCents','') !~ '^[1-9][0-9]{0,10}$'
   OR jsonb_typeof(p_draft->'validFrom') IS DISTINCT FROM 'string'
   OR COALESCE(p_draft->>'validFrom','') !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
   OR jsonb_typeof(p_draft->'sourceReference') IS DISTINCT FROM 'string'
   OR length(COALESCE(p_draft->>'sourceReference','')) NOT BETWEEN 1 AND 180
   OR btrim(p_draft->>'sourceReference') IS DISTINCT FROM p_draft->>'sourceReference'
   OR (p_draft->>'sourceReference') ~ '[<>[:cntrl:]]'
   OR jsonb_typeof(p_draft->'rounding') IS DISTINCT FROM 'string'
   OR COALESCE(p_draft->>'rounding','') NOT IN ('nearest_cent','truncate_cent')
   OR jsonb_typeof(p_draft->'agreementIds') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'PAYROLL_PARAMETER_DRAFT_INVALID' USING ERRCODE='P0001';
 END IF;
 IF jsonb_array_length(p_draft->'agreementIds') NOT BETWEEN 1 AND 3 THEN
   RAISE EXCEPTION 'PAYROLL_PARAMETER_DRAFT_INVALID' USING ERRCODE='P0001';
 END IF;
 rule_id:=p_draft->>'ruleId'; base_value:=(p_draft->>'baseAmountCents')::bigint;
 IF rule_id='aux88-class6d' THEN allowed:=ARRAY[1,4,6]; auxiliary:=88; base_class:='6-D'; reference_concept:=24; computed:=base_value;
 ELSIF rule_id='aux90-class3a' THEN allowed:=ARRAY[1,4,6]; auxiliary:=90; base_class:='3-A'; computed:=base_value;
 ELSIF rule_id='aux88-class13i-150' THEN allowed:=ARRAY[2,7,11]; auxiliary:=88; base_class:='13-I';
   computed:=(base_value*3)/2 + CASE WHEN p_draft->>'rounding'='nearest_cent' AND (base_value*3)%2=1 THEN 1 ELSE 0 END;
 ELSE RAISE EXCEPTION 'PAYROLL_PARAMETER_RULE_INVALID' USING ERRCODE='P0001'; END IF;
 IF computed NOT BETWEEN 1 AND 99999999999 THEN
   RAISE EXCEPTION 'PAYROLL_PARAMETER_AMOUNT_INVALID' USING ERRCODE='P0001';
 END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(p_draft->'agreementIds') LOOP
   IF jsonb_typeof(row_value) IS DISTINCT FROM 'number' OR row_value::text !~ '^[1-9][0-9]?$'
     OR NOT ((row_value::text)::integer=ANY(allowed)) THEN
     RAISE EXCEPTION 'PAYROLL_PARAMETER_AGREEMENT_INVALID' USING ERRCODE='P0001';
   END IF;
 END LOOP;
 SELECT array_agg(value::integer ORDER BY value::integer) INTO selected FROM jsonb_array_elements_text(p_draft->'agreementIds');
 IF (SELECT count(DISTINCT x) FROM unnest(selected) x) <> cardinality(selected)
   OR to_jsonb(selected) <> p_draft->'agreementIds' THEN
   RAISE EXCEPTION 'PAYROLL_PARAMETER_AGREEMENT_INVALID' USING ERRCODE='P0001';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('agreementId',x,'auxiliaryId',auxiliary,'baseClass',base_class,
   'newValueCents',computed::text,'referenceConceptId',reference_concept) ORDER BY x) INTO rows_value FROM unnest(selected) x;
 RETURN p_draft || jsonb_build_object('rows',rows_value,
   'sourceSha256','fcb490b08bd83cdd1aa392a0c99a20f01637107ff0ef4bfdb67c083de1802169',
   'currentCatalogVerified',false,'applied',false);
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_parameter_guard_proposal_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_DELETE_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.status <> 'prepared' OR NEW.version <> 1 THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_CHANGE_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 ELSE
   IF (to_jsonb(NEW) - ARRAY['status','version','reason_code','reason_reference','decided_by_membership_id','decided_by_person_id','proposal_approved','updated_at','submitted_at','decided_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','reason_code','reason_reference','decided_by_membership_id','decided_by_person_id','proposal_approved','updated_at','submitted_at','decided_at'])
     OR NEW.version <> OLD.version+1
     OR NOT ((OLD.status='prepared' AND NEW.status IN ('submitted','cancelled'))
       OR (OLD.status='submitted' AND NEW.status IN ('approved','rejected','cancelled')))
     OR (OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN
     RAISE EXCEPTION 'PAYROLL_PARAMETER_CHANGE_FORBIDDEN' USING ERRCODE='P0001';
   END IF;
 END IF;
 IF NEW.draft IS DISTINCT FROM public.payroll_parameter_build_draft_v1(NEW.draft - ARRAY['rows','sourceSha256','currentCatalogVerified','applied'])
   OR NEW.period_month IS DISTINCT FROM ((NEW.draft->>'validFrom')||'-01')::date
   OR NEW.draft_sha256 IS DISTINCT FROM encode(digest(convert_to(NEW.draft::text,'UTF8'),'sha256'),'hex') THEN
   RAISE EXCEPTION 'PAYROLL_PARAMETER_DRAFT_INVALID' USING ERRCODE='P0001';
 END IF;
 IF NEW.decided_by_membership_id=NEW.prepared_by_membership_id OR NEW.decided_by_person_id=NEW.prepared_by_person_id THEN
   RAISE EXCEPTION 'PAYROLL_PARAMETER_MAKER_CHECKER_REQUIRED' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_reject_event_change_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'PAYROLL_PARAMETER_EVENT_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_hash_event_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.event_sha256 := encode(digest(convert_to(jsonb_build_object(
    'tenantId', NEW.tenant_id::text,
    'proposalId', NEW.proposal_id::text,
    'bindingId', NEW.certified_binding_id::text,
    'membershipId', NEW.actor_membership_id::text,
    'personId', NEW.actor_person_id::text,
    'roleKey', NEW.actor_role_key,
    'authorityCapabilityKey', NEW.authority_capability_key,
    'sessionId', NEW.actor_session_id::text,
    'sessionVersion', NEW.actor_session_version,
    'releaseSha', NEW.release_sha,
    'command', NEW.command,
    'fromStatus', NEW.from_status,
    'toStatus', NEW.to_status,
    'expectedVersion', NEW.expected_version,
    'resultingVersion', NEW.resulting_version,
    'reasonCode', NEW.reason_code,
    'reasonReference', NEW.reason_reference,
    'idempotencyKey', NEW.idempotency_key::text,
    'commandHash', NEW.command_hash,
    'occurredAt', to_char(
      NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'proposalApproved', NEW.proposal_approved,
    'includesPersonalRecords', false,
    'rawContentStored', false,
    'grhMutation', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'bankArtifactGenerated', false,
    'governmentArtifactGenerated', false,
    'fiscalArtifactGenerated', false
  )::text, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_assert_context_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_context) key)
       IS DISTINCT FROM ARRAY[
         'actorEmail','actorSessionId','actorSessionVersion',
         'membershipId','releaseSha','tenantId'
       ]::text[]
     OR p_required_capability IS NULL OR p_required_capability NOT IN (
       'payroll.parameter.read','payroll.parameter.prepare',
       'payroll.parameter.approve','payroll.parameter.audit.read'
     ) THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.action_center_assert_tenant_read_session_v2(
    p_context->>'actorEmail',
    (p_context->>'actorSessionId')::uuid,
    (p_context->>'actorSessionVersion')::integer,
    lower(p_context->>'releaseSha'),
    (p_context->>'tenantId')::uuid,
    (p_context->>'membershipId')::uuid
  );
  IF NOT public.action_center_context_has_capability(context_value, p_required_capability) THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN context_value || jsonb_build_object(
    'actorSessionId', p_context->>'actorSessionId',
    'actorSessionVersion', (p_context->>'actorSessionVersion')::integer,
    'certifiedBindingId', context_value->>'sourceBindingId',
    'employmentLinked', context_value->>'actorPersonId' IS NOT NULL,
    'releaseSha', lower(p_context->>'releaseSha')
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;
CREATE TRIGGER payroll_parameter_proposal_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_parameter_proposal
 FOR EACH ROW EXECUTE FUNCTION public.payroll_parameter_guard_proposal_v1();
CREATE TRIGGER payroll_parameter_event_hash_v1 BEFORE INSERT ON public.payroll_parameter_event
 FOR EACH ROW EXECUTE FUNCTION public.payroll_parameter_hash_event_v1();
CREATE TRIGGER payroll_parameter_event_append_only_v1 BEFORE UPDATE OR DELETE ON public.payroll_parameter_event
 FOR EACH ROW EXECUTE FUNCTION public.payroll_parameter_reject_event_change_v1();
CREATE OR REPLACE FUNCTION public.payroll_parameter_snapshot_v1(
  p_proposal_id uuid,
  p_tenant_id uuid,
  p_include_sources boolean,
  p_include_audit boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', item.id,
    'contractVersion', item.contract_version,
    'status',item.status,'version',item.version,'draft',item.draft,
    'reasonCode',item.reason_code,'reasonReference',item.reason_reference,
    'preparedByMembershipId',item.prepared_by_membership_id,
    'createdAt', item.created_at,
    'updatedAt', item.updated_at,
    'submittedAt', item.submitted_at,
    'decidedAt', item.decided_at,
    'timeline', CASE WHEN p_include_audit THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'command', event.command,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'expectedVersion', event.expected_version,
        'resultingVersion', event.resulting_version,
        'reasonCode', event.reason_code,
        'reasonReference', event.reason_reference,
        'actorRoleKey', event.actor_role_key,
        'eventSha256', event.event_sha256,
        'occurredAt', event.occurred_at
      ) ORDER BY event.id)
      FROM public.payroll_parameter_event event
      WHERE event.proposal_id = item.id AND event.tenant_id = item.tenant_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  FROM public.payroll_parameter_proposal item
  WHERE item.id = p_proposal_id AND item.tenant_id = p_tenant_id
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_event_result_v1(
  p_event_id bigint,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'replayed', false,
    'eventId', event.id,
    'eventSha256', event.event_sha256,
    'proposal', public.payroll_parameter_snapshot_v1(
      event.proposal_id, event.tenant_id, true, true
    ),
    'flags', public.payroll_parameter_flags_v1(run.proposal_approved)
  )
  FROM public.payroll_parameter_event event
  JOIN public.payroll_parameter_proposal run
    ON run.id = event.proposal_id AND run.tenant_id = event.tenant_id
  WHERE event.id = p_event_id AND event.tenant_id = p_tenant_id
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_attempt_v1(
  p_context jsonb,
  p_idempotency uuid,
  p_command text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  event_row public.payroll_parameter_event%ROWTYPE;
  required_capability text;
BEGIN
  IF p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_command IS NULL OR p_command NOT IN ('prepare','submit','approve','reject','cancel') THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_ATTEMPT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject')
    THEN 'payroll.parameter.approve' ELSE 'payroll.parameter.prepare' END;
  context_value := public.payroll_parameter_assert_context_v1(
    p_context, required_capability
  );
  SELECT * INTO event_row FROM public.payroll_parameter_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
    AND event.command = p_command;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_ATTEMPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF event_row.certified_binding_id <>
       (context_value->>'certifiedBindingId')::uuid
     OR event_row.actor_session_id <> (context_value->>'actorSessionId')::uuid
     OR event_row.actor_session_version <>
       (context_value->>'actorSessionVersion')::integer
     OR event_row.release_sha <> lower(context_value->>'releaseSha')
     OR event_row.actor_person_id IS DISTINCT FROM
       (context_value->>'actorPersonId')::uuid
     OR event_row.actor_role_key <> context_value->>'roleKey'
     OR event_row.authority_capability_key <> required_capability THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_ATTEMPT_CONTEXT_CHANGED'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN public.payroll_parameter_event_result_v1(
    event_row.id, event_row.tenant_id
  ) || jsonb_build_object('replayed', true);
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  runs_value jsonb;
  events_value jsonb;
  capabilities_value jsonb;
BEGIN
  context_value := public.payroll_parameter_assert_context_v1(
    p_context, 'payroll.parameter.read'
  );
  SELECT COALESCE(jsonb_agg(public.payroll_parameter_snapshot_v1(
      recent.id, recent.tenant_id, false, false
    ) ORDER BY recent.period_month DESC, recent.created_at DESC), '[]'::jsonb)
    INTO runs_value
  FROM (
    SELECT item.* FROM public.payroll_parameter_proposal item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY item.period_month DESC, item.created_at DESC LIMIT 20
  ) recent;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', recent.id, 'proposalId', recent.proposal_id, 'command', recent.command,
      'toStatus', recent.to_status, 'eventSha256', recent.event_sha256,
      'occurredAt', recent.occurred_at
    ) ORDER BY recent.id DESC), '[]'::jsonb) INTO events_value
  FROM (
    SELECT event.* FROM public.payroll_parameter_event event
    WHERE event.tenant_id = (context_value->>'tenantId')::uuid
      AND event.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY event.id DESC LIMIT 20
  ) recent;
  SELECT COALESCE(jsonb_agg(capability.value ORDER BY capability.value), '[]'::jsonb)
    INTO capabilities_value
  FROM jsonb_array_elements_text(context_value->'capabilities') capability(value)
  WHERE capability.value LIKE 'payroll.parameter.%';
  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'certifiedBindingId', context_value->>'certifiedBindingId',
      'roleKey', context_value->>'roleKey',
      'employmentLinked', (context_value->>'employmentLinked')::boolean,
      'capabilities', capabilities_value
    ),
    'limits',jsonb_build_object('contractVersion','payroll-parameter-proposal-governed.v1',
      'maxAmountCents','99999999999','ruleIds',jsonb_build_array('aux88-class6d','aux90-class3a','aux88-class13i-150'),
      'sourceSha256','fcb490b08bd83cdd1aa392a0c99a20f01637107ff0ef4bfdb67c083de1802169',
      'agreementIds',jsonb_build_array(1,2,4,6,7,11)),
    'proposals', runs_value,
    'recentEvents', CASE WHEN context_value->'capabilities'
      ? 'payroll.parameter.audit.read' THEN events_value ELSE '[]'::jsonb END,
    'flags', public.payroll_parameter_flags_v1(false)
  );
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_list_v1(
  p_context jsonb,
  p_status text,
  p_page integer,
  p_limit integer,
  p_period text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  total_value bigint;
  runs_value jsonb;
BEGIN
  IF p_status IS NULL OR p_page IS NULL OR p_limit IS NULL OR p_period IS NULL
     OR (p_period <> '' AND p_period !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$')
     OR p_status NOT IN ('all','prepared','submitted','approved','rejected','cancelled')
     OR p_page NOT BETWEEN 1 AND 10000 OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_LIST_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_parameter_assert_context_v1(
    p_context, 'payroll.parameter.read'
  );
  SELECT count(*) INTO total_value FROM public.payroll_parameter_proposal item
  WHERE item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    AND (p_status = 'all' OR item.status = p_status)
    AND (p_period = '' OR item.draft->>'validFrom' = p_period);
  SELECT COALESCE(jsonb_agg(public.payroll_parameter_snapshot_v1(
      selected.id, selected.tenant_id, false, false
    ) ORDER BY selected.period_month DESC, selected.created_at DESC), '[]'::jsonb)
    INTO runs_value
  FROM (
    SELECT item.* FROM public.payroll_parameter_proposal item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND (p_status = 'all' OR item.status = p_status)
      AND (p_period = '' OR item.draft->>'validFrom' = p_period)
    ORDER BY item.period_month DESC, item.created_at DESC
    OFFSET (p_page - 1) * p_limit LIMIT p_limit
  ) selected;
  RETURN jsonb_build_object(
    'proposals', runs_value, 'total', total_value, 'page', p_page, 'limit', p_limit,
    'flags', public.payroll_parameter_flags_v1(false)
  );
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_detail_v1(
  p_context jsonb,
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  proposal_row public.payroll_parameter_proposal%ROWTYPE;
  commands_value jsonb := '[]'::jsonb;
BEGIN
  IF p_proposal_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_DETAIL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_parameter_assert_context_v1(
    p_context, 'payroll.parameter.read'
  );
  SELECT * INTO proposal_row FROM public.payroll_parameter_proposal item
  WHERE item.id = p_proposal_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF proposal_row.status = 'prepared'
     AND context_value->'capabilities' ? 'payroll.parameter.prepare'
     AND proposal_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid THEN
    commands_value := jsonb_build_array('submit','cancel');
  ELSIF proposal_row.status = 'submitted'
     AND context_value->'capabilities' ? 'payroll.parameter.prepare'
     AND proposal_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid THEN
    commands_value := jsonb_build_array('cancel');
  ELSIF proposal_row.status = 'submitted'
     AND context_value->'capabilities' ? 'payroll.parameter.approve'
     AND (context_value->>'employmentLinked')::boolean
     AND proposal_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
     AND (proposal_row.prepared_by_person_id IS NULL OR
       proposal_row.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid) THEN
    commands_value := jsonb_build_array('approve','reject');
  END IF;
  RETURN jsonb_build_object(
    'proposal', public.payroll_parameter_snapshot_v1(
      proposal_row.id, proposal_row.tenant_id, true,
      context_value->'capabilities' ? 'payroll.parameter.audit.read'
    ) || jsonb_build_object('allowedCommands', commands_value),
    'flags', public.payroll_parameter_flags_v1(proposal_row.proposal_approved)
  );
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_prepare_v1(
 p_context jsonb,p_binding_id uuid,p_draft jsonb,p_idempotency uuid,p_command_hash text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE context_value jsonb; draft_value jsonb; existing_event public.payroll_parameter_event%ROWTYPE;
 proposal_id_value uuid; event_id_value bigint;
BEGIN
 IF p_binding_id IS NULL OR p_idempotency IS NULL OR p_idempotency::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR COALESCE(p_command_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_PREPARE_INVALID' USING ERRCODE='P0001'; END IF;
 draft_value:=public.payroll_parameter_build_draft_v1(p_draft);
 context_value:=public.payroll_parameter_assert_context_v1(p_context,'payroll.parameter.prepare');
 IF context_value->>'actorPersonId' IS NULL THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
 IF p_binding_id <> (context_value->>'certifiedBindingId')::uuid THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_BINDING_CHANGED' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text, 0
  ));
  SELECT * INTO existing_event FROM public.payroll_parameter_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency FOR SHARE;
  IF FOUND THEN
    IF existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_BINDING_CHANGED' USING ERRCODE = 'P0001';
    END IF;
    IF existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR existing_event.release_sha <> lower(context_value->>'releaseSha')
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> 'payroll.parameter.prepare'
       OR existing_event.command <> 'prepare'
       OR existing_event.command_hash <> lower(p_command_hash)
       OR (SELECT draft FROM public.payroll_parameter_proposal WHERE id=existing_event.proposal_id
            AND tenant_id=existing_event.tenant_id) IS DISTINCT FROM draft_value THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_parameter_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || p_binding_id::text
      || ':' || encode(digest(convert_to(draft_value::text,'UTF8'),'sha256'),'hex'), 0
  ));

 INSERT INTO public.payroll_parameter_proposal(tenant_id,certified_binding_id,release_sha,draft,draft_sha256,period_month,
   prepared_by_membership_id,prepared_by_person_id)
 VALUES((context_value->>'tenantId')::uuid,p_binding_id,lower(context_value->>'releaseSha'),draft_value,
   encode(digest(convert_to(draft_value::text,'UTF8'),'sha256'),'hex'),((p_draft->>'validFrom')||'-01')::date,
   (context_value->>'membershipId')::uuid,(context_value->>'actorPersonId')::uuid) RETURNING id INTO proposal_id_value;
 INSERT INTO public.payroll_parameter_event(tenant_id,proposal_id,certified_binding_id,actor_membership_id,actor_person_id,
   actor_role_key,authority_capability_key,actor_session_id,actor_session_version,release_sha,command,from_status,to_status,
   expected_version,resulting_version,reason_code,reason_reference,idempotency_key,command_hash,proposal_approved)
 VALUES((context_value->>'tenantId')::uuid,proposal_id_value,p_binding_id,(context_value->>'membershipId')::uuid,
   (context_value->>'actorPersonId')::uuid,context_value->>'roleKey','payroll.parameter.prepare',
   (context_value->>'actorSessionId')::uuid,(context_value->>'actorSessionVersion')::integer,lower(context_value->>'releaseSha'),
   'prepare',NULL,'prepared',0,1,'parameters_prepared',NULL,p_idempotency,p_command_hash,false) RETURNING id INTO event_id_value;
 RETURN public.payroll_parameter_event_result_v1(event_id_value,(context_value->>'tenantId')::uuid);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PAYROLL_PARAMETER_DUPLICATE_PROPOSAL' USING ERRCODE='P0001';
END
$$;
CREATE OR REPLACE FUNCTION public.payroll_parameter_transition_v1(
  p_context jsonb,
  p_proposal_id uuid,
  p_command text,
  p_expected_version integer,
  p_reason_code text,
  p_reason_reference text,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  proposal_row public.payroll_parameter_proposal%ROWTYPE;
  existing_event public.payroll_parameter_event%ROWTYPE;
  required_capability text;
  next_status text;
  approved_value boolean := false;
  event_id_value bigint;
BEGIN
  IF p_proposal_id IS NULL OR p_command IS NULL OR p_reason_code IS NULL OR p_command NOT IN ('submit','approve','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR COALESCE(p_reason_reference,'') !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (p_command = 'submit' AND p_reason_code <> 'ready_for_review')
     OR (p_command = 'approve' AND p_reason_code <> 'approved_by_checker')
     OR (p_command = 'reject' AND p_reason_code NOT IN (
       'source_mismatch','evidence_insufficient','period_not_ready'
     )) OR (p_command = 'cancel' AND p_reason_code <> 'cancelled_by_preparer') THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject')
    THEN 'payroll.parameter.approve' ELSE 'payroll.parameter.prepare' END;
  context_value := public.payroll_parameter_assert_context_v1(
    p_context, required_capability
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text, 0
  ));
  SELECT * INTO existing_event FROM public.payroll_parameter_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency FOR SHARE;
  IF FOUND THEN
    IF existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_BINDING_CHANGED' USING ERRCODE = 'P0001';
    END IF;
    IF existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR existing_event.release_sha <> lower(context_value->>'releaseSha')
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.proposal_id <> p_proposal_id OR existing_event.command <> p_command
       OR existing_event.command_hash <> lower(p_command_hash)
       OR existing_event.expected_version <> p_expected_version
       OR existing_event.reason_code IS DISTINCT FROM p_reason_code
       OR existing_event.reason_reference IS DISTINCT FROM p_reason_reference THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_parameter_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO proposal_row FROM public.payroll_parameter_proposal item
  WHERE item.id = p_proposal_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF proposal_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IN ('submit','cancel') THEN
    IF proposal_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR proposal_row.prepared_by_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF (p_command = 'submit' AND proposal_row.status <> 'prepared')
       OR (p_command = 'cancel' AND proposal_row.status NOT IN ('prepared','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF proposal_row.status <> 'submitted' THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT (context_value->>'employmentLinked')::boolean THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF proposal_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (proposal_row.prepared_by_person_id IS NOT NULL AND
         proposal_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

  END IF;
  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled' END;
  approved_value := p_command = 'approve';
  UPDATE public.payroll_parameter_proposal item SET
    status = next_status,
    version = item.version + 1,
    reason_code = p_reason_code,
    reason_reference = p_reason_reference,
    decided_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    decided_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    proposal_approved = approved_value,
    submitted_at = CASE WHEN p_command = 'submit' THEN now() ELSE item.submitted_at END,
    decided_at = CASE WHEN p_command = 'submit' THEN NULL ELSE now() END,
    updated_at = now()
  WHERE item.id = proposal_row.id;
  INSERT INTO public.payroll_parameter_event (
    tenant_id, proposal_id, certified_binding_id, actor_membership_id,
    actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha, command,
    from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash, proposal_approved
  ) VALUES (
    proposal_row.tenant_id, proposal_row.id, proposal_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid, context_value->>'roleKey',
    required_capability, (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'), p_command, proposal_row.status,
    next_status, proposal_row.version, proposal_row.version + 1, p_reason_code,
    p_reason_reference, p_idempotency, lower(p_command_hash), approved_value
  ) RETURNING id INTO event_id_value;
  RETURN public.payroll_parameter_event_result_v1(event_id_value, proposal_row.tenant_id);
END
$$;
REVOKE ALL PRIVILEGES ON TABLE public.payroll_parameter_proposal,public.payroll_parameter_event FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON SEQUENCE public.payroll_parameter_event_id_seq FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_flags_v1(boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_build_draft_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_guard_proposal_v1() FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_reject_event_change_v1() FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_hash_event_v1() FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_assert_context_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_snapshot_v1(uuid,uuid,boolean,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_event_result_v1(bigint,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_attempt_v1(jsonb,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_bootstrap_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_list_v1(jsonb,text,integer,integer,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_detail_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_prepare_v1(jsonb,uuid,jsonb,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_parameter_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_parameter_attempt_v1(jsonb,uuid,text) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_parameter_bootstrap_v1(jsonb) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_parameter_list_v1(jsonb,text,integer,integer,text) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_parameter_detail_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_parameter_prepare_v1(jsonb,uuid,jsonb,uuid,text) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_parameter_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text) TO municontrol_actions_runtime_app;
