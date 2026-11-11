import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {programOwnerQaPreview,programOwnerQaId as id} from './fixtures/municipal-owner-program-synthetic.js';
import {annulDetail} from './fixtures/own-payroll-annulment-synthetic.js';
import {detail as liquidationDetail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {OWN_LIQ_REVIEW} from '../assets/own-payroll-liquidation-model.js';

// Los paneles de nómina propia comprueban la sesión con un sondeo (cada 60 s en estos tres). El sondeo existe para retirar
// la vista cuando la sesión venció o cambió de cuenta. Con la misma sesión vigente no puede deshacer lo que la persona está
// llenando: en Reglas borraba cada minuto el motivo y la confirmación del propietario municipal (y releía la propuesta), en
// «Anular por período y tipo» destildaba la confirmación y en «Confirmar y anular» deseleccionaba los legajos elegidos.
// Paneles reales de assets/ en Chromium, API sintética con las fixtures de tests/, reloj adelantado: no se esperan 60 s.
const root=fileURLToPath(new URL('..',import.meta.url)),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const pages={
 '/reglas':['own-payroll-program-panel.js','mountOwnPayrollProgram','reglas'],
 '/anulacion':['own-payroll-annulment-panel.js','mountOwnPayrollAnnulment','anulacion'],
 '/decisiones':['own-payroll-liquidation-panel.js','mountOwnPayrollLiquidation','decisiones']
};
const html=([module,mount,task])=>`<!doctype html><html lang="es"><meta charset="utf-8"><title>QA sintético</title><div id="host"></div><script type="module">import{${mount}}from'/assets/${module}';${mount}(document.getElementById('host'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'${task}'}}));window.__mounted=true;</script></html>`;
const ownerCaps=['workforce.employee.read','employee.record.propose','payroll.parameter.read','payroll.parameter.prepare'];
let browser=null,server=null,origin='',world=null,calls=[];
const fresh=async()=>{const preview=await programOwnerQaPreview(),liquidation=liquidationDetail(6);return{user:'qa',authStatus:200,caps:[...new Set([...ownerCaps,...OWN_LIQ_REVIEW,'payroll.read'])],preview,liquidation,annulment:annulDetail(6),
 boot:{version:'own-payroll-program.v1',scopeVersion:preview.context.scopeVersion,salaryCatalog:{version:preview.proposal.salaryVersion,revision:1,items:preview.proposal.salaryItems},program:{version:preview.proposal.baseVersion,revision:1,definition:preview.proposal.baseDefinition,salaryVersion:preview.proposal.salaryVersion,proposalId:id(30),approvalId:id(31)},proposals:[{...preview.proposal,canReview:false,status:'pending',decision:null}],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false}};};
const auth=()=>({ok:true,authenticated:true,sessionVersion:2,user:{id:world.user,email:world.user+'@example.invalid'},access:{context:'tenant',tenant:{id:id(1),roleKey:'QA'},tenantCapabilities:world.caps},expiresAt:'2099-01-01T00:00:00Z'});
function answer(url){
 const resource=url.searchParams.get('resource');
 if(url.pathname==='/api/internal-auth')return world.authStatus===200?[200,auth()]:[world.authStatus,{ok:false}];
 if(url.pathname==='/api/internal-own-payroll-program'&&resource==='bootstrap')return[200,{ok:true,data:world.boot}];
 if(url.pathname==='/api/internal-municipal-owner-program'&&resource==='authority')return[200,{ok:true,data:world.preview.context}];
 if(url.pathname==='/api/internal-municipal-owner-program'&&resource==='preview')return[200,{ok:true,data:world.preview}];
 if(url.pathname==='/api/internal-own-payroll-annulment'&&resource==='detail')return[200,{ok:true,data:world.annulment}];
 if(url.pathname==='/api/internal-own-payroll-liquidation'&&resource==='bootstrap'){const d=world.liquidation;return[200,{ok:true,data:{version:'own-liquidation-bootstrap.v1',scopeVersion:d.scopeVersion,complete:true,runs:[{id:d.id,period:d.capture.body.period,liquidationType:d.capture.body.liquidationType,createdAt:'2026-10-05T12:00:00Z',employeeCount:d.employees.length,resultSha256:d.capture.saved.resultSha256,canConsult:true}]}}];}
 if(url.pathname==='/api/internal-own-payroll-liquidation'&&resource==='detail')return[200,{ok:true,data:world.liquidation}];
 return[404,{ok:false}];
}
// Como el resto de las pruebas con navegador de tests/: sin Chromium instalado (p. ej. la compilación de despliegue) se omiten.
before(async()=>{
 try{const {chromium}=await import('playwright');browser=await chromium.launch({headless:true});}catch{browser=null;return;}
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture.invalid');res.setHeader('Cache-Control','no-store');
  if(pages[url.pathname]){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html(pages[url.pathname]));}
  if(req.method==='GET'&&/^\/assets\/[a-z0-9-]+\.(?:js|css)$/.test(url.pathname)&&fs.existsSync(path.join(root,url.pathname))){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css':'text/javascript; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,url.pathname)));}
  if(url.pathname.startsWith('/api/')){calls.push(req.method+' '+url.pathname.replace('/api/internal-','')+(url.searchParams.get('resource')?'?'+url.searchParams.get('resource'):''));const [status,body]=answer(url);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify(body));}
  res.writeHead(404);res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());});
