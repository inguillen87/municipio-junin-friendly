// Compiled product UI with synthetic people/PDF and every private API intercepted.
// --published reads public assets only, without cookies, and checks build parity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';
import {nativeSchoolingFixture,nativeFamilyRow,nativeFamilySubject,nativeFamilyIds,syntheticAdministrativeCertificate,syntheticUuid,syntheticSchoolPdf,syntheticSchoolHash} from '../tests/fixtures/native-family-schooling-synthetic.js';
import {draft,bootstrap,receipt as registrationReceipt} from '../tests/fixtures/native-employee-synthetic.js';
import {nativeEmployeeDetail} from '../lib/native-employee-directory.js';
import '../assets/app-routes.js';

assert.ok(process.argv.slice(2).every(x=>x==='--published'),'UNKNOWN_ARGUMENT');
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://municontrol.test';
const base=path.resolve('public'),out=path.resolve('verification/native-family-schooling-'+(published?'published':'local'));
fs.mkdirSync(out,{recursive:true});
const ownedAssets=['assets/family-schooling.js','assets/family-schooling-model.js','assets/family-schooling-export.js','assets/family-schooling.css','assets/native-employee-create.js'];
for(const file of ownedAssets)assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(base,file))),'STALE_BUILD:'+file);
const checks=[],errors=[],requests=[],familyPosts=[],schoolPosts=[],downloads=[],assetReceipts=new Map(),routeFailures=[];
const subject=nativeFamilySubject(),otherSubject=nativeFamilySubject(true),subjects=new Map([[subject.contractId,subject],[otherSubject.contractId,otherSubject]]);
const receipts=new Map(),schoolReceipts=new Map(),histories=new Map();
const dataset=nativeSchoolingFixture({children:false});
let created=false,createPosts=0,canWrite=true,deny=false,dropChild=false,dropSchool=false,wrongReceipt=false,wrongFamily=false,wrongContext=false,delayedRead=null,actor='qa@example.invalid';
const nativeReceipt={...registrationReceipt,registrationId:subject.registrationId,contractId:subject.contractId,legajo:subject.legajo,name:subject.employeeName,startDate:'2026-09-22',createdAt:subject.registeredAt,jurisdictionCode:'42'};
function employee(s){return {recordOrigin:'MUNICONTROL',jurisdictionCode:'42',contractId:s.contractId,canonicalPersonId:syntheticUuid(88001),companyId:7,legajo:s.legajo,nombre:s.employeeName,
 dni:'99999990',cuil:'20999999906',fechaNacimiento:'1990-01-01',fechaIngreso:'2026-09-22',activo:true,administrativeStatus:'active',liquidable:false,payrollStatus:'not_liquidated',controlState:'alta_nativa_sin_liquidar',crosswalkStatus:'not_loaded',
 organizacion:'Sector QA',sector:'Repartición QA',convenio:'Convenio QA 1',categoria:'6-D',rawFields:{employment:{agreementName:'Convenio QA 1',categoryName:'6-D',organizationName:'Sector QA',sectorName:'Repartición QA'},native:{registrationId:s.registrationId,legalReference:'Resolución sintética',createdAt:s.registeredAt}}};}
function report(contractId){const p=structuredClone(dataset);p.data.canRegister=canWrite;
 if(contractId){p.data.scope.cohort='contract_children';p.data.rows=p.data.rows.filter(r=>r.contractId===contractId);if(wrongFamily&&p.data.rows.length)p.data.rows[0].contractId=otherSubject.contractId;}
 const cuts=p.data.rows.map(r=>r.sourceCutoff).filter(Boolean).sort();p.data.scope.sourceCutoffFrom=cuts[0]??null;p.data.scope.sourceCutoffTo=cuts.at(-1)??null;
 p.data.scope.unresolvedFamilyRows=p.data.rows.filter(r=>r.identityReviewRequired).length;
 for(const row of p.data.rows){const dates=row.certificate??row.sourceSchooling;row.effectiveDates={origin:row.certificate?'manual':row.sourceSchooling?'grh_source':'none',presentedOn:dates?.presentedOn??null,expiresOn:dates?.expiresOn??null};}return p;}
