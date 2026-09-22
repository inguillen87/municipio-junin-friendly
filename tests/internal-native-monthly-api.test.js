import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalPayrollNoveltiesHandler} from '../api/internal-payroll-novelties.js';
const uid=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const res=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}});
function setup(overrides={}) {
  const calls=[];
  const invoke=name=>async(...args)=>{calls.push({name,args});return name==='employeeV2'?{version:'payroll-novelty-employee.v2',subject:{contractId:args[3]}}:{replayed:true,data:{id:uid(4),status:'draft'}};};
  const deps={env:{NODE_ENV:'test',INTERNAL_APP_ORIGIN:'https://municipio.example',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:'a'.repeat(40)},
    requireCompatibleInternalAccess:async()=>({mode:'managed',session:{id:uid(3),email:'qa@example.test',version:1},principal:{user:{email:'qa@example.test'},tenant:{id:uid(1),membershipId:uid(2),source:'membership',certifiedReleaseSha:'a'.repeat(40)}}}),
    getInternalSql:async()=>({query(){throw Error('Unreviewed SQL');}}),getPayrollNoveltyBootstrap:invoke('bootstrapV1'),getPayrollNoveltyBootstrapV2:invoke('bootstrapV2'),
    getPayrollNoveltyEmployeeV2:invoke('employeeV2'),readPayrollNoveltyV2:invoke('detailV2'),exportPayrollNoveltyV2:invoke('exportV2'),
    preparePayrollNovelty:invoke('prepareV1'),prepareNativePayrollNovelty:invoke('prepareV2'),transitionPayrollNoveltyV2:invoke('transitionV2'),...overrides};
  return {calls,handler:createInternalPayrollNoveltiesHandler(deps)};
}
const get=query=>({method:'GET',url:'/api/internal-payroll-novelties?'+new URLSearchParams(query),query,headers:{}});
const post=(native=true)=>({method:'POST',query:native?{version:'2'}:{},url:'/api/internal-payroll-novelties'+(native?'?version=2':''),headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':uid(7)},body:{command:'prepare',payload:{sourceMode:'individual',periodMonth:'2026-10-01',payrollType:'monthly',rows:[]}}});

test('explicit v2 routes use their own facades while legacy requests remain v1',async()=>{
  for(const [request,name] of [[get({resource:'bootstrap'}),'bootstrapV1'],[get({resource:'bootstrap',version:'2'}),'bootstrapV2'],[get({resource:'employee',version:'2',contractId:uid(8)}),'employeeV2'],[get({resource:'detail',version:'2',id:uid(4)}),'detailV2'],[get({resource:'export',version:'2',id:uid(4)}),'exportV2'],[post(false),'prepareV1'],[post(true),'prepareV2']]){
    const {handler,calls}=setup(),response=res();await handler(request,response);
    assert.ok([200,201].includes(response.statusCode),name);assert.equal(calls.length,1);assert.equal(calls[0].name,name);
    if(request.method==='POST')assert.equal(response.headers['Idempotency-Replayed'],'true');
  }
});

test('versioned queries reject duplicates, arrays, mismatch and external identity before authentication',async()=>{
  let authorities=0,sqlCalls=0;
  const requests=[get({resource:'bootstrap',version:'3'}),get({resource:'employee',version:'2',contractId:uid(8),tenantId:uid(99)}),get({resource:'bootstrap',version:'2',id:uid(4)}),get({version:'2'}),{...get({resource:'bootstrap',version:'2'}),query:{resource:'bootstrap',version:['2']}},{...get({resource:'bootstrap',version:'2'}),url:'/api/internal-payroll-novelties?resource=bootstrap&version=2&version=2'},{...get({resource:'employee',version:'2',contractId:uid(8)}),url:'/api/internal-payroll-novelties?resource=employee&version=2&contractId='+uid(9)},{...post(),url:'/api/internal-payroll-novelties?version=2&command=prepare',query:{version:'2',command:'prepare'}}];
  for(const request of requests){const {handler}=setup({requireCompatibleInternalAccess:async()=>{authorities++;},getInternalSql:async()=>{sqlCalls++;}});const response=res();await handler(request,response);assert.equal(response.statusCode,400);}
  assert.equal(authorities,0);assert.equal(sqlCalls,0);
});

test('native commands retain same-origin, session and membership gates before business calls',async()=>{
  const cross=post();cross.headers.origin='https://other.example';const a=setup(),ra=res();await a.handler(cross,ra);assert.equal(ra.statusCode,403);assert.equal(a.calls.length,0);
  let bodyReads=0;const denied=post();Object.defineProperty(denied,'body',{get(){bodyReads++;return {};}});
  const b=setup({requireCompatibleInternalAccess:async(_req,res)=>{res.status(401).json({ok:false});return null;}}),rb=res();await b.handler(denied,rb);assert.equal(rb.statusCode,401);assert.equal(bodyReads,0);assert.equal(b.calls.length,0);
  const c=setup({requireCompatibleInternalAccess:async()=>({mode:'legacy',principal:{}})}),rc=res();await c.handler(get({resource:'bootstrap',version:'2'}),rc);assert.equal(rc.statusCode,403);assert.equal(c.calls.length,0);
});

test('native transition preserves the exact command payload and client idempotency key',async()=>{
  const request=post();request.body={command:'submit',payload:{batchId:uid(4),expectedVersion:1,reasonCode:'ready_for_review',reasonReference:null}};
  const {handler,calls}=setup(),response=res();await handler(request,response);
  assert.equal(response.statusCode,200);assert.equal(calls[0].name,'transitionV2');
  assert.equal(calls[0].args[3],'submit');assert.deepEqual(calls[0].args[4],request.body.payload);assert.equal(calls[0].args[5],uid(7));
});
