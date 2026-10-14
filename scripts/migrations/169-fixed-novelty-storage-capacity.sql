-- Existing fixed-novelty storage checks: verified 1 GiB provider budget.
-- Only the ceiling changes. Reserves, quantities, locks, permissions and rows stay intact.
DO $fixed_storage$
DECLARE x jsonb; p pg_proc; updated pg_proc; body_hash text; before_body text;
 after_body text; definition text; old_count integer:=0; new_count integer:=0;
 targets jsonb:='[
 {"signature":"public.payroll_fixed_registry_capacity_v1()","before":"310a4196e2421d1a2be01f3dab4a25e936eec1833f47cdc264b679edd0f2e52c","after":"cf5c5bf19addbf32411dcd1541a255d45135e21b606a1909fceece494645fa71","arguments":[],"result":"void","runtime":false},
 {"signature":"public.payroll_fixed_group_annul_v1(jsonb,jsonb,uuid)","before":"cf6b2010ce415c0f79b90f7694d9d36d2245b6b5984af04195be09b5c64303da","after":"3ea50153baa24af2516455ecbb49d120d2e6ce995fcb929ba4e9fde2d151f005","arguments":["p_context","p_payload","p_key"],"result":"jsonb","runtime":true},
 {"signature":"public.payroll_fixed_correction_group_propose_v1(jsonb,jsonb,uuid)","before":"dd03d3bdc5b61248c7e64018bb7c953e883e89019b3bda69fa3d799533d58add","after":"684f5454f146483007040f431118d1ce91d1365b02ff70074b3b81bb62a96dff","arguments":["p_context","p_payload","p_key"],"result":"jsonb","runtime":true},
 {"signature":"public.payroll_fixed_review_group_decide_v1(jsonb,jsonb,uuid)","before":"45464be19ad884186f82c669f22095f8f3f77388c21e4ff97884d096a0982999","after":"8691400dfd17a2f2543c2487f30dd4e02cf754c242a0fa4a7b60864afff66e89","arguments":["p_context","p_payload","p_key"],"result":"jsonb","runtime":true}
 ]';
BEGIN
 IF current_setting('municontrol_fixed_storage.provider_budget_bytes',true) IS DISTINCT FROM '1073741824'
  THEN RAISE EXCEPTION 'FIXED_STORAGE_PROVIDER_BUDGET_REQUIRED'; END IF;
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
   THEN RAISE EXCEPTION 'FIXED_STORAGE_FUNCTION_CHANGED' USING DETAIL=x->>'signature'; END IF;
  body_hash:=encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex');
  IF body_hash=x->>'before' THEN old_count:=old_count+1;
  ELSIF body_hash=x->>'after' THEN new_count:=new_count+1;
  ELSE RAISE EXCEPTION 'FIXED_STORAGE_FUNCTION_CHANGED' USING DETAIL=x->>'signature'; END IF;
 END LOOP;
 IF old_count<>4 AND new_count<>4 THEN RAISE EXCEPTION 'FIXED_STORAGE_PARTIAL_STATE'; END IF;
 IF new_count=4 THEN RETURN; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(targets) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  before_body:=p.prosrc;
  IF (length(before_body)-length(replace(before_body,'520093696','')))/length('520093696')<>1
   THEN RAISE EXCEPTION 'FIXED_STORAGE_ANCHOR_CHANGED'; END IF;
  after_body:=replace(before_body,'520093696','1056964608');
  IF encode(public.digest(replace(after_body,E'\r\n',E'\n'),'sha256'),'hex')<>x->>'after'
   THEN RAISE EXCEPTION 'FIXED_STORAGE_RESULT_CHANGED'; END IF;
  definition:=pg_get_functiondef(p.oid);
  IF (length(definition)-length(replace(definition,before_body,'')))/length(before_body)<>1
   THEN RAISE EXCEPTION 'FIXED_STORAGE_DEFINITION_CHANGED'; END IF;
  EXECUTE replace(definition,before_body,after_body);
  SELECT * INTO updated FROM pg_proc WHERE oid=p.oid;
  IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM to_jsonb(p)-'prosrc'
   OR encode(public.digest(replace(updated.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x->>'after'
   THEN RAISE EXCEPTION 'FIXED_STORAGE_METADATA_CHANGED'; END IF;
 END LOOP;
END
$fixed_storage$;
