// Review package only. It never connects or changes a municipal database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {functionPin,preservationSnapshot} from './native-leave-installation.mjs';
import {NATIVE_TIME_PATCHES} from './native-time-catalog-migration.mjs';
export const SQL116_SHA256='32f575407ae82e498cb96dc4a63460de20691b947548b9556bdcf31b4bd9b36f';
const q=s=>"'"+s.replaceAll("'","''")+"'";
const hash=s=>createHash('sha256').update(s).digest('hex');
const newHelpers=['time_catalog_native_subject_v2','time_catalog_native_actor_v2','time_catalog_native_person_caps_v2','time_catalog_edit_payload_v2','time_catalog_assignment_view_v2'];
const changedSignatures=NATIVE_TIME_PATCHES.map(([name,args])=>'public.'+name+'('+args+')');
const changedOids=changedSignatures.map(s=>q(s)+'::regprocedure').join(',');
export function timeCatalogPreservationSnapshot(slot){
 let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.','municontrol_sql116.');
 // No existing table is excluded. Only the three new nullable fields and two
 // reviewed checks are normalized on011; original fields/rows stay identical.
 s=s.replace(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'');
 s=s.replace(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'');
 s=s.replace('to_jsonb(r)::text',"(CASE WHEN %L=''public.time_catalog_entry'' THEN to_jsonb(r)-ARRAY[''reference_code'',''display_name'',''legal_reference'']::text[] ELSE to_jsonb(r) END)::text");
 s=s.replace('c.nspname,c.relname) INTO n,h;',"c.nspname||'.'||c.relname,c.nspname,c.relname) INTO n,h;");
 s=s.replace('WHERE a.attrelid=c.oid AND a.attnum>0)',"WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT(c.oid='public.time_catalog_entry'::regclass AND a.attname IN ('reference_code','display_name','legal_reference')))");
 s=s.replace('WHERE k.conrelid=c.oid)',"WHERE k.conrelid=c.oid AND NOT(c.oid='public.time_catalog_entry'::regclass AND k.conname IN ('time_catalog_reference_shape_v2','time_catalog_reference_key_v2')))");
 s=s.replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')", "AND NOT(s.nspname='public' AND p.proname IN ("+newHelpers.map(q).join(',')+"))");
 s=s.replace("'hash',encode(public.digest(to_jsonb(p)::text,'sha256'),'hex')", "'hash',encode(public.digest((CASE WHEN p.oid IN ("+changedOids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256'),'hex')");
 s=s.replace(" PERFORM set_config('municontrol_sql116.", " IF octet_length(result::text)>2097152 THEN RAISE EXCEPTION 'SQL116_PROOF_LIMIT'; END IF;\n PERFORM set_config('municontrol_sql116.");
 return s;
}
export function buildTimeCatalogInstallation({source,sourceCommit}){
 source=source.replaceAll('\r\n','\n');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(hash(source),SQL116_SHA256,'Unreviewed SQL116');
 const migration=splitPostgresStatements(source);assert.equal(migration.length,19);
 const pins=migration.filter(s=>/CREATE OR REPLACE FUNCTION/.test(s)).map(s=>{const pin=functionPin(s);return {...pin,runtime:['time_catalog_apply_command_v1','time_catalog_detail_v1'].includes(pin.name)};});
 assert.equal(pins.length,15);
 const before=timeCatalogPreservationSnapshot('before'),after=timeCatalogPreservationSnapshot('after');
 const preflight=`DO $new_names$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (${newHelpers.map(q).join(',')})) THEN RAISE EXCEPTION 'SQL116_ALREADY_PRESENT'; END IF; END $new_names$`;
 const metadata=`DO $metadata$ DECLARE x jsonb;p pg_proc; BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.prosecdef IS DISTINCT FROM (x->>'definer')::boolean
 OR p.proisstrict IS DISTINCT FROM (x->>'strict')::boolean OR p.proretset IS DISTINCT FROM (x->>'returnsSet')::boolean
 OR p.prorettype<>(x->>'resultType')::regtype OR p.provolatile<>x->>'volatility' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>0
 OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'argNames'
 OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults' OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM x->'config'
 OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
 OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>x->>'sha256'
 OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM (x->>'runtime')::boolean
 THEN RAISE EXCEPTION 'SQL116_FUNCTION_METADATA' USING DETAIL=x->>'signature'; END IF;
 IF x->>'name' IN (${newHelpers.map(q).join(',')}) AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) THEN RAISE EXCEPTION 'SQL116_PRIVATE_HELPER_GRANTED'; END IF;
 END LOOP; END $metadata$`;
 const columns=`DO $columns$ BEGIN
 IF (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attname) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.time_catalog_entry'::regclass AND a.attname IN ('reference_code','display_name','legal_reference') AND NOT a.attisdropped) IS DISTINCT FROM '[ ["display_name","character varying(120)",false,null],["legal_reference","character varying(200)",false,null],["reference_code","character varying(64)",false,null] ]'::jsonb
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.time_catalog_entry'::regclass AND conname IN ('time_catalog_reference_shape_v2','time_catalog_reference_key_v2') AND contype='c' AND convalidated AND NOT condeferrable)<>2
 THEN RAISE EXCEPTION 'SQL116_REFERENCE_COLUMNS'; END IF; END $columns$`;
 const audit=`DO $audit$ BEGIN IF current_setting('municontrol_sql116.before')::jsonb IS DISTINCT FROM current_setting('municontrol_sql116.after')::jsonb THEN RAISE EXCEPTION 'SQL116_PRIOR_STATE_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM public.time_catalog_entry WHERE reference_code IS NOT NULL OR display_name IS NOT NULL OR legal_reference IS NOT NULL) THEN RAISE EXCEPTION 'SQL116_PRIOR_REFERENCE_REWRITTEN'; END IF; END $audit$`;
 const proof=(beforeIncluded)=>`SELECT jsonb_build_object('sourceCommit',${q(sourceCommit)},'sqlSha256',${q(SQL116_SHA256)},'allChecksPassed',true,'nominalRowsReturned',0,${beforeIncluded?"'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql116.before'),'sha256'),'hex'),":''}'afterFingerprint',encode(public.digest(current_setting('municontrol_sql116.after'),'sha256'),'hex'),
 'objectFingerprint',encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text FROM pg_proc p WHERE p.oid IN (${pins.map(p=>q(p.signature)+'::regprocedure').join(',')})),'sha256'),'hex')) AS proof`;
 return {sourceCommit,sqlSha256:SQL116_SHA256,migrationStatements:19,pins,preflight,before,after,audit,metadata,columns,
   installation:[preflight,before,...migration,after,audit,metadata,columns,proof(true)],durableVerification:[after,metadata,columns,proof(false)]};
}
export function assertTimeCatalogDurability(installed,durable){
 for(const p of [installed,durable]){assert.equal(p.allChecksPassed,true);assert.equal(p.nominalRowsReturned,0);assert.equal(p.sqlSha256,SQL116_SHA256);assert.match(p.sourceCommit,/^[a-f0-9]{40}$/);for(const key of ['afterFingerprint','objectFingerprint'])assert.match(p[key],/^[a-f0-9]{64}$/);}
 assert.match(installed.beforeFingerprint,/^[a-f0-9]{64}$/);assert.equal(installed.beforeFingerprint,installed.afterFingerprint);
 for(const key of ['sourceCommit','afterFingerprint','objectFingerprint'])assert.equal(installed[key],durable[key],'SQL116_DURABILITY_MISMATCH');
 return {ok:true,sourceCommit:installed.sourceCommit,sqlSha256:SQL116_SHA256,priorStatePreserved:true,nominalRowsReturned:0};
}
