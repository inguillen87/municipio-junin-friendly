import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSalaryHandler} from '../api/internal-native-salary.js';
import {salaryOperation,salaryError} from '../lib/internal-native-salary.js';
import {SALARY_STREAM_MAX_PAGES} from '../assets/native-salary-stream-model.js';
import {bootstrap,uid} from './fixtures/native-salary-synthetic.js';
import {salaryStreamFixture} from './fixtures/native-salary-stream-synthetic.js';
const caps=['workforce.employee.read','payroll.parameter.read'];
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:caps}};
const session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.value=value;return this;}});
const request=query=>({method:'GET',url:'/api/internal-native-salary?'+new URLSearchParams(query),query,headers:{}});
test('stream read uses authenticated context and parameterized page/snapshot, with private response headers',async()=>{
 const {frames}=salaryStreamFixture(bootstrap()),calls=[],handler=createNativeSalaryHandler({env:{},requireAccess:()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:()=>({query:async(sql,args)=>{calls.push({sql,args});return[{result:frames[0]}];}})}),res=response();
 await handler(request({resource:'stream',page:'0'}),res);
 assert.equal(res.statusCode,200);assert.equal(calls.length,1);assert.match(calls[0].sql,/\$1::jsonb,\$2::integer,\$3::text/);
 assert.equal(JSON.parse(calls[0].args[0]).actorSessionId,session.id);assert.deepEqual(calls[0].args.slice(1),[0,null]);assert.match(res.headers['Cache-Control'],/no-store/i);
});
for(const query of [{resource:'stream',page:'00'},{resource:'stream',page:'-1'},{resource:'stream',page:String(SALARY_STREAM_MAX_PAGES)},{resource:'stream',page:'1'},{resource:'stream',page:'0',snapshot:'x'},{resource:'stream',page:'0',tenantId:uid(8)}])test('invalid stream query never opens SQL: '+JSON.stringify(query),async()=>{
 let calls=0;const handler=createNativeSalaryHandler({env:{},requireAccess:()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:()=>{calls++;throw Error('must not connect');}}),res=response();await handler(request(query),res);assert.equal(res.statusCode,400);assert.equal(calls,0);
});
test('revoked reader never queries a remaining page, even with the valid snapshot hash',async()=>{
 let calls=0;const handler=createNativeSalaryHandler({env:{},requireAccess:()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}}}),sessionFor:()=>session,getSql:()=>{calls++;throw Error('must not connect');}}),res=response();await handler(request({resource:'stream',page:'1',snapshot:'a'.repeat(64)}),res);assert.equal(res.statusCode,403);assert.equal(calls,0);
});
test('malformed SQL frame and mismatched snapshot are service failures without payload disclosure',async()=>{
 const {frames}=salaryStreamFixture(bootstrap());
 for(const patch of [{hex:'zz'},{pageIndex:1},{scopeVersion:'invalid'},{privateNominal:'must not pass'}])await assert.rejects(salaryOperation({query:async()=>[{result:{...frames[0],...patch}}]},principal,session,'stream',{page:0,snapshot:null}),e=>e.code==='NATIVE_SALARY_CONTRACT_INVALID');
 await assert.rejects(salaryOperation({query:async()=>[{result:frames[0]}]},principal,session,'stream',{page:0,snapshot:'f'.repeat(64)}),e=>e.code==='NATIVE_SALARY_CONTRACT_INVALID');
 assert.equal(salaryError(Error('NATIVE_SALARY_SNAPSHOT_CHANGED')).status,409);
});
test('legacy unsegmented response never emits more than the platform-safe complete-response budget',async()=>{
 const huge={...bootstrap(),untrustedPadding:'x'.repeat(4*1024*1024)};
 await assert.rejects(salaryOperation({query:async()=>[{result:huge}]},principal,session,'bootstrap'),e=>e.code==='NATIVE_SALARY_STREAM_REQUIRED'&&e.status===409);
});
