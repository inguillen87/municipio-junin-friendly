import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {build} from 'esbuild';
import {publicBuildResolution} from '../scripts/lib/public-build-resolution.mjs';
const normalize=p=>p.replaceAll('\\','/');
async function compile(root,options=publicBuildResolution){return build({absWorkingDir:root,entryPoints:{test:'src/entry.js'},outdir:path.join(root,'out'),entryNames:'[name]-[hash]',bundle:true,minify:true,format:'esm',platform:'browser',target:['es2020'],metafile:true,write:false,legalComments:'linked',...options});}
function emitted(result){return result.outputFiles.map(f=>({name:path.basename(f.path),text:f.text})).sort((a,b)=>a.name.localeCompare(b.name));}
test('symlinked and direct dependency layouts emit identical code, names and notices',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'municontrol-build-'));
 try{
  const direct=path.join(base,'direct'),linked=path.join(base,'linked');
  for(const root of [direct,linked]){await fs.mkdir(path.join(root,'src'),{recursive:true});await fs.writeFile(path.join(root,'src/entry.js'),"import helper from 'qa-helper'; export const calculate = value => helper(value);\n");}
  const dependency=path.join(direct,'node_modules','qa-helper');await fs.mkdir(dependency,{recursive:true});
  await fs.writeFile(path.join(dependency,'package.json'),JSON.stringify({name:'qa-helper',version:'1.0.0',main:'index.js'}));
  await fs.writeFile(path.join(dependency,'index.js'),'/*! Test fixture license, not municipal code. */\nmodule.exports=function(value){return Number(value)+1};\n');
  await fs.symlink(path.join(direct,'node_modules'),path.join(linked,'node_modules'),process.platform==='win32'?'junction':'dir');
  const a=await compile(direct),b=await compile(linked);assert.deepEqual(emitted(a),emitted(b));
  assert.deepEqual(Object.keys(a.metafile.inputs).map(normalize).sort(),Object.keys(b.metafile.inputs).map(normalize).sort());
  assert.ok(Object.keys(b.metafile.inputs).every(p=>!normalize(p).startsWith('../')));
  const legacy=await compile(linked,{preserveSymlinks:false});assert.ok(Object.keys(legacy.metafile.inputs).some(p=>normalize(p).startsWith('../direct/')),'Control must reproduce physical-path leakage');
 }finally{await fs.rm(base,{recursive:true,force:true});}
});
test('all four public React builds use the same resolution policy without weakening budgets',async()=>{
 assert.deepEqual(publicBuildResolution,{preserveSymlinks:true});assert.ok(Object.isFrozen(publicBuildResolution));
 for(const [file,count] of [['scripts/build-legal-registry.mjs',1],['scripts/build-payroll-parameters.mjs',1],['scripts/build-react-islands.mjs',2]]){
  const code=await fs.readFile(file,'utf8');assert.equal(code.split('await build({ ...publicBuildResolution,').length-1,count);
  assert.ok(code.includes('legalComments:'));assert.ok(code.includes('sourcemap: false')||code.includes('sourcemap:false'));
  assert.ok(code.includes('gzip'));assert.ok(code.includes('assert.ok'));
 }
});
