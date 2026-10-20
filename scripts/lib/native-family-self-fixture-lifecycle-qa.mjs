// Pure QA composition and owned-client lifecycle. No IO, SQL execution or process control.
import assert from 'node:assert/strict';
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const resolverHashes=Object.freeze({102:'9204d4fd4350ce9f66f5544422a01453421286e7b278a349d344a22f9338e042',110:'4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c'});
export function nativeFamilyFixtureResolverGuard(schema,phase){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(phase===102||phase===110,'FAMILY195_FIXTURE_PHASE_INVALID');
 const label=phase===102?'fixture partial102 family resolver exact body':'fixture110 family resolver exact body';
 return `PERFORM qa_assert((SELECT encode(public.digest(replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.'),'sha256'),'hex')=${q(resolverHashes[phase])} AND prosecdef AND proowner=current_user::regrole AND proconfig=ARRAY[${q('search_path=pg_catalog, '+schema+', public, pg_temp')}] AND NOT has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE') FROM pg_proc WHERE oid='school_certificate_native_family_v5(jsonb,uuid)'::regprocedure),${q(label)});`;
}
function holderTuple(value){
 assert.deepEqual(Object.keys(value??{}).sort(),['applicationName','backendStart','database','pid','role'],'FAMILY195_HOLDER_TUPLE_INVALID');
 assert.ok(Number.isSafeInteger(value.pid)&&value.pid>0&&value.pid<=2147483647,'FAMILY195_HOLDER_PID_INVALID');
 assert.equal(value.applicationName,'owner184-serialization-holder','FAMILY195_HOLDER_APPLICATION_INVALID');
 assert.match(value.backendStart??'',/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);assert.ok(Number.isFinite(Date.parse(value.backendStart)));
 for(const key of ['role','database'])assert.match(value[key]??'',/^[A-Za-z_][A-Za-z0-9_]{0,62}$/,'FAMILY195_HOLDER_DESTINATION_INVALID');
 return Object.freeze({...value});
}
// The caller executes this metadata-only SELECT in a fresh read-only transaction
// with the ordinary exact destination guard (including zero other clients),
// while retaining the allowed-holder pins until this proof is accepted.
export function nativeFamilyHolderAbsenceSql(value){
 const h=holderTuple(value),predicate=`pid=${h.pid} AND backend_start=${q(h.backendStart)}::timestamptz AND application_name=${q(h.applicationName)} AND usename=${q(h.role)} AND datname=${q(h.database)} AND backend_type='client backend'`;
 return `SELECT jsonb_build_object('holder',${q(JSON.stringify(h))}::jsonb,'backendAbsent',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${predicate}),'otherClients',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()))`;
}
// Failure completion uses the SAME generated key as the normal completion path.
// The caller first runs the unchanged pinned destination guard allowing only the
// full holder tuple. Holding this transaction lock until backend absence avoids
// a one-shot signal that the holder could miss between its polling iterations.
export function nativeFamilyHolderFailureSignalSql(value,finishKey){
 const h=holderTuple(value);assert.match(finishKey??'',/^native-employment-catalog:qa-finished:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,'FAMILY195_FINISH_KEY_INVALID');
 const predicate=`pid=${h.pid} AND backend_start=${q(h.backendStart)}::timestamptz AND application_name=${q(h.applicationName)} AND usename=${q(h.role)} AND datname=${q(h.database)} AND backend_type='client backend'`;
 return `DO $family195_finish$ DECLARE deadline timestamptz:=clock_timestamp()+interval '40 seconds'; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(${q(finishKey)},0));
 LOOP
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid() AND NOT(${predicate})) THEN RAISE EXCEPTION 'FAMILY195_FAILURE_SIGNAL_OTHER_CLIENTS';END IF;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${predicate});
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'FAMILY195_FAILURE_SIGNAL_TIMEOUT';END IF;
  PERFORM pg_sleep(0.05);
 END LOOP;
 END $family195_finish$;${nativeFamilyHolderAbsenceSql(h)}`;
}
function holderExit(value){
 assert.deepEqual(Object.keys(value??{}).sort(),['code','signal'],'FAMILY195_HOLDER_EXIT_INVALID');assert.ok(value.code===null||Number.isSafeInteger(value.code));assert.ok(value.signal===null||typeof value.signal==='string');return {...value};
}
function holderAbsent(proof,expected){
 assert.deepEqual(Object.keys(proof??{}).sort(),['backendAbsent','holder','otherClients'],'FAMILY195_HOLDER_ABSENCE_SHAPE');assert.deepEqual(proof.holder,expected,'FAMILY195_HOLDER_ABSENCE_TUPLE');
 assert.equal(proof.backendAbsent,true,'FAMILY195_HOLDER_BACKEND_NOT_DRAINED');assert.equal(proof.otherClients,0,'FAMILY195_HOLDER_OTHER_CLIENTS');
}
export async function drainNativeFamilySerializationHolder({holder,completion,observeAbsent,completeFailure,timeoutMs=55000}){
 const expected=holderTuple(holder);assert.ok(completion&&typeof completion.then==='function');assert.equal(typeof observeAbsent,'function');assert.ok(completeFailure===undefined||typeof completeFailure==='function');assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=55000);
 let timer,expired=false;const deadlineAt=performance.now()+timeoutMs,deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('FAMILY195_HOLDER_DRAIN_TIMEOUT'));},timeoutMs);});
 const active=()=>assert.ok(!expired&&performance.now()<deadlineAt,'FAMILY195_HOLDER_DRAIN_TIMEOUT');
 try{return await Promise.race([(async()=>{
  let failureCompletion;
  if(completeFailure){
   const signal=await completeFailure(expected);active();
   assert.deepEqual(Object.keys(signal??{}).sort(),['backendAbsent','clientExit','holder','otherClients'],'FAMILY195_FAILURE_COMPLETION_SHAPE');
   const {clientExit,...absence}=signal;holderAbsent(absence,expected);const signalExit=holderExit(clientExit);assert.deepEqual(signalExit,{code:0,signal:null},'FAMILY195_FAILURE_SIGNAL_EXIT');
   failureCompletion={...absence,clientExit:signalExit};
  }
  const clientExit=holderExit(await completion);active();
  const proof=await observeAbsent(expected);active();holderAbsent(proof,expected);
  return {version:'family195-owned-holder-drain.v1',holder:expected,clientExit,backendAbsent:true,otherClients:0,...(failureCompletion?{failureCompletion}:{})};
 })(),deadline]);}finally{clearTimeout(timer);}
}


