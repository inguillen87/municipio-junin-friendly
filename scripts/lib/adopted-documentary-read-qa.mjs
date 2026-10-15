// Canonical documentary readers over an invented adoption foundation only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import http from 'node:http';
import {launchOwnSyntheticBrowser} from './own-synthetic-browser.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {buildNoeliaCircuitQa,createNoeliaCircuitPsqlQa} from './noelia-payroll-circuit-qa.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {noeliaCircuitRuntime} from './noelia-circuit-runtime.mjs';
const exec=promisify(execFile),lf=s=>s.replace(/\r\n?/g,'\n');
export const DOCUMENTARY_BASELINE_PINS=Object.freeze({employee_payroll_detail_v1:'4d39bc0df9e3a0d68808bdf8229a997cf9b708a45ea134815e4e8fb2fa1a1c1f',employee_payroll_documents_v1:'fbb185e0809d25c0244c841d07b8fe44f26c6780115f8a36be3d692d7c3f50b9',payroll_export_roster_v1:'4e38106e906d20e220b1ab58037474ab3d931f06c1e6af114f1b8a465363b3f1'});
export const DOCUMENTARY_OBSERVED_PINS=Object.freeze({17:{...DOCUMENTARY_BASELINE_PINS,employee_payroll_detail_v1:'ad5c9ce9df693d51e326b1708c79977e11fb1c49901be1c8d17d013d3fb4109c'},18:{...DOCUMENTARY_BASELINE_PINS,employee_payroll_detail_v1:'80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827',employee_payroll_documents_v1:'726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25'}});
export function documentaryFunction(source,name){const found=splitPostgresStatements(lf(source)).filter(s=>new RegExp('CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\(').test(s));assert.equal(found.length,1,'DOCUMENTARY_CANONICAL_FUNCTION_MISSING: '+name);return found[0];}
export function documentaryBaselineDefinitions(read,{baseline='canonical',major}={}){
 assert.ok(['canonical','observed'].includes(baseline));if(baseline==='observed')assert.ok([17,18].includes(major));
 const from=(file,name)=>documentaryFunction(read('scripts/migrations/'+file),name);
 let detail=from('048-payroll-detail-source.sql','employee_payroll_detail_v1'),library=from('051-payroll-document-library.sql','employee_payroll_documents_v1');
 const old="'closureStatus',CASE WHEN ds.source_closed_flag=1 THEN 'closed' ELSE 'open' END",replacement="'closureStatus',CASE ds.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END";
 assert.equal(detail.split(old).length,2);detail=detail.replace(old,replacement);
 const effective=value=>value.replaceAll('payroll_monthly_fact','grh_effective_payroll_monthly_fact_v1').replaceAll('JOIN payroll_run ','JOIN grh_effective_payroll_run_v1 ');
 const independent=value=>{assert.equal(value.split('action_center_assert_tenant_read_session_v2(').length,2);return value.replace('action_center_assert_tenant_read_session_v2(','employee_payroll_assert_read_session_v1(');};
 detail=independent(effective(detail));library=independent(effective(library));
 const definitions=[detail,library,from('054-payroll-export-roster.sql','payroll_export_roster_v1')];
 for(const definition of definitions){const pin=ownInstallationFunctionPin(definition);assert.equal(pin.sha256,DOCUMENTARY_BASELINE_PINS[pin.name],'DOCUMENTARY_BASELINE_SOURCE_CHANGED: '+pin.name);}
 if(baseline==='observed'){
  // Observed bodies are reproduced from public canonical code, never copied
  // from a private metadata export. These exact whitespace edits have no SQL
  // token changes; fixed hashes reject any unexpected source evolution.
  const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(definitions[0]);assert.ok(match);let body=match[2];assert.ok(body.startsWith('\n'));assert.equal(body.split('payroll_detail_statement%ROWTYPE;\n actual').length,2);
  body=' '+body.slice(1).replace('payroll_detail_statement%ROWTYPE;\n actual','payroll_detail_statement%ROWTYPE;actual').replaceAll('\n','');
  definitions[0]=definitions[0].replace(match[2],()=>body);
  if(major===18)for(const index of [0,1])definitions[index]=definitions[index].replace('employee_payroll_assert_read_session_v1(','action_center_assert_tenant_read_session_v2(');
  for(const definition of definitions){const pin=ownInstallationFunctionPin(definition);assert.equal(pin.sha256,DOCUMENTARY_OBSERVED_PINS[major][pin.name],'DOCUMENTARY_OBSERVED_SOURCE_CHANGED: '+pin.name);}
 }
 return definitions;
}
export function documentaryBaselineStatements(read,options={}){
 const {baseline='canonical',major}=options;assert.ok(['canonical','observed'].includes(baseline));if(baseline==='observed')assert.ok([17,18].includes(major));
 const files=['031-governed-employee-payroll-history.sql','048-payroll-detail-source.sql','051-payroll-document-library.sql','052-payroll-detail-closure-state.sql','054-payroll-export-roster.sql'];
 const result=files.flatMap(file=>splitPostgresStatements(lf(read('scripts/migrations/'+file))));
 const effective=lf(read('scripts/migrations/097-grh-effective-consumers.sql'));
 for(const index of [1,2,3]){const block=new RegExp('DO \\$patch_'+index+'\\$[\\s\\S]*?\\$patch_'+index+'\\$;').exec(effective)?.[0];assert.ok(block,'DOCUMENTARY_EFFECTIVE_PATCH_MISSING');result.push(block);}
 if(baseline==='canonical'||major===17)result.push(...splitPostgresStatements(lf(read('scripts/migrations/105-payroll-independent-read-session.sql'))));
 const definitions=documentaryBaselineDefinitions(read,options);if(baseline==='observed')result.push(...definitions.slice(0,major===17?1:2).map(s=>s.replace(/CREATE(?: OR REPLACE)? FUNCTION /,'CREATE OR REPLACE FUNCTION ')));
 return result;
}
export function documentaryQaFoundation(major){
 const qa=buildNoeliaCircuitQa(major),anchor='    END $seed$; COMMIT;';assert.equal(qa.sql.split(anchor).length,2);
 const sourceGuard='CREATE TRIGGER grh_effective_baseline_rows';assert.equal(qa.sql.split(sourceGuard).length,2);
 qa.sql=qa.sql.replace(sourceGuard,()=>`UPDATE employment_contract SET legacy_legajo='902',start_date=NULL,end_date=NULL,status='inactive' WHERE id=${q(qa.ids.targetContract)}::uuid;UPDATE employment_contract SET source_payload=source_payload||jsonb_build_object('personId',person_id::text) WHERE source_system='GRH';\n`+sourceGuard);
 // Source tables are fixture data, not substitute authorization functions.
 const source=`
 CREATE TABLE data_import_runs(id bigint PRIMARY KEY,status text,source_sha256 text,source_cutoff timestamp);
 UPDATE source_import_batch SET source_sha256=repeat('a',64);
 INSERT INTO data_import_runs SELECT legacy_import_run_id,'completed',source_sha256,source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM source_import_batch;
 UPDATE grh_effective_source_binding SET import_run_id=92001;
 UPDATE grh_curated_source_version SET import_run_id=92001;
 ALTER TABLE grh_employees ADD COLUMN nombre text,ADD COLUMN sector_code text,ADD COLUMN sector text,ADD COLUMN import_run_id bigint,ADD COLUMN person_id text;
 INSERT INTO grh_employees(company_id,legajo,nombre,sector_code,sector,import_run_id,person_id)
 SELECT c.legacy_company_id,c.legacy_legajo,p.full_name,c.sector_source_id,'Repartición exclusivamente sintética QA',sb.legacy_import_run_id,c.source_payload->>'personId' FROM employment_contract c JOIN person_identity p ON p.id=c.person_id JOIN source_import_batch sb ON sb.id=c.source_batch_id WHERE c.source_system='GRH';
 CREATE VIEW grh_effective_employees_v1 AS SELECT * FROM grh_employees;
 CREATE TABLE payroll_run(id uuid PRIMARY KEY,source_system text,source_batch_id uuid,company_source_id text);
 CREATE TABLE payroll_monthly_fact(employment_contract_id uuid,payroll_run_id uuid,source_system text,source_batch_id uuid,payroll_date date,payroll_type text,source_period integer,source_month integer,total_subject_earnings numeric(24,2),total_non_subject_earnings numeric(24,2),family_allowance numeric(24,2),employee_withholdings numeric(24,2),net_payable numeric(24,2),employer_contributions numeric(24,2),item_count integer);
 CREATE VIEW grh_effective_payroll_run_v1 AS SELECT * FROM payroll_run;
 CREATE VIEW grh_effective_payroll_monthly_fact_v1 AS SELECT * FROM payroll_monthly_fact;
 INSERT INTO capabilities SELECT a.id,'payroll.read' FROM unnest(ARRAY[${q(qa.ids.maker)}::uuid,${q(qa.ids.checker)}::uuid,${q(qa.ids.outsider)}::uuid]) a(id) WHERE NOT EXISTS(SELECT 1 FROM capabilities c WHERE c.membership_id=a.id AND c.capability_key='payroll.read');
 `;
 return {...qa,sql:qa.sql.replace(anchor,()=>source+'\n'+anchor)};
}
export function assertDocumentaryQaProcess(root,major,value){
 assert.ok([17,18].includes(major));const expected=major===17?5988:34448;
 assert.equal(value.process.ProcessId,expected,'DOCUMENTARY_QA_PROCESS_CHANGED');assert.equal(value.listener.OwningProcess,expected);assert.equal(value.listener.LocalAddress,'127.0.0.1');assert.equal(value.listener.LocalPort,55400+major);
 const executable=path.resolve(root,'verification/postgresql-qa-20261004/pg'+major+'/pgsql/bin/postgres.exe'),directory=path.resolve(root,'verification/postgresql-qa-20261004/pg'+major+'-data');
 assert.equal(path.resolve(value.process.ExecutablePath).toLowerCase(),executable.toLowerCase());assert.ok(value.process.CommandLine.replaceAll('\\','/').includes(directory.replaceAll('\\','/')));assert.match(value.process.CommandLine,new RegExp('-p '+(55400+major)+' -h 127\\.0\\.0\\.1'));
 assert.equal(Number(fs.readFileSync(path.join(directory,'postmaster.pid'),'utf8').split(/\r?\n/)[0]),expected);
 return{major,port:55400+major,processId:expected,executable,directory,host:'127.0.0.1',database:'own_payroll_run_qa'};
}
export async function verifyDocumentaryQaProcess(root,major,{transport='local'}={}){
 assert.ok(['local','ci'].includes(transport));
 if(transport==='ci'){
  noeliaCircuitRuntime({root,major,transport,browser:'chromium'});
  return{major,port:55400+major,host:'127.0.0.1',database:'own_payroll_run_qa',ciRuntimeVerified:true,processVerified:false,runId:process.env.GITHUB_RUN_ID,sourceCommit:process.env.GITHUB_SHA,guard:'canonical database/version/non-Neon guard on every SQL connection'};
 }
 assert.equal(process.platform,'win32','DOCUMENTARY_QA_WINDOWS_REQUIRED');assert.ok([17,18].includes(major));const pid=major===17?5988:34448;
 const script="$ErrorActionPreference='Stop';$p=Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId="+pid+"';$l=Get-NetTCPConnection -State Listen -LocalPort "+(55400+major)+";if(@($p).Count -ne 1 -or @($l).Count -ne 1){throw 'QA_PROCESS_IDENTITY_AMBIGUOUS'};[pscustomobject]@{process=($p|Select-Object ProcessId,ExecutablePath,CommandLine);listener=($l|Select-Object LocalAddress,LocalPort,OwningProcess)}|ConvertTo-Json -Compress -Depth 4";
 const result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000});return assertDocumentaryQaProcess(root,major,JSON.parse(result.stdout));
}
export function documentaryQaBridge(qa,major,{transport='local'}={}){
 const db=createNoeliaCircuitPsqlQa({major,port:55400+major,schema:qa.schema,pins:qa.pins,transport,browser:'chromium'});
 const literal=value=>Array.isArray(value)?'ARRAY['+value.map(q).join(',')+']::text[]':value===null?'NULL':q(value);
 const render=(text,values)=>text.replace(/\$(\d+)/g,(_,index)=>{assert.ok(Number(index)>0&&Number(index)<=values.length);return literal(values[Number(index)-1]);});
 const query=async(text,values=[])=>{
  if(/^SELECT (?:public\.)?(employee_payroll_(?:detail|documents)_v1|payroll_export_roster_v1|payroll_source_report_v1)\(/.test(text))return[{result:await db.run(render(text.replace(/^SELECT (?:public\.)?/,'SELECT '+qa.schema+'.'),values),true)}];
  if(text.includes('/* payroll-batch:metadata */')||text.includes('/* payroll-batch:directory */')){assert.doesNotMatch(text,/;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);return await db.run('SELECT coalesce(jsonb_agg(to_jsonb(documentary_rows)),\'[]\'::jsonb) FROM ('+render(text,values)+') documentary_rows');}
  return db.query(text,values);
 };
 return{...db,query};
}
export const documentarySourceHash=source=>createHash('sha256').update(source).digest('hex');
export function documentaryQaOptions(argv){
 const args={};for(const value of argv){const match=/^--(major|output|source-commit|baseline|transport)=(.+)$/.exec(value);assert.ok(match&&!Object.hasOwn(args,match[1]),'DOCUMENTARY_QA_OPTION_INVALID');args[match[1]]=match[2];}
 assert.ok(['17','18'].includes(args.major),'DOCUMENTARY_QA_MAJOR_UNSUPPORTED');assert.ok(args.output,'DOCUMENTARY_QA_OUTPUT_REQUIRED');assert.match(args['source-commit']??'',/^[a-f0-9]{40}$/,'DOCUMENTARY_QA_SOURCE_COMMIT_REQUIRED');assert.ok(args.baseline===undefined||['canonical','observed'].includes(args.baseline),'DOCUMENTARY_QA_BASELINE_UNSUPPORTED');assert.ok(args.transport===undefined||['local','ci'].includes(args.transport),'DOCUMENTARY_QA_TRANSPORT_UNSUPPORTED');
 return{major:Number(args.major),output:args.output,sourceCommit:args['source-commit'],baseline:args.baseline??'canonical',transport:args.transport??'local'};
}
export function documentaryEffectiveBatchStatement(read){
 const statements=splitPostgresStatements(lf(read('scripts/migrations/097-grh-effective-consumers.sql')));
 const value=statements.find(s=>s.includes('CREATE OR REPLACE VIEW public.grh_effective_source_batch_v1 AS'));
 assert.ok(value,'DOCUMENTARY_EFFECTIVE_VIEW_MISSING');return value;
}
// Schema relocation changes only explicitly qualified identifiers and their
// exact expected body hashes. Production SQL and all guard branches stay intact.
export function relocateDocumentary178(read,qa){
 const original=lf(read('scripts/migrations/178-adopted-documentary-read.sql'));
 const pins=JSON.parse(/\$pins178\$([\s\S]*?)\$pins178\$::jsonb/.exec(original)?.[1]??'null');assert.equal(pins?.length,3);
 const variants=JSON.parse(/\$variants178\$([\s\S]*?)\$variants178\$::jsonb/.exec(original)?.[1]??'[]');assert.equal(variants.length,3,'DOCUMENTARY_OBSERVED_VARIANTS_REQUIRED');
 const helper=/\$definition178\$([\s\S]*?)\$definition178\$/.exec(original)?.[1];assert.ok(helper);
 const hashBody=s=>documentarySourceHash(/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s)[2]);
 const substitutions=new Map([[hashBody(helper),hashBody(qa.normalized(helper))]]);
 const before=[...documentaryBaselineDefinitions(read),...documentaryBaselineDefinitions(read,{baseline:'observed',major:17}),...documentaryBaselineDefinitions(read,{baseline:'observed',major:18})];
 for(const item of [...pins,...variants]){const definition=before.find(s=>ownInstallationFunctionPin(s).signature===item.signature&&hashBody(s)===item.beforeHash);assert.ok(definition,'DOCUMENTARY_UNREVIEWED_VARIANT');let after=definition;
  for(const [from,to] of item.changes){assert.equal(after.split(from).length,2);after=after.replace(from,()=>to);}
  assert.equal(hashBody(after),item.afterHash);substitutions.set(item.beforeHash,hashBody(qa.normalized(definition)));substitutions.set(item.afterHash,hashBody(qa.normalized(after)));
 }
 let relocated=qa.normalized(original);for(const [from,to] of substitutions)relocated=relocated.replaceAll(from,to);
 return{statement:relocated,sourceSha256:documentarySourceHash(original),canonicalPins:pins.map(({signature,beforeHash,afterHash})=>({signature,beforeHash,afterHash})),observedPins:variants.map(({signature,beforeHash,afterHash})=>({signature,beforeHash,afterHash})),hashSubstitutions:Object.fromEntries(substitutions)};
}
export function relocateDocumentaryInstallation(batch,qa,patch){
 assert.equal(batch.executesSql,false);assert.equal(batch.connects,false);assert.equal(batch.migration.length,1);assert.equal(batch.sqlSha256,patch.sourceSha256);
 const map=s=>s===batch.destination?'DO $qa_destination178$ BEGIN '+qa.pins+' END $qa_destination178$':s===batch.migration[0]?patch.statement:qa.normalized(s);
 const relocated=Object.fromEntries(['installation','durableVerification','repetition'].map(key=>[key,batch[key].map(map)]));
 for(const value of Object.values(relocated))for(const statement of value)assert.ok(!statement.includes("current_database()<>'neondb'"),'DOCUMENTARY_PRODUCTION_DESTINATION_IN_QA');
 return{...relocated,qaRelocation:true,productionDestinationNotExecuted:true};
}
// Existing report panel and exporters, through actual SQL-backed server modules.
// The small loopback HTTP adapter supplies only the already authenticated QA
// context; it is not a substitute assertion for the complete internal-data API.
export async function documentaryBrowserQa({root,destination,datasetId,person,request,expectedIndividual,expectedSet}){
 const checks=[],errors=[],requestFailures=[],methods=[],resources=[],downloads=[],inflight=new Set(),requests=[],serverRequests=[],records=new Map(),listeners=new Set();let server,browser,page,active=0,phase='initial';const changed=()=>{for(const notify of listeners)notify();};
 const drain=async next=>{phase=next;await new Promise((resolve,reject)=>{const finish=()=>{if(active||inflight.size)return;clearTimeout(timer);listeners.delete(finish);resolve();},timer=setTimeout(()=>{listeners.delete(finish);reject(Error('DOCUMENTARY_BROWSER_DRAIN_TIMEOUT: '+phase));},15000);listeners.add(finish);finish();});assert.deepEqual(requestFailures,[]);};
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/payroll-document-batch.css"><style>body{margin:16px;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}</style><main id="qa"></main><script type="module">window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:["payroll.read","workforce.employee.read"]})};const{mountPayrollDocumentBatch}=await import("/assets/payroll-document-batch-panel.js");window.qaUi=mountPayrollDocumentBatch(document.querySelector("#qa"));</script></html>';
 try{
  server=http.createServer((req,res)=>{const url=new URL(req.url,'http://qa.invalid'),record={id:serverRequests.length+1,phase,resource:url.searchParams.get('resource'),path:url.pathname,finished:false};serverRequests.push(record);methods.push(req.method);res.on('finish',()=>{record.finished=true;changed();});res.setHeader('X-QA-Documentary-Request-Id',String(record.id));res.setHeader('Cache-Control','private, no-store');res.setHeader('Connection','close');res.setHeader('Content-Security-Policy',"default-src 'self';connect-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: blob:;font-src 'self';object-src 'none';base-uri 'none';form-action 'self';worker-src 'none'");
   const send=(status,type,body)=>{const bytes=Buffer.from(body);record.status=status;record.bytes=bytes.length;record.sha256=documentarySourceHash(bytes);res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length});res.end(bytes);};
   if(req.method!=='GET'){send(405,'text/plain','');return;}
   if(url.pathname==='/api/internal-data'){active++;resources.push(url.searchParams.get('resource'));Promise.resolve().then(()=>request(url.pathname+url.search)).then(v=>send(200,'application/json',JSON.stringify(v))).catch(e=>{errors.push(e.message);send(500,'application/json',JSON.stringify({ok:false,code:'QA_DOCUMENTARY_SERVER_FAILED'}));}).finally(()=>{active--;changed();});return;}
   if(url.pathname==='/'){send(200,'text/html; charset=utf-8',html);return;}
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){send(404,'text/plain','');return;}
   send(200,file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream',fs.readFileSync(file));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  let driverName;({browser,driverName}=await launchOwnSyntheticBrowser());page=await browser.newPage({viewport:{width:1366,height:1000},acceptDownloads:true,locale:'es-AR',timezoneId:'America/Argentina/Buenos_Aires'});page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));page.on('request',r=>{assert.equal(new URL(r.url()).origin,origin);const row={id:requests.length+1,phase,path:new URL(r.url()).pathname,resource:new URL(r.url()).searchParams.get('resource'),finished:false};requests.push(row);records.set(r,row);inflight.add(r);});page.on('response',r=>{const row=records.get(r.request());if(row){row.status=r.status();row.serverId=r.headers()['x-qa-documentary-request-id'];}});page.on('requestfinished',r=>{records.get(r).finished=true;inflight.delete(r);changed();});page.on('requestfailed',r=>{const row=records.get(r);row.error=r.failure()?.errorText;row.failedPhase=phase;inflight.delete(r);requestFailures.push({...row});changed();});
  await page.goto(origin);await page.getByRole('button',{name:'Consultar liquidaciones',exact:true}).click();await page.getByLabel('Liquidación documental').selectOption(datasetId);
  for(const[name,value]of Object.entries({fromNumber:'900',toNumber:'901',fromSector:'20',toSector:'20'}))await page.locator('[name='+name+']').fill(value);
  await page.getByRole('button',{name:'Aplicar selección',exact:true}).click();await page.locator('[data-batch-status]').filter({hasText:'Selección verificada: 2'}).waitFor();assert.equal(await page.locator('[data-batch-rows]>tr').count(),2);checks.push('existing report panel selects both adopted901/0901 through actual PostgreSQL number and repartition filters');
  await drain('selection-complete');phase='individual-detail';await page.getByRole('button',{name:'Abrir conceptos del legajo '+person.number,exact:true}).click();const detail=page.locator('[data-payroll-detail-panel]');await detail.locator('.pd-table').first().waitFor();await drain('detail-open-complete');phase='individual-download';const individual=page.waitForEvent('download');await detail.getByRole('button',{name:'Descargar detalle · PDF',exact:true}).click();const individualPath=path.join(destination,'browser-individual.pdf');await(await individual).saveAs(individualPath);assert.deepEqual(fs.readFileSync(individualPath),Buffer.from(expectedIndividual));await drain('individual-download-complete');checks.push('individual browser download reauthorizes actual SQL detail and equals original pre-adoption PDF bytes');
  phase='close-detail';await detail.getByRole('button',{name:'Cerrar detalle',exact:true}).click();await drain('detail-closed');phase='combined-download';const combined=page.waitForEvent('download');await page.getByRole('button',{name:'Preparar y descargar PDF conjunto',exact:true}).click();const combinedPath=path.join(destination,'browser-complete.pdf');await(await combined).saveAs(combinedPath);await page.locator('[data-document-package] [role=status]').filter({hasText:'PDF conjunto descargado'}).waitFor();assert.deepEqual(fs.readFileSync(combinedPath),Buffer.from(expectedSet));await drain('combined-download-complete');checks.push('complete browser download rereads every original document and exactly equals the canonical two-document PDF');
  for(const width of [1366,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#qa').screenshot({path:path.join(destination,'browser-'+width+'.png')});checks.push('existing panel has no horizontal document overflow at'+width);}
  assert.equal(downloads.length,2);assert.ok(resources.includes('payrollsourcereport')&&resources.includes('payrolldocumentbatch')&&resources.includes('employeepayrolldetail'));assert.ok(methods.every(v=>v==='GET'));assert.equal(active,0);assert.equal(inflight.size,0);assert.deepEqual(errors,[]);assert.deepEqual(requestFailures,[]);checks.push('browser uses only loopback GET reads with zero page/server errors, failed requests or incomplete requests');
  const report={ok:true,driverName,checks,actualPostgreSql:true,actualServerModules:true,actualExistingPanel:true,completeInternalDataHandler:false,requestFailures,errors,downloadCount:downloads.length,resources,requests,serverRequests,externalRequests:0};fs.writeFileSync(path.join(destination,'browser-proof.json'),JSON.stringify(report,null,2));return report;
 }catch(e){if(page)await page.screenshot({path:path.join(destination,'browser-failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(destination,'browser-failure.json'),JSON.stringify({message:e.message,stack:e.stack,checks,errors,requestFailures,requests,serverRequests,phase,active,inflight:inflight.size},null,2));throw e;}
 finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
