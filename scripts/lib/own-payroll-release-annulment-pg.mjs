// Dedicated public208/209 pg transport only. The historical HTTP target stays byteexact.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {OWN_RELEASE_TARGETS,ownReleaseConnection,ownReleaseIdentity} from './own-payroll-release-target.mjs';
const execute=promisify(execFile);
async function releaseMaterial(major){
 const target=OWN_RELEASE_TARGETS.find(t=>t.major===major);assert.ok(target,'OWN_RELEASE_TARGET_INVALID');
 const args=['connection-string',target.branchId,'--project-id',target.projectId,'--role-name',target.role,'--database-name',target.database,'--ssl','verify-full','--no-analytics'];
 const result=process.platform==='win32'?await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','& neon.cmd '+args.join(' ')],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:65536}):await execute('neon',args,{encoding:'utf8',timeout:20000,maxBuffer:65536});
 assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const value=result.stdout.trim(),connection=ownReleaseConnection(value,target);
 return {value,target,connection};
}
const dedicatedSlots=Object.freeze(['epoch','rehearsal','installation','durable','repetition']);
const reviewedPgVersion='8.23.1';
const reviewedPgIntegrity='sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const require=createRequire(import.meta.url);
const safeCodes=new Set([
 'P0001','42501','42601','42703','42883','42P01','23505','23503','22023','22P02','25P02','25006',
 '40001','40P01','53300','53400','57014','57P01','57P02','57P03','08000','08001','08003','08004','08006','08007','08P01',
 'ERR_ASSERTION','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','ENOTFOUND','EAI_AGAIN','ECONNABORTED',
 'ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
 'OWN_M7_INSTALL_FAILED','OWN_M7_STAGE_UNVALIDATED','OWN_M7_REHEARSAL_UNCERTAIN','OWN_M7_NON_ERROR_TRANSPORT_FAILURE','PUBLIC_ANNUL_UNCLASSIFIED_ERROR'
]);
const safeNames=new Set(['Error','DatabaseError','AssertionError','TypeError','RangeError','AggregateError']);
const safeSeverity=new Set(['ERROR','FATAL','PANIC','WARNING','NOTICE','LOG','DEBUG','INFO']);
const safeTokens=new Set(['PUBLIC_ANNUL208_REHEARSAL_ROLLBACK','PUBLIC_ANNUL209_REHEARSAL_ROLLBACK',
 'ANNUL208_LATE_INSTALL_FAILURE','OWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED','ANNUL209_EARLY_INSTALL_FAILURE','ANNUL209_LATE_INSTALL_FAILURE','ANNUL209_DEFAULT_ACL_CHANGED']);
