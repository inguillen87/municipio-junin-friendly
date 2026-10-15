import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {buildMunicipalOwnerAdoptionAuthorityInstallation,assertMunicipalOwnerAdoptionAuthorityDurability,ownerAdoptionAuthoritySnapshot,OWNER_ADOPTION_AUTHORITY_SQL,OWNER_ADOPTION_AUTHORITY_SIGNATURE,OWNER_ADOPTION_AUTHORITY_SOURCE_PINS} from '../scripts/lib/municipal-owner-adoption-authority-installation.mjs';
import {MUNICIPAL_OWNER_ADOPTION_POLICY,MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL,MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION} from '../lib/municipal-owner-adoption-policy.js';
import {ownerAdoptionAuthorityFromDatabase} from '../lib/internal-municipal-owner-decision-authority.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'),sourceCommit='a'.repeat(40),hash=value=>createHash('sha256').update(value).digest('hex');
const build=()=>buildMunicipalOwnerAdoptionAuthorityInstallation({read,sourceCommit});

test('184 server policy is immutable, canonical and shared without importing development scripts into the API',()=>{
 assert.deepEqual(MUNICIPAL_OWNER_ADOPTION_POLICY,{version:'tenant-owner-adoption-policy.v1',sha256:hash(MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL)});
 assert.equal(salarySerialized(MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION),MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL);
 assert.equal(MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION.decisionMode,'owner');assert.equal(MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION.independence,false);
 assert.deepEqual(MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION.inheritedTenantCapabilities,['actions.read']);
 assert.deepEqual(MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION.requiredTenantCapabilities,['workforce.employee.read','employee.record.propose']);
 assert.ok(Object.isFrozen(MUNICIPAL_OWNER_ADOPTION_POLICY));assert.ok(Object.isFrozen(MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION.session.authLevels));
 assert.throws(()=>{MUNICIPAL_OWNER_ADOPTION_POLICY.sha256='b'.repeat(64);},TypeError);assert.throws(()=>MUNICIPAL_OWNER_ADOPTION_POLICY_DESCRIPTION.session.authLevels.push('password'),TypeError);
 assert.doesNotMatch(read('lib/municipal-owner-adoption-policy.js'),/^import .*scripts|process\.env|fetch\(|query\(/m);
});

test('184 preparation creates one fixed runtime RPC and no existing-function, table, identity, session or IAM changes',()=>{
 const batch=build();assert.equal(batch.newFunctions,1);assert.equal(batch.newTables,0);assert.equal(batch.adaptedFunctions,0);assert.equal(batch.businessWrites,0);assert.equal(batch.identityWrites,0);assert.equal(batch.iamWrites,0);assert.equal(batch.existingAclChanges,0);assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
 assert.equal(batch.newPin.signature,OWNER_ADOPTION_AUTHORITY_SIGNATURE);assert.equal(batch.newPin.runtime,true);assert.deepEqual(batch.newPin.argNames,['p']);assert.equal(batch.newPin.definer,true);assert.equal(batch.newPin.volatility,'v');assert.deepEqual(batch.newPin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC','lock_timeout=2s']);
 assert.equal(batch.migration.length,3);assert.match(batch.migration[0],/^CREATE FUNCTION public\.municipal_owner_adoption_authority_v1\(/);assert.equal(batch.migration[1],'REVOKE ALL ON FUNCTION '+OWNER_ADOPTION_AUTHORITY_SIGNATURE+' FROM PUBLIC,municontrol_actions_runtime_app');assert.equal(batch.migration[2],'GRANT EXECUTE ON FUNCTION '+OWNER_ADOPTION_AUTHORITY_SIGNATURE+' TO municontrol_actions_runtime_app');
 assert.doesNotMatch(batch.migration.join('\n'),/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\s|CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+OR\s+REPLACE|GRANT\s+.*\s+ON\s+TABLE)\b/i);
 assert.equal(batch.policy,MUNICIPAL_OWNER_ADOPTION_POLICY);assert.ok(batch.newDefinition.includes("'policySha256','"+batch.policy.sha256+"'"));
});

test('184 inputs cannot override the policy, source pin, function, connection or current actor',()=>{
 for(const options of [null,{},[],{read,sourceCommit:'main'},{read,sourceCommit:sourceCommit+'\n'},...['policy','policySha256','actor','isOwner','host','sql','sourcePins','functionDefinition','target','execute'].map(key=>({read,sourceCommit,[key]:true}))])assert.throws(()=>buildMunicipalOwnerAdoptionAuthorityInstallation(options));
 const sql=read(OWNER_ADOPTION_AUTHORITY_SQL);assert.match(sql,/ARRAY\['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId'\]::text\[\]/);
 assert.match(sql,/jsonb_typeof\(p\) IS DISTINCT FROM 'object'/);assert.match(sql,/jsonb_typeof\(p->'actorSessionVersion'\) IS DISTINCT FROM 'number'/);assert.match(sql,/length\(p->>field_name\)<>36/);assert.match(sql,/length\(p->>'releaseSha'\)<>40/);
 assert.doesNotMatch(sql,/p->>'(?:personId|actorPersonId|accountId|identityVersion|isOwner|policyVersion|policySha256|bindingId|companyId)'/);
});

for(const file of Object.keys(OWNER_ADOPTION_AUTHORITY_SOURCE_PINS))test('184 refuses changed prerequisite or policy source '+file,()=>{
 assert.throws(()=>buildMunicipalOwnerAdoptionAuthorityInstallation({sourceCommit,read:path=>path===file?read(path)+'\n-- unreviewed mutation\n':read(path)}),/OWNER_AUTHORITY184_SOURCE_CHANGED/);
});

test('184 LF canonicalization accepts the same reviewed Windows source without changing its SQL or policy hashes',()=>{
 const expected=build(),windows=buildMunicipalOwnerAdoptionAuthorityInstallation({sourceCommit,read:file=>read(file).replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')});
 assert.deepEqual(windows.sourceHashes,expected.sourceHashes);assert.deepEqual(windows.migration,expected.migration);assert.deepEqual(windows.policy,expected.policy);
});

test('184 pins the real administrative and authentication guards, including closed TABLE output metadata',()=>{
 const batch=build();assert.deepEqual(batch.prerequisitePins.map(pin=>pin.name),['employment_adoption_administrative_context_v1','native_employee_context_v1','action_center_assert_tenant_read_session_v2','action_center_context_has_capability','tenant_iam_assert_no_sod_conflict','native_employee_read_projection_v1']);
 assert.equal(batch.prerequisitePins[0].sha256,'45c74402dff395e2795b525a16136150171964ec73d9bb3be830ac1ff8a1e12a');assert.equal(batch.prerequisitePins[0].runtime,false);assert.equal(batch.prerequisitePins.at(-1).runtime,true);
 assert.equal(batch.prerequisitePins[1].sha256,'0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c');assert.ok(batch.sourceHashes['scripts/migrations/095-native-employee-jurisdiction.sql']);assert.doesNotMatch(batch.prerequisiteCheck,/30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed/);
 assert.match(batch.prerequisiteCheck,/p\.proargmodes IS DISTINCT FROM ARRAY\['i','t'\]/);assert.match(batch.prerequisiteCheck,/p\.proallargtypes IS DISTINCT FROM/);assert.match(batch.prerequisiteCheck,/p\.prorettype<>'varchar'::regtype/);assert.match(batch.prerequisiteCheck,/a\.grantee<>p\.proowner/);
 assert.ok(batch.beforeCheck.includes('OWNER_AUTHORITY184_EXPECTED_ABSENT'));assert.ok(batch.afterCheck.includes('OWNER_AUTHORITY184_UNEXPECTED_OVERLOAD'));assert.ok(batch.afterCheck.includes('OWNER_AUTHORITY184_AFTER_CHANGED'));
});

test('184 revalidates actual tenant MFA and global owner authority and keeps capability-deny changes serialized',()=>{
 const sql=build().newDefinition;
 for(const clause of ["public.employment_adoption_administrative_context_v1(p,'employee.record.propose')","pg_try_advisory_xact_lock_shared(hashtextextended('PLATFORM_OWNER:GOVERNANCE',12012))","public.tenant_membership_capability_override IN SHARE MODE NOWAIT","session.identity_version=users.identity_version","users.auth_mode='managed'","session.active_tenant_id=(p->>'tenantId')::uuid","session.source='membership'","session.auth_level IN('mfa','recovery')","session.expires_at>clock_value","session.last_seen_at>clock_value-interval '1 hour'","assignment.role_key='PLATFORM_OWNER'","assignment.active IS TRUE","assignment.revoked_at IS NULL","assignment.revoked_by_user_email IS NULL","role_row.scope_kind='platform'","capability.scope_kind='platform'","mapping.capability_key='platform.tenants.manage'","FOR SHARE OF assignment,role_row,mapping,capability NOWAIT"])assert.ok(sql.includes(clause),clause);
 assert.ok(sql.indexOf('pg_try_advisory_xact_lock_shared')<sql.indexOf('ctx:=public.employment_adoption_administrative_context_v1'));
 assert.match(sql,/clock_value:=clock_timestamp\(\)/);assert.doesNotMatch(sql,/tenant_iam_assert_platform_session_v2\(|tenant_lifecycle_assert_platform_capability_v2\(|native_salary_administrative_context_v1\(|role_row\.active|\bgen_random_uuid\(/);
});

test('184 technical phases require install for rehearsal/apply and verify for repetition; read-only verification never calls the locking resolver',()=>{
 const batch=build();for(const phase of [batch.rehearsal,batch.installation]){assert.equal(phase.length,9);assert.match(phase[1],/mode'\)<>'install'/);assert.equal(phase[3],batch.before);assert.equal(phase[4],batch.apply);assert.equal(phase[5],batch.afterCheck);assert.equal(phase[7],batch.audit);}
 assert.match(batch.repetition[1],/mode'\)<>'verify'/);assert.match(batch.apply,/IF current_setting\('municontrol_owner_authority184\.mode'\)='install'/);
 assert.match(batch.verification[0],/transaction_read_only'\)<>'on'/);assert.equal(batch.verification[1],batch.afterCheck);assert.doesNotMatch(batch.verification.join('\n'),/SELECT public\.municipal_owner_adoption_authority_v1\(/);
 assert.deepEqual(batch.transactionContract,{rehearsal:'ROLLBACK',installation:'COMMIT',repetition:'COMMIT',verification:'READ ONLY',resolverReadOnlyTransactionCompatible:false});
 for(const statement of [...batch.installation,...batch.verification,...batch.rollback])assert.ok(splitPostgresStatements(statement).length>0);
});

test('184 snapshot preserves all preceding leave/IAM/row/function state and rollback refuses consumers without CASCADE or row deletion',()=>{
 const batch=build();for(const slot of ['before','after']){const snapshot=ownerAdoptionAuthoritySnapshot(slot);assert.doesNotMatch(snapshot,/p\.oid IS DISTINCT FROM to_regclass\('public\.native_leave_event'\)/);assert.doesNotMatch(snapshot,/proname LIKE 'native_leave_%'/);assert.match(snapshot,/p\.relkind IN \('r','p','m'\)/);assert.ok(snapshot.includes("p.oid IS DISTINCT FROM to_regprocedure('"+OWNER_ADOPTION_AUTHORITY_SIGNATURE+"')"));assert.ok(snapshot.includes('pg_auth_members'));assert.ok(snapshot.includes('pg_policy'));}
 assert.throws(()=>ownerAdoptionAuthoritySnapshot('skip'));assert.match(batch.audit,/before'\)::jsonb IS DISTINCT FROM current_setting/);
 const rollback=batch.rollback.join('\n');assert.ok(rollback.includes('OWNER_AUTHORITY184_IN_USE'));assert.ok(rollback.includes('DROP FUNCTION '+OWNER_ADOPTION_AUTHORITY_SIGNATURE));assert.doesNotMatch(rollback,/\bCASCADE\b|\bDELETE\s+FROM\b/i);assert.equal(batch.rollbackVerification[1],batch.beforeCheck);
});

test('184 exact synthetic resolver output with the fixed server policy is accepted by the backend boundary; claimed owner or account UUID is refused',()=>{
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),now=Date.parse('2026-10-15T12:00:00Z'),session={id:id(1),email:'owner-184@example.invalid',version:3,releaseSha:'a'.repeat(40)};
 const access={mode:'managed',session:{id:session.id,email:session.email,version:3},principal:{authorized:true,user:{email:session.email,identityVersion:4},platform:{roles:['PLATFORM_OWNER'],capabilities:['platform.tenants.manage']},session:{id:session.id,version:3,mfa:true,authLevel:'mfa',expiresAt:'2026-10-15T13:00:00Z'},tenant:{id:id(2),membershipId:id(3),source:'membership',dataPlaneReady:true,certifiedReleaseSha:session.releaseSha,effectiveCapabilities:['workforce.employee.read','employee.record.propose'],sourceBindings:[{system:'GRH',database:'synthetic',companyId:101,verified:true}]}}};
 const resolved={scope:{tenantId:id(2),membershipId:id(3),bindingId:id(4),companyId:101},authority:{version:'municipal-adoption-owner-authority.v1',policyVersion:MUNICIPAL_OWNER_ADOPTION_POLICY.version,policySha256:MUNICIPAL_OWNER_ADOPTION_POLICY.sha256,actor:{personId:id(5),email:session.email,identityVersion:4,sessionId:session.id,sessionVersion:3,releaseSha:session.releaseSha}}};
 assert.deepEqual(ownerAdoptionAuthorityFromDatabase(access,session,resolved,MUNICIPAL_OWNER_ADOPTION_POLICY,{now}),resolved);
 for(const change of [value=>value.isOwner=true,value=>value.authority.actor.accountId=id(8),value=>value.authority.actor.identityVersion=3,value=>value.authority.policySha256='b'.repeat(64),value=>value.scope.tenantId=id(9)]){const wrong=structuredClone(resolved);change(wrong);assert.throws(()=>ownerAdoptionAuthorityFromDatabase(access,session,wrong,MUNICIPAL_OWNER_ADOPTION_POLICY,{now}),{code:'OWNER_ADOPTION_AUTHORITY_REQUIRED'});}
});

test('184 durability rejects altered metadata or broken transaction conservation without requiring an idle database between connections',()=>{
 const batch=build(),proof=(mode,preserved=true)=>({version:batch.version,sourceCommit,sourceHashes:structuredClone(batch.sourceHashes),mode,policy:structuredClone(batch.policy),newFunctions:1,newTables:0,adaptedFunctions:0,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0,transactionDataPreserved:preserved,preservationSha256:'b'.repeat(64),priorMetadataSha256:'e'.repeat(64),objectSha256:'c'.repeat(64)});
 const evidence=()=>({batch,installed:proof('install'),durable:proof('verify',false),repeated:proof('verify')});assert.equal(assertMunicipalOwnerAdoptionAuthorityDurability(evidence()).ok,true);
 for(const change of [p=>p.objectSha256='d'.repeat(64),p=>p.priorMetadataSha256='d'.repeat(64),p=>p.transactionDataPreserved=!p.transactionDataPreserved,p=>p.sourceCommit='d'.repeat(40),p=>p.policy.sha256='d'.repeat(64),p=>delete p.sourceHashes[OWNER_ADOPTION_AUTHORITY_SQL],p=>p.mode='install',p=>p.businessWrites=1,p=>p.iamWrites=1,p=>p.nominalRowsReturned=1,p=>p.newFunctions=2,p=>p.existingAclChanges=1,p=>p.extra=true,p=>p.preservationSha256+='\n']){
  for(const phase of ['durable','repeated']){const wrong=evidence();change(wrong[phase]);assert.throws(()=>assertMunicipalOwnerAdoptionAuthorityDurability(wrong));}
 }
 const concurrent=evidence();concurrent.durable.preservationSha256='f'.repeat(64);concurrent.repeated.preservationSha256='a'.repeat(64);assert.equal(assertMunicipalOwnerAdoptionAuthorityDurability(concurrent).wholeDatabaseStaticAcrossConnections,false);
 assert.throws(()=>assertMunicipalOwnerAdoptionAuthorityDurability({...evidence(),repeated:undefined}));assert.throws(()=>assertMunicipalOwnerAdoptionAuthorityDurability({...evidence(),installed:proof('verify')}));
});
