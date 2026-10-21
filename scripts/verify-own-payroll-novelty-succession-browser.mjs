// Real built component and HTTP handler. All actors, rows, storage and source
// changes below are synthetic. This does not execute SQL or prove migration197.
// The existing committed-PostgreSQL novelty browser runner remains separate.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createOwnNoveltyHandler} from '../api/internal-own-payroll-novelties.js';
import {ownNoveltyHash} from '../lib/internal-own-payroll-novelties.js';
import {ownNoveltyBatch,ownNoveltyCommand,ownNoveltyAffectedStatePreimage,prepareOwnNoveltyReview,prepareOwnNoveltySuccessionReview,reviewOwnNoveltySuccessionApproval,OWN_NOVELTY_READ,OWN_NOVELTY_SUCCESSION_COMMAND,OWN_NOVELTY_SUCCESSION_BATCH} from '../assets/own-payroll-novelties-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {bootstrap as fixtureBootstrap} from '../tests/fixtures/own-payroll-novelties-synthetic.js';
import {uid} from '../tests/fixtures/own-payroll-program-synthetic.js';

const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'public'),options={};
for(const arg of process.argv.slice(2)){const match=/^--(browser|output)=(.+)$/.exec(arg);assert.ok(match,'Only explicit browser/output arguments are accepted');assert.equal(options[match[1]],undefined);options[match[1]]=match[2];}
assert.ok(['chrome','chromium'].includes(options.browser));assert.ok(options.output);
const output=path.resolve(options.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output),'New private verification output required');
assert.equal(path.extname(output),'.json');
assert.ok(fs.existsSync(path.dirname(output)),'Output parent must already exist');
for(const width of [1366,390,320])for(const kind of ['successor','reader'])assert.ok(!fs.existsSync(output.replace(/\.json$/,`-${width}-${kind}.png`)),'Existing browser evidence must not be overwritten');
for(const file of ['assets/own-payroll-novelties-model.js','assets/own-payroll-novelties-panel.js'])assert.ok(fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(base,file))),'Built component must match current source: '+file);
const clone=value=>structuredClone(value),sha=letter=>letter.repeat(64),same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const actors={maker:{email:'maker@example.invalid',membershipId:uid(21001),personId:uid(21002),sessionId:uid(21101)},checker:{email:'checker@example.invalid',membershipId:uid(21003),personId:uid(21004),sessionId:uid(21103)},reader:{email:'reader@example.invalid',membershipId:uid(21007),personId:uid(21008),sessionId:uid(21107)}};
const capabilities=name=>[...OWN_NOVELTY_READ,'payroll.novelty.export',...(name==='maker'?['payroll.novelty.prepare']:name==='checker'?['payroll.novelty.approve']:[])];
const who=req=>['checker','reader'].includes(req.headers['x-qa-actor'])?req.headers['x-qa-actor']:'maker';
const actorIdentity=name=>({membershipId:actors[name].membershipId,personId:actors[name].personId});
const fail=code=>{throw Error('OWN_NOVELTY_'+code);};

