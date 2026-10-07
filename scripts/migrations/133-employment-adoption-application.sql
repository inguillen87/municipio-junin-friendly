-- PRIVATE DRAFT: not an installation/release protocol. No runtime/API grant.
-- Consumer adapters (historical detail, stored subjects, lifecycle and payroll)
-- must be completed before installation or operator activation. Synthetic QA only.
DO $$ BEGIN
 IF to_regprocedure('public.employment_adoption_propose_v1(jsonb,jsonb,uuid)') IS NULL
 OR to_regprocedure('public.grh_effective_baseline_guard_v1()') IS NULL
 OR to_regprocedure('public.native_employment_change_context_v1(jsonb,text)') IS NULL
 OR to_regprocedure('public.native_employee_contract_guard_v1()') IS NULL
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_PREREQUISITE'; END IF;
END $$;

CREATE TABLE public.employment_adoption_seal(
 proposal_id uuid PRIMARY KEY REFERENCES public.employment_adoption_proposal(id),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='array' AND jsonb_array_length(facts) BETWEEN 1 AND 10000 AND octet_length(facts::text)<=25165824),
 facts_sha256 text NOT NULL CHECK(facts_sha256~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.employment_adoption_decision(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid NOT NULL UNIQUE REFERENCES public.employment_adoption_seal(proposal_id),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),request_key uuid NOT NULL,
 body jsonb NOT NULL,body_sha256 text NOT NULL CHECK(body_sha256~'^[a-f0-9]{64}$'),
 decision text NOT NULL CHECK(decision IN('approve','reject')),applied_xid xid8,
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((decision='approve')=(applied_xid IS NOT NULL)),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.employment_adoption_application(
 contract_id uuid PRIMARY KEY REFERENCES public.employment_contract(id),decision_id uuid NOT NULL REFERENCES public.employment_adoption_decision(id),
 registration_id uuid NOT NULL UNIQUE REFERENCES public.native_employee_registration(id),
 before_contract jsonb NOT NULL CHECK(jsonb_typeof(before_contract)='object'),after_contract jsonb NOT NULL CHECK(jsonb_typeof(after_contract)='object'),
 before_person jsonb NOT NULL CHECK(jsonb_typeof(before_person)='object'),applied_xid xid8 NOT NULL
);
ALTER TABLE public.employment_adoption_seal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_adoption_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_adoption_application ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employment_adoption_seal,public.employment_adoption_decision,public.employment_adoption_application FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER employment_adoption_seal_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.employment_adoption_seal FOR EACH STATEMENT EXECUTE FUNCTION public.employment_adoption_immutable_v1();
CREATE TRIGGER employment_adoption_decision_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.employment_adoption_decision FOR EACH STATEMENT EXECUTE FUNCTION public.employment_adoption_immutable_v1();
CREATE TRIGGER employment_adoption_application_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.employment_adoption_application FOR EACH STATEMENT EXECUTE FUNCTION public.employment_adoption_immutable_v1();

-- Complete canonical/person evidence, selected exclusively by the reviewed UUIDs.
-- This is private evidence, never a browser/API payload or an identity resolver.
CREATE FUNCTION public.employment_adoption_facts_v1(r public.employment_adoption_proposal) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE facts jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('contract',to_jsonb(c),'person',to_jsonb(p)) ORDER BY x.n) INTO facts
 FROM jsonb_array_elements(r.body->'rows') WITH ORDINALITY x(v,n)
 JOIN public.employment_contract c ON c.id=(x.v->>'contractId')::uuid
 JOIN public.person_identity p ON p.id=c.person_id;
 IF facts IS NULL OR jsonb_array_length(facts)<>r.total OR octet_length(facts::text)>25165824 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT'; END IF;
 RETURN facts;
