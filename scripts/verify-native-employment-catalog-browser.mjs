// Existing Personas page, compiled assets, and exclusively intercepted synthetic APIs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {chromium} from 'playwright';
import '../assets/app-routes.js';
import {catalogItems,catalogProposalInput,catalogReviewInput,CATALOG_VERSION} from '../assets/native-employment-catalog-model.js';
assert.ok(process.argv.slice(2).length===0||(process.argv.length===3&&process.argv[2]==='--published'),'Only --published is supported');
const published=process.argv.includes('--published'),base=path.resolve('public'),out=path.resolve('verification/native-employment-catalog'+(published?'-published':''));fs.mkdirSync(out,{recursive:true});
const origin=published?'https://municipio-junin-friendly.vercel.app':'https://employment-catalog.invalid',API='/api/internal-employment-catalog',hash=s=>createHash('sha256').update(s).digest('hex'),publishedAssets=new Map();
const git=(...args)=>execFileSync('git',args,{maxBuffer:8*1024*1024});
const canonicalBytes=(file,bytes)=>/\.(?:html|[cm]?js|css|svg|json|webmanifest|txt)$/.test(file)?Buffer.from(bytes.toString('utf8').replace(/\r\n?/g,'\n')):bytes;
const sourceCommit=published?git('rev-parse','HEAD').toString().trim():null;
function assertReviewedHead(){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(git('rev-parse','HEAD').toString().trim(),sourceCommit,'HEAD_CHANGED');
 assert.equal(git('status','--porcelain=v1','--untracked-files=all').toString().trim(),'','PUBLISHED_CHECK_REQUIRES_CLEAN_HEAD');
}
// The public directory is ignored by Git. Reconstruct its limited page recipe
// from committed blobs instead of trusting a possibly stale local build.
function preparePublishedPins(){
 const recipeHashes={},expected=new Map(),sources=new Map();
 const read=file=>{assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.startsWith('/')&&!file.split('/').some(p=>!p||p==='.'||p==='..'));if(!sources.has(file))sources.set(file,git('show',sourceCommit+':'+file));return sources.get(file);};
 const recipe=file=>{const bytes=canonicalBytes(file,read(file));recipeHashes[file]=hash(bytes);return bytes.toString('utf8');};
 const build=recipe('scripts/build-friendly.mjs'),metadata=recipe('scripts/apply-friendly-social-metadata.mjs'),routes=recipe('assets/app-routes.js');
 const context=vm.createContext({URL});new vm.Script(routes).runInContext(context,{timeout:1000});
 assert.ok(!/^import\b/m.test(metadata),'BUILD_METADATA_IMPORT_CHANGED');new vm.Script(metadata.replace(/^export /gm,'')).runInContext(context,{timeout:1000});
 const routeFunction=build.slice(build.indexOf('function applyCleanRouteLinks(')),start=build.indexOf('  const branded ='),end=build.indexOf('\n}\n\nawait buildLegalRegistry',start);
 assert.ok(start>0&&end>start&&routeFunction.startsWith('function applyCleanRouteLinks('),'BUILD_RECIPE_CHANGED');
 const body=build.slice(start,end).replace(/fs\.writeFileSync\(destination, (.+)\);$/,'return $1;');assert.ok(!body.includes('fs.')&&body.includes('return routed.replaceAll'),'BUILD_RECIPE_IO_UNSUPPORTED');
 new vm.Script(routeFunction+'\nfunction renderReviewed(original,file,identityVersion){\n'+body+'\n}').runInContext(context,{timeout:1000});
 const pwaBlock=/const pwaFiles = \[([\s\S]*?)\n\];/.exec(build);assert.ok(pwaBlock,'PWA_RECIPE_CHANGED');
 const icons=[...pwaBlock[1].matchAll(/'(assets\/pwa\/[^']+)'/g)].map(m=>m[1]);assert.equal(icons.length,5,'PWA_ICONS_CHANGED');
 const identityHash=createHash('sha256');for(const file of icons)identityHash.update(file).update(read(file));const identity='identity-'+identityHash.digest('hex').slice(0,12);
 for(const file of ['internal-dashboard.html','assets/municontrol-enterprise.css']){
  context.original=canonicalBytes(file,read(file)).toString('utf8');context.file=file;context.identity=identity;
  expected.set(file,Buffer.from(new vm.Script('renderReviewed(original,file,identity)').runInContext(context,{timeout:1000})));
 }
 for(const file of icons)expected.set(file.replace('assets/pwa/','assets/pwa/'+identity+'/'),read(file));
 const sourceHashes={};
 const forFile=file=>{const bytes=canonicalBytes(file,expected.get(file)||read(file));sourceHashes[file]=hash(bytes);return bytes;};
 return {forFile,recipeHashes,sourceHashes,comparison:'text UTF-8 with CRLF/LF normalized; binary exact'};
}
if(published)assertReviewedHead();
const publishedPins=published?preparePublishedPins():null;
for(const file of ['assets/native-employment-catalog.js','assets/native-employment-catalog.css','assets/native-employment-catalog-model.js'])assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(base,file))),'BUILD_STALE:'+file);
const make=(kind,code,label,agreementCode=null)=>({kind,key:`${kind}:${agreementCode||''}:${code}`,code,label,agreementCode});
const initial=catalogItems([make('agreements','1','Convenio de prueba'),make('categories','3','Clase inicial','1'),make('organizations','2','Sector de prueba'),make('sectors','4','Repartición inicial'),make('sectors','5','Repartición retirable')]);
let catalog={items:structuredClone(initial),version:'a'.repeat(64),origin:'GRH',revision:0,publishedAt:null},scopeVersion='f'.repeat(64),actor='maker',authSession='session-1',authDenied=false,read=true,canPropose=true,canReview=true,mode='ok',proposalNumber=0,historyTruncated=false,hold=null;
const proposals=new Map(),receipts=new Map(),posts=[],calls=[],checks=[],errors=[],routeErrors=[],assets={};
const capabilities=()=>[...(read?['workforce.employee.read']:[]),...(canPropose?['employee.catalog.propose']:[]),...(canReview?['employee.catalog.approve']:[])];
const summary=p=>({id:p.id,status:p.status,reason:p.reason,createdAt:p.createdAt,authorLabel:p.authorLabel,baseVersion:p.baseVersion,canReview:read&&canReview&&p.author!==actor&&p.status==='pending'});
const bootstrap=()=>({version:CATALOG_VERSION,scopeVersion,catalog:structuredClone(catalog),permissions:{canPropose:read&&canPropose,canReview:read&&canReview},proposals:[...proposals.values()].reverse().slice(0,20).map(summary),historyTruncated});
const receipt=(op,p)=>({version:CATALOG_VERSION,operation:op,proposalId:p.id,status:p.status,catalogVersion:catalog.version,revision:catalog.revision,replayed:false});
const held=new Set();
function suspend(kind){let enter,release,finish;const h={kind,entered:new Promise(r=>enter=r),wait:new Promise(r=>release=r),finished:new Promise(r=>finish=r),enter:()=>enter(),release:()=>release(),finish:()=>{held.delete(h);finish();}};hold=h;held.add(h);return h;}
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  try{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/')){
    assert.equal(req.method(),'GET');const canonical=globalThis.MuniControlRoutes.resolve(url.href,origin),file=path.resolve(base,canonical?.file||'.'+url.pathname);
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    let bytes=fs.readFileSync(file);
    if(published){
     // Every API remains intercepted. Only public document/assets use credential-free GETs.
     assert.ok(url.pathname==='/personal'||url.pathname.startsWith('/assets/'),'PUBLIC_PATH_OUT_OF_SCOPE');
     const relative=path.relative(base,file).split(path.sep).join('/'),expected=publishedPins.forFile(relative);assert.deepEqual(canonicalBytes(relative,bytes),expected,'Local build differs from Git recipe: '+relative);
     if(!publishedAssets.has(url.pathname)){const response=await fetch(origin+url.pathname,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,'Published status: '+url.pathname);publishedAssets.set(url.pathname,Buffer.from(await response.arrayBuffer()));}
     const served=publishedAssets.get(url.pathname);assert.deepEqual(canonicalBytes(relative,served),expected,'Published bytes differ from Git recipe: '+url.pathname);bytes=served;
    }
    assets[url.pathname]=hash(bytes);return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:bytes});
   }
   calls.push({path:url.pathname,resource:url.searchParams.get('resource'),method:req.method()});
   if(url.pathname==='/api/internal-auth')return route.fulfill(authDenied?{status:401,json:{ok:false,code:'SESSION_INVALID'}}:{status:200,json:{ok:true,authenticated:true,user:{id:authSession,email:actor+'@example.invalid',role:'ADMIN_INTERNO'},access:{tenant:{id:'qa-tenant',roleKey:'QA'},tenantCapabilities:capabilities(),platformCapabilities:[],platformRoles:[]}}});
   if(url.pathname!==API){assert.equal(req.method(),'GET','No writes to unrelated APIs');return route.fulfill({status:200,json:{ok:true,data:[],pagination:{page:1,limit:25,total:0,pages:0},facets:{sectors:[],organizations:[],agreements:[]}}});}
   if(!read||mode==='denied')return route.fulfill({status:403,json:{ok:false,code:'FORBIDDEN'}});
   if(req.method()==='GET'){
    const resource=url.searchParams.get('resource');let data;
    if(resource==='bootstrap')data=bootstrap();
    else if(resource==='proposal'){const p=proposals.get(url.searchParams.get('id'));assert.ok(p);const {author,...rest}=p;data={version:CATALOG_VERSION,proposal:{...rest,...summary(p)}};}
    else if(resource==='attempt'){const found=receipts.get(url.searchParams.get('key'));if(!found)return route.fulfill({status:404,json:{ok:false,code:'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND'}});data={...found.receipt,replayed:true};}
    else throw Error('UNKNOWN_RESOURCE');
    const h=hold?.kind===resource?hold:null;if(h){hold=null;h.enter();await h.wait;}
    try{return await route.fulfill({status:200,json:{ok:true,data}});}finally{h?.finish();}
   }
   assert.equal(req.method(),'POST');assert.equal(url.search,'');const bytes=req.postData(),body=JSON.parse(bytes),key=req.headers()['idempotency-key'];assert.match(key,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
   posts.push({key,bytes,actor,body});
   const old=receipts.get(key);if(old){assert.equal(old.bytes,bytes);return route.fulfill({status:200,json:{ok:true,data:{...old.receipt,replayed:true}}});}
   if(mode==='lost-unsaved'){mode='ok';return route.abort();}
   if(mode==='stale'){mode='ok';catalog={...catalog,version:'d'.repeat(64)};return route.fulfill({status:409,json:{ok:false,code:'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED'}});}
   let p;
   if(body.operation==='propose'){
    assert.ok(canPropose);const v=catalogProposalInput(body.payload);assert.equal(v.baseVersion,catalog.version);assert.equal(v.scopeVersion,scopeVersion);const id='10000000-0000-4000-8000-'+String(++proposalNumber).padStart(12,'0');
    p={id,status:'pending',reason:v.reason,createdAt:'2026-09-23T14:00:00.000Z',authorLabel:actor==='maker'?'Preparador QA':'Revisor QA',author:actor,baseVersion:v.baseVersion,baseItems:structuredClone(catalog.items),items:v.items,review:null};proposals.set(id,p);
   }else{
    assert.equal(body.operation,'review');assert.ok(canReview);const v=catalogReviewInput(body.payload);assert.equal(v.scopeVersion,scopeVersion);p=proposals.get(v.proposalId);assert.ok(p&&p.author!==actor&&p.status==='pending','Independent review only');
    p.status=v.decision==='approve'?'approved':'rejected';p.review={decision:v.decision,reason:v.reason,reviewedAt:'2026-09-23T14:10:00.000Z',reviewerLabel:'Revisor QA'};
    if(v.decision==='approve')catalog={items:structuredClone(p.items),version:hash(JSON.stringify(p.items)),origin:'MUNICONTROL',revision:catalog.revision+1,publishedAt:'2026-09-23T14:10:00.000Z'};
   }
   const r=receipt(body.operation,p);receipts.set(key,{bytes,receipt:r});if(mode==='lost-saved'){mode='ok';return route.abort();}if(mode==='wrong-receipt'){mode='ok';return route.fulfill({status:200,json:{ok:true,data:{...r,catalogVersion:'1'.repeat(64)}}});}
   return route.fulfill({status:200,json:{ok:true,data:r}});
  }catch(error){if(!/Target.*closed|already handled|Invalid InterceptionId/i.test(error.message))routeErrors.push(error.message);await route.abort().catch(()=>{});}
 });
 await context.routeWebSocket('**/*',s=>{routeErrors.push('WEBSOCKET');s.close();});
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const $=s=>page.locator(s),dialog=$('.ec-dialog'),status=$('[data-ec-status]');
 const ready=()=>page.waitForFunction(()=>!document.querySelector('[data-ec-refresh]').disabled);
 const open=async()=>{await $('[data-employment-catalog]').click();await $('[data-ec-content]:not([hidden])').waitFor();await ready();};
 const reload=async()=>{if(page.url().startsWith(origin))await page.reload();else await page.goto(origin+'/personal#legajos');await open();};
 const kind=async k=>{await $(`[data-ec-kinds] [data-kind=${k}]`).click();};
 const draft=async()=>{await $('[data-ec-create]').click();await $('[data-ec-propose]:not([hidden])').waitFor();};
 const reason=()=> $('[data-ec-reason]').fill('Actualizar encuadres según documento administrativo QA.');
 const send=async()=>{await reason();await $('[data-ec-send]').click();};
 const viewProposal=async id=>{await $(`[data-ec-proposal="${id}"]`).click();await $('[data-ec-detail]:not([hidden])').waitFor();await ready();};
 await reload();assert.equal(posts.length,0);assert.match(await $('[data-ec-origin]').textContent(),/incorporado de GRH/);assert.equal(await $('[data-ec-kinds] button').count(),4);checks.push('Personas opens the four catalog classes and GRH origin without any write');
 await draft();await $('[data-ec-rows] [data-ec-field=label]').fill('Convenio actualizado QA');await kind('sectors');await $('[data-ec-remove]').last().click();await $('[data-ec-add]').click();
 const added=$('[data-ec-rows] tr').last();await added.locator('[data-ec-field=code]').fill('6');await added.locator('[data-ec-field=label]').fill('Repartición nueva QA');await reason();
 assert.match(await $('[data-ec-diff]').textContent(),/1 incorporaciones.*1 cambios.*1 retiros/);assert.equal(posts.length,0);checks.push('editing, adding and removing values produces a complete reviewable draft without writing');
 await kind('categories');await $('[data-ec-rows] select').selectOption('1');assert.equal(await $('[data-ec-rows] select').inputValue(),'1');checks.push('category agreement is explicit and retains its code');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await dialog.evaluate(d=>d.scrollTop=0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
  const b=await $('[data-ec-close]').boundingBox();assert.ok(b.width>=40&&b.height>=40);
  await page.screenshot({path:path.join(out,'catalog-'+width+'-synthetic.png')});
  if(width<650){
   await $('.ec-table-wrap').scrollIntoViewIfNeeded();
   const cards=await $('[data-ec-rows]').evaluate(tbody=>Array.from(tbody.querySelectorAll('td:not([hidden])')).map(td=>{const input=td.querySelector('input,select,button'),box=input.getBoundingClientRect(),parent=td.getBoundingClientRect();return {label:td.dataset.label,pseudo:getComputedStyle(td,'::before').content,display:getComputedStyle(td).display,width:box.width,cellWidth:parent.width,left:box.left,right:box.right,viewport:innerWidth};}));
   assert.deepEqual(cards.map(c=>c.label),['Código','Descripción','Convenio','Acción']);
   for(const c of cards){assert.ok(c.pseudo.includes(c.label),'Mobile field label rendered');assert.equal(c.display,'block');assert.ok(c.width>=c.cellWidth*.95&&c.width>=210,'Mobile input uses available width');assert.ok(c.left>=0&&c.right<=c.viewport,'Mobile field is horizontally visible');}
   await page.screenshot({path:path.join(out,'catalog-fields-'+width+'-synthetic.png')});
  }
 }
 checks.push('desktop 1440 and mobile 390/320 show readable full-width fields and labels without horizontal scrolling');
 await send();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();const first=[...proposals.keys()][0];
 assert.equal(catalog.origin,'GRH');assert.equal(posts.length,1);assert.equal(posts[0].body.payload.items.length,initial.length);assert.ok(posts[0].body.payload.items.some(x=>x.kind==='sectors'&&x.code==='6'));checks.push('only Enviar a revisión writes the complete proposal; the current catalog is unchanged');
 await viewProposal(first);assert.equal(await $('[data-ec-review-form]').isVisible(),false);checks.push('the author cannot review their own proposal');
 actor='checker';await reload();await viewProposal(first);assert.match(await $('[data-ec-comparison]').textContent(),/Convenio de prueba.*Convenio actualizado QA/);await $('[data-ec-review-reason]').fill('Se rechaza para completar la referencia de prueba.');await $('[data-ec-decision=reject]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('rechazada'));await ready();assert.equal(proposals.get(first).status,'rejected');assert.equal(catalog.origin,'GRH');checks.push('another person sees base versus proposed values and can reject with reason without publishing');
 actor='maker';await reload();await draft();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Convenio aprobado QA');await send();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();const second=[...proposals.keys()].at(-1);
 actor='checker';await reload();await viewProposal(second);await $('[data-ec-review-reason]').fill('Se aprueba el catálogo completo de prueba.');await $('[data-ec-decision=approve]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('aprobado y publicado'));await ready();assert.equal(catalog.origin,'MUNICONTROL');assert.equal(catalog.revision,1);assert.match(await $('[data-ec-origin]').textContent(),/catálogo propio.*revisión 1/);checks.push('independent approval publishes the catalog and explains that existing employees stay unchanged');
 actor='reader';canPropose=false;canReview=false;historyTruncated=true;await reload();assert.equal(await $('[data-ec-create]').isVisible(),false);await viewProposal(second);assert.equal(await $('[data-ec-review-form]').isVisible(),false);assert.match(await $('[data-ec-history-note]').textContent(),/20 propuestas más recientes/);checks.push('read-only users retain catalog and comparison access; truncated history is explicit');
 actor='maker';canPropose=true;canReview=true;historyTruncated=false;await reload();await draft();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Respuesta perdida guardada QA');mode='lost-saved';await send();await page.waitForFunction(()=>document.querySelector('[data-ec-pending]').hidden===false&&!document.querySelector('[data-ec-recover]').disabled);assert.equal(await $('[data-ec-retry]').isDisabled(),true);const lost=posts.at(-1),beforeRecovery=posts.length;authDenied=true;await $('[data-ec-recover]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('sesión o permiso'));assert.equal(await $('[data-ec-content]').isVisible(),false);assert.equal(await $('[data-ec-pending]').isVisible(),false);assert.equal(await $('[data-ec-rows]').textContent(),'');await $('[data-ec-close]').click();authSession='session-renewed';authDenied=false;await open();await $('[data-ec-recover]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();assert.equal(posts.length,beforeRecovery);checks.push('a 401 clears visible data while retaining the lost attempt across closing and same-person reauthentication; recovery makes no second POST');
 await draft();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Acuse de otra versión QA');mode='wrong-receipt';await send();await page.waitForFunction(()=>document.querySelector('[data-ec-pending]').hidden===false&&!document.querySelector('[data-ec-recover]').disabled);assert.equal(await $('[data-ec-send]').isDisabled(),true);const wrongCount=posts.length;await $('[data-ec-recover]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();assert.equal(posts.length,wrongCount);checks.push('a proposal receipt for another base version is rejected and only the original receipt resolves the attempt');
 await draft();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Respuesta perdida no guardada QA');mode='lost-unsaved';await send();await page.waitForFunction(()=>document.querySelector('[data-ec-pending]').hidden===false&&!document.querySelector('[data-ec-recover]').disabled);const retry=posts.at(-1);await $('[data-ec-recover]').click();await page.waitForFunction(()=>!document.querySelector('[data-ec-retry]').disabled);assert.equal(await $('[data-ec-send]').isDisabled(),true);await $('[data-ec-retry]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();assert.equal(posts.at(-1).key,retry.key);assert.equal(posts.at(-1).bytes,retry.bytes);checks.push('attempt 404 keeps editing locked and allows only byte-identical replay under the same key');
 await draft();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Borrador con versión anterior QA');mode='stale';await send();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('Conservamos tu borrador'));await ready();await $('[data-ec-refresh]').click();await ready();assert.equal(await $('[data-ec-rows] [data-ec-field=label]').inputValue(),'Borrador con versión anterior QA');assert.equal(await $('[data-ec-send]').isDisabled(),true);assert.match(await $('[data-ec-draft-note]').textContent(),/versión vigente cambió/);checks.push('a changed base version preserves the draft and blocks automatic rebasing or resubmission');
 await $('[data-ec-discard]').click();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Intento de actor anterior QA');mode='lost-unsaved';await send();await page.waitForFunction(()=>document.querySelector('[data-ec-pending]').hidden===false&&!document.querySelector('[data-ec-recover]').disabled);const count=posts.length;actor='different';await $('[data-ec-recover]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('Cambió la cuenta'));assert.equal(posts.length,count);assert.equal(await $('[data-ec-content]').isVisible(),false);assert.equal(await $('[data-ec-pending]').isVisible(),false);checks.push('changing authenticated actor discards the prior attempt and cannot replay it');
 await $('[data-ec-refresh]').click();await $('[data-ec-content]:not([hidden])').waitFor();await ready();await draft();await kind('agreements');await $('[data-ec-rows] [data-ec-field=label]').fill('Intento de ámbito anterior QA');mode='lost-unsaved';await send();await page.waitForFunction(()=>document.querySelector('[data-ec-pending]').hidden===false&&!document.querySelector('[data-ec-recover]').disabled);const scopePostCount=posts.length,scopeGetCount=calls.filter(c=>c.resource==='attempt').length;scopeVersion='e'.repeat(64);await $('[data-ec-recover]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('Cambió la cuenta'));assert.equal(posts.length,scopePostCount);assert.equal(calls.filter(c=>c.resource==='attempt').length,scopeGetCount);assert.equal(await $('[data-ec-pending]').isVisible(),false);checks.push('a binding or membership scope change under the same account clears the attempt before receipt lookup or replay');
 await $('[data-ec-refresh]').click();await $('[data-ec-content]:not([hidden])').waitFor();await ready();const late=suspend('proposal');await $(`[data-ec-proposal="${first}"]`).click();await late.entered;
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));late.release();await late.finished;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await $('[data-ec-content]').isVisible(),false);assert.equal(await $('[data-ec-detail]').isVisible(),false);assert.equal(await $('[data-ec-rows]').textContent(),'');assert.equal(await $('[data-ec-proposals]').textContent(),'');checks.push('permission revocation removes catalog and history and discards a late proposal response');
 await $('[data-ec-refresh]').click();await $('[data-ec-content]:not([hidden])').waitFor();await ready();mode='denied';await $('[data-ec-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('sesión o permiso'));assert.equal(await $('[data-ec-content]').isVisible(),false);assert.equal(await $('[data-ec-origin]').textContent(),'');checks.push('a server 403 clears all consulted catalog and comparison data');
 mode='ok';read=true;actor='adopter';catalog={items:structuredClone(initial),version:'a'.repeat(64),origin:'GRH',revision:0,publishedAt:null};scopeVersion='c'.repeat(64);proposals.clear();receipts.clear();await reload();await draft();assert.match(await $('[data-ec-draft-note]').textContent(),/adoptar estas opciones como catálogo propio/);const adoptionPosts=posts.length;await send();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();assert.equal(posts.length,adoptionPosts+1);assert.deepEqual(posts.at(-1).body.payload.items,initial);assert.equal(catalog.origin,'GRH');const adoption=[...proposals.keys()].at(-1);
 actor='adoption-reviewer';await reload();await viewProposal(adoption);assert.match(await $('[data-ec-comparison]').textContent(),/adoptar estas opciones de GRH como catálogo propio/);const previewCalls=calls.length;await $('.ec-full-proposal summary').click();assert.equal(await $('[data-ec-full-proposal] h4').count(),4);assert.deepEqual(await $('[data-ec-full-proposal] li').allTextContents(),initial.map(i=>i.code+' · '+i.label+(i.agreementCode?' · convenio '+i.agreementCode:'')));assert.equal(calls.length,previewCalls);checks.push('the reviewer can inspect all four exact proposed classes without another request, including unchanged adoption');
 await $('[data-ec-review-reason]').fill('Se adopta el contenido revisado como catálogo propio.');await $('[data-ec-decision=approve]').click();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('aprobado y publicado'));await ready();assert.equal(catalog.origin,'MUNICONTROL');assert.deepEqual(catalog.items,initial);checks.push('unchanged GRH values can be proposed and independently adopted as the first native catalog');
 await draft();const noOpPosts=posts.length;await send();assert.match(await status.textContent(),/Agregá, modificá o retirá/);assert.equal(posts.length,noOpPosts);checks.push('an unchanged already-native catalog does not create a redundant proposal');
 await $('[data-ec-close]').click();const oldLoad=suspend('bootstrap');await $('[data-employment-catalog]').click();await oldLoad.entered;await $('[data-ec-close]').click();const newLoad=suspend('bootstrap');await $('[data-employment-catalog]').click();await newLoad.entered;oldLoad.release();await oldLoad.finished;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await $('[data-ec-refresh]').isDisabled(),true);assert.equal(await $('[data-ec-send]').isDisabled(),true);newLoad.release();await newLoad.finished;await ready();checks.push('an old request finishing after close and reopen cannot unlock controls during the new request');
 catalog={...catalog,items:catalogItems([...initial,make('agreements','2','Segundo convenio QA'),make('agreements','12','Duodécimo convenio QA'),make('categories','2','Clase dos','1'),make('categories','10','Clase diez','1'),make('categories','1','Clase otro convenio','2'),...['1','10','108'].map(code=>make('organizations',code,'Sector QA '+code))])};await reload();await kind('organizations');assert.deepEqual(await $('[data-ec-rows] td:first-child').allTextContents(),['1','2','10','108']);await kind('agreements');assert.deepEqual(await $('[data-ec-rows] td:first-child').allTextContents(),['1','2','12']);await kind('categories');assert.deepEqual(await $('[data-ec-rows] td:first-child').allTextContents(),['2','3','10','1']);assert.deepEqual(await $('[data-ec-rows] td:nth-child(3)').allTextContents(),['1','1','1','2']);await draft();assert.deepEqual(await $('[data-ec-rows] [data-ec-field=code]').evaluateAll(nodes=>nodes.map(n=>n.value)),['2','3','10','1']);await $('[data-ec-rows] [data-ec-field=code]').first().fill('99');assert.deepEqual(await $('[data-ec-rows] [data-ec-field=code]').evaluateAll(nodes=>nodes.map(n=>n.value)),['99','3','10','1']);const expectedOrderedPayload=catalogItems(catalog.items.map(i=>i.kind==='categories'&&i.agreementCode==='1'&&i.code==='2'?{...i,code:'99',key:'categories:1:99'}:i));await send();await page.waitForFunction(()=>document.querySelector('[data-ec-status]').textContent.includes('enviada a revisión'));await ready();assert.deepEqual(posts.at(-1).body.payload.items,expectedOrderedPayload);checks.push('display uses natural code and agreement order; editing preserves focus and the submitted payload retains canonical model normalization');
 assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);assert.ok(posts.every(p=>p.body.operation==='propose'||p.body.operation==='review'));assert.equal(lost.actor,'maker');
 if(published)assertReviewedHead();
 const result={ok:true,published,sourceCommit,cleanHeadVerified:published,comparison:publishedPins?.comparison??'local build bytes',recipeHashes:publishedPins?.recipeHashes??null,gitExpectedHashes:publishedPins?.sourceHashes??null,checksPassed:checks.length,checks,syntheticApi:true,privateApisIntercepted:true,realApiCalls:0,municipalWrites:0,syntheticPosts:posts.length,publishedBytesVerified:published,assets,browser:browser.version()};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,assets:Object.keys(assets)}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,routeErrors,error:error.message,posts:posts.length},null,2));throw error;}finally{for(const h of held)h.release();await browser.close();}
