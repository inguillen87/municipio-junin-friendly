-- Idempotent promotion of the latest completed curated GRH import.
-- Run only after 002-canonical-integration.sql on an isolated Neon branch.

WITH latest_run AS (
  SELECT *
  FROM data_import_runs
  WHERE status = 'completed'
  ORDER BY completed_at DESC NULLS LAST, id DESC
  LIMIT 1
)
INSERT INTO source_import_batch (
  id,
  source_system,
  source_database,
  source_file_name,
  source_sha256,
  source_cutoff,
  source_row_count,
  legacy_import_run_id,
  validation_state,
  manifest
)
SELECT md5('source_import_batch|GRH|' || upper(source_sha256))::uuid,
       'GRH',
       'grh_junin',
       source_name,
       upper(source_sha256),
       source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires',
       NULL,
       id,
       'published',
       jsonb_build_object(
         'legacyTableCounts', table_counts,
         'legacyQualityFlags', quality_flags,
         'promotionProfile', 'current-curated-grh-v1'
       )
FROM latest_run
WHERE source_cutoff IS NOT NULL
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), rows AS (
  SELECT company_id,
         legajo,
         row_number() OVER (ORDER BY company_id, legajo) AS row_number,
         source_payload
  FROM grh_employees
)
INSERT INTO source_staging_row (
  batch_id, source_schema, source_entity, source_id,
  source_row_number, source_row_sha256, source_payload
)
SELECT batch.id,
       'grh_junin',
       'legajo',
       jsonb_build_object('companyCode', company_id, 'employeeNumber', legajo)::text,
       rows.row_number,
       encode(digest(rows.source_payload::text, 'sha256'), 'hex'),
       rows.source_payload
FROM rows CROSS JOIN batch
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), rows AS (
  SELECT company_id,
         legajo,
         fecha,
         row_number() OVER (ORDER BY company_id, legajo, fecha) AS row_number,
         source_payload
  FROM grh_absences
)
INSERT INTO source_staging_row (
  batch_id, source_schema, source_entity, source_id,
  source_row_number, source_row_sha256, source_payload
)
SELECT batch.id,
       'grh_junin',
       'ausencia',
       jsonb_build_object(
         'companyCode', company_id,
         'employeeNumber', legajo,
         'absenceDate', fecha
       )::text,
       rows.row_number,
       encode(digest(rows.source_payload::text, 'sha256'), 'hex'),
       rows.source_payload
FROM rows CROSS JOIN batch
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), rows AS (
  SELECT company_id,
         legajo,
         periodo,
         fecha_inicio,
         row_number() OVER (ORDER BY company_id, periodo, legajo, fecha_inicio) AS row_number,
         source_payload
  FROM grh_leaves
)
INSERT INTO source_staging_row (
  batch_id, source_schema, source_entity, source_id,
  source_row_number, source_row_sha256, source_payload
)
SELECT batch.id,
       'grh_junin',
       'licencia',
       jsonb_build_object(
         'companyCode', company_id,
         'employeeNumber', legajo,
         'period', periodo,
         'startDate', fecha_inicio
       )::text,
       rows.row_number,
       encode(digest(rows.source_payload::text, 'sha256'), 'hex'),
       rows.source_payload
FROM rows CROSS JOIN batch
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), rows AS (
  SELECT family_id,
         row_number() OVER (ORDER BY family_id) AS row_number,
         source_payload
  FROM grh_family
)
INSERT INTO source_staging_row (
  batch_id, source_schema, source_entity, source_id,
  source_row_number, source_row_sha256, source_payload
)
SELECT batch.id,
       'grh_junin',
       'familia',
       family_id::text,
       rows.row_number,
       encode(digest(rows.source_payload::text, 'sha256'), 'hex'),
       rows.source_payload
FROM rows CROSS JOIN batch
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), rows AS (
  SELECT catalog,
         source_key,
         row_number() OVER (ORDER BY catalog, source_key) AS row_number,
         source_payload
  FROM grh_catalog_rows
)
INSERT INTO source_staging_row (
  batch_id, source_schema, source_entity, source_id,
  source_row_number, source_row_sha256, source_payload
)
SELECT batch.id,
       'grh_junin',
       'catalog:' || catalog,
       source_key,
       rows.row_number,
       encode(digest(rows.source_payload::text, 'sha256'), 'hex'),
       rows.source_payload