END $$;
CREATE FUNCTION public.employment_adoption_seal_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE facts jsonb;
BEGIN
 facts:=public.employment_adoption_facts_v1(NEW);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(facts) f WHERE f#>>'{contract,source_system}'<>'GRH' OR f#>>'{contract,tenant_id}' IS NOT NULL)
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'; END IF;
 IF pg_total_relation_size('public.employment_adoption_seal')+octet_length(facts::text)>67108864 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT'; END IF;
 INSERT INTO public.employment_adoption_seal(proposal_id,facts,facts_sha256) VALUES(NEW.id,facts,public.employment_adoption_hash_v1(facts));
 RETURN NEW;
END $$;
CREATE TRIGGER employment_adoption_seal_new AFTER INSERT ON public.employment_adoption_proposal FOR EACH ROW EXECUTE FUNCTION public.employment_adoption_seal_v1();

-- Preserve the explicitly linked reviewer through its own contract adoption.
-- The shared session/permission guard is unchanged. No link or permission is
-- created; this private bridge accepts only an already approved adoption.
CREATE FUNCTION public.employment_adoption_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;contract_value uuid;person_value uuid;actor_label text;
BEGIN
 ctx:=public.native_employee_context_v1(p);
 IF NOT public.action_center_context_has_capability(ctx,'employee.record.approve') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN'; END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN
  SELECT c.id,c.person_id INTO contract_value,person_value FROM public.tenant_action_employment_link l
  JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.status='active' AND c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  JOIN public.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=l.tenant_id AND n.source_binding_id=l.source_binding_id AND n.id::text=c.source_payload#>>'{native,registrationId}'
  JOIN public.employment_adoption_application a ON a.contract_id=c.id AND a.registration_id=n.id AND a.before_person->>'id'=c.person_id::text
  JOIN public.employment_adoption_decision d ON d.id=a.decision_id AND d.decision='approve' AND d.tenant_id=l.tenant_id AND d.source_binding_id=l.source_binding_id
  WHERE l.active AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
  FOR SHARE OF l,c,n,a,d;
  IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_EMPLOYMENT_REQUIRED'; END IF;
  ctx:=ctx||jsonb_build_object('employmentContractId',contract_value,'actorPersonId',person_value);
 END IF;
 SELECT full_name INTO actor_label FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid;
 RETURN ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
END $$;

CREATE FUNCTION public.employment_adoption_independent_v1(ctx jsonb,r public.employment_adoption_proposal) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce((ctx->>'tenantId')::uuid=r.tenant_id AND (ctx->>'sourceBindingId')::uuid=r.source_binding_id
 AND (ctx->>'membershipId')::uuid<>r.actor_membership_id AND (ctx->>'actorPersonId')::uuid<>r.actor_person_id
 AND lower(btrim(ctx->>'actorEmail'))<>r.actor_email,false)
$$;
CREATE FUNCTION public.employment_adoption_decision_version_v1(r public.employment_adoption_proposal,s public.employment_adoption_seal) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.employment_adoption_hash_v1(jsonb_build_object('proposalVersion',r.proposal_version,'factsSha256',s.facts_sha256,'sourceContextVersion',r.body->>'sourceContextVersion','catalogVersion',r.body->>'catalogVersion'))
$$;
CREATE FUNCTION public.employment_adoption_decision_source_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;r public.employment_adoption_proposal;s public.employment_adoption_seal;
BEGIN
 ctx:=public.employment_adoption_context_v1(p);
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_NOT_FOUND'; END IF;
 IF NOT public.employment_adoption_independent_v1(ctx,r) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELF_REVIEW'; END IF;
 SELECT * INTO s FROM public.employment_adoption_seal WHERE proposal_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_UNSEALED'; END IF;
 RETURN jsonb_build_object('version','employment-adoption-decision.v1','reviewVersion',public.employment_adoption_decision_version_v1(r,s),
 'proposal',(public.employment_adoption_envelope_v1(r,true))->'receipt','body',r.body,'rawReview',r.before_snapshot,'applicationAvailable',false);
