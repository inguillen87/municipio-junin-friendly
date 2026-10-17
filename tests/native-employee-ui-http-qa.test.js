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

// Additive pure transport-evidence guards. These packets are inputs to the QA
// validator; no handler, socket, SQL, browser or persisted receipt is simulated.
import {NATIVE_EMPLOYEE_UI_POSITIVE_STEPS,nativeEmployeePositiveUiAdapter,validateNativeEmployeeUiPositiveCommand,nativeEmployeePositiveUiApi} from '../scripts/lib/native-employee-payroll-circuit-qa.mjs';
import {OWN_RUN_COMMAND_VERSION} from '../assets/own-payroll-run-model.js';
import {prepare as positiveNoveltyPrepare,row as positiveNoveltyRow} from './fixtures/own-payroll-novelties-synthetic.js';
import {runCommand as positiveRunCommand} from './fixtures/own-payroll-run-synthetic.js';

const positiveTarget=Object.freeze({contractId:fixtureReceipt.contractId,legajo:fixtureReceipt.legajo});
const positiveOtherContract='88888888-8888-4888-8888-888888888888';
function positiveBody(kind,command){
 const selection={kind:'contracts',values:[positiveTarget.contractId]};
 if(kind==='novelty')return command==='prepare'
  ?positiveNoveltyPrepare(1,{rows:[positiveNoveltyRow(1,{contractId:positiveTarget.contractId,legajo:positiveTarget.legajo})]})
  :{command,batchId:ID,expectedRevision:1,reasonReference:null,reviewConfirmed:true};
 if(kind==='run')return positiveRunCommand({selection});
 if(kind==='receipt')return command==='prepare'
  ?{command,params:{contracts:[positiveTarget.contractId]},reviewConfirmed:false}
  :{command,batchId:ID,reviewConfirmed:true};
 return {command,selection,reviewConfirmed:true};
}
function positivePacket(kind,body,{key=ID,wireBody=body}={}){
 // Novedades' real receipt contract calls this field requestKey; the other
 // four command families call it key. Never add a fictitious key alias.
 const receipt={...(kind==='novelty'?{requestKey:key}:{key}),body:structuredClone(wireBody),replayed:false,id:positiveOtherContract,...(kind==='receipt'?{recordedAt:'2026-10-17T16:11:52.249052+00:00'}:{})};
 return {receipt,recovered:{...structuredClone(receipt),replayed:true},key,body:structuredClone(wireBody),
  bodyText:JSON.stringify({operation:kind==='run'?'calculate':'command',payload:wireBody}),
  browserPosts:1,recoveryGets:1,ackLostAfterCommit:true,committedStatus:201,postStatus:503,sameServer:true,authenticationFixture:true};
}
function positiveRunPacket(body,patch={}){
 return positivePacket('run',body,{wireBody:{...body,version:OWN_RUN_COMMAND_VERSION,liquidationDate:'2026-10-31',...patch}});
}
function positiveAdapter(command=async()=>{throw Error('unexpected positive callback');}){
 return {command,preview:async()=>{throw Error('unexpected preview');},download:async()=>{throw Error('unexpected download');}};
}

test('the positive UI contract preserves all eleven ordered writes and is immutable',()=>{
 assert.deepEqual(NATIVE_EMPLOYEE_UI_POSITIVE_STEPS,['novelty:prepare','novelty:submit','novelty:approve','run:calculate','liquidation:confirm','liquidation:annul','run:calculate','liquidation:confirm','close:close','receipt:prepare','receipt:approve']);
 assert.equal(Object.isFrozen(NATIVE_EMPLOYEE_UI_POSITIVE_STEPS),true);
 assert.throws(()=>NATIVE_EMPLOYEE_UI_POSITIVE_STEPS.push('receipt:prepare'),TypeError);
});

