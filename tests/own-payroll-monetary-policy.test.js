import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as protocol from '../assets/own-payroll-monetary-policy.js';
const {ownMonetaryProtocolHash:hash,inspectOwnMonetaryPolicySource:inspect,verifyOwnMonetaryPolicy:verify,requireOwnMonetaryHistory:history}=protocol;
const MAX_BYTES=8*1024*1024,MAX_NODES=1_000_000;
const code=expected=>error=>error?.code===expected;
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const independentHash=value=>sha(canonical(value));
async function fixture(){
 const rule={code:'88',agreementCode:'1',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly'],ruleReference:'Referencia exclusivamente sintética',rounding:{precision:2,mode:'half_up'},expression:{op:'multiply',left:{op:'literal',unit:'money',value:'1.00'},right:{op:'divide',left:{op:'literal',unit:'days',value:'16'},right:{op:'literal',unit:'days',value:'30'}}}};
 const auxiliary={...clone(rule),nature:'auxiliary',unit:'coefficient',rounding:{precision:2,mode:'exact'},expression:{op:'literal',unit:'coefficient',value:'2'}};
 const deduction={...clone(rule),code:'614',nature:'deduction',expression:{op:'literal',unit:'money',value:'0.50'}};
 const program={namespaceVersion:'own-payroll-namespaces.v2',rules:[rule,auxiliary,deduction],bindings:[],totalsPrecision:2};
 const source={version:'own-program-monetary-source.v1',complete:true,program,programSha256:independentHash(program),sourceReference:'Documento inventado para prueba del protocolo',sourceSha256:sha('synthetic evidence, not a municipal rule')};
 const identity=(kind,nature,code='88')=>({namespaceVersion:'own-payroll-namespaces.v2',kind,agreementCode:'1',code,nature,validFrom:'2026-10',validUntil:null,liquidationTypes:['monthly']});
 const node=(path,operation,declaredUnit)=>({path,operation,declaredUnit,stage:'expression_exact'});
 const expectedInventory=[
  {identity:identity('concept','remuneration'),unit:'money',stage:'rule_result',rounding:{precision:2,mode:'half_up'},ruleReference:rule.ruleReference,ruleSha256:independentHash(rule),expressionSha256:independentHash(rule.expression),nodes:[node('expression','multiply',null),node('expression.left','literal','money'),node('expression.right','divide',null),node('expression.right.left','literal','days'),node('expression.right.right','literal','days')]},
  {identity:identity('auxiliary','auxiliary'),unit:'coefficient',stage:'rule_result',rounding:{precision:2,mode:'exact'},ruleReference:auxiliary.ruleReference,ruleSha256:independentHash(auxiliary),expressionSha256:independentHash(auxiliary.expression),nodes:[node('expression','literal','coefficient')]},
  {identity:identity('concept','deduction','614'),unit:'money',stage:'rule_result',rounding:{precision:2,mode:'half_up'},ruleReference:deduction.ruleReference,ruleSha256:independentHash(deduction),expressionSha256:independentHash(deduction.expression),nodes:[node('expression','literal','money')]}
 ];
 const expectedInventorySha256=independentHash({version:'own-program-monetary-source.v1',programSha256:source.programSha256,bindingsSha256:independentHash([]),inventory:expectedInventory});
 const current=await inspect(source);
 const unsigned={version:'own-program-monetary-policy.v1',complete:true,sourceStateSha256:independentHash(source),programSha256:source.programSha256,inventorySha256:expectedInventorySha256,entries:expectedInventory.filter(row=>row.unit==='money').map(row=>({...clone(row),sourceReference:'Política inventada para prueba, no aprobada',sourceSha256:sha('synthetic rounding declaration')})).map(({nodes,ruleReference,...row})=>row)};
 const policy={...unsigned,policySha256:independentHash(unsigned)};
 return {source,current,policy,expectedInventory,expectedInventorySha256};
}
async function resign(policy){const{policySha256,...unsigned}=policy;return{...unsigned,policySha256:await hash(unsigned)};}
async function sourceChange(source,change){const next=clone(source);change(next.program);next.programSha256=await hash(next.program);return next;}
async function withoutDigest(callback){
 const subtle=globalThis.crypto.subtle,original=subtle.digest;let calls=0;
 subtle.digest=function(...args){calls++;return Reflect.apply(original,this,args);};
 try{await callback();assert.equal(calls,0,'rejected input must never reach a digest');}
 finally{subtle.digest=original;}
}

test('coherent synthetic policy is immutable declared evidence, never approval or executable programme',async()=>{
 const{source,policy,current,expectedInventory,expectedInventorySha256}=await fixture(),result=await verify(policy,source);
 assert.deepEqual(current.inventory,expectedInventory);
 assert.equal(current.inventorySha256,expectedInventorySha256);
 assert.equal(current.sourceStateSha256,independentHash(source));
 for(const key of ['programmeStructureValidated','approvalAuthorityValidated','legacyReplayImplemented','approved','executable','presentable'])assert.equal(result[key],false,key);
 assert.equal(result.source.sourceEvidence,'declared_not_document_revalidated');
 assert.equal(result.source.inventory.length,3);assert.equal(result.policy.entries.length,2);
 assert.notEqual(result.source.inventory[0].identity.kind,result.source.inventory[1].identity.kind);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.source.source.program.rules[0].expression));
 assert.equal(result.source.source.program.rules[0].rounding.mode,'half_up','explicit synthetic input is preserved, not selected by this protocol');
});
test('empty or partial monetary coverage fails atomically',async()=>{
 // Empty lists violate the declared shape; nonempty incomplete populations
 // reach the narrower coverage guard. Both must reject the entire declaration.
 for(const[mutate,expected]of [
  [p=>p.entries=[],'OWN_MONETARY_CONTRACT_INVALID'],
  [p=>p.entries.pop(),'OWN_MONETARY_COVERAGE_REQUIRED'],
  [p=>p.entries.push(clone(p.entries[0])),'OWN_MONETARY_COVERAGE_REQUIRED'],
  [p=>p.entries.reverse(),'OWN_MONETARY_COVERAGE_REQUIRED']
 ]){
  const{source,policy}=await fixture();mutate(policy);
  await assert.rejects(verify(await resign(policy),source),code(expected));
 }
});
test('duplicate identities cannot replace distinct monetary targets',async()=>{
 const{source,policy}=await fixture();policy.entries[1]=clone(policy.entries[0]);
 await assert.rejects(verify(await resign(policy),source),code('OWN_MONETARY_DUPLICATE'));
});
test('identity, expression and rule hash changes cannot reuse a declaration',async()=>{
 for(const mutate of [p=>p.entries[0].identity.agreementCode='2',p=>p.entries[0].expressionSha256='c'.repeat(64),p=>p.entries[0].ruleSha256='d'.repeat(64)]){
  const{source,policy}=await fixture();mutate(policy);
  await assert.rejects(verify(await resign(policy),source),code('OWN_MONETARY_COVERAGE_REQUIRED'));
 }
});
for(const[field,value]of [
 ['namespaceVersion','other-namespace.v1'],['kind','auxiliary'],['code','101'],
 ['nature','non_remuneration'],['validFrom','2026-11'],['validUntil','2027-01'],
 ['liquidationTypes',['supplementary']]
])test('source identity binds '+field,async()=>{
 const{source,policy}=await fixture();policy.entries[0].identity[field]=value;
 await assert.rejects(verify(await resign(policy),source),code('OWN_MONETARY_COVERAGE_REQUIRED'));
});
test('different rounding or stage is not silently accepted',async()=>{
 const{source,policy}=await fixture(),changed=clone(policy);changed.entries[0].rounding.mode='half_even';
 await assert.rejects(verify(await resign(changed),source),code('OWN_MONETARY_ROUNDING_CHANGED'));
 const stage=clone(policy);stage.entries[0].stage='expression';
 await assert.rejects(verify(await resign(stage),source),code('OWN_MONETARY_STAGE_UNSUPPORTED'));
});
test('source content, bindings and validity changes invalidate existing custody',async()=>{
 const{source,policy}=await fixture();
 for(const change of [p=>p.rules[0].validFrom='2026-11',p=>p.bindings.push({synthetic:true}),p=>p.rules[0].expression.left.value='2.00']){
  const next=await sourceChange(source,change);
  await assert.rejects(verify(policy,next),code('OWN_MONETARY_SOURCE_CHANGED'));
 }
 const stale=clone(source);stale.program.rules[0].ruleReference='Otro documento sintético';
 await assert.rejects(inspect(stale),code('OWN_MONETARY_SOURCE_CHANGED'));
});
test('policy self hash and evidence are checked rather than manufactured',async()=>{
 const{source,policy}=await fixture(),changed=clone(policy);changed.policySha256='0'.repeat(64);
 await assert.rejects(verify(changed,source),code('OWN_MONETARY_INTEGRITY_CHANGED'));
 const missing=clone(policy);missing.entries[0].sourceReference='';
 await assert.rejects(verify(await resign(missing),source),code('OWN_MONETARY_EVIDENCE_REQUIRED'));
});
test('intermediate rounding and rounded references remain forbidden',async()=>{
 const{source}=await fixture();
 for(const expression of [
  {op:'round',rounding:{precision:2,mode:'half_up'},value:clone(source.program.rules[0].expression)},
  {op:'concept',code:'88',stage:'rounded'},
  {op:'quantity_phase',code:'88',stage:'rounded',rounding:{precision:2,mode:'half_up'}}
 ]){
  const next=await sourceChange(source,p=>p.rules[0].expression=expression);
  await assert.rejects(inspect(next),code('OWN_MONETARY_INTERMEDIATE_FORBIDDEN'));
 }
 const nonMoney=await sourceChange(source,p=>p.rules[1].rounding.mode='half_even');
 await assert.rejects(inspect(nonMoney),code('OWN_MONETARY_NON_MONEY_FORBIDDEN'));
});
test('snapshot is frozen before the first asynchronous digest',async()=>{
 const{source}=await fixture(),subtle=globalThis.crypto.subtle,original=subtle.digest;
 let release,entered;const blocked=new Promise(resolve=>release=resolve),first=new Promise(resolve=>entered=resolve);let initial=true;
 subtle.digest=async function(...args){if(initial){initial=false;entered();await blocked;}return Reflect.apply(original,this,args);};
 try{
  const pending=inspect(source);await first;
  source.complete=false;source.program.rules[0].expression.left.value='999.00';release();
  const current=await pending;
  assert.equal(current.source.complete,true);
  assert.equal(current.source.program.rules[0].expression.left.value,'1.00');
  assert.ok(Object.isFrozen(current.source.program.rules));
 }finally{release();subtle.digest=original;}
});
test('verification snapshots original policy and source together before yielding',async()=>{
 const{source,policy}=await fixture(),original=clone({source,policy}),pending=verify(policy,source);
 source.program.rules[0].expression.left.value='999.00';source.sourceReference='Otra referencia exclusivamente sintética';
 policy.entries[0].identity.code='999';policy.entries[0].rounding.mode='half_even';
 const checked=await pending;
 assert.deepEqual(checked.source.source,original.source);assert.deepEqual(checked.policy,original.policy);
 assert.equal(checked.approved,false);
});
test('history only appends opaque originals and never rewrites, removes or reorders them',()=>{
 const original=[{id:'synthetic first',policy:{mode:'exact'}},{id:'synthetic second',missing:null}];
 assert.equal(history(original,[...clone(original),{id:'synthetic third'}]),true);
 for(const next of [original.slice(1),[original[1],original[0]],[{...original[0],policy:{mode:'half_up'}},original[1]]]){
  assert.throws(()=>history(original,next),code('OWN_MONETARY_HISTORY_CHANGED'));
 }
 assert.equal(history([],[]),true);
});
test('accessors and toJSON functions are rejected without invocation',async()=>{
 let calls=0;const accessor={};Object.defineProperty(accessor,'value',{enumerable:true,get(){calls++;return 'wrong';}});
 const callable={toJSON(){calls++;return 'wrong';}};
 await assert.rejects(hash(accessor),code('OWN_MONETARY_CONTRACT_INVALID'));
 await assert.rejects(hash(callable),code('OWN_MONETARY_CONTRACT_INVALID'));
 assert.equal(calls,0);
});
test('cycles, holes, symbols, undefined and non-finite numbers are not inert JSON',async()=>{
 const cyclic={};cyclic.self=cyclic;
 for(const raw of [cyclic,[,0],{[Symbol('synthetic')]:1},{missing:undefined},NaN,Infinity]){
  await assert.rejects(hash(raw),code('OWN_MONETARY_CONTRACT_INVALID'));
 }
});
test('oversized ASCII rejects before the first digest without returning a partial hash',async()=>{
 await withoutDigest(async()=>assert.rejects(hash('x'.repeat(MAX_BYTES)),code('OWN_MONETARY_CAPTURE_LIMIT')));
});
test('aggregate bytes and shared values are bounded before hashing',async()=>{
 const piece='x'.repeat(1024*1024);
 await withoutDigest(async()=>assert.rejects(hash(Array(9).fill(piece)),code('OWN_MONETARY_CAPTURE_LIMIT')));
 await withoutDigest(async()=>assert.rejects(hash(Array(MAX_NODES).fill(0)),code('OWN_MONETARY_CAPTURE_LIMIT')));
});
test('history shares one byte budget across both snapshots',()=>{
 const each='x'.repeat(MAX_BYTES/2);
 assert.throws(()=>history([each],[each]),code('OWN_MONETARY_CAPTURE_LIMIT'));
});
test('verify shares one budget before any asynchronous work or shape processing',async()=>{
 const each='x'.repeat(MAX_BYTES/2);
 await withoutDigest(async()=>assert.rejects(verify({padding:each},{padding:each}),code('OWN_MONETARY_CAPTURE_LIMIT')));
});
test('JSON keys, punctuation, UTF8, escapes and surrogate pairs have exact byte limits',async()=>{
 const value={'é"':'"\\\n\u0001é界😀\u{1f642}\u2028',pad:''};
 value.pad='x'.repeat(MAX_BYTES-Buffer.byteLength(JSON.stringify(value)));
 assert.equal(Buffer.byteLength(JSON.stringify(value)),MAX_BYTES);
 const expected=sha(JSON.stringify(value,Object.keys(value).sort()));
 assert.equal(await hash(value),expected,'exact boundary admits all content without truncation');
 value.pad+='x';
 await withoutDigest(async()=>assert.rejects(hash(value),code('OWN_MONETARY_CAPTURE_LIMIT')));
});
