// PROPOSED by Claude (R5; source only; never imported or run by Claude). Target: scripts/lib/own-payroll-package-closure.mjs
// Pure package-closure verifier for the friendly shell. The packager (scripts/build-friendly.mjs) copies a CLOSED
// shellFiles list into public/; a static import that is not on that list ships a page that breaks at runtime.
// This module (1) computes the static-import closure of the run panel over assets/ and requires every member to be
// listed, and (2) after the copy, requires every member to exist in the package byte for byte. No filesystem here:
// the caller injects readers, so the same checks run in the packager and in pure regression tests.
import assert from 'node:assert/strict';
export const OWN_PAYROLL_PACKAGE_ROOTS=Object.freeze(['assets/own-payroll-run-panel.js']);
// Static ESM forms actually present in assets/: `import x from`, `import {a,\n b} from` (multi-line braces),
// `import x, {a} from`, `import * as ns from`, `import x, * as ns from`, `export {a} from`, `export * from`,
// `export * as ns from`, side-effect `import './x.js'`; a second statement on the same line after `;`. Dynamic
// `import()` and strings are not statements. Block comments are removed first; a `//` line never starts a statement.
const CLAUSE=String.raw`(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\}|[\w$]+\s*(?:,\s*(?:\{[^}]*\}|\*\s*as\s+[\w$]+)\s*)?)`;
const STATIC_FROM=new RegExp(String.raw`(?:^|;)[ \t]*(?:import|export)\s*`+CLAUSE+String.raw`\s*from\s*['"](\.\.?\/[^'"]+)['"]`,'gm');
const STATIC_SIDE=/(?:^|;)[ \t]*import\s*['"](\.\.?\/[^'"]+)['"]/gm;
const BLOCK_COMMENT=/\/\*[\s\S]*?\*\//g;
const fail=(code,detail)=>{throw Object.assign(new Error(detail?code+':'+detail:code),{code});};
const dirname=file=>file.includes('/')?file.slice(0,file.lastIndexOf('/')):'';
function resolve(from,specifier){
 const parts=(dirname(from)+'/'+specifier).split('/').filter(part=>part!==''&&part!=='.'),out=[];
 for(const part of parts){if(part==='..'){if(!out.length)fail('PACKAGE_CLOSURE_OUTSIDE',from+' -> '+specifier);out.pop();}else out.push(part);}
 return out.join('/');
}
/** Static relative imports of one source text (statements, not strings), in source order; multi-line forms included. */
export function ownPayrollStaticImports(source){
 assert.equal(typeof source,'string');const text=source.replace(BLOCK_COMMENT,''),found=[];
 for(const match of text.matchAll(STATIC_FROM))found.push([match.index,match[1]]);
 for(const match of text.matchAll(STATIC_SIDE))found.push([match.index,match[1]]);
 return found.sort((a,b)=>a[0]-b[0]).map(([,specifier])=>specifier);
}
/**
 * Closure of the roots over assets/, every member required in shellFiles. readSource(file) returns a string or
 * Buffer, or null when the file does not exist. Throws PACKAGE_CLOSURE_MISSING / PACKAGE_SOURCE_MISSING.
 */
export function ownPayrollPackageClosure({shellFiles,readSource,roots=OWN_PAYROLL_PACKAGE_ROOTS}={}){
 assert.ok(Array.isArray(shellFiles)&&shellFiles.every(file=>typeof file==='string'),'PACKAGE_SHELL_FILES_REQUIRED');assert.equal(typeof readSource,'function');
 const listed=new Set(shellFiles);assert.equal(listed.size,shellFiles.length,'PACKAGE_SHELL_FILES_DUPLICATED');
 const seen=new Set(),queue=[...roots],missing=[];
 while(queue.length){
  const file=queue.shift();if(seen.has(file))continue;seen.add(file);
  if(!listed.has(file))missing.push(file);
  const source=readSource(file);if(source===null||source===undefined)fail('PACKAGE_SOURCE_MISSING',file);
  for(const specifier of ownPayrollStaticImports(Buffer.isBuffer(source)?source.toString('utf8'):source)){
   const dep=resolve(file,specifier);if(!dep.startsWith('assets/'))fail('PACKAGE_CLOSURE_OUTSIDE',file+' -> '+dep);
   queue.push(dep);
  }
 }
 if(missing.length)fail('PACKAGE_CLOSURE_MISSING',missing.sort().join(','));
 return Object.freeze({version:'own-payroll-package-closure.v1',roots:[...roots],closure:Object.freeze([...seen].sort()),count:seen.size});
}
/** After the copy: every closure member must exist in the package with exactly the source bytes. */
export function assertOwnPayrollPackagedBytes({closure,readSource,readPackaged}={}){
 assert.ok(closure&&Array.isArray(closure.closure)&&closure.closure.length>0,'PACKAGE_CLOSURE_REQUIRED');assert.equal(typeof readSource,'function');assert.equal(typeof readPackaged,'function');
 const toBuffer=value=>value===null||value===undefined?null:Buffer.isBuffer(value)?value:Buffer.from(String(value),'utf8');
 for(const file of closure.closure){
  const source=toBuffer(readSource(file)),packaged=toBuffer(readPackaged(file));
  if(source===null)fail('PACKAGE_SOURCE_MISSING',file);if(packaged===null)fail('PACKAGE_BYTES_MISSING',file);
  if(!source.equals(packaged))fail('PACKAGE_BYTES_CHANGED',file);
 }
 return Object.freeze({version:'own-payroll-packaged-bytes.v1',verified:closure.closure.length});
}
/** One call for the packager: closure against shellFiles, then packaged bytes. Throws on the first defect. */
export function assertOwnPayrollPackageClosure({shellFiles,readSource,readPackaged,roots}={}){
 const closure=ownPayrollPackageClosure({shellFiles,readSource,roots});
 return Object.freeze({...closure,packaged:assertOwnPayrollPackagedBytes({closure,readSource,readPackaged})});
}
