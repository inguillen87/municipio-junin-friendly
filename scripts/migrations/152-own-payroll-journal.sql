-- Own accounting book consumes approved own payroll allocations only.
-- No operational employee intake, salary evaluation, role assignment or payment.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_journal_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_journal_%') THEN RAISE EXCEPTION 'JOURNAL_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_imputation_detail_v1(jsonb,uuid)') IS NULL OR to_regprocedure('public.own_imputation_lock_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'JOURNAL_PREREQUISITE';END IF;
END $$;

CREATE TABLE public.own_payroll_journal_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid REFERENCES public.own_payroll_journal_event(id),original_id uuid REFERENCES public.own_payroll_journal_event(id),group_id uuid NOT NULL REFERENCES public.own_payroll_close_event(id),
 period text NOT NULL CHECK(period~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'),liquidation_type text NOT NULL,
 fiscal_year text NOT NULL CHECK(fiscal_year~'^(19|20)[0-9]{2}$'),entry_number integer CHECK(entry_number>0),command text NOT NULL CHECK(command IN('propose','post','reject')),basis text NOT NULL CHECK(basis IN('imputation','journal')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=8388608),source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot) IN('object','null') AND octet_length(source_snapshot::text)<=16777216),journal_snapshot jsonb NOT NULL CHECK(jsonb_typeof(journal_snapshot) IN('object','null') AND octet_length(journal_snapshot::text)<=16777216),
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),CHECK((command='post')=(entry_number IS NOT NULL)),CHECK((basis='journal')=(original_id IS NOT NULL)),CHECK((command='propose')=(jsonb_typeof(source_snapshot)='object' AND jsonb_typeof(journal_snapshot)='object')),
 UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_journal_number ON public.own_payroll_journal_event(tenant_id,source_binding_id,fiscal_year,entry_number) WHERE command='post';
