// PRIVATE SOURCE CANDIDATE. Never imported, parsed or executed by its author.
// Native family self-service (195) on the SAME canonical190 host: real API handler,
// real model/client/panel from public/, real SQL facades over the custodied transport.
// No fixture, schema, IAM grant, seed or 195 installation happens here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createNativeFamilyRequestsHandler} from '../../api/internal-native-family-requests.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {FAMILY_REQUEST_VERSION,FAMILY_SELF_SUBMIT,FAMILY_REVIEW_WRITE,familyRequestCommand} from '../../assets/native-family-request-model.js';
import {syntheticSchoolPdf,syntheticSchoolHash} from '../../tests/fixtures/family-schooling-synthetic.js';
import {createCanonical190BrowserHost} from './own-payroll-canonical190-browser-host-qa.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';
import {NATIVE_FAMILY_195_STATEMENTS} from './native-family-195-rpc.mjs';
import '../../assets/app-routes.js';
import {friendlyPwaIdentityVersion,transformFriendlyShellSource} from './friendly-shell-page.mjs';
import {nativeFamily195FamilyRowsSnapshot} from './native-family195-same190-actors.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const API='/api/internal-native-family-requests',PAGE='/acciones';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,UUID_V4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,SHA256=/^[a-f0-9]{64}$/;
const sorted=v=>[...v].sort(),exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
// Exact statements emitted by lib/internal-native-family-requests.js:34-45.
const RPC=Object.fromEntries(['self','review'].flatMap(view=>[
 [view+'Bootstrap','SELECT public.native_family_'+view+'_bootstrap_v1($1::jsonb,$2::text,$3::jsonb) AS result'],
 [view+'Detail','SELECT public.native_family_'+view+'_detail_v1($1::jsonb,$2::uuid) AS result'],
 [view+'Attempt','SELECT public.native_family_'+view+'_attempt_v1($1::jsonb,$2::uuid) AS result'],
 [view+'Command','SELECT public.native_family_'+view+'_command_v1($1::jsonb,$2::jsonb,$3::uuid,$4::jsonb) AS result'],
 [view+'Document','SELECT public.native_family_'+view+'_document_v1($1::jsonb,$2::uuid,$3::integer) AS result']]));
