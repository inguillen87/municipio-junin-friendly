// La lectura compartida del detalle de una liquidación: JSON común mientras entra, lectura completa cuando el
// servidor dice que no entra, y nunca una parte. La última prueba la une con el manejador real de la API y un
// resultado oficial sintético que supera los 4 MiB (un convenio entero), que es el caso que hoy bloquea Confirmar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
import {fetchOwnLiquidationDetail,ownLiquidationDetailUrl,OWN_LIQ_DETAIL_LIMIT} from '../assets/own-payroll-liquidation-read.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail,ownLiquidationReview} from '../assets/own-payroll-liquidation-model.js';
import {prepareOwnPayrollRowEmissionSnapshot} from '../lib/own-payroll-row-emission-snapshot.js';
import {emissionSources} from './fixtures/own-payroll-row-emission-synthetic.js';
import {hash} from './fixtures/own-payroll-official-close-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

const ID=uid(7001),bytesOf=v=>new TextEncoder().encode(JSON.stringify(v));
const common=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const complete=(payload,{announced,type=OWN_RUN_FULL_JSON+'; charset=utf-8',cut=0}={})=>{const bytes=bytesOf(payload),headers={'content-type':type};if(announced!==null)headers['x-municontrol-json-bytes']=String(announced??bytes.length);return new Response(bytes.subarray(0,bytes.length-cut),{status:200,headers});};
const limit=()=>common(422,{ok:false,code:OWN_LIQ_DETAIL_LIMIT,error:'El alcance completo supera la capacidad. No se recortaron ni dividieron filas.'});
// Un servidor de mentira: responde en orden y anota qué se le pidió.
function server(...responses){const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,accept:init.headers.Accept,credentials:init.credentials,cache:init.cache,signal:init.signal});const next=responses.shift();if(!next)throw Error('Consulta inesperada');return typeof next==='function'?next():next;}};}

test('un detalle que entra en el JSON común se lee con una sola consulta, igual que antes',async()=>{
 const payload={ok:true,data:{id:ID,texto:'Legajo sintético áéñ'}},s=server(common(200,payload));
 const read=await fetchOwnLiquidationDetail(ID,{fetch:s.fetch});
 assert.deepEqual(read,{status:200,ok:true,payload,bytes:bytesOf(payload).length,full:false});
 assert.deepEqual(s.calls.map(c=>[c.url,c.accept,c.credentials,c.cache]),[[ownLiquidationDetailUrl(ID),'application/json','same-origin','no-store']]);
 assert.equal(ownLiquidationDetailUrl('a b&c'),'/api/internal-own-payroll-liquidation?resource=detail&id=a%20b%26c');
});

test('si el servidor dice que no entra, repite la misma consulta en modo completo y entrega el detalle entero',async()=>{
 const payload={ok:true,data:{id:ID,relleno:'x'.repeat(OWN_RUN_MAX_RESPONSE+1024)}},s=server(limit(),complete(payload));
 const read=await fetchOwnLiquidationDetail(ID,{fetch:s.fetch});
 assert.equal(read.ok,true);assert.equal(read.full,true);assert.equal(read.status,200);assert.deepEqual(read.payload,payload);
 assert.ok(bytesOf(payload).length>OWN_RUN_MAX_RESPONSE,'el caso supera el JSON común');
 assert.equal(read.bytes,bytesOf(payload).length+(await limit().arrayBuffer()).byteLength,'cuenta también la respuesta rechazada');
 assert.deepEqual(s.calls.map(c=>[c.url,c.accept]),[[ownLiquidationDetailUrl(ID),'application/json'],[ownLiquidationDetailUrl(ID),OWN_RUN_FULL_JSON]]);
});

test('quien ya sabe que el detalle no entra lo pide completo de entrada, con una sola consulta',async()=>{
 const payload={ok:true,data:{id:ID,relleno:'x'.repeat(2048)}},s=server(complete(payload));
 const read=await fetchOwnLiquidationDetail(ID,{fetch:s.fetch,full:true});
 assert.deepEqual(read,{status:200,ok:true,payload,bytes:bytesOf(payload).length,full:true});
 assert.deepEqual(s.calls.map(c=>c.accept),[OWN_RUN_FULL_JSON]);
 // Cualquier otro valor conserva el camino común.
 for(const full of [undefined,false,'true',1]){const t=server(common(200,payload));assert.equal((await fetchOwnLiquidationDetail(ID,{fetch:t.fetch,full})).full,false);assert.deepEqual(t.calls.map(c=>c.accept),['application/json']);}
});

