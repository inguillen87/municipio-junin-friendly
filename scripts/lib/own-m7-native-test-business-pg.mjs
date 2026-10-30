// TEST-only constructor-DI transport. No SDK import, credential lookup, provider
// operation or top-level connection. A synthetic workflow is one RC/RW frame;
// its only admitted end is literal ROLLBACK. This is not production admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareOwnReleaseAnnulmentAtomicTestTarget} from './own-payroll-release-annulment-atomic-pg.mjs';
import {clientTlsObservation,ownReleaseErrorObservation} from './own-payroll-release-annulment-pg.mjs';

export const OWN_M7_NATIVE_TEST_BUSINESS_PG_VERSION='own-m7-native-test-business-pg.v1';
const RUNTIME='municontrol_actions_runtime_app';
const hash=value=>createHash('sha256').update(value).digest('hex');
const safeTag=value=>['BEGIN','SET','RESET','SELECT','INSERT','UPDATE','DO','ROLLBACK','COMMIT'].includes(value)?value:null;
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const dense=(value,code)=>{assert.ok(Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...Array.from({length:value.length},(_,n)=>String(n)),'length'].sort(),code);};
// A copied JSON proof cannot retain driver mutation, getters, Date or Buffer.
function immutable(value,parents=new Set()){
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'){assert.ok(Number.isFinite(value),'M7_TEST_PROOF_FINITE_NUMBER');return value;}
 assert.ok(value&&typeof value==='object','M7_TEST_PROOF_JSON_REQUIRED');
 assert.ok(Array.isArray(value)||[Object.prototype,null].includes(Object.getPrototypeOf(value)),'M7_TEST_PROOF_PLAIN_JSON_REQUIRED');
 assert.equal(parents.has(value),false,'M7_TEST_PROOF_CYCLE');parents.add(value);
 const array=Array.isArray(value),copy=array?[]:{};if(array)dense(value,'M7_TEST_PROOF_DENSE_ARRAY');
 for(const key of Reflect.ownKeys(value)){
  if(array&&key==='length')continue;assert.equal(typeof key,'string','M7_TEST_PROOF_STRING_KEYS');
  const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(d&&Object.hasOwn(d,'value')&&d.enumerable,'M7_TEST_PROOF_DATA_PROPERTY');
  Object.defineProperty(copy,key,{value:immutable(d.value,parents),enumerable:true});
 }
 parents.delete(value);return Object.freeze(copy);
}

