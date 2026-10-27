// TEXTUAL SOURCE PROPOSAL. Not imported, constructed, tested or executed.
// Sources: ACTORS_PROPOSAL + ACTORS_R2 + CROSS_CONTRACT + CROSS_INDEPENDENT_REVIEW.
// One existing QA190; four synthetic authentication actors; no personnel seed.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {schoolCertificatePrincipalValues} from '../../lib/internal-family-certificates.js';
import {ownerProgramQaAccessSql,ownerProgramQaAccess} from './municipal-owner-program-qa.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';

export const NATIVE_FAMILY195_ACTORS_VERSION='native-family195-same190-actors.v1';
export const NATIVE_FAMILY195_ACTOR_NAMES=Object.freeze(['employee','reviewer','unlinked','selfreviewer']);
export const NATIVE_FAMILY195_TABLES=Object.freeze(['school_certificate_blob','school_certificate','school_certificate_event','school_certificate_storage_policy','employee_family_member','employee_family_member_event','school_certificate_record','school_certificate_record_event','native_family_storage_policy','native_family_request','native_family_request_event']);
const sorted=v=>[...v].sort();
const SELF=['actions.read','employee.family.self.read','employee.family.self.submit'];
const REVIEW=['actions.read','employee.family.review','employee.record.propose','workforce.employee.read'];
export const NATIVE_FAMILY195_ACTOR_CAPABILITIES=Object.freeze({
 employee:Object.freeze(sorted(SELF)),reviewer:Object.freeze(sorted(REVIEW)),
 unlinked:Object.freeze(sorted(SELF)),selfreviewer:Object.freeze(sorted(new Set([...SELF,...REVIEW])))
});
const RAW_KEYS=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'];
const SPEC_KEYS=['name','role','contractId','accountIdentityId','actor','capabilities'];
const REASON='Cuenta exclusivamente sintética para QA familiar195; sin efecto municipal';
const SLOT='municontrol_family195';
const DELTAS=Object.freeze({iam_role:4,iam_role_capability:16,internal_users:4,tenant_membership:4,tenant_identity_session:4,tenant_action_authority:4,tenant_action_employment_link:2});
const FACADES=Object.freeze([
 'native_family_self_bootstrap_v1(jsonb,text,jsonb)','native_family_review_bootstrap_v1(jsonb,text,jsonb)',
 'native_family_self_detail_v1(jsonb,uuid)','native_family_review_detail_v1(jsonb,uuid)',
 'native_family_self_attempt_v1(jsonb,uuid)','native_family_review_attempt_v1(jsonb,uuid)',
 'native_family_self_document_v1(jsonb,uuid,integer)','native_family_review_document_v1(jsonb,uuid,integer)',
 'native_family_self_command_v1(jsonb,jsonb,uuid,jsonb)','native_family_review_command_v1(jsonb,jsonb,uuid,jsonb)'
]);
const SOURCES=Object.freeze([
 'scripts/internal-schema.sql','scripts/migrations/004-tenant-iam-control-plane.sql',
 'scripts/migrations/005-tenant-identity-gateway.sql','scripts/migrations/006-tenant-action-authority.sql',
 'scripts/migrations/007-action-center-read-facades.sql','scripts/migrations/057-family-schooling-certificates.sql',
 'scripts/migrations/113-native-employee-self-access.sql','scripts/migrations/195-native-family-self-service.sql',
 'scripts/lib/municipal-owner-program-qa.mjs','scripts/lib/native-leave-installation.mjs',
 'lib/internal-native-employees.js','lib/internal-family-certificates.js'
]);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const exact=(v,keys)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const hash=v=>createHash('sha256').update(v).digest('hex');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const j=v=>q(JSON.stringify(v))+'::jsonb';
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const roles=NATIVE_FAMILY195_ACTOR_NAMES.map(n=>'QA_FAMILY195_'+n.toUpperCase());
const aggregate=(relation,alias,where='true')=>`(SELECT jsonb_build_object('count',count(*),'sha256',encode(public.digest(coalesce(string_agg(encode(public.digest(to_jsonb(${alias})::text,'sha256'),'hex'),chr(10) ORDER BY encode(public.digest(to_jsonb(${alias})::text,'sha256'),'hex') COLLATE "C"),''),'sha256'),'hex')) FROM ${relation} ${alias} WHERE ${where})`;

