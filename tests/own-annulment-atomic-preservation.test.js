// Inert source tests. No PostgreSQL/provider/client, observed catalogue or QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const forbidden=()=>{throw new Error('ATOMIC_PRESERVATION_PURE_EXTERNAL_IO_FORBIDDEN');};
net.connect=net.createConnection=net.Socket.prototype.connect=tls.connect=forbidden;http.request=http.get=https.request=https.get=forbidden;globalThis.fetch=forbidden;
for(const name of Object.keys(dns))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=forbidden;
for(const name of Object.keys(dns.promises))if(typeof dns.promises[name]==='function')dns.promises[name]=forbidden;
for(const name of['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])childProcess[name]=forbidden;syncBuiltinESMExports();
const{buildOwnAnnulmentAtomicPreservation,OWN_ANNULMENT_ATOMIC_PRESERVATION_SOURCE_PINS,OWN_ANNULMENT_ATOMIC_PRESERVATION_SLOTS}=await import('../scripts/lib/own-annulment-atomic-preservation.mjs');
const readRaw=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const sourceCommit='fb71f4c38029004ed5c064cff7a70520c3b0ad2d';
const ownFunctionNames=['own_annul_review_core_v2','own_annul_selected_index_v2','own_annul_command_index_core_v2','own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2','own_annul_preparation_core_v1','own_annul_preparation_v1','own_annul_preparation_full_v1'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const build=(reader=readRaw,names=ownFunctionNames)=>buildOwnAnnulmentAtomicPreservation({readRaw:reader,sourceCommit,ownFunctionNames:names});

test('source-only chain retains its complete inverses and derives ten stored functions from exact208/209 bytes',()=>{
 const p=build();assert.equal(Object.keys(p.sourceHashes).length,6);assert.deepEqual(p.ownFunctionNames,ownFunctionNames);
 assert.equal(p.derivation.ddl.length,2);assert.deepEqual(p.derivation.ddl.map(s=>[s.stage,s.functions,s.runtimeFacades,s.privateHelpers]),[[208,7,4,3],[209,3,2,1]]);
 for(const stage of p.derivation.ddl){
  assert.ok(stage.storedBodyRemovalWholeInverseVerified&&stage.noOuterSequenceCalls&&stage.noOuterBusinessDdlOrDml);assert.equal(stage.invokesStoredBodies,false);
  const raw=readRaw(stage.file);assert.equal(hash(raw),stage.sourceSha256);
  for(const span of stage.storedDefinitionSpans){const value=raw.subarray(span.startByte,span.startByte+span.bytes);assert.equal(hash(value),span.sha256);assert.ok(value.toString('utf8').startsWith('EXECUTE $definition_'+stage.stage+'$CREATE FUNCTION public.'+span.name+'('));}
 }
 assert.ok(p.derivation.performance.wholeInverseVerified&&p.derivation.catalogue.wholeInverseVerified);
 assert.ok(p.derivation.performance.records.every(r=>r.wholeInverseVerified));assert.ok(p.derivation.catalogue.records.every(r=>r.wholeInverseVerified));
 assert.equal(p.derivation.performance.records[0].occurrences,2,'both native111 table exclusions are removed');
 assert.equal(p.derivation.catalogue.records.filter(r=>r.label.includes('excludes-row-values')).length,1);assert.equal(p.derivation.catalogue.records.filter(r=>r.label.includes('excludes-sequence-values')).length,1);
 for(const pin of Object.values(OWN_ANNULMENT_ATOMIC_PRESERVATION_SOURCE_PINS))assert.ok(Object.isFrozen(pin));
});

test('C excludes mutable rows/sequence values, preserves structural sequence/role/security domains and only ten function exclusions',()=>{
 const p=build();assert.equal(Object.keys(p.catalog).length,7);
 const categories=['pg_sequence','seqrelid','ownership','relowner','relacl','pg_roles','pg_auth_members','pg_default_acl','pg_constraint','pg_attribute','pg_index','pg_trigger','pg_policy','pg_namespace','pg_type','pg_depend','pg_shdepend','pg_description','pg_seclabel','pg_rewrite','pg_extension','pg_event_trigger'];
 for(const[key,statement]of Object.entries(p.catalog)){
  assert.equal(splitPostgresStatements(statement).length,1);assert.equal(hash(statement),p.statementHashes.catalog[key]);
  assert.doesNotMatch(statement,/FROM %I\.%I|last_value|is_called|pg_sequences|nextval\(|setval\(/);
  for(const category of categories)assert.ok(statement.includes(category),key+' retains '+category);
  assert.ok(statement.includes('atomic-catalog:row-values-excluded')&&statement.includes('atomic-catalog:sequence-values-excluded'));
  assert.equal(statement.split(p.slots.catalog[key]).length,2);assert.ok(statement.includes('ANNUL_ATOMIC_ENABLED_EVENT_TRIGGER'));
  assert.doesNotMatch(statement,/p\.proname LIKE|to_jsonb\(p\)-'prosrc'/,'no family-wide or partial-body exclusion');
  const declaration=/p\.proname=ANY\(ARRAY\[([^\]]+)\]\)/.exec(statement);assert.ok(declaration);assert.deepEqual([...declaration[1].matchAll(/'([^']+)'/g)].map(m=>m[1]),ownFunctionNames);
 }
 assert.equal(p.scope.sequenceValuesObserved,false);assert.equal(p.scope.sequenceValuesConserved,false);assert.equal(p.scope.sequenceDefinitionsPreserved,true);
});

test('F uses the complete source table loop only in R/I and comparison cannot span transactions',()=>{
 const p=build();assert.deepEqual(Object.keys(p.rows),['rehearsal','installation']);assert.equal(p.scope.rowsComparedAcrossTransactions,false);
 const original=readRaw('scripts/lib/native-leave-installation.mjs').toString('utf8');
 const rowLine=original.split('\n').find(line=>line.includes('FROM(SELECT encode(public.digest(to_jsonb(r)::text'))?.trim();assert.ok(rowLine);
 for(const[phase,statements]of Object.entries(p.rows)){
  for(const when of['before','after']){
   const sql=statements[when];assert.equal(splitPostgresStatements(sql).length,1);assert.equal(hash(sql),p.statementHashes.rows[phase][when]);
   assert.ok(sql.includes(rowLine),'row hashing query is verbatim source111');assert.match(sql,/p\.relkind IN \('r','p','m'\)/);
   assert.doesNotMatch(sql,/relkind='S'|last_value|is_called|pg_sequences|nextval\(|setval\(|pg_sequence/);
   assert.ok(sql.includes(p.slots.rows[phase][when]));assert.ok(sql.includes('transactionStartedAt')&&sql.includes('backendPid'));
   assert.ok(sql.includes("current_setting('transaction_read_only')<>'off'"),'F is unavailable to the RO phases');
   assert.ok(sql.includes('ANNUL_ATOMIC_FOREIGN_TABLE')&&sql.includes('ANNUL_ATOMIC_ENABLED_EVENT_TRIGGER'));
  }
  assert.ok(statements.compare.includes(p.slots.rows[phase].before)&&statements.compare.includes(p.slots.rows[phase].after));
  assert.ok(statements.compare.includes('ANNUL_ATOMIC_ROWS_SAME_TRANSACTION_REQUIRED'));assert.ok(statements.compare.includes('pg_backend_pid()')&&statements.compare.includes('transaction_timestamp()'));
  assert.equal(hash(statements.compare),p.statementHashes.rows[phase].compare);
  const other=phase==='rehearsal'?'installation':'rehearsal';assert.ok(!statements.compare.includes(p.slots.rows[other].before));
 }
 assert.deepEqual(p.slots,OWN_ANNULMENT_ATOMIC_PRESERVATION_SLOTS);
 assert.ok(Object.values(p.slots.catalog).every(s=>/^municontrol_annul_atomic\.catalog_[a-z_]+$/.test(s)));
});

test('preconditions reject every enabled event trigger and foreign table, without disabling or repairing anything',()=>{
 const p=build(),guard=p.preconditionGuard;assert.equal(splitPostgresStatements(guard).length,1);assert.equal(hash(guard),p.statementHashes.preconditionGuard);
 assert.match(guard,/FROM pg_event_trigger WHERE evtenabled<>'D'/);assert.match(guard,/relkind='f'/);assert.ok(guard.includes('repeatable read')&&guard.includes('pg_catalog, public, pg_temp'));
 const code=guard.replace(/'(?:[^']|'')*'/g,"''");assert.doesNotMatch(code,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|EXECUTE|CALL|GRANT|REVOKE|COMMIT|ROLLBACK)\b/i);
 for(const statement of Object.values(p.catalog))assert.ok(statement.includes('DOCUMENTARY_INSTALL_FOREIGN_TABLE_UNAUDITED'),'original pinned foreign-table guard is retained');
 assert.equal(p.scope.storedBodiesInvoked,false);assert.equal(p.executionAdmitted,false);assert.equal(p.executesSql,false);assert.equal(p.connects,false);assert.equal(p.observedCatalogUsed,false);assert.equal(p.businessWrites,0);assert.equal(p.nominalRowsReturned,0);
 assert.equal(Object.hasOwn(p,'passed'),false);assert.equal(Object.hasOwn(p,'proof'),false);
});

test('every phase requires body validation/origin and rejects RLS policy evaluation before reading rows',()=>{
 const p=build(),guards=[p.preconditionGuard,...Object.values(p.catalog),...Object.values(p.rows).flatMap(r=>[r.before,r.after])];
 for(const guard of guards){
  for(const[setting,value]of[['check_function_bodies','on'],['session_replication_role','origin'],['row_security','off']])assert.ok(guard.includes("current_setting('"+setting+"')<>'"+value+"'"),setting+' fails closed');
  assert.ok(guard.includes("c.relkind IN('r','p','m') AND c.relrowsecurity AND(c.relforcerowsecurity OR c.relowner<>current_user::regrole)"));
  assert.ok(guard.includes("s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'"));
  assert.ok(guard.includes('ANNUL_ATOMIC_ROW_POLICY_EVALUATION'));
 }
 for(const row of Object.values(p.rows))for(const when of['before','after'])assert.ok(row[when].indexOf('ANNUL_ATOMIC_ROW_POLICY_EVALUATION')<row[when].indexOf('EXECUTE format('),'guard precedes the first F row query');
 assert.ok(p.scope.requiresNoRowPolicyEvaluation&&p.scope.requiresCheckFunctionBodiesOn&&p.scope.requiresOriginReplicationRole&&p.scope.requiresRowSecurityOff);
});

test('inherited208 physical catalogue stop remains UNCERTAIN and digest authority is never learned from observations',()=>{
 const p=build(),limit=p.limitations.inheritedSql208PhysicalCatalogStop;
 assert.equal(limit.source,'scripts/migrations/208-own-annulment-review-index.sql');assert.equal(limit.token,'OWN_ANNUL_REVIEW_EXISTING_RELATION_CHANGED');assert.equal(limit.disposition,'UNCERTAIN');assert.equal(limit.separateReadOnlyObservationRequired,true);
 assert.equal(p.limitations.digestIdentityExpectedFromObservedMetadata,false);assert.equal(p.scope.digestSourceAuthorityGuardIncluded,true);
 assert.equal(Object.hasOwn(p,'expectedPgcryptoVersion'),false);assert.equal(Object.hasOwn(p,'digestDeclaration'),false);
 assert.equal(hash(readRaw(limit.source)),p.sourceHashes[limit.source],'pinned SQL208 remains exact');
});

test('digest primary-source guard verifies both overloads/extension/metadata/owner policy before any digest evaluation',()=>{
 const p=build(),a=p.digestAuthority;
 assert.deepEqual(a.signatures,['public.digest(text,text)','public.digest(bytea,text)']);assert.deepEqual(a.versionsByMajor,{17:['1.3'],18:['1.3','1.4']});
 assert.equal(a.expectedFromObservedMetadata,false);assert.equal(a.primarySourceReferences.length,5);assert.ok(a.primarySourceReferences.every(url=>url.startsWith('https://raw.githubusercontent.com/postgres/postgres/REL_')));
 assert.equal(a.prosrc,'pg_digest');assert.equal(a.probin,'$libdir/pgcrypto');assert.equal(a.language,'c');assert.equal(a.volatility,'i');assert.equal(a.parallel,'s');assert.equal(a.strict,true);assert.equal(a.securityDefiner,false);assert.equal(a.returnsSet,false);
 const guards=[p.preconditionGuard,...Object.values(p.catalog),...Object.values(p.rows).flatMap(r=>[r.before,r.after])];
 for(const guard of guards){
  for(const metadata of['digest_first_type','proargtypes','pronargs','prorettype','prokind','proretset','proisstrict','prosecdef','prolang','prosrc','probin','provolatile','proparallel','pronargdefaults','proargdefaults','proargnames','proargmodes','proallargtypes','proconfig','prosqlbody','extnamespace','extversion','extowner','pg_depend','has_function_privilege'])assert.ok(guard.includes(metadata),metadata+' checked from primary-source policy');
  assert.ok(guard.includes("proname='digest')<>2"),'exactly two public overloads');
  assert.ok(guard.includes("digest_function.proowner NOT IN(digest_bootstrap_owner,digest_extension.extowner)"));assert.ok(guard.includes('digest_extension.extowner=digest_runtime')&&guard.includes('digest_function.proowner=digest_runtime'));
  assert.ok(guard.includes("d.deptype='e'")&&guard.includes("d.refobjid=digest_extension.oid"),'the exact extension membership is required');
  assert.doesNotMatch(guard,/neondb_owner|cloud_admin|digest_function\.proacl\s+(?:IS DISTINCT FROM|=)/,'no observed owner or ACL is a hardcoded expectation');
  const firstEvaluation=guard.indexOf('encode(public.digest');if(firstEvaluation>=0)assert.ok(guard.indexOf('ANNUL_ATOMIC_DIGEST_FUNCTION_SOURCE')<firstEvaluation,'identity is checked before the first catalogue digest');
 }
 const preconditionCode=p.preconditionGuard.replace(/'(?:[^']|'')*'/g,"''");assert.doesNotMatch(preconditionCode,/public\.digest\s*\(/,'standalone digest guard never evaluates digest');
 assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.versionsByMajor));
});

test('rejects every source drift and foreign/approximate function list before making a usable contract',()=>{
 for(const file of Object.keys(OWN_ANNULMENT_ATOMIC_PRESERVATION_SOURCE_PINS)){
  assert.throws(()=>build(name=>{const raw=readRaw(name);if(name!==file)return raw;const changed=Buffer.from(raw);changed[0]^=1;return changed;}),/ATOMIC_PRESERVATION_SOURCE_SHA:/);
  assert.throws(()=>build(name=>name===file?Buffer.concat([readRaw(name),Buffer.from('\n')]):readRaw(name)),/ATOMIC_PRESERVATION_SOURCE_BYTES:/);
 }
 assert.throws(()=>build(name=>readRaw(name).toString('utf8')),/ATOMIC_PRESERVATION_RAW_BUFFER:/);
 for(const value of[ownFunctionNames.slice(1),[...ownFunctionNames,'extra'],[...ownFunctionNames].reverse(),ownFunctionNames.map((n,i)=>i===0?n+'_v3':n),Array(10)])assert.throws(()=>build(readRaw,value),/ATOMIC_PRESERVATION_DENSE_TEN_NAMES|ATOMIC_PRESERVATION_EXACT_SOURCE_FUNCTION_NAMES/);
 const named=[...ownFunctionNames];named.extra='ignored';assert.throws(()=>build(readRaw,named),/ATOMIC_PRESERVATION_DENSE_TEN_NAMES/);
 const symbol=[...ownFunctionNames];symbol[Symbol('extra')]=true;assert.throws(()=>build(readRaw,symbol));
 assert.throws(()=>buildOwnAnnulmentAtomicPreservation({readRaw,sourceCommit,ownFunctionNames,catalogue:{}}),/ATOMIC_PRESERVATION_EXACT_SOURCE_INPUTS/);
 assert.throws(()=>buildOwnAnnulmentAtomicPreservation({readRaw,sourceCommit:'x'.repeat(40),ownFunctionNames}),/ATOMIC_PRESERVATION_COMMIT/);
});

test('closed immutable slots and bookend keep source authority separate from execution or sequence conservation',()=>{
 let changed=false;const file=Object.keys(OWN_ANNULMENT_ATOMIC_PRESERVATION_SOURCE_PINS)[0];const p=build(name=>{const raw=readRaw(name);return changed&&name===file?raw.subarray(1):raw;});
 for(const value of[p,p.catalog,p.rows,p.rows.rehearsal,p.slots,p.slots.rows,p.scope,p.statementHashes,p.derivation])assert.ok(Object.isFrozen(value));
 assert.throws(()=>{p.catalog.foreignSlot='SELECT 1';},TypeError);assert.throws(()=>{p.ownFunctionNames.push('unreviewed');},TypeError);
 assert.deepEqual(p.sourceBookend(),{sourceCommit,sourceHashes:{...p.sourceHashes},sourceOnly:true});changed=true;assert.throws(()=>p.sourceBookend(),/ATOMIC_PRESERVATION_SOURCE_BYTES:/);
 assert.equal(p.scope.rowComparison,'same-backend-same-RR-transaction-only');assert.equal(p.scope.sequenceValuesConserved,false);
});
