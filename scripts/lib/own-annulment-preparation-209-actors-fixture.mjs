// PRIVATE SOURCE CANDIDATE: no constructor/import/execution admission.
// A future native190 extension may call this ONLY after source-pinned209
// installation immediately following208. No production connection or new schema.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

const sourcePins=Object.freeze({
 "scripts/internal-schema.sql": "01361fcc19a1cd3bcb76eed457bc507c7db33079b713db043a6fb284cd097c3d",
 "scripts/migrations/004-tenant-iam-control-plane.sql": "d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195",
 "scripts/migrations/005-tenant-identity-gateway.sql": "dca8ae5d6dd0c5481bd4b0b8ec9799048e813df8f2248d5533e6d34b49fb7392",
 "scripts/migrations/006-tenant-action-authority.sql": "0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a",
 "scripts/migrations/007-action-center-read-facades.sql": "d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e",
 "scripts/migrations/009-tenant-lifecycle-hardening.sql": "d2152fe1df92ac646ada498b6140523a8bc3f13901ac49a95da13744dc72dfe4",
 "scripts/migrations/013-existing-identity-membership-governance.sql": "32eb0a599a3071996121fab526ef6b93951eda12184cddee4a8f04e3ab970d3d",
 "scripts/migrations/067-native-employee-registration.sql": "aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749",
 "scripts/migrations/104-native-employment-changes.sql": "0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a",
 "scripts/migrations/112-native-salary-definitions.sql": "da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3",
 "scripts/migrations/113-native-employee-self-access.sql": "9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7",
 "scripts/migrations/123-own-payroll-runs.sql": "a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b",
 "scripts/migrations/176-own-payroll-administrative-operator.sql": "f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732",
 "scripts/lib/municipal-owner-program-qa.mjs": "c9dc1d3540ed42f89f22d5e7ea0370c62d9ab6b055d7197462411492538ad3eb",
 "scripts/lib/municipal-owner-adoption-decision-qa.mjs": "e6d9d39d1dee48d24f01148d07997d85e51d8ca62ff5eefb4a6dc00679d99624",
 "scripts/lib/own-payroll-report-census-190-iam-fixture.mjs": "c70429d6151bcd3dd94487a1643f196163e7e8be1e08bfc196f81fef9d8041b1",
 "scripts/lib/own-payroll-full-capacity-190-continuation.mjs": "99ce92a626b1e35d58b206162bf279dab757a451307245a29f602f9902a07a01",
 "lib/internal-native-employees.js": "0f044bb371566fe2225ae875ca0383657c05f27fc876019b08ba779d80e121d8",
 "scripts/migrations/209-own-annulment-preparation-projection.sql": "eabc4f72cc0203a87af50287fcb6367a2ca81e6f957e73b5ee1c2b868aeb6dc4"
});
export const OWN_ANNUL_PREPARER_209_CAPABILITIES=Object.freeze([
 'actions.read','workforce.employee.read','payroll.parameter.read',
 'payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare',
 'payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'
].sort());
const role='QA_ANNUL_PREPARER_209',reason='Actores exclusivamente sintéticos de custodia209; sin efecto municipal';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const j=value=>q(JSON.stringify(value))+'::jsonb';
const hash=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const actorKeys=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'];

