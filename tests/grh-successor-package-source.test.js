import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {parseSuccessorJson,prepareSuccessorPackage} from '../scripts/lib/grh-successor-package-source.mjs';
import {projectCuratedReviewTables,importCuratedRrhh} from '../scripts/import-rrhh-neon.mjs';
import {CURATED_REVIEW_DOMAINS} from '../assets/grh-curated-review-model.js';
const parse=text=>parseSuccessorJson(Buffer.from(text));
for(const literal of ['0','-1','0.1','1.2500','1.25e2','9007199254740991'])test('lectura conserva la semántica decimal de '+literal,()=>{
  assert.equal(parse('{"quantity":'+literal+'}').quantity,Number(literal));
});
for(const literal of ['9007199254740993','9007199254740992','0.10000000000000001','1.234567890123456789','1e400'])test('lectura rechaza pérdida numérica de '+literal,()=>{
  assert.throws(()=>parse('{"amount":'+literal+'}'),{code:'SUCCESSOR_NUMBER_PRECISION'});
});
for(const text of ['{"value":','[1,]','{"secret":"PRIVATE"} trailing','NaN'])test('JSON inválido no se filtra al mensaje de error: '+text.slice(0,10),()=>{
  assert.throws(()=>parse(text),e=>e.code==='SUCCESSOR_JSON_INVALID'&&!e.message.includes('PRIVATE'));
});
test('UTF-8 inválido no se reemplaza silenciosamente',()=>{
  assert.throws(()=>parseSuccessorJson(Buffer.from([0xff])),{code:'SUCCESSOR_JSON_INVALID'});
});
test('nombres de campos similares a prototipos siguen siendo datos',()=>{
  const object=parse('{"__proto__":{"injected":true},"constructor":"literal"}');
  assert.equal(Object.getPrototypeOf(object),Object.prototype);assert.equal(object.__proto__.injected,true);assert.equal({}.injected,undefined);
});
const datasets=()=>Object.fromEntries(CURATED_REVIEW_DOMAINS.map(name=>[name,[]]));
test('proyección de tablas comparte los mapeadores sin habilitar escritura',async()=>{
  const data=datasets();data.employees.push({sourceKey:{companyCode:'101',employeeNumber:'0001'},personId:'9007199254740993',identity:{fullName:'AGENTE SINTÉTICO'},employment:{activeProxy:true},unionMemberships:[]});
  const before=structuredClone(data),tables=projectCuratedReviewTables(data,'2026-09-22T15:16:58');
  assert.deepEqual(Object.keys(tables).sort(),['grh_absences','grh_catalog_rows','grh_employees','grh_family','grh_leaves']);
  assert.equal(tables.grh_employees[0].legajo,'0001');assert.equal(tables.grh_employees[0].person_id,'9007199254740993');assert.deepEqual(data,before);
  let connected=false;await assert.rejects(importCuratedRrhh({client:{connect(){connected=true;}},source:{manifest:{profile:'grh-junin-2026-09-22'}}}),{code:'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED'});assert.equal(connected,false);
});
test('catálogos faltantes y fecha sin forma explícita rechazan la proyección',()=>{
  assert.throws(()=>projectCuratedReviewTables({},'2026-09-22T15:16:58'),/CURATED_REVIEW_PROJECTION_INVALID/);
  assert.throws(()=>projectCuratedReviewTables(datasets(),'22/09/2026'),/CURATED_REVIEW_PROJECTION_INVALID/);
});
for(const options of [{},{baselineCore:'relative/path'}, {baselineCore:42}])test('preparación exige cuatro directorios explícitos',async()=>{
  await assert.rejects(prepareSuccessorPackage(options),{code:'SUCCESSOR_SOURCE_DIRECTORY_REQUIRED'});
});
test('el manifiesto inválido se detiene antes de comparar o producir evidencia',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mc-source-qa-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'grh-core-manifest.json'),'{"schemaVersion":99}');let callbacks=0;
  await assert.rejects(prepareSuccessorPackage({baselineCore:dir,candidateCore:dir,baselineCurated:dir,candidateCurated:dir,onProgress(){callbacks++;}}));assert.equal(callbacks,0);
});
test('la utilidad no contiene una selección operativa ni salida nominal a archivo',async()=>{
  const cli=await fs.readFile(new URL('../scripts/verify-grh-successor-package.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(cli,/writeFile|appendFile|DATABASE_URL|\.connect\(|\bapply\b|\.changes/);
  assert.match(cli,/successorPackageSummary/);assert.match(cli,/strict:true/);
});
test('un día inexistente no se usa como corte de personal',()=>{
  assert.throws(()=>projectCuratedReviewTables(datasets(),'2026-02-30T15:16:58'),/CURATED_REVIEW_PROJECTION_INVALID/);
});
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/verify-grh-successor-package.mjs',import.meta.url));
for(const args of [[],['--apply'],['--output','/tmp/nominal.json'],['--baseline-core','relative']])test('CLI incompleta o con escritura solicitada no expone datos: '+args.join(' '),()=>{
  const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr.trim(),/^SUCCESSOR_[A-Z_]+$/);
});
test('el proyector conserva identificadores familiares y ceros del legajo',()=>{
  const data=datasets();data.familyMembers.push({sourceKey:{familyMemberId:'9007199254740993'},employeeSourceKey:{companyCode:'101',employeeNumber:'0002'},fullName:'FAMILIAR SINTÉTICO'});
  const output=projectCuratedReviewTables(data,'2026-09-22T15:16:58');assert.equal(output.grh_family[0].family_id,'9007199254740993');assert.equal(output.grh_family[0].legajo,'0002');
});