test('the positive adapter is all or none and requires the existing creation UI before any callback',()=>{
 let calls=0;const command=async()=>{calls++;},adapter={command,preview:command,download:command},createViaUi=()=>{};
 assert.equal(nativeEmployeePositiveUiAdapter(null,null),null);
 assert.equal(nativeEmployeePositiveUiAdapter(adapter,createViaUi),adapter);
 for(const incomplete of [undefined,[],{}, {command}, {command,preview:command}, {...adapter,download:null}, {...adapter,extra:command}]){
  assert.throws(()=>nativeEmployeePositiveUiAdapter(incomplete,createViaUi));
 }
 for(const missingCreation of [null,undefined,false,{}])assert.throws(()=>nativeEmployeePositiveUiAdapter(adapter,missingCreation),/QA_NATIVE_UI_CREATION_REQUIRED/);
 assert.equal(calls,0);
});

test('reads, forbidden negatives and successful replays use only the direct API with their exact arguments',async()=>{
 const directCalls=[],result=Object.freeze({direct:true});let targetReads=0,callbacks=0;
 const api=nativeEmployeePositiveUiApi({
  directApi:async(...args)=>{directCalls.push(args);return result;},
  adapter:positiveAdapter(async()=>{callbacks++;throw Error('must not route a negative/read/replay through UI');}),
  getTarget:()=>{targetReads++;throw Error('a direct call does not require a target');},commands:[],
 });
 const readQuery={resource:'attempt',key:ID},forbiddenBody={command:'prepare'},replayBody={command:'approve'};
 const cases=[['novelty',readQuery,undefined,undefined,200],['novelty',null,forbiddenBody,ID,403],['receipt',null,replayBody,ID,200],['run',{resource:'bootstrap'},undefined,undefined,201]];
 for(const args of cases)assert.equal(await api(...args),result);
 assert.deepEqual(directCalls,cases);assert.equal(directCalls[0][1],readQuery);assert.equal(directCalls[1][2],forbiddenBody);assert.equal(directCalls[2][2],replayBody);
 assert.equal(targetReads,0);assert.equal(callbacks,0);
});

test('the optional headless path keeps positive commands direct when no positive adapter is configured',async()=>{
 const body=positiveBody('novelty','prepare'),calls=[],result={direct:true};
 const api=nativeEmployeePositiveUiApi({directApi:async(...args)=>{calls.push(args);return result;},adapter:null,getTarget:()=>{throw Error('headless path must stay direct');},commands:[]});
 assert.equal(await api('novelty',null,body,ID,201),result);
 assert.deepEqual(calls,[['novelty',null,body,ID,201]]);
});

test('the positive UI adapter runs the eleven commands in order and never mutates through the direct API',async()=>{
 const commands=[],observed=[];let directCalls=0;
 const adapter=positiveAdapter(async input=>{
  observed.push(input);assert.equal(input.target,positiveTarget);
  return input.kind==='run'?positiveRunPacket(input.body):positivePacket(input.kind,input.body);
 });
 const api=nativeEmployeePositiveUiApi({directApi:async()=>{directCalls++;throw Error('positive UI command fell back to direct');},adapter,getTarget:()=>positiveTarget,commands});
 for(const step of NATIVE_EMPLOYEE_UI_POSITIVE_STEPS){
  const [kind,command]=step.split(':'),body=positiveBody(kind,command),receipt=await api(kind,null,body,undefined,201);
  assert.equal(receipt.replayed,false);assert.deepEqual(observed.at(-1).body,body);
  assert.equal(commands.at(-1).contractId,positiveTarget.contractId);assert.equal(commands.at(-1).kind,kind);assert.equal(commands.at(-1).command,command);
 }
 assert.equal(observed.length,11);assert.equal(commands.length,11);assert.equal(directCalls,0);
 assert.deepEqual(commands.filter(item=>item.kind==='run').map(item=>[item.commandVersion,item.liquidationDate]),[[OWN_RUN_COMMAND_VERSION,'2026-10-31'],[OWN_RUN_COMMAND_VERSION,'2026-10-31']]);
});

