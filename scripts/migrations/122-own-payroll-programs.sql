-- New own programs linked to approved112 definitions. No salary calculation,
-- source import, nominal change or reuse of rejected operational drafts.
DO $$
BEGIN
 IF to_regclass('public.own_payroll_program_event') IS NOT NULL THEN RAISE EXCEPTION 'OWN_PROGRAM_ALREADY_INSTALLED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_program_%') THEN RAISE EXCEPTION 'OWN_PROGRAM_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_context_v1(jsonb)') IS NULL OR to_regprocedure('public.native_salary_catalog_v1(jsonb)') IS NULL OR to_regprocedure('public.native_salary_lock_v1(jsonb)') IS NULL OR to_regprocedure('public.native_salary_serialized_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'OWN_PROGRAM_PREREQUISITE'; END IF;
END $$;
CREATE TABLE public.own_payroll_program_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid REFERENCES public.own_payroll_program_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=4194304),base_definition jsonb NOT NULL,base_salary_items jsonb NOT NULL CHECK(jsonb_typeof(base_salary_items)='array'),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_payroll_program_approval_revision ON public.own_payroll_program_event(tenant_id,source_binding_id,revision) WHERE command='approve';
ALTER TABLE public.own_payroll_program_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_program_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_program_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'OWN_PROGRAM_IMMUTABLE'; END $$;
CREATE TRIGGER own_program_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_program_event FOR EACH ROW EXECUTE FUNCTION public.own_program_immutable_v1();
CREATE TRIGGER own_program_no_truncate BEFORE TRUNCATE ON public.own_payroll_program_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_program_immutable_v1();
CREATE FUNCTION public.own_program_exact_v1(v jsonb,fields text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='object' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(v)='object' THEN v ELSE '{}'::jsonb END) k)=(SELECT array_agg(k ORDER BY k) FROM unnest(fields) k),false)
$$;
CREATE FUNCTION public.own_program_text_v1(v jsonb,lo integer,hi integer) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND length(v#>>'{}') BETWEEN lo AND hi AND (v#>>'{}')=btrim(v#>>'{}') AND (v#>>'{}')=normalize(v#>>'{}',NFC) AND (v#>>'{}')!~'[<>[:cntrl:]]',false)
$$;
CREATE FUNCTION public.own_program_rounding_v1(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(public.own_program_exact_v1(v,ARRAY['precision','mode']) AND jsonb_typeof(v->'precision')='number' AND v->>'precision'~'^[0-8]$' AND v->>'mode' IN('exact','half_up','half_even','toward_zero','floor','ceiling'),false)
$$;
CREATE FUNCTION public.own_program_node_v1(n jsonb,depth integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE op text:=n->>'op';k text;c jsonb;nodes integer:=1;inputs jsonb:='[]';refs jsonb:='[]';keys text[];
BEGIN
 IF depth>32 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT'; END IF;
 CASE op WHEN 'literal' THEN keys:=ARRAY['op','unit','value'];WHEN 'input' THEN keys:=ARRAY['op','unit','key'];WHEN 'concept' THEN keys:=ARRAY['op','code','stage'];WHEN 'round' THEN keys:=ARRAY['op','value','rounding'];WHEN 'convert' THEN keys:=ARRAY['op','value','unit','factor','conversionReference'];WHEN 'choose' THEN keys:=ARRAY['op','condition','then','else'];WHEN 'compare' THEN keys:=ARRAY['op','operator','left','right'];ELSE IF op IN('add','subtract','multiply','divide','min','max') THEN keys:=ARRAY['op','left','right'];ELSE RAISE EXCEPTION 'OWN_PROGRAM_OPERATION_UNSUPPORTED';END IF;END CASE;
 IF NOT public.own_program_exact_v1(n,keys) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID'; END IF;
 IF jsonb_typeof(n->'op') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOREACH k IN ARRAY ARRAY['unit','key','code','stage','operator'] LOOP IF k=ANY(keys) AND jsonb_typeof(n->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
 IF op IN('literal','input','convert') AND coalesce(n->>'unit' IN('money','hours','minutes','percent','units','coefficient'),false) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH'; END IF;
 IF op='literal' AND(jsonb_typeof(n->'value') IS DISTINCT FROM 'string' OR n->>'value'!~'^-?(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$' OR n->>'value'~'^-0(\.0+)?$') THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF op='input' THEN IF n->>'key' IS NULL OR n->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;inputs:=jsonb_build_array(jsonb_build_object('key',n->>'key','unit',n->>'unit'));END IF;
 IF op='concept' AND(n->>'code' IS NULL OR n->>'code'!~'^[0-9]{1,9}$' OR coalesce(n->>'stage' IN('exact','rounded'),false) IS NOT TRUE) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF op='concept' THEN refs:=jsonb_build_array(n->>'code');END IF;
 IF op='round' AND NOT public.own_program_rounding_v1(n->'rounding') THEN RAISE EXCEPTION 'OWN_PROGRAM_ROUNDING_REQUIRED';END IF;
 IF op='convert' AND(jsonb_typeof(n->'factor') IS DISTINCT FROM 'string' OR n->>'factor'!~'^-?(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$' OR n->>'factor'~'^-0(\.0+)?$' OR NOT public.own_program_text_v1(n->'conversionReference',3,180)) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF op='compare' AND coalesce(n->>'operator' IN('lt','le','eq','ne','ge','gt'),false) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOREACH k IN ARRAY ARRAY['left','right','value','condition','then','else'] LOOP IF jsonb_typeof(n->k)='object' THEN c:=public.own_program_node_v1(n->k,depth+1);nodes:=nodes+(c->>'nodes')::integer;inputs:=inputs||(c->'inputs');refs:=refs||(c->'refs');ELSIF (k=ANY(keys) AND k IN('left','right','condition','then','else')) OR(k='value' AND op IN('round','convert')) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
 IF nodes>256 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;RETURN jsonb_build_object('nodes',nodes,'inputs',inputs,'refs',refs);
END $$;
CREATE FUNCTION public.own_program_unit_v1(n jsonb,rules jsonb,agreement text,period text,kind_type text,path_codes text[],depth integer DEFAULT 0) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE op text:=n->>'op';a text;b text;target jsonb;num integer;
BEGIN
 IF depth>32 OR cardinality(path_codes)>64 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
 IF op IN('literal','input') THEN RETURN n->>'unit';END IF;
 IF op='concept' THEN
  IF n->>'code'=ANY(path_codes) THEN RAISE EXCEPTION 'OWN_PROGRAM_CYCLE';END IF;
  SELECT count(*),jsonb_agg(r)->0 INTO num,target FROM jsonb_array_elements(rules) r WHERE r->>'agreementCode'=agreement AND r->>'code'=n->>'code' AND r->>'validFrom'<=period AND(r->'validUntil'='null' OR r->>'validUntil'>=period) AND r->'liquidationTypes' ? kind_type;
  IF num<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_DEPENDENCY';END IF;
  -- The definition validator checks dependencies in topological waves. Reading
  -- the already checked declared unit avoids exponential recursive DAG walks.
  RETURN target->>'unit';
 END IF;
 IF op IN('round','convert') THEN a:=public.own_program_unit_v1(n->'value',rules,agreement,period,kind_type,path_codes,depth+1);IF a='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN CASE WHEN op='round' THEN a ELSE n->>'unit' END;END IF;
 IF op='choose' THEN
  IF public.own_program_unit_v1(n->'condition',rules,agreement,period,kind_type,path_codes,depth+1)<>'boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;
  a:=public.own_program_unit_v1(n->'then',rules,agreement,period,kind_type,path_codes,depth+1);b:=public.own_program_unit_v1(n->'else',rules,agreement,period,kind_type,path_codes,depth+1);IF a IS DISTINCT FROM b OR a='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN a;
 END IF;
 a:=public.own_program_unit_v1(n->'left',rules,agreement,period,kind_type,path_codes,depth+1);b:=public.own_program_unit_v1(n->'right',rules,agreement,period,kind_type,path_codes,depth+1);
 IF a='boolean' OR b='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;
 IF op='multiply' THEN IF a<>'coefficient' AND b<>'coefficient' THEN RAISE EXCEPTION 'OWN_PROGRAM_CONVERSION_REQUIRED';END IF;RETURN CASE WHEN a='coefficient' THEN b ELSE a END;END IF;
 IF op='divide' THEN IF b<>'coefficient' AND a<>b THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN CASE WHEN a=b THEN 'coefficient' ELSE a END;END IF;
 IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN CASE WHEN op='compare' THEN 'boolean' ELSE a END;
END $$;
CREATE FUNCTION public.own_program_coverage_v1(rows jsonb,from_month text,until_month text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;cursor_month text:=from_month;last_month text;required_until text:=coalesce(until_month,'9999-12');
BEGIN FOR r IN SELECT value FROM jsonb_array_elements(coalesce(rows,'[]')) ORDER BY value->>'validFrom' LOOP last_month:=coalesce(r->>'validUntil','9999-12');IF last_month<cursor_month THEN CONTINUE;END IF;IF r->>'validFrom'>cursor_month THEN RETURN false;END IF;IF last_month>=required_until THEN RETURN true;END IF;cursor_month:=to_char((last_month||'-01')::date+interval '1 month','YYYY-MM');END LOOP;RETURN false;END $$;
CREATE FUNCTION public.own_program_definition_v1(p jsonb,items jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;b jsonb;i jsonb;node jsonb;matching jsonb;period text;kind_type text;normalized jsonb;used_keys text[]:='{}';binding_id text;field text;group_row record;active_rules jsonb;done_codes text[];ready_codes text[];wave integer;checked integer:=0;work integer:=0;
BEGIN
 IF NOT public.own_program_exact_v1(p,ARRAY['rules','bindings','totalsPrecision']) OR jsonb_typeof(p->'totalsPrecision') IS DISTINCT FROM 'number' OR p->>'totalsPrecision'!~'^[0-8]$' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rules') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'bindings')>1000 THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p->'bindings') LOOP
  FOREACH field IN ARRAY ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'] LOOP IF jsonb_typeof(b->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;END LOOP;
  IF NOT public.own_program_exact_v1(b,ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference']) OR b->>'agreementCode' IS NULL OR b->>'agreementCode'!~'^[0-9]{1,9}$' OR b->>'sourceCode' IS NULL OR b->>'sourceCode'!~'^[0-9]{1,9}$' OR b->>'key' IS NULL OR b->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$' OR coalesce(b->>'unit' IN('money','hours','minutes','percent','units','coefficient'),false) IS NOT TRUE OR coalesce(b->>'sourceKind' IN('parameter','scale','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount'),false) IS NOT TRUE OR coalesce(b->>'combine' IN('single','sum'),false) IS NOT TRUE OR coalesce(b->>'onMissing' IN('error','zero'),false) IS NOT TRUE OR NOT public.own_program_text_v1(b->'ruleReference',3,180) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind' IN('parameter','scale') AND(b->>'combine'<>'single' OR b->>'onMissing'<>'error') OR b->>'sourceKind' IN('scale','monthly_amount','fixed_amount') AND b->>'unit'<>'money' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') x GROUP BY x->>'agreementCode',x->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_DUPLICATE';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rules') LOOP
  FOREACH field IN ARRAY ARRAY['code','agreementCode','nature','unit','validFrom','ruleReference'] LOOP IF jsonb_typeof(r->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
  IF jsonb_typeof(r->'validUntil') NOT IN('string','null') THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF NOT public.own_program_exact_v1(r,ARRAY['code','agreementCode','nature','unit','validFrom','validUntil','liquidationTypes','ruleReference','rounding','expression']) OR r->>'code' IS NULL OR r->>'code'!~'^[0-9]{1,9}$' OR r->>'agreementCode' IS NULL OR r->>'agreementCode'!~'^[0-9]{1,9}$' OR coalesce(r->>'nature' IN('remuneration','non_remuneration','deduction','employer_contribution','auxiliary'),false) IS NOT TRUE OR coalesce(r->>'unit' IN('money','hours','minutes','percent','units','coefficient'),false) IS NOT TRUE OR r->>'nature'<>'auxiliary' AND r->>'unit'<>'money' OR r->>'validFrom' IS NULL OR r->>'validFrom'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR (r->'validUntil'<>'null' AND(r->>'validUntil'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR r->>'validUntil'<r->>'validFrom')) OR NOT public.own_program_text_v1(r->'ruleReference',3,180) OR NOT public.own_program_rounding_v1(r->'rounding') OR jsonb_typeof(r->'liquidationTypes') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'liquidationTypes') NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'liquidationTypes') t WHERE jsonb_typeof(t)<>'string' OR t#>>'{}' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')) OR (SELECT count(*)<>count(DISTINCT t) FROM jsonb_array_elements_text(r->'liquidationTypes') t) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  node:=public.own_program_node_v1(r->'expression');
  work:=work+(node->>'nodes')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
  SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'kind'='concept' AND d->>'agreementCode'=r->>'agreementCode' AND d->>'code'=r->>'code' AND d->>'nature'=r->>'nature' AND(r->>'nature'<>'auxiliary' OR d->>'unit'=r->>'unit');
  IF NOT public.own_program_coverage_v1(matching,r->>'validFrom',r->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_DEFINITION_MISSING';END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(node->'inputs') LOOP
   SELECT x INTO b FROM jsonb_array_elements(p->'bindings') x WHERE x->>'agreementCode'=r->>'agreementCode' AND x->>'key'=i->>'key';
   IF NOT FOUND OR b->>'unit' IS DISTINCT FROM i->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_MISSING';END IF;binding_id:=(b->>'agreementCode')||':'||(b->>'key');used_keys:=used_keys||binding_id;
   SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'agreementCode'=b->>'agreementCode' AND d->>'code'=b->>'sourceCode' AND d->>'kind'=CASE WHEN b->>'sourceKind'='scale' THEN 'scale' ELSE 'concept' END AND(b->>'sourceKind' IN('scale','monthly_amount','fixed_amount') OR d->>'unit'=b->>'unit') AND(b->>'sourceKind'<>'parameter' OR d->'value'<>'null');
   IF NOT public.own_program_coverage_v1(matching,r->>'validFrom',r->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_DEFINITION_MISSING';END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rules') WITH ORDINALITY a(value,n),jsonb_array_elements(p->'rules') WITH ORDINALITY other(value,m) WHERE a.n<other.m AND a.value->>'agreementCode'=other.value->>'agreementCode' AND a.value->>'code'=other.value->>'code' AND coalesce(a.value->>'validUntil','9999-12')>=other.value->>'validFrom' AND coalesce(other.value->>'validUntil','9999-12')>=a.value->>'validFrom' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(a.value->'liquidationTypes') t WHERE other.value->'liquidationTypes' ? t)) THEN RAISE EXCEPTION 'OWN_PROGRAM_OVERLAP';END IF;
 FOR group_row IN SELECT DISTINCT x->>'agreementCode' agreement,t.kind FROM jsonb_array_elements(p->'rules') x CROSS JOIN LATERAL jsonb_array_elements_text(x->'liquidationTypes') t(kind) LOOP
  kind_type:=group_row.kind;
  FOR period IN SELECT DISTINCT v FROM(SELECT x->>'validFrom' v FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type UNION SELECT to_char((x->>'validUntil'||'-01')::date+interval '1 month','YYYY-MM') FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type AND x->'validUntil'<>'null') s LOOP
   SELECT coalesce(jsonb_agg(x),'[]') INTO active_rules FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type AND x->>'validFrom'<=period AND coalesce(x->>'validUntil','9999-12')>=period;
   checked:=checked+jsonb_array_length(active_rules);IF checked>50000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
   done_codes:='{}';wave:=0;
   WHILE cardinality(done_codes)<jsonb_array_length(active_rules) LOOP
    wave:=wave+1;IF wave>64 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;ready_codes:='{}';
    FOR r IN SELECT x FROM jsonb_array_elements(active_rules) x WHERE NOT(x->>'code'=ANY(done_codes)) LOOP
     node:=public.own_program_node_v1(r->'expression');
     work:=work+2*(node->>'nodes')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) target WHERE target->>'code'=c)) THEN RAISE EXCEPTION 'OWN_PROGRAM_DEPENDENCY';END IF;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') c WHERE NOT(c=ANY(done_codes))) THEN
      IF public.own_program_unit_v1(r->'expression',active_rules,group_row.agreement,period,kind_type,ARRAY[r->>'code']) IS DISTINCT FROM r->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;ready_codes:=ready_codes||(r->>'code');
     END IF;
    END LOOP;
    IF cardinality(ready_codes)=0 THEN RAISE EXCEPTION 'OWN_PROGRAM_CYCLE';END IF;done_codes:=done_codes||ready_codes;
   END LOOP;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') bound(value) WHERE NOT((bound.value->>'agreementCode')||':'||(bound.value->>'key')=ANY(used_keys))) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_UNUSED';END IF;
 SELECT jsonb_build_object('rules',(SELECT jsonb_agg(x ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'code') COLLATE "C",x->>'validFrom',(SELECT string_agg(t,',' ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(x->'liquidationTypes') t) COLLATE "C") FROM jsonb_array_elements(p->'rules') x),'bindings',(SELECT coalesce(jsonb_agg(x ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'key') COLLATE "C"),'[]') FROM jsonb_array_elements(p->'bindings') x),'totalsPrecision',p->'totalsPrecision') INTO normalized;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rules') rule_row(value) WHERE rule_row.value->'liquidationTypes' IS DISTINCT FROM(SELECT jsonb_agg(t ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(rule_row.value->'liquidationTypes') t)) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;RETURN normalized;
