// INERT SOURCE CANDIDATE. No connection, SQL executor, filesystem IO or app import.
// Root must close the installer/source graph and independently admit any execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const VERSION='own-receipt126-same190-actors.v1';
const ACTOR_KEYS=['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'];
const REASON='Actores y preparación exclusivamente sintéticos de recibos126 sobre QA190';
const ROLES={reviewer:'QA_RECEIPT126_REVIEWER_190',agent:'QA_RECEIPT126_SELF_190'};
const NOMINAL=['workforce.employee.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'];
const REVIEW_CAPS=['actions.read',...NOMINAL,'payroll.calculation.approve','payroll.receipt.approve'].sort();
const SELF_CAPS=['actions.read','payroll.receipt.self.read'].sort();
const SOURCE_PINS=Object.freeze([
 ['scripts/internal-schema.sql',3933,'01361fcc19a1cd3bcb76eed457bc507c7db33079b713db043a6fb284cd097c3d'],
 ['scripts/migrations/004-tenant-iam-control-plane.sql',44500,'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195'],
 ['scripts/verify-municipal-owner-adoption-authority.mjs',43441,'6194ab3f20092277c7b30c8a3c1fd7cb2bae3041ce8a3a63df107ea3b628cfeb'],
 ['scripts/migrations/005-tenant-identity-gateway.sql',104822,'dca8ae5d6dd0c5481bd4b0b8ec9799048e813df8f2248d5533e6d34b49fb7392'],
 ['scripts/migrations/006-tenant-action-authority.sql',82164,'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a'],
 ['scripts/migrations/009-tenant-lifecycle-hardening.sql',82664,'d2152fe1df92ac646ada498b6140523a8bc3f13901ac49a95da13744dc72dfe4'],
 ['scripts/migrations/013-existing-identity-membership-governance.sql',64682,'32eb0a599a3071996121fab526ef6b93951eda12184cddee4a8f04e3ab970d3d'],
 ['scripts/migrations/026-governed-payroll-novelties.sql',90394,'4be6efc1dedcb4e883988f1c3f0d3d0e7751d29f24e2a6bfe0d0e4ea12ad340c'],
 ['scripts/migrations/041-governed-payroll-parameters.sql',47774,'b235da9a87b9fe09f12db8fda4cad704d93dd820b1888c15bebff7e57f3bb20b'],
 ['scripts/migrations/067-native-employee-registration.sql',18048,'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749'],
 ['scripts/migrations/104-native-employment-changes.sql',90985,'0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a'],
 ['scripts/migrations/113-native-employee-self-access.sql',17893,'9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7'],
 ['scripts/migrations/123-own-payroll-runs.sql',29960,'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b'],
 ['scripts/migrations/124-own-payroll-liquidation-decisions.sql',21146,'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a'],
 ['scripts/migrations/126-own-payroll-receipts.sql',28950,'9f3e93154590b79d027d30a1408d07251211a67e87b581e570bdef013c2d33dc'],
 ['scripts/migrations/176-own-payroll-administrative-operator.sql',5003,'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732'],
 ['scripts/lib/municipal-owner-program-qa.mjs',16803,'c9dc1d3540ed42f89f22d5e7ea0370c62d9ab6b055d7197462411492538ad3eb'],
 ['scripts/lib/own-payroll-report-census-190-iam-fixture.mjs',9508,'c70429d6151bcd3dd94487a1643f196163e7e8be1e08bfc196f81fef9d8041b1'],
 ['scripts/lib/own-payroll-full-capacity-190-continuation.mjs',47063,'99ce92a626b1e35d58b206162bf279dab757a451307245a29f602f9902a07a01'],
 ['scripts/lib/own-annulment-preparation-209-actors-fixture.mjs',23392,'0418f2681166f68327d5017e3b65946938fc2e91e3f077540f667b8c21fdac10']
]);
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const j=value=>q(JSON.stringify(value))+'::jsonb';
const sha=value=>createHash('sha256').update(value).digest('hex');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const sorted=values=>[...values].sort();
const actorDto=actor=>Object.fromEntries(ACTOR_KEYS.map(key=>[key,actor[key]]));
const validateActor=actor=>{
 assert.ok(exact(actor,ACTOR_KEYS),'RECEIPT126_ACTOR_EXACT_SIX_KEYS');
 for(const key of ['tenantId','membershipId','actorSessionId'])assert.ok(uuid(actor[key]),'RECEIPT126_ACTOR_UUID');
 assert.match(actor.actorEmail,/^[a-z0-9._+-]+@[^@]*\.invalid$/);
 assert.match(actor.releaseSha,/^[a-f0-9]{40}$/);
 assert.ok(Number.isSafeInteger(actor.actorSessionVersion)&&actor.actorSessionVersion>0);
};
function readSources(readRaw){
 assert.equal(typeof readRaw,'function','RECEIPT126_READ_RAW_REQUIRED');
 const texts={};
 for(const [file,bytes,expected] of SOURCE_PINS){
  const raw=readRaw(file);assert.ok(Buffer.isBuffer(raw),'RECEIPT126_RAW_BUFFER_REQUIRED:'+file);
  assert.equal(raw.length,bytes,'RECEIPT126_RAW_BYTES_CHANGED:'+file);
  assert.equal(sha(raw),expected,'RECEIPT126_RAW_HASH_CHANGED:'+file);
  const text=raw.toString('utf8');assert.equal(Buffer.compare(Buffer.from(text,'utf8'),raw),0,'RECEIPT126_RAW_UTF8_REQUIRED:'+file);texts[file]=text;
 }
 return texts;
}
// Only the existing QA190 seed's two inherited definitions are projected.
// Their labels/default are source evidence, not production catalogue admission.
function qa190InheritedCapabilities(texts){
 const producer=texts['scripts/verify-municipal-owner-adoption-authority.mjs'];
 const capLists=[...producer.matchAll(/const caps=\[('(?:[^']|'')*'(?:,'(?:[^']|'')*')*)\];/g)];
 assert.equal(capLists.length,1,'RECEIPT126_QA190_CAP_VECTOR_SOURCE_REQUIRED');
 const seededKeys=[...capLists[0][1].matchAll(/'((?:[^']|'')*)'/g)].map(match=>match[1].replaceAll("''","'"));
 assert.deepEqual(seededKeys,['actions.read','workforce.employee.read','employee.record.propose'],'RECEIPT126_QA190_CAP_VECTOR_CHANGED');
 const inserts=[...producer.matchAll(/\.\.\.caps\.map\(c=>`INSERT INTO iam_capability\(capability_key,label,description,scope_kind\) VALUES\(\$\{q\(c\)\},('(?:[^']|'')*'),('(?:[^']|'')*'),('(?:[^']|'')*')\)`\)/g)];
 assert.equal(inserts.length,1,'RECEIPT126_QA190_CAP_INSERT_SOURCE_REQUIRED');
 const [label,description,scope_kind]=inserts[0].slice(1).map(value=>value.slice(1,-1).replaceAll("''","'"));
 assert.equal(scope_kind,'tenant','RECEIPT126_QA190_CAP_SCOPE_CHANGED');
 const tables=[...texts['scripts/migrations/004-tenant-iam-control-plane.sql'].matchAll(/CREATE TABLE IF NOT EXISTS iam_capability \(([\s\S]*?)\n\);/g)];
 assert.equal(tables.length,1,'RECEIPT126_QA190_CAP_TABLE_SOURCE_REQUIRED');
 const defaults=[...tables[0][1].matchAll(/\bsensitivity varchar\(16\) NOT NULL DEFAULT ('(?:[^']|'')*'),/g)];
 assert.equal(defaults.length,1,'RECEIPT126_QA190_CAP_DEFAULT_SOURCE_REQUIRED');
 const sensitivity=defaults[0][1].slice(1,-1).replaceAll("''","'");
 assert.equal(sensitivity,'standard','RECEIPT126_QA190_CAP_DEFAULT_CHANGED');
 return ['actions.read','workforce.employee.read'].map(capability_key=>({capability_key,label,description,scope_kind,sensitivity}));
}