FROM rows CROSS JOIN batch
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), people AS (
  SELECT DISTINCT ON (employee.person_id)
         employee.person_id,
         employee.nombre,
         employee.sexo,
         employee.fecha_nacimiento,
         employee.dni,
         employee.cuil,
         employee.domicilio,
         employee.localidad,
         employee.activo
  FROM grh_employees employee
  WHERE employee.person_id IS NOT NULL
  ORDER BY employee.person_id, employee.activo DESC, employee.fecha_egreso DESC NULLS FIRST,
           employee.company_id, employee.legajo
)
INSERT INTO person_identity (
  id, cuil, dni, full_name, birth_date, sex_code,
  data_quality_score, identity_state
)
SELECT md5('person_identity|GRH|persona|' || people.person_id::text)::uuid,
       CASE
         WHEN is_valid_cuil(people.cuil) THEN normalize_digits(people.cuil)
         ELSE NULL
       END,
       NULLIF(normalize_digits(people.dni), ''),
       NULLIF(btrim(people.nombre), ''),
       CASE
         WHEN people.fecha_nacimiento BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
           THEN people.fecha_nacimiento
         ELSE NULL
       END,
       NULLIF(btrim(people.sexo), ''),
       (
         CASE WHEN is_valid_cuil(people.cuil) THEN 30 ELSE 0 END
         + CASE WHEN normalize_digits(people.dni) ~ '^[0-9]{5,12}$' THEN 20 ELSE 0 END
         + CASE WHEN NULLIF(btrim(people.nombre), '') IS NOT NULL THEN 20 ELSE 0 END
         + CASE WHEN people.fecha_nacimiento BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date THEN 15 ELSE 0 END
         + CASE WHEN NULLIF(btrim(people.sexo), '') IS NOT NULL THEN 5 ELSE 0 END
         + CASE WHEN NULLIF(btrim(people.domicilio), '') IS NOT NULL THEN 5 ELSE 0 END
         + CASE WHEN NULLIF(btrim(people.localidad), '') IS NOT NULL THEN 5 ELSE 0 END
       )::numeric(5,2),
       'active'
FROM people CROSS JOIN batch
ON CONFLICT (id) DO UPDATE
SET cuil = EXCLUDED.cuil,
    dni = EXCLUDED.dni,
    full_name = EXCLUDED.full_name,
    birth_date = EXCLUDED.birth_date,
    sex_code = EXCLUDED.sex_code,
    data_quality_score = EXCLUDED.data_quality_score,
    identity_state = EXCLUDED.identity_state,
    updated_at = now()
WHERE (person_identity.cuil, person_identity.dni, person_identity.full_name,
       person_identity.birth_date, person_identity.sex_code,
       person_identity.data_quality_score, person_identity.identity_state)
  IS DISTINCT FROM
      (EXCLUDED.cuil, EXCLUDED.dni, EXCLUDED.full_name,
       EXCLUDED.birth_date, EXCLUDED.sex_code,
       EXCLUDED.data_quality_score, EXCLUDED.identity_state);

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), people AS (
  SELECT DISTINCT person_id
  FROM grh_employees
  WHERE person_id IS NOT NULL
)
INSERT INTO source_xref (
  source_system, source_entity, source_id, source_batch_id,
  canonical_entity, canonical_id, match_method, confidence,
  evidence, valid_from
)
SELECT 'GRH',
       'persona',
       people.person_id::text,
       batch.id,
       'person_identity',
       md5('person_identity|GRH|persona|' || people.person_id::text)::uuid,
       'grh_person_seed',
       1.0000,
       jsonb_build_object(
         'authority', 'GRH is authoritative for the labor person seed',
         'crossSourceIdMatchUsed', false
       ),
       batch.source_cutoff
FROM people CROSS JOIN batch
WHERE NOT EXISTS (
  SELECT 1
  FROM source_xref existing
  WHERE existing.source_system = 'GRH'
    AND existing.source_entity = 'persona'
    AND existing.source_id = people.person_id::text
    AND existing.valid_to IS NULL
);

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
)
UPDATE person_identity_assertion assertion
SET valid_to = batch.source_cutoff,
    preferred = false
