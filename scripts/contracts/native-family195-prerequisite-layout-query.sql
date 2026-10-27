WITH contract AS (SELECT value AS t,value->>'name' AS name FROM jsonb_array_elements('<<CONTRACT>>'::jsonb)),
r AS (SELECT t,name,to_regclass('public.'||name) AS oid FROM contract),
ix AS (
 SELECT i.indrelid,i.indexrelid,ic.relname AS iname,i.indisunique,i.indisprimary,
  (SELECT jsonb_agg(a.attname ORDER BY u.n) FROM unnest(i.indkey::int2[]) WITH ORDINALITY u(att,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.att) AS keys,
  to_jsonb(i.indoption::int2[]) AS options,
  pg_get_expr(i.indpred,i.indrelid) AS predicate,
  (ic.relam=(SELECT oid FROM pg_am WHERE amname='btree') AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate
   AND NOT i.indnullsnotdistinct AND i.indnatts=i.indnkeyatts AND i.indexprs IS NULL AND 0<>ALL(i.indkey::int2[])
   AND ic.reloptions IS NULL AND ic.reltablespace=0
   AND NOT EXISTS(SELECT 1 FROM unnest(i.indkey::int2[],i.indclass::oid[],i.indcollation::oid[]) u(att,cls,coll)
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.att JOIN pg_type y ON y.oid=a.atttypid
    WHERE u.cls IS DISTINCT FROM (SELECT oc.oid FROM pg_opclass oc WHERE oc.opcmethod=ic.relam AND oc.opcdefault AND oc.opcintype=a.atttypid)
     OR u.coll IS DISTINCT FROM y.typcollation)) AS plain
 FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid IN(SELECT oid FROM r WHERE oid IS NOT NULL)),
con AS (
 SELECT k.*,
  (SELECT jsonb_agg(a.attname ORDER BY u.n) FROM unnest(k.conkey) WITH ORDINALITY u(att,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.att) AS keys,
  (SELECT jsonb_agg(a.attname ORDER BY a.attname COLLATE "C") FROM unnest(k.conkey) u(att) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.att) AS keyset,
  (SELECT jsonb_agg(a.attname ORDER BY u.n) FROM unnest(k.confkey) WITH ORDINALITY u(att,n) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=u.att) AS refkeys
 FROM pg_constraint k WHERE k.conrelid IN(SELECT oid FROM r WHERE oid IS NOT NULL) OR k.confrelid IN(SELECT oid FROM r WHERE oid IS NOT NULL)),
mismatch(relation,area,detail) AS (
 -- A. presence, relation class, RLS, ownership, storage
 SELECT name,'relation',NULL::text FROM r WHERE oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class k WHERE k.oid=r.oid
  AND k.relnamespace='public'::regnamespace AND k.relkind='r' AND k.relpersistence='p' AND k.relowner=current_user::regrole
  AND k.relrowsecurity=(r.t->>'rls')::boolean AND NOT k.relforcerowsecurity AND NOT k.relispartition AND k.reloptions IS NULL
  AND k.reltablespace=0 AND k.reloftype=0 AND k.relreplident='d' AND NOT k.relhasrules
  AND k.relam=(SELECT oid FROM pg_am WHERE amname='heap'))
 -- B. table ACL: only the owner, granted by the owner (owner privilege set is version-dependent, see contract section 4)
 UNION ALL SELECT name,'acl',NULL FROM r JOIN pg_class k ON k.oid=r.oid
  WHERE EXISTS(SELECT 1 FROM aclexplode(coalesce(k.relacl,acldefault('r',k.relowner))) a WHERE a.grantee<>k.relowner OR a.grantor<>k.relowner)
 -- C. extra objects attached to the relation
 UNION ALL SELECT name,'extra-object',NULL FROM r WHERE oid IS NOT NULL AND(EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=r.oid)
  OR EXISTS(SELECT 1 FROM pg_rewrite w WHERE w.ev_class=r.oid) OR EXISTS(SELECT 1 FROM pg_inherits h WHERE h.inhrelid=r.oid OR h.inhparent=r.oid)
  OR EXISTS(SELECT 1 FROM pg_statistic_ext s WHERE s.stxrelid=r.oid))
 -- D. columns in order: name, full type with typmod, NOT NULL, presence of default
 UNION ALL SELECT name,'columns',NULL FROM r WHERE oid IS NOT NULL AND(
  (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.atthasdef) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=r.oid AND a.attnum>0)
   IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(x->>0,x->>1,(x->>2)::boolean,(x->3)<>'null'::jsonb) ORDER BY o) FROM jsonb_array_elements(r.t->'columns') WITH ORDINALITY e(x,o))
  OR EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_type y ON y.oid=a.atttypid WHERE a.attrelid=r.oid AND a.attnum>0 AND(a.attisdropped OR y.oid IS NULL
   OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL OR a.attcollation<>y.typcollation OR a.attstorage<>y.typstorage
   OR a.attcompression<>'' OR a.attinhcount<>0 OR NOT a.attislocal OR a.attndims<>0)))
 -- E. declared defaults: exact deparse under the fixed preflight search_path
 UNION ALL SELECT r.name,'default',x->>0 FROM r CROSS JOIN LATERAL jsonb_array_elements(r.t->'columns') x
  WHERE r.oid IS NOT NULL AND (x->3)<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=r.oid AND a.attname=x->>0 AND pg_get_expr(d.adbin,d.adrelid)=x->>3)
 -- F. constraint inventory and common properties (PG18 catalogs NOT NULL as contype 'n')
 UNION ALL SELECT name,'constraint-inventory',NULL FROM r WHERE oid IS NOT NULL AND(
  (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='p')<>1
  OR (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='u')<>jsonb_array_length(r.t->'unique')
  OR (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='f')<>jsonb_array_length(r.t->'foreign')
  OR (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='c')<>jsonb_array_length(r.t->'checks')
  OR EXISTS(SELECT 1 FROM con WHERE con.conrelid=r.oid AND(con.contype NOT IN('p','u','f','c','n') OR NOT con.convalidated OR con.condeferrable
   OR con.condeferred OR NOT con.conislocal OR con.coninhcount<>0 OR con.conparentid<>0 OR(con.contype='c' AND con.connoinherit)
   OR NOT coalesce((to_jsonb(con)->>'conenforced')::boolean,true) OR coalesce((to_jsonb(con)->>'conperiod')::boolean,false)))
  OR (current_setting('server_version_num')::integer<180000 AND EXISTS(SELECT 1 FROM con WHERE con.conrelid=r.oid AND con.contype='n'))
  OR (current_setting('server_version_num')::integer>=180000 AND(
   (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='n')<>(SELECT count(*) FROM jsonb_array_elements(r.t->'columns') x WHERE (x->>2)::boolean)
   OR (SELECT coalesce(jsonb_agg(con.keys->>0 ORDER BY (con.keys->>0) COLLATE "C"),'[]') FROM con WHERE con.conrelid=r.oid AND con.contype='n' AND cardinality(con.conkey)=1)
    IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x->>0 ORDER BY (x->>0) COLLATE "C"),'[]') FROM jsonb_array_elements(r.t->'columns') x WHERE (x->>2)::boolean))))
 -- G. primary key and unique constraints with their exact plain btree indexes
 UNION ALL SELECT name,'primary-key',NULL FROM r WHERE oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM con JOIN ix ON ix.indexrelid=con.conindid
  WHERE con.conrelid=r.oid AND con.contype='p' AND con.keys=r.t->'pk' AND ix.keys=r.t->'pk' AND ix.indisprimary AND ix.indisunique AND ix.plain
  AND ix.predicate IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ix.options) o WHERE o<>'0'::jsonb))
 UNION ALL SELECT r.name,'unique',u::text FROM r CROSS JOIN LATERAL jsonb_array_elements(r.t->'unique') u WHERE r.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM con JOIN ix ON ix.indexrelid=con.conindid
  WHERE con.conrelid=r.oid AND con.contype='u' AND con.keys=u AND ix.keys=u AND ix.indisunique AND NOT ix.indisprimary AND ix.plain
  AND ix.predicate IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ix.options) o WHERE o<>'0'::jsonb))
 -- H. foreign keys: ordered columns, referenced relation resolved by source name, ordered referenced columns, actions, match
 UNION ALL SELECT r.name,'foreign-key',f::text FROM r CROSS JOIN LATERAL jsonb_array_elements(r.t->'foreign') f WHERE r.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM con
  WHERE con.conrelid=r.oid AND con.contype='f' AND con.keys=f->'columns' AND con.confrelid=to_regclass(f->>'ref') AND con.refkeys=f->'refColumns'
  AND con.confupdtype='a' AND con.confdeltype='a' AND con.confmatchtype='s' AND con.confdelsetcols IS NULL
  AND(f->'name'='null'::jsonb OR con.conname=f->>'name'))
 -- I. inbound foreign keys: exactly the source-declared referrers among the eight tables
 UNION ALL SELECT name,'inbound-foreign-key',NULL FROM r WHERE oid IS NOT NULL AND(
  (SELECT count(*) FROM con WHERE con.confrelid=r.oid AND con.contype='f')<>jsonb_array_length(r.t->'inbound')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.t->'inbound') b WHERE NOT EXISTS(SELECT 1 FROM con WHERE con.confrelid=r.oid AND con.contype='f'
   AND con.conrelid=to_regclass(b->>'from') AND con.keys=b->'columns')))
 -- J. check constraints: matched by the exact referenced-column set; name only where the source names it;
 --    definition compared when the contract supplies the canonical text (source literal or pinned render)
 UNION ALL SELECT r.name,'check',c::text FROM r CROSS JOIN LATERAL jsonb_array_elements(r.t->'checks') c WHERE r.oid IS NOT NULL AND(
  (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='c' AND con.keyset=c->'columns')<>1
  OR (c->'definition'<>'null'::jsonb AND (SELECT count(*) FROM con WHERE con.conrelid=r.oid AND con.contype='c' AND pg_get_constraintdef(con.oid)=c->>'definition')<>1)
  OR NOT EXISTS(SELECT 1 FROM con
  WHERE con.conrelid=r.oid AND con.contype='c' AND con.keyset=c->'columns' AND(c->'name'='null'::jsonb OR con.conname=c->>'name')
  AND(c->'definition'='null'::jsonb OR pg_get_constraintdef(con.oid)=c->>'definition')))
 -- K. index inventory and the named non-constraint indexes (keys, ASC/DESC options, uniqueness, predicate)
 UNION ALL SELECT name,'index-inventory',NULL FROM r WHERE oid IS NOT NULL
  AND (SELECT count(*) FROM pg_index i WHERE i.indrelid=r.oid)<>1+jsonb_array_length(r.t->'unique')+jsonb_array_length(r.t->'indexes')
 UNION ALL SELECT r.name,'index',x->>'name' FROM r CROSS JOIN LATERAL jsonb_array_elements(r.t->'indexes') x WHERE r.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ix
  WHERE ix.indrelid=r.oid AND ix.iname=x->>'name' AND ix.keys=x->'keys' AND ix.options=x->'options' AND ix.indisunique=(x->>'unique')::boolean
  AND NOT ix.indisprimary AND ix.plain AND ix.predicate IS NOT DISTINCT FROM x->>'predicate'
  AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=ix.indexrelid))
 -- L. triggers: exact user triggers; internal triggers only for the expected own and inbound foreign keys
 UNION ALL SELECT name,'trigger-inventory',NULL FROM r WHERE oid IS NOT NULL AND(
  (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid=r.oid AND NOT g.tgisinternal)<>jsonb_array_length(r.t->'triggers')
  OR (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid=r.oid AND g.tgisinternal)<>2*(jsonb_array_length(r.t->'foreign')+jsonb_array_length(r.t->'inbound'))
  OR EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid=r.oid AND g.tgisinternal AND(g.tgenabled<>'O' OR NOT EXISTS(SELECT 1 FROM con
   WHERE con.oid=g.tgconstraint AND con.contype='f' AND(con.conrelid=r.oid OR con.confrelid=r.oid)))))
 UNION ALL SELECT r.name,'trigger',x->>'name' FROM r CROSS JOIN LATERAL jsonb_array_elements(r.t->'triggers') x WHERE r.oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger g
  WHERE g.tgrelid=r.oid AND g.tgname=x->>'name' AND g.tgtype=(x->>'type')::integer AND g.tgfoid=to_regprocedure(x->>'function') AND g.tgenabled='O'
  AND NOT g.tgisinternal AND NOT g.tgdeferrable AND NOT g.tginitdeferred AND g.tgnargs=0 AND g.tgqual IS NULL AND g.tgconstraint=0
  AND g.tgparentid=0 AND cardinality(g.tgattr::int2[])=0 AND g.tgoldtable IS NULL AND g.tgnewtable IS NULL)
)
SELECT jsonb_build_object('version','native-family195-prerequisite-table-layout.v1','contractSha256','<<CONTRACT_SHA256>>',
 'searchPath',current_setting('search_path'),'serverVersionNum',current_setting('server_version_num')::integer,
 'relations',(SELECT count(*) FROM r),'mismatches',coalesce((SELECT jsonb_agg(jsonb_build_object('relation',relation,'area',area,'detail',detail) ORDER BY relation,area,detail) FROM mismatch),'[]'::jsonb)) AS layout
