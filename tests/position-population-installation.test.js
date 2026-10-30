// Bounded FS/source-builder checks. No database/client/native driver.
// The generated statements stay inert; no native runner is invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPositionPopulationInstallation,assertPositionPopulationDurability,SQL210_SHA} from '../scripts/lib/position-population-installation.mjs';
import {buildAdoptedPositionsInstallation} from '../scripts/lib/adopted-positions-installation.mjs';

const sourceCommit='01b7b863d40fbc99a7d737b83976846bda2fa087';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const build=()=>buildPositionPopulationInstallation({read,sourceCommit});
const proof=batch=>({version:'own-position-population-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,
 predecessorVersion:'adopted-positions-installation.v2',allChecksPassed:true,newTables:0,newFunctions:2,runtimeFacades:1,
 capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0,
 priorFingerprint:'a'.repeat(64),objectFingerprint:'b'.repeat(64)});

test('SQL210 genera sólo dos funciones nuevas y sus ACL explícitas, sin ejecutar ni tocar tablas',()=>{
 const b=build();assert.equal(b.connects,false);assert.equal(b.executesSql,false);assert.equal(b.migration.length,5);
 assert.equal(b.sourceHashes['210-own-position-population-proof.sql'],SQL210_SHA);
 assert.deepEqual(b.ownPins.map(pin=>[pin.name,pin.signature,pin.runtime]),[
  ['own_position_population_proof_v2','public.own_position_population_proof_v2(jsonb)',false],
  ['position_comparison_detail_v2','public.position_comparison_detail_v2(jsonb,integer,integer,text,text)',true]
 ]);
 assert.equal(b.migration.filter(statement=>/^CREATE FUNCTION public\./.test(statement)).length,2);
 assert.ok(b.migration.every(statement=>!/^(?:CREATE TABLE|ALTER TABLE|CREATE OR REPLACE|INSERT|UPDATE|DELETE|TRUNCATE|BEGIN|COMMIT|ROLLBACK)\b/i.test(statement)));
 assert.equal(b.migration[3],'REVOKE ALL ON FUNCTION public.own_position_population_proof_v2(jsonb),public.position_comparison_detail_v2(jsonb,integer,integer,text,text) FROM PUBLIC,municontrol_actions_runtime_app');
 assert.equal(b.migration[4],'GRANT EXECUTE ON FUNCTION public.position_comparison_detail_v2(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app');
 assert.ok(b.ownPins.every(pin=>pin.definer&&pin.language==='plpgsql'&&!pin.strict&&!pin.returnsSet));
});

test('el único predecesor conserva los cinco pins adaptados y 27 dependencias exactas, sin lector v1 alternativo',()=>{
 const previous=buildAdoptedPositionsInstallation({read,sourceCommit}),b=build();
 assert.equal(b.predecessorVersion,'adopted-positions-installation.v2');assert.deepEqual(b.previousPins,previous.afterPins);
 assert.deepEqual(b.prerequisitePins,[...previous.afterPins,...previous.dependencies]);assert.equal(b.prerequisitePins.length,32);
 assert.equal(new Set(b.prerequisitePins.map(pin=>pin.signature)).size,32);assert.equal(b.oldComparisonPins.length,4);
 const reader=b.oldComparisonPins.find(pin=>pin.name==='position_comparison_detail_v1');
 assert.deepEqual(reader,previous.afterPins.find(pin=>pin.name===reader.name));
 assert.notEqual(reader.sha256,previous.beforePins.find(pin=>pin.name===reader.name).sha256);
 for(const pin of b.prerequisitePins)assert.ok(b.beforeCheck.includes(pin.sha256)&&b.afterCheck.includes(pin.sha256));
});

test('un byte no revisado de SQL210 se rechaza antes de construir el predecesor',()=>{
 const reads=[];
 assert.throws(()=>buildPositionPopulationInstallation({sourceCommit,read:file=>{reads.push(file);return read(file)+'\n';}}),/Unreviewed SQL210/);
 assert.deepEqual(reads,['scripts/migrations/210-own-position-population-proof.sql']);
});

test('alterar SQL129 no permite reseñar como soportado un predecesor distinto',()=>{
 assert.throws(()=>buildPositionPopulationInstallation({sourceCommit,read:file=>read(file)+(file==='scripts/migrations/129-own-position-comparison.sql'?'\n':'')}),/Unreviewed annual position source 129-own-position-comparison\.sql/);
});

