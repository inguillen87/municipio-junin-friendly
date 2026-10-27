import test from 'node:test';
import assert from 'node:assert/strict';
import {ATTESTATION_VERSION,BUILD_METADATA_SQL,attestVercelBuildDatabases} from '../scripts/verify-vercel-build-db-attestation.mjs';
const sha='a'.repeat(40),marker='SYNTHETIC_MUST_NEVER_BE_LOGGED';
const buildHost='ep-synthetic-build-owner.sa-east-1.aws.neon.tech',actionsHost='ep-synthetic-build-actions-pooler.sa-east-1.aws.neon.tech';
const dbUrl='postgresql://synthetic_owner:'+marker+'@'+buildHost+':6543/build_private_path?sslmode=require&private_hint='+marker;
const actionsUrl='postgresql://synthetic_runtime:'+marker+'@'+actionsHost+':6544/actions_private_path?sslmode=require&private_hint='+marker;
const env=()=>({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:sha,DATABASE_URL:dbUrl,ACTIONS_DATABASE_URL:' '+actionsUrl+' '});
const row=(patch={})=>({serverMajor:18,database:'technical_db',currentUser:'technical_owner',sessionUser:'technical_owner',neonProjectId:'project-observed-123',neonBranchId:'br-observed-123',neonEndpointId:'ep-observed-123',transactionReadOnly:'on',...patch});
function harness(rows=[row(),row({serverMajor:17,currentUser:'runtime_observed',sessionUser:'runtime_observed',neonBranchId:'br-another-456',neonEndpointId:'ep-another-456'})]){
 const calls=[],logs=[];let created=0;
 const createSql=connection=>{
  const index=created++;calls.push({event:'create',index,connection});
  const token={index};
  return {query(text,values){calls.push({event:'query',index,text,values});return token;},
   async transaction(queries,options){calls.push({event:'transaction',index,queries,options});assert.deepEqual(queries,[token]);return [[rows[index]]];}};
 };
 return {calls,logs,createSql,run:patch=>attestVercelBuildDatabases({env:env(),sourceSha:sha,createSql,writeLine:line=>logs.push(line),...patch})};
}

test('inert import plus two observed clients: one SELECT inside one verified READ ONLY transaction per class, no assumed17/18 mapping',async()=>{
 const h=harness();assert.equal(h.calls.length,0);assert.equal(h.logs.length,0);
 const currentEnv=env();
 const observed=await h.run({env:currentEnv,writeLine:line=>{h.logs.push(line);currentEnv.ACTIONS_DATABASE_URL='post-observation-change';currentEnv.VERCEL_ENV='production';currentEnv.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);}});
 assert.deepEqual(h.calls.filter(value=>value.event==='create').map(value=>value.connection),[dbUrl,actionsUrl]);
 assert.equal(h.calls.filter(value=>value.event==='query').length,2);assert.equal(h.calls.filter(value=>value.event==='transaction').length,2);
 for(const call of h.calls.filter(value=>value.event==='query')){assert.equal(call.text,BUILD_METADATA_SQL);assert.deepEqual(call.values,[]);assert.match(call.text,/^SELECT\s/);assert.doesNotMatch(call.text,/\b(?:FROM|INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|COPY|set_config)\b/i);}
 for(const call of h.calls.filter(value=>value.event==='transaction')){assert.equal(call.queries.length,1);assert.equal(call.options.readOnly,true);assert.equal(call.options.isolationLevel,'ReadCommitted');assert.equal(call.options.arrayMode,false);assert.equal(call.options.fullResults,false);assert.ok(call.options.fetchOptions.signal instanceof AbortSignal);assert.deepEqual(Object.keys(call.options.fetchOptions),['signal']);}
 assert.deepEqual(observed.map(value=>[value.clientClass,value.serverMajor]),[['DATABASE_URL',18],['ACTIONS_DATABASE_URL',17]]);
 const emitted=h.logs.map(JSON.parse);assert.equal(emitted.length,3);assert.equal(emitted[2].event,'complete');assert.equal(emitted[2].observationOnly,true);
 assert.ok(emitted.every(value=>value.version===ATTESTATION_VERSION&&value.sourceSha===sha&&value.environment==='preview'));
 assert.deepEqual(emitted.slice(0,2).map(value=>[value.configuredHostname,value.configuredHostnameSource]),[[buildHost,'configured-build-env'],[actionsHost,'configured-build-env']]);
 for(const value of [marker,dbUrl,actionsUrl,'synthetic_owner','synthetic_runtime','6543','6544','build_private_path','actions_private_path','private_hint','sslmode'])assert.ok(!h.logs.join('\n').includes(value));
 assert.deepEqual(Object.keys(emitted[0]).sort(),['version','event','sourceSha','environment','clientClass','serverMajor','database','currentUser','sessionUser','neonProjectId','neonBranchId','neonEndpointId','transactionReadOnly','neonIdentityComplete','configuredHostname','configuredHostnameSource'].sort());
 assert.equal(Object.hasOwn(emitted[0],'headers'),false);assert.equal(Object.hasOwn(emitted[0],'connectionString'),false);
});

