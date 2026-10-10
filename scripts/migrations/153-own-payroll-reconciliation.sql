-- Documentary reconciliation of an already posted own accounting journal.
-- Adds an empty append-only record; does not post, calculate, adopt or pay.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_reconciliation_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_reconciliation_%') THEN RAISE EXCEPTION 'RECONCILIATION_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_journal_detail_v1(jsonb,uuid)') IS NULL OR to_regprocedure('public.own_journal_lock_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'RECONCILIATION_PREREQUISITE';END IF;
END $$;

CREATE TABLE public.own_payroll_reconciliation_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid REFERENCES public.own_payroll_reconciliation_event(id),decision_id uuid REFERENCES public.own_payroll_reconciliation_event(id),journal_id uuid NOT NULL REFERENCES public.own_payroll_journal_event(id),group_id uuid NOT NULL REFERENCES public.own_payroll_close_event(id),
 period text NOT NULL CHECK(period~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'),liquidation_type text NOT NULL,
 command text NOT NULL CHECK(command IN('propose','approve','reject','withdraw')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=8388608),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot) IN('object','null') AND octet_length(source_snapshot::text)<=16777216),
 comparison_snapshot jsonb NOT NULL CHECK(jsonb_typeof(comparison_snapshot) IN('object','null') AND octet_length(comparison_snapshot::text)<=16777216),
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),CHECK((command='withdraw')=(decision_id IS NOT NULL)),
 CHECK((command='propose')=(jsonb_typeof(source_snapshot)='object' AND jsonb_typeof(comparison_snapshot)='object')),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_reconciliation_decision ON public.own_payroll_reconciliation_event(proposal_id) WHERE command IN('approve','reject');
CREATE UNIQUE INDEX own_reconciliation_withdrawal ON public.own_payroll_reconciliation_event(decision_id) WHERE command='withdraw';
CREATE INDEX own_reconciliation_period ON public.own_payroll_reconciliation_event(tenant_id,source_binding_id,period,liquidation_type,command);
CREATE INDEX own_reconciliation_journal ON public.own_payroll_reconciliation_event(tenant_id,source_binding_id,journal_id,command);
ALTER TABLE public.own_payroll_reconciliation_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_reconciliation_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_reconciliation_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'RECONCILIATION_IMMUTABLE';END $$;
CREATE TRIGGER own_reconciliation_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_reconciliation_event FOR EACH ROW EXECUTE FUNCTION public.own_reconciliation_immutable_v1();
CREATE TRIGGER own_reconciliation_no_truncate BEFORE TRUNCATE ON public.own_payroll_reconciliation_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_reconciliation_immutable_v1();
CREATE FUNCTION public.own_reconciliation_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 -- Same journal lock serializes reconciliation decisions with journal reversals.
 PERFORM public.own_journal_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-reconciliation:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'RECONCILIATION_BUSY';END IF;
