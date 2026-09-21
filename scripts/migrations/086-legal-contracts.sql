-- E5 phase 3a: versioned contractual register linked to legal matter/expediente.
CREATE FUNCTION public.legal_contract_counterparties_valid_v1(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN jsonb_typeof(p)='array' THEN
  jsonb_array_length(p) BETWEEN 1 AND 20
  AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(p) x
   WHERE jsonb_typeof(x)<>'object'
    OR (CASE WHEN jsonb_typeof(x)='object' THEN
      (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(x) key)
      IS DISTINCT FROM ARRAY['name','role','taxId'] ELSE true END)
    OR jsonb_typeof(x->'name')<>'string' OR length(x->>'name') NOT BETWEEN 2 AND 180
    OR (x->>'name') ~ '[<>[:cntrl:]]'
    OR jsonb_typeof(x->'role')<>'string'
    OR x->>'role' NOT IN ('provider','contractor','consultant','lessee','lessor','other')
    OR jsonb_typeof(x->'taxId')<>'string'
    OR (x->>'taxId'<>'' AND x->>'taxId' !~ '^[0-9]{11}

CREATE FUNCTION public.legal_contract_validate_payload_v1(d jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s date;e date;
BEGIN
 IF jsonb_typeof(d->'title') IS DISTINCT FROM 'string' OR d->>'title'<>btrim(d->>'title')
  OR length(d->>'title') NOT BETWEEN 3 AND 240 OR d->>'title'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'object') IS DISTINCT FROM 'string' OR d->>'object'<>btrim(d->>'object')
  OR length(d->>'object') NOT BETWEEN 5 AND 3000 OR d->>'object'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR NOT public.legal_contract_counterparties_valid_v1(d->'counterparties')
  OR jsonb_typeof(d->'currency') IS DISTINCT FROM 'string' OR d->>'currency' NOT IN ('NONE','ARS','USD','EUR')
  OR jsonb_typeof(d->'approvalReference') IS DISTINCT FROM 'string'
  OR d->>'approvalReference'<>btrim(d->>'approvalReference') OR length(d->>'approvalReference')>500
  OR d->>'approvalReference'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'startDate') IS DISTINCT FROM 'string'
  OR jsonb_typeof(d->'endDate') IS DISTINCT FROM 'string'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
 THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 IF d->>'currency'='NONE' THEN
  IF d->'amountMinor'<>'null'::jsonb THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 ELSE
  IF jsonb_typeof(d->'amountMinor') IS DISTINCT FROM 'number'
   OR d->>'amountMinor'!~'^[0-9]{1,15}$' OR (d->>'amountMinor')::numeric>999999999999999
  THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 END IF;
 BEGIN
  IF d->>'startDate'<>'' THEN s:=(d->>'startDate')::date;
   IF to_char(s,'YYYY-MM-DD')<>d->>'startDate' THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;END IF;
  IF d->>'endDate'<>'' THEN e:=(d->>'endDate')::date;
   IF to_char(e,'YYYY-MM-DD')<>d->>'endDate' THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;END IF;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END;
 IF s IS NOT NULL AND e IS NOT NULL AND e<s THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
END $$;

CREATE TABLE public.legal_contract (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 number text NOT NULL CHECK(number ~ '^[A-Z0-9][A-Z0-9./-]{0,39}$'),
 year integer NOT NULL CHECK(year BETWEEN 1900 AND 2100),
 contract_type text NOT NULL CHECK(contract_type IN ('obra','servicio','suministro','locacion','consultoria','convenio','otro')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,number,year,contract_type)
);

CREATE TABLE public.legal_contract_revision (
 tenant_id uuid NOT NULL,contract_id uuid NOT NULL,revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100),
 state text NOT NULL CHECK(state IN ('registered','under_review','active','closed','cancelled')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 240),object_text text NOT NULL CHECK(length(object_text) BETWEEN 5 AND 3000),
 counterparties jsonb NOT NULL CHECK(public.legal_contract_counterparties_valid_v1(counterparties)),
 currency text NOT NULL CHECK(currency IN ('NONE','ARS','USD','EUR')),
 amount_minor bigint CHECK(amount_minor IS NULL OR amount_minor BETWEEN 0 AND 999999999999999),
 start_date date,end_date date,approval_reference text NOT NULL CHECK(length(approval_reference)<=500),
 responsible_membership_id uuid NOT NULL,responsible_label text NOT NULL CHECK(length(responsible_label) BETWEEN 1 AND 254),
 matter_id uuid NOT NULL,case_id uuid,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
 actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,contract_id,revision),UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,contract_id) REFERENCES public.legal_contract(tenant_id,id),
 FOREIGN KEY(responsible_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,matter_id) REFERENCES public.legal_matter(tenant_id,id),
 FOREIGN KEY(tenant_id,matter_id,case_id) REFERENCES public.legal_matter_case_link(tenant_id,matter_id,case_id),
 CHECK((currency='NONE' AND amount_minor IS NULL) OR (currency<>'NONE' AND amount_minor IS NOT NULL)),
 CHECK(start_date IS NULL OR end_date IS NULL OR end_date>=start_date)
);
CREATE INDEX legal_contract_revision_state_idx ON public.legal_contract_revision(tenant_id,state,recorded_at DESC);
ALTER TABLE public.legal_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_contract_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_contract,public.legal_contract_revision FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_contract_immutable BEFORE UPDATE OR DELETE ON public.legal_contract FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_contract_no_truncate BEFORE TRUNCATE ON public.legal_contract FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_contract_revision_immutable BEFORE UPDATE OR DELETE ON public.legal_contract_revision FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_contract_revision_no_truncate BEFORE TRUNCATE ON public.legal_contract_revision FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

