-- MuniControl Friendly: canonical GRH/PERSONAS integration foundation.
-- GRH is authoritative for employment, status, payroll, absences and structure.
-- PERSONAS may only enrich identity/contact/territory with explicit provenance.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION normalize_digits(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT regexp_replace(input, '[^0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION is_valid_cuil(input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  value text := normalize_digits(input);
  weighted_sum integer;
  remainder integer;
  expected_digit integer;
BEGIN
  IF value IS NULL OR value !~ '^[0-9]{11}$' OR value = '00000000000' THEN
    RETURN false;
  END IF;

  weighted_sum := substring(value, 1, 1)::integer * 5
                + substring(value, 2, 1)::integer * 4
                + substring(value, 3, 1)::integer * 3
                + substring(value, 4, 1)::integer * 2
                + substring(value, 5, 1)::integer * 7
                + substring(value, 6, 1)::integer * 6
                + substring(value, 7, 1)::integer * 5
                + substring(value, 8, 1)::integer * 4
                + substring(value, 9, 1)::integer * 3
                + substring(value, 10, 1)::integer * 2;
  remainder := 11 - (weighted_sum % 11);
  expected_digit := CASE remainder WHEN 11 THEN 0 WHEN 10 THEN 9 ELSE remainder END;
  RETURN substring(value, 11, 1)::integer = expected_digit;
END
$$;

CREATE OR REPLACE FUNCTION reject_immutable_source_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END
$$;

CREATE OR REPLACE FUNCTION validate_source_batch_system()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_system text;
BEGIN
  SELECT source_system INTO batch_system
  FROM source_import_batch
  WHERE id = NEW.source_batch_id;
  IF batch_system IS NULL OR batch_system <> NEW.source_system THEN
    RAISE EXCEPTION 'source_batch_id % belongs to %, not %', NEW.source_batch_id, batch_system, NEW.source_system
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_source_xref_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.canonical_entity = 'person_identity'
     AND NOT EXISTS (SELECT 1 FROM person_identity WHERE id = NEW.canonical_id) THEN
    RAISE EXCEPTION 'person_identity target % does not exist', NEW.canonical_id USING ERRCODE = '23503';
  ELSIF NEW.canonical_entity = 'employment_contract'
     AND NOT EXISTS (SELECT 1 FROM employment_contract WHERE id = NEW.canonical_id) THEN
    RAISE EXCEPTION 'employment_contract target % does not exist', NEW.canonical_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validate_crosswalk_batches()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM source_import_batch WHERE id = NEW.grh_batch_id AND source_system = 'GRH'
  ) THEN
    RAISE EXCEPTION 'grh_batch_id % is not a GRH batch', NEW.grh_batch_id USING ERRCODE = '23514';
  END IF;
  IF NEW.personas_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM source_import_batch WHERE id = NEW.personas_batch_id AND source_system = 'PERSONAS'
  ) THEN
    RAISE EXCEPTION 'personas_batch_id % is not a PERSONAS batch', NEW.personas_batch_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TABLE IF NOT EXISTS source_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(32) NOT NULL,
  source_database varchar(128) NOT NULL,
  source_file_name text NOT NULL,
  source_sha256 char(64) NOT NULL,
  source_cutoff timestamptz NOT NULL,
  source_row_count bigint,
  legacy_import_run_id bigint REFERENCES data_import_runs(id),
  validation_state varchar(24) NOT NULL DEFAULT 'validated',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_import_batch_source_system_ck
    CHECK (source_system IN ('GRH', 'PERSONAS')),
  CONSTRAINT source_import_batch_sha256_ck
    CHECK (source_sha256 ~ '^[A-F0-9]{64}$'),
  CONSTRAINT source_import_batch_row_count_ck
    CHECK (source_row_count IS NULL OR source_row_count >= 0),
  CONSTRAINT source_import_batch_validation_state_ck
    CHECK (validation_state IN ('validated', 'published')),
  CONSTRAINT source_import_batch_source_snapshot_uk
    UNIQUE (source_system, source_sha256)
);

CREATE TABLE IF NOT EXISTS source_staging_row (
  batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  source_schema varchar(128) NOT NULL,
  source_entity varchar(128) NOT NULL,
  source_id text NOT NULL,
  source_row_number bigint NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  source_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, source_entity, source_row_number),
  CONSTRAINT source_staging_row_number_ck CHECK (source_row_number > 0),
  CONSTRAINT source_staging_row_sha256_ck
    CHECK (source_row_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT source_staging_row_identity_uk
    UNIQUE (batch_id, source_entity, source_id, source_row_sha256)
);

DROP TRIGGER IF EXISTS source_import_batch_append_only ON source_import_batch;
CREATE TRIGGER source_import_batch_append_only
BEFORE UPDATE OR DELETE ON source_import_batch
FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();

DROP TRIGGER IF EXISTS source_staging_row_append_only ON source_staging_row;
CREATE TRIGGER source_staging_row_append_only
BEFORE UPDATE OR DELETE ON source_staging_row
FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();