function canonicalCapabilities(texts){
 const wanted=sorted([...new Set([...REVIEW_CAPS,...SELF_CAPS,'payroll.receipt.prepare'])]);
 const definitions={};
 const declarationFiles=['005-tenant-identity-gateway','026-governed-payroll-novelties','041-governed-payroll-parameters','123-own-payroll-runs','124-own-payroll-liquidation-decisions','126-own-payroll-receipts'];
 const field="('(?:[^']|'')*')",tupleSource='\\(\\s*'+Array(5).fill(field).join('\\s*,\\s*')+'\\s*\\)',tuple=new RegExp(tupleSource,'g');
 for(const stem of declarationFiles){
  const file='scripts/migrations/'+stem+'.sql',text=texts[file];assert.equal(typeof text,'string');
  // A semicolon inside a quoted description (notably124) is literal data.
  // Bound the VALUES body by complete five-literal tuples, never split on ';'.
  const header='INSERT INTO (?:public\\.)?iam_capability\\s*\\(\\s*capability_key\\s*,\\s*label\\s*,\\s*description\\s*,\\s*scope_kind\\s*,\\s*sensitivity\\s*\\)\\s*VALUES\\b';
  const blocks=[...text.matchAll(new RegExp(header+'(\\s*'+tupleSource+'(?:\\s*,\\s*'+tupleSource+')*)','g'))];
  for(const block of blocks)for(const match of block[1].matchAll(tuple)){
   const values=match.slice(1).map(v=>v.slice(1,-1).replaceAll("''","'"));if(!wanted.includes(values[0]))continue;
   assert.equal(values[3],'tenant');assert.ok(!Object.hasOwn(definitions,values[0]),'RECEIPT126_CANONICAL_CAP_DUPLICATE:'+values[0]);
   definitions[values[0]]={capability_key:values[0],label:values[1],description:values[2],scope_kind:values[3],sensitivity:values[4]};
  }
 }
 assert.deepEqual(sorted(Object.keys(definitions)),wanted,'RECEIPT126_CANONICAL_CAP_SOURCE_GAP');
 const inherited=qa190InheritedCapabilities(texts);
 assert.deepEqual(inherited.map(row=>row.capability_key),['actions.read','workforce.employee.read'],'RECEIPT126_QA190_CAP_PROJECTION_KEYS');
 for(const row of inherited){assert.ok(Object.hasOwn(definitions,row.capability_key),'RECEIPT126_QA190_CAP_PROJECTION_MISSING');definitions[row.capability_key]=row;}
 return wanted.map(key=>definitions[key]);
}
function receiptContextBody(texts,schema){
 const matches=[...texts['scripts/migrations/126-own-payroll-receipts.sql'].matchAll(/CREATE FUNCTION public\.own_receipt_context_v1\(p jsonb,operation text DEFAULT 'read'\) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS \$\$([\s\S]*?)\$\$;/g)];
 assert.equal(matches.length,1,'RECEIPT126_CANONICAL_CONTEXT_SOURCE_GAP');
 return matches[0][1].replaceAll('public.',schema+'.');
}
function aggregate(table,alias,where=''){
 return `(SELECT jsonb_build_object('count',count(*),'sha256',encode(public.digest(coalesce(string_agg(encode(public.digest(to_jsonb(${alias})::text,'sha256'),'hex'),chr(10) ORDER BY encode(public.digest(to_jsonb(${alias})::text,'sha256'),'hex') COLLATE "C"),''),'sha256'),'hex')) FROM ${table} ${alias}${where?' WHERE '+where:''})`;
}
function metadataSql(schema){
 const ns=q(schema),relations=`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${ns}`;
 return `jsonb_build_object('functions',${aggregate('pg_proc','f',`f.pronamespace=(SELECT oid FROM pg_namespace WHERE nspname=${ns})`)},'relations',${aggregate('(SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.reloptions,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='+ns+')','r')},'attributes',${aggregate('pg_attribute','a',`a.attrelid IN(${relations})`)},'constraints',${aggregate('pg_constraint','c',`c.connamespace=(SELECT oid FROM pg_namespace WHERE nspname=${ns})`)},'triggers',${aggregate('pg_trigger','t',`t.tgrelid IN(${relations})`)},'policies',${aggregate('pg_policy','p',`p.polrelid IN(${relations})`)},'defaults',${aggregate('pg_attrdef','d',`d.adrelid IN(${relations})`)},'indexes',${aggregate('pg_index','i',`i.indrelid IN(${relations})`)},'defaultAcls',${aggregate('pg_default_acl','d',`d.defaclnamespace IN(0,(SELECT oid FROM pg_namespace WHERE nspname=${ns}))`)})`;
}
function rowSnapshotSql(schema,excluded){
 const cases=Object.entries(excluded).map(([table,filter])=>'WHEN '+q(table)+' THEN '+q('NOT('+filter+')')).join(' ');
 return `table_rows:='[]'::jsonb;FOR table_record IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${q(schema)} AND c.relkind IN('r','p','m') ORDER BY c.relname COLLATE "C" LOOP
 filter_value:=CASE table_record.relname ${cases} ELSE 'true' END;
 EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''sha256'',encode(public.digest(coalesce(string_agg(encode(public.digest(to_jsonb(r)::text,''sha256''),''hex''),chr(10) ORDER BY encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') COLLATE "C"),''''),''sha256''),''hex'')) FROM %I.%I r WHERE %s',${q(schema)},table_record.relname,filter_value) INTO row_state;
 table_rows:=table_rows||jsonb_build_array(jsonb_build_object('table',table_record.relname,'rows',row_state));END LOOP;`;
}
function effectiveSql(schema,excludedIds=[]){
 const where=excludedIds.length?' WHERE m.id NOT IN('+excludedIds.map(id=>q(id)+'::uuid').join(',')+')':'';
 return `(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE "C") FROM ${schema}.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id::text COLLATE "C"),'[]'::jsonb) FROM ${schema}.tenant_membership m${where})`;
}
const declarations='member record;actor_row jsonb;ctx jsonb;preparer_ctx jsonb;person uuid;caps jsonb;table_record record;filter_value text;row_state jsonb;table_rows jsonb;before_value jsonb;after_value jsonb;original_effective jsonb;proof_rows jsonb:=\'[]\'::jsonb;';
const sodSql=schema=>`FOR member IN SELECT id FROM ${schema}.tenant_membership ORDER BY id LOOP PERFORM ${schema}.tenant_iam_assert_no_sod_conflict(member.id);END LOOP;`;
function nativeAccessSql(schema,actor){
 return `SELECT jsonb_build_object('identityVersion',u.identity_version,'authLevel',se.auth_level,'expiresAt',se.expires_at,'sessionId',se.id,'sessionVersion',se.session_version,'roles',(SELECT jsonb_agg(pr.role_key) FROM ${schema}.platform_user_role pr WHERE pr.user_email=u.email AND pr.active),'platformCapabilities',(SELECT jsonb_agg(DISTINCT rc.capability_key) FROM ${schema}.platform_user_role pr JOIN ${schema}.iam_role r ON r.role_key=pr.role_key AND r.scope_kind='platform' JOIN ${schema}.iam_role_capability rc ON rc.role_key=r.role_key JOIN ${schema}.iam_capability c ON c.capability_key=rc.capability_key AND c.scope_kind='platform' WHERE pr.user_email=u.email AND pr.active),'tenantCapabilities',(SELECT jsonb_agg(capability_key) FROM ${schema}.tenant_iam_effective_capabilities(${q(actor.membershipId)})),'ready',policy.tenant_data_plane_ready,'release',policy.certified_release_sha,'sourceDatabase',binding.source_database,'companyId',binding.source_company_id,'verified',binding.verified) FROM ${schema}.internal_users u JOIN ${schema}.tenant_identity_session se ON se.user_email=u.email JOIN ${schema}.tenant_identity_policy policy ON policy.tenant_id=${q(actor.tenantId)} JOIN ${schema}.platform_tenant_source_binding binding ON binding.id=policy.certified_source_binding_id AND binding.tenant_id=policy.tenant_id WHERE u.email=${q(actor.actorEmail)} AND se.id=${q(actor.actorSessionId)}`;
}

