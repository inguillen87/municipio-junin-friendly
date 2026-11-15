// Genuine handler + synthetic authorization, identity rows and receipt results.
// No credentials, database connection, browser or municipal operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
import {ACTION_RUNTIME_IDENTITY_SQL,recordActionRuntimeIdentity,assertActionRuntimeDestination} from '../lib/action-runtime-identity.js';
import {receiptExpectedDestination} from '../lib/own-receipt-runtime-binding.js';
import {OWN_RECEIPT_READ,OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE,OWN_RECEIPT_SELF} from '../assets/own-payroll-receipt-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {receiptCommand,receiptEvent,receiptPreview,receiptBatch,receiptSelf} from './fixtures/own-payroll-receipt-synthetic.js';
import {syntheticReceiptTarget,syntheticReceiptBindingEnv,syntheticReceiptIdentity} from './fixtures/own-receipt-runtime-binding-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

const allCaps=[...new Set([...OWN_RECEIPT_PREPARE,...OWN_RECEIPT_APPROVE,...OWN_RECEIPT_SELF])];
const session={email:'qa-receipt@example.invalid',id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const response=()=>({headers:{},statusCode:0,setHeader(key,value){this.headers[key]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
const get=query=>({method:'GET',url:'/api/internal-own-payroll-receipts?'+new URLSearchParams(query),query,headers:{}});
const post=body=>({method:'POST',url:'/api/internal-own-payroll-receipts',query:{},headers:{origin:'http://localhost:8080','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify(body)});
function rig(options={}){
 const env=options.env??syntheticReceiptBindingEnv(),stats={authorize:0,connect:0},queries=[],settings=[],gates=[];
 const principal={user:{email:session.email},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:options.caps??allCaps}};
 const sql={query:async function(query,values){assert.equal(this,sql,'same client for identity and facade');queries.push({query,values,client:this});
  if(query===ACTION_RUNTIME_IDENTITY_SQL){if(options.identityError)throw options.identityError;return[options.observedIdentity??syntheticReceiptIdentity()];}
  if(options.facadeError)throw options.facadeError;return[{result:options.value??receiptEvent()}];
 }};
 if(options.bound!==false)recordActionRuntimeIdentity(sql,options.cachedIdentity??syntheticReceiptIdentity());
 const handler=createOwnReceiptHandler({env,requireAccess:async(_req,res,gate)=>{stats.authorize++;gates.push(gate);if(options.authStatus){res.status(options.authStatus).json({ok:false,code:'SYNTHETIC_AUTH_DENIED'});return null;}return {mode:'managed',principal};},sessionFor:()=>session,
  getSql:async(actualEnv,config)=>{assert.equal(actualEnv,env);stats.connect++;settings.push(config);if(options.clientError)throw options.clientError;return sql;},issuerProfiles:{}});
 return {handler,sql,stats,queries,settings,gates,async call(request){const res=response();await handler(request,res);return res;}};
}
const decision=command=>({...receiptCommand(),command,params:null,batchId:uid(800),batchSha256:'b'.repeat(64),reviewConfirmed:true});
function operations(){
 const preview=receiptPreview(2),batch=receiptBatch(2),event=receiptEvent();
 return [
  {name:'self',request:()=>get({resource:'self'}),value:receiptSelf(),caps:OWN_RECEIPT_SELF},
  {name:'list',request:()=>get({resource:'list',period:'2026-10'}),value:{version:'own-receipt-list.v1',scopeVersion:'b'.repeat(64),period:'2026-10',items:[]}},
  {name:'batch',request:()=>get({resource:'batch',id:batch.id}),value:batch},
  {name:'attempt',request:()=>get({resource:'attempt',key:event.key}),value:{...event,replayed:true}},
  {name:'preview',request:()=>post({operation:'preview',params:preview.snapshot.params}),value:preview},
  ...['prepare','approve','withdraw'].map(command=>{const body=command==='prepare'?receiptCommand():decision(command);return{name:'command',command,request:()=>post({operation:'command',payload:body}),value:{...event,body,bodySha256:ownRunHash(body)}};})
 ];
}

test('todas las fachadas de Recibos verifican el mismo destino y cliente; el sobre y releaseSha permanecen intactos',async()=>{
 for(const operation of operations()){
  const h=rig({value:operation.value,caps:operation.caps}),r=await h.call(operation.request());
  assert.equal(r.statusCode,operation.name==='command'?201:200,operation.command??operation.name);assert.deepEqual(r.body,{ok:true,data:operation.value});
  assert.deepEqual(h.settings,[{expectedDestination:receiptExpectedDestination(syntheticReceiptBindingEnv())}]);assert.ok(Object.isFrozen(h.settings[0].expectedDestination));
  assert.equal(h.queries.length,2);assert.equal(h.queries[0].query,ACTION_RUNTIME_IDENTITY_SQL);assert.match(h.queries[1].query,new RegExp('public\\.own_receipt_'+operation.name+'_v1'));
  assert.equal(h.queries[0].client,h.sql);assert.equal(h.queries[1].client,h.sql);const context=JSON.parse(h.queries[1].values[0]);assert.equal(context.releaseSha,session.releaseSha);assert.notEqual(context.releaseSha,'a'.repeat(40));
  assert.equal(h.gates[0].requireDataPlaneReady,true);assert.equal(h.gates[0].requireCertifiedDataBinding,true);assert.equal(h.gates[0].allowLegacy,false);assert.match(r.headers['Cache-Control'],/no-store/);
 }
});

test('target o commit ausentes/malformados fallan antes de obtener cliente para cada operación SQL',async()=>{
 for(const patch of [{INTERNAL_RECEIPT_ACTIONS_TARGET:undefined},{INTERNAL_RECEIPT_ACTIONS_TARGET:'{}'},{VERCEL_GIT_COMMIT_SHA:undefined},{VERCEL_GIT_COMMIT_SHA:'invalid'}])for(const operation of operations()){
  const h=rig({env:syntheticReceiptBindingEnv(patch),value:operation.value,caps:operation.caps}),r=await h.call(operation.request());
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'OWN_RECEIPT_BINDING_UNAVAILABLE');assert.equal(h.stats.connect,0);assert.equal(h.queries.length,0);assert.equal(Object.hasOwn(r.body,'data'),false);
 }
});

test('issuer no lee configuración de binding, no obtiene cliente y conserva el sobre existente',async()=>{
 let configReads=0;const env={};for(const key of ['INTERNAL_RECEIPT_ACTIONS_TARGET','VERCEL_GIT_COMMIT_SHA'])Object.defineProperty(env,key,{get(){configReads++;throw Error('Issuer must not inspect binding');}});
 const h=rig({env,caps:OWN_RECEIPT_READ}),r=await h.call(get({resource:'issuer'}));
 assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true,data:{version:'own-receipt-issuer.v1',scope:{tenantId:uid(50)},state:'missing',profile:null}});assert.equal(configReads,0);assert.equal(h.stats.connect,0);assert.equal(h.queries.length,0);assert.equal(h.stats.authorize,1);
});

test('autorización denegada y revocación de cada capacidad de emisión preceden binding y SQL',async()=>{
 for(const authStatus of [401,403]){const h=rig({authStatus}),r=await h.call(get({resource:'self'}));assert.equal(r.statusCode,authStatus);assert.equal(h.stats.connect,0);assert.equal(h.queries.length,0);}
 for(const command of ['prepare','approve','withdraw'])for(const cap of command==='prepare'?OWN_RECEIPT_PREPARE:OWN_RECEIPT_APPROVE){
  const body=command==='prepare'?receiptCommand():decision(command),h=rig({caps:allCaps.filter(value=>value!==cap)}),r=await h.call(post({operation:'command',payload:body}));
  assert.equal(r.statusCode,403,command+':'+cap);assert.equal(h.stats.connect,0);assert.equal(h.queries.length,0);
 }
});

test('destino cacheado incompatible o cliente no registrado no consulta identidad ni fachadas',async()=>{
 for(const options of [{bound:false},{cachedIdentity:syntheticReceiptIdentity({branchId:'another-qa-branch'})},{cachedIdentity:{currentUser:'municontrol_actions_runtime_app',sessionUser:'municontrol_actions_runtime_app'}}]){
  const h=rig(options),r=await h.call(get({resource:'self'}));assert.equal(r.statusCode,503);assert.equal(r.body.code,'OWN_RECEIPT_BINDING_UNAVAILABLE');assert.equal(h.stats.connect,1);assert.equal(h.queries.length,0);
 }
});

test('identidad observada incompatible, permiso denegado o fallo de cliente nunca llega a la fachada ni filtra el error',async()=>{
 for(const options of [{observedIdentity:syntheticReceiptIdentity({endpointId:'other-qa-endpoint'})},{observedIdentity:syntheticReceiptIdentity({sessionUser:'qa_owner'})},{identityError:Object.assign(Error('private identity permission denied'),{code:'42501'})},{clientError:Error('private connection details')}]){
  const h=rig(options),r=await h.call(post({operation:'command',payload:receiptCommand()}));assert.equal(r.statusCode,503);assert.equal(r.body.code,'OWN_RECEIPT_BINDING_UNAVAILABLE');assert.equal(JSON.stringify(r.body).includes('private'),false);
  assert.equal(h.queries.every(call=>call.query===ACTION_RUNTIME_IDENTITY_SQL),true);assert.equal(h.queries.length,options.clientError?0:1);
  if(!options.clientError)assert.throws(()=>assertActionRuntimeDestination(h.sql,receiptExpectedDestination(syntheticReceiptBindingEnv())));
 }
});

test('la falla de binding deja el mismo cliente inválido y no rehabilita su identidad en otro intento',async()=>{
 const h=rig({identityError:Error('Synthetic unreadable identity')});let r=await h.call(get({resource:'self'}));assert.equal(r.statusCode,503);assert.equal(h.queries.length,1);
 r=await h.call(get({resource:'self'}));assert.equal(r.statusCode,503);assert.equal(r.body.code,'OWN_RECEIPT_BINDING_UNAVAILABLE');assert.equal(h.queries.length,1);assert.equal(h.stats.authorize,2);
});

test('query y body no pueden seleccionar ni reemplazar destino, commit o comprobación',async()=>{
 for(const field of ['expectedDestination','INTERNAL_RECEIPT_ACTIONS_TARGET','target','runtimeBinding','applicationCommit','major','projectId','branchId','endpointId','database','role']){
  const value=field==='major'?'18':'synthetic-client-choice';
  for(const request of [get({resource:'self',[field]:value}),post({operation:'command',payload:receiptCommand(),[field]:value}),post({operation:'command',payload:{...receiptCommand(),[field]:value}})]){
   const h=rig(),r=await h.call(request);assert.ok([400,422].includes(r.statusCode),field);assert.equal(h.stats.connect,0);assert.equal(h.queries.length,0);
  }
 }
});

test('cabeceras de destino o commit no sustituyen la configuración privada del servidor',async()=>{
 const h=rig({value:receiptSelf()}),request=get({resource:'self'});request.headers={'x-municontrol-destination':JSON.stringify(syntheticReceiptTarget({major:18})),'x-municontrol-runtime-binding':'forged','x-vercel-git-commit-sha':'f'.repeat(40)};
 const r=await h.call(request);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true,data:receiptSelf()});assert.deepEqual(h.settings[0],{expectedDestination:receiptExpectedDestination(syntheticReceiptBindingEnv())});
});

test('replay conserva clave/cuerpo y vuelve a verificar acceso e identidad del cliente en cada solicitud',async()=>{
 const value={...receiptEvent(),replayed:true},h=rig({value}),request=post({operation:'command',payload:value.body});
 for(let i=0;i<2;i++){const r=await h.call(request);assert.equal(r.statusCode,200);assert.equal(r.headers['Idempotency-Replayed'],'true');assert.deepEqual(r.body,{ok:true,data:value});}
 assert.equal(h.stats.authorize,2);assert.equal(h.queries.filter(call=>call.query===ACTION_RUNTIME_IDENTITY_SQL).length,2);
 const calls=h.queries.filter(call=>call.query!==ACTION_RUNTIME_IDENTITY_SQL);assert.deepEqual(calls[0].values,calls[1].values);assert.equal(calls[0].values[2],value.key);
});

test('una denegación de negocio posterior al binding conserva su 403 y no se presenta como falla de destino',async()=>{
 const h=rig({facadeError:Error('OWN_CLOSE_FORBIDDEN')}),r=await h.call(get({resource:'self'}));assert.equal(r.statusCode,403);assert.equal(r.body.code,'OWN_RECEIPT_FORBIDDEN');assert.equal(h.queries.length,2);
});

test('faltan clave o identificador: el error de entrada precede también la nueva lectura de identidad',async()=>{
 const requests=[get({resource:'attempt',key:''}),get({resource:'batch',id:''}),post({operation:'command',payload:receiptCommand()})];delete requests[2].headers['idempotency-key'];
 for(const request of requests){const h=rig(),r=await h.call(request);assert.ok([400,428].includes(r.statusCode));assert.equal(h.stats.connect,0);assert.equal(h.queries.length,0);}
});
