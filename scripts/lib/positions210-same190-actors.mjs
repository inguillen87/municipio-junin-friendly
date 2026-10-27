// Private source-only candidate. Same QA190, two existing native contracts.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {preservationSnapshot} from './native-leave-installation.mjs';
import {BUDGET_READ} from '../../assets/annual-position-budget-model.js';
import {COMPARISON_READ} from '../../assets/position-comparison-model.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {ownerProgramQaAccessSql,ownerProgramQaAccess} from './municipal-owner-program-qa.mjs';
import {SQL127_SHA} from './annual-position-budget-installation.mjs';
import {SQL128_SHA} from './position-assignment-installation.mjs';

export const POSITIONS210_MAKER_CAPS=Object.freeze([...new Set(['actions.read','employee.record.propose',...BUDGET_READ,'workforce.structure.prepare','workforce.structure.assignment.prepare'])].sort());
export const POSITIONS210_CHECKER_CAPS=Object.freeze([...new Set(['actions.read','employee.record.approve',...COMPARISON_READ,'workforce.structure.approve','workforce.structure.assignment.approve'])].sort());
export const POSITIONS210_ACTOR_ENTRIES=Object.freeze([
 'scripts/lib/positions210-same190-actors.mjs','tests/positions210-same190-actors.test.js',
 'scripts/lib/native-leave-installation.mjs','scripts/lib/municipal-owner-program-qa.mjs',
 'scripts/lib/annual-position-budget-installation.mjs','scripts/lib/position-assignment-installation.mjs',
 'assets/annual-position-budget-model.js','assets/position-comparison-model.js','assets/position-assignment-model.js',
 'lib/internal-native-employees.js','scripts/migrations/004-tenant-iam-control-plane.sql',
 'scripts/migrations/005-tenant-identity-gateway.sql','scripts/migrations/006-tenant-action-authority.sql',
 'scripts/migrations/104-native-employment-changes.sql','scripts/migrations/113-native-employee-self-access.sql',
 'scripts/migrations/127-annual-position-budget.sql','scripts/migrations/128-own-position-assignments.sql'
]);
const hash=value=>createHash('sha256').update(value).digest('hex'),q=value=>"'"+String(value).replaceAll("'","''")+"'",j=value=>q(JSON.stringify(value))+'::jsonb';
const lf=value=>value.replace(/\r\n?/g,'\n'),PREFIX='municontrol_positions210_pair.';
const once=(value,from,to)=>{assert.equal(value.split(from).length,2,'POSITIONS210_PAIR_SNAPSHOT_ANCHOR');return value.replace(from,()=>to);};
const plans=new WeakMap();

function managedAccess(h,actor){
 const access=ownerProgramQaAccess(h.json([ownerProgramQaAccessSql(h.qa.schema,actor)],{readOnly:true}),actor);
 const session={...access.session,releaseSha:actor.releaseSha};
 assert.equal(access.mode,'managed');assert.equal(access.principal.authorized,true);assert.equal(access.principal.session.mfa,true);
 assert.deepEqual(employeeContext(access.principal,session),actor);return {principal:access.principal,session};
}

