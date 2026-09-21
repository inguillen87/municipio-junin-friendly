-- E5 phase 2b: immutable passes and actuaciones for a legal expediente.
CREATE TABLE public.legal_case_action (
 tenant_id uuid NOT NULL,
 case_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 500),
 action_type text NOT NULL CHECK(action_type IN ('pase','providencia','nota','constancia','informe','dictamen','otro')),
 from_area text NOT NULL CHECK(length(from_area) BETWEEN 2 AND 120 AND from_area !~ '[<>[:cntrl:]]'),
 to_area text,
 description text NOT NULL CHECK(length(description) BETWEEN 5 AND 2000 AND description !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 document_id uuid,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),
 request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,case_id,sequence),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,case_id) REFERENCES public.legal_case(tenant_id,id),
 FOREIGN KEY(tenant_id,case_id,document_id) REFERENCES public.legal_case_document(tenant_id,case_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK(
   (action_type='pase' AND to_area IS NOT NULL AND length(to_area) BETWEEN 2 AND 120
    AND to_area !~ '[<>[:cntrl:]]' AND from_area<>to_area)
   OR
   (action_type<>'pase' AND to_area IS NULL)
 )
);
CREATE INDEX legal_case_action_timeline_idx ON public.legal_case_action(tenant_id,case_id,sequence DESC);
ALTER TABLE public.legal_case_action ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_case_action FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_case_action_immutable BEFORE UPDATE OR DELETE ON public.legal_case_action
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_case_action_no_truncate BEFORE TRUNCATE ON public.legal_case_action
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

