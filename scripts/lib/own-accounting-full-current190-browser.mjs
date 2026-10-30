// Same minted canonical190 h/db, after203/206 and before its original reopen.
// Read/export only: no foundation, seed, role, SQL facade or command is added.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnImputationHandler} from '../../api/internal-own-payroll-imputation.js';
import {createOwnJournalHandler} from '../../api/internal-own-payroll-journal.js';
import {imputationDetail,approvedImputationCsv} from '../../assets/own-payroll-imputation-workspace-model.js';
import {journalBootstrap,journalDetail,journalCsv} from '../../assets/own-payroll-journal-model.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {OWN_RUN_NATURES} from '../../assets/own-payroll-run-workspace-model.js';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
const IMP='/api/internal-own-payroll-imputation',JOURNAL='/api/internal-own-payroll-journal';
const sha=value=>createHash('sha256').update(value).digest('hex');
export const ACCOUNTING190_READ_STATEMENTS=Object.freeze({
 'SELECT public.own_imputation_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result':3,
 'SELECT public.own_imputation_detail_full_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_journal_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result':3,
 'SELECT public.own_journal_detail_full_v1($1::jsonb,$2::uuid) AS result':2
});
export function accounting190ReadSql(db,trace){
 assert.equal(typeof db?.query,'function');assert.ok(Array.isArray(trace));
 return Object.freeze({query:async(text,values)=>{
  assert.ok(typeof text==='string'&&Object.hasOwn(ACCOUNTING190_READ_STATEMENTS,text),'ACCOUNTING190_BROWSER_EXACT_READ_REQUIRED');
  const n=ACCOUNTING190_READ_STATEMENTS[text];assert.ok(Array.isArray(values)&&values.length===n&&Reflect.ownKeys(values).length===n+1&&Array.from({length:n},(_,i)=>Object.hasOwn(values,i)&&typeof values[i]==='string').every(Boolean),'ACCOUNTING190_BROWSER_READ_ARGUMENTS');
  trace.push({text,arity:n});
  // Retain canonical190Rpc's real runtime, RC/RW and FOR SHARE semantics.
  // GET is an HTTP constraint; it must never turn into SQL readOnly:true.
  return db.query(text,values);
 }});
}
export function accounting190ReadHandler(handler){
 assert.equal(typeof handler,'function');return(req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,code:'QA_ACCOUNTING190_READ_ONLY'});}
  return handler(req,res);
 };
}
export function assertAccounting190Csv(actual,expected,rows){
 assert.ok(Buffer.isBuffer(actual)&&Buffer.isBuffer(expected));assert.ok(actual.equals(expected),'ACCOUNTING190_BROWSER_CSV_BYTES');
 assert.deepEqual([...actual.subarray(0,3)],[239,187,191],'ACCOUNTING190_BROWSER_CSV_BOM');
 assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(actual).split('\r\n').length-2,rows,'ACCOUNTING190_BROWSER_CSV_COMPLETE');
 return{bytes:actual.length,sha256:sha(actual),rows};
}
export function assertAccounting190ImputationCards(actual,rows){
 assert.equal(actual.length,rows.length,'ACCOUNTING190_BROWSER_VISIBLE_COUNT');
 for(const [i,row]of rows.entries()){
  assert.equal(actual[i].heading,`Legajo ${row.employeeNumber} · concepto ${row.conceptCode}`,'ACCOUNTING190_BROWSER_VISIBLE_IDENTITY');
  assert.equal(actual[i].amount,`${OWN_RUN_NATURES[row.nature]} · importe/valor conservado ${row.amount} · ${row.unit}`,'ACCOUNTING190_BROWSER_VISIBLE_AMOUNT');
  assert.equal(actual[i].date,`Fecha: ${row.liquidationDate??'no declarada'} · jurisdicción: ${row.jurisdictionCode??'no conservada'}`,'ACCOUNTING190_BROWSER_VISIBLE_DATE');
 }
}
export function assertAccounting190JournalRows(actual,entries){
 assert.deepEqual(actual,entries.map(e=>[String(e.ordinal),e.accountReference,e.debit,e.credit,e.documentReference]),'ACCOUNTING190_BROWSER_JOURNAL_ROWS');
}
function readAccounting190State(h,readSnapshot){
 const schema=h.qa.schema,tables=['own_payroll_close_event','own_payroll_accounting_event','own_payroll_imputation_event','own_payroll_journal_event'];
 const one=table=>`(SELECT jsonb_build_object('count',count(*),'sha256',${schema}.own_run_hash_v1(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb))) FROM ${schema}.${table} e)`;
 const ledgers=h.json([`SELECT jsonb_build_object(${tables.flatMap(table=>[q(table),one(table)]).join(',')})`],{readOnly:true});
 const metadata=h.json([`SELECT encode(public.digest(jsonb_build_object(
 'functions',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace),
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'options',c.reloptions,'identity',c.relreplident) ORDER BY c.oid),'[]') FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace),
 'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_constraint c WHERE c.connamespace=${q(schema)}::regnamespace),
 'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=${q(schema)}::regnamespace),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace=${q(schema)}::regnamespace)),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m),
 'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d))::text,'sha256'),'hex')`],{readOnly:true});
 return{snapshot:readSnapshot(),ledgers,metadata};
}
const ASSETS=['own-payroll-imputation-panel.js','own-payroll-imputation-workspace-model.js','own-payroll-imputation-model.js','own-payroll-journal-panel.js','own-payroll-journal-model.js','own-payroll-response.js'];
export async function verifyAccountingFullReadBrowserOn190({h,db,qa,reviewer,closed,approvedImputation,readSnapshot}){
 assert.strictEqual(h.qa,qa);assert.equal(h.sourceCommit,qa.sourceCommit);assert.equal(qa.operationalPairBaseline,'published107');assert.ok([17,18].includes(h.major));assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof readSnapshot,'function');
 assert.equal(reviewer.principal.authorized,true);assert.equal(reviewer.principal.session.mfa,true);assert.deepEqual(employeeContext(reviewer.principal,reviewer.session),qa.checker);
 assert.equal(closed.body.command,'close');assert.equal(closed.snapshot.employeeCount,855);assert.equal(closed.snapshot.conceptCount,17100);
 const approved=await imputationDetail(approvedImputation);assert.equal(approved.proposal.status,'approved');assert.equal(approved.sourceCurrent,true);assert.equal(approved.source.group.groupId,closed.groupId);assert.equal(approved.allocation.rows.length,17100);assert.equal(approved.allocation.employeeCount,855);assert.equal(approved.allocation.auxiliaryCount,855);
 const before=readAccounting190State(h,readSnapshot),sqlTrace=[],sql=accounting190ReadSql(db,sqlTrace),assets={};
 for(const file of ASSETS){const source=h.read('assets/'+file).replace(/\r\n?/g,'\n'),served=fs.readFileSync(path.join(PUBLIC_ROOT,'public/assets',file),'utf8').replace(/\r\n?/g,'\n');assert.equal(served,source,'ACCOUNTING190_BROWSER_SERVED_SOURCE:'+file);assets[file]=sha(source);}
 const roleKey=h.json([`SELECT to_jsonb(role_key) FROM ${qa.schema}.tenant_membership WHERE id=${q(qa.checker.membershipId)}::uuid`],{readOnly:true});assert.equal(typeof roleKey,'string');assert.ok(roleKey.length>0);
 let host,result,primary=null;const cleanupErrors=[];
 try{
  host=await createCanonical190BrowserHost({h,actors:new Map([['reviewer',{...reviewer,raw:qa.checker,roleKey}]]),getSql:async()=>sql,outputName:'accounting203-journal206-read-browser',handlers:deps=>new Map([[IMP,accounting190ReadHandler(createOwnImputationHandler(deps))],[JOURNAL,accounting190ReadHandler(createOwnJournalHandler(deps))]])});
  const reader=await host.open('reviewer'),page=reader.page,requests=[],responses=[];page.setDefaultTimeout(45000);
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===host.origin&&url.pathname.startsWith('/api/'))requests.push(request);});
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===host.origin&&[IMP,JOURNAL].includes(url.pathname)){const pending=response.allHeaders().then(headers=>({status:response.status(),path:url.pathname,headers}));pending.catch(()=>{});responses.push(pending);}});
  const fullGet=async url=>{const packet=await reader.request(url,{headers:{Accept:OWN_RUN_FULL_JSON}});assert.equal(packet.response.status(),200);assert.equal(packet.body.ok,true);return packet.body.data;};
  const originalApproval=await fullGet(IMP+'?resource=detail&id='+encodeURIComponent(approved.proposal.id));await imputationDetail(originalApproval);assert.deepEqual(originalApproval,approved,'ACCOUNTING190_BROWSER_APPROVAL_CHANGED');
  const period=closed.body.period,liquidationType=closed.body.liquidationType,query=new URLSearchParams({period,liquidationType}),boot=journalBootstrap(await fullGet(JOURNAL+'?resource=bootstrap&'+query));
  const posted=boot.journals.filter(row=>row.basis==='imputation'&&row.sourceId===approved.proposal.id&&row.status==='posted');assert.equal(posted.length,1,'ACCOUNTING190_BROWSER_ONE_POSTED_JOURNAL_REQUIRED');
  const originalJournal=await journalDetail(await fullGet(JOURNAL+'?resource=detail&id='+encodeURIComponent(posted[0].id)));assert.equal(originalJournal.status,'posted');assert.equal(originalJournal.sourceCurrent,true);assert.equal(originalJournal.kind,'initial');assert.equal(originalJournal.source.imputation.proposal.id,approved.proposal.id);assert.deepEqual(originalJournal.source.imputation.allocation,approved.allocation);assert.equal(originalJournal.journal.entries.length,38);assert.equal(originalJournal.journal.conceptCount,17100);
  const expectedImputation=Buffer.from('\uFEFF'+await approvedImputationCsv(originalApproval),'utf8'),expectedJournal=Buffer.from('\uFEFF'+await journalCsv(originalJournal),'utf8');
  const controls=(prefix,key)=>page.locator('[data-'+prefix+'-'+key+']');
  const idle=prefix=>page.waitForFunction(p=>document.querySelector(p==='imputation'?'.own-imputation':'.own-journal')?.getAttribute('aria-busy')==='false',prefix,{timeout:45000});
  const open=async(prefix,hash)=>{await page.goto(host.origin+'/nomina#'+hash);await page.waitForFunction(()=>document.documentElement.dataset.mcCapabilityState==='ready'&&document.documentElement.dataset.mcCapabilityReady==='true');await controls(prefix,'access').click();await page.waitForFunction(p=>!document.querySelector('[data-'+p+'-query]').disabled,prefix);await controls(prefix,'period').fill(period);await controls(prefix,'type').selectOption(liquidationType);await controls(prefix,'consult').click();await controls(prefix,'content').waitFor({state:'visible'});await idle(prefix);};
  const cards=()=>controls('imputation','rows').locator('article').evaluateAll(nodes=>nodes.map(card=>({heading:card.querySelector('h4')?.textContent,amount:card.querySelectorAll(':scope > p')[0]?.textContent,date:card.querySelectorAll(':scope > p')[1]?.textContent})));
  await open('imputation','imputacion');await controls('imputation','proposal').selectOption(approved.proposal.id);await controls('imputation','open').click();await controls('imputation','review').waitFor({state:'visible'});await idle('imputation');
  assertAccounting190ImputationCards(await cards(),approved.allocation.rows.slice(0,25));assert.ok((await controls('imputation','count').innerText()).includes('17100 conceptos en la vista · 17100 del grupo completo'));
  await controls('imputation','next').click();assertAccounting190ImputationCards(await cards(),approved.allocation.rows.slice(25,50));
  await controls('imputation','search').fill('NO-EXISTE-EN-QA190-COMPLETO');assert.equal(await controls('imputation','rows').locator('article').count(),0);
  const impDownload=page.waitForEvent('download');impDownload.catch(()=>{});await controls('imputation','export-csv').click();const impFile=await impDownload,impPath=path.join(host.output,'imputation17100.csv');await impFile.saveAs(impPath);await idle('imputation');const impProof=assertAccounting190Csv(fs.readFileSync(impPath),expectedImputation,17100);
  await controls('imputation','search').fill('');assertAccounting190ImputationCards(await cards(),approved.allocation.rows.slice(0,25));
  const mobile=[];for(const width of[1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ACCOUNTING190_BROWSER_IMPUTATION_OVERFLOW:'+width);assert.ok(await controls('imputation','export-csv').evaluate(el=>el.getBoundingClientRect().height>=44));await page.screenshot({path:path.join(host.output,'imputation-'+width+'.png')});mobile.push({panel:'imputation',width,visible:await controls('imputation','rows').locator('article').count()});}
  await open('journal','asientos');await controls('journal','history').selectOption(originalJournal.id);await controls('journal','open').click();await controls('journal','detail').waitFor({state:'visible'});await idle('journal');
  const journalRows=()=>controls('journal','entries').locator('tbody tr').evaluateAll(nodes=>nodes.map(row=>[...row.cells].map(cell=>cell.textContent)));assertAccounting190JournalRows(await journalRows(),originalJournal.journal.entries);
  const journalDownload=page.waitForEvent('download');journalDownload.catch(()=>{});await controls('journal','csv').click();const journalFile=await journalDownload,journalPath=path.join(host.output,'journal38.csv');await journalFile.saveAs(journalPath);await idle('journal');const journalProof=assertAccounting190Csv(fs.readFileSync(journalPath),expectedJournal,38);
  for(const width of[1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ACCOUNTING190_BROWSER_JOURNAL_OVERFLOW:'+width);assert.ok(await controls('journal','csv').evaluate(el=>el.getBoundingClientRect().height>=44));assertAccounting190JournalRows(await journalRows(),originalJournal.journal.entries);await page.screenshot({path:path.join(host.output,'journal-'+width+'.png')});mobile.push({panel:'journal',width,visible:38});}
  assert.ok(requests.length>0);assert.ok(requests.every(request=>request.method()==='GET'),'ACCOUNTING190_BROWSER_HTTP_WRITE');
  const typedRequests=requests.filter(request=>[IMP,JOURNAL].includes(new URL(request.url()).pathname));assert.ok(typedRequests.length>=8);for(const request of typedRequests)assert.equal((await request.allHeaders()).accept,OWN_RUN_FULL_JSON,'ACCOUNTING190_BROWSER_FULL_NEGOTIATION');
  const packets=await Promise.all(responses);assert.equal(packets.length,typedRequests.length);for(const packet of packets){assert.equal(packet.status,200);assert.ok(packet.headers['content-type'].startsWith(OWN_RUN_FULL_JSON));assert.match(packet.headers['x-municontrol-json-bytes'],/^[1-9][0-9]*$/);assert.ok(Number(packet.headers['x-municontrol-json-bytes'])<=32*1024*1024);}
  assert.deepEqual(host.evidence.external,[]);assert.deepEqual(host.evidence.pageErrors,[]);assert.deepEqual(host.evidence.serverErrors,[]);assert.deepEqual(host.evidence.loginTargets,[]);
  result={version:'own-accounting203-journal206-current190-read-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,population:855,imputationConcepts:17100,imputationVisiblePage:25,journalEntries:38,imputation:impProof,journal:journalProof,mobile,httpReads:typedRequests.length,oracleHttpReads:host.evidence.httpEvidence.length,sqlReads:sqlTrace,assets,actualHttp:true,actualProductPanels:true,readExportOnly:true,commandsUi:false,postedJournalSelectedFromRealBootstrap:true,newFoundation:false,newDatabase:false,snapshotPreserved:true,fourLedgersPreserved:true,metadataPreserved:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 }catch(error){primary=error;}
 finally{
  try{await host?.close();}catch(error){cleanupErrors.push(error);}
  try{assert.deepEqual(readAccounting190State(h,readSnapshot),before,'ACCOUNTING190_BROWSER_STATE_CHANGED');}catch(error){cleanupErrors.push(error);}
 }
 if(primary){if(cleanupErrors.length)primary.cleanupErrors=cleanupErrors.map(error=>error.message);throw primary;}if(cleanupErrors.length)throw cleanupErrors[0];
 fs.writeFileSync(path.join(host.output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
