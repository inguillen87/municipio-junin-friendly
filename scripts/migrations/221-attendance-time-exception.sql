-- 221 · Excepciones horarias por legajo (franquicias documentadas de asistencia).
-- Personal (Hugo) registra excepciones humanas y documentadas: entrada diferida, salida transitoria,
-- salida anticipada o exención de control, por días de la semana y con vigencia. El cálculo desde
-- relojes excluye esas ventanas de tardanzas y ausencias. Registro propio de MuniControl (no depende
-- del GRH), append-only: registrar y revocar son eventos inmutables con actor, sesión y versión.
-- Sin escritura de nómina, novedades, relojes, identidades ni GRH. Requiere 022 (gateway de
-- asistencia), 067 (contratos propios con tenant) y pgcrypto. Aditiva: no modifica objetos previos.
DO $$ BEGIN
 IF to_regclass('public.attendance_time_exception_event') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'attendance_time_exception_%') THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_OBJECT_CONFLICT';
 END IF;
 IF to_regprocedure('public.attendance_gateway_assert_session_v1(text,uuid,integer,text,uuid,uuid)') IS NULL
  OR to_regprocedure('public.attendance_gateway_assert_actor_v1(jsonb,text)') IS NULL
  OR to_regprocedure('public.tenant_iam_effective_capabilities(uuid)') IS NULL
  OR to_regprocedure('public.digest(text,text)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.employment_contract'::regclass AND attname='tenant_id' AND NOT attisdropped)
  OR to_regrole('municontrol_actions_runtime_app') IS NULL THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_PREREQUISITE';
 END IF;
END $$;

-- Días ISO (1 = lunes … 7 = domingo), estrictamente ascendentes y sin repetir.
CREATE FUNCTION public.attendance_time_exception_weekdays_valid_v1(p smallint[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,pg_temp AS $$
 SELECT p IS NOT NULL AND array_ndims(p)=1 AND array_lower(p,1)=1 AND cardinality(p) BETWEEN 1 AND 7
  AND NOT EXISTS(SELECT 1 FROM unnest(p) WITH ORDINALITY d(v,i) WHERE v IS NULL OR v NOT BETWEEN 1 AND 7 OR (i>1 AND v<=p[i-1]))
$$;

-- Texto de una línea, sin bordes en blanco, controles ni marcado.
CREATE FUNCTION public.attendance_time_exception_text_valid_v1(p text,p_min integer,p_max integer) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,pg_temp AS $$
 SELECT p IS NOT NULL AND p=btrim(p) AND char_length(p) BETWEEN p_min AND p_max AND p!~'[[:cntrl:]<>]'
$$;

CREATE TABLE public.attendance_time_exception_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL,
 command text NOT NULL CHECK(command IN('register','revoke')),
 exception_id uuid,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),
 legajo_snapshot varchar(20) NOT NULL CHECK(legajo_snapshot~'^[1-9][0-9]{0,19}$'),
 kind text CHECK(kind IN('entrada_diferida','salida_transitoria','salida_anticipada','exento')),
 weekdays smallint[],
 from_time time(0),
 to_time time(0),
 valid_from date,
 valid_to date,
 category text CHECK(category IN('cuidado_familiar','salud','lactancia','estudio','gremial','traslado','otro')),
 note text,
 document_reference text,
 revoke_reason text,
 actor_membership_id uuid NOT NULL,
 actor_email text NOT NULL CHECK(actor_email=lower(actor_email) AND char_length(actor_email) BETWEEN 3 AND 320),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT attendance_time_exception_id_tenant_uk UNIQUE(id,tenant_id),
 CONSTRAINT attendance_time_exception_request_uk UNIQUE(tenant_id,actor_membership_id,request_key),
 CONSTRAINT attendance_time_exception_single_revoke_uk UNIQUE(exception_id),
 CONSTRAINT attendance_time_exception_target_fk FOREIGN KEY(exception_id,tenant_id) REFERENCES public.attendance_time_exception_event(id,tenant_id),
 CONSTRAINT attendance_time_exception_binding_fk FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 CONSTRAINT attendance_time_exception_membership_fk FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CONSTRAINT attendance_time_exception_command_ck CHECK((command='register')=(exception_id IS NULL)),
 CONSTRAINT attendance_time_exception_register_ck CHECK(command<>'register' OR (kind IS NOT NULL
  AND public.attendance_time_exception_weekdays_valid_v1(weekdays) AND valid_from IS NOT NULL AND category IS NOT NULL
  AND document_reference IS NOT NULL AND revoke_reason IS NULL)),
 CONSTRAINT attendance_time_exception_revoke_ck CHECK(command<>'revoke' OR (kind IS NULL AND weekdays IS NULL AND from_time IS NULL
  AND to_time IS NULL AND valid_from IS NULL AND valid_to IS NULL AND category IS NULL AND note IS NULL
  AND document_reference IS NULL AND revoke_reason IS NOT NULL)),
 CONSTRAINT attendance_time_exception_window_ck CHECK((from_time IS NULL)=(to_time IS NULL)
  AND (kind IS NULL OR (kind='exento')=(from_time IS NULL))
  AND (from_time IS NULL OR (from_time<to_time AND extract(second FROM from_time)=0 AND extract(second FROM to_time)=0))),
 CONSTRAINT attendance_time_exception_validity_ck CHECK((valid_from IS NULL OR valid_from BETWEEN DATE '2000-01-01' AND DATE '2099-12-31')
  AND (valid_to IS NULL OR (valid_from IS NOT NULL AND valid_to>=valid_from AND valid_to<=DATE '2099-12-31'))),
 CONSTRAINT attendance_time_exception_text_ck CHECK((note IS NULL OR public.attendance_time_exception_text_valid_v1(note,1,300))
  AND (document_reference IS NULL OR public.attendance_time_exception_text_valid_v1(document_reference,3,160))
  AND (revoke_reason IS NULL OR public.attendance_time_exception_text_valid_v1(revoke_reason,3,160)))
);

