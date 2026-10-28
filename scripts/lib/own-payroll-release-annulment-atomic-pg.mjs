// Explicit constructor-DI transport. No credential lookup, SDK/client import,
// provider operation or top-level connection. The historical tail is unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OWN_RELEASE_TARGETS,ownReleaseConnection} from './own-payroll-release-target.mjs';
import {clientTlsObservation,ownReleaseErrorObservation} from './own-payroll-release-annulment-pg.mjs';

export const OWN_RELEASE_ANNULMENT_ATOMIC_PG_VERSION='own-release-annulment-atomic-pg.v1';
export const OWN_RELEASE_ANNULMENT_ATOMIC_SLOTS=Object.freeze(['epoch','rehearsal','rollbackObserver','installation','durable']);
const slotReadOnly=Object.freeze({epoch:true,rehearsal:false,rollbackObserver:true,installation:false,durable:true});
const targetKeys=['major','projectId','branchId','database','role','guardOid','host','endpointId'];
const nativeKeys=['pid','backendStart','serverVersionNum'];
const startPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const testAdmissions=new WeakMap(),failureContexts=new WeakMap();
const sha=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const nativeKey=value=>value.pid+':'+value.backendStart;
const safeCommand=value=>['BEGIN','COMMIT','ROLLBACK','SELECT','SET','DO','CREATE','ALTER','DROP','INSERT','UPDATE','DELETE'].includes(value)?value:null;
function productionTarget(major){const target=OWN_RELEASE_TARGETS.find(value=>value.major===major);assert.ok(target,'ATOMIC_PG_MAJOR_REQUIRED');return target;}

// Caller custody must pin these exact provider-observation bytes separately.
// This conversion checks their identities; it does not attest their provenance,
// claim provider execution or accept a passed/production-like target object.
export function prepareOwnReleaseAnnulmentAtomicTestTarget(options){
 exact(options,['major','branchCreationRaw','branchCreationSha256'],'ATOMIC_TEST_TARGET_OPTIONS');
 const {major,branchCreationRaw:raw,branchCreationSha256:digest}=options,base=productionTarget(major);
 assert.ok(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=1024*1024,'ATOMIC_TEST_TARGET_RAW_REQUIRED');
 assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(sha(raw),digest,'ATOMIC_TEST_TARGET_RAW_CHANGED');
 const text=raw.toString('utf8');assert.ok(Buffer.from(text,'utf8').equals(raw),'ATOMIC_TEST_TARGET_UTF8_REQUIRED');
 const value=JSON.parse(text);assert.equal(Object.hasOwn(value,'passed'),false,'ATOMIC_TEST_PASSED_FLAG_FORBIDDEN');
 const {branch,computes}=value;assert.ok(branch&&typeof branch==='object'&&!Array.isArray(branch),'ATOMIC_TEST_BRANCH_REQUIRED');
 assert.equal(branch.project_id,base.projectId);assert.equal(branch.parent_id,base.branchId,'ATOMIC_TEST_PARENT_REQUIRED');
 assert.equal(branch.primary,false);assert.equal(branch.default,false);assert.match(branch.id,/^br-[a-z0-9-]+$/);
 assert.ok(Array.isArray(computes)&&computes.length===1,'ATOMIC_TEST_ONE_COMPUTE_REQUIRED');const compute=computes[0];
 assert.equal(compute.project_id,base.projectId);assert.equal(compute.branch_id,branch.id);assert.equal(compute.type,'read_write');
 assert.equal(compute.disabled,false);assert.equal(compute.pooler_enabled,false);assert.match(compute.id,/^ep-[a-z0-9-]+$/);
 const suffix=base.host.slice(base.host.indexOf('.'));assert.equal(compute.host,compute.id+suffix,'ATOMIC_TEST_HOST_REQUIRED');
 assert.equal(compute.host.includes('-pooler.'),false);if(compute.hosts)assert.equal(compute.hosts.read_write_host,compute.host);
 for(const target of OWN_RELEASE_TARGETS){assert.notEqual(branch.id,target.branchId,'ATOMIC_TEST_PRODUCTION_BRANCH_FORBIDDEN');assert.notEqual(compute.id,target.endpointId,'ATOMIC_TEST_PRODUCTION_ENDPOINT_FORBIDDEN');assert.notEqual(compute.host,target.host,'ATOMIC_TEST_PRODUCTION_HOST_FORBIDDEN');}
 const target=freeze({...base,branchId:branch.id,endpointId:compute.id,host:compute.host,kind:'test',parentBranchId:base.branchId});
 const admission=freeze({version:'own-release-annulment-atomic-test-target.v1',kind:'test',target,parentBranchId:base.branchId,branchCreation:{bytes:raw.length,sha256:digest}});
 testAdmissions.set(admission,{target});return admission;
}

