import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {fleetOverview} from '../local-agents/clock-fleet/overview.mjs';
const out='verification/fleet-local-panel';fs.mkdirSync(out,{recursive:true});
const config={clocks:[{clockId:'qa-a',label:'PM-14 · Edificio Nuevo',enabled:true},{clockId:'qa-b',label:'PM-02 · Compras y Suministros',enabled:true},{clockId:'qa-c',label:'PM-05 · Delegación La Colonia',enabled:true}]};
const time='2026-09-18T14:00:00.000Z';
const summary={updatedAt:time,clocks:[{clockId:'qa-a',status:'captured_locally',lastAttemptAt:time,lastCaptureAt:time,uniqueLocalRecords:1200,nextPollAt:'2026-09-18T14:15:00Z'},{clockId:'qa-b',status:'retry_wait',blocked:false,connectionFailureCount:8,lastAttemptAt:time,lastError:'CONNECT_TIMEOUT',nextPollAt:'2026-09-18T14:15:00Z'},{clockId:'qa-c',status:'blocked',blocked:true,lastAttemptAt:time,lastError:'AUTH_NOT_ACCEPTED'}]};
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0;
 await page.route('**/*',r=>{requests++;return r.abort();});
 await page.setContent(fleetOverview(config,summary,{desired:'running',pm10:{lastCaptureAt:time,lastReceiptAt:time,confirmedRecords:456}}));
 assert.equal(await page.locator('.metrics strong').allTextContents().then(x=>x.join(',')),'3,1,1');assert.equal(await page.locator('article').count(),4);
 assert.match(await page.locator('body').innerText(),/Reintento automático, espaciado y sin cambiar la clave/);assert.match(await page.locator('body').innerText(),/El sistema no prueba otras claves/);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/panel-'+width+'.png',fullPage:true});}
 assert.equal(requests,0);assert.deepEqual(errors,[]);const result={ok:true,checks:5,syntheticStatus:true,networkRequests:0,hardwareConnections:0,mobileWidths:[390,320]};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
