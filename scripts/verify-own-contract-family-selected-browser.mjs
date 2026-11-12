// Local browser, synthetic users and in-memory API. Every network request is
// intercepted; no municipal session, database, proposal or approval is used.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {familySelectedCommand,FAMILY_SELECTED_VERSION} from '../assets/own-contract-family-payroll-facts-selection.js';
import {familyPayrollFactsHash,FAMILY_PAYROLL_FACTS_VERSION} from '../assets/own-contract-family-payroll-facts-model.js';
import {syntheticFamilySource,syntheticFamilyDefinition,familyId,familyHash} from '../tests/fixtures/own-contract-family-payroll-facts-synthetic.js';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'verification','own-contract-family-selected');fs.mkdirSync(output,{recursive:true});
const origin='https://selected-family.invalid',endpoint='/api/internal-own-contract-family-payroll-facts-selection',legacyEndpoint='/api/internal-own-contract-family-payroll-facts',period='2026-10';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const READ=['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read'];
const actors={maker:{id:'qa-maker',email:'selected-preparer@example.invalid',caps:[...READ,'payroll.parameter.prepare']},checker:{id:'qa-checker',email:'selected-reviewer@example.invalid',caps:[...READ,'payroll.parameter.approve']}};
const subjects=syntheticFamilySource(848).subjects.map((s,i)=>({...s,employeeName:'Persona exclusivamente sintética '+(i+1)})),tenant=familyId(20000);
const third={contractId:subjects[2].contractId,identityToken:subjects[2].identityToken,revision:1,approvalId:familyId(30001),definition:syntheticFamilyDefinition()};third.definition.quantities.children='1';
const server={actor:actors.maker,records:new Map([[third.contractId,third]]),proposals:[],attempts:new Map(),revision:1,drop:false};
const outsideSha=sha(third),writes=[],checks=[],errors=[];
const check=(ok,name)=>{assert.ok(ok,name);checks.push(name);};
const permission=()=>({canPropose:server.actor.caps.includes('payroll.parameter.prepare'),canReview:server.actor.caps.includes('payroll.parameter.approve')});
const selectedSource=ids=>({version:sha(['source',ids]),subjects:subjects.filter(s=>ids.includes(s.contractId))});
const scope=ids=>sha(['scope',server.actor.id,ids]);
const configuration=ids=>{const records=[...server.records.values()].filter(r=>ids.includes(r.contractId)).sort((a,b)=>a.contractId.localeCompare(b.contractId));return{version:sha(['base',period,ids,records]),records,items:records.map(({contractId,identityToken,definition})=>({contractId,identityToken,definition}))};};
const summary=p=>({id:p.id,requestSha256:p.requestSha256,baseVersion:p.body.baseVersion,sourceVersion:p.body.sourceVersion,itemCount:p.body.contractIds.length,reason:p.body.reason,createdAt:p.createdAt,authorLabel:'Preparador exclusivamente sintético',canReview:p.status==='pending'&&server.actor!==p.author&&permission().canReview,status:p.status,decision:p.decision,contractIds:p.body.contractIds});
const legacyPending={id:familyId(40000),requestSha256:familyHash,baseVersion:familyHash,sourceVersion:familyHash,itemCount:848,reason:'Propuesta completa exclusivamente sintética pendiente',createdAt:'2026-10-12T12:00:00Z',authorLabel:'Preparador exclusivamente sintético',canReview:false,status:'pending',decision:null};
const history=()=>({version:FAMILY_SELECTED_VERSION,period,proposals:server.proposals.map(summary),permissions:permission(),complete:true,payrollCalculated:false,payrollPosted:false});
const bootstrap=ids=>({...history(),contractIds:ids,scopeVersion:scope(ids),source:selectedSource(ids),configuration:configuration(ids),legacyPendingProposals:[legacyPending]});
const legacy=()=>({version:FAMILY_PAYROLL_FACTS_VERSION,period,scopeVersion:familyHash,source:{version:familyHash,subjects},configuration:{version:sha('global'+server.revision),revision:server.revision,items:configuration(subjects.map(s=>s.contractId)).items,proposalId:familyId(30000),approvalId:familyId(30001)},proposals:[legacyPending],permissions:permission(),complete:true,payrollCalculated:false,payrollPosted:false});
const detail=p=>({version:FAMILY_SELECTED_VERSION,period,contractIds:p.body.contractIds,scopeVersion:scope(p.body.contractIds),proposal:summary(p),body:p.body,baseItems:p.baseItems,source:selectedSource(p.body.contractIds),current:p.body.baseVersion===configuration(p.body.contractIds).version&&p.body.sourceVersion===selectedSource(p.body.contractIds).version,permissions:permission()});
async function command(key,body){
 familySelectedCommand(body);const fingerprint=await familyPayrollFactsHash(body);
 if(server.attempts.has(key)){assert.equal(server.attempts.get(key).requestSha256,fingerprint);return{...server.attempts.get(key),replayed:true};}
 let proposal,eventId=randomUUID();
 if(body.command==='propose'){
  assert.ok(permission().canPropose);assert.equal(body.baseVersion,configuration(body.contractIds).version);assert.equal(body.sourceVersion,selectedSource(body.contractIds).version);
  proposal={id:eventId,body:structuredClone(body),requestSha256:fingerprint,author:server.actor,status:'pending',decision:null,createdAt:new Date().toISOString(),baseItems:structuredClone(configuration(body.contractIds).items)};server.proposals.push(proposal);
 }else{
  proposal=server.proposals.find(p=>p.id===body.proposalId);assert.ok(proposal&&proposal.status==='pending'&&proposal.author!==server.actor&&permission().canReview);assert.equal(body.proposalSha256,proposal.requestSha256);
  if(body.command==='approve'){assert.equal(body.baseVersion,configuration(body.contractIds).version);server.revision++;for(const item of proposal.body.items)server.records.set(item.contractId,{...structuredClone(item),revision:server.revision,approvalId:eventId});}
  proposal.status=body.command==='approve'?'approved':'rejected';proposal.decision={command:body.command,reason:body.reason,actorLabel:'Revisor exclusivamente sintético',recordedAt:new Date().toISOString(),revision:server.revision};
 }
 const receipt={version:FAMILY_SELECTED_VERSION,eventId,proposalId:proposal.id,requestKey:key,requestSha256:fingerprint,body:structuredClone(body),status:proposal.status,revision:server.revision,configurationVersion:configuration(body.contractIds).version,replayed:false,payrollCalculated:false,payrollPosted:false};
 server.attempts.set(key,receipt);writes.push({key,command:body.command,contractIds:body.contractIds});return receipt;
}
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA selección familiar</title><body style="margin:0;font:16px system-ui;background:#f3f7f5"><main style="max-width:1180px;margin:auto;padding:16px"><div id="host"></div></main><script type="module">import {mountOwnContractFamilyPayrollFacts} from '/assets/own-contract-family-payroll-facts-panel.js';mountOwnContractFamilyPayrollFacts(document.getElementById('host'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'familia'}}));window.listo=true;</script></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
try{
 const context=await browser.newContext({viewport:{width:1366,height:900},locale:'es-AR',reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:server.actor.id,email:server.actor.email},access:{context:'tenant',tenant:{id:tenant,roleKey:'QA'},tenantCapabilities:server.actor.caps,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
  if(u.pathname===legacyEndpoint)return route.fulfill({json:{ok:true,data:legacy()}});
  if(u.pathname===endpoint){
   if(req.method()==='POST'){
    const body=JSON.parse(req.postData());if(body.operation==='bootstrap')return route.fulfill({json:{ok:true,data:bootstrap(body.payload.contractIds)}});
    const receipt=await command(req.headers()['idempotency-key'],body.payload);if(server.drop){server.drop=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta sintética interrumpida después de conservar el intento.'}});}return route.fulfill({json:{ok:true,data:receipt}});
   }
   const resource=u.searchParams.get('resource');if(resource==='history')return route.fulfill({json:{ok:true,data:history()}});
   if(resource==='detail'){const p=server.proposals.find(p=>p.id===u.searchParams.get('id'));return route.fulfill({json:{ok:true,data:detail(p)}});}
   if(resource==='attempt'){const receipt=server.attempts.get(u.searchParams.get('key'));return receipt?route.fulfill({json:{ok:true,data:{...receipt,replayed:true}}}):route.fulfill({status:404,json:{ok:false,code:'FAMILY_PAYROLL_FACTS_NOT_FOUND',error:'No registrado'}});}
  }
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena al ensayo sintético'}});
  const file=path.resolve(root,u.pathname.slice(1));if(req.method()!=='GET'||!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:path.extname(file)==='.css'?'text/css':'text/javascript',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const s=key=>page.locator('[data-family-selected-'+key+']'),idle=()=>page.waitForFunction(()=>document.querySelector('.family-selected')?.getAttribute('aria-busy')==='false');
 const open=async actor=>{server.actor=actor;await page.goto('about:blank');await page.goto(origin);await page.waitForFunction(()=>window.listo&&document.querySelector('[data-family-selected-target]')?.disabled===false);await idle();};
 const consult=async()=>{await s('period').fill(period);await s('refresh').click();await idle();await s('content').waitFor({state:'visible'});};
 const choose=async id=>page.locator('[data-family-selected-contract="'+id+'"]').check();
 await open(actors.maker);await consult();
 check((await s('count').innerText()).includes('848 disponibles')&&await s('options').locator('input').count()===10,'848 candidates are paged without creating any declaration');
 check(writes.length===0&&server.records.size===1,'catalog and history reads do not propose or fill the missing population');
 await choose(subjects[0].contractId);await s('next').click();
 check((await s('page').innerText()).startsWith('Página 2 ')&&await s('options').locator('input').count()===10&&(await s('selection-count').innerText()).startsWith('1 contrato'),'moving to another page retains the explicit selection');
 await s('prev').click();
 check((await s('page').innerText()).startsWith('Página 1 ')&&await page.locator('[data-family-selected-contract="'+subjects[0].contractId+'"]').isChecked(),'returning to the original page keeps its checkbox selected');
 await s('search').fill('QA-848');await choose(subjects[847].contractId);await s('search').fill('no existe');
 check((await s('selection-count').innerText()).startsWith('2 contratos')&&await s('options').locator('input').count()===0,'selection survives search and pagination and does not mean filtered results');
 await s('load').click();await idle();await s('scope').waitFor({state:'visible'});
 check(await s('rows').locator('[data-family-selected-row]').count()===2&&await s('rows').locator('input').count()===34,'only the two chosen contracts receive editable definitions');
 check((await s('legacy').innerText()).includes('Sigue pendiente')&&writes.length===0,'overlapping complete proposal is visible and untouched');
 const rows=s('rows').locator('[data-family-selected-row]');
 check(await rows.first().getByLabel('Hijos',{exact:true}).inputValue()===''&&await rows.last().getByLabel('Prenatal',{exact:true}).inputValue()==='','unknown quantities start empty, without inferred zeros');
 await rows.first().getByLabel('Hijos',{exact:true}).fill('2');await rows.last().getByLabel('Prenatal',{exact:true}).fill('0');
 for(let i=0;i<2;i++){await rows.nth(i).getByLabel('Fecha de la constancia',{exact:true}).fill('2026-10-01');await rows.nth(i).getByLabel('Constancia municipal',{exact:true}).fill('DDJJ exclusivamente sintética QA '+(i+1));}
 await s('reason').fill('Declaración exclusivamente sintética para los dos contratos elegidos');
 await page.locator('.family-selected').screenshot({path:path.join(output,'seleccion-desktop.png')});
 await s('prepare').click();await idle();await s('comparison').waitFor({state:'visible'});
 check((await s('diff-count').innerText()).includes('2 contratos')&&await s('diff').locator('tbody tr').count()===34,'comparison shows all17 fields for each selected contract');
 check((await s('diff').innerText()).includes('01/10/2026')&&(await s('diff').innerText()).includes('Sin informar'),'comparison retains readable evidence dates and distinguishes unknowns');
 await s('confirm').check();server.drop=true;await s('send').click();await idle();await s('recover').waitFor({state:'visible'});
 check(writes.length===1&&server.proposals[0].body.items.length===2&&server.records.size===1,'uncertain response conserves exactly one two-row pending proposal and approves nothing');
 await s('recover').click();await idle();await s('receipt').waitFor({state:'visible'});
 check(writes.length===1&&(await s('receipt').innerText()).includes('2 contratos'),'same-attempt read recovers the receipt without replaying a command');
 const payload=server.proposals[0].body;
 check(payload.items[0].definition.quantities.children==='2'&&payload.items[1].definition.quantities.prenatal==='0'&&payload.items[0].definition.quantities.spouse===null,'exact explicit quantities and unknown values survive browser serialization');
 await open(actors.checker);await consult();await s('waiting-open').click();await idle();await s('decision-fields').waitFor({state:'visible'});
 check(await s('diff').locator('tbody tr').count()===34&&server.proposals[0].author!==server.actor,'another synthetic user reviews the conserved two-contract content');
 await s('decision').selectOption('approve');await s('decision-reason').fill('Revisión independiente exclusivamente sintética de la selección');await s('review').click();await idle();await s('confirm').check();await s('send').click();await idle();
 check((await s('receipt').innerText()).includes('Aprobada')&&writes.length===2&&server.records.size===3,'one independent decision approves only the two selected contracts');
 check(sha(server.records.get(third.contractId))===outsideSha,'the unrelated approved record keeps its original definition revision and approvalId');
 await page.locator('[data-family-legacy-history] > summary').click();await page.waitForFunction(()=>document.querySelector('[data-family-facts-target]')?.disabled===false);
 await page.locator('[data-family-facts-period]').fill(period);await page.locator('[data-family-facts-refresh]').click();await page.waitForFunction(()=>document.querySelector('.own-family-facts')?.getAttribute('aria-busy')==='false');await page.locator('[data-family-facts-content]').waitFor({state:'visible'});
 await page.locator('.own-family-facts details > summary').filter({hasText:'Propuestas y decisiones anteriores'}).click();
 const legacyCount=await page.locator('[data-family-facts-count]').innerText(),legacyProposal=await page.locator('[data-family-facts-proposal]').innerText();
 if(!legacyCount.includes('848 contratos')||!legacyProposal.includes('Propuesta completa exclusivamente sintética pendiente'))console.log(JSON.stringify({completedChecks:checks,legacyCount,legacyProposal,legacyStatus:await page.locator('[data-family-facts-status]').innerText()}));
 check(legacyCount.includes('848 contratos')&&legacyProposal.includes('Propuesta completa exclusivamente sintética pendiente'),'legacy whole-cohort history and pending proposal remain reachable');
 check(writes.length===2,'opening the legacy history sends no business mutation');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'otra'}})));
 check(await s('rows').locator('input').count()===0&&await s('options').locator('input').count()===0&&await s('diff').locator('tr').count()===0,'switching task clears nominal selected content from the screen');
 await page.setViewportSize({width:390,height:844});await open(actors.maker);await consult();await choose(subjects[0].contractId);await s('load').click();await idle();
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile selected view has no horizontal overflow');
 await page.locator('.family-selected').screenshot({path:path.join(output,'seleccion-mobile.png')});
 check(errors.length===0,'browser reports no uncaught runtime error');
 const result={version:'family-selected-browser-qa.v1',status:'PASS',checks,checkCount:checks.length,synthetic:true,municipalSessionsUsed:0,municipalWrites:0,network:'all requests intercepted for one .invalid origin',screenshots:'internal synthetic visual QA only; excluded from deliverable archives'};
 fs.writeFileSync(path.join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,synthetic:true}));
}finally{await browser.close();}
