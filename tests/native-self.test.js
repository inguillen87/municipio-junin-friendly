import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeSelfHandler} from '../api/internal-native-self.js';
import {createNativeSelfLeaveHandler} from '../api/internal-native-self-leave.js';
import {nativeSelfView} from '../assets/native-self-model.js';
import {nativeSelfError,nativeSelfLeaveOperation} from '../lib/internal-native-self.js';
import {ID,CONTRACT,principal as administrative,session,command,receipt,bootstrap,profile} from './fixtures/native-leave-synthetic.js';

const CAPS=['actions.read',...['read','create','update','submit','cancel'].map(k=>'leave.request.self.'+k)];
const principal={...administrative,tenant:{...administrative.tenant,effectiveCapabilities:CAPS}};
const view=()=>({version:'native-employee-self.v1',state:'native',subject:{...bootstrap().subject,registeredAt:'2026-09-23T12:00:00.000000Z'}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(v){this.payload=v;return this;}});
const query=q=>({method:'GET',query:q,url:'/api/internal-native-self?'+new URLSearchParams(q),headers:{}});
const post=body=>({method:'POST',url:'/api/internal-native-self-leave',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':ID},body:JSON.stringify({operation:'command',payload:body})});
function setup(factory=createNativeSelfHandler,options={}){
 const calls=[],stats={connections:0};
 const deps={env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},sessionFor:()=>options.session??session,requireAccess:async(_req,res,gates)=>{stats.gates=gates;if(options.revoked){res.status(403).json({ok:false});return null;}return options.access??{mode:'managed',principal};},getSql:async()=>{stats.connections++;return{query:async(sql,values)=>{calls.push({sql,values});if(options.sqlError)throw Error(options.sqlError);return[{result:options.result??view()}];}};}};
 return{handler:factory(deps),calls,stats};
}
test('autogestión resuelve sólo la cuenta y no necesita consulta general del padrón',async()=>{
 const {handler,calls,stats}=setup(),res=response();await handler(query({resource:'bootstrap'}),res);
 assert.equal(res.statusCode,200);assert.deepEqual(stats.gates.requiredCapabilities,['actions.read','leave.request.self.read']);assert.equal(stats.gates.allowLegacy,false);assert.equal(stats.gates.requireCertifiedDataBinding,true);assert.match(res.headers['Cache-Control'],/no-store/);
 assert.equal(calls.length,1);assert.match(calls[0].sql,/native_employee_self_bootstrap_v1/);assert.equal(calls[0].values.length,1);
 assert.deepEqual(Object.keys(JSON.parse(calls[0].values[0])).sort(),['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']);
 assert.equal(JSON.parse(calls[0].values[0]).actorEmail,principal.user.email);
});
for(const [name,q] of Object.entries({contract:{resource:'bootstrap',contractId:CONTRACT},legajo:{resource:'bootstrap',legajo:'5001'},municipio:{resource:'bootstrap',tenantId:ID},unknown:{resource:'export'},missing:{}}))test('la consulta propia rechaza '+name+' antes de abrir SQL',async()=>{const s=setup(),res=response();await s.handler(query(q),res);assert.equal(res.statusCode,400);assert.equal(s.stats.connections,0);});
test('parámetros duplicados, POST y una sesión incompleta no abren SQL',async()=>{
 for(const mutate of [r=>r.url+='&resource=bootstrap',r=>r.method='POST']){const s=setup(),r=query({resource:'bootstrap'}),res=response();mutate(r);await s.handler(r,res);assert.ok(res.statusCode>=400);assert.equal(s.calls.length,0);}
 const s=setup(createNativeSelfHandler,{session:{...session,id:null}}),res=response();await s.handler(query({resource:'bootstrap'}),res);assert.equal(res.statusCode,401);assert.equal(s.stats.connections,0);
});
test('sin permisos propios, revocación o acceso legado no se consulta ningún contrato',async()=>{
 for(const options of [{revoked:true},{access:{mode:'legacy',principal}},{access:{mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:['actions.read','workforce.employee.read']}}}}]){const s=setup(createNativeSelfHandler,options),res=response();await s.handler(query({resource:'bootstrap'}),res);assert.equal(res.statusCode,403);assert.equal(s.stats.connections,0);}
});
test('sin vínculo o contrato importado no devuelve una identidad sustituta',async()=>{for(const state of ['unlinked','reference']){const s=setup(createNativeSelfHandler,{result:{version:'native-employee-self.v1',state,subject:null}}),res=response();await s.handler(query({resource:'bootstrap'}),res);assert.equal(res.statusCode,200);assert.equal(res.payload.data.subject,null);}});
test('el contrato propio rechaza identidad nominal extra, formato inválido y fechas imposibles',()=>{
 assert.equal(nativeSelfView(view()).subject.legajo,'5001');
 for(const mutate of [v=>v.subject.dni='99000000',v=>v.subject.legajo='05001',v=>v.subject.legajo=5001,v=>v.subject.registeredAt='2026-02-30T12:00:00.000000Z',v=>v.subject.sourceCutoff='2026-01-01',v=>v.subject.origin='GRH',v=>v.state='unlinked']){const v=view();mutate(v);assert.throws(()=>nativeSelfView(v),e=>e.code==='NATIVE_SELF_CONTRACT_INVALID');}
});
test('una respuesta incompleta no se expone como ficha validada',async()=>{const v=view();v.subject.extra='privado';const s=setup(createNativeSelfHandler,{result:v}),res=response();await s.handler(query({resource:'bootstrap'}),res);assert.equal(res.statusCode,503);assert.equal(res.payload.data,undefined);assert.ok(!JSON.stringify(res.payload).includes('privado'));});
test('la API propia guarda con el recibo exacto y la fachada SQL propia',async()=>{const s=setup(createNativeSelfLeaveHandler,{result:receipt()}),res=response();await s.handler(post(command()),res);assert.equal(res.statusCode,201);assert.match(s.calls[0].sql,/native_self_leave_command_v1/);assert.equal(JSON.parse(s.calls[0].values[0]).membershipId,principal.tenant.membershipId);assert.equal(s.calls[0].values[2],ID);assert.equal(res.payload.data.payrollModified,false);});
for(const cmd of ['approve','reject','profile_propose','profile_approve','profile_reject'])test('la API propia rechaza '+cmd+' aun con permisos administrativos',async()=>{
 const payload=cmd==='profile_propose'?profile():null,body=command({command:cmd,entityId:cmd==='profile_propose'?null:ID,expectedVersion:cmd==='profile_propose'?0:1,payload,reason:'Decisión sintética para prueba de control',manualValidationConfirmed:['approve','profile_approve'].includes(cmd),evidenceStatus:cmd==='approve'?'verified':null});
 const s=setup(createNativeSelfLeaveHandler,{access:{mode:'managed',principal:{...administrative,tenant:{...administrative.tenant,effectiveCapabilities:[...administrative.tenant.effectiveCapabilities,...CAPS]}}}}),res=response();await s.handler(post(body),res);assert.equal(res.statusCode,403);assert.equal(s.stats.connections,0);
});
test('el permiso general de gestión no reemplaza el permiso propio de crear',async()=>{const s=setup(createNativeSelfLeaveHandler,{access:{mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:['actions.read','leave.request.self.read','leave.request.all.manage']}}}}),res=response();await s.handler(post(command()),res);assert.equal(res.statusCode,403);assert.equal(s.calls.length,0);});
test('consulta y recuperación propias conservan las validaciones originales del contrato y recibo',async()=>{
 const b=bootstrap();b.permissions.canProposeProfile=false;const calls=[];const sql={query:async(q,v)=>{calls.push({q,v});return[{result:q.includes('bootstrap')?b:receipt(command(),{replayed:true})}];}};
 await nativeSelfLeaveOperation(sql,principal,session,'bootstrap',{contractId:CONTRACT});await nativeSelfLeaveOperation(sql,principal,session,'attempt',{contractId:CONTRACT,key:ID});assert.match(calls[0].q,/native_self_leave_bootstrap_v1/);assert.match(calls[1].q,/native_self_leave_attempt_v1/);assert.deepEqual(calls[1].v.slice(1),[CONTRACT,ID]);
 await assert.rejects(nativeSelfLeaveOperation({query:async()=>[{result:receipt(command(),{requestSha256:'0'.repeat(64)})}]},principal,session,'command',{body:command(),key:ID}),e=>e.code==='NATIVE_LEAVE_CONTRACT_INVALID');
});
test('errores de sesión y vínculo se informan sin detalles SQL ni identidad',()=>{assert.equal(nativeSelfError(Error('NATIVE_SELF_SESSION_INVALID detalle privado')).status,401);const e=nativeSelfError(Error('NATIVE_SELF_IDENTITY_INVALID detalle privado'));assert.equal(e.status,403);assert.ok(!e.message.includes('detalle'));});
