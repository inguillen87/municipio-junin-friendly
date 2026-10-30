import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,sha,otherSha} from './helpers/position-client-ui-harness.js';

test('final hash cannot download after visibility, access, logout, pagehide, dispose, query or detach retirement',async t=>{
 for(const cause of ['hidden','revoked','logout','pagehide','disposed','query','detached']){
  const h=harness(t);await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire(cause);h.release();await exporting;
  assert.equal(h.blobCount,0,cause+' prevents Blob construction');assert.equal(h.urls.length,0,cause);assert.equal(h.downloads.length,0,cause);
 }
});
test('an old differing final hash cannot invalidate a newer verified query',async t=>{
 const h=harness(t);await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire('query');await h.submit(2027);const current=h.q('status').textContent;assert.equal(h.q('content').hidden,false);h.release(otherSha);await exporting;
 assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,current);assert.match(h.q('source').textContent,/2027/);assert.equal(h.urls.length,0);assert.equal(h.downloads.length,0);
});
test('PDF Excel and CSV still download the complete captured scope with a current query',async t=>{
 for(const holdCall of [2,3])for(const format of ['pdf','xlsx','csv']){
  const h=harness(t,{holdCall});await h.submit();h.q('active').value='yes';h.q('view').value='detailed';h.q('search').value='view-only';const exporting=h.start(format);await h.waitHash();h.release();await exporting;
  assert.equal(h.blobCount,1);assert.equal(h.urls.length,1);assert.equal(h.downloads.length,1);assert.deepEqual(h.rendered,[{format,rows:60,filename:'synthetic-2026-10-yes-detailed'}]);assert.equal(h.downloads[0].filename,'synthetic-2026-10-yes-detailed.'+format);assert.ok(h.requests.every(r=>r.method==='GET'));
 }
});
test('a current differing final hash withdraws the report without producing a download',async t=>{
 const h=harness(t);await h.submit();const exporting=h.start('pdf');await h.waitHash();h.release(otherSha);await exporting;assert.equal(h.q('content').hidden,true);assert.match(h.q('status').textContent,/Cambió el cierre/);assert.equal(h.blobCount,0);assert.equal(h.downloads.length,0);
});
test('an old differing first export hash cannot invalidate a newer verified query',async t=>{
 const h=harness(t,{holdCall:2});await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire('query');await h.submit(2027);const current=h.q('status').textContent;h.release(otherSha);await exporting;
 assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,current);assert.match(h.q('source').textContent,/2027/);assert.equal(h.rendered.length,0);assert.equal(h.urls.length,0);assert.equal(h.downloads.length,0);
});
test('retirement during the first export hash cannot render, request detail or restore access',async t=>{
 for(const cause of ['logout','hidden','pagehide','revoked','query','disposed']){
  const h=harness(t,{holdCall:2});await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire(cause);const sent=h.requests.length;assert.equal(h.accessKey,undefined);h.release();await exporting;
  assert.deepEqual({additionalRequests:h.requests.length-sent,renders:h.rendered.length,accessKey:h.accessKey,blobs:h.blobCount,downloads:h.downloads.length},{additionalRequests:0,renders:0,accessKey:undefined,blobs:0,downloads:0},cause+' stops before every stale effect');
 }
});
for(const holdVerificationCall of [2,3])test('retirement during asynchronous export verification '+holdVerificationCall+' fences the next hash or session request',async t=>{
  const h=harness(t,{holdCall:0,holdVerificationCall});await h.submit();const exporting=h.start('pdf');await h.waitVerification();h.retire('logout');const sent=h.requests.length,rendered=h.rendered.length,hashed=h.hashCalls;h.releaseVerification();await exporting;
  assert.deepEqual({additionalRequests:h.requests.length-sent,renders:h.rendered.length-rendered,hashes:h.hashCalls-hashed,accessKey:h.accessKey,blobs:h.blobCount,downloads:h.downloads.length},{additionalRequests:0,renders:0,hashes:0,accessKey:undefined,blobs:0,downloads:0},'read verification '+holdVerificationCall+' is withdrawn before further work');
});
test('a current differing first export hash withdraws the source before rendering',async t=>{
 const h=harness(t,{holdCall:2});await h.submit();const exporting=h.start('pdf');await h.waitHash();h.release(otherSha);await exporting;assert.equal(h.q('content').hidden,true);assert.match(h.q('status').textContent,/Cambió el cierre o la fuente/);assert.equal(h.rendered.length,0);assert.equal(h.blobCount,0);assert.equal(h.downloads.length,0);
});
test('an export waiting for its initial session cannot read a newer query after retirement',async t=>{
 const h=harness(t,{holdCall:0,holdSessionCall:3});await h.submit();const exporting=h.start('pdf');await h.waitSession();h.retire('query');await h.submit(2027);const sent=h.requests.length,current=h.q('status').textContent;h.releaseSession();await exporting;
 assert.equal(h.requests.length,sent);assert.equal(h.rendered.length,0);assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,current);assert.match(h.q('source').textContent,/2027/);assert.equal(h.blobCount,0);
});
