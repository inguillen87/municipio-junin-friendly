import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTION_RUNTIME_ROLE,ACTION_RUNTIME_IDENTITY_SQL,recordActionRuntimeIdentity,invalidateActionRuntimeIdentity,assertActionRuntimeDestination} from '../lib/action-runtime-identity.js';
import {receiptExpectedDestination,receiptApplicationCommit,receiptRuntimeBinding} from '../lib/own-receipt-runtime-binding.js';
import {syntheticReceiptTarget,syntheticReceiptBindingEnv,syntheticReceiptIdentity,syntheticReceiptClient} from './fixtures/own-receipt-runtime-binding-synthetic.js';
const denied=error=>error?.status===503&&error.code==='OWN_RECEIPT_BINDING_UNAVAILABLE';
const unbound=(sql,expected)=>assert.throws(()=>assertActionRuntimeDestination(sql,expected),error=>error.code==='ACTION_DATABASE_DESTINATION_REQUIRED');
const expected=()=>receiptExpectedDestination(syntheticReceiptBindingEnv());

test('el destino se toma sólo del JSON exacto configurado, admite PG17/18 y devuelve una copia congelada sin rol owner',()=>{
 for(const major of [17,18]){
  const target=syntheticReceiptTarget({major}),value=receiptExpectedDestination(syntheticReceiptBindingEnv({INTERNAL_RECEIPT_ACTIONS_TARGET:JSON.stringify(target)}));
  const {role,...destination}=target;assert.equal(role,ACTION_RUNTIME_ROLE);assert.deepEqual(value,destination);assert.ok(Object.isFrozen(value));assert.equal(Object.hasOwn(value,'role'),false);
 }
});

test('configuración ausente, duplicada, extendida, coerciones y cadenas no acotadas no tienen fallback',()=>{
 const target=syntheticReceiptTarget(),raw=JSON.stringify(target);
 const bad=[undefined,null,'',target,'null','[]','{}',raw.replace('"major":17','"major":17,"major":17'),raw.replace('"major":17','"major":17,"maj\\u006fr":17')];
 for(const patch of [{major:'17'},{major:16},{major:18.5},{role:'qa_owner'},{role:''},{projectId:''},{branchId:' padded '},{endpointId:'x'.repeat(257)},{database:'qa\u0000db'},{database:'qa\u007fdb'},{database:['qa']},{extra:true}])bad.push(JSON.stringify({...target,...patch}));
 for(const value of bad)assert.throws(()=>receiptExpectedDestination(syntheticReceiptBindingEnv({INTERNAL_RECEIPT_ACTIONS_TARGET:value})),denied);
 assert.throws(()=>receiptExpectedDestination({INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:'d'.repeat(40)}),denied);
 assert.throws(()=>receiptExpectedDestination(Object.create({INTERNAL_RECEIPT_ACTIONS_TARGET:raw})),denied);
 assert.throws(()=>receiptExpectedDestination(syntheticReceiptBindingEnv({INTERNAL_RECEIPT_ACTIONS_TARGET:raw+' '.repeat(4096)})),denied);
});

test('el commit de aplicación requiere su propia configuración y no sustituye el contrato certificado',()=>{
 assert.equal(receiptApplicationCommit(syntheticReceiptBindingEnv()),'a'.repeat(40));
 for(const value of [undefined,null,'','a'.repeat(39),'a'.repeat(41),' '+ 'a'.repeat(40),'A'.repeat(40),123])assert.throws(()=>receiptApplicationCommit({VERCEL_GIT_COMMIT_SHA:value,INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:'d'.repeat(40),INTERNAL_CERTIFIED_RELEASE_SHA:'d'.repeat(40)}),denied);
});