const errorFields=Object.freeze(['name','message','stack','severity','code','detail','hint','position','internalPosition','internalQuery','where','schema','table','column','dataType','constraint','file','line','routine']);
const backendStartPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
// Inspect data properties only; getters, toString, cause and arbitrary keys are
// never invoked or serialized while recording an unexpected native exception.
const field=(value,key)=>{try{const descriptor=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;return descriptor&&Object.hasOwn(descriptor,'value')?{present:true,value:descriptor.value}:descriptor?{present:true,accessor:true}:{present:false};}catch{return{present:true,uninspectable:true};}};
function fieldObservation(value){
 if(value.accessor)return{type:'accessor',contentPersisted:false};if(value.uninspectable)return{type:'uninspectable',contentPersisted:false};
 const item=value.value;if(typeof item==='string')return{type:'string',bytes:Buffer.byteLength(item,'utf8'),sha256:sha256(item)};
 if(Buffer.isBuffer(item))return{type:'buffer',bytes:item.length,sha256:sha256(item)};
 if(item===null)return{type:'null',contentPersisted:false};
 if(['number','boolean','bigint','undefined'].includes(typeof item)){const text=String(item);return{type:typeof item,bytes:Buffer.byteLength(text),sha256:sha256(text)};}
 return{type:typeof item,contentPersisted:false};
}
function safeNative(value){
 const pid=field(value,'pid').value,start=field(value,'backendStart').value,version=field(value,'serverVersionNum').value;
 if(!Number.isSafeInteger(pid)||pid<=0||typeof start!=='string'||!backendStartPattern.test(start)||typeof version!=='string'||!/^\d{6}$/.test(version))return null;
 return{pid,backendStart:start,serverVersionNum:version};
}
function safeSession(value){
 const slot=field(value,'slot').value;if(!dedicatedSlots.includes(slot))return null;
 const terminated=field(value,'sessionTerminated').value;
 return{slot,native:safeNative(field(value,'native').value),...(typeof terminated==='boolean'?{sessionTerminated:terminated}:{})};
}
export function ownReleaseErrorCode(error,fallback='OWN_M7_INSTALL_FAILED'){
 assert.ok(safeCodes.has(fallback),'OWN_RELEASE_SAFE_FALLBACK_REQUIRED');const code=field(error,'code').value;return safeCodes.has(code)?code:fallback;
}
export function ownReleaseErrorObservation(error){
 const fields={};for(const key of errorFields){const value=field(error,key);if(value.present)fields[key]=fieldObservation(value);}
 const name=field(error,'name').value,severity=field(error,'severity').value,message=field(error,'message').value;
 const own=safeSession(field(error,'ownDedicatedSession').value),transport=safeSession(field(error,'ownDedicatedTransportFailure').value);
 return{version:'own-release-redacted-native-error.v1',type:safeNames.has(name)?name:'ErrorLike',code:ownReleaseErrorCode(error,'PUBLIC_ANNUL_UNCLASSIFIED_ERROR'),
  ...(safeSeverity.has(severity)?{severity}:{}),...(safeTokens.has(message)?{messageToken:message}:{}),fields,
  ...(own?{ownedSession:own}:{}),...(transport?{transportFailure:transport}:{})};
}
// Unvalidated SELECT/DETAIL data is not persisted as a receipt. The byte digest
// records the observation first; only a closed validated proof is stored later.
export function ownReleaseReceiptObservation(value){
 const raw=JSON.stringify(value);assert.equal(typeof raw,'string','OWN_RELEASE_RECEIPT_JSON_REQUIRED');
 return{version:'own-release-receipt-bytes.v1',bytes:Buffer.byteLength(raw,'utf8'),sha256:sha256(raw)};
}
export function ownReleasePgDependencySource({packageJson,packageLock}){
 assert.equal(typeof packageJson,'string');assert.equal(typeof packageLock,'string');
 const manifest=JSON.parse(packageJson),lock=JSON.parse(packageLock),version=manifest.dependencies?.pg;
 assert.match(version??'',/^\d+\.\d+\.\d+$/,'OWN_RELEASE_PG_EXACT_DEPENDENCY_REQUIRED');
 assert.equal(version,reviewedPgVersion,'OWN_RELEASE_PG_REVIEWED_VERSION_REQUIRED');
 assert.equal(lock.lockfileVersion,3,'OWN_RELEASE_PG_LOCKFILE_REQUIRED');
 assert.equal(lock.packages?.['']?.dependencies?.pg,version,'OWN_RELEASE_PG_ROOT_LOCK_CHANGED');
 const installed=lock.packages?.['node_modules/pg'];
 assert.equal(installed?.version,version,'OWN_RELEASE_PG_LOCK_VERSION_CHANGED');
 assert.equal(installed.resolved,'https://registry.npmjs.org/pg/-/pg-'+version+'.tgz','OWN_RELEASE_PG_OFFICIAL_SOURCE_REQUIRED');
 assert.match(installed.integrity??'',/^sha512-[A-Za-z0-9+/]+={0,2}$/,'OWN_RELEASE_PG_INTEGRITY_REQUIRED');
 assert.equal(installed.integrity,reviewedPgIntegrity,'OWN_RELEASE_PG_REVIEWED_INTEGRITY_REQUIRED');
 return Object.freeze({version,integrity:installed.integrity,packageJsonSha256:sha256(packageJson),packageLockSha256:sha256(packageLock)});
}
const identitySql=`SELECT current_setting('server_version_num')::int/10000 AS major,
 current_setting('neon.project_id',true) AS "projectId",current_setting('neon.branch_id',true) AS "branchId",
 current_setting('neon.endpoint_id',true) AS "endpointId",current_database() AS database,current_user AS role,
 (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl,
 jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num')) AS native`;