const identitySql=`SELECT current_setting('server_version_num')::integer/10000 AS major,
 current_setting('neon.project_id',true) AS "projectId",current_setting('neon.branch_id',true) AS "branchId",
 current_setting('neon.endpoint_id',true) AS "endpointId",current_database() AS database,current_user AS role,
 to_regprocedure('public.native_employee_contract_guard_v1()')::oid AS "guardOid",
 current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS "readOnly",
 current_setting('standard_conforming_strings') AS "standardConformingStrings",
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS "postgresSsl",
 jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num')) AS native`;
function nativeIdentity(actual,target){
 assert.ok(actual&&typeof actual==='object'&&!Array.isArray(actual),'ATOMIC_PG_IDENTITY_REQUIRED');
 for(const key of ['major','projectId','branchId','endpointId','database','role'])assert.equal(actual[key],target[key],'ATOMIC_PG_DESTINATION_CHANGED:'+key);
 assert.ok((Number.isSafeInteger(actual.guardOid)&&actual.guardOid>0)||(typeof actual.guardOid==='string'&&/^[1-9]\d*$/.test(actual.guardOid)),'ATOMIC_PG_GUARD_REQUIRED');assert.equal(Number(actual.guardOid),target.guardOid,'ATOMIC_PG_GUARD_CHANGED');
 assert.equal(actual.isolation,'repeatable read');assert.equal(actual.readOnly,'on');assert.equal(typeof actual.postgresSsl,'boolean','ATOMIC_PG_BACKEND_SSL_REQUIRED');
 assert.equal(actual.standardConformingStrings,'on','ATOMIC_PG_STANDARD_STRINGS_REQUIRED');
 exact(actual.native,nativeKeys,'ATOMIC_PG_NATIVE_FIELDS');const native=actual.native;
 assert.ok(Number.isSafeInteger(native.pid)&&native.pid>0);assert.match(native.backendStart,startPattern);assert.match(native.serverVersionNum,/^\d{6}$/);assert.equal(Math.trunc(Number(native.serverVersionNum)/10000),target.major);
 return Object.freeze({...native});
}

