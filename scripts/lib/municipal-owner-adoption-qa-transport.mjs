// QA transport only. Importing or constructing this module never connects.
// Windows process ownership is still established by the existing CIM/PID guard
// in each runner. CI observes a disposable Docker server, not a Windows process.
import assert from 'node:assert/strict';
import {isIP} from 'node:net';
import {noeliaCircuitRuntime} from './noelia-circuit-runtime.mjs';

export const OWNER_ADOPTION_QA_REPOSITORY='inguillen87/municipio-junin-friendly';
const database='own_payroll_run_qa',role='postgres',runtimeRole='municontrol_actions_runtime_app';
const localStarts={17:1792025447,18:1792025448},localPids={17:5988,18:34448};
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const frozen=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;};
const directory=v=>{assert.equal(typeof v,'string');assert.doesNotMatch(v,/[\0\r\n]/);return v.replaceAll('\\','/');};
function privateIpv4(value){if(isIP(value)!==4)return false;const [a,b]=value.split('.').map(Number);return a===10||a===172&&b>=16&&b<=31||a===192&&b===168;}

export function ownerAdoptionQaTransport(options,context={}){
 assert.ok(options&&Object.keys(options).every(k=>['root','major','sourceCommit','transport','browser'].includes(k)),'OWNER_QA_TRANSPORT_OPTION_INVALID');
 const {root,major,sourceCommit,transport='local',browser='none'}=options;
 assert.ok([17,18].includes(major));assert.match(sourceCommit??'',/^[a-f0-9]{40}$/,'OWNER_QA_SOURCE_COMMIT_REQUIRED');
 const environment=context.env??process.env;
 if(transport==='ci'){
  assert.equal(environment.GITHUB_REPOSITORY,OWNER_ADOPTION_QA_REPOSITORY,'OWNER_QA_CI_REPOSITORY_CHANGED');
  assert.equal(environment.GITHUB_SHA,sourceCommit,'OWNER_QA_CI_SOURCE_CHANGED');
 }
 const runtime=noeliaCircuitRuntime({root,major,transport,browser},context);
 const args=['--no-psqlrc','--no-align','--tuples-only','--quiet','--set','ON_ERROR_STOP=1','--no-password','--username',role,'--host','127.0.0.1','--port',String(55400+major),'--dbname',database];
 return frozen({runtime,args,transport,major,sourceCommit,client:{host:'127.0.0.1',port:55400+major,database,role},processGuardRequired:transport==='local',windowsProcessVerified:false,ciContextVerified:transport==='ci'});
}

// All values are aggregate server/role metadata. No query text or employee rows.
export const OWNER_ADOPTION_QA_IDENTITY_SQL=`SELECT jsonb_build_object(
 'database',current_database(),'role',current_user,'sessionRole',session_user,
 'databaseOwner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),
 'major',current_setting('server_version_num')::integer/10000,
 'address',host(inet_server_addr()),'port',inet_server_port(),
 'directory',current_setting('data_directory'),
 'startEpoch',floor(extract(epoch FROM pg_postmaster_start_time()))::bigint,
 'neonProject',current_setting('neon.project_id',true),'neonBranch',current_setting('neon.branch_id',true),
 'otherClients',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()),
 'publicTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','m','f')),
 'runtimeRole',(SELECT jsonb_build_object('oid',oid::bigint,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDatabase',rolcreatedb,'replication',rolreplication) FROM pg_roles WHERE rolname='municontrol_actions_runtime_app'))`;

