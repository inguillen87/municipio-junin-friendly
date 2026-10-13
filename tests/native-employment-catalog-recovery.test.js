import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogErrorGuidance,catalogRetainAttempt} from '../assets/native-employment-catalog-model.js';

test('storage rejection explains capacity without claiming that the catalog changed',()=>{
 const message=catalogErrorGuidance({status:409,code:'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT'});
 assert.match(message,/espacio/i);assert.doesNotMatch(message,/catálogo.*cambió|cupo de propuestas/i);
 assert.match(message,/borrador/i);assert.match(message,/administración/i);
});
test('a confirmed storage rejection does not retain an uncertain pending send',()=>{
 assert.equal(catalogRetainAttempt({status:409,code:'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT'},{uncertain:false},false),false);
});
test('BUSY preserves recovery of the original attempt without changing its body or key',()=>{
 const attempt={key:'00112233-4455-4677-8899-aabbccddeeff',body:{operation:'propose',payload:{reason:'Sólo datos sintéticos QA',items:[{code:'1'}]}},uncertain:false};
 const before=structuredClone(attempt);
 assert.equal(catalogRetainAttempt({status:409,code:'NATIVE_EMPLOYMENT_CATALOG_BUSY'},attempt,false),true);
 assert.deepEqual(attempt,before);assert.match(catalogErrorGuidance({status:409,code:'NATIVE_EMPLOYMENT_CATALOG_BUSY'}),/mismo intento/i);
});
test('an unrelated conflict cannot claim a changed base or unlock a new send automatically',()=>{
 assert.doesNotMatch(catalogErrorGuidance({status:409,code:'UNKNOWN_CONFLICT'}),/catálogo.*cambió/i);
 assert.equal(catalogRetainAttempt({status:409,code:'UNKNOWN_CONFLICT'},{uncertain:false},false),false);
});
test('only a verified base-change code reports a changed catalog',()=>{
 assert.match(catalogErrorGuidance({status:409,code:'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED'}),/catálogo vigente cambió/i);
 assert.match(catalogErrorGuidance({status:409,code:'NATIVE_EMPLOYMENT_CATALOG_SCOPE_CHANGED'}),/ámbito/i);
});
test('revocation guidance takes precedence over a contradictory BUSY code',()=>{
 assert.match(catalogErrorGuidance({status:403,code:'NATIVE_EMPLOYMENT_CATALOG_BUSY'}),/sesión o permiso/i);
 assert.equal(catalogRetainAttempt({status:403,code:'NATIVE_EMPLOYMENT_CATALOG_BUSY'},{uncertain:false},false),false);
});
test('network uncertainty, server failure and recovery retain the original attempt',()=>{
 for(const [error,attempt,recovery] of [[{}, {uncertain:false},false],[{status:503},{uncertain:false},false],[{status:409},{uncertain:true},false],[{status:404},{uncertain:true},true]])assert.equal(catalogRetainAttempt(error,attempt,recovery),true);
});
test('messages never echo unverified server text or SQL diagnostics',()=>{
 const injected={status:409,code:'UNKNOWN',safeMessage:'PRIVATE_SYNTHETIC_SECRET',message:'SELECT private_synthetic_table'};
 const message=catalogErrorGuidance(injected);assert.doesNotMatch(message,/PRIVATE_SYNTHETIC_SECRET|SELECT|private_synthetic_table/);
});
