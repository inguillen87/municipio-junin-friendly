// Future canonical190 continuation. SOURCE ONLY until the native closure is admitted.
// No fixture, database, IAM grant, transport, browser fallback or foundation is created here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createOwnAnnulHandler} from '../../api/internal-own-payroll-annulment.js';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {verifiedOwnAnnulReviewIndex,verifiedOwnAnnulReviewReceipt} from '../../assets/own-payroll-annulment-review-model.js';
import {verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from '../../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_PREPARE} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_ANNUL_ACCESS} from '../../assets/own-payroll-annulment-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=value=>[...value].sort();
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const FOUR=4*1024*1024,FULL=32*1024*1024;

export async function verifyOwnAnnulmentV2BrowserOn190(context,fixture){
  return verifyFixedAnnulmentBrowserOn190(context,fixture,'complete855-three');
}
export async function verifyOwnAnnulment29BrowserOn190(context,fixture){
  return verifyFixedAnnulmentBrowserOn190(context,fixture,'selected29-two');
}
// The two public entries choose literal cases. No caller can supply a population,
// partition budget, output path, actor, transport or authority override.
async function verifyFixedAnnulmentBrowserOn190(context,fixture,scenario){
  assert.ok(scenario==='complete855-three'||scenario==='selected29-two');
  const selected29=scenario==='selected29-two',population=selected29?29:855,runCount=selected29?2:3,pageCount=selected29?2:35;
  const partitionLengths=selected29?[14,15]:[285,285,285];
  const registeredLabel='Anulación registrada: '+population+' legajos en '+runCount+' corridas';
  exact(fixture,selected29?['captures','index','partitionIds','receiptHistory','confirmations']:['captures','index','partitionIds','receiptHistory']);
  assert.equal(context.version,'own-annulment-v2-live190-context.v1');
  const {h,db,qa,maker,reviewer,period,operations,readSnapshot}=context;
  assert.equal(h.qa,qa);assert.equal(qa.operationalPairBaseline,'published107');
  assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(context.monthlyBusinessCovered,false);assert.equal(typeof readSnapshot,'function');
  assert.equal(typeof db.query,'function');assert.equal(typeof operations.annul,'function');
  assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
  assert.equal(maker.principal.tenant.membershipId,qa.actor.membershipId);
  assert.equal(reviewer.principal.tenant.membershipId,qa.checker.membershipId);
  const caps=reviewer.principal.tenant.effectiveCapabilities;
  assert.ok(Array.isArray(caps)&&OWN_ANNUL_ACCESS.every(cap=>caps.includes(cap)));
  assert.ok(!OWN_RUN_PREPARE.every(cap=>caps.includes(cap)),'M7_190_REVIEWER_MUST_NOT_GAIN_PREPARE');
  assert.ok(!caps.includes('payroll.calculation.prepare'));
  assert.equal(context.contracts.length,855);assert.equal(new Set(context.contracts).size,855);
  if(selected29){assert.equal(fixture.captures.length,2);assert.equal(fixture.partitionIds.length,2);assert.equal(fixture.confirmations.length,2);}
  else{assert.equal(fixture.captures.length,3);assert.equal(fixture.partitionIds.length,3);}
  assert.equal(fixture.receiptHistory.length,3);
  const index=await verifiedOwnAnnulReviewIndex(fixture.index),ids=fixture.partitionIds.flat();
  if(selected29){
    assert.equal(ids.length,29);assert.equal(new Set(ids).size,29);
    assert.deepEqual(fixture.partitionIds.map(part=>part.length),[14,15]);
    assert.deepEqual(fixture.partitionIds,[context.contracts.slice(0,14),context.contracts.slice(14,29)]);
    assert.ok(ids.every(id=>context.contracts.includes(id)));
  }else{
    assert.equal(ids.length,855);assert.equal(new Set(ids).size,855);
    assert.deepEqual(sorted(ids),sorted(context.contracts));
  }
  assert.equal(context.firstSaved.input.employees.length,855);
  assert.deepEqual(sorted(context.firstSaved.input.employees.map(employee=>employee.contractId)),sorted(context.contracts));
  const selectedIds=new Set(ids),expectedNumbers=context.firstSaved.input.employees.filter(employee=>selectedIds.has(employee.contractId)).map(employee=>employee.employeeNumber);
  if(selected29)assert.equal(new Set(expectedNumbers).size,29);else assert.equal(new Set(expectedNumbers).size,855);
  assert.ok(expectedNumbers.every(value=>typeof value==='string'));
  assert.equal(index.period,period);assert.equal(index.liquidationType,'monthly');
  for(let n=0;n<runCount;n++){
    const capture=fixture.captures[n],reference=index.index.find(item=>item.id===capture.id);
    assert.ok(reference);assert.equal(capture.employeeCount,855);assert.equal(capture.conceptRowCount,17100);
    if(selected29)assert.equal(fixture.partitionIds[n].length,partitionLengths[n]);else assert.equal(fixture.partitionIds[n].length,285);
    assert.deepEqual(reference.confirmedContractIds,sorted(fixture.partitionIds[n]));
    for(const field of ['bodySha256','payloadSha256','inputSha256','resultSha256'])assert.equal(reference[field],capture[field]);
    if(selected29){
      const confirmation=await verifiedOwnLiquidationReceipt(fixture.confirmations[n]);
      assert.equal(confirmation.runId,capture.id);assert.equal(confirmation.resultSha256,capture.resultSha256);
      assert.equal(confirmation.body.command,'confirm');assert.equal(confirmation.body.reviewConfirmed,true);
      assert.deepEqual(confirmation.body.selection,{kind:'contracts',values:sorted(fixture.partitionIds[n])});
      assert.deepEqual(sorted(confirmation.affected.map(row=>row.contractId)),sorted(fixture.partitionIds[n]));
    }
  }
  if(selected29){
    assert.equal(index.index.length,10);assert.equal(index.index.reduce((sum,item)=>sum+item.confirmedContractIds.length,0),29);
    assert.equal(new Set(fixture.captures.map(capture=>capture.body.liquidationDate)).size,2);
    assert.deepEqual(fixture.captures.map(capture=>capture.body.liquidationDate),['2026-10-15','2026-10-20']);
  }else assert.equal(index.index.reduce((sum,item)=>sum+item.confirmedContractIds.length,0),855);
  const sourceBookend=[];
  for(const file of ['own-payroll-annulment-panel.js','own-payroll-annulment-review-model.js','own-payroll-run-panel.js',
    'own-payroll-annulment-preparation-model.js','own-payroll-annulment-preparation-link.js',
    'own-payroll-annulment-model.js','own-payroll-response.js','own-payroll-run-workspace-model.js',
    'own-payroll-liquidation-model.js','own-payroll-exact.js','native-salary-catalog-model.js','own-payroll-run-model.js']){
    const relative='assets/'+file,source=fs.readFileSync(path.join(root,relative));
    assert.deepEqual(fs.readFileSync(path.join(root,'public',relative)),source,'M7_190_BUILT_SOURCE_MISMATCH:'+relative);
    sourceBookend.push({path:relative,sha256:createHash('sha256').update(source).digest('hex')});
  }
  const baseline=readSnapshot(),checks=[],posts=[],httpEvidence=[],external=[],pageErrors=[],serverErrors=[];
  let server,browser,browserContext,page,loss=null,clientWithdrawn=false,receipt=null;
  const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
  const wireDb={query:async(statement,values)=>{
    const command=/^SELECT public\.own_annul_command(?:_full)?_v2\(/.test(statement);
    if(!command)return db.query(statement,values);
    const entry={key:values[2],body:JSON.parse(values[1]),reachedSql:false,replayed:null};posts.push(entry);
    if(loss==='before'){loss=null;throw Error('QA_UNSENT_BEFORE_NATIVE_SQL');}
    entry.reachedSql=true;const result=await db.query(statement,values);
    entry.replayed=result?.[0]?.result?.replayed;
    if(loss==='after'){loss=null;throw Error('QA_ACK_WITHHELD_AFTER_NATIVE_COMMIT');}
    return result;
  }};
  let calculationPosts=0;
  const instrumentedDb={query:async(statement,values)=>{
    if(/^SELECT public\.own_run_capture_v1\(/.test(statement))calculationPosts++;
    return wireDb.query(statement,values);
  }};
  const env={},deps={env,requireAccess:async()=>({mode:'managed',principal:reviewer.principal}),
    sessionFor:()=>reviewer.session,getSql:async()=>instrumentedDb};
  // Auth is explicitly a fixture reflecting canonical IAM. Each business RPC still
  // uses the original native db adapter, runtime role and real session context.
  const handlers=new Map([
    ['/api/internal-own-payroll-annulment',createOwnAnnulHandler(deps)],
    ['/api/internal-own-payroll-liquidation',createOwnLiquidationHandler(deps)],
    ['/api/internal-own-payroll-run',createOwnRunHandler(deps)]
  ]);
  const output=path.resolve(h.destination,selected29?'annulment29-v2-browser':'annulment-v2-browser');
  assert.ok(output.startsWith(path.resolve(h.destination)+path.sep));
  fs.mkdirSync(output,{recursive:false});
  let failure,result;
  try{
    server=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://qa.invalid');res.setHeader('Cache-Control','no-store');
      const json=(status,value)=>{if(res.headersSent){res.destroy();return;}res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
      if(url.pathname==='/api/internal-auth'){
        json(200,{ok:true,authenticated:true,sessionVersion:2,
          user:{id:qa.checker.actorSessionId,email:qa.checker.actorEmail},
          access:{context:'tenant',tenant:{id:qa.checker.tenantId,roleKey:'QA_CANONICAL190_REVIEWER'},
            tenantCapabilities:clientWithdrawn?caps.filter(cap=>cap!=='payroll.calculation.approve'):caps,
            platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()});return;
      }
      const handler=handlers.get(url.pathname);
      if(handler){
        req.query=Object.fromEntries(url.searchParams);res.status=value=>{res.statusCode=value;return res;};
        res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
        Promise.resolve(handler(req,res)).catch(error=>{serverErrors.push(error.message);json(500,{ok:false,error:'QA_HANDLER_REJECTED'});});return;
      }
      if(url.pathname.startsWith('/api/')){json(503,{ok:false,error:'Unrelated QA service is outside this continuation'});return;}
      const publicRoot=path.join(root,'public');let file;
      try{file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400).end();return;}
      const allowed=file===path.join(publicRoot,'nomina-control.html')||
        file.startsWith(path.join(publicRoot,'assets')+path.sep)&&/\.(js|css|png|svg|webp|woff2?)$/.test(file);
      if(req.method!=='GET'||!allowed||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
      const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
      res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(file));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
    const executable=process.env.OWN_LIQ_QA_HEADLESS_EXECUTABLE;
    if(executable)assert.ok(path.isAbsolute(executable)&&fs.existsSync(executable)&&/^chrome-headless-shell(?:\.exe)?$/.test(path.basename(executable)));
    browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
    browserContext=await browser.newContext({viewport:{width:1366,height:1100},serviceWorkers:'block'});
    await browserContext.route('**/*',route=>{
      if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort('blockedbyclient');}
      return route.continue();
    });
    page=await browserContext.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
    // Page responses only: independent context.request oracle reads below are
    // not evidence that the product itself reloaded its authenticated sources.
    const outcomePageReads=[],outcomePagePosts=[];
    // Observe the product's actual HTTP requests, including a POST rejected
    // before it reaches SQL. context.request oracle traffic is not Page traffic.
    page.on('request',request=>{
      const url=new URL(request.url());
      if(request.method()==='POST'&&url.origin===origin&&url.pathname.startsWith('/api/'))outcomePagePosts.push({path:url.pathname});
    });
    page.on('response',response=>{
      const request=response.request(),url=new URL(response.url());
      if(request.method()!=='GET'||url.origin!==origin||!['/api/internal-own-payroll-annulment','/api/internal-own-payroll-liquidation'].includes(url.pathname))return;
      outcomePageReads.push({path:url.pathname,resource:url.searchParams.get('resource'),key:url.searchParams.get('key'),id:url.searchParams.get('id'),status:response.status()});
    });
    const $=key=>page.locator('[data-annul-'+key+']');
    const settled=()=>page.waitForFunction(()=>document.querySelector('[data-annul-status]')?.closest('.own-liquidation')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
    const query=async requested=>{await $('period').fill(requested);await $('type').selectOption('monthly');await $('load').click();await settled();};
    const choose=async()=>{await $('kind').selectOption('all');await $('reason').fill(selected29?'Revisión sintética de29 seleccionados en dos fechas canonical190':'Revisión sintética completa del padrón propio canonical190');await $('confirm').check();};
    const request=async(relative,options={})=>{
      const response=await browserContext.request.fetch(origin+relative,{...options,headers:{Accept:OWN_RUN_FULL_JSON,Origin:origin,...options.headers}});
      const body=await response.body();assert.ok(body.length<=FULL);
      httpEvidence.push({path:new URL(relative,origin).pathname,method:options.method??'GET',status:response.status(),bytes:body.length});
      return{response,body:JSON.parse(body.toString('utf8'))};
    };
    await page.goto(origin+'/nomina-control.html#anulacion');await $('load').waitFor({state:'visible'});await settled();
    check(posts.length===0&&calculationPosts===0,'opening the built product performs no business mutation');
    const nativeIndex=await request('/api/internal-own-payroll-annulment?resource=review&period='+period+'&liquidationType=monthly');
    assert.equal(nativeIndex.response.status(),200);assert.deepEqual(nativeIndex.body.data,index);
    check(bytes(nativeIndex.body)<=FOUR,'actual HTTP index transports every historical run within the ordinary bound');
    await query(period);await $('detail').waitFor({state:'visible'});await choose();
    if(selected29)check((await $('scope').innerText()).includes('29 legajos · 2 corridas'),'exact14+15 selection from855 is visible across two genuine dates');
    else check((await $('scope').innerText()).includes('855 legajos · 3 corridas'),'complete 855-contract three-run review is visible');
    assert.ok((await $('coverage').innerText()).includes(index.index.length+' corridas registradas'));
    assert.equal(await $('rows').locator('tr').count(),25);
    const visibleNumbers=()=>$('rows').locator('tr').evaluateAll(rows=>rows.map(row=>row.cells[0]?.textContent.trim()));
    const reviewedNumbers=await visibleNumbers();
    for(let n=1;n<pageCount;n++){await $('next').click();if(selected29)assert.equal(await $('rows').locator('tr').count(),4);reviewedNumbers.push(...await visibleNumbers());}
    assert.deepEqual(sorted(reviewedNumbers),sorted(expectedNumbers));
    if(selected29)check(reviewedNumbers.length===29&&new Set(reviewedNumbers).size===29&&await $('next').isDisabled(),'both25+4 pages expose all29 selected employee numbers exactly once');
    else check(reviewedNumbers.length===855&&new Set(reviewedNumbers).size===855&&await $('next').isDisabled(),'all 35 pages expose every canonical190 employee number exactly once');
    const totals=await $('totals').innerText();
    await $('search').fill('no-synthetic-contract-match');
    check((await $('range').innerText()).includes('0 legajos de la búsqueda · '+population+' afectados')&&await $('totals').innerText()===totals,'search changes only the view and preserves all affected contracts and exact totals');
    await $('search').fill('');
    for(const width of [1366,390,320]){
      await page.setViewportSize({width,height:1100});await $('send').scrollIntoViewIfNeeded();
      const box=await $('send').boundingBox();
      check(box?.height>=44&&box.x>=0&&box.x+box.width<=width,'explicit full-scope action remains accessible at '+width);
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no whole-page overflow at '+width);
      await page.screenshot({path:path.join(output,'review-'+width+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:1366,height:1100});
    loss='before';await $('send').click();await settled();
    assert.equal(posts.length,1);assert.equal(posts[0].reachedSql,false);const frozen=structuredClone(posts[0]);
    check(await $('recover').isVisible(),'uncertain pre-SQL send keeps the original attempt recoverable');
    assert.deepEqual(readSnapshot(),baseline);
    const missing=await request('/api/internal-own-payroll-annulment?resource=attempt&key='+frozen.key);
    check(missing.response.status()===404&&missing.body.ok===false,'independent actual GET proves the original unsent key absent');
    clientWithdrawn=true;
    await page.evaluate(next=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:next}})),caps.filter(cap=>cap!=='payroll.calculation.approve'));
    check(await $('detail').isHidden()&&await $('rows').locator('tr').count()===0&&await $('send').isDisabled(),'client authority withdrawal removes nominal rows and disables frozen retries');
    clientWithdrawn=false;await $('load').click();await settled();
    assert.ok((await $('scope').innerText()).includes(population+' legajos'));
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    check(await $('detail').isHidden()&&await $('rows').locator('tr').count()===0,'hiding the real product clears every nominal row');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await $('load').click();await settled();await $('recover').click();await settled();
    check(await $('revise').isVisible(),'fresh actual recovery proves absence before permitting another decision');
    await $('reason').evaluate(element=>{element.value='A DOM edit must not rewrite the frozen attempt';element.dispatchEvent(new Event('input',{bubbles:true}));});
    loss='after';await $('send').click();await settled();
    assert.equal(posts.length,2);assert.deepEqual(posts[1].body,frozen.body);assert.equal(posts[1].key,frozen.key);
    check(posts[1].reachedSql&&posts[1].replayed===false&&await $('recover').isVisible(),'lost acknowledgement occurs after one native commit with the original key and body');
    await $('recover').click();await settled();
    if(selected29)check((await $('status').innerText()).includes('Anulación registrada: 29 legajos en 2 corridas'),'actual GET restores the exact29/2 committed receipt in the real panel');
    else check((await $('status').innerText()).includes('Anulación registrada: 855 legajos en 3 corridas'),'actual GET restores the full committed receipt in the real panel');
    const recovered=await request('/api/internal-own-payroll-annulment?resource=attempt&key='+frozen.key);
    assert.equal(recovered.response.status(),200);receipt=await verifiedOwnAnnulReviewReceipt(recovered.body.data);
    assert.equal(receipt.version,'own-annul-receipt.v2');assert.equal(receipt.replayed,true);
    // Both shared profiles retain the recovered receipt before handing over its
    // source-only reference; this does not open Calcular for the reviewer.
    assert.equal(await $('preparation-link').inputValue(),origin+'/nomina?anulacion='+recovered.body.data.id+'#calculo');
    check(!/key|accessKey|actor|scopeVersion|consent/i.test(await $('preparation-link').inputValue())&&await $('calculate').isDisabled(),'the reviewer can hand over a source-only link but never opens Calcular without prepare');
    if(selected29){assert.equal(receipt.affected.length,29);assert.equal(receipt.receipts.length,2);}
    else{assert.equal(receipt.affected.length,855);assert.equal(receipt.receipts.length,3);}
    assert.deepEqual(sorted(receipt.affected.map(item=>item.contractId)),sorted(ids));
    assert.deepEqual(receipt.body,frozen.body);
    // The original fixture carries immutable hashes of each genuine capture.
    // Fetch and verify full authenticated details independently of the product
    // outcome helper; never derive expected amounts or versions from DOM rows.
    const outcomeSnapshot=readSnapshot(),outcomePosts=posts.length,outcomeCalculationPosts=calculationPosts,outcomeHttpPosts=outcomePagePosts.length;
    assert.equal(outcomeHttpPosts,2,'both original product HTTP sends were observed before outcome-only recovery');
    assert.equal(outcomePosts,2);assert.equal(outcomeCalculationPosts,0);
    const outcomeOracleRows=[],outcomePrecisions=[];
    const outcomeIndexResponse=await request('/api/internal-own-payroll-annulment?resource=review&period='+period+'&liquidationType=monthly');
    assert.equal(outcomeIndexResponse.response.status(),200);
    const outcomeIndex=await verifiedOwnAnnulReviewIndex(outcomeIndexResponse.body.data);
    assert.equal(outcomeIndex.scopeVersion,index.scopeVersion);
    assert.deepEqual(outcomeIndex.index.map(item=>item.id),index.index.map(item=>item.id));
    assert.ok(outcomeIndex.index.every(item=>item.confirmedContractIds.length===0));
    for(const original of fixture.captures){
      const response=await request('/api/internal-own-payroll-liquidation?resource=detail&id='+encodeURIComponent(original.id));
      assert.equal(response.response.status(),200);
      const detail=await verifiedOwnLiquidationDetail(response.body.data),capture=detail.capture,saved=capture.saved;
      const reference=outcomeIndex.index.find(item=>item.id===original.id);assert.ok(reference);
      assert.equal(detail.id,original.id);assert.equal(detail.scopeVersion,outcomeIndex.scopeVersion);assert.equal(detail.stateVersion,reference.stateVersion);
      assert.equal(capture.bodySha256,original.bodySha256);assert.equal(capture.payloadSha256,original.payloadSha256);
      assert.equal(saved.inputSha256,original.inputSha256);assert.equal(saved.resultSha256,original.resultSha256);
      assert.equal(capture.algorithmSha256,reference.algorithmSha256);assert.deepEqual(capture.body,original.body);
      assert.equal(saved.result.employeeCount,855);assert.equal(saved.result.rowCount,17100);
      assert.equal(saved.input.totalsPrecision,reference.totalsPrecision);outcomePrecisions.push(saved.input.totalsPrecision);
      const people=new Map(saved.input.employees.map(row=>[row.contractId,row]));
      const amounts=new Map(saved.result.employeeTotals.map(row=>[row.contractId,row]));
      const states=new Map(detail.employees.map(row=>[row.contractId,row]));
      const selectedAffected=receipt.affected.filter(row=>row.runId===original.id),partIndex=fixture.captures.findIndex(row=>row.id===original.id);
      assert.deepEqual(sorted(selectedAffected.map(row=>row.contractId)),sorted(fixture.partitionIds[partIndex]));
      for(const affected of selectedAffected){
        const person=people.get(affected.contractId),money=amounts.get(affected.contractId),state=states.get(affected.contractId);
        assert.ok(person&&money&&state);assert.equal(state.state,'annulled');
        assert.equal(affected.resultSha256,original.resultSha256);assert.equal(affected.liquidationDate,capture.body.liquidationDate);
        assert.equal(state.version,affected.version);assert.equal(state.liquidationVersion,affected.liquidationVersion);
        if(selected29){
          const confirmed=fixture.confirmations[partIndex].affected.find(row=>row.contractId===affected.contractId);assert.ok(confirmed);
          assert.equal(affected.liquidationVersion,confirmed.liquidationVersion);assert.equal(affected.version,confirmed.version+1);
        }
        outcomeOracleRows.push(Object.freeze({contractId:affected.contractId,employeeNumber:person.employeeNumber,departmentCode:person.departmentCode,
          date:'Fecha de liquidación: '+affected.liquidationDate.split('-').reverse().join('/'),
          gross:money.gross,deduction:money.deduction,net:money.net,
          state:'Anulada · decisión v'+affected.version+' · liquidación v'+affected.liquidationVersion}));
      }
    }
    outcomeOracleRows.sort((a,b)=>a.contractId<b.contractId?-1:a.contractId>b.contractId?1:0);Object.freeze(outcomeOracleRows);
    if(selected29){assert.equal(outcomeOracleRows.length,29);assert.equal(new Set(outcomeOracleRows.map(row=>row.contractId)).size,29);}
    else{assert.equal(outcomeOracleRows.length,855);assert.equal(new Set(outcomeOracleRows.map(row=>row.contractId)).size,855);}
    assert.deepEqual(sorted(outcomeOracleRows.map(row=>row.contractId)),sorted(ids));
    assert.deepEqual(sorted(outcomeOracleRows.map(row=>row.employeeNumber)),sorted(expectedNumbers));
    const outcomePrecision=Math.max(...outcomePrecisions);assert.ok(Number.isInteger(outcomePrecision)&&outcomePrecision>=0&&outcomePrecision<=8);
    // Independent exact decimal sum at the already declared precision. No new
    // rounding rule, Number conversion of amounts or business calculation.
    const atoms=value=>{
      assert.match(value,/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/);
      const [whole,fraction='']=value.replace(/^-/,'').split('.');assert.ok(fraction.length<=outcomePrecision);
      return(value.startsWith('-')?-1n:1n)*BigInt(whole+fraction.padEnd(outcomePrecision,'0'));
    };
    const decimal=value=>{const negative=value<0n,digits=(negative?-value:value).toString().padStart(outcomePrecision+1,'0');return(negative?'-':'')+(outcomePrecision?digits.slice(0,-outcomePrecision)+'.'+digits.slice(-outcomePrecision):digits);};
    const outcomeTotals=Object.fromEntries(['gross','deduction','net'].map(key=>[key,decimal(outcomeOracleRows.reduce((sum,row)=>sum+atoms(row[key]),0n))]));
    const moneyCell=text=>{
      assert.match(text,/^\$ -?(?:0|[1-9]\d{0,2})(?:\.\d{3})*(?:,\d{1,8})?$/);
      return text.slice(2).replaceAll('.','').replace(',','.');
    };
    const assertOutcomeTable=async label=>{
      assert.ok((await $('status').innerText()).includes(registeredLabel));
      assert.equal(await $('empty').isHidden(),true);assert.equal(await $('recover').isVisible(),true);
      assert.ok((await $('scope').innerText()).includes(population+' legajos anulados en '+runCount+' corridas'));
      assert.ok((await $('scope').innerText()).includes('Importes históricos conservados; esta anulación no describe el estado vigente.'));
      assert.equal(await $('confirm').isChecked(),true);assert.ok(await $('send').isDisabled());
      const displayedTotals=await $('totals').locator('dd').allTextContents();assert.equal(displayedTotals.length,3);
      assert.deepEqual(displayedTotals.map(value=>moneyCell(value.trim())),['gross','deduction','net'].map(key=>outcomeTotals[key]));
      const observed=[];
      for(let n=0;n<pageCount;n++){
        assert.equal((await $('page').innerText()).trim(),(n+1)+' / '+pageCount);
        const rows=await $('rows').locator('tr').evaluateAll(list=>list.map(row=>[...row.cells].map(cell=>cell.textContent.trim())));
        assert.equal(rows.length,n===pageCount-1?population-25*(pageCount-1):25);
        for(const cells of rows){assert.equal(cells.length,7);observed.push([cells[0],cells[1],cells[2],moneyCell(cells[3]),moneyCell(cells[4]),moneyCell(cells[5]),cells[6]]);}
        if(n<pageCount-1){assert.equal(await $('next').isDisabled(),false);await $('next').click();}
      }
      assert.equal(await $('next').isDisabled(),true);
      assert.deepEqual(observed,outcomeOracleRows.map(row=>[row.employeeNumber,row.departmentCode,row.date,row.gross,row.deduction,row.net,row.state]));
      if(selected29)assert.equal(new Set(observed.map(row=>row[0])).size,29);else assert.equal(new Set(observed.map(row=>row[0])).size,855);
      // Searching resets pagination; exact employee numbers may be substrings
      // of others, so derive the expected view from every selected oracle row.
      const term=outcomeOracleRows[0].employeeNumber;
      await $('search').fill(term);
      const matching=outcomeOracleRows.filter(row=>[row.employeeNumber,row.departmentCode].some(value=>value.toLocaleLowerCase('es-AR').includes(term.toLocaleLowerCase('es-AR'))));
      assert.ok(matching.length>0);assert.ok((await $('range').innerText()).includes(matching.length+' legajos de la búsqueda · '+population+' afectados'));
      assert.deepEqual(await $('totals').locator('dd').allTextContents(),displayedTotals);
      await $('search').fill('no-synthetic-outcome-match');
      assert.ok((await $('range').innerText()).includes('0 legajos de la búsqueda · '+population+' afectados'));
      assert.deepEqual(await $('totals').locator('dd').allTextContents(),displayedTotals);
      await $('search').fill('');assert.equal(await $('rows').locator('tr').count(),25);
      assert.deepEqual(await $('totals').locator('dd').allTextContents(),displayedTotals);
      assert.equal(outcomePagePosts.length,outcomeHttpPosts,'outcome reads must not send another municipal HTTP POST');
      assert.equal(posts.length,outcomePosts);assert.equal(calculationPosts,outcomeCalculationPosts);assert.deepEqual(readSnapshot(),outcomeSnapshot);
      check(true,label);
    };
    await assertOutcomeTable(selected29?'all29 historical outcome rows across25+4 bind genuine full capture hashes, exact amounts, both dates and real decision versions':'all855 historical outcome rows across35 pages bind original capture hashes, exact amounts, original dates and both decision versions');
    const rebuildOutcome=async(label,traceStart)=>{
      await $('load').click();await settled();await $('recover').click();await settled();
      const reads=outcomePageReads.slice(traceStart);
      const attempts=reads.filter(row=>row.path==='/api/internal-own-payroll-annulment'&&row.resource==='attempt');
      assert.ok(attempts.length>0);assert.ok(attempts.every(row=>row.status===200&&row.key===frozen.key));
      assert.ok(reads.filter(row=>row.path==='/api/internal-own-payroll-annulment'&&row.resource==='review'&&row.status===200).length>=2);
      for(const capture of fixture.captures)assert.ok(reads.some(row=>row.path==='/api/internal-own-payroll-liquidation'&&row.resource==='detail'&&row.id===capture.id&&row.status===200));
      assert.equal(outcomePagePosts.length,outcomeHttpPosts,'outcome reads must not send another municipal HTTP POST');
      assert.equal(posts.length,outcomePosts);assert.equal(calculationPosts,outcomeCalculationPosts);assert.deepEqual(readSnapshot(),outcomeSnapshot);
      assert.deepEqual(posts[1].body,frozen.body);assert.equal(posts[1].key,frozen.key);
      await assertOutcomeTable(label);
    };
    const hideReads=outcomePageReads.length;
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    check(await $('detail').isHidden()&&await $('rows').locator('tr').count()===0&&await $('confirm').isChecked()===false,'hiding a committed outcome clears all nominal rows and consent');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await rebuildOutcome(selected29?'actual same-key GET rebuilds all29 rows after hiding without another POST':'actual same-key GET and complete authenticated details rebuild all855 historical rows after page hiding without another POST',hideReads);
    const revokeReads=outcomePageReads.length;clientWithdrawn=true;
    await page.evaluate(next=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:next}})),caps.filter(cap=>cap!=='payroll.calculation.approve'));
    check(await $('detail').isHidden()&&await $('rows').locator('tr').count()===0&&await $('send').isDisabled()&&await $('confirm').isChecked()===false,'withdrawing client authority clears committed outcome rows and consent');
    clientWithdrawn=false;
    await rebuildOutcome(selected29?'restored original reviewer rebuilds the same committed29/2 outcome by GET only':'restored original reviewer rebuilds the same committed855/3 outcome by GET only after capability withdrawal',revokeReads);
    const historicalOutcome={version:'own-annulment208-historical-outcome-browser.v1',population,runs:runCount,pages:pageCount,authenticatedRebuilds:2,
      originalCaptureHashesVerified:true,allRowsCompared:true,exactAmountsCompared:true,decisionAndLiquidationVersionsCompared:true,
      pageReadCount:outcomePageReads.length,newAnnulmentPosts:posts.length-outcomePosts,newCalculationPosts:calculationPosts-outcomeCalculationPosts,
      newBusinessHttpPosts:outcomePagePosts.length-outcomeHttpPosts,
      sourceReceiptKeyJsonSha256:sha(frozen.key),separate29ScenarioProven:selected29,receiptToPreparationBrowserProven:false};
    const beforeReplay=readSnapshot(),replayed=await request('/api/internal-own-payroll-annulment',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':frozen.key},data:JSON.stringify({operation:'command-v2',payload:frozen.body})});
    assert.equal(replayed.response.status(),200);assert.deepEqual(replayed.body.data,receipt);
    assert.equal(replayed.response.headers()['idempotency-replayed'],'true');assert.deepEqual(readSnapshot(),beforeReplay);
    check(posts.length===3&&posts[2].replayed===true,'same-key HTTP replay preserves the whole native snapshot without another event');
    for(const prior of fixture.receiptHistory){
      const recoveredPrior=await request('/api/internal-own-payroll-annulment?resource=attempt&key='+prior.key);
      assert.equal(recoveredPrior.response.status(),200);
      assert.deepEqual(await verifiedOwnAnnulReviewReceipt(recoveredPrior.body.data),{...prior,replayed:true});
    }
    check(true,'all original v1 and v2 receipts remain independently recoverable over HTTP');
    assert.equal(calculationPosts,0);assert.ok(await $('calculate').isDisabled());
    check(true,'reviewer never gains prepare authority and annulment never starts a calculation');
    // An unavailable cross-role handoff is reported as a missing feature, never
    // fixed by granting prepare to the reviewer or approve to the maker.
    const after=await request('/api/internal-own-payroll-annulment?resource=review&period='+period+'&liquidationType=monthly');
    assert.equal(after.response.status(),200);
    const afterIndex=await verifiedOwnAnnulReviewIndex(after.body.data);
    assert.equal(afterIndex.index.length,index.index.length);
    assert.ok(afterIndex.index.every(item=>item.confirmedContractIds.length===0));
    assert.deepEqual(afterIndex.index.map(item=>item.id),index.index.map(item=>item.id));
    check(true,'complete historical run index survives and no confirmed contract remains');
    assert.deepEqual(pageErrors,[]);assert.deepEqual(serverErrors,[]);assert.deepEqual(external,[]);
    result={version:selected29?'own-annulment29-canonical190-native-browser.v1':'own-annulment-v2-canonical190-native-browser.v1',passed:true,sourceCommit:h.sourceCommit,
      major:h.major,population,conceptRowsPerCapture:17100,activeRuns:runCount,historicalRuns:index.index.length,
      checks,httpEvidence,sourceBookend,posts:posts.map(item=>({keyJsonSha256:sha(item.key),bodyJsonSha256:sha(item.body),reachedSql:item.reachedSql,replayed:item.replayed})),
      reportFingerprintAlgorithm:'SHA256 of UTF8 JSON.stringify; distinct from canonical DTO and SQL digests',
      receiptJsonSha256:sha(receipt),afterSnapshotJsonSha256:sha(readSnapshot()),actualSql:true,actualHttp:true,
      ...(selected29?{rosterPopulation:855,receiptKey:receipt.key,selected29AnnulmentBrowserProven:true}:{}),
      historicalOutcome,
      fullAnnulmentBrowserProven:!selected29,fullCapacityBrowserProven:false,receiptToPreparationBrowserProven:false,
      pending:['cross-role receipt-to-preparation handoff','monthly 855-contract business cases'],
      authenticationFixture:true,completeAuthenticationHandler:false,
      sourceMode:'public_build_with_twelve_critical_modules_byte_checked',fullBuildValidation:false,
      clientCapabilityWithdrawal:true,sqlAuthorityRevocationInThisBrowser:false,
      calculationPosts,monthlyBusinessCovered:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
  }catch(error){
    failure=error;
    if(page)await page.screenshot({path:path.join(output,'failed.png'),fullPage:true}).catch(()=>{});
    fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,sourceCommit:h.sourceCommit,major:h.major,message:error.message,checks,posts:posts.map(item=>({keySha256:sha(item.key),reachedSql:item.reachedSql,replayed:item.replayed})),pageErrors,serverErrors,external,actualHttpStarted:!!server,synthetic:true},null,2)+'\n',{flag:'wx'});
  }finally{
    const cleanupErrors=[];
    for(const close of [()=>browserContext?.close(),()=>browser?.close(),async()=>{
      if(server){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    }]){try{await close();}catch(error){cleanupErrors.push(error);}}
    if(cleanupErrors.length){
      fs.writeFileSync(path.join(output,'cleanup-failure.json'),JSON.stringify({passed:false,messages:cleanupErrors.map(error=>error.message)},null,2)+'\n',{flag:'wx'});
      failure=new AggregateError([...(failure?[failure]:[]),...cleanupErrors],'M7_190_BROWSER_OR_SERVER_CLEANUP_FAILED');
    }
  }
  if(failure)throw failure;
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return result;
}
