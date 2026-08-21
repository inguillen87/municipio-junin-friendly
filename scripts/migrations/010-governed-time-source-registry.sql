-- MuniControl Friendly - Sprint 010A
-- Registro gobernado de fuentes temporales. No evalua jornadas, no calcula
-- minutos ni importes y no modifica GRH, payroll ni action_case.

INSERT INTO iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  ('time.source.read', 'Consultar fuentes temporales',
   'Consulta metadatos gobernados y readiness, sin datos nominales ni calculos.', 'tenant', 'standard'),
  ('time.source.propose', 'Proponer fuentes temporales',
   'Prepara y presenta metadatos de una fuente temporal para revision humana.', 'tenant', 'privileged'),
  ('time.source.approve', 'Aprobar fuentes temporales',
   'Aprueba, rechaza o retira una fuente propuesta por otra persona.', 'tenant', 'restricted'),
  ('time.source.audit.read', 'Auditar fuentes temporales',
   'Consulta la secuencia gobernada de cambios sin datos personales.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES (
  'time.source.approve', 'time.source.propose',
  'La propuesta y la aprobacion de fuentes temporales deben estar separadas.'
)
ON CONFLICT (capability_key, conflicts_with_key)
DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES (
  'time.overtime.post', 'time.source.approve',
  'La aprobacion de fuentes temporales y el impacto de mayor esfuerzo deben estar separados.'
)
ON CONFLICT (capability_key, conflicts_with_key)
DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO iam_role (
  role_key, label, description, scope_kind, system_managed
) VALUES
  ('JUNIN_TIEMPO_FUENTES_PROPONENTE', 'Tiempo y asistencia - proponente de fuentes',
   'Registra metadatos y presenta fuentes temporales; no las aprueba.', 'tenant', true),
  ('JUNIN_TIEMPO_FUENTES_APROBADOR', 'Tiempo y asistencia - aprobador de fuentes',
   'Revisa fuentes propuestas por otra persona y consulta su auditoria.', 'tenant', true)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  system_managed = EXCLUDED.system_managed;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('JUNIN_TIEMPO_FUENTES_PROPONENTE', 'time.source.read'),
  ('JUNIN_TIEMPO_FUENTES_PROPONENTE', 'time.source.propose'),
  ('JUNIN_TIEMPO_FUENTES_APROBADOR', 'time.source.read'),
  ('JUNIN_TIEMPO_FUENTES_APROBADOR', 'time.source.approve'),
  ('JUNIN_TIEMPO_FUENTES_APROBADOR', 'time.source.audit.read')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION time_source_reason_allowed_v1(
  p_command text,
  p_reason_code text
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(CASE p_command
    WHEN 'create_draft' THEN p_reason_code IN ('source_onboarding')
    WHEN 'update_draft' THEN p_reason_code IN ('metadata_correction')
    WHEN 'submit' THEN p_reason_code IN ('ready_for_review')
    WHEN 'approve' THEN p_reason_code IN ('evidence_verified')
    WHEN 'reject' THEN p_reason_code IN (
      'insufficient_evidence', 'metadata_invalid', 'source_not_authoritative'
    )
    WHEN 'retire' THEN p_reason_code IN ('superseded', 'source_retired', 'binding_changed')
    WHEN 'cancel' THEN p_reason_code IN ('entered_in_error', 'withdrawn')
    ELSE false
  END, false)
$$;

CREATE OR REPLACE FUNCTION time_source_metadata_row_valid_v1(
  p_domain text,
  p_owner_authority text,
  p_owner_code text,
  p_system_locator text,
  p_source_format text,
  p_schema_version text,
  p_artifact_sha256 text,
  p_cut_at timestamptz,
  p_coverage_from date,
  p_coverage_to date,
  p_timezone text,
  p_grain text,
  p_identity_key_kind text,
  p_record_count bigint
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    p_domain IN (
      'shift_assignment', 'time_punch', 'holiday_calendar',
      'municipal_rule_profile', 'administrative_event', 'employment_master_reference'
    )
    AND p_owner_authority IN (
      'municipal_human_resources', 'municipal_it', 'municipal_payroll',
      'provincial_authority', 'national_authority', 'certified_external_provider'
    )
    AND p_owner_code = p_owner_authority
    AND p_system_locator ~ '^registry\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND p_source_format IN ('csv','json','jsonl','parquet','postgres_relation','fixed_width')
    AND p_schema_version ~ '^v[1-9][0-9]{0,3}(?:\.[0-9]{1,4}){0,2}$'
    AND p_artifact_sha256 ~ '^[a-f0-9]{64}$'
    AND p_cut_at IS NOT NULL
    AND p_coverage_from IS NOT NULL
    AND p_coverage_to IS NOT NULL
    AND p_coverage_from <= p_coverage_to
    AND p_timezone = 'America/Argentina/Mendoza'
    AND (p_record_count IS NULL OR p_record_count >= 0)
    AND CASE p_domain
      WHEN 'shift_assignment' THEN
        p_grain = 'employee_shift_day'
        AND p_identity_key_kind IN ('employment_contract_id','legacy_legajo','source_employee_key')
      WHEN 'time_punch' THEN
        p_grain = 'employee_punch_event'
        AND p_identity_key_kind IN ('employment_contract_id','legacy_legajo','source_employee_key')
      WHEN 'holiday_calendar' THEN
        p_grain = 'calendar_day'
        AND p_identity_key_kind IN ('calendar_date','none')
      WHEN 'municipal_rule_profile' THEN
        p_grain = 'municipal_rule_version'
        AND p_identity_key_kind IN ('tenant_policy_key','none')
      WHEN 'administrative_event' THEN
        p_grain = 'employee_administrative_event'
        AND p_identity_key_kind IN ('employment_contract_id','legacy_legajo','source_employee_key')
      WHEN 'employment_master_reference' THEN
        p_grain = 'employment_contract_reference'
        AND p_identity_key_kind IN ('employment_contract_id','legacy_legajo','source_employee_key')
      ELSE false
    END
$$;

CREATE OR REPLACE FUNCTION time_source_metadata_json_valid_v1(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  expected_keys text[] := ARRAY[
    'artifactSha256','coverageFrom','coverageTo','cutAt','domain','format',
    'grain','identityKeyKind','ownerAuthority','schemaVersion','timezone'
  ];
  actual_keys text[];
  record_count_value bigint;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  SELECT array_agg(key ORDER BY key) INTO actual_keys FROM jsonb_object_keys(p_payload) key;
  IF actual_keys IS DISTINCT FROM expected_keys
     AND actual_keys IS DISTINCT FROM ARRAY[
       'artifactSha256','coverageFrom','coverageTo','cutAt','domain','format',
       'grain','identityKeyKind','ownerAuthority','recordCount','schemaVersion','timezone'
     ]::text[] THEN
    RETURN false;
  END IF;
  IF p_payload ? 'recordCount' THEN
    IF jsonb_typeof(p_payload->'recordCount') IS DISTINCT FROM 'number'
       OR p_payload->>'recordCount' !~ '^(0|[1-9][0-9]*)$' THEN RETURN false; END IF;
    record_count_value := (p_payload->>'recordCount')::bigint;
  END IF;
  IF p_payload->>'cutAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]Z$'
     OR p_payload->>'coverageFrom' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR p_payload->>'coverageTo' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(expected_keys) required(key)
    WHERE jsonb_typeof(p_payload->required.key) IS DISTINCT FROM 'string'
  ) THEN RETURN false; END IF;
  RETURN time_source_metadata_row_valid_v1(
    p_payload->>'domain', p_payload->>'ownerAuthority', p_payload->>'ownerAuthority',
    'registry.00000000-0000-4000-8000-000000000000',
    p_payload->>'format', p_payload->>'schemaVersion',
    lower(p_payload->>'artifactSha256'), (p_payload->>'cutAt')::timestamptz,
    (p_payload->>'coverageFrom')::date, (p_payload->>'coverageTo')::date,
    p_payload->>'timezone', p_payload->>'grain', p_payload->>'identityKeyKind',
    record_count_value
  );
EXCEPTION WHEN others THEN
  RETURN false;
END
$$;

CREATE TABLE IF NOT EXISTS time_source_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  certified_binding_id uuid NOT NULL,
  domain varchar(40) NOT NULL,
  owner_authority varchar(40) NOT NULL,
  owner_code varchar(64) NOT NULL,
  system_locator varchar(96) NOT NULL,
  source_format varchar(32) NOT NULL,
  schema_version varchar(32) NOT NULL,
  artifact_sha256 char(64) NOT NULL,
  cut_at timestamptz NOT NULL,
  coverage_from date NOT NULL,
  coverage_to date NOT NULL,
  timezone varchar(64) NOT NULL,
  grain varchar(48) NOT NULL,
  identity_key_kind varchar(40) NOT NULL,
  record_count bigint,
  status varchar(16) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  proposer_person_id uuid NOT NULL REFERENCES person_identity(id) ON DELETE RESTRICT,
  proposer_membership_id uuid NOT NULL,
  approver_person_id uuid REFERENCES person_identity(id) ON DELETE RESTRICT,
  approver_membership_id uuid,
  reason_code varchar(64) NOT NULL,
  reason_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  retired_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT time_source_contract_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT time_source_contract_id_tenant_binding_uk
    UNIQUE (id, tenant_id, certified_binding_id),
  CONSTRAINT time_source_contract_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT time_source_contract_proposer_membership_fk
    FOREIGN KEY (proposer_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT time_source_contract_approver_membership_fk
    FOREIGN KEY (approver_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT time_source_contract_metadata_ck CHECK (time_source_metadata_row_valid_v1(
    domain, owner_authority, owner_code, system_locator, source_format,
    schema_version, artifact_sha256, cut_at, coverage_from, coverage_to,
    timezone, grain, identity_key_kind, record_count
  )),
  CONSTRAINT time_source_contract_status_ck CHECK (
    status IN ('draft','submitted','approved','rejected','retired','cancelled')
  ),
  CONSTRAINT time_source_contract_version_ck CHECK (version > 0),
  CONSTRAINT time_source_contract_reason_ck CHECK (
    reason_code IN (
      'source_onboarding','metadata_correction','ready_for_review','evidence_verified',
      'insufficient_evidence','metadata_invalid','source_not_authoritative',
      'superseded','source_retired','binding_changed','entered_in_error','withdrawn'
    ) AND reason_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT time_source_contract_approver_pair_ck CHECK (
    (approver_person_id IS NULL AND approver_membership_id IS NULL)
    OR (approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
  ),
  CONSTRAINT time_source_contract_maker_checker_ck CHECK (
    approver_person_id IS NULL
    OR (approver_person_id <> proposer_person_id
      AND approver_membership_id <> proposer_membership_id)
  ),
  CONSTRAINT time_source_contract_state_ck CHECK (
    (status = 'draft' AND submitted_at IS NULL AND decided_at IS NULL
      AND retired_at IS NULL AND cancelled_at IS NULL
      AND approver_person_id IS NULL AND approver_membership_id IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND retired_at IS NULL AND cancelled_at IS NULL
      AND approver_person_id IS NULL AND approver_membership_id IS NULL)
    OR (status IN ('approved','rejected') AND submitted_at IS NOT NULL
      AND decided_at IS NOT NULL AND retired_at IS NULL AND cancelled_at IS NULL
      AND approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
    OR (status = 'retired' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
      AND retired_at IS NOT NULL AND cancelled_at IS NULL
      AND approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
    OR (status = 'cancelled' AND decided_at IS NULL AND retired_at IS NULL
      AND cancelled_at IS NOT NULL
      AND approver_person_id IS NULL AND approver_membership_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS time_source_contract_tenant_list_idx
  ON time_source_contract (tenant_id, status, domain, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS time_source_contract_readiness_idx
  ON time_source_contract (tenant_id, domain, status, coverage_from, coverage_to, updated_at DESC);

CREATE TABLE IF NOT EXISTS time_source_governance_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL,
  contract_certified_binding_id uuid NOT NULL,
  actor_certified_binding_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_id uuid NOT NULL REFERENCES person_identity(id) ON DELETE RESTRICT,
  actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  actor_session_version integer NOT NULL,
  release_sha char(40) NOT NULL,
  command varchar(32) NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  expected_version integer NOT NULL,
  resulting_version integer NOT NULL,
  reason_code varchar(64) NOT NULL,
  reason_hash char(64) NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_source_governance_event_contract_fk
    FOREIGN KEY (contract_id, tenant_id, contract_certified_binding_id)
    REFERENCES time_source_contract(id, tenant_id, certified_binding_id) ON DELETE RESTRICT,
  CONSTRAINT time_source_governance_event_contract_binding_fk
    FOREIGN KEY (tenant_id, contract_certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT time_source_governance_event_actor_binding_fk
    FOREIGN KEY (tenant_id, actor_certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT time_source_governance_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT time_source_governance_event_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT time_source_governance_event_command_ck CHECK (
    command IN ('create_draft','update_draft','submit','approve','reject','retire','cancel')
  ),
  CONSTRAINT time_source_governance_event_context_ck CHECK (
    actor_session_version > 0
    AND release_sha ~ '^[a-f0-9]{40}$'
    AND command_hash ~ '^[a-f0-9]{64}$'
    AND reason_hash ~ '^[a-f0-9]{64}$'
    AND expected_version >= 0
    AND resulting_version = expected_version + 1
    AND ((command = 'create_draft' AND expected_version = 0)
      OR (command <> 'create_draft' AND expected_version > 0))
    AND time_source_reason_allowed_v1(command, reason_code)
  ),
  CONSTRAINT time_source_governance_event_json_ck CHECK (
    jsonb_typeof(before_snapshot) = 'object'
    AND jsonb_typeof(after_snapshot) = 'object'
    AND jsonb_typeof(result) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS time_source_governance_event_timeline_idx
  ON time_source_governance_event (tenant_id, contract_id, occurred_at, id);

CREATE OR REPLACE FUNCTION time_source_contract_snapshot_v1(
  p_contract_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id', source.id,
      'domain', source.domain,
      'ownerAuthority', source.owner_authority,
      'format', source.source_format,
      'schemaVersion', source.schema_version,
      'artifactSha256', source.artifact_sha256,
      'cutAt', source.cut_at,
      'coverageFrom', source.coverage_from,
      'coverageTo', source.coverage_to,
      'timezone', source.timezone,
      'grain', source.grain,
      'identityKeyKind', source.identity_key_kind,
      'recordCount', source.record_count,
      'status', source.status,
      'version', source.version,
      'reasonCode', source.reason_code,
      'timestamps', jsonb_strip_nulls(jsonb_build_object(
        'createdAt', source.created_at,
        'updatedAt', source.updated_at,
        'submittedAt', source.submitted_at,
        'decidedAt', source.decided_at,
        'retiredAt', source.retired_at,
        'cancelledAt', source.cancelled_at
      ))
    ))
    FROM time_source_contract source
    WHERE source.id = p_contract_id AND source.tenant_id = p_tenant_id
  ), '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION time_source_guard_contract_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  transition_command text;
  mutable_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TIME_SOURCE_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.version <> 1
       OR NOT time_source_reason_allowed_v1('create_draft', NEW.reason_code) THEN
      RAISE EXCEPTION 'TIME_SOURCE_CREATE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM tenant_membership membership
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = membership.tenant_id
     AND policy.tenant_data_plane_ready IS TRUE
     AND policy.certified_source_binding_id = NEW.certified_binding_id
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.status = 'active'
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE membership.id = NEW.proposer_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
      AND link.source_binding_id = NEW.certified_binding_id
      AND contract.person_id = NEW.proposer_person_id
    FOR SHARE OF membership, policy, binding, link, contract, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_SOURCE_PROPOSER_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.certified_binding_id IS DISTINCT FROM OLD.certified_binding_id
     OR NEW.proposer_person_id IS DISTINCT FROM OLD.proposer_person_id
     OR NEW.proposer_membership_id IS DISTINCT FROM OLD.proposer_membership_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TIME_SOURCE_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'TIME_SOURCE_VERSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    transition_command := 'update_draft';
    mutable_fields := ARRAY[
      'domain','owner_authority','owner_code','source_format',
      'schema_version','artifact_sha256','cut_at','coverage_from','coverage_to',
      'timezone','grain','identity_key_kind','record_count','version',
      'reason_code','reason_hash','updated_at'
    ];
  ELSIF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
    transition_command := 'submit';
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','submitted_at'
    ];
  ELSIF OLD.status = 'submitted' AND NEW.status IN ('approved','rejected') THEN
    transition_command := CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'reject' END;
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','decided_at',
      'approver_person_id','approver_membership_id'
    ];
  ELSIF OLD.status IN ('draft','submitted') AND NEW.status = 'cancelled' THEN
    transition_command := 'cancel';
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','cancelled_at'
    ];
  ELSIF OLD.status = 'approved' AND NEW.status = 'retired' THEN
    transition_command := 'retire';
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','retired_at'
    ];
  ELSE
    RAISE EXCEPTION 'TIME_SOURCE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF (to_jsonb(NEW) - mutable_fields) IS DISTINCT FROM (to_jsonb(OLD) - mutable_fields)
     OR NOT time_source_reason_allowed_v1(transition_command, NEW.reason_code) THEN
    RAISE EXCEPTION 'TIME_SOURCE_TRANSITION_SHAPE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF transition_command IN ('approve','reject') THEN
    PERFORM 1
    FROM tenant_membership membership
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.active IS TRUE
     AND link.source_binding_id = NEW.certified_binding_id
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.status = 'active'
     AND contract.person_id = NEW.approver_person_id
    WHERE membership.id = NEW.approver_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
    FOR SHARE OF membership, link, contract;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_SOURCE_APPROVER_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF transition_command = 'approve'
     AND NEW.cut_at > CURRENT_TIMESTAMP + interval '5 minutes' THEN
    RAISE EXCEPTION 'TIME_SOURCE_CUT_AT_FUTURE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION time_source_guard_approved_overlap_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'time-source-coverage:' || NEW.tenant_id::text || ':' || NEW.domain, 0
  ));
  PERFORM 1
  FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id
   AND binding.tenant_id = policy.tenant_id
   AND binding.source_system = 'GRH'
   AND binding.verified IS TRUE
  WHERE policy.tenant_id = NEW.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND binding.id = NEW.certified_binding_id
  FOR SHARE OF policy, binding;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_SOURCE_BINDING_STALE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM time_source_contract existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.domain = NEW.domain
      AND existing.status = 'approved'
      AND existing.id <> NEW.id
      AND existing.coverage_from <= NEW.coverage_to
      AND existing.coverage_to >= NEW.coverage_from
  ) THEN
    RAISE EXCEPTION 'TIME_SOURCE_APPROVED_OVERLAP' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS time_source_contract_transition_guard_v1 ON time_source_contract;
CREATE TRIGGER time_source_contract_transition_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_source_contract
FOR EACH ROW EXECUTE FUNCTION time_source_guard_contract_v1();

DROP TRIGGER IF EXISTS time_source_contract_approved_overlap_guard_v1 ON time_source_contract;
CREATE TRIGGER time_source_contract_approved_overlap_guard_v1
BEFORE INSERT OR UPDATE ON time_source_contract
FOR EACH ROW EXECUTE FUNCTION time_source_guard_approved_overlap_v1();

DROP TRIGGER IF EXISTS time_source_governance_event_append_only_v1 ON time_source_governance_event;
CREATE TRIGGER time_source_governance_event_append_only_v1
BEFORE UPDATE OR DELETE ON time_source_governance_event
FOR EACH ROW EXECUTE FUNCTION tenant_iam_reject_change();

CREATE OR REPLACE FUNCTION time_source_assert_tenant_session_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  user_row internal_users%ROWTYPE;
  membership_row tenant_membership%ROWTYPE;
  session_row tenant_identity_session%ROWTYPE;
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
BEGIN
  IF p_actor_session_id IS NULL OR p_actor_session_version IS NULL
     OR p_actor_session_version < 1 OR p_tenant_id IS NULL OR p_membership_id IS NULL
     OR lower(COALESCE(p_release_sha,'')) !~ '^[a-f0-9]{40}$'
     OR length(btrim(COALESCE(p_actor_email,''))) NOT BETWEEN 3 AND 320 THEN
    RAISE EXCEPTION 'TIME_SOURCE_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO user_row FROM internal_users users
  WHERE lower(users.email) = lower(btrim(p_actor_email)) AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO membership_row FROM tenant_membership membership
  WHERE membership.id = p_membership_id
    AND membership.tenant_id = p_tenant_id
    AND lower(membership.user_email) = lower(user_row.email)
    AND membership.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO session_row FROM tenant_identity_session identity_session
  WHERE identity_session.id = p_actor_session_id
    AND identity_session.session_version = p_actor_session_version
    AND lower(identity_session.user_email) = lower(user_row.email)
    AND identity_session.identity_version = user_row.identity_version
    AND identity_session.active_tenant_id = p_tenant_id
    AND identity_session.source = 'membership'
    AND identity_session.auth_level IN ('mfa','recovery')
    AND identity_session.status = 'active'
    AND identity_session.expires_at > now()
    AND identity_session.last_seen_at > now() - interval '1 hour'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO tenant_row FROM platform_tenant tenant
  WHERE tenant.id = membership_row.tenant_id AND tenant.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO policy_row FROM tenant_identity_policy policy
  WHERE policy.tenant_id = membership_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha) = lower(p_release_sha)
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO binding_row FROM platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = membership_row.tenant_id
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  RETURN jsonb_build_object(
    'email', lower(user_row.email),
    'tenantId', membership_row.tenant_id,
    'membershipId', membership_row.id,
    'roleKey', membership_row.role_key,
    'certifiedBindingId', binding_row.id,
    'sourceCompanyId', binding_row.source_company_id,
    'sourceDatabase', binding_row.source_database
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_SOURCE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_source_assert_person_sod_v1(
  p_tenant_id uuid,
  p_actor_person_id uuid,
  p_certified_binding_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  has_propose boolean := false;
  has_approve boolean := false;
  has_overtime_post boolean := false;
  related_membership_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_person_id IS NULL OR p_certified_binding_id IS NULL THEN
    RAISE EXCEPTION 'TIME_SOURCE_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
  END IF;

  FOR related_membership_id IN
    SELECT membership.id
    FROM tenant_membership membership
    JOIN platform_tenant_source_binding binding
      ON binding.id = p_certified_binding_id
     AND binding.tenant_id = membership.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.source_binding_id = p_certified_binding_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.person_id = p_actor_person_id
     AND contract.status = 'active'
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE membership.tenant_id = p_tenant_id
      AND membership.status = 'active'
    ORDER BY membership.id
    FOR SHARE OF membership, link, contract, batch NOWAIT
  LOOP
    PERFORM tenant_iam_assert_no_sod_conflict(related_membership_id);
  END LOOP;

  SELECT
    COALESCE(bool_or(effective.capability_key = 'time.source.propose'), false),
    COALESCE(bool_or(effective.capability_key = 'time.source.approve'), false),
    COALESCE(bool_or(effective.capability_key = 'time.overtime.post'), false)
    INTO has_propose, has_approve, has_overtime_post
  FROM tenant_membership membership
  JOIN platform_tenant_source_binding binding
    ON binding.id = p_certified_binding_id
   AND binding.tenant_id = membership.tenant_id
   AND binding.source_system = 'GRH'
   AND binding.verified IS TRUE
  JOIN tenant_action_employment_link link
    ON link.membership_id = membership.id
   AND link.tenant_id = membership.tenant_id
   AND link.source_binding_id = p_certified_binding_id
   AND link.active IS TRUE
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.person_id = p_actor_person_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding.source_company_id
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = binding.source_database
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  CROSS JOIN LATERAL tenant_iam_effective_capabilities(membership.id) effective
  WHERE membership.tenant_id = p_tenant_id
    AND membership.status = 'active'
    AND effective.capability_key IN (
      'time.source.propose','time.source.approve','time.overtime.post'
    );

  IF (has_propose AND has_approve) OR (has_approve AND has_overtime_post) THEN
    RAISE EXCEPTION 'TIME_SOURCE_PERSON_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_SOURCE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_source_assert_actor_authority_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  authority_row tenant_action_authority%ROWTYPE;
  actor_employment_contract_id uuid;
  actor_person_id uuid;
  capabilities jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR p_required_capability NOT IN (
       'time.source.read','time.source.propose','time.source.approve','time.source.audit.read'
     ) THEN
    RAISE EXCEPTION 'TIME_SOURCE_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO authority_row FROM tenant_action_authority authority
  WHERE authority.membership_id = (p_context->>'membershipId')::uuid
    AND authority.tenant_id = (p_context->>'tenantId')::uuid
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  PERFORM tenant_iam_assert_no_sod_conflict((p_context->>'membershipId')::uuid);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
    WHERE capability.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'TIME_SOURCE_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT link.employment_contract_id, contract.person_id
    INTO actor_employment_contract_id, actor_person_id
  FROM tenant_action_employment_link link
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = (p_context->>'sourceCompanyId')::bigint
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = p_context->>'sourceDatabase'
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = (p_context->>'membershipId')::uuid
    AND link.tenant_id = (p_context->>'tenantId')::uuid
    AND link.source_binding_id = (p_context->>'certifiedBindingId')::uuid
    AND link.active IS TRUE
  FOR SHARE OF link, contract, batch NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  PERFORM time_source_assert_person_sod_v1(
    (p_context->>'tenantId')::uuid,
    actor_person_id,
    (p_context->>'certifiedBindingId')::uuid
  );

  SELECT COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key), '[]'::jsonb)
    INTO capabilities
  FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
  WHERE capability.capability_key IN (
    'time.source.read','time.source.propose','time.source.approve','time.source.audit.read'
  );

  RETURN p_context || jsonb_build_object(
    'authorityVersion', authority_row.version,
    'employmentContractId', actor_employment_contract_id,
    'actorPersonId', actor_person_id,
    'capabilities', capabilities,
    'areaScopes', '[]'::jsonb
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_SOURCE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_source_readiness_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH requirements(requirement_key, domain_key, label, required_for_catalog) AS (
    VALUES
      ('shiftAssignment','shift_assignment','Asignacion de turnos',true),
      ('timePunches','time_punch','Fichadas',true),
      ('holidayCalendar','holiday_calendar','Calendario de feriados',true),
      ('municipalRuleProfile','municipal_rule_profile','Perfil normativo municipal',true),
      ('administrativeEvents','administrative_event','Novedades administrativas',false)
  ), projected AS (
    SELECT requirement.requirement_key, requirement.domain_key, requirement.label,
      requirement.required_for_catalog,
      CASE
        WHEN approved.id IS NULL THEN 'missing'
        WHEN requirement.requirement_key = 'administrativeEvents' THEN 'partial_reference'
        ELSE 'registered_metadata'
      END AS readiness_state,
      CASE
        WHEN latest.id IS NULL THEN 'missing'
        WHEN latest.status = 'approved' AND (
          latest.certified_binding_id <> (p_context->>'certifiedBindingId')::uuid
          OR (now() AT TIME ZONE 'America/Argentina/Mendoza')::date
            NOT BETWEEN latest.coverage_from AND latest.coverage_to
        ) THEN 'stale'
        ELSE latest.status
      END AS governance_status,
      approved.id IS NOT NULL AS approved_metadata,
      approved.owner_authority, approved.source_format,
      approved.schema_version, approved.cut_at, approved.coverage_from,
      approved.coverage_to, approved.timezone, approved.grain, approved.record_count
    FROM requirements requirement
    LEFT JOIN LATERAL (
      SELECT source.* FROM time_source_contract source
      WHERE source.tenant_id = (p_context->>'tenantId')::uuid
        AND source.domain = requirement.domain_key
      ORDER BY source.updated_at DESC, source.id
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT source.* FROM time_source_contract source
      WHERE source.tenant_id = (p_context->>'tenantId')::uuid
        AND source.certified_binding_id = (p_context->>'certifiedBindingId')::uuid
        AND source.domain = requirement.domain_key
        AND source.status = 'approved'
        AND (now() AT TIME ZONE 'America/Argentina/Mendoza')::date
          BETWEEN source.coverage_from AND source.coverage_to
      ORDER BY source.cut_at DESC, source.updated_at DESC, source.id
      LIMIT 1
    ) approved ON true
  )
  SELECT jsonb_build_object(
    'catalogApproved', count(*) FILTER (
      WHERE required_for_catalog IS TRUE AND approved_metadata IS TRUE
    ) = 4,
    'evaluationReady', false,
    'attendanceReconciled', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'grhMutation', false,
    'requirements', COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'key', requirement_key,
      'domain', domain_key,
      'label', label,
      'requiredForCatalog', required_for_catalog,
      'governanceStatus', governance_status,
      'readinessState', readiness_state,
      'approvedMetadata', approved_metadata,
      'metadata', CASE WHEN approved_metadata THEN jsonb_strip_nulls(jsonb_build_object(
        'ownerAuthority', owner_authority,
        'format', source_format,
        'schemaVersion', schema_version,
        'cutAt', cut_at,
        'coverageFrom', coverage_from,
        'coverageTo', coverage_to,
        'timezone', timezone,
        'grain', grain,
        'recordCount', record_count
      )) END
    )) ORDER BY CASE requirement_key
      WHEN 'shiftAssignment' THEN 1 WHEN 'timePunches' THEN 2
      WHEN 'holidayCalendar' THEN 3 WHEN 'municipalRuleProfile' THEN 4 ELSE 5 END
    ), '[]'::jsonb)
  )
  FROM projected
$$;

CREATE OR REPLACE FUNCTION time_source_registry_bootstrap_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
BEGIN
  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := time_source_assert_actor_authority_v1(context_value, 'time.source.read');
  RETURN jsonb_build_object(
    'principal', context_value,
    'readiness', time_source_readiness_v1(context_value),
    'allowedCommands', CASE
      WHEN COALESCE(context_value->'capabilities','[]'::jsonb) ? 'time.source.propose'
      THEN jsonb_build_array('create_draft') ELSE '[]'::jsonb END
  );
END
$$;

CREATE OR REPLACE FUNCTION time_source_registry_list_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_domain text,
  p_status text,
  p_page integer,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  records_value jsonb := '[]'::jsonb;
  total_value bigint := 0;
BEGIN
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 200
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR (p_domain IS NOT NULL AND p_domain NOT IN (
       'shift_assignment','time_punch','holiday_calendar','municipal_rule_profile',
       'administrative_event','employment_master_reference'
     ))
     OR (p_status IS NOT NULL AND p_status NOT IN (
       'draft','submitted','approved','rejected','retired','cancelled'
     )) THEN
    RAISE EXCEPTION 'TIME_SOURCE_FILTER_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := time_source_assert_actor_authority_v1(context_value, 'time.source.read');

  WITH filtered AS MATERIALIZED (
    SELECT source.* FROM time_source_contract source
    WHERE source.tenant_id = (context_value->>'tenantId')::uuid
      AND (p_domain IS NULL OR source.domain = p_domain)
      AND (p_status IS NULL OR source.status = p_status)
  ), counted AS (
    SELECT count(*)::bigint AS total FROM filtered
  ), page_rows AS (
    SELECT source.* FROM filtered source
    ORDER BY source.updated_at DESC, source.id
    LIMIT p_limit OFFSET (p_page - 1) * p_limit
  )
  SELECT counted.total,
    COALESCE(jsonb_agg(
      time_source_contract_snapshot_v1(page_rows.id, page_rows.tenant_id)
      || jsonb_build_object(
        'governanceStatus', CASE
          WHEN page_rows.status = 'approved' AND (
            page_rows.certified_binding_id <> (context_value->>'certifiedBindingId')::uuid
            OR (now() AT TIME ZONE 'America/Argentina/Mendoza')::date
              NOT BETWEEN page_rows.coverage_from AND page_rows.coverage_to
          ) THEN 'stale' ELSE page_rows.status END,
        'bindingState', CASE
          WHEN page_rows.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
          THEN 'current' ELSE 'stale' END
      ) ORDER BY page_rows.updated_at DESC, page_rows.id
    ) FILTER (WHERE page_rows.id IS NOT NULL), '[]'::jsonb)
  INTO total_value, records_value
  FROM counted LEFT JOIN page_rows ON true
  GROUP BY counted.total;

  RETURN jsonb_build_object(
    'principal', context_value,
    'records', records_value,
    'total', total_value,
    'page', p_page,
    'limit', p_limit
  );
END
$$;

CREATE OR REPLACE FUNCTION time_source_registry_detail_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  source_row time_source_contract%ROWTYPE;
  record_value jsonb;
  timeline_value jsonb := '[]'::jsonb;
  timeline_truncated boolean := false;
  allowed_value jsonb := '[]'::jsonb;
  can_propose boolean;
  can_approve boolean;
  can_audit boolean;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'TIME_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := time_source_assert_actor_authority_v1(context_value, 'time.source.read');
  SELECT * INTO source_row FROM time_source_contract source
  WHERE source.id = p_contract_id
    AND source.tenant_id = (context_value->>'tenantId')::uuid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL,
      'timeline', '[]'::jsonb, 'allowedCommands', '[]'::jsonb);
  END IF;

  can_propose := COALESCE(context_value->'capabilities','[]'::jsonb) ? 'time.source.propose';
  can_approve := COALESCE(context_value->'capabilities','[]'::jsonb) ? 'time.source.approve';
  can_audit := COALESCE(context_value->'capabilities','[]'::jsonb) ? 'time.source.audit.read';
  record_value := time_source_contract_snapshot_v1(source_row.id, source_row.tenant_id)
    || jsonb_build_object(
      'governanceStatus', CASE
        WHEN source_row.status = 'approved' AND (
          source_row.certified_binding_id <> (context_value->>'certifiedBindingId')::uuid
          OR (now() AT TIME ZONE 'America/Argentina/Mendoza')::date
            NOT BETWEEN source_row.coverage_from AND source_row.coverage_to
        ) THEN 'stale' ELSE source_row.status END,
      'bindingState', CASE
        WHEN source_row.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
        THEN 'current' ELSE 'stale' END
    );

  IF can_propose AND source_row.proposer_person_id = (context_value->>'actorPersonId')::uuid THEN
    IF source_row.status = 'draft' THEN allowed_value := jsonb_build_array('update_draft','submit','cancel');
    ELSIF source_row.status = 'submitted' THEN allowed_value := jsonb_build_array('cancel'); END IF;
  END IF;
  IF can_approve AND source_row.proposer_person_id <> (context_value->>'actorPersonId')::uuid THEN
    IF source_row.status = 'submitted' THEN allowed_value := allowed_value || jsonb_build_array('approve','reject');
    ELSIF source_row.status = 'approved' THEN allowed_value := allowed_value || jsonb_build_array('retire'); END IF;
  END IF;

  IF can_audit THEN
    WITH recent AS MATERIALIZED (
      SELECT event.* FROM time_source_governance_event event
      WHERE event.tenant_id = source_row.tenant_id AND event.contract_id = source_row.id
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT 101
    ), numbered AS (
      SELECT recent.*,
        row_number() OVER (ORDER BY recent.occurred_at DESC, recent.id DESC) AS position
      FROM recent
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'command', event.command,
        'expectedVersion', event.expected_version,
        'resultingVersion', event.resulting_version,
        'reasonCode', event.reason_code,
        'occurredAt', event.occurred_at
      ) ORDER BY event.occurred_at, event.id)
      FILTER (WHERE event.position <= 100), '[]'::jsonb),
      count(*) > 100
    INTO timeline_value, timeline_truncated
    FROM numbered event;
  END IF;

  RETURN jsonb_build_object(
    'principal', context_value,
    'record', record_value,
    'timeline', timeline_value,
    'timelineTruncated', timeline_truncated,
    'timelineLimit', 100,
    'auditAvailable', can_audit,
    'allowedCommands', allowed_value
  );
