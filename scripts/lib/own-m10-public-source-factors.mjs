// Private SOURCE proposal. No executor, connection, observation or QA foundation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAnnualBudgetInstallation} from './annual-position-budget-installation.mjs';
import {buildPositionInstallation} from './position-assignment-installation.mjs';
import {buildComparisonInstallation} from './position-comparison-installation.mjs';
import {buildAdoptedPositionsInstallation} from './adopted-positions-installation.mjs';
import {buildPositionPopulationInstallation} from './position-population-installation.mjs';
import {buildOwnArtFullInstallation} from './own-art-full-installation.mjs';
import {buildOwnPeriodClassificationInstallation} from './own-period-classification-installation.mjs';
import {buildOwnerDecisionQaDefinitions} from './municipal-owner-adoption-decision-qa.mjs';
import {CONSUMER_BEFORE_PINS,CONSUMER_AFTER_PINS} from './adopted-consumers-installation-pins.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
export const q=value=>"'"+String(value).replaceAll("'","''")+"'";
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const lf=value=>{assert.equal(typeof value,'string');return value.replace(/\r\n?/g,'\n');};
const body=d=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m);return m[2];};
const clean=d=>d.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const header=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0);return d.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ')+d.slice(at);};
const pin=d=>ownInstallationFunctionPin(header(clean(d)));
const one=(rows,predicate,label)=>{const values=rows.filter(predicate);assert.equal(values.length,1,label);return values[0];};
const ACL_PRODUCER="scripts/lib/municipal-owner-adoption-decision-qa.mjs";
const ACL_PRODUCER_SHA256="e6d9d39d1dee48d24f01148d07997d85e51d8ca62ff5eefb4a6dc00679d99624";
const ACL_PRODUCER_STATEMENT=" const acl=graph.definitions.map(d=>{const p=identity(d),pin=graph.desired.find(x=>x.signature===p.signature)??graph.pinHints.get(p.signature+'|'+p.sha256);return `REVOKE ALL ON FUNCTION ${r(p.signature)} FROM PUBLIC,municontrol_actions_runtime_app`+(pin?.runtime?`;GRANT EXECUTE ON FUNCTION ${r(p.signature)} TO municontrol_actions_runtime_app`:'');});";
export function rewriteGuard(batch,oldCheck,newCheck,counts){
 const out={...batch};
 for(const [field,count] of Object.entries(counts)){
  assert.ok(Array.isArray(batch[field]));
  let seen=0;
  out[field]=batch[field].map(s=>{
   const n=s.split(oldCheck).length-1;assert.ok(n===0||n===1);
   seen+=n;const out=n?s.replace(oldCheck,()=>newCheck):s;if(n)assert.equal(out.replace(newCheck,()=>oldCheck),s,'M10_PUBLIC_WHOLE_GUARD_INVERSE');return out;
  });
  assert.equal(seen,count,'POSITIONS210_GUARD_COUNT:'+field);
 }
 return out;
}
function canonicalRecord(graph,expected,sourceAcl){
 const d=one(graph.definitions,d=>{const match=/^CREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(/.exec(clean(d));return match?.[1]===expected.name&&pin(d).signature===expected.signature;},
  'POSITIONS210_CANONICAL_SOURCE:'+expected.signature);
 const actual=pin(d);
 const acl=graph.desired.find(p=>p.signature===actual.signature)
  ??graph.pinHints.get(actual.signature+'|'+actual.sha256);
 // The pinned seed producer revokes both grantees for every definition and
 // grants runtime only for an existing selected pin whose runtime is true.
 // An absent hint is therefore a source-proven private function, not a guess.
 assert.ok(sourceAcl&&sourceAcl.path===ACL_PRODUCER&&sourceAcl.sha256===ACL_PRODUCER_SHA256,'POSITIONS210_ACL_PRODUCER_REQUIRED');
 const runtime=acl?acl.runtime:sourceAcl.unselectedRuntime;
 assert.equal(typeof runtime,'boolean','POSITIONS210_ACL_SOURCE');
 assert.deepEqual({...actual,runtime},expected,
  'POSITIONS210_CANONICAL_PIN:'+expected.signature);
 return d;
}
export function substitute(pins,allow){
 for(const change of allow)assert.equal(pins.filter(p=>p.signature===change.before.signature).length,1,'M10_PUBLIC_ONE_SOURCE_PIN_REQUIRED');
 const result=pins.map(p=>{
  const change=allow.find(c=>c.before.signature===p.signature);if(!change)return p;
  assert.deepEqual(p,change.before,'POSITIONS210_OLD_METADATA');
  assert.deepEqual({...p,sha256:null},{...change.after,sha256:null},'POSITIONS210_ONLY_BODY_SUCCESSOR');return change.after;
 });
 const inverse=result.map(p=>{const change=allow.find(c=>c.after.signature===p.signature);if(!change)return p;assert.deepEqual(p,change.after);return change.before;});
 assert.deepEqual(inverse,pins,'M10_PUBLIC_WHOLE_PIN_VECTOR_INVERSE');return result;
}
function adapt127or128(batch,allow,code){
 const oldCheck=pinsCheck(batch.prerequisitePins,code);
 const prerequisitePins=substitute(batch.prerequisitePins,allow);
 const out=rewriteGuard(batch,oldCheck,pinsCheck(prerequisitePins,code),
  {preflight:1,installation:2,durableVerification:1});
 return {...out,prerequisitePins};
}

const freeze=(value,seen=new WeakSet())=>{if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value);}return value;};
const branded=new WeakSet();
function sourceProof(batch,sourceHashes){
 if(!batch.sourceHashes)return batch;
 const old=q(JSON.stringify(batch.sourceHashes))+'::jsonb',next=q(JSON.stringify(sourceHashes))+'::jsonb';
 const rewrite=s=>{const n=s.split(old).length-1;assert.ok(n<=1);const out=s.replace(old,()=>next);assert.equal(out.replace(next,()=>old),s,'M10_PUBLIC_HASH_PROOF_INVERSE');return out;};
 return {...batch,sourceHashes,proof:batch.proof?rewrite(batch.proof):undefined,installation:batch.installation.map(rewrite),durableVerification:batch.durableVerification.map(rewrite)};
}
// Every mutation of a phase guard is one exact whole-check replacement, both
// directions. No digest replacement over unrelated SQL or JSON payloads.
export function composeM10PublicSourceFactors({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const cache=new Map(),sourceHashes={},checked=file=>{if(!cache.has(file)){const text=lf(read(file));cache.set(file,text);sourceHashes[file]=hash(text);}return cache.get(file);};
 for(const file of ['scripts/lib/own-m10-public-source-factors.mjs','scripts/lib/own-m10-public-successors216212.mjs','scripts/lib/own-m10-public-schema-plan.mjs'])checked(file);
 const producer=checked(ACL_PRODUCER);assert.equal(hash(producer),ACL_PRODUCER_SHA256);assert.equal(producer.split(ACL_PRODUCER_STATEMENT).length,2);
 const sourceAcl={path:ACL_PRODUCER,sha256:ACL_PRODUCER_SHA256,unselectedRuntime:false};
 const graph=buildOwnerDecisionQaDefinitions({read:checked,sourceCommit,operationalPairBaseline:'published107'});
 assert.equal(graph.connects,false);assert.equal(graph.executesSql,false);assert.ok(graph.pool instanceof Map&&graph.pinHints instanceof Map);
 const period=buildOwnPeriodClassificationInstallation({read:checked,sourceCommit});assert.equal(period.afterConsumerPins.length,6);
 const byName=(pins,name)=>one(pins,p=>p.name===name,'M10_PUBLIC_PIN:'+name);
 const contextBefore=byName(CONSUMER_BEFORE_PINS,'native_employment_change_context_v1'),contextAfter=byName(CONSUMER_AFTER_PINS,'native_employment_change_context_v1');canonicalRecord(graph,contextAfter,sourceAcl);
 const rangeBefore=byName(period.beforePins,'payroll_fixed_registry_range_v2'),rangeAfter=byName(period.afterConsumerPins,'payroll_fixed_registry_range_v2');canonicalRecord(graph,rangeAfter,sourceAcl);
 const options={read:checked,sourceCommit},annual0=buildAnnualBudgetInstallation(options),assignment0=buildPositionInstallation(options),comparison=buildComparisonInstallation(options),adapted0=buildAdoptedPositionsInstallation(options),population0=buildPositionPopulationInstallation(options);
 const subjectBefore=byName(adapted0.dependencies,'payroll_fixed_registry_adopted_subject_v1');assert.equal(subjectBefore.sha256,'83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa');
 const subjectDefinition=one(period.lifecyclePrerequisiteDefinitions,d=>pin(d).name===subjectBefore.name,'M10_PUBLIC_SUBJECT177');
 const subjectAfter={...pin(subjectDefinition),runtime:false};assert.equal(subjectAfter.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');canonicalRecord(graph,subjectAfter,sourceAcl);
 const contextAllow=[{before:contextBefore,after:contextAfter}],helperAllow=[{before:subjectBefore,after:subjectAfter},{before:rangeBefore,after:rangeAfter}];
 const annual=adapt127or128(annual0,contextAllow,'SQL127_PREREQUISITE_CHANGED'),assignment=adapt127or128(assignment0,contextAllow,'SQL128_PREREQUISITE_CHANGED');
 const dependencies=substitute(adapted0.dependencies,helperAllow);assert.equal(dependencies.length,27);
 const oldDependencyCheck=pinsCheck(adapted0.dependencies,'ADOPTED_POSITIONS_PREREQUISITE_CHANGED');
 const adapted={...rewriteGuard(adapted0,oldDependencyCheck,pinsCheck(dependencies,'ADOPTED_POSITIONS_PREREQUISITE_CHANGED'),{installation:2,durableVerification:1}),dependencies};
 const prerequisitePins=[...adapted.afterPins,...dependencies];assert.equal(prerequisitePins.length,32);assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,32);
 const newPre=pinsCheck(prerequisitePins,'POSITION_POPULATION_PREDECESSOR_CHANGED');
 const population={...rewriteGuard(population0,population0.beforeCheck,newPre,{installation:2,durableVerification:2}),prerequisitePins,beforeCheck:newPre,afterCheck:population0.afterCheck.replace(population0.beforeCheck,()=>newPre)};
 assert.equal(population0.afterCheck.split(population0.beforeCheck).length,2);
 const art0=buildOwnArtFullInstallation(options),artOld=art0.dependencies.filter(p=>p.name===rangeBefore.name);assert.equal(artOld.length,1);assert.deepEqual(artOld[0],rangeBefore);
 const artDependencies=substitute(art0.dependencies,[{before:rangeBefore,after:rangeAfter}]),artPrerequisites=[...art0.previousPins,...art0.groupPins,...artDependencies];assert.equal(artPrerequisites.length,27);
 const oldArt=pinsCheck(art0.prerequisitePins,'OWN_ART_FULL_PREDECESSOR_CHANGED'),newArt=pinsCheck(artPrerequisites,'OWN_ART_FULL_PREDECESSOR_CHANGED');
 const art={...rewriteGuard(art0,oldArt,newArt,{installation:2,durableVerification:1}),dependencies:artDependencies,prerequisitePins:artPrerequisites,beforeCheck:art0.beforeCheck.replace(oldArt,()=>newArt),afterCheck:art0.afterCheck.replace(oldArt,()=>newArt)};
 const stages=[['127',annual],['128',assignment],['129',comparison],['adopted-v2',adapted],['210',population],['211',art]].map(([id,batch])=>({id,batch:sourceProof(batch,{...batch.sourceHashes,...sourceHashes})}));
 const factors=[...contextAllow,...helperAllow];for(const change of factors){assert.deepEqual({...change.before,sha256:null},{...change.after,sha256:null});}
 const bookend=()=>{for(const[file,text]of cache)assert.equal(lf(read(file)),text,'M10_PUBLIC_SOURCE_CHANGED:'+file);return {sourceCommit,sourceHashes:{...sourceHashes},sourceOnly:true};};
 const result={version:'m10-public-source-factors.v1',sourceCommit,graph,stages,factors,final210Pins:[...prerequisitePins,...population.ownPins],sourceHashes:{...sourceHashes},bookend,connects:false,executesSql:false,sourceExpectedOnly:true};
 assert.equal(result.final210Pins.length,34);branded.add(result);return freeze(result);
}
export function assertM10PublicSourceFactors(plan){assert.ok(branded.has(plan),'M10_PUBLIC_UNMINTED_FACTORS');plan.bookend();return plan;}