test('wrong order, caller attempt keys, query payloads and absent targets reject before the UI callback',async()=>{
 for(const invalid of ['order','key','query','target']){
  let callbacks=0,directCalls=0;const commands=[];
  const api=nativeEmployeePositiveUiApi({directApi:async()=>{directCalls++;},adapter:positiveAdapter(async()=>{callbacks++;}),getTarget:()=>invalid==='target'?null:positiveTarget,commands});
  const kind=invalid==='order'?'close':'novelty',body=positiveBody(kind,invalid==='order'?'close':'prepare');
  await assert.rejects(api(kind,invalid==='query'?{}:null,body,invalid==='key'?ID:undefined,201),/QA_NATIVE_UI_STEP_ORDER|QA_NATIVE_UI_OWNS_ATTEMPT_KEY|QA_NATIVE_UI_TARGET_REQUIRED|Expected values/);
  assert.equal(callbacks,0);assert.equal(directCalls,0);assert.deepEqual(commands,[]);
 }
});

test('a UI callback failure propagates unchanged without direct fallback or advancing the next command',async()=>{
 const failure=Error('synthetic UI transport failure'),commands=[],body=positiveBody('novelty','prepare');let calls=0,directCalls=0;
 const adapter=positiveAdapter(async()=>{calls++;throw failure;});
 const api=nativeEmployeePositiveUiApi({directApi:async()=>{directCalls++;},adapter,getTarget:()=>positiveTarget,commands});
 await assert.rejects(api('novelty',null,body,undefined,201),error=>error===failure);
 assert.equal(calls,1);assert.equal(directCalls,0);assert.deepEqual(commands,[]);
 adapter.command=async({kind,body})=>{calls++;return positivePacket(kind,body);};
 const receipt=await api('novelty',null,body,undefined,201);
 assert.equal(receipt.requestKey,ID);assert.equal(calls,2);assert.equal(directCalls,0);assert.equal(commands.length,1);
});

test('an invalid UI recovery packet never falls back to a direct positive write or advances the sequence',async()=>{
 const commands=[],body=positiveBody('novelty','prepare');let directCalls=0,callbacks=0;
 const adapter=positiveAdapter(async()=>{callbacks++;const packet=positivePacket('novelty',body);packet.recovered.replayed=false;return packet;});
 const api=nativeEmployeePositiveUiApi({directApi:async()=>{directCalls++;},adapter,getTarget:()=>positiveTarget,commands});
 await assert.rejects(api('novelty',null,body,undefined,201));
 assert.equal(callbacks,1);assert.equal(directCalls,0);assert.deepEqual(commands,[]);
});

test('novelty evidence accepts its real requestKey field without inventing a key alias',()=>{
 const body=positiveBody('novelty','prepare'),packet=positivePacket('novelty',body);
 assert.equal(Object.hasOwn(packet.receipt,'key'),false);assert.equal(packet.receipt.requestKey,ID);
 const evidence=validateNativeEmployeeUiPositiveCommand(packet,{kind:'novelty',body,target:positiveTarget});
 assert.equal(evidence.key,ID);assert.equal(evidence.contractId,positiveTarget.contractId);
 const altered=structuredClone(packet);altered.receipt.requestKey=positiveOtherContract;altered.recovered.requestKey=positiveOtherContract;
 assert.throws(()=>validateNativeEmployeeUiPositiveCommand(altered,{kind:'novelty',body,target:positiveTarget}));
});

