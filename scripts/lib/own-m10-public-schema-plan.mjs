// Pure institution-bound plan; no CLI, executor, pool, fixture or DB observation.
import assert from 'node:assert/strict';
import {composeM10PublicSourceFactors,assertM10PublicSourceFactors,q,hash,lf} from './own-m10-public-source-factors.mjs';
import {composeM10Public216,composeM10Public212,m10PublicTarget,m10PublicWrap,assertM10Public216Durability,assertM10Public212Durability} from './own-m10-public-successors216212.mjs';
import {m10OriginalPhaseContract,assertM10OriginalStagePhase} from './own-m10-public-phase-contracts.mjs';
import {assertM10Public216Proof} from './own-m10-public-successors216212.mjs';
import {assertAnnualBudgetDurability} from './annual-position-budget-installation.mjs';
import {assertPositionDurability} from './position-assignment-installation.mjs';
import {assertComparisonDurability} from './position-comparison-installation.mjs';
import {assertAdoptedPositionsDurability} from './adopted-positions-installation.mjs';
import {assertPositionPopulationDurability} from './position-population-installation.mjs';
import {assertOwnArtFullDurability} from './own-art-full-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
export const M10_PUBLIC_STAGE_ORDER=Object.freeze(['127','128','129','adopted-v2','210','216','211','212']);
const minted=new WeakMap(),stageParents=new WeakMap(),SHA=/^[a-f0-9]{64}$/;
const stripReadOnly=values=>values[0]==='SET TRANSACTION READ ONLY'?values.slice(1):[...values];
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function existingStage(id,batch,target){
 const installation=m10PublicWrap(target,batch.installation,false),durableVerification=m10PublicWrap(target,stripReadOnly(batch.durableVerification),true);
 // All fallback preflights below are closed prefixes before the first snapshot
 // or mutation in their pinned producer. They are not a repair/overwrite path.
 const pre=id==='adopted-v2'?batch.installation.slice(0,3):id==='210'?batch.installation.slice(0,2):id==='211'?batch.installation.slice(0,3):batch.preflight;
 assert.ok(Array.isArray(pre)&&pre.length>0);
 const fault=`DO $m10_public${id.replaceAll('-','_')}_abort$ BEGIN RAISE EXCEPTION 'M10_PUBLIC_${id.replaceAll('-','_')}_REHEARSAL_ROLLBACK_REQUIRED';END $m10_public${id.replaceAll('-','_')}_abort$`;
 return {id,batch,preflight:m10PublicWrap(target,pre,true),installation,rehearsal:Object.freeze([...installation,fault]),rehearsalExpectedError:'M10_PUBLIC_'+id.replaceAll('-','_')+'_REHEARSAL_ROLLBACK_REQUIRED',durableVerification,repetition:durableVerification,repetitionReadOnlyVerifier:true};
}
export function composeM10PublicSchemaPlan({read,sourceCommit,target}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);target=m10PublicTarget(target);
 const texts=new Map(),sourceHashes={},checked=file=>{if(!texts.has(file)){const text=lf(read(file));texts.set(file,text);sourceHashes[file]=hash(text);}return texts.get(file);};
 assert.equal(hash(checked('scripts/lib/own-m10-public-phase-contracts.mjs')),'806b12a6999ca86b434ff787d84375f31f2126711ebdcce54566ee3af4c85847','M10_PHASE_CONTRACT_WHOLE_SOURCE_CHANGED');
 const factors=composeM10PublicSourceFactors({read:checked,sourceCommit});assertM10PublicSourceFactors(factors);
 const successor216=composeM10Public216({factors,target,read:checked}),successor212=composeM10Public212({factors,target,read:checked});
 const prior=factors.stages.filter(s=>s.id!=='211').map(s=>existingStage(s.id,s.batch,target)),art=existingStage('211',factors.stages.find(s=>s.id==='211').batch,target);
 const phaseContracts=Object.fromEntries(factors.stages.map(s=>[s.id,m10OriginalPhaseContract({id:s.id,batch:s.batch,read:checked})]));
 const stages=[...prior,{id:'216',...successor216,batch:successor216},art,{id:'212',...successor212,batch:successor212}];assert.deepEqual(stages.map(s=>s.id),M10_PUBLIC_STAGE_ORDER);
 for(const stage of stages){stage.version='m10-public-stage-'+stage.id+'.v1';if(stage.id==='212')stage.repetitionReadOnlyVerifier=true;}
 const finalPins=[...successor216.afterFinalPins,successor216.source.helperPin,...art.batch.ownPins,successor212.ownPin];assert.equal(finalPins.length,37);assert.equal(new Set(finalPins.map(p=>p.signature)).size,37);
 const sources=()=>{factors.bookend();for(const[file,text]of texts)assert.equal(lf(read(file)),text,'M10_PUBLIC_BOOKEND_CHANGED:'+file);return {...sourceHashes};};
 const proof=`SELECT jsonb_build_object('version','m10-public-final-function-bookend.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'metadataPins',37,'businessOperations',0,'objectFingerprint',(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${finalPins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}))) AS proof`;
 const finalVerification=m10PublicWrap(target,[pinsCheck(finalPins,'M10_PUBLIC_FINAL37_CHANGED'),...successor216.functionBookend,proof],true);
 // After declared successors, do not replay global prior-state fingerprints of
 // an earlier installation. These function guards expect the final source epoch.
 stages.find(stage=>stage.id==='212').finalVerification=finalVerification;
 const result=freeze({version:'m10-public-schema-plan.v2',sourceCommit,target:{...target},sourceHashes:{...sourceHashes},phaseContracts,stages,finalPins,finalVerification,sourceBookend:()=>({sourceCommit,sourceHashes:sources(),sourceOnly:true}),connects:false,executesSql:false,executionAdmitted:false,businessOperations:0,newSeed:false,observedCatalogueUsedAsSource:false});
 minted.set(result,{factors});for(const stage of stages)stageParents.set(stage,{plan:result,id:stage.id});return result;
}
export function assertM10PublicStageDurability({plan,id,installed,durable,repeated}){
 assert.ok(minted.has(plan),'M10_PUBLIC_UNMINTED_PLAN');const stage=plan.stages.find(s=>s.id===id);assert.ok(stage,'M10_PUBLIC_UNKNOWN_STAGE');plan.sourceBookend();
 const sourceCommit=plan.sourceCommit,batch=stage.batch;
 let validated;
 if(id==='127')validated=assertAnnualBudgetDurability({installed,durable,sourceCommit});
 else if(id==='128')validated=assertPositionDurability({installed,durable,sourceCommit});
 else if(id==='129')validated=assertComparisonDurability({installed,durable,sourceCommit});
 else if(id==='adopted-v2')validated=assertAdoptedPositionsDurability({installed,durable,batch});
 else if(id==='210')validated=assertPositionPopulationDurability({installed,durable,batch});
 else if(id==='211')validated=assertOwnArtFullDurability({installed,durable,batch});
 else if(id==='216')return assertM10Public216Durability({plan:batch,installed,durable,repeated});
 else if(id==='212')return assertM10Public212Durability({plan:batch,installed,durable,repeated});
 // For old stages, repetition is exactly the RO durability verifier. It never
 // replays CREATE/INSERT/GRANT or a mutable install mode.
 assert.deepEqual(repeated,durable,'M10_PUBLIC_READONLY_REPEAT_CHANGED');return validated;
}
export function assertM10PublicFinalFunctionBookend({plan,observed,prior}){
 assert.ok(minted.has(plan),'M10_PUBLIC_UNMINTED_PLAN');plan.sourceBookend();
 const keys=['version','sourceCommit','sourceHashes','metadataPins','businessOperations','objectFingerprint'];assert.deepEqual(Object.keys(observed).sort(),keys.sort());assert.equal(observed.version,'m10-public-final-function-bookend.v1');assert.equal(observed.sourceCommit,plan.sourceCommit);assert.deepEqual(observed.sourceHashes,plan.sourceHashes);assert.equal(observed.metadataPins,37);assert.equal(observed.businessOperations,0);assert.match(observed.objectFingerprint,SHA);
 if(prior!==undefined){assertM10PublicFinalFunctionBookend({plan,observed:prior});assert.equal(observed.objectFingerprint,prior.objectFingerprint,'M10_PUBLIC_FINAL_FUNCTION_METADATA_DRIFT');}
 return {passed:true,sourceCommit:plan.sourceCommit,metadataOnly:true,businessRowsRecompared:false};
}