test('la conservación incluye tablas, filas, cuerpos y seguridad globales; sólo excluye los dos OID nuevos',()=>{
 const b=build();
 for(const snapshot of [b.before,b.after]){
  assert.equal((snapshot.match(/p\.oid IS DISTINCT FROM to_regprocedure\('/g)||[]).length,2);
  for(const pin of b.ownPins)assert.ok(snapshot.includes("p.oid IS DISTINCT FROM to_regprocedure('"+pin.signature+"')"));
  for(const field of ['tables','sequences','functions','triggers','schemas','defaultAcl','roles','memberships','views'])assert.ok(snapshot.includes("'"+field+"'"),field);
  assert.ok(snapshot.includes('to_jsonb(p)::text'));assert.ok(snapshot.includes('to_jsonb(r)::text'));
  assert.ok(snapshot.includes('relrowsecurity'));assert.ok(snapshot.includes('relforcerowsecurity'));
  assert.doesNotMatch(snapshot,/native_leave_|municontrol_sql111\.|CASE WHEN p\.oid|-'prosrc'|capability_key NOT IN/);
 }
 assert.match(b.priorAudit,/before'\)::jsonb IS DISTINCT FROM current_setting\('municontrol_position_population\.after'\)::jsonb/);
 assert.match(b.priorAudit,/POSITION_POPULATION_PRIOR_STATE_CHANGED/);
});

test('modo first/repeat exige familias exactas 4 y 5, ausencia/presencia completa y pins de ambas funciones',()=>{
 const b=build();
 assert.ok(b.mode.includes("proname LIKE 'position_comparison_%')=4"));
 assert.ok(b.mode.includes("proname LIKE 'position_comparison_%')=5"));
 assert.match(b.mode,/POSITION_POPULATION_PARTIAL_OR_CONFLICT/);assert.match(b.mode,/POSITION_POPULATION_ISOLATION_REQUIRED/);
 assert.doesNotMatch(b.mode,/>=\s*4|SQL129_FUNCTION_COUNT|'legacy'/);
 for(const pin of b.ownPins){assert.ok(b.mode.includes(pin.sha256));assert.ok(b.mode.includes("to_regprocedure('"+pin.signature+"') IS NULL"));assert.ok(b.mode.includes("to_regprocedure('"+pin.signature+"') IS NOT NULL"));}
 assert.match(b.apply,/^DO \$apply\$ BEGIN IF current_setting\('municontrol_position_population\.mode'\)='first' THEN/);
 assert.equal(b.installation.includes(b.apply),true);assert.equal(b.installation.includes(b.priorAudit),true);
 assert.match(b.afterCheck,/POSITION_POPULATION_FUNCTION_FAMILY_CHANGED/);
});

test('durabilidad es lectura y exige repeat sin CREATE ni un rerun de la auditoría SQL129 de tabla vacía',()=>{
 const b=build(),statements=b.durableVerification.join('\n');
 assert.equal(b.durableVerification[0],'SET TRANSACTION READ ONLY');assert.equal(b.durableVerification.includes(b.apply),false);
 assert.match(statements,/POSITION_POPULATION_DURABILITY_REQUIRES_EXISTING/);
 assert.doesNotMatch(statements,/CREATE FUNCTION|CREATE OR REPLACE|GRANT EXECUTE|REVOKE ALL|SQL129_FUNCTION_COUNT|SQL129_NEW_TABLE_NOT_EMPTY/);
 assert.equal(b.installation.at(-1),b.proof);assert.equal(b.durableVerification.at(-1),b.proof);
 const p=proof(b);assert.equal(assertPositionPopulationDurability({installed:p,durable:structuredClone(p),batch:b}).passed,true);
});

test('igualdad completa rechaza huellas/versión/fuente/counters falsos o campos adicionales',()=>{
 const b=build(),p=proof(b);
 for(const patch of [{priorFingerprint:'c'.repeat(64)},{objectFingerprint:'c'.repeat(64)},{sourceCommit:'e'.repeat(40)},{sourceHashes:{...p.sourceHashes,'210-own-position-population-proof.sql':'e'.repeat(64)}},{unexpected:true}])
  assert.throws(()=>assertPositionPopulationDurability({installed:p,durable:{...p,...patch},batch:b}));
 for(const patch of [{version:'wrong'},{predecessorVersion:'adopted-positions-installation.v1'},{allChecksPassed:false},{newTables:1},{newFunctions:3},{runtimeFacades:2},{capabilityDefinitionsAdded:1},{roleAssignmentsAdded:1},{businessOperations:1},{nominalRowsReturned:1},{priorFingerprint:'not-a-sha'}]){
  const forged={...p,...patch};assert.throws(()=>assertPositionPopulationDurability({installed:forged,durable:structuredClone(forged),batch:b}));
 }
});
