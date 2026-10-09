-- M4: conserve separately declared bank destinations. No rows, tables, grants,
-- calculations, postings or payments are changed. Older fifteen-field rows and
-- their frozen commands remain valid; twenty-one-field rows require a complete
-- explicitly versioned declaration. History still forbids enriching old rows.
DO $guard$
DECLARE p pg_proc;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.own_accounting_definition_v1(jsonb,jsonb,jsonb)');
 IF p.oid IS NULL THEN RAISE EXCEPTION 'ACCOUNTING_BANK_PREREQUISITE';END IF;
 IF position('own-accounting-bank-destination.v1' IN p.prosrc)>0 THEN RAISE EXCEPTION 'ACCOUNTING_BANK_ALREADY_INSTALLED';END IF;
 IF encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>'a7d2391d89c5aabcc6f4e7e403219e6f1469e216d8967e1de33ac60b37d52d07' OR p.provolatile<>'i' OR NOT p.prosecdef OR p.prorettype<>'jsonb'::regtype OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp'] THEN RAISE EXCEPTION 'ACCOUNTING_BANK_FUNCTION_DRIFT';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.own_accounting_definition_v1(d jsonb,sources jsonb,baseline jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;field text;kind text;matching jsonb;result jsonb;
BEGIN
 IF NOT public.own_program_exact_v1(d,ARRAY['mappings','assignments']) OR jsonb_typeof(d->'mappings') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'assignments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 IF jsonb_array_length(d->'mappings')>2000 OR jsonb_array_length(d->'assignments')>10000 THEN RAISE EXCEPTION 'ACCOUNTING_LIMIT';END IF;
 IF jsonb_array_length(d->'mappings')+jsonb_array_length(d->'assignments')=0 THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 PERFORM public.own_accounting_history_v1(baseline,d);
 FOR r IN SELECT value FROM jsonb_array_elements(d->'mappings') LOOP
  IF r ? 'bankDestinationVersion' THEN
   IF NOT public.own_program_exact_v1(r,ARRAY['fiscalYear','jurisdictionCode','agreementCode','departmentCode','conceptCode','nature','budgetItemReference','supplierReference','creditorReference','accountingAccountReference','bankAccountReference','bankReference','validFrom','validUntil','ruleReference','bankDestinationVersion','bankConceptReference','bankMovementReference','netCreditorKind','netCreditorReference','indicatesNet']) OR jsonb_typeof(r->'bankDestinationVersion') IS DISTINCT FROM 'string' OR r->>'bankDestinationVersion'<>'own-accounting-bank-destination.v1' OR jsonb_typeof(r->'netCreditorKind') IS DISTINCT FROM 'string' OR r->>'netCreditorKind' NOT IN('not_informed','none','reference') OR jsonb_typeof(r->'indicatesNet') NOT IN('null','boolean') THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
   FOREACH field IN ARRAY ARRAY['bankConceptReference','bankMovementReference'] LOOP IF r->field<>'null' AND NOT public.own_program_text_v1(r->field,1,80) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;END LOOP;
   IF (CASE WHEN r->>'netCreditorKind'='reference' THEN NOT public.own_program_text_v1(r->'netCreditorReference',1,80) ELSE r->'netCreditorReference'<>'null' END) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  ELSE
  IF NOT public.own_program_exact_v1(r,ARRAY['fiscalYear','jurisdictionCode','agreementCode','departmentCode','conceptCode','nature','budgetItemReference','supplierReference','creditorReference','accountingAccountReference','bankAccountReference','bankReference','validFrom','validUntil','ruleReference']) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  END IF;
  FOREACH field IN ARRAY ARRAY['fiscalYear','jurisdictionCode','agreementCode','departmentCode','conceptCode','nature'] LOOP IF jsonb_typeof(r->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;END LOOP;
  IF r->>'fiscalYear'!~'^(19|20)[0-9]{2}$' OR r->>'jurisdictionCode' NOT IN('42','55') OR r->>'agreementCode'!~'^[0-9]{1,9}$' OR r->>'departmentCode'!~'^[0-9]{1,9}$' OR r->>'conceptCode'!~'^[0-9]{1,9}$' OR r->>'nature' NOT IN('remuneration','non_remuneration','deduction','employer_contribution') OR NOT public.own_accounting_day_v1(r->'validFrom') OR NOT public.own_accounting_day_v1(r->'validUntil') OR r->>'validUntil'<r->>'validFrom' OR left(r->>'validFrom',4)<>r->>'fiscalYear' OR left(r->>'validUntil',4)<>r->>'fiscalYear' OR NOT public.own_program_text_v1(r->'budgetItemReference',1,80) OR NOT public.own_program_text_v1(r->'ruleReference',3,180) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  FOREACH field IN ARRAY ARRAY['supplierReference','creditorReference','accountingAccountReference','bankAccountReference','bankReference'] LOOP IF r->field<>'null' AND NOT public.own_program_text_v1(r->field,1,80) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;END LOOP;
  -- Immutable prior references stay auditable when a source is later archived.
  -- Only unchanged rows or an earlier closing date qualify; history checked above.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(baseline,'null')->'mappings','[]')) old WHERE public.own_accounting_key_v1(old,'mappings')=public.own_accounting_key_v1(r,'mappings')) THEN CONTINUE;END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'agreements') x WHERE x->>'code'=r->>'agreementCode') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'departments') x WHERE x->>'code'=r->>'departmentCode') THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
  SELECT jsonb_agg(x) INTO matching FROM jsonb_array_elements(sources->'concepts') x WHERE x->>'agreementCode'=r->>'agreementCode' AND x->>'code'=r->>'conceptCode' AND x->>'nature'=r->>'nature';
  IF NOT public.own_program_coverage_v1(matching,left(r->>'validFrom',7),left(r->>'validUntil',7)) THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'assignments') LOOP
  IF NOT public.own_program_exact_v1(r,ARRAY['contractId','conceptCode','institutionalReference','functionReference','validFrom','validUntil','ruleReference']) OR jsonb_typeof(r->'contractId') IS DISTINCT FROM 'string' OR r->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR (r->'conceptCode'<>'null' AND (jsonb_typeof(r->'conceptCode') IS DISTINCT FROM 'string' OR r->>'conceptCode'!~'^[0-9]{1,9}$')) OR NOT public.own_program_text_v1(r->'institutionalReference',1,80) OR NOT public.own_program_text_v1(r->'functionReference',1,80) OR NOT public.own_program_text_v1(r->'ruleReference',3,180) OR NOT public.own_accounting_day_v1(r->'validFrom') OR (r->'validUntil'<>'null' AND (NOT public.own_accounting_day_v1(r->'validUntil') OR r->>'validUntil'<r->>'validFrom')) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'assignments') a LEFT JOIN jsonb_array_elements(coalesce(nullif(baseline,'null')->'assignments','[]')) old ON public.own_accounting_key_v1(a,'assignments')=public.own_accounting_key_v1(old,'assignments') LEFT JOIN jsonb_array_elements(sources->'contracts') c ON lower(a->>'contractId')=lower(c->>'contractId') WHERE old IS NULL AND c IS NULL) OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'assignments') a LEFT JOIN jsonb_array_elements(coalesce(nullif(baseline,'null')->'assignments','[]')) old ON public.own_accounting_key_v1(a,'assignments')=public.own_accounting_key_v1(old,'assignments') LEFT JOIN(SELECT DISTINCT x->>'code' code FROM jsonb_array_elements(sources->'concepts') x) c ON a->>'conceptCode'=c.code WHERE old IS NULL AND a->'conceptCode'<>'null' AND c.code IS NULL) THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
 -- Window comparisons are linear after sorting, including earlier open intervals.
 FOREACH kind IN ARRAY ARRAY['mappings','assignments'] LOOP
  IF EXISTS(SELECT 1 FROM(SELECT entries.row_data->>'validFrom' started,max(coalesce(entries.row_data->>'validUntil','9999-12-31')) OVER(PARTITION BY left(public.own_accounting_key_v1(entries.row_data,kind),length(public.own_accounting_key_v1(entries.row_data,kind))-11) ORDER BY entries.row_data->>'validFrom' ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prior_end FROM jsonb_array_elements(d->kind) AS entries(row_data)) x WHERE x.prior_end>=x.started) THEN RAISE EXCEPTION 'ACCOUNTING_OVERLAP';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(SELECT entries.row_data,max(CASE WHEN entries.row_data->'conceptCode'='null' THEN coalesce(entries.row_data->>'validUntil','9999-12-31') END) OVER w generic_end,max(CASE WHEN entries.row_data->'conceptCode'<>'null' THEN coalesce(entries.row_data->>'validUntil','9999-12-31') END) OVER w specific_end FROM jsonb_array_elements(d->'assignments') AS entries(row_data) WINDOW w AS(PARTITION BY lower(entries.row_data->>'contractId') ORDER BY entries.row_data->>'validFrom',(entries.row_data->'conceptCode'<>'null') ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) intervals WHERE CASE WHEN intervals.row_data->'conceptCode'='null' THEN intervals.specific_end ELSE intervals.generic_end END>=intervals.row_data->>'validFrom') THEN RAISE EXCEPTION 'ACCOUNTING_OVERLAP';END IF;
 SELECT jsonb_build_object('mappings',(SELECT coalesce(jsonb_agg(entries.row_data ORDER BY public.own_accounting_key_v1(entries.row_data,'mappings') COLLATE "C"),'[]') FROM jsonb_array_elements(d->'mappings') AS entries(row_data)),'assignments',(SELECT coalesce(jsonb_agg(entries.row_data ORDER BY public.own_accounting_key_v1(entries.row_data,'assignments') COLLATE "C"),'[]') FROM jsonb_array_elements(d->'assignments') AS entries(row_data))) INTO result;
 RETURN result;
END $$;
