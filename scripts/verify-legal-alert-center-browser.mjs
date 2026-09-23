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
    const sourceType=['followup','contract_obligation','matter'][Math.floor(i/6)%3],followup=sourceType==='followup',matter=sourceType==='matter',norm=followup||matter,category=i%6;
    const assigned=norm&&i!==1&&i!==4;
    return {
      sourceType,itemId:uuid(i+1),itemVersion:2,
      title:(matter?'Asunto sintético ':followup?'Seguimiento sintético ':'Entrega técnica sintética ')+(i+1),
      dueDate:['2026-09-20','2026-09-21','2026-09-28','2026-09-29','','2026-09-20'][category],
      status:matter?(category===5?(Math.floor(i/18)%2?'closed':'cancelled'):['assigned','in_review','returned','responded','reviewed'][category]):category===5?(followup?(Math.floor(i/12)%2?'done':'cancelled'):['breached_observed','fulfilled_observed','waived','cancelled'][Math.floor(i/12)%4]):'open',
      responsibleLabel:norm?(assigned?'Persona coordinadora sintética':''):'Responsable sintético',sourceId:norm?NORM:CONTRACT,
      sourceVersion:norm?7:2,sourceKind:norm?'ordenanza':'servicio',
      sourceNumber:norm?'9000':'C-001',sourceYear:norm?1899:2026,
      sourceTitle:norm?'Norma histórica sintética':'Contrato sintético',
      recordedAt:'2026-09-20T20:00:00Z',responsibleId:assigned?uuid(5001):null,responsibleEligible:assigned?i!==2:null,
      nextAction:!norm||i===4||matter&&category===5?'':matter?'Revisar documentación del asunto':'Consultar expediente normativo',
      coordinationRevision:followup&&i!==4?1:0,coordinationFollowupVersion:followup&&i!==4?(i===0?1:2):0,
      owningArea:matter?'Asesoría jurídica':''
    };
  });
  return {version:'legal-alert-center.v2',today:'2026-09-21',timezone:'America/Argentina/Mendoza',limit:1500,population:rows.length,revision:'a'.repeat(64),rows};
}

