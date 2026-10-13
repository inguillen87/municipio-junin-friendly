-- Catalog storage budget for the verified 1 GiB Neon projects.
-- Preserve the 16 MiB safety margin, per-write reserve, lock, ACL and all rows.
-- The installation protocol requires an explicitly verified provider budget.
DO $catalog_storage$
DECLARE p pg_proc; updated pg_proc; body_hash text; before_body text; after_body text; definition text;
BEGIN
 IF current_setting('municontrol_catalog_storage.provider_budget_bytes',true) IS DISTINCT FROM '1073741824'
  THEN RAISE EXCEPTION 'CATALOG_STORAGE_PROVIDER_BUDGET_REQUIRED'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.native_employment_catalog_capacity_v1(integer)');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
  OR p.prorettype<>'void'::regtype OR p.provolatile<>'v' OR p.proargnames IS DISTINCT FROM ARRAY['extra_bytes']::text[]
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[] OR p.pronargdefaults<>0
  OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>'plpgsql'
  OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
  THEN RAISE EXCEPTION 'CATALOG_STORAGE_FUNCTION_CHANGED'; END IF;
 body_hash:=encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex');
 IF body_hash NOT IN('d0be23b2b5f275b9ba91179bc2f303cf6828c33b5007b01cb68dc225512cb6cf','fc2b910ebde0e560de0b2bf07f4d7af7492f1b6f98ca27badaf1d0186befa0c4')
  THEN RAISE EXCEPTION 'CATALOG_STORAGE_FUNCTION_CHANGED'; END IF;
 IF body_hash='d0be23b2b5f275b9ba91179bc2f303cf6828c33b5007b01cb68dc225512cb6cf' THEN
  before_body:=p.prosrc;
  IF (length(before_body)-length(replace(before_body,'520093696','')))/length('520093696')<>1
   THEN RAISE EXCEPTION 'CATALOG_STORAGE_ANCHOR_CHANGED'; END IF;
  after_body:=replace(before_body,'520093696','1056964608');
  IF encode(public.digest(replace(after_body,E'\r\n',E'\n'),'sha256'),'hex')<>'fc2b910ebde0e560de0b2bf07f4d7af7492f1b6f98ca27badaf1d0186befa0c4'
   THEN RAISE EXCEPTION 'CATALOG_STORAGE_RESULT_CHANGED'; END IF;
  definition:=pg_get_functiondef(p.oid);
  IF (length(definition)-length(replace(definition,before_body,'')))/length(before_body)<>1
   THEN RAISE EXCEPTION 'CATALOG_STORAGE_DEFINITION_CHANGED'; END IF;
  EXECUTE replace(definition,before_body,after_body);
 END IF;
 SELECT * INTO updated FROM pg_proc WHERE oid=p.oid;
 IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM to_jsonb(p)-'prosrc'
  OR encode(public.digest(replace(updated.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>'fc2b910ebde0e560de0b2bf07f4d7af7492f1b6f98ca27badaf1d0186befa0c4'
  THEN RAISE EXCEPTION 'CATALOG_STORAGE_METADATA_CHANGED'; END IF;
END
$catalog_storage$;
