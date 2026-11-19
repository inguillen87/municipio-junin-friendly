// Read-only metadata gate for the additive prepared-source catalog.
// This constant must match the reviewed server definition before deployment.
export const ADOPTION_PREPARED_SOURCES_READER_SHA256='4ce6765890b503c20f26b1deb3ff4dce057da5d64e19dd65bbc7ee7a994f1a5b';
export const ADOPTION_PREPARED_SOURCES_READER_SQL=String.raw`
SELECT CASE WHEN EXISTS (
 SELECT 1 FROM pg_proc f
 JOIN pg_namespace n ON n.oid=f.pronamespace
 JOIN pg_language l ON l.oid=f.prolang
 WHERE f.oid=to_regprocedure('public.employment_adoption_prepared_sources_v1(jsonb)')
 AND n.nspname='public' AND f.proname='employment_adoption_prepared_sources_v1'
 AND f.prokind='f' AND l.lanname='plpgsql' AND f.pronargs=1
 AND f.proargtypes[0]='jsonb'::regtype AND f.proargnames=ARRAY['p']::text[]
 AND f.proallargtypes IS NULL AND f.proargmodes IS NULL
 AND f.pronargdefaults=0 AND f.proargdefaults IS NULL
 AND f.prorettype='jsonb'::regtype AND NOT f.proretset
 AND f.prosecdef AND NOT f.proisstrict AND NOT f.proleakproof
 AND f.provolatile='v' AND f.proparallel='u' AND f.prosupport=0
 AND f.provariadic=0 AND f.probin IS NULL AND f.protrftypes IS NULL
 AND f.procost=100 AND f.prorows=0
 AND f.proconfig=ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[]
 AND f.proowner=(SELECT p.proowner FROM pg_proc p WHERE p.oid=to_regprocedure('public.employment_adoption_final_available_v1(jsonb)'))
 AND to_regrole('municontrol_actions_runtime_app') IS NOT NULL
 AND (SELECT count(*)=2
   AND bool_and(a.grantor=f.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable
     AND a.grantee IN(f.proowner,to_regrole('municontrol_actions_runtime_app')::oid))
   AND bool_or(a.grantee=f.proowner)
   AND bool_or(a.grantee=to_regrole('municontrol_actions_runtime_app')::oid)
   FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a)
 AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')='${ADOPTION_PREPARED_SOURCES_READER_SHA256}'
) THEN public.employment_adoption_prepared_sources_v1($1::jsonb) ELSE NULL END AS result
`;

