// Fixed same190 integration. No alternate seed, settings, actors or transport.
import assert from 'node:assert/strict';
import {buildNoveltyAdministrative217Qa,installNoveltyAdministrative217Same190,advanceNovelty217Capacity201Same190} from './novelty-administrative217-qa.mjs';
import {assertNovelty217DownstreamPinsUnchanged} from './novelty-administrative217-installation.mjs';
import {assertOwnMonetaryInstallationDurability} from './own-monetary-program-guarded-installation.mjs';
import {assertOwnLiquidationBootstrap213Proof} from './own-liquidation-bootstrap213-installation.mjs';
const prepared=new WeakSet(),installed=new WeakMap();
export function prepareNovelty217Joint(h,monthly,monetary,liquidationBootstrap213){
 assert.equal(h.qa.operationalPairBaseline,'published107');assert.equal(monthly.sourceCommit,h.sourceCommit);assert.equal(monthly.schema,h.qa.schema);assert.strictEqual(monthly.qa192.qa,h.qa);assert.strictEqual(monthly.actor,h.qa.actor);assert.strictEqual(monthly.checker,h.qa.checker);
 const plan=buildNoveltyAdministrative217Qa({qa:monthly,read:h.read,sourceCommit:h.sourceCommit,monetary,liquidationBootstrap213});prepared.add(plan);return plan;
}
export function installNovelty217Joint(h,{monetaryTechnical,liquidationBootstrap213}){
 const plan=h.prepared?.administrative217;assert.ok(prepared.has(plan),'NOVELTY217_JOINT_PREPARED_PLAN_REQUIRED');assert.equal(installed.has(h),false,'NOVELTY217_JOINT_SINGLE_INSTALLATION');assert.equal(plan.sourceCommit,h.sourceCommit);assert.equal(plan.schema,h.qa.schema);assert.strictEqual(plan.actor,h.qa.actor);assert.strictEqual(plan.checker,h.qa.checker);
 assert.equal(plan.technicalPredecessorEpoch,'post199-post213');assert.strictEqual(plan.monetary,h.prepared.monetary);assert.strictEqual(plan.liquidationBootstrap213,h.prepared.liquidationBootstrap213);
 assert.equal(monetaryTechnical?.version,'own-monetary-program-technical-epoch.v2');assert.equal(monetaryTechnical.passed,true);const reinstalled=monetaryTechnical.proofs?.reinstalled;assert.ok(reinstalled);assertOwnMonetaryInstallationDurability({...reinstalled,batch:plan.monetary.monetaryInstallation});
 assert.equal(liquidationBootstrap213?.version,'own-liquidation-bootstrap213-admission.v1');assert.equal(liquidationBootstrap213.sourceCommit,h.sourceCommit);for(const key of ['installed','durable','repeated'])assertOwnLiquidationBootstrap213Proof(liquidationBootstrap213[key],plan.liquidationBootstrap213);assert.equal(liquidationBootstrap213.installed.mode,'install');assert.equal(liquidationBootstrap213.durable.mode,'verify');assert.deepEqual({...liquidationBootstrap213.durable,mode:'install'},liquidationBootstrap213.installed);assert.deepEqual(liquidationBootstrap213.repeated,liquidationBootstrap213.durable);
 const proof=installNoveltyAdministrative217Same190({plan,json:h.json,expectRollback:h.expectRollback,readFullSnapshot:h.readFullSnapshot,check:(value,label)=>{assert.ok(value,label);h.check(label);},setPhase:h.setPhase});
 assert.equal(proof.durability.passed,true);installed.set(h,{plan,proof});return proof;
}

export function advanceNovelty217JointAfter201(h,installation201){
 const record=installed.get(h);assert.ok(record&&record.plan===h.prepared?.administrative217,'NOVELTY217_JOINT_ACTUAL_DURABLE_PROOF_REQUIRED');assert.equal(record.proof.capacity201Successor,undefined,'NOVELTY217_201_SINGLE_BOOKEND');
 const proof=advanceNovelty217Capacity201Same190({plan:record.plan,prior:record.proof,json:h.json,setPhase:h.setPhase,installation201});assert.equal(proof.durability.passed,true);record.proof.capacity201Successor=proof;return proof;
}

export function assertNovelty217JointDownstream(h,contract,pins){
 const record=installed.get(h);assert.ok(record&&record.plan===h.prepared?.administrative217,'NOVELTY217_JOINT_ACTUAL_DURABLE_PROOF_REQUIRED');assert.ok(Array.isArray(pins));
 if(contract!=='201-post')assert.equal(record.proof.capacity201Successor?.durability?.passed,true,'NOVELTY217_201_BOOKEND_REQUIRED_BEFORE208');
 const schema=record.plan.schema;
 const canonical=pins.map(p=>{assert.equal(typeof p.signature,'string');assert.ok(p.signature.startsWith(schema+'.')||p.signature.startsWith('public.'),'NOVELTY217_DOWNSTREAM_FOREIGN_SCHEMA');return{...p,signature:p.signature.replace(schema+'.','public.')};});
 const proof=assertNovelty217DownstreamPinsUnchanged({batch:record.plan.batch,contract,pins:canonical});
 assert.equal(proof.changedPins,0);return{contract,changedPins:0,count:pins.length,sourceDerived:true,observedMetadataUsed:false};
}
