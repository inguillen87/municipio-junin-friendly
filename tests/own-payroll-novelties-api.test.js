import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnNoveltyHandler} from '../api/internal-own-payroll-novelties.js';
import {OWN_NOVELTY_READ} from '../assets/own-payroll-novelties-model.js';
import {ownNoveltyHash} from '../lib/internal-own-payroll-novelties.js';
import {prepare,receipt,bootstrap,batch} from './fixtures/own-payroll-novelties-synthetic.js';import {uid} from './fixtures/own-payroll-program-synthetic.js';
const all=[...OWN_NOVELTY_READ,'payroll.novelty.prepare','payroll.novelty.approve','payroll.novelty.export'],principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:all}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'a'.repeat(40)};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});
const get=(query={resource:'bootstrap'})=>({method:'GET',url:'/api/internal-own-payroll-novelties?'+new URLSearchParams(query),query,headers:{}}),post=(body=prepare())=>({method:'POST',url:'/api/internal-own-payroll-novelties',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uid(23001)},body:JSON.stringify({operation:'command',payload:body})});
function setup(overrides={}){const calls=[],stats={connects:0};return {calls,stats,handler:createOwnNoveltyHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>{stats.connects++;return {query:async(query,values)=>{calls.push({query,values});return [{result:query.includes('bootstrap')?bootstrap():query.includes('detail')?batch():receipt(query.includes('command')?JSON.parse(values[1]):prepare())}];}};},...overrides})};}
test('native complete body uses only own facade, signed session and original idempotency key',async()=>{const a=setup(),r=response();await a.handler(post(),r);assert.equal(r.statusCode,201);assert.equal(a.calls.length,1);assert.match(a.calls[0].query,/own_novelty_command_v1/);assert.deepEqual(JSON.parse(a.calls[0].values[1]),prepare());assert.equal(a.calls[0].values[2],uid(23001));assert.equal(JSON.parse(a.calls[0].values[0]).actorSessionId,session.id);assert.equal(r.headers['Cache-Control'],'private, no-store, max-age=0');});
test('complete bootstrap and detail reads return verified native source',async()=>{for(const req of [get(),get({resource:'detail',id:uid(20000)}),get({resource:'attempt',key:uid(23001)})]){const a=setup(),r=response();await a.handler(req,r);assert.equal(r.statusCode,200);assert.equal(a.calls.length,1);}});
test('every nominal read revocation and no-write authority blocks before body read or SQL connection',async()=>{for(const removed of [...OWN_NOVELTY_READ.map(c=>[c]),['payroll.novelty.prepare','payroll.novelty.approve']]){let reads=0;const req=post();Object.defineProperty(req,'body',{get(){reads++;return '{}';}});const a=setup({requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:all.filter(c=>!removed.includes(c))}}})}),r=response();await a.handler(req,r);assert.equal(r.statusCode,403);assert.equal(reads,0);assert.equal(a.stats.connects,0);}});
test('review-only permission cannot prepare a batch even though it may read a decision body',async()=>{const a=setup({requireAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:all.filter(c=>c!=='payroll.novelty.prepare')}}})}),r=response();await a.handler(post(),r);assert.equal(r.statusCode,403);assert.equal(a.stats.connects,0);});
test('foreign origin, unsigned actor and legacy access never connect',async()=>{const foreign=post();foreign.headers.origin='https://other.example';for(const [req,overrides,status]of [[foreign,{},403],[post(),{sessionFor:()=>({...session,version:0})},401],[get(),{requireAccess:async()=>({mode:'legacy',principal})},403]]){const a=setup(overrides),r=response();await a.handler(req,r);assert.equal(r.statusCode,status);assert.equal(a.stats.connects,0);}});
test('duplicate JSON/query keys, external identity, excessive count and missing values fail without SQL',async()=>{const duplicate=post();duplicate.body=duplicate.body.replace('"command":"prepare"','"command":"prepare","command":"prepare"');const missing=prepare();missing.rows[1].amountCents=null;const tooMany=prepare(10001);for(const req of [duplicate,post(missing),post(tooMany),get({resource:'bootstrap',tenantId:uid(88)}),{...get(),url:'/api/internal-own-payroll-novelties?resource=bootstrap&resource=bootstrap'}]){const a=setup(),r=response();await a.handler(req,r);assert.ok([400,413,422].includes(r.statusCode),JSON.stringify(r.value));assert.equal(a.stats.connects,0);}});
test('corrupted row hash is not exposed as a verified approval',async()=>{const a=setup({getSql:async()=>({query:async()=>[{result:batch(2,{rowsSha256:'a'.repeat(64)})}]})}),r=response();await a.handler(get({resource:'detail',id:uid(20000)}),r);assert.equal(r.statusCode,503);assert.equal(r.value.data,undefined);});
test('API returns a complete forced one-review approval or explicit confirmation without requiring a second reviewer',async()=>{
 for(const revision of [3,4]){
  const snapshot=batch(1,{revision});snapshot.rows[0].values.forced=true;snapshot.rows[0].values.observation='Synthetic independent review';
  snapshot.rowsSha256=ownNoveltyHash(snapshot.rows.map(({values,subject})=>({values,subject})));
  const body={command:'approve',batchId:snapshot.id,expectedRevision:revision-1,reasonReference:null,reviewConfirmed:true};
  const a=setup({getSql:async()=>({query:async(_sql,values)=>[{result:{version:'own-payroll-novelty-receipt.v1',requestKey:values[2],requestSha256:ownNoveltyHash(body),body,snapshot,replayed:false}}]})}),r=response();
  await a.handler(post(body),r);assert.equal(r.statusCode,201);assert.equal(r.value.data.snapshot.status,'approved');assert.equal(r.value.data.snapshot.approvals.length,1);assert.deepEqual(r.value.data.body,body);
 }
});

