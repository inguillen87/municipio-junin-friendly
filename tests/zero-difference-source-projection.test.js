import {projectPlanillaDepartmentsRawSourceToParent} from './fixtures/own-planilla-departments-source-projection.js';
// PROPOSED by Claude (R5; source only; not run by Claude). Target: tests/zero-difference-source-projection.test.js
// The outermost zero-differences succession layer: every current public file it covers is exactly its reviewed
// successor, projects back to the exact pinned parent, and rejects any other bytes. The live engine route is checked
// for coherence: every sha-for-sha replacement names a parent/successor pair of the same layer, in order.
import test from 'node:test';import assert from 'node:assert/strict';
import {projectOwnPayrollLoginRawSourceToParent} from './fixtures/own-payroll-login-source-projection.js';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {ZERO_DIFFERENCE_SOURCE_PINS,ZERO_DIFFERENCE_ENGINE_SOURCE_PINS,ZERO_DIFFERENCE_ENGINE_SUCCESSOR_ORDER,ZERO_DIFFERENCE_NEW_SOURCE_PINS,projectZeroDifferenceRawSourceToParent,projectZeroDifferenceEngineRawSourceToParent,projectZeroDifferenceAllRawSourceToParent} from './fixtures/zero-difference-source-projection.js';
import {projectAccountingFull190BrowserRawSourceToParent} from './fixtures/accounting-full-current190-browser-source-projection.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const rawCurrent=file=>projectAccountingFull190BrowserRawSourceToParent(file,projectOwnPayrollLoginRawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url))));
const raw=file=>projectPlanillaDepartmentsRawSourceToParent(file,rawCurrent(file));
const HEX=/^[a-f0-9]{64}$/;

test('cada archivo cubierto es su sucesor exacto y proyecta al padre pinado; bytes añadidos, mutados o el propio padre se rechazan',()=>{
 const sets=[[ZERO_DIFFERENCE_SOURCE_PINS,projectZeroDifferenceRawSourceToParent],[ZERO_DIFFERENCE_ENGINE_SOURCE_PINS,projectZeroDifferenceEngineRawSourceToParent]];
 let covered=0;
 for(const [pins,project] of sets)for(const [file,pin] of Object.entries(pins)){
  const current=raw(file);assert.equal(current.length,pin.afterBytes,file);assert.equal(hash(current),pin.after,file);
  const parent=project(file,current);assert.equal(parent.length,pin.beforeBytes,file);assert.equal(hash(parent),pin.before,file);
  assert.deepEqual(projectZeroDifferenceAllRawSourceToParent(file,rawCurrent(file)),parent,file+' composed layer');
  assert.throws(()=>project(file,Buffer.concat([current,Buffer.from('unreviewed')])),file+' appended');
  const mutation=Buffer.from(current);mutation[0]^=1;assert.throws(()=>project(file,mutation),file+' mutated');
  assert.throws(()=>project(file,parent),file+' parent is not the current source');
  covered++;
 }
 assert.equal(covered,Object.keys(ZERO_DIFFERENCE_SOURCE_PINS).length+Object.keys(ZERO_DIFFERENCE_ENGINE_SOURCE_PINS).length);
 assert.deepEqual(Object.keys(ZERO_DIFFERENCE_SOURCE_PINS).filter(file=>Object.hasOwn(ZERO_DIFFERENCE_ENGINE_SOURCE_PINS,file)),[],'the two row sets are disjoint');
 const other=Buffer.from('unrelated');assert.strictEqual(projectZeroDifferenceAllRawSourceToParent('tests/canonical190-read-committed.test.js',other),other,'self-pinned canonical190 is never touched');
});

test('ruta viva del motor: orden topológico, sustituciones sha por sha de la misma capa, bytes inalterados salvo el motor',()=>{
 const order=ZERO_DIFFERENCE_ENGINE_SUCCESSOR_ORDER;assert.equal(order[0],'assets/own-payroll-engine.js');
 assert.deepEqual([...order].sort(),Object.keys(ZERO_DIFFERENCE_ENGINE_SOURCE_PINS).sort());
 const afterOf=Object.fromEntries(order.map(file=>[file,ZERO_DIFFERENCE_ENGINE_SOURCE_PINS[file].after])),beforeOf=Object.fromEntries(order.map(file=>[file,ZERO_DIFFERENCE_ENGINE_SOURCE_PINS[file].before]));
 const fixture=fs.readFileSync(new URL('./fixtures/zero-difference-source-projection.js',import.meta.url),'utf8');
 const engineRows=JSON.parse(fixture.slice(fixture.indexOf('const engineRows=')+'const engineRows='.length,fixture.indexOf(';\nexport const ZERO_DIFFERENCE_NEW_SOURCE_PINS')));
 for(const file of order.slice(1)){
  const row=engineRows[file];assert.equal(row.beforeBytes,row.afterBytes,file+' sha-for-sha only');
  for(const op of row.inverse){
   const from=Buffer.from(op.beforeBase64,'base64').toString('utf8'),to=Buffer.from(op.afterBase64,'base64').toString('utf8');
   assert.ok(HEX.test(from)&&HEX.test(to),file+' replacement is a sha');
   const pinned=order.find(candidate=>beforeOf[candidate]===from);assert.ok(pinned,file+' replaces a parent sha of this layer: '+from.slice(0,12));
   assert.equal(afterOf[pinned],to,file+' -> '+pinned+' successor sha');assert.ok(order.indexOf(pinned)<order.indexOf(file),file+' holder comes after what it pins');
  }
 }
 const engine=ZERO_DIFFERENCE_ENGINE_SOURCE_PINS['assets/own-payroll-engine.js'];assert.ok(engine.afterBytes>engine.beforeBytes,'only the engine grows (located())');
});

test('archivos nuevos de la sucesión: bytes y sha exactos',()=>{
 for(const [file,pin] of Object.entries(ZERO_DIFFERENCE_NEW_SOURCE_PINS)){const source=raw(file);assert.equal(source.length,pin.bytes,file);assert.equal(hash(source),pin.sha256,file);}
 assert.ok(Object.hasOwn(ZERO_DIFFERENCE_NEW_SOURCE_PINS,'scripts/lib/own-payroll-package-closure.mjs')&&Object.hasOwn(ZERO_DIFFERENCE_NEW_SOURCE_PINS,'assets/own-payroll-zero-difference.js'));
});