END
$$;

CREATE OR REPLACE FUNCTION time_source_registry_apply_command_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_command text,
  p_contract_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_command_hash text,
  p_payload jsonb,
  p_reason_code text,
  p_reason_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  source_row time_source_contract%ROWTYPE;
  existing_event time_source_governance_event%ROWTYPE;
  target_id uuid;
  before_value jsonb := '{}'::jsonb;
  after_value jsonb;
  result_value jsonb;
  required_capability text;
  target_domain text;
BEGIN
  IF p_command IS NULL OR p_command NOT IN (
       'create_draft','update_draft','submit','approve','reject','retire','cancel'
     )
     OR p_idempotency_key IS NULL
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 0
     OR lower(COALESCE(p_reason_hash,'')) !~ '^[a-f0-9]{64}$'
     OR time_source_reason_allowed_v1(p_command, p_reason_code) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TIME_SOURCE_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command = 'create_draft' THEN
    IF p_contract_id IS NOT NULL OR p_expected_version <> 0
       OR NOT time_source_metadata_json_valid_v1(p_payload) THEN
      RAISE EXCEPTION 'TIME_SOURCE_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'update_draft' THEN
    IF p_contract_id IS NULL OR p_expected_version < 1
       OR NOT time_source_metadata_json_valid_v1(p_payload) THEN
      RAISE EXCEPTION 'TIME_SOURCE_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_contract_id IS NULL OR p_expected_version < 1 OR p_payload IS NOT NULL THEN
    RAISE EXCEPTION 'TIME_SOURCE_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'time-source-idempotency:' || (context_value->>'tenantId') || ':'
      || (context_value->>'membershipId') || ':' || p_idempotency_key::text, 0
  ));

  required_capability := CASE
    WHEN p_command IN ('create_draft','update_draft','submit','cancel')
      THEN 'time.source.propose'
    ELSE 'time.source.approve'
  END;
  context_value := time_source_assert_actor_authority_v1(context_value, required_capability);

  SELECT * INTO existing_event FROM time_source_governance_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency_key
  FOR SHARE;
  IF FOUND THEN
    IF existing_event.command IS DISTINCT FROM p_command
       OR existing_event.command_hash IS DISTINCT FROM lower(p_command_hash)
       OR existing_event.expected_version IS DISTINCT FROM p_expected_version
       OR existing_event.actor_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR existing_event.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR existing_event.release_sha IS DISTINCT FROM lower(p_release_sha)
       OR existing_event.actor_certified_binding_id IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid
       OR (p_contract_id IS NOT NULL AND existing_event.contract_id IS DISTINCT FROM p_contract_id) THEN
      RAISE EXCEPTION 'TIME_SOURCE_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO source_row FROM time_source_contract source
    WHERE source.id = existing_event.contract_id
      AND source.tenant_id = existing_event.tenant_id
    FOR SHARE;
    IF NOT FOUND
       OR source_row.certified_binding_id IS DISTINCT FROM existing_event.contract_certified_binding_id THEN
      RAISE EXCEPTION 'TIME_SOURCE_AUDIT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_event.result || jsonb_build_object(
      'replayed', true,
      'historical', source_row.version IS DISTINCT FROM existing_event.resulting_version
        OR source_row.status IS DISTINCT FROM existing_event.after_snapshot->>'status'
    );
  END IF;

  IF p_command = 'create_draft' THEN
    target_id := gen_random_uuid();
  ELSE
    IF p_command = 'approve' THEN
      SELECT source.domain INTO target_domain FROM time_source_contract source
      WHERE source.id = p_contract_id
        AND source.tenant_id = (context_value->>'tenantId')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'time-source-coverage:' || (context_value->>'tenantId') || ':' || target_domain, 0
      ));
    END IF;
    SELECT * INTO source_row FROM time_source_contract source
    WHERE source.id = p_contract_id
      AND source.tenant_id = (context_value->>'tenantId')::uuid
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    target_id := source_row.id;
    IF source_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'TIME_SOURCE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF p_command NOT IN ('cancel','retire')
       AND source_row.certified_binding_id IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'TIME_SOURCE_BINDING_STALE' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('update_draft','submit','cancel')
       AND source_row.proposer_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'TIME_SOURCE_PROPOSER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('approve','reject','retire')
       AND source_row.proposer_person_id IS NOT DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'TIME_SOURCE_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
    END IF;
    before_value := time_source_contract_snapshot_v1(source_row.id, source_row.tenant_id);
  END IF;

  IF p_command = 'create_draft' THEN
    INSERT INTO time_source_contract (
      id, tenant_id, certified_binding_id, domain, owner_authority, owner_code,
      system_locator, source_format, schema_version, artifact_sha256, cut_at,
      coverage_from, coverage_to, timezone, grain, identity_key_kind, record_count,
      status, version, proposer_person_id, proposer_membership_id, reason_code, reason_hash
    ) VALUES (
      target_id, (context_value->>'tenantId')::uuid,
      (context_value->>'certifiedBindingId')::uuid,
      p_payload->>'domain', p_payload->>'ownerAuthority', p_payload->>'ownerAuthority',
      'registry.' || target_id::text, p_payload->>'format', p_payload->>'schemaVersion',
      lower(p_payload->>'artifactSha256'), (p_payload->>'cutAt')::timestamptz,
      (p_payload->>'coverageFrom')::date, (p_payload->>'coverageTo')::date,
      p_payload->>'timezone', p_payload->>'grain', p_payload->>'identityKeyKind',
      CASE WHEN p_payload ? 'recordCount' THEN (p_payload->>'recordCount')::bigint END,
      'draft', 1, (context_value->>'actorPersonId')::uuid,
      (context_value->>'membershipId')::uuid, p_reason_code, lower(p_reason_hash)
    );
  ELSIF p_command = 'update_draft' THEN
    UPDATE time_source_contract SET
      domain = p_payload->>'domain', owner_authority = p_payload->>'ownerAuthority',
      owner_code = p_payload->>'ownerAuthority',
      source_format = p_payload->>'format', schema_version = p_payload->>'schemaVersion',
      artifact_sha256 = lower(p_payload->>'artifactSha256'),
      cut_at = (p_payload->>'cutAt')::timestamptz,
      coverage_from = (p_payload->>'coverageFrom')::date,
      coverage_to = (p_payload->>'coverageTo')::date,
      timezone = p_payload->>'timezone', grain = p_payload->>'grain',
      identity_key_kind = p_payload->>'identityKeyKind',
      record_count = CASE WHEN p_payload ? 'recordCount' THEN (p_payload->>'recordCount')::bigint END,
      version = version + 1, reason_code = p_reason_code,
      reason_hash = lower(p_reason_hash), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'submit' THEN
    IF source_row.status <> 'draft' THEN RAISE EXCEPTION 'TIME_SOURCE_TRANSITION_INVALID' USING ERRCODE = 'P0001'; END IF;
    UPDATE time_source_contract SET status = 'submitted', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      submitted_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command IN ('approve','reject') THEN
    IF source_row.status <> 'submitted' THEN RAISE EXCEPTION 'TIME_SOURCE_TRANSITION_INVALID' USING ERRCODE = 'P0001'; END IF;
    IF p_command = 'approve'
       AND source_row.cut_at > CURRENT_TIMESTAMP + interval '5 minutes' THEN
      RAISE EXCEPTION 'TIME_SOURCE_CUT_AT_FUTURE' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_source_contract SET status = CASE p_command WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      version = version + 1, reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      approver_person_id = (context_value->>'actorPersonId')::uuid,
      approver_membership_id = (context_value->>'membershipId')::uuid,
      decided_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'retire' THEN
    IF source_row.status <> 'approved' THEN RAISE EXCEPTION 'TIME_SOURCE_TRANSITION_INVALID' USING ERRCODE = 'P0001'; END IF;
    UPDATE time_source_contract SET status = 'retired', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      retired_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'cancel' THEN
    IF source_row.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'TIME_SOURCE_TRANSITION_INVALID' USING ERRCODE = 'P0001'; END IF;
    UPDATE time_source_contract SET status = 'cancelled', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      cancelled_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  END IF;

  after_value := time_source_contract_snapshot_v1(
    target_id, (context_value->>'tenantId')::uuid
  );
  after_value := after_value || jsonb_build_object(
    'governanceStatus', after_value->>'status',
    'bindingState', CASE
      WHEN (CASE WHEN p_command = 'create_draft'
        THEN (context_value->>'certifiedBindingId')::uuid
        ELSE source_row.certified_binding_id END)
        = (context_value->>'certifiedBindingId')::uuid THEN 'current'
      ELSE 'stale'
    END
  );
  result_value := jsonb_build_object(
    'data', after_value,
    'replayed', false,
    'evaluationReady', false,
    'attendanceReconciled', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'grhMutation', false
  );
  INSERT INTO time_source_governance_event (
    tenant_id, contract_id, contract_certified_binding_id, actor_certified_binding_id,
    actor_membership_id,
    actor_person_id, actor_session_id, actor_session_version, release_sha,
    command, idempotency_key, command_hash, expected_version, resulting_version,
    reason_code, reason_hash, before_snapshot, after_snapshot, result
  ) VALUES (
    (context_value->>'tenantId')::uuid, target_id,
    CASE WHEN p_command = 'create_draft'
      THEN (context_value->>'certifiedBindingId')::uuid
      ELSE source_row.certified_binding_id END,
    (context_value->>'certifiedBindingId')::uuid,
    (context_value->>'membershipId')::uuid, (context_value->>'actorPersonId')::uuid,
    p_actor_session_id, p_actor_session_version, lower(p_release_sha),
    p_command, p_idempotency_key, lower(p_command_hash), p_expected_version,
    (after_value->>'version')::integer, p_reason_code, lower(p_reason_hash),
    before_value, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_SOURCE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

COMMENT ON TABLE time_source_contract IS
  'Metadatos versionados de fuentes temporales; no contiene fichadas, minutos calculados ni importes.';
COMMENT ON TABLE time_source_governance_event IS
  'Auditoria append-only de gobierno de fuentes temporales, ligada a SID/version/release/binding.';
COMMENT ON COLUMN time_source_contract.certified_binding_id IS
  'Snapshot del binding GRH certificado del tenant al gobernar el contrato; no identifica la fuente temporal.';
COMMENT ON FUNCTION time_source_registry_bootstrap_v1(text,uuid,integer,text,uuid,uuid) IS
  'Readiness temporal PII-free ligado a tenant session v2; el motor de evaluacion permanece cerrado.';
COMMENT ON FUNCTION time_source_registry_list_v1(text,uuid,integer,text,uuid,uuid,text,text,integer,integer) IS
  'Listado tenant-bound de metadatos gobernados con paginacion exacta.';
COMMENT ON FUNCTION time_source_registry_detail_v1(text,uuid,integer,text,uuid,uuid,uuid) IS
  'Detalle tenant-bound; timeline solo con time.source.audit.read.';
COMMENT ON FUNCTION time_source_registry_apply_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,text,text) IS
  'Workflow maker-checker de metadatos temporales; no evalua asistencia ni escribe GRH/payroll/action_case.';