END $$;

-- Only an exact, approved application in this transaction authorizes ownership.
-- No dates, legajo, person, salary facts or business classifications may be changed.
CREATE FUNCTION public.employment_adoption_update_allowed_v1(before_row public.employment_contract,after_row public.employment_contract) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT before_row.source_system='GRH' AND before_row.tenant_id IS NULL AND before_row.source_batch_id IS NOT NULL
 AND after_row.source_system='MUNICONTROL' AND after_row.source_batch_id IS NULL AND after_row.tenant_id IS NOT NULL
 AND (to_jsonb(before_row)-ARRAY['source_system','source_batch_id','tenant_id','jurisdiction_code','source_payload'])=(to_jsonb(after_row)-ARRAY['source_system','source_batch_id','tenant_id','jurisdiction_code','source_payload'])
 AND before_row.source_payload=after_row.source_payload-'native' AND NOT before_row.source_payload ? 'native'
 AND (before_row.jurisdiction_code IS NULL OR before_row.jurisdiction_code=after_row.jurisdiction_code)
 AND after_row.jurisdiction_code IN('42','55')
 AND EXISTS(SELECT 1 FROM public.employment_adoption_application a
 JOIN public.employment_adoption_decision d ON d.id=a.decision_id AND d.decision='approve' AND d.applied_xid=a.applied_xid
 JOIN public.employment_adoption_proposal r ON r.id=d.proposal_id AND r.tenant_id=d.tenant_id AND r.source_binding_id=d.source_binding_id
 JOIN public.employment_adoption_seal s ON s.proposal_id=r.id
 JOIN public.native_employee_registration n ON n.id=a.registration_id AND n.contract_id=a.contract_id AND n.person_id=before_row.person_id AND n.tenant_id=d.tenant_id AND n.source_binding_id=d.source_binding_id
 WHERE a.contract_id=before_row.id AND a.applied_xid=pg_current_xact_id_if_assigned() AND a.before_contract=to_jsonb(before_row) AND a.after_contract=to_jsonb(after_row)
 AND after_row.tenant_id=d.tenant_id AND after_row.source_payload#>>'{native,registrationId}'=n.id::text
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.facts) f WHERE f->'contract'=a.before_contract AND f->'person'=a.before_person)
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'rows') x WHERE x->>'contractId'=a.contract_id::text AND x->>'jurisdictionCode'=after_row.jurisdiction_code))
$$;
CREATE FUNCTION public.employment_adoption_application_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c public.employment_contract;i jsonb;
BEGIN
 SELECT * INTO c FROM public.employment_contract WHERE id=NEW.contract_id;
 SELECT to_jsonb(p) INTO i FROM public.person_identity p WHERE id=c.person_id;
 IF NEW.applied_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() OR i IS DISTINCT FROM NEW.before_person
 OR (TG_WHEN='BEFORE' AND to_jsonb(c) IS DISTINCT FROM NEW.before_contract)
 OR (TG_WHEN='AFTER' AND to_jsonb(c) IS DISTINCT FROM NEW.after_contract)
 OR NOT public.employment_adoption_update_allowed_v1(jsonb_populate_record(NULL::public.employment_contract,NEW.before_contract),jsonb_populate_record(NULL::public.employment_contract,NEW.after_contract))
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_APPLY_FAILED'; END IF;
 RETURN NEW;
END $$;
-- The allow predicate needs the inserted immutable application; therefore its
-- full verification is deferred, while the BEFORE guard checks current facts.
CREATE FUNCTION public.employment_adoption_application_before_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb;i jsonb;
BEGIN
 SELECT to_jsonb(ec),to_jsonb(pi) INTO c,i FROM public.employment_contract ec JOIN public.person_identity pi ON pi.id=ec.person_id WHERE ec.id=NEW.contract_id;
 IF NEW.applied_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() OR c IS DISTINCT FROM NEW.before_contract OR i IS DISTINCT FROM NEW.before_person THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_APPLY_FAILED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employment_adoption_application_before BEFORE INSERT ON public.employment_adoption_application FOR EACH ROW EXECUTE FUNCTION public.employment_adoption_application_before_v1();
