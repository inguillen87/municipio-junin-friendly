-- MuniControl Friendly - Sprint 022
-- Gateway tenant-bound para puntos, relojes y marcaciones normalizadas.
-- No almacena plantillas biometricas, identificadores de dispositivo en claro,
-- coordenadas continuas de empleados, horas calculadas ni importes de nomina.

INSERT INTO public.iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  ('attendance.read', 'Consultar control horario',
   'Consulta puntos, dispositivos, lotes y marcaciones normalizadas del tenant.', 'tenant', 'standard'),
  ('attendance.audit.read', 'Auditar control horario',
   'Consulta la trazabilidad append-only de configuracion y revision.', 'tenant', 'restricted'),
  ('attendance.site.manage', 'Administrar puntos de marcacion',
   'Configura lugares y perimetros institucionales de marcacion.', 'tenant', 'privileged'),
  ('attendance.device.manage', 'Administrar relojes',
   'Configura dispositivos, drivers declarados y capacidades tecnicas.', 'tenant', 'privileged'),
  ('attendance.connector.manage', 'Administrar conectores',
   'Provisiona y rota credenciales hasheadas de conectores de relojes.', 'tenant', 'restricted'),
  ('attendance.identity.manage', 'Vincular identidades de reloj',
   'Vincula referencias HMAC de usuario de dispositivo con contratos canonicos.', 'tenant', 'restricted'),
  ('attendance.ingest', 'Ingerir marcaciones',
   'Opera lotes idempotentes del gateway; no calcula horas ni nomina.', 'tenant', 'restricted'),
  ('attendance.review', 'Revisar marcaciones',
   'Decide excepciones de vinculacion sobre hechos inmutables.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES (
  'attendance.ingest', 'attendance.review',
  'La operacion del conector y la revision humana de sus excepciones deben permanecer separadas.'
)
ON CONFLICT (capability_key, conflicts_with_key)
DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO public.iam_role (
  role_key, label, description, scope_kind, system_managed
) VALUES
  ('JUNIN_ASISTENCIA_OPERADOR', 'Control horario - operador',
   'Configura puntos, relojes, conectores y vinculaciones; ingiere sin revisar.', 'tenant', true),
  ('JUNIN_ASISTENCIA_REVISOR', 'Control horario - revisor',
   'Consulta trazabilidad y decide excepciones; no configura ni ingiere.', 'tenant', true)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  system_managed = EXCLUDED.system_managed;

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('CONSULTA_INTEGRAL', 'attendance.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'attendance.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'attendance.audit.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'attendance.review'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.site.manage'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.device.manage'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.connector.manage'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.identity.manage'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.ingest'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.read'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.audit.read'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.site.manage'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.device.manage'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.connector.manage'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.identity.manage'),
  ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.ingest'),
  ('JUNIN_ASISTENCIA_REVISOR', 'attendance.read'),
  ('JUNIN_ASISTENCIA_REVISOR', 'attendance.audit.read'),
  ('JUNIN_ASISTENCIA_REVISOR', 'attendance.review')
