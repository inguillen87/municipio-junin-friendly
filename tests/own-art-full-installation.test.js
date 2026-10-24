// Source/FS construction only. No database, native driver, application or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildOwnArtFullInstallation,assertOwnArtFullDurability,SQL211_SHA,ART_FULL_SOURCE_SHA,ART_FULL_PREDECESSOR} from '../scripts/lib/own-art-full-installation.mjs';

const sourceCommit='89646033210732773802bd85b44e13edfaf9cfb6';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const build=()=>buildOwnArtFullInstallation({sourceCommit,read});
const proof=batch=>({version:'own-art-full-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,predecessorVersion:ART_FULL_PREDECESSOR,
 allChecksPassed:true,newTables:0,newFunctions:1,adaptedFunctions:0,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,artHistoryPreserved:true,priorFingerprint:'a'.repeat(64),objectFingerprint:'b'.repeat(64)});

test('el paquete de build conserva las fuentes210/211 que leen las pruebas FS, sin incluir SQL ni datos privados por defecto',()=>{
 const rules=read('.vercelignore').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
 for(const file of ['210-own-position-population-proof.sql','211-own-art-full-source.sql']){
  assert.ok(rules.includes('!scripts/migrations/'+file),'Required public build source: '+file);
 }
 for(const exclusion of ['*.sql','*.sql.gz','*.dump','*.backup*','.handoff/','.env*','MuniControl_Fuentes_Privadas*/','database/','tenants/'])assert.ok(rules.includes(exclusion),exclusion);
 assert.ok(!rules.includes('!scripts/migrations/*.sql'));
});

test('ART full upgrade construye sólo preflight, lector nuevo y ACL propias sin tablas ni cambios de datos',()=>{
 const b=build();assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.migration.length,4);
 assert.equal(b.sourceHashes['scripts/migrations/211-own-art-full-source.sql'],SQL211_SHA);
 assert.deepEqual(b.ownPins.map(p=>[p.name,p.signature,p.runtime]),[['own_art_report_source_full_v1','public.own_art_report_source_full_v1(jsonb,jsonb)',true]]);
 assert.match(b.migration[0],/^DO \$art_full_preflight\$/);assert.match(b.migration[0],/OWN_ART_FULL_EXISTING_PREDECESSOR_REQUIRED/);assert.match(b.migration[0],/OWN_ART_FULL_CAPACITY_PREDECESSOR_CHANGED/);
 assert.equal(b.migration.filter(s=>s.startsWith('CREATE FUNCTION ')).length,1);
 assert.ok(b.migration.every(s=>!/^(?:CREATE OR REPLACE|CREATE TABLE|ALTER TABLE|INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT|ROLLBACK)\b/.test(s)));
 assert.equal(b.migration[2],'REVOKE ALL ON FUNCTION public.own_art_report_source_full_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app');
 assert.equal(b.migration[3],'GRANT EXECUTE ON FUNCTION public.own_art_report_source_full_v1(jsonb,jsonb) TO municontrol_actions_runtime_app');
});

test('ART full revierte exactamente dos literales al lector159 original; máximos, ámbitos, días y hashes no se reescriben',()=>{
 const b=build();let previous=b.definition;
 for(const [from,to]of b.derivation.inverse){assert.equal(previous.split(from).length,2);previous=previous.replace(from,to);}
 assert.equal(previous,b.legacyDefinition);assert.equal(b.migration[1],b.definition);
 assert.ok(b.legacyDefinition.includes('public.own_close_group_v1(p,g.id)'));assert.ok(b.definition.includes('public.own_close_group_full_v1(p,g.id)'));
 assert.ok(!b.definition.includes('public.own_close_group_v1(p,g.id)'));assert.ok(!b.definition.includes('own_close_group_capacity_core_v2('));
 for(const token of ['total>20000','jsonb_array_length(groups)>1000','octet_length(result_value::text)>33546240',"x.command='close'","r.command='reopen'",'OWN_ART_IDENTITY_CHANGED','OWN_ART_CONTRACT_INVALID','OWN_ART_BUSY','public.own_art_days_source_v1','public.own_art_days_current_v1'])assert.ok(b.definition.includes(token),token);
 assert.equal(b.ownPins[0].definer,true);assert.equal(b.ownPins[0].volatility,'v');assert.deepEqual(b.ownPins[0].config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);
});

