-- Repair restore safety only. No data, validation arithmetic, ownership or ACL changes.
-- pg_restore deliberately uses an empty search_path; identity CHECK calls must remain valid.
DO $repair$
DECLARE r record; definition text; stripped text; original record; repaired record;
 fixed_line text := E' SET search_path TO ''pg_catalog'', ''public'', ''pg_temp''\n';
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('public.normalize_digits(text)','5e5f18b2b074d1668b688c74ab11d3c39aaa0188970077d925590d8de600e33b'),
  ('public.is_valid_cuil(text)','96c9a2e1984b90627dcc32bc04c5c13257c39b9a82a5e80483a8f8b3565139c1')
 ) AS expected(identity,sha256) LOOP
  SELECT p.prosrc,p.proowner,p.proacl,p.provolatile,p.prosecdef,p.proisstrict,p.proconfig
    INTO STRICT original FROM pg_catalog.pg_proc p WHERE p.oid=r.identity::regprocedure;
  definition:=pg_catalog.pg_get_functiondef(r.identity::regprocedure);
  stripped:=pg_catalog.replace(definition,fixed_line,'');
  IF pg_catalog.encode(public.digest(stripped,'sha256'),'hex')<>r.sha256
    OR (original.proconfig IS NOT NULL AND original.proconfig<>ARRAY['search_path=pg_catalog, public, pg_temp'])
  THEN RAISE EXCEPTION 'RESTORE_IDENTITY_PREREQUISITE_DRIFT'; END IF;
  IF r.identity='public.normalize_digits(text)' THEN
   ALTER FUNCTION public.normalize_digits(text) SET search_path TO pg_catalog,public,pg_temp;
  ELSE
   ALTER FUNCTION public.is_valid_cuil(text) SET search_path TO pg_catalog,public,pg_temp;
  END IF;
  SELECT p.prosrc,p.proowner,p.proacl,p.provolatile,p.prosecdef,p.proisstrict,p.proconfig
    INTO STRICT repaired FROM pg_catalog.pg_proc p WHERE p.oid=r.identity::regprocedure;
  IF (to_jsonb(original)-'proconfig') IS DISTINCT FROM (to_jsonb(repaired)-'proconfig')
    OR repaired.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']
  THEN RAISE EXCEPTION 'RESTORE_IDENTITY_FUNCTION_CHANGED'; END IF;
 END LOOP;
END $repair$;
