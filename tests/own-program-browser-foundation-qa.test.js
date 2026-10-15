import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ownProgramBrowserAssets} from '../scripts/lib/own-program-browser-assets.mjs';
import {verifyOwnAgreementWorkingTime} from '../scripts/verify-own-agreement-working-time.mjs';
const bytes=s=>Buffer.from(s);
test('program browser serves the actual model and every transitive local dependency',()=>{
 const assets=ownProgramBrowserAssets(name=>fs.readFileSync(new URL('../assets/'+name,import.meta.url)));
 assert.ok(assets.has('/assets/own-agreement-working-time-program.js'));
 assert.ok(assets.has('/assets/own-payroll-exact.js'));assert.ok(assets.has('/assets/own-payroll-engine.js'));
 for(const [route,body]of assets)assert.ok(body.equals(fs.readFileSync(new URL('..'+route,import.meta.url))));
});
test('fixture graph follows static import, side effect and export dependencies once, including cycles',()=>{
 const sources={'a.js':"import {x} from './b.js';import './c.js';export {y} from './d.js';export * from './e.js';",'b.js':"import './a.js';",'c.js':'','d.js':'','e.js':''},reads=[];
 const assets=ownProgramBrowserAssets(name=>{reads.push(name);return bytes(sources[name]);},['a.js']);
 assert.deepEqual([...assets.keys()].sort(),Object.keys(sources).map(n=>'/assets/'+n).sort());assert.equal(reads.length,5);
});
test('fixture graph rejects unavailable, external, nested and dynamic imports before launch',()=>{
 for(const source of["import './missing.js';","import '../private.js';","import 'node:fs';","import './folder/a.js';","const x=import('./a.js');"]){
  assert.throws(()=>ownProgramBrowserAssets(name=>{assert.equal(name,'a.js');return bytes(source);},['a.js']));
 }
 assert.throws(()=>ownProgramBrowserAssets(()=>bytes(''),['../private.js']));
});
test('complete hours QA refuses an omitted browser and requires full prerequisite coverage',async()=>{
 for(const browser of[undefined,'none'])await assert.rejects(verifyOwnAgreementWorkingTime({browser}),/AGREEMENT_COMPLETE_FOUNDATION_BROWSER_REQUIRED/);
 const source=fs.readFileSync(new URL('../scripts/verify-own-agreement-working-time.mjs',import.meta.url),'utf8');
 assert.match(source,/runOwnPeriodClassificationQa\(h,\{browser:options\.browser,/);assert.match(source,/assert\.equal\(classification\.ok,true\)/);
});
