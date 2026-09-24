import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { verifyRelease, compareRelease, releaseLabel } from '../assets/release-status-model.js';
import { readPublishedRelease } from '../assets/release-status-panel.js';
import { resolveReleaseSource, buildReleaseIdentity, ADMIN_RELEASE_FILES, RELEASE_MARKER } from '../scripts/build-release-identity.mjs';
import { verifyRemoteBaseEvidence, RELEASE_DOMAIN } from '../scripts/verify-remote-release-base.mjs';
const identity = () => ({version:'municontrol-release.v1',commitSha:'a'.repeat(40),sourceState:'committed',adminUiSha256:'b'.repeat(64)});
test('matching source and admin build identify the loaded screen, not the database',()=>{
  const a=identity();assert.equal(compareRelease(a,a),'same');assert.equal(releaseLabel(a),'aaaaaaa');assert.ok(Object.isFrozen(verifyRelease(a)));
  assert.equal(compareRelease(a,{...a,commitSha:'c'.repeat(40)}),'different_commit');
  assert.equal(compareRelease(a,{...a,adminUiSha256:'c'.repeat(64)}),'different_artifact');
});
for(const state of ['modified','unknown'])test(state+' source never claims to match production',()=>{
  const a={...identity(),sourceState:state,commitSha:null};assert.equal(compareRelease(a,a),'unverified');
  assert.throws(()=>verifyRelease({...a,commitSha:'a'.repeat(40)}));
});
const mutations={missing:v=>delete v.commitSha,extra:v=>v.userName='PRIVATE',arrayHash:v=>v.adminUiSha256=[v.adminUiSha256],arrayCommit:v=>v.commitSha=[v.commitSha],short:v=>v.commitSha='abc',uppercase:v=>v.commitSha='A'.repeat(40),unsafe:v=>v.sourceState='production',html:v=>v.commitSha='<script>'};
for(const [name,change]of Object.entries(mutations))test('release contract rejects '+name,()=>{const v=identity();change(v);assert.throws(()=>verifyRelease(v),/RELEASE_IDENTITY_INVALID/);});
test('source resolver cross-checks CI metadata with the checked-out commit',()=>{
  assert.deepEqual(resolveReleaseSource({env:{GITHUB_SHA:'a'.repeat(40)},head:'a'.repeat(40),dirty:false}),{commitSha:'a'.repeat(40),sourceState:'committed'});
  assert.throws(()=>resolveReleaseSource({env:{GITHUB_SHA:'a'.repeat(40)},head:'b'.repeat(40),dirty:false}));
  assert.throws(()=>resolveReleaseSource({env:{GITHUB_SHA:'a'.repeat(40),VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)}}));
  assert.throws(()=>resolveReleaseSource({env:{VERCEL_ENV:'production'},dirty:true}));
});
test('modified local sources and missing Git state do not inherit a release label',()=>{
  assert.deepEqual(resolveReleaseSource({head:'a'.repeat(40),dirty:true}),{commitSha:null,sourceState:'modified'});
  assert.deepEqual(resolveReleaseSource({head:'a'.repeat(40),dirty:null}),{commitSha:null,sourceState:'unknown'});
  assert.throws(()=>resolveReleaseSource({env:{VERCEL_ENV:'production'}}));
});
test('build identity is deterministic and changes with admin source content',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mc-release-qa-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const file of ADMIN_RELEASE_FILES){const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,file.endsWith('.html')?'<head>'+RELEASE_MARKER+'</head>':'/* synthetic */\n');}
  const env={VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)},one=buildReleaseIdentity(root,root,{env}),two=buildReleaseIdentity(root,root,{env});
  assert.deepEqual(one,two);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'release-info.json'))).commitSha,'a'.repeat(40));
  assert.equal((fs.readFileSync(path.join(root,'administracion-plataforma.html'),'utf8').match(/name="municontrol-release"/g)||[]).length,1);
  fs.appendFileSync(path.join(root,'assets/release-status-panel.js'),'/* changed */');
  const three=buildReleaseIdentity(root,root,{env});assert.notEqual(one.adminUiSha256,three.adminUiSha256);
});
const response=(body=identity(),headers={})=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json','cache-control':'no-store, max-age=0',...headers}});
test('version fetch is anonymous, bounded and never sends a private API request',async()=>{
  let captured;const result=await readPublishedRelease(async(...args)=>{captured=args;return response();},new AbortController().signal);
  assert.deepEqual(result,identity());assert.equal(captured[0],'/release-info.json');assert.equal(captured[1].credentials,'omit');assert.equal(captured[1].cache,'no-store');assert.equal(captured[1].redirect,'error');
});
for(const [name,make]of [['not-json',()=>response({}, {'content-type':'text/html'})],['cacheable',()=>response(identity(),{'cache-control':'max-age=3600'})],['404',()=>new Response('',{status:404})],['bad-contract',()=>response({status:'all good'})]])test('unconfirmed '+name+' is not an updated deployment',async()=>{
  await assert.rejects(readPublishedRelease(async()=>make(),new AbortController().signal));
});
test('oversized metadata is cancelled before it can be accepted',async()=>{
  let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(4097));},cancel(){cancelled=true;}});
  await assert.rejects(readPublishedRelease(async()=>new Response(stream,{headers:{'content-type':'application/json','cache-control':'no-store'}}),new AbortController().signal),/RELEASE_READ_LIMIT/);assert.equal(cancelled,true);
});
function evidence(){const commit='a'.repeat(40),id='2UhjpQx3bXtiFTdc5ACJPQvM3EpE';return{expectedBase:commit,phase:'start',head:commit,clean:true,ancestor:true,
  branch:{name:'master',commit:{sha:commit}},status:{sha:commit,statuses:[{context:'Vercel',state:'success',target_url:'https://vercel.com/marcelos-projects-c26aa499/municipio-junin-friendly/'+id}]},
  deployment:{id:'dpl_'+id,target:'production',readyState:'READY',aliases:[RELEASE_DOMAIN]}};}
