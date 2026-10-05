// Review-only generation. All rows stay in SQL; this module never connects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {preservationSnapshot,pinsCheck} from './native-leave-installation.mjs';
export const OWN_INSTALL_SHA=Object.freeze({122:'edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785',123:'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b'});
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
const tables=['own_payroll_program_event','own_payroll_run_capture','own_payroll_run_result'];
const caps=['payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare'];
const facadeNames=new Set(['own_program_bootstrap_v1','own_program_attempt_v1','own_program_command_v1','own_run_bootstrap_v1','own_run_attempt_v1','own_run_capture_v1','own_run_complete_v1']);
const relations=`(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN(${tables.map(q).join(',')}))`;
const ownCondition="s.nspname='public' AND(p.proname LIKE 'own_program_%' OR p.proname LIKE 'own_run_%')";
const foreignConstraints=`(SELECT oid FROM pg_constraint WHERE conrelid IN${relations} AND contype='f')`;
export function ownInstallationFunctionPin(definition){
 const body=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(body,'Function body missing');
 const header=definition.slice(0,body.index),match=/CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+(SETOF\s+)?([\w.]+)\s+LANGUAGE\s+(\w+)/i.exec(header);assert.ok(match,'Unsupported function header');
 const params=match[2].trim()?match[2].split(',').map(raw=>{const p=/^\s*(\w+)\s+([\w.]+(?:\[\])?)(?:\s+DEFAULT\s+(NULL|false|0|'[^']*'))?\s*$/i.exec(raw);assert.ok(p,'Unsupported function argument');return {name:p[1],type:p[2],default:p[3]};}):[];
 const config=[];for(const setting of header.matchAll(/\bSET\s+(search_path|timezone)\s*=\s*(.*?)(?=\s+SET\b|$)/gi))config.push(setting[1].toLowerCase()==='timezone'?'TimeZone='+setting[2].trim().replaceAll("'",''):'search_path='+setting[2].split(',').map(v=>v.trim()).join(', '));
 return {name:match[1],signature:'public.'+match[1]+'('+params.map(p=>p.type).join(',')+')',sha256:hash(body[2]),argNames:params.map(p=>p.name),defaults:params.filter(p=>p.default!==undefined).map(p=>p.default.toUpperCase()==='NULL'?'NULL::'+p.type:p.default.startsWith("'")?p.default+'::'+p.type:p.default.toLowerCase()).join(', '),resultType:match[4],language:match[5].toLowerCase(),returnsSet:!!match[3],strict:/\bSTRICT\b/i.test(header),definer:/\bSECURITY DEFINER\b/i.test(header),volatility:/\bIMMUTABLE\b/i.test(header)?'i':/\bSTABLE\b/i.test(header)?'s':'v',config,runtime:facadeNames.has(match[1])};
}
const prerequisites=[
 ['112-native-salary-definitions.sql',['native_salary_context_v1','native_salary_catalog_v1','native_salary_lock_v1','native_salary_serialized_v1','native_salary_scope_v1']],
 ['110-native-employment-lifecycle.sql',['native_employment_lifecycle_range_v1']],
 ['101-native-monthly-novelties.sql',['payroll_novelty_export_v2']],
 ['092-payroll-fixed-novelties.sql',['payroll_fixed_registry_context_v1','payroll_fixed_registry_lock_v1','payroll_fixed_registry_record_json_v1','payroll_fixed_registry_effects_v1','payroll_fixed_registry_export_v1']],
 ['093-native-fixed-novelties.sql',['payroll_fixed_registry_subject_by_contract_v1']],
];
function prerequisiteCheck(pins){
 // Source metadata is pinned; existing execute ACLs are preserved exactly by
 // the whole prior-state snapshot, rather than silently normalizing old ACLs.
 return pinsCheck(pins,'OWN_INSTALL_PREREQUISITE_CHANGED').replace(/\s+OR has_function_privilege\([\s\S]*?\n  THEN RAISE EXCEPTION/, '\n  THEN RAISE EXCEPTION');
}
function snapshot(slot){
 let sql=preservationSnapshot(slot);const exclusion="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(sql.split(exclusion).length-1,2);sql=sql.replaceAll(exclusion,'p.oid NOT IN'+relations).replace("s.nspname='public' AND p.proname LIKE 'native_leave_%'",ownCondition).replaceAll('municontrol_sql111.','municontrol_own_install.');
 const query="SELECT count(*),encode(public.digest(coalesce(string_agg(h, '' ORDER BY h COLLATE \"C\"),''),'sha256'),'hex') FROM(SELECT encode(public.digest(to_jsonb(r)::text,'sha256'),'hex') h FROM %I.%I r %s) hashed";
 const filter="WHERE r.capability_key NOT IN("+caps.map(q).join(',')+")";
 const start=sql.indexOf('  EXECUTE format('),end=sql.indexOf(' INTO n,h;',start);assert.ok(start>0&&end>start);
 sql=sql.slice(0,start)+'  EXECUTE format('+q(query)+',c.nspname,c.relname,CASE WHEN c.nspname='+q('public')+' AND c.relname='+q('iam_capability')+' THEN '+q(filter)+" ELSE '' END)"+sql.slice(end);
 return sql;
}
const col=(name,type,defaultValue=null)=>[name,type,true,defaultValue],uuid=(...names)=>names.map(n=>col(n,'uuid'));
const shapes=[
 {name:tables[0],columns:[col('id','uuid','gen_random_uuid()'),...uuid('tenant_id','source_binding_id'),['proposal_id','uuid',false,null],col('command','text'),col('body','jsonb'),col('base_definition','jsonb'),col('base_salary_items','jsonb'),col('revision','integer'),...uuid('actor_membership_id','actor_person_id'),col('actor_email','text'),col('actor_session_id','uuid'),col('actor_session_version','integer'),...['release_sha','actor_label'].map(n=>col(n,'text')),col('request_key','uuid'),col('request_sha256','text'),col('receipt','jsonb'),col('recorded_at','timestamp with time zone','clock_timestamp()')],checks:10,indexes:4,foreign:6},
 {name:tables[1],columns:[col('id','uuid','gen_random_uuid()'),...uuid('tenant_id','source_binding_id','actor_membership_id','actor_person_id'),col('actor_email','text'),col('actor_session_id','uuid'),col('actor_session_version','integer'),col('release_sha','text'),col('request_key','uuid'),col('body','jsonb'),col('body_sha256','text'),col('algorithm_sha256','text'),col('payload','jsonb'),col('payload_sha256','text'),col('created_at','timestamp with time zone','clock_timestamp()')],checks:9,indexes:2,foreign:5},
 {name:tables[2],columns:[col('capture_id','uuid'),col('algorithm_sha256','text'),col('input','jsonb'),col('result','jsonb'),col('input_sha256','text'),col('result_sha256','text'),col('recorded_at','timestamp with time zone','clock_timestamp()')],checks:5,indexes:1,foreign:1},
];
const actorForeign=[
 [['tenant_id'],'public.platform_tenant',['id']],
 [['actor_person_id'],'public.person_identity',['id']],
 [['actor_session_id'],'public.tenant_identity_session',['id']],
 [['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],
 [['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']],
];
shapes[0].fk=[...actorForeign,[['proposal_id'],'public.own_payroll_program_event',['id']]];
shapes[1].fk=actorForeign;shapes[2].fk=[[['capture_id'],'public.own_payroll_run_capture',['id']]];
function newObjectsCheck(){return `DO $objects$ DECLARE item jsonb;r oid; BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(shapes))}::jsonb) LOOP r:=to_regclass('public.'||(item->>'name'));
 IF r IS NULL OR(SELECT count(*) FROM pg_class c WHERE c.oid=r AND c.relowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity AND c.relkind='r' AND c.relpersistence='p')<>1
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=r AND a.grantee<>c.relowner)
 OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=r AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL)) OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r)
 OR(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=r AND a.attnum>0) IS DISTINCT FROM item->'columns'
 THEN RAISE EXCEPTION 'OWN_INSTALL_TABLE_SHAPE_SECURITY';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='c')<>(item->>'checks')::int OR(SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='f')<>(item->>'foreign')::int
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=r AND(contype NOT IN('p','u','f','c','n') OR NOT convalidated OR condeferrable OR condeferred OR contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')))
 OR(SELECT count(*) FROM pg_index WHERE indrelid=r)<>(item->>'indexes')::int OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=r AND(NOT indisunique OR NOT indisvalid OR NOT indisready OR NOT indimmediate OR indexprs IS NOT NULL OR indnatts<>indnkeyatts))
 THEN RAISE EXCEPTION 'OWN_INSTALL_TABLE_CONSTRAINTS';END IF;
 IF(SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),s.nspname||'.'||t.relname,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)) v FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace s ON s.oid=t.relnamespace WHERE c.conrelid=r AND c.contype='f') f) IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(item->'fk'))
 OR(SELECT count(*) FROM pg_index WHERE indrelid=r AND indpred IS NOT NULL)<>(CASE WHEN item->>'name'='own_payroll_program_event' THEN 1 ELSE 0 END)
 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=r AND indpred IS NOT NULL AND pg_get_expr(indpred,indrelid)<>'(command = ''approve''::text)')
 THEN RAISE EXCEPTION 'OWN_INSTALL_FOREIGN_KEYS_INDEX_PREDICATE';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>2 OR(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal AND tgtype IN(27,34) AND tgenabled='O' AND tgqual IS NULL AND tgfoid=CASE WHEN item->>'name'='own_payroll_program_event' THEN 'public.own_program_immutable_v1()'::regprocedure ELSE 'public.own_run_immutable_v1()'::regprocedure END)<>2 THEN RAISE EXCEPTION 'OWN_INSTALL_IMMUTABILITY';END IF;
 END LOOP;
 IF(SELECT count(*) FROM public.own_payroll_program_event)<>0 OR(SELECT count(*) FROM public.own_payroll_run_capture)<>0 OR(SELECT count(*) FROM public.own_payroll_run_result)<>0 THEN RAISE EXCEPTION 'OWN_INSTALL_NEW_TABLE_NOT_EMPTY';END IF;
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_program_%')<>14 OR(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_run_%')<>13 THEN RAISE EXCEPTION 'OWN_INSTALL_FUNCTION_COUNT';END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(capability_key,label,description,scope_kind,sensitivity) ORDER BY capability_key COLLATE "C") FROM public.iam_capability WHERE capability_key IN(${caps.map(q).join(',')})) IS DISTINCT FROM ${q(JSON.stringify([
  ['payroll.calculation.nominal.read','Consultar resultados propios','Fuentes y resultados nominales de corridas técnicas propias.','tenant','privileged'],
  ['payroll.calculation.prepare','Calcular corrida propia','Capturar fuentes y conservar un cálculo técnico. No confirma, anula, liquida definitivamente ni paga.','tenant','privileged'],
  ['payroll.calculation.read','Consultar corridas propias','Metadatos de corridas técnicas propias, sin datos nominales.','tenant','standard'],
 ]))}::jsonb THEN RAISE EXCEPTION 'OWN_INSTALL_CAPABILITY_DEFINITION';END IF;
 END $objects$`;}
const priorAudit=`DO $prior$ DECLARE old jsonb:=current_setting('municontrol_own_install.before')::jsonb;new jsonb:=current_setting('municontrol_own_install.after')::jsonb;x jsonb;y jsonb;BEGIN
 IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'OWN_INSTALL_PRIOR_STATE_CHANGED';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(old->'triggers') LOOP SELECT value INTO y FROM jsonb_array_elements(new->'triggers') WHERE value->'oid'=x->'oid';IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'OWN_INSTALL_PRIOR_TRIGGER_CHANGED';END IF;END LOOP;
 FOR y IN SELECT n.value FROM jsonb_array_elements(new->'triggers') n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old->'triggers') o WHERE o.value->'oid'=n.value->'oid') LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=(y->>'oid')::oid AND t.tgisinternal AND t.tgenabled='O' AND t.tgconstraint IN${foreignConstraints}) THEN RAISE EXCEPTION 'OWN_INSTALL_UNEXPECTED_TRIGGER';END IF;END LOOP;END $prior$`;
const preservedAfter=`jsonb_set(current_setting('municontrol_own_install.after')::jsonb,'{triggers}',coalesce((SELECT jsonb_agg(x.value ORDER BY (x.value->>'oid')::oid) FROM jsonb_array_elements(current_setting('municontrol_own_install.after')::jsonb->'triggers') x WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=(x.value->>'oid')::oid AND t.tgisinternal AND t.tgconstraint IN${foreignConstraints})),'null'::jsonb))`;
const fingerprint=`(SELECT encode(public.digest(jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_object('class',jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident),'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid=c.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN${relations}),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid IN${relations} OR t.tgconstraint IN${foreignConstraints}),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition}),'newCapabilities',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.capability_key) FROM public.iam_capability c WHERE capability_key IN(${caps.map(q).join(',')})))::text,'sha256'),'hex'))`;
function installedFixedExportHash(definition,read){
 // Derive the already published093/110 body in memory. Never execute it.
 const once=(source,old,value)=>{assert.equal(source.split(old).length,2,'Published export anchor drift');return source.replace(old,()=>value);};
 const originalLock=' LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity IN SHARE MODE NOWAIT;';
 const nativeLock=' LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity,public.native_employee_registration,public.platform_tenant_source_binding IN SHARE MODE NOWAIT;';
 const source093=lf(read('scripts/migrations/093-native-fixed-novelties.sql'));assert.ok(source093.includes('$old$'+originalLock+'$old$')&&source093.includes('$new$'+nativeLock+'$new$'));
 let patched=once(definition,originalLock,nativeLock);patched=once(patched,'\nBEGIN','\n-- native-fixed093\nBEGIN');
 assert.equal(ownInstallationFunctionPin(patched).sha256,'18b1a674e825c33624a9d54b6f1824659f970eb6661d9f417d0c658db7c5f71f');
 const source110=lf(read('scripts/migrations/110-native-employment-lifecycle.sql'));
 const match=/d:=replace\(d,anchor,'([\s\S]+?)'\|\|E'\\n'\|\|anchor\);/.exec(source110);assert.ok(match,'Published lifecycle export anchor missing');
 const returnAnchor=" RETURN jsonb_build_object('version','payroll-fixed-export.v1'";
 patched=once(patched,returnAnchor,match[1].replaceAll("''","'")+'\n'+returnAnchor);
 const sha=ownInstallationFunctionPin(patched).sha256;assert.equal(sha,'c3b008ba635cc4e6cb6c6ae5722c5caaebecdf7d95376e79c6375de0cea9febd');return sha;
}
export function buildOwnPayrollInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);const migration=[];
 for(const id of [122,123]){const source=lf(read('scripts/migrations/'+id+(id===122?'-own-payroll-programs.sql':'-own-payroll-runs.sql')));assert.equal(hash(source),OWN_INSTALL_SHA[id],'Unreviewed migration');migration.push(...splitPostgresStatements(source));}
 assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));const ownPins=migration.filter(s=>/^CREATE FUNCTION public\.own_/.test(s)).map(ownInstallationFunctionPin);assert.equal(ownPins.length,27);assert.equal(ownPins.filter(p=>p.runtime).length,7);
 const prerequisitePins=[];for(const[file,names]of prerequisites){const statements=splitPostgresStatements(lf(read('scripts/migrations/'+file)));for(const name of names){const definition=statements.find(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.ok(definition,'Missing prerequisite: '+name);const pin=ownInstallationFunctionPin(definition);if(name==='payroll_fixed_registry_export_v1')pin.sha256=installedFixedExportHash(definition,read);prerequisitePins.push(pin);}}assert.equal(prerequisitePins.length,13);
 const preflight=[`DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN${relations}) OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition}) OR EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key IN(${caps.map(q).join(',')})) THEN RAISE EXCEPTION 'OWN_INSTALL_OBJECT_CONFLICT';END IF;END $empty$`,prerequisiteCheck(prerequisitePins)];
 const before=snapshot('before'),after=snapshot('after'),ownCheck=pinsCheck(ownPins,'OWN_INSTALL_NEW_FUNCTION_METADATA'),objectsCheck=newObjectsCheck();
 const proof=withBefore=>`SELECT jsonb_build_object('sourceCommit',${q(sourceCommit)},'sql122Sha256',${q(OWN_INSTALL_SHA[122])},'sql123Sha256',${q(OWN_INSTALL_SHA[123])},'allChecksPassed',true,'newTables',3,'newFunctions',27,'runtimeFacades',7,'eventRows',0,'captureRows',0,'resultRows',0,'capabilityDefinitionsAdded',3,'roleAssignmentsAdded',0,'nominalRowsReturned',0,'priorTableCount',jsonb_array_length(current_setting('municontrol_own_install.after')::jsonb->'tables'),${withBefore?"'beforeFingerprint',encode(public.digest(current_setting('municontrol_own_install.before'),'sha256'),'hex'),":''}'afterFingerprint',encode(public.digest((${preservedAfter})::text,'sha256'),'hex'),'newObjectFingerprint',${fingerprint}) AS proof`;
 return {sourceCommit,sql122Sha256:OWN_INSTALL_SHA[122],sql123Sha256:OWN_INSTALL_SHA[123],migrationStatements:migration.length,ownPins,prerequisitePins,preflight,before,after,priorAudit,objectsCheck,ownCheck,installation:[...preflight,before,...migration,after,priorAudit,objectsCheck,ownCheck,prerequisiteCheck(prerequisitePins),proof(true)],durableVerification:[prerequisiteCheck(prerequisitePins),after,objectsCheck,ownCheck,proof(false)]};
}
export function assertOwnPayrollDurability({installed,durable,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(installed.beforeFingerprint,/^[a-f0-9]{64}$/);
 for(const value of [installed,durable]){
  assert.equal(value.sourceCommit,sourceCommit);assert.equal(value.sql122Sha256,OWN_INSTALL_SHA[122]);assert.equal(value.sql123Sha256,OWN_INSTALL_SHA[123]);assert.equal(value.allChecksPassed,true);
  for(const[key,expected]of Object.entries({newTables:3,newFunctions:27,runtimeFacades:7,eventRows:0,captureRows:0,resultRows:0,capabilityDefinitionsAdded:3,roleAssignmentsAdded:0,nominalRowsReturned:0}))assert.equal(value[key],expected,key);
  assert.ok(Number.isSafeInteger(value.priorTableCount)&&value.priorTableCount>0);for(const key of ['afterFingerprint','newObjectFingerprint'])assert.match(value[key],/^[a-f0-9]{64}$/);
 }
 assert.equal(installed.beforeFingerprint,installed.afterFingerprint,'OWN_INSTALL_PRIOR_DATA_CHANGED');for(const key of ['priorTableCount','afterFingerprint','newObjectFingerprint'])assert.equal(installed[key],durable[key],'OWN_INSTALL_NOT_DURABLE: '+key);
 return {passed:true,sourceCommit,priorStatePreserved:true,newObjectsPreserved:true,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0};
}
