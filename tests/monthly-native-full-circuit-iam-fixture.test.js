// Build only source text; no executor, target import side effect or SQL call.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
import {buildMonthlyNativeNoveltyIamFixture} from '../scripts/lib/monthly-native-full-circuit-iam-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('two source-pinned novelty keys affect only distinct synthetic maker/checker memberships with complete IAM conservation',()=>{
 const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),actor:{membershipId:id(1),tenantId:id(3),actorEmail:'maker@joint.invalid'},checker:{membershipId:id(2),tenantId:id(3),actorEmail:'checker@joint.invalid'},normalized:value=>value};
 const fixture=buildMonthlyNativeNoveltyIamFixture({qa,read});assert.deepEqual(fixture.assignments.map(row=>[row.role,row.capability]),[['QA_AUTHORITY_OPERATOR','payroll.novelty.prepare'],['QA_ADOPTION_CHECKER','payroll.novelty.approve']]);assert.equal(fixture.newCapabilities,0);assert.equal(fixture.newRoles,0);assert.equal(fixture.newMemberships,0);assert.equal(fixture.statements.length,5);assert.equal(fixture.membershipOverridesAdded,2);assert.equal(fixture.roleAssignmentsChanged,0);
 assert.match(fixture.statements[0],/JOINT_IAM_PRESTATE_CHANGED/);assert.match(fixture.statements[0],/tenant_iam_assert_no_sod_conflict/);assert.match(fixture.statements[3],/JOINT_IAM_EFFECT_SET_CHANGED/);assert.match(fixture.statements[3],/JOINT_IAM_SEPARATION_CHANGED/);assert.match(fixture.statements[3],/tenant_iam_assert_no_sod_conflict/);assert.match(fixture.statements[3],/current_value-'overrides'-'effective'/);assert.match(fixture.statements[3],/prior->'overrides'/);
 assert.throws(()=>buildMonthlyNativeNoveltyIamFixture({qa:{...qa,checker:qa.actor},read}));assert.throws(()=>buildMonthlyNativeNoveltyIamFixture({qa,read:file=>read(file)+'\nchanged'}),/JOINT_IAM_SOURCE_CHANGED/);
});

// The REAL184 fixture has two distinct memberships sharing the maker role.
// Evaluate its string-only seed loop; it cannot connect or execute the SQL.
test('real canonical seed shared role requires membership overrides and preserves foreign authority',()=>{
 const source=read('scripts/verify-municipal-owner-adoption-authority.mjs').replace(/\r\n?/g,'\n'),start=source.indexOf('for(const[a,foreignFlag]of[[actor,false],[foreign,true]]){'),end=source.indexOf('\n }\n const caps=',start);assert.ok(start>=0&&end>start);
 const names=['tenant','foreignTenant','binding','foreignBinding','membership','foreignMembership','session','foreignSession','person','foreignPerson','contract','foreignContract','batch','foreignBatch'],ids=Object.fromEntries(names.map((name,index)=>[name,id(index+1)])),actor={actorEmail:'maker@joint.invalid',actorSessionId:ids.session,actorSessionVersion:3,membershipId:ids.membership,releaseSha:'a'.repeat(40),tenantId:ids.tenant},foreign={...actor,actorEmail:'foreign@joint.invalid',actorSessionId:ids.foreignSession,membershipId:ids.foreignMembership,tenantId:ids.foreignTenant},q=value=>"'"+String(value).replaceAll("'","''")+"'";
 const rows=vm.runInNewContext('(function(){const fixtureRows=[];'+source.slice(start,end+3)+';return fixtureRows;})()',{ids,actor,foreign,q}),memberships=rows.filter(row=>row.startsWith('INSERT INTO tenant_membership('));assert.equal(memberships.length,2);assert.equal(memberships.filter(row=>row.includes("'QA_AUTHORITY_OPERATOR'")).length,2);assert.notEqual(actor.membershipId,foreign.membershipId);
 const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),actor,checker:{...actor,membershipId:id(50),actorEmail:'checker@joint.invalid'},normalized:value=>value},fixture=buildMonthlyNativeNoveltyIamFixture({qa,read}),writes=fixture.statements.filter(row=>row.startsWith('INSERT INTO public.tenant_membership_capability_override('));assert.equal(writes.length,2);
 for(const [index,assignment]of fixture.assignments.entries()){assert.ok(writes[index].includes("'"+assignment.membershipId+"'::uuid,'"+assignment.capability+"',true,false"));assert.ok(writes[index].endsWith('transaction_timestamp())'));assert.ok(!writes[index].includes(foreign.membershipId));}
 assert.doesNotMatch(fixture.statements.join('\n'),/INSERT INTO public\.iam_role(?:_capability)?\b|UPDATE public\.tenant_membership\b|ON CONFLICT/);assert.doesNotMatch(fixture.statements[0],/count\(\*\) FROM public\.tenant_membership WHERE role_key/);
 assert.match(fixture.statements[0],/tenant_membership_capability_override o WHERE o.membership_id/);assert.match(fixture.statements[0],/SELECT id FROM public\.tenant_membership LOOP PERFORM public\.tenant_iam_assert_no_sod_conflict/);assert.match(fixture.statements[3],/current_value-'overrides'-'effective'/);assert.match(fixture.statements[3],/jsonb_array_elements\(prior->'effective'\)/);assert.match(fixture.statements[3],/IS DISTINCT FROM expected_effective/);assert.match(fixture.statements[4],/'rolesChanged',0/);assert.match(fixture.statements[4],/'overridesAdded',2/);assert.match(fixture.statements[4],/'unaffectedCapsPreserved',true/);
});

test('native IAM before and after blocks keep record variables distinct from whole-row snapshot aliases',()=>{
 const qa={schema:'mc_qa_fixed_092_'+'a'.repeat(32),actor:{membershipId:id(1),tenantId:id(3),actorEmail:'maker@joint.invalid'},checker:{membershipId:id(2),tenantId:id(3),actorEmail:'checker@joint.invalid'},normalized:value=>value};
 const fixture=buildMonthlyNativeNoveltyIamFixture({qa,read});
 for(const sql of [fixture.statements[0],fixture.statements[3]]){
  const records=new Set([...sql.matchAll(/(?:DECLARE|;)\s*([a-z_]\w*)\s+record(?=;)/gi)].map(match=>match[1]));
  const snapshotAliases=[...sql.matchAll(/\bto_jsonb\(([a-z_]\w*)\)/gi)].map(match=>match[1]);
  assert.deepEqual([...records],['checked_membership']);assert.ok(snapshotAliases.includes('m'));
  for(const alias of snapshotAliases)assert.equal(records.has(alias),false,'A PL/pgSQL record must not collide with a whole-row snapshot alias: '+alias);
  assert.match(sql,/FOR checked_membership IN SELECT id FROM public\.tenant_membership LOOP PERFORM public\.tenant_iam_assert_no_sod_conflict\(checked_membership\.id\);END LOOP;/);
  assert.match(sql,/jsonb_agg\(to_jsonb\(m\) ORDER BY id\)/);
  assert.match(sql,/FROM public\.tenant_membership m/);
 }
});
