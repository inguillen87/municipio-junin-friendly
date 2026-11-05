// Compiled UI + real handlers/read adapters. All SQL/IAM/source replies are
// synthetic; no provider, municipal write or nominal browser storage allowed.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {unzipSync,strFromU8} from 'fflate';
import {createInternalDataHandler} from '../api/internal-data.js';
import {currentProof,currentSnapshot,currentRoster,directoryRows} from '../tests/fixtures/native-current-directory-synthetic.js';
import {row,binding,CONTRACT,principal,session} from '../tests/fixtures/employment-adoption-history-synthetic.js';
const origin='http://127.0.0.1:4329',root=path.resolve('public'),out=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'verification/own-directory-browser-20261006');assert.ok(out.startsWith(path.resolve('verification')+path.sep));assert.ok(!fs.existsSync(out),'Preserve prior browser evidence');fs.mkdirSync(out);
const checks=[],errors=[],requests=[],downloads=[],apiReads=[];let mode='normal',cohortChanged=false,caps=['workforce.employee.read','workforce.summary.read'];
let volumeMode=false,volumeInactive=false,volumeRevision=0,nextRosterGate=null,nextRosterFailure=null,exactSearchFixture=false;
const heldRosterGates=new Set();
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
// Pure synthetic volume. Names/documents repeat on 65 second contracts;
// the row order matches name/legajo/contract C ordering, so row851 is last.
const volumeId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function volumeRoster(){
 const d=currentRoster(),template=d.rows[3],peopleByContract=new Map();
 d.rows=Array.from({length:851},(_,i)=>{
  const ordinal=i+1,person=ordinal<=721?ordinal:722+Math.floor((ordinal-722)/2),inactive=volumeInactive&&[100,500,800].includes(ordinal);
  const contractId=volumeId(900000+ordinal);peopleByContract.set(contractId,person);
  return{...template,contractId,registrationId:volumeId(950000+ordinal),legajo:'QA-VOLUMEN-'+String(ordinal).padStart(4,'0'),
   name:'PERSONA SINTETICA VOLUMEN '+String(person).padStart(4,'0')+(volumeRevision&&person===1?' REVISADA':''),
   dni:String(99000000+person),cuil:'20'+String(99000000+person)+'0',recordKind:'adopted',birthDate:'1970-01-01',startDate:'2020-01-01',
   endDate:inactive?'2026-09-01':null,status:inactive?'inactive':'active',jurisdictionCode:ordinal%2?'42':'55',
   organization:ordinal%3?'Sector QA Volumen A':'Sector QA Volumen B',sector:ordinal%5?'Reparticion QA Volumen Norte':'Reparticion QA Volumen Sur',
   agreement:'Convenio QA Volumen',category:'Categoria QA Volumen',legalReference:'Resolucion sintetica de volumen',registeredAt:'2026-09-30T12:00:00Z'};
 });
 d.total=851;d.people=786;d.counts={active:volumeInactive?848:851,pending_start:0,inactive:volumeInactive?3:0,state_error:0,unknown:0};
 d.facets={organization:['Sector QA Volumen A','Sector QA Volumen B'],sector:['Reparticion QA Volumen Norte','Reparticion QA Volumen Sur'],agreement:['Convenio QA Volumen']};
 return{data:d,peopleByContract};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function retainNextRoster(){assert.equal(nextRosterGate,null);const gate={entered:deferred(),release:deferred(),delivered:deferred()};nextRosterGate=gate;heldRosterGates.add(gate);return gate;}
function failNextRoster(kind){assert.equal(nextRosterFailure,null);const gate={kind,entered:deferred(),release:deferred(),delivered:deferred()};nextRosterFailure=gate;heldRosterGates.add(gate);return gate;}
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),12000);})]);}finally{clearTimeout(timer);}}
const resourceCount=resource=>requests.filter(r=>r.resource===resource).length;
const peopleIsolationCounts=()=>({employees:resourceCount('employees'),summary:resourceCount('summary')});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();requests.push({method:req.method(),path:u.pathname,resource:u.searchParams.get('resource'),search:u.searchParams.get('search')});assert.equal(req.method(),'GET');
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Operador sintético QA',email:session.email,role:'ADMIN_INTERNO'},access:{tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]}}});
  if(u.pathname.startsWith('/api/')){
   const query=Object.fromEntries(u.searchParams);
   // Transport-only failures stop before the synthetic handler/SQL adapter.
   // timeout holds the real fetch beyond its existing25s AbortSignal deadline.
   if(query.resource==='nativeroster'&&nextRosterFailure){
    const failure=nextRosterFailure;nextRosterFailure=null;failure.entered.resolve();if(failure.kind==='timeout')await failure.release.promise;
    try{return await route.fulfill(failure.kind==='json'?{status:503,json:{ok:false,error:'Fallo sintético controlado. Volvé a consultar.'}}:{status:504,contentType:'text/plain',body:'FUNCTION_INVOCATION_TIMEOUT: SYNTHETIC_TRANSPORT_ONLY'});}
    finally{heldRosterGates.delete(failure);failure.delivered.resolve();}
   }
   if(['nativeroster','employees','employee'].includes(query.resource)){
    let snapshots=0,proofs=0;const sql={query:async statement=>{
     apiReads.push({resource:query.resource,statement});
     if(statement.includes('effective-source:snapshot'))return[];
     if(statement.startsWith('SELECT public.native_employee_directory_snapshot')){snapshots++;if(snapshots===2&&mode==='revoked')throw Error('NATIVE_EMPLOYEE_FORBIDDEN');return[{result:currentSnapshot(volumeMode?851:57,{token:(snapshots===2&&mode==='changed'?'c':volumeMode?(volumeInactive?'e':volumeRevision?'d':'a'):exactSearchFixture?'f':cohortChanged?'b':'a').repeat(64)})}];}
     if(statement.includes('native-roster.v2')){const volume=volumeMode?volumeRoster():null,d=volume?volume.data:currentRoster();if(cohortChanged&&!volumeMode)d.rows[1].name='PERSONA SINTÉTICA REVISADA';if(exactSearchFixture&&!volumeMode){const codes=['571','1571','0901','901','A3501','a3501'];for(let i=0;i<codes.length;i++)Object.assign(d.rows[i+3],{recordKind:'adopted',legajo:codes[i],dni:'99000571'});}d.rows=d.rows.filter(r=>(!query.search||(query.search.startsWith('legajo:')?r.legajo===query.search.slice(7):[r.name,r.legajo,r.dni,r.cuil].some(v=>v?.toLowerCase().includes(query.search.toLowerCase()))))&&(query.status==='all'||r.status===query.status)&&(!query.jurisdiction||(query.jurisdiction==='not_reported'?r.jurisdictionCode===null:r.jurisdictionCode===query.jurisdiction))&&['organization','sector','agreement'].every(k=>!query[k]||r[k]===query[k]));d.total=d.rows.length;d.people=volume?new Set(d.rows.map(r=>volume.peopleByContract.get(r.contractId))).size:d.rows.length;d.counts=Object.fromEntries(['active','pending_start','inactive','state_error','unknown'].map(k=>[k,d.rows.filter(r=>r.status===k).length]));const{origin,complete,filters,snapshot,...raw}=d;return[{result:raw}];}
     if(statement.includes('AS "__total"'))return directoryRows();
     if(statement.includes('employment_adoption_history_read_v1'))throw Error('EMPLOYMENT_ADOPTION_HISTORY_NOT_FOUND');
     if(statement.startsWith('SELECT public.native_employee_read_projection')){proofs++;if(proofs===2&&mode==='detail-revoked')throw Error('NATIVE_EMPLOYEE_FORBIDDEN');return[{result:currentProof()}];}
     if(statement.includes('__contractReadVersion')){const d=row(),p=currentProof();Object.assign(d,{legajo:p.contract.legajo,nombre:'PERSONA SINTÉTICA ALTA PROPIA',rawFields:{...d.rawFields,native:{registrationId:p.contract.registrationId}}});return[d];}
     throw Error('Unexpected synthetic read');
    }};
    const handler=createInternalDataHandler({env:{FRIENDLY_GRH_SOURCE_DATABASE:binding.database,FRIENDLY_GRH_COMPANY_ID:'101'},requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:caps}}}),actionMutationSession:()=>session,getInternalSql:async()=>sql,getActionCenterSql:async()=>sql,reportReadFailure:()=>{}}),res=response();await handler({method:'GET',query},res);
    const gate=query.resource==='nativeroster'?nextRosterGate:null;
    if(gate){nextRosterGate=null;gate.entered.resolve();await gate.release.promise;}
    try{return await route.fulfill({status:res.code,json:res.body,headers:res.headers});}
    finally{if(gate){heldRosterGates.delete(gate);gate.delivered.resolve();}}
   }
   return route.fulfill({status:503,json:{ok:false,error:'Consulta fuera de esta prueba sintética del padrón.'}});
  }
  const file=path.resolve(root,'.'+(u.pathname==='/personal'?'/internal-dashboard.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));await page.goto(origin+'/personal#legajos');
 await page.locator('[data-native-roster] [data-nr-consult]').waitFor();assert.deepEqual(peopleIsolationCounts(),{employees:0,summary:0});assert.equal(apiReads.some(r=>r.resource==='employees'),false);assert.equal(await page.locator('#employeeHistory').getAttribute('open'),null);checks.push('entering Persons leaves the mixed directory idle');
 const panel=page.locator('[data-native-roster]'),consult=panel.getByRole('button',{name:'Consultar padrón propio'}),form=panel.locator('form');assert.equal(await panel.getAttribute('open'),'');assert.equal(await form.locator('[name=status]').inputValue(),'active');await form.locator('[name=status]').selectOption('all');const ready=()=>page.waitForFunction(()=>!document.querySelector('[data-nr-consult]').disabled),query=async()=>{await consult.click();await panel.locator('[data-nr-result]:not([hidden])').waitFor();await ready();};await ready();
 await query();assert.equal(await panel.locator('[data-nr-rows] tr').count(),25);assert.match(await panel.innerText(),/57 legajos · 57 personas/);assert.match(await panel.locator('[data-nr-rows]').innerText(),/Contrato adoptado/);assert.match(await panel.locator('[data-nr-rows]').innerText(),/Alta propia/);assert.match(await panel.locator('[data-nr-rows]').innerText(),/Nombre no informado/);assert.match(await panel.innerText(),/1 sin clasificación/);checks.push('mixed v2 census shows adopted/hire provenance, unknown classification and absent name honestly');
 const n=apiReads.length;await panel.getByRole('button',{name:'Siguiente',exact:true}).first().click();await panel.getByRole('button',{name:'Siguiente',exact:true}).last().click();assert.equal(await panel.locator('[data-nr-rows] tr').count(),7);assert.equal(apiReads.length,n);checks.push('third page retains all 57 own contracts without another SQL read');
 const download=async name=>{const[d]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name}).click()]);await ready();return fs.readFileSync(await d.path());};
 const csv=(await download('Descargar CSV completo')).toString('utf8');assert.equal(csv.split('\r\n').length,59);assert.match(csv,/1888-01-01/);assert.match(csv,/"A\/07","","",""/);assert.match(csv,/Contrato adoptado/);assert.match(csv,/PERSONA SINTÉTICA 057/);assert.doesNotMatch(csv,/Nombre no informado/);checks.push('CSV includes all pages, old dates, opaque legajo and true empty cells');
 const x=unzipSync(await download('Descargar Excel completo')),sheet=strFromU8(x['xl/worksheets/sheet1.xml']);assert.equal((sheet.match(/<row r=/g)||[]).length,58);assert.match(sheet,/A1:T58/);assert.match(sheet,/Contrato adoptado/);assert.doesNotMatch(sheet,/<f[\s>]/);checks.push('Excel has all 57 rows, municipal registration provenance and no formulas');
 await form.locator('[name=status]').selectOption('unknown');await query();assert.match(await panel.innerText(),/1 legajos/);assert.equal((await download('Descargar CSV completo')).toString('utf8').split('\r\n').length,3);checks.push('unknown status is an explicit complete filter, not an active or omitted contract');
 await panel.getByRole('button',{name:'Limpiar filtros'}).click();await form.locator('[name=search]').fill('INEXISTENTE QA');await query();assert.match(await panel.innerText(),/0 legajos/);assert.equal((await download('Descargar CSV completo')).toString('utf8').split('\r\n').length,2);checks.push('zero search result is explicit and exports headers only');
 // Same real UI/handler; synthetic adapter supplies independently identified collision rows, not PostgreSQL execution.
 exactSearchFixture=true;await panel.getByRole('button',{name:'Limpiar filtros'}).click();await form.locator('[name=search]').fill('571');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^6 legajos/);
 await form.locator('[data-nr-search-mode]').selectOption('legajo');assert.equal(await panel.locator('[data-nr-result]').isVisible(),false);assert.equal(await panel.locator('[data-nr-csv]').isDisabled(),true);await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^1 legajos/);assert.ok((await panel.locator('[data-nr-rows] td').first().innerText()).startsWith('571 ·'));assert.equal(requests.filter(r=>r.resource==='nativeroster').at(-1).search,'legajo:571');assert.ok((await panel.locator('[data-nr-rows] a').getAttribute('href')).includes(currentRoster().rows[3].contractId));assert.equal((await download('Descargar CSV completo')).toString('utf8').split('\r\n').length,3);checks.push('explicit exact legajo mode removes five document or substring collisions and opens the identified contract');
 for(const code of ['0901','901','A3501','a3501']){await form.locator('[name=search]').fill(code);await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^1 legajos/);assert.ok((await panel.locator('[data-nr-rows] td').first().innerText()).startsWith(code+' ·'));assert.equal(requests.filter(r=>r.resource==='nativeroster').at(-1).search,'legajo:'+code);}checks.push('exact lookup preserves zero-prefixed and case-sensitive opaque legajos');
 await form.locator('[name=search]').fill('');const exactReads=apiReads.length;await consult.click();await ready();assert.equal(apiReads.length,exactReads);assert.match(await panel.locator('[data-nr-status]').innerText(),/Ingresá el legajo completo/);checks.push('empty exact lookup is actionable and never opens a server census');exactSearchFixture=false;
 await panel.getByRole('button',{name:'Limpiar filtros'}).click();await query();let count=downloads.length;cohortChanged=true;await panel.getByRole('button',{name:'Descargar CSV completo'}).click();await ready();assert.equal(downloads.length,count);assert.match(await panel.innerText(),/El padrón cambió/);assert.match(await panel.innerText(),/PERSONA SINTÉTICA REVISADA/);await download('Descargar CSV completo');checks.push('changed whole cohort updates the review and requires another explicit download');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await query();assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.ok(await panel.locator('[data-nr-xlsx]').evaluate(n=>n.getBoundingClientRect().height>=44));await panel.screenshot({path:path.join(out,'mixed-'+width+'.png')});}checks.push('mixed census and controls fit desktop, 390 and 320px');
 const store=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.doesNotMatch(store,/PERSONA SINTÉTICA|99999990|A\/07/);checks.push('no nominal census is persisted in browser storage');
 mode='changed';await consult.click();await ready();assert.equal(await panel.locator('[data-nr-result]').isVisible(),false);assert.match(await panel.innerText(),/cambiaron durante la consulta/);checks.push('server-side cohort change during the read withdraws all private rows');mode='normal';await query();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await panel.locator('[data-nr-rows]').textContent(),'');assert.equal(await panel.locator('[data-nr-csv]').isDisabled(),true);checks.push('hiding the page clears the mixed private census and download');await query();

 // Same compiled UI, handler, read adapters, exports and routing as the57 checks.
 // Baseline mirrors only the requested cardinalities; all fields remain fictitious.
 volumeMode=true;volumeInactive=false;volumeRevision=0;cohortChanged=false;mode='normal';await page.setViewportSize({width:1440,height:1000});
 const isolatedBefore=peopleIsolationCounts();
 await panel.getByRole('button',{name:'Limpiar filtros'}).click();assert.equal(await form.locator('[name=status]').inputValue(),'active');
 assert.deepEqual(peopleIsolationCounts(),isolatedBefore);await query();
 const volumeSummary=async(total,people)=>{assert.match(await panel.locator('[data-nr-counts]').innerText(),new RegExp('^'+total+' legajos · '+people+' personas del filtro(?: ·|$)'));};
 await volumeSummary(851,786);assert.doesNotMatch(await panel.locator('[data-nr-counts]').innerText(),/inactivos|por revisar|sin clasificación/);assert.equal(await panel.locator('[data-nr-rows] tr').count(),25);
 assert.match(await panel.locator('[data-nr-page]').first().innerText(),/^Página 1 de 35 · 851 legajos completos$/);
 const pagingReads=apiReads.length,pagingRequests=resourceCount('nativeroster');
 for(let ordinal=2;ordinal<=35;ordinal++){
  await panel.getByRole('button',{name:'Siguiente',exact:true}).first().click();
  assert.match(await panel.locator('[data-nr-page]').first().innerText(),new RegExp('^Página '+ordinal+' de 35 · 851 legajos completos$'));
  assert.equal(await panel.locator('[data-nr-rows] tr').count(),ordinal===35?1:25);
 }
 assert.equal(apiReads.length,pagingReads);assert.equal(resourceCount('nativeroster'),pagingRequests);
 assert.match(await panel.locator('[data-nr-rows]').innerText(),/QA-VOLUMEN-0851/);
 assert.equal(await panel.locator('[data-nr-rows] a').last().getAttribute('href'),'/personal?contractId='+volumeId(900851)+'#legajos');
 assert.equal(await panel.getByRole('button',{name:'Siguiente',exact:true}).first().isDisabled(),true);
 checks.push('851 synthetic municipal contracts for786 people remain complete: row851 on page35, every intermediate page25, no extra API or SQL reads while paging');
 const volumeCsv=(await download('Descargar CSV completo')).toString('utf8'),volumeLines=volumeCsv.split('\r\n');
 assert.equal(volumeLines.length,853);const volumeRecords=volumeLines.slice(1,-1);
 assert.equal(volumeRecords.length,851);assert.equal(new Set(volumeRecords.map(line=>/^"(QA-VOLUMEN-\d{4})",/.exec(line)?.[1])).size,851);
 assert.equal(new Set(volumeRecords.map(line=>/^"[^"]*","[^"]*","([^"]*)",/.exec(line)?.[1])).size,786);
 for(let ordinal=1;ordinal<=851;ordinal++)assert.ok(volumeRecords.some(line=>line.startsWith('"QA-VOLUMEN-'+String(ordinal).padStart(4,'0')+'",')),'missing synthetic contract '+ordinal);
 const volumeZip=unzipSync(await download('Descargar Excel completo')),volumeSheet=strFromU8(volumeZip['xl/worksheets/sheet1.xml']);
 assert.equal((volumeSheet.match(/<row r=/g)||[]).length,852);assert.match(volumeSheet,/A1:T852/);assert.match(volumeSheet,/QA-VOLUMEN-0851/);assert.doesNotMatch(volumeSheet,/<f[\s>]/);
 assert.match(strFromU8(volumeZip['xl/worksheets/sheet2.xml']),/Personas del filtro/);
 checks.push('CSV and Excel revalidate and export all851 synthetic contracts across35 pages, retaining786 distinct fictitious identities; no partial row export or spreadsheet formulas');
 await form.locator('[name=status]').selectOption('all');await query();await volumeSummary(851,786);assert.match(await panel.locator('[data-nr-counts]').innerText(),/0 inactivos/);assert.equal(await panel.locator('[data-nr-all]').isVisible(),false);
 await form.locator('[name=jurisdiction]').selectOption('42');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^426 legajos/);assert.ok(apiReads.at(-2).resource==='nativeroster');
 const j42=(await download('Descargar CSV completo')).toString('utf8').split('\r\n').slice(1,-1);assert.equal(j42.length,426);assert.ok(j42.every(line=>line.includes(',"42",')));
 await form.locator('[name=jurisdiction]').selectOption('55');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^425 legajos/);
 const j55=(await download('Descargar CSV completo')).toString('utf8').split('\r\n').slice(1,-1);assert.equal(j55.length,425);assert.ok(j55.every(line=>line.includes(',"55",')));
 await form.locator('[name=jurisdiction]').selectOption('');await form.locator('[name=organization]').selectOption('Sector QA Volumen B');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^283 legajos/);
 await form.locator('[name=organization]').selectOption('');await form.locator('[name=sector]').selectOption('Reparticion QA Volumen Sur');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^170 legajos/);
 await form.locator('[name=organization]').selectOption('Sector QA Volumen B');await form.locator('[name=jurisdiction]').selectOption('42');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^28 legajos/);
 const intersect=(await download('Descargar CSV completo')).toString('utf8').split('\r\n').slice(1,-1);assert.equal(intersect.length,28);assert.ok(intersect.every(line=>line.includes(',"42","Sector QA Volumen B","Reparticion QA Volumen Sur",')));
 checks.push('volume filters preserve the complete intended scope: J42=426, J55=425, Sector B=283, Reparticion Sur=170, combined J42/Sector B/Sur=28; filtered downloads agree');
 // Separate synthetic status variation prevents all/active from passing through
 // identical cardinalities; this is not a change to municipal current statuses.
 volumeInactive=true;await panel.getByRole('button',{name:'Limpiar filtros'}).click();await query();await volumeSummary(848,784);
 assert.doesNotMatch(await panel.locator('[data-nr-counts]').innerText(),/inactivos|por revisar|sin clasificación/);assert.match(await panel.locator('[data-nr-counts]').innerText(),/Situación: Activos/);
 const beforeAllSituations=resourceCount('nativeroster');await panel.getByRole('button',{name:'Ver todas las situaciones',exact:true}).click();await ready();await volumeSummary(851,786);
 assert.equal(await form.locator('[name=status]').inputValue(),'all');assert.equal(resourceCount('nativeroster'),beforeAllSituations+1);assert.equal(await panel.locator('[data-nr-all]').isVisible(),false);assert.match(await panel.locator('[data-nr-counts]').innerText(),/3 inactivos/);
 checks.push('active-only summary names people of the filter and does not claim zero inactive/review states; Ver todas las situaciones explicitly reads all851/786 instead of active848/784');
 await form.locator('[name=status]').selectOption('inactive');await query();await volumeSummary(3,3);assert.equal((await download('Descargar CSV completo')).toString('utf8').split('\r\n').length,5);
 checks.push('separate fictitious status variant distinguishes Active848/784people, All851/786people and Inactive3/3people without discarding inactive contracts');
 await panel.getByRole('button',{name:'Limpiar filtros'}).click();await form.locator('[name=jurisdiction]').selectOption('55');await form.locator('[name=organization]').selectOption('Sector QA Volumen A');await form.locator('[name=sector]').selectOption('Reparticion QA Volumen Sur');await query();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^54 legajos/);
 const beforeScopedAll=resourceCount('nativeroster');await panel.getByRole('button',{name:'Ver todas las situaciones',exact:true}).click();await ready();assert.match(await panel.locator('[data-nr-counts]').innerText(),/^57 legajos/);assert.equal(resourceCount('nativeroster'),beforeScopedAll+1);
 for(const [field,value]of Object.entries({jurisdiction:'55',organization:'Sector QA Volumen A',sector:'Reparticion QA Volumen Sur'}))assert.equal(await form.locator('[name='+field+']').inputValue(),value);
 checks.push('Ver todas las situaciones preserves non-empty J55, Sector and Reparticion filters and sends one GET: active54 becomes all57 in that same scope');
 volumeInactive=false;await panel.getByRole('button',{name:'Limpiar filtros'}).click();await query();await volumeSummary(851,786);
 const refreshBefore=peopleIsolationCounts(),history=page.locator('#employeeHistory');assert.equal(await history.getAttribute('open'),null);
 const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 for(const entry of ['own-open','both-closed']){
  if(entry==='both-closed'){await panel.locator(':scope > summary').click();await page.waitForFunction(()=>!document.querySelector('[data-native-roster]').open&&document.querySelector('[data-nr-rows]').textContent==='');assert.equal(await history.getAttribute('open'),null);}
  const ownRequestsBeforeRefresh=resourceCount('nativeroster'),refreshGate=retainNextRoster();
  await page.locator('#refreshButton').click();await bounded(refreshGate.entered.promise,'REFRESH_NATIVE_QUERY_NOT_ENTERED_'+entry);
  assert.equal(await panel.getAttribute('open'),'');assert.equal(await history.getAttribute('open'),null);assert.equal(resourceCount('nativeroster'),ownRequestsBeforeRefresh+1);assert.deepEqual(peopleIsolationCounts(),refreshBefore);
  assert.equal(await panel.getAttribute('aria-busy'),'true');assert.equal(await consult.isDisabled(),true);assert.equal(await panel.locator('[data-nr-xlsx]').isDisabled(),true);assert.equal(await panel.locator('[data-nr-csv]').isDisabled(),true);
  await frames();assert.equal(await panel.getAttribute('aria-busy'),'true','Refresh must remain busy while its complete response is retained');assert.equal(resourceCount('nativeroster'),ownRequestsBeforeRefresh+1);
  refreshGate.release.resolve();await bounded(refreshGate.delivered.promise,'REFRESH_NATIVE_DELIVERY_NOT_SETTLED_'+entry);await panel.locator('[data-nr-result]:not([hidden])').waitFor();await ready();await volumeSummary(851,786);
  assert.equal(await panel.getAttribute('aria-busy'),'false');assert.equal(resourceCount('nativeroster'),ownRequestsBeforeRefresh+1);assert.deepEqual(peopleIsolationCounts(),refreshBefore);
  checks.push('Persons Update from '+entry+' opens/uses the own roster and sends exactly one explicit native GET, no employees/summary GET, retaining busy/export guards until its complete851-row response');
 }
 await history.locator(':scope > summary').click();assert.deepEqual(peopleIsolationCounts(),refreshBefore);await history.locator(':scope > summary').click();assert.deepEqual(peopleIsolationCounts(),refreshBefore);
 checks.push('opening/closing the unqueried historical section remains lazy after real own-roster refresh');
 for(const action of ['consult','export']){
  volumeRevision=0;await query();await volumeSummary(851,786);const originalDownloads=downloads.length,oldGate=retainNextRoster();
  await(action==='consult'?consult:panel.getByRole('button',{name:'Descargar CSV completo'})).click();await bounded(oldGate.entered.promise,'RETAINED_ROSTER_RESPONSE_NOT_ENTERED');
  assert.equal(await consult.isDisabled(),true);
  await page.locator('[data-view="inicio"]').click();assert.equal(await panel.locator('[data-nr-rows]').textContent(),'');assert.equal(await panel.locator('[data-nr-result]').isVisible(),false);
  // Inicio may read its own summary. Return to Persons must not query;
  // Update below is the deliberately retained NEW native query.
  await page.waitForFunction(()=>document.querySelector('#view-inicio').hidden===false);await frames();
  const afterLeaving=peopleIsolationCounts();if(!await page.locator('[data-view="legajos"]').isVisible())await page.locator('[data-work-area="personas"] > summary').click();await page.locator('[data-view="legajos"]').click();await ready();
  assert.deepEqual(peopleIsolationCounts(),afterLeaving);assert.equal(await panel.locator('[data-nr-rows]').textContent(),'');assert.equal(await history.getAttribute('open'),null);
  volumeRevision=1;const freshGate=retainNextRoster(),nativeBeforeNewRefresh=resourceCount('nativeroster');await page.locator('#refreshButton').click();await bounded(freshGate.entered.promise,'FRESH_REFRESH_ROSTER_RESPONSE_NOT_ENTERED');
  assert.equal(resourceCount('nativeroster'),nativeBeforeNewRefresh+1);assert.deepEqual(peopleIsolationCounts(),afterLeaving);
  oldGate.release.resolve();await bounded(oldGate.delivered.promise,'OLD_RETAINED_DELIVERY_NOT_SETTLED');await frames();
  assert.equal(await consult.isDisabled(),true,'old completion must not unlock fresh query');assert.equal(await panel.getAttribute('aria-busy'),'true');assert.equal(await panel.locator('[data-nr-result]').isVisible(),false);assert.equal(downloads.length,originalDownloads);
  freshGate.release.resolve();await bounded(freshGate.delivered.promise,'FRESH_RETAINED_DELIVERY_NOT_SETTLED');await panel.locator('[data-nr-result]:not([hidden])').waitFor();await ready();await volumeSummary(851,786);
  assert.match(await panel.locator('[data-nr-rows]').innerText(),/PERSONA SINTETICA VOLUMEN 0001 REVISADA/);assert.equal(downloads.length,originalDownloads);
  assert.deepEqual(peopleIsolationCounts(),afterLeaving);assert.equal(resourceCount('nativeroster'),nativeBeforeNewRefresh+1);
  checks.push('area change retires retained volume '+action+' response: return is lazy; Update starts exactly one new native GET with no mixed/summary reads; late old completion cannot render, download or unlock that new851-row query');
 }
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});await query();await volumeSummary(851,786);assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.equal(await panel.locator('[data-nr-rows] tr').count(),25);assert.ok(await consult.evaluate(n=>n.getBoundingClientRect().height>=44));}
 const volumeStorage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.doesNotMatch(volumeStorage,/QA-VOLUMEN-|PERSONA SINTETICA VOLUMEN|99000786/);
 checks.push('complete synthetic851-contract review fits390/320px, preserves 44px controls and leaves no fictitious nominal census in browser storage');

 // Voluntary failures: plain gateway body, valid JSON failure, and the real
 // existing25s fetch timeout. No handler or synthetic SQL read occurs on them.
 await panel.getByRole('button',{name:'Limpiar filtros'}).click();await form.locator('[name=jurisdiction]').selectOption('42');await form.locator('[name=search]').fill('QA-VOLUMEN-0851');
 const expectedFailures={plain:'No se pudo completar la consulta del padrón. Volvé a consultar; tus filtros se conservan.',json:'Fallo sintético controlado. Volvé a consultar.',timeout:'La consulta demoró demasiado. Volvé a consultar; tus filtros se conservan.'};
 for(const [kind,message]of Object.entries(expectedFailures)){
  await query();await volumeSummary(1,1);const failureReads=apiReads.length,requestCount=resourceCount('nativeroster'),failure=failNextRoster(kind);
  try{
   await consult.click();await bounded(failure.entered.promise,'TRANSPORT_FAILURE_NOT_ENTERED_'+kind);
   await page.waitForFunction(expected=>document.querySelector('[data-nr-status]').textContent===expected,message,{timeout:kind==='timeout'?31000:12000});await ready();
   assert.equal(apiReads.length,failureReads,'transport error must not enter handler/SQL adapter');assert.equal(resourceCount('nativeroster'),requestCount+1,'no automatic retry');
   assert.equal(await panel.locator('[data-nr-rows]').textContent(),'');assert.equal(await panel.locator('[data-nr-result]').isVisible(),false);assert.equal(await panel.locator('[data-nr-xlsx]').isDisabled(),true);assert.equal(await panel.locator('[data-nr-csv]').isDisabled(),true);
   assert.equal(await form.locator('[name=search]').inputValue(),'QA-VOLUMEN-0851');assert.equal(await form.locator('[name=jurisdiction]').inputValue(),'42');assert.doesNotMatch(await panel.locator('[data-nr-status]').innerText(),/SyntaxError|Unexpected token|FUNCTION_INVOCATION_TIMEOUT|SYNTHETIC_TRANSPORT_ONLY/);
  }finally{failure.release.resolve();}
  await bounded(failure.delivered.promise,'TRANSPORT_FAILURE_DELIVERY_NOT_SETTLED_'+kind);await frames();
  assert.equal(await panel.locator('[data-nr-status]').innerText(),message);assert.equal(await panel.locator('[data-nr-rows]').textContent(),'');assert.equal(await panel.locator('[data-nr-result]').isVisible(),false);assert.equal(resourceCount('nativeroster'),requestCount+1);assert.equal(apiReads.length,failureReads);
  checks.push('friendly '+kind+' failure retires old rows/downloads, preserves search and jurisdiction, sends one GET with no retry, and reaches no handler/SQL adapter');
 }

 volumeMode=false;volumeInactive=false;volumeRevision=0;await panel.getByRole('button',{name:'Limpiar filtros'}).click();await query();

 mode='revoked';count=downloads.length;await panel.getByRole('button',{name:'Descargar Excel completo'}).click();await page.waitForFunction(()=>document.querySelector('[data-nr-status]').textContent.includes('Tu acceso'));assert.equal(downloads.length,count);assert.equal(await panel.locator('[data-nr-rows]').textContent(),'');checks.push('final authoritative permission revocation blocks download and clears data');mode='normal';
 assert.equal(await page.locator('#employeeRows [data-legajo]').count(),0);const priorDirectoryReads=apiReads.filter(r=>r.resource==='employees').length;await page.locator('#employeeHistory > summary').click();assert.equal(apiReads.filter(r=>r.resource==='employees').length,priorDirectoryReads);const beforeFirstHistoryCard=resourceCount('employees');await page.locator('#workforceWorkspace [data-workforce-status="administrative_active"]').click();await page.waitForFunction(()=>{const wrap=document.querySelector('#employeeTableWrap'),rows=document.querySelector('#employeeRows');return wrap?.getAttribute('aria-busy')==='false'&&!!rows?.querySelector('[data-legajo]')&&[...rows.querySelectorAll('button')].some(button=>button.textContent.trim()==='Ver ficha');});
 assert.equal(resourceCount('employees'),beforeFirstHistoryCard+1);checks.push('first historical cohort card before Buscar submits exactly one explicit employees GET without a duplicate change request');
 const open=async()=>{await page.locator('#employeeRows').getByRole('button',{name:'Ver ficha',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dialogBody').getAttribute('aria-busy')==='false');};await open();const dialog=page.locator('#employeeDialog');assert.match(await dialog.innerText(),/PERSONA SINTÉTICA ALTA PROPIA/);assert.match(await page.locator('#dialogSubtitle').innerText(),/MuniControl/);assert.equal(await dialog.locator('[data-adopted-history]').count(),0);checks.push('fresh own detail opens through the real handler without any GRH sentinel or imported history');await dialog.screenshot({path:path.join(out,'fresh-detail-320.png')});await page.keyboard.press('Escape');
 mode='detail-revoked';await open();assert.doesNotMatch(await dialog.innerText(),/PERSONA SINTÉTICA ALTA PROPIA|Resolución sintética/);checks.push('fresh detail final proof revocation delivers no stale private fields');await page.keyboard.press('Escape');
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(requests.some(r=>r.method!=='GET'),false);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok:true,checks,errors,writes:0,published:false,operatorAcceptance:false,api:'real createInternalDataHandler/internalNativeRoster/employees/employee/current read adapter',sql:'synthetic replies; this browser run does not verify SQL performance or production',volumeSyntheticOnly:true,refreshQueriesVerified:'one native GET per explicit Update, no employees/summary, busy through full delivery',volumeCensus:{contracts:851,people:786,pages:35,pageSize:25,statusVariantInactive:3},reads:apiReads.length},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,writes:0,errors}));
}catch(e){if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.message,stack:e.stack,checks,errors},null,2));throw e;}finally{for(const gate of heldRosterGates)gate.release.resolve();await browser.close();}