async function publicBytes(url,expected){assert.equal(url.origin,origin);assert.ok(!url.pathname.startsWith('/api/'));
 const resolved=globalThis.MuniControlRoutes.resolve(url.href,origin),target=new URL(resolved?.path||url.pathname,origin);
 const response=await fetch(target,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200);const chunks=[];let count=0;
 for await(const chunk of response.body){count+=chunk.length;assert.ok(count<=expected.length,'ASSET_SIZE');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
 assert.ok(bytes.equals(expected),'ASSET_PARITY:'+target.pathname);assetReceipts.set(target.pathname,createHash('sha256').update(bytes).digest('hex'));return bytes;}
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),...(process.env.SCHOOLING_BROWSER_CHANNEL?{channel:process.env.SCHOOLING_BROWSER_CHANNEL}:{})});
let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{try{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(!u.pathname.startsWith('/api/')){
   assert.equal(req.method(),'GET');const pages={'/personal':'internal-dashboard.html','/reportes':'reportes-rrhh.html','/acceso':'login.html'};
   const file=path.resolve(base,pages[u.pathname]||'.'+decodeURIComponent(u.pathname));if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);if(published)body=await publicBytes(u,body);
   const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
   return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body});
  }
  const resource=u.searchParams.get('resource');requests.push({path:u.pathname,resource,method:req.method(),contractId:u.searchParams.get('contractId')});
  const ok=data=>route.fulfill({json:{ok:true,data}}),fail=(code,status=403)=>route.fulfill({status,json:{ok:false,code,error:'Rechazo sintético controlado'}});
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Operador sintético',email:actor,role:'ADMIN_INTERNO'},access:{tenantCapabilities:['workforce.employee.read','workforce.summary.read','employee.record.create',...(canWrite?['employee.record.propose']:[])],platformRoles:[],platformCapabilities:[]}}});
  if(u.pathname==='/api/internal-native-employees'){
   if(req.method()==='POST'){createPosts++;created=true;return route.fulfill({status:201,json:{ok:true,data:nativeReceipt}});}
   return ok(resource==='bootstrap'?{...bootstrap,today:'2026-09-22'}:{...nativeReceipt,replayed:true});
  }
  if(u.pathname==='/api/internal-family-members'){
   assert.equal(u.searchParams.get('version'),'2');if(deny)return fail('EMPLOYEE_FAMILY_CAPABILITY_REQUIRED');
   if(req.method()==='GET'){
    if(resource==='attempt'){const found=receipts.get(u.searchParams.get('key'));return found?ok({...found.receipt,duplicate:true}):fail('EMPLOYEE_FAMILY_NOT_FOUND',404);}
    assert.equal(resource,'context');const s=subjects.get(u.searchParams.get('contractId'));assert.ok(s);return ok({version:'employee-family-context.v2',canDeclare:canWrite,subject:{...s,...(wrongContext?{contractId:otherSubject.contractId}:{})}});
   }
   assert.equal(req.method(),'POST');const body=req.postDataJSON(),key=req.headers()['idempotency-key'];familyPosts.push({body,key});
   if(!canWrite)return fail('EMPLOYEE_FAMILY_CAPABILITY_REQUIRED');const s=subjects.get(body.contractId);assert.ok(s);
   assert.deepEqual(Object.keys(body).sort(),['birthDate','contractId','contractIdentityToken','dni','familyName','validFrom','validTo']);
   if(body.contractIdentityToken!==s.identityToken)return fail('EMPLOYEE_FAMILY_IDENTITY_CHANGED',409);
   const found=receipts.get(key);if(found){assert.deepEqual(found.body,body);return ok({...found.receipt,duplicate:true});}
   const row=nativeFamilyRow({other:body.contractId===otherSubject.contractId,certificate:null});row.familyRef.id=syntheticUuid(81000+receipts.size);
   Object.assign(row,{familyName:body.familyName,birthDate:body.birthDate,validFrom:body.validFrom,familyEndDate:body.validTo,identityToken:createHash('sha256').update(key).digest('hex')});dataset.data.rows.push(row);
   const receipt={version:'employee-family-declare.v2',contractId:body.contractId,contractIdentityToken:body.contractIdentityToken,familyRef:row.familyRef,identityToken:row.identityToken,state:'declared',recordedAt:row.familyRecordedAt,duplicate:false};
   receipts.set(key,{body:structuredClone(body),receipt});if(dropChild){dropChild=false;return route.abort('timedout');}
   return ok(wrongReceipt?{...receipt,contractId:body.contractId===subject.contractId?otherSubject.contractId:subject.contractId}:receipt);
  }
  if(u.pathname==='/api/internal-family-certificates'){
   assert.equal(u.searchParams.get('version'),['report','family'].includes(resource)?'5':'3');if(deny)return fail('SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED');
   if(req.method()==='POST'){
    const body=req.postDataJSON(),key=req.headers()['idempotency-key'];schoolPosts.push({body,key});if(!canWrite)return fail('SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED');
    const row=dataset.data.rows.find(r=>r.contractId===body.contractId&&r.familyRef.id===body.familyRef.id);assert.ok(row);if(row.identityToken!==body.identityToken)return fail('SCHOOL_CERTIFICATE_IDENTITY_CHANGED',409);
    const previous=schoolReceipts.get(key);if(previous){assert.deepEqual(previous.body,body);return ok({...previous.receipt,duplicate:true});}
    assert.equal(body.expectedCertificateId,row.certificate?.id??null);assert.equal(body.familyRef.kind,'own');
    if(body.evidenceMode==='pdf'){assert.equal(body.sha256,syntheticSchoolHash);assert.deepEqual(Buffer.from(body.contentBase64,'base64'),syntheticSchoolPdf);}else assert.deepEqual([body.filename,body.contentBase64,body.sha256],[null,null,null]);
    const certificate=syntheticAdministrativeCertificate({pdf:body.evidenceMode==='pdf',id:syntheticUuid(82000+schoolReceipts.size),supersedesId:body.expectedCertificateId,recordedAt:'2026-09-22T12:30:00.'+String(schoolReceipts.size).padStart(6,'0')+'Z'});
    for(const field of ['institution','educationLevel','course','schoolYear','issuedOn','presentedOn','expiresOn','paperReference','reason'])certificate[field]=body[field];
    histories.set(row.familyRef.id,[certificate,...(histories.get(row.familyRef.id)??[])]);row.certificate=certificate;row.historyCount++;
    const receipt={version:'family-schooling-register.v3',certificateId:certificate.id,duplicate:false};schoolReceipts.set(key,{body:structuredClone(body),receipt});
    if(dropSchool){dropSchool=false;return route.abort('timedout');}return ok(receipt);
   }
   if(resource==='attempt'){const found=schoolReceipts.get(u.searchParams.get('key'));return found?ok({...found.receipt,duplicate:true}):fail('SCHOOL_CERTIFICATE_NOT_FOUND',404);}
   if(resource==='history'){
    const row=dataset.data.rows.find(r=>r.contractId===u.searchParams.get('contractId')&&r.familyRef.id===u.searchParams.get('familyId'));assert.ok(row);assert.equal(row.identityToken,u.searchParams.get('identityToken'));
    const rows=histories.get(row.familyRef.id)??[];return ok({version:'family-schooling-history.v3',contractId:row.contractId,familyRef:row.familyRef,identityToken:row.identityToken,rows,total:rows.length});
   }
   if(resource==='download')return route.fulfill({contentType:'application/pdf',headers:{'content-length':String(syntheticSchoolPdf.length),'content-disposition':'attachment; filename="certificado-sintetico.pdf"'},body:syntheticSchoolPdf});
   const value=report(resource==='family'?u.searchParams.get('contractId'):null);if(delayedRead){const wait=delayedRead;delayedRead=null;await wait;}return route.fulfill({json:value});
  }
  assert.equal(req.method(),'GET','UNEXPECTED_MUTATION');
  if(resource==='employee'){const s=subjects.get(u.searchParams.get('contractId'));assert.ok(s);return route.fulfill({json:nativeEmployeeDetail(employee(s)).payload});}
  if(resource==='employees'){const rows=created?[employee(subject),employee(otherSubject)]:[];return route.fulfill({json:{ok:true,data:rows,pagination:{page:1,limit:25,total:rows.length,pages:1},scope:{totalContracts:rows.length,totalPeople:rows.length,matched:0,ambiguous:0,unmatched:0},facets:{sectors:[],organizations:[],agreements:[]}}});}
  return ok([]);
 }catch(error){routeFailures.push(error.message);await route.abort().catch(()=>{});}});
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 const family=page.locator('[data-family-schooling-ficha]');
 async function ready(){await family.locator('[data-fs-family-refresh]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-family-schooling-ficha]')?.getAttribute('aria-busy')==='false');}
 async function openFamily(id=subject.contractId){await page.goto(origin+'/personal?contractId='+id+'&section=family#legajos');await ready();}
 async function openChild(name){await family.locator('[data-fs-add-child]').click();await family.locator('[data-fs-child-field="familyName"]').fill(name);}
 async function certificate(pdf=false){await family.locator('[data-fs-register]').first().click();await family.locator('[data-fs-presented]').fill('2026-09-21');
  if(pdf){await family.locator('[data-fs-file]').setInputFiles({name:'certificado-sintetico.pdf',mimeType:'application/pdf',buffer:syntheticSchoolPdf});await family.locator('[data-fs-school-field="reason"]').fill('Adjunto posterior de certificado sintético');}
  else {await family.locator('[data-fs-evidence-mode]').selectOption('paper_declared');await family.locator('[data-fs-school-field="paperReference"]').fill('Mesa de entradas sintética');}}
 async function saved(){await ready();await family.locator('.fs-editor').waitFor({state:'detached'});}
 async function capture(width){await page.setViewportSize({width,height:width===1440?1050:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{document.activeElement?.blur();await document.fonts.ready;});
  // A viewport change can arrive before the responsive dialog has repainted.
  // Wait for reachable geometry; retain the normal 12-second functional bound.
  await page.waitForFunction(()=>{const n=document.querySelector('#employeeDialog'),r=n?.getBoundingClientRect();return r&&r.left>=0&&r.right<=innerWidth+1&&n.scrollWidth<=n.clientWidth+1;});
  await page.evaluate(()=>window.__nativeFamilyFrame={stable:0});
  await page.waitForFunction(()=>{const card=document.querySelector('[data-family-schooling-ficha] .fs-child'),body=card?.closest('.dialog-body');if(!body)return false;
   const nav=body.querySelector('.employee-section-nav'),top=Math.max(body.getBoundingClientRect().top,nav?.getBoundingClientRect().bottom??0)+12;
   const wanted=body.scrollTop+card.getBoundingClientRect().top-top,max=Math.max(0,body.scrollHeight-body.clientHeight);body.scrollTo({top:Math.max(0,Math.min(max,wanted)),behavior:'instant'});
   const r=card.getBoundingClientRect(),state=window.__nativeFamilyFrame,geometry=[r.top,r.width,r.height,body.scrollTop,top];
   const visible=r.top>=top-1&&r.top+30<Math.min(body.getBoundingClientRect().bottom,innerHeight)&&card.contains(document.elementFromPoint(r.left+r.width/2,r.top+20));
   state.stable=visible&&state.geometry?.every((v,i)=>Math.abs(v-geometry[i])<1)?state.stable+1:0;state.geometry=geometry;return state.stable>=3;});
  const dialogGeometry=await page.locator('#employeeDialog').evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,viewport:innerWidth};});
  assert.ok(dialogGeometry.left>=0&&dialogGeometry.right<=dialogGeometry.viewport+1&&dialogGeometry.scrollWidth<=dialogGeometry.clientWidth+1,JSON.stringify(dialogGeometry));
  const geometry=await family.evaluate(n=>({width:n.clientWidth,scrollWidth:n.scrollWidth,overflow:[...n.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>n.getBoundingClientRect().right+1).map(x=>({tag:x.tagName,cls:x.className,width:x.clientWidth,scrollWidth:x.scrollWidth})).slice(0,8)}));
  await page.locator('#employeeDialog').screenshot({path:path.join(out,'family-'+width+'-synthetic.png')});assert.ok(geometry.scrollWidth<=geometry.width+1,JSON.stringify({viewport:width,...geometry}));}

 await page.goto(origin+'/personal#legajos');await page.getByRole('button',{name:'Nuevo legajo',exact:true}).click();
 const create=page.locator('dialog.native-employee-dialog');await create.locator('[name="fullName"]:enabled').waitFor();const values=draft({jurisdictionCode:'42',fullName:subject.employeeName,startDate:'2026-09-22'});
 for(const name of ['fullName','dni','cuil','birthDate','legajo','startDate','jobTitle','legalReference'])await create.locator('[name="'+name+'"]').fill(values[name]);
 for(const name of ['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode'])await create.locator('[name="'+name+'"]').selectOption(values[name]);
 await create.getByRole('button',{name:'Revisar alta',exact:true}).click();assert.equal(createPosts,0);await create.getByRole('button',{name:'Confirmar y crear legajo',exact:true}).click();
 await create.locator('[data-ne-success]:not([hidden])').waitFor();assert.equal(createPosts,1);const familyLink=create.locator('[data-ne-family]');await familyLink.waitFor();
 const link=new URL(await familyLink.getAttribute('href'),origin);assert.equal(link.searchParams.get('contractId'),subject.contractId);assert.equal(link.searchParams.get('section'),'family');
 await familyLink.click();await ready();assert.equal(await family.locator('.fs-child').count(),0);assert.equal(familyPosts.length,0);
 checks.push('native registration opens its exact UUID family section; no automatic child or certificate write');
 await openChild('Hijo nativo sintético');dropChild=true;await family.locator('[data-fs-child-save]').click();await ready();
 assert.equal(familyPosts.length,1);assert.equal(await family.locator('[data-fs-child-field="familyName"]').isDisabled(),true);assert.equal(await family.locator('[data-fs-child-cancel]').isDisabled(),true);
 await page.locator('#employeeDialog').getByRole('button',{name:/Cerrar ficha/}).click();
 await page.locator('#employeeRows').getByRole('button',{name:'Hijos y certificados',exact:true}).first().click();await ready();
 // Closing the dialog retains the uncertain attempt in memory. Recovery is a
 // scoped GET; if the UI already resolved it on reopen no extra click is needed.
 if(await family.locator('[data-fs-child-recheck]').count())await family.locator('[data-fs-child-recheck]').click();await saved();
 assert.equal(familyPosts.length,1);assert.equal(await family.locator('.fs-child').count(),1);assert.ok(requests.some(r=>r.path==='/api/internal-family-members'&&r.resource==='attempt'));
 checks.push('lost child acknowledgment locks the original attempt across dialog close and recovers one saved child');
 dataset.data.storage.usedBytes=dataset.data.storage.capacityBytes;dataset.data.storage.remainingBytes=0;
 await family.locator('[data-fs-family-refresh]').click();await ready();
 await certificate();dropSchool=true;await family.locator('[data-fs-save]').click();await ready();assert.equal(await family.locator('[data-fs-presented]').isDisabled(),true);
 await family.locator('[data-fs-save]').click();await saved();assert.deepEqual(schoolPosts[0],schoolPosts[1]);assert.equal(schoolReceipts.size,1);
 assert.match(await family.innerText(),/papel/i);assert.equal(await family.locator('[data-fs-document]').count(),0);checks.push('paper without PDF or remaining storage survives a lost response with the same bytes and idempotency key');
 dataset.data.storage.usedBytes=0;dataset.data.storage.remainingBytes=dataset.data.storage.capacityBytes;await family.locator('[data-fs-family-refresh]').click();await ready();
 await certificate(true);await family.locator('[data-fs-save]').click();await saved();assert.equal(schoolReceipts.size,2);
 await family.locator('[data-fs-history]').first().click();await page.waitForFunction(()=>document.querySelector('.fs-history-item')!==null);assert.equal(await family.locator('.fs-history-item').count(),2);
 const downloadPromise=page.waitForEvent('download');await family.locator('[data-fs-document]').first().click();const downloaded=await downloadPromise;const pdfFile=path.join(out,'certificate-synthetic.pdf');await downloaded.saveAs(pdfFile);assert.deepEqual(fs.readFileSync(pdfFile),syntheticSchoolPdf);
 checks.push('PDF correction preserves paper history and exact downloadable PDF bytes; neither entry approves salary');
 await family.locator('[data-fs-family-refresh]').click();await ready();
 await page.addStyleTag({content:'dialog:after{content:"QA · DATOS SINTÉTICOS";position:fixed;right:10px;bottom:10px;z-index:999999;background:#123649;color:white;padding:6px;font:11px sans-serif}'});
 for(const width of [1440,390,320])await capture(width);checks.push('actual native family card and actions fit 1440, 390 and 320 pixels');
 dataset.data.rows.push(nativeFamilyRow({other:true,certificate:null}));await openFamily(otherSubject.contractId);assert.match(await family.innerText(),/Otro hijo sintético/);assert.doesNotMatch(await family.innerText(),/Hijo nativo sintético/);
 assert.ok(requests.filter(r=>r.resource==='context').every(r=>r.contractId));checks.push('two native contracts sharing a legajo stay separated by UUID');
 await openChild('Segundo vínculo sintético');wrongReceipt=true;await family.locator('[data-fs-child-save]').click();await ready();wrongReceipt=false;
 assert.equal(await family.locator('[data-fs-child-field="familyName"]').isDisabled(),true);const beforeRecovery=familyPosts.length;
 await family.locator('[data-fs-child-recheck]').click();await saved();assert.equal(familyPosts.length,beforeRecovery);
 checks.push('a wrong-contract receipt stays uncertain until the exact scoped attempt is recovered, without another POST');
 await openFamily();wrongContext=true;await family.locator('[data-fs-family-refresh]').click();await ready();assert.equal(await family.locator('[data-fs-add-child]').isEnabled(),false);wrongContext=false;
 checks.push('context for the wrong contract cannot enable a family declaration');
 await family.locator('[data-fs-family-refresh]').click();await ready();wrongFamily=true;await family.locator('[data-fs-family-refresh]').click();await ready();assert.equal(await family.locator('.fs-child').count(),0);wrongFamily=false;
 checks.push('a family response carrying another contract clears consulted rows');
 canWrite=false;await family.locator('[data-fs-family-refresh]').click();await ready();assert.equal(await family.locator('[data-fs-add-child]').isEnabled(),false);assert.equal(await family.locator('[data-fs-register]:enabled').count(),0);canWrite=true;
 checks.push('read-only permission still allows consultation but no child or schooling registration');
 await page.goto(origin+'/reportes#certificados-escolares');const reportPanel=page.locator('#certificados-escolares');await reportPanel.locator('[data-fs-consult]').click();await page.waitForFunction(()=>document.querySelector('[data-fs-status]')?.textContent.includes('Reporte consultado'));
 const xlsxPromise=page.waitForEvent('download');await reportPanel.locator('[data-fs-export]').click();const xlsx=await xlsxPromise,xlsxFile=path.join(out,'schooling-native-synthetic.xlsx');await xlsx.saveAs(xlsxFile);
 const archive=unzipSync(fs.readFileSync(xlsxFile)),sheet=strFromU8(archive['xl/worksheets/sheet1.xml']);assert.match(sheet,/Alta propia de MuniControl/);assert.ok(sheet.includes(subject.registrationId));assert.ok(sheet.includes(otherSubject.registrationId));assert.match(sheet,/No corresponde: alta propia/);assert.doesNotMatch(sheet,/<f(?:>|\s)/);
 checks.push('freshly revalidated Excel contains both origins, native registration UUIDs and no invented GRH cutoff');
 const reportAccess=async allowed=>page.evaluate(value=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:value?['workforce.employee.read']:[]}})),allowed);
 const reportCleared=async()=>{assert.equal(await reportPanel.locator('tbody tr').count(),0);assert.equal(await reportPanel.locator('[data-fs-export]').isDisabled(),true);
  for(const name of ['source','storage','contracts','children','registered'])assert.equal(await reportPanel.locator('[data-fs-'+name+']').textContent(),'');};
 await reportAccess(false);await reportCleared();await reportAccess(true);await reportPanel.locator('[data-fs-consult]').click();
 await page.waitForFunction(()=>document.querySelector('[data-fs-status]')?.textContent.includes('Reporte consultado'));
 let releaseReport;delayedRead=new Promise(resolve=>releaseReport=resolve);const beforeRevokedExport=downloads.length;
 const pendingReport=page.waitForRequest(r=>r.url().includes('resource=report'));await reportPanel.locator('[data-fs-export]').click();await pendingReport;
 await reportAccess(false);releaseReport();await page.waitForTimeout(100);await reportCleared();assert.equal(downloads.length,beforeRevokedExport);
 checks.push('report revocation clears rows, counts and source; a late export refresh cannot restore data or download Excel');
 await reportAccess(true);await reportPanel.locator('[data-fs-consult]').click();await page.waitForFunction(()=>document.querySelector('[data-fs-status]')?.textContent.includes('Reporte consultado'));

 const beforeDownloads=downloads.length;dataset.data.rows.find(r=>r.contractId===subject.contractId).nativeRegisteredAt='2026-09-22T10:01:00Z';await reportPanel.locator('[data-fs-export]').click();
 await page.waitForFunction(()=>document.querySelector('[data-fs-status]')?.textContent.includes('Los datos cambiaron'));assert.equal(downloads.length,beforeDownloads);assert.equal(await reportPanel.locator('tbody tr').count(),0);
 checks.push('native provenance change invalidates stale export without downloading');
 await openFamily();await openChild('Borrador ante cambio de identidad');subject.identityToken='b'.repeat(64);const beforeIdentity=familyPosts.length;
 await family.locator('[data-fs-child-save]').click();await ready();await family.locator('[data-fs-child-recheck]').click();await ready();assert.equal(familyPosts.length,beforeIdentity+1);assert.equal(await family.locator('[data-fs-child-save]').isDisabled(),true);
 assert.equal(familyPosts.at(-1).body.contractIdentityToken,'c'.repeat(64));checks.push('identity change blocks the draft and never transfers it to a new subject or token');
 await family.locator('[data-fs-child-cancel]').click();
 await family.locator('[data-fs-family-refresh]').click();await ready();await openChild('Vínculo sintético con cambio de operador');dropChild=true;
 await family.locator('[data-fs-child-save]').click();await ready();const beforeActorChange=familyPosts.length;actor='checker@example.invalid';
 await family.locator('[data-fs-child-recheck]').click();await ready();assert.equal(familyPosts.length,beforeActorChange);assert.equal(await family.locator('.fs-editor').count(),0);assert.equal(await family.locator('.fs-child').count(),0);
 checks.push('a different authenticated actor clears an uncertain child attempt and cannot replay its POST');
 await openFamily();deny=true;await family.locator('[data-fs-family-refresh]').click();await ready();assert.equal(await family.locator('.fs-child').count(),0);assert.equal(await family.locator('[data-fs-add-child]').isEnabled(),false);deny=false;
 checks.push('revoked read authority clears child names and disables writes');
 await family.locator('[data-fs-family-refresh]').click();await ready();let finishRevoked;delayedRead=new Promise(resolve=>finishRevoked=resolve);
 const revokedRequest=page.waitForRequest(r=>r.url().includes('resource=family'));await family.locator('[data-fs-family-refresh]').click();await revokedRequest;
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));finishRevoked();await ready();
 assert.equal(await family.locator('.fs-child').count(),0);assert.equal(await family.locator('[data-fs-add-child]').isEnabled(),false);checks.push('capability revocation during a retained GET discards its late family response');
 await family.locator('[data-fs-family-refresh]').click();await ready();let release;delayedRead=new Promise(resolve=>release=resolve);
 const waiting=page.waitForRequest(r=>r.url().includes('resource=family'));await family.locator('[data-fs-family-refresh]').click();await waiting;
 await page.locator('#employeeDialog').getByRole('button',{name:/Cerrar ficha/}).click();release();await page.waitForTimeout(100);
 assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await family.locator('.fs-child').count(),0);checks.push('late family response cannot restore data into a closed employee dialog');
 assert.deepEqual(errors,[]);assert.deepEqual(routeFailures,[]);
 const result={ok:true,checksPassed:checks.length,checks,mode:published?'published_assets_with_synthetic_api':'local_build_with_synthetic_api',apiResponsesSynthetic:true,privateApisIntercepted:true,realApiCallsSent:0,municipalRowsWritten:0,syntheticCreatePosts:createPosts,syntheticFamilyPosts:familyPosts.length,syntheticSchoolPosts:schoolPosts.length,assets:Object.fromEntries(assetReceipts)};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){const diagnostic={checks,errors,routeFailures,syntheticFamilyPosts:familyPosts.length,syntheticSchoolPosts:schoolPosts.length,error:error.message,
 page:page?await page.evaluate(()=>({url:location.pathname,openDialogs:document.querySelectorAll('dialog[open]').length,familyStatus:document.querySelector('[data-family-schooling-ficha] .fs-status')?.textContent,childStatus:document.querySelector('[data-fs-child-status]')?.textContent,schoolStatus:document.querySelector('[data-fs-form-status]')?.textContent})).catch(()=>null):null};fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(diagnostic,null,2));console.error(JSON.stringify(diagnostic));throw error;
}finally{await browser.close();}