async function open(t,route){
 if(!browser){t.skip('Chromium unavailable');return null;}
 world=await fresh();calls=[];const context=await browser.newContext({viewport:{width:1366,height:1000},locale:'es-AR'});
 // Reglas completo a la vista («Ver todo junto»); el paso a paso se verifica aparte.
 await context.addInitScript(()=>{try{localStorage.setItem('mc.nomina.reglas.paso','todo');}catch{}});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 await page.clock.install();await page.goto(origin+route);await page.waitForFunction(()=>window.__mounted===true);
 const idle=()=>page.waitForFunction(()=>(document.querySelector('.own-program')??document.getElementById('host')).getAttribute('aria-busy')==='false');await idle();
 // Dispara el sondeo real del panel: adelanta 61 s el reloj de la página, espera la comprobación de sesión y deja un margen
 // para que aparezca cualquier lectura que el panel encadene después (antes del arreglo, Reglas releía la propuesta).
 const poll=async()=>{const from=calls.length,deadline=Date.now()+10000;await page.clock.fastForward(61000);
  while(calls.length===from){assert.ok(Date.now()<deadline,'el sondeo no comprobó la sesión');await new Promise(resolve=>setTimeout(resolve,20));}
  await idle();await page.waitForTimeout(300);await idle();return calls.slice(from);};
 return{page,idle,poll,errors,close:()=>context.close()};
}

