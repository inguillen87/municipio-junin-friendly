// PROPOSED by Claude (source only; not run by Claude). Target: tests/vercel-build-db-attestation-provision.test.js
// R3. MC_EMAIL_FACTOR_PROVISION_EVENT present (even empty) stops the attestation before any client, SQL,
// output or bundle. Recording callbacks prove zero connections and zero queries; the value never leaks.
import test from 'node:test';import assert from 'node:assert/strict';
import {attestVercelBuildDatabases,main,PROVISION_EVENT_KEY,ATTESTATION_VERSION} from '../scripts/verify-vercel-build-db-attestation.mjs';

const sha='a'.repeat(40),secret='SYNTHETIC_PROVISION_VALUE_MUST_NEVER_APPEAR';
const env=(over={})=>({VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:sha,
 DATABASE_URL:'postgresql://owner:x@ep-synthetic-owner.sa-east-1.aws.neon.tech/db',ACTIONS_DATABASE_URL:'postgresql://runtime:x@ep-synthetic-actions.sa-east-1.aws.neon.tech/db',...over});
const row={serverMajor:17,database:'db',currentUser:'u',sessionUser:'u',neonProjectId:'p-1',neonBranchId:'br-1',neonEndpointId:'ep-1',transactionReadOnly:'on'};
function recorder(){
 const calls={create:0,query:0,transaction:0,write:0},lines=[];
 return{calls,lines,createSql:()=>{calls.create++;return{query(){calls.query++;return{};},async transaction(){calls.transaction++;return[[{...row}]];}};},
  writeLine:line=>{calls.write++;lines.push(line);}};
}

test('clave ausente: el verificador sigue igual (dos clientes, dos SELECT de sólo lectura, complete)',async()=>{
 const r=recorder();await attestVercelBuildDatabases({env:env(),sourceSha:sha,createSql:r.createSql,writeLine:r.writeLine});
 assert.deepEqual(r.calls,{create:2,query:2,transaction:2,write:3});assert.equal(JSON.parse(r.lines[2]).event,'complete');
 assert.equal(PROVISION_EVENT_KEY,'MC_EMAIL_FACTOR_PROVISION_EVENT');
});

test('clave presente vacía o con valor real: PROVISION_EVENT_PRESENT con cero conexiones, SQL y salida',async()=>{
 for(const value of ['',' ',secret,'0','false']){
  const r=recorder();
  await assert.rejects(attestVercelBuildDatabases({env:env({[PROVISION_EVENT_KEY]:value}),sourceSha:sha,createSql:r.createSql,writeLine:r.writeLine}),
   e=>e.code==='PROVISION_EVENT_PRESENT'&&e.message==='PROVISION_EVENT_PRESENT'&&e.clientClass===null&&!String(e.stack).includes(secret));
  assert.deepEqual(r.calls,{create:0,query:0,transaction:0,write:0},JSON.stringify(value));
 }
});

test('la guarda precede a todo otro control: aun con contexto inválido o sin cliente responde la presencia',async()=>{
 const r=recorder();
 for(const patch of [{env:{[PROVISION_EVENT_KEY]:''}},{env:env({[PROVISION_EVENT_KEY]:'',VERCEL:'0'})},{env:env({[PROVISION_EVENT_KEY]:''}),sourceSha:'x'},{env:env({[PROVISION_EVENT_KEY]:''}),createSql:undefined}])
  await assert.rejects(attestVercelBuildDatabases({env:env(),sourceSha:sha,createSql:r.createSql,writeLine:r.writeLine,...patch}),e=>e.code==='PROVISION_EVENT_PRESENT');
 assert.deepEqual(r.calls,{create:0,query:0,transaction:0,write:0});
});

test('CLI: presencia detiene antes del import del driver; sólo imprime el código seguro',async t=>{
 const errors=[],logs=[];t.mock.method(console,'error',line=>errors.push(String(line)));t.mock.method(console,'log',line=>logs.push(String(line)));
 for(const argv of [['--source-sha',sha],[]]){
  errors.length=0;
  assert.equal(await main(argv,env({[PROVISION_EVENT_KEY]:secret})),1);
  assert.deepEqual(errors.map(JSON.parse),[{version:ATTESTATION_VERSION,event:'failure',code:'PROVISION_EVENT_PRESENT',clientClass:null}]);
  assert.ok(!errors.join('').includes(secret));
 }
 assert.deepEqual(logs,[]);
});
