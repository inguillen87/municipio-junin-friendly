import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reviewPreparedProgramDraft,applyPreparedProgramDraft,OWN_PROGRAM_PREPARED_MAX_BYTES} from '../assets/own-payroll-program-prepared-draft.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {prepareProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';
import {preparedProgramFixture} from './fixtures/own-payroll-program-prepared-synthetic.js';
import {OWN_PARTICIPATION_VERSION,participationRuleKey} from '../assets/own-period-participation-program.js';
const hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const signed=v=>{const next=structuredClone(v);delete next.pins.preparationSha256;next.pins.preparationSha256=hash(next);return JSON.stringify(next);};
const review=(f,text=f.text)=>reviewPreparedProgramDraft(f.salary,f.programme,f.draft,text);
const code=c=>e=>e.code===c;
for(const version of ['v1','v2'])test(version+' complete real-preparer output becomes a local review and exact cloned draft only',async()=>{
 const f=preparedProgramFixture({version}),before=structuredClone(f),plan=await review(f);
 assert.equal(plan.summary.definitions,version==='v1'?1:3);assert.equal(plan.summary.typedRules,version==='v1'?1:2);
 assert.equal(plan.summary.inputDefinitions,version==='v1'?0:1);assert.equal(plan.summary.consumedInputDefinitions,version==='v1'?0:1);
 assert.equal(plan.summary.totalRules,version==='v1'?1:2);assert.equal(plan.summary.totalBindings,version==='v1'?0:1);
 assert.deepEqual(plan.program,f.preparation.draft.programme);assert.deepEqual(f,before);
 const next=await applyPreparedProgramDraft(f.salary,f.programme,f.draft,plan);
 assert.deepEqual(next,plan.program);assert.notEqual(next,plan.program);assert.ok(Object.isFrozen(plan.file.draft.programme));
 next.rules[0].ruleReference='Cambio exclusivamente local';assert.notEqual(next.rules[0].ruleReference,plan.program.rules[0].ruleReference);
 assert.equal(Object.hasOwn(plan,'command'),false);assert.equal(Object.hasOwn(plan,'requestKey'),false);
 assert.equal(plan.file.approved,false);assert.equal(plan.file.executable,false);
});
test('decimal strings beyond Number precision remain byte-for-byte decimal strings',async()=>{
 const f=preparedProgramFixture(),plan=await review(f);
 assert.equal(plan.program.rules[0].expression.value,'9007199254740993.00000001');assert.equal(typeof plan.program.rules[0].expression.value,'string');
});
test('history remains complete and input roles never become executable amount outputs',async()=>{
 const f=preparedProgramFixture({version:'v2',prior:true}),plan=await review(f);
 assert.equal(plan.program.rules.length,3);assert.equal(plan.program.rules.filter(r=>r.code==='201').length,1);assert.equal(plan.program.rules.some(r=>r.code==='401'),false);
 const broken=structuredClone(f.preparation);broken.draft.programme.rules=broken.draft.programme.rules.filter(r=>r.code!=='201');
 await assert.rejects(review(f,signed(broken)),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
});
test('all root fields participate in the self-excluding canonical result hash',async()=>{
 const f=preparedProgramFixture();
 for(const mutate of [p=>{p.context.month.value=10;},p=>{p.approved=true;},p=>{p.completeness.receivedDefinitions=0;},p=>{p.draft.programme.rules[0].expression.value='1';},p=>{p.trace.push({phase:'fictional'});} ]){
  const broken=structuredClone(f.preparation);mutate(broken);await assert.rejects(review(f,JSON.stringify(broken)),code('PROGRAM_PREPARED_HASH_CHANGED'));
 }
 const changedPin=structuredClone(f.preparation);changedPin.pins.preparationSha256='0'.repeat(64);await assert.rejects(review(f,JSON.stringify(changedPin)),code('PROGRAM_PREPARED_HASH_CHANGED'));
});
test('even a newly hashed file cannot waive incidents, incompleteness, flags or declared source boundaries',async()=>{
 const f=preparedProgramFixture();
 for(const mutate of [p=>{p.status='not_presentable';},p=>{p.approved=true;},p=>{p.executable=true;},p=>{p.payrollCalculated=true;},p=>{p.payrollPosted=true;},p=>{p.sourceHashStatus='verified_backup';},p=>{p.basePinStatus='authorized';},p=>{p.presentable.master=true;},p=>{p.presentable.programme=false;},p=>{p.draft.programme=null;},p=>{p.completeness.sourceDeclaredComplete=false;},p=>{p.completeness.receivedDefinitions=0;},p=>{p.completeness.masterContractComplete=false;},p=>{p.completeness.programmeContractComplete=false;},p=>{p.incidents.push({code:'EXPRESSION_UNRESOLVED',definition:null,path:null,sourceReference:null});}]){
  const broken=structuredClone(f.preparation);mutate(broken);await assert.rejects(review(f,signed(broken)));
 }
});
test('unknown versions and extra V2 role evidence in V1 do not silently become supported',async()=>{
 const f=preparedProgramFixture(),unknown=structuredClone(f.preparation);unknown.version='own-payroll-programme-source-preparation.v3';await assert.rejects(review(f,signed(unknown)));
 const extra=structuredClone(f.preparation);extra.draft.definitions[0].role='payable';await assert.rejects(review(f,signed(extra)));
});
test('both fresh complete bootstraps and every base pin are required',async()=>{
 const f=preparedProgramFixture(),plan=await review(f);
 for(const mutate of [x=>{x.salary.scopeVersion='9'.repeat(64);},x=>{x.salary.classification.version='9'.repeat(64);},x=>{x.salary.catalog.version='9'.repeat(64);},x=>{x.salary.catalog.revision=2;},x=>{x.salary.catalog.items[0].label='Otra definición ficticia';},x=>{x.programme.program.version='9'.repeat(64);},x=>{x.programme.program.revision=1;},x=>{x.programme.salaryCatalog.items[0].label='Otra definición ficticia';}]){
  const next=structuredClone(f);mutate(next);await assert.rejects(applyPreparedProgramDraft(next.salary,next.programme,next.draft,plan));
 }
 const partial=structuredClone(f);partial.salary.complete=false;await assert.rejects(review(partial));
 const revoked=structuredClone(f);revoked.programme.permissions.canPropose=false;await assert.rejects(applyPreparedProgramDraft(revoked.salary,revoked.programme,revoked.draft,plan),code('PROGRAM_PREPARED_NOT_PERMITTED'));
});
test('fresh encoded pins, definitions and typed rule accounting cannot be substituted',async()=>{
 const f=preparedProgramFixture({version:'v2'});
 for(const mutate of [p=>{p.pins.classificationVersion='9'.repeat(64);},p=>{p.pins.programmeDefinitionSha256='9'.repeat(64);},p=>{p.pins.catalogueItemsSha256='9'.repeat(64);},p=>{p.draft.masterItems.pop();},p=>{p.draft.definitions.pop();},p=>{p.draft.definitions[0].identity='concept:71:999';},p=>{p.draft.typedRules.pop();},p=>{p.completeness.expectedTypedRules=3;},p=>{p.completeness.inputDefinitions=0;},p=>{p.completeness.consumedInputDefinitions=0;},p=>{p.draft.definitions[2].role='payable';},p=>{p.dependencies=p.dependencies.filter(e=>e.stage!=='declared_input_binding');}]){
  const broken=structuredClone(f.preparation);mutate(broken);await assert.rejects(review(f,signed(broken)));
 }
});
test('V2 U-only consumed input has one declared input and no invented amount rule',async()=>{
 const f=preparedProgramFixture({version:'v2'}),input=structuredClone(f.input);
 input.definitions=input.definitions.filter(d=>d.code!=='501');input.source.expectedDefinitions=2;input.bindings=[];
 input.definitions[0].expression={op:'multiply',left:{op:'literal',unit:'money',value:'10'},right:{op:'divide',left:{op:'quantity',code:'401',unit:'days'},right:{op:'literal',unit:'days',value:'1'}}};
 input.definitions[1].quantity={unit:'days',stage:'exact',rounding:null,expression:{op:'literal',unit:'days',value:'2'},sourceReference:'Cantidad sólo ficticia para QA',sourceSha256:'1'.repeat(64)};
 const prepared=prepareOwnPayrollProgrammeSource(input),plan=await reviewPreparedProgramDraft(input.salary,input.programme,f.draft,JSON.stringify(prepared));
 assert.equal(plan.summary.inputDefinitions,1);assert.equal(plan.summary.consumedInputDefinitions,1);assert.equal(plan.program.rules.length,1);assert.equal(plan.program.rules[0].code,'301');
});
test('a forged V2 input amount rule, or loss of a typed rule, fails closed',async()=>{
 const f=preparedProgramFixture({version:'v2'}),broken=structuredClone(f.preparation),base=broken.draft.programme.rules.find(r=>r.code==='301');
 broken.draft.programme.rules.push({...structuredClone(base),code:'401',expression:{op:'literal',unit:'money',value:'1'}});
 await assert.rejects(review(f,signed(broken)));
 const dropped=structuredClone(f.preparation);dropped.draft.programme.rules=dropped.draft.programme.rules.filter(r=>r.code!=='501');await assert.rejects(review(f,signed(dropped)));
});
test('the existing exact-only new-rule proposal policy is enforced without conversion',async()=>{
 const f=preparedProgramFixture(),broken=structuredClone(f.preparation);
 broken.draft.programme.rules[0].rounding.mode='half_even';broken.draft.typedRules[0].rounding.mode='half_even';
 await assert.rejects(review(f,signed(broken)),code('PROGRAM_PRECISION_REQUIRED'));
 assert.equal(f.preparation.draft.programme.rules[0].rounding.mode,'exact');
});
test('apply checks the original local draft and the entire review, not a caller-selected programme',async()=>{
 const f=preparedProgramFixture(),plan=await review(f),changed=structuredClone(f.draft);changed.totalsPrecision=7;
 await assert.rejects(applyPreparedProgramDraft(f.salary,f.programme,changed,plan),code('PROGRAM_PREPARED_DRAFT_CHANGED'));
 const tampered=structuredClone(plan);tampered.summary.totalRules=999;
 await assert.rejects(applyPreparedProgramDraft(f.salary,f.programme,f.draft,tampered),code('PROGRAM_PREPARED_REVIEW_CHANGED'));
 let calls=0;const getter=structuredClone(plan);Object.defineProperty(getter,'summary',{enumerable:true,get(){calls++;return plan.summary;}});
 await assert.rejects(applyPreparedProgramDraft(f.salary,f.programme,f.draft,getter));assert.equal(calls,0);
 assert.equal(f.draft.rules.length,0);assert.equal(f.draft.totalsPrecision,null);
});
test('malformed, duplicate decoded keys, prototype fields and excessive depth never load a partial draft',async()=>{
 const f=preparedProgramFixture();
 for(const text of ['',f.text.slice(0,-1),f.text+' false','{"version":"x","version":"y"}','{"a":1,"\\u0061":2}','{"__proto__":{}}','{"a":[1,]}','{"a":1e999}','['.repeat(70)+'0'+']'.repeat(70)]){
  await assert.rejects(review(f,text));assert.equal(f.draft.rules.length,0);
 }
});
test('file and complete command budgets fail without slicing business content',async()=>{
 const f=preparedProgramFixture();await assert.rejects(review(f,' '.repeat(OWN_PROGRAM_PREPARED_MAX_BYTES+1)),code('PROGRAM_PREPARED_LIMIT'));
 const huge=structuredClone(f.preparation);huge.draft.programme.rules[0].ruleReference='x'.repeat(4*1024*1024);
 await assert.rejects(review(f,signed(huge)),code('PROGRAM_PREPARED_COMMAND_LIMIT'));
});
test('formula strings are not interpreted, and no local read invokes fetch or creates storage',async()=>{
 const f=preparedProgramFixture(),oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;let calls=0;
 globalThis.fetch=()=>{calls++;throw Error('No network allowed');};globalThis.localStorage={setItem(){calls++;throw Error('No persistence allowed');}};
 try{await review(f);const broken=structuredClone(f.preparation);broken.draft.programme.rules[0].expression='process.exit(1)';await assert.rejects(review(f,signed(broken)));assert.equal(calls,0);}
 finally{globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});
test('the complete request reserve covers 1000 escaped lone UTF-16 surrogates, not only three-byte UTF-8',async()=>{
 const f=preparedProgramFixture(),plan=await review(f),reason='\ud800'.repeat(1000);
 const body={operation:'command',payload:prepareProgramWorkspace(f.programme,plan.program,reason)};
 const actual=new TextEncoder().encode(JSON.stringify(body)).byteLength;
 assert.equal(JSON.stringify(reason).length,6002);assert.equal(plan.summary.commandBytesWithMaximumReason,actual);
 const threeByteBody={operation:'command',payload:prepareProgramWorkspace(f.programme,plan.program,'\uffff'.repeat(1000))};
 assert.equal(actual-new TextEncoder().encode(JSON.stringify(threeByteBody)).byteLength,3000);
 const oversized=structuredClone(f.preparation),reference=oversized.draft.programme.rules[0].ruleReference;
 oversized.draft.programme.rules[0].ruleReference='x'.repeat(4*1024*1024-(actual-new TextEncoder().encode(reference).byteLength)+1);
 assert.equal(new TextEncoder().encode(JSON.stringify({operation:'command',payload:{...body.payload,program:oversized.draft.programme}})).byteLength,4*1024*1024+1);
 await assert.rejects(review(f,signed(oversized)),code('PROGRAM_PREPARED_COMMAND_LIMIT'));
});
test('an incomplete nonempty local draft is preserved rather than omitted from the comparison',async()=>{
 const f=preparedProgramFixture(),draft=structuredClone(f.draft);draft.bindings.push({key:'PendingUnfinishedInput'});
 await assert.rejects(reviewPreparedProgramDraft(f.salary,f.programme,draft,f.text),code('PROGRAM_PREPARED_DRAFT_INCOMPLETE'));
 assert.deepEqual(draft.bindings,[{key:'PendingUnfinishedInput'}]);
});

test('an input-only concept may retain an explicit null output unit without inventing an amount unit',async()=>{
 const f=preparedProgramFixture({version:'v2'}),input=structuredClone(f.input);
 input.definitions.find(d=>d.role==='input').outputUnit=null;
 const preparation=prepareOwnPayrollProgrammeSource(input),plan=await reviewPreparedProgramDraft(input.salary,input.programme,f.draft,JSON.stringify(preparation));
 assert.equal(plan.file.draft.definitions.find(d=>d.role==='input').outputUnit,null);
 assert.equal(plan.program.rules.some(r=>r.code==='401'),false);assert.equal(plan.summary.consumedInputDefinitions,1);
});

test('typed evidence is normalized without dropping historical participation treatments from the complete programme',async()=>{
 const f=preparedProgramFixture({prior:true}),input=structuredClone(f.input);
 input.programmeOptions.periodParticipation={version:OWN_PARTICIPATION_VERSION,fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:f.preparation.draft.programme.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Tratamiento exclusivamente ficticio revisado'}))};
 const preparation=prepareOwnPayrollProgrammeSource(input),plan=await reviewPreparedProgramDraft(input.salary,input.programme,f.draft,JSON.stringify(preparation));
 assert.equal(plan.program.rules.length,2);assert.equal(plan.file.draft.typedRules.length,1);assert.equal(plan.program.periodParticipation.treatments.length,2);
});

test('period month keeps the preparer string contract and never coerces a numeric replacement',async()=>{
 const f=preparedProgramFixture();assert.equal(f.preparation.context.month.value,'9');
 const plan=await review(f);assert.equal(plan.file.context.month.value,'9');
 const numeric=structuredClone(f.preparation);numeric.context.month.value=9;
 await assert.rejects(review(f,signed(numeric)),code('PROGRAM_PREPARED_INVALID'));
});