test('la constancia interna verifica una sola fila del mismo cliente y no contiene destinos ni identidades municipales',async()=>{
 for(const major of [17,18])for(const nullPrototype of [false,true]){
  const env=syntheticReceiptBindingEnv({INTERNAL_RECEIPT_ACTIONS_TARGET:JSON.stringify(syntheticReceiptTarget({major}))}),target=receiptExpectedDestination(env);
  let calls=0;const sql=syntheticReceiptClient(async function(query,...values){calls++;assert.equal(this,sql);assert.equal(query,ACTION_RUNTIME_IDENTITY_SQL);assert.equal(values.length,0);const row=syntheticReceiptIdentity({major});return[nullPrototype?Object.assign(Object.create(null),row):row];});recordActionRuntimeIdentity(sql,syntheticReceiptIdentity({major}));
  const start=Date.now(),binding=await receiptRuntimeBinding(sql,target,env);
  assert.deepEqual(Object.keys(binding),['version','applicationCommit','bindingVerified','observedAtUtc']);assert.equal(binding.version,'own-receipt-runtime-binding.v1');assert.equal(binding.applicationCommit,'a'.repeat(40));assert.equal(binding.bindingVerified,true);assert.ok(Date.parse(binding.observedAtUtc)>=start&&Date.parse(binding.observedAtUtc)<=Date.now());assert.match(binding.observedAtUtc,/Z$/);assert.ok(Object.isFrozen(binding));assert.equal(calls,1);assert.equal(assertActionRuntimeDestination(sql,target),sql);
 }
});

test('cliente no registrado, metadatos falsos en propiedades y destino esperado ajeno se rechazan antes de consultar',async()=>{
 let calls=0;const query=async()=>{calls++;return[syntheticReceiptIdentity()];},sql={query,identity:syntheticReceiptIdentity(),target:syntheticReceiptTarget()};
 await assert.rejects(()=>receiptRuntimeBinding(sql,expected(),syntheticReceiptBindingEnv()),denied);assert.equal(calls,0);
 const bound=syntheticReceiptClient(query);
 for(const field of Object.keys(expected())){const wrong={...expected(),[field]:field==='major'?18:'another-qa-value'};await assert.rejects(()=>receiptRuntimeBinding(bound,wrong,syntheticReceiptBindingEnv()),denied);}
 for(const destination of [null,undefined,{},false,{...expected(),role:ACTION_RUNTIME_ROLE}])await assert.rejects(()=>receiptRuntimeBinding(bound,destination,syntheticReceiptBindingEnv()),denied);
 assert.equal(calls,0);assert.equal(assertActionRuntimeDestination(bound,expected()),bound);
});

test('configuración de commit inválida no consulta ni borra una identidad que aún no se leyó',async()=>{
 let calls=0;const sql=syntheticReceiptClient(async()=>{calls++;return[syntheticReceiptIdentity()];});
 await assert.rejects(()=>receiptRuntimeBinding(sql,expected(),{}),denied);assert.equal(calls,0);assert.equal(assertActionRuntimeDestination(sql,expected()),sql);
});

test('filas vacías, múltiples, incompletas o incompatibles invalidan el cliente sin conservar la identidad anterior',async()=>{
 const rows=[[],[syntheticReceiptIdentity(),syntheticReceiptIdentity()],[{currentUser:ACTION_RUNTIME_ROLE,sessionUser:ACTION_RUNTIME_ROLE}],[syntheticReceiptIdentity({currentUser:'qa_owner'})],[syntheticReceiptIdentity({sessionUser:'qa_owner'})],[syntheticReceiptIdentity({major:'17'})],[syntheticReceiptIdentity({branchId:'another-qa-branch'})],[syntheticReceiptIdentity({database:'x'.repeat(257)})],[syntheticReceiptIdentity({extra:'unrequested'})],{rows:[syntheticReceiptIdentity()]},null];
 for(const response of rows){const sql=syntheticReceiptClient(async()=>response);await assert.rejects(()=>receiptRuntimeBinding(sql,expected(),syntheticReceiptBindingEnv()),denied);unbound(sql,expected());}
});

