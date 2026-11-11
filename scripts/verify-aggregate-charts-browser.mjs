// Product components, local assets and synthetic responses only. No real session,
// municipal data, SQL connection or production write is used by this verifier.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {reportFixture} from '../tests/fixtures/own-payroll-report-synthetic.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'verification', 'aggregate-charts');
fs.mkdirSync(output, {recursive: true});
const origin = 'https://aggregate-charts.invalid', checks = [], errors = [], requests = [], fixture = reportFixture(31);
const auth = {ok: true, authenticated: true, sessionVersion: 2, expiresAt: new Date(Date.now()+3600000).toISOString(),
 user: {id: 'synthetic-chart-user', email: 'chart-qa@example.invalid', name: 'Prueba sintética'},
 access: {context: 'tenant', tenant: {id: '10000000-0000-4000-8000-000000000099', roleKey: 'qa'},
 tenantCapabilities: [...OWN_CLOSE_NOMINAL, 'workforce.summary.read', 'management.analytics.read', 'payroll.read']}};
const period = (hires, exits, partial=false) => ({label: 'Período sintético', range: {from: '2025-01-01', to: '2025-12-31'}, hires, exits, partial, absenceEvents: 25, affectedContracts: 10, elapsedDays: 365});
const analytics = {periods: {previousFull: period(10,3), previousComparable: period(8,2), current: period(12,5,true)},
 managementYears: [{index:1,label:'Año 1',previous:period(10,3),current:period(0,2),comparableToCurrent:true},
 {index:2,label:'Año 2',previous:period(8,2),current:null,comparableToCurrent:false,currentStatus:'not_started'}],
 calendarYears: [{year:2025,label:'2025',hires:10,exits:3,partial:false}, {year:2026,label:'2026*',hires:4,exits:1,partial:true}],
 sectors: {literal:[{label:'Sector sintético A',previousContractMonths:50,currentContractMonths:75,previousEvents:8,currentEvents:9},
 {label:'<img src=x onerror=alert(1)>',previousContractMonths:0,currentContractMonths:null,previousEvents:0,currentEvents:2}], consolidated:[], mapping:{}},
 budget:{available:false},quality:{},meta:{sourceLabel:'Datos sintéticos',sourceCutoff:'2026-10-31T00:00:00Z'}};