export function buildOwnReceipt126Same190Actors({qa,contracts,readRaw,dependencies}){
 const texts=readSources(readRaw);
 assert.ok(exact(dependencies,['randomUUID']),'RECEIPT126_BUILTIN_UUID_DEPENDENCY_REQUIRED');assert.equal(typeof dependencies.randomUUID,'function');
 assert.match(qa?.schema??'',/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok([17,18].includes(qa.major));assert.equal(qa.operationalPairBaseline,'published107');assert.match(qa.sourceCommit??'',/^[a-f0-9]{40}$/);
 validateActor(qa.actor);validateActor(qa.checker);assert.equal(qa.actor.tenantId,qa.checker.tenantId);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);assert.notEqual(qa.actor.actorEmail,qa.checker.actorEmail);assert.ok(uuid(qa.ids?.binding));
 assert.ok(Array.isArray(contracts)&&contracts.length===855&&contracts.every(uuid));assert.equal(new Set(contracts).size,855);assert.deepEqual(contracts,sorted(contracts));
 const schema=qa.schema,tenant=qa.actor.tenantId,binding=qa.ids.binding,checker=actorDto(qa.checker),expectedDefinitions=canonicalCapabilities(texts),contextBody=receiptContextBody(texts,schema);
 const makeActor=name=>{const actor={actorEmail:'receipt126-'+name+'-'+dependencies.randomUUID()+'@example.invalid',actorSessionId:dependencies.randomUUID(),actorSessionVersion:1,membershipId:dependencies.randomUUID(),releaseSha:qa.actor.releaseSha,tenantId:tenant};validateActor(actor);return actor;};
 const reviewer=makeActor('reviewer'),agent=makeActor('agent'),rows=[{name:'reviewer',contractId:contracts[2],role:ROLES.reviewer,capabilities:[...REVIEW_CAPS],actor:reviewer},{name:'agent',contractId:contracts[3],role:ROLES.agent,capabilities:[...SELF_CAPS],actor:agent}];
 const ids=[qa.actor.membershipId,qa.actor.actorSessionId,qa.checker.membershipId,qa.checker.actorSessionId,reviewer.membershipId,reviewer.actorSessionId,agent.membershipId,agent.actorSessionId];assert.equal(new Set(ids).size,ids.length,'RECEIPT126_ID_COLLISION');
 assert.equal(new Set([qa.actor.actorEmail,qa.checker.actorEmail,reviewer.actorEmail,agent.actorEmail]).size,4,'RECEIPT126_EMAIL_COLLISION');
 const spec=j(rows),roleList=Object.values(ROLES).map(q).join(','),newIds=rows.map(r=>r.actor.membershipId),newEmails=rows.map(r=>q(r.actor.actorEmail)).join(','),newSessions=rows.map(r=>q(r.actor.actorSessionId)+'::uuid').join(',');
 const overrideFilter=`r.membership_id=${q(checker.membershipId)}::uuid AND r.capability_key='payroll.receipt.prepare'`;
 const excluded={internal_users:`r.email IN(${newEmails})`,tenant_membership:`r.id IN(${newIds.map(id=>q(id)+'::uuid').join(',')})`,tenant_identity_session:`r.id IN(${newSessions})`,tenant_action_authority:`r.membership_id IN(${newIds.map(id=>q(id)+'::uuid').join(',')})`,tenant_action_employment_link:`r.membership_id IN(${newIds.map(id=>q(id)+'::uuid').join(',')})`,iam_role:`r.role_key IN(${roleList})`,iam_role_capability:`r.role_key IN(${roleList})`,tenant_membership_capability_override:overrideFilter};
 const metadata=metadataSql(schema),snapshot=rowSnapshotSql(schema,excluded),effective=effectiveSql(schema,newIds),beforeState=`jsonb_build_object('tables',table_rows,'metadata',${metadata})`;
 const checkerCapabilities=`(SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]'::jsonb) FROM ${schema}.tenant_iam_effective_capabilities(${q(checker.membershipId)}::uuid))`;
 const ctxCall=(actor,operation)=>`${schema}.own_receipt_context_v1(${j(actor)},${q(operation)})`;
 const before=`DO $receipt126_actors_before$ DECLARE ${declarations} definition jsonb;fn record;BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('server_version_num')::integer/10000<>${qa.major} THEN RAISE EXCEPTION 'RECEIPT126_NATIVE_CONTEXT_REQUIRED';END IF;
 IF to_regclass(${q(schema+'.own_payroll_receipt_event')}) IS NULL OR to_regprocedure(${q(schema+'.own_receipt_self_v1(jsonb)')}) IS NULL OR to_regprocedure(${q(schema+'.own_receipt_params_v1(jsonb)')}) IS NULL OR to_regprocedure(${q(schema+'.own_receipt_snapshot_v1(jsonb,jsonb)')}) IS NULL THEN RAISE EXCEPTION 'RECEIPT126_SUPPORT_GRAPH_PENDING';END IF;
 SELECT p.* INTO fn FROM pg_proc p WHERE p.oid=to_regprocedure(${q(schema+'.own_receipt_context_v1(jsonb,text)')});
 IF fn.oid IS NULL OR fn.prosrc IS DISTINCT FROM ${q(contextBody)} OR NOT fn.prosecdef OR fn.prorettype<>'jsonb'::regtype OR fn.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a WHERE a.privilege_type='EXECUTE' AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app'))) THEN RAISE EXCEPTION 'RECEIPT126_CONTEXT_SOURCE_OR_PRIVATE_ACL_CHANGED';END IF;
 FOR definition IN SELECT value FROM jsonb_array_elements(${j(expectedDefinitions)}) LOOP IF NOT EXISTS(SELECT 1 FROM ${schema}.iam_capability c WHERE c.capability_key=definition->>'capability_key' AND to_jsonb(c)-'created_at'=definition) THEN RAISE EXCEPTION 'RECEIPT126_CANONICAL_CAPABILITY_REQUIRED';END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM ${schema}.iam_role WHERE role_key IN(${roleList})) OR EXISTS(SELECT 1 FROM ${schema}.iam_role_capability WHERE role_key IN(${roleList})) OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership_capability_override r WHERE ${overrideFilter}) THEN RAISE EXCEPTION 'RECEIPT126_ADDITION_ALREADY_PRESENT';END IF;
 IF (SELECT count(*) FROM ${schema}.native_employee_registration n WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND n.contract_id::text IN(SELECT jsonb_array_elements_text(${j(contracts)})))<>855 THEN RAISE EXCEPTION 'RECEIPT126_NATIVE855_REQUIRED';END IF;
 preparer_ctx:=${ctxCall(checker,'read')};IF preparer_ctx->>'actorPersonId' IS NULL OR preparer_ctx->>'membershipId' IS DISTINCT FROM ${q(checker.membershipId)} OR preparer_ctx->>'tenantId' IS DISTINCT FROM ${q(tenant)} OR preparer_ctx->>'sourceBindingId' IS DISTINCT FROM ${q(binding)} OR preparer_ctx->'capabilities' ? 'payroll.receipt.prepare' OR preparer_ctx->'capabilities' ? 'payroll.receipt.approve' OR preparer_ctx->'capabilities' ? 'payroll.calculation.prepare' THEN RAISE EXCEPTION 'RECEIPT126_CHECKER_BASELINE_REQUIRED';END IF;
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  IF EXISTS(SELECT 1 FROM ${schema}.internal_users WHERE email=actor_row#>>'{actor,actorEmail}') OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership WHERE id=(actor_row#>>'{actor,membershipId}')::uuid OR user_email=actor_row#>>'{actor,actorEmail}') OR EXISTS(SELECT 1 FROM ${schema}.tenant_identity_session WHERE id=(actor_row#>>'{actor,actorSessionId}')::uuid OR user_email=actor_row#>>'{actor,actorEmail}') OR EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=(actor_row#>>'{actor,membershipId}')::uuid) OR EXISTS(SELECT 1 FROM ${schema}.tenant_action_employment_link WHERE membership_id=(actor_row#>>'{actor,membershipId}')::uuid OR tenant_id=${q(tenant)}::uuid AND employment_contract_id=(actor_row->>'contractId')::uuid) THEN RAISE EXCEPTION 'RECEIPT126_IDENTITY_OR_LINK_ALREADY_PRESENT';END IF;
  PERFORM ${schema}.native_account_contract_v1(${q(tenant)}::uuid,${q(binding)}::uuid,(actor_row->>'contractId')::uuid,true);
  SELECT c.person_id INTO person FROM ${schema}.native_employee_registration n JOIN ${schema}.employment_contract c ON c.id=n.contract_id AND c.person_id=n.person_id JOIN ${schema}.person_identity p ON p.id=c.person_id WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND c.id=(actor_row->>'contractId')::uuid AND c.tenant_id=n.tenant_id AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.status='active';
  IF person IS NULL OR person::text=preparer_ctx->>'actorPersonId' THEN RAISE EXCEPTION 'RECEIPT126_DISTINCT_NATIVE_PERSON_REQUIRED';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT n.person_id) FROM ${schema}.native_employee_registration n WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND n.contract_id IN(${q(contracts[2])}::uuid,${q(contracts[3])}::uuid))<>2 THEN RAISE EXCEPTION 'RECEIPT126_DISTINCT_NEW_PEOPLE_REQUIRED';END IF;
 ${sodSql(schema)}${snapshot}before_value:=${beforeState};original_effective:=${effective};
 PERFORM set_config('municontrol_receipt126.actors_before',before_value::text,true);PERFORM set_config('municontrol_receipt126.effective_before',original_effective::text,true);PERFORM set_config('municontrol_receipt126.checker_caps_before',${checkerCapabilities}::text,true);
 END $receipt126_actors_before$`;
 const inserts=[];
 for(const row of rows){
  const actor=row.actor;inserts.push(`INSERT INTO ${schema}.iam_role(role_key,label,description,scope_kind) VALUES(${q(row.role)},${q('Actor sintético recibos126 '+row.name)},${q(REASON)},'tenant')`);
  for(const cap of row.capabilities)inserts.push(`INSERT INTO ${schema}.iam_role_capability(role_key,capability_key) VALUES(${q(row.role)},${q(cap)})`);
  inserts.push(`INSERT INTO ${schema}.internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES(${q(actor.actorEmail)},${q('Persona de acceso sintética recibos126 '+row.name)},NULL,true,'managed',1)`,
   `INSERT INTO ${schema}.tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES(${q(actor.membershipId)}::uuid,${q(tenant)}::uuid,${q(actor.actorEmail)},${q(row.role)},'active',${q(qa.actor.actorEmail)},transaction_timestamp())`,
   `INSERT INTO ${schema}.tenant_action_authority(membership_id,tenant_id) SELECT ${q(actor.membershipId)}::uuid,${q(tenant)}::uuid WHERE NOT EXISTS(SELECT 1 FROM ${schema}.tenant_action_authority WHERE membership_id=${q(actor.membershipId)}::uuid)`,
   `INSERT INTO ${schema}.tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email) VALUES(${q(actor.membershipId)}::uuid,${q(tenant)}::uuid,${q(binding)}::uuid,${q(row.contractId)}::uuid,${q(qa.actor.actorEmail)})`,
   `INSERT INTO ${schema}.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at) VALUES(${q(actor.actorSessionId)}::uuid,${q(actor.actorEmail)},${q(tenant)}::uuid,'membership','mfa',1,1,transaction_timestamp()+interval '1 hour')`);
 }
 inserts.push(`INSERT INTO ${schema}.tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email) VALUES(${q(checker.membershipId)}::uuid,'payroll.receipt.prepare',true,false,${q(REASON)},${q(qa.actor.actorEmail)})`);
 const after=`DO $receipt126_actors_after$ DECLARE ${declarations} expected_effective jsonb;BEGIN
 ${sodSql(schema)}${snapshot}after_value:=${beforeState};before_value:=current_setting('municontrol_receipt126.actors_before')::jsonb;
 IF after_value IS DISTINCT FROM before_value THEN RAISE EXCEPTION 'RECEIPT126_PRIOR_MULTISET_CHANGED';END IF;
 SELECT jsonb_agg(CASE WHEN v->>'membershipId'=${q(checker.membershipId)} THEN jsonb_build_object('membershipId',v->'membershipId','capabilities',(SELECT jsonb_agg(c ORDER BY c COLLATE "C") FROM(SELECT jsonb_array_elements_text(v->'capabilities') c UNION SELECT 'payroll.receipt.prepare') merged)) ELSE v END ORDER BY v->>'membershipId' COLLATE "C") INTO expected_effective FROM jsonb_array_elements(current_setting('municontrol_receipt126.effective_before')::jsonb) v;
 IF ${effective} IS DISTINCT FROM expected_effective THEN RAISE EXCEPTION 'RECEIPT126_PRIOR_EFFECTIVE_CHANGED';END IF;
 preparer_ctx:=${ctxCall(checker,'prepare')};IF preparer_ctx->'capabilities' ? 'payroll.receipt.approve' OR preparer_ctx->'capabilities' ? 'payroll.calculation.prepare' THEN RAISE EXCEPTION 'RECEIPT126_CHECKER_APPROVE_OR_CALCULATE_ESCALATION';END IF;
 FOR actor_row IN SELECT value FROM jsonb_array_elements(${spec}) LOOP
  IF (SELECT count(*) FROM ${schema}.iam_role WHERE role_key=actor_row->>'role' AND scope_kind='tenant' AND label='Actor sintético recibos126 '||(actor_row->>'name') AND description=${q(REASON)})<>1 OR (SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') FROM ${schema}.iam_role_capability WHERE role_key=actor_row->>'role') IS DISTINCT FROM actor_row->'capabilities' THEN RAISE EXCEPTION 'RECEIPT126_NEW_ROLE_SET_CHANGED';END IF;
  SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') INTO caps FROM ${schema}.tenant_iam_effective_capabilities((actor_row#>>'{actor,membershipId}')::uuid);
  IF caps IS DISTINCT FROM actor_row->'capabilities' OR caps ? 'payroll.calculation.prepare' OR EXISTS(SELECT 1 FROM ${schema}.tenant_membership_capability_override WHERE membership_id=(actor_row#>>'{actor,membershipId}')::uuid) OR EXISTS(SELECT 1 FROM ${schema}.platform_user_role WHERE user_email=actor_row#>>'{actor,actorEmail}') THEN RAISE EXCEPTION 'RECEIPT126_NEW_EFFECTIVE_SET_CHANGED';END IF;
  SELECT n.person_id INTO person FROM ${schema}.native_employee_registration n JOIN ${schema}.employment_contract c ON c.id=n.contract_id AND c.person_id=n.person_id WHERE n.tenant_id=${q(tenant)}::uuid AND n.source_binding_id=${q(binding)}::uuid AND c.id=(actor_row->>'contractId')::uuid AND c.tenant_id=n.tenant_id AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.status='active';
  ctx:=${schema}.own_receipt_context_v1(actor_row->'actor',CASE WHEN actor_row->>'name'='reviewer' THEN 'approve' ELSE 'self' END);
  IF person IS NULL OR ctx->>'actorPersonId' IS DISTINCT FROM person::text OR person::text=preparer_ctx->>'actorPersonId' OR ctx->>'employmentContractId' IS DISTINCT FROM actor_row->>'contractId' OR ctx->>'sourceBindingId' IS DISTINCT FROM ${q(binding)} OR ctx->>'tenantId' IS DISTINCT FROM ${q(tenant)} OR ctx->>'membershipId' IS DISTINCT FROM actor_row#>>'{actor,membershipId}' OR ctx->'capabilities' IS DISTINCT FROM caps THEN RAISE EXCEPTION 'RECEIPT126_NATIVE_CONTEXT_CHANGED';END IF;
  IF NOT EXISTS(SELECT 1 FROM ${schema}.internal_users u JOIN ${schema}.tenant_membership m ON m.user_email=u.email JOIN ${schema}.tenant_action_authority a ON a.membership_id=m.id AND a.tenant_id=m.tenant_id JOIN ${schema}.tenant_action_employment_link l ON l.membership_id=m.id AND l.tenant_id=m.tenant_id JOIN ${schema}.tenant_identity_session se ON se.user_email=u.email AND se.identity_version=u.identity_version WHERE u.email=actor_row#>>'{actor,actorEmail}' AND u.display_name='Persona de acceso sintética recibos126 '||(actor_row->>'name') AND u.active AND u.auth_mode='managed' AND u.password_hash IS NULL AND u.identity_version=1 AND m.id=(actor_row#>>'{actor,membershipId}')::uuid AND m.role_key=actor_row->>'role' AND m.status='active' AND m.tenant_id=${q(tenant)}::uuid AND m.invited_by_user_email=${q(qa.actor.actorEmail)} AND m.activated_at=transaction_timestamp() AND a.version=1 AND l.employment_contract_id=(actor_row->>'contractId')::uuid AND l.source_binding_id=${q(binding)}::uuid AND l.active AND l.revoked_at IS NULL AND l.linked_by_user_email=${q(qa.actor.actorEmail)} AND se.id=(actor_row#>>'{actor,actorSessionId}')::uuid AND se.active_tenant_id=m.tenant_id AND se.source='membership' AND se.auth_level='mfa' AND se.status='active' AND se.revoked_at IS NULL AND se.session_version=1 AND se.identity_version=1 AND se.expires_at>transaction_timestamp() AND se.last_seen_at>transaction_timestamp()-interval '1 hour') THEN RAISE EXCEPTION 'RECEIPT126_MANAGED_MFA_AUTHORITY_LINK_REQUIRED';END IF;
  proof_rows:=proof_rows||jsonb_build_array(jsonb_build_object('name',actor_row->>'name','membershipId',actor_row#>>'{actor,membershipId}','sessionId',actor_row#>>'{actor,actorSessionId}','email',actor_row#>>'{actor,actorEmail}','personId',person,'contractId',actor_row->>'contractId','capabilities',caps,'role',actor_row->>'role','nativeIdentityVerified',true));
 END LOOP;
 IF (SELECT count(*) FROM ${schema}.iam_role_capability WHERE role_key IN(${roleList}))<>12 OR (SELECT count(*) FROM ${schema}.internal_users WHERE email IN(${newEmails}))<>2 OR (SELECT count(*) FROM ${schema}.tenant_membership WHERE user_email IN(${newEmails}))<>2 OR (SELECT count(*) FROM ${schema}.tenant_action_authority WHERE membership_id IN(${newIds.map(id=>q(id)+'::uuid').join(',')}))<>2 OR (SELECT count(*) FROM ${schema}.tenant_action_employment_link WHERE membership_id IN(${newIds.map(id=>q(id)+'::uuid').join(',')}))<>2 OR (SELECT count(*) FROM ${schema}.tenant_identity_session WHERE user_email IN(${newEmails}))<>2 THEN RAISE EXCEPTION 'RECEIPT126_EXACT_ADDITIONS_CHANGED';END IF;
 IF (SELECT to_jsonb(r)-'created_at' FROM ${schema}.tenant_membership_capability_override r WHERE ${overrideFilter}) IS DISTINCT FROM ${j({membership_id:checker.membershipId,capability_key:'payroll.receipt.prepare',allow_override:true,deny_override:false,reason:REASON,granted_by_user_email:qa.actor.actorEmail})} THEN RAISE EXCEPTION 'RECEIPT126_EXACT_CHECKER_OVERRIDE_CHANGED';END IF;
 PERFORM set_config('municontrol_receipt126.actors_proof',jsonb_build_object('version',${q(VERSION)},'before',before_value,'after',after_value,'originalEffective',current_setting('municontrol_receipt126.effective_before')::jsonb,'checkerCapabilitiesBefore',current_setting('municontrol_receipt126.checker_caps_before')::jsonb,'checkerRoleKey',(SELECT role_key FROM ${schema}.tenant_membership WHERE id=${q(checker.membershipId)}::uuid AND tenant_id=${q(tenant)}::uuid AND user_email=${q(checker.actorEmail)}),'checkerOverride',(SELECT to_jsonb(r) FROM ${schema}.tenant_membership_capability_override r WHERE ${overrideFilter}),'actors',proof_rows,'newRoles',2,'newRoleCapabilities',12,'newUsers',2,'newMemberships',2,'newSessions',2,'newAuthorities',2,'newEmploymentLinks',2,'newOverrides',1,'newPeople',0,'newContracts',0,'newHires',0,'newCapabilities',0,'newSchemas',0,'allMembershipSodChecked',true)::text,true);
 END $receipt126_actors_after$`;
 const descriptor=(name,actor,operation,expectedCapabilities,role)=>({name,raw:actorDto(actor),operation,contextSql:'SELECT '+ctxCall(actor,operation),accessSql:nativeAccessSql(schema,actor),...(role?{roleKey:role}:{roleKeyFrom:'setupProof.checkerRoleKey',expectedCapabilitiesFrom:'setupProof.checkerCapabilitiesBefore + payroll.receipt.prepare'}),expectedCapabilities});
 return{version:VERSION,schema,major:qa.major,tenantId:tenant,sourceCommit:qa.sourceCommit,sourcePins:SOURCE_PINS.map(([path,bytes,sha256])=>({path,bytes,sha256})),actors:{preparer:checker,reviewer,agent},nativeIdentityContracts:[contracts[2],contracts[3]],roles:{...ROLES},reason:REASON,accessDescriptors:[descriptor('preparer',checker,'prepare',null,null),descriptor('reviewer',reviewer,'approve',[...REVIEW_CAPS],ROLES.reviewer),descriptor('agent',agent,'self',[...SELF_CAPS],ROLES.agent)],statements:[before,...inserts,after,"SELECT current_setting('municontrol_receipt126.actors_proof')::jsonb"],lateFaultStatement:"DO $receipt126_actors_late_fault$ BEGIN RAISE EXCEPTION 'QA_RECEIPT126_ACTORS_LATE_FAULT';END $receipt126_actors_late_fault$",transaction:{isolation:'repeatable read',lateFaultProbeEnd:'ROLLBACK',singleSetupTransaction:true,callerOwnsExecutor:true},additions:{roles:2,roleCapabilities:12,users:2,memberships:2,sessions:2,authorities:2,employmentLinks:2,overrides:1,people:0,contracts:0,hires:0,capabilities:0,schemas:0},retainedUntilOuterCleanup:['new users','new memberships','new sessions','new authorities','new links','new roles and role capabilities'],receiptInstallationAdmission:false,connects:false,executesSql:false,executionAdmissionPending:true,GLOBAL_SQL_STOP:true};
}