CREATE TABLE IF NOT EXISTS person_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuil varchar(11),
  dni varchar(12),
  full_name varchar(255),
  birth_date date,
  sex_code varchar(16),
  data_quality_score numeric(5,2),
  identity_state varchar(24) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_identity_cuil_ck
    CHECK (cuil IS NULL OR (cuil = normalize_digits(cuil) AND is_valid_cuil(cuil))),
  CONSTRAINT person_identity_dni_ck
    CHECK (dni IS NULL OR dni ~ '^[0-9]{5,12}$'),
  CONSTRAINT person_identity_birth_date_ck
    CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  CONSTRAINT person_identity_quality_score_ck
    CHECK (data_quality_score IS NULL OR data_quality_score BETWEEN 0 AND 100),
  CONSTRAINT person_identity_state_ck
    CHECK (identity_state IN ('active', 'provisional', 'merged', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS person_identity_active_cuil_uk
  ON person_identity (cuil)
  WHERE cuil IS NOT NULL AND identity_state IN ('active', 'provisional');
CREATE INDEX IF NOT EXISTS person_identity_dni_idx ON person_identity (dni);
CREATE INDEX IF NOT EXISTS person_identity_name_idx ON person_identity (lower(full_name));

CREATE TABLE IF NOT EXISTS source_xref (
  source_system varchar(32) NOT NULL,
  source_entity varchar(64) NOT NULL,
  source_id varchar(256) NOT NULL,
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  canonical_entity varchar(64) NOT NULL,
  canonical_id uuid NOT NULL,
  match_method varchar(32) NOT NULL,
  confidence numeric(5,4) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system, source_entity, source_id, valid_from),
  CONSTRAINT source_xref_source_system_ck
    CHECK (source_system IN ('GRH', 'PERSONAS')),
  CONSTRAINT source_xref_canonical_entity_ck
    CHECK (canonical_entity IN ('person_identity', 'employment_contract')),
  CONSTRAINT source_xref_personas_scope_ck
    CHECK (source_system <> 'PERSONAS' OR canonical_entity = 'person_identity'),
  CONSTRAINT source_xref_match_method_ck
    CHECK (match_method IN (
      'grh_person_seed', 'grh_legajo', 'cuil_unique', 'cuil_with_evidence',
      'cuil_duplicate_resolved', 'dni_unique', 'dni_duplicate_resolved',
      'dni_with_name_birth', 'manual_review'
    )),
  CONSTRAINT source_xref_confidence_ck CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT source_xref_validity_ck CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS source_xref_active_source_uk
  ON source_xref (source_system, source_entity, source_id)
  WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS source_xref_canonical_idx
  ON source_xref (canonical_entity, canonical_id)
  WHERE valid_to IS NULL;

DROP TRIGGER IF EXISTS source_xref_batch_system ON source_xref;
CREATE TRIGGER source_xref_batch_system
BEFORE INSERT OR UPDATE ON source_xref
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

DROP TRIGGER IF EXISTS source_xref_target ON source_xref;
CREATE TRIGGER source_xref_target
BEFORE INSERT OR UPDATE ON source_xref
FOR EACH ROW EXECUTE FUNCTION validate_source_xref_target();

CREATE TABLE IF NOT EXISTS person_identity_assertion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES person_identity(id),
  attribute_name varchar(32) NOT NULL,
  raw_value jsonb NOT NULL,
  normalized_value text,
  source_system varchar(32) NOT NULL,
  source_entity varchar(64) NOT NULL,
  source_id varchar(256) NOT NULL,
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  confidence numeric(5,4) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligible_for_promotion boolean NOT NULL DEFAULT false,
  preferred boolean NOT NULL DEFAULT false,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_identity_assertion_attribute_ck
    CHECK (attribute_name IN (
      'cuil', 'dni', 'full_name', 'birth_date', 'sex_code',
      'email', 'phone', 'address', 'locality', 'territory'
    )),
  CONSTRAINT person_identity_assertion_source_ck
    CHECK (source_system IN ('GRH', 'PERSONAS')),
  CONSTRAINT person_identity_assertion_confidence_ck CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT person_identity_assertion_preferred_ck
    CHECK (NOT preferred OR eligible_for_promotion),
  CONSTRAINT person_identity_assertion_validity_ck CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT person_identity_assertion_source_value_uk
    UNIQUE (person_id, attribute_name, source_system, source_entity, source_id, source_batch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS person_identity_assertion_preferred_uk
  ON person_identity_assertion (person_id, attribute_name)
  WHERE preferred AND valid_to IS NULL;
CREATE INDEX IF NOT EXISTS person_identity_assertion_source_idx
  ON person_identity_assertion (source_system, source_entity, source_id);

DROP TRIGGER IF EXISTS person_identity_assertion_batch_system ON person_identity_assertion;
CREATE TRIGGER person_identity_assertion_batch_system
BEFORE INSERT OR UPDATE ON person_identity_assertion
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

CREATE TABLE IF NOT EXISTS crosswalk_persona (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES person_identity(id),
  grh_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  grh_source_entity varchar(64) NOT NULL DEFAULT 'persona',
  grh_source_id varchar(256) NOT NULL,
  personas_batch_id uuid REFERENCES source_import_batch(id),
  personas_source_entity varchar(64),
  personas_source_id varchar(256),
  match_status varchar(24) NOT NULL,
  match_method varchar(32) NOT NULL,
  confidence numeric(5,4) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crosswalk_persona_status_ck
    CHECK (match_status IN ('matched', 'ambiguous', 'unmatched', 'rejected')),
  CONSTRAINT crosswalk_persona_method_ck
    CHECK (match_method IN (
      'cuil_unique', 'cuil_with_evidence', 'cuil_duplicate_resolved',
      'dni_unique', 'dni_duplicate_resolved', 'dni_with_name_birth',
      'manual_review', 'ambiguous', 'unmatched'
    )),
  CONSTRAINT crosswalk_persona_confidence_ck CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT crosswalk_persona_matched_target_ck
    CHECK (
      match_status <> 'matched'
      OR (personas_batch_id IS NOT NULL AND personas_source_entity IS NOT NULL AND personas_source_id IS NOT NULL)
    ),
  CONSTRAINT crosswalk_persona_unmatched_target_ck
    CHECK (
      match_status <> 'unmatched'
      OR (personas_source_entity IS NULL AND personas_source_id IS NULL)
    ),
  CONSTRAINT crosswalk_persona_validity_ck CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS crosswalk_persona_active_grh_uk
  ON crosswalk_persona (grh_source_entity, grh_source_id)
  WHERE valid_to IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crosswalk_persona_active_personas_uk
  ON crosswalk_persona (personas_source_entity, personas_source_id)
  WHERE valid_to IS NULL AND match_status = 'matched';

DROP TRIGGER IF EXISTS crosswalk_persona_batch_systems ON crosswalk_persona;
CREATE TRIGGER crosswalk_persona_batch_systems
BEFORE INSERT OR UPDATE ON crosswalk_persona
FOR EACH ROW EXECUTE FUNCTION validate_crosswalk_batches();

CREATE TABLE IF NOT EXISTS employment_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES person_identity(id),
  source_system varchar(32) NOT NULL DEFAULT 'GRH',
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  legacy_company_id bigint NOT NULL,
  legacy_legajo varchar(64) NOT NULL,
  start_date date,
  end_date date,
  agreement_code varchar(32),
  category_code varchar(32),
  organization_unit_source_id varchar(128),
  position_source_id varchar(128),
  sector_source_id varchar(128),
  status varchar(32) NOT NULL,
  status_explanation text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employment_contract_grh_authority_ck CHECK (source_system = 'GRH'),
  CONSTRAINT employment_contract_status_ck
    CHECK (status IN ('active', 'inactive', 'state_error', 'unknown')),
  CONSTRAINT employment_contract_start_date_ck
    CHECK (start_date IS NULL OR start_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  CONSTRAINT employment_contract_end_date_ck
    CHECK (end_date IS NULL OR end_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  CONSTRAINT employment_contract_date_order_ck
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT employment_contract_state_error_ck
    CHECK (status <> 'state_error' OR status_explanation IS NOT NULL),
  CONSTRAINT employment_contract_legacy_uk UNIQUE (legacy_company_id, legacy_legajo)
);

CREATE INDEX IF NOT EXISTS employment_contract_person_idx ON employment_contract (person_id);
CREATE INDEX IF NOT EXISTS employment_contract_status_idx ON employment_contract (status);
CREATE INDEX IF NOT EXISTS employment_contract_structure_idx
  ON employment_contract (organization_unit_source_id, sector_source_id);

DROP TRIGGER IF EXISTS employment_contract_batch_system ON employment_contract;
CREATE TRIGGER employment_contract_batch_system
BEFORE INSERT OR UPDATE ON employment_contract
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

CREATE TABLE IF NOT EXISTS employment_status_snapshot (
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id),
  snapshot_date date NOT NULL,
  payroll_run_id uuid,
  administrative_status varchar(32) NOT NULL,
  payroll_status varchar(32) NOT NULL,
  discrepancy_reason_code varchar(48),
  discrepancy_explanation text,
  nominal_amount numeric(18,2),
  currency_code char(3) NOT NULL DEFAULT 'ARS',
  monetary_basis varchar(16) NOT NULL DEFAULT 'nominal',
  source_system varchar(32) NOT NULL DEFAULT 'GRH',
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employment_contract_id, snapshot_date),
  CONSTRAINT employment_status_snapshot_grh_authority_ck CHECK (source_system = 'GRH'),
  CONSTRAINT employment_status_snapshot_administrative_ck
    CHECK (administrative_status IN (
      'active', 'inactive', 'suspended', 'leave_without_pay',
      'pending_termination', 'state_error', 'unknown'
    )),
  CONSTRAINT employment_status_snapshot_payroll_ck
    CHECK (payroll_status IN ('liquidated', 'preliquidated', 'not_liquidated', 'not_applicable', 'unknown')),
  CONSTRAINT employment_status_snapshot_reason_ck
    CHECK (
      NOT (
        administrative_status IN ('active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error')
        AND payroll_status IN ('not_liquidated', 'unknown')
      )
      OR (discrepancy_reason_code IS NOT NULL AND discrepancy_explanation IS NOT NULL)
    ),
  CONSTRAINT employment_status_snapshot_reason_code_ck
    CHECK (discrepancy_reason_code IS NULL OR discrepancy_reason_code IN (
      'payroll_source_pending', 'state_quality_error',
      'active_not_liquidated_never_observed',
      'active_not_liquidated_historical',
      'active_not_liquidated_previous_cycle',
      'suspended', 'leave_without_pay', 'pending_termination', 'manual_review'
    )),
  CONSTRAINT employment_status_snapshot_amount_ck
    CHECK (payroll_status = 'liquidated' OR nominal_amount IS NULL),
  CONSTRAINT employment_status_snapshot_basis_ck CHECK (monetary_basis = 'nominal')
);

CREATE INDEX IF NOT EXISTS employment_status_snapshot_date_idx
  ON employment_status_snapshot (snapshot_date, administrative_status, payroll_status);

DROP TRIGGER IF EXISTS employment_status_snapshot_batch_system ON employment_status_snapshot;
CREATE TRIGGER employment_status_snapshot_batch_system
BEFORE INSERT OR UPDATE ON employment_status_snapshot
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

CREATE TABLE IF NOT EXISTS payroll_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_source_id varchar(64) NOT NULL,
  payroll_date date NOT NULL,
  source_period integer NOT NULL,
  source_month integer NOT NULL,
  payroll_type varchar(32) NOT NULL,
  source_closed_flag smallint,
  closure_status varchar(16) NOT NULL,
  source_date_ig date,
  source_system varchar(32) NOT NULL DEFAULT 'GRH',
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  source_id varchar(256) NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_run_grh_authority_ck CHECK (source_system = 'GRH'),
  CONSTRAINT payroll_run_date_ck
    CHECK (payroll_date BETWEEN DATE '2008-01-01' AND DATE '2100-12-31'),
  CONSTRAINT payroll_run_month_ck CHECK (source_month BETWEEN 1 AND 12),
  CONSTRAINT payroll_run_closure_status_ck
    CHECK (closure_status IN ('closed', 'open', 'unknown')),
  CONSTRAINT payroll_run_source_flag_ck CHECK (source_closed_flag IS NULL OR source_closed_flag = 1),
  CONSTRAINT payroll_run_closure_evidence_ck CHECK (
    (source_closed_flag = 1 AND closure_status = 'closed')
    OR (source_closed_flag IS NULL AND closure_status IN ('open', 'unknown'))
  ),
  CONSTRAINT payroll_run_source_uk UNIQUE (source_batch_id, source_id),
  CONSTRAINT payroll_run_natural_uk UNIQUE (
    source_batch_id, company_source_id, payroll_date, source_period, source_month, payroll_type
  )
);

CREATE INDEX IF NOT EXISTS payroll_run_date_status_idx
  ON payroll_run (payroll_date DESC, closure_status, payroll_type);

DROP TRIGGER IF EXISTS payroll_run_batch_system ON payroll_run;
CREATE TRIGGER payroll_run_batch_system
BEFORE INSERT OR UPDATE ON payroll_run
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

CREATE OR REPLACE FUNCTION validate_payroll_run_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  linked_run payroll_run%ROWTYPE;
  linked_contract employment_contract%ROWTYPE;
BEGIN
  IF NEW.payroll_run_id IS NULL THEN
    IF TG_TABLE_NAME = 'employment_status_snapshot'
       AND NEW.payroll_status IN ('liquidated', 'preliquidated') THEN
      RAISE EXCEPTION '% status requires payroll_run_id', NEW.payroll_status
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO linked_run FROM payroll_run WHERE id = NEW.payroll_run_id;
  SELECT * INTO linked_contract FROM employment_contract WHERE id = NEW.employment_contract_id;
  IF linked_run.id IS NULL OR linked_contract.id IS NULL THEN
    RAISE EXCEPTION 'payroll run or employment contract not found' USING ERRCODE = '23503';
  END IF;
  IF linked_run.source_batch_id <> NEW.source_batch_id
     OR linked_run.source_system <> NEW.source_system
     OR linked_contract.source_batch_id <> NEW.source_batch_id
     OR linked_run.company_source_id <> linked_contract.legacy_company_id::text THEN
    RAISE EXCEPTION 'payroll run authority/company does not match target row'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'employment_status_snapshot' THEN
    IF linked_run.payroll_date <> NEW.snapshot_date THEN
      RAISE EXCEPTION 'status snapshot date does not match payroll run' USING ERRCODE = '23514';
    END IF;
    IF (NEW.payroll_status = 'liquidated' AND linked_run.closure_status <> 'closed')
       OR (NEW.payroll_status = 'preliquidated' AND linked_run.closure_status <> 'open') THEN
      RAISE EXCEPTION 'payroll status % conflicts with run closure %',
        NEW.payroll_status, linked_run.closure_status USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'payroll_snapshot_assignment' THEN
    IF linked_run.payroll_date <> NEW.snapshot_date
       OR linked_run.payroll_type <> NEW.payroll_type THEN
      RAISE EXCEPTION 'payroll snapshot key does not match payroll run' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'payroll_monthly_fact' THEN
    IF linked_run.payroll_date <> NEW.payroll_date
       OR linked_run.source_period <> NEW.source_period
       OR linked_run.source_month <> NEW.source_month
       OR linked_run.payroll_type <> NEW.payroll_type THEN
      RAISE EXCEPTION 'monthly payroll grain does not match payroll run' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE employment_status_snapshot
  DROP CONSTRAINT IF EXISTS employment_status_snapshot_payroll_run_fk;
ALTER TABLE employment_status_snapshot
  ADD CONSTRAINT employment_status_snapshot_payroll_run_fk
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_run(id);

DROP TRIGGER IF EXISTS employment_status_snapshot_run_link ON employment_status_snapshot;
CREATE TRIGGER employment_status_snapshot_run_link
BEFORE INSERT OR UPDATE ON employment_status_snapshot
FOR EACH ROW EXECUTE FUNCTION validate_payroll_run_link();

CREATE TABLE IF NOT EXISTS payroll_snapshot_assignment (
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id),
  payroll_run_id uuid NOT NULL REFERENCES payroll_run(id),
  snapshot_date date NOT NULL,
  payroll_type varchar(32) NOT NULL,
  source_record_id varchar(128) NOT NULL,
  agreement_source_id varchar(128),
  agreement_name text,
  category_name text,
  role_name text,
  budget_structure text,
  budget_detail text,
  budget_account text,
  department_source_id varchar(128),
  department_name text,
  area_name text,
  source_system varchar(32) NOT NULL DEFAULT 'GRH',
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employment_contract_id, snapshot_date, payroll_type),
  CONSTRAINT payroll_snapshot_assignment_grh_authority_ck CHECK (source_system = 'GRH'),
  CONSTRAINT payroll_snapshot_assignment_date_ck
    CHECK (snapshot_date BETWEEN DATE '2008-01-01' AND DATE '2100-12-31'),
  CONSTRAINT payroll_snapshot_assignment_source_uk UNIQUE (source_batch_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS payroll_snapshot_assignment_date_idx
  ON payroll_snapshot_assignment (snapshot_date, agreement_source_id, department_source_id);

DROP TRIGGER IF EXISTS payroll_snapshot_assignment_batch_system ON payroll_snapshot_assignment;
CREATE TRIGGER payroll_snapshot_assignment_batch_system
BEFORE INSERT OR UPDATE ON payroll_snapshot_assignment
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

DROP TRIGGER IF EXISTS payroll_snapshot_assignment_run_link ON payroll_snapshot_assignment;
CREATE TRIGGER payroll_snapshot_assignment_run_link
BEFORE INSERT OR UPDATE ON payroll_snapshot_assignment
FOR EACH ROW EXECUTE FUNCTION validate_payroll_run_link();

CREATE TABLE IF NOT EXISTS payroll_monthly_fact (
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id),
  payroll_run_id uuid NOT NULL REFERENCES payroll_run(id),
  payroll_date date NOT NULL,
  source_period integer NOT NULL,
  source_month integer NOT NULL,
  payroll_type varchar(32) NOT NULL,
  item_count integer NOT NULL,
  quantity_sum numeric NOT NULL,
  technical_source_amount_sum numeric(20,2),
  employer_contributions numeric(20,2),
  social_security_taxable_base numeric(20,2),
  health_taxable_base numeric(20,2),
  total_subject_earnings numeric(20,2),
  total_non_subject_earnings numeric(20,2),
  family_allowance numeric(20,2),
  employee_withholdings numeric(20,2),
  employer_taxable_base numeric(20,2),
  net numeric(20,2),
  net_payable numeric(20,2),
  dominant_agreement_source_id varchar(128),
  dominant_sector_source_id varchar(128),
  distinct_concepts integer NOT NULL,
  monetary_basis varchar(16) NOT NULL DEFAULT 'nominal',
  source_system varchar(32) NOT NULL DEFAULT 'GRH',
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  source_id varchar(256) NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employment_contract_id, payroll_date, source_period, source_month, payroll_type),
  CONSTRAINT payroll_monthly_fact_grh_authority_ck CHECK (source_system = 'GRH'),
  CONSTRAINT payroll_monthly_fact_date_ck
    CHECK (payroll_date BETWEEN DATE '2008-01-01' AND DATE '2100-12-31'),
  CONSTRAINT payroll_monthly_fact_month_ck CHECK (source_month BETWEEN 1 AND 12),
  CONSTRAINT payroll_monthly_fact_counts_ck CHECK (item_count > 0 AND distinct_concepts > 0),
  CONSTRAINT payroll_monthly_fact_basis_ck CHECK (monetary_basis = 'nominal'),
  CONSTRAINT payroll_monthly_fact_source_uk UNIQUE (source_batch_id, source_id)
);

