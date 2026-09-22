/** Real UI; all private APIs (GET and POST) are intercepted synthetic fixtures. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import readXlsxFile from 'read-excel-file/node';
import { publishedBuildVerification } from './lib/published-build-verification.mjs';

const published=process.argv.includes('--published');
const origin=published?'https://municipio-junin-friendly.vercel.app':'https://municontrol.test';
const root=path.resolve('public'),out=path.resolve('verification/native-monthly-'+(published?'published':'local'));
fs.mkdirSync(out,{recursive:true});
const build=publishedBuildVerification({origin,root});
const assets=['novedades-nomina.html','assets/payroll-novelty-workbench.js','assets/payroll-native-monthly-model.js',
  'assets/payroll-novelty-exporter.js','assets/payroll-novelty-xlsx-exporter.js'];
const hashes=build.expectedHashes(assets),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(published) for(const file of assets){const response=await build.fetchFile(file);assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),hashes[file],file);}
const ids={contract:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  grh:'00000000-0000-f000-0000-000000000009',registration:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  tenant:'00000000-0000-4000-8000-000000000001',binding:'00000000-0000-4000-8000-000000000002',
  maker:'00000000-0000-4000-8000-000000000003',checker:'00000000-0000-4000-8000-000000000004'};
const original={contractId:ids.contract,legajo:'571',employeeName:'Alta propia sintética QA',identityToken:'a'.repeat(64),
  sourceCutoff:null,origin:'MUNICONTROL',registrationId:ids.registration,registeredAt:'2026-09-22T12:30:00.123456Z'};
let actor='maker',nominal=true,prepare=true,deny=false,current=true,failPrepare=false,failTransition=false,rejectIdentity=false,
  currentSubject=structuredClone(original),consultedSubject=null,holdEmployee=false,releaseEmployee=null,number=0;
const batches=new Map(),receipts=new Map(),requests=[],posts=[],errors=[],checks=[];
const clone=value=>structuredClone(value);
function capabilities(){return ['payroll.novelty.read',...(nominal?['payroll.novelty.nominal.read']:[]),
  ...(prepare&&actor==='maker'?['payroll.novelty.prepare']:[]),...(actor==='checker'?['payroll.novelty.approve']:[]),'payroll.novelty.export'];}
function readBatch(stored){
  const b=clone(stored);if(b.contractVersion==='payroll-novelty-batch.v2')b.rows[0].identityCurrent=current;
  b.allowedCommands=b.status==='draft'&&actor==='maker'?(current?['submit','cancel']:['cancel']):
    b.status==='submitted'&&actor==='checker'?(current?['approve','reject']:['reject']):[];
  b.canExport=b.status==='approved'&&current&&nominal;return b;
}
function bootstrap(){return {ok:true,principal:{email:actor+'@example.invalid',membershipId:ids[actor],tenantId:ids.tenant,
  certifiedBindingId:ids.binding,capabilities:capabilities()},feature:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only'},
  limits:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only',grhMutation:false,payrollCalculated:false,payrollPosted:false,
    maxRows:500,sourceModes:['individual','bulk'],payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other'],
    native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']}},batches:[...batches.values()].map(readBatch)};}
function write(body,key){
  const previous=receipts.get(key);
  if(previous){assert.deepEqual(body,previous.body,'Idempotent retry changed the original body');return clone(previous.response);}
  let batch;
  if(body.command==='prepare'){
    assert.equal(actor,'maker');assert.equal(body.payload.sourceMode,'individual');assert.equal(body.payload.payrollType,'monthly');
    assert.equal(body.payload.rows.length,1);const input=body.payload.rows[0];
    const native=Boolean(input.contractId);
    if(native){assert.equal(input.contractId,consultedSubject.contractId);assert.equal(input.identityToken,consultedSubject.identityToken);}
    else{assert.equal(consultedSubject.contractId,ids.grh);assert.equal(input.identityToken,undefined);}
    assert.equal(input.legajo,consultedSubject.legajo);assert.equal(current,true);
    const {contractId,identityToken,...row}=input;
    const id=`aaaaaaaa-aaaa-4aaa-8aaa-${String(++number).padStart(12,'0')}`;
    batch={id,contractVersion:native?'payroll-novelty-batch.v2':'payroll-novelty-batch.v1',sourceMode:'individual',periodMonth:body.payload.periodMonth,payrollType:'monthly',
      status:'draft',version:1,rowCount:1,exportable:false,grhMutation:false,payrollCalculated:false,payrollPosted:false,
      rows:[{...row,employmentContractId:consultedSubject.contractId,...(native?{subject:clone(consultedSubject)}:{}),issues:[]}],blockingIssueCount:0,warningIssueCount:0};
  }else{
    batch=clone(batches.get(body.payload.batchId));assert.ok(batch);assert.equal(body.payload.expectedVersion,batch.version);
    assert.ok(readBatch(batch).allowedCommands.includes(body.command),'Actor cannot perform this transition');
    batch.status={submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'}[body.command];
    batch.version++;batch.exportable=batch.status==='approved';
  }
  batches.set(batch.id,clone(batch));const response={ok:true,data:clone(batch)};
  receipts.set(key,{body:clone(body),response:clone(response)});return response;
}
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block',locale:'es-AR',reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith('/api/')){
      requests.push({path:url.pathname,query:url.search,method:request.method()});
      if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'QA sintética',email:actor+'@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['payroll.read',...capabilities()],platformCapabilities:[],platformRoles:[]}}});
      if(url.pathname==='/api/internal-payroll-novelties'){
        if(deny)return route.fulfill({status:403,json:{ok:false,error:'Permiso revocado en fixture'}});
        if(request.method()==='POST'){
          const body=request.postDataJSON(),key=request.headers()['idempotency-key'];
          assert.equal(url.searchParams.get('version'),body.command==='prepare'&&!body.payload.rows[0].contractId?null:'2');
          assert.match(key,/^[a-f0-9-]{36}$/);posts.push({body:clone(body),key});
          if(rejectIdentity){rejectIdentity=false;return route.fulfill({status:409,json:{ok:false,code:'PAYROLL_NOVELTY_NATIVE_IDENTITY_CHANGED',error:'El vínculo cambió. Volvé a consultar la misma persona.'}});}
          const response=write(body,key);
          if(body.command==='prepare'?failPrepare:failTransition){failPrepare=false;failTransition=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta perdida sintética'}});}
          return route.fulfill({json:response});
        }
        assert.equal(url.searchParams.get('version'),'2');const resource=url.searchParams.get('resource');
        if(resource==='bootstrap')return route.fulfill({json:bootstrap()});
        if(resource==='employee'){
          assert.equal(nominal,true);assert.equal(url.searchParams.has('legajo'),false);const contractId=url.searchParams.get('contractId');
          let subject=contractId===ids.other?{...original,contractId:ids.other,employeeName:'Otra alta QA con el mismo legajo',registrationId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}:clone(currentSubject);
          if(contractId===ids.grh)subject={contractId:ids.grh,legajo:'571',employeeName:'Origen GRH QA',identityToken:'b'.repeat(64),sourceCutoff:'2026-09-10T15:00:00Z'};
          consultedSubject=clone(subject);
          if(holdEmployee){holdEmployee=false;await new Promise(resolve=>{releaseEmployee=resolve;});}
          return route.fulfill({json:{ok:true,version:'payroll-novelty-employee.v2',subject}});
        }
        const stored=batches.get(url.searchParams.get('id'));if(!stored)return route.fulfill({status:404,json:{ok:false,error:'Lote QA inexistente'}});
        if(resource==='detail')return route.fulfill({json:{ok:true,data:readBatch(stored)}});
        if(resource==='export'){
          if(!current)return route.fulfill({status:409,json:{ok:false,error:'La identidad cambió. Volvé a consultar.'}});
          assert.equal(stored.status,'approved');return route.fulfill({json:{ok:true,contractVersion:'payroll-novelty-export.v2',approvalEffect:'export_only',data:readBatch(stored)}});
        }
        throw Error('Unexpected novelty resource '+resource);
      }
      // All remaining private surfaces are unavailable fixtures; never network.
      return route.fulfill({status:403,json:{ok:false,error:'Fuera del alcance sintético'}});
    }
    if(published)return route.continue();
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream'});
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  const open=async(contractId=ids.contract)=>{
    const target=published?build.url('novedades-nomina.html'):new URL('/novedades-nomina.html',origin);target.searchParams.set('monthlyContractId',contractId);
    await page.goto(target.href);await page.locator('#nativeMonthlySubject').filter({hasText:contractId===ids.other?'Otra alta QA':contractId===ids.grh?'Origen GRH':'Alta propia sintética'}).waitFor();
    await page.locator('#preflightButton:enabled').waitFor();
  };
  const preview=async()=>{
    await page.locator('#periodMonth').fill('2026-09');await page.locator('#conceptSourceId').fill('44');
    await page.locator('#quantityDecimal').fill('1,000001');await page.locator('#preflightButton').click();
    await page.locator('#prepareButton:enabled').waitFor();
  };
  const refresh=async()=>{await page.locator('#refreshButton').click();await page.locator('#refreshButton:enabled').waitFor();};
  const action=async name=>{await page.locator('#detailActions').getByRole('button',{name,exact:true}).click();await page.locator('#refreshButton:enabled').waitFor();};
  await open();assert.equal(posts.length,0);assert.equal(await page.locator('#legajo').inputValue(),'571');assert.equal(await page.locator('#legajo').isDisabled(),true);
  assert.equal(await page.locator('#nativeMonthlyPick').isVisible(),false);checks.push('explicit UUID lookup works without workforce directory capability and creates nothing');
  await preview();assert.equal(posts.length,0);failPrepare=true;await page.locator('#prepareButton').click();
  await page.locator('#nativeMonthlyPending:visible').waitFor();assert.equal(await page.locator('#conceptSourceId').isDisabled(),true);
  assert.equal(await page.locator('#nativeMonthlyClear').isDisabled(),true);
  await page.locator('#nativeMonthlyRetry:enabled').click();await page.locator('#nativeMonthlyPending').waitFor({state:'hidden'});
  assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.deepEqual(posts[0].body,posts[1].body);assert.equal(batches.size,1);
  assert.equal(posts[0].body.payload.rows[0].quantityDecimal,'1.000001');assert.equal(posts[0].body.payload.rows[0].amountCents,null);
  assert.equal(posts[0].body.payload.rows[0].contractId,ids.contract);
  checks.push('lost prepare response locks the original identity and retries the same exact body/key without a second batch');
  await page.locator('#detailActions').getByRole('button',{name:'Enviar a aprobación',exact:true}).waitFor();
  await action('Enviar a aprobación');await page.locator('#detailState').filter({hasText:'Pendiente'}).waitFor();
  assert.equal(await page.locator('#detailActions').getByRole('button',{name:'Aprobar para exportar',exact:true}).count(),0);
  checks.push('maker submits and receives no self-approval or export action');
  actor='checker';await refresh();await page.locator('#batchRows').getByRole('button',{name:'Abrir',exact:true}).last().click();await page.locator('#detailActions').getByRole('button',{name:'Aprobar para exportar',exact:true}).waitFor();
  failTransition=true;await action('Aprobar para exportar');await page.locator('#nativeMonthlyPending:visible').waitFor();
  await page.locator('#nativeMonthlyRetry:enabled').click();await page.locator('#nativeMonthlyPending').waitFor({state:'hidden'});
  const approvals=posts.filter(p=>p.body.command==='approve');assert.equal(approvals.length,2);assert.equal(approvals[0].key,approvals[1].key);assert.deepEqual(approvals[0].body,approvals[1].body);
  assert.equal([...batches.values()][0].version,3);checks.push('independent review retries its own immutable command after a lost response');
  for(const [name,extension] of [['Descargar CSV de control','csv'],['Descargar Excel de control','xlsx']]){
    const pending=page.waitForEvent('download');await action(name);const download=await pending;
    assert.match(download.suggestedFilename(),/control-novedad-alta-propia/);const file=path.join(out,'control-synthetic.'+extension);await download.saveAs(file);
    if(extension==='csv'){const text=fs.readFileSync(file,'utf8');assert.match(text,/MUNICONTROL/);assert.ok(text.includes(ids.contract));assert.match(text,/;1\.000001;;;;;NO;/);assert.doesNotMatch(text,/homologad|backup/i);}
    else{const workbook=await readXlsxFile(file),rows=Array.isArray(workbook[0]?.data)?workbook[0].data:workbook;assert.equal(rows[1][15],ids.contract);assert.equal(rows[1][8],null);}
  }
  checks.push('approved native control CSV/XLSX preserve subject provenance, exact units and missing amount');
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:width===1440?1000:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow at '+width);
    await page.locator('#detailPanel').screenshot({path:path.join(out,`detail-${width}-synthetic.png`)});
    assert.equal(await page.locator('#detailActions').getByRole('button',{name:'Descargar Excel de control',exact:true}).isVisible(),true);
  }checks.push('1440, 390 and 320px retain approved detail and export controls without page overflow');
  current=false;await refresh();assert.equal(await page.locator('#detailActions').getByRole('button',{name:/Descargar/}).count(),0);
  checks.push('identity drift revokes export without assigning the old batch to a different same-legajo person');
  actor='maker';current=true;batches.clear();await open(ids.other);assert.equal(await page.locator('#legajo').inputValue(),'571');
  await preview();assert.equal(posts.filter(p=>p.body.command==='prepare').length,2);
  checks.push('same legajo in another native contract is displayed as a separate explicit UUID selection');
  await open();await preview();rejectIdentity=true;const beforeDrift=posts.length,readsBeforeDrift=requests.filter(r=>r.query.includes('resource=employee')).length;
  await page.locator('#prepareButton').click();await page.locator('#messageHost').filter({hasText:'El vínculo cambió'}).waitFor();
  assert.equal(batches.size,0);assert.equal(posts.length,beforeDrift+1);
  assert.equal(posts.at(-1).body.payload.rows[0].contractId,ids.contract);assert.equal(posts.at(-1).body.payload.rows[0].identityToken,original.identityToken);
  assert.equal(requests.filter(r=>r.query.includes('resource=employee')).length,readsBeforeDrift);
  assert.equal(await page.locator('#nativeMonthlyPending').isVisible(),false);
  checks.push('stale-identity refusal preserves the exact original UUID/token and never silently looks up another same-legajo identity');
  await open(ids.grh);assert.equal(await page.locator('#payrollType').isDisabled(),false);
  assert.match(await page.locator('#nativeMonthlySubject').innerText(),/Fuente GRH/);
  await preview();await page.locator('#prepareButton').click();await page.locator('#detailActions').getByRole('button',{name:'Enviar a aprobación',exact:true}).waitFor();
  assert.equal(posts.at(-1).body.payload.rows[0].contractId,undefined);assert.equal(posts.at(-1).body.payload.rows[0].identityToken,undefined);
  assert.equal([...batches.values()].at(-1).contractVersion,'payroll-novelty-batch.v1');
  checks.push('PostgreSQL MD5 UUID from GRH remains source-backed and prepares through unchanged v1 input without native provenance');
  batches.clear();
  await open();await preview();await page.locator('#prepareButton').click();await page.locator('#detailActions').getByRole('button',{name:'Cancelar lote',exact:true}).waitFor();
  await action('Cancelar lote');assert.equal([...batches.values()].at(-1).status,'cancelled');assert.equal(await page.locator('#detailActions').getByRole('button',{name:/Descargar/}).count(),0);
  checks.push('cancelled native draft retains its recorded subject and never offers export');
  batches.clear();await open();await preview();await page.locator('#prepareButton').click();await page.locator('#detailActions').getByRole('button',{name:'Enviar a aprobación',exact:true}).waitFor();
  await action('Enviar a aprobación');actor='checker';await refresh();await page.locator('#batchRows').getByRole('button',{name:'Abrir',exact:true}).last().click();await action('Rechazar');
  assert.equal([...batches.values()][0].status,'rejected');assert.equal(await page.locator('#detailActions').getByRole('button',{name:/Descargar/}).count(),0);
  checks.push('independent rejection is final for the batch and cannot export');
  actor='maker';batches.clear();await open();await preview();nominal=false;await refresh();
  assert.equal(await page.locator('#nativeMonthlySubject').innerText(),'');assert.equal(await page.locator('#prepareButton').isDisabled(),true);
  checks.push('nominal permission revocation clears prepared identity and prevents writing');
  nominal=true;await open();holdEmployee=true;await page.locator('#nativeMonthlyRefresh').click();
  await page.waitForFunction(()=>document.body.dataset.busy==='true');deny=true;
  // Trigger a newer authority read while the employee lookup remains in flight.
  await page.evaluate(()=>document.querySelector('#refreshButton').dispatchEvent(new Event('click')));
  await page.locator('#messageHost').filter({hasText:'No pudimos cargar'}).waitFor();assert.ok(releaseEmployee);releaseEmployee();
  await page.waitForFunction(()=>document.body.dataset.busy!=='true');
  assert.equal(await page.locator('#nativeMonthlySubject').innerText(),'');assert.equal(await page.locator('#prepareButton').isDisabled(),true);
  checks.push('late employee response cannot restore nominal identity after a newer denied authority read');
  assert.deepEqual(errors,[]);checks.push('no unhandled JavaScript errors; every private request intercepted');
  const result={ok:true,checksPassed:checks.length,checks,publishedAssets:published,assetHashes:hashes,
    apiResponsesSynthetic:true,privateApisIntercepted:true,interceptedPosts:posts.length,realMunicipalWrites:0,realMunicipalSessionTested:false};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,requests,posts:posts.length,errors,error:String(error.stack)},null,2));if(page)await page.screenshot({path:path.join(out,'failure-synthetic.png')}).catch(()=>{});throw error;}
finally{await browser.close();}