test('remote base requires GitHub commit, production alias and worktree agreement',()=>{
  assert.equal(verifyRemoteBaseEvidence(evidence()).aligned,true);const e=evidence();e.phase='publish';e.head='b'.repeat(40);assert.equal(verifyRemoteBaseEvidence(e).head,e.head);
});
const drifts={remote:e=>e.branch.commit.sha='c'.repeat(40),local:e=>e.head='d'.repeat(40),dirty:e=>e.clean=false,preview:e=>e.deployment.target='preview',failed:e=>e.deployment.readyState='ERROR',alias:e=>e.deployment.aliases=['other.vercel.app'],deployment:e=>e.deployment.id='dpl_other',status:e=>e.status.statuses[0].state='pending',spoof:e=>e.status.statuses[0].target_url='https://evil.invalid/x',diverged:e=>{e.phase='publish';e.ancestor=false;}};
for(const [name,change]of Object.entries(drifts))test('remote source gate stops '+name+' disagreement',()=>{
  const value=evidence();change(value);assert.throws(()=>verifyRemoteBaseEvidence(value),e=>e.code.startsWith('REMOTE_BASE_'));
});
test('version marker stays out of source data and service-worker caches',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.match(config.headers.find(r=>r.source==='/release-info.json').headers.find(h=>h.key==='Cache-Control').value,/no-store/);
  const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');assert.doesNotMatch(sw,/['"]\/release-info\.json['"]/);
  const script=fs.readFileSync(new URL('../assets/release-status-panel.js',import.meta.url),'utf8');
  assert.doesNotMatch(script,/\.reload\(|location\.(?:assign|replace)|localStorage|sessionStorage|\/api\//);
  const builder=fs.readFileSync(new URL('../scripts/build-release-identity.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(builder,/DATABASE_URL|connectionString|PRIVATE_KEY|AUTH_TOKEN/);
});
