-- MuniControl Friendly - Sprint 010B / migration 011
-- Catalogo temporal versionado y gobernado. Este contrato no ingiere fichadas,
-- no calcula jornadas/minutos/importes y no escribe GRH, payroll ni action_case.

INSERT INTO iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  ('time.catalog.read', 'Consultar catalogo temporal',
   'Consulta calendarios, turnos, reglas y asignaciones sin proyectar legajos ni localizadores.',
   'tenant', 'standard'),
  ('time.catalog.propose', 'Proponer catalogo temporal',
   'Prepara versiones de calendarios, turnos, reglas y asignaciones para revision humana.',
   'tenant', 'privileged'),
  ('time.catalog.approve', 'Aprobar catalogo temporal',
   'Aprueba, rechaza o retira versiones propuestas por otra persona.',
   'tenant', 'restricted'),
  ('time.catalog.audit.read', 'Auditar catalogo temporal',
   'Consulta transiciones gobernadas sin exponer identificadores laborales.',
   'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES
  ('time.catalog.approve', 'time.catalog.propose',
   'La propuesta y la aprobacion del catalogo temporal deben estar separadas.'),
  ('time.overtime.post', 'time.catalog.approve',
   'Quien gobierna reglas temporales no debe impactar mayor esfuerzo.')
ON CONFLICT (capability_key, conflicts_with_key)
DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO iam_role (
  role_key, label, description, scope_kind, system_managed
) VALUES
  ('JUNIN_TIEMPO_CATALOGO_PROPONENTE', 'Tiempo y asistencia - proponente de catalogo',
   'Prepara calendarios, turnos, reglas y asignaciones; no los aprueba.', 'tenant', true),
  ('JUNIN_TIEMPO_CATALOGO_APROBADOR', 'Tiempo y asistencia - aprobador de catalogo',
   'Revisa versiones propuestas por otra persona y consulta su auditoria.', 'tenant', true)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  system_managed = EXCLUDED.system_managed;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('JUNIN_TIEMPO_CATALOGO_PROPONENTE', 'time.catalog.read'),
  ('JUNIN_TIEMPO_CATALOGO_PROPONENTE', 'time.catalog.propose'),
  ('JUNIN_TIEMPO_CATALOGO_APROBADOR', 'time.catalog.read'),
  ('JUNIN_TIEMPO_CATALOGO_APROBADOR', 'time.catalog.approve'),
  ('JUNIN_TIEMPO_CATALOGO_APROBADOR', 'time.catalog.audit.read')
ON CONFLICT DO NOTHING;

-- 010A solo admitia relaciones PostgreSQL/archivos tabulares. La evidencia real
-- recibida por Junin es un dump logico MariaDB/MySQL; 011 preserva esa verdad de
-- procedencia y evita reclasificarla como postgres_relation.
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
    AND p_source_format IN (
      'csv','json','jsonl','parquet','postgres_relation','fixed_width',
      'mariadb_dump','mysql_dump'
    )
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

CREATE OR REPLACE FUNCTION time_catalog_reason_allowed_v1(
  p_command text,
  p_reason_code text
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(CASE p_command
    WHEN 'create_draft' THEN p_reason_code IN ('catalog_onboarding','new_revision')
    WHEN 'update_draft' THEN p_reason_code IN ('draft_corrected')
    WHEN 'submit' THEN p_reason_code IN ('ready_for_review')
    WHEN 'approve' THEN p_reason_code IN ('configuration_verified')
    WHEN 'reject' THEN p_reason_code IN (
      'configuration_invalid','evidence_insufficient','source_not_authoritative'
    )
    WHEN 'retire' THEN p_reason_code IN ('superseded','catalog_retired','binding_changed')
    ELSE false
  END, false)
$$;

CREATE OR REPLACE FUNCTION time_catalog_parameter_value_valid_v1(
  p_value_kind text,
  p_integer_value bigint,
  p_decimal_value numeric,
  p_boolean_value boolean,
  p_time_value time,
  p_code_value text,
  p_unit_code text
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    p_value_kind IN ('integer','decimal','boolean','time','code')
    AND p_unit_code ~ '^[a-z][a-z0-9_]{1,31}$'
    AND CASE p_value_kind
      WHEN 'integer' THEN p_integer_value IS NOT NULL
        AND p_decimal_value IS NULL AND p_boolean_value IS NULL
        AND p_time_value IS NULL AND p_code_value IS NULL
      WHEN 'decimal' THEN p_integer_value IS NULL
        AND p_decimal_value IS NOT NULL AND p_boolean_value IS NULL
        AND p_time_value IS NULL AND p_code_value IS NULL
      WHEN 'boolean' THEN p_integer_value IS NULL
        AND p_decimal_value IS NULL AND p_boolean_value IS NOT NULL
        AND p_time_value IS NULL AND p_code_value IS NULL
      WHEN 'time' THEN p_integer_value IS NULL
        AND p_decimal_value IS NULL AND p_boolean_value IS NULL
        AND p_time_value IS NOT NULL AND p_code_value IS NULL
      WHEN 'code' THEN p_integer_value IS NULL
        AND p_decimal_value IS NULL AND p_boolean_value IS NULL
        AND p_time_value IS NULL
        AND p_code_value ~ '^[a-z][a-z0-9_.-]{1,95}$'
      ELSE false
    END
$$;

CREATE TABLE IF NOT EXISTS time_catalog_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  certified_binding_id uuid NOT NULL,
  catalog_kind varchar(24) NOT NULL,
  logical_key_hash char(64) NOT NULL,
  revision integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  timezone varchar(64) NOT NULL,
  source_contract_id uuid,
  source_contract_certified_binding_id uuid,
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
  CONSTRAINT time_catalog_entry_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT time_catalog_entry_id_tenant_kind_uk UNIQUE (id, tenant_id, catalog_kind),
  CONSTRAINT time_catalog_entry_id_tenant_binding_uk
    UNIQUE (id, tenant_id, certified_binding_id),
  CONSTRAINT time_catalog_entry_logical_revision_uk
    UNIQUE (tenant_id, catalog_kind, logical_key_hash, revision),
  CONSTRAINT time_catalog_entry_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_entry_source_contract_fk
    FOREIGN KEY (source_contract_id, tenant_id, source_contract_certified_binding_id)
    REFERENCES time_source_contract(id, tenant_id, certified_binding_id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_entry_proposer_membership_fk
    FOREIGN KEY (proposer_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_entry_approver_membership_fk
    FOREIGN KEY (approver_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_entry_kind_ck CHECK (
    catalog_kind IN ('calendar','shift','rule_profile','assignment')
  ),
  CONSTRAINT time_catalog_entry_hash_ck CHECK (logical_key_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT time_catalog_entry_revision_ck CHECK (revision > 0),
  CONSTRAINT time_catalog_entry_effective_ck CHECK (
    effective_from BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
    AND (effective_to IS NULL OR (
      effective_to BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
      AND effective_to >= effective_from
    ))
  ),
  CONSTRAINT time_catalog_entry_timezone_ck CHECK (timezone = 'America/Argentina/Mendoza'),
  CONSTRAINT time_catalog_entry_source_pair_ck CHECK (
    (source_contract_id IS NULL AND source_contract_certified_binding_id IS NULL)
    OR (source_contract_id IS NOT NULL
      AND source_contract_certified_binding_id = certified_binding_id)
  ),
  CONSTRAINT time_catalog_entry_status_ck CHECK (
    status IN ('draft','submitted','approved','rejected','retired')
  ),
  CONSTRAINT time_catalog_entry_version_ck CHECK (version > 0),
  CONSTRAINT time_catalog_entry_reason_ck CHECK (
    reason_code IN (
      'catalog_onboarding','new_revision','draft_corrected','ready_for_review',
      'configuration_verified','configuration_invalid','evidence_insufficient',
      'source_not_authoritative','superseded','catalog_retired','binding_changed'
    ) AND reason_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT time_catalog_entry_approver_pair_ck CHECK (
    (approver_person_id IS NULL AND approver_membership_id IS NULL)
    OR (approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
  ),
  CONSTRAINT time_catalog_entry_maker_checker_ck CHECK (
    approver_person_id IS NULL
    OR (approver_person_id <> proposer_person_id
      AND approver_membership_id <> proposer_membership_id)
  ),
  CONSTRAINT time_catalog_entry_state_ck CHECK (
    (status = 'draft' AND submitted_at IS NULL AND decided_at IS NULL
      AND retired_at IS NULL AND approver_person_id IS NULL
      AND approver_membership_id IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND retired_at IS NULL AND approver_person_id IS NULL
      AND approver_membership_id IS NULL)
    OR (status IN ('approved','rejected') AND submitted_at IS NOT NULL
      AND decided_at IS NOT NULL AND retired_at IS NULL
      AND approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
    OR (status = 'retired' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
      AND retired_at IS NOT NULL
      AND approver_person_id IS NOT NULL AND approver_membership_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS time_calendar_day (
  catalog_entry_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  catalog_kind varchar(24) NOT NULL DEFAULT 'calendar',
  day_date date NOT NULL,
  day_kind varchar(20) NOT NULL,
  day_code varchar(64) NOT NULL,
  evidence_sha256 char(64),
  PRIMARY KEY (catalog_entry_id, day_date),
  CONSTRAINT time_calendar_day_entry_fk
    FOREIGN KEY (catalog_entry_id, tenant_id, catalog_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_calendar_day_tenant_date_uk
    UNIQUE (catalog_entry_id, tenant_id, day_date),
  CONSTRAINT time_calendar_day_kind_ck CHECK (catalog_kind = 'calendar'),
  CONSTRAINT time_calendar_day_type_ck CHECK (
    day_kind IN ('working','non_working','holiday','special')
  ),
  CONSTRAINT time_calendar_day_code_ck CHECK (
    day_code ~ '^[a-z][a-z0-9_.-]{1,63}$'
  ),
  CONSTRAINT time_calendar_day_evidence_ck CHECK (
    evidence_sha256 IS NULL OR evidence_sha256 ~ '^[a-f0-9]{64}$'
  )
);

CREATE TABLE IF NOT EXISTS time_shift_spec (
  catalog_entry_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  catalog_kind varchar(24) NOT NULL DEFAULT 'shift',
  entry_tolerance_seconds integer NOT NULL DEFAULT 0,
  exit_tolerance_seconds integer NOT NULL DEFAULT 0,
  CONSTRAINT time_shift_spec_entry_fk
    FOREIGN KEY (catalog_entry_id, tenant_id, catalog_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_shift_spec_kind_ck CHECK (catalog_kind = 'shift'),
  CONSTRAINT time_shift_spec_tolerance_ck CHECK (
    entry_tolerance_seconds BETWEEN 0 AND 21600
    AND exit_tolerance_seconds BETWEEN 0 AND 21600
  )
);

CREATE TABLE IF NOT EXISTS time_shift_weekly_interval (
  catalog_entry_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  catalog_kind varchar(24) NOT NULL DEFAULT 'shift',
  weekday smallint NOT NULL,
  interval_sequence smallint NOT NULL,
  interval_kind varchar(16) NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  PRIMARY KEY (catalog_entry_id, weekday, interval_sequence),
  CONSTRAINT time_shift_weekly_interval_entry_fk
    FOREIGN KEY (catalog_entry_id, tenant_id, catalog_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_shift_weekly_interval_kind_ck CHECK (catalog_kind = 'shift'),
  CONSTRAINT time_shift_weekly_interval_weekday_ck CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT time_shift_weekly_interval_sequence_ck CHECK (
    interval_sequence BETWEEN 1 AND 32
  ),
  CONSTRAINT time_shift_weekly_interval_type_ck CHECK (
    interval_kind IN ('work','break','on_call')
  ),
  CONSTRAINT time_shift_weekly_interval_shape_ck CHECK (
    starts_at < TIME '24:00:00'
    AND ends_at < TIME '24:00:00'
    AND (
      (crosses_midnight IS FALSE AND starts_at < ends_at)
      OR (crosses_midnight IS TRUE AND starts_at > ends_at)
    )
  )
);

CREATE TABLE IF NOT EXISTS time_rule_parameter (
  catalog_entry_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  catalog_kind varchar(24) NOT NULL DEFAULT 'rule_profile',
  parameter_key varchar(96) NOT NULL,
  value_kind varchar(16) NOT NULL,
  integer_value bigint,
  decimal_value numeric(20,6),
  boolean_value boolean,
  time_value time,
  code_value varchar(96),
  unit_code varchar(32) NOT NULL,
  PRIMARY KEY (catalog_entry_id, parameter_key),
  CONSTRAINT time_rule_parameter_entry_fk
    FOREIGN KEY (catalog_entry_id, tenant_id, catalog_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_rule_parameter_kind_ck CHECK (catalog_kind = 'rule_profile'),
  CONSTRAINT time_rule_parameter_key_ck CHECK (
    parameter_key ~ '^[a-z][a-z0-9_.-]{2,95}$'
  ),
  CONSTRAINT time_rule_parameter_value_ck CHECK (
    time_catalog_parameter_value_valid_v1(
      value_kind, integer_value, decimal_value, boolean_value,
      time_value, code_value, unit_code
    )
  )
);

CREATE TABLE IF NOT EXISTS time_assignment_spec (
  catalog_entry_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  catalog_kind varchar(24) NOT NULL DEFAULT 'assignment',
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id) ON DELETE RESTRICT,
  shift_entry_id uuid NOT NULL,
  shift_kind varchar(24) NOT NULL DEFAULT 'shift',
  calendar_entry_id uuid NOT NULL,
  calendar_kind varchar(24) NOT NULL DEFAULT 'calendar',
  rule_profile_entry_id uuid NOT NULL,
  rule_profile_kind varchar(24) NOT NULL DEFAULT 'rule_profile',
  CONSTRAINT time_assignment_spec_entry_fk
    FOREIGN KEY (catalog_entry_id, tenant_id, catalog_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_assignment_spec_shift_fk
    FOREIGN KEY (shift_entry_id, tenant_id, shift_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_assignment_spec_calendar_fk
    FOREIGN KEY (calendar_entry_id, tenant_id, calendar_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_assignment_spec_rule_fk
    FOREIGN KEY (rule_profile_entry_id, tenant_id, rule_profile_kind)
    REFERENCES time_catalog_entry(id, tenant_id, catalog_kind) ON DELETE RESTRICT,
  CONSTRAINT time_assignment_spec_kind_ck CHECK (
    catalog_kind = 'assignment' AND shift_kind = 'shift'
    AND calendar_kind = 'calendar' AND rule_profile_kind = 'rule_profile'
  )
);

CREATE TABLE IF NOT EXISTS time_catalog_governance_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  catalog_entry_id uuid NOT NULL,
  catalog_certified_binding_id uuid NOT NULL,
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
  CONSTRAINT time_catalog_governance_event_entry_fk
    FOREIGN KEY (catalog_entry_id, tenant_id, catalog_certified_binding_id)
    REFERENCES time_catalog_entry(id, tenant_id, certified_binding_id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_governance_event_catalog_binding_fk
    FOREIGN KEY (tenant_id, catalog_certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_governance_event_actor_binding_fk
    FOREIGN KEY (tenant_id, actor_certified_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_governance_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT time_catalog_governance_event_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT time_catalog_governance_event_command_ck CHECK (
    command IN ('create_draft','update_draft','submit','approve','reject','retire')
  ),
  CONSTRAINT time_catalog_governance_event_context_ck CHECK (
    actor_session_version > 0
    AND release_sha ~ '^[a-f0-9]{40}$'
    AND command_hash ~ '^[a-f0-9]{64}$'
    AND reason_hash ~ '^[a-f0-9]{64}$'
    AND expected_version >= 0
    AND resulting_version = expected_version + 1
    AND ((command = 'create_draft' AND expected_version = 0)
      OR (command <> 'create_draft' AND expected_version > 0))
    AND time_catalog_reason_allowed_v1(command, reason_code)
  ),
  CONSTRAINT time_catalog_governance_event_json_ck CHECK (
    jsonb_typeof(before_snapshot) = 'object'
    AND jsonb_typeof(after_snapshot) = 'object'
    AND jsonb_typeof(result) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS time_catalog_entry_tenant_list_idx
  ON time_catalog_entry (tenant_id, catalog_kind, status, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS time_catalog_entry_effective_idx
  ON time_catalog_entry (
    tenant_id, catalog_kind, logical_key_hash, status, effective_from, effective_to
  );
CREATE INDEX IF NOT EXISTS time_calendar_day_date_idx
  ON time_calendar_day (tenant_id, day_date, catalog_entry_id);
CREATE INDEX IF NOT EXISTS time_shift_interval_day_idx
  ON time_shift_weekly_interval (tenant_id, catalog_entry_id, weekday, starts_at);
CREATE INDEX IF NOT EXISTS time_assignment_contract_idx
  ON time_assignment_spec (tenant_id, employment_contract_id, catalog_entry_id);
CREATE INDEX IF NOT EXISTS time_catalog_event_timeline_idx
  ON time_catalog_governance_event (tenant_id, catalog_entry_id, occurred_at, id);

-- Half-open clock intervals are projected onto a cyclic [0, 604800) week.
-- An overnight Sunday interval is split at the week boundary so Monday overlap
-- is detected without deriving attendance, payable minutes or payroll results.
CREATE OR REPLACE FUNCTION time_catalog_normalized_week_segments_v1(
  p_weekday smallint,
  p_starts_at time,
  p_ends_at time,
  p_crosses_midnight boolean
)
RETURNS TABLE(segment_start numeric, segment_end numeric)
LANGUAGE sql IMMUTABLE STRICT SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH normalized_bounds AS (
    SELECT
      (((p_weekday::integer - 1) * 86400)::numeric
        + extract(epoch FROM p_starts_at)) AS normalized_start,
      (((p_weekday::integer - 1) * 86400)::numeric
        + extract(epoch FROM p_ends_at)
        + CASE WHEN p_crosses_midnight THEN 86400 ELSE 0 END) AS normalized_end
    WHERE p_weekday BETWEEN 1 AND 7
      AND p_starts_at < TIME '24:00:00'
      AND p_ends_at < TIME '24:00:00'
      AND (
        (p_crosses_midnight IS FALSE AND p_starts_at < p_ends_at)
        OR (p_crosses_midnight IS TRUE AND p_starts_at > p_ends_at)
      )
  )
  SELECT normalized_start, LEAST(normalized_end, 604800::numeric)
  FROM normalized_bounds
  WHERE normalized_start < LEAST(normalized_end, 604800::numeric)
  UNION ALL
  SELECT 0::numeric, normalized_end - 604800::numeric
  FROM normalized_bounds
  WHERE normalized_end > 604800::numeric
    AND normalized_end - 604800::numeric > 0
$$;

CREATE OR REPLACE FUNCTION time_catalog_payload_valid_v1(
  p_catalog_kind text,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  item jsonb;
  item_keys text[];
  value_kind text;
  integer_value bigint;
  decimal_value numeric;
  boolean_value boolean;
  time_value time;
  code_value text;
  allowed_root_keys text[] := ARRAY[
    'effectiveFrom','effectiveTo','logicalKeyHash','revision',
    'sourceContractId','spec','timezone'
  ];
BEGIN
  IF p_catalog_kind NOT IN ('calendar','shift','rule_profile','assignment')
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR NOT (p_payload ?& ARRAY[
       'effectiveFrom','logicalKeyHash','revision','spec','timezone'
     ])
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) key
       WHERE NOT key = ANY(allowed_root_keys)
     )
     OR jsonb_typeof(p_payload->'effectiveFrom') IS DISTINCT FROM 'string'
     OR (p_payload ? 'effectiveTo'
       AND jsonb_typeof(p_payload->'effectiveTo') IS DISTINCT FROM 'string')
     OR jsonb_typeof(p_payload->'logicalKeyHash') IS DISTINCT FROM 'string'
     OR lower(p_payload->>'logicalKeyHash') !~ '^[a-f0-9]{64}$'
     OR jsonb_typeof(p_payload->'revision') IS DISTINCT FROM 'number'
     OR p_payload->>'revision' !~ '^[1-9][0-9]{0,5}$'
     OR jsonb_typeof(p_payload->'timezone') IS DISTINCT FROM 'string'
     OR p_payload->>'timezone' <> 'America/Argentina/Mendoza'
     OR jsonb_typeof(p_payload->'spec') IS DISTINCT FROM 'object'
     OR (p_payload ? 'sourceContractId'
       AND jsonb_typeof(p_payload->'sourceContractId') IS DISTINCT FROM 'string') THEN
    RETURN false;
  END IF;
  IF p_payload->>'effectiveFrom' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR (p_payload ? 'effectiveTo'
       AND p_payload->>'effectiveTo' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
     OR (p_payload->>'effectiveFrom')::date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
     OR (p_payload ? 'effectiveTo' AND (
       (p_payload->>'effectiveTo')::date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
       OR (p_payload->>'effectiveTo')::date < (p_payload->>'effectiveFrom')::date
     )) THEN
    RETURN false;
  END IF;
  IF p_payload ? 'sourceContractId' THEN
    PERFORM (p_payload->>'sourceContractId')::uuid;
  END IF;

  IF p_catalog_kind = 'calendar' THEN
    IF NOT (p_payload->'spec' ? 'days')
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload->'spec') key WHERE key <> 'days')
       OR jsonb_typeof(p_payload->'spec'->'days') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'spec'->'days') NOT BETWEEN 1 AND 732 THEN
      RETURN false;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'spec'->'days') row(value)
    LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object'
         OR NOT (item ?& ARRAY['code','date','kind'])
         OR EXISTS (
           SELECT 1 FROM jsonb_object_keys(item) key
           WHERE key NOT IN ('code','date','evidenceSha256','kind')
         )
         OR jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
         OR item->>'code' !~ '^[a-z][a-z0-9_.-]{1,63}$'
         OR jsonb_typeof(item->'date') IS DISTINCT FROM 'string'
         OR item->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR (item->>'date')::date NOT BETWEEN (p_payload->>'effectiveFrom')::date
           AND COALESCE((p_payload->>'effectiveTo')::date, DATE 'infinity')
         OR jsonb_typeof(item->'kind') IS DISTINCT FROM 'string'
         OR item->>'kind' NOT IN ('working','non_working','holiday','special')
         OR (item ? 'evidenceSha256' AND (
           jsonb_typeof(item->'evidenceSha256') IS DISTINCT FROM 'string'
           OR lower(item->>'evidenceSha256') !~ '^[a-f0-9]{64}$'
         )) THEN RETURN false; END IF;
    END LOOP;
  ELSIF p_catalog_kind = 'shift' THEN
    IF NOT (p_payload->'spec' ?& ARRAY[
         'entryToleranceSeconds','exitToleranceSeconds','intervals'
       ])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload->'spec') key
         WHERE key NOT IN ('entryToleranceSeconds','exitToleranceSeconds','intervals')
       )
       OR jsonb_typeof(p_payload->'spec'->'entryToleranceSeconds') IS DISTINCT FROM 'number'
       OR p_payload->'spec'->>'entryToleranceSeconds' !~ '^(0|[1-9][0-9]{0,4})$'
       OR (p_payload->'spec'->>'entryToleranceSeconds')::integer NOT BETWEEN 0 AND 21600
       OR jsonb_typeof(p_payload->'spec'->'exitToleranceSeconds') IS DISTINCT FROM 'number'
       OR p_payload->'spec'->>'exitToleranceSeconds' !~ '^(0|[1-9][0-9]{0,4})$'
       OR (p_payload->'spec'->>'exitToleranceSeconds')::integer NOT BETWEEN 0 AND 21600
       OR jsonb_typeof(p_payload->'spec'->'intervals') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'spec'->'intervals') NOT BETWEEN 1 AND 224 THEN
      RETURN false;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'spec'->'intervals') row(value)
    LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object'
         OR NOT (item ?& ARRAY[
           'crossesMidnight','day','end','kind','sequence','start'
         ])
         OR EXISTS (
           SELECT 1 FROM jsonb_object_keys(item) key
           WHERE key NOT IN (
             'crossesMidnight','day','end','kind','sequence','start'
           )
         )
         OR jsonb_typeof(item->'crossesMidnight') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(item->'day') IS DISTINCT FROM 'number'
         OR item->>'day' !~ '^[1-7]$'
         OR jsonb_typeof(item->'sequence') IS DISTINCT FROM 'number'
         OR item->>'sequence' !~ '^(?:[1-9]|[12][0-9]|3[0-2])$'
         OR jsonb_typeof(item->'kind') IS DISTINCT FROM 'string'
         OR item->>'kind' NOT IN ('work','break','on_call')
         OR jsonb_typeof(item->'start') IS DISTINCT FROM 'string'
         OR item->>'start' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
         OR jsonb_typeof(item->'end') IS DISTINCT FROM 'string'
         OR item->>'end' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
         OR (
           (item->>'crossesMidnight')::boolean IS FALSE
           AND (item->>'start')::time >= (item->>'end')::time
         )
         OR (
           (item->>'crossesMidnight')::boolean IS TRUE
           AND (item->>'start')::time <= (item->>'end')::time
         ) THEN RETURN false; END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payload->'spec'->'intervals')
        WITH ORDINALITY AS left_interval(item, item_order)
      CROSS JOIN LATERAL jsonb_array_elements(p_payload->'spec'->'intervals')
        WITH ORDINALITY AS right_interval(item, item_order)
      CROSS JOIN LATERAL time_catalog_normalized_week_segments_v1(
        (left_interval.item->>'day')::smallint,
        (left_interval.item->>'start')::time,
        (left_interval.item->>'end')::time,
        (left_interval.item->>'crossesMidnight')::boolean
      ) left_segment
      CROSS JOIN LATERAL time_catalog_normalized_week_segments_v1(
        (right_interval.item->>'day')::smallint,
        (right_interval.item->>'start')::time,
        (right_interval.item->>'end')::time,
        (right_interval.item->>'crossesMidnight')::boolean
      ) right_segment
      WHERE left_interval.item_order < right_interval.item_order
        AND left_segment.segment_start < right_segment.segment_end
        AND right_segment.segment_start < left_segment.segment_end
    ) THEN RETURN false; END IF;
  ELSIF p_catalog_kind = 'rule_profile' THEN
    IF NOT (p_payload->'spec' ? 'parameters')
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload->'spec') key WHERE key <> 'parameters'
       )
       OR jsonb_typeof(p_payload->'spec'->'parameters') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'spec'->'parameters') NOT BETWEEN 1 AND 256 THEN
      RETURN false;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'spec'->'parameters') row(value)
    LOOP
      SELECT array_agg(key ORDER BY key) INTO item_keys FROM jsonb_object_keys(item) key;
      IF jsonb_typeof(item) IS DISTINCT FROM 'object'
         OR item_keys IS DISTINCT FROM ARRAY['key','unitCode','value','valueKind']::text[]
         OR jsonb_typeof(item->'key') IS DISTINCT FROM 'string'
         OR item->>'key' !~ '^[a-z][a-z0-9_.-]{2,95}$'
         OR jsonb_typeof(item->'unitCode') IS DISTINCT FROM 'string'
         OR item->>'unitCode' !~ '^[a-z][a-z0-9_]{1,31}$'
         OR jsonb_typeof(item->'valueKind') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
      value_kind := item->>'valueKind';
      integer_value := NULL; decimal_value := NULL; boolean_value := NULL;
      time_value := NULL; code_value := NULL;
      IF value_kind = 'integer' THEN
        IF jsonb_typeof(item->'value') IS DISTINCT FROM 'number'
           OR item->>'value' !~ '^-?(?:0|[1-9][0-9]{0,17})$' THEN RETURN false; END IF;
        integer_value := (item->>'value')::bigint;
      ELSIF value_kind = 'decimal' THEN
        IF jsonb_typeof(item->'value') IS DISTINCT FROM 'number'
           OR item->>'value' !~ '^-?(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$' THEN RETURN false; END IF;
        decimal_value := (item->>'value')::numeric;
      ELSIF value_kind = 'boolean' THEN
        IF jsonb_typeof(item->'value') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
        boolean_value := (item->>'value')::boolean;
      ELSIF value_kind = 'time' THEN
        IF jsonb_typeof(item->'value') IS DISTINCT FROM 'string'
           OR item->>'value' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' THEN RETURN false; END IF;
        time_value := (item->>'value')::time;
      ELSIF value_kind = 'code' THEN
        IF jsonb_typeof(item->'value') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
        code_value := item->>'value';
      ELSE RETURN false;
      END IF;
      IF NOT time_catalog_parameter_value_valid_v1(
        value_kind, integer_value, decimal_value, boolean_value,
        time_value, code_value, item->>'unitCode'
      ) THEN RETURN false; END IF;
    END LOOP;
  ELSE
    SELECT array_agg(key ORDER BY key) INTO item_keys
    FROM jsonb_object_keys(p_payload->'spec') key;
    IF item_keys IS DISTINCT FROM ARRAY[
         'calendarEntryId','employmentContractId','ruleProfileEntryId','shiftEntryId'
       ]::text[]
       OR EXISTS (
         SELECT 1 FROM jsonb_each(p_payload->'spec') pair
         WHERE jsonb_typeof(pair.value) IS DISTINCT FROM 'string'
       ) THEN RETURN false; END IF;
    PERFORM (p_payload->'spec'->>'calendarEntryId')::uuid;
    PERFORM (p_payload->'spec'->>'employmentContractId')::uuid;
    PERFORM (p_payload->'spec'->>'ruleProfileEntryId')::uuid;
    PERFORM (p_payload->'spec'->>'shiftEntryId')::uuid;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_entry_snapshot_v1(
  p_catalog_entry_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  entry_row time_catalog_entry%ROWTYPE;
  config_value jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO entry_row FROM time_catalog_entry entry
  WHERE entry.id = p_catalog_entry_id AND entry.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  IF entry_row.catalog_kind = 'calendar' THEN
    SELECT jsonb_build_object('days', COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'date', day.day_date, 'kind', day.day_kind, 'code', day.day_code,
      'evidencePresent', day.evidence_sha256 IS NOT NULL
    )) ORDER BY day.day_date), '[]'::jsonb))
    INTO config_value
    FROM time_calendar_day day
    WHERE day.catalog_entry_id = entry_row.id AND day.tenant_id = entry_row.tenant_id;
  ELSIF entry_row.catalog_kind = 'shift' THEN
    SELECT jsonb_build_object(
      'entryToleranceSeconds', spec.entry_tolerance_seconds,
      'exitToleranceSeconds', spec.exit_tolerance_seconds,
      'intervals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'day', interval.weekday, 'sequence', interval.interval_sequence,
        'kind', interval.interval_kind, 'start', interval.starts_at,
        'end', interval.ends_at, 'crossesMidnight', interval.crosses_midnight
      ) ORDER BY interval.weekday, interval.interval_sequence)
      FROM time_shift_weekly_interval interval
      WHERE interval.catalog_entry_id = entry_row.id
        AND interval.tenant_id = entry_row.tenant_id), '[]'::jsonb)
    ) INTO config_value
    FROM time_shift_spec spec
    WHERE spec.catalog_entry_id = entry_row.id AND spec.tenant_id = entry_row.tenant_id;
  ELSIF entry_row.catalog_kind = 'rule_profile' THEN
    SELECT jsonb_build_object('parameters', COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'key', parameter.parameter_key, 'valueKind', parameter.value_kind,
      'integerValue', parameter.integer_value, 'decimalValue', parameter.decimal_value,
      'booleanValue', parameter.boolean_value, 'timeValue', parameter.time_value,
      'codeValue', parameter.code_value, 'unitCode', parameter.unit_code
    )) ORDER BY parameter.parameter_key), '[]'::jsonb))
    INTO config_value
    FROM time_rule_parameter parameter
    WHERE parameter.catalog_entry_id = entry_row.id
      AND parameter.tenant_id = entry_row.tenant_id;
  ELSE
    SELECT jsonb_build_object(
      'targetType', 'canonical_employment_contract',
      'targetProjected', false,
      'shiftRevision', shift_entry.revision,
      'calendarRevision', calendar_entry.revision,
      'ruleProfileRevision', rule_entry.revision
    ) INTO config_value
    FROM time_assignment_spec assignment
    JOIN time_catalog_entry shift_entry
      ON shift_entry.id = assignment.shift_entry_id
     AND shift_entry.tenant_id = assignment.tenant_id
    JOIN time_catalog_entry calendar_entry
      ON calendar_entry.id = assignment.calendar_entry_id
     AND calendar_entry.tenant_id = assignment.tenant_id
    JOIN time_catalog_entry rule_entry
      ON rule_entry.id = assignment.rule_profile_entry_id
     AND rule_entry.tenant_id = assignment.tenant_id
    WHERE assignment.catalog_entry_id = entry_row.id
      AND assignment.tenant_id = entry_row.tenant_id;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'id', entry_row.id,
    'kind', entry_row.catalog_kind,
    'revision', entry_row.revision,
    'effectiveFrom', entry_row.effective_from,
    'effectiveTo', entry_row.effective_to,
    'timezone', entry_row.timezone,
    'sourceLinked', entry_row.source_contract_id IS NOT NULL,
    'status', entry_row.status,
    'version', entry_row.version,
    'reasonCode', entry_row.reason_code,
    'configuration', COALESCE(config_value, '{}'::jsonb),
    'timestamps', jsonb_strip_nulls(jsonb_build_object(
      'createdAt', entry_row.created_at,
      'updatedAt', entry_row.updated_at,
      'submittedAt', entry_row.submitted_at,
      'decidedAt', entry_row.decided_at,
      'retiredAt', entry_row.retired_at
    ))
  ));
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_assert_approvable_v1(
  p_catalog_entry_id uuid,
  p_tenant_id uuid,
  p_certified_binding_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  entry_row time_catalog_entry%ROWTYPE;
  assignment_row time_assignment_spec%ROWTYPE;
BEGIN
  SELECT * INTO entry_row FROM time_catalog_entry entry
  WHERE entry.id = p_catalog_entry_id
    AND entry.tenant_id = p_tenant_id
    AND entry.certified_binding_id = p_certified_binding_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id
   AND binding.tenant_id = policy.tenant_id
   AND binding.source_system = 'GRH'
   AND binding.verified IS TRUE
  WHERE policy.tenant_id = entry_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND binding.id = entry_row.certified_binding_id
  FOR SHARE OF policy, binding;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_BINDING_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF entry_row.source_contract_id IS NOT NULL THEN
    PERFORM 1 FROM time_source_contract source
    WHERE source.id = entry_row.source_contract_id
      AND source.tenant_id = entry_row.tenant_id
      AND source.certified_binding_id = entry_row.certified_binding_id
      AND source.status = 'approved'
      AND source.domain = CASE entry_row.catalog_kind
        WHEN 'calendar' THEN 'holiday_calendar'
        WHEN 'rule_profile' THEN 'municipal_rule_profile'
        ELSE 'shift_assignment'
      END
      AND source.coverage_from <= entry_row.effective_from
      AND source.coverage_to >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_SOURCE_NOT_APPROVED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF entry_row.catalog_kind = 'calendar' THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_calendar_day day
      WHERE day.catalog_entry_id = entry_row.id
        AND day.tenant_id = entry_row.tenant_id
        AND day.day_date BETWEEN entry_row.effective_from
          AND COALESCE(entry_row.effective_to, DATE 'infinity')
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_CALENDAR_EMPTY' USING ERRCODE = 'P0001';
    END IF;
  ELSIF entry_row.catalog_kind = 'shift' THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_shift_spec spec
      JOIN time_shift_weekly_interval interval
        ON interval.catalog_entry_id = spec.catalog_entry_id
       AND interval.tenant_id = spec.tenant_id
      WHERE spec.catalog_entry_id = entry_row.id
        AND spec.tenant_id = entry_row.tenant_id
        AND interval.interval_kind = 'work'
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_SHIFT_EMPTY' USING ERRCODE = 'P0001';
    END IF;
  ELSIF entry_row.catalog_kind = 'rule_profile' THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_rule_parameter parameter
      WHERE parameter.catalog_entry_id = entry_row.id
        AND parameter.tenant_id = entry_row.tenant_id
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_RULES_EMPTY' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT * INTO assignment_row FROM time_assignment_spec assignment
    WHERE assignment.catalog_entry_id = entry_row.id
      AND assignment.tenant_id = entry_row.tenant_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_EMPTY' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM platform_tenant_source_binding binding
    JOIN employment_contract contract
      ON contract.id = assignment_row.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.status = 'active'
     AND contract.legacy_company_id = binding.source_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE binding.id = entry_row.certified_binding_id
      AND binding.tenant_id = entry_row.tenant_id
      AND binding.verified IS TRUE
    FOR SHARE OF binding, contract, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM time_catalog_entry shift_entry
    JOIN time_catalog_entry calendar_entry
      ON calendar_entry.id = assignment_row.calendar_entry_id
     AND calendar_entry.tenant_id = shift_entry.tenant_id
     AND calendar_entry.catalog_kind = 'calendar'
     AND calendar_entry.status = 'approved'
    JOIN time_catalog_entry rule_entry
      ON rule_entry.id = assignment_row.rule_profile_entry_id
     AND rule_entry.tenant_id = shift_entry.tenant_id
     AND rule_entry.catalog_kind = 'rule_profile'
     AND rule_entry.status = 'approved'
    WHERE shift_entry.id = assignment_row.shift_entry_id
      AND shift_entry.tenant_id = entry_row.tenant_id
      AND shift_entry.catalog_kind = 'shift'
      AND shift_entry.status = 'approved'
      AND shift_entry.certified_binding_id = entry_row.certified_binding_id
      AND calendar_entry.certified_binding_id = entry_row.certified_binding_id
      AND rule_entry.certified_binding_id = entry_row.certified_binding_id
      AND shift_entry.effective_from <= entry_row.effective_from
      AND calendar_entry.effective_from <= entry_row.effective_from
      AND rule_entry.effective_from <= entry_row.effective_from
      AND COALESCE(shift_entry.effective_to, DATE 'infinity')
        >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
      AND COALESCE(calendar_entry.effective_to, DATE 'infinity')
        >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
      AND COALESCE(rule_entry.effective_to, DATE 'infinity')
        >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
    FOR SHARE OF shift_entry, calendar_entry, rule_entry;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_DEPENDENCY_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_guard_entry_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  transition_command text;
  mutable_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TIME_CATALOG_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.version <> 1
       OR NOT time_catalog_reason_allowed_v1('create_draft', NEW.reason_code) THEN
      RAISE EXCEPTION 'TIME_CATALOG_CREATE_INVALID' USING ERRCODE = 'P0001';
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
     AND link.source_binding_id = NEW.certified_binding_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.person_id = NEW.proposer_person_id
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
    FOR SHARE OF membership, policy, binding, link, contract, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_PROPOSER_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.certified_binding_id IS DISTINCT FROM OLD.certified_binding_id
     OR NEW.catalog_kind IS DISTINCT FROM OLD.catalog_kind
     OR NEW.logical_key_hash IS DISTINCT FROM OLD.logical_key_hash
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.proposer_person_id IS DISTINCT FROM OLD.proposer_person_id
     OR NEW.proposer_membership_id IS DISTINCT FROM OLD.proposer_membership_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TIME_CATALOG_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'TIME_CATALOG_VERSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    transition_command := 'update_draft';
    mutable_fields := ARRAY[
      'effective_from','effective_to','timezone','source_contract_id',
      'source_contract_certified_binding_id','version','reason_code','reason_hash','updated_at'
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
  ELSIF OLD.status = 'approved' AND NEW.status = 'retired' THEN
    transition_command := 'retire';
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','retired_at'
    ];
  ELSE
    RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF (to_jsonb(NEW) - mutable_fields) IS DISTINCT FROM (to_jsonb(OLD) - mutable_fields)
     OR NOT time_catalog_reason_allowed_v1(transition_command, NEW.reason_code) THEN
    RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_SHAPE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF transition_command IN ('approve','reject') THEN
    PERFORM 1
    FROM tenant_membership membership
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.source_binding_id = NEW.certified_binding_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.status = 'active'
     AND contract.person_id = NEW.approver_person_id
    WHERE membership.id = NEW.approver_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
    FOR SHARE OF membership, link, contract;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_APPROVER_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF transition_command = 'approve' THEN
    PERFORM time_catalog_assert_approvable_v1(
      NEW.id, NEW.tenant_id, NEW.certified_binding_id
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_guard_approved_overlap_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  assignment_row time_assignment_spec%ROWTYPE;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'time-catalog-coverage:' || NEW.tenant_id::text || ':' || NEW.catalog_kind
      || ':' || NEW.logical_key_hash, 0
  ));
  IF EXISTS (
    SELECT 1 FROM time_catalog_entry existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.catalog_kind = NEW.catalog_kind
      AND existing.logical_key_hash = NEW.logical_key_hash
      AND existing.status = 'approved'
      AND existing.id <> NEW.id
      AND existing.effective_from <= COALESCE(NEW.effective_to, DATE 'infinity')
      AND NEW.effective_from <= COALESCE(existing.effective_to, DATE 'infinity')
  ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_APPROVED_OVERLAP' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.catalog_kind = 'assignment' THEN
    SELECT * INTO assignment_row FROM time_assignment_spec assignment
    WHERE assignment.catalog_entry_id = NEW.id AND assignment.tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_EMPTY' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'time-catalog-assignment:' || NEW.tenant_id::text || ':'
        || assignment_row.employment_contract_id::text, 0
    ));
    IF EXISTS (
      SELECT 1
      FROM time_catalog_entry existing
      JOIN time_assignment_spec other
        ON other.catalog_entry_id = existing.id AND other.tenant_id = existing.tenant_id
      WHERE existing.tenant_id = NEW.tenant_id
        AND existing.catalog_kind = 'assignment'
        AND existing.status = 'approved'
        AND existing.id <> NEW.id
        AND other.employment_contract_id = assignment_row.employment_contract_id
        AND existing.effective_from <= COALESCE(NEW.effective_to, DATE 'infinity')
        AND NEW.effective_from <= COALESCE(existing.effective_to, DATE 'infinity')
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_OVERLAP' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_guard_draft_child_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_id uuid;
  target_tenant uuid;
  entry_row time_catalog_entry%ROWTYPE;
BEGIN
  target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_entry_id ELSE NEW.catalog_entry_id END;
  target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  SELECT * INTO entry_row FROM time_catalog_entry entry
  WHERE entry.id = target_id AND entry.tenant_id = target_tenant
  FOR SHARE;
  IF NOT FOUND OR entry_row.status <> 'draft' THEN
    RAISE EXCEPTION 'TIME_CATALOG_CHILD_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.catalog_entry_id IS DISTINCT FROM OLD.catalog_entry_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.catalog_kind IS DISTINCT FROM OLD.catalog_kind
  ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_CHILD_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'time_calendar_day' AND TG_OP <> 'DELETE'
     AND (NEW.day_date < entry_row.effective_from
       OR NEW.day_date > COALESCE(entry_row.effective_to, DATE 'infinity')) THEN
    RAISE EXCEPTION 'TIME_CATALOG_CALENDAR_DAY_OUTSIDE_EFFECTIVE_RANGE' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_guard_shift_interval_overlap_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  old_catalog_entry_id uuid;
  old_tenant_id uuid;
  old_weekday smallint;
  old_interval_sequence smallint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_catalog_entry_id := OLD.catalog_entry_id;
    old_tenant_id := OLD.tenant_id;
    old_weekday := OLD.weekday;
    old_interval_sequence := OLD.interval_sequence;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM time_shift_weekly_interval existing
    CROSS JOIN LATERAL time_catalog_normalized_week_segments_v1(
      existing.weekday,
      existing.starts_at,
      existing.ends_at,
      existing.crosses_midnight
    ) existing_segment
    CROSS JOIN LATERAL time_catalog_normalized_week_segments_v1(
      NEW.weekday,
      NEW.starts_at,
      NEW.ends_at,
      NEW.crosses_midnight
    ) new_segment
    WHERE existing.catalog_entry_id = NEW.catalog_entry_id
      AND existing.tenant_id = NEW.tenant_id
      AND (
        old_catalog_entry_id IS NULL
        OR existing.catalog_entry_id IS DISTINCT FROM old_catalog_entry_id
        OR existing.tenant_id IS DISTINCT FROM old_tenant_id
        OR existing.weekday IS DISTINCT FROM old_weekday
        OR existing.interval_sequence IS DISTINCT FROM old_interval_sequence
      )
      AND existing_segment.segment_start < new_segment.segment_end
      AND new_segment.segment_start < existing_segment.segment_end
  ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_SHIFT_INTERVAL_OVERLAP' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS time_catalog_entry_transition_guard_v1 ON time_catalog_entry;
CREATE TRIGGER time_catalog_entry_transition_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_catalog_entry
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_entry_v1();

DROP TRIGGER IF EXISTS time_catalog_entry_approved_overlap_guard_v1 ON time_catalog_entry;
CREATE TRIGGER time_catalog_entry_approved_overlap_guard_v1
BEFORE INSERT OR UPDATE ON time_catalog_entry
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_approved_overlap_v1();

DROP TRIGGER IF EXISTS time_calendar_day_draft_guard_v1 ON time_calendar_day;
CREATE TRIGGER time_calendar_day_draft_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_calendar_day
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_draft_child_v1();

DROP TRIGGER IF EXISTS time_shift_spec_draft_guard_v1 ON time_shift_spec;
CREATE TRIGGER time_shift_spec_draft_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_shift_spec
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_draft_child_v1();

DROP TRIGGER IF EXISTS time_shift_interval_draft_guard_v1 ON time_shift_weekly_interval;
CREATE TRIGGER time_shift_interval_draft_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_shift_weekly_interval
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_draft_child_v1();

DROP TRIGGER IF EXISTS time_shift_interval_overlap_guard_v1 ON time_shift_weekly_interval;
CREATE TRIGGER time_shift_interval_overlap_guard_v1
BEFORE INSERT OR UPDATE ON time_shift_weekly_interval
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_shift_interval_overlap_v1();

DROP TRIGGER IF EXISTS time_rule_parameter_draft_guard_v1 ON time_rule_parameter;
CREATE TRIGGER time_rule_parameter_draft_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_rule_parameter
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_draft_child_v1();

DROP TRIGGER IF EXISTS time_assignment_spec_draft_guard_v1 ON time_assignment_spec;
CREATE TRIGGER time_assignment_spec_draft_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON time_assignment_spec
FOR EACH ROW EXECUTE FUNCTION time_catalog_guard_draft_child_v1();

DROP TRIGGER IF EXISTS time_catalog_event_append_only_v1 ON time_catalog_governance_event;
CREATE TRIGGER time_catalog_event_append_only_v1
BEFORE UPDATE OR DELETE ON time_catalog_governance_event
FOR EACH ROW EXECUTE FUNCTION tenant_iam_reject_change();

CREATE OR REPLACE FUNCTION time_catalog_assert_person_sod_v1(
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
    RAISE EXCEPTION 'TIME_CATALOG_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
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
    COALESCE(bool_or(effective.capability_key = 'time.catalog.propose'), false),
    COALESCE(bool_or(effective.capability_key = 'time.catalog.approve'), false),
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
      'time.catalog.propose','time.catalog.approve','time.overtime.post'
    );

  IF (has_propose AND has_approve) OR (has_approve AND has_overtime_post) THEN
    RAISE EXCEPTION 'TIME_CATALOG_PERSON_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_assert_actor_authority_v1(
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
       'time.catalog.read','time.catalog.propose',
       'time.catalog.approve','time.catalog.audit.read'
     ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO authority_row FROM tenant_action_authority authority
  WHERE authority.membership_id = (p_context->>'membershipId')::uuid
    AND authority.tenant_id = (p_context->>'tenantId')::uuid
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_iam_assert_no_sod_conflict((p_context->>'membershipId')::uuid);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
    WHERE capability.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM time_catalog_assert_person_sod_v1(
    (p_context->>'tenantId')::uuid,
    actor_person_id,
    (p_context->>'certifiedBindingId')::uuid
  );
  SELECT COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key), '[]'::jsonb)
    INTO capabilities
  FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
  WHERE capability.capability_key IN (
    'time.catalog.read','time.catalog.propose',
    'time.catalog.approve','time.catalog.audit.read'
  );
  RETURN p_context || jsonb_build_object(
    'authorityVersion', authority_row.version,
    'actorPersonId', actor_person_id,
    'capabilities', capabilities,
    'areaScopes', '[]'::jsonb
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_principal_projection_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(p_context, '{}'::jsonb) - ARRAY[
    'actorPersonId','actorEmail','email','certifiedBindingId','sourceCompanyId',
    'sourceDatabase','employmentContractId','membershipId','tenantId','sessionId'
  ]::text[]
$$;

CREATE OR REPLACE FUNCTION time_catalog_bootstrap_v1(
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
  summary_value jsonb;
BEGIN
  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := time_catalog_assert_actor_authority_v1(context_value, 'time.catalog.read');
  SELECT jsonb_build_object(
    'calendar', count(*) FILTER (WHERE catalog_kind = 'calendar' AND status = 'approved'),
    'shift', count(*) FILTER (WHERE catalog_kind = 'shift' AND status = 'approved'),
    'ruleProfile', count(*) FILTER (WHERE catalog_kind = 'rule_profile' AND status = 'approved'),
    'assignment', count(*) FILTER (WHERE catalog_kind = 'assignment' AND status = 'approved'),
    'submitted', count(*) FILTER (WHERE status = 'submitted')
  ) INTO summary_value
  FROM time_catalog_entry entry
  WHERE entry.tenant_id = (context_value->>'tenantId')::uuid;
  RETURN jsonb_build_object(
    'principal', time_catalog_principal_projection_v1(context_value),
    'summary', summary_value,
    'catalogReady', false,
    'attendanceEvaluationReady', false,
    'punchesLoaded', false,
    'minutesCalculated', false,
    'payrollPosted', false,
    'grhMutation', false
  );
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_list_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_catalog_kind text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  records_value jsonb;
  total_value integer;
BEGIN
  IF p_catalog_kind IS NOT NULL
       AND p_catalog_kind NOT IN ('calendar','shift','rule_profile','assignment')
     OR p_status IS NOT NULL
       AND p_status NOT IN ('draft','submitted','approved','rejected','retired')
     OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'TIME_CATALOG_FILTER_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := time_catalog_assert_actor_authority_v1(context_value, 'time.catalog.read');
  SELECT count(*)::integer INTO total_value
  FROM time_catalog_entry entry
  WHERE entry.tenant_id = (context_value->>'tenantId')::uuid
    AND (p_catalog_kind IS NULL OR entry.catalog_kind = p_catalog_kind)
    AND (p_status IS NULL OR entry.status = p_status);
  WITH page AS MATERIALIZED (
    SELECT entry.id, entry.tenant_id
    FROM time_catalog_entry entry
    WHERE entry.tenant_id = (context_value->>'tenantId')::uuid
      AND (p_catalog_kind IS NULL OR entry.catalog_kind = p_catalog_kind)
      AND (p_status IS NULL OR entry.status = p_status)
    ORDER BY entry.updated_at DESC, entry.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(
    time_catalog_entry_snapshot_v1(page.id, page.tenant_id)
    ORDER BY page.id
  ), '[]'::jsonb) INTO records_value FROM page;
  RETURN jsonb_build_object(
    'principal', time_catalog_principal_projection_v1(context_value),
    'records', records_value,
    'page', jsonb_build_object(
      'limit', p_limit, 'offset', p_offset, 'total', total_value,
      'hasMore', p_offset + p_limit < total_value
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_detail_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_catalog_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  entry_row time_catalog_entry%ROWTYPE;
  timeline_value jsonb := '[]'::jsonb;
  can_audit boolean := false;
BEGIN
  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := time_catalog_assert_actor_authority_v1(context_value, 'time.catalog.read');
  SELECT * INTO entry_row FROM time_catalog_entry entry
  WHERE entry.id = p_catalog_entry_id
    AND entry.tenant_id = (context_value->>'tenantId')::uuid
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIME_CATALOG_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  can_audit := EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities((context_value->>'membershipId')::uuid) capability
    WHERE capability.capability_key = 'time.catalog.audit.read'
  );
  IF can_audit THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'command', event.command,
      'expectedVersion', event.expected_version,
      'resultingVersion', event.resulting_version,
      'reasonCode', event.reason_code,
      'occurredAt', event.occurred_at
    ) ORDER BY event.occurred_at, event.id), '[]'::jsonb)
    INTO timeline_value
    FROM (
      SELECT event.* FROM time_catalog_governance_event event
      WHERE event.tenant_id = entry_row.tenant_id
        AND event.catalog_entry_id = entry_row.id
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT 100
    ) event;
  END IF;
  RETURN jsonb_build_object(
    'principal', time_catalog_principal_projection_v1(context_value),
    'record', time_catalog_entry_snapshot_v1(entry_row.id, entry_row.tenant_id),
    'timeline', timeline_value,
    'auditAvailable', can_audit,
    'timelineLimit', 100
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_apply_command_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_command text,
  p_catalog_kind text,
  p_catalog_entry_id uuid,
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
  entry_row time_catalog_entry%ROWTYPE;
  existing_event time_catalog_governance_event%ROWTYPE;
  target_id uuid;
  target_kind text;
  source_contract_id_value uuid;
  before_value jsonb := '{}'::jsonb;
  after_value jsonb;
  result_value jsonb;
  required_capability text;
  item jsonb;
BEGIN
  IF p_command IS NULL OR p_command NOT IN (
       'create_draft','update_draft','submit','approve','reject','retire'
     )
     OR p_idempotency_key IS NULL
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 0
     OR lower(COALESCE(p_reason_hash,'')) !~ '^[a-f0-9]{64}$'
     OR time_catalog_reason_allowed_v1(p_command, p_reason_code) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TIME_CATALOG_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command = 'create_draft' THEN
    IF p_catalog_kind NOT IN ('calendar','shift','rule_profile','assignment')
       OR p_catalog_entry_id IS NOT NULL OR p_expected_version <> 0
       OR NOT time_catalog_payload_valid_v1(p_catalog_kind, p_payload) THEN
      RAISE EXCEPTION 'TIME_CATALOG_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'update_draft' THEN
    IF p_catalog_kind NOT IN ('calendar','shift','rule_profile','assignment')
       OR p_catalog_entry_id IS NULL OR p_expected_version < 1
       OR NOT time_catalog_payload_valid_v1(p_catalog_kind, p_payload) THEN
      RAISE EXCEPTION 'TIME_CATALOG_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_catalog_kind IS NOT NULL OR p_catalog_entry_id IS NULL
     OR p_expected_version < 1 OR p_payload IS NOT NULL THEN
    RAISE EXCEPTION 'TIME_CATALOG_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'time-catalog-idempotency:' || (context_value->>'tenantId') || ':'
      || (context_value->>'membershipId') || ':' || p_idempotency_key::text, 0
  ));
  required_capability := CASE
    WHEN p_command IN ('create_draft','update_draft','submit')
      THEN 'time.catalog.propose'
    ELSE 'time.catalog.approve'
  END;
  context_value := time_catalog_assert_actor_authority_v1(
    context_value, required_capability
  );

  SELECT * INTO existing_event FROM time_catalog_governance_event event
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
       OR existing_event.actor_certified_binding_id
          IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid
       OR (p_catalog_entry_id IS NOT NULL
         AND existing_event.catalog_entry_id IS DISTINCT FROM p_catalog_entry_id) THEN
      RAISE EXCEPTION 'TIME_CATALOG_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO entry_row FROM time_catalog_entry entry
    WHERE entry.id = existing_event.catalog_entry_id
      AND entry.tenant_id = existing_event.tenant_id
    FOR SHARE;
    IF NOT FOUND OR entry_row.certified_binding_id
       IS DISTINCT FROM existing_event.catalog_certified_binding_id THEN
      RAISE EXCEPTION 'TIME_CATALOG_AUDIT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_event.result || jsonb_build_object(
      'replayed', true,
      'historical', entry_row.version IS DISTINCT FROM existing_event.resulting_version
        OR entry_row.status IS DISTINCT FROM existing_event.after_snapshot->>'status'
    );
  END IF;

  IF p_command = 'create_draft' THEN
    target_id := gen_random_uuid();
    target_kind := p_catalog_kind;
  ELSE
    SELECT * INTO entry_row FROM time_catalog_entry entry
    WHERE entry.id = p_catalog_entry_id
      AND entry.tenant_id = (context_value->>'tenantId')::uuid
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIME_CATALOG_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    target_id := entry_row.id;
    target_kind := entry_row.catalog_kind;
    IF entry_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'TIME_CATALOG_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'update_draft' AND (
      p_catalog_kind IS DISTINCT FROM entry_row.catalog_kind
      OR lower(p_payload->>'logicalKeyHash') IS DISTINCT FROM entry_row.logical_key_hash
      OR (p_payload->>'revision')::integer IS DISTINCT FROM entry_row.revision
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
    IF p_command <> 'retire'
       AND entry_row.certified_binding_id
         IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'TIME_CATALOG_BINDING_STALE' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('update_draft','submit')
       AND entry_row.proposer_person_id
         IS DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'TIME_CATALOG_PROPOSER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('approve','reject','retire')
       AND entry_row.proposer_person_id
         IS NOT DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'TIME_CATALOG_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
    END IF;
    before_value := time_catalog_entry_snapshot_v1(entry_row.id, entry_row.tenant_id);
  END IF;

  IF p_command IN ('create_draft','update_draft') THEN
    source_contract_id_value := CASE WHEN p_payload ? 'sourceContractId'
      THEN (p_payload->>'sourceContractId')::uuid END;
  END IF;

  IF p_command = 'create_draft' THEN
    INSERT INTO time_catalog_entry (
      id, tenant_id, certified_binding_id, catalog_kind, logical_key_hash,
      revision, effective_from, effective_to, timezone,
      source_contract_id, source_contract_certified_binding_id,
      status, version, proposer_person_id, proposer_membership_id,
      reason_code, reason_hash
    ) VALUES (
      target_id, (context_value->>'tenantId')::uuid,
      (context_value->>'certifiedBindingId')::uuid, target_kind,
      lower(p_payload->>'logicalKeyHash'), (p_payload->>'revision')::integer,
      (p_payload->>'effectiveFrom')::date,
      CASE WHEN p_payload ? 'effectiveTo' THEN (p_payload->>'effectiveTo')::date END,
      p_payload->>'timezone', source_contract_id_value,
      CASE WHEN source_contract_id_value IS NOT NULL
        THEN (context_value->>'certifiedBindingId')::uuid END,
      'draft', 1, (context_value->>'actorPersonId')::uuid,
      (context_value->>'membershipId')::uuid,
      p_reason_code, lower(p_reason_hash)
    );
  ELSIF p_command = 'update_draft' THEN
    IF entry_row.status <> 'draft' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_catalog_entry SET
      effective_from = (p_payload->>'effectiveFrom')::date,
      effective_to = CASE WHEN p_payload ? 'effectiveTo'
        THEN (p_payload->>'effectiveTo')::date END,
      timezone = p_payload->>'timezone',
      source_contract_id = source_contract_id_value,
      source_contract_certified_binding_id = CASE WHEN source_contract_id_value IS NOT NULL
        THEN (context_value->>'certifiedBindingId')::uuid END,
      version = version + 1, reason_code = p_reason_code,
      reason_hash = lower(p_reason_hash), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'submit' THEN
    IF entry_row.status <> 'draft' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_catalog_entry SET
      status = 'submitted', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      submitted_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command IN ('approve','reject') THEN
    IF entry_row.status <> 'submitted' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'approve' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'time-catalog-approval:' || entry_row.tenant_id::text || ':'
          || entry_row.catalog_kind || ':' || entry_row.logical_key_hash, 0
      ));
    END IF;
    UPDATE time_catalog_entry SET
      status = CASE p_command WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      version = version + 1, reason_code = p_reason_code,
      reason_hash = lower(p_reason_hash),
      approver_person_id = (context_value->>'actorPersonId')::uuid,
      approver_membership_id = (context_value->>'membershipId')::uuid,
      decided_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'retire' THEN
    IF entry_row.status <> 'approved' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_catalog_entry SET
      status = 'retired', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      retired_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  END IF;

  IF p_command IN ('create_draft','update_draft') THEN
    DELETE FROM time_calendar_day
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_shift_weekly_interval
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_shift_spec
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_rule_parameter
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_assignment_spec
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;

    IF target_kind = 'calendar' THEN
      INSERT INTO time_calendar_day (
        catalog_entry_id, tenant_id, catalog_kind,
        day_date, day_kind, day_code, evidence_sha256
      )
      SELECT target_id, (context_value->>'tenantId')::uuid, 'calendar',
        (item->>'date')::date, item->>'kind', item->>'code',
        CASE WHEN item ? 'evidenceSha256' THEN lower(item->>'evidenceSha256') END
      FROM jsonb_array_elements(p_payload->'spec'->'days') row(item);
    ELSIF target_kind = 'shift' THEN
      INSERT INTO time_shift_spec (
        catalog_entry_id, tenant_id, catalog_kind,
        entry_tolerance_seconds, exit_tolerance_seconds
      ) VALUES (
        target_id, (context_value->>'tenantId')::uuid, 'shift',
        (p_payload->'spec'->>'entryToleranceSeconds')::integer,
        (p_payload->'spec'->>'exitToleranceSeconds')::integer
      );
      INSERT INTO time_shift_weekly_interval (
        catalog_entry_id, tenant_id, catalog_kind, weekday,
        interval_sequence, interval_kind, starts_at, ends_at, crosses_midnight
      )
      SELECT target_id, (context_value->>'tenantId')::uuid, 'shift',
        (item->>'day')::smallint, (item->>'sequence')::smallint,
        item->>'kind', (item->>'start')::time, (item->>'end')::time,
        (item->>'crossesMidnight')::boolean
      FROM jsonb_array_elements(p_payload->'spec'->'intervals') row(item);
    ELSIF target_kind = 'rule_profile' THEN
      INSERT INTO time_rule_parameter (
        catalog_entry_id, tenant_id, catalog_kind, parameter_key, value_kind,
        integer_value, decimal_value, boolean_value, time_value, code_value, unit_code
      )
      SELECT target_id, (context_value->>'tenantId')::uuid, 'rule_profile',
        item->>'key', item->>'valueKind',
        CASE WHEN item->>'valueKind' = 'integer' THEN (item->>'value')::bigint END,
        CASE WHEN item->>'valueKind' = 'decimal' THEN (item->>'value')::numeric END,
        CASE WHEN item->>'valueKind' = 'boolean' THEN (item->>'value')::boolean END,
        CASE WHEN item->>'valueKind' = 'time' THEN (item->>'value')::time END,
        CASE WHEN item->>'valueKind' = 'code' THEN item->>'value' END,
        item->>'unitCode'
      FROM jsonb_array_elements(p_payload->'spec'->'parameters') row(item);
    ELSE
      INSERT INTO time_assignment_spec (
        catalog_entry_id, tenant_id, catalog_kind, employment_contract_id,
        shift_entry_id, shift_kind, calendar_entry_id, calendar_kind,
        rule_profile_entry_id, rule_profile_kind
      ) VALUES (
        target_id, (context_value->>'tenantId')::uuid, 'assignment',
        (p_payload->'spec'->>'employmentContractId')::uuid,
        (p_payload->'spec'->>'shiftEntryId')::uuid, 'shift',
        (p_payload->'spec'->>'calendarEntryId')::uuid, 'calendar',
        (p_payload->'spec'->>'ruleProfileEntryId')::uuid, 'rule_profile'
      );
    END IF;
  END IF;

  after_value := time_catalog_entry_snapshot_v1(
    target_id, (context_value->>'tenantId')::uuid
  );
  result_value := jsonb_build_object(
    'data', after_value,
    'replayed', false,
    'catalogReady', false,
    'attendanceEvaluationReady', false,
    'punchesLoaded', false,
    'minutesCalculated', false,
    'payrollPosted', false,
    'grhMutation', false
  );
  INSERT INTO time_catalog_governance_event (
    tenant_id, catalog_entry_id, catalog_certified_binding_id,
    actor_certified_binding_id, actor_membership_id, actor_person_id,
    actor_session_id, actor_session_version, release_sha,
    command, idempotency_key, command_hash, expected_version, resulting_version,
    reason_code, reason_hash, before_snapshot, after_snapshot, result
  ) VALUES (
    (context_value->>'tenantId')::uuid, target_id,
    CASE WHEN p_command = 'create_draft'
      THEN (context_value->>'certifiedBindingId')::uuid
      ELSE entry_row.certified_binding_id END,
    (context_value->>'certifiedBindingId')::uuid,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    p_actor_session_id, p_actor_session_version, lower(p_release_sha),
    p_command, p_idempotency_key, lower(p_command_hash), p_expected_version,
    (after_value->>'version')::integer, p_reason_code, lower(p_reason_hash),
    before_value, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

COMMENT ON TABLE time_catalog_entry IS
  'Version gobernada tenant-aware de calendario, turno, reglas o asignacion; no contiene fichadas ni calculos.';
COMMENT ON TABLE time_calendar_day IS
  'Dias de calendario versionado con codigos controlados y sin descripciones libres.';
COMMENT ON TABLE time_shift_weekly_interval IS
  'Intervalos semanales declarativos, incluso nocturnos explicitos; no calculan jornada ni minutos trabajados.';
COMMENT ON TABLE time_rule_parameter IS
  'Parametros tipados versionados; su evaluacion queda fuera del alcance 010B.';
COMMENT ON TABLE time_assignment_spec IS
  'Asignacion temporal a contrato canonico; el identificador laboral no se proyecta por las fachadas.';
COMMENT ON TABLE time_catalog_governance_event IS
  'Auditoria append-only de comandos, expectedVersion, binding, sesion y release.';
COMMENT ON FUNCTION time_catalog_normalized_week_segments_v1(
  smallint,time,time,boolean
) IS
  'Normaliza intervalos half-open sobre una semana ciclica solo para impedir solapamientos.';
COMMENT ON FUNCTION time_catalog_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,text,text
) IS
  'Workflow maker-checker idempotente; no ingiere punches, no calcula minutos y no escribe GRH/payroll.';

