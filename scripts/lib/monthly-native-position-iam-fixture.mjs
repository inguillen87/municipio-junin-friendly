// Explicit QA-only effect. Building this source never connects or grants access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const q=value=>"'"+String(value).replaceAll("'","''")+"'",hash=value=>createHash('sha256').update(value).digest('hex');
const sources=Object.freeze({
 'scripts/migrations/004-tenant-iam-control-plane.sql':'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195',
 'scripts/migrations/005-tenant-identity-gateway.sql':'dca8ae5d6dd0c5481bd4b0b8ec9799048e813df8f2248d5533e6d34b49fb7392',
 'scripts/migrations/006-tenant-action-authority.sql':'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a',
 'scripts/migrations/127-annual-position-budget.sql':'43466ffdfa8a93b5aa03066bbc275a5d0e247e2965def21278b338d65988f89d',
 'scripts/migrations/128-own-position-assignments.sql':'d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78'
});
const readDefinition=Object.freeze({capability_key:'workforce.structure.read',label:'Ver estructura',description:'Consulta estructura organizativa gobernada.',scope_kind:'tenant',sensitivity:'standard'});
const writeDefinitions=Object.freeze([
 {capability_key:'workforce.structure.prepare',label:'Preparar planta presupuestaria anual',description:'Proponer cantidades y unidades con fuente normativa para un ejercicio. No asigna cargos ni liquida.',scope_kind:'tenant',sensitivity:'privileged'},
 {capability_key:'workforce.structure.approve',label:'Revisar planta presupuestaria anual',description:'Aprobar o rechazar el conjunto anual presentado por otra persona, conservando sus versiones.',scope_kind:'tenant',sensitivity:'privileged'},
 {capability_key:'workforce.structure.assignment.prepare',label:'Preparar asignación presupuestaria',description:'Proponer cargos por contrato propio, ejercicio, norma y fechas declaradas. No liquida.',scope_kind:'tenant',sensitivity:'privileged'},
 {capability_key:'workforce.structure.assignment.approve',label:'Revisar asignación presupuestaria',description:'Decidir la asignación presentada por otra persona, conservando todas sus versiones.',scope_kind:'tenant',sensitivity:'privileged'}
]);
const reason='Fixture M10 exclusivamente sintético: seis permisos limitados a dos membresías independientes del mismo circuito nativo';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const compare=(a,b)=>a<b?-1:a>b?1:0,copy=value=>JSON.parse(JSON.stringify(value));
const metadata=row=>{const {created_at,...fields}=row;return fields;};
const tuple=definition=>'('+Object.values(definition).map(q).join(',')+')';

