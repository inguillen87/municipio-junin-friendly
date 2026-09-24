// Real built workflow, intercepted synthetic service. Never forwards a business write or municipal credential.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
import {actionRecoveryService,recoveryBootstrap,recoveryCapabilities,recoveryContract} from '../tests/fixtures/action-command-recovery-synthetic.js';
const live=process.env.ACTION_RECOVERY_PUBLISHED_ORIGIN;if(live!==undefined)assert.equal(live,'https://municipio-junin-friendly.vercel.app');
const origin=live||'https://action-recovery.test',base=path.resolve('public'),out=path.resolve('verification/action-command-recovery');fs.mkdirSync(out,{recursive:true});
const service=actionRecoveryService(),checks=[],errors=[],requests=[],assets=new Set();let mode='empty',busyOnce=false,deny=false;
const browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
 if(!url.pathname.startsWith('/api/')){
  assert.equal(request.method(),'GET');const file=path.resolve(base,'.'+url.pathname);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  let body=fs.readFileSync(file);if(live){const target=url.pathname==='/centro-acciones.html'?origin+'/acciones':url.href;const r=await fetch(target,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,url.pathname);const actual=Buffer.from(await r.arrayBuffer());assert.ok(actual.equals(body),'Published bytes differ: '+url.pathname);body=actual;assets.add(url.pathname);}
  return route.fulfill({status:200,body,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'application/octet-stream'});
 }
 requests.push({path:url.pathname,method:request.method(),body:request.postData(),key:request.headers()['idempotency-key']});
 const send=(value,status=200)=>route.fulfill({status,json:value,headers:{'Cache-Control':'private, no-store'}});
 if(url.pathname==='/api/internal-auth')return send({ok:true,authenticated:true,user:{id:'synthetic-user',email:'qa@local.invalid',displayName:'Operador de prueba'},access:{tenantCapabilities:recoveryCapabilities,platformCapabilities:[],platformRoles:[]}});
 if(url.pathname!=='/api/internal-actions')return send({ok:false},403);
 if(deny)return send({ok:false,code:'ACTION_CAPABILITY_REQUIRED',error:'Acceso revocado en prueba'},403);
 if(request.method()==='GET'){const q=url.searchParams,type=q.get('caseType')||'leave_request';if(q.get('resource')==='bootstrap')return send(recoveryBootstrap(type==='overtime_entry'));if(q.get('resource')==='list')return send(service.list(type));if(q.get('resource')==='detail')return send(service.detail(q.get('id')));return send({ok:false},400);}
 assert.ok(['POST','PATCH'].includes(request.method()));const body=request.postDataJSON();if(body.command==='search_subjects')return send(recoveryBootstrap(body.caseType==='overtime_entry'));
 const key=request.headers()['idempotency-key'];assert.match(key,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);const responseMode=mode;mode='normal';
 if(busyOnce){busyOnce=false;return route.fulfill({status:409,json:{ok:false,code:'ACTION_SESSION_BUSY'},headers:{'Retry-After':'0.25','Cache-Control':'private, no-store'}});}
 if(responseMode==='not-arrived')return route.abort('failed');
 const result=service.apply(body,key);if(result.status>=400)return send(result.json,result.status);
 if(responseMode==='false-success')return send({ok:false,error:'PRIVATE_UNVERIFIED_RESPONSE'},200);
 if(responseMode==='empty')return send({},201);if(responseMode==='lost')return route.abort('failed');if(responseMode==='wrong-id'){result.json.data.id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';return send(result.json);}
 if(responseMode==='bad-impact'){result.json.data.payrollImpact.posted=true;return send(result.json);}
 return send(result.json,result.status);
});
try{
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/centro-acciones.html');await page.locator('#appShell:not([hidden])').waitFor();
 const wizard=page.locator('#actionWizard'),detail=page.locator('#actionDialog'),notice=page.locator('#actionRecoveryNotice');
 async function fillLeave(start='2026-10-01',end='2026-10-02'){
  await page.locator('#createActionButton').click();await page.locator('#actionEmployee').selectOption(recoveryContract);await page.locator('#actionLeaveType').selectOption('19');await page.locator('#wizardNext').click();
  await page.locator('#actionStartDate').fill(start);await page.locator('#actionEndDate').fill(end);await page.locator('#wizardNext').click();await page.locator('#actionEmployeeNote').fill('Referencia administrativa de prueba');await page.locator('#wizardNext').click();await page.locator('#actionConfirmTruth').check();
 }
 async function currentDetail(){await page.waitForFunction(()=>!document.getElementById('actionWizard').open&&!document.getElementById('overtimeWizard').open&&!document.getElementById('actionRecoveryNotice'));const expected=service.records.at(-1);await page.waitForFunction(value=>{const d=document.getElementById('actionDialog'),b=document.getElementById('actionDialogBody');return d.open&&b.getAttribute('aria-busy')==='false'&&!document.getElementById('actionRecoveryNotice')&&document.getElementById('actionDialogTitle').textContent.includes(value.caseNumber)&&[...b.querySelectorAll('dt')].some(n=>n.textContent.trim()==='Versión'&&n.nextElementSibling?.textContent.trim()===String(value.version));},expected);}
 await fillLeave();assert.match(await page.locator('#wizardReview').innerText(),/01 (?:de )?oct (?:de )?2026/);assert.match(await page.locator('#wizardReview').innerText(),/02 (?:de )?oct (?:de )?2026/);checks.push('Civil leave dates stay on October 1–2 in an Argentina browser instead of shifting a day backwards.');await page.locator('#wizardSubmit').click();await notice.waitFor();
 assert.equal(await wizard.evaluate(n=>n.open),true);assert.equal(service.commits,1);assert.equal(await page.locator('#actionStartDate').inputValue(),'2026-10-01');
 assert.doesNotMatch(await page.locator('#toastRegion').innerText(),/Borrador creado/);
 const storage=await page.evaluate(()=>sessionStorage.getItem('municontrol.action-idempotency.v1'));const journal=JSON.parse(storage);assert.equal(journal.entries.length,1);assert.deepEqual(Object.keys(journal.entries[0]).sort(),['fingerprint','key','savedAt']);assert.doesNotMatch(storage,/Referencia administrativa|2026-10-01|55555555/);
 checks.push('An empty successful HTTP response does not close the wizard or claim creation; only opaque retry metadata persists.');
 await page.screenshot({path:path.join(out,'pending-command-desktop.png')});
 await page.locator('#wizardBack').click();await page.locator('#wizardBack').click();await page.locator('#actionEndDate').fill('2026-10-03');await page.locator('#wizardNext').click();await page.locator('#wizardNext').click();await page.locator('#wizardSubmit').click();
 await page.getByText('Primero recuperá el resultado de la operación pendiente. No se envió una solicitud diferente.',{exact:true}).waitFor();assert.equal(service.calls.length,1);assert.equal(service.commits,1);
 checks.push('Editing the form after an uncertain save cannot send another distinct command before recovery.');
 await notice.getByRole('button',{name:'Ver bandeja sin cancelar el envío'}).click();assert.equal(await wizard.evaluate(n=>n.open),false);await notice.waitFor();
 await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await currentDetail();assert.equal(service.commits,1);assert.equal(service.calls.length,2);assert.equal(service.calls[0].key,service.calls[1].key);assert.deepEqual(service.calls[0].body,service.calls[1].body);assert.equal(service.records[0].payload.endsOn,'2026-10-02');assert.equal(await notice.count(),0);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('municontrol.action-idempotency.v1')),null);
 checks.push('Recovery from the main queue uses the original body and key even after closing the form; the synthetic service creates one case.');
 mode='lost';await detail.locator('[data-action-command="submit"]').click();await detail.locator('#decisionFormHost button[type=submit], #decisionHost button[type=submit], form button[type=submit]').last().click();await notice.waitFor();assert.equal(service.commits,2);const submitted=service.calls.at(-1);
 await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await currentDetail();assert.equal(service.commits,2);assert.equal(service.calls.at(-1).key,submitted.key);assert.equal(service.calls.at(-1).body.expectedVersion,1);assert.equal(service.records[0].status,'submitted');
 checks.push('A lost reply after submission is replayed with the original expected version and idempotency key, never submitted twice.');
 await detail.locator('[data-action-command="approve"]').click();await detail.locator('#manualValidationConfirmed').check();await detail.locator('#decisionReason').fill('Validación sintética sin efecto municipal');await detail.locator('form button[type=submit]').last().click();
 await page.getByText('Quien preparó o envió la solicitud no puede aprobarla. Debe intervenir otra persona autorizada.',{exact:true}).waitFor();await currentDetail();assert.equal(service.commits,2);assert.equal(service.records[0].status,'submitted');assert.equal(await notice.count(),0);
 checks.push('A server separation-of-duties rejection is not converted into success or bypassed by retry recovery.');
 mode='wrong-id';await detail.locator('[data-action-command="cancel"]').click();await detail.locator('#decisionReason').fill('Cancelación de prueba controlada');await detail.locator('form button[type=submit]').last().click();await notice.waitFor();assert.equal(service.commits,3);
 await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await currentDetail();assert.equal(service.commits,3);assert.equal(service.records[0].status,'cancelled');assert.equal(await detail.locator('[data-action-command]').count(),0);
 checks.push('A receipt referring to another case stays unconfirmed; the correct replay clears the recovery and shows the terminal state.');
 await page.locator('#closeActionDialog').click();await page.locator('#createOvertimeButton').click();
 await page.locator('#overtimeEmployee').selectOption(recoveryContract);await page.locator('#overtimeWorkDate').fill('2026-10-01');await page.locator('#overtimeDeclaredMinutes').fill('73');await page.locator('#overtimeReason').selectOption('service_continuity');await page.locator('#overtimeConfirmTruth').check();mode='bad-impact';await page.locator('#overtimeSubmit').click();await notice.waitFor();assert.equal(service.commits,4);assert.equal(await page.locator('#overtimeWizard').evaluate(n=>n.open),true);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'pending-command-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await currentDetail();assert.equal(service.commits,4);assert.equal(service.records[1].status,'draft');assert.equal(service.records[1].payrollImpact.posted,false);
 checks.push('Overtime rejects an acknowledgement claiming a payroll posting; the original draft can be recovered on a narrow screen without a second declaration.');
 await page.setViewportSize({width:1440,height:1050});await page.locator('#closeActionDialog').click();await fillLeave('2026-10-05','2026-10-06');mode='normal';busyOnce=true;const postCount=requests.filter(r=>r.method==='POST'&&r.path==='/api/internal-actions').length;await page.locator('#wizardSubmit').click();await currentDetail();assert.equal(service.commits,5);assert.equal(requests.filter(r=>r.method==='POST'&&r.path==='/api/internal-actions').length,postCount+2);assert.equal(await notice.count(),0);
 checks.push('One session-lock retry remains bounded and preserves the normal workflow, with one committed draft in the fixture.');
 await page.locator('#closeActionDialog').click();await fillLeave('2026-10-08','2026-10-09');mode='lost';await page.locator('#wizardSubmit').click();await notice.waitFor();const commitBefore=service.commits;deny=true;await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await page.getByText('Acceso revocado en prueba',{exact:true}).first().waitFor();assert.equal(service.commits,commitBefore);assert.equal(await notice.count(),0);
 checks.push('Revoked access blocks recovery rather than impersonating a reviewer; the uncertain operation is not silently resent under a new key.');
 deny=false;await page.locator('#closeWizard').click();await fillLeave('2026-10-11','2026-10-12');mode='false-success';const previous=service.commits;await page.locator('#wizardSubmit').click();await notice.waitFor();assert.equal(service.commits,previous+1);assert.doesNotMatch(await page.locator('#toastRegion').innerText(),/PRIVATE_UNVERIFIED_RESPONSE/);
 const key=service.calls.at(-1).key;await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await currentDetail();assert.equal(service.commits,previous+1);assert.equal(service.calls.at(-1).key,key);
 checks.push('Contradictory HTTP 200 with ok:false keeps the original key and never displays its unverified error text.');
 await page.locator('#closeActionDialog').click();await fillLeave('2026-10-15','2026-10-16');mode='not-arrived';const committed=service.commits;await page.locator('#wizardSubmit').click();await notice.waitFor();assert.equal(service.commits,committed);
 const firstAttempt=requests.filter(r=>r.path==='/api/internal-actions'&&r.method==='POST').at(-1);await notice.getByRole('button',{name:'Recuperar el mismo envío'}).click();await currentDetail();const recovered=requests.filter(r=>r.path==='/api/internal-actions'&&r.method==='POST').at(-1);assert.equal(service.commits,committed+1);assert.equal(firstAttempt.key,recovered.key);assert.equal(firstAttempt.body,recovered.body);
 checks.push('If the first request never arrives, manual recovery processes the already-confirmed operation once with the same request and key.');
 assert.deepEqual(errors,[]);
 const result={version:'action-command-recovery-qa.v1',checkedAt:new Date().toISOString(),checksPassed:checks.length,checks,errors,mode:live?'published_bytes_synthetic_commands':'local_build_synthetic_commands',publishedAssets:[...assets].sort(),syntheticCommits:service.commits,syntheticCommandAttempts:service.calls.length,realMunicipalSessionTested:false,businessWrites:0};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await context.close();await browser.close();}