// Local finite lexer for this transport only. Unlike migration splitting, this
// boundary must understand E-string escapes so a payload cannot hide an end.
// Comments may separate keywords. Strings, quoted identifiers and dollar bodies
// do not become transaction-control tokens; parentheses must stay balanced.
function statementWords(source){
 const statements=[];let at=0,depth=0,words=[],content=false;
 const add=word=>{content=true;if(depth===0)words.push(word.toUpperCase());};
 const quoted=(quote,escapes)=>{
  at++;let value='';
  while(at<source.length){const char=source[at++];
   if(escapes&&char==='\\'){assert.ok(at<source.length,'ATOMIC_PG_STRING_UNCLOSED');value+=source[at++];continue;}
   if(quote==="'"&&!escapes)assert.notEqual(char,'\\','ATOMIC_PG_EXPLICIT_ESCAPE_STRING_REQUIRED');
   if(char===quote){if(source[at]===quote){value+=quote;at++;continue;}return value;}value+=char;
  }assert.fail('ATOMIC_PG_STRING_UNCLOSED');
 };
 while(at<source.length){
  const char=source[at],next=source[at+1];if(/\s/u.test(char)){at++;continue;}
  if(char==='-'&&next==='-'){const end=source.indexOf('\n',at+2);at=end<0?source.length:end+1;continue;}
  if(char==='/'&&next==='*'){at+=2;let nesting=1;while(at<source.length&&nesting){if(source.startsWith('/*',at)){nesting++;at+=2;}else if(source.startsWith('*/',at)){nesting--;at+=2;}else at++;}assert.equal(nesting,0,'ATOMIC_PG_COMMENT_UNCLOSED');continue;}
  if(char==="'"){content=true;quoted("'",false);continue;}
  if(char==='"'){add(quoted('"',false));continue;}
  if(char==='$'){
   const tag=/^\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/.exec(source.slice(at))?.[0];
   if(tag){const end=source.indexOf(tag,at+tag.length);assert.ok(end>=0,'ATOMIC_PG_DOLLAR_BODY_UNCLOSED');content=true;at=end+tag.length;continue;}
  }
  if(/[A-Za-z_\u0080-\uFFFF]/u.test(char)){
   const start=at++;while(at<source.length&&/[A-Za-z0-9_$\u0080-\uFFFF]/u.test(source[at]))at++;
   const word=source.slice(start,at);if(/^[Ee]$/.test(word)&&source[at]==="'"){content=true;quoted("'",true);}else add(word);continue;
  }
  if(char==='('){depth++;content=true;at++;continue;}
  if(char===')'){depth--;assert.ok(depth>=0,'ATOMIC_PG_PARENTHESES_UNBALANCED');content=true;at++;continue;}
  if(char===';'){assert.equal(depth,0,'ATOMIC_PG_EMBEDDED_STATEMENT_SEPARATOR');if(content){assert.ok(words.length>0,'ATOMIC_PG_COMMAND_REQUIRED');statements.push(words);}words=[];content=false;at++;continue;}
  content=true;at++;
 }
 assert.equal(depth,0,'ATOMIC_PG_PARENTHESES_UNBALANCED');if(content){assert.ok(words.length>0,'ATOMIC_PG_COMMAND_REQUIRED');statements.push(words);}assert.ok(statements.length>0,'ATOMIC_PG_EMPTY_STATEMENT');return statements;
}
function statementArray(statements,readOnly){
 assert.ok(Array.isArray(statements)&&statements.length>0,'ATOMIC_PG_STATEMENTS_REQUIRED');
 assert.deepEqual(Reflect.ownKeys(statements).sort(),[...Array.from({length:statements.length},(_,i)=>String(i)),'length'].sort(),'ATOMIC_PG_DENSE_STATEMENTS_REQUIRED');
 for(const statement of statements){
  assert.equal(typeof statement,'string');assert.ok(statement.trim().length>0);
  for(const words of statementWords(statement)){
   const head=words[0];assert.equal(['BEGIN','COMMIT','ROLLBACK','END','ABORT','START','PREPARE','SAVEPOINT','RELEASE'].includes(head),false,'ATOMIC_PG_PAYLOAD_TRANSACTION_CONTROL_FORBIDDEN');
   if(head==='SET'||head==='RESET'){
    const name=words[['LOCAL','SESSION'].includes(words[1])?2:1];
    if(name==='STANDARD_CONFORMING_STRINGS'){
     // The source-pinned prefix explicitly reaffirms ON. Accept only this
     // closed LOCAL literal, never a quoted value, reset or session setting.
     assert.ok(head==='SET'&&words[1]==='LOCAL'&&/^SET\s+LOCAL\s+standard_conforming_strings\s*=\s*on\s*;?$/i.test(statement.trim()),'ATOMIC_PG_PAYLOAD_TRANSACTION_SETTING_FORBIDDEN');continue;
    }
    assert.equal(['TRANSACTION_READ_ONLY','DEFAULT_TRANSACTION_READ_ONLY'].includes(name),false,'ATOMIC_PG_PAYLOAD_TRANSACTION_SETTING_FORBIDDEN');
    assert.equal(head==='RESET'&&name==='ALL',false,'ATOMIC_PG_PAYLOAD_TRANSACTION_SETTING_FORBIDDEN');
    assert.equal(head==='SET'&&words[1]==='SESSION'&&name==='CHARACTERISTICS',false,'ATOMIC_PG_PAYLOAD_TRANSACTION_SETTING_FORBIDDEN');
    if(head==='SET'&&words[1]==='TRANSACTION')assert.ok(JSON.stringify(words)===JSON.stringify(['SET','TRANSACTION','ISOLATION','LEVEL','REPEATABLE','READ'])||(readOnly&&JSON.stringify(words)===JSON.stringify(['SET','TRANSACTION','READ','ONLY'])),'ATOMIC_PG_PAYLOAD_TRANSACTION_SETTING_FORBIDDEN');
   }
  }
 }
}

