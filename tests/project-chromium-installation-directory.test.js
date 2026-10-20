import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProjectChromiumDirectory} from '../scripts/lib/project-chromium-installation-directory.mjs';

const evidence=path.resolve('.handoff');fs.mkdirSync(evidence,{recursive:true});
const fresh=()=>fs.mkdtempSync(path.join(evidence,'chromium-parent-unit-'));
const options=root=>({root,releaseGate:true,version:'157.0.8098.0'});

test('actual installer initializer creates a missing artifact parent before its exclusive browser directory',()=>{
 const root=fresh(),source=fs.readFileSync(new URL('../scripts/install-project-chromium.mjs',import.meta.url),'utf8');
 const start=source.indexOf('const directory = '),end=source.indexOf('\nconst archive = ',start);assert.ok(start>=0&&end>start);
 const initialize=new Function('fs','path','root','releaseGate','manifest','assert','prepareProjectChromiumDirectory',source.slice(start,end)+'\nreturn directory;');
 const result=initialize(fs,path,root,true,{version:'157.0.8098.0'},assert,prepareProjectChromiumDirectory);
 assert.equal(result,path.join(root,'verification','release-chromium-157.0.8098.0'));assert.ok(fs.statSync(result).isDirectory());
});

test('existing verification evidence is preserved and existing child installation is still refused',()=>{
 const root=fresh(),parent=path.join(root,'verification');fs.mkdirSync(parent);fs.writeFileSync(path.join(parent,'prior-proof.json'),'unchanged');
 const directory=prepareProjectChromiumDirectory(options(root));fs.writeFileSync(path.join(directory,'installation.json'),'prior browser proof');
 assert.throws(()=>prepareProjectChromiumDirectory(options(root)),error=>error.code==='EEXIST');
 assert.equal(fs.readFileSync(path.join(parent,'prior-proof.json'),'utf8'),'unchanged');assert.equal(fs.readFileSync(path.join(directory,'installation.json'),'utf8'),'prior browser proof');
});

test('diagnostic and release installations have separate exclusive directories',()=>{
 const root=fresh(),release=prepareProjectChromiumDirectory(options(root)),diagnostic=prepareProjectChromiumDirectory({...options(root),releaseGate:false});
 assert.notEqual(release,diagnostic);assert.equal(path.basename(diagnostic),'patched-chromium-157.0.8098.0');
});

test('invalid versions and mode are rejected before creating any artifact parent',()=>{
 for(const change of [{version:'../escape'},{version:'157.0/other'},{version:''},{releaseGate:'true'}]){const root=fresh();assert.throws(()=>prepareProjectChromiumDirectory({...options(root),...change}));assert.equal(fs.existsSync(path.join(root,'verification')),false);}
});
