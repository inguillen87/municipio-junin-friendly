// Proposed own-ART CI pilot. Builtins plus the existing pure release contract.
// This file is source only until root reviews and applies it at its canonical path.
// Job success comes from needs.tested-build.result, never a field in this manifest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {verifyRelease} from '../assets/release-status-model.js';

const VERSION='own-art-tested-public.v1',HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const MANIFEST='build-custody.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const exact=(v,keys,code)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v),code);assert.deepEqual(Object.keys(v).sort(),[...keys].sort(),code);};
const canonical=f=>typeof f==='string'&&f.length>0&&!f.startsWith('/')&&!/[\u0000-\u001f\u007f\\:]/.test(f)&&f.split('/').every(v=>v!==''&&v!=='.'&&v!=='..');
const directory=p=>{const s=fs.lstatSync(p);assert.ok(s.isDirectory()&&!s.isSymbolicLink(),'ART_BUILD_DIRECTORY');};
const fingerprint=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join('|');
function readStable(p,{singleLink=true}={}){
 const before=fs.lstatSync(p,{bigint:true});assert.ok(before.isFile()&&!before.isSymbolicLink()&&(!singleLink||before.nlink===1n),'ART_BUILD_REGULAR_SINGLE_LINK');
 const bytes=fs.readFileSync(p),after=fs.lstatSync(p,{bigint:true});assert.equal(fingerprint(after),fingerprint(before),'ART_BUILD_CHANGED_DURING_READ');return bytes;
}
function scan(root){
 directory(root);const files=[];
 const walk=(dir,rel)=>{for(const name of fs.readdirSync(dir).sort()){
  const file=rel?rel+'/'+name:name;assert.ok(canonical(file),'ART_BUILD_PATH');const absolute=path.join(root,...file.split('/')),s=fs.lstatSync(absolute);
  assert.ok(!s.isSymbolicLink(),'ART_BUILD_SYMLINK');
  if(s.isDirectory())walk(absolute,file);else{assert.ok(s.isFile()&&s.nlink===1,'ART_BUILD_REGULAR_SINGLE_LINK');const b=readStable(absolute);files.push({file,byteLength:b.length,sha256:sha(b)});}
 }};walk(root,'');return files.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
}
function releaseIn(root,identity){
 const value=verifyRelease(JSON.parse(readStable(path.join(root,'release-info.json')).toString('utf8')));
 assert.equal(value.sourceState,'committed','ART_BUILD_RELEASE_NOT_COMMITTED');assert.equal(value.commitSha,identity.checkoutSha,'ART_BUILD_RELEASE_SHA');
}
export function assertOwnArtBuildEnvironment(env){
 // Refuse, rather than silently clear, any ambient database-dependent build scope.
 const forbidden=Object.keys(env).filter(k=>/^NODE_(OPTIONS|PATH|COMPILE_CACHE)$|^PG[A-Z0-9_]*$|DATABASE_URL|^NEON_|^ACTIONS_DATABASE_URL$|^MC_EMAIL_FACTOR_PROVISION_EVENT$|^FRIENDLY_AGGREGATE_(AUGUST|S11)_DIR$/.test(k));
 assert.equal(forbidden.length,0,'ART_BUILD_AMBIENT_DB_OR_PRIVATE_INPUT');
}
export function ownArtBuildIdentity(root,env=process.env){
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true}).trim();
 const checkoutSha=git(['rev-parse','HEAD']),treeSha=git(['rev-parse','HEAD^{tree}']);
 assert.ok(COMMIT.test(checkoutSha)&&COMMIT.test(treeSha),'ART_BUILD_GIT_IDENTITY');assert.equal(checkoutSha,env.GITHUB_SHA,'ART_BUILD_CHECKOUT_SHA');
 assert.equal(git(['status','--porcelain=v1','--untracked-files=no']),'','ART_BUILD_TRACKED_SOURCE_CHANGED');
 assert.equal(env.GITHUB_REPOSITORY,'inguillen87/municipio-junin-friendly','ART_BUILD_REPOSITORY');
 assert.ok(['pull_request','push'].includes(env.GITHUB_EVENT_NAME),'ART_BUILD_EVENT');
 assert.ok(COMMIT.test(env.ART_PR_HEAD_SHA??''),'ART_BUILD_PR_HEAD');
 if(env.GITHUB_EVENT_NAME==='push')assert.equal(env.ART_PR_HEAD_SHA,checkoutSha,'ART_BUILD_PUSH_HEAD');
 for(const k of ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'])assert.match(env[k]??'',/^[1-9][0-9]*$/,'ART_BUILD_RUN_ID');
 return {checkoutSha,treeSha,prHeadSha:env.ART_PR_HEAD_SHA,eventName:env.GITHUB_EVENT_NAME,ref:env.GITHUB_REF,
  repository:env.GITHUB_REPOSITORY,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
  lockSha256:sha(readStable(path.join(root,'package-lock.json'))),packageSha256:sha(readStable(path.join(root,'package.json'))),
  helperSha256:sha(readStable(path.join(root,'scripts/own-art-tested-build.mjs'))),workflowSha256:sha(readStable(path.join(root,'.github/workflows/own-art.yml'))),
  nodeVersion:process.version,nodeBinarySha256:sha(readStable(process.execPath,{singleLink:false})),npmVersion:execFileSync('npm',['--version'],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true}).trim(),platform:process.platform,arch:process.arch};
}
export function createOwnArtBuildEnvelope({root,envelope,identity}){
 const source=path.join(root,'public');assert.ok(!fs.existsSync(envelope),'ART_BUILD_ENVELOPE_EXISTS');releaseIn(source,identity);
 const files=scan(source);assert.ok(files.length>0,'ART_BUILD_EMPTY');fs.mkdirSync(path.join(envelope,'public'),{recursive:true});
 for(const pin of files){const bytes=readStable(path.join(source,...pin.file.split('/')));assert.equal(bytes.length,pin.byteLength);assert.equal(sha(bytes),pin.sha256,'ART_BUILD_COPY_CHANGED');
  const to=path.join(envelope,'public',...pin.file.split('/'));fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{flag:'wx',mode:0o644});}
 assert.deepEqual(scan(source),files,'ART_BUILD_SOURCE_BOOKEND');assert.deepEqual(scan(path.join(envelope,'public')),files,'ART_BUILD_TRANSFER_BOOKEND');
 const manifest={version:VERSION,identity,files},bytes=Buffer.from(JSON.stringify(manifest)+'\n');fs.writeFileSync(path.join(envelope,MANIFEST),bytes,{flag:'wx',mode:0o644});
 return {manifestSha256:sha(bytes),files:files.length};
}
export function verifyOwnArtBuildEnvelope({root,envelope,identity,expectedManifestSha256,install=false}){
 assert.match(expectedManifestSha256??'',HEX,'ART_BUILD_EXPECTED_MANIFEST_SHA');directory(envelope);
 assert.deepEqual(fs.readdirSync(envelope).sort(),[MANIFEST,'public'].sort(),'ART_BUILD_ENVELOPE_SET');
 const bytes=readStable(path.join(envelope,MANIFEST));assert.equal(sha(bytes),expectedManifestSha256,'ART_BUILD_MANIFEST_SHA');
 const manifest=JSON.parse(bytes.toString('utf8'));exact(manifest,['version','identity','files'],'ART_BUILD_MANIFEST_SHAPE');assert.equal(manifest.version,VERSION,'ART_BUILD_VERSION');
 assert.deepEqual(manifest.identity,identity,'ART_BUILD_IDENTITY');assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0,'ART_BUILD_FILES');
 const seen=new Set();for(const pin of manifest.files){exact(pin,['file','byteLength','sha256'],'ART_BUILD_FILE_SHAPE');assert.ok(canonical(pin.file),'ART_BUILD_PATH');
  assert.ok(!seen.has(pin.file),'ART_BUILD_DUPLICATE');seen.add(pin.file);assert.ok(Number.isSafeInteger(pin.byteLength)&&pin.byteLength>=0&&HEX.test(pin.sha256),'ART_BUILD_FILE_PIN');}
 const source=path.join(envelope,'public');assert.deepEqual(scan(source),manifest.files,'ART_BUILD_PUBLIC_SET_OR_BYTES');releaseIn(source,identity);
 if(install){const target=path.join(root,'public');assert.ok(!fs.existsSync(target),'ART_BUILD_TARGET_EXISTS');fs.mkdirSync(target);
  for(const pin of manifest.files){const bytes=readStable(path.join(source,...pin.file.split('/')));assert.equal(bytes.length,pin.byteLength);assert.equal(sha(bytes),pin.sha256,'ART_BUILD_INSTALL_CHANGED');
   const to=path.join(target,...pin.file.split('/'));fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{flag:'wx',mode:0o644});}
  assert.deepEqual(scan(target),manifest.files,'ART_BUILD_INSTALLED_BOOKEND');releaseIn(target,identity);
 }
 return {manifestSha256:expectedManifestSha256,files:manifest.files.length};
}
function main(){
 const mode=process.argv[2];assert.ok(['preflight','create','verify'].includes(mode)&&process.argv.length===3,'ART_BUILD_ARGS');
 const root=process.cwd(),env=process.env;assert.equal(process.platform,'linux','ART_BUILD_PILOT_PLATFORM');
 if(mode==='preflight'){assertOwnArtBuildEnvironment(env);ownArtBuildIdentity(root,env);return;}
 assert.ok(env.RUNNER_TEMP&&path.isAbsolute(env.RUNNER_TEMP),'ART_BUILD_RUNNER_TEMP');
 const envelope=path.join(env.RUNNER_TEMP,'own-art-tested-public'),identity=ownArtBuildIdentity(root,env);
 const result=mode==='create'?createOwnArtBuildEnvelope({root,envelope,identity}):verifyOwnArtBuildEnvelope({root,envelope,identity,expectedManifestSha256:env.ART_MANIFEST_SHA256,install:true});
 assert.deepEqual(ownArtBuildIdentity(root,env),identity,'ART_BUILD_CONTEXT_BOOKEND');
 if(mode==='create'){assert.ok(env.GITHUB_OUTPUT&&path.isAbsolute(env.GITHUB_OUTPUT),'ART_BUILD_OUTPUT');fs.appendFileSync(env.GITHUB_OUTPUT,'manifest-sha='+result.manifestSha256+'\n');}
 console.log(JSON.stringify({version:VERSION,mode,checkoutSha:identity.checkoutSha,prHeadSha:identity.prHeadSha,runId:identity.runId,runAttempt:identity.runAttempt,...result}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