CREATE INDEX IF NOT EXISTS payroll_monthly_fact_date_idx
  ON payroll_monthly_fact (payroll_date, payroll_type);

DROP TRIGGER IF EXISTS payroll_monthly_fact_batch_system ON payroll_monthly_fact;
CREATE TRIGGER payroll_monthly_fact_batch_system
BEFORE INSERT OR UPDATE ON payroll_monthly_fact
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

DROP TRIGGER IF EXISTS payroll_monthly_fact_run_link ON payroll_monthly_fact;
CREATE TRIGGER payroll_monthly_fact_run_link
BEFORE INSERT OR UPDATE ON payroll_monthly_fact
FOR EACH ROW EXECUTE FUNCTION validate_payroll_run_link();

CREATE TABLE IF NOT EXISTS employment_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id),
  movement_period date NOT NULL,
  payroll_type varchar(32),
  movement_type varchar(64),
  concept_source_id varchar(128),
  cost_center_source_id varchar(128),
  quantity numeric,
  installment varchar(64),
  automatic_source_value varchar(32),
  adjustment_source_value varchar(32),
  forced_source_value varchar(32),
  legal_instrument text,
  movement_status text,
  source_system varchar(32) NOT NULL DEFAULT 'GRH',
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  source_id varchar(256) NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employment_movement_grh_authority_ck CHECK (source_system = 'GRH'),
  CONSTRAINT employment_movement_period_ck
    CHECK (
      movement_period BETWEEN DATE '2008-01-01' AND DATE '2100-12-01'
      AND extract(day FROM movement_period) = 1
    ),
  CONSTRAINT employment_movement_source_uk UNIQUE (source_batch_id, source_id)
);