export function assertOwnReceipt126Same190ActorsProof(plan,proof){
 assert.equal(plan.version,VERSION);assert.equal(proof?.version,VERSION);assert.deepEqual(proof.before,proof.after);assert.equal(proof.allMembershipSodChecked,true);
 for(const [key,value] of Object.entries({newRoles:2,newRoleCapabilities:12,newUsers:2,newMemberships:2,newSessions:2,newAuthorities:2,newEmploymentLinks:2,newOverrides:1,newPeople:0,newContracts:0,newHires:0,newCapabilities:0,newSchemas:0}))assert.equal(proof[key],value,'RECEIPT126_PROOF_COUNT:'+key);
 assert.ok(Array.isArray(proof.actors)&&proof.actors.length===2);assert.ok(Array.isArray(proof.originalEffective)&&Array.isArray(proof.checkerCapabilitiesBefore));
 assert.ok(!proof.checkerCapabilitiesBefore.includes('payroll.receipt.prepare')&&!proof.checkerCapabilitiesBefore.includes('payroll.receipt.approve'));
 for(const [index,name] of ['reviewer','agent'].entries()){
  const actor=plan.actors[name],row=proof.actors[index];assert.equal(row.name,name);assert.equal(row.membershipId,actor.membershipId);assert.equal(row.sessionId,actor.actorSessionId);assert.equal(row.email,actor.actorEmail);assert.equal(row.contractId,plan.nativeIdentityContracts[index]);assert.ok(uuid(row.personId));assert.equal(row.nativeIdentityVerified,true);assert.equal(row.role,plan.roles[name]);assert.deepEqual(row.capabilities,name==='reviewer'?REVIEW_CAPS:SELF_CAPS);
 }
 assert.notEqual(proof.actors[0].personId,proof.actors[1].personId);
 assert.equal(typeof proof.checkerRoleKey,'string');assert.ok(proof.checkerRoleKey.length>0);
 const originalChecker=proof.originalEffective.find(row=>row.membershipId===plan.actors.preparer.membershipId);assert.ok(originalChecker);assert.deepEqual(originalChecker.capabilities,proof.checkerCapabilitiesBefore);
 const override=proof.checkerOverride;assert.ok(exact(override,['membership_id','capability_key','allow_override','deny_override','reason','granted_by_user_email','created_at']));assert.equal(override.membership_id,plan.actors.preparer.membershipId);assert.equal(override.capability_key,'payroll.receipt.prepare');assert.equal(override.allow_override,true);assert.equal(override.deny_override,false);assert.equal(override.reason,REASON);assert.equal(typeof override.created_at,'string');assert.ok(Number.isFinite(Date.parse(override.created_at)));
 return{passed:true,actors:proof.actors,checkerRoleKey:proof.checkerRoleKey,checkerOverride:structuredClone(override),checkerCapabilitiesBefore:[...proof.checkerCapabilitiesBefore],retainsNewActorsForReceiptReferences:true};
}

