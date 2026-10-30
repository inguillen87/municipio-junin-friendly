-- Forward215: source-derived raw indices; unchanged arithmetic, validation and output order.
-- Performance remains subject to the reviewed native workload.
CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1(detail jsonb,selection jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE kind text:=selection->>'kind';row_value jsonb;capture jsonb;saved jsonb;total jsonb;concept jsonb;employees jsonb:='[]';concepts jsonb[]:='{}';chosen text[]:='{}';key_value text;val text;precision integer:=0;totals jsonb:='{"remuneration":0,"non_remuneration":0,"deduction":0,"employer_contribution":0,"gross":0,"net":0}';amount numeric;expected numeric;formatted jsonb:='{}';jurisdiction_cache jsonb:='{}';has_namespaced boolean:=false;saved_meta_cache jsonb:='{}';total_index jsonb:='{}';total_counts jsonb:='{}';concept_index jsonb:='{}';concept_indexed jsonb:='{}';capture_totals jsonb;capture_concepts jsonb;capture_key text;cache_key text;BEGIN
 IF NOT public.own_program_exact_v1(selection,ARRAY['kind','values']) OR jsonb_typeof(selection->'kind') IS DISTINCT FROM 'string' OR kind NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(selection->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(selection->'values')>10000 OR(kind='all')<>(jsonb_array_length(selection->'values')=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection->'values') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(selection->'values'))<>jsonb_array_length(selection->'values') OR selection->'values' IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(selection->'values') x) THEN RAISE EXCEPTION 'OWN_CLOSE_SELECTION_INVALID';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(detail->'rows') ORDER BY value->>'contractId' COLLATE "C" LOOP
  val:=row_value->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END;
  IF kind<>'all' AND NOT selection->'values' ? val THEN CONTINUE;END IF;
  IF row_value->>'state'<>'confirmed' OR row_value->'canClose' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'OWN_CLOSE_DECISION_INVALID';END IF;
  chosen:=array_append(chosen,val);capture_key:=row_value->>'runId';
  IF saved_meta_cache ? capture_key THEN
   capture:=jsonb_build_object('id',capture_key);saved:=saved_meta_cache->capture_key;
  ELSE
   SELECT x.value INTO capture FROM jsonb_array_elements(detail->'captures') WITH ORDINALITY x(value,ordinality) WHERE x.value->>'id'=capture_key ORDER BY x.ordinality LIMIT 1;saved:=capture->'saved';
  END IF;has_namespaced:=has_namespaced OR(saved#>>'{input,version}'='own-payroll-input.v2');IF NOT jurisdiction_cache ? (capture->>'id') THEN jurisdiction_cache:=jurisdiction_cache||jsonb_build_object(capture->>'id',public.own_run_jurisdictions_v1(capture));END IF;IF jurisdiction_cache->(capture->>'id') IS DISTINCT FROM 'null'::jsonb AND NOT (jurisdiction_cache->(capture->>'id')) ? (row_value->>'contractId') THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;
  cache_key:=jsonb_build_array(capture->>'id',row_value->>'contractId')::text;
  IF saved_meta_cache ? capture_key THEN total:=total_index->cache_key;
  ELSE
   -- Keep the original non-STRICT first-total read before building a raw index.
   SELECT x.value INTO total FROM jsonb_array_elements(saved#>'{result,employeeTotals}') x WHERE x.value->>'contractId'=row_value->>'contractId';
   IF capture->>'id' IS NOT NULL THEN
    SELECT coalesce(jsonb_object_agg(p215_first_total.entry_key,p215_first_total.entry_value),'{}'::jsonb) INTO capture_totals
    FROM(SELECT DISTINCT ON ((p215_total_row.value->>'contractId') COLLATE "C")
     jsonb_build_array(capture->>'id',p215_total_row.value->>'contractId')::text AS entry_key,p215_total_row.value AS entry_value
     FROM jsonb_array_elements(saved#>'{result,employeeTotals}') WITH ORDINALITY p215_total_row(value,ordinality)
     WHERE p215_total_row.value->>'contractId' IS NOT NULL
     ORDER BY (p215_total_row.value->>'contractId') COLLATE "C",p215_total_row.ordinality) p215_first_total;
    total_index:=total_index||capture_totals;
    total_counts:=total_counts||jsonb_build_object(capture_key,jsonb_array_length(saved#>'{result,employeeTotals}'));
    saved_meta_cache:=saved_meta_cache||jsonb_build_object(capture_key,jsonb_build_object(
     'inputSha256',saved->'inputSha256','resultSha256',saved->'resultSha256',
     'input',jsonb_build_object('version',saved#>'{input,version}','totalsPrecision',saved#>'{input,totalsPrecision}'),
     'result',jsonb_build_object('employeeCount',saved#>'{result,employeeCount}','payrollPosted',saved#>'{result,payrollPosted}')));
   END IF;
  END IF;
  IF total IS NULL OR (total_counts->>capture_key)::integer<>(saved#>>'{result,employeeCount}')::integer OR saved#>'{result,payrollPosted}' IS DISTINCT FROM 'false'::jsonb OR(saved#>>'{input,totalsPrecision}')::integer NOT BETWEEN 0 AND 8 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  precision:=greatest(precision,(saved#>>'{input,totalsPrecision}')::integer);
  FOREACH key_value IN ARRAY ARRAY['remuneration','non_remuneration','deduction','employer_contribution','gross','net'] LOOP
   IF jsonb_typeof(total->key_value) IS DISTINCT FROM 'string' OR total->>key_value!~'^-?(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;amount:=(total->>key_value)::numeric;
   IF key_value IN('gross','net') THEN expected:=(total->>'remuneration')::numeric+(total->>'non_remuneration')::numeric-CASE WHEN key_value='net' THEN(total->>'deduction')::numeric ELSE 0 END;
   ELSE
    -- Raw grouping is lazy at the first original SUM, after the current total's
    -- type/regex and amount cast. Never cast another contract/nature eagerly.
    IF NOT concept_indexed ? capture_key THEN
     SELECT coalesce(jsonb_object_agg(p215_concept_group.entry_key,p215_concept_group.entry_value),'{}'::jsonb) INTO capture_concepts
     FROM(SELECT jsonb_build_array(capture->>'id',p215_concept_row.value->>'contractId')::text AS entry_key,
      jsonb_agg(p215_concept_row.value ORDER BY p215_concept_row.ordinality) AS entry_value
      FROM jsonb_array_elements(saved#>'{result,rows}') WITH ORDINALITY p215_concept_row(value,ordinality)
      WHERE p215_concept_row.value->>'contractId' IS NOT NULL
      GROUP BY p215_concept_row.value->>'contractId') p215_concept_group;
     concept_index:=concept_index||capture_concepts;concept_indexed:=concept_indexed||jsonb_build_object(capture_key,true);
    END IF;
    SELECT coalesce(sum((x.value->>'amount')::numeric),0) INTO expected FROM jsonb_array_elements(coalesce(concept_index->cache_key,'[]'::jsonb)) x WHERE x.value->>'contractId'=row_value->>'contractId' AND x.value->>'nature'=key_value;
   END IF;
   IF amount<>expected OR scale(amount)<>(saved#>>'{input,totalsPrecision}')::integer THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   totals:=jsonb_set(totals,ARRAY[key_value],to_jsonb((totals->>key_value)::numeric+amount));
  END LOOP;
  employees:=employees||jsonb_build_array(jsonb_build_object('contractId',row_value->>'contractId','employeeNumber',row_value->>'employeeNumber','agreementCode',row_value->>'agreementCode','departmentCode',row_value->>'departmentCode','runId',row_value->>'runId','inputSha256',saved->>'inputSha256','resultSha256',saved->>'resultSha256','liquidationVersion',row_value->'liquidationVersion','precision',saved#>'{input,totalsPrecision}','conceptCount',(SELECT count(*) FROM jsonb_array_elements(coalesce(concept_index->cache_key,'[]'::jsonb)) x WHERE x.value->>'contractId'=row_value->>'contractId'),'totals',total,'jurisdiction',coalesce(jurisdiction_cache#>ARRAY[capture->>'id',row_value->>'contractId'],'{"code":null,"basis":"not_captured","sourceSha256":null}'::jsonb))||CASE WHEN saved#>>'{input,version}'='own-payroll-input.v2' THEN jsonb_build_object('namespaceVersion','own-payroll-namespaces.v2') ELSE '{}'::jsonb END);
  FOR concept IN SELECT x.value FROM jsonb_array_elements(coalesce(concept_index->cache_key,'[]'::jsonb)) WITH ORDINALITY x(value,ordinality) WHERE x.value->>'contractId'=row_value->>'contractId' ORDER BY x.ordinality LOOP concepts:=array_append(concepts,concept);END LOOP;
 END LOOP;
 IF jsonb_array_length(employees)=0 OR kind<>'all' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(selection->'values') x WHERE NOT x=ANY(chosen)) THEN RAISE EXCEPTION 'OWN_CLOSE_SELECTION_INVALID';END IF;
 FOREACH key_value IN ARRAY ARRAY['remuneration','non_remuneration','deduction','employer_contribution','gross','net'] LOOP amount:=(totals->>key_value)::numeric;IF amount<>trunc(amount,precision) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;formatted:=formatted||jsonb_build_object(key_value,trunc(amount,precision)::text);END LOOP;
 RETURN jsonb_build_object('version',CASE WHEN has_namespaced THEN 'own-close-snapshot.v3' ELSE 'own-close-snapshot.v2' END,'period',detail->>'period','liquidationType',detail->>'liquidationType','populationDomain',detail->>'populationDomain','rosterVersion',detail->>'rosterVersion','selection',selection,'employeeCount',jsonb_array_length(employees),'populationCount',jsonb_array_length(detail->'rows'),'populationComplete',jsonb_array_length(employees)=jsonb_array_length(detail->'rows'),'precision',precision,'totals',formatted,'employees',employees,'concepts',to_jsonb(concepts),'conceptCount',cardinality(concepts),'payrollCalculated',true,'payrollPosted',false,'paymentExecuted',false);END $$;