test('cualquier otro rechazo se devuelve tal cual, sin una segunda consulta',async()=>{
 for(const [status,code] of [[403,'OWN_LIQ_FORBIDDEN'],[404,'OWN_LIQ_NOT_FOUND'],[503,'OWN_LIQ_CONTRACT_INVALID'],[401,'AUTH_REQUIRED'],[422,'OWN_RUN_LIMIT']]){
  const payload={ok:false,code,error:'Rechazo sintético.'},s=server(common(status,payload));
  const read=await fetchOwnLiquidationDetail(ID,{fetch:s.fetch});
  assert.deepEqual({status:read.status,ok:read.ok,payload:read.payload,full:read.full},{status,ok:false,payload,full:false},code);assert.equal(s.calls.length,1,code);
 }
});

test('si la lectura completa también se rechaza, devuelve ese rechazo',async()=>{
 const payload={ok:false,code:'OWN_LIQ_UNAVAILABLE',error:'La lectura completa del histórico no está habilitada en esta versión.'},s=server(limit(),common(503,payload));
 const read=await fetchOwnLiquidationDetail(ID,{fetch:s.fetch});
 assert.deepEqual({status:read.status,ok:read.ok,payload:read.payload,full:read.full},{status:503,ok:false,payload,full:true});assert.equal(s.calls.length,2);
});

test('una lectura completa sin sus bytes anunciados, de otro tipo o incompleta no se acepta',async()=>{
 const payload={ok:true,data:{id:ID,filas:Array.from({length:50},(_,i)=>({n:i}))}};
 for(const [name,response,pattern] of [
  ['sin bytes anunciados',()=>complete(payload,{announced:null}),/verificar la respuesta completa/],
  ['bytes anunciados inválidos',()=>complete(payload,{announced:'12x'}),/verificar la respuesta completa/],
  ['tipo de contenido común',()=>complete(payload,{type:'application/json'}),/verificar la respuesta completa/],
  ['cuerpo cortado',()=>complete(payload,{announced:bytesOf(payload).length,cut:1}),/./],
  ['anuncia más de lo que llega',()=>complete(payload,{announced:bytesOf(payload).length+1}),/incompleta/],
 ]){
  const s=server(limit(),response);
  await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:s.fetch}),pattern,name);assert.equal(s.calls.length,2,name);
 }
 await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:server(common(200,{ok:true,data:'x'.repeat(OWN_RUN_MAX_RESPONSE)})).fetch}),/capacidad/,'una respuesta común que excede su tope no se entrega');
 await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:server(new Response('{"ok":tr',{status:200})).fetch}),/verificar la respuesta completa/,'JSON incompleto');
 assert.ok(OWN_RUN_FULL_MAX_BYTES>OWN_RUN_MAX_RESPONSE);
});

test('respeta el presupuesto de bytes de quien llama y la señal de retiro',async()=>{
 const payload={ok:true,data:{id:ID,relleno:'x'.repeat(5000)}},size=bytesOf(payload).length,rejected=(await limit().arrayBuffer()).byteLength;
 const exact=await fetchOwnLiquidationDetail(ID,{fetch:server(limit(),complete(payload)).fetch,remaining:size+rejected});
 assert.equal(exact.bytes,size+rejected);
 await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:server(limit(),complete(payload)).fetch,remaining:size+rejected-1}),/capacidad/);
 await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:server(common(200,payload)).fetch,remaining:size-1}),/capacidad/);
 for(const remaining of [-1,1.5,'10'])await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:server().fetch,remaining}),/Presupuesto/);
 const controller=new AbortController(),s=server(common(200,payload));controller.abort();
 await assert.rejects(()=>fetchOwnLiquidationDetail(ID,{fetch:s.fetch,signal:controller.signal}),{name:'AbortError'});assert.equal(s.calls[0].signal,controller.signal);
});

