// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {safeEntry,verifyEntries,assertReleasePin,RELEASE_COMMIT,RELEASE_CONTENT_SHA256} from '../scripts/build-clock-windows-installer.mjs';
import {RELEASE_FILES} from '../scripts/build-municipal-clock-release.mjs';
import {guideHtml} from '../scripts/build-clock-windows11-kit.mjs';
const bytes=Buffer.from('verified source');
const good={path:'app/clock-fleet/gateway.mjs',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
const hash=value=>createHash('sha256').update(value).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));
let releaseFixture;
function pinnedReleaseFixture(){
 if(!releaseFixture){
  const planned=Object.entries(RELEASE_FILES).flatMap(([family,names])=>names.map(name=>({source:`local-agents/${family}/${name}`,target:`app/${family}/${name}`})));
  planned.push({source:'scripts/verify-municipal-clock-release.mjs',target:'verify-release.mjs'});
  const files=planned.sort((a,b)=>a.target.localeCompare(b.target,'en')).map(item=>{
   const data=execFileSync('git',['show',`${RELEASE_COMMIT}:${item.source}`],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024});
   return {path:item.target,bytes:data.length,sha256:hash(data)};
  });
  releaseFixture={schema:'municipal-clock-release.v1',sourceCommit:RELEASE_COMMIT,sourceDirty:false,contentSha256:hash(JSON.stringify(files)),runtimeIncluded:false,credentialsIncluded:false,municipalRecordsIncluded:false,files};
 }
 return structuredClone(releaseFixture);
}
test('installer refuses paths that escape, alias Windows devices or hide alternate streams',()=>{
 for(const value of ['../state/token','/absolute','C:/temp/token','app\\..\\file','app//file','app/./file','app/../file','app/a:stream','app/NUL.txt','app/COM1','app/LPT9.log','app/file.','app/secret '])assert.equal(safeEntry(value),false,value);
 assert.equal(safeEntry('app/clock-fleet/gateway.mjs'),true);
});
test('payload manifest checks bytes, hash, duplicate names and unexpected content',()=>{
 assert.doesNotThrow(()=>verifyEntries({[good.path]:bytes},[good]));
 assert.throws(()=>verifyEntries({[good.path]:Buffer.from('tampered source')},[good]),/CONTENT_MISMATCH/);
 assert.throws(()=>verifyEntries({[good.path]:bytes,'secrets/token':bytes},[good]),/EXTRA_FILE/);
 assert.throws(()=>verifyEntries({[good.path]:bytes},[good,{...good,path:good.path.toUpperCase()}]),/MANIFEST_INVALID/);
 assert.throws(()=>verifyEntries({[good.path]:bytes},[{...good,bytes:-1}]),/MANIFEST_INVALID/);
 assert.throws(()=>verifyEntries({[good.path]:bytes},[{...good,path:'../token'}]),/MANIFEST_INVALID/);
});