test('build/source/both-variable preflight rejects before either client: no local or alternate environment fallback',async()=>{
 for(const patch of [{env:{...env(),VERCEL:'0'}},{env:{...env(),VERCEL_ENV:'development'}},{env:{...env(),VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)}},{sourceSha:'not-a-sha'},{env:{...env(),DATABASE_URL:''}},{env:{...env(),ACTIONS_DATABASE_URL:'  '}}]){
  const h=harness();await assert.rejects(h.run(patch),error=>/^(BUILD_CONTEXT_REQUIRED|SOURCE_SHA_(?:REQUIRED|MISMATCH)|CLIENT_CONFIGURATION_REQUIRED)$/.test(error.message));
  assert.equal(h.calls.length,0);assert.equal(h.logs.length,0);
 }
 const h=harness();const returned=await h.run({env:{...env(),VERCEL_ENV:'production'}});assert.ok(returned.every(value=>value.environment==='production'));
});

test('raw driver errors are replaced with a fixed code and stop before the second client or retry',async()=>{
 const h=harness();let factories=0,queries=0,transactions=0;
 const createSql=connection=>{factories++;assert.equal(connection,dbUrl);return {query(text,values){queries++;assert.equal(text,BUILD_METADATA_SQL);assert.deepEqual(values,[]);return {};},async transaction(){transactions++;throw Object.assign(new Error(dbUrl+' '+marker+' headers=password'),{code:marker,cause:new Error(actionsUrl)});}};};
 await assert.rejects(h.run({createSql}),error=>{assert.equal(error.message,'CLIENT_UNAVAILABLE');assert.equal(error.code,'CLIENT_UNAVAILABLE');assert.equal(error.clientClass,'DATABASE_URL');assert.equal(Object.hasOwn(error,'cause'),false);assert.ok(!String(error.stack).includes(marker));return true;});
 assert.equal(factories,1);assert.equal(queries,1);assert.equal(transactions,1);assert.equal(h.logs.length,0);
});

test('a wrong read-only observation, altered shape, or unsafe metadata identifier is never printed',async()=>{
 for(const first of [row({transactionReadOnly:'off'}),row({serverMajor:'18'}),row({unexpected:marker}),row({database:'postgres://'+marker}),row({currentUser:'unsafe\n'+marker}),row({neonEndpointId:'ep-observed?password='+marker})]){
  const h=harness([first,row()]);await assert.rejects(h.run(),error=>['METADATA_INVALID','READ_ONLY_NOT_OBSERVED'].includes(error.code));
  assert.equal(h.calls.filter(value=>value.event==='create').length,1);assert.equal(h.logs.length,0);
 }
 for(const shape of [[],[[]],[[row(),row()]],[[],[row()]]]){
  const h=harness();await assert.rejects(h.run({createSql:()=>({query:()=>({}),transaction:async()=>shape})}),/METADATA_INVALID/);assert.equal(h.logs.length,0);
 }
});

