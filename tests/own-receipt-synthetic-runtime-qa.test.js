// Pure dependency-injection checks. No runner, SQL process or browser is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOwnReceiptSyntheticRuntimeQa,OWN_RECEIPT_SYNTHETIC_RUNTIME_EVIDENCE} from '../scripts/lib/own-receipt-synthetic-runtime-qa.mjs';
import {ACTION_RUNTIME_IDENTITY_SQL,assertActionRuntimeDestination,invalidateActionRuntimeIdentity} from '../lib/action-runtime-identity.js';
import {receiptExpectedDestination,receiptRuntimeBinding} from '../lib/own-receipt-runtime-binding.js';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
import {OWN_RECEIPT_PREPARE} from '../assets/own-payroll-receipt-model.js';
import {receiptCommand,receiptEvent} from './fixtures/own-payroll-receipt-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

const actor={actorEmail:'receipt-runtime-qa@example.invalid',actorSessionId:uid(52),actorSessionVersion:1,tenantId:uid(50),membershipId:uid(51),releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const request=()=>({method:'POST',url:'/api/internal-own-payroll-receipts',query:{},headers:{origin:'http://localhost:8080','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'command',payload:receiptCommand()})});

for(const major of [17,18])test('synthetic runtime '+major+' binds one stable wrapper without querying the original adapter',async()=>{
 const adapter={query:()=>assert.fail('identity must not reach SQL')},original=adapter.query;
 const qa=createOwnReceiptSyntheticRuntimeQa({sql:adapter,major}),expectedDestination=receiptExpectedDestination(qa.env);
 assert.equal(expectedDestination.major,major);assert.equal(qa.env.VERCEL_GIT_COMMIT_SHA,'c'.repeat(40));
 for(const field of ['projectId','branchId','endpointId','database'])assert.match(expectedDestination[field],/synthetic/);
 assert.equal(qa.getSql(qa.env,{expectedDestination}),qa.sql);assert.equal(qa.getSql(qa.env,{expectedDestination}),qa.sql);
 assert.equal(adapter.query,original);assert.notEqual(qa.sql,adapter);assert.ok(Object.isFrozen(qa.sql)&&Object.isFrozen(qa.env));
 assert.throws(()=>assertActionRuntimeDestination(adapter,expectedDestination),{code:'ACTION_DATABASE_DESTINATION_REQUIRED'});
 const result=await receiptRuntimeBinding(qa.sql,expectedDestination,qa.env);
 assert.equal(result.version,'own-receipt-runtime-binding.v1');assert.equal(result.applicationCommit,'c'.repeat(40));assert.equal(result.bindingVerified,true);
 assert.deepEqual(qa.evidence,{mode:'synthetic-fixture',identityQuery:'simulated',applicationCommit:'synthetic',genuineSdkVerified:false,actualDestinationVerified:false});
});

test('only the exact parameterless identity query is simulated and every row is a fresh fixture',async()=>{
 const calls=[],adapter={query(...args){calls.push(args);return 'original';}},qa=createOwnReceiptSyntheticRuntimeQa({sql:adapter,major:17});
 const first=await qa.sql.query(ACTION_RUNTIME_IDENTITY_SQL);first[0].branchId='changed';
 const second=await qa.sql.query(ACTION_RUNTIME_IDENTITY_SQL);assert.equal(second[0].branchId,'br-synthetic-receipt-qa');assert.notEqual(first[0],second[0]);
 assert.deepEqual(Object.keys(second[0]).sort(),['major','projectId','branchId','endpointId','database','currentUser','sessionUser'].sort());
 assert.throws(()=>qa.sql.query(ACTION_RUNTIME_IDENTITY_SQL,[]),/RECEIPT_QA_IDENTITY_PARAMETERS/);assert.equal(calls.length,0);
 for(const sql of [ACTION_RUNTIME_IDENTITY_SQL.trim(),ACTION_RUNTIME_IDENTITY_SQL+' ',ACTION_RUNTIME_IDENTITY_SQL+'; SELECT 1'])assert.equal(qa.sql.query(sql),'original');
 assert.equal(calls.length,3);
});

test('business calls retain their receiver, exact arguments, promise and original errors',async()=>{
 const values=['unchanged-body',null],result=Promise.resolve([{result:'original'}]),calls=[];
 const adapter={query(...args){assert.equal(this,adapter);calls.push(args);return result;}},qa=createOwnReceiptSyntheticRuntimeQa({sql:adapter,major:18});
 const query='SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
 assert.equal(qa.sql.query(query,values),result);assert.equal(calls[0][0],query);assert.equal(calls[0][1],values);assert.equal(calls[0].length,2);
 const failure=Error('original synthetic refusal');adapter.query=function(){assert.equal(this,adapter);throw failure;};
 assert.throws(()=>qa.sql.query(query,values),error=>error===failure);
 adapter.query=function(){assert.equal(this,adapter);return Promise.reject(failure);};
 await assert.rejects(qa.sql.query(query,values),error=>error===failure);
});

test('the QA helper cannot revive an invalidated identity or accept another destination',async()=>{
 const qa=createOwnReceiptSyntheticRuntimeQa({sql:{query:()=>assert.fail('no business query')},major:17}),expectedDestination=receiptExpectedDestination(qa.env);
 assert.throws(()=>qa.getSql(qa.env,{expectedDestination:{...expectedDestination,branchId:'other-synthetic-branch'}}),/RECEIPT_QA_EXPECTED_DESTINATION/);
 assert.throws(()=>qa.getSql(qa.env),/RECEIPT_QA_EXPECTED_DESTINATION/);
 invalidateActionRuntimeIdentity(qa.sql);
 assert.throws(()=>qa.getSql(qa.env,{expectedDestination}),{code:'ACTION_DATABASE_DESTINATION_REQUIRED'});
 await assert.rejects(receiptRuntimeBinding(qa.sql,expectedDestination,qa.env),{code:'OWN_RECEIPT_BINDING_UNAVAILABLE',status:503});
});

test('invalid fixture arguments reject before calling an adapter',()=>{
 for(const major of [undefined,null,'17',16,19])assert.throws(()=>createOwnReceiptSyntheticRuntimeQa({sql:{query:()=>assert.fail('no query')},major}),/RECEIPT_QA_RUNTIME_MAJOR/);
 for(const sql of [null,{},()=>{}])assert.throws(()=>createOwnReceiptSyntheticRuntimeQa({sql,major:17}),/RECEIPT_QA_QUERY_ADAPTER_REQUIRED/);
});

function handlerFixture(){
 const calls=[],value=receiptEvent(),adapter={query(...args){assert.equal(this,adapter);calls.push(args);return Promise.resolve([{result:value}]);}};
 const runtime=createOwnReceiptSyntheticRuntimeQa({sql:adapter,major:17}),env={...runtime.env,INTERNAL_APP_ORIGIN:'http://localhost:8080'},caps=[...OWN_RECEIPT_PREPARE],stats={acquisitions:0};
 const deps={env,requireAccess:()=>({mode:'managed',principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}}}),sessionFor:()=>({email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}),getSql:(...args)=>{stats.acquisitions++;return runtime.getSql(...args);}};
 return {handler:createOwnReceiptHandler(deps),deps,calls,value,runtime,env,caps,stats};
}

test('actual receipt handler uses the QA seam while preserving the HTTP envelope and original command',async()=>{
 const f=handlerFixture(),r=response();await f.handler(request(),r);
 assert.equal(r.statusCode,201);assert.deepEqual(Object.keys(r.value).sort(),['data','ok']);assert.deepEqual(r.value.data,f.value);
 assert.equal(f.calls.length,1);assert.equal(f.stats.acquisitions,1);
 const [sql,values]=f.calls[0];assert.equal(sql,'SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result');
 assert.equal(values.length,3);assert.deepEqual(JSON.parse(values[1]),receiptCommand());assert.equal(values[2],uid(9));
 const context=JSON.parse(values[0]);assert.equal(context.releaseSha,actor.releaseSha);assert.notEqual(context.releaseSha,f.env.VERCEL_GIT_COMMIT_SHA);assert.equal(context.actorEmail,actor.actorEmail);
});

test('QA injection preserves capability revalidation and fail-closed behavior without a config bypass',async()=>{
 const f=handlerFixture(),first=response();await f.handler(request(),first);assert.equal(first.statusCode,201);
 f.caps.splice(0);const denied=response();await f.handler(request(),denied);assert.equal(denied.statusCode,403);assert.equal(f.calls.length,1);assert.equal(f.stats.acquisitions,1);
 for(const change of [env=>delete env.INTERNAL_RECEIPT_ACTIONS_TARGET,env=>delete env.VERCEL_GIT_COMMIT_SHA]){
  const a=handlerFixture();change(a.env);const r=response();await a.handler(request(),r);assert.equal(r.statusCode,503);assert.equal(r.value.code,'OWN_RECEIPT_BINDING_UNAVAILABLE');assert.equal(a.calls.length,0);assert.equal(a.stats.acquisitions,0);
 }
 const invalid=handlerFixture();invalidateActionRuntimeIdentity(invalid.runtime.sql);const r=response();await invalid.handler(request(),r);assert.equal(r.statusCode,503);assert.equal(invalid.calls.length,0);
});

test('all eight QA constructors use the isolated receipt wrapper and label their report evidence',()=>{
 const files=['scripts/verify-own-payroll-receipt-planilla-ui.mjs','scripts/verify-own-payroll-receipt-ui.mjs','scripts/verify-noelia-payroll-circuit.mjs','scripts/verify-salary-auxiliary-namespace.mjs','scripts/lib/own-period-classification-final-qa.mjs','scripts/lib/own-period-classification-qa.mjs','scripts/verify-own-bank-output-ui.mjs','scripts/verify-adopted-own-payroll-receipt-ui.mjs'];
 for(const file of files){
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),constructors=source.split('\n').filter(line=>line.includes('createOwnReceiptHandler('));
  assert.equal(constructors.length,1,file);assert.match(constructors[0],/getSql:(?:h\.)?receiptRuntimeQa\.getSql/,file);assert.match(source,/receiptRuntimeIdentity:OWN_RECEIPT_SYNTHETIC_RUNTIME_EVIDENCE/,file);
 }
 const source=fs.readFileSync(new URL('../scripts/verify-salary-auxiliary-namespace.mjs',import.meta.url),'utf8');
 assert.match(source,/continuation\(\{[^\n]+handlers,receiptRuntimeQa,api/,'recovery receives the same wrapper rather than rebuilding its identity');
 const final=fs.readFileSync(new URL('../scripts/lib/own-period-classification-final-qa.mjs',import.meta.url),'utf8');
 assert.match(final,/makeFinalClassificationQaHandlers\(\{qa,db,major,read:h\.options\.read/,'the declared major reaches the final fixture wrapper');
 assert.ok(Object.isFrozen(OWN_RECEIPT_SYNTHETIC_RUNTIME_EVIDENCE));
});