REVOKE ALL PRIVILEGES ON TABLE
  time_catalog_entry,
  time_calendar_day,
  time_shift_spec,
  time_shift_weekly_interval,
  time_rule_parameter,
  time_assignment_spec,
  time_catalog_governance_event
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  time_catalog_entry,
  time_calendar_day,
  time_shift_spec,
  time_shift_weekly_interval,
  time_rule_parameter,
  time_assignment_spec,
  time_catalog_governance_event
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM municontrol_actions_runtime_app;
REVOKE CREATE ON SCHEMA public FROM municontrol_actions_runtime_app;

-- Un REVOKE nominal a PUBLIC/runtime no elimina grants historicos a otros roles
-- ni ACL por columna. Cerramos todas las relaciones 011 y cualquier secuencia
-- dependiente descubriendo exclusivamente ACL catalogadas; el owner se conserva.
DO $time_catalog_acl_hardening$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    WITH sensitive_relations AS (
      SELECT relation.oid, relation.relname, relation.relowner
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'time_catalog_entry',
          'time_calendar_day',
          'time_shift_spec',
          'time_shift_weekly_interval',
          'time_rule_parameter',
          'time_assignment_spec',
          'time_catalog_governance_event'
        )
    ), sensitive_sequences AS (
      SELECT DISTINCT sequence_row.oid, sequence_row.relname, sequence_row.relowner
      FROM pg_class sequence_row
      JOIN pg_namespace namespace ON namespace.oid = sequence_row.relnamespace
      JOIN pg_depend dependency
        ON dependency.classid = 'pg_class'::regclass
       AND dependency.objid = sequence_row.oid
       AND dependency.refclassid = 'pg_class'::regclass
       AND dependency.deptype IN ('a','i')
      JOIN sensitive_relations relation ON relation.oid = dependency.refobjid
      WHERE namespace.nspname = 'public' AND sequence_row.relkind = 'S'
    )
    SELECT 'relation'::text AS object_kind, relation.relname AS object_name,
      NULL::text AS column_name, NULL::text AS privilege_type,
      acl.grantee, grantee_role.rolname AS grantee_name
    FROM sensitive_relations relation
    CROSS JOIN LATERAL aclexplode(COALESCE(
      (SELECT catalog_relation.relacl FROM pg_class catalog_relation
       WHERE catalog_relation.oid = relation.oid),
      acldefault('r', relation.relowner)
    )) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE acl.grantee <> relation.relowner
    UNION ALL
    SELECT 'column', relation.relname, attribute.attname, acl.privilege_type,
      acl.grantee, grantee_role.rolname
    FROM sensitive_relations relation
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    CROSS JOIN LATERAL aclexplode(COALESCE(attribute.attacl, '{}'::aclitem[])) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE acl.grantee <> relation.relowner
    UNION ALL
    SELECT 'sequence', sequence_row.relname, NULL::text, NULL::text,
      acl.grantee, grantee_role.rolname
    FROM sensitive_sequences sequence_row
    CROSS JOIN LATERAL aclexplode(COALESCE(
      (SELECT catalog_sequence.relacl FROM pg_class catalog_sequence
       WHERE catalog_sequence.oid = sequence_row.oid),
      acldefault('S', sequence_row.relowner)
    )) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE acl.grantee <> sequence_row.relowner
  LOOP
    IF acl_row.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'TIME_CATALOG_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE
      grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    IF acl_row.object_kind = 'relation' THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',
        acl_row.object_name, grantee_sql
      );
    ELSIF acl_row.object_kind = 'column' THEN
      IF acl_row.privilege_type NOT IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
        RAISE EXCEPTION 'TIME_CATALOG_COLUMN_ACL_INVALID' USING ERRCODE = 'P0001';
      END IF;
      EXECUTE format(
        'REVOKE %s (%I) ON TABLE public.%I FROM %s',
        acl_row.privilege_type, acl_row.column_name,
        acl_row.object_name, grantee_sql
      );
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %s',
        acl_row.object_name, grantee_sql
      );
    END IF;
  END LOOP;
