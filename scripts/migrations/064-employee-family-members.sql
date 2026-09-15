-- Own, declared child relationships. No writes to GRH, payroll or canonical identities.
-- 057 remains immutable and its v1 functions continue serving existing clients.
CREATE TABLE IF NOT EXISTS employee_family_member (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id), source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES employment_contract(id),
 employee_person_id uuid NOT NULL REFERENCES person_identity(id),
 source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
 contract_identity_token text NOT NULL CHECK(contract_identity_token ~ '^[a-f0-9]{64}$'),
 family_name text NOT NULL CHECK(length(family_name) BETWEEN 1 AND 180 AND family_name=btrim(family_name) AND family_name !~ '[[:cntrl:]<>]'),
 name_key text NOT NULL CHECK(length(name_key) BETWEEN 1 AND 180),
 birth_date date CHECK(birth_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 dni text CHECK(dni ~ '^[0-9]{5,12}$' AND dni !~ '^0+$'),
 valid_from date CHECK(valid_from BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 valid_to date CHECK(valid_to BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 declaration_state text NOT NULL DEFAULT 'declared' CHECK(declaration_state='declared'),
 identity_token text NOT NULL CHECK(identity_token ~ '^[a-f0-9]{64}$'),
 identity_snapshot jsonb NOT NULL CHECK(jsonb_typeof(identity_snapshot)='object'),
 recorded_by_membership_id uuid NOT NULL, recorded_by_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from),
 CHECK(birth_date IS NULL OR (valid_from IS NULL OR valid_from>=birth_date) AND (valid_to IS NULL OR valid_to>=birth_date)),
 UNIQUE(tenant_id,source_binding_id,contract_id,employee_person_id,id),
 UNIQUE(tenant_id,source_binding_id,recorded_by_membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(recorded_by_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_family_member_document_uk
 ON employee_family_member(tenant_id,source_binding_id,contract_id,employee_person_id,dni) WHERE dni IS NOT NULL;
CREATE INDEX IF NOT EXISTS employee_family_member_subject_idx
 ON employee_family_member(tenant_id,source_binding_id,contract_id,employee_person_id,name_key,birth_date);
CREATE TABLE IF NOT EXISTS employee_family_member_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 member_id uuid REFERENCES employee_family_member(id),
 operation text NOT NULL CHECK(operation IN ('context','declare','replay')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['employee_family_member','employee_family_member_event'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=item||'_immutable') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION school_certificate_reject_change_v1()',item||'_immutable',item);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=item||'_no_truncate') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_reject_change_v1()',item||'_no_truncate',item);
  END IF;
 END LOOP;
END $$;

-- Exactly one destination; existing rows remain legacy destinations without updates.
ALTER TABLE school_certificate ADD COLUMN IF NOT EXISTS own_family_id uuid;
ALTER TABLE school_certificate ALTER COLUMN family_id DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='school_certificate'::regclass AND conname='school_certificate_destination_ck') THEN
  ALTER TABLE school_certificate ADD CONSTRAINT school_certificate_destination_ck
   CHECK((family_id IS NOT NULL AND own_family_id IS NULL) OR (family_id IS NULL AND own_family_id IS NOT NULL));
  ALTER TABLE school_certificate ADD CONSTRAINT school_certificate_own_family_fk
   FOREIGN KEY(tenant_id,source_binding_id,contract_id,person_id,own_family_id)
   REFERENCES employee_family_member(tenant_id,source_binding_id,contract_id,employee_person_id,id);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS school_certificate_own_identity_idx
 ON school_certificate(tenant_id,source_binding_id,contract_id,own_family_id,identity_token,recorded_at DESC,id DESC) WHERE own_family_id IS NOT NULL;

CREATE OR REPLACE FUNCTION employee_family_name_key_v1(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT lower(translate(regexp_replace(btrim(normalize(value,NFC)),'[[:space:]]+',' ','g'),'ÁÉÍÓÚÜÑáéíóúü','AEIOUUñaeiouu') COLLATE "C")
$$;
CREATE OR REPLACE FUNCTION employee_family_identity_matches_v1(a_name text,a_birth date,a_dni text,b_name text,b_birth date,b_dni text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce((a_dni ~ '^[0-9]{5,12}$' AND a_dni !~ '^0+$' AND a_dni=b_dni)
  OR (employee_family_name_key_v1(a_name)=employee_family_name_key_v1(b_name)
   AND (a_birth IS NULL OR b_birth IS NULL OR a_birth=b_birth)),false)
$$;

CREATE OR REPLACE FUNCTION employee_family_subject_v1(ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE subject jsonb; snapshot jsonb;
BEGIN
 IF hold_lock THEN
  PERFORM 1 FROM employment_contract c JOIN source_import_batch b ON b.id=c.source_batch_id
   WHERE c.id=target AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
    AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published'
    AND b.legacy_import_run_id IS NOT NULL FOR SHARE OF c,b NOWAIT;
 END IF;
 SELECT jsonb_build_object('contractId',c.id,'personId',c.person_id,'sourceDatabase',b.source_database,
   'companyId',c.legacy_company_id,'legajo',c.legacy_legajo),
  jsonb_build_object('contractId',c.id,'personId',c.person_id,'sourceBatchId',b.id,'legajo',c.legacy_legajo,
   'employeeName',p.full_name,'sourceCutoff',b.source_cutoff)
 INTO snapshot,subject FROM employment_contract c JOIN person_identity p ON p.id=c.person_id
 JOIN source_import_batch b ON b.id=c.source_batch_id
 WHERE c.id=target AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published'
  AND b.legacy_import_run_id IS NOT NULL;
 IF subject IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NOT_FOUND'; END IF;
 RETURN subject||jsonb_build_object('identityToken',encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'));
END $$;

CREATE OR REPLACE FUNCTION employee_family_context_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; subject jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 subject:=employee_family_subject_v1(ctx,p_contract);
 INSERT INTO employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'context');
 RETURN jsonb_build_object('version','employee-family-context.v1','subject',subject-'personId'-'sourceBatchId',
  'canDeclare',action_center_context_has_capability(ctx,'employee.record.propose'));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'EMPLOYEE_FAMILY_%' OR SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION employee_family_declare_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_payload jsonb,p_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; subject jsonb; previous employee_family_member%ROWTYPE; target uuid; new_id uuid:=gen_random_uuid();
 name_value text; dni_value text; birth_value date; from_value date; to_value date; request_hash text; snapshot jsonb; token text;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,true,'family:'||p_key);
 -- Advisory serialization needs a fresh snapshot after a prior declaration commits.
 -- Reject fixed-snapshot callers rather than mutate the canonical employment row.
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_ISOLATION_UNSUPPORTED'; END IF;
 IF p_key IS NULL OR p_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR NOT p_payload ?& ARRAY['contractId','contractIdentityToken','familyName','birthDate','dni','validFrom','validTo']
  OR p_payload-ARRAY['contractId','contractIdentityToken','familyName','birthDate','dni','validFrom','validTo']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(p_payload) e WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
  OR coalesce(p_payload->>'contractId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'contractIdentityToken','') !~ '^[a-f0-9]{64}$'
  OR coalesce(length(p_payload->>'familyName'),0) NOT BETWEEN 1 AND 180
  OR p_payload->>'familyName' ~ '[[:cntrl:]<>]' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_INVALID_PAYLOAD'; END IF;
 name_value:=normalize(regexp_replace(btrim(p_payload->>'familyName'),'[[:space:]]+',' ','g'),NFC);
 IF name_value IS DISTINCT FROM p_payload->>'familyName' OR name_value !~ '[^[:digit:][:space:][:punct:]]' COLLATE "C" THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_INVALID_PAYLOAD'; END IF;
 dni_value:=p_payload->>'dni';
 IF dni_value IS NOT NULL AND (dni_value !~ '^[0-9]{5,12}$' OR dni_value ~ '^0+$') THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DOCUMENT_INVALID'; END IF;
 BEGIN
  IF EXISTS(SELECT 1 FROM jsonb_each_text(p_payload) e WHERE e.key IN ('birthDate','validFrom','validTo') AND e.value IS NOT NULL
   AND (e.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(e.value::date,'YYYY-MM-DD')<>e.value OR e.value::date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31')) THEN RAISE EXCEPTION 'invalid'; END IF;
  birth_value:=(p_payload->>'birthDate')::date; from_value:=(p_payload->>'validFrom')::date; to_value:=(p_payload->>'validTo')::date;
  IF birth_value>(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date OR to_value<from_value
   OR from_value<birth_value OR to_value<birth_value THEN RAISE EXCEPTION 'invalid'; END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DATES_INVALID'; END;
 target:=(p_payload->>'contractId')::uuid;
 -- Serializes all declarations for this subject, including different operators/keys.
 PERFORM pg_advisory_xact_lock(hashtextextended('employee-family:'||p_tenant::text||':'||(ctx->>'sourceBindingId')||':'||target::text,0));
 subject:=employee_family_subject_v1(ctx,target,true);
 IF subject->>'identityToken'<>p_payload->>'contractIdentityToken' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDENTITY_CHANGED'; END IF;
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM employee_family_member m WHERE m.tenant_id=p_tenant AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND m.recorded_by_membership_id=p_membership AND m.idempotency_key=p_key;
 IF FOUND THEN
  IF previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDEMPOTENCY_REUSE'; END IF;
  IF previous.employee_person_id<>(subject->>'personId')::uuid OR previous.contract_identity_token<>subject->>'identityToken' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDENTITY_CHANGED'; END IF;
  INSERT INTO employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,member_id,operation)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,previous.id,'replay');
  RETURN jsonb_build_object('version','employee-family-declare.v1','familyRef',jsonb_build_object('kind','own','id',previous.id),'identityToken',previous.identity_token,'state','declared','recordedAt',previous.recorded_at,'duplicate',true);
 END IF;
 -- Freeze the imported duplicate search, including inserts/refreshes, until commit.
 LOCK TABLE grh_family,grh_catalog_rows IN SHARE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM employee_family_member m WHERE m.tenant_id=p_tenant AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND m.contract_id=target AND m.employee_person_id=(subject->>'personId')::uuid
   AND employee_family_identity_matches_v1(name_value,birth_value,dni_value,m.family_name,m.birth_date,m.dni))
  OR EXISTS(SELECT 1 FROM school_certificate_current_family_v1(ctx,target) f
   WHERE employee_family_identity_matches_v1(name_value,birth_value,dni_value,f.family_name,f.birth_date,normalize_digits(f.identity_snapshot->>'dni'))) THEN
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_DUPLICATE';
 END IF;
 snapshot:=jsonb_build_object('kind','own','id',new_id,'tenantId',p_tenant,'sourceBindingId',ctx->>'sourceBindingId',
  'contractId',target,'personId',subject->>'personId','familyName',name_value,'birthDate',birth_value,'dni',dni_value,'validFrom',from_value,'validTo',to_value);
 token:=encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
 INSERT INTO employee_family_member(id,tenant_id,source_binding_id,contract_id,employee_person_id,source_batch_id,contract_identity_token,
  family_name,name_key,birth_date,dni,valid_from,valid_to,identity_token,identity_snapshot,recorded_by_membership_id,recorded_by_session_id,idempotency_key,request_sha256)
 VALUES(new_id,p_tenant,(ctx->>'sourceBindingId')::uuid,target,(subject->>'personId')::uuid,(subject->>'sourceBatchId')::uuid,subject->>'identityToken',
  name_value,employee_family_name_key_v1(name_value),birth_value,dni_value,from_value,to_value,token,snapshot,p_membership,p_session,p_key,request_hash)
 RETURNING * INTO previous;
 INSERT INTO employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,member_id,operation)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,new_id,'declare');
 RETURN jsonb_build_object('version','employee-family-declare.v1','familyRef',jsonb_build_object('kind','own','id',new_id),'identityToken',token,'state','declared','recordedAt',previous.recorded_at,'duplicate',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
 WHEN unique_violation THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DUPLICATE';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'EMPLOYEE_FAMILY_%' OR SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION school_certificate_current_family_v2(ctx jsonb,target uuid DEFAULT NULL)
RETURNS TABLE(contract_id uuid,person_id uuid,source_batch_id uuid,legajo text,employee_name text,
 family_id text,family_name text,birth_date date,family_end_date date,identity_token text,
 identity_snapshot jsonb,source_cutoff timestamptz,administrative_active boolean,
 family_kind text,valid_from date,recorded_at timestamptz,identity_review_required boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH legacy AS MATERIALIZED (SELECT * FROM school_certificate_current_family_v1(ctx,target)),
 owned AS MATERIALIZED (
  SELECT c.id contract_id,c.person_id,c.source_batch_id,c.legacy_legajo::text legajo,p.full_name::text employee_name,
   m.id::text family_id,m.family_name,m.birth_date,m.valid_to family_end_date,m.identity_token,m.identity_snapshot,b.source_cutoff,
   coalesce(c.status='active' AND s.administrative_status IN ('active','suspended','leave_without_pay','pending_termination'),false) administrative_active,
   m.valid_from,m.recorded_at,m.dni
  FROM employee_family_member m JOIN employment_contract c ON c.id=m.contract_id AND c.person_id=m.employee_person_id
  JOIN person_identity p ON p.id=c.person_id JOIN source_import_batch b ON b.id=c.source_batch_id
  LEFT JOIN LATERAL(SELECT es.administrative_status FROM employment_status_snapshot es WHERE es.employment_contract_id=c.id
   AND es.source_system='GRH' AND es.source_batch_id=c.source_batch_id ORDER BY es.snapshot_date DESC,es.recorded_at DESC LIMIT 1) s ON true
  WHERE m.tenant_id=(ctx->>'tenantId')::uuid AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL
   AND (target IS NULL OR c.id=target)
   AND m.contract_identity_token=encode(digest(convert_to(jsonb_build_object('contractId',c.id,'personId',c.person_id,
    'sourceDatabase',b.source_database,'companyId',c.legacy_company_id,'legajo',c.legacy_legajo)::text,'UTF8'),'sha256'),'hex')
 ), combined AS (
  SELECT f.*,'grh'::text family_kind,NULL::date valid_from,NULL::timestamptz recorded_at,
   EXISTS(SELECT 1 FROM owned o WHERE o.contract_id=f.contract_id AND employee_family_identity_matches_v1(o.family_name,o.birth_date,o.dni,
    f.family_name,f.birth_date,normalize_digits(f.identity_snapshot->>'dni'))) identity_review_required FROM legacy f
  UNION ALL
  SELECT o.contract_id,o.person_id,o.source_batch_id,o.legajo,o.employee_name,o.family_id,o.family_name,o.birth_date,o.family_end_date,
   o.identity_token,o.identity_snapshot,o.source_cutoff,o.administrative_active,'own',o.valid_from,o.recorded_at,
   EXISTS(SELECT 1 FROM legacy f WHERE f.contract_id=o.contract_id AND employee_family_identity_matches_v1(o.family_name,o.birth_date,o.dni,
    f.family_name,f.birth_date,normalize_digits(f.identity_snapshot->>'dni'))) FROM owned o WHERE target IS NOT NULL OR o.administrative_active
 ) SELECT * FROM combined
$$;

CREATE OR REPLACE FUNCTION school_certificate_read_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; rows_json jsonb; row_count integer; review_count integer; cutoff_from timestamptz; cutoff_to timestamptz; can_register boolean; storage jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 storage:=school_certificate_storage_capacity_v1();
 can_register:=action_center_context_has_capability(ctx,'employee.record.propose') AND storage->>'available'='true' AND (storage->>'remainingBytes')::bigint>=10;
 WITH family AS MATERIALIZED(SELECT * FROM school_certificate_current_family_v2(ctx,p_contract_id) LIMIT 5001),
 decorated AS MATERIALIZED(
  SELECT f.*,h.certificate,h.history_count FROM family f LEFT JOIN LATERAL(
   SELECT count(*)::integer history_count,(jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'sha256',d.blob_sha256,'byteLength',b.byte_length,
    'presentedOn',to_char(d.presented_on,'YYYY-MM-DD'),'expiresOn',to_char(d.expires_on,'YYYY-MM-DD'),'recordedAt',d.recorded_at)
    ORDER BY d.recorded_at DESC,d.id DESC))->0 certificate
   FROM school_certificate d JOIN school_certificate_blob b ON b.tenant_id=d.tenant_id AND b.sha256=d.blob_sha256
   WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.contract_id=f.contract_id AND d.person_id=f.person_id
    AND d.identity_token=f.identity_token AND ((f.family_kind='grh' AND d.family_id=f.family_id) OR (f.family_kind='own' AND d.own_family_id::text=f.family_id))
  ) h ON true
 )
 SELECT count(*)::integer,count(*) FILTER(WHERE d.identity_review_required)::integer,min(d.source_cutoff),max(d.source_cutoff),coalesce(jsonb_agg(jsonb_build_object(
  'contractId',d.contract_id,'legajo',d.legajo,'employeeName',d.employee_name,'familyRef',jsonb_build_object('kind',d.family_kind,'id',d.family_id),
  'familyName',d.family_name,'birthDate',to_char(d.birth_date,'YYYY-MM-DD'),'familyEndDate',to_char(d.family_end_date,'YYYY-MM-DD'),
  'validFrom',to_char(d.valid_from,'YYYY-MM-DD'),'familyRecordedAt',d.recorded_at,'declarationState',CASE WHEN d.family_kind='own' THEN 'declared' ELSE 'source' END,
  'identityReviewRequired',d.identity_review_required,'identityToken',d.identity_token,'sourceCutoff',d.source_cutoff,'administrativeActive',d.administrative_active,
  'certificate',d.certificate,'historyCount',d.history_count) ORDER BY length(d.legajo),d.legajo,d.family_kind,d.family_id),'[]'::jsonb)
 INTO row_count,review_count,cutoff_from,cutoff_to,rows_json FROM decorated d;
 IF row_count>5000 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_ROW_LIMIT'; END IF;
 INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'read',row_count);
 RETURN jsonb_build_object('version','family-schooling.v2','rows',rows_json,'canRegister',can_register,
  'storage',jsonb_build_object('mode',storage->>'mode','remainingBytes',(storage->>'remainingBytes')::bigint,'usedBytes',(storage->>'usedBytes')::bigint,'capacityBytes',(storage->>'capacityBytes')::bigint),
  'scope',jsonb_build_object('cohort',CASE WHEN p_contract_id IS NULL THEN 'administrative_active_with_children' ELSE 'contract_children' END,
   'sourceCutoffFrom',cutoff_from,'sourceCutoffTo',cutoff_to,'currentCensusCertified',false,'payrollEligibilityCertified',false,'unresolvedFamilyRows',review_count));
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
 RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION school_certificate_register_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; subject jsonb; member employee_family_member%ROWTYPE; previous school_certificate%ROWTYPE;
 contract_value uuid; member_value uuid; content_value bytea; presented_value date; expires_value date; request_hash text; new_id uuid;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,true,p_idempotency_key);
 IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR NOT p_payload ?& ARRAY['contractId','familyRef','identityToken','filename','contentBase64','sha256','presentedOn','expiresOn']
  OR p_payload-ARRAY['contractId','familyRef','identityToken','filename','contentBase64','sha256','presentedOn','expiresOn']<>'{}'::jsonb
  OR jsonb_typeof(p_payload->'familyRef') IS DISTINCT FROM 'object'
  OR NOT (p_payload->'familyRef') ?& ARRAY['kind','id'] OR (p_payload->'familyRef')-ARRAY['kind','id']<>'{}'::jsonb
  OR jsonb_typeof(p_payload#>'{familyRef,kind}') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload#>'{familyRef,id}') IS DISTINCT FROM 'string'
  OR p_payload#>>'{familyRef,kind}' NOT IN ('grh','own') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 IF p_payload#>>'{familyRef,kind}'='grh' THEN
  RETURN school_certificate_register_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,
   (p_payload-'familyRef')||jsonb_build_object('familyId',p_payload#>>'{familyRef,id}'),p_idempotency_key)
   ||jsonb_build_object('version','family-schooling-register.v2');
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_payload-'familyRef') e WHERE jsonb_typeof(e.value)<>'string' AND NOT(e.key='expiresOn' AND e.value='null'::jsonb))
  OR coalesce(p_payload->>'contractId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR p_payload#>>'{familyRef,id}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'identityToken','') !~ '^[a-f0-9]{64}$' OR coalesce(p_payload->>'sha256','') !~ '^[a-f0-9]{64}$'
  OR length(p_payload->>'filename') NOT BETWEEN 5 AND 180 OR p_payload->>'filename'<>btrim(p_payload->>'filename')
  OR lower(right(p_payload->>'filename',4))<>'.pdf' OR p_payload->>'filename' ~ '[[:cntrl:]/\\:*?"<>|]' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 contract_value:=(p_payload->>'contractId')::uuid; member_value:=(p_payload#>>'{familyRef,id}')::uuid;
 IF length(p_payload->>'contentBase64')>2796204 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_TOO_LARGE'; END IF;
 BEGIN content_value:=decode(p_payload->>'contentBase64','base64');
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END;
 IF octet_length(content_value)>2097152 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_TOO_LARGE'; END IF;
 IF octet_length(content_value)<10 OR substring(content_value FROM 1 FOR 5)<>decode('255044462d','hex')
  OR replace(encode(content_value,'base64'),E'\n','')<>p_payload->>'contentBase64'
  OR encode(digest(content_value,'sha256'),'hex')<>p_payload->>'sha256' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END IF;
 BEGIN
  IF p_payload->>'presentedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR (p_payload->>'expiresOn' IS NOT NULL AND p_payload->>'expiresOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN RAISE EXCEPTION 'invalid'; END IF;
  presented_value:=(p_payload->>'presentedOn')::date; expires_value:=(p_payload->>'expiresOn')::date;
  IF presented_value NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' OR to_char(presented_value,'YYYY-MM-DD')<>p_payload->>'presentedOn'
   OR (expires_value IS NOT NULL AND (expires_value NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' OR to_char(expires_value,'YYYY-MM-DD')<>p_payload->>'expiresOn')) THEN RAISE EXCEPTION 'invalid'; END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_DATES_INVALID'; END;
 subject:=employee_family_subject_v1(ctx,contract_value,true);
 SELECT * INTO member FROM employee_family_member m WHERE m.id=member_value AND m.tenant_id=p_tenant
  AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid AND m.contract_id=contract_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 IF member.employee_person_id<>(subject->>'personId')::uuid OR member.contract_identity_token<>subject->>'identityToken'
  OR member.identity_token<>p_payload->>'identityToken' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM school_certificate d WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.recorded_by_membership_id=p_membership AND d.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE'; END IF;
  INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,certificate_id,operation,result_count)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,previous.id,'replay',1);
  RETURN jsonb_build_object('version','family-schooling-register.v2','certificateId',previous.id,'duplicate',true);
 END IF;
 PERFORM school_certificate_storage_reserve_v1(p_tenant,p_payload->>'sha256',octet_length(content_value));
 INSERT INTO school_certificate_blob(tenant_id,sha256,content,byte_length)
 VALUES(p_tenant,p_payload->>'sha256',content_value,octet_length(content_value)) ON CONFLICT DO NOTHING;
 INSERT INTO school_certificate(tenant_id,source_binding_id,contract_id,person_id,source_batch_id,source_database,company_id,source_legajo,
  family_id,own_family_id,identity_token,identity_snapshot,source_cutoff,filename,blob_sha256,presented_on,expires_on,
  recorded_by_membership_id,recorded_by_session_id,idempotency_key,request_sha256)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,contract_value,member.employee_person_id,(subject->>'sourceBatchId')::uuid,
  ctx->>'sourceDatabase',(ctx->>'sourceCompanyId')::bigint,subject->>'legajo',NULL,member.id,member.identity_token,member.identity_snapshot,
  (subject->>'sourceCutoff')::timestamptz,p_payload->>'filename',p_payload->>'sha256',presented_value,expires_value,
  p_membership,p_session,p_idempotency_key,request_hash) RETURNING id INTO new_id;
 INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,certificate_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,new_id,'register',1);
 RETURN jsonb_build_object('version','family-schooling-register.v2','certificateId',new_id,'duplicate',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_NOT_FOUND' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION school_certificate_download_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_certificate_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; document school_certificate%ROWTYPE; subject jsonb; result_value jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 SELECT * INTO document FROM school_certificate d WHERE d.id=p_certificate_id AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 IF document.own_family_id IS NULL THEN
  RETURN school_certificate_download_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_certificate_id)
   ||jsonb_build_object('version','family-schooling-download.v2');
 END IF;
 subject:=employee_family_subject_v1(ctx,document.contract_id,true);
 SELECT jsonb_build_object('version','family-schooling-download.v2','filename',document.filename,
  'contentBase64',replace(encode(b.content,'base64'),E'\n',''),'sha256',b.sha256,'byteLength',b.byte_length)
 INTO result_value FROM employee_family_member m JOIN school_certificate_blob b ON b.tenant_id=document.tenant_id AND b.sha256=document.blob_sha256
 WHERE m.id=document.own_family_id AND m.tenant_id=p_tenant AND m.source_binding_id=document.source_binding_id
  AND m.contract_id=document.contract_id AND m.employee_person_id=document.person_id AND m.employee_person_id=(subject->>'personId')::uuid
  AND m.contract_identity_token=subject->>'identityToken' AND m.identity_token=document.identity_token;
 IF result_value IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,certificate_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,p_certificate_id,'download',1);
 RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_NOT_FOUND' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

REVOKE ALL ON employee_family_member,employee_family_member_event FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION employee_family_name_key_v1(text),employee_family_identity_matches_v1(text,date,text,text,date,text),
 employee_family_subject_v1(jsonb,uuid,boolean),employee_family_context_v1(text,uuid,integer,text,uuid,uuid,uuid),
 employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text),school_certificate_current_family_v2(jsonb,uuid),
 school_certificate_read_v2(text,uuid,integer,text,uuid,uuid,uuid),school_certificate_register_v2(text,uuid,integer,text,uuid,uuid,jsonb,text),
 school_certificate_download_v2(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION employee_family_context_v1(text,uuid,integer,text,uuid,uuid,uuid),
 employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text),school_certificate_read_v2(text,uuid,integer,text,uuid,uuid,uuid),
 school_certificate_register_v2(text,uuid,integer,text,uuid,uuid,jsonb,text),school_certificate_download_v2(text,uuid,integer,text,uuid,uuid,uuid)
 TO municontrol_actions_runtime_app;
