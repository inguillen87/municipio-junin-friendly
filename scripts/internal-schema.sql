CREATE TABLE IF NOT EXISTS internal_users (
  email text PRIMARY KEY,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'ADMIN_INTERNO',
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS data_import_runs (
  id bigserial PRIMARY KEY,
  source_name text NOT NULL,
  source_sha256 text NOT NULL,
  source_cutoff timestamp,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text
);

CREATE TABLE IF NOT EXISTS grh_employees (
  company_id integer NOT NULL,
  legajo text NOT NULL,
  person_id bigint,
  nombre text,
  sexo text,
  fecha_nacimiento date,
  dni text,
  cuil text,
  telefono text,
  email text,
  domicilio text,
  localidad text,
  fecha_ingreso date,
  fecha_egreso date,
  activo boolean NOT NULL,
  sector_code text,
  sector text,
  categoria_code text,
  categoria text,
  convenio_code text,
  convenio text,
  cargo_code text,
  cargo text,
  gremio text,
  lugar_trabajo text,
  profesion text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_run_id bigint REFERENCES data_import_runs(id),
  PRIMARY KEY (company_id, legajo)
);

CREATE TABLE IF NOT EXISTS grh_absences (
  company_id integer NOT NULL,
  legajo text NOT NULL,
  fecha date NOT NULL,
  motivo_code text,
  cantidad numeric,
  dias numeric,
  fecha_hasta date,
  comentario text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_run_id bigint REFERENCES data_import_runs(id),
  PRIMARY KEY (company_id, legajo, fecha)
);

CREATE TABLE IF NOT EXISTS grh_leaves (
  company_id integer NOT NULL,
  legajo text NOT NULL,
  periodo integer NOT NULL,
  tipo text,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  dias integer,
  observaciones text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_run_id bigint REFERENCES data_import_runs(id),
  PRIMARY KEY (company_id, periodo, legajo, fecha_inicio)
);

CREATE TABLE IF NOT EXISTS grh_family (
  family_id bigint PRIMARY KEY,
  company_id integer NOT NULL,
  legajo text NOT NULL,
  nombre text,
  sexo text,
  fecha_nacimiento date,
  dni text,
  cuil text,
  vinculo_code text,
  fecha_baja date,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_run_id bigint REFERENCES data_import_runs(id)
);

CREATE TABLE IF NOT EXISTS grh_catalog_rows (
  catalog text NOT NULL,
  source_key text NOT NULL,
  label text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_run_id bigint REFERENCES data_import_runs(id),
  PRIMARY KEY (catalog, source_key)
);

CREATE INDEX IF NOT EXISTS grh_employees_name_idx ON grh_employees (lower(nombre));
CREATE INDEX IF NOT EXISTS grh_employees_dni_idx ON grh_employees (dni);
CREATE INDEX IF NOT EXISTS grh_employees_cuil_idx ON grh_employees (cuil);
CREATE INDEX IF NOT EXISTS grh_employees_active_idx ON grh_employees (activo);
CREATE INDEX IF NOT EXISTS grh_employees_sector_idx ON grh_employees (sector);
CREATE INDEX IF NOT EXISTS grh_absences_legajo_date_idx ON grh_absences (company_id, legajo, fecha DESC);
CREATE INDEX IF NOT EXISTS grh_absences_date_idx ON grh_absences (fecha DESC);
CREATE INDEX IF NOT EXISTS grh_leaves_legajo_date_idx ON grh_leaves (company_id, legajo, fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS grh_family_legajo_idx ON grh_family (company_id, legajo);

COMMENT ON TABLE grh_employees IS 'Vista curada de legajos GRH; source_payload conserva las columnas originales de la fila importada.';
COMMENT ON TABLE grh_absences IS 'Eventos completos de la tabla ausencia del backup GRH.';
COMMENT ON TABLE grh_leaves IS 'Registros completos de la tabla licencia; la fuente histórica finaliza en 2009.';