function syntheticStore(){
 const subjects=fixtureBootstrap(61).subjects,events=new Map(),requests=new Map(),affected=new Map(),calls=[],writes=[],reads=[],failSuccession=new Set();let nextId=30000,loseNextCommand=false;
 const current=id=>events.get(id)?.at(-1)??null,all=()=>[...events.values()].map(history=>history.at(-1)),allEvents=()=>[...events.values()].flat();
 const boot=name=>({version:'own-payroll-novelty-bootstrap.v1',complete:true,subjects:clone(subjects),batches:all().map(b=>({id:b.id,revision:b.revision,status:b.status,periodMonth:b.periodMonth,payrollType:b.payrollType,rowCount:b.rowCount,preparedBy:b.preparedBy})),permissions:{canPrepare:name==='maker',canApprove:name==='checker'}});
 function succession(name,id){
  if(name==='reader')fail('FORBIDDEN');if(failSuccession.has(name))fail('STATE_INVALID');
  const parent=events.get(id)?.filter(b=>b.status==='approved').at(-1);if(!parent)fail('NOT_FOUND');
  const pending=all().find(b=>b.version===OWN_NOVELTY_SUCCESSION_BATCH&&b.supersedes.batchId===id&&['draft','submitted'].includes(b.status)),approved=allEvents().find(b=>b.version===OWN_NOVELTY_SUCCESSION_BATCH&&b.supersedes.batchId===id&&b.status==='approved');
  const state=clone(affected.get(id)??{version:'own-payroll-novelty-affected-state.v1',captures:[],groups:[]}),blockingUses=[...state.captures.flatMap(c=>{const contractIds=c.employees.filter(e=>e.state==='confirmed').map(e=>e.contractId);return contractIds.length?[{kind:'confirmed',id:c.runId,contractIds}]:[];}),...state.groups.filter(g=>g.state==='closed').map(g=>({kind:'closed',id:g.groupId,contractIds:g.contractIds}))].sort((a,b)=>(a.kind+':'+a.id)<(b.kind+':'+b.id)?-1:1);
  const value={version:'own-payroll-novelty-succession-context.v1',batch:clone(parent),snapshotSha256:ownNoveltyHash(parent),effective:current(id).status==='approved'&&!approved,identitiesCurrent:true,canPrepare:name==='maker',pendingSuccessor:pending?{batchId:pending.id,revision:pending.revision,status:pending.status}:null,approvedSuccessor:approved?{batchId:approved.id,revision:approved.revision,status:'approved'}:null,blockingUses,affectedState:state,affectedStateVersion:sha('a')};value.affectedStateVersion=ownNoveltyHash(ownNoveltyAffectedStatePreimage(value));return value;
 }
 function command(name,raw,key){
  const body=ownNoveltyCommand(raw),requestId=name+':'+key,previous=requests.get(requestId);
  if(previous){if(!same(previous.body,body))fail('IDEMPOTENCY_REUSE');return {...clone(previous),replayed:true};}
  if(name==='reader'||body.command==='approve'&&name!=='checker'||body.command!=='approve'&&name!=='maker')fail('FORBIDDEN');
  let snapshot;
  if(body.command==='prepare'){
   const review=body.version===OWN_NOVELTY_SUCCESSION_COMMAND?prepareOwnNoveltySuccessionReview(succession(name,body.supersedes.batchId),boot(name),body.rows,body.correctionReason):prepareOwnNoveltyReview(boot(name),body);
   if(!same(review.body,body))fail('INPUT_INVALID');
   snapshot={version:body.version===OWN_NOVELTY_SUCCESSION_COMMAND?OWN_NOVELTY_SUCCESSION_BATCH:'own-payroll-novelty-batch.v1',id:uid(nextId++),revision:1,status:'draft',periodMonth:body.periodMonth,payrollType:body.payrollType,rows:clone(review.rows),rowCount:review.rows.length,rowsSha256:ownNoveltyHash(review.rows.map(({values,subject})=>({values,subject}))),preparedBy:actorIdentity(name),decidedBy:null,approvals:[],grhMutation:false,payrollCalculated:false,payrollPosted:false,...(body.version===OWN_NOVELTY_SUCCESSION_COMMAND?{supersedes:clone(body.supersedes),correctionReason:body.correctionReason}:{})};
  }else{
   const before=current(body.batchId);if(!before)fail('NOT_FOUND');if(before.revision!==body.expectedRevision)fail('VERSION_CHANGED');
   if((before.version===OWN_NOVELTY_SUCCESSION_BATCH)!==(body.version===OWN_NOVELTY_SUCCESSION_COMMAND))fail('SUCCESSION_VERSION_REQUIRED');
   if(body.command==='submit'&&before.status!=='draft'||body.command==='approve'&&before.status!=='submitted')fail('STATE_INVALID');
   if(body.command==='approve'&&(before.preparedBy.personId===actors[name].personId||before.preparedBy.membershipId===actors[name].membershipId))fail('INDEPENDENT_REQUIRED');
   if(body.command==='approve'&&before.version===OWN_NOVELTY_SUCCESSION_BATCH){const context=reviewOwnNoveltySuccessionApproval(succession(name,before.supersedes.batchId),before);if(context.affectedStateVersion!==body.affectedStateVersion)fail('SUCCESSION_AFFECTED_STATE_CHANGED');}
   snapshot={...clone(before),revision:before.revision+1,status:{submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'}[body.command]};
   if(body.command==='approve'){snapshot.approvals=[...snapshot.approvals,actorIdentity(name)];snapshot.decidedBy=actorIdentity(name);}
  }
  ownNoveltyBatch(snapshot);const receipt={version:'own-payroll-novelty-receipt.v1',requestKey:key,requestSha256:ownNoveltyHash(body),body:clone(body),snapshot:clone(snapshot),replayed:false};
  const history=events.get(snapshot.id)??[];history.push(clone(snapshot));events.set(snapshot.id,history);requests.set(requestId,clone(receipt));return receipt;
 }
 async function query(sql,values){
  assert.match(sql,/^SELECT public\.own_novelty_(bootstrap|detail|attempt|command|succession_context)_v1\(/,'Only existing HTTP facade seam is simulated');
  const signed=JSON.parse(values[0]),name=Object.keys(actors).find(n=>actors[n].membershipId===signed.membershipId&&actors[n].email===signed.actorEmail);assert.ok(name,'Real handler supplied signed synthetic context');calls.push({sql,name});
  let result;
  if(sql.includes('bootstrap'))result=boot(name);
  else if(sql.includes('succession_context')){reads.push({name,kind:'succession',id:values[1]});result=succession(name,values[1]);}
  else if(sql.includes('detail')){result=clone(current(values[1]));if(!result)fail('NOT_FOUND');}
  else if(sql.includes('attempt')){reads.push({name,kind:'attempt',key:values[1]});result=clone(requests.get(name+':'+values[1]));if(!result)fail('NOT_FOUND');result.replayed=true;}
  else{writes.push({name,key:values[2],body:JSON.parse(values[1])});result=command(name,JSON.parse(values[1]),values[2]);if(loseNextCommand){loseNextCommand=false;throw Error('QA_RESPONSE_LOST_AFTER_SYNTHETIC_SAVE');}}
  return [{result}];
 }
 return {subjects,events,requests,calls,writes,reads,query,current,succession,boot,failSuccession,lose(){loseNextCommand=true;},addPendingUse(parentId){affected.set(parentId,{version:'own-payroll-novelty-affected-state.v1',captures:[{runId:uid(39000),bodySha256:sha('b'),payloadSha256:sha('c'),algorithmSha256:sha('d'),inputSha256:null,resultSha256:null,employees:[{contractId:subjects[0].contractId,state:'captured',version:0,liquidationVersion:null}]}],groups:[]});}};
}

async function fixtureServer(store){
 const env={},httpCalls=[],handler=createOwnNoveltyHandler({env,requireAccess:async req=>{const name=who(req);return {mode:'managed',actor:name,principal:{user:{email:actors[name].email},tenant:{source:'membership',id:uid(1),membershipId:actors[name].membershipId,effectiveCapabilities:capabilities(name)}}};},sessionFor:access=>({email:actors[access.actor].email,id:actors[access.actor].sessionId,version:1,releaseSha:'a'.repeat(40)}),getSql:async()=>({query:store.query})});
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://local.invalid'),name=who(req),json=(status,value)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));try{
  if(url.pathname==='/api/internal-auth'){json(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:'synthetic-'+name,email:actors[name].email},expiresAt:new Date(Date.now()+3600000).toISOString(),access:{context:'tenant',tenant:{id:uid(1),roleKey:name},tenantCapabilities:capabilities(name)}});return;}
  if(url.pathname==='/api/internal-own-payroll-novelties'){httpCalls.push({name,method:req.method,url:url.pathname+url.search});req.query=Object.fromEntries(url.searchParams);await handler(req,{setHeader:(k,v)=>res.setHeader(k,v),status(n){this.statusCode=n;return this;},json(value){json(this.statusCode??200,value);}});return;}
  if(url.pathname==='/qa.html'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Correcciones sintéticas</title><style>body{margin:12px;font-family:system-ui}main{max-width:1100px;min-width:0;margin:auto}</style><main id="qa"></main><script type="module">import {mountOwnPayrollNovelties} from "/assets/own-payroll-novelties-panel.js";window.qaPanel=mountOwnPayrollNovelties(document.getElementById("qa"));</script></html>');return;}
  const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){json(404,{ok:false});return;}res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'application/javascript'});fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch(e){if(!res.headersSent)json(500,{ok:false,error:'Synthetic fixture failed'});else res.destroy();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;return {origin,httpCalls,close:()=>new Promise(resolve=>server.close(resolve))};
}

