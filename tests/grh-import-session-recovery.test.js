import test from 'node:test';
import assert from 'node:assert/strict';
import {panel} from './helpers/grh-import-panel-harness.js';
import {caps,id} from './fixtures/grh-import-synthetic.js';

const prepares=h=>h.requests.filter(r=>r.body&&JSON.parse(r.body).command==='grhPrepare');
const uncertain=async h=>{await h.review();h.state.badReceipt=true;await h.q('saveButton').onclick();assert.equal(h.f.state.writes,1);assert.match(h.q('writeMessage').textContent,/puede haberse guardado/);};
const withdrawn=h=>{assert.equal(h.q('previewPanel').hidden,true);assert.equal(h.q('rows').children.length,0);assert.equal(h.q('metrics').children.length,0);assert.equal(h.q('fileReference').textContent,'');assert.equal(h.q('file').value,'');assert.equal(h.q('downloadIncidents').disabled,true);assert.equal(h.q('saveButton').disabled,true);};

test('returning requires voluntary fresh access; no automatic query, save or old preview/report',async t=>{
 const h=await panel(t);await h.review();await h.download();assert.equal(h.urls.size,1);
 const before=h.requests.length;h.hide();withdrawn(h);assert.equal(h.urls.size,0);assert.equal(h.q('recheckAccess').disabled,true);
 await h.recheck();assert.equal(h.requests.length,before);h.show();assert.equal(h.requests.length,before);
 await h.recheck();assert.equal(h.requests.length,before+1);assert.equal(h.q('entryFields').disabled,false);assert.equal(h.q('accessRecovery').hidden,true);withdrawn(h);
 assert.equal(h.q('file').focused,true);assert.equal(h.f.state.writes,0);assert.match(h.q('progress').textContent,/Elegí nuevamente/);
 await h.download();assert.equal(h.downloads.length,1);assert.equal(h.requests.length,before+1);
});

for(const cap of caps)test('fresh recovery requires server capability '+cap+' even with a cached permissive gate',async t=>{
 const h=await panel(t);await h.review();h.hide();h.show();h.state.bootstrapCaps=caps.filter(c=>c!==cap);await h.recheck();
 withdrawn(h);assert.equal(h.q('intake').hidden,true);assert.equal(h.q('entryFields').disabled,true);assert.equal(h.q('accessRecovery').hidden,false);assert.equal(h.q('recheckAccess').disabled,false);assert.equal(prepares(h).length,0);
 h.state.bootstrapCaps=[...caps];await h.recheck();assert.equal(h.q('intake').hidden,false);assert.equal(h.q('entryFields').disabled,false);withdrawn(h);
});

test('server revocation can recover explicitly after access returns, with the previous preview retired',async t=>{
 const h=await panel(t);await h.review();h.state.deny=true;await h.download();withdrawn(h);assert.equal(h.q('intake').hidden,true);
 await h.recheck();assert.equal(h.q('intake').hidden,true);h.state.deny=false;await h.recheck();assert.equal(h.q('intake').hidden,false);withdrawn(h);assert.equal(h.f.state.writes,0);
});

for(const cause of ['visibility','pagehide','revocation'])test('uncertain save survives '+cause+' only as the exact voluntary retry in memory',async t=>{
 const h=await panel(t);await uncertain(h);const original=structuredClone(prepares(h)[0]);
 if(cause==='visibility'){h.hide();h.show();}
 if(cause==='pagehide')h.dispose();
 if(cause==='revocation')h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
 withdrawn(h);assert.equal(h.q('writeState').hidden,true);assert.equal(h.q('writeMessage').textContent,'');assert.equal(h.q('retryButton').disabled,true);
 await h.q('newButton').onclick();await h.q('clearButton').onclick();await h.q('saveButton').onclick();assert.equal(prepares(h).length,1);
 await h.recheck();assert.equal(prepares(h).length,1);assert.equal(h.q('entryFields').disabled,true);assert.equal(h.q('retryButton').disabled,false);assert.equal(h.q('retryButton').focused,true);
 assert.match(h.q('writeMessage').textContent,/Comprobar acceso no lo reenvía/);h.q('concept').value='638';h.q('concept').oninput();h.q('period').value='2026-09';h.q('period').oninput();
 await h.q('retryButton').onclick();assert.equal(prepares(h).length,2);assert.deepEqual(prepares(h)[1],original);assert.equal(h.f.state.writes,1);
 assert.match(h.q('writeMessage').textContent,/Se recuperó el recibo del mismo guardado/);assert.equal(h.q('savedBatchLink').href,'novedades-nomina.html?batchId='+id(900));
});

for(const field of ['tenantId','membershipId','binding'])test('pending retry cannot cross a changed '+field,async t=>{
 const h=await panel(t);await uncertain(h);const original=structuredClone(prepares(h)[0]);h.hide();h.show();const prior=h.state[field];h.state[field]=id(99);await h.recheck();
 assert.match(h.q('accessStatus').textContent,/otro ámbito/);assert.equal(h.q('retryButton').disabled,true);await h.q('retryButton').onclick();assert.equal(prepares(h).length,1);
 h.state[field]=prior;await h.recheck();await h.q('retryButton').onclick();assert.deepEqual(prepares(h)[1],original);assert.equal(h.f.state.writes,1);
});

