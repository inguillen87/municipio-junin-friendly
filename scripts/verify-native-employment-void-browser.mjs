// «Corregir alta histórica» in a real browser with Root's synthetic fixtures (tests/fixtures/native-employment-void).
// Every API answer is a fixture; nothing reaches a municipal API. Proves: eligibility, proposal body, uncertain send
// recovered by the same key, maker-checker, approval with superseded bajas, rejection, blocked by use, not applicable.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const root=fs.realpathSync(new URL('..',import.meta.url)),fx=path.join(root,'tests/fixtures/native-employment-void');
const arg=process.argv.slice(2);const output=path.resolve(arg[0]?.startsWith('--output=')?arg[0].slice(9):'verification/native-employment-void-browser');
assert.ok(output.startsWith(path.join(root,'verification')+path.sep));fs.mkdirSync(output,{recursive:true});
const origin='http://127.0.0.1:4371',A='f1000000-0000-4000-8000-000000000001',C='f1000000-0000-4000-8000-000000000003',B='f1000000-0000-4000-8000-000000000002';
const read=name=>JSON.parse(fs.readFileSync(path.join(fx,name),'utf8'));
const checks=[];const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);};
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
async function scenario(label,contractId,plan){
 const context=await browser.newContext({viewport:{width:1100,height:900},locale:'es-AR'});const posts=[],gets=[];let script=[...plan];
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/native-employment-lifecycle.css"></head><body><main><p>FIXTURE SINTÉTICA · no es un legajo real</p><section id="host"></section></main><script type="module">import {mountNativeEmploymentVoid} from '/assets/native-employment-void.js';window.__mounted=mountNativeEmploymentVoid(document.getElementById('host'),{contractId:'${contractId}',onApplied(){window.__applied=(window.__applied||0)+1;}});</script></body></html>`});
  if(u.pathname==='/api/internal-employment-void'){
   const step=script.shift();assert.ok(step,label+': unexpected '+req.method()+' '+u.searchParams.get('resource'));
   if(req.method()==='POST'){posts.push({body:JSON.parse(req.postData()),key:req.headers()['idempotency-key']});}else gets.push(u.searchParams.get('resource'));
   assert.equal(step.expect,req.method()==='POST'?'POST':u.searchParams.get('resource'),label+': request order');
   if(step.abort)return route.abort('connectionreset');
   const body=step.body??read(step.file);return route.fulfill({status:step.status??200,contentType:'application/json',headers:step.headers??{},body:JSON.stringify(body)});}
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 await page.goto(origin+'/');return {page,posts,gets,errors,left:()=>script.length,done:async()=>{check(!errors.length,label+': no page errors '+errors.join(' | '));check(script.length===0,label+': every planned answer was used');await context.close();}};
}
const host=p=>p.locator('#host');

// 1. Preparer: eligible → propose; the first send is cut, the same key is consulted and confirmed.
{const s=await scenario('propose',A,[{expect:'bootstrap',file:'responses/bootstrap-A-eligible.json'},{expect:'POST',abort:true},{expect:'attempt',file:'responses/receipt-A-proposed-replay.json'},{expect:'bootstrap',file:'responses/bootstrap-A-own-pending.json'}]);
 const h=host(s.page);await h.getByRole('heading',{name:'Corregir alta histórica'}).waitFor();
 check(await h.getByText('2 bajas pendientes de revisión: si se aprueba esta corrección ya no se podrán aprobar; quedan en el historial y se pueden rechazar.').isVisible(),'eligible: the two pending bajas are explained in business words');
 check(await h.getByRole('cell',{name:'sin fecha (no se registra)'}).isVisible(),'eligible: before/after shows no exit date is recorded');
 const reason=h.getByLabel('Motivo');check((await reason.inputValue()).startsWith('Legajo histórico sin relación laboral vigente'),'eligible: the agreed reason is prefilled');
 await reason.fill('Incorporación histórica sintética sin relación vigente, para prueba de interfaz.');
 await h.getByRole('button',{name:'Enviar a revisión'}).click();check(s.posts.length===0,'propose: nothing is sent before the explicit confirmation');
 await h.getByLabel('Confirmo que es un alta histórica sin relación laboral vigente con el municipio.').check();await h.getByRole('button',{name:'Enviar a revisión'}).click();
 await h.getByRole('heading',{name:'Envío sin confirmar'}).waitFor();
 const expected=read('requests/propose-A.json');check(JSON.stringify(s.posts[0].body)===JSON.stringify(expected),'propose: body equals Root\'s request fixture exactly');
 check(/^[0-9a-f-]{36}$/.test(s.posts[0].key),'propose: Idempotency-Key is a UUID');
 await h.getByRole('button',{name:'Consultar confirmación'}).click();await h.getByText('Propuesta enviada a revisión. La decide otra persona.').waitFor();
 check(await h.getByText(/^Pendiente de revisión · propuso/).isVisible(),'propose: the pending proposal is listed');
 check(await h.getByRole('button',{name:'Enviar a revisión'}).count()===0,'propose: no second proposal is offered while one is pending');
 await s.page.screenshot({path:path.join(output,'propose.png'),fullPage:true});await s.done();}

// 2. Own proposal: general canReview is true but the proposal's own canReview is false → no decision buttons.
{const s=await scenario('own',A,[{expect:'bootstrap',file:'responses/bootstrap-A-own-pending.json'},{expect:'proposal',file:'responses/proposal-A-pending-own.json'}]);
 const h=host(s.page);await h.getByRole('button',{name:'Ver propuesta'}).click();await h.getByText('La decide otra persona con permiso de aprobación: no se puede aprobar una propuesta propia.').waitFor();
 check(await h.getByRole('button',{name:'Aprobar corrección'}).count()===0,'own: approval is not offered for one\'s own proposal');await s.done();}

