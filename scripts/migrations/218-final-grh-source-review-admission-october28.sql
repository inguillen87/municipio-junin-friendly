-- ADDITIVE documentary admission of exactly one more GRH source (October 28). It keeps the two
-- tuples admitted by 183 byte-for-byte in the same named CHECK and appends one tuple. It does not edit or
-- re-run 144/183, change their bodies, functions, triggers, ACL or the September 10 baseline of 144, and it
-- does not select a source, write a revision, import records, adopt or activate employment, approve rules or
-- calculate payroll. The 218 constructor supplies the guarded transaction and metadata checks.
DO $final_review218$
DECLARE
 mode text:=current_setting('municontrol_final_review.mode',true);
 relation oid:=to_regclass('public.grh_final_source_revision');
 old_count integer;tuple_count integer;
 tuple183 text:=$tuple183$(((source_profile = 'grh-junin-2026-10-01'::text) AND (source_sha256 = '50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'::text) AND (source_cutoff = '2026-10-01 15:17:29'::timestamp without time zone)) OR ((source_profile = 'grh-junin-2026-10-14'::text) AND (source_sha256 = '3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4'::text) AND (source_cutoff = '2026-10-14 15:18:17'::timestamp without time zone)))$tuple183$;
 tuple218 text:=$tuple218$(((source_profile = 'grh-junin-2026-10-01'::text) AND (source_sha256 = '50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'::text) AND (source_cutoff = '2026-10-01 15:17:29'::timestamp without time zone)) OR ((source_profile = 'grh-junin-2026-10-14'::text) AND (source_sha256 = '3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4'::text) AND (source_cutoff = '2026-10-14 15:18:17'::timestamp without time zone)) OR ((source_profile = 'grh-junin-2026-10-28'::text) AND (source_sha256 = 'fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1'::text) AND (source_cutoff = '2026-10-28 15:16:35'::timestamp without time zone)))$tuple218$;
BEGIN
 IF relation IS NULL OR mode IS NULL OR mode NOT IN('oct28_install','oct28_repeat','oct28_verify')
  OR current_setting('transaction_isolation')<>'repeatable read'
  OR (mode='oct28_verify') IS DISTINCT FROM (current_setting('transaction_read_only')='on')
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=relation AND relowner=current_user::regrole AND relkind='r') THEN
  RAISE EXCEPTION 'FINAL_REVIEW218_CONTEXT';
 END IF;
 IF mode='oct28_install' THEN
  LOCK TABLE public.grh_final_source_revision IN ACCESS EXCLUSIVE MODE NOWAIT;
 END IF;
 SELECT count(*) INTO old_count FROM pg_constraint WHERE conrelid=relation
  AND conname IN('grh_final_source_revision_source_profile_check','grh_final_source_revision_source_sha256_check','grh_final_source_revision_source_cutoff_check');
 SELECT count(*) INTO tuple_count FROM pg_constraint WHERE conrelid=relation
  AND conname='grh_final_source_revision_source_tuple_check';
 IF old_count<>0 OR tuple_count<>1 THEN RAISE EXCEPTION 'FINAL_REVIEW218_STATE';END IF;
 IF mode='oct28_install' THEN
  -- Only from the exact durable 183 state: same name, same two tuples, same flags.
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation
   AND conname='grh_final_source_revision_source_tuple_check' AND contype='c'
   AND convalidated AND conislocal AND coninhcount=0 AND conparentid=0
   AND NOT condeferrable AND NOT condeferred AND NOT connoinherit
   AND pg_get_expr(conbin,conrelid,false)=tuple183
   AND coalesce((to_jsonb(pg_constraint)->>'conenforced')::boolean,true)) THEN
   RAISE EXCEPTION 'FINAL_REVIEW218_BEFORE_CONSTRAINT';
  END IF;
  -- A strict superset: every existing row stays valid; the ADD re-validates all rows under the same lock.
  ALTER TABLE public.grh_final_source_revision
   DROP CONSTRAINT grh_final_source_revision_source_tuple_check,
   ADD CONSTRAINT grh_final_source_revision_source_tuple_check CHECK (
    (source_profile='grh-junin-2026-10-01'
     AND source_sha256='50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'
     AND source_cutoff=timestamp '2026-10-01 15:17:29')
    OR (source_profile='grh-junin-2026-10-14'
     AND source_sha256='3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4'
     AND source_cutoff=timestamp '2026-10-14 15:18:17')
    OR (source_profile='grh-junin-2026-10-28'
     AND source_sha256='fef5aada3142e475d0519f7647377465d95ee55b4038aff035ff7d41d5748cc1'
     AND source_cutoff=timestamp '2026-10-28 15:16:35'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation
  AND conname='grh_final_source_revision_source_tuple_check' AND contype='c'
  AND convalidated AND conislocal AND coninhcount=0 AND conparentid=0
  AND NOT condeferrable AND NOT condeferred AND NOT connoinherit
  AND pg_get_expr(conbin,conrelid,false)=tuple218
  AND coalesce((to_jsonb(pg_constraint)->>'conenforced')::boolean,true)) THEN
  RAISE EXCEPTION 'FINAL_REVIEW218_AFTER_CONSTRAINT';
 END IF;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'FINAL_REVIEW218_BUSY';
END $final_review218$;
