import assert from 'node:assert/strict';
const relations=['native_employee_registration','employment_contract','person_identity'];
const modes=['AccessShareLock','RowShareLock','RowExclusiveLock','ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock'];
const activityStates=['active','idle','idle in transaction','idle in transaction (aborted)','fastpath function call','disabled','unknown'];
const applicationName=v=>typeof v==='string'&&(['','psql','other'].includes(v)||/^mc-noelia:mc_qa_fixed_092_[a-f0-9]{32}$/.test(v));
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export function ownQaLockQuery(schema,{activity=false}={}){
 assert.equal(typeof activity,'boolean');
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'QA_LOCK_SCHEMA_INVALID');
 let query=`SELECT jsonb_build_object('observedAt',clock_timestamp(),'locks',coalesce((SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'pid',l.pid,'mode',l.mode,'granted',l.granted,'backendType',CASE WHEN a.backend_type IN('client backend','autovacuum worker','parallel worker') THEN a.backend_type ELSE 'other' END) ORDER BY l.pid,c.relname,l.mode) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_activity a ON a.pid=l.pid WHERE n.nspname='${schema}' AND c.relname IN('native_employee_registration','employment_contract','person_identity') AND l.pid IS DISTINCT FROM pg_backend_pid()),'[]'::jsonb),'vacuum',coalesce((SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'pid',v.pid,'phase',v.phase) ORDER BY v.pid,c.relname) FROM pg_stat_progress_vacuum v JOIN pg_class c ON c.oid=v.relid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='${schema}' AND c.relname IN('native_employee_registration','employment_contract','person_identity')),'[]'::jsonb))`;
 if(!activity)return query;
 // Retain only the exact synthetic QA application name, the psql default or a fixed marker.
 const app="CASE WHEN a.application_name='mc-noelia:"+schema+"' THEN a.application_name WHEN a.application_name IN('','psql') THEN a.application_name ELSE 'other' END";
 const state="CASE WHEN a.state IN('active','idle','idle in transaction','idle in transaction (aborted)','fastpath function call','disabled') THEN a.state ELSE 'unknown' END";
 const observer="'observer',jsonb_build_object('pid',pg_backend_pid(),'applicationName',CASE WHEN current_setting('application_name')='mc-noelia:"+schema+"' THEN current_setting('application_name') ELSE 'other' END,'state',coalesce((SELECT "+state+" FROM pg_stat_activity a WHERE a.pid=pg_backend_pid()),'unknown')),";
 return query.replace("'locks',",observer+"'locks',").replace("'backendType',CASE","'applicationName',"+app+",'state',"+state+",'backendType',CASE");
}
export function verifiedOwnQaLocks(value,{activity=false}={}){
 assert.equal(typeof activity,'boolean');
 assert.ok(exact(value,['observedAt','locks','vacuum',...(activity?['observer']:[])]),'QA_LOCK_RESPONSE_INVALID');assert.equal(typeof value.observedAt,'string');assert.match(value.observedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);assert.ok(Number.isFinite(Date.parse(value.observedAt)));
 if(activity){assert.ok(exact(value.observer,['pid','applicationName','state']),'QA_LOCK_OBSERVER_INVALID');assert.ok(Number.isSafeInteger(value.observer.pid)&&value.observer.pid>0&&applicationName(value.observer.applicationName)&&activityStates.includes(value.observer.state),'QA_LOCK_OBSERVER_INVALID');}
 assert.ok(Array.isArray(value.locks)&&value.locks.length<=200&&Array.isArray(value.vacuum)&&value.vacuum.length<=20,'QA_LOCK_CAPACITY');
 for(const row of value.locks){assert.ok(exact(row,['relation','pid','mode','granted','backendType',...(activity?['applicationName','state']:[])]));assert.ok(relations.includes(row.relation)&&(row.pid===null||Number.isSafeInteger(row.pid)&&row.pid>0)&&modes.includes(row.mode)&&typeof row.granted==='boolean'&&['client backend','autovacuum worker','parallel worker','other'].includes(row.backendType));if(activity)assert.ok(applicationName(row.applicationName)&&activityStates.includes(row.state),'QA_LOCK_ACTIVITY_INVALID');}
 for(const row of value.vacuum){assert.ok(exact(row,['relation','pid','phase']));assert.ok(relations.includes(row.relation)&&Number.isSafeInteger(row.pid)&&row.pid>0&&['initializing','scanning heap','vacuuming indexes','vacuuming heap','cleaning up indexes','truncating heap','performing final cleanup'].includes(row.phase));}
 return structuredClone(value);
}
// This observer issues metadata SELECTs only. It never retries a command,
// records an argument/query/error string, changes a lock or accepts a failure.
export async function observeOwnQaCommand({db,schema,record,execute,activity=false}){
 assert.equal(typeof activity,'boolean');if(activity)assert.ok(Array.isArray(db.connections),'QA_LOCK_CONNECTIONS_REQUIRED');
 const query=ownQaLockQuery(schema,{activity});
 // Detailed metadata uses the existing QA owner; execute() retains its original runtime transport.
 const sample=async(phase,operationPid=null)=>record({phase,...(activity?{operationPid}:{}),...verifiedOwnQaLocks(await db.run(query,!activity),{activity})});
 const lastOperationPid=since=>{const pid=activity&&db.connections.length>since?db.connections.at(-1):null;return Number.isSafeInteger(pid)&&pid>0?pid:null;};
 await sample('before_command');
 const since=activity?db.connections.length:0;
 let result;
 try{result=await execute();}catch(error){
  const operationPid=lastOperationPid(since);
  try{await sample(String(error?.message??'').includes('SENIORITY_BUSY')?'after_busy':'after_failure',operationPid);}catch{try{record({phase:'observation_failed',...(activity?{operationPid}:{})});}catch{}}
  throw error;
 }
 // Optional detailed read observation fails if its successful after-sample fails; it never repeats the read.
 if(activity)await sample('after_success',lastOperationPid(since));
 return result;
}
