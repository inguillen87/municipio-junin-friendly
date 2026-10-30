// SOURCE CANDIDATE ONLY. Author did not import, parse, execute or start it.
// Same190 / existing126 actors / existing prepare+approve events only.
// This is a closed browser continuation, not a SQL executor or IAM installer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnReceiptHandler} from '../../api/internal-own-payroll-receipts.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {OWN_RUN_TYPES} from '../../assets/own-payroll-run-workspace-model.js';
import {ownReceiptIssuer,ownReceiptParams,ownReceiptCommand,ownReceiptBatch,ownReceiptSelf,verifiedOwnReceiptPreview} from '../../assets/own-payroll-receipt-model.js';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';

const ENDPOINT='/api/internal-own-payroll-receipts',FULL=32*1024*1024;
const RPC=new Map([
 ['SELECT public.own_receipt_preview_v1($1::jsonb,$2::jsonb) AS result',2],
 ['SELECT public.own_receipt_list_v1($1::jsonb,$2::text) AS result',2],
 ['SELECT public.own_receipt_batch_v1($1::jsonb,$2::uuid) AS result',2],
 ['SELECT public.own_receipt_attempt_v1($1::jsonb,$2::uuid) AS result',2],
 ['SELECT public.own_receipt_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',3],
 ['SELECT public.own_receipt_self_v1($1::jsonb) AS result',1]
]);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const sorted=value=>[...value].sort();
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const jsonBytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const bytePin=(relative,raw)=>({path:relative,bytes:raw.length,sha256:sha(raw)});

