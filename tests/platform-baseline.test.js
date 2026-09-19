import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyPlatformBaseline} from '../scripts/verify-platform-baseline.mjs';
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(fs.readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const pinnedNode=fs.readFileSync(new URL('../.nvmrc',import.meta.url),'utf8').trim();
const input=()=>({pkg:structuredClone(pkg),lock:structuredClone(lock),pinnedNode,nodeVersion:'v24.21.0'});
test('checked-in platform is stable, exact, integrity-pinned and reproducible',()=>{
  const r=verifyPlatformBaseline(input());assert.deepEqual(r.findings,[]);assert.equal(r.ok,true);
  assert.equal(r.checkedDependencies,11);assert.equal(r.networkRequests,0);assert.equal(r.databaseWrites,0);
});
test('unsupported and prerelease runtimes fail closed',()=>{
  for(const nodeVersion of ['v20.20.0','v22.22.0','v26.9.0','v24.21.0-rc.1','latest',null,24])
    assert.equal(verifyPlatformBaseline({...input(),nodeVersion}).ok,false);
});
test('a newer stable patch in the approved Node major remains supported',()=>{
  assert.equal(verifyPlatformBaseline({...input(),nodeVersion:'v24.22.0'}).ok,true);
});
test('missing or broad engine selection is rejected',()=>{
  for(const engines of [undefined,{node:'>=24'},{node:'*'},{node:'26.x'}]) {
    const x=input();x.pkg.engines=engines;assert.equal(verifyPlatformBaseline(x).ok,false);
  }
});
test('dependency tags, ranges, git URLs and prereleases are rejected',()=>{
  for(const version of ['latest','^19.3.0','~19.3.0','19.3.0-rc.1','git+https://example.test/package']) {
    const x=input();x.pkg.dependencies.react=version;assert.equal(verifyPlatformBaseline(x).ok,false);
  }
});
test('lockfile drift, missing integrity and non-registry sources are rejected',()=>{
  for(const change of [{version:'19.2.8'},{integrity:''},{resolved:'https://example.test/react.tgz'}]) {
    const x=input();Object.assign(x.lock.packages['node_modules/react'],change);assert.equal(verifyPlatformBaseline(x).ok,false);
  }
  const x=input();x.lock.packages[''].dependencies.react='19.2.8';assert.equal(verifyPlatformBaseline(x).ok,false);
});
test('React and React DOM cannot diverge',()=>{
  const x=input();x.pkg.dependencies['react-dom']='19.2.8';assert.ok(verifyPlatformBaseline(x).findings.includes('REACT_PAIR_MISMATCH'));
});
test('invalid manifest shapes and pins do not pass',()=>{
  for(const pinnedNode of ['24','26.0.0','24.21.0-beta.1',null]) assert.equal(verifyPlatformBaseline({...input(),pinnedNode}).ok,false);
  const x=input();x.pkg.dependencies=[];x.lock.lockfileVersion=2;assert.equal(verifyPlatformBaseline(x).ok,false);
});
test('CI uses the same Node pin and immutable checkout/setup-node revisions',()=>{
  const root=new URL('../.github/workflows/',import.meta.url);
  for(const name of fs.readdirSync(root).filter(x=>x.endsWith('.yml'))) {
    const text=fs.readFileSync(new URL(name,root),'utf8');
    assert.doesNotMatch(text,/node-version:/,name);
    for(const line of text.split('\n').filter(x=>/uses: actions\/(checkout|setup-node)@/.test(x)))
      assert.match(line,/@[a-f0-9]{40}\s+# v7\./,name);
    if(text.includes('actions/setup-node@')) assert.match(text,/node-version-file: \.nvmrc/,name);
  }
});
test('maintenance proposals are grouped and bounded instead of automatically merged',()=>{
  const text=fs.readFileSync(new URL('../.github/dependabot.yml',import.meta.url),'utf8');
  assert.equal((text.match(/interval: monthly/g)||[]).length,2);
  assert.equal((text.match(/open-pull-requests-limit: 1/g)||[]).length,2);
  assert.match(text,/applies-to: security-updates/);assert.match(text,/update-types: \[minor, patch\]/);
  assert.equal(fs.readFileSync(new URL('../.npmrc',import.meta.url),'utf8').trim(),'save-exact=true');
});