FROM batch
WHERE assertion.source_system = 'GRH'
  AND assertion.valid_to IS NULL
  AND assertion.source_batch_id <> batch.id;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), people AS (
  SELECT DISTINCT ON (employee.person_id)
         employee.person_id,
         employee.nombre,
         employee.sexo,
         employee.fecha_nacimiento,
         employee.dni,
         employee.cuil,
         employee.telefono,
         employee.email,
         employee.domicilio,
         employee.localidad
  FROM grh_employees employee
  WHERE employee.person_id IS NOT NULL
  ORDER BY employee.person_id, employee.activo DESC, employee.fecha_egreso DESC NULLS FIRST,
           employee.company_id, employee.legajo
), assertions AS (
  SELECT people.person_id,
         attribute.attribute_name,
         attribute.raw_value,
         attribute.normalized_value,
         attribute.eligible,
         attribute.confidence
  FROM people
  CROSS JOIN batch
  CROSS JOIN LATERAL (
    VALUES
      ('cuil', people.cuil, NULLIF(normalize_digits(people.cuil), ''), is_valid_cuil(people.cuil), 1.0000::numeric),
      ('dni', people.dni, NULLIF(normalize_digits(people.dni), ''), normalize_digits(people.dni) ~ '^[0-9]{5,12}$', 0.9500::numeric),
      ('full_name', people.nombre, NULLIF(btrim(people.nombre), ''), NULLIF(btrim(people.nombre), '') IS NOT NULL, 0.9000::numeric),
      ('birth_date', people.fecha_nacimiento::text, people.fecha_nacimiento::text,
        people.fecha_nacimiento BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date, 0.9000::numeric),
      ('sex_code', people.sexo, NULLIF(btrim(people.sexo), ''), NULLIF(btrim(people.sexo), '') IS NOT NULL, 0.8500::numeric),
      ('email', people.email, lower(NULLIF(btrim(people.email), '')), NULLIF(btrim(people.email), '') IS NOT NULL, 0.7000::numeric),
      ('phone', people.telefono, NULLIF(normalize_digits(people.telefono), ''), NULLIF(normalize_digits(people.telefono), '') IS NOT NULL, 0.7000::numeric),
      ('address', people.domicilio, NULLIF(btrim(people.domicilio), ''), NULLIF(btrim(people.domicilio), '') IS NOT NULL, 0.6500::numeric),
      ('locality', people.localidad, upper(NULLIF(btrim(people.localidad), '')), NULLIF(btrim(people.localidad), '') IS NOT NULL, 0.6500::numeric)
  ) AS attribute(attribute_name, raw_value, normalized_value, eligible, confidence)
  WHERE attribute.raw_value IS NOT NULL
)
INSERT INTO person_identity_assertion (
  id, person_id, attribute_name, raw_value, normalized_value,
  source_system, source_entity, source_id, source_batch_id,
  confidence, evidence, eligible_for_promotion, preferred, valid_from
)
SELECT md5(
         'person_identity_assertion|GRH|persona|' || assertions.person_id::text || '|'
           || assertions.attribute_name || '|' || batch.id::text
       )::uuid,
       md5('person_identity|GRH|persona|' || assertions.person_id::text)::uuid,
       assertions.attribute_name,
       to_jsonb(assertions.raw_value),
       assertions.normalized_value,
       'GRH',
       'persona',
       assertions.person_id::text,
       batch.id,
       assertions.confidence,
       jsonb_build_object('sourcePriority', 'labor_core'),
       assertions.eligible,
       assertions.eligible,
       batch.source_cutoff
