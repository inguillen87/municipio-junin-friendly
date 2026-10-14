import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {OWN_RUN_FULL_JSON,readOwnPayrollResponse} from '../assets/own-payroll-response.js';
import {sendOwnPayrollStream} from '../lib/own-payroll-response.js';

function response(bytes,{announced=bytes.length,breakAt=[],limit}={}){
 const boundaries=[0,...breakAt,bytes.length];let i=0,cancelled=false;
 const body=new ReadableStream({pull(c){if(i===boundaries.length-1){c.close();return;}c.enqueue(bytes.subarray(boundaries[i],boundaries[++i]));},cancel(){cancelled=true;}});
 return {body,headers:new Headers({'x-municontrol-json-bytes':String(announced)}),cancelled:()=>cancelled,limit};
}
test('complete bounded reader preserves exact codes, false, null and UTF8 across byte boundaries',async()=>{
 const value={code:'0056',boolean:false,missing:null,reference:'Constancia sintética áéñ'},bytes=new TextEncoder().encode(JSON.stringify(value));
 const res=response(bytes,{breakAt:Array.from({length:bytes.length-1},(_,i)=>i+1)});
 assert.deepEqual(await readOwnPayrollResponse(res,{maxBytes:1024}),value);
});
test('bounded reader refuses a truncated response even if its remaining JSON is syntactically valid',async()=>{
 const bytes=new TextEncoder().encode('{"ok":true}'),res=response(bytes,{announced:bytes.length+1});
 await assert.rejects(()=>readOwnPayrollResponse(res,{maxBytes:1024}),/incompleta/);
});
test('bounded reader stops over-limit data instead of returning a prefix',async()=>{
 const res=response(new TextEncoder().encode('{"data":"'+ 'x'.repeat(5000)+'"}'),{breakAt:[20,200,1000]});
 await assert.rejects(()=>readOwnPayrollResponse(res,{maxBytes:100}),/capacidad/);
 assert.equal(res.cancelled(),true);
});
test('malformed UTF8 and unfinished JSON cannot become a partial result',async()=>{
 for(const bytes of[new Uint8Array([123,34,255,34,125]),new TextEncoder().encode('{"rows":[')])
  await assert.rejects(()=>readOwnPayrollResponse(response(bytes),{maxBytes:1024}));
});
test('an aborted private read returns no data',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>readOwnPayrollResponse(response(new TextEncoder().encode('{}')),{maxBytes:1024,signal:controller.signal}),{name:'AbortError'});
});
class Sink extends EventEmitter{
 constructor(){super();this.headers={};this.parts=[];this.destroyed=false;}
 status(n){this.statusCode=n;return this;}setHeader(k,v){this.headers[k]=v;}
 write(b){this.parts.push(Buffer.from(b));if(this.parts.length%2===1){queueMicrotask(()=>this.emit('drain'));return false;}return true;}
 end(){this.ended=true;}
}
test('stream writer sends one complete unchanged packet with backpressure and no Content-Length',async()=>{
 const sink=new Sink(),data={syntheticOnly:true,rows:Array.from({length:855},(_,i)=>({row:i+1,code:'0056',value:false,evidence:'á'.repeat(100)}))};
 await sendOwnPayrollStream(sink,201,data);assert.equal(sink.statusCode,201);assert.ok(sink.parts.length>1);assert.equal(sink.ended,true);
 const wire=Buffer.concat(sink.parts);assert.deepEqual(JSON.parse(wire.toString('utf8')),{ok:true,data});
 assert.equal(sink.headers['X-MuniControl-JSON-Bytes'],String(wire.length));assert.equal(sink.headers['Content-Type'],OWN_RUN_FULL_JSON+'; charset=utf-8');
 assert.equal(Object.hasOwn(sink.headers,'Content-Length'),false);for(const e of['drain','error','close'])assert.equal(sink.listenerCount(e),0);
});
test('client closure during backpressure ends the write without a hung waiter',async()=>{
 const sink=new Sink();sink.write=()=>{queueMicrotask(()=>{sink.destroyed=true;sink.emit('close');});return false;};
 await assert.rejects(()=>sendOwnPayrollStream(sink,200,{synthetic:true}),/OWN_RUN_UNAVAILABLE/);
 for(const e of['drain','error','close'])assert.equal(sink.listenerCount(e),0);
});
