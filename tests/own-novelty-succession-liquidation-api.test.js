import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';
import {OWN_LIQ_REVIEW} from '../assets/own-payroll-liquidation-model.js';
import {command} from './fixtures/own-payroll-liquidation-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

test('obsolete capture confirmation returns an actionable conflict without another command or source disclosure',async()=>{
 const body=command(),key=uid(9),calls=[],principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_LIQ_REVIEW}},session={email:'qa@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
 const handler=createOwnLiquidationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(query,values)=>{calls.push({query,values});throw Object.assign(new Error('OWN_LIQ_SOURCE_CHANGED; internal private source detail'),{code:'P0001'});}})});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};
 await handler({method:'POST',url:'/api/internal-own-payroll-liquidation',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':key},body:JSON.stringify({operation:'command',payload:body})},res);
 assert.equal(res.statusCode,409);assert.equal(res.value.code,'OWN_LIQ_SOURCE_CHANGED');
 assert.match(res.value.error,/prepará un cálculo nuevo/);assert.equal(JSON.stringify(res.value).includes('internal private'),false);
 assert.equal(calls.length,1);assert.match(calls[0].query,/own_liquidation_command_v1/);assert.deepEqual(JSON.parse(calls[0].values[1]),body);assert.equal(calls[0].values[2],key);
 assert.equal(res.value.data,undefined);assert.ok(res.headers['Cache-Control'].includes('no-store'));
});
