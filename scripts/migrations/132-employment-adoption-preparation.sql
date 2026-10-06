-- Preparation only. Approval/application and consumer adaptations are separate,
-- unfinished work. No canonical contract, identity, source or payroll is changed.
DO $$ BEGIN
 IF to_regprocedure('public.native_employee_context_v1(jsonb,boolean)') IS NULL
 OR to_regprocedure('public.native_employment_change_context_v1(jsonb,text)') IS NULL
 OR to_regprocedure('public.native_employee_catalog_v1(jsonb)') IS NULL
 OR to_regprocedure('public.native_salary_serialized_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_PREREQUISITE'; END IF;
END $$;
CREATE TABLE public.employment_adoption_proposal(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL,actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),body_sha256 text NOT NULL CHECK(body_sha256~'^[a-f0-9]{64}$'),
 before_snapshot jsonb NOT NULL CHECK(jsonb_typeof(before_snapshot)='object'),
 proposal_version text NOT NULL CHECK(proposal_version~'^[a-f0-9]{64}$'),total integer NOT NULL CHECK(total BETWEEN 1 AND 10000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(body::text)+octet_length(before_snapshot::text)<=8388608),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
ALTER TABLE public.employment_adoption_proposal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employment_adoption_proposal FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.employment_adoption_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IMMUTABLE';END $$;
CREATE TRIGGER employment_adoption_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.employment_adoption_proposal FOR EACH STATEMENT EXECUTE FUNCTION public.employment_adoption_immutable_v1();
CREATE FUNCTION public.employment_adoption_hash_v1(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT encode(public.digest(public.native_salary_serialized_v1(v),'sha256'),'hex') $$;
CREATE FUNCTION public.employment_adoption_source_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE value jsonb; item record; n integer:=0;
BEGIN
 FOR item IN
 WITH authority AS MATERIALIZED (SELECT public.native_employee_context_v1(p) AS ctx),
selected AS MATERIALIZED (
 SELECT a.ctx,b.source_batch_id,b.source_version_id,b.publication_sha256,c.baseline_batch_id AS core_baseline,
 c.source_sha256,c.manifest_sha256,c.source_cutoff,v.id AS curated_id,v.baseline_batch_id AS curated_baseline,v.manifest_sha256 AS curated_manifest
 FROM authority a JOIN public.grh_effective_source_binding b ON b.tenant_id=(a.ctx->>'tenantId')::uuid AND b.source_binding_id=(a.ctx->>'sourceBindingId')::uuid
 JOIN public.grh_core_source_version c ON c.id=b.source_version_id AND c.tenant_id=b.tenant_id AND c.source_binding_id=b.source_binding_id AND c.source_company_id=(a.ctx->>'sourceCompanyId')::bigint
 JOIN public.grh_curated_source_version v ON v.core_version_id=c.id AND v.tenant_id=b.tenant_id AND v.source_binding_id=b.source_binding_id AND v.source_batch_id=b.source_batch_id AND v.import_run_id=b.import_run_id
), cohort AS MATERIALIZED (
 SELECT c.*,count(*) FILTER(WHERE c.status='active') OVER(PARTITION BY c.person_id) AS active_person_contracts
 FROM public.employment_contract c JOIN selected s ON c.legacy_company_id=(s.ctx->>'sourceCompanyId')::bigint
 AND c.source_system='GRH' AND c.tenant_id IS NULL AND c.source_batch_id IN(s.source_batch_id,s.core_baseline,s.curated_baseline)
), numbered AS MATERIALIZED (
 SELECT row_number() OVER(ORDER BY c.id) AS "rowNumber",c.id::text AS "contractId",c.legacy_legajo AS legajo,p.full_name AS name,c.status,
 to_char(c.start_date,'YYYY-MM-DD') AS "startDate",to_char(c.end_date,'YYYY-MM-DD') AS "endDate",c.agreement_code AS "agreementCode",c.category_code AS "categoryCode",
 c.organization_unit_source_id AS "organizationId",c.sector_source_id AS "sectorCode",c.jurisdiction_code AS "jurisdictionCode",c.active_person_contracts AS "activeContractsForPerson"
 FROM cohort c LEFT JOIN public.person_identity p ON p.id=c.person_id
), limited AS (SELECT * FROM numbered ORDER BY "rowNumber" LIMIT 10001)
SELECT jsonb_build_object('scope',jsonb_build_object('tenantId',s.ctx->>'tenantId','membershipId',s.ctx->>'membershipId','bindingId',s.ctx->>'sourceBindingId','companyId',(s.ctx->>'sourceCompanyId')::bigint),
 'source',jsonb_build_object('coreVersionId',s.source_version_id,'curatedVersionId',s.curated_id,'sourceBatchId',s.source_batch_id,'coreBaselineBatchId',s.core_baseline,'curatedBaselineBatchId',s.curated_baseline,
 'sourceSha256',s.source_sha256,'coreManifestSha256',s.manifest_sha256,'curatedManifestSha256',s.curated_manifest,'publicationSha256',s.publication_sha256,'cutoff',to_char(s.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS')),
 'today',to_char((statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date,'YYYY-MM-DD'),'queriedAt',statement_timestamp(),
 'total',(SELECT count(*) FROM cohort),'rows',COALESCE((SELECT jsonb_agg(to_jsonb(limited) ORDER BY "rowNumber") FROM limited),'[]'::jsonb)) AS result FROM selected s
 LOOP n:=n+1;IF n>1 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;value:=item.result;END LOOP;
 IF n<>1 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 IF (value->>'total')::integer>10000 OR octet_length(value::text)>6000000 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 IF (value->>'total')::integer<>jsonb_array_length(value->'rows') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 RETURN value;
END $$;
CREATE FUNCTION public.employment_adoption_envelope_v1(r public.employment_adoption_proposal,replayed boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('version','employment-adoption-preparation.v1','requestKey',r.request_key,'bodySha256',r.body_sha256,'applicationAvailable',false,
 'receipt',jsonb_build_object('version','employment-adoption.v1','operation','propose','proposalId',r.id,'proposalVersion',r.proposal_version,
 'sourceContextVersion',r.body->>'sourceContextVersion','catalogVersion',r.body->>'catalogVersion','status','pending','total',r.total,'replayed',replayed,'decidedAt',NULL,
 'effects',jsonb_build_object('identitiesCreated',0,'contractsCreated',0,'contractsAdopted',0,'sourceHistoryRetained',true,'payrollCalculated',false,'payrollPosted',false,'paymentsExecuted',false)))
$$;
CREATE FUNCTION public.employment_adoption_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;catalog jsonb;raw jsonb;attempts jsonb;
BEGIN
 ctx:=public.native_employee_context_v1(p);raw:=public.employment_adoption_source_v1(p);catalog:=public.native_employee_catalog_v1(ctx);
 SELECT coalesce(jsonb_agg(public.employment_adoption_envelope_v1(r,true) ORDER BY r.created_at DESC,r.id),'[]') INTO attempts FROM public.employment_adoption_proposal r
 WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.actor_membership_id=(ctx->>'membershipId')::uuid;
 IF jsonb_array_length(attempts)>500 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 RETURN jsonb_build_object('version','employment-adoption-preparation.v1','rawReview',raw,'catalogVersion',catalog->>'version',
 'canPrepare',public.action_center_context_has_capability(ctx,'employee.record.propose') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL,
 'applicationAvailable',false,'attempts',attempts);
END $$;
CREATE FUNCTION public.employment_adoption_attempt_v1(p jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;r public.employment_adoption_proposal;
BEGIN ctx:=public.native_employee_context_v1(p);
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF NOT FOUND OR r.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR r.actor_email IS DISTINCT FROM lower(p->>'actorEmail') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_NOT_FOUND';END IF;
 RETURN public.employment_adoption_envelope_v1(r,true);
END $$;
CREATE FUNCTION public.employment_adoption_propose_v1(p jsonb,body_value jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;raw jsonb;catalog jsonb;source_version text;selection_version text;versions jsonb;field text;fingerprint text;r public.employment_adoption_proposal;proposal_id uuid:=gen_random_uuid();version_value text;
BEGIN
 ctx:=public.native_employment_change_context_v1(p,'employee.record.propose');
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR jsonb_typeof(body_value) IS DISTINCT FROM 'object' OR octet_length(body_value::text)>2097152
 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(body_value) key) IS DISTINCT FROM ARRAY['catalogVersion','legalReference','reason','rows','selectionVersion','sourceContextVersion']::text[] THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['catalogVersion','selectionVersion','sourceContextVersion','legalReference','reason'] LOOP
  IF jsonb_typeof(body_value->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 END LOOP;
 IF body_value->>'catalogVersion'!~'^[a-f0-9]{64}$' OR body_value->>'selectionVersion'!~'^[a-f0-9]{64}$' OR body_value->>'sourceContextVersion'!~'^[a-f0-9]{64}$'
 OR length(body_value->>'legalReference') NOT BETWEEN 3 AND 180 OR length(body_value->>'reason') NOT BETWEEN 10 AND 1000
 OR body_value->>'legalReference'<>btrim(body_value->>'legalReference') OR body_value->>'reason'<>btrim(body_value->>'reason')
 OR body_value->>'legalReference'~'[<>[:cntrl:]]' OR body_value->>'reason'~'[<>[:cntrl:]]'
 OR jsonb_typeof(body_value->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 IF jsonb_array_length(body_value->'rows') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(body_value->'rows') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(body_value->'rows') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'object'
 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) key) IS DISTINCT FROM ARRAY['contractId','contractVersion','jurisdictionCode']::text[]
 OR jsonb_typeof(v->'contractId') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'contractVersion') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'jurisdictionCode') IS DISTINCT FROM 'string'
 OR v->>'contractId'!~'^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' OR v->>'contractVersion'!~'^[a-f0-9]{64}$' OR v->>'jurisdictionCode' NOT IN('42','55'))
 OR (SELECT count(*)<>count(DISTINCT lower(v->>'contractId')) FROM jsonb_array_elements(body_value->'rows') v) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 PERFORM public.native_employment_catalog_lock_v1(ctx);PERFORM public.grh_curated_source_read_lock_v1();
 IF NOT pg_try_advisory_xact_lock(hashtextextended('employment-adoption:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY';END IF;
 fingerprint:=public.employment_adoption_hash_v1(body_value);
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF FOUND THEN IF r.body IS DISTINCT FROM body_value OR r.body_sha256<>fingerprint OR r.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR r.actor_email IS DISTINCT FROM lower(p->>'actorEmail') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE';END IF;RETURN public.employment_adoption_envelope_v1(r,true);END IF;
 LOCK TABLE public.employment_contract,public.person_identity,public.source_import_batch,public.grh_effective_source_binding,public.grh_core_source_version,public.grh_curated_source_version IN SHARE MODE NOWAIT;
 raw:=public.employment_adoption_source_v1(p);catalog:=public.native_employee_catalog_v1(ctx);
 source_version:=public.employment_adoption_hash_v1(jsonb_build_object('scope',raw->'scope','source',raw->'source'));
 IF body_value->>'sourceContextVersion'<>source_version THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 IF body_value->>'catalogVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_CATALOG_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',v->>'contractId','contractVersion',public.employment_adoption_hash_v1(jsonb_build_object('sourceContextVersion',source_version,'row',v))) ORDER BY n),'[]') INTO versions FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY x(v,n);
 selection_version:=public.employment_adoption_hash_v1(versions);
 IF body_value->>'selectionVersion'<>selection_version OR jsonb_array_length(body_value->'rows')<>(raw->>'total')::integer
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(body_value->'rows') WITH ORDINALITY x(v,n) WHERE v->>'contractId' IS DISTINCT FROM versions->(n::integer-1)->>'contractId' OR v->>'contractVersion' IS DISTINCT FROM versions->(n::integer-1)->>'contractVersion'
 OR raw#>>ARRAY['rows',(n-1)::text,'jurisdictionCode'] IS NOT NULL AND v->>'jurisdictionCode' IS DISTINCT FROM raw#>>ARRAY['rows',(n-1)::text,'jurisdictionCode']) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 IF (SELECT count(*) FROM public.employment_adoption_proposal WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)>=500
 OR pg_total_relation_size('public.employment_adoption_proposal')+octet_length(raw::text)+octet_length(body_value::text)>67108864 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 -- Revalidate authority at persistence, while selection/source/catalog locks hold.
 PERFORM public.native_employment_change_context_v1(p,'employee.record.propose');
 version_value:=public.employment_adoption_hash_v1(jsonb_build_object('proposalId',proposal_id,'body',body_value,'beforeSnapshot',raw-'queriedAt','actorPersonId',ctx->>'actorPersonId'));
 INSERT INTO public.employment_adoption_proposal(id,tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_session_id,actor_session_version,actor_email,release_sha,request_key,body,body_sha256,before_snapshot,proposal_version,total)
 VALUES(proposal_id,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,lower(p->>'actorEmail'),p->>'releaseSha',k,body_value,fingerprint,raw,version_value,(raw->>'total')::integer) RETURNING * INTO r;
 RETURN public.employment_adoption_envelope_v1(r,false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY';END $$;
REVOKE ALL ON FUNCTION public.employment_adoption_immutable_v1(),public.employment_adoption_hash_v1(jsonb),public.employment_adoption_source_v1(jsonb),public.employment_adoption_envelope_v1(public.employment_adoption_proposal,boolean),public.employment_adoption_bootstrap_v1(jsonb),public.employment_adoption_attempt_v1(jsonb,uuid),public.employment_adoption_propose_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.employment_adoption_bootstrap_v1(jsonb),public.employment_adoption_attempt_v1(jsonb,uuid),public.employment_adoption_propose_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
