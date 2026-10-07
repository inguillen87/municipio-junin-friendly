import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {closeQaHttpServer} from '../scripts/lib/qa-http-server-close.mjs';

test('an unfinished owned HTTP response reproduces the old shutdown stall; explicit cleanup terminates it',async()=>{
 let response;
 const server=http.createServer((_request,res)=>{res.writeHead(200);res.write('synthetic pending response');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const request=http.get('http://127.0.0.1:'+server.address().port, res=>{response=res;res.on('error',()=>{});res.resume();});request.on('error',()=>{});
 try {
  await once(request,'response');let closed=false;
  server.close(()=>{closed=true;});
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(closed,false,'old cleanup must still be waiting for the unfinished response');
  const pending=closeQaHttpServer(server);await pending;
  assert.equal(closed,true);assert.equal(server.listening,false);
 }finally{request.destroy();response?.destroy();server.closeAllConnections();}
});
test('cleanup preserves a completed synthetic response and accepts no server',async()=>{
 const server=http.createServer((_request,res)=>res.end('completed synthetic result'));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const bytes=await new Promise((resolve,reject)=>{http.get('http://127.0.0.1:'+server.address().port,res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve(body));res.on('error',reject);}).on('error',reject);});
 await closeQaHttpServer(server);await closeQaHttpServer(undefined);
 assert.equal(bytes,'completed synthetic result');assert.equal(server.listening,false);
});
