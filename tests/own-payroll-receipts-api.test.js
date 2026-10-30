import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnReceiptHandler} from '../api/internal-own-payroll-receipts.js';
import {OWN_RECEIPT_READ,OWN_RECEIPT_PREPARE,OWN_RECEIPT_SELF} from '../assets/own-payroll-receipt-model.js';
import {OWN_RECEIPT_NOMINAL,OWN_RECEIPT_PREPARER} from '../assets/own-payroll-receipt-access.js';
import {receiptCommand,receiptEvent,receiptPreview,receiptSelf} from './fixtures/own-payroll-receipt-synthetic.js';import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {receiptError} from '../lib/internal-own-payroll-receipts.js';
const p={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(50),membershipId:uid(51),effectiveCapabilities:OWN_RECEIPT_PREPARE}},session={email:p.user.email,id:uid(52),version:1,releaseSha:'d'.repeat(40)};
const req=()=>({method:'POST',url:'/api/internal-own-payroll-receipts',query:{},headers:{origin:'http://localhost:8080','content-type':'application/json','idempotency-key':uid(9)},body:JSON.stringify({operation:'command',payload:receiptCommand()})});
const res=()=>({headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
function setup(caps=OWN_RECEIPT_PREPARE,value=receiptEvent()){const calls=[],stats={connect:0},handler=createOwnReceiptHandler({env:{INTERNAL_APP_ORIGIN:'http://localhost:8080'},requireAccess:async()=>({mode:'managed',principal:{...p,tenant:{...p.tenant,effectiveCapabilities:caps}}}),sessionFor:()=>session,getSql:async()=>{stats.connect++;return{query:async(q,v)=>{calls.push({q,v});return[{result:value}];}};}});return{handler,calls,stats};}
test('preparación toma identidad de sesión y ningún importe del cliente',async()=>{const a=setup(),r=res();await a.handler(req(),r);assert.equal(r.statusCode,201);assert.match(a.calls[0].q,/own_receipt_command/);assert.equal(JSON.parse(a.calls[0].v[0]).membershipId,p.tenant.membershipId);assert.deepEqual(JSON.parse(a.calls[0].v[1]),receiptCommand());assert.match(r.headers['Cache-Control'],/no-store/);});
test('cada capacidad nominal revocada impide leer el formulario y conectar',async()=>{for(const cap of OWN_RECEIPT_NOMINAL){const a=setup(OWN_RECEIPT_PREPARE.filter(c=>c!==cap)),request=req(),r=res();Object.defineProperty(request,'body',{get(){throw Error('Body must remain unread');}});await a.handler(request,r);assert.equal(r.statusCode,403,cap);assert.equal(a.stats.connect,0);}});
test('permiso específico revocado no escribe ni cambia el intento',async()=>{const a=setup(OWN_RECEIPT_READ),r=res();await a.handler(req(),r);assert.equal(r.statusCode,403);assert.equal(a.stats.connect,0);});
for(const [label,change]of [['origen ajeno',r=>r.headers.origin='https://evil.invalid'],['importe cliente',r=>r.body=JSON.stringify({operation:'command',payload:{...receiptCommand(),amount:'1'}})],['JSON ambiguo',r=>r.body='{"operation":"command","operati\\u006fn":"command"}'],['medio inválido',r=>r.headers['content-type']='text/plain'],['UTF8 inválido',r=>r.body=Buffer.from([255])],['sin clave',r=>delete r.headers['idempotency-key']],['método',r=>r.method='DELETE'],['URL duplicada',r=>{r.method='GET';r.query={resource:'self'};r.url+='?resource=self&resource=self';}]])test('rechaza '+label+' sin escritura',async()=>{const a=setup(),request=req(),r=res();change(request);await a.handler(request,r);assert.ok(r.statusCode>=400);assert.equal(a.calls.length,0);});
test('previa es lectura del negocio aunque usa POST y conserva todos los registros',async()=>{const a=setup(OWN_RECEIPT_READ,receiptPreview()),r=res(),request=req();request.body=JSON.stringify({operation:'preview',params:receiptPreview().snapshot.params});await a.handler(request,r);assert.equal(r.statusCode,200);assert.match(a.calls[0].q,/own_receipt_preview/);assert.equal(r.body.data.snapshot.recordCount,35);});
test('consulta propia requiere sólo sus capacidades y jamás un identificador aportado',async()=>{const a=setup(OWN_RECEIPT_SELF,receiptSelf()),r=res(),request=req();request.method='GET';request.query={resource:'self'};request.url+='?resource=self';await a.handler(request,r);assert.equal(r.statusCode,200);assert.equal(a.calls[0].v.length,1);assert.match(a.calls[0].q,/own_receipt_self/);for(const field of ['dni','legajo','contractId','personId','id']){const b=setup(OWN_RECEIPT_SELF,receiptSelf()),bad=res();await b.handler({...request,query:{resource:'self',[field]:'1'},url:request.url+'&'+field+'=1'},bad);assert.equal(bad.statusCode,400);assert.equal(b.calls.length,0);}});
test('confirmación corrupta se rechaza; replay conserva el mismo intento',async()=>{const a=setup(OWN_RECEIPT_PREPARE,{...receiptEvent(),replayed:true}),r=res();await a.handler(req(),r);assert.equal(r.statusCode,200);assert.equal(r.headers['Idempotency-Replayed'],'true');const b=setup(OWN_RECEIPT_PREPARE,{...receiptEvent(),bodySha256:'f'.repeat(64)}),bad=res();await b.handler(req(),bad);assert.equal(bad.statusCode,503);});
test('revocación SQL de una capacidad del cierre devuelve 403',()=>{const error=receiptError(Error('OWN_CLOSE_FORBIDDEN'));assert.equal(error.status,403);assert.equal(error.code,'OWN_RECEIPT_FORBIDDEN');});

const inventedIssuer=()=>({id:'qa-municipal-issuer',revision:1,issuer:{name:'MUNICIPIO INVENTADO QA',taxId:'30000000007',address:'CALLE INVENTADA 1, LOCALIDAD QA'},source:{kind:'municipal_official_backup',label:'Respaldo institucional inventado QA',cutoff:'2026-10-01T15:17:29',validityDeclared:false}});
const issuerRequest=()=>({method:'GET',url:'/api/internal-own-payroll-receipts?resource=issuer',query:{resource:'issuer'},headers:{}});
function issuerSetup(options={}){
 const stats={authorize:0,profile:0,connect:0},gateOptions=[],principal={...p,tenant:{...p.tenant,effectiveCapabilities:OWN_RECEIPT_READ}},access=Object.hasOwn(options,'access')?options.access:{mode:'managed',principal},profiles=Object.hasOwn(options,'profiles')?options.profiles:{[p.tenant.id]:inventedIssuer()};
 const handler=createOwnReceiptHandler({env:{INTERNAL_APP_ORIGIN:'http://localhost:8080'},requireAccess:async(_req,response,config)=>{stats.authorize++;gateOptions.push(config);if(access===null){response.status(401).json({ok:false,code:'SESSION_REQUIRED'});return null;}return access;},sessionFor:()=>Object.hasOwn(options,'session')?options.session:session,getSql:async()=>{stats.connect++;throw Error('Issuer must not connect to payroll SQL');},get issuerProfiles(){stats.profile++;return profiles;}});
 return {handler,stats,gateOptions,principal};
}

test('emisor institucional es lectura del perfil sintético después del mismo gate certificado',async()=>{
 const a=issuerSetup(),r=res(),request=issuerRequest();Object.defineProperty(request,'body',{get(){throw Error('GET body must remain unread');}});await a.handler(request,r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.body.data.scope,{tenantId:p.tenant.id});assert.equal(r.body.data.version,'own-receipt-issuer.v1');assert.equal(r.body.data.state,'configured');assert.deepEqual(r.body.data.profile.issuer,inventedIssuer().issuer);assert.deepEqual(r.body.data.profile.source,inventedIssuer().source);assert.match(r.body.data.profile.version,/^[a-f0-9]{64}$/);
 assert.deepEqual(a.gateOptions,[{env:{INTERNAL_APP_ORIGIN:'http://localhost:8080'},requiredCapabilities:OWN_RECEIPT_NOMINAL,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false}]);
 assert.deepEqual(a.stats,{authorize:1,profile:1,connect:0});assert.match(r.headers['Cache-Control'],/no-store/);assert.match(r.headers.Vary,/Cookie/);
 assert.equal(JSON.stringify(r.body).includes(p.tenant.membershipId),false);assert.equal(JSON.stringify(r.body).includes(session.id),false);assert.equal(JSON.stringify(r.body).includes(p.user.email),false);
});

test('tenant autenticado sin configuración retorna missing sin tomar el perfil de otro municipio',async()=>{
 const a=issuerSetup({profiles:{[uid(70)]:inventedIssuer()}}),r=res();await a.handler(issuerRequest(),r);assert.equal(r.statusCode,200);assert.deepEqual(r.body.data,{version:'own-receipt-issuer.v1',scope:{tenantId:p.tenant.id},state:'missing',profile:null});assert.equal(a.stats.connect,0);
 const missing=issuerSetup({profiles:{}}),empty=res();await missing.handler(issuerRequest(),empty);assert.equal(empty.body.data.state,'missing');assert.equal(empty.body.data.profile,null);
});

test('mapa confiable distingue tenants y ninguna respuesta modifica su perfil',async()=>{
 const secondTenant=uid(70),second=inventedIssuer();second.id='qa-second-issuer';second.issuer.name='SEGUNDO MUNICIPIO INVENTADO QA';second.issuer.taxId='30000000015';const profiles=new Map([[p.tenant.id,inventedIssuer()],[secondTenant,second]]),first=issuerSetup({profiles}),one=res();await first.handler(issuerRequest(),one);one.body.data.profile.issuer.name='Cambio en la respuesta';
 const other=issuerSetup({profiles,access:{mode:'managed',principal:{...p,tenant:{...p.tenant,id:secondTenant,effectiveCapabilities:OWN_RECEIPT_READ}}}}),two=res();await other.handler(issuerRequest(),two);assert.equal(two.statusCode,200);assert.deepEqual(two.body.data.scope,{tenantId:secondTenant});assert.deepEqual(two.body.data.profile.issuer,second.issuer);assert.deepEqual(profiles.get(p.tenant.id),inventedIssuer());assert.notEqual(one.body.data.profile.version,two.body.data.profile.version);assert.equal(first.stats.connect+other.stats.connect,0);
});

test('acceso anónimo y legado no acceden al mapa institucional ni SQL de nómina',async()=>{
 for(const access of [null,{mode:'legacy',principal:{...p,tenant:{...p.tenant,effectiveCapabilities:OWN_RECEIPT_READ}}},{mode:'managed',principal:{...p,tenant:{...p.tenant,source:'legacy',effectiveCapabilities:OWN_RECEIPT_READ}}}]){const a=issuerSetup({access}),r=res();await a.handler(issuerRequest(),r);assert.equal(r.statusCode,access===null?401:403);assert.equal(a.stats.profile,0);assert.equal(a.stats.connect,0);}
});

test('cada revocación de READ y acceso self impiden el emisor antes de leer su perfil',async()=>{
 for(const caps of [...OWN_RECEIPT_READ.map(removed=>OWN_RECEIPT_READ.filter(cap=>cap!==removed)),OWN_RECEIPT_SELF]){const a=issuerSetup({access:{mode:'managed',principal:{...p,tenant:{...p.tenant,effectiveCapabilities:caps}}}}),r=res();await a.handler(issuerRequest(),r);assert.equal(r.statusCode,403);assert.equal(a.stats.profile,0);assert.equal(a.stats.connect,0);}
});

test('sesión e identidad inválidas fallan antes de seleccionar perfil institucional',async()=>{
 const sessions=[null,{...session,email:'other@example.invalid'},{...session,id:'invalid'},{...session,version:0},{...session,version:1.5},{...session,releaseSha:'invalid'}];
 for(const bad of sessions){const a=issuerSetup({session:bad}),r=res();await a.handler(issuerRequest(),r);assert.equal(r.statusCode,401);assert.equal(r.body.code,'OWN_RECEIPT_SESSION_INVALID');assert.equal(a.stats.profile,0);assert.equal(a.stats.connect,0);}
 for(const field of ['id','membershipId']){const a=issuerSetup({access:{mode:'managed',principal:{...p,tenant:{...p.tenant,[field]:'invalid',effectiveCapabilities:OWN_RECEIPT_READ}}}}),r=res();await a.handler(issuerRequest(),r);assert.equal(r.statusCode,401);assert.equal(a.stats.profile,0);assert.equal(a.stats.connect,0);}
});

test('recurso issuer exige GET exacto sin período, selección ajena ni consulta ambigua',async()=>{
 const changes=[request=>{request.method='POST';},request=>{request.method='DELETE';},request=>{request.query={resource:'Issuer'};request.url='/api/internal-own-payroll-receipts?resource=Issuer';},request=>{request.url+='&resource=issuer';},request=>{request.query={resource:['issuer']};},request=>{request.query=[];},request=>{request.query={resource:'issuer'};request.url='/api/internal-own-payroll-receipts?resource=self';}];
 for(const key of ['period','id','tenantId','companyId','membershipId','issuerProfiles'])changes.push(request=>{request.query[key]='client-selection';request.url+='&'+key+'=client-selection';});
 for(const change of changes){const a=issuerSetup(),request=issuerRequest(),r=res();change(request);await a.handler(request,r);assert.ok([400,405].includes(r.statusCode));assert.equal(a.stats.authorize,0);assert.equal(a.stats.profile,0);assert.equal(a.stats.connect,0);}
});

test('perfil configurado corrupto falla cerrado sin identificación parcial ni SQL',async()=>{
 const bad=inventedIssuer();bad.source.validityDeclared=true;const a=issuerSetup({profiles:{[p.tenant.id]:bad}}),r=res();await a.handler(issuerRequest(),r);assert.equal(r.statusCode,503);assert.equal(r.body.code,'OWN_RECEIPT_CONTRACT_INVALID');assert.equal(r.body.data,undefined);assert.equal(a.stats.connect,0);
});

test('preparer-only authority may read the configured issuer and complete preview without calculation approval',async()=>{
 const caps=['actions.read',...OWN_RECEIPT_PREPARER],principal={...p,tenant:{...p.tenant,effectiveCapabilities:caps}};
 const issuer=issuerSetup({access:{mode:'managed',principal}}),i=res();await issuer.handler(issuerRequest(),i);
 assert.equal(i.statusCode,200);assert.equal(issuer.stats.profile,1);assert.equal(issuer.stats.connect,0);
 const a=setup(caps,receiptPreview()),r=res(),request=req();request.body=JSON.stringify({operation:'preview',params:receiptPreview().snapshot.params});
 await a.handler(request,r);assert.equal(r.statusCode,200);assert.equal(r.body.data.snapshot.recordCount,35);
 assert.equal(caps.includes('payroll.calculation.approve'),false);
});

test('receipt.approve alone never elevates a preparer to approval or withdrawal of receipts',async()=>{
 const caps=['actions.read',...OWN_RECEIPT_PREPARER,'payroll.receipt.approve'];
 for(const command of ['approve','withdraw']){
  const a=setup(caps),r=res(),request=req();request.body=JSON.stringify({operation:'command',payload:{...receiptCommand(),command,params:null,batchId:uid(60),batchSha256:'a'.repeat(64),reviewConfirmed:true}});
  await a.handler(request,r);assert.equal(r.statusCode,403,command);assert.equal(a.stats.connect,0);
 }
});
test('removing every nominal read or both module doors rejects a preparer before reading the POST body',async()=>{
 const preparer=['actions.read',...OWN_RECEIPT_PREPARER];
 for(const caps of [...OWN_RECEIPT_NOMINAL.map(cap=>preparer.filter(v=>v!==cap)),['actions.read',...OWN_RECEIPT_NOMINAL]]){
  const a=setup(caps),r=res(),request=req();Object.defineProperty(request,'body',{get(){throw Error('Forbidden receipt body must remain unread');}});
  await a.handler(request,r);assert.equal(r.statusCode,403);assert.equal(a.stats.connect,0);assert.equal(a.calls.length,0);
 }
});
