// Source contract for the existing SQL125 ledger, including populated history.
// This module does not connect, execute SQL, or accept observed catalog bodies.
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export const OWN_REPORT_CLOSE_LEDGER_SOURCE_SHA256='443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5';
const columns=[
 ['id','uuid','gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['group_id','uuid'],['command','text'],['period','text'],['liquidation_type','text'],
 ['actor_membership_id','uuid'],['actor_person_id','uuid'],['actor_email','text'],['actor_label','text'],['actor_session_id','uuid'],['actor_session_version','integer'],['release_sha','text'],
 ['request_key','uuid'],['body','jsonb'],['body_sha256','text'],['snapshot','jsonb'],['snapshot_sha256','text'],['receipt','jsonb'],['recorded_at','timestamp with time zone','clock_timestamp()']
].map(([name,type,defaultValue=null])=>[name,type,true,defaultValue]);
const uniqueKeys=[['p',['id']],['u',['tenant_id','source_binding_id','actor_membership_id','request_key']],['u',['tenant_id','source_binding_id','group_id','command']]];
const foreignKeys=[
 [['tenant_id'],'public.platform_tenant',['id']],[['actor_person_id'],'public.person_identity',['id']],[['actor_session_id'],'public.tenant_identity_session',['id']],
 [['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],[['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']]
];
// Exact non-pretty PostgreSQL expressions derived from the pinned SQL125 DDL.
// Native PG17/18 must verify these; never replace them with observed hashes or
// whitespace removal inside literals to make an unknown constraint pass.
const checks=[
 `(command = ANY (ARRAY['close'::text, 'reopen'::text]))`,
 `(period ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'::text)`,
 `(liquidation_type = ANY (ARRAY['monthly'::text, 'first_fortnight'::text, 'sac'::text, 'vacation'::text, 'supplementary'::text, 'final'::text, 'other'::text]))`,
 `(actor_email = lower(actor_email))`,
 `(actor_session_version > 0)`,
 `(release_sha ~ '^[a-f0-9]{40}$'::text)`,
 `((request_key)::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'::text)`,
 `((jsonb_typeof(body) = 'object'::text) AND (octet_length((body)::text) <= 524288))`,
 `(body_sha256 ~ '^[a-f0-9]{64}$'::text)`,
 `((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 3145728))`,
 `(snapshot_sha256 ~ '^[a-f0-9]{64}$'::text)`,
 `((jsonb_typeof(receipt) = 'object'::text) AND (octet_length((receipt)::text) <= 4194304))`
];
export function ownReportCloseLedgerCheck(){
 return `DO $ledger$ DECLARE relation oid:=to_regclass('public.own_payroll_close_event'); BEGIN
 IF relation IS NULL OR(SELECT count(*) FROM pg_class c WHERE c.oid=relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity AND NOT c.relispartition AND c.reloptions IS NULL AND c.relreplident='d')<>1
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=relation AND a.grantee<>c.relowner)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=relation) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=relation OR inhparent=relation)
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_SECURITY'; END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=relation AND a.attnum>0) IS DISTINCT FROM ${quote(JSON.stringify(columns))}::jsonb
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=relation AND(attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL))
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_COLUMNS'; END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid=relation AND contype='n')<>(CASE WHEN current_setting('server_version_num')::integer/10000>=18 THEN ${columns.length} ELSE 0 END)
 OR EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=relation AND c.contype='n' AND(cardinality(c.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=relation AND a.attnum=c.conkey[1] AND a.attnotnull)))
 OR(SELECT count(DISTINCT conkey[1]) FROM pg_constraint WHERE conrelid=relation AND contype='n')<>(SELECT count(*) FROM pg_constraint WHERE conrelid=relation AND contype='n')
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_NOT_NULL'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation AND(contype NOT IN('p','u','f','c','n') OR NOT convalidated OR condeferrable OR condeferred OR contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')))
 OR(SELECT count(*) FROM pg_constraint WHERE conrelid=relation AND contype='c')<>12
 OR(SELECT coalesce(jsonb_agg(pg_get_expr(conbin,conrelid,false) ORDER BY pg_get_expr(conbin,conrelid,false) COLLATE "C"),'[]') FROM pg_constraint WHERE conrelid=relation AND contype='c') IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value#>>'{}' COLLATE "C") FROM jsonb_array_elements(${quote(JSON.stringify(checks))}::jsonb))
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_CHECKS'; END IF;
 IF(SELECT coalesce(jsonb_agg(v ORDER BY v::text COLLATE "C"),'[]') FROM(SELECT jsonb_build_array(c.contype::text,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num)) v FROM pg_constraint c WHERE c.conrelid=relation AND c.contype IN('p','u')) expected) IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(${quote(JSON.stringify(uniqueKeys))}::jsonb))
 OR(SELECT count(*) FROM pg_index WHERE indrelid=relation)<>3
 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=relation AND(NOT indisunique OR NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indimmediate OR indpred IS NOT NULL OR indexprs IS NOT NULL OR indnatts<>indnkeyatts))
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_KEYS'; END IF;
 IF(SELECT coalesce(jsonb_agg(v ORDER BY v::text COLLATE "C"),'[]') FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),s.nspname||'.'||t.relname,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)) v FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace s ON s.oid=t.relnamespace WHERE c.conrelid=relation AND c.contype='f') expected) IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(${quote(JSON.stringify(foreignKeys))}::jsonb))
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_FOREIGN_KEYS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=relation AND c.contype='f' AND(
  (SELECT count(*) FROM pg_trigger g WHERE g.tgconstraint=c.oid)<>4
  OR EXISTS(SELECT 1 FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid WHERE g.tgconstraint=c.oid AND(NOT g.tgisinternal OR g.tgenabled<>'O' OR g.tgdeferrable OR g.tginitdeferred OR g.tgqual IS NOT NULL OR p.pronamespace<>'pg_catalog'::regnamespace OR g.tgrelid NOT IN(c.conrelid,c.confrelid) OR g.tgconstrrelid NOT IN(c.conrelid,c.confrelid)))
  OR(SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM(SELECT jsonb_build_array(CASE WHEN g.tgrelid=c.conrelid AND g.tgconstrrelid=c.confrelid THEN 'child' WHEN g.tgrelid=c.confrelid AND g.tgconstrrelid=c.conrelid THEN 'parent' ELSE 'invalid' END,p.proname,g.tgtype) v FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid WHERE g.tgconstraint=c.oid) actual) IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements('[["child","RI_FKey_check_ins",5],["child","RI_FKey_check_upd",17],["parent","RI_FKey_noaction_del",9],["parent","RI_FKey_noaction_upd",17]]'::jsonb))
 )) THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_FOREIGN_GUARDS'; END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal)<>2
 OR(SELECT jsonb_agg(tgtype ORDER BY tgtype) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal) IS DISTINCT FROM '[27,34]'::jsonb
 OR(SELECT count(*) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal AND tgtype IN(27,34) AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgattr='' AND tgconstraint=0 AND tgfoid='public.own_close_immutable_v1()'::regprocedure)<>2
 THEN RAISE EXCEPTION 'OWN_REPORT_CENSUS_LEDGER_IMMUTABILITY'; END IF;
 END $ledger$`;
}