ON CONFLICT (role_key, capability_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance_marking_site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  external_key varchar(96) NOT NULL,
  label varchar(180) NOT NULL,
  address_text varchar(300),
  timezone varchar(64) NOT NULL DEFAULT 'America/Argentina/Mendoza',
  latitude numeric(9,6),
  longitude numeric(9,6),
  geofence_radius_m integer,
  network_enabled boolean NOT NULL DEFAULT false,
  removable_media_enabled boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_marking_site_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_marking_site_external_uk UNIQUE (tenant_id, external_key),
  CONSTRAINT attendance_marking_site_membership_fk FOREIGN KEY (created_by_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_marking_site_external_ck
    CHECK (external_key ~ '^[a-z0-9][a-z0-9._-]{1,95}$'),
  CONSTRAINT attendance_marking_site_label_ck CHECK (length(btrim(label)) BETWEEN 2 AND 180),
  CONSTRAINT attendance_marking_site_address_ck CHECK (
    address_text IS NULL OR length(btrim(address_text)) BETWEEN 3 AND 300
  ),
  CONSTRAINT attendance_marking_site_timezone_ck CHECK (
    length(timezone) BETWEEN 3 AND 64
    AND timezone ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z0-9][A-Za-z0-9._+-]*)+$'
  ),
  CONSTRAINT attendance_marking_site_coordinates_ck CHECK (
    (latitude IS NULL AND longitude IS NULL AND geofence_radius_m IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      AND (geofence_radius_m IS NULL OR geofence_radius_m BETWEEN 10 AND 2000))
  ),
  CONSTRAINT attendance_marking_site_transport_ck
    CHECK (network_enabled IS TRUE OR removable_media_enabled IS TRUE),
  CONSTRAINT attendance_marking_site_status_ck
    CHECK (status IN ('draft','active','suspended','retired')),
  CONSTRAINT attendance_marking_site_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS attendance_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  external_key varchar(96) NOT NULL,
  vendor_key varchar(64) NOT NULL,
  model varchar(120) NOT NULL,
  transport varchar(24) NOT NULL,
  driver_key varchar(96) NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'America/Argentina/Mendoza',
  serial_number varchar(128),
  firmware_version varchar(120),
  protocol_key varchar(64),
  network_host inet,
  network_port integer,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_device_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_device_external_uk UNIQUE (tenant_id, external_key),
  CONSTRAINT attendance_device_site_fk FOREIGN KEY (site_id, tenant_id)
    REFERENCES attendance_marking_site(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_device_membership_fk FOREIGN KEY (created_by_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_device_external_ck
    CHECK (external_key ~ '^[a-z0-9][a-z0-9._-]{1,95}$'),
  CONSTRAINT attendance_device_vendor_ck
    CHECK (vendor_key ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  CONSTRAINT attendance_device_model_ck CHECK (length(btrim(model)) BETWEEN 1 AND 120),
  CONSTRAINT attendance_device_transport_ck
    CHECK (transport IN ('network_pull','network_push','removable_media','hybrid')),
  CONSTRAINT attendance_device_driver_ck
    CHECK (
      driver_key ~ '^[a-z0-9][a-z0-9._-]{2,95}$'
      AND driver_key <> 'simulator'
    ),
  CONSTRAINT attendance_device_timezone_ck CHECK (
    length(timezone) BETWEEN 3 AND 64
    AND timezone ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z0-9][A-Za-z0-9._+-]*)+$'
  ),
  CONSTRAINT attendance_device_serial_ck CHECK (
    serial_number IS NULL OR length(btrim(serial_number)) BETWEEN 1 AND 128
  ),
  CONSTRAINT attendance_device_firmware_ck CHECK (
    firmware_version IS NULL OR length(btrim(firmware_version)) BETWEEN 1 AND 120
  ),
  CONSTRAINT attendance_device_protocol_ck CHECK (
    protocol_key IS NULL OR protocol_key ~ '^[a-z0-9][a-z0-9._-]{1,63}$'
  ),
  CONSTRAINT attendance_device_network_host_ck CHECK (
    network_host IS NULL OR masklen(network_host) IN (32,128)
  ),
  CONSTRAINT attendance_device_network_port_ck CHECK (
    network_port IS NULL OR network_port BETWEEN 1 AND 65535
  ),
  CONSTRAINT attendance_device_capabilities_ck CHECK (jsonb_typeof(capabilities) = 'object'),
  CONSTRAINT attendance_device_status_ck CHECK (status IN ('draft','active','offline','suspended','retired')),
  CONSTRAINT attendance_device_activation_ck CHECK (
    status <> 'active' OR (
      serial_number IS NOT NULL AND firmware_version IS NOT NULL AND protocol_key IS NOT NULL
      AND (
        transport NOT IN ('network_pull','network_push','hybrid')
        OR (network_host IS NOT NULL AND network_port IS NOT NULL)
      )
    )
  ),
  CONSTRAINT attendance_device_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS attendance_connector (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL,
  external_key varchar(128) NOT NULL,
  driver_key varchar(96) NOT NULL,
  token_sha256 char(64) NOT NULL,
  token_version integer NOT NULL DEFAULT 1,
  status varchar(16) NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  last_accepted_at timestamptz,
  CONSTRAINT attendance_connector_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_connector_external_uk UNIQUE (external_key),
  CONSTRAINT attendance_connector_device_uk UNIQUE (tenant_id, device_id),
  CONSTRAINT attendance_connector_device_fk FOREIGN KEY (device_id, tenant_id)
    REFERENCES attendance_device(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_connector_membership_fk FOREIGN KEY (created_by_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_connector_external_ck
    CHECK (external_key ~ '^[a-z0-9][a-z0-9._-]{7,127}$'),
  CONSTRAINT attendance_connector_driver_ck
    CHECK (
      driver_key ~ '^[a-z0-9][a-z0-9._-]{2,95}$'
      AND driver_key <> 'simulator'
    ),
  CONSTRAINT attendance_connector_token_ck CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT attendance_connector_status_ck CHECK (status IN ('active','suspended','retired')),
  CONSTRAINT attendance_connector_version_ck CHECK (version > 0 AND token_version > 0)
);

-- Reaplicación segura sobre una QA que ya tenía la primera revisión de 022.
-- Si existiera un simulador persistido, la transacción falla y exige depurarlo
-- explícitamente; nunca lo convierte silenciosamente en evidencia municipal.
ALTER TABLE attendance_device DROP CONSTRAINT IF EXISTS attendance_device_transport_ck;
ALTER TABLE attendance_device ADD CONSTRAINT attendance_device_transport_ck
  CHECK (transport IN ('network_pull','network_push','removable_media','hybrid'));
ALTER TABLE attendance_device DROP CONSTRAINT IF EXISTS attendance_device_driver_ck;
ALTER TABLE attendance_device ADD CONSTRAINT attendance_device_driver_ck
  CHECK (
    driver_key ~ '^[a-z0-9][a-z0-9._-]{2,95}$'
    AND driver_key <> 'simulator'
  );
ALTER TABLE attendance_connector DROP CONSTRAINT IF EXISTS attendance_connector_driver_ck;
ALTER TABLE attendance_connector ADD CONSTRAINT attendance_connector_driver_ck
  CHECK (
    driver_key ~ '^[a-z0-9][a-z0-9._-]{2,95}$'
    AND driver_key <> 'simulator'
  );

CREATE TABLE IF NOT EXISTS attendance_identity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL,
  identity_hmac_sha256 char(64) NOT NULL,
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_to date,
  status varchar(16) NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT attendance_identity_map_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_identity_map_device_identity_from_uk
    UNIQUE (tenant_id, device_id, identity_hmac_sha256, valid_from),
  CONSTRAINT attendance_identity_map_device_fk FOREIGN KEY (device_id, tenant_id)
    REFERENCES attendance_device(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_identity_map_membership_fk FOREIGN KEY (created_by_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_identity_map_hmac_ck CHECK (identity_hmac_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT attendance_identity_map_dates_ck CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT attendance_identity_map_status_ck CHECK (status IN ('active','revoked')),
  CONSTRAINT attendance_identity_map_state_ck CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT attendance_identity_map_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS attendance_ingest_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  connector_id uuid NOT NULL,
  device_id uuid NOT NULL,
  batch_key varchar(160) NOT NULL,
  payload_sha256 char(64) NOT NULL,
  release_sha char(40) NOT NULL,
  status varchar(16) NOT NULL,
  event_count integer NOT NULL,
  accepted_count integer NOT NULL,
  duplicate_count integer NOT NULL,
  unmapped_count integer NOT NULL,
  ambiguous_count integer NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_ingest_batch_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_ingest_batch_idempotency_uk UNIQUE (connector_id, batch_key),
  CONSTRAINT attendance_ingest_batch_connector_fk FOREIGN KEY (connector_id, tenant_id)
    REFERENCES attendance_connector(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_ingest_batch_device_fk FOREIGN KEY (device_id, tenant_id)
    REFERENCES attendance_device(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_ingest_batch_key_ck CHECK (length(btrim(batch_key)) BETWEEN 1 AND 160),
  CONSTRAINT attendance_ingest_batch_hash_ck CHECK (
    payload_sha256 ~ '^[a-f0-9]{64}$' AND release_sha ~ '^[a-f0-9]{40}$'
  ),
  CONSTRAINT attendance_ingest_batch_status_ck CHECK (status = 'accepted'),
  CONSTRAINT attendance_ingest_batch_counts_ck CHECK (
    event_count BETWEEN 1 AND 5000
    AND accepted_count >= 0 AND duplicate_count >= 0
    AND unmapped_count >= 0 AND ambiguous_count >= 0
    AND accepted_count + duplicate_count = event_count
    AND unmapped_count + ambiguous_count <= accepted_count
  )
);

CREATE TABLE IF NOT EXISTS attendance_raw_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  connector_id uuid NOT NULL,
  device_id uuid NOT NULL,
  event_key varchar(160) NOT NULL,
  event_sha256 char(64) NOT NULL,
  identity_hmac_sha256 char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  method varchar(16) NOT NULL,
  direction varchar(8) NOT NULL,
  verification_result varchar(16) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_raw_event_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_raw_event_device_event_key_uk UNIQUE (device_id, event_key),
  CONSTRAINT attendance_raw_event_device_hash_uk UNIQUE (device_id, event_sha256),
  CONSTRAINT attendance_raw_event_batch_fk FOREIGN KEY (batch_id, tenant_id)
    REFERENCES attendance_ingest_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_raw_event_connector_fk FOREIGN KEY (connector_id, tenant_id)
    REFERENCES attendance_connector(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_raw_event_device_fk FOREIGN KEY (device_id, tenant_id)
    REFERENCES attendance_device(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_raw_event_key_ck CHECK (length(btrim(event_key)) BETWEEN 1 AND 160),
  CONSTRAINT attendance_raw_event_hashes_ck CHECK (
    event_sha256 ~ '^[a-f0-9]{64}$' AND identity_hmac_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT attendance_raw_event_method_ck
    CHECK (method IN ('fingerprint','card','pin','face','mobile','manual','unknown')),
  CONSTRAINT attendance_raw_event_direction_ck CHECK (direction IN ('in','out','unknown')),
  CONSTRAINT attendance_raw_event_verification_ck
    CHECK (verification_result IN ('accepted','rejected','unknown'))
);

-- Compatibilidad idempotente con ramas QA donde 022 ya existía antes de
-- incorporar el resultado informado por el reloj. Los hechos previos no se
-- reinterpretan como aceptados: quedan explícitamente como desconocidos.
ALTER TABLE attendance_raw_event
  ADD COLUMN IF NOT EXISTS verification_result varchar(16) NOT NULL DEFAULT 'unknown';
ALTER TABLE attendance_raw_event ALTER COLUMN verification_result DROP DEFAULT;
ALTER TABLE attendance_raw_event
  DROP CONSTRAINT IF EXISTS attendance_raw_event_verification_ck;
ALTER TABLE attendance_raw_event
  ADD CONSTRAINT attendance_raw_event_verification_ck
  CHECK (verification_result IN ('accepted','rejected','unknown'));

CREATE TABLE IF NOT EXISTS attendance_canonical_punch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  raw_event_id uuid NOT NULL,
  site_id uuid NOT NULL,
  device_id uuid NOT NULL,
  identity_map_id uuid,
  employment_contract_id uuid REFERENCES employment_contract(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  method varchar(16) NOT NULL,
  direction varchar(8) NOT NULL,
  reconciliation_state varchar(16) NOT NULL,
  review_state varchar(16) NOT NULL,
  review_reason_code varchar(64),
  reviewed_by_membership_id uuid,
  reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_canonical_punch_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT attendance_canonical_punch_raw_uk UNIQUE (raw_event_id),
  CONSTRAINT attendance_canonical_punch_raw_fk FOREIGN KEY (raw_event_id, tenant_id)
    REFERENCES attendance_raw_event(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_canonical_punch_site_fk FOREIGN KEY (site_id, tenant_id)
    REFERENCES attendance_marking_site(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_canonical_punch_device_fk FOREIGN KEY (device_id, tenant_id)
    REFERENCES attendance_device(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_canonical_punch_identity_fk FOREIGN KEY (identity_map_id, tenant_id)
    REFERENCES attendance_identity_map(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_canonical_punch_reviewer_fk FOREIGN KEY (reviewed_by_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_canonical_punch_fact_ck CHECK (
    method IN ('fingerprint','card','pin','face','mobile','manual','unknown')
    AND direction IN ('in','out','unknown')
  ),
  CONSTRAINT attendance_canonical_punch_reconciliation_ck
    CHECK (reconciliation_state IN ('mapped','unmapped','ambiguous')),
  CONSTRAINT attendance_canonical_punch_review_ck CHECK (
    (review_state IN ('recorded','pending') AND review_reason_code IS NULL
      AND reviewed_by_membership_id IS NULL AND reviewed_at IS NULL)
    OR (review_state IN ('accepted','rejected') AND review_reason_code IS NOT NULL
      AND reviewed_by_membership_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT attendance_canonical_punch_accept_mapped_ck
    CHECK (review_state <> 'accepted' OR reconciliation_state = 'mapped'),
  CONSTRAINT attendance_canonical_punch_mapping_ck CHECK (
    (reconciliation_state = 'mapped' AND identity_map_id IS NOT NULL AND employment_contract_id IS NOT NULL)
    OR (reconciliation_state IN ('unmapped','ambiguous')
      AND identity_map_id IS NULL AND employment_contract_id IS NULL)
  ),
  CONSTRAINT attendance_canonical_punch_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS attendance_gateway_audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  target_kind varchar(16) NOT NULL,
  target_id uuid NOT NULL,
  actor_kind varchar(16) NOT NULL,
  actor_membership_id uuid,
  actor_session_id uuid,
  actor_session_version integer,
  connector_id uuid,
  release_sha char(40) NOT NULL,
  command varchar(48) NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_gateway_audit_membership_fk FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_gateway_audit_connector_fk FOREIGN KEY (connector_id, tenant_id)
    REFERENCES attendance_connector(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_gateway_audit_target_ck
    CHECK (target_kind IN ('site','device','connector','identity','punch','batch')),
  CONSTRAINT attendance_gateway_audit_actor_ck CHECK (
    (actor_kind = 'membership' AND actor_membership_id IS NOT NULL
      AND actor_session_id IS NOT NULL AND actor_session_version > 0 AND connector_id IS NULL)
    OR (actor_kind = 'connector' AND actor_membership_id IS NULL
      AND actor_session_id IS NULL AND actor_session_version IS NULL AND connector_id IS NOT NULL)
  ),
  CONSTRAINT attendance_gateway_audit_hash_ck CHECK (
    release_sha ~ '^[a-f0-9]{40}$' AND command_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT attendance_gateway_audit_json_ck CHECK (
    jsonb_typeof(before_snapshot) = 'object'
    AND jsonb_typeof(after_snapshot) = 'object'
    AND jsonb_typeof(result) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS attendance_site_tenant_status_idx
  ON attendance_marking_site (tenant_id, status, label, id);
CREATE INDEX IF NOT EXISTS attendance_device_tenant_site_idx
  ON attendance_device (tenant_id, site_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_device_tenant_vendor_serial_uk
  ON attendance_device (tenant_id, vendor_key, lower(serial_number))
  WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_identity_lookup_idx
  ON attendance_identity_map (tenant_id, device_id, identity_hmac_sha256, valid_from, valid_to)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS attendance_batch_tenant_received_idx
  ON attendance_ingest_batch (tenant_id, received_at DESC, id);
CREATE INDEX IF NOT EXISTS attendance_raw_tenant_time_idx
  ON attendance_raw_event (tenant_id, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS attendance_punch_tenant_time_idx
  ON attendance_canonical_punch (tenant_id, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS attendance_punch_review_idx
  ON attendance_canonical_punch (tenant_id, review_state, occurred_at, id);
CREATE INDEX IF NOT EXISTS attendance_audit_tenant_timeline_idx
  ON attendance_gateway_audit_event (tenant_id, occurred_at DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_audit_membership_idempotency_uk
  ON attendance_gateway_audit_event (tenant_id, actor_membership_id, idempotency_key)
  WHERE actor_kind = 'membership';
CREATE UNIQUE INDEX IF NOT EXISTS attendance_audit_connector_idempotency_uk
  ON attendance_gateway_audit_event (tenant_id, connector_id, idempotency_key)
  WHERE actor_kind = 'connector';

CREATE OR REPLACE FUNCTION attendance_gateway_json_keys_exact_v1(
  p_value jsonb,
  p_keys text[]
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_typeof(p_value) = 'object'
    AND COALESCE(
      (SELECT array_agg(item.key ORDER BY item.key) FROM jsonb_object_keys(p_value) item(key)),
      ARRAY[]::text[]
    ) = (SELECT array_agg(key ORDER BY key) FROM unnest(p_keys) key)
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_event_valid_v1(p_event jsonb)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN attendance_gateway_json_keys_exact_v1(
      p_event,
      ARRAY[
        'eventKey','eventSha256','identityHmacSha256','occurredAt','method','direction',
        'verificationResult'
      ]
    )
    AND jsonb_typeof(p_event->'eventKey') = 'string'
    AND length(btrim(p_event->>'eventKey')) BETWEEN 1 AND 160
    AND jsonb_typeof(p_event->'eventSha256') = 'string'
    AND lower(p_event->>'eventSha256') ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(p_event->'identityHmacSha256') = 'string'
    AND lower(p_event->>'identityHmacSha256') ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(p_event->'occurredAt') = 'string'
    AND p_event->>'occurredAt' ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$'
    AND (p_event->>'occurredAt')::timestamptz
      BETWEEN TIMESTAMPTZ '2000-01-01 00:00:00+00' AND now() + interval '5 minutes'
    AND p_event->>'method' IN ('fingerprint','card','pin','face','mobile','manual','unknown')
    AND p_event->>'direction' IN ('in','out','unknown')
    AND p_event->>'verificationResult' IN ('accepted','rejected','unknown');
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_json_keys_allowed_v1(
  p_value jsonb,
  p_required text[],
  p_allowed text[]
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_typeof(p_value) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p_required) required(key) WHERE NOT (p_value ? required.key)
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_value) actual(key)
      WHERE actual.key <> ALL(p_allowed)
    )
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_device_capabilities_valid_v1(p_value jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT attendance_gateway_json_keys_exact_v1(
      p_value, ARRAY['pull','push','biometric','card','pin']
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_value) capability
      WHERE jsonb_typeof(capability.value) <> 'boolean'
    )
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_timezone_valid_v1(p_timezone text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT length(COALESCE(p_timezone, '')) BETWEEN 3 AND 64
    AND p_timezone = btrim(p_timezone)
    AND p_timezone ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z0-9][A-Za-z0-9._+-]*)+$'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name = p_timezone
    )
$$;

ALTER TABLE attendance_device
  DROP CONSTRAINT IF EXISTS attendance_device_capabilities_ck;
ALTER TABLE attendance_device
  ADD CONSTRAINT attendance_device_capabilities_ck
  CHECK (attendance_gateway_device_capabilities_valid_v1(capabilities));

CREATE OR REPLACE FUNCTION attendance_gateway_reject_change_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'ATTENDANCE_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_identity_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'attendance-identity:' || NEW.tenant_id::text || ':' || NEW.device_id::text
      || ':' || NEW.identity_hmac_sha256,
    0
  ));

  IF TG_OP = 'UPDATE' AND (
       NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.device_id IS DISTINCT FROM OLD.device_id
       OR NEW.identity_hmac_sha256 IS DISTINCT FROM OLD.identity_hmac_sha256
       OR NEW.employment_contract_id IS DISTINCT FROM OLD.employment_contract_id
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.version IS DISTINCT FROM OLD.version + 1
       OR OLD.status = 'revoked'
     ) THEN
    RAISE EXCEPTION 'ATTENDANCE_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1
    FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    JOIN employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.status IN ('active','inactive')
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE policy.tenant_id = NEW.tenant_id
      AND policy.tenant_data_plane_ready IS TRUE
  ) THEN
    RAISE EXCEPTION 'ATTENDANCE_IDENTITY_CONTRACT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM attendance_identity_map existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.device_id = NEW.device_id
      AND existing.identity_hmac_sha256 = NEW.identity_hmac_sha256
      AND existing.status = 'active'
      AND existing.id <> NEW.id
      AND existing.valid_from <= COALESCE(NEW.valid_to, DATE '9999-12-31')
      AND COALESCE(existing.valid_to, DATE '9999-12-31') >= NEW.valid_from
  ) THEN
    RAISE EXCEPTION 'ATTENDANCE_IDENTITY_OVERLAP' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_punch_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.raw_event_id IS DISTINCT FROM OLD.raw_event_id
     OR NEW.site_id IS DISTINCT FROM OLD.site_id
     OR NEW.device_id IS DISTINCT FROM OLD.device_id
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_FACT_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_VERSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.review_state IN ('accepted','rejected') THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_REVIEW_TERMINAL' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.reconciliation_state = 'mapped'
     AND (NEW.reconciliation_state IS DISTINCT FROM OLD.reconciliation_state
       OR NEW.identity_map_id IS DISTINCT FROM OLD.identity_map_id
       OR NEW.employment_contract_id IS DISTINCT FROM OLD.employment_contract_id) THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_MAPPING_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.reconciliation_state IN ('unmapped','ambiguous')
     AND NEW.reconciliation_state NOT IN (OLD.reconciliation_state, 'mapped') THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_MAPPING_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS attendance_identity_map_guard_v1 ON attendance_identity_map;
CREATE TRIGGER attendance_identity_map_guard_v1
BEFORE INSERT OR UPDATE ON attendance_identity_map
FOR EACH ROW EXECUTE FUNCTION attendance_gateway_identity_guard_v1();

DROP TRIGGER IF EXISTS attendance_raw_event_append_only_v1 ON attendance_raw_event;
CREATE TRIGGER attendance_raw_event_append_only_v1
BEFORE UPDATE OR DELETE ON attendance_raw_event
FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1();

DROP TRIGGER IF EXISTS attendance_canonical_punch_guard_v1 ON attendance_canonical_punch;
CREATE TRIGGER attendance_canonical_punch_guard_v1
BEFORE UPDATE OR DELETE ON attendance_canonical_punch
FOR EACH ROW EXECUTE FUNCTION attendance_gateway_punch_guard_v1();

DROP TRIGGER IF EXISTS attendance_gateway_audit_append_only_v1 ON attendance_gateway_audit_event;
CREATE TRIGGER attendance_gateway_audit_append_only_v1
BEFORE UPDATE OR DELETE ON attendance_gateway_audit_event
FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1();

CREATE OR REPLACE FUNCTION attendance_gateway_assert_actor_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  capabilities jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR p_required_capability NOT IN (
       'attendance.read','attendance.audit.read','attendance.site.manage',
       'attendance.device.manage','attendance.connector.manage',
       'attendance.identity.manage','attendance.ingest','attendance.review'
     ) THEN
    RAISE EXCEPTION 'ATTENDANCE_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM tenant_iam_assert_no_sod_conflict((p_context->>'membershipId')::uuid);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
    WHERE capability.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'ATTENDANCE_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key), '[]'::jsonb)
    INTO capabilities
  FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
  WHERE capability.capability_key LIKE 'attendance.%';

  RETURN p_context || jsonb_build_object('capabilities', capabilities);
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_assert_session_v1(
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
  source_message text;
BEGIN
  RETURN time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS source_message = MESSAGE_TEXT;
  IF source_message = 'TIME_SOURCE_SESSION_INVALID' THEN
    RAISE EXCEPTION 'ATTENDANCE_SESSION_INVALID' USING ERRCODE = 'P0001';
  ELSIF source_message = 'TIME_SOURCE_RELEASE_NOT_CERTIFIED' THEN
    RAISE EXCEPTION 'ATTENDANCE_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  ELSIF source_message = 'TIME_SOURCE_BINDING_REQUIRED' THEN
    RAISE EXCEPTION 'ATTENDANCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  ELSIF source_message = 'TIME_SOURCE_SESSION_BUSY' THEN
    RAISE EXCEPTION 'ATTENDANCE_SESSION_BUSY' USING ERRCODE = 'P0001';
  END IF;
  RAISE;
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_snapshot_v1(
  p_target_kind text,
  p_target_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  snapshot_value jsonb;
BEGIN
  IF p_target_kind = 'site' THEN
    SELECT jsonb_build_object(
      'id', site.id, 'externalKey', site.external_key, 'label', site.label,
      'addressText', site.address_text,
      'timezone', site.timezone, 'latitude', site.latitude, 'longitude', site.longitude,
      'geofenceRadiusM', site.geofence_radius_m, 'networkEnabled', site.network_enabled,
      'removableMediaEnabled', site.removable_media_enabled,
      'status', site.status, 'version', site.version
    ) INTO snapshot_value
    FROM attendance_marking_site site
    WHERE site.id = p_target_id AND site.tenant_id = p_tenant_id;
  ELSIF p_target_kind = 'device' THEN
    SELECT jsonb_build_object(
      'id', device.id, 'siteId', device.site_id, 'externalKey', device.external_key,
      'vendorKey', device.vendor_key, 'model', device.model,
      'transport', device.transport, 'driverKey', device.driver_key,
      'timezone', device.timezone, 'capabilities', device.capabilities,
      'serialNumber', device.serial_number, 'firmwareVersion', device.firmware_version,
      'protocolKey', device.protocol_key, 'networkHost', host(device.network_host),
      'networkPort', device.network_port,
      'status', device.status, 'version', device.version
    ) INTO snapshot_value
    FROM attendance_device device
    WHERE device.id = p_target_id AND device.tenant_id = p_tenant_id;
  ELSIF p_target_kind = 'connector' THEN
    SELECT jsonb_build_object(
      'id', connector.id, 'deviceId', connector.device_id,
      'externalKey', connector.external_key, 'driverKey', connector.driver_key,
      'tokenVersion', connector.token_version, 'status', connector.status,
      'version', connector.version, 'lastAcceptedAt', connector.last_accepted_at
    ) INTO snapshot_value
    FROM attendance_connector connector
    WHERE connector.id = p_target_id AND connector.tenant_id = p_tenant_id;
  ELSIF p_target_kind = 'identity' THEN
    SELECT jsonb_build_object(
      'id', identity_map.id, 'deviceId', identity_map.device_id,
      'employmentContractId', identity_map.employment_contract_id,
      'identityProjected', false, 'validFrom', identity_map.valid_from,
      'validTo', identity_map.valid_to, 'status', identity_map.status,
      'version', identity_map.version
    ) INTO snapshot_value
    FROM attendance_identity_map identity_map
    WHERE identity_map.id = p_target_id AND identity_map.tenant_id = p_tenant_id;
  ELSIF p_target_kind = 'punch' THEN
    SELECT jsonb_build_object(
      'id', punch.id, 'siteId', punch.site_id, 'deviceId', punch.device_id,
      'employmentContractId', punch.employment_contract_id,
      'occurredAt', punch.occurred_at, 'method', punch.method,
      'direction', punch.direction, 'reconciliationState', punch.reconciliation_state,
      'verificationResult', raw_event.verification_result,
      'reviewState', punch.review_state, 'reviewReasonCode', punch.review_reason_code,
      'version', punch.version
    ) INTO snapshot_value
    FROM attendance_canonical_punch punch
    JOIN attendance_raw_event raw_event
      ON raw_event.id = punch.raw_event_id AND raw_event.tenant_id = punch.tenant_id
    WHERE punch.id = p_target_id AND punch.tenant_id = p_tenant_id;
  ELSIF p_target_kind = 'batch' THEN
    SELECT jsonb_build_object(
      'id', batch.id, 'connectorId', batch.connector_id, 'deviceId', batch.device_id,
      'batchKey', batch.batch_key, 'status', batch.status,
      'eventCount', batch.event_count, 'acceptedCount', batch.accepted_count,
      'duplicateCount', batch.duplicate_count, 'unmappedCount', batch.unmapped_count,
      'ambiguousCount', batch.ambiguous_count, 'receivedAt', batch.received_at
    ) INTO snapshot_value
    FROM attendance_ingest_batch batch
    WHERE batch.id = p_target_id AND batch.tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'ATTENDANCE_TARGET_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN snapshot_value;
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_bootstrap_v1(
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
  site_count bigint;
  device_count bigint;
  connector_count bigint;
  active_connector_count bigint;
  raw_event_count bigint;
  punch_count bigint;
  unmatched_punch_count bigint;
  pending_review_count bigint;
  hardware_connected boolean;
  site_timezones jsonb;
BEGIN
  context_value := attendance_gateway_assert_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := attendance_gateway_assert_actor_v1(context_value, 'attendance.read');

  SELECT count(*) INTO site_count FROM attendance_marking_site
    WHERE tenant_id = p_tenant_id;
  SELECT COALESCE(jsonb_agg(zone.timezone ORDER BY zone.timezone), '[]'::jsonb)
    INTO site_timezones
  FROM (
    SELECT DISTINCT site.timezone
    FROM attendance_marking_site site
    WHERE site.tenant_id = p_tenant_id
  ) zone;
  SELECT count(*) INTO device_count FROM attendance_device
    WHERE tenant_id = p_tenant_id;
  SELECT count(*), count(*) FILTER (WHERE status = 'active')
    INTO connector_count, active_connector_count
  FROM attendance_connector WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO raw_event_count FROM attendance_raw_event
    WHERE tenant_id = p_tenant_id;
  SELECT count(*),
    count(*) FILTER (WHERE reconciliation_state <> 'mapped'),
    count(*) FILTER (WHERE review_state = 'pending')
    INTO punch_count, unmatched_punch_count, pending_review_count
  FROM attendance_canonical_punch WHERE tenant_id = p_tenant_id;
  SELECT EXISTS (
    SELECT 1
    FROM attendance_connector connector
    JOIN attendance_device device
      ON device.id = connector.device_id AND device.tenant_id = connector.tenant_id
    WHERE connector.tenant_id = p_tenant_id
      AND connector.status = 'active' AND device.status = 'active'
      AND connector.last_accepted_at >= now() - interval '15 minutes'
  ) INTO hardware_connected;

  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'roleKey', context_value->>'roleKey'
    ),
    'capabilities', context_value->'capabilities',
    'timezones', site_timezones,
    'summary', jsonb_build_object(
      'siteCount', site_count, 'deviceCount', device_count,
      'connectorCount', connector_count, 'activeConnectorCount', active_connector_count,
      'rawEventCount', raw_event_count, 'punchCount', punch_count,
      'unmatchedPunchCount', unmatched_punch_count,
      'pendingReviewCount', pending_review_count
    ),
    'features', jsonb_build_object(
      'hardwareConnected', hardware_connected,
      'hoursCalculated', false,
      'payrollPosted', false,
      'biometricTemplatesStored', false
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_list_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_resource text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  items_value jsonb := '[]'::jsonb;
  total_value bigint := 0;
  offset_value integer;
BEGIN
  IF p_resource IS NULL OR p_page IS NULL OR p_page_size IS NULL
     OR p_resource NOT IN ('site','device','connector','punch','batch','audit')
     OR p_page NOT BETWEEN 1 AND 1000000 OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'ATTENDANCE_LIST_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := attendance_gateway_assert_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := attendance_gateway_assert_actor_v1(
    context_value,
    CASE WHEN p_resource = 'audit' THEN 'attendance.audit.read' ELSE 'attendance.read' END
  );
  offset_value := (p_page - 1) * p_page_size;

  IF p_resource = 'site' THEN
    SELECT count(*) INTO total_value FROM attendance_marking_site WHERE tenant_id = p_tenant_id;
    SELECT COALESCE(jsonb_agg(row_value.item), '[]'::jsonb) INTO items_value FROM (
      SELECT jsonb_build_object(
        'id', site.id, 'externalKey', site.external_key, 'label', site.label,
        'addressText', site.address_text,
        'timezone', site.timezone, 'latitude', site.latitude, 'longitude', site.longitude,
        'geofenceRadiusM', site.geofence_radius_m, 'networkEnabled', site.network_enabled,
        'removableMediaEnabled', site.removable_media_enabled,
        'status', site.status, 'version', site.version
      ) AS item
      FROM attendance_marking_site site WHERE site.tenant_id = p_tenant_id
      ORDER BY site.label, site.id LIMIT p_page_size OFFSET offset_value
    ) row_value;
  ELSIF p_resource = 'device' THEN
    SELECT count(*) INTO total_value FROM attendance_device WHERE tenant_id = p_tenant_id;
    SELECT COALESCE(jsonb_agg(row_value.item), '[]'::jsonb) INTO items_value FROM (
      SELECT jsonb_build_object(
        'id', device.id, 'siteId', device.site_id, 'externalKey', device.external_key,
        'vendorKey', device.vendor_key, 'model', device.model,
        'transport', device.transport, 'driverKey', device.driver_key,
        'timezone', device.timezone, 'capabilities', device.capabilities,
        'status', device.status, 'version', device.version
      ) || CASE
        WHEN context_value->'capabilities' ? 'attendance.device.manage' THEN
          jsonb_build_object(
            'serialNumber', device.serial_number,
            'firmwareVersion', device.firmware_version,
            'protocolKey', device.protocol_key,
            'networkHost', host(device.network_host),
            'networkPort', device.network_port
          )
        ELSE '{}'::jsonb
      END AS item
      FROM attendance_device device WHERE device.tenant_id = p_tenant_id
      ORDER BY device.external_key, device.id LIMIT p_page_size OFFSET offset_value
    ) row_value;
  ELSIF p_resource = 'connector' THEN
    SELECT count(*) INTO total_value FROM attendance_connector WHERE tenant_id = p_tenant_id;
    SELECT COALESCE(jsonb_agg(row_value.item), '[]'::jsonb) INTO items_value FROM (
      SELECT jsonb_build_object(
        'id', connector.id, 'deviceId', connector.device_id,
        'externalKey', connector.external_key, 'driverKey', connector.driver_key,
        'tokenVersion', connector.token_version, 'status', connector.status,
        'version', connector.version, 'lastAcceptedAt', connector.last_accepted_at
      ) AS item
      FROM attendance_connector connector WHERE connector.tenant_id = p_tenant_id
      ORDER BY connector.external_key, connector.id LIMIT p_page_size OFFSET offset_value
    ) row_value;
  ELSIF p_resource = 'punch' THEN
    SELECT count(*) INTO total_value FROM attendance_canonical_punch WHERE tenant_id = p_tenant_id;
    SELECT COALESCE(jsonb_agg(row_value.item), '[]'::jsonb) INTO items_value FROM (
      SELECT jsonb_build_object(
        'id', punch.id, 'siteId', punch.site_id, 'deviceId', punch.device_id,
        'employmentContractId', punch.employment_contract_id,
        'occurredAt', punch.occurred_at, 'method', punch.method,
        'direction', punch.direction, 'reconciliationState', punch.reconciliation_state,
        'verificationResult', raw_event.verification_result,
        'reviewState', punch.review_state, 'reviewReasonCode', punch.review_reason_code,
        'version', punch.version
      ) AS item
      FROM attendance_canonical_punch punch
      JOIN attendance_raw_event raw_event
        ON raw_event.id = punch.raw_event_id AND raw_event.tenant_id = punch.tenant_id
      WHERE punch.tenant_id = p_tenant_id
      ORDER BY punch.occurred_at DESC, punch.id DESC LIMIT p_page_size OFFSET offset_value
    ) row_value;
  ELSIF p_resource = 'batch' THEN
    SELECT count(*) INTO total_value FROM attendance_ingest_batch WHERE tenant_id = p_tenant_id;
    SELECT COALESCE(jsonb_agg(row_value.item), '[]'::jsonb) INTO items_value FROM (
      SELECT jsonb_build_object(
        'id', batch.id, 'connectorId', batch.connector_id, 'deviceId', batch.device_id,
        'batchKey', batch.batch_key, 'status', batch.status,
        'eventCount', batch.event_count, 'acceptedCount', batch.accepted_count,
        'duplicateCount', batch.duplicate_count, 'unmappedCount', batch.unmapped_count,
        'ambiguousCount', batch.ambiguous_count, 'receivedAt', batch.received_at
      ) AS item
      FROM attendance_ingest_batch batch WHERE batch.tenant_id = p_tenant_id
      ORDER BY batch.received_at DESC, batch.id DESC LIMIT p_page_size OFFSET offset_value
    ) row_value;
  ELSE
    SELECT count(*) INTO total_value FROM attendance_gateway_audit_event
      WHERE tenant_id = p_tenant_id;
    SELECT COALESCE(jsonb_agg(row_value.item), '[]'::jsonb) INTO items_value FROM (
      SELECT jsonb_build_object(
        'id', audit.id, 'targetKind', audit.target_kind, 'targetId', audit.target_id,
        'actorKind', audit.actor_kind, 'actorRole', membership.role_key,
        'command', audit.command, 'occurredAt', audit.occurred_at
      ) AS item
      FROM attendance_gateway_audit_event audit
      LEFT JOIN tenant_membership membership
        ON membership.id = audit.actor_membership_id
       AND membership.tenant_id = audit.tenant_id
      WHERE audit.tenant_id = p_tenant_id
      ORDER BY audit.occurred_at DESC, audit.id DESC LIMIT p_page_size OFFSET offset_value
    ) row_value;
  END IF;

  RETURN jsonb_build_object(
    'resource', p_resource, 'page', p_page, 'pageSize', p_page_size,
    'total', total_value, 'items', items_value
  );
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_command text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  required_capability text;
  existing_event attendance_gateway_audit_event%ROWTYPE;
  site_row attendance_marking_site%ROWTYPE;
  device_row attendance_device%ROWTYPE;
  connector_row attendance_connector%ROWTYPE;
  identity_row attendance_identity_map%ROWTYPE;
  punch_row attendance_canonical_punch%ROWTYPE;
  target_id uuid;
  target_kind text;
  expected_version integer;
  before_value jsonb := '{}'::jsonb;
  after_value jsonb;
  result_value jsonb;
  command_hash_value text;
BEGIN
  IF p_command NOT IN (
      'site.create','site.update','device.create','device.update',
      'connector.create','connector.rotate_token','connector.update',
      'identity.create','identity.revoke','punch.link_identity',
      'punch.accept','punch.reject'
    )
     OR p_idempotency_key IS NULL
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ATTENDANCE_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  required_capability := CASE
    WHEN p_command LIKE 'site.%' THEN 'attendance.site.manage'
    WHEN p_command LIKE 'device.%' THEN 'attendance.device.manage'
    WHEN p_command LIKE 'connector.%' THEN 'attendance.connector.manage'
    WHEN p_command IN ('identity.create','identity.revoke','punch.link_identity')
      THEN 'attendance.identity.manage'
    ELSE 'attendance.review'
  END;

  context_value := attendance_gateway_assert_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  context_value := attendance_gateway_assert_actor_v1(context_value, required_capability);

  -- El digest autoritativo se deriva dentro de PostgreSQL. El hash aportado
  -- por el llamador conserva compatibilidad de firma, pero no gobierna replay.
  command_hash_value := encode(digest(convert_to(jsonb_build_object(
    'tenantId', p_tenant_id,
    'membershipId', p_membership_id,
    'command', p_command,
    'payload', p_payload
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'attendance-command:' || p_tenant_id::text || ':' || p_membership_id::text
      || ':' || p_idempotency_key::text,
    0
  ));
  SELECT * INTO existing_event FROM attendance_gateway_audit_event audit
  WHERE audit.tenant_id = p_tenant_id
    AND audit.actor_kind = 'membership'
    AND audit.actor_membership_id = p_membership_id
    AND audit.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command IS DISTINCT FROM p_command
       OR existing_event.command_hash IS DISTINCT FROM command_hash_value
       OR existing_event.release_sha IS DISTINCT FROM lower(p_release_sha) THEN
      RAISE EXCEPTION 'ATTENDANCE_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_event.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_command = 'site.create' THEN
    IF NOT attendance_gateway_json_keys_allowed_v1(p_payload, ARRAY[
      'externalKey','label','timezone','networkEnabled','removableMediaEnabled'
    ], ARRAY[
      'externalKey','label','timezone','latitude','longitude','geofenceRadiusM',
      'networkEnabled','removableMediaEnabled','addressText'
    ])
       OR jsonb_typeof(p_payload->'externalKey') <> 'string'
       OR jsonb_typeof(p_payload->'label') <> 'string'
       OR jsonb_typeof(p_payload->'timezone') <> 'string'
       OR (p_payload ? 'addressText'
          AND jsonb_typeof(p_payload->'addressText') NOT IN ('string','null'))
       OR jsonb_typeof(p_payload->'networkEnabled') <> 'boolean'
       OR jsonb_typeof(p_payload->'removableMediaEnabled') <> 'boolean'
       OR NOT attendance_gateway_timezone_valid_v1(p_payload->>'timezone') THEN
      RAISE EXCEPTION 'ATTENDANCE_SITE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := gen_random_uuid();
    INSERT INTO attendance_marking_site (
      id, tenant_id, external_key, label, timezone, latitude, longitude,
      address_text, geofence_radius_m, network_enabled, removable_media_enabled,
      created_by_membership_id
    ) VALUES (
      target_id, p_tenant_id, lower(p_payload->>'externalKey'), btrim(p_payload->>'label'),
      p_payload->>'timezone', (p_payload->>'latitude')::numeric,
      (p_payload->>'longitude')::numeric,
      CASE WHEN p_payload->>'addressText' IS NULL THEN NULL
        ELSE btrim(p_payload->>'addressText') END,
      (p_payload->>'geofenceRadiusM')::integer,
      (p_payload->>'networkEnabled')::boolean,
      (p_payload->>'removableMediaEnabled')::boolean, p_membership_id
    );
    target_kind := 'site';

  ELSIF p_command = 'site.update' THEN
    IF NOT attendance_gateway_json_keys_allowed_v1(
      p_payload, ARRAY['id','expectedVersion'], ARRAY[
        'id','expectedVersion','label','timezone','latitude','longitude','geofenceRadiusM',
        'networkEnabled','removableMediaEnabled','status','addressText'
      ]
    ) OR (SELECT count(*) FROM jsonb_object_keys(p_payload)) < 3 THEN
      RAISE EXCEPTION 'ATTENDANCE_SITE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_payload ? 'timezone'
       AND NOT attendance_gateway_timezone_valid_v1(p_payload->>'timezone') THEN
      RAISE EXCEPTION 'ATTENDANCE_SITE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_payload ? 'addressText'
       AND jsonb_typeof(p_payload->'addressText') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'ATTENDANCE_SITE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := (p_payload->>'id')::uuid;
    expected_version := (p_payload->>'expectedVersion')::integer;
    SELECT * INTO site_row FROM attendance_marking_site site
      WHERE site.id = target_id AND site.tenant_id = p_tenant_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_SITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF site_row.version <> expected_version THEN
      RAISE EXCEPTION 'ATTENDANCE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    before_value := attendance_gateway_snapshot_v1('site', target_id, p_tenant_id);
    UPDATE attendance_marking_site SET
      label = CASE WHEN p_payload ? 'label' THEN btrim(p_payload->>'label') ELSE label END,
      address_text = CASE WHEN p_payload ? 'addressText' THEN
        CASE WHEN p_payload->>'addressText' IS NULL THEN NULL
          ELSE btrim(p_payload->>'addressText') END
        ELSE address_text END,
      timezone = CASE WHEN p_payload ? 'timezone' THEN p_payload->>'timezone' ELSE timezone END,
      latitude = CASE WHEN p_payload ? 'latitude' THEN (p_payload->>'latitude')::numeric ELSE latitude END,
      longitude = CASE WHEN p_payload ? 'longitude' THEN (p_payload->>'longitude')::numeric ELSE longitude END,
      geofence_radius_m = CASE WHEN p_payload ? 'geofenceRadiusM'
        THEN (p_payload->>'geofenceRadiusM')::integer ELSE geofence_radius_m END,
      network_enabled = CASE WHEN p_payload ? 'networkEnabled'
        THEN (p_payload->>'networkEnabled')::boolean ELSE network_enabled END,
      removable_media_enabled = CASE WHEN p_payload ? 'removableMediaEnabled'
        THEN (p_payload->>'removableMediaEnabled')::boolean ELSE removable_media_enabled END,
      status = CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE status END,
      version = version + 1, updated_at = now()
    WHERE id = target_id AND tenant_id = p_tenant_id;
    target_kind := 'site';

  ELSIF p_command = 'device.create' THEN
    IF NOT attendance_gateway_json_keys_allowed_v1(p_payload, ARRAY[
      'siteId','externalKey','vendorKey','model','transport','driverKey','timezone','capabilities'
    ], ARRAY[
      'siteId','externalKey','vendorKey','model','transport','driverKey','timezone','capabilities',
      'serialNumber','firmwareVersion','protocolKey','networkHost','networkPort'
    ]) OR NOT attendance_gateway_device_capabilities_valid_v1(p_payload->'capabilities')
       OR NOT attendance_gateway_timezone_valid_v1(p_payload->>'timezone') THEN
      RAISE EXCEPTION 'ATTENDANCE_DEVICE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF lower(p_payload->>'transport') = 'simulator'
       OR lower(p_payload->>'driverKey') = 'simulator' THEN
      RAISE EXCEPTION 'ATTENDANCE_SIMULATOR_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    IF (p_payload ? 'serialNumber'
          AND jsonb_typeof(p_payload->'serialNumber') NOT IN ('string','null'))
       OR (p_payload ? 'firmwareVersion'
          AND jsonb_typeof(p_payload->'firmwareVersion') NOT IN ('string','null'))
       OR (p_payload ? 'protocolKey'
          AND jsonb_typeof(p_payload->'protocolKey') NOT IN ('string','null'))
       OR (p_payload ? 'networkHost'
          AND jsonb_typeof(p_payload->'networkHost') NOT IN ('string','null'))
       OR (p_payload ? 'networkPort'
          AND jsonb_typeof(p_payload->'networkPort') NOT IN ('number','null')) THEN
      RAISE EXCEPTION 'ATTENDANCE_DEVICE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM attendance_marking_site site
      WHERE site.id = (p_payload->>'siteId')::uuid AND site.tenant_id = p_tenant_id
        AND site.status <> 'retired' FOR SHARE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_SITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    target_id := gen_random_uuid();
    INSERT INTO attendance_device (
      id, tenant_id, site_id, external_key, vendor_key, model, transport,
      driver_key, timezone, serial_number, firmware_version, protocol_key,
      network_host, network_port, capabilities, created_by_membership_id
    ) VALUES (
      target_id, p_tenant_id, (p_payload->>'siteId')::uuid,
      lower(p_payload->>'externalKey'), lower(p_payload->>'vendorKey'),
      btrim(p_payload->>'model'), p_payload->>'transport', lower(p_payload->>'driverKey'),
      p_payload->>'timezone',
      CASE WHEN p_payload->>'serialNumber' IS NULL THEN NULL
        ELSE btrim(p_payload->>'serialNumber') END,
      CASE WHEN p_payload->>'firmwareVersion' IS NULL THEN NULL
        ELSE btrim(p_payload->>'firmwareVersion') END,
      CASE WHEN p_payload->>'protocolKey' IS NULL THEN NULL
        ELSE lower(p_payload->>'protocolKey') END,
      (p_payload->>'networkHost')::inet, (p_payload->>'networkPort')::integer,
      p_payload->'capabilities', p_membership_id
    );
    target_kind := 'device';

  ELSIF p_command = 'device.update' THEN
    IF NOT attendance_gateway_json_keys_allowed_v1(
      p_payload, ARRAY['id','expectedVersion'], ARRAY[
        'id','expectedVersion','siteId','vendorKey','model','transport','driverKey',
        'timezone','capabilities','status','serialNumber','firmwareVersion',
        'protocolKey','networkHost','networkPort'
      ]
    ) OR (SELECT count(*) FROM jsonb_object_keys(p_payload)) < 3 THEN
      RAISE EXCEPTION 'ATTENDANCE_DEVICE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF (p_payload ? 'transport' AND lower(p_payload->>'transport') = 'simulator')
       OR (p_payload ? 'driverKey' AND lower(p_payload->>'driverKey') = 'simulator') THEN
      RAISE EXCEPTION 'ATTENDANCE_SIMULATOR_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    IF p_payload ? 'capabilities'
       AND NOT attendance_gateway_device_capabilities_valid_v1(p_payload->'capabilities') THEN
      RAISE EXCEPTION 'ATTENDANCE_DEVICE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_payload ? 'timezone'
       AND NOT attendance_gateway_timezone_valid_v1(p_payload->>'timezone') THEN
      RAISE EXCEPTION 'ATTENDANCE_DEVICE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF (p_payload ? 'serialNumber'
          AND jsonb_typeof(p_payload->'serialNumber') NOT IN ('string','null'))
       OR (p_payload ? 'firmwareVersion'
          AND jsonb_typeof(p_payload->'firmwareVersion') NOT IN ('string','null'))
       OR (p_payload ? 'protocolKey'
          AND jsonb_typeof(p_payload->'protocolKey') NOT IN ('string','null'))
       OR (p_payload ? 'networkHost'
          AND jsonb_typeof(p_payload->'networkHost') NOT IN ('string','null'))
       OR (p_payload ? 'networkPort'
          AND jsonb_typeof(p_payload->'networkPort') NOT IN ('number','null')) THEN
      RAISE EXCEPTION 'ATTENDANCE_DEVICE_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := (p_payload->>'id')::uuid;
    expected_version := (p_payload->>'expectedVersion')::integer;
    SELECT * INTO device_row FROM attendance_device device
      WHERE device.id = target_id AND device.tenant_id = p_tenant_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF device_row.version <> expected_version THEN
      RAISE EXCEPTION 'ATTENDANCE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF p_payload ? 'siteId' THEN
      PERFORM 1 FROM attendance_marking_site site
        WHERE site.id = (p_payload->>'siteId')::uuid AND site.tenant_id = p_tenant_id
          AND site.status <> 'retired' FOR SHARE NOWAIT;
      IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_SITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    END IF;
    before_value := attendance_gateway_snapshot_v1('device', target_id, p_tenant_id);
    UPDATE attendance_device SET
      site_id = CASE WHEN p_payload ? 'siteId' THEN (p_payload->>'siteId')::uuid ELSE site_id END,
      vendor_key = CASE WHEN p_payload ? 'vendorKey' THEN lower(p_payload->>'vendorKey') ELSE vendor_key END,
      model = CASE WHEN p_payload ? 'model' THEN btrim(p_payload->>'model') ELSE model END,
      transport = CASE WHEN p_payload ? 'transport' THEN p_payload->>'transport' ELSE transport END,
      driver_key = CASE WHEN p_payload ? 'driverKey' THEN lower(p_payload->>'driverKey') ELSE driver_key END,
      timezone = CASE WHEN p_payload ? 'timezone' THEN p_payload->>'timezone' ELSE timezone END,
      serial_number = CASE WHEN p_payload ? 'serialNumber' THEN
        CASE WHEN p_payload->>'serialNumber' IS NULL THEN NULL
          ELSE btrim(p_payload->>'serialNumber') END ELSE serial_number END,
      firmware_version = CASE WHEN p_payload ? 'firmwareVersion' THEN
        CASE WHEN p_payload->>'firmwareVersion' IS NULL THEN NULL
          ELSE btrim(p_payload->>'firmwareVersion') END ELSE firmware_version END,
      protocol_key = CASE WHEN p_payload ? 'protocolKey' THEN
        CASE WHEN p_payload->>'protocolKey' IS NULL THEN NULL
          ELSE lower(p_payload->>'protocolKey') END ELSE protocol_key END,
      network_host = CASE WHEN p_payload ? 'networkHost'
        THEN (p_payload->>'networkHost')::inet ELSE network_host END,
      network_port = CASE WHEN p_payload ? 'networkPort'
        THEN (p_payload->>'networkPort')::integer ELSE network_port END,
      capabilities = CASE WHEN p_payload ? 'capabilities' THEN p_payload->'capabilities' ELSE capabilities END,
      status = CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE status END,
      version = version + 1, updated_at = now()
    WHERE id = target_id AND tenant_id = p_tenant_id;
    target_kind := 'device';

  ELSIF p_command = 'connector.create' THEN
    IF NOT attendance_gateway_json_keys_exact_v1(
      p_payload, ARRAY['deviceId','externalKey','driverKey','tokenSha256']
    ) OR lower(p_payload->>'tokenSha256') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF lower(p_payload->>'driverKey') = 'simulator' THEN
      RAISE EXCEPTION 'ATTENDANCE_SIMULATOR_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO device_row FROM attendance_device device
      WHERE device.id = (p_payload->>'deviceId')::uuid AND device.tenant_id = p_tenant_id
        AND device.status <> 'retired' FOR SHARE NOWAIT;
    IF NOT FOUND OR device_row.driver_key <> lower(p_payload->>'driverKey') THEN
      RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_DEVICE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := gen_random_uuid();
    INSERT INTO attendance_connector (
      id, tenant_id, device_id, external_key, driver_key, token_sha256,
      created_by_membership_id
    ) VALUES (
      target_id, p_tenant_id, device_row.id, lower(p_payload->>'externalKey'),
      lower(p_payload->>'driverKey'), lower(p_payload->>'tokenSha256'), p_membership_id
    );
    target_kind := 'connector';

  ELSIF p_command IN ('connector.rotate_token','connector.update') THEN
    IF (p_command = 'connector.rotate_token' AND NOT attendance_gateway_json_keys_exact_v1(
        p_payload, ARRAY['id','expectedVersion','tokenSha256']
      )) OR (p_command = 'connector.update' AND NOT attendance_gateway_json_keys_exact_v1(
        p_payload, ARRAY['id','expectedVersion','status']
      )) THEN
      RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := (p_payload->>'id')::uuid;
    expected_version := (p_payload->>'expectedVersion')::integer;
    SELECT * INTO connector_row FROM attendance_connector connector
      WHERE connector.id = target_id AND connector.tenant_id = p_tenant_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF connector_row.version <> expected_version THEN
      RAISE EXCEPTION 'ATTENDANCE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    before_value := attendance_gateway_snapshot_v1('connector', target_id, p_tenant_id);
    IF p_command = 'connector.rotate_token' THEN
      IF lower(p_payload->>'tokenSha256') !~ '^[a-f0-9]{64}$'
         OR lower(p_payload->>'tokenSha256') = connector_row.token_sha256 THEN
        RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_TOKEN_INVALID' USING ERRCODE = 'P0001';
      END IF;
      UPDATE attendance_connector SET token_sha256 = lower(p_payload->>'tokenSha256'),
        token_version = token_version + 1, version = version + 1,
        rotated_at = now(), updated_at = now()
      WHERE id = target_id AND tenant_id = p_tenant_id;
    ELSE
      UPDATE attendance_connector SET status = p_payload->>'status',
        version = version + 1, updated_at = now()
      WHERE id = target_id AND tenant_id = p_tenant_id;
    END IF;
    target_kind := 'connector';

  ELSIF p_command = 'identity.create' THEN
    IF NOT attendance_gateway_json_keys_exact_v1(p_payload, ARRAY[
      'deviceId','identityHmacSha256','employmentContractId','validFrom','validTo'
    ]) OR lower(p_payload->>'identityHmacSha256') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'ATTENDANCE_IDENTITY_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM attendance_device device
      WHERE device.id = (p_payload->>'deviceId')::uuid AND device.tenant_id = p_tenant_id
        AND device.status <> 'retired' FOR SHARE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    PERFORM 1
    FROM employment_contract contract
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = context_value->>'sourceDatabase'
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE contract.id = (p_payload->>'employmentContractId')::uuid
      AND contract.source_system = 'GRH'
      AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
      AND contract.status IN ('active','inactive')
    FOR SHARE OF contract, batch NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATTENDANCE_IDENTITY_CONTRACT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := gen_random_uuid();
    INSERT INTO attendance_identity_map (
      id, tenant_id, device_id, identity_hmac_sha256, employment_contract_id,
      valid_from, valid_to, created_by_membership_id
    ) VALUES (
      target_id, p_tenant_id, (p_payload->>'deviceId')::uuid,
      lower(p_payload->>'identityHmacSha256'), (p_payload->>'employmentContractId')::uuid,
      (p_payload->>'validFrom')::date, (p_payload->>'validTo')::date, p_membership_id
    );
    target_kind := 'identity';

  ELSIF p_command = 'identity.revoke' THEN
    IF NOT attendance_gateway_json_keys_exact_v1(p_payload, ARRAY['id','expectedVersion']) THEN
      RAISE EXCEPTION 'ATTENDANCE_IDENTITY_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := (p_payload->>'id')::uuid;
    expected_version := (p_payload->>'expectedVersion')::integer;
    SELECT * INTO identity_row FROM attendance_identity_map identity_map
      WHERE identity_map.id = target_id AND identity_map.tenant_id = p_tenant_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_IDENTITY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF identity_row.version <> expected_version OR identity_row.status <> 'active' THEN
      RAISE EXCEPTION 'ATTENDANCE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    before_value := attendance_gateway_snapshot_v1('identity', target_id, p_tenant_id);
    UPDATE attendance_identity_map SET status = 'revoked', revoked_at = now(),
      version = version + 1, updated_at = now()
    WHERE id = target_id AND tenant_id = p_tenant_id;
    target_kind := 'identity';

  ELSE
    IF p_command = 'punch.link_identity' AND NOT attendance_gateway_json_keys_exact_v1(
        p_payload, ARRAY['id','expectedVersion','identityMapId']
      ) THEN
      RAISE EXCEPTION 'ATTENDANCE_PUNCH_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    ELSIF p_command IN ('punch.accept','punch.reject')
       AND NOT attendance_gateway_json_keys_exact_v1(
         p_payload, ARRAY['id','expectedVersion','reasonCode']
       ) THEN
      RAISE EXCEPTION 'ATTENDANCE_PUNCH_PAYLOAD_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_id := (p_payload->>'id')::uuid;
    expected_version := (p_payload->>'expectedVersion')::integer;
    SELECT * INTO punch_row FROM attendance_canonical_punch punch
      WHERE punch.id = target_id AND punch.tenant_id = p_tenant_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_PUNCH_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF punch_row.version <> expected_version THEN
      RAISE EXCEPTION 'ATTENDANCE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF punch_row.review_state <> 'pending'
       OR (p_command = 'punch.link_identity'
         AND punch_row.reconciliation_state NOT IN ('unmapped','ambiguous')) THEN
      RAISE EXCEPTION 'ATTENDANCE_PUNCH_STATE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    before_value := attendance_gateway_snapshot_v1('punch', target_id, p_tenant_id);
    IF p_command = 'punch.link_identity' THEN
      SELECT identity_map.* INTO identity_row
      FROM attendance_identity_map identity_map
      JOIN attendance_device device
        ON device.id = identity_map.device_id
       AND device.tenant_id = identity_map.tenant_id
      JOIN attendance_marking_site site
        ON site.id = device.site_id
       AND site.tenant_id = device.tenant_id
      JOIN employment_contract contract
        ON contract.id = identity_map.employment_contract_id
       AND contract.source_system = 'GRH'
       AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
       AND contract.status IN ('active','inactive')
      JOIN source_import_batch batch
        ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.source_database = context_value->>'sourceDatabase'
       AND batch.validation_state = 'published'
       AND batch.legacy_import_run_id IS NOT NULL
      WHERE identity_map.id = (p_payload->>'identityMapId')::uuid
        AND identity_map.tenant_id = p_tenant_id
        AND identity_map.device_id = punch_row.device_id
        AND identity_map.status = 'active'
        AND identity_map.valid_from <=
          (punch_row.occurred_at AT TIME ZONE site.timezone)::date
        AND (identity_map.valid_to IS NULL OR identity_map.valid_to >=
          (punch_row.occurred_at AT TIME ZONE site.timezone)::date)
      FOR SHARE OF identity_map, device, site, contract, batch NOWAIT;
      IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_IDENTITY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
      UPDATE attendance_canonical_punch SET identity_map_id = identity_row.id,
        employment_contract_id = identity_row.employment_contract_id,
        reconciliation_state = 'mapped', review_state = 'pending',
        version = version + 1, updated_at = now()
      WHERE id = target_id AND tenant_id = p_tenant_id;
    ELSE
      IF length(btrim(COALESCE(p_payload->>'reasonCode',''))) NOT BETWEEN 3 AND 64
         OR p_payload->>'reasonCode' !~ '^[a-z][a-z0-9_]{2,63}$' THEN
        RAISE EXCEPTION 'ATTENDANCE_REVIEW_REASON_INVALID' USING ERRCODE = 'P0001';
      END IF;
      IF punch_row.identity_map_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM attendance_identity_map identity_map
        WHERE identity_map.id = punch_row.identity_map_id
          AND identity_map.created_by_membership_id = p_membership_id
      ) THEN
        RAISE EXCEPTION 'ATTENDANCE_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
      END IF;
      IF p_command = 'punch.accept' AND punch_row.reconciliation_state <> 'mapped' THEN
        RAISE EXCEPTION 'ATTENDANCE_PUNCH_MAPPING_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      IF p_command = 'punch.accept' AND EXISTS (
        SELECT 1 FROM attendance_raw_event raw_event
        WHERE raw_event.id = punch_row.raw_event_id
          AND raw_event.tenant_id = punch_row.tenant_id
          AND raw_event.verification_result = 'rejected'
      ) THEN
        RAISE EXCEPTION 'ATTENDANCE_SOURCE_VERIFICATION_REJECTED' USING ERRCODE = 'P0001';
      END IF;
      UPDATE attendance_canonical_punch SET
        review_state = CASE WHEN p_command = 'punch.accept' THEN 'accepted' ELSE 'rejected' END,
        review_reason_code = p_payload->>'reasonCode',
        reviewed_by_membership_id = p_membership_id, reviewed_at = now(),
        version = version + 1, updated_at = now()
      WHERE id = target_id AND tenant_id = p_tenant_id;
    END IF;
    target_kind := 'punch';
  END IF;

  after_value := attendance_gateway_snapshot_v1(target_kind, target_id, p_tenant_id);
  IF after_value IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_TARGET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  result_value := jsonb_build_object(
    'targetKind', target_kind, 'id', target_id,
    'status', COALESCE(after_value->>'status', after_value->>'reviewState', 'configured'),
    'version', (after_value->>'version')::integer, 'replayed', false
  );
  INSERT INTO attendance_gateway_audit_event (
    tenant_id, target_kind, target_id, actor_kind, actor_membership_id,
    actor_session_id, actor_session_version, release_sha, command,
    idempotency_key, command_hash, before_snapshot, after_snapshot, result
  ) VALUES (
    p_tenant_id, target_kind, target_id, 'membership', p_membership_id,
    p_actor_session_id, p_actor_session_version, lower(p_release_sha), p_command,
    p_idempotency_key, command_hash_value, before_value, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'ATTENDANCE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1(
  p_connector_external_key text,
  p_token_sha256 text,
  p_batch_key text,
  p_payload_sha256 text,
  p_events jsonb,
  p_release_sha text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  connector_row attendance_connector%ROWTYPE;
  device_row attendance_device%ROWTYPE;
  site_row attendance_marking_site%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
  existing_batch attendance_ingest_batch%ROWTYPE;
  event_value jsonb;
  batch_id_value uuid;
  raw_id_value uuid;
  punch_id_value uuid;
  event_count_value integer;
  accepted_count_value integer := 0;
  duplicate_count_value integer := 0;
  unmapped_count_value integer := 0;
  ambiguous_count_value integer := 0;
  identity_count integer;
  identity_id_value uuid;
  contract_id_value uuid;
  reconciliation_value text;
  review_value text;
  result_value jsonb;
  after_value jsonb;
  payload_hash_value text;
BEGIN
  IF lower(btrim(COALESCE(p_connector_external_key,'')))
       !~ '^[a-z0-9][a-z0-9._-]{7,127}$'
     OR lower(COALESCE(p_token_sha256,'')) !~ '^[a-f0-9]{64}$'
     OR length(btrim(COALESCE(p_batch_key,''))) NOT BETWEEN 1 AND 160
     OR lower(COALESCE(p_payload_sha256,'')) !~ '^[a-f0-9]{64}$'
     OR lower(COALESCE(p_release_sha,'')) !~ '^[a-f0-9]{40}$'
     OR NOT attendance_gateway_json_keys_exact_v1(p_events, ARRAY[
       'tenantId','driverKey','transport','deviceExternalKey',
       'siteExternalKey','timezone','events'
     ])
     OR jsonb_typeof(p_events->'tenantId') <> 'string'
     OR jsonb_typeof(p_events->'driverKey') <> 'string'
     OR jsonb_typeof(p_events->'transport') <> 'string'
     OR jsonb_typeof(p_events->'deviceExternalKey') <> 'string'
     OR jsonb_typeof(p_events->'siteExternalKey') <> 'string'
     OR jsonb_typeof(p_events->'timezone') <> 'string'
     OR jsonb_typeof(p_events->'events') <> 'array'
     OR p_events->>'transport' NOT IN ('pull','push')
     OR NOT attendance_gateway_timezone_valid_v1(p_events->>'timezone')
     OR jsonb_array_length(p_events->'events') NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'ATTENDANCE_INGEST_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Igual que en comandos humanos, el digest que gobierna idempotencia se
  -- deriva en el limite confiable de PostgreSQL y no del valor declarado.
  payload_hash_value := encode(digest(
    convert_to(p_events::text, 'UTF8'), 'sha256'
  ), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'attendance-ingest:' || lower(btrim(p_connector_external_key)), 0
  ));
  SELECT * INTO connector_row FROM attendance_connector connector
  WHERE connector.external_key = lower(btrim(p_connector_external_key))
  FOR UPDATE NOWAIT;
  IF NOT FOUND OR connector_row.status <> 'active'
     OR connector_row.token_sha256 <> lower(p_token_sha256) THEN
    RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_AUTH_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO device_row FROM attendance_device device
  WHERE device.id = connector_row.device_id
    AND device.tenant_id = connector_row.tenant_id
  FOR SHARE NOWAIT;
  IF NOT FOUND OR device_row.status <> 'active' THEN
    RAISE EXCEPTION 'ATTENDANCE_DEVICE_INACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF device_row.transport = 'simulator'
     OR device_row.driver_key = 'simulator'
     OR connector_row.driver_key = 'simulator'
     OR lower(p_events->>'driverKey') = 'simulator' THEN
    RAISE EXCEPTION 'ATTENDANCE_SIMULATOR_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO site_row FROM attendance_marking_site site
  WHERE site.id = device_row.site_id AND site.tenant_id = device_row.tenant_id
  FOR SHARE NOWAIT;
  IF NOT FOUND OR site_row.status <> 'active' THEN
    RAISE EXCEPTION 'ATTENDANCE_SITE_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF (p_events->>'tenantId')::uuid IS DISTINCT FROM connector_row.tenant_id
     OR lower(p_events->>'driverKey') IS DISTINCT FROM connector_row.driver_key
     OR lower(p_events->>'driverKey') IS DISTINCT FROM device_row.driver_key
     OR NOT (CASE p_events->>'transport'
       WHEN 'pull' THEN device_row.transport IN (
         'network_pull','removable_media','hybrid'
       )
       WHEN 'push' THEN device_row.transport IN (
         'network_push','hybrid'
       )
       ELSE false
     END)
     OR lower(p_events->>'deviceExternalKey') IS DISTINCT FROM device_row.external_key
     OR lower(p_events->>'siteExternalKey') IS DISTINCT FROM site_row.external_key
     OR p_events->>'timezone' IS DISTINCT FROM device_row.timezone
     OR p_events->>'timezone' IS DISTINCT FROM site_row.timezone THEN
    RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_CONTEXT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT binding.* INTO binding_row
    FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    WHERE policy.tenant_id = connector_row.tenant_id
      AND policy.tenant_data_plane_ready IS TRUE
      AND lower(policy.certified_release_sha) = lower(p_release_sha)
  FOR SHARE OF policy, binding NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTENDANCE_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO existing_batch FROM attendance_ingest_batch batch
  WHERE batch.connector_id = connector_row.id AND batch.batch_key = btrim(p_batch_key);
  IF FOUND THEN
    IF existing_batch.payload_sha256 <> payload_hash_value
       OR existing_batch.release_sha <> lower(p_release_sha)
       OR existing_batch.event_count <> jsonb_array_length(p_events->'events') THEN
      RAISE EXCEPTION 'ATTENDANCE_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'batchId', existing_batch.id, 'status', existing_batch.status,
      'acceptedCount', existing_batch.accepted_count,
      'duplicateCount', existing_batch.duplicate_count,
      'unmappedCount', existing_batch.unmapped_count,
      'ambiguousCount', existing_batch.ambiguous_count,
      'replayed', true
    );
  END IF;

  event_count_value := jsonb_array_length(p_events->'events');
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_events->'events') AS item(event)
    WHERE NOT attendance_gateway_event_valid_v1(event)
  ) THEN
    RAISE EXCEPTION 'ATTENDANCE_EVENT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT event->>'eventKey')
      FROM jsonb_array_elements(p_events->'events') AS item(event))
       <> event_count_value
     OR (SELECT count(DISTINCT lower(event->>'eventSha256'))
         FROM jsonb_array_elements(p_events->'events') AS item(event)) <> event_count_value THEN
    RAISE EXCEPTION 'ATTENDANCE_EVENT_DUPLICATED_IN_BATCH' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_events->'events') AS item(event)
    JOIN attendance_raw_event existing
      ON existing.device_id = device_row.id
     AND (existing.event_key = event->>'eventKey'
       OR existing.event_sha256 = lower(event->>'eventSha256'))
    WHERE existing.event_key IS DISTINCT FROM event->>'eventKey'
       OR existing.event_sha256 IS DISTINCT FROM lower(event->>'eventSha256')
       OR existing.identity_hmac_sha256 IS DISTINCT FROM lower(event->>'identityHmacSha256')
       OR existing.occurred_at IS DISTINCT FROM (event->>'occurredAt')::timestamptz
       OR existing.method IS DISTINCT FROM event->>'method'
       OR existing.direction IS DISTINCT FROM event->>'direction'
       OR existing.verification_result IS DISTINCT FROM event->>'verificationResult'
  ) THEN
    RAISE EXCEPTION 'ATTENDANCE_EVENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO duplicate_count_value
  FROM jsonb_array_elements(p_events->'events') AS item(event)
  WHERE EXISTS (
    SELECT 1 FROM attendance_raw_event existing
    WHERE existing.device_id = device_row.id
      AND existing.event_key = event->>'eventKey'
      AND existing.event_sha256 = lower(event->>'eventSha256')
  );
  accepted_count_value := event_count_value - duplicate_count_value;

  FOR event_value IN
    SELECT item.event FROM jsonb_array_elements(p_events->'events') AS item(event)
  LOOP
    IF EXISTS (
      SELECT 1 FROM attendance_raw_event existing
      WHERE existing.device_id = device_row.id
        AND existing.event_key = event_value->>'eventKey'
        AND existing.event_sha256 = lower(event_value->>'eventSha256')
    ) THEN
      CONTINUE;
    END IF;
    SELECT count(*),
      (array_agg(identity_map.id ORDER BY identity_map.id))[1],
      (array_agg(identity_map.employment_contract_id ORDER BY identity_map.id))[1]
      INTO identity_count, identity_id_value, contract_id_value
    FROM attendance_identity_map identity_map
    JOIN employment_contract contract
      ON contract.id = identity_map.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding_row.source_company_id
     AND contract.status IN ('active','inactive')
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding_row.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE identity_map.tenant_id = connector_row.tenant_id
      AND identity_map.device_id = device_row.id
      AND identity_map.identity_hmac_sha256 = lower(event_value->>'identityHmacSha256')
      AND identity_map.status = 'active'
      AND identity_map.valid_from <=
        ((event_value->>'occurredAt')::timestamptz AT TIME ZONE site_row.timezone)::date
      AND (identity_map.valid_to IS NULL OR identity_map.valid_to >=
        ((event_value->>'occurredAt')::timestamptz AT TIME ZONE site_row.timezone)::date);
    IF identity_count = 0 THEN
      unmapped_count_value := unmapped_count_value + 1;
    ELSIF identity_count > 1 THEN
      ambiguous_count_value := ambiguous_count_value + 1;
    END IF;
  END LOOP;

  batch_id_value := gen_random_uuid();
  INSERT INTO attendance_ingest_batch (
    id, tenant_id, connector_id, device_id, batch_key, payload_sha256,
    release_sha, status, event_count, accepted_count, duplicate_count,
    unmapped_count, ambiguous_count
  ) VALUES (
    batch_id_value, connector_row.tenant_id, connector_row.id, device_row.id,
    btrim(p_batch_key), payload_hash_value, lower(p_release_sha), 'accepted',
    event_count_value, accepted_count_value, duplicate_count_value,
    unmapped_count_value, ambiguous_count_value
  );

  FOR event_value IN
    SELECT item.event FROM jsonb_array_elements(p_events->'events') AS item(event)
  LOOP
    PERFORM 1 FROM attendance_raw_event existing
    WHERE existing.device_id = device_row.id
      AND existing.event_key = event_value->>'eventKey'
      AND existing.event_sha256 = lower(event_value->>'eventSha256');
    IF FOUND THEN CONTINUE; END IF;

    SELECT count(*),
      (array_agg(identity_map.id ORDER BY identity_map.id))[1],
      (array_agg(identity_map.employment_contract_id ORDER BY identity_map.id))[1]
      INTO identity_count, identity_id_value, contract_id_value
    FROM attendance_identity_map identity_map
    JOIN employment_contract contract
      ON contract.id = identity_map.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding_row.source_company_id
     AND contract.status IN ('active','inactive')
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding_row.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE identity_map.tenant_id = connector_row.tenant_id
      AND identity_map.device_id = device_row.id
      AND identity_map.identity_hmac_sha256 = lower(event_value->>'identityHmacSha256')
      AND identity_map.status = 'active'
      AND identity_map.valid_from <=
        ((event_value->>'occurredAt')::timestamptz AT TIME ZONE site_row.timezone)::date
      AND (identity_map.valid_to IS NULL OR identity_map.valid_to >=
        ((event_value->>'occurredAt')::timestamptz AT TIME ZONE site_row.timezone)::date);
    IF identity_count = 1 THEN
      reconciliation_value := 'mapped';
      review_value := CASE
        WHEN event_value->>'verificationResult' = 'accepted' THEN 'recorded'
        ELSE 'pending'
      END;
    ELSIF identity_count = 0 THEN
      reconciliation_value := 'unmapped';
      review_value := 'pending';
      identity_id_value := NULL;
      contract_id_value := NULL;
    ELSE
      reconciliation_value := 'ambiguous';
      review_value := 'pending';
      identity_id_value := NULL;
      contract_id_value := NULL;
    END IF;
    raw_id_value := gen_random_uuid();
    INSERT INTO attendance_raw_event (
      id, tenant_id, batch_id, connector_id, device_id, event_key,
      event_sha256, identity_hmac_sha256, occurred_at, method, direction,
      verification_result
    ) VALUES (
      raw_id_value, connector_row.tenant_id, batch_id_value, connector_row.id,
      device_row.id, event_value->>'eventKey', lower(event_value->>'eventSha256'),
      lower(event_value->>'identityHmacSha256'), (event_value->>'occurredAt')::timestamptz,
      event_value->>'method', event_value->>'direction', event_value->>'verificationResult'
    );
    punch_id_value := gen_random_uuid();
    INSERT INTO attendance_canonical_punch (
      id, tenant_id, raw_event_id, site_id, device_id, identity_map_id,
      employment_contract_id, occurred_at, method, direction,
      reconciliation_state, review_state
    ) VALUES (
      punch_id_value, connector_row.tenant_id, raw_id_value, site_row.id, device_row.id,
      identity_id_value, contract_id_value, (event_value->>'occurredAt')::timestamptz,
      event_value->>'method', event_value->>'direction',
      reconciliation_value, review_value
    );
  END LOOP;

  UPDATE attendance_connector SET last_accepted_at = now()
  WHERE id = connector_row.id AND tenant_id = connector_row.tenant_id;
  after_value := attendance_gateway_snapshot_v1('batch', batch_id_value, connector_row.tenant_id);
  result_value := jsonb_build_object(
    'batchId', batch_id_value, 'status', 'accepted',
    'acceptedCount', accepted_count_value, 'duplicateCount', duplicate_count_value,
    'unmappedCount', unmapped_count_value, 'ambiguousCount', ambiguous_count_value,
    'replayed', false
  );
  INSERT INTO attendance_gateway_audit_event (
    tenant_id, target_kind, target_id, actor_kind, connector_id,
    release_sha, command, idempotency_key, command_hash,
    before_snapshot, after_snapshot, result
  ) VALUES (
    connector_row.tenant_id, 'batch', batch_id_value, 'connector', connector_row.id,
    lower(p_release_sha), 'batch.ingest', batch_id_value, payload_hash_value,
    '{}'::jsonb, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'ATTENDANCE_CONNECTOR_BUSY' USING ERRCODE = 'P0001';
END
$$;

DO $attendance_gateway_role_contract$
DECLARE
  drift_count integer;
  conflict_count integer;
BEGIN
  WITH expected(role_key, capability_key) AS (
    VALUES
      ('CONSULTA_INTEGRAL', 'attendance.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'attendance.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'attendance.audit.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'attendance.review'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.audit.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.site.manage'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.device.manage'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.connector.manage'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.identity.manage'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'attendance.ingest'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.read'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.audit.read'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.site.manage'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.device.manage'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.connector.manage'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.identity.manage'),
      ('JUNIN_ASISTENCIA_OPERADOR', 'attendance.ingest'),
      ('JUNIN_ASISTENCIA_REVISOR', 'attendance.read'),
      ('JUNIN_ASISTENCIA_REVISOR', 'attendance.audit.read'),
      ('JUNIN_ASISTENCIA_REVISOR', 'attendance.review')
  ), actual AS (
    SELECT role_key, capability_key FROM public.iam_role_capability
    WHERE role_key IN (
      'CONSULTA_INTEGRAL','HUGO_APROBADOR_INTEGRAL',
      'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      'JUNIN_ASISTENCIA_OPERADOR','JUNIN_ASISTENCIA_REVISOR'
    ) AND capability_key LIKE 'attendance.%'
  ), drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT count(*) INTO drift_count FROM drift;
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'ATTENDANCE_ROLE_CONTRACT_DRIFT: %', drift_count USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key
  WHERE left_grant.role_key IN (
    'CONSULTA_INTEGRAL','HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
    'JUNIN_ASISTENCIA_OPERADOR','JUNIN_ASISTENCIA_REVISOR'
  );
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'ATTENDANCE_ROLE_SOD_CONFLICT: %', conflict_count USING ERRCODE = 'P0001';
  END IF;
END
$attendance_gateway_role_contract$;

COMMENT ON TABLE attendance_marking_site IS
  'Punto institucional tenant-bound; coordenadas fijas del lugar, nunca seguimiento continuo de empleados.';
COMMENT ON TABLE attendance_device IS
  'Reloj declarado y su contrato tecnico; no contiene credenciales ni plantillas biometricas.';
COMMENT ON TABLE attendance_connector IS
  'Conector machine-to-machine con token SHA-256 rotatable; el secreto plano permanece fuera de PostgreSQL.';
COMMENT ON TABLE attendance_identity_map IS
  'Vinculo temporal entre referencia HMAC de dispositivo y contrato canonico; no almacena identidad cruda ni biometria.';
COMMENT ON TABLE attendance_raw_event IS
  'Hecho de marcacion inmutable y minimizado, previo a cualquier calculo de jornada.';
COMMENT ON TABLE attendance_canonical_punch IS
  'Proyeccion canonica de la marca y su reconciliacion humana; no calcula horas ni nomina.';
COMMENT ON TABLE attendance_gateway_audit_event IS
  'Auditoria append-only de configuracion, ingesta y revision, sin hashes de token ni identidad.';
COMMENT ON FUNCTION attendance_gateway_ingest_v1(text,text,text,text,jsonb,text) IS
  'Ingesta idempotente que valida envelope contra tenant, sitio, dispositivo, driver, transporte y timezone; no calcula asistencia.';

REVOKE ALL PRIVILEGES ON TABLE
  attendance_marking_site,
  attendance_device,
  attendance_connector,
  attendance_identity_map,
  attendance_ingest_batch,
  attendance_raw_event,
  attendance_canonical_punch,
  attendance_gateway_audit_event
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  attendance_marking_site,
  attendance_device,
  attendance_connector,
  attendance_identity_map,
  attendance_ingest_batch,
  attendance_raw_event,
  attendance_canonical_punch,
  attendance_gateway_audit_event
FROM municontrol_actions_runtime_app;
REVOKE CREATE ON SCHEMA public FROM municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION attendance_gateway_json_keys_exact_v1(jsonb,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_json_keys_allowed_v1(jsonb,text[],text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_event_valid_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_device_capabilities_valid_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_timezone_valid_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_reject_change_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_identity_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_punch_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_assert_actor_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_assert_session_v1(
  text,uuid,integer,text,uuid,uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_snapshot_v1(text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_bootstrap_v1(text,uuid,integer,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_list_v1(
  text,uuid,integer,text,uuid,uuid,text,integer,integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,uuid,text,jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION attendance_gateway_ingest_v1(text,text,text,text,jsonb,text) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_json_keys_exact_v1(jsonb,text[])
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_json_keys_allowed_v1(jsonb,text[],text[])
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_event_valid_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_device_capabilities_valid_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_timezone_valid_v1(text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_reject_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_identity_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_punch_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_assert_actor_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_assert_session_v1(
  text,uuid,integer,text,uuid,uuid
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION attendance_gateway_snapshot_v1(text,uuid,uuid)
  FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION attendance_gateway_bootstrap_v1(text,uuid,integer,text,uuid,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION attendance_gateway_list_v1(
  text,uuid,integer,text,uuid,uuid,text,integer,integer
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION attendance_gateway_apply_command_v1(
  text,uuid,integer,text,uuid,uuid,text,uuid,text,jsonb
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION attendance_gateway_ingest_v1(text,text,text,text,jsonb,text)
  TO municontrol_actions_runtime_app;
