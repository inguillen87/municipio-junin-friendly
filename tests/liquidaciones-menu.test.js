import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {LIQUIDACIONES_TASKS,visibleLiquidacionesTasks,activeLiquidacionesTask} from '../assets/liquidaciones-menu.js';
test('Liquidaciones groups working routes, no payroll execution',()=>{assert.equal(LIQUIDACIONES_TASKS.length,11);assert.equal(new Set(LIQUIDACIONES_TASKS.map(x=>x.href)).size,11);assert.ok(LIQUIDACIONES_TASKS.every(x=>/^\/(nomina#[a-z]+|novedades)$/.test(x.href)));assert.ok(Object.isFrozen(LIQUIDACIONES_TASKS));});
test('no permission means no payroll menu',()=>assert.equal(visibleLiquidacionesTasks([]).length,0));
test('novelty and payroll permissions remain separate',()=>{assert.deepEqual(visibleLiquidacionesTasks(['payroll.novelty.read']).map(x=>x.href),['/novedades']);assert.equal(visibleLiquidacionesTasks(['payroll.read']).length,6);assert.equal(visibleLiquidacionesTasks(['payroll.read','payroll.novelty.read']).length,7);});
test('own payroll read exposes its four tasks without legacy or novelty access',()=>{assert.deepEqual(visibleLiquidacionesTasks(['payroll.calculation.read']).map(x=>x.href),['/nomina#calculo','/nomina#decisiones','/nomina#anulacion','/nomina#cierre']);assert.equal(visibleLiquidacionesTasks(['payroll.calculation.approve']).length,0);assert.equal(visibleLiquidacionesTasks(['payroll.calculation.read','payroll.read','payroll.novelty.read']).length,11);});
for(const path of ['/nomina','/nomina-control','/nomina-control.html'])test('canonical and legacy '+path,()=>{assert.equal(activeLiquidacionesTask(path),'/nomina#resumen');assert.equal(activeLiquidacionesTask(path,'#reportes'),'/nomina#reportes');assert.equal(activeLiquidacionesTask(path,'#arbitrary'),null);});
test('other screens and novelties are unambiguous',()=>{assert.equal(activeLiquidacionesTask('/personal','#legajos'),null);assert.equal(activeLiquidacionesTask('/novedades-nomina.html'),'/novedades');});
test('menu reuses gate, no additional requests or personal storage',()=>{const source=fs.readFileSync('assets/liquidaciones-menu.js','utf8');assert.doesNotMatch(source,/\bfetch\s*\(|innerHTML|localStorage|sessionStorage/);assert.match(source,/await gate.ready/);});
test('each payroll task anchor already exists',()=>{const source=fs.readFileSync('assets/payroll-navigation.js','utf8');for(const task of LIQUIDACIONES_TASKS.filter(x=>x.href.startsWith('/nomina#')))assert.ok(source.includes("id:'"+task.href.split('#')[1]+"'"));});
test('the payroll workspace registers for this menu and every task sits in exactly one section, Anular período before Confirmar y anular',()=>{
 const source=fs.readFileSync('assets/payroll-navigation.js','utf8');
 assert.ok(source.includes("sections:PAYROLL_TASK_SECTIONS,menu:'liquidaciones'"));assert.doesNotMatch(source,/^export /m,'payroll-navigation stays a side-effect module (vm sandboxes strip only imports)');
 const ids=[...source.matchAll(/\{id:'([a-z0-9-]+)',label:'[^']+',nodes:\[/g)].map(m=>m[1]);assert.equal(ids.length,29);assert.equal(new Set(ids).size,29);
 const literal=/PAYROLL_TASK_SECTIONS=Object\.freeze\((\[[^\n]*\])\);/.exec(source)?.[1];assert.ok(literal);
 const sections=JSON.parse(literal.replace(/'/g,'"').replace(/([{,])(label|tasks):/g,'$1"$2":'));
 const tasks=sections.flatMap(s=>s.tasks);assert.deepEqual([...tasks].sort(),[...ids].sort(),'every workspace task belongs to a section and no section names an unknown task');assert.equal(new Set(tasks).size,tasks.length);
 assert.ok(sections.every(s=>s.label===null||typeof s.label==='string'&&s.label.length>0));
 assert.ok(tasks.indexOf('anulacion')<tasks.indexOf('decisiones'),'visual order: Anular período precedes Confirmar y anular');assert.ok(tasks.indexOf('calculo')<tasks.indexOf('anulacion'));
 assert.ok(ids.indexOf('anulacion')<ids.indexOf('decisiones'),'panel order follows the same visual order');
 for(const task of LIQUIDACIONES_TASKS.filter(x=>x.href.startsWith('/nomina#')))assert.ok(tasks.includes(task.href.split('#')[1]),task.href);
});
test('adoption preserves the original page gate for all tabs and the distinct legacy link authority',()=>{
 const source=fs.readFileSync('assets/liquidaciones-menu.js','utf8');
 assert.match(source,/data-task-menu="'\+TASK_MENU\+'"/);assert.match(source,/municontrol:task-workspace/);assert.doesNotMatch(source,/tab.setAttribute\('data-requires-all-capability'/);
 assert.match(source,/closest\('\[data-requires-any-capability\]'\)/);assert.match(source,/dataset\.liquidacionesDuplicate/);assert.match(source,/links\.after\(nav\)/);assert.match(source,/municontrol:liquidaciones-menu-change/);
 assert.doesNotMatch(source,/cloneNode|innerHTML|createElement\('button'\)/,'tabs are adopted, never rebuilt');
 const literals=[...source.matchAll(/'(payroll\.[a-z.]+)'/g)].map(m=>m[1]);assert.deepEqual([...new Set(literals)].sort(),['payroll.calculation.read','payroll.novelty.read','payroll.read']);
});
