import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeCreationBootstrap,employeeScopeKey,employeeCatalogEqual,employeeReceipt,employeeCreationFinalRefusal} from '../assets/native-employee-confirmation-model.js';
import {employeeOperation} from '../lib/internal-native-employees.js';
import {createNativeEmployeeHandler} from '../api/internal-native-employees.js';
import {bootstrap,receipt,draft,principal,session,ID,TENANT,MEMBER} from './fixtures/native-employee-synthetic.js';

test('bootstrap scope comes from authenticated authority and freezes the complete catalog snapshot',async()=>{
 const sql={query:async()=>[{result:{...bootstrap,scope:{tenantId:ID,membershipId:ID}}}]};
 const actual=await employeeOperation(sql,principal,session,'bootstrap');assert.deepEqual(actual.scope,{tenantId:TENANT,membershipId:MEMBER});
 const source=structuredClone(actual),safe=employeeCreationBootstrap(source);source.catalog.items[0].label='Mutación sintética';assert.equal(safe.catalog.items[0].label,bootstrap.catalog.items[0].label);assert.ok(Object.isFrozen(safe.catalog.items[0]));assert.equal(employeeScopeKey(safe.scope),TENANT+':'+MEMBER);
});
for(const patch of [{scope:null},{scope:{tenantId:TENANT,membershipId:0}},{scope:{tenantId:'00000000-0000-0000-0000-000000000000',membershipId:MEMBER}},{canCreate:1},{today:'2026-02-30'},{catalog:{...bootstrap.catalog,version:'bad'}},{catalog:{...bootstrap.catalog,items:[...bootstrap.catalog.items,bootstrap.catalog.items[0]]}}])test('unverifiable bootstrap stays unavailable '+JSON.stringify(patch).slice(0,70),()=>assert.throws(()=>employeeCreationBootstrap({...bootstrap,...patch})));

test('same-version catalog label drift is detected; equivalent object property order is accepted',()=>{
 const changed=structuredClone(bootstrap.catalog);changed.items[0].label='Otra descripción sintética';assert.equal(employeeCatalogEqual(bootstrap.catalog,changed),false);
 const reordered=JSON.parse(JSON.stringify(bootstrap.catalog,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v));assert.equal(employeeCatalogEqual(bootstrap.catalog,reordered),true);
});
test('receipt accepts original declared values and automatic number without relying on UUID version',()=>{
 const r={...receipt,jurisdictionCode:'42',contractId:'12345678-1234-9234-7234-123456789abc'};assert.equal(employeeReceipt(r,draft({jurisdictionCode:'42'})),r);
 assert.equal(employeeReceipt(receipt,draft()),receipt);assert.equal(employeeReceipt({...receipt,legajo:'7777'},draft({legajo:'7777'})).legajo,'7777');
});
for(const patch of [{name:'OTRA PERSONA SINTÉTICA'},{startDate:'2026-10-02'},{registrationId:'-'.repeat(36)},{contractId:'-'.repeat(36)},{contractId:'00000000-0000-0000-0000-000000000000'},{legajo:5001},{legajo:'05001'},{startDate:'2026-02-30'},{createdAt:'2026-02-30T12:00:00Z'},{createdAt:'invalid'},{replayed:0},{accountCreated:true},{payrollCalculated:true},{origin:'GRH'},{extra:'otro'},{jurisdictionCode:'55'}])test('drift cannot confirm a submitted creation '+Object.keys(patch)+' '+String(Object.values(patch)[0]).slice(0,25),()=>assert.throws(()=>employeeReceipt({...receipt,jurisdictionCode:'42',...patch},draft({jurisdictionCode:'42'})),{code:'NATIVE_EMPLOYEE_CONTRACT_INVALID',status:503}));

test('explicit number cannot be silently replaced; historical declaration cannot be invented',()=>{
 assert.throws(()=>employeeReceipt(receipt,draft({legajo:'7777'})));assert.throws(()=>employeeReceipt({...receipt,jurisdictionCode:'42'},draft()));assert.throws(()=>employeeReceipt(receipt,draft({jurisdictionCode:'42'})));
});
for(const field of ['name','startDate','legajo'])test('API blocks mismatched '+field+' after SQL instead of returning false success',async()=>{
 const patch={name:'OTRA PERSONA SINTÉTICA',startDate:'2026-10-02',legajo:'7778'},calls=[];
 const sql={query:async(q,v)=>{calls.push({q,v});return[{result:{...receipt,[field]:patch[field]}}];}};
 await assert.rejects(employeeOperation(sql,principal,session,'create',{key:ID,body:{draft:draft({legajo:'5001'}),catalogVersion:bootstrap.catalog.version}}),{code:'NATIVE_EMPLOYEE_CONTRACT_INVALID',status:503});assert.equal(calls.length,1);assert.equal(calls[0].v.at(-1),ID);
});

test('only an explicit first refusal can release the attempted form; uncertainty never depends on HTTP status alone',()=>{
 assert.equal(employeeCreationFinalRefusal({status:409,code:'NATIVE_EMPLOYEE_IDENTITY_EXISTS'}),true);
 for(const e of [{status:409},{status:404,code:'NATIVE_EMPLOYEE_ATTEMPT_NOT_FOUND'},{status:403,code:'NATIVE_EMPLOYEE_FORBIDDEN'},{status:409,code:'NATIVE_EMPLOYEE_SCOPE_CHANGED'},{status:409,code:'NATIVE_EMPLOYEE_ATTEMPT_CONFLICT'},{status:503,code:'NATIVE_EMPLOYEE_UNAVAILABLE'}])assert.equal(employeeCreationFinalRefusal(e),false);
});

test('a pinned scope changed between bootstrap and write is rejected before body or database access',async()=>{
 let queries=0,bodyRead=false;const handler=createNativeEmployeeHandler({env:{NODE_ENV:'production',INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>{queries++;return{};}});
 const req={method:'POST',url:'/api/internal-native-employees',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':ID,'x-municontrol-employee-scope':TENANT+':'+ID}};Object.defineProperty(req,'body',{get(){bodyRead=true;throw Error('must not read');}});
 const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler(req,res);assert.equal(res.code,409);assert.equal(res.data.code,'NATIVE_EMPLOYEE_SCOPE_CHANGED');assert.equal(queries,0);assert.equal(bodyRead,false);
});
