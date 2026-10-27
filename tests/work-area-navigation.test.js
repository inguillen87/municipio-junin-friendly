import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {WORK_AREAS,classifyWorkItem,matchesMenuQuery} from '../assets/work-area-model.js';
import '../assets/app-routes.js';
import {transformFriendlyShellSource} from '../scripts/lib/friendly-shell-page.mjs';
test('seven real work areas are immutable and legal has a native registry',()=>{assert.equal(WORK_AREAS.length,7);assert.equal(new Set(WORK_AREAS.map(x=>x.id)).size,7);assert.ok(Object.isFrozen(WORK_AREAS));assert.ok(WORK_AREAS.every(Object.isFrozen));assert.ok(WORK_AREAS.some(x=>x.id==='juridica'));});
for(const [file,area] of [['internal-dashboard.html','personas'],['centro-acciones.html','personas'],['estructura.html','personas'],['licencias-control.html','personas'],['relojes-marcaciones.html','asistencia'],['fuentes-tiempo.html','asistencia'],['ausentismo-control.html','asistencia'],['nomina-control.html','liquidaciones'],['novedades-nomina.html','liquidaciones'],['presupuesto-control.html','hacienda'],['reportes-rrhh.html','control'],['integracion-datos.html','control'],['asistente.html','sistema'],['administracion-plataforma.html','sistema']])test('classification '+file,()=>assert.equal(classifyWorkItem({file}),area));
test('embedded Personas views take precedence over page',()=>{assert.equal(classifyWorkItem({view:'inicio',file:'internal-dashboard.html'}),'inicio');assert.equal(classifyWorkItem({view:'calidad',file:'internal-dashboard.html'}),'control');assert.equal(classifyWorkItem({file:'never-implemented.html'}),null);});
for(const [text,query,result]of [['Parámetros salariales','parametros SALARIALES',true],['Reportes y control',' control reportes ',true],['Asistencia / Tardanzas','tardanzas',true],['Personas','payroll',false],['Nómina','<script>',false],['Liquidaciones','',true]])test('search '+query,()=>assert.equal(matchesMenuQuery(text,query),result));
test('clean and legacy paths keep section and parameters; menu does not create new routes',()=>{const route=globalThis.MuniControlRoutes.resolve('/nomina-control.html?period=2026-09#parametros');assert.equal(route.file,'nomina-control.html');assert.equal(route.hash,'#parametros');assert.equal(route.search,'?period=2026-09');assert.equal(classifyWorkItem(route),'liquidaciones');});
test('navigation preserves server authority and existing elements',()=>{const s=fs.readFileSync('assets/work-area-menu.js','utf8');assert.doesNotMatch(s,/\bfetch\s*\(|innerHTML|cloneNode|localStorage|sessionStorage|DATABASE_URL|\.submit\(/);assert.match(s,/await gate.ready/);assert.match(s,/gate.allowed/);assert.match(s,/parent.append\(item\)/);assert.match(s,/data-work-permission-denied/);assert.match(s,/logoutButton/);assert.match(s,/prefers-reduced-motion|mobileMedia/);});
test('build registers and emits both menus through the real shell transform',()=>{
 const build=fs.readFileSync('scripts/build-friendly.mjs','utf8');
 for(const f of ['work-area-model.js','work-area-menu.js','work-area-menu.css','liquidaciones-menu.js'])assert.ok(build.includes("'assets/"+f+"'"));
 assert.match(build,/transformFriendlyShellSource\(original,file,identityVersion,globalThis\.MuniControlRoutes\)/);
 const html=transformFriendlyShellSource(fs.readFileSync('nomina-control.html','utf8'),'nomina-control.html','identity-test',globalThis.MuniControlRoutes);
 for(const file of ['work-area-menu.js','liquidaciones-menu.js'])assert.equal((html.match(new RegExp('src="/assets/'+file.replace('.','\\.')+'"','g'))||[]).length,1,file);
});
test('legal roadmap is explicit, article-based and has no pretend operational buttons',()=>{const html=fs.readFileSync('modulos.html','utf8');const section=html.match(/<section[^>]*id="juridica"[\s\S]*?<\/section>/)?.[0];assert.ok(section);assert.equal((section.match(/class="capability"/g)||[]).length,6);assert.equal((section.match(/<details /g)||[]).length,6);assert.match(section,/Planificado/);assert.match(section,/artículo/);assert.match(section,/histórica/);assert.doesNotMatch(section,/<button/);assert.equal((section.match(/state live/g)||[]).length,1);assert.match(section,/href="juridica-registro.html"/);assert.match(html,/id="liquidaciones"/);assert.match(html,/novedades-nomina.html/);});
test('specialized navigation preserves its original gate while standard pages get one canonical gate',()=>{
 const sources=html=>[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(x=>x[1]).filter(x=>x.includes('internal-capability-gate.js'));
 for(const file of ['administracion-plataforma.html','friendly-dashboard.html']){
  const original=fs.readFileSync(file,'utf8'),built=transformFriendlyShellSource(original,file,'identity-test',globalThis.MuniControlRoutes);
  assert.deepEqual(sources(built),sources(original),file+' retains its existing specialized gate');
 }
 const basic='<!doctype html><html><head><title>MuniControl</title></head><body><aside class="sidebar"></aside><main></main></body></html>';
 const first=transformFriendlyShellSource(basic,'nomina-control.html','identity-test',globalThis.MuniControlRoutes);
 assert.deepEqual(sources(first),['/assets/internal-capability-gate.js']);
 const present=basic.replace('</head>','<script src="/assets/internal-capability-gate.js"></script></head>');
 assert.deepEqual(sources(transformFriendlyShellSource(present,'nomina-control.html','identity-test',globalThis.MuniControlRoutes)),['/assets/internal-capability-gate.js']);
});