// Typed adapters retain the actual source stage identity; no fabricated phase
// pair is passed to an original durability asserter to validate a single row.
function stageRecord(stage){const value=stageParents.get(stage);assert.ok(value,'M10_PUBLIC_UNMINTED_STAGE');return value;}
export function assertM10PublicStagePhase({stage,phase,receipt,installed}){
 const {plan,id}=stageRecord(stage);plan.sourceBookend();assert.ok(['installation','durable','repetition'].includes(phase));
 if(id==='216'){
  assertM10Public216Proof({plan:stage.batch,value:receipt,mode:{installation:'install',durable:'durable',repetition:'repeat'}[phase]});
  if(phase!=='installation'){assert.ok(installed,'M10_REAL_INSTALL_PROOF_REQUIRED');assertM10Public216Proof({plan:stage.batch,value:installed,mode:'install'});for(const key of ['priorFingerprint','objectsFingerprint','oldSevenMetadataFingerprint'])assert.equal(receipt[key],installed[key],'M10_PUBLIC216_DURABLE_CHANGED:'+key);}
 }else if(id==='212'){
  const expected={version:'lifecycle212-public-installation.v1',sourceCommit:plan.sourceCommit,schema:'public',sourceHashes:stage.batch.sourceHashes,predecessorPins:4,newFunctions:1,newTables:0,newCapabilities:0,newRoles:0,adaptedFunctions:0,businessRowsAdded:0,priorStatePreserved:true};
  assert.deepEqual(Object.keys(receipt??{}).sort(),[...Object.keys(expected),'priorFingerprint','objectFingerprint'].sort(),'M10_PUBLIC212_PHASE_SHAPE');for(const[k,v]of Object.entries(expected))assert.deepEqual(receipt[k],v);for(const key of ['priorFingerprint','objectFingerprint'])assert.match(receipt[key],SHA);
  if(phase!=='installation'){assert.ok(installed,'M10_REAL_INSTALL_PROOF_REQUIRED');assertM10PublicStagePhase({stage,phase:'installation',receipt:installed});assert.deepEqual(receipt,installed,'M10_PUBLIC212_PHASE_CHANGED');}
 }else return assertM10OriginalStagePhase({contract:plan.phaseContracts[id],batch:stage.batch,phase,receipt,installed});
 return {phaseValidated:true,stage:id,phase};
}
export function assertM10PublicStageReceiptDurability({stage,installed,durable,repeated}){
 const {plan,id}=stageRecord(stage);for(const[receipt,phase]of[[installed,'installation'],[durable,'durable'],[repeated,'repetition']])assertM10PublicStagePhase({stage,phase,receipt,installed});
 return assertM10PublicStageDurability({plan,id,installed,durable,repeated});
}
export function assertM10PublicStageFinalProof({stage,observed,prior}){
 const {plan,id}=stageRecord(stage);assert.equal(id,'212','M10_FINAL37_ONLY_AFTER212');return assertM10PublicFinalFunctionBookend({plan,observed,prior});
}
export function assertM10PublicStageRecord({plan,id,record,actualTarget}){
 assert.ok(minted.has(plan),'M10_PUBLIC_UNMINTED_PLAN');assert.ok(M10_PUBLIC_STAGE_ORDER.includes(id));const stage=plan.stages.find(stage=>stage.id===id);
 assert.equal(record.stage,'m10-'+id);assert.equal(record.version,stage.version);assert.equal(record.sourceCommit,plan.sourceCommit);assert.equal(record.state,'VALIDATED');assert.equal(record.phase,'complete');
 for(const[k,v]of Object.entries(plan.target))assert.equal(actualTarget[k],v,'M10_PRIOR_DESTINATION_CHANGED:'+k);
 assert.deepEqual(record.target,actualTarget);assert.equal(record.target.transport,'neon_https');assert.equal(record.target.postgresSsl,true);
 for(const key of ['preflight','rehearsed','installed','durableObserved','durabilityVerified','repeated'])assert.equal(record[key],true,'M10_REAL_RECORD_REQUIRED:'+key);
 assert.equal(record.validatedReceiptCount,3);assert.equal(record.automaticRetry,false);assert.equal(record.businessOperations,0);assert.equal(record.nominalRowsReturned,0);assert.equal(record.nativeEquivalencePublicIncluded,false);
 const validation=assertM10PublicStageReceiptDurability({stage,installed:record.installedProof,durable:record.durableProof,repeated:record.repeatedProof});
 if(id==='212')assertM10PublicStageFinalProof({stage,observed:record.finalFunctionProof});
 return {passed:true,actualReceiptCount:3,final37Checked:id==='212',validation};
}
