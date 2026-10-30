// Proposed CI regressions. SOURCE ONLY: not executed or admitted locally.
// Requires the root-reviewed R3 envelope/core and the complete source closure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  ownProgramMonetary,ownProgramFields,ownProgramStructure,ownProgramDefinition,
  ownProgramHistory,ownProgramCommand,ownProgramBootstrap,ownProgramReceipt,
} from '../assets/own-payroll-program-model.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';
import {OWN_MONETARY_MANIFEST_VERSION,verifyOwnMonetaryProgrammeManifest} from '../assets/own-payroll-monetary-manifest.js';

const clone=value=>structuredClone(value);
// Independent Node oracle; never use the monetary driver's hash to author its input.
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const reference='Respaldo exclusivamente sintetico; sin norma municipal';
const hash=character=>character.repeat(64);
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');

function base(){
  const rule=(code,nature,key)=>({code,agreementCode:'1',nature,unit:'money',validFrom:'2026-10',validUntil:null,
    liquidationTypes:['monthly','supplementary'],ruleReference:reference,rounding:{precision:2,mode:'half_even'},expression:{op:'input',key,unit:'money'}});
  const binding=(key,code)=>({agreementCode:'1',key,unit:'money',sourceKind:'monthly_amount',sourceCode:code,onMissing:'error',combine:'single',ruleReference:reference});
  return {namespaceVersion:'own-payroll-namespaces.v2',rules:[rule('100','remuneration','alpha'),rule('200','deduction','zeta')],bindings:[binding('alpha','100'),binding('zeta','200')],totalsPrecision:2};
}
function declared(program=base()){
  const sourceSha256=digest({fixture:'nonmunicipal-monetary-program-source'}),source={version:'own-program-monetary-source.v1',complete:true,program:clone(program),programSha256:digest(program),sourceReference:reference,sourceSha256};
  const inventory=program.rules.map(r=>({identity:{namespaceVersion:program.namespaceVersion,kind:r.nature==='auxiliary'?'auxiliary':'concept',agreementCode:r.agreementCode,code:r.code,nature:r.nature,validFrom:r.validFrom,validUntil:r.validUntil,liquidationTypes:clone(r.liquidationTypes)},unit:r.unit,stage:'rule_result',rounding:clone(r.rounding),ruleReference:r.ruleReference,ruleSha256:digest(r),expressionSha256:digest(r.expression),nodes:[{path:'expression',operation:'input',declaredUnit:'money',stage:'expression_exact'}]}));
  const entries=inventory.map(({identity,unit,stage,rounding,ruleSha256,expressionSha256})=>({identity,unit,stage,rounding,ruleSha256,expressionSha256,sourceReference:reference,sourceSha256}));
  const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:digest(source),programSha256:digest(program),inventorySha256:digest({version:source.version,programSha256:digest(program),bindingsSha256:digest(program.bindings),inventory}),entries};
  return {...clone(program),monetaryPolicyVersion:OWN_MONETARY_MANIFEST_VERSION,monetaryPolicy:{sourceReference:reference,sourceSha256,policy:{...unsigned,policySha256:digest(unsigned)}}};
}
const withoutManifest=p=>{const {monetaryPolicyVersion,monetaryPolicy,...rest}=p;return rest;};
const catalogue=p=>p.rules.map(r=>({kind:'concept',agreementCode:r.agreementCode,categoryCode:null,code:r.code,label:'Concepto sintetico '+r.code,active:true,nature:r.nature,unit:r.unit,precision:2,validFrom:r.validFrom,validUntil:r.validUntil,value:null,dependencies:[],ruleReference:reference}));
const command=p=>({command:'propose',scopeVersion:hash('a'),baseVersion:hash('b'),salaryVersion:hash('c'),proposalId:null,proposalSha256:null,program:p,reason:reference,reviewConfirmed:false});

test('legacy normalization and its shape remain unchanged without monetary fields',()=>{
  const raw=base(),expected=clone(raw);raw.rules.reverse();raw.bindings.reverse();raw.rules[0].liquidationTypes.reverse();
  const result=ownProgramStructure(raw);
  assert.deepEqual(result,expected);assert.equal(ownProgramMonetary(result),false);
  assert.deepEqual(ownProgramFields(result),['namespaceVersion','rules','bindings','totalsPrecision']);
  assert.equal(Object.hasOwn(result,'monetaryPolicyVersion'),false);assert.equal(Object.hasOwn(result,'monetaryPolicy'),false);
});

test('the explicit pair survives structure, approved catalogue linkage and command encoding',()=>{
  const raw=declared(),saved=clone(raw),result=ownProgramStructure(raw);
  assert.deepEqual(result,saved);assert.deepEqual(raw,saved);assert.equal(ownProgramMonetary(result),true);
  assert.ok(ownProgramFields(result).includes('monetaryPolicyVersion'));assert.ok(ownProgramFields(result).includes('monetaryPolicy'));
  assert.deepEqual(ownProgramDefinition(raw,catalogue(raw)),saved);
  const body=ownProgramCommand(command(raw),catalogue(raw));assert.deepEqual(body.program,saved);
  assert.notEqual(digest(body),digest({...body,program:withoutManifest(body.program)}),'the future request digest must include the whole annex');
  for(const flag of ['integrityValidated','approved','executable','approvalAuthorityValidated'])assert.equal(Object.hasOwn(result,flag),false,'the schema does not add '+flag);
});

