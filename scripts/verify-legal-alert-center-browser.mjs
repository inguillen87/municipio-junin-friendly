// Presentation verification only: every private API is intercepted, including in --published mode.
// Synthetic data lives in this process and browser memory; no municipal session or database is used.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const published=process.argv.includes('--published');
const origin=new URL(process.env.LEGAL_ALERT_CENTER_ORIGIN||(published?'https://municipio-junin-friendly.vercel.app':'https://legal-alerts.test')).origin;
assert.match(origin,/^https?:\/\//,'The browser origin must use HTTP or HTTPS.');
const root=path.resolve('public');
const out=path.resolve('verification/legal-alert-center-'+(published?'published':'local'));
fs.mkdirSync(out,{recursive:true});
const uuid=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const NORM=uuid(1001),CONTRACT=uuid(1002);
function fixture(count=61){
  const rows=Array.from({length:count},(_,i)=>{
    const followup=i%2===Math.floor(i/6)%2,category=i%6;
    return {
      sourceType:followup?'followup':'contract_obligation',itemId:uuid(i+1),itemVersion:2,
      title:(followup?'Seguimiento sintético ':'Entrega técnica sintética ')+(i+1),
      dueDate:['2026-09-20','2026-09-21','2026-09-28','2026-09-29','','2026-09-20'][category],
      status:category===5?(followup?(Math.floor(i/12)%2?'done':'cancelled'):['breached_observed','fulfilled_observed','waived','cancelled'][Math.floor(i/12)%4]):'open',
      responsibleLabel:followup?'':'Responsable sintético',sourceId:followup?NORM:CONTRACT,
      sourceVersion:followup?7:2,sourceKind:followup?'ordenanza':'servicio',
      sourceNumber:followup?'9000':'C-001',sourceYear:followup?1899:2026,
      sourceTitle:followup?'Norma histórica sintética':'Contrato sintético',
      recordedAt:'2026-09-20T20:00:00Z'
    };
  });
  return {version:'legal-alert-center.v1',today:'2026-09-21',timezone:'America/Argentina/Mendoza',limit:1500,population:rows.length,revision:'a'.repeat(64),rows};
}

let data=fixture(),failure=0,malformed=false,hasCapability=true;
const checks=[],errors=[],unexpectedRequests=[],apiRequests=[],downloads=[];
const browser=await chromium.launch({headless:true});
let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='GET'){
      unexpectedRequests.push({method:request.method(),path:url.pathname});
      return route.abort();
    }
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,access:{tenantCapabilities:hasCapability?['legal.norm.read']:[],platformCapabilities:[],platformRoles:[]}}});
    if(url.pathname.startsWith('/api/')){
      if(url.pathname!=='/api/internal-legal-alert-center'||url.search!=='?resource=alerts'){
        unexpectedRequests.push({method:request.method(),path:url.pathname+url.search});
        return route.abort();
      }
      apiRequests.push({method:request.method(),path:url.pathname+url.search});
      if(failure)return route.fulfill({status:failure,json:{ok:false,error:failure===503?'No se pudieron actualizar las alertas. Reintentá en un momento.':'Acceso no disponible.'}});
      const payload=malformed?{...data,population:data.population+1}:data;
      return route.fulfill({json:{ok:true,data:payload},headers:{'Cache-Control':'private, no-store'}});
    }
    if(published)return route.continue();
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:({'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
  });
  page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('download',download=>downloads.push(download.suggestedFilename()));
  const app=page.locator('#legalAlertRoot');
  const cards=app.locator('article.lac-card');
  const refresh=()=>app.getByRole('button',{name:'Actualizar alertas',exact:true}).click();
  const ready=()=>page.waitForFunction(()=>document.querySelector('#legalAlertRoot')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.lac-categories button').length===7);
  const cleared=async()=>{
    await page.waitForFunction(()=>document.querySelector('#legalAlertRoot')?.getAttribute('aria-busy')==='false'&&!document.querySelector('article.lac-card,.lac-categories'));
    assert.equal(await cards.count(),0);
    assert.equal(await app.locator('.lac-categories').count(),0);
  };
  const open=async()=>{await page.goto(origin+'/internal-legal-alert-center.html');await ready();};

  await open();
  assert.equal(await cards.count(),25);
  for(const [name,count] of [['Todos',61],['Fecha pasada',11],['Hoy',10],['Próximos 7 días',10],['Más adelante',10],['Sin fecha',10],['Cerrados o cancelados',10]]){
    assert.equal(await app.getByRole('button',{name:name+' · '+count,exact:true}).count(),1);
  }
  assert.ok((await app.innerText()).includes('1899'));
  assert.doesNotMatch(await app.innerText(),/breached_observed|fulfilled_observed/);
  assert.ok((await app.innerText()).includes('No significa automáticamente'));
  checks.push('61 synthetic records from both sources have complete exclusive counts, historical normative years and descriptive Spanish states');

  await app.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await cards.count(),25);
  await app.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await cards.count(),11);
  assert.ok(await app.getByRole('button',{name:'Siguiente',exact:true}).isDisabled());
  await app.getByRole('button',{name:'Anterior',exact:true}).click();
  assert.equal(await cards.count(),25);
  checks.push('25-card pagination visits all 61 results without truncating counts');

  await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('followup');
  assert.equal(await cards.count(),25);
  assert.ok((await app.innerText()).includes('31 resultados'));
  assert.equal(await app.getByRole('button',{name:'Todos · 31',exact:true}).count(),1);
  assert.ok((await cards.allTextContents()).every(text=>text.includes('Seguimiento normativo')));
  const followupLink=new URL(await cards.first().getByRole('link',{name:'Abrir recurso',exact:true}).getAttribute('href'),origin);
  assert.equal(followupLink.pathname,'/internal-legal-followups.html');
  assert.deepEqual(Object.fromEntries(followupLink.searchParams),{norma:NORM,version:'7',seguimiento:uuid(1)});
  await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('contract_obligation');
  assert.ok((await app.innerText()).includes('30 resultados'));
  assert.equal(await app.getByRole('button',{name:'Todos · 30',exact:true}).count(),1);
  assert.ok((await cards.allTextContents()).every(text=>text.includes('Obligación contractual')));
  const obligationLink=new URL(await cards.first().getByRole('link',{name:'Abrir recurso',exact:true}).getAttribute('href'),origin);
  assert.equal(obligationLink.pathname,'/internal-legal-contract-obligations.html');
  assert.deepEqual(Object.fromEntries(obligationLink.searchParams),{contrato:CONTRACT});
  checks.push('source filters reset pagination; followups preserve exact item and historical version while obligations link to their contract list');

  await app.getByRole('button',{name:'Limpiar',exact:true}).click();
  await app.getByRole('searchbox').fill('tecnica');
  await app.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.ok((await app.innerText()).includes('30 resultados'));
  await app.getByRole('button',{name:/^Hoy ·/}).click();
  assert.equal(await cards.count(),5);
  await app.getByRole('searchbox').fill('sin coincidencias sintéticas');
  await app.getByRole('button',{name:'Aplicar',exact:true}).click();
  await app.getByRole('heading',{name:'Sin resultados',exact:true}).waitFor();
  assert.equal(await cards.count(),0);
  checks.push('accent-insensitive search combines with category filters and has a distinct no-match state');

  await app.getByRole('button',{name:'Limpiar',exact:true}).click();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at '+width+'px');
    for(const height of await app.locator('.lac-categories button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height)))assert.ok(height>=44);
    await page.screenshot({path:path.join(out,'alerts-'+width+'.png')});
    await cards.first().screenshot({path:path.join(out,'alert-card-'+width+'.png')});
  }
  checks.push('desktop, 390px and 320px retain readable categories, 44px actions and no horizontal overflow');

  failure=503;
  await refresh();
  await cleared();
  assert.ok((await app.getByRole('status').innerText()).includes('Reintentá'));
  failure=0;
  await refresh();
  await ready();
  assert.equal(await cards.count(),25);
  checks.push('failed refresh removes stale rows and counts; a new read recovers the current data');

  malformed=true;
  await refresh();
  await cleared();
  assert.ok((await app.getByRole('status').innerText()).length>0);
  malformed=false;
  data=fixture(0);
  await refresh();
  await ready();
  await app.getByRole('heading',{name:'Sin resultados',exact:true}).waitFor();
  assert.ok((await app.innerText()).includes('No se muestran ejemplos ficticios'));
  assert.equal(await cards.count(),0);
  assert.equal(await app.getByRole('button',{name:'Todos · 0',exact:true}).count(),1);
  checks.push('malformed response fails closed; a verified empty source stays empty without municipal examples');

  data=fixture();
  await refresh();
  await ready();
  const previousCalls=apiRequests.length;
  data.rows[0].title='Seguimiento sintético actualizado al volver';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await app.getByRole('heading',{name:data.rows[0].title,exact:true}).waitFor();
  assert.ok(apiRequests.length>previousCalls);
  await ready();
  const beforeVisible=apiRequests.length;
  data.rows[0].title='Seguimiento sintético actualizado al mostrar';
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await app.getByRole('heading',{name:data.rows[0].title,exact:true}).waitFor();
  assert.ok(apiRequests.length>beforeVisible);
  checks.push('returning focus and visibility revalidate the current alert data');

  for(const status of [401,403]){
    failure=status;
    await refresh();
    await cleared();
    assert.ok((await app.getByRole('status').innerText()).includes('acceso cambió'));
    assert.equal(await app.getByRole('searchbox').count(),0);
    assert.equal(await app.getByRole('combobox').count(),0);
    assert.equal(await app.getByRole('button',{name:'Actualizar alertas',exact:true}).count(),0);
    assert.ok(!(await app.innerText()).includes('sintético'));
    failure=0;
    await open();
  }
  checks.push('401 and 403 revoke rows, counts, search and refresh controls without preserving private synthetic content');

  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set()}})));
  await cleared();
  assert.ok((await app.getByRole('status').innerText()).includes('acceso cambió'));
  assert.ok(!(await app.innerText()).includes('sintético'));
  await open();
  checks.push('a shared capability revocation immediately scrubs the displayed alert content');

  for(const search of ['?tenant=other','?resource=alerts','?source=followup&source=contract_obligation']){
    const before=apiRequests.length;
    await page.goto(origin+'/internal-legal-alert-center.html'+search);
    await app.getByRole('status').filter({hasText:'no acepta'}).waitFor();
    assert.equal(apiRequests.length,before);
    assert.equal(await cards.count(),0);
  }
  hasCapability=false;
  const beforeDenied=apiRequests.length;
  await page.goto(origin+'/internal-legal-alert-center.html');
  await app.getByRole('status').filter({hasText:'No tenés acceso'}).waitFor();
  assert.equal(apiRequests.length,beforeDenied);
  checks.push('untrusted URL context and absent read capability stop before requesting alert data');

  assert.deepEqual(errors,[]);
  assert.deepEqual(unexpectedRequests,[]);
  assert.deepEqual(downloads,[]);
  checks.push('all observed requests are GET; private APIs are mocked and no download or mutation occurs');
  const result={ok:true,checksPassed:checks.length,checks,published,origin,syntheticGetResponses:true,privateApisIntercepted:true,realMunicipalSessionTested:false,realDatabaseTested:false,mutationRequests:0,realMunicipalWrites:0};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}catch(error){
  if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:false,checks,error:error.message,errors,unexpectedRequests,published,syntheticGetResponses:true,privateApisIntercepted:true,realMunicipalSessionTested:false,realDatabaseTested:false},null,2));
  throw error;
}finally{
  await browser.close();
}