test('positive command evidence rejects altered transport, body, attempt and recovered receipt identities',()=>{
 const kind='close',body=positiveBody(kind,'close'),packet=positivePacket(kind,body);
 const evidence=validateNativeEmployeeUiPositiveCommand(packet,{kind,body,target:positiveTarget});
 assert.match(evidence.bodySha256,/^[a-f0-9]{64}$/);assert.equal(evidence.contractId,positiveTarget.contractId);
 for(const mutate of [
  value=>{delete value.bodyText;},value=>{value.extra=true;},value=>{value.sameServer=false;},value=>{value.authenticationFixture=false;},
  value=>{value.ackLostAfterCommit=false;},value=>{value.browserPosts=2;},value=>{value.recoveryGets=0;},value=>{value.committedStatus=200;},value=>{value.postStatus=201;},
  value=>{value.key='not-a-uuid';},value=>{value.bodyText=JSON.stringify({operation:'calculate',payload:value.body});},
  value=>{value.bodyText=JSON.stringify({operation:'command',payload:{...value.body,selection:{kind:'all',values:[]}}});},
  value=>{value.bodyText=JSON.stringify({operation:'command',payload:value.body,extra:true});},
  value=>{value.bodyText='{';},value=>{value.body.command='reopen';},value=>{value.receipt.body.selection.values=[positiveOtherContract];},
  value=>{value.receipt.key=positiveOtherContract;},value=>{value.receipt.replayed=true;},value=>{value.recovered.replayed=false;},
  value=>{value.recovered.id=ID;},value=>{value.recovered.key=positiveOtherContract;},value=>{value.recovered.body.selection.values=[positiveOtherContract];},
 ]){
  const altered=structuredClone(packet);mutate(altered);
  assert.throws(()=>validateNativeEmployeeUiPositiveCommand(altered,{kind,body,target:positiveTarget}));
 }
 for(const absent of [null,[],undefined])assert.throws(()=>validateNativeEmployeeUiPositiveCommand(absent,{kind,body,target:positiveTarget}));
});

test('the new native UUID is the sole explicit novelty, calculation, decision, closing and receipt target',()=>{
 for(const kind of ['run','liquidation','close']){
  const command={run:'calculate',liquidation:'confirm',close:'close'}[kind];
  for(const selection of [{kind:'all',values:[]},{kind:'contracts',values:[positiveOtherContract]},{kind:'contracts',values:[positiveTarget.contractId,positiveOtherContract]}]){
   const body={...positiveBody(kind,command),selection},packet=kind==='run'?positiveRunPacket(body):positivePacket(kind,body);
   assert.throws(()=>validateNativeEmployeeUiPositiveCommand(packet,{kind,body,target:positiveTarget}),/QA_NATIVE_UI_TARGET_CHANGED/);
  }
 }
 for(const patch of [{contractId:positiveOtherContract},{legajo:'another-legajo'}]){
  const body=positiveBody('novelty','prepare');Object.assign(body.rows[0],patch);
  assert.throws(()=>validateNativeEmployeeUiPositiveCommand(positivePacket('novelty',body),{kind:'novelty',body,target:positiveTarget}));
 }
 const duplicate=positiveBody('novelty','prepare');duplicate.rows.push({...duplicate.rows[0],rowOrdinal:2});
 assert.throws(()=>validateNativeEmployeeUiPositiveCommand(positivePacket('novelty',duplicate),{kind:'novelty',body:duplicate,target:positiveTarget}));
 for(const contracts of [[],[positiveOtherContract],[positiveTarget.contractId,positiveOtherContract]]){
  const body=positiveBody('receipt','prepare');body.params.contracts=contracts;
  assert.throws(()=>validateNativeEmployeeUiPositiveCommand(positivePacket('receipt',body),{kind:'receipt',body,target:positiveTarget}),/QA_NATIVE_UI_TARGET_CHANGED/);
 }
});

