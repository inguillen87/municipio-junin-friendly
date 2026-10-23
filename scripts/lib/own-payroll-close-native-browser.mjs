// Source candidate: actual built close UI on the one already installed190 host.
// No seed, installer, grant, formula, new calculation or separate SQL transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createOwnCloseHandler} from '../../api/internal-own-payroll-close.js';
import {OWN_CLOSE_WRITE,verifiedOwnCloseReceipt} from '../../assets/own-payroll-close-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {closeQaHttpServer} from './qa-http-server-close.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),FULL=32*1024*1024;
const sha=value=>createHash('sha256').update(value).digest('hex');
const commandSql='SELECT public.own_close_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const sorted=value=>[...value].sort();

// Rows of every pre-existing table except the intentionally append-only close
// ledger remain equal. The listed OIDs/security/catalogue metadata/IAM also
// remain; this supplementary comparison does not replace source-pinned201.
function conservation(h,qa){
  const schema=q(qa.schema);
  return h.json([`DO $close_ui_conservation$ DECLARE relation record;amount bigint;digest_value text;rows_value jsonb:='[]';BEGIN
   FOR relation IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace=${schema}::regnamespace AND c.relkind IN('r','p','m') AND c.relname<>'own_payroll_close_event' ORDER BY c.oid LOOP
    EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text COLLATE "C"),''''),''sha256''),''hex'') FROM %I.%I r',${schema},relation.relname) INTO amount,digest_value;
    rows_value:=rows_value||jsonb_build_array(jsonb_build_object('oid',relation.oid,'name',relation.relname,'rows',amount,'sha256',digest_value));
   END LOOP;
   PERFORM set_config('municontrol_close_ui190.conservation',jsonb_build_object('rows',rows_value,
    'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_class c WHERE c.relnamespace=${schema}::regnamespace),
    'attributes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${schema}::regnamespace),
    'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]') FROM pg_constraint c WHERE c.connamespace=${schema}::regnamespace),
    'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]') FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${schema}::regnamespace),
    'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=${schema}::regnamespace),
    'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace=${schema}::regnamespace),
    'functions',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') FROM pg_proc p WHERE p.pronamespace=${schema}::regnamespace),
    'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d),
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
    'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m),
    'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid=${schema}::regnamespace))::text,true);
  END $close_ui_conservation$;SELECT current_setting('municontrol_close_ui190.conservation')::jsonb`],{readOnly:true,fullJson:true});
}

