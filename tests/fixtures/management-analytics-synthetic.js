// SPDX-License-Identifier: GPL-2.0-only
// Synthetic loopback schema for managementAnalytics checks. No municipal data: every row comes
// from a seeded random stream, so the expected payload fixture is reproducible.
export const MANAGEMENT_ANALYTICS_SYNTHETIC_SQL = String.raw`
-- Synthetic loopback schema for managementAnalytics equivalence checks.
-- Minimal tables and views carrying only the columns the management queries read.
-- No municipal data: rows are generated from a seeded random stream.
CREATE TABLE grh_effective_source_batch_v1 (
  id uuid PRIMARY KEY, source_system text, validation_state text, source_cutoff timestamptz, recorded_at timestamptz
);
CREATE TABLE employment_contract (
  id uuid PRIMARY KEY, person_id uuid NOT NULL, start_date date, end_date date,
  legacy_company_id integer NOT NULL, legacy_legajo text NOT NULL
);
CREATE TABLE grh_absences (
  company_id integer NOT NULL, legajo text NOT NULL, fecha date NOT NULL, dias numeric, fecha_hasta date, import_run_id uuid
);
CREATE TABLE grh_absences_delta (
  company_id integer NOT NULL, legajo text NOT NULL, fecha date NOT NULL, dias numeric, fecha_hasta date, row_key text
);
-- A per-row key function, like production's grh_curated_source_key_v1: every evaluation of the view
-- pays one plpgsql call per base row, so repeated evaluations are what make the real endpoint slow.
CREATE FUNCTION grh_qa_key_v1(company integer, legajo text, fecha date) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN md5(company::text || ':' || legajo || ':' || fecha::text); END $$;
-- A non-trivial view, like the production curated view: base rows minus replaced keys, plus delta rows.
CREATE VIEW grh_effective_absences_v1 AS
  SELECT b.company_id, b.legajo, b.fecha, b.dias, b.fecha_hasta FROM grh_absences b
  WHERE NOT EXISTS (SELECT 1 FROM grh_absences_delta d WHERE d.row_key = grh_qa_key_v1(b.company_id, b.legajo, b.fecha))
  UNION ALL
  SELECT d.company_id, d.legajo, d.fecha, d.dias, d.fecha_hasta FROM grh_absences_delta d;
CREATE TABLE grh_effective_payroll_run_v1 (id uuid PRIMARY KEY, payroll_date date NOT NULL, closure_status text NOT NULL);
CREATE TABLE grh_effective_payroll_monthly_fact_v1 (
  payroll_run_id uuid NOT NULL REFERENCES grh_effective_payroll_run_v1(id),
  employment_contract_id uuid NOT NULL, payroll_date date NOT NULL, net_payable numeric, dominant_sector_source_id text
);
CREATE TABLE grh_effective_catalog_rows_v1 (catalog text NOT NULL, source_key text NOT NULL, source_payload jsonb NOT NULL);
CREATE TABLE grh_effective_employment_movement_v1 (id bigserial PRIMARY KEY, movement_type text);

SELECT setseed(0.4242);
INSERT INTO grh_effective_source_batch_v1 VALUES
  ('00000000-0000-0000-0000-000000000001', 'GRH', 'published', '2026-08-06T18:15:21Z', '2026-08-13T21:43:41Z'),
  ('00000000-0000-0000-0000-000000000002', 'GRH', 'rejected', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z');

-- 360 contracts over two companies; 10% share a person (second contract); staggered starts and some ends.
INSERT INTO employment_contract (id, person_id, start_date, end_date, legacy_company_id, legacy_legajo)
SELECT ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       CASE WHEN n % 10 = 0 THEN ('00000000-0000-0000-0000-' || lpad((n - 1)::text, 12, '0'))::uuid
            ELSE ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid END,
       CASE WHEN n % 23 = 0 THEN NULL ELSE DATE '2016-01-01' + (random() * 3800)::int END,
       CASE WHEN n % 4 = 0 THEN DATE '2020-01-01' + (random() * 2400)::int ELSE NULL END,
       CASE WHEN n % 3 = 0 THEN 102 ELSE 101 END,
       (1000 + n)::text
FROM generate_series(1, 360) AS s(n);

-- 24000 absences 2019-10 .. 2026-09, 2% unlinked legajos, 1% before coverage, 1% inverted ranges.
INSERT INTO grh_absences (company_id, legajo, fecha, dias, fecha_hasta, import_run_id)
SELECT CASE WHEN n % 3 = 0 THEN 102 ELSE 101 END,
       CASE WHEN n % 50 = 0 THEN (9000 + n % 7)::text ELSE (1000 + 1 + (random() * 359)::int)::text END,
       CASE WHEN n % 100 = 0 THEN DATE '1985-01-01' + (random() * 300)::int ELSE DATE '2019-10-01' + (random() * 2550)::int END,
       (1 + (random() * 4)::int)::numeric,
       NULL, NULL
FROM generate_series(1, 24000) AS s(n);
UPDATE grh_absences SET fecha_hasta = CASE WHEN (company_id * 7 + legajo::int + extract(doy FROM fecha)::int) % 100 = 0 THEN fecha - 3 ELSE fecha + (dias::int - 1) END;
-- Delta rows replace 300 base keys and add 200 new ones.
INSERT INTO grh_absences_delta (company_id, legajo, fecha, dias, fecha_hasta, row_key)
SELECT company_id, legajo, fecha, dias + 1, fecha_hasta, grh_qa_key_v1(company_id, legajo, fecha)
FROM (SELECT * FROM grh_absences ORDER BY company_id, legajo, fecha) ordered WHERE random() < 0.0125;
INSERT INTO grh_absences_delta (company_id, legajo, fecha, dias, fecha_hasta, row_key)
SELECT 101, legajo, fecha, 2, NULL, grh_qa_key_v1(101, legajo, fecha)
FROM (SELECT (1000 + 1 + (random() * 359)::int)::text AS legajo, DATE '2024-01-01' + (random() * 900)::int AS fecha FROM generate_series(1, 200)) AS added;

-- Monthly closed runs 2019-12 .. 2026-07, one open run 2026-08.
INSERT INTO grh_effective_payroll_run_v1 (id, payroll_date, closure_status)
SELECT ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, (DATE '2019-12-01' + (n || ' months')::interval)::date, 'closed'
FROM generate_series(0, 79) AS s(n);
INSERT INTO grh_effective_payroll_run_v1 VALUES ('20000000-0000-0000-0000-000000000999', DATE '2026-08-01', 'open');
-- Facts: each active contract paid in each closed month; sector mostly stable, 3% ambiguous, 2% missing, 1% null net.
INSERT INTO grh_effective_payroll_monthly_fact_v1 (payroll_run_id, employment_contract_id, payroll_date, net_payable, dominant_sector_source_id)
SELECT run.id, c.id, run.payroll_date,
       CASE WHEN random() < 0.01 THEN NULL ELSE (100000 + random() * 900000)::numeric(14,2) END,
       CASE WHEN random() < 0.02 THEN NULL ELSE ((('x' || substr(md5(c.id::text), 1, 2))::bit(8)::int % 12) + 1)::text END
FROM grh_effective_payroll_run_v1 run
JOIN employment_contract c ON (c.start_date IS NULL OR c.start_date <= run.payroll_date)
                          AND (c.end_date IS NULL OR c.end_date >= run.payroll_date)
WHERE run.closure_status = 'closed'
ORDER BY run.payroll_date, c.id;
INSERT INTO grh_effective_payroll_monthly_fact_v1 (payroll_run_id, employment_contract_id, payroll_date, net_payable, dominant_sector_source_id)
SELECT payroll_run_id, employment_contract_id, payroll_date, net_payable, '99'
FROM (SELECT * FROM grh_effective_payroll_monthly_fact_v1 ORDER BY payroll_date, employment_contract_id) ordered WHERE random() < 0.03;

INSERT INTO grh_effective_catalog_rows_v1 (catalog, source_key, source_payload)
SELECT 'sectors', 'sector:' || company || ':' || code,
       jsonb_build_object('name', 'SECTOR ' || code || ' C' || company, 'sourceKey', jsonb_build_object('companyCode', company::text, 'sectorCode', code::text))
FROM generate_series(1, 10) AS code, (VALUES (101), (102)) AS companies(company);

INSERT INTO grh_effective_employment_movement_v1 (movement_type)
SELECT CASE WHEN random() < 0.6 THEN NULL ELSE 'ALTA' END FROM generate_series(1, 5000);
ANALYZE;
`;
