// Scoped conservation evidence only. No source records, decisions or writes are returned.
import {createHash} from 'node:crypto';
import {stableJson} from './canonical-import.mjs';
import {validateSuccessorTarget} from './grh-successor-operational-read.mjs';
import {planMunicipalContinuity,CONTINUITY_TABLES_SQL,CONTINUITY_FOREIGN_KEYS_SQL} from './grh-successor-continuity.mjs';
import {summarizeNativeContinuity} from './grh-successor-native-summary.mjs';
import {MUNICIPAL_CONTINUITY_PROFILE,MUNICIPAL_CONTINUITY_TABLES,MUNICIPAL_CONTINUITY_BINDINGS,MUNICIPAL_CONTINUITY_INHERITANCE} from './grh-municipal-continuity-schema.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=value=>createHash('sha256').update(stableJson(value)).digest('hex');
const emptySha256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function municipalFootprintQuery(table){
 if(!MUNICIPAL_CONTINUITY_TABLES.includes(table))fail('MUNICIPAL_FOOTPRINT_TABLE_INVALID');
 const binding=MUNICIPAL_CONTINUITY_BINDINGS[table],inheritance=MUNICIPAL_CONTINUITY_INHERITANCE.find(p=>p.child===table);
 let join='',where;
 if(binding)where=`r.tenant_id=$1::uuid AND r.${binding}=$2::uuid`;
 else{
  if(!inheritance)fail('MUNICIPAL_FOOTPRINT_SCOPE_INVALID');
  join=` JOIN public.${inheritance.parent} p ON `+inheritance.childColumns.map((column,i)=>`r.${column}=p.${inheritance.parentColumns[i]}`).join(' AND ');
  where=`p.tenant_id=$1::uuid AND p.${MUNICIPAL_CONTINUITY_BINDINGS[inheritance.parent]}=$2::uuid`;
 }
 const rowHash="pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(r)::text,'UTF8')),'hex')";
 return `SELECT jsonb_build_object('table','${table}','rows',count(*),'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(${rowHash},'' ORDER BY ${rowHash}),''),'UTF8')),'hex')) AS observation FROM public.${table} r${join} WHERE ${where}`;
}
const metadataSql=`SELECT jsonb_build_object('projectId',current_setting('neon.project_id',true),'branchId',current_setting('neon.branch_id',true),'databaseName',current_database(),
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'timezone',current_setting('timezone'),'snapshot',txid_current_snapshot()::text,
 'tenantId',p.tenant_id,'bindingId',p.source_binding_id,'coreVersionId',p.source_version_id,'curatedVersionId',v.id,'publicationSha256',p.publication_sha256) AS observation
 FROM public.grh_effective_source_binding p JOIN public.grh_curated_source_version v ON v.core_version_id=p.source_version_id AND v.tenant_id=p.tenant_id AND v.source_binding_id=p.source_binding_id AND v.source_batch_id=p.source_batch_id AND v.import_run_id=p.import_run_id
 JOIN public.platform_tenant t ON t.id=p.tenant_id AND t.status='active'
 JOIN public.platform_tenant_source_binding b ON b.id=p.source_binding_id AND b.tenant_id=p.tenant_id AND b.verified
 WHERE p.tenant_id=$1::uuid AND p.source_binding_id=$2::uuid AND p.source_version_id=$3::uuid AND v.id=$4::uuid AND p.publication_sha256=$5`;
