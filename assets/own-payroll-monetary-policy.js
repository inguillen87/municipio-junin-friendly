// Standalone declaration protocol. It neither admits a current programme nor approves it.
import {roundingPolicy,payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';

export const OWN_MONETARY_POLICY_VERSION='own-program-monetary-policy.v1';
export const OWN_MONETARY_SOURCE_VERSION='own-program-monetary-source.v1';
const NAMESPACE='own-payroll-namespaces.v2';
const PROGRAM_FIELDS=['namespaceVersion','rules','bindings','totalsPrecision','monthlyDaysVersion','monthlyDaysPolicy','monthlyDayDeclarationVersion','employmentFactsVersion','workingTimeVersion','agreementWorkingTimeVersion','periodContextVersion','salaryConditionsVersion','periodParticipation','fixedForcedAmountsVersion','fixedForcedAmountsPolicy'];
const RULE_FIELDS=['code','agreementCode','nature','unit','validFrom','validUntil','liquidationTypes','ruleReference','rounding','expression'];
const NODE_FIELDS=['op','unit','value','key','type','operator','code','stage','rounding','factor','conversionReference','left','right','condition','then','else','sourceReference','sourceSha256'];
const OPS=['literal','input','match','concept','auxiliary','quantity_phase','round','convert','add','subtract','multiply','divide','min','max','compare','choose'];
const CHILDREN=['left','right','value','condition','then','else'];
const UNITS=['money','hours','minutes','days','percent','units','coefficient'];
const NATURES=['remuneration','non_remuneration','deduction','employer_contribution','auxiliary'];
const TYPES=['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
const HASH=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const CODE=value=>typeof value==='string'&&/^[0-9]{1,9}$/.test(value);
const MONTH=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const TEXT=value=>typeof value==='string'&&value===value.trim()&&value===value.normalize('NFC')&&value.length>=3&&value.length<=180&&!/[<>\u0000-\u001f\u007f-\u009f]/.test(value);
const fail=(condition,code='OWN_MONETARY_CONTRACT_INVALID')=>require(condition,code,'No se verificó la declaración monetaria completa. Conservá la carga y revisá su fuente.');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export const OWN_MONETARY_CAPTURE_LIMITS=Object.freeze({nodes:1_000_000,bytes:8*1024*1024});
const captureBudget=()=>({nodes:0,bytes:0});
const textRepresentable=condition=>require(condition,'OWN_MONETARY_TEXT_UNREPRESENTABLE','El texto contiene un carácter Unicode inválido o nulo. Conservá la carga y volvé a escribir ese texto antes de guardarlo.');
const captureLimit=()=>fail(false,'OWN_MONETARY_CAPTURE_LIMIT');
function spend(budget,bytes){
 if(bytes>OWN_MONETARY_CAPTURE_LIMITS.bytes-budget.bytes)captureLimit();
 budget.bytes+=bytes;
}
// Count exact UTF8 JSON bytes without constructing or encoding another string.
function stringBytes(value,budget){
 if(value.length>OWN_MONETARY_CAPTURE_LIMITS.bytes-budget.bytes-2)captureLimit();
 spend(budget,2);
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  textRepresentable(c!==0);
  if(c===34||c===92||c===8||c===9||c===10||c===12||c===13)spend(budget,2);
  else if(c<32)spend(budget,6);
  else if(c<128)spend(budget,1);
  else if(c<2048)spend(budget,2);
  else if(c>=0xd800&&c<=0xdfff){
   const next=value.charCodeAt(i+1);
   if(c<=0xdbff&&next>=0xdc00&&next<=0xdfff){spend(budget,4);i++;}
   else textRepresentable(false);
  }else spend(budget,3);
 }
}

// Only ordinary, already decoded JSON data is in this input contract.
// Accessors, functions, symbols, holes and cycles are rejected without calling
// their values. Proxies are outside this contract: reflection may invoke traps.
// Transport decoding and initial input allocation must be bounded by the caller.
function snapshot(value,budget=captureBudget(),parents=new Set(),depth=0){
 fail(depth<=96);
 if(++budget.nodes>OWN_MONETARY_CAPTURE_LIMITS.nodes)captureLimit();
 if(typeof value==='string'){stringBytes(value,budget);return value;}
 if(value===null){spend(budget,4);return value;}
 if(typeof value==='boolean'){spend(budget,value?4:5);return value;}
 if(typeof value==='number'){fail(Number.isSafeInteger(value));spend(budget,String(value).length);return value;}
 fail(value&&typeof value==='object'&&!parents.has(value));parents.add(value);
 let result;
 if(Array.isArray(value)){
  if(value.length>OWN_MONETARY_CAPTURE_LIMITS.nodes-budget.nodes)captureLimit();
  const keys=Reflect.ownKeys(value);fail(keys.length===value.length+1&&keys.includes('length'));
  spend(budget,2+Math.max(0,value.length-1));
  result=[];for(let i=0;i<value.length;i++){
   const d=Object.getOwnPropertyDescriptor(value,String(i));fail(d&&Object.hasOwn(d,'value')&&d.enumerable);
   result.push(snapshot(d.value,budget,parents,depth+1));
  }
 }else{
  fail(Object.getPrototypeOf(value)===Object.prototype);
  const keys=Reflect.ownKeys(value);
  if(keys.length>OWN_MONETARY_CAPTURE_LIMITS.nodes-budget.nodes)captureLimit();
  spend(budget,2+keys.length+Math.max(0,keys.length-1));result={};
  for(const key of keys){
   const d=Object.getOwnPropertyDescriptor(value,key);fail(typeof key==='string'&&key!=='__proto__'&&d&&Object.hasOwn(d,'value')&&d.enumerable);
   stringBytes(key,budget);
   Object.defineProperty(result,key,{value:snapshot(d.value,budget,parents,depth+1),enumerable:true,writable:true,configurable:true});
  }
 }
 parents.delete(value);return result;
}
function fields(value,required,allowed=required){fail(value&&typeof value==='object'&&!Array.isArray(value));const keys=Object.keys(value);fail(required.every(key=>Object.hasOwn(value,key))&&keys.every(key=>allowed.includes(key)));}
function list(value,max,empty=false){fail(Array.isArray(value)&&value.length<=max&&(empty||value.length>0));}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function ownMonetaryProtocolHash(value){return digest(snapshot(value));}
const identity=rule=>({namespaceVersion:NAMESPACE,kind:rule.nature==='auxiliary'?'auxiliary':'concept',agreementCode:rule.agreementCode,code:rule.code,nature:rule.nature,validFrom:rule.validFrom,validUntil:rule.validUntil,liquidationTypes:[...rule.liquidationTypes]});

// This only inventories precision declarations; it is NOT the programme normalizer,
// a formula interpreter, unit inference, dependency checker or catalogue linkage.
function nodes(value,path='expression',rows=[],depth=0){
 fail(depth<=32&&rows.length<256,'OWN_MONETARY_INVENTORY_LIMIT');fields(value,['op'],NODE_FIELDS);fail(OPS.includes(value.op),'OWN_MONETARY_NODE_UNSUPPORTED');
 if(['concept','auxiliary','quantity_phase'].includes(value.op))fail(value.stage==='exact','OWN_MONETARY_INTERMEDIATE_FORBIDDEN');
 if(value.op==='quantity_phase')fail(value.rounding===null,'OWN_MONETARY_INTERMEDIATE_FORBIDDEN');
 if(value.op==='round'){const p=roundingPolicy(value.rounding);fail(p.mode==='exact','OWN_MONETARY_INTERMEDIATE_FORBIDDEN');}
 rows.push({path,operation:value.op,declaredUnit:Object.hasOwn(value,'unit')?value.unit:null,stage:'expression_exact'});
 for(const key of CHILDREN)if(value[key]!==null&&typeof value[key]==='object')nodes(value[key],path+'.'+key,rows,depth+1);
 return rows;
}
// A step yields only canonical text. Both concrete drivers hash those bytes;
// no hash implementation, computed value or authority flag comes from JSON.
function* hashStep(value){const result=yield salarySerialized(value);fail(HASH(result),'OWN_MONETARY_DIGEST_INVALID');return result;}
function* sourceSnapshotSteps(source){
 fields(source,['version','complete','program','programSha256','sourceReference','sourceSha256']);
 fail(source.version===OWN_MONETARY_SOURCE_VERSION&&source.complete===true&&HASH(source.programSha256)&&HASH(source.sourceSha256)&&TEXT(source.sourceReference));
 const program=source.program;fields(program,['namespaceVersion','rules','bindings','totalsPrecision'],PROGRAM_FIELDS);
 fail(program.namespaceVersion===NAMESPACE&&Number.isInteger(program.totalsPrecision)&&program.totalsPrecision>=0&&program.totalsPrecision<=8);list(program.rules,1000);list(program.bindings,1000,true);
 const actualProgramSha256=yield* hashStep(program);fail(source.programSha256===actualProgramSha256,'OWN_MONETARY_SOURCE_CHANGED');
 const inventory=[],seen=new Set();
 for(const rule of program.rules){
  fields(rule,RULE_FIELDS);fail(CODE(rule.code)&&CODE(rule.agreementCode)&&NATURES.includes(rule.nature)&&UNITS.includes(rule.unit)&&MONTH(rule.validFrom)&&(rule.validUntil===null||MONTH(rule.validUntil)&&rule.validUntil>=rule.validFrom)&&TEXT(rule.ruleReference));
  list(rule.liquidationTypes,TYPES.length);fail(rule.liquidationTypes.every(type=>TYPES.includes(type))&&new Set(rule.liquidationTypes).size===rule.liquidationTypes.length);
  const rounding=roundingPolicy(rule.rounding);if(rule.unit!=='money')fail(rounding.mode==='exact','OWN_MONETARY_NON_MONEY_FORBIDDEN');
  const id=identity(rule),key=salarySerialized(id);fail(!seen.has(key),'OWN_MONETARY_DUPLICATE');seen.add(key);
  inventory.push({identity:id,unit:rule.unit,stage:'rule_result',rounding,ruleReference:rule.ruleReference,ruleSha256:yield* hashStep(rule),expressionSha256:yield* hashStep(rule.expression),nodes:nodes(rule.expression)});
 }
 const bindingsSha256=yield* hashStep(program.bindings);
 const inventorySha256=yield* hashStep({version:OWN_MONETARY_SOURCE_VERSION,programSha256:actualProgramSha256,bindingsSha256,inventory});
 return freeze({version:OWN_MONETARY_SOURCE_VERSION,source,programSha256:actualProgramSha256,inventory,inventorySha256,sourceStateSha256:yield* hashStep(source),programmeStructureValidated:false,sourceEvidence:'declared_not_document_revalidated',approved:false,executable:false,presentable:false});
}
async function driveWebCrypto(steps){
 let current=steps.next();
 while(!current.done){const bytes=new TextEncoder().encode(current.value),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');current=steps.next(hash);}
 return current.value;
}
export async function inspectOwnMonetaryPolicySource(raw){const captured=freeze(snapshot(raw));return driveWebCrypto(sourceSnapshotSteps(captured));}

function* verifyPolicySteps(policy,source){
 fields(policy,['version','complete','sourceStateSha256','programSha256','inventorySha256','entries','policySha256']);
 fail(policy.version===OWN_MONETARY_POLICY_VERSION&&policy.complete===true&&[policy.sourceStateSha256,policy.programSha256,policy.inventorySha256,policy.policySha256].every(HASH));
 const current=yield* sourceSnapshotSteps(source);
 fail(policy.sourceStateSha256===current.sourceStateSha256&&policy.programSha256===current.programSha256&&policy.inventorySha256===current.inventorySha256,'OWN_MONETARY_SOURCE_CHANGED');
 const targets=current.inventory.filter(row=>row.unit==='money');list(policy.entries,1000);fail(targets.length>0&&policy.entries.length===targets.length,'OWN_MONETARY_COVERAGE_REQUIRED');
 const seen=new Set();for(let i=0;i<policy.entries.length;i++){
  const item=policy.entries[i],target=targets[i];fields(item,['identity','unit','stage','rounding','ruleSha256','expressionSha256','sourceReference','sourceSha256']);
  fields(item.identity,['namespaceVersion','kind','agreementCode','code','nature','validFrom','validUntil','liquidationTypes']);
  const key=salarySerialized(item.identity);fail(!seen.has(key),'OWN_MONETARY_DUPLICATE');seen.add(key);
  fail(item.unit==='money'&&item.stage==='rule_result','OWN_MONETARY_STAGE_UNSUPPORTED');
  fail(key===salarySerialized(target.identity)&&item.ruleSha256===target.ruleSha256&&item.expressionSha256===target.expressionSha256,'OWN_MONETARY_COVERAGE_REQUIRED');
  fail(salarySerialized(roundingPolicy(item.rounding))===salarySerialized(target.rounding),'OWN_MONETARY_ROUNDING_CHANGED');
  fail(TEXT(item.sourceReference)&&HASH(item.sourceSha256),'OWN_MONETARY_EVIDENCE_REQUIRED');
 }
 const {policySha256,...unsigned}=policy;fail(policySha256===(yield* hashStep(unsigned)),'OWN_MONETARY_INTEGRITY_CHANGED');
 return freeze({version:'own-program-monetary-declaration-check.v1',policy,source:current,programmeStructureValidated:false,approvalAuthorityValidated:false,legacyReplayImplemented:false,approved:false,executable:false,presentable:false});
}
// Generators are lazy. Capture both inputs synchronously BEFORE returning one;
// mutation after begin(), even before next(), cannot alter the verified source.
export function beginOwnMonetaryPolicyVerification(rawPolicy,rawSource){
 const budget=captureBudget(),policy=freeze(snapshot(rawPolicy,budget)),source=freeze(snapshot(rawSource,budget));
 return verifyPolicySteps(policy,source);
}
export async function verifyOwnMonetaryPolicy(rawPolicy,rawSource){return driveWebCrypto(beginOwnMonetaryPolicyVerification(rawPolicy,rawSource));}

// Synchronous DECLARATION shape for the existing programme model. It deliberately
// does not check any digest, normalize a programme, approve it or permit execution.
// Proposal/owner/server-input boundaries must use a concrete complete verifier.
export function ownMonetaryPolicyStructure(rawPolicy,rawSource){
 const budget=captureBudget(),policy=freeze(snapshot(rawPolicy,budget)),source=freeze(snapshot(rawSource,budget));
 fields(source,['version','complete','program','programSha256','sourceReference','sourceSha256']);
 fail(source.version===OWN_MONETARY_SOURCE_VERSION&&source.complete===true&&HASH(source.programSha256)&&HASH(source.sourceSha256)&&TEXT(source.sourceReference));
 const program=source.program;fields(program,['namespaceVersion','rules','bindings','totalsPrecision'],PROGRAM_FIELDS);
 fail(program.namespaceVersion===NAMESPACE&&Number.isInteger(program.totalsPrecision)&&program.totalsPrecision>=0&&program.totalsPrecision<=8);list(program.rules,1000);list(program.bindings,1000,true);
 fields(policy,['version','complete','sourceStateSha256','programSha256','inventorySha256','entries','policySha256']);
 fail(policy.version===OWN_MONETARY_POLICY_VERSION&&policy.complete===true&&[policy.sourceStateSha256,policy.programSha256,policy.inventorySha256,policy.policySha256].every(HASH));
 fail(policy.programSha256===source.programSha256,'OWN_MONETARY_SOURCE_CHANGED');
 const targets=[],seen=new Set();
 for(const rule of program.rules){
  fields(rule,RULE_FIELDS);fail(CODE(rule.code)&&CODE(rule.agreementCode)&&NATURES.includes(rule.nature)&&UNITS.includes(rule.unit)&&MONTH(rule.validFrom)&&(rule.validUntil===null||MONTH(rule.validUntil)&&rule.validUntil>=rule.validFrom)&&TEXT(rule.ruleReference));
  list(rule.liquidationTypes,TYPES.length);fail(rule.liquidationTypes.every(type=>TYPES.includes(type))&&new Set(rule.liquidationTypes).size===rule.liquidationTypes.length);
  const rounding=roundingPolicy(rule.rounding);if(rule.unit!=='money')fail(rounding.mode==='exact','OWN_MONETARY_NON_MONEY_FORBIDDEN');
  const id=identity(rule),key=salarySerialized(id);fail(!seen.has(key),'OWN_MONETARY_DUPLICATE');seen.add(key);nodes(rule.expression);
  if(rule.unit==='money')targets.push({identity:id,rounding});
 }
 list(policy.entries,1000);fail(targets.length>0&&policy.entries.length===targets.length,'OWN_MONETARY_COVERAGE_REQUIRED');
 const policyKeys=new Set();for(let i=0;i<policy.entries.length;i++){
  const item=policy.entries[i],target=targets[i];fields(item,['identity','unit','stage','rounding','ruleSha256','expressionSha256','sourceReference','sourceSha256']);fields(item.identity,['namespaceVersion','kind','agreementCode','code','nature','validFrom','validUntil','liquidationTypes']);
  const key=salarySerialized(item.identity);fail(!policyKeys.has(key),'OWN_MONETARY_DUPLICATE');policyKeys.add(key);fail(item.unit==='money'&&item.stage==='rule_result','OWN_MONETARY_STAGE_UNSUPPORTED');
  fail(key===salarySerialized(target.identity)&&HASH(item.ruleSha256)&&HASH(item.expressionSha256),'OWN_MONETARY_COVERAGE_REQUIRED');
  fail(salarySerialized(roundingPolicy(item.rounding))===salarySerialized(target.rounding),'OWN_MONETARY_ROUNDING_CHANGED');fail(TEXT(item.sourceReference)&&HASH(item.sourceSha256),'OWN_MONETARY_EVIDENCE_REQUIRED');
 }
 return freeze({version:'own-program-monetary-structure.v1',policy,source,integrityValidated:false,programmeStructureValidated:false,approvalAuthorityValidated:false,approved:false,presentable:false,executable:false});
}

// Opaque append-only history invariant, never a replacement for programme approval
// or an attempt/replay reader. Existing snapshots are not rewritten or reinterpreted.
export function requireOwnMonetaryHistory(previous,next){
 const budget=captureBudget(),before=snapshot(previous,budget),after=snapshot(next,budget);list(before,1000,true);list(after,1000,true);
 fail(after.length>=before.length&&before.every((entry,index)=>salarySerialized(entry)===salarySerialized(after[index])),'OWN_MONETARY_HISTORY_CHANGED');return true;
}
