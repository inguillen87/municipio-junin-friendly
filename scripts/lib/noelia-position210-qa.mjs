// Disposable Noelia QA: whole source210 after the original v1 benchmark.
// One explicit source-derived predecessor succession; no prior function change.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPositionPopulationInstallation,assertPositionPopulationDurability,SQL210_SHA} from './position-population-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {buildInactiveJurisdictionInstallation} from './adoption-inactive-jurisdiction-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
const minted=new WeakMap();
export const NOELIA_POSITION210_SQL='SELECT public.position_comparison_detail_v2($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result';
export function noeliaPosition210Statement(text,values,schema){
 if(typeof text!=='string'||text!==NOELIA_POSITION210_SQL)return null;
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'NOELIA_POSITION210_SCHEMA');
 assert.ok(Array.isArray(values)&&values.length===5&&Reflect.ownKeys(values).length===6&&Array.from({length:5},(_,i)=>Object.hasOwn(values,i)).every(Boolean),'NOELIA_POSITION210_ARITY');
 assert.ok(typeof values[0]==='string'&&typeof values[3]==='string'&&typeof values[4]==='string','NOELIA_POSITION210_TEXT');
 assert.ok(Number.isSafeInteger(values[1])&&values[1]>=1900&&values[1]<=2099&&Number.isSafeInteger(values[2])&&values[2]>=1&&values[2]<=1000,'NOELIA_POSITION210_INTEGER');
 const literals=values.map((v,i)=>i===1||i===2?String(v):q(v));
 // The only identifier is relocated BEFORE opaque values are inserted.
 return text.replace('public.',schema+'.').replace(/\$(\d+)/g,(_,n)=>literals[Number(n)-1]);
}