test('calculation evidence adds a valid dated v2 body while preserving every original calculation field',()=>{
 const body=positiveBody('run','calculate'),packet=positiveRunPacket(body),before=structuredClone(body);
 const evidence=validateNativeEmployeeUiPositiveCommand(packet,{kind:'run',body,target:positiveTarget});
 assert.deepEqual(body,before);assert.equal(Object.hasOwn(body,'version'),false);assert.equal(Object.hasOwn(body,'liquidationDate'),false);
 assert.equal(evidence.commandVersion,OWN_RUN_COMMAND_VERSION);assert.equal(evidence.liquidationDate,'2026-10-31');
 const start=positiveRunPacket(body,{liquidationDate:'2026-10-01'});
 assert.equal(validateNativeEmployeeUiPositiveCommand(start,{kind:'run',body,target:positiveTarget}).liquidationDate,'2026-10-01');
});

test('calculation evidence rejects legacy, impossible, foreign-month and mutated dated bodies',()=>{
 const body=positiveBody('run','calculate');
 for(const patch of [
  {version:'own-payroll-run-command.v1'},{version:null},{liquidationDate:undefined},{liquidationDate:null},
  {liquidationDate:'2026-10-32'},{liquidationDate:'2026-11-01'},{liquidationDate:'2026-10-31T00:00:00Z'},
  {scopeVersion:'d'.repeat(64)},{programVersion:'e'.repeat(64)},{period:'2026-11'},{liquidationType:'sac'},{extra:true},
 ]){
  const packet=positiveRunPacket(body,patch);
  assert.throws(()=>validateNativeEmployeeUiPositiveCommand(packet,{kind:'run',body,target:positiveTarget}));
 }
 const legacy=positivePacket('run',body);
 assert.throws(()=>validateNativeEmployeeUiPositiveCommand(legacy,{kind:'run',body,target:positiveTarget}));
});


// Causal preview-envelope regression: invoke the real QA helper, not a mirror
// of its Object.keys assertion. These are existing wholly synthetic fixtures.
import {nativeEmployeeUiPreview} from '../scripts/lib/native-employee-payroll-circuit-qa.mjs';
import {receiptPreview as nativeUiReceiptPreviewFixture} from './fixtures/own-payroll-receipt-synthetic.js';

function nativeUiPreviewCase(){
 const preview=nativeUiReceiptPreviewFixture(1),target={contractId:preview.snapshot.records[0].contractId};
 return {params:preview.snapshot.params,target,packet:{preview,sameServer:true,authenticationFixture:true,uiHttp:true}};
}

test('native UI receipt preview accepts exactly the valid fields in every tested insertion order and preserves its evidence',async()=>{
 for(const order of [
  ['preview','sameServer','authenticationFixture','uiHttp'],
  ['uiHttp','authenticationFixture','sameServer','preview'],
  ['authenticationFixture','preview','sameServer','uiHttp'],
 ]){
  const {params,target,packet}=nativeUiPreviewCase(),ordered=Object.fromEntries(order.map(key=>[key,packet[key]]));
  const before=structuredClone({params,target,ordered}),commands=[{existing:true}],state={commands,preview:null,download:null};let calls=0;
  const actual=await nativeEmployeeUiPreview({preview:async input=>{
   calls++;assert.equal(input.params,params);assert.equal(input.target,target);return ordered;
  }},params,target,state);
  assert.equal(actual,packet.preview);assert.equal(calls,1);assert.equal(state.commands,commands);
  assert.deepEqual(state,{commands:[{existing:true}],preview:{uiHttp:true,contractId:target.contractId,snapshotSha256:packet.preview.snapshotSha256},download:null});
  assert.deepEqual({params,target,ordered},before);
 }
});

test('native UI receipt preview rejects each missing field and every extra field without advancing preview state',async()=>{
 for(const missing of ['preview','sameServer','authenticationFixture','uiHttp']){
  const {params,target,packet}=nativeUiPreviewCase();delete packet[missing];
  const state={commands:[{existing:true}],preview:null,download:null},before=structuredClone(state);
  await assert.rejects(nativeEmployeeUiPreview({preview:async()=>packet},params,target,state));assert.deepEqual(state,before);
 }
 for(const extra of ['extra','recovered','fallback']){
  const {params,target,packet}=nativeUiPreviewCase();packet[extra]=true;
  const state={commands:[{existing:true}],preview:null,download:null},before=structuredClone(state);
  await assert.rejects(nativeEmployeeUiPreview({preview:async()=>packet},params,target,state));assert.deepEqual(state,before);
 }
});