CREATE INDEX attendance_time_exception_contract_idx ON public.attendance_time_exception_event(tenant_id,contract_id) WHERE command='register';
CREATE INDEX attendance_time_exception_legajo_idx ON public.attendance_time_exception_event(tenant_id,legajo_snapshot,valid_from) WHERE command='register';

ALTER TABLE public.attendance_time_exception_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_time_exception_event FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.attendance_time_exception_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_IMMUTABLE'; END $$;

CREATE TRIGGER attendance_time_exception_immutable BEFORE UPDATE OR DELETE ON public.attendance_time_exception_event
 FOR EACH ROW EXECUTE FUNCTION public.attendance_time_exception_immutable_v1();
CREATE TRIGGER attendance_time_exception_no_truncate BEFORE TRUNCATE ON public.attendance_time_exception_event
 FOR EACH STATEMENT EXECUTE FUNCTION public.attendance_time_exception_immutable_v1();

-- A revocation must point at a registration of the same tenant, contract and legajo.
CREATE FUNCTION public.attendance_time_exception_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.command='revoke' AND NOT EXISTS(SELECT 1 FROM public.attendance_time_exception_event r
   WHERE r.id=NEW.exception_id AND r.tenant_id=NEW.tenant_id AND r.command='register'
    AND r.contract_id=NEW.contract_id AND r.legajo_snapshot=NEW.legajo_snapshot) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_TARGET_INVALID';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER attendance_time_exception_guard BEFORE INSERT ON public.attendance_time_exception_event
 FOR EACH ROW EXECUTE FUNCTION public.attendance_time_exception_guard_v1();

