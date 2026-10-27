// Proposed pure source tests. No execution or native acceptance is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {composeOwnFullCapacity190PublicInstallation} from '../scripts/lib/own-full-capacity-190-public-installation.mjs';
import {OWN_RELEASE_TARGETS} from '../scripts/lib/own-payroll-release-target.mjs';
import {composeOwnCloseSnapshot214Raw,composeOwnCloseSnapshot215Raw} from '../scripts/lib/own-m7-public-successors213215.mjs';
import {projectOwnFullCapacity190PublicPostflight,prepareOwnLiquidationBootstrap213PublicWith201,prepareOwnCloseSnapshot214PublicWith201,prepareOwnCloseSnapshot215PublicWith201} from '../scripts/lib/own-m7-public-successors201-bridge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sourceCommit='a'.repeat(40),target=OWN_RELEASE_TARGETS[0];
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n');
let capacity;
const capacityPlan=()=>capacity??=composeOwnFullCapacity190PublicInstallation({read,sourceCommit});
const factory=stage=>stage===214?composeOwnCloseSnapshot214Raw:composeOwnCloseSnapshot215Raw;
const project=(raw,postflight=capacityPlan().verification[0],plan=capacityPlan())=>projectOwnFullCapacity190PublicPostflight({capacityPlan:plan,raw,postflight,read,sourceCommit});
test('complete201 guard projection changes one body digest, preserves26 full records and has a whole-text inverse',()=>{
 const historical=capacityPlan().verification[0],signature='public.own_close_snapshot_v1(jsonb,jsonb)';
 for(const stage of[214,215]){const raw=factory(stage)({major:17,sourceCommit,read}),out=project(raw),row=out.afterPost.find(p=>p.signature===signature);
  assert.equal(out.originalPostflight,historical);assert.equal(out.originalPost.length,27);assert.equal(out.pre.length,11);assert.equal(out.unchangedOtherRecords,26);
  assert.equal(row.bodySha256,raw.rawAfter.sha256);assert.equal(row.runtime,false);assert.equal(row.kind,'protected_dependency');
  for(let i=0;i<27;i++){const old=out.originalPost[i],next=out.afterPost[i];assert.deepEqual(next,old.signature===signature?{...old,bodySha256:raw.rawAfter.sha256}:old);}
  const oldDigest='11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0';
  assert.equal(out.afterPostflight.replace(raw.rawAfter.sha256,oldDigest),historical);
  assert.equal(out.beforePostflight.replace(raw.rawBefore.sha256,oldDigest),historical);
  assert.equal(out.afterPostflight.split('OWN_DECISION_CAPACITY_POST_ACL_CHANGED').length,2);
  assert.equal(out.afterPostflight.split('OWN_DECISION_CAPACITY_POST_TABLE_CHANGED').length,historical.split('OWN_DECISION_CAPACITY_POST_TABLE_CHANGED').length);
 }
});
test('cloned raw, shortened metadata, changed ACL and foreign or already-projected guards are rejected',()=>{
 const raw=composeOwnCloseSnapshot215Raw({major:17,sourceCommit,read}),historical=capacityPlan().verification[0],out=project(raw);
 assert.throws(()=>project({...raw}),/PUBLIC213215_UNMINTED_RAW/);
 for(const foreign of[historical+'\n',historical.replace('OWN_DECISION_CAPACITY_POST_ACL_CHANGED','OTHER_TOKEN'),out.afterPostflight])assert.throws(()=>project(raw,foreign),/PUBLIC201_SUCCESSOR_HISTORICAL_GUARD_REQUIRED/);
 const selected=capacityPlan().post.find(p=>p.name==='own_annul_selected_v1');
 for(const plan of[{...capacityPlan(),post:capacityPlan().post.slice(1)},{...capacityPlan(),post:capacityPlan().post.map(p=>p===selected?{...p,runtime:true}:p)}])assert.throws(()=>project(raw,historical,plan),/PUBLIC201_SUCCESSOR_WHOLE_SOURCE_PLAN_CHANGED/);
});
test('three finite wrappers keep201 checks inside installation, RO verification and repetition and merge source proof',()=>{
 for(const[stage,prepare]of[[213,prepareOwnLiquidationBootstrap213PublicWith201],[214,prepareOwnCloseSnapshot214PublicWith201],[215,prepareOwnCloseSnapshot215PublicWith201]]){
  const plan=prepare({target,capacityPlan:capacityPlan(),read,sourceCommit});
  assert.equal(plan.whole201SourceGuardIncluded,true);assert.equal(plan.whole201AdmissionIncluded,true);assert.equal(plan.native201AdmissionObserved,false);assert.equal(plan.executionAdmitted,false);
  assert.equal(plan.capacity201SourceEpoch.postdecessors,27);assert.equal(plan.capacity201SourceEpoch.predecessors,11);assert.equal(plan.repetition,plan.installation);
  assert.deepEqual(plan.rehearsal.slice(0,-1),plan.installation);assert.match(plan.installation.at(-1),/ AS proof$/);
  assert.ok(plan.installation.at(-1).includes('f220a79c990dc7f303fe52c49b3436af9c6b5924a5e1167810d8811127ee5378'));
  const choice=plan.installation.find(s=>s.startsWith('DO $public'+stage+'_capacity201_choose$'));
  assert.ok(choice);assert.ok(choice.includes("mode')='install'"));assert.ok(choice.includes('ELSE EXECUTE'));
  assert.equal(plan.preflight.at(-1).startsWith('DO $capacity_postflight$'),true);
  assert.equal(plan.installation.at(-2).startsWith('DO $capacity_postflight$'),true);assert.equal(plan.verification.at(-2),plan.installation.at(-2));
  assert.equal(plan.sourceBookend().whole201SourceGuardIncluded,true);
 }
});
