// Full React -> HTTP -> service -> journal -> provider callback -> return exercise.
// --postgres: real disposable loopback PostgreSQL, no Neon/user DSN. Default: local memory model.
import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';import {createHash,randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright';
import {createFirmarHttpHandlers} from '../lib/firmar-http.js';import {createFirmarDurableService} from '../lib/firmar-durable-service.js';
import {createFirmarPgRepository,FirmarPersistenceError} from '../lib/firmar-durable-repository.js';
const postgres=process.argv.includes('--postgres'),out='verification/firmar-http';fs.mkdirSync(out,{recursive:true});
const O='https://municipio-junin-friendly.vercel.app',VIRTUAL='https://municontrol.test',tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',member='11111111-1111-4111-8111-111111111111';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,hash=b=>createHash('sha256').update(b).digest('hex');
const requests=new Map(),submissions=new Map(),modes=new Map(),events=[],apiCalls=[];let activeId=id(10),authorized=true,dbCreated=false,roleCreated=false,server,loopback;
const prefix='2099999999',sum=[5,4,3,2,7,6,5,4,3,2].reduce((s,w,i)=>s+w*Number(prefix[i]),0),d=11-sum%11,cuil=prefix+(d===11?0:d===10?9:d);
const env={FIRMAR_ENVIRONMENT:'test',FIRMAR_INTEGRATION_APPROVAL_REF:'SYNTHETIC TEST',FIRMAR_API_USER:'synthetic-user',FIRMAR_API_SECRET:'synthetic-no-credential',FIRMAR_TENANT_ID:tenant,FIRMAR_CALLBACK_PROFILE:'pfdr-v13-object',FIRMAR_APP_ORIGIN:O,FIRMAR_CALLBACK_REGISTERED:'true',FIRMAR_DIRECT_ENABLED:'true',FIRMAR_HTTP_PILOT_ENABLED:'true'};
const pgEnv={PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'municontrol_firmar_http',PGUSER:'postgres',PGPASSWORD:'synthetic-ci-only'};
const literal=v=>"convert_from(decode('"+Buffer.from(String(v),'utf8').toString('hex')+"','hex'),'UTF8')";
function psql(statement,{runtime=false,database=pgEnv.PGDATABASE}={}){const r=spawnSync('psql',['-X','-q','-A','-t','--set=ON_ERROR_STOP=1'],{env:{...pgEnv,PGDATABASE:database},input:(runtime?'SET ROLE municontrol_actions_runtime_app;\n':'')+statement,encoding:'utf8',timeout:30000});if(r.status!==0){const code=r.stderr.match(/ERROR:\s+(FIRMAR_[A-Z_]+)/)?.[1];throw Error(code||'Disposable PostgreSQL fixture operation failed: '+r.stderr.slice(-1000));}return r.stdout.trim();}
async function seed(n){
 const rid=id(n),pdf=Buffer.from('%PDF-1.4\nSYNTHETIC TRANSPORT FIXTURE '+n+' - NOT SIGNED\n%%EOF');const r={requestId:rid,version:1,sourceVersionId:id(n+500),sourceSha256:hash(pdf),pdf,signerCuil:cuil,sourceValidationRef:'synthetic-envelope-validation-only',approvalRef:'synthetic-no-administrative-effect',attempt:null,receipt:null,returns:0};requests.set(rid,r);
 if(postgres)psql(`INSERT INTO public.firmar_signing_request(id,tenant_id,signer_membership_id,authority_id,authority_version,document_kind,source_version_id,source_sha256,source_pdf,source_validation_ref,approval_ref) VALUES('${rid}','${tenant}','${member}','44444444-4444-4444-8444-444444444444',1,'institutional.report','${r.sourceVersionId}','${r.sourceSha256}',decode('${pdf.toString('hex')}','hex'),'synthetic-envelope-only','synthetic-not-approved-for-use');`);
 activeId=rid;return r;
}
function memoryRepo(){
 const check=(ctx,rid)=>{if(!authorized)throw new FirmarPersistenceError('FIRMAR_SESSION_INVALID',401);if(ctx.actorEmail!=='fd-one@example.invalid'||ctx.membershipId!==member||ctx.tenantId!==tenant||!requests.has(rid))throw new FirmarPersistenceError('FIRMAR_NOT_FOUND',404);return requests.get(rid);};
 const byToken=h=>[...requests.values()].find(r=>r.attempt?.callbackTokenSha256===h);
 const view=r=>({requestId:r.requestId,attemptId:r.attempt.attemptId,expiresAt:r.attempt.expiresAt,state:r.receipt?'received_unverified':r.returns&&r.attempt.state==='awaiting_authorization'?'awaiting_receipt':r.attempt.state||'outcome_unknown',authorizationUrl:r.receipt||r.returns?null:r.attempt.authorizationUrl||null,officialEmissionEnabled:false});
 return {async getPrepared(c,rid){const r=check(c,rid);return{...r};},async reserve(c,v){const r=check(c,v.requestId);if(r.attempt)return{...view(r),created:false};r.attempt={...v};return{...view(r),created:true};},async recover(c,rid){const r=check(c,rid);if(!r.attempt)throw new FirmarPersistenceError('FIRMAR_ATTEMPT_NOT_FOUND',404);return view(r);},async readStatus(c,rid,aid){const r=check(c,rid);if(!r.attempt||r.attempt.attemptId!==aid)throw new FirmarPersistenceError('FIRMAR_NOT_FOUND',404);return view(r);},async recordSubmission(h,state,url){const r=byToken(h);assert.ok(r);r.attempt.state=state;r.attempt.authorizationUrl=url;return{recorded:true,replayed:false,officialEmissionEnabled:false};},async resolveReturn(c,h){const r=[...requests.values()].find(r=>r.attempt?.returnStateSha256===h);if(!r)throw new FirmarPersistenceError('FIRMAR_NOT_FOUND',404);check(c,r.requestId);r.returns=1;return{requestId:r.requestId,attemptId:r.attempt.attemptId,state:'return_bound',officialEmissionEnabled:false};},async receive(p){const r=byToken(p.callbackTokenSha256);if(!r)throw new FirmarPersistenceError('FIRMAR_NOT_FOUND',404);if(r.receipt&&r.receipt.sha256!==p.sha256)throw new FirmarPersistenceError('FIRMAR_RECEIPT_CONFLICT',409);const replayed=!!r.receipt;r.receipt??={receiptId:randomUUID(),sha256:p.sha256,bytes:p.document};return{outcome:'received_unverified',receiptId:r.receipt.receiptId,sha256:r.receipt.sha256,replayed,providerAuthenticated:false,cryptographicValidation:'not_performed',officialEmissionEnabled:false};}};
}
async function callback(rid,{changed=false}={}){const upload=submissions.get(rid);assert.ok(upload);const payload={metadata:upload.metadata,status:{success:true},documento:Buffer.from('%PDF-1.4 SYNTHETIC RETURN '+rid+(changed?' CHANGED':'')+' END').toString('base64')};return fetch(loopback+'/api/firmar-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}
const checks=[];let browser,page,repo;
try{
 if(postgres){
  assert.equal(process.env.FIRMAR_SYNTHETIC_POSTGRES,'true','Explicit disposable database opt-in');
  const result=spawnSync('createdb',['municontrol_firmar_http'],{env:{...pgEnv,PGDATABASE:'postgres'},encoding:'utf8',timeout:10000});assert.equal(result.status,0,'Disposable database must not preexist');dbCreated=true;
  psql(fs.readFileSync('scripts/fixtures/firmar-journal-identity.sql','utf8')+'\n'+fs.readFileSync('scripts/migrations/071-firmar-attempt-journal.sql','utf8'));roleCreated=true;
  psql(`INSERT INTO public.firmar_signing_authority(id,tenant_id,membership_id,document_kind,signer_cuil,identity_evidence_ref,authority_evidence_ref,valid_from,valid_until,status) VALUES('44444444-4444-4444-8444-444444444444','${tenant}','${member}','institutional.report','${cuil}','synthetic verified identity','synthetic document scope',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','active');`);
  repo=createFirmarPgRepository({query:async(statement,args)=>{assert.ok(statement.startsWith('SELECT public.firmar_'));const text=statement.replace(/\$(\d+)/g,(_,i)=>args[Number(i)-1]===null?'NULL':literal(args[Number(i)-1]));return[{result:JSON.parse(psql(text,{runtime:true}))}];}});
 }else repo=memoryRepo();
 const first=await seed(10);
 const fetchProvider=async(url,options)=>{
  if(url.endsWith('/ra/oauth/token?grant_type=client_credentials'))return new Response(JSON.stringify({access_token:'synthetic-provider-token',token_type:'bearer',expires_in:1800}),{headers:{'Content-Type':'application/json'}});
  assert.equal(url,'https://tst.firmar.gob.ar/firmador/api/signatures');const body=JSON.parse(options.body);const rid=[...requests.values()].find(r=>r.pdf.toString('base64')===body.documento)?.requestId;assert.ok(rid);assert.equal(body.cuil,cuil);events.push({type:'upload',rid});submissions.set(rid,body);
  if(modes.get(rid)==='callback-first'){const r=await callback(rid);assert.equal(r.status,201);}
  if(modes.get(rid)==='lost-response')throw Error('synthetic transport interruption');
  return new Response(null,{status:200,headers:{Location:'/api/signatures/'+rid}});
 };
 const handlers=createFirmarHttpHandlers({env,
  authorize:async(req,res)=>{if(!authorized||!req.headers.cookie?.includes('fd_test_signer=one')){res.status(401).json({ok:false,code:'FIRMAR_SESSION_INVALID'});return null;}return{mode:'managed',principal:{user:{email:'fd-one@example.invalid'},tenant:{id:tenant,membershipId:member,source:'membership'}},session:{id:member,email:'fd-one@example.invalid',version:1}};},
  serviceFor:async()=>createFirmarDurableService({repository:repo,env,fetchImpl:fetchProvider}),takeBudget:async()=>({allowed:true})});
 const code=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{FirmarConnectedJourney,FirmarConnectedReturn}from'./src/islands/firmar-connected-journey.tsx';function App(){const [valid,setValid]=useState(true);window.qaLoseSession=()=>setValid(false);const p=window.fixturePrepared;const back=()=>document.getElementById('back').hidden=false;return location.pathname==='/firmas/retorno'?<FirmarConnectedReturn sessionValid={valid} onContinue={v=>location.assign('/qa-firmar?request='+v.requestId)} onOpenQueue={back}/>:<FirmarConnectedJourney document={p} sessionValid={valid} onBack={back} preview={<article className="qa-preview"><p>VISTA PREVIA SINTÉTICA · SIN FIRMA</p><h2>Informe institucional</h2><p>Documento de prueba, sin datos municipales ni efecto administrativo.</p><hr/><p>Este ensayo comprueba el recorrido de una solicitud. No valida una firma digital.</p></article>}/>;}createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
 const bundle=await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const css=fs.readFileSync('assets/firmar-journey.css','utf8')+'\n'+fs.readFileSync('assets/firmar-connected-journey.css','utf8');
 const html=rid=>`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>MuniControl · Prueba del circuito de firma</title><style>body{margin:0;background:#edf3f3;padding:clamp(12px,4vw,44px);font:15px/1.6 system-ui}.qa-preview{background:white;padding:30px;border-radius:4px;min-height:390px}.qa-preview>p:first-child{font-size:11px;color:#5c6c75}.qa-preview h2{font-size:27px;color:#123649}#back{padding:10px}${css}</style></head><body><div id="root"></div><p id="back" hidden>Volviste al documento de prueba.</p><script>window.fixturePrepared=${JSON.stringify({id:rid,version:1,title:'Informe institucional · ensayo integrado',pages:1,sha256:requests.get(rid)?.sourceSha256})}</script><script src="/qa-entry.js"></script></body></html>`;
 server=createServer((req,res)=>{res.status=s=>{res.statusCode=s;return res;};res.json=b=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(b));return res;};
  const u=new URL(req.url,loopback||'http://localhost');if(u.pathname.startsWith('/api/')){apiCalls.push({path:u.pathname,method:req.method});const handler=u.pathname==='/api/internal-firmar'?handlers.interactive:u.pathname==='/api/firmar-callback'?handlers.callback:null;return handler?void handler(req,res):res.status(404).json({ok:false});}
  if(u.pathname==='/qa-entry.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].contents);}
  res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');res.end(html(u.searchParams.get('request')||activeId));
 });server.requestTimeout=15000;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));loopback='http://127.0.0.1:'+server.address().port;
 if(process.argv.includes('--http-only')){
  const {createFirmarHttpClient}=await import('../assets/firmar-http-client.js');
  const client=createFirmarHttpClient({fetchImpl:(url,options)=>fetch(loopback+url,{...options,headers:{...options.headers,Origin:O,Cookie:'fd_test_signer=one','Sec-Fetch-Site':'same-origin'}})});
  const prepared=await client.prepared({requestId:first.requestId});assert.equal(prepared.sourceSha256,first.sourceSha256);
  const initial=await client.begin({requestId:first.requestId,expectedVersion:1,sourceSha256:first.sourceSha256});
  assert.equal(initial.state,'awaiting_authorization');const recovered=await client.recoverAttempt({requestId:first.requestId});assert.equal(recovered.attemptId,initial.attemptId);assert.equal(events.length,1);
  const token=new URL(submissions.get(first.requestId).urlRedirect).hash.slice(1);
  const returned=await client.resolveReturn({state:token});assert.equal(returned.attemptId,initial.attemptId);
  const repeated=await client.resolveReturn({state:token});assert.deepEqual(repeated,returned);
  assert.equal((await callback(first.requestId)).status,201);assert.equal((await callback(first.requestId)).status,201);assert.equal((await callback(first.requestId,{changed:true})).status,409);
  assert.equal((await client.readStatus({requestId:first.requestId,attemptId:initial.attemptId})).state,'received_unverified');
  const stale=await seed(14);await assert.rejects(client.begin({requestId:stale.requestId,expectedVersion:1,sourceSha256:'0'.repeat(64)}),e=>e.status===409);assert.equal(events.length,1);
  const fast=await seed(15);modes.set(fast.requestId,'callback-first');const early=await client.begin({requestId:fast.requestId,expectedVersion:1,sourceSha256:fast.sourceSha256});assert.equal(early.state,'received_unverified');
  const lost=await seed(16);modes.set(lost.requestId,'lost-response');await assert.rejects(client.begin({requestId:lost.requestId,expectedVersion:1,sourceSha256:lost.sourceSha256}),e=>e.safeToRetry===false);assert.equal((await client.recoverAttempt({requestId:lost.requestId})).state,'outcome_unknown');assert.equal(events.length,3);
  authorized=false;await assert.rejects(client.prepared({requestId:first.requestId}),e=>e.status===401);
  const result={ok:true,transport:'real_loopback_http',storage:postgres?'disposable_postgresql':'local_memory_model',checks:14,syntheticProviderUploads:events.length,realProviderRequests:0,officialEmissionEnabled:false};
  console.log(JSON.stringify(result));fs.writeFileSync(out+'/http-only.json',JSON.stringify(result,null,2));
 }else{
 browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',serviceWorkers:'block'});
 await context.addCookies([{name:'fd_test_signer',value:'one',domain:'municontrol.test',path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.origin===VIRTUAL){
   // Test-only reverse proxy to our loopback server. No traffic to municipal or provider hosts.
   const headers={...await req.allHeaders()};delete headers.host;if(headers.origin===VIRTUAL)headers.origin=O;
   const response=await fetch(loopback+url.pathname+url.search,{method:req.method(),headers,...(req.postDataBuffer()?{body:req.postDataBuffer()}:{}),redirect:'error'});
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  }
  if(url.origin==='https://tst.firmar.gob.ar')return route.fulfill({contentType:'text/html',body:'<h1>Proveedor sintético</h1><p>No se realizan firmas ni se solicitan credenciales.</p>'});
  return route.abort();
 });
 await context.addInitScript(()=>{window.open=()=>null;});
 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(VIRTUAL+'/qa-firmar');await page.getByRole('button',{name:'Firmar PDF',exact:true}).waitFor();
 assert.equal(events.length,0);assert.equal(await page.getByRole('button',{name:'Firmar PDF',exact:true}).isDisabled(),true);
 await page.screenshot({path:out+'/desktop-review.png',fullPage:true});checks.push('opening confirms persisted source and attempt before showing signature action');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Firmar PDF',exact:true}).click();
 await page.locator('.mc-firmar-status').filter({hasText:'Autorizá la firma'}).waitFor();assert.equal(events.length,1);checks.push('user gesture -> HTTP -> reserved attempt -> single synthetic provider upload');
 // Close the authorization window, then recover the SAME attempt by reloading the host.
 await page.reload();await page.getByRole('button',{name:'Actualizar estado de esta solicitud'}).waitFor();assert.equal(events.length,1);checks.push('host reload recovers the stored attempt; no reupload');
 const upload=submissions.get(first.requestId);const returnPage=await context.newPage();await returnPage.goto(upload.urlRedirect.replace(O,VIRTUAL));await returnPage.getByRole('button',{name:'Continuar en mi solicitud'}).waitFor();assert.equal(new URL(returnPage.url()).hash,'');assert.equal(events.length,1);checks.push('real return POST resolves context and removes URL fragment without claiming signature validity');
 await returnPage.getByRole('button',{name:'Continuar en mi solicitud'}).click();await returnPage.locator('.mc-firmar-status').filter({hasText:'Esperando el documento'}).waitFor();
 let receipt=await callback(first.requestId);assert.equal(receipt.status,201);assert.equal((await receipt.json()).officialEmissionEnabled,false);
 await returnPage.getByRole('button',{name:'Actualizar estado de esta solicitud'}).click();await returnPage.locator('.mc-firmar-status').filter({hasText:'Documento recibido. Falta verificar'}).waitFor();await returnPage.screenshot({path:out+'/desktop-received.png',fullPage:true});
 receipt=await callback(first.requestId);assert.equal(receipt.status,201);receipt=await callback(first.requestId,{changed:true});assert.equal(receipt.status,409);checks.push('callback persists unverified bytes, exact replay deduplicates, changed bytes rejected');
 if(postgres){const row=JSON.parse(psql(`SELECT json_build_object('attempts',(SELECT count(*) FROM firmar_signing_attempt WHERE request_id='${first.requestId}'),'receipts',(SELECT count(*) FROM firmar_signing_receipt WHERE request_id='${first.requestId}'),'returns',(SELECT count(*) FROM firmar_signing_event WHERE request_id='${first.requestId}' AND kind='return_bound'),'conflicts',(SELECT count(*) FROM firmar_signing_event WHERE request_id='${first.requestId}' AND kind='receipt_conflict'),'state',(SELECT state FROM firmar_signing_receipt WHERE request_id='${first.requestId}'));`));assert.deepEqual(row,{attempts:1,receipts:1,returns:1,conflicts:1,state:'received_unverified'});checks.push('actual SQL: one attempt, one original, one return and conflict event');}
 await returnPage.close();
 // Callback racing ahead of the initial provider response must not strand the user.
 const fast=await seed(11);modes.set(fast.requestId,'callback-first');await page.goto(VIRTUAL+'/qa-firmar?request='+fast.requestId);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Firmar PDF',exact:true}).click();await page.locator('.mc-firmar-status').filter({hasText:'Documento recibido. Falta verificar'}).waitFor();assert.equal(events.filter(e=>e.rid===fast.requestId).length,1);assert.equal(await page.getByRole('button',{name:'Recuperar el intento guardado'}).count(),0);checks.push('early callback directly enters received state without a second recovery step');
 const lost=await seed(12);modes.set(lost.requestId,'lost-response');await page.goto(VIRTUAL+'/qa-firmar?request='+lost.requestId);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Firmar PDF',exact:true}).click();await page.getByRole('button',{name:'Recuperar el intento guardado'}).click();await page.getByRole('button',{name:'Actualizar estado de esta solicitud'}).waitFor();assert.equal(events.filter(e=>e.rid===lost.requestId).length,1);checks.push('lost provider response recovered over real HTTP without reupload');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(VIRTUAL+'/qa-firmar?request='+first.requestId);await page.locator('.mc-firmar-status').filter({hasText:'Documento recibido. Falta verificar'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/mobile-'+width+'.png',fullPage:true});checks.push('connected state reflows and preserves context at '+width+'px');}
 await page.setViewportSize({width:1440,height:1050});await page.goto(VIRTUAL+'/qa-firmar?request='+first.requestId);await page.getByRole('button',{name:'Actualizar estado de esta solicitud'}).waitFor();authorized=false;if(postgres)psql(`UPDATE tenant_identity_session SET status='revoked' WHERE id='${member}';`);
 await page.getByRole('button',{name:'Actualizar estado de esta solicitud'}).click();await page.getByRole('alert').filter({hasText:'Tu sesión cambió'}).waitFor();assert.equal(await page.locator('.qa-preview').count(),0);checks.push('revocation clears private preview and prevents stale controls');
 assert.deepEqual(errors,[]);assert.ok(!apiCalls.some(c=>c.path.includes('#')));
 const report={ok:true,checks:checks.length,labels:checks,storage:postgres?'disposable_postgresql':'local_memory_model',identityAdapter:'synthetic_cookie_and_minimal_sql_contract',rateBudget:'injected_allow_for_synthetic_browser',virtualHost:VIRTUAL,popup:'blocked-window-path',realProviderRequests:0,realMunicipalDocuments:0,officialEmissionEnabled:false,providerUploads:events.length};
 fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}catch(e){if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}
finally{await browser?.close();if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}if(dbCreated){spawnSync('dropdb',['--force','municontrol_firmar_http'],{env:{...pgEnv,PGDATABASE:'postgres'},timeout:10000});if(roleCreated)psql('DROP ROLE municontrol_actions_runtime_app;',{database:'postgres'});}}