test('native UI receipt preview retains strict flags, params, record count, UUID and callback failure with no state fallback',async()=>{
 for(const mutate of [
  packet=>{packet.sameServer=false;},packet=>{packet.authenticationFixture=false;},packet=>{packet.uiHttp=false;},
  packet=>{packet.preview.snapshot.params={...packet.preview.snapshot.params,legend:'Changed synthetic legend'};},
  packet=>{packet.preview.snapshot.recordCount=2;},packet=>{packet.preview.snapshot.records[0].contractId=positiveOtherContract;},
  packet=>{delete packet.preview.snapshot;},
 ]){
  const {params,target,packet}=nativeUiPreviewCase(),state={commands:[{existing:true}],preview:null,download:null},before=structuredClone(state);
  mutate(packet);await assert.rejects(nativeEmployeeUiPreview({preview:async()=>packet},params,target,state));assert.deepEqual(state,before);
 }
 const {params,target}=nativeUiPreviewCase(),state={commands:[],preview:null,download:null},failure=Error('synthetic preview callback failure');
 await assert.rejects(nativeEmployeeUiPreview({preview:async()=>{throw failure;}},params,target,state),error=>error===failure);
 assert.deepEqual(state,{commands:[],preview:null,download:null});
});


// Exact receipt-event instant regression. These are pure QA envelopes, not
// stored municipal events. All cases invoke the actual positive validator.
function nativeUiReceiptRecoveryCase(initial='2026-10-17T16:11:52.249052+00:00',recovered='2026-10-17T13:11:52.249052-03:00'){
 const body=positiveBody('receipt','prepare'),packet=positivePacket('receipt',body);
 Object.assign(packet.receipt,{recordedAt:initial,batchId:positiveOtherContract,bodySha256:'a'.repeat(64),version:'own-receipt-event.v1'});
 packet.recovered={...structuredClone(packet.receipt),recordedAt:recovered,replayed:true};
 return {body,packet};
}
const nativeUiValidateReceiptRecovery=({body,packet})=>validateNativeEmployeeUiPositiveCommand(packet,{kind:'receipt',body,target:positiveTarget});

test('native UI receipt event recovery accepts offset-equivalent instants with every fractional digit intact',()=>{
 for(const [initial,recovered]of [
  ['2026-10-17T16:11:52.249052+00:00','2026-10-17T13:11:52.249052-03:00'],
  ['2026-10-17T16:11:36.46864+00:00','2026-10-17T13:11:36.46864-03:00'],
  ['2026-01-01T00:00:00.000001Z','2025-12-31T21:00:00.000001-03:00'],
  ['2024-03-01T00:00:00.100000Z','2024-02-29T21:00:00.1-03:00'],
  ['2026-12-31T23:59:59.123456789012Z','2027-01-01T05:29:59.123456789012+05:30'],
  ['1970-01-01T00:00:00.000001Z','1969-12-31T21:00:00.000001-03:00'],
  ['2026-10-17T16:11:52Z','2026-10-17T16:11:52.000000+00:00'],
  ['2026-10-17T16:11:52.249052Z','2026-10-17T21:56:52.249052+05:45'],
 ]){
  const value=nativeUiReceiptRecoveryCase(initial,recovered),before=structuredClone(value);
  const evidence=nativeUiValidateReceiptRecovery(value);
  assert.equal(evidence.key,ID);assert.equal(evidence.contractId,positiveTarget.contractId);assert.deepEqual(value,before);
 }
});