CREATE INDEX IF NOT EXISTS employment_movement_contract_date_idx
  ON employment_movement (employment_contract_id, movement_period);

DROP TRIGGER IF EXISTS employment_movement_batch_system ON employment_movement;
CREATE TRIGGER employment_movement_batch_system
BEFORE INSERT OR UPDATE ON employment_movement
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

CREATE TABLE IF NOT EXISTS data_quality_issue (
  id bigserial PRIMARY KEY,
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
  source_system varchar(32) NOT NULL,
  source_entity varchar(128) NOT NULL,
  source_id text,
  canonical_entity varchar(64),
  canonical_id uuid,
  issue_code varchar(64) NOT NULL,
  severity varchar(16) NOT NULL,
  field_name varchar(128),
  observed_value text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status varchar(24) NOT NULL DEFAULT 'open',
  resolution_note text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT data_quality_issue_source_ck CHECK (source_system IN ('GRH', 'PERSONAS')),
  CONSTRAINT data_quality_issue_severity_ck CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  CONSTRAINT data_quality_issue_resolution_ck
    CHECK (resolution_status IN ('open', 'accepted', 'corrected', 'rejected')),
  CONSTRAINT data_quality_issue_resolved_at_ck
    CHECK ((resolution_status = 'open' AND resolved_at IS NULL) OR resolution_status <> 'open')
);

