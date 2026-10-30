// Proposed source fixture contracts only. Native admission remains a separate phase.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {composePositions210Actors,POSITIONS210_MAKER_CAPS,POSITIONS210_CHECKER_CAPS} from '../scripts/lib/positions210-same190-actors.mjs';
const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const contracts=Array.from({length:855},(_,i)=>'10000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'));
let foundation;const qa=()=>foundation??=buildOwnerProgramQa({major:17,sourceCommit,read,schema:'mc_qa_fixed_092_'+'8'.repeat(32),operationalPairBaseline:'published107'});
test('two declared auth actors reserve contracts4/5 without any person or contract creation',()=>{
 const plan=composePositions210Actors({qa:qa(),contracts,read});assert.strictEqual(plan.foundation,qa());
 assert.deepEqual(plan.rows.map(r=>r.contractId),contracts.slice(4,6));assert.notEqual(plan.rows[0].actor.membershipId,plan.rows[1].actor.membershipId);
 assert.deepEqual(plan.rows.map(r=>r.capabilities),[POSITIONS210_MAKER_CAPS,POSITIONS210_CHECKER_CAPS]);
 assert.equal(POSITIONS210_MAKER_CAPS.length,6);assert.equal(POSITIONS210_CHECKER_CAPS.length,13);
 assert.ok(plan.installation.every(s=>!/\bINSERT INTO \w+\.(?:person|employment_contract|native_employee_registration)\b/.test(s)));
 assert.ok(plan.installation.some(s=>s.includes('POSITIONS210_PAIR_IDENTITY_OR_LINK_ALREADY_PRESENT')));
 assert.ok(plan.contextVerification.some(s=>s.includes('POSITIONS210_PAIR_NATIVE_CONTEXT_CHANGED')));
});
test('a shortened or reordered855 roster cannot select alternative operators silently',()=>{
 assert.throws(()=>composePositions210Actors({qa:qa(),contracts:contracts.slice(1),read}));
 assert.throws(()=>composePositions210Actors({qa:qa(),contracts:[...contracts].reverse(),read}));
});