test('installer brand resource is a real 192px PNG and the release includes the reader GPL notice',()=>{
 const png=readFileSync(new URL('../assets/pwa/icon-192.png',import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.subarray(12,16).toString('ascii'),'IHDR');
 assert.equal(png.readUInt32BE(16),192);assert.equal(png.readUInt32BE(20),192);
 assert.ok(RELEASE_FILES.pm10.includes('LICENSE'),'app/pm10/LICENSE must remain in the source release');
 const license=readFileSync(new URL('../local-agents/pm10/LICENSE',import.meta.url),'utf8');
 assert.match(license,/GNU GENERAL PUBLIC LICENSE/);assert.match(license,/Version 2, June 1991/);
 assert.ok(RELEASE_FILES.pm10.includes('reader/REFERENCIAS.md'),'reader attribution must accompany its license');
});

test('release pin accepts the exact committed source bytes without trusting checkout line endings',()=>{
 const manifest=pinnedReleaseFixture();
 assert.equal(manifest.sourceCommit,'8c875b4999e807968b2070672b1ad8eea203fd9a');
 assert.equal(manifest.contentSha256,RELEASE_CONTENT_SHA256);
 assert.doesNotThrow(()=>assertReleasePin(manifest));
});

test('installer workflow builds the exact unified runtime pin on its release branch',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/clock-windows-installer.yml',import.meta.url),'utf8');
 assert.equal(workflow.match(/git worktree add \$sourceKit ([a-f0-9]{40})/)?.[1],RELEASE_COMMIT);
 assert.match(workflow,/branches: \[[^\n]*internal-clock-linux-service-20260923/);
 assert.match(workflow,/fetch-depth: 0/);
 assert.match(workflow,/installer-rebuilt-self-test\.json/);
 assert.match(workflow,/COMPILAR-FUENTES\.cmd/);
 const manifest=pinnedReleaseFixture();
 assert.equal(manifest.files.length,29);
 for(const family of ['pm10','clock-fleet']) {
  assert.ok(manifest.files.some(file=>file.path.startsWith(`app/${family}/`)));
 }
 for(const name of ['gateway.mjs','gateway-config.mjs','overview.mjs','control.mjs']) {
  assert.ok(manifest.files.some(file=>file.path===`app/clock-fleet/${name}`));
 }
});

test('installer generates its guide through the explicit runtime-included variant',()=>{
 const builder=readFileSync(new URL('../scripts/build-clock-windows-installer.mjs',import.meta.url),'utf8');
 assert.match(builder,/guideHtml\(guide,\{installer:true\}\)/);
 assert.doesNotMatch(builder,/guideHtml\(guide\)\.replace/);
 const readme=readFileSync(new URL('../docs/clock-windows-installer/README.md',import.meta.url),'utf8');
 const html=guideHtml(readme,{installer:true});
 assert.match(html,/<title>MuniControl · Asistente de dispositivos<\/title>/);
 assert.match(html,/Incluye Node\.js oficial/);
 assert.match(html,/PM-10 · Edificio Viejo integra el mismo parque y panel/);
 assert.doesNotMatch(html,/No incluye claves, datos de fichadas ni Node\.js|Instalar cinco relojes/);
});

test('release pin rejects a modified source even after its manifest hashes are recomputed',()=>{
 const manifest=pinnedReleaseFixture(),entry=manifest.files.find(f=>f.path==='app/clock-fleet/source-delivery.mjs');
 const changed=Buffer.from('synthetic altered receiver; not deployed');
 entry.bytes=changed.length;entry.sha256=hash(changed);
 manifest.contentSha256=hash(JSON.stringify(manifest.files));
 assert.throws(()=>assertReleasePin(manifest),/INSTALLER_RELEASE_PIN_MISMATCH/);
 // Keeping the trusted outer digest cannot hide a modified inner file list.
 manifest.contentSha256=RELEASE_CONTENT_SHA256;
 assert.throws(()=>assertReleasePin(manifest),/INSTALLER_RELEASE_PIN_MISMATCH/);
});

test('release pin rejects changed provenance, omitted license and injected private content',()=>{
 const mutations=[m=>m.sourceCommit='f'.repeat(40),m=>m.sourceDirty=true,m=>m.sourceDirty='false',m=>delete m.sourceDirty,
  m=>{m.files=m.files.filter(f=>f.path!=='app/pm10/LICENSE');m.contentSha256=hash(JSON.stringify(m.files));},
  m=>{m.files.push({path:'app/clock-fleet/private-token.json',bytes:bytes.length,sha256:hash(bytes)});m.contentSha256=hash(JSON.stringify(m.files));}];
 for(const mutate of mutations){const manifest=pinnedReleaseFixture();mutate(manifest);assert.throws(()=>assertReleasePin(manifest),/INSTALLER_RELEASE_PIN_MISMATCH/);}
});

test('valid source hashes cannot smuggle extra manifest fields or change package privacy declarations',()=>{
 const mutations=[m=>m.privateCredential='SYNTHETIC_DO_NOT_PACKAGE',m=>m.schema='different.v1',m=>delete m.schema,
  m=>m.runtimeIncluded=true,m=>m.credentialsIncluded=true,m=>m.municipalRecordsIncluded=true,m=>m.credentialsIncluded='false'];
 for(const mutate of mutations){const manifest=pinnedReleaseFixture();mutate(manifest);assert.throws(()=>assertReleasePin(manifest),/INSTALLER_RELEASE_PIN_MISMATCH/);}
 assert.throws(()=>assertReleasePin(null),/INSTALLER_RELEASE_PIN_MISMATCH/);
});
