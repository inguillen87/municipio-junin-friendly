// Pure source regressions for the period-annulment (Todos) profile of the
// Noelia circuit. No database, browser, HTTP, child process or 190 foundation:
// the runner and browser modules are read as text; the small option/endpoint/
// statement contracts are imported from their public modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {noeliaCircuitEndpoint} from '../scripts/lib/noelia-payroll-circuit-browser.mjs';
import {NOELIA_FULL_DECISION_STATEMENTS,noeliaFullDecisionStatement} from '../scripts/lib/noelia-current-full-qa.mjs';
import {noeliaCircuitOptions} from '../scripts/lib/noelia-circuit-runtime.mjs';
import {NOELIA_ANNULMENT_SOURCE_PINS,projectNoeliaAnnulmentSource,NOELIA_LIQUIDATION_REVIEW_SOURCE_PINS,projectNoeliaLiquidationReviewSource} from './fixtures/noelia-accounting-full-runner-source-projection.js';
import {NOELIA_ACCOUNTING_SOURCE_PINS as CURRENT_NOELIA_ACCOUNTING_SOURCE_PINS} from '../scripts/lib/noelia-accounting-full-source-pins.mjs';

const ROOT=path.resolve(process.cwd()),read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
// Prior M7 assertions still concern their exact former source epoch.
// Current runtime custody is independently checked against its two successors.
const PIN_MODULE='scripts/lib/noelia-accounting-full-source-pins.mjs';
const priorPinSource=projectNoeliaLiquidationReviewSource(PIN_MODULE,read(PIN_MODULE));
const priorPinDeclaration=/export const NOELIA_ACCOUNTING_SOURCE_PINS=Object.freeze\((\{[\s\S]*?\})\);/.exec(priorPinSource);assert.ok(priorPinDeclaration);
const NOELIA_ACCOUNTING_SOURCE_PINS=JSON.parse(priorPinDeclaration[1]);
const RUNNER='scripts/verify-noelia-payroll-circuit.mjs',BROWSER='scripts/lib/noelia-payroll-circuit-browser.mjs';
const SQL208='scripts/migrations/208-own-annulment-review-index.sql',SQL208_SHA256='2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402';
const sha=file=>createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex');
const schema='mc_qa_fixed_092_'+'0'.repeat(32);

test('the circuit transport maps the real annulment API beside the other own payroll handlers',()=>{
 assert.equal(noeliaCircuitEndpoint('/api/internal-own-payroll-annulment'),'annulment');
 assert.equal(noeliaCircuitEndpoint('/api/internal-own-payroll-annulment-preparation'),null,'209 stays outside this profile');
 for(const [pathname,kind]of [['/api/internal-own-payroll-liquidation','liquidation'],['/api/internal-own-payroll-close','close'],['/api/internal-own-payroll-run','run']])assert.equal(noeliaCircuitEndpoint(pathname),kind);
});

test('the six exact annulment emissions join the exact-statement allow-list with their arities',()=>{
 const expected={
  'SELECT public.own_annul_review_v2($1::jsonb,$2::text,$3::text) AS result':3,
  'SELECT public.own_annul_review_full_v2($1::jsonb,$2::text,$3::text) AS result':3,
  'SELECT public.own_annul_attempt_v1($1::jsonb,$2::uuid) AS result':2,
  'SELECT public.own_annul_attempt_full_v1($1::jsonb,$2::uuid) AS result':2,
  'SELECT public.own_annul_command_v2($1::jsonb,$2::jsonb,$3::uuid) AS result':3,
  'SELECT public.own_annul_command_full_v2($1::jsonb,$2::jsonb,$3::uuid) AS result':3
 };
 assert.equal(Object.keys(NOELIA_FULL_DECISION_STATEMENTS).length,13);
 for(const [text,size]of Object.entries(expected)){assert.equal(NOELIA_FULL_DECISION_STATEMENTS[text],size);const values=Array.from({length:size},(_,i)=>String(i));assert.equal(noeliaFullDecisionStatement(text,values,schema),text.replace('public.',schema+'.').replace(/\$(\d+)/g,(_,n)=>"'"+values[Number(n)-1]+"'"));}
 // The application lib emits exactly these texts; the handler never builds others.
 const lib=read('lib/internal-own-payroll-annulment.js');for(const text of Object.keys(expected))assert.ok(lib.includes("'"+text+"'"),'application emission missing: '+text);
 assert.equal(noeliaFullDecisionStatement('SELECT public.own_annul_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',['0','1','2'],schema),null,'legacy v1 command stays outside the profile');
 assert.equal(noeliaFullDecisionStatement('SELECT public.own_annul_preparation_full_v1($1::jsonb,$2::uuid) AS result',['0','1'],schema),null,'209 stays outside the profile');
});

