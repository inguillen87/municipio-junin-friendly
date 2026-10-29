// PROPOSED by Claude (R5; source only; not run by Claude). Target: tests/own-payroll-zero-difference-build.test.js
// Replaces the R3 version: no skip. The package closure is verified statically over the real sources (npm test runs
// before the build, so no public/ is needed), the verifier is regressed with synthetic packages, and the packager is
// required to call the verifier after copying (scripts/build-friendly.mjs), which is what guards the built artifact.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {ownPayrollPackageClosure,assertOwnPayrollPackagedBytes,assertOwnPayrollPackageClosure,ownPayrollStaticImports,OWN_PAYROLL_PACKAGE_ROOTS} from '../scripts/lib/own-payroll-package-closure.mjs';
const root=new URL('../',import.meta.url),read=file=>existsSync(new URL(file,root))?readFileSync(new URL(file,root)):null;
const build=read('scripts/build-friendly.mjs').toString('utf8');
const shellFiles=(()=>{const m=build.match(/const shellFiles = \[([\s\S]*?)\n\];/);assert.ok(m,'shellFiles list');return [...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);})();

test('cierre estático real: todo import alcanzable desde el panel de corrida está en shellFiles, el asset nuevo incluido y una sola vez',()=>{
 const closure=ownPayrollPackageClosure({shellFiles,readSource:read});
 assert.deepEqual(closure.roots,[...OWN_PAYROLL_PACKAGE_ROOTS]);assert.ok(closure.count>=19,'panel plus its direct imports at least');
 assert.ok(closure.closure.includes('assets/own-payroll-zero-difference.js')&&closure.closure.includes('assets/own-payroll-exact.js')&&closure.closure.includes('assets/native-salary-catalog-model.js'));
 assert.ok(closure.closure.includes('assets/own-payroll-monetary-policy.js'),'reached only through the multi-line import of own-payroll-monetary-manifest.js');
 assert.equal(shellFiles.filter(f=>f==='assets/own-payroll-zero-difference.js').length,1);
 assert.equal(shellFiles[shellFiles.indexOf('assets/own-payroll-zero-difference.js')-1],'assets/own-payroll-run-date.js','listed with the run panel family');
 assert.ok(ownPayrollStaticImports(read('assets/own-payroll-run-panel.js').toString('utf8')).includes('./own-payroll-zero-difference.js'));
});

test('P1 con las fuentes reales: el import multilínea de own-payroll-monetary-manifest.js entra en el cierre; quitar o alterar own-payroll-monetary-policy.js falla',()=>{
 const policy='assets/own-payroll-monetary-policy.js',manifest='assets/own-payroll-monetary-manifest.js';
 const manifestSource=read(manifest).toString('utf8');assert.ok(/^import \{\n[\s\S]*?\n\} from '\.\/own-payroll-monetary-policy\.js';/m.test(manifestSource),'the real multi-line import is still there');
 assert.ok(ownPayrollStaticImports(manifestSource).includes('./own-payroll-monetary-policy.js'));
 const closure=ownPayrollPackageClosure({shellFiles,readSource:read});
 assert.ok(closure.closure.includes(policy)&&closure.closure.includes(manifest),'policy reached from the panel through the manifest');
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:shellFiles.filter(f=>f!==policy),readSource:read}),e=>e.message==='PACKAGE_CLOSURE_MISSING:'+policy);
 assert.throws(()=>assertOwnPayrollPackagedBytes({closure,readSource:read,readPackaged:file=>file===policy?null:read(file)}),e=>e.message==='PACKAGE_BYTES_MISSING:'+policy);
 assert.throws(()=>assertOwnPayrollPackagedBytes({closure,readSource:read,readPackaged:file=>file===policy?Buffer.concat([read(file),Buffer.from('\n')]):read(file)}),e=>e.message==='PACKAGE_BYTES_CHANGED:'+policy);
 assert.throws(()=>assertOwnPayrollPackagedBytes({closure,readSource:read,readPackaged:file=>{if(file!==policy)return read(file);const b=Buffer.from(read(file));b[0]^=1;return b;}}),e=>e.message==='PACKAGE_BYTES_CHANGED:'+policy);
 assert.equal(assertOwnPayrollPackagedBytes({closure,readSource:read,readPackaged:read}).verified,closure.count);
});

test('formas estáticas: multilínea, dos sentencias en la misma línea, export * as, default + named, comentario de bloque, import() y strings ignorados',()=>{
 const multi="import {\n OWN_A, verifyB, hashC,\n structureD,beginE,\n} from './policy.js';\nimport x from './x.js';import {y} from './y.js';\nexport * as ns from './ns.js';\nimport d, {n} from './dn.js';\nimport e, * as all from './ea.js';\nimport * as whole from './whole.js';\nexport {q} from './q.js';\nimport './side.js';\n/* import {old} from './old.js'; */\n// import {dead} from './dead.js';\nconst s=\"import z from './string.js'\";\nconst t=import('./dynamic.js');\n";
 assert.deepEqual(ownPayrollStaticImports(multi),['./policy.js','./x.js','./y.js','./ns.js','./dn.js','./ea.js','./whole.js','./q.js','./side.js']);
 const sources={'assets/a.js':multi,'assets/policy.js':'','assets/x.js':'','assets/y.js':'','assets/ns.js':'','assets/dn.js':'','assets/ea.js':'','assets/whole.js':'','assets/q.js':'','assets/side.js':''};
 const readSource=file=>Object.hasOwn(sources,file)?sources[file]:null,all=Object.keys(sources);
 assert.equal(ownPayrollPackageClosure({shellFiles:all,readSource,roots:['assets/a.js']}).count,10);
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:all.filter(f=>f!=='assets/policy.js'),readSource,roots:['assets/a.js']}),e=>e.message==='PACKAGE_CLOSURE_MISSING:assets/policy.js');
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:all.filter(f=>f!=='assets/y.js'),readSource,roots:['assets/a.js']}),e=>e.message==='PACKAGE_CLOSURE_MISSING:assets/y.js','second statement on the same line');
});