CREATE UNIQUE INDEX IF NOT EXISTS data_quality_issue_dedupe_uk
  ON data_quality_issue (
    source_batch_id,
    source_entity,
    COALESCE(source_id, ''),
    issue_code,
    COALESCE(field_name, ''),
    COALESCE(canonical_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS data_quality_issue_open_idx
  ON data_quality_issue (severity, issue_code)
  WHERE resolution_status = 'open';

DROP TRIGGER IF EXISTS data_quality_issue_batch_system ON data_quality_issue;
CREATE TRIGGER data_quality_issue_batch_system
BEFORE INSERT OR UPDATE ON data_quality_issue
FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();

CREATE OR REPLACE VIEW vw_empleado_actual AS
SELECT ec.id AS employment_contract_id,
       ec.person_id,
       pi.cuil,
       pi.dni,
       pi.full_name,
       ec.legacy_company_id,
       ec.legacy_legajo,
       ec.start_date,
       ec.end_date,
       ec.agreement_code,
       ec.category_code,
       ec.organization_unit_source_id,
       ec.position_source_id,
       ec.sector_source_id,
       ec.status AS contract_status,
       latest.snapshot_date,
       latest.administrative_status,
       latest.payroll_status,
       latest.payroll_run_id,
       current_run.closure_status AS payroll_closure_status,
       COALESCE(current_run.closure_status = 'closed', false) AS corrida_cerrada,
       latest.discrepancy_reason_code,
       latest.discrepancy_explanation,
       COALESCE(
         latest.administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ),
         false
       ) AS activo_administrativo,
       COALESCE(latest.payroll_status IN ('liquidated', 'preliquidated'), false)
         AS incluido_corrida_actual,
       COALESCE(latest.payroll_status IN ('liquidated', 'preliquidated'), false)
         AS activo_liquidable,
       CASE
         WHEN latest.administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND latest.payroll_status = 'liquidated'
           THEN 'liquidado_en_corrida_cerrada'
         WHEN latest.administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND latest.payroll_status = 'preliquidated'
           THEN 'incluido_en_corrida_abierta'
         WHEN latest.discrepancy_reason_code IS NOT NULL
           THEN latest.discrepancy_reason_code
         WHEN latest.administrative_status = 'inactive'
           THEN 'inactivo_administrativo'
         ELSE 'sin_clasificar'
       END AS estado_control
FROM employment_contract ec
JOIN person_identity pi ON pi.id = ec.person_id
LEFT JOIN LATERAL (
  SELECT ess.snapshot_date,
         ess.administrative_status,
         ess.payroll_status,
         ess.payroll_run_id,
         ess.discrepancy_reason_code,
         ess.discrepancy_explanation
  FROM employment_status_snapshot ess
  WHERE ess.employment_contract_id = ec.id
  ORDER BY ess.snapshot_date DESC
  LIMIT 1
) latest ON true
LEFT JOIN payroll_run current_run ON current_run.id = latest.payroll_run_id
WHERE ec.status IN ('active', 'state_error', 'unknown');

CREATE OR REPLACE VIEW vw_dotacion_mensual AS
WITH month_end AS (
  SELECT DISTINCT ON (employment_contract_id, date_trunc('month', snapshot_date)::date)
         employment_contract_id,
         date_trunc('month', snapshot_date)::date AS month,
         administrative_status,
         payroll_status
  FROM employment_status_snapshot
  ORDER BY employment_contract_id, date_trunc('month', snapshot_date)::date, snapshot_date DESC
)
SELECT month,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         )
       )::bigint AS administrative_headcount,
       count(*) FILTER (WHERE payroll_status = 'liquidated')::bigint AS closed_liquidated_headcount,
       count(*) FILTER (WHERE payroll_status = 'preliquidated')::bigint AS open_preliquidated_headcount,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND payroll_status NOT IN ('liquidated', 'preliquidated')
       )::bigint AS administrative_payroll_gap
