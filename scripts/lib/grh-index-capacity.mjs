// Mantenimiento físico explícito; nunca borra filas, cambia cuotas ni selecciona una fuente.
import {createHash} from 'node:crypto';
import {sourceCapacity,SOURCE_CAPACITY_QUERY} from './grh-source-capacity.mjs';
import {GRH_VERSION_STORAGE_BUDGET} from './grh-core-source-version.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const name=v=>typeof v==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const bytes=v=>Number.isSafeInteger(v)&&v>=0;
export const indexCapacityHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const INDEX_CAPACITY_IDENTITY=`SELECT current_setting('neon.project_id',true) AS project_id,current_setting('neon.branch_id',true) AS branch_id,current_database() AS database_name,current_user AS role,current_setting('server_version_num')::integer/10000 AS major`;
export const INDEX_CAPACITY_INVENTORY=`SELECT n.nspname AS schema,c.relname AS name,t.relname AS table,
 pg_relation_size(c.oid)::text AS bytes,c.oid::text AS oid,pg_get_indexdef(c.oid) AS definition,
 encode(sha256(convert_to(pg_get_indexdef(c.oid),'UTF8')),'hex') AS definition_sha256,
 am.amname AS method,c.relkind AS kind,t.relkind AS table_kind,i.indisvalid AS valid,i.indisready AS ready,
 i.indisexclusion AS exclusion,i.indexprs IS NULL AS simple,pg_get_userbyid(t.relowner)=current_user AS owner,
 EXISTS(SELECT 1 FROM pg_inherits inh WHERE inh.inhrelid=c.oid OR inh.inhparent=c.oid) AS inherited
 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_am am ON am.oid=c.relam
 WHERE n.nspname='public' ORDER BY c.relname`;
