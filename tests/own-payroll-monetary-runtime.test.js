import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {beginOwnMonetaryPolicyVerification,verifyOwnMonetaryPolicy,ownMonetaryPolicyStructure} from '../assets/own-payroll-monetary-policy.js';
import {OWN_MONETARY_MANIFEST_VERSION,beginOwnMonetaryProgrammeVerification,ownMonetaryProgrammeStructure,verifyOwnMonetaryProgrammeManifest} from '../assets/own-payroll-monetary-manifest.js';
import {verifyOwnMonetaryPolicySync,verifyOwnMonetaryProgrammeManifestSync} from '../lib/own-payroll-monetary-verification.js';

// Independent fixture oracle. No programme normalizer, evaluator or QA import.
const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value),'utf8').digest('hex');
const reference='Fuente exclusivamente sintética de precisión';
const evidence=hash({fixture:'not-a-municipal-rule'});
function fixture(label=reference){
 const rule={agreementCode:'1',code:'100',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:label,rounding:{precision:2,mode:'half_even'},expression:{op:'divide',left:{op:'literal',unit:'money',value:'1.00'},right:{op:'literal',unit:'coefficient',value:'3'}}};
 const program={namespaceVersion:'own-payroll-namespaces.v2',rules:[rule],bindings:[],totalsPrecision:2};
 const source={version:'own-program-monetary-source.v1',complete:true,program,programSha256:hash(program),sourceReference:label,sourceSha256:evidence};
 const identity={namespaceVersion:program.namespaceVersion,kind:'concept',agreementCode:'1',code:'100',nature:'remuneration',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly']};
 const nodes=[['expression','divide',null],['expression.left','literal','money'],['expression.right','literal','coefficient']].map(([path,operation,declaredUnit])=>({path,operation,declaredUnit,stage:'expression_exact'}));
 const row={identity,unit:'money',stage:'rule_result',rounding:clone(rule.rounding),ruleReference:label,ruleSha256:hash(rule),expressionSha256:hash(rule.expression),nodes};
 const {ruleReference:_reference,nodes:_nodes,...entry}=clone(row);
 const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:hash(source),programSha256:hash(program),inventorySha256:hash({version:source.version,programSha256:hash(program),bindingsSha256:hash([]),inventory:[row]}),entries:[{...entry,sourceReference:label,sourceSha256:evidence}]};
 return {source,policy:{...unsigned,policySha256:hash(unsigned)}};
}
const definition=f=>({...clone(f.source.program),monetaryPolicyVersion:OWN_MONETARY_MANIFEST_VERSION,monetaryPolicy:{sourceReference:f.source.sourceReference,sourceSha256:f.source.sourceSha256,policy:clone(f.policy)}});
const code=expected=>error=>error?.code===expected;
function independentDriver(steps){let state=steps.next(),calls=0;while(!state.done){assert.equal(typeof state.value,'string');calls++;state=steps.next(createHash('sha256').update(state.value,'utf8').digest('hex'));}return {value:state.value,calls};}
function noApproval(value){for(const field of ['programmeStructureValidated','approvalAuthorityValidated','approved','presentable','executable'])assert.equal(value[field],false,field);assert.equal(Object.hasOwn(value,'requestKey'),false);assert.equal(Object.hasOwn(value,'command'),false);}

