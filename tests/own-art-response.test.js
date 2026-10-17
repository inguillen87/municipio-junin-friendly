import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import {sendOwnArtSource} from '../lib/own-art-response.js';
import {OWN_ART_MAX_BYTES} from '../assets/own-art-report-model.js';
import {closeQaHttpServer} from '../scripts/lib/qa-http-server-close.mjs';

const ART_QA_HOST='127.0.0.1',ART_QA_MIN_PORT=49152,ART_QA_PORT_SPAN=65536-ART_QA_MIN_PORT;
function listenArtQa(server,port){
 return new Promise((resolve,reject)=>{
  const clean=()=>{server.off('listening',ready);server.off('error',failed);};
  const ready=()=>{clean();resolve();},failed=error=>{clean();reject(error);};
  server.once('listening',ready);server.once('error',failed);
  try{server.listen(port,ART_QA_HOST);}catch(error){failed(error);}
 });
}
function artQaAddress(server,expectedPort=null){
 const address=server.address();assert.equal(address?.address,ART_QA_HOST,'ART_QA_LOOPBACK_REQUIRED');assert.ok(address.family==='IPv4'||address.family===4,'ART_QA_IPV4_REQUIRED');assert.ok(Number.isInteger(address.port)&&address.port>0&&address.port<=65535,'ART_QA_PORT_INVALID');if(expectedPort!==null)assert.equal(address.port,expectedPort,'ART_QA_PORT_CHANGED');return address;
}
// This test owns one actual HTTP server. Never send fetch to a low/forbidden
// port: release that allocation first, then make one deterministic high-range
// allocation on the same server. A collision is a test failure, never a retry.
async function withArtQaLoopback(server,work){
 let failure;
 try{
  await listenArtQa(server,0);let address=artQaAddress(server);
  if(address.port<ART_QA_MIN_PORT){const port=ART_QA_MIN_PORT+address.port%ART_QA_PORT_SPAN;await closeQaHttpServer(server);await listenArtQa(server,port);address=artQaAddress(server,port);}
  assert.ok(address.port>=ART_QA_MIN_PORT,'ART_QA_HIGH_PORT_REQUIRED');return await work('http://'+ART_QA_HOST+':'+address.port);
 }catch(error){failure=error;throw error;}
 finally{try{await closeQaHttpServer(server);}catch(error){if(failure)failure.cleanupError=error;else throw error;}}
}

test('complete ART responses beyond the buffered platform limit stream through an actual loopback HTTP socket without row pagination',async()=>{
 const data={syntheticOnly:true,rows:Array.from({length:900},(_,i)=>({ordinal:i+1,syntheticTrace:'á'.repeat(3100)}))},expected=Buffer.from(JSON.stringify({ok:true,data}));assert.ok(expected.length>4.5*1024*1024);
 const server=createServer(async(_req,res)=>{res.setHeader('Cache-Control','private, no-store');try{await sendOwnArtSource(res,data);}catch{res.destroy();}});
 await withArtQaLoopback(server,async origin=>{const response=await fetch(origin);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('transfer-encoding'),'chunked');assert.equal(response.headers.get('content-length'),null);assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);});
});

test('ART response waits for backpressure and removes listeners after every drain',async()=>{
 const response=new EventEmitter(),parts=[];response.setHeader=()=>{};response.write=b=>{parts.push(b);queueMicrotask(()=>response.emit('drain'));return false;};response.end=()=>{response.ended=true;};
 const data={syntheticOnly:true,text:'x'.repeat(140000)};await sendOwnArtSource(response,data);assert.equal(parts.length,3);assert.equal(response.ended,true);assert.deepEqual(JSON.parse(Buffer.concat(parts)),{ok:true,data});for(const name of['drain','close','error'])assert.equal(response.listenerCount(name),0);
});

test('an over-capacity complete ART response fails before sending any header or byte; no partial population is returned',async()=>{
 let touched=false;const response={setHeader(){touched=true;},write(){touched=true;},end(){touched=true;}};
 await assert.rejects(()=>sendOwnArtSource(response,{syntheticOnly:true,text:'x'.repeat(OWN_ART_MAX_BYTES)}),/OWN_ART_LIMIT/);assert.equal(touched,false);
});