test('error de lectura o permiso de identidad devuelve error seguro e invalida el cliente',async()=>{
 for(const cause of [Error('private connection details must not escape'),Object.assign(Error('private permission denied'),{code:'42501'})]){
  const sql=syntheticReceiptClient(async()=>{throw cause;});
  await assert.rejects(()=>receiptRuntimeBinding(sql,expected(),syntheticReceiptBindingEnv()),error=>denied(error)&&!error.message.includes('private')&&error.cause===undefined);unbound(sql,expected());
 }
});

test('revalidar después de la lectura detecta identidad borrada o cambiada concurrentemente y nunca la rehabilita',async()=>{
 for(const change of [sql=>invalidateActionRuntimeIdentity(sql),sql=>recordActionRuntimeIdentity(sql,syntheticReceiptIdentity({endpointId:'another-qa-endpoint'}))]){
  const sql=syntheticReceiptClient(async()=>{change(sql);return[syntheticReceiptIdentity()];});await assert.rejects(()=>receiptRuntimeBinding(sql,expected(),syntheticReceiptBindingEnv()),denied);unbound(sql,expected());
 }
});

test('destino congelado de entrada y commit leído una vez no se reemplazan durante await',async()=>{
 for(const field of ['target','commit']){
  const target={...expected()},env=syntheticReceiptBindingEnv(),sql=syntheticReceiptClient(async()=>{if(field==='target')target.branchId='other-qa-branch';else env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);return[syntheticReceiptIdentity()];});
  const binding=await receiptRuntimeBinding(sql,target,env);assert.equal(binding.applicationCommit,'a'.repeat(40));assert.equal(assertActionRuntimeDestination(sql,expected()),sql);
 }
});

test('el helper sólo necesita commit en env y lo lee una vez; el target ya fue validado al entrar',async()=>{
 let reads=0;const env={get VERCEL_GIT_COMMIT_SHA(){reads++;return 'a'.repeat(40);}},sql=syntheticReceiptClient(async()=>[syntheticReceiptIdentity()]);
 const binding=await receiptRuntimeBinding(sql,expected(),env);assert.equal(binding.applicationCommit,'a'.repeat(40));assert.equal(reads,1);
});

test('registrar una identidad nueva inválida borra primero la anterior; la invalidación nunca afecta otro cliente',()=>{
 const first=syntheticReceiptClient(async()=>[]),second=syntheticReceiptClient(async()=>[]);
 assert.throws(()=>recordActionRuntimeIdentity(first,syntheticReceiptIdentity({currentUser:'qa_owner'})),error=>error.code==='ACTION_DATABASE_ROLE_REQUIRED');unbound(first,expected());assert.equal(assertActionRuntimeDestination(second,expected()),second);
 recordActionRuntimeIdentity(first,syntheticReceiptIdentity());assert.equal(invalidateActionRuntimeIdentity(first),undefined);unbound(first,expected());assert.equal(assertActionRuntimeDestination(second,expected()),second);
});

test('campos con getters no cambian el objeto durante la comprobación ni la fila registrada',async()=>{
 let reads=0;const target={...expected()};Object.defineProperty(target,'branchId',{enumerable:true,get(){reads++;return 'not-read';}});
 const sql=syntheticReceiptClient(async()=>{throw Error('must not query');});await assert.rejects(()=>receiptRuntimeBinding(sql,target,syntheticReceiptBindingEnv()),denied);assert.equal(reads,0);
 const row=syntheticReceiptIdentity();Object.defineProperty(row,'currentUser',{enumerable:true,get(){reads++;return ACTION_RUNTIME_ROLE;}});
 const other=syntheticReceiptClient(async()=>[row]);await assert.rejects(()=>receiptRuntimeBinding(other,expected(),syntheticReceiptBindingEnv()),denied);assert.equal(reads,0);unbound(other,expected());
});