test('Reglas: el sondeo conserva el motivo y la confirmación del propietario mientras la sesión es la misma; si cambia o vence, retira todo',async t=>{
 const reason='Apruebo el programa de cálculo tras revisar las reglas con Contaduría.';
 const filled=page=>page.evaluate(()=>({reason:document.querySelector('[data-op-reason]').value,confirmed:document.querySelector('[data-op-confirm]').checked,preview:!document.querySelector('[data-op-preview]').hidden,approve:!document.querySelector('[data-op-approve]').disabled,status:document.querySelector('[data-program-status]').textContent,content:!document.querySelector('[data-program-content]').hidden}));
 const prepare=async view=>{await view.page.locator('[data-op-preview]').waitFor({state:'visible'});await view.idle();await view.page.locator('[data-op-reason]').fill(reason);await view.page.locator('[data-op-confirm]').check();assert.equal((await filled(view.page)).approve,true);};
 const view=await open(t,'/reglas');if(!view)return;
 try{
  await prepare(view);await view.page.locator('[data-op-reason]').focus();
  for(let minute=1;minute<=3;minute++){
   assert.deepEqual(await view.poll(),['GET auth'],'el sondeo sólo comprueba la sesión: no vuelve a leer la propuesta ni la autorización');
   assert.deepEqual(await filled(view.page),{reason,confirmed:true,preview:true,approve:true,status:'Consulta completa y acceso verificados.',content:true},'minuto '+minute);
  }
  assert.equal(await view.page.evaluate(()=>document.activeElement?.hasAttribute('data-op-reason')),true,'la persona sigue escribiendo en el mismo campo');
  // Otra cuenta en la misma pestaña: se retira todo, también lo que escribió el propietario anterior.
  world.user='otra-cuenta';assert.deepEqual(await view.poll(),['GET auth']);
  assert.deepEqual(await filled(view.page),{reason:'',confirmed:false,preview:false,approve:false,status:'Cambió la sesión. Recuperá el intento desde su cuenta original.',content:false});
  assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
 for(const [label,change,status] of [['sesión vencida',()=>{world.authStatus=401;},'La sesión venció. Volvé a ingresar.'],['permiso de lectura retirado',()=>{world.caps=world.caps.filter(c=>c!=='payroll.parameter.read');},'Tu cuenta no permite esta operación de reglas.']]){
  const again=await open(t,'/reglas');
  try{await prepare(again);change();await again.poll();assert.deepEqual(await filled(again.page),{reason:'',confirmed:false,preview:false,approve:false,status,content:false},label);assert.deepEqual(again.errors,[]);}
  finally{await again.close();}
 }
 // Un permiso que cambia sin invalidar la lectura retira la decisión del propietario, como antes, y conserva la consulta.
 const reduced=await open(t,'/reglas');
 try{await prepare(reduced);world.caps=world.caps.filter(c=>c!=='payroll.calculation.approve');await reduced.poll();const shown=await filled(reduced.page);assert.equal(shown.reason,'');assert.equal(shown.confirmed,false);assert.equal(shown.content,true);assert.deepEqual(reduced.errors,[]);}
 finally{await reduced.close();}
});

test('Anular por período y tipo: el sondeo no destilda la confirmación ya marcada; con otra cuenta retira motivo, alcance y confirmación',async t=>{
 const view=await open(t,'/anulacion');if(!view)return;
 try{
  const {page}=view,reason='Anulación sintética: se cargó mal la novedad del mes.';
  await page.locator('[data-annul-period]').fill('2026-10');await page.locator('[data-annul-type]').selectOption('monthly');await page.locator('[data-annul-load]').click();await page.locator('[data-annul-detail]').waitFor({state:'visible'});await view.idle();
  await page.locator('[data-annul-kind]').selectOption('contracts');const options=await page.locator('[data-annul-values] option').evaluateAll(list=>list.map(o=>o.value));assert.ok(options.length>2);
  await page.locator('[data-annul-values]').selectOption(options.slice(0,2));await page.locator('[data-annul-reason]').fill(reason);await page.locator('[data-annul-confirm]').check();
  const filled=()=>page.evaluate(()=>({reason:document.querySelector('[data-annul-reason]').value,confirmed:document.querySelector('[data-annul-confirm]').checked,chosen:document.querySelector('[data-annul-values]').selectedOptions.length,send:!document.querySelector('[data-annul-send]').disabled,detail:!document.querySelector('[data-annul-detail]').hidden}));
  assert.deepEqual(await filled(),{reason,confirmed:true,chosen:2,send:true,detail:true});
  for(let minute=1;minute<=2;minute++){assert.deepEqual(await view.poll(),['GET auth']);assert.deepEqual(await filled(),{reason,confirmed:true,chosen:2,send:true,detail:true},'minuto '+minute);}
  world.user='otra-cuenta';await view.poll();assert.deepEqual(await filled(),{reason:'',confirmed:false,chosen:0,send:false,detail:false});
  assert.equal(await page.locator('[data-annul-status]').textContent(),'Cambió la sesión o la autoridad. Consultá el intento con la cuenta original.');assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});

test('Confirmar y anular: el sondeo relee la corrida y sólo rearma la decisión a medio preparar si la corrida cambió',async t=>{
 const view=await open(t,'/decisiones');if(!view)return;
 try{
  const {page}=view,reason='Confirmación sintética de dos legajos revisados.';
  await page.locator('[data-liq-run-id]').first().click();await page.locator('[data-liq-detail]').waitFor({state:'visible'});await view.idle();
  await page.locator('[data-liq-command]').selectOption('confirm');await page.locator('[data-liq-kind]').selectOption('contracts');const options=await page.locator('[data-liq-values] option').evaluateAll(list=>list.map(o=>o.value));assert.ok(options.length>2);
  const choose=async()=>{await page.locator('[data-liq-values]').selectOption(options.slice(0,2));await page.locator('[data-liq-review-search]').fill('1');await page.locator('[data-liq-confirm]').check();};
  await page.locator('[data-liq-reason]').fill(reason);await choose();
  const filled=()=>page.evaluate(()=>({command:document.querySelector('[data-liq-command]').value,kind:document.querySelector('[data-liq-kind]').value,chosen:document.querySelector('[data-liq-values]').selectedOptions.length,reason:document.querySelector('[data-liq-reason]').value,search:document.querySelector('[data-liq-review-search]').value,confirmed:document.querySelector('[data-liq-confirm]').checked,send:!document.querySelector('[data-liq-send]').disabled}));
  const prepared={command:'confirm',kind:'contracts',chosen:2,reason,search:'1',confirmed:true,send:true};assert.deepEqual(await filled(),prepared);
  for(let minute=1;minute<=2;minute++){assert.deepEqual(await view.poll(),['GET auth','GET own-payroll-liquidation?detail'],'la corrida abierta se sigue releyendo');assert.deepEqual(await filled(),prepared,'minuto '+minute);}
  // Otra persona decidió sobre la misma corrida: la vista se rearma y hay que elegir y confirmar de nuevo.
  world.liquidation={...world.liquidation,stateVersion:'e'.repeat(64)};assert.deepEqual(await view.poll(),['GET auth','GET own-payroll-liquidation?detail']);
  assert.deepEqual(await filled(),{...prepared,chosen:0,search:'',confirmed:false,send:false});
  assert.equal(await page.locator('[data-liq-trace] dd').last().textContent(),'e'.repeat(64));
  // La sesión vencida retira todo.
  await choose();world.authStatus=401;await view.poll();
  assert.deepEqual(await filled(),{command:'',kind:'',chosen:0,reason:'',search:'',confirmed:false,send:false});assert.equal(await page.locator('[data-liq-detail]').isHidden(),true);assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});

// Guardas sobre el código fuente: se cumplen aunque el entorno no tenga navegador.
test('ningún sondeo de sesión deshace el formulario por su cuenta cuando la sesión sigue igual',()=>{
 const program=read('assets/own-payroll-program-panel.js'),annulment=read('assets/own-payroll-annulment-panel.js'),liquidation=read('assets/own-payroll-liquidation-panel.js');
 // Reglas: el sondeo es la única operación que no retira la decisión del propietario al empezar; la retira si la sesión falla.
 assert.ok(program.includes('if(!ownerPublication&&!keepOwner)owner?.suspend();'));
 assert.ok(program.includes("if([401,403].includes(error.status)){access=null;clearViews();$('login').hidden=error.status!==401;if(keepOwner)owner?.suspend();}"));
 assert.ok(program.includes("perform(async valid=>{const held=[...access.caps].sort().join();await session(attempt?capsFor(attempt.body.command):PROGRAM_READ);if(valid()){if([...access.caps].sort().join()!==held)owner?.suspend();controls();}},{keepOwner:true});},60000);"));
 assert.equal(program.split('keepOwner:true').length-1,1,'sólo el sondeo conserva la decisión del propietario');
 assert.ok(annulment.includes("perform(async valid=>{const held=[...access.caps].sort().join();await session();if(valid()){if([...access.caps].sort().join()!==held)$('confirm').checked=false;controls();}});},60000);"));
 assert.ok(liquidation.includes('if(valid()){if(keepUnchanged&&current?.id===id&&JSON.stringify(v)===JSON.stringify(current))return;current=v;'));
 assert.ok(liquidation.includes('if(current)await loadDetail(current.id,valid,null,{keepUnchanged:true});if(valid())controls();});},60000);'));
 assert.equal(liquidation.split('keepUnchanged:true').length-1,1,'sólo el sondeo conserva la vista idéntica; abrir o consultar siempre la rearma');
});
