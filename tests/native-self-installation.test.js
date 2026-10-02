import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {SQL113_SHA256,buildNativeSelfInstallation,assertNativeSelfDurability} from '../scripts/lib/native-self-installation.mjs';
import {prepareNativeSelfInstallation,readSelfPrerequisites} from '../scripts/prepare-native-self-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n'),source=read('scripts/migrations/113-native-employee-self-access.sql'),definitions=readSelfPrerequisites(read),sourceCommit='9'.repeat(40);

test('SQL113 sólo prepara el SQL revisado para las dos bases existentes; preflight y comprobación posterior son lecturas',()=>{
 const b=prepareNativeSelfInstallation({read,sourceCommit}),migration=splitPostgresStatements(source);
 assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.sqlSha256,SQL113_SHA256);
 assert.deepEqual(b.targets.map(t=>[t.major,t.project_id,t.database_name]),[[17,'noisy-poetry-54471701','neondb'],[18,'wild-cake-87689498','neondb']]);
 assert.deepEqual(b.installation.slice(4,4+migration.length),migration);assert.equal(b.ownPins.length,5);assert.equal(b.ownPins.filter(p=>p.runtime).length,4);
 for(const t of b.targets){
  assert.match(t.preflight[0],/READ ONLY/);assert.match(t.durableVerification[0],/READ ONLY/);
  for(const phase of [t.preflight,t.installation,t.durableVerification])assert.match(phase.join('\n'),/IS DISTINCT FROM \d+::oid/,'un guard ausente también rechaza el destino');
  assert.match(t.installation.join('\n'),/SHARE MODE NOWAIT/);assert.match(t.installation.join('\n'),/SQL113_PRIOR_STATE_CHANGED/);
  assert.doesNotMatch(t.durableVerification.join('\n'),/CREATE FUNCTION|CREATE TABLE|INSERT INTO|UPDATE public\.|DELETE FROM|LOCK TABLE/);
  assert.equal(t.installation.filter(s=>/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)).length,0);
 }
});

test('preservación113 incluye todo el historial111 y sólo permite siete cambios de cuerpo exactos',()=>{
 const b=buildNativeSelfInstallation({source,prerequisiteDefinitions:definitions,sourceCommit});
 assert.equal(b.prerequisitePins.length,18);assert.equal(b.reviewedPatches.length,7);
 assert.equal(b.prerequisitePins.filter((p,i)=>p.sha256!==b.afterPins[i].sha256).length,7);
 for(let n=0;n<18;n++)assert.deepEqual({...b.prerequisitePins[n],sha256:null},{...b.afterPins[n],sha256:null});
 assert.doesNotMatch(b.before,/IS DISTINCT FROM to_regclass\('public.native_leave_event'\)|proname LIKE 'native_leave_%'/);
 for(const key of ['tables','sequences','functions','triggers','schemas','defaultAcl','roles','memberships','views'])assert.ok(b.before.includes("'"+key+"'"));
 assert.match(b.before,/THEN to_jsonb\(p\)-'prosrc' ELSE to_jsonb\(p\) END/);
 assert.match(b.afterCheck,/SQL113_REVIEWED_PATCH_METADATA/);assert.match(b.ownAudit,/SQL113_NEW_FUNCTION_COUNT/);
 assert.match(b.ownCheck,/SQL113_NEW_FUNCTION_METADATA/);
 assert.equal(b.prerequisitePins.find(p=>p.name==='tenant_action_lookup_employment_v2').defaults,'20');
 assert.equal(b.prerequisitePins.find(p=>p.name==='payroll_fixed_registry_subject_by_contract_v1').defaults,'false');
});

test('otra fuente, otra revisión o prerrequisitos alterados nunca generan un lote113 instalable',()=>{
 for(const patch of [{source:source+'\n'},{sourceCommit:'working-tree'},{prerequisiteDefinitions:definitions.slice(1)},{prerequisiteDefinitions:[...definitions.slice(1),definitions[1]]},{prerequisiteDefinitions:definitions.map((d,i)=>i===0?d.replace('BEGIN','BEGIN PERFORM 1;'):d)}])assert.throws(()=>buildNativeSelfInstallation({source,prerequisiteDefinitions:definitions,sourceCommit,...patch}));
 assert.throws(()=>prepareNativeSelfInstallation({read:f=>read(f).replace('p_limit integer DEFAULT 20','p_limit integer DEFAULT 21'),sourceCommit}));
});

test('la verificación113 independiente exige el mismo destino, commit, datos, metadatos y cero operaciones nominales',()=>{
 const installed={version:'native-self-installation.v1',sourceCommit,sqlSha256:SQL113_SHA256,database:'neondb',owner:'neondb_owner',serverMajor:17,priorStateFingerprint:'a'.repeat(64),newObjectFingerprint:'b'.repeat(64),newTables:0,newFunctions:5,reviewedFunctionPatches:7,runtimeFacades:4,nominalRowsReturned:0,checkedAt:'2026-10-02T00:00:00.000000Z'},durable={...installed,checkedAt:'2026-10-02T00:00:01.000000Z'};
 assert.equal(assertNativeSelfDurability({installed,durable,sourceCommit}),true);
 for(const patch of [{version:'other'},{sourceCommit:'8'.repeat(40)},{sqlSha256:'a'.repeat(64)},{database:'foreign'},{owner:'runtime'},{serverMajor:18},{priorStateFingerprint:'c'.repeat(64)},{newObjectFingerprint:'d'.repeat(64)},{newTables:1},{newFunctions:6},{reviewedFunctionPatches:8},{runtimeFacades:5},{nominalRowsReturned:1}])assert.throws(()=>assertNativeSelfDurability({installed,durable:{...durable,...patch},sourceCommit}));
 for(const patch of [{database:'foreign'},{owner:'runtime'},{serverMajor:16},{newTables:1},{priorStateFingerprint:null},{newObjectFingerprint:'invalid'}])assert.throws(()=>assertNativeSelfDurability({installed:{...installed,...patch},durable:{...durable,...patch},sourceCommit}));
});

test('el paquete113 se prepara sin incluir fuentes municipales privadas en el despliegue',()=>{
 const rules=read('.vercelignore').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const negated=rule.startsWith('!'),pattern=negated?rule.slice(1):rule;const matches=pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||(!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern));if(matches)keep=negated;}return keep;};
 const b=prepareNativeSelfInstallation({read:file=>{assert.ok(included(file),file);return read(file);},sourceCommit});assert.equal(b.sqlSha256,SQL113_SHA256);
 for(const file of ['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/review.json','data-rrhh/private.json','source.txt','source.sql.gz','source.backup_20260922.sql'])assert.equal(included(file),false,file);
});
