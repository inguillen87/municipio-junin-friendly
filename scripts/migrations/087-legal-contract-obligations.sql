-- E5 phase 3b: reviewed contractual obligations and human-observed outcomes.
CREATE TABLE public.legal_contract_obligation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 contract_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,contract_id) REFERENCES public.legal_contract(tenant_id,id)
);

CREATE TABLE public.legal_contract_obligation_event (
 tenant_id uuid NOT NULL,
 obligation_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100),
 contract_id uuid NOT NULL,
 contract_revision integer NOT NULL CHECK(contract_revision BETWEEN 1 AND 100),
 status text NOT NULL CHECK(status IN ('open','fulfilled_observed','breached_observed','waived','cancelled')),
 obligation_type text NOT NULL CHECK(obligation_type IN ('delivery','payment','milestone','guarantee','documentation','service_level','other')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 240 AND title !~ '[<>[:cntrl:]]'),
 description text NOT NULL CHECK(length(description) BETWEEN 5 AND 3000 AND description !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 clause_locator text NOT NULL CHECK(length(clause_locator) BETWEEN 2 AND 180 AND clause_locator !~ '[<>[:cntrl:]]'),
 source_page integer CHECK(source_page IS NULL OR source_page BETWEEN 1 AND 9999),
 due_date date,
 due_basis text NOT NULL CHECK(length(due_basis)<=500 AND due_basis !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 currency text NOT NULL CHECK(currency IN ('NONE','ARS','USD','EUR')),
 amount_minor bigint CHECK(amount_minor IS NULL OR amount_minor BETWEEN 0 AND 999999999999999),
 unit text NOT NULL CHECK(length(unit)<=80 AND unit !~ '[<>[:cntrl:]]'),
 responsible_membership_id uuid NOT NULL,
 responsible_label text NOT NULL CHECK(length(responsible_label) BETWEEN 1 AND 254),
 evidence_case_document_id uuid,
 evidence_note text NOT NULL CHECK(length(evidence_note)<=2000 AND evidence_note !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 decision_note text NOT NULL CHECK(length(decision_note)<=2000 AND decision_note !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),
 request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,obligation_id,sequence),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,obligation_id) REFERENCES public.legal_contract_obligation(tenant_id,id),
 FOREIGN KEY(tenant_id,contract_id,contract_revision) REFERENCES public.legal_contract_revision(tenant_id,contract_id,revision),
 FOREIGN KEY(responsible_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((currency='NONE' AND amount_minor IS NULL) OR (currency<>'NONE' AND amount_minor IS NOT NULL)),
 CHECK((status='open' AND decision_note='') OR (status<>'open' AND length(decision_note)>=5))
);

CREATE INDEX legal_contract_obligation_contract_idx
 ON public.legal_contract_obligation_event(tenant_id,contract_id,status,due_date,recorded_at DESC);

ALTER TABLE public.legal_contract_obligation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_contract_obligation_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_contract_obligation,public.legal_contract_obligation_event
 FROM PUBLIC,municontrol_actions_runtime_app;

CREATE TRIGGER legal_contract_obligation_immutable
 BEFORE UPDATE OR DELETE ON public.legal_contract_obligation
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_contract_obligation_no_truncate
 BEFORE TRUNCATE ON public.legal_contract_obligation
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_contract_obligation_event_immutable
 BEFORE UPDATE OR DELETE ON public.legal_contract_obligation_event
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_contract_obligation_event_no_truncate
 BEFORE TRUNCATE ON public.legal_contract_obligation_event
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

CREATE FUNCTION public.legal_contract_obligation_validate_v1(d jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog,public,pg_temp
AS $$
DECLARE
 due date;
BEGIN
 IF jsonb_typeof(d->'contractId') IS DISTINCT FROM 'string'
  OR d->>'contractId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'contractRevision') IS DISTINCT FROM 'number'
  OR d->>'contractRevision' !~ '^[1-9][0-9]{0,2}$'
  OR jsonb_typeof(d->'obligationType') IS DISTINCT FROM 'string'
  OR d->>'obligationType' NOT IN ('delivery','payment','milestone','guarantee','documentation','service_level','other')
  OR jsonb_typeof(d->'title') IS DISTINCT FROM 'string'
  OR d->>'title'<>btrim(d->>'title')
  OR length(d->>'title') NOT BETWEEN 3 AND 240
  OR d->>'title' ~ '[<>[:cntrl:]]'
  OR jsonb_typeof(d->'description') IS DISTINCT FROM 'string'
  OR d->>'description'<>btrim(d->>'description')
  OR length(d->>'description') NOT BETWEEN 5 AND 3000
  OR d->>'description' ~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'clauseLocator') IS DISTINCT FROM 'string'
  OR d->>'clauseLocator'<>btrim(d->>'clauseLocator')
  OR length(d->>'clauseLocator') NOT BETWEEN 2 AND 180
  OR d->>'clauseLocator' ~ '[<>[:cntrl:]]'
  OR jsonb_typeof(d->'dueBasis') IS DISTINCT FROM 'string'
  OR d->>'dueBasis'<>btrim(d->>'dueBasis')
  OR length(d->>'dueBasis')>500
  OR d->>'dueBasis' ~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'currency') IS DISTINCT FROM 'string'
  OR d->>'currency' NOT IN ('NONE','ARS','USD','EUR')
  OR jsonb_typeof(d->'unit') IS DISTINCT FROM 'string'
  OR d->>'unit'<>btrim(d->>'unit')
  OR length(d->>'unit')>80
  OR d->>'unit' ~ '[<>[:cntrl:]]'
  OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string'
  OR d->>'responsibleId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'evidenceNote') IS DISTINCT FROM 'string'
  OR length(d->>'evidenceNote')>2000
  OR d->>'evidenceNote' ~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string'
  OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500
  OR d->>'reason' ~ '[<>[:cntrl:]]'
 THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 IF d->'sourcePage'<>'null'::jsonb AND (
  jsonb_typeof(d->'sourcePage') IS DISTINCT FROM 'number'
  OR d->>'sourcePage' !~ '^[1-9][0-9]{0,3}$'
  OR (d->>'sourcePage')::int>9999
 ) THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 IF d->'evidenceDocumentId'<>'null'::jsonb AND (
  jsonb_typeof(d->'evidenceDocumentId') IS DISTINCT FROM 'string'
  OR d->>'evidenceDocumentId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 ) THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 IF d->>'currency'='NONE' THEN
  IF d->'amountMinor'<>'null'::jsonb THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;
 ELSE
  IF jsonb_typeof(d->'amountMinor') IS DISTINCT FROM 'number'
   OR d->>'amountMinor' !~ '^[0-9]{1,15}$'
   OR (d->>'amountMinor')::numeric>999999999999999
  THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;
 END IF;

 IF jsonb_typeof(d->'dueDate') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 BEGIN
  IF d->>'dueDate'<>'' THEN
   due:=(d->>'dueDate')::date;
   IF to_char(due,'YYYY-MM-DD')<>d->>'dueDate'
   THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;
  END IF;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID';
 END;
END
$$;

CREATE FUNCTION public.legal_contract_obligation_operation_v1(
 p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
DECLARE
 ctx jsonb;
 t uuid;
 member uuid;
 keys text[];
 contract uuid;
 obligation uuid;
 target uuid;
 candidate jsonb;
 contract_record jsonb;
 contract_case uuid;
 current public.legal_contract_obligation_event%ROWTYPE;
 prior public.legal_contract_obligation_event%ROWTYPE;
 fingerprint text;
 command text;
 seq integer;
 next_status text;
 rows jsonb;
 people jsonb;
 documents jsonb;
 document_id uuid;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));
 t:=(ctx->>'tenantId')::uuid;
 member:=(ctx->>'membershipId')::uuid;

 IF op IS NULL OR op NOT IN ('list','detail','save','attempt')
  OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object'
  OR octet_length(d::text)>16000
 THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;

 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['contractId']
   OR jsonb_typeof(d->'contractId') IS DISTINCT FROM 'string'
   OR d->>'contractId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

  contract:=(d->>'contractId')::uuid;
  contract_record:=public.legal_contract_record_v1(t,contract,false);
  IF contract_record IS NULL THEN RAISE EXCEPTION 'OBLIGATION_CONTRACT_NOT_FOUND'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',q.obligation_id,'sequence',q.sequence,'status',q.status,
   'obligationType',q.obligation_type,'title',q.title,'clauseLocator',q.clause_locator,
   'sourcePage',q.source_page,'dueDate',coalesce(to_char(q.due_date,'YYYY-MM-DD'),''),
   'dueBasis',q.due_basis,'currency',q.currency,'amountMinor',q.amount_minor,'unit',q.unit,
   'responsibleLabel',q.responsible_label,'evidenceDocumentId',q.evidence_case_document_id,
   'evidenceNote',q.evidence_note,'decisionNote',q.decision_note,'recordedAt',q.recorded_at
  ) ORDER BY q.due_date NULLS LAST,q.obligation_id),'[]'::jsonb)
  INTO rows
  FROM (
   SELECT DISTINCT ON(e.obligation_id) e.*
   FROM public.legal_contract_obligation_event e
   WHERE e.tenant_id=t AND e.contract_id=contract
   ORDER BY e.obligation_id,e.sequence DESC
  ) q;

  people:='[]'::jsonb;
  IF (ctx->>'canRegister')::boolean THEN
   SELECT coalesce(jsonb_agg(x.member ORDER BY x.member->>'id'),'[]'::jsonb)
   INTO people
   FROM (
    SELECT public.legal_coordination_member_v1(t,m.id) member
    FROM public.tenant_membership m
    WHERE m.tenant_id=t AND m.status='active'
   ) x
   WHERE x.member IS NOT NULL;
  END IF;

  contract_case:=(contract_record->>'caseId')::uuid;
  documents:='[]'::jsonb;
  IF contract_case IS NOT NULL THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'title',x.title,'version',x.version,'filename',x.filename,'sha256',x.sha256
   ) ORDER BY x.created_at DESC,x.id),'[]'::jsonb)
   INTO documents
   FROM public.legal_case_document x
   WHERE x.tenant_id=t AND x.case_id=contract_case;
  END IF;

  RETURN jsonb_build_object(
   'version','legal-contract-obligation-list.v1',
   'contract',jsonb_build_object(
    'id',contract_record->>'id','number',contract_record->>'number',
    'year',(contract_record->>'year')::int,'revision',(contract_record->>'revision')::int,
    'state',contract_record->>'state','title',contract_record->>'title',
    'caseId',contract_record->'caseId'
   ),
   'canManage',(ctx->>'canRegister')::boolean,
   'candidates',people,'documents',documents,'rows',rows
  );
 END IF;

 IF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id']
   OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
   OR d->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

  obligation:=(d->>'id')::uuid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'sequence',e.sequence,'status',e.status,'obligationType',e.obligation_type,'title',e.title,
   'description',e.description,'clauseLocator',e.clause_locator,'sourcePage',e.source_page,
   'dueDate',coalesce(to_char(e.due_date,'YYYY-MM-DD'),''),
   'dueBasis',e.due_basis,'currency',e.currency,'amountMinor',e.amount_minor,'unit',e.unit,
   'responsibleId',e.responsible_membership_id,'responsibleLabel',e.responsible_label,
   'evidenceDocumentId',e.evidence_case_document_id,'evidenceNote',e.evidence_note,
   'decisionNote',e.decision_note,'reason',e.reason,'recordedBy',e.actor_label,
   'recordedAt',e.recorded_at,'contractId',e.contract_id,'contractRevision',e.contract_revision
  ) ORDER BY e.sequence DESC),'[]'::jsonb)
  INTO rows
  FROM public.legal_contract_obligation_event e
  WHERE e.tenant_id=t AND e.obligation_id=obligation;

  IF jsonb_array_length(rows)=0 THEN RAISE EXCEPTION 'OBLIGATION_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('version','legal-contract-obligation-detail.v1','history',rows);
 END IF;

 IF op IN ('save','attempt') AND (
  k IS NULL OR k::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 ) THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;
  SELECT * INTO prior
  FROM public.legal_contract_obligation_event
  WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'OBLIGATION_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
   'version','legal-contract-obligation-receipt.v1',
   'id',prior.obligation_id,'sequence',prior.sequence,'status',prior.status,'replayed',true
  );
 END IF;

 command:=d->>'command';
 IF command NOT IN ('create','set_status')
 THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 IF current_setting('transaction_isolation')<>'read committed'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-contract-obligation:'||t::text,0))
 THEN RAISE EXCEPTION 'OBLIGATION_BUSY'; END IF;

 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior
 FROM public.legal_contract_obligation_event
 WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;

 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'OBLIGATION_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object(
   'version','legal-contract-obligation-receipt.v1',
   'id',prior.obligation_id,'sequence',prior.sequence,'status',prior.status,'replayed',true
  );
 END IF;

 IF command='create' THEN
  IF keys IS DISTINCT FROM ARRAY[
   'amountMinor','clauseLocator','command','contractId','contractRevision','currency',
   'description','dueBasis','dueDate','evidenceDocumentId','evidenceNote','obligationType',
   'reason','responsibleId','sourcePage','title','unit'
  ] THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

  PERFORM public.legal_contract_obligation_validate_v1(d);

  contract:=(d->>'contractId')::uuid;
  contract_record:=public.legal_contract_record_v1(t,contract,false);
  IF contract_record IS NULL THEN RAISE EXCEPTION 'OBLIGATION_CONTRACT_NOT_FOUND'; END IF;
  IF (contract_record->>'revision')::int<>(d->>'contractRevision')::int
  THEN RAISE EXCEPTION 'OBLIGATION_CONTRACT_VERSION_CONFLICT'; END IF;

  target:=(d->>'responsibleId')::uuid;
  candidate:=public.legal_coordination_member_v1(t,target);
  IF candidate IS NULL THEN RAISE EXCEPTION 'OBLIGATION_MEMBER_UNAVAILABLE'; END IF;

  document_id:=(d->>'evidenceDocumentId')::uuid;
  contract_case:=(contract_record->>'caseId')::uuid;
  IF document_id IS NOT NULL AND (
   contract_case IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.legal_case_document x
    WHERE x.tenant_id=t AND x.case_id=contract_case AND x.id=document_id
   )
  ) THEN RAISE EXCEPTION 'OBLIGATION_DOCUMENT_NOT_FOUND'; END IF;

  IF (SELECT count(*) FROM public.legal_contract_obligation o
      WHERE o.tenant_id=t AND o.contract_id=contract)>=500
  THEN RAISE EXCEPTION 'OBLIGATION_CAPACITY'; END IF;

  INSERT INTO public.legal_contract_obligation(tenant_id,contract_id)
  VALUES(t,contract)
  RETURNING id INTO obligation;

  INSERT INTO public.legal_contract_obligation_event(
   tenant_id,obligation_id,sequence,contract_id,contract_revision,status,obligation_type,
   title,description,clause_locator,source_page,due_date,due_basis,currency,amount_minor,unit,
   responsible_membership_id,responsible_label,evidence_case_document_id,evidence_note,
   decision_note,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256
  ) VALUES(
   t,obligation,1,contract,(d->>'contractRevision')::int,'open',d->>'obligationType',
   d->>'title',d->>'description',d->>'clauseLocator',(d->>'sourcePage')::int,
   NULLIF(d->>'dueDate','')::date,d->>'dueBasis',d->>'currency',(d->>'amountMinor')::bigint,d->>'unit',
   target,candidate->>'label',document_id,d->>'evidenceNote','',d->>'reason',
   member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint
  );

  RETURN jsonb_build_object(
   'version','legal-contract-obligation-receipt.v1',
   'id',obligation,'sequence',1,'status','open','replayed',false
  );
 END IF;

 IF keys IS DISTINCT FROM ARRAY[
  'command','decisionNote','evidenceDocumentId','evidenceNote',
  'expectedSequence','id','reason','status'
 ] THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 IF jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
  OR d->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'expectedSequence') IS DISTINCT FROM 'number'
  OR d->>'expectedSequence' !~ '^[1-9][0-9]{0,2}$'
  OR jsonb_typeof(d->'status') IS DISTINCT FROM 'string'
  OR d->>'status' NOT IN ('open','fulfilled_observed','breached_observed','waived','cancelled')
  OR jsonb_typeof(d->'evidenceNote') IS DISTINCT FROM 'string'
  OR length(d->>'evidenceNote')>2000
  OR d->>'evidenceNote' ~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'decisionNote') IS DISTINCT FROM 'string'
  OR length(d->>'decisionNote')>2000
  OR d->>'decisionNote' ~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string'
  OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500
  OR d->>'reason' ~ '[<>[:cntrl:]]'
  OR (d->'evidenceDocumentId'<>'null'::jsonb AND (
   jsonb_typeof(d->'evidenceDocumentId') IS DISTINCT FROM 'string'
   OR d->>'evidenceDocumentId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  ))
 THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;

 obligation:=(d->>'id')::uuid;
 SELECT * INTO current
 FROM public.legal_contract_obligation_event e
 WHERE e.tenant_id=t AND e.obligation_id=obligation
 ORDER BY e.sequence DESC LIMIT 1;

 IF NOT FOUND THEN RAISE EXCEPTION 'OBLIGATION_NOT_FOUND'; END IF;
 IF current.sequence<>(d->>'expectedSequence')::int
 THEN RAISE EXCEPTION 'OBLIGATION_VERSION_CONFLICT'; END IF;

 next_status:=d->>'status';
 IF next_status=current.status THEN RAISE EXCEPTION 'OBLIGATION_TRANSITION_INVALID'; END IF;
 IF NOT (
  (current.status='open' AND next_status IN ('fulfilled_observed','breached_observed','waived','cancelled'))
  OR (current.status IN ('fulfilled_observed','breached_observed','waived','cancelled') AND next_status='open')
 ) THEN RAISE EXCEPTION 'OBLIGATION_TRANSITION_INVALID'; END IF;

 IF next_status='open' THEN
  IF d->>'decisionNote'<>'' THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;
 ELSE
  IF length(btrim(d->>'decisionNote'))<5 THEN RAISE EXCEPTION 'OBLIGATION_INPUT_INVALID'; END IF;
 END IF;

 document_id:=(d->>'evidenceDocumentId')::uuid;
 contract_record:=public.legal_contract_record_v1(t,current.contract_id,false);
 contract_case:=(contract_record->>'caseId')::uuid;

 IF document_id IS NOT NULL AND (
  contract_case IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.legal_case_document x
   WHERE x.tenant_id=t AND x.case_id=contract_case AND x.id=document_id
  )
 ) THEN RAISE EXCEPTION 'OBLIGATION_DOCUMENT_NOT_FOUND'; END IF;

 seq:=current.sequence+1;
 IF seq>100 THEN RAISE EXCEPTION 'OBLIGATION_CAPACITY'; END IF;

 INSERT INTO public.legal_contract_obligation_event(
  tenant_id,obligation_id,sequence,contract_id,contract_revision,status,obligation_type,
  title,description,clause_locator,source_page,due_date,due_basis,currency,amount_minor,unit,
  responsible_membership_id,responsible_label,evidence_case_document_id,evidence_note,
  decision_note,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256
 ) VALUES(
  t,obligation,seq,current.contract_id,current.contract_revision,next_status,current.obligation_type,
  current.title,current.description,current.clause_locator,current.source_page,current.due_date,current.due_basis,
  current.currency,current.amount_minor,current.unit,current.responsible_membership_id,current.responsible_label,
  document_id,d->>'evidenceNote',d->>'decisionNote',d->>'reason',
  member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint
 );

 RETURN jsonb_build_object(
  'version','legal-contract-obligation-receipt.v1',
  'id',obligation,'sequence',seq,'status',next_status,'replayed',false
 );
EXCEPTION
 WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'OBLIGATION_BUSY';
END
$$;

REVOKE ALL ON FUNCTION
 public.legal_contract_obligation_validate_v1(jsonb),
 public.legal_contract_obligation_operation_v1(jsonb,text,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_contract_obligation_operation_v1(jsonb,text,jsonb,uuid)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_contract_obligation_operation_v1(jsonb,text,jsonb,uuid)
 IS 'Reviewed obligations linked to an exact contract revision. Due dates are manually reviewed; outcomes are human-observed administrative states, not automatic legal conclusions';