let browser,activeServer,report;const rows=61,scenarioResults=[],browserErrors=[];
try{
 browser=await chromium.launch(options.browser==='chrome'?{channel:'chrome'}:{});
 for(const width of [1366,390,320]){
  const store=syntheticStore(),server=await fixtureServer(store);activeServer=server;const contexts=[];let checks=0;const check=(value,label)=>{assert.ok(value,`${width}: ${label}`);checks++;};
  async function pageFor(name){const context=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:{'x-qa-actor':name},acceptDownloads:true});contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>browserErrors.push({width,name,message:error.message}));await page.goto(server.origin+'/qa.html');return {page,$:key=>page.locator('[data-n-'+key+']'),idle:()=>page.waitForFunction(()=>document.getElementById('qa').getAttribute('aria-busy')==='false')};}
  const maker=await pageFor('maker'),checker=await pageFor('checker');
  const refresh=async p=>{await p.$('refresh').click();await p.idle();},open=async(p,id)=>{await p.$('batch').selectOption(id);await p.$('open').click();await p.idle();},decide=async(p,command)=>{await p.page.locator('[data-n-decisions] [data-command="'+command+'"]').click();await p.idle();await p.$('confirm').check();await p.$('send').click();await p.idle();},next=async p=>{await p.$('new').click();await p.idle();};
  await refresh(maker);await maker.$('select-all').click();await maker.$('period').fill('2026-10');await maker.$('concept').fill('120');await maker.$('amount').fill('20,00');await maker.$('add').click();check((await maker.$('count').textContent()).startsWith(rows+' filas'),'complete synthetic parent population');
  await maker.$('review').click();await maker.idle();await maker.$('confirm').check();await maker.$('send').click();await maker.idle();const parentId=store.writes.at(-1).body.command==='prepare'?[...store.events.keys()].at(-1):null;check(!!parentId,'parent prepared through actual UI and API');await next(maker);await open(maker,parentId);await decide(maker,'submit');await next(maker);
  await refresh(checker);await open(checker,parentId);store.lose();await decide(checker,'approve');check(await checker.$('recover').isVisible(),'lost approval response preserves pending attempt');const originalApproval=clone(store.writes.at(-1));store.failSuccession.add('checker');await checker.$('recover').click();await checker.idle();check((await checker.$('status').textContent()).includes('Comprobante original verificado'),'historical approval receipt visible when current context fails');check(await checker.page.locator('[data-n-detail] tbody tr').count()===rows,'historical receipt retains every row');check(store.reads.at(-1).kind==='succession','optional current lookup actually failed after receipt validation');check(store.requests.get('checker:'+originalApproval.key).snapshot.status==='approved','original approved snapshot retained');store.failSuccession.delete('checker');await next(checker);
  await refresh(maker);await open(maker,parentId);const parentBefore=salarySerialized(store.current(parentId));await maker.page.getByRole('button',{name:'Corregir este lote',exact:true}).click();await maker.idle();check(await maker.$('fields').evaluate(element=>element.disabled),'correction freezes original period/type/destinations');await maker.$('correction-reason').fill('Corrección sintética revisada: importe de veinte a veinticinco pesos.');
  for(let ordinal=1;ordinal<=rows;ordinal++){if(ordinal>1&&(ordinal-1)%25===0)await maker.$('row-next').click();const input=maker.page.getByLabel('Importe fila '+ordinal,{exact:true});await input.fill('25,00');await input.press('Tab');}
  check((await maker.$('rows').textContent()).includes('Antes: 20,00'),'visible before/after on last page');check((await maker.$('count').textContent()).startsWith(rows+' filas'),'pagination never trims replacement');await maker.$('review').click();await maker.idle();await maker.$('confirm').check();const beforeReplacementWrites=store.writes.length;store.lose();await maker.$('send').click();await maker.idle();check(await maker.$('recover').isVisible(),'lost V3 prepare freezes original body/key');const replacementWrite=clone(store.writes.at(-1));check(replacementWrite.body.version===OWN_NOVELTY_SUCCESSION_COMMAND&&replacementWrite.body.rows.length===rows&&replacementWrite.body.rows.every(row=>row.amountCents==='2500'),'all61 corrected amounts survive actual handler');await maker.$('recover').click();await maker.idle();check(store.writes.length===beforeReplacementWrites+1,'V3 recovery issues no duplicate write');check(store.reads.some(r=>r.name==='maker'&&r.kind==='attempt'&&r.key===replacementWrite.key),'V3 recovery uses exact original key');check(same(store.requests.get('maker:'+replacementWrite.key).body,replacementWrite.body),'original V3 body unchanged');
  const childId=[...store.events.keys()].at(-1);check(store.succession('maker',parentId).effective===true,'parent stays effective while successor pending');await next(maker);await open(maker,childId);await decide(maker,'submit');await next(maker);
  await refresh(checker);await open(checker,childId);await checker.page.locator('[data-n-decisions] [data-command="approve"]').click();await checker.idle();check(await checker.$('affected').isVisible(),'independent reviewer sees complete affected-state review');const beforeStale=store.writes.length;store.addPendingUse(parentId);await checker.$('confirm').check();await checker.$('send').click();await checker.idle();check(store.writes.length===beforeStale,'stale complete ACK triggers no POST');check((await checker.$('status').textContent()).includes('no se renovó tu confirmación'),'changed uses require explicit fresh review');check(await checker.$('recover').isHidden(),'stale review did not create pending attempt');
  await checker.page.locator('[data-n-decisions] [data-command="approve"]').click();await checker.idle();check((await checker.$('affected').textContent()).includes('Captura pendiente de resultado'),'fresh review includes new pending use');await checker.$('confirm').check();await checker.$('send').click();await checker.idle();check(store.current(childId).status==='approved','checker approves V3 through actual handler');check(store.succession('maker',parentId).effective===false,'old source becomes ineffective only after final approval');check(salarySerialized(store.current(parentId))===parentBefore,'parent approved snapshot remained unchanged');await next(checker);
  await refresh(maker);await open(maker,parentId);check((await maker.$('detail').textContent()).includes('Esta versión ya no se usa para cálculos nuevos'),'old approved detail clearly shows historical effectiveness');check(await maker.page.getByRole('button',{name:'Corregir este lote',exact:true}).count()===0,'no applicable correction offered from superseded version');await open(maker,childId);check(await maker.page.locator('[data-n-detail] tbody tr').count()===rows,'new detail includes all corrected rows');check((await maker.$('detail').textContent()).includes('Antes: 20,00')&&(await maker.$('detail').textContent()).includes('25,00'),'approved successor shows old and new values');
  const reader=await pageFor('reader');await refresh(reader);const readStart=server.httpCalls.length;for(const id of [parentId,childId]){await open(reader,id);check(await reader.page.locator('[data-n-detail] tbody tr').count()===rows,'nominal reader sees complete history');check((await reader.$('detail').textContent()).includes('vigencia para cálculos nuevos no fue consultada'),'read-only view does not claim current effectiveness');check(await reader.page.locator('[data-n-decisions] button').count()===0,'read-only view has no mutation action');}check(!server.httpCalls.slice(readStart).some(call=>call.name==='reader'&&call.url.includes('resource=succession')),'nominal reader performs no restricted GET');
  for(const p of [maker,checker,reader]){check(await p.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');check(await p.$('refresh').evaluate(element=>element.getBoundingClientRect().height>=44),'touch target remains accessible');}
  await maker.page.screenshot({path:output.replace(/\.json$/,`-${width}-successor.png`),fullPage:true});await reader.page.screenshot({path:output.replace(/\.json$/,`-${width}-reader.png`),fullPage:true});check(browserErrors.length===0,'no uncaught browser error');
  scenarioResults.push({width,checksPassed:checks,wholeBatchRows:rows,parentId,childId,apiWrites:store.writes.length,sourceQueriesSimulated:store.calls.length,realComponent:true,realHttpHandler:true,syntheticActors:true,syntheticStorage:true,realCommittedPostgres:false});
  for(const context of contexts)await context.close();await server.close();activeServer=null;
 }
 report={ok:true,viewports:[1366,390,320],scenarios:scenarioResults,browserErrors,realComponent:true,realHttpHandler:true,syntheticStorage:true,sqlExecuted:false,realCommittedPostgres:false,municipalWrites:false,municipalAcceptance:false,legacyRunnerModified:false};
}catch(error){report={ok:false,error:error.message,stack:error.stack?.split('\n').slice(0,5),scenarios:scenarioResults,browserErrors,sqlExecuted:false,syntheticStorage:true,municipalWrites:false};process.exitCode=1;}
finally{await browser?.close();await activeServer?.close();fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));}