function validateServer(proof,{major,transport}){
 assert.ok(proof&&typeof proof==='object');assert.ok([17,18].includes(major));assert.ok(['local','ci'].includes(transport));
 assert.equal(proof.database,database);assert.equal(proof.role,role);assert.equal(proof.sessionRole,role);assert.equal(proof.databaseOwner,role);assert.equal(proof.major,major);
 assert.ok(Number.isSafeInteger(proof.databaseOid)&&proof.databaseOid>0&&proof.databaseOid<=4294967295,'OWNER_QA_DATABASE_OID_INVALID');
 assert.ok(Number.isSafeInteger(proof.startEpoch)&&proof.startEpoch>0,'OWNER_QA_SERVER_START_INVALID');
 assert.ok(!proof.neonProject&&!proof.neonBranch,'OWNER_QA_NEON_REFUSED');assert.equal(proof.otherClients,0,'OWNER_QA_OTHER_CLIENTS');
 assert.ok(Number.isSafeInteger(proof.publicTables)&&proof.publicTables>=0);
 const r=proof.runtimeRole;assert.ok(r&&Number.isSafeInteger(r.oid)&&r.oid>0&&r.oid<=4294967295,'OWNER_QA_RUNTIME_ROLE_MISSING');
 for(const flag of ['login','superuser','bypassRls','createRole','createDatabase','replication'])assert.equal(r[flag],false,'OWNER_QA_RUNTIME_ROLE_PRIVILEGED:'+flag);
 const dir=directory(proof.directory);
 if(transport==='ci'){
  assert.equal(proof.port,5432,'OWNER_QA_CI_SERVER_PORT_CHANGED');assert.ok(privateIpv4(proof.address),'OWNER_QA_CI_PRIVATE_ADDRESS_REQUIRED');
  assert.match(dir,/^\/var\/lib\/postgresql\/[A-Za-z0-9_./-]+$/,'OWNER_QA_CI_DATA_DIRECTORY_REQUIRED');assert.ok(!dir.split('/').includes('..'));
  assert.equal(proof.publicTables,0,'OWNER_QA_CI_PUBLIC_TABLES_NOT_EMPTY');
 }else{assert.equal(proof.address,'127.0.0.1');assert.equal(proof.port,55400+major);assert.equal(proof.startEpoch,localStarts[major]);assert.match(dir,/^[A-Za-z]:\//);}
 return proof;
}

export function captureOwnerAdoptionQaDestination(proof,{major,transport='local',localIdentity}={}){
 validateServer(proof,{major,transport});
 if(transport==='local'){
  assert.ok(localIdentity,'OWNER_QA_LOCAL_PROCESS_PROOF_REQUIRED');assert.equal(localIdentity.processId,localPids[major]);
  assert.equal(localIdentity.major,major);assert.equal(localIdentity.port,55400+major);assert.equal(localIdentity.host,'127.0.0.1');assert.equal(localIdentity.database,database);
  assert.equal(localIdentity.postmasterStartEpoch,localStarts[major]);
  assert.equal(directory(proof.directory),directory(localIdentity.directory),'OWNER_QA_LOCAL_DIRECTORY_CHANGED');
 }
 return frozen({version:'owner-adoption-qa-destination.v1',transport,major,database:proof.database,role:proof.role,sessionRole:proof.sessionRole,databaseOwner:proof.databaseOwner,databaseOid:proof.databaseOid,address:proof.address,port:proof.port,directory:proof.directory,startEpoch:proof.startEpoch,runtimeRole:{...proof.runtimeRole},publicTables:proof.publicTables,client:{host:'127.0.0.1',port:55400+major,database,role},windowsProcessVerified:transport==='local',serverIdentityObserved:true});
}

export function assertOwnerAdoptionQaDestination(proof,identity){
 assert.equal(identity?.version,'owner-adoption-qa-destination.v1');validateServer(proof,identity);
 for(const key of ['database','role','sessionRole','databaseOwner','databaseOid','major','address','port','directory','startEpoch','runtimeRole','publicTables'])assert.deepEqual(proof[key],identity[key],'OWNER_QA_PINNED_DESTINATION_CHANGED:'+key);
 return proof;
}

// Before the first metadata-only observation, CI can verify the fixed service
// contract. OID, address, directory and start are observed afterwards, never
// invented; all fixture and cleanup transactions use the pinned guard below.
export function ownerAdoptionQaCiInitialGuard({major}){
 assert.ok([17,18].includes(major));
 return `IF current_database()<>'own_payroll_run_qa' OR current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('server_version_num')::integer/10000<>${major} OR inet_server_port() IS DISTINCT FROM 5432
 OR NOT coalesce(inet_server_addr()<<inet '10.0.0.0/8' OR inet_server_addr()<<inet '172.16.0.0/12' OR inet_server_addr()<<inet '192.168.0.0/16',false)
 OR current_setting('data_directory') !~ '^/var/lib/postgresql/[A-Za-z0-9_./-]+$' OR position('/../' IN current_setting('data_directory'))>0
 OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','m','f'))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_QA_INITIAL_DESTINATION_CHANGED';END IF;`;
}

function allowedSerializationClient(value){
 assert.deepEqual(Object.keys(value??{}).sort(),['applicationName','backendStart','pid'],'OWNER_QA_HOLDER_SHAPE');
 assert.ok(Number.isSafeInteger(value.pid)&&value.pid>0&&value.pid<=2147483647,'OWNER_QA_HOLDER_PID');
 assert.equal(value.applicationName,'owner184-serialization-holder','OWNER_QA_HOLDER_APPLICATION');
 assert.match(value.backendStart??'',/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,'OWNER_QA_HOLDER_START');assert.ok(Number.isFinite(Date.parse(value.backendStart)),'OWNER_QA_HOLDER_START');
 return value;
}

// This observation runs only after the unchanged guard rejects. A transient
// client may already have gone; the detail does not claim an atomic cause.
function destinationRejectionDetail(identity,holderPredicate){
 const runtimeCondition=condition=>`EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(runtimeRole)}${condition?' AND '+condition:''})`;
 return `jsonb_build_object('observation','post_rejection_observation','matches',jsonb_build_object(
 'databaseMatches',current_database() IS NOT DISTINCT FROM ${literal(identity.database)},
 'roleMatches',current_user IS NOT DISTINCT FROM ${literal(identity.role)},
 'sessionRoleMatches',session_user IS NOT DISTINCT FROM ${literal(identity.sessionRole)},
 'majorMatches',current_setting('server_version_num')::integer/10000 IS NOT DISTINCT FROM ${identity.major},
 'databaseOidMatches',(SELECT oid FROM pg_database WHERE datname=current_database()) IS NOT DISTINCT FROM ${identity.databaseOid}::oid,
 'databaseOwnerMatches',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS NOT DISTINCT FROM ${literal(identity.databaseOwner)},
 'addressMatches',host(inet_server_addr()) IS NOT DISTINCT FROM ${literal(identity.address)},
 'portMatches',inet_server_port() IS NOT DISTINCT FROM ${identity.port},
 'directoryMatches',current_setting('data_directory') IS NOT DISTINCT FROM ${literal(identity.directory)},
 'startEpochMatches',floor(extract(epoch FROM pg_postmaster_start_time()))::bigint IS NOT DISTINCT FROM ${identity.startEpoch},
 'noNeonProject',nullif(current_setting('neon.project_id',true),'') IS NULL,
 'noNeonBranch',nullif(current_setting('neon.branch_id',true),'') IS NULL,
 'noUnexpectedClients',NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()${holderPredicate?' AND NOT('+holderPredicate+')':''}),
 'serializationHolderPresent',${holderPredicate?'EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND '+holderPredicate+')':'true'},
 'publicTablesMatches',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','m','f')) IS NOT DISTINCT FROM ${identity.publicTables},
 'runtimeRolePresent',${runtimeCondition('')},'runtimeRoleOidMatches',${runtimeCondition('oid='+identity.runtimeRole.oid+'::oid')},
 'runtimeNoLogin',${runtimeCondition('NOT rolcanlogin')},'runtimeNoSuperuser',${runtimeCondition('NOT rolsuper')},
 'runtimeNoBypassRls',${runtimeCondition('NOT rolbypassrls')},'runtimeNoCreateRole',${runtimeCondition('NOT rolcreaterole')},
 'runtimeNoCreateDatabase',${runtimeCondition('NOT rolcreatedb')},'runtimeNoReplication',${runtimeCondition('NOT rolreplication')}),
 'otherClients',(WITH observed_clients AS MATERIALIZED (
 SELECT pid,backend_start,state,application_name FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()
 ),bounded_clients AS (SELECT * FROM observed_clients ORDER BY pid LIMIT 8)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM observed_clients),
 'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('pid',pid,'backendStart',backend_start,'state',state,
 'applicationNameMD5',md5(coalesce(application_name,'')),'applicationNameLength',length(coalesce(application_name,''))) ORDER BY pid) FROM bounded_clients),'[]'::jsonb),
 'truncated',(SELECT count(*) FROM observed_clients)>8)))::text`;
}

// Include this predicate before every fixture statement and cleanup transaction.
// It pins the observed Docker identity, including NAT's server port and address.
export function ownerAdoptionQaDestinationGuard(identity,options={}){
 assert.equal(identity?.version,'owner-adoption-qa-destination.v1');assertOwnerAdoptionQaDestination({...identity,neonProject:null,neonBranch:null,otherClients:0},identity);
 assert.ok(options&&Object.keys(options).every(k=>k==='allowedClient'),'OWNER_QA_GUARD_OPTION_INVALID');
 const holder=options.allowedClient===undefined?null:allowedSerializationClient(options.allowedClient);
 const holderPredicate=holder?`pid=${holder.pid} AND application_name=${literal(holder.applicationName)} AND backend_start=${literal(holder.backendStart)}::timestamptz AND usename=${literal(identity.role)} AND datname=${literal(identity.database)} AND backend_type='client backend'`:null;
 return `IF current_database() IS DISTINCT FROM ${literal(identity.database)} OR current_user IS DISTINCT FROM ${literal(identity.role)} OR session_user IS DISTINCT FROM ${literal(identity.sessionRole)}
 OR current_setting('server_version_num')::integer/10000<>${identity.major}
 OR (SELECT oid FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM ${identity.databaseOid}::oid
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM ${literal(identity.databaseOwner)}
 OR host(inet_server_addr()) IS DISTINCT FROM ${literal(identity.address)} OR inet_server_port() IS DISTINCT FROM ${identity.port}
 OR current_setting('data_directory') IS DISTINCT FROM ${literal(identity.directory)}
 OR floor(extract(epoch FROM pg_postmaster_start_time()))::bigint IS DISTINCT FROM ${identity.startEpoch}
 OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()${holderPredicate?' AND NOT('+holderPredicate+')':''})
 ${holderPredicate?'OR NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND '+holderPredicate+')':''}
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','m','f'))<>${identity.publicTables}
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(runtimeRole)} AND oid=${identity.runtimeRole.oid}::oid AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_QA_DESTINATION_CHANGED' USING DETAIL = ${destinationRejectionDetail(identity,holderPredicate)};END IF;`;
}
