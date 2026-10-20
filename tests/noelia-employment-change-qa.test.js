import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NOELIA_EMPLOYMENT_CHANGE_QA_QUERIES as queries,noeliaEmploymentChangeQaSql,noeliaEmploymentChangeQaResult,noeliaEmploymentChangeQaEnvelope} from '../scripts/lib/noelia-employment-change-qa.mjs';

const schema='mc_qa_fixed_092_'+'a'.repeat(32),contract='00112233-4455-4677-8899-aabbccddeeff',key='11223344-5566-4788-99aa-bbccddeeff00';
const context=JSON.stringify({actorEmail:"qa-o'connor@example.invalid",actorSessionId:key,actorSessionVersion:1,releaseSha:'a'.repeat(40),tenantId:contract,membershipId:key});
const body=JSON.stringify({contractId:contract,reason:"Rectificación sintética O'Connor · $1 · \\ no ejecutable",values:{jobTitle:'Sólo texto QA'}});
const inputs=operation=>operation==='bootstrap'?[context,contract]:['propose','review'].includes(operation)?[context,body,key]:[context,contract,key];
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const source=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('la allowlist contiene exactamente las cinco sentencias emitidas por104',()=>{
 const application=source('lib/internal-employment-changes.js');
 const actual=[...application.matchAll(/'(SELECT public\.native_employment_change_[^']+)'/g)].map(match=>match[1]);
 assert.equal(actual.length,5);assert.deepEqual([...actual].sort(),Object.values(queries).sort());
 assert.deepEqual(Object.keys(queries),['bootstrap','proposal','attempt','propose','review']);assert.ok(Object.isFrozen(queries));
});

for(const operation of Object.keys(queries))test('render exacto '+operation+' conserva casts, aridad y valores',()=>{
 const values=inputs(operation),before=structuredClone(values),sql=noeliaEmploymentChangeQaSql(queries[operation],values,schema);
 const expected=queries[operation].replace('public.native_employment_change_',schema+'.native_employment_change_').replace(/\$(\d+)/g,(_,n)=>quote(values[Number(n)-1]));
 assert.equal(sql,expected);assert.deepEqual(values,before);assert.equal((sql.match(/::jsonb/g)??[]).length,['propose','review'].includes(operation)?2:1);
 assert.equal((sql.match(/::uuid/g)??[]).length,['proposal','attempt'].includes(operation)?2:1);
 assert.ok(sql.includes("qa-o''connor@example.invalid"));assert.ok(sql.endsWith(' AS result'));
});

test('rechaza SQL arbitrario, nuevas funciones, casts diferentes y sufijos',()=>{
 for(const query of [
  'DELETE FROM public.employment_contract',
  'SELECT public.native_employment_change_private_v1($1::jsonb,$2::uuid) AS result',
  queries.bootstrap+'; SELECT 1',
  ' '+queries.bootstrap,
  queries.bootstrap.replace('::uuid','::text'),
  queries.propose.replace('$3','$4'),
  queries.review.replace('public.','other.'),
  queries.attempt.replace(' AS result',' AS arbitrary'),
  queries.bootstrap+' -- comment',
 ])assert.throws(()=>noeliaEmploymentChangeQaSql(query,inputs('bootstrap'),schema),/QA104_QUERY_NOT_ALLOWED/);
});

test('el esquema debe ser exactamente el QA desechable existente',()=>{
 for(const bad of ['public','mc_qa_fixed_092_'+'a'.repeat(31),'mc_qa_fixed_092_'+'a'.repeat(33),'mc_qa_fixed_092_'+'A'.repeat(32),schema+'; SELECT 1','other.'+schema])assert.throws(()=>noeliaEmploymentChangeQaSql(queries.bootstrap,inputs('bootstrap'),bad),/QA104_SCHEMA_INVALID/);
});

test('aridad exacta y arreglos densos, sin argumentos omitidos o adicionales',()=>{
 for(const operation of Object.keys(queries)){
  const values=inputs(operation),sparse=values.slice();delete sparse[1];const extra=values.slice();extra.metadata='not-an-argument';
  for(const bad of [null,{},values.slice(0,-1),[...values,key],sparse,extra])assert.throws(()=>noeliaEmploymentChangeQaSql(queries[operation],bad,schema),/QA104_ARITY_INVALID/);
 }
});

test('todos los argumentos tienen tipo explícito; JSON de contexto/cuerpo es objeto y UUID conserva su dominio',()=>{
 for(const bad of [null,1,true,{},[],Buffer.from(context)])assert.throws(()=>noeliaEmploymentChangeQaSql(queries.bootstrap,[bad,contract],schema),/QA104_PARAMETER_TYPE_INVALID/);
 for(const bad of ['{broken','null','[]','1','true','"text"'])assert.throws(()=>noeliaEmploymentChangeQaSql(queries.propose,[context,bad,key],schema),/QA104_JSON_/);
 for(const bad of ['',contract+'; DROP TABLE x','5001',123,null,{}])assert.throws(()=>noeliaEmploymentChangeQaSql(queries.bootstrap,[context,bad],schema));
 const uppercase=contract.toUpperCase();assert.ok(noeliaEmploymentChangeQaSql(queries.bootstrap,[context,uppercase],schema).includes(quote(uppercase)+'::uuid'));
});

