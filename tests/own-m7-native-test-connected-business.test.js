// Pure closed-scenario/oracle/negative tests. No test supplies successful native
// results or connects a recording client to simulate business acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const forbidden=()=>{throw Error('M7_CONNECTED_BUSINESS_UNIT_EXTERNAL_IO_FORBIDDEN');};
globalThis.fetch=forbidden;net.connect=net.createConnection=net.Socket.prototype.connect=forbidden;tls.connect=forbidden;
http.request=http.get=http.createServer=https.request=https.get=https.createServer=forbidden;dns.lookup=dns.resolve=forbidden;
for(const key of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])child[key]=forbidden;
syncBuiltinESMExports();
const {ownM7NativeTestConnectedOracle:oracle,ownM7NativeTestConnectedRunBody:runBody,ownM7NativeTestConnectedReceiptParams:receiptParams,runOwnM7NativeTestConnectedBusiness:business,OWN_M7_NATIVE_TEST_CONNECTED_BUSINESS_VERSION:version,OWN_M7_NATIVE_TEST_CONNECTED_PROTOCOL:protocol,OWN_M7_NATIVE_TEST_CONNECTED_RUN_OPTIONS:runOptions}=await import('../scripts/lib/own-m7-native-test-connected-business.mjs');
const {buildOwnM7NativeTestConnectedFixturePlan}=await import('../scripts/lib/own-m7-native-test-connected-fixture.mjs');
const {programOwnerQaDefinition}=await import('./fixtures/municipal-owner-program-synthetic.js');
const {ownAnnulPreparationOperation}=await import('../lib/internal-own-payroll-annulment-preparation.js');
const root=new URL('../',import.meta.url),readRaw=file=>fs.readFileSync(new URL(file,root)),copy=value=>JSON.parse(JSON.stringify(value));
const uuid='00000000-0000-4000-8000-000000000001';
const admission=()=>({version:'own-release-annulment-atomic-test-target.v1',kind:'test',target:{major:17,projectId:'noisy-poetry-54471701',branchId:'br-connected-business-unit',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-connected-business-unit.sa-east-1.aws.neon.tech',endpointId:'ep-connected-business-unit',kind:'test',parentBranchId:'br-plain-dust-acpjgebb'},parentBranchId:'br-plain-dust-acpjgebb',branchCreation:{bytes:123,sha256:'9'.repeat(64)}});
const build=()=>buildOwnM7NativeTestConnectedFixturePlan({readRaw,sourceCommit:'2501a42d2524cb72568d06c74d41e29d6b36185b',testTargetAdmission:admission(),runId:'connected-business-unit'});
const bootstrap=()=>({version:'own-payroll-bootstrap.v2',scopeVersion:'a'.repeat(64),programVersion:'b'.repeat(64),canCalculate:true,runs:[],complete:true});
const runInput=()=>({bootstrap:bootstrap(),period:'2026-10',liquidationType:'monthly',liquidationDate:'2026-10-28',beneficiaryId:uuid});

test('closed canonical oracle independently expects basic100.10 and month10 without summing auxiliary into money',()=>{
 const result=oracle(programOwnerQaDefinition(),'2026-10');
 assert.deepEqual(result.rows,[{conceptCode:'1',nature:'remuneration',unit:'money',amount:'100.10'},{conceptCode:'101',nature:'auxiliary',unit:'units',amount:'10'}]);
 assert.deepEqual(result.totals,{remuneration:'100.10',non_remuneration:'0.00',deduction:'0.00',employer_contribution:'0.00',gross:'100.10',net:'100.10'});assert.equal(result.month,'10');
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.rows)&&Object.isFrozen(result.rows[0])&&Object.isFrozen(result.totals));
});

test('oracle refuses another period, literal, precision or binding instead of guessing a new programme',()=>{
 assert.throws(()=>oracle(programOwnerQaDefinition(),'2026-11'),/CANONICAL_PERIOD_REQUIRED/);
 for(const mutate of [p=>p.rules[0].expression.value='999',p=>p.totalsPrecision=4,p=>p.bindings[0].sourceField='dayOfMonth',p=>p.rules.push({...p.rules[0],code:'2'})]){
  const value=copy(programOwnerQaDefinition());mutate(value);assert.throws(()=>oracle(value,'2026-10'),/CANONICAL_PROGRAM_REQUIRED/);
 }
});

test('new run body uses the supplied server day, fresh versions and only the beneficiary contract',()=>{
 const input=runInput(),before=copy(input),body=runBody(input);
 assert.deepEqual(body,{version:'own-payroll-run-command.v2',period:'2026-10',liquidationType:'monthly',liquidationDate:'2026-10-28',selection:{kind:'contracts',values:[uuid]},scopeVersion:'a'.repeat(64),programVersion:'b'.repeat(64),populationDomain:'native_registered'});
 assert.deepEqual(input,before);assert.equal(Object.hasOwn(body,'sourceReference'),false);assert.equal(Object.hasOwn(body,'reviewConfirmed'),false);assert.ok(Object.isFrozen(body)&&Object.isFrozen(body.selection.values));
 const next=runInput();next.bootstrap.scopeVersion='c'.repeat(64);next.bootstrap.programVersion='d'.repeat(64);assert.equal(runBody(next).scopeVersion,'c'.repeat(64));assert.equal(runBody(next).programVersion,'d'.repeat(64));
 assert.equal(version,'own-m7-native-test-connected-business.v2');assert.equal(protocol,'published-monthly-fixed-v1');assert.deepEqual(runOptions,{fullJson:true});assert.equal(Object.hasOwn(runOptions,'fixedV2'),false);assert.ok(Object.isFrozen(runOptions));
});

test('run contract refuses all-scope overrides, projected receipt fields, undated bootstrap and invalid date before SQL',()=>{
 for(const patch of [{selection:{kind:'all',values:[]}},{sourceReference:{}},{reviewConfirmed:true}])assert.throws(()=>runBody({...runInput(),...patch}),/RUN_OPTIONS/);
 const old=runInput();old.bootstrap.version='own-payroll-bootstrap.v1';assert.throws(()=>runBody(old));
 const denied=runInput();denied.bootstrap.canCalculate=false;assert.throws(()=>runBody(denied));
 assert.throws(()=>runBody({...runInput(),liquidationDate:'2026-02-30'}));assert.throws(()=>runBody({...runInput(),beneficiaryId:'unknown'}));
});

test('receipt preview params declare only a synthetic issuer and the beneficiary, without adding permissions',()=>{
 const plan=build(),before=copy(plan.actors),params=receiptParams({plan,beneficiaryId:uuid});assert.equal(plan.protocol,protocol);assert.equal(plan.fullfixedV2Pending,true);assert.equal(plan.businessScenario.protocol,protocol);assert.equal(plan.businessScenario.fullfixedV2Pending,true);assert.deepEqual(plan.businessScenario.runDependencies,runOptions);
 assert.equal(params.period,'2026-10');assert.deepEqual(params.types,['monthly']);assert.deepEqual(params.contracts,[uuid]);assert.equal(params.paymentDate,null);
 assert.equal(params.issuer.name,plan.issuer.name);assert.equal(params.issuer.taxId,plan.subjects.find(row=>row.key==='maker').draft.cuil);assert.ok(params.issuer.address.includes('EXCLUSIVAMENTE SINTÉTICO'));assert.ok(params.legend.includes('NO ES DOCUMENTO MUNICIPAL'));
 assert.deepEqual(params.filters,{employeeFrom:'',employeeTo:'',departmentFrom:'',departmentTo:'',agreementFrom:'',agreementTo:''});assert.deepEqual(plan.actors,before);
 for(const actor of Object.values(plan.actors))for(const cap of ['payroll.receipt.prepare','payroll.receipt.approve','payroll.receipt.self.read'])assert.equal(actor.capabilities.includes(cap),false);
 assert.ok(Object.isFrozen(params)&&Object.isFrozen(params.issuer));
 assert.throws(()=>receiptParams({plan:{...plan},beneficiaryId:uuid}),/MINTED_REQUIRED/);assert.throws(()=>receiptParams({plan,beneficiaryId:plan.subjects[0].contractId}),/BENEFICIARY_ONLY/);
});

test('business rejects cloned plan and unminted connection before querying; no mock native acceptance is produced',async()=>{
 const plan=build();let calls=0;const fake={target:plan.target,sql:{query(){calls++;throw Error('unreachable');}}};
 await assert.rejects(()=>business({plan:{...plan},connected:fake}),/MINTED_REQUIRED/);assert.equal(calls,0);
 await assert.rejects(()=>business({plan,connected:fake}),/UNMINTED_SESSION/);assert.equal(calls,0);
 await assert.rejects(()=>business({plan,sql:fake.sql}),/BUSINESS_OPTIONS/);assert.equal(calls,0);
});

test('actual209 service refuses the checker before querying, without inventing a SQL rejection or widening capabilities',async()=>{
 const plan=build(),checker=plan.actors.checker;let calls=0;
 const neverSql={query(){calls++;throw Error('SQL_MUST_NOT_BE_REACHED');}};
 await assert.rejects(()=>ownAnnulPreparationOperation(neverSql,checker.principal,checker.session,'detail',{id:uuid},{fullJson:true}),error=>error.code==='OWN_ANNUL_PREPARATION_FORBIDDEN'&&error.status===403);
 assert.equal(calls,0);assert.equal(checker.capabilities.includes('payroll.calculation.prepare'),false);
});
