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

import {ownMonetaryProtocolHash} from '../assets/own-payroll-monetary-policy.js';
const invalidCode=error=>error?.code==='OWN_MONETARY_TEXT_UNREPRESENTABLE';
const invalidTexts=[['unpaired_high',String.fromCharCode(0xd800)],['unpaired_low',String.fromCharCode(0xdc00)],['separated_pair',String.fromCharCode(0xd800)+'A'+String.fromCharCode(0xdc00)],['reversed_pair',String.fromCharCode(0xdc00,0xd800)]];
for(const [label,invalid]of invalidTexts)test('JSONB incompatible text rejected before policy/manifest hashing: '+label,async()=>{
 const f=fixture(reference+' '+invalid),d=definition(f),before=clone({f,d});
 assert.throws(()=>verifyOwnMonetaryPolicySync(f.policy,f.source),invalidCode);
 await assert.rejects(()=>verifyOwnMonetaryPolicy(f.policy,f.source),invalidCode);
 assert.throws(()=>verifyOwnMonetaryProgrammeManifestSync(d),invalidCode);
 await assert.rejects(()=>verifyOwnMonetaryProgrammeManifest(d),invalidCode);
 assert.deepEqual({f,d},before);
});
for(const [label,invalid]of [['nul',String.fromCharCode(0)],...invalidTexts])test('JSONB incompatible object keys are rejected: '+label,async()=>{
 const key=invalid,raw={[key]:'synthetic'},before=clone(raw);
 await assert.rejects(()=>ownMonetaryProtocolHash(raw),invalidCode);assert.deepEqual(raw,before);
});
test('JSONB compatible supplementary characters keep independent UTF8 digests and false authority',async()=>{
 const label=reference+' '+String.fromCodePoint(0x1f3db,0x1d400),f=fixture(label),d=definition(f),before=clone({f,d});
 const sync=verifyOwnMonetaryProgrammeManifestSync(d),web=await verifyOwnMonetaryProgrammeManifest(d);
 assert.deepEqual(sync,web);assert.equal(sync.definitionSha256,hash(d));
 assert.equal(sync.definition.rules[0].ruleReference,label);
 for(const field of ['programmeStructureValidated','sqlCustodyValidated','approvalAuthorityValidated','approved','presentable','executable','payrollCalculated','payrollPosted'])assert.equal(sync[field],false);
 assert.deepEqual({f,d},before);
});