function validateRaw(raw){
 exact(raw,RAW_KEYS);assert.ok(uuid(raw.actorSessionId)&&uuid(raw.membershipId)&&uuid(raw.tenantId));
 assert.equal(raw.actorSessionVersion,1);assert.match(raw.releaseSha,/^[a-f0-9]{40}$/);
 assert.match(raw.actorEmail,/^[a-z0-9._+-]+@[^@]*\.invalid$/);
}
function validateInputs(qa,contracts){
 assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok([17,18].includes(qa.major));assert.equal(qa.operationalPairBaseline,'published107');
 assert.match(qa.sourceCommit??'',/^[a-f0-9]{40}$/);assert.ok(uuid(qa.ids?.binding));
 for(const raw of[qa.actor,qa.checker]){exact(raw,RAW_KEYS);assert.ok(uuid(raw.actorSessionId)&&uuid(raw.membershipId)&&uuid(raw.tenantId));assert.ok(Number.isSafeInteger(raw.actorSessionVersion)&&raw.actorSessionVersion>0);assert.match(raw.actorEmail,/@[^@]*\.invalid$/);assert.match(raw.releaseSha,/^[a-f0-9]{40}$/);}
 assert.equal(qa.actor.tenantId,qa.checker.tenantId);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
 assert.notEqual(qa.actor.actorEmail,qa.checker.actorEmail);assert.equal(qa.actor.releaseSha,qa.checker.releaseSha);
 assert.ok(Array.isArray(contracts)&&contracts.length===855&&contracts.every(uuid));
 assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,[...contracts].sort());
}
function assertPlan(plan){
 assert.equal(plan.version,NATIVE_FAMILY195_ACTORS_VERSION);assert.match(plan.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(plan.spec.length,4);assert.deepEqual(plan.spec.map(r=>r.name),NATIVE_FAMILY195_ACTOR_NAMES);
 const ids=new Set(),emails=new Set();let caps=0;
 for(const row of plan.spec){exact(row,SPEC_KEYS);validateRaw(row.actor);assert.ok(uuid(row.accountIdentityId));
  assert.equal(row.role,'QA_FAMILY195_'+row.name.toUpperCase());assert.deepEqual(row.capabilities,NATIVE_FAMILY195_ACTOR_CAPABILITIES[row.name]);
  assert.equal(row.actor.tenantId,plan.tenantId);assert.equal(row.actor.releaseSha,plan.releaseSha);
  assert.equal(row.contractId,row.name==='employee'?plan.contracts[7]:row.name==='selfreviewer'?plan.contracts[8]:null);
  for(const id of[row.accountIdentityId,row.actor.membershipId,row.actor.actorSessionId]){assert.ok(!ids.has(id));ids.add(id);}
  assert.ok(!emails.has(row.actor.actorEmail));emails.add(row.actor.actorEmail);caps+=row.capabilities.length;
 }assert.equal(caps,16);
}
function effectiveSql(schema,spec,exclude){
 return `(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE "C") FROM ${schema}.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id::text COLLATE "C"),'[]'::jsonb) FROM ${schema}.tenant_membership m${exclude?' WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements('+j(spec)+") x WHERE x.value#>>'{actor,membershipId}'=m.id::text)":''})`;
}
function metadataSql(schema){
 const ns=q(schema),namespace=`(SELECT oid FROM pg_namespace WHERE nspname=${ns})`,relations=`(SELECT oid FROM pg_class WHERE relnamespace=${namespace})`;
 const relationRows=`(SELECT c.oid,c.relname,c.relnamespace,c.reltype,c.reloftype,c.relowner,c.relam,c.reltablespace,c.reltoastrelid,c.relhasindex,c.relisshared,c.relpersistence,c.relkind,c.relnatts,c.relchecks,c.relhasrules,c.relhastriggers,c.relhassubclass,c.relrowsecurity,c.relforcerowsecurity,c.relispopulated,c.relreplident,c.relispartition,c.relrewrite,c.relacl,c.reloptions,c.relpartbound FROM pg_class c WHERE c.relnamespace=${namespace})`;
 const entries=[
 ['namespace',aggregate('pg_namespace','n',`n.oid=${namespace}`)],['functions',aggregate('pg_proc','f',`f.pronamespace=${namespace}`)],
 ['relations',aggregate(relationRows,'r')],['attributes',aggregate('pg_attribute','a',`a.attrelid IN${relations}`)],
 ['constraints',aggregate('pg_constraint','c',`c.connamespace=${namespace}`)],['triggers',aggregate('pg_trigger','t',`t.tgrelid IN${relations}`)],
 ['policies',aggregate('pg_policy','p',`p.polrelid IN${relations}`)],['defaults',aggregate('pg_attrdef','d',`d.adrelid IN${relations}`)],
 ['indexes',aggregate('pg_index','i',`i.indrelid IN${relations}`)],['types',aggregate('pg_type','t',`t.typnamespace=${namespace}`)],
 ['enums',aggregate('pg_enum','e',`e.enumtypid IN(SELECT oid FROM pg_type WHERE typnamespace=${namespace})`)],
 ['ranges',aggregate('pg_range','g',`g.rngtypid IN(SELECT oid FROM pg_type WHERE typnamespace=${namespace})`)],
 ['defaultAcls',aggregate('pg_default_acl','d',`d.defaclnamespace IN(0,${namespace})`)],
 ['sequenceDefinitions',aggregate('pg_sequence','s',`s.seqrelid IN${relations}`)],
 ['roles',aggregate('pg_roles','r')],['roleMemberships',aggregate('pg_auth_members','m')]
 ];return 'jsonb_build_object('+entries.flatMap(([key,value])=>[q(key),value]).join(',')+')';
}
function populationSql(plan){
 return `(SELECT coalesce(jsonb_agg(n.contract_id::text ORDER BY n.contract_id::text COLLATE "C"),'[]'::jsonb) FROM ${plan.schema}.native_employee_registration n WHERE n.tenant_id=${q(plan.tenantId)}::uuid AND n.source_binding_id=${q(plan.bindingId)}::uuid AND ${j(plan.contracts)} ? n.contract_id::text)`;
}
function exclusionSql(spec){
 const p=j(spec),members=`(SELECT value#>>'{actor,membershipId}' FROM jsonb_array_elements(${p}))`;
 return{
 internal_users:`EXISTS(SELECT 1 FROM jsonb_array_elements(${p}) x WHERE r.email=x.value#>>'{actor,actorEmail}' AND r.tenant_iam_id=(x.value->>'accountIdentityId')::uuid)`,
 tenant_membership:`r.id::text IN${members}`,
 tenant_identity_session:`r.id::text IN(SELECT value#>>'{actor,actorSessionId}' FROM jsonb_array_elements(${p}))`,
 tenant_action_authority:`r.membership_id::text IN${members}`,
 tenant_action_employment_link:`r.membership_id::text IN${members}`,
 iam_role:`r.role_key IN(SELECT value->>'role' FROM jsonb_array_elements(${p}))`,
 iam_role_capability:`r.role_key IN(SELECT value->>'role' FROM jsonb_array_elements(${p}))`
 };
}
function snapshotStatement(plan,slot){
 assert.ok(['before','after','durable','contexts_before','contexts_after'].includes(slot));
 const schema=plan.schema,ns=q(schema),excluded=exclusionSql(plan.spec);
 const branches=Object.entries(excluded).map(([table,filter])=>'WHEN '+q(table)+' THEN '+q('NOT('+filter+')')).join(' ');
 return `DO $family195_snapshot$
 DECLARE table_record record;sequence_record record;filter_value text;row_state jsonb;sequence_state jsonb;
 table_rows jsonb:='[]';sequence_rows jsonb:='[]';totals jsonb:='{}';all_count bigint;result jsonb;
 BEGIN
 FOR table_record IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns} AND c.relkind IN('r','p','m') ORDER BY c.relname COLLATE "C" LOOP
  filter_value:=CASE table_record.relname ${branches} ELSE 'true' END;
  EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''sha256'',encode(public.digest(coalesce(string_agg(encode(public.digest(to_jsonb(r)::text,''sha256''),''hex''),chr(10) ORDER BY encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') COLLATE "C"),''''),''sha256''),''hex'')) FROM %I.%I r WHERE %s',${ns},table_record.relname,filter_value) INTO row_state;
  EXECUTE format('SELECT count(*) FROM %I.%I',${ns},table_record.relname) INTO all_count;
  table_rows:=table_rows||jsonb_build_array(jsonb_build_object('table',table_record.relname,'rows',row_state));
  totals:=totals||jsonb_build_object(table_record.relname,all_count);
 END LOOP;
 FOR sequence_record IN SELECT c.oid,c.relname,c.relowner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns} AND c.relkind='S' ORDER BY c.relname COLLATE "C" LOOP
  EXECUTE format('SELECT jsonb_build_object(''lastValue'',last_value,''isCalled'',is_called) FROM %I.%I',${ns},sequence_record.relname) INTO sequence_state;
  sequence_rows:=sequence_rows||jsonb_build_array(jsonb_build_object('identity',to_jsonb(sequence_record),'value',sequence_state));
 END LOOP;
 result:=jsonb_build_object('prior',jsonb_build_object('tables',table_rows,'metadata',${metadataSql(schema)},'sequences',sequence_rows,'effective',${effectiveSql(schema,plan.spec,true)},'native855',${populationSql(plan)}),'totals',totals);
 PERFORM set_config('${SLOT}.actors_${slot}',result::text,true);
 END $family195_snapshot$`;
}
function nativeJoin(plan,contract){
 const s=plan.schema;return `SELECT c.id AS contract_id,c.person_id,n.id AS registration_id FROM ${s}.employment_contract c JOIN ${s}.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=c.tenant_id JOIN ${s}.person_identity p ON p.id=c.person_id JOIN ${s}.platform_tenant_source_binding b ON b.id=n.source_binding_id AND b.tenant_id=n.tenant_id JOIN ${s}.tenant_identity_policy policy ON policy.tenant_id=b.tenant_id AND policy.certified_source_binding_id=b.id WHERE c.id=${contract} AND c.tenant_id=${q(plan.tenantId)}::uuid AND n.tenant_id=c.tenant_id AND n.source_binding_id=${q(plan.bindingId)}::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.status='active' AND c.legacy_company_id=b.source_company_id AND b.verified AND policy.tenant_data_plane_ready`;
}
function actorsReadSql(plan){
 const s=plan.schema,p=j(plan.spec);
 return `SELECT coalesce(jsonb_agg(jsonb_build_object('name',x.value->>'name','roleKey',m.role_key,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE "C") FROM ${s}.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb),'user',to_jsonb(u),'membership',to_jsonb(m),'authority',to_jsonb(a),'session',to_jsonb(se),'links',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.membership_id::text COLLATE "C") FROM ${s}.tenant_action_employment_link l WHERE l.membership_id=m.id),'[]'::jsonb),'native',CASE WHEN x.value->>'contractId' IS NULL THEN NULL ELSE (SELECT to_jsonb(n) FROM (${nativeJoin(plan,"(x.value->>'contractId')::uuid")}) n) END) ORDER BY x.ordinality),'[]'::jsonb) FROM jsonb_array_elements(${p}) WITH ORDINALITY x(value,ordinality) JOIN ${s}.internal_users u ON u.email=x.value#>>'{actor,actorEmail}' JOIN ${s}.tenant_membership m ON m.id=(x.value#>>'{actor,membershipId}')::uuid JOIN ${s}.tenant_action_authority a ON a.membership_id=m.id JOIN ${s}.tenant_identity_session se ON se.id=(x.value#>>'{actor,actorSessionId}')::uuid`;
}
function validateActorsStatement(plan){
 const s=plan.schema,p=j(plan.spec),tenant=q(plan.tenantId),binding=q(plan.bindingId),provenance=q(plan.provenanceEmail);
 return `DO $family195_validate_actors$ DECLARE actor_row jsonb;raw jsonb;actual_caps jsonb;member_record record; BEGIN
 FOR member_record IN SELECT id FROM ${s}.tenant_membership ORDER BY id LOOP PERFORM ${s}.tenant_iam_assert_no_sod_conflict(member_record.id);END LOOP;
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${p}) LOOP raw:=actor_row->'actor';
  IF (SELECT count(*) FROM ${s}.iam_role WHERE role_key=actor_row->>'role' AND label='Acceso familiar195 sintético: '||(actor_row->>'name') AND description=${q(REASON)} AND scope_kind='tenant' AND system_managed)<>1 OR (SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') FROM ${s}.iam_role_capability WHERE role_key=actor_row->>'role') IS DISTINCT FROM actor_row->'capabilities' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_ROLE_CHANGED';END IF;
  SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') INTO actual_caps FROM ${s}.tenant_iam_effective_capabilities((raw->>'membershipId')::uuid);
  IF actual_caps IS DISTINCT FROM actor_row->'capabilities' OR EXISTS(SELECT 1 FROM ${s}.tenant_membership_capability_override WHERE membership_id=(raw->>'membershipId')::uuid) OR EXISTS(SELECT 1 FROM ${s}.platform_user_role WHERE user_email=raw->>'actorEmail') OR EXISTS(SELECT 1 FROM ${s}.tenant_action_area_scope WHERE membership_id=(raw->>'membershipId')::uuid) OR EXISTS(SELECT 1 FROM ${s}.tenant_identity_legacy_binding WHERE user_email=raw->>'actorEmail') THEN RAISE EXCEPTION 'FAMILY195_ACTORS_EFFECTIVE_CAPABILITIES_CHANGED';END IF;
  IF (SELECT count(*) FROM ${s}.internal_users WHERE email=raw->>'actorEmail')<>1 OR (SELECT count(*) FROM ${s}.tenant_membership WHERE user_email=raw->>'actorEmail')<>1 OR (SELECT count(*) FROM ${s}.tenant_identity_session WHERE user_email=raw->>'actorEmail')<>1 OR (SELECT count(*) FROM ${s}.tenant_action_authority WHERE membership_id=(raw->>'membershipId')::uuid)<>1 THEN RAISE EXCEPTION 'FAMILY195_ACTORS_EXACT_IDENTITY_ROWS';END IF;
  IF NOT EXISTS(SELECT 1 FROM ${s}.internal_users u JOIN ${s}.tenant_membership m ON m.user_email=u.email JOIN ${s}.tenant_identity_session se ON se.user_email=u.email JOIN ${s}.tenant_action_authority a ON a.membership_id=m.id AND a.tenant_id=m.tenant_id WHERE u.email=raw->>'actorEmail' AND u.tenant_iam_id=(actor_row->>'accountIdentityId')::uuid AND u.display_name='Cuenta sintética familiar195: '||(actor_row->>'name') AND u.role='EMPLEADO' AND u.auth_mode='managed' AND u.active AND u.password_hash IS NULL AND u.identity_version=1 AND m.id=(raw->>'membershipId')::uuid AND m.tenant_id=${tenant}::uuid AND m.status='active' AND m.role_key=actor_row->>'role' AND m.version=1 AND m.invited_by_user_email=${provenance} AND m.activated_at IS NOT NULL AND a.version=1 AND se.id=(raw->>'actorSessionId')::uuid AND se.active_tenant_id=m.tenant_id AND se.source='membership' AND se.auth_level='mfa' AND se.status='active' AND se.revoked_at IS NULL AND se.session_version=1 AND se.identity_version=u.identity_version AND se.version=1 AND se.device_label='QA familiar195 sintético' AND se.expires_at>transaction_timestamp() AND se.last_seen_at BETWEEN transaction_timestamp()-interval '1 hour' AND transaction_timestamp()) THEN RAISE EXCEPTION 'FAMILY195_ACTORS_MFA_MEMBERSHIP_REQUIRED';END IF;
  IF actor_row->>'contractId' IS NULL THEN
   IF EXISTS(SELECT 1 FROM ${s}.tenant_action_employment_link WHERE membership_id=(raw->>'membershipId')::uuid) THEN RAISE EXCEPTION 'FAMILY195_ACTORS_UNLINKED_CHANGED';END IF;
  ELSE
   IF (SELECT count(*) FROM ${s}.tenant_action_employment_link WHERE tenant_id=${tenant}::uuid AND employment_contract_id=(actor_row->>'contractId')::uuid)<>1 OR NOT EXISTS(SELECT 1 FROM ${s}.tenant_action_employment_link WHERE membership_id=(raw->>'membershipId')::uuid AND tenant_id=${tenant}::uuid AND source_binding_id=${binding}::uuid AND employment_contract_id=(actor_row->>'contractId')::uuid AND active AND revoked_at IS NULL AND linked_by_user_email=${provenance}) OR (SELECT count(*) FROM (${nativeJoin(plan,"(actor_row->>'contractId')::uuid")}) n)<>1 THEN RAISE EXCEPTION 'FAMILY195_ACTORS_NATIVE_LINK_CHANGED';END IF;
  END IF;
 END LOOP;
 END $family195_validate_actors$`;
}
function contextsStatement(plan){
 const s=plan.schema,p=j(plan.spec),tenant=q(plan.tenantId),binding=q(plan.bindingId);
 return `DO $family195_contexts$ DECLARE actor_row jsonb;raw jsonb;mode_value text;ctx jsonb;base_ctx jsonb;resolved jsonb;identity_row record;result jsonb:='[]'; BEGIN
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${p}) LOOP raw:=actor_row->'actor';
  base_ctx:=${s}.action_center_assert_tenant_read_session_v2(raw->>'actorEmail',(raw->>'actorSessionId')::uuid,1,raw->>'releaseSha',(raw->>'tenantId')::uuid,(raw->>'membershipId')::uuid);
  IF base_ctx->>'roleKey' IS DISTINCT FROM actor_row->>'role' OR base_ctx->>'tenantId' IS DISTINCT FROM ${tenant} OR base_ctx->>'membershipId' IS DISTINCT FROM raw->>'membershipId' OR base_ctx->>'sourceBindingId' IS DISTINCT FROM ${binding} OR base_ctx->'capabilities' IS DISTINCT FROM actor_row->'capabilities' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_COMMON_CONTEXT_CHANGED';END IF;
  FOR mode_value IN SELECT value FROM jsonb_array_elements_text(CASE actor_row->>'name' WHEN 'selfreviewer' THEN '["self","review"]'::jsonb WHEN 'reviewer' THEN '["review"]'::jsonb ELSE '["self"]'::jsonb END) LOOP
   ctx:=${s}.native_family_context_v1(raw,mode_value,true);
   IF ctx->>'roleKey' IS DISTINCT FROM base_ctx->>'roleKey' OR ctx->>'tenantId' IS DISTINCT FROM ${tenant} OR ctx->>'membershipId' IS DISTINCT FROM raw->>'membershipId' OR ctx->>'sourceBindingId' IS DISTINCT FROM ${binding} OR ctx->>'actorEmail' IS DISTINCT FROM raw->>'actorEmail' OR ctx->'capabilities' IS DISTINCT FROM actor_row->'capabilities' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_FAMILY_CONTEXT_CHANGED';END IF;
   IF actor_row->>'contractId' IS NULL THEN
    IF ctx->>'actorPersonId' IS NOT NULL OR ctx->>'employmentContractId' IS NOT NULL OR ctx->>'selfState' IS DISTINCT FROM 'unlinked' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_UNLINKED_CONTEXT_CHANGED';END IF;
   ELSE
    SELECT * INTO STRICT identity_row FROM (${nativeJoin(plan,"(actor_row->>'contractId')::uuid")}) n;
    resolved:=${s}.native_account_contract_v1(${tenant}::uuid,${binding}::uuid,identity_row.contract_id,true);
    IF ctx->>'actorPersonId' IS DISTINCT FROM identity_row.person_id::text OR ctx->>'employmentContractId' IS DISTINCT FROM identity_row.contract_id::text OR resolved->>'personId' IS DISTINCT FROM identity_row.person_id::text OR resolved#>>'{subject,origin}' IS DISTINCT FROM 'MUNICONTROL' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_NATIVE_IDENTITY_CHANGED';END IF;
    IF mode_value='self' AND (ctx->>'selfState' IS DISTINCT FROM 'native' OR ctx->'selfSubject' IS DISTINCT FROM resolved->'subject' OR ctx#>>'{selfSubject,identityToken}' IS NULL OR ctx#>>'{selfSubject,identityToken}'!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'FAMILY195_ACTORS_NATIVE_SUBJECT_CHANGED';END IF;
   END IF;
   result:=result||jsonb_build_array(jsonb_build_object('name',actor_row->>'name','mode',mode_value,'context',ctx));
  END LOOP;
 END LOOP;
 IF (SELECT count(DISTINCT value#>>'{context,actorPersonId}') FROM jsonb_array_elements(result) WHERE value->>'mode'='self' AND value->>'name' IN('employee','selfreviewer'))<>2 THEN RAISE EXCEPTION 'FAMILY195_ACTORS_DISTINCT_NATIVE_PEOPLE';END IF;
 PERFORM set_config('${SLOT}.actors_contexts',result::text,true);
 END $family195_contexts$`;
}
function bootstrapStatement(plan){
 const calls=plan.spec.flatMap(row=>(row.name==='selfreviewer'?['self','review']:[row.name==='reviewer'?'review':'self']).map(mode=>({row,mode})));
 return `DO $family195_bootstraps$ DECLARE b jsonb;result jsonb:='[]';BEGIN
 ${calls.map(({row,mode})=>`b:=${plan.schema}.native_family_${mode}_bootstrap_v1(${j(row.actor)},'all',NULL);
 IF b->>'state' IS DISTINCT FROM ${q(mode==='review'?'ready':row.contractId?'native':'unlinked')} OR (b->>'canSubmit')::boolean IS DISTINCT FROM ${mode==='self'&&row.contractId?'true':'false'} OR b#>>'{scope,tenantId}' IS DISTINCT FROM ${q(plan.tenantId)} OR b#>>'{scope,membershipId}' IS DISTINCT FROM ${q(row.actor.membershipId)} THEN RAISE EXCEPTION 'FAMILY195_ACTORS_PUBLIC_BOOTSTRAP_CHANGED';END IF;
 ${row.name==='unlinked'?`IF b->'subject'<>'null'::jsonb OR b->'families'<>'[]'::jsonb OR b->'requests'<>'[]'::jsonb OR (b->>'total')::integer<>0 OR (b->>'complete')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAMILY195_ACTORS_UNLINKED_BOOTSTRAP_CHANGED';END IF;`:''}
 ${mode==='self'&&row.contractId?`IF b#>>'{subject,subjectVersion}' IS NULL OR b#>>'{subject,subjectVersion}'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_PUBLIC_SUBJECT_REQUIRED';END IF;`:''}
 result:=result||jsonb_build_array(jsonb_build_object('name',${q(row.name)},'mode',${q(mode)},'bootstrap',b));`).join('\n')}
 PERFORM set_config('${SLOT}.actors_bootstraps',result::text,true);
 END $family195_bootstraps$`;
}

export function buildNativeFamily195ActorsFixture({qa,contracts,read}){
 validateInputs(qa,contracts);assert.equal(typeof read,'function');
 const sourceHashes=Object.fromEntries(SOURCES.map(file=>{const source=read(file);assert.equal(typeof source,'string');return[file,hash(source.replace(/\r\n?/g,'\n'))];}));
 const used=new Set([qa.actor.membershipId,qa.checker.membershipId,qa.actor.actorSessionId,qa.checker.actorSessionId]);
 const spec=NATIVE_FAMILY195_ACTOR_NAMES.map(name=>{
  const actor={actorEmail:'family195-'+name+'-'+randomUUID()+'@example.invalid',actorSessionId:randomUUID(),actorSessionVersion:1,membershipId:randomUUID(),releaseSha:qa.actor.releaseSha,tenantId:qa.actor.tenantId};
  const accountIdentityId=randomUUID();for(const id of[accountIdentityId,actor.actorSessionId,actor.membershipId]){assert.ok(!used.has(id));used.add(id);}
  assert.notEqual(actor.actorEmail,qa.actor.actorEmail);assert.notEqual(actor.actorEmail,qa.checker.actorEmail);
  return{name,role:'QA_FAMILY195_'+name.toUpperCase(),contractId:name==='employee'?contracts[7]:name==='selfreviewer'?contracts[8]:null,accountIdentityId,actor,capabilities:[...NATIVE_FAMILY195_ACTOR_CAPABILITIES[name]]};
 });
 const plan={version:NATIVE_FAMILY195_ACTORS_VERSION,schema:qa.schema,major:qa.major,sourceCommit:qa.sourceCommit,releaseSha:qa.actor.releaseSha,tenantId:qa.actor.tenantId,bindingId:qa.ids.binding,provenanceEmail:qa.actor.actorEmail,contracts:[...contracts],spec,sourceHashes,nativeIdentityContracts:{employee:contracts[7],selfreviewer:contracts[8]}};
 assertPlan(plan);const s=plan.schema,p=j(spec),allCaps=sorted(new Set(spec.flatMap(r=>r.capabilities))),allIds=spec.flatMap(r=>[r.accountIdentityId,r.actor.membershipId,r.actor.actorSessionId]);
 const before=`DO $family195_actors_preflight$ DECLARE actor_row jsonb;member_record record;resolved jsonb;identity_row record;table_name text;signature text; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::integer/10000<>${plan.major} OR (SELECT nspowner FROM pg_namespace WHERE nspname=${q(s)}) IS DISTINCT FROM current_user::regrole::oid THEN RAISE EXCEPTION 'FAMILY195_ACTORS_OWNER_RR_RW_REQUIRED';END IF;
 FOREACH table_name IN ARRAY ${'ARRAY['+NATIVE_FAMILY195_TABLES.map(q).join(',')+']::text[]'} LOOP IF to_regclass(${q(s+'.')}||table_name) IS NULL THEN RAISE EXCEPTION 'FAMILY195_ACTORS_INSTALLATION_REQUIRED';END IF;END LOOP;
 FOREACH signature IN ARRAY ${'ARRAY['+[...FACADES,'native_account_contract_v1(uuid,uuid,uuid,boolean)','action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)','native_family_context_v1(jsonb,text,boolean)','tenant_iam_effective_capabilities(uuid)'].map(v=>q(s+'.'+v)).join(',')+']::text[]'} LOOP IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'FAMILY195_ACTORS_INSTALLATION_REQUIRED';END IF;END LOOP;
 IF (SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') FROM ${s}.iam_capability WHERE scope_kind='tenant' AND ${j(allCaps)} ? capability_key) IS DISTINCT FROM ${j(allCaps)} THEN RAISE EXCEPTION 'FAMILY195_ACTORS_CAPABILITIES_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM ${s}.platform_tenant t JOIN ${s}.tenant_identity_policy policy ON policy.tenant_id=t.id JOIN ${s}.platform_tenant_source_binding b ON b.id=policy.certified_source_binding_id AND b.tenant_id=t.id WHERE t.id=${q(plan.tenantId)}::uuid AND t.status='active' AND policy.tenant_data_plane_ready AND policy.certified_release_sha=${q(plan.releaseSha)} AND b.id=${q(plan.bindingId)}::uuid AND b.verified) THEN RAISE EXCEPTION 'FAMILY195_ACTORS_POLICY_BINDING_CHANGED';END IF;
 IF ${populationSql(plan)} IS DISTINCT FROM ${j(contracts)} THEN RAISE EXCEPTION 'FAMILY195_ACTORS_EXACT_NATIVE855_REQUIRED';END IF;
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${p}) LOOP
  IF EXISTS(SELECT 1 FROM ${s}.iam_role WHERE role_key=actor_row->>'role') OR EXISTS(SELECT 1 FROM ${s}.iam_role_capability WHERE role_key=actor_row->>'role')
   OR EXISTS(SELECT 1 FROM ${s}.internal_users WHERE email=actor_row#>>'{actor,actorEmail}' OR ${j(allIds)} ? tenant_iam_id::text)
   OR EXISTS(SELECT 1 FROM ${s}.tenant_membership WHERE user_email=actor_row#>>'{actor,actorEmail}' OR ${j(allIds)} ? id::text)
   OR EXISTS(SELECT 1 FROM ${s}.tenant_identity_session WHERE user_email=actor_row#>>'{actor,actorEmail}' OR ${j(allIds)} ? id::text)
   OR EXISTS(SELECT 1 FROM ${s}.tenant_action_authority WHERE ${j(allIds)} ? membership_id::text)
   OR EXISTS(SELECT 1 FROM ${s}.tenant_action_employment_link WHERE ${j(allIds)} ? membership_id::text OR tenant_id=${q(plan.tenantId)}::uuid AND employment_contract_id IN(${q(contracts[7])}::uuid,${q(contracts[8])}::uuid))
   OR EXISTS(SELECT 1 FROM ${s}.tenant_membership_capability_override WHERE ${j(allIds)} ? membership_id::text)
   OR EXISTS(SELECT 1 FROM ${s}.tenant_action_area_scope WHERE ${j(allIds)} ? membership_id::text)
   OR EXISTS(SELECT 1 FROM ${s}.platform_user_role WHERE user_email=actor_row#>>'{actor,actorEmail}')
   OR EXISTS(SELECT 1 FROM ${s}.tenant_identity_legacy_binding WHERE user_email=actor_row#>>'{actor,actorEmail}')
  THEN RAISE EXCEPTION 'FAMILY195_ACTORS_IDENTITIES_OR_RESERVES_ALREADY_PRESENT';END IF;
  IF actor_row->>'contractId' IS NOT NULL THEN
   SELECT * INTO STRICT identity_row FROM (${nativeJoin(plan,"(actor_row->>'contractId')::uuid")}) n;
   resolved:=${s}.native_account_contract_v1(${q(plan.tenantId)}::uuid,${q(plan.bindingId)}::uuid,identity_row.contract_id,true);
   IF resolved->>'personId' IS DISTINCT FROM identity_row.person_id::text OR resolved#>>'{subject,origin}' IS DISTINCT FROM 'MUNICONTROL' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_RESERVED_NATIVE_IDENTITY_CHANGED';END IF;
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT n.person_id) FROM (${nativeJoin(plan,q(contracts[7])+'::uuid')} UNION ALL ${nativeJoin(plan,q(contracts[8])+'::uuid')}) n)<>2 THEN RAISE EXCEPTION 'FAMILY195_ACTORS_DISTINCT_RESERVED_PEOPLE';END IF;
 FOR member_record IN SELECT id FROM ${s}.tenant_membership ORDER BY id LOOP PERFORM ${s}.tenant_iam_assert_no_sod_conflict(member_record.id);END LOOP;
 END $family195_actors_preflight$`;
 const inserts=[];
 for(const row of spec){
  inserts.push(`INSERT INTO ${s}.iam_role(role_key,label,description,scope_kind,system_managed) VALUES(${q(row.role)},${q('Acceso familiar195 sintético: '+row.name)},${q(REASON)},'tenant',true)`);
  for(const cap of row.capabilities)inserts.push(`INSERT INTO ${s}.iam_role_capability(role_key,capability_key) VALUES(${q(row.role)},${q(cap)})`);
  const raw=row.actor;
  inserts.push(`INSERT INTO ${s}.internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version,tenant_iam_id) VALUES(${q(raw.actorEmail)},${q('Cuenta sintética familiar195: '+row.name)},'EMPLEADO',NULL,true,'managed',1,${q(row.accountIdentityId)}::uuid)`,
   `INSERT INTO ${s}.tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES(${q(raw.membershipId)}::uuid,${q(plan.tenantId)}::uuid,${q(raw.actorEmail)},${q(row.role)},'active',${q(plan.provenanceEmail)},transaction_timestamp())`,
   `INSERT INTO ${s}.tenant_action_authority(membership_id,tenant_id) SELECT ${q(raw.membershipId)}::uuid,${q(plan.tenantId)}::uuid WHERE NOT EXISTS(SELECT 1 FROM ${s}.tenant_action_authority WHERE membership_id=${q(raw.membershipId)}::uuid)`);
  if(row.contractId)inserts.push(`INSERT INTO ${s}.tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email) VALUES(${q(raw.membershipId)}::uuid,${q(plan.tenantId)}::uuid,${q(plan.bindingId)}::uuid,${q(row.contractId)}::uuid,${q(plan.provenanceEmail)})`);
  inserts.push(`INSERT INTO ${s}.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at) VALUES(${q(raw.actorSessionId)}::uuid,${q(raw.actorEmail)},${q(plan.tenantId)}::uuid,'membership','mfa',1,1,'active','QA familiar195 sintético',transaction_timestamp(),transaction_timestamp()+interval '1 hour')`);
 }
 const finalCheck=`DO $family195_actors_finalize$ DECLARE b jsonb:=current_setting('${SLOT}.actors_before')::jsonb;a jsonb:=current_setting('${SLOT}.actors_after')::jsonb;key text;delta bigint;deltas jsonb:='{}';actors jsonb; BEGIN
 IF b->'prior' IS DISTINCT FROM a->'prior' THEN RAISE EXCEPTION 'FAMILY195_ACTORS_PRIOR_MULTISET_METADATA_CHANGED';END IF;
 IF (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(b->'totals') k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(a->'totals') k) THEN RAISE EXCEPTION 'FAMILY195_ACTORS_TABLE_SET_CHANGED';END IF;
 FOR key IN SELECT jsonb_object_keys(b->'totals') LOOP delta:=(a->'totals'->>key)::bigint-(b->'totals'->>key)::bigint;
  IF delta<>coalesce((${j(DELTAS)}->>key)::bigint,0) THEN RAISE EXCEPTION 'FAMILY195_ACTORS_EXACT_DELTA_CHANGED' USING DETAIL=key;END IF;
  IF delta<>0 THEN deltas:=deltas||jsonb_build_object(key,delta);END IF;
 END LOOP;
 actors:=(${actorsReadSql(plan)});
 IF jsonb_array_length(actors)<>4 OR jsonb_array_length(current_setting('${SLOT}.actors_contexts')::jsonb)<>5 OR jsonb_array_length(current_setting('${SLOT}.actors_bootstraps')::jsonb)<>5 THEN RAISE EXCEPTION 'FAMILY195_ACTORS_COMPLETE_PROOF_REQUIRED';END IF;
 PERFORM set_config('${SLOT}.actors_proof',jsonb_build_object('version',${q(plan.version)},'schema',${q(s)},'major',${plan.major},'sourceCommit',${q(plan.sourceCommit)},'spec',${p},'sourceHashes',${j(sourceHashes)},'before',b->'prior','after',a->'prior','beforeCounts',b->'totals','afterCounts',a->'totals','deltas',deltas,'actors',actors,'contexts',current_setting('${SLOT}.actors_contexts')::jsonb,'bootstraps',current_setting('${SLOT}.actors_bootstraps')::jsonb,'priorRowsPreserved',true,'allMembershipSodChecked',true,'authenticationFixture',true,'accountProvisioningApiProven',false,'newPeople',0,'newContracts',0,'newRegistrations',0,'existingMembershipsChanged',0)::text,true);
 END $family195_actors_finalize$`;
 plan.statements=[before,snapshotStatement(plan,'before'),...inserts,validateActorsStatement(plan),contextsStatement(plan),'SET LOCAL ROLE municontrol_actions_runtime_app',bootstrapStatement(plan),'RESET ROLE',snapshotStatement(plan,'after'),finalCheck,`SELECT current_setting('${SLOT}.actors_proof')::jsonb`];
 plan.lateFaultStatement="DO $family195_actors_late_fault$ BEGIN RAISE EXCEPTION 'QA_FAMILY195_ACTORS_LATE_FAULT';END $family195_actors_late_fault$";
 plan.durableIamReadStatements=[snapshotStatement(plan,'durable'),`SELECT jsonb_build_object('snapshot',current_setting('${SLOT}.actors_durable')::jsonb,'actors',(${actorsReadSql(plan)}))`];
 plan.contextReadStatements=[validateActorsStatement(plan),snapshotStatement(plan,'contexts_before'),contextsStatement(plan),'SET LOCAL ROLE municontrol_actions_runtime_app',bootstrapStatement(plan),'RESET ROLE',snapshotStatement(plan,'contexts_after'),`DO $family195_context_read_only_effect$ BEGIN IF current_setting('${SLOT}.actors_contexts_before')::jsonb IS DISTINCT FROM current_setting('${SLOT}.actors_contexts_after')::jsonb THEN RAISE EXCEPTION 'FAMILY195_ACTORS_CONTEXT_READ_MUTATED_ROWS';END IF;END $family195_context_read_only_effect$`,`SELECT jsonb_build_object('contexts',current_setting('${SLOT}.actors_contexts')::jsonb,'bootstraps',current_setting('${SLOT}.actors_bootstraps')::jsonb)`];
 plan.absenceReadStatements=[snapshotStatement(plan,'durable'),`SELECT jsonb_build_object('snapshot',current_setting('${SLOT}.actors_durable')::jsonb,'users',(SELECT count(*) FROM ${s}.internal_users WHERE email IN(SELECT value#>>'{actor,actorEmail}' FROM jsonb_array_elements(${p})) OR ${j(allIds)} ? tenant_iam_id::text),'memberships',(SELECT count(*) FROM ${s}.tenant_membership WHERE ${j(allIds)} ? id::text OR user_email IN(SELECT value#>>'{actor,actorEmail}' FROM jsonb_array_elements(${p}))),'sessions',(SELECT count(*) FROM ${s}.tenant_identity_session WHERE ${j(allIds)} ? id::text OR user_email IN(SELECT value#>>'{actor,actorEmail}' FROM jsonb_array_elements(${p}))),'roles',(SELECT count(*) FROM ${s}.iam_role WHERE role_key IN(SELECT value->>'role' FROM jsonb_array_elements(${p}))),'roleCapabilities',(SELECT count(*) FROM ${s}.iam_role_capability WHERE role_key IN(SELECT value->>'role' FROM jsonb_array_elements(${p}))),'links',(SELECT count(*) FROM ${s}.tenant_action_employment_link WHERE ${j(allIds)} ? membership_id::text OR tenant_id=${q(plan.tenantId)}::uuid AND employment_contract_id IN(${q(contracts[7])}::uuid,${q(contracts[8])}::uuid)))`];
 Object.assign(plan,{connects:false,executesSql:false,sourceOnly:true,authenticationFixture:true,accountProvisioningApiProven:false,newPeople:0,newContracts:0,newRegistrations:0,newCapabilities:0,newSchemas:0,existingMembershipsChanged:0,executionAdmissionPending:true});
 return freeze(plan);
}

export function assertNativeFamily195ActorsProof(plan,proof){
 assertPlan(plan);assert.equal(proof.version,plan.version);assert.equal(proof.schema,plan.schema);assert.equal(proof.major,plan.major);assert.equal(proof.sourceCommit,plan.sourceCommit);
 assert.deepEqual(proof.spec,plan.spec);assert.deepEqual(proof.sourceHashes,plan.sourceHashes);assert.deepEqual(proof.before,proof.after);assert.deepEqual(proof.after.native855,plan.contracts);
 assert.deepEqual(proof.deltas,DELTAS);assert.equal(proof.priorRowsPreserved,true);assert.equal(proof.allMembershipSodChecked,true);
 assert.equal(proof.authenticationFixture,true);assert.equal(proof.accountProvisioningApiProven,false);
 for(const key of['newPeople','newContracts','newRegistrations','existingMembershipsChanged'])assert.equal(proof[key],0);
 assert.equal(proof.actors.length,4);assert.equal(proof.contexts.length,5);assert.equal(proof.bootstraps.length,5);
 const people=new Set();
 for(const row of plan.spec){
  const matches=proof.actors.filter(a=>a.name===row.name);assert.equal(matches.length,1);const a=matches[0],raw=row.actor;
  assert.equal(a.roleKey,row.role);assert.equal(a.membership.role_key,a.roleKey);assert.deepEqual(a.capabilities,row.capabilities);
  assert.equal(a.user.email,raw.actorEmail);assert.equal(a.user.tenant_iam_id,row.accountIdentityId);assert.equal(a.user.role,'EMPLEADO');assert.equal(a.user.password_hash,null);
  assert.equal(a.membership.id,raw.membershipId);assert.equal(a.membership.tenant_id,raw.tenantId);assert.equal(a.session.id,raw.actorSessionId);assert.equal(a.session.auth_level,'mfa');assert.equal(a.authority.membership_id,raw.membershipId);
  assert.equal(a.links.length,row.contractId?1:0);
  if(row.contractId){assert.equal(a.native.contract_id,row.contractId);assert.ok(uuid(a.native.person_id)&&uuid(a.native.registration_id));people.add(a.native.person_id);}
  else assert.equal(a.native,null);
  const contexts=proof.contexts.filter(c=>c.name===row.name);assert.equal(contexts.length,row.name==='selfreviewer'?2:1);
  for(const c of contexts){assert.equal(c.context.roleKey,a.roleKey);assert.deepEqual(c.context.capabilities,a.capabilities);assert.equal(c.context.employmentContractId,row.contractId);assert.equal(c.context.actorPersonId,a.native?.person_id??null);}
 }assert.equal(people.size,2);return{passed:true,sourceOnly:false,newPeople:0,newContracts:0,newRegistrations:0,newActors:4,newRoleCapabilities:16,newLinks:2};
}
function normalized(h,statements){
 assert.equal(typeof h?.json,'function');assert.equal(typeof h.qa?.normalized,'function');
 return statements.map(sql=>h.qa.normalized(sql));
}
export function readNativeFamily195ActorsDurable(h,plan,proof){
 assertNativeFamily195ActorsProof(plan,proof);assert.equal(h.qa.schema,plan.schema);
 const value=h.json(normalized(h,plan.durableIamReadStatements),{readOnly:true});
 assert.deepEqual(value.snapshot.prior,proof.after);assert.deepEqual(value.snapshot.totals,proof.afterCounts);assert.deepEqual(value.actors,proof.actors);
 return value;
}
export function readNativeFamily195ActorsContexts(h,plan,proof){
 assertNativeFamily195ActorsProof(plan,proof);assert.equal(h.qa.schema,plan.schema);
 const value=h.json(normalized(h,plan.contextReadStatements),{readOnly:false,end:'ROLLBACK'});
 assert.deepEqual(value.contexts,proof.contexts);assert.deepEqual(value.bootstraps,proof.bootstraps);
 return value;
}
export function assertNativeFamily195ActorsRollback(plan,trialProof,readback){
 assertNativeFamily195ActorsProof(plan,trialProof);assert.deepEqual(readback.snapshot.prior,trialProof.before);assert.deepEqual(readback.snapshot.totals,trialProof.beforeCounts);
 for(const key of['users','memberships','sessions','roles','roleCapabilities','links'])assert.equal(readback[key],0);
 return{passed:true,originalCompleteSnapshotRestored:true,proposedIdentitiesAbsent:true};
}
export function readNativeFamily195BrowserActors(h,plan,proof,durable,contexts){
 assertNativeFamily195ActorsProof(plan,proof);assert.deepEqual(durable.actors,proof.actors);assert.deepEqual(contexts.contexts,proof.contexts);
 const result={};
 for(const row of plan.spec){
  const raw=row.actor,proofActor=proof.actors.find(a=>a.name===row.name);
  const accessValue=h.json(normalized(h,[ownerProgramQaAccessSql(plan.schema,raw)]),{readOnly:true});
  const roleRows=h.json(normalized(h,[`SELECT coalesce(jsonb_agg(jsonb_build_object('roleKey',m.role_key)),'[]'::jsonb) FROM ${plan.schema}.tenant_membership m WHERE m.id=${q(raw.membershipId)}::uuid AND m.tenant_id=${q(raw.tenantId)}::uuid AND m.user_email=${q(raw.actorEmail)} AND m.status='active'`]),{readOnly:true});
  assert.equal(roleRows.length,1);const roleKey=roleRows[0].roleKey;assert.equal(typeof roleKey,'string');
  assert.equal(roleKey,row.role);assert.equal(roleKey,proofActor.roleKey);assert.equal(roleKey,durable.actors.find(a=>a.name===row.name).roleKey);
  for(const c of contexts.contexts.filter(c=>c.name===row.name))assert.equal(roleKey,c.context.roleKey);
  assert.equal(accessValue.release,raw.releaseSha);assert.equal(accessValue.ready,true);assert.equal(accessValue.verified,true);
  assert.equal(accessValue.authLevel,'mfa');assert.deepEqual(sorted(accessValue.tenantCapabilities),row.capabilities);
  assert.deepEqual(accessValue.roles??[],[]);assert.deepEqual(accessValue.platformCapabilities??[],[]);
  const access=ownerProgramQaAccess(accessValue,raw),principal=access.principal;
  const session={...access.session,releaseSha:accessValue.release};
  const dto=employeeContext(principal,session);exact(dto,RAW_KEYS);assert.deepEqual(dto,raw);
  assert.deepEqual(schoolCertificatePrincipalValues(principal,session),[raw.actorEmail,raw.actorSessionId,1,raw.releaseSha,raw.tenantId,raw.membershipId]);
  assert.equal(principal.tenant.certifiedReleaseSha,raw.releaseSha);assert.equal(principal.tenant.dataPlaneReady,true);
  assert.ok(Number.isFinite(Date.parse(principal.session.expiresAt)));assert.equal(principal.session.mfa,true);
  result[row.name]={principal,session,raw,roleKey};
 }exact(result,NATIVE_FAMILY195_ACTOR_NAMES);return result;
}

const FAMILY_RELATIONS="(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN("+NATIVE_FAMILY195_TABLES.map(q).join(',')+"))";
const once=(s,from,to)=>{assert.equal(s.split(from).length,2,'FAMILY195_SNAPSHOT_ANCHOR');return s.replace(from,()=>to);};
export function nativeFamily195NonFamilySnapshot(h,plan){
 assertPlan(plan);assert.equal(h.qa.schema,plan.schema);
 let sql=preservationSnapshot('after');const hook="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(sql.split(hook).length-1,2,'FAMILY195_SNAPSHOT_HOOKS');sql=sql.replaceAll(hook,'p.oid NOT IN'+FAMILY_RELATIONS);
 sql=once(sql,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'true').replaceAll('municontrol_sql111.','municontrol_family195_browser.');
 assert.ok(!sql.includes('native_leave')&&!sql.includes('municontrol_sql111.'));
 const read="SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_family195_browser.after')::jsonb::text,'sha256'),'hex'),'tables',jsonb_array_length(current_setting('municontrol_family195_browser.after')::jsonb->'tables'),'excluded',(SELECT count(*) FROM pg_class WHERE oid IN"+FAMILY_RELATIONS+"),'metadata',"+metadataSql(plan.schema)+",'effective',"+effectiveSql(plan.schema,plan.spec,false)+",'native855',"+populationSql(plan)+",'actors',("+actorsReadSql(plan)+")) AS snapshot";
 const value=h.json(normalized(h,[sql,read]),{readOnly:true});
 assert.deepEqual(value.native855,plan.contracts);assert.equal(value.actors.length,4);
 assert.equal(value.excluded,11,'FAMILY195_BROWSER_ELEVEN_TABLES_EXCLUDED');assert.ok(value.tables>0);assert.match(value.fingerprint,/^[a-f0-9]{64}$/);return value;
}
export const NATIVE_FAMILY195_SNAPSHOT_KEYS=Object.freeze([...NATIVE_FAMILY195_TABLES,'storage_policy_generation','storage_policy_pdf_quota_bytes','storage_policy_cluster_limit_bytes','storage_policy_cluster_reserve_bytes']);
export function nativeFamily195FamilySnapshot(h){
 const fields=NATIVE_FAMILY195_TABLES.flatMap(t=>[q(t),`(SELECT count(*) FROM public.${t})`]);
 for(const [key,column]of Object.entries({storage_policy_generation:'generation',storage_policy_pdf_quota_bytes:'pdf_quota_bytes',storage_policy_cluster_limit_bytes:'cluster_limit_bytes',storage_policy_cluster_reserve_bytes:'cluster_reserve_bytes'}))fields.push(q(key),`(SELECT ${column} FROM public.school_certificate_storage_policy WHERE singleton)`);
 const value=h.json(normalized(h,['SELECT jsonb_build_object('+fields.join(',')+') AS snapshot']),{readOnly:true});
 exact(value,NATIVE_FAMILY195_SNAPSHOT_KEYS);assert.ok(Object.values(value).every(Number.isSafeInteger),'FAMILY195_BROWSER_FAMILY_SNAPSHOT_NUMERIC');return value;
}
export function nativeFamily195FamilyRowsSnapshot(h){
 const tables=NATIVE_FAMILY195_TABLES.map(q).join(',');
 const sql=`DO $family195_family_rows$ DECLARE table_record record;row_state jsonb;pk_fields text[];result jsonb:='[]';BEGIN
 FOR table_record IN SELECT c.oid,c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN(${tables}) ORDER BY c.relname COLLATE "C" LOOP
  SELECT array_agg(a.attname::text ORDER BY k.ordinality) INTO pk_fields FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=table_record.oid AND i.indisprimary AND k.ordinality<=i.indnkeyatts;
  IF pk_fields IS NULL THEN RAISE EXCEPTION 'FAMILY195_FAMILY_PK_REQUIRED';END IF;
  EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''rows'',coalesce(jsonb_agg(jsonb_build_object(''key'',(SELECT jsonb_object_agg(k,to_jsonb(r)->k ORDER BY k COLLATE "C") FROM unnest($1) k),''sha256'',encode(public.digest(to_jsonb(r)::text,''sha256''),''hex''),''provenance'',jsonb_build_object(''requestId'',to_jsonb(r)->''request_id'',''actorMembershipId'',to_jsonb(r)->''actor_membership_id'',''submitterMembershipId'',to_jsonb(r)->''submitter_membership_id'',''contractId'',to_jsonb(r)->''contract_id'',''blobSha256'',to_jsonb(r)->''blob_sha256'')) ORDER BY (SELECT jsonb_object_agg(k,to_jsonb(r)->k ORDER BY k COLLATE "C") FROM unnest($1) k)::text COLLATE "C"),''[]''::jsonb)) FROM public.%I r',table_record.relname) INTO row_state USING pk_fields;
  result:=result||jsonb_build_array(jsonb_build_object('table',table_record.relname,'state',row_state));
 END LOOP;
 IF jsonb_array_length(result)<>11 THEN RAISE EXCEPTION 'FAMILY195_ELEVEN_FAMILY_TABLES_REQUIRED';END IF;
 PERFORM set_config('municontrol_family195_browser.family_rows',jsonb_build_object('tables',result,'schoolPolicy',(SELECT to_jsonb(p) FROM public.school_certificate_storage_policy p WHERE singleton),'nativePolicy',(SELECT to_jsonb(p) FROM public.native_family_storage_policy p WHERE singleton))::text,true);
 END $family195_family_rows$`;
 return h.json(normalized(h,[sql,"SELECT current_setting('municontrol_family195_browser.family_rows')::jsonb"]),{readOnly:true});
}

/*
Integration, after independent prerequisite durability and then195 durability:
- Build the plan once; retain spec for late-fault rollback rehearsal, commit and readback.
- Normalize plan.statements with h.qa.normalized; execute only in the owner's reviewed RR/RW transaction.
- The late-fault rehearsal must replace the terminal proof SELECT with the fault statement after recording the proof inside that same transaction; independently verify absence and complete before restoration.
- Commit outcome uncertainty is read back with the same spec; it never authorizes regeneration or automatic retry.
- Read durable IAM with readOnly:true. Context/bootstrap readback uses readOnly:false and no business commands; root ends that readback with ROLLBACK.
- Construct actors only with readNativeFamily195BrowserActors after both readbacks. It returns exactly four exterior keys per actor: principal/session/raw/roleKey; raw remains the six-field product DTO.
- The browser fixture receives actors, plan.nativeIdentityContracts and readFamilySnapshot:()=>nativeFamily195FamilySnapshot(h); root supplies its already reviewed synthetic/PDF inputs.
- The browser readSnapshot is ()=>nativeFamily195NonFamilySnapshot(h,plan). It includes metadata, every effective-capability set, the exact855 array and the four actual IAM rows, without excluding any new IAM addition. All snapshot statements pass h.qa.normalized, including the excluded-count SELECT.
- The durable IAM/context functions admit actors before the browser; their full installation snapshots must not be compared to a later family-data epoch. For final IAM/policy/native855 conservation use the complete non-family baseline above, plus nativeFamily195FamilyRowsSnapshot before/after the browser and around negatives/replays/readers. Match new PK/provenance to the five scenarioRequestIds/receipts, preserve every old append-only row, compare nativePolicy fully and schoolPolicy fully except generation+2. Numeric deltas alone are insufficient.
- Public195 facades, including readers, use READ WRITE; subsequent commands use READ COMMITTED on the existing finite transport. No new connection, database, personnel seed or permission repair is supplied here.
- This file remains an unexecuted text proposal; source hashes identify inputs when root later builds it. Root pins the adopted public bytes separately.
*/
