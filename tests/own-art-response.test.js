import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import {sendOwnArtSource} from '../lib/own-art-response.js';
import {OWN_ART_MAX_BYTES} from '../assets/own-art-report-model.js';
test('complete ART responses beyond the buffered platform limit stream through an actual loopback HTTP socket without row pagination',async()=>{
 const data={syntheticOnly:true,rows:Array.from({length:900},(_,i)=>({ordinal:i+1,syntheticTrace:'á'.repeat(3100)}))},expected=Buffer.from(JSON.stringify({ok:true,data}));assert.ok(expected.length>4.5*1024*1024);
 const server=createServer(async(_req,res)=>{res.setHeader('Cache-Control','private, no-store');try{await sendOwnArtSource(res,data);}catch{res.destroy();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('transfer-encoding'),'chunked');assert.equal(response.headers.get('content-length'),null);assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);}
 finally{await new Promise(resolve=>server.close(resolve));}
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
