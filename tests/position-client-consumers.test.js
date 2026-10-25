import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/position-client-ui-harness.js';
const authority=['comparison.synthetic.read','synthetic.prepare','synthetic.approve'];
const captureAuthority=['comparison.synthetic.read','payroll.calculation.read'];
const assignment=(t,options={})=>harness(t,{mode:'assignment',holdCall:0,initialCaps:authority,...options});
async function pending(h){
 await h.submit();h.q('reason').value='Synthetic complete proposal reason';
 const sending=h.submitProposal();await h.waitPost(1);const attempt=h.attempt();assert.ok(attempt);assert.ok(Object.isFrozen(attempt));h.retire('hidden');h.releasePost(1);await sending;h.show();return attempt;
}
test('an uncertain assignment retains its exact attempt and recovers by GET without another POST',async t=>{
 const h=assignment(t,{holdPostCalls:[1]}),attempt=await pending(h),body=JSON.stringify(attempt.body);assert.equal(h.accessKey,undefined);assert.equal(h.attempt(),attempt);await h.start('recover');
 assert.equal(h.attempt(),null);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);const recovery=h.requests.find(r=>r.url.includes('resource=attempt'));assert.equal(new URL(recovery.url,'https://synthetic.invalid').searchParams.get('key'),attempt.key);assert.deepEqual(h.receiptChecks,[{key:attempt.key,body}]);assert.equal(h.q('content').hidden,false);
});
test('a retry whose initial session was retired cannot issue a POST; a current retry keeps key and body',async t=>{
 const h=assignment(t,{holdPostCalls:[1],holdSessionCalls:[4]}),attempt=await pending(h),originalPost=h.requests.find(r=>r.method==='POST'),retry=h.start('retry');await h.waitSession(4);h.retire('logout');const sent=h.requests.length;h.releaseSession(4);await retry;
 assert.equal(h.requests.length,sent);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);assert.equal(h.attempt(),attempt);assert.equal(h.accessKey,undefined);await h.start('retry');
 const posts=h.requests.filter(r=>r.method==='POST');assert.equal(posts.length,2);assert.equal(posts[1].key,originalPost.key);assert.equal(posts[1].body,originalPost.body);assert.equal(h.attempt(),null);
});
test('a different owner cannot recover or replace the original pending assignment',async t=>{
 const h=assignment(t,{holdPostCalls:[1]}),attempt=await pending(h),sent=h.requests.length;h.setOwner('other-owner');await h.start('recover');
 assert.equal(h.attempt(),attempt);assert.equal(h.requests.length,sent+1);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);assert.equal(h.accessKey,undefined);assert.match(h.q('status').textContent,/Cambió la cuenta/);
});
test('a late receipt verifier cannot consume or clear a newer pending assignment',async t=>{
 const h=assignment(t,{holdReceiptCall:1,holdPostCalls:[2]});await h.submit();h.q('reason').value='Synthetic first proposal';const a=h.submitProposal();await h.waitReceipt(1);const attemptA=h.attempt();h.retire('hidden');h.show();await h.start('recover');assert.equal(h.attempt(),null);
 h.q('reason').value='Synthetic second proposal';const b=h.submitProposal();await h.waitPost(2);const attemptB=h.attempt(),sent=h.requests.length;assert.notEqual(attemptA.key,attemptB.key);h.releaseReceipt(1);await a;
 assert.equal(h.attempt(),attemptB);assert.equal(h.requests.length,sent);h.releasePost(2);await b;assert.equal(h.attempt(),null);
});
test('another mounted view cannot overwrite the pending attempt created while its preflight waited',async t=>{
 const h=assignment(t,{holdBootstrapCalls:[2],holdPostCalls:[1]});await h.submit();h.q('reason').value='Synthetic proposal from A';const a=h.submitProposal();await h.waitBootstrap(2);
 const second=h.mountAnotherAssignment();second.q('year').value='2026';second.q('query').fire('submit');await h.lastTask();second.q('reason').value='Synthetic proposal from B';second.q('form').fire('submit');const b=h.lastTask();await h.waitPost(1);const attemptB=h.attempt();h.releaseBootstrap(2);await a;
 assert.equal(h.attempt(),attemptB);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);h.releasePost(1);await b;assert.equal(h.attempt(),null);
});
test('a retired capture-opening session cannot replace the newer capture or trigger extra reads',async t=>{
 const h=harness(t,{mode:'capture',holdCall:0,holdSessionCalls:[1],initialCaps:captureAuthority});h.mounted.setCapture({id:'capture-a'});const a=h.start('open');await h.waitSession(1);h.mounted.setCapture({id:'capture-b'});await h.start('open');const sent=h.requests.length,status=h.q('status').textContent;h.releaseSession(1);await a;
 assert.deepEqual(h.captureChecks,['capture-b']);assert.equal(h.requests.length,sent);assert.equal(h.q('status').textContent,status);assert.equal(h.q('content').hidden,false);assert.equal(h.q('rows').children[0].children[0].textContent,'202');
});
test('current captured-position CSV remains a voluntary complete download',async t=>{
 const h=harness(t,{mode:'capture',holdCall:0,initialCaps:captureAuthority});h.mounted.setCapture({id:'capture-b'});await h.start('open');h.q('search').value='view-only';await h.start('csv');
 assert.equal(h.blobCount,1);assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].filename,'cargos-capturados-2026-10-monthly.csv');assert.deepEqual(h.rendered,[{format:'capture-csv'}]);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
