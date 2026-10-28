// SOURCE PROPOSAL ONLY. Pure fixture/profile, not an executor or admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnM7NativeTestFixturePlan,assertOwnM7NativeTestFixturePlan,materializeOwnM7NativeTestEmployee} from './own-m7-native-test-fixture.mjs';
import {programOwnerQaItems,programOwnerQaDefinition} from '../../tests/fixtures/municipal-owner-program-synthetic.js';
import {program as sourceNoveltyProgram,definitions as sourceNoveltyItems} from '../../tests/fixtures/own-payroll-program-synthetic.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';

export const OWN_M5_M7_PROFILE_VERSION='own-m5-m7-novelty-positive-profile.v2';
export const OWN_M5_M7_PROTOCOL='published-monthly-fixed-v1+approved-native-novelty120.v1';
const sha=x=>createHash('sha256').update(x).digest('hex'),minted=new WeakMap();
const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const exact=(x,keys,code)=>{assert.ok(x&&typeof x==='object'&&!Array.isArray(x),code);assert.deepEqual(Reflect.ownKeys(x).sort(),[...keys].sort(),code);};
const id=(runId,key)=>{const a=sha('m5-m7:'+runId+':'+key).slice(0,32).split('');a[12]='4';a[16]=((parseInt(a[16],16)&3)|8).toString(16);const s=a.join('');return[s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');};
export const OWN_M5_M7_SOURCE_PINS=freeze({
 'scripts/lib/own-m7-native-test-fixture.mjs':'7e788aac93a205e708ca3f9c304f86a8d5fb4b819b9012fca2827b19ce55d30c',
 'scripts/lib/own-m7-native-test-connected-pg.mjs':'500e7ca7a27e29054d16c03b8e1b9a597c05eb068f15ca42258266170b9ba249',
 'scripts/lib/own-m7-native-test-business-pg.mjs':'db9117b0bf7d684b45be4355fcff43f99f697e71acafc100d658abd30e42c0aa',
 'tests/fixtures/municipal-owner-program-synthetic.js':'0106a48f1034c1b617333dd4dead4dab6f40912a8a086a3fb97a5f6c67f090b1',
 'tests/fixtures/own-payroll-program-synthetic.js':'5de76098ed937c21927005bf69b4d33b968bca1aa26ccc534e398d4e4d165f81',
 'tests/fixtures/own-payroll-synthetic.js':'eefa7caec24aa20ca3a39f85491e8111f2399ce08eae7597699b853adbcb7812',
 'tests/fixtures/own-payroll-novelties-synthetic.js':'09b06bc9e1cb49067c2c7e8fb8ac3f64fcf98c9a4a4baf941d1f6bd19551f98f',
 'lib/internal-own-payroll-novelties.js':'f797f3d4afcfeb09e209219caf5c3e37f7f43c584fbb88f6fbe2cefce6c6971a',
 'lib/own-payroll-approved-input.js':'df80132c620ab9c60d9427ccc46daa44851495f34c9c3607ab00e329d661a03a',
 'scripts/migrations/130-own-bulk-novelties.sql':'27bfed41ea1449b964fc8719c4d71a145ba9693b9c86086e2fa5db2fd14a9e4d',
 'scripts/migrations/139-adopted-monthly-novelties.sql':'691c07b4b16fe1e681e9b6024d00e447251937ffb231176fa617e8d82647ab95',
 'scripts/migrations/197-own-novelty-succession.sql':'13ad516bfd653a03b5fae8987486abeef1c13a5d629264b0c680d57c5a5bb43c',
 'assets/own-payroll-program-model.js':'f4b3101fb8cf050dbe8f11fb61b46065706c7a7e231a52cf126019f04d9701a8',
 'assets/native-salary-catalog-model.js':'0277d8e93a362e4bdfd3f2b698d84b6903ef2bb7f774d932423e2088dcfea908'
});
// Literal texts emitted by lib/internal-own-payroll-novelties.js:35–40.
export const OWN_M5_M7_NOVELTY_RPC=freeze({
 'SELECT public.own_novelty_bootstrap_v1($1::jsonb) AS result':{name:'own_novelty_bootstrap_v1',types:['jsonb']},
 'SELECT public.own_novelty_detail_v1($1::jsonb,$2::uuid) AS result':{name:'own_novelty_detail_v1',types:['jsonb','uuid']},
 'SELECT public.own_novelty_attempt_v1($1::jsonb,$2::uuid) AS result':{name:'own_novelty_attempt_v1',types:['jsonb','uuid']},
 'SELECT public.own_novelty_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result':{name:'own_novelty_command_v1',types:['jsonb','jsonb','uuid']}
});
export function assertOwnM5M7NoveltyRpcSource(text){
 assert.equal(typeof text,'string');
 for(const sql of Object.keys(OWN_M5_M7_NOVELTY_RPC))assert.equal(text.split("query='"+sql+"'").length,2,'M5_M7_REAL_SERVICE_SQL_CHANGED');
 assert.equal(Object.keys(OWN_M5_M7_NOVELTY_RPC).length,4);return true;
}
export function ownM5M7CanonicalProgram(){
 const base=programOwnerQaDefinition(),legacy=sourceNoveltyProgram();
 const rules=legacy.rules.filter(r=>r.code==='120'&&r.agreementCode==='1');assert.equal(rules.length,1);
 const bindings=legacy.bindings.filter(b=>b.key==='addition');assert.equal(bindings.length,1);
 assert.deepEqual(rules[0].expression,{op:'input',key:'addition',unit:'money'});
 assert.equal(rules[0].nature,'non_remuneration');
 assert.equal(bindings[0].sourceKind,'monthly_amount');assert.equal(bindings[0].sourceCode,'120');
 assert.equal(bindings[0].onMissing,'zero');assert.equal(bindings[0].combine,'sum');
 const monetary=base.rules.filter(r=>r.agreementCode===rules[0].agreementCode&&r.code==='1'&&r.nature==='remuneration'&&r.unit==='money');assert.equal(monetary.length,1);
 assert.equal(monetary[0].rounding.mode,'exact','M5_M7_BASE_QA_EXACT_POLICY_REQUIRED');
 const addedRule={...copy(rules[0]),rounding:copy(monetary[0].rounding)};
 const roundingProvenance={version:'own-m5-m7-novelty120-qa-rounding-source.v1',sourceFile:'tests/fixtures/municipal-owner-program-synthetic.js',sourceSha256:OWN_M5_M7_SOURCE_PINS['tests/fixtures/municipal-owner-program-synthetic.js'],sourceRule:{agreementCode:monetary[0].agreementCode,code:monetary[0].code},inheritedPolicy:copy(monetary[0].rounding),previousLegacyPolicy:copy(rules[0].rounding),synthetic:true,municipalFormula:false};
 const extra=sourceNoveltyItems().filter(i=>i.kind==='concept'&&i.code==='120'&&i.agreementCode==='1');assert.equal(extra.length,1);
 const items=salaryItems([...copy(programOwnerQaItems()),copy(extra[0])]);
 const definition=ownProgramDefinition({...copy(base),rules:[...copy(base.rules),addedRule],bindings:[...copy(base.bindings),copy(bindings[0])]},items);
 assert.equal(definition.rules.length,3);assert.equal(definition.bindings.length,2);
 const inverse={...copy(definition),rules:definition.rules.filter(r=>r.code!=='120'),bindings:definition.bindings.filter(b=>b.key!=='addition')};
 assert.deepEqual(inverse,base,'M5_M7_COMPLETE_PROGRAM_INVERSE');
 return freeze({items,definition,baseDefinition:copy(base),addedRule:copy(addedRule),addedBinding:copy(bindings[0]),addedItem:copy(extra[0]),roundingProvenance,municipalFormula:false});
}
const CAP_SQL='INSERT INTO public.iam_role_capability(role_key,capability_key) VALUES($1::text,$2::text)';
const COUNTS=freeze({tenant:1,binding:1,policy:1,users:2,roles:2,roleCapabilities:27,memberships:2,authority:2,sessions:2,persons:2,contracts:2,registrations:2,links:2,catalogProposal:1,catalogReview:1});
export function buildOwnM5M7NoveltyPositiveProfile(options){
 exact(options,['readRaw','sourceCommit','testTargetAdmission','runId'],'M5_M7_PROFILE_OPTIONS');assert.equal(typeof options.readRaw,'function');
 const raw=new Map();
 for(const[file,pin]of Object.entries(OWN_M5_M7_SOURCE_PINS)){const bytes=options.readRaw(file);assert.ok(Buffer.isBuffer(bytes));assert.equal(sha(bytes),pin,'M5_M7_SOURCE_CHANGED:'+file);raw.set(file,Buffer.from(bytes));}
 assertOwnM5M7NoveltyRpcSource(raw.get('lib/internal-own-payroll-novelties.js').toString('utf8'));
 const base=buildOwnM7NativeTestFixturePlan(options);assertOwnM7NativeTestFixturePlan(base);
 assert.equal(base.target.branchId,'br-orange-rain-ac6uvvxu');assert.equal(base.target.endpointId,'ep-aged-firefly-acoaqlsh');assert.equal(base.target.major,17);
 assert.equal(base.target.host,'ep-aged-firefly-acoaqlsh.sa-east-1.aws.neon.tech');assert.equal(base.target.database,'neondb');assert.equal(base.target.kind,'test');
 assert.equal(base.target.parentBranchId,'br-plain-dust-acpjgebb');assert.equal(base.expectedCounts.actors,2);assert.equal(base.bootstrapOwner.statements.length,46);
 const canonical=ownM5M7CanonicalProgram(),actors=copy(base.actors),additions={maker:'payroll.novelty.prepare',checker:'payroll.novelty.approve'},insertAfter=new Map();
 for(const name of ['maker','checker']){
  const actor=actors[name],cap=additions[name];assert.equal(actor.capabilities.includes(cap),false);
  actor.capabilities=[...actor.capabilities,cap].sort();actor.principal.tenant.effectiveCapabilities=[...actor.capabilities];
  const indices=base.bootstrapOwner.statements.map((s,n)=>s.text===CAP_SQL&&s.values[0]===actor.roleKey?n:-1).filter(n=>n>=0);assert.ok(indices.length);
  const last=indices.at(-1),next=base.bootstrapOwner.statements[last+1];assert.ok(next.text.startsWith('INSERT INTO public.tenant_membership('));assert.equal(next.values[3],actor.roleKey);
  insertAfter.set(last,{text:CAP_SQL,values:[actor.roleKey,cap]});
 }
 const statements=[],expectedCommands=[],expectedRowCounts=[],origins=[];
 base.bootstrapOwner.statements.forEach((s,n)=>{statements.push(copy(s));expectedCommands.push(base.bootstrapOwner.expectedCommands[n]);expectedRowCounts.push(base.bootstrapOwner.expectedRowCounts[n]);origins.push(base.bootstrapOwner.origins[n]);if(insertAfter.has(n)){statements.push(copy(insertAfter.get(n)));expectedCommands.push('INSERT');expectedRowCounts.push(1);origins.push('NEW synthetic role only; existing capability130; before membership/session');}});
 assert.equal(statements.length,48);assert.equal(expectedCommands.filter(x=>x==='UPDATE').length,1);
 assert.equal(actors.maker.capabilities.includes('payroll.calculation.approve'),false);assert.equal(actors.maker.capabilities.includes('payroll.novelty.approve'),false);
 assert.equal(actors.checker.capabilities.includes('payroll.novelty.prepare'),false);
 const keys=Object.fromEntries(['novelty-prepare','novelty-submit','novelty-approve'].map(k=>[k,id(base.runId,k)]));
 for(const step of base.steps)if(step.requestKey)keys[step.id]=step.requestKey;
 const sourceHashes={...base.sourceHashes,...OWN_M5_M7_SOURCE_PINS};
 const sourceInputs={...base.sourceInputs,...Object.fromEntries([...raw].map(([file,bytes])=>[file,{bytes:bytes.length,sha256:sha(bytes)}]))};
 const plan=freeze({version:OWN_M5_M7_PROFILE_VERSION,kind:'test',schema:'public',sourceCommit:base.sourceCommit,runId:base.runId,target:base.target,branchCreation:base.branchCreation,
  sourceOnly:true,productionAdmitted:false,executionAdmitted:false,connects:false,executesSql:false,
  template:{version:base.version,usage:'data-and-native-materializer-only',executedAsParentProtocol:false,parentRollbackRetentionClaimed:false},
  scope:base.scope,subjects:base.subjects,actors,seededCatalog:base.seededCatalog,canonical:{...base.canonical,salaryItems:canonical.items,program:canonical.definition},programmeSources:canonical,
  requestKeys:keys,bootstrapOwner:{statements,expectedCommands,expectedRowCounts,origins,expectedSha256:sha(JSON.stringify(statements))},
  baselineExpectedCounts:copy(COUNTS),postRollbackExpectedCounts:copy(COUNTS),seedEnd:'COMMIT',seedRetentionExpected:true,businessEnd:'ROLLBACK',
  protocol:OWN_M5_M7_PROTOCOL,runOptions:{fullJson:true},fullfixedV2Pending:true,
  expected:{operators:2,personsAfterApiCreate:3,selectedEmployees:1,closeEmployees:1,closePopulation:3,closeComplete:false,noveltyRows:1,noveltyEvents:3,ownCaptures:2,noveltyAmountCents:'2000'},
  authentication:base.authentication,existingRolesUpdated:0,capabilityDefinitionsAdded:0,databaseGrantsAdded:0,syntheticRoleAssociations:27,sourceHashes,sourceInputs,sourceManifestSha256:sha(JSON.stringify(sourceInputs)),
  pending:['REAL_AUTHENTICATION','NORMAL_EMPTY_TENANT_ONBOARDING','BENEFICIARY_SELF_ACCOUNT','R4_M3_115_RUN7_EXCLUDED'],
 });
 const bookend=()=>{assertOwnM7NativeTestFixturePlan(base);for(const[file,before]of raw){const after=options.readRaw(file);assert.ok(Buffer.isBuffer(after));assert.ok(before.equals(after),'M5_M7_SOURCE_BOOKEND:'+file);}return true;};
 minted.set(plan,{base,bookend});bookend();return plan;
}
export function assertOwnM5M7NoveltyPositiveProfile(plan){const state=minted.get(plan);assert.ok(state,'M5_M7_MINTED_PROFILE_REQUIRED');assert.equal(plan.version,OWN_M5_M7_PROFILE_VERSION);state.bookend();return plan;}
export function materializeOwnM5M7Beneficiary({plan,bootstrap}){assertOwnM5M7NoveltyPositiveProfile(plan);return materializeOwnM7NativeTestEmployee({plan:minted.get(plan).base,subject:'beneficiary',bootstrap});}
export function assertOwnM5M7SeedObservation(plan,rows){
 assertOwnM5M7NoveltyPositiveProfile(plan);assert.ok(Array.isArray(rows));assert.equal(rows.length,48);
 rows.forEach((r,n)=>{exact(r,['command','rowCount','rows'],'M5_M7_SEED_ROW');assert.equal(r.command,plan.bootstrapOwner.expectedCommands[n]);assert.equal(r.rowCount,1);assert.deepEqual(r.rows,[]);});return true;
}
export function ownM5M7ProgrammeSha(plan){assertOwnM5M7NoveltyPositiveProfile(plan);return sha(salarySerialized(plan.canonical.program));}
