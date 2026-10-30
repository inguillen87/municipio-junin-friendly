// Proposed pure/source regressions. Author did not import or execute this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {composeOwnLiquidationBootstrap213Plan} from '../scripts/lib/own-liquidation-bootstrap213-installation.mjs';
import {composeOwnCloseSnapshot214Plan} from '../scripts/lib/own-close-snapshot214-installation.mjs';
import {composeOwnCloseSnapshot215Plan} from '../scripts/lib/own-close-snapshot215-installation.mjs';
import {composeOwnLiquidationBootstrap213Raw,composeOwnCloseSnapshot214Raw,composeOwnCloseSnapshot215Raw,prepareOwnLiquidationBootstrap213Public,prepareOwnCloseSnapshot214Public,prepareOwnCloseSnapshot215Public,M7_PUBLIC213215_SUPPORT_SOURCE_PINS} from '../scripts/lib/own-m7-public-successors213215.mjs';
import {OWN_RELEASE_TARGETS} from '../scripts/lib/own-payroll-release-target.mjs';
import {ownInstallationDestination,ownInstallationSettings} from '../scripts/prepare-own-payroll-installation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),commit='a'.repeat(40);
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n');
const entries=[[213,composeOwnLiquidationBootstrap213Raw,composeOwnLiquidationBootstrap213Plan,prepareOwnLiquidationBootstrap213Public],[214,composeOwnCloseSnapshot214Raw,composeOwnCloseSnapshot214Plan,prepareOwnCloseSnapshot214Public],[215,composeOwnCloseSnapshot215Raw,composeOwnCloseSnapshot215Plan,prepareOwnCloseSnapshot215Public]];
let foundation;
const qa=()=>foundation??=buildOwnerProgramQa({major:17,sourceCommit:commit,read,schema:'mc_qa_fixed_092_'+'b'.repeat(32),operationalPairBaseline:'published107'});
test('three raw factories preserve exactly the existing QA source preimages, successors and metadata without a foundation',()=>{
 for(const[id,rawFactory,qaFactory]of entries){const raw=rawFactory({major:17,sourceCommit:commit,read}),before=structuredClone(qa().hashes),old=qaFactory({foundation:qa(),major:17,sourceCommit:commit,read});
  assert.equal(raw.stage,id);assert.equal(raw.schema,'public');assert.equal(Object.hasOwn(raw,'foundation'),false);assert.equal(Object.hasOwn(raw,'normalize'),false);
  assert.equal(raw.original,old.original);assert.equal(raw.changed,old.changed);assert.deepEqual(raw.rawBefore,old.rawBefore);assert.deepEqual(raw.rawAfter,old.rawAfter);assert.deepEqual(qa().hashes,before);
 }
});
test('public phases use only the existing exact targets, RR/RO destination guards and full conservation',()=>{
 for(const target of OWN_RELEASE_TARGETS)for(const[id,, ,prepare]of entries){const plan=prepare({target,sourceCommit:commit,read});
  assert.equal(plan.schema,'public');assert.equal(plan.executionAdmitted,false);assert.equal(plan.whole201AdmissionIncluded,false);assert.equal(plan.nativeEquivalence.included,false);
  assert.deepEqual(plan.installation.slice(0,ownInstallationSettings.length),[...ownInstallationSettings]);assert.equal(plan.installation[ownInstallationSettings.length],ownInstallationDestination(target));
  for(const field of['preflight','verification']){assert.equal(plan[field][0],'SET TRANSACTION READ ONLY');assert.equal(plan[field][ownInstallationSettings.length+1],ownInstallationDestination(target));}
  assert.deepEqual(plan.rehearsal.slice(0,-1),plan.installation);assert.equal(plan.repetition,plan.installation);assert.match(plan.rehearsal.at(-1),new RegExp('M7_PUBLIC'+id+'_REHEARSAL_ROLLBACK_REQUIRED'));
  assert.ok(plan.installation.some(s=>s.includes('PRIOR_STATE_CHANGED')));assert.ok(plan.installation.some(s=>s.includes("to_jsonb(p)-'prosrc'")));assert.equal(plan.sourceBookend().passed,true);assert.match(plan.installation.at(-1),/ AS proof$/);assert.match(plan.verification.at(-1),/ AS proof$/);
 }
});
test('foreign target or unpinned source fails before a public plan is available',()=>{
 for(const[,, ,prepare]of entries){let reads=0;const reader=f=>{reads++;return read(f);};
  assert.throws(()=>prepare({target:{...OWN_RELEASE_TARGETS[0],host:'foreign'},sourceCommit:commit,read:reader}),/PUBLIC213215_EXACT_EXISTING_TARGET_REQUIRED/);assert.equal(reads,0);
  assert.throws(()=>prepare({target:OWN_RELEASE_TARGETS[0],sourceCommit:commit,read:f=>read(f)+(f==='scripts/migrations/124-own-payroll-liquidation-decisions.sql'?'\n-- drift':'')}),/SOURCE_CHANGED/);
 }
});
test('the three original QA builder source files remain byte exact, including existing SQL phase emitters',()=>{
 for(const file of['scripts/lib/own-liquidation-bootstrap213-installation.mjs','scripts/lib/own-close-snapshot214-installation.mjs','scripts/lib/own-close-snapshot215-installation.mjs'])assert.equal(createHash('sha256').update(read(file)).digest('hex'),M7_PUBLIC213215_SUPPORT_SOURCE_PINS[file]);
});
