// Pure QA wiring/authority/evidence guards. No socket, browser, SQL or e2e PASS.
import test from 'node:test';import assert from 'node:assert/strict';
import {noeliaCircuitEndpoint,withNoeliaNativeEmployeeHandler} from '../scripts/lib/noelia-payroll-circuit-browser.mjs';
import {withNativeEmployeeCreationActor,validateNativeEmployeeUiCreation} from '../scripts/lib/native-employee-payroll-circuit-qa.mjs';
import {createNativeEmployeeHandler} from '../api/internal-native-employees.js';
import {employeeScopeKey} from '../assets/native-employee-confirmation-model.js';
import {draft as fixtureDraft,bootstrap as fixtureBootstrap,receipt as fixtureReceipt,principal,session,ID} from './fixtures/native-employee-synthetic.js';

const bootstrap=()=>({...structuredClone(fixtureBootstrap),catalog:{...structuredClone(fixtureBootstrap.catalog),origin:'MUNICONTROL'}});
function actors(){
 const maker={principal:structuredClone(principal),session:structuredClone(session)};maker.principal.tenant.effectiveCapabilities=['workforce.employee.read'];
 const checker=structuredClone(maker);checker.principal.user.email=checker.session.email='checker@example.invalid';checker.principal.tenant.membershipId='66666666-6666-4666-8666-666666666666';checker.session.id='77777777-7777-4777-8777-777777777777';
 let current=maker;return {maker,checker,getCurrent:()=>current,setCurrent:value=>{current=value;}};
}
function uiEvidence(){
 const boot=bootstrap(),draft=fixtureDraft({jurisdictionCode:'42'}),receipt={...fixtureReceipt,jurisdictionCode:'42'},body={draft,catalogVersion:boot.catalog.version};
 return {boot,draft,value:{receipt,recovered:{...receipt,replayed:true},key:ID,scope:employeeScopeKey(boot.scope),body,bodyText:JSON.stringify(body),networkHttpCreation:true,uiCreation:true,authenticationFixture:true,sameServer:true,ackLostAfterCommit:true,browserPosts:1,recoveryGets:1}};
}
test('the existing server routes the native endpoint exactly and preserves every previous route',()=>{
 for(const [pathname,kind]of [['/api/internal-native-employees','nativeEmployee'],['/api/internal-own-payroll-novelties','novelty'],['/api/internal-own-payroll-run','run'],['/api/internal-own-payroll-program','program'],['/api/internal-own-payroll-liquidation','liquidation'],['/api/internal-own-payroll-close','close'],['/api/internal-own-payroll-receipts','receipt'],['/api/internal-employment-catalog','catalog'],['/api/internal-data','directory']])assert.equal(noeliaCircuitEndpoint(pathname),kind);
 for(const pathname of ['/api/internal-native-employees/','/api/internal-native-employees?resource=bootstrap','/api/internal-native-employees-unsafe','/api/internal-actions','toString'])assert.equal(noeliaCircuitEndpoint(pathname),null);
});
test('native handler registration uses the exact supplied callback and removes the route after success',async()=>{
 const old=()=>{},handler=()=>{},handlers={run:old};let calls=0;
 assert.equal(await withNoeliaNativeEmployeeHandler(handlers,handler,async()=>{calls++;assert.equal(handlers[noeliaCircuitEndpoint('/api/internal-native-employees')],handler);assert.equal(handlers.run,old);return 'done';}),'done');
 assert.equal(calls,1);assert.deepEqual(handlers,{run:old});
});
test('native handler registration cleans up the route on failure and refuses replacing another owner',async()=>{
 const handlers={},handler=()=>{},failure=Error('synthetic callback failure');await assert.rejects(withNoeliaNativeEmployeeHandler(handlers,handler,async()=>{throw failure;}),error=>error===failure);assert.equal(Object.hasOwn(handlers,'nativeEmployee'),false);
 handlers.nativeEmployee=handler;let called=false;await assert.rejects(withNoeliaNativeEmployeeHandler(handlers,()=>{},async()=>{called=true;}),/QA_NATIVE_HANDLER_ALREADY_ACTIVE/);assert.equal(handlers.nativeEmployee,handler);assert.equal(called,false);
});
test('only the bootstrap-verified current maker receives a temporary capability without mutating identities',async()=>{
 const state=actors(),before=structuredClone(state.maker),checkerBefore=structuredClone(state.checker),boot=bootstrap();
 const result=await withNativeEmployeeCreationActor({...state,bootstrap:boot},async()=>{const current=state.getCurrent();assert.notEqual(current,state.maker);assert.deepEqual(current.session,state.maker.session);assert.equal(current.principal.tenant.id,boot.scope.tenantId);assert.equal(current.principal.tenant.membershipId,boot.scope.membershipId);assert.deepEqual(current.principal.tenant.effectiveCapabilities,['workforce.employee.read','employee.record.create']);return 'created phase';});
 assert.equal(result,'created phase');assert.equal(state.getCurrent(),state.maker);assert.deepEqual(state.maker,before);assert.deepEqual(state.checker,checkerBefore);
});
test('authority and route are both restored when the nested UI callback fails',async()=>{
 const state=actors(),handlers={},failure=Error('synthetic UI failure');await assert.rejects(withNativeEmployeeCreationActor({...state,bootstrap:bootstrap()},()=>withNoeliaNativeEmployeeHandler(handlers,()=>{},async()=>{state.setCurrent(state.checker);throw failure;})),error=>error===failure);assert.equal(state.getCurrent(),state.maker);assert.equal(Object.hasOwn(handlers,'nativeEmployee'),false);assert.deepEqual(state.maker.principal.tenant.effectiveCapabilities,['workforce.employee.read']);
});
test('a checker selected during the creation phase never inherits the maker capability or database access',async()=>{
 const state=actors(),env={INTERNAL_APP_ORIGIN:'https://qa.example.invalid'};let connections=0;
 const handler=createNativeEmployeeHandler({env,requireAccess:()=>({mode:'managed',principal:state.getCurrent().principal}),sessionFor:()=>state.getCurrent().session,getSql:()=>{connections++;throw Error('no SQL permitted in this pure test');}});
 await withNativeEmployeeCreationActor({...state,bootstrap:bootstrap()},async()=>{
  state.setCurrent(state.checker);const res={setHeader(){},status(value){this.code=value;return this;},json(value){this.value=value;return this;}};
  await handler({method:'POST',url:'/api/internal-native-employees',query:{},headers:{origin:env.INTERNAL_APP_ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':ID},body:'{}'},res);assert.equal(res.code,403);assert.equal(res.value.ok,false);assert.equal(connections,0);
 });assert.equal(state.getCurrent(),state.maker);
});
for(const mismatch of ['refused','foreignCatalog','scope','session','currentActor'])test('bootstrap '+mismatch+' cannot open the creation phase or call its callback',async()=>{
 const state=actors(),boot=bootstrap();if(mismatch==='refused')boot.canCreate=false;if(mismatch==='foreignCatalog')boot.catalog.origin='GRH';if(mismatch==='scope')boot.scope.membershipId=ID;if(mismatch==='session')state.maker.session.email='foreign@example.invalid';if(mismatch==='currentActor')state.setCurrent(state.checker);const prior=state.getCurrent();let called=false;
 await assert.rejects(withNativeEmployeeCreationActor({...state,bootstrap:boot},async()=>{called=true;}));assert.equal(called,false);assert.equal(state.getCurrent(),prior);
});
test('UI evidence binds the exact body/key/scope, initial receipt and recovered UUID without a predefined contract',()=>{
 const {boot,draft,value}=uiEvidence(),verified=validateNativeEmployeeUiCreation(value,{draft,bootstrap:boot});assert.equal(verified.receipt,value.receipt);assert.equal(verified.body,value.body);assert.equal(verified.key,ID);assert.equal(verified.evidence.contractId,value.receipt.contractId);assert.match(verified.evidence.bodySha256,/^[a-f0-9]{64}$/);
 const other=structuredClone(value);other.receipt.contractId=other.recovered.contractId='88888888-8888-4888-8888-888888888888';assert.equal(validateNativeEmployeeUiCreation(other,{draft,bootstrap:boot}).receipt.contractId,other.receipt.contractId);
});
test('UI evidence refuses invented transport flags, duplicate browser writes, missing fields and mismatched recovery',()=>{
 const {boot,draft,value}=uiEvidence();const mutations=[v=>{v.networkHttpCreation=false;},v=>{v.uiCreation=false;},v=>{v.authenticationFixture=false;},v=>{v.sameServer=false;},v=>{v.ackLostAfterCommit=false;},v=>{v.browserPosts=2;},v=>{v.recoveryGets=0;},v=>{delete v.bodyText;},v=>{v.extra=true;},v=>{v.scope+='-other';},v=>{v.key='not-a-key';},v=>{delete v.body.draft.legalReference;},v=>{v.body.catalogVersion='e'.repeat(64);},v=>{v.bodyText+=' ';},v=>{v.recovered.contractId=ID;},v=>{v.recovered.replayed=false;},v=>{v.receipt.payrollCalculated=true;}];
 for(const mutate of mutations){const altered=structuredClone(value);mutate(altered);assert.throws(()=>validateNativeEmployeeUiCreation(altered,{draft,bootstrap:boot}));}
});