let data=fixture(),failure=0,malformed=false,hasCapability=true,delayNext=false,releaseDelayed;
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
      if(url.pathname!=='/api/internal-legal-alert-center'||url.search!=='?resource=alerts&version=2'){
        unexpectedRequests.push({method:request.method(),path:url.pathname+url.search});
        return route.abort();
      }
      apiRequests.push({method:request.method(),path:url.pathname+url.search});
      if(delayNext){delayNext=false;await new Promise(resolve=>releaseDelayed=resolve);}
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
  assert.ok((await cards.first().innerText()).includes('Coordinación pendiente de revisión'));
  assert.ok((await cards.nth(1).innerText()).includes('Sin asignar'));
  assert.ok((await cards.nth(1).innerText()).includes('Consultar expediente normativo'));
  assert.ok((await cards.nth(2).innerText()).includes('no está habilitada actualmente'));
  assert.ok(!(await cards.nth(2).innerText()).includes('Sin asignar'));
  assert.equal(await cards.nth(4).locator('.lac-coordination').count(),0);
  checks.push('61 v2 synthetic records from three sources have complete exclusive counts, historical normative years and descriptive Spanish states');
  checks.push('prior followup coordination is explicitly pending review; removed and currently ineligible assignees are distinguished without reassignment');

  await app.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await cards.count(),25);
  await app.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await cards.count(),11);
  assert.ok(await app.getByRole('button',{name:'Siguiente',exact:true}).isDisabled());
  await app.getByRole('button',{name:'Anterior',exact:true}).click();
  assert.equal(await cards.count(),25);
  checks.push('25-card pagination visits all 61 results without truncating counts');

  await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('followup');
  assert.equal(await cards.count(),24);
  assert.ok((await app.innerText()).includes('24 resultados'));
  assert.equal(await app.getByRole('button',{name:'Todos · 24',exact:true}).count(),1);
  assert.ok((await cards.allTextContents()).every(text=>text.includes('Seguimiento normativo')));
  const followupLink=new URL(await cards.first().getByRole('link',{name:'Abrir recurso',exact:true}).getAttribute('href'),origin);
  assert.equal(followupLink.pathname,'/internal-legal-followups.html');
  assert.deepEqual(Object.fromEntries(followupLink.searchParams),{norma:NORM,version:'7',seguimiento:uuid(1)});
  await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('contract_obligation');
  assert.ok((await app.innerText()).includes('19 resultados'));
  assert.equal(await app.getByRole('button',{name:'Todos · 19',exact:true}).count(),1);
  assert.ok((await cards.allTextContents()).every(text=>text.includes('Obligación contractual')));
  const obligationLink=new URL(await cards.first().getByRole('link',{name:'Abrir recurso',exact:true}).getAttribute('href'),origin);
  assert.equal(obligationLink.pathname,'/internal-legal-contract-obligations.html');
  assert.deepEqual(Object.fromEntries(obligationLink.searchParams),{contrato:CONTRACT});
  await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('matter');
  assert.equal(await cards.count(),18);
  assert.equal(await app.getByRole('button',{name:'Todos · 18',exact:true}).count(),1);
  for(const name of ['Fecha pasada','Hoy','Próximos 7 días','Más adelante','Sin fecha','Cerrados o cancelados'])assert.equal(await app.getByRole('button',{name:name+' · 3',exact:true}).count(),1);
  assert.ok((await cards.allTextContents()).every(text=>text.includes('Asunto jurídico')));
  const matterLink=new URL(await cards.first().getByRole('link',{name:'Abrir recurso',exact:true}).getAttribute('href'),origin);
  assert.equal(matterLink.pathname,'/internal-legal-matters.html');
  assert.deepEqual(Object.fromEntries(matterLink.searchParams),{asunto:uuid(13)});
  assert.ok((await cards.first().innerText()).includes('Versión de fuente 7'));
  assert.ok((await cards.first().innerText()).includes('Asesoría jurídica'));
  assert.ok((await cards.first().innerText()).includes('Revisar documentación del asunto'));
  for(const state of ['Asignado','En revisión','Devuelto con observaciones','Respondido con evidencia','Revisado'])assert.ok((await app.innerText()).includes('Estado registrado: '+state));
  checks.push('source filters reset pagination; matters link to the exact matter, followups preserve exact item and normative version, and obligations retain their contract link');
  checks.push('five pending matter states retain date categories; only closed and cancelled resolve, with explicit area and next action');

  await app.getByRole('button',{name:'Limpiar',exact:true}).click();
  await app.getByRole('searchbox').fill('tecnica');
  await app.getByRole('button',{name:'Aplicar',exact:true}).click();
  assert.ok((await app.innerText()).includes('19 resultados'));
  await app.getByRole('button',{name:/^Hoy ·/}).click();
  assert.equal(await cards.count(),3);
  await app.getByRole('searchbox').fill('sin coincidencias sintéticas');
  await app.getByRole('button',{name:'Aplicar',exact:true}).click();
  await app.getByRole('heading',{name:'Sin resultados',exact:true}).waitFor();
  assert.equal(await cards.count(),0);
  checks.push('accent-insensitive search combines with category filters and has a distinct no-match state');

  for(const query of ['asesoria','documentacion del asunto','respondido con evidencia']){
    await app.getByRole('button',{name:'Limpiar',exact:true}).click();
    await app.getByRole('searchbox').fill(query);
    await app.getByRole('button',{name:'Aplicar',exact:true}).click();
    assert.equal(await cards.count(),query==='asesoria'?18:query==='documentacion del asunto'?15:3);
    assert.ok((await cards.allTextContents()).every(text=>text.includes('Asunto jurídico')));
  }
  checks.push('area, next action and displayed matter state participate in normalized search over the full population');

  await app.getByRole('button',{name:'Limpiar',exact:true}).click();
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at '+width+'px');
    for(const height of await app.locator('.lac-categories button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height)))assert.ok(height>=44);
    await page.screenshot({path:path.join(out,'alerts-'+width+'.png')});
    await cards.first().screenshot({path:path.join(out,'alert-card-'+width+'.png')});
    await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('matter');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Matter overflow at '+width+'px');
    await cards.first().screenshot({path:path.join(out,'matter-card-'+width+'.png')});
    await app.getByRole('combobox',{name:'Fuente',exact:true}).selectOption('all');
  }
  checks.push('desktop, 390px and 320px retain readable categories, 44px actions and no horizontal overflow');

  failure=503;
  await app.getByRole('searchbox').fill('Persona coordinadora sintética');
  await refresh();
  await cleared();
  assert.ok((await app.getByRole('status').innerText()).includes('Reintentá'));
  failure=0;
  await refresh();
  await ready();
  assert.equal(await cards.count(),25);
  assert.equal(await app.getByRole('searchbox').inputValue(),'Persona coordinadora sintética');
  await app.getByRole('button',{name:'Limpiar',exact:true}).click();
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

  data={...fixture(),version:'legal-alert-center.v1'};
  await refresh();await cleared();
  data=fixture(1500);await refresh();await ready();
  assert.equal(await cards.count(),25);assert.equal(await app.getByRole('button',{name:'Todos · 1500',exact:true}).count(),1);
  assert.ok((await app.innerText()).includes('página 1 de 60'));
  await app.getByRole('searchbox').fill(data.rows[1499].title);await app.getByRole('button',{name:'Aplicar',exact:true}).click();assert.equal(await cards.count(),1);
  data=fixture(1501);await refresh();await cleared();
  checks.push('v1 downgrade is rejected; all 1500 records are searchable with 25-card pages, while 1501 is rejected without truncation');

  data=fixture();
  await refresh();
  await ready();
  await app.getByRole('button',{name:'Limpiar',exact:true}).click();
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

  delayNext=true;const pendingRefresh=refresh();
  await page.waitForFunction(()=>document.querySelector('#legalAlertRoot')?.getAttribute('aria-busy')==='true');
  const waitingSince=Date.now();while(!releaseDelayed){assert.ok(Date.now()-waitingSince<15000,'The delayed refresh request did not arrive.');await new Promise(resolve=>setTimeout(resolve,5));}
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set()}})));
  releaseDelayed();releaseDelayed=null;await pendingRefresh;await cleared();
  assert.ok(!(await app.innerText()).includes('sintético'));assert.equal(await app.getByRole('searchbox').count(),0);
  await open();
  checks.push('a response arriving after shared capability revocation cannot restore rows, assignees, actions or filters');

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
  await app.getByRole('status').filter({hasText:'acceso cambió'}).waitFor();
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