test('Node and WebCrypto verify the same complete policy and full definition',async()=>{
 const f=fixture(),d=definition(f),syncPolicy=verifyOwnMonetaryPolicySync(f.policy,f.source),webPolicy=await verifyOwnMonetaryPolicy(f.policy,f.source);
 assert.deepEqual(syncPolicy,webPolicy);noApproval(syncPolicy);
 const sync=verifyOwnMonetaryProgrammeManifestSync(d),web=await verifyOwnMonetaryProgrammeManifest(d);
 assert.deepEqual(sync,web);noApproval(sync);assert.equal(sync.definitionSha256,hash(d));assert.equal(sync.sourceProgramSha256,hash(f.source.program));assert.notEqual(sync.definitionSha256,sync.sourceProgramSha256);
});
test('begin policy captures every value before returning a lazy iterator',()=>{
 const f=fixture(),expected=clone(f),steps=beginOwnMonetaryPolicyVerification(f.policy,f.source);
 f.source.program.rules[0].expression.left.value='999';f.policy.entries[0].sourceReference='Changed after begin';f.source.bindings=[];
 const result=independentDriver(steps);assert.equal(result.calls,7);assert.deepEqual(result.value.policy,expected.policy);assert.deepEqual(result.value.source.source,expected.source);noApproval(result.value);
});
test('begin manifest captures values before the very first next call',()=>{
 const f=fixture(),d=definition(f),expected=clone(d),steps=beginOwnMonetaryProgrammeVerification(d);
 d.rules[0].rounding.mode='floor';d.monetaryPolicy.policy.entries[0].sourceSha256='0'.repeat(64);d.monetaryPolicy.sourceReference='Changed after begin';
 const result=independentDriver(steps);assert.equal(result.calls,8);assert.deepEqual(result.value.definition,expected);assert.equal(result.value.definitionSha256,hash(expected));
});
test('declaration structure explicitly does not verify a forged digest',async()=>{
 const f=fixture();f.policy.policySha256='0'.repeat(64);const shaped=ownMonetaryPolicyStructure(f.policy,f.source);
 assert.equal(shaped.integrityValidated,false);noApproval(shaped);
 assert.throws(()=>verifyOwnMonetaryPolicySync(f.policy,f.source),code('OWN_MONETARY_INTEGRITY_CHANGED'));
 await assert.rejects(()=>verifyOwnMonetaryPolicy(f.policy,f.source),code('OWN_MONETARY_INTEGRITY_CHANGED'));
 const d=definition(f),outer=ownMonetaryProgrammeStructure(d);assert.equal(outer.integrityValidated,false);noApproval(outer);
 assert.throws(()=>verifyOwnMonetaryProgrammeManifestSync(d),code('OWN_MONETARY_INTEGRITY_CHANGED'));
});
test('structural envelope is fully captured and frozen but remains unapproved',()=>{
 const f=fixture(),d=definition(f),expected=clone(d),s=ownMonetaryProgrammeStructure(d);
 assert.deepEqual(s.definition,expected);assert.equal(s.definitionBytes,Buffer.byteLength(canonical(expected),'utf8'));
 d.rules[0].expression.left.value='900';d.monetaryPolicy.sourceReference='Mutated after structural capture';
 assert.deepEqual(s.definition,expected);for(const v of [s,s.definition,s.definition.rules,s.definition.rules[0],s.definition.monetaryPolicy.policy.entries[0]])assert.equal(Object.isFrozen(v),true);
 assert.equal(s.integrityValidated,false);noApproval(s);
});
for(const [label,change]of [
 ['expression',d=>d.rules[0].expression.left.value='2.00'],
 ['binding',d=>d.bindings.push({key:'not-a-valid-binding'})],
 ['source',d=>d.monetaryPolicy.sourceReference='Different declared source'],
 ['rule hash',d=>d.monetaryPolicy.policy.entries[0].ruleSha256='0'.repeat(64)],
 ['policy hash',d=>d.monetaryPolicy.policy.policySha256='0'.repeat(64)],
])test('both full verifiers reject changed '+label,async()=>{
 const d=definition(fixture());change(d);let syncError;try{verifyOwnMonetaryProgrammeManifestSync(d);}catch(error){syncError=error;}assert.ok(syncError?.code);
 await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d),error=>error?.code===syncError.code);
});
test('structural verification rejects intermediate rounding before any digest',()=>{
 const f=fixture();f.source.program.rules[0].expression={op:'round',value:f.source.program.rules[0].expression,rounding:{precision:2,mode:'half_even'}};
 assert.throws(()=>ownMonetaryPolicyStructure(f.policy,f.source),code('OWN_MONETARY_INTERMEDIATE_FORBIDDEN'));
});
test('begin rejects accessors synchronously without invoking one',()=>{
 const f=fixture();let calls=0;Object.defineProperty(f.source.program.rules[0].expression,'left',{enumerable:true,get(){calls++;return null;}});
 assert.throws(()=>beginOwnMonetaryPolicyVerification(f.policy,f.source));assert.equal(calls,0);
});
test('digest steps reject a Promise or malformed digest',()=>{
 for(const bad of [Promise.resolve('0'.repeat(64)),'not-a-digest']){const f=fixture(),steps=beginOwnMonetaryPolicyVerification(f.policy,f.source);assert.equal(steps.next().done,false);assert.throws(()=>steps.next(bad),code('OWN_MONETARY_DIGEST_INVALID'));}
});
test('UTF8 source text is hashed identically by both concrete drivers',async()=>{
 const f=fixture('Fuente sintética Junín Ω 漢 🏛️ con NFC'),d=definition(f),sync=verifyOwnMonetaryProgrammeManifestSync(d);
 assert.deepEqual(sync,await verifyOwnMonetaryProgrammeManifest(d));assert.equal(sync.definitionSha256,hash(d));assert.equal(sync.definitionBytes,Buffer.byteLength(canonical(d),'utf8'));
});
