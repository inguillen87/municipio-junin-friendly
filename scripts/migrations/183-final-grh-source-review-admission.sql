-- Admit two exact documentary revisions. This does not select either source,
-- import records, adopt employment, approve rules or calculate payroll.
-- The review constructor supplies the guarded transaction and metadata checks.
DO $final_review183$
DECLARE
 mode text:=current_setting('municontrol_final_review.mode',true);
 relation oid:=to_regclass('public.grh_final_source_revision');
 old_count integer;new_count integer;item record;
 tuple_expression text:=$tuple183$(((source_profile = 'grh-junin-2026-10-01'::text) AND (source_sha256 = '50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'::text) AND (source_cutoff = '2026-10-01 15:17:29'::timestamp without time zone)) OR ((source_profile = 'grh-junin-2026-10-14'::text) AND (source_sha256 = '3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4'::text) AND (source_cutoff = '2026-10-14 15:18:17'::timestamp without time zone)))$tuple183$;
BEGIN
 IF relation IS NULL OR mode IS NULL OR mode NOT IN('install','repeat','verify')
  OR current_setting('transaction_isolation')<>'repeatable read'
  OR (mode='verify') IS DISTINCT FROM (current_setting('transaction_read_only')='on')
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=relation AND relowner=current_user::regrole AND relkind='r') THEN
  RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_CONTEXT';
 END IF;
 IF mode='install' THEN
  LOCK TABLE public.grh_final_source_revision IN ACCESS EXCLUSIVE MODE NOWAIT;
 END IF;
 SELECT count(*) INTO old_count FROM pg_constraint WHERE conrelid=relation
  AND conname IN('grh_final_source_revision_source_profile_check','grh_final_source_revision_source_sha256_check','grh_final_source_revision_source_cutoff_check');
 SELECT count(*) INTO new_count FROM pg_constraint WHERE conrelid=relation
  AND conname='grh_final_source_revision_source_tuple_check';
 IF mode='install' THEN
  IF old_count<>3 OR new_count<>0 THEN RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_BEFORE_STATE';END IF;
  FOR item IN SELECT * FROM(VALUES
   ('grh_final_source_revision_source_profile_check',$old_profile$(source_profile = 'grh-junin-2026-10-01'::text)$old_profile$),
   ('grh_final_source_revision_source_sha256_check',$old_sha$(source_sha256 = '50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'::text)$old_sha$),
   ('grh_final_source_revision_source_cutoff_check',$old_cutoff$(source_cutoff = '2026-10-01 15:17:29'::timestamp without time zone)$old_cutoff$)
  ) expected(name,expression) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation AND conname=item.name
    AND contype='c' AND convalidated AND conislocal AND coninhcount=0 AND conparentid=0
    AND NOT condeferrable AND NOT condeferred AND NOT connoinherit
    AND pg_get_expr(conbin,conrelid,false)=item.expression
    AND coalesce((to_jsonb(pg_constraint)->>'conenforced')::boolean,true)) THEN
    RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_BEFORE_CONSTRAINT' USING DETAIL=item.name;
   END IF;
  END LOOP;
  ALTER TABLE public.grh_final_source_revision
   DROP CONSTRAINT grh_final_source_revision_source_profile_check,
   DROP CONSTRAINT grh_final_source_revision_source_sha256_check,
   DROP CONSTRAINT grh_final_source_revision_source_cutoff_check,
   ADD CONSTRAINT grh_final_source_revision_source_tuple_check CHECK (
    (source_profile='grh-junin-2026-10-01'
     AND source_sha256='50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'
     AND source_cutoff=timestamp '2026-10-01 15:17:29')
    OR (source_profile='grh-junin-2026-10-14'
     AND source_sha256='3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4'
     AND source_cutoff=timestamp '2026-10-14 15:18:17'));
 ELSE
  IF old_count<>0 OR new_count<>1 THEN RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_AFTER_STATE';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation
  AND conname='grh_final_source_revision_source_tuple_check' AND contype='c'
  AND convalidated AND conislocal AND coninhcount=0 AND conparentid=0
  AND NOT condeferrable AND NOT condeferred AND NOT connoinherit
  AND pg_get_expr(conbin,conrelid,false)=tuple_expression
  AND coalesce((to_jsonb(pg_constraint)->>'conenforced')::boolean,true)) THEN
  RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_AFTER_CONSTRAINT';
 END IF;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_BUSY';
END $final_review183$;