test('a disconnected ART socket terminates instead of leaving a drain wait or sending an incomplete JSON success',async()=>{
 const response=new EventEmitter();response.setHeader=()=>{};response.write=()=>{queueMicrotask(()=>response.emit('close'));return false;};response.end=()=>assert.fail('must not acknowledge an incomplete response');
 await assert.rejects(()=>sendOwnArtSource(response,{syntheticOnly:true}),/OWN_ART_STREAM_CLOSED/);for(const name of['drain','close','error'])assert.equal(response.listenerCount(name),0);
});

// Assignment/error doubles cover lifecycle decisions without reserving a fixed
// public test port. The complete-population test above retains real HTTP/fetch.
class ArtQaServerDouble extends EventEmitter{
 constructor(assignments,{closeError=null}={}){super();this.assignments=assignments;this.closeError=closeError;this.calls=[];this.listening=false;this.closes=0;this.connectionCloses=0;}
 listen(port,host){this.calls.push({port,host});const assigned=this.assignments[this.calls.length-1]??port;queueMicrotask(()=>{if(assigned instanceof Error){this.emit('error',assigned);return;}this.port=assigned;this.host=host;this.listening=true;this.emit('listening');});return this;}
 address(){return this.listening?{address:this.host,family:'IPv4',port:this.port}:null;}
 close(done){this.closes++;this.listening=false;queueMicrotask(()=>done(this.closeError));}
 closeAllConnections(){this.connectionCloses++;}
}
const assertArtQaClosed=(server,count)=>{assert.equal(server.listening,false);assert.equal(server.closes,count);assert.equal(server.connectionCloses,count);for(const name of['listening','error'])assert.equal(server.listenerCount(name),0);};

test('ART QA keeps an allowed high allocation and closes the owned server',async()=>{
 const server=new ArtQaServerDouble([55000]);assert.equal(await withArtQaLoopback(server,async origin=>origin),'http://127.0.0.1:55000');assert.deepEqual(server.calls,[{port:0,host:ART_QA_HOST}]);assertArtQaClosed(server,1);
});
test('ART QA closes a forbidden allocation before one deterministic permitted allocation',async()=>{
 const server=new ArtQaServerDouble([6000]);const origin=await withArtQaLoopback(server,async value=>{assert.equal(server.closes,1);assert.equal(server.connectionCloses,1);return value;});assert.equal(origin,'http://127.0.0.1:55152');assert.deepEqual(server.calls,[{port:0,host:ART_QA_HOST},{port:55152,host:ART_QA_HOST}]);assertArtQaClosed(server,2);
});
test('ART QA preserves allocation failure and closes without any random retry',async()=>{
 const failure=Object.assign(Error('synthetic permitted-port collision'),{code:'EADDRINUSE'}),server=new ArtQaServerDouble([6000,failure]);let called=false;await assert.rejects(()=>withArtQaLoopback(server,async()=>{called=true;}),error=>error===failure);assert.equal(called,false);assert.equal(server.calls.length,2);assertArtQaClosed(server,2);
});
test('ART QA closes the first failed listen and removes its temporary listeners',async()=>{
 const failure=Object.assign(Error('synthetic listen denial'),{code:'EACCES'}),server=new ArtQaServerDouble([failure]);await assert.rejects(()=>withArtQaLoopback(server,async()=>assert.fail('no work before listening')),error=>error===failure);assert.equal(server.calls.length,1);assertArtQaClosed(server,1);
});
test('ART QA preserves the primary failure and reports cleanup failure separately',async()=>{
 const primary=new TypeError('synthetic fetch failure',{cause:Error('synthetic bad port')}),cleanup=Error('synthetic close failure'),server=new ArtQaServerDouble([55000],{closeError:cleanup});await assert.rejects(()=>withArtQaLoopback(server,async()=>{throw primary;}),error=>error===primary&&error.cleanupError===cleanup&&error.cause.message==='synthetic bad port');assertArtQaClosed(server,1);
});
