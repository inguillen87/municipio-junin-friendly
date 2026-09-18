-- Runs only on the explicitly named private loopback restoration, always rolls back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'current_rehearsal' OR inet_server_addr()<>'127.0.0.1'::inet OR inet_server_port()<>55441
 THEN RAISE EXCEPTION 'LOCAL_RESTORE_ONLY'; END IF;
END $$;
SET LOCAL timezone='UTC';
SET LOCAL search_path=public,pg_catalog;
ALTER FUNCTION public.is_valid_cuil(text) RESET search_path;
ALTER FUNCTION public.normalize_digits(text) RESET search_path;
CREATE TEMP TABLE normalizer_oracle AS
 SELECT input,public.normalize_digits(input) digits,public.is_valid_cuil(input) valid
 FROM (SELECT lpad(n::text,11,'0') input FROM generate_series(1,20000)n
 UNION ALL SELECT unnest(ARRAY[NULL,'','00000000000','20-12345678-6',' 27.999.888.777 ','no es un documento','1e10']))q;
SET LOCAL search_path='';
DO $$ DECLARE failed boolean:=false;
BEGIN
 BEGIN PERFORM public.is_valid_cuil('20123456786'); EXCEPTION WHEN undefined_function THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'RESTORE_FAILURE_NOT_REPRODUCED'; END IF;
END $$;
\ir ../../scripts/migrations/075-restore-safe-identity-functions.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.normalizer_oracle r WHERE r.digits IS DISTINCT FROM public.normalize_digits(r.input) OR r.valid IS DISTINCT FROM public.is_valid_cuil(r.input))
 THEN RAISE EXCEPTION 'RESTORE_FIX_CHANGED_OUTPUT'; END IF;
END $$;
CREATE SCHEMA qa_restore_shadow;
CREATE FUNCTION qa_restore_shadow.normalize_digits(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT ''00000000000''::text';
SET LOCAL search_path=qa_restore_shadow,public,pg_catalog;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.normalizer_oracle r WHERE r.valid IS DISTINCT FROM public.is_valid_cuil(r.input))
 THEN RAISE EXCEPTION 'RESTORE_FIX_SHADOWED'; END IF;
END $$;
\ir ../../scripts/migrations/075-restore-safe-identity-functions.sql
SET LOCAL search_path='';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.person_identity WHERE cuil IS NOT NULL AND NOT public.is_valid_cuil(cuil))
 THEN RAISE EXCEPTION 'RESTORED_IDENTITY_INVALID'; END IF;
END $$;
SELECT pg_catalog.json_build_object('ok',true,'comparisons',(SELECT count(*) FROM pg_temp.normalizer_oracle),
 'emptySearchPathPassed',true,'shadowSchemaIgnored',true,'replayPassed',true,'productionWrites',0,
 'restoredContracts',(SELECT count(*) FROM public.employment_contract),
 'restoredMovements',(SELECT count(*) FROM public.employment_movement),
 'restoredMonthlyFacts',(SELECT count(*) FROM public.payroll_monthly_fact),
 'restoredPublicTables',(SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'));
ROLLBACK;