CREATE FUNCTION public.legal_contract_record_v1(t uuid,c uuid,include_history boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object(
  'id',x.id,'number',x.number,'year',x.year,'contractType',x.contract_type,'revision',r.revision,'state',r.state,
  'title',r.title,'object',r.object_text,'counterparties',r.counterparties,'currency',r.currency,'amountMinor',r.amount_minor,
  'startDate',coalesce(to_char(r.start_date,'YYYY-MM-DD'),''),'endDate',coalesce(to_char(r.end_date,'YYYY-MM-DD'),''),
  'approvalReference',r.approval_reference,
  'responsible',jsonb_build_object('id',r.responsible_membership_id,'label',r.responsible_label,
    'eligible',public.legal_coordination_member_v1(t,r.responsible_membership_id) IS NOT NULL),
  'matterId',r.matter_id,'caseId',r.case_id,'reason',r.reason,'recordedBy',r.actor_label,'recordedAt',r.recorded_at,
  'history',CASE WHEN include_history THEN (
   SELECT coalesce(jsonb_agg(jsonb_build_object(
    'revision',h.revision,'state',h.state,'title',h.title,'object',h.object_text,'counterparties',h.counterparties,
    'currency',h.currency,'amountMinor',h.amount_minor,'startDate',coalesce(to_char(h.start_date,'YYYY-MM-DD'),''),
    'endDate',coalesce(to_char(h.end_date,'YYYY-MM-DD'),''),'approvalReference',h.approval_reference,
    'responsibleId',h.responsible_membership_id,'responsibleLabel',h.responsible_label,'matterId',h.matter_id,
    'caseId',h.case_id,'reason',h.reason,'recordedBy',h.actor_label,'recordedAt',h.recorded_at
   ) ORDER BY h.revision DESC),'[]'::jsonb)
   FROM public.legal_contract_revision h WHERE h.tenant_id=t AND h.contract_id=c
  ) ELSE NULL END)
 FROM public.legal_contract x
 JOIN LATERAL (SELECT * FROM public.legal_contract_revision q
  WHERE q.tenant_id=x.tenant_id AND q.contract_id=x.id ORDER BY q.revision DESC LIMIT 1) r ON true
 WHERE x.tenant_id=t AND x.id=c
$$;

CREATE FUNCTION public.legal_contract_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;keys text[];contract uuid;matter uuid;case_id uuid;target uuid;candidate jsonb;
 current public.legal_contract_revision%ROWTYPE;prior public.legal_contract_revision%ROWTYPE;fingerprint text;command text;
 rev integer;next_state text;rows jsonb;total integer;page_number integer;query_text text;filter_state text;cases jsonb;people jsonb;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('bootstrap','list','detail','save','attempt') OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>20000 THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;

 IF op='bootstrap' THEN
  IF keys IS DISTINCT FROM ARRAY['matterId'] OR jsonb_typeof(d->'matterId') IS DISTINCT FROM 'string'
   OR d->>'matterId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
  matter:=(d->>'matterId')::uuid;IF public.legal_matter_record_v1(t,matter,false) IS NULL THEN RAISE EXCEPTION 'CONTRACT_MATTER_NOT_FOUND';END IF;
  people:='[]'::jsonb;IF (ctx->>'canRegister')::boolean THEN
   SELECT coalesce(jsonb_agg(q.member ORDER BY q.member->>'id'),'[]'::jsonb) INTO people
   FROM (SELECT public.legal_coordination_member_v1(t,x.id) member FROM public.tenant_membership x WHERE x.tenant_id=t AND x.status='active') q WHERE q.member IS NOT NULL;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'year',c.year,'subject',e.subject) ORDER BY c.year,c.number),'[]'::jsonb)
   INTO cases FROM public.legal_matter_case_link l JOIN public.legal_case c ON c.tenant_id=l.tenant_id AND c.id=l.case_id
   JOIN LATERAL (SELECT subject FROM public.legal_case_event ce WHERE ce.tenant_id=c.tenant_id AND ce.case_id=c.id ORDER BY revision DESC LIMIT 1)e ON true
   WHERE l.tenant_id=t AND l.matter_id=matter;
  RETURN jsonb_build_object('version','legal-contract-bootstrap.v1','canManage',(ctx->>'canRegister')::boolean,'matterId',matter,'candidates',people,'cases',cases);
 END IF;

 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['page','q','state'] OR jsonb_typeof(d->'q') IS DISTINCT FROM 'string' OR length(d->>'q')>120
   OR d->>'page'!~'^[1-9][0-9]{0,2}$' OR (d->>'page')::int>200 OR jsonb_typeof(d->'state') IS DISTINCT FROM 'string'
   OR d->>'state' NOT IN ('','registered','under_review','active','closed','cancelled') THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
  page_number:=(d->>'page')::int;query_text:=btrim(d->>'q');filter_state:=NULLIF(d->>'state','');
  WITH latest AS (
   SELECT DISTINCT ON(r.contract_id) r.*,c.number,c.year,c.contract_type
   FROM public.legal_contract_revision r JOIN public.legal_contract c ON c.tenant_id=r.tenant_id AND c.id=r.contract_id
   WHERE r.tenant_id=t ORDER BY r.contract_id,r.revision DESC
  ),scoped AS (
   SELECT * FROM latest WHERE (filter_state IS NULL OR state=filter_state)
    AND (query_text='' OR concat_ws(' ',number,year,title,object_text,responsible_label,counterparties::text) ILIKE '%'||query_text||'%')
  )
  SELECT (SELECT count(*)::int FROM scoped),coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',s.contract_id,'number',s.number,'year',s.year,'contractType',s.contract_type,'revision',s.revision,'state',s.state,
   'title',s.title,'currency',s.currency,'amountMinor',s.amount_minor,'responsibleLabel',s.responsible_label,
   'startDate',coalesce(to_char(s.start_date,'YYYY-MM-DD'),''),'endDate',coalesce(to_char(s.end_date,'YYYY-MM-DD'),''),
   'recordedAt',s.recorded_at) ORDER BY s.recorded_at DESC,s.contract_id)
   FROM (SELECT * FROM scoped ORDER BY recorded_at DESC,contract_id LIMIT 25 OFFSET (page_number-1)*25)s),'[]'::jsonb)
  INTO total,rows;
  RETURN jsonb_build_object('version','legal-contract-list.v1','canManage',(ctx->>'canRegister')::boolean,'total',total,'page',page_number,'pageSize',25,'rows',rows);
 END IF;

 IF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
  contract:=(d->>'id')::uuid;rows:=public.legal_contract_record_v1(t,contract,true);IF rows IS NULL THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-contract-detail.v1','canManage',(ctx->>'canRegister')::boolean AND (rows->>'revision')::int<100,'record',rows);
 END IF;

 IF op IN ('save','attempt') AND (k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM public.legal_contract_revision WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-contract-receipt.v1','id',prior.contract_id,'revision',prior.revision,'state',prior.state,'replayed',true);
 END IF;

 command:=d->>'command';IF command IS NULL OR command NOT IN ('create','revise','set_state') THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 IF current_setting('transaction_isolation')<>'read committed' OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-contract:'||t::text,0)) THEN RAISE EXCEPTION 'CONTRACT_BUSY';END IF;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM public.legal_contract_revision WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'CONTRACT_IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('version','legal-contract-receipt.v1','id',prior.contract_id,'revision',prior.revision,'state',prior.state,'replayed',true);END IF;

 IF command='create' THEN
  IF keys IS DISTINCT FROM ARRAY['amountMinor','approvalReference','caseId','command','contractType','counterparties','currency','endDate','matterId','number','object','reason','responsibleId','startDate','title','year'] THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
  IF jsonb_typeof(d->'number') IS DISTINCT FROM 'string' OR upper(btrim(d->>'number'))!~'^[A-Z0-9][A-Z0-9./-]{0,39}$'
   OR jsonb_typeof(d->'year') IS DISTINCT FROM 'number' OR d->>'year'!~'^[0-9]{4}$' OR (d->>'year')::int NOT BETWEEN 1900 AND 2100
   OR jsonb_typeof(d->'contractType') IS DISTINCT FROM 'string' OR d->>'contractType' NOT IN ('obra','servicio','suministro','locacion','consultoria','convenio','otro')
   OR jsonb_typeof(d->'matterId') IS DISTINCT FROM 'string' OR d->>'matterId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string' OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR (d->'caseId'<>'null'::jsonb AND (jsonb_typeof(d->'caseId') IS DISTINCT FROM 'string' OR d->>'caseId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
  THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
  PERFORM public.legal_contract_validate_payload_v1(d);
  matter:=(d->>'matterId')::uuid;case_id:=(d->>'caseId')::uuid;
  IF public.legal_matter_record_v1(t,matter,false) IS NULL THEN RAISE EXCEPTION 'CONTRACT_MATTER_NOT_FOUND';END IF;
  IF case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.legal_matter_case_link l WHERE l.tenant_id=t AND l.matter_id=matter AND l.case_id=case_id) THEN RAISE EXCEPTION 'CONTRACT_CASE_NOT_FOUND';END IF;
  target:=(d->>'responsibleId')::uuid;candidate:=public.legal_coordination_member_v1(t,target);IF candidate IS NULL THEN RAISE EXCEPTION 'CONTRACT_MEMBER_UNAVAILABLE';END IF;
  IF (SELECT count(*) FROM public.legal_contract WHERE tenant_id=t)>=1000 THEN RAISE EXCEPTION 'CONTRACT_CAPACITY';END IF;
  BEGIN INSERT INTO public.legal_contract(tenant_id,number,year,contract_type) VALUES(t,upper(btrim(d->>'number')),(d->>'year')::int,d->>'contractType') RETURNING id INTO contract;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONTRACT_DUPLICATE';END;
  INSERT INTO public.legal_contract_revision(tenant_id,contract_id,revision,state,title,object_text,counterparties,currency,amount_minor,start_date,end_date,approval_reference,responsible_membership_id,responsible_label,matter_id,case_id,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
  VALUES(t,contract,1,'registered',d->>'title',d->>'object',d->'counterparties',d->>'currency',(d->>'amountMinor')::bigint,NULLIF(d->>'startDate','')::date,NULLIF(d->>'endDate','')::date,d->>'approvalReference',target,candidate->>'label',matter,case_id,d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
  RETURN jsonb_build_object('version','legal-contract-receipt.v1','id',contract,'revision',1,'state','registered','replayed',false);
 END IF;

 IF keys IS DISTINCT FROM ARRAY['amountMinor','approvalReference','caseId','command','counterparties','currency','endDate','expectedRevision','id','matterId','object','reason','responsibleId','startDate','state','title']
  OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'expectedRevision') IS DISTINCT FROM 'number' OR d->>'expectedRevision'!~'^[1-9][0-9]{0,2}$'
  OR jsonb_typeof(d->'state') IS DISTINCT FROM 'string' OR d->>'state' NOT IN ('registered','under_review','active','closed','cancelled')
  OR jsonb_typeof(d->'matterId') IS DISTINCT FROM 'string' OR d->>'matterId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string' OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR (d->'caseId'<>'null'::jsonb AND (jsonb_typeof(d->'caseId') IS DISTINCT FROM 'string' OR d->>'caseId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID';END IF;
 PERFORM public.legal_contract_validate_payload_v1(d);
 contract:=(d->>'id')::uuid;SELECT * INTO current FROM public.legal_contract_revision r WHERE r.tenant_id=t AND r.contract_id=contract ORDER BY r.revision DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND';END IF;
 IF current.revision<>(d->>'expectedRevision')::int THEN RAISE EXCEPTION 'CONTRACT_VERSION_CONFLICT';END IF;
 IF current.revision>=100 THEN RAISE EXCEPTION 'CONTRACT_CAPACITY';END IF;
 target:=(d->>'responsibleId')::uuid;candidate:=public.legal_coordination_member_v1(t,target);IF candidate IS NULL THEN RAISE EXCEPTION 'CONTRACT_MEMBER_UNAVAILABLE';END IF;
 matter:=(d->>'matterId')::uuid;case_id:=(d->>'caseId')::uuid;
 IF public.legal_matter_record_v1(t,matter,false) IS NULL THEN RAISE EXCEPTION 'CONTRACT_MATTER_NOT_FOUND';END IF;
 IF case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.legal_matter_case_link l WHERE l.tenant_id=t AND l.matter_id=matter AND l.case_id=case_id) THEN RAISE EXCEPTION 'CONTRACT_CASE_NOT_FOUND';END IF;
 IF command='revise' THEN IF d->>'state'<>current.state THEN RAISE EXCEPTION 'CONTRACT_STATE_IMMUTABLE';END IF;next_state:=current.state;
 ELSE
  IF d->>'title'<>current.title OR d->>'object'<>current.object_text OR d->'counterparties'<>current.counterparties
   OR d->>'currency'<>current.currency OR (d->>'amountMinor')::bigint IS DISTINCT FROM current.amount_minor
   OR NULLIF(d->>'startDate','')::date IS DISTINCT FROM current.start_date OR NULLIF(d->>'endDate','')::date IS DISTINCT FROM current.end_date
   OR d->>'approvalReference'<>current.approval_reference OR target<>current.responsible_membership_id OR matter<>current.matter_id OR case_id IS DISTINCT FROM current.case_id
  THEN RAISE EXCEPTION 'CONTRACT_FIELDS_IMMUTABLE';END IF;
  next_state:=d->>'state';
  IF NOT ((current.state='registered' AND next_state IN ('under_review','cancelled')) OR
   (current.state='under_review' AND next_state IN ('registered','active','cancelled')) OR
   (current.state='active' AND next_state IN ('under_review','closed','cancelled')) OR
   (current.state='closed' AND next_state='active') OR
   (current.state='cancelled' AND next_state='registered'))
  THEN RAISE EXCEPTION 'CONTRACT_TRANSITION_INVALID';END IF;
 END IF;
 rev:=current.revision+1;
 INSERT INTO public.legal_contract_revision(tenant_id,contract_id,revision,state,title,object_text,counterparties,currency,amount_minor,start_date,end_date,approval_reference,responsible_membership_id,responsible_label,matter_id,case_id,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
 VALUES(t,contract,rev,next_state,d->>'title',d->>'object',d->'counterparties',d->>'currency',(d->>'amountMinor')::bigint,NULLIF(d->>'startDate','')::date,NULLIF(d->>'endDate','')::date,d->>'approvalReference',target,candidate->>'label',matter,case_id,d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
 RETURN jsonb_build_object('version','legal-contract-receipt.v1','id',contract,'revision',rev,'state',next_state,'replayed',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'CONTRACT_BUSY';
END $$;

REVOKE ALL ON FUNCTION public.legal_contract_counterparties_valid_v1(jsonb),
 public.legal_contract_validate_payload_v1(jsonb),
 public.legal_contract_record_v1(uuid,uuid,boolean),
 public.legal_contract_operation_v1(jsonb,text,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_contract_operation_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_contract_operation_v1(jsonb,text,jsonb,uuid)
 IS 'Versioned contractual register linked to matter/expediente. Administrative states only; no legal validity, signature, payment or payroll effects';
