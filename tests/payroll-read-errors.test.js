import test from 'node:test';import assert from 'node:assert/strict';
import {payrollReadFailure,payrollReadDiagnostic} from '../lib/payroll-read-errors.js';
import {createInternalDataHandler} from '../api/internal-data.js';
const cases=[['ACTION_SESSION_INVALID',401],['IDENTITY_SESSION_INVALID',401],['EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED',403],['TENANT_IAM_SOD_CONFLICT',403],['ACTION_TENANT_AUTHORITY_REQUIRED',403],['ACTION_RELEASE_NOT_CERTIFIED',503],['ACTION_SOURCE_BINDING_REQUIRED',503],['ACTION_DATABASE_ROLE_REQUIRED',503],['ACTION_SESSION_BUSY',409],['GRH_SOURCE_CHANGED',503]];
for(const [code,status] of cases)test('exact machine code '+code+' retains its HTTP meaning',()=>{
 const direct=payrollReadFailure({code});const database=payrollReadFailure({code:'P0001',message:code});
 assert.deepEqual(direct,database);assert.equal(direct.status,status);assert.equal(direct.code,code);assert.equal(typeof direct.retryable,'boolean');
});
test('raw database text, spoofed prefixes and unknown SQL states never become public messages',()=>{
 for(const error of [{code:'P0001',message:'ACTION_SESSION_INVALID: PRIVATE_SQL'},{code:'42501',message:'EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED'},{code:'P0001',message:'PRIVATE_SQL'},{code:'P0001',message:'TENANT_IAM_SOD_CONFLICT\nPRIVATE_SQL'},{code:'P0001',message:'x'.repeat(10000)},{code:'__proto__',message:'PRIVATE_SQL'},null]){
  const result=payrollReadFailure(error);assert.equal(result.code,'INTERNAL_DATA_UNAVAILABLE');assert.equal(JSON.stringify(result).includes('PRIVATE_SQL'),false);
 }
});
const ids={tenant:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membership:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',session:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',contract:'11111111-1111-4111-8111-111111111111'};
const principal={user:{email:'qa@example.invalid'},tenant:{id:ids.tenant,membershipId:ids.membership,source:'membership',certifiedReleaseSha:'f'.repeat(40)}};
const session={id:ids.session,email:'qa@example.invalid',version:1,releaseSha:'f'.repeat(40)};
function response(){return{headers:{},statusCode:null,payload:null,setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.payload=v;return this}}}
for(const [code,status]of cases)test('API safely classifies post-authorization failure '+code,async()=>{
 const diagnostics=[],accessCalls=[];let queries=0;
 const handler=createInternalDataHandler({requireCompatibleInternalAccess:async(_req,_res,options)=>{accessCalls.push(options);return{mode:'managed',principal,session}},actionMutationSession:()=>session,getActionCenterSql:async()=>({query:async()=>{queries++;throw Object.assign(new Error(code),{code:'P0001',detail:'PRIVATE_SQL'})}}),reportReadFailure:d=>diagnostics.push(d)});
 const res=response();await handler({method:'GET',query:{resource:'employeepayroll',contractId:ids.contract}},res);
 assert.equal(res.statusCode,status);assert.equal(res.payload.code,code);assert.equal(queries,1);assert.equal(diagnostics.length,1);
 assert.deepEqual(accessCalls[0].requiredCapabilities,['workforce.employee.read','payroll.read']);assert.equal(accessCalls[0].allowLegacy,false);
 assert.match(res.headers['Cache-Control'],/no-store/);assert.equal(res.headers.Vary,'Cookie');assert.equal(res.payload.requestId,diagnostics[0].requestId);
 assert.match(res.payload.requestId,/^[a-f0-9-]{36}$/);assert.equal(diagnostics[0].resource,'employeepayroll');assert.equal(JSON.stringify([res.payload,diagnostics]).includes('PRIVATE_SQL'),false);assert.equal('data'in res.payload,false);
});
test('authorization refusal performs no payroll query and no fallback read',async()=>{
 let queries=0;const handler=createInternalDataHandler({requireCompatibleInternalAccess:async(_req,res,options)=>{assert.equal(options.requireCertifiedDataBinding,true);res.status(403).json({ok:false,code:'IDENTITY_CAPABILITY_REQUIRED'});return null},getActionCenterSql:async()=>{queries++;throw Error('Must not run')},getInternalSql:async()=>{queries++;throw Error('Must not run')}});
 const res=response();await handler({method:'GET',query:{resource:'employeepayroll',contractId:ids.contract}},res);assert.equal(res.statusCode,403);assert.equal(queries,0);
});
test('failed method has no authorization or data side effects',async()=>{
 const handler=createInternalDataHandler({requireCompatibleInternalAccess:()=>{throw Error('Must not authorize')}});
 const res=response();await handler({method:'POST',query:{resource:'employeepayroll'}},res);assert.equal(res.statusCode,405);assert.equal(res.headers.Allow,'GET');
});
test('diagnostic strips unknown resource, SQL statements and arbitrary metadata',()=>{
 const diagnostic=payrollReadDiagnostic({code:'P0001',message:'PRIVATE_SQL',detail:'PRIVATE_SQL',query:'PRIVATE_SQL'},'employee?PRIVATE_SQL','generated-reference');
 assert.deepEqual(diagnostic,{code:'INTERNAL_DATA_UNAVAILABLE',sqlstate:'P0001',resource:'unknown',requestId:'generated-reference'});
});