export function composePositions210Actors({qa,contracts,read}){
 assert.ok([17,18].includes(qa.major));assert.match(qa.sourceCommit,/^[a-f0-9]{40}$/);assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(qa.operationalPairBaseline,'published107');assert.equal(typeof read,'function');assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,[...contracts].sort());
 assert.equal(POSITIONS210_MAKER_CAPS.length,6);assert.equal(POSITIONS210_CHECKER_CAPS.length,13);assert.equal(new Set([...POSITIONS210_MAKER_CAPS,...POSITIONS210_CHECKER_CAPS]).size,16);
 for(const caps of [POSITIONS210_MAKER_CAPS,POSITIONS210_CHECKER_CAPS])assert.ok(!caps.includes('payroll.calculation.prepare')&&!caps.includes('payroll.calculation.close'));
 const nonce=randomUUID().replaceAll('-',''),schema=qa.schema,tenant=qa.actor.tenantId,binding=qa.ids.binding;
 const rows=[['maker',4,POSITIONS210_MAKER_CAPS],['checker',5,POSITIONS210_CHECKER_CAPS]].map(([name,index,capabilities])=>({name,contractId:contracts[index],role:'QA_POSITIONS210_'+name.toUpperCase()+'_'+nonce,capabilities:[...capabilities],actor:{actorEmail:'positions210-'+name+'-'+nonce+'@example.invalid',actorSessionId:randomUUID(),actorSessionVersion:1,membershipId:randomUUID(),releaseSha:qa.actor.releaseSha,tenantId:tenant}}));
 assert.notEqual(rows[0].contractId,rows[1].contractId);for(const row of rows)assert.ok(!contracts.slice(0,4).includes(row.contractId));
 const roles=rows.map(row=>row.role),members=rows.map(row=>row.actor.membershipId),sessions=rows.map(row=>row.actor.actorSessionId),emails=rows.map(row=>row.actor.actorEmail);
 const sourceHashes={};for(const file of POSITIONS210_ACTOR_ENTRIES.filter(file=>!file.startsWith('tests/'))){sourceHashes[file]=hash(lf(read(file)));}
 assert.equal(sourceHashes['scripts/migrations/127-annual-position-budget.sql'],SQL127_SHA);
 assert.equal(sourceHashes['scripts/migrations/128-own-position-assignments.sql'],SQL128_SHA,'POSITIONS210_PAIR_SQL128_SOURCE_CHANGED');
 const predicates={iam_role:'r.role_key IN('+roles.map(q).join(',')+')',iam_role_capability:'r.role_key IN('+roles.map(q).join(',')+')',internal_users:'r.email IN('+emails.map(q).join(',')+')',tenant_membership:'r.id IN('+members.map(value=>q(value)+'::uuid').join(',')+')',tenant_identity_session:'r.id IN('+sessions.map(value=>q(value)+'::uuid').join(',')+')',tenant_action_authority:'r.membership_id IN('+members.map(value=>q(value)+'::uuid').join(',')+')',tenant_action_employment_link:'r.membership_id IN('+members.map(value=>q(value)+'::uuid').join(',')+')'};
 const snapshot=slot=>{
  let value=preservationSnapshot(slot),excluded="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
  assert.equal(value.split(excluded).length,3);value=value.replaceAll(excluded,'true');value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND true');
  const anchor="FROM %I.%I r) hashed',c.nspname,c.relname) INTO n,h;";
  const filter='CASE WHEN c.nspname='+q(schema)+' THEN CASE c.relname '+Object.entries(predicates).map(([table,predicate])=>'WHEN '+q(table)+' THEN '+q(' WHERE NOT('+predicate+')')).join(' ')+" ELSE '' END ELSE '' END";
  value=once(value,anchor,"FROM %I.%I r%s) hashed',c.nspname,c.relname,"+filter+") INTO n,h;");
  return qa.normalized(value.replaceAll('municontrol_sql111.',PREFIX));
 };
 const spec=j(rows),allContracts=j(contracts),ns=q(schema);
 const preflight=`DO $positions210_pair_preflight$ DECLARE row_value jsonb;person_value uuid; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::integer/10000<>${qa.major}
  OR NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.oid=${ns}::regnamespace AND n.nspowner=current_user::regrole)
 THEN RAISE EXCEPTION 'POSITIONS210_PAIR_OWNER_TRANSACTION_REQUIRED';END IF;
 IF to_regprocedure(${q(schema+'.position_comparison_detail_v2(jsonb,integer,integer,text,text)')}) IS NULL THEN RAISE EXCEPTION 'POSITIONS210_PAIR_ADMISSION210_REQUIRED';END IF;
 IF (${spec}#>>'{0,contractId}') IS DISTINCT FROM ${allContracts}->>4 OR (${spec}#>>'{1,contractId}') IS DISTINCT FROM ${allContracts}->>5
  OR(SELECT count(*) FROM ${schema}.native_employee_registration n WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND ${allContracts} ? n.contract_id::text)<>855
 THEN RAISE EXCEPTION 'POSITIONS210_PAIR_NATIVE855_RESERVATION_CHANGED';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  IF EXISTS(SELECT 1 FROM ${schema}.iam_role WHERE role_key=row_value->>'role') OR EXISTS(SELECT 1 FROM ${schema}.iam_role_capability WHERE role_key=row_value->>'role')
   OR EXISTS(SELECT 1 FROM ${schema}.internal_users WHERE email=row_value#>>'{actor,actorEmail}')
   OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership WHERE id=(row_value#>>'{actor,membershipId}')::uuid OR user_email=row_value#>>'{actor,actorEmail}')
   OR EXISTS(SELECT 1 FROM ${schema}.tenant_identity_session WHERE id=(row_value#>>'{actor,actorSessionId}')::uuid OR user_email=row_value#>>'{actor,actorEmail}')
   OR EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=(row_value#>>'{actor,membershipId}')::uuid)
   OR EXISTS(SELECT 1 FROM ${schema}.tenant_action_employment_link WHERE membership_id=(row_value#>>'{actor,membershipId}')::uuid OR tenant_id=${q(tenant)}::uuid AND employment_contract_id=(row_value->>'contractId')::uuid)
  THEN RAISE EXCEPTION 'POSITIONS210_PAIR_IDENTITY_OR_LINK_ALREADY_PRESENT';END IF;
  IF (SELECT count(*) FROM ${schema}.iam_capability c WHERE c.scope_kind='tenant' AND row_value->'capabilities' ? c.capability_key)<>jsonb_array_length(row_value->'capabilities') THEN RAISE EXCEPTION 'POSITIONS210_PAIR_CAPABILITIES_REQUIRED';END IF;
  PERFORM ${schema}.native_account_contract_v1(${q(tenant)}::uuid,${q(binding)}::uuid,(row_value->>'contractId')::uuid,true);
  SELECT c.person_id INTO STRICT person_value FROM ${schema}.employment_contract c JOIN ${schema}.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=c.tenant_id
   WHERE c.id=(row_value->>'contractId')::uuid AND c.tenant_id=${q(tenant)}::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.status='active' AND n.source_binding_id=${q(binding)}::uuid;
 END LOOP;
 IF(SELECT count(DISTINCT c.person_id) FROM ${schema}.employment_contract c WHERE c.id IN(${rows.map(row=>q(row.contractId)+'::uuid').join(',')}))<>2 THEN RAISE EXCEPTION 'POSITIONS210_PAIR_DIFFERENT_PEOPLE_REQUIRED';END IF;
 END $positions210_pair_preflight$`;
 const inserts=[];
 for(const row of rows){const a=row.actor;
  inserts.push(`INSERT INTO ${schema}.iam_role(role_key,label,description,scope_kind) VALUES(${q(row.role)},${q('Operador exclusivamente sintético210 '+row.name)},'Ensayo aislado del módulo de cargos, sin alta ni permiso de liquidar','tenant')`);
  for(const cap of row.capabilities)inserts.push(`INSERT INTO ${schema}.iam_role_capability(role_key,capability_key) VALUES(${q(row.role)},${q(cap)})`);
  inserts.push(`INSERT INTO ${schema}.internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES(${q(a.actorEmail)},${q('Operador ficticio210 '+row.name)},NULL,true,'managed',1)`,
   `INSERT INTO ${schema}.tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES(${q(a.membershipId)}::uuid,${q(tenant)}::uuid,${q(a.actorEmail)},${q(row.role)},'active',${q(qa.actor.actorEmail)},transaction_timestamp())`,
   `INSERT INTO ${schema}.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at) VALUES(${q(a.actorSessionId)}::uuid,${q(a.actorEmail)},${q(tenant)}::uuid,'membership','mfa',1,1,transaction_timestamp()+interval '1 hour')`,
   `INSERT INTO ${schema}.tenant_action_authority(membership_id,tenant_id) SELECT ${q(a.membershipId)}::uuid,${q(tenant)}::uuid WHERE NOT EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=${q(a.membershipId)}::uuid)`,
   `INSERT INTO ${schema}.tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email) VALUES(${q(a.membershipId)}::uuid,${q(tenant)}::uuid,${q(binding)}::uuid,${q(row.contractId)}::uuid,${q(qa.actor.actorEmail)})`);
 }
 const directCheck=`DO $positions210_pair_rows$ DECLARE row_value jsonb;actual_caps jsonb;member record; BEGIN
 FOR row_value IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  IF NOT EXISTS(SELECT 1 FROM ${schema}.iam_role WHERE role_key=row_value->>'role' AND scope_kind='tenant')
   OR NOT EXISTS(SELECT 1 FROM ${schema}.internal_users WHERE email=row_value#>>'{actor,actorEmail}' AND active AND auth_mode='managed' AND identity_version=1 AND password_hash IS NULL)
   OR NOT EXISTS(SELECT 1 FROM ${schema}.tenant_membership WHERE id=(row_value#>>'{actor,membershipId}')::uuid AND tenant_id=${q(tenant)}::uuid AND user_email=row_value#>>'{actor,actorEmail}' AND role_key=row_value->>'role' AND status='active')
   OR NOT EXISTS(SELECT 1 FROM ${schema}.tenant_identity_session WHERE id=(row_value#>>'{actor,actorSessionId}')::uuid AND user_email=row_value#>>'{actor,actorEmail}' AND active_tenant_id=${q(tenant)}::uuid AND source='membership' AND auth_level='mfa' AND session_version=1 AND identity_version=1 AND revoked_at IS NULL AND expires_at>transaction_timestamp())
   OR NOT EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=(row_value#>>'{actor,membershipId}')::uuid AND tenant_id=${q(tenant)}::uuid AND version=1)
   OR NOT EXISTS(SELECT 1 FROM ${schema}.tenant_action_employment_link WHERE membership_id=(row_value#>>'{actor,membershipId}')::uuid AND tenant_id=${q(tenant)}::uuid AND source_binding_id=${q(binding)}::uuid AND employment_contract_id=(row_value->>'contractId')::uuid AND active AND revoked_at IS NULL)
   OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership_capability_override WHERE membership_id=(row_value#>>'{actor,membershipId}')::uuid)
  THEN RAISE EXCEPTION 'POSITIONS210_PAIR_ROWS_CHANGED';END IF;
  SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key),'[]'::jsonb) INTO actual_caps FROM ${schema}.tenant_iam_effective_capabilities((row_value#>>'{actor,membershipId}')::uuid);
  IF actual_caps IS DISTINCT FROM row_value->'capabilities' THEN RAISE EXCEPTION 'POSITIONS210_PAIR_EXACT_CAPABILITIES_REQUIRED';END IF;
  IF(SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key),'[]'::jsonb) FROM ${schema}.iam_role_capability WHERE role_key=row_value->>'role') IS DISTINCT FROM row_value->'capabilities' THEN RAISE EXCEPTION 'POSITIONS210_PAIR_ROLE_CAPABILITIES_CHANGED';END IF;
 END LOOP;
 FOR member IN SELECT id FROM ${schema}.tenant_membership LOOP PERFORM ${schema}.tenant_iam_assert_no_sod_conflict(member.id);END LOOP;
 END $positions210_pair_rows$`;
 const contexts=`DO $positions210_pair_native_contexts$ DECLARE row_value jsonb;ctx jsonb;person_value uuid; BEGIN
 FOR row_value IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  ctx:=${schema}.native_employment_change_context_v1(row_value->'actor');SELECT person_id INTO STRICT person_value FROM ${schema}.employment_contract WHERE id=(row_value->>'contractId')::uuid;
  IF ctx->>'actorPersonId' IS DISTINCT FROM person_value::text OR ctx->>'employmentContractId' IS DISTINCT FROM row_value->>'contractId' OR ctx->>'membershipId' IS DISTINCT FROM row_value#>>'{actor,membershipId}' OR ctx->>'tenantId' IS DISTINCT FROM ${q(tenant)} OR ctx->>'sourceBindingId' IS DISTINCT FROM ${q(binding)} THEN RAISE EXCEPTION 'POSITIONS210_PAIR_NATIVE_CONTEXT_CHANGED';END IF;
 END LOOP;END $positions210_pair_native_contexts$`;
 const before=snapshot('before'),after=snapshot('after'),conservation=`DO $positions210_pair_preserved$ BEGIN IF current_setting('${PREFIX}before')::jsonb IS DISTINCT FROM current_setting('${PREFIX}after')::jsonb THEN RAISE EXCEPTION 'POSITIONS210_PAIR_PRIOR_STATE_CHANGED';END IF;END $positions210_pair_preserved$`;
 const proof=`SELECT jsonb_build_object('version','positions210-pair-proof.v1','sourceCommit',${q(qa.sourceCommit)},'schema',${ns},'newRoles',2,'newRoleCapabilities',19,'newUsers',2,'newMemberships',2,'newSessions',2,'newAuthorities',2,'newEmploymentLinks',2,'newPeople',0,'newContracts',0,'newCapabilities',0,'businessRowsAdded',0,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('${PREFIX}after')::jsonb::text,'sha256'),'hex'),'actors',${spec})`;
 const plan=Object.freeze({version:'positions210-pair-plan.v1',foundation:qa,schema,sourceCommit:qa.sourceCommit,major:qa.major,rows,sourceHashes:Object.freeze(sourceHashes),sourceEntries:POSITIONS210_ACTOR_ENTRIES,
  installation:Object.freeze([preflight,before,...inserts,directCheck,contexts,after,conservation,proof]),verification:Object.freeze([directCheck,after,proof]),contextVerification:Object.freeze([directCheck,contexts,after,proof])});
 plans.set(plan,{read});return plan;
}