export function buildOwnAnnulPreparation209ActorsFixture({qa,contracts,read}){
 assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok([17,18].includes(qa.major));assert.equal(qa.operationalPairBaseline,'published107');
 assert.match(qa.sourceCommit??'',/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 for(const[file,expected]of Object.entries(sourcePins))assert.equal(hash(read(file).replace(/\r\n?/g,'\n')),expected,'ANNUL209_ACTORS_SOURCE_CHANGED:'+file);
 for(const actor of[qa.actor,qa.checker]){assert.ok(exact(actor,actorKeys));assert.ok(uuid(actor.tenantId)&&uuid(actor.membershipId)&&uuid(actor.actorSessionId));assert.match(actor.actorEmail,/@[^@]*\.invalid$/);assert.match(actor.releaseSha,/^[a-f0-9]{40}$/);assert.ok(Number.isSafeInteger(actor.actorSessionVersion)&&actor.actorSessionVersion>0);}
 assert.equal(qa.actor.tenantId,qa.checker.tenantId);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);assert.notEqual(qa.actor.actorEmail,qa.checker.actorEmail);
 assert.ok(Array.isArray(contracts)&&contracts.length===855&&contracts.every(uuid));assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,[...contracts].sort());
 const schema=qa.schema,tenant=qa.actor.tenantId,binding=qa.ids.binding;
 assert.ok(uuid(binding));
 // These two already-hired contracts establish actor identity only. All855
 // contracts remain available to each subsequent full native calculation.
 const selected=[contracts[0],contracts[1]];
 const extra=selected.map((contractId,index)=>({name:index===0?'secondCreator':'receiver',contractId,actor:{actorEmail:'annul209-'+(index===0?'creator':'receiver')+'-'+randomUUID()+'@example.invalid',actorSessionId:randomUUID(),actorSessionVersion:1,membershipId:randomUUID(),releaseSha:qa.actor.releaseSha,tenantId:tenant}}));
 const rows=extra.map(({name,contractId,actor})=>({name,contractId,...actor})),spec=j(rows),caps=j(OWN_ANNUL_PREPARER_209_CAPABILITIES);
 const oldIds=new Set([qa.actor.membershipId,qa.checker.membershipId,qa.actor.actorSessionId,qa.checker.actorSessionId]);
 for(const value of rows){assert.ok(!oldIds.has(value.membershipId)&&!oldIds.has(value.actorSessionId));oldIds.add(value.membershipId);oldIds.add(value.actorSessionId);assert.notEqual(value.actorEmail,qa.actor.actorEmail);assert.notEqual(value.actorEmail,qa.checker.actorEmail);}
 const effective=`(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE "C") FROM ${schema}.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id::text COLLATE "C"),'[]'::jsonb) FROM ${schema}.tenant_membership m WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${spec}) x WHERE x.value->>'membershipId'=m.id::text))`;
 const aggregate=(table,alias,where)=>`(SELECT jsonb_build_object('count',count(*),'sha256',encode(public.digest(coalesce(string_agg(encode(public.digest(to_jsonb(${alias})::text,'sha256'),'hex'),chr(10) ORDER BY encode(public.digest(to_jsonb(${alias})::text,'sha256'),'hex') COLLATE "C"),''),'sha256'),'hex')) FROM ${table} ${alias}${where?' WHERE '+where:''})`;
 // Stable schema metadata; no data statistics or current-session state.
 const ns=q(schema),metadata=`jsonb_build_object('functions',${aggregate('pg_proc','f',`f.pronamespace=(SELECT oid FROM pg_namespace WHERE nspname=${ns})`)},'relations',${aggregate('(SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.reloptions,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='+ns+')','r')},'attributes',${aggregate('pg_attribute','a',`a.attrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns})`)},'constraints',${aggregate('pg_constraint','c',`c.connamespace=(SELECT oid FROM pg_namespace WHERE nspname=${ns})`)},'triggers',${aggregate('pg_trigger','t',`t.tgrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns})`)},'policies',${aggregate('pg_policy','p',`p.polrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns})`)},'defaults',${aggregate('pg_attrdef','d',`d.adrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns})`)},'indexes',${aggregate('pg_index','i',`i.indrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns})`)},'defaultAcls',${aggregate('pg_default_acl','d',`d.defaclnamespace IN(0,(SELECT oid FROM pg_namespace WHERE nspname=${ns}))`)})`;
 // Exclude only this exact, preflight-proven-absent addition set. All prior
 // rows, including maker/checker, all other IAM and all payroll ledgers remain.
 const excluded={
  internal_users:`r.email IN(SELECT value->>'actorEmail' FROM jsonb_array_elements(${spec}))`,
  tenant_membership:`r.id::text IN(SELECT value->>'membershipId' FROM jsonb_array_elements(${spec}))`,
  tenant_identity_session:`r.id::text IN(SELECT value->>'actorSessionId' FROM jsonb_array_elements(${spec}))`,
  tenant_action_authority:`r.membership_id::text IN(SELECT value->>'membershipId' FROM jsonb_array_elements(${spec}))`,
  tenant_action_employment_link:`r.membership_id::text IN(SELECT value->>'membershipId' FROM jsonb_array_elements(${spec}))`,
  iam_role:`r.role_key=${q(role)}`,iam_role_capability:`r.role_key=${q(role)}`
 };
 const rowSnapshot=()=>`table_rows:='[]'::jsonb;FOR table_record IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns} AND c.relkind IN('r','p','m') ORDER BY c.relname COLLATE "C" LOOP
 filter_value:=CASE table_record.relname ${Object.entries(excluded).map(([table,filter])=>'WHEN '+q(table)+' THEN '+q('NOT('+filter+')')).join(' ')} ELSE 'true' END;
 EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''sha256'',encode(public.digest(coalesce(string_agg(encode(public.digest(to_jsonb(r)::text,''sha256''),''hex''),chr(10) ORDER BY encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') COLLATE "C"),''''),''sha256''),''hex'')) FROM %I.%I r WHERE %s',${ns},table_record.relname,filter_value) INTO row_state;
 table_rows:=table_rows||jsonb_build_array(jsonb_build_object('table',table_record.relname,'rows',row_state));END LOOP;`;
 const declarations='actor_row jsonb;ctx jsonb;member record;table_record record;filter_value text;row_state jsonb;table_rows jsonb;before_value jsonb;after_value jsonb;expected_person uuid;';
 const sod=`FOR member IN SELECT id FROM ${schema}.tenant_membership ORDER BY id LOOP PERFORM ${schema}.tenant_iam_assert_no_sod_conflict(member.id);END LOOP;`;
 const before=`DO $annul209_actors_before$ DECLARE ${declarations} BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('server_version_num')::integer/10000<>${qa.major} THEN RAISE EXCEPTION 'ANNUL209_ACTORS_NATIVE_CONTEXT_REQUIRED';END IF;
 IF to_regprocedure(${q(schema+'.own_annul_preparation_v1(jsonb,uuid)')}) IS NULL OR to_regprocedure(${q(schema+'.own_annul_preparation_full_v1(jsonb,uuid)')}) IS NULL OR to_regprocedure(${q(schema+'.native_account_contract_v1(uuid,uuid,uuid,boolean)')}) IS NULL THEN RAISE EXCEPTION 'ANNUL209_ACTORS_INSTALLATION209_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM ${schema}.iam_role WHERE role_key=${q(role)}) OR EXISTS(SELECT 1 FROM ${schema}.iam_role_capability WHERE role_key=${q(role)}) THEN RAISE EXCEPTION 'ANNUL209_ACTORS_ROLE_ALREADY_PRESENT';END IF;
 IF (SELECT count(*) FROM ${schema}.iam_capability c WHERE c.scope_kind='tenant' AND ${caps} ? c.capability_key)<>9 THEN RAISE EXCEPTION 'ANNUL209_ACTORS_CAPABILITIES_REQUIRED';END IF;
 IF (SELECT count(*) FROM ${schema}.native_employee_registration n WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND n.contract_id::text IN(SELECT jsonb_array_elements_text(${j(contracts)})))<>855 THEN RAISE EXCEPTION 'ANNUL209_ACTORS_COMPLETE_NATIVE855_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM ${schema}.tenant_iam_effective_capabilities(${q(qa.actor.membershipId)}::uuid) WHERE capability_key='payroll.calculation.prepare') OR EXISTS(SELECT 1 FROM ${schema}.tenant_iam_effective_capabilities(${q(qa.actor.membershipId)}::uuid) WHERE capability_key IN('payroll.calculation.approve','payroll.calculation.close')) OR EXISTS(SELECT 1 FROM ${schema}.tenant_iam_effective_capabilities(${q(qa.checker.membershipId)}::uuid) WHERE capability_key='payroll.calculation.prepare') OR(SELECT count(*) FROM ${schema}.tenant_iam_effective_capabilities(${q(qa.checker.membershipId)}::uuid) WHERE capability_key IN('payroll.calculation.approve','payroll.calculation.close'))<>2 THEN RAISE EXCEPTION 'ANNUL209_ACTORS_ORIGINAL_SEPARATION_CHANGED';END IF;
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  IF EXISTS(SELECT 1 FROM ${schema}.internal_users WHERE email=actor_row->>'actorEmail') OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership WHERE id=(actor_row->>'membershipId')::uuid OR user_email=actor_row->>'actorEmail') OR EXISTS(SELECT 1 FROM ${schema}.tenant_identity_session WHERE id=(actor_row->>'actorSessionId')::uuid OR user_email=actor_row->>'actorEmail') OR EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=(actor_row->>'membershipId')::uuid) OR EXISTS(SELECT 1 FROM ${schema}.tenant_action_employment_link WHERE membership_id=(actor_row->>'membershipId')::uuid OR employment_contract_id=(actor_row->>'contractId')::uuid AND tenant_id=${q(tenant)}::uuid) THEN RAISE EXCEPTION 'ANNUL209_ACTORS_IDENTITIES_ALREADY_PRESENT';END IF;
  PERFORM ${schema}.native_account_contract_v1(${q(tenant)}::uuid,${q(binding)}::uuid,(actor_row->>'contractId')::uuid,true);
  IF NOT EXISTS(SELECT 1 FROM ${schema}.native_employee_registration n JOIN ${schema}.employment_contract c ON c.id=n.contract_id AND c.person_id=n.person_id JOIN ${schema}.person_identity p ON p.id=c.person_id WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND c.id=(actor_row->>'contractId')::uuid AND c.tenant_id=n.tenant_id AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.status='active') THEN RAISE EXCEPTION 'ANNUL209_ACTORS_NATIVE_CONTRACT_REQUIRED';END IF;
 END LOOP;
 ${sod}${rowSnapshot()}before_value:=jsonb_build_object('tables',table_rows,'metadata',${metadata},'effective',${effective});
 PERFORM set_config('municontrol_annul209.actors_before',before_value::text,true);
 END $annul209_actors_before$`;
 const inserts=[`INSERT INTO ${schema}.iam_role(role_key,label,description,scope_kind) VALUES(${q(role)},'Preparación sintética209',${q(reason)},'tenant')`,...OWN_ANNUL_PREPARER_209_CAPABILITIES.map(cap=>`INSERT INTO ${schema}.iam_role_capability(role_key,capability_key) VALUES(${q(role)},${q(cap)})`)];
 for(const row of rows){
  inserts.push(`INSERT INTO ${schema}.internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES(${q(row.actorEmail)},${q('Actor ficticio209 '+row.name)},NULL,true,'managed',1)`,
   `INSERT INTO ${schema}.tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES(${q(row.membershipId)}::uuid,${q(tenant)}::uuid,${q(row.actorEmail)},${q(role)},'active',${q(qa.actor.actorEmail)},transaction_timestamp())`,
   // A source-trigger may initialize exactly this NEW authority row. If so,
   // retain it; otherwise insert it. No existing membership is altered.
   `INSERT INTO ${schema}.tenant_action_authority(membership_id,tenant_id) SELECT ${q(row.membershipId)}::uuid,${q(tenant)}::uuid WHERE NOT EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=${q(row.membershipId)}::uuid)`,
   `INSERT INTO ${schema}.tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email) VALUES(${q(row.membershipId)}::uuid,${q(tenant)}::uuid,${q(binding)}::uuid,${q(row.contractId)}::uuid,${q(qa.actor.actorEmail)})`,
   `INSERT INTO ${schema}.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at) VALUES(${q(row.actorSessionId)}::uuid,${q(row.actorEmail)},${q(tenant)}::uuid,'membership','mfa',1,1,transaction_timestamp()+interval '1 hour')`);
 }
 const after=`DO $annul209_actors_after$ DECLARE ${declarations} actual_caps jsonb;actual_proof jsonb:='[]';BEGIN
 before_value:=current_setting('municontrol_annul209.actors_before')::jsonb;${sod}${rowSnapshot()}
 after_value:=jsonb_build_object('tables',table_rows,'metadata',${metadata},'effective',${effective});
 IF after_value IS DISTINCT FROM before_value THEN RAISE EXCEPTION 'ANNUL209_ACTORS_PRIOR_MULTISET_CHANGED';END IF;
 IF (SELECT count(*) FROM ${schema}.iam_role WHERE role_key=${q(role)} AND scope_kind='tenant' AND label='Preparación sintética209' AND description=${q(reason)})<>1 OR (SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') FROM ${schema}.iam_role_capability WHERE role_key=${q(role)}) IS DISTINCT FROM ${caps} THEN RAISE EXCEPTION 'ANNUL209_ACTORS_ROLE_SET_CHANGED';END IF;
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') INTO actual_caps FROM ${schema}.tenant_iam_effective_capabilities((actor_row->>'membershipId')::uuid);
  IF actual_caps IS DISTINCT FROM ${caps} OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership_capability_override WHERE membership_id=(actor_row->>'membershipId')::uuid) OR EXISTS(SELECT 1 FROM ${schema}.platform_user_role WHERE user_email=actor_row->>'actorEmail') THEN RAISE EXCEPTION 'ANNUL209_ACTORS_EFFECTIVE_SET_CHANGED';END IF;
  SELECT n.person_id INTO expected_person FROM ${schema}.native_employee_registration n JOIN ${schema}.employment_contract c ON c.id=n.contract_id AND c.person_id=n.person_id WHERE n.contract_id=(actor_row->>'contractId')::uuid AND n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
  IF expected_person IS NULL THEN RAISE EXCEPTION 'ANNUL209_ACTORS_NATIVE_PERSON_REQUIRED';END IF;
  ctx:=${schema}.own_run_context_v1(actor_row-'name'-'contractId',true,true);
  IF ctx->>'actorPersonId' IS DISTINCT FROM expected_person::text OR ctx->>'employmentContractId' IS DISTINCT FROM actor_row->>'contractId' OR ctx->>'sourceBindingId' IS DISTINCT FROM ${q(binding)} OR ctx->>'membershipId' IS DISTINCT FROM actor_row->>'membershipId' OR ctx->>'tenantId' IS DISTINCT FROM ${q(tenant)} OR ctx->'capabilities' IS DISTINCT FROM ${caps} THEN RAISE EXCEPTION 'ANNUL209_ACTORS_ACTUAL_CONTEXT_CHANGED';END IF;
  IF NOT EXISTS(SELECT 1 FROM ${schema}.internal_users u JOIN ${schema}.tenant_identity_session se ON se.user_email=u.email AND se.identity_version=u.identity_version JOIN ${schema}.tenant_membership m ON m.user_email=u.email AND m.id=(actor_row->>'membershipId')::uuid JOIN ${schema}.tenant_action_authority a ON a.membership_id=m.id AND a.tenant_id=m.tenant_id JOIN ${schema}.tenant_action_employment_link l ON l.membership_id=m.id AND l.tenant_id=m.tenant_id WHERE u.email=actor_row->>'actorEmail' AND u.active AND u.auth_mode='managed' AND u.password_hash IS NULL AND u.identity_version=1 AND m.role_key=${q(role)} AND m.status='active' AND m.tenant_id=${q(tenant)}::uuid AND se.id=(actor_row->>'actorSessionId')::uuid AND se.auth_level='mfa' AND se.source='membership' AND se.status='active' AND se.active_tenant_id=m.tenant_id AND se.session_version=1 AND se.expires_at>transaction_timestamp() AND se.last_seen_at>transaction_timestamp()-interval '1 hour' AND l.employment_contract_id=(actor_row->>'contractId')::uuid AND l.source_binding_id=${q(binding)}::uuid AND l.active AND l.revoked_at IS NULL) THEN RAISE EXCEPTION 'ANNUL209_ACTORS_MFA_LINK_REQUIRED';END IF;
  actual_proof:=actual_proof||jsonb_build_array(jsonb_build_object('name',actor_row->>'name','membershipId',actor_row->>'membershipId','sessionId',actor_row->>'actorSessionId','contractId',actor_row->>'contractId','personId',expected_person,'scopeVersion',${schema}.native_salary_scope_v1(ctx),'capabilities',actual_caps,'authLevel','mfa','identityDerivedFromNativeRegistry',true));
 END LOOP;
 IF (SELECT count(*) FROM ${schema}.tenant_action_authority WHERE membership_id::text IN(SELECT value->>'membershipId' FROM jsonb_array_elements(${spec})))<>2 OR(SELECT count(*) FROM ${schema}.tenant_action_employment_link WHERE membership_id::text IN(SELECT value->>'membershipId' FROM jsonb_array_elements(${spec})))<>2 OR(SELECT count(*) FROM ${schema}.tenant_membership WHERE user_email IN(SELECT value->>'actorEmail' FROM jsonb_array_elements(${spec})))<>2 OR(SELECT count(*) FROM ${schema}.tenant_identity_session WHERE user_email IN(SELECT value->>'actorEmail' FROM jsonb_array_elements(${spec})))<>2 THEN RAISE EXCEPTION 'ANNUL209_ACTORS_EXACT_ADDITIONS_REQUIRED';END IF;
 PERFORM set_config('municontrol_annul209.actors_proof',jsonb_build_object('version','own-annul-preparation-209-actors-fixture.v1','before',before_value,'after',after_value,'actors',actual_proof,'newRoles',1,'newRoleCapabilities',9,'newUsers',2,'newMemberships',2,'newSessions',2,'newAuthorities',2,'newEmploymentLinks',2,'newPeople',0,'newContracts',0,'newSchemas',0,'newCapabilities',0,'priorRowsPreserved',true,'allMembershipSodChecked',true)::text,true);
 END $annul209_actors_after$`;
 const proof="SELECT current_setting('municontrol_annul209.actors_proof')::jsonb";
 return{version:'own-annul-preparation-209-actors-fixture.v1',schema,sourceHashes:{...sourcePins},actors:{creator1:structuredClone(qa.actor),creator2:extra[0].actor,receiver:extra[1].actor,checker:structuredClone(qa.checker)},nativeIdentityContracts:selected,capabilities:[...OWN_ANNUL_PREPARER_209_CAPABILITIES],role,reason,statements:[before,...inserts,after,proof],lateFaultStatement:"DO $annul209_actors_late_fault$ BEGIN RAISE EXCEPTION 'QA_ANNUL209_ACTORS_LATE_FAULT';END $annul209_actors_late_fault$",metadataReadStatement:'SELECT '+metadata,connects:false,executesSql:false,sourceOnly:true,newRoles:1,newUsers:2,newMemberships:2,newSessions:2,newAuthorities:2,newEmploymentLinks:2,newPeople:0,newContracts:0,newCapabilities:0,newSchemas:0,existingMembershipsChanged:0,executionAdmissionPending:true};
}