// Recuperación de una lectura que choca con un candado (mismo patrón que los demás circuitos del período).
test('busy bootstrap reauthorizes and retries only the same bounded read',async()=>{
 let reads=0,auth=0;const calls=[];const a=setup({requireAccess:async()=>{auth++;return {mode:'managed',principal};},getSql:async()=>({query:async(query,values)=>{calls.push({query,values});if(reads++===0)throw Error('OWN_NOVELTY_BUSY');return [{result:bootstrap()}];}})}),r=response();
 await a.handler(get(),r);assert.equal(r.statusCode,200);assert.equal(reads,2);assert.equal(auth,2);assert.deepEqual(calls[0],calls[1]);
});
test('revocation during busy recovery stops the second SQL read and returns no data',async()=>{
 let auth=0,reads=0;const a=setup({requireAccess:async(req,res)=>{if(auth++===0)return {mode:'managed',principal};res.status(403).json({ok:false});return null;},getSql:async()=>({query:async()=>{reads++;throw Error('OWN_NOVELTY_BUSY');}})}),r=response();
 await a.handler(get(),r);assert.equal(r.statusCode,403);assert.equal(reads,1);assert.equal(r.value.data,undefined);
});
test('a changed account or session during busy recovery fails closed without a second read',async()=>{
 let sessions=0,reads=0;const a=setup({sessionFor:()=>sessions++===0?session:{...session,id:uid(99)},getSql:async()=>({query:async()=>{reads++;throw Error('OWN_NOVELTY_BUSY');}})}),r=response();
 await a.handler(get(),r);assert.equal(r.statusCode,409);assert.equal(r.value.code,'OWN_NOVELTY_SCOPE_CHANGED');assert.equal(reads,1);
});
test('a persistent read BUSY stays 409 after exactly two reads, and a write BUSY never replays the command',async()=>{
 for(const [req,expected]of [[get(),2],[get({resource:'detail',id:uid(20000)}),2],[post(),1]]){let reads=0;const a=setup({getSql:async()=>({query:async()=>{reads++;throw Error('OWN_NOVELTY_BUSY');}})}),r=response();
  await a.handler(req,r);assert.equal(r.statusCode,409);assert.equal(r.value.code,'OWN_NOVELTY_BUSY');assert.equal(reads,expected,req.method);}
});
