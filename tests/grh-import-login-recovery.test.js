import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {panel} from './helpers/grh-import-panel-harness.js';

const prepares=h=>h.requests.filter(r=>r.body&&JSON.parse(r.body).command==='grhPrepare');

test('expired initial session offers a manual login without opening or sending anything',async t=>{
 const h=await panel(t,12,{state:{bootstrapStatus:401}});
 assert.equal(h.q('accessLogin').hidden,false);
 assert.match(h.q('accessRecoveryHelp').textContent,/otra pestaña/);
 assert.match(h.q('accessRecoveryHelp').textContent,/Comprobar acceso/);
 assert.equal(h.q('intake').hidden,true);
 assert.equal(h.q('entryFields').disabled,true);
 assert.equal(h.requests.length,1);
 assert.equal(prepares(h).length,0);
 assert.equal(h.f.state.writes,0);
});

test('expiry while downloading retires the full preview and offers login without a download',async t=>{
 const h=await panel(t);await h.review();h.state.bootstrapStatus=401;await h.download();
 assert.equal(h.q('accessLogin').hidden,false);
 assert.equal(h.q('previewPanel').hidden,true);
 assert.equal(h.q('rows').children.length,0);
 assert.equal(h.q('file').value,'');
 assert.equal(h.downloads.length,0);
 assert.equal(h.q('downloadIncidents').disabled,true);
 assert.equal(prepares(h).length,0);
});

test('manual login and return keep an uncertain write body/key until an explicit identical retry',async t=>{
 const h=await panel(t);await h.review();h.state.badReceipt=true;await h.q('saveButton').onclick();
 const original=structuredClone(prepares(h)[0]);assert.equal(h.f.state.writes,1);
 h.hide();h.show();h.state.bootstrapStatus=401;await h.recheck();
 const beforeLogin=h.requests.length;h.hide();h.show();
 assert.equal(h.q('accessLogin').hidden,false);
 assert.match(h.q('accessStatus').textContent,/sesión venció/);
 assert.match(h.q('accessRecoveryHelp').textContent,/envío pendiente/);
 assert.equal(h.requests.length,beforeLogin);
 assert.deepEqual(prepares(h),[original]);
 h.state.bootstrapStatus=0;await h.recheck();
 assert.equal(h.q('accessLogin').hidden,true);
 assert.equal(h.q('retryButton').disabled,false);
 assert.equal(h.q('entryFields').disabled,true);
 assert.deepEqual(prepares(h),[original]);
 await h.q('retryButton').onclick();
 assert.deepEqual(prepares(h),[original,original]);
 assert.equal(h.f.state.writes,1);
});

for(const failure of ['revoked','network'])test('a subsequent '+failure+' response does not keep stale login advice',async t=>{
 const h=await panel(t,12,{state:{bootstrapStatus:401}});
 h.state.bootstrapStatus=0;
 if(failure==='revoked')h.state.deny=true;else h.state.bootstrapFailure=true;
 await h.recheck();assert.equal(h.q('accessLogin').hidden,true);
 assert.equal(h.q('intake').hidden,true);assert.equal(h.q('entryFields').disabled,true);
 assert.equal(h.f.state.writes,0);
});

test('recovered access retires login advice and never restores an old file or preview',async t=>{
 const h=await panel(t,12,{state:{bootstrapStatus:401}});
 h.state.bootstrapStatus=0;await h.recheck();
 assert.equal(h.q('accessLogin').hidden,true);
 assert.equal(h.q('accessRecovery').hidden,true);
 assert.equal(h.q('entryFields').disabled,false);
 assert.equal(h.q('previewPanel').hidden,true);
 assert.equal(h.q('file').value,'');assert.equal(prepares(h).length,0);
});

test('the login link uses the public local entry and preserves the original tab without an opener',()=>{
 const html=fs.readFileSync('importar-novedades-grh.html','utf8');
 const tag=html.match(/<a\b[^>]*\bid="accessLogin"[^>]*>/)?.[0];
 assert.ok(tag,'the actual page provides the login link');
 assert.match(tag,/href="\/acceso"/);
 assert.match(tag,/target="_blank"/);assert.match(tag,/rel="noopener noreferrer"/);
 assert.match(tag,/aria-describedby="accessRecoveryHelp"/);assert.match(tag,/\bhidden\b/);
});