export function assertOwnAnnulPreparation209ActorsProof(plan,proof){
 assert.equal(proof.version,plan.version);assert.deepEqual(proof.before,proof.after);
 for(const[key,value]of Object.entries({newRoles:1,newRoleCapabilities:9,newUsers:2,newMemberships:2,newSessions:2,newAuthorities:2,newEmploymentLinks:2,newPeople:0,newContracts:0,newSchemas:0,newCapabilities:0}))assert.equal(proof[key],value);
 assert.equal(proof.priorRowsPreserved,true);assert.equal(proof.allMembershipSodChecked,true);assert.equal(proof.actors.length,2);
 const scopes=new Set();for(const[who,row]of proof.actors.entries()){
  const name=who===0?'creator2':'receiver',actor=plan.actors[name];assert.equal(row.membershipId,actor.membershipId);assert.equal(row.sessionId,actor.actorSessionId);assert.equal(row.contractId,plan.nativeIdentityContracts[who]);assert.ok(uuid(row.personId));assert.match(row.scopeVersion,/^[a-f0-9]{64}$/);scopes.add(row.scopeVersion);assert.equal(row.authLevel,'mfa');assert.equal(row.identityDerivedFromNativeRegistry,true);assert.deepEqual(row.capabilities,plan.capabilities);
 }
 assert.equal(scopes.size,2);assert.notEqual(proof.actors[0].personId,proof.actors[1].personId);
 return{passed:true,newRoles:1,newUsers:2,newMemberships:2,newSessions:2,newAuthorities:2,newEmploymentLinks:2,newPeople:0,newContracts:0,priorRowsPreserved:true,sourceOnly:false};
}
