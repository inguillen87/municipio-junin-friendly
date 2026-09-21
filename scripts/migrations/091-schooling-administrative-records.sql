-- ESC-IA-01: immutable administrative declarations; no payroll approval or GRH write.
-- Additive to 057/064. Existing v1/v2 documents and facades remain unchanged.
CREATE TABLE IF NOT EXISTS school_certificate_record (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, contract_id uuid NOT NULL REFERENCES employment_contract(id),
 person_id uuid NOT NULL REFERENCES person_identity(id), source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
 source_database text NOT NULL, company_id bigint NOT NULL, source_legajo text NOT NULL,
 family_kind text NOT NULL CHECK(family_kind IN ('grh','own')), family_id text NOT NULL,
 identity_token text NOT NULL CHECK(identity_token ~ '^[a-f0-9]{64}$'), identity_snapshot jsonb NOT NULL CHECK(jsonb_typeof(identity_snapshot)='object'),
 source_cutoff timestamptz NOT NULL,
 institution text CHECK(length(institution) BETWEEN 1 AND 180 AND institution=btrim(institution) AND institution !~ '[[:cntrl:]<>]'),
 education_level text CHECK(length(education_level) BETWEEN 1 AND 80 AND education_level=btrim(education_level) AND education_level !~ '[[:cntrl:]<>]'),
 course text CHECK(length(course) BETWEEN 1 AND 100 AND course=btrim(course) AND course !~ '[[:cntrl:]<>]'),
 school_year integer CHECK(school_year BETWEEN 1900 AND 2100),
 issued_on date CHECK(issued_on BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 presented_on date NOT NULL CHECK(presented_on BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 expires_on date CHECK(expires_on BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 evidence_mode text NOT NULL CHECK(evidence_mode IN ('pdf','paper_declared')),
 paper_reference text CHECK(length(paper_reference) BETWEEN 5 AND 500 AND paper_reference=btrim(paper_reference) AND paper_reference !~ '[[:cntrl:]<>]'),
 filename text CHECK(length(filename) BETWEEN 5 AND 180 AND filename=btrim(filename) AND lower(right(filename,4))='.pdf' AND filename !~ '[[:cntrl:]/\\:*?"<>|]'),
 blob_sha256 text,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]<>]'),
 supersedes_id uuid CHECK(supersedes_id<>id), recorded_by text NOT NULL CHECK(length(recorded_by) BETWEEN 3 AND 320 AND recorded_by=btrim(recorded_by) AND position('@' IN recorded_by)>1 AND recorded_by !~ '[[:cntrl:]<>]'),
 recorded_by_membership_id uuid NOT NULL, recorded_by_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,source_binding_id,recorded_by_membership_id,idempotency_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(recorded_by_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,blob_sha256) REFERENCES school_certificate_blob(tenant_id,sha256),
 CHECK((family_kind='grh' AND family_id ~ '^[0-9]{1,20}$') OR (family_kind='own' AND family_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')),
 CHECK((evidence_mode='pdf' AND filename IS NOT NULL AND blob_sha256 IS NOT NULL AND paper_reference IS NULL)
  OR (evidence_mode='paper_declared' AND filename IS NULL AND blob_sha256 IS NULL AND paper_reference IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS school_certificate_record_identity_idx ON school_certificate_record
 (tenant_id,source_binding_id,contract_id,family_kind,family_id,identity_token,recorded_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS school_certificate_record_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id), source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 record_id uuid, operation text NOT NULL CHECK(operation IN ('read','history','register','replay','attempt','download')),
 result_count integer NOT NULL CHECK(result_count BETWEEN 0 AND 5000), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,record_id) REFERENCES school_certificate_record(tenant_id,id)
);
ALTER TABLE school_certificate_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_certificate_record_event ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION school_certificate_record_immutable_v3() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS school_certificate_record_immutable ON school_certificate_record;
CREATE TRIGGER school_certificate_record_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON school_certificate_record FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_record_immutable_v3();
DROP TRIGGER IF EXISTS school_certificate_record_event_immutable ON school_certificate_record_event;
CREATE TRIGGER school_certificate_record_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON school_certificate_record_event FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_record_immutable_v3();

CREATE OR REPLACE FUNCTION school_certificate_date_v3(value text,required boolean DEFAULT false) RETURNS date
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parsed date;
BEGIN
 IF value IS NULL THEN IF required THEN RAISE EXCEPTION 'invalid'; END IF; RETURN NULL; END IF;
 IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid'; END IF;
 parsed:=value::date;
 IF parsed NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' OR to_char(parsed,'YYYY-MM-DD')<>value THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN parsed;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_DATES_INVALID'; END $$;

-- Holding the current source prevents both replacement refreshes and in-place
-- identity edits. Own declarations are immutable; SHARE also prevents a new
-- overlapping declaration from appearing between collision check and write.
CREATE OR REPLACE FUNCTION school_certificate_family_v3(ctx jsonb,target uuid,kind text,family text,token text,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result_value jsonb;
BEGIN
 IF kind IS NULL OR kind NOT IN ('grh','own') OR family IS NULL OR token IS NULL OR token !~ '^[a-f0-9]{64}$' OR target IS NULL
  OR (kind='grh' AND family !~ '^[0-9]{1,20}$')
  OR (kind='own' AND family !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 IF hold_lock THEN
  LOCK TABLE grh_family,grh_catalog_rows,employee_family_member IN SHARE MODE NOWAIT;
  PERFORM employee_family_subject_v1(ctx,target,true);
 END IF;
 SELECT to_jsonb(f) INTO result_value FROM school_certificate_current_family_v2(ctx,target) f WHERE f.family_kind=kind AND f.family_id=family;
 IF result_value IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 IF result_value->>'identity_token'<>token THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
 RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_NOT_FOUND' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

-- One projection for legacy PDFs and new declarations; no backfill/copy of
-- historical records, and no joining by names or merely a recycled family ID.
CREATE OR REPLACE FUNCTION school_certificate_records_v3(ctx jsonb,f jsonb)
RETURNS TABLE(recorded_at timestamptz,id uuid,certificate jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT d.recorded_at,d.id,jsonb_build_object('id',d.id,'filename',d.filename,'sha256',d.blob_sha256,'byteLength',b.byte_length,
  'presentedOn',to_char(d.presented_on,'YYYY-MM-DD'),'expiresOn',to_char(d.expires_on,'YYYY-MM-DD'),'recordedAt',d.recorded_at,
  'recordKind','legacy_pdf','institution',NULL,'educationLevel',NULL,'course',NULL,'schoolYear',NULL,'issuedOn',NULL,
  'evidenceMode','pdf','paperReference',NULL,'reason',NULL,'supersedesId',NULL,'recordedBy',NULL)
 FROM school_certificate d JOIN school_certificate_blob b ON b.tenant_id=d.tenant_id AND b.sha256=d.blob_sha256
 WHERE d.tenant_id=(ctx->>'tenantId')::uuid AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.contract_id=(f->>'contract_id')::uuid AND d.person_id=(f->>'person_id')::uuid AND d.identity_token=f->>'identity_token'
  AND ((f->>'family_kind'='grh' AND d.family_id=f->>'family_id') OR (f->>'family_kind'='own' AND d.own_family_id::text=f->>'family_id'))
 UNION ALL
 SELECT d.recorded_at,d.id,jsonb_build_object('id',d.id,'filename',d.filename,'sha256',d.blob_sha256,'byteLength',b.byte_length,
  'presentedOn',to_char(d.presented_on,'YYYY-MM-DD'),'expiresOn',to_char(d.expires_on,'YYYY-MM-DD'),'recordedAt',d.recorded_at,
  'recordKind','schooling_record','institution',d.institution,'educationLevel',d.education_level,'course',d.course,'schoolYear',d.school_year,
  'issuedOn',to_char(d.issued_on,'YYYY-MM-DD'),'evidenceMode',d.evidence_mode,'paperReference',d.paper_reference,'reason',d.reason,'supersedesId',d.supersedes_id,'recordedBy',d.recorded_by)
 FROM school_certificate_record d LEFT JOIN school_certificate_blob b ON b.tenant_id=d.tenant_id AND b.sha256=d.blob_sha256
 WHERE d.tenant_id=(ctx->>'tenantId')::uuid AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.contract_id=(f->>'contract_id')::uuid AND d.person_id=(f->>'person_id')::uuid AND d.identity_token=f->>'identity_token'
  AND d.family_kind=f->>'family_kind' AND d.family_id=f->>'family_id'
$$;

CREATE OR REPLACE FUNCTION school_certificate_register_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; f jsonb; previous school_certificate_record%ROWTYPE; contract_value uuid; kind_value text; family_value text;
 content_value bytea; issued_value date; presented_value date; expires_value date; request_hash text; latest_id uuid; expected_id uuid; new_id uuid; latest_recorded_at timestamptz;
 history_count integer; field_value text; max_length integer;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,true,p_idempotency_key);
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY'; END IF;
 IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR NOT p_payload ?& ARRAY['contractId','familyRef','identityToken','expectedCertificateId','institution','educationLevel','course','schoolYear','issuedOn','presentedOn','expiresOn','evidenceMode','paperReference','filename','contentBase64','sha256','reason']
  OR p_payload-ARRAY['contractId','familyRef','identityToken','expectedCertificateId','institution','educationLevel','course','schoolYear','issuedOn','presentedOn','expiresOn','evidenceMode','paperReference','filename','contentBase64','sha256','reason']<>'{}'::jsonb
  OR jsonb_typeof(p_payload->'familyRef') IS DISTINCT FROM 'object'
  OR NOT (p_payload->'familyRef') ?& ARRAY['kind','id'] OR (p_payload->'familyRef')-ARRAY['kind','id']<>'{}'::jsonb
  OR jsonb_typeof(p_payload#>'{familyRef,kind}') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload#>'{familyRef,id}') IS DISTINCT FROM 'string'
  OR EXISTS(SELECT 1 FROM jsonb_each(p_payload-ARRAY['familyRef','schoolYear']) e WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
  OR coalesce(p_payload->>'contractId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'identityToken','') !~ '^[a-f0-9]{64}$'
  OR (p_payload->>'expectedCertificateId' IS NOT NULL AND p_payload->>'expectedCertificateId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  OR (p_payload->'schoolYear'<>'null'::jsonb AND (jsonb_typeof(p_payload->'schoolYear')<>'number' OR p_payload->>'schoolYear' !~ '^(19|20)[0-9]{2}$|^2100$'))
  OR coalesce(p_payload->>'evidenceMode','') NOT IN ('pdf','paper_declared') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 FOREACH field_value IN ARRAY ARRAY['institution','educationLevel','course','paperReference','reason'] LOOP
  max_length:=CASE field_value WHEN 'institution' THEN 180 WHEN 'educationLevel' THEN 80 WHEN 'course' THEN 100 ELSE 500 END;
  IF p_payload->>field_value IS NOT NULL AND (length(p_payload->>field_value) NOT BETWEEN CASE WHEN field_value IN ('reason','paperReference') THEN 5 ELSE 1 END AND max_length
   OR p_payload->>field_value<>btrim(p_payload->>field_value) OR p_payload->>field_value<>normalize(p_payload->>field_value,NFC)
   OR p_payload->>field_value ~ '[[:cntrl:]<>]') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 END LOOP;
 IF p_payload->>'reason' IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 issued_value:=school_certificate_date_v3(p_payload->>'issuedOn');
 presented_value:=school_certificate_date_v3(p_payload->>'presentedOn',true);
 expires_value:=school_certificate_date_v3(p_payload->>'expiresOn');
 IF p_payload->>'evidenceMode'='paper_declared' THEN
  IF p_payload->>'paperReference' IS NULL OR p_payload->>'filename' IS NOT NULL OR p_payload->>'contentBase64' IS NOT NULL OR p_payload->>'sha256' IS NOT NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 ELSE
  IF p_payload->>'paperReference' IS NOT NULL OR p_payload->>'filename' IS NULL OR p_payload->>'contentBase64' IS NULL
   OR length(p_payload->>'filename') NOT BETWEEN 5 AND 180 OR p_payload->>'filename'<>btrim(p_payload->>'filename') OR lower(right(p_payload->>'filename',4))<>'.pdf'
   OR p_payload->>'filename' ~ '[[:cntrl:]/\\:*?"<>|]' OR coalesce(p_payload->>'sha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
  IF length(p_payload->>'contentBase64')>2796204 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_TOO_LARGE'; END IF;
  BEGIN content_value:=decode(p_payload->>'contentBase64','base64'); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END;
  IF octet_length(content_value) NOT BETWEEN 10 AND 2097152 OR substring(content_value FROM 1 FOR 5)<>decode('255044462d','hex')
   OR replace(encode(content_value,'base64'),E'\n','')<>p_payload->>'contentBase64'
   OR encode(digest(content_value,'sha256'),'hex')<>p_payload->>'sha256' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END IF;
 END IF;
 contract_value:=(p_payload->>'contractId')::uuid; kind_value:=p_payload#>>'{familyRef,kind}'; family_value:=p_payload#>>'{familyRef,id}';
 IF NOT pg_try_advisory_xact_lock(hashtextextended('school-certificate:record:v3:'||p_tenant||':'||(ctx->>'sourceBindingId')||':'||contract_value||':'||kind_value||':'||family_value||':'||(p_payload->>'identityToken'),0)) THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY'; END IF;
 f:=school_certificate_family_v3(ctx,contract_value,kind_value,family_value,p_payload->>'identityToken',true);
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM school_certificate_record d WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.recorded_by_membership_id=p_membership AND d.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE'; END IF;
  INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,record_id,operation,result_count)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,previous.id,'replay',1);
  RETURN jsonb_build_object('version','family-schooling-register.v3','certificateId',previous.id,'duplicate',true);
 END IF;
 IF (f->>'identity_review_required')::boolean THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_REVIEW_REQUIRED'; END IF;
 -- Legacy writers do not take the v3 advisory lock: serialize their inserts
 -- while selecting the latest record. Never rewrite the legacy facade.
 LOCK TABLE school_certificate IN SHARE MODE NOWAIT;
 SELECT count(*)::integer,(array_agg(r.id ORDER BY r.recorded_at DESC,r.id DESC))[1],max(r.recorded_at) INTO history_count,latest_id,latest_recorded_at FROM school_certificate_records_v3(ctx,f) r;
 expected_id:=(p_payload->>'expectedCertificateId')::uuid;
 IF latest_id IS DISTINCT FROM expected_id THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_REVISION_CONFLICT'; END IF;
 IF history_count>=5000 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_ROW_LIMIT'; END IF;
 IF content_value IS NOT NULL THEN
  PERFORM school_certificate_storage_reserve_v1(p_tenant,p_payload->>'sha256',octet_length(content_value));
  INSERT INTO school_certificate_blob(tenant_id,sha256,content,byte_length) VALUES(p_tenant,p_payload->>'sha256',content_value,octet_length(content_value)) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO school_certificate_record(tenant_id,source_binding_id,contract_id,person_id,source_batch_id,source_database,company_id,source_legajo,
  family_kind,family_id,identity_token,identity_snapshot,source_cutoff,institution,education_level,course,school_year,issued_on,presented_on,expires_on,
  evidence_mode,paper_reference,filename,blob_sha256,reason,supersedes_id,recorded_by,recorded_by_membership_id,recorded_by_session_id,idempotency_key,request_sha256,recorded_at)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,contract_value,(f->>'person_id')::uuid,(f->>'source_batch_id')::uuid,ctx->>'sourceDatabase',(ctx->>'sourceCompanyId')::bigint,f->>'legajo',
  kind_value,family_value,p_payload->>'identityToken',f->'identity_snapshot',(f->>'source_cutoff')::timestamptz,p_payload->>'institution',p_payload->>'educationLevel',p_payload->>'course',
  (p_payload->>'schoolYear')::integer,issued_value,presented_value,expires_value,p_payload->>'evidenceMode',p_payload->>'paperReference',p_payload->>'filename',p_payload->>'sha256',
  p_payload->>'reason',latest_id,lower(btrim(p_email)),p_membership,p_session,p_idempotency_key,request_hash,
  greatest(clock_timestamp(),latest_recorded_at+interval '1 microsecond')) RETURNING id INTO new_id;
 INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,record_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,new_id,'register',1);
 RETURN jsonb_build_object('version','family-schooling-register.v3','certificateId',new_id,'duplicate',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

CREATE OR REPLACE FUNCTION school_certificate_read_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; rows_json jsonb; row_count integer; review_count integer; cutoff_from timestamptz; cutoff_to timestamptz; storage jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 storage:=school_certificate_storage_capacity_v1();
 WITH family AS MATERIALIZED(SELECT * FROM school_certificate_current_family_v2(ctx,p_contract_id) LIMIT 5001),
 decorated AS MATERIALIZED(
  SELECT f.*,h.certificate,h.history_count FROM family f LEFT JOIN LATERAL(
   SELECT count(*)::integer history_count,(jsonb_agg(r.certificate ORDER BY r.recorded_at DESC,r.id DESC))->0 certificate
   FROM school_certificate_records_v3(ctx,to_jsonb(f)) r
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
 INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'read',row_count);
 RETURN jsonb_build_object('version','family-schooling.v3','rows',rows_json,'canRegister',action_center_context_has_capability(ctx,'employee.record.propose'),
  'storage',jsonb_build_object('mode',storage->>'mode','remainingBytes',(storage->>'remainingBytes')::bigint,'usedBytes',(storage->>'usedBytes')::bigint,'capacityBytes',(storage->>'capacityBytes')::bigint),
  'scope',jsonb_build_object('cohort',CASE WHEN p_contract_id IS NULL THEN 'administrative_active_with_children' ELSE 'contract_children' END,
   'sourceCutoffFrom',cutoff_from,'sourceCutoffTo',cutoff_to,'currentCensusCertified',false,'payrollEligibilityCertified',false,'unresolvedFamilyRows',review_count));
EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

CREATE OR REPLACE FUNCTION school_certificate_history_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,
 p_contract_id uuid,p_family_kind text,p_family_id text,p_identity_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; f jsonb; rows_json jsonb; row_count integer;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 f:=school_certificate_family_v3(ctx,p_contract_id,p_family_kind,p_family_id,p_identity_token,true);
 SELECT count(*)::integer,coalesce(jsonb_agg(r.certificate ORDER BY r.recorded_at DESC,r.id DESC),'[]'::jsonb)
 INTO row_count,rows_json FROM (SELECT * FROM school_certificate_records_v3(ctx,f) ORDER BY recorded_at DESC,id DESC LIMIT 5001) r;
 IF row_count>5000 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_ROW_LIMIT'; END IF;
 INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'history',row_count);
 RETURN jsonb_build_object('version','family-schooling-history.v3','contractId',p_contract_id,'familyRef',jsonb_build_object('kind',p_family_kind,'id',p_family_id),
  'identityToken',p_identity_token,'rows',rows_json,'total',row_count);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

CREATE OR REPLACE FUNCTION school_certificate_attempt_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; document school_certificate_record%ROWTYPE;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,true,p_idempotency_key);
 IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_KEY_INVALID'; END IF;
 SELECT * INTO document FROM school_certificate_record d WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.recorded_by_membership_id=p_membership AND d.idempotency_key=p_idempotency_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 PERFORM school_certificate_family_v3(ctx,document.contract_id,document.family_kind,document.family_id,document.identity_token,true);
 INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,record_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,document.id,'attempt',1);
 RETURN jsonb_build_object('version','family-schooling-register.v3','certificateId',document.id,'duplicate',true);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

CREATE OR REPLACE FUNCTION school_certificate_download_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_certificate_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; document school_certificate_record%ROWTYPE; result_value jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 SELECT * INTO document FROM school_certificate_record d WHERE d.id=p_certificate_id AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN
  RETURN school_certificate_download_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_certificate_id)
   ||jsonb_build_object('version','family-schooling-download.v3');
 END IF;
 PERFORM school_certificate_family_v3(ctx,document.contract_id,document.family_kind,document.family_id,document.identity_token,true);
 IF document.evidence_mode<>'pdf' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 SELECT jsonb_build_object('version','family-schooling-download.v3','filename',document.filename,
  'contentBase64',replace(encode(b.content,'base64'),E'\n',''),'sha256',b.sha256,'byteLength',b.byte_length)
 INTO result_value FROM school_certificate_blob b WHERE b.tenant_id=document.tenant_id AND b.sha256=document.blob_sha256;
 IF result_value IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,record_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,document.id,'download',1);
 RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

REVOKE ALL ON school_certificate_record,school_certificate_record_event FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION school_certificate_record_immutable_v3(),school_certificate_date_v3(text,boolean),
 school_certificate_family_v3(jsonb,uuid,text,text,text,boolean),school_certificate_records_v3(jsonb,jsonb),
 school_certificate_read_v3(text,uuid,integer,text,uuid,uuid,uuid),school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text),
 school_certificate_history_v3(text,uuid,integer,text,uuid,uuid,uuid,text,text,text),school_certificate_attempt_v3(text,uuid,integer,text,uuid,uuid,text),
 school_certificate_download_v3(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION school_certificate_read_v3(text,uuid,integer,text,uuid,uuid,uuid),
 school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text),school_certificate_history_v3(text,uuid,integer,text,uuid,uuid,uuid,text,text,text),
 school_certificate_attempt_v3(text,uuid,integer,text,uuid,uuid,text),school_certificate_download_v3(text,uuid,integer,text,uuid,uuid,uuid)
 TO municontrol_actions_runtime_app;
