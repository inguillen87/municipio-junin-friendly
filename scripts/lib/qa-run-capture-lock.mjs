import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {qaLiteral} from './own-payroll-durable-qa.mjs';
import {ownQaLockQuery,verifiedOwnQaLocks} from './qa-lock-observation.mjs';

export const QA_RUN_CAPTURE_QUERY='SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result';
const transportFile='scripts/lib/own-payroll-psql-qa.mjs';
const transportSha256='0e2ffc0cc8932548fd18975575709b2e9517dbecedd61a1a8f1ce26768bad037';
const hash=value=>createHash('sha256').update(value).digest('hex');
const observedRelations=['person_identity','employment_contract','native_employee_registration'];
const captureRelations=[...observedRelations,'native_employment_change_review','native_employment_lifecycle_review',
 'employment_adoption_application','employment_adoption_decision','employment_adoption_proposal',
 'native_salary_event','own_payroll_program_event','payroll_novelty_batch','payroll_novelty_row',
 'payroll_novelty_issue','payroll_novelty_event','payroll_fixed_novelty','payroll_fixed_novelty_event'];
const captureLock=schema=>'LOCK TABLE '+captureRelations.map(name=>schema+'.'+name).join(',')+' IN SHARE MODE NOWAIT';

// A write may be attempted again only after a *known aborted* transaction.
// The pinned transport opens BEGIN, emits one connection marker, executes one
// SELECT and commits only after it succeeds. psql -f - / ON_ERROR_STOP=1 exits
// with 3 on this SQL error, closing the still-aborted transaction. An uncertain
// disconnect, timeout, returned capture or error at COMMIT is not that proof.
function abortedCaptureLock(error,schema){
 const cause=error?.cause;
 if(cause?.code!==3||cause.killed===true||cause.signal!=null||
   typeof cause.stdout!=='string'||typeof cause.stderr!=='string'||cause.stderr.length>16384)return null;
 const output=cause.stdout.trim().split(/\r?\n/);
 if(output.length!==1)return null;
 let marker;try{marker=JSON.parse(output[0]);}catch{return null;}
 if(!marker||typeof marker!=='object'||Array.isArray(marker)||Object.keys(marker).join('|')!=='qaConnectionPid'||
   !Number.isSafeInteger(marker.qaConnectionPid)||marker.qaConnectionPid<=0)return null;
 const lines=cause.stderr.replace(/\r\n?/g,'\n').trim().split('\n');
 const errors=lines.filter(line=>/\b(?:ERROR|FATAL|PANIC):/.test(line));
 if(errors.length!==1)return null;
 const refusal=/^psql:<stdin>:[0-9]+: ERROR:\s+55P03: could not obtain lock on relation "([^"\r\n]+)"$/.exec(errors[0]);
 if(!refusal)return null;
 const relation=observedRelations.find(name=>refusal[1]===schema+'.'+name);
 if(!relation||!lines.includes('CONTEXT:  SQL statement "'+captureLock(schema)+'"'))return null;
 const contexts=lines.filter(line=>/\bPL\/pgSQL function\b/.test(line));
 if(contexts.length!==1||!/^PL\/pgSQL function own_run_capture_v1\(jsonb,jsonb,uuid,text\) line [0-9]+ at SQL statement$/.test(contexts[0]))return null;
 return {operationPid:marker.qaConnectionPid,relation,sqlstate:'55P03',transaction:'aborted_psql_exit'};
}

// This adapter belongs only to disposable loopback/CI QA. It does not change
// production SQL, its NOWAIT guards, API error mapping or the business request.
// No complete/command/receipt RPC passes through the capture retry branch.
export function createOwnQaCaptureSql({read,schema,db,record,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'QA_CAPTURE_SCHEMA_INVALID');
 assert.equal(typeof read,'function');assert.equal(typeof db?.run,'function');assert.equal(typeof db?.query,'function');
 assert.equal(typeof record,'function');assert.equal(typeof pause,'function');
 assert.equal(hash(read(transportFile).replace(/\r\n?/g,'\n')),transportSha256,'QA_CAPTURE_TRANSACTION_TRANSPORT_CHANGED');
 const stats={requests:0,attempts:0,retries:0,refusals:0,maxAttempts:3,maxObservedAttempts:0};
 const observationQuery=ownQaLockQuery(schema,{activity:true});
 return {
  captureLockProof:()=>({...stats}),
  query:async(query,values)=>{
   if(query!==QA_RUN_CAPTURE_QUERY)return db.query(query,values);
   assert.ok(Array.isArray(values)&&values.length===4&&values.every(value=>typeof value==='string'),'QA_CAPTURE_ARGUMENTS_INVALID');
   // Render once, before any await. The actor/session, payload, original key
   // and algorithm remain byte-identical even if the caller mutates its array.
   const rendered=query.replace('public.own_run_',schema+'.own_run_').replace(/\$(\d+)/g,(_,index)=>qaLiteral(values[Number(index)-1]));
   const sql='\n\\set VERBOSITY verbose\n'+rendered,sqlSha256=hash(sql);
   stats.requests++;
   for(let attempt=1;attempt<=stats.maxAttempts;attempt++){
    stats.attempts++;stats.maxObservedAttempts=Math.max(stats.maxObservedAttempts,attempt);
    try{return [{result:await db.run(sql,true)}];}
    catch(error){
     const refusal=abortedCaptureLock(error,schema);
     if(!refusal)throw error;
     stats.refusals++;
     const evidence={version:'qa-run-capture-lock.v1',operation:'own_run_capture_v1',attempt,maxAttempts:stats.maxAttempts,sqlSha256,...refusal};
     // Reuse the bounded metadata-only observer. It may see a lock that has
     // already ended; the SQL error proves refusal, not the later sample.
     // Observation/recording failures preserve the original error and fail
     // closed. Never log SQL, body, actor or arbitrary server error text here.
     try{
      const observation=verifiedOwnQaLocks(await db.run(observationQuery),{activity:true});
      await record({...evidence,phase:'capture_lock_refused',willRetry:attempt<stats.maxAttempts,observation});
     }catch{
      try{await record({...evidence,phase:'observation_failed',willRetry:false});}catch{}
      throw error;
     }
     if(attempt===stats.maxAttempts)throw error;
     await pause(attempt===1?100:250);
     stats.retries++;
    }
   }
   assert.fail('QA_CAPTURE_ATTEMPT_LIMIT');
  }
 };
}
