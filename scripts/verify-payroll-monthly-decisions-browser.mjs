// Real workbench and API handler; private SQL business responses are synthetic.
// POSTs are intercepted locally even in published mode. No municipal writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {batch as historical,bootstrap as baseBootstrap,id} from '../tests/fixtures/novelty-saved-review-synthetic.js';
import {createInternalPayrollNoveltiesHandler} from '../api/internal-payroll-novelties.js';
import {transitionPayrollNoveltyV2 as executeMonthlyTransition} from '../lib/internal-payroll-novelty.js';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';

const live=process.argv.includes('--published'),origin=live?'https://municontrol.com':'https://municontrol.test';
const root=path.resolve('public'),out='verification/monthly-decisions-'+(live?'published':'local');fs.mkdirSync(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),build=publishedBuildVerification({origin,root});
const assets=['novedades-nomina.html','assets/payroll-novelty-workbench.js','assets/payroll-native-monthly-model.js',
  'assets/payroll-monthly-decisions.js','assets/payroll-monthly-decisions-model.js','assets/payroll-monthly-decisions.css'];
const expected=new Map(assets.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
if(live){for(const[file,hash]of expected){const res=await build.fetchFile(file);assert.equal(res.status,200);assert.equal(sha(Buffer.from(await res.arrayBuffer())),hash,file);}
  for(const method of ['GET','POST']){const res=await fetch(origin+'/api/internal-payroll-novelties?version=2'+(method==='GET'?'&resource=bootstrap':''),{method,redirect:'error',signal:AbortSignal.timeout(15000),
    ...(method==='POST'?{headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({command:'approve',payload:{}})}:{})});assert.equal(res.status,401);}}
let actor='maker',nominal=true,approve=true,prepare=true,member=3,stored=new Map(),receipts=new Map(),posts=[],errors=[],checks=[];
let failAck=false,badAck=false,driftAfterFirst=false,hold=false,release=null,lateRead=false,releaseRead=null;
const caps=()=>['payroll.novelty.read',...(nominal?['payroll.novelty.nominal.read']:[]),...(prepare&&actor==='maker'?['payroll.novelty.prepare']:[]),...(approve&&actor==='checker'?['payroll.novelty.approve']:[])];
function read(b){const value=structuredClone(b);value.canExport=false;
  value.allowedCommands=value.status==='draft'&&actor==='maker'?['submit','cancel']:value.status==='submitted'&&actor==='checker'&&approve?['approve','reject']:[];
  if(value.contractVersion.endsWith('v2'))value.rows[0].identityCurrent=true;
  if(!nominal){value.rows=[];value.allowedCommands=[];}return value;}
function bootstrap(){const b=baseBootstrap();b.principal.capabilities=caps();b.principal.membershipId=id(member);b.principal.email=actor+'@example.invalid';b.batches=[...stored.values()].map(read);return b;}
function seed(count=26,rows=60,status='draft'){
  stored=new Map();receipts=new Map();posts=[];actor=status==='submitted'?'checker':'maker';member=actor==='maker'?3:5;nominal=true;approve=true;prepare=true;
  failAck=false;badAck=false;driftAfterFirst=false;hold=false;release=null;lateRead=false;releaseRead=null;
  for(let i=0;i<count;i++){const b=historical(i%2?1:rows);b.id=id(1000+i);b.status=status;b.version=status==='submitted'?2:1;
    b.createdAt='2026-09-30T12:00:00.123456Z';b.updatedAt=b.createdAt;b.submittedAt=status==='submitted'?b.createdAt:null;b.decidedAt=null;
    if(i%2){b.contractVersion='payroll-novelty-batch.v2';b.sourceMode='individual';const r=b.rows[0];r.quantityDecimal='100.000001';r.amountCents=null;
      r.subject={contractId:r.employmentContractId,legajo:r.legajo,employeeName:'Alta propia sintética QA '+i,identityToken:'a'.repeat(64),sourceCutoff:null,
        origin:'MUNICONTROL',registrationId:id(9000+i),registeredAt:'2026-09-22T12:30:00.123456Z'};
    }else {b.rows[0].quantityDecimal='1';b.rows[0].amountCents=null;if(rows>1)b.rows[1].amountCents='0';if(rows>2)b.rows[2].amountCents='9223372036854775807';
      b.rows.at(-1).observation='Última fila sintética <img src=x onerror="window.__injected=true">';}
    stored.set(b.id,b);
  }
}
const handler=createInternalPayrollNoveltiesHandler({env:{NODE_ENV:'test',INTERNAL_APP_ORIGIN:origin,INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:'a'.repeat(40)},
  requireCompatibleInternalAccess:async()=>({mode:'managed',session:{id:id(7),email:actor+'@example.invalid',version:1,releaseSha:'a'.repeat(40)},
    principal:{user:{email:actor+'@example.invalid'},tenant:{id:id(2),membershipId:id(member),source:'membership',certifiedReleaseSha:'a'.repeat(40)}}}),
  getInternalSql:async()=>({query(){throw Error('No real SQL is allowed in this browser harness');}}),
  getPayrollNoveltyBootstrapV2:async()=>bootstrap(),readPayrollNoveltyV2:async(_s,_p,_session,batchId)=>{
    const value=read(stored.get(batchId));if(lateRead){lateRead=false;await new Promise(resolve=>{releaseRead=resolve;});}return {data:value};},
  transitionPayrollNoveltyV2:async(_s,principal,session,command,payload,key)=>{
    const adapt=response=>executeMonthlyTransition({query:async()=>[{result:response}]},principal,session,command,payload,key);
    assert.ok(nominal);assert.ok(caps().includes(['approve','reject'].includes(command)?'payroll.novelty.approve':'payroll.novelty.prepare'));
    const body={command,payload},scope=id(member);posts.push({key,body:structuredClone(body),scope});
    if(receipts.has(key)){const old=receipts.get(key);assert.deepEqual(body,old.body);assert.equal(scope,old.scope);
      const response={...structuredClone(old.response),replayed:true};if(response.data.contractVersion.endsWith('v1')){
        const current=stored.get(payload.batchId);response.data.submittedAt=current.submittedAt;response.data.decidedAt=current.decidedAt;}
      return adapt(response);}
    const b=stored.get(payload.batchId);assert.ok(read(b).allowedCommands.includes(command));assert.equal(payload.expectedVersion,b.version);
    b.status={submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'}[command];b.version++;b.exportable=command==='approve';
    b.updatedAt=`2026-10-01T12:00:${String(receipts.size+1).padStart(2,'0')}.123456Z`;
    if(command==='submit')b.submittedAt=b.updatedAt;else b.decidedAt=b.updatedAt;
    const response={replayed:false,data:structuredClone(b)};receipts.set(key,{scope,body:structuredClone(body),response:structuredClone(response)});
    if(driftAfterFirst){driftAfterFirst=false;const last=[...stored.values()].at(-1);last.rows[0].observation='Cambio posterior con igual versión';}
    if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}return adapt(response);
  },
});
const browser=await chromium.launch({headless:true,...(process.env.MONTHLY_DECISIONS_BROWSER_CHANNEL?{channel:process.env.MONTHLY_DECISIONS_BROWSER_CHANNEL}:{})});let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
    if(u.pathname==='/api/internal-payroll-novelties'){
      const response={headers:{},code:200,setHeader(k,v){this.headers[k]=String(v);},status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}};
      await handler({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:{...req.headers(),origin,'sec-fetch-site':'same-origin'},
        ...(req.method()==='POST'?{body:req.postDataJSON()}:{})},response);
      if(req.method()==='POST'&&failAck){failAck=false;return route.fulfill({status:503,json:{ok:false,error:'Acuse perdido sintético'}});}
      if(req.method()==='POST'&&badAck){badAck=false;response.payload.data.rowCount++;}
      return route.fulfill({status:response.code,headers:response.headers,json:response.payload});
    }
    if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'QA sintética',email:actor+'@example.invalid',role:'ADMIN_INTERNO'},
      access:{tenantCapabilities:['payroll.read',...caps()],platformCapabilities:[],platformRoles:[]}}});
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,data:[]}});
    if(live)return route.continue();
    const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  const open=async()=>{await page.goto(live?build.url('novedades-nomina.html').href:origin+'/novedades-nomina.html');await page.locator('#monthlyDecisions:visible').waitFor();};
  const selectAll=async()=>{await page.locator('#monthlyDecisionSelectPage').click();while(await page.locator('#monthlyDecisionNext').isEnabled()){
    await page.locator('#monthlyDecisionNext').click();await page.locator('#monthlyDecisionSelectPage').click();}};
  const compare=async()=>{await page.locator('#monthlyDecisionCompare').click();await page.locator('#monthlyDecisionReview:visible').waitFor();assert.equal(posts.length,0);};
  const confirm=async()=>{await page.locator('#monthlyDecisionConfirm').check();await page.locator('#monthlyDecisionSend').click();};
  const settled=async()=>{await page.locator('#monthlyDecisionStop').waitFor({state:'hidden'});};
  seed();await open();assert.equal(await page.locator('#batchRows tr').count(),20);await selectAll();
  assert.match(await page.locator('#monthlyDecisionCount').innerText(),/26 lotes/);await page.locator('#monthlyDecisionSearch').fill('no-result-synthetic');assert.equal(await page.locator('#batchRows tr').count(),0);
  await compare();assert.equal(await page.locator('[data-monthly-decision-batch]').count(),26);assert.equal(await page.locator('[data-monthly-decision-row]').count(),793);
  assert.equal(await page.locator('#monthlyDecisionSend').isDisabled(),true);checks.push('26 batches across two pages and an empty filter review all 793 rows without a POST or automatic confirmation');
  const last=page.locator('[data-monthly-decision-batch]').nth(24);await last.locator('summary').first().click();await last.locator('[data-monthly-decision-row="60"] summary').click();
  assert.match(await last.innerText(),/Última fila sintética/);assert.equal(await page.evaluate(()=>window.__injected),undefined);
  assert.equal(await page.locator('#monthlyDecisionBatches dd').filter({hasText:'92233720368547758,07'}).count(),13);checks.push('all source fields, native origin, null and zero, exact extreme cents and escaped free text remain readable');
  await page.locator('#monthlyDecisionConfirm').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#monthlyDecisionSend').isEnabled(),true);
  await page.keyboard.press('Space');assert.equal(await page.locator('#monthlyDecisionSend').isDisabled(),true);checks.push('keyboard acknowledgement enables only the reviewed decision and can withdraw it');
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await page.locator('#monthlyDecisionSend').evaluate(n=>n.getBoundingClientRect().height>=44));
    assert.equal(await page.locator('#monthlyDecisions .primary:visible').count(),1);
    await page.locator('#monthlyDecisionTitle').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/controls-'+width+'-synthetic.png'});
    await page.locator('#monthlyDecisionSend').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/review-'+width+'-synthetic.png'});}
  checks.push('320px and 390px preserve touch controls, keyboard labels and one primary review action');
  await page.setViewportSize({width:1440,height:1000});await confirm();await settled();assert.equal(posts.length,26);assert.ok([...stored.values()].every(b=>b.status==='submitted'));assert.equal(receipts.size,26);
  assert.equal(await page.locator('[data-decision-result="Confirmado"]').count(),26);checks.push('submission uses existing v2 API handler per whole historical/native batch and reports every confirmed decision');
  seed(26,60,'submitted');await open();assert.equal(await page.locator('#entrySection').isVisible(),false);await selectAll();await compare();await confirm();await settled();
  assert.equal(posts.length,26);assert.ok([...stored.values()].every(b=>b.status==='approved'&&b.exportable));checks.push('independent actor with approve and without prepare approves all 26 batches for control export');
  seed(3,60,'submitted');await open();await selectAll();await page.locator('#monthlyDecisionAction').selectOption('reject');await page.locator('#monthlyDecisionReason').selectOption('unsupported_concept');await compare();await confirm();await settled();
  assert.equal(posts.length,3);assert.ok(posts.every(p=>p.body.command==='reject'&&p.body.payload.reasonCode==='unsupported_concept'));checks.push('rejection retains the selected original reason and an individual audit reference for every batch');
  seed(3);await open();await selectAll();await page.locator('#monthlyDecisionAction').selectOption('cancel');await compare();await confirm();await settled();assert.ok([...stored.values()].every(b=>b.status==='cancelled'));
  checks.push('preparer cancellation preserves each whole batch and never claims salary annulment');
  seed(3);await open();await selectAll();await compare();[...stored.values()].at(-1).rows[0].observation='Cambio concurrente con igual versión';await confirm();await settled();assert.equal(posts.length,0);
  assert.match(await page.locator('#monthlyDecisionMessage').innerText(),/No se envió ninguna/);checks.push('last-batch same-version content drift is detected in the full preflight before the first write');
  seed(3);await open();await selectAll();await compare();driftAfterFirst=true;await confirm();await settled();assert.equal(posts.length,2);
  assert.equal(await page.locator('[data-decision-result="Confirmado"]').count(),2);assert.equal(await page.locator('[data-decision-result="Sin enviar"]').count(),1);
  checks.push('concurrent late drift stops the remaining batch while reporting the two completed decisions truthfully');
  seed(3);await open();await selectAll();await compare();hold=true;const sending=confirm();await page.waitForFunction(()=>document.getElementById('monthlyDecisionStop').hidden===false);
  while(!release)await new Promise(r=>setTimeout(r,25));await page.locator('#monthlyDecisionStop').click();release();await sending;await settled();assert.equal(posts.length,1);assert.equal(receipts.size,1);
  checks.push('operator stop finishes only the in-flight decision and leaves the next two unsent');
  for(const bad of [false,true]){seed(3);await open();await selectAll();await compare();if(bad)badAck=true;else failAck=true;await confirm();await settled();
    assert.equal(posts.length,1);assert.equal(receipts.size,1);assert.equal(await page.locator('#monthlyDecisionRetry').isVisible(),true);assert.equal(await page.locator('#preflightButton').isDisabled(),true);
    assert.equal(await page.locator('#batchRows button').first().isDisabled(),true);await page.locator('#monthlyDecisionRetry').click();await settled();assert.equal(posts.length,2);
    assert.deepEqual(posts[0],posts[1]);assert.equal(receipts.size,1);assert.equal(await page.locator('[data-decision-result="Confirmado"]').count(),1);
    assert.equal(await page.locator('[data-decision-result="Sin enviar"]').count(),2);checks.push((bad?'malformed':'lost')+' ACK seals the exact attempt, prevents other writes and recovers one original receipt without resuming the selection');
  }
  seed(3);await open();await selectAll();await compare();failAck=true;await confirm();await settled();
  const advanced=[...stored.values()][0];advanced.status='approved';advanced.version=3;advanced.exportable=true;advanced.decidedAt='2026-10-02T14:00:00.000001Z';advanced.updatedAt=advanced.decidedAt;
  await page.locator('#monthlyDecisionRetry').click();await settled();assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);assert.equal(receipts.size,1);
  assert.equal(advanced.status,'approved');assert.equal(await page.locator('[data-decision-result="Confirmado"]').count(),1);
  checks.push('real v2 facade recovers the historical original event after later approval without borrowing its decision date or changing current state');
  seed(3);await open();await selectAll();await compare();nominal=false;await page.locator('#monthlyDecisionConfirm').check();await page.locator('#monthlyDecisionSend').click();await settled();
  assert.equal(posts.length,0);assert.equal(await page.locator('[data-monthly-decision-row]').count(),0);assert.equal(await page.locator('#monthlyDecisions').isVisible(),false);
  checks.push('bootstrap-only nominal revocation purges the whole reviewed selection before any write');
  seed(3,60,'submitted');await open();await selectAll();await compare();approve=false;await page.locator('#monthlyDecisionConfirm').check();await page.locator('#monthlyDecisionSend').click();await settled();
  assert.equal(posts.length,0);assert.equal(await page.locator('[data-monthly-decision-row]').count(),0);checks.push('approval-only revocation invalidates the review without silently substituting another command');
  seed(3);await open();await selectAll();await compare();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:['payroll.novelty.read']}})));
  assert.equal(await page.locator('[data-monthly-decision-row]').count(),0);assert.equal(await page.locator('#monthlyDecisions').isVisible(),false);checks.push('outer capability revocation removes every nominal field and selection');
  seed(3);await open();await selectAll();await compare();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('[data-monthly-decision-row]').count(),0);assert.equal(await page.locator('#monthlyDecisions').isVisible(),false);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});checks.push('page hiding clears review and selection; return never restarts decisions');
  seed(3);await open();await selectAll();lateRead=true;await page.locator('#monthlyDecisionCompare').click();while(!releaseRead)await new Promise(r=>setTimeout(r,25));
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));releaseRead();await page.locator('#monthlyDecisionCompare').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-monthly-decision-row]').count(),0);assert.equal(posts.length,0);checks.push('late detail response after revocation cannot repopulate nominal review');
  seed(3);await open();await selectAll();await compare();failAck=true;await confirm();await settled();member=8;
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));await page.locator('#refreshButton').click();
  await page.locator('#monthlyDecisions:visible').waitFor();assert.equal(await page.locator('#monthlyDecisionRetry').isDisabled(),true);assert.equal(posts.length,1);
  member=3;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));await page.locator('#refreshButton').click();await page.locator('#monthlyDecisionRetry:enabled').waitFor();
  await page.locator('#monthlyDecisionRetry').click();await settled();assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);assert.equal(receipts.size,1);checks.push('changed membership cannot recover or change the sealed attempt; original membership recovers only that command');
  seed(22,500);await open();await selectAll();await page.locator('#monthlyDecisionCompare').click();await page.locator('#monthlyDecisionMessage').filter({hasText:'supera las 5.000'}).waitFor();
  assert.equal(posts.length,0);assert.equal(await page.locator('#monthlyDecisionReview').isVisible(),false);checks.push('whole selection above 5000 review rows is rejected globally without truncation or splitting');
  seed(26);actor='checker';member=5;approve=false;await page.goto(live?build.url('novedades-nomina.html').href:origin+'/novedades-nomina.html');await page.locator('#batchTable:visible').waitFor();
  assert.equal(await page.locator('#monthlyDecisions').isVisible(),false);assert.equal(await page.locator('#batchRows tr').count(),26);assert.equal(await page.locator('#batchRows button').count(),26);
  assert.equal(posts.length,0);checks.push('read-only actor retains the complete original batch overview and individual detail without decision privileges');
  assert.deepEqual(errors,[]);const report={ok:true,checksPassed:checks.length,checks,publishedAssets:live,apiHandlerReal:true,transitionFacadeReal:true,sqlResponsesSynthetic:true,businessResponsesSynthetic:true,realMunicipalWrites:0,humanAcceptance:false,assets:Object.fromEntries(expected)};
  fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){fs.writeFileSync(out+'/failure.json',JSON.stringify({checks,errors,posts:posts.length,message:error.message},null,2));if(page)await page.screenshot({path:out+'/failure-synthetic.png'}).catch(()=>{});throw error;}
finally{await browser.close();}