// 3. Reviewer approves: receipt lists the superseded bajas; bootstrap shows the withdrawal seal.
{const s=await scenario('approve',A,[{expect:'bootstrap',file:'responses/bootstrap-A-pending-independent-review.json'},{expect:'proposal',file:'responses/proposal-A-pending-reviewer.json'},{expect:'POST',status:201,file:'responses/receipt-A-approved.json'},{expect:'bootstrap',file:'responses/bootstrap-A-withdrawn.json'}]);
 const h=host(s.page);await h.getByRole('button',{name:'Ver y decidir'}).click();await h.getByRole('button',{name:'Aprobar corrección'}).waitFor();
 await h.getByRole('button',{name:'Aprobar corrección'}).click();check(s.posts.length===0,'approve: a decision needs its reason first');
 await h.getByLabel('Motivo de la decisión').fill(read('requests/approve-A.json').payload.reason);await h.getByRole('button',{name:'Aprobar corrección'}).click();
 await h.getByText(/^Corrección aprobada: el legajo salió del padrón activo/).waitFor();
 check(JSON.stringify(s.posts[0].body)===JSON.stringify(read('requests/approve-A.json')),'approve: body equals Root\'s request fixture exactly');
 check(await h.getByText('2 bajas pendientes ya no se pueden aprobar; se pueden rechazar.',{exact:false}).isVisible(),'approve: the receipt names the bajas that can no longer be approved');
 check(await h.getByText('Retirado del padrón por corrección de alta').isVisible(),'approve: the record shows the withdrawal seal');
 check(await s.page.evaluate(()=>window.__applied)===1,'approve: the directory is told the padrón changed');
 check(await h.getByRole('button',{name:'Enviar a revisión'}).count()===0,'withdrawn: nothing else is offered');
 await s.page.screenshot({path:path.join(output,'approved.png'),fullPage:true});await s.done();}

// 4. Reviewer rejects: the contract stays active.
{const s=await scenario('reject',B,[{expect:'bootstrap',body:{...read('responses/bootstrap-B-eligible.json'),data:{...read('responses/bootstrap-B-eligible.json').data,proposals:[{id:read('responses/proposal-B-rejected.json').data.proposal.id,contractId:B,status:'pending',reason:read('responses/proposal-B-rejected.json').data.proposal.reason,createdAt:read('responses/proposal-B-rejected.json').data.proposal.createdAt,authorLabel:read('responses/proposal-B-rejected.json').data.proposal.authorLabel,proposalVersion:read('responses/proposal-B-rejected.json').data.proposal.proposalVersion,canReview:true}],permissions:{canPropose:true,canReview:true}}}},
  {expect:'proposal',body:(()=>{const v=read('responses/proposal-B-rejected.json');return {...v,data:{...v.data,proposal:{...v.data.proposal,status:'pending',canReview:true,review:null}}};})()},{expect:'POST',status:201,file:'responses/receipt-B-rejected.json'},{expect:'bootstrap',file:'responses/bootstrap-B-after-rejection.json'}]);
 const h=host(s.page);await h.getByRole('button',{name:'Ver y decidir'}).click();await h.getByLabel('Motivo de la decisión').fill(read('requests/reject-B.json').payload.reason);
 await h.getByRole('button',{name:'Rechazar'}).click();await h.getByText('Corrección rechazada: el legajo sigue en el padrón activo.').waitFor();
 check(s.posts[0].body.payload.decision==='reject','reject: the decision sent is reject');check(await h.getByText('En el padrón activo',{exact:true}).isVisible(),'reject: the record stays in the active padrón');await s.done();}

// 5. In use by own payroll: no proposal is offered; the reason is in words.
{const s=await scenario('in-use',C,[{expect:'bootstrap',file:'responses/bootstrap-C-in-use.json'}]);
 const h=host(s.page);await h.getByText('No se puede corregir mientras está incluido en un cálculo propio.').waitFor();
 check(await h.getByRole('button',{name:'Enviar a revisión'}).count()===0,'in use: the form is not offered');await s.done();}

// 6. A contract outside this correction: the section does not appear.
{const s=await scenario('not-applicable',A,[{expect:'bootstrap',status:409,body:{ok:false,code:'NATIVE_EMPLOYMENT_VOID_ORIGIN_NOT_SUPPORTED',error:'Esta corrección corresponde a un legajo histórico incorporado al padrón.'}}]);
 await s.page.waitForFunction(()=>!document.getElementById('host').dataset.nevMounted||document.getElementById('host').hidden===true);
 await s.page.waitForTimeout(300);check(await s.page.locator('#host').isHidden()&&(await s.page.locator('#host').innerText())==='','not applicable: nothing is shown');await s.done();}

// 7. A refused send (maker-checker) drops the attempt: no «Reenviar el mismo intento» for something that was not recorded.
{const s=await scenario('refused',A,[{expect:'bootstrap',file:'responses/bootstrap-A-eligible.json'},{expect:'POST',status:403,file:'responses/error-actor_required.json'}]);
 const h=host(s.page);await h.getByLabel('Confirmo que es un alta histórica sin relación laboral vigente con el municipio.').check();await h.getByRole('button',{name:'Enviar a revisión'}).click();
 await h.getByText(read('responses/error-actor_required.json').error).waitFor();check(await h.getByRole('button',{name:'Reenviar el mismo intento'}).count()===0,'refused: a definite refusal leaves no attempt to resend');await s.done();}

await browser.close();
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks:checks.length,syntheticOnly:true,productionCalls:0,list:checks},null,2));
console.log(JSON.stringify({ok:true,checks:checks.length}));
