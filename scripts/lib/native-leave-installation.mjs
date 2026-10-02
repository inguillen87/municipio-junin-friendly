// Builds a reviewable batch only. No connection, execution or nominal data leaves SQL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';

export const SQL111_SHA256='b5e8bb44cc2a04ebc7211f9050498acd0d0b7d3ec63f28ae1db1dfb2208fd488';
const hash=s=>createHash('sha256').update(s).digest('hex');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const lf=s=>s.replace(/\r\n?/g,'\n');
const runtime=new Set(['native_leave_bootstrap_v1','native_leave_command_v1','native_leave_attempt_v1']);
const columnShape=[
 ['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['contract_id','uuid'],['registration_id','uuid'],['identity_token','text'],['scope_version','text'],['employment_version','text'],['entity_id','uuid'],['entity_kind','text'],['revision','integer'],['command','text'],['status','text'],['payload','jsonb'],['profile_base_id','uuid',false],['reason','text',false],['evidence_status','text',false],['manual_validation_confirmed','boolean'],['owner_membership_id','uuid'],['owner_person_id','uuid'],['owner_email','text'],['actor_membership_id','uuid'],['actor_person_id','uuid'],['actor_email','text'],['actor_session_id','uuid'],['actor_session_version','integer'],['actor_label','text'],['release_sha','text'],['request_key','uuid'],['request_sha256','text'],['receipt','jsonb'],['recorded_at','timestamp with time zone',true,'clock_timestamp()'],
].map(([name,type,notnull=true,defaultValue=null])=>[name,type,notnull,defaultValue]);
const foreignShape=[
 [['tenant_id'],'public.platform_tenant',['id']],[['contract_id'],'public.employment_contract',['id']],[['registration_id'],'public.native_employee_registration',['id']],[['profile_base_id'],'public.native_leave_event',['id']],
 [['owner_person_id'],'public.person_identity',['id']],[['actor_person_id'],'public.person_identity',['id']],[['actor_session_id'],'public.tenant_identity_session',['id']],
 [['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],[['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']],[['owner_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']],
];
export function functionPin(definition){
 const body=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(body,'Missing function body');
 const header=definition.slice(0,body.index),m=/CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+(SETOF\s+)?([\w.]+)\s+LANGUAGE\s+(\w+)/i.exec(header);assert.ok(m,'Unsupported function definition');
 const params=m[2].trim()?m[2].split(',').map(s=>{const a=/^\s*(\w+)\s+([\w.]+)(?:\s+DEFAULT\s+(NULL|false))?\s*$/i.exec(s);assert.ok(a,'Unsupported argument');return{name:a[1],type:a[2],default:a[3]?.toLowerCase()};}):[];
 const config=[];for(const s of header.matchAll(/\bSET\s+(search_path|timezone)\s*=\s*(.*?)(?=\s+SET\b|$)/gi))config.push(s[1].toLowerCase()==='timezone'?'TimeZone='+s[2].trim().replaceAll("'",''):'search_path='+s[2].split(',').map(x=>x.trim()).join(', '));
 return{name:m[1],signature:'public.'+m[1]+'('+params.map(p=>p.type).join(',')+')',sha256:hash(body[2]),argNames:params.map(p=>p.name),defaults:params.filter(p=>p.default).map(p=>p.default==='null'?'NULL::'+p.type:p.default).join(', '),resultType:m[4],language:m[5].toLowerCase(),returnsSet:!!m[3],strict:/\bSTRICT\b/i.test(header),definer:/\bSECURITY DEFINER\b/i.test(header),volatility:/\bIMMUTABLE\b/.test(header)?'i':/\bSTABLE\b/.test(header)?'s':'v',config,runtime:runtime.has(m[1])};
}
function pinsCheck(pins,code){
 return `DO $metadata$ DECLARE x jsonb;p pg_proc; BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.prosecdef IS DISTINCT FROM (x->>'definer')::boolean OR p.proisstrict IS DISTINCT FROM (x->>'strict')::boolean OR p.proretset IS DISTINCT FROM (x->>'returnsSet')::boolean
   OR p.prorettype<>(x->>'resultType')::regtype OR p.provolatile<>x->>'volatility' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>(CASE WHEN p.proretset THEN 1000 ELSE 0 END)
   OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'argNames' OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'
   OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM x->'config' OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
   OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>x->>'sha256'
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM (x->>'runtime')::boolean
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION '${code}' USING DETAIL=x->>'signature'; END IF;
 END LOOP; END $metadata$`;
}

// Fingerprints cover every prior user table, row, function and security object.
// New foreign-key triggers on old tables are audited separately below.
export function preservationSnapshot(slot){
 assert.ok(['before','after'].includes(slot));
 return `DO $snapshot$ DECLARE c record;n bigint;h text;meta jsonb;tables jsonb:='[]';sequences jsonb:='[]';result jsonb; BEGIN
 FOR c IN SELECT p.*,s.nspname FROM pg_class p JOIN pg_namespace s ON s.oid=p.relnamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND p.relkind IN ('r','p') AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event') ORDER BY p.oid LOOP
  EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(h, '''' ORDER BY h COLLATE "C"),''''),''sha256''),''hex'') FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') h FROM %I.%I r) hashed',c.nspname,c.relname) INTO n,h;
  SELECT jsonb_build_object('class',jsonb_build_object('owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident),'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0),
   'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=c.oid)) INTO meta;
  tables:=tables||jsonb_build_array(jsonb_build_object('oid',c.oid,'schema',c.nspname,'name',c.relname,'rows',n,'rowsSha256',h,'metaSha256',encode(public.digest(meta::text,'sha256'),'hex')));
 END LOOP;
 FOR c IN SELECT p.oid,p.relname,s.nspname FROM pg_class p JOIN pg_namespace s ON s.oid=p.relnamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND p.relkind='S' ORDER BY p.oid LOOP
  EXECUTE format('SELECT encode(public.digest(jsonb_build_object(''last_value'',last_value,''is_called'',is_called)::text,''sha256''),''hex'') FROM %I.%I',c.nspname,c.relname) INTO h; sequences:=sequences||jsonb_build_array(jsonb_build_object('oid',c.oid,'hash',h));
 END LOOP;
 SELECT jsonb_build_object('tables',tables,'sequences',sequences,
  'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'hash',encode(public.digest(to_jsonb(p)::text,'sha256'),'hex')) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class p ON p.oid=t.tgrelid JOIN pg_namespace s ON s.oid=p.relnamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')),
  'schemas',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.oid) FROM pg_namespace s WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'),
  'defaultAcl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.oid) FROM pg_default_acl a),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
  'views',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_viewdef(p.oid),'owner',p.relowner,'acl',p.relacl,'options',p.reloptions) ORDER BY p.oid) FROM pg_class p JOIN pg_namespace s ON s.oid=p.relnamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND p.relkind IN ('v','m'))) INTO result;
 PERFORM set_config('municontrol_sql111.${slot}',result::text,true); END $snapshot$`;
}

export function buildNativeLeaveInstallation({source,prerequisiteDefinitions,sourceCommit}){
 source=lf(source);assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(hash(source),SQL111_SHA256,'Unreviewed SQL111 source');
 const migration=splitPostgresStatements(source),ownPins=migration.filter(s=>/^CREATE FUNCTION public\.native_leave_/.test(s)).map(functionPin);assert.equal(ownPins.length,16);
 assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const prerequisitePins=prerequisiteDefinitions.map(s=>({...functionPin(lf(s)),runtime:false}));assert.equal(prerequisitePins.length,7);assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,7);
 const declaredPins=[...source.matchAll(/\('(public\.[\w]+\([^']*\))','([a-f0-9]{64})'\)/g)].map(m=>({signature:m[1],sha256:m[2]}));assert.equal(declaredPins.length,7);
 for(const p of prerequisitePins)assert.ok(declaredPins.some(x=>x.signature===p.signature&&x.sha256===p.sha256),'Unreviewed prerequisite '+p.signature);
 const before=preservationSnapshot('before'),after=preservationSnapshot('after'),preflight=pinsCheck(prerequisitePins,'SQL111_PREREQUISITE_METADATA'),ownCheck=pinsCheck(ownPins,'SQL111_NEW_FUNCTION_METADATA');
 const priorAudit=`DO $audit$ DECLARE old jsonb:=current_setting('municontrol_sql111.before')::jsonb;new jsonb:=current_setting('municontrol_sql111.after')::jsonb;x jsonb;y jsonb; BEGIN
 IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'SQL111_PRIOR_STATE_CHANGED'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(old->'triggers') LOOP SELECT value INTO y FROM jsonb_array_elements(new->'triggers') WHERE value->'oid'=x->'oid'; IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'SQL111_OLD_TRIGGER_CHANGED'; END IF; END LOOP;
 FOR y IN SELECT n.value FROM jsonb_array_elements(new->'triggers') n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old->'triggers') o WHERE o.value->'oid'=n.value->'oid') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint WHERE t.oid=(y->>'oid')::oid AND t.tgisinternal AND t.tgenabled='O' AND c.contype='f' AND c.conrelid='public.native_leave_event'::regclass) THEN RAISE EXCEPTION 'SQL111_UNEXPECTED_OLD_TRIGGER'; END IF;
 END LOOP;`;
 const newAudit=`IF (SELECT count(*) FROM public.native_leave_event)<>0 THEN RAISE EXCEPTION 'SQL111_NEW_TABLE_NOT_EMPTY'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_leave_%')<>16 THEN RAISE EXCEPTION 'SQL111_NEW_FUNCTION_COUNT'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.native_leave_event'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM ${q(JSON.stringify(columnShape))}::jsonb
 THEN RAISE EXCEPTION 'SQL111_NEW_TABLE_SHAPE'; END IF;
 IF (SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),s.nspname||'.'||r.relname,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)) v FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace s ON s.oid=r.relnamespace WHERE c.conrelid='public.native_leave_event'::regclass AND c.contype='f') actual)
  IS DISTINCT FROM (SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM jsonb_array_elements(${q(JSON.stringify(foreignShape))}::jsonb) v)
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.native_leave_event'::regclass AND(contype NOT IN ('p','u','f','c','n') OR NOT convalidated OR condeferrable OR condeferred OR contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')))
  OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.native_leave_event'::regclass AND contype='c')<>18
  OR (SELECT count(*) FROM pg_index WHERE indrelid='public.native_leave_event'::regclass)<>3
  OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='public.native_leave_event'::regclass AND(NOT indisunique OR NOT indisvalid OR NOT indisready OR NOT indimmediate OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts))
 THEN RAISE EXCEPTION 'SQL111_NEW_TABLE_CONSTRAINTS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.native_leave_event'::regclass AND c.relowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity AND c.relkind='r' AND c.relpersistence='p')
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.native_leave_event'::regclass AND a.grantee<>c.relowner)
  OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.native_leave_event'::regclass AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL))
  OR (SELECT count(*) FROM pg_attribute a WHERE a.attrelid='public.native_leave_event'::regclass AND a.attnum>0)<>32
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.native_leave_event'::regclass)
 THEN RAISE EXCEPTION 'SQL111_NEW_TABLE_SECURITY'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.native_leave_event'::regclass AND NOT tgisinternal)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.native_leave_event'::regclass AND tgname='native_leave_event_immutable' AND tgtype=58 AND tgenabled='O' AND NOT tgisinternal AND tgfoid='public.native_leave_immutable_v1()'::regprocedure AND tgqual IS NULL)
 THEN RAISE EXCEPTION 'SQL111_IMMUTABLE_GUARD'; END IF;`;
 const audit=priorAudit+newAudit+' END $audit$',newObjectAudit='DO $new_objects$ BEGIN '+newAudit+' END $new_objects$';
 const newObjectFingerprint=`(SELECT encode(public.digest(jsonb_build_object(
  'class',jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident),
  'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0),
  'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('index',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=c.oid),
  'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'native_leave_%')
 )::text,'sha256'),'hex') FROM pg_class c WHERE c.oid='public.native_leave_event'::regclass)`;
 const aggregate=includeBefore=>`SELECT jsonb_build_object('checkedAt',clock_timestamp(),'sourceCommit',${q(sourceCommit)},'sqlSha256',${q(SQL111_SHA256)},'allChecksPassed',true,'functions111',16,'runtimeFacades',3,'eventRows',0,'priorTableCount',jsonb_array_length(current_setting('municontrol_sql111.after')::jsonb->'tables'),${includeBefore?"'beforeFingerprint',encode(public.digest(current_setting('municontrol_sql111.before'),'sha256'),'hex'),":''}'afterFingerprint',encode(public.digest(current_setting('municontrol_sql111.after'),'sha256'),'hex'),'newObjectFingerprint',${newObjectFingerprint},'nominalRowsReturned',0) AS proof`;
 const proof=aggregate(true),durableProof=aggregate(false);
 return{sourceCommit,sqlSha256:SQL111_SHA256,migrationStatements:migration.length,ownPins,prerequisitePins,preflight,before,after,audit,ownCheck,proof,durableProof,installation:[preflight,before,...migration,after,audit,ownCheck,proof],durableVerification:[preflight,after,newObjectAudit,ownCheck,durableProof]};
}

export function assertNativeLeaveDurability({installed,durable,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 for(const proof of [installed,durable]){
  assert.equal(proof.sourceCommit,sourceCommit);assert.equal(proof.sqlSha256,SQL111_SHA256);assert.equal(proof.allChecksPassed,true);
  for(const [key,value] of Object.entries({functions111:16,runtimeFacades:3,eventRows:0,nominalRowsReturned:0}))assert.equal(proof[key],value,key);
  assert.ok(Number.isSafeInteger(proof.priorTableCount)&&proof.priorTableCount>0);
  for(const key of ['afterFingerprint','newObjectFingerprint'])assert.match(proof[key],/^[a-f0-9]{64}$/);
 }
 assert.match(installed.beforeFingerprint,/^[a-f0-9]{64}$/);
 for(const key of ['priorTableCount','afterFingerprint','newObjectFingerprint'])assert.equal(durable[key],installed[key],'SQL111_DURABILITY_MISMATCH: '+key);
 return{ok:true,sourceCommit,sqlSha256:SQL111_SHA256,priorStatePreserved:true,newObjectsPreserved:true,nominalRowsReturned:0};
}