CREATE CONSTRAINT TRIGGER employment_adoption_application_applied AFTER INSERT ON public.employment_adoption_application DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.employment_adoption_application_guard_v1();
CREATE FUNCTION public.employment_adoption_decision_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE r public.employment_adoption_proposal;n integer;
BEGIN
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=NEW.proposal_id;
 SELECT count(*) INTO n FROM public.employment_adoption_application WHERE decision_id=NEW.id;
 IF NEW.tenant_id IS DISTINCT FROM r.tenant_id OR NEW.source_binding_id IS DISTINCT FROM r.source_binding_id
 OR NEW.actor_membership_id=r.actor_membership_id OR NEW.actor_person_id=r.actor_person_id OR NEW.actor_email=r.actor_email
 OR (NEW.decision='approve' AND (NEW.applied_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() OR n<>r.total))
 OR (NEW.decision='reject' AND n<>0) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_APPLY_FAILED'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER employment_adoption_decision_applied AFTER INSERT ON public.employment_adoption_decision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.employment_adoption_decision_guard_v1();

CREATE FUNCTION public.employment_adoption_decide_v1(p jsonb,input jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;r public.employment_adoption_proposal;s public.employment_adoption_seal;d public.employment_adoption_decision;
 review_value jsonb;raw jsonb;catalog jsonb;facts jsonb;f jsonb;old_contract jsonb;new_contract jsonb;entry jsonb;fingerprint text;receipt_value jsonb;
 decision_id uuid:=gen_random_uuid();registration_id uuid;decided_at timestamptz:=clock_timestamp();field text;changed integer;
BEGIN
 ctx:=public.employment_adoption_context_v1(p);
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR jsonb_typeof(input) IS DISTINCT FROM 'object' OR octet_length(input::text)>8192
 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(input) key) IS DISTINCT FROM ARRAY['review','reviewVersion']::text[]
 OR jsonb_typeof(input->'reviewVersion') IS DISTINCT FROM 'string' OR input->>'reviewVersion'!~'^[a-f0-9]{64}$'
 OR jsonb_typeof(input->'review') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID'; END IF;
 review_value:=input->'review';
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(review_value) key) IS DISTINCT FROM ARRAY['catalogVersion','decision','proposalId','proposalVersion','reason','sourceContextVersion']::text[] THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID'; END IF;
 FOREACH field IN ARRAY ARRAY['catalogVersion','decision','proposalId','proposalVersion','reason','sourceContextVersion'] LOOP
  IF jsonb_typeof(review_value->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID'; END IF;
 END LOOP;
 IF review_value->>'proposalId'!~'^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' OR review_value->>'decision' NOT IN('approve','reject')
 OR review_value->>'catalogVersion'!~'^[a-f0-9]{64}$' OR review_value->>'proposalVersion'!~'^[a-f0-9]{64}$' OR review_value->>'sourceContextVersion'!~'^[a-f0-9]{64}$'
 OR length(review_value->>'reason') NOT BETWEEN 10 AND 1000 OR review_value->>'reason'<>btrim(review_value->>'reason') OR review_value->>'reason'~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('employment-adoption:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY'; END IF;
 fingerprint:=public.employment_adoption_hash_v1(input);
 SELECT * INTO d FROM public.employment_adoption_decision WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF FOUND THEN
  IF d.body IS DISTINCT FROM input OR d.body_sha256<>fingerprint OR d.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR d.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE'; END IF;
  RETURN d.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=(review_value->>'proposalId')::uuid AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_NOT_FOUND'; END IF;
 IF NOT public.employment_adoption_independent_v1(ctx,r) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELF_REVIEW'; END IF;
 IF EXISTS(SELECT 1 FROM public.employment_adoption_decision WHERE proposal_id=r.id) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_ALREADY_DECIDED'; END IF;
 SELECT * INTO s FROM public.employment_adoption_seal WHERE proposal_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_UNSEALED'; END IF;
 IF review_value->>'proposalVersion'<>r.proposal_version OR review_value->>'sourceContextVersion'<>r.body->>'sourceContextVersion'
 OR review_value->>'catalogVersion'<>r.body->>'catalogVersion' OR input->>'reviewVersion'<>public.employment_adoption_decision_version_v1(r,s) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'; END IF;
 IF review_value->>'decision'='approve' THEN
  PERFORM public.native_employment_catalog_lock_v1(ctx);PERFORM public.grh_curated_source_read_lock_v1();
  LOCK TABLE public.employment_contract,public.person_identity,public.native_employee_registration IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  LOCK TABLE public.source_import_batch,public.grh_effective_source_binding,public.grh_core_source_version,public.grh_curated_source_version IN SHARE MODE NOWAIT;
  raw:=public.employment_adoption_source_v1(p);
  -- Reader authority remains the independent reviewer. Only the hash namespace
  -- uses the frozen author's scope; no creator session is impersonated/reused.
  raw:=jsonb_set(raw,'{scope,membershipId}',to_jsonb(r.actor_membership_id::text));
  IF raw-'queriedAt'-'today' IS DISTINCT FROM r.before_snapshot-'queriedAt'-'today' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED'; END IF;
  catalog:=public.native_employee_catalog_v1(ctx);
  IF catalog->>'version' IS DISTINCT FROM r.body->>'catalogVersion' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_CATALOG_CHANGED'; END IF;
  facts:=public.employment_adoption_facts_v1(r);
  IF facts IS DISTINCT FROM s.facts OR public.employment_adoption_hash_v1(facts)<>s.facts_sha256 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(facts) x WHERE jsonb_typeof(x#>'{contract,source_payload}') IS DISTINCT FROM 'object' OR x#>'{contract,source_payload}' ? 'native')
  OR EXISTS(SELECT 1 FROM public.native_employee_registration n JOIN jsonb_array_elements(r.body->'rows') x ON n.contract_id=(x->>'contractId')::uuid) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_ORIGIN_INVALID'; END IF;
 END IF;
 -- Recheck current authority at the transaction's persistence boundary.
 PERFORM public.employment_adoption_context_v1(p);
 receipt_value:=jsonb_build_object('version','employment-adoption.v1','operation','review','proposalId',r.id,'proposalVersion',r.proposal_version,
 'sourceContextVersion',r.body->>'sourceContextVersion','catalogVersion',r.body->>'catalogVersion','status',CASE WHEN review_value->>'decision'='approve' THEN 'approved' ELSE 'rejected' END,
 'total',r.total,'replayed',false,'decidedAt',decided_at,'effects',jsonb_build_object('identitiesCreated',0,'contractsCreated',0,'contractsAdopted',CASE WHEN review_value->>'decision'='approve' THEN r.total ELSE 0 END,
 'sourceHistoryRetained',true,'payrollCalculated',false,'payrollPosted',false,'paymentsExecuted',false));
 INSERT INTO public.employment_adoption_decision(id,proposal_id,tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,decision,applied_xid,receipt)
 VALUES(decision_id,r.id,r.tenant_id,r.source_binding_id,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',k,input,fingerprint,review_value->>'decision',CASE WHEN review_value->>'decision'='approve' THEN pg_current_xact_id() END,receipt_value);
 IF review_value->>'decision'='approve' THEN
  FOR f,entry IN SELECT x.v,(r.body->'rows')->(x.n::integer-1) FROM jsonb_array_elements(facts) WITH ORDINALITY x(v,n) LOOP
   old_contract:=f->'contract';registration_id:=gen_random_uuid();
   new_contract:=old_contract||jsonb_build_object('source_system','MUNICONTROL','source_batch_id',NULL,'tenant_id',r.tenant_id,'jurisdiction_code',entry->>'jurisdictionCode',
    'source_payload',(old_contract->'source_payload')||jsonb_build_object('native',jsonb_build_object('registrationId',registration_id,'adoptionProposalId',r.id,'adoptionReviewId',decision_id,'origin','GRH','adoptedAt',decided_at)));
   INSERT INTO public.native_employee_registration(id,tenant_id,source_binding_id,contract_id,person_id,actor_membership_id,actor_session_id,release_sha,request_key,request_sha256,catalog_sha256,legal_reference)
   VALUES(registration_id,r.tenant_id,r.source_binding_id,(old_contract->>'id')::uuid,(old_contract->>'person_id')::uuid,(ctx->>'membershipId')::uuid,(p->>'actorSessionId')::uuid,p->>'releaseSha',gen_random_uuid(),public.employment_adoption_hash_v1(jsonb_build_object('decisionId',decision_id,'before',old_contract,'after',new_contract)),r.body->>'catalogVersion',r.body->>'legalReference');
   INSERT INTO public.employment_adoption_application(contract_id,decision_id,registration_id,before_contract,after_contract,before_person,applied_xid)
   VALUES((old_contract->>'id')::uuid,decision_id,registration_id,old_contract,new_contract,f->'person',pg_current_xact_id());
   UPDATE public.employment_contract SET source_system='MUNICONTROL',source_batch_id=NULL,tenant_id=r.tenant_id,jurisdiction_code=entry->>'jurisdictionCode',source_payload=new_contract->'source_payload' WHERE id=(old_contract->>'id')::uuid;
   GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_APPLY_FAILED'; END IF;
  END LOOP;
 END IF;
 PERFORM public.employment_adoption_context_v1(p);
 -- Evaluate deferred conservation guards before returning a success receipt.
 SET CONSTRAINTS employment_adoption_application_applied,employment_adoption_decision_applied IMMEDIATE;
 SET CONSTRAINTS employment_adoption_application_applied,employment_adoption_decision_applied DEFERRED;
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY'; END $$;

-- Modify only the exact reviewed baseline guard, preserving every old check.
DO $patch$ DECLARE d text;anchor text:=' IF TG_TABLE_NAME=''employment_contract'' THEN';BEGIN
 SELECT pg_get_functiondef('public.grh_effective_baseline_guard_v1()'::regprocedure) INTO d;
 IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.grh_effective_baseline_guard_v1()'::regprocedure),E'\r\n',E'\n'))<>'2bbe4b9bddb0e579c8fb4afd36b86dbc'
 OR length(d)-length(replace(d,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_PREREQUISITE'; END IF;
 d:=replace(d,anchor,anchor||E'\n  IF TG_OP=''UPDATE'' AND public.employment_adoption_update_allowed_v1(OLD,NEW) IS TRUE THEN RETURN NEW; END IF;');
 EXECUTE d;
END $patch$;
REVOKE ALL ON FUNCTION public.employment_adoption_facts_v1(public.employment_adoption_proposal),public.employment_adoption_seal_v1(),
 public.employment_adoption_context_v1(jsonb),
 public.employment_adoption_independent_v1(jsonb,public.employment_adoption_proposal),public.employment_adoption_decision_version_v1(public.employment_adoption_proposal,public.employment_adoption_seal),
 public.employment_adoption_decision_source_v1(jsonb,uuid),public.employment_adoption_update_allowed_v1(public.employment_contract,public.employment_contract),
 public.employment_adoption_application_guard_v1(),public.employment_adoption_application_before_v1(),public.employment_adoption_decision_guard_v1(),public.employment_adoption_decide_v1(jsonb,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
