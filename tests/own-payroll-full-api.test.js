import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createOwnRunHandler} from '../api/internal-own-payroll-run.js';
import {RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {capture,saved,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
class Response extends EventEmitter{
 constructor(){super();this.headers={};this.parts=[];this.destroyed=false;}
 setHeader(k,v){this.headers[k]=v;}status(n){this.statusCode=n;return this;}json(v){this.value=v;return this;}
 write(v){this.headersSent=true;this.parts.push(Buffer.from(v));return true;}end(){this.ended=true;}destroy(){this.destroyed=true;}
}
const request=()=>({method:'POST',url:'/api/internal-own-payroll-run',query:{},headers:{accept:OWN_RUN_FULL_JSON,origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'calculate',payload:runCommand()})});
function setup({caps=RUN_CALCULATE}={}){
 const calls=[],c=capture(),stats={connections:0};
 const handler=createOwnRunHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:caps}}}),sessionFor:()=>session,algorithmHash:()=>hash('c'),getSql:async()=>{stats.connections++;return{query:async(q,v)=>{calls.push({q,v});return[{result:calls.length===1?c:saved(c)}];}};}});
 return{handler,calls,stats};
}
test('explicit full JSON mode changes transport and completion facade, preserving the exact request and snapshot',async()=>{
 const a=setup(),res=new Response(),req=request();await a.handler(req,res);
 assert.equal(res.statusCode,201);assert.equal(res.ended,true);assert.equal(a.calls.length,2);assert.match(a.calls[1].q,/own_run_complete_full_v1/);
 assert.deepEqual(JSON.parse(a.calls[0].v[1]),runCommand());const wire=Buffer.concat(res.parts),packet=JSON.parse(wire.toString('utf8'));
 assert.equal(packet.ok,true);assert.equal(packet.data.saved.result.paymentExecuted,false);assert.equal(res.headers['X-MuniControl-JSON-Bytes'],String(wire.length));assert.ok(res.headers['Cache-Control'].includes('no-store'));
});
test('full JSON mode retains every authorization check before reading the body or selecting SQL',async()=>{
 for(const cap of RUN_CALCULATE){let reads=0;const a=setup({caps:RUN_CALCULATE.filter(c=>c!==cap)}),req=request(),res=new Response();
  Object.defineProperty(req,'body',{get(){reads++;throw Error('private body must not be read');}});await a.handler(req,res);
  assert.equal(res.statusCode,403,cap);assert.equal(reads,0);assert.equal(a.stats.connections,0);assert.equal(res.parts.length,0);
 }
});
test('unavailable streaming adapter rejects before creating a capture',async()=>{
 const a=setup(),res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.value=v;}};
 await a.handler(request(),res);assert.equal(res.statusCode,503);assert.equal(a.stats.connections,0);
});
test('ordinary JSON callers retain the existing completion facade and response shape',async()=>{
 const a=setup(),req=request(),res=new Response();req.headers.accept='application/json';await a.handler(req,res);
 assert.equal(res.statusCode,201);assert.match(a.calls[1].q,/own_run_complete_v1/);assert.equal(res.parts.length,0);assert.equal(res.value.ok,true);
});
test('a broken stream cannot append an error object after a partial success packet',async()=>{
 const a=setup(),res=new Response();res.write=()=>{res.headersSent=true;throw Error('synthetic interrupted connection');};await a.handler(request(),res);
 assert.equal(res.destroyed,true);assert.equal(res.value,undefined);
});