test('las cuatro pantallas que leen el detalle de una liquidación usan la lectura compartida',()=>{
 for(const file of ['own-payroll-liquidation-panel.js','own-payroll-run-panel.js','own-payroll-comparison-panel.js','own-payroll-report-panel.js']){
  const source=fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8');
  assert.match(source,/import \{fetchOwnLiquidationDetail\} from '\.\/own-payroll-liquidation-read\.js';/,file);
  assert.match(source,/fetchOwnLiquidationDetail\(id,\{signal:controller\?\.signal/,file);
  assert.doesNotMatch(source,/resource=detail&id=|resource:'detail',id\b/,file+' no arma por su cuenta la consulta del detalle');
 }
});

// --- Con el manejador real de la API -------------------------------------------------------------------------------
class Sink extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.destroyed=false;}
 setHeader(k,v){this.headers[k.toLowerCase()]=String(v);}status(v){this.statusCode=v;return this;}json(v){this.value=v;return this;}
 write(v){this.chunks.push(Buffer.from(v));return true;}end(){this.ended=true;}
}
function officialDetail(count){
 const sources=emissionSources({count,children:'0',primary:'0'}),snapshot=prepareOwnPayrollRowEmissionSnapshot(sources);
 const payload={...sources,sourceInventory:{}},body={period:payload.period,liquidationType:payload.liquidationType,selection:payload.selection,scopeVersion:'a'.repeat(64),programVersion:payload.programState.program.version,populationDomain:'native_registered'};
 const algorithm='e'.repeat(64),at='2026-11-11T15:00:00.000Z';
 const capture={version:'own-payroll-run.v1',id:ID,key:uid(7002),body,bodySha256:hash(body),algorithmSha256:algorithm,payload,payloadSha256:hash(payload),createdAt:at,replayed:true,
  saved:{version:'own-payroll-saved.v1',id:ID,algorithmSha256:algorithm,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:at}};
 return {version:'own-liquidation-detail.v1',id:ID,scopeVersion:'a'.repeat(64),stateVersion:'b'.repeat(64),capture,
  employees:snapshot.result.employeeTotals.map(t=>({contractId:t.contractId,state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:['confirm','cancel'],events:[]})),
  effects:{paymentExecuted:false,accountingPosted:false,periodClosed:false},reviewAccessRequired:false};
}

test('un total oficial de un convenio entero: la API rechaza el JSON común, entrega la lectura completa y Confirmar lo verifica',async()=>{
 const count=280,detail=officialDetail(count),size=Buffer.byteLength(JSON.stringify({ok:true,data:detail}));
 assert.ok(size>OWN_RUN_MAX_RESPONSE&&size<OWN_RUN_FULL_MAX_BYTES,'el caso supera 4 MiB y entra en la lectura completa: '+size);
 const queries=[],sql={query:async q=>{queries.push(q.match(/own_liquidation_detail[a-z_0-9]*/)[0]);return [{result:detail}];}};
 const handler=createOwnLiquidationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},sessionFor:()=>({email:'qa@example.invalid',id:uid(7003),version:1,releaseSha:'d'.repeat(40)}),getSql:async()=>sql,
  requireAccess:async()=>({mode:'managed',principal:{user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(7004),membershipId:uid(7005),effectiveCapabilities:OWN_LIQ_REVIEW}}})});
 const accepts=[];
 const send=async(url,init)=>{
  accepts.push(init.headers.Accept);const sink=new Sink(),parsed=new URL(url,'https://municipio.example');
  await handler({method:'GET',url,query:Object.fromEntries(parsed.searchParams),headers:{accept:init.headers.Accept}},sink);
  if(sink.value!==undefined)return new Response(JSON.stringify(sink.value),{status:sink.statusCode,headers:{'content-type':'application/json; charset=utf-8'}});
  assert.equal(sink.ended,true);
  return new Response(Buffer.concat(sink.chunks),{status:sink.statusCode,headers:{'content-type':sink.headers['content-type'],'x-municontrol-json-bytes':sink.headers['x-municontrol-json-bytes']}});
 };
 const read=await fetchOwnLiquidationDetail(ID,{fetch:send});
 assert.equal(read.ok,true);assert.equal(read.full,true);assert.equal(read.status,200);
 assert.deepEqual(accepts,['application/json',OWN_RUN_FULL_JSON]);
 assert.deepEqual(queries,['own_liquidation_detail_v1','own_liquidation_detail_full_v1'],'cada modo consulta su función');
 const verified=await verifiedOwnLiquidationDetail(read.payload.data),review=ownLiquidationReview(verified,{kind:'all',values:[]},'confirm');
 assert.equal(review.count,count,'Confirmar revisa todos los legajos, sin recorte');
 assert.equal(verified.capture.saved.resultSha256,detail.capture.saved.resultSha256);
});