export function buildMonthlyNativePositionIamFixture({qa,read}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof qa.normalized,'function');
 for(const actor of[qa.actor,qa.checker]){assert.match(actor.membershipId,uuid);assert.match(actor.tenantId,uuid);assert.match(actor.actorEmail,/^[^@\s]+@[^@\s]*\.invalid$/);}
 assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);assert.notEqual(qa.actor.actorEmail,qa.checker.actorEmail);assert.equal(qa.actor.tenantId,qa.checker.tenantId);
 const texts={};for(const[file,sha256]of Object.entries(sources)){texts[file]=read(file).replace(/\r\n?/g,'\n');assert.equal(hash(texts[file]),sha256,'M10_IAM_SOURCE_CHANGED:'+file);}
 const readTuple="('workforce.structure.read', 'Ver estructura', 'Consulta estructura organizativa gobernada.', 'tenant', 'standard')";
 assert.equal(texts['scripts/migrations/005-tenant-identity-gateway.sql'].split(readTuple).length,2,'M10_IAM_CANONICAL_READ_DEFINITION_CHANGED');
 for(const definition of writeDefinitions){const file=definition.capability_key.includes('.assignment.')?'scripts/migrations/128-own-position-assignments.sql':'scripts/migrations/127-annual-position-budget.sql';assert.equal(texts[file].split(tuple(definition)).length,2,'M10_IAM_CANONICAL_WRITE_DEFINITION_CHANGED');}
 const assignments=[
  ...['workforce.structure.read','workforce.structure.prepare','workforce.structure.assignment.prepare'].map(capability=>({membershipId:qa.actor.membershipId,email:qa.actor.actorEmail,role:'QA_AUTHORITY_OPERATOR',capability})),
  ...['workforce.structure.read','workforce.structure.approve','workforce.structure.assignment.approve'].map(capability=>({membershipId:qa.checker.membershipId,email:qa.checker.actorEmail,role:'QA_ADOPTION_CHECKER',capability}))
 ];
 const expected=q(JSON.stringify(assignments))+'::jsonb',readRow=q(JSON.stringify(readDefinition))+'::jsonb',writeRows=q(JSON.stringify(writeDefinitions))+'::jsonb',grantedBy=qa.actor.actorEmail;
 const agg=(table,alias,order)=>`(SELECT coalesce(jsonb_agg(to_jsonb(${alias}) ORDER BY ${order}),'[]'::jsonb) FROM public.${table} ${alias})`;
 const effective="(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE \"C\") FROM public.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id),'[]'::jsonb) FROM public.tenant_membership m)";
 const state="jsonb_build_object('roles',"+agg('iam_role','r','role_key COLLATE "C"')+",'roleCapabilities',"+agg('iam_role_capability','r','role_key COLLATE "C",capability_key COLLATE "C"')+",'memberships',"+agg('tenant_membership','m','id')+",'overrides',"+agg('tenant_membership_capability_override','o','membership_id,capability_key COLLATE "C"')+",'capabilities',"+agg('iam_capability','c','capability_key COLLATE "C"')+",'conflicts',"+agg('iam_capability_conflict','c','capability_key COLLATE "C",conflicts_with_key COLLATE "C"')+",'effective',"+effective+")";
 const pre=`DO $m10_iam$ DECLARE x jsonb;definition jsonb;existing_read jsonb;m record;BEGIN
 SELECT to_jsonb(c)-'created_at' INTO existing_read FROM public.iam_capability c WHERE capability_key='workforce.structure.read';
 IF existing_read IS NOT NULL AND existing_read IS DISTINCT FROM ${readRow} THEN RAISE EXCEPTION 'M10_IAM_READ_DEFINITION_CHANGED';END IF;
 FOR definition IN SELECT value FROM jsonb_array_elements(${writeRows}) LOOP
  IF (SELECT to_jsonb(c)-'created_at' FROM public.iam_capability c WHERE capability_key=definition->>'capability_key') IS DISTINCT FROM definition THEN RAISE EXCEPTION 'M10_IAM_WRITE_DEFINITION_CHANGED';END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(${expected}) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.tenant_membership member JOIN public.iam_role r ON r.role_key=member.role_key JOIN public.internal_users u ON u.email=member.user_email AND u.active WHERE member.id=(x->>'membershipId')::uuid AND member.tenant_id=${q(qa.actor.tenantId)}::uuid AND member.user_email=x->>'email' AND member.status='active' AND member.role_key=x->>'role' AND r.scope_kind='tenant')
   OR EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities((x->>'membershipId')::uuid) WHERE capability_key IN('workforce.structure.read','workforce.structure.prepare','workforce.structure.approve','workforce.structure.assignment.prepare','workforce.structure.assignment.approve'))
   OR EXISTS(SELECT 1 FROM public.tenant_membership_capability_override o WHERE o.membership_id=(x->>'membershipId')::uuid AND o.capability_key IN('workforce.structure.read','workforce.structure.prepare','workforce.structure.approve','workforce.structure.assignment.prepare','workforce.structure.assignment.approve')) THEN RAISE EXCEPTION 'M10_IAM_PRESTATE_CHANGED';END IF;
 END LOOP;
 FOR m IN SELECT id FROM public.tenant_membership LOOP PERFORM public.tenant_iam_assert_no_sod_conflict(m.id);END LOOP;
 PERFORM set_config('municontrol_m10.iam_before',${state}::text,true);
 END $m10_iam$`;
 // A known canonical definition is copied only if absent. No conflict retry or role write.
 const addRead=`INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity,created_at) SELECT ${Object.values(readDefinition).map(q).join(',')},transaction_timestamp() WHERE NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key='workforce.structure.read')`;
 const inserts=assignments.map(actor=>`INSERT INTO public.tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email,created_at) VALUES(${q(actor.membershipId)}::uuid,${q(actor.capability)},true,false,${q(reason)},${q(grantedBy)},transaction_timestamp())`);
 const post=`DO $m10_iam$ DECLARE prior jsonb:=current_setting('municontrol_m10.iam_before')::jsonb;current_value jsonb:=${state};expected_overrides jsonb;expected_effective jsonb;expected_capabilities jsonb;m record;BEGIN
 SELECT jsonb_agg(value ORDER BY value->>'membership_id' COLLATE "C",value->>'capability_key' COLLATE "C") INTO expected_overrides FROM(
  SELECT value FROM jsonb_array_elements(prior->'overrides') UNION ALL
  SELECT jsonb_build_object('membership_id',value->>'membershipId','capability_key',value->>'capability','allow_override',true,'deny_override',false,'reason',${q(reason)},'granted_by_user_email',${q(grantedBy)},'created_at',transaction_timestamp()) FROM jsonb_array_elements(${expected})
 ) expected_rows;
 SELECT jsonb_agg(jsonb_build_object('membershipId',member.value->'membershipId','capabilities',(
  SELECT coalesce(jsonb_agg(capability ORDER BY capability COLLATE "C"),'[]'::jsonb) FROM(
   SELECT jsonb_array_elements_text(member.value->'capabilities') capability UNION ALL
   SELECT added.value->>'capability' FROM jsonb_array_elements(${expected}) added WHERE added.value->>'membershipId'=member.value->>'membershipId'
  ) exact_caps
 )) ORDER BY member.value->>'membershipId' COLLATE "C") INTO expected_effective FROM jsonb_array_elements(prior->'effective') member;
 SELECT jsonb_agg(value ORDER BY value->>'capability_key' COLLATE "C") INTO expected_capabilities FROM(
  SELECT value FROM jsonb_array_elements(prior->'capabilities') UNION ALL
  SELECT ${readRow}||jsonb_build_object('created_at',transaction_timestamp()) WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(prior->'capabilities') item WHERE item.value->>'capability_key'='workforce.structure.read')
 ) exact_definitions;
 IF (current_value-'overrides'-'effective'-'capabilities') IS DISTINCT FROM (prior-'overrides'-'effective'-'capabilities') OR current_value->'overrides' IS DISTINCT FROM expected_overrides OR current_value->'effective' IS DISTINCT FROM expected_effective OR current_value->'capabilities' IS DISTINCT FROM expected_capabilities THEN RAISE EXCEPTION 'M10_IAM_EFFECT_SET_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(${expected}) actor WHERE NOT EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities((actor.value->>'membershipId')::uuid) effective WHERE effective.capability_key=actor.value->>'capability'))
  OR EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(${q(qa.actor.membershipId)}::uuid) WHERE capability_key IN('workforce.structure.approve','workforce.structure.assignment.approve'))
  OR EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(${q(qa.checker.membershipId)}::uuid) WHERE capability_key IN('workforce.structure.prepare','workforce.structure.assignment.prepare')) THEN RAISE EXCEPTION 'M10_IAM_SEPARATION_CHANGED';END IF;
 FOR m IN SELECT id FROM public.tenant_membership LOOP PERFORM public.tenant_iam_assert_no_sod_conflict(m.id);END LOOP;
 END $m10_iam$`;
 const proof=`SELECT jsonb_build_object('version','monthly-native-position-iam-fixture.v1','schema',${q(qa.schema)},'assignments',${expected},'recordedAt',transaction_timestamp(),'before',current_setting('municontrol_m10.iam_before')::jsonb,'after',${state},'canonicalReadDefinitionAdded',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_setting('municontrol_m10.iam_before')::jsonb->'capabilities') item WHERE item.value->>'capability_key'='workforce.structure.read'),'allMembershipSodChecked',true,'rolesChanged',0,'roleAssignmentsChanged',0,'membershipsChanged',0,'overridesAdded',6,'unaffectedCapsPreserved',true,'foreignCapsPreserved',true,'newProductCapabilityKeys',0)`;
 return{version:'monthly-native-position-iam-fixture.v1',schema:qa.schema,sourceHashes:{...sources},assignments,readDefinition:{...readDefinition},writeDefinitions:copy(writeDefinitions),reason,grantedBy,statements:[pre,addRead,...inserts,post,proof].map(qa.normalized),newProductCapabilityKeys:0,newRoles:0,newMemberships:0,roleAssignmentsChanged:0,membershipOverridesAdded:6,connects:false,executesSql:false};
}

