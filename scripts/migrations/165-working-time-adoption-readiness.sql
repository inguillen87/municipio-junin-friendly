-- Reconcile the adoption guard with the exact capture installed by SQL164.
-- No guard is removed, no business command is executed and no ACL is changed.
DO $repair$
DECLARE
 prior_ready constant text := 'eddc888e00ca8c3156858f189a29bf98cbe15e774262c1904dac5c65e501a6ca';
 final_ready constant text := 'c4546ebd3e2dacfff29aad1edfea16b6dc4061774598110e7b10c58f264fdb08';
 prior_capture constant text := '18061aa38556ee715edf0413b9583cd8717d58717c1cfa0ff24fddc8c778ff6d';
 final_capture constant text := '60c5d7ebf6bfc2fa7eb83fbaa4ac64e9381c70b41ed35fd18057ef326ffe8ef7';
 ready_oid oid := to_regprocedure('public.municipal_adoption_ready_v1()');
 capture_oid oid := to_regprocedure('public.own_run_capture_v1(jsonb,jsonb,uuid,text)');
 ready_source text; ready_hash text; definition text;
BEGIN
 IF ready_oid IS NULL OR capture_oid IS NULL THEN RAISE EXCEPTION 'WORKING_TIME_ADOPTION_PREREQUISITE'; END IF;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=capture_oid) IS DISTINCT FROM final_capture
 THEN RAISE EXCEPTION 'WORKING_TIME_ADOPTION_CAPTURE_CHANGED'; END IF;
 SELECT replace(prosrc,E'\r\n',E'\n'),pg_get_functiondef(oid) INTO ready_source,definition FROM pg_proc WHERE oid=ready_oid;
 ready_hash:=encode(public.digest(ready_source,'sha256'),'hex');
 IF ready_hash=final_ready THEN RETURN; END IF;
 IF ready_hash IS DISTINCT FROM prior_ready OR (length(ready_source)-length(replace(ready_source,prior_capture,'')))/length(prior_capture)<>1
 THEN RAISE EXCEPTION 'WORKING_TIME_ADOPTION_GUARD_CHANGED'; END IF;
 IF encode(public.digest(replace(ready_source,prior_capture,final_capture),'sha256'),'hex') IS DISTINCT FROM final_ready
 THEN RAISE EXCEPTION 'WORKING_TIME_ADOPTION_PATCH_INVALID'; END IF;
 EXECUTE replace(definition,prior_capture,final_capture);
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=ready_oid) IS DISTINCT FROM final_ready
 THEN RAISE EXCEPTION 'WORKING_TIME_ADOPTION_AFTER_CHANGED'; END IF;
END $repair$;
