-- 099: adapt curated consumers without changing identity, authority or history.
-- Exact installed bodies and ACLs are preserved; 097 must already be installed.
DO $prerequisite$
BEGIN
 IF to_regclass('public.grh_curated_source_version_seal') IS NULL
  OR to_regclass('public.grh_source_employees_v1') IS NULL OR to_regclass('public.grh_source_family_v1') IS NULL
  OR to_regclass('public.grh_source_catalog_rows_v1') IS NULL OR to_regclass('public.grh_effective_source_batch_v1') IS NULL
  OR to_regclass('public.grh_effective_source_staging_v1') IS NULL
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PREREQUISITE'; END IF;
END $prerequisite$;

-- A UNION view cannot be row-locked. Stabilize physical baselines and the
-- immutable selected version (including a publication not inserted yet) instead.
-- Only already-authorized facade/owner flows call this helper. Dry-run imports
-- remain read-only, and native idempotent receipts are checked before this lock.
DO $lock_guard$
DECLARE proc record;
BEGIN
 SELECT * INTO proc FROM pg_proc WHERE oid=to_regprocedure('public.grh_curated_source_read_lock_v1()');
 IF FOUND AND (proc.prosecdef IS DISTINCT FROM true
  OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']
  OR encode(public.digest(replace(proc.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>'c6c79f7761d1d777862d27d5fa84dfd9a9ad5c8c12c45541ca5069631a8c2cf2'
  OR proc.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) a WHERE a.grantee<>proc.proowner))
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_LOCK_DRIFT'; END IF;
END $lock_guard$;
CREATE OR REPLACE FUNCTION public.grh_curated_source_read_lock_v1() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $lock$
BEGIN
 LOCK TABLE public.grh_employees,public.grh_absences,public.grh_leaves,public.grh_family,public.grh_catalog_rows,public.source_staging_row,
  public.grh_curated_source_version,public.grh_curated_source_delta,public.grh_curated_source_version_seal,public.grh_effective_source_binding
 IN SHARE MODE NOWAIT;
END $lock$;
REVOKE ALL ON FUNCTION public.grh_curated_source_read_lock_v1() FROM PUBLIC,municontrol_actions_runtime_app;

-- action_center_case_source_context_v1: exact installed signature, body, security mode and configuration.
DO $curated_0$
DECLARE signature regprocedure := 'public.action_center_case_source_context_v1(uuid,uuid,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='8ec72c65ede89c6fc8164f82a3ee8de40dc62fc45513717ddbeda106e256ee09' THEN RETURN; END IF;
 IF current_hash<>'4da868f551b49e5bcbc2c662e01979b2dc0827afb59149445161ae4d7e45ff1c' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["FROM source_staging_row staging","FROM public.grh_effective_source_staging_v1 staging"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'8ec72c65ede89c6fc8164f82a3ee8de40dc62fc45513717ddbeda106e256ee09'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_0$;

-- action_center_overtime_bootstrap_v1: exact installed signature, body, security mode and configuration.
DO $curated_1$
DECLARE signature regprocedure := 'public.action_center_overtime_bootstrap_v1(text,uuid,integer,text,uuid,uuid,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='f5d2b1780e4c2745f25a434da1a9407fa50b1c49a61bf5e4d7f5aedec0d3e966' THEN RETURN; END IF;
 IF current_hash<>'4efd1c834020c330444353de5236d08a8aeccce8af89d110ad0844c2439333d6' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "],["FROM source_import_batch batch","FROM public.grh_effective_source_batch_v1 batch"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'f5d2b1780e4c2745f25a434da1a9407fa50b1c49a61bf5e4d7f5aedec0d3e966'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_1$;

-- action_center_overtime_detail_v1: exact installed signature, body, security mode and configuration.
DO $curated_2$
DECLARE signature regprocedure := 'public.action_center_overtime_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='fc6efe29d609bfef692f12c803aade4e475ddfb0b8376ea598ddbdaa4bf817ee' THEN RETURN; END IF;
 IF current_hash<>'33d3c93f6097ee5545ce96ed74d8a8500e6ce9d8f2449e24c18b00f8c1779d1a' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'fc6efe29d609bfef692f12c803aade4e475ddfb0b8376ea598ddbdaa4bf817ee'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_2$;

-- action_center_overtime_list_v1: exact installed signature, body, security mode and configuration.
DO $curated_3$
DECLARE signature regprocedure := 'public.action_center_overtime_list_v1(text,uuid,integer,text,uuid,uuid,text,integer,integer)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='85fb41a388e085c61c796f449d2b06ed803966cda448482dff3e6f345836a3a4' THEN RETURN; END IF;
 IF current_hash<>'95ea89123f426c31affbdd216bb64e4764ff399555cc7fac0b456df483843e66' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'85fb41a388e085c61c796f449d2b06ed803966cda448482dff3e6f345836a3a4'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_3$;

-- action_center_tenant_bootstrap_v2: exact installed signature, body, security mode and configuration.
DO $curated_4$
DECLARE signature regprocedure := 'public.action_center_tenant_bootstrap_v2(text,uuid,integer,text,uuid,uuid,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='27420e8c297f60451014351eecdb77b86c20c432794b48b14ba857f2ab533c44' THEN RETURN; END IF;
 IF current_hash<>'3688fb46ecdad8d989f540f17cc28170a2aafdc41ac0f048214b61da9fad89c8' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "],["FROM grh_catalog_rows ","FROM public.grh_source_catalog_rows_v1 "],["FROM source_import_batch batch","FROM public.grh_effective_source_batch_v1 batch"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'27420e8c297f60451014351eecdb77b86c20c432794b48b14ba857f2ab533c44'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_4$;

-- action_center_tenant_detail_v2: exact installed signature, body, security mode and configuration.
DO $curated_5$
DECLARE signature regprocedure := 'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='b98d5cd12adee22eb04521e53bc6ae2f85af5b0d5e5bd5978d001a93e4b3de16' THEN RETURN; END IF;
 IF current_hash<>'533d6e64b3234664207521fc0069ccc05dd16eed10c66305c1c2d64683454d2d' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'b98d5cd12adee22eb04521e53bc6ae2f85af5b0d5e5bd5978d001a93e4b3de16'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_5$;

-- action_center_tenant_list_v2: exact installed signature, body, security mode and configuration.
DO $curated_6$
DECLARE signature regprocedure := 'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='a03982b8f5f46d83e52786420bba5793517336d1e11475816281da1ca76cab06' THEN RETURN; END IF;
 IF current_hash<>'deb64736e715fd7e6c13ab12ec076c6ee41246df849ad10ae1c4a5c5d71fcc39' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'a03982b8f5f46d83e52786420bba5793517336d1e11475816281da1ca76cab06'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_6$;

-- employee_family_declare_v1: exact installed signature, body, security mode and configuration.
DO $curated_7$
DECLARE signature regprocedure := 'public.employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='f35312befb20cf0479a5d028806688f1469abb8e25bbd7c677c8c77970cfc724' THEN RETURN; END IF;
 IF current_hash<>'d2b78c0dd1c628f1804be7100aca625f73d419ccb20327e63344865751d33dc2' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["LOCK TABLE grh_family,grh_catalog_rows IN SHARE MODE NOWAIT;","PERFORM public.grh_curated_source_read_lock_v1();\n LOCK TABLE grh_family,grh_catalog_rows IN SHARE MODE NOWAIT;"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'f35312befb20cf0479a5d028806688f1469abb8e25bbd7c677c8c77970cfc724'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_7$;

-- native_employee_catalog_v1: exact installed signature, body, security mode and configuration.
DO $curated_8$
DECLARE signature regprocedure := 'public.native_employee_catalog_v1(jsonb)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='bfa55ea106272fadf4655997d5a29fc57cee47cff079b1ac2672732aa579826d' THEN RETURN; END IF;
 IF current_hash<>'3171c85ce0be1067feebb34aa081c19de15714e986b2ca82233811ef86efb5d6' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["FROM grh_catalog_rows ","FROM public.grh_source_catalog_rows_v1 "],["FROM source_import_batch WHERE","FROM public.grh_effective_source_batch_v1 WHERE"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'bfa55ea106272fadf4655997d5a29fc57cee47cff079b1ac2672732aa579826d'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_8$;

-- native_employee_create_v1: exact installed signature, body, security mode and configuration.
DO $curated_9$
DECLARE signature regprocedure := 'public.native_employee_create_v1(jsonb,jsonb,text,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='d9605cd9a60364798856e78a91be946f441232244c073bf19d1bacbbc8444744' THEN RETURN; END IF;
 IF current_hash<>'3ac060547845052e8466262025400bebd7267f680c41c962627dc45d384f4632' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["FROM grh_employees ","FROM public.grh_source_employees_v1 "],["catalogs:=native_employee_catalog_v1(ctx);","PERFORM public.grh_curated_source_read_lock_v1();\n catalogs:=native_employee_catalog_v1(ctx);"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'d9605cd9a60364798856e78a91be946f441232244c073bf19d1bacbbc8444744'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_9$;

-- native_employee_next_number_v1: exact installed signature, body, security mode and configuration.
DO $curated_10$
DECLARE signature regprocedure := 'public.native_employee_next_number_v1(bigint)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='c31f02b4473a461765bb61eb09b5b9875f941e313a4c5850cb25818d04a34784' THEN RETURN; END IF;
 IF current_hash<>'7c1ab270c8f73694b4217f80c900cbe16d5fd4a22826ef1467628aad7e3d8888' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["FROM grh_employees ","FROM public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'c31f02b4473a461765bb61eb09b5b9875f941e313a4c5850cb25818d04a34784'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_10$;

-- school_certificate_current_family_v1: exact installed signature, body, security mode and configuration.
DO $curated_11$
DECLARE signature regprocedure := 'public.school_certificate_current_family_v1(jsonb,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='8e5b8f66f99c58fe1689e832af368fd54d3bc32809e0ddc907d894c39310c861' THEN RETURN; END IF;
 IF current_hash<>'79ed1b6b5a299aa3d4be570947c1077988d737b6f103f5f461cdf26c4e591540' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_family ","JOIN public.grh_source_family_v1 "],["FROM grh_catalog_rows ","FROM public.grh_source_catalog_rows_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'8e5b8f66f99c58fe1689e832af368fd54d3bc32809e0ddc907d894c39310c861'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_11$;

-- school_certificate_family_v3: exact installed signature, body, security mode and configuration.
DO $curated_12$
DECLARE signature regprocedure := 'public.school_certificate_family_v3(jsonb,uuid,text,text,text,boolean)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='7399536671de9f89d8e6f9b41ff576e85ba5492635328b96dc945663bd1a95df' THEN RETURN; END IF;
 IF current_hash<>'5118bf1598e7dae3e79ae14178974c3c1b9d928d222a5f3833af256d95c0ef2e' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["LOCK TABLE grh_family,grh_catalog_rows,employee_family_member IN SHARE MODE NOWAIT;","PERFORM public.grh_curated_source_read_lock_v1();\n  LOCK TABLE grh_family,grh_catalog_rows,employee_family_member IN SHARE MODE NOWAIT;"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'7399536671de9f89d8e6f9b41ff576e85ba5492635328b96dc945663bd1a95df'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_12$;

-- school_certificate_read_v4: exact installed signature, body, security mode and configuration.
DO $curated_13$
DECLARE signature regprocedure := 'public.school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=pg_catalog, public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='005d2b345096096e42741cfd5c627796f79d45a77ead65527bdd3a8f3dd71845' THEN RETURN; END IF;
 IF current_hash<>'d612d9c36f5fe7d4712db75f9fa56a2979787713105011fa2c8188c2c60ce479' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_family ","JOIN public.grh_source_family_v1 "],["LOCK TABLE platform_tenant_source_binding,tenant_identity_policy","PERFORM public.grh_curated_source_read_lock_v1();\n LOCK TABLE platform_tenant_source_binding,tenant_identity_policy"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'005d2b345096096e42741cfd5c627796f79d45a77ead65527bdd3a8f3dd71845'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_13$;

-- school_certificate_register_v1: exact installed signature, body, security mode and configuration.
DO $curated_14$
DECLARE signature regprocedure := 'public.school_certificate_register_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='b38b15e65f57c718be0dae02887380fa85c6a0b35cad41a700accb94630a1005' THEN RETURN; END IF;
 IF current_hash<>'9f7a934fc593620747c1c441d5f8133373d2dc01592b39fcae4406cc9947ce12' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["FROM grh_family ","FROM public.grh_source_family_v1 "],["FROM grh_catalog_rows ","FROM public.grh_source_catalog_rows_v1 "],["LOCK TABLE grh_family IN ACCESS SHARE MODE NOWAIT;","PERFORM public.grh_curated_source_read_lock_v1();\n LOCK TABLE grh_family IN SHARE MODE NOWAIT;"],["LOCK TABLE grh_catalog_rows IN ACCESS SHARE MODE NOWAIT;","LOCK TABLE grh_catalog_rows IN SHARE MODE NOWAIT;"],[" FOR SHARE OF k NOWAIT;",";"],[" FOR SHARE OF f NOWAIT;",";"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'b38b15e65f57c718be0dae02887380fa85c6a0b35cad41a700accb94630a1005'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_14$;

-- school_certificate_source_import_v4: exact installed signature, body, security mode and configuration.
DO $curated_15$
DECLARE signature regprocedure := 'public.school_certificate_source_import_v4(uuid,uuid,uuid,jsonb,text,boolean)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS FALSE
  AND proconfig=ARRAY['search_path=pg_catalog, public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='265222e291e61a866b30a96749f8b22a8a71986e9eac1e25b6bfbec6e1f9e304' THEN RETURN; END IF;
 IF current_hash<>'0029cee18a4f629fec154f483136b382d8f293d1b168067de0bff8f491c69635' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["FROM grh_family ","FROM public.grh_source_family_v1 "],["JOIN grh_family ","JOIN public.grh_source_family_v1 "],["FROM grh_catalog_rows ","FROM public.grh_source_catalog_rows_v1 "],["LOCK TABLE platform_tenant,platform_tenant_source_binding","PERFORM public.grh_curated_source_read_lock_v1();\n  LOCK TABLE platform_tenant,platform_tenant_source_binding"],[" SELECT count(*) INTO expected FROM public.grh_source_family_v1 f WHERE f.import_run_id=r.id AND f.company_id=binding.source_company_id AND f.vinculo_code='2';\n SELECT count(*) INTO matched FROM jsonb_array_elements(p_payload->'rows') x JOIN public.grh_source_family_v1 f\n  ON f.family_id=(x->>'familyId')::bigint AND f.company_id=(x->>'companyId')::bigint AND f.legajo=x->>'legajo'\n  AND f.import_run_id=r.id AND f.company_id=binding.source_company_id AND f.vinculo_code='2'\n  AND school_certificate_source_identity_v4(to_jsonb(f))=x->>'identitySha256';\n"," -- Materialize this exact source cohort once. Joining thousands of submitted\n -- rows directly to the UNION source can otherwise recompute the same patches\n -- for every child; identity bytes and whole-cohort counts remain unchanged.\n WITH source_family AS MATERIALIZED (\n  SELECT f.family_id,f.company_id,f.legajo,school_certificate_source_identity_v4(to_jsonb(f)) AS identity_sha256\n  FROM public.grh_source_family_v1 f\n  WHERE f.import_run_id=r.id AND f.company_id=binding.source_company_id AND f.vinculo_code='2'\n ), submitted AS MATERIALIZED (\n  SELECT (x->>'familyId')::bigint family_id,(x->>'companyId')::bigint company_id,x->>'legajo' legajo,x->>'identitySha256' identity_sha256\n  FROM jsonb_array_elements(p_payload->'rows') x\n )\n SELECT (SELECT count(*) FROM source_family),\n  (SELECT count(*) FROM submitted x JOIN source_family f\n   ON f.family_id=x.family_id AND f.company_id=x.company_id AND f.legajo=x.legajo AND f.identity_sha256=x.identity_sha256)\n INTO expected,matched;\n"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'265222e291e61a866b30a96749f8b22a8a71986e9eac1e25b6bfbec6e1f9e304'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_15$;

-- tenant_action_lookup_employment_v2: exact installed signature, body, security mode and configuration.
DO $curated_16$
DECLARE signature regprocedure := 'public.tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='66e987599d74f6fc70249d323eb5f6a2fc971c6f66caa1cb7a54319c1ce26031' THEN RETURN; END IF;
 IF current_hash<>'20b3c3cef2833d2a09d2d9095f5fcca34f57267e73fc9c22f0fa5b6a2c384daf' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'66e987599d74f6fc70249d323eb5f6a2fc971c6f66caa1cb7a54319c1ce26031'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_16$;

-- tenant_iam_admin_view_core_013: exact installed signature, body, security mode and configuration.
DO $curated_17$
DECLARE signature regprocedure := 'public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE
  AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash:=encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='64c48b16ca3f5d5789c016a133ca066c1fc6a2b70e7e6d25ca36a5e075c27ceb' THEN RETURN; END IF;
 IF current_hash<>'2426011affbc28a01c27ab2f9e38a25bee737e32e04f72bdd21a5b136ad00243' THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_DRIFT: %',signature; END IF;
 definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
 changes:=$changes$[["JOIN grh_employees ","JOIN public.grh_source_employees_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_ANCHOR: %',signature; END IF;
  definition:=replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)<>'64c48b16ca3f5d5789c016a133ca066c1fc6a2b70e7e6d25ca36a5e075c27ceb'
 THEN RAISE EXCEPTION 'GRH_CURATED_CONSUMER_PATCH_FAILED: %',signature; END IF;
END $curated_17$;