// This checks the actual native proof later; it does not manufacture that proof.
export function assertMonthlyNativePositionIamFixture({fixture,proof}){
 assert.equal(proof.version,fixture.version);assert.equal(proof.schema,fixture.schema);assert.deepEqual(proof.assignments,fixture.assignments);assert.match(proof.recordedAt,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/);
 const before=proof.before,after=proof.after,keys=['roles','roleCapabilities','memberships','overrides','capabilities','conflicts','effective'];assert.deepEqual(Object.keys(before).sort(),[...keys].sort());assert.deepEqual(Object.keys(after).sort(),[...keys].sort());for(const key of keys){assert.ok(Array.isArray(before[key]));assert.ok(Array.isArray(after[key]));}
 const expected=copy(before),readRows=before.capabilities.filter(row=>row.capability_key===readDefinition.capability_key);assert.ok(readRows.length<=1);if(readRows.length)assert.deepEqual(metadata(readRows[0]),readDefinition);else expected.capabilities.push({...readDefinition,created_at:proof.recordedAt});assert.equal(proof.canonicalReadDefinitionAdded,readRows.length===0);
 for(const definition of writeDefinitions){const rows=before.capabilities.filter(row=>row.capability_key===definition.capability_key);assert.equal(rows.length,1);assert.deepEqual(metadata(rows[0]),definition);}
 for(const assignment of fixture.assignments){const member=before.memberships.find(row=>row.id===assignment.membershipId);assert.ok(member);assert.equal(member.status,'active');assert.equal(member.role_key,assignment.role);assert.equal(member.user_email,assignment.email);assert.equal(before.overrides.some(row=>row.membership_id===assignment.membershipId&&row.capability_key===assignment.capability),false);expected.overrides.push({membership_id:assignment.membershipId,capability_key:assignment.capability,allow_override:true,deny_override:false,reason:fixture.reason,granted_by_user_email:fixture.grantedBy,created_at:proof.recordedAt});const effective=expected.effective.find(row=>row.membershipId===assignment.membershipId);assert.ok(effective);assert.equal(effective.capabilities.some(cap=>[readDefinition,...writeDefinitions].some(row=>row.capability_key===cap)),false,'M10_IAM_PRESTATE_CHANGED');}
 for(const member of expected.effective){const additions=fixture.assignments.filter(row=>row.membershipId===member.membershipId).map(row=>row.capability);member.capabilities=[...member.capabilities,...additions].sort(compare);assert.equal(new Set(member.capabilities).size,member.capabilities.length);}
 expected.capabilities.sort((a,b)=>compare(a.capability_key,b.capability_key));expected.overrides.sort((a,b)=>compare(a.membership_id,b.membership_id)||compare(a.capability_key,b.capability_key));assert.deepEqual(after,expected,'M10_IAM_EFFECT_SET_CHANGED');
 for(const state of[before,after])for(const member of state.effective)for(const conflict of state.conflicts)assert.equal(member.capabilities.includes(conflict.capability_key)&&member.capabilities.includes(conflict.conflicts_with_key),false,'M10_IAM_SOD_CONFLICT');
 const maker=fixture.assignments[0].membershipId,checker=fixture.assignments[3].membershipId;for(const[id,forbidden]of[[maker,['workforce.structure.approve','workforce.structure.assignment.approve']],[checker,['workforce.structure.prepare','workforce.structure.assignment.prepare']]])for(const capability of forbidden)assert.equal(after.effective.find(row=>row.membershipId===id).capabilities.includes(capability),false,'M10_IAM_SEPARATION_CHANGED');
 for(const key of['allMembershipSodChecked','unaffectedCapsPreserved','foreignCapsPreserved'])assert.equal(proof[key],true);for(const key of['rolesChanged','roleAssignmentsChanged','membershipsChanged','newProductCapabilityKeys'])assert.equal(proof[key],0);assert.equal(proof.overridesAdded,6);
 return{overridesAdded:6,canonicalReadDefinitionAdded:proof.canonicalReadDefinitionAdded,allMembershipSodChecked:true,rolesAndThirdPartiesPreserved:true,sourceDerivedEffectVerified:true,nativeProofRequired:true};
}