FROM month_end
GROUP BY month;

CREATE OR REPLACE VIEW vw_ausentismo_mensual AS
SELECT date_trunc('month', a.fecha)::date AS month,
       count(*)::bigint AS absence_events,
       count(DISTINCT ec.id)::bigint AS employment_contracts_affected,
       sum(COALESCE(a.dias, a.cantidad, 0))::numeric AS source_units
FROM grh_absences a
LEFT JOIN employment_contract ec
  ON ec.source_system = 'GRH'
 AND ec.legacy_company_id = a.company_id
 AND ec.legacy_legajo = a.legajo
WHERE a.fecha BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
GROUP BY date_trunc('month', a.fecha)::date;

CREATE OR REPLACE VIEW vw_nomina_totales AS
WITH totals AS (
  SELECT run.id AS payroll_run_id,
         run.company_source_id,
         run.payroll_date,
         run.source_period,
         run.source_month,
         run.payroll_type,
         run.closure_status,
         run.source_closed_flag,
         count(DISTINCT fact.employment_contract_id)::bigint AS contracts,
         count(DISTINCT fact.employment_contract_id)
           FILTER (WHERE fact.net_payable IS NOT NULL)::bigint AS contracts_with_net_payable,
         sum(fact.item_count)::bigint AS payroll_items,
         sum(fact.quantity_sum)::numeric AS quantity_sum,
         sum(fact.technical_source_amount_sum)::numeric AS technical_source_amount_sum,
         sum(fact.employer_contributions)::numeric AS employer_contributions,
         sum(fact.social_security_taxable_base)::numeric AS social_security_taxable_base,
         sum(fact.health_taxable_base)::numeric AS health_taxable_base,
         sum(fact.total_subject_earnings)::numeric AS total_subject_earnings,
         sum(fact.total_non_subject_earnings)::numeric AS total_non_subject_earnings,
         sum(fact.family_allowance)::numeric AS family_allowance,
         sum(fact.employee_withholdings)::numeric AS employee_withholdings,
         sum(fact.employer_taxable_base)::numeric AS employer_taxable_base,
         sum(fact.net)::numeric AS net,
         sum(fact.net_payable)::numeric AS net_payable
  FROM payroll_run run
  LEFT JOIN payroll_monthly_fact fact ON fact.payroll_run_id = run.id
  GROUP BY run.id
), controlled AS (
  SELECT totals.*,
         CASE
           WHEN total_subject_earnings IS NULL
             OR total_non_subject_earnings IS NULL
             OR family_allowance IS NULL
             OR employee_withholdings IS NULL
             OR net_payable IS NULL
             THEN NULL
           ELSE total_subject_earnings + total_non_subject_earnings + family_allowance
         END AS gross_payable,
         CASE
           WHEN total_subject_earnings IS NULL
             OR total_non_subject_earnings IS NULL
             OR family_allowance IS NULL
             OR employer_contributions IS NULL
             THEN NULL
           ELSE total_subject_earnings + total_non_subject_earnings
                + family_allowance + employer_contributions
         END AS employer_cost_proxy,
         CASE
           WHEN total_subject_earnings IS NULL
             OR total_non_subject_earnings IS NULL
             OR family_allowance IS NULL
             OR employee_withholdings IS NULL
             OR net_payable IS NULL
             THEN NULL
           ELSE total_subject_earnings + total_non_subject_earnings + family_allowance
                - employee_withholdings - net_payable
         END AS arithmetic_difference,
         greatest(0.01::numeric, contracts::numeric * 0.01::numeric)
           AS rounding_tolerance
  FROM totals
)
SELECT controlled.*,
       false AS technical_source_amount_is_financial_kpi,
       CASE
         WHEN arithmetic_difference IS NULL THEN false
         ELSE abs(arithmetic_difference) <= rounding_tolerance
       END AS arithmetic_reconciled,
       CASE
         WHEN closure_status = 'closed'
              AND arithmetic_difference IS NOT NULL
              AND contracts_with_net_payable = contracts
           THEN abs(arithmetic_difference) <= rounding_tolerance
         ELSE false
       END AS executive_publishable,
       'ARS'::char(3) AS currency_code,
       'nominal'::text AS monetary_basis,
       false AS inflation_adjusted
