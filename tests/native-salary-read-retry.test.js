// Opening Parámetros reads the salary master by itself while the approvals inbox reads it too. Each reading holds the
// municipality's catalog lock in SQL, so the one that arrived second failed at once («No se confirmó la operación…») and
// the master stayed empty. Measured with real SQL and the complete 3291-definition master by
// scripts/verify-native-salary-capacity.mjs; these guards keep the handler's retry from being lost in a refactor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNativeSalaryHandler} from '../api/internal-native-salary.js';
import {body,receipt,bootstrap,uid} from './fixtures/native-salary-synthetic.js';
import {salaryStreamFixture} from './fixtures/native-salary-stream-synthetic.js';

const caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:caps}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const read=query=>({method:'GET',url:'/api/internal-native-salary?'+new URLSearchParams(query),query,headers:{}});
const write=()=>({method:'POST',url:'/api/internal-native-salary',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'command',payload:body()})});
// The SQL answers «busy» to the first `collisions` queries, exactly as psql reports it, and then the given result.
function setup(result,collisions,message='psql:<stdin>:1: ERROR:  NATIVE_EMPLOYMENT_CATALOG_BUSY'){
 const calls=[];
 const handler=createNativeSalaryHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});if(calls.length<=collisions)throw Error(message);return[{result}];}})});
 return{handler,calls};
}

test('un bloque del maestro que choca con otra lectura del mismo municipio se reintenta y responde 200',async()=>{
 const {frames}=salaryStreamFixture(bootstrap()),{handler,calls}=setup(frames[0],1),res=response();
 await handler(read({resource:'stream',page:'0'}),res);
 assert.equal(res.statusCode,200);assert.equal(res.value.data.snapshotSha256,frames[0].snapshotSha256);
 assert.equal(calls.length,2,'la misma consulta, una vez más');assert.deepEqual(calls[1],calls[0]);
});

test('la lectura completa sin bloques también se reintenta, con cualquiera de los dos bloqueos',async()=>{
 for(const message of ['psql:<stdin>:1: ERROR:  NATIVE_EMPLOYMENT_CATALOG_BUSY','NATIVE_SALARY_BUSY']){
  const {handler,calls}=setup(bootstrap(),1,message),res=response();
  await handler(read({resource:'bootstrap'}),res);
  assert.equal(res.statusCode,200,message);assert.equal(calls.length,2,message);
 }
});

test('un error que no es un choque no se reintenta',async()=>{
 const {handler,calls}=setup(bootstrap(),1,'NATIVE_SALARY_SNAPSHOT_CHANGED'),res=response();
 await handler(read({resource:'stream',page:'0'}),res);
 assert.equal(res.statusCode,409);assert.equal(res.value.code,'NATIVE_SALARY_SNAPSHOT_CHANGED');assert.equal(calls.length,1);
});

test('guardar o decidir conserva un solo intento: el choque se informa y no se repite el envío',async()=>{
 const {handler,calls}=setup(receipt(),1,'NATIVE_SALARY_BUSY'),res=response();
 await handler(write(),res);
 assert.equal(res.statusCode,409);assert.equal(res.value.code,'NATIVE_SALARY_BUSY');assert.equal(calls.length,1);
});

test('sólo las lecturas GET del maestro llevan el reintento',()=>{
 const source=fs.readFileSync(new URL('../api/internal-native-salary.js',import.meta.url),'utf8');
 assert.match(source,/salaryOperation\(method==='GET'\?busyRetrySql\(await getSql\(env\)\):await getSql\(env\),/);
 assert.equal(source.split('busyRetrySql(').length,2,'un único uso');
});
