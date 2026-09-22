import test from 'node:test';
import assert from 'node:assert/strict';
import {createLegalAlertCenterHandler} from '../api/internal-legal-alert-center.js';
import {access, session, TENANT, MEMBER} from './fixtures/legal-registry-synthetic.js';

const payload=()=>({version:'legal-alert-center.v1',today:'2026-09-21',timezone:'America/Argentina/Mendoza',limit:1500,population:0,revision:'a'.repeat(64),rows:[]});
function harness({identity=access(['legal.norm.read']),result=payload(),failure,denied=0}={}){
 const calls=[];let authorized=0;
 const handler=createLegalAlertCenterHandler({authorize:async(_req,res,policy)=>{authorized++;assert.equal(policy.allowLegacy,false);assert.deepEqual(policy.requiredCapabilities,['legal.norm.read']);if(denied){res.status(denied).json({ok:false,error:'Acceso denegado'});return null;}return identity;},getSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});if(failure)throw failure;return[{result}];}})});
 return {calls,get authorized(){return authorized;},async request({method='GET',url='/api/internal-legal-alert-center?resource=alerts',query={resource:'alerts'}}={}){const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};await handler({method,url,query},res);return res;}};
}
test('alert API binds the read facade only to verified membership and session',async()=>{
 const h=harness(),res=await h.request();assert.equal(res.statusCode,200);assert.deepEqual(res.body,{ok:true,data:payload()});assert.match(res.headers['cache-control'],/no-store/);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].sql,'SELECT public.legal_alert_center_v1($1::jsonb) AS result');assert.deepEqual(JSON.parse(h.calls[0].args[0]),{actorEmail:session.email,actorSessionId:session.id,actorSessionVersion:session.version,tenantId:TENANT,membershipId:MEMBER});
});
test('alert API rejects URL selectors and duplicated resource before authorization or SQL',async()=>{
 for(const input of [{url:'/api/internal-legal-alert-center?resource=alerts&tenantId='+TENANT},{url:'/api/internal-legal-alert-center?resource=alerts&resource=alerts'},{query:{resource:'alerts',tenantId:TENANT}},{query:{resource:['alerts']}},{url:'/api/internal-legal-alert-center?resource=other'}]){const h=harness(),res=await h.request(input);assert.equal(res.statusCode,422);assert.equal(h.authorized,0);assert.equal(h.calls.length,0);}
});
test('alert API never permits mutations',async()=>{for(const method of ['POST','PUT','PATCH','DELETE']){const h=harness(),res=await h.request({method});assert.equal(res.statusCode,405);assert.equal(res.headers.allow,'GET');assert.equal(h.calls.length,0);assert.equal(h.authorized,0);}});
test('alert API rejects missing membership capability and legacy access',async()=>{
 for(const identity of [access([]),{...access(),mode:'legacy'},{...access(),principal:{...access().principal,tenant:{...access().principal.tenant,source:'platform'}}}]){const h=harness({identity}),res=await h.request();assert.equal(res.statusCode,403);assert.equal(h.calls.length,0);}
});
test('alert API rejects mismatched session before connecting to private data',async()=>{const h=harness({identity:{...access(),session:{...session,email:'other@example.invalid'}}}),res=await h.request();assert.equal(res.statusCode,401);assert.equal(h.calls.length,0);});
test('alert API preserves authentication denials without database access',async()=>{for(const denied of [401,403]){const h=harness({denied}),res=await h.request();assert.equal(res.statusCode,denied);assert.equal(h.calls.length,0);}});
test('alert API fails closed on malformed rows without exposing internal error details',async()=>{const h=harness({result:{...payload(),population:1}}),res=await h.request();assert.equal(res.statusCode,503);assert.equal(res.body.data,undefined);assert.doesNotMatch(res.body.error,/RESPONSE_INVALID|intento/);});
test('alert API hides database failures and gives a read-only retry instruction',async()=>{const h=harness({failure:Error('postgres connection sensitive details')}),res=await h.request();assert.equal(res.statusCode,503);assert.match(res.body.error,/Reintentá/);assert.doesNotMatch(res.body.error,/postgres|sensitive|intento/);});