test('native UI receipt event recovery rejects one microsecond and even a last fractional digit that Date milliseconds lose',()=>{
 const initial='2026-10-17T16:11:52.249052+00:00',changed='2026-10-17T13:11:52.249053-03:00';
 assert.equal(Date.parse(initial),Date.parse(changed),'a millisecond-only oracle would lose this difference');
 for(const [first,second]of [
  [initial,changed],
  ['2026-10-17T16:11:52.123456789012Z','2026-10-17T13:11:52.123456789013-03:00'],
  [initial,'2026-10-17T13:11:52.249051-03:00'],
  [initial,'2026-10-17T13:11:53.249052-03:00'],
  [initial,'2026-10-17T13:11:52.249052-02:00'],
 ])assert.throws(()=>nativeUiValidateReceiptRecovery(nativeUiReceiptRecoveryCase(first,second)));
});

test('native UI receipt event recovery rejects absent, malformed or impossible timestamps instead of defaulting an instant',()=>{
 for(const invalid of [
  undefined,null,0,{},'', '2026-10-17T16:11:52', '2026-10-17 16:11:52Z',
  '2026-02-29T16:11:52Z','2026-04-31T16:11:52Z','0000-01-01T00:00:00Z',
  '2026-10-17T24:11:52Z','2026-10-17T16:60:52Z','2026-10-17T16:11:60Z',
  '2026-10-17T16:11:52.Z','2026-10-17T16:11:52.12xZ',
  '2026-10-17T16:11:52+24:00','2026-10-17T16:11:52+12:60',
 ]){const value=nativeUiReceiptRecoveryCase();value.packet.receipt.recordedAt=value.packet.recovered.recordedAt=invalid;assert.throws(()=>nativeUiValidateReceiptRecovery(value));}
 const value=nativeUiReceiptRecoveryCase();delete value.packet.receipt.recordedAt;delete value.packet.recovered.recordedAt;
 assert.throws(()=>nativeUiValidateReceiptRecovery(value));
});

test('native UI receipt event recovery preserves exact event UUID, key, body, author-like fields, hashes, extras and replay status',()=>{
 for(const mutate of [
  packet=>{packet.recovered.id=ID;},packet=>{packet.recovered.key=positiveOtherContract;},
  packet=>{packet.recovered.batchId=ID;},packet=>{packet.recovered.bodySha256='b'.repeat(64);},
  packet=>{packet.recovered.version='own-receipt-event.v0';},packet=>{packet.recovered.replayed=false;},
  packet=>{packet.receipt.replayed=true;},packet=>{packet.recovered.body.params.contracts=[positiveOtherContract];},
  packet=>{packet.recovered.body.reviewConfirmed=true;},packet=>{packet.recovered.actorLabel='Unexpected actor';},
  packet=>{packet.receipt.actorLabel='Original synthetic actor';packet.recovered.actorLabel='Changed synthetic actor';},
  packet=>{packet.recovered.extra=true;},packet=>{delete packet.recovered.batchId;},
 ]){
  const value=nativeUiReceiptRecoveryCase(),before=structuredClone(value);mutate(value.packet);
  const altered=structuredClone(value);assert.throws(()=>nativeUiValidateReceiptRecovery(value));assert.deepEqual(value,altered);assert.notDeepEqual(value,before);
 }
});

test('native UI receipt event recovery leaves every other command family under its original literal replay comparison',()=>{
 for(const [kind,command]of [['novelty','prepare'],['close','close'],['liquidation','confirm']]){
  const body=positiveBody(kind,command),packet=positivePacket(kind,body);
  packet.receipt.recordedAt=packet.recovered.recordedAt='2026-10-17T16:11:52.249052+00:00';
  validateNativeEmployeeUiPositiveCommand(packet,{kind,body,target:positiveTarget});
  packet.recovered.recordedAt='2026-10-17T13:11:52.249052-03:00';
  assert.throws(()=>validateNativeEmployeeUiPositiveCommand(packet,{kind,body,target:positiveTarget}));
 }
});