// Pure boundary witnesses. They do not replace the full receipt/event/ledger
// checks retained in the existing126 circuit; native/transport errors propagate.
export function assertReceipt126BrowserCommandExchange(input){
 exact(input,['actor','kind','expectedBody','sentBody','key','status','headerReplayed','value']);
 const {actor,kind,expectedBody,sentBody,key,status,headerReplayed,value}=input;
 assert.ok(kind==='prepare'||kind==='approve','RECEIPT126_BROWSER_EXISTING_DECISIONS_ONLY');
 assert.equal(actor,kind==='prepare'?'preparer':'reviewer','RECEIPT126_BROWSER_INDEPENDENT_COMMAND_ACTOR');
 assert.deepEqual(ownReceiptCommand(expectedBody),expectedBody);assert.equal(expectedBody.command,kind);
 exact(sentBody,['operation','payload']);assert.deepEqual(sentBody,{operation:'command',payload:expectedBody});
 assert.match(key,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,'RECEIPT126_BROWSER_UI_V4_KEY');
 assert.equal(status,201);assert.equal(headerReplayed,false);assert.equal(value?.ok,true);assert.equal(value.data?.replayed,false);assert.equal(value.data?.key,key);assert.deepEqual(value.data?.body,expectedBody);
 return{key,body:expectedBody,event:value.data};
}
export function assertReceipt126BrowserReplayExchange(input){
 exact(input,['expectedEvent','key','body','status','headerReplayed','value']);
 const {expectedEvent,key,body,status,headerReplayed,value}=input;
 assert.equal(expectedEvent.replayed,false);assert.equal(key,expectedEvent.key);assert.deepEqual(body,expectedEvent.body);
 assert.equal(status,200);assert.equal(headerReplayed,true);assert.equal(value?.ok,true);assert.deepEqual(value.data,{...expectedEvent,replayed:true});return value.data;
}
export async function createOwnReceipt126BrowserOn190(context){
 exact(context,['h','db','qa','actors','issuerProfiles','params','trace']);
 const {h,db,qa,actors,issuerProfiles,trace}=context,params=ownReceiptParams(context.params);
 assert.strictEqual(h.qa,qa);assert.equal(h.sourceCommit,qa.sourceCommit);assert.ok([17,18].includes(h.major));
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(actors instanceof Map);assert.deepEqual(sorted(actors.keys()),['agent','preparer','reviewer']);
 assert.ok(issuerProfiles instanceof Map&&issuerProfiles.size===1&&issuerProfiles.has(qa.actor.tenantId));assert.ok(Array.isArray(trace));
 assert.equal(typeof db.query,'function');
 for(const [name,actor]of actors){
  assert.equal(actor.name,name);assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);
  assert.deepEqual(employeeContext(actor.principal,actor.session),actor.raw);assert.match(actor.raw.releaseSha,/^[a-f0-9]{40}$/);
 }
 assert.equal(new Set([...actors.values()].map(actor=>actor.raw.membershipId)).size,3);
 assert.equal(new Set([...actors.values()].map(actor=>actor.native.actorPersonId)).size,3);
 assert.ok(actors.get('preparer').principal.tenant.effectiveCapabilities.includes('payroll.receipt.prepare'));
 assert.ok(!actors.get('preparer').principal.tenant.effectiveCapabilities.includes('payroll.receipt.approve'));
 assert.ok(actors.get('reviewer').principal.tenant.effectiveCapabilities.includes('payroll.receipt.approve'));
 assert.ok(!actors.get('reviewer').principal.tenant.effectiveCapabilities.includes('payroll.receipt.prepare'));
 assert.deepEqual(sorted(actors.get('agent').principal.tenant.effectiveCapabilities),['actions.read','payroll.receipt.self.read']);
 const built=[],htmlBookend=[];
 for(const relative of ['nomina-control.html','centro-acciones.html',
  'assets/own-payroll-receipt-model.js','assets/own-payroll-receipt-panel.js','assets/own-payroll-receipt-pdf.js','assets/own-payroll-receipt-self.js',
  'assets/own-payroll-response.js','assets/own-payroll-run-workspace-model.js','assets/payroll-detail-export.js',
  'assets/native-salary-catalog-model.js','assets/native-self.js','assets/native-self-model.js','assets/native-leave.js','assets/native-leave-access.js',
  'assets/internal-capability-gate.js','assets/payroll-navigation.js']){
  const raw=fs.readFileSync(path.join(PUBLIC_ROOT,relative)),served=fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative));if(relative.endsWith('.html'))htmlBookend.push({path:relative,source:bytePin(relative,raw),served:bytePin(relative,served)});else assert.deepEqual(served,raw,'RECEIPT126_BROWSER_BUILT_BYTES:'+relative);built.push(bytePin(relative,raw));
 }
 const sourceBookend=()=>{for(const pin of built){const raw=fs.readFileSync(path.join(PUBLIC_ROOT,pin.path)),served=fs.readFileSync(path.join(PUBLIC_ROOT,'public',pin.path));assert.deepEqual(bytePin(pin.path,raw),pin);const html=htmlBookend.find(row=>row.path===pin.path);if(html)assert.deepEqual(bytePin(pin.path,served),html.served);else assert.deepEqual(served,raw);}};
 const network=[],sqlCalls=[],pagePosts=[],checks=[],phases=[],pdfPins=[];let host=null,closed=false,prepared=null,approved=null,downloaded=false,pdfOracle=null,failure=null,preparerRetired=false,checkerRestored=false;
 const windows=new Map();
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const byCookie=req=>{const match=String(req.headers?.cookie??'').match(/(?:^|;\s*)qa_actor=([a-z]+)(?:;|$)/);return match?actors.get(match[1]):null;};
 const rowFor=(name,method,url)=>({actor:name,method,path:url.pathname+url.search,status:null,bytes:null,key:null,operation:null,command:null,getSqlCalls:0,rpcCalls:0,rpcs:[],replayed:false,code:null});
 const close=async()=>{if(closed)return;closed=true;if(host)await host.close();};
 try{
  host=await createCanonical190BrowserHost({h,actors,getSql:async()=>{throw Error('RECEIPT126_UNBOUND_SQL');},outputName:'receipt126-browser',receiptSelfPage:true,
   handlers:deps=>new Map([[ENDPOINT,async(req,res)=>{
    const actor=byCookie(req);assert.ok(actor,'RECEIPT126_NETWORK_ACTOR_REQUIRED');const url=new URL(req.url,'http://qa.invalid'),row=rowFor(actor.name,req.method,url);network.push(row);
    row.key=req.headers['idempotency-key']??null;
    const sql={query:async(text,values)=>{
     assert.ok(RPC.has(text),'RECEIPT126_BROWSER_NON_LITERAL_RPC');assert.ok(Array.isArray(values)&&values.length===RPC.get(text)&&values.every(value=>typeof value==='string'));
     assert.deepEqual(JSON.parse(values[0]),actor.raw,'RECEIPT126_BROWSER_FOREIGN_CONTEXT');row.rpcCalls++;row.rpcs.push(text);
     const call={actor:actor.name,text,key:values.length===3?values[2]:null,body:values.length===3?JSON.parse(values[1]):null,replayed:null};sqlCalls.push(call);
     if(call.body){row.operation='command';row.command=call.body.command;assert.ok(['prepare','approve'].includes(call.body.command),'RECEIPT126_BROWSER_ONLY_EXISTING_TWO_DECISIONS');}
     const value=await db.query(text,values);if(call.body)call.replayed=value?.[0]?.result?.replayed;return value;
    }};
    const handler=createOwnReceiptHandler({...deps,issuerProfiles,getSql:async()=>{row.getSqlCalls++;return sql;}});
    res.once('finish',()=>{row.status=res.statusCode;});await handler(req,res);row.status=res.statusCode;row.replayed=res.getHeader('idempotency-replayed')==='true';
   }]])});
  const open=async name=>{
   if(windows.has(name))return windows.get(name);
   const win=await host.open(name);windows.set(name,win);
   win.page.on('request',request=>{const url=new URL(request.url());if(url.origin!==host.origin||!url.pathname.startsWith('/api/')||request.method()!=='POST')return;let body;try{body=request.postDataJSON();}catch{body=null;}pagePosts.push({actor:name,path:url.pathname,body,key:request.headers()['idempotency-key']??null});});
   return win;
  };
  const $=(win,key)=>win.page.locator('[data-receipt-'+key+']');
  const settled=win=>win.page.waitForFunction(()=>document.querySelector('.own-receipt')?.getAttribute('aria-busy')==='false',{}, {timeout:90000});
  const selfSettled=win=>win.page.waitForFunction(()=>document.querySelector('#ownReceiptSelfPanel')?.getAttribute('aria-busy')==='false',{}, {timeout:60000});
  const rowResponse=async(win,response,{body,key,append=true}={})=>{
   const request=response.request(),url=new URL(response.url());assert.equal(url.origin,host.origin);assert.equal(url.pathname,ENDPOINT);
   const raw=await response.body();assert.ok(raw.length>0&&raw.length<=FULL);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   const announced=response.headers()['x-municontrol-json-bytes'];if(announced!==undefined)assert.equal(Number(announced),raw.length);
   const row=[...network].reverse().find(row=>row.actor===win.actorName&&row.method===request.method()&&row.path===url.pathname+url.search&&row.key===(key??null));assert.ok(row,'RECEIPT126_HTTP_ROW_MISSING');
   assert.equal(row.status,response.status());row.bytes=raw.length;row.replayed=response.headers()['idempotency-replayed']==='true';row.code=value.code??null;if(body){row.operation=body.operation;row.command=body.payload?.command??null;}
   const result={...row,value};if(append)trace.push({...row});return result;
  };
  const read=async(name,resource,values={})=>{
   const win=await open(name),relative=ENDPOINT+'?'+new URLSearchParams({resource,...values});const {response,body}=await win.request(relative,{headers:{Accept:OWN_RUN_FULL_JSON}});
   const raw=await response.body();assert.ok(raw.length>0&&raw.length<=FULL);assert.deepEqual(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),body);assert.equal(response.status(),200);assert.equal(body.ok,true);return{response,body};
  };
  const receiptPage=async name=>{
   const win=await open(name);if(!new URL(win.page.url()).pathname.endsWith('nomina-control.html'))await win.page.goto(host.origin+'/nomina-control.html#recibos');
   await $(win,'period').waitFor({state:'visible'});await win.page.waitForFunction(()=>{const button=document.querySelector('[data-receipt-consult]');return button&&!button.disabled&&button.closest('.own-receipt')?.getAttribute('aria-busy')==='false';},{},{timeout:90000});await settled(win);return win;
  };
  const openBatch=async(name,id)=>{
   const win=await receiptPage(name);await $(win,'period').fill(params.period);await $(win,'history').click();await settled(win);
   const button=win.page.locator('[data-receipt-open="'+id+'"]');assert.equal(await button.count(),1);await button.click();await settled(win);await $(win,'result').waitFor({state:'visible'});return win;
  };
  const emit=async(win,kind,expected)=>{
   expected=ownReceiptCommand(expected);assert.equal(expected.command,kind);assert.equal(await $(win,kind).isDisabled(),false,'RECEIPT126_UI_DECISION_UNAVAILABLE:'+kind);
   await $(win,'reason').fill(expected.reason);if(kind!=='prepare')await $(win,'confirm').check();
   const waiting=win.page.waitForResponse(response=>{if(response.request().method()!=='POST'||new URL(response.url()).pathname!==ENDPOINT)return false;const body=response.request().postDataJSON();return body.operation==='command'&&body.payload?.command===kind;},{timeout:90000});
   await $(win,kind).click();const response=await waiting,request=response.request(),body=request.postDataJSON(),key=request.headers()['idempotency-key'];
   exact(body,['operation','payload']);assert.deepEqual(body,{operation:'command',payload:expected});assert.ok(uuid(key),'RECEIPT126_UI_UUID_REQUIRED');
   const result=await rowResponse(win,response,{body,key});assertReceipt126BrowserCommandExchange({actor:win.actorName,kind,expectedBody:expected,sentBody:body,key,status:result.status,headerReplayed:result.replayed,value:result.value});
   await settled(win);assert.equal(await $(win,'recover').isVisible(),false);check((await $(win,'status').innerText()).includes('Decisión conservada'),'UI settles '+kind+' from the full retained receipt');return{key,response:result,body:expected};
  };
  const replay=async(name,command,key)=>{
   const win=await open(name),body={operation:'command',payload:ownReceiptCommand(command)};
   const {response,body:value}=await win.request(ENDPOINT,{method:'POST',headers:{Accept:OWN_RUN_FULL_JSON,'Content-Type':'application/json','Idempotency-Key':key},data:body});
   const raw=await response.body();assert.ok(raw.length>0&&raw.length<=FULL);assert.deepEqual(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),value);const original=name==='preparer'?prepared:approved;assert.ok(original);assertReceipt126BrowserReplayExchange({expectedEvent:original.response.value.data,key,body:command,status:response.status(),headerReplayed:response.headers()['idempotency-replayed']==='true',value});
   const row=[...network].reverse().find(row=>row.actor===name&&row.key===key);assert.ok(row);row.bytes=jsonBytes(value);row.replayed=true;trace.push({...row});return{...row,value};
  };
  const attempt=async(name,key)=>{const {response,body:value}=await read(name,'attempt',{key});const original=name==='preparer'?prepared:approved;assert.ok(original);assertReceipt126BrowserReplayExchange({expectedEvent:original.response.value.data,key,body:original.body,status:response.status(),headerReplayed:response.headers()['idempotency-replayed']==='true',value});const row=[...network].reverse().find(row=>row.actor===name&&row.path===ENDPOINT+'?'+new URLSearchParams({resource:'attempt',key}));assert.ok(row);row.bytes=jsonBytes(value);row.replayed=true;trace.push({...row});return{...row,value};};
  const download=async(win,selector,name,recordCount)=>{
   const event=win.page.waitForEvent('download',{timeout:120000});await win.page.locator(selector).click();const value=await event;assert.equal(await value.failure(),null);
   const temporary=await value.path();assert.equal(typeof temporary,'string');const raw=fs.readFileSync(temporary);assert.ok(raw.length>100&&raw.length<=64*1024*1024);const text=raw.toString('latin1');assert.ok(text.startsWith('%PDF-1.4\n')&&text.endsWith('%%EOF\n'));
   const pageCount=Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1]);assert.ok(Number.isSafeInteger(pageCount)&&pageCount>=recordCount&&pageCount<=8000);
   fs.writeFileSync(path.join(host.output,name),raw,{flag:'wx'});pdfPins.push({name,bytes:raw.length,sha256:sha(raw),pageCount,recordCount,fromRealBrowserDownload:true});return{bytes:new Uint8Array(raw),recordCount,pageCount};
  };
  const selfPage=async()=>{
   const win=await open('agent');if(!new URL(win.page.url()).pathname.endsWith('centro-acciones.html'))await win.page.goto(host.origin+'/centro-acciones.html');
   const consult=win.page.locator('[data-self-receipt-consult]');await consult.waitFor({state:'visible'});assert.equal(await win.page.locator('#appShell').isVisible(),true);await selfSettled(win);return win;
  };
  const selfRead=async()=>{
   const win=await selfPage(),waiting=win.page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname===ENDPOINT&&new URL(response.url()).searchParams.get('resource')==='self',{timeout:60000});
   await win.page.locator('[data-self-receipt-consult]').click();const response=await waiting,result=await rowResponse(win,response);assert.equal(result.status,200);assert.equal(result.value.ok,true);await selfSettled(win);return{win,value:ownReceiptSelf(result.value.data)};
  };
  const result={
   prepare:async expected=>{
    assert.equal(prepared,null,'RECEIPT126_BROWSER_PREPARE_ONCE');const win=await receiptPage('preparer');
    const issuerResponse=await read('preparer','issuer'),issuer=ownReceiptIssuer(issuerResponse.body.data,{tenantId:qa.actor.tenantId});assert.equal(issuer.state,'configured');assert.deepEqual(issuer.profile.issuer,params.issuer);
    assert.equal(await $(win,'issuerProfile').isVisible(),true);assert.equal(await $(win,'issuerEditor').isVisible(),false);
    for(const[key,field]of[['issuerName','name'],['issuerTaxId','taxId'],['issuerAddress','address']]){assert.equal(await $(win,key).inputValue(),params.issuer[field]);assert.equal(await $(win,key).evaluate(node=>node.readOnly),true);}
    await $(win,'period').fill(params.period);for(const type of Object.keys(OWN_RUN_TYPES)){const box=$(win,'type-'+type),wanted=params.types.includes(type);if(await box.isChecked()===wanted)continue;if(!await box.isVisible())await $(win,'typeDetails').locator('summary').click();if(wanted)await box.check();else await box.uncheck();}
    await $(win,'scope').selectOption('all');assert.ok(Object.values(params.filters).every(value=>value===''));assert.equal(params.paymentDate,null);await $(win,'legend').fill(params.legend);
    const waiting=win.page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===ENDPOINT&&response.request().postDataJSON().operation==='preview',{timeout:90000});await $(win,'consult').click();
    const response=await waiting,previewResult=await rowResponse(win,response,{body:{operation:'preview',params}});assert.equal(previewResult.status,200);const preview=await verifiedOwnReceiptPreview(previewResult.value.data);assert.deepEqual(preview.snapshot.params,params);assert.equal(preview.snapshot.recordCount,855);assert.equal(preview.snapshot.conceptCount,17100);assert.equal(preview.scopeVersion,expected.scopeVersion);assert.equal(preview.snapshot.sourceVersion,expected.sourceVersion);await settled(win);
    check((await $(win,'summary').innerText()).includes('855 recibos · 17100 conceptos · 1 grupos cerrados'),'real receipt panel verified all855/17100');
    assert.equal(await $(win,'rows').locator('tr').count(),25);await $(win,'search').fill('SIN COINCIDENCIA SINTETICA QA126');assert.equal(await $(win,'rows').locator('tr').count(),0);check((await $(win,'range').innerText()).includes('855 recibos'),'a no-match view retains the complete preparation');
    prepared=await emit(win,'prepare',expected);return prepared;
   },
   replayPrepared:async(command,key)=>{assert.ok(prepared);assert.equal(key,prepared.key);assert.deepEqual(command,prepared.body);return replay('preparer',command,key);},
   preparedAttempt:async key=>{assert.ok(prepared);assert.equal(key,prepared.key);return attempt('preparer',key);},
   approve:async expected=>{
    assert.ok(prepared);assert.equal(approved,null,'RECEIPT126_BROWSER_APPROVE_ONCE');assert.equal(expected.batchId,prepared.response.value.data.batchId);
    const win=await openBatch('reviewer',expected.batchId);check((await $(win,'state').innerText()).includes('pendiente de revisión'),'independent reviewer opens the retained preparation');
    approved=await emit(win,'approve',expected);const replayed=await replay('reviewer',approved.body,approved.key),found=await attempt('reviewer',approved.key);assert.deepEqual(replayed.value.data,{...approved.response.value.data,replayed:true});assert.deepEqual(found.value.data,replayed.value.data);return approved;
   },
   downloads:async({approvedBatch,self})=>{
    assert.ok(approved);assert.equal(downloaded,false,'RECEIPT126_BROWSER_DOWNLOAD_PHASE_ONCE');downloaded=true;ownReceiptBatch(approvedBatch);ownReceiptSelf(self);
    assert.equal(approvedBatch.id,approved.response.value.data.batchId);assert.equal(approvedBatch.state,'approved');assert.equal(approvedBatch.sourceCurrent,true);assert.equal(approvedBatch.snapshot.recordCount,855);assert.equal(approvedBatch.snapshot.conceptCount,17100);assert.equal(self.items.length,1);
    const reviewer=await openBatch('reviewer',approvedBatch.id);check((await $(reviewer,'state').innerText()).includes('disponibilidad aprobada'),'approved availability is displayed from independent readback');await $(reviewer,'search').fill('SIN COINCIDENCIA SINTETICA QA126');assert.equal(await $(reviewer,'rows').locator('tr').count(),0);
    const pdf=await download(reviewer,'[data-receipt-pdf]','approved-855.pdf',855);await settled(reviewer);
    const own=await selfRead();assert.deepEqual(own.value,self);assert.equal(await own.win.page.locator('[data-self-receipt-download]').count(),1);assert.equal(own.value.items[0].record.personId,actors.get('agent').native.actorPersonId);
    assert.equal(own.value.items[0].record.concepts.length,20);const ownText=await own.win.page.locator('[data-self-receipt-list]').innerText();assert.ok(ownText.includes('Legajo '+self.items[0].record.employeeNumber));
    for(const record of approvedBatch.snapshot.records)if(record.contractId!==self.items[0].record.contractId)assert.ok(!ownText.includes('Legajo '+record.employeeNumber+' ·'),'RECEIPT126_SELF_FOREIGN_NUMBER');
    const selfPdf=await download(own.win,'[data-self-receipt-download="0"]','own-approved.pdf',1);await selfSettled(own.win);
    for(const width of[390,320]){await own.win.page.setViewportSize({width,height:844});check(await own.win.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'self receipt has no outer overflow at'+width);await own.win.page.screenshot({path:path.join(host.output,'self-'+width+'.png'),fullPage:true});}
    await own.win.page.setViewportSize({width:1366,height:1100});await reviewer.page.screenshot({path:path.join(host.output,'approved-desktop.png'),fullPage:true});
    sourceBookend();return{pdf,selfPdf};
   },
   admitPdfOracles:({pdfEvidence,selfPdfEvidence})=>{
    assert.equal(downloaded,true);assert.equal(pdfOracle,null);for(const[evidence,count,concepts]of[[pdfEvidence,855,17100],[selfPdfEvidence,1,20]]){assert.equal(evidence.recordCount,count);assert.equal(evidence.conceptCount,concepts);assert.equal(evidence.amountsBoundToOwnNamespaceCodeOrdinalBlock,true);assert.equal(evidence.sixTotalsBoundToEachReceiptSection,true);assert.equal(evidence.monetaryNumbersParsed,false);const pin=pdfPins.find(pin=>pin.sha256===evidence.sha256);assert.ok(pin&&pin.bytes===evidence.bytes);}
    const summary=e=>({recordCount:e.recordCount,conceptCount:e.conceptCount,pageCount:e.pageCount,bytes:e.bytes,sha256:e.sha256,operationCount:e.operationCount,recordEvidenceSha256:sha(JSON.stringify(e.recordEvidence)),closedUncompressedSourceGrammar:e.closedUncompressedSourceGrammar,amountsBoundToOwnNamespaceCodeOrdinalBlock:e.amountsBoundToOwnNamespaceCodeOrdinalBlock,sixTotalsBoundToEachReceiptSection:e.sixTotalsBoundToEachReceiptSection,monetaryNumbersParsed:e.monetaryNumbersParsed,renderedLayoutVerified:e.renderedLayoutVerified});pdfOracle={full:summary(pdfEvidence),self:summary(selfPdfEvidence)};check(true,'actual browser downloaded bytes pass complete855/17100 and isolated1/20 source-operation oracles');
   },
   retirePreparer:async()=>{
    assert.ok(prepared&&approved&&pdfOracle);assert.equal(preparerRetired,false);const win=windows.get('preparer');assert.ok(win);await win.close();preparerRetired=true;
   },
   checkerRestored:proof=>{
    assert.equal(preparerRetired,true);assert.equal(checkerRestored,false);assert.equal(proof.version,'own-receipt126-same190-checker-restore.v1');assert.equal(proof.exactOverrideRemoved,true);assert.equal(proof.allMembershipSodChecked,true);assert.equal(proof.actorRowsDeleted,0);assert.equal(proof.receiptRowsChanged,0);assert.deepEqual(proof.before,proof.after);
    assert.deepEqual(sorted(proof.checkerCapabilities),sorted(actors.get('preparer').principal.tenant.effectiveCapabilities.filter(cap=>cap!=='payroll.receipt.prepare')));checkerRestored=true;
   },   unavailable:async(phase,batchId)=>{
    assert.ok(['reopened','withdrawn'].includes(phase));assert.deepEqual(phases,phase==='reopened'?[]:['reopened']);assert.ok(pdfOracle);const before=sqlCalls.filter(call=>call.body&&!call.replayed).length;
    const reviewer=await openBatch('reviewer',batchId);assert.equal(await $(reviewer,'pdf').isDisabled(),true);check((await $(reviewer,'state').innerText()).includes(phase==='reopened'?'fuentes cambiadas':'retirada'),'real reviewer panel withdraws PDF after '+phase);
    const own=await selfRead();assert.equal(own.value.items.length,0);assert.equal(await own.win.page.locator('[data-self-receipt-download]').count(),0);check((await own.win.page.locator('[data-self-receipt-status]').innerText()).includes('No hay recibos propios revisados disponibles'),'real self panel has no stale download after '+phase);
    assert.equal(sqlCalls.filter(call=>call.body&&!call.replayed).length,before);phases.push(phase);sourceBookend();
   },
   proof:()=>{
    assert.ok(prepared&&approved&&pdfOracle&&preparerRetired&&checkerRestored);assert.deepEqual(phases,['reopened','withdrawn']);sourceBookend();assert.deepEqual(host.evidence.external,[]);assert.deepEqual(host.evidence.pageErrors,[]);assert.deepEqual(host.evidence.serverErrors,[]);
    const fresh=sqlCalls.filter(call=>call.body&&call.replayed===false),replayed=sqlCalls.filter(call=>call.body&&call.replayed===true);assert.deepEqual(fresh.map(call=>call.body.command),['prepare','approve']);assert.deepEqual(replayed.map(call=>call.body.command),['prepare','approve']);
    assert.ok(pagePosts.every(row=>row.path===ENDPOINT&&row.body!==null),'RECEIPT126_UNRELATED_BROWSER_POST');const sent=pagePosts.filter(row=>row.body.operation==='command');assert.deepEqual(sent.map(row=>row.body.payload.command),['prepare','approve']);assert.equal(sent[0].key,prepared.key);assert.equal(sent[1].key,approved.key);
    const proof={version:'own-receipt126-browser190.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,schema:qa.schema,
     actualSql:true,actualHttp:true,actualBrowser:true,actualNetworkHttp:true,browserProven:true,allLegacyDecisionUiCasesCovered:false,realHandlerInvoked:true,managedPrincipalFromNativeAccess:true,authenticationPrincipalFixture:true,authenticationProviderFlowProven:false,
     existingPrepareAndApproveSubstituted:true,receiptEventsAddedByBrowser:2,additionalReceiptEvents:0,independentReview:true,fullSetRecords:855,fullSetConcepts:17100,ownRecords:1,ownConcepts:20,
     originalBodyAndKeyHttpReplay:true,sourceReopenRemovesOwnDownload:true,withdrawnBatchRemovesOwnDownload:true,originalCheckerRestoreUnchanged:true,
     paymentExecuted:false,digitalSignatureExecuted:false,municipalAcceptance:false,synthetic:true,productionWrites:0,
     transportScope:['prepare','approve','same-body-key-replay','retained-attempt-read','approved-batch-download','own-self-read-and-download','reopened-and-withdrawn-read-only-ui'],
     sourceBookend:built,builtHtmlBookend:htmlBookend,checks:[...checks],network:structuredClone(network),pagePosts:structuredClone(pagePosts),sqlCalls:structuredClone(sqlCalls),phases:[...phases],pdfPins:structuredClone(pdfPins),pdfOracles:pdfOracle};
    const encoded=JSON.stringify(proof,null,2)+'\n';assert.ok(Buffer.byteLength(encoded)<=1024*1024,'RECEIPT126_BROWSER_METADATA_LIMIT');fs.writeFileSync(path.join(host.output,'report.json'),encoded,{flag:'wx'});return proof;
   },
   close
  };
  return Object.freeze(result);
 }catch(error){failure=error;try{await close();}catch(teardown){throw new AggregateError([error,teardown],'RECEIPT126_BROWSER_INITIALIZATION_AND_CLOSE_FAILED',{cause:error});}throw failure;}
}