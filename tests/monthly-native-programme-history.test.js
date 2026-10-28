// Proposed pure regressions. Synthetic source fixtures, never native evidence.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const blocked=()=>{throw Error('HISTORY_UNIT_IO_FORBIDDEN');};for(const[m,keys]of[[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['get','request','createServer']],[https,['get','request','createServer']],[dns,['lookup','resolve']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const k of keys)m[k]=blocked;globalThis.fetch=blocked;syncBuiltinESMExports();
const {monthlyNativeHistoryCatalogItems,monthlyNativeHistoryProgramme,monthlyNativeHistoryPublished,assertMonthlyNativeHistoryCapture}=await import('./fixtures/monthly-native-programme-history-synthetic.js');
const {monthly194SqlFixture}=await import('./fixtures/own-monthly-day-engine-source-sql-synthetic.js');
const {monthlyNativeFullCycleFixture}=await import('./fixtures/own-monthly-native-full-cycle-synthetic.js');
const {monthlyFixedSqlFixture}=await import('../scripts/lib/own-monthly-day-fixed-composition-qa.mjs');
const {ownProgramHistory,ownProgramRuleKey,ownProgramDefinition}=await import('../assets/own-payroll-program-model.js');
const {salarySerialized}=await import('../assets/native-salary-catalog-model.js');
const {fixedForcedExpressionSet}=await import('../assets/own-payroll-engine.js');
const {monthlyDayEngineSources,sealMonthlyDayEngine}=await import('./fixtures/own-monthly-day-engine-synthetic.js');
const {approvedSources}=await import('./fixtures/own-payroll-approved-synthetic.js');
const {fixedFixture,fixedApprovedRecord,fixedNativeSubject}=await import('./fixtures/payroll-fixed-novelties-synthetic.js');
const {prepareOwnPayrollInput}=await import('../lib/own-payroll-approved-input.js');
const {calculateOwnPayroll}=await import('../assets/own-payroll-engine.js');
const {createHash}=await import('node:crypto'),hash=x=>createHash('sha256').update(salarySerialized(x)).digest('hex');
const clone=structuredClone,key=r=>ownProgramRuleKey(r,'own-payroll-namespaces.v2'),active=p=>p.rules.filter(r=>r.validFrom<='2026-10'&&(r.validUntil===null||r.validUntil>='2026-10'));
function setup(){const base=monthly194SqlFixture(),six=monthlyNativeFullCycleFixture(),items=monthlyNativeHistoryCatalogItems([...monthlyFixedSqlFixture().items,...six.items]),b0=monthlyNativeHistoryProgramme({before:null,template:base.definition,catalogItems:items}),joint=monthlyNativeHistoryProgramme({before:b0,template:six.definition,catalogItems:items}),restored=monthlyNativeHistoryProgramme({before:joint,template:base.definition,catalogItems:items});return{base,six,items,b0,joint,restored};}
function sources(programme,items,{days='30',amount=null,forced=false}={}){
 const s=monthlyDayEngineSources([days],{typedOnly:true}),e=s.population.employees[0];s.programState.program.definition=clone(programme);s.programState.salaryCatalog.items=clone(items);s.monthly=amount===null?{complete:true,batches:[]}:approvedSources(1).monthly;if(amount!==null)s.monthly.batches[0].rows[0].amountCents=amount;
 if(forced){const f=fixedFixture(),record=fixedApprovedRecord(1,{conceptSourceId:'110',quantityDecimal:null,amountCents:'2500',forced:true,forcedReason:'Importe25 exclusivamente sintético de unidad',validFrom:'2026-10-01',validTo:'2026-10-31'});record.subject={...fixedNativeSubject(e.employeeNumber),contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken};f.state.records.push(record);s.fixed={list:{ok:true,data:f.list('2026-10-01')},export:{ok:true,data:f.exporter('2026-10-01')}};}
 return sealMonthlyDayEngine(s);
}
test('new authored September coverage retains all B0 identities and exactly six active October rules without mutating inputs',()=>{
 const base=monthly194SqlFixture(),six=monthlyNativeFullCycleFixture(),raw=[...monthlyFixedSqlFixture().items,...six.items],snapshot=clone({base,six,raw}),items=monthlyNativeHistoryCatalogItems(raw),b0=monthlyNativeHistoryProgramme({before:null,template:base.definition,catalogItems:items}),joint=monthlyNativeHistoryProgramme({before:b0,template:six.definition,catalogItems:items}),restored=monthlyNativeHistoryProgramme({before:joint,template:base.definition,catalogItems:items}),x={base,six,items,b0,joint,restored};assert.deepEqual({base,six,raw},snapshot);assert.equal(x.b0.rules.length,3);assert.equal(x.joint.rules.length,9);assert.equal(active(x.joint).length,6);assert.equal(active(x.restored).length,3);
 assert.ok(x.items.every(r=>r.validFrom==='2026-09'));assert.ok(x.joint.rules.every(r=>r.validFrom==='2026-09'&&r.validUntil>=r.validFrom));assert.deepEqual(x.joint.rules.filter(r=>r.code.startsWith('9194')).map(r=>r.validUntil),['2026-09','2026-09','2026-09']);assert.deepEqual(x.restored.rules.filter(r=>!r.code.startsWith('9194')).map(r=>r.validUntil),Array(6).fill('2026-09'));
 for(const p of[x.b0,x.joint,x.restored])ownProgramDefinition(p,x.items);ownProgramHistory(x.b0,x.joint);ownProgramHistory(x.joint,x.restored);
 assert.throws(()=>ownProgramHistory(x.b0,x.six.definition),{name:'OwnPayrollError',code:'PROGRAM_HISTORY_REQUIRED'});const missing=clone(x.joint);missing.rules=missing.rules.filter(r=>r.code!=='919400');assert.throws(()=>ownProgramHistory(x.b0,missing),{name:'OwnPayrollError',code:'PROGRAM_HISTORY_REQUIRED'});
 assert.throws(()=>monthlyNativeHistoryProgramme({before:base.definition,template:six.definition,catalogItems:x.items}),/PREEXISTING_PROGRAMME_STOP/);
});
test('forced policies and complete lineage survive restoration; repeating a full revision is an actual no-op candidate',()=>{
 const x=setup(),again=monthlyNativeHistoryProgramme({before:x.restored,template:x.base.definition,catalogItems:x.items});assert.deepEqual(again,x.restored);assert.equal(salarySerialized(again),salarySerialized(x.restored));assert.deepEqual(x.restored.fixedForcedAmountsPolicy.policies,x.joint.fixedForcedAmountsPolicy.policies);
 assert.equal(x.restored.fixedForcedAmountsVersion,'own-fixed-forced-amount.v1');assert.equal(x.restored.fixedForcedAmountsPolicy.quantityLineage.expressionSetSha256,hash(fixedForcedExpressionSet(x.restored.rules,x.restored.fixedForcedAmountsPolicy.policies)));assert.equal(x.restored.fixedForcedAmountsPolicy.quantityLineage.complete,true);
 const mutated=clone(x.six.definition);mutated.rules[0].rounding.mode='half_up';assert.throws(()=>monthlyNativeHistoryProgramme({before:x.b0,template:mutated,catalogItems:x.items}),/NEW_RULE_EXACT_REQUIRED/);
 const wrong=clone(x.restored);wrong.fixedForcedAmountsPolicy.policies=[];assert.throws(()=>ownProgramHistory(x.restored,wrong),{name:'OwnPayrollError',code:'PROGRAM_HISTORY_REQUIRED'});
});
test('real source adapter and rational engine retain 300/160, six rows345, and 325/350 correction amounts',()=>{
 const x=setup(),before=clone(x),result=(p,options)=>calculateOwnPayroll(prepareOwnPayrollInput(sources(p,x.items,options)));
 assert.equal(result(x.b0).employeeTotals[0].net,'300.00000000');assert.equal(result(x.restored,{days:'16'}).employeeTotals[0].net,'160.00000000');
 const first=result(x.joint,{amount:'2000',forced:true});assert.equal(first.rowCount,6);assert.equal(first.employeeTotals[0].net,'345.00');
 const correction=clone(x.six.definition);correction.bindings.find(b=>b.key==='nativeNovelty').onMissing='zero';const programme=monthlyNativeHistoryProgramme({before:x.joint,template:correction,catalogItems:x.items});assert.equal(result(programme,{forced:true}).employeeTotals[0].net,'325.00');assert.equal(result(programme,{amount:'2500',forced:true}).employeeTotals[0].net,'350.00');assert.deepEqual(x,before);
});
test('generic157/fullMonth192 append complete history and policies; versions bind all rules even when active amounts match',()=>{
 const x=setup(),forced=monthlyNativeHistoryProgramme({before:x.restored,template:monthlyFixedSqlFixture({forced:true}).definition,catalogItems:x.items}),generic=monthlyNativeHistoryProgramme({before:forced,template:monthlyFixedSqlFixture({forced:true,generic:true}).definition,catalogItems:x.items}),full=monthlyNativeHistoryProgramme({before:generic,template:monthlyFixedSqlFixture({forced:true,generic:true,fullMonth192:true}).definition,catalogItems:x.items});
 ownProgramHistory(forced,generic);ownProgramHistory(generic,full);assert.equal(full.monthlyDaysVersion,'own-monthly-day-facts.v2');assert.equal(full.monthlyDayDeclarationVersion,'own-monthly-approved-days.v1');assert.ok(full.bindings.some(b=>b.sourceKind==='period_fact'));assert.ok(full.rules.every(r=>r.validUntil>=r.validFrom));assert.deepEqual(full.fixedForcedAmountsPolicy.policies,forced.fixedForcedAmountsPolicy.policies);
 const bootstrap={program:{revision:7,version:'a'.repeat(64),definition:full},salaryCatalog:{items:x.items}},published=monthlyNativeHistoryPublished(bootstrap),capture={body:{programVersion:published.latestProgramVersion},payload:{programState:{program:{version:published.latestProgramVersion,definition:clone(full)}}}};assert.equal(assertMonthlyNativeHistoryCapture(capture,published),true);
 const changed=clone(capture);changed.payload.programState.program.definition.rules.find(r=>r.validUntil==='2026-09').ruleReference+=' altered';assert.throws(()=>assertMonthlyNativeHistoryCapture(changed,published),/JOINT_CAPTURED_PROGRAMME_CHANGED/);
 const stale=clone(capture);stale.body.programVersion='b'.repeat(64);assert.throws(()=>assertMonthlyNativeHistoryCapture(stale,published),/JOINT_CAPTURED_PROGRAMME_VERSION_CHANGED/);
});
test('integration uses complete approved programme descriptors and preserves the old-version negative and actual API commands',()=>{
 const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),runner=read('scripts/lib/monthly-native-full-circuit-runner-qa.mjs'),outer=read('scripts/verify-own-monthly-day-engine-source.mjs'),behavior=read('scripts/lib/own-monthly-day-engine-behavior-qa.mjs');
 assert.ok(runner.includes('restoredProgrammeSha256:restoredProgramme.programmeSha256'));assert.ok(runner.includes("deniedOne.code,'OWN_PROGRAM_HISTORY_REQUIRED'"));assert.ok(runner.includes('salarySerialized(programme)===salarySerialized(boot.program.definition)'));
 assert.ok(outer.includes('return monthlyNativeHistoryCatalogItems(items)'));assert.ok(outer.includes('latestProgramme=monthlyNativeHistoryPublished(published,programme)'));assert.ok(behavior.includes('assert.notEqual(latestRunBootstrap.programVersion,captureBody.programVersion)'));assert.ok(behavior.includes('body:captureBody,key:randomUUID()'));assert.ok(behavior.includes('capacity.contracts[600]'));assert.ok(behavior.includes('assertMonthlyNativeHistoryCapture(result,latest)'));
});