END $$;
CREATE FUNCTION public.own_reconciliation_text_v1(v jsonb,min_length integer,max_length integer) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 -- Match browser UTF-16 length and ECMAScript trim, including Unicode edges.
 SELECT coalesce(public.own_journal_text_v1(v,0,max_length)
  AND length(v#>>'{}')+length(regexp_replace(v#>>'{}',U&'[^\+010000-\+10FFFF]','','g')) BETWEEN min_length AND max_length
  AND (v#>>'{}')=btrim(v#>>'{}',chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)),false)
$$;
CREATE FUNCTION public.own_reconciliation_document_v1(v jsonb,allow_pending boolean) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;i integer:=0;k text;BEGIN
 IF NOT public.own_program_exact_v1(v,ARRAY['reference','issuerReference','date','lines']) OR NOT public.own_reconciliation_text_v1(v->'reference',3,180) OR NOT public.own_reconciliation_text_v1(v->'issuerReference',1,80) OR NOT public.own_accounting_day_v1(v->'date') OR jsonb_typeof(v->'lines') IS DISTINCT FROM 'array' OR allow_pending IS NULL THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
 IF jsonb_array_length(v->'lines')>250000 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;
 IF NOT allow_pending AND jsonb_array_length(v->'lines')=0 THEN RAISE EXCEPTION 'RECONCILIATION_REVIEW_REQUIRED';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(v->'lines') LOOP
  i:=i+1;
  IF NOT public.own_program_exact_v1(r,ARRAY['ordinal','accountReference','debit','credit']) OR r->'ordinal' IS DISTINCT FROM to_jsonb(i) OR (r->'accountReference' IS DISTINCT FROM 'null'::jsonb AND NOT public.own_reconciliation_text_v1(r->'accountReference',1,80)) THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
  FOREACH k IN ARRAY ARRAY['debit','credit'] LOOP
   IF r->k IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(r->k) IS DISTINCT FROM 'string' OR r->>k!~'^(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$') THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
  END LOOP;
  IF NOT allow_pending AND (r->'accountReference'='null'::jsonb OR r->'debit'='null'::jsonb OR r->'credit'='null'::jsonb) THEN RAISE EXCEPTION 'RECONCILIATION_REVIEW_REQUIRED';END IF;
 END LOOP;
 RETURN v;
END $$;
CREATE FUNCTION public.own_reconciliation_command_body_v1(v jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;BEGIN
 IF NOT public.own_program_exact_v1(v,ARRAY['version','command','journalId','scopeVersion','sourceVersion','document','comparisonSha256','proposalId','proposalSha256','reason','reviewConfirmed']) OR v->>'version' IS DISTINCT FROM 'own-payroll-reconciliation.v1' OR coalesce(v->>'command','') NOT IN('propose','approve','reject','withdraw') OR NOT public.own_reconciliation_text_v1(v->'journalId',36,36) OR v->>'journalId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR NOT public.own_reconciliation_text_v1(v->'reason',10,1000) OR v->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
 PERFORM public.own_reconciliation_document_v1(v->'document',false);
 FOREACH k IN ARRAY ARRAY['scopeVersion','sourceVersion','comparisonSha256'] LOOP IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR v->>k!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;END LOOP;
 IF v->>'command'='propose' THEN
  IF v->'proposalId' IS DISTINCT FROM 'null'::jsonb OR v->'proposalSha256' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
 ELSE
  IF NOT public.own_reconciliation_text_v1(v->'proposalId',36,36) OR v->>'proposalId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(v->'proposalSha256') IS DISTINCT FROM 'string' OR v->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
 END IF;
 RETURN v;
END $$;
CREATE FUNCTION public.own_reconciliation_compare_v1(s jsonb,d jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb;r record;line jsonb;k text;accounts jsonb:='[]';line_issues jsonb:='[]';global_issues jsonb:='[]';i integer:=0;status_value text;ready_value boolean:=true;ed numeric;ec numeric;dd numeric;dc numeric;source_ordinals jsonb;document_ordinals jsonb;totals jsonb;BEGIN
 PERFORM public.own_reconciliation_document_v1(d,true);
 IF s->>'version' IS DISTINCT FROM 'own-payroll-reconciliation-source.v1' OR s->'complete' IS DISTINCT FROM 'true'::jsonb OR s#>>'{journal,status}' IS DISTINCT FROM 'posted' OR jsonb_typeof(s#>'{journal,journal,entries}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CHANGED';END IF;
 e:=s#>'{journal,journal,entries}';
 FOR line IN SELECT value FROM jsonb_array_elements(d->'lines') LOOP
  FOREACH k IN ARRAY ARRAY['accountReference','debit','credit'] LOOP
   IF line->k='null'::jsonb THEN line_issues:=line_issues||jsonb_build_array(jsonb_build_object('ordinal',line->'ordinal','code',CASE k WHEN 'accountReference' THEN 'account_missing' WHEN 'debit' THEN 'debit_missing' ELSE 'credit_missing' END));END IF;
  END LOOP;
 END LOOP;
 IF jsonb_array_length(d->'lines')=0 THEN global_issues:=global_issues||'"document_empty"'::jsonb;END IF;
 -- Preserve first occurrence, not a collation-dependent reordering of accounts.
 FOR r IN
  WITH source_keys AS(SELECT value->>'accountReference' COLLATE "C" AS account,min((value->>'ordinal')::integer) AS first_source FROM jsonb_array_elements(e) GROUP BY 1),
  document_keys AS(SELECT value->>'accountReference' COLLATE "C" AS account,min((value->>'ordinal')::integer) AS first_document FROM jsonb_array_elements(d->'lines') WHERE value->'accountReference'<>'null'::jsonb GROUP BY 1)
  SELECT coalesce(a.account,b.account) AS account FROM source_keys a FULL JOIN document_keys b ON a.account=b.account ORDER BY a.first_source NULLS LAST,b.first_document
 LOOP
  i:=i+1;
  SELECT jsonb_agg(value->'ordinal' ORDER BY (value->>'ordinal')::integer),sum((value->>'debit')::numeric),sum((value->>'credit')::numeric) INTO source_ordinals,ed,ec FROM jsonb_array_elements(e) WHERE value->>'accountReference' COLLATE "C"=r.account COLLATE "C";
  SELECT jsonb_agg(value->'ordinal' ORDER BY (value->>'ordinal')::integer),CASE WHEN bool_or(value->'debit'='null'::jsonb) THEN NULL ELSE sum((value->>'debit')::numeric) END,CASE WHEN bool_or(value->'credit'='null'::jsonb) THEN NULL ELSE sum((value->>'credit')::numeric) END INTO document_ordinals,dd,dc FROM jsonb_array_elements(d->'lines') WHERE value->>'accountReference' COLLATE "C"=r.account COLLATE "C";
  status_value:=CASE WHEN source_ordinals IS NULL THEN 'extra' WHEN document_ordinals IS NULL THEN 'missing' WHEN dd IS NULL OR dc IS NULL THEN 'incomplete' WHEN ed=dd AND ec=dc THEN 'balanced' ELSE 'different' END;
  ready_value:=ready_value AND status_value='balanced';
  accounts:=accounts||jsonb_build_array(jsonb_build_object('ordinal',i,'accountReference',r.account,'sourceEntryOrdinals',coalesce(source_ordinals,'[]'),'documentLineOrdinals',coalesce(document_ordinals,'[]'),'expectedDebit',ed::text,'expectedCredit',ec::text,'declaredDebit',dd::text,'declaredCredit',dc::text,'differenceDebit',(dd-ed)::text,'differenceCredit',(dc-ec)::text,'status',status_value));
 END LOOP;
 SELECT coalesce(sum((value->>'debit')::numeric),0),coalesce(sum((value->>'credit')::numeric),0) INTO ed,ec FROM jsonb_array_elements(e);
 SELECT CASE WHEN bool_or(value->'debit'='null'::jsonb) THEN NULL ELSE sum((value->>'debit')::numeric) END,CASE WHEN bool_or(value->'credit'='null'::jsonb) THEN NULL ELSE sum((value->>'credit')::numeric) END INTO dd,dc FROM jsonb_array_elements(d->'lines');
 IF dd IS NOT NULL AND dc IS NOT NULL AND dd<>dc THEN global_issues:=global_issues||'"document_unbalanced"'::jsonb;END IF;
 totals:=jsonb_build_object('expectedDebit',ed::text,'expectedCredit',ec::text,'declaredDebit',dd::text,'declaredCredit',dc::text,'differenceDebit',(dd-ed)::text,'differenceCredit',(dc-ec)::text);
 RETURN jsonb_build_object('version','own-payroll-reconciliation.v1','journalId',s#>'{journal,id}','journalNumber',s#>'{journal,number}','journalSha256',s#>'{journal,journalSha256}','sourceVersion',s->'sourceVersion','period',s#>'{journal,journal,period}','liquidationType',s#>'{journal,journal,liquidationType}','fiscalYear',s#>'{journal,journal,fiscalYear}','postingDate',s#>'{journal,postingDate}','documentReference',d->'reference','issuerReference',d->'issuerReference','documentDate',d->'date','sourceEntryCount',jsonb_array_length(e),'documentLineCount',jsonb_array_length(d->'lines'),'accounts',accounts,'lineIssues',line_issues,'globalIssues',global_issues,'totals',totals,'ready',ready_value AND i>0 AND jsonb_array_length(d->'lines')>0 AND jsonb_array_length(line_issues)=0 AND jsonb_array_length(global_issues)=0,'complete',true,'paymentExecuted',false,'externalAcceptance',false);
END $$;
CREATE FUNCTION public.own_reconciliation_source_value_v1(p jsonb,id_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;j jsonb;h jsonb;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_reconciliation_lock_v1(ctx);j:=public.own_journal_detail_v1(p,id_value);
 IF j->>'status' IS DISTINCT FROM 'posted' OR j->>'id' IS DISTINCT FROM id_value::text THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CHANGED';END IF;
 h:=jsonb_build_object('version','own-payroll-journal.v1','id',j->'id','proposalId',j->'proposalId','requestSha256',j->'requestSha256','journalSha256',j->'journalSha256','status',j->'status','number',j->'number','decision',j->'decision','reversedBy',j->'reversedBy');
 RETURN jsonb_build_object('version','own-payroll-reconciliation-source.v1','scopeVersion',public.native_salary_scope_v1(ctx),'journal',j,'sourceVersion',public.own_run_hash_v1(jsonb_build_object('version','own-payroll-reconciliation-source.v1','journal',h)),'complete',true);
END $$;
CREATE FUNCTION public.own_reconciliation_summary_v1(ctx jsonb,e public.own_payroll_reconciliation_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE d public.own_payroll_reconciliation_event;w public.own_payroll_reconciliation_event;status_value text;can_review boolean;decision_value jsonb;withdrawal_value jsonb;BEGIN
 SELECT * INTO d FROM public.own_payroll_reconciliation_event WHERE proposal_id=e.id AND command IN('approve','reject');
 SELECT * INTO w FROM public.own_payroll_reconciliation_event WHERE decision_id=d.id AND command='withdraw';
 status_value:=CASE WHEN w.id IS NOT NULL THEN 'withdrawn' WHEN d.command='approve' THEN 'approved' WHEN d.command='reject' THEN 'rejected' ELSE 'pending' END;
 can_review:=public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND status_value IN('pending','approved') AND e.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid AND e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid AND e.actor_email IS DISTINCT FROM ctx->>'actorEmail';
 IF d.id IS NOT NULL THEN can_review:=can_review AND d.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid AND d.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid AND d.actor_email IS DISTINCT FROM ctx->>'actorEmail';END IF;
 IF d.id IS NOT NULL THEN decision_value:=jsonb_build_object('id',d.id,'command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at);END IF;
 IF w.id IS NOT NULL THEN withdrawal_value:=jsonb_build_object('id',w.id,'command',w.command,'reason',w.body->>'reason','actorLabel',w.actor_label,'recordedAt',w.recorded_at);END IF;
 RETURN jsonb_build_object('id',coalesce(w.id,d.id,e.id),'proposalId',e.id,'journalId',e.journal_id,'requestSha256',e.request_sha256,'comparisonSha256',e.body->>'comparisonSha256','status',status_value,'reason',e.body->>'reason','authorLabel',e.actor_label,'canReview',can_review,'documentReference',e.body#>>'{document,reference}','documentDate',e.body#>>'{document,date}','accountCount',jsonb_array_length(e.comparison_snapshot->'accounts'),'lineCount',jsonb_array_length(e.body#>'{document,lines}'),'decision',decision_value,'withdrawal',withdrawal_value);
END $$;
CREATE FUNCTION public.own_reconciliation_detail_v1(p jsonb,id_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;found_value public.own_payroll_reconciliation_event;e public.own_payroll_reconciliation_event;s jsonb;current_source jsonb;current_value boolean:=false;d jsonb;h jsonb;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_reconciliation_lock_v1(ctx);
 SELECT * INTO found_value FROM public.own_payroll_reconciliation_event WHERE id=id_value AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECONCILIATION_NOT_FOUND';END IF;
 SELECT * INTO e FROM public.own_payroll_reconciliation_event WHERE id=coalesce(found_value.proposal_id,found_value.id) AND command='propose';s:=public.own_reconciliation_summary_v1(ctx,e);
 BEGIN current_source:=public.own_reconciliation_source_value_v1(p,e.journal_id);current_value:=current_source->>'sourceVersion'=e.body->>'sourceVersion';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN('RECONCILIATION_SOURCE_CHANGED','JOURNAL_SOURCE_CHANGED','JOURNAL_DECIDED') THEN RAISE;END IF;END;
 d:=jsonb_build_object('version','own-payroll-reconciliation.v1','id',s->'id','proposalId',e.id,'body',e.body,'requestSha256',e.request_sha256,'source',e.source_snapshot,'comparison',e.comparison_snapshot,'comparisonSha256',e.body->>'comparisonSha256','status',s->'status','sourceCurrent',current_value,'canReview',s->'canReview','authorLabel',e.actor_label,'decision',s->'decision','withdrawal',s->'withdrawal');
 h:=jsonb_build_object('version','own-payroll-reconciliation.v1','id',d->'id','proposalId',d->'proposalId','requestSha256',d->'requestSha256','comparisonSha256',d->'comparisonSha256','status',d->'status','decision',d->'decision','withdrawal',d->'withdrawal');
 d:=d||jsonb_build_object('stateVersion',public.own_run_hash_v1(h));IF octet_length(d::text)>16777216 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;RETURN d;
END $$;
CREATE FUNCTION public.own_reconciliation_source_v1(p jsonb,id_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb;BEGIN s:=public.own_reconciliation_source_value_v1(p,id_value);IF octet_length(s::text)>16777216 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;RETURN s;END $$;
CREATE FUNCTION public.own_reconciliation_bootstrap_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;journals jsonb;reconciliations jsonb;result_value jsonb;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_reconciliation_lock_v1(ctx);
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY recorded_at,id),'[]') INTO journals FROM(SELECT public.own_journal_summary_v1(ctx,e) v,e.recorded_at,e.id FROM public.own_payroll_journal_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND e.period=period_value AND e.liquidation_type=type_value) x WHERE v->>'status'='posted';
 SELECT coalesce(jsonb_agg(public.own_reconciliation_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO reconciliations FROM public.own_payroll_reconciliation_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND e.period=period_value AND e.liquidation_type=type_value;
 IF jsonb_array_length(journals)>1000 OR jsonb_array_length(reconciliations)>1000 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;
 result_value:=jsonb_build_object('version','own-payroll-reconciliation.v1','scopeVersion',public.native_salary_scope_v1(ctx),'period',period_value,'liquidationType',type_value,'journals',journals,'reconciliations',reconciliations,'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'paymentExecuted',false);
 IF octet_length(result_value::text)>16777216 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;RETURN result_value;
END $$;
CREATE FUNCTION public.own_reconciliation_duplicate_v1(ctx jsonb,journal_value uuid,ignored_proposal uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.own_payroll_reconciliation_event e LEFT JOIN public.own_payroll_reconciliation_event d ON d.proposal_id=e.id AND d.command IN('approve','reject') LEFT JOIN public.own_payroll_reconciliation_event w ON w.decision_id=d.id AND w.command='withdraw'
 WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND e.journal_id=journal_value AND (ignored_proposal IS NULL OR e.id<>ignored_proposal) AND(d.id IS NULL OR d.command='approve' AND w.id IS NULL))
$$;
CREATE FUNCTION public.own_reconciliation_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_reconciliation_event;BEGIN
 ctx:=public.own_close_context_v1(p,true);
 SELECT * INTO e FROM public.own_payroll_reconciliation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECONCILIATION_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_reconciliation_command_v1(p jsonb,body_value jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;eid uuid:=gen_random_uuid();pid uuid;did uuid;jid uuid;gid uuid;period_value text;type_value text;fingerprint text;source_value jsonb;comparison_value jsonb;current_source jsonb;proposal public.own_payroll_reconciliation_event;prior public.own_payroll_reconciliation_event;decision_value public.own_payroll_reconciliation_event;receipt_value jsonb;added bigint;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_reconciliation_command_body_v1(body_value);cmd:=body_value->>'command';jid:=(body_value->>'journalId')::uuid;
 IF key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body_value::text)>8388608 THEN RAISE EXCEPTION 'RECONCILIATION_INPUT_INVALID';END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN';END IF;
 PERFORM public.own_reconciliation_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body_value);
 SELECT * INTO prior FROM public.own_payroll_reconciliation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body_value THEN RAISE EXCEPTION 'RECONCILIATION_IDEMPOTENCY_REUSE';END IF;RETURN public.own_reconciliation_attempt_v1(p,key);END IF;
 IF body_value->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'RECONCILIATION_SCOPE_CHANGED';END IF;
 IF cmd='propose' THEN
  pid:=eid;source_value:=public.own_reconciliation_source_value_v1(p,jid);comparison_value:=public.own_reconciliation_compare_v1(source_value,body_value->'document');
  IF comparison_value->'ready' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'RECONCILIATION_REVIEW_REQUIRED';END IF;
  IF source_value->>'sourceVersion' IS DISTINCT FROM body_value->>'sourceVersion' OR public.own_run_hash_v1(comparison_value) IS DISTINCT FROM body_value->>'comparisonSha256' THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CHANGED';END IF;
  IF public.own_reconciliation_duplicate_v1(ctx,jid,NULL) THEN RAISE EXCEPTION 'RECONCILIATION_DUPLICATE';END IF;
 ELSE
  pid:=(body_value->>'proposalId')::uuid;
  SELECT * INTO proposal FROM public.own_payroll_reconciliation_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECONCILIATION_NOT_FOUND';END IF;
  SELECT * INTO decision_value FROM public.own_payroll_reconciliation_event WHERE proposal_id=pid AND command IN('approve','reject');
  IF cmd='withdraw' THEN
   IF decision_value.command IS DISTINCT FROM 'approve' OR EXISTS(SELECT 1 FROM public.own_payroll_reconciliation_event WHERE decision_id=decision_value.id AND command='withdraw') THEN RAISE EXCEPTION 'RECONCILIATION_DECIDED';END IF;did:=decision_value.id;
  ELSIF decision_value.id IS NOT NULL THEN RAISE EXCEPTION 'RECONCILIATION_DECIDED';END IF;
  IF NOT(public.own_reconciliation_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'RECONCILIATION_INDEPENDENT_REQUIRED';END IF;
  IF body_value->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body_value-ARRAY['command','scopeVersion','proposalId','proposalSha256','reason'] IS DISTINCT FROM proposal.body-ARRAY['command','scopeVersion','proposalId','proposalSha256','reason'] THEN RAISE EXCEPTION 'RECONCILIATION_PROPOSAL_CHANGED';END IF;
  source_value:=proposal.source_snapshot;comparison_value:=proposal.comparison_snapshot;
  IF cmd='approve' THEN
   current_source:=public.own_reconciliation_source_value_v1(p,jid);
   IF current_source->>'sourceVersion' IS DISTINCT FROM body_value->>'sourceVersion' OR public.own_reconciliation_compare_v1(current_source,body_value->'document') IS DISTINCT FROM comparison_value THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_CHANGED';END IF;
   IF public.own_reconciliation_duplicate_v1(ctx,jid,pid) THEN RAISE EXCEPTION 'RECONCILIATION_DUPLICATE';END IF;
  END IF;
 END IF;
 gid:=(source_value#>>'{journal,journal,groupId}')::uuid;period_value:=comparison_value->>'period';type_value:=comparison_value->>'liquidationType';
 IF cmd='propose' AND(SELECT count(*) FROM public.own_payroll_reconciliation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=1000 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-reconciliation:capacity:v1',0)) THEN RAISE EXCEPTION 'RECONCILIATION_BUSY';END IF;
 IF cmd<>'propose' THEN source_value:='null';comparison_value:='null';END IF;
 added:=octet_length(source_value::text)+octet_length(comparison_value::text)+4*octet_length(body_value::text)+8192;
 IF octet_length(source_value::text)+octet_length(comparison_value::text)+octet_length(body_value::text)+8192>16777216 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.source_snapshot::text)+octet_length(e.comparison_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_reconciliation_event e)+added>536870912 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.source_snapshot::text)+octet_length(e.comparison_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_reconciliation_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added>268435456 THEN RAISE EXCEPTION 'RECONCILIATION_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-payroll-reconciliation.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body_value,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END,'comparisonSha256',body_value->>'comparisonSha256','sourceVersion',body_value->>'sourceVersion','replayed',false,'accountingReconciled',cmd='approve','paymentExecuted',false,'externalAcceptance',false);
 INSERT INTO public.own_payroll_reconciliation_event(id,tenant_id,source_binding_id,proposal_id,decision_id,journal_id,group_id,period,liquidation_type,command,body,source_snapshot,comparison_snapshot,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,did,jid,gid,period_value,type_value,cmd,body_value,source_value,comparison_value,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;

REVOKE ALL ON FUNCTION public.own_reconciliation_text_v1(jsonb,integer,integer),public.own_reconciliation_immutable_v1(),public.own_reconciliation_lock_v1(jsonb),public.own_reconciliation_document_v1(jsonb,boolean),public.own_reconciliation_command_body_v1(jsonb),public.own_reconciliation_compare_v1(jsonb,jsonb),public.own_reconciliation_source_value_v1(jsonb,uuid),public.own_reconciliation_summary_v1(jsonb,public.own_payroll_reconciliation_event),public.own_reconciliation_detail_v1(jsonb,uuid),public.own_reconciliation_source_v1(jsonb,uuid),public.own_reconciliation_bootstrap_v1(jsonb,text,text),public.own_reconciliation_duplicate_v1(jsonb,uuid,uuid),public.own_reconciliation_attempt_v1(jsonb,uuid),public.own_reconciliation_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_reconciliation_detail_v1(jsonb,uuid),public.own_reconciliation_source_v1(jsonb,uuid),public.own_reconciliation_bootstrap_v1(jsonb,text,text),public.own_reconciliation_attempt_v1(jsonb,uuid),public.own_reconciliation_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
