// Manifiesto de recuperación: sólo metadatos y huellas; nunca devuelve filas de negocio.
import {createHash} from 'node:crypto';
import {definitionMaterialSql,attestDefinitionRows,verifyDefinitionAttestation,portableDefinitionEquivalence} from './grh-restoration-definitions.mjs';
export const RESTORATION_VERSION='municontrol-restoration-image.v1';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const restorationHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function quoteRestorationIdentifier(value){
 if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>63||/[\x00-\x1f\x7f]/.test(value))fail('RESTORATION_IDENTIFIER_INVALID');
 return '"'+value.replaceAll('"','""')+'"';
}
const scope="n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'";
export const RESTORATION_IDENTITY_SQL=`SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::int/10000 AS major,host(inet_server_addr()) AS host,inet_server_port() AS port,pg_database_size(current_database())::text AS database_bytes`;
export const RESTORATION_TABLES_SQL=`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_total_relation_size(c.oid)::text AS bytes,
 encode(sha256(convert_to(jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'persistence',c.relpersistence,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',co.collname) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r=0,pg_get_userbyid(r)) FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x)
 )::text,'UTF8')),'hex') AS definition_sha256
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind IN ('r','p','m','f') ORDER BY n.nspname,c.relname`;
export const RESTORATION_ROUTINES_SQL=`SELECT n.nspname AS schema,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS name,
 p.proconfig AS configuration,
 encode(sha256(convert_to(jsonb_build_object('owner',pg_get_userbyid(p.proowner),
 'definition',CASE WHEN n.nspname='public' AND p.proname IN ('normalize_digits','is_valid_cuil') AND pg_get_function_identity_arguments(p.oid)='input text' THEN replace(pg_get_functiondef(p.oid),E' SET search_path TO ''pg_catalog'', ''public'', ''pg_temp''\\n','') ELSE pg_get_functiondef(p.oid) END,
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY pg_get_userbyid(x.grantor),x.grantee=0,pg_get_userbyid(x.grantee),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x)
 )::text,'UTF8')),'hex') AS definition_sha256 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE ${scope} AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`;
