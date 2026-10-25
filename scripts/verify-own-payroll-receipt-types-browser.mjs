// Isolated source-panel browser QA over explicit fictional HTTP fixtures only.
// No SQL, provider, user profile, real certificate or business write. PDFs use fictional snapshots only.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {launchOwnSyntheticBrowser} from './lib/own-synthetic-browser.mjs';
import {selectNoeliaReceiptTypes} from './lib/noelia-payroll-circuit-browser.mjs';
import {OWN_RUN_TYPES} from '../assets/own-payroll-run-workspace-model.js';
import {receiptPreview} from '../tests/fixtures/own-payroll-receipt-synthetic.js';
import {uid} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownReceiptParams,OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE} from '../assets/own-payroll-receipt-model.js';
import {municipalDocumentIssuerProfile} from '../lib/municipal-document-issuer.js';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);assert.equal(args.length,1);assert.match(args[0],/^--output=verification\/[A-Za-z0-9_.-]+$/);
const output=path.join(root,args[0].slice(9));assert.equal(fs.existsSync(output),false);fs.mkdirSync(output,{recursive:true});
const caps=[...new Set([...OWN_RECEIPT_PREPARE,...OWN_RECEIPT_APPROVE])],tenantId=uid(700),requests=[],checks=[],errors=[],egress=[];
const csp="default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';connect-src 'self';img-src 'self' data:;font-src 'self';object-src 'none';base-uri 'none'";
let zero=true,browser,server,failure;const uxObservations=[],pdfArtifacts=[];
const issuer=municipalDocumentIssuerProfile({tenantId},new Map([[tenantId,{id:'qa192-independent-receipt-ux',revision:1,issuer:{name:'Municipio exclusivamente sintético',taxId:'30990000001',address:'Domicilio inventado QA'},source:{kind:'municipal_official_backup',label:'Antecedente institucional exclusivamente sintético',cutoff:'2026-10-01T15:00:00',validityDeclared:false}}]]));
const nominalPageStyles=fs.readFileSync(path.join(root,'nomina-control.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/i)?.[1];assert.ok(nominalPageStyles,'Current payroll page styles are required by this fixture');
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibos · prueba sintética</title><style>${nominalPageStyles}</style><style>body{margin:0}main{max-width:1200px;margin:auto;min-width:0;padding:12px}</style><main id="qa"></main><script type="module">import{mountOwnPayrollReceipts}from'/assets/own-payroll-receipt-panel.js';mountOwnPayrollReceipts(document.getElementById('qa'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'recibos'}}));</script></html>`;
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',csp);const url=new URL(req.url,'http://loopback.invalid'),json=(status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));
  try{
   if(url.pathname==='/api/internal-auth')return json(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:'receipt-ui-synthetic',email:'synthetic@example.invalid'},access:{context:'tenant',tenant:{id:tenantId,roleKey:'qa-receipt'},tenantCapabilities:caps},expiresAt:'2099-01-01T00:00:00Z'});
   if(url.pathname==='/api/internal-own-payroll-receipts'){
    let text='';for await(const part of req){text+=part;assert.ok(Buffer.byteLength(text)<=300000);}const body=text?JSON.parse(text):null;requests.push({method:req.method,resource:url.searchParams.get('resource'),operation:body?.operation??null,params:body?.params??null});
    if(req.method==='GET'&&url.searchParams.get('resource')==='issuer')return json(200,{ok:true,data:issuer});
    if(req.method==='POST'&&body?.operation==='preview'){const value=receiptPreview(body.params.contracts?.length===1?1:2);value.snapshot.params=ownReceiptParams(body.params);if(Object.hasOwn(body.params,'contracts')){value.snapshot.version='own-receipt-snapshot.v2';value.snapshot.identityBasis='owned_registration_verified_at_capture';}if(zero)Object.assign(value.snapshot,{records:[],sources:[],recordCount:0,conceptCount:0});value.snapshotSha256=ownRunHash(value.snapshot);return json(200,{ok:true,data:value});}
    errors.push('Unexpected receipt operation:'+req.method+':'+url.search);return json(405,{ok:false,error:'No command or document endpoint is enabled in this synthetic verifier.'});
   }
   if(req.method==='GET'&&url.pathname==='/qa.html')return res.writeHead(200,{'Content-Type':'text/html'}).end(html);
   if(req.method!=='GET'||!url.pathname.startsWith('/assets/'))return res.writeHead(404).end();
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));assert.ok(file.startsWith(path.join(root,'assets')+path.sep)&&/\.(?:js|css)$/.test(file));if(!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':'text/css'}).end(fs.readFileSync(file));
  }catch(error){errors.push(error.message);if(!res.headersSent)json(500,{ok:false,error:'Explicit synthetic fixture failed.'});else res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let driverName;({browser,driverName}=await launchOwnSyntheticBrowser());
 const context=await browser.newContext({viewport:{width:1366,height:1000},locale:'es-AR',serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)egress.push(new URL(r.url()).origin);});
 const q=k=>page.locator('[data-receipt-'+k+']'),idle=()=>page.waitForFunction(()=>document.querySelector('.own-receipt')?.getAttribute('aria-busy')==='false');
 for(const width of [1366,390,320]){
  zero=true;await page.setViewportSize({width,height:1000});await page.goto(origin+'/qa.html');await idle();
  check(await q('type-monthly').isVisible(),'Monthly is visible at'+width);check(await q('type-monthly').isChecked()===false,'No implicit monthly selection at'+width);check(await q('type-vacation').isVisible()===false,'Other types are progressive at'+width);check(await q('typeCount').innerText()==='0 tipos seleccionados','Empty explicit selection count at'+width);
  await q('type-monthly').focus();await page.keyboard.press('Space');check(await q('type-monthly').isChecked(),'Monthly selects using native keyboard Space at'+width);
  await q('typeDetails').locator('summary').focus();await page.keyboard.press('Space');check(await q('type-vacation').isVisible(),'Native details keyboard opens the secondary choices at'+width);await q('type-vacation').focus();await page.keyboard.press('Space');await q('type-sac').check();check(await q('typeCount').innerText()==='3 tipos seleccionados','Multiple native checkboxes need no modifier key at'+width);
  await q('type-monthly').uncheck();await q('typeDetails').locator('summary').click();
  const visibleTypes=await q('types').innerText(),geometry=await page.evaluate(()=>{const g=k=>{const r=document.querySelector('[data-receipt-'+k+']').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {date:g('date'),legend:g('legend')};});
  uxObservations.push({width,selectedTypes:['sac','vacation'],collapsed:true,selectedLabelsVisible:['Aguinaldo','Vacaciones'].every(label=>visibleTypes.includes(label)),visibleTypes,geometry,dateInitiallyEmpty:await q('date').inputValue()==='',legendInitiallyEmpty:await q('legend').inputValue()===''});
  await page.screenshot({path:path.join(output,'operator-choice-'+width+'.png'),fullPage:true});
  check(['Aguinaldo','Vacaciones'].every(label=>visibleTypes.includes(label)),'Collapsed selected types remain identifiable at'+width);
  check(await q('typeCount').locator('..').evaluate(el=>el.getAttribute('role')==='status'&&el.getAttribute('aria-live')==='polite'&&el.getAttribute('aria-atomic')==='true'),'One atomic live summary announces the exact selection at'+width);
  check(await q('types').getAttribute('aria-describedby')==='ownReceiptTypeHelp ownReceiptTypeSelection','Types reference their current visible selection at'+width);
  check(await q('date').inputValue()===''&&await q('legend').inputValue()==='','No payment date or legend default at'+width);
  if(width>720)check(Math.abs(geometry.date.y-geometry.legend.y)<=1,'Date and legend retain aligned inputs at'+width);else check(geometry.legend.y>geometry.date.y&&Math.abs(geometry.date.x-geometry.legend.x)<=1,'Date and legend stack without a false shared row at'+width);
  await q('typeDetails').locator('summary').click();await q('type-monthly').check();
  await q('period').fill('2026-10');await q('scope').selectOption('department');await q('departmentFrom').fill('35');await q('consult').click();await idle();
  check(await q('empty').isVisible(),'Verified zero scope has no fabricated receipts at'+width);check((await q('emptyScope').innerText()).includes('Repartición 35'),'The exact empty department is explicit at'+width);check(await q('scope').inputValue()==='department'&&await q('departmentFrom').inputValue()==='35','Empty scope preserves filters at'+width);check(await q('empty').locator('a.primary').getAttribute('href')==='/nomina#calculo','Empty state begins with preparation/calculation at'+width);check(await q('pdf').isDisabled()&&await q('prepare').isDisabled(),'Empty scope has no enabled PDF or conserve command at'+width);
  const last=requests.filter(r=>r.operation==='preview').at(-1);check(JSON.stringify(last.params.types)===JSON.stringify(['monthly','sac','vacation']),'Exact canonical types[] survives the actual HTTP request at'+width);
  zero=false;await q('scope').selectOption('all');await q('consult').click();await idle();check(await q('pdf').isEnabled(),'Nonempty fictional preview retains the unchanged PDF availability gate at'+width);await q('confirm').check();await q('type-vacation').uncheck();check(await q('pdf').isDisabled()&&await q('confirm').isChecked()===false&&await q('result').isHidden(),'Type change withdraws the prior preview and ACK at'+width);check((await q('status').getAttribute('data-state'))==='neutral','Type update uses actionable neutral status at'+width);
  await q('all').click();check(await q('typeCount').innerText()==='7 tipos seleccionados','Select-all is explicit inside the secondary disclosure at'+width);check(await q('all').evaluate(el=>el.getBoundingClientRect().height<=64),'Select-all has ordinary compact button height at'+width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document horizontal overflow at'+width);for(const key of ['period','scope'])check(await q(key).evaluate(el=>{const h=el.getBoundingClientRect().height;return h>=44&&h<=64;}),'Ordinary '+key+' control height with expanded types at'+width);check(await q('type-monthly').evaluate(el=>!!el.labels?.length&&el.id===el.labels[0].htmlFor),'Monthly has a native associated label at'+width);
  await q('consult').click();await idle();await q('confirm').check();const originalScope={period:await q('period').inputValue(),scope:await q('scope').inputValue(),department:await q('departmentFrom').inputValue()};
  await q('typeDetails').locator('summary').click();await selectNoeliaReceiptTypes(page,['monthly']);check(await q('type-monthly').isChecked()&&await q('typeCount').innerText()==='1 tipo seleccionado','Circuit receipt helper selects only monthly through native checkboxes at'+width);check(await q('pdf').isDisabled()&&!await q('confirm').isChecked()&&await q('result').isHidden(),'Circuit helper type changes invalidate the previous preview and ACK at'+width);check(JSON.stringify({period:await q('period').inputValue(),scope:await q('scope').inputValue(),department:await q('departmentFrom').inputValue()})===JSON.stringify(originalScope),'Circuit helper preserves period and all scope inputs at'+width);
  await q('consult').click();await idle();check(JSON.stringify(requests.filter(r=>r.operation==='preview').at(-1).params.types)===JSON.stringify(['monthly']),'Circuit helper monthly selection reaches the actual preview request at'+width);
  await selectNoeliaReceiptTypes(page,['vacation','sac']);check(!await q('type-monthly').isChecked()&&await q('type-vacation').isChecked()&&await q('type-sac').isChecked()&&await q('typeCount').innerText()==='2 tipos seleccionados','Circuit helper replaces monthly with the exact nonmonthly subset at'+width);await q('consult').click();await idle();check(JSON.stringify(requests.filter(r=>r.operation==='preview').at(-1).params.types)===JSON.stringify(['sac','vacation']),'Circuit helper preserves canonical nonmonthly types in the actual request at'+width);
  await selectNoeliaReceiptTypes(page,Object.keys(OWN_RUN_TYPES));check(await q('typeCount').innerText()==='7 tipos seleccionados','Circuit helper explicitly selects every canonical type at'+width);await assert.rejects(()=>selectNoeliaReceiptTypes(page,['monthly','invalid-synthetic-type']),/QA_RECEIPT_TYPES_INVALID/);check(await q('typeCount').innerText()==='7 tipos seleccionados','Circuit helper refuses invalid types before changing the selection at'+width);
  await selectNoeliaReceiptTypes(page,['monthly']);await q('scope').selectOption('all');
  const issuerBefore=await Promise.all(['issuerName','issuerTaxId','issuerAddress'].map(k=>q(k).inputValue()));
  check(JSON.stringify(issuerBefore)===JSON.stringify([issuer.profile.issuer.name,issuer.profile.issuer.taxId,issuer.profile.issuer.address]),'Institutional fields still autocomplete their original fixture values at'+width);
  await q('date').fill('2026-10-30');await q('legend').fill('Leyenda exclusivamente sintética QA');await q('consult').click();await idle();
  const originalNumber=receiptPreview(2).snapshot.records[0].employeeNumber;await q('search').fill(originalNumber);check(await q('rows').locator('tr').count()===1,'Search narrows only the visible receipt rows at'+width);
  for(const [kind,count]of [['group',2],['individual',1]]){
   if(kind==='individual'){const id=await q('contracts').locator('option').first().getAttribute('value');await q('contracts').selectOption([id]);await q('selected').click();await idle();}
   check(await q('pdf').isEnabled(),'The verified '+kind+' fixture enables the unchanged PDF gate at'+width);const event=page.waitForEvent('download');event.catch(()=>{});await q('pdf').click();const download=await event,bytes=fs.readFileSync(await download.path()),file='operator-'+kind+'-'+width+'.pdf';fs.writeFileSync(path.join(output,file),bytes,{flag:'wx'});await idle();
   check((await q('status').innerText()).startsWith(count+' recibos completos'),'Actual '+kind+' PDF preserves the original full receipt count at'+width);
   const parts=[...bytes.toString('ascii').matchAll(/<([0-9a-f]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(' ');
   check(parts.includes('Leyenda exclusivamente sintética QA')&&parts.includes('2026-10-30'),'Declared date and legend reach the original '+kind+' PDF at'+width);
   check(parts.includes('SIN FIRMA DIGITAL')&&parts.includes('COPIA PARA REVISIÓN'),'The '+kind+' PDF keeps its unsigned review status at'+width);
   pdfArtifacts.push({width,kind,file,recordCount:count,bytes:bytes.length});
  }
  check(JSON.stringify(await Promise.all(['issuerName','issuerTaxId','issuerAddress'].map(k=>q(k).inputValue())))===JSON.stringify(issuerBefore),'Type/selection changes do not replace institutional autocomplete at'+width);
  check(await q('date').inputValue()==='2026-10-30'&&await q('legend').inputValue()==='Leyenda exclusivamente sintética QA','Operator-declared emission draft remains intact at'+width);
  await page.screenshot({path:path.join(output,'receipt-types-'+width+'.png'),fullPage:true});
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));check(await q('result').isHidden()&&await q('pdf').isDisabled(),'Capability withdrawal clears preview at'+width);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(egress,[]);assert.equal(requests.filter(r=>r.operation==='command').length,0);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({version:'own-receipt-types-browser.v1',passed:true,driverName,checks,checksPassed:checks.length,uxObservations,pdfArtifacts,viewports:[1366,390,320],sourcePanel:true,syntheticHttp:true,commandPosts:0,previewRequests:requests.filter(r=>r.operation==='preview').map(r=>r.params),pdfGenerated:true,sqlExecuted:false,userBrowserUsed:false,productionWrites:0,municipalAcceptance:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,checksPassed:checks.length,viewports:[1366,390,320],sqlExecuted:false}));
}catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.txt'),error.stack??String(error));fs.writeFileSync(path.join(output,'partial.json'),JSON.stringify({checks,requests,errors,egress,sqlExecuted:false},null,2)+'\n');}
finally{await browser?.close();if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}}
if(failure)throw failure;