-- Session, capability and nominal-read gate shared by the three entry points. Legajos and names are
-- personal data: every entry point also requires workforce.employee.read (same rule as clock reads).
CREATE FUNCTION public.attendance_time_exception_context_v1(p_email text,p_session uuid,p_version integer,p_release text,
 p_tenant uuid,p_membership uuid,p_capability text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 IF p_capability IS NULL OR p_capability NOT IN('attendance.read','attendance.review') THEN
  RAISE EXCEPTION 'ATTENDANCE_AUTHORITY_REQUIRED';
 END IF;
 ctx:=public.attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=public.attendance_gateway_assert_actor_v1(ctx,p_capability);
 IF NOT EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(p_membership) c WHERE c.capability_key='workforce.employee.read') THEN
  RAISE EXCEPTION 'ATTENDANCE_CAPABILITY_REQUIRED';
 END IF;
 RETURN ctx||jsonb_build_object('canManage',coalesce(ctx->'capabilities','[]'::jsonb) ? 'attendance.review',
  'sessionId',p_session,'sessionVersion',p_version,'releaseSha',lower(p_release));
END $$;

-- Public projection of one registration with its (optional) revocation.
CREATE FUNCTION public.attendance_time_exception_item_v1(p_tenant uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',r.id,'legajo',r.legajo_snapshot,
  'name',coalesce(nullif(btrim(p.full_name),''),'Legajo '||r.legajo_snapshot),
  'kind',r.kind,'weekdays',to_jsonb(r.weekdays),'from',left(r.from_time::text,5),'to',left(r.to_time::text,5),
  'validFrom',to_char(r.valid_from,'YYYY-MM-DD'),'validTo',to_char(r.valid_to,'YYYY-MM-DD'),
  'category',r.category,'note',r.note,'documentReference',r.document_reference,
  'registeredAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'registeredBy',r.actor_email,
  'revokedAt',to_char(v.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'revokedBy',v.actor_email,
  'revokeReason',v.revoke_reason)
 FROM public.attendance_time_exception_event r
 JOIN public.employment_contract c ON c.id=r.contract_id
 LEFT JOIN public.person_identity p ON p.id=c.person_id
 LEFT JOIN public.attendance_time_exception_event v ON v.exception_id=r.id AND v.tenant_id=r.tenant_id AND v.command='revoke'
 WHERE r.tenant_id=p_tenant AND r.id=p_id AND r.command='register'
$$;

CREATE FUNCTION public.attendance_time_exception_list_v1(p_email text,p_session uuid,p_version integer,p_release text,
 p_tenant uuid,p_membership uuid,p_legajo text DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; matched bigint; items jsonb;
BEGIN
 ctx:=public.attendance_time_exception_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,'attendance.read');
 IF (p_legajo IS NOT NULL AND p_legajo!~'^[1-9][0-9]{0,19}$') OR (p_from IS NULL)<>(p_to IS NULL)
  OR (p_from IS NOT NULL AND (p_to<p_from OR p_to-p_from>92)) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_QUERY_INVALID';
 END IF;
 SELECT count(*) INTO matched FROM public.attendance_time_exception_event r
  WHERE r.tenant_id=p_tenant AND r.command='register' AND (p_legajo IS NULL OR r.legajo_snapshot=p_legajo)
   AND (p_from IS NULL OR (r.valid_from<=p_to AND (r.valid_to IS NULL OR r.valid_to>=p_from)));
 IF matched>2000 THEN RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_TOO_MANY'; END IF;
 SELECT coalesce(jsonb_agg(public.attendance_time_exception_item_v1(p_tenant,r.id)
   ORDER BY r.legajo_snapshot::numeric,r.valid_from,r.recorded_at,r.id),'[]'::jsonb) INTO items
  FROM public.attendance_time_exception_event r
  WHERE r.tenant_id=p_tenant AND r.command='register' AND (p_legajo IS NULL OR r.legajo_snapshot=p_legajo)
   AND (p_from IS NULL OR (r.valid_from<=p_to AND (r.valid_to IS NULL OR r.valid_to>=p_from)));
 RETURN jsonb_build_object('version','attendance-time-exceptions.v1','canManage',(ctx->>'canManage')::boolean,'items',items);
END $$;

CREATE FUNCTION public.attendance_time_exception_register_v1(p_email text,p_session uuid,p_version integer,p_release text,
 p_tenant uuid,p_membership uuid,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 ctx jsonb; key uuid; legajo text; kind_value text; days smallint[]; from_value time; to_value time;
 valid_from_value date; valid_to_value date; category_value text; note_value text; document_value text;
 fingerprint text; previous public.attendance_time_exception_event; contract_count integer; contract_value uuid; created uuid;
BEGIN
 ctx:=public.attendance_time_exception_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,'attendance.review');
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(p_body) k)
  IS DISTINCT FROM ARRAY['category','documentReference','from','kind','legajo','note','requestKey','to','validFrom','validTo','weekdays'] THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID';
 END IF;
 IF jsonb_typeof(p_body->'requestKey') IS DISTINCT FROM 'string'
  OR p_body->>'requestKey'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_body->'legajo') IS DISTINCT FROM 'string' OR p_body->>'legajo'!~'^[1-9][0-9]{0,19}$'
  OR jsonb_typeof(p_body->'kind') IS DISTINCT FROM 'string'
  OR p_body->>'kind' NOT IN('entrada_diferida','salida_transitoria','salida_anticipada','exento')
  OR jsonb_typeof(p_body->'weekdays') IS DISTINCT FROM 'array' OR jsonb_array_length(p_body->'weekdays') NOT BETWEEN 1 AND 7
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'weekdays') d WHERE jsonb_typeof(d)<>'number' OR d::text!~'^[1-7]$')
  OR jsonb_typeof(p_body->'category') IS DISTINCT FROM 'string'
  OR p_body->>'category' NOT IN('cuidado_familiar','salud','lactancia','estudio','gremial','traslado','otro')
  OR jsonb_typeof(p_body->'note') NOT IN('null','string')
  OR (jsonb_typeof(p_body->'note')='string' AND NOT public.attendance_time_exception_text_valid_v1(p_body->>'note',1,300))
  OR jsonb_typeof(p_body->'documentReference') IS DISTINCT FROM 'string'
  OR NOT public.attendance_time_exception_text_valid_v1(p_body->>'documentReference',3,160)
  OR jsonb_typeof(p_body->'validFrom') IS DISTINCT FROM 'string' OR p_body->>'validFrom'!~'^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  OR (CASE WHEN pg_input_is_valid(p_body->>'validFrom','date') THEN to_char((p_body->>'validFrom')::date,'YYYY-MM-DD')<>p_body->>'validFrom' ELSE true END)
  OR jsonb_typeof(p_body->'validTo') NOT IN('null','string')
  OR (jsonb_typeof(p_body->'validTo')='string' AND (p_body->>'validTo'!~'^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
   OR (CASE WHEN pg_input_is_valid(p_body->>'validTo','date') THEN to_char((p_body->>'validTo')::date,'YYYY-MM-DD')<>p_body->>'validTo' ELSE true END)))
  OR jsonb_typeof(p_body->'from') NOT IN('null','string') OR jsonb_typeof(p_body->'to') NOT IN('null','string')
  OR (jsonb_typeof(p_body->'from')='string' AND p_body->>'from'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')
  OR (jsonb_typeof(p_body->'to')='string' AND p_body->>'to'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID';
 END IF;
 key:=(p_body->>'requestKey')::uuid; legajo:=p_body->>'legajo'; kind_value:=p_body->>'kind';
 SELECT array_agg(d::text::smallint ORDER BY o) INTO days FROM jsonb_array_elements(p_body->'weekdays') WITH ORDINALITY e(d,o);
 from_value:=(p_body->>'from')::time; to_value:=(p_body->>'to')::time;
 valid_from_value:=(p_body->>'validFrom')::date; valid_to_value:=(p_body->>'validTo')::date;
 category_value:=p_body->>'category'; note_value:=p_body->>'note'; document_value:=p_body->>'documentReference';
 IF NOT public.attendance_time_exception_weekdays_valid_v1(days)
  OR (kind_value='exento')<>(from_value IS NULL) OR (from_value IS NULL)<>(to_value IS NULL)
  OR (from_value IS NOT NULL AND from_value>=to_value)
  OR valid_from_value NOT BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'
  OR (valid_to_value IS NOT NULL AND (valid_to_value<valid_from_value OR valid_to_value>DATE '2099-12-31')) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID';
 END IF;
 fingerprint:=encode(public.digest(jsonb_build_array('attendance-time-exception.register.v1',legajo,kind_value,to_jsonb(days),
  p_body->>'from',p_body->>'to',p_body->>'validFrom',p_body->>'validTo',category_value,note_value,document_value)::text,'sha256'),'hex');
 IF NOT pg_try_advisory_xact_lock(hashtextextended('attendance-time-exception:v1:'||p_tenant::text,0)) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_BUSY';
 END IF;
 SELECT * INTO previous FROM public.attendance_time_exception_event x
  WHERE x.tenant_id=p_tenant AND x.actor_membership_id=p_membership AND x.request_key=key;
 IF FOUND THEN
  IF previous.command='register' AND previous.request_sha256=fingerprint THEN
   RETURN jsonb_build_object('item',public.attendance_time_exception_item_v1(p_tenant,previous.id),'replayed',true);
  END IF;
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_KEY_REUSED';
 END IF;
 -- Same rule as the clock reads: own (MUNICONTROL) contracts of this tenant, or GRH contracts of the
 -- certified company in a published batch of the certified database. One contract per legajo.
 SELECT count(*),(array_agg(c.id ORDER BY c.id))[1] INTO contract_count,contract_value FROM public.employment_contract c
  WHERE c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND ltrim(c.legacy_legajo,'0')=legajo
   AND ((c.source_system='MUNICONTROL' AND c.tenant_id=p_tenant)
    OR (c.source_system='GRH' AND c.tenant_id IS NULL AND EXISTS(SELECT 1 FROM public.source_import_batch ib
     WHERE ib.id=c.source_batch_id AND ib.source_system='GRH' AND ib.source_database=ctx->>'sourceDatabase'
      AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)));
 IF contract_count=0 THEN RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_LEGAJO_NOT_FOUND'; END IF;
 IF contract_count>1 THEN RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_LEGAJO_AMBIGUOUS'; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_time_exception_event r
   WHERE r.tenant_id=p_tenant AND r.command='register' AND r.contract_id=contract_value AND r.kind=kind_value
    AND r.weekdays=days AND r.from_time IS NOT DISTINCT FROM from_value AND r.to_time IS NOT DISTINCT FROM to_value
    AND r.valid_from=valid_from_value AND r.valid_to IS NOT DISTINCT FROM valid_to_value
    AND NOT EXISTS(SELECT 1 FROM public.attendance_time_exception_event v WHERE v.exception_id=r.id AND v.command='revoke')) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_DUPLICATE';
 END IF;
 INSERT INTO public.attendance_time_exception_event(tenant_id,source_binding_id,command,exception_id,contract_id,legajo_snapshot,
  kind,weekdays,from_time,to_time,valid_from,valid_to,category,note,document_reference,revoke_reason,
  actor_membership_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,request_sha256)
 VALUES(p_tenant,(ctx->>'certifiedBindingId')::uuid,'register',NULL,contract_value,legajo,
  kind_value,days,from_value,to_value,valid_from_value,valid_to_value,category_value,note_value,document_value,NULL,
  p_membership,ctx->>'email',p_session,p_version,lower(p_release),key,fingerprint)
 RETURNING id INTO created;
 RETURN jsonb_build_object('item',public.attendance_time_exception_item_v1(p_tenant,created),'replayed',false);
END $$;

CREATE FUNCTION public.attendance_time_exception_revoke_v1(p_email text,p_session uuid,p_version integer,p_release text,
 p_tenant uuid,p_membership uuid,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; key uuid; target uuid; reason text; fingerprint text; previous public.attendance_time_exception_event;
 registered public.attendance_time_exception_event;
BEGIN
 ctx:=public.attendance_time_exception_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,'attendance.review');
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(p_body) k)
  IS DISTINCT FROM ARRAY['id','reason','requestKey']
  OR jsonb_typeof(p_body->'requestKey') IS DISTINCT FROM 'string'
  OR p_body->>'requestKey'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_body->'id') IS DISTINCT FROM 'string'
  OR p_body->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_body->'reason') IS DISTINCT FROM 'string'
  OR NOT public.attendance_time_exception_text_valid_v1(p_body->>'reason',3,160) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID';
 END IF;
 key:=(p_body->>'requestKey')::uuid; target:=(p_body->>'id')::uuid; reason:=p_body->>'reason';
 fingerprint:=encode(public.digest(jsonb_build_array('attendance-time-exception.revoke.v1',target,reason)::text,'sha256'),'hex');
 IF NOT pg_try_advisory_xact_lock(hashtextextended('attendance-time-exception:v1:'||p_tenant::text,0)) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_BUSY';
 END IF;
 SELECT * INTO previous FROM public.attendance_time_exception_event x
  WHERE x.tenant_id=p_tenant AND x.actor_membership_id=p_membership AND x.request_key=key;
 IF FOUND THEN
  IF previous.command='revoke' AND previous.request_sha256=fingerprint THEN
   RETURN jsonb_build_object('item',public.attendance_time_exception_item_v1(p_tenant,previous.exception_id),'replayed',true);
  END IF;
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_KEY_REUSED';
 END IF;
 SELECT * INTO registered FROM public.attendance_time_exception_event r
  WHERE r.tenant_id=p_tenant AND r.id=target AND r.command='register';
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_time_exception_event v WHERE v.exception_id=target) THEN
  RAISE EXCEPTION 'ATTENDANCE_TIME_EXCEPTION_ALREADY_REVOKED';
 END IF;
 INSERT INTO public.attendance_time_exception_event(tenant_id,source_binding_id,command,exception_id,contract_id,legajo_snapshot,
  revoke_reason,actor_membership_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,request_sha256)
 VALUES(p_tenant,(ctx->>'certifiedBindingId')::uuid,'revoke',target,registered.contract_id,registered.legajo_snapshot,
  reason,p_membership,ctx->>'email',p_session,p_version,lower(p_release),key,fingerprint);
 RETURN jsonb_build_object('item',public.attendance_time_exception_item_v1(p_tenant,target),'replayed',false);
END $$;

REVOKE ALL ON FUNCTION public.attendance_time_exception_weekdays_valid_v1(smallint[]),
 public.attendance_time_exception_text_valid_v1(text,integer,integer),
 public.attendance_time_exception_immutable_v1(),public.attendance_time_exception_guard_v1(),
 public.attendance_time_exception_context_v1(text,uuid,integer,text,uuid,uuid,text),
 public.attendance_time_exception_item_v1(uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.attendance_time_exception_list_v1(text,uuid,integer,text,uuid,uuid,text,date,date),
 public.attendance_time_exception_register_v1(text,uuid,integer,text,uuid,uuid,jsonb),
 public.attendance_time_exception_revoke_v1(text,uuid,integer,text,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_time_exception_list_v1(text,uuid,integer,text,uuid,uuid,text,date,date),
 public.attendance_time_exception_register_v1(text,uuid,integer,text,uuid,uuid,jsonb),
 public.attendance_time_exception_revoke_v1(text,uuid,integer,text,uuid,uuid,jsonb) TO municontrol_actions_runtime_app;
