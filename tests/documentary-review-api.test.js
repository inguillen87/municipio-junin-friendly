import test from 'node:test';import assert from 'node:assert/strict';
import {createLegalRegistryHandler} from '../api/internal-legal-registry.js';
import {documentaryReview} from '../lib/internal-documentary-review.js';
import {access,session,TENANT,MEMBER} from './fixtures/legal-registry-synthetic.js';
import {documentaryFixture} from './fixtures/documentary-review-synthetic.js';
function response(){return{headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};}
const req=(q={resource:'documentary_review',filter:'all',page:'1'})=>({method:'GET',url:'/?'+new URLSearchParams(q),query:q,headers:{}});
function setup({principal=access(['legal.norm.read']),value=documentaryFixture(),error=null}={}){const calls=[];let contract;
 const sql={query:async(text,args)=>{calls.push({text,args});if(error)throw error;return[{result:value}];}};
 const h=createLegalRegistryHandler({authorize:async(_req,res,c)=>{contract=c;if(principal===null){res.status(401).json({ok:false});return null;}return principal;},getSql:async()=>sql});return{h,calls,sql,get contract(){return contract;}};
}
test('documentary resource uses managed read capability and private caching',async()=>{const t=setup(),res=response();await t.h(req(),res);assert.equal(res.statusCode,200);assert.match(res.headers['Cache-Control'],/private.*no-store/);assert.deepEqual(t.contract.requiredCapabilities,['legal.norm.read']);assert.equal(t.contract.allowLegacy,false);assert.equal(t.contract.requireCertifiedDataBinding,false);assert.equal(res.value.data.summary.all,26);});
test('SQL statement binds membership and tenant from authenticated context',async()=>{const t=setup();await documentaryReview(t.sql,access().principal,session,{filter:'all',page:1});assert.equal(t.calls.length,1);assert.equal(t.calls[0].text,'SELECT public.legal_documentary_review_v1($1::jsonb,$2::jsonb) AS result');const context=JSON.parse(t.calls[0].args[0]);assert.equal(context.tenantId,TENANT);assert.equal(context.membershipId,MEMBER);});
test('anonymous, legacy and wrong capabilities never reach the database',async()=>{for(const principal of [null,{...access(),mode:'legacy'},access(['payroll.read'])]){const t=setup({principal}),res=response();await t.h(req(),res);assert.ok([401,403].includes(res.statusCode));assert.equal(t.calls.length,0);}});
test('query cannot supply tenant or extra authority and cannot duplicate fields',async()=>{
 for(const q of [{resource:'documentary_review',filter:'all',page:'1',tenantId:TENANT},{resource:'documentary_review',filter:'all',page:'0'},{resource:'documentary_review',filter:'other',page:'1'}]){const t=setup(),res=response();await t.h(req(q),res);assert.equal(res.statusCode,422);assert.equal(t.calls.length,0);}
 const t=setup(),r=req(),res=response();r.url+='&filter=projects';await t.h(r,res);assert.equal(res.statusCode,422);assert.equal(t.calls.length,0);
});
test('POST cannot turn the documentary resource into a write',async()=>{const t=setup(),r=req(),res=response();r.method='POST';await t.h(r,res);assert.equal(res.statusCode,422);assert.equal(t.calls.length,0);});
test('mismatched output page and filter fail without displaying misleading data',async()=>{for(const value of [documentaryFixture('projects'),documentaryFixture('all',2)]){const t=setup({value}),res=response();await t.h(req(),res);assert.equal(res.statusCode,503);assert.equal(res.value.data,undefined);}});
test('upstream malformed or missing data is not replaced with zeroes',async()=>{const t=setup({value:null}),res=response();await t.h(req(),res);assert.equal(res.statusCode,503);assert.equal(res.value.data,undefined);});
test('database failures do not expose raw query or credentials',async()=>{const t=setup({error:Error('SELECT confidential_connection')}),res=response();await t.h(req(),res);assert.equal(res.statusCode,503);assert.doesNotMatch(JSON.stringify(res.value),/confidential|SELECT/);});
