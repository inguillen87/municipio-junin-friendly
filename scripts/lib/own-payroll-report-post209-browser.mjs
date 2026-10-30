// Private source proposal: one read-only-business M8 case on the existing190.
// No seed, actor creation, capability write, SQL constructor or independent DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnCloseHandler} from '../../api/internal-own-payroll-close.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {verifiedOwnCloseReceipt,OWN_CLOSE_NOMINAL} from '../../assets/own-payroll-close-model.js';
import {verifiedOwnReportCensus} from '../../assets/own-payroll-report-census-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES} from '../../assets/own-payroll-response.js';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';
const CLOSE='/api/internal-own-payroll-close',DIRECTORY='m8-report-post209-browser';
const CENSUS='SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result';
const GROUP='SELECT public.own_close_group_full_v1($1::jsonb,$2::uuid) AS result';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const OWN_REPORT_POST209_SOURCE_ENTRIES=Object.freeze(['scripts/lib/own-payroll-report-post209-browser.mjs','nomina-control.html',...["assets/civil-date.js","assets/clock-dashboard-zip.js","assets/employment-adoption-mixed-cohort.js","assets/employment-adoption-operational-cohort.js","assets/employment-adoption-review-model.js","assets/employment-source-declarations.js","assets/native-employee-contract.js","assets/native-employment-catalog-model.js","assets/native-employment-lifecycle-model.js","assets/native-salary-catalog-model.js","assets/own-agreement-working-time-model.js","assets/own-agreement-working-time-program.js","assets/own-contract-salary-conditions-model.js","assets/own-contract-working-time-model.js","assets/own-monthly-day-declaration-model.js","assets/own-monthly-day-declaration-program.js","assets/own-monthly-day-policy-model.js","assets/own-monthly-day-policy-program.js","assets/own-payroll-close-model.js","assets/own-payroll-conditions.js","assets/own-payroll-engine.js","assets/own-payroll-exact.js","assets/own-payroll-jurisdiction-model.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-monetary-manifest.js","assets/own-payroll-period-classification.js","assets/own-payroll-period-context.js","assets/own-payroll-program-model.js","assets/own-payroll-report-census-model.js","assets/own-payroll-report-legajo.js","assets/own-payroll-report-model.js","assets/own-payroll-report-panel.css","assets/own-payroll-report-panel.js","assets/own-payroll-report-statement.js","assets/own-payroll-report-variables.js","assets/own-payroll-response.js","assets/own-payroll-run-date.js","assets/own-payroll-run-model.js","assets/own-payroll-run-workspace-model.js","assets/own-period-classification-model.js","assets/own-period-participation-model.js","assets/own-period-participation-program.js","assets/own-salary-seniority-model.js","assets/payroll-native-monthly-model.js","assets/payroll-navigation.js","assets/report-document.js","assets/report-pdf-text.js"]]);
const rawAssets=OWN_REPORT_POST209_SOURCE_ENTRIES.filter(file=>file.startsWith('assets/'));
const pin=(relative,bytes)=>({path:relative,bytes:bytes.length,sha256:hash(bytes)});
function bookend(){
 const sourceBookend=rawAssets.map(relative=>{const source=fs.readFileSync(path.join(PUBLIC_ROOT,relative));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),source,'M8_REPORT_BUILT_BYTES:'+relative);return pin(relative,source);});
 const sourcePage=pin('nomina-control.html',fs.readFileSync(path.join(PUBLIC_ROOT,'nomina-control.html'))),builtPage=pin('nomina-control.html',fs.readFileSync(path.join(PUBLIC_ROOT,'public/nomina-control.html')));
 return{sourceBookend,builtHtmlBookend:{source:sourcePage,served:builtPage},after(){for(const expected of sourceBookend){const current=fs.readFileSync(path.join(PUBLIC_ROOT,expected.path));assert.deepEqual(pin(expected.path,current),expected);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',expected.path)),current);}assert.deepEqual(pin(sourcePage.path,fs.readFileSync(path.join(PUBLIC_ROOT,sourcePage.path))),sourcePage);assert.deepEqual(pin(builtPage.path,fs.readFileSync(path.join(PUBLIC_ROOT,'public',builtPage.path))),builtPage);}};
}
// Bounded readers for files produced by the CURRENT report-document renderer.
// These do not invoke that renderer to produce their own expected output.
function csvRows(bytes){
 const lines=bytes.toString('utf8').replace(/^\ufeff/,'').split('\r\n');assert.equal(lines.pop(),'');
 return lines.map(line=>{const matches=[...line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/g)];assert.equal(matches.map(value=>value[0]).join(''),line);return matches.map(value=>value[1].replaceAll('""','"'));});
}
function workbookRows(bytes){
 let at=0,xml=null;
 while(at+4<=bytes.length&&bytes.readUInt32LE(at)===0x04034b50){
  assert.ok(at+30<=bytes.length);assert.equal(bytes.readUInt16LE(at+6)&8,0);assert.equal(bytes.readUInt16LE(at+8),0,'M8_EXPECTED_EXISTING_STORED_ZIP_RENDERER');
  const size=bytes.readUInt32LE(at+18),plain=bytes.readUInt32LE(at+22),nameLength=bytes.readUInt16LE(at+26),extraLength=bytes.readUInt16LE(at+28),start=at+30+nameLength+extraLength;
  assert.equal(size,plain);assert.ok(start+size<=bytes.length);const name=bytes.subarray(at+30,at+30+nameLength).toString('utf8');
  if(name==='xl/worksheets/sheet1.xml'){assert.equal(xml,null);xml=bytes.subarray(start,start+size).toString('utf8');}at=start+size;
 }
 assert.ok(xml!==null);assert.equal(bytes.readUInt32LE(at),0x02014b50);
 const unxml=value=>value.replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&');
 return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row=>[...row[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)].map(cell=>{const value=/<t\b[^>]*>([\s\S]*?)<\/t>/.exec(cell[1]);assert.ok(value,'M8_PAYROLL_CELLS_REMAIN_EXACT_TEXT');return unxml(value[1]);}));
}
function pdfRows(bytes,expected){
 const text=bytes.toString('latin1');assert.ok(text.startsWith('%PDF-'));assert.ok(text.trimEnd().endsWith('%%EOF'));
 const tokens=[...text.matchAll(/<([a-f0-9]+)> Tj/gi)].map(value=>Buffer.from(value[1],'hex').toString('latin1'));
 const ids=new Set(expected.map(row=>row[2])),seen=tokens.filter(value=>ids.has(value));assert.deepEqual([...seen].sort(),[...ids].sort());
 for(const row of expected){const index=tokens.indexOf(row[2]);assert.ok(index>=2);assert.deepEqual(tokens.slice(index-2,index-2+row.length),row,'M8_PDF_COMPLETE_ROW:'+row[2]);}
}
const settled=page=>page.waitForFunction(()=>document.querySelector('.own-report')?.getAttribute('aria-busy')==='false',{}, {timeout:100000});
async function wire(session,params){const result=await session.request(CLOSE+'?'+new URLSearchParams(params),{headers:{Accept:OWN_RUN_FULL_JSON}});assert.equal(result.response.status(),200);assert.equal(result.body.ok,true);const bytes=Buffer.byteLength(JSON.stringify(result.body));assert.ok(bytes<=OWN_RUN_FULL_MAX_BYTES);assert.equal(Number(result.response.headers()['x-municontrol-json-bytes']),bytes);assert.equal(result.response.headers()['content-type'].split(';')[0],OWN_RUN_FULL_JSON);return result.body.data;}
function rowOracle(receipt){
 const snapshot=receipt.snapshot;assert.equal(snapshot.employeeCount,855);assert.equal(snapshot.populationCount,855);assert.equal(snapshot.populationComplete,true);assert.equal(snapshot.conceptCount,17100);assert.equal(snapshot.payrollCalculated,true);assert.equal(snapshot.paymentExecuted,false);
 const employees=[...snapshot.employees].sort((a,b)=>Number(a.employeeNumber)-Number(b.employeeNumber));assert.deepEqual(employees.map(value=>value.employeeNumber),Array.from({length:855},(_,index)=>String(31000+index)));
 // Literal values belong to the reviewed synthetic20-rule programme190.
 for(const employee of employees){assert.equal(employee.totals.gross,'118.20');assert.equal(employee.totals.deduction,'0.00');assert.equal(employee.totals.net,'118.20');assert.equal(employee.jurisdiction.code,'42');}
 const payroll=employees.map(employee=>[snapshot.period,'Mensual',employee.employeeNumber,employee.agreementCode,employee.departmentCode,'118.20','0.00','118.20','42']);
 const concepts=employees.flatMap(employee=>{
  const rows=snapshot.concepts.filter(value=>value.contractId===employee.contractId);assert.equal(rows.length,20);
  return rows.map(value=>{assert.ok(['remuneration','auxiliary'].includes(value.nature));assert.equal(value.amount,value.conceptCode==='1'?'100.20':value.conceptCode==='101'?'10':'1.00');return[snapshot.period,'Mensual',employee.employeeNumber,value.conceptCode,value.nature==='auxiliary'?'Auxiliar':'Remunerativo',value.unit,value.amount,String(employee.liquidationVersion),'42'];});
 });assert.equal(concepts.length,17100);return{payroll,concepts};
}

