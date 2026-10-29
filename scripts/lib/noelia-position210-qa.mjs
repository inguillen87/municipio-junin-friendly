// Disposable Noelia QA: the unchanged whole source210 producer, after the
// original v1 benchmark. No cohort, capture, prior function or production change.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPositionPopulationInstallation,assertPositionPopulationDurability,SQL210_SHA} from './position-population-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
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
export function composeNoeliaPosition210Sources({read,sourceCommit,qa}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/,'NOELIA_POSITION210_SCHEMA');assert.equal(typeof qa.normalized,'function','NOELIA_POSITION210_NORMALIZER');
 const files=new Map(),load=file=>{const text=read(file).replace(/\r\n?/g,'\n');if(files.has(file))assert.equal(files.get(file),text,'NOELIA_POSITION210_SOURCE_CHANGED');files.set(file,text);return text;};
 const batch=buildPositionPopulationInstallation({read:load,sourceCommit});
 assert.equal(batch.prerequisitePins.length,32);assert.equal(batch.previousPins.length,5);assert.equal(batch.ownPins.length,2);assert.equal(batch.sourceHashes['210-own-position-population-proof.sql'],SQL210_SHA);
 const installation=Object.freeze(batch.installation.map(qa.normalized)),verification=Object.freeze(batch.durableVerification.map(qa.normalized));
 assert.equal(verification[0],'SET TRANSACTION READ ONLY');
 const sourceHashes=Object.freeze(Object.fromEntries([...files].map(([file,text])=>[file,createHash('sha256').update(text).digest('hex')])));
 const plan=Object.freeze({version:'noelia-position210-qa.v1',schema:qa.schema,sourceCommit,sourceHashes,source210Sha256:SQL210_SHA,newFunctions:2,newTables:0,priorFunctionsReplaced:0,businessWrites:0,productionAuthority:false});
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
 return {...result,version:plan.version,source210Sha256:plan.source210Sha256,wholeSource210:true,newFunctions:2,priorFunctionsReplaced:0,businessWrites:0,productionAuthority:false};
}