export const RESTORATION_VIEWS_SQL=`SELECT n.nspname AS schema,c.relname AS name,encode(sha256(convert_to(jsonb_build_object('definition',pg_get_viewdef(c.oid),'owner',pg_get_userbyid(c.relowner),'options',c.reloptions)::text,'UTF8')),'hex') AS definition_sha256 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind='v' ORDER BY n.nspname,c.relname`;
export const RESTORATION_INDEXES_SQL=`SELECT n.nspname AS schema,c.relname AS name,t.relname AS table,pg_relation_size(c.oid)::text AS bytes,encode(sha256(convert_to(pg_get_indexdef(c.oid),'UTF8')),'hex') AS definition_sha256,i.indisvalid AS valid,i.indisready AS ready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} ORDER BY n.nspname,c.relname`;
export function restorationRowsSql(schema,name){
 return `SELECT count(*)::text AS rows,encode(sha256(convert_to(coalesce(string_agg(h.digest,'' ORDER BY h.digest COLLATE "C"),''),'UTF8')),'hex') AS sha256 FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS digest FROM ${quoteRestorationIdentifier(schema)}.${quoteRestorationIdentifier(name)} r) h`;
}
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const size=v=>typeof v==='string'&&/^\d{1,16}$/.test(v)&&Number.isSafeInteger(Number(v));
const key=r=>r.schema+'.'+r.name;
function objectSet(rows,fields){
 if(!Array.isArray(rows)||rows.length>2500)fail('RESTORATION_OBJECTS_INVALID');const keys=new Set();
 for(const row of rows){quoteRestorationIdentifier(row.schema);if(typeof row.name!=='string'||!row.name.length||row.name.length>1024||keys.has(key(row)))fail('RESTORATION_OBJECTS_INVALID');keys.add(key(row));for(const field of fields)if(!hex(row[field]))fail('RESTORATION_OBJECTS_INVALID');}
 return rows;
}
export function validateRestorationImage(image){
 if(image?.containsPersonalRows!==false||image?.version!==RESTORATION_VERSION||!['source','isolated_restore'].includes(image.mode)||image.metadata?.read_only!=='on'||image.metadata?.isolation!=='repeatable read'||image.metadata?.major!==17||!size(image.metadata.database_bytes))fail('RESTORATION_IMAGE_INVALID');
 objectSet(image.tables,['definition_sha256','sha256']);objectSet(image.routines,['definition_sha256']);objectSet(image.views,['definition_sha256']);objectSet(image.indexes,['definition_sha256']);
 if(!image.tables.length||image.tables.length>512||image.tables.some(r=>r.kind!=='r'||!size(r.rows)||!size(r.bytes))||image.indexes.some(r=>!size(r.bytes)||r.valid!==true||r.ready!==true))fail('RESTORATION_IMAGE_INVALID');
 if(!hex(image.imageSha256)||restorationHash(Object.fromEntries(Object.entries(image).filter(([k])=>k!=='imageSha256')))!==image.imageSha256)fail('RESTORATION_IMAGE_HASH');return image;
}
export async function captureRestorationImage(client,{mode,target,signal,onTable}={}){
 if(!['source','isolated_restore'].includes(mode)||typeof client?.query!=='function')fail('RESTORATION_CAPTURE_INVALID');
 signal?.throwIfAborted();const rows=async(text)=>(await client.query(text)).rows;
 const identity=await rows(RESTORATION_IDENTITY_SQL);if(identity.length!==1)fail('RESTORATION_TARGET_INVALID');const meta=identity[0];
 if(meta.major!==17||meta.read_only!=='on'||meta.isolation!=='repeatable read')fail('RESTORATION_TRANSACTION_INVALID');
 if(mode==='source'){
  if(!target?.projectId||!target?.branchId||meta.project!==target.projectId||meta.branch!==target.branchId||meta.database!==target.databaseName)fail('RESTORATION_TARGET_INVALID');
 }else if(meta.project||meta.branch||meta.database!=='municontrol_recovery_qa'||meta.host!=='127.0.0.1'||meta.port!==55472)fail('RESTORATION_TARGET_INVALID');
 await client.query("SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog,public; SET LOCAL extra_float_digits=3; SET LOCAL row_security=off; SET LOCAL work_mem='128MB'");
 const tables=await rows(RESTORATION_TABLES_SQL);if(!tables.length||tables.length>512||tables.some(t=>t.kind!=='r'))fail('RESTORATION_UNSUPPORTED_TABLE_KIND');
 const routines=await rows(RESTORATION_ROUTINES_SQL),views=await rows(RESTORATION_VIEWS_SQL),indexes=await rows(RESTORATION_INDEXES_SQL);
 for(const table of tables){signal?.throwIfAborted();const result=await rows(restorationRowsSql(table.schema,table.name));if(result.length!==1||!size(result[0].rows)||!hex(result[0].sha256))fail('RESTORATION_ROWS_INVALID');Object.assign(table,result[0]);onTable?.({table:key(table),rows:table.rows});}
 const final=await rows(RESTORATION_IDENTITY_SQL);if(final.length!==1||['database','project','branch','read_only','isolation','major','host','port'].some(k=>final[0][k]!==meta[k]))fail('RESTORATION_TARGET_CHANGED');
 const image={version:RESTORATION_VERSION,mode,metadata:meta,tables,routines,views,indexes,containsPersonalRows:false};
 return validateRestorationImage({...image,imageSha256:restorationHash(image)});
}
const repairedConfiguration=['search_path=pg_catalog, public, pg_temp'];
export function compareRestorationImages(sourceValue,restoredValue,{allowIdentityRepair=false,sourceDefinitions=null,restoredDefinitions=null}={}){
 const source=validateRestorationImage(sourceValue),restored=validateRestorationImage(restoredValue);
 if(source.mode!=='source'||restored.mode!=='isolated_restore')fail('RESTORATION_COMPARISON_MODE');
 if(typeof allowIdentityRepair!=='boolean'||!!sourceDefinitions!==!!restoredDefinitions)fail('RESTORATION_COMPARISON_OPTIONS');
 if(sourceDefinitions){verifyDefinitionAttestation(sourceDefinitions,source);verifyDefinitionAttestation(restoredDefinitions,restored);}
 const findings=[],repairs=[],indexChanges=[],portableDifferences=[];
 for(const group of ['tables','routines','views','indexes']){
  const right=new Map(restored[group].map(r=>[key(r),r]));
  for(const before of source[group]){const id=key(before),after=right.get(id);right.delete(id);if(!after){findings.push({group,object:id,reason:'missing'});continue;}
   if(before.definition_sha256!==after.definition_sha256){if(sourceDefinitions&&portableDefinitionEquivalence(group,id,sourceDefinitions,restoredDefinitions))portableDifferences.push({group,object:id,rule:sourceDefinitions.rule});else findings.push({group,object:id,reason:'definition_changed'});}
   if(group==='tables'&&(before.rows!==after.rows||before.sha256!==after.sha256))findings.push({group,object:id,reason:'rows_changed'});
   if(group==='routines'&&JSON.stringify(before.configuration)!==JSON.stringify(after.configuration)){
    if(allowIdentityRepair&&['public.normalize_digits(input text)','public.is_valid_cuil(input text)'].includes(id)&&before.configuration===null&&JSON.stringify(after.configuration)===JSON.stringify(repairedConfiguration)&&before.definition_sha256===after.definition_sha256)repairs.push(id);
    else findings.push({group,object:id,reason:'configuration_changed'});
   }
   if(group==='indexes')indexChanges.push({schema:before.schema,name:before.name,table:before.table,definitionSha256:before.definition_sha256,beforeBytes:Number(before.bytes),restoredBytes:Number(after.bytes),differenceBytes:Number(before.bytes)-Number(after.bytes)});
  }
  for(const id of right.keys())findings.push({group,object:id,reason:'unexpected'});
 }
 return {version:'municontrol-restoration-comparison.v1',matched:findings.length===0,sourceImageSha256:source.imageSha256,restoredImageSha256:restored.imageSha256,sourceDatabaseBytes:Number(source.metadata.database_bytes),restoredDatabaseBytes:Number(restored.metadata.database_bytes),tables:source.tables.length,routines:source.routines.length,views:source.views.length,indexes:source.indexes.length,findings,portableDefinitionDifferences:portableDifferences,rawDefinitionsIdentical:portableDifferences.length===0&&findings.every(f=>f.reason!=='definition_changed'),localIdentityRepairs:repairs,indexChanges,sourceProductionWrites:0,serviceCredentialsRestored:false,sequenceStateVerified:false,publicationAuthorized:false};
}

export async function captureRestorationDefinitions(client,imageInput){
 const image=validateRestorationImage(imageInput),first=(await client.query(RESTORATION_IDENTITY_SQL)).rows[0];
 if(!first||first.read_only!=='on'||first.isolation!=='repeatable read'||['database','project','branch','major','port'].some(k=>first[k]!==image.metadata[k]))fail('RESTORATION_DEFINITION_TARGET');
 await client.query("SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog,public; SET LOCAL extra_float_digits=3");
 const observed={};for(const [group,sql]of Object.entries({tables:RESTORATION_TABLES_SQL,routines:RESTORATION_ROUTINES_SQL,views:RESTORATION_VIEWS_SQL,indexes:RESTORATION_INDEXES_SQL}))observed[group]=(await client.query(definitionMaterialSql(sql))).rows;
 return attestDefinitionRows(image,observed);
}
