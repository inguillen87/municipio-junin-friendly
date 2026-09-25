// Aísla sólo el ciclo de transacción con un cliente inventado. No abre conexiones de base de datos.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const file=fs.readFileSync(new URL('../scripts/stage-grh-successor.mjs',import.meta.url),'utf8');
const start=file.indexOf('export async function executeSuccessorStage('),end=file.indexOf('\nasync function main()',start);assert.ok(start>=0&&end>start);
function harness({stageError=null,queryError=null,connectError=null}={}){
 const calls=[];let released=0,staged=0;
 const receipt={stageId:'synthetic',committed:false,callerOwnedTransaction:true,operational:false,sourcePromoted:false};
 const client={release(){released++;},async query(sql){calls.push(sql);if(queryError?.sql===sql)throw queryError.error;return {rows:[]};}};
 const context={structuredClone,verifySuccessorPackage:v=>v,validateSuccessorTarget:v=>v,stageSuccessorWithinTransaction:async()=>{staged++;if(stageError)throw stageError;return receipt;},fail:code=>{throw Object.assign(Error(code),{code});}};
 vm.createContext(context);vm.runInContext(file.slice(start,end).replace('export async function','async function'),context);
 const run=opts=>context.executeSuccessorStage({prepared:{payloadSha256:'hash'},target:{},expectedPackageSha256:'hash',connect:async()=>{if(connectError)throw connectError;return client;},...opts});
 return {calls,run,released:()=>released,staged:()=>staged};
}
test('el ensayo obtiene comprobante pero confirma rollback, no permanencia',async()=>{
 const h=harness(),r=await h.run();assert.equal(r.committed,false);assert.equal(r.rolledBack,true);assert.equal(r.maintenanceOutcome,'rehearsal_rolled_back');assert.equal(h.calls.at(-1),'ROLLBACK');assert.equal(h.released(),1);
});
test('la carga confirmada sólo se informa después de recibir COMMIT',async()=>{
 const h=harness(),r=await h.run({commit:true});assert.equal(r.committed,true);assert.equal(r.rolledBack,false);assert.equal(h.calls.at(-1),'COMMIT');assert.equal(h.staged(),1);
});
test('si falta la respuesta de COMMIT no afirma que hubo rollback',async()=>{
 const h=harness({queryError:{sql:'COMMIT',error:Error('respuesta no recibida')}});
 await assert.rejects(h.run({commit:true}),e=>e.code==='SUCCESSOR_STAGE_COMMIT_UNCONFIRMED'&&e.outcomeUnknown===true);
 assert.equal(h.calls.filter(q=>q==='COMMIT').length,1);assert.equal(h.calls.at(-1),'ROLLBACK');assert.equal(h.released(),1);
});
test('un fallo del cargador revierte antes de liberar la conexión',async()=>{
 const error=Object.assign(Error('test'),{code:'SUCCESSOR_STAGE_DELTA_DRIFT'}),h=harness({stageError:error});
 await assert.rejects(h.run({commit:true}),e=>e===error);assert.equal(h.calls.at(-1),'ROLLBACK');assert.equal(h.calls.includes('COMMIT'),false);assert.equal(h.released(),1);
});
test('fallar al abrir la conexión no genera un comprobante ni comandos SQL',async()=>{
 const h=harness({connectError:Error('test connection unavailable')});await assert.rejects(h.run());assert.equal(h.calls.length,0);assert.equal(h.staged(),0);
});
test('un rechazo de BEGIN no intenta cerrar una transacción que no abrió',async()=>{
 const h=harness({queryError:{sql:'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE',error:Error('test begin refused')}});await assert.rejects(h.run());assert.equal(h.calls.length,1);assert.equal(h.staged(),0);assert.equal(h.released(),1);
});
test('cada ejecución usa una sola conexión durante toda la operación',async()=>{
 const h=harness();await h.run();assert.equal(h.calls[0],'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');assert.match(h.calls[1],/statement_timeout='120s'/);assert.equal(h.staged(),1);assert.equal(h.released(),1);
});
