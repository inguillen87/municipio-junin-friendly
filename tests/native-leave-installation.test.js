import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {SQL111_SHA256,buildNativeLeaveInstallation,functionPin,assertNativeLeaveDurability} from '../scripts/lib/native-leave-installation.mjs';
import {prepareNativeLeaveInstallation,readLeavePrerequisites} from '../scripts/prepare-native-leave-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n'),source=read('scripts/migrations/111-native-leave-workflow.sql'),definitions=readLeavePrerequisites(read),sourceCommit='9'.repeat(40);

test('el lote111 contiene la fuente exacta y sólo los dos destinos existentes; generarlo no ejecuta SQL',()=>{
 const b=prepareNativeLeaveInstallation({read,sourceCommit});assert.equal(b.sqlSha256,SQL111_SHA256);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.deepEqual(b.targets.map(t=>[t.major,t.project_id,t.database_name]),[[17,'noisy-poetry-54471701','neondb'],[18,'wild-cake-87689498','neondb']]);
 const migration=splitPostgresStatements(source);assert.deepEqual(b.installation.slice(2,2+migration.length),migration);assert.equal(b.ownPins.length,16);assert.equal(b.ownPins.filter(p=>p.runtime).length,3);assert.equal(b.prerequisitePins.length,7);
 for(const t of b.targets){assert.match(t.preflight.join('\n'),/SET TRANSACTION READ ONLY/);assert.match(t.installation.join('\n'),/REPEATABLE READ/);assert.match(t.installation.join('\n'),/SQL111_DESTINATION_MISMATCH/);assert.equal(t.installation.filter(s=>/^COMMIT|^BEGIN/i.test(s)).length,0);assert.match(t.durableVerification.join('\n'),/SET TRANSACTION READ ONLY/);assert.doesNotMatch(t.durableVerification.join('\n'),/CREATE FUNCTION|CREATE TABLE|INSERT INTO|UPDATE public\.|DELETE FROM/);}
});

test('la lectura posterior exige el mismo commit, objetos, datos y cero movimientos',()=>{
 const installed={sourceCommit,sqlSha256:SQL111_SHA256,allChecksPassed:true,functions111:16,runtimeFacades:3,eventRows:0,nominalRowsReturned:0,priorTableCount:179,beforeFingerprint:'a'.repeat(64),afterFingerprint:'b'.repeat(64),newObjectFingerprint:'c'.repeat(64)},durable={...installed};delete durable.beforeFingerprint;
 assert.equal(assertNativeLeaveDurability({installed,durable,sourceCommit}).ok,true);
 for(const patch of [{sourceCommit:'8'.repeat(40)},{sqlSha256:'a'.repeat(64)},{allChecksPassed:false},{functions111:17},{runtimeFacades:4},{eventRows:1},{nominalRowsReturned:1},{priorTableCount:178},{afterFingerprint:'c'.repeat(64)},{newObjectFingerprint:'d'.repeat(64)}])assert.throws(()=>assertNativeLeaveDurability({installed,durable:{...durable,...patch},sourceCommit}));
 assert.throws(()=>assertNativeLeaveDurability({installed:{...installed,beforeFingerprint:undefined},durable,sourceCommit}));
});
test('un SQL diferente, una revisión sin commit o prerrequisitos incompletos nunca produce un lote instalable',()=>{
 for(const patch of [{source:source+'\n'},{sourceCommit:'working-tree'},{prerequisiteDefinitions:definitions.slice(1)},{prerequisiteDefinitions:[...definitions.slice(1),definitions[1]]}])assert.throws(()=>buildNativeLeaveInstallation({source,prerequisiteDefinitions:definitions,sourceCommit,...patch}));
 assert.throws(()=>prepareNativeLeaveInstallation({read:f=>read(f).replace(" RETURN ctx;"," RETURN '{}'::jsonb;"),sourceCommit}));
});
test('la revisión preserva metadatos completos de sesión y funciones, defaults y SETOF, sin conceder accesos auxiliares',()=>{
 const b=buildNativeLeaveInstallation({source,prerequisiteDefinitions:definitions,sourceCommit});const ctx=b.prerequisitePins.find(p=>p.name==='native_employment_change_context_v1'),validator=b.prerequisitePins.find(p=>p.name==='action_center_valid_leave_payload');
 assert.equal(ctx.defaults,'NULL::text');assert.equal(ctx.definer,true);assert.deepEqual(ctx.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);assert.equal(validator.strict,true);assert.equal(validator.definer,false);assert.deepEqual(validator.config,[]);
 assert.equal(b.ownPins.find(p=>p.name==='native_leave_latest_v1').returnsSet,true);assert.equal(b.prerequisitePins.some(p=>p.runtime),false);
 assert.throws(()=>functionPin('CREATE FUNCTION public.fake(a integer DEFAULT 3) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL $$'));
});

test('el paquete filtrado permite generar el lote111 y sigue excluyendo las fuentes privadas',()=>{
 const rules=read('.vercelignore').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=file=>{
  let keep=true;
  for(const rule of rules){
   const negated=rule.startsWith('!'),pattern=negated?rule.slice(1):rule;
   const matches=pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||(!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern));
   if(matches)keep=negated;
  }
  return keep;
 };
 const packagedRead=file=>{assert.ok(included(file),'Dependencia excluida del paquete: '+file);return read(file);};
 const batch=prepareNativeLeaveInstallation({read:packagedRead,sourceCommit});
 assert.equal(batch.sqlSha256,SQL111_SHA256);assert.equal(batch.prerequisitePins.length,7);assert.equal(batch.ownPins.length,16);
 for(const file of ['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/review.json','data-rrhh/private.json','source.txt','source.sql.gz','source.backup_20260922.sql'])assert.equal(included(file),false,'Fuente privada admitida: '+file);
});
