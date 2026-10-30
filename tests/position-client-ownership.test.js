import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/position-client-ui-harness.js';

test('late initial session cannot enter query work or erase a newer verified result',async t=>{
 const h=harness(t,{holdCall:0,holdSessionCalls:[1]}),a=h.startQuery();await h.waitSession(1);h.retire('query');await h.submit(2027);const sent=h.requests.length,status=h.q('status').textContent,hashes=h.hashCalls,interpreted=h.authBodies.length;h.releaseSession(1);await a;
 assert.equal(h.q('content').hidden,false);assert.match(h.q('source').textContent,/2027/);assert.equal(h.q('status').textContent,status);assert.equal(h.requests.length,sent);assert.equal(h.hashCalls,hashes);assert.equal(h.authBodies.length,interpreted);
});
test('a retired session JSON body is never interpreted or adopted',async t=>{
 for(const cause of ['logout','hidden','pagehide','revoked','disposed']){
  const h=harness(t,{holdCall:0,holdSessionJsonCalls:[1]}),a=h.startQuery();await h.waitSessionJson(1);h.retire(cause);const sent=h.requests.length,status=h.q('status').textContent;h.releaseSessionJson(1);await a;
  assert.equal(h.accessKey,undefined,cause);assert.equal(h.authBodies.length,0,cause);assert.equal(h.requests.length,sent,cause);assert.equal(h.q('content').hidden,true,cause);assert.equal(h.q('status').textContent,status,cause);
 }
});
test('a late detail body cannot reach domain verification, hashing or another session',async t=>{
 const h=harness(t,{holdCall:0,holdDetailTextCall:1}),a=h.startQuery();await h.waitDetail(1);h.retire('query');await h.submit(2027);const sent=h.requests.length,verified=h.verificationCalls,hashed=h.hashCalls,status=h.q('status').textContent;h.releaseDetail(1);await a;
 assert.equal(h.requests.length,sent);assert.equal(h.verificationCalls,verified);assert.equal(h.hashCalls,hashed);assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,status);
});
test('an older pending owner cannot reject the new owner whose session is also pending',async t=>{
 const h=harness(t,{holdCall:0,holdSessionCalls:[1,2]}),a=h.startQuery();await h.waitSession(1);h.retire('logout');h.setOwner('other-owner');const b=h.startQuery(2027);await h.waitSession(2);h.releaseSession(1);await a;h.releaseSession(2);await b;
 assert.equal(h.accessKey,'other-owner');assert.equal(h.q('content').hidden,false);assert.match(h.q('source').textContent,/2027/);assert.match(h.q('status').textContent,/Comparación completa verificada/);
});
test('same-owner authority from an older session cannot replace newer capabilities',async t=>{
 const h=harness(t,{holdCall:0,holdSessionCalls:[1],initialCaps:['comparison.synthetic.read','synthetic.extra']}),a=h.run(async()=>{});await h.waitSession(1);h.retire('query');h.setCaps(['comparison.synthetic.read']);await h.run(async()=>{});h.releaseSession(1);await a;
 assert.equal(h.has(['synthetic.extra']),false);assert.equal(h.accessKey,'synthetic-owner');assert.equal(h.authBodies.length,1);
});
test('a finished operation cannot emit another request',async t=>{
 const h=harness(t,{holdCall:0});await h.run(async()=>{});const sent=h.requests.length;
 await assert.rejects(h.operation.request({resource:'detail-v2',year:'2026',period:'2026-10',revision:'1',liquidationType:'monthly'}));assert.equal(h.requests.length,sent);
});
test('a retired operation cannot borrow the controller of an active operation to POST',async t=>{
 const h=harness(t,{holdCall:0});let releaseA,releaseB,startedA,startedB;const readyA=new Promise(resolve=>{startedA=resolve;}),readyB=new Promise(resolve=>{startedB=resolve;});
 const a=h.run(async op=>{startedA();await new Promise(resolve=>{releaseA=resolve;});await op.request(null,{synthetic:'body-a'},'key-a');});await readyA;h.retire('query');
 const b=h.run(async()=>{startedB();await new Promise(resolve=>{releaseB=resolve;});});await readyB;
 try{releaseA();await a;assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.equal(h.busy,true);assert.equal(h.accessKey,'synthetic-owner');}
 finally{releaseA?.();releaseB?.();await Promise.allSettled([a,b]);}
});
test('timeout invalidates a session even when the synthetic transport ignores abort',async t=>{
 const h=harness(t,{holdCall:0,holdSessionCalls:[1],manualTimers:true}),a=h.startQuery();await h.waitSession(1);h.fireDeadline();assert.equal(h.requests[0].signal.aborted,true);h.releaseSession(1);await a;
 assert.equal(h.accessKey,undefined);assert.equal(h.requests.length,1);assert.equal(h.q('content').hidden,true);assert.equal(h.busy,false);assert.match(h.q('status').textContent,/No se confirmó la respuesta/);
});
test('a current owner change still withdraws the result and requires the original account',async t=>{
 const h=harness(t,{holdCall:0});await h.submit();h.setOwner('other-owner');await h.submit(2027);assert.equal(h.accessKey,undefined);assert.equal(h.q('content').hidden,true);assert.equal(h.busy,false);assert.match(h.q('status').textContent,/Cambió la cuenta/);
});
test('current authentication and detail failures retain their existing withdrawal behavior',async t=>{
 for(const [resource,status]of [['auth',403],['detail-v2',404]]){
  const h=harness(t,{holdCall:0});h.fail(resource,status);await h.submit();assert.equal(h.accessKey,undefined);assert.equal(h.q('content').hidden,true);assert.equal(h.busy,false);assert.match(h.q('status').textContent,resource==='auth'?/La sesión no está disponible/:/Synthetic current failure/);
 }
});
test('timeout during a local hash reports the current timeout instead of finishing silently',async t=>{
 const h=harness(t,{holdCall:2,manualTimers:true});await h.submit();const exporting=h.start('pdf');await h.waitHash();const sent=h.requests.length;h.fireDeadline();h.release();await exporting;
 assert.equal(h.requests.length,sent);assert.equal(h.blobCount,0);assert.equal(h.downloads.length,0);assert.equal(h.busy,false);assert.match(h.q('status').textContent,/No se confirmó la respuesta/);
});