for(const [label,change] of [
  ['missing policy',p=>{delete p.monetaryPolicy;}],
  ['missing version',p=>{delete p.monetaryPolicyVersion;}],
  ['unknown version',p=>{p.monetaryPolicyVersion='unknown';}],
  ['extra envelope field',p=>{p.monetaryPolicy.extra=true;}],
])test('an invalid opt-in pair is rejected: '+label,()=>{
  const p=declared();change(p);assert.throws(()=>ownProgramStructure(p));
});

for(const [label,change] of [
  ['rules',p=>p.rules.reverse()],
  ['bindings',p=>p.bindings.reverse()],
  ['liquidation types',p=>p.rules[0].liquidationTypes.reverse()],
])test('a declaration over an unordered raw '+label+' base is not silently resealed',()=>{
  const raw=base();change(raw);const p=declared(raw),saved=clone(p);
  // All supplied digest values describe that raw base. The schema must still
  // reject it because its own canonical structure would have different bytes.
  assert.equal(p.monetaryPolicy.policy.programSha256,digest(raw));
  assert.throws(()=>ownProgramStructure(p),error=>error.code==='PROGRAM_MONETARY_BASE_CHANGED');
  assert.deepEqual(p,saved);
});

test('inert opt-in capture does not invoke outer or nested accessors',()=>{
  let reads=0;
  for(const location of ['version','policy','nested']){
    const p=declared(),[target,key]=location==='version'?[p,'monetaryPolicyVersion']:location==='policy'?[p,'monetaryPolicy']:[p.rules[0].expression,'key'];
    Object.defineProperty(target,key,{enumerable:true,get(){reads++;throw Error('must not invoke');}});
    assert.throws(()=>ownProgramStructure(p));
  }
  assert.equal(reads,0);
});

test('the returned opt-in definition has no nested aliases to mutable original inputs',()=>{
  const raw=declared(),expected=clone(raw),result=ownProgramStructure(raw);
  raw.rules[0].expression.key='changed';raw.monetaryPolicy.policy.entries[0].identity.code='999';
  assert.deepEqual(result,expected);
});

test('schema acceptance does not substitute for complete cryptographic verification',async()=>{
  const raw=declared();raw.monetaryPolicy.policy.policySha256=hash('f');
  const result=ownProgramStructure(raw);assert.equal(result.monetaryPolicy.policy.policySha256,hash('f'));
  await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(result),error=>error.code==='OWN_MONETARY_INTEGRITY_CHANGED');
});

test('catalogue linkage remains mandatory even with a complete structural annex',()=>{
  const raw=declared();assert.throws(()=>ownProgramDefinition(raw,catalogue(raw).slice(0,1)),error=>error.code==='DEFINITION_MISSING');
});

test('history preserves legacy reading and rejects removal of an established opt-in',()=>{
  const legacy=base(),optedIn=declared();
  assert.doesNotThrow(()=>ownProgramHistory(legacy,clone(legacy)));
  assert.doesNotThrow(()=>ownProgramHistory(legacy,optedIn));
  assert.doesNotThrow(()=>ownProgramHistory(optedIn,clone(optedIn)));
  assert.throws(()=>ownProgramHistory(optedIn,withoutManifest(optedIn)),error=>error.code==='PROGRAM_HISTORY_REQUIRED');
});

test('the synchronous exact-change guard remains strict despite an annex',()=>{
  const raw=declared(),program=ownProgramStructure(raw);
  assert.throws(()=>requireExactProgramChanges(null,program),error=>error.code==='PROGRAM_PRECISION_REQUIRED');
  const legacy=base();legacy.rules.forEach(r=>{r.rounding.mode='exact';});assert.equal(requireExactProgramChanges(null,ownProgramStructure(legacy)).rules.length,2);
});

test('bootstrap and historical proposal receipts preserve the complete structural annex',()=>{
  const p=declared(),body=ownProgramCommand(command(p)),id=uid(3),key=uid(4),items=catalogue(p);
  const boot={version:'own-payroll-program.v1',scopeVersion:hash('a'),salaryCatalog:{version:hash('c'),revision:1,items},program:{version:hash('b'),revision:0,definition:null,salaryVersion:null,proposalId:null,approvalId:null},proposals:[{id,requestSha256:digest(body),baseVersion:hash('b'),salaryVersion:hash('c'),salaryItems:items,baseDefinition:null,definition:p,reason:reference,createdAt:'2026-10-22T12:00:00Z',authorLabel:'Operador sintetico',canReview:true,status:'pending',decision:null}],permissions:{canPropose:true,canReview:true},payrollCalculated:false,payrollPosted:false};
  assert.equal(ownProgramBootstrap(boot),boot);assert.deepEqual(boot.proposals[0].definition,p);
  const receipt={version:'own-payroll-program.v1',eventId:id,proposalId:id,requestKey:key,requestSha256:digest(body),body,status:'pending',revision:0,programVersion:body.baseVersion,replayed:true,payrollCalculated:false,payrollPosted:false};
  assert.equal(ownProgramReceipt(receipt,{key,body}),receipt);assert.deepEqual(receipt.body.program,p);
});
