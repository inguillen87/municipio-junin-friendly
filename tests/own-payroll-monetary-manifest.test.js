import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 OWN_MONETARY_MANIFEST_VERSION,OWN_MONETARY_MANIFEST_MAX_BYTES,
 prepareOwnMonetaryProgrammeDraft,verifyOwnMonetaryProgrammeManifest,
} from '../assets/own-payroll-monetary-manifest.js';

const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const reference='Fuente exclusivamente sintética; no es una regla municipal';
const sourceSha256=hash({fixture:'synthetic-manifest-source'});
const node=(path,operation,declaredUnit)=>({path,operation,declaredUnit,stage:'expression_exact'});
function fixture(padding=null){
 const common={agreementCode:'1',code:'100',validFrom:'2026-10',validUntil:'2026-12',liquidationTypes:['monthly'],ruleReference:reference};
 const rules=[
  {...clone(common),nature:'remuneration',unit:'money',rounding:{precision:2,mode:'half_even'},expression:{op:'divide',left:{op:'multiply',left:{op:'literal',unit:'money',value:'1'},right:{op:'literal',unit:'coefficient',value:'16'}},right:{op:'literal',unit:'coefficient',value:'30'}}},
  {...clone(common),nature:'auxiliary',unit:'coefficient',rounding:{precision:8,mode:'exact'},expression:{op:'literal',unit:'coefficient',value:'30'}},
 ];
 const program={namespaceVersion:'own-payroll-namespaces.v2',rules,bindings:[],totalsPrecision:2};
 // Opaque synthetic padding exercises envelope size only. It does not claim a
 // valid fixed-forced programme; structure validation is expressly outside R2.
 if(padding!==null)program.fixedForcedAmountsPolicy={syntheticPadding:'x'.repeat(padding)};
 const source={version:'own-program-monetary-source.v1',complete:true,program,programSha256:hash(program),sourceReference:reference,sourceSha256};
 const nodeSets=[
  [node('expression','divide',null),node('expression.left','multiply',null),node('expression.left.left','literal','money'),node('expression.left.right','literal','coefficient'),node('expression.right','literal','coefficient')],
  [node('expression','literal','coefficient')],
 ];
 const inventory=rules.map((r,i)=>({identity:{namespaceVersion:program.namespaceVersion,kind:r.nature==='auxiliary'?'auxiliary':'concept',agreementCode:r.agreementCode,code:r.code,nature:r.nature,validFrom:r.validFrom,validUntil:r.validUntil,liquidationTypes:clone(r.liquidationTypes)},unit:r.unit,stage:'rule_result',rounding:clone(r.rounding),ruleReference:r.ruleReference,ruleSha256:hash(r),expressionSha256:hash(r.expression),nodes:nodeSets[i]}));
 const entries=inventory.filter(row=>row.unit==='money').map(row=>({identity:clone(row.identity),unit:row.unit,stage:row.stage,rounding:clone(row.rounding),ruleSha256:row.ruleSha256,expressionSha256:row.expressionSha256,sourceReference:reference,sourceSha256}));
 const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:hash(source),programSha256:hash(program),inventorySha256:hash({version:source.version,programSha256:hash(program),bindingsSha256:hash(program.bindings),inventory}),entries};
 return {source,policy:{...unsigned,policySha256:hash(unsigned)}};
}
const definition=f=>({...clone(f.source.program),monetaryPolicyVersion:OWN_MONETARY_MANIFEST_VERSION,monetaryPolicy:{sourceReference:f.source.sourceReference,sourceSha256:f.source.sourceSha256,policy:clone(f.policy)}});
function assertNotApproved(result){
 for(const key of ['programmeStructureValidated','sqlCustodyValidated','approvalAuthorityValidated','legacyReplayImplemented','presentable','approved','executable','payrollCalculated','payrollPosted'])assert.equal(result[key],false,key);
 assert.equal(result.sourceEvidence,'declared_not_document_revalidated');
 assert.equal(Object.hasOwn(result,'command'),false);assert.equal(Object.hasOwn(result,'requestKey'),false);
}

test('manifest binds base content and full definition separately, without circular hashes or approval',async()=>{
 const f=fixture(),result=await prepareOwnMonetaryProgrammeDraft(f.policy,f.source);
 assert.deepEqual(result.definition,definition(f));assert.equal(result.sourceProgramSha256,hash(f.source.program));
 assert.equal(result.definitionSha256,hash(result.definition));assert.notEqual(result.definitionSha256,result.sourceProgramSha256);
 assert.equal(result.monetaryPolicySha256,f.policy.policySha256);assert.equal(result.definitionBytes,Buffer.byteLength(canonical(result.definition),'utf8'));
 assert.deepEqual(result.definition.rules[0].expression,f.source.program.rules[0].expression,'1 x16/30 remains an unevaluated declared expression');
 assert.equal(result.definition.rules[0].rounding.mode,'half_even','solely the explicitly supplied synthetic declaration');
 assert.ok(Object.isFrozen(result.definition.monetaryPolicy.policy.entries[0].identity));assertNotApproved(result);
});