REVOKE ALL PRIVILEGES ON TABLE time_source_contract, time_source_governance_event FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE time_source_contract, time_source_governance_event
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM municontrol_actions_runtime_app;
REVOKE CREATE ON SCHEMA public FROM municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION time_source_reason_allowed_v1(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_metadata_row_valid_v1(
  text,text,text,text,text,text,text,timestamptz,date,date,text,text,text,bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_metadata_json_valid_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_contract_snapshot_v1(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_guard_contract_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_guard_approved_overlap_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_assert_tenant_session_v1(text,uuid,integer,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_assert_person_sod_v1(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_assert_actor_authority_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_readiness_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_registry_bootstrap_v1(text,uuid,integer,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_registry_list_v1(
  text,uuid,integer,text,uuid,uuid,text,text,integer,integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_registry_detail_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_source_registry_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,text,text
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION time_source_reason_allowed_v1(text,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_metadata_row_valid_v1(
  text,text,text,text,text,text,text,timestamptz,date,date,text,text,text,bigint
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_metadata_json_valid_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_contract_snapshot_v1(uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_guard_contract_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_guard_approved_overlap_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_assert_tenant_session_v1(text,uuid,integer,text,uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_assert_person_sod_v1(uuid,uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_assert_actor_authority_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_source_readiness_v1(jsonb)
  FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION time_source_registry_bootstrap_v1(text,uuid,integer,text,uuid,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION time_source_registry_list_v1(
  text,uuid,integer,text,uuid,uuid,text,text,integer,integer
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION time_source_registry_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION time_source_registry_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,text,text
) TO municontrol_actions_runtime_app;