const INACTIVE_SOURCE='scripts/lib/adoption-inactive-jurisdiction-installation.mjs',INACTIVE_SHA='8e6984708f43be776ca49e318f461bb436ce9cf12f3714438057b158d446f6ac';
function inactivePredecessor(batch,{read,sourceCommit}){
 assert.equal(createHash('sha256').update(read(INACTIVE_SOURCE)).digest('hex'),INACTIVE_SHA,'NOELIA_POSITION210_INACTIVE_SOURCE_CHANGED');
 const inactive=buildInactiveJurisdictionInstallation({read,sourceCommit});
 assert.equal(inactive.beforePins.length,6);assert.equal(inactive.afterPins.length,6);
 const selected=batch.prerequisitePins.flatMap((pin,index)=>inactive.beforePins.flatMap((before,n)=>pin.signature===before.signature?[{pin,index,before,after:inactive.afterPins[n]}]:[]));
 assert.equal(selected.length,1,'NOELIA_POSITION210_EXACT_ONE_SUCCESSOR');
 const [{pin,index,before,after}]=selected;
 assert.equal(pin.signature,'public.payroll_fixed_registry_adopted_subject_v1(jsonb,uuid,boolean)','NOELIA_POSITION210_SUCCESSOR_IDENTITY');
 assert.deepEqual(pin,before,'NOELIA_POSITION210_SUCCESSOR_PARENT_CHANGED');assert.deepEqual({...before,sha256:null},{...after,sha256:null},'NOELIA_POSITION210_ONLY_BODY_SUCCESSOR');assert.equal(after.runtime,false);
 assert.equal(before.sha256,'83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa');assert.equal(after.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');
 for(const[file,digest]of Object.entries(inactive.sourceHashes))if(Object.hasOwn(batch.sourceHashes,file))assert.equal(batch.sourceHashes[file],digest,'NOELIA_POSITION210_SOURCE_AUTHORITY_CONFLICT:'+file);
 const prerequisitePins=batch.prerequisitePins.map((value,n)=>n===index?after:value);assert.equal(prerequisitePins.length,32);
 const oldCheck=batch.beforeCheck,newCheck=pinsCheck(prerequisitePins,'POSITION_POPULATION_PREDECESSOR_CHANGED');assert.equal(oldCheck,pinsCheck(batch.prerequisitePins,'POSITION_POPULATION_PREDECESSOR_CHANGED'));
 const project=rows=>{let seen=0;const next=rows.map(text=>{const count=text.split(oldCheck).length-1;assert.ok(count===0||count===1,'NOELIA_POSITION210_SUCCESSOR_CHECK_MULTIPLICITY');seen+=count;return count?text.replace(oldCheck,()=>newCheck):text;});assert.equal(seen,2,'NOELIA_POSITION210_TWO_CHECKS_PER_PHASE');const inverse=next.map(text=>text.includes(newCheck)?text.replace(newCheck,()=>oldCheck):text);assert.deepEqual(inverse,rows,'NOELIA_POSITION210_WHOLE_PHASE_INVERSE');return next;};
 assert.equal(batch.afterCheck.split(oldCheck).length,2,'NOELIA_POSITION210_AFTER_CHECK_ANCHOR');
 const installation=project(batch.installation),durableVerification=project(batch.durableVerification);
 const projected={...batch,prerequisitePins,beforeCheck:newCheck,afterCheck:batch.afterCheck.replace(oldCheck,()=>newCheck),installation,durableVerification};
 const evidence=Object.freeze({version:'noelia-position210-inactive-predecessor.v1',authoritySource:INACTIVE_SOURCE,authoritySourceSha256:INACTIVE_SHA,sourceHashes:Object.freeze({...inactive.sourceHashes}),signature:pin.signature,prerequisiteIndex:index,changedFields:Object.freeze(['sha256']),beforeSha256:before.sha256,afterSha256:after.sha256,runtime:false,unchangedOtherPins:31,wholePhaseInverseVerified:true,productionAuthority:false});
 return{batch:projected,evidence};
}

// The producer quotes ownCheck inside mode. Normalize its SQL at its own
// quote depth, then quote once; the outer metadata check uses the same text.
// This changes no expected digest and does not mutate the producer or qa.hashes.
function normalizePosition210Phases(batch,qa){
 const ownCheck=pinsCheck(batch.ownPins,'POSITION_POPULATION_NEW_FUNCTION_CHANGED'),quoted=q(ownCheck);
 assert.equal(batch.mode.split(quoted).length,2,'NOELIA_POSITION210_EXACT_NESTED_OWN_CHECK');
 const marker='__NOELIA_POSITION210_QUOTED_OWN_CHECK__';
 assert.ok(!batch.mode.includes(marker)&&!ownCheck.includes(marker),'NOELIA_POSITION210_MODE_MARKER_CONFLICT');
 const masked=batch.mode.replace(quoted,()=>marker),normalizedMasked=qa.normalized(masked);
 assert.equal(normalizedMasked.split(marker).length,2,'NOELIA_POSITION210_MODE_MARKER_CHANGED');
 const formerQuoted=qa.normalized(quoted),formerMode=qa.normalized(batch.mode),normalizedOwnCheck=qa.normalized(ownCheck),normalizedQuoted=q(normalizedOwnCheck);
 assert.equal(formerMode.split(formerQuoted).length,2,'NOELIA_POSITION210_FORMER_NESTED_OWN_CHECK');
 assert.equal(formerMode.replace(formerQuoted,()=>marker),normalizedMasked,'NOELIA_POSITION210_OUTER_MODE_CHANGED');
 const mode=normalizedMasked.replace(marker,()=>normalizedQuoted);
 assert.equal(mode.split(normalizedQuoted).length,2,'NOELIA_POSITION210_NORMALIZED_NESTED_OWN_CHECK');
 assert.equal(mode.replace(normalizedQuoted,()=>formerQuoted),formerMode,'NOELIA_POSITION210_MODE_WHOLE_INVERSE');
 const project=rows=>{
  assert.equal(rows.filter(text=>text===batch.mode).length,1,'NOELIA_POSITION210_ONE_MODE_PER_PHASE');
  const next=rows.map(text=>text===batch.mode?mode:qa.normalized(text));
  assert.deepEqual(next.map(text=>text===mode?formerMode:text),rows.map(qa.normalized),'NOELIA_POSITION210_PHASE_WHOLE_INVERSE');
  return Object.freeze(next);
 };
 return{installation:project(batch.installation),verification:project(batch.durableVerification)};
}

export function composeNoeliaPosition210Sources({read,sourceCommit,qa,inactiveJurisdiction=false}){
 assert.equal(typeof inactiveJurisdiction,'boolean','NOELIA_POSITION210_INACTIVE_MODE_REQUIRED');
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/,'NOELIA_POSITION210_SCHEMA');assert.equal(typeof qa.normalized,'function','NOELIA_POSITION210_NORMALIZER');
 const files=new Map(),load=file=>{const text=read(file).replace(/\r\n?/g,'\n');if(files.has(file))assert.equal(files.get(file),text,'NOELIA_POSITION210_SOURCE_CHANGED');files.set(file,text);return text;};
 const originalBatch=buildPositionPopulationInstallation({read:load,sourceCommit}),successor=inactiveJurisdiction?inactivePredecessor(originalBatch,{read:load,sourceCommit}):null,batch=successor?successor.batch:originalBatch;
 assert.equal(batch.prerequisitePins.length,32);assert.equal(batch.previousPins.length,5);assert.equal(batch.ownPins.length,2);assert.equal(batch.sourceHashes['210-own-position-population-proof.sql'],SQL210_SHA);
 const {installation,verification}=normalizePosition210Phases(batch,qa);
 assert.equal(verification[0],'SET TRANSACTION READ ONLY');
 const sourceHashes=Object.freeze(Object.fromEntries([...files].map(([file,text])=>[file,createHash('sha256').update(text).digest('hex')])));
 const plan=Object.freeze({version:'noelia-position210-qa.v1',schema:qa.schema,sourceCommit,sourceHashes,inactiveJurisdiction,predecessorSuccession:successor?.evidence??null,source210Sha256:SQL210_SHA,newFunctions:2,newTables:0,priorFunctionsReplaced:0,businessWrites:0,productionAuthority:false});
 minted.set(plan,{batch,installation,verification,read,files});return plan;
}
export function noeliaPosition210PhaseStatements(plan,phase){
 const saved=minted.get(plan);assert.ok(saved,'NOELIA_POSITION210_ORIGINAL_PLAN_REQUIRED');assert.equal(phase,'after-position-v1-outputs','NOELIA_POSITION210_PHASE_REQUIRED');
 for(const[file,text]of saved.files)assert.equal(saved.read(file).replace(/\r\n?/g,'\n'),text,'NOELIA_POSITION210_SOURCE_BOOKEND:'+file);
 return Object.freeze({installation:saved.installation,verification:saved.verification});
}
export function assertNoeliaPosition210Durability({plan,installed,durable,repeated}){
 const saved=minted.get(plan);assert.ok(saved,'NOELIA_POSITION210_ORIGINAL_PLAN_REQUIRED');noeliaPosition210PhaseStatements(plan,'after-position-v1-outputs');
 const result=assertPositionPopulationDurability({installed,durable,batch:saved.batch});assertPositionPopulationDurability({installed:repeated,durable,batch:saved.batch});assert.deepEqual(repeated,installed,'NOELIA_POSITION210_REPEAT_CHANGED');
 return {...result,version:plan.version,source210Sha256:plan.source210Sha256,wholeSource210:true,predecessorSuccession:plan.predecessorSuccession,newFunctions:2,priorFunctionsReplaced:0,businessWrites:0,productionAuthority:false};
}
