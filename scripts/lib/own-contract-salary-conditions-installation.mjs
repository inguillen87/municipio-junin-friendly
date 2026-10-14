// Source-pinned, reviewable installation only. No connection or municipal command.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {WORKING_TIME_PRIOR_PINS} from './own-contract-working-time-source-pins.mjs';
import {CONDITIONS_CONSUMER_PRIOR_PINS} from './own-contract-salary-conditions-source-pins.mjs';

const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const hash=s=>createHash('sha256').update(s).digest('hex');
const table='own_salary_conditions_event',prefix='municontrol_salary_conditions_install.';
const expected=Object.freeze({
 'scripts/migrations/171-own-contract-salary-conditions.sql':'42c253a0395abf7abe326804cdd1a641d6936df84c960728c1e6a6aa6319c8ee',
 'scripts/migrations/172-own-salary-conditions-program-source.sql':'74ae429927824d6b9e209f1776ec4f7537e95182f2fd14b4f40b5862d0a633df',
 'scripts/migrations/173-own-full-payroll-response.sql':'9bad8f03e887d5f01e6c71b0d668e28fb83c71639060df330b11f8db79af9825',
 'scripts/lib/own-contract-salary-conditions-source-pins.mjs':'6a80ddb83c414e9697b9077e15033bbe811dfbc3fde03e0c69a8aca3523c13f5',
 'scripts/lib/own-contract-working-time-source-pins.mjs':'f7bfec89a0ad3b96c401c849168b822265bc55961b2c1f38ad3bf970625bccfd',
 'scripts/migrations/138-adopted-fixed-novelties.sql':'da7bc276e367dc3c0377c99e3c687747665a53c0c186eb457f27ab9032803469',
});
const facades=new Set(['own_salary_conditions_bootstrap_v1','own_salary_conditions_detail_v1','own_salary_conditions_attempt_v1','own_salary_conditions_command_v1','own_run_complete_full_v1']);
function metadataSource(s){
 const at=s.search(/\bAS\s+\$/);assert.ok(at>=0);
 return s.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at);
}
const columns=[
 ['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['period_month','date'],['proposal_id','uuid',false],['command','text'],['body','jsonb'],['base_items','jsonb'],['source_snapshot','jsonb'],['revision','integer'],['actor_membership_id','uuid'],['actor_person_id','uuid'],['actor_email','text'],['actor_session_id','uuid'],['actor_session_version','integer'],['release_sha','text'],['actor_label','text'],['request_key','uuid'],['request_sha256','text'],['receipt','jsonb'],['recorded_at','timestamp with time zone',true,'clock_timestamp()'],
].map(([name,type,required=true,defaultValue=null])=>[name,type,required,defaultValue]);
const foreigns=[
 [['tenant_id'],'public.platform_tenant',['id']],[['proposal_id'],'public.'+table,['id']],[['actor_person_id'],'public.person_identity',['id']],[['actor_session_id'],'public.tenant_identity_session',['id']],[['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],[['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']],
];
const checks=[
 "CHECK ((EXTRACT(day FROM period_month) = (1)::numeric) AND ((period_month >= '1900-01-01'::date) AND (period_month <= '2099-12-01'::date)))",
 "CHECK (command = ANY (ARRAY['propose'::text, 'approve'::text, 'reject'::text]))",
 "CHECK ((jsonb_typeof(body) = 'object'::text) AND (octet_length(body::text) <= 4194304))",
 "CHECK ((jsonb_typeof(base_items) = 'array'::text) AND (octet_length(base_items::text) <= 4194304))",
 "CHECK ((jsonb_typeof(source_snapshot) = 'object'::text) AND (octet_length(source_snapshot::text) <= 8388608))",
 'CHECK ((revision >= 0) AND (revision <= 1000))','CHECK (actor_email = lower(actor_email))','CHECK (actor_session_version > 0)',
 "CHECK (release_sha ~ '^[a-f0-9]{40}$'::text)","CHECK (request_key::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'::text)","CHECK (request_sha256 ~ '^[a-f0-9]{64}$'::text)","CHECK ((command = 'propose'::text) = (proposal_id IS NULL))",
].map(s=>s.replace(/[\s()]/g,'')).sort();
const unique=[['p',['id']],['u',['tenant_id','source_binding_id','actor_membership_id','request_key']],['u',['proposal_id']]];
const indexes=[
 [true,true,['id'],null],[true,false,['proposal_id'],null],[true,false,['tenant_id','source_binding_id','actor_membership_id','request_key'],null],
 [true,false,['tenant_id','source_binding_id','period_month','revision'],"command='approve'::text"],
 [false,false,['tenant_id','source_binding_id','period_month'],null],
];
export function salaryConditionsTableCheck(){return `DO $shape$ DECLARE t pg_class;actual jsonb; BEGIN
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.${table}');
 IF t.oid IS NULL OR t.relkind<>'r' OR t.relowner<>current_user::regrole OR NOT t.relrowsecurity OR t.relforcerowsecurity OR t.relpersistence<>'p' OR t.reloptions IS NOT NULL OR t.relreplident<>'d'
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=t.oid) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner)
 OR has_table_privilege('municontrol_actions_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'SALARY_CONDITIONS_TABLE_SECURITY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]') INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0;
 IF actual<>${q(JSON.stringify(columns))}::jsonb OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND(attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_TABLE_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') COLLATE "C"),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='c';
 IF actual<>${q(JSON.stringify(checks))}::jsonb OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND(NOT convalidated OR condeferrable OR condeferred OR contype NOT IN('p','u','c','f','n'))) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_CONSTRAINT_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY v::text COLLATE "C"),'[]') INTO actual FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),s.nspname||'.'||r.relname,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)) v FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace s ON s.oid=r.relnamespace WHERE c.conrelid=t.oid AND c.contype='f') f;
 IF actual IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(${q(JSON.stringify(foreigns))}::jsonb)) OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FOREIGN_SHAPE';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype<>'n')<>21 OR(SELECT coalesce(jsonb_agg(jsonb_build_array(k.contype,(SELECT jsonb_agg(a.attname ORDER BY v.n) FROM unnest(k.conkey) WITH ORDINALITY v(num,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=v.num)) ORDER BY k.contype,k.conkey),'[]') FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype IN('p','u'))<>${q(JSON.stringify(unique))}::jsonb THEN RAISE EXCEPTION 'SALARY_CONDITIONS_UNIQUE_SHAPE';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype='n')<>(CASE WHEN current_setting('server_version_num')::int/10000>=18 THEN 20 ELSE 0 END) OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='n' AND(cardinality(k.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=k.conkey[1] AND a.attnotnull))) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_NOT_NULL_SHAPE';END IF;
 SELECT jsonb_agg(v ORDER BY v::text COLLATE "C") INTO actual FROM(SELECT jsonb_build_array(i.indisunique,i.indisprimary,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(i.indkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num),regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')) v FROM pg_index i WHERE i.indrelid=t.oid) f;
 IF actual IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(${q(JSON.stringify(indexes))}::jsonb)) OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=t.oid AND(NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indimmediate OR indexprs IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INDEX_SHAPE';END IF;
 IF(SELECT coalesce(jsonb_agg(jsonb_build_array(g.tgname,g.tgtype,g.tgenabled,g.tgfoid::regprocedure::text) ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal)<>'[["own_salary_conditions_immutable",27,"O","own_salary_conditions_immutable_v1()"],["own_salary_conditions_no_truncate",34,"O","own_salary_conditions_immutable_v1()"]]'::jsonb OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.oid AND NOT tgisinternal AND(tgqual IS NOT NULL OR tgnargs<>0 OR tgattr<>''::int2vector)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_IMMUTABLE_GUARD';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f' AND(SELECT count(*)<>4 OR bool_or(g.tgenabled<>'O' OR NOT g.tgisinternal OR g.tgconstrrelid NOT IN(k.conrelid,k.confrelid)) FROM pg_trigger g WHERE g.tgconstraint=k.oid)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FOREIGN_GUARD';END IF;
 END $shape$`;}

export function buildOwnContractSalaryConditionsInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 const texts={},sourceHashes={};for(const [f,pin]of Object.entries(expected)){texts[f]=read(f).replace(/\r\n?/g,'\n');assert.equal(hash(texts[f]),pin,'SALARY_CONDITIONS_SOURCE_CHANGED: '+f);sourceHashes[f]=pin;}
 const [migration,changed,full]=Object.keys(expected).slice(0,3).map(f=>splitPostgresStatements(texts[f]));
 assert.equal(changed.length,6);assert.ok(changed.every(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.')));assert.equal(full.length,3);
 const mutations=[...migration,...changed,...full];assert.ok(mutations.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const newPins=[...migration,...full].filter(s=>/^CREATE FUNCTION public\./.test(s)).map(s=>{const p=ownInstallationFunctionPin(metadataSource(s));return{...p,runtime:facades.has(p.name)};});
 assert.equal(newPins.length,16);assert.equal(newPins.filter(p=>p.runtime).length,5);assert.equal(new Set(newPins.map(p=>p.name)).size,16);
 const names=new Set(CONDITIONS_CONSUMER_PRIOR_PINS.map(p=>p.name));
 const range=splitPostgresStatements(texts['scripts/migrations/138-adopted-fixed-novelties.sql']).filter(s=>/^CREATE (?:OR REPLACE )?FUNCTION public\.payroll_fixed_registry_range_v2\(/.test(s));assert.equal(range.length,1);
 const prerequisitePins=[...WORKING_TIME_PRIOR_PINS.filter(p=>!names.has(p.name)),{...ownInstallationFunctionPin(range[0]),runtime:false}];
 const beforePins=[...prerequisitePins,...CONDITIONS_CONSUMER_PRIOR_PINS];assert.equal(new Set(beforePins.map(p=>p.signature)).size,beforePins.length);
 const afterConsumerPins=changed.map(s=>{const p=ownInstallationFunctionPin(metadataSource(s)),old=CONDITIONS_CONSUMER_PRIOR_PINS.find(x=>x.name===p.name);assert.ok(old);assert.deepEqual({...p,sha256:null},{...old,sha256:null});return p;});
 const afterPins=[...prerequisitePins,...afterConsumerPins,...newPins];
 const beforeCheck=pinsCheck(beforePins,'SALARY_CONDITIONS_PREREQUISITE_CHANGED');
 const afterCheck=pinsCheck(afterPins,'SALARY_CONDITIONS_FUNCTION_CHANGED')+';'+salaryConditionsTableCheck()+`;DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND(proname LIKE 'own_salary_conditions_%' OR proname='own_run_complete_full_v1'))<>16 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FUNCTION_COUNT';END IF;END $count$`;
 const ids=CONDITIONS_CONSUMER_PRIOR_PINS.map(p=>q(p.signature)+'::regprocedure').join(','),newNames=newPins.map(p=>q(p.name)).join(',');
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('native_leave_event',table).replaceAll('municontrol_sql111.',prefix);
  const once=(a,b)=>{assert.equal(s.split(a).length,2,'SALARY_CONDITIONS_AUDIT_ANCHOR');s=s.replace(a,()=>b);};
  once("s.nspname='public' AND p.proname LIKE 'native_leave_%'","s.nspname='public' AND p.proname IN("+newNames+')');
  once("public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
  once("p.oid IS DISTINCT FROM to_regclass('public."+table+"')),","p.oid IS DISTINCT FROM to_regclass('public."+table+"') AND NOT(t.tgisinternal AND t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid=to_regclass('public."+table+"') AND contype='f'))),");
  return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_ISOLATION_REQUIRED';END IF;PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);${[132142,132143,143,132149,132150,145,132164,156,132166,171].map(k=>'PERFORM pg_advisory_xact_lock('+k+');').join('')}PERFORM set_config('${prefix}mode',CASE WHEN to_regclass('public.${table}') IS NULL THEN 'install' ELSE 'verify' END,true);IF current_setting('${prefix}mode')='install' AND EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN(${newNames})) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_OBJECT_CONFLICT';END IF;END $mode$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}IF(SELECT count(*) FROM public.${table})<>0 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_NEW_TABLE_NOT_EMPTY';END IF;END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'SALARY_CONDITIONS_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objectFingerprint=`encode(public.digest(jsonb_build_object('class',(SELECT jsonb_build_object('owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'options',c.reloptions) FROM pg_class c WHERE oid='public.${table}'::regclass),'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid='public.${table}'::regclass),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid='public.${table}'::regclass),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid='public.${table}'::regclass),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid='public.${table}'::regclass),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid='public.${table}'::regclass OR t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='f')),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids}) OR p.pronamespace='public'::regnamespace AND p.proname IN(${newNames})))::text,'sha256'),'hex')`;
 const proof=modeValue=>`SELECT jsonb_build_object('version','own-contract-salary-conditions-installation.v1','sourceCommit',${q(sourceCommit)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newTables',1,'newFunctions',16,'runtimeFacades',5,'adaptedFunctions',6,'roleAssignmentsAdded',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public.${table}),'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',${objectFingerprint}) AS proof`;
 return{sourceCommit,sourceHashes,migration,changed,full,mutations,newPins,beforePins,afterPins,beforeCheck,afterCheck,before,after,mode,choose,apply,conservation,statements:[mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')")],verification:[afterCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
export function assertOwnContractSalaryConditionsDurability({installed,durable,batch}){
 for(const p of[installed,durable]){
  assert.equal(p.version,'own-contract-salary-conditions-installation.v1');assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const[k,v]of Object.entries({newTables:1,newFunctions:16,runtimeFacades:5,adaptedFunctions:6,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  for(const k of['preservationSha256','objectFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);assert.ok(Number.isInteger(p.eventRows)&&p.eventRows>=0);
 }
 const{mode,...a}=installed,{mode:other,...b}=durable;assert.ok(['install','verify'].includes(mode));assert.equal(other,'verify');assert.deepEqual(a,b,'SALARY_CONDITIONS_INSTALL_NOT_DURABLE');
}