FROM assertions CROSS JOIN batch
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
)
INSERT INTO employment_contract (
  id, person_id, source_system, source_batch_id,
  legacy_company_id, legacy_legajo, start_date, end_date,
  agreement_code, category_code, organization_unit_source_id,
  position_source_id, sector_source_id, status, status_explanation,
  source_payload
)
SELECT md5(
         'employment_contract|GRH|legajo|' || employee.company_id::text || '|' || employee.legajo
       )::uuid,
       md5('person_identity|GRH|persona|' || employee.person_id::text)::uuid,
       'GRH',
       batch.id,
       employee.company_id,
       employee.legajo,
       CASE
         WHEN employee.fecha_ingreso BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
           THEN employee.fecha_ingreso
         ELSE NULL
       END,
       CASE
         WHEN employee.fecha_egreso BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
           AND (
             employee.fecha_ingreso IS NULL
             OR employee.fecha_ingreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
             OR employee.fecha_egreso >= employee.fecha_ingreso
           )
           THEN employee.fecha_egreso
         ELSE NULL
       END,
       employee.convenio_code,
       employee.categoria_code,
       NULLIF(employee.source_payload #>> '{employment,organizationId}', ''),
       employee.cargo_code,
       employee.sector_code,
       CASE
         WHEN employee.fecha_ingreso IS NOT NULL
           AND employee.fecha_ingreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
           THEN 'state_error'
         WHEN employee.fecha_egreso IS NOT NULL
           AND (
             employee.fecha_egreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
             OR (employee.fecha_ingreso IS NOT NULL AND employee.fecha_egreso < employee.fecha_ingreso)
           )
           THEN 'state_error'
         WHEN employee.activo THEN 'active'
         ELSE 'inactive'
       END,
       CASE
         WHEN employee.fecha_ingreso IS NOT NULL
           AND employee.fecha_ingreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
           THEN 'Fecha de ingreso fuera de rango; valor crudo preservado en staging.'
         WHEN employee.fecha_egreso IS NOT NULL
           AND employee.fecha_egreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
           THEN 'Fecha de egreso fuera de rango; valor crudo preservado en staging.'
         WHEN employee.fecha_ingreso IS NOT NULL AND employee.fecha_egreso < employee.fecha_ingreso
           THEN 'Fecha de egreso anterior a la fecha de ingreso; requiere saneamiento.'
         ELSE NULL
       END,
       employee.source_payload
FROM grh_employees employee
CROSS JOIN batch
WHERE employee.person_id IS NOT NULL
ON CONFLICT (legacy_company_id, legacy_legajo) DO UPDATE
SET person_id = EXCLUDED.person_id,
    source_batch_id = EXCLUDED.source_batch_id,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    agreement_code = EXCLUDED.agreement_code,
    category_code = EXCLUDED.category_code,
    organization_unit_source_id = EXCLUDED.organization_unit_source_id,
    position_source_id = EXCLUDED.position_source_id,
    sector_source_id = EXCLUDED.sector_source_id,
    status = EXCLUDED.status,
    status_explanation = EXCLUDED.status_explanation,
    source_payload = EXCLUDED.source_payload,
    updated_at = now()
WHERE employment_contract.source_batch_id <> EXCLUDED.source_batch_id;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
)
INSERT INTO source_xref (
  source_system, source_entity, source_id, source_batch_id,
  canonical_entity, canonical_id, match_method, confidence,
  evidence, valid_from
)
SELECT 'GRH',
       'legajo',
       jsonb_build_object(
         'companyCode', employee.company_id,
         'employeeNumber', employee.legajo
       )::text,
       batch.id,
       'employment_contract',
       md5(
         'employment_contract|GRH|legajo|' || employee.company_id::text || '|' || employee.legajo
       )::uuid,
       'grh_legajo',
       1.0000,
       jsonb_build_object('authority', 'GRH labor core'),
       batch.source_cutoff
FROM grh_employees employee
CROSS JOIN batch
WHERE NOT EXISTS (
  SELECT 1
  FROM source_xref existing
  WHERE existing.source_system = 'GRH'
    AND existing.source_entity = 'legajo'
    AND existing.source_id = jsonb_build_object(
      'companyCode', employee.company_id,
      'employeeNumber', employee.legajo
    )::text
    AND existing.valid_to IS NULL
);

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
)
INSERT INTO employment_status_snapshot (
  employment_contract_id, snapshot_date,
  administrative_status, payroll_status,
  discrepancy_reason_code, discrepancy_explanation,
  source_system, source_batch_id, evidence
)
SELECT contract.id,
       batch.source_cutoff::date,
       CASE
         WHEN contract.status = 'active' THEN 'active'
         WHEN contract.status = 'inactive' THEN 'inactive'
         WHEN contract.status = 'state_error' THEN 'state_error'
         ELSE 'unknown'
       END,
       CASE WHEN contract.status = 'inactive' THEN 'not_applicable' ELSE 'unknown' END,
       CASE
         WHEN contract.status = 'state_error' THEN 'state_quality_error'
         WHEN contract.status IN ('active', 'unknown') THEN 'payroll_source_pending'
         ELSE NULL
       END,
       CASE
         WHEN contract.status = 'state_error' THEN contract.status_explanation
         WHEN contract.status IN ('active', 'unknown')
           THEN 'El snapshot individual de liquidación todavía no fue promovido al modelo canónico.'
         ELSE NULL
       END,
       'GRH',
       batch.id,
       jsonb_build_object(
         'administrativeSource', 'grh_employees.active proxy',
         'payrollSourceAvailable', false
       )