const v2Request={url:'/api/internal-legal-alert-center?resource=alerts&version=2',query:{resource:'alerts',version:'2'}};
const v2Payload=()=>({...payload(),version:'legal-alert-center.v2'});

test('explicit v2 binds the expanded facade to the same verified tenant and session',async()=>{
 const h=harness({result:v2Payload()}),res=await h.request(v2Request);
 assert.equal(res.statusCode,200);assert.deepEqual(res.body,{ok:true,data:v2Payload()});
 assert.match(res.headers['cache-control'],/no-store/);assert.equal(h.authorized,1);assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].sql,'SELECT public.legal_alert_center_v2($1::jsonb) AS result');
 assert.deepEqual(JSON.parse(h.calls[0].args[0]),{actorEmail:session.email,actorSessionId:session.id,actorSessionVersion:session.version,tenantId:TENANT,membershipId:MEMBER});
 const reordered=harness({result:v2Payload()});
 assert.equal((await reordered.request({...v2Request,url:'/api/internal-legal-alert-center?version=2&resource=alerts'})).statusCode,200);
});

test('alert versions require an exact matching query and URL with no caller-selected scope',async()=>{
 const invalid=[
  ...['1','02','2.0','3','', 'legal_alert_center_v2'].map(version=>({url:'/api/internal-legal-alert-center?resource=alerts&version='+version,query:{resource:'alerts',version}})),
  {...v2Request,query:{resource:'alerts',version:2}},
  {...v2Request,query:{resource:'alerts',version:['2']}},
  {...v2Request,query:{resource:'alerts'}},
  {...v2Request,url:'/api/internal-legal-alert-center?resource=alerts'},
  {...v2Request,url:v2Request.url+'&version=2'},
  {...v2Request,url:v2Request.url+'&resource=alerts'},
  {...v2Request,url:v2Request.url+'&tenantId='+TENANT,query:{...v2Request.query,tenantId:TENANT}},
  {...v2Request,query:{...v2Request.query,membershipId:MEMBER}},
 ];
 for(const input of invalid){const h=harness({result:v2Payload()}),res=await h.request(input);assert.equal(res.statusCode,422);assert.equal(h.authorized,0);assert.equal(h.calls.length,0);}
});

test('v1 and v2 never accept the other response contract or silently retry another facade',async()=>{
 for(const [request,result] of [[v2Request,payload()],[{},v2Payload()],[v2Request,{...v2Payload(),version:'legal-alert-center.v3'}]]){
  const h=harness({result}),res=await h.request(request);
  assert.equal(res.statusCode,503);assert.equal(res.body.data,undefined);assert.equal(h.calls.length,1);
 }
 const unavailable=harness({failure:Error('function legal_alert_center_v2 does not exist')}),res=await unavailable.request(v2Request);
 assert.equal(res.statusCode,503);assert.equal(unavailable.calls.length,1);assert.doesNotMatch(res.body.error,/function|does not exist|legal_alert/);
});

test('v2 cannot bypass authentication, membership capability, session binding or GET-only access',async()=>{
 for(const denied of [401,403]){const h=harness({denied,result:v2Payload()}),res=await h.request(v2Request);assert.equal(res.statusCode,denied);assert.equal(h.calls.length,0);}
 for(const identity of [access([]),{...access(),mode:'legacy'},{...access(),principal:{...access().principal,tenant:{...access().principal.tenant,source:'platform'}}}]){
  const h=harness({identity,result:v2Payload()}),res=await h.request(v2Request);assert.equal(res.statusCode,403);assert.equal(h.calls.length,0);
 }
 const mismatch=harness({identity:{...access(),session:{...session,email:'other@example.invalid'}},result:v2Payload()});
 assert.equal((await mismatch.request(v2Request)).statusCode,401);assert.equal(mismatch.calls.length,0);
 for(const method of ['POST','PUT','PATCH','DELETE']){
  const h=harness({result:v2Payload()}),res=await h.request({...v2Request,method});assert.equal(res.statusCode,405);assert.equal(h.authorized,0);assert.equal(h.calls.length,0);
 }
});
