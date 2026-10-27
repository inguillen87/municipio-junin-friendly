// Extend only the caller's existing197 projection. No seed, identity or grant.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildNoveltyAdministrative217Installation,assertNoveltyAdministrative217Durability,composeNovelty217Capacity201Bookend,assertNovelty217Capacity201Bookend} from './novelty-administrative217-installation.mjs';
import {monthlyFixedQaHeader} from './own-monthly-day-fixed-composition-qa.mjs';
import {memoizeInstallationPhaseText} from './installation-phase-text-map.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m);return m[2];};
const owned=new WeakSet();
export function buildNoveltyAdministrative217Qa({qa,read,sourceCommit,capacity201Epoch='pre201'}){
 assert.equal(qa?.version,'own-novelty-succession-qa.v1');assert.equal(qa.sourceCommit,sourceCommit);assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof qa.normalized,'function');
 const prerequisiteDefinitions=qa.qa193?.foundation?.base?.definitions,prerequisitePins=qa.batch?.declaration?.prerequisitePins;
 assert.ok(Array.isArray(prerequisiteDefinitions)&&Array.isArray(prerequisitePins));
 const batch=buildNoveltyAdministrative217Installation({read,sourceCommit,capacity201Epoch,operationalPairBaseline:qa.operationalPairBaseline,prerequisiteDefinitions,prerequisiteRuntime:prerequisitePins.filter(p=>p.runtime).map(p=>p.signature)});
 assert.equal(batch.priorReadiness,qa.novelty197.ready);assert.deepEqual(batch.predecessor.supportPins,qa.novelty197.supportPins);assert.deepEqual(batch.predecessor.afterPins,qa.novelty197.afterPins);
 const baseNormalize=qa.normalized,base=s=>baseNormalize(monthlyFixedQaHeader(s)),baseText=memoizeInstallationPhaseText(base),definitions=[batch.priorContext,batch.priorReadiness,batch.helper,batch.context,batch.readiness,batch.capacity201Lineage.afterDefinition,batch.readinessPost201],hashes={};let stable=false;
 for(let pass=0;pass<32;pass++){let changed=false;for(const d of definitions){let local=baseText(d);for(const[from,to]of Object.entries(hashes))local=local.replaceAll(from,to);const from=hash(body(d)),to=hash(body(local));if(hashes[from]!==to){hashes[from]=to;changed=true;}}if(!changed){stable=true;break;}}
 assert.ok(stable,'NOVELTY217_QA_HASH_GRAPH_CYCLE');
 const normalized=sql=>{let local=base(sql);for(const[from,to]of Object.entries(hashes))local=local.replaceAll(from,to);return local;};
 const phases=['preflight','rehearsal','installation','verification','repetition','reversalHistoryGuard'];
 const phaseText=memoizeInstallationPhaseText(normalized);
 const local=Object.fromEntries(phases.map(k=>[k,batch[k].map(phaseText)]));
 assert.ok(local.verification.some(s=>s.includes(hashes[batch.helperPin.sha256])),'NOVELTY217_QA_HELPER_PIN_ABSENT');
 const result={version:'novelty-administrative217-qa.v1',sourceCommit,schema:qa.schema,actor:qa.actor,checker:qa.checker,batch,local,normalized,hashes,baseNormalize,sourceHashes:{...batch.sourceHashes},historical197ArraysPreserved:true,connects:false,executesSql:false,executionAdmitted:false};
 owned.add(result);return result;
}


export function advanceNovelty217Capacity201Same190({plan,prior,json,setPhase,installation201}){
 assert.ok(owned.has(plan),'NOVELTY217_UNMINTED_QA_PLAN');assert.equal(typeof json,'function');assert.equal(typeof setPhase,'function');
 const source=composeNovelty217Capacity201Bookend({batch:plan.batch});setPhase('217-post201-own-three-function-bookend');const observed=json(source.verification.map(plan.normalized),{readOnly:true,fullJson:true});
 return{observed,durability:assertNovelty217Capacity201Bookend({plan:source,prior,observed,installation201}),readOnly:true,storedReadinessUnchanged:true};
}

// Invoke after the final197 technical reinstall/durable/repetition and before
// IAM fixture/business. The caller retains the existing transport and receipts.
export function installNoveltyAdministrative217Same190({plan,json,expectRollback,readFullSnapshot,check,setPhase}){
 assert.ok(owned.has(plan),'NOVELTY217_UNMINTED_QA_PLAN');for(const f of[json,expectRollback,readFullSnapshot,check,setPhase])assert.equal(typeof f,'function');
 setPhase('217-preflight-readonly');json(plan.local.preflight,{readOnly:true,expectJson:false});
 const before=readFullSnapshot();setPhase('217-late-rehearsal-rollback');expectRollback(plan.local.rehearsal,plan.batch.rehearsalExpectedError);assert.deepEqual(readFullSnapshot(),before,'NOVELTY217_REHEARSAL_NOT_ROLLED_BACK');
 setPhase('217-fresh-preflight-readonly');json(plan.local.preflight,{readOnly:true,expectJson:false});
 setPhase('217-installation');const installed=json(plan.local.installation);
 setPhase('217-independent-durable-readonly');const durable=json(plan.local.verification,{readOnly:true});
 setPhase('217-repetition');const repeated=json(plan.local.repetition);
 const durability=assertNoveltyAdministrative217Durability({installed,durable,repeated,batch:plan.batch});
 check(true,'217 preserves both read capabilities, final-context writer capability, linked audit identity and stored adoption readiness without employment or IAM writes');
 return{installed,durable,repeated,durability};
}