export async function ownReleaseAnnulmentClient(major,{dependencySource}){
 // Source/lock must have been pinned normally before this path can activate.
 // No dependency installation or credential is exposed by this function.
 const packageJson=fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8');
 const packageLock=fs.readFileSync(new URL('../../package-lock.json',import.meta.url),'utf8');
 assert.deepEqual(ownReleasePgDependencySource({packageJson,packageLock}),dependencySource,'OWN_RELEASE_PG_COMMITTED_SOURCE_CHANGED');
 assert.equal(require('pg/package.json').version,dependencySource.version,'OWN_RELEASE_PG_INSTALLED_VERSION_CHANGED');
 const {Client}=await import('pg');assert.equal(typeof Client,'function','OWN_RELEASE_PG_CLIENT_REQUIRED');
 const {value}=await releaseMaterial(major);
 return createOwnReleaseAnnulmentSessions({major,Client,connectionValue:value});
}
// Constructor DI for proposed pure transport tests. This function neither reads
// credentials nor changes the allowlist: the target comes only from major.
// The CLI above always supplies the official dynamically imported pg.Client.
export async function createOwnReleaseAnnulmentSessions({major,Client,connectionValue}){
 assert.equal(typeof Client,'function');const target=OWN_RELEASE_TARGETS.find(t=>t.major===major);assert.ok(target,'OWN_RELEASE_TARGET_INVALID');
 assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const connection=ownReleaseConnection(connectionValue,target),url=new URL(connectionValue);
 assert.equal(target.host.includes('-pooler.'),false,'OWN_RELEASE_DIRECT_ENDPOINT_REQUIRED');
 // Do not pass a connectionString: URL options must never override strict TLS.
 const clients=new Map(),identities={},tlsObservations=[],terminated=new Set(),used=new Set();let closed=false,transportFailure=null;
 const healthy=()=>{if(transportFailure)throw transportFailure;};
 const closeOne=async slot=>{const client=clients.get(slot);if(client&&!terminated.has(slot)){await client.end();terminated.add(slot);}};
 const close=async()=>{closed=true;const results=await Promise.allSettled(dedicatedSlots.map(closeOne));const failed=results.find(r=>r.status==='rejected');if(failed)throw Error('OWN_RELEASE_OWNED_SESSION_CLOSE_FAILED',{cause:failed.reason});};
 try{
  for(const slot of dedicatedSlots){
   const client=new Client({host:target.host,port:5432,user:target.role,database:target.database,
    password:decodeURIComponent(url.password),ssl:{rejectUnauthorized:true,servername:target.host},
    application_name:'municontrol-m7-annulment-'+slot,connectionTimeoutMillis:20000});
   assert.equal(typeof client.on,'function','OWN_RELEASE_PG_ERROR_CHANNEL_REQUIRED');
   client.on('error',error=>{if(!transportFailure){transportFailure=error;Object.defineProperty(error,'ownDedicatedTransportFailure',{value:Object.freeze({slot,native:identities[slot]??null}),enumerable:false});}});
   clients.set(slot,client);healthy();await client.connect();healthy();
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');healthy();
   await client.query("SET LOCAL timezone='UTC'");healthy();
   const actual=(await client.query(identitySql)).rows[0];healthy();
   assert.equal(actual.ssl,true,'OWN_RELEASE_PG_TLS_REQUIRED');ownReleaseIdentity(actual,target,connection);
   assert.ok(Number.isSafeInteger(actual.native?.pid)&&actual.native.pid>0,'OWN_RELEASE_NATIVE_PID_REQUIRED');
   assert.match(actual.native.backendStart,backendStartPattern,'OWN_RELEASE_NATIVE_BACKEND_START_REQUIRED');
   assert.match(actual.native.serverVersionNum,/^\d{6}$/,'OWN_RELEASE_NATIVE_SERVER_VERSION_REQUIRED');
   assert.equal(Math.trunc(Number(actual.native.serverVersionNum)/10000),major);
   identities[slot]=Object.freeze({...actual.native});tlsObservations.push(Object.freeze({slot,ssl:actual.ssl,native:identities[slot]}));healthy();await client.query('COMMIT');healthy();
  }
  // All five sessions are still held concurrently. Actual native identities,
  // rather than client-object identity, prove the distinct physical backends.
  assert.equal(new Set(Object.values(identities).map(n=>n.pid+':'+n.backendStart)).size,5,'OWN_RELEASE_FIVE_DEDICATED_BACKENDS_REQUIRED');
 }catch(error){try{await close();}catch{}throw error;}
 async function transaction(slot,statements,{readOnly}){
  assert.equal(closed,false,'OWN_RELEASE_DEDICATED_CLIENT_CLOSED');healthy();
  assert.ok(dedicatedSlots.includes(slot)&&!terminated.has(slot),'OWN_RELEASE_DEDICATED_SLOT_REQUIRED');
  assert.equal(typeof readOnly,'boolean');assert.ok(Array.isArray(statements)&&statements.length>0&&statements.every(s=>typeof s==='string'&&s.length>0));
  if(slot==='epoch'||slot==='durable')assert.equal(readOnly,true,'OWN_RELEASE_OBSERVER_READONLY_REQUIRED');
  else{assert.equal(readOnly,false);assert.equal(used.has(slot),false,'OWN_RELEASE_MUTATION_SLOT_SINGLE_USE');used.add(slot);}
  const client=clients.get(slot),rows=[];
  try{
   healthy();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ '+(readOnly?'READ ONLY':'READ WRITE'));healthy();
   for(const statement of statements){healthy();rows.push((await client.query(statement)).rows);healthy();}
   healthy();await client.query('COMMIT');healthy();return rows;
  }catch(error){
   // Never submit ROLLBACK or any other SQL after an ambiguous outcome. A
   // protocol Terminate closes only this owned session; it proves no business
   // recovery. The coordinator alone may authorize the separate RO observation
   // after the exact native rehearsal error/detail has been persisted/checked.
   let sessionTerminated=false;try{await closeOne(slot);sessionTerminated=true;}catch{}
   Object.defineProperty(error,'ownDedicatedSession',{value:Object.freeze({slot,native:identities[slot],sessionTerminated}),enumerable:false});
   throw error;
  }
 }
 return Object.freeze({version:'own-release-annulment-dedicated-pg.v1',target:Object.freeze({...target,...connection,transport:'postgres_tls_dedicated'}),
  identities:Object.freeze(identities),tlsObservations:Object.freeze(tlsObservations),transaction,close,credentialsExposed:false,automaticRetry:false});
}