const shell = body => '<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f2f5f3;font:14px system-ui;color:#123247}main{max-width:1180px;margin:auto;padding:16px;background:white}[hidden]{display:none!important}input,select,button{font:inherit;min-height:44px;max-width:100%}</style><body><main>'+body+'</main></body></html>';
const ownHtml = shell('<p>PRUEBA SINTÉTICA · SIN DATOS MUNICIPALES</p><button id="logoutButton">Cerrar prueba</button><section id="panel"></section><script type="module">import {mountOwnPayrollReports} from "/assets/own-payroll-report-panel.js";mountOwnPayrollReports(document.getElementById("panel"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"reportes"}}));</script>');
const raceHtml = shell('<section id="plots"></section><script type="module">import * as view from "/assets/aggregate-chart-view.js";window.chartQA=view;window.chartQAReady=true;</script>');
let denied=false;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   requests.push({path:u.pathname,query:u.search,method:route.request().method()});
   assert.equal(route.request().method(),'GET','this chart verifier must not send writes');
   if(denied)return route.fulfill({status:403,json:{ok:false,error:'Sin acceso sintético'}});
   if(u.pathname==='/api/internal-auth')return route.fulfill({status:200,json:auth});
   if(u.pathname==='/api/internal-data'&&u.searchParams.get('resource')==='managementanalytics')return route.fulfill({status:200,json:{ok:true,data:analytics}});
   if(u.pathname==='/api/internal-own-payroll-close')return route.fulfill({status:200,json:{ok:true,data:u.searchParams.get('resource')==='group'?fixture.receipts[0]:fixture.details[0]}});
   return route.fulfill({status:404,json:{ok:false}});
  }
  if(u.pathname==='/own-qa')return route.fulfill({status:200,contentType:'text/html',body:ownHtml});
  if(u.pathname==='/race-qa')return route.fulfill({status:200,contentType:'text/html',body:raceHtml});
  const relative=u.pathname==='/inicio'?'friendly-dashboard.html':u.pathname==='/comparativa'?'gestion-comparativa.html':u.pathname.slice(1);
  let file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))return route.abort();
  if(!fs.existsSync(file))file=path.join(root,'public',relative);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const ext=path.extname(file);return route.fulfill({status:200,contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[ext]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 const ready=async(host,count)=>{await p.waitForFunction(({host,count})=>{const root=document.querySelector(host);return root&&root.querySelectorAll('.mc-chart[data-loading=false] canvas').length===count;},{host,count});};
 const noOverflow=async()=>{
  try{await p.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,undefined,{timeout:3500});}
  catch(error){const diagnosis=await p.evaluate(()=>({path:location.pathname,width:innerWidth,documentWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,classes:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(r=>r.right>innerWidth+1&&r.width>0).slice(0,25)}));fs.writeFileSync(path.join(output,'overflow-diagnostic.json'),JSON.stringify(diagnosis,null,2));await p.screenshot({path:path.join(output,'overflow-failure.png'),fullPage:true});throw error;}
 };
 const usableHorizontalPlot=async selector=>{
  await p.waitForFunction(async selector=>{
   const {echarts}=await import('/assets/mc-charts.js');
   const hosts=[...document.querySelectorAll(selector)];
   return hosts.length>0&&hosts.every(host=>{
    const chart=echarts.getInstanceByDom(host);
    return chart?.getModel().getComponent('grid')?.coordinateSystem?.getRect().width>=90;
   });
  },selector,{timeout:3500});
 };
 await p.goto(origin+'/friendly-dashboard.html');await ready('#executiveCharts',2);
 assert.equal(await p.locator('#executiveCharts table tbody tr').count(),16);
 assert.equal(requests.some(r=>r.path.includes('payroll')),false);
 checks.push('executive charts render only existing public movement/absence aggregates, with exact accessible tables');
 await p.locator('#executiveCharts').screenshot({path:path.join(output,'executive-desktop-synthetic.png')});
 for(const width of [390,320]){await p.setViewportSize({width,height:1000});await noOverflow();await p.locator('#executiveCharts').screenshot({path:path.join(output,'executive-mobile-'+width+'-synthetic.png')});}
 checks.push('executive charts fit 390 and 320 pixel layouts');
 await p.setViewportSize({width:1440,height:1100});await p.goto(origin+'/gestion-comparativa.html');await ready('#yearChart',1);await ready('#sectorBars',1);
 assert.equal(await p.locator('#yearAccessibleRows tr').count(),2);assert.equal(await p.locator('#sectorRows tr').count(),2);
 assert.equal(await p.locator('#sectorBars img').count(),0);
 const calls=requests.length;await p.locator('#yearMetric').selectOption('exits');await ready('#yearChart',1);
 await p.locator('#sectorMetric').selectOption('events');await ready('#sectorBars',1);
 assert.equal(requests.length,calls);checks.push('comparison metric changes reuse data; accessible full tables survive and labels cannot inject markup');
 await p.locator('#yearChart').screenshot({path:path.join(output,'comparison-years-synthetic.png')});
 await p.locator('#timeBasis').selectOption('calendar');await p.locator('#comparisonForm button[type=submit]').click();await ready('#yearChart',1);
 assert.match(await p.locator('#yearChart').textContent(),/Parcial/);checks.push('calendar partial context remains visible; null current management is not a zero');
 for(const width of [390,320]){await p.setViewportSize({width,height:1000});await noOverflow();await usableHorizontalPlot('#sectorBars .mc-chart');await p.locator('#sectorBars').screenshot({path:path.join(output,'comparison-mobile-'+width+'-synthetic.png')});}
 checks.push('comparison charts fit 390 and 320 pixel layouts with at least 90 pixels of usable horizontal plotting width');
 denied=true;await p.locator('#refreshButton').click();await p.locator('#errorHost:not([hidden])').waitFor();
 assert.equal(await p.locator('#yearChart canvas,#sectorBars canvas').count(),0);checks.push('failed authorization withdraws comparison canvases and invalidates pending chart work');denied=false;
 await p.setViewportSize({width:1440,height:1100});await p.goto(origin+'/own-qa');
 await p.locator('[data-report-from]').fill('2026-10');await p.locator('[data-report-to]').fill('2026-10');await p.locator('[data-report-types]').selectOption('monthly');
 await p.locator('[data-report-consult]').click();await ready('[data-report-charts]',2);
 const original=await p.locator('[data-report-charts] table').allTextContents(), before=requests.length;
 await p.locator('[data-report-search]').fill('no existe esta fila');assert.equal(await p.locator('[data-report-rows] tr').count(),0);
 assert.deepEqual(await p.locator('[data-report-charts] table').allTextContents(),original);assert.equal(requests.length,before);
 checks.push('native payroll charts use all 31 selected records, independent of search and table pagination, without extra API reads');
 await p.locator('[data-report-search]').fill('');await p.locator('[data-report-charts]').screenshot({path:path.join(output,'own-payroll-desktop-synthetic.png')});
 await p.locator('[data-report-ranges] summary').click();await p.locator('[data-report-employeeFrom]').fill('1002');await ready('[data-report-charts]',2);
 assert.notDeepEqual(await p.locator('[data-report-charts] table').allTextContents(),original);assert.equal(requests.length,before);
 checks.push('explicit report scope updates chart aggregates without another request');
 for(const width of [390,320]){await p.setViewportSize({width,height:1000});await noOverflow();await usableHorizontalPlot('[data-report-charts] .mc-chart-card[data-size=lg] .mc-chart');await p.locator('[data-report-charts]').screenshot({path:path.join(output,'own-payroll-mobile-'+width+'-synthetic.png')});}
 checks.push('native charts fit 390 and 320 pixel layouts with at least 90 pixels of usable horizontal plotting width');
 await p.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
 assert.equal(await p.locator('[data-report-charts]').textContent(),'');checks.push('native capability revocation destroys and clears all salary charts');
 await p.goto(origin+'/race-qa');await p.waitForFunction(()=>window.chartQAReady===true);
 const result=await p.evaluate(async()=>{
  const host=document.getElementById('plots'),spec={key:'race',title:'Prueba',subtitle:'Sintética',kind:'bar',unit:'money',labels:['Dato'],series:[{name:'Importe',values:['1.00']}]};
  const pending=window.chartQA.drawAggregateCharts(host,[spec]);window.chartQA.clearAggregateCharts(host);await pending;
  return {children:host.childElementCount,canvases:host.querySelectorAll('canvas').length};
 });assert.deepEqual(result,{children:0,canvases:0});checks.push('clearing before lazy draw settles cannot resurrect stale data');
 await p.evaluate(async()=>{const host=document.getElementById('plots');await window.chartQA.drawAggregateCharts(host,[{key:'huge',title:'Importe exacto',subtitle:'Sintético',kind:'bar',unit:'money',labels:['Magnitud'],series:[{name:'Importe',values:['12345678901234567890.00000001']}]}]);});
 assert.equal(await p.locator('#plots canvas').count(),0);assert.match(await p.locator('#plots table').textContent(),/12\.345\.678\.901\.234\.567\.890,00000001/);
 checks.push('unsafe plotting magnitude falls back to exact digits instead of rounding an accounting total');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({checksPassed:checks.length,checks,errors,browser:browser.version(),syntheticApi:true,realMunicipalSessionTested:false,backendWrites:false,apiRequests:requests.length},null,2));
 console.log(JSON.stringify({checksPassed:checks.length,errors}));
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,checks,errors},null,2));throw error;}
finally{await browser.close();}