CREATE FUNCTION public.legal_case_action_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 ctx jsonb;t uuid;member uuid;keys text[];case_id uuid;case_record jsonb;
 current_area text;last_sequence integer;rows jsonb;documents jsonb;can_manage boolean;
 prior public.legal_case_action%ROWTYPE;fingerprint text;document_id uuid;next_sequence integer;
 action_type_value text;to_area_value text;area_after text;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));
 t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('list','save','attempt')
  OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>12000
 THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;

 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['caseId'] OR jsonb_typeof(d->'caseId') IS DISTINCT FROM 'string'
   OR d->>'caseId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;
  case_id:=(d->>'caseId')::uuid;case_record:=public.legal_case_record_v1(t,case_id,false);
  IF case_record IS NULL THEN RAISE EXCEPTION 'CASE_ACTION_CASE_NOT_FOUND';END IF;
  SELECT coalesce(max(a.sequence),0) INTO last_sequence
   FROM public.legal_case_action a WHERE a.tenant_id=t AND a.case_id=case_id;
  SELECT coalesce((
    SELECT a.to_area FROM public.legal_case_action a
     WHERE a.tenant_id=t AND a.case_id=case_id AND a.action_type='pase'
     ORDER BY a.sequence DESC LIMIT 1
   ),case_record->>'originArea') INTO current_area;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sequence',a.sequence,'actionType',a.action_type,'fromArea',a.from_area,
    'toArea',coalesce(a.to_area,''),'description',a.description,
    'document',CASE WHEN a.document_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',doc.id,'title',doc.title,'kind',doc.kind,'version',doc.version,
      'filename',doc.filename,'sha256',doc.sha256) END,
    'reason',a.reason,'recordedBy',a.actor_label,'recordedAt',a.recorded_at
   ) ORDER BY a.sequence DESC),'[]'::jsonb)
  INTO rows
  FROM public.legal_case_action a
  LEFT JOIN public.legal_case_document doc
   ON doc.tenant_id=a.tenant_id AND doc.case_id=a.case_id AND doc.id=a.document_id
  WHERE a.tenant_id=t AND a.case_id=case_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'title',x.title,'kind',x.kind,'version',x.version,
    'filename',x.filename,'sha256',x.sha256,'isLatest',
      NOT EXISTS(SELECT 1 FROM public.legal_case_document n
        WHERE n.tenant_id=x.tenant_id AND n.case_id=x.case_id AND n.supersedes_document_id=x.id)
   ) ORDER BY x.created_at DESC,x.id),'[]'::jsonb)
  INTO documents FROM public.legal_case_document x WHERE x.tenant_id=t AND x.case_id=case_id;
  can_manage:=(ctx->>'canRegister')::boolean AND case_record->>'state'='open';
  RETURN jsonb_build_object('version','legal-case-action-list.v1',
   'case',jsonb_build_object('id',case_record->>'id','number',case_record->>'number',
     'year',(case_record->>'year')::int,'state',case_record->>'state',
     'revision',(case_record->>'revision')::int,'subject',case_record->>'subject'),
   'canManage',can_manage,'currentArea',current_area,'lastSequence',last_sequence,
   'documents',documents,'rows',rows);
 END IF;

 IF op IN ('save','attempt') AND (k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM public.legal_case_action
   WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE_ACTION_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-case-action-receipt.v1',
   'caseId',prior.case_id,'sequence',prior.sequence,
   'areaAfter',CASE WHEN prior.action_type='pase' THEN prior.to_area ELSE prior.from_area END,
   'replayed',true);
 END IF;

 IF keys IS DISTINCT FROM ARRAY['actionType','caseId','description','documentId','expectedCaseRevision',
    'expectedSequence','fromArea','reason','toArea']
  OR jsonb_typeof(d->'caseId') IS DISTINCT FROM 'string'
  OR d->>'caseId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'expectedCaseRevision') IS DISTINCT FROM 'number'
  OR d->>'expectedCaseRevision'!~'^[1-9][0-9]{0,2}$'
  OR jsonb_typeof(d->'expectedSequence') IS DISTINCT FROM 'number'
  OR d->>'expectedSequence'!~'^[0-9]{1,3}$' OR (d->>'expectedSequence')::int>500
  OR jsonb_typeof(d->'actionType') IS DISTINCT FROM 'string'
  OR d->>'actionType' NOT IN ('pase','providencia','nota','constancia','informe','dictamen','otro')
  OR jsonb_typeof(d->'fromArea') IS DISTINCT FROM 'string' OR d->>'fromArea'<>btrim(d->>'fromArea')
  OR length(d->>'fromArea') NOT BETWEEN 2 AND 120 OR d->>'fromArea'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'toArea') IS DISTINCT FROM 'string' OR d->>'toArea'<>btrim(d->>'toArea')
  OR length(d->>'toArea')>120 OR d->>'toArea'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'description') IS DISTINCT FROM 'string' OR d->>'description'<>btrim(d->>'description')
  OR length(d->>'description') NOT BETWEEN 5 AND 2000 OR d->>'description'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
  OR (d->'documentId'<>'null'::jsonb AND (jsonb_typeof(d->'documentId') IS DISTINCT FROM 'string'
    OR d->>'documentId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;

 case_id:=(d->>'caseId')::uuid;action_type_value:=d->>'actionType';
 IF action_type_value='pase' THEN
  IF length(d->>'toArea') NOT BETWEEN 2 AND 120 OR d->>'toArea'=d->>'fromArea'
  THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;
  to_area_value:=d->>'toArea';
 ELSE
  IF d->>'toArea'<>'' THEN RAISE EXCEPTION 'CASE_ACTION_INPUT_INVALID';END IF;
  to_area_value:=NULL;
 END IF;

 IF current_setting('transaction_isolation')<>'read committed'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-case-action:'||t::text||':'||case_id::text,0))
 THEN RAISE EXCEPTION 'CASE_ACTION_BUSY';END IF;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM public.legal_case_action
  WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'CASE_ACTION_IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('version','legal-case-action-receipt.v1',
   'caseId',prior.case_id,'sequence',prior.sequence,
   'areaAfter',CASE WHEN prior.action_type='pase' THEN prior.to_area ELSE prior.from_area END,
   'replayed',true);
 END IF;

 case_record:=public.legal_case_record_v1(t,case_id,false);
 IF case_record IS NULL THEN RAISE EXCEPTION 'CASE_ACTION_CASE_NOT_FOUND';END IF;
 IF case_record->>'state'<>'open' THEN RAISE EXCEPTION 'CASE_ACTION_CASE_CLOSED';END IF;
 IF (case_record->>'revision')::int<>(d->>'expectedCaseRevision')::int
 THEN RAISE EXCEPTION 'CASE_ACTION_CASE_VERSION_CONFLICT';END IF;
 SELECT coalesce(max(a.sequence),0) INTO last_sequence
  FROM public.legal_case_action a WHERE a.tenant_id=t AND a.case_id=case_id;
 IF last_sequence<>(d->>'expectedSequence')::int
 THEN RAISE EXCEPTION 'CASE_ACTION_SEQUENCE_CONFLICT';END IF;
 SELECT coalesce((
   SELECT a.to_area FROM public.legal_case_action a
    WHERE a.tenant_id=t AND a.case_id=case_id AND a.action_type='pase'
    ORDER BY a.sequence DESC LIMIT 1
  ),case_record->>'originArea') INTO current_area;
 IF current_area<>d->>'fromArea' THEN RAISE EXCEPTION 'CASE_ACTION_AREA_CONFLICT';END IF;
 next_sequence:=last_sequence+1;
 IF next_sequence>500 THEN RAISE EXCEPTION 'CASE_ACTION_CAPACITY';END IF;
 document_id:=(d->>'documentId')::uuid;
 IF document_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.legal_case_document x
   WHERE x.tenant_id=t AND x.case_id=case_id AND x.id=document_id)
 THEN RAISE EXCEPTION 'CASE_ACTION_DOCUMENT_NOT_FOUND';END IF;
 area_after:=CASE WHEN action_type_value='pase' THEN to_area_value ELSE current_area END;

 INSERT INTO public.legal_case_action(
  tenant_id,case_id,sequence,action_type,from_area,to_area,description,document_id,reason,
  actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
 VALUES(t,case_id,next_sequence,action_type_value,current_area,to_area_value,d->>'description',
  document_id,d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
 RETURN jsonb_build_object('version','legal-case-action-receipt.v1',
  'caseId',case_id,'sequence',next_sequence,'areaAfter',area_after,'replayed',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'CASE_ACTION_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.legal_case_action_operation_v1(jsonb,text,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_case_action_operation_v1(jsonb,text,jsonb,uuid)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_case_action_operation_v1(jsonb,text,jsonb,uuid)
 IS 'Append-only expediente passes and actuaciones. Current area derives from latest pase; no delete, notification, legal validity or payroll effects';