test('ART full exige doce funcionesART previas y tres lectores201 exactos, incluido legado4MiB intacto',()=>{
 const b=build();assert.equal(b.predecessorVersion,ART_FULL_PREDECESSOR);assert.equal(b.previousPins.length,12);assert.equal(b.previousPins.filter(p=>p.runtime).length,5);
 assert.equal(b.groupPins.length,3);assert.equal(b.dependencies.length,12);assert.equal(b.prerequisitePins.length,27);assert.equal(new Set(b.prerequisitePins.map(p=>p.signature)).size,27);
 assert.deepEqual(b.groupPins.map(p=>[p.name,p.sha256,p.runtime]),[
  ['own_close_group_capacity_core_v2','af9061d40d2569082254c2fe52cc3ebb1bcbb3689d53cb24450db881faabcb92',false],
  ['own_close_group_v1','028777cf3e85c7d3f7b78995da2b1f2aea4da8a7914fddaed0585d19964744f6',true],
  ['own_close_group_full_v1','2bb9b017085a8441e44f70dfe8545ed52a7fda9ce4258e4829baf2b9b7e36c91',true],
 ]);
 const pin=name=>b.prerequisitePins.find(p=>p.name===name);
 assert.equal(pin('own_run_context_v1').sha256,'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30');
 assert.equal(pin('payroll_fixed_registry_subject_v2').sha256,'bf3a113d0924b18b9330f11f8b41c445ae6b38a9c5c14d8afae913e34d3f39e7');
 for(const p of b.prerequisitePins)assert.ok(b.beforeCheck.includes(p.sha256)&&b.afterCheck.includes(p.sha256),p.signature);
});