END $$;
CREATE FUNCTION public.own_program_current_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_payroll_program_event;p public.own_payroll_program_event;rev integer;definition jsonb;
BEGIN SELECT * INTO e FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='approve' ORDER BY revision DESC LIMIT 1;rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_payroll_program_event WHERE id=e.proposal_id;END IF;definition:=p.body->'program';
 RETURN jsonb_build_object('version',encode(public.digest(jsonb_build_array('own-payroll-program.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,e.id,definition)::text,'sha256'),'hex'),'revision',rev,'definition',definition,'salaryVersion',p.body->>'salaryVersion','proposalId',p.id,'approvalId',e.id);
END $$;
CREATE FUNCTION public.own_program_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM public.native_salary_lock_v1(ctx);IF NOT pg_try_advisory_xact_lock(hashtextextended('own-program:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'OWN_PROGRAM_BUSY';END IF;END $$;
CREATE FUNCTION public.own_program_proposal_v1(ctx jsonb,e public.own_payroll_program_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_payroll_program_event;independent boolean;
BEGIN SELECT * INTO d FROM public.own_payroll_program_event WHERE proposal_id=e.id;independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','salaryVersion',e.body->>'salaryVersion','salaryItems',e.base_salary_items,'baseDefinition',e.base_definition,'definition',e.body->'program','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.own_program_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;catalog jsonb;proposals jsonb;
BEGIN ctx:=public.native_salary_context_v1(p);PERFORM public.own_program_lock_v1(ctx);catalog:=public.native_salary_catalog_v1(ctx);SELECT coalesce(jsonb_agg(public.own_program_proposal_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals FROM public.own_payroll_program_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose';
 RETURN jsonb_build_object('version','own-payroll-program.v1','scopeVersion',public.native_salary_scope_v1(ctx),'salaryCatalog',catalog,'program',public.own_program_current_v1(ctx),'proposals',proposals,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'payrollCalculated',false,'payrollPosted',false);
END $$;
CREATE FUNCTION public.own_program_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_program_event;
BEGIN ctx:=public.native_salary_context_v1(p);SELECT * INTO e FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;IF NOT FOUND THEN RAISE EXCEPTION 'OWN_PROGRAM_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORBIDDEN';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_program_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;current_program jsonb;catalog jsonb;proposal public.own_payroll_program_event;prior public.own_payroll_program_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;source_items jsonb;field text;
BEGIN
 ctx:=public.native_salary_context_v1(p);cmd:=body->>'command';
 FOREACH field IN ARRAY ARRAY['command','scopeVersion','baseVersion','salaryVersion','reason'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
 IF jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['command','scopeVersion','baseVersion','salaryVersion','proposalId','proposalSha256','program','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>4194304 OR body->>'scopeVersion' IS NULL OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' OR body->>'baseVersion' IS NULL OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'salaryVersion' IS NULL OR body->>'salaryVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'OWN_PROGRAM_EMPLOYMENT_REQUIRED';END IF;
 PERFORM public.own_program_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;RETURN public.own_program_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'OWN_PROGRAM_SCOPE_CHANGED';END IF;
 current_program:=public.own_program_current_v1(ctx);catalog:=public.native_salary_catalog_v1(ctx);rev:=(current_program->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' OR (catalog->>'revision')::integer=0 THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;
  definition:=public.own_program_definition_v1(body->'program',catalog->'items');IF definition IS DISTINCT FROM body->'program' OR definition=current_program->'definition' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(current_program->'definition','null')->'rules','[]')) old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(definition->'rules') n WHERE jsonb_build_array(n->>'agreementCode',n->>'code',n->>'validFrom',n->'liquidationTypes')=jsonb_build_array(old->>'agreementCode',old->>'code',old->>'validFrom',old->'liquidationTypes'))) THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  pid:=eid;baseline:=current_program->'definition';source_items:=catalog->'items';
 ELSE
  IF body->'program'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_payroll_program_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWN_PROGRAM_NOT_FOUND';END IF;IF EXISTS(SELECT 1 FROM public.own_payroll_program_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'OWN_PROGRAM_DECIDED';END IF;
  IF NOT(public.own_program_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'OWN_PROGRAM_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'salaryVersion' IS DISTINCT FROM proposal.body->>'salaryVersion' THEN RAISE EXCEPTION 'OWN_PROGRAM_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_definition;source_items:=proposal.base_salary_items;
  IF cmd='approve' THEN IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;definition:=public.own_program_definition_v1(proposal.body->'program',catalog->'items');rev:=rev+1;current_program:=jsonb_build_object('version',encode(public.digest(jsonb_build_array('own-payroll-program.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,definition)::text,'sha256'),'hex'));END IF;
 END IF;
 IF rev>1000 OR (SELECT count(*) FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=1000 AND cmd='propose' THEN RAISE EXCEPTION 'OWN_PROGRAM_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-program:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_PROGRAM_BUSY';END IF;
 IF (SELECT coalesce(sum(octet_length(cap.body::text)+octet_length(cap.base_definition::text)+octet_length(cap.base_salary_items::text)+octet_length(cap.receipt::text)),0) FROM public.own_payroll_program_event cap)+4*octet_length(body::text)+octet_length(baseline::text)+octet_length(source_items::text)>268435456 OR (SELECT coalesce(sum(octet_length(cap.body::text)+octet_length(cap.base_definition::text)+octet_length(cap.base_salary_items::text)+octet_length(cap.receipt::text)),0) FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)+4*octet_length(body::text)+octet_length(baseline::text)+octet_length(source_items::text)>33554432 THEN RAISE EXCEPTION 'OWN_PROGRAM_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-payroll-program.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'programVersion',current_program->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_payroll_program_event(id,tenant_id,source_binding_id,proposal_id,command,body,base_definition,base_salary_items,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,coalesce(baseline,'null'),source_items,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.own_program_immutable_v1(),public.own_program_exact_v1(jsonb,text[]),public.own_program_text_v1(jsonb,integer,integer),public.own_program_rounding_v1(jsonb),public.own_program_node_v1(jsonb,integer),public.own_program_unit_v1(jsonb,jsonb,text,text,text,text[],integer),public.own_program_coverage_v1(jsonb,text,text),public.own_program_definition_v1(jsonb,jsonb),public.own_program_current_v1(jsonb),public.own_program_lock_v1(jsonb),public.own_program_proposal_v1(jsonb,public.own_payroll_program_event),public.own_program_bootstrap_v1(jsonb),public.own_program_attempt_v1(jsonb,uuid),public.own_program_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_program_bootstrap_v1(jsonb),public.own_program_attempt_v1(jsonb,uuid),public.own_program_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
