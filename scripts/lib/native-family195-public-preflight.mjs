// Pure public195 material preflight. No connection, target selection or grants.
// Initial-install candidate is a source-guard result, never production admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildNativeFamilyPrerequisites190Installation} from './native-family-prerequisites-190-installation.mjs';
import {buildNativeFamilySelfService195Installation} from './native-family-self-service-195-installation.mjs';
const VERSION='native-family195-public-material-preflight.v1';
const PRODUCERS=Object.freeze({
 'scripts/lib/native-family-prerequisites-190-installation.mjs':'a338f2507b6dd136c0a88389b3cb37c137568948d133f11032054736ca14553c',
 'scripts/lib/native-family-self-service-195-installation.mjs':'ec3a346825212a6a4f84d53e8c5f0b710dde2c554243f7cd084a4c669d46d171'
});
const CAPS=Object.freeze(['employee.family.self.read','employee.family.self.submit','employee.family.review']);
const RUNTIME='municontrol_actions_runtime_app';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const hash=v=>createHash('sha256').update(v).digest('hex');
const exact=(v,keys,code)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort(),code);
const plans=new WeakMap();
const list=values=>'ARRAY['+values.map(q).join(',')+']::text[]';
const names=(statements,pattern)=>statements.flatMap(s=>[...s.matchAll(pattern)].map(m=>m[1]));

const LAYOUT_CONTRACT='scripts/contracts/native-family195-prerequisite-layout-pg17.json',LAYOUT_QUERY='scripts/contracts/native-family195-prerequisite-layout-query.sql';
const LAYOUT_CONTRACT_SHA='ab0ebf2eae47181ee71dc253202beb03d49f844e45a34cd3f1bde3ec3c3eeef2',LAYOUT_QUERY_SHA='e074f98831c06c15fc241829a527e2f59860ace717b9375f69bc992ebe7f580c';
const deepFreeze=(value,seen=new WeakSet())=>{if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const item of Object.values(value))deepFreeze(item,seen);Object.freeze(value);}return value;};
function prepareLayout(read,major){
 assert.equal(major,17,'FAMILY195_LAYOUT_MAJOR_NOT_CLOSED');const raw=read(LAYOUT_CONTRACT),template=read(LAYOUT_QUERY);assert.equal(hash(raw),LAYOUT_CONTRACT_SHA,'FAMILY195_LAYOUT_CONTRACT_SOURCE');assert.equal(hash(template),LAYOUT_QUERY_SHA,'FAMILY195_LAYOUT_QUERY_SOURCE');
 const tables=JSON.parse(raw);assert.equal(tables.length,8);assert.equal(new Set(tables.map(t=>t.name)).size,8);const checks=tables.flatMap(t=>t.checks);assert.equal(checks.length,60);for(const c of checks)assert.ok(typeof c.definition==='string'&&c.definition.length>0,'FAMILY195_LAYOUT_PENDING');
 let sql=template;for(const[from,to]of [["'<<CONTRACT>>'",q(raw)],["'<<CONTRACT_SHA256>>'",q(LAYOUT_CONTRACT_SHA)]]){assert.equal(sql.split(from).length-1,1);sql=sql.replace(from,()=>to);}assert.equal(sql.includes('<<'),false);
 const guardSql="DO $family195_layout$ DECLARE observed jsonb;BEGIN SELECT layout INTO observed FROM ("+sql+") AS source_layout;IF observed->>'version'<>'native-family195-prerequisite-table-layout.v1' OR observed->>'contractSha256'<>"+q(LAYOUT_CONTRACT_SHA)+" OR observed->>'searchPath'<>'pg_catalog, public, pg_temp' OR (observed->>'serverVersionNum')::integer/10000<>17 OR (observed->>'relations')::integer<>8 OR jsonb_array_length(observed->'mismatches')<>0 THEN RAISE EXCEPTION 'FAMILY195_PUBLIC_LAYOUT_DRIFT';END IF;END $family195_layout$";
 return deepFreeze({contractSha256:LAYOUT_CONTRACT_SHA,querySourceSha256:LAYOUT_QUERY_SHA,pending:0,sql,guardSql,sourceHashes:{[LAYOUT_CONTRACT]:LAYOUT_CONTRACT_SHA,[LAYOUT_QUERY]:LAYOUT_QUERY_SHA}});
}
function classifyLayout(contract,observed){
 assert.ok(observed&&Object.getPrototypeOf(observed)===Object.prototype,'FAMILY195_LAYOUT_DTO_REQUIRED');exact(observed,['version','contractSha256','searchPath','serverVersionNum','relations','mismatches']);assert.equal(observed.version,'native-family195-prerequisite-table-layout.v1');assert.equal(observed.contractSha256,contract.layout.contractSha256);assert.equal(observed.searchPath,'pg_catalog, public, pg_temp');assert.ok(Number.isInteger(observed.serverVersionNum)&&Math.trunc(observed.serverVersionNum/10000)===17);assert.equal(observed.relations,8);assert.ok(Array.isArray(observed.mismatches));
 const mismatches=observed.mismatches.map(row=>{exact(row,['relation','area','detail']);assert.equal(typeof row.relation,'string');assert.equal(typeof row.area,'string');assert.ok(row.detail===null||typeof row.detail==='string');return Object.freeze({...row});});return Object.freeze({pending:0,mismatches:Object.freeze(mismatches),reviewRequired:mismatches.length>0});
}

