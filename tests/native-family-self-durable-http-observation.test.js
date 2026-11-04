import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeFamilyDurableErrorObservation,nativeFamilyDurableHttpFailureObservation,recordNativeFamilyDurableHttpFailure} from '../scripts/lib/native-family-self-durable-http-observation.mjs';

const state=()=>({listening:true,addressLoopback:true,port:32123,requestCount:73,errorCount:0,closeObserved:false});
const context=()=>({method:'GET',resource:'queue',stage:'fetch',requestCount:32,readServerState:state});
function rejected(){const low=Object.assign(new Error('private low-level details'),{code:'ECONNRESET'}),socket=Object.assign(new Error('private socket details',{cause:low}),{name:'SocketError',code:'UND_ERR_SOCKET'});return new TypeError('fetch failed',{cause:socket});}

test('the previously discarded fetch cause is retained as finite code/name classifications',()=>{
 const error=rejected();
 // The existing failure shape contains no cause; the added observation must.
 const prior=JSON.parse(JSON.stringify({name:error.name,message:error.message,stack:error.stack}));assert.equal(prior.cause,undefined);
 const observation=nativeFamilyDurableHttpFailureObservation(error,context());
 assert.deepEqual(observation.error,{causes:[{name:'TypeError',code:null},{name:'SocketError',code:'UND_ERR_SOCKET'},{name:'Error',code:'ECONNRESET'}],causeTruncated:false});
 assert.equal(observation.method,'GET');assert.equal(observation.resource,'queue');assert.equal(observation.stage,'fetch');assert.equal(observation.requestCount,32);
 assert.deepEqual(observation.server,state());
});

test('recording before helper cleanup preserves the original error, cause and checkpoint',async()=>{
 const error=rejected(),cause=error.cause,keys=Reflect.ownKeys(error),server=state();let saved,recordings=0;
 await assert.rejects(async()=>{try{throw error;}catch(thrown){throw recordNativeFamilyDurableHttpFailure(thrown,{...context(),readServerState:()=>server},observation=>{recordings++;saved=observation;});}},received=>received===error);
 server.listening=false;server.closeObserved=true;server.port=null;
 assert.equal(recordings,1);assert.equal(error.cause,cause);assert.deepEqual(Reflect.ownKeys(error),keys);assert.equal(saved.server.listening,true);assert.equal(saved.server.closeObserved,false);assert.equal(saved.server.port,32123);
 assert.equal(Object.isFrozen(saved),true);assert.equal(Object.isFrozen(saved.server),true);assert.equal(Object.isFrozen(saved.error.causes[0]),true);
});

test('secret sentinel in URL, message, stack, headers, cookies, body, identity and arbitrary codes never enters the new record',()=>{
 const secret='PRIVATE-SENTINEL-DO-NOT-EXPORT',error=Object.assign(new TypeError(secret),{stack:secret,url:'https://'+secret,headers:{Authorization:secret},cookie:secret,body:secret,identity:secret,args:[secret],code:secret});
 error.cause={name:secret,code:secret,message:secret,stack:secret,socket:{localAddress:secret,remoteAddress:secret},cause:{name:'Error',code:'ECONNREFUSED',message:secret}};
 const observation=nativeFamilyDurableHttpFailureObservation(error,{...context(),url:secret,headers:secret,body:secret,key:secret,identity:secret,readServerState:()=>({...state(),address:secret,cookies:secret,error:secret})});
 const serialized=JSON.stringify(observation);assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes('https://'));assert.deepEqual(observation.error.causes,[{name:'TypeError',code:null},{name:null,code:null},{name:'Error',code:'ECONNREFUSED'}]);
 for(const key of ['message','stack','url','headers','cookie','body','identity','args','socket','address'])assert.ok(!serialized.includes('"'+key+'":'),key);
 const unknown=nativeFamilyDurableHttpFailureObservation(error,{method:secret,resource:secret,stage:secret,requestCount:secret,serverState:{listening:secret,addressLoopback:secret,port:secret,requestCount:secret,errorCount:secret,closeObserved:secret}});
 assert.ok(!JSON.stringify(unknown).includes(secret));assert.equal(unknown.method,null);assert.equal(unknown.resource,null);assert.equal(unknown.stage,null);assert.equal(unknown.requestCount,null);
});