test('--annulment=true is an explicit browser profile option that leaves the default options unchanged',()=>{
 const base=['--major=17','--output=verification/qa','--source-commit='+'a'.repeat(40)];
 assert.deepEqual(noeliaCircuitOptions(base),{major:17,output:'verification/qa',sourceCommit:'a'.repeat(40),browser:'none',transport:'local',positions:false,jurisdictions:false});
 assert.equal(noeliaCircuitOptions([...base,'--browser=chromium','--annulment=true']).annulment,true);
 assert.equal(Object.hasOwn(noeliaCircuitOptions([...base,'--browser=chromium']),'annulment'),false);
 for(const args of [[...base,'--annulment=true'],[...base,'--annulment=false','--browser=chromium'],[...base,'--annulment=1','--browser=chromium']])assert.throws(()=>noeliaCircuitOptions(args));
});

test('the runner installs the exact public 208 index only in the annulment profile, after the verified 201 phase and before the browser',()=>{
 const runner=read(RUNNER);
 assert.equal(sha(SQL208),SQL208_SHA256,'208 source changed: review the profile before running it');
 assert.ok(runner.includes("'"+SQL208_SHA256+"'"));
 const phase=runner.indexOf('if(annulment){\n   assert.ok(fullQa,'),fullQaPhase=runner.indexOf("ok(true,'whole source201 and exact11/27 metadata guards"),browserStart=runner.indexOf('browserQa=await createNoeliaCircuitBrowser(');
 assert.ok(fullQaPhase>0&&phase>fullQaPhase&&browserStart>phase,'208 phase must follow the 201 phase and precede the browser');
 assert.ok(runner.includes("run(tx(statements208),'OWN_ANNUL_REVIEW_ALREADY_PRESENT')"),'second installation must be refused by 208 itself');
 assert.ok(runner.includes("handlers.annulment=createOwnAnnulHandler(deps);"),'the real handler is wired only inside the profile');
 assert.equal((runner.match(/createOwnAnnulHandler\(/g)??[]).length,1);
 assert.ok(!runner.includes('209-own-annulment-preparation')&&!runner.includes('On190'),'no 209 and no 190 installer in this profile');
 assert.ok(runner.includes("if(annulment)assert.ok(browser!=='none','QA_ANNULMENT_BROWSER_REQUIRED');"));
});

test('the Todos hook sits between the proven comparison and the close census, restoring the original 28+1 shape with existing contracts only',()=>{
 const runner=read(RUNNER);
 const comparison=runner.indexOf("checks.push('comparison queries and exports preserve every database row and object"),actorStart=runner.indexOf("current=checker;const annulIndex=await api('annulment',{resource:'review'"),hook=runner.indexOf('const annulReceipt=await browserQa.annulPeriodAll({'),restore=runner.indexOf("await browserQa.calculate({period,selection:{kind:'all',values:[]},expectedCount:29}),restoredResult"),confirm=runner.indexOf("command:'confirm',selection:{kind:'all',values:[]}});\n   const reannulled=await browserQa.decide("),reannul=runner.indexOf("command:'annul',selection:{kind:'contracts',values:[selected.contractId]}});ok(reannulled.affected.length===1"),partial=runner.indexOf('const restoredPartial=await browserQa.calculate('),partialConfirm=runner.indexOf("await browserQa.confirmPartial({detail:await api('liquidation',{resource:'detail',id:restoredPartial.id})})"),close=runner.indexOf("const detail=await api('close',{resource:'detail',period,liquidationType:'monthly'});ok(detail.rows.length===29&&detail.rows.every(r=>r.state==='confirmed')");
 assert.ok(comparison>0&&actorStart>comparison&&hook>actorStart&&restore>hook&&confirm>restore&&reannul>confirm&&partial>reannul&&partialConfirm>partial&&close>partialConfirm,'order: comparison → reviewer session and authenticated 208 index → Todos annulment → full recalculation → independent confirmation → exact re-annulment → partial recalculation → partial confirmation → unchanged close census');
 assert.ok(runner.includes("restoredIndex.index.find(r=>r.id===restored.id)?.states.confirmed===28")&&runner.includes("restoredShape:'28+1'"),'the two-capture 28+1 shape the later close-detail performance check relies on is restored');
 // The actor cycle starts at actorStart (reviewer session + authenticated index), before the helper call at hook.
 const cycle=runner.slice(actorStart,close);
 assert.ok(cycle.includes("current=checker;const annulIndex=await api('annulment',{resource:'review'")&&cycle.includes('current=maker;const restored=await browserQa.calculate(')&&cycle.includes('current=checker;const restoredDetail=()=>api(')&&cycle.includes('current=maker;const restoredPartial=await browserQa.calculate(')&&cycle.includes("current=checker;await browserQa.confirmPartial({detail:await api('liquidation',{resource:'detail',id:restoredPartial.id})})"),'reviewer annuls, preparer recalculates, reviewer confirms and re-annuls, preparer recalculates the exact contract, reviewer confirms it');
 for(const forbidden of ['UPDATE own_payroll_liquidation','DELETE FROM','created_at','clock_timestamp','reopen'])assert.ok(!cycle.includes(forbidden),'no ledger reversal, clock change or reopen inside the hook: '+forbidden);
 assert.ok(runner.includes("periodAnnulment={ui:true,actualHttp:true,sameServer:true,authenticationFixture:true,receiptId:annulReceipt.id"));
 assert.ok(runner.includes('agreementsCovered:false,departmentsCovered:false,preparation209Used:false'));
 assert.ok(runner.includes("'; annul period Todos across both saved runs through #anulacion; complete recalculation; independent confirmation'"));
});

test('the browser helper drives the real #anulacion product with model-derived expectations and the existing transport only',()=>{
 const browser=read(BROWSER),start=browser.indexOf('async function annulPeriodAll({period,expected}){'),end=browser.indexOf('async function prepareReceipts({params}){');
 assert.ok(start>0&&end>start);const helper=browser.slice(start,end);
 assert.ok(helper.includes("fresh('/nomina-control.html#anulacion')"));
 assert.ok(helper.includes("a('kind').selectOption('all')")&&helper.includes("a('reason').fill(")&&helper.includes("a('confirm').check()"));
 assert.ok(helper.includes("commitAndRecover({kind:'annulment',send:a('send'),recover:a('recover'),idle:aidle"),'one committed command, lost acknowledgement and same-key recovery reuse the existing transport');
 assert.ok(helper.includes("assert.equal(r.version,'own-annul-receipt.v2')")&&helper.includes("assert.deepEqual(r.body.selection,{kind:'all',values:[]})"));
 assert.ok(helper.includes("assert.deepEqual([...expected.employeeNumbers].sort(),expectedNumbers,'QA_ANNUL_ALL_UNIVERSE_CHANGED')"),'the universe is the same 29 subjects prepared by the circuit');
 assert.ok(!/page\.evaluate\([^)]*fetch\(/.test(helper)&&!helper.includes('context.request'),'no side-channel HTTP from the helper');
 assert.ok(!helper.includes("a('calculate').click()")&&!helper.includes("a('copy-link').click()"),'the reviewer never opens Calcular nor copies through the clipboard in this profile');
 assert.ok(browser.includes("['/api/internal-own-payroll-annulment','annulment'],")&&browser.includes('closePeriod,annulPeriodAll,prepareReceipts,'));
 assert.ok(browser.includes("w.kind==='annulment'?'annul-v2':'calculate'"),'transport evidence names the v2 annulment command');
});

// This is source custody, not an installation receipt or a runtime fallback.
for(const pin of NOELIA_ANNULMENT_SOURCE_PINS)test('the explicit M7 source successor restores its entire parent and rejects unknown drift: '+pin.path,()=>{
 const current=read(pin.path),before=projectNoeliaAnnulmentSource(pin.path,current);
 assert.equal(Buffer.byteLength(before),pin.beforeBytes);assert.equal(createHash('sha256').update(before).digest('hex'),pin.beforeSha256);
 for(const changed of [null,current+'\n',current.slice(1),before])assert.throws(()=>projectNoeliaAnnulmentSource(pin.path,changed),/NOELIA_ANNULMENT_/);
 const altered=Buffer.from(current);altered[0]^=1;assert.throws(()=>projectNoeliaAnnulmentSource(pin.path,altered.toString('utf8')),/NOELIA_ANNULMENT_CURRENT_SOURCE/);
});
test('the runtime source epoch changes only the four fully reviewed M7 sources and retains every other route and pin',()=>{
 assert.equal(NOELIA_ANNULMENT_SOURCE_PINS.length,5);
 const sourceRows=NOELIA_ANNULMENT_SOURCE_PINS.filter(pin=>pin.path!=='scripts/lib/noelia-accounting-full-source-pins.mjs');assert.equal(sourceRows.length,4);
 const file='scripts/lib/noelia-accounting-full-source-pins.mjs',old=projectNoeliaAnnulmentSource(file,read(file)),match=/export const NOELIA_ACCOUNTING_SOURCE_PINS=Object.freeze\((\{[\s\S]*?\})\);/.exec(old);assert.ok(match,'complete former source-pin map');
 const former=JSON.parse(match[1]),expected={...former};for(const pin of sourceRows){assert.equal(former[pin.path],pin.beforeSha256);expected[pin.path]=pin.afterSha256;}assert.deepEqual(NOELIA_ACCOUNTING_SOURCE_PINS,expected);
 assert.equal(projectNoeliaAnnulmentSource('unrelated','literal'),'literal');assert.equal(projectNoeliaAnnulmentSource('constructor','literal'),'literal');assert.throws(()=>projectNoeliaAnnulmentSource(null,'literal'),/SOURCE_PATH_REQUIRED/);
 for(const pin of NOELIA_ANNULMENT_SOURCE_PINS)assert.ok(Object.isFrozen(pin)&&Object.isFrozen(pin.inverse)&&pin.inverse.every(Object.isFrozen));
});


test('post-receipt liquidation QA custody admits only the exact browser successor and its one runtime pin',()=>{
 assert.equal(NOELIA_LIQUIDATION_REVIEW_SOURCE_PINS.length,2);
 const browserPin=NOELIA_LIQUIDATION_REVIEW_SOURCE_PINS.find(pin=>pin.path===BROWSER);assert.ok(browserPin);
 assert.deepEqual(CURRENT_NOELIA_ACCOUNTING_SOURCE_PINS,{...NOELIA_ACCOUNTING_SOURCE_PINS,[BROWSER]:browserPin.afterSha256},'no other runtime source pin changes');
 for(const pin of NOELIA_LIQUIDATION_REVIEW_SOURCE_PINS){
  const actual=read(pin.path),before=projectNoeliaLiquidationReviewSource(pin.path,actual);
  assert.equal(Buffer.byteLength(actual),pin.afterBytes);assert.equal(createHash('sha256').update(actual).digest('hex'),pin.afterSha256);
  assert.equal(Buffer.byteLength(before),pin.beforeBytes);assert.equal(createHash('sha256').update(before).digest('hex'),pin.beforeSha256);
  for(const changed of [null,actual+'\n',actual.slice(1),before])assert.throws(()=>projectNoeliaLiquidationReviewSource(pin.path,changed));
  const altered=Buffer.from(actual);altered[0]^=1;assert.throws(()=>projectNoeliaLiquidationReviewSource(pin.path,altered.toString('utf8')),/CURRENT_SOURCE/);
 }
});
