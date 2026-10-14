-- Existing monthly annulment/correction guards: verified 1 GiB branch budget.
-- Count all branch databases. Keep payload reserves, row limits, authority and history.
DO $monthly_storage$
DECLARE x jsonb; p pg_proc; updated pg_proc; body_hash text; before_body text;
 after_body text; definition text; old_count integer:=0; new_count integer:=0;
 targets jsonb:='[
 {
  "signature": "public.payroll_monthly_annul_command_v1(jsonb,jsonb,uuid)",
  "before": "afa343eba56b58b0f7f6d010f74d066afbb7558ff0d004131b020e84f091da8d",
  "after": "34fe7e8aeaaaaa355d1b34370f93f5bd5e16c7099a89490dbabbd20adf10976d",
  "arguments": [
   "p_context",
   "p_body",
   "p_key"
  ],
  "result": "jsonb",
  "runtime": true
 },
 {
  "signature": "public.payroll_monthly_correction_command_v1(jsonb,jsonb,uuid)",
  "before": "e7fc7f5fa42905df600f9f15cdae88940207558a31072dabd744819001f27120",
  "after": "7078760970bc824886c94d0cc017c1233246bf09c7163b4a29b24213045bd4a9",
  "arguments": [
   "p_context",
   "p_body",
   "p_key"
  ],
  "result": "jsonb",
  "runtime": true
 }
]';
BEGIN
 IF current_setting('municontrol_monthly_storage.provider_budget_bytes',true) IS DISTINCT FROM '1073741824'
  THEN RAISE EXCEPTION 'MONTHLY_STORAGE_PROVIDER_BUDGET_REQUIRED'; END IF;
 -- Check every target before adapting any body. A partial/foreign installation aborts.
 FOR x IN SELECT value FROM jsonb_array_elements(targets) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef
   OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR p.provolatile<>'v'
   OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>0 OR p.pronargdefaults<>0
   OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'arguments'
   OR p.prorettype<>(x->>'result')::regtype
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
   OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>'plpgsql'
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM (x->>'runtime')::boolean
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean
       AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
   THEN RAISE EXCEPTION 'MONTHLY_STORAGE_FUNCTION_CHANGED' USING DETAIL=x->>'signature'; END IF;
  body_hash:=encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex');
  IF body_hash=x->>'before' THEN old_count:=old_count+1;
  ELSIF body_hash=x->>'after' THEN new_count:=new_count+1;
  ELSE RAISE EXCEPTION 'MONTHLY_STORAGE_FUNCTION_CHANGED' USING DETAIL=x->>'signature'; END IF;
 END LOOP;
 IF old_count<>2 AND new_count<>2 THEN RAISE EXCEPTION 'MONTHLY_STORAGE_PARTIAL_STATE'; END IF;
 IF new_count=2 THEN RETURN; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(targets) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  before_body:=p.prosrc;
  IF (length(before_body)-length(replace(before_body,'520093696','')))/length('520093696')<>2
   OR (length(before_body)-length(replace(before_body,'pg_database_size(current_database())','')))/length('pg_database_size(current_database())')<>2
   THEN RAISE EXCEPTION 'MONTHLY_STORAGE_ANCHOR_CHANGED'; END IF;
  after_body:=replace(replace(before_body,'520093696','1056964608'),'pg_database_size(current_database())','(SELECT sum(pg_database_size(oid)) FROM pg_database)');
  IF encode(public.digest(replace(after_body,E'\r\n',E'\n'),'sha256'),'hex')<>x->>'after'
   THEN RAISE EXCEPTION 'MONTHLY_STORAGE_RESULT_CHANGED'; END IF;
  definition:=pg_get_functiondef(p.oid);
  IF (length(definition)-length(replace(definition,before_body,'')))/length(before_body)<>1
   THEN RAISE EXCEPTION 'MONTHLY_STORAGE_DEFINITION_CHANGED'; END IF;
  EXECUTE replace(definition,before_body,after_body);
  SELECT * INTO updated FROM pg_proc WHERE oid=p.oid;
  IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM to_jsonb(p)-'prosrc'
   OR encode(public.digest(replace(updated.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x->>'after'
   THEN RAISE EXCEPTION 'MONTHLY_STORAGE_METADATA_CHANGED'; END IF;
 END LOOP;
END
$monthly_storage$;
