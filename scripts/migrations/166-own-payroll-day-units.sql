-- Add a declared days unit to four existing validators only.
-- No formulas, employee facts, approvals, rows, signatures or ACLs change.
DO $day_units$
DECLARE x record; source text; definition text; current_hash text; before_count integer:=0; after_count integer:=0;
 prior_enum constant text:='''money'',''hours'',''minutes'',''percent'',''units'',''coefficient''';
 final_enum constant text:='''money'',''hours'',''minutes'',''days'',''percent'',''units'',''coefficient''';
BEGIN
 FOR x IN SELECT * FROM (VALUES
 ('public.native_salary_items_v1(jsonb)','8409426d8df00e55740bc5d470f3005fdf1980ea04b0a5b7530373d57f5d0505','d2c7ffee8ac2c26c66075a7a093350be30ebc89656a914d73c237a78e6c852e4',1),
 ('public.own_program_definition_v1(jsonb,jsonb)','8fd400ab77ecda59800ac84658fd04d9f0de15289ee590ffd65df33a7dd62bc7','56a4396ad93f7f5e9652f78b24970dd6cf7e3731cb772ef8e1c3d418497f988b',2),
 ('public.own_program_node_v1(jsonb,integer)','779c949330a4c63c8c457e2e6be5511593ea66143fafd902e62797f92dd94d40','780a469d81a559d68e7bb53b31ace84487dd1a28ddd8efbd9f99f244415ba0da',1),
 ('public.own_program_node_v2(jsonb,integer)','7819a1d138f0b4be82b32be07f645b7fb670e01c36bfcc156f21631e573e7270','7b24738403603fd1795e0d69494c1865fcbe5d278006d6bd309a722178bd2dba',1)
 ) pins(signature,prior_hash,final_hash,occurrences) LOOP
  SELECT encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex') INTO current_hash FROM pg_proc p WHERE p.oid=to_regprocedure(x.signature);
  IF current_hash=x.prior_hash THEN before_count:=before_count+1;
  ELSIF current_hash=x.final_hash THEN after_count:=after_count+1;
  ELSE RAISE EXCEPTION 'DAY_UNITS_PREREQUISITE_CHANGED'; END IF;
 END LOOP;
 IF after_count=4 THEN RETURN; END IF;
 IF before_count<>4 THEN RAISE EXCEPTION 'DAY_UNITS_PARTIAL_STATE'; END IF;
 FOR x IN SELECT * FROM (VALUES
 ('public.native_salary_items_v1(jsonb)','8409426d8df00e55740bc5d470f3005fdf1980ea04b0a5b7530373d57f5d0505','d2c7ffee8ac2c26c66075a7a093350be30ebc89656a914d73c237a78e6c852e4',1),
 ('public.own_program_definition_v1(jsonb,jsonb)','8fd400ab77ecda59800ac84658fd04d9f0de15289ee590ffd65df33a7dd62bc7','56a4396ad93f7f5e9652f78b24970dd6cf7e3731cb772ef8e1c3d418497f988b',2),
 ('public.own_program_node_v1(jsonb,integer)','779c949330a4c63c8c457e2e6be5511593ea66143fafd902e62797f92dd94d40','780a469d81a559d68e7bb53b31ace84487dd1a28ddd8efbd9f99f244415ba0da',1),
 ('public.own_program_node_v2(jsonb,integer)','7819a1d138f0b4be82b32be07f645b7fb670e01c36bfcc156f21631e573e7270','7b24738403603fd1795e0d69494c1865fcbe5d278006d6bd309a722178bd2dba',1)
 ) pins(signature,prior_hash,final_hash,occurrences) LOOP
  SELECT replace(p.prosrc,E'\r\n',E'\n'),pg_get_functiondef(p.oid) INTO source,definition FROM pg_proc p WHERE p.oid=to_regprocedure(x.signature);
  IF encode(public.digest(source,'sha256'),'hex')<>x.prior_hash OR (length(source)-length(replace(source,prior_enum,'')))/length(prior_enum)<>x.occurrences
  THEN RAISE EXCEPTION 'DAY_UNITS_ENUM_CHANGED'; END IF;
  IF encode(public.digest(replace(source,prior_enum,final_enum),'sha256'),'hex')<>x.final_hash THEN RAISE EXCEPTION 'DAY_UNITS_PATCH_INVALID'; END IF;
  EXECUTE replace(definition,prior_enum,final_enum);
  IF (SELECT encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(x.signature))<>x.final_hash
  THEN RAISE EXCEPTION 'DAY_UNITS_AFTER_CHANGED'; END IF;
 END LOOP;
END $day_units$;