test('depth, cycles, inherited data and invalid numeric values remain bounded without getters',()=>{
 let error=new Error('not exported');for(let i=0;i<8;i++)error=new TypeError('not exported',{cause:error});const deep=nativeFamilyDurableErrorObservation(error);assert.equal(deep.causes.length,4);assert.equal(deep.causeTruncated,true);
 const cycle=new Error('not exported');cycle.cause=cycle;assert.deepEqual(nativeFamilyDurableErrorObservation(cycle),{causes:[{name:'Error',code:null}],causeTruncated:true});
 let getters=0;const unsafe={get name(){getters++;throw new Error('private');},get code(){getters++;throw new Error('private');},get cause(){getters++;throw new Error('private');}};assert.deepEqual(nativeFamilyDurableErrorObservation(unsafe),{causes:[{name:null,code:null}],causeTruncated:false});assert.equal(getters,0);
 for(const port of [-1,0,65536,NaN,Infinity,'1234'])assert.equal(nativeFamilyDurableHttpFailureObservation(error,{serverState:{port}}).server.port,null);
 for(const requestCount of [-1,1.5,NaN,Infinity,'4'])assert.equal(nativeFamilyDurableHttpFailureObservation(error,{requestCount}).requestCount,null);
 assert.deepEqual(nativeFamilyDurableErrorObservation('private primitive'),{causes:[],causeTruncated:false});
});

test('diagnostic observer or state-reader failure never replaces, retries or mutates the rejection',()=>{
 const error=rejected();let reads=0,records=0;
 const returned=recordNativeFamilyDurableHttpFailure(error,{...context(),readServerState:()=>{reads++;throw new Error('private state-reader failure');}},observation=>{records++;assert.equal(observation.server.listening,null);throw new Error('private observer failure');});
 assert.equal(returned,error);assert.equal(reads,1);assert.equal(records,1);assert.equal(returned.cause.code,'UND_ERR_SOCKET');
});

test('source wiring captures inside the request catch and only adds a read-only canonical callback',()=>{
 // Read text only: never import either runner or any SQL builder.
 const runner=fs.readFileSync(new URL('../scripts/verify-native-family-self-durable.mjs',import.meta.url),'utf8'),http=fs.readFileSync(new URL('../scripts/verify-municipal-owner-adoption-decision.mjs',import.meta.url),'utf8');
 assert.match(runner,/catch\(error\)\{throw recordNativeFamilyDurableHttpFailure\(error,\{method,resource,stage,requestCount:httpRequestCount,readServerState:readHttpState\}/);
 assert.match(runner,/stack:error\.stack,http:httpFailure,checks/);
 assert.match(runner,/new AggregateError\(failures,'FAMILY195_DURABLE_FAILED',\{cause:primaryFailure\}\)/);
 assert.match(http,/await operation\('http:\/\/127\.0\.0\.1:'\+server\.address\(\)\.port,readHttpState\)/);
 assert.match(http,/finally\{server\.closeAllConnections\(\);await new Promise\(resolve=>server\.close\(resolve\)\);if\(server\.qaFailure\)throw server\.qaFailure;/);
 assert.doesNotMatch(http,/server\.on\('error'/,'observation must not consume the canonical error path');
 assert.match(http,/requestCount,errorCount:null,closeObserved/);
 const workflow=fs.readFileSync(new URL('../.github/workflows/native-family-self-durable.yml',import.meta.url),'utf8');
 assert.equal(workflow.split('tests/native-family-self-durable-http-observation.test.js').length,2,'new pure diagnostic regression executes once in each existing matrix cell');
 assert.equal(runner.split("'tests/native-family-self-durable-http-observation.test.js'").length,2,'source closure pins the same regression');
 const telemetry=fs.readFileSync(new URL('../scripts/lib/native-family-self-durable-http-observation.mjs',import.meta.url),'utf8');assert.doesNotMatch(telemetry,/^import\s/m);assert.doesNotMatch(telemetry,/\b(?:fetch|setTimeout|setInterval|AbortController|spawn|spawnSync)\s*\(/);
});
