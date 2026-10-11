import assert from 'node:assert/strict';
const relations=['native_employee_registration','employment_contract','person_identity'];
const modes=['AccessShareLock','RowShareLock','RowExclusiveLock','ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export function ownQaLockQuery(schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'QA_LOCK_SCHEMA_INVALID');
 return `SELECT jsonb_build_object('observedAt',clock_timestamp(),'locks',coalesce((SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'pid',l.pid,'mode',l.mode,'granted',l.granted,'backendType',CASE WHEN a.backend_type IN('client backend','autovacuum worker','parallel worker') THEN a.backend_type ELSE 'other' END) ORDER BY l.pid,c.relname,l.mode) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_activity a ON a.pid=l.pid WHERE n.nspname='${schema}' AND c.relname IN('native_employee_registration','employment_contract','person_identity') AND l.pid IS DISTINCT FROM pg_backend_pid()),'[]'::jsonb),'vacuum',coalesce((SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'pid',v.pid,'phase',v.phase) ORDER BY v.pid,c.relname) FROM pg_stat_progress_vacuum v JOIN pg_class c ON c.oid=v.relid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='${schema}' AND c.relname IN('native_employee_registration','employment_contract','person_identity')),'[]'::jsonb))`;
}
export function verifiedOwnQaLocks(value){
 assert.ok(exact(value,['observedAt','locks','vacuum']),'QA_LOCK_RESPONSE_INVALID');assert.equal(typeof value.observedAt,'string');assert.match(value.observedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);assert.ok(Number.isFinite(Date.parse(value.observedAt)));
 assert.ok(Array.isArray(value.locks)&&value.locks.length<=200&&Array.isArray(value.vacuum)&&value.vacuum.length<=20,'QA_LOCK_CAPACITY');
 for(const row of value.locks){assert.ok(exact(row,['relation','pid','mode','granted','backendType']));assert.ok(relations.includes(row.relation)&&(row.pid===null||Number.isSafeInteger(row.pid)&&row.pid>0)&&modes.includes(row.mode)&&typeof row.granted==='boolean'&&['client backend','autovacuum worker','parallel worker','other'].includes(row.backendType));}
 for(const row of value.vacuum){assert.ok(exact(row,['relation','pid','phase']));assert.ok(relations.includes(row.relation)&&Number.isSafeInteger(row.pid)&&row.pid>0&&['initializing','scanning heap','vacuuming indexes','vacuuming heap','cleaning up indexes','truncating heap','performing final cleanup'].includes(row.phase));}
 return structuredClone(value);
}
// This observer issues metadata SELECTs only. It never retries a command,
// records an argument/query/error string, changes a lock or accepts a failure.
export async function observeOwnQaCommand({db,schema,record,execute}){
 const query=ownQaLockQuery(schema),sample=async phase=>record({phase,...verifiedOwnQaLocks(await db.run(query,true))});
 await sample('before_command');
 try{return await execute();}catch(error){
  try{await sample(String(error?.message??'').includes('SENIORITY_BUSY')?'after_busy':'after_failure');}catch{try{record({phase:'observation_failed'});}catch{}}
  throw error;
 }
}