export function assertPositions210ActorsProof(value,plan){
 assert.equal(value.version,'positions210-pair-proof.v1');assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.schema,plan.schema);assert.deepEqual(value.actors,plan.rows);
 for(const [key,wanted]of Object.entries({newRoles:2,newRoleCapabilities:19,newUsers:2,newMemberships:2,newSessions:2,newAuthorities:2,newEmploymentLinks:2,newPeople:0,newContracts:0,newCapabilities:0,businessRowsAdded:0,priorStatePreserved:true}))assert.equal(value[key],wanted,key);
 assert.match(value.priorFingerprint,/^[a-f0-9]{64}$/);return value;
}

export function installPositions210Actors(h,plan){
 const record=plans.get(plan);assert.ok(record,'POSITIONS210_PAIR_UNMINTED_PLAN');assert.strictEqual(plan.foundation,h.qa);assert.equal(plan.sourceCommit,h.sourceCommit);assert.equal(plan.major,h.major);
 for(const [file,sha]of Object.entries(plan.sourceHashes))assert.equal(hash(lf(record.read(file))),sha,'POSITIONS210_PAIR_SOURCE_CHANGED:'+file);
 const before=h.readFullSnapshot();h.setPhase('positions210-pair-rehearsal');const rehearsal=h.json(plan.installation,{end:'ROLLBACK',fullJson:true});assertPositions210ActorsProof(rehearsal,plan);assert.deepEqual(h.readFullSnapshot(),before);
 h.setPhase('positions210-pair-late-rollback');const token='QA_POSITIONS210_PAIR_LATE_FAULT',late=[...plan.installation.slice(0,-1),`DO $positions210_pair_late_fault$ BEGIN RAISE EXCEPTION '${token}';END $positions210_pair_late_fault$`,plan.installation.at(-1)];
 const rejected=h.expectRollback(late,token);assert.equal(rejected.status,3);assert.match(rejected.stderr,/\bERROR:[^\r\n]*\bQA_POSITIONS210_PAIR_LATE_FAULT\b/);assert.deepEqual(h.readFullSnapshot(),before);
 h.setPhase('positions210-pair-installation');const installed=h.json(plan.installation,{fullJson:true});assertPositions210ActorsProof(installed,plan);
 h.setPhase('positions210-pair-durable-readonly');const durable=h.json(plan.verification,{readOnly:true,fullJson:true});assertPositions210ActorsProof(durable,plan);assert.deepEqual(durable,installed);
 const committed=h.readFullSnapshot();h.setPhase('positions210-pair-native-context-rollback');const native=h.json(plan.contextVerification,{end:'ROLLBACK',fullJson:true});assertPositions210ActorsProof(native,plan);assert.deepEqual(native,durable);assert.deepEqual(h.readFullSnapshot(),committed);
 const actors=Object.fromEntries(plan.rows.map(row=>[row.name,{...managedAccess(h,row.actor),raw:row.actor,roleKey:row.role,contractId:row.contractId}]));
 for(const row of plan.rows)assert.deepEqual([...actors[row.name].principal.tenant.effectiveCapabilities].sort(),row.capabilities);
 h.check('positions210 pair uses only reserved native contracts4/5, exact6/13 capabilities and independent real contexts, preserving all prior rows/security');
 return Object.freeze({version:'positions210-pair-admission.v1',passed:true,plan,actors,rehearsal,installed,durable,nativeContextsVerified:true,contractsReserved:[...plan.rows.map(row=>row.contractId)],newPeople:0,newContracts:0,synthetic:true,productionWrites:0});
}