// The plain QA fixture declares only id PRIMARY KEY. PG18 additionally stores
// that id NOT NULL as one relation constraint; PG17 has no relation n row.
// Every catalog row participates in this exact shape, including unknown kinds.
export function nativeFamilyFixtureConstraintShape(major,actual){
 assert.ok(major===17||major===18,'FAMILY195_FIXTURE_CONSTRAINT_MAJOR_INVALID');
 const primary={kind:'p',columns:['id'],validated:true,deferrable:false,deferred:false,definition:'PRIMARY KEY (id)'},notNull={kind:'n',columns:['id'],validated:true,deferrable:false,deferred:false};
 const expected=major===18?[notNull,primary]:[primary];
 if(arguments.length>1)assert.deepEqual(actual,expected,'FAMILY195_FIXTURE_CONSTRAINT_SHAPE_CHANGED');
 return structuredClone(expected);
}
export function nativeFamilyFixtureConstraintGuard(major){
 const expected=nativeFamilyFixtureConstraintShape(major);
 return `(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',k.contype::text,'columns',(SELECT coalesce(jsonb_agg(a.attname::text ORDER BY x.ord),'[]'::jsonb) FROM unnest(k.conkey) WITH ORDINALITY x(attnum,ord) LEFT JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.attnum AND NOT a.attisdropped),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred)||CASE WHEN k.contype='p' THEN jsonb_build_object('definition',pg_get_constraintdef(k.oid)) ELSE '{}'::jsonb END ORDER BY k.contype::text COLLATE "C",k.conkey),'[]'::jsonb)=${q(JSON.stringify(expected))}::jsonb FROM pg_constraint k WHERE k.conrelid='employee_family_member'::regclass)`;
}
