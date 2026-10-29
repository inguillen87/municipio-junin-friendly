// Pure source and recording assertions; no SQL, browser or provider execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {composeOwnReportFullQaSources} from '../scripts/lib/own-payroll-report-full-qa.mjs';
import {composeNoeliaCurrentFullQaSources,noeliaCurrentFullQaPhaseStatements,noeliaCurrentFullQaSeed,noeliaFullDecisionStatement,NOELIA_FULL_DECISION_STATEMENTS} from '../scripts/lib/noelia-current-full-qa.mjs';
import {buildNoeliaCircuitQa} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {qaLiteral as q} from '../scripts/lib/own-payroll-durable-qa.mjs';
import {projectNoeliaAccountingRunnerSource} from './fixtures/noelia-accounting-full-runner-source-projection.js';
const read=p=>projectNoeliaAccountingRunnerSource(p,fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n')),schema='mc_qa_fixed_092_'+'d'.repeat(32),sourceCommit='a'.repeat(40),hash=s=>createHash('sha256').update(s).digest('hex');
let f,p,j;
const full=()=>f??=composeOwnReportFullQaSources({read,sourceCommit,schema});
const plan=()=>p??=composeNoeliaCurrentFullQaSources({read,sourceCommit,schema,jurisdictions:true});
const without=()=>j??=composeNoeliaCurrentFullQaSources({read,sourceCommit,schema,jurisdictions:false});
const guard=`DO $report_native_period$ BEGIN IF EXISTS(SELECT 1 FROM ${schema}.own_period_classification_event) OR EXISTS(SELECT 1 FROM ${schema}.own_payroll_run_capture) THEN RAISE EXCEPTION 'REPORT_FULL_QA_PERIOD_FIXTURE_NOT_EMPTY';END IF;END $report_native_period$`;
test('the same producer partitions the identical nineteen statements without weakening the empty-capture guard',()=>{
 const v=full();assert.equal(v.nativePeriodPrerequisites.length,14);assert.equal(v.decisionPrerequisites.length,4);assert.equal(v.jurisdictionPrerequisites.length,1);assert.deepEqual(v.prerequisites,[...v.jurisdictionPrerequisites,...v.nativePeriodPrerequisites,...v.decisionPrerequisites]);
 assert.equal(v.nativePeriodPrerequisites.at(-1),guard);assert.equal(v.prerequisites.length,19);assert.equal(v.preLocal.length,11);assert.equal(v.postLocal.length,27);
 const early=noeliaCurrentFullQaPhaseStatements(plan(),'seed-empty'),late=noeliaCurrentFullQaPhaseStatements(plan(),'after-historical');assert.deepEqual(early,v.nativePeriodPrerequisites);assert.ok(!early.some(s=>s.includes('$capacity_preflight$')||s.startsWith('CREATE OR REPLACE FUNCTION '+schema+'.own_close_')));assert.ok(!late.installation.includes(guard),'the early empty-capture guard is never re-executed against history');
 for(const s of [...v.decisionPrerequisites,...v.installation])assert.ok(late.installation.includes(s),'every late source statement remains exact');assert.ok(late.verification.includes(v.afterGuard));assert.ok(late.installation.includes(v.local201));
 assert.ok(!early.some(s=>/\bGRANT\b|FUNCTION .*own_period_classification_(?:command|bootstrap|detail|attempt)_v1\(/.test(s)));assert.equal(plan().nativePeriodPins.length,5);assert.equal(plan().institutionalAuthority200Proven,false);assert.equal(plan().productionAuthority,false);assert.equal(plan().newSeedCount,0);assert.equal(plan().newDatabaseCount,0);
 assert.ok(late.installation.some(s=>s.includes('NOELIA_FULL_QA_PERIOD_EPOCH_CHANGED')&&s.includes('periodClassifications')));assert.ok(late.installation.some(s=>s.includes('NOELIA_FULL_QA_NATIVE_PERIOD_CHANGED')));
});
test('the original complete twenty-nine-person seed gets only the early real177 closure, with exact whole inverse',()=>{
 const qa=buildNoeliaCircuitQa(17,{jurisdictions:true}),original=qa.sql,own=composeNoeliaCurrentFullQaSources({read,sourceCommit,schema:qa.schema,jurisdictions:true}),early=noeliaCurrentFullQaPhaseStatements(own,'seed-empty'),addition=early.map(s=>'EXECUTE '+q(s)+';').join('\n')+'\n',seed=noeliaCurrentFullQaSeed(original,own);
 assert.equal(seed.split(addition).length,2);assert.equal(seed.replace(addition,''),original);assert.equal(qa.completePopulation,29);assert.equal(qa.sql,original);assert.equal(seed.split('    END $seed$; COMMIT;').length,2);assert.ok(seed.indexOf(addition)<seed.indexOf('    END $seed$; COMMIT;'));assert.equal(early.at(-1).replaceAll(qa.schema,schema),guard);assert.ok(!addition.includes('CREATE OR REPLACE FUNCTION '+qa.schema+'.own_run_capture_v1'));
 assert.throws(()=>noeliaCurrentFullQaSeed(seed,own),/NOELIA_FULL_QA_PERIOD_ALREADY_IN_SEED/);assert.throws(()=>noeliaCurrentFullQaSeed(original.replace('    END $seed$; COMMIT;','END $seed$; COMMIT;'),own),/NOELIA_FULL_QA_SEED_ANCHOR_CHANGED/);
});
test('original jurisdiction is checked instead of replaced; absent jurisdiction installs its exact source',()=>{
 const original=full(),yes=noeliaCurrentFullQaPhaseStatements(plan(),'after-historical'),no=noeliaCurrentFullQaPhaseStatements(without(),'after-historical');assert.ok(!yes.installation.includes(original.jurisdictionPrerequisites[0]));assert.ok(yes.installation.some(s=>s.includes('NOELIA_FULL_QA_EXISTING_JURISDICTION_CHANGED')));assert.ok(no.installation.includes(original.jurisdictionPrerequisites[0]));assert.ok(no.verification.some(s=>s.includes('NOELIA_FULL_QA_EXISTING_JURISDICTION_CHANGED')));
});
test('wrong phase, cloned plan and changed source fail before a recording executor can receive SQL',()=>{
 const calls=[],record=s=>calls.push(s);for(const phase of [undefined,null,'install','after-history','seed'])assert.throws(()=>record(noeliaCurrentFullQaPhaseStatements(plan(),phase)),/NOELIA_FULL_QA_PHASE_REQUIRED/);assert.throws(()=>record(noeliaCurrentFullQaPhaseStatements({...plan()},'after-historical')),/NOELIA_FULL_QA_ORIGINAL_PLAN_REQUIRED/);assert.deepEqual(calls,[]);
 assert.throws(()=>composeNoeliaCurrentFullQaSources({read,sourceCommit,schema,jurisdictions:'true'}),/NOELIA_FULL_QA_JURISDICTIONS_REQUIRED/);assert.throws(()=>composeNoeliaCurrentFullQaSources({read:p=>p==='scripts/migrations/201-own-full-payroll-decision-capacity.sql'?read(p)+'\n-- changed':read(p),sourceCommit,schema,jurisdictions:true}),/REPORT_FULL_QA_SOURCE_CHANGED/);
});
test('seven exact real full/census emissions relocate identifiers before opaque values and delegate all other texts',()=>{
 const opaque=JSON.stringify({reason:"O'Hara public. $1 $2; \\ Área",payload:{literal:'public.own_close_detail_v1'}}),id='88888888-8888-4888-8888-888888888888';
 for(const [text,size]of Object.entries(NOELIA_FULL_DECISION_STATEMENTS)){
  const values=Array.from({length:size},(_,i)=>i===0?opaque:text.includes('$2::jsonb')&&i===1?opaque:i===1&&text.includes('$2::text')?'2026-10':i===2&&text.includes('$3::text')?'monthly':id),before=structuredClone(values),rendered=noeliaFullDecisionStatement(text,values,schema);
  assert.equal(rendered,text.replace('public.',schema+'.').replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1])));assert.ok(rendered.includes(q(opaque)));assert.deepEqual(values,before);assert.ok(!rendered.includes(schema+'.own_close_detail_v1\"'));
  for(const changed of [text+';',text.replace('public.','other.'),text.replace('_v1','_v2'),text.replace('::jsonb','::text'),text.toLowerCase()])assert.equal(noeliaFullDecisionStatement(changed,values,schema),null);
  const sparse=values.slice();delete sparse[0];for(const invalid of [values.slice(1),[...values,'x'],sparse,Object.assign(values.slice(),{extra:'x'}),values.map((v,i)=>i===0?{}:v)])assert.throws(()=>noeliaFullDecisionStatement(text,invalid,schema),/NOELIA_FULL_QA_RPC_VALUES/);
 }
 assert.equal(noeliaFullDecisionStatement('SELECT public.own_close_detail_v1($1::jsonb,$2::text,$3::text) AS result',['{}','2026-10','monthly'],schema),null);assert.throws(()=>noeliaFullDecisionStatement(Object.keys(NOELIA_FULL_DECISION_STATEMENTS)[0],['{}',id],'public'),/NOELIA_FULL_QA_SCHEMA/);
 const driver=read('scripts/lib/noelia-payroll-circuit-qa.mjs');assert.ok(driver.includes('if(fullDecision!==null)return[{result:await db.run(fullDecision,true)}]'));assert.ok(driver.indexOf('const fullDecision=')<driver.indexOf('const nativeEmployee=',driver.indexOf('const fullDecision=')));
});
test('the runner preserves every original assertion byte for byte and installs the full source only after the date boundary',()=>{
 const restorePosition210=source=>{let s=source;const once=(a,b)=>{assert.equal(s.split(a).length,2);s=s.replace(a,()=>b);};once("sourceCommit,qa,inactiveJurisdiction:jurisdictions}),populationPhase=","sourceCommit,qa}),populationPhase=");once("import {composeNoeliaPosition210Sources,noeliaPosition210PhaseStatements,assertNoeliaPosition210Durability} from './lib/noelia-position210-qa.mjs';\n",'');once("const population210=composeNoeliaPosition210Sources({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit,qa}),populationPhase=noeliaPosition210PhaseStatements(population210,'after-position-v1-outputs'),beforePopulation=proof();run(tx([...populationPhase.installation,\"DO $$ BEGIN RAISE EXCEPTION 'QA_POSITION210_FAULT';END $$\"]),'QA_POSITION210_FAULT');assert.deepEqual(proof(),beforePopulation);ok(true,'whole source210 rehearsal preserves every prior position, payroll row and security object');const installedPopulation=JSON.parse(run(tx(populationPhase.installation))),durablePopulation=JSON.parse(run(tx(populationPhase.verification))),repeatedPopulation=JSON.parse(run(tx(populationPhase.installation)));positionResult.population210=assertNoeliaPosition210Durability({plan:population210,installed:installedPopulation,durable:durablePopulation,repeated:repeatedPopulation});fs.writeFileSync(path.join(destination,'position210-durable-proof.json'),JSON.stringify({sourceHashes:population210.sourceHashes,installed:installedPopulation,durable:durablePopulation,repeated:repeatedPopulation},null,2),{flag:'wx'});ok(true,'whole source210 adds only two durable readers after the unchanged v1 comparison and58-row benchmark');",'');return s;};
 const restoreSuccession=(source)=>{let s=source;const once=(a,b)=>{assert.equal(s.split(a).length,2);s=s.replace(a,()=>b);};
 once('sourceCommit,schema:qa.schema,jurisdictions,successionRead:true}):null,batch=','sourceCommit,schema:qa.schema,jurisdictions}):null,batch=');
 once('let current=maker,datedReadyForSuccession=null,successionRead197=null,browserQa,','let current=maker,browserQa,');
 once('\n   datedReadyForSuccession=Object.freeze({readyDefinition:ready,readyPin});','');
 once("noeliaCurrentFullQaPhaseStatements(fullQa,'after-historical',datedReadyForSuccession)","noeliaCurrentFullQaPhaseStatements(fullQa,'after-historical')");
 once(";successionRead197=fullPhase.successionRead197;",';');once('oldResultPreserved:true,successionRead197,fullDecisionQa:','oldResultPreserved:true,fullDecisionQa:');return s;};
 let s=restoreSuccession(restorePosition210(read('scripts/verify-noelia-payroll-circuit.mjs')));const stage=s.slice(s.indexOf('  // All original rollback, jurisdiction, positions and date assertions above\n'),s.indexOf("  const list=await api('novelty',{resource:'bootstrap'});ok(list.subjects.length===29"));assert.ok(stage.includes("noeliaCurrentFullQaPhaseStatements(fullQa,'after-historical')"));assert.ok(stage.includes("run(tx(['SET TRANSACTION READ ONLY',...fullPhase.verification]))"));
 const boundary=s.indexOf('actual date protocol preserves the earlier body/key/result and never invents a historical date');assert.ok(boundary<s.indexOf(stage));assert.ok(s.indexOf(stage)<s.indexOf("const list=await api('novelty',{resource:'bootstrap'});ok(list.subjects.length===29"));
 const once=(from,to)=>{assert.equal(s.split(from).length,2);s=s.replace(from,()=>to);};
 once("import {composeNoeliaCurrentFullQaSources,noeliaCurrentFullQaSeed,noeliaCurrentFullQaPhaseStatements} from './lib/noelia-current-full-qa.mjs';\n",'');
 once("const qa=buildNoeliaCircuitQa(major,{jurisdictions}),fullQa=browser!=='none'?composeNoeliaCurrentFullQaSources({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit,schema:qa.schema,jurisdictions}):null,batch=","const qa=buildNoeliaCircuitQa(major,{jurisdictions}),batch=");once('run(fullQa?noeliaCurrentFullQaSeed(qa.sql,fullQa):qa.sql);seeded=true;','run(qa.sql);seeded=true;');once(stage,'');
 once('fullDecisionQa:fullQa?{version:fullQa.version,source201Sha256:fullQa.source201Sha256,sourceHashes:fullQa.sourceHashes,fullFunctions:fullQa.fullFunctions,sourcePredecessors:fullQa.sourcePredecessors,sourcePostdecessors:fullQa.sourcePostdecessors,institutionalAuthority200Proven:false,productionAuthority:false}:null,','');
 assert.equal(hash(s),'f20351c3600d026be0e54f3c5b9f982c2b368872ea72319f8a643ace308ac98a','whole original runner, including every historical guard/assertion and complete cohort, must be recoverable');
});

test('non-string SQL cannot use coercion or custom replacement to escape the finite real-text router',()=>{
 const known=Object.keys(NOELIA_FULL_DECISION_STATEMENTS)[0];let coerced=0,replaced=0;const object={toString(){coerced++;return known;},replace(){replaced++;return 'SELECT 1';}};
 for(const text of [object,new String(known),null,undefined,42,Symbol('sql'),Object.create(null)])assert.equal(noeliaFullDecisionStatement(text,['{}','88888888-8888-4888-8888-888888888888'],schema),null);
 assert.equal(coerced,0);assert.equal(replaced,0);
});