test('un hueco heredado con propiedad compensatoria no alcanza el transporte',async()=>{
 const inherited=Object.create(Array.prototype);inherited[1]=body;
 const values=[context,,key];Object.setPrototypeOf(values,inherited);values.metadata='extra';
 assert.equal(Reflect.ownKeys(values).length,values.length+1);
 let calls=0;const db={run:async()=>{calls++;return {unexpected:'transport reached'};}};
 await assert.rejects(noeliaEmploymentChangeQaResult(db,queries.propose,values,schema),/QA104_ARITY_INVALID/);
 assert.equal(calls,0);
});

test('db.run sustituido recibe una sentencia y runtime=true sin abrir SQL ni sustituir metadatos',async()=>{
 const calls=[],metadata=Object.freeze({syntheticOnly:true,metadata:{replayed:true,reference:'unchanged-test-only'}});
 const db={run:()=>assert.fail('no transport may be opened')};
 db.run=async(statement,runtime)=>{calls.push({statement,runtime});return metadata;};
 for(const operation of Object.keys(queries)){
  const rows=await noeliaEmploymentChangeQaResult(db,queries[operation],inputs(operation),schema);
  assert.deepEqual(rows,[{result:metadata}]);assert.equal(rows[0].result,metadata);assert.equal(calls.at(-1).runtime,true);
  assert.equal(calls.at(-1).statement,noeliaEmploymentChangeQaSql(queries[operation],inputs(operation),schema));
 }
 assert.equal(calls.length,5);
});

test('un render inválido no alcanza db.run y un fallo conserva el mismo error',async()=>{
 let calls=0;const db={run:async()=>{calls++;assert.fail('invalid statement reached SQL');}};
 await assert.rejects(noeliaEmploymentChangeQaResult(db,queries.bootstrap,[context],schema),/QA104_ARITY_INVALID/);
 await assert.rejects(noeliaEmploymentChangeQaResult(db,'SELECT 1',[],schema),/QA104_QUERY_NOT_ALLOWED/);assert.equal(calls,0);
 const failure=Object.assign(Error('QA104_SYNTHETIC_UNAVAILABLE'),{code:'XX000'});db.run=async()=>{calls++;throw failure;};
 await assert.rejects(noeliaEmploymentChangeQaResult(db,queries.bootstrap,inputs('bootstrap'),schema),error=>error===failure);assert.equal(calls,1);
});

test('sobre104 conserva propose/review y payload originales sin convertirlos a command',()=>{
 for(const operation of ['propose','review']){
  const envelope={operation,payload:{contractId:contract,proposalId:key,scopeVersion:'a'.repeat(64),reason:"Razón sintética O'Connor"}},before=JSON.stringify(envelope);
  assert.equal(noeliaEmploymentChangeQaEnvelope(envelope),envelope);assert.equal(JSON.stringify(envelope),before);
 }
 for(const bad of [null,[],{operation:'command',payload:{}},{operation:'calculate',payload:{}},{operation:'propose',payload:null},{operation:'review',payload:[]},{operation:'propose',payload:{},key},{contractId:contract,reason:'raw payload'}])assert.throws(()=>noeliaEmploymentChangeQaEnvelope(bad),/QA104_ENVELOPE_INVALID/);
 assert.throws(()=>noeliaEmploymentChangeQaEnvelope({operation:'propose',payload:{}},{unexpected:'preview'}),/QA104_ENVELOPE_INVALID/);
});

test('la rama QA104 precede la delegación y no amplía la allowlist general',()=>{
 const text=source('scripts/lib/noelia-payroll-circuit-qa.mjs'),branch="if(query.startsWith('SELECT public.native_employment_change_'))return noeliaEmploymentChangeQaResult(db,query,values,options.schema);";
 assert.equal(text.split(branch).length,2);assert.ok(text.indexOf(branch)<text.indexOf('const rosterRead=noeliaCircuitRosterRead(query,values,options.schema)'));
 assert.ok(text.includes('if(!/^SELECT public\\.(?:municipal_adoption_'));
 assert.doesNotMatch(text,/native_employment_change_\|position_assignment_/);
});

test('h.api cambia sólo el sobre employmentChange;104 usa el handler real con capacidades del actor',()=>{
 const runner=source('scripts/verify-salary-auxiliary-namespace.mjs'),classification=source('scripts/lib/own-period-classification-qa.mjs');
 assert.ok(runner.includes("kind==='employmentChange'?noeliaEmploymentChangeQaEnvelope(body,previewParams):previewParams?{operation:'preview',params:previewParams}:{operation:kind==='run'?'calculate':'command',payload:body}"));
 assert.ok(classification.includes('h.handlers.employmentChange=createEmploymentChangesHandler({...h.deps,requireAccess:actualAccess,getSql:()=>h.adapter});'));
 assert.ok(classification.includes("'employee.record.create','employee.record.propose','employee.record.approve','employee.catalog.propose'"));
 assert.ok(classification.includes("kind==='reader'?['actions.read','workforce.employee.read','payroll.read','payroll.parameter.read']:rights"));
 assert.doesNotMatch(classification,/UPDATE (?:public\.)?native_employment_change_review|INSERT INTO (?:public\.)?native_employment_change_review/);
});
