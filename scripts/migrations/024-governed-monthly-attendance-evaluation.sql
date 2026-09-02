-- MuniControl Friendly - migration 024
-- Evaluacion mensual gobernada de asistencia. Consume reglas aprobadas de 011
-- y lotes inmutables de 022; no reinterpreta eventos crudos ni publica nomina.

INSERT INTO iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  ('attendance.evaluation.read', 'Consultar evaluaciones mensuales',
   'Consulta corridas y resultados mensuales por contrato canonico.', 'tenant', 'standard'),
  ('attendance.evaluation.prepare', 'Preparar evaluaciones mensuales',
   'Crea corridas, vincula fuentes y prepara resultados para revision.', 'tenant', 'privileged'),
  ('attendance.evaluation.approve', 'Aprobar evaluaciones mensuales',
   'Aprueba o rechaza resultados preparados por otra persona.', 'tenant', 'restricted'),
  ('attendance.evaluation.audit.read', 'Auditar evaluaciones mensuales',
   'Consulta la trazabilidad append-only de cada corrida.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind, sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_capability_conflict (capability_key, conflicts_with_key, reason) VALUES
  ('attendance.evaluation.approve', 'attendance.evaluation.prepare',
   'La preparacion y la aprobacion de la evaluacion mensual deben estar separadas.'),
  ('attendance.evaluation.approve', 'time.overtime.post',
   'Aprobar asistencia no habilita ni debe coincidir con publicar mayor esfuerzo.')
ON CONFLICT (capability_key, conflicts_with_key)
DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO iam_role (role_key, label, description, scope_kind, system_managed) VALUES
  ('JUNIN_ASISTENCIA_EVALUADOR', 'Asistencia - evaluador mensual',
   'Prepara corridas mensuales; no puede aprobarlas.', 'tenant', true),
  ('JUNIN_ASISTENCIA_APROBADOR', 'Asistencia - aprobador mensual',
   'Revisa corridas creadas por otra persona; nunca publica nomina.', 'tenant', true)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind, system_managed = EXCLUDED.system_managed;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('JUNIN_ASISTENCIA_EVALUADOR', 'attendance.evaluation.read'),
  ('JUNIN_ASISTENCIA_EVALUADOR', 'attendance.evaluation.prepare'),
  ('JUNIN_ASISTENCIA_APROBADOR', 'attendance.evaluation.read'),
  ('JUNIN_ASISTENCIA_APROBADOR', 'attendance.evaluation.approve'),
  ('JUNIN_ASISTENCIA_APROBADOR', 'attendance.evaluation.audit.read')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance_evaluation_run (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  period_month date NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'America/Argentina/Mendoza',
  rule_profile_entry_id uuid NOT NULL,
  rule_profile_kind varchar(24) NOT NULL DEFAULT 'rule_profile',
  source_manifest_sha256 char(64) NOT NULL,
  evaluator_version varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  result_count integer NOT NULL DEFAULT 0,
  creator_membership_id uuid NOT NULL,
  creator_person_id uuid NOT NULL,
  approver_membership_id uuid,
  approver_person_id uuid,
  reason_code varchar(64) NOT NULL,
  reason_reference varchar(128) NOT NULL,
  payroll_posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT attendance_evaluation_run_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_evaluation_run_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_creator_person_fk
    FOREIGN KEY (creator_person_id) REFERENCES person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_approver_person_fk
    FOREIGN KEY (approver_person_id) REFERENCES person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_evaluation_run_period_uk
    UNIQUE (tenant_id, period_month, rule_profile_entry_id, source_manifest_sha256),
  CONSTRAINT attendance_evaluation_run_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_rule_fk
    FOREIGN KEY (rule_profile_entry_id, tenant_id, rule_profile_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_creator_fk
    FOREIGN KEY (creator_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_approver_fk
    FOREIGN KEY (approver_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_run_month_ck CHECK (
    EXTRACT(day FROM period_month) = 1
    AND period_month BETWEEN DATE '2000-01-01' AND DATE '2100-12-01'
  ),
  CONSTRAINT attendance_evaluation_run_rule_kind_ck CHECK (rule_profile_kind = 'rule_profile'),
  CONSTRAINT attendance_evaluation_run_hash_ck CHECK (
    source_manifest_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT attendance_evaluation_run_reason_reference_ck CHECK (
    reason_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
  ),
  CONSTRAINT attendance_evaluation_run_evaluator_ck CHECK (
    evaluator_version ~ '^v[1-9][0-9]{0,3}(\.[0-9]{1,4}){0,2}$'
  ),
  CONSTRAINT attendance_evaluation_run_status_ck CHECK (
    status IN ('draft','prepared','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT attendance_evaluation_run_reason_ck CHECK (
    reason_code IN ('monthly_close','source_corrected','ready_for_review',
      'attendance_verified','calculation_invalid','evidence_insufficient',
      'source_not_authoritative','cancelled_by_creator')
  ),
  CONSTRAINT attendance_evaluation_run_version_ck CHECK (version > 0 AND result_count >= 0),
  CONSTRAINT attendance_evaluation_run_checker_pair_ck CHECK (
    (approver_membership_id IS NULL AND approver_person_id IS NULL)
    OR (approver_membership_id IS NOT NULL AND approver_person_id IS NOT NULL)
  ),
  CONSTRAINT attendance_evaluation_run_maker_checker_ck CHECK (
    approver_person_id IS NULL OR (
      approver_person_id <> creator_person_id
      AND approver_membership_id <> creator_membership_id
    )
  ),
  CONSTRAINT attendance_evaluation_run_state_ck CHECK (
    (status IN ('draft','prepared') AND submitted_at IS NULL AND decided_at IS NULL
      AND approver_membership_id IS NULL AND approver_person_id IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND approver_membership_id IS NULL AND approver_person_id IS NULL)
    OR (status IN ('approved','rejected') AND submitted_at IS NOT NULL
      AND decided_at IS NOT NULL AND approver_membership_id IS NOT NULL
      AND approver_person_id IS NOT NULL)
    OR (status = 'cancelled' AND decided_at IS NOT NULL
      AND approver_membership_id IS NULL AND approver_person_id IS NULL)
  ),
  CONSTRAINT attendance_evaluation_run_payroll_block_ck CHECK (payroll_posted IS FALSE),
  CONSTRAINT attendance_evaluation_run_timezone_ck
    CHECK (timezone = 'America/Argentina/Mendoza')
);

CREATE TABLE IF NOT EXISTS attendance_evaluation_source (
  run_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  ingest_batch_id uuid NOT NULL,
  batch_payload_sha256 char(64) NOT NULL,
  batch_event_count integer NOT NULL,
  recorded_event_count integer NOT NULL,
  recorded_event_set_sha256 char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_evaluation_source_pkey PRIMARY KEY (run_id, ingest_batch_id),
  CONSTRAINT attendance_evaluation_source_run_fk FOREIGN KEY (run_id, tenant_id)
    REFERENCES attendance_evaluation_run(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_source_batch_fk FOREIGN KEY (ingest_batch_id, tenant_id)
    REFERENCES attendance_ingest_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_source_hash_ck CHECK (
    batch_payload_sha256 ~ '^[a-f0-9]{64}$'
    AND recorded_event_set_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT attendance_evaluation_source_count_ck CHECK (
    batch_event_count > 0
    AND recorded_event_count > 0
    AND recorded_event_count <= batch_event_count
  )
);

CREATE TABLE IF NOT EXISTS attendance_evaluation_result (
  run_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  employment_contract_id uuid NOT NULL,
  scheduled_minutes integer NOT NULL,
  worked_minutes integer NOT NULL,
  tardy_minutes integer NOT NULL,
  early_departure_minutes integer NOT NULL,
  unjustified_absence_minutes integer NOT NULL,
  justified_absence_minutes integer NOT NULL,
  tardy_occurrences integer NOT NULL,
  unjustified_absence_days integer NOT NULL,
  source_event_count integer NOT NULL,
  calculation_sha256 char(64) NOT NULL,
  outcome_code varchar(32) NOT NULL,
  payroll_posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_evaluation_result_pkey PRIMARY KEY (run_id, employment_contract_id),
  CONSTRAINT attendance_evaluation_result_contract_fk
    FOREIGN KEY (employment_contract_id)
    REFERENCES employment_contract(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_result_run_fk FOREIGN KEY (run_id, tenant_id)
    REFERENCES attendance_evaluation_run(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_result_minutes_ck CHECK (
    scheduled_minutes >= 0 AND worked_minutes >= 0 AND tardy_minutes >= 0
    AND early_departure_minutes >= 0 AND unjustified_absence_minutes >= 0
    AND justified_absence_minutes >= 0 AND tardy_occurrences >= 0
    AND unjustified_absence_days >= 0 AND source_event_count >= 0
  ),
  CONSTRAINT attendance_evaluation_result_hash_ck
    CHECK (calculation_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT attendance_evaluation_result_outcome_ck CHECK (
    outcome_code IN ('compliant','tardy','partial_absence','unjustified_absence',
      'justified_absence','insufficient_evidence','no_schedule')
  ),
  CONSTRAINT attendance_evaluation_result_outcome_consistency_ck CHECK (
    (outcome_code = 'compliant'
      AND scheduled_minutes > 0 AND worked_minutes >= scheduled_minutes
      AND tardy_minutes = 0 AND early_departure_minutes = 0
      AND unjustified_absence_minutes = 0 AND justified_absence_minutes = 0
      AND tardy_occurrences = 0 AND unjustified_absence_days = 0)
    OR (outcome_code = 'tardy'
      AND scheduled_minutes > 0 AND tardy_minutes > 0 AND tardy_occurrences > 0)
    OR (outcome_code = 'partial_absence'
      AND scheduled_minutes > 0 AND early_departure_minutes > 0)
    OR (outcome_code = 'unjustified_absence'
      AND scheduled_minutes > 0
      AND (unjustified_absence_minutes > 0 OR unjustified_absence_days > 0))
    OR (outcome_code = 'justified_absence'
      AND scheduled_minutes > 0 AND justified_absence_minutes > 0)
    OR outcome_code = 'insufficient_evidence'
    OR (outcome_code = 'no_schedule'
      AND scheduled_minutes = 0
      AND tardy_minutes = 0 AND early_departure_minutes = 0
      AND unjustified_absence_minutes = 0 AND justified_absence_minutes = 0
      AND tardy_occurrences = 0 AND unjustified_absence_days = 0)
  ),
  CONSTRAINT attendance_evaluation_result_payroll_block_ck CHECK (payroll_posted IS FALSE)
);

CREATE TABLE IF NOT EXISTS attendance_evaluation_audit_event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_id uuid NOT NULL,
  command varchar(24) NOT NULL,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  run_version integer NOT NULL,
  reason_code varchar(64) NOT NULL,
  reason_reference varchar(128) NOT NULL,
  event_sha256 char(64) NOT NULL,
  payroll_posted boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_evaluation_audit_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_evaluation_audit_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_audit_actor_person_fk
    FOREIGN KEY (actor_person_id) REFERENCES person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_audit_run_version_uk UNIQUE (run_id, run_version),
  CONSTRAINT attendance_evaluation_audit_run_fk FOREIGN KEY (run_id, tenant_id)
    REFERENCES attendance_evaluation_run(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_audit_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_evaluation_audit_command_ck CHECK (
    command IN ('create','prepare','revise','submit','approve','reject','cancel')
  ),
  CONSTRAINT attendance_evaluation_audit_hash_ck CHECK (
    event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT attendance_evaluation_audit_reason_reference_ck CHECK (
    reason_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
  ),
  CONSTRAINT attendance_evaluation_audit_version_ck CHECK (run_version > 0),
  CONSTRAINT attendance_evaluation_audit_payroll_block_ck CHECK (payroll_posted IS FALSE)
);

CREATE INDEX IF NOT EXISTS attendance_evaluation_run_tenant_period_idx
  ON attendance_evaluation_run (tenant_id, period_month DESC, status, id);
CREATE INDEX IF NOT EXISTS attendance_evaluation_result_tenant_run_idx
  ON attendance_evaluation_result (tenant_id, run_id, outcome_code);
CREATE INDEX IF NOT EXISTS attendance_evaluation_audit_timeline_idx
  ON attendance_evaluation_audit_event (tenant_id, run_id, occurred_at, id);

CREATE OR REPLACE FUNCTION attendance_evaluation_reject_change_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'ATTENDANCE_EVALUATION_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION attendance_evaluation_actor_valid_v1(
  p_tenant_id uuid,
  p_certified_binding_id uuid,
  p_membership_id uuid,
  p_person_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_membership membership
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id AND link.tenant_id = membership.tenant_id
     AND link.source_binding_id = p_certified_binding_id AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id AND contract.person_id = p_person_id
     AND contract.status = 'active' AND contract.source_system = 'GRH'
    JOIN platform_tenant_source_binding binding
      ON binding.id = p_certified_binding_id AND binding.tenant_id = membership.tenant_id
     AND binding.source_system = 'GRH' AND binding.verified IS TRUE
     AND binding.source_company_id = contract.legacy_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
    WHERE membership.id = p_membership_id AND membership.tenant_id = p_tenant_id
      AND membership.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION attendance_evaluation_actor_has_capability_v1(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_capability_key text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_membership membership
    CROSS JOIN LATERAL tenant_iam_effective_capabilities(membership.id) capability
    WHERE membership.id = p_membership_id
      AND membership.tenant_id = p_tenant_id
      AND membership.status = 'active'
      AND capability.capability_key = p_capability_key
  )
$$;

CREATE OR REPLACE FUNCTION attendance_evaluation_source_manifest_v1(
  p_run_id uuid,
  p_tenant_id uuid
)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE encode(digest(convert_to(
    jsonb_agg(jsonb_build_array(
      source.ingest_batch_id,
      btrim(source.batch_payload_sha256),
      source.batch_event_count,
      source.recorded_event_count,
      btrim(source.recorded_event_set_sha256)
    ) ORDER BY source.ingest_batch_id)::text,
    'UTF8'), 'sha256'), 'hex') END
  FROM attendance_evaluation_source source
  WHERE source.run_id = p_run_id AND source.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION attendance_evaluation_run_guard_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE rule_row time_catalog_entry%ROWTYPE;
DECLARE stored_results integer;
DECLARE expected_manifest_sha256 text;
DECLARE source_recorded_events bigint;
DECLARE result_source_events bigint;
DECLARE result_event_mismatch boolean;
DECLARE require_current_rule boolean := false;
DECLARE require_creator_authority boolean := false;
BEGIN
  IF NEW.payroll_posted IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ATTENDANCE_EVALUATION_PAYROLL_BLOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.version <> 1 OR NEW.result_count <> 0
       OR NEW.approver_membership_id IS NOT NULL OR NEW.approver_person_id IS NOT NULL
       OR NEW.submitted_at IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_INSERT_MUST_BE_DRAFT' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.reason_code <> 'monthly_close' THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := NEW.created_at;
    require_current_rule := true;
    require_creator_authority := true;
  ELSE
    IF ROW(NEW.tenant_id, NEW.certified_binding_id, NEW.period_month,
      NEW.rule_profile_entry_id, NEW.source_manifest_sha256, NEW.evaluator_version,
      NEW.creator_membership_id, NEW.creator_person_id, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.tenant_id, OLD.certified_binding_id, OLD.period_month,
      OLD.rule_profile_entry_id, OLD.source_manifest_sha256, OLD.evaluator_version,
      OLD.creator_membership_id, OLD.creator_person_id, OLD.created_at) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_IMMUTABLE_CONTEXT' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.version <> OLD.version + 1 OR NOT (
      (OLD.status = 'draft' AND NEW.status IN ('prepared','cancelled')) OR
      (OLD.status = 'prepared' AND NEW.status IN ('draft','submitted','cancelled')) OR
      (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected'))
    ) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'prepared'
        AND NEW.reason_code IN ('monthly_close','source_corrected'))
      OR (OLD.status = 'prepared' AND NEW.status = 'draft'
        AND NEW.reason_code = 'source_corrected')
      OR (OLD.status = 'prepared' AND NEW.status = 'submitted'
        AND NEW.reason_code = 'ready_for_review')
      OR (OLD.status IN ('draft','prepared') AND NEW.status = 'cancelled'
        AND NEW.reason_code = 'cancelled_by_creator')
      OR (OLD.status = 'submitted' AND NEW.status = 'approved'
        AND NEW.reason_code = 'attendance_verified')
      OR (OLD.status = 'submitted' AND NEW.status = 'rejected'
        AND NEW.reason_code IN (
          'calculation_invalid','evidence_insufficient','source_not_authoritative'
        ))
    ) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'submitted' THEN
      NEW.submitted_at := now();
      NEW.decided_at := NULL;
      NEW.approver_membership_id := NULL;
      NEW.approver_person_id := NULL;
    ELSIF NEW.status IN ('approved','rejected') THEN
      NEW.submitted_at := OLD.submitted_at;
      NEW.decided_at := now();
    ELSIF NEW.status = 'cancelled' THEN
      NEW.submitted_at := NULL;
      NEW.decided_at := now();
      NEW.approver_membership_id := NULL;
      NEW.approver_person_id := NULL;
    ELSE
      NEW.submitted_at := NULL;
      NEW.decided_at := NULL;
      NEW.approver_membership_id := NULL;
      NEW.approver_person_id := NULL;
    END IF;
    require_current_rule := OLD.status IN ('draft','prepared') OR NEW.status = 'approved';
    require_creator_authority := OLD.status IN ('draft','prepared');
  END IF;

  IF require_creator_authority THEN
    IF NOT attendance_evaluation_actor_valid_v1(
      NEW.tenant_id, NEW.certified_binding_id,
      NEW.creator_membership_id, NEW.creator_person_id
    ) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_CREATOR_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT attendance_evaluation_actor_has_capability_v1(
      NEW.tenant_id, NEW.creator_membership_id, 'attendance.evaluation.prepare'
    ) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_PREPARE_CAPABILITY_REQUIRED'
        USING ERRCODE = 'P0001';
    END IF;
    PERFORM tenant_iam_assert_no_sod_conflict(NEW.creator_membership_id);
  END IF;

  IF require_current_rule THEN
    SELECT * INTO rule_row FROM time_catalog_entry entry
    WHERE entry.id = NEW.rule_profile_entry_id AND entry.tenant_id = NEW.tenant_id
      AND entry.catalog_kind = 'rule_profile' FOR SHARE;
    IF NOT FOUND OR rule_row.status <> 'approved'
       OR rule_row.certified_binding_id <> NEW.certified_binding_id
       OR rule_row.effective_from > NEW.period_month
       OR (rule_row.effective_to IS NOT NULL
         AND rule_row.effective_to < (NEW.period_month + INTERVAL '1 month - 1 day')::date) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_RULE_NOT_APPROVED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('approved','rejected') THEN
      IF NOT attendance_evaluation_actor_valid_v1(
        NEW.tenant_id, NEW.certified_binding_id,
        NEW.approver_membership_id, NEW.approver_person_id
      ) THEN
        RAISE EXCEPTION 'ATTENDANCE_EVALUATION_APPROVER_INVALID' USING ERRCODE = 'P0001';
      END IF;
      IF NOT attendance_evaluation_actor_has_capability_v1(
        NEW.tenant_id, NEW.approver_membership_id, 'attendance.evaluation.approve'
      ) THEN
        RAISE EXCEPTION 'ATTENDANCE_EVALUATION_APPROVE_CAPABILITY_REQUIRED'
          USING ERRCODE = 'P0001';
      END IF;
      PERFORM tenant_iam_assert_no_sod_conflict(NEW.approver_membership_id);
    END IF;
    -- La evidencia debe cerrar al enviar y al aprobar. Un rechazo gobernado
    -- permanece disponible si la evidencia derivo luego del submit.
    IF NEW.status IN ('submitted','approved') THEN
      SELECT count(*) INTO stored_results FROM attendance_evaluation_result result
      WHERE result.run_id = NEW.id AND result.tenant_id = NEW.tenant_id;
      expected_manifest_sha256 := attendance_evaluation_source_manifest_v1(
        NEW.id, NEW.tenant_id
      );
      IF stored_results = 0 OR NEW.result_count <> stored_results
         OR expected_manifest_sha256 IS NULL
         OR btrim(NEW.source_manifest_sha256) <> expected_manifest_sha256 THEN
        RAISE EXCEPTION 'ATTENDANCE_EVALUATION_EVIDENCE_INCOMPLETE' USING ERRCODE = 'P0001';
      END IF;

      SELECT COALESCE(sum(source.recorded_event_count), 0)
        INTO source_recorded_events
      FROM attendance_evaluation_source source
      WHERE source.run_id = NEW.id AND source.tenant_id = NEW.tenant_id;
      SELECT COALESCE(sum(result.source_event_count), 0)
        INTO result_source_events
      FROM attendance_evaluation_result result
      WHERE result.run_id = NEW.id AND result.tenant_id = NEW.tenant_id;
      WITH actual_counts AS (
        SELECT punch.employment_contract_id, count(*)::bigint AS event_count
        FROM attendance_evaluation_source source
        JOIN attendance_raw_event raw_event
          ON raw_event.batch_id = source.ingest_batch_id
         AND raw_event.tenant_id = source.tenant_id
        JOIN attendance_canonical_punch punch
          ON punch.raw_event_id = raw_event.id
         AND punch.tenant_id = raw_event.tenant_id
        WHERE source.run_id = NEW.id AND source.tenant_id = NEW.tenant_id
          AND punch.reconciliation_state = 'mapped'
          AND punch.review_state IN ('recorded','accepted')
          AND punch.employment_contract_id IS NOT NULL
          AND punch.occurred_at >= (NEW.period_month::timestamp AT TIME ZONE NEW.timezone)
          AND punch.occurred_at < (
            (NEW.period_month + INTERVAL '1 month')::timestamp AT TIME ZONE NEW.timezone
          )
        GROUP BY punch.employment_contract_id
      ), declared_counts AS (
        SELECT result.employment_contract_id,
          result.source_event_count::bigint AS event_count
        FROM attendance_evaluation_result result
        WHERE result.run_id = NEW.id AND result.tenant_id = NEW.tenant_id
      )
      SELECT EXISTS (
        SELECT 1
        FROM actual_counts actual
        FULL JOIN declared_counts declared USING (employment_contract_id)
        WHERE COALESCE(actual.event_count, 0) <> COALESCE(declared.event_count, 0)
      ) INTO result_event_mismatch;
      IF result_source_events > source_recorded_events OR result_event_mismatch THEN
        RAISE EXCEPTION 'ATTENDANCE_EVALUATION_RESULT_EVENT_MISMATCH'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION attendance_evaluation_child_guard_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE run_row attendance_evaluation_run%ROWTYPE;
DECLARE batch_row attendance_ingest_batch%ROWTYPE;
DECLARE parent_run_id uuid;
DECLARE parent_tenant_id uuid;
DECLARE stored_event_count bigint;
DECLARE stored_event_set_sha256 text;
DECLARE expected_calculation_sha256 text;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'attendance_evaluation_result'
     AND ROW(NEW.run_id, NEW.tenant_id, NEW.employment_contract_id, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.run_id, OLD.tenant_id, OLD.employment_contract_id, OLD.created_at) THEN
    RAISE EXCEPTION 'ATTENDANCE_EVALUATION_RESULT_IDENTITY_IMMUTABLE'
      USING ERRCODE = 'P0001';
  END IF;
  parent_run_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.run_id ELSE OLD.run_id END;
  parent_tenant_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END;
  SELECT * INTO run_row FROM attendance_evaluation_run run
  WHERE run.id = parent_run_id AND run.tenant_id = parent_tenant_id FOR UPDATE;
  IF NOT FOUND OR run_row.status NOT IN ('draft','prepared') THEN
    RAISE EXCEPTION 'ATTENDANCE_EVALUATION_RESULTS_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'attendance_evaluation_source' AND TG_OP <> 'DELETE' THEN
    IF TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_SOURCE_APPEND_ONLY' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO batch_row FROM attendance_ingest_batch batch
    WHERE batch.id = NEW.ingest_batch_id AND batch.tenant_id = NEW.tenant_id
      AND batch.status = 'accepted' FOR SHARE;
    IF batch_row.id IS NULL THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_SOURCE_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    WHERE policy.tenant_id = NEW.tenant_id
      AND policy.tenant_data_plane_ready IS TRUE
      AND policy.certified_source_binding_id = run_row.certified_binding_id
      AND lower(policy.certified_release_sha) = lower(batch_row.release_sha)
    FOR SHARE OF policy, binding;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_SOURCE_BINDING_MISMATCH'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*)::bigint,
      encode(digest(convert_to(COALESCE(
        string_agg(btrim(raw_event.event_sha256), '|' ORDER BY btrim(raw_event.event_sha256)),
        ''), 'UTF8'), 'sha256'), 'hex')
      INTO stored_event_count, stored_event_set_sha256
    FROM attendance_raw_event raw_event
    WHERE raw_event.batch_id = NEW.ingest_batch_id
      AND raw_event.tenant_id = NEW.tenant_id;
    IF batch_row.payload_sha256 <> NEW.batch_payload_sha256
       OR batch_row.event_count <> NEW.batch_event_count
       OR batch_row.accepted_count <> NEW.recorded_event_count
       OR stored_event_count <> NEW.recorded_event_count
       OR stored_event_set_sha256 <> btrim(NEW.recorded_event_set_sha256) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_SOURCE_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    NEW.created_at := now();
  ELSIF TG_TABLE_NAME = 'attendance_evaluation_source' THEN
    RAISE EXCEPTION 'ATTENDANCE_EVALUATION_SOURCE_APPEND_ONLY' USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'attendance_evaluation_result' AND TG_OP <> 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM employment_contract contract
      JOIN platform_tenant_source_binding binding
        ON binding.tenant_id = NEW.tenant_id
       AND binding.id = run_row.certified_binding_id
       AND binding.source_system = 'GRH' AND binding.verified IS TRUE
       AND binding.source_company_id = contract.legacy_company_id
      JOIN source_import_batch batch ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH' AND batch.source_database = binding.source_database
       AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
      WHERE contract.id = NEW.employment_contract_id AND contract.status = 'active'
        AND contract.source_system = 'GRH'
    ) THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_CONTRACT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    expected_calculation_sha256 := encode(digest(convert_to(jsonb_build_object(
      'tenantId', NEW.tenant_id,
      'runId', NEW.run_id,
      'employmentContractId', NEW.employment_contract_id,
      'scheduledMinutes', NEW.scheduled_minutes,
      'workedMinutes', NEW.worked_minutes,
      'tardyMinutes', NEW.tardy_minutes,
      'earlyDepartureMinutes', NEW.early_departure_minutes,
      'unjustifiedAbsenceMinutes', NEW.unjustified_absence_minutes,
      'justifiedAbsenceMinutes', NEW.justified_absence_minutes,
      'tardyOccurrences', NEW.tardy_occurrences,
      'unjustifiedAbsenceDays', NEW.unjustified_absence_days,
      'sourceEventCount', NEW.source_event_count,
      'outcomeCode', NEW.outcome_code
    )::text, 'UTF8'), 'sha256'), 'hex');
    IF btrim(NEW.calculation_sha256) <> expected_calculation_sha256 THEN
      RAISE EXCEPTION 'ATTENDANCE_EVALUATION_CALCULATION_HASH_MISMATCH'
        USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
      NEW.updated_at := NEW.created_at;
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE OR REPLACE FUNCTION attendance_evaluation_audit_run_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE actor_membership uuid;
DECLARE actor_person uuid;
DECLARE command_value text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_membership := NEW.creator_membership_id; actor_person := NEW.creator_person_id;
    command_value := 'create';
  ELSE
    actor_membership := CASE WHEN NEW.status IN ('approved','rejected')
      THEN NEW.approver_membership_id ELSE NEW.creator_membership_id END;
    actor_person := CASE WHEN NEW.status IN ('approved','rejected')
      THEN NEW.approver_person_id ELSE NEW.creator_person_id END;
    command_value := CASE NEW.status
      WHEN 'prepared' THEN 'prepare'
      WHEN 'draft' THEN 'revise'
      WHEN 'submitted' THEN 'submit'
      WHEN 'approved' THEN 'approve'
      WHEN 'rejected' THEN 'reject'
      WHEN 'cancelled' THEN 'cancel'
      ELSE NEW.status
    END;
  END IF;
  INSERT INTO attendance_evaluation_audit_event (
    tenant_id, run_id, actor_membership_id, actor_person_id, command,
    from_status, to_status, run_version, reason_code,
    reason_reference, event_sha256
  ) VALUES (
    NEW.tenant_id, NEW.id, actor_membership, actor_person, command_value,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status, NEW.version, NEW.reason_code, NEW.reason_reference,
    encode(digest(convert_to(jsonb_build_object(
      'tenantId', NEW.tenant_id,
      'runId', NEW.id,
      'runVersion', NEW.version,
      'actorMembershipId', actor_membership,
      'actorPersonId', actor_person,
      'command', command_value,
      'fromStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'toStatus', NEW.status,
      'reasonCode', NEW.reason_code,
      'reasonReference', btrim(NEW.reason_reference)
    )::text, 'UTF8'), 'sha256'), 'hex')
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS attendance_evaluation_run_guard_v1 ON attendance_evaluation_run;
CREATE TRIGGER attendance_evaluation_run_guard_v1 BEFORE INSERT OR UPDATE
ON attendance_evaluation_run FOR EACH ROW EXECUTE FUNCTION attendance_evaluation_run_guard_v1();
DROP TRIGGER IF EXISTS attendance_evaluation_run_no_delete_v1 ON attendance_evaluation_run;
CREATE TRIGGER attendance_evaluation_run_no_delete_v1 BEFORE DELETE
ON attendance_evaluation_run FOR EACH ROW EXECUTE FUNCTION attendance_evaluation_reject_change_v1();
DROP TRIGGER IF EXISTS attendance_evaluation_source_guard_v1 ON attendance_evaluation_source;
CREATE TRIGGER attendance_evaluation_source_guard_v1 BEFORE INSERT OR UPDATE OR DELETE
ON attendance_evaluation_source FOR EACH ROW EXECUTE FUNCTION attendance_evaluation_child_guard_v1();
DROP TRIGGER IF EXISTS attendance_evaluation_result_guard_v1 ON attendance_evaluation_result;
CREATE TRIGGER attendance_evaluation_result_guard_v1 BEFORE INSERT OR UPDATE OR DELETE
ON attendance_evaluation_result FOR EACH ROW EXECUTE FUNCTION attendance_evaluation_child_guard_v1();
DROP TRIGGER IF EXISTS attendance_evaluation_audit_append_only_v1 ON attendance_evaluation_audit_event;
CREATE TRIGGER attendance_evaluation_audit_append_only_v1 BEFORE UPDATE OR DELETE
ON attendance_evaluation_audit_event FOR EACH ROW EXECUTE FUNCTION attendance_evaluation_reject_change_v1();
DROP TRIGGER IF EXISTS attendance_evaluation_run_audit_v1 ON attendance_evaluation_run;
CREATE TRIGGER attendance_evaluation_run_audit_v1 AFTER INSERT OR UPDATE
ON attendance_evaluation_run FOR EACH ROW EXECUTE FUNCTION attendance_evaluation_audit_run_v1();

COMMENT ON TABLE attendance_evaluation_run IS
  'Corrida mensual tenant-bound con rule_profile 011 aprobado; su aprobacion no publica nomina.';
COMMENT ON TABLE attendance_evaluation_source IS
  'Manifiesto verificable de lotes 022 y eventos crudos grabados; no duplica eventos ni biometria.';
COMMENT ON TABLE attendance_evaluation_result IS
  'Metricas por employment_contract_id canonico, sin nombre, DNI, CUIL, legajo, email ni biometria.';
COMMENT ON TABLE attendance_evaluation_audit_event IS
  'Auditoria append-only maker-checker; payroll_posted permanece siempre false.';
COMMENT ON COLUMN attendance_evaluation_run.reason_reference IS
  'Referencia opaca al respaldo externo; no afirma conservar ni verificar su contenido.';
COMMENT ON COLUMN attendance_evaluation_audit_event.reason_reference IS
  'Copia auditable de la referencia opaca de la transicion; no es un hash de evidencia.';

REVOKE ALL PRIVILEGES ON TABLE attendance_evaluation_run,
  attendance_evaluation_source, attendance_evaluation_result,
  attendance_evaluation_audit_event FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE attendance_evaluation_run,
  attendance_evaluation_source, attendance_evaluation_result,
  attendance_evaluation_audit_event FROM municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION attendance_evaluation_reject_change_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_evaluation_actor_valid_v1(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_evaluation_actor_has_capability_v1(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_evaluation_source_manifest_v1(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_evaluation_run_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_evaluation_child_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_evaluation_audit_run_v1() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_reject_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_actor_valid_v1(uuid,uuid,uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_actor_has_capability_v1(uuid,uuid,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_source_manifest_v1(uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_run_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_child_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_evaluation_audit_run_v1()
  FROM municontrol_actions_runtime_app;
