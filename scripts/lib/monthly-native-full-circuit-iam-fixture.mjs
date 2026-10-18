// Two explicit synthetic role effects, authorized before any future CI request.
// SQL101 uses these exact SQL026-declared keys; no new capability is invented.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const q=value=>"'"+String(value).replaceAll("'","''")+"'",hash=value=>createHash('sha256').update(value).digest('hex');
const sources=Object.freeze({'scripts/migrations/101-native-monthly-novelties.sql':'17da7f491d64babfdc2c0a15e215809e814a6451cdd7d69e94ca49e995475801','scripts/migrations/026-governed-payroll-novelties.sql':'4be6efc1dedcb4e883988f1c3f0d3d0e7751d29f24e2a6bfe0d0e4ea12ad340c'});
export function buildMonthlyNativeNoveltyIamFixture({qa,read}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);assert.equal(qa.actor.tenantId,qa.checker.tenantId);
 for(const[file,sha256]of Object.entries(sources))assert.equal(hash(read(file).replace(/\r\n?/g,'\n')),sha256,'JOINT_IAM_SOURCE_CHANGED:'+file);
 const source=read(Object.keys(sources)[0]);for(const capability of['payroll.novelty.prepare','payroll.novelty.approve'])assert.ok(source.includes("'"+capability+"'"));
 const assignments=[{membershipId:qa.actor.membershipId,email:qa.actor.actorEmail,role:'QA_AUTHORITY_OPERATOR',capability:'payroll.novelty.prepare'},{membershipId:qa.checker.membershipId,email:qa.checker.actorEmail,role:'QA_ADOPTION_CHECKER',capability:'payroll.novelty.approve'}];
 for(const actor of assignments){assert.match(actor.membershipId,/^[a-f0-9-]{36}$/);assert.match(actor.email,/@[^@]*\.invalid$/);}
 const roleSnapshot="(SELECT coalesce(jsonb_agg(jsonb_build_array(role_key,capability_key) ORDER BY role_key,capability_key),'[]'::jsonb) FROM public.iam_role_capability)",membershipSnapshot="(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]'::jsonb) FROM public.tenant_membership m)",overrideSnapshot="(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY membership_id,capability_key),'[]'::jsonb) FROM public.tenant_membership_capability_override o)";
 const expected=JSON.stringify(assignments),pre=`DO $joint_iam$ DECLARE x jsonb;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(expected)}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.tenant_membership m JOIN public.iam_role r ON r.role_key=m.role_key WHERE m.id=(x->>'membershipId')::uuid AND m.tenant_id=${q(qa.actor.tenantId)}::uuid AND m.user_email=x->>'email' AND m.status='active' AND m.role_key=x->>'role' AND r.scope_kind='tenant')
   OR (SELECT count(*) FROM public.tenant_membership WHERE role_key=x->>'role')<>1
   OR EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities((x->>'membershipId')::uuid) WHERE capability_key IN('payroll.novelty.prepare','payroll.novelty.approve'))
   OR NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key=x->>'capability' AND scope_kind='tenant') THEN RAISE EXCEPTION 'JOINT_IAM_PRESTATE_CHANGED';END IF;
  PERFORM public.tenant_iam_assert_no_sod_conflict((x->>'membershipId')::uuid);
 END LOOP;
 PERFORM set_config('municontrol_joint.iam_before',jsonb_build_object('roles',${roleSnapshot},'memberships',${membershipSnapshot},'overrides',${overrideSnapshot})::text,true);
 END $joint_iam$`,insert=`INSERT INTO public.iam_role_capability(role_key,capability_key) VALUES${assignments.map(a=>'('+q(a.role)+','+q(a.capability)+')').join(',')}`;
 const post=`DO $joint_iam$ DECLARE x jsonb;prior jsonb:=current_setting('municontrol_joint.iam_before')::jsonb;expected_roles jsonb;BEGIN
 SELECT jsonb_agg(value ORDER BY value->>0,value->>1) INTO expected_roles FROM(SELECT value FROM jsonb_array_elements(prior->'roles') UNION ALL SELECT jsonb_build_array(value->>'role',value->>'capability') FROM jsonb_array_elements(${q(expected)}::jsonb)) pairs;
 IF ${roleSnapshot} IS DISTINCT FROM expected_roles OR ${membershipSnapshot} IS DISTINCT FROM prior->'memberships' OR ${overrideSnapshot} IS DISTINCT FROM prior->'overrides' THEN RAISE EXCEPTION 'JOINT_IAM_EFFECT_SET_CHANGED';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(expected)}::jsonb) LOOP
  IF (SELECT jsonb_agg(capability_key ORDER BY capability_key) FROM public.tenant_iam_effective_capabilities((x->>'membershipId')::uuid) WHERE capability_key IN('payroll.novelty.prepare','payroll.novelty.approve')) IS DISTINCT FROM jsonb_build_array(x->>'capability') THEN RAISE EXCEPTION 'JOINT_IAM_SEPARATION_CHANGED';END IF;
  PERFORM public.tenant_iam_assert_no_sod_conflict((x->>'membershipId')::uuid);
 END LOOP;END $joint_iam$`;
 const proof=`SELECT jsonb_build_object('version','monthly-native-novelty-iam-fixture.v1','assignments',${q(expected)}::jsonb,'before',current_setting('municontrol_joint.iam_before')::jsonb,'afterRoles',${roleSnapshot},'makerPrepareOnly',true,'checkerApproveOnly',true,'sodBothChecked',true,'productRolesChanged',false,'syntheticRolesChanged',2)`;
 return{version:'monthly-native-novelty-iam-fixture.v1',sourceHashes:{...sources},assignments,statements:[pre,insert,post,proof].map(qa.normalized),existingCapabilitiesOnly:true,newCapabilities:0,newRoles:0,newMemberships:0,connects:false,executesSql:false};
}