test('regresiones del verificador: import no empaquetado, fuente ausente, salida fuera de assets, duplicados',()=>{
 const sources={'assets/a.js':"import {x} from './b.js';\nimport './c.js';\nexport {y} from './d.js';\n",'assets/b.js':'export const x=1;\n','assets/c.js':'','assets/d.js':"export const y=2;\nimport {z} from './sub/e.js';\n",'assets/sub/e.js':"import {x} from '../b.js';\nexport const z=3;\n"};
 const readSource=file=>Object.hasOwn(sources,file)?sources[file]:null,all=Object.keys(sources);
 const ok=ownPayrollPackageClosure({shellFiles:[...all,'other.html'],readSource,roots:['assets/a.js']});
 assert.deepEqual(ok.closure,all.sort());assert.equal(ok.count,5);
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:all.filter(f=>f!=='assets/sub/e.js'&&f!=='assets/c.js'),readSource,roots:['assets/a.js']}),e=>e.code==='PACKAGE_CLOSURE_MISSING'&&e.message==='PACKAGE_CLOSURE_MISSING:assets/c.js,assets/sub/e.js');
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:all,readSource:file=>file==='assets/d.js'?null:readSource(file),roots:['assets/a.js']}),e=>e.code==='PACKAGE_SOURCE_MISSING');
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:all,readSource:file=>file==='assets/b.js'?"import '../lib/x.js';":readSource(file),roots:['assets/a.js']}),e=>e.code==='PACKAGE_CLOSURE_OUTSIDE');
 assert.throws(()=>ownPayrollPackageClosure({shellFiles:[...all,'assets/a.js'],readSource,roots:['assets/a.js']}),/PACKAGE_SHELL_FILES_DUPLICATED/);
 assert.deepEqual(ownPayrollStaticImports("import a from './a.js'\nconst s=\"import './not.js'\";\nimport('./dynamic.js');\nexport * from './e.js';"),['./a.js','./e.js']);
 assert.deepEqual(ownPayrollStaticImports("export const from='x';\nexport function f(){return 1}\nexport {a,b};\n"),[]);
});

test('regresiones del artefacto: bytes faltantes o distintos en el paquete fallan; iguales pasan',()=>{
 const sources={'assets/a.js':"import {x} from './b.js';\n",'assets/b.js':'export const x=1;\n'};
 const readSource=file=>sources[file]??null,closure=ownPayrollPackageClosure({shellFiles:Object.keys(sources),readSource,roots:['assets/a.js']});
 assert.equal(assertOwnPayrollPackagedBytes({closure,readSource,readPackaged:readSource}).verified,2);
 assert.throws(()=>assertOwnPayrollPackagedBytes({closure,readSource,readPackaged:file=>file==='assets/b.js'?null:readSource(file)}),e=>e.message==='PACKAGE_BYTES_MISSING:assets/b.js');
 assert.throws(()=>assertOwnPayrollPackagedBytes({closure,readSource,readPackaged:file=>file==='assets/b.js'?'export const x=2;\n':readSource(file)}),e=>e.message==='PACKAGE_BYTES_CHANGED:assets/b.js');
 assert.throws(()=>assertOwnPayrollPackagedBytes({closure,readSource,readPackaged:file=>Buffer.from(readSource(file)+'\r\n')}),e=>e.code==='PACKAGE_BYTES_CHANGED');
 const combined=assertOwnPayrollPackageClosure({shellFiles:Object.keys(sources),readSource,readPackaged:readSource,roots:['assets/a.js']});
 assert.equal(combined.packaged.verified,2);assert.deepEqual(combined.closure,['assets/a.js','assets/b.js']);
});

test('empaquetador: llama al verificador después de copiar shellFiles y vendor, antes de transformar páginas',()=>{
 assert.ok(build.includes("import { assertOwnPayrollPackageClosure } from './lib/own-payroll-package-closure.mjs';"));
 const call="assertOwnPayrollPackageClosure({ shellFiles, readSource: file => fs.readFileSync(path.join(root, file)), readPackaged: file => fs.existsSync(path.join(output, file)) ? fs.readFileSync(path.join(output, file)) : null });";
 assert.equal(build.split(call).length,2,'exactly one mandatory call');
 const copyLoop=build.indexOf('for (const file of vendorFiles) {'),callAt=build.indexOf(call),transform=build.indexOf('// Restore the verified identity');
 assert.ok(copyLoop>0&&copyLoop<callAt&&callAt<transform,'after the copies, before the shell transformation');
 assert.ok(existsSync(new URL('scripts/lib/own-payroll-package-closure.mjs',root)),'the verifier module ships with the packager');
});