const contexts=new WeakMap();
export function planMunicipalFootprint(catalog,targetInput){
 const target=validateSuccessorTarget(targetInput),scope=planMunicipalContinuity(catalog),coverage=summarizeNativeContinuity(scope);
 if(!coverage.coverageComplete)fail('MUNICIPAL_FOOTPRINT_COVERAGE_INCOMPLETE');
 const contextValues=[target.tenantId,target.bindingId,target.coreVersionId,target.curatedVersionId,target.publicationSha256];
 const queries=[{tag:'metadata',text:metadataSql,values:contextValues},{tag:'catalog-tables',text:CONTINUITY_TABLES_SQL,values:[]},{tag:'catalog-foreign-keys',text:CONTINUITY_FOREIGN_KEYS_SQL,values:[]}];
 for(const table of scope.tables)queries.push({tag:table.name,text:municipalFootprintQuery(table.name),values:[target.tenantId,target.bindingId]});
 queries.push({tag:'catalog-tables-end',text:CONTINUITY_TABLES_SQL,values:[]},{tag:'catalog-foreign-keys-end',text:CONTINUITY_FOREIGN_KEYS_SQL,values:[]},{tag:'metadata-end',text:metadataSql,values:contextValues});
 const plan=freeze({version:'grh-municipal-footprint-plan.v1',queries,options:{readOnly:true,isolationLevel:'RepeatableRead'}});
 contexts.set(plan,{target,scope});return plan;
}
export function evaluateMunicipalFootprint(plan,results){
 const context=contexts.get(plan);if(!context||!Array.isArray(results)||results.length!==plan.queries.length)fail('MUNICIPAL_FOOTPRINT_RESULT_INVALID');
 const {target,scope}=context;
 const metadata=rows=>{if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.observation)fail('MUNICIPAL_FOOTPRINT_INCOMPLETE');return rows[0].observation;};
 const first=metadata(results[0]),last=metadata(results.at(-1));
 for(const value of [first,last]){
  if(value.readOnly!=='on'||value.isolation!=='repeatable read'||value.timezone!=='UTC'||!/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(value.snapshot??''))fail('MUNICIPAL_FOOTPRINT_TRANSACTION_INVALID');
  if(Object.entries(target).some(([key,expected])=>value[key]!==expected))fail('MUNICIPAL_FOOTPRINT_TARGET_CHANGED');
 }
 if(stableJson(first)!==stableJson(last))fail('MUNICIPAL_FOOTPRINT_SNAPSHOT_CHANGED');
 for(const [tables,foreignKeys]of [[results[1],results[2]],[results.at(-3),results.at(-2)]]){
  if(planMunicipalContinuity({tables,foreignKeys}).planSha256!==scope.planSha256)fail('MUNICIPAL_FOOTPRINT_CATALOG_CHANGED');
 }
 const entities={};for(let i=0;i<scope.tables.length;i++){
  const table=scope.tables[i].name,observation=metadata(results[i+3]);
  if(observation.table!==table||!Number.isSafeInteger(observation.rows)||observation.rows<0||!/^[a-f0-9]{64}$/.test(observation.sha256??'')||(observation.rows===0&&observation.sha256!==emptySha256))fail('MUNICIPAL_FOOTPRINT_RESULT_INVALID');
  entities[table]={rows:observation.rows,sha256:observation.sha256};
 }
 const report={version:'grh-municipal-footprint.v1',profileId:MUNICIPAL_CONTINUITY_PROFILE,target,catalogPlanSha256:scope.planSha256,snapshot:first.snapshot,entities,
  normalization:'postgres-jsonb-utc-sha256.v1',readOnly:true,writeStatements:0,containsPersonalRecords:false,semanticConflictsReviewed:false,attachmentBytesVerified:false,sourcePromotionAuthorized:false};
 return freeze({...report,reportSha256:hash(report)});
}
export async function readMunicipalFootprint({catalog,target,transaction,signal}={}){
 if(typeof transaction!=='function')fail('MUNICIPAL_FOOTPRINT_TRANSACTION_REQUIRED');
 signal?.throwIfAborted();const plan=planMunicipalFootprint(catalog,target);
 const results=await transaction(plan.queries,plan.options,signal);signal?.throwIfAborted();return evaluateMunicipalFootprint(plan,results);
}
function verifyReport(value){
 const expectedKeys='attachmentBytesVerified|catalogPlanSha256|containsPersonalRecords|entities|normalization|profileId|readOnly|reportSha256|semanticConflictsReviewed|snapshot|sourcePromotionAuthorized|target|version|writeStatements';
 if(!value||Object.keys(value).sort().join('|')!==expectedKeys||value.version!=='grh-municipal-footprint.v1'||value.profileId!==MUNICIPAL_CONTINUITY_PROFILE)fail('MUNICIPAL_FOOTPRINT_RECEIPT_INVALID');
 const {reportSha256,...report}=value;if(!/^[a-f0-9]{64}$/.test(reportSha256??'')||hash(report)!==reportSha256)fail('MUNICIPAL_FOOTPRINT_RECEIPT_CHANGED');
 validateSuccessorTarget(value.target);
 if(!/^[a-f0-9]{64}$/.test(value.catalogPlanSha256??'')||!/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(value.snapshot??'')||value.normalization!=='postgres-jsonb-utc-sha256.v1'||value.readOnly!==true||value.writeStatements!==0||['containsPersonalRecords','semanticConflictsReviewed','attachmentBytesVerified','sourcePromotionAuthorized'].some(key=>value[key]!==false))fail('MUNICIPAL_FOOTPRINT_RECEIPT_INVALID');
 if(!value.entities||Object.keys(value.entities).sort().join('|')!==[...MUNICIPAL_CONTINUITY_TABLES].sort().join('|'))fail('MUNICIPAL_FOOTPRINT_RECEIPT_INCOMPLETE');
 for(const entity of Object.values(value.entities))if(Object.keys(entity).sort().join('|')!=='rows|sha256'||!Number.isSafeInteger(entity.rows)||entity.rows<0||!/^[a-f0-9]{64}$/.test(entity.sha256??'')||(entity.rows===0&&entity.sha256!==emptySha256))fail('MUNICIPAL_FOOTPRINT_RECEIPT_INVALID');
 return value;
}
export function compareMunicipalFootprints(beforeInput,afterInput){
 const before=verifyReport(beforeInput),after=verifyReport(afterInput);
 for(const key of ['projectId','branchId','databaseName','tenantId','bindingId'])if(before.target[key]!==after.target[key])fail('MUNICIPAL_FOOTPRINT_SCOPE_CHANGED');
 if(before.catalogPlanSha256!==after.catalogPlanSha256)fail('MUNICIPAL_FOOTPRINT_CATALOG_CHANGED');
 const changes=[];for(const table of MUNICIPAL_CONTINUITY_TABLES){const a=before.entities[table],b=after.entities[table];if(a.rows!==b.rows||a.sha256!==b.sha256)changes.push({table,beforeRows:a.rows,afterRows:b.rows});}
 const report={version:'grh-municipal-conservation.v1',beforeReportSha256:before.reportSha256,afterReportSha256:after.reportSha256,tables:MUNICIPAL_CONTINUITY_TABLES.length,
  preserved:changes.length===0,changes,sourceContextChanged:['coreVersionId','curatedVersionId','publicationSha256'].some(key=>before.target[key]!==after.target[key]),
  semanticConflictsReviewed:false,attachmentBytesVerified:false,sourcePromotionAuthorized:false};
 return freeze({...report,reportSha256:hash(report)});
}
