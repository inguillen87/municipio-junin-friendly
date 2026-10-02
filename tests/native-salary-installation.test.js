import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {SQL112_SHA256,buildNativeSalaryInstallation,assertNativeSalaryDurability,salaryPreservationSnapshot} from '../scripts/lib/native-salary-installation.mjs';
import {prepareNativeSalaryInstallation,readSalaryPrerequisites} from '../scripts/prepare-native-salary-installation.mjs';
import {preservationSnapshot} from '../scripts/lib/native-leave-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n'),source=read('scripts/migrations/112-native-salary-definitions.sql'),sourceCommit='9'.repeat(40),prerequisitePins=readSalaryPrerequisites(read);
const installed={sourceCommit,sqlSha256:SQL112_SHA256,allChecksPassed:true,functions112:12,runtimeFacades:3,eventRows:0,nominalRowsReturned:0,priorTableCount:180,beforeFingerprint:'a'.repeat(64),afterFingerprint:'a'.repeat(64),newObjectFingerprint:'c'.repeat(64)};

test('lote112 usa exactamente la fuente revisada, ambos destinos existentes y tres fachadas',()=>{
 const b=prepareNativeSalaryInstallation({read,sourceCommit}),migration=splitPostgresStatements(source);assert.equal(b.sqlSha256,SQL112_SHA256);assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.deepEqual(b.installation.slice(2,2+migration.length),migration);
 assert.deepEqual(b.targets.map(t=>[t.major,t.project_id,t.branch_id,t.database_name]),[[17,'noisy-poetry-54471701','br-plain-dust-acpjgebb','neondb'],[18,'wild-cake-87689498','br-plain-dawn-ac8crb1h','neondb']]);assert.equal(b.ownPins.length,12);assert.equal(b.ownPins.filter(p=>p.runtime).length,3);assert.equal(b.prerequisitePins.length,4);
 for(const t of b.targets){assert.match(t.preflight.join('\n'),/SET TRANSACTION READ ONLY/);assert.match(t.installation.join('\n'),/SQL112_DESTINATION_MISMATCH/);assert.match(t.installation.join('\n'),/REPEATABLE READ/);assert.equal(t.installation.filter(s=>/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)).length,0);assert.match(t.durableVerification.join('\n'),/SET TRANSACTION READ ONLY/);assert.doesNotMatch(t.durableVerification.join('\n'),/CREATE FUNCTION|CREATE TABLE|INSERT INTO|UPDATE public\.|DELETE FROM/);}
});
test('prerrequisito de catálogo conserva metadatos y exige la adaptación ya publicada de SQL110',()=>{
 const catalog=prerequisitePins.find(p=>p.name==='native_employee_catalog_v1');assert.equal(catalog.sha256,'74a85eda0b047c1728d6479627fc04c23d5ac01ac97065650715480ab13657dc');assert.deepEqual(catalog.config,['search_path=public, pg_temp']);assert.equal(catalog.runtime,false);
 assert.throws(()=>readSalaryPrerequisites(f=>read(f).replace("'74a85eda0b047c1728d6479627fc04c23d5ac01ac97065650715480ab13657dc'","'invalid'")));
});
test('la conservación112 incluye licencias previas y sólo excluye sus objetos nuevos',()=>{
 for(const slot of ['before','after']){const snapshot=salaryPreservationSnapshot(slot);assert.match(snapshot,/native_salary_event/);assert.doesNotMatch(snapshot,/native_leave_|municontrol_sql111/);assert.match(snapshot,/rowsSha256/);assert.match(snapshot,/defaultAcl/);assert.match(snapshot,/memberships/);assert.match(snapshot,/views/);assert.match(preservationSnapshot(slot),/native_leave_event/);}
});
test('generador rechaza SQL alterado, commit ausente, permisos auxiliares y prerrequisitos incompletos',()=>{
 for(const patch of [{source:source+'\n'},{sourceCommit:'working-tree'},{prerequisitePins:prerequisitePins.slice(1)},{prerequisitePins:[...prerequisitePins.slice(1),prerequisitePins[1]]},{prerequisitePins:prerequisitePins.map(p=>({...p,runtime:true}))}])assert.throws(()=>buildNativeSalaryInstallation({source,sourceCommit,prerequisitePins,...patch}));
});
test('confirmación de durabilidad exige conservación antes/después y objetos inmutables idénticos',()=>{
 const durable={...installed};delete durable.beforeFingerprint;assert.equal(assertNativeSalaryDurability({installed,durable,sourceCommit}).ok,true);
 assert.throws(()=>assertNativeSalaryDurability({installed:{...installed,beforeFingerprint:'b'.repeat(64)},durable,sourceCommit}));
 for(const patch of [{sourceCommit:'8'.repeat(40)},{sqlSha256:'b'.repeat(64)},{allChecksPassed:false},{functions112:13},{runtimeFacades:4},{eventRows:1},{nominalRowsReturned:1},{priorTableCount:179},{afterFingerprint:'b'.repeat(64)},{newObjectFingerprint:'d'.repeat(64)}])assert.throws(()=>assertNativeSalaryDurability({installed,durable:{...durable,...patch},sourceCommit}));
});
test('generador112 conserva el paquete mínimo y excluye fuentes municipales y secretos',()=>{
 const rules=read('.vercelignore').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')),included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),p=neg?rule.slice(1):rule;if(p.endsWith('/')?file.startsWith(p):path.matchesGlob(file,p)||!p.includes('/')&&path.matchesGlob(path.basename(file),p))keep=neg;}return keep;};
 const packagedRead=file=>{assert.ok(included(file),'Dependency excluded: '+file);return read(file);};assert.equal(prepareNativeSalaryInstallation({read:packagedRead,sourceCommit}).sqlSha256,SQL112_SHA256);
 for(const file of ['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/review.json','data-rrhh/private.json','source.txt','source.sql.gz'])assert.equal(included(file),false,file);
});