export async function verifyOwnCloseBrowserOn190(context){
  assert.equal(context?.version,'own-close-browser-live190-context.v1');
  const {h,db,qa,maker,reviewer,contracts,first,firstSaved,second,closed,reopened,period,query,operations,readSnapshot}=context;
  assert.strictEqual(qa,h.qa);assert.equal(qa.operationalPairBaseline,'published107');
  assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
  assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
  assert.deepEqual(query,{period,liquidationType:'monthly'});assert.equal(period,'2026-10');
  assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);
  assert.equal(typeof readSnapshot,'function');assert.equal(typeof db.query,'function');
  for(const identity of [maker,reviewer]){
    assert.equal(identity.principal.authorized,true);assert.equal(identity.principal.session.mfa,true);
    assert.equal(identity.principal.session.id,identity.session.id);
  }
  assert.equal(reviewer.session.id,qa.checker.actorSessionId);assert.equal(maker.session.id,qa.actor.actorSessionId);
  assert.notEqual(maker.session.id,reviewer.session.id);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
  const caps=reviewer.principal.tenant.effectiveCapabilities;
  assert.ok(OWN_CLOSE_WRITE.every(cap=>caps.includes(cap)));assert.ok(!caps.includes('payroll.calculation.prepare'));
  for(const capture of [first,second]){
    assert.equal(capture.saved.result.employeeCount,855);assert.equal(capture.saved.result.rowCount,17100);
    assert.equal(capture.saved.input.rules.length,20);assert.deepEqual(sorted(capture.saved.input.employees.map(row=>row.contractId)),sorted(contracts));
  }
  assert.deepEqual(first.saved,firstSaved);const secondSaved=structuredClone(second.saved);
  const initial=await operations.close('detail',query);
  assert.equal(initial.rows.length,855);assert.ok(initial.rows.every(row=>row.state==='confirmed'&&row.canClose));
  assert.equal(initial.groups.length,1);assert.equal(initial.groups[0].id,closed.groupId);assert.equal(initial.groups[0].state,'reopened');
  assert.equal(reopened.groupId,closed.groupId);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);
  const expectedNumbers=secondSaved.input.employees.map(row=>row.employeeNumber),firstContract=contracts[0];
  assert.equal(new Set(expectedNumbers).size,855);
  const partialNumber=secondSaved.input.employees.find(row=>row.contractId===firstContract).employeeNumber;
  const ledger=()=>db.run("SELECT jsonb_build_object('events',(SELECT count(*)::integer FROM own_payroll_close_event),'groups',(SELECT count(*)::integer FROM own_payroll_close_event WHERE command='close'),'active',(SELECT count(*)::integer FROM own_payroll_close_event c WHERE command='close' AND NOT EXISTS(SELECT 1 FROM own_payroll_close_event r WHERE r.group_id=c.id AND r.command='reopen')),'captures',(SELECT count(*)::integer FROM own_payroll_run_capture),'results',(SELECT count(*)::integer FROM own_payroll_run_result),'liquidationEvents',(SELECT count(*)::integer FROM own_payroll_liquidation_event),'annulEvents',(SELECT count(*)::integer FROM own_payroll_annul_event),'native',(SELECT count(*)::integer FROM native_employee_registration))");
  const beforeLedger=await ledger();assert.equal(beforeLedger.events,2);assert.equal(beforeLedger.groups,1);assert.equal(beforeLedger.active,0);assert.equal(beforeLedger.native,855);
  const closeRows=()=>db.run("SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sha256',encode(public.digest(to_jsonb(e)::text,'sha256'),'hex')) ORDER BY e.id),'[]') FROM own_payroll_close_event e");
  const oldCloseRows=await closeRows();assert.equal(oldCloseRows.length,2);
  const beforeConservation=conservation(h,qa),baseline=readSnapshot(),checks=[],commands=[],pagePosts=[],pageReads=[],diagnostics=[],pageErrors=[],serverErrors=[],external=[];
  const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);h.check(label);};
  const sourceBookend=[];
  for(const name of ['own-payroll-close-panel.js','own-payroll-close-panel.css','own-payroll-close-model.js','own-payroll-response.js','own-payroll-run-workspace-model.js','own-payroll-run-model.js','own-payroll-exact.js','native-salary-catalog-model.js']){
    const relative='assets/'+name,bytes=fs.readFileSync(path.join(root,relative));
    assert.deepEqual(fs.readFileSync(path.join(root,'public',relative)),bytes,'CLOSE190_BUILT_SOURCE_MISMATCH:'+relative);sourceBookend.push({path:relative,sha256:sha(bytes)});
  }
  const overrideFor=capability=>db.run('SELECT to_jsonb(o) FROM tenant_membership_capability_override o WHERE membership_id='+q(qa.checker.membershipId)+'::uuid AND capability_key='+q(capability));
  const overrides=new Map();for(const capability of ['payroll.calculation.close','payroll.calculation.approve']){
    const value=await overrideFor(capability);assert.equal(value.allow_override,true);assert.equal(value.deny_override,false);overrides.set(capability,value);
  }
  const setDenied=capability=>db.run('UPDATE tenant_membership_capability_override SET allow_override=false,deny_override=true WHERE membership_id='+q(qa.checker.membershipId)+'::uuid AND capability_key='+q(capability));
  const restore=async()=>{for(const[capability,value]of overrides){await db.run('UPDATE tenant_membership_capability_override SET allow_override='+String(value.allow_override)+',deny_override='+String(value.deny_override)+' WHERE membership_id='+q(qa.checker.membershipId)+'::uuid AND capability_key='+q(capability));assert.deepEqual(await overrideFor(capability),value);}};
  let loss=null,expire=false,server,browser,browserContext,page,failure,result,delegatedCommands=0;
  const wireDb={query:async(statement,values)=>{
    if(statement!==commandSql)return db.query(statement,values);
    const entry={key:values[2],body:JSON.parse(values[1]),delegated:false,replayed:null,receipt:null};commands.push(entry);
    if(loss==='before'){loss=null;throw Error('QA_CLOSE190_UNSENT_BEFORE_SQL');}
    entry.delegated=true;delegatedCommands++;const response=await db.query(statement,values);entry.receipt=structuredClone(response[0].result);entry.replayed=entry.receipt.replayed;
    if(loss==='after'){loss=null;throw Error('QA_CLOSE190_ACK_WITHHELD_AFTER_COMMIT');}return response;
  }};
  const env={},handler=createOwnCloseHandler({env,requireAccess:async()=>({mode:'managed',principal:reviewer.principal}),sessionFor:()=>reviewer.session,getSql:async()=>wireDb});
  const output=path.resolve(h.destination,'close-native-browser');assert.ok(output.startsWith(path.resolve(h.destination)+path.sep));fs.mkdirSync(output,{recursive:false});
  try{
    server=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://qa.invalid');res.setHeader('Cache-Control','no-store');
      const json=(status,value)=>{if(res.headersSent){res.destroy();return;}res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
      if(req.method==='GET'&&url.pathname==='/api/internal-auth'){
        json(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:qa.checker.actorSessionId,email:qa.checker.actorEmail},access:{context:'tenant',tenant:{id:qa.checker.tenantId,roleKey:'QA_CANONICAL190_REVIEWER'},tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+(expire?-3600000:3600000)).toISOString()});return;
      }
      if(url.pathname==='/api/internal-own-payroll-close'){
        req.query=Object.fromEntries(url.searchParams);res.status=value=>{res.statusCode=value;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
        Promise.resolve(handler(req,res)).catch(error=>{serverErrors.push(error.message);json(500,{ok:false,error:'QA_CLOSE190_HANDLER_REJECTED'});});return;
      }
      if(req.method==='GET'&&url.pathname==='/qa-close.html'){
        res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cierre sintético canonical190</title><style>body{margin:12px;font-family:system-ui}main{max-width:1100px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import {mountOwnPayrollClose} from "/assets/own-payroll-close-panel.js";mountOwnPayrollClose(document.getElementById("qa"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"cierre"}}));</script></html>');return;
      }
      if(url.pathname.startsWith('/api/')){json(503,{ok:false,error:'API outside this close continuation'});return;}
      const publicRoot=path.join(root,'public');let file;try{file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400).end();return;}
      if(req.method!=='GET'||!file.startsWith(path.join(publicRoot,'assets')+path.sep)||!/\.(js|css|png|svg|webp|woff2?)$/.test(file)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});res.end(fs.readFileSync(file));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
    const executable=process.env.OWN_LIQ_QA_HEADLESS_EXECUTABLE;if(executable)assert.ok(path.isAbsolute(executable)&&fs.existsSync(executable)&&/^chrome-headless-shell(?:\.exe)?$/.test(path.basename(executable)));
    browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});browserContext=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
    await browserContext.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort('blockedbyclient');}return route.continue();});
    page=await browserContext.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&url.origin===origin&&url.pathname.startsWith('/api/'))pagePosts.push({path:url.pathname,key:request.headers()['idempotency-key'],body:JSON.parse(request.postData())});});
    page.on('response',response=>{const request=response.request(),url=new URL(response.url());if(request.method()==='GET'&&url.origin===origin&&url.pathname==='/api/internal-own-payroll-close')pageReads.push({resource:url.searchParams.get('resource'),key:url.searchParams.get('key'),id:url.searchParams.get('id'),status:response.status()});});
    const $=key=>page.locator('[data-close-'+key+']'),idle=()=>page.waitForFunction(()=>document.querySelector('.own-close')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
    const consult=async()=>{await $('consult').click();await idle();},another=async()=>{await $('another').click();await idle();};
    const decide=async(kind,values=[])=>{await $('command').selectOption('close');await $('kind').selectOption(kind);if(kind!=='all')await $('values').selectOption(values);await $('reason').fill('Cierre exclusivamente sintético canonical190, conservación completa');await $('confirm').check();};
    const reopen=async id=>{await $('command').selectOption('reopen');await $('group').selectOption(id);await $('reason').fill('Reapertura exclusivamente sintética canonical190 del grupo original');await $('confirm').check();};
    const send=async()=>{await $('send').click();await idle();};
    const openHistoric=async id=>{
      const details=page.locator('details').filter({has:$('history')});
      assert.equal(await details.count(),1,'CLOSE190_HISTORY_DETAILS_REQUIRED');
      if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();
      await details.locator('[data-close-group-id="'+id+'"]').click();await idle();
    };
    const unchangedCounts=actual=>{for(const key of ['captures','results','liquidationEvents','annulEvents','native'])assert.equal(actual[key],beforeLedger[key]);};
    const readOriginalGroup=async()=>{assert.deepEqual(await operations.close('group',{id:closed.groupId}),{...closed,replayed:true});};
    // Read displayed money back to its exact decimal spelling. Expected amounts
    // come from the immutable capture, not the close snapshot/UI formatter.
    const displayedDecimal=text=>{assert.match(text,/^\$ -?(?:0|[1-9]\d{0,2}(?:\.\d{3})*)(?:,\d{1,8})?$/);return text.slice(2).replaceAll('.','').replace(',','.');};
    // Independent scaled-integer oracle: capture precision is data, never a
    // municipal default. No floating point, product snapshot or formatter.
    const aggregateKeys=['gross','deduction','net'],aggregatePrecision=secondSaved.input.totalsPrecision;
    assert.ok(Number.isInteger(aggregatePrecision)&&aggregatePrecision>=0&&aggregatePrecision<=8);
    const aggregateScale=10n**BigInt(aggregatePrecision);
    const capturedInteger=value=>{
      assert.equal(typeof value,'string');assert.match(value,/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/);
      const negative=value.startsWith('-'),[integer,fraction='']=(negative?value.slice(1):value).split('.');
      assert.ok(fraction.length<=aggregatePrecision,'CLOSE190_CAPTURE_PRECISION_MISMATCH');
      const magnitude=BigInt(integer)*aggregateScale+BigInt(fraction.padEnd(aggregatePrecision,'0')||'0');return negative?-magnitude:magnitude;
    };
    const capturedDecimal=value=>{
      const negative=value<0n,magnitude=negative?-value:value,integer=(magnitude/aggregateScale).toString();
      return (negative?'-':'')+integer+(aggregatePrecision?'.'+(magnitude%aggregateScale).toString().padStart(aggregatePrecision,'0'):'');
    };
    const expectedAggregate=selected=>{
      const wanted=new Set(selected);assert.equal(wanted.size,selected.length);assert.ok(wanted.size>0);
      const rows=secondSaved.result.employeeTotals.filter(row=>wanted.has(row.contractId));assert.equal(rows.length,selected.length);
      assert.equal(new Set(rows.map(row=>row.contractId)).size,selected.length);
      return aggregateKeys.map(key=>capturedDecimal(rows.reduce((sum,row)=>sum+capturedInteger(row[key]),0n)));
    };
    const assertAggregate=async(key,selected)=>{
      const labels=await $(key).locator('dt').allTextContents(),amounts=await $(key).locator('dd').allTextContents();
      const normalSpace=text=>text.replace(/\s+/gu,' ').trim();
      assert.deepEqual(labels.map(normalSpace),key==='preview'?['Bruto del grupo','Retenciones del grupo','Neto del grupo']:['Bruto','Retenciones','Neto']);
      assert.equal(amounts.length,3);assert.deepEqual(amounts.map(normalSpace).map(displayedDecimal),expectedAggregate(selected));
    };
    const assertHistoric=async selected=>{
      const cells=await $('historic-rows').locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent.trim())));
      assert.equal(cells.length,selected.length);const wanted=new Set(selected),seen=new Set();
      for(const row of cells){
        assert.equal(row.length,5);const employee=secondSaved.input.employees.find(item=>item.employeeNumber===row[0]);assert.ok(employee&&wanted.has(employee.contractId));assert.ok(!seen.has(employee.contractId));seen.add(employee.contractId);
        const state=initial.rows.find(item=>item.contractId===employee.contractId),total=secondSaved.result.employeeTotals.find(item=>item.contractId===employee.contractId);assert.ok(state&&total);
        assert.equal(row[1],String(state.liquidationVersion));assert.deepEqual(row.slice(2).map(displayedDecimal),[total.gross,total.deduction,total.net]);
      }
      assert.deepEqual(sorted([...seen]),sorted(selected));await assertAggregate('historic-totals',selected);
    };
    await page.goto(origin+'/qa-close.html');await $('status').waitFor();await idle();check(pagePosts.length===0&&commands.length===0,'opening the built close product sends no business POST');
    await $('period').fill(period);await $('type').selectOption('monthly');await consult();await $('detail').waitFor({state:'visible'});
    assert.ok((await $('summary').innerText()).includes('855 legajos propios: 0 sin confirmar, 855 confirmados, 0 cerrados.'));
    const visibleNumbers=()=>$('rows').locator('tr').evaluateAll(rows=>rows.map(row=>row.cells[0].textContent.trim())),numbers=await visibleNumbers();assert.equal(numbers.length,25);
    for(let n=1;n<35;n++){await $('next').click();numbers.push(...await visibleNumbers());}
    assert.deepEqual(sorted(numbers),sorted(expectedNumbers));check(numbers.length===855&&new Set(numbers).size===855&&await $('next').isDisabled(),'all35 close pages show every original employee exactly once');
    await $('search').fill(partialNumber);assert.equal(await $('rows').locator('tr').count(),1);await decide('all');await assertAggregate('preview',contracts);check((await $('scope').innerText()).includes('855 de 855 legajos'),'search never narrows the full close selection');
    await decide('contracts',[firstContract]);await assertAggregate('preview',[firstContract]);loss='after';await send();assert.equal(commands.length,1);assert.equal(delegatedCommands,1);assert.equal(commands[0].replayed,false);
    const frozen={key:commands[0].key,body:structuredClone(commands[0].body)};check(await $('recover').isVisible()&&!await $('send').isDisabled(),'lost post-commit acknowledgement retains the original retry');
    await $('reason').evaluate(element=>{element.value='DOM change cannot replace frozen request';element.dispatchEvent(new Event('input',{bubbles:true}));});await $('kind').evaluate(element=>{element.value='all';element.dispatchEvent(new Event('change',{bubbles:true}));});await send();
    assert.equal(commands.length,2);assert.deepEqual({key:commands[1].key,body:commands[1].body},frozen);assert.equal(commands[1].replayed,true);
    const partial=await verifiedOwnCloseReceipt(commands[1].receipt);assert.equal(partial.snapshot.employeeCount,1);assert.equal(partial.snapshot.populationCount,855);assert.equal(partial.snapshot.conceptCount,20);assert.equal(partial.snapshot.employees[0].contractId,firstContract);assert.equal(partial.snapshot.employees[0].runId,second.id);
    assert.ok((await $('historic-summary').innerText()).includes('1 de 855 legajos'));await assertHistoric([firstContract]);let counts=await ledger();unchangedCounts(counts);assert.equal(counts.events,3);assert.equal(counts.active,1);
    check(pagePosts.length===2&&counts.events===beforeLedger.events+1,'two actual POSTs recover one partial native event with the same body and key');
    await another();await $('search').fill('');await decide('all');check(await $('send').isDisabled(),'full selection refuses to omit the employee already closed');await reopen(partial.groupId);
    const beforeUnsent=readSnapshot();loss='before';await send();assert.equal(commands.length,3);assert.equal(commands[2].delegated,false);assert.deepEqual(readSnapshot(),beforeUnsent);const unsent={key:commands[2].key,body:structuredClone(commands[2].body)};
    await openHistoric(partial.groupId);assert.equal(await $('historic-rows').locator('tr').count(),1);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    check(await $('detail').isHidden()&&await $('historic').isHidden()&&(await $('rows').innerText())===''&&(await $('historic-rows').innerText())==='','hiding the actual pending screen removes current and historical nominal data');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await consult();await $('recover').click();await idle();
    assert.ok(pageReads.some(read=>read.resource==='attempt'&&read.key===unsent.key&&read.status===404));check(await $('revise').isVisible(),'actual404 recovery proves the same unsent key absent before intentional retry');await send();
    assert.equal(commands.length,4);assert.deepEqual({key:commands[3].key,body:commands[3].body},unsent);assert.equal(commands[3].replayed,false);
    const partialReopen=await verifiedOwnCloseReceipt(commands[3].receipt);assert.equal(partialReopen.groupId,partial.groupId);assert.deepEqual(partialReopen.snapshot,partial.snapshot);assert.equal(partialReopen.snapshotSha256,partial.snapshotSha256);
    counts=await ledger();unchangedCounts(counts);assert.equal(counts.events,4);assert.equal(counts.active,0);
    await another();await decide('all');await assertAggregate('preview',contracts);await send();assert.equal(commands.length,5);const full=await verifiedOwnCloseReceipt(commands[4].receipt);
    assert.equal(full.snapshot.employeeCount,855);assert.equal(full.snapshot.populationCount,855);assert.equal(full.snapshot.conceptCount,17100);assert.equal(full.snapshot.populationComplete,true);
    assert.deepEqual(sorted(full.snapshot.employees.map(employee=>employee.contractId)),sorted(contracts));assert.ok(full.snapshot.employees.every(employee=>employee.runId===second.id&&employee.inputSha256===secondSaved.inputSha256&&employee.resultSha256===secondSaved.resultSha256));
    await assertHistoric(contracts);assert.ok((await $('historic-summary').innerText()).includes('855 de 855 legajos'));assert.ok(Buffer.byteLength(JSON.stringify(full),'utf8')>4*1024*1024);assert.ok(Buffer.byteLength(JSON.stringify(full),'utf8')<=FULL);
    check(!(await page.locator('body').innerText()).includes('Pago ejecutado'),'full historical close never claims an executed payment');
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1100});await $('another').scrollIntoViewIfNeeded();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'close product fits '+width+'px');check(await $('another').evaluate(element=>element.getBoundingClientRect().height>=44),'close action is at least44px at '+width);await page.screenshot({path:path.join(output,'close-'+width+'.png'),fullPage:true});}
    await page.setViewportSize({width:1440,height:1100});await another();await reopen(full.groupId);await send();assert.equal(commands.length,6);const fullReopen=await verifiedOwnCloseReceipt(commands[5].receipt);assert.equal(fullReopen.groupId,full.groupId);assert.deepEqual(fullReopen.snapshot,full.snapshot);assert.equal(fullReopen.snapshotSha256,full.snapshotSha256);
    check(pagePosts.length===6&&delegatedCommands===5,'six observed product POSTs delegate exactly five command RPCs; the pre-SQL loss is not hidden');
    for(let n=0;n<6;n++){assert.equal(pagePosts[n].path,'/api/internal-own-payroll-close');assert.equal(pagePosts[n].key,commands[n].key);assert.deepEqual(pagePosts[n].body,{operation:'command',payload:commands[n].body});}
    await another();await $('type').selectOption('vacation');check(await $('detail').isHidden()&&pagePosts.length===6,'type change invalidates review without any POST');await consult();assert.ok((await $('summary').innerText()).includes('855 sin confirmar'));await $('type').selectOption('monthly');await consult();
    expire=true;await consult();check(await $('detail').isHidden()&&(await $('rows').innerText())===''&&pagePosts.length===6,'expired authentication fixture clears the complete result without writing');expire=false;await consult();
    await setDenied('payroll.calculation.close');await consult();check(await $('reason').isDisabled()&&await $('send').isDisabled()&&pagePosts.length===6,'actual SQL close deny disables writing despite the unchanged stale principal');await restore();await consult();
    await openHistoric(full.groupId);assert.equal(await $('historic-rows').locator('tr').count(),855);
    await setDenied('payroll.calculation.approve');await consult();check(await $('detail').isHidden()&&(await $('rows').innerText())===''&&(await $('historic-rows').innerText())===''&&pagePosts.length===6,'actual SQL review deny clears both current and historical nominal data');await restore();await consult();
    counts=await ledger();unchangedCounts(counts);assert.equal(counts.events,6);assert.equal(counts.groups,3);assert.equal(counts.active,0);
    const finalCloseRows=await closeRows();assert.equal(finalCloseRows.length,6);for(const old of oldCloseRows)assert.deepEqual(finalCloseRows.find(row=>row.id===old.id),old,'CLOSE190_ORIGINAL_CLOSE_ROW_CHANGED');
    assert.deepEqual((await operations.liq('detail',{id:first.id})).capture.saved,firstSaved);assert.deepEqual((await operations.liq('detail',{id:second.id})).capture.saved,secondSaved);await readOriginalGroup();
    assert.deepEqual(await operations.close('group',{id:partial.groupId}),{...commands[0].receipt,replayed:true});assert.deepEqual(await operations.close('group',{id:full.groupId}),{...full,replayed:true});
    assert.deepEqual(conservation(h,qa),beforeConservation,'CLOSE190_PRIOR_NON_CLOSE_ROWS_OR_METADATA_CHANGED');
    assert.deepEqual(pageErrors,[]);assert.deepEqual(serverErrors,[]);assert.deepEqual(external,[]);
    for(const item of sourceBookend)assert.equal(sha(fs.readFileSync(path.join(root,item.path))),item.sha256,'CLOSE190_SOURCE_BOOKEND_CHANGED:'+item.path);
    result={version:'own-close-browser-canonical190.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,population:855,conceptsPerRun:17100,checks,httpPosts:pagePosts.length,observedCommandAttempts:commands.length,delegatedCommandRpcs:delegatedCommands,appendedEvents:4,appendedGroups:2,beforeLedger,afterLedger:counts,originalBaselineCloseEvents:2,finalCloseEvents:6,sourceBookend,actualSql:true,actualHttp:true,builtCloseBrowserProven:true,fullCapacityBrowserProven:false,completeAuthenticationHandler:false,authenticationFixture:true,canonicalMfaActorsChecked:true,originalCapturedResultsUnchanged:true,originalCloseRowPrefixPreserved:true,nonCloseRowsAndListedMetadataPreserved:true,allNewGroupsReopened:true,newCalculations:0,newCaptures:0,monthlyBusinessCovered:false,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
  }catch(error){failure=error;if(page&&!page.isClosed()){try{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText());}catch{}}}
  finally{
    const cleanup=[];for(const action of [restore,async()=>browserContext?.close(),async()=>browser?.close(),async()=>closeQaHttpServer(server)]){try{await action();}catch(error){cleanup.push(error);}}
    fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify({result:result??null,failure:failure?.stack??null,cleanupErrors:cleanup.map(error=>error.message),pagePosts,pageReads,commandAttempts:commands.map(({receipt,...entry})=>({...entry,receiptId:receipt?.id??null,snapshotSha256:receipt?.snapshotSha256??null})),pageErrors,serverErrors,external,diagnostics,baselineSha256:sha(JSON.stringify(baseline))},null,2)+'\n');
    if(cleanup.length)failure=new AggregateError([...(failure?[failure]:[]),...cleanup],'CLOSE190_BROWSER_OR_CLEANUP_FAILED');
  }
  if(failure)throw failure;return result;
}