// The map is the finite SQL emitted by the existing service functions. The
// original parameterized text and values go to pg unchanged, never relocated.
const descriptors={
 native_employee_bootstrap_v1:['jsonb'],native_employee_attempt_v1:['jsonb','uuid'],native_employee_create_v1:['jsonb','jsonb','text','uuid'],
 native_employment_catalog_bootstrap_v1:['jsonb'],native_employment_catalog_proposal_v1:['jsonb','uuid'],native_employment_catalog_attempt_v1:['jsonb','uuid'],native_employment_catalog_propose_v1:['jsonb','jsonb','uuid'],native_employment_catalog_review_v1:['jsonb','jsonb','uuid'],
 native_salary_bootstrap_v1:['jsonb'],native_salary_stream_v1:['jsonb','integer','text'],native_salary_attempt_v1:['jsonb','uuid'],native_salary_command_v1:['jsonb','jsonb','uuid'],
 own_program_bootstrap_v1:['jsonb'],own_program_attempt_v1:['jsonb','uuid'],own_program_command_v1:['jsonb','jsonb','uuid'],
 own_run_bootstrap_v1:['jsonb'],own_run_bootstrap_v2:['jsonb'],own_run_attempt_v1:['jsonb','uuid'],own_run_capture_v1:['jsonb','jsonb','uuid','text'],own_run_capture_fixed_full_v2:['jsonb','jsonb','uuid','text'],own_run_complete_v1:['jsonb','uuid','jsonb','jsonb','text'],own_run_complete_full_v1:['jsonb','uuid','jsonb','jsonb','text'],own_run_complete_fixed_v2:['jsonb','uuid','jsonb','jsonb','text'],own_run_complete_fixed_full_v2:['jsonb','uuid','jsonb','jsonb','text'],
 own_liquidation_bootstrap_v1:['jsonb'],own_liquidation_detail_v1:['jsonb','uuid'],own_liquidation_detail_full_v1:['jsonb','uuid'],own_liquidation_attempt_v1:['jsonb','uuid'],own_liquidation_command_v1:['jsonb','jsonb','uuid'],
 own_annul_review_v2:['jsonb','text','text'],own_annul_review_full_v2:['jsonb','text','text'],own_annul_detail_v1:['jsonb','text','text'],own_annul_detail_full_v1:['jsonb','text','text'],own_annul_command_v1:['jsonb','jsonb','uuid'],own_annul_command_full_v1:['jsonb','jsonb','uuid'],own_annul_command_v2:['jsonb','jsonb','uuid'],own_annul_command_full_v2:['jsonb','jsonb','uuid'],own_annul_attempt_v1:['jsonb','uuid'],own_annul_attempt_full_v1:['jsonb','uuid'],own_annul_preparation_v1:['jsonb','uuid'],own_annul_preparation_full_v1:['jsonb','uuid'],
 own_close_detail_v1:['jsonb','text','text'],own_close_detail_full_v1:['jsonb','text','text'],own_close_command_v1:['jsonb','jsonb','uuid'],own_close_command_full_v1:['jsonb','jsonb','uuid'],own_close_attempt_v1:['jsonb','uuid'],own_close_attempt_full_v1:['jsonb','uuid'],own_close_group_v1:['jsonb','uuid'],own_close_group_full_v1:['jsonb','uuid'],own_close_report_census_v1:['jsonb','text','text'],
 own_receipt_preview_v1:['jsonb','jsonb'],own_receipt_list_v1:['jsonb','text'],own_receipt_batch_v1:['jsonb','uuid'],own_receipt_attempt_v1:['jsonb','uuid'],own_receipt_command_v1:['jsonb','jsonb','uuid'],own_receipt_self_v1:['jsonb']
};
export const OWN_M7_NATIVE_TEST_RPC_STATEMENTS=immutable(Object.fromEntries(Object.entries(descriptors).map(([name,types])=>['SELECT public.'+name+'('+types.map((type,n)=>'$'+(n+1)+'::'+type).join(',')+') AS result',{name,types}])));
const ownerTables=new Set(['platform_tenant','platform_tenant_source_binding','tenant_identity_policy','internal_users','iam_role','iam_role_capability','tenant_membership','tenant_identity_session','tenant_action_authority','person_identity','employment_contract','native_employee_registration','tenant_action_employment_link','native_employment_catalog_proposal','native_employment_catalog_review']);
// Trigger009 creates this exact NEW tenant policy closed at version1. This is
// fixture setup, not an application certification command or a general UPDATE.
// The transaction timestamps exclude inherited tenants/bindings/policies.
export const OWN_M7_NATIVE_TEST_POLICY_SQL="UPDATE public.tenant_identity_policy p SET tenant_data_plane_ready=true,invitation_delivery_ready=false,certified_source_binding_id=$2::uuid,certified_release_sha=$3::text,certified_by_user_email=$4::text,certified_at=clock_timestamp(),version=2,updated_at=clock_timestamp() FROM public.platform_tenant t,public.platform_tenant_source_binding b WHERE p.tenant_id=$1::uuid AND t.id=p.tenant_id AND t.slug=$5::text AND t.tenant_kind='sandbox' AND t.status='active' AND t.created_by_user_email=$4::text AND b.id=$2::uuid AND b.tenant_id=t.id AND b.verified AND b.verified_by_user_email=$4::text AND b.source_database=$6::text AND b.source_company_id=$7::bigint AND p.version=1 AND p.tenant_data_plane_ready=false AND p.invitation_delivery_ready=false AND p.certified_source_binding_id IS NULL AND p.certified_release_sha IS NULL AND p.certified_by_user_email IS NULL AND p.certified_at IS NULL AND p.updated_at=transaction_timestamp() AND t.created_at=transaction_timestamp() AND b.created_at=transaction_timestamp()";
function policyParameters(values){
 assert.equal(values.length,7,'M7_TEST_POLICY_ARITY');
 for(const value of values.slice(0,2))assert.match(value,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,'M7_TEST_POLICY_UUID');
 assert.notEqual(values[0],values[1],'M7_TEST_POLICY_DISTINCT_IDS');assert.match(values[2],/^[a-f0-9]{40}$/,'M7_TEST_POLICY_SOURCE_COMMIT');
 const match=/^own-m7-test-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(values[4]);assert.ok(match&&match[1].length>=6&&match[1].length<=32,'M7_TEST_POLICY_RUN_ID');
 const runId=match[1];assert.equal(values[3],'own-m7-'+runId+'-maker@example.invalid','M7_TEST_POLICY_SYNTHETIC_CREATOR');assert.equal(values[5],'own_m7_test_'+runId.replaceAll('-','_'),'M7_TEST_POLICY_SYNTHETIC_DATABASE');
 assert.ok(Number.isSafeInteger(values[6])&&values[6]>=700000000&&values[6]<=799999999,'M7_TEST_POLICY_SYNTHETIC_COMPANY');
}
const forbiddenOwner=/;|--|\/\*|\*\/|\b(?:BEGIN|COMMIT|ROLLBACK|ABORT|START|SAVEPOINT|RELEASE|PREPARE|EXECUTE|CALL|COPY|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|UPDATE|DELETE|RESET|SET|RETURNING)\b/i;
function parameters(values){dense(values,'M7_TEST_DENSE_PARAMETERS');return immutable(values);}
function serviceStatement(text,values){
 assert.equal(typeof text,'string');assert.ok(Object.hasOwn(OWN_M7_NATIVE_TEST_RPC_STATEMENTS,text),'M7_TEST_SERVICE_SQL_NOT_ADMITTED');const entry=OWN_M7_NATIVE_TEST_RPC_STATEMENTS[text];
 const copied=parameters(values);assert.equal(copied.length,entry.types.length,'M7_TEST_SERVICE_ARITY');
 for(let n=0;n<entry.types.length;n++){
  const value=copied[n],type=entry.types[n];
  if(type==='jsonb'){assert.equal(typeof value,'string');const parsed=JSON.parse(value);assert.ok(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),'M7_TEST_JSON_OBJECT_PARAMETER');}
  else if(type==='uuid')assert.match(value,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,'M7_TEST_UUID_PARAMETER');
  else if(type==='integer')assert.ok(Number.isSafeInteger(value),'M7_TEST_INTEGER_PARAMETER');
  else assert.ok(value===null||typeof value==='string','M7_TEST_TEXT_PARAMETER');
 }
 return{text,values:copied,name:entry.name};
}
// SHA pins caller-reviewed seed/observer bytes. It is custody, not provenance
// or authorization: root must audit the finite fixture and its scoped values.
function batch(statements,expectedSha256,owner){
 dense(statements,'M7_TEST_DENSE_STATEMENTS');assert.ok(statements.length>0,'M7_TEST_STATEMENTS_REQUIRED');
 const copy=immutable(statements);assert.match(expectedSha256,/^[a-f0-9]{64}$/);assert.equal(hash(JSON.stringify(copy)),expectedSha256,'M7_TEST_STATEMENT_BATCH_CHANGED');
 for(const row of copy){
  exact(row,['text','values'],'M7_TEST_STATEMENT_FIELDS');assert.equal(typeof row.text,'string');parameters(row.values);
  if(owner){
   if(row.text===OWN_M7_NATIVE_TEST_POLICY_SQL){policyParameters(row.values);continue;}
   const match=/^INSERT INTO public\.([a-z][a-z0-9_]*)\s*\(/.exec(row.text);assert.ok(match&&ownerTables.has(match[1]),'M7_TEST_OWNER_INSERT_TABLE_NOT_ADMITTED');
   assert.equal(forbiddenOwner.test(row.text),false,'M7_TEST_OWNER_SQL_NOT_ADMITTED');assert.ok(row.values.length>0,'M7_TEST_PARAMETERIZED_OWNER_INSERT_REQUIRED');
  }else assert.ok(/^(?:SELECT\s|DO \$[a-z][a-z0-9_]*\$)/.test(row.text),'M7_TEST_OBSERVER_RO_STATEMENT_REQUIRED');
 }
 return copy;
}
const identitySql=`SELECT current_setting('server_version_num')::integer/10000 AS major,
 current_setting('neon.project_id',true) AS "projectId",current_setting('neon.branch_id',true) AS "branchId",current_setting('neon.endpoint_id',true) AS "endpointId",
 current_database() AS database,current_user AS role,session_user AS "sessionUser",
 to_regprocedure('public.native_employee_contract_guard_v1()')::oid AS "guardOid",
 current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS "readOnly",current_setting('standard_conforming_strings') AS "standardConformingStrings",
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS "postgresSsl",
 jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num')) AS native`;
function identity(actual,target,role,observer){
 exact(actual,['major','projectId','branchId','endpointId','database','role','sessionUser','guardOid','isolation','readOnly','standardConformingStrings','postgresSsl','native'],'M7_TEST_REAL_IDENTITY_REQUIRED');
 for(const key of ['major','projectId','branchId','endpointId','database'])assert.equal(actual[key],target[key],'M7_TEST_DESTINATION_CHANGED:'+key);
 assert.equal(actual.role,role,'M7_TEST_CURRENT_ROLE_CHANGED');assert.equal(actual.sessionUser,target.role,'M7_TEST_SESSION_USER_CHANGED');
 assert.ok((Number.isSafeInteger(actual.guardOid)&&actual.guardOid>0)||(typeof actual.guardOid==='string'&&/^[1-9][0-9]*$/.test(actual.guardOid)),'M7_TEST_GUARD_REQUIRED');assert.equal(Number(actual.guardOid),target.guardOid,'M7_TEST_GUARD_CHANGED');
 assert.equal(actual.isolation,observer?'repeatable read':'read committed');assert.equal(actual.readOnly,observer?'on':'off');assert.equal(actual.standardConformingStrings,'on');assert.equal(typeof actual.postgresSsl,'boolean','M7_TEST_BACKEND_SSL_BOOLEAN_REQUIRED');
 exact(actual.native,['pid','backendStart','serverVersionNum'],'M7_TEST_NATIVE_FIELDS');assert.ok(Number.isSafeInteger(actual.native.pid)&&actual.native.pid>0);
 assert.match(actual.native.backendStart,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);
 assert.match(actual.native.serverVersionNum,/^\d{6}$/);assert.equal(Math.trunc(Number(actual.native.serverVersionNum)/10000),target.major);
 return immutable(actual);
}
const failures=new WeakMap();
export function ownM7NativeTestBusinessFailureObservation(error){
 return immutable({version:'own-m7-native-test-business-failure.v1',uncertain:true,noFurtherSql:true,transaction:error&&(typeof error==='object'||typeof error==='function')?failures.get(error)??null:null,error:ownReleaseErrorObservation(error)});
}

export async function createOwnM7NativeTestBusinessSession(options){
 exact(options,['major','Client','connectionValue','branchCreationRaw','branchCreationSha256'],'M7_TEST_FACTORY_OPTIONS');
 const{major,Client,connectionValue,branchCreationRaw,branchCreationSha256}=options;
 const admission=prepareOwnReleaseAnnulmentAtomicTestTarget({major,branchCreationRaw,branchCreationSha256}),target=admission.target;
 assert.equal(typeof Client,'function','M7_TEST_CLIENT_CONSTRUCTOR_REQUIRED');assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 assert.equal(typeof connectionValue,'string');const url=new URL(connectionValue);assert.ok(['postgres:','postgresql:'].includes(url.protocol));assert.equal(url.hostname,target.host);assert.equal(url.port,'');assert.equal(url.hash,'');
 assert.equal(decodeURIComponent(url.username),target.role);assert.equal(decodeURIComponent(url.pathname.slice(1)),target.database);assert.ok(url.password);assert.equal(url.searchParams.get('sslmode'),'verify-full');
 const clients=new Map(),certificates=new Map(),identities={},observations=[],ended=new Set(),endAttempts=new Set(),rows=[],commands=[];
 let state='connected',role=target.role,busy=false,closed=false,closing=null,stopped=false,primary=null,phase='connect',activeSlot='command',beginCommand=null,endRequested=false,endCommand=null,rollbackObserved=false,observerCommitObserved=false,policySetupUsed=false;
 const healthy=()=>{if(stopped)throw primary;assert.equal(closed,false,'M7_TEST_SESSION_CLOSED');};
 function stop(error){
  if(!stopped){stopped=true;primary=error;const value=immutable({version:'own-m7-native-test-business-transaction-failure.v1',kind:'test',slot:activeSlot,phase,state,role,native:identities[activeSlot]?.native??null,beginCommand,endRequested,endCommand,rollbackObserved,observerCommitObserved,uncertain:true,noFurtherSql:true});if(error&&(typeof error==='object'||typeof error==='function'))failures.set(error,value);}
  return primary;
 }
 const tls=slot=>{const actual=clientTlsObservation(clients.get(slot),target);if(certificates.has(slot))assert.deepEqual(actual,certificates.get(slot),'M7_TEST_TLS_SESSION_CHANGED');else certificates.set(slot,actual);return actual;};
 async function closeOne(slot){if(!clients.has(slot)||endAttempts.has(slot))return ended.has(slot);endAttempts.add(slot);await clients.get(slot).end();ended.add(slot);return true;}
 function closureBookend(){if(primary&&(typeof primary==='object'||typeof primary==='function')&&failures.has(primary)){const prior=failures.get(primary);failures.set(primary,immutable({...prior,sessionTerminated:ended.has(prior.slot),ownedSessionsClosed:ended.size===clients.size}));}}
 function close(){if(closing)return closing;closed=true;closing=(async()=>{const results=await Promise.allSettled([...clients.keys()].map(closeOne));closureBookend();if(results.some(value=>value.status==='rejected')||ended.size!==clients.size){const error=Error('M7_TEST_OWNED_CONNECTION_CLOSE_FAILED');stop(error);closureBookend();throw error;}return immutable({ownedSessionsClosed:true,ownedSessions:clients.size});})();return closing;}
 async function acquire(slot){
  const client=new Client({host:target.host,port:5432,user:target.role,database:target.database,password:decodeURIComponent(url.password),ssl:{rejectUnauthorized:true,servername:target.host,minVersion:'TLSv1.2'},application_name:'municontrol-m7-test-'+slot,connectionTimeoutMillis:20000,keepAlive:true,keepAliveInitialDelayMillis:10000});
  assert.equal(typeof client.on,'function');clients.set(slot,client);client.on('error',error=>{if(!stopped){phase='socket-error';activeSlot=slot;stop(error);void close().catch(()=>{});}});await client.connect();healthy();tls(slot);
 }
 async function query(slot,text,values=[],onSubmit=null,onResult=null){healthy();tls(slot);if(onSubmit)onSubmit();const result=await clients.get(slot).query({text,values,queryMode:'extended'});if(onResult)onResult(result);healthy();tls(slot);assert.ok(result&&!Array.isArray(result)&&typeof result.command==='string'&&Array.isArray(result.rows),'M7_TEST_SINGLE_RESULT_REQUIRED');return result;}
 async function guard(slot,expectedRole,observer){const result=await query(slot,identitySql);assert.equal(result.command,'SELECT','M7_TEST_IDENTITY_SELECT_TAG');assert.equal(result.rows.length,1);const actual=identity(result.rows[0],target,expectedRole,observer);if(identities[slot])assert.deepEqual(actual.native,identities[slot].native,'M7_TEST_BACKEND_CHANGED');identities[slot]=actual;observations.push(immutable({slot,role:actual.role,sessionUser:actual.sessionUser,postgresSsl:actual.postgresSsl,clientTls:certificates.get(slot),native:actual.native}));return actual;}
 async function locked(label,slot,operation){
  if(stopped)throw primary;
  try{healthy();assert.equal(busy,false,'M7_TEST_CONCURRENT_OPERATION_FORBIDDEN');busy=true;phase=label;activeSlot=slot;return await operation();}
  catch(error){const failure=stop(error);try{await close();}catch{}throw failure;}
  finally{busy=false;}
 }
 function record(result){rows.push(immutable(result.rows));commands.push(result.command);return immutable({command:result.command,rowCount:Number.isSafeInteger(result.rowCount)?result.rowCount:null,rows:result.rows});}
 async function beginFixture(){return locked('begin-fixture','command',async()=>{
  assert.equal(state,'connected','M7_TEST_FIXTURE_BEGIN_SINGLE_USE');
  await query('command','BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE',[],null,result=>{beginCommand=safeTag(result.command);});assert.equal(beginCommand,'BEGIN','M7_TEST_BEGIN_TAG_REQUIRED');
  for(const statement of["SET LOCAL statement_timeout='45s'","SET LOCAL lock_timeout='5s'"])assert.equal((await query('command',statement)).command,'SET','M7_TEST_TIMEOUT_SET_TAG');
  const setting=await query('command',"SET LOCAL timezone='UTC'");assert.equal(setting.command,'SET');const actual=await guard('command',target.role,false);state='fixture';
  return immutable({version:'own-m7-native-test-business-begin.v1',kind:'test',beginCommand,readOnly:false,isolation:'read committed',identity:actual,completeAuth:false,syntheticFixture:true});
 });}
 async function seedOwner(statements,options){return locked('seed-owner','command',async()=>{
  exact(options,['expectedSha256'],'M7_TEST_OWNER_BATCH_OPTIONS');assert.equal(state,'fixture','M7_TEST_FIXTURE_NOT_ACTIVE');assert.equal(role,target.role,'M7_TEST_OWNER_ROLE_REQUIRED');
  const admitted=batch(statements,options.expectedSha256,true),result=[],policies=admitted.filter(row=>row.text===OWN_M7_NATIVE_TEST_POLICY_SQL);
  assert.ok(policies.length<=1&&(!policies.length||!policySetupUsed),'M7_TEST_POLICY_SINGLE_USE');
  for(const row of admitted){const policy=row.text===OWN_M7_NATIVE_TEST_POLICY_SQL;if(policy)policySetupUsed=true;const answer=await query('command',row.text,row.values);assert.equal(answer.command,policy?'UPDATE':'INSERT','M7_TEST_OWNER_COMMAND_TAG_REQUIRED');if(policy)assert.equal(answer.rowCount,1,'M7_TEST_NEW_POLICY_EXACTLY_ONE_ROW');result.push(record(answer));}
  return Object.freeze(result);
 });}
 async function switchRoleRuntime(){return locked('switch-runtime','command',async()=>{
  assert.equal(state,'fixture');assert.equal(role,target.role,'M7_TEST_OWNER_ROLE_REQUIRED');const result=await query('command','SET LOCAL ROLE '+RUNTIME);assert.equal(result.command,'SET','M7_TEST_ROLE_SET_TAG');const actual=await guard('command',RUNTIME,false);role=RUNTIME;return actual;
 });}
 async function resetRoleOwner(){return locked('reset-owner','command',async()=>{
  assert.equal(state,'fixture');assert.equal(role,RUNTIME,'M7_TEST_RUNTIME_ROLE_REQUIRED');const result=await query('command','RESET ROLE');assert.equal(result.command,'RESET','M7_TEST_ROLE_RESET_TAG');const actual=await guard('command',target.role,false);role=target.role;return actual;
 });}
 const sql=Object.freeze({query:async(text,values)=>locked('service-query','command',async()=>{
  assert.equal(state,'fixture');assert.equal(role,RUNTIME,'M7_TEST_RUNTIME_ROLE_REQUIRED');const admitted=serviceStatement(text,values),result=await query('command',admitted.text,admitted.values);assert.equal(result.command,'SELECT','M7_TEST_SERVICE_SELECT_TAG');return record(result).rows;
 })});
 async function rollback(options){return locked('rollback','command',async()=>{
  exact(options,['onBeforeEnd'],'M7_TEST_ROLLBACK_OPTIONS');assert.equal(typeof options.onBeforeEnd,'function');assert.equal(state,'fixture','M7_TEST_FIXTURE_NOT_ACTIVE');
  const snapshot=immutable({version:'own-m7-native-test-business-pre-end.v1',slot:'command',end:'ROLLBACK',readOnly:false,isolation:'read committed',beginCommand,native:identities.command.native,role,rows,statementCommands:commands,completeAuth:false,syntheticFixture:true});
  await options.onBeforeEnd(snapshot);const result=await query('command','ROLLBACK',[],()=>{endRequested=true;},answer=>{endCommand=safeTag(answer.command);rollbackObserved=endCommand==='ROLLBACK';});assert.equal(result.command,'ROLLBACK','M7_TEST_ROLLBACK_TAG_REQUIRED');state='rolledBack';
  return immutable({version:'own-m7-native-test-business-rollback.v1',kind:'test',endRequested,endCommand,rollbackObserved,commitObserved:false,preEnd:snapshot});
 });}
 async function observeRollback(options){return locked('rollback-observer','observer',async()=>{
  exact(options,['statements','expectedSha256','onBeforeEnd'],'M7_TEST_OBSERVER_OPTIONS');assert.equal(typeof options.onBeforeEnd,'function');assert.equal(state,'rolledBack','M7_TEST_LITERAL_ROLLBACK_REQUIRED');assert.equal(rollbackObserved,true);
  const admitted=batch(options.statements,options.expectedSha256,false);endRequested=false;endCommand=null;beginCommand=null;
  await acquire('observer');await query('observer','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',[],null,result=>{beginCommand=safeTag(result.command);});assert.equal(beginCommand,'BEGIN','M7_TEST_OBSERVER_BEGIN_TAG');for(const statement of["SET LOCAL statement_timeout='45s'","SET LOCAL lock_timeout='5s'","SET LOCAL timezone='UTC'"])assert.equal((await query('observer',statement)).command,'SET','M7_TEST_OBSERVER_SETTING_TAG');
  const actual=await guard('observer',target.role,true);assert.notEqual(actual.native.pid+':'+actual.native.backendStart,identities.command.native.pid+':'+identities.command.native.backendStart,'M7_TEST_TWO_PHYSICAL_BACKENDS_REQUIRED');
  const observedRows=[],observedCommands=[];for(const row of admitted){const answer=await query('observer',row.text,row.values);assert.ok(['SELECT','DO'].includes(answer.command),'M7_TEST_OBSERVER_RO_TAG_REQUIRED');observedRows.push(immutable(answer.rows));observedCommands.push(answer.command);}
  const snapshot=immutable({version:'own-m7-native-test-business-pre-end.v1',slot:'observer',end:'COMMIT',readOnly:true,isolation:'repeatable read',beginCommand,native:actual.native,role:target.role,rows:observedRows,statementCommands:observedCommands,completeAuth:false,syntheticFixture:true});
  await options.onBeforeEnd(snapshot);const result=await query('observer','COMMIT',[],()=>{endRequested=true;},answer=>{endCommand=safeTag(answer.command);observerCommitObserved=endCommand==='COMMIT';});assert.equal(result.command,'COMMIT','M7_TEST_OBSERVER_COMMIT_TAG');state='observed';
  return immutable({version:'own-m7-native-test-business-rollback-observer.v1',kind:'test',rollbackObserved:true,observerCommitObserved:true,readOnly:true,preEnd:snapshot});
 });}
 // Existing services map native exceptions to domain errors. Retain the first
 // native observation here so that catch/persistence needs no recovery SQL and
 // never depends on that wrapper retaining the original pg Error object.
 const observation=()=>immutable({version:OWN_M7_NATIVE_TEST_BUSINESS_PG_VERSION,kind:'test',target,state,identities,tlsObservations:observations,rollbackObserved,observerCommitObserved,ownedSessions:clients.size,ownedSessionsClosed:ended.size===clients.size,uncertain:stopped,noFurtherSql:stopped,failure:stopped?ownM7NativeTestBusinessFailureObservation(primary):null,completeAuth:false,syntheticFixture:true,noeliaReady:false,automaticRetry:false,credentialsExposed:false});
 try{await acquire('command');}catch(error){const failure=stop(error);try{await close();}catch{}throw failure;}
 return Object.freeze({version:OWN_M7_NATIVE_TEST_BUSINESS_PG_VERSION,target,branchCreation:admission.branchCreation,beginFixture,seedOwner,switchRoleRuntime,resetRoleOwner,sql,rollback,observeRollback,observation,close,completeAuth:false,syntheticFixture:true,noeliaReady:false,automaticRetry:false,credentialsExposed:false});
}
