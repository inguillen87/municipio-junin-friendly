/** Full workbench. All API requests, including POSTs, are intercepted with synthetic QA data. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { NOVELTY_CSV_HEADER } from '../assets/payroll-novelty-review.js';
import { publishedBuildVerification } from './lib/published-build-verification.mjs';
const live = process.env.NOVELTY_LIVE_ASSETS === '1';
const origin = live ? 'https://municipio-junin-friendly.vercel.app' : 'https://municontrol.test';
const root = path.resolve('public'), out = 'verification/novelty-txt' + (live ? '-published' : '');
const build = publishedBuildVerification({origin,root});
fs.mkdirSync(out, { recursive:true });
const checks = [], errors = [], posts = [];
let canPrepare = true, deny = false, rejectNext = false;
const csv = rows => NOVELTY_CSV_HEADER.join(';') + '\r\n' + rows.map(r=>r.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(';')).join('\r\n') + '\r\n';
const values = (legajo='1001', amount='', observation='Fundamento sintético de QA') => [legajo,'44','','','1',amount,'standard','Acta QA',observation,'NO'];
const bulk = Array.from({length:60},(_,i)=>values(String(100001+i), i%3===0?'0':'', i===59?'Última fila; dos líneas\n<script>window.__injected = true</script>':'Fundamento sintético de QA'));
const bootstrap = () => ({
  ok:true, principal:{email:'qa@example.invalid',membershipId:'00000000-0000-4000-8000-000000000001',tenantId:'00000000-0000-4000-8000-000000000002',certifiedBindingId:'00000000-0000-4000-8000-000000000004',capabilities:canPrepare?['payroll.novelty.prepare']:[]},
  feature:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only'},limits:{contractVersion:'payroll-novelty-batch.v2',sourceModes:['individual','bulk'],native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']},approvalEffect:'export_only',grhMutation:false,payrollCalculated:false,payrollPosted:false,maxRows:500,payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other']},batches:[],
});
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/internal-payroll-novelties') {
        if (deny) return route.fulfill({status:401,json:{ok:false,error:'Sesión sintética vencida'}});
        if (route.request().method() === 'POST') {
          posts.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
          if (rejectNext) { rejectNext=false; return route.fulfill({status:503,json:{ok:false,error:'Reintento sintético QA'}}); }
          return route.fulfill({status:200,json:{ok:true,data:{...posts.at(-1).body.payload,id:'00000000-0000-4000-8000-000000000003',contractVersion:'payroll-novelty-batch.v1',status:'draft',version:1,rowCount:posts.at(-1).body.payload.rows.length,exportable:false,grhMutation:false,payrollCalculated:false,payrollPosted:false}}});
        }
        return route.fulfill({status:200,json:bootstrap()});
      }
      if (u.pathname === '/api/internal-auth') return route.fulfill({status:200,json:{ok:true,authenticated:true,user:{name:'QA',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['payroll.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare'],platformCapabilities:[],platformRoles:[]}}});
      return route.fulfill({status:200,json:{ok:true,data:[]}});
    }
    if (live) return route.continue();
    const file = path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404,body:''});
    return route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage(); page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/novedades-nomina.html');await page.locator('#entrySection:visible').waitFor();await page.locator('#preflightButton:enabled').waitFor();
  await page.locator('#periodMonth').fill('2026-09');await page.locator('[name=sourceMode][value=bulk]').check();
  const file=page.locator('#bulkFile'),format=page.locator('#bulkFormat');
  const upload=async(text,name='novedades-qa.txt',bytes=null)=>{await file.setInputFiles({name,mimeType:'text/plain',buffer:bytes??Buffer.from(text)});await page.locator('#messageHost').filter({hasText:'Archivo leído, sin guardar'}).waitFor();};
  const check=async()=>{await page.locator('#preflightButton').click();await page.locator('#previewPanel:visible').waitFor();};
  const save=async()=>{const count=posts.length;await page.locator('#prepareButton').click();await page.locator('#messageHost').filter({hasText:'Lote creado y auditado'}).waitFor();assert.equal(posts.length,count+1);return posts.at(-1).body.payload;};
  await upload(csv([values()]));await check();assert.equal(posts.length,0);assert.equal(await page.locator('[data-review-row]').count(),1);let draft=await save();assert.equal(draft.sourceMode,'bulk');assert.equal(draft.rows[0].quantityDecimal,'1');assert.equal(draft.rows[0].amountCents,null);checks.push('El mismo TXT antes rechazado se lee, valida y crea un lote por el endpoint vigente, sin importar antes de confirmar.');
  await format.selectOption('columns');await page.locator('#bulkLayout').selectOption('both');
  const txt=Array.from({length:60},(_,i)=>[String(i+1001),'44','1',i%2?'':'0'].join(';')).join('\r\n');await upload(txt);await check();assert.equal(await page.locator('[data-review-row]').count(),25);assert.match(await page.locator('#reviewRange').innerText(),/de 60/);
  await page.locator('#reviewSearch').fill('no existe');assert.equal(await page.locator('[data-review-row]').count(),0);draft=await save();assert.equal(draft.rows.length,60);assert.equal(draft.rows[0].amountCents,'0');assert.equal(draft.rows[1].amountCents,null);checks.push('TXT de 60 registros crea los 60 aunque la vista esté filtrada y paginada; nulos y ceros son distintos.');
  await upload('1001;44;1;\n1001;44;2;\nbad;44;1;\n1003;44;;');await page.locator('#preflightButton').click();await page.locator('#noveltyIssuesPanel:visible').waitFor();assert.equal(await page.locator('#noveltyIssueRows tr').count(),3);assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('[data-review-row]').count(),0);checks.push('Duplicados y filas inválidas se muestran juntos y bloquean todo el lote, sin omisiones.');
  await page.locator('#bulkLayout').selectOption('commonQuantity');await page.locator('#bulkCommonConcept').fill('44');await page.locator('#bulkSeparator').selectOption('tab');await page.locator('#bulkHasHeader').check();await upload('legajo\tunidades\r\n00001001\t25\r\n1002\t0\r\n');await check();draft=await save();assert.deepEqual(draft.rows.map(r=>[r.legajo,r.conceptSourceId,r.quantityDecimal,r.amountCents]),[['1001','44','25',null],['1002','44','0',null]]);checks.push('Tabulaciones y encabezado explícito; concepto común, cantidades y relleno numérico procesados sin perder precisión.');
  const nextDownload=page.waitForEvent('download');await page.locator('#bulkTemplate').click();await(await nextDownload).saveAs(out+'/plantilla.txt');assert.equal(fs.readFileSync(out+'/plantilla.txt','utf8'),'\ufefflegajo\tunidades\r\n');checks.push('Plantilla del layout elegido contiene únicamente encabezado, sin empleados ni importes simulados.');
  await format.selectOption('retro');await page.locator('#bulkCommonConcept').fill('678');await upload('00001001'+'0000123.45'+'\r\n'+'00001002'+'0000000.00');await check();draft=await save();assert.deepEqual(draft.rows.map(r=>[r.legajo,r.conceptSourceId,r.quantityDecimal,r.amountCents]),[['1001','678',null,'12345'],['1002','678',null,'0']]);checks.push('RETRO de 18 caracteres usa legajo de 8 y monto decimal de 10; crea filas completas y conserva cero.');
  await upload('00001001'+'0000123.45'+'EXTRA');await page.locator('#preflightButton').click();await page.locator('#noveltyIssuesPanel:visible').waitFor();assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.match(await page.locator('#noveltyIssueRows').innerText(),/18/);checks.push('Un TXT de otro ancho no se recorta ni se trata como RETRO por su nombre.');
  await format.selectOption('fixed');await page.locator('#bulkRecordWidth').fill('13');await page.locator('#bulkValueLength').fill('5');await page.locator('#bulkValueKind').selectOption('quantity');await page.locator('#bulkDecimal').selectOption('implied');await page.locator('#bulkScale').fill('2');await page.locator('#bulkCommonConcept').fill('44');await upload('0000100102500');await check();draft=await save();assert.equal(draft.rows[0].quantityDecimal,'25.00');assert.equal(draft.rows[0].amountCents,null);checks.push('Posiciones explícitas para legajo y cantidad con escala declarada: no se calcula dinero ni se adivina la unidad.');
  await check();await page.locator('#bulkCommonConcept').fill('95');assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('[data-review-row]').count(),0);await check();draft=await save();assert.equal(draft.rows[0].conceptSourceId,'95');checks.push('Cambiar concepto o configuración retira el borrador previo antes de crear otro.');
  await format.selectOption('csv');const ansi=Buffer.from(csv([values('1001','','Fundamento español: año 2026')]),'latin1');await file.setInputFiles({name:'ansi.txt',mimeType:'text/plain',buffer:ansi});await page.locator('#messageHost').filter({hasText:'Codificación no válida'}).waitFor();assert.equal(await page.locator('#bulkSource').inputValue(),'');await page.locator('#bulkEncoding').selectOption('windows-1252');assert.equal(await file.inputValue(),'');await upload('', 'ansi.txt',ansi);await check();draft=await save();assert.match(draft.rows[0].observation,/español: año/);checks.push('ANSI requiere elección expresa y relectura; conserva ñ y no reemplaza bytes inválidos automáticamente.');
  await page.locator('#bulkEncoding').selectOption('utf-8');await upload('\ufeff'+csv([values('1001')]));await check();const before=posts.length;rejectNext=true;await page.locator('#prepareButton').click();await page.locator('#messageHost').filter({hasText:'La confirmación del envío está pendiente'}).waitFor();await page.locator('#nativeMonthlyRetry:enabled').waitFor();await page.locator('#nativeMonthlyRetry').click();await page.locator('#messageHost').filter({hasText:'Lote creado y auditado'}).waitFor();assert.equal(posts.length,before+2);assert.equal(posts[before].key,posts[before+1].key);assert.deepEqual(posts[before].body,posts[before+1].body);checks.push('Respuesta de guardado perdida: se conserva el mismo cuerpo y clave, sin crear un nuevo intento ni duplicar el lote.');
  await upload(csv([values()]));await check();await file.setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.alloc(480*1024+1,65)});assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('#bulkSource').inputValue(),'');checks.push('Tamaño inválido retira todos los datos y la aprobación local anterior.');
  for(const width of [1440,390,320]){await format.selectOption('fixed');await page.setViewportSize({width,height:950});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok((await page.locator('#bulkFormat').boundingBox()).height>=40);await page.locator('#bulkFormat').focus();await page.locator('#bulkFields').screenshot({path:out+'/txt-'+width+'.png'});}
  checks.push('Opciones de formato y campos legibles a 320/390 píxeles, sin desbordar la página.');
  await format.selectOption('csv');await page.evaluate(()=>{window.__txtReaders=[];window.FileReader=class extends EventTarget{readyState=0;result=null;readAsArrayBuffer(blob){this.readyState=1;__txtReaders.push(this);blob.arrayBuffer().then(b=>this.buffer=b);}abort(){this.readyState=2;}finish(){this.result=this.buffer;this.readyState=2;this.dispatchEvent(new Event('load'));}};});
  await file.setInputFiles({name:'late.txt',mimeType:'text/plain',buffer:Buffer.from(csv([values('1111')]))});await page.waitForFunction(()=>__txtReaders[0]?.buffer);await format.selectOption('retro');await page.evaluate(()=>__txtReaders[0].finish());assert.equal(await page.locator('#bulkSource').inputValue(),'');assert.equal(await page.locator('#prepareButton').isDisabled(),true);checks.push('Cambiar formato mientras lee invalida el FileReader anterior y no restaura valores con otro formato.');
  await format.selectOption('csv');await file.setInputFiles({name:'late-access.txt',mimeType:'text/plain',buffer:Buffer.from(csv([values('1112')]))});await page.waitForFunction(()=>__txtReaders[1]?.buffer);canPrepare=false;await page.locator('#refreshButton').click();await page.locator('#readOnlySection:visible').waitFor();await page.evaluate(()=>__txtReaders[1].finish());assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('#bulkSource').inputValue(),'');checks.push('La retirada del permiso impide que una lectura tardía repueble la carga masiva.');
  assert.deepEqual(errors,[]);const result={ok:true,checksPassed:checks.length,checks,errors,postRequestsIntercepted:posts.length,productionApiWrites:0,realMunicipalSessionTested:false,originalNoeliaTxtTested:false,liveAssets:live};fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch(e){fs.writeFileSync(out+'/error.txt',String(e.stack));throw e;} finally{await browser.close();}
