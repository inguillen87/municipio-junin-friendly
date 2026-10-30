import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';
import {
 familyFunctionPin,familyPinsCheck
} from './native-family-prerequisites-190-installation.mjs';

export const SQL195_SHA='3b2cec1ddb2104c890546dca6e9ccb464da2d1d92e067df5e7cc80569406879e';
export const SQL112_SHA='da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3';
const SQL195='scripts/migrations/195-native-family-self-service.sql';
const SQL112='scripts/migrations/112-native-salary-definitions.sql';
const SQL113='scripts/migrations/113-native-employee-self-access.sql';
const VERSION='native-family-self-service-195-installation.v1';
const PREFIX='municontrol_family_self195.';
const RUNTIME='municontrol_actions_runtime_app';
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const hash=x=>createHash('sha256').update(x).digest('hex');
const lf=x=>x.replace(/\r\n?/g,'\n');
const clean=x=>x.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const once=(s,a,b)=>{
 assert.equal(s.split(a).length,2,'FAMILY_SELF195_ANCHOR:'+a.slice(0,70));
 return s.replace(a,()=>b);
};
const exact=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort());
const TABLES=['native_family_storage_policy','native_family_request','native_family_request_event'];
const FACADES=new Set([
 'native_family_self_bootstrap_v1','native_family_review_bootstrap_v1',
 'native_family_self_detail_v1','native_family_review_detail_v1',
 'native_family_self_attempt_v1','native_family_review_attempt_v1',
 'native_family_self_document_v1','native_family_review_document_v1',
 'native_family_self_command_v1','native_family_review_command_v1'
]);
const CAPS=[
 ['employee.family.self.read','Consultar presentaciones familiares propias',
  'Consulta solicitudes y documentos del contrato propio verificado.','tenant','standard'],
 ['employee.family.self.submit','Presentar datos familiares propios',
  'Presenta y corrige datos del contrato propio para revisión de Personal.','tenant','privileged'],
 ['employee.family.review','Revisar presentaciones familiares',
  'Consulta solicitudes del ámbito municipal y exige independencia para registrar decisiones.','tenant','restricted']
];
const CAP_KEYS=CAPS.map(x=>x[0]);
const relations="(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN("+TABLES.map(q).join(',')+"))";
const ownCondition="s.nspname='public' AND p.proname LIKE 'native_family_%'";
const foreignConstraints="(SELECT oid FROM pg_constraint WHERE conrelid IN"+relations+" AND contype='f')";
const fixed=Object.freeze({
 allChecksPassed:true,newTables:3,newFunctions:23,runtimeFacades:10,
 newNamedIndexes:3,newTriggers:3,capabilityDefinitionsAdded:3,
 roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,
 requestRows:0,eventRows:0,storagePolicyRows:1,nominalRowsReturned:0,
 nativeFamilyV5Preserved:true,lifecycleRangePreserved:true
});
const column=(name,type,notnull=true,defaultValue=null)=>[name,type,notnull,defaultValue];
const shape=[
 {name:TABLES[0],checks:4,foreign:[],unique:[['singleton']],indexes:1,rows:1,
  trigger:'native_family_storage_policy_immutable',
  columns:[column('singleton','boolean',true,'true'),
   column('ledger_budget_bytes','bigint'),column('event_bound_bytes','integer'),
   column('request_bound_bytes','integer')]},
 {name:TABLES[1],checks:5,indexes:4,rows:0,
  trigger:'native_family_request_immutable',unique:[['id'],['tenant_id','id']],
  columns:[column('id','uuid',true,'gen_random_uuid()'),column('tenant_id','uuid'),
   column('source_binding_id','uuid'),column('contract_id','uuid'),column('person_id','uuid'),
   column('native_registration_id','uuid'),column('submitter_membership_id','uuid'),
   column('submitter_person_id','uuid'),column('submitter_email','text'),
   column('request_kind','text'),column('subject_version','text'),column('subject_snapshot','jsonb'),
   column('received_at','timestamp with time zone',true,'clock_timestamp()')],
  foreign:[
   [['tenant_id'],'platform_tenant',['id']],
   [['contract_id'],'employment_contract',['id']],
   [['person_id'],'person_identity',['id']],
   [['native_registration_id'],'native_employee_registration',['id']],
   [['submitter_person_id'],'person_identity',['id']],
   [['tenant_id','source_binding_id'],'platform_tenant_source_binding',['tenant_id','id']],
   [['submitter_membership_id','tenant_id'],'tenant_membership',['id','tenant_id']]
  ]},
 {name:TABLES[2],checks:11,indexes:5,rows:0,
  trigger:'native_family_event_immutable',
  unique:[['id'],['tenant_id','id'],['tenant_id','request_id','request_version'],
   ['tenant_id','source_binding_id','actor_membership_id','request_key']],
  columns:[column('id','uuid',true,'gen_random_uuid()'),column('tenant_id','uuid'),
   column('source_binding_id','uuid'),column('request_id','uuid'),column('request_version','integer'),
   column('actor_membership_id','uuid'),column('actor_person_id','uuid',false),
   column('actor_email','text'),column('actor_label','text'),column('actor_session_id','uuid'),
   column('request_key','uuid'),column('body_sha256','text'),column('command','text'),
   column('state','text'),column('reason','text'),column('payload','jsonb'),
   column('blob_sha256','text',false),column('administrative_record','jsonb',false),
   column('recorded_at','timestamp with time zone',true,'clock_timestamp()')],
  foreign:[
   [['tenant_id'],'platform_tenant',['id']],
   [['actor_person_id'],'person_identity',['id']],
   [['actor_session_id'],'tenant_identity_session',['id']],
   [['tenant_id','request_id'],'native_family_request',['tenant_id','id']],
   [['tenant_id','source_binding_id'],'platform_tenant_source_binding',['tenant_id','id']],
   [['actor_membership_id','tenant_id'],'tenant_membership',['id','tenant_id']],
   [['tenant_id','blob_sha256'],'school_certificate_blob',['tenant_id','sha256']]
  ]}
];
const namedIndexes=[
 ['native_family_request_queue_idx',TABLES[1],['tenant_id','source_binding_id','received_at','id'],[0,0,0,0]],
 ['native_family_request_owner_idx',TABLES[1],['tenant_id','source_binding_id','submitter_membership_id','contract_id','received_at','id'],[0,0,0,0,0,0]],
 ['native_family_request_history_idx',TABLES[2],['tenant_id','request_id','request_version'],[0,0,3]]
];