END
$time_catalog_acl_hardening$;

REVOKE ALL ON FUNCTION time_source_metadata_row_valid_v1(
  text,text,text,text,text,text,text,timestamptz,date,date,text,text,text,bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_reason_allowed_v1(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_parameter_value_valid_v1(
  text,bigint,numeric,boolean,time,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_normalized_week_segments_v1(
  smallint,time,time,boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_payload_valid_v1(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_entry_snapshot_v1(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_assert_approvable_v1(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_guard_entry_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_guard_approved_overlap_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_guard_draft_child_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_guard_shift_interval_overlap_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_assert_person_sod_v1(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_assert_actor_authority_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_principal_projection_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_bootstrap_v1(text,uuid,integer,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_list_v1(
  text,uuid,integer,text,uuid,uuid,text,text,integer,integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_detail_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION time_catalog_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,text,text
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION time_source_metadata_row_valid_v1(
  text,text,text,text,text,text,text,timestamptz,date,date,text,text,text,bigint
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_reason_allowed_v1(text,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_parameter_value_valid_v1(
  text,bigint,numeric,boolean,time,text,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_normalized_week_segments_v1(
  smallint,time,time,boolean
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_payload_valid_v1(text,jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_entry_snapshot_v1(uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_assert_approvable_v1(uuid,uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_guard_entry_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_guard_approved_overlap_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_guard_draft_child_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_guard_shift_interval_overlap_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_assert_person_sod_v1(uuid,uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_assert_actor_authority_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION time_catalog_principal_projection_v1(jsonb)
  FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION time_catalog_bootstrap_v1(text,uuid,integer,text,uuid,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION time_catalog_list_v1(
  text,uuid,integer,text,uuid,uuid,text,text,integer,integer
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION time_catalog_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION time_catalog_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,text,text
) TO municontrol_actions_runtime_app;
