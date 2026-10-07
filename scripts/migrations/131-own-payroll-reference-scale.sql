-- SQL131: explicit approved reference scale; only the program validator changes.
DO $metadata$ DECLARE x jsonb;p pg_proc; BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements('[{"name":"own_program_definition_v1","signature":"public.own_program_definition_v1(jsonb,jsonb)","sha256":"6f6fd0f14dcc619588dde691c914cf2e8c7c5a4895c5c6f5f78a8f53aaa5e4ef","argNames":["p","items"],"defaults":"","resultType":"jsonb","language":"plpgsql","returnsSet":false,"strict":false,"definer":true,"volatility":"i","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false}]'::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.prosecdef IS DISTINCT FROM (x->>'definer')::boolean OR p.proisstrict IS DISTINCT FROM (x->>'strict')::boolean OR p.proretset IS DISTINCT FROM (x->>'returnsSet')::boolean
   OR p.prorettype<>(x->>'resultType')::regtype OR p.provolatile<>x->>'volatility' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>(CASE WHEN p.proretset THEN 1000 ELSE 0 END)
   OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'argNames' OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'
   OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM x->'config' OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x->>'sha256'
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM (x->>'runtime')::boolean
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'SQL131_PREREQUISITE_CHANGED' USING DETAIL=x->>'signature'; END IF;
 END LOOP; END $metadata$;
CREATE OR REPLACE FUNCTION public.own_program_definition_v1(p jsonb,items jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;b jsonb;i jsonb;node jsonb;matching jsonb;period text;kind_type text;normalized jsonb;used_keys text[]:='{}';binding_id text;field text;group_row record;active_rules jsonb;done_codes text[];ready_codes text[];wave integer;checked integer:=0;work integer:=0;
BEGIN
 IF NOT public.own_program_exact_v1(p,ARRAY['rules','bindings','totalsPrecision']) OR jsonb_typeof(p->'totalsPrecision') IS DISTINCT FROM 'number' OR p->>'totalsPrecision'!~'^[0-8]$' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rules') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'bindings')>1000 THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p->'bindings') LOOP
  FOREACH field IN ARRAY ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'] LOOP IF jsonb_typeof(b->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;END LOOP;
  IF NOT public.own_program_exact_v1(b,CASE WHEN b->>'sourceKind'='scale_reference' THEN ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference','sourceAgreementCode','sourceCategoryCode'] ELSE ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'] END) OR b->>'agreementCode' IS NULL OR b->>'agreementCode'!~'^[0-9]{1,9}$' OR b->>'sourceCode' IS NULL OR b->>'sourceCode'!~'^[0-9]{1,9}$' OR b->>'key' IS NULL OR b->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$' OR coalesce(b->>'unit' IN('money','hours','minutes','percent','units','coefficient'),false) IS NOT TRUE OR coalesce(b->>'sourceKind' IN('parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount'),false) IS NOT TRUE OR coalesce(b->>'combine' IN('single','sum'),false) IS NOT TRUE OR coalesce(b->>'onMissing' IN('error','zero'),false) IS NOT TRUE OR NOT public.own_program_text_v1(b->'ruleReference',3,180) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='scale_reference' AND(jsonb_typeof(b->'sourceAgreementCode') IS DISTINCT FROM 'string' OR b->>'sourceAgreementCode'!~'^[0-9]{1,9}$' OR jsonb_typeof(b->'sourceCategoryCode') IS DISTINCT FROM 'string' OR b->>'sourceCategoryCode'!~'^[0-9]{1,9}$') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind' IN('parameter','scale','scale_reference') AND(b->>'combine'<>'single' OR b->>'onMissing'<>'error') OR b->>'sourceKind' IN('scale','scale_reference','monthly_amount','fixed_amount') AND b->>'unit'<>'money' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
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
   SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'agreementCode'=CASE WHEN b->>'sourceKind'='scale_reference' THEN b->>'sourceAgreementCode' ELSE b->>'agreementCode' END AND(b->>'sourceKind'<>'scale_reference' OR d->>'categoryCode'=b->>'sourceCategoryCode') AND d->>'code'=b->>'sourceCode' AND d->>'kind'=CASE WHEN b->>'sourceKind' IN('scale','scale_reference') THEN 'scale' ELSE 'concept' END AND(b->>'sourceKind' IN('scale','scale_reference','monthly_amount','fixed_amount') OR d->>'unit'=b->>'unit') AND(b->>'sourceKind'<>'parameter' OR d->'value'<>'null');
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