// Proofs are JSON records. Copy only data properties, reject getters/cycles and
// mutable non-JSON objects, and freeze the whole snapshot before the callback.
function immutableProofSnapshot(value,ancestors=new Set()){
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'){assert.ok(Number.isFinite(value),'ATOMIC_PG_PROOF_NUMBER_REQUIRED');return value;}
 assert.ok(value&&typeof value==='object','ATOMIC_PG_PROOF_JSON_REQUIRED');
 assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,'ATOMIC_PG_PROOF_PLAIN_JSON_REQUIRED');
 assert.equal(ancestors.has(value),false,'ATOMIC_PG_PROOF_CYCLE');ancestors.add(value);
 const array=Array.isArray(value),copy=array?[]:Object.create(Object.getPrototypeOf(value)),keys=Reflect.ownKeys(value);
 if(array)assert.deepEqual(keys.sort(),[...Array.from({length:value.length},(_,i)=>String(i)),'length'].sort(),'ATOMIC_PG_PROOF_DENSE_ARRAY_REQUIRED');
 for(const key of keys){if(array&&key==='length')continue;assert.equal(typeof key,'string','ATOMIC_PG_PROOF_STRING_KEYS_REQUIRED');const descriptor=Object.getOwnPropertyDescriptor(value,key);assert.ok(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable,'ATOMIC_PG_PROOF_DATA_PROPERTY_REQUIRED');Object.defineProperty(copy,key,{value:immutableProofSnapshot(descriptor.value,ancestors),enumerable:true,writable:false,configurable:false});}
 ancestors.delete(value);return Object.freeze(copy);
}

// Non-enumerable context preserves the original exception. The WeakMap still
// records it when an exception is frozen; no arbitrary native fields leak.
function rememberFailure(error,context){
 const value=freeze({version:'own-release-annulment-atomic-transaction-failure.v1',slot:null,kind:null,native:null,phase:null,beginCommand:null,requestedEnd:null,endRequested:false,endCommand:null,commitObserved:false,sessionTerminated:false,...context,uncertain:true,noFurtherSql:true});
 if(error&&(typeof error==='object'||typeof error==='function')){failureContexts.set(error,value);try{Object.defineProperty(error,'ownAtomicTransaction',{value,enumerable:false,configurable:true});}catch{}}
 return value;
}
export function ownReleaseAnnulmentAtomicFailureObservation(error){
 const context=error&&(typeof error==='object'||typeof error==='function')?failureContexts.get(error):null;
 return{version:'own-release-annulment-atomic-failure.v1',uncertain:true,noFurtherSql:true,transaction:context??null,error:ownReleaseErrorObservation(error)};
}

