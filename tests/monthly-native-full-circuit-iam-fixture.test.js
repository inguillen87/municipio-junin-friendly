// Build only source text; no executor, target import side effect or SQL call.
import fs from 'node:fs';import path from 'node:path';import test from 'node:test';import assert from 'node:assert/strict';
import {buildMonthlyNativeNoveltyIamFixture} from '../scripts/lib/monthly-native-full-circuit-iam-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('two source-pinned novelty keys affect only distinct synthetic maker/checker roles with complete IAM conservation',()=>{
 const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),actor:{membershipId:id(1),tenantId:id(3),actorEmail:'maker@joint.invalid'},checker:{membershipId:id(2),tenantId:id(3),actorEmail:'checker@joint.invalid'},normalized:value=>value};
 const fixture=buildMonthlyNativeNoveltyIamFixture({qa,read});assert.deepEqual(fixture.assignments.map(row=>[row.role,row.capability]),[['QA_AUTHORITY_OPERATOR','payroll.novelty.prepare'],['QA_ADOPTION_CHECKER','payroll.novelty.approve']]);assert.equal(fixture.newCapabilities,0);assert.equal(fixture.newRoles,0);assert.equal(fixture.newMemberships,0);assert.equal(fixture.statements.length,4);
 assert.match(fixture.statements[0],/JOINT_IAM_PRESTATE_CHANGED/);assert.match(fixture.statements[0],/tenant_iam_assert_no_sod_conflict/);assert.match(fixture.statements[2],/JOINT_IAM_EFFECT_SET_CHANGED/);assert.match(fixture.statements[2],/JOINT_IAM_SEPARATION_CHANGED/);assert.match(fixture.statements[2],/tenant_iam_assert_no_sod_conflict/);assert.match(fixture.statements[2],/membershipSnapshot|prior->'memberships'/);assert.match(fixture.statements[2],/prior->'overrides'/);
 assert.throws(()=>buildMonthlyNativeNoveltyIamFixture({qa:{...qa,checker:qa.actor},read}));assert.throws(()=>buildMonthlyNativeNoveltyIamFixture({qa,read:file=>read(file)+'\nchanged'}),/JOINT_IAM_SOURCE_CHANGED/);
});
