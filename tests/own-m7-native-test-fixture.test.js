// Unit/source evidence only. These tests never authenticate or execute SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

const blocked=()=>{throw Error('UNIT_IO_FORBIDDEN');};
for(const [module,keys]of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dns,['lookup','resolve']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const key of keys)module[key]=blocked;
globalThis.fetch=blocked;syncBuiltinESMExports();
const fixture=await import('../scripts/lib/own-m7-native-test-fixture.mjs');
const {buildOwnM7NativeTestFixturePlan,assertOwnM7NativeTestFixturePlan,bookendOwnM7NativeTestFixture,materializeOwnM7NativeTestEmployee,assertOwnM7NativeTestSeedObservation,OWN_M7_NATIVE_TEST_FIXTURE_SOURCE_PINS,OWN_M7_NATIVE_TEST_POLICY_SQL}=fixture;
const root=new URL('../',import.meta.url),readRaw=file=>fs.readFileSync(new URL(file,root));
const sha=value=>createHash('sha256').update(value).digest('hex'),copy=value=>JSON.parse(JSON.stringify(value));
const admission=()=>({version:'own-release-annulment-atomic-test-target.v1',kind:'test',target:{major:17,projectId:'noisy-poetry-54471701',branchId:'br-synthetic-unit-only',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-synthetic-unit-only.sa-east-1.aws.neon.tech',endpointId:'ep-synthetic-unit-only',kind:'test',parentBranchId:'br-plain-dust-acpjgebb'},parentBranchId:'br-plain-dust-acpjgebb',branchCreation:{bytes:123,sha256:'9'.repeat(64)}});
const options=(patch={})=>({readRaw,sourceCommit:'6c14f714d2bcefa43bc1f8d3b8b19fe902b50e05',testTargetAdmission:admission(),runId:'unit-fixture-20261028',...patch});
const build=(patch={})=>buildOwnM7NativeTestFixturePlan(options(patch));

test('source-pinned plan is minted/frozen and declares exactly two seed operators plus one real-API beneficiary',()=>{
 const p=build();assert.equal(assertOwnM7NativeTestFixturePlan(p),p);assert.equal(bookendOwnM7NativeTestFixture(p),true);
 assert.equal(p.version,'own-m7-native-test-fixture.v1');assert.deepEqual(Object.keys(p.actors),['maker','checker']);assert.equal(p.subjects.length,3);
 assert.deepEqual(p.subjects.map(s=>s.creationMode),['explicit_fixture_seed','explicit_fixture_seed','native_employee_api']);
 for(const key of ['personId','contractId','registrationId','legajo'])assert.equal(Object.hasOwn(p.subjects[2],key),false);
 assert.equal(new Set(p.subjects.map(s=>s.draft.dni)).size,3);assert.equal(new Set(p.subjects.map(s=>s.draft.cuil)).size,3);
 assert.equal(p.scope.slug,'own-m7-test-unit-fixture-20261028');assert.equal(p.target.database,'neondb');assert.equal(p.schema,'public');
 assert.equal(p.authentication.completeAuthenticationHandler,false);assert.equal(p.authentication.businessSyntheticAuth,true);assert.equal(p.authentication.realMfaVerified,false);assert.equal(p.authentication.realJwtIssued,false);
 assert.equal(p.executesSql,false);assert.equal(p.connects,false);assert.equal(p.productionAdmitted,false);assert.equal(p.executionAdmitted,false);
 assert.equal(p.expectedCounts.totalNativePersonsAfterCreate,3);assert.equal(p.expectedCounts.grhEmployees,0);assert.equal(p.expectedCounts.grhCatalogRows,0);assert.equal(p.expectedCounts.sourceImportBatches,0);
 assert.equal(p.transaction.isolation,'read committed');assert.equal(p.transaction.end,'ROLLBACK');assert.equal(p.transaction.observedEndRequired,true);
 assert.equal(p.seededCatalog.seedOnly,true);assert.equal(p.seededCatalog.rpcExecuted,false);assert.equal(p.issuer.kind,'synthetic_test');assert.equal(p.issuer.institutionalIdentity,false);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.actors.maker.principal.tenant.effectiveCapabilities)&&Object.isFrozen(p.bootstrapOwner.statements[0].values));
 assert.throws(()=>assertOwnM7NativeTestFixturePlan(copy(p)),/MINTED/);assert.throws(()=>assertOwnM7NativeTestFixturePlan({...p,passed:true}),/MINTED/);
});

test('source custody rejects injected bytes, LF normalization, strings and RAW drift',()=>{
 const file='tests/fixtures/native-employee-synthetic.js';
 assert.throws(()=>build({readRaw:f=>f===file?Buffer.concat([readRaw(f),Buffer.from('\n')]):readRaw(f)}),/SOURCE_CHANGED/);
 assert.throws(()=>build({readRaw:f=>readRaw(f).toString('utf8')}),/BUFFER_REQUIRED/);
 const lf=Object.keys(OWN_M7_NATIVE_TEST_FIXTURE_SOURCE_PINS).find(f=>readRaw(f).includes(Buffer.from('\n')));assert.ok(lf);
 assert.throws(()=>build({readRaw:f=>f===lf?Buffer.from(readRaw(f).toString('utf8').replace(/\r?\n/g,'\r\n')):readRaw(f)}),/SOURCE_CHANGED/);
 let changed=false;const p=build({readRaw:f=>changed&&f===file?Buffer.concat([readRaw(f),Buffer.from('x')]):readRaw(f)});changed=true;assert.throws(()=>bookendOwnM7NativeTestFixture(p),/RAW_DRIFT/);
});

test('plan accepts TEST destination metadata only, rejects production and identity adaptations',()=>{
 const t=admission();t.target.kind='production';assert.throws(()=>build({testTargetAdmission:t}));
 for(const [key,value]of [['database','municontrol_qa'],['branchId','br-plain-dust-acpjgebb'],['endpointId','ep-shiny-cherry-actlyudg'],['parentBranchId','br-another-parent'],['role','postgres'],['guardOid',1]]){
  const a=admission();a.target[key]=value;assert.throws(()=>build({testTargetAdmission:a}),'must reject '+key);
 }
 assert.throws(()=>build({testTargetAdmission:{...admission(),passed:true}}));assert.throws(()=>build({runId:'junin;DROP'}));assert.throws(()=>build({runId:'unit--duplicate'}));
 assert.throws(()=>buildOwnM7NativeTestFixturePlan({...options(),tenantId:'4daa7815-0816-4506-b497-c7432cb1aa9f'}));
 const a=admission();Object.defineProperty(a.target,'database',{get:()=>{throw Error('GETTER_INVOKED');},enumerable:true});assert.throws(()=>build({testTargetAdmission:a}),/M7_FIXTURE_DATA/);
 const other=build({runId:'unit-fixture-second'});assert.notEqual(build().scope.tenantId,other.scope.tenantId);assert.notEqual(build().subjects[0].personId,other.subjects[0].personId);
});

test('owner batch is finite INSERT data plus the single strictly scoped newly-created-policy UPDATE',()=>{
 const p=build(),batch=p.bootstrapOwner;
 assert.equal(batch.expectedSha256,sha(JSON.stringify(batch.statements)));assert.equal(batch.statements.length,batch.expectedRowCounts.length);assert.ok(batch.expectedRowCounts.every(n=>n===1));
 const update=batch.statements.filter(s=>s.text.startsWith('UPDATE '));assert.equal(update.length,1);assert.equal(update[0].text,OWN_M7_NATIVE_TEST_POLICY_SQL);assert.deepEqual(update[0].values,[p.scope.tenantId,p.scope.bindingId,p.sourceCommit,p.actors.maker.email,p.scope.slug,p.scope.sourceDatabase,p.scope.companyId]);
 for(const marker of ['p.version=1','p.certified_at IS NULL','p.updated_at=transaction_timestamp()','t.created_at=transaction_timestamp()','b.created_at=transaction_timestamp()',"t.tenant_kind='sandbox'",'b.source_company_id=$7::bigint'])assert.ok(update[0].text.includes(marker));
 const peer=readRaw('scripts/lib/own-m7-native-test-business-pg.mjs').toString('utf8');const exported=peer.match(/export const OWN_M7_NATIVE_TEST_POLICY_SQL="([^"\r\n]+)";/);assert.ok(exported);assert.equal(exported[1],OWN_M7_NATIVE_TEST_POLICY_SQL,'transport must admit exactly the same scoped source text');
 const tables=batch.statements.filter(s=>s.text.startsWith('INSERT ')).map(s=>s.text.match(/^INSERT INTO public\.([a-z_]+)\(/)?.[1]);assert.ok(tables.every(Boolean));
 assert.equal(tables.filter(t=>t==='person_identity').length,2);assert.equal(tables.filter(t=>t==='employment_contract').length,2);assert.equal(tables.filter(t=>t==='native_employee_registration').length,2);assert.equal(tables.filter(t=>t==='tenant_action_employment_link').length,2);
 assert.equal(tables.filter(t=>t==='native_employment_catalog_proposal').length,1);assert.equal(tables.filter(t=>t==='native_employment_catalog_review').length,1);
 assert.equal(tables.some(t=>t.startsWith('grh_')||t==='source_import_batch'||t==='data_import_runs'||t.startsWith('own_payroll_')),false);
 for(const s of batch.statements){assert.ok(Array.isArray(s.values)&&s.values.length>0);assert.doesNotMatch(s.text,/;|--|\/\*|\b(?:GRANT|ALTER|CREATE|DROP|DELETE|TRUNCATE|COMMIT|ROLLBACK|BEGIN)\b/i);}
 for(const s of p.subjects.slice(0,2)){
  const person=batch.statements.findIndex(x=>x.text.startsWith('INSERT INTO public.person_identity(')&&x.values[0]===s.personId);
  const reg=batch.statements.findIndex(x=>x.text.startsWith('INSERT INTO public.native_employee_registration(')&&x.values[0]===s.registrationId);
  const contract=batch.statements.findIndex(x=>x.text.startsWith('INSERT INTO public.employment_contract(')&&x.values[0]===s.contractId);
  assert.ok(person<reg&&reg<contract,'source067 requires registration before its deferred contract');
  assert.ok(batch.statements[contract].text.includes('to_jsonb(r.created_at)'));
 }
 const catalogSeeds=batch.statements.filter(s=>s.text.startsWith('INSERT INTO public.native_employment_catalog_'));assert.ok(catalogSeeds.every(s=>s.values.at(-1)==='{}'),'no native approval receipt is fabricated');
});

test('canonical data and service recipes retain their real source exports and exact narrow scope',async()=>{
 const p=build(),data=await import('./fixtures/municipal-owner-program-synthetic.js');assert.deepEqual(p.canonical.salaryItems,data.programOwnerQaItems());assert.deepEqual(p.canonical.program,data.programOwnerQaDefinition());
 assert.equal(p.canonical.program.rules.length,2);assert.equal(p.canonical.program.rules[0].expression.value,'100.10');assert.equal(p.canonical.period,'2026-10');assert.equal(p.canonical.classification.length,4);
 assert.ok(p.actors.maker.capabilities.includes('payroll.calculation.prepare'));assert.equal(p.actors.maker.capabilities.includes('payroll.calculation.approve'),false);assert.equal(p.actors.maker.capabilities.includes('payroll.parameter.approve'),false);
 assert.ok(p.actors.checker.capabilities.includes('payroll.calculation.approve'));assert.equal(p.actors.checker.capabilities.includes('payroll.parameter.prepare'),false);
 assert.equal([...p.actors.maker.capabilities,...p.actors.checker.capabilities].some(c=>c.startsWith('payroll.receipt.')),false);
 assert.ok(p.pending.some(v=>v.code==='RECEIPT_PREPARER_ACCESS'));assert.ok(p.pending.some(v=>v.code==='BENEFICIARY_SELF_RECEIPT'));
 for(const step of p.steps.filter(s=>s.service)){const source=readRaw(step.service).toString('utf8');assert.match(source,new RegExp('export (?:async )?function '+step.export+'\\('));}
 assert.equal(p.steps.find(s=>s.id==='program-bootstrap').export,'programOperation');assert.equal(p.steps.at(-1).end,'ROLLBACK');
 assert.equal(p.steps.some(s=>s.end==='COMMIT'),false);assert.equal(p.steps.some(s=>s.id.startsWith('receipt')),false);
});

test('beneficiary command uses canonical draft with observed own bootstrap; never returns a native identity or result',()=>{
 const p=build(),bootstrap={version:'native-employee.v1',canCreate:true,today:'2026-10-28',suggestedLegajo:'3',scope:{tenantId:p.scope.tenantId,membershipId:p.actors.maker.membershipId},catalog:{version:'c'.repeat(64),items:copy(p.canonical.classification),origin:'MUNICONTROL',revision:1}};
 const input=materializeOwnM7NativeTestEmployee({plan:p,subject:'beneficiary',bootstrap});assert.equal(input.key,p.subjects[2].requestKey);assert.deepEqual(input.body.draft,p.subjects[2].draft);assert.equal(input.body.catalogVersion,bootstrap.catalog.version);assert.deepEqual(Object.keys(input),['key','body']);
 for(const [key,value]of [['today','2026-11-01'],['canCreate',false]])assert.throws(()=>materializeOwnM7NativeTestEmployee({plan:p,subject:'beneficiary',bootstrap:{...bootstrap,[key]:value}}));
 assert.throws(()=>materializeOwnM7NativeTestEmployee({plan:p,subject:'maker',bootstrap}),/ONLY_API_BENEFICIARY/);
 assert.throws(()=>materializeOwnM7NativeTestEmployee({plan:p,subject:'beneficiary',bootstrap:{...bootstrap,catalog:{...bootstrap.catalog,origin:'GRH'}}}),/OWN_CATALOG_REQUIRED/);
 assert.throws(()=>materializeOwnM7NativeTestEmployee({plan:p,subject:'beneficiary',bootstrap:{...bootstrap,scope:{...bootstrap.scope,tenantId:p.scope.bindingId}}}));
 const denied=copy(bootstrap);denied.catalog.items=denied.catalog.items.map(x=>({...x,registrationAllowed:false}));assert.throws(()=>materializeOwnM7NativeTestEmployee({plan:p,subject:'beneficiary',bootstrap:denied}),/CATALOG_SELECTION/);
});

test('seed observation requires every actual command and exact row count; passed flags cannot admit it',()=>{
 const p=build(),unitRows=p.bootstrapOwner.expectedCommands.map(command=>({command,rowCount:1,rows:[]}));assert.equal(assertOwnM7NativeTestSeedObservation(p,unitRows),true);
 for(const i of [0,4,unitRows.length-1]){const changed=copy(unitRows);changed[i].rowCount=0;assert.throws(()=>assertOwnM7NativeTestSeedObservation(p,changed),/SEED_ROW_COUNT/);}
 const changed=copy(unitRows);changed[4].command='INSERT';assert.throws(()=>assertOwnM7NativeTestSeedObservation(p,changed));
 assert.throws(()=>assertOwnM7NativeTestSeedObservation(p,unitRows.slice(1)));assert.throws(()=>assertOwnM7NativeTestSeedObservation(p,unitRows.map(r=>({...r,passed:true}))));
 assert.throws(()=>assertOwnM7NativeTestSeedObservation(copy(p),unitRows),/MINTED/);
});

test('module has no executor, connection, SDK, credentials or copied QA foundation',()=>{
 const source=readRaw('scripts/lib/own-m7-native-test-fixture.mjs').toString('utf8');
 assert.doesNotMatch(source,/from ['"](?:node:(?:fs|net|tls|child_process|http|https)|@neondatabase|pg['"])/);
 assert.doesNotMatch(source,/\b(?:fetch|execFile|createOwnReleaseAnnulmentAtomicSessions|createOwnM7NativeTestBusinessSession)\s*\(/);
 assert.doesNotMatch(source,/\.query\s*\(|qa_actor|mcqa_|fullFoundation|h\.qa/);
 assert.deepEqual(Object.keys(fixture).sort(),['OWN_M7_NATIVE_TEST_FIXTURE_SOURCE_PINS','OWN_M7_NATIVE_TEST_FIXTURE_VERSION','OWN_M7_NATIVE_TEST_POLICY_SQL','assertOwnM7NativeTestFixturePlan','assertOwnM7NativeTestSeedObservation','bookendOwnM7NativeTestFixture','buildOwnM7NativeTestFixturePlan','materializeOwnM7NativeTestEmployee'].sort());
});