async function createSessions({target,Client,connectionValue}){
 assert.equal(typeof Client,'function','ATOMIC_PG_CLIENT_REQUIRED');assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const base=Object.fromEntries(targetKeys.map(key=>[key,target[key]]));ownReleaseConnection(connectionValue,base);
 assert.equal(target.host.includes('-pooler.'),false,'ATOMIC_PG_DIRECT_ENDPOINT_REQUIRED');const url=new URL(connectionValue);
 const clients=new Map(),certificates=new Map(),identities={},tlsObservations=[],ended=new Set(),endAttempts=new Set(),usedRw=new Set();
 let closed=false,stopped=false,failure=null,activeSlot=null;
 const healthy=()=>{if(stopped)throw failure;assert.equal(closed,false,'ATOMIC_PG_BUNDLE_CLOSED');};
 const checkTls=slot=>{const actual=clientTlsObservation(clients.get(slot),target);if(certificates.has(slot))assert.deepEqual(actual,certificates.get(slot),'ATOMIC_PG_TLS_SESSION_CHANGED');else certificates.set(slot,actual);return actual;};
 async function query(slot,text,onSubmit,onResult){healthy();checkTls(slot);if(onSubmit)onSubmit();const result=await clients.get(slot).query(text);if(onResult)onResult(result);healthy();checkTls(slot);return result;}
 async function closeOne(slot){if(!clients.has(slot)||endAttempts.has(slot))return ended.has(slot);endAttempts.add(slot);await clients.get(slot).end();ended.add(slot);return true;}
 async function close(){closed=true;const results=await Promise.allSettled(OWN_RELEASE_ANNULMENT_ATOMIC_SLOTS.map(closeOne));if(results.some(result=>result.status==='rejected')||ended.size!==clients.size)throw Error('ATOMIC_PG_OWNED_SESSION_CLOSE_FAILED');}
 function abort(slot,error,context){if(!stopped){stopped=true;failure=error;}const safeSlot=OWN_RELEASE_ANNULMENT_ATOMIC_SLOTS.includes(slot)?slot:null;return rememberFailure(error,{version:'own-release-annulment-atomic-transaction-failure.v1',slot:safeSlot,kind:target.kind,native:safeSlot?identities[safeSlot]??null:null,...context});}
 try{
  for(const slot of OWN_RELEASE_ANNULMENT_ATOMIC_SLOTS){
   let endRequested=false,endCommand=null,beginCommand=null;
   try{
    healthy();const client=new Client({host:target.host,port:5432,user:target.role,database:target.database,password:decodeURIComponent(url.password),ssl:{rejectUnauthorized:true,servername:target.host,minVersion:'TLSv1.2'},application_name:'municontrol-annul-atomic-'+slot,connectionTimeoutMillis:20000,keepAlive:true,keepAliveInitialDelayMillis:10000});
    assert.equal(typeof client.on,'function');clients.set(slot,client);
    client.on('error',error=>{if(!stopped){stopped=true;failure=error;rememberFailure(error,{version:'own-release-annulment-atomic-transaction-failure.v1',slot,kind:target.kind,native:identities[slot]??null,phase:'idle-or-socket-error',endRequested:false,endCommand:null,commitObserved:false,sessionTerminated:ended.has(slot)});}});
    await client.connect();healthy();checkTls(slot);
    const begin=(await query(slot,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',null,result=>{beginCommand=safeCommand(result.command);})).command;assert.equal(begin,'BEGIN','ATOMIC_PG_BEGIN_TAG_REQUIRED');
    assert.equal((await query(slot,"SET LOCAL timezone='UTC'")).command,'SET','ATOMIC_PG_SETTING_TAG_REQUIRED');
    const actual=(await query(slot,identitySql)).rows?.[0];identities[slot]=nativeIdentity(actual,target);
    const end=(await query(slot,'COMMIT',()=>{endRequested=true;},result=>{endCommand=safeCommand(result.command);})).command;assert.equal(end,'COMMIT','ATOMIC_PG_IDENTITY_COMMIT_TAG_REQUIRED');
    tlsObservations.push(freeze({slot,postgresSsl:actual.postgresSsl,clientTls:certificates.get(slot),native:identities[slot]}));
   }catch(error){let sessionTerminated=false;try{sessionTerminated=await closeOne(slot);}catch{}abort(slot,error,{phase:'factory-identity',beginCommand,endRequested,requestedEnd:'COMMIT',endCommand,commitObserved:endRequested&&endCommand==='COMMIT',sessionTerminated});throw error;}
  }
  assert.equal(new Set(Object.values(identities).map(nativeKey)).size,5,'ATOMIC_PG_FIVE_PHYSICAL_BACKENDS_REQUIRED');
 }catch(error){if(!stopped){stopped=true;failure=error;}try{await close();}catch{}if(!failureContexts.has(error))rememberFailure(error,{version:'own-release-annulment-atomic-transaction-failure.v1',slot:null,kind:target.kind,phase:'factory',endRequested:false,endCommand:null,commitObserved:false,sessionTerminated:ended.size===clients.size});throw error;}

 async function transactionObserved(slot,statements,options){
  // A later attempted call must not overwrite the first transaction's end
  // observation (for example, an installation COMMIT whose response was lost).
  if(stopped)throw failure;
  let endRequested=false,endCommand=null,beginCommand=null,requestedEnd=null;
  try{
   healthy();assert.equal(activeSlot,null,'ATOMIC_PG_CONCURRENT_TRANSACTION_FORBIDDEN');assert.ok(OWN_RELEASE_ANNULMENT_ATOMIC_SLOTS.includes(slot),'ATOMIC_PG_SLOT_REQUIRED');assert.equal(ended.has(slot),false,'ATOMIC_PG_SESSION_TERMINATED');
   exact(options,['readOnly','end','onBeforeEnd'],'ATOMIC_PG_TRANSACTION_OPTIONS');const {readOnly,end,onBeforeEnd}=options;requestedEnd=['COMMIT','ROLLBACK'].includes(end)?end:null;
   assert.equal(typeof readOnly,'boolean');assert.equal(readOnly,slotReadOnly[slot],'ATOMIC_PG_SLOT_READONLY_REQUIRED');assert.equal(end,slot==='rehearsal'?'ROLLBACK':'COMMIT','ATOMIC_PG_SLOT_END_REQUIRED');assert.equal(typeof onBeforeEnd,'function','ATOMIC_PG_END_PERSISTENCE_REQUIRED');statementArray(statements,readOnly);
   if(!readOnly){assert.equal(usedRw.has(slot),false,'ATOMIC_PG_RW_SLOT_SINGLE_USE');usedRw.add(slot);}activeSlot=slot;
   const begin=(await query(slot,'BEGIN ISOLATION LEVEL REPEATABLE READ '+(readOnly?'READ ONLY':'READ WRITE'),null,result=>{beginCommand=safeCommand(result.command);})).command;assert.equal(begin,'BEGIN','ATOMIC_PG_BEGIN_TAG_REQUIRED');
   const rows=[],statementCommands=[];
   for(const statement of statements){const observed=await query(slot,statement);const results=Array.isArray(observed)?observed:[observed];rows.push(...results.map(result=>result.rows));statementCommands.push(...results.map(result=>result.command));}
   const snapshot=Object.freeze({slot,end,rows:immutableProofSnapshot(rows),statementCommands:immutableProofSnapshot(statementCommands),native:immutableProofSnapshot(identities[slot]),readOnly,beginCommand});
   await onBeforeEnd(snapshot);
   const observedEnd=(await query(slot,end,()=>{endRequested=true;},result=>{endCommand=safeCommand(result.command);})).command;
   assert.equal(observedEnd,end,'ATOMIC_PG_END_TAG_MISMATCH');
   return Object.freeze({version:OWN_RELEASE_ANNULMENT_ATOMIC_PG_VERSION+(target.kind==='test'?'+test':''),slot,kind:target.kind,readOnly,beginCommand,requestedEnd:end,endRequested,endCommand,commitObserved:end==='COMMIT'&&endCommand==='COMMIT',rollbackObserved:endCommand==='ROLLBACK',native:snapshot.native,rows:snapshot.rows,statementCommands:snapshot.statementCommands});
  }catch(error){let sessionTerminated=false;try{sessionTerminated=await closeOne(slot);}catch{}abort(slot,error,{phase:'transaction',beginCommand,requestedEnd,endRequested,endCommand,commitObserved:requestedEnd==='COMMIT'&&endCommand==='COMMIT',sessionTerminated});throw error;
  }finally{activeSlot=null;}
 }
 return Object.freeze({version:OWN_RELEASE_ANNULMENT_ATOMIC_PG_VERSION+(target.kind==='test'?'+test':''),target:freeze({...target,transport:'postgres_tls_dedicated'}),identities:freeze(identities),tlsObservations:freeze(tlsObservations),transactionObserved,close,credentialsExposed:false,automaticRetry:false});
}

export async function createOwnReleaseAnnulmentAtomicSessions(options){
 exact(options,['major','Client','connectionValue'],'ATOMIC_PG_PRODUCTION_OPTIONS');const {major,Client,connectionValue}=options;
 return createSessions({target:freeze({...productionTarget(major),kind:'production'}),Client,connectionValue});
}
export async function createOwnReleaseAnnulmentAtomicTestSessions(options){
 exact(options,['testTargetAdmission','Client','connectionValue'],'ATOMIC_PG_TEST_OPTIONS');const {testTargetAdmission,Client,connectionValue}=options;
 const admission=testAdmissions.get(testTargetAdmission);assert.ok(admission,'ATOMIC_PG_MINTED_TEST_ADMISSION_REQUIRED');
 assert.equal(testTargetAdmission.kind,'test');return createSessions({target:admission.target,Client,connectionValue});
}
