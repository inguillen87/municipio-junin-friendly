// Real locally built component/assets, synthetic transport and actual QA SQL result.
// This verifies the component, not a municipal session or the complete page.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readAdoptedOwnRunSqlFixture } from './verify-adopted-own-payroll-contract.mjs';
import { OWN_RUN_PREPARE } from '../assets/own-payroll-run-workspace-model.js';
import { catalog, TENANT, ID } from '../tests/fixtures/native-employee-synthetic.js';
const args={};for(const a of process.argv.slice(2)){const m=/^--(sql-log|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
const root=fs.realpathSync(new URL('../public/',import.meta.url)),output=path.resolve(args.output),outRoot=fs.realpathSync(new URL('../verification/',import.meta.url));
const outputRelative=path.relative(outRoot,fs.realpathSync(path.dirname(output)));
assert.ok(!outputRelative.startsWith('..')&&!path.isAbsolute(outputRelative)&&!fs.existsSync(output));fs.mkdirSync(output);
const {captures,report}=readAdoptedOwnRunSqlFixture(args['sql-log']),source=captures.adopted,person=source.payload.population.employees[0];
const shellStyles=fs.readFileSync(path.join(root,'nomina-control.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/);
assert.ok(shellStyles,'use the actual built payroll page typography and box sizing');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({acceptDownloads:true});let page,wire=null,lose=false,denied=false,sourceFailure=false,checks=0;const posts=[],errors=[];
const check=(v,message)=>{assert.ok(v,message);checks++;};
try {
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),json=(value,status=200)=>route.fulfill({status,json:value});
    if(url.pathname==='/qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintética de cálculo propio</title><style>'+shellStyles[1]+'</style><link rel="stylesheet" href="/assets/municontrol-enterprise.css"><main style="padding:12px;max-width:1200px;margin:auto"><section id="qaOwnRun"></section></main><script type="module">import {mountOwnPayrollRun} from "/assets/own-payroll-run-panel.js";mountOwnPayrollRun(document.getElementById("qaOwnRun"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"calculo"}}));</script></html>'});
    if(url.pathname==='/api/internal-auth')return json(denied?{ok:false,code:'FORBIDDEN'}:{ok:true,authenticated:true,sessionVersion:2,user:{id:ID,email:'qa@example.invalid'},access:{context:'tenant',tenant:{id:TENANT,roleKey:'QA'},tenantCapabilities:OWN_RUN_PREPARE},expiresAt:new Date(Date.now()+3600000).toISOString()},denied?403:200);
    if(url.pathname==='/api/internal-employment-catalog')return json({ok:true,data:{version:'native-employment-catalog.v1',scopeVersion:'a'.repeat(64),catalog:{items:catalog.items.map((r,i)=>({...r,key:'source-'+i,agreementCode:r.agreementCode??null})),version:'b'.repeat(64),origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:false,canReview:false},proposals:[],historyTruncated:false}});
    if(url.pathname==='/api/internal-data')return json({ok:true,version:'employee-picker.v1',data:[{contractId:person.contractId,legajo:person.employeeNumber,nombre:'Contrato adoptado sintético QA',sector:person.departmentCode,convenio:person.agreementCode,activo:true,statusSnapshotDate:null,recordOrigin:'MUNICONTROL'}],pagination:{page:1,limit:20,total:1,pages:1},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:null,sourceCutoffTo:null}});
    if(url.pathname==='/api/internal-own-payroll-run') {
      if(request.method()==='POST'){
        const body=request.postDataJSON(),key=request.headers()['idempotency-key'];posts.push({body,key});
        assert.equal(body.operation,'calculate');assert.deepEqual(body.payload,source.body);
        if(sourceFailure)return json({ok:false,code:'OWN_RUN_SOURCE_VIGENCY_INVALID'},422);
        wire={...structuredClone(source),key,replayed:false};
        if(lose){lose=false;return json({ok:false},503);}return json({ok:true,data:wire});
      }
      if(url.searchParams.get('resource')==='attempt'){
        assert.equal(url.searchParams.get('key'),wire?.key??posts.at(-1)?.key);
        return wire?json({ok:true,data:{...wire,replayed:true}}):json({ok:false,code:'OWN_RUN_NOT_FOUND'},404);
      }
      return json({ok:true,data:{version:'own-payroll-bootstrap.v1',scopeVersion:source.body.scopeVersion,programVersion:source.body.programVersion,canCalculate:true,runs:[],complete:true}});
    }
    if(url.pathname.startsWith('/api/'))throw Error('Unexpected private request: '+url.pathname);
    const file=path.resolve(root,'.'+url.pathname);assert.ok(!path.relative(root,file).startsWith('..'));
    if(fs.existsSync(file))return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream'});
    return route.fulfill({status:404,body:''});
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  const el=s=>page.locator('[data-own-'+s+']');
  const prepare=async()=>{
    await page.goto('https://municontrol.test/qa.html');await el('status').filter({hasText:'Elegí el período'}).waitFor();
    await el('period').fill(source.body.period);await el('type').selectOption('monthly');await el('kind').selectOption('contracts');
    await el('picker').click();const picker=page.locator('#ownRunPicker');await picker.locator('#ownRunPickerSearch').fill('Contrato');await picker.locator('[data-picker-form]').evaluate(form=>form.requestSubmit());
    await picker.locator('[data-picker-results] input').first().check();await picker.locator('[data-picker-apply]').click();
    check((await el('chips').textContent()).includes(person.employeeNumber),'opaque own contract remains visible');
    const remove=el('chips').locator('button'),box=await remove.boundingBox();
    check(box.width>=44&&box.height>=44,'selected contract has an accessible removal target');
    check(await remove.evaluate(button=>{const range=document.createRange();range.selectNodeContents(button);return range.getClientRects().length===1;}),'removal label stays on one readable line');
    check(await el('send').isDisabled(),'no calculation without complete acknowledgement');
    await el('confirm').check();await el('send').click();
  };
  await page.setViewportSize({width:1440,height:1000});await prepare();await el('result').waitFor({state:'visible'});
  check(posts.length===1,'only voluntary creation sends a synthetic POST');check((await el('totals').textContent()).includes('A/3501'),'stored result retains adopted identifier');
  await el('search').fill('no-coincide');check(await el('rows').locator('tr').count()===0,'filter applies to view');
  const downloadPending=page.waitForEvent('download');await el('download').click();const download=await downloadPending,file=path.join(output,'result-synthetic.csv');await download.saveAs(file);
  const csv=fs.readFileSync(file,'utf8');check(csv.split('\r\n').filter(Boolean).length===source.saved.result.rowCount+1,'download retains all result rows despite filtering');check(csv.includes("'A/3501"),'CSV protects the exact opaque identifier');
  await el('search').fill('');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow at '+width);
    check((await el('download').boundingBox()).height>=44,'accessible download target at '+width);
    await el('result').screenshot({path:path.join(output,'result-'+width+'-synthetic.png')});
  }
  denied=true;await el('download').click();await el('status').filter({hasText:'Tu cuenta no permite'}).waitFor();
  check(await el('result').isHidden(),'fresh permission refusal clears the nominal result');check(posts.length===1,'revocation cannot create another calculation');
  denied=false;lose=true;wire=null;await prepare();await el('status').filter({hasText:'No se confirmó'}).waitFor();
  const pending=structuredClone(posts.at(-1));check(await el('fields').evaluate(f=>f.disabled)&&await el('period').isDisabled(),'lost response locks original preparation');
  await el('recover').click();await el('result').waitFor({state:'visible'});
  check(posts.length===2&&JSON.stringify(posts.at(-1))===JSON.stringify(pending),'recovery preserves exact body/key without another POST');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  check(await el('result').isHidden(),'pagehide removes nominal result');check(posts.length===2,'pagehide creates no write');
  sourceFailure=true;wire=null;await prepare();await el('status').filter({hasText:'sin vigencia laboral verificada'}).waitFor();
  check(await el('result').isHidden(),'unverified dates cannot display a calculated result');
  check(await el('fields').evaluate(f=>f.disabled)&&await el('period').isDisabled(),'original failed attempt remains frozen until recovery');
  await el('recover').click();await el('revise').waitFor({state:'visible'});await el('revise').click();
  check(await el('fields').evaluate(f=>!f.disabled)&&await el('period').isEnabled(),'confirmed missing capture permits explicit preparation review');
  check(!(await el('confirm').isChecked()),'another preparation requires voluntary acknowledgement');
  check(posts.length===3,'date refusal, recovery and explicit review never issue an automatic new POST');
  check(errors.length===0,'no unhandled JS error');
  const result={ok:true,checksPassed:checks,sqlChecks:report.checksPassed,componentUi:true,completeProductPageVerified:false,
    syntheticTransport:true,resultFromActualPostgres:true,interceptedPosts:posts.length,municipalWrites:0,municipalSessionVerified:false};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({checks,errors,posts:posts.length,error:String(error.stack)},null,2));if(page)await page.screenshot({path:path.join(output,'failure-synthetic.png')});throw error;}
finally{await browser.close();}