function materialQuery(contract){
 const relationNames=list(contract.requiredRelations),newRelations=list(contract.newRelations),newTypes=list(contract.newTypes),newTriggers=list(contract.newTriggers);
 const caps=list(CAPS);
 // Catalogue records are metadata only. No SELECT against family/personnel rows.
 return `WITH wanted(name) AS (SELECT unnest(${relationNames})), required_relations AS (
 SELECT wanted.name,rel.oid,rel.relname FROM wanted LEFT JOIN pg_class rel
 ON rel.oid=to_regclass('public.'||wanted.name)
 ) SELECT jsonb_build_object(
 'version',${q(VERSION)},'sourceCommit',${q(contract.sourceCommit)},'sourceHashes',${q(JSON.stringify(contract.sourceHashes))}::jsonb,
 'serverMajor',current_setting('server_version_num')::integer/10000,
 'database',current_database(),'currentUser',current_user,'sessionUser',session_user,
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'prerequisiteFunctionCount',13,'prerequisiteFunctionsSourceGuardPassed',true,
 'relations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',rr.name,'present',rr.oid IS NOT NULL,
  'catalog',CASE WHEN rr.oid IS NULL THEN NULL ELSE jsonb_build_object(
   'class',(SELECT to_jsonb(rel) FROM pg_class rel WHERE rel.oid=rr.oid),
   'columns',(SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(att),'type',format_type(att.atttypid,att.atttypmod),'default',pg_get_expr(def.adbin,def.adrelid)) ORDER BY att.attnum) FROM pg_attribute att LEFT JOIN pg_attrdef def ON def.adrelid=att.attrelid AND def.adnum=att.attnum WHERE att.attrelid=rr.oid AND att.attnum>0),
   'constraints',(SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(con),'definition',pg_get_constraintdef(con.oid)) ORDER BY con.oid) FROM pg_constraint con WHERE con.conrelid=rr.oid),
   'indexes',(SELECT jsonb_agg(jsonb_build_object('row',to_jsonb(idx),'definition',pg_get_indexdef(idx.indexrelid)) ORDER BY idx.indexrelid) FROM pg_index idx WHERE idx.indrelid=rr.oid),
   'triggers',(SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.oid) FROM pg_trigger tg WHERE tg.tgrelid=rr.oid),
   'policies',(SELECT jsonb_agg(to_jsonb(pol) ORDER BY pol.oid) FROM pg_policy pol WHERE pol.polrelid=rr.oid)
  ) END) ORDER BY rr.name) FROM required_relations rr),'[]'::jsonb),
 'newObjects',jsonb_build_object(
  'relations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',rel.relname,'kind',rel.relkind,'oid',rel.oid::bigint,'ownerOid',rel.relowner::bigint) ORDER BY rel.relname) FROM pg_class rel WHERE rel.relnamespace='public'::regnamespace AND rel.relname=ANY(${newRelations})),'[]'::jsonb),
  'types',coalesce((SELECT jsonb_agg(jsonb_build_object('name',typ.typname,'oid',typ.oid::bigint) ORDER BY typ.typname) FROM pg_type typ WHERE typ.typnamespace='public'::regnamespace AND typ.typname=ANY(${newTypes})),'[]'::jsonb),
  'functions',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',proc.oid::regprocedure::text,'oid',proc.oid::bigint,'ownerOid',proc.proowner::bigint,'bodySha256',encode(public.digest(replace(proc.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')) ORDER BY proc.oid) FROM pg_proc proc WHERE proc.pronamespace='public'::regnamespace AND proc.proname LIKE 'native_family_%'),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('name',tg.tgname,'oid',tg.oid::bigint,'relationOid',tg.tgrelid::bigint) ORDER BY tg.oid) FROM pg_trigger tg JOIN pg_class rel ON rel.oid=tg.tgrelid WHERE rel.relnamespace='public'::regnamespace AND tg.tgname=ANY(${newTriggers})),'[]'::jsonb)),
 'capabilityDefinitions',coalesce((SELECT jsonb_agg(jsonb_build_object('key',cap.capability_key,'label',cap.label,'description',cap.description,'scopeKind',cap.scope_kind,'sensitivity',cap.sensitivity) ORDER BY cap.capability_key) FROM public.iam_capability cap WHERE cap.capability_key=ANY(${caps})),'[]'::jsonb),
 'assignmentCounts',jsonb_build_object(
  'roles',(SELECT count(*) FROM public.iam_role_capability WHERE capability_key=ANY(${caps})),
  'overrides',(SELECT count(*) FROM public.tenant_membership_capability_override WHERE capability_key=ANY(${caps})),
  'exclusive',(SELECT count(*) FROM public.tenant_exclusive_capability WHERE capability_key=ANY(${caps})))
 ) AS observation`;
}
export function prepareNativeFamily195PublicMaterialPreflight({read,sourceCommit,major}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const sourceHashes={};
 for(const [file,digest]of Object.entries(PRODUCERS)){
  const text=read(file);assert.equal(typeof text,'string');assert.equal(hash(text),digest,'FAMILY195_PUBLIC_PRODUCER_SOURCE:'+file);sourceHashes[file]=digest;
 }
 // Source-only use of the existing builders. Neither prerequisite installation
 // nor any SQL195 statement is executed or exposed as an installation API here.
 const prerequisites=buildNativeFamilyPrerequisites190Installation({read,sourceCommit,closure:'native'});
 const installation=buildNativeFamilySelfService195Installation({read,sourceCommit,prerequisites});
 for(const [file,digest]of Object.entries(installation.sourceHashes)){
  if(Object.hasOwn(sourceHashes,file))assert.equal(sourceHashes[file],digest);sourceHashes[file]=digest;
 }
 assert.equal(installation.prerequisitePins.length,13);
 assert.equal(installation.prerequisitePins.find(p=>p.name==='school_certificate_native_family_v5').sha256,'4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c');
 const tables=names(installation.migration,/^CREATE TABLE public\.([a-z_0-9]+)\s*\(/g);
 const indexes=names(installation.migration,/^CREATE INDEX ([a-z_0-9]+) ON public\./g);
 const triggers=names(installation.migration,/^CREATE TRIGGER ([a-z_0-9]+) /g);
 assert.equal(tables.length,3);assert.equal(indexes.length,3);assert.equal(triggers.length,3);
 const references=names(installation.migration,/\bREFERENCES public\.([a-z_0-9]+)\s*\(/g);
 const requiredRelations=[...new Set([...Object.keys(prerequisites.shape),...references.filter(x=>!tables.includes(x)),
  'iam_capability','iam_role_capability','tenant_membership_capability_override','tenant_exclusive_capability'])].sort();
 const layout=prepareLayout(read,major);Object.assign(sourceHashes,layout.sourceHashes);
 const contract=Object.freeze({sourceCommit,major,layout,installation:deepFreeze(installation),sourceHashes:Object.freeze(sourceHashes),requiredRelations:Object.freeze(requiredRelations),
  newRelations:Object.freeze([...tables,...indexes].sort()),newTypes:Object.freeze(tables.flatMap(t=>[t,'_'+t]).sort()),newTriggers:Object.freeze(triggers.sort())});
 const environmentGuard=`DO $preflight$ BEGIN IF current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' OR current_setting('server_version_num')::integer/10000<>${major} THEN RAISE EXCEPTION 'FAMILY195_PUBLIC_READONLY_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${q(RUNTIME)} AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'FAMILY195_PUBLIC_RUNTIME_REQUIRED';END IF;END $preflight$`;
 const statements=Object.freeze([environmentGuard,installation.prerequisiteCheck,materialQuery(contract),layout.sql]);
 const plan=Object.freeze({version:VERSION,sourceCommit,major,sourceHashes:contract.sourceHashes,requiredRelations:contract.requiredRelations,
  layout:Object.freeze({contractSha256:layout.contractSha256,pending:0}),
  transaction:Object.freeze({isolation:'repeatable read',readOnly:true,end:'COMMIT'}),statements,
  sql:"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL search_path='pg_catalog, public, pg_temp';\n"+statements.join(';\n')+';\nCOMMIT;\n',
  connects:false,executesSql:false,assignsCapabilities:false,installationIncluded:false,productionAdmission:false});
 plans.set(plan,contract);return plan;
}
export function classifyNativeFamily195PublicMaterialPreflight(plan,observation,layoutObservation){
 const contract=plans.get(plan);assert.ok(contract,'FAMILY195_PUBLIC_SOURCE_PLAN_REQUIRED');
 assert.ok(observation&&Object.getPrototypeOf(observation)===Object.prototype);
 exact(observation,['version','sourceCommit','sourceHashes','serverMajor','database','currentUser','sessionUser','readOnly','isolation','prerequisiteFunctionCount','prerequisiteFunctionsSourceGuardPassed','relations','newObjects','capabilityDefinitions','assignmentCounts'],'FAMILY195_PUBLIC_OBSERVATION_FIELDS');
 assert.equal(observation.version,VERSION);assert.equal(observation.sourceCommit,contract.sourceCommit);assert.deepEqual(observation.sourceHashes,contract.sourceHashes);
 assert.equal(observation.serverMajor,contract.major);assert.equal(observation.readOnly,'on');assert.equal(observation.isolation,'repeatable read');
 for(const key of ['database','currentUser','sessionUser'])assert.match(observation[key],/^[A-Za-z0-9_$-]{1,63}$/);
 assert.equal(observation.prerequisiteFunctionCount,13);assert.equal(observation.prerequisiteFunctionsSourceGuardPassed,true);
 assert.ok(Array.isArray(observation.relations));assert.equal(observation.relations.length,contract.requiredRelations.length);
 assert.deepEqual(observation.relations.map(x=>x.name).sort(),contract.requiredRelations);
 const missing=[];
 for(const relation of observation.relations){exact(relation,['name','present','catalog']);assert.equal(typeof relation.present,'boolean');
  if(!relation.present){assert.equal(relation.catalog,null);missing.push(relation.name);}else{assert.ok(relation.catalog&&Object.getPrototypeOf(relation.catalog)===Object.prototype);exact(relation.catalog,['class','columns','constraints','indexes','triggers','policies']);assert.ok(relation.catalog.class&&typeof relation.catalog.class==='object');}
 }
 exact(observation.newObjects,['relations','types','functions','triggers']);
 let anyNew=false;
 for(const values of Object.values(observation.newObjects)){assert.ok(Array.isArray(values));if(values.length)anyNew=true;}
 assert.ok(Array.isArray(observation.capabilityDefinitions));if(observation.capabilityDefinitions.length)anyNew=true;
 exact(observation.assignmentCounts,['roles','overrides','exclusive']);
 for(const count of Object.values(observation.assignmentCounts)){assert.ok(Number.isSafeInteger(count)&&count>=0);if(count)anyNew=true;}
 const layout=classifyLayout(contract,layoutObservation);
 const status=anyNew?'PARTIAL_OR_EXISTING_INSTALLATION':missing.length?'PREREQUISITE_RELATIONS_MISSING':'INITIAL_INSTALL_CANDIDATE';
 // Existing table catalogues are returned for exact source/layout review. This
 // source does not mistake their presence or an observed hash for that review.
 return Object.freeze({status,initialWindowOpen:!anyNew,missingRelations:Object.freeze(missing.sort()),
  prerequisiteFunctionsSourceGuardPassed:true,prerequisiteTableLayoutReviewRequired:layout.reviewRequired,layoutPending:0,layoutMismatches:layout.mismatches,
  canExecuteInstallation:false,productionBindingProved:false,productionAdmission:false,
  roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0});
}

// Source-only accessor: identity is minted by prepare above; this is never a live admission.
export function nativeFamily195PublicSourcePlan(plan){const record=plans.get(plan);assert.ok(record,"FAMILY195_PUBLIC_SOURCE_PLAN_REQUIRED");return Object.freeze({batch:record.installation,layoutGuard:record.layout.guardSql});}