FROM employment_contract contract
CROSS JOIN batch
WHERE contract.source_batch_id = batch.id
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), people AS (
  SELECT DISTINCT ON (employee.person_id)
         employee.person_id,
         employee.cuil,
         employee.fecha_nacimiento
  FROM grh_employees employee
  WHERE employee.person_id IS NOT NULL
  ORDER BY employee.person_id, employee.activo DESC, employee.fecha_egreso DESC NULLS FIRST,
           employee.company_id, employee.legajo
)
INSERT INTO data_quality_issue (
  source_batch_id, source_system, source_entity, source_id,
  canonical_entity, canonical_id, issue_code, severity,
  field_name, observed_value, details
)
SELECT batch.id,
       'GRH',
       'persona',
       people.person_id::text,
       'person_identity',
       md5('person_identity|GRH|persona|' || people.person_id::text)::uuid,
       CASE WHEN NULLIF(normalize_digits(people.cuil), '') IS NULL THEN 'CUIL_MISSING' ELSE 'CUIL_INVALID' END,
       'warning',
       'cuil',
       people.cuil,
       jsonb_build_object('promotedToCanonical', false, 'rawValueRetainedInStaging', true)
FROM people CROSS JOIN batch
WHERE NOT COALESCE(is_valid_cuil(people.cuil), false)
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), people AS (
  SELECT DISTINCT ON (employee.person_id)
         employee.person_id,
         employee.fecha_nacimiento
  FROM grh_employees employee
  WHERE employee.person_id IS NOT NULL
  ORDER BY employee.person_id, employee.activo DESC, employee.fecha_egreso DESC NULLS FIRST,
           employee.company_id, employee.legajo
)
INSERT INTO data_quality_issue (
  source_batch_id, source_system, source_entity, source_id,
  canonical_entity, canonical_id, issue_code, severity,
  field_name, observed_value, details
)
SELECT batch.id,
       'GRH',
       'persona',
       people.person_id::text,
       'person_identity',
       md5('person_identity|GRH|persona|' || people.person_id::text)::uuid,
       'DATE_OUT_OF_RANGE',
       'error',
       'birth_date',
       people.fecha_nacimiento::text,
       jsonb_build_object('promotedToCanonical', false, 'rawValueRetainedInStaging', true)
FROM people CROSS JOIN batch
WHERE people.fecha_nacimiento IS NOT NULL
  AND people.fecha_nacimiento NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
ON CONFLICT DO NOTHING;

WITH batch AS (
  SELECT sib.id, sib.source_cutoff
  FROM source_import_batch sib
  JOIN data_import_runs dir ON dir.id = sib.legacy_import_run_id
  WHERE sib.source_system = 'GRH' AND dir.status = 'completed'
  ORDER BY dir.completed_at DESC NULLS LAST, dir.id DESC
  LIMIT 1
), anomalous_dates AS (
  SELECT employee.company_id,
         employee.legajo,
         employee.fecha_ingreso AS observed_date,
         'start_date'::text AS field_name
  FROM grh_employees employee CROSS JOIN batch
  WHERE employee.fecha_ingreso IS NOT NULL
    AND employee.fecha_ingreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
  UNION ALL
  SELECT employee.company_id,
         employee.legajo,
         employee.fecha_egreso,
         'end_date'::text
  FROM grh_employees employee CROSS JOIN batch
  WHERE employee.fecha_egreso IS NOT NULL
    AND employee.fecha_egreso NOT BETWEEN DATE '1900-01-01' AND batch.source_cutoff::date
  UNION ALL
  SELECT employee.company_id,
         employee.legajo,
         employee.fecha_egreso,
         'date_order'::text
  FROM grh_employees employee
  WHERE employee.fecha_ingreso IS NOT NULL
    AND employee.fecha_egreso IS NOT NULL
    AND employee.fecha_egreso < employee.fecha_ingreso
)
INSERT INTO data_quality_issue (
  source_batch_id, source_system, source_entity, source_id,
  canonical_entity, canonical_id, issue_code, severity,
  field_name, observed_value, details
)
SELECT batch.id,
       'GRH',
       'legajo',
       jsonb_build_object(
         'companyCode', anomalous_dates.company_id,
         'employeeNumber', anomalous_dates.legajo
       )::text,
       'employment_contract',
       md5(
         'employment_contract|GRH|legajo|' || anomalous_dates.company_id::text || '|' || anomalous_dates.legajo
       )::uuid,
       CASE WHEN anomalous_dates.field_name = 'date_order' THEN 'DATE_ORDER_INVALID' ELSE 'DATE_OUT_OF_RANGE' END,
       'error',
       anomalous_dates.field_name,
       anomalous_dates.observed_date::text,
       jsonb_build_object('promotedToCanonical', false, 'rawValueRetainedInStaging', true)
FROM anomalous_dates CROSS JOIN batch
ON CONFLICT DO NOTHING;
