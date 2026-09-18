// One real OCR call on a synthetic raster image. Native PDF is extracted without OCR.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {syntheticLegalPdf,session} from '../tests/fixtures/legal-registry-synthetic.js';
const out='verification/document-reader',root=path.resolve('public');fs.mkdirSync(out,{recursive:true});
const requested=[],writes=[],checks=[];let denied=false;
const rights=['legal.norm.read','legal.norm.register','assistant.use'];
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');requested.push(u.pathname);res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){writes.push(u.pathname);res.statusCode=405;return res.end();}
 if(u.pathname==='/api/internal-auth'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,authenticated:true,user:{email:session.email,name:'Operador QA'},access:{tenantCapabilities:denied?[]:rights,platformRoles:[],platformCapabilities:[]}}));}
 if(u.pathname==='/api/internal-legal-registry'){
  res.setHeader('Content-Type','application/json');if(denied){res.statusCode=403;return res.end(JSON.stringify({ok:false,error:'Permiso revocado'}));}
  const resource=u.searchParams.get('resource');const data=resource==='bootstrap'?{version:'legal-registry.v1',canRegister:true,total:0,storageBytes:0,storageLimitBytes:134217728}:{version:'legal-registry.v1',total:0,page:1,pageSize:25,rows:[]};return res.end(JSON.stringify({ok:true,data}));
 }
 const file=path.resolve(root,u.pathname==='/juridica'?'juridica-registro.html':'.'+u.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.(m?js)$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});let page;
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',locale:'es-AR'});
 const external=[];await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 page=await ctx.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/juridica');const open=page.getByRole('button',{name:'Lector documental · OCR y extractos',exact:true});await open.waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(x=>x.textContent==='Lector documental · OCR y extractos')?.disabled);await open.click();
 const dialog=page.getByRole('dialog',{name:'Lector documental'});await dialog.waitFor();checks.push('Existing legal authorization opens a modal without leaving MuniControl');
 const native=syntheticLegalPdf(2,'Articulo 1. NO corresponde el descuento del 25,5 % si existe permiso aprobado.');
 await dialog.locator('input[type=file]').setInputFiles({name:'norma-qa.pdf',mimeType:'application/pdf',buffer:native});
 await dialog.getByText('Texto nativo del PDF',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.reader-canvas canvas')?.width>0);
 assert.match(await dialog.locator('.reader-transcription pre').textContent(),/NO corresponde/);assert.ok(!requested.some(x=>x.includes('/vendor/ocr/')));checks.push('Native PDF text stays exact and does not load the OCR engine');
 await dialog.getByRole('button',{name:'Preparar extractos con páginas',exact:true}).click();await dialog.getByRole('heading',{name:'Extractos seleccionados automáticamente'}).waitFor();assert.match(await dialog.locator('blockquote').first().textContent(),/25,5 %/);await dialog.getByRole('button',{name:/Página 1 · Ver en el original/}).first().click();assert.ok(await dialog.locator('.reader-source').isVisible());checks.push('Extractive reading preserves negation, figures and navigation to its source page');
 await page.screenshot({path:out+'/native-desktop.png',fullPage:true});
 const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=650;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='bold 46px Arial';g.fillText('MUNICIPALIDAD - DOCUMENTO DE PRUEBA',60,100);g.font='40px Arial';g.fillText('Articulo 1. El plazo es de 30 dias.',60,210);g.fillText('Importe autorizado: 1200 pesos.',60,295);g.fillText('NO corresponde aplicar descuentos.',60,380);return c.toDataURL('image/png').split(',')[1];});
 await dialog.getByRole('button',{name:'Quitar documento'}).click();await dialog.locator('input[type=file]').setInputFiles({name:'escaneado-qa.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});
 await dialog.getByRole('button',{name:'Leer esta página con OCR',exact:true}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('.mc-reader button')].find(x=>x.textContent==='Leer esta página con OCR')?.disabled);
 assert.ok(!requested.some(x=>x.includes('/vendor/ocr/')));await dialog.getByRole('button',{name:'Leer esta página con OCR',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Texto a revisar',exact:true}).waitFor({timeout:100000});const recognized=await dialog.getByRole('textbox',{name:'Texto a revisar',exact:true}).inputValue();assert.match(recognized,/1200/);assert.match(recognized,/NO corresponde/i);checks.push('One real Spanish OCR operation reads a synthetic image locally, preserving tested amount and negation');
 await dialog.getByRole('button',{name:'Preparar extractos con páginas',exact:true}).click();assert.equal(await dialog.locator('blockquote').count(),0);await dialog.getByRole('button',{name:'Original y texto',exact:true}).click();await dialog.getByRole('checkbox',{name:'Revisé este texto contra la imagen original.'}).check();await dialog.getByRole('button',{name:'Preparar extractos con páginas',exact:true}).click();assert.ok(await dialog.locator('blockquote').count()>0);checks.push('Unreviewed OCR is excluded from extracts until explicit operator review');
 await page.screenshot({path:out+'/ocr-review-desktop.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await dialog.evaluate(el=>el.scrollTop=0);assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:out+'/reader-'+width+'.png',fullPage:true});}
 checks.push('Reader and quoted-source layout fit 390px and 320px screens');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Lector documental · OCR y extractos');await open.click();assert.equal(await page.locator('.reader-file').count(),0);checks.push('Closing clears selected bytes and results and restores keyboard focus');
 denied=true;await page.getByRole('dialog').locator('input[type=file]').setInputFiles({name:'denied.pdf',mimeType:'application/pdf',buffer:native});await page.getByRole('heading',{name:'Acceso no disponible'}).waitFor();assert.equal(await page.locator('dialog').count(),0);checks.push('Permission refusal closes the reader without showing prior or newly selected content');
 assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 const report={ok:true,checks:checks.length,labels:checks,realOcrCalls:1,externalRequests:0,documentUploads:0,municipalWrites:0,sourceAndIdentitySynthetic:true};fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync(out+'/error.txt',String(e.stack));throw e;}
finally{await browser.close();server.close();}