CREATE UNIQUE INDEX own_journal_reversal ON public.own_payroll_journal_event(original_id) WHERE command='post' AND basis='journal';
CREATE INDEX own_journal_period ON public.own_payroll_journal_event(tenant_id,source_binding_id,period,liquidation_type,command);
ALTER TABLE public.own_payroll_journal_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_journal_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_journal_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'JOURNAL_IMMUTABLE';END $$;
CREATE TRIGGER own_journal_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_journal_event FOR EACH ROW EXECUTE FUNCTION public.own_journal_immutable_v1();
CREATE TRIGGER own_journal_no_truncate BEFORE TRUNCATE ON public.own_payroll_journal_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_journal_immutable_v1();
CREATE FUNCTION public.own_journal_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 PERFORM public.own_imputation_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-journal:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'JOURNAL_BUSY';END IF;
END $$;
CREATE FUNCTION public.own_journal_text_v1(v jsonb,min_length integer,max_length integer) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND length(v#>>'{}') BETWEEN min_length AND max_length AND (v#>>'{}')=btrim(v#>>'{}') AND (v#>>'{}')=normalize(v#>>'{}',NFC) AND (v#>>'{}')!~'[<>[:cntrl:]]',false)
$$;
CREATE FUNCTION public.own_journal_command_body_v1(v jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;i integer:=0;k text;
BEGIN
 IF NOT public.own_program_exact_v1(v,ARRAY['version','command','basis','sourceId','scopeVersion','sourceVersion','postingDate','rules','journalSha256','proposalId','proposalSha256','reason','reviewConfirmed']) OR v->>'version' IS DISTINCT FROM 'own-payroll-journal.v1' OR coalesce(v->>'command','') NOT IN('propose','post','reject') OR coalesce(v->>'basis','') NOT IN('imputation','journal') OR NOT public.own_journal_text_v1(v->'sourceId',36,36) OR v->>'sourceId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR NOT public.own_accounting_day_v1(v->'postingDate') OR NOT public.own_journal_text_v1(v->'reason',10,1000) OR v->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(v->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'rules')>250000 THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 FOREACH k IN ARRAY ARRAY['scopeVersion','sourceVersion','journalSha256'] LOOP IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR v->>k!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(v->'rules') LOOP i:=i+1;
  IF NOT public.own_program_exact_v1(r,ARRAY['ordinal','side','counterAccountReference','documentReference']) OR r->'ordinal' IS DISTINCT FROM to_jsonb(i) OR coalesce(r->>'side','') NOT IN('debit','credit') OR NOT public.own_journal_text_v1(r->'counterAccountReference',1,80) OR NOT public.own_journal_text_v1(r->'documentReference',3,180) THEN RAISE EXCEPTION 'JOURNAL_REVIEW_REQUIRED';END IF;
 END LOOP;
 IF v->>'basis'='journal' AND i<>0 THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 IF v->>'command'='propose' THEN IF v->'proposalId' IS DISTINCT FROM 'null'::jsonb OR v->'proposalSha256' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 ELSE IF NOT public.own_journal_text_v1(v->'proposalId',36,36) OR v->>'proposalId'!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(v->'proposalSha256') IS DISTINCT FROM 'string' OR v->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;END IF;
 RETURN v;
END $$;
CREATE FUNCTION public.own_journal_calculate_v1(s jsonb,day_value text,rules_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a jsonb;g jsonb;r jsonb;e jsonb;entries jsonb:='[]';i integer:=0;side_value text;line_side text;amount_value text;role_value text;debits numeric:=0;credits numeric:=0;totals jsonb;original_value jsonb;
BEGIN
 IF NOT public.own_accounting_day_v1(to_jsonb(day_value)) OR s->'complete' IS DISTINCT FROM 'true'::jsonb OR s->>'version' IS DISTINCT FROM 'own-payroll-journal-source.v1' OR jsonb_typeof(rules_value) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 IF s->>'basis'='imputation' THEN
  a:=s#>'{imputation,allocation}';IF a->'ready' IS DISTINCT FROM 'true'::jsonb OR s#>>'{imputation,proposal,status}' IS DISTINCT FROM 'approved' OR s#>'{imputation,sourceCurrent}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'JOURNAL_SOURCE_CHANGED';END IF;
  IF left(day_value,4) IS DISTINCT FROM a->>'fiscalYear' OR jsonb_array_length(rules_value) IS DISTINCT FROM jsonb_array_length(a->'groups') OR jsonb_array_length(rules_value)=0 THEN RAISE EXCEPTION 'JOURNAL_REVIEW_REQUIRED';END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(a->'groups') LOOP
   i:=i+1;r:=rules_value->(i-1);
   IF r->'ordinal' IS DISTINCT FROM to_jsonb(i) OR coalesce(r->>'side','') NOT IN('debit','credit') OR NOT public.own_journal_text_v1(r->'counterAccountReference',1,80) OR NOT public.own_journal_text_v1(r->'documentReference',3,180) OR NOT public.own_journal_text_v1(g#>'{destination,accountingAccountReference}',1,80) OR g#>>'{destination,accountingAccountReference}'=r->>'counterAccountReference' THEN RAISE EXCEPTION 'JOURNAL_REVIEW_REQUIRED';END IF;
   amount_value:=g->>'amount';IF amount_value!~'^-?(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$' OR amount_value::numeric<>trunc(amount_value::numeric,2) THEN RAISE EXCEPTION 'JOURNAL_PRECISION';END IF;
   side_value:=r->>'side';IF left(amount_value,1)='-' THEN amount_value:=substr(amount_value,2);side_value:=CASE side_value WHEN 'debit' THEN 'credit' ELSE 'debit' END;END IF;
   FOREACH role_value IN ARRAY ARRAY['primary','counterpart'] LOOP
    line_side:=CASE WHEN role_value='primary' THEN side_value WHEN side_value='debit' THEN 'credit' ELSE 'debit' END;
    entries:=entries||jsonb_build_array(jsonb_build_object('ordinal',jsonb_array_length(entries)+1,'groupOrdinal',i,'role',role_value,'accountReference',CASE role_value WHEN 'primary' THEN g#>>'{destination,accountingAccountReference}' ELSE r->>'counterAccountReference' END,'side',line_side,'amount',amount_value,'debit',CASE line_side WHEN 'debit' THEN amount_value ELSE '0' END,'credit',CASE line_side WHEN 'credit' THEN amount_value ELSE '0' END,'sourceAmount',g->>'amount','sourceOrdinals',g->'ordinals','destination',g->'destination','documentReference',r->>'documentReference'));
   END LOOP;
  END LOOP;
  original_value:='null';
 ELSE
  IF s->>'basis' IS DISTINCT FROM 'journal' OR jsonb_array_length(rules_value)<>0 OR s#>>'{original,status}' IS DISTINCT FROM 'posted' OR s#>>'{original,kind}' IS DISTINCT FROM 'initial' OR day_value<s#>>'{original,postingDate}' THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
  a:=s#>'{original,journal}';i:=(a->>'groupCount')::integer;original_value:=s#>'{original,id}';
  FOR e IN SELECT value FROM jsonb_array_elements(a->'entries') LOOP line_side:=CASE e->>'side' WHEN 'debit' THEN 'credit' ELSE 'debit' END;entries:=entries||jsonb_build_array(e||jsonb_build_object('side',line_side,'debit',CASE line_side WHEN 'debit' THEN e->>'amount' ELSE '0' END,'credit',CASE line_side WHEN 'credit' THEN e->>'amount' ELSE '0' END));END LOOP;
 END IF;
 SELECT coalesce(sum((value->>'debit')::numeric),0),coalesce(sum((value->>'credit')::numeric),0) INTO debits,credits FROM jsonb_array_elements(entries);IF debits<>credits THEN RAISE EXCEPTION 'JOURNAL_UNBALANCED';END IF;
 totals:=jsonb_build_object('debit',debits::text,'credit',credits::text);
 RETURN jsonb_build_object('version','own-payroll-journal.v1','kind',CASE s->>'basis' WHEN 'imputation' THEN 'initial' ELSE 'reversal' END,'sourceId',CASE s->>'basis' WHEN 'imputation' THEN s#>>'{imputation,proposal,id}' ELSE s#>>'{original,id}' END,'sourceVersion',s->>'sourceVersion','groupId',a->>'groupId','period',CASE s->>'basis' WHEN 'imputation' THEN s#>>'{imputation,source,group,snapshot,period}' ELSE a->>'period' END,'liquidationType',CASE s->>'basis' WHEN 'imputation' THEN s#>>'{imputation,source,group,snapshot,liquidationType}' ELSE a->>'liquidationType' END,'postingDate',day_value,'fiscalYear',left(day_value,4),'originalId',original_value,'groupCount',i,'conceptCount',a->'conceptCount','auxiliaryCount',a->'auxiliaryCount','employeeCount',a->'employeeCount','sourceTotals',a->'sourceTotals','entries',entries,'issues','[]'::jsonb,'totals',totals,'ready',i>0,'paymentExecuted',false);
END $$;
CREATE FUNCTION public.own_journal_source_value_v1(p jsonb,basis_value text,id_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;d jsonb;s jsonb;h jsonb;
BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_journal_lock_v1(ctx);
 IF basis_value='imputation' THEN
  d:=public.own_imputation_detail_v1(p,id_value);IF d#>>'{proposal,status}' IS DISTINCT FROM 'approved' OR d->'sourceCurrent' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'JOURNAL_SOURCE_CHANGED';END IF;
  h:=jsonb_build_object('version','own-payroll-journal-source.v1','basis',basis_value,'imputationId',d#>>'{proposal,id}','requestSha256',d#>>'{proposal,requestSha256}','decision',d#>'{proposal,decision}','allocationSha256',d->>'allocationSha256','snapshotSha256',d#>>'{allocation,snapshotSha256}');
  s:=jsonb_build_object('imputation',d,'original',NULL);
 ELSIF basis_value='journal' THEN
  d:=public.own_journal_detail_v1(p,id_value);IF d->>'status' IS DISTINCT FROM 'posted' OR d->>'kind' IS DISTINCT FROM 'initial' THEN RAISE EXCEPTION 'JOURNAL_DECIDED';END IF;
  h:=jsonb_build_object('version','own-payroll-journal-source.v1','basis',basis_value,'originalId',d->>'id','journalSha256',d->>'journalSha256','stateVersion',d->>'stateVersion','number',d->'number','postingDate',d->>'postingDate');s:=jsonb_build_object('imputation',NULL,'original',d);
 ELSE RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 RETURN s||jsonb_build_object('version','own-payroll-journal-source.v1','scopeVersion',public.native_salary_scope_v1(ctx),'basis',basis_value,'sourceVersion',public.own_run_hash_v1(h),'complete',true);
END $$;

CREATE FUNCTION public.own_journal_summary_v1(ctx jsonb,e public.own_payroll_journal_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_payroll_journal_event;reversal_id uuid;independent boolean;BEGIN
 SELECT * INTO d FROM public.own_payroll_journal_event WHERE proposal_id=e.id;
 IF d.command='post' THEN SELECT id INTO reversal_id FROM public.own_payroll_journal_event WHERE original_id=d.id AND command='post' AND basis='journal';END IF;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',coalesce(d.id,e.id),'proposalId',e.id,'basis',e.basis,'sourceId',e.body->>'sourceId','requestSha256',e.request_sha256,'journalSha256',e.body->>'journalSha256','postingDate',e.body->>'postingDate','number',d.entry_number,'status',CASE WHEN reversal_id IS NOT NULL THEN 'reversed' WHEN d.command='post' THEN 'posted' WHEN d.command='reject' THEN 'rejected' ELSE 'pending' END,'reason',e.body->>'reason','authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'groupCount',e.journal_snapshot->'groupCount','conceptCount',e.journal_snapshot->'conceptCount','reversedBy',reversal_id,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at) END);
END $$;
CREATE FUNCTION public.own_journal_detail_v1(p jsonb,id_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_journal_event;found_value public.own_payroll_journal_event;summary jsonb;current_source jsonb;current_value boolean:=false;d jsonb;h jsonb;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_journal_lock_v1(ctx);
 SELECT * INTO found_value FROM public.own_payroll_journal_event WHERE id=id_value AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_NOT_FOUND';END IF;
 SELECT * INTO e FROM public.own_payroll_journal_event WHERE id=coalesce(found_value.proposal_id,found_value.id) AND command='propose';
 summary:=public.own_journal_summary_v1(ctx,e);
 BEGIN
  IF e.basis='imputation' THEN current_source:=public.own_journal_source_value_v1(p,'imputation',(e.body->>'sourceId')::uuid);current_value:=current_source->>'sourceVersion'=e.body->>'sourceVersion';
  ELSIF summary->>'status'='posted' THEN SELECT id INTO found_value.id FROM public.own_payroll_journal_event WHERE original_id=e.original_id AND basis='journal' AND command='post';current_value:=found_value.id::text=summary->>'id';
  ELSE current_source:=public.own_journal_source_value_v1(p,'journal',e.original_id);current_value:=current_source->>'sourceVersion'=e.body->>'sourceVersion';END IF;
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN('JOURNAL_SOURCE_CHANGED','JOURNAL_DECIDED') THEN RAISE;END IF;END;
 d:=jsonb_build_object('version','own-payroll-journal.v1','id',summary->'id','proposalId',e.id,'body',e.body,'requestSha256',e.request_sha256,'source',e.source_snapshot,'journal',e.journal_snapshot,'journalSha256',e.body->>'journalSha256','status',summary->>'status','kind',e.journal_snapshot->>'kind','postingDate',e.body->>'postingDate','number',summary->'number','sourceCurrent',current_value,'canReview',summary->'canReview','authorLabel',e.actor_label,'decision',summary->'decision','reversedBy',summary->'reversedBy');
 h:=jsonb_build_object('version','own-payroll-journal.v1','id',d->'id','proposalId',d->'proposalId','requestSha256',d->'requestSha256','journalSha256',d->'journalSha256','status',d->'status','number',d->'number','decision',d->'decision','reversedBy',d->'reversedBy');
 d:=d||jsonb_build_object('stateVersion',public.own_run_hash_v1(h));IF octet_length(d::text)>16777216 THEN RAISE EXCEPTION 'JOURNAL_LIMIT';END IF;RETURN d;
END $$;
CREATE FUNCTION public.own_journal_source_v1(p jsonb,basis_value text,id_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb;BEGIN s:=public.own_journal_source_value_v1(p,basis_value,id_value);IF octet_length(s::text)>16777216 THEN RAISE EXCEPTION 'JOURNAL_LIMIT';END IF;RETURN s;END $$;
CREATE FUNCTION public.own_journal_bootstrap_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;imputations jsonb;journals jsonb;result_value jsonb;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_journal_lock_v1(ctx);
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(public.own_imputation_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO imputations FROM public.own_payroll_imputation_event e JOIN public.own_payroll_imputation_event d ON d.proposal_id=e.id AND d.command='approve' JOIN public.own_payroll_close_event g ON g.id=e.group_id WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND g.period=period_value AND g.liquidation_type=type_value;
 SELECT coalesce(jsonb_agg(public.own_journal_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO journals FROM public.own_payroll_journal_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND e.period=period_value AND e.liquidation_type=type_value;
 IF jsonb_array_length(imputations)>500 OR jsonb_array_length(journals)>1000 THEN RAISE EXCEPTION 'JOURNAL_LIMIT';END IF;
 result_value:=jsonb_build_object('version','own-payroll-journal.v1','scopeVersion',public.native_salary_scope_v1(ctx),'period',period_value,'liquidationType',type_value,'imputations',imputations,'journals',journals,'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canPost',public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'paymentExecuted',false);
 IF octet_length(result_value::text)>16777216 THEN RAISE EXCEPTION 'JOURNAL_LIMIT';END IF;RETURN result_value;
END $$;
CREATE FUNCTION public.own_journal_duplicate_v1(ctx jsonb,s jsonb,ignored_proposal uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.own_payroll_journal_event e LEFT JOIN public.own_payroll_journal_event d ON d.proposal_id=e.id LEFT JOIN public.own_payroll_journal_event r ON r.original_id=d.id AND r.basis='journal' AND r.command='post'
 WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND e.basis='imputation' AND (ignored_proposal IS NULL OR e.id<>ignored_proposal) AND e.period=s#>>'{imputation,source,group,snapshot,period}' AND e.liquidation_type=s#>>'{imputation,source,group,snapshot,liquidationType}' AND (d.id IS NULL OR d.command='post' AND r.id IS NULL)
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.source_snapshot#>'{imputation,source,group,snapshot,employees}') old_employee JOIN jsonb_array_elements(s#>'{imputation,source,group,snapshot,employees}') new_employee ON old_employee->>'contractId'=new_employee->>'contractId'))
$$;
CREATE FUNCTION public.own_journal_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_journal_event;BEGIN
 ctx:=public.own_close_context_v1(p,true);SELECT * INTO e FROM public.own_payroll_journal_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'JOURNAL_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_journal_command_v1(p jsonb,body_value jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;basis_value text;eid uuid:=gen_random_uuid();pid uuid;original_value uuid;gid uuid;period_value text;type_value text;fy text;num integer;fingerprint text;source_value jsonb;journal_value jsonb;captured_source jsonb;captured_journal jsonb;proposal public.own_payroll_journal_event;prior public.own_payroll_journal_event;receipt_value jsonb;added bigint;BEGIN
 ctx:=public.own_close_context_v1(p,true);PERFORM public.own_journal_command_body_v1(body_value);cmd:=body_value->>'command';basis_value:=body_value->>'basis';
 IF key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body_value::text)>8388608 THEN RAISE EXCEPTION 'JOURNAL_INPUT_INVALID';END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'JOURNAL_FORBIDDEN';END IF;
 PERFORM public.own_journal_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body_value);
 SELECT * INTO prior FROM public.own_payroll_journal_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body_value THEN RAISE EXCEPTION 'JOURNAL_IDEMPOTENCY_REUSE';END IF;RETURN public.own_journal_attempt_v1(p,key);END IF;
 IF body_value->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'JOURNAL_SCOPE_CHANGED';END IF;
 IF cmd='propose' THEN
  pid:=eid;source_value:=public.own_journal_source_value_v1(p,basis_value,(body_value->>'sourceId')::uuid);journal_value:=public.own_journal_calculate_v1(source_value,body_value->>'postingDate',body_value->'rules');
  IF source_value->>'sourceVersion' IS DISTINCT FROM body_value->>'sourceVersion' OR public.own_run_hash_v1(journal_value) IS DISTINCT FROM body_value->>'journalSha256' THEN RAISE EXCEPTION 'JOURNAL_SOURCE_CHANGED';END IF;
  IF basis_value='imputation' AND public.own_journal_duplicate_v1(ctx,source_value,NULL) THEN RAISE EXCEPTION 'JOURNAL_DUPLICATE';END IF;
  IF basis_value='journal' AND EXISTS(SELECT 1 FROM public.own_payroll_journal_event e LEFT JOIN public.own_payroll_journal_event d ON d.proposal_id=e.id WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose' AND e.basis='journal' AND e.original_id=(body_value->>'sourceId')::uuid AND (d.id IS NULL OR d.command='post')) THEN RAISE EXCEPTION 'JOURNAL_DUPLICATE';END IF;
 ELSE
  pid:=(body_value->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_payroll_journal_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOURNAL_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_payroll_journal_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'JOURNAL_DECIDED';END IF;
  IF NOT(public.own_journal_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'JOURNAL_INDEPENDENT_REQUIRED';END IF;
  IF body_value->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body_value-ARRAY['command','scopeVersion','proposalId','proposalSha256','reason'] IS DISTINCT FROM proposal.body-ARRAY['command','scopeVersion','proposalId','proposalSha256','reason'] THEN RAISE EXCEPTION 'JOURNAL_PROPOSAL_CHANGED';END IF;
  source_value:=proposal.source_snapshot;journal_value:=proposal.journal_snapshot;
  IF cmd='post' THEN
   captured_source:=public.own_journal_source_value_v1(p,basis_value,(body_value->>'sourceId')::uuid);captured_journal:=public.own_journal_calculate_v1(captured_source,body_value->>'postingDate',body_value->'rules');
   IF captured_source->>'sourceVersion' IS DISTINCT FROM body_value->>'sourceVersion' OR captured_journal IS DISTINCT FROM journal_value OR public.own_run_hash_v1(captured_journal) IS DISTINCT FROM body_value->>'journalSha256' THEN RAISE EXCEPTION 'JOURNAL_SOURCE_CHANGED';END IF;
   IF basis_value='imputation' AND public.own_journal_duplicate_v1(ctx,captured_source,pid) THEN RAISE EXCEPTION 'JOURNAL_DUPLICATE';END IF;
  END IF;
 END IF;
 gid:=(journal_value->>'groupId')::uuid;original_value:=(journal_value->>'originalId')::uuid;period_value:=journal_value->>'period';type_value:=journal_value->>'liquidationType';fy:=journal_value->>'fiscalYear';
 IF cmd='post' THEN SELECT coalesce(max(entry_number),0)+1 INTO num FROM public.own_payroll_journal_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND fiscal_year=fy;END IF;
 IF cmd='propose' AND(SELECT count(*) FROM public.own_payroll_journal_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=1000 THEN RAISE EXCEPTION 'JOURNAL_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-journal:capacity:v1',0)) THEN RAISE EXCEPTION 'JOURNAL_BUSY';END IF;
 IF cmd<>'propose' THEN source_value:='null';journal_value:='null';END IF;
 added:=octet_length(source_value::text)+octet_length(journal_value::text)+4*octet_length(body_value::text)+8192;
 IF octet_length(source_value::text)+octet_length(journal_value::text)+octet_length(body_value::text)+8192>16777216 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.source_snapshot::text)+octet_length(e.journal_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_journal_event e)+added>536870912 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.source_snapshot::text)+octet_length(e.journal_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_journal_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added>268435456 THEN RAISE EXCEPTION 'JOURNAL_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-payroll-journal.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body_value,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'post' THEN 'posted' ELSE 'rejected' END,'number',num,'journalSha256',body_value->>'journalSha256','sourceVersion',body_value->>'sourceVersion','replayed',false,'accountingPosted',cmd='post','paymentExecuted',false);
 INSERT INTO public.own_payroll_journal_event(id,tenant_id,source_binding_id,proposal_id,original_id,group_id,period,liquidation_type,fiscal_year,entry_number,command,basis,body,source_snapshot,journal_snapshot,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,original_value,gid,period_value,type_value,fy,num,cmd,basis_value,body_value,source_value,journal_value,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;

REVOKE ALL ON FUNCTION public.own_journal_immutable_v1(),public.own_journal_lock_v1(jsonb),public.own_journal_text_v1(jsonb,integer,integer),public.own_journal_command_body_v1(jsonb),public.own_journal_calculate_v1(jsonb,text,jsonb),public.own_journal_source_value_v1(jsonb,text,uuid),public.own_journal_summary_v1(jsonb,public.own_payroll_journal_event),public.own_journal_detail_v1(jsonb,uuid),public.own_journal_source_v1(jsonb,text,uuid),public.own_journal_bootstrap_v1(jsonb,text,text),public.own_journal_duplicate_v1(jsonb,jsonb,uuid),public.own_journal_attempt_v1(jsonb,uuid),public.own_journal_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_journal_detail_v1(jsonb,uuid),public.own_journal_source_v1(jsonb,text,uuid),public.own_journal_bootstrap_v1(jsonb,text,text),public.own_journal_attempt_v1(jsonb,uuid),public.own_journal_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