export async function verifyOwnReportPost209BrowserOn190(context,fixture){
 const{h,db,qa,readSnapshot,readLedger}=context;assert.strictEqual(h.qa,qa);assert.equal(context.synthetic,true);assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(h.major));
 for(const fn of[db.query,readSnapshot,readLedger])assert.equal(typeof fn,'function');assert.deepEqual(Object.keys(fixture).sort(),['receipt','reviewer']);
 const receipt=await verifiedOwnCloseReceipt(fixture.receipt),reviewer=fixture.reviewer;assert.equal(reviewer.principal.authorized,true);assert.equal(reviewer.principal.session.mfa,true);for(const cap of OWN_CLOSE_NOMINAL)assert.ok(reviewer.principal.tenant.effectiveCapabilities.includes(cap));
 const expectedContext=JSON.stringify(employeeContext(reviewer.principal,reviewer.session)),period=receipt.snapshot.period;assert.equal(period,'2026-10');assert.equal(receipt.snapshot.liquidationType,'monthly');
 const expected=rowOracle(receipt),source=bookend(),before=readSnapshot(),beforeLedger=await readLedger(),calls=[],posts=[],files=[];
 const sql={query:async(text,values)=>{assert.ok(text===CENSUS||text===GROUP,'M8_RPC_OUTSIDE_TWO_READERS');assert.equal(values[0],expectedContext);if(text===CENSUS){assert.equal(values.length,3);assert.equal(values[1],period);assert.ok(['monthly','sac'].includes(values[2]));}else{assert.equal(values.length,2);assert.equal(values[1],receipt.groupId);}const result=await db.query(text,values);calls.push({kind:text===CENSUS?'census':'group',bytes:Buffer.byteLength(JSON.stringify(result))});return result;}};
 const host=await createCanonical190BrowserHost({h,actors:new Map([['reviewer',reviewer]]),getSql:async()=>sql,outputName:DIRECTORY,handlers:deps=>new Map([[CLOSE,async(req,res)=>{if(req.method!=='GET')return res.status(405).json({ok:false,code:'M8_READ_ONLY_BUSINESS',error:'La prueba de informes sólo consulta.'});return createOwnCloseHandler(deps)(req,res);} ]])});
 let failure,report;
 try{
  const session=await host.open('reviewer'),page=session.page,$=key=>page.locator('[data-report-'+key+']');
  page.on('request',request=>{if(new URL(request.url()).origin===host.origin&&request.method()!=='GET')posts.push({method:request.method(),path:new URL(request.url()).pathname});});
  const census=await verifiedOwnReportCensus(await wire(session,{resource:'report-census',period,liquidationType:'monthly'}));assert.deepEqual(census.groups.filter(group=>group.state==='closed').map(group=>group.id),[receipt.groupId]);
  const current=await verifiedOwnCloseReceipt(await wire(session,{resource:'group',id:receipt.groupId}));assert.deepEqual(current,{...receipt,replayed:true});
  const empty=await verifiedOwnReportCensus(await wire(session,{resource:'report-census',period,liquidationType:'sac'}));assert.equal(empty.eventCount,0);assert.deepEqual(empty.groups,[]);
  await page.goto(host.origin+'/nomina#reportes');await $('status').waitFor();await settled(page);await $('from').fill(period);await $('to').fill(period);
  const consult=async types=>{await $('types').selectOption(types);await $('consult').click();await settled(page);await $('result').waitFor({state:'visible'});};
  await consult(['sac']);assert.equal(await $('rows').locator('tr').count(),0);assert.ok((await $('status').innerText()).includes('No hay filas'));assert.ok(!(await $('totals').innerText()).includes('0.00'));
  await consult(['monthly','sac']);assert.ok((await $('summary').innerText()).includes('1 grupos cerrados'));assert.ok((await $('range').innerText()).includes('855 filas en cada descarga'));assert.equal(await $('rows').locator('tr').count(),25);
  const table=()=> $('rows').locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
  assert.deepEqual(await table(),expected.payroll.slice(0,25));await $('next').click();assert.deepEqual(await table(),expected.payroll.slice(25,50));
  await $('ranges').locator('summary').click();await $('employeeFrom').fill('31000');await $('employeeTo').fill('31004');assert.deepEqual(await table(),expected.payroll.slice(0,5));assert.ok((await $('range').innerText()).includes('5 filas en cada descarga'));
  await $('employeeFrom').fill('');await $('employeeTo').fill('');assert.ok((await $('range').innerText()).includes('855 filas en cada descarga'));
  await $('search').fill('no-m8-visible-match');assert.equal(await $('rows').locator('tr').count(),0);
  async function download(format,name,oracle){const event=page.waitForEvent('download',{timeout:100000});await $(format).click();const downloaded=await event;assert.equal(await downloaded.failure(),null);const file=path.join(host.output,name);await downloaded.saveAs(file);await settled(page);const bytes=fs.readFileSync(file);assert.ok(bytes.length>100);if(format==='csv')assert.deepEqual(csvRows(bytes).slice(1),oracle);else if(format==='xlsx')assert.deepEqual(workbookRows(bytes).slice(1),oracle);else pdfRows(bytes,oracle);files.push({path:DIRECTORY+'/'+name,bytes:bytes.length,sha256:hash(bytes),format,rows:oracle.length});}
  await download('csv','payroll.csv',expected.payroll);await download('xlsx','payroll.xlsx',expected.payroll);await download('pdf','payroll.pdf',expected.payroll);
  await $('search').fill('');await $('view').selectOption('concepts');assert.ok((await $('range').innerText()).includes('17100 filas en cada descarga'));assert.deepEqual(await table(),expected.concepts.slice(0,25));await $('search').fill('no-m8-visible-match');assert.equal(await $('rows').locator('tr').count(),0);await download('csv','concepts.csv',expected.concepts);
  await $('search').fill('');await $('view').selectOption('payroll');
  for(const width of[1366,390,320]){await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const name='report-'+width+'.png',file=path.join(host.output,name);await page.screenshot({path:file,fullPage:true});const bytes=fs.readFileSync(file);files.push({path:DIRECTORY+'/'+name,bytes:bytes.length,sha256:hash(bytes),format:'png',rows:null});}
  assert.deepEqual(posts,[]);for(const key of['external','pageErrors','serverErrors'])assert.deepEqual(host.evidence[key],[]);assert.deepEqual(readSnapshot(),before);assert.deepEqual(await readLedger(),beforeLedger);source.after();
  report={version:'own-report-post209-same190-read.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,period,liquidationType:'monthly',closedGroupId:receipt.groupId,closedSnapshotSha256:receipt.snapshotSha256,population:855,conceptRows:17100,actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,readOnlyBusiness:true,driverReadWriteTransactionsForExistingAuthLocks:true,mutations:0,pagePosts:0,emptySacVerified:true,employeeRangeVerified:[31000,31004],allExportsIgnoreViewSearch:true,downloads:{payrollRows:855,conceptCsvRows:17100,formats:['csv','xlsx','pdf']},sourceBookend:source.sourceBookend,builtHtmlBookend:source.builtHtmlBookend,sourceBeforeAfterEqual:true,ledgerUnchanged:true,rpcCalls:calls,httpEvidence:host.evidence.httpEvidence,artifacts:files,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 }catch(error){failure=error;throw error;}
 finally{try{await host.close();}catch(error){if(!failure)throw error;}}
 return Object.freeze(report);
}

export function assertOwnReportPost209Artifacts(report,destination){
 assert.equal(report?.version,'own-report-post209-same190-read.v1');assert.equal(report.passed,true);assert.equal(report.population,855);assert.equal(report.conceptRows,17100);assert.equal(report.mutations,0);assert.equal(report.pagePosts,0);assert.equal(report.ledgerUnchanged,true);
 const expected=['payroll.csv','payroll.xlsx','payroll.pdf','concepts.csv','report-1366.png','report-390.png','report-320.png'].map(name=>DIRECTORY+'/'+name);assert.deepEqual(report.artifacts.map(value=>value.path),expected);
 const root=fs.realpathSync(destination),folder=path.join(root,DIRECTORY);assert.ok(fs.lstatSync(folder).isDirectory()&&!fs.lstatSync(folder).isSymbolicLink());assert.equal(fs.realpathSync(folder),folder);
 for(const item of report.artifacts){assert.match(item.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(item.bytes)&&item.bytes>0&&item.bytes<=256*1024*1024);const file=path.resolve(root,item.path);assert.equal(path.dirname(file),folder);assert.ok(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());assert.equal(fs.realpathSync(file),file);const bytes=fs.readFileSync(file);assert.equal(bytes.length,item.bytes);assert.equal(hash(bytes),item.sha256);}
 return{passed:true,files:7,downloadFiles:4,screens:3,municipalAcceptance:false};
}
