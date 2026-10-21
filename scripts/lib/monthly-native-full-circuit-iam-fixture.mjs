// Two explicit synthetic membership effects, authorized before future CI.
// SQL004 table + the actual SQL006 resolver isolate these SQL101/026 keys.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const q=value=>"'"+String(value).replaceAll("'","''")+"'",hash=value=>createHash('sha256').update(value).digest('hex');
const sources=Object.freeze({'scripts/migrations/101-native-monthly-novelties.sql':'17da7f491d64babfdc2c0a15e215809e814a6451cdd7d69e94ca49e995475801','scripts/migrations/026-governed-payroll-novelties.sql':'4be6efc1dedcb4e883988f1c3f0d3d0e7751d29f24e2a6bfe0d0e4ea12ad340c','scripts/migrations/004-tenant-iam-control-plane.sql':'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195','scripts/migrations/006-tenant-action-authority.sql':'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a'});
export function buildMonthlyNativeNoveltyIamFixture({qa,read}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);assert.equal(qa.actor.tenantId,qa.checker.tenantId);
 for(const[file,sha256]of Object.entries(sources))assert.equal(hash(read(file).replace(/\r\n?/g,'\n')),sha256,'JOINT_IAM_SOURCE_CHANGED:'+file);
 const source=read(Object.keys(sources)[0]);for(const capability of['payroll.novelty.prepare','payroll.novelty.approve'])assert.ok(source.includes("'"+capability+"'"));
 const assignments=[{membershipId:qa.actor.membershipId,email:qa.actor.actorEmail,role:'QA_AUTHORITY_OPERATOR',capability:'payroll.novelty.prepare'},{membershipId:qa.checker.membershipId,email:qa.checker.actorEmail,role:'QA_ADOPTION_CHECKER',capability:'payroll.novelty.approve'}];
 for(const actor of assignments){assert.match(actor.membershipId,/^[a-f0-9-]{36}$/);assert.match(actor.email,/@[^@]*\.invalid$/);}
 const expected=JSON.stringify(assignments),reason='Fixture exclusivamente sintético del circuito nativo193+196; permiso de novedad limitado a la membresía declarada',grantedBy=qa.actor.actorEmail;
 const roles="(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY role_key),'[]'::jsonb) FROM public.iam_role r)",roleCaps="(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY role_key,capability_key),'[]'::jsonb) FROM public.iam_role_capability r)",memberships="(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]'::jsonb) FROM public.tenant_membership m)",overrides="(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY membership_id,capability_key),'[]'::jsonb) FROM public.tenant_membership_capability_override o)",capabilities="(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY capability_key),'[]'::jsonb) FROM public.iam_capability c)",effective="(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key) FROM public.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id),'[]'::jsonb) FROM public.tenant_membership m)",state="jsonb_build_object('roles',"+roles+",'roleCapabilities',"+roleCaps+",'memberships',"+memberships+",'overrides',"+overrides+",'capabilities',"+capabilities+",'effective',"+effective+")";
 const pre=`DO $joint_iam$ DECLARE x jsonb;m record;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(expected)}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.tenant_membership member JOIN public.iam_role r ON r.role_key=member.role_key JOIN public.internal_users u ON u.email=member.user_email AND u.active WHERE member.id=(x->>'membershipId')::uuid AND member.tenant_id=${q(qa.actor.tenantId)}::uuid AND member.user_email=x->>'email' AND member.status='active' AND member.role_key=x->>'role' AND r.scope_kind='tenant')
   OR EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities((x->>'membershipId')::uuid) WHERE capability_key IN('payroll.novelty.prepare','payroll.novelty.approve'))
   OR EXISTS(SELECT 1 FROM public.tenant_membership_capability_override o WHERE o.membership_id=(x->>'membershipId')::uuid AND o.capability_key IN('payroll.novelty.prepare','payroll.novelty.approve'))
   OR NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key=x->>'capability' AND scope_kind='tenant') THEN RAISE EXCEPTION 'JOINT_IAM_PRESTATE_CHANGED';END IF;
 END LOOP;
 FOR m IN SELECT id FROM public.tenant_membership LOOP PERFORM public.tenant_iam_assert_no_sod_conflict(m.id);END LOOP;
 PERFORM set_config('municontrol_joint.iam_before',${state}::text,true);
 END $joint_iam$`;
 // Exactly two plain INSERTs; no role write, membership update or conflict retry.
 const inserts=assignments.map(actor=>`INSERT INTO public.tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email,created_at) VALUES(${q(actor.membershipId)}::uuid,${q(actor.capability)},true,false,${q(reason)},${q(grantedBy)},transaction_timestamp())`);
 const post=`DO $joint_iam$ DECLARE prior jsonb:=current_setting('municontrol_joint.iam_before')::jsonb;current_value jsonb:=${state};expected_overrides jsonb;expected_effective jsonb;m record;BEGIN
 SELECT jsonb_agg(value ORDER BY value->>'membership_id',value->>'capability_key') INTO expected_overrides FROM(
  SELECT value FROM jsonb_array_elements(prior->'overrides') UNION ALL
  SELECT jsonb_build_object('membership_id',value->>'membershipId','capability_key',value->>'capability','allow_override',true,'deny_override',false,'reason',${q(reason)},'granted_by_user_email',${q(grantedBy)},'created_at',transaction_timestamp()) FROM jsonb_array_elements(${q(expected)}::jsonb)
 ) expected_rows;
 SELECT jsonb_agg(jsonb_build_object('membershipId',member.value->'membershipId','capabilities',(
  SELECT coalesce(jsonb_agg(capability ORDER BY capability),'[]'::jsonb) FROM(
   SELECT jsonb_array_elements_text(member.value->'capabilities') capability UNION ALL
   SELECT added.value->>'capability' FROM jsonb_array_elements(${q(expected)}::jsonb) added WHERE added.value->>'membershipId'=member.value->>'membershipId'
  ) exact_caps
 )) ORDER BY member.value->>'membershipId') INTO expected_effective FROM jsonb_array_elements(prior->'effective') member;
 IF (current_value-'overrides'-'effective') IS DISTINCT FROM (prior-'overrides'-'effective') OR current_value->'overrides' IS DISTINCT FROM expected_overrides OR current_value->'effective' IS DISTINCT FROM expected_effective THEN RAISE EXCEPTION 'JOINT_IAM_EFFECT_SET_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_value->'effective') member WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(${q(expected)}::jsonb) actor WHERE actor.value->>'membershipId'=member.value->>'membershipId') AND (SELECT count(*) FROM jsonb_array_elements_text(member.value->'capabilities') cap WHERE cap IN('payroll.novelty.prepare','payroll.novelty.approve'))<>1) THEN RAISE EXCEPTION 'JOINT_IAM_SEPARATION_CHANGED';END IF;
 FOR m IN SELECT id FROM public.tenant_membership LOOP PERFORM public.tenant_iam_assert_no_sod_conflict(m.id);END LOOP;
 END $joint_iam$`;
 const proof=`SELECT jsonb_build_object('version','monthly-native-novelty-iam-fixture.v2','assignments',${q(expected)}::jsonb,'before',current_setting('municontrol_joint.iam_before')::jsonb,'after',${state},'makerPrepareOnly',true,'checkerApproveOnly',true,'sodBothChecked',true,'allMembershipSodChecked',true,'rolesChanged',0,'roleAssignmentsChanged',0,'membershipsChanged',0,'overridesAdded',2,'unaffectedCapsPreserved',true,'foreignCapsPreserved',true,'newCapabilities',0)`;
 return{version:'monthly-native-novelty-iam-fixture.v2',sourceHashes:{...sources},assignments,statements:[pre,...inserts,post,proof].map(qa.normalized),existingCapabilitiesOnly:true,newCapabilities:0,newRoles:0,newMemberships:0,roleAssignmentsChanged:0,membershipOverridesAdded:2,connects:false,executesSql:false};
}