test('ART full no reconstruye instalación158/159: exige tabla existente, familia12 y ausencia absoluta del nuevo nombre',()=>{
 const b=build();assert.match(b.beforeCheck,/ART_DAYS_TABLE_SECURITY/);assert.match(b.beforeCheck,/ART_DAYS_TABLE_SHAPE/);assert.match(b.beforeCheck,/ART_DAYS_IMMUTABLE_GUARD/);
 assert.ok(b.installationGuard.includes("proname LIKE 'own_art_%')<>12"));assert.ok(b.installationGuard.includes("proname='own_art_report_source_full_v1')<>0"));
 assert.ok(b.installationGuard.includes("to_regprocedure('public.own_art_report_source_full_v1(jsonb,jsonb)') IS NOT NULL"));
 assert.match(b.installationGuard,/OWN_ART_FULL_EXISTING_PREDECESSOR_REQUIRED/);assert.match(b.isolation,/OWN_ART_FULL_ISOLATION_REQUIRED/);
 for(const s of [...b.installation,...b.durableVerification])assert.doesNotMatch(s,/eventRows|NEW_TABLE_NOT_EMPTY|CREATE TABLE|ALTER TABLE|set_config\('municontrol_art\.mode'|CASE WHEN to_regclass|OWN_ART_PREREQUISITE_CHANGED/);
});

test('ART full conserva todas las filas, tablaART y seguridad globales; sólo excluye el OID del lector nuevo',()=>{
 const b=build();
 for(const snapshot of [b.before,b.after]){
  assert.equal((snapshot.match(/p\.oid IS DISTINCT FROM to_regprocedure\('/g)||[]).length,1);
  assert.ok(snapshot.includes("p.oid IS DISTINCT FROM to_regprocedure('public.own_art_report_source_full_v1(jsonb,jsonb)')"));
  for(const field of ['tables','sequences','functions','triggers','schemas','defaultAcl','roles','memberships','views'])assert.ok(snapshot.includes("'"+field+"'"));
  assert.ok(snapshot.includes('to_jsonb(r)::text'));assert.ok(snapshot.includes('to_jsonb(p)::text'));assert.ok(snapshot.includes('relrowsecurity'));assert.ok(snapshot.includes('relforcerowsecurity'));
  assert.doesNotMatch(snapshot,/native_leave_|municontrol_sql111\.|-'prosrc'|own_art_%|own_art_days_event|capability_key NOT IN/);
 }
 assert.match(b.priorAudit,/IS DISTINCT FROM/);assert.match(b.priorAudit,/RAISE EXCEPTION 'OWN_ART_FULL_PRIOR_STATE_CHANGED'/);
 assert.equal(b.installation.includes(b.before),true);assert.equal(b.installation.includes(b.after),true);assert.equal(b.installation.includes(b.priorAudit),true);
});

test('ART full rechaza SQL211 alterado antes de leer cualquier otra fuente',()=>{
 const reads=[];assert.throws(()=>buildOwnArtFullInstallation({sourceCommit,read:file=>{reads.push(file);return read(file)+'\n';}}),/Unreviewed SQL211/);
 assert.deepEqual(reads,['scripts/migrations/211-own-art-full-source.sql']);
});

test('ART full no convierte deriva de201,176,138 oART original en pins nuevos',()=>{
 for(const file of ['scripts/migrations/201-own-full-payroll-decision-capacity.sql','scripts/migrations/176-own-payroll-administrative-operator.sql','scripts/migrations/138-adopted-fixed-novelties.sql','scripts/migrations/158-own-art-days.sql','scripts/migrations/159-own-art-report.sql']){
  assert.throws(()=>buildOwnArtFullInstallation({sourceCommit,read:path=>read(path)+(path===file?'\n-- source drift':'')}),/OWN_ART_FULL_SOURCE_CHANGED/);
 }
});

test('ART full fija también la fuente del shape y del contexto administrativo, sin comprobar catálogo como su propio esperado',()=>{
 const b=build();for(const [file,sha]of Object.entries(ART_FULL_SOURCE_SHA))assert.equal(b.sourceHashes[file],sha);
 for(const file of ['scripts/lib/own-art-installation.mjs','scripts/lib/salary-administrative-identity-installation.mjs'])assert.throws(()=>buildOwnArtFullInstallation({sourceCommit,read:path=>read(path)+(path===file?'\n-- shape/context drift':'')}),/OWN_ART_FULL_SOURCE_CHANGED/);
 assert.ok(b.dependencies.some(p=>p.name==='native_salary_administrative_context_v1'&&!p.runtime));
});

test('ART full verificación duradera sólolee la familia13 presente; nunca reaplica migración ni acepta ausencia o fallback',()=>{
 const b=build(),text=b.durableVerification.join('\n');assert.equal(b.durableVerification[0],'SET TRANSACTION READ ONLY');
 assert.ok(text.includes("proname LIKE 'own_art_%')<>13"));assert.ok(text.includes("proname='own_art_report_source_full_v1')<>1"));assert.match(text,/OWN_ART_FULL_FAMILY_CHANGED/);
 assert.doesNotMatch(text,/CREATE FUNCTION|CREATE OR REPLACE|CREATE TABLE|GRANT EXECUTE|REVOKE ALL|OWN_ART_FULL_EXISTING_PREDECESSOR_REQUIRED/);
 assert.equal(b.durableVerification.includes(b.installationGuard),false);assert.equal(b.installation.at(-1),b.proof);assert.equal(b.durableVerification.at(-1),b.proof);
 const p=proof(b);assert.equal(assertOwnArtFullDurability({installed:p,durable:structuredClone(p),batch:b}).passed,true);
});

test('ART full durabilidad rechaza campos extras, huellas distintas y efectos que excedan un lector nuevo',()=>{
 const b=build(),p=proof(b);
 for(const patch of [{priorFingerprint:'c'.repeat(64)},{objectFingerprint:'c'.repeat(64)},{sourceCommit:'e'.repeat(40)},{sourceHashes:{...p.sourceHashes,'scripts/migrations/211-own-art-full-source.sql':'e'.repeat(64)}},{unexpected:true}])assert.throws(()=>assertOwnArtFullDurability({installed:p,durable:{...p,...patch},batch:b}));
 for(const patch of [{version:'wrong'},{predecessorVersion:'fresh-art'},{allChecksPassed:false},{newTables:1},{newFunctions:2},{adaptedFunctions:1},{runtimeFacades:2},{capabilityDefinitionsAdded:1},{roleAssignmentsAdded:1},{existingAclChanges:1},{businessOperations:1},{nominalRowsReturned:1},{artHistoryPreserved:false},{priorFingerprint:'not-a-sha'}]){
  const forged={...p,...patch};assert.throws(()=>assertOwnArtFullDurability({installed:forged,durable:structuredClone(forged),batch:b}));
 }
});
