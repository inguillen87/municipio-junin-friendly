// Pure source/transport contracts only. No SQL, process or browser invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNoeliaCircuitQa} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {buildPositionPopulationInstallation,SQL210_SHA} from '../scripts/lib/position-population-installation.mjs';
import {buildInactiveJurisdictionInstallation} from '../scripts/lib/adoption-inactive-jurisdiction-installation.mjs';
import {pinsCheck} from '../scripts/lib/native-leave-installation.mjs';
import {composeNoeliaPosition210Sources,noeliaPosition210PhaseStatements,assertNoeliaPosition210Durability,noeliaPosition210Statement,NOELIA_POSITION210_SQL} from '../scripts/lib/noelia-position210-qa.mjs';
import {isPositionComparisonDetailV2Read} from '../scripts/lib/position-comparison-ui-qa.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replace(/\r\n?/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex'),sourceCommit='a'.repeat(40),q=v=>"'"+String(v).replaceAll("'","''")+"'";
let cached;
const context=()=>cached??=(()=>{const qa=buildNoeliaCircuitQa(18,{jurisdictions:true}),batch=buildPositionPopulationInstallation({read,sourceCommit}),plan=composeNoeliaPosition210Sources({read,sourceCommit,qa});return{qa,batch,plan};})();

test('the whole unchanged source210 producer follows the exact five adapted and27 dependency pins',()=>{
 const {qa,batch,plan}=context(),phase=noeliaPosition210PhaseStatements(plan,'after-position-v1-outputs');
 assert.equal(plan.source210Sha256,SQL210_SHA);assert.equal(batch.prerequisitePins.length,32);assert.equal(batch.previousPins.length,5);assert.equal(batch.ownPins.length,2);assert.equal(batch.migration.length,5);
 assert.deepEqual(phase.installation,batch.installation.map(qa.normalized));assert.deepEqual(phase.verification,batch.durableVerification.map(qa.normalized));
 assert.equal(phase.verification[0],'SET TRANSACTION READ ONLY');assert.equal(plan.newFunctions,2);assert.equal(plan.newTables,0);assert.equal(plan.priorFunctionsReplaced,0);assert.equal(plan.productionAuthority,false);
 assert.equal(plan.sourceHashes['scripts/migrations/210-own-position-population-proof.sql'],SQL210_SHA);
 const defs=batch.migration.filter(s=>s.startsWith('CREATE FUNCTION '));assert.equal(defs.length,2);assert.ok(defs.every(s=>!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|GRANT|REVOKE|EXECUTE)\b/i.test(s)));
 assert.deepEqual(batch.ownPins.map(p=>[p.name,p.runtime]),[['own_position_population_proof_v2',false],['position_comparison_detail_v2',true]]);
 assert.equal(batch.migration[3],'REVOKE ALL ON FUNCTION public.own_position_population_proof_v2(jsonb),public.position_comparison_detail_v2(jsonb,integer,integer,text,text) FROM PUBLIC,municontrol_actions_runtime_app');assert.equal(batch.migration[4],'GRANT EXECUTE ON FUNCTION public.position_comparison_detail_v2(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app');
 for(const p of batch.prerequisitePins)assert.ok(batch.beforeCheck.includes(p.sha256)&&batch.afterCheck.includes(p.sha256));
 for(const snapshot of [batch.before,batch.after]){for(const field of ['tables','functions','triggers','roles','memberships','defaultAcl','views'])assert.ok(snapshot.includes("'"+field+"'"));assert.ok(snapshot.includes('to_jsonb(p)::text'));assert.ok(!snapshot.includes("-'prosrc'"));assert.equal((snapshot.match(/p\.oid IS DISTINCT FROM to_regprocedure\('/g)||[]).length,2);}
 assert.ok(batch.priorAudit.includes('POSITION_POPULATION_PRIOR_STATE_CHANGED'));assert.ok(batch.mode.includes("position_comparison_%')=4")&&batch.mode.includes("position_comparison_%')=5"));
});
test('wrong phase, clone, changed210 and a source bookend change return no SQL to a recording executor',()=>{
 const {qa,plan}=context(),sent=[];
 for(const phase of [undefined,null,'seed','after-historical','after-position-v1-output'])assert.throws(()=>sent.push(noeliaPosition210PhaseStatements(plan,phase)),/NOELIA_POSITION210_PHASE_REQUIRED/);
 assert.throws(()=>sent.push(noeliaPosition210PhaseStatements({...plan},'after-position-v1-outputs')),/ORIGINAL_PLAN_REQUIRED/);assert.deepEqual(sent,[]);
 assert.throws(()=>composeNoeliaPosition210Sources({qa,sourceCommit,read:f=>read(f)+(f==='scripts/migrations/210-own-position-population-proof.sql'?'\n':'')}),/Unreviewed SQL210/);
 let changed=false;const own=composeNoeliaPosition210Sources({qa,sourceCommit,read:f=>read(f)+(changed&&f==='scripts/migrations/210-own-position-population-proof.sql'?'\n':'')});changed=true;assert.throws(()=>sent.push(noeliaPosition210PhaseStatements(own,'after-position-v1-outputs')),/SOURCE_BOOKEND/);assert.deepEqual(sent,[]);
});
test('typed RPC is the exact current real emission, with numerical year/revision and opaque JSON',()=>{
 const {qa}=context(),sql=NOELIA_POSITION210_SQL,opaque=JSON.stringify({reason:"O'Hara public. $1 $2 $3 ; \\ Área",payload:'public.position_comparison_detail_v2'}),values=[opaque,2026,1000,'2026-10','monthly'],before=structuredClone(values);
 assert.ok(read('lib/internal-position-comparison.js').includes("'detail-v2':'"+sql+"'"));
 assert.equal(noeliaPosition210Statement(sql,values,qa.schema),`SELECT ${qa.schema}.position_comparison_detail_v2(${q(opaque)}::jsonb,2026::integer,1000::integer,'2026-10'::text,'monthly'::text) AS result`);assert.deepEqual(values,before);
 assert.equal(noeliaPosition210Statement(sql,Object.freeze(values.slice()),qa.schema),noeliaPosition210Statement(sql,values,qa.schema));
 for(const text of [sql+';',sql.toLowerCase(),sql.replace('_v2','_v1'),sql.replace('::integer','::text'),sql.replace('public.',qa.schema+'.'),sql+' SELECT 1'])assert.equal(noeliaPosition210Statement(text,values,qa.schema),null);
 let called=0;for(const text of [new String(sql),{toString(){called++;return sql;},replace(){called++;return 'SELECT 1';}},null,Symbol('SQL')])assert.equal(noeliaPosition210Statement(text,values,qa.schema),null);assert.equal(called,0);
 const driver=read('scripts/lib/noelia-payroll-circuit-qa.mjs');assert.ok(driver.includes('if(position210!==null)return[{result:await db.run(position210,true)}]'));assert.ok(driver.indexOf('const position210=')<driver.indexOf('const fullDecision='));
});
test('RPC rejects sparse/extra/array-like and every non-numeric or out-of-domain integer before producing SQL',()=>{
 const {qa}=context(),values=['{}',2026,1,'2026-10','monthly'],sparse=values.slice();delete sparse[2];
 for(const v of [undefined,{},Object.assign({},values),values.slice(1),[...values,'x'],sparse,Object.assign(values.slice(),{extra:true}),Object.assign(values.slice(),{[Symbol('x')]:1})])assert.throws(()=>noeliaPosition210Statement(NOELIA_POSITION210_SQL,v,qa.schema),/ARITY/);
 for(const index of [1,2])for(const invalid of ['2026',1.5,NaN,Infinity,-Infinity,1n,null,undefined,{},index===1?1899:0,index===1?2100:1001]){const v=values.slice();v[index]=invalid;assert.throws(()=>noeliaPosition210Statement(NOELIA_POSITION210_SQL,v,qa.schema),/INTEGER/);}
 for(const index of [0,3,4]){const v=values.slice();v[index]={};assert.throws(()=>noeliaPosition210Statement(NOELIA_POSITION210_SQL,v,qa.schema),/TEXT/);}
 assert.throws(()=>noeliaPosition210Statement(NOELIA_POSITION210_SQL,values,'public'),/SCHEMA/);
});
test('the reopen fault correlates only the actual GET detail-v2 request and complete same scope',()=>{
 const expected={year:2026,revision:1,period:'2026-10',liquidationType:'monthly'},url=new URL('http://local.invalid/api/internal-position-comparison?resource=detail-v2&year=2026&revision=1&period=2026-10&liquidationType=monthly');
 assert.equal(isPositionComparisonDetailV2Read('GET',url,expected),true);
 for(const[k,value]of Object.entries({resource:'detail',year:'2025',revision:'2',period:'2026-09',liquidationType:'other'})){const u=new URL(url);u.searchParams.set(k,value);assert.equal(isPositionComparisonDetailV2Read('GET',u,expected),false,k);}
 for(const mutate of [u=>u.searchParams.append('period','2026-10'),u=>u.searchParams.set('extra','x'),u=>u.searchParams.delete('year'),u=>u.pathname='/api/other']){const u=new URL(url);mutate(u);assert.equal(isPositionComparisonDetailV2Read('GET',u,expected),false);}
 assert.equal(isPositionComparisonDetailV2Read('POST',url,expected),false);assert.equal(isPositionComparisonDetailV2Read('GET',url.href,expected),false);
 const source=read('scripts/lib/position-comparison-ui-qa.mjs');assert.ok(!source.includes("if(changeOnRead&&url.searchParams.get('resource')==='detail')"));assert.ok(source.includes("if(changeOnRead&&isPositionComparisonDetailV2Read(req.method,url,{year,revision:1,period,liquidationType:'monthly'}))"));assert.ok(source.includes('reads===2&&downloads===0'));
});
test('durability still validates exact real producer proofs; proof-shaped inputs are only validator test data',()=>{
 const {plan,batch}=context(),p={version:'own-position-population-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,predecessorVersion:'adopted-positions-installation.v2',allChecksPassed:true,newTables:0,newFunctions:2,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0,priorFingerprint:'a'.repeat(64),objectFingerprint:'b'.repeat(64)};
 assert.equal(assertNoeliaPosition210Durability({plan,installed:p,durable:structuredClone(p),repeated:structuredClone(p)}).wholeSource210,true);
 assert.throws(()=>assertNoeliaPosition210Durability({plan,installed:p,durable:{...p,priorFingerprint:'c'.repeat(64)},repeated:p}),/DURABILITY_CHANGED/);assert.throws(()=>assertNoeliaPosition210Durability({plan,installed:p,durable:p,repeated:{...p,newFunctions:3}}),/DURABILITY_CHANGED/);
});

test('whole runner inverse preserves every previous historical check and the58-row original benchmark',()=>{
 let s=read('scripts/verify-noelia-payroll-circuit.mjs');const once=(a,b)=>{assert.equal(s.split(a).length,2);s=s.replace(a,()=>b);};once("sourceCommit,qa,inactiveJurisdiction:jurisdictions}),populationPhase=","sourceCommit,qa}),populationPhase=");
 const addition="import {composeNoeliaPosition210Sources,noeliaPosition210PhaseStatements,assertNoeliaPosition210Durability} from './lib/noelia-position210-qa.mjs';\n",stage="const population210=composeNoeliaPosition210Sources({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit,qa}),populationPhase=noeliaPosition210PhaseStatements(population210,'after-position-v1-outputs'),beforePopulation=proof();run(tx([...populationPhase.installation,\"DO $$ BEGIN RAISE EXCEPTION 'QA_POSITION210_FAULT';END $$\"]),'QA_POSITION210_FAULT');assert.deepEqual(proof(),beforePopulation);ok(true,'whole source210 rehearsal preserves every prior position, payroll row and security object');const installedPopulation=JSON.parse(run(tx(populationPhase.installation))),durablePopulation=JSON.parse(run(tx(populationPhase.verification))),repeatedPopulation=JSON.parse(run(tx(populationPhase.installation)));positionResult.population210=assertNoeliaPosition210Durability({plan:population210,installed:installedPopulation,durable:durablePopulation,repeated:repeatedPopulation});fs.writeFileSync(path.join(destination,'position210-durable-proof.json'),JSON.stringify({sourceHashes:population210.sourceHashes,installed:installedPopulation,durable:durablePopulation,repeated:repeatedPopulation},null,2),{flag:'wx'});ok(true,'whole source210 adds only two durable readers after the unchanged v1 comparison and58-row benchmark');";
 assert.ok(s.indexOf('positionResult=await positionQa.outputs();')<s.indexOf(stage));assert.ok(s.indexOf(stage)<s.indexOf('const toggleClosed=',s.indexOf(stage)));assert.ok(s.indexOf(stage)<s.indexOf('positionResult.ui=await verifyComparisonUi'));
 for(const old of ['completeRows:58',"employeeNeedle:'A/3501'","expectedIdentifiers:['A/3501','0901','901']"])assert.ok(s.includes(old));
 once(addition,'');once(stage,'');assert.equal(hash(s),"33a1edf7b199b1f508ac20597b6f22ea74ef38188c1affef9fbf1ec9e2c25aad");
});


test('inactive mode projects exactly one canonical source successor in both32-pin checks, with whole-phase inverses',()=>{
 const {qa,batch}=context(),inactive=buildInactiveJurisdictionInstallation({read,sourceCommit}),plan=composeNoeliaPosition210Sources({read,sourceCommit,qa,inactiveJurisdiction:true}),phase=noeliaPosition210PhaseStatements(plan,'after-position-v1-outputs');
 assert.equal(plan.inactiveJurisdiction,true);assert.equal(plan.predecessorSuccession.unchangedOtherPins,31);assert.deepEqual(plan.predecessorSuccession.changedFields,['sha256']);assert.equal(plan.predecessorSuccession.runtime,false);
 const overlaps=batch.prerequisitePins.flatMap((p,index)=>inactive.beforePins.flatMap((before,n)=>p.signature===before.signature?[{p,index,before,after:inactive.afterPins[n]}]:[]));assert.equal(overlaps.length,1);const [{p,index,before,after}]=overlaps;assert.deepEqual(p,before);assert.deepEqual({...before,sha256:null},{...after,sha256:null});assert.equal(p.signature,plan.predecessorSuccession.signature);assert.equal(after.sha256,plan.predecessorSuccession.afterSha256);
 const changed=batch.prerequisitePins.map((pin,n)=>n===index?after:pin),prior=qa.normalized(pinsCheck(batch.prerequisitePins,'POSITION_POPULATION_PREDECESSOR_CHANGED')),next=qa.normalized(pinsCheck(changed,'POSITION_POPULATION_PREDECESSOR_CHANGED'));
 assert.ok(prior.includes('83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa'));assert.ok(next.includes('47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672'));assert.ok(!next.includes(before.sha256),'active mode refuses the former body instead of accepting old-or-new');
 for(const[field,original]of [['installation',batch.installation],['verification',batch.durableVerification]]){const projected=phase[field];assert.equal(projected.filter(s=>s.includes(next)).length,2);assert.ok(projected.every(s=>!s.includes(prior)));assert.deepEqual(projected.map(s=>s.includes(next)?s.replace(next,()=>prior):s),original.map(qa.normalized));}
 assert.deepEqual(phase.installation.filter(s=>s.startsWith('DO $apply$')),batch.installation.map(qa.normalized).filter(s=>s.startsWith('DO $apply$')),'whole210 migration and literal ACL are unchanged');
 assert.deepEqual(plan.predecessorSuccession.sourceHashes,inactive.sourceHashes);assert.equal(plan.predecessorSuccession.wholePhaseInverseVerified,true);
 const defaultPlan=composeNoeliaPosition210Sources({read,sourceCommit,qa}),defaultPhase=noeliaPosition210PhaseStatements(defaultPlan,'after-position-v1-outputs');assert.equal(defaultPlan.inactiveJurisdiction,false);assert.equal(defaultPlan.predecessorSuccession,null);assert.deepEqual(defaultPhase.installation,batch.installation.map(qa.normalized));assert.deepEqual(defaultPhase.verification,batch.durableVerification.map(qa.normalized));
});
test('inactive successor authority and explicit mode cannot be supplied by foreign source bytes or metadata',()=>{
 const {qa}=context(),authority='scripts/lib/adoption-inactive-jurisdiction-installation.mjs';
 for(const value of ['true',null,1,{},[]])assert.throws(()=>composeNoeliaPosition210Sources({read,sourceCommit,qa,inactiveJurisdiction:value}),/INACTIVE_MODE_REQUIRED/);
 for(const changed of [s=>s+'\n',s=>s.replace('PAYROLL_FIXED_JURISDICTION_REQUIRED','OTHER_GUARD'),s=>s.replace('runtime:beforePins[i].runtime','runtime:true')])assert.throws(()=>composeNoeliaPosition210Sources({read:f=>f===authority?changed(read(f)):read(f),sourceCommit,qa,inactiveJurisdiction:true}),/INACTIVE_SOURCE_CHANGED/);
 const untouched=read(authority);assert.ok(untouched.includes("IF c.jurisdiction_code IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_JURISDICTION_REQUIRED';END IF;"));
});

test('R2 runner changes only one explicit derived mode argument after the same historical boundary',()=>{
 const s=read('scripts/verify-noelia-payroll-circuit.mjs'),from="sourceCommit,qa,inactiveJurisdiction:jurisdictions}),populationPhase=",to="sourceCommit,qa}),populationPhase=";assert.equal(s.split(from).length,2);assert.equal(hash(s.replace(from,()=>to)),"ced438ae35a90d9b1a91a2e7e68a71761aea94e6b1ec739d0b303196209253dd");assert.ok(s.indexOf(from)>s.indexOf('positionResult=await positionQa.outputs();'));
});
