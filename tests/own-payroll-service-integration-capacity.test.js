import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {largeCapacityDetail} from './fixtures/own-payroll-large-capacity-synthetic.js';
import {command} from './fixtures/own-payroll-liquidation-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {OWN_LIQ_REVIEW,OWN_LIQ_NOMINAL} from '../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {ownRunHash,verifyOwnRunReceipt} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,liquidationError} from '../lib/internal-own-payroll-liquidation.js';
import {createOwnLiquidationHandler} from '../api/internal-own-payroll-liquidation.js';

// Invented callback-only state. No PostgreSQL connection or HTTP server.
const principal={user:{email:'combined-capacity@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_LIQ_REVIEW}};
const session={email:principal.user.email,id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const detailSql='SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result';
const fullDetailSql='SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result';
const commandSql='SELECT public.own_liquidation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
let prepared;
const large=()=>prepared??=largeCapacityDetail();
const size=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
function sqlDetail(data,calls){return{query:async(q,values)=>{
 assert.ok([detailSql,fullDetailSql].includes(q),'only exact declared detail callback');
 assert.equal(values.length,2);assert.equal(values[1],data.id);
 assert.equal(JSON.parse(values[0]).membershipId,principal.tenant.membershipId);
 calls.push({q,values:structuredClone(values)});return[{result:data}];
}};}
class Response extends EventEmitter{
 constructor(){super();this.headers={};this.chunks=[];this.headersSent=false;this.destroyed=false;this.writableEnded=false;}
 setHeader(k,v){this.headers[k.toLowerCase()]=String(v);}
 status(n){this.statusCode=n;return this;}
 json(value){this.value=value;this.headersSent=true;this.writableEnded=true;return this;}
 write(chunk){this.headersSent=true;this.chunks.push(Buffer.from(chunk));return true;}
 end(){this.writableEnded=true;}
 destroy(error){this.destroyed=true;this.failure=error;this.emit('close');}
}
const request=(id,accept)=>({method:'GET',query:{resource:'detail',id},url:'/api/internal-own-payroll-liquidation?resource=detail&id='+id,headers:accept?{accept}:{}});
function handlerFor(sql,who=principal,onConnect=()=>{}){return createOwnLiquidationHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal:who}),sessionFor:()=>session,getSql:async()=>{onConnect();return sql;}});}

test('combined services retain the complete855x20 capture only under the strict full profile',async()=>{
 const d=large(),before=ownRunHash(d),calls=[];
 assert.ok(size({ok:true,data:d})>OWN_RUN_MAX_RESPONSE);
 assert.ok(size({ok:true,data:d})<OWN_RUN_FULL_MAX_BYTES);
 const value=await ownLiquidationOperation(sqlDetail(d,calls),principal,session,'detail',{id:d.id},{fullJson:true});
 assert.equal(value,d);assert.equal(value.capture.saved.result.employeeCount,855);
 assert.equal(value.capture.saved.result.rowCount,17100);assert.equal(value.capture.saved.result.rows.length,17100);
 assert.equal(new Set(value.capture.saved.result.rows.map(row=>row.contractId)).size,855);
 assert.equal(calls.length,1);assert.equal(calls[0].q,fullDetailSql);
 assert.equal(verifyOwnRunReceipt(d.capture,{fullJson:true}),d.capture);
 assert.equal(ownRunHash(d),before);
});

test('legacy and truthy nonboolean profiles retain an honest422 without dropping rows',async()=>{
 const d=large(),before=ownRunHash(d);
 for(const options of [{},{fullJson:false},{fullJson:'true'},{fullJson:1}]){
  const calls=[];
  await assert.rejects(ownLiquidationOperation(sqlDetail(d,calls),principal,session,'detail',{id:d.id},options),e=>e.code==='OWN_LIQ_LIMIT'&&e.status===422);
  assert.equal(calls.length,1);assert.equal(calls[0].q,detailSql);
 }
 assert.equal(ownRunHash(d),before);assert.equal(d.capture.saved.result.rows.length,17100);
});

test('the real HTTP handler streams the identical complete envelope and legacy reports422',async()=>{
 const d=large(),before=ownRunHash(d),calls=[],handler=handlerFor(sqlDetail(d,calls));
 const full=new Response();await handler(request(d.id,OWN_RUN_FULL_JSON),full);
 assert.equal(full.statusCode,200);assert.equal(full.destroyed,false);assert.equal(full.writableEnded,true);
 const bytes=Buffer.concat(full.chunks),expected=Buffer.from(JSON.stringify({ok:true,data:d}),'utf8');
 assert.deepEqual(bytes,expected);assert.equal(full.headers['x-municontrol-json-bytes'],String(bytes.length));
 assert.equal(full.headers['content-type'],OWN_RUN_FULL_JSON+'; charset=utf-8');
 assert.ok(bytes.length>OWN_RUN_MAX_RESPONSE&&bytes.length<OWN_RUN_FULL_MAX_BYTES);
 const legacy=new Response();await handler(request(d.id),legacy);
 assert.equal(legacy.statusCode,422);assert.equal(legacy.value.code,'OWN_LIQ_LIMIT');assert.equal(legacy.value.ok,false);
 assert.equal(Object.hasOwn(legacy.value,'data'),false);assert.equal(legacy.chunks.length,0);
 assert.deepEqual(calls.map(c=>c.q),[fullDetailSql,detailSql]);assert.equal(ownRunHash(d),before);
});

test('a replaced approved novelty keeps SOURCE_CHANGED409 through the real command handler',async()=>{
 const body=command(),key=uid(9),before=ownRunHash(body),calls=[];
 const sql={query:async(q,values)=>{assert.equal(q,commandSql);assert.equal(values[2],key);assert.deepEqual(JSON.parse(values[1]),body);calls.push({q,values:structuredClone(values)});throw Error('OWN_LIQ_SOURCE_CHANGED');}};
 const handler=handlerFor(sql),response=new Response();
 await handler({method:'POST',url:'/api/internal-own-payroll-liquidation',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':key,accept:OWN_RUN_FULL_JSON},body:JSON.stringify({operation:'command',payload:body})},response);
 assert.equal(response.statusCode,409);assert.equal(response.value.code,'OWN_LIQ_SOURCE_CHANGED');
 assert.equal(response.value.ok,false);assert.equal(Object.hasOwn(response.value,'data'),false);
 assert.equal(calls.length,1);assert.equal(ownRunHash(body),before);
 const capacity=liquidationError(Error('OWN_RUN_LIMIT'));assert.equal(capacity.code,'OWN_LIQ_LIMIT');assert.equal(capacity.status,422);
 const hidden=liquidationError(Error('private synthetic callback failure'));assert.equal(hidden.code,'OWN_LIQ_UNAVAILABLE');assert.equal(hidden.status,503);assert.doesNotMatch(hidden.message,/private|callback/);
});

test('revoked nominal authority is rejected before the synthetic SQL callback',async()=>{
 const d=large();
 for(const missing of OWN_LIQ_NOMINAL){
  let connects=0,calls=0;const who={...principal,tenant:{...principal.tenant,effectiveCapabilities:OWN_LIQ_REVIEW.filter(cap=>cap!==missing)}};
  const handler=handlerFor({query:async()=>{calls++;throw Error('must not query');}},who,()=>connects++),response=new Response();
  await handler(request(d.id,OWN_RUN_FULL_JSON),response);
  assert.equal(response.statusCode,403,missing);assert.equal(connects,0);assert.equal(calls,0);
 }
});