const MUTATING=/^SELECT public\.native_family_(?:self|review)_command_v1\(/;
const LEAVE=/^leave\.request\./,FORBIDDEN_EMPLOYEE=Object.freeze(['workforce.employee.read','employee.record.propose','employee.record.approve']),FORBIDDEN_REVIEWER=Object.freeze(['employee.record.approve','employee.family.self.read','employee.family.self.submit']);
const ACTOR_NAMES=Object.freeze(['employee','reviewer','selfreviewer','unlinked']);
const SELFREVIEWER_CAPS=Object.freeze([...FAMILY_SELF_SUBMIT,...FAMILY_REVIEW_WRITE.filter(c=>c!=='actions.read')]);
// The closed family list: eight prerequisite tables (057/064/091) + three of 195 (actors §8).
export const FAMILY_TABLES=Object.freeze(['school_certificate_blob','school_certificate','school_certificate_event','school_certificate_storage_policy','employee_family_member','employee_family_member_event','school_certificate_record','school_certificate_record_event','native_family_storage_policy','native_family_request','native_family_request_event']);
export const FAMILY_SNAPSHOT_KEYS=Object.freeze([...FAMILY_TABLES,'storage_policy_generation','storage_policy_pdf_quota_bytes','storage_policy_cluster_limit_bytes','storage_policy_cluster_reserve_bytes']);
// Confirmed rows the whole scenario adds (actors §9 = plan §6 with the four mandatory actors).
const EXPECTED_TOTAL=Object.freeze({native_family_request:5,native_family_request_event:9,employee_family_member:1,employee_family_member_event:1,school_certificate_blob:1,school_certificate_record:1,school_certificate_record_event:1,storage_policy_generation:2});
const EXPECTED_ATTEMPTS=16; // 9 confirmed events + 1 replay POST + 6 SQL rejections = C1 D1 E3 F2 G1 H5 S2 U1
// Same relation subquery form as the root-pinned builder (:259); never a to_regclass list,
// because one NULL would turn "NOT IN" into "exclude everything".
const FAMILY_RELATIONS="(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN("+FAMILY_TABLES.map(t=>"'"+t+"'").join(',')+"))";
const once=(s,from,to,code)=>{assert.equal(s.split(from).length,2,code+':'+from.slice(0,60));return s.replace(from,()=>to);};

// D3 (CROSS) + F2 (CROSS independent review): the whole QA state except the eleven family
// tables, every statement relocated with the foundation normalizer BEFORE h.json, which
// does not relocate by itself. The GUC is LOCAL (set_config(...,true)) and is read inside
// the same transaction, exactly like ownFullCapacity190Snapshot (190-installation:17-18).
export function nativeFamily195NonFamilySnapshot(h){
 assert.equal(typeof h?.qa?.normalized,'function','FAMILY195_BROWSER_NORMALIZER_REQUIRED');
 let sql=preservationSnapshot('after');const hook="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(sql.split(hook).length-1,2,'FAMILY195_SNAPSHOT_HOOKS');sql=sql.replaceAll(hook,'p.oid NOT IN'+FAMILY_RELATIONS);
 sql=once(sql,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'true','FAMILY195_SNAPSHOT_FUNCTION_HOOK').replaceAll('municontrol_sql111.','municontrol_family195_browser.');
 assert.ok(!sql.includes('native_leave')&&!sql.includes('municontrol_sql111.'));
 const fingerprint="SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_family195_browser.after')::jsonb::text,'sha256'),'hex'),'tables',jsonb_array_length(current_setting('municontrol_family195_browser.after')::jsonb->'tables'),'excluded',(SELECT count(*) FROM pg_class WHERE oid IN"+FAMILY_RELATIONS+"))";
 return h.json([sql,fingerprint].map(statement=>h.qa.normalized(statement)),{readOnly:true});
}
// D4 (CROSS): fifteen numeric keys — eleven row counts, generation and the three quotas of
// school_certificate_storage_policy (so `to_jsonb(policy)-'generation'` is proven unchanged
// by zero deltas). Run by the custodian that OWNS the tables: four of them have RLS enabled
// without policies (builder :372,382-384), any other role would count 0. readOnly is
// correct here: no facade, no FOR SHARE.
const FAMILY_SNAPSHOT_SQL="SELECT jsonb_build_object("+FAMILY_TABLES.map(t=>"'"+t+"',(SELECT count(*) FROM public."+t+")").join(',')+
 ",'storage_policy_generation',(SELECT generation FROM public.school_certificate_storage_policy WHERE singleton)"+
 ",'storage_policy_pdf_quota_bytes',(SELECT pdf_quota_bytes FROM public.school_certificate_storage_policy WHERE singleton)"+
 ",'storage_policy_cluster_limit_bytes',(SELECT cluster_limit_bytes FROM public.school_certificate_storage_policy WHERE singleton)"+
 ",'storage_policy_cluster_reserve_bytes',(SELECT cluster_reserve_bytes FROM public.school_certificate_storage_policy WHERE singleton))";
export function nativeFamily195FamilySnapshot(h){
 assert.equal(typeof h?.qa?.normalized,'function','FAMILY195_BROWSER_NORMALIZER_REQUIRED');
 return h.json([h.qa.normalized(FAMILY_SNAPSHOT_SQL)],{readOnly:true});
}

const ctxOf=actor=>JSON.stringify(employeeContext(actor.principal,actor.session));
const childBody=({subjectVersion,familyName,reason,birthDate='2015-06-05'})=>familyRequestCommand({version:FAMILY_REQUEST_VERSION,command:'submit',requestId:null,expectedVersion:0,subjectVersion,payload:{kind:'child',definition:{familyName,birthDate,dni:null,validFrom:null,validTo:null},document:null},reason,reviewConfirmed:true});
const reviewBody=({command,requestId,expectedVersion,reason})=>familyRequestCommand({version:FAMILY_REQUEST_VERSION,command,requestId,expectedVersion,subjectVersion:null,payload:null,reason,reviewConfirmed:true});
// Direct (non-panel) requests. host.request forwards `options` to browserContext.request.fetch
// (host-qa:121), whose body option is `data` (playwright-core types: data?: string|Buffer|
// Serializable); a string is sent byte for byte, so Content-Type must be set explicitly
// (api:21). The key is generated by the caller so the same literal goes to db.expectQueryError
// as values[2] (lib:42). Sec-Fetch-Site mirrors a same-origin browser fetch; the handler's
// assertOrigin accepts it (api/internal-family-certificates.js:30-39 per the independent review).
const post=(session,relative,{key,membership,data})=>{
 assert.equal(typeof data,'string','FAMILY195_BROWSER_POST_DATA_STRING');assert.match(key,UUID_V4,'FAMILY195_BROWSER_POST_KEY');assert.match(membership,UUID,'FAMILY195_BROWSER_POST_MEMBERSHIP');
 return session.request(relative,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Native-Family-Membership':membership,'Sec-Fetch-Site':'same-origin'},data});
};
// Family snapshot = fifteen numbers; diff drops zero deltas so deepEqual proves them zero.
function diff(before,after){const out={};for(const key of Object.keys(after)){const d=after[key]-before[key];if(d!==0)out[key]=d;}return out;}

function assertActor(actor,name){
 exact(actor,['principal','session','raw','roleKey']);assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);
 assert.equal(actor.session.id,actor.raw.actorSessionId);assert.equal(actor.principal.tenant.membershipId,actor.raw.membershipId);assert.equal(actor.principal.user.email,actor.raw.actorEmail);
 assert.equal(actor.principal.tenant.source,'membership','FAMILY195_BROWSER_MEMBERSHIP_SOURCE:'+name);
 // api:24 and 195:116 read exactly these six DTO keys; nothing else may travel (actors §3/§6.2).
 const dto=employeeContext(actor.principal,actor.session);exact(dto,['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']);
 assert.deepEqual(dto,actor.raw,'FAMILY195_BROWSER_DTO_EQUALS_RAW:'+name);
 assert.equal(actor.session.releaseSha,actor.raw.releaseSha);assert.equal(actor.principal.tenant.certifiedReleaseSha,actor.raw.releaseSha,'FAMILY195_BROWSER_CERTIFIED_RELEASE:'+name);assert.equal(actor.principal.tenant.dataPlaneReady,true);
 // Closed spec of actors §2; the real membership readback is the fixture's proof (actors R2).
 assert.equal(actor.roleKey,'QA_FAMILY195_'+name.toUpperCase(),'FAMILY195_BROWSER_ROLE_KEY:'+name);
 assert.ok(Number.isFinite(Date.parse(actor.principal.session.expiresAt)),'FAMILY195_BROWSER_SESSION_EXPIRY:'+name);
}
function assertCapabilities(actor,required,forbidden,name){
 const caps=actor.principal.tenant.effectiveCapabilities;
 assert.deepEqual(sorted(caps),sorted(required),'FAMILY195_BROWSER_CAPS_EXACT:'+name);
 for(const cap of forbidden)assert.ok(!caps.includes(cap),'FAMILY195_BROWSER_CAPS_FORBIDDEN:'+name+':'+cap);
 assert.ok(!caps.some(cap=>LEAVE.test(cap)),'FAMILY195_BROWSER_DEDICATED_MODE_REQUIRES_NO_LEAVE_CAPS:'+name);
}

// The host element itself carries the panel class (panel.js:15) and is re-filled by render()
// (panel.js:58) or clearVisible() (panel.js:21); everything is scoped to that host.
function panel(page,hostId){
 const host=page.locator('#'+hostId+'.native-family-panel');
 const action=key=>host.locator('[data-family-action="'+key+'"]'),field=key=>host.locator('[data-family-field="'+key+'"]');
 const status=()=>host.locator('[role="status"]').first().innerText(),text=()=>host.innerText();
 // Operation finished (F1 of the independent review): refresh must be present; either it is
 // enabled, or (legitimate pending attempt, panel.js:55) recover exists and is enabled; and no
 // control other than refresh is disabled. The first render (busy, model=null, panel.js:27,55-58)
 // shows one disabled refresh and nothing else, so it is rejected until the bootstrap lands.
 const idle=()=>page.waitForFunction(id=>{
  const h=document.getElementById(id);
  if(!h||!h.classList.contains('native-family-panel'))return false;
  const controls=[...h.querySelectorAll('button,input,select,textarea')];
  const refresh=h.querySelector('button[data-family-action="refresh"]');
  const recover=h.querySelector('button[data-family-action="recover"]');
  return controls.length>0&&!!refresh
   &&(!refresh.disabled||!!recover&&!recover.disabled)
   &&controls.every(c=>!c.disabled||c===refresh);
 },hostId,{timeout:45000});
 const statusMatches=re=>page.waitForFunction(([id,source])=>{const h=document.getElementById(id);return !!h&&new RegExp(source).test(h.querySelector('[role="status"]')?.textContent??'');},[hostId,re.source],{timeout:45000});
 const textMatches=re=>page.waitForFunction(([id,source])=>{const h=document.getElementById(id);return !!h&&new RegExp(source).test(h.textContent??'');},[hostId,re.source],{timeout:45000});
 const mounted=()=>page.evaluate(id=>{const h=document.getElementById(id);return !!h&&!h.hidden&&h.classList.contains('native-family-panel')&&h.childElementCount>0;},hostId);
 const unmounted=()=>page.evaluate(id=>{const h=document.getElementById(id);return !!h&&h.hidden&&!h.classList.contains('native-family-panel')&&h.childElementCount===0;},hostId);
 return {host,action,field,status,text,idle,statusMatches,textMatches,mounted,unmounted};
}
// Dedicated Action Center: centro-acciones.html:2931 sets the dataset flag, :2935 hides the gate.
const dedicated=page=>page.evaluate(()=>document.querySelector('#appShell[data-native-self-only="true"]')!==null&&document.getElementById('authGate')?.hidden===true);

export async function verifyNativeFamily195On190(context,fixture){
 exact(context,['h','db','qa','readSnapshot','synthetic']);
 exact(fixture,['actors','nativeIdentityContracts','readFamilySnapshot','synthetic','pdfPages']);
 const {h,db,qa,readSnapshot}=context;assert.strictEqual(h.qa,qa);assert.equal(typeof qa.normalized,'function','FAMILY195_BROWSER_NORMALIZER_REQUIRED');
 assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(context.synthetic,true);
 assert.equal(typeof readSnapshot,'function');assert.equal(typeof fixture.readFamilySnapshot,'function');
 assert.equal(typeof db.query,'function');assert.equal(typeof db.expectQueryError,'function','FAMILY195_BROWSER_EXACT_EMISSION_REQUIRED');
 const familyRows=()=>nativeFamily195FamilyRowsSnapshot(h);
 const expectWholeRowsUnchanged=async(spec,work)=>{
  const before=familyRows();
  // Read after only a fully validated expected-error scope has returned.
  // An unexpected/uncertain native outcome throws before another SQL call.
  await db.expectQueryError(spec,work);
  assert.deepEqual(familyRows(),before,'FAMILY195_NEGATIVE_WHOLE_ROWS:'+spec.caseId);
 };

 // actors §1/§3: nativeIdentityContracts{employee:contracts[7],selfreviewer:contracts[8]}. The browser
 // only carries them: no facade exposes contractId (the self subject is {legajo,employeeName,subjectVersion}, 195:185).
 exact(fixture.nativeIdentityContracts,['employee','selfreviewer']);for(const c of Object.values(fixture.nativeIdentityContracts))assert.match(c,UUID);
 assert.notEqual(fixture.nativeIdentityContracts.employee,fixture.nativeIdentityContracts.selfreviewer,'FAMILY195_BROWSER_TWO_NATIVE_CONTRACTS');
 assert.ok(Number.isInteger(fixture.pdfPages)&&fixture.pdfPages>=1&&fixture.pdfPages<=30,'FAMILY195_BROWSER_PDF_PAGES_FROM_REAL_VALIDATOR');
 const names=Object.keys(fixture.actors);assert.deepEqual(sorted(names),[...ACTOR_NAMES],'FAMILY195_BROWSER_FOUR_ACTORS');
 for(const name of names)assertActor(fixture.actors[name],name);
 const {employee,reviewer,unlinked,selfreviewer}=fixture.actors;
 assertCapabilities(employee,FAMILY_SELF_SUBMIT,FORBIDDEN_EMPLOYEE,'employee');assertCapabilities(reviewer,FAMILY_REVIEW_WRITE,FORBIDDEN_REVIEWER,'reviewer');
 assertCapabilities(unlinked,FAMILY_SELF_SUBMIT,FORBIDDEN_EMPLOYEE,'unlinked');assertCapabilities(selfreviewer,SELFREVIEWER_CAPS,['employee.record.approve'],'selfreviewer');
 for(const field of ['membershipId','actorEmail','actorSessionId'])assert.equal(new Set(names.map(n=>fixture.actors[n].raw[field])).size,4,'FAMILY195_BROWSER_DISTINCT_'+field);
 // actors §5: tenant_identity_session.expires_at = commit + 1 hour; the run must start and END inside it.
 const sessionDeadline=Math.min(...names.map(n=>Date.parse(fixture.actors[n].principal.session.expiresAt)));assert.ok(Number.isFinite(sessionDeadline)&&sessionDeadline>Date.now(),'FAMILY195_BROWSER_SESSION_WINDOW');
 exact(fixture.synthetic,['childName','institution','reason','decisionReason','correctionReason','presentedOn']);
 const s=fixture.synthetic;for(const key of Object.keys(s))assert.ok(typeof s[key]==='string'&&(/sintétic/i.test(s[key])||key==='presentedOn'),'FAMILY195_BROWSER_SYNTHETIC_LABEL:'+key);
 // Built product parity for every family module the page will load (209:88-94 pattern).
 const sourceBookend=[];
 for(const relative of ['assets/native-family-request-model.js','assets/native-family-request-client.js','assets/native-family-request-panel.js','assets/native-family-request.css','assets/native-salary-catalog-model.js','assets/app-routes.js']){
  const source=fs.readFileSync(path.join(root,relative));assert.deepEqual(fs.readFileSync(path.join(root,'public',relative)),source,'FAMILY195_BUILT_SOURCE_MISMATCH:'+relative);sourceBookend.push({path:relative,sha256:createHash('sha256').update(source).digest('hex')});
 }
 const pageSource=fs.readFileSync(path.join(root,'centro-acciones.html'));
 const identityVersion=friendlyPwaIdentityVersion(file=>fs.readFileSync(path.join(root,file)));
 const expectedPage=Buffer.from(transformFriendlyShellSource(pageSource.toString('utf8'),'centro-acciones.html',identityVersion,globalThis.MuniControlRoutes),'utf8');
 const assertDerivedPage=()=>{
  assert.deepEqual(fs.readFileSync(path.join(root,'centro-acciones.html')),pageSource,'FAMILY195_PAGE_SOURCE_BOOKEND');
  assert.equal(friendlyPwaIdentityVersion(file=>fs.readFileSync(path.join(root,file))),identityVersion,'FAMILY195_PAGE_IDENTITY_BOOKEND');
  assert.deepEqual(fs.readFileSync(path.join(root,'public','centro-acciones.html')),expectedPage,'FAMILY195_BUILT_PAGE_DERIVATION');
 };
 assertDerivedPage();sourceBookend.push({path:'centro-acciones.html',sha256:createHash('sha256').update(pageSource).digest('hex'),builtSha256:createHash('sha256').update(expectedPage).digest('hex'),derived:true});
 // The finite bridge admits exactly the ten texts the handler emits.
 for(const text of Object.values(RPC))assert.ok(NATIVE_FAMILY_195_STATEMENTS.has(text),'FAMILY195_BROWSER_BRIDGE_TEXT:'+text);assert.equal(NATIVE_FAMILY_195_STATEMENTS.size,Object.keys(RPC).length);
 // Baselines (actors §7B, baseline B: after the IAM fixture). The non-family snapshot proves the
 // relocation at run time: eleven relations resolved in the QA schema.
 const baseline=readSnapshot();exact(baseline,['fingerprint','tables','excluded']);assert.equal(baseline.excluded,11,'FAMILY195_BROWSER_ELEVEN_TABLES_EXCLUDED');
 assert.ok(Number.isSafeInteger(baseline.tables)&&baseline.tables>0&&SHA256.test(baseline.fingerprint),'FAMILY195_BROWSER_NON_FAMILY_BASELINE');
 const familyBaseline=await fixture.readFamilySnapshot();exact(familyBaseline,FAMILY_SNAPSHOT_KEYS);assert.ok(Object.values(familyBaseline).every(Number.isSafeInteger),'FAMILY195_BROWSER_FAMILY_SNAPSHOT_NUMERIC');
 assert.equal(familyBaseline.storage_policy_generation,0);assert.equal(familyBaseline.school_certificate_storage_policy,1);assert.equal(familyBaseline.native_family_storage_policy,1);
 // Scenario preconditions (actors §9) hold because the builder created the eight tables with rows:0
 // and 195 created its three; they are asserted, never produced by clearing anything.
 for(const table of ['school_certificate_blob','employee_family_member','native_family_request','native_family_request_event'])assert.equal(familyBaseline[table],0,'FAMILY195_BROWSER_EMPTY_FAMILY_BASELINE:'+table);
 const checks=[],rpc=[];let lostAckOnce=false,mutations=0,narrowed=null,presentedUserId=null;
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 // The real handler over the custodied db. Every emitted statement is logged with its exact
 // values (synthetic data only) so the replay in D is proven as "same text, same values". The
 // one-shot lost acknowledgement lets the SQL command commit and drops only the HTTP answer
 // (lib:46 then api:42 → 503). `mutations` counts every *_command_v1 ATTEMPT, rejected ones too.
 const instrumented={query:async(text,values)=>{rpc.push({text,values:[...values]});if(MUTATING.test(text))mutations++;const rows=await db.query(text,values);if(lostAckOnce&&MUTATING.test(text)){lostAckOnce=false;throw Error('QA_LOST_ACKNOWLEDGEMENT');}return rows;}};
 const commandsEmitted=()=>rpc.filter(r=>MUTATING.test(r.text));
 const actors=new Map(Object.entries(fixture.actors));
 const host=await createCanonical190BrowserHost({h,actors,getSql:async()=>instrumented,outputName:'native-family-195-browser',pages:{[PAGE]:'centro-acciones.html'},
  handlers:deps=>new Map([[API,createNativeFamilyRequestsHandler(deps)]]),
  identity:(name,actor)=>({...(narrowed&&name===narrowed.name?{caps:actor.principal.tenant.effectiveCapabilities.filter(c=>!narrowed.drop.includes(c))}:{}),...(presentedUserId&&name==='employee'?{userId:presentedUserId}:{})})});
 const output=host.output;let failure,result;
 // Mobile measurement of the state currently on screen (both views reuse it). The 44px floor and
 // the ≤640px single column are the product's own rules (native-family-request.css).
 const mobile=async(P,page,state)=>{
  for(const width of [390,320]){
   await page.setViewportSize({width,height:1100});await P.host.scrollIntoViewIfNeeded();
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no whole-page overflow at '+width+' in '+state);
   check(await P.host.evaluate(h=>[...h.querySelectorAll('button:not([hidden])')].every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>=44&&r.left>=0&&r.right<=innerWidth+1;})),'every family action is visible, >=44px and inside the viewport at '+width+' in '+state);
   check(await P.host.evaluate(h=>[...h.querySelectorAll('input,select,textarea')].every(c=>c.getBoundingClientRect().right<=innerWidth+1)),'every field fits at '+width+' in '+state);
   await page.screenshot({path:path.join(output,state+'-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1366,height:1100});
 };
 try{
  const pagePosts=[];const watchPosts=(session,name)=>session.page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname===API)pagePosts.push({actor:name,request:r});});
  // A. Unauthenticated: the real route goes to the login destination; no family SQL.
  {const anonymous=await host.open(null);await anonymous.page.goto(host.origin+PAGE);await anonymous.page.waitForFunction(()=>location.pathname==='/acceso',{},{timeout:15000});check(rpc.length===0,'anonymous open of /acciones reaches login and emits no SQL');await anonymous.close();}
  // B. Employee: dedicated Action Center, own subject, no families yet, no requests.
  const emp=await host.open('employee'),E=panel(emp.page,'nativeFamilySelfPanel');watchPosts(emp,'employee');
  await emp.page.goto(host.origin+PAGE);await E.textMatches(/Legajo /);
  check(await E.mounted()&&await panel(emp.page,'nativeFamilyReviewPanel').unmounted()&&await dedicated(emp.page),'employee gets the dedicated self panel only (host carries the class, review host stays hidden and empty)');
  check(rpc.filter(r=>r.text===RPC.selfBootstrap).length>=1&&!rpc.some(r=>r.text.includes('_review_')),'self bootstrap is the only facade family read');
  check(!/Historial/.test(await E.text()),'no request yet');
  // C. Submit child through the real form (mobile measured on the open form first).
  await E.action('new').click();await E.field('familyName').waitFor();await E.field('familyName').fill(s.childName);await E.field('birthDate').fill('2015-06-05');await E.field('reason').fill(s.reason);
  await mobile(E,emp.page,'employee-child-form');
  await E.field('confirmed').check();
  const firstCommand=emp.page.waitForResponse(r=>new URL(r.url()).pathname===API&&r.request().method()==='POST');await E.action('submit').click();
  const submitted=await firstCommand;assert.equal(submitted.status(),201);const receipt1=(await submitted.json()).data;assert.equal(receipt1.state,'submitted');assert.equal(receipt1.requestVersion,1);assert.equal(receipt1.requestKind,'child');assert.equal(receipt1.payrollModified,false);assert.equal(receipt1.benefitGranted,false);assert.equal(receipt1.replayed,false);
  await E.statusMatches(/registrada para revisión de Personal/);
  let family=await fixture.readFamilySnapshot();assert.deepEqual(diff(familyBaseline,family),{native_family_request:1,native_family_request_event:1},'FAMILY195_DELTA_SUBMIT');
  // D. Replay POST: the SAME key and the SAME bytes the client really sent (captured from its
  //    request), re-posted through the real handler → 195:335-339 answers the prior receipt.
  assert.equal(pagePosts.length,1);const firstPost=pagePosts[0].request,firstHeaders=await firstPost.allHeaders(),firstBody=firstPost.postData();
  assert.equal(typeof firstBody,'string');assert.equal(firstHeaders['idempotency-key'],receipt1.key);assert.equal(firstHeaders['x-native-family-membership'],employee.raw.membershipId);
  const firstEmission=commandsEmitted().at(-1);assert.equal(firstEmission.text,RPC.selfCommand);assert.equal(firstEmission.values[0],ctxOf(employee));assert.equal(firstEmission.values[2],receipt1.key);assert.equal(firstEmission.values[3],'null');
  // lib:27 and lib:39 canonicalize the parsed body with the real model; the emitted jsonb text must be exactly that.
  assert.equal(firstEmission.values[1],JSON.stringify(familyRequestCommand(JSON.parse(firstBody))),'FAMILY195_BROWSER_CAPTURED_BODY_MATCHES_EMISSION');
  const replayRows=familyRows();
 const replay=await post(emp,API+'?view=self',{key:receipt1.key,membership:employee.raw.membershipId,data:firstBody});
  assert.deepEqual(familyRows(),replayRows,'FAMILY195_POST_REPLAY_WHOLE_ROWS');
 assert.equal(replay.response.status(),200);assert.equal(replay.response.headers()['idempotency-replayed'],'true');
  assert.deepEqual(replay.body.data,{...receipt1,replayed:true},'FAMILY195_BROWSER_REPLAY_RECEIPT');
  const replayEmission=commandsEmitted().at(-1);assert.notStrictEqual(replayEmission,firstEmission);assert.equal(replayEmission.text,RPC.selfCommand);assert.deepEqual(replayEmission.values,firstEmission.values,'FAMILY195_BROWSER_REPLAY_SAME_VALUES');
  family=await fixture.readFamilySnapshot();assert.deepEqual(diff(familyBaseline,family),{native_family_request:1,native_family_request_event:1},'FAMILY195_DELTA_REPLAY_ZERO');
  assert.equal(mutations,2,'FAMILY195_BROWSER_COMMANDS_AFTER_REPLAY');
  // E. Reviewer: queue, detail, correction request → employee resubmits → accept.
  const rev=await host.open('reviewer'),R=panel(rev.page,'nativeFamilyReviewPanel');watchPosts(rev,'reviewer');await rev.page.goto(host.origin+PAGE);await R.idle();
  check(await R.mounted()&&await panel(rev.page,'nativeFamilySelfPanel').unmounted()&&await dedicated(rev.page),'reviewer gets the review panel only');
  await R.action('open-'+receipt1.requestId).click();await R.textMatches(/Historial completo/);
  await R.field('decisionReason').fill(s.correctionReason);await mobile(R,rev.page,'reviewer-decision-detail');await R.field('decisionConfirmed').check();
  await R.action('request-correction').click();await R.statusMatches(/decisión administrativa quedó registrada/);
  await E.action('refresh').click();await E.idle();await E.action('open-'+receipt1.requestId).click();await E.textMatches(/Historial completo/);await E.action('resubmit').click();await E.field('familyName').waitFor();
  await E.field('familyName').fill(s.childName);await E.field('reason').fill(s.reason+' (corrección sintética)');await E.field('confirmed').check();await E.action('submit').click();await E.statusMatches(/registrada para revisión/);
  await R.action('refresh').click();await R.idle();await R.action('open-'+receipt1.requestId).click();await R.textMatches(/Historial completo/);
  await R.field('decisionReason').fill(s.decisionReason);await R.field('decisionConfirmed').check();await R.action('accept').click();await R.statusMatches(/No modifica haberes/);
  family=await fixture.readFamilySnapshot();assert.deepEqual(diff(familyBaseline,family),{native_family_request:1,native_family_request_event:4,employee_family_member:1,employee_family_member_event:1},'FAMILY195_DELTA_ACCEPT_CHILD');
  // F. Schooling with the synthetic PDF for the accepted child, then acceptance.
  await E.action('refresh').click();await E.idle();await E.action('new').click();await E.field('kind').waitFor();await E.field('kind').selectOption('schooling');await E.field('familyId').waitFor();
  const options=await E.field('familyId').locator('option').evaluateAll(n=>n.map(o=>o.value).filter(Boolean));assert.equal(options.length,1,'FAMILY195_BROWSER_ONE_OWN_FAMILY');
  await E.field('familyId').selectOption(options[0]);await E.field('institution').fill(s.institution);await E.field('presentedOn').fill(s.presentedOn);
  await E.field('document').setInputFiles({name:'certificado-sintetico.pdf',mimeType:'application/pdf',buffer:Buffer.from(syntheticSchoolPdf)});await E.textMatches(/Archivo elegido: certificado-sintetico\.pdf/);
  await E.field('reason').fill(s.reason);await mobile(E,emp.page,'employee-schooling-form-with-file');await E.field('confirmed').check();
  const schoolPost=emp.page.waitForResponse(r=>new URL(r.url()).pathname===API&&r.request().method()==='POST');await E.action('submit').click();const schoolResponse=await schoolPost;assert.equal(schoolResponse.status(),201);const receipt2=(await schoolResponse.json()).data;assert.equal(receipt2.requestKind,'schooling');await E.statusMatches(/registrada para revisión/);
  const schoolDocument=JSON.parse(commandsEmitted().at(-1).values[3]);assert.equal(schoolDocument.pages,fixture.pdfPages,'FAMILY195_BROWSER_REAL_VALIDATOR_PAGES');assert.equal(schoolDocument.sha256,syntheticSchoolHash);assert.equal(schoolDocument.byteLength,syntheticSchoolPdf.length);assert.equal(schoolDocument.filename,'certificado-sintetico.pdf');
  family=await fixture.readFamilySnapshot();assert.deepEqual(diff(familyBaseline,family),{native_family_request:2,native_family_request_event:5,employee_family_member:1,employee_family_member_event:1,school_certificate_blob:1,storage_policy_generation:1},'FAMILY195_DELTA_SUBMIT_SCHOOLING');
  await R.action('refresh').click();await R.idle();await R.action('open-'+receipt2.requestId).click();await R.textMatches(/Historial completo/);
  const downloadRows=familyRows();
 const downloaded=rev.page.waitForEvent('download');await R.action('document-1').click();const file=await downloaded;await R.statusMatches(/Se descargó el PDF de la versión 1/);
  assert.deepEqual(familyRows(),downloadRows,'FAMILY195_PDF_DOWNLOAD_WHOLE_ROWS');
 const bytes=fs.readFileSync(await file.path());assert.ok(Buffer.from(syntheticSchoolPdf).equals(bytes),'FAMILY195_BROWSER_PDF_BYTES');assert.equal(file.suggestedFilename(),'solicitud-familiar-'+receipt2.requestId+'-v1.pdf');
  await R.field('decisionReason').fill(s.decisionReason);await mobile(R,rev.page,'reviewer-document-detail');await R.field('decisionConfirmed').check();await R.action('accept').click();await R.statusMatches(/No modifica haberes/);
  family=await fixture.readFamilySnapshot();assert.deepEqual(diff(familyBaseline,family),{native_family_request:2,native_family_request_event:6,employee_family_member:1,employee_family_member_event:1,school_certificate_blob:1,school_certificate_record:1,school_certificate_record_event:1,storage_policy_generation:2},'FAMILY195_DELTA_ACCEPT_SCHOOLING');
  // G. Lost acknowledgement: the command commits, the answer is dropped, the pending block
  //    (with `refresh` legitimately disabled) stays until the GET attempt recovers the receipt.
  await E.action('refresh').click();await E.idle();await E.action('new').click();await E.field('familyName').waitFor();await E.field('familyName').fill(s.childName+' segunda');await E.field('reason').fill(s.reason);await E.field('confirmed').check();
  const commandsBeforeLostAck=mutations;lostAckOnce=true;await E.action('submit').click();
  await E.textMatches(/Conservamos el envío original/);await E.action('recover').waitFor({state:'visible'});
  check(await E.action('refresh').isDisabled()&&await E.action('recover').isEnabled()&&(await E.action('new').count())===0,'pending block keeps refresh disabled, recover enabled and no new form');
  assert.equal(mutations,commandsBeforeLostAck+1,'FAMILY195_BROWSER_LOST_ACK_COMMAND_COMMITTED');
  await mobile(E,emp.page,'employee-pending-recovery');
  const recoveryRows=familyRows();
 const attemptRead=emp.page.waitForResponse(r=>new URL(r.url()).searchParams.get('resource')==='attempt');await E.action('recover').click();const recovered=await attemptRead;assert.equal(recovered.status(),200);assert.equal(recovered.headers()['idempotency-replayed'],'true');
  const receipt3=(await recovered.json()).data;assert.equal(receipt3.replayed,true);assert.equal(receipt3.requestKind,'child');assert.equal(receipt3.state,'submitted');
  await E.statusMatches(/Se recuperó el comprobante del envío original/);check((await E.action('recover').count())===0&&await E.action('refresh').isEnabled(),'pending block disappears after recover');
  assert.deepEqual(familyRows(),recoveryRows,'FAMILY195_GET_ATTEMPT_WHOLE_ROWS');
 check(mutations===commandsBeforeLostAck+1,'recover found the committed receipt without a second command (GET attempt is not a command)');
  family=await fixture.readFamilySnapshot();assert.deepEqual(diff(familyBaseline,family),{native_family_request:3,native_family_request_event:7,employee_family_member:1,employee_family_member_event:1,school_certificate_blob:1,school_certificate_record:1,school_certificate_record_event:1,storage_policy_generation:2},'FAMILY195_DELTA_LOST_ACK_ONE_ROW');
  // H. Exact SQL negatives through the real handler (direct requests, same cookies). Each
  //    expectation names the SQL token; the HTTP code follows the real lib mapping (lib:7-24).
  const empCtx=ctxOf(employee),revCtx=ctxOf(reviewer),bootstrap=(await emp.request(API+'?view=self&resource=bootstrap')).body.data,subjectVersion=bootstrap.subject.subjectVersion;
  assert.equal(bootstrap.state,'native');assert.equal(bootstrap.canSubmit,true);
  const staleAccept=reviewBody({command:'accept',requestId:receipt1.requestId,expectedVersion:1,reason:s.decisionReason}),staleAcceptKey=randomUUID();
  await expectWholeRowsUnchanged({caseId:'195-browser-stale-version',nativeCode:'NATIVE_FAMILY_STATE_CHANGED',text:RPC.reviewCommand,values:[revCtx,JSON.stringify(staleAccept),staleAcceptKey,'null']},async()=>{const r=await post(rev,API+'?view=review',{key:staleAcceptKey,membership:reviewer.raw.membershipId,data:JSON.stringify(staleAccept)});assert.equal(r.response.status(),409);assert.equal(r.body.code,'NATIVE_FAMILY_STATE_CHANGED');});
  const foreignId=receipt1.requestId.replace(/^.{8}/,'00000000'); // unknown id in the own view (195:252-253); the request of ANOTHER employee is covered below with selfreviewer
  await expectWholeRowsUnchanged({caseId:'195-browser-foreign-detail',nativeCode:'NATIVE_FAMILY_NOT_FOUND',text:RPC.selfDetail,values:[empCtx,foreignId]},async()=>{const r=await emp.request(API+'?view=self&resource=detail&id='+foreignId);assert.equal(r.response.status(),404);assert.equal(r.body.code,'NATIVE_FAMILY_NOT_FOUND');});
  await expectWholeRowsUnchanged({caseId:'195-browser-foreign-attempt',nativeCode:'NATIVE_FAMILY_NOT_FOUND',text:RPC.reviewAttempt,values:[revCtx,receipt1.key]},async()=>{const r=await rev.request(API+'?view=review&resource=attempt&key='+receipt1.key,{headers:{'X-Native-Family-Membership':reviewer.raw.membershipId}});assert.equal(r.response.status(),404);assert.equal(r.body.code,'NATIVE_FAMILY_NOT_FOUND');});
  const reuse=childBody({subjectVersion,familyName:s.childName+' tercera',reason:s.reason});
  await expectWholeRowsUnchanged({caseId:'195-browser-idempotency-reuse',nativeCode:'NATIVE_FAMILY_IDEMPOTENCY_REUSE',text:RPC.selfCommand,values:[empCtx,JSON.stringify(reuse),receipt1.key,'null']},async()=>{const r=await post(emp,API+'?view=self',{key:receipt1.key,membership:employee.raw.membershipId,data:JSON.stringify(reuse)});assert.equal(r.response.status(),409);assert.equal(r.body.code,'NATIVE_FAMILY_IDEMPOTENCY_REUSE');});
  const stale=childBody({subjectVersion:'0'.repeat(64),familyName:s.childName+' cuarta',reason:s.reason}),staleKey=randomUUID();
  await expectWholeRowsUnchanged({caseId:'195-browser-stale-subject',nativeCode:'NATIVE_FAMILY_IDENTITY_CHANGED',text:RPC.selfCommand,values:[empCtx,JSON.stringify(stale),staleKey,'null']},async()=>{const r=await post(emp,API+'?view=self',{key:staleKey,membership:employee.raw.membershipId,data:JSON.stringify(stale)});assert.equal(r.response.status(),409);assert.equal(r.body.code,'NATIVE_FAMILY_IDENTITY_CHANGED');});
  const duplicate=childBody({subjectVersion,familyName:s.childName,reason:s.reason}),dupKey=randomUUID();
  const dup=await post(emp,API+'?view=self',{key:dupKey,membership:employee.raw.membershipId,data:JSON.stringify(duplicate)});assert.equal(dup.response.status(),201);
  const dupAccept=reviewBody({command:'accept',requestId:dup.body.data.requestId,expectedVersion:1,reason:s.decisionReason}),dupAcceptKey=randomUUID();
  // lib:22 maps EMPLOYEE_FAMILY_* through employeeFamilySafeError (DUPLICATE=409, lib/internal-family-members.js:13
  // per the independent review) and FamilyRequestError prefixes NATIVE_FAMILY_ (model:11).
  await expectWholeRowsUnchanged({caseId:'195-browser-duplicate-child',nativeCode:'EMPLOYEE_FAMILY_DUPLICATE',text:RPC.reviewCommand,values:[revCtx,JSON.stringify(dupAccept),dupAcceptKey,'null']},async()=>{const r=await post(rev,API+'?view=review',{key:dupAcceptKey,membership:reviewer.raw.membershipId,data:JSON.stringify(dupAccept)});assert.equal(r.response.status(),409);assert.equal(r.body.code,'NATIVE_FAMILY_DUPLICATE');});
  // Both remaining actors are mandatory (actors §1): 195:361, 195:253 with an EXISTING id and 195:332 are always exercised.
  const own=await host.open('selfreviewer'),ownCtx=ctxOf(selfreviewer),ownBoot=(await own.request(API+'?view=self&resource=bootstrap')).body.data,ownKey=randomUUID();
  assert.equal(ownBoot.state,'native');assert.equal(ownBoot.canSubmit,true);assert.notEqual(ownBoot.subject.subjectVersion,subjectVersion,'FAMILY195_BROWSER_DISTINCT_SUBJECTS');assert.notEqual(ownBoot.subject.legajo,bootstrap.subject.legajo);
  const ownQueue=(await own.request(API+'?view=review&resource=queue&state=all')).body.data;assert.equal(ownQueue.state,'ready');assert.equal(ownQueue.canSubmit,false);assert.equal(ownQueue.subject,null); // actors §6: both modes for selfreviewer (api:11: queue requires state)
  const ownBody=childBody({subjectVersion:ownBoot.subject.subjectVersion,familyName:s.childName+' propia',reason:s.reason}),ownSubmit=await post(own,API+'?view=self',{key:ownKey,membership:selfreviewer.raw.membershipId,data:JSON.stringify(ownBody)});assert.equal(ownSubmit.response.status(),201);
  const selfAccept=reviewBody({command:'accept',requestId:ownSubmit.body.data.requestId,expectedVersion:1,reason:s.decisionReason}),selfAcceptKey=randomUUID();
  await expectWholeRowsUnchanged({caseId:'195-browser-self-review',nativeCode:'NATIVE_FAMILY_INDEPENDENT_REVIEW_REQUIRED',text:RPC.reviewCommand,values:[ownCtx,JSON.stringify(selfAccept),selfAcceptKey,'null']},async()=>{const r=await post(own,API+'?view=review',{key:selfAcceptKey,membership:selfreviewer.raw.membershipId,data:JSON.stringify(selfAccept)});assert.equal(r.response.status(),403);assert.equal(r.body.code,'NATIVE_FAMILY_INDEPENDENT_REVIEW_REQUIRED');});
  await expectWholeRowsUnchanged({caseId:'195-browser-foreign-request',nativeCode:'NATIVE_FAMILY_NOT_FOUND',text:RPC.selfDetail,values:[empCtx,ownSubmit.body.data.requestId]},async()=>{const r=await emp.request(API+'?view=self&resource=detail&id='+ownSubmit.body.data.requestId);assert.equal(r.response.status(),404);assert.equal(r.body.code,'NATIVE_FAMILY_NOT_FOUND');});
  await own.close();
  // 195:180-181 for the unlinked actor, observed before the SQL negative (actors §6/§9): it holds
  // self.submit, so only SQL can reject it (a prior JS denial would not prove 195:332).
  const un=await host.open('unlinked'),unCtx=ctxOf(unlinked),unBoot=(await un.request(API+'?view=self&resource=bootstrap')).body.data;
  assert.equal(unBoot.state,'unlinked');assert.equal(unBoot.canSubmit,false);assert.equal(unBoot.subject,null);assert.deepEqual(unBoot.families,[]);assert.deepEqual(unBoot.requests,[]);assert.equal(unBoot.total,0);assert.equal(unBoot.complete,true);
  const unBody=childBody({subjectVersion:'1'.repeat(64),familyName:s.childName,reason:s.reason}),unKey=randomUUID();
  await expectWholeRowsUnchanged({caseId:'195-browser-unlinked',nativeCode:'NATIVE_FAMILY_UNLINKED',text:RPC.selfCommand,values:[unCtx,JSON.stringify(unBody),unKey,'null']},async()=>{const r=await post(un,API+'?view=self',{key:unKey,membership:unlinked.raw.membershipId,data:JSON.stringify(unBody)});assert.equal(r.response.status(),403);assert.equal(r.body.code,'NATIVE_FAMILY_UNLINKED');});
  await un.close();
  // Every SQL negative is behind us: family tables show exactly the positives and the non-family
  // state is untouched (actors §7B: equality around the negatives, not only at the end).
  assert.deepEqual(diff(familyBaseline,await fixture.readFamilySnapshot()),EXPECTED_TOTAL,'FAMILY195_DELTA_AFTER_NEGATIVES');assert.deepEqual(readSnapshot(),baseline,'FAMILY195_BROWSER_NON_FAMILY_STATE_UNCHANGED_AFTER_NEGATIVES');
  assert.equal(mutations,EXPECTED_ATTEMPTS,'FAMILY195_BROWSER_COMMANDS_AFTER_NEGATIVES');
  // I. Isolation, hidden data, client-side retirements, identity change, mobile lists. None of these
  //    touches SQL: `mutations` and `pagePosts` stay where H left them.
  const cross=await emp.request(API+'?view=self&resource=attempt&key='+receipt1.key,{headers:{'X-Native-Family-Membership':reviewer.raw.membershipId}});assert.equal(cross.response.status(),409);assert.equal(cross.body.code,'NATIVE_FAMILY_SCOPE_CHANGED');
  await emp.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await E.textMatches(/Se retiraron los datos al ocultar la página/);check(!(await E.text()).includes(s.childName),'hidden page retires every nominal family datum');
  await emp.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await E.action('resume').click();await E.textMatches(/Legajo /);
  // I.1 Real capabilities-ready event (panel.js:23,61): a CLIENT/PANEL retirement; the IAM is untouched.
  //     centro-acciones.html never dispatches this event itself, so the harness fires it exactly as
  //     another product module would; nothing else on /acciones listens.
  const rpcBeforeRevoke=rpc.length,postsBeforeRevoke=pagePosts.length;
  await emp.page.evaluate(next=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:next}})),['actions.read']);
  await E.textMatches(/Cambió tu acceso\. Se retiraron los datos familiares/);check(!(await E.text()).includes(s.childName)&&rpc.length===rpcBeforeRevoke&&pagePosts.length===postsBeforeRevoke,'capabilities-ready without family capabilities closes the panel and sends nothing');
  // I.2 Presented capability narrowed only in /api/internal-auth (host-qa:68): SQL keeps the real IAM
  //     (canSubmit stays true), so the CLIENT gate must stop the write (client:30,44).
  await emp.page.goto(host.origin+PAGE);await E.textMatches(/Legajo /);const postsBeforeWithdrawal=pagePosts.length,commandsBeforeWithdrawal=mutations;narrowed={name:'employee',drop:['employee.family.self.submit']};
  await E.action('new').click();await E.field('familyName').waitFor();await E.field('familyName').fill(s.childName+' retirada');await E.field('reason').fill(s.reason);await E.field('confirmed').check();await E.action('submit').click();
  await E.textMatches(/Cambió la cuenta, el ámbito o sus permisos/);check(pagePosts.length===postsBeforeWithdrawal&&mutations===commandsBeforeWithdrawal,'narrowed submit capability stops the write in the client before any POST');
  // I.3 Without self.read the product does not even import the family module (centro-acciones.html:2911):
  //     the host stays hidden/empty and the page falls back to the general Action Center, whose
  //     bootstrap this host answers with 503 (host-qa:91) and authenticate() catches (:2977-2983).
  narrowed={name:'employee',drop:['employee.family.self.read']};const actionsBootstrap=emp.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/internal-actions');const rpcBeforeNoRead=rpc.length;
  await emp.page.goto(host.origin+PAGE);assert.equal((await actionsBootstrap).status(),503);
  await emp.page.waitForFunction(()=>document.getElementById('gateTitle')?.textContent==='No pudimos abrir el Centro de acciones'&&document.getElementById('authGate')?.hidden===false,{},{timeout:15000});
  check(await E.unmounted()&&await panel(emp.page,'nativeFamilyReviewPanel').unmounted()&&!(await dedicated(emp.page))&&rpc.length===rpcBeforeNoRead&&pagePosts.length===postsBeforeWithdrawal,'without self.read no family panel mounts, no family read or write is emitted');narrowed=null;
  // I.4 Another VALID identity behind the same cookie (fresh UUID, nobody's account) → identity key
  //     mismatch (client:30); separately, a malformed DTO (client:8) → 401 'La sesión cambió'.
  const otherIdentity=randomUUID();assert.notEqual(otherIdentity,employee.raw.actorSessionId);
  await emp.page.goto(host.origin+PAGE);await E.textMatches(/Legajo /);presentedUserId=otherIdentity;await E.action('refresh').click();await E.textMatches(/Cambió la cuenta, el ámbito o sus permisos/);
  check(!(await E.text()).includes(s.childName),'a different valid identity behind the same cookie clears the data');presentedUserId=null;
  await emp.page.goto(host.origin+PAGE);await E.textMatches(/Legajo /);presentedUserId=employee.raw.actorSessionId+'-qa-malformed';await E.action('refresh').click();await E.textMatches(/La sesión cambió\. Volvé a abrir el Centro de acciones/);presentedUserId=null;
  // I.5 Final lists on both views at 390/320 (idle rejects the initial busy render, F1).
  //     Self view lists every own request (4: child, schooling, recovered, duplicate); the review queue
  //     defaults to 'submitted' (panel.js:56 filter) → recovered, duplicate and selfreviewer's own (3).
  await emp.page.goto(host.origin+PAGE);await E.textMatches(/Legajo /);await E.idle();check(/de 4 presentaciones/.test(await E.text()),'employee list shows the four own requests after idle');await mobile(E,emp.page,'employee-list');
  await rev.page.goto(host.origin+PAGE);await R.idle();check(/de 3 presentaciones/.test(await R.text()),'reviewer queue shows the three pending submissions after idle');await mobile(R,rev.page,'reviewer-list');
  // Totals: the session window, the confirmed rows, the attempts and the non-family state.
  assert.ok(Date.now()<sessionDeadline,'FAMILY195_BROWSER_SESSION_EXPIRED_DURING_RUN');
  assertDerivedPage();
  const finalDelta=diff(familyBaseline,await fixture.readFamilySnapshot());
  assert.deepEqual(finalDelta,EXPECTED_TOTAL,'FAMILY195_DELTA_TOTAL');
  assert.equal(mutations,EXPECTED_ATTEMPTS,'FAMILY195_BROWSER_COMMANDS_TOTAL');
  assert.deepEqual(readSnapshot(),baseline,'FAMILY195_BROWSER_NON_FAMILY_STATE_UNCHANGED');
  assert.deepEqual(host.evidence.pageErrors,[]);assert.deepEqual(host.evidence.serverErrors,[]);assert.deepEqual(host.evidence.external,[]);
  const scenarioRequestIds=[receipt1.requestId,receipt2.requestId,receipt3.requestId,dup.body.data.requestId,ownSubmit.body.data.requestId].sort();assert.equal(new Set(scenarioRequestIds).size,5);
  result={version:'native-family195-live190-native-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,checks,sourceBookend,httpEvidence:host.evidence.httpEvidence,loginTargets:host.evidence.loginTargets,
   rpcStatements:rpc.length,mutations,expectedMutations:EXPECTED_ATTEMPTS,attempts:{confirmedEvents:9,replayPost:1,sqlRejected:6,attemptGets:1},familyDelta:finalDelta,expectedFamilyDelta:EXPECTED_TOTAL,familySnapshotKeys:FAMILY_SNAPSHOT_KEYS,
   scenarioRequestIds,nativeIdentityContracts:fixture.nativeIdentityContracts,actors:names,sessionWindow:{deadline:new Date(sessionDeadline).toISOString(),finishedInside:true},
   replayPostProven:true,attemptGetRecoveryProven:true,negativeWholeRowsUnchanged:true,replayWholeRowsUnchanged:true,recoveryWholeRowsUnchanged:true,pdfDownloadWholeRowsUnchanged:true,clientRetirements:['visibilitychange','municontrol:capabilities-ready','presented capability narrowed','presented self.read absent','presented identity changed','malformed presented DTO'],iamRevocationProven:false,
   mobileStates:['employee-child-form','employee-schooling-form-with-file','employee-pending-recovery','employee-list','reviewer-decision-detail','reviewer-document-detail','reviewer-list'],
   actualSql:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,pdfSynthetic:true,pdfPages:fixture.pdfPages,institutionalAcceptance:false,signature:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false,nominalRowsReturned:0,
   provenInSql:['STATE_CHANGED','NOT_FOUND','IDEMPOTENCY_REUSE','IDENTITY_CHANGED','EMPLOYEE_FAMILY_DUPLICATE','INDEPENDENT_REVIEW_REQUIRED','UNLINKED'],
   provenInJsOnly:['FORBIDDEN(capabilities)','SCOPE_CHANGED(header)','SESSION_INVALID(malformed dto)','FORBIDDEN(presented identity/capabilities)','PENDING','DOCUMENT_INVALID(client)','INPUT_INVALID(model)']};
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,checks,rpc:rpc.length,mutations,evidence:host.evidence},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return Object.freeze(result);
}
