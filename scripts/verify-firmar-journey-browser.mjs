// Isolated synthetic UI. Every request is intercepted; no PFDR login, PDF submission,
// certificate, personal identity, municipal API or real signed file is used.
import {build} from 'esbuild';import {chromium} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const out=path.resolve('verification/firmar-journey');fs.mkdirSync(out,{recursive:true});
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FirmarJourneyPanel} from './src/islands/firmar-journey-panel.tsx';
const requestId='11111111-1111-4111-8111-111111111111',attemptId='22222222-2222-4222-8222-222222222222';window.calls=[];window.replyState='awaiting_receipt';
function App(){const [valid,setValid]=useState(true);window.revoke=()=>setValid(false);return <main><p className="qa">PRUEBA SINTÉTICA · No es un documento ni una firma municipal</p><FirmarJourneyPanel integrationReady={!location.search.includes('not-ready')} sessionValid={valid}
 document={{id:requestId,version:3,title:'Informe institucional de prueba',pages:2,sha256:'a'.repeat(64)}}
 preview={<div className="sheet"><small>MUNICONTROL · DOCUMENTO DE QA</small><h1>Informe institucional</h1><p>Período de ejemplo · Versión 3</p><hr/><p>Documento ficticio utilizado para comprobar el recorrido de firma. No contiene información municipal ni certificados.</p><div className="line"/><div className="line"/><div className="line"/><p><strong>Alcance:</strong> revisión, autorización externa y retorno sin mover archivos manualmente.</p><footer>VISTA PREVIA SINTÉTICA · Página 1 de 2</footer></div>}
 begin={async args=>{window.calls.push('begin');return {requestId,attemptId,state:'awaiting_authorization',expiresAt:new Date(Date.now()+1200000).toISOString(),authorizationUrl:'https://tst.firmar.gob.ar/firmador/api/signatures/'+attemptId,officialEmissionEnabled:false};}}
 readStatus={async args=>{window.calls.push('status');return{requestId,attemptId,state:window.replyState,officialEmissionEnabled:false};}}/></main>;}createRoot(document.getElementById('app')).render(<App/>);`;
const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'firmar-qa.tsx',loader:'tsx'},bundle:true,format:'esm',platform:'browser',write:false,minify:true});
const js=bundled.outputFiles[0].text,css=fs.readFileSync('assets/firmar-journey.css','utf8');
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recorrido de firma · QA</title><style>body{margin:0;background:#edf3f4;padding:30px;font-family:system-ui;color:#153847}main{max-width:1300px;margin:auto}.qa{font-size:11px;letter-spacing:.08em}.sheet{background:#fff;padding:36px;min-height:500px;box-shadow:0 3px 16px #12374915;font-size:14px;overflow-wrap:anywhere}.sheet small{font-size:10px}.sheet h1{font-size:26px}.sheet footer{margin-top:55px;font-size:10px}.line{height:8px;background:#edf2f4;margin:14px 0}.line:nth-of-type(2){width:80%}hr{border:0;border-top:2px solid #087e7a;margin:25px 0}@media(max-width:500px){body{padding:8px}.sheet{padding:20px;font-size:12px}.sheet h1{font-size:20px}}${css}</style><div id="app"></div><script type="module" src="/qa.js"></script></html>`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const checks=[],errors=[];let intercepted=0;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
 await context.route('**/*',async r=>{intercepted++;const u=new URL(r.request().url());
  if(u.origin==='https://municipio-junin-friendly.vercel.app')return r.fulfill({contentType:u.pathname==='/qa.js'?'text/javascript':'text/html',body:u.pathname==='/qa.js'?js:html});
  if(u.origin==='https://tst.firmar.gob.ar')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><title>Autorización de prueba</title><h1>SIMULACIÓN TÉCNICA</h1><p>No se solicitan datos ni se firma un documento.</p></html>'});
  return r.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://municipio-junin-friendly.vercel.app/qa');await page.getByRole('heading',{name:'Tu firma. Sin mover archivos.'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Firmar PDF',exact:true}).isDisabled(),true);
 await page.screenshot({path:out+'/review-desktop.png',fullPage:true});checks.push('explicit review before launch');
 await page.getByRole('checkbox').check();const popupPromise=context.waitForEvent('page');await page.getByRole('button',{name:'Firmar PDF',exact:true}).click();
 const popup=await popupPromise;await popup.waitForURL('https://tst.firmar.gob.ar/**');assert.equal(await popup.evaluate(()=>opener),null);
 assert.equal(page.url(),'https://municipio-junin-friendly.vercel.app/qa');assert.equal(await page.getByRole('heading',{name:'Informe institucional de prueba',exact:true}).count(),1);
 checks.push('official-window handoff preserves original MuniControl page and removes opener');
 await page.bringToFront();await page.evaluate(()=>window.replyState='received_unverified');await page.getByRole('button',{name:'Actualizar estado de esta solicitud'}).click();
 await page.getByRole('status').filter({hasText:'Documento recibido. Falta verificar la firma'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Ver documento verificado'}).count(),0);checks.push('provider callback cannot produce a verified document');
 await page.screenshot({path:out+'/returned-unverified.png',fullPage:true});
 await page.evaluate(()=>window.revoke());await page.getByRole('alert').waitFor();assert.equal(await page.locator('.mc-firmar-preview').count(),0);checks.push('session revocation removes old document and ends tracking');
 await page.goto('https://municipio-junin-friendly.vercel.app/qa?not-ready');await page.getByText('Conexión institucional pendiente',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Firmar PDF',exact:true}).count(),0);checks.push('no fake enabled signing button before institutional readiness');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('https://municipio-junin-friendly.vercel.app/qa');await page.getByRole('checkbox').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/review-'+width+'.png',fullPage:true});}
 checks.push('320/390px reflow and reduced motion');
 await page.getByRole('checkbox').focus();await page.keyboard.press('Space');await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Firmar PDF',exact:true}).evaluate(el=>el===document.activeElement),true);checks.push('review and main action reachable by keyboard');
 await page.evaluate(()=>window.open=()=>null);await page.getByRole('button',{name:'Firmar PDF',exact:true}).click();const fallback=page.getByRole('link',{name:'Continuar y volver automáticamente'});await fallback.waitFor();assert.ok((await fallback.getAttribute('href')).startsWith('https://tst.firmar.gob.ar/firmador/api/signatures/'));assert.equal(await page.evaluate(()=>window.calls.filter(x=>x==='begin').length),1);checks.push('blocked popup offers explicit same-tab continuation, no duplicate submission');
 assert.deepEqual(errors,[]);const result={ok:true,groups:checks.length,checks,interceptedRequests:intercepted,realProviderRequests:0,realSignatures:0,municipalDataUsed:false,productionIntegrationTested:false};
 fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