function sourceFunction(read,file,name){
 const found=splitPostgresStatements(lf(read(file))).map(clean).filter(
  d=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\s*\\(').test(d));
 assert.equal(found.length,1,'FAMILY_SELF195_UNIQUE_SOURCE:'+name);return found[0];
}
function thirteenPrerequisites(migration,prerequisites,extraDefinitions){
 const pinsBlock=migration[1];assert.match(pinsBlock,/^DO \$source_pins\$/);
 const rows=[...pinsBlock.matchAll(/\('(public\.[^']+)','([a-f0-9]{64})',ARRAY\[([^\]]*)\]::text\[\],'([vsi])'\)/g)]
  .map(m=>({signature:m[1],sha256:m[2],config:[...m[3].matchAll(/'([^']*)'/g)].map(x=>x[1]),volatility:m[4]}));
 assert.equal(rows.length,13);assert.equal(new Set(rows.map(x=>x.signature)).size,13);
 const definitions=[...prerequisites.definitions,...prerequisites.prerequisiteDefinitions,...extraDefinitions];
 const bySignature=new Map();
 for(const d of definitions){
  const p=familyFunctionPin(d,{runtime:false}),old=bySignature.get(p.signature);
  if(old)assert.equal(old,d,'FAMILY_SELF195_SOURCE_AMBIGUOUS');else bySignature.set(p.signature,d);
 }
 const runtime=new Set([
  'employee_family_declare_v2','school_certificate_register_v3'
 ]);
 const selected=rows.map(row=>{
  const d=bySignature.get(row.signature);assert.ok(d,'FAMILY_SELF195_SOURCE_MISSING:'+row.signature);
  const p=familyFunctionPin(d,{runtime:runtime.has(familyFunctionPin(d,{runtime:false}).name)});
  for(const k of ['signature','sha256','config','volatility'])assert.deepEqual(p[k],row[k]);
  return {definition:d,pin:p};
 });
 const v5=selected.find(x=>x.pin.name==='school_certificate_native_family_v5');
 assert.equal(v5.pin.sha256,'4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c');
 return selected;
}

function previousSnapshot(slot){
 let s=preservationSnapshot(slot);
 const old="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(s.split(old).length,3);s=s.replaceAll(old,'p.oid NOT IN'+relations);
 s=once(s,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'NOT('+ownCondition+')');
 s=s.replaceAll('municontrol_sql111.',PREFIX);
 // Only new capability rows are omitted. iam_capability metadata stays included.
 const query="SELECT count(*),encode(public.digest(coalesce(string_agg(h, '' ORDER BY h COLLATE \"C\"),''),'sha256'),'hex') FROM(SELECT encode(public.digest(to_jsonb(r)::text,'sha256'),'hex') h FROM %I.%I r %s) hashed";
 const filter='WHERE r.capability_key NOT IN('+CAP_KEYS.map(q).join(',')+')';
 const a=s.indexOf('  EXECUTE format('),z=s.indexOf(' INTO n,h;',a);
 assert.ok(a>0&&z>a);
 s=s.slice(0,a)+'  EXECUTE format('+q(query)+",c.nspname,c.relname,CASE WHEN c.oid='public.iam_capability'::regclass THEN "+q(filter)+" ELSE '' END)"+s.slice(z);
 assert.equal(s.includes('native_leave_'),false);return s;
}

function objectsCheckSql(){
 return [
 "DO $family_objects$ DECLARE x jsonb;y jsonb;r oid;n bigint;BEGIN",
 "FOR x IN SELECT value FROM jsonb_array_elements("+q(JSON.stringify(shape))+"::jsonb) LOOP",
 "r:=to_regclass('public.'||(x->>'name'));",
 "IF r IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=r AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity)",
 " OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=r AND a.grantee<>c.relowner)",
 " OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=r AND a.attnum>0 AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL))",
 " OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r)",
 " OR(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=r AND a.attnum>0) IS DISTINCT FROM x->'columns'",
 " THEN RAISE EXCEPTION 'FAMILY_SELF195_TABLE_SECURITY_OR_COLUMNS';END IF;",
 "IF(SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='c')<>(x->>'checks')::int",
 " OR(SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='f')<>jsonb_array_length(x->'foreign')",
 " OR(SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype IN('p','u'))<>jsonb_array_length(x->'unique')",
 " OR(SELECT count(*) FROM pg_constraint WHERE conrelid=r AND contype='p')<>1",
 " OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=r AND(contype NOT IN('c','p','u','f','n') OR NOT convalidated OR condeferrable OR condeferred OR contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')))",
 " THEN RAISE EXCEPTION 'FAMILY_SELF195_CONSTRAINTS';END IF;",
 "FOR y IN SELECT value FROM jsonb_array_elements(x->'unique') LOOP",
 " IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=r AND k.contype IN('p','u') AND(SELECT jsonb_agg(a.attname ORDER BY v.n) FROM unnest(k.conkey) WITH ORDINALITY v(num,n) JOIN pg_attribute a ON a.attrelid=r AND a.attnum=v.num)=y) THEN RAISE EXCEPTION 'FAMILY_SELF195_UNIQUE_KEY';END IF;",
 "END LOOP;",
 "FOR y IN SELECT value FROM jsonb_array_elements(x->'foreign') LOOP",
 " IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=r AND k.contype='f' AND k.confrelid=to_regclass('public.'||(y->>1))",
 " AND(SELECT jsonb_agg(a.attname ORDER BY v.n) FROM unnest(k.conkey) WITH ORDINALITY v(num,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=v.num)=y->0",
 " AND(SELECT jsonb_agg(a.attname ORDER BY v.n) FROM unnest(k.confkey) WITH ORDINALITY v(num,n) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=v.num)=y->2) THEN RAISE EXCEPTION 'FAMILY_SELF195_FOREIGN_KEY';END IF;",
 "END LOOP;",
 "IF(SELECT count(*) FROM pg_index WHERE indrelid=r)<>(x->>'indexes')::int OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=r AND(NOT indisvalid OR NOT indisready OR NOT indimmediate OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'FAMILY_SELF195_INDEXES';END IF;",
 "IF(SELECT count(*) FROM pg_trigger WHERE tgrelid=r AND NOT tgisinternal)<>1 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=r AND tgname=x->>'trigger' AND tgtype=58 AND tgfoid='public.native_family_immutable_v1()'::regprocedure AND tgenabled='O' AND NOT tgisinternal AND NOT tgdeferrable AND NOT tginitdeferred AND tgnargs=0 AND tgqual IS NULL) THEN RAISE EXCEPTION 'FAMILY_SELF195_TRIGGERS';END IF;",
 "EXECUTE format('SELECT count(*) FROM %s',r::regclass) INTO n;IF n<>(x->>'rows')::int THEN RAISE EXCEPTION 'FAMILY_SELF195_ROWS';END IF;",
 "END LOOP;",
 "FOR x IN SELECT value FROM jsonb_array_elements("+q(JSON.stringify(namedIndexes))+"::jsonb) LOOP",
 " IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace AND c.relname=x->>0 AND i.indrelid=to_regclass('public.'||(x->>1)) AND NOT i.indisunique",
 " AND(SELECT jsonb_agg(a.attname ORDER BY v.n) FROM unnest(i.indkey) WITH ORDINALITY v(num,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=v.num)=x->2 AND to_jsonb(i.indoption::smallint[])=x->3) THEN RAISE EXCEPTION 'FAMILY_SELF195_NAMED_INDEX';END IF;",
 "END LOOP;",
 "IF(SELECT jsonb_agg(jsonb_build_array(capability_key,label,description,scope_kind,sensitivity) ORDER BY CASE capability_key WHEN 'employee.family.self.read' THEN 0 WHEN 'employee.family.self.submit' THEN 1 ELSE 2 END) FROM public.iam_capability WHERE capability_key IN("+CAP_KEYS.map(q).join(',')+")) IS DISTINCT FROM "+q(JSON.stringify(CAPS))+"::jsonb THEN RAISE EXCEPTION 'FAMILY_SELF195_CAPABILITIES';END IF;",
 "IF EXISTS(SELECT 1 FROM public.iam_role_capability WHERE capability_key IN("+CAP_KEYS.map(q).join(',')+")) OR EXISTS(SELECT 1 FROM public.tenant_membership_capability_override WHERE capability_key IN("+CAP_KEYS.map(q).join(',')+")) OR EXISTS(SELECT 1 FROM public.tenant_exclusive_capability WHERE capability_key IN("+CAP_KEYS.map(q).join(',')+")) THEN RAISE EXCEPTION 'FAMILY_SELF195_UNEXPECTED_ASSIGNMENT';END IF;",
 "IF(SELECT jsonb_agg(to_jsonb(p)) FROM public.native_family_storage_policy p) IS DISTINCT FROM '[{\"singleton\":true,\"ledger_budget_bytes\":67108864,\"event_bound_bytes\":16384,\"request_bound_bytes\":16384}]'::jsonb THEN RAISE EXCEPTION 'FAMILY_SELF195_POLICY';END IF;",
 "IF(SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE "+ownCondition+")<>23 THEN RAISE EXCEPTION 'FAMILY_SELF195_FUNCTION_COUNT';END IF;",
 "END $family_objects$"
 ].join('\n');
}
export function buildNativeFamilySelfService195Installation({read,sourceCommit,prerequisites}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(prerequisites.version,'native-family-prerequisites-190.v1');
 assert.equal(prerequisites.closure,'native');assert.equal(prerequisites.sourceCommit,sourceCommit);
 const raw195=lf(read(SQL195)),raw112=lf(read(SQL112));
 assert.equal(hash(raw195),SQL195_SHA,'FAMILY_SELF195_UNREVIEWED_SQL');
 assert.equal(hash(raw112),SQL112_SHA,'FAMILY_SELF195_UNREVIEWED_112');
 const sourceHashes={...prerequisites.sourceHashes,[SQL112]:SQL112_SHA,[SQL195]:SQL195_SHA};
 // 113 was already read/pinned by prerequisites; no replacement body comes from DB.
 assert.equal(hash(lf(read(SQL113))),sourceHashes[SQL113]);
 const migration=splitPostgresStatements(raw195).map(clean);
 assert.equal(migration.length,43,'FAMILY_SELF195_COMPLETE_MIGRATION');
 assert.match(migration[0],/^DO \$prerequisites\$/);
 assert.match(migration[1],/^DO \$source_pins\$/);
 assert.match(migration[2],/^DO \$capability_absence\$/);
 const extraDefinitions=[
  sourceFunction(read,SQL113,'native_account_contract_v1'),
  sourceFunction(read,SQL112,'native_salary_serialized_v1')
 ];
 const preceding=thirteenPrerequisites(migration,prerequisites,extraDefinitions);
 const prerequisitePins=preceding.map(x=>x.pin);
 const prerequisiteDefinitions=preceding.map(x=>x.definition);
 const definitions=migration.filter(s=>/^CREATE FUNCTION public\.native_family_/.test(s));
 const ownPins=definitions.map(d=>{
  const name=familyFunctionPin(d,{runtime:false}).name;
  return familyFunctionPin(d,{runtime:FACADES.has(name)});
 });
 assert.equal(ownPins.length,23);assert.equal(new Set(ownPins.map(x=>x.signature)).size,23);
 assert.equal(ownPins.filter(x=>x.runtime).length,10);
 assert.deepEqual(ownPins.filter(x=>x.runtime).map(x=>x.name).sort(),[...FACADES].sort());
 assert.ok(migration.every(s=>!/^(?:BEGIN|COMMIT|ROLLBACK|DROP|CREATE OR REPLACE|SET ROLE)\b/i.test(s)));
 // Complete pinned SQL is the authority for CREATE/INSERT/ACL order, not a DB oracle.
 const prerequisiteCheck=familyPinsCheck(prerequisitePins,'NATIVE_FAMILY_PREREQUISITE_DRIFT');
 const ownCheck=familyPinsCheck(ownPins,'FAMILY_SELF195_FUNCTION_METADATA');
 const objectsCheck=objectsCheckSql();
 const isolation="DO $isolation$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'FAMILY_SELF195_ISOLATION_REQUIRED';END IF;END $isolation$";
 const installationGuard="DO $install$ BEGIN PERFORM pg_advisory_xact_lock(195);END $install$";
 const before=previousSnapshot('before'),after=previousSnapshot('after');
 const priorAudit=[
  "DO $family_prior$ DECLARE old jsonb:=current_setting('"+PREFIX+"before')::jsonb;new jsonb:=current_setting('"+PREFIX+"after')::jsonb;x jsonb;y jsonb;BEGIN",
  "IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'FAMILY_SELF195_PRIOR_STATE_CHANGED';END IF;",
  "FOR x IN SELECT value FROM jsonb_array_elements(old->'triggers') LOOP SELECT value INTO y FROM jsonb_array_elements(new->'triggers') WHERE value->'oid'=x->'oid';IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'FAMILY_SELF195_PRIOR_TRIGGER_CHANGED';END IF;END LOOP;",
  "FOR y IN SELECT n.value FROM jsonb_array_elements(new->'triggers') n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old->'triggers') o WHERE o.value->'oid'=n.value->'oid') LOOP",
  "IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=(y->>'oid')::oid AND t.tgisinternal AND t.tgenabled='O' AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgconstraint IN"+foreignConstraints+") THEN RAISE EXCEPTION 'FAMILY_SELF195_UNEXPECTED_TRIGGER';END IF;END LOOP;END $family_prior$"
 ].join('\n');
 const preservedAfter="jsonb_set(current_setting('"+PREFIX+"after')::jsonb,'{triggers}',coalesce((SELECT jsonb_agg(x.value ORDER BY(x.value->>'oid')::oid) FROM jsonb_array_elements(current_setting('"+PREFIX+"after')::jsonb->'triggers') x WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.oid=(x.value->>'oid')::oid AND t.tgisinternal AND t.tgconstraint IN"+foreignConstraints+")),'null'::jsonb))";
 const objectFingerprint=[
  "(SELECT encode(public.digest(jsonb_build_object(",
  "'tables',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN"+relations+"),",
  "'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a WHERE a.attrelid IN"+relations+"),",
  "'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid IN"+relations+"),",
  "'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid IN"+relations+"),",
  "'indexes',(SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid IN"+relations+"),",
  "'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t WHERE t.oid IN(SELECT reltype FROM pg_class WHERE oid IN"+relations+") OR t.typelem IN(SELECT reltype FROM pg_class WHERE oid IN"+relations+")),",
  "'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid IN"+relations+"),",
  "'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid IN"+relations+" OR t.tgconstraint IN"+foreignConstraints+"),",
  "'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE "+ownCondition+"),",
  "'capabilities',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.capability_key) FROM public.iam_capability c WHERE c.capability_key IN("+CAP_KEYS.map(q).join(',')+")),",
  "'storagePolicy',(SELECT jsonb_agg(to_jsonb(p)) FROM public.native_family_storage_policy p),",
  "'requestRows',(SELECT count(*) FROM public.native_family_request),",
  "'eventRows',(SELECT count(*) FROM public.native_family_request_event)",
  ")::text,'sha256'),'hex'))"
 ].join('\n');
 const prerequisiteFingerprint="(SELECT encode(public.digest(coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+prerequisitePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+")),'[]'::jsonb)::text,'sha256'),'hex'))";
 const proof=withBefore=>"SELECT jsonb_build_object('version',"+q(VERSION)+",'sourceCommit',"+q(sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'sql195Sha256',"+q(SQL195_SHA)+","+
  Object.entries(fixed).map(([k,v])=>q(k)+','+String(v)).join(',')+","+
  (withBefore?"'beforeFingerprint',encode(public.digest(current_setting('"+PREFIX+"before')::jsonb::text,'sha256'),'hex'),":"")+
  "'priorFingerprint',encode(public.digest(("+preservedAfter+")::text,'sha256'),'hex'),"+
  "'objectFingerprint',"+objectFingerprint+",'prerequisiteFingerprint',"+prerequisiteFingerprint+") AS proof";
 const afterCheck=[prerequisiteCheck,objectsCheck,ownCheck];
 const installPrefix=[
  isolation,installationGuard,migration[0],migration[1],prerequisiteCheck,migration[2],before
 ];
 const installation=[...installPrefix,...migration.slice(3),...afterCheck,after,priorAudit,proof(true)];
 const lateFailure="DO $late$ BEGIN RAISE EXCEPTION 'FAMILY_SELF195_REHEARSAL_LATE_FAILURE';END $late$";
 return {
  version:VERSION,sourceCommit,sourceHashes,sql195Sha256:SQL195_SHA,
  connects:false,executesSql:false,definitions,ownPins,prerequisitePins,
  prerequisiteDefinitions,extraDefinitions,migration,isolation,installationGuard,
  prerequisiteCheck,ownCheck,objectsCheck,before,after,priorAudit,fixed,
  proof:proof(true),durableProof:proof(false),
  installation,rehearsal:installation,
  rehearsalLateFailure:[...installation.slice(0,-1),lateFailure],
  durableVerification:[isolation,...afterCheck,after,proof(false)]
 };
}

export function assertNativeFamilySelfService195Durability({installed,durable,batch}){
 const fields=['version','sourceCommit','sourceHashes','sql195Sha256',
  ...Object.keys(fixed),'priorFingerprint','objectFingerprint','prerequisiteFingerprint'];
 for(const p of [installed,durable]){
  exact(p,[...fields,...(p===installed?['beforeFingerprint']:[])]);
  assert.equal(p.version,VERSION);assert.equal(p.sourceCommit,batch.sourceCommit);
  assert.equal(p.sql195Sha256,SQL195_SHA);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const [key,value]of Object.entries(fixed))assert.equal(p[key],value,key);
  for(const key of ['priorFingerprint','objectFingerprint','prerequisiteFingerprint'])
   assert.match(p[key],/^[a-f0-9]{64}$/);
 }
 assert.equal(installed.beforeFingerprint,installed.priorFingerprint,'FAMILY_SELF195_PRIOR_CHANGED');
 const {beforeFingerprint,...rest}=installed;
 assert.deepEqual(rest,durable,'FAMILY_SELF195_NOT_DURABLE');
 return {passed:true,independentReadOnlyDurabilityVerified:true,
  priorRowsAndSecurityPreserved:true,nativeFamilyV5Preserved:true,
  lifecycleRangePreserved:true,roleAssignmentsAdded:0,businessOperations:0,
  nominalRowsReturned:0};
}