FROM controlled;

CREATE OR REPLACE VIEW vw_liquidacion_mensual AS
WITH totals AS (
  SELECT date_trunc('month', run.payroll_date)::date AS month,
         run.closure_status,
         count(DISTINCT run.id)::bigint AS payroll_runs,
         count(DISTINCT fact.employment_contract_id)::bigint AS contracts_with_any_fact,
         count(DISTINCT fact.employment_contract_id)
           FILTER (WHERE fact.net_payable IS NOT NULL)::bigint AS liquidated_contracts,
         sum(fact.item_count)::bigint AS payroll_items,
         sum(fact.quantity_sum)::numeric AS quantity_sum,
         sum(fact.technical_source_amount_sum)::numeric AS technical_source_amount_sum,
         sum(fact.employer_contributions)::numeric AS employer_contributions,
         sum(fact.social_security_taxable_base)::numeric AS social_security_taxable_base,
         sum(fact.health_taxable_base)::numeric AS health_taxable_base,
         sum(fact.total_subject_earnings)::numeric AS total_subject_earnings,
         sum(fact.total_non_subject_earnings)::numeric AS total_non_subject_earnings,
         sum(fact.family_allowance)::numeric AS family_allowance,
         sum(fact.employee_withholdings)::numeric AS employee_withholdings,
         sum(fact.employer_taxable_base)::numeric AS employer_taxable_base,
         sum(fact.net)::numeric AS net,
         sum(fact.net_payable)::numeric AS net_payable
  FROM payroll_run run
  JOIN payroll_monthly_fact fact ON fact.payroll_run_id = run.id
  GROUP BY date_trunc('month', run.payroll_date)::date, run.closure_status
), controlled AS (
  SELECT totals.*,
         total_subject_earnings + total_non_subject_earnings + family_allowance
           AS gross_payable,
         total_subject_earnings + total_non_subject_earnings + family_allowance
           + employer_contributions AS employer_cost_proxy,
         total_subject_earnings + total_non_subject_earnings + family_allowance
           - employee_withholdings - net_payable AS arithmetic_difference,
         greatest(0.01::numeric, liquidated_contracts::numeric * 0.01::numeric)
           AS rounding_tolerance
  FROM totals
)
SELECT controlled.*,
       false AS technical_source_amount_is_financial_kpi,
       arithmetic_difference IS NOT NULL
         AND abs(arithmetic_difference) <= rounding_tolerance AS arithmetic_reconciled,
       closure_status = 'closed'
         AND liquidated_contracts = contracts_with_any_fact
         AND arithmetic_difference IS NOT NULL
         AND abs(arithmetic_difference) <= rounding_tolerance AS executive_publishable,
       'ARS'::char(3) AS currency_code,
       'nominal'::text AS monetary_basis,
       false AS inflation_adjusted
FROM controlled;

CREATE OR REPLACE VIEW vw_dotacion_cierre_mensual AS
SELECT date_trunc('month', run.payroll_date)::date AS month,
       count(DISTINCT fact.employment_contract_id)::bigint AS closed_payroll_contracts
FROM payroll_run run
JOIN payroll_monthly_fact fact ON fact.payroll_run_id = run.id
WHERE run.closure_status = 'closed'
  AND fact.net_payable IS NOT NULL
GROUP BY date_trunc('month', run.payroll_date)::date;

CREATE OR REPLACE VIEW vw_payroll_snapshot_actual AS
WITH latest AS (
  SELECT max(snapshot_date) AS snapshot_date FROM payroll_snapshot_assignment
)
SELECT assignment.*,
       run.closure_status,
       run.source_closed_flag,
       (run.closure_status = 'closed') AS payroll_run_closed
FROM payroll_snapshot_assignment assignment
JOIN latest ON latest.snapshot_date = assignment.snapshot_date
JOIN payroll_run run ON run.id = assignment.payroll_run_id;

CREATE OR REPLACE VIEW vw_movimientos_legajo AS
SELECT em.id,
       em.employment_contract_id,
       ec.legacy_company_id,
       ec.legacy_legajo,
       em.movement_period,
       em.payroll_type,
       em.movement_type,
       em.concept_source_id,
       em.cost_center_source_id,
       em.quantity,
       em.installment,
       em.automatic_source_value,
       em.adjustment_source_value,
       em.forced_source_value,
       em.legal_instrument,
       em.movement_status,
       em.source_id,
       em.source_batch_id
FROM employment_movement em
JOIN employment_contract ec ON ec.id = em.employment_contract_id;

CREATE OR REPLACE VIEW vw_estructura_actual AS
SELECT ec.organization_unit_source_id,
       ec.sector_source_id,
       ec.position_source_id,
       count(*)::bigint AS administrative_headcount,
       count(*) FILTER (WHERE current_status.payroll_status = 'liquidated')::bigint AS liquidated_headcount
FROM employment_contract ec
LEFT JOIN LATERAL (
  SELECT ess.payroll_status
  FROM employment_status_snapshot ess
  WHERE ess.employment_contract_id = ec.id
  ORDER BY ess.snapshot_date DESC
  LIMIT 1
) current_status ON true
WHERE ec.status IN ('active', 'state_error', 'unknown')
GROUP BY ec.organization_unit_source_id, ec.sector_source_id, ec.position_source_id;

