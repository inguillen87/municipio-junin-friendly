// Proposed source only. Requires the employees-phase R1 API overlay; no imports or tests executed by preparation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createInternalDataHandler} from '../api/internal-data.js';
import {binding,principal,session,CONTRACT} from './fixtures/employment-adoption-history-synthetic.js';
import {currentSnapshot,directoryRows} from './fixtures/native-current-directory-synthetic.js';

const copy=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const PHASES=['access','source_client','source_identity','native_client','native_before','directory','native_after','source_bookend','response','request'];
const DIAGNOSTIC_KEYS=['version','phase','event','step','elapsedMs','durationMs','outcome'].sort();
function assertSchema(records){
 assert.ok(records.length>0,'the patched handler must actually emit telemetry');
 for(const value of records){
  assert.deepEqual(Object.keys(value).sort(),DIAGNOSTIC_KEYS);
  assert.equal(value.version,'employees-read-phase.v1');assert.ok(PHASES.includes(value.phase));
  assert.ok(['start','end','finish'].includes(value.event));
  assert.ok(Number.isSafeInteger(value.step)&&value.step>=0);
  for(const key of ['elapsedMs','durationMs'])assert.ok(value[key]===null||Number.isSafeInteger(value[key])&&value[key]>=0,key);
  assert.ok([null,'fulfilled','rejected'].includes(value.outcome));
 }
}
const endFor=(records,phase)=>records.find(v=>v.phase===phase&&v.event==='end');
function fixture(t,options={}){
 const person=copy(principal),currentSession=copy(session),records=[],failures=[],operations=[],sqlCalls=[],accessOptions=[];
 const gates=new Map(),pending=[];
 let nowValue=1000,sourceReads=0,nativeReads=0,clockCalls=0;
 const gate=key=>{if(!gates.has(key))gates.set(key,{entered:deferred(),reply:deferred()});return gates.get(key);};
 if(options.pauseAt)gate(options.pauseAt);
 const hold=async key=>{const item=gates.get(key);if(item){item.entered.resolve();await item.reply.promise;}};
 const invoke=async name=>{
  operations.push(name);await hold(name);
  if(options.failAt===name)throw options.failure;
 };
 const res={headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.code=value;return this;},json(value){
  operations.push('response');if(options.onResponse)options.onResponse();
  this.body=value;return this;
 }};
 const sql={async query(statement,parameters=[]){
  sqlCalls.push({statement,parameters:copy(parameters)});
  if(statement.includes('effective-source:snapshot')){
   const ordinal=++sourceReads,name=ordinal===1?'source_identity':'source_bookend';await invoke(name);
   if(options.nativeOnly)return[];
   return[{token:(ordinal===2&&options.sourceChanged?'b':'c').repeat(64)}];
  }
  if(statement.startsWith('SELECT public.native_employee_directory_snapshot')){
   const ordinal=++nativeReads;operations.push('native_snapshot');await hold(ordinal===1?'native_before':'native_after');
   if(ordinal===2&&options.nativeRevoked)throw Error('NATIVE_EMPLOYEE_FORBIDDEN');
   const patch=options.nativeOnly?{}:{imported:1};
   if(ordinal===1&&options.remainingImported)patch.imported=1;
   if(ordinal===2&&options.nativeChanged)patch.token='b'.repeat(64);
   if(ordinal===2&&options.scopeChanged)patch.scope={...currentSnapshot().scope,companyId:7};
   return[{result:currentSnapshot(57,patch)}];
  }
  if(statement.includes('__total')){
   await invoke('directory');
   if(options.directoryGate){
    const selected=options.directoryGate(parameters);if(selected){selected.entered.resolve();await selected.reply.promise;}
   }
   return directoryRows(options.missingRows?56:options.nativeOnly?57:58);
  }
  throw Error('Unexpected synthetic query boundary');
 }};
 const handler=createInternalDataHandler({
  env:{FRIENDLY_GRH_SOURCE_DATABASE:binding.database,FRIENDLY_GRH_COMPANY_ID:String(binding.companyId)},
  requireCompatibleInternalAccess:async(_req,response,policy)=>{
   accessOptions.push(copy(policy));await invoke('access');
   if(options.authStatus){
    response.status(options.authStatus).json({ok:false,code:options.authStatus===401?'IDENTITY_SESSION_INVALID':'IDENTITY_CAPABILITY_REQUIRED'});
    return null;
   }
   return{mode:'managed',principal:person};
  },
  getInternalSql:async()=>{await invoke('source_client');return sql;},
  getActionCenterSql:async()=>{await invoke('native_client');return sql;},
  actionMutationSession:()=>currentSession,
  reportReadFailure:value=>failures.push(copy(value)),
  reportEmployeesPhase:value=>{records.push(value);return options.report?.(value);},
  employeesPhaseNow:()=>{clockCalls++;return options.clock?options.clock():nowValue;},
 });
 const run=(request={method:'GET',query:{resource:'employees',status:'all'}},response=res)=>{
  const value=handler(request,response);pending.push(value);return value;
 };
 t.after(async()=>{
  for(const item of gates.values())item.reply.resolve();
  if(options.releaseExtra)options.releaseExtra();
  await Promise.allSettled(pending);
 });
 return{run,handler,res,records,failures,operations,sqlCalls,accessOptions,principal:person,session:currentSession,gate,
  get sourceReads(){return sourceReads;},get nativeReads(){return nativeReads;},get clockCalls(){return clockCalls;},
  set time(value){nowValue=value;}};
}