test('revoked permission after recovery blocks resend and preserves the original attempt',async t=>{
 const h=await panel(t);await uncertain(h);h.hide();h.show();await h.recheck();h.state.bootstrapCaps=caps.filter(c=>c!=='workforce.employee.read');
 await h.q('retryButton').onclick();assert.equal(prepares(h).length,1);withdrawn(h);assert.equal(h.q('intake').hidden,true);
 h.state.bootstrapCaps=[...caps];await h.recheck();await h.q('retryButton').onclick();assert.deepEqual(prepares(h)[1],prepares(h)[0]);assert.equal(h.f.state.writes,1);
});

for(const cause of ['visibility','pagehide','revocation'])test('late recovery response cannot restore access after '+cause,async t=>{
 const h=await panel(t);await h.review();h.hide();h.show();const release=h.hold(),before=h.requests.length,recovery=h.recheck();
 assert.equal(h.q('recheckAccess').disabled,true);await h.recheck();assert.equal(h.requests.length,before+1);
 if(cause==='visibility')h.hide();if(cause==='pagehide')h.dispose();if(cause==='revocation')h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
 release();await recovery;withdrawn(h);assert.equal(h.q('entryFields').disabled,true);assert.equal(h.q('accessRecovery').hidden,false);assert.equal(prepares(h).length,0);
});

test('hiding after synthetic commit but before response does not erase the retry or expose a late receipt',async t=>{
 const h=await panel(t);await h.review();let release,started;const held=new Promise(resolve=>{release=resolve;}),committed=new Promise(resolve=>{started=resolve;});
 h.state.afterWrite=async()=>{started();await held;};const saving=h.q('saveButton').onclick();await committed;assert.equal(h.f.state.writes,1);
 h.hide();h.show();h.state.afterWrite=null;release();await saving;withdrawn(h);assert.equal(h.q('savedBatchLink').href,undefined);assert.equal(h.q('writeMessage').textContent,'');
 await h.recheck();assert.equal(prepares(h).length,1);await h.q('retryButton').onclick();assert.equal(h.f.state.writes,1);assert.deepEqual(prepares(h)[1],prepares(h)[0]);assert.match(h.q('writeMessage').textContent,/Se recuperó el recibo/);
});

for(const status of [409,422])test('HTTP '+status+' on a later uncertain retry never releases its original body/key',async t=>{
 const h=await panel(t);await uncertain(h);h.hide();h.show();await h.recheck();h.state.writeFailure=status;await h.q('retryButton').onclick();
 assert.equal(h.q('entryFields').disabled,true);assert.equal(h.q('retryButton').hidden,false);assert.equal(h.q('newButton').hidden,true);
 h.state.writeFailure=0;await h.q('retryButton').onclick();assert.equal(prepares(h).length,3);for(const attempt of prepares(h))assert.deepEqual(attempt,prepares(h)[0]);assert.equal(h.f.state.writes,1);
});

test('an initial deterministic rejection allows only a new complete review, not an old save',async t=>{
 const h=await panel(t);await h.review();h.state.writeFailure=409;await h.q('saveButton').onclick();assert.equal(h.f.state.writes,0);assert.equal(h.q('entryFields').disabled,false);assert.equal(h.q('saveButton').disabled,true);
 h.state.writeFailure=0;await h.q('retryButton').onclick();assert.equal(prepares(h).length,1);await h.review();await h.q('saveButton').onclick();assert.equal(h.f.state.writes,1);assert.notEqual(prepares(h)[0].headers['Idempotency-Key'],prepares(h)[1].headers['Idempotency-Key']);
});

for(const cause of ['hidden','revoked'])test('late initial authorization cannot override '+cause+' retirement or a later recovery',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const h=await panel(t,12,{deferredMount:true,gate});
 if(cause==='hidden'){h.hide();h.show();}else h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
 await h.recheck();assert.equal(h.q('entryFields').disabled,false);const before=h.requests.length;release({tenantCapabilities:[...caps]});await h.mounted;
 assert.equal(h.requests.length,before);assert.equal(h.q('entryFields').disabled,false);assert.equal(h.q('accessRecovery').hidden,true);assert.equal(prepares(h).length,0);
});

test('an unreachable bootstrap keeps access blocked and permits a voluntary retry without writing',async t=>{
 const h=await panel(t);h.hide();h.show();h.state.bootstrapFailure=true;await h.recheck();assert.equal(h.q('intake').hidden,true);assert.equal(h.q('recheckAccess').disabled,false);assert.equal(h.q('entryFields').disabled,true);
 h.state.bootstrapFailure=false;await h.recheck();assert.equal(h.q('entryFields').disabled,false);assert.equal(prepares(h).length,0);
});

for(const response of ['success','denial'])test('late initial bootstrap '+response+' does not replace an explicitly recovered session',async t=>{
 let release,started;const hold=new Promise(resolve=>{release=resolve;}),bootstrapStarted=new Promise(resolve=>{started=resolve;});const h=await panel(t,12,{deferredMount:true,state:{hold},onBootstrap:started});await bootstrapStarted;assert.equal(h.requests.length,1);
 h.hide();h.show();h.state.hold=null;await h.recheck();assert.equal(h.q('entryFields').disabled,false);
 h.state.deny=response==='denial';release();await h.mounted;assert.equal(h.q('entryFields').disabled,false);assert.equal(h.q('accessRecovery').hidden,true);assert.equal(prepares(h).length,0);
});