export function buildOwnReceipt126Same190CheckerRestore(plan,proof){
 assertOwnReceipt126Same190ActorsProof(plan,proof);
 const schema=plan.schema,checker=plan.actors.preparer,filter=`r.membership_id=${q(checker.membershipId)}::uuid AND r.capability_key='payroll.receipt.prepare'`,snapshot=rowSnapshotSql(schema,{tenant_membership_capability_override:filter}),metadata=metadataSql(schema),state=`jsonb_build_object('tables',table_rows,'metadata',${metadata})`,effective=effectiveSql(schema),expectedRow=j(proof.checkerOverride),beforeCaps=j(proof.checkerCapabilitiesBefore);
 const before=`DO $receipt126_restore_before$ DECLARE ${declarations} BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('server_version_num')::integer/10000<>${plan.major} THEN RAISE EXCEPTION 'RECEIPT126_RESTORE_NATIVE_CONTEXT_REQUIRED';END IF;
 IF (SELECT to_jsonb(r) FROM ${schema}.tenant_membership_capability_override r WHERE ${filter}) IS DISTINCT FROM ${expectedRow} THEN RAISE EXCEPTION 'RECEIPT126_RESTORE_EXACT_OVERRIDE_CHANGED';END IF;
 ${sodSql(schema)}${snapshot}before_value:=${state};PERFORM set_config('municontrol_receipt126.restore_before',before_value::text,true);PERFORM set_config('municontrol_receipt126.restore_effective',${effective}::text,true);
 END $receipt126_restore_before$`;
 const remove=`DELETE FROM ${schema}.tenant_membership_capability_override r WHERE ${filter} AND to_jsonb(r)=${expectedRow}`;
 const after=`DO $receipt126_restore_after$ DECLARE ${declarations} expected_effective jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM ${schema}.tenant_membership_capability_override r WHERE ${filter}) THEN RAISE EXCEPTION 'RECEIPT126_RESTORE_OVERRIDE_REMAINS';END IF;
 ${sodSql(schema)}${snapshot}after_value:=${state};before_value:=current_setting('municontrol_receipt126.restore_before')::jsonb;IF after_value IS DISTINCT FROM before_value THEN RAISE EXCEPTION 'RECEIPT126_RESTORE_PRIOR_MULTISET_CHANGED';END IF;
 IF (SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key COLLATE "C"),'[]') FROM ${schema}.tenant_iam_effective_capabilities(${q(checker.membershipId)}::uuid)) IS DISTINCT FROM ${beforeCaps} THEN RAISE EXCEPTION 'RECEIPT126_RESTORE_CHECKER_EFFECTIVE_CHANGED';END IF;
 SELECT jsonb_agg(CASE WHEN v->>'membershipId'=${q(checker.membershipId)} THEN jsonb_build_object('membershipId',v->'membershipId','capabilities',${beforeCaps}) ELSE v END ORDER BY v->>'membershipId' COLLATE "C") INTO expected_effective FROM jsonb_array_elements(current_setting('municontrol_receipt126.restore_effective')::jsonb) v;
 IF ${effective} IS DISTINCT FROM expected_effective THEN RAISE EXCEPTION 'RECEIPT126_RESTORE_OTHER_EFFECTIVE_CHANGED';END IF;
 PERFORM set_config('municontrol_receipt126.restore_proof',jsonb_build_object('version','own-receipt126-same190-checker-restore.v1','before',before_value,'after',after_value,'checkerCapabilities',${beforeCaps},'exactOverrideRemoved',true,'allMembershipSodChecked',true,'actorRowsDeleted',0,'receiptRowsChanged',0)::text,true);
 END $receipt126_restore_after$`;
 return{version:'own-receipt126-same190-checker-restore.v1',statements:[before,remove,after,"SELECT current_setting('municontrol_receipt126.restore_proof')::jsonb"],lateFaultStatement:"DO $receipt126_restore_late_fault$ BEGIN RAISE EXCEPTION 'QA_RECEIPT126_RESTORE_LATE_FAULT';END $receipt126_restore_late_fault$",mustRunInCallerFinally:true,preservePrimaryAndSecondaryErrors:true,deleteOnlyExactTemporaryOverride:true,actorRowsDeleted:0,transaction:{isolation:'repeatable read',lateFaultProbeEnd:'ROLLBACK',singleRestoreTransaction:true},connects:false,executesSql:false,GLOBAL_SQL_STOP:true};
}