test('missing Neon settings are explicit NULL observations, cannot become inferred targets or a complete attestation',async()=>{
 const h=harness([row({serverMajor:17,database:'database18',neonProjectId:null,neonBranchId:null,neonEndpointId:null}),row({serverMajor:18,database:'database17'})]);
 await assert.rejects(h.run(),error=>error.code==='NEON_IDENTITY_INCOMPLETE');
 assert.equal(h.calls.filter(value=>value.event==='query').length,2);assert.equal(h.logs.length,2);
 const [first,second]=h.logs.map(JSON.parse);assert.equal(first.serverMajor,17);assert.equal(first.database,'database18');assert.equal(first.neonIdentityComplete,false);assert.equal(first.neonProjectId,null);assert.equal(first.neonBranchId,null);assert.equal(first.neonEndpointId,null);
 assert.equal(second.serverMajor,18);assert.equal(second.neonIdentityComplete,true);assert.ok(!h.logs.some(line=>JSON.parse(line).event==='complete'));
});

test('failure to persist an observation stops before any second query and never rethrows the writer error',async()=>{
 const h=harness();await assert.rejects(h.run({writeLine:async()=>{throw new Error(marker+' '+dbUrl);}}),error=>{assert.equal(error.code,'OUTPUT_FAILED');assert.equal(error.clientClass,'DATABASE_URL');assert.equal(Object.hasOwn(error,'cause'),false);assert.ok(!String(error.stack).includes(marker));return true;});
 assert.equal(h.calls.filter(value=>value.event==='create').length,1);assert.equal(h.calls.filter(value=>value.event==='query').length,1);
});

test('configured hostname parsing is closed before either client; no URL/error component is printed or inferred as server identity',async()=>{
 const unsafe=[
  'not a URL '+marker,
  'postgresql://synthetic_owner:'+marker+'@localhost/private',
  'postgresql://synthetic_owner:'+marker+'@ep-other.example.com/private',
  'postgresql://synthetic_owner:'+marker+'@ep-other.sa-east-1.aws.neon.tech.evil.invalid/private',
  'postgresql://synthetic_owner:'+marker+'@[::1]/private',
  'postgresql://synthetic_owner:'+marker+'@ep-'+('a'.repeat(61))+'.sa-east-1.aws.neon.tech/private'
 ];
 for(const key of ['DATABASE_URL','ACTIONS_DATABASE_URL'])for(const value of unsafe){
  const h=harness();await assert.rejects(h.run({env:{...env(),[key]:value}}),error=>{assert.equal(error.code,'CONFIGURED_HOSTNAME_INVALID');assert.equal(error.clientClass,key);assert.equal(error.message,'CONFIGURED_HOSTNAME_INVALID');assert.equal(Object.hasOwn(error,'cause'),false);assert.ok(!String(error.stack).includes(marker));return true;});
  assert.equal(h.calls.length,0);assert.equal(h.logs.length,0);
 }
 const h=harness([row({neonProjectId:null,neonBranchId:null,neonEndpointId:null}),row()]);
 await assert.rejects(h.run(),error=>error.code==='NEON_IDENTITY_INCOMPLETE');
 const observed=h.logs.map(JSON.parse);assert.equal(observed.length,2);assert.equal(observed[0].configuredHostname,buildHost);assert.equal(observed[0].configuredHostnameSource,'configured-build-env');
 assert.equal(observed[0].neonIdentityComplete,false);assert.equal(observed[0].neonEndpointId,null);assert.ok(observed.every(value=>value.event==='observation'));
 assert.equal(h.calls.filter(value=>value.event==='query').length,2);assert.equal(h.calls.filter(value=>value.event==='transaction').length,2);
});