test('persistable envelope reconstructs exactly the original R2 source on verification',async()=>{
 const f=fixture(),result=await verifyOwnMonetaryProgrammeManifest(definition(f));
 assert.deepEqual(result.definition,definition(f));assert.equal(result.sourceProgramSha256,f.source.programSha256);assertNotApproved(result);
});

for(const [label,mutate]of [
 ['expression',d=>{d.rules[0].expression.left.right.value='17';}],
 ['bindings',d=>{d.bindings.push({syntheticChanged:true});}],
 ['validity',d=>{d.rules[0].validUntil='2027-01';}],
 ['source reference',d=>{d.monetaryPolicy.sourceReference='Otra fuente exclusivamente sintética';}],
 ['source digest',d=>{d.monetaryPolicy.sourceSha256=hash({fixture:'other-source'});}],
])test('old manifest rejects changed '+label,async()=>{
 const f=fixture(),d=definition(f);mutate(d);
 await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d),error=>error.code==='OWN_MONETARY_SOURCE_CHANGED');
});

test('an event version cannot stand in for source programme content',async()=>{
 const f=fixture(),d=definition(f);d.monetaryPolicy.policy.programSha256='f'.repeat(64);
 const {policySha256,...unsigned}=d.monetaryPolicy.policy;d.monetaryPolicy.policy.policySha256=hash(unsigned);
 await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d),error=>error.code==='OWN_MONETARY_SOURCE_CHANGED');
});

test('unsigned policy change is not hidden by the definition envelope',async()=>{
 const f=fixture(),d=definition(f);d.monetaryPolicy.policy.entries[0].sourceReference='Otra referencia exclusivamente sintética';
 await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d),error=>error.code==='OWN_MONETARY_INTEGRITY_CHANGED');
});

test('version, paired fields and exact outer manifest are mandatory',async()=>{
 const f=fixture();
 for(const change of [d=>{delete d.monetaryPolicy;},d=>{delete d.monetaryPolicyVersion;},d=>{d.monetaryPolicyVersion='unknown';},d=>{d.monetaryPolicy.extra=true;}]){
  const d=definition(f);change(d);await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d),error=>error.code==='OWN_MONETARY_MANIFEST_INVALID');
 }
 const already=fixture();already.source.program.monetaryPolicyVersion=OWN_MONETARY_MANIFEST_VERSION;
 await assert.rejects(()=>prepareOwnMonetaryProgrammeDraft(already.policy,already.source));
});

test('all raw prepare inputs are captured before the first asynchronous digest',async()=>{
 const f=fixture(),expected=definition(f),pending=prepareOwnMonetaryProgrammeDraft(f.policy,f.source);
 f.source.program.rules[0].expression.left.right.value='999';f.source.sourceReference='Changed raw source';f.policy.entries[0].rounding.mode='floor';
 const result=await pending;assert.deepEqual(result.definition,expected);assertNotApproved(result);
});

test('verification never rereads nested original data after yielding',async()=>{
 const f=fixture(),d=definition(f),expected=clone(d),pending=verifyOwnMonetaryProgrammeManifest(d);
 d.rules[0].expression.left.right.value='999';d.monetaryPolicy.sourceReference='Changed raw source';d.monetaryPolicy.policy.entries[0].rounding.mode='ceiling';
 const result=await pending;assert.deepEqual(result.definition,expected);assertNotApproved(result);
});

test('top-level and nested getters are rejected without invocation',async()=>{
 let reads=0;
 for(const at of ['definition','manifest','policy','nested']){
  const f=fixture(),d=definition(f);
  const [target,key]=at==='definition'?[d,'monetaryPolicyVersion']:at==='manifest'?[d.monetaryPolicy,'policy']:at==='policy'?[d.monetaryPolicy.policy,'programSha256']:[d.rules[0].expression.left.right,'value'];
  Object.defineProperty(target,key,{enumerable:true,get(){reads++;throw Error('must not invoke');}});
  await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d));
 }
 assert.equal(reads,0);
});

test('complete envelope includes its annex in the4MiB boundary without truncation',async()=>{
 const empty=fixture(0),overhead=Buffer.byteLength(canonical(definition(empty)),'utf8'),padding=OWN_MONETARY_MANIFEST_MAX_BYTES-overhead;
 const exact=fixture(padding),result=await prepareOwnMonetaryProgrammeDraft(exact.policy,exact.source);
 assert.equal(result.definitionBytes,OWN_MONETARY_MANIFEST_MAX_BYTES);assert.equal(result.definition.fixedForcedAmountsPolicy.syntheticPadding.length,padding);assertNotApproved(result);
 const tooLarge=fixture(padding+1);
 await assert.rejects(()=>prepareOwnMonetaryProgrammeDraft(tooLarge.policy,tooLarge.source),error=>error.code==='OWN_MONETARY_MANIFEST_LIMIT');
});

test('intermediate rounding remains forbidden even with a valid self-hash',async()=>{
 const f=fixture();f.source.program.rules[0].expression={op:'round',value:{op:'literal',unit:'money',value:'1'},rounding:{precision:2,mode:'half_up'}};
 f.source.programSha256=hash(f.source.program);
 await assert.rejects(()=>prepareOwnMonetaryProgrammeDraft(f.policy,f.source),error=>error.code==='OWN_MONETARY_INTERMEDIATE_FORBIDDEN');
});