CREATE OR REPLACE VIEW vw_crosswalk_persona AS
SELECT cw.id,
       cw.person_id,
       cw.grh_source_entity,
       cw.grh_source_id,
       cw.personas_source_entity,
       cw.personas_source_id,
       cw.match_status,
       cw.match_method,
       cw.confidence,
       cw.evidence,
       cw.valid_from,
       cw.valid_to,
       cw.reviewed_by,
       cw.reviewed_at
FROM crosswalk_persona cw;

CREATE OR REPLACE VIEW vw_calidad_datos AS
SELECT source_system,
       issue_code,
       severity,
       resolution_status,
       count(*)::bigint AS issue_count,
       min(detected_at) AS first_detected_at,
       max(detected_at) AS last_detected_at
FROM data_quality_issue
GROUP BY source_system, issue_code, severity, resolution_status;

CREATE OR REPLACE VIEW vw_employment_status_control AS
WITH latest_snapshot AS (
  SELECT max(snapshot_date) AS snapshot_date
  FROM employment_status_snapshot
), reconciled AS (
  SELECT ess.*
  FROM employment_status_snapshot ess
  JOIN latest_snapshot latest ON latest.snapshot_date = ess.snapshot_date
)
SELECT snapshot_date,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         )
       )::bigint AS administrative_active,
       count(*) FILTER (
         WHERE payroll_status IN ('liquidated', 'preliquidated')
       )::bigint AS payroll_in_current_run,
       count(*) FILTER (WHERE payroll_status = 'liquidated')::bigint
         AS payroll_liquidated_closed,
       count(*) FILTER (WHERE payroll_status = 'preliquidated')::bigint
         AS payroll_preliquidated_open,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND payroll_status NOT IN ('liquidated', 'preliquidated')
       )::bigint AS difference,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND payroll_status = 'unknown'
       )::bigint AS pending_payroll_source,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         )
           AND payroll_status = 'not_liquidated'
           AND (discrepancy_reason_code IS NULL OR discrepancy_explanation IS NULL)
       )::bigint AS unexplained_difference,
       bool_and(monetary_basis = 'nominal') AS monetary_values_are_nominal,
       max(run.closure_status) FILTER (WHERE reconciled.payroll_run_id IS NOT NULL)
         AS current_payroll_closure_status
FROM reconciled
LEFT JOIN payroll_run run ON run.id = reconciled.payroll_run_id
GROUP BY snapshot_date;

COMMENT ON TABLE source_import_batch IS
  'Registro inmutable de cada snapshot validado. Los intentos fallidos permanecen en data_import_runs.';
COMMENT ON TABLE source_staging_row IS
  'Staging append-only: conserva identificador, hash y payload de origen sin sobrescrituras.';
COMMENT ON TABLE crosswalk_persona IS
  'Decisiones versionadas GRH/PERSONAS. IDPERSONA nunca es un método de matching permitido.';
COMMENT ON TABLE employment_contract IS
  'Relación laboral canónica gobernada exclusivamente por GRH.';
COMMENT ON TABLE employment_status_snapshot IS
  'Control temporal que separa estado administrativo de inclusión en liquidación.';
COMMENT ON TABLE payroll_run IS
  'Corrida GRH con evidencia literal histocal.CIER_31. Sólo closure_status=closed puede aspirar a publicación financiera ejecutiva.';
COMMENT ON COLUMN payroll_monthly_fact.technical_source_amount_sum IS
  'Suma técnica de calculo.IMPO_31. Puede mezclar conceptos e ítems totalizadores; no es masa salarial ni KPI financiero.';
COMMENT ON COLUMN payroll_monthly_fact.employer_contributions IS
  'Total nominal explícito informado por el concepto fuente CODI_27 = 990.';
COMMENT ON COLUMN payroll_monthly_fact.social_security_taxable_base IS
  'Base imponible previsional nominal explícita informada por el concepto fuente CODI_27 = 991.';
COMMENT ON COLUMN payroll_monthly_fact.health_taxable_base IS
  'Base imponible de obra social nominal explícita informada por el concepto fuente CODI_27 = 992.';
COMMENT ON COLUMN payroll_monthly_fact.total_subject_earnings IS
  'Total nominal de haberes sujetos explícito informado por el concepto fuente CODI_27 = 993.';
COMMENT ON COLUMN payroll_monthly_fact.total_non_subject_earnings IS
  'Total nominal de haberes no sujetos explícito informado por el concepto fuente CODI_27 = 994.';
COMMENT ON COLUMN payroll_monthly_fact.family_allowance IS
  'Asignación familiar nominal explícita informada por el concepto fuente CODI_27 = 995.';
COMMENT ON COLUMN payroll_monthly_fact.employee_withholdings IS
  'Retenciones nominales del agente explícitas informadas por el concepto fuente CODI_27 = 996.';
COMMENT ON COLUMN payroll_monthly_fact.employer_taxable_base IS
  'Base imponible patronal nominal explícita informada por el concepto fuente CODI_27 = 997.';
COMMENT ON COLUMN payroll_monthly_fact.net IS
  'Neto nominal explícito informado por el concepto fuente CODI_27 = 998.';
COMMENT ON COLUMN payroll_monthly_fact.net_payable IS
  'Neto nominal a pagar explícito informado por el concepto fuente CODI_27 = 999.';
COMMENT ON VIEW vw_liquidacion_mensual IS
  'Componentes 990-999 nominales separados por estado de cierre. executive_publishable exige corrida cerrada y reconciliación aritmética; technical_source_amount_sum nunca es KPI financiero.';
COMMENT ON VIEW vw_nomina_totales IS
  'Control por corrida: 993+994+995-996 debe reconciliar con 999 dentro de una tolerancia de un centavo por legajo. Corridas abiertas nunca son publicables como cifra ejecutiva.';