test('1 complete managed directory preserves typed rows, filters, policy, source/native bookends and HTTP headers',{timeout:5000},async t=>{
 const f=fixture(t);await f.run({method:'GET',query:{resource:'employees',status:'all',page:'2',limit:'2',search:'Needle Marker',sector:'QA Sector',organization:'QA Org',agreement:'7'}});
 assert.equal(f.res.code,200);assert.equal(f.res.body.ok,true);
 assert.deepEqual(f.res.body.data,[{contractId:CONTRACT,recordOrigin:'MUNICONTROL',nombre:'PERSONA SINTÉTICA',legajo:'A/07',activo:false,administrativeStatus:'unknown'}]);
 assert.deepEqual(f.res.body.pagination,{page:2,limit:2,total:58,pages:29});
 assert.equal(f.res.body.scope.authority,'GRH_AND_MUNICONTROL');assert.equal(f.res.body.scope.totalContracts,58);
 assert.deepEqual(f.res.body.facets,{sectors:[],organizations:[],agreements:[]});
 assert.deepEqual(f.operations,['access','source_client','source_identity','native_client','native_snapshot','directory','native_client','native_snapshot','source_bookend','response']);
 assert.equal(f.sqlCalls.length,5);assert.equal(f.nativeReads,2);assert.equal(f.sourceReads,2);
 const directory=f.sqlCalls.find(call=>call.statement.includes('__total'));
 assert.deepEqual(directory.parameters.slice(0,3),[binding.database,binding.companyId,principal.tenant.id]);
 assert.deepEqual(directory.parameters.slice(-2),[2,2]);
 for(const value of ['%Needle Marker%','%Needle%','%Marker%','QA Sector','QA Org','7'])assert.ok(directory.parameters.includes(value),value);
 const context=JSON.parse(directory.parameters[3]);assert.equal(context.tenantId,principal.tenant.id);assert.equal(context.membershipId,principal.tenant.membershipId);
 assert.deepEqual(f.accessOptions[0].requiredCapabilities,['workforce.employee.read']);
 for(const key of ['requireDataPlaneReady','requireCertifiedDataBinding'])assert.equal(f.accessOptions[0][key],true);
 assert.equal(f.accessOptions[0].allowLegacy,false);
 assert.deepEqual(f.res.headers,{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie','X-Content-Type-Options':'nosniff'});
 assertSchema(f.records);
 assert.deepEqual(f.records.filter(v=>v.event==='start').map(v=>v.phase),['request','access','source_client','source_identity','native_before','directory','native_after','source_bookend','response']);
 assert.deepEqual(f.records.filter(v=>v.event==='end').map(v=>v.phase),['access','source_client','source_identity','native_before','directory','native_after','source_bookend','response']);
 assert.ok(f.records.filter(v=>v.event==='end').every(v=>v.outcome==='fulfilled'));
 assert.equal(f.records.at(-1).event,'finish');assert.equal(f.records.at(-1).phase,'request');
});

test('2 each retained real read exposes its own start before completion and advances no later operation',{timeout:5000},async t=>{
 for(const phase of ['access','source_client','source_identity','native_before','directory','native_after','source_bookend']){
  const f=fixture(t,{pauseAt:phase}),held=f.gate(phase);let settled=false;
  const pending=f.run().finally(()=>{settled=true;});await held.entered.promise;
  assert.equal(settled,false,phase);assert.equal(f.res.code,undefined,phase);
  assert.equal(f.records.at(-1).phase,phase);assert.equal(f.records.at(-1).event,'start');
  assert.equal(endFor(f.records,phase),undefined,phase);
  const operations=[...f.operations],calls=f.sqlCalls.length;
  await flush();assert.deepEqual(f.operations,operations);assert.equal(f.sqlCalls.length,calls);assert.equal(settled,false);
  f.time=1800;held.reply.resolve();await pending;
  assert.equal(f.res.code,200,phase);assert.equal(endFor(f.records,phase).durationMs,800,phase);
  assert.equal(endFor(f.records,phase).outcome,'fulfilled');assert.equal(f.records.at(-1).event,'finish');
 }
});

test('3 native-only fallback retains complete cohort guards and source/native changes never return retired rows',{timeout:5000},async t=>{
 const success=fixture(t,{nativeOnly:true});await success.run();
 assert.equal(success.res.code,200);assert.equal(success.res.body.scope.authority,'MUNICONTROL');
 assert.equal(success.res.body.scope.totalContracts,57);assert.equal(success.nativeReads,2);
 assert.equal(endFor(success.records,'source_identity').outcome,'rejected');
 assert.equal(success.records.some(v=>v.phase==='source_bookend'),false);
 assert.deepEqual(success.operations,['access','source_client','source_identity','native_client','native_snapshot','directory','native_snapshot','response']);
 for(const [options,status,code]of[
  [{nativeOnly:true,remainingImported:true},503,'INTERNAL_DATA_UNAVAILABLE'],
  [{nativeOnly:true,nativeChanged:true},409,'NATIVE_EMPLOYEE_READ_CHANGED'],
  [{nativeOnly:true,scopeChanged:true},409,'NATIVE_EMPLOYEE_READ_SCOPE_CHANGED'],
  [{nativeOnly:true,nativeRevoked:true},403,'NATIVE_EMPLOYEE_READ_FORBIDDEN'],
  [{nativeOnly:true,missingRows:true},409,'NATIVE_EMPLOYEE_READ_CHANGED'],
  [{sourceChanged:true},503,'GRH_SOURCE_CHANGED'],
 ]){
  const f=fixture(t,options);await f.run();
  assert.equal(f.res.code,status);assert.equal(f.res.body.code,code);assert.equal(f.res.body.data,undefined);
  assert.equal(f.records.at(-1).event,'finish');assert.equal(f.operations.filter(v=>v==='response').length,1);
  if(options.remainingImported){assert.equal(f.nativeReads,1);assert.equal(f.operations.includes('directory'),false);}
  if(options.sourceChanged){assert.equal(f.sourceReads,2);assert.equal(endFor(f.records,'source_bookend').outcome,'rejected');}
 }
});

test('4 denied access reaches no SQL and logger failures cannot replace the original error or create an unhandled rejection',{timeout:5000},async t=>{
 for(const status of[401,403]){
  const f=fixture(t,{authStatus:status});await f.run();
  assert.equal(f.res.code,status);assert.equal(f.sqlCalls.length,0);
  assert.deepEqual(f.operations,['access','response']);
  assert.deepEqual(f.records.filter(v=>v.event==='start').map(v=>v.phase),['request','access']);
  assert.equal(f.records.at(-1).event,'finish');
 }
 const unhandled=[],onUnhandled=error=>unhandled.push(error);process.on('unhandledRejection',onUnhandled);
 try{
  for(const mode of['throws','rejects']){
   const receivers=[],failure=new Error('PRIVATE_ERROR_MARKER');
   Object.defineProperty(failure,'code',{get(){receivers.push(this);return'57014';}});
   const f=fixture(t,{failAt:'directory',failure,report:()=>{if(mode==='throws')throw Error('OBSERVER_FAILURE');return Promise.reject(Error('OBSERVER_REJECTION'));}});
   await f.run();await flush();await flush();
   assert.equal(f.res.code,503);assert.equal(f.res.body.code,'INTERNAL_DATA_UNAVAILABLE');
   assert.equal(f.res.body.retryable,true);assert.match(f.res.body.requestId,/^[a-f0-9-]{36}$/);
   assert.equal(f.res.body.data,undefined);assert.equal(f.sqlCalls.filter(v=>v.statement.includes('__total')).length,1);
   assert.ok(receivers.length>0);assert.ok(receivers.every(receiver=>receiver===failure),'classification must receive the very error thrown by the real read');
   assert.equal(endFor(f.records,'directory').outcome,'rejected');
   assert.equal(f.operations.includes('source_bookend'),false);assert.equal(f.nativeReads,1);
   assert.equal(JSON.stringify(f.records).includes(failure.message),false);
  }
  assert.deepEqual(unhandled,[]);
 }finally{process.removeListener('unhandledRejection',onUnhandled);}
});

test('5 the diagnostic schema and frozen records expose no request, row, scope, identity, query or error values',{timeout:5000},async t=>{
 const frozen=[],mutations=[];
 const f=fixture(t,{report:value=>{frozen.push(Object.isFrozen(value));try{value.phase='PRIVATE_MUTATION_MARKER';}catch(error){mutations.push(error);}}});
 const request={method:'GET',query:{resource:'employees',status:'all',search:'PRIVATE_FILTER_MARKER'},headers:{cookie:'PRIVATE_COOKIE_MARKER'},body:{ignored:'PRIVATE_BODY_MARKER'}};
 await f.run(request);assert.equal(f.res.code,200);assertSchema(f.records);
 assert.ok(frozen.length>0&&frozen.every(Boolean));assert.equal(mutations.length,frozen.length);
 const text=JSON.stringify(f.records);
 for(const value of ['PRIVATE_FILTER_MARKER','PRIVATE_COOKIE_MARKER','PRIVATE_BODY_MARKER','PRIVATE_MUTATION_MARKER',
  f.principal.user.email,f.principal.tenant.id,f.principal.tenant.membershipId,f.session.id,binding.database,CONTRACT,
  'PERSONA SINTÉTICA','A/07','effective-source:snapshot','native_employee_directory_snapshot_v1']){
  assert.equal(text.includes(value),false,value);
 }
 const errorCase=fixture(t,{failAt:'source_client',failure:Object.assign(Error('PRIVATE_QUERY_ERROR_MARKER'),{code:'57014',detail:'PRIVATE_DETAIL_MARKER',query:'PRIVATE_QUERY_MARKER'})});
 await errorCase.run();assert.equal(errorCase.res.code,503);assertSchema(errorCase.records);
 for(const value of['PRIVATE_QUERY_ERROR_MARKER','PRIVATE_DETAIL_MARKER','PRIVATE_QUERY_MARKER','57014',errorCase.res.body.requestId]){
  assert.equal(JSON.stringify(errorCase.records).includes(value),false,value);
 }
});

test('6 unavailable or regressive clocks remain unknown and valid real zero remains zero without changing the response',{timeout:5000},async t=>{
 const backward=()=>{let value=1000;return()=>--value;};
 for(const clock of[()=>undefined,()=>{throw Error('CLOCK_FAILURE');},()=>NaN,()=>Infinity,backward()]){
  const f=fixture(t,{clock});await f.run();assert.equal(f.res.code,200);assertSchema(f.records);
  assert.ok(f.records.every(value=>value.elapsedMs===null&&value.durationMs===null));
  assert.equal(f.nativeReads,2);assert.equal(f.sourceReads,2);
 }
 const zero=fixture(t,{clock:()=>0});await zero.run();assert.equal(zero.res.code,200);
 assert.ok(zero.records.every(value=>value.elapsedMs===0));
 assert.ok(zero.records.filter(value=>value.event==='end'||value.event==='finish').every(value=>value.durationMs===0));
});

test('7 other resources and method rejection do not call the employees logger or clock and preserve existing response paths',{timeout:5000},async t=>{
 for(const resource of['summary','employee']){
  const failure=Object.assign(Error('NON_EMPLOYEES_SOURCE_CLIENT_FAILURE'),{code:'57014'});
  const f=fixture(t,{failAt:'source_client',failure});await f.run({method:'GET',query:{resource}});
  assert.equal(f.res.code,503);assert.equal(f.res.body.code,'INTERNAL_DATA_UNAVAILABLE');
  assert.equal(f.records.length,0);assert.equal(f.clockCalls,0);assert.equal(f.sqlCalls.length,0);
  assert.deepEqual(f.operations,['access','source_client','response']);
 }
 const denied=fixture(t);await denied.run({method:'POST',query:{resource:'employees'}});
 assert.equal(denied.res.code,405);assert.equal(denied.res.body.code,'METHOD_NOT_ALLOWED');
 assert.equal(denied.res.headers.Allow,'GET');assert.equal(denied.records.length,0);assert.equal(denied.clockCalls,0);assert.equal(denied.operations.includes('access'),false);
 const picker=fixture(t);await picker.run({method:'GET',query:{resource:'employees',status:'all',view:'invalid-picker'}});
 assert.equal(picker.res.code,400);assert.equal(picker.res.body.code,'DIRECTORY_PICKER_INVALID');
 assert.equal(picker.operations.includes('directory'),false);assert.equal(picker.nativeReads,2);assert.equal(picker.sourceReads,2);
 assertSchema(picker.records);assert.equal(endFor(picker.records,'directory').outcome,'fulfilled','400 is a returned application result, not a thrown read');
});

test('8 concurrent requests keep independent traces and withdrawing capabilities during a retained read exposes no late rows',{timeout:5000},async t=>{
 const context=new AsyncLocalStorage(),groups=new Map([['A',[]],['B',[]]]),times=new Map([['A',1000],['B',10000]]);
 const heldA={entered:deferred(),reply:deferred()},heldB={entered:deferred(),reply:deferred()};
 const f=fixture(t,{clock:()=>times.get(context.getStore()),report:value=>groups.get(context.getStore()).push(value),
  directoryGate:parameters=>parameters.some(v=>typeof v==='string'&&v.includes('REQUEST_A'))?heldA:heldB,
  releaseExtra:()=>{heldA.reply.resolve();heldB.reply.resolve();}});
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
 const a=response(),b=response();
 const pendingA=context.run('A',()=>f.run({method:'GET',query:{resource:'employees',status:'all',search:'REQUEST_A'}},a));await heldA.entered.promise;
 const pendingB=context.run('B',()=>f.run({method:'GET',query:{resource:'employees',status:'all',search:'REQUEST_B'}},b));await heldB.entered.promise;
 assert.equal(a.code,undefined);assert.equal(b.code,undefined);
 times.set('B',10175);heldB.reply.resolve();await pendingB;assert.equal(b.code,200);assert.equal(a.code,undefined);
 times.set('A',1800);heldA.reply.resolve();await pendingA;assert.equal(a.code,200);
 for(const [name,duration]of[['A',800],['B',175]]){
  const records=groups.get(name);assertSchema(records);
  assert.equal(records[0].phase,'request');assert.equal(records[0].step,0);
  assert.equal(records.find(v=>v.phase==='access'&&v.event==='start').step,1);
  assert.equal(endFor(records,'directory').durationMs,duration);
  assert.deepEqual(records.filter(v=>v.event==='start'&&v.phase!=='request').map(v=>v.step),[1,2,3,4,5,6,7,8]);
  assert.equal(records.at(-1).event,'finish');
 }
 const withdrawn=fixture(t,{pauseAt:'directory'}),blocked=withdrawn.gate('directory'),pending=withdrawn.run();
 await blocked.entered.promise;withdrawn.principal.tenant.effectiveCapabilities=[];blocked.reply.resolve();await pending;
 assert.equal(withdrawn.res.code,403);assert.equal(withdrawn.res.body.code,'NATIVE_EMPLOYEE_READ_FORBIDDEN');
 assert.equal(withdrawn.res.body.data,undefined);assert.equal(withdrawn.nativeReads,1);
 assert.equal(endFor(withdrawn.records,'native_after').outcome,'rejected');
 assert.equal(withdrawn.operations.includes('source_bookend'),false);assert.equal(withdrawn.records.at(-1).event,'finish');
});