export function verifiedIndex(row){
 if(!row||row.schema!=='public'||!name(row.name)||!name(row.table)||!sha(row.definition_sha256)
 ||typeof row.oid!=='string'||typeof row.bytes!=='string'||!/^\d+$/.test(row.oid)||!/^\d+$/.test(row.bytes)||!bytes(Number(row.bytes))
 ||row.method!=='btree'||row.kind!=='i'||row.table_kind!=='r'||row.valid!==true||row.ready!==true
 ||row.owner!==true||row.simple!==true||row.exclusion!==false||row.inherited!==false
 ||/_cc(?:new|old)\d*$/.test(row.name))fail('INDEX_CAPACITY_UNSUPPORTED');
 return row;
}
function targetValid(t){if(!t||Object.keys(t).sort().join('|')!=='branchId|databaseName|projectId'||![t.projectId,t.branchId].every(v=>typeof v==='string'&&/^[a-z0-9-]{5,80}$/.test(v))||!name(t.databaseName))fail('INDEX_CAPACITY_TARGET_INVALID');return t;}
export function planIndexCapacity({target,inventory,restoredIndexes,capacity,restorationSha256,now=new Date()}={}){
 targetValid(target);if(!Array.isArray(inventory)||!Array.isArray(restoredIndexes)||!sha(restorationSha256)||!Number.isFinite(+now))fail('INDEX_CAPACITY_PLAN_INVALID');
 const measured=sourceCapacity(capacity,GRH_VERSION_STORAGE_BUDGET);const suggestions=new Map(restoredIndexes.map(r=>[r.schema+'.'+r.name,r]));const seen=new Set(),indexes=[];
 for(const row of inventory){if(seen.has(row.name))fail('INDEX_CAPACITY_DUPLICATE');seen.add(row.name);try{verifiedIndex(row);}catch{continue;}
  const hint=suggestions.get(row.schema+'.'+row.name),current=Number(row.bytes),restored=Number(hint?.bytes);
  if(!hint||hint.definition_sha256!==row.definition_sha256||!bytes(restored)||restored<8192||current>8*1024*1024||current-restored<32768)continue;
  indexes.push({schema:row.schema,name:row.name,table:row.table,oid:row.oid,definitionSha256:row.definition_sha256,beforeBytes:current,restoredBytes:restored,estimatedRecoveryBytes:current-restored});
 }
 indexes.sort((a,b)=>b.estimatedRecoveryBytes-a.estimatedRecoveryBytes||a.name.localeCompare(b.name));
 const body={version:'grh-index-capacity-plan.v1',target:{...target},createdAt:now.toISOString(),expiresAt:new Date(+now+30*60000).toISOString(),restorationSha256,
 capacity:measured,postGoalBufferBytes:1024*1024,indexes:indexes.slice(0,40),changesRows:false,changesQuota:false,selectsSource:false};
 return Object.freeze({...body,planSha256:indexCapacityHash(body)});
}
export function validateIndexCapacityPlan(plan,expectedSha256,now=new Date()){
 if(!plan||plan.version!=='grh-index-capacity-plan.v1'||!sha(expectedSha256)||plan.planSha256!==expectedSha256)fail('INDEX_CAPACITY_PLAN_CHANGED');
 const {planSha256,...body}=plan;if(indexCapacityHash(body)!==planSha256)fail('INDEX_CAPACITY_PLAN_CHANGED');targetValid(plan.target);
 if(!(now instanceof Date)||!Number.isFinite(+now)||!Number.isFinite(Date.parse(plan.createdAt))||!Number.isFinite(Date.parse(plan.expiresAt))||+now<Date.parse(plan.createdAt)||+now>=Date.parse(plan.expiresAt)||Date.parse(plan.expiresAt)-Date.parse(plan.createdAt)>30*60000)fail('INDEX_CAPACITY_PLAN_EXPIRED');
 if(plan.postGoalBufferBytes!==1024*1024||plan.changesRows!==false||plan.changesQuota!==false||plan.selectsSource!==false||!sha(plan.restorationSha256)||!Array.isArray(plan.indexes)||plan.indexes.length>40)fail('INDEX_CAPACITY_PLAN_INVALID');
 const seen=new Set();for(const row of plan.indexes){if(row.schema!=='public'||!name(row.name)||!name(row.table)||seen.has(row.name)||!sha(row.definitionSha256)||!/^\d+$/.test(row.oid??'')||![row.beforeBytes,row.restoredBytes,row.estimatedRecoveryBytes].every(bytes)||row.beforeBytes>8*1024*1024||row.restoredBytes<8192||row.estimatedRecoveryBytes!==row.beforeBytes-row.restoredBytes||row.estimatedRecoveryBytes<32768)fail('INDEX_CAPACITY_PLAN_INVALID');seen.add(row.name);}
 return plan;
}
export async function readIndexCapacityState(client,target){
 targetValid(target);const r=await client.query(INDEX_CAPACITY_IDENTITY),s=r.rows?.[0];if(r.rows?.length!==1||s.project_id!==target.projectId||s.branch_id!==target.branchId||s.database_name!==target.databaseName||s.major!==17)fail('INDEX_CAPACITY_WRONG_TARGET');
 const capacity=await client.query(SOURCE_CAPACITY_QUERY);if(capacity.rows?.length!==1)fail('INDEX_CAPACITY_READ_INVALID');
 const result=await client.query(INDEX_CAPACITY_INVENTORY);if(!Array.isArray(result.rows)||result.rows.length>2000)fail('INDEX_CAPACITY_READ_INVALID');
 return {capacity:capacity.rows[0],inventory:result.rows,identity:s};
}
export async function executeIndexCapacity({client,plan,expectedSha256,confirm=false,now=()=>new Date(),signal,onProgress}={}){
 if(confirm!==true||typeof client?.query!=='function')fail('INDEX_CAPACITY_CONFIRMATION_REQUIRED');
 validateIndexCapacityPlan(plan,expectedSha256,now());let locked=false,rebuilding=false;const completed=[];
 const query=async(text,values)=>{signal?.throwIfAborted();const result=await client.query(text,values);signal?.throwIfAborted();return result;};
 const scope={query};const capacity=r=>sourceCapacity(r,GRH_VERSION_STORAGE_BUDGET);
 const identity=()=>readIndexCapacityState(scope,plan.target);
 const fingerprint=async table=>{const r=await query(`/* index-capacity:rows */ SELECT count(*)::text AS rows,encode(sha256(convert_to(coalesce(string_agg(h.digest,'' ORDER BY h.digest COLLATE "C"),''),'UTF8')),'hex') AS sha256 FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS digest FROM "public"."${table}" r) h`);
  if(r.rows?.length!==1||!/^\d+$/.test(r.rows[0].rows??'')||!sha(r.rows[0].sha256))fail('INDEX_CAPACITY_ROWS_UNVERIFIED');return r.rows[0];};
 const stray=rows=>rows.some(r=>r.valid!==true||r.ready!==true||/_cc(?:new|old)\d*$/.test(r.name));
 let initial;
 try{
  initial=await identity();if(stray(initial.inventory))fail('INDEX_CAPACITY_INVALID_INDEX_PRESENT');
  const lock=await query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',['municontrol:index-capacity:'+plan.target.projectId+':'+plan.target.branchId]);
  if(lock.rows?.[0]?.acquired!==true)fail('INDEX_CAPACITY_BUSY');locked=true;
  await query("SELECT set_config('statement_timeout','90s',false),set_config('lock_timeout','2s',false),set_config('maintenance_work_mem','64MB',false),set_config('max_parallel_maintenance_workers','0',false),set_config('timezone','UTC',false),set_config('extra_float_digits','3',false),set_config('row_security','off',false)");
  for(const candidate of plan.indexes){
   validateIndexCapacityPlan(plan,expectedSha256,now());const before=await identity(),budget=capacity(before.capacity);if(budget.afterReserveBytes>=budget.requiredGrowthBytes+plan.postGoalBufferBytes)break;
   if(stray(before.inventory))fail('INDEX_CAPACITY_INVALID_INDEX_PRESENT');const row=before.inventory.find(r=>r.name===candidate.name);verifiedIndex(row);
   if(row.table!==candidate.table||row.oid!==candidate.oid||row.definition_sha256!==candidate.definitionSha256||Number(row.bytes)>candidate.beforeBytes)fail('INDEX_CAPACITY_INDEX_CHANGED');
   const peakBytes=Number(row.bytes)*2+2*1024*1024;if(peakBytes>budget.afterReserveBytes)fail('INDEX_CAPACITY_TEMPORARY_SPACE_REQUIRED');
   const beforeRows=await fingerprint(candidate.table);rebuilding=true;
   await query(`REINDEX INDEX CONCURRENTLY "public"."${candidate.name}"`);rebuilding=false;
   const after=await identity();if(stray(after.inventory))fail('INDEX_CAPACITY_REBUILD_UNCONFIRMED');const replaced=verifiedIndex(after.inventory.find(r=>r.name===candidate.name));
   if(replaced.table!==candidate.table||replaced.definition_sha256!==candidate.definitionSha256)fail('INDEX_CAPACITY_DEFINITION_CHANGED');
   const afterRows=await fingerprint(candidate.table);if(JSON.stringify(beforeRows)!==JSON.stringify(afterRows))fail('INDEX_CAPACITY_CONCURRENT_ROWS_CHANGED');
   const afterBudget=capacity(after.capacity);if(afterBudget.afterReserveBytes<0)fail('INDEX_CAPACITY_RESERVE_EXCEEDED');
   const entry={name:candidate.name,table:candidate.table,beforeBytes:Number(row.bytes),afterBytes:Number(replaced.bytes),rows:afterRows.rows,rowsSha256:afterRows.sha256,definitionSha256:replaced.definition_sha256,clusterBytes:afterBudget.clusterBytes};completed.push(entry);await onProgress?.(entry);
  }
  const final=await identity(),result={version:'grh-index-capacity-receipt.v1',planSha256:expectedSha256,target:plan.target,capacityBefore:capacity(initial.capacity),capacityAfter:capacity(final.capacity),postGoalBufferBytes:plan.postGoalBufferBytes,completed,rowsChanged:false,quotaChanged:false,sourcePromoted:false};return Object.freeze(result);
 }catch(error){const safe=new Error(rebuilding?'INDEX_CAPACITY_REBUILD_UNCONFIRMED':/^INDEX_CAPACITY_[A-Z_]+$/.test(error?.code??'')?error.code:'INDEX_CAPACITY_FAILED');safe.code=safe.message;safe.completed=completed;safe.outcomeUnknown=rebuilding;throw safe;}
 finally{if(locked)try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['municontrol:index-capacity:'+plan.target.projectId+':'+plan.target.branchId]);}catch{}}
